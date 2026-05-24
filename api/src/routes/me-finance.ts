/**
 * /me/finance routes — 4-balance system endpoints for cabinet + bot.
 *
 * Endpoints:
 *  GET    /me/finance/balances        — { working, gift, subscription, karma } + tariff state
 *  GET    /me/finance/transactions    — paginated audit history (cash_ledger + wallet_transfers + karma_log)
 *  POST   /me/finance/transfer        — between wallets (working ↔ subscription only)
 *  POST   /me/finance/withdraw        — request withdrawal from working balance
 *  GET    /me/finance/withdraw        — list user's withdrawal requests
 *  POST   /me/finance/withdraw/:id/cancel — cancel pending withdrawal
 *
 * Notifications inbox (UNIFIED — same stream feeds bot + cabinet bell):
 *  GET    /me/notifications           — paginated inbox feed
 *  GET    /me/notifications/unread-count
 *  POST   /me/notifications/:id/read
 *  POST   /me/notifications/read-all
 *
 * Tariff catalogue (read-only, shows "доплата" if user has prev tariff):
 *  GET    /me/finance/tariff-options
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import {
  readBalances,
  transferBetweenWallets,
  type Wallet,
} from '../services/balances.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/finance/*', requireAuth);
app.use('/me/notifications/*', requireAuth);

// Helper: stringify BigInts in JSON output. JSON.stringify can't handle
// bigint natively — we convert to plain numbers (cents-precision is fine
// for display; full precision stays in DB).
function stringifyBigInts<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v
  )) as T;
}

const MIN_WITHDRAW_MICRO = 3_000_000n; // $3 minimum

// ════════════════════════════════════════════════════════
// BALANCES
// ════════════════════════════════════════════════════════

/**
 * GET /me/finance/balances
 * Returns all 4 balances + tariff state — single source of truth shared
 * by bot, cabinet UI, and admin views.
 */
app.get('/me/finance/balances', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false, reason: 'no_session' }, 401);

  try {
    const b = await readBalances(session.id);
    return c.json({
      ok: true,
      balances: {
        working: { micro: b.working_micro.toString(), usd: Number(b.working_micro) / 1e6 },
        gift:    { micro: b.gift_micro.toString(),    usd: Number(b.gift_micro) / 1e6 },
        subscription: {
          micro: b.subscription_micro.toString(),
          usd: Number(b.subscription_micro) / 1e6,
          cap_micro: b.subscription_cap_micro.toString(),
          cap_usd: Number(b.subscription_cap_micro) / 1e6,
          progress: b.subscription_cap_micro > 0n
            ? Math.min(100, Number((b.subscription_micro * 100n) / b.subscription_cap_micro))
            : 0,
        },
        karma: { points: b.karma_points.toString() },
      },
      tariff: {
        code: b.active_tariff,
        expires_at: b.tariff_expires_at?.toISOString() ?? null,
        auto_renew: b.tariff_auto_renew,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'balances_failed' }, 500);
  }
});

// ════════════════════════════════════════════════════════
// TRANSACTIONS HISTORY
// ════════════════════════════════════════════════════════

/**
 * GET /me/finance/transactions?limit=50&before=<id>
 * Unified history: cash_ledger entries + wallet_transfers + karma_log.
 * Returns rows sorted by created_at DESC.
 */
