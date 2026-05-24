/**
 * /internal/finance/* — secret-protected proxy endpoints used by the cabinet
 * service to perform balance + tariff operations on behalf of a user.
 *
 * Auth: requires header `x-trendex-secret: <INTERNAL_API_SECRET>`.
 * User identity passed in body or query as `user_id` (api-side users.id) OR
 * `email` (lookup → users.id). Fails 404 if the user can't be found.
 *
 * These mirror /me/finance/* but accept an explicit user_id rather than
 * reading session — that's because cabinet has its own session mechanism
 * separate from api's, and we proxy by resolving cabinet's webUser to
 * an api-side users row via email.
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { applyIncomeSplit } from '../services/income-split.js';
import {
  readBalances,
  transferBetweenWallets,
  type Wallet,
} from '../services/balances.js';
import {
  buyTariffFromBalance,
  upgradeTariffFromBalance,
} from '../services/tariff-buy.js';
import { placeBonusSeat } from '../services/bonus-matrix.js';

const app = new Hono();

app.use('/internal/finance/*', requireInternalSecret);

/** Resolve user_id from body/query (preferred) OR by email lookup. */
async function resolveUserId(c: any): Promise<number | null> {
  const body = c.req.method === 'POST' ? await c.req.json().catch(() => ({})) : {};
  const queryParams = c.req.query();
  const userId = Number(body.user_id || queryParams.user_id || 0);
  if (Number.isFinite(userId) && userId > 0) {
    // verify user exists
    const r = (await db.execute(sql`SELECT id FROM users WHERE id = ${userId}`)) as any[];
    if (r[0]?.id) return Number(r[0].id);
    // [user_id-fallthrough-2026-05-17] When user_id is the cabinet's SQLite id
    // (not trendex-api's Postgres id), fall through to email/tgId lookup instead
    // of returning null. Fixes engine billing seeing $0 when cabinet shows $801.
  }
  // Fallback: parse synthetic email tg<id>@trendex.bot (used by cabinet bridge for TG-only users)
  const email = String(body.email || queryParams.email || '').trim().toLowerCase();
  if (!email) return null;
  const m = email.match(/^tg(\d+)@trendex\.bot$/);
  if (m) {
    const tgId = Number(m[1]);
    const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${tgId} LIMIT 1`)) as any[];
    if (r[0]?.id) return Number(r[0].id);
    // Lazy-create: TG WebApp users may open Mini App before /start ever ran
    // in the bot. Auto-create a stub users row so finance bridges succeed
    // end-to-end (returning empty zeros instead of api_404).
    try {
      const refCode = 'tg' + tgId;
      const inserted = (await db.execute(sql`
        INSERT INTO users (tg_id, ref_code, joined_at, last_seen_at)
        VALUES (${tgId}, ${refCode}, NOW(), NOW())
        ON CONFLICT (tg_id) DO UPDATE SET last_seen_at = NOW()
        RETURNING id
      `)) as any[];
      return inserted[0]?.id ? Number(inserted[0].id) : null;
    } catch (e) {
      console.warn('[resolveUserId] lazy-create failed for tgId', tgId, (e as Error).message);
      return null;
    }
  }
  // Real-email path: users registered via /auth/register get a row in
  // `credentials` linking email → user_id. internal-pay uses the same lookup.
  // Note: lowercase email is the canonical form (credentials.email is unique).
  const credRows = (await db.execute(sql`
    SELECT user_id FROM credentials WHERE email = ${email} LIMIT 1
  `)) as unknown as Array<{ user_id: number }>;
  if (credRows[0]?.user_id) return Number(credRows[0].user_id);
  // Genuinely unknown email — caller returns 404 / empty zeros.
  return null;
}

const MIN_WITHDRAW_MICRO = 3_000_000n;

const PRICES_MICRO: Record<string, bigint> = {
  free: 0n, launch: 45_000_000n, boost: 90_000_000n, rocket: 135_000_000n,
};
const SEATS: Record<string, number> = { free: 0, launch: 1, boost: 2, rocket: 3 };

// ════════════════════════════════════════════════════════
// BALANCES
// ════════════════════════════════════════════════════════

app.get('/internal/finance/balances', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  try {
    const b = await readBalances(userId);
    // [balance-cents-compat-2026-05-17] cents form for roboai-engine BillingService (reads available_cents | balance_cents)
    const workingCents = Math.round(Number(b.working_micro) / 1e4);
    const giftCents = Math.round(Number(b.gift_micro) / 1e4);
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
            ? Math.min(100, Number((b.subscription_micro * 100n) / b.subscription_cap_micro)) : 0,
        },
        karma: { points: b.karma_points.toString() },
      },
      // [balance-cents-compat-2026-05-17] flat cents fields for legacy callers (roboai-engine billing)
      balance_cents: workingCents,
      available_cents: workingCents,
      gift_cents: giftCents,
      tariff: {
        code: b.active_tariff,
        expires_at: b.tariff_expires_at?.toISOString() ?? null,
        started_at: b.tariff_started_at?.toISOString() ?? null,
        auto_renew: b.tariff_auto_renew,
        seats: b.tariff_business_seats_count,
      },
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'failed' }, 500);
  }
});

// ════════════════════════════════════════════════════════
// TARIFF OPTIONS — для marketing.js
// ════════════════════════════════════════════════════════

app.get('/internal/finance/tariff-options', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);

  const balances = await readBalances(userId);
  const current = balances.active_tariff || 'free';

  const options = (['launch', 'boost', 'rocket'] as const).map((code) => {
    const targetPrice = PRICES_MICRO[code];
    const currentPaid = PRICES_MICRO[current] || 0n;
    const isUpgrade = currentPaid > 0n && targetPrice > currentPaid;
    const isSamePaid = currentPaid > 0n && targetPrice === currentPaid;
    const isDowngrade = currentPaid > 0n && targetPrice < currentPaid;
    const cost = isUpgrade ? (targetPrice - currentPaid) : targetPrice;

    let action: 'buy' | 'upgrade' | 'current' | 'locked' = 'buy';
    if (isSamePaid) action = 'current';
    else if (isUpgrade) action = 'upgrade';
    else if (isDowngrade) action = 'locked';

    const totalAvailable = balances.working_micro + balances.subscription_micro;
    return {
      code,
      price_micro: targetPrice.toString(),
      price_usd: Number(targetPrice) / 1e6,
      cost_micro: cost.toString(),
      cost_usd: Number(cost) / 1e6,
      seats: SEATS[code],
      action,
      can_afford: totalAvailable >= cost,
      from_subscription_micro: cost <= balances.subscription_micro
        ? cost.toString() : balances.subscription_micro.toString(),
      from_working_micro: cost <= balances.subscription_micro
        ? '0' : (cost - balances.subscription_micro).toString(),
      shortfall_micro: cost > totalAvailable ? (cost - totalAvailable).toString() : '0',
    };
  });

  return c.json({
    ok: true,
    current,
    balances: {
      working_micro: balances.working_micro.toString(),
      subscription_micro: balances.subscription_micro.toString(),
      total_available_micro: (balances.working_micro + balances.subscription_micro).toString(),
    },
    options,
  });
});

// ════════════════════════════════════════════════════════
// BUY / UPGRADE
// ════════════════════════════════════════════════════════

app.post('/internal/finance/buy-tariff', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const tariff = String(body.tariff || '').toLowerCase();
  const sourcePolicy = String(body.source_policy || 'subscription_first');
  if (!['launch', 'boost', 'rocket'].includes(tariff)) {
    return c.json({ ok: false, reason: 'invalid_tariff' }, 400);
  }
  const r = await buyTariffFromBalance({
    userId,
    tariffCode: tariff as 'launch' | 'boost' | 'rocket',
    sourcePolicy: sourcePolicy as any,
  });
  return c.json(r, r.ok ? 200 : 400);
});

app.post('/internal/finance/upgrade-tariff', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const tariff = String(body.tariff || '').toLowerCase();
  const sourcePolicy = String(body.source_policy || 'subscription_first');
  if (!['launch', 'boost', 'rocket'].includes(tariff)) {
    return c.json({ ok: false, reason: 'invalid_tariff' }, 400);
  }
  const r = await upgradeTariffFromBalance({
    userId,
    tariffCode: tariff as 'launch' | 'boost' | 'rocket',
    sourcePolicy: sourcePolicy as any,
  });
  return c.json(r, r.ok ? 200 : 400);
});

// ════════════════════════════════════════════════════════
// TRANSFER (working ↔ subscription)
// ════════════════════════════════════════════════════════

app.post('/internal/finance/transfer', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const from = String(body.from || '') as Wallet;
  const to = String(body.to || '') as Wallet;
  const amountMicroNum = Number(body.amount_micro || 0);
  if (!from || !to) return c.json({ ok: false, reason: 'wallet_required' }, 400);
  if (!Number.isFinite(amountMicroNum) || amountMicroNum <= 0)
    return c.json({ ok: false, reason: 'amount_must_be_positive' }, 400);
  const amountMicro = BigInt(Math.floor(amountMicroNum));
  const before = await readBalances(userId);
  const fromBal = from === 'working' ? before.working_micro : from === 'subscription' ? before.subscription_micro : 0n;
  if (fromBal < amountMicro)
    return c.json({ ok: false, reason: 'insufficient_funds', have_micro: fromBal.toString(), need_micro: amountMicro.toString() }, 400);
  try {
    await transferBetweenWallets(userId, from, to, amountMicro, `manual transfer ${from}→${to}`);
    return c.json({ ok: true, transferred_micro: amountMicro.toString() });
  } catch (e: any) {
    return c.json({ ok: false, reason: e?.message || 'transfer_failed' }, 400);
  }
});

// ════════════════════════════════════════════════════════
// TRANSACTIONS HISTORY
// ════════════════════════════════════════════════════════

app.get('/internal/finance/transactions', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);
  const rows = (await db.execute(sql`
    SELECT * FROM (
      SELECT 'ledger:' || id::text AS uid, kind, amount_micro, memo, created_at, 'working' AS wallet, NULL::text AS from_wallet, NULL::text AS to_wallet FROM cash_ledger WHERE user_id = ${userId}
      UNION ALL
      SELECT 'xfer:' || id::text AS uid, 'transfer' AS kind, amount_micro, memo, created_at, NULL::text AS wallet, from_wallet, to_wallet FROM wallet_transfers WHERE user_id = ${userId}
      UNION ALL
      SELECT 'karma:' || id::text AS uid, 'karma_' || kind AS kind, points AS amount_micro, memo, created_at, 'karma' AS wallet, NULL::text AS from_wallet, NULL::text AS to_wallet FROM karma_log WHERE user_id = ${userId}
    ) AS combined
    ORDER BY created_at DESC LIMIT ${limit}
  `)) as unknown as any[];
  return c.json({
    ok: true,
    items: rows.map((r) => ({
      uid: r.uid, kind: r.kind,
      amount_micro: String(r.amount_micro), amount_usd: Number(r.amount_micro) / 1e6,
      memo: r.memo, wallet: r.wallet, from_wallet: r.from_wallet, to_wallet: r.to_wallet,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
    })),
  });
});

// ════════════════════════════════════════════════════════
// WITHDRAW
// ════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════
// CRM MANUAL SPEND / REFUND (roboai-engine internal use)
// Working-balance debit/credit via signed cash_ledger entries. Used by
// the CRM manual messenger ($0.05 per outbound) and similar in-platform
// services that need to charge a user's main wallet without touching the
// external withdrawal pipeline.
// ════════════════════════════════════════════════════════

app.post('/internal/finance/spend', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const amountMicroFromCents = body.amount_cents ? Number(body.amount_cents) * 10_000 : 0;
  const amountMicroNum = Number(body.amount_micro || amountMicroFromCents || 0);
  const reason = String(body.reason || '').slice(0, 200);
  const kind = String(body.kind || 'crm_manual_spend').slice(0, 64);
  if (!Number.isFinite(amountMicroNum) || amountMicroNum <= 0)
    return c.json({ ok: false, reason: 'amount_must_be_positive' }, 400);
  const amountMicro = BigInt(Math.floor(amountMicroNum));
  const balances = await readBalances(userId);
  if (balances.working_micro < amountMicro)
    return c.json({ ok: false, reason: 'insufficient_working_balance' }, 400);
  await db.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, ${kind}, ${-Number(amountMicro)}, ${reason})
  `);
  return c.json({ ok: true, spent_micro: amountMicro.toString() });
});

