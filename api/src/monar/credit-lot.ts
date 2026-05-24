// Free $10 credit lot on registration. One per user. Unlocks for withdrawal
// when the user activates their first real lot ≥ $50.

import { CREDIT_LOT_USD_CENTS } from './rules.js';

export interface CreditLotState {
  userId: number;
  granted: boolean;
  grantedAt: number | null;        // unix ms
  unlocked: boolean;
  unlockedAt: number | null;
  amountCents: number;
}

// Grant the credit lot to a freshly registered user.
export function grantCreditLot(userId: number, now: number): CreditLotState {
  return {
    userId,
    granted: true,
    grantedAt: now,
    unlocked: false,
    unlockedAt: null,
    amountCents: CREDIT_LOT_USD_CENTS,
  };
}

// Called when user activates their first real lot.
export function unlockCreditLot(state: CreditLotState, now: number): CreditLotState {
  if (!state.granted || state.unlocked) return state;
  return { ...state, unlocked: true, unlockedAt: now };
}

// Has the user already received their (one-time) credit lot?
export function alreadyGranted(state: CreditLotState | undefined): boolean {
  return Boolean(state && state.granted);
}