app.get('/me/finance/transactions', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const limit = Math.min(Number(c.req.query('limit') || 50), 200);

  // Union over 3 audit tables. Each has different shape, so we normalize.
  const rows = (await db.execute(sql`
    SELECT * FROM (
      SELECT
        'ledger:'  || id::text         AS uid,
        kind,
        amount_micro,
        memo,
        created_at,
        'working'                       AS wallet,
        NULL::text                      AS from_wallet,
        NULL::text                      AS to_wallet
      FROM cash_ledger
      WHERE user_id = ${session.id}

      UNION ALL

      SELECT
        'xfer:'   || id::text          AS uid,
        'transfer'                     AS kind,
        amount_micro,
        memo,
        created_at,
        NULL::text                     AS wallet,
        from_wallet,
        to_wallet
      FROM wallet_transfers
      WHERE user_id = ${session.id}

      UNION ALL

      SELECT
        'karma:'  || id::text          AS uid,
        'karma_' || kind                AS kind,
        points                         AS amount_micro,
        memo,
        created_at,
        'karma'                        AS wallet,
        NULL::text                     AS from_wallet,
        NULL::text                     AS to_wallet
      FROM karma_log
      WHERE user_id = ${session.id}
    ) AS combined
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    uid: string;
    kind: string;
    amount_micro: string | number;
    memo: string | null;
    created_at: string | Date;
    wallet: string | null;
    from_wallet: string | null;
    to_wallet: string | null;
  }>;

  return c.json({
    ok: true,
    items: rows.map((r) => ({
      uid: r.uid,
      kind: r.kind,
      amount_micro: String(r.amount_micro),
      amount_usd: Number(r.amount_micro) / 1e6,
      memo: r.memo,
      wallet: r.wallet,
      from_wallet: r.from_wallet,
      to_wallet: r.to_wallet,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
  });
});

// ════════════════════════════════════════════════════════
// TRANSFER between wallets (working ↔ subscription)
// ════════════════════════════════════════════════════════

/**
 * POST /me/finance/transfer
 * Body: { from: 'working'|'subscription', to: 'working'|'subscription', amount_micro: number }
 * Returns updated balances.
 */
app.post('/me/finance/transfer', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const body = await c.req.json().catch(() => ({}));
  const from = String(body.from || '') as Wallet;
  const to = String(body.to || '') as Wallet;
  const amountMicroNum = Number(body.amount_micro || 0);

  if (!from || !to) return c.json({ ok: false, reason: 'wallet_required' }, 400);
  if (!Number.isFinite(amountMicroNum) || amountMicroNum <= 0) {
    return c.json({ ok: false, reason: 'amount_must_be_positive' }, 400);
  }
  const amountMicro = BigInt(Math.floor(amountMicroNum));

  // Pre-check sufficient balance on from-wallet
  const before = await readBalances(session.id);
  const fromBal = from === 'working' ? before.working_micro : from === 'subscription' ? before.subscription_micro : 0n;
  if (fromBal < amountMicro) {
    return c.json({
      ok: false, reason: 'insufficient_funds',
      have_micro: fromBal.toString(), need_micro: amountMicro.toString(),
    }, 400);
  }

  try {
    await transferBetweenWallets(session.id, from, to, amountMicro,
      `manual transfer ${from}→${to}`);
    const after = await readBalances(session.id);
    return c.json({
      ok: true,
      transferred_micro: amountMicro.toString(),
      from, to,
      balances: stringifyBigInts({
        working: after.working_micro,
        gift: after.gift_micro,
        subscription: after.subscription_micro,
        karma: after.karma_points,
      }),
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'transfer_failed' }, 400);
  }
});

// ════════════════════════════════════════════════════════
// WITHDRAW request (working balance → external)
// ════════════════════════════════════════════════════════

/**
 * POST /me/finance/withdraw
 * Body: { amount_micro: number, method: 'usdt_trc20'|'usdt_bep20'|'card_rub'|'sbp', address: string }
 * Creates a 'pending' withdrawal request. Admin approves manually.
 * Debits cash_ledger immediately so balance is reserved (negative entry
 * with kind='withdraw_pending'); on rejection the row gets a +amount
 * compensation row (kind='withdraw_refund').
 */
app.post('/me/finance/withdraw', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const body = await c.req.json().catch(() => ({}));
  const amountMicroNum = Number(body.amount_micro || 0);
  const method = String(body.method || '').slice(0, 32);
  const address = String(body.address || '').slice(0, 256).trim();

  if (!Number.isFinite(amountMicroNum) || amountMicroNum <= 0)
    return c.json({ ok: false, reason: 'amount_must_be_positive' }, 400);
  if (!method || !address)
    return c.json({ ok: false, reason: 'method_and_address_required' }, 400);

  const amountMicro = BigInt(Math.floor(amountMicroNum));
  if (amountMicro < MIN_WITHDRAW_MICRO)
    return c.json({ ok: false, reason: 'below_min', min_micro: MIN_WITHDRAW_MICRO.toString() }, 400);

  const balances = await readBalances(session.id);
  if (balances.working_micro < amountMicro) {
    return c.json({
      ok: false, reason: 'insufficient_funds',
      have_micro: balances.working_micro.toString(),
      need_micro: amountMicro.toString(),
    }, 400);
  }

  // Atomic: debit working + create withdrawal request
  const result = await db.transaction(async (tx) => {
    // Reserve funds
    await tx.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
      VALUES (${session.id}, 'withdraw_pending', ${-Number(amountMicro)},
              ${'method=' + method + ' addr=' + address.slice(0, 60)})
    `);
    // Create withdrawal request row (table assumed to pre-exist or to be auto-created)
    // For now we use cash_ledger as source of truth; admin reads pending entries
    // and approves/rejects via separate admin endpoint (Phase 9).
    return { ok: true };
  });

  return c.json({
    ok: true,
    requested_micro: amountMicro.toString(),
    method, address,
    note: 'Заявка на вывод создана. Админ проверит в течение 24ч.',
  });
});

