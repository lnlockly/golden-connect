import { describe, expect, it } from 'vitest';
import { allocatePayment } from '../tariff-buy.js';

/**
 * Pure-math tests for the wallet-allocation step of buyTariffFromBalance.
 *
 * The allocator decides how a tariff cost is split between subscription
 * and working balances under three source policies. Production code calls
 * this and then transfers funds in a transaction; we validate the
 * arithmetic in isolation.
 */

const COST_LAUNCH = 45_000_000n;   // $45 in micros
const COST_BOOST = 90_000_000n;    // $90
const COST_ROCKET = 135_000_000n;  // $135

describe('allocatePayment — subscription_first (default)', () => {
  it('drains subscription first, tops up from working', () => {
    const r = allocatePayment(COST_LAUNCH, 30_000_000n, 50_000_000n, 'subscription_first');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(30_000_000n);
    expect(r.fromWork).toBe(15_000_000n);
    expect(r.fromSub + r.fromWork).toBe(COST_LAUNCH);
  });

  it('uses subscription only when subscription >= cost', () => {
    const r = allocatePayment(COST_LAUNCH, 100_000_000n, 50_000_000n, 'subscription_first');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(COST_LAUNCH);
    expect(r.fromWork).toBe(0n);
  });

  it('uses working only when subscription is empty', () => {
    const r = allocatePayment(COST_LAUNCH, 0n, 100_000_000n, 'subscription_first');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(0n);
    expect(r.fromWork).toBe(COST_LAUNCH);
  });

  it('fails with insufficient_funds when neither nor combined cover cost', () => {
    const r = allocatePayment(COST_BOOST, 30_000_000n, 50_000_000n, 'subscription_first');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_funds');
    expect(r.fromSub).toBe(0n);
    expect(r.fromWork).toBe(0n);
  });

  it('exact fit at boundary: combined exactly = cost', () => {
    const r = allocatePayment(COST_LAUNCH, 20_000_000n, 25_000_000n, 'subscription_first');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(20_000_000n);
    expect(r.fromWork).toBe(25_000_000n);
  });
});

describe('allocatePayment — working_first', () => {
  it('drains working first, tops up from subscription', () => {
    const r = allocatePayment(COST_LAUNCH, 50_000_000n, 30_000_000n, 'working_first');
    expect(r.ok).toBe(true);
    expect(r.fromWork).toBe(30_000_000n);
    expect(r.fromSub).toBe(15_000_000n);
    expect(r.fromSub + r.fromWork).toBe(COST_LAUNCH);
  });

  it('uses working only when working >= cost', () => {
    const r = allocatePayment(COST_LAUNCH, 50_000_000n, 100_000_000n, 'working_first');
    expect(r.ok).toBe(true);
    expect(r.fromWork).toBe(COST_LAUNCH);
    expect(r.fromSub).toBe(0n);
  });

  it('uses subscription only when working empty', () => {
    const r = allocatePayment(COST_LAUNCH, 100_000_000n, 0n, 'working_first');
    expect(r.ok).toBe(true);
    expect(r.fromWork).toBe(0n);
    expect(r.fromSub).toBe(COST_LAUNCH);
  });

  it('fails with insufficient_funds when combined < cost', () => {
    const r = allocatePayment(COST_ROCKET, 50_000_000n, 50_000_000n, 'working_first');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_funds');
  });
});

describe('allocatePayment — subscription_only', () => {
  it('passes when subscription alone >= cost (working unused)', () => {
    const r = allocatePayment(COST_LAUNCH, 100_000_000n, 0n, 'subscription_only');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(COST_LAUNCH);
    expect(r.fromWork).toBe(0n);
  });

  it('exact fit: subscription == cost', () => {
    const r = allocatePayment(COST_BOOST, COST_BOOST, 1_000_000_000n, 'subscription_only');
    expect(r.ok).toBe(true);
    expect(r.fromSub).toBe(COST_BOOST);
    expect(r.fromWork).toBe(0n);
  });

  it('fails with insufficient_subscription when sub < cost (even if working would cover)', () => {
    const r = allocatePayment(COST_LAUNCH, 30_000_000n, 1_000_000_000n, 'subscription_only');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_subscription');
    expect(r.fromSub).toBe(0n);
    expect(r.fromWork).toBe(0n);
  });
});

describe('allocatePayment — invariants across all tariffs', () => {
  const tariffs: Array<[string, bigint]> = [
    ['LAUNCH', COST_LAUNCH],
    ['BOOST', COST_BOOST],
    ['ROCKET', COST_ROCKET],
  ];

  it.each(tariffs)('fromSub + fromWork === cost when ok (%s)', (_name, cost) => {
    const policies: Array<'subscription_first' | 'working_first' | 'subscription_only'> = [
      'subscription_first', 'working_first', 'subscription_only',
    ];
    for (const policy of policies) {
      const r = allocatePayment(cost, cost, cost, policy); // both wallets fully fund it
      expect(r.ok).toBe(true);
      expect(r.fromSub + r.fromWork).toBe(cost);
    }
  });

  it.each(tariffs)('fromSub/fromWork == 0 when fails (%s)', (_name, cost) => {
    const r = allocatePayment(cost, 0n, 0n, 'subscription_first');
    expect(r.ok).toBe(false);
    expect(r.fromSub).toBe(0n);
    expect(r.fromWork).toBe(0n);
  });
});
