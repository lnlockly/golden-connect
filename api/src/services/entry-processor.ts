import { and, eq, sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import {
  cashLedger,
  matrixPositions,
  tariffs,
  userTariffs,
} from '../db/schema.js';
import * as matrix from './matrix.js';
import * as referrals10lvl from './referrals-10lvl.js';
import * as matchingBonus from './matching-bonus.js';
import * as taskPool from './task-pool.js';

/**
 * Orchestrator for a paid tariff entry. Every call is atomic — if any step
 * throws, the enclosing transaction rolls back and nothing is written.
 *
 * Split of `entry_usd`:
 *   40% → matrix 3-above        (matrix.accrueFromEntry)
 *   20% → task pool             (taskPool.accrueToPool)
 *   30% → 10-level refs         (referrals10lvl.accrueFromEntry — Marketing v2)
 *   10% → admin fee
 *
 * The inbound `entry_fee` row is negative; the four distributions are
 * positive and must sum to the same magnitude. Any drift indicates a bug
 * in sub-services and is surfaced via `console.warn` + non-zero
 * `runningSumMicro` in the return payload.
 */

export interface ProcessEntryArgs {
  userId: number;
  tariffId: number;
  paymentRefId?: string | null;
  tx?: DB;
}

export interface ProcessEntryResult {
  ok: boolean;
  entryMicro: bigint;
  matrixPosition: number;
  referralsPaidLevels: number;
  adminFeeMicro: bigint;
  totalDistributedMicro: bigint;
  /** Sum of all cash_ledger rows written in this tx. Should be 0. */
  runningSumMicro: bigint;
}

const RENEWAL_DAYS = 30;

async function getAdminUserId(tx: DB): Promise<number> {
  const [row] = await tx
    .select({ userId: matrixPositions.userId })
    .from(matrixPositions)
    .where(eq(matrixPositions.position, 0))
    .limit(1);
  if (!row) throw new Error('admin position 0 not seeded');
  return Number(row.userId);
}

export async function processEntry(args: ProcessEntryArgs): Promise<ProcessEntryResult> {
  const run = async (tx: DB): Promise<ProcessEntryResult> => {
    const [tariffRow] = await tx
      .select({ id: tariffs.id, entryMicro: tariffs.entryMicro })
      .from(tariffs)
      .where(eq(tariffs.id, args.tariffId))
      .limit(1);
    if (!tariffRow) throw new Error(`tariff ${args.tariffId} not found`);
    const entryMicro = BigInt(tariffRow.entryMicro as unknown as string);
    if (entryMicro <= 0n) throw new Error(`tariff ${args.tariffId} has non-positive entry`);

    const startIdRows = await tx.execute<{ max: string | null }>(sql`
      SELECT COALESCE(MAX(id), 0)::text AS max FROM cash_ledger
    `);
    const ledgerStartId = BigInt(startIdRows[0]?.max ?? '0');

    const now = new Date();
    const renewedUntil = new Date(now.getTime() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);

    await tx
      .update(userTariffs)
      .set({ isActive: false, activeUntil: now })
      .where(and(eq(userTariffs.userId, args.userId), eq(userTariffs.isActive, true)));

    const [newTariff] = await tx
      .insert(userTariffs)
      .values({
        userId: args.userId,
        tariffId: args.tariffId,
        activeSince: now,
        activeUntil: renewedUntil,
        isActive: true,
      })
      .returning({ id: userTariffs.id });
    const userTariffId = newTariff ? Number(newTariff.id) : null;

    const [existingPos] = await tx
      .select({ position: matrixPositions.position })
      .from(matrixPositions)
      .where(eq(matrixPositions.userId, args.userId))
      .limit(1);
    const matrixPosition =
      existingPos !== undefined
        ? Number(existingPos.position)
        : await matrix.assignPosition(args.userId, tx);

    const paymentMemo = args.paymentRefId
      ? `entry_payment:${args.paymentRefId}`
      : `entry_payment:tariff:${args.tariffId}`;
    await tx.insert(cashLedger).values({
      userId: args.userId,
      kind: 'entry_fee',
      amountMicro: -entryMicro,
      memo: paymentMemo,
    });

    await matrix.accrueFromEntry(args.userId, entryMicro, args.tariffId, tx);
    await taskPool.accrueToPool(entryMicro, tx);
    const refRes = await referrals10lvl.accrueFromEntry(
      args.userId,
      entryMicro,
      { kind: 'entry_fee', id: userTariffId },
      tx,
    );

    // Matching Bonus (ROCKET holders earn +10% of L1..L3 partner accruals).
    // Triggered per ref row so source_flow_ledger_id is the single accrual
    // point — keeps the bonus line idempotent in the matching_bonus_ledger.
    for (const refEntry of refRes.entries) {
      await matchingBonus.accrueFromReferral(
        refEntry.recipientUserId,
        refEntry.amountMicro,
        refEntry.ledgerId,
        tx,
      );
    }

    const adminFeeMicro = (entryMicro * 10n) / 100n;
    const adminUserId = await getAdminUserId(tx);
    await tx.insert(cashLedger).values({
      userId: adminUserId,
      kind: 'admin_fee',
      amountMicro: adminFeeMicro,
      relatedUserId: args.userId,
      memo: 'entry_split_10pct',
    });

    const sumRows = await tx.execute<{ total: string | null; positive: string | null }>(sql`
      SELECT
        COALESCE(SUM(amount_micro), 0)::text AS total,
        COALESCE(SUM(CASE WHEN amount_micro > 0 THEN amount_micro ELSE 0 END), 0)::text AS positive
      FROM cash_ledger
      WHERE id > ${ledgerStartId}
    `);
    const runningSumMicro = BigInt(sumRows[0]?.total ?? '0');
    const totalDistributedMicro = BigInt(sumRows[0]?.positive ?? '0');

    if (runningSumMicro !== 0n) {
      console.warn(
        `[entry-processor] invariant violation: cash_ledger sum=${runningSumMicro} ` +
          `for user=${args.userId} tariff=${args.tariffId} entryMicro=${entryMicro} ` +
          `paymentRef=${args.paymentRefId ?? 'null'}`,
      );
    }

    return {
      ok: runningSumMicro === 0n,
      entryMicro,
      matrixPosition,
      referralsPaidLevels: refRes.chainDepth,
      adminFeeMicro,
      totalDistributedMicro,
      runningSumMicro,
    };
  };

  if (args.tx) return run(args.tx);
  return db.transaction(async (inner) => run(inner as unknown as DB));
}

/**
 * Pre-launch: pay linear (10-level referrals) accruals immediately on payment,
 * but DEFER the matrix + task pool placement until admin activates marketing.
 *
 * What this writes:
 *   • entry_fee (negative) on cash_ledger
 *   • 10-level referral accruals → recipients' cash_ledger
 *   • matching bonus accruals (ROCKET only) → recipients' cash_ledger
 *   • admin_fee (10%)
 *   • user_tariffs row (active)
 *
 * What it SKIPS (left for processMatrixAndPool):
 *   • matrix.accrueFromEntry (40% to 3-above)
 *   • taskPool.accrueToPool (20%)
 *   • matrix_positions assignment
 *
 * The cash_ledger invariant (sum=0) is intentionally NOT held until the
 * matching processMatrixAndPool() call balances the books later.
 */
export async function processLinearOnly(args: ProcessEntryArgs): Promise<{
  ok: boolean;
  entryMicro: bigint;
  referralsPaidLevels: number;
  adminFeeMicro: bigint;
  totalDistributedMicro: bigint;
}> {
  const run = async (tx: DB): Promise<{
    ok: boolean;
    entryMicro: bigint;
    referralsPaidLevels: number;
    adminFeeMicro: bigint;
    totalDistributedMicro: bigint;
  }> => {
    const [tariffRow] = await tx
      .select({ id: tariffs.id, entryMicro: tariffs.entryMicro })
      .from(tariffs)
      .where(eq(tariffs.id, args.tariffId))
      .limit(1);
    if (!tariffRow) throw new Error(`tariff ${args.tariffId} not found`);
    const entryMicro = BigInt(tariffRow.entryMicro as unknown as string);
    if (entryMicro <= 0n) throw new Error(`tariff ${args.tariffId} has non-positive entry`);

    const now = new Date();
    const renewedUntil = new Date(now.getTime() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);

    // Activate user tariff (idempotent — if already active for same tariff, this no-ops at app level)
    const [existingActive] = await tx
      .select({ id: userTariffs.id })
      .from(userTariffs)
      .where(and(eq(userTariffs.userId, args.userId), eq(userTariffs.isActive, true)))
      .limit(1);
    let userTariffId: number | null = null;
    if (!existingActive) {
      const [newTariff] = await tx
        .insert(userTariffs)
        .values({
          userId: args.userId,
          tariffId: args.tariffId,
          activeSince: now,
          activeUntil: renewedUntil,
          isActive: true,
        })
        .returning({ id: userTariffs.id });
      userTariffId = newTariff ? Number(newTariff.id) : null;
    } else {
      userTariffId = Number(existingActive.id);
    }

    const paymentMemo = args.paymentRefId
      ? `entry_payment:${args.paymentRefId}`
      : `entry_payment:tariff:${args.tariffId}`;
    await tx.insert(cashLedger).values({
      userId: args.userId,
      kind: 'entry_fee',
      amountMicro: -entryMicro,
      memo: paymentMemo,
    });

    // 10-level referral chain — pays UP. This is what user sees as "линейные пришли сразу".
    const refRes = await referrals10lvl.accrueFromEntry(
      args.userId,
      entryMicro,
      { kind: 'entry_fee', id: userTariffId },
      tx,
    );

    // Matching bonus to ROCKET holders on L1..L3 referral payouts.
    for (const refEntry of refRes.entries) {
      await matchingBonus.accrueFromReferral(
        refEntry.recipientUserId,
        refEntry.amountMicro,
        refEntry.ledgerId,
        tx,
      );
    }

    const adminFeeMicro = (entryMicro * 10n) / 100n;
    const adminUserId = await getAdminUserId(tx);
    await tx.insert(cashLedger).values({
      userId: adminUserId,
      kind: 'admin_fee',
      amountMicro: adminFeeMicro,
      relatedUserId: args.userId,
      memo: 'entry_split_10pct',
    });

    return {
      ok: true,
      entryMicro,
      referralsPaidLevels: refRes.chainDepth,
      adminFeeMicro,
      totalDistributedMicro: 0n, // not measured here; matrix+pool will add the rest
    };
  };

  if (args.tx) return run(args.tx);
  return db.transaction(async (inner) => run(inner as unknown as DB));
}

/**
 * Phase 2 of the pre-launch deferred flow: when admin activates marketing,
 * walk all bookings WHERE linear_processed=true AND marketing_processed=false
 * and call this for each. It does ONLY the parts that processLinearOnly skipped:
 *   • matrix.accrueFromEntry (40%)
 *   • taskPool.accrueToPool (20%)
 *   • matrix_positions assignment if not yet seated
 *
 * Idempotency: matrix_positions has its own unique-by-user guard. cash_ledger
 * accrual rows from matrix have a related_payment_id memo we can de-dup by.
 */
export async function processMatrixAndPool(args: ProcessEntryArgs): Promise<{
  ok: boolean;
  matrixPosition: number;
}> {
  const run = async (tx: DB): Promise<{ ok: boolean; matrixPosition: number }> => {
    const [tariffRow] = await tx
      .select({ id: tariffs.id, entryMicro: tariffs.entryMicro })
      .from(tariffs)
      .where(eq(tariffs.id, args.tariffId))
      .limit(1);
    if (!tariffRow) throw new Error(`tariff ${args.tariffId} not found`);
    const entryMicro = BigInt(tariffRow.entryMicro as unknown as string);

    const [existingPos] = await tx
      .select({ position: matrixPositions.position })
      .from(matrixPositions)
      .where(eq(matrixPositions.userId, args.userId))
      .limit(1);
    const matrixPosition =
      existingPos !== undefined
        ? Number(existingPos.position)
        : await matrix.assignPosition(args.userId, tx);

    await matrix.accrueFromEntry(args.userId, entryMicro, args.tariffId, tx);
    await taskPool.accrueToPool(entryMicro, tx);

    return { ok: true, matrixPosition };
  };

  if (args.tx) return run(args.tx);
  return db.transaction(async (inner) => run(inner as unknown as DB));
}
