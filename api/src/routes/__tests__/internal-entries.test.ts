/**
 * Tests for routes/internal-entries.ts. Verifies auth gating + the wired
 * call into processEntry, gated on DATABASE_URL_TEST for the real path.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { inviteEdges, matrixPositions, tariffs, users } from '../../db/schema.js';

process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';

const SECRET = process.env.INTERNAL_API_SECRET!;
const TEST_URL = process.env.DATABASE_URL_TEST;

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

describe('POST /internal/entries (auth)', () => {
  it('rejects with 401 when secret header is missing', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 1, tariff_id: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when secret is wrong', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': 'nope' },
      body: JSON.stringify({ user_id: 1, tariff_id: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects with 400 when body is malformed', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects with 400 on missing user_id', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({ tariff_id: 1 }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('invalid_body');
  });
});

describe.skipIf(!TEST_URL)('POST /internal/entries (integration)', () => {
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
        referral_accruals, matrix_accruals, matrix_positions,
        cash_ledger, user_tariffs, tariffs, invite_edges, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('runs the full distribution and returns stringified bigints', async () => {
    // Seed admin at matrix root + a payer with no inviter chain.
    const [admin] = await tdb.insert(users).values({ refCode: 'admin' }).returning({ id: users.id });
    await tdb.insert(matrixPositions).values({ userId: admin!.id, position: 0 });
    const [payer] = await tdb.insert(users).values({ refCode: 'payer' }).returning({ id: users.id });
    await tdb.insert(inviteEdges).values({ childUserId: payer!.id, parentUserId: admin!.id });

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

    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({
        user_id: payer!.id,
        tariff_id: tariff!.id,
        payment_ref_id: 'pay-1',
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      entry_micro: string;
      matrix_position: number;
      total_distributed_micro: string;
      running_sum_micro: string;
      admin_fee_micro: string;
    };
    expect(json.ok).toBe(true);
    expect(json.entry_micro).toBe('100000000');
    expect(json.total_distributed_micro).toBe('100000000');
    expect(json.running_sum_micro).toBe('0');
    expect(json.admin_fee_micro).toBe('5000000');
    expect(json.matrix_position).toBeGreaterThan(0);
  });

  it('returns 500 when processEntry throws (e.g. unknown tariff)', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'lonely' }).returning({ id: users.id });
    const app = await buildApp();
    const res = await app.request('/internal/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({ user_id: user!.id, tariff_id: 999_999 }),
    });
    expect(res.status).toBe(500);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.ok).toBe(false);
    expect(json.error).toBe('process_entry_failed');
  });
});
