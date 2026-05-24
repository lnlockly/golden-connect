import { sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { cashLedger, matchingBonusLedger } from '../db/schema.js';
import { applyIncomeSplit } from './income-split.js';

/**
 * Matching Bonus — Marketing v2 (2026-04).
 *
 * Exclusive to ROCKET-tier holders. When any of the receiver's L1..L3
 * referrals earns a partner (ref_Lx) accrual, the receiver gets 10% of
 * that amount on top — a cut of their downline's referral income.
 *
 * Eligibility gate mirrors referrals-10lvl: has at least one active seat
 * tied to a tariff with `has_matching_bonus = true`. Only ROCKET seats
 * qualify in the current seed (migration 0012).
 *
 * Idempotency: `source_flow_ledger_id` uniquely keys a bonus per source
 * accrual; the writer raises on duplicate inserts.
 *
 * Accounting: the 10% comes out of the same 30% ref budget already
 * distributed — it's an "on top" payout, which means the platform
 * underwrites it. The admin_fee bucket on each entry absorbs the
 * rounding/short-chain leftovers; there is no entry-level debit for
 * matching bonus yet (monitor flow_ledger totals if this matters).
 */

const MATCHING_BONUS_BP = 1000; // 10% expressed in basis points (10000 = 100%)
const MAX_LINE_DEPTH = 3;

export interface MatchingBonusEntry {
  userId: number;
  fromUserId: number;
  lineDepth: number;
  amountMicro: bigint;
  matchingLedgerId: number;
  cashLedgerId: number;
}

export interface MatchingBonusResult {
  entries: MatchingBonusEntry[];
  totalPaidMicro: bigint;
}

/**
 * Walk up to 3 ancestors from `fromUserId` and flag each with their
 * ROCKET-tier eligibility (i.e. any active business seat whose tariff
 * has `has_matching_bonus = true`).
 */
async function findRocketAncestors(
  tx: DB,
  fromUserId: number,
): Promise<Array<{ id: number; lineDepth: number }>> {
  const rows = await tx.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT ie.parent_user_id AS id, 1 AS lvl
      FROM invite_edges ie
      WHERE ie.child_user_id = ${fromUserId}
        AND ie.parent_user_id <> ie.child_user_id
      UNION ALL
      SELECT ie.parent_user_id, c.lvl + 1
      FROM invite_edges ie
      JOIN chain c ON ie.child_user_id = c.id
      WHERE c.lvl < ${MAX_LINE_DEPTH}
        AND ie.parent_user_id <> ie.child_user_id
    )
    SELECT c.id, c.lvl
    FROM chain c
    WHERE EXISTS (
      SELECT 1 FROM business_seats bs
      JOIN tariffs t ON bs.tariff_id = t.id
      WHERE bs.user_id = c.id
        AND bs.deactivated_at IS NULL
        AND t.has_matching_bonus = true
    )
    ORDER BY c.lvl ASC
  `);
  return rows.map((r) => {
    const rr = r as { id: number; lvl: number };
    return { id: Number(rr.id), lineDepth: Number(rr.lvl) };
  });
}

/**
 * Pay 10% matching bonus to every ROCKET-tier ancestor on L1..L3 of
 * `fromUserId` for a given source ref accrual. Writes to cash_ledger +
 * matching_bonus_ledger for each bonus row.
 *
 * @param fromUserId  the downline who just earned the referral accrual
 * @param amountMicro the original ref accrual amount (10% is taken of this)
 * @param sourceFlowLedgerId the cash_ledger.id of the triggering ref row
 *                           (used as the idempotency key)
 */
export async function accrueFromReferral(
  fromUserId: number,
  amountMicro: bigint,
  sourceFlowLedgerId: number,
  tx: DB = db,
): Promise<MatchingBonusResult> {
  if (amountMicro <= 0n) {
    return { entries: [], totalPaidMicro: 0n };
  }

  const bonusPerHolderMicro = (amountMicro * BigInt(MATCHING_BONUS_BP)) / 10_000n;
  if (bonusPerHolderMicro <= 0n) {
    return { entries: [], totalPaidMicro: 0n };
  }

  const run = async (txx: DB): Promise<MatchingBonusResult> => {
    const ancestors = await findRocketAncestors(txx, fromUserId);
    if (ancestors.length === 0) {
      return { entries: [], totalPaidMicro: 0n };
    }

    const entries: MatchingBonusEntry[] = [];
    let totalPaidMicro = 0n;
    const memo = `matching_bonus:src_ledger:${sourceFlowLedgerId}`;

    for (const { id: ancestorId, lineDepth } of ancestors) {
      const [ledgerRow] = await txx
        .insert(cashLedger)
        .values({
          userId: ancestorId,
          kind: 'matching_bonus',
          amountMicro: bonusPerHolderMicro,
          relatedUserId: fromUserId,
          level: lineDepth,
          memo,
        })
        .returning({ id: cashLedger.id });

      // 80/20 split: matching bonus also accumulates 20% to subscription
      await applyIncomeSplit(txx as unknown as DB, ancestorId, bonusPerHolderMicro, 'matching_bonus');


      const [matchingRow] = await txx
        .insert(matchingBonusLedger)
        .values({
          userId: ancestorId,
          fromUserId,
          lineDepth,
          sourceFlowLedgerId: BigInt(sourceFlowLedgerId),
          amountMicro: bonusPerHolderMicro,
        })
        .returning({ id: matchingBonusLedger.id });

      entries.push({
        userId: ancestorId,
        fromUserId,
        lineDepth,
        amountMicro: bonusPerHolderMicro,
        matchingLedgerId: matchingRow.id,
        cashLedgerId: ledgerRow.id,
      });
      totalPaidMicro += bonusPerHolderMicro;
    }

    return { entries, totalPaidMicro };
  };

  if (tx === db) {
    return await db.transaction(async (inner) => run(inner as unknown as DB));
  }
  return run(tx);
}
