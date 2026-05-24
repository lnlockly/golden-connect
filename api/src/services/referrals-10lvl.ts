import { sql } from 'drizzle-orm';
import { applyIncomeSplit, accrueLeaderPool } from './income-split.js';
import { db, type DB } from '../db/client.js';
import { cashLedger, referralAccruals } from '../db/schema.js';
import { ADMIN_REF_CODE } from './users.js';

/**
 * 10-level referral accrual — Marketing v2 (2026-04).
 *
 * When a paid user enters the platform (activates a business seat, etc.),
 * up to 30% of the entry amount is split up the invite_edges chain with the
 * declared curve:
 *
 *   L1 10% · L2 7% · L3 5% · L4 2% · L5 1.5% · L6 1.3% · L7 1.2% · L8 1%
 *   · L9 0.9% · L10 0.5%   (sum = 30.4% of entry)
 *
 * Receiver eligibility gate: an ancestor ONLY earns on a level if they have
 * at least one active paid business seat (LAUNCH/BOOST/ROCKET). An ancestor
 * without any paid seat (i.e. still on FREE — even if they carry PARTNER
 * status) earns only on L1. Unpaid levels are bundled into a single admin
 * remainder credit.
 *
 * Integer-scaled math: percentages are encoded as parts-per-million so all
 * arithmetic stays in `bigint` and never drifts from float rounding.
 */

export const REFERRAL_CURVE_10LVL = [
  0.10, 0.07, 0.05, 0.02, 0.015, 0.013, 0.012, 0.010, 0.009, 0.005,
] as const;

const CURVE_PPM: readonly bigint[] = [
  100_000n, 70_000n, 50_000n, 20_000n, 15_000n, 13_000n, 12_000n, 10_000n, 9_000n, 5_000n,
];
const PPM = 1_000_000n;
export const MAX_REFERRAL_LEVEL = 10;

export function pctForLevel(level: number): number {
  if (level < 1 || level > MAX_REFERRAL_LEVEL) return 0;
  return REFERRAL_CURVE_10LVL[level - 1];
}

/** Integer share for a level: floor(entryMicro * ppm / 1e6). */
export function levelShareMicro(entryMicro: bigint, level: number): bigint {
  if (level < 1 || level > MAX_REFERRAL_LEVEL) return 0n;
  if (entryMicro <= 0n) return 0n;
  return (entryMicro * CURVE_PPM[level - 1]) / PPM;
}

/** Sum of shares for levels `fromLevel`..10. Used for admin remainder math. */
export function sumSharesMicro(entryMicro: bigint, fromLevel: number): bigint {
  let sum = 0n;
  for (let lvl = Math.max(1, fromLevel); lvl <= MAX_REFERRAL_LEVEL; lvl++) {
    sum += levelShareMicro(entryMicro, lvl);
  }
  return sum;
}

export interface AccrualEntry {
  recipientUserId: number;
  level: number;
  amountMicro: bigint;
  ledgerId: number;
}

export interface AccrualResult {
  chainDepth: number;
  paidLevels: number;
  entries: AccrualEntry[];
  adminRemainderMicro: bigint;
  adminLedgerId: number | null;
}

export interface AccrueSource {
  /** cash_ledger kind triggering the payout (e.g. 'entry_fee'). Stored on referral_accruals.source_kind. */
  kind: string;
  /** Related row id (e.g. business_seats.id). Null breaks the unique-index dedup — caller ensures idempotency. */
  id: number | null;
}

async function findAdminUserId(tx: DB): Promise<number | null> {
  const rows = await tx.execute(sql`
    SELECT id FROM users WHERE ref_code = ${ADMIN_REF_CODE} LIMIT 1
  `);
  const row = rows[0] as { id?: number } | undefined;
  return row?.id != null ? Number(row.id) : null;
}

/**
 * Walk invite_edges from `fromUserId` up to 10 hops and flag each ancestor
 * with their paid-seat status (for the FREE-vs-paid eligibility gate).
 *
 * The recursive CTE uses depth as the termination guard (not a visited set)
 * and defends against self-loop rows via `<> child_user_id`. The `hasPaid`
 * flag is computed in the same query against business_seats to avoid N+1.
 */