/**
 * GET /me/finance/withdraw — list user's withdrawal requests
 */
app.get('/me/finance/withdraw', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const rows = (await db.execute(sql`
    SELECT id, amount_micro, memo, created_at,
      CASE
        WHEN kind = 'withdraw_pending' THEN 'pending'
        WHEN kind = 'withdraw_approved' THEN 'approved'
        WHEN kind = 'withdraw_rejected' THEN 'rejected'
        WHEN kind = 'withdraw_refund' THEN 'refunded'
      END AS status
    FROM cash_ledger
    WHERE user_id = ${session.id}
      AND kind IN ('withdraw_pending', 'withdraw_approved', 'withdraw_rejected', 'withdraw_refund')
    ORDER BY created_at DESC
    LIMIT 50
  `)) as unknown as Array<{ id: number; amount_micro: string | number; memo: string; created_at: string; status: string }>;

  return c.json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      amount_micro: String(Math.abs(Number(r.amount_micro))),
      amount_usd: Math.abs(Number(r.amount_micro)) / 1e6,
      memo: r.memo,
      status: r.status,
      created_at: r.created_at,
    })),
  });
});

// ════════════════════════════════════════════════════════
// TARIFF OPTIONS (with пользовательский upgrade-cost calc)
// ════════════════════════════════════════════════════════

/**
 * GET /me/finance/tariff-options
 * Returns the 3 paid tariffs + their upgrade cost from caller's current tariff.
 * Frontend marketing page uses this to show "доплата $X" inline.
 */
