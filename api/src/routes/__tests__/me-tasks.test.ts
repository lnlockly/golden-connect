/**
 * Tests for routes/me-tasks.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { tariffs, userTariffs, users } from '../../db/schema.js';

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

describe('GET /me/tasks/today (auth)', () => {
  it('returns 401 without a session', async () => {
    const app = await buildApp();
    const res = await app.request('/me/tasks/today');
    expect(res.status).toBe(401);
  });
});

describe('POST /me/tasks/:kind/complete (auth + validation)', () => {
  it('returns 401 without a session', async () => {
    const app = await buildApp();
    const res = await app.request('/me/tasks/brief/complete', { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for unknown task kind', async () => {
    const token = await bearerFor(1);
    const app = await buildApp();
    const res = await app.request('/me/tasks/banana/complete', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!TEST_URL)('GET /me/tasks/today (integration)', () => {
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
        ad_impressions, task_completions, cash_ledger,
        user_tariffs, tariffs, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('returns zeros + cap_micro=0 for users with no active tariff', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'noplan' }).returning({ id: users.id });
    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/tasks/today', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      task_micro: string;
      ad_micro: string;
      total_micro: string;
      cap_micro: string;
      remaining_micro: string;
    };
    expect(json.task_micro).toBe('0');
    expect(json.ad_micro).toBe('0');
    expect(json.total_micro).toBe('0');
    expect(json.cap_micro).toBe('0');
    expect(json.remaining_micro).toBe('0');
  });

  it('exposes the daily cap from the active tariff', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'capped' }).returning({ id: users.id });
    const [tariff] = await tdb
      .insert(tariffs)
      .values({
        code: 'pro',
        name: 'Pro',
        entryMicro: 200_000_000n,
        dailyCapMicro: 50_000_000n,
        monthlyFeeMicro: 200_000_000n,
      })
      .returning({ id: tariffs.id });
    await tdb.insert(userTariffs).values({
      userId: user!.id,
      tariffId: tariff!.id,
      isActive: true,
    });
    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/tasks/today', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { cap_micro: string; remaining_micro: string };
    expect(json.cap_micro).toBe('50000000');
    expect(json.remaining_micro).toBe('50000000');
  });

  it('credits a brief reward through POST /me/tasks/:kind/complete', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'taskposter' }).returning({ id: users.id });
    const [tariff] = await tdb
      .insert(tariffs)
      .values({
        code: 'pro',
        name: 'Pro',
        entryMicro: 200_000_000n,
        dailyCapMicro: 50_000_000n,
        monthlyFeeMicro: 200_000_000n,
      })
      .returning({ id: tariffs.id });
    await tdb.insert(userTariffs).values({
      userId: user!.id,
      tariffId: tariff!.id,
      isActive: true,
    });

    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/tasks/brief/complete', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ proof_url: 'https://example.com/p' }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; paid_micro: string; partial: boolean };
    expect(json.ok).toBe(true);
    // brief is fixed at 5_000_000 micro per _task-payouts.ts
    expect(json.paid_micro).toBe('5000000');
    expect(json.partial).toBe(false);
  });
});
