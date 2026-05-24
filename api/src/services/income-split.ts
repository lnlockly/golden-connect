/**
 * Income split helper — applies the 80/20 working/subscription split
 * AFTER an income cash_ledger row is inserted, without touching the
 * original insertion code.
 *
 * Pattern: each income service inserts a positive cash_ledger row (e.g.
 * task_reward $0.50). Right after that insert, the service calls
 * applyIncomeSplit() which:
 *
 *   1. Reads user's tariff + subscription cap + current sub balance
 *   2. Computes the wanted split (default 20%, capped to room-to-cap)
 *   3. Inserts a NEGATIVE cash_ledger row with kind='subscription_split'
 *      (so working balance = SUM(cash_ledger) ends up at 80% of original)
 *   4. UPDATEs users.subscription_balance_micro += same amount
 *
 * Net effect:
 *   • working balance: +0.80 × amount  (full +amount, then -split offset)
 *   • subscription balance: +0.20 × amount (capped)
 *   • Daily cap (sums positive entries only) sees +full amount → cap correct
 *   • Audit trail intact — all entries visible in cash_ledger
 *
 * If subscription cap is reached, splitMicro=0 and nothing extra is written.
 */

import { sql } from 'drizzle-orm';
import type { DB } from '../db/client.js';

export const SPLIT_PCT_DEFAULT = 20n;
export const CAPS_DEFAULT_MICRO: Record<string, bigint> = {
  free: 45_000_000n,
  launch: 15_000_000n,
  boost: 30_000_000n,
  rocket: 45_000_000n,
};

/**
 * Skip kinds where the 20% split should NOT apply:
 *  - subscription_split: would recurse infinitely
 *  - withdraw_*, entry_fee_*: NEGATIVE entries already
 *  - admin_fee: not user income
 *  - task_pool_fund: pool, not user
 *  - gift_*: gift balance has its own model
 *  - karma_*: karma is non-USD
 */
export const SKIP_KINDS = new Set<string>([
  'subscription_split',
  'admin_fee',
  'task_pool_fund',
]);

export function shouldSkip(kind: string, amountMicro: bigint): boolean {
  if (amountMicro <= 0n) return true;
  if (SKIP_KINDS.has(kind)) return true;
  if (kind.startsWith('withdraw')) return true;
  if (kind.startsWith('entry_fee')) return true;
  if (kind.startsWith('gift_')) return true;
  if (kind.startsWith('karma_')) return true;
  return false;
}

export interface ApplySplitResult {
  /** Amount moved into subscription (0 if skipped or cap reached). */
  toSubscriptionMicro: bigint;
  /** Effective working credit after split. */
  toWorkingMicro: bigint;
  /** True when subscription cap was reached during this op. */
  capReached: boolean;
  /** True when the income kind was filtered out (no split applied). */
  skipped: boolean;
}

/**
 * Apply 80/20 split AFTER a positive income cash_ledger insert.
 *
 * @param tx           Drizzle transaction or db root — must be the same
 *                     tx that wrote the original income row, so the split
 *                     entry rolls back together if the caller throws.
 * @param userId       Recipient.
 * @param amountMicro  Original positive amount (>0).
 * @param kind         The kind that was just written (used for filtering
 *                     and memo provenance).
 * @param relatedLedgerId  Optional id of the original cash_ledger row;
 *                         stored in memo for forensic traceability.
 */
