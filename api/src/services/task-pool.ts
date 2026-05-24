import { and, eq, sql } from 'drizzle-orm';
import { applyIncomeSplit } from './income-split.js';
import { awardKarma } from './karma.js';
import { db } from '../db/client.js';
import {
  adImpressions,
  cashLedger,
  matrixPositions,
  taskCompletions,
  tariffs,
  userTariffs,
} from '../db/schema.js';

/**
 * Task pool + daily earnings cap.
 *
 * Two concerns bundled here:
 *
 *   accrueToPool — 40% of every tariff entry is earmarked for the
 *     "task pool" that funds future task/ad payouts. We don't bother
 *     with a dedicated accounting table: a cash_ledger credit on the
 *     admin user (occupant of matrix position 0) with
 *     kind='task_pool_fund' is enough to reconstruct the running sum.
 *
 *   completeTask / getTodayEarnings — per-user earnings for task and
 *     ad_view events, clamped at the user's tariff.daily_cap_micro.
 *     Today's bucket is DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
 *     so the rollover is UTC midnight regardless of server locale.
 *     task_reward and ad_view share the bucket — a user on Start cannot
 *     combine $10 of ads with $10 of tasks; the total is the cap.
 */

/**
 * Active tariff codes (Marketing v2, 2026-04). Legacy start/basic/core/pro/
 * elite/vip/royal rows exist in DB as is_active=false so historical ledger
 * rows keep referencing them, but no new entries use them.
 */
export type TariffCode =
  | 'free'
  | 'launch'
  | 'boost'
  | 'rocket';

/**
 * Canonical daily cap per tariff (micro-USD). Kept as a typed constant so
 * callers and tests don't round-trip through the DB when they only need
 * reference limits. The DB column `tariffs.daily_cap_micro` is the source
 * of truth at runtime — this mirror is for fixtures and UI previews.
 */
export const DAILY_CAP_BY_TARIFF: Record<TariffCode, bigint> = {
  free: 20_000_000n,    // $20/day on ad-views + tasks (per presentation)
  launch: 50_000_000n,  // +$30 buffer on top of FREE
  boost: 80_000_000n,
  rocket: 120_000_000n,
};

export type TaskKind = 'ad_view' | 'tg_sub' | 'brief' | 'story';

export type CompleteTaskResult =
  | { ok: true; paidMicro: bigint; reason?: 'partial_cap' }
  | { ok: false; reason: 'daily_cap_reached' | 'no_active_tariff' };

export interface TodayEarnings {
  taskMicro: bigint;
  adMicro: bigint;
  totalMicro: bigint;
  capMicro: bigint;
  remainingMicro: bigint;
}

type Tx = typeof db;

async function getAdminUserId(tx: Tx): Promise<number> {
  const [row] = await tx
    .select({ userId: matrixPositions.userId })
    .from(matrixPositions)
    .where(eq(matrixPositions.position, 0))
    .limit(1);
  if (!row) {
    throw new Error('admin position 0 not seeded — cannot accrue to task pool');
  }
  return Number(row.userId);
}

/**
 * Credit 40% of an entry fee to the task pool (admin ledger row).
 * Not idempotent — the entry processor must call this exactly once per
 * entry. Returns without writing when the share rounds down to zero.
 */
export async function accrueToPool(entryMicro: bigint, tx: Tx = db): Promise<void> {
  // Marketing v2: task pool share reduced 40% → 20% to make room for 10-level refs.
  const share = (entryMicro * 20n) / 100n;
  if (share <= 0n) return;
  const adminId = await getAdminUserId(tx);
  await tx.insert(cashLedger).values({
    userId: adminId,
    kind: 'task_pool_fund',
    amountMicro: share,
    memo: 'task_pool',
  });
}

async function loadActiveTariff(
  userId: number,
  tx: Tx,
): Promise<{ code: string; dailyCapMicro: bigint } | null> {
  const rows = await tx
    .select({
      code: tariffs.code,
      dailyCapMicro: tariffs.dailyCapMicro,
    })
    .from(userTariffs)
    .innerJoin(tariffs, eq(userTariffs.tariffId, tariffs.id))
    .where(and(eq(userTariffs.userId, userId), eq(userTariffs.isActive, true)))
    .orderBy(sql`${userTariffs.activeSince} DESC`)
    .limit(1);
  const row = rows[0];
  if (row) {
    return { code: row.code, dailyCapMicro: BigInt(row.dailyCapMicro as unknown as string) };
  }
  // Fallback: FREE users don't have a user_tariffs row yet but the
  // presentation guarantees them up to $20/day on the task exchange.
  // Look up the FREE tariff config once and treat that as the implicit
  // default so completeTask doesn't short-circuit with no_active_tariff.
  const freeRows = await tx
    .select({ code: tariffs.code, dailyCapMicro: tariffs.dailyCapMicro })
    .from(tariffs)
    .where(eq(tariffs.code, 'free'))
    .limit(1);
  const freeRow = freeRows[0];
  if (!freeRow) return null;
  return { code: freeRow.code, dailyCapMicro: BigInt(freeRow.dailyCapMicro as unknown as string) };
}

