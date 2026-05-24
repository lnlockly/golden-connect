// Hono sub-app: /api/monar/*. Read + calc + real writes.
// Activation:
//   src/db/schema.ts → export * from '../monar/schema.js';
//   src/server.ts    → app.route('/api/monar', monarRoutes);

import { Hono } from 'hono';
import { adsAllowanceFor } from './ads.js';
import { CREDIT_LOT_USD, LOT_SPECS, LOT_USD, LotUsd, networkingCoefOf } from './rules.js';
import { distributeLotPurchase, distributePlaceEntry, distributeLotClosure } from './distribute.js';
import { distributeMonthlyPool, decideAutoActivate, periodOf } from './world-pool.js';
import { distributeNetworkingFund, NetworkingParticipant } from './networking.js';
import { planClosureReinvest } from './reinvest.js';
import { checkWithdrawEligibility, withdrawExampleFor } from './withdraw.js';
import { weeklyFeeCents } from './abonentka.js';
import {
  applyEntry,
  buyLot,
  chargeAbonentkaDue,
  checkBalanceInvariants,
  grantCreditLotIfAbsent,
  settleWorldPool,
  withdraw,
} from './repo.js';

const monarRoutes = new Hono();

// -------------------------------------------------------------------------
// READ-ONLY: rules / lookups
// -------------------------------------------------------------------------

monarRoutes.get('/health', (c) =>
  c.json({ ok: true, module: 'monar', status: 'live' }),
);

monarRoutes.get('/rules', (c) =>
  c.json({
    ok: true,
    lots: LOT_USD,
    specs: LOT_SPECS,
    creditLotUsd: CREDIT_LOT_USD,
  }),
);

monarRoutes.get('/lot/:lotUsd', (c) => {
  const lotUsd = Number(c.req.param('lotUsd')) as LotUsd;
  const spec = LOT_SPECS[lotUsd];
  if (!spec) return c.json({ ok: false, error: 'unknown_lot' }, 404);
  return c.json({
    ok: true,
    spec,
    abonentkaWeeklyCents: weeklyFeeCents(lotUsd),
    networkingCoef: networkingCoefOf(lotUsd),
    ads: adsAllowanceFor(lotUsd),
    withdrawExample: withdrawExampleFor(lotUsd),
  });
});

// -------------------------------------------------------------------------
// READ-ONLY: pure calculators (no DB)
// -------------------------------------------------------------------------

monarRoutes.post('/calc/lot-purchase', async (c) => {
  const body = await c.req.json<{ userId: number; lotUsd: LotUsd }>();
  if (!LOT_SPECS[body.lotUsd]) return c.json({ ok: false, error: 'unknown_lot' }, 400);
  return c.json({ ok: true, split: distributeLotPurchase(body) });
});

monarRoutes.post('/calc/place-entry', async (c) => {
  const body = await c.req.json<{ ownerUserId: number; uplineUserIds: number[]; entryIndex: 1 | 2 }>();
  return c.json({ ok: true, distribution: distributePlaceEntry(body) });
});

monarRoutes.post('/calc/lot-closure', async (c) => {
  const body = await c.req.json<{ userId: number; lotUsd: LotUsd }>();
  if (!LOT_SPECS[body.lotUsd]) return c.json({ ok: false, error: 'unknown_lot' }, 400);
  const payout = distributeLotClosure(body);
  const reinvest = planClosureReinvest({ doubledProceedsCents: payout.totalProceedsCents });
  return c.json({ ok: true, payout, reinvest });
});

monarRoutes.post('/calc/withdraw-eligibility', async (c) => {
  const body = await c.req.json<{ lastClosedLotProceedsCents: number | null; newLotsActivatedSinceCents: number }>();
  return c.json({ ok: true, ...checkWithdrawEligibility(body) });
});

monarRoutes.post('/calc/world-pool', async (c) => {
  const body = await c.req.json<{ totalCents: number; participants: Array<{ userId: number; lotUsd: LotUsd; weight?: number }> }>();
  const buckets = distributeMonthlyPool(
    { period: periodOf(new Date()), totalCents: body.totalCents },
    body.participants,
  );
  return c.json({ ok: true, buckets });
});

monarRoutes.post('/calc/world-pool/auto-activate', async (c) => {
  const body = await c.req.json<{ userId: number; amountCents: number }>();
  return c.json({ ok: true, ...decideAutoActivate(body) });
});

monarRoutes.post('/calc/networking', async (c) => {
  const body = await c.req.json<{ fundCents: number; participants: NetworkingParticipant[] }>();
  const payouts = distributeNetworkingFund(body.fundCents, body.participants);
  return c.json({ ok: true, payouts, scoredCount: payouts.length });
});

// -------------------------------------------------------------------------
// WRITE: real DB-backed operations
// -------------------------------------------------------------------------

monarRoutes.post('/lots', async (c) => {
  const body = await c.req.json<{ userId: number; lotUsd: LotUsd; payFromTopup?: boolean }>();
  if (!LOT_SPECS[body.lotUsd]) return c.json({ ok: false, error: 'unknown_lot' }, 400);
  try {
    const out = await buyLot({
      userId: body.userId,
      lotUsd: body.lotUsd,
      payFromTopup: body.payFromTopup !== false,
    });
    return c.json({ ok: true, ...out });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 400);
  }
});

monarRoutes.post('/entries', async (c) => {
  // Apply one $10 entry to the global queue head.
  // Used by external trigger (front-end action, cron, etc).
  try {
    const out = await applyEntry();
    if (!out) return c.json({ ok: false, error: 'queue_empty_or_head_full' }, 409);
    return c.json({ ok: true, ...out });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

monarRoutes.post('/withdraw', async (c) => {
  const body = await c.req.json<{ userId: number; amountCents: number }>();
  try {
    const out = await withdraw(body);
    return c.json(out, out.ok ? 200 : 400);
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

monarRoutes.post('/credit-lot/grant', async (c) => {
  const body = await c.req.json<{ userId: number }>();
  try {
    const granted = await grantCreditLotIfAbsent(body.userId);
    return c.json({ ok: true, granted, alreadyGranted: !granted });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

monarRoutes.post('/admin/world-pool/settle', async (c) => {
  const body = await c.req.json<{ period: string }>();
  try {
    const out = await settleWorldPool(body);
    return c.json({ ok: true, ...out });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 400);
  }
});

monarRoutes.post('/admin/abonentka/charge', async (c) => {
  try {
    const out = await chargeAbonentkaDue();
    return c.json({ ok: true, ...out });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

monarRoutes.get('/admin/invariants', async (c) => {
  try {
    const out = await checkBalanceInvariants();
    return c.json(out, out.ok ? 200 : 500);
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

export default monarRoutes;
