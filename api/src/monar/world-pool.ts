// Monthly world pool: 8 buckets, lot-tier access, auto-activation of new lots.

import {
  LOT_SPECS,
  LotUsd,
  WORLD_POOL_AUTO_ACTIVATE_NEW_LOT,
  WORLD_POOL_MIN_LOT_USD,
  WORLD_POOL_TOTAL_BUCKETS,
} from './rules.js';

export interface PoolPeriod {
  // 'YYYY-MM' bucket.
  period: string;
  totalCents: number;
}

// One participant's stake in the monthly pool.
export interface PoolParticipant {
  userId: number;
  lotUsd: LotUsd;     // their *active* lot
  // weight inside each accessible bucket (defaults to 1 — equal split)
  weight?: number;
}

// Result of monthly distribution.
export interface BucketShare {
  bucketIndex: number;          // 0..7
  bucketCents: number;          // equal 1/8 of the total pool
  perUserCents: Record<number, number>;
}

export function periodOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Split monthly pool into 8 equal buckets and distribute each bucket among
// the participants who have access (per LOT_SPECS.worldPoolAccess).
export function distributeMonthlyPool(
  pool: PoolPeriod,
  participants: PoolParticipant[],
): BucketShare[] {
  const bucketCents = Math.trunc(pool.totalCents / WORLD_POOL_TOTAL_BUCKETS);
  const buckets: BucketShare[] = [];

  for (let i = 0; i < WORLD_POOL_TOTAL_BUCKETS; i++) {
    const eligible = participants.filter(p => {
      const spec = LOT_SPECS[p.lotUsd];
      // Participant has access to buckets 0..spec.worldPoolAccess-1
      return spec.worldPoolAccess > i;
    });

    const totalWeight = eligible.reduce((s, p) => s + (p.weight ?? 1), 0) || 1;
    const perUserCents: Record<number, number> = {};
    let distributed = 0;
    for (const p of eligible) {
      const share = Math.trunc((bucketCents * (p.weight ?? 1)) / totalWeight);
      perUserCents[p.userId] = share;
      distributed += share;
    }
    // Round-off remainder goes to the first eligible user (deterministic).
    if (eligible.length > 0 && distributed < bucketCents) {
      perUserCents[eligible[0].userId] += bucketCents - distributed;
    }

    buckets.push({ bucketIndex: i, bucketCents, perUserCents });
  }
  return buckets;
}

// Given how much the user got from the monthly pool, decide whether to
// auto-activate a new lot (largest lot that fits) and what remainder goes
// to their income balance.
export interface AutoActivateInput {
  userId: number;
  amountCents: number;
}
export interface AutoActivateOutput {
  newLotUsd: LotUsd | null;
  newLotCostCents: number;
  remainderToIncomeCents: number;
}

export function decideAutoActivate(input: AutoActivateInput): AutoActivateOutput {
  if (!WORLD_POOL_AUTO_ACTIVATE_NEW_LOT) {
    return {
      newLotUsd: null,
      newLotCostCents: 0,
      remainderToIncomeCents: input.amountCents,
    };
  }
  // Find the largest LotUsd that does not exceed amountCents.
  const lots = Object.values(LOT_SPECS).filter(s => s.usd >= WORLD_POOL_MIN_LOT_USD);
  let chosen: LotUsd | null = null;
  for (const spec of lots) {
    if (spec.usd * 100 <= input.amountCents) {
      if (chosen === null || spec.usd > chosen) chosen = spec.usd;
    }
  }
  if (chosen === null) {
    return {
      newLotUsd: null,
      newLotCostCents: 0,
      remainderToIncomeCents: input.amountCents,
    };
  }
  const cost = chosen * 100;
  return {
    newLotUsd: chosen,
    newLotCostCents: cost,
    remainderToIncomeCents: input.amountCents - cost,
  };
}