app.get('/me/finance/tariff-options', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const balances = await readBalances(session.id);
  const current = balances.active_tariff || 'free';

  // Hard-coded prices in micro USD (matches subscription_caps and tariffs table).
  const PRICES_MICRO: Record<string, bigint> = {
    free:   0n,
    launch: 45_000_000n,
    boost:  90_000_000n,
    rocket: 135_000_000n,
  };
  const SEATS: Record<string, number> = { free: 0, launch: 1, boost: 2, rocket: 3 };

  const options = (['launch', 'boost', 'rocket'] as const).map((code) => {
    const targetPrice = PRICES_MICRO[code];
    const currentPaid = PRICES_MICRO[current] || 0n;
    const isUpgrade = currentPaid > 0n && targetPrice > currentPaid;
    const isSamePaid = currentPaid > 0n && targetPrice === currentPaid;
    const isDowngrade = currentPaid > 0n && targetPrice < currentPaid;
    // Цена для покупки/апгрейда: для апгрейда — доплата = разница
    const cost = isUpgrade ? (targetPrice - currentPaid) : targetPrice;

    let action: 'buy' | 'upgrade' | 'current' | 'locked' = 'buy';
    if (isSamePaid) action = 'current';
    else if (isUpgrade) action = 'upgrade';
    else if (isDowngrade) action = 'locked';
    else if (current === 'free') action = 'buy';

    return {
      code,
      price_micro: targetPrice.toString(),
      price_usd: Number(targetPrice) / 1e6,
      cost_micro: cost.toString(),
      cost_usd: Number(cost) / 1e6,
      seats: SEATS[code],
      action,
      can_afford: balances.working_micro + balances.subscription_micro >= cost,
      affordable_breakdown: {
        working_micro: balances.working_micro.toString(),
        subscription_micro: balances.subscription_micro.toString(),
        total_available_micro: (balances.working_micro + balances.subscription_micro).toString(),
        shortfall_micro: cost > (balances.working_micro + balances.subscription_micro)
          ? (cost - balances.working_micro - balances.subscription_micro).toString() : '0',
      },
    };
  });

  return c.json({ ok: true, current, options });
});

// ════════════════════════════════════════════════════════
// NOTIFICATIONS INBOX (unified bot+cabinet feed)
// ════════════════════════════════════════════════════════

/**
 * GET /me/notifications?limit=50&unread=1
 * Inbox feed for the cabinet bell. Each row = one event, also delivered
 * to bot via inbox-tg-deliver worker. Single source of truth.
 */
app.get('/me/notifications', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);

  const limit = Math.min(Number(c.req.query('limit') || 50), 200);
  const unreadOnly = c.req.query('unread') === '1';

  const rows = (await db.execute(sql`
    SELECT id, kind, severity, title, body, url, meta, read_at, created_at
    FROM notifications_inbox
    WHERE user_id = ${session.id}
      ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `)) as unknown as Array<{
    id: number; kind: string; severity: string; title: string;
    body: string | null; url: string | null; meta: any;
    read_at: string | null; created_at: string;
  }>;

  return c.json({
    ok: true,
    items: rows.map((r) => ({
      id: String(r.id),
      kind: r.kind,
      severity: r.severity,
      title: r.title,
      body: r.body,
      url: r.url,
      meta: r.meta,
      is_read: !!r.read_at,
      read_at: r.read_at,
      created_at: r.created_at,
    })),
  });
});

/** GET /me/notifications/unread-count */
app.get('/me/notifications/unread-count', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM notifications_inbox
    WHERE user_id = ${session.id} AND read_at IS NULL
  `)) as unknown as Array<{ n: number }>;
  return c.json({ ok: true, count: rows[0]?.n || 0 });
});

/** POST /me/notifications/:id/read */
app.post('/me/notifications/:id/read', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, reason: 'bad_id' }, 400);
  await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE id = ${id} AND user_id = ${session.id} AND read_at IS NULL
  `);
  return c.json({ ok: true });
});

