import { describe, expect, it } from 'vitest';
import { availableForWithdraw, checkWithdrawEligibility, withdrawExampleFor } from '../withdraw.js';

describe('checkWithdrawEligibility', () => {
  it('no closed lot → free to withdraw', () => {
    const r = checkWithdrawEligibility({
      lastClosedLotProceedsCents: null,
      newLotsActivatedSinceCents: 0,
    });
    expect(r.eligible).toBe(true);
    expect(r.reason).toBe('no_closed_lot');
  });

  it('$500 lot closed ($1000 proceeds) → need new lot ≥ $500', () => {
    const tooSmall = checkWithdrawEligibility({
      lastClosedLotProceedsCents: 100000,
      newLotsActivatedSinceCents: 30000,
    });
    expect(tooSmall.eligible).toBe(false);
    expect(tooSmall.requiredNewLotCents).toBe(50000);
    expect(tooSmall.shortfallCents).toBe(20000);

    const enough = checkWithdrawEligibility({
      lastClosedLotProceedsCents: 100000,
      newLotsActivatedSinceCents: 50000,
    });
    expect(enough.eligible).toBe(true);
  });
});

describe('availableForWithdraw', () => {
  it('eligible → returns full income balance', () => {
    expect(availableForWithdraw(20000, {
      eligible: true, reason: 'ok', requiredNewLotCents: 0, shortfallCents: 0,
    })).toBe(20000);
  });
  it('not eligible → 0', () => {
    expect(availableForWithdraw(20000, {
      eligible: false, reason: 'need_more_reinvest', requiredNewLotCents: 50000, shortfallCents: 30000,
    })).toBe(0);
  });
});

describe('withdrawExampleFor', () => {
  it('$500 example: doubled $1000, need new $500, withdraw $500+', () => {
    expect(withdrawExampleFor(500)).toContain('$500');
    expect(withdrawExampleFor(500)).toContain('$1000');
  });
});
