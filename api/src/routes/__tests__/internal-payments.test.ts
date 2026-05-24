/**
 * Tests for routes/internal-payments.ts.
 *
 * Auth-gating path runs without a real DB. The integration path is skipped
 * unless DATABASE_URL_TEST is set — same convention as the other
 * internal-* route tests in this folder.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import {
  cashLedger,
  matrixPositions,
  tariffs,
  userTariffs,
  users,
} from '../../db/schema.js';

process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';

const SECRET = process.env.INTERNAL_API_SECRET!;
const TEST_URL = process.env.DATABASE_URL_TEST;

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

describe('GET /internal/payments (auth)', () => {
  it('rejects with 401 when the secret header is missing', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/payments');
    expect(res.status).toBe(401);
  });

  it('rejects with 401 when the secret header is wrong', async () => {
    const app = await buildApp();
    const res = await app.request('/internal/payments', {
      headers: { 'x-goldenConnect-secret': 'nope' },
    });
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!TEST_URL)('GET /internal/payments (integration)', () => {
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

  it('returns the recent entry_fee rows with user + tariff metadata', async () => {
    const [payer] = await tdb
      .insert(users)
      .values({
        refCode: 'payer1',
        tgId: 999,
        tgUsername: 'bob',
        firstName: 'Bob',
      })
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

    await tdb.insert(userTariffs).values({
      userId: payer!.id,
      tariffId: tariff!.id,
      isActive: true,
    });
    await tdb.insert(matrixPositions).values({
      userId: payer!.id,
      position: 17,
    });
    await tdb.insert(cashLedger).values({
      userId: payer!.id,
      kind: 'entry_fee',
      amountMicro: -100_000_000n,
      memo: 'entry_payment:cryptobot:abc',
    });

    const app = await buildApp();
    const res = await app.request('/internal/payments?limit=5', {
      headers: { 'x-goldenConnect-secret': SECRET },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      payments: Array<{
        method: string;
        tariff_code: string | null;
        entry_usd: number;
        user_username: string | null;
        user_tg_id: number | null;
        matrix_position: number | null;
        payment_ref: string;
      }>;
      total: number;
      total_usd: number;
    };

    expect(json.ok).toBe(true);
    expect(json.total).toBe(1);
    expect(json.total_usd).toBe(100);
    expect(json.payments).toHaveLength(1);
    const p = json.payments[0]!;
    expect(p.method).toBe('cryptobot');
    expect(p.tariff_code).toBe('core');
    expect(p.entry_usd).toBe(100);
    expect(p.user_username).toBe('bob');
    expect(p.user_tg_id).toBe(999);
    expect(p.matrix_position).toBe(17);
    expect(p.payment_ref).toBe('cryptobot:abc');
  });
});
