// 3-balance accounting: topup, income, referral.
// - topup: external deposits, source of funds for buying lots / paying fees
// - income: outgoing only via withdrawal, receives lot doublings + pool payouts
// - referral: receives 5-level ladder accruals, must be moved to income first

import { BALANCE_KINDS, BalanceKind, WITHDRAWABLE_BALANCE } from './rules.js';

export interface Balances {
  topupCents: number;
  incomeCents: number;
  referralCents: number;
}

export function emptyBalances(): Balances {
  return { topupCents: 0, incomeCents: 0, referralCents: 0 };
}

export function credit(b: Balances, kind: BalanceKind, amountCents: number): Balances {
  switch (kind) {
    case 'topup':    return { ...b, topupCents:    b.topupCents    + amountCents };
    case 'income':   return { ...b, incomeCents:   b.incomeCents   + amountCents };
    case 'referral': return { ...b, referralCents: b.referralCents + amountCents };
  }
}

export function debit(b: Balances, kind: BalanceKind, amountCents: number): Balances {
  const result = credit(b, kind, -amountCents);
  if (kindValue(result, kind) < 0) {
    throw new Error(`Insufficient ${kind} balance: have ${kindValue(b, kind)}, need ${amountCents}`);
  }
  return result;
}

export function kindValue(b: Balances, kind: BalanceKind): number {
  switch (kind) {
    case 'topup':    return b.topupCents;
    case 'income':   return b.incomeCents;
    case 'referral': return b.referralCents;
  }
}

// Move referral → income (the only path before withdrawal).
export function transferReferralToIncome(b: Balances, amountCents: number): Balances {
  const debited = debit(b, 'referral', amountCents);
  return credit(debited, 'income', amountCents);
}

// Only the `income` balance is withdrawable.
export function canWithdrawFrom(kind: BalanceKind): boolean {
  return kind === WITHDRAWABLE_BALANCE;
}

export function balanceKindLabel(kind: BalanceKind): string {
  switch (kind) {
    case 'topup':    return 'Баланс пополнения';
    case 'income':   return 'Баланс дохода';
    case 'referral': return 'Реферальный баланс';
  }
}

export const ALL_BALANCE_KINDS = BALANCE_KINDS;