app.post('/internal/finance/credit', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  const body = await c.req.json().catch(() => ({}));
  const amountMicroFromCents = body.amount_cents ? Number(body.amount_cents) * 10_000 : 0;
  const amountMicroNum = Number(body.amount_micro || amountMicroFromCents || 0);
  const reason = String(body.reason || '').slice(0, 200);
  const kind = String(body.kind || 'crm_manual_refund').slice(0, 64);
  if (!Number.isFinite(amountMicroNum) || amountMicroNum <= 0)
    return c.json({ ok: false, reason: 'amount_must_be_positive' }, 400);
  const amountMicro = BigInt(Math.floor(amountMicroNum));
  await db.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, ${kind}, ${Number(amountMicro)}, ${reason})
  `);
  return c.json({ ok: true, credited_micro: amountMicro.toString() });
});

app.post('/internal/finance/withdraw', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
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
  const balances = await readBalances(userId);
  if (balances.working_micro < amountMicro)
    return c.json({ ok: false, reason: 'insufficient_funds' }, 400);
  await db.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, 'withdraw_pending', ${-Number(amountMicro)},
            ${'method=' + method + ' addr=' + address.slice(0, 60)})
  `);
  return c.json({ ok: true, requested_micro: amountMicro.toString() });
});


app.get('/internal/finance/test-placement', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  try {
    const { simulateForUser, buildSimMessage, fmtMicro } = await import('../services/test-placement.js');
    const sim = await simulateForUser(userId);
    const fmt = (t: typeof sim.launch) => ({
      matrix_micro: t.matrix_micro.toString(),
      refs_micro: t.refs_micro.toString(),
      matching_micro: t.matching_micro.toString(),
      total_micro: t.total_micro.toString(),
      total_fmt: fmtMicro(t.total_micro),
      matrix_fmt: fmtMicro(t.matrix_micro),
      refs_fmt: fmtMicro(t.refs_micro),
      matching_fmt: fmtMicro(t.matching_micro),
      team_in_depth: t.team_in_depth,
      team_in_refs: t.team_in_refs,
    });
    return c.json({
      ok: true,
      team_total: sim.team_total,
      team_by_level: sim.team_by_level,
      tariffs: {
        launch: fmt(sim.launch),
        boost: fmt(sim.boost),
        rocket: fmt(sim.rocket),
      },
      message: buildSimMessage(sim),
    });
  } catch (e: any) {
    return c.json({ ok: false, reason: 'sim_failed', error: e.message }, 500);
  }
});

