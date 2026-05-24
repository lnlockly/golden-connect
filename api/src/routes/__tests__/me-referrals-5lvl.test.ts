/**
 * Tests for routes/me-referrals-5lvl.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { cashLedger, referralAccruals, users } from '../../db/schema.js';

process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';

const TEST_URL = process.env.DATABASE_URL_TEST;

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

async function bearerFor(userId: number): Promise<string> {
  const { signSession } = await import('../../services/jwt.js');
  return signSession({ sub: userId, addr: null, tg: null });
}

describe('GET /me/referrals/5lvl (auth)', () => {
  it('returns 401 without a session', async () => {
    const app = await buildApp();
    const res = await app.request('/me/referrals/5lvl');
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!TEST_URL)('GET /me/referrals/5lvl (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let tdb: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(() => {
    process.env.DATABASE_URL = TEST_URL!;
    client = postgres(TEST_URL!, { prepare: false, max: 4 });
    tdb = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await tdb.execute(sql`
      TRUNCATE TABLE
        referral_accruals, cash_ledger, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('returns five zero-rows when the user has earned nothing', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'fresh' }).returning({ id: users.id });
    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/referrals/5lvl', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      levels: Array<{ level: number; count: number; earned_micro: string; pct: number }>;
      total_earned_micro: string;
    };
    expect(json.ok).toBe(true);
    expect(json.levels).toHaveLength(5);
    expect(json.levels.map((r) => r.level)).toEqual([1, 2, 3, 4, 5]);
    expect(json.levels.map((r) => r.pct)).toEqual([0.05, 0.04, 0.03, 0.02, 0.01]);
    expect(json.levels.every((r) => r.count === 0 && r.earned_micro === '0')).toBe(true);
    expect(json.total_earned_micro).toBe('0');
  });

  it('aggregates payers + amounts per level', async () => {
    const [recipient] = await tdb.insert(users).values({ refCode: 'recv' }).returning({ id: users.id });
    const [d1] = await tdb.insert(users).values({ refCode: 'd1' }).returning({ id: users.id });
    const [d2] = await tdb.insert(users).values({ refCode: 'd2' }).returning({ id: users.id });
    const [d3] = await tdb.insert(users).values({ refCode: 'd3' }).returning({ id: users.id });

    // Mint 4 ledger rows we can attach accruals to. Idempotency uniqueness
    // is on (from_user_id, level, source_kind, source_id) — vary source_id
    // for the two L1 rows from d1 (different paying events).
    const ledgers = await tdb
      .insert(cashLedger)
      .values([
        { userId: recipient!.id, kind: 'ref_L1', amountMicro: 5_000_000n, relatedUserId: d1!.id, level: 1 },
        { userId: recipient!.id, kind: 'ref_L1', amountMicro: 3_000_000n, relatedUserId: d1!.id, level: 1 },
        { userId: recipient!.id, kind: 'ref_L1', amountMicro: 2_000_000n, relatedUserId: d2!.id, level: 1 },
        { userId: recipient!.id, kind: 'ref_L3', amountMicro: 1_000_000n, relatedUserId: d3!.id, level: 3 },
      ])
      .returning({ id: cashLedger.id });

    await tdb.insert(referralAccruals).values([
      {
        recipientUserId: recipient!.id,
        fromUserId: d1!.id,
        level: 1,
        sourceKind: 'entry_fee',
        sourceId: 1,
        amountMicro: 5_000_000n,
        ledgerId: ledgers[0]!.id,
      },
      {
        recipientUserId: recipient!.id,
        fromUserId: d1!.id,
        level: 1,
        sourceKind: 'entry_fee',
        sourceId: 2,
        amountMicro: 3_000_000n,
        ledgerId: ledgers[1]!.id,
      },
      {
        recipientUserId: recipient!.id,
        fromUserId: d2!.id,
        level: 1,
        sourceKind: 'entry_fee',
        sourceId: 3,
        amountMicro: 2_000_000n,
        ledgerId: ledgers[2]!.id,
      },
      {
        recipientUserId: recipient!.id,
        fromUserId: d3!.id,
        level: 3,
        sourceKind: 'entry_fee',
        sourceId: 4,
        amountMicro: 1_000_000n,
        ledgerId: ledgers[3]!.id,
      },
    ]);

    const token = await bearerFor(recipient!.id);
    const app = await buildApp();
    const res = await app.request('/me/referrals/5lvl', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      levels: Array<{ level: number; count: number; earned_micro: string; pct: number }>;
      total_earned_micro: string;
    };

    const l1 = json.levels.find((r) => r.level === 1)!;
    expect(l1.count).toBe(2); // distinct from_user_ids: d1 + d2
    expect(l1.earned_micro).toBe('10000000'); // 5 + 3 + 2
    expect(l1.pct).toBe(0.05);

    const l3 = json.levels.find((r) => r.level === 3)!;
    expect(l3.count).toBe(1);
    expect(l3.earned_micro).toBe('1000000');
    expect(l3.pct).toBe(0.03);

    for (const lvl of [2, 4, 5]) {
      const r = json.levels.find((x) => x.level === lvl)!;
      expect(r.count).toBe(0);
      expect(r.earned_micro).toBe('0');
    }

    expect(json.total_earned_micro).toBe('11000000');
  });
});
