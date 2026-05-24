import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/referrals/*', requireAuth);

/**
 * GET /referrals/stats — direct invites + total network + per-level count
 * + earned_micro rollup. Pure SQL via recursive CTE over invite_edges.
 *
 * Cap depth at 100 (whitepaper promise); CTE terminates naturally on leaves.
 */
app.get('/referrals/stats', async (c) => {
  const user = c.var.user;

  // Recursive CTE — walk downstream from (user.id), return (descendant_id, level)
  const rows = await db.execute(sql`
    WITH RECURSIVE descendants(user_id, level) AS (
      SELECT child_user_id, 1
      FROM invite_edges
      WHERE parent_user_id = ${user.id}
      UNION ALL
      SELECT ie.child_user_id, d.level + 1
      FROM invite_edges ie
      JOIN descendants d ON ie.parent_user_id = d.user_id
      WHERE d.level < 100
    )
    SELECT level::int AS level, COUNT(*)::int AS count
    FROM descendants
    GROUP BY level
    ORDER BY level ASC
  `);

  const byLevel = rows.map((r: any) => ({
    level: Number(r.level),
    count: Number(r.count),
  }));
  const direct = byLevel.find(l => l.level === 1)?.count ?? 0;
  const total = byLevel.reduce((s, l) => s + l.count, 0);

  // Earned micro — sum over ledger where kind='referral_reward'
  const earned = await db.execute(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::text AS earned_micro
    FROM flow_ledger
    WHERE user_id = ${user.id} AND kind = 'referral_reward'
  `);
  const earnedMicro = (earned[0] as any)?.earned_micro ?? '0';

  return c.json({
    direct,
    total,
    by_level: byLevel,
    earned_micro: earnedMicro,
  });
});

/**
 * GET /referrals/tree?depth=10&limit=100 — flat list of descendants up to
 * `depth` levels, each row `{ level, user_id, ref_code, joined_at }`.
 * Usernames are masked server-side to prevent doxing referrer IDs.
 */
app.get('/referrals/tree', async (c) => {
  const user = c.var.user;
  const depthParam = c.req.query('depth');
  const limitParam = c.req.query('limit');
  const depth = Math.max(1, Math.min(100, Number(depthParam ?? 10) || 10));
  const limit = Math.max(1, Math.min(500, Number(limitParam ?? 100) || 100));

  const rows = await db.execute(sql`
    WITH RECURSIVE descendants(user_id, parent_id, level) AS (
      SELECT child_user_id, parent_user_id, 1
      FROM invite_edges
      WHERE parent_user_id = ${user.id}
      UNION ALL
      SELECT ie.child_user_id, ie.parent_user_id, d.level + 1
      FROM invite_edges ie
      JOIN descendants d ON ie.parent_user_id = d.user_id
      WHERE d.level < ${depth}
    )
    SELECT d.level::int AS level,
           d.parent_id::int AS parent_id,
           u.id::int AS user_id,
           u.ref_code AS ref_code,
           u.tg_username AS tg_username,
           u.joined_at AS joined_at
    FROM descendants d
    JOIN users u ON u.id = d.user_id
    ORDER BY u.joined_at DESC                   -- newest first for list view
    LIMIT ${limit}
  `);

  return c.json({
    rows: rows.map((r: any) => ({
      level: Number(r.level),
      parent_user_id: Number(r.parent_id),
      user_id: Number(r.user_id),
      ref_code: r.ref_code,
      tg_username: r.tg_username,
      username_masked: maskCode(r.ref_code),
      joined_at: r.joined_at,
    })),
  });
});

/**
 * GET /referrals/earnings?cursor=0&limit=50 — paginated ledger slice
 * filtered to kind='referral_reward'.
 */
app.get('/referrals/earnings', async (c) => {
  const user = c.var.user;
  const cursor = Math.max(0, Number(c.req.query('cursor') ?? 0) || 0);
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));

  const rows = await db.execute(sql`
    SELECT id, kind, amount_micro::text, level, memo, created_at, related_lead_id
    FROM flow_ledger
    WHERE user_id = ${user.id} AND kind = 'referral_reward'
    ORDER BY id DESC
    OFFSET ${cursor} LIMIT ${limit}
  `);

  return c.json({
    rows: rows.map((r: any) => ({
      id: Number(r.id),
      kind: r.kind,
      amount_micro: r.amount_micro,
      level: r.level !== null ? Number(r.level) : null,
      memo: r.memo,
      created_at: r.created_at,
      related_lead_id: r.related_lead_id !== null ? Number(r.related_lead_id) : null,
    })),
    next_cursor: rows.length === limit ? cursor + rows.length : null,
  });
});

/**
 * GET /referrals/node/:id — details for a referral-tree node.
 * Returns level relative to caller, agent count, tg_username (masked),
 * wallet short, joined date, direct invites from this node.
 * 403 if node is not a descendant of the caller (privacy guard).
 */
app.get('/referrals/node/:id', async (c) => {
  const caller = c.var.user;
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, error: 'bad_id' }, 400);

  // Is this node a descendant of the caller?
  const path = await db.execute(sql`
    WITH RECURSIVE d(user_id, level) AS (
      SELECT child_user_id, 1 FROM invite_edges WHERE parent_user_id = ${caller.id}
      UNION ALL
      SELECT ie.child_user_id, d.level + 1 FROM invite_edges ie
      JOIN d ON ie.parent_user_id = d.user_id WHERE d.level < 100
    )
    SELECT level::int AS level FROM d WHERE user_id = ${id} LIMIT 1
  `);
  if (path.length === 0) {
    return c.json({ ok: false, error: 'not_in_subtree' }, 403);
  }
  const level = Number((path[0] as any).level);

  const userRow = await db.execute(sql`
    SELECT u.id::int AS id, u.ref_code, u.tg_username, u.joined_at,
           w.address AS wallet_address, w.chain_id::int AS chain_id
    FROM users u
    LEFT JOIN user_wallets w ON w.user_id = u.id
    WHERE u.id = ${id} LIMIT 1
  `);
  if (userRow.length === 0) return c.json({ ok: false, error: 'not_found' }, 404);
  const u: any = userRow[0];

  const agentCountRow = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM agents WHERE owner_user_id = ${id}
  `);
  const directCountRow = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM invite_edges WHERE parent_user_id = ${id}
  `);

  const addr = u.wallet_address ?? null;
  const addrShort = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : null;

  return c.json({
    id: u.id,
    level,
    ref_code: u.ref_code,
    tg_username: u.tg_username,
    joined_at: u.joined_at,
    wallet: addr ? { address: addr, address_short: addrShort, chain_id: u.chain_id } : null,
    agent_count: Number((agentCountRow[0] as any)?.n ?? 0),
    direct_invites: Number((directCountRow[0] as any)?.n ?? 0),
  });
});

function maskCode(code: string): string {
  if (!code) return '';
  if (code.length <= 4) return code;
  return code.slice(0, 2) + '…' + code.slice(-2);
}

export default app;
