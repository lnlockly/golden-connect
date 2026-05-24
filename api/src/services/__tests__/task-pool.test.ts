/**
 * Tests for the task pool + daily cap service (src/services/task-pool.ts).
 *
 * Gated on env var DATABASE_URL_TEST. When set, the test TRUNCATEs the
 * task_completions / ad_impressions / cash_ledger / user_tariffs /
 * matrix_* / users / tariffs tables between tests and re-seeds the 8
 * tariffs from DAILY_CAP_BY_TARIFF so the suite owns its fixtures end
 * to end. NEVER point DATABASE_URL_TEST at a database you care about.
 * Without the env var the suite is skipped and vitest still passes.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { and, eq, sql } from 'drizzle-orm';

import {
  DAILY_CAP_BY_TARIFF,
  accrueToPool,
  completeTask,
  getTodayEarnings,
  type TariffCode,
} from '../task-pool.js';
import * as schema from '../../db/schema.js';
import {
  cashLedger,
  matrixPositions,
  tariffs,
  userTariffs,
  users,
} from '../../db/schema.js';

describe('DAILY_CAP_BY_TARIFF constant', () => {
  it('covers all 4 active tariff codes with Marketing v2 micro-USD caps', () => {
    expect(DAILY_CAP_BY_TARIFF.free).toBe(20_000_000n);
    expect(DAILY_CAP_BY_TARIFF.launch).toBe(50_000_000n);
    expect(DAILY_CAP_BY_TARIFF.boost).toBe(80_000_000n);
    expect(DAILY_CAP_BY_TARIFF.rocket).toBe(120_000_000n);
  });
});

const TEST_URL = process.env.DATABASE_URL_TEST;
const hasDb = Boolean(TEST_URL);
const describeDb = hasDb ? describe : describe.skip;

describeDb('task-pool + daily cap DB integration', () => {
  const client = postgres(TEST_URL ?? 'postgres://invalid', { prepare: false });
  const testDb = drizzle(client, { schema });
  type TestTx = typeof testDb;

  const reset = async () => {
    await testDb.execute(sql`
      TRUNCATE TABLE
        task_completions,
        ad_impressions,
        matrix_accruals,
        matrix_positions,
        cash_ledger,
        user_tariffs,
        tariffs,
        users
      RESTART IDENTITY CASCADE
    `);
    const codes = Object.keys(DAILY_CAP_BY_TARIFF) as TariffCode[];
    await testDb.insert(tariffs).values(
      codes.map((code, idx) => ({
        code,
        name: code[0]!.toUpperCase() + code.slice(1),
        entryMicro: 0n,
        dailyCapMicro: DAILY_CAP_BY_TARIFF[code],
        monthlyFeeMicro: 0n,
        sortOrder: idx,
      })),
    );
  };

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  beforeEach(reset);

  const seedUser = async (): Promise<number> => {
    const [row] = await testDb
      .insert(users)
      .values({ refCode: `tp-${Math.random().toString(36).slice(2, 10)}` })
      .returning({ id: users.id });
    return Number(row!.id);
  };

  const seedAdminAtPosZero = async (): Promise<number> => {
    const id = await seedUser();
    await testDb.insert(matrixPositions).values({ userId: id, position: 0 });
    return id;
  };

  const activateTariff = async (userId: number, code: TariffCode) => {
    const [t] = await testDb
      .select({ id: tariffs.id })
      .from(tariffs)
      .where(eq(tariffs.code, code))
      .limit(1);
    await testDb
      .insert(userTariffs)
      .values({ userId, tariffId: t!.id, isActive: true });
  };

  const seedUserOnTariff = async (code: TariffCode): Promise<number> => {
    const id = await seedUser();
    await activateTariff(id, code);
    return id;
  };

  const runComplete = (
    userId: number,
    kind: Parameters<typeof completeTask>[1],
    payoutMicro: bigint,
  ) =>
    testDb.transaction(async (tx) =>
      completeTask(userId, kind, payoutMicro, tx as unknown as TestTx),
    );

  it('start: first $5 ad_view pays in full', async () => {
    const userId = await seedUserOnTariff('launch');
    const res = await runComplete(userId, 'ad_view', 5_000_000n);
    expect(res).toEqual({ ok: true, paidMicro: 5_000_000n });
  });

  it('start: second $6 task is clamped to $5 (partial_cap)', async () => {
    const userId = await seedUserOnTariff('launch');
    await runComplete(userId, 'ad_view', 5_000_000n);
    const res = await runComplete(userId, 'tg_sub', 6_000_000n);
    expect(res).toEqual({
      ok: true,
      paidMicro: 5_000_000n,
      reason: 'partial_cap',
    });
  });

  it('start: third task after cap filled is rejected', async () => {
    const userId = await seedUserOnTariff('launch');
    await runComplete(userId, 'ad_view', 5_000_000n);
    await runComplete(userId, 'tg_sub', 6_000_000n);
    const res = await runComplete(userId, 'brief', 1_000_000n);
    expect(res).toEqual({ ok: false, reason: 'daily_cap_reached' });
  });

  it('royal: 6× $15 full, 7th clamped to $10, 8th rejected', async () => {
    const userId = await seedUserOnTariff('rocket');
    for (let i = 0; i < 6; i++) {
      const r = await runComplete(userId, 'brief', 15_000_000n);
      expect(r).toEqual({ ok: true, paidMicro: 15_000_000n });
    }
    const seventh = await runComplete(userId, 'brief', 15_000_000n);
    expect(seventh).toEqual({
      ok: true,
      paidMicro: 10_000_000n,
      reason: 'partial_cap',
    });
    const eighth = await runComplete(userId, 'brief', 15_000_000n);
    expect(eighth).toEqual({ ok: false, reason: 'daily_cap_reached' });
  });

  it("day rollover: yesterday 23:00 does not consume today's cap", async () => {
    const userId = await seedUserOnTariff('launch');
    // Plant a cap-maxing ledger row dated yesterday 23:00 UTC.
    // DATE_TRUNC('day', NOW() AT UTC) - 1 hour yields yesterday 23:00
    // regardless of what time NOW() is today — robust to day-boundary runs.
    await testDb.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, created_at)
      VALUES (
        ${userId},
        'ad_view',
        10000000,
        (DATE_TRUNC('day', NOW() AT TIME ZONE 'UTC') - INTERVAL '1 hour')
      )
    `);
    const res = await runComplete(userId, 'ad_view', 5_000_000n);
    expect(res).toEqual({ ok: true, paidMicro: 5_000_000n });
  });

  it('free: after $3 of ads, every further task/ad is rejected', async () => {
    const userId = await seedUserOnTariff('free');
    const a = await runComplete(userId, 'ad_view', 3_000_000n);
    expect(a).toEqual({ ok: true, paidMicro: 3_000_000n });
    const b = await runComplete(userId, 'ad_view', 1_000_000n);
    expect(b).toEqual({ ok: false, reason: 'daily_cap_reached' });
    const c = await runComplete(userId, 'brief', 500_000n);
    expect(c).toEqual({ ok: false, reason: 'daily_cap_reached' });
  });

  it('rejects users with no active tariff', async () => {
    const userId = await seedUser();
    const res = await runComplete(userId, 'ad_view', 1_000_000n);
    expect(res).toEqual({ ok: false, reason: 'no_active_tariff' });
  });

  it('zero/negative payout is treated as cap-reached', async () => {
    const userId = await seedUserOnTariff('launch');
    const res = await runComplete(userId, 'ad_view', 0n);
    expect(res).toEqual({ ok: false, reason: 'daily_cap_reached' });
  });

  it('completeTask writes a cash_ledger row linked to task_completions', async () => {
    const userId = await seedUserOnTariff('boost');
    await runComplete(userId, 'brief', 2_500_000n);
    const ledger = await testDb
      .select()
      .from(cashLedger)
      .where(eq(cashLedger.userId, userId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.kind).toBe('task_reward');
    expect(ledger[0]!.amountMicro).toBe(2_500_000n);
    expect(ledger[0]!.memo).toBe('task:brief');

    const completions = await testDb
      .select()
      .from(schema.taskCompletions)
      .where(eq(schema.taskCompletions.userId, userId));
    expect(completions).toHaveLength(1);
    expect(completions[0]!.rewardMicro).toBe(2_500_000n);
    expect(Number(completions[0]!.ledgerId)).toBe(Number(ledger[0]!.id));
  });

  it('completeTask(ad_view) writes cash_ledger kind=ad_view + ad_impressions', async () => {
    const userId = await seedUserOnTariff('boost');
    await runComplete(userId, 'ad_view', 2_000_000n);
    const ledger = await testDb
      .select()
      .from(cashLedger)
      .where(eq(cashLedger.userId, userId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.kind).toBe('ad_view');

    const impressions = await testDb
      .select()
      .from(schema.adImpressions)
      .where(eq(schema.adImpressions.userId, userId));
    expect(impressions).toHaveLength(1);
    expect(impressions[0]!.rewardMicro).toBe(2_000_000n);
    expect(Number(impressions[0]!.ledgerId)).toBe(Number(ledger[0]!.id));
  });

  it('accrueToPool writes 40% of entry to admin cash_ledger', async () => {
    const adminId = await seedAdminAtPosZero();
    await testDb.transaction(async (tx) =>
      accrueToPool(100_000_000n, tx as unknown as TestTx),
    );
    const rows = await testDb
      .select()
      .from(cashLedger)
      .where(
        and(eq(cashLedger.userId, adminId), eq(cashLedger.kind, 'task_pool_fund')),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountMicro).toBe(40_000_000n);
    expect(rows[0]!.memo).toBe('task_pool');
  });

  it('accrueToPool with 0 entry is a no-op', async () => {
    await seedAdminAtPosZero();
    await testDb.transaction(async (tx) =>
      accrueToPool(0n, tx as unknown as TestTx),
    );
    const rows = await testDb.select().from(cashLedger);
    expect(rows).toHaveLength(0);
  });

  it('accrueToPool with no admin seeded throws', async () => {
    await expect(
      testDb.transaction(async (tx) =>
        accrueToPool(1_000_000n, tx as unknown as TestTx),
      ),
    ).rejects.toThrow(/admin position 0/);
  });

  it('getTodayEarnings reports task / ad / total / cap / remaining', async () => {
    const userId = await seedUserOnTariff('boost');
    await runComplete(userId, 'ad_view', 4_000_000n);
    await runComplete(userId, 'brief', 3_000_000n);
    const snap = await testDb.transaction(async (tx) =>
      getTodayEarnings(userId, tx as unknown as TestTx),
    );
    expect(snap.adMicro).toBe(4_000_000n);
    expect(snap.taskMicro).toBe(3_000_000n);
    expect(snap.totalMicro).toBe(7_000_000n);
    expect(snap.capMicro).toBe(DAILY_CAP_BY_TARIFF.boost);
    expect(snap.remainingMicro).toBe(DAILY_CAP_BY_TARIFF.boost - 7_000_000n);
  });

  it('getTodayEarnings returns zeros for a user without an active tariff', async () => {
    const userId = await seedUser();
    const snap = await testDb.transaction(async (tx) =>
      getTodayEarnings(userId, tx as unknown as TestTx),
    );
    expect(snap).toEqual({
      taskMicro: 0n,
      adMicro: 0n,
      totalMicro: 0n,
      capMicro: 0n,
      remainingMicro: 0n,
    });
  });
});
