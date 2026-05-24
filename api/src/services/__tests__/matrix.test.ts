/**
 * Tests for the matrix engine (src/services/matrix.ts).
 *
 * Two layers:
 *  1. Pure math (parentPosition, depthOfPosition, aboveN) — always run.
 *  2. DB integration (assignPosition, getAbove3, accrueFromEntry) — gated
 *     on the env var DATABASE_URL_TEST. Set it to a disposable Postgres
 *     (e.g. a throwaway Neon branch) before running:
 *
 *        DATABASE_URL_TEST='postgres://…' npx vitest run
 *
 *     The integration block will TRUNCATE the matrix/ledger/user tables
 *     on that database between tests, so NEVER point DATABASE_URL_TEST at
 *     a database you care about. If the env var is absent, those tests
 *     are skipped and vitest still passes.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

import {
  MATRIX_WIDTH,
  aboveN,
  accrueFromEntry,
  assignPosition,
  depthOfPosition,
  getAbove3,
  parentPosition,
} from '../matrix.js';
import * as schema from '../../db/schema.js';
import { cashLedger, matrixAccruals, matrixPositions, users } from '../../db/schema.js';

describe('matrix position math', () => {
  it('MATRIX_WIDTH is 2 (binary tree)', () => {
    expect(MATRIX_WIDTH).toBe(2);
  });

  it('root has no parent', () => {
    expect(parentPosition(0)).toBeNull();
  });

  it('first generation maps to root', () => {
    expect(parentPosition(1)).toBe(0);
    expect(parentPosition(2)).toBe(0);
  });

  it('second generation maps to positions 1..2 (binary tree)', () => {
    expect(parentPosition(3)).toBe(1);
    expect(parentPosition(4)).toBe(1);
    expect(parentPosition(5)).toBe(2);
    expect(parentPosition(6)).toBe(2);
  });

  it('deeper positions match binary-tree formula', () => {
    expect(parentPosition(40)).toBe(19);
    expect(parentPosition(19)).toBe(9);
    expect(parentPosition(9)).toBe(4);
    expect(parentPosition(4)).toBe(1);
    expect(parentPosition(1)).toBe(0);
  });

  it('depth values for binary tree: 0,1,2..n', () => {
    expect(depthOfPosition(0)).toBe(0);
    expect(depthOfPosition(1)).toBe(1);
    expect(depthOfPosition(2)).toBe(1);
    expect(depthOfPosition(3)).toBe(2);
    expect(depthOfPosition(6)).toBe(2);
    expect(depthOfPosition(7)).toBe(3);
    expect(depthOfPosition(14)).toBe(3);
    expect(depthOfPosition(15)).toBe(4);
  });

  it('aboveN returns nearest-first chain, stopping at root (binary tree)', () => {
    expect(aboveN(40, 3)).toEqual([19, 9, 4]);
    expect(aboveN(13, 3)).toEqual([6, 2, 0]);
    expect(aboveN(4, 3)).toEqual([1, 0]);
    expect(aboveN(2, 3)).toEqual([0]);
    expect(aboveN(0, 3)).toEqual([]);
  });
});

const TEST_URL = process.env.DATABASE_URL_TEST;
const hasDb = Boolean(TEST_URL);

const describeDb = hasDb ? describe : describe.skip;

describeDb('matrix DB integration', () => {
  const client = postgres(TEST_URL ?? 'postgres://invalid', { prepare: false });
  const testDb = drizzle(client, { schema });

  const reset = async () => {
    await testDb.execute(
      sql`TRUNCATE TABLE matrix_accruals, matrix_positions, cash_ledger, users RESTART IDENTITY CASCADE`,
    );
  };

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  beforeEach(reset);

  const seedUsers = async (n: number) => {
    const values = Array.from({ length: n }, (_, i) => ({ refCode: `test-ref-${i}` }));
    const rows = await testDb.insert(users).values(values).returning({ id: users.id });
    return rows.map((r) => Number(r.id));
  };

  /** Seed positions 0..n-1 with n freshly inserted users. Returns userIds[i] = user at position i. */
  const seedDenseMatrix = async (n: number): Promise<number[]> => {
    const userIds = await seedUsers(n);
    await testDb.insert(matrixPositions).values(
      userIds.map((uid, i) => ({ userId: uid, position: i })),
    );
    return userIds;
  };

  it('assignPosition produces a dense sequence 0..9 across 10 sequential calls', async () => {
    const userIds = await seedUsers(10);
    const positions: number[] = [];
    for (const uid of userIds) {
      const p = await testDb.transaction(async (tx) =>
        assignPosition(uid, tx as unknown as typeof testDb),
      );
      positions.push(p);
    }
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rows = await testDb
      .select({ userId: matrixPositions.userId, position: matrixPositions.position })
      .from(matrixPositions)
      .orderBy(matrixPositions.position);
    expect(rows.map((r) => ({ userId: Number(r.userId), position: Number(r.position) }))).toEqual(
      userIds.map((uid, i) => ({ userId: uid, position: i })),
    );
  });

  it('getAbove3 on position 40 returns ancestors at positions 13, 4, 1', async () => {
    const userIds = await seedDenseMatrix(41);
    const above = await getAbove3(userIds[40], testDb);
    expect(above).toEqual([userIds[13], userIds[4], userIds[1]]);
  });

  it('getAbove3 on position 2 returns only the root user', async () => {
    const userIds = await seedDenseMatrix(3);
    const above = await getAbove3(userIds[2], testDb);
    expect(above).toEqual([userIds[0]]);
  });

  it('getAbove3 on root is empty', async () => {
    const userIds = await seedDenseMatrix(1);
    const above = await getAbove3(userIds[0], testDb);
    expect(above).toEqual([]);
  });

  it('getAbove3 on a user with no matrix position is empty', async () => {
    const [stray] = await seedUsers(1);
    const above = await getAbove3(stray, testDb);
    expect(above).toEqual([]);
  });

  it('accrueFromEntry at position 40 with $300 pays 3 × $40 with no dust', async () => {
    const userIds = await seedDenseMatrix(41);
    const entryMicro = 300_000_000n;
    const tariffId = 1;
    const result = await testDb.transaction(async (tx) =>
      accrueFromEntry(userIds[40], entryMicro, tariffId, tx as unknown as typeof testDb),
    );
    expect(result.poolMicro).toBe(120_000_000n);
    expect(result.adminFeeMicro).toBe(0n);
    expect(result.shares).toEqual([
      { level: 1, recipientUserId: userIds[13], amountMicro: 40_000_000n },
      { level: 2, recipientUserId: userIds[4], amountMicro: 40_000_000n },
      { level: 3, recipientUserId: userIds[1], amountMicro: 40_000_000n },
    ]);

    const ledger = await testDb
      .select()
      .from(cashLedger)
      .orderBy(cashLedger.id);
    expect(ledger).toHaveLength(3);
    for (const row of ledger) {
      expect(row.kind).toBe('matrix_share');
      expect(Number(row.relatedUserId)).toBe(userIds[40]);
      expect(row.amountMicro).toBe(40_000_000n);
      expect(row.memo).toBe('entry:tariff:1');
    }
    expect(ledger.map((r) => r.level)).toEqual([1, 2, 3]);
    expect(ledger.map((r) => Number(r.userId))).toEqual([userIds[13], userIds[4], userIds[1]]);

    const accruals = await testDb
      .select()
      .from(matrixAccruals)
      .orderBy(matrixAccruals.level);
    expect(accruals).toHaveLength(3);
    for (const a of accruals) {
      expect(Number(a.fromUserId)).toBe(userIds[40]);
      expect(Number(a.fromPosition)).toBe(40);
      expect(a.amountMicro).toBe(40_000_000n);
      expect(a.ledgerId).not.toBeNull();
    }
  });

  it('accrueFromEntry with $100 splits pool 13.33 + 13.33 + 13.34 with last share absorbing the remainder', async () => {
    const userIds = await seedDenseMatrix(41);
    const entryMicro = 100_000_000n;
    const result = await testDb.transaction(async (tx) =>
      accrueFromEntry(userIds[40], entryMicro, 2, tx as unknown as typeof testDb),
    );
    // 40% of 100 = 40 → pool 40_000_000 micro.
    expect(result.poolMicro).toBe(40_000_000n);
    expect(result.adminFeeMicro).toBe(0n);
    expect(result.shares.map((s) => s.amountMicro)).toEqual([
      13_333_333n,
      13_333_333n,
      13_333_334n,
    ]);
    // Total paid out = pool, no dust.
    const total = result.shares.reduce((acc, s) => acc + s.amountMicro, 0n);
    expect(total).toBe(result.poolMicro);

    const ledger = await testDb
      .select({ amountMicro: cashLedger.amountMicro, level: cashLedger.level })
      .from(cashLedger)
      .orderBy(cashLedger.id);
    expect(ledger.map((r) => r.amountMicro)).toEqual([13_333_333n, 13_333_333n, 13_333_334n]);
    expect(ledger.map((r) => r.level)).toEqual([1, 2, 3]);
  });

  it('accrueFromEntry for a user with only 1 upline sweeps the missing 2 shares to admin_fee', async () => {
    // Seed just 3 users at positions 0, 1, 2. User at position 2 has one ancestor (pos 0 / admin).
    const userIds = await seedDenseMatrix(3);
    const entryMicro = 300_000_000n;
    const result = await testDb.transaction(async (tx) =>
      accrueFromEntry(userIds[2], entryMicro, 5, tx as unknown as typeof testDb),
    );
    expect(result.poolMicro).toBe(120_000_000n);
    expect(result.shares).toEqual([
      { level: 1, recipientUserId: userIds[0], amountMicro: 40_000_000n },
    ]);
    expect(result.adminFeeMicro).toBe(80_000_000n);
    expect(result.adminUserId).toBe(userIds[0]);

    const ledger = await testDb
      .select()
      .from(cashLedger)
      .orderBy(cashLedger.id);
    // 1 matrix_share + 1 admin_fee row.
    expect(ledger).toHaveLength(2);
    expect(ledger[0].kind).toBe('matrix_share');
    expect(ledger[0].amountMicro).toBe(40_000_000n);
    expect(Number(ledger[0].userId)).toBe(userIds[0]);
    expect(ledger[1].kind).toBe('admin_fee');
    expect(ledger[1].amountMicro).toBe(80_000_000n);
    expect(Number(ledger[1].userId)).toBe(userIds[0]);
    expect(ledger[1].memo).toBe('matrix_no_upstream');
    expect(Number(ledger[1].relatedUserId)).toBe(userIds[2]);

    // Only level=1 matrix_accrual row written.
    const accruals = await testDb.select().from(matrixAccruals);
    expect(accruals).toHaveLength(1);
    expect(accruals[0].level).toBe(1);
    expect(Number(accruals[0].recipientUserId)).toBe(userIds[0]);
  });

  it('accrueFromEntry refuses to run if the payer has no matrix position', async () => {
    const [orphan] = await seedUsers(1);
    await expect(
      testDb.transaction(async (tx) =>
        accrueFromEntry(orphan, 100_000_000n, 1, tx as unknown as typeof testDb),
      ),
    ).rejects.toThrow(/no matrix position/);
  });

  it('matrix_accruals uniqueness prevents a second accrual for the same payer+level', async () => {
    const userIds = await seedDenseMatrix(41);
    await testDb.transaction(async (tx) =>
      accrueFromEntry(userIds[40], 300_000_000n, 1, tx as unknown as typeof testDb),
    );
    await expect(
      testDb.transaction(async (tx) =>
        accrueFromEntry(userIds[40], 300_000_000n, 1, tx as unknown as typeof testDb),
      ),
    ).rejects.toThrow();
  });
});
