import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { getBonusMatrixTree, getBonusMatrixStats, getUpline, placeBonusSeat, backfillBonusMatrix } from '../services/bonus-matrix.js';

const app = new Hono();

app.use('/internal/bonus-matrix/*', requireInternalSecret);

app.post('/internal/bonus-matrix/me', async (c) => {
  const body = await c.req.json().catch(() => ({} as any));
  let userId: number | undefined = body?.user_id ? Number(body.user_id) : undefined;
  const email = body?.email ? String(body.email) : undefined;
  if (!userId && email) {
    const r = (await db.execute(sql`
      SELECT user_id FROM credentials WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `)) as unknown as Array<{ user_id: number }>;
    userId = r[0]?.user_id ? Number(r[0].user_id) : undefined;
  }
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  // Place if not yet placed (lazy)
  await placeBonusSeat(userId).catch(() => {});

  const stats = await getBonusMatrixStats(userId);
  if (!stats) return c.json({ ok: false, error: 'not_in_matrix' }, 404);
  return c.json({ ok: true, ...stats });
});

app.get('/internal/bonus-matrix/tree', async (c) => {
  // Accept user_id, focus_user_id (alias), or email. focus_user_id lets you view someone else's subtree.
  const userIdRaw = c.req.query('focus_user_id') || c.req.query('user_id');
  const email = c.req.query('email');
  const depth = Math.min(Math.max(parseInt(c.req.query('depth') || '4', 10), 1), 6);
  let userId: number | undefined = userIdRaw ? Number(userIdRaw) : undefined;
  if (!userId && email) {
    const r = (await db.execute(sql`
      SELECT user_id FROM credentials WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `)) as unknown as Array<{ user_id: number }>;
    userId = r[0]?.user_id ? Number(r[0].user_id) : undefined;
  }
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  const tree = await getBonusMatrixTree(userId, depth);
  if (!tree) return c.json({ ok: false, error: 'not_in_matrix' }, 404);
  return c.json({ ok: true, tree, depth });
});

app.get('/internal/bonus-matrix/global', async (c) => {
  // Global feed — last N placements + total count for live "real-time" view.
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const recent = (await db.execute(sql`
    SELECT bm.position, bm.user_id, bm.parent_position, bm.joined_at,
           u.tg_username, u.first_name
    FROM bonus_matrix_positions bm
    LEFT JOIN users u ON u.id = bm.user_id
    ORDER BY bm.joined_at DESC LIMIT ${limit}
  `)) as unknown as Array<any>;
  const totalRow = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM bonus_matrix_positions`)) as unknown as Array<{ n: number }>;
  return c.json({
    ok: true,
    total: Number(totalRow[0]?.n ?? 0),
    recent: recent.map(r => ({
      position: Number(r.position),
      user_id: Number(r.user_id),
      parent_position: r.parent_position != null ? Number(r.parent_position) : null,
      joined_at: r.joined_at,
      tg_username: r.tg_username,
      first_name: r.first_name,
    })),
  });
});

app.post('/internal/bonus-matrix/backfill', async (c) => {
  const r = await backfillBonusMatrix();
  return c.json({ ok: true, ...r });
});


app.post('/internal/bonus-matrix/sync-and-rebackfill', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const updates = Array.isArray(body?.updates) ? body.updates : [];

  let invitedSynced = 0;
  for (const u of updates) {
    const userTg = u.user_tg ? Number(u.user_tg) : null;
    const sponsorTg = u.sponsor_tg ? Number(u.sponsor_tg) : null;
    if (!userTg || !sponsorTg) continue;
    try {
      const r = (await db.execute(sql`
        UPDATE users SET invited_by_user_id = (SELECT id FROM users WHERE tg_id = ${sponsorTg} LIMIT 1)
        WHERE tg_id = ${userTg}
          AND invited_by_user_id IS DISTINCT FROM (SELECT id FROM users WHERE tg_id = ${sponsorTg} LIMIT 1)
        RETURNING id
      `)) as unknown as Array<{ id: number }>;
      invitedSynced += r.length;
    } catch (_) {}
  }

  // Truncate bonus matrix
  await db.execute(sql`TRUNCATE TABLE bonus_matrix_positions RESTART IDENTITY`);

  // Re-backfill in joined_at order
  const r = await backfillBonusMatrix();
  return c.json({ ok: true, invited_synced: invitedSynced, ...r });
});



app.get('/internal/bonus-matrix/upline', async (c) => {
  const userIdRaw = c.req.query('user_id');
  const email = c.req.query('email');
  const height = Math.min(Math.max(parseInt(c.req.query('height') || '10', 10), 1), 30);
  let userId: number | undefined = userIdRaw ? Number(userIdRaw) : undefined;
  if (!userId && email) {
    const r = (await db.execute(sql`
      SELECT user_id FROM credentials WHERE LOWER(email) = LOWER(${email}) LIMIT 1
    `)) as unknown as Array<{ user_id: number }>;
    userId = r[0]?.user_id ? Number(r[0].user_id) : undefined;
  }
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const chain = await getUpline(userId, height);
  return c.json({ ok: true, chain });
});


export default app;
