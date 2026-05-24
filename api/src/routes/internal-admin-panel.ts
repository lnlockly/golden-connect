/**
 * Internal admin API — read-only aggregates for admin panel.
 *
 * GET /internal/admin/dashboard       — KPIs (total users, by tariff, ledger sum, etc.)
 * GET /internal/admin/users           — paginated user list with search
 * GET /internal/admin/users/:id       — full user profile + balance + history
 * GET /internal/admin/tariffs         — tariffs + counts of users on each
 * GET /internal/admin/cash-ledger     — recent ledger entries (filterable)
 * GET /internal/admin/matrix          — bonus matrix structure
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';

const app = new Hono();
app.use('/internal/admin/*', requireInternalSecret);

app.get('/internal/admin/dashboard', async (c) => {
  try {
    const u = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE active_tariff_code = 'free')::int AS free_count,
        COUNT(*) FILTER (WHERE active_tariff_code = 'launch')::int AS launch_count,
        COUNT(*) FILTER (WHERE active_tariff_code = 'boost')::int AS boost_count,
        COUNT(*) FILTER (WHERE active_tariff_code = 'rocket')::int AS rocket_count,
        COUNT(*) FILTER (WHERE joined_at > NOW() - INTERVAL '24 hours')::int AS today_count,
        COUNT(*) FILTER (WHERE joined_at > NOW() - INTERVAL '7 days')::int AS week_count
      FROM users
    `)) as any[];

    const ledger = (await db.execute(sql`
      SELECT
        COALESCE(SUM(amount_micro) FILTER (WHERE amount_micro > 0), 0)::bigint AS total_in,
        COALESCE(SUM(amount_micro) FILTER (WHERE amount_micro < 0), 0)::bigint AS total_out,
        COUNT(*)::int AS rows
      FROM cash_ledger
    `)) as any[];

    const wallets = (await db.execute(sql`
      SELECT
        COALESCE(SUM(gift_balance_micro), 0)::bigint AS gift_total,
        COALESCE(SUM(subscription_balance_micro), 0)::bigint AS sub_total,
        COALESCE(SUM(karma_points), 0)::bigint AS karma_total
      FROM users
    `)) as any[];

    const matrix = (await db.execute(sql`SELECT COUNT(*)::int AS placed FROM bonus_matrix_positions`)) as any[];

    return c.json({
      ok: true,
      users: u[0],
      ledger: {
        total_in_usd: Number(BigInt(ledger[0].total_in) / 10000n) / 100,
        total_out_usd: Number(BigInt(ledger[0].total_out) / 10000n) / 100,
        net_usd: Number((BigInt(ledger[0].total_in) + BigInt(ledger[0].total_out)) / 10000n) / 100,
        rows: ledger[0].rows,
      },
      wallets: {
        gift_total_usd: Number(BigInt(wallets[0].gift_total) / 10000n) / 100,
        sub_total_usd: Number(BigInt(wallets[0].sub_total) / 10000n) / 100,
        karma_total: Number(wallets[0].karma_total),
      },
      matrix: { placed: matrix[0].placed },
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

app.get('/internal/admin/users', async (c) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 50)));
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
    const search = String(c.req.query('search') ?? '').trim().toLowerCase();

    const where = search
      ? sql`WHERE LOWER(u.tg_username) LIKE ${'%' + search + '%'} OR LOWER(u.first_name) LIKE ${'%' + search + '%'} OR LOWER(u.username) LIKE ${'%' + search + '%'} OR CAST(u.tg_id AS TEXT) LIKE ${'%' + search + '%'} OR CAST(u.id AS TEXT) = ${search} OR LOWER(c.email) LIKE ${'%' + search + '%'}`
      : sql``;

    const rows = (await db.execute(sql`
      SELECT u.id, u.username, u.tg_id, u.tg_username, u.first_name, u.last_name,
             u.active_tariff_code, u.tariff_expires_at,
             u.gift_balance_micro::bigint AS gift,
             u.subscription_balance_micro::bigint AS sub,
             u.karma_points,
             u.joined_at, u.partner_status, u.qualified_refs_l1,
             c.email
      FROM users u
      LEFT JOIN credentials c ON c.user_id = u.id
      ${where}
      ORDER BY u.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `)) as any[];

    const total = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM users u LEFT JOIN credentials c ON c.user_id = u.id ${where}`)) as any[];

    return c.json({
      ok: true,
      total: total[0].n,
      limit, offset, search,
      users: rows.map((r: any) => ({
        id: Number(r.id),
        username: r.username,
        tg_id: r.tg_id ? Number(r.tg_id) : null,
        tg_username: r.tg_username,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email,
        active_tariff_code: r.active_tariff_code,
        tariff_expires_at: r.tariff_expires_at,
        gift_usd: Number(BigInt(r.gift) / 10000n) / 100,
        sub_usd: Number(BigInt(r.sub) / 10000n) / 100,
        karma: Number(r.karma_points || 0),
        joined_at: r.joined_at,
        partner_status: r.partner_status,
        qualified_refs_l1: r.qualified_refs_l1,
      })),
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

app.get('/internal/admin/users/:id', async (c) => {
  try {
    const id = Number(c.req.param('id'));
    if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);

    const u = (await db.execute(sql`
      SELECT u.*, c.email
      FROM users u LEFT JOIN credentials c ON c.user_id = u.id
      WHERE u.id = ${id}
    `)) as any[];
    if (!u[0]) return c.json({ ok: false, error: 'not_found' }, 404);

    const ledger = (await db.execute(sql`
      SELECT id, kind, amount_micro::bigint, memo, created_at
      FROM cash_ledger WHERE user_id = ${id}
      ORDER BY id DESC LIMIT 50
    `)) as any[];

    const seats = (await db.execute(sql`
      SELECT bs.id, bs.tariff_id, bs.seat_index, bs.monthly_fee_paid_until, t.code AS tariff_code
      FROM business_seats bs LEFT JOIN tariffs t ON t.id = bs.tariff_id
      WHERE bs.user_id = ${id}
      ORDER BY bs.id
    `)) as any[];

    const refs = (await db.execute(sql`
      SELECT COUNT(*)::int AS l1_count
      FROM referrals WHERE referrer_id = ${id}
    `)) as any[];

    return c.json({
      ok: true,
      user: {
        ...u[0],
        gift_balance_usd: Number(BigInt(u[0].gift_balance_micro || 0) / 10000n) / 100,
        sub_balance_usd: Number(BigInt(u[0].subscription_balance_micro || 0) / 10000n) / 100,
      },
      ledger: ledger.map((r: any) => ({
        id: Number(r.id), kind: r.kind,
        amount_usd: Number(BigInt(r.amount_micro) / 10000n) / 100,
        memo: r.memo, created_at: r.created_at,
      })),
      seats,
      refs_l1: refs[0].l1_count,
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

app.get('/internal/admin/tariffs', async (c) => {
  try {
    const t = (await db.execute(sql`
      SELECT t.id, t.code, t.name, t.entry_micro, t.monthly_fee_micro,
             t.business_seats_count, t.matrix_depth, t.matrix_rate_micro,
             t.has_matching_bonus, t.daily_cap_micro, t.is_active,
             COUNT(u.id)::int AS users_count
      FROM tariffs t
      LEFT JOIN users u ON LOWER(u.active_tariff_code) = LOWER(t.code)
      GROUP BY t.id ORDER BY t.sort_order
    `)) as any[];

    return c.json({
      ok: true,
      tariffs: t.map((r: any) => ({
        id: Number(r.id), code: r.code, name: r.name,
        entry_usd: Number(r.entry_micro) / 1e6,
        monthly_usd: Number(r.monthly_fee_micro) / 1e6,
        seats: r.business_seats_count, depth: r.matrix_depth,
        rate_usd: Number(r.matrix_rate_micro) / 1e6,
        matching_bonus: r.has_matching_bonus,
        daily_cap_usd: Number(r.daily_cap_micro) / 1e6,
        is_active: r.is_active,
        users_count: r.users_count,
      })),
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

app.get('/internal/admin/cash-ledger', async (c) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 100)));
    const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
    const kind = String(c.req.query('kind') ?? '').trim();
    const userId = Number(c.req.query('user_id') ?? 0);

    let where = sql``;
    if (kind && userId > 0) where = sql`WHERE l.kind = ${kind} AND l.user_id = ${userId}`;
    else if (kind) where = sql`WHERE l.kind = ${kind}`;
    else if (userId > 0) where = sql`WHERE l.user_id = ${userId}`;

    const rows = (await db.execute(sql`
      SELECT l.id, l.user_id, l.kind, l.amount_micro::bigint, l.memo, l.created_at,
             u.username, u.tg_username
      FROM cash_ledger l
      LEFT JOIN users u ON u.id = l.user_id
      ${where}
      ORDER BY l.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `)) as any[];

    return c.json({
      ok: true,
      rows: rows.map((r: any) => ({
        id: Number(r.id),
        user_id: Number(r.user_id),
        username: r.username,
        tg_username: r.tg_username,
        kind: r.kind,
        amount_usd: Number(BigInt(r.amount_micro) / 10000n) / 100,
        memo: r.memo,
        created_at: r.created_at,
      })),
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

app.get('/internal/admin/matrix', async (c) => {
  try {
    const rows = (await db.execute(sql`
      SELECT bm.position, bm.user_id, bm.parent_position, bm.joined_at,
             u.username, u.tg_username, u.first_name
      FROM bonus_matrix_positions bm
      LEFT JOIN users u ON u.id = bm.user_id
      ORDER BY bm.position
      LIMIT 500
    `)) as any[];
    return c.json({ ok: true, positions: rows.length, rows });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

export default app;
