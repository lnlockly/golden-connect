/**
 * /internal/finance/roboai-charge — atomic per-message billing for roboai-engine.
 *
 * Auth: header `x-trendex-secret: <INTERNAL_API_SECRET>`.
 *
 * Single transaction does:
 *   1. Debit advertiser.gift_balance_micro by total_micro (fail if insufficient).
 *   2. Credit account_owner via splitIncome (80/20 → working/subscription).
 *   3. Distribute MLM 10-lvl on advertiser's chain, scaled to mlm_budget_micro.
 *   4. Credit company_share_micro to admin user (working).
 *
 * Idempotency: (source_kind, source_id) — second call with same id returns the
 *              previous result (ok=true, ref=...). Implemented via the
 *              idempotency_log table (see migration). If idempotency_log isn't
 *              ready yet, we rely on referralAccruals' UNIQUE constraint.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { splitIncome } from '../services/balances.js';
import { accrueFromEntry } from '../services/referrals-10lvl.js';
import { accrueFromReferral as matchingBonusAccrue } from '../services/matching-bonus.js';

const app = new Hono();
app.use('/internal/finance/roboai-charge', requireInternalSecret);

// 30.4% sum of the 10-lvl curve (PPM).
const CURVE_SUM_PPM = 304_000n;
const PPM = 1_000_000n;

interface RoboaiChargeBody {
  advertiser_user_id?: number;
  account_owner_user_id?: number;
  total_micro?: number;
  owner_share_micro?: number;
  mlm_budget_micro?: number;
  company_share_micro?: number;
  source_kind?: string;
  source_id?: number;
}

app.post('/internal/finance/roboai-charge', async (c) => {
  let body: RoboaiChargeBody = {};
  try { body = await c.req.json(); } catch { /* empty */ }

  const advertiserUserId       = Number(body.advertiser_user_id ?? 0);
  const accountOwnerUserId     = Number(body.account_owner_user_id ?? 0);
  const totalMicro             = BigInt(body.total_micro ?? 0);
  const ownerShareMicro        = BigInt(body.owner_share_micro ?? 0);
  const mlmBudgetMicro         = BigInt(body.mlm_budget_micro ?? 0);
  const companyShareMicro      = BigInt(body.company_share_micro ?? 0);
  const sourceKind             = String(body.source_kind ?? '').slice(0, 64);
  const sourceId               = Number(body.source_id ?? 0);

  if (!advertiserUserId || !accountOwnerUserId) {
    return c.json({ ok: false, reason: 'missing_user_ids' }, 400);
  }
  if (totalMicro <= 0n) {
    return c.json({ ok: false, reason: 'invalid_total' }, 400);
  }
  if (!sourceKind.startsWith('roboai_')) {
    return c.json({ ok: false, reason: 'source_kind_must_be_roboai_*' }, 400);
  }
  if (!sourceId) {
    return c.json({ ok: false, reason: 'missing_source_id' }, 400);
  }
  // Sanity: shares must sum to total within ±1 micro.
  const sumShares = ownerShareMicro + mlmBudgetMicro + companyShareMicro;
  const drift = sumShares > totalMicro ? sumShares - totalMicro : totalMicro - sumShares;
  if (drift > 1n) {
    return c.json({ ok: false, reason: 'shares_dont_sum_to_total', drift: drift.toString() }, 400);
  }

  // 30.4%-curve scale: pass entryMicro so that 30.4% of it == mlm_budget_micro.
  // entryMicro = mlm_budget_micro * 1_000_000 / 304_000
  const mlmEntryMicro = mlmBudgetMicro > 0n
    ? (mlmBudgetMicro * PPM) / CURVE_SUM_PPM
    : 0n;

  let chargeRef: string | null = null;
  let partnerChainDepth = 0;
  let paidLevels = 0;

  try {
    await db.transaction(async (tx) => {
      // 1. Idempotency check via cash_ledger memo containing the source ref.
      // Stronger gate: look for any cash_ledger row tagged with this source_id+kind.
      const idempRows = (await tx.execute(sql`
        SELECT id FROM cash_ledger
        WHERE memo = ${'roboai_charge:' + sourceKind + ':' + sourceId}
        LIMIT 1
      `)) as Array<{ id: number }>;
      if (idempRows[0]?.id) {
        chargeRef = 'replay:' + idempRows[0].id;
        return;
      }

      // 2. Lock advertiser row, validate gift balance.
      const advRows = (await tx.execute(sql`
        SELECT id, gift_balance_micro::bigint AS gift
        FROM users
        WHERE id = ${advertiserUserId}
        FOR UPDATE
      `)) as Array<{ id: number; gift: string | number }>;
      if (!advRows[0]) {
        throw new Error('advertiser_not_found');
      }
      const giftBal = BigInt(advRows[0].gift ?? 0);
      if (giftBal < totalMicro) {
        throw new Error('insufficient_gift');
      }

      // 3. Debit advertiser.gift_balance_micro.
      await tx.execute(sql`
        UPDATE users
        SET gift_balance_micro = gift_balance_micro - ${Number(totalMicro)}
        WHERE id = ${advertiserUserId}
      `);
      // Mirror in cash_ledger for audit (negative gift-debit row).
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
        VALUES (
          ${advertiserUserId},
          ${'roboai_spend'},
          ${-Number(totalMicro)},
          ${accountOwnerUserId},
          ${'roboai_charge:' + sourceKind + ':' + sourceId}
        )
      `);

      // 4. Credit account-owner with splitIncome (80/20).
      if (ownerShareMicro > 0n) {
        await splitIncome(
          accountOwnerUserId,
          ownerShareMicro,
          'roboai_account_revenue',
          sourceId,
          'roboai_charge:' + sourceKind + ':' + sourceId,
        );
      }

      // 5. MLM 10-lvl on advertiser's chain, scaled to mlm_budget_micro.
      if (mlmEntryMicro > 0n) {
        const refRes = await accrueFromEntry(
          advertiserUserId,
          mlmEntryMicro,
          { kind: sourceKind, id: sourceId },
          tx as any,
        );
        partnerChainDepth = refRes.chainDepth;
        paidLevels = refRes.paidLevels;
        // Matching bonus on each ref entry.
        for (const refEntry of refRes.entries) {
          try {
            await matchingBonusAccrue(
              refEntry.recipientUserId,
              refEntry.amountMicro,
              refEntry.ledgerId,
              tx as any,
            );
          } catch (e) {
            // matching-bonus is opt-in; failure shouldn't break charge.
            console.warn('[roboai-charge] matching_bonus failed:', (e as Error).message);
          }
        }
      }

      // 6. Credit company share to admin user (ref_code='admin').
      if (companyShareMicro > 0n) {
        const adminRows = (await tx.execute(sql`
          SELECT id FROM users WHERE ref_code = 'admin' LIMIT 1
        `)) as Array<{ id: number }>;
        if (adminRows[0]?.id) {
          await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
            VALUES (
              ${adminRows[0].id},
              ${'roboai_company_fee'},
              ${Number(companyShareMicro)},
              ${advertiserUserId},
              ${'roboai_charge:' + sourceKind + ':' + sourceId}
            )
          `);
        }
      }

      chargeRef = 'roboai:' + sourceKind + ':' + sourceId;
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === 'insufficient_gift') {
      return c.json({ ok: false, reason: 'insufficient_gift' }, 200);
    }
    if (msg === 'advertiser_not_found') {
      return c.json({ ok: false, reason: 'advertiser_not_found' }, 404);
    }
    console.error('[roboai-charge] failed', msg, e);
    return c.json({ ok: false, reason: 'internal_error', detail: msg }, 500);
  }

  return c.json({
    ok: true,
    charge_ref: chargeRef,
    partner_chain_depth: partnerChainDepth,
    paid_levels: paidLevels,
  });
});

export default app;