async function sumTodayEarnings(
  userId: number,
  tx: Tx,
): Promise<{ task: bigint; ad: bigint }> {
  const rows = await tx.execute<{ kind: string; total: string }>(sql`
    SELECT kind, COALESCE(SUM(amount_micro), 0)::text AS total
    FROM cash_ledger
    WHERE user_id = ${userId}
      AND kind IN ('task_reward', 'ad_view')
      AND DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')
          = DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')
    GROUP BY kind
  `);
  let task = 0n;
  let ad = 0n;
  for (const r of rows) {
    const v = BigInt(r.total);
    if (r.kind === 'task_reward') task = v;
    else if (r.kind === 'ad_view') ad = v;
  }
  return { task, ad };
}

/** YYYY-MM-DD in UTC — matches DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC')::date. */
function todayUtcBucket(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Credit a task payout to `userId`, clamped to the remaining daily cap.
 *
 * Outcomes:
 *   { ok: true, paidMicro }                     — full payout credited
 *   { ok: true, paidMicro, reason: 'partial_cap' }
 *                                               — clamped to cap remainder
 *   { ok: false, reason: 'daily_cap_reached' }  — no capacity left
 *   { ok: false, reason: 'no_active_tariff' }   — user has no active plan
 *
 * Side effects on success:
 *   1 cash_ledger row (kind='ad_view' for ad_view task, else 'task_reward')
 *   1 ad_impressions or task_completions mirror row linked via ledger_id
 */
export async function completeTask(
  userId: number,
  taskKind: TaskKind,
  payoutMicro: bigint,
  tx: Tx = db,
): Promise<CompleteTaskResult> {
  if (payoutMicro <= 0n) return { ok: false, reason: 'daily_cap_reached' };

  const tariff = await loadActiveTariff(userId, tx);
  if (!tariff) return { ok: false, reason: 'no_active_tariff' };

  const cap = tariff.dailyCapMicro;
  const { task, ad } = await sumTodayEarnings(userId, tx);
  const sumToday = task + ad;
  if (sumToday >= cap) return { ok: false, reason: 'daily_cap_reached' };

  const remaining = cap - sumToday;
  const partial = payoutMicro > remaining;
  const paid = partial ? remaining : payoutMicro;

  const ledgerKind = taskKind === 'ad_view' ? 'ad_view' : 'task_reward';
  const [ledgerRow] = await tx
    .insert(cashLedger)
    .values({
      userId,
      kind: ledgerKind,
      amountMicro: paid,
      memo: `task:${taskKind}`,
    })
    .returning({ id: cashLedger.id });
  const ledgerId = ledgerRow ? Number(ledgerRow.id) : null;

  // 80/20 split: 20% goes to subscription (capped per tariff), rest stays
  // on working balance. See services/income-split.ts.
  await applyIncomeSplit(tx, userId, paid, ledgerKind, ledgerId);

  // Karma reward for completed task (+1 per task_complete event)
  try {
    await awardKarma(userId, 'task_complete', ledgerId, `task:${taskKind}`);
  } catch { /* non-fatal */ }

  const dayBucket = todayUtcBucket();

  if (taskKind === 'ad_view') {
    await tx.insert(adImpressions).values({
      userId,
      rewardMicro: paid,
      dayBucket,
      ledgerId,
    });
  } else {
    // (user_id, task_id) is unique — generate a one-shot id per call.
    // Callers that track a stable task id should write task_completions
    // themselves; this helper covers ad-hoc completions.
    const taskId = `${taskKind}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    await tx.insert(taskCompletions).values({
      userId,
      taskId,
      rewardMicro: paid,
      dayBucket,
      ledgerId,
    });
  }

  return partial
    ? { ok: true, paidMicro: paid, reason: 'partial_cap' }
    : { ok: true, paidMicro: paid };
}

/**
 * Snapshot of a user's today-so-far earnings for UI display. Returns
 * zeroed fields and capMicro=0 for users without an active tariff — the
 * frontend renders that as "upgrade your plan".
 */
export async function getTodayEarnings(
  userId: number,
  tx: Tx = db,
): Promise<TodayEarnings> {
  const tariff = await loadActiveTariff(userId, tx);
  const cap = tariff?.dailyCapMicro ?? 0n;
  const { task, ad } = await sumTodayEarnings(userId, tx);
  const total = task + ad;
  const remaining = total >= cap ? 0n : cap - total;
  return {
    taskMicro: task,
    adMicro: ad,
    totalMicro: total,
    capMicro: cap,
    remainingMicro: remaining,
  };
}