app.get('/internal/finance/karma', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false, reason: 'user_not_found' }, 404);

  // Total karma + this week's earnings + top 10 leaderboard
  const total = (await db.execute(sql`
    SELECT karma_points::bigint AS pts FROM users WHERE id = ${userId}
  `)) as unknown as Array<{ pts: string | number }>;

  const week = (await db.execute(sql`
    SELECT COALESCE(SUM(points), 0)::bigint AS pts
    FROM karma_log
    WHERE user_id = ${userId}
      AND points > 0
      AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')
  `)) as unknown as Array<{ pts: string | number }>;

  const recent = (await db.execute(sql`
    SELECT kind, points, memo, created_at
    FROM karma_log
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 20
  `)) as unknown as any[];

  // Leaderboard: top 10 by current week points
  const leaderboard = (await db.execute(sql`
    SELECT user_id, SUM(points)::bigint AS pts
    FROM karma_log
    WHERE points > 0
      AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')
    GROUP BY user_id
    ORDER BY SUM(points) DESC
    LIMIT 10
  `)) as unknown as Array<{ user_id: number; pts: string | number }>;

  // Find user's rank in leaderboard
  let myRank: number | null = null;
  for (let i = 0; i < leaderboard.length; i++) {
    if (Number(leaderboard[i].user_id) === userId) { myRank = i + 1; break; }
  }

  // Last raffle winners
  const lastRaffle = (await db.execute(sql`
    SELECT r.id, r.week_start, r.week_end, r.prize_pool_micro, r.drawn_at, r.winners_count
    FROM karma_raffles r
    WHERE r.status = 'completed'
    ORDER BY r.week_start DESC LIMIT 1
  `)) as unknown as Array<any>;

  let lastWinners: any[] = [];
  if (lastRaffle[0]) {
    lastWinners = (await db.execute(sql`
      SELECT position, user_id, karma_points_at_draw, prize_micro
      FROM karma_raffle_winners
      WHERE raffle_id = ${lastRaffle[0].id}
      ORDER BY position
    `)) as unknown as any[];
  }

  return c.json({
    ok: true,
    karma: {
      total: String(total[0]?.pts ?? 0),
      this_week: String(week[0]?.pts ?? 0),
      my_rank: myRank,
    },
    recent: recent.map(r => ({
      kind: r.kind, points: String(r.points), memo: r.memo, created_at: r.created_at,
    })),
    leaderboard: leaderboard.map((l, i) => ({
      rank: i + 1, user_id: l.user_id, points: String(l.pts),
    })),
    last_raffle: lastRaffle[0] ? {
      week_start: lastRaffle[0].week_start,
      week_end: lastRaffle[0].week_end,
      prize_pool_usd: Number(lastRaffle[0].prize_pool_micro) / 1e6,
      drawn_at: lastRaffle[0].drawn_at,
      winners: lastWinners.map(w => ({
        rank: w.position, user_id: w.user_id,
        karma: String(w.karma_points_at_draw),
        prize_usd: Number(w.prize_micro) / 1e6,
      })),
    } : null,
  });
});

