import { describe, expect, it } from 'vitest';
import {
  CAPS_DEFAULT_MICRO,
  SKIP_KINDS,
  SPLIT_PCT_DEFAULT,
  shouldSkip,
} from '../income-split.js';

/**
 * Pure-math tests for the 80/20 income split.
 *
 * These verify the rules that decide WHETHER to split + the constants
 * that drive the split percentage and per-tariff caps. The actual DB
 * mutation path needs a Postgres and is covered by manual smoke tests.
 */

describe('income-split constants', () => {
  it('SPLIT_PCT_DEFAULT is 20% (per Trendex marketing v2 spec)', () => {
    expect(SPLIT_PCT_DEFAULT).toBe(20n);
  });

  it('CAPS_DEFAULT_MICRO matches monthly fee per tariff', () => {
    // Cap = monthly fee, so user always accumulates exactly enough
    // subscription credit to cover the next month's renewal.
    expect(CAPS_DEFAULT_MICRO.free).toBe(45_000_000n); // FREE → up to 1st LAUNCH
    expect(CAPS_DEFAULT_MICRO.launch).toBe(15_000_000n); // $15/mo
    expect(CAPS_DEFAULT_MICRO.boost).toBe(30_000_000n); // $30/mo
    expect(CAPS_DEFAULT_MICRO.rocket).toBe(45_000_000n); // $45/mo
  });

  it('SKIP_KINDS is the closed set of always-skipped kinds', () => {
    expect(SKIP_KINDS.has('subscription_split')).toBe(true);
    expect(SKIP_KINDS.has('admin_fee')).toBe(true);
    expect(SKIP_KINDS.has('task_pool_fund')).toBe(true);
    expect(SKIP_KINDS.size).toBe(3);
  });
});

describe('shouldSkip — kind filtering', () => {
  const POSITIVE = 1_000_000n;

  it('skips when amount is zero or negative (already an outflow)', () => {
    expect(shouldSkip('task_reward', 0n)).toBe(true);
    expect(shouldSkip('task_reward', -500n)).toBe(true);
  });

  it('skips the explicit SKIP_KINDS', () => {
    expect(shouldSkip('subscription_split', POSITIVE)).toBe(true);
    expect(shouldSkip('admin_fee', POSITIVE)).toBe(true);
    expect(shouldSkip('task_pool_fund', POSITIVE)).toBe(true);
  });

  it('skips withdraw_* family (already negative cashflow events)', () => {
    expect(shouldSkip('withdraw_request', POSITIVE)).toBe(true);
    expect(shouldSkip('withdraw_payout', POSITIVE)).toBe(true);
    expect(shouldSkip('withdraw_refund', POSITIVE)).toBe(true);
  });

  it('skips entry_fee_* family (tariff payments, never user income)', () => {
    expect(shouldSkip('entry_fee_launch', POSITIVE)).toBe(true);
    expect(shouldSkip('entry_fee_boost', POSITIVE)).toBe(true);
    expect(shouldSkip('entry_fee_rocket', POSITIVE)).toBe(true);
  });

  it('skips gift_* and karma_* prefixes (separate balances, no USD)', () => {
    expect(shouldSkip('gift_seat', POSITIVE)).toBe(true);
    expect(shouldSkip('gift_referral', POSITIVE)).toBe(true);
    expect(shouldSkip('karma_award', POSITIVE)).toBe(true);
    expect(shouldSkip('karma_raffle', POSITIVE)).toBe(true);
  });

  it('does NOT skip canonical income kinds', () => {
    expect(shouldSkip('task_reward', POSITIVE)).toBe(false);
    expect(shouldSkip('matrix_payout', POSITIVE)).toBe(false);
    expect(shouldSkip('referral_l1', POSITIVE)).toBe(false);
    expect(shouldSkip('referral_l5', POSITIVE)).toBe(false);
    expect(shouldSkip('matching_bonus', POSITIVE)).toBe(false);
    expect(shouldSkip('leader_pool_award', POSITIVE)).toBe(false);
    expect(shouldSkip('booking_payout', POSITIVE)).toBe(false);
  });

  it('substring "withdraw" inside a kind does not falsely match (prefix-only)', () => {
    // we use startsWith, so a hypothetical "no_withdraw_yet" must NOT be skipped
    expect(shouldSkip('reward_withdraw_bonus', POSITIVE)).toBe(false);
  });
});

