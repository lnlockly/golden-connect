/**
 * Internal GiftClub bridge — called from trendex-cabinet web-routes.js
 *
 * Auth: x-trendex-secret header (INTERNAL_API_SECRET env)
 * Identification: email (canonical bridge from cabinet sessions).
 *
 * Endpoints:
 *   GET /internal/gift/overview?email=X
 *   GET /internal/gift/balances?email=X
 *   GET /internal/gift/statuses?email=X
 *   GET /internal/gift/referrals/summary?email=X
 *   GET /internal/gift/referrals?email=X&level=N
 *   GET /internal/gift/accounts?email=X
 *   POST /internal/gift/switch-account { email, account_id }
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { env } from '../services/env.js';

const app = new Hono();

// GIFT CLUB 2-balance model.
const BAL_CURRENT = 5;            // GIFT Текущий — вывод + перевод
const BAL_MAIN = 6;               // GIFT Основной — пополнение с кошелька + покупка статусов
const GIFT_MICRO_PER_USDT = 100_000_000n;   // gift_balances scale (1e8)
const WORKING_MICRO_PER_USDT = 1_000_000n;  // Trendex cash_ledger scale (1e6)
const MIN_WITHDRAW_USDT = 10;

// 4 статуса Дарителя (5-й не запущен). pool_percent = «% на всех» (super pool).
const GIVER_TIERS = [
  { tier: 1, entry_usdt: 5,   pool_percent: 10 },
  { tier: 2, entry_usdt: 20,  pool_percent: 30 },
  { tier: 3, entry_usdt: 25,  pool_percent: 10 },
  { tier: 4, entry_usdt: 100, pool_percent: 50 },
];
// Ремап старых 11 уровней → новые 4 статуса: 1-8→Д1, 9→Д2, 10→Д3, 11→Д4.
function oldLevelToTier(level: number): number {
  if (level >= 11) return 4;
  if (level === 10) return 3;
  if (level === 9) return 2;
  if (level >= 1) return 1;
  return 0;
}

// USDT (число) → bigint micro в нужном масштабе, без float-погрешности.
function usdtToMicro(amountUsdt: number, perUsdt: bigint): bigint {
  if (!Number.isFinite(amountUsdt) || amountUsdt <= 0) throw new Error('bad_amount');
  // округляем до 1e-6 USDT и масштабируем
  const micro6 = BigInt(Math.round(amountUsdt * 1_000_000));
  return (micro6 * perUsdt) / 1_000_000n;
}

// Bearer-like middleware: x-trendex-secret
app.use('/internal/gift/*', async (c, next) => {
  const secret = c.req.header('x-trendex-secret');
  if (!secret || secret !== env.internalSecret) {
    return c.json({ ok: false, error: 'unauthorized' }, 401);
  }
  await next();
});

// Helper: find a GIFT account for either tg_id or email.
// Trendex public.users has NO email column — emails live in cabinet SQLite,
// passed here as a hint. Match strategy:
//   1) tg_id (preferred) → gift_users.telegram_chat_id (string) OR public.users.tg_id → trendex_user_id
//   2) Synthetic email "tg{N}@trendex.bot" → extract N → as tg_id
//   3) Real email → gift_users.email directly (some GIFT users registered with email)
function extractTgIdFromSyntheticEmail(email: string | null): number | null {
  if (!email) return null;
  const m = email.match(/^tg(\d+)@trendex\.bot$/);
  return m ? Number(m[1]) : null;
}

async function findPrimaryGift(email: string | null, tgId: number | null) {
  // Auto-extract tg_id from synthetic email if needed
  if (!tgId) tgId = extractTgIdFromSyntheticEmail(email);
  if (tgId) {
    const rows = await db.execute(sql`
      SELECT gu.id, gu.gc_user_id, gu.telegram_chat_id, gu.telegram_username,
             gu.email, gu.name, gu.surname, gu.role, gu.depth, gu.lft, gu.rgt,
             gu.main_user_id, gu.ref_id, gu.trendex_user_id
      FROM gift_users gu
      WHERE gu.telegram_chat_id = ${String(tgId)}
      ORDER BY (gu.main_user_id IS NULL) DESC, gu.id
      LIMIT 1
    `);
    if (rows[0]) return rows[0] as any;
  }
  if (email && !email.endsWith('@trendex.bot')) {
    const rows = await db.execute(sql`
      SELECT gu.id, gu.gc_user_id, gu.telegram_chat_id, gu.telegram_username,
             gu.email, gu.name, gu.surname, gu.role, gu.depth, gu.lft, gu.rgt,
             gu.main_user_id, gu.ref_id, gu.trendex_user_id
      FROM gift_users gu
      WHERE gu.email = ${email}
      ORDER BY gu.id
      LIMIT 1
    `);
    if (rows[0]) return rows[0] as any;
  }
  // Post-unification fallback: every gift_user is linked to a trendex user
  // (trendex_user_id). Resolve via users.tg_id → gift_users.trendex_user_id —
  // authoritative even when telegram_chat_id formatting differs.
  if (tgId) {
    const rows = await db.execute(sql`
      SELECT gu.id, gu.gc_user_id, gu.telegram_chat_id, gu.telegram_username,
             gu.email, gu.name, gu.surname, gu.role, gu.depth, gu.lft, gu.rgt,
             gu.main_user_id, gu.ref_id, gu.trendex_user_id
      FROM gift_users gu
      JOIN users u ON u.id = gu.trendex_user_id
      WHERE u.tg_id = ${tgId} AND gu.main_user_id IS NULL
      ORDER BY gu.id
      LIMIT 1
    `);
    if (rows[0]) return rows[0] as any;
  }
  return null;
}
// Backwards-compat shim — old callsites use this name
async function findPrimaryGiftByEmail(email: string) { return findPrimaryGift(email, null); }

// Note: findGiftByAccountId removed — multi-account override now handled directly in resolveAccount() above.

async function resolveAccount(c: any) {
  const email = c.req.query('email') || null;
  const tgIdStr = c.req.query('tg_id');
  const tgId = tgIdStr ? Number(tgIdStr) : null;
  if (!email && !tgId) return { error: 'email_or_tg_id_required', status: 400 };
  const accountId = c.req.query('account_id') ? parseInt(c.req.query('account_id') || '0', 10) : null;
  const primary = await findPrimaryGift(email, tgId);
  if (!primary) return { error: 'not_linked', status: 404 };
  if (!accountId) return { gu: primary };
  // Override: specific multi-account
  const mainId = primary.main_user_id ?? primary.id;
  const rows = await db.execute(sql`
    SELECT gu.id, gu.gc_user_id, gu.telegram_chat_id, gu.telegram_username,
           gu.email, gu.name, gu.surname, gu.role, gu.depth, gu.lft, gu.rgt,
           gu.main_user_id, gu.ref_id, gu.trendex_user_id
    FROM gift_users gu
    WHERE gu.id = ${accountId} AND (gu.id = ${mainId} OR gu.main_user_id = ${mainId})
    LIMIT 1
  `);
  if (!rows[0]) return { error: 'account_not_yours', status: 403 };
  return { gu: rows[0] as any };
}

// ============= /internal/gift/overview =============
app.get('/internal/gift/overview', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, linked: false });
  const gu = r.gu;

  const balRows = await db.execute(sql`
    SELECT COALESCE(SUM(balance), 0)::text AS total_micro,
           COUNT(*) AS types_with_balance
    FROM gift_balances WHERE user_id = ${gu.id} AND balance > 0
  `);
  const giverRows = await db.execute(sql`
    SELECT gl.level, gl.min_amount::text AS min_amount, gugl.progress::text AS progress, gugl.target::text AS target
    FROM gift_user_giver_level gugl
    JOIN gift_giver_levels gl ON gl.id = gugl.giver_level_id
    WHERE gugl.user_id = ${gu.id}
    ORDER BY gl.level DESC LIMIT 1
  `);
  const leaderRows = await db.execute(sql`
    SELECT cll.level, cll.needs_ref, gucll.snapshot_date
    FROM gift_user_circle_leader_level gucll
    JOIN gift_circle_leader_levels cll ON cll.id = gucll.leader_level_id
    WHERE gucll.user_id = ${gu.id} LIMIT 1
  `);
  const mainId = gu.main_user_id ?? gu.id;
  const multiRows = await db.execute(sql`
    SELECT COUNT(*) AS n FROM gift_users
    WHERE (id = ${mainId} OR main_user_id = ${mainId}) AND id != ${gu.id}
  `);

  const giver = giverRows[0] as any;
  const leader = leaderRows[0] as any;

  return c.json({
    ok: true, linked: true,
    gift_user_id: gu.id, gc_user_id: Number(gu.gc_user_id),
    name: gu.name, role: gu.role,
    total_balance_micro: (balRows[0] as any)?.total_micro || '0',
    types_with_balance: Number((balRows[0] as any)?.types_with_balance || 0),
    giver_level: giver ? {
      level: giver.level, min_amount_micro: giver.min_amount,
      progress_micro: giver.progress, target_micro: giver.target,
    } : null,
    leader_level: leader ? { level: leader.level, needs_ref: leader.needs_ref, snapshot_date: leader.snapshot_date } : null,
    multi_accounts: Number((multiRows[0] as any)?.n || 0),
  });
});

// ============= /internal/gift/balances =============
app.get('/internal/gift/balances', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, balances: [] });
  const gu = r.gu;
  const rows = await db.execute(sql`
    SELECT gb.id, gb.balance_type_id, gbt.name AS type_name, gbt.description AS type_description,
           gbt.currency, gb.balance::text AS balance_micro, gb.total::text AS total_micro,
           gb.ref_level_id, gb.week, gb.updated_at
    FROM gift_balances gb JOIN gift_balance_types gbt ON gbt.id = gb.balance_type_id
    WHERE gb.user_id = ${gu.id}
    ORDER BY gbt.id, gb.ref_level_id NULLS FIRST
  `);
  // Two-balance summary for GIFT CLUB UI: Основной (тип 6) + Текущий (тип 5).
  const twoRows = await db.execute(sql`
    SELECT
      COALESCE(SUM(balance) FILTER (WHERE balance_type_id = ${BAL_MAIN}), 0)::text    AS main_micro,
      COALESCE(SUM(balance) FILTER (WHERE balance_type_id = ${BAL_CURRENT}), 0)::text AS current_micro
    FROM gift_balances WHERE user_id = ${gu.id}
  `);
  const two = {
    main_micro: (twoRows[0] as any)?.main_micro || '0',
    current_micro: (twoRows[0] as any)?.current_micro || '0',
  };
  return c.json({ ok: true, gift_user_id: gu.id, linked_trendex: gu.trendex_user_id != null, two, balances: rows });
});

// Канонической строки баланса (после консолидации 0107 — одна на (user,type)).
// Создаём, если ещё нет. Возвращает id строки gift_balances.
async function ensureGiftBalanceRow(tx: any, userId: number, typeId: number): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT id FROM gift_balances WHERE user_id = ${userId} AND balance_type_id = ${typeId}
    ORDER BY id LIMIT 1
  `);
  if (rows[0]) return Number((rows[0] as any).id);
  const ins = await tx.execute(sql`
    INSERT INTO gift_balances (user_id, balance_type_id, balance, total, created_at, updated_at)
    VALUES (${userId}, ${typeId}, 0, 0, NOW(), NOW()) RETURNING id
  `);
  return Number((ins[0] as any).id);
}

// ============= POST /internal/gift/topup =============
// Пополнение GIFT Основной (тип 6) с Trendex working баланса 1:1, мгновенно.
app.post('/internal/gift/topup', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: false, reason: r.error }, (r.status || 400) as any);
  const gu = r.gu;
  const trendexUserId = gu.trendex_user_id != null ? Number(gu.trendex_user_id) : null;
  if (!trendexUserId) return c.json({ ok: false, reason: 'not_linked_to_trendex' }, 400);
  const body = await c.req.json().catch(() => ({}));
  const amountUsdt = Number(body.amount_usdt);
  let workingMicro: bigint, giftMicro: bigint;
  try {
    workingMicro = usdtToMicro(amountUsdt, WORKING_MICRO_PER_USDT);
    giftMicro = usdtToMicro(amountUsdt, GIFT_MICRO_PER_USDT);
  } catch { return c.json({ ok: false, reason: 'bad_amount' }, 400); }

  try {
    await db.transaction(async (tx) => {
      // lock core user, verify working balance
      const lock = await tx.execute(sql`SELECT id FROM users WHERE id = ${trendexUserId} FOR UPDATE`);
      if (!lock[0]) throw new Error('trendex_user_not_found');
      const wr = await tx.execute(sql`
        SELECT COALESCE(SUM(amount_micro), 0)::bigint AS work FROM cash_ledger WHERE user_id = ${trendexUserId}
      `);
      const workBal = BigInt((wr[0] as any)?.work ?? 0);
      if (workBal < workingMicro) throw new Error('insufficient_working');
      // debit working
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
        VALUES (${trendexUserId}, ${'gift_main_topup'}, ${-Number(workingMicro)}, ${'GIFT Основной пополнение'})
      `);
      // credit GIFT Основной (balance + total)
      const rowId = await ensureGiftBalanceRow(tx, gu.id, BAL_MAIN);
      await tx.execute(sql`
        UPDATE gift_balances SET balance = balance + ${Number(giftMicro)}, total = total + ${Number(giftMicro)}, updated_at = NOW()
        WHERE id = ${rowId}
      `);
      await tx.execute(sql`
        INSERT INTO gift_money_log (gift_user_id, trendex_user_id, kind, to_type, amount_micro, ref)
        VALUES (${gu.id}, ${trendexUserId}, ${'topup'}, ${BAL_MAIN}, ${Number(giftMicro)}, ${'working->main'})
      `);
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'topup_failed' }, 400);
  }
  return c.json({ ok: true });
});

// ============= POST /internal/gift/transfer =============
// Перевод между GIFT Основной (6) и Текущий (5). direction: to_current | to_main.
app.post('/internal/gift/transfer', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: false, reason: r.error }, (r.status || 400) as any);
  const gu = r.gu;
  const body = await c.req.json().catch(() => ({}));
  const direction = String(body.direction || '');
  if (direction !== 'to_current' && direction !== 'to_main') {
    return c.json({ ok: false, reason: 'bad_direction' }, 400);
  }
  const fromType = direction === 'to_current' ? BAL_MAIN : BAL_CURRENT;
  const toType = direction === 'to_current' ? BAL_CURRENT : BAL_MAIN;
  let giftMicro: bigint;
  try { giftMicro = usdtToMicro(Number(body.amount_usdt), GIFT_MICRO_PER_USDT); }
  catch { return c.json({ ok: false, reason: 'bad_amount' }, 400); }

  try {
    await db.transaction(async (tx) => {
      const fromId = await ensureGiftBalanceRow(tx, gu.id, fromType);
      const lock = await tx.execute(sql`SELECT balance::bigint AS bal FROM gift_balances WHERE id = ${fromId} FOR UPDATE`);
      const fromBal = BigInt((lock[0] as any)?.bal ?? 0);
      if (fromBal < giftMicro) throw new Error('insufficient_balance');
      await tx.execute(sql`UPDATE gift_balances SET balance = balance - ${Number(giftMicro)}, updated_at = NOW() WHERE id = ${fromId}`);
      const toId = await ensureGiftBalanceRow(tx, gu.id, toType);
      await tx.execute(sql`UPDATE gift_balances SET balance = balance + ${Number(giftMicro)}, updated_at = NOW() WHERE id = ${toId}`);
      await tx.execute(sql`
        INSERT INTO gift_money_log (gift_user_id, trendex_user_id, kind, from_type, to_type, amount_micro, ref)
        VALUES (${gu.id}, ${gu.trendex_user_id ?? null}, ${'transfer'}, ${fromType}, ${toType}, ${Number(giftMicro)}, ${direction})
      `);
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'transfer_failed' }, 400);
  }
  return c.json({ ok: true });
});

// ============= POST /internal/gift/withdraw =============
// Прямая заявка на выплату с GIFT Текущий (тип 5), от 10 USDT. Холдим сумму.
app.post('/internal/gift/withdraw', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: false, reason: r.error }, (r.status || 400) as any);
  const gu = r.gu;
  const body = await c.req.json().catch(() => ({}));
  const amountUsdt = Number(body.amount_usdt);
  const address = String(body.address || '').trim();
  const network = String(body.network || 'TRC20').trim() || 'TRC20';
  if (!address) return c.json({ ok: false, reason: 'address_required' }, 400);
  if (!Number.isFinite(amountUsdt) || amountUsdt < MIN_WITHDRAW_USDT) {
    return c.json({ ok: false, reason: 'min_10_usdt' }, 400);
  }
  let giftMicro: bigint;
  try { giftMicro = usdtToMicro(amountUsdt, GIFT_MICRO_PER_USDT); }
  catch { return c.json({ ok: false, reason: 'bad_amount' }, 400); }

  let requestId = 0;
  try {
    await db.transaction(async (tx) => {
      const rowId = await ensureGiftBalanceRow(tx, gu.id, BAL_CURRENT);
      const lock = await tx.execute(sql`SELECT balance::bigint AS bal FROM gift_balances WHERE id = ${rowId} FOR UPDATE`);
      const bal = BigInt((lock[0] as any)?.bal ?? 0);
      if (bal < giftMicro) throw new Error('insufficient_balance');
      await tx.execute(sql`UPDATE gift_balances SET balance = balance - ${Number(giftMicro)}, updated_at = NOW() WHERE id = ${rowId}`);
      const ins = await tx.execute(sql`
        INSERT INTO gift_withdrawals (gift_user_id, trendex_user_id, amount_micro, address, network, status)
        VALUES (${gu.id}, ${gu.trendex_user_id ?? null}, ${Number(giftMicro)}, ${address}, ${network}, ${'pending'})
        RETURNING id
      `);
      requestId = Number((ins[0] as any).id);
      await tx.execute(sql`
        INSERT INTO gift_money_log (gift_user_id, trendex_user_id, kind, from_type, amount_micro, ref)
        VALUES (${gu.id}, ${gu.trendex_user_id ?? null}, ${'withdraw_hold'}, ${BAL_CURRENT}, ${Number(giftMicro)}, ${'wd#' + requestId})
      `);
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'withdraw_failed' }, 400);
  }
  return c.json({ ok: true, request_id: requestId });
});

// ============= GET /internal/gift/withdrawals =============
app.get('/internal/gift/withdrawals', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, withdrawals: [] });
  const gu = r.gu;
  const rows = await db.execute(sql`
    SELECT id, amount_micro::text AS amount_micro, address, network, status, tx_hash, notes, created_at, processed_at
    FROM gift_withdrawals WHERE gift_user_id = ${gu.id} ORDER BY created_at DESC LIMIT 50
  `);
  return c.json({ ok: true, withdrawals: rows });
});

// ============= /internal/gift/statuses =============
app.get('/internal/gift/statuses', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, tiers: GIVER_TIERS, current_tier: 0, leader_level: null });
  const gu = r.gu;
  // Текущий статус = максимальный достигнутый старый уровень → ремап в Д1-Д4.
  const maxRows = await db.execute(sql`
    SELECT COALESCE(MAX(gl.level), 0) AS max_level
    FROM gift_user_giver_level gugl JOIN gift_giver_levels gl ON gl.id = gugl.giver_level_id
    WHERE gugl.user_id = ${gu.id}
  `);
  const maxLevel = Number((maxRows[0] as any)?.max_level || 0);
  const currentTier = oldLevelToTier(maxLevel);
  const leaderRows = await db.execute(sql`
    SELECT cll.level, cll.needs_ref, cll.depth, gucll.snapshot_date
    FROM gift_user_circle_leader_level gucll JOIN gift_circle_leader_levels cll ON cll.id = gucll.leader_level_id
    WHERE gucll.user_id = ${gu.id}
  `);
  return c.json({ ok: true, tiers: GIVER_TIERS, current_tier: currentTier, leader_level: leaderRows[0] || null });
});

// ============= /internal/gift/profile =============
// Кто пригласил (ref_id) + Лидер структуры (ближайший аплайн-лидер по дереву).
app.get('/internal/gift/profile', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, inviter: null, structure_leader: null });
  const gu = r.gu;

  let inviter = null;
  if (gu.ref_id) {
    const rows = await db.execute(sql`
      SELECT id, name, surname, telegram_username FROM gift_users WHERE id = ${gu.ref_id} LIMIT 1
    `);
    if (rows[0]) inviter = rows[0];
  }
  // Лидер структуры = ближайший предок (по lft/rgt) с присвоенным circle-leader уровнем.
  const leaderRows = await db.execute(sql`
    SELECT a.id, a.name, a.surname, a.telegram_username, cll.level AS leader_level
    FROM gift_users a
    JOIN gift_user_circle_leader_level gucll ON gucll.user_id = a.id
    JOIN gift_circle_leader_levels cll ON cll.id = gucll.leader_level_id
    WHERE a.lft < ${gu.lft} AND a.rgt > ${gu.rgt}
    ORDER BY a.depth DESC
    LIMIT 1
  `);
  return c.json({
    ok: true,
    me: { id: gu.id, name: gu.name, surname: gu.surname, telegram_username: gu.telegram_username, role: gu.role },
    inviter,
    structure_leader: leaderRows[0] || null,
  });
});

// ============= /internal/gift/referrals/summary =============
app.get('/internal/gift/referrals/summary', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, summary: [], total: 0 });
  const gu = r.gu;
  const rows = await db.execute(sql`
    SELECT depth - ${gu.depth} AS level, COUNT(*) AS n
    FROM gift_users
    WHERE lft > ${gu.lft} AND rgt < ${gu.rgt}
      AND depth BETWEEN ${gu.depth + 1} AND ${gu.depth + 15}
    GROUP BY depth ORDER BY depth
  `);
  return c.json({
    ok: true,
    summary: rows.map((r: any) => ({ level: Number(r.level), count: Number(r.n) })),
    total: rows.reduce((s, r: any) => s + Number(r.n), 0),
  });
});

// ============= /internal/gift/referrals?level=N =============
app.get('/internal/gift/referrals', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, level: 0, count: 0, members: [] });
  const gu = r.gu;
  const reqLevel = parseInt(c.req.query('level') || '1', 10);
  if (reqLevel < 1 || reqLevel > 15) return c.json({ ok: false, error: 'invalid_level' }, 400);
  const targetDepth = gu.depth + reqLevel;
  const rows = await db.execute(sql`
    SELECT id, name, telegram_username, telegram_chat_id, depth, created_at
    FROM gift_users
    WHERE lft > ${gu.lft} AND rgt < ${gu.rgt} AND depth = ${targetDepth}
    ORDER BY lft LIMIT 500
  `);
  return c.json({ ok: true, level: reqLevel, count: rows.length, members: rows });
});

// ============= /internal/gift/accounts =============
app.get('/internal/gift/accounts', async (c) => {
  const r = await resolveAccount(c);
  if (r.error) return c.json({ ok: true, accounts: [] });
  const gu = r.gu;
  const mainId = gu.main_user_id ?? gu.id;
  const rows = await db.execute(sql`
    SELECT id, gc_user_id, name, surname, telegram_username, role,
           CASE WHEN id = ${mainId} THEN true ELSE false END AS is_main,
           CASE WHEN id = ${gu.id} THEN true ELSE false END AS is_current,
           created_at
    FROM gift_users
    WHERE id = ${mainId} OR main_user_id = ${mainId}
    ORDER BY (id = ${mainId}) DESC, id
  `);
  return c.json({ ok: true, current_id: gu.id, main_id: mainId, accounts: rows });
});

// ============= POST /internal/gift/switch-account =============
app.post('/internal/gift/switch-account', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  const email = body.email || null;
  const tgId = body.tg_id ? Number(body.tg_id) : null;
  const targetId = parseInt(body.account_id, 10);
  if ((!email && !tgId) || !targetId) return c.json({ ok: false, error: 'invalid_args' }, 400);
  const primary = await findPrimaryGift(email, tgId);
  if (!primary) return c.json({ ok: false, error: 'not_linked' }, 404);
  const mainId = primary.main_user_id ?? primary.id;
  const targetRows = await db.execute(sql`
    SELECT id FROM gift_users WHERE id = ${targetId} AND (id = ${mainId} OR main_user_id = ${mainId})
  `);
  if (!targetRows[0]) return c.json({ ok: false, error: 'account_not_yours' }, 403);
  return c.json({ ok: true, switched_to: targetId });
});

// =====================================================================
// PARTNER PROGRAM ("Команда") — team tree / levels / table.
// Always uses the MAIN account (main_user_id IS NULL). Multi-accounts are
// NOT shown. Scoped strictly to the user's own subtree (lft/rgt bounds).
// "Who invited whom" = gift_users.ref_id (immediate inviter).
// =====================================================================

// Helper: resolve the MAIN gift account for the requester (ignores multi-acct override)
async function resolveMain(c: any) {
  const email = c.req.query('email') || null;
  const tgId = c.req.query('tg_id') ? Number(c.req.query('tg_id')) : null;
  if (!email && !tgId) return { error: 'email_or_tg_id_required', status: 400 };
  const gu = await findPrimaryGift(email, tgId); // already prefers main_user_id IS NULL
  if (!gu) return { error: 'not_linked', status: 404 };
  return { gu };
}

// GET /internal/gift/team/tree?tg_id=X[&parent_gift_id=Y]
// Direct children (immediate invitees) of node Y. Default Y = self (root line).
app.get('/internal/gift/team/tree', async (c) => {
  const r = await resolveMain(c);
  if (r.error) return c.json({ ok: true, root: null, children: [] });
  const me = r.gu;
  const parentId = c.req.query('parent_gift_id') ? Number(c.req.query('parent_gift_id')) : me.id;

  // Safety: parent must be inside my subtree (or be me)
  if (parentId !== me.id) {
    const chk = await db.execute(sql`
      SELECT 1 FROM gift_users WHERE id = ${parentId} AND lft >= ${me.lft} AND rgt <= ${me.rgt}
    `);
    if (!chk[0]) return c.json({ ok: false, error: 'out_of_scope' }, 403);
  }

  const children = await db.execute(sql`
    SELECT gu.id, gu.name, gu.telegram_username, gu.telegram_chat_id,
           (gu.depth - ${me.depth}) AS level,
           (SELECT count(*) FROM gift_users ch WHERE ch.ref_id = gu.id) AS direct_refs,
           ((gu.rgt - gu.lft - 1) / 2) AS total_team,
           COALESCE((SELECT SUM(b.balance) FROM gift_balances b
                     WHERE b.user_id = gu.id AND b.balance_type_id IN (5,6)),0)::text AS balance_micro,
           (SELECT gl.level FROM gift_user_giver_level ugl
              JOIN gift_giver_levels gl ON gl.id = ugl.giver_level_id
              WHERE ugl.user_id = gu.id ORDER BY gl.level DESC LIMIT 1) AS giver_level,
           gu.created_at
    FROM gift_users gu
    WHERE gu.ref_id = ${parentId} AND gu.main_user_id IS NULL
    ORDER BY gu.lft
    LIMIT 1000
  `);

  return c.json({
    ok: true,
    parent_gift_id: parentId,
    root: { id: me.id, name: me.name, total_team: Math.floor((me.rgt - me.lft - 1) / 2) },
    children: children.map((x: any) => ({
      id: x.id, name: x.name, telegram_username: x.telegram_username,
      level: Number(x.level), direct_refs: Number(x.direct_refs),
      total_team: Number(x.total_team), balance_micro: x.balance_micro,
      giver_level: x.giver_level, created_at: x.created_at,
    })),
  });
});

// GET /internal/gift/team/levels?tg_id=X — count per level (full depth, no cap)
app.get('/internal/gift/team/levels', async (c) => {
  const r = await resolveMain(c);
  if (r.error) return c.json({ ok: true, levels: [], total: 0 });
  const me = r.gu;
  const rows = await db.execute(sql`
    SELECT (depth - ${me.depth}) AS level, COUNT(*) AS n
    FROM gift_users
    WHERE lft > ${me.lft} AND rgt < ${me.rgt} AND main_user_id IS NULL
    GROUP BY depth ORDER BY depth
  `);
  return c.json({
    ok: true,
    levels: rows.map((x: any) => ({ level: Number(x.level), count: Number(x.n) })),
    total: rows.reduce((s, x: any) => s + Number(x.n), 0),
  });
});

// GET /internal/gift/team/table?tg_id=X&search=&level=&page=&sort=
// Paginated, searchable flat list of the WHOLE subtree. No export (UI-only).
app.get('/internal/gift/team/table', async (c) => {
  const r = await resolveMain(c);
  if (r.error) return c.json({ ok: true, rows: [], total: 0, page: 1, pages: 0 });
  const me = r.gu;
  const search = (c.req.query('search') || '').trim();
  const level = c.req.query('level') ? Number(c.req.query('level')) : null;
  const page = Math.max(1, Number(c.req.query('page') || 1));
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const sortKey = c.req.query('sort') || 'level';

  const sortMap: Record<string, any> = {
    level: sql`gu.depth ASC, gu.lft ASC`,
    balance: sql`bal DESC`,
    date: sql`gu.created_at DESC`,
    name: sql`gu.name ASC`,
  };
  const orderBy = sortMap[sortKey] || sortMap.level;
  const searchPat = `%${search}%`;

  // Build WHERE pieces
  const whereSearch = search
    ? sql`AND (gu.name ILIKE ${searchPat} OR gu.telegram_username ILIKE ${searchPat} OR gu.telegram_chat_id ILIKE ${searchPat})`
    : sql``;
  const whereLevel = (level !== null)
    ? sql`AND (gu.depth - ${me.depth}) = ${level}`
    : sql``;

  const countRows = await db.execute(sql`
    SELECT count(*) AS n FROM gift_users gu
    WHERE gu.lft > ${me.lft} AND gu.rgt < ${me.rgt} AND gu.main_user_id IS NULL ${whereSearch} ${whereLevel}
  `);
  const total = Number((countRows[0] as any).n);

  const rows = await db.execute(sql`
    SELECT gu.id, gu.name, gu.telegram_username, gu.telegram_chat_id,
           (gu.depth - ${me.depth}) AS level,
           inv.name AS inviter_name, inv.telegram_username AS inviter_username,
           (SELECT gl.level FROM gift_user_giver_level ugl
              JOIN gift_giver_levels gl ON gl.id = ugl.giver_level_id
              WHERE ugl.user_id = gu.id ORDER BY gl.level DESC LIMIT 1) AS giver_level,
           COALESCE((SELECT SUM(b.balance) FROM gift_balances b
                     WHERE b.user_id = gu.id AND b.balance_type_id IN (5,6)),0)::text AS bal,
           gu.created_at
    FROM gift_users gu
    LEFT JOIN gift_users inv ON inv.id = gu.ref_id
    WHERE gu.lft > ${me.lft} AND gu.rgt < ${me.rgt} AND gu.main_user_id IS NULL ${whereSearch} ${whereLevel}
    ORDER BY ${orderBy}
    LIMIT ${pageSize} OFFSET ${offset}
  `);

  return c.json({
    ok: true,
    page, pages: Math.ceil(total / pageSize), total, page_size: pageSize,
    rows: rows.map((x: any) => ({
      id: x.id, name: x.name, telegram_username: x.telegram_username,
      level: Number(x.level),
      inviter_name: x.inviter_name, inviter_username: x.inviter_username,
      giver_level: x.giver_level, balance_micro: x.bal, created_at: x.created_at,
    })),
  });
});

export default app;
