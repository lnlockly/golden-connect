import { describe, expect, it } from 'vitest';
import { decideAutoActivate, distributeMonthlyPool, periodOf } from '../world-pool.js';

describe('distributeMonthlyPool', () => {
  it('splits into 8 buckets', () => {
    const buckets = distributeMonthlyPool(
      { period: '2026-05', totalCents: 80000 },
      [{ userId: 1, lotUsd: 1000 }],
    );
    expect(buckets).toHaveLength(8);
    for (const b of buckets) expect(b.bucketCents).toBe(10000);
  });

  it('access tier: $300 gets only bucket 0', () => {
    const buckets = distributeMonthlyPool(
      { period: '2026-05', totalCents: 80000 },
      [{ userId: 1, lotUsd: 300 }, { userId: 2, lotUsd: 1000 }],
    );
    expect(buckets[0].perUserCents[1]).toBeGreaterThan(0);
    expect(buckets[1].perUserCents[1]).toBeUndefined();
    expect(buckets[7].perUserCents[2]).toBeGreaterThan(0);
  });

  it('$1000 user gets share in all 8 buckets', () => {
    const buckets = distributeMonthlyPool(
      { period: '2026-05', totalCents: 80000 },
      [{ userId: 1, lotUsd: 1000 }],
    );
    for (const b of buckets) {
      expect(b.perUserCents[1]).toBe(10000); // sole participant in every bucket
    }
  });

  it('two equal participants in bucket → split 50/50', () => {
    const buckets = distributeMonthlyPool(
      { period: '2026-05', totalCents: 80000 },
      [{ userId: 1, lotUsd: 1000 }, { userId: 2, lotUsd: 1000 }],
    );
    // Bucket 0 splits 10000 between two equal users → 5000 each
    expect(buckets[0].perUserCents[1]).toBe(5000);
    expect(buckets[0].perUserCents[2]).toBe(5000);
  });
});

describe('decideAutoActivate', () => {
  it('$550 → activates $500 lot, $50 remainder', () => {
    const r = decideAutoActivate({ userId: 1, amountCents: 55000 });
    expect(r.newLotUsd).toBe(500);
    expect(r.newLotCostCents).toBe(50000);
    expect(r.remainderToIncomeCents).toBe(5000);
  });

  it('$2500 → activates $1000 lot, $1500 remainder', () => {
    const r = decideAutoActivate({ userId: 1, amountCents: 250000 });
    expect(r.newLotUsd).toBe(1000);
    expect(r.newLotCostCents).toBe(100000);
    expect(r.remainderToIncomeCents).toBe(150000);
  });

  it('amount below $300 (min lot) → no activation', () => {
    const r = decideAutoActivate({ userId: 1, amountCents: 20000 });
    expect(r.newLotUsd).toBeNull();
    expect(r.remainderToIncomeCents).toBe(20000);
  });
});

describe('periodOf', () => {
  it('formats UTC date as YYYY-MM', () => {
    expect(periodOf(new Date('2026-05-24T15:00:00Z'))).toBe('2026-05');
    expect(periodOf(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01');
    expect(periodOf(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
  });
});