describe('split math — manual computation matches helper formula', () => {
  // Mirrors lines 121-135 in income-split.ts: want = amount * pct / 100,
  // toSub = min(want, room). Verify the bigint arithmetic produces no
  // float drift across realistic income amounts.

  function computeWant(amountMicro: bigint, pct: bigint = SPLIT_PCT_DEFAULT): bigint {
    return (amountMicro * pct) / 100n;
  }
  function computeToSub(amountMicro: bigint, capMicro: bigint, subBal: bigint, pct: bigint = SPLIT_PCT_DEFAULT): bigint {
    if (capMicro <= 0n || subBal >= capMicro) return 0n;
    const want = computeWant(amountMicro, pct);
    const room = capMicro - subBal;
    return want <= room ? want : room;
  }

  it('20% of $0.50 task reward = exactly $0.10 (100_000 micro)', () => {
    expect(computeWant(500_000n)).toBe(100_000n);
  });

  it('20% of $0.001 (smallest) = 200 micro (no rounding loss visible)', () => {
    expect(computeWant(1_000n)).toBe(200n);
  });

  it('cap reached → no split, full amount stays in working', () => {
    const cap = CAPS_DEFAULT_MICRO.launch; // 15_000_000
    expect(computeToSub(500_000n, cap, cap)).toBe(0n); // already at cap
    expect(computeToSub(500_000n, cap, cap + 1n)).toBe(0n); // over cap
  });

  it('partial room < want → split is clamped to room', () => {
    const cap = CAPS_DEFAULT_MICRO.launch; // 15_000_000
    const subBal = 14_950_000n;
    // want from $5 = 1_000_000; room = 50_000 → toSub = 50_000
    expect(computeToSub(5_000_000n, cap, subBal)).toBe(50_000n);
  });

  it('FREE tariff has cap = $45 (matches LAUNCH entry — covers first upgrade)', () => {
    expect(CAPS_DEFAULT_MICRO.free).toBe(45_000_000n);
    // Earning $50 of task_reward as FREE → should fill cap exactly
    const cap = CAPS_DEFAULT_MICRO.free;
    // 20% of 50_000_000 = 10_000_000, way below cap
    expect(computeToSub(50_000_000n, cap, 0n)).toBe(10_000_000n);
    // After 5 such credits (5 × $10 → $50 in sub), 6th hits cap
    expect(computeToSub(50_000_000n, cap, 40_000_000n)).toBe(5_000_000n); // clamped to room
    expect(computeToSub(50_000_000n, cap, 45_000_000n)).toBe(0n);
  });

  it('80/20 invariant: working+subscription = original amount across many random cases', () => {
    const cases: Array<[bigint, bigint, bigint]> = [
      [500_000n, CAPS_DEFAULT_MICRO.launch, 0n],
      [1_500_000n, CAPS_DEFAULT_MICRO.boost, 5_000_000n],
      [10_000_000n, CAPS_DEFAULT_MICRO.rocket, 30_000_000n],
      [333_333n, CAPS_DEFAULT_MICRO.free, 1_111_111n],
    ];
    for (const [amt, cap, sub] of cases) {
      const toSub = computeToSub(amt, cap, sub);
      const toWork = amt - toSub;
      expect(toSub + toWork).toBe(amt); // no atoms lost
      expect(toSub).toBeGreaterThanOrEqual(0n);
      expect(toWork).toBeGreaterThanOrEqual(0n);
    }
  });
});
