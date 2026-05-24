// Withdrawal rule: after a lot closes, user must activate a new lot of at
// least 50% of the doubled proceeds before withdrawing the remainder.

import { LotUsd, WITHDRAW_MIN_NEW_LOT_PCT } from './rules.js';

export interface WithdrawEligibilityInput {
  lastClosedLotProceedsCents: number | null;  // doubled proceeds of last closed lot
  newLotsActivatedSinceCents: number;         // total of new lots after the close
}

export interface WithdrawEligibilityOutput {
  eligible: boolean;
  reason: 'ok' | 'no_closed_lot' | 'need_more_reinvest';
  requiredNewLotCents: number;
  shortfallCents: number;
}

export function checkWithdrawEligibility(
  input: WithdrawEligibilityInput,
): WithdrawEligibilityOutput {
  if (input.lastClosedLotProceedsCents === null || input.lastClosedLotProceedsCents === 0) {
    return {
      eligible: true,
      reason: 'no_closed_lot',
      requiredNewLotCents: 0,
      shortfallCents: 0,
    };
  }
  const required = Math.trunc(
    (input.lastClosedLotProceedsCents * WITHDRAW_MIN_NEW_LOT_PCT) / 100,
  );
  if (input.newLotsActivatedSinceCents >= required) {
    return {
      eligible: true,
      reason: 'ok',
      requiredNewLotCents: required,
      shortfallCents: 0,
    };
  }
  return {
    eligible: false,
    reason: 'need_more_reinvest',
    requiredNewLotCents: required,
    shortfallCents: required - input.newLotsActivatedSinceCents,
  };
}

// Convenience: how much is available to withdraw after meeting the rule.
// Withdrawable = income_balance, but only if eligibility holds.
export function availableForWithdraw(
  incomeBalanceCents: number,
  eligibility: WithdrawEligibilityOutput,
): number {
  return eligibility.eligible ? incomeBalanceCents : 0;
}

// Helper: the "забери $X+" headline (e.g. lot $500 → доход $500 → лот $300 → $200+).
export function withdrawExampleFor(lotUsd: LotUsd): string {
  const doubled = lotUsd * 2;
  const requiredNew = Math.trunc((doubled * WITHDRAW_MIN_NEW_LOT_PCT) / 100);
  const available = doubled - requiredNew;
  return `Лот $${lotUsd} → доход $${doubled} → новый лот ≥ $${requiredNew} → можно вывести $${available}+`;
}