async function walkChainWithEligibility(
  tx: DB,
  fromUserId: number,
): Promise<Array<{ id: number; lvl: number; hasPaid: boolean }>> {
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
      WHERE c.lvl < ${MAX_REFERRAL_LEVEL}
        AND ie.parent_user_id <> ie.child_user_id
    )
    SELECT
      c.id,
      c.lvl,
      EXISTS (
        SELECT 1 FROM business_seats bs
        JOIN tariffs t ON bs.tariff_id = t.id
        WHERE bs.user_id = c.id
          AND bs.deactivated_at IS NULL
          AND t.code <> 'free'
      ) AS has_paid
    FROM chain c
    ORDER BY c.lvl ASC
  `);
  return rows.map((r) => {
    const rr = r as { id: number; lvl: number; has_paid: boolean };
    return { id: Number(rr.id), lvl: Number(rr.lvl), hasPaid: Boolean(rr.has_paid) };
  });
}

/**
 * Accrue ref_L1..L10 rewards for an entry from `fromUserId`.
 *
 * Receiver gate:
 *   - L1: any ancestor (paid or FREE) earns 10%
 *   - L2..L10: ONLY ancestors with an active paid business seat earn
 *
 * Writes to cash_ledger + referral_accruals for each paid level; one
 * `admin_fee` row bundles all skipped shares (short-chain + FREE upstream).
 *
 * Idempotency is caller-owned via the (from_user_id, level, source_kind,
 * source_id) unique index on referral_accruals — calling twice with the
 * same source raises.
 */
export async function accrueFromEntry(
  fromUserId: number,
  entryMicro: bigint,
  source: AccrueSource,
  tx: DB = db,
): Promise<AccrualResult> {
  if (entryMicro <= 0n) {
    return {
      chainDepth: 0,
      paidLevels: 0,
      entries: [],
      adminRemainderMicro: 0n,
      adminLedgerId: null,
    };
  }

  const run = async (txx: DB): Promise<AccrualResult> => {
    const chain = await walkChainWithEligibility(txx, fromUserId);
    const memo = `ref:${source.kind}:${source.id ?? 'null'}`;

    const entries: AccrualEntry[] = [];
    let skippedMicro = 0n;

    for (const { id: ancestorId, lvl, hasPaid } of chain) {
      const amountMicro = levelShareMicro(entryMicro, lvl);
      if (amountMicro <= 0n) continue;

      // FREE receivers only qualify for L1. Anything deeper skips to admin.
      const eligible = hasPaid || lvl === 1;
      if (!eligible) {
        skippedMicro += amountMicro;
        continue;
      }

      const [ledgerRow] = await txx
        .insert(cashLedger)
        .values({
          userId: ancestorId,
          kind: `ref_L${lvl}`,
          amountMicro,
          relatedUserId: fromUserId,
          level: lvl,
          memo,
        })
        .returning({ id: cashLedger.id });

      await txx.insert(referralAccruals).values({
        recipientUserId: ancestorId,
        fromUserId,
        level: lvl,
        sourceKind: source.kind,
        sourceId: source.id,
        amountMicro,
        ledgerId: ledgerRow.id,
      });

      // 80/20 split — 20% uphold subscription_balance so monthly tariff
      // fee can be auto-renewed. Skipped silently if cap reached.
      try {
        await applyIncomeSplit(txx, ancestorId, amountMicro, `ref_L${lvl}`, ledgerRow.id);
      } catch (e) {
        console.warn(`[ref-10lvl] applyIncomeSplit failed for user ${ancestorId}: ${(e as Error).message}`);
      }

      // 5% of every partner-line accrual feeds the leader-pool fund
      // distributed twice a month to top-15 partners.
      try {
        await accrueLeaderPool(txx, ancestorId, amountMicro, lvl);
      } catch (e) {
        console.warn(`[ref-10lvl] accrueLeaderPool failed for user ${ancestorId}: ${(e as Error).message}`);
      }

      entries.push({
        recipientUserId: ancestorId,
        level: lvl,
        amountMicro,
        ledgerId: ledgerRow.id,
      });
    }

    // Everything not paid out (short chain + FREE-upstream skips) → admin.
    const paidLevels = entries.length;
    const highestFilledLvl =
      chain.length > 0 ? Math.max(...chain.map((c) => c.lvl)) : 0;
    const shortChainRemainder = sumSharesMicro(entryMicro, highestFilledLvl + 1);
    const remainder = shortChainRemainder + skippedMicro;

    let adminLedgerId: number | null = null;
    if (remainder > 0n) {
      const adminId = await findAdminUserId(txx);
      if (!adminId) {
        throw new Error(`admin user (ref_code='${ADMIN_REF_CODE}') not found — call ensureAdminUser() at boot`);
      }
      const [row] = await txx
        .insert(cashLedger)
        .values({
          userId: adminId,
          kind: 'admin_fee',
          amountMicro: remainder,
          relatedUserId: fromUserId,
          level: null,
          memo: `ref_remainder_L${paidLevels}_of_${MAX_REFERRAL_LEVEL}`,
        })
        .returning({ id: cashLedger.id });
      adminLedgerId = row.id;
    }

    return {
      chainDepth: chain.length,
      paidLevels,
      entries,
      adminRemainderMicro: remainder,
      adminLedgerId,
    };
  };

  if (tx === db) {
    return await db.transaction(async (inner) => run(inner as unknown as DB));
  }
  return run(tx);
}