// ════════════════════════════════════════════════════════
// NOTIFICATIONS
// ════════════════════════════════════════════════════════

app.get('/internal/notifications', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
  const limit = Math.min(Number(c.req.query('limit') || 50), 200);
  const unreadOnly = c.req.query('unread') === '1';
  const rows = (await db.execute(sql`
    SELECT id, kind, severity, title, body, url, meta, read_at, created_at
    FROM notifications_inbox
    WHERE user_id = ${userId}
      ${unreadOnly ? sql`AND read_at IS NULL` : sql``}
    ORDER BY created_at DESC LIMIT ${limit}
  `)) as unknown as any[];
  return c.json({
    ok: true,
    items: rows.map((r) => ({
      id: String(r.id), kind: r.kind, severity: r.severity, title: r.title,
      body: r.body, url: r.url, meta: r.meta,
      is_read: !!r.read_at, read_at: r.read_at, created_at: r.created_at,
    })),
  });
});

app.get('/internal/notifications/unread-count', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
  const r = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM notifications_inbox WHERE user_id = ${userId} AND read_at IS NULL
  `)) as unknown as Array<{ n: number }>;
  return c.json({ ok: true, count: r[0]?.n || 0 });
});

app.post('/internal/notifications/:id/read', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, reason: 'bad_id' }, 400);
  await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE id = ${id} AND user_id = ${userId} AND read_at IS NULL
  `);
  return c.json({ ok: true });
});