/** POST /me/notifications/read-all */
app.post('/me/notifications/read-all', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const r = (await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE user_id = ${session.id} AND read_at IS NULL
    RETURNING id
  `)) as unknown as Array<{ id: number }>;
  return c.json({ ok: true, marked: r.length });
});


// ════════════════════════════════════════════════════════
// TARIFF BUY / UPGRADE (from balance, no external pay)
// ════════════════════════════════════════════════════════

/**
 * POST /me/finance/buy-tariff
 * Body: { tariff: 'launch'|'boost'|'rocket', source_policy?: 'subscription_first'|'working_first'|'subscription_only' }
 * Buys tariff using internal balances. No card / crypto needed.
 */
app.post('/me/finance/buy-tariff', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const body = await c.req.json().catch(() => ({}));
  const tariff = String(body.tariff || '').toLowerCase();
  const sourcePolicy = String(body.source_policy || 'subscription_first');
  if (!['launch', 'boost', 'rocket'].includes(tariff)) {
    return c.json({ ok: false, reason: 'invalid_tariff' }, 400);
  }
  const { buyTariffFromBalance } = await import('../services/tariff-buy.js');
  const r = await buyTariffFromBalance({
    userId: session.id,
    tariffCode: tariff as 'launch'|'boost'|'rocket',
    sourcePolicy: sourcePolicy as any,
  });
  return c.json(r, r.ok ? 200 : 400);
});

/**
 * POST /me/finance/upgrade-tariff
 * Same body shape; charges only the доплата (delta).
 * LAUNCH→BOOST=, LAUNCH→ROCKET= , BOOST→ROCKET=.
 */
app.post('/me/finance/upgrade-tariff', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const body = await c.req.json().catch(() => ({}));
  const tariff = String(body.tariff || '').toLowerCase();
  const sourcePolicy = String(body.source_policy || 'subscription_first');
  if (!['launch', 'boost', 'rocket'].includes(tariff)) {
    return c.json({ ok: false, reason: 'invalid_tariff' }, 400);
  }
  const { upgradeTariffFromBalance } = await import('../services/tariff-buy.js');
  const r = await upgradeTariffFromBalance({
    userId: session.id,
    tariffCode: tariff as 'launch'|'boost'|'rocket',
    sourcePolicy: sourcePolicy as any,
  });
  return c.json(r, r.ok ? 200 : 400);
});


/**
 * GET /me/finance/test-placement
 * Returns a simulation of what the authenticated user WOULD earn per
 * tariff (LAUNCH/BOOST/ROCKET) given their current team graph. Used by
 * the cabinet's "Тестовая расстановка" widget on #/finance and by the
 * daily cron broadcaster — pulling the same code path keeps numbers
 * consistent between push (TG) and pull (cabinet).
 */
app.get('/me/finance/test-placement', async (c) => {
  const session = c.get('user');
  if (!session?.id) return c.json({ ok: false }, 401);
  const { simulateForUser, buildSimMessage, fmtMicro } = await import('../services/test-placement.js');
  const sim = await simulateForUser(session.id);
  return c.json({
    ok: true,
    team_total: sim.team_total,
    team_by_level: sim.team_by_level,
    tariffs: {
      launch: {
        matrix_micro: sim.launch.matrix_micro.toString(),
        refs_micro: sim.launch.refs_micro.toString(),
        matching_micro: sim.launch.matching_micro.toString(),
        total_micro: sim.launch.total_micro.toString(),
        total_fmt: fmtMicro(sim.launch.total_micro),
        team_in_depth: sim.launch.team_in_depth,
        team_in_refs: sim.launch.team_in_refs,
      },
      boost: {
        matrix_micro: sim.boost.matrix_micro.toString(),
        refs_micro: sim.boost.refs_micro.toString(),
        matching_micro: sim.boost.matching_micro.toString(),
        total_micro: sim.boost.total_micro.toString(),
        total_fmt: fmtMicro(sim.boost.total_micro),
        team_in_depth: sim.boost.team_in_depth,
        team_in_refs: sim.boost.team_in_refs,
      },
      rocket: {
        matrix_micro: sim.rocket.matrix_micro.toString(),
        refs_micro: sim.rocket.refs_micro.toString(),
        matching_micro: sim.rocket.matching_micro.toString(),
        total_micro: sim.rocket.total_micro.toString(),
        total_fmt: fmtMicro(sim.rocket.total_micro),
        team_in_depth: sim.rocket.team_in_depth,
        team_in_refs: sim.rocket.team_in_refs,
      },
    },
    message: buildSimMessage(sim),
  });
});

export default app;
