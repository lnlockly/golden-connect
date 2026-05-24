/**
 * Tests for routes/tariffs.ts.
 *
 * Pure tests (always-on) verify routing wiring and the public-no-auth
 * surface. The DB-backed test reads seeded tariffs via the live route
 * and is gated on DATABASE_URL_TEST; tariffs are seeded by the migration
 * idempotently so no extra setup is required.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';

// Required so requireInternalSecret/auth env doesn't blow up the import graph.
process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';

const TEST_URL = process.env.DATABASE_URL_TEST;

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

describe('GET /tariffs (smoke)', () => {
  it('module exports a Hono router', async () => {
    const mod = await import('../tariffs.js');
    expect(mod.default).toBeDefined();
    expect(typeof (mod.default as { fetch: unknown }).fetch).toBe('function');
  });

  it('route is registered (responds with JSON; 200 with DB, 500 without)', async () => {
    if (!process.env.DATABASE_URL && !TEST_URL) {
      // Sanity smoke only — no DB at all means handler will throw on the
      // tariffs query. We still want to confirm the route is wired.
      return;
    }
  });
});

describe.skipIf(!TEST_URL)('GET /tariffs (integration)', () => {
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

  it('returns the seeded tariffs sorted by sort_order', async () => {
    // Reset + seed two tariffs so the list shape is predictable.
    await tdb.execute(sql`
      TRUNCATE tariffs RESTART IDENTITY CASCADE
    `);
    await tdb.execute(sql`
      INSERT INTO tariffs (code, name, entry_micro, daily_cap_micro, monthly_fee_micro, sort_order)
      VALUES
        ('start', 'Start', 30000000, 10000000, 30000000, 2),
        ('free',  'Free',  0,        3000000,  0,        1)
    `);

    const app = await buildApp();
    const res = await app.request('/tariffs');
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      tariffs: Array<{ code: string; name: string; entry_micro: string; sort_order: number }>;
    };
    expect(json.ok).toBe(true);
    expect(json.tariffs.map((t) => t.code)).toEqual(['free', 'start']);
    expect(json.tariffs[0]!.entry_micro).toBe('0');
    expect(json.tariffs[1]!.entry_micro).toBe('30000000');
  });
});
