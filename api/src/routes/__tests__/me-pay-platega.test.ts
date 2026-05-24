/**
 * Tests for routes/me-pay-platega.ts.
 *
 * Auth-layer check only (unauth → 401) and the 503 path are always safe to
 * run. The "valid auth but unconfigured → 503" case requires the DB-backed
 * tariff lookup to complete, so it's gated on DATABASE_URL_TEST like the
 * other integration tests in this project.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { tariffs, users } from '../../db/schema.js';

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

describe('POST /me/pay/platega (auth)', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const app = await buildApp();
    const res = await app.request('/me/pay/platega', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tariff_id: 1 }),
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!TEST_URL)('POST /me/pay/platega (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let tdb: ReturnType<typeof drizzle<typeof schema>>;
  const prev = {
    merchant: process.env.PLATEGA_MERCHANT_ID,
    api: process.env.PLATEGA_API_SECRET,
    wh: process.env.PLATEGA_WEBHOOK_SECRET,
  };

  beforeAll(() => {
    process.env.DATABASE_URL = TEST_URL!;
    client = postgres(TEST_URL!, { prepare: false, max: 4 });
    tdb = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end({ timeout: 5 });
  });

  beforeEach(async () => {
    delete process.env.PLATEGA_MERCHANT_ID;
    delete process.env.PLATEGA_API_SECRET;
    delete process.env.PLATEGA_WEBHOOK_SECRET;
    await tdb.execute(sql`TRUNCATE TABLE tariffs, users RESTART IDENTITY CASCADE`);
  });

  afterEach(() => {
    if (prev.merchant !== undefined) process.env.PLATEGA_MERCHANT_ID = prev.merchant;
    if (prev.api !== undefined) process.env.PLATEGA_API_SECRET = prev.api;
    if (prev.wh !== undefined) process.env.PLATEGA_WEBHOOK_SECRET = prev.wh;
  });

  it('returns 503 platega_not_configured when creds are blank', async () => {
    const [user] = await tdb
      .insert(users)
      .values({ refCode: 'p-test' })
      .returning({ id: users.id });
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

    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/pay/platega', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tariff_id: Number(tariff!.id) }),
    });
    expect(res.status).toBe(503);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json).toEqual({ ok: false, error: 'platega_not_configured' });
  });
});
