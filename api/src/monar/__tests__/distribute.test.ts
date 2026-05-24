import { describe, expect, it } from 'vitest';
import {
  distributeLotClosure,
  distributeLotPurchase,
  distributePlaceEntry,
} from '../distribute.js';
import { PLACE_COST_CENTS, LOT_SPECS } from '../rules.js';

describe('distributePlaceEntry — first entry', () => {
  it('gives 60% to owner ($6 of $10)', () => {
    const d = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [],
      entryIndex: 1,
    });
    expect(d.ownerCents).toBe(600);
    expect(d.reinvest).toBe(false);
  });

  it('splits 5-level referral ladder when full upline present', () => {
    const d = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [101, 102, 103, 104, 105],
      entryIndex: 1,
    });
    expect(d.refs).toHaveLength(5);
    expect(d.refs.map(r => r.cents)).toEqual([100, 50, 30, 20, 10]); // 10/5/3/2/1 of $10
  });

  it('arithmetic balances for full upline (sum equals $10)', () => {
    const d = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [101, 102, 103, 104, 105],
      entryIndex: 1,
    });
    const refsSum = d.refs.reduce((s, r) => s + r.cents, 0);
    const total =
      d.ownerCents + refsSum + d.worldPoolCents +
      d.networkingCents + d.eventsFundCents + d.infraCents;
    expect(total).toBe(PLACE_COST_CENTS);
  });

  it('missing upline overflows into world pool', () => {
    const noUpline = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [],
      entryIndex: 1,
    });
    const fullUpline = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [101, 102, 103, 104, 105],
      entryIndex: 1,
    });
    // No upline → all 21% ref budget overflows to world pool
    expect(noUpline.worldPoolCents).toBe(fullUpline.worldPoolCents + 210);
  });
});

describe('distributePlaceEntry — second entry', () => {
  it('signals reinvest, nothing distributed', () => {
    const d = distributePlaceEntry({
      ownerUserId: 1,
      uplineUserIds: [101, 102],
      entryIndex: 2,
    });
    expect(d.reinvest).toBe(true);
    expect(d.ownerCents).toBe(0);
    expect(d.refs).toHaveLength(0);
    expect(d.totalCents).toBe(0);
  });
});

describe('distributeLotPurchase', () => {
  it('$500 splits into 15 business + 35 technical places', () => {
    const split = distributeLotPurchase({ userId: 1, lotUsd: 500 });
    expect(split.businessPlaces).toBe(15);
    expect(split.technicalLots).toBe(35);
    expect(split.ownerBusinessCents).toBe(15 * PLACE_COST_CENTS);    // $150
    expect(split.systemTechnicalCents).toBe(35 * PLACE_COST_CENTS);  // $350
    expect(split.totalCents).toBe(50000);                            // $500
  });

  it('$1000 has 32 business places', () => {
    const split = distributeLotPurchase({ userId: 1, lotUsd: 1000 });
    expect(split.businessPlaces).toBe(32);
    expect(split.totalCents).toBe(100000);
  });

  it('total always equals lot price', () => {
    for (const lot of Object.keys(LOT_SPECS).map(Number) as Array<keyof typeof LOT_SPECS>) {
      const split = distributeLotPurchase({ userId: 1, lotUsd: lot });
      expect(split.totalCents).toBe(lot * 100);
    }
  });
});

describe('distributeLotClosure', () => {
  it('$500 closes to $1000, 50/50 income/reinvest', () => {
    const p = distributeLotClosure({ userId: 1, lotUsd: 500 });
    expect(p.totalProceedsCents).toBe(100000);
    expect(p.toIncomeBalanceCents).toBe(50000);
    expect(p.toReinvestCents).toBe(50000);
  });

  it('halves add up to total', () => {
    const p = distributeLotClosure({ userId: 1, lotUsd: 1000 });
    expect(p.toIncomeBalanceCents + p.toReinvestCents).toBe(p.totalProceedsCents);
  });
});
