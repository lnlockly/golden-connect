import { describe, expect, it } from 'vitest';
import { distributeNetworkingFund, scoreOf } from '../networking.js';
import { networkingCoefOf } from '../rules.js';

describe('networkingCoefOf', () => {
  it('grows monotonically with lot tier', () => {
    expect(networkingCoefOf(50)).toBe(1.0);
    expect(networkingCoefOf(300)).toBe(1.3);
    expect(networkingCoefOf(500)).toBe(1.5);
    expect(networkingCoefOf(700)).toBe(1.7);
    expect(networkingCoefOf(1000)).toBe(2.0);
  });
});

describe('scoreOf', () => {
  it('Алексей $500 × 3 talks = 4.5', () => {
    expect(scoreOf({ userId: 1, lotUsd: 500, talks: 3 })).toBe(4.5);
  });
  it('Мария $300 × 5 talks = 6.5', () => {
    expect(scoreOf({ userId: 2, lotUsd: 300, talks: 5 })).toBe(6.5);
  });
  it('Иван $1000 × 1 talk = 2.0', () => {
    expect(scoreOf({ userId: 3, lotUsd: 1000, talks: 1 })).toBe(2.0);
  });
});

describe('distributeNetworkingFund — series 11 worked example', () => {
  it('fund $1300 splits among Алексей/Мария/Иван per their scores', () => {
    const payouts = distributeNetworkingFund(130000, [
      { userId: 1, lotUsd: 500,  talks: 3 },   // 4.5
      { userId: 2, lotUsd: 300,  talks: 5 },   // 6.5
      { userId: 3, lotUsd: 1000, talks: 1 },   // 2.0
    ]);
    // Total score = 13. Shares: 4.5/13 ≈ 34.6%, 6.5/13 = 50%, 2/13 ≈ 15.4%.
    // Series text claims: $450 / $650 / $200 — let's check those are matched.
    expect(payouts[0].userId).toBe(1);
    expect(payouts[0].shareCents).toBe(45000);
    expect(payouts[1].userId).toBe(2);
    expect(payouts[1].shareCents).toBe(65000);
    expect(payouts[2].userId).toBe(3);
    expect(payouts[2].shareCents).toBe(20000);
    // Full fund spent (no leftover):
    const total = payouts.reduce((s, p) => s + p.shareCents, 0);
    expect(total).toBe(130000);
  });

  it('zero fund → zero payouts', () => {
    const payouts = distributeNetworkingFund(0, [
      { userId: 1, lotUsd: 500, talks: 3 },
    ]);
    expect(payouts[0].shareCents).toBe(0);
  });

  it('zero talks for everyone → zero payouts', () => {
    const payouts = distributeNetworkingFund(130000, [
      { userId: 1, lotUsd: 500, talks: 0 },
      { userId: 2, lotUsd: 300, talks: 0 },
    ]);
    expect(payouts.every(p => p.shareCents === 0)).toBe(true);
  });
});
