/**
 * Entry processor integration tests.
 *
 * Gated on DATABASE_URL_TEST — skipped (pure test pass) when unset. When
 * set, the suite TRUNCATEs relevant tables between cases. Never point
 * DATABASE_URL_TEST at a database you care about.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, sql } from 'drizzle-orm';

import { processEntry } from '../entry-processor.js';
import * as schema from '../../db/schema.js';
import {
  cashLedger,
  inviteEdges,
  matrixAccruals,
  matrixPositions,
  referralAccruals,
  tariffs,
  userTariffs,
  users,
} from '../../db/schema.js';

const TEST_URL = process.env.DATABASE_URL_TEST;
const hasDb = Boolean(TEST_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('entry-processor integration', () => {
  const client = postgres(TEST_URL ?? 'postgres://invalid', { prepare: false });
  const testDb = drizzle(client, { schema });
  type TestDB = typeof testDb;

  const reset = async () => {
    await testDb.execute(sql`
      TRUNCATE TABLE
        referral_accruals,
        matrix_accruals,
        matrix_positions,
        cash_ledger,
        user_tariffs,
        tariffs,
        invite_edges,
        users
      RESTART IDENTITY CASCADE
    `);
  };

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  beforeEach(reset);

  const insertUser = async (refCode: string): Promise<number> => {
    const [row] = await testDb.insert(users).values({ refCode }).returning({ id: users.id });
    return Number(row!.id);
  };

  const insertTariff = async (code: string, entryMicro: bigint, dailyCapMicro: bigint) => {
    const [row] = await testDb
      .insert(tariffs)
      .values({
        code,
        name: code,
        entryMicro,
        dailyCapMicro,
        monthlyFeeMicro: entryMicro,
      })
      .returning({ id: tariffs.id });
    return Number(row!.id);
  };

  /** Seeds admin + 12 fillers + A..G. Places admin/fillers/G in matrix so G
   *  lands at position 13 (three matrix ancestors: pos 4, pos 1, pos 0).
   *  Invite chain: admin → A → B → C → D → E → F → G. */
  const seedDeepTree = async () => {
    const adminId = await insertUser('admin-root');
    await testDb.insert(matrixPositions).values({ userId: adminId, position: 0 });

    const fillers: number[] = [];
    for (let i = 1; i <= 12; i++) {
      const uid = await insertUser(`filler-${i}`);
      fillers.push(uid);
      await testDb.insert(matrixPositions).values({ userId: uid, position: i });
    }

    const chain: Record<string, number> = {};
    let prev = adminId;
    for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const uid = await insertUser(`chain-${name}`);
      chain[name] = uid;
      await testDb
        .insert(inviteEdges)
        .values({ childUserId: uid, parentUserId: prev });
      prev = uid;
    }

    // G gets matrix position 13 — three ancestors at positions 4, 1, 0.
    await testDb
      .insert(matrixPositions)
      .values({ userId: chain.G!, position: 13 });

    return {
      adminId,
      fillers,
      chain,
      matrixUserAtPos: [adminId, ...fillers, chain.G!], // index = position
    };
  };

  it('G pays $100 core entry → 40/40/15/5 split, sum of ledger rows = 0', async () => {
    const { adminId, chain, matrixUserAtPos } = await seedDeepTree();
    const coreId = await insertTariff('rocket', 100_000_000n, 30_000_000n);

    const result = await processEntry({
      userId: chain.G!,
      tariffId: coreId,
      paymentRefId: 'test-ref-1',
    });

    expect(result.ok).toBe(true);
    expect(result.entryMicro).toBe(100_000_000n);
    expect(result.runningSumMicro).toBe(0n);
    expect(result.totalDistributedMicro).toBe(100_000_000n);
    expect(result.matrixPosition).toBe(13);
    expect(result.referralsPaidLevels).toBe(5);
    expect(result.adminFeeMicro).toBe(5_000_000n);

    // Entry fee row: -100M for G.
    const entryRows = await testDb
      .select()
      .from(cashLedger)
      .where(eq(cashLedger.kind, 'entry_fee'));
    expect(entryRows).toHaveLength(1);
    expect(entryRows[0]!.amountMicro).toBe(-100_000_000n);
    expect(Number(entryRows[0]!.userId)).toBe(chain.G);

    // Matrix: 3 rows at positions 4, 1, 0 summing to 40M.
    const matrixRows = await testDb
      .select()
      .from(matrixAccruals)
      .orderBy(matrixAccruals.level);
    expect(matrixRows).toHaveLength(3);
    const matrixSum = matrixRows.reduce((a, r) => a + r.amountMicro, 0n);
    expect(matrixSum).toBe(40_000_000n);
    expect(matrixRows.map((r) => Number(r.recipientUserId))).toEqual([
      matrixUserAtPos[4],
      matrixUserAtPos[1],
      matrixUserAtPos[0],
    ]);
    for (const r of matrixRows) {
      expect(Number(r.fromUserId)).toBe(chain.G);
      expect(Number(r.fromPosition)).toBe(13);
    }

    // Task pool: 40M to admin, kind task_pool_fund.
    const pool = await testDb
      .select()
      .from(cashLedger)
      .where(eq(cashLedger.kind, 'task_pool_fund'));
    expect(pool).toHaveLength(1);
    expect(pool[0]!.amountMicro).toBe(40_000_000n);
    expect(Number(pool[0]!.userId)).toBe(adminId);

    // Referrals: L1=F 5M, L2=E 4M, L3=D 3M, L4=C 2M, L5=B 1M.
    const refs = await testDb
      .select()
      .from(referralAccruals)
      .orderBy(referralAccruals.level);
    expect(refs).toHaveLength(5);
    expect(refs.map((r) => ({ uid: Number(r.recipientUserId), amt: r.amountMicro }))).toEqual([
      { uid: chain.F!, amt: 5_000_000n },
      { uid: chain.E!, amt: 4_000_000n },
      { uid: chain.D!, amt: 3_000_000n },
      { uid: chain.C!, amt: 2_000_000n },
      { uid: chain.B!, amt: 1_000_000n },
    ]);

    // Admin fee 5pct row.
    const adminFee = await testDb
      .select()
      .from(cashLedger)
      .where(eq(cashLedger.memo, 'entry_split_5pct'));
    expect(adminFee).toHaveLength(1);
    expect(adminFee[0]!.amountMicro).toBe(5_000_000n);
    expect(Number(adminFee[0]!.userId)).toBe(adminId);
    expect(adminFee[0]!.kind).toBe('admin_fee');

    // Invariant: sum of ALL cash_ledger rows = 0.
    const [{ total }] = (await testDb.execute<{ total: string }>(sql`
      SELECT COALESCE(SUM(amount_micro), 0)::text AS total FROM cash_ledger
    `)) as unknown as [{ total: string }];
    expect(BigInt(total)).toBe(0n);

    // user_tariffs row is active with +30d window.
    const ut = await testDb
      .select()
      .from(userTariffs)
      .where(eq(userTariffs.userId, chain.G!));
    expect(ut).toHaveLength(1);
    expect(ut[0]!.isActive).toBe(true);
    expect(ut[0]!.activeUntil).not.toBeNull();
    const diffMs =
      (ut[0]!.activeUntil as Date).getTime() - (ut[0]!.activeSince as Date).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(diffMs - thirtyDaysMs)).toBeLessThan(1000);
  });

  it('processEntry without matrix position auto-assigns the next slot', async () => {
    const { chain } = await seedDeepTree();
    const coreId = await insertTariff('rocket2', 100_000_000n, 30_000_000n);

    // Strip G's pre-assigned position — processEntry must auto-assign.
    await testDb
      .delete(matrixPositions)
      .where(eq(matrixPositions.userId, chain.G!));

    const result = await processEntry({
      userId: chain.G!,
      tariffId: coreId,
    });

    // Positions 0..12 are taken; assignPosition should pick 13.
    expect(result.matrixPosition).toBe(13);
    expect(result.runningSumMicro).toBe(0n);

    const placed = await testDb
      .select()
      .from(matrixPositions)
      .where(eq(matrixPositions.userId, chain.G!));
    expect(placed).toHaveLength(1);
    expect(Number(placed[0]!.position)).toBe(13);
  });

  it('entry with no admin at position 0 throws and rolls back the whole tx', async () => {
    // Seed: just G with an invite to an inviter — no admin at pos 0, so
    // taskPool.accrueToPool will throw.
    const inviter = await insertUser('inviter-noadmin');
    const g = await insertUser('g-noadmin');
    await testDb.insert(inviteEdges).values({ childUserId: g, parentUserId: inviter });
    // Give G a matrix position so the matrix lookup itself doesn't trip first;
    // but admin (pos 0) is deliberately absent → matrix.accrueFromEntry will
    // also raise ('admin position 0 not seeded'). Either way the tx rolls back.
    await testDb.insert(matrixPositions).values({ userId: g, position: 1 });

    const coreId = await insertTariff('rocket3', 100_000_000n, 30_000_000n);

    await expect(
      processEntry({ userId: g, tariffId: coreId }),
    ).rejects.toThrow();

    // Nothing written — no ledger rows, no user_tariffs row.
    const ledger = await testDb.select().from(cashLedger);
    expect(ledger).toHaveLength(0);
    const uts = await testDb.select().from(userTariffs);
    expect(uts).toHaveLength(0);
  });

  it('second entry by the same user re-uses matrix position (and trips matrix uniqueness)', async () => {
    const { chain } = await seedDeepTree();
    const coreId = await insertTariff('rocket4', 100_000_000n, 30_000_000n);

    await processEntry({ userId: chain.G!, tariffId: coreId });

    const posBefore = await testDb
      .select()
      .from(matrixPositions)
      .where(eq(matrixPositions.userId, chain.G!));
    expect(posBefore).toHaveLength(1);

    // Matrix accrual unique (from_user, level) blocks a second round; the
    // whole tx rolls back. Position row is untouched.
    await expect(
      processEntry({ userId: chain.G!, tariffId: coreId }),
    ).rejects.toThrow();

    const posAfter = await testDb
      .select()
      .from(matrixPositions)
      .where(eq(matrixPositions.userId, chain.G!));
    expect(posAfter).toHaveLength(1);
    expect(Number(posAfter[0]!.position)).toBe(Number(posBefore[0]!.position));
  });
});

/** Always-on smoke test so the suite is not empty when DATABASE_URL_TEST is unset. */
describe('entry-processor module smoke', () => {
  it('exports processEntry', async () => {
    const mod = await import('../entry-processor.js');
    expect(typeof mod.processEntry).toBe('function');
  });
});