export async function applyIncomeSplit(
  tx: DB,
  userId: number,
  amountMicro: bigint,
  kind: string,
  relatedLedgerId?: number | null,
): Promise<ApplySplitResult> {
  if (shouldSkip(kind, amountMicro)) {
    return { toSubscriptionMicro: 0n, toWorkingMicro: amountMicro, capReached: false, skipped: true };
  }

  // Single round-trip: tariff + sub bal + cap config.
  // SELECT FOR UPDATE on users locks the row for the rest of the caller's
  // transaction — concurrent income writes for the same user serialize on
  // this lock, so two simultaneous splits cannot both read pre-cap balance
  // and both push past the cap. subscription_caps row is reference data
  // (one row per tariff, never updated mid-tx) so we don't lock it.
  const r = (await tx.execute(sql`
    SELECT
      u.active_tariff_code AS tariff,
      u.subscription_balance_micro::bigint AS sub_bal,
      c.cap_micro::bigint AS cap_micro,
      c.split_percent
    FROM users u
    LEFT JOIN subscription_caps c ON c.tariff_code = u.active_tariff_code
    WHERE u.id = ${userId}
    LIMIT 1
    FOR UPDATE OF u
  `)) as unknown as Array<{
    tariff: string | null;
    sub_bal: string | number | null;
    cap_micro: string | number | null;
    split_percent: number | null;
  }>;

  if (!r[0]) {
    return { toSubscriptionMicro: 0n, toWorkingMicro: amountMicro, capReached: false, skipped: true };
  }

  const tariff = r[0].tariff || 'free';
  const subBal = BigInt(r[0].sub_bal ?? 0);
  const capMicro = r[0].cap_micro != null
    ? BigInt(r[0].cap_micro)
    : (CAPS_DEFAULT_MICRO[tariff] ?? 0n);
  const pct = r[0].split_percent != null ? BigInt(r[0].split_percent) : SPLIT_PCT_DEFAULT;

  // Cap reached → no split, all to working
  if (capMicro <= 0n || subBal >= capMicro) {
    return { toSubscriptionMicro: 0n, toWorkingMicro: amountMicro, capReached: true, skipped: false };
  }

  const want = (amountMicro * pct) / 100n;
  const room = capMicro - subBal;
  const toSub = want <= room ? want : room;

  if (toSub <= 0n) {
    return { toSubscriptionMicro: 0n, toWorkingMicro: amountMicro, capReached: false, skipped: false };
  }

  // Negative offset on cash_ledger so working balance = 80% of amount
  const memo = relatedLedgerId
    ? `auto-split 20% from ${kind} (ledger #${relatedLedgerId})`
    : `auto-split 20% from ${kind}`;
  await tx.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, 'subscription_split', ${-Number(toSub)}, ${memo})
  `);
  await tx.execute(sql`
    UPDATE users SET subscription_balance_micro = subscription_balance_micro + ${Number(toSub)}
    WHERE id = ${userId}
  `);

  const newBal = subBal + toSub;
  return {
    toSubscriptionMicro: toSub,
    toWorkingMicro: amountMicro - toSub,
    capReached: newBal >= capMicro,
    skipped: false,
  };
}

/**
 * Direct credit to subscription balance (no split, full amount).
 * For challenge / mission / weekly-mission rewards which the user
 * specified should bypass the split and accumulate fully on
 * subscription. NOT capped — challenges are designed for FREE users
 * to earn their first $45 toward LAUNCH.
 */
export async function creditSubscriptionDirect(
  tx: DB,
  userId: number,
  amountMicro: bigint,
  kind: string,
  memo?: string,
): Promise<void> {
  if (amountMicro <= 0n) return;
  await tx.execute(sql`
    UPDATE users SET subscription_balance_micro = subscription_balance_micro + ${Number(amountMicro)}
    WHERE id = ${userId}
  `);
  // Audit row in cash_ledger: zero working impact, but visible in transactions
  // history with kind for provenance.
  await tx.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, ${'subscription_direct:' + kind}, 0, ${memo || kind})
  `);
}

/**
 * Accrue to leader pool fund — % of partner-line earnings.
 *
 * The user said: "Лидерский пул нужно сделать и сейчас считать от
 * заработка по линейному маркетингу" — meaning the pool grows from a
 * % of every referral chain payout.
 *
 * Stores accrual on the leader_pool_fund admin user (matrix position 0
 * convention) with kind='leader_pool_fund'. Phase 8's karma-raffle.job
 * reads SUM(amount_micro) where kind='leader_pool_fund' twice a month
 * (1st and 15th) and distributes to top-15 partners.
 */
export async function accrueLeaderPool(
  tx: DB,
  fromUserId: number,
  partnerPayoutMicro: bigint,
  level: number,
): Promise<bigint> {
  if (partnerPayoutMicro <= 0n) return 0n;
  // 5% of every partner accrual goes into the leader pool
  const POOL_PCT = 5n;
  const poolMicro = (partnerPayoutMicro * POOL_PCT) / 100n;
  if (poolMicro <= 0n) return 0n;

  // Find the admin user (matrix position 0). If none exists yet, skip
  // silently — admin will be set up before launch.
  const adminRows = (await tx.execute(sql`
    SELECT user_id FROM matrix_positions WHERE position = 0 LIMIT 1
  `)) as unknown as Array<{ user_id: number }>;
  if (!adminRows[0]) return 0n;

  await tx.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, level, memo)
    VALUES (${adminRows[0].user_id}, 'leader_pool_fund', ${Number(poolMicro)},
            ${fromUserId}, ${level},
            ${'5% of partner_l' + level + ' payout'})
  `);
  return poolMicro;
}
