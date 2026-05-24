import type { TaskKind } from '../services/task-pool.js';

/**
 * Canonical payout schedule per task kind. Server-side derived (not
 * caller-supplied) so users can't claim arbitrary amounts. ad_view picks
 * a uniform random sample inside its range to mirror the production
 * advertiser-bid mechanic — every other kind is fixed.
 *
 * Amounts in micro-USD. Mirror the tariff micro convention.
 */
export const TASK_PAYOUT_RANGES: Record<TaskKind, { min: bigint; max: bigint }> = {
  ad_view: { min: 50_000n, max: 300_000n },
  tg_sub: { min: 500_000n, max: 500_000n },
  brief: { min: 5_000_000n, max: 5_000_000n },
  story: { min: 2_000_000n, max: 2_000_000n },
};

/**
 * Pick the payout for a task completion. Random in range when min<max
 * (only ad_view today); fixed otherwise. Random source is `Math.random`
 * — fine for payout jitter, not used for anything cryptographic.
 */
export function payoutForTaskKind(kind: TaskKind): bigint {
  const range = TASK_PAYOUT_RANGES[kind];
  if (range.min === range.max) return range.min;
  const span = range.max - range.min;
  // BigInt random: scale Math.random into the span, add min.
  const offset = BigInt(Math.floor(Math.random() * Number(span + 1n)));
  return range.min + offset;
}
