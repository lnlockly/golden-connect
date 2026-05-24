/**
 * Tests for routes/me-matrix.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from '../../db/schema.js';
import { matrixAccruals, matrixPositions, users } from '../../db/schema.js';

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

describe('GET /me/matrix (auth)', () => {
  it('returns 401 with no session', async () => {
    const app = await buildApp();
    const res = await app.request('/me/matrix');
    expect(res.status).toBe(401);
  });
});

describe.skipIf(!TEST_URL)('GET /me/matrix (integration)', () => {
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
        matrix_accruals, matrix_positions, cash_ledger, users
      RESTART IDENTITY CASCADE
    `);
  });

  it('returns position: null when the user is not in the matrix yet', async () => {
    const [user] = await tdb.insert(users).values({ refCode: 'unplaced' }).returning({ id: users.id });
    const token = await bearerFor(user!.id);
    const app = await buildApp();
    const res = await app.request('/me/matrix', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      position: number | null;
      level_in_tree: number;
      above_3: unknown[];
      downstream_count: number;
      total_earned_micro: string;
      recent_slices: unknown[];
    };
    expect(json.ok).toBe(true);
    expect(json.position).toBeNull();
    expect(json.level_in_tree).toBe(0);
    expect(json.above_3).toEqual([]);
    expect(json.downstream_count).toBe(0);
    expect(json.total_earned_micro).toBe('0');
    expect(json.recent_slices).toEqual([]);
  });

  it('returns position + uplines + total earnings + recent accruals', async () => {
    // Build a chain in the matrix: admin (pos 0) → A (1) → A1 (4) → leaf (13).
    const [admin] = await tdb.insert(users).values({ refCode: 'admin' }).returning({ id: users.id });
    const [a] = await tdb.insert(users).values({ refCode: 'a' }).returning({ id: users.id });
    const [a1] = await tdb.insert(users).values({ refCode: 'a1' }).returning({ id: users.id });
    const [leaf] = await tdb.insert(users).values({ refCode: 'leaf' }).returning({ id: users.id });

    await tdb.insert(matrixPositions).values([
      { userId: admin!.id, position: 0 },
      { userId: a!.id, position: 1 },
      { userId: a1!.id, position: 4 },
      { userId: leaf!.id, position: 13 },
    ]);

    // Fill positions 2..3, 5..12 with throwaway users so the IN-tree lookup
    // for leaf's uplines (4, 1, 0) is resolvable.
    let nextPos = 2;
    for (const code of ['p2', 'p3', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']) {
      const [u] = await tdb.insert(users).values({ refCode: code }).returning({ id: users.id });
      await tdb.insert(matrixPositions).values({ userId: u!.id, position: nextPos });
      nextPos = nextPos === 3 ? 5 : nextPos + 1;
    }

    // Earn for `a` (pos 1) — directly above leaf at L2.
    await tdb.insert(matrixAccruals).values([
      { recipientUserId: a!.id, fromUserId: leaf!.id, fromPosition: 13, level: 2, amountMicro: 13_000_000n },
      { recipientUserId: a!.id, fromUserId: leaf!.id, fromPosition: 14, level: 2, amountMicro: 7_000_000n },
    ]);

    const token = await bearerFor(a!.id);
    const app = await buildApp();
    const res = await app.request('/me/matrix', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      position: number;
      level_in_tree: number;
      above_3: Array<{ user_id: number; level: number; ref_code: string }>;
      downstream_count: number;
      total_earned_micro: string;
      recent_slices: Array<{ amount_micro: string; level: number }>;
    };
    expect(json.position).toBe(1);
    expect(json.level_in_tree).toBe(1); // pos 1 is depth 1 (root is 0).
    // a's only ancestor is admin (pos 0) at level 1.
    expect(json.above_3).toHaveLength(1);
    expect(json.above_3[0]!.user_id).toBe(admin!.id);
    expect(json.above_3[0]!.level).toBe(1);
    expect(json.above_3[0]!.ref_code).toBe('admin');
    // a's subtree contains a1 (pos 4) and leaf (pos 13). Other p* users are
    // siblings/cousins of a, not descendants — so the count is 2.
    expect(json.downstream_count).toBe(2);
    expect(json.total_earned_micro).toBe('20000000');
    expect(json.recent_slices).toHaveLength(2);
    expect(json.recent_slices.every((r) => r.level === 2)).toBe(true);
  });
});
