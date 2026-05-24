// Auto-reinvest decisions: on lot closure (50% to new lot) and abonentka-aware
// idle-state handling.

import { AUTO_REINVEST_PCT_OF_DOUBLED, LotUsd, LOT_USD } from './rules.js';

// Pick the largest lot you can buy with the available cash.
export function pickLargestAffordableLot(availableCents: number): LotUsd | null {
  let best: LotUsd | null = null;
  for (const lot of LOT_USD) {
    if (lot * 100 <= availableCents) {
      if (best === null || lot > best) best = lot;
    }
  }
  return best;
}

// After lot closure, route exactly 50% of the doubled proceeds into a new lot.
// Returns the chosen lot and remainder going to the income balance.
export interface ClosureReinvestInput {
  doubledProceedsCents: number;
}
export interface ClosureReinvestOutput {
  reinvestCents: number;        // half of proceeds, capped to chosen lot cost
  newLotUsd: LotUsd | null;
  remainderToIncomeCents: number;
}

export function planClosureReinvest(input: ClosureReinvestInput): ClosureReinvestOutput {
  const half = Math.trunc((input.doubledProceedsCents * AUTO_REINVEST_PCT_OF_DOUBLED) / 100);
  const lot = pickLargestAffordableLot(half);
  if (lot === null) {
    return {
      reinvestCents: 0,
      newLotUsd: null,
      remainderToIncomeCents: input.doubledProceedsCents,
    };
  }
  const cost = lot * 100;
  // Spare from the reinvest half (lot cost ≤ half) goes back to income.
  const spareFromHalf = half - cost;
  const remainderToIncome = input.doubledProceedsCents - cost;
  return {
    reinvestCents: cost,
    newLotUsd: lot,
    remainderToIncomeCents: remainderToIncome,
  };
}
