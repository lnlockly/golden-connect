/**
 * Tests for routes/me-tariff.ts.
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

describe('GET /me/tariff (auth)', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const app = await buildApp();
    const res = await app.request('/me/tariff');
    expect(res.status).toBe(401);
  });

  it('rejects bogus bearer tokens with 401', async () => {
    const app = await buildApp();
    const res = await app.request('/me/tariff', {
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!TEST_URL)('GET /me/tariff (integration)', () => {
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
        user_tariffs, tariffs, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('returns tariff: null for users without an active plan', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'noplan' }).returning({ id: users.id });
    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/tariff', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      tariff: unknown;
      today: { earned_micro: string; cap_micro: string; remaining_micro: string };
    };
    expect(json.ok).toBe(true);
    expect(json.tariff).toBeNull();
    // No tariff = no cap, so today block reports zeros.
    expect(json.today.cap_micro).toBe('0');
    expect(json.today.earned_micro).toBe('0');
    expect(json.today.remaining_micro).toBe('0');
  });

  it('returns the active tariff with stringified bigints', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'paid' }).returning({ id: users.id });
    const [tariff] = await tdb
      .insert(tariffs)
      .values({
        code: 'core',
        name: 'Core',
        entryMicro: 100_000_000n,
        dailyCapMicro: 30_000_000n,
        monthlyFeeMicro: 100_000_000n,
      })
      .returning({ id: tariffs.id });
    await tdb.insert(userTariffs).values({
      userId: user!.id,
      tariffId: tariff!.id,
      isActive: true,
    });

    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/tariff', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      tariff: { code: string; name: string; entry_micro: string; daily_cap_micro: string; is_active: boolean };
      today: { earned_micro: string; cap_micro: string; remaining_micro: string };
    };
    expect(json.ok).toBe(true);
    expect(json.tariff.code).toBe('core');
    expect(json.tariff.entry_micro).toBe('100000000');
    expect(json.tariff.daily_cap_micro).toBe('30000000');
    expect(json.tariff.is_active).toBe(true);
    expect(json.today.cap_micro).toBe('30000000');
    expect(json.today.earned_micro).toBe('0');
    expect(json.today.remaining_micro).toBe('30000000');
  });
});