app.post('/internal/notifications/read-all', async (c) => {
  const userId = await resolveUserId(c);
  if (!userId) return c.json({ ok: false }, 404);
  const r = (await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE user_id = ${userId} AND read_at IS NULL
    RETURNING id
  `)) as unknown as any[];
  return c.json({ ok: true, marked: r.length });
});


// ─────────────────────────────────────────────────────────────────
// /internal/finance/exchange-execute
// ─────────────────────────────────────────────────────────────────
// Atomic settlement of a P2P TRDX-for-USD trade originated in cabinet.
//
// Cabinet flow:
//   1. Buyer hits POST /api/trdx-exchange/listings/:id/buy
//   2. Cabinet writes trdx_trades row (status='completed')
//      and credits TRDX to buyer in its local state.json
//   3. Cabinet POSTs to this endpoint to settle the USD leg
//   4. We move USD: buyer.working - total → seller.working + 70% + upline
//      10 levels + project + pool, all in one Postgres TX
//
// Idempotent on trade_id (cabinet's autoincrement).
// Body: {
//   buyer_email, seller_email_or_id, total_micro, seller_share_micro,
//   amount_trdx_micro, trade_id
// }
// Distribution (mirrors marketplace shop-split):
//   70%  → seller (via applyIncomeSplit so it respects 80/20 wallets)
//   10%  → admin user (kind=p2p_project_share, no split)
//    5%  → admin user (kind=p2p_pool_share, no split)
//   7.5% → admin user (kind=p2p_matrix_deferred, no split — released on launch)
//   7.5% → buyer's inviter chain, 10 levels at decreasing fractions
//          (L1=7/15, L2=2/15, L3=1.5/15, L4-5=1/15, L6-10=0.5/15)

const UPLINE_FRAC_NUM = [7, 2, 1.5, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5];
const UPLINE_FRAC_DEN = 15;

// [p2p-boot-ddl-2026-05-14] make sure idempotency table exists even if
// drizzle-kit migrate didn't pick up 0100_p2p_processed_trades.sql
db.execute(sql`
  CREATE TABLE IF NOT EXISTS p2p_processed_trades (
    trade_id BIGINT PRIMARY KEY,
    buyer_user_id INTEGER NOT NULL REFERENCES users(id),
    seller_user_id INTEGER NOT NULL REFERENCES users(id),
    total_micro BIGINT NOT NULL,
    amount_trdx_micro BIGINT NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch((e) => console.error('[p2p-ddl]', e?.message));

app.post('/internal/finance/exchange-execute', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, reason: 'invalid_json' }, 400);
  }

  const tradeId = Number(body.trade_id);
  const totalMicro = BigInt(body.total_micro || 0);
  const sellerShareMicro = BigInt(body.seller_share_micro || 0);
  const amountTrdxMicro = BigInt(body.amount_trdx_micro || 0);

  if (!tradeId || totalMicro <= 0n || sellerShareMicro <= 0n) {
    return c.json({ ok: false, reason: 'invalid_amounts' }, 400);
  }

  // Resolve buyer + seller user_ids
  const buyerEmail = String(body.buyer_email || '').trim().toLowerCase();
  const sellerIdInput = Number(body.seller_user_id || 0);
  const sellerEmail = String(body.seller_email || '').trim().toLowerCase();

  let buyerId: number | null = null;
  let sellerId: number | null = sellerIdInput > 0 ? sellerIdInput : null;

  if (buyerEmail) {
    // Same parsing as resolveUserId
    const m = buyerEmail.match(/^tg(\d+)@trendex\.bot$/);
    if (m) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${Number(m[1])} LIMIT 1`)) as any[];
      if (r[0]?.id) buyerId = Number(r[0].id);
    } else {
      // Generic email lookup (if Trendex stores plain email anywhere — for now stub)
      const r = (await db.execute(sql`SELECT id FROM users WHERE LOWER(tg_username) = ${buyerEmail.split('@')[0]} LIMIT 1`)) as any[];
      if (r[0]?.id) buyerId = Number(r[0].id);
    }
  }
  if (!sellerId && sellerEmail) {
    const m = sellerEmail.match(/^tg(\d+)@trendex\.bot$/);
    if (m) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${Number(m[1])} LIMIT 1`)) as any[];
      if (r[0]?.id) sellerId = Number(r[0].id);
    }
  }

  if (!buyerId || !sellerId) {
    return c.json({ ok: false, reason: 'user_not_found', buyerId, sellerId }, 404);
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Idempotency: first INSERT wins; second throws PK conflict
      try {
        await tx.execute(sql`
          INSERT INTO p2p_processed_trades (trade_id, buyer_user_id, seller_user_id, total_micro, amount_trdx_micro)
          VALUES (${tradeId}, ${buyerId}, ${sellerId}, ${Number(totalMicro)}, ${Number(amountTrdxMicro)})
        `);
      } catch (e: any) {
        if (String(e?.message || '').includes('duplicate key') || String(e?.code || '') === '23505') {
          throw new Error('already_processed');
        }
        throw e;
      }

      // Lock buyer row to compute working balance under lock
      await tx.execute(sql`SELECT id FROM users WHERE id = ${buyerId} FOR UPDATE`);
      const buyerWorkRow = (await tx.execute(sql`
        SELECT COALESCE(SUM(amount_micro), 0)::bigint AS work FROM cash_ledger WHERE user_id = ${buyerId}
      `)) as any[];
      const buyerWorking = BigInt(buyerWorkRow[0]?.work ?? 0);
      if (buyerWorking < totalMicro) {
        throw new Error('insufficient_working');
      }

      // 1. Debit buyer
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
        VALUES (${buyerId}, 'p2p_exchange_buy', ${-Number(totalMicro)}, ${sellerId}, ${'p2p_trade_' + tradeId})
      `);

      // 2. Credit seller 70% + apply 80/20 income split
      const sellerLedgerRes = (await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
        VALUES (${sellerId}, 'p2p_seller_share', ${Number(sellerShareMicro)}, ${buyerId}, ${'p2p_trade_' + tradeId})
        RETURNING id
      `)) as any[];
      await applyIncomeSplit(tx as any, sellerId!, sellerShareMicro, 'p2p_seller_share', sellerLedgerRes[0]?.id ?? null);

      // 3. Walk inviter chain — 10 levels of buyer upline
      const NON_SELLER = totalMicro - sellerShareMicro;          // 30% total
      const linearMicro = NON_SELLER * 75n / 300n;               // 7.5% of total
      const projectMicro = NON_SELLER * 100n / 300n;             // 10% of total
      const poolMicro = NON_SELLER * 50n / 300n;                 // 5% of total
      const matrixMicro = NON_SELLER * 75n / 300n;               // 7.5% of total

      let cur = buyerId;
      let distributedLinear = 0n;
      for (let level = 1; level <= 10; level++) {
        const upRow = (await tx.execute(sql`SELECT invited_by_user_id FROM users WHERE id = ${cur} LIMIT 1`)) as any[];
        const upId = upRow[0]?.invited_by_user_id ? Number(upRow[0].invited_by_user_id) : null;
        if (!upId) break;
        const shareNum = UPLINE_FRAC_NUM[level - 1];
        // Avoid bigint fractional: micro * shareNum*100 / (15*100) to keep integer math
        const shareMicro = linearMicro * BigInt(Math.round(shareNum * 100)) / BigInt(UPLINE_FRAC_DEN * 100);
        if (shareMicro > 0n) {
          const ledger = (await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, level, memo)
            VALUES (${upId}, ${'p2p_upline_l' + level}, ${Number(shareMicro)}, ${buyerId}, ${level}, ${'p2p_trade_' + tradeId})
            RETURNING id
          `)) as any[];
          await applyIncomeSplit(tx as any, upId, shareMicro, 'p2p_upline_l' + level, ledger[0]?.id ?? null);
          distributedLinear += shareMicro;
        }
        cur = upId;
      }

      // 4. Find admin user (matrix position 0) for project / pool / matrix_deferred
      const adminRow = (await tx.execute(sql`SELECT user_id FROM matrix_positions WHERE position = 0 LIMIT 1`)) as any[];
      const adminId = adminRow[0]?.user_id ? Number(adminRow[0].user_id) : null;

      // Unfilled linear levels collapse into project
      const projectTotal = projectMicro + (linearMicro - distributedLinear);

      if (adminId) {
        if (projectTotal > 0n) {
          await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
            VALUES (${adminId}, 'p2p_project_share', ${Number(projectTotal)}, ${buyerId}, ${'p2p_trade_' + tradeId})
          `);
        }
        if (poolMicro > 0n) {
          await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
            VALUES (${adminId}, 'p2p_pool_share', ${Number(poolMicro)}, ${buyerId}, ${'p2p_trade_' + tradeId})
          `);
        }
        if (matrixMicro > 0n) {
          await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
            VALUES (${adminId}, 'p2p_matrix_deferred', ${Number(matrixMicro)}, ${buyerId}, ${'p2p_trade_' + tradeId})
          `);
        }
      }

      return {
        ok: true,
        trade_id: tradeId,
        buyer_id: buyerId,
        seller_id: sellerId,
        seller_received_micro: Number(sellerShareMicro),
        linear_distributed_micro: Number(distributedLinear),
        project_micro: Number(projectTotal),
        pool_micro: Number(poolMicro),
        matrix_deferred_micro: Number(matrixMicro),
      };
    });
    return c.json(result);
  } catch (e: any) {
    const msg = String(e?.message || 'unknown');
    if (msg === 'already_processed') return c.json({ ok: false, reason: 'already_processed' }, 409);
    if (msg === 'insufficient_working') return c.json({ ok: false, reason: 'insufficient_working' }, 400);
    console.error('[exchange-execute]', e);
    return c.json({ ok: false, reason: msg }, 500);
  }
});


export default app;
