/**
 * GiftClub integration routes — read-only view of imported GIFT data.
 *
 * The original GiftClub MLM project (giftclub.online) was merged into
 * Trendex as a sub-menu. All GiftClub balances, statuses, and referral
 * structure are stored in `gift_*` tables (see migration 0102_gift_club_migration.sql).
 *
 * Linking: gift_users.trendex_user_id → public.users.id (where TG chat_id matches).
 * For multi-accounts (Vitaliy has 20+), each gift_users row is a separate
 * "switchable account" linked via main_user_id.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVars }>();
app.use('/me/gift', requireAuth);
app.use('/me/gift/*', requireAuth);

// Helper: find primary gift_users row for the authenticated user.
// Returns null if user has no linked GIFT account.
async function findGiftPrimary(trendexUserId: number) {
  const rows = await db.execute(sql`
    SELECT gu.id, gu.gc_user_id, gu.telegram_chat_id, gu.telegram_username,
           gu.email, gu.name, gu.surname, gu.role, gu.depth, gu.lft, gu.rgt,
           gu.main_user_id, gu.ref_id
    FROM gift_users gu
    WHERE gu.trendex_user_id = ${trendexUserId}
    ORDER BY gu.id
    LIMIT 1
  `);
  return rows[0] as any || null;
}

// =====================================================================
// GET /me/gift/overview — summary card for cabinet
// =====================================================================
app.get('/me/gift/overview', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) {
    return c.json({ ok: true, linked: false });
  }

  // Aggregate total balance across all GIFT types
  const balRows = await db.execute(sql`
    SELECT COALESCE(SUM(balance), 0)::text AS total_micro,
           COUNT(*) AS types_with_balance
    FROM gift_balances
    WHERE user_id = ${gu.id} AND balance > 0
  `);
  const totalMicro = (balRows[0] as any)?.total_micro ?? '0';
  const typesCount = (balRows[0] as any)?.types_with_balance ?? 0;

  // Giver level
  const giverRows = await db.execute(sql`
    SELECT gl.level, gl.min_amount, gugl.progress, gugl.target
    FROM gift_user_giver_level gugl
    JOIN gift_giver_levels gl ON gl.id = gugl.giver_level_id
    WHERE gugl.user_id = ${gu.id}
    ORDER BY gl.level DESC
    LIMIT 1
  `);
  const giverLevel = giverRows[0] as any || null;

  // Leader level (latest snapshot)
  const leaderRows = await db.execute(sql`
    SELECT cll.level, cll.needs_ref, gucll.snapshot_date
    FROM gift_user_circle_leader_level gucll
    JOIN gift_circle_leader_levels cll ON cll.id = gucll.leader_level_id
    WHERE gucll.user_id = ${gu.id}
    LIMIT 1
  `);
  const leaderLevel = leaderRows[0] as any || null;

  // Multi-accounts: how many gift_users belong to same main
  const multiCountRows = await db.execute(sql`
    SELECT COUNT(*) AS n FROM gift_users
    WHERE (main_user_id = ${gu.id} OR id = ${gu.id} OR (main_user_id = ${gu.main_user_id ?? gu.id}))
      AND id != ${gu.id}
  `);
  const multiCount = Number((multiCountRows[0] as any)?.n ?? 0);

  return c.json({
    ok: true,
    linked: true,
    gift_user_id: gu.id,
    gc_user_id: Number(gu.gc_user_id),
    name: gu.name,
    role: gu.role,
    total_balance_micro: totalMicro,
    types_with_balance: Number(typesCount),
    giver_level: giverLevel ? {
      level: giverLevel.level,
      min_amount_micro: String(giverLevel.min_amount),
      progress_micro: giverLevel.progress ? String(giverLevel.progress) : null,
      target_micro: giverLevel.target ? String(giverLevel.target) : null,
    } : null,
    leader_level: leaderLevel ? {
      level: leaderLevel.level,
      needs_ref: leaderLevel.needs_ref,
      snapshot_date: leaderLevel.snapshot_date,
    } : null,
    multi_accounts: multiCount,
  });
});

// =====================================================================
// GET /me/gift/balances — all GIFT balances of current account
// =====================================================================
app.get('/me/gift/balances', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: true, balances: [] });

  const rows = await db.execute(sql`
    SELECT gb.id, gb.balance_type_id, gbt.name AS type_name, gbt.description AS type_description,
           gbt.currency, gb.balance::text AS balance_micro, gb.total::text AS total_micro,
           gb.ref_level_id, gb.week, gb.updated_at
    FROM gift_balances gb
    JOIN gift_balance_types gbt ON gbt.id = gb.balance_type_id
    WHERE gb.user_id = ${gu.id}
    ORDER BY gbt.id, gb.ref_level_id NULLS FIRST
  `);

  return c.json({
    ok: true,
    gift_user_id: gu.id,
    balances: rows.map((r: any) => ({
      id: r.id,
      type_id: r.balance_type_id,
      type_name: r.type_name,
      type_description: r.type_description,
      currency: r.currency,
      balance_micro: r.balance_micro,
      total_micro: r.total_micro,
      ref_level_id: r.ref_level_id,
      week: r.week,
      updated_at: r.updated_at,
    })),
  });
});

// =====================================================================
// GET /me/gift/statuses — Giver + Leader + Activity
// =====================================================================
app.get('/me/gift/statuses', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: true, giver: null, leader: null });

  const giverRows = await db.execute(sql`
    SELECT gl.level, gl.min_amount::text AS min_amount_micro,
           gl.absolute_income_percent, gl.week_percent,
           gl.super_pool_percent, gl.weekly_pool_percent,
           gl.for_referral_percent, gl.receive_donations_percent,
           gugl.progress::text AS progress_micro, gugl.target::text AS target_micro,
           gugl.created_at AS achieved_at
    FROM gift_user_giver_level gugl
    JOIN gift_giver_levels gl ON gl.id = gugl.giver_level_id
    WHERE gugl.user_id = ${gu.id}
    ORDER BY gl.level
  `);

  const leaderRows = await db.execute(sql`
    SELECT cll.level, cll.needs_ref, cll.depth, gucll.snapshot_date
    FROM gift_user_circle_leader_level gucll
    JOIN gift_circle_leader_levels cll ON cll.id = gucll.leader_level_id
    WHERE gucll.user_id = ${gu.id}
  `);

  return c.json({
    ok: true,
    giver_levels: giverRows.map((r: any) => ({
      level: r.level,
      min_amount_micro: r.min_amount_micro,
      absolute_income_percent: r.absolute_income_percent,
      week_percent: r.week_percent,
      super_pool_percent: r.super_pool_percent,
      weekly_pool_percent: r.weekly_pool_percent,
      for_referral_percent: r.for_referral_percent,
      receive_donations_percent: r.receive_donations_percent,
      progress_micro: r.progress_micro,
      target_micro: r.target_micro,
      achieved_at: r.achieved_at,
    })),
    leader_level: leaderRows[0] as any || null,
  });
});

// =====================================================================
// GET /me/gift/referrals?level=1..15 — referral tree (main, by lft/rgt)
// =====================================================================
app.get('/me/gift/referrals', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: true, levels: [] });

  const reqLevel = parseInt(c.req.query('level') || '1', 10);
  if (reqLevel < 1 || reqLevel > 15) return c.json({ ok: false, error: 'invalid_level' }, 400);

  const targetDepth = gu.depth + reqLevel;

  // Direct descendants at specific depth via NestedSet
  const rows = await db.execute(sql`
    SELECT id, name, telegram_username, telegram_chat_id, depth, created_at
    FROM gift_users
    WHERE lft > ${gu.lft} AND rgt < ${gu.rgt}
      AND depth = ${targetDepth}
    ORDER BY lft
    LIMIT 500
  `);

  return c.json({
    ok: true,
    level: reqLevel,
    count: rows.length,
    members: rows.map((r: any) => ({
      id: r.id, name: r.name,
      telegram_username: r.telegram_username, telegram_chat_id: r.telegram_chat_id,
      created_at: r.created_at,
    })),
  });
});

// =====================================================================
// GET /me/gift/referrals/summary — counts at each of 15 levels
// =====================================================================
app.get('/me/gift/referrals/summary', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: true, summary: [] });

  const rows = await db.execute(sql`
    SELECT depth - ${gu.depth} AS level, COUNT(*) AS n
    FROM gift_users
    WHERE lft > ${gu.lft} AND rgt < ${gu.rgt}
      AND depth BETWEEN ${gu.depth + 1} AND ${gu.depth + 15}
    GROUP BY depth
    ORDER BY depth
  `);

  return c.json({
    ok: true,
    summary: rows.map((r: any) => ({ level: Number(r.level), count: Number(r.n) })),
    total: rows.reduce((s, r: any) => s + Number(r.n), 0),
  });
});

// =====================================================================
// GET /me/gift/accounts — list of multi-accounts (Vitaliy has 20+)
// =====================================================================
app.get('/me/gift/accounts', async (c) => {
  const session = c.get('user');
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: true, accounts: [] });

  // Find the "main" — either gu itself (if main_user_id is null) or the parent
  const mainId = gu.main_user_id ?? gu.id;

  // All accounts: main + all siblings sharing same main_user_id
  const rows = await db.execute(sql`
    SELECT id, gc_user_id, name, surname, telegram_username, role,
           CASE WHEN id = ${mainId} THEN true ELSE false END AS is_main,
           CASE WHEN id = ${gu.id} THEN true ELSE false END AS is_current,
           created_at
    FROM gift_users
    WHERE id = ${mainId} OR main_user_id = ${mainId}
    ORDER BY (id = ${mainId}) DESC, id
  `);

  return c.json({
    ok: true,
    current_id: gu.id,
    main_id: mainId,
    accounts: rows.map((r: any) => ({
      id: r.id,
      gc_user_id: Number(r.gc_user_id),
      name: r.name,
      surname: r.surname,
      telegram_username: r.telegram_username,
      role: r.role,
      is_main: r.is_main,
      is_current: r.is_current,
      created_at: r.created_at,
    })),
  });
});

// =====================================================================
// POST /me/gift/switch-account — switch active account (cookie/state)
// (Implementation: client-side session attribute; server validates ownership)
// =====================================================================
app.post('/me/gift/switch-account', async (c) => {
  const session = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const targetId = parseInt(body.account_id, 10);
  if (!targetId) return c.json({ ok: false, error: 'account_id_required' }, 400);

  // Verify target belongs to user
  const gu = await findGiftPrimary(session.id);
  if (!gu) return c.json({ ok: false, error: 'no_gift_account' }, 403);
  const mainId = gu.main_user_id ?? gu.id;

  const targetRows = await db.execute(sql`
    SELECT id FROM gift_users WHERE id = ${targetId} AND (id = ${mainId} OR main_user_id = ${mainId})
  `);
  if (!targetRows[0]) return c.json({ ok: false, error: 'account_not_yours' }, 403);

  // Implementation note: Cabinet will store target gift_user_id in session/cookie
  // and pass it as ?gift_account_id=X to subsequent /me/gift/* calls.
  return c.json({ ok: true, switched_to: targetId });
});

export default app;
