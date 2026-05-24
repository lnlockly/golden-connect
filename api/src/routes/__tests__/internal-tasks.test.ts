/**
 * Tests for routes/internal-tasks.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { matrixPositions, tariffs, userTariffs, users } from '../../db/schema.js';

process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';

const SECRET = process.env.INTERNAL_API_SECRET!;
const TEST_URL = process.env.DATABASE_URL_TEST;

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

describe('POST /internal/tasks/complete (auth + validation)', () => {
  it('rejects missing secret', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/tasks/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_id: 1, task_kind: 'ad_view' }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects unknown task_kind', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/tasks/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({ user_id: 1, task_kind: 'banana' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed proof_url', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/tasks/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({ user_id: 1, task_kind: 'brief', proof_url: 'not-a-url' }),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!TEST_URL)('POST /internal/tasks/complete (integration)', () => {
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
        ad_impressions, task_completions, referral_accruals, matrix_accruals,
        matrix_positions, cash_ledger, user_tariffs, tariffs, invite_edges, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('credits a brief reward (5_000_000 micro) when the user has an active tariff', async () => {
    const [admin] = await tdb.insert(users).values({ refCode: 'admin' }).returning({ id: users.id });
    await tdb.insert(matrixPositions).values({ userId: admin!.id, position: 0 });
    const [user] = await tdb.insert(users).values({ refCode: 'taskuser' }).returning({ id: users.id });
    const [tariff] = await tdb
      .insert(tariffs)
      .values({
        code: 'start',
        name: 'Start',
        entryMicro: 30_000_000n,
        dailyCapMicro: 10_000_000n,
        monthlyFeeMicro: 30_000_000n,
      })
      .returning({ id: tariffs.id });
    await tdb.insert(userTariffs).values({
      userId: user!.id,
      tariffId: tariff!.id,
      isActive: true,
    });

    const app = await buildApp();
    const res = await app.request('/internal/tasks/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({
        user_id: user!.id,
        task_kind: 'brief',
        proof_url: 'https://example.com/proof',
      }),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; paid_micro: string; partial: boolean };
    expect(json.ok).toBe(true);
    // brief is fixed at 5_000_000 micro per _task-payouts.ts
    expect(json.paid_micro).toBe('5000000');
    expect(json.partial).toBe(false);
  });

  it('returns 409 when the user has no active tariff', async () => {
    const [user] = await tdb
      .insert(users)
      .values({ refCode: 'no-plan' })
      .returning({ id: users.id });
    const app = await buildApp();
    const res = await app.request('/internal/tasks/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goldenConnect-secret': SECRET },
      body: JSON.stringify({
        user_id: user!.id,
        task_kind: 'brief',
      }),
    });
    expect(res.status).toBe(409);
    const json = (await res.json()) as { ok: boolean; error: string };
    expect(json.error).toBe('no_active_tariff');
  });
});
