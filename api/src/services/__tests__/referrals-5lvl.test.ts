import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../db/schema.js';
import {
  MAX_REFERRAL_LEVEL,
  REFERRAL_CURVE_5LVL,
  accrueFromEntry,
  levelShareMicro,
  pctForLevel5,
  totalRemainderMicro,
} from '../referrals-5lvl.js';

describe('referrals-5lvl pure math', () => {
  it('REFERRAL_CURVE_5LVL has 5 levels summing to 15%', () => {
    expect(REFERRAL_CURVE_5LVL).toHaveLength(MAX_REFERRAL_LEVEL);
    const sum = REFERRAL_CURVE_5LVL.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0.15, 10);
  });

  it('pctForLevel5 returns the curve value for 1..5 and 0 outside', () => {
    expect(pctForLevel5(0)).toBe(0);
    expect(pctForLevel5(1)).toBe(0.05);
    expect(pctForLevel5(2)).toBe(0.04);
    expect(pctForLevel5(3)).toBe(0.03);
    expect(pctForLevel5(4)).toBe(0.02);
    expect(pctForLevel5(5)).toBe(0.01);
    expect(pctForLevel5(6)).toBe(0);
    expect(pctForLevel5(-1)).toBe(0);
  });

  it('levelShareMicro on $300 entry yields exact integer micros', () => {
    const entry = 300_000_000n;
    expect(levelShareMicro(entry, 1)).toBe(15_000_000n);
    expect(levelShareMicro(entry, 2)).toBe(12_000_000n);
    expect(levelShareMicro(entry, 3)).toBe(9_000_000n);
    expect(levelShareMicro(entry, 4)).toBe(6_000_000n);
    expect(levelShareMicro(entry, 5)).toBe(3_000_000n);
  });

  it('levelShareMicro on $33 entry is exact (no float drift)', () => {
    const entry = 33_000_000n;
    const shares = [1, 2, 3, 4, 5].map((l) => levelShareMicro(entry, l));
    expect(shares).toEqual([1_650_000n, 1_320_000n, 990_000n, 660_000n, 330_000n]);
    const sum = shares.reduce((a, b) => a + b, 0n);
    expect(sum).toBe(4_950_000n); // 15% of 33_000_000
  });

  it('levelShareMicro returns 0 for out-of-range levels or non-positive entry', () => {
    expect(levelShareMicro(300_000_000n, 0)).toBe(0n);
    expect(levelShareMicro(300_000_000n, 6)).toBe(0n);
    expect(levelShareMicro(0n, 1)).toBe(0n);
    expect(levelShareMicro(-1n, 1)).toBe(0n);
  });

  it('totalRemainderMicro bundles missing levels', () => {
    expect(totalRemainderMicro(300_000_000n, 0)).toBe(45_000_000n); // full 15%
    expect(totalRemainderMicro(300_000_000n, 1)).toBe(30_000_000n); // L2..L5 = 10%
    expect(totalRemainderMicro(300_000_000n, 3)).toBe(9_000_000n); // L4+L5 = 3%
    expect(totalRemainderMicro(300_000_000n, 5)).toBe(0n);
  });
});

/**
 * Integration tests — require a Postgres with migrations applied, URL in
 * `DATABASE_URL_TEST`. Each test truncates the relevant tables and reseeds
 * the admin user. Skipped when the env is absent so `npm test` stays green
 * on contributor machines without a local DB.
 */
const TEST_URL = process.env.DATABASE_URL_TEST;

describe.skipIf(!TEST_URL)('referrals-5lvl integration (DATABASE_URL_TEST)', () => {
  let client: ReturnType<typeof postgres>;
  let tdb: ReturnType<typeof drizzle<typeof schema>>;
  let adminId: number;

  beforeAll(() => {
    client = postgres(TEST_URL as string, { prepare: false, max: 4 });
    tdb = drizzle(client, { schema });
  });

  afterAll(async () => {
    await client.end();
  });

  async function reset(): Promise<void> {
    await tdb.execute(sql`
      TRUNCATE
        referral_accruals,
        matrix_accruals,
        cash_ledger,
        invite_edges,
        user_tariffs,
        matrix_positions,
        users
      RESTART IDENTITY CASCADE
    `);
    const rows = await tdb.execute(sql`
      INSERT INTO users (ref_code) VALUES ('admin') RETURNING id
    `);
    adminId = Number((rows[0] as { id: number }).id);
  }

  /**
   * Create `count` users linked into a single inviter chain:
   * ids[0] (leaf) -> ids[1] -> ... -> ids[count-1] (root).
   * Returns ids in depth order (index 0 is the leaf).
   */
  async function seedChain(count: number, tag: string): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const r = await tdb.execute(sql`
        INSERT INTO users (ref_code) VALUES (${`${tag}_${i}_${Date.now()}_${Math.random()}`})
        RETURNING id
      `);
      ids.push(Number((r[0] as { id: number }).id));
    }
    for (let i = 0; i < count - 1; i++) {
      await tdb.execute(sql`
        INSERT INTO invite_edges (child_user_id, parent_user_id)
        VALUES (${ids[i]}, ${ids[i + 1]})
      `);
    }
    return ids;
  }

  beforeEach(async () => {
    await reset();
  });

  it('chain depth 7: all 5 levels pay, zero admin remainder', async () => {
    // 1 leaf + 7 ancestors. Depth counter caps at 5, so ancestors 6..7 are unreached.
    const chain = await seedChain(8, 'deep');
    const entry = 300_000_000n;

    const res = await accrueFromEntry(chain[0], entry, { kind: 'entry_fee', id: 1 }, tdb);

    expect(res.chainDepth).toBe(5);
    expect(res.adminRemainderMicro).toBe(0n);
    expect(res.adminLedgerId).toBeNull();
    expect(res.entries).toHaveLength(5);
    expect(res.entries.map((e) => e.recipientUserId)).toEqual([
      chain[1],
      chain[2],
      chain[3],
      chain[4],
      chain[5],
    ]);
    expect(res.entries.map((e) => e.amountMicro)).toEqual([
      15_000_000n,
      12_000_000n,
      9_000_000n,
      6_000_000n,
      3_000_000n,
    ]);

    const ledger = await tdb.execute(sql`
      SELECT kind, level, amount_micro::text AS amount FROM cash_ledger ORDER BY id
    `);
    expect(ledger.length).toBe(5);
    expect(ledger.map((r) => (r as { kind: string }).kind)).toEqual([
      'ref_L1',
      'ref_L2',
      'ref_L3',
      'ref_L4',
      'ref_L5',
    ]);

    const ref = await tdb.execute(sql`SELECT COUNT(*)::int AS n FROM referral_accruals`);
    expect((ref[0] as { n: number }).n).toBe(5);
  });

  it('chain of 3 ending at admin: L1..L3 paid (admin gets L3), L4+L5 bundled to admin_fee', async () => {
    // Structure: leaf -> u1 -> u2 -> admin (root of chain).
    const u = await seedChain(3, 'mid');
    await tdb.execute(sql`
      INSERT INTO invite_edges (child_user_id, parent_user_id) VALUES (${u[2]}, ${adminId})
    `);

    const res = await accrueFromEntry(u[0], 300_000_000n, { kind: 'entry_fee', id: 2 }, tdb);

    expect(res.chainDepth).toBe(3);
    expect(res.entries.map((e) => ({ uid: e.recipientUserId, amt: e.amountMicro }))).toEqual([
      { uid: u[1], amt: 15_000_000n },
      { uid: u[2], amt: 12_000_000n },
      { uid: adminId, amt: 9_000_000n },
    ]);
    expect(res.adminRemainderMicro).toBe(9_000_000n);
    expect(res.adminLedgerId).not.toBeNull();

    const adminFee = await tdb.execute(sql`
      SELECT memo, amount_micro::text AS amount FROM cash_ledger WHERE kind = 'admin_fee'
    `);
    expect(adminFee.length).toBe(1);
    expect((adminFee[0] as { memo: string }).memo).toBe('ref_chain_short_to_L3');
    expect(BigInt((adminFee[0] as { amount: string }).amount)).toBe(9_000_000n);

    // Admin also received a normal ref_L3 row.
    const adminRefL3 = await tdb.execute(sql`
      SELECT COUNT(*)::int AS n FROM cash_ledger WHERE user_id = ${adminId} AND kind = 'ref_L3'
    `);
    expect((adminRefL3[0] as { n: number }).n).toBe(1);
  });

  it('chain depth 1: L1 paid, L2..L5 bundled to admin_fee with memo L1', async () => {
    const [leaf, parent] = await seedChain(2, 'short');

    const res = await accrueFromEntry(leaf, 300_000_000n, { kind: 'entry_fee', id: 3 }, tdb);

    expect(res.chainDepth).toBe(1);
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ recipientUserId: parent, level: 1, amountMicro: 15_000_000n });
    expect(res.adminRemainderMicro).toBe(30_000_000n); // 10% of $300

    const adminFee = await tdb.execute(sql`
      SELECT memo FROM cash_ledger WHERE kind = 'admin_fee'
    `);
    expect((adminFee[0] as { memo: string }).memo).toBe('ref_chain_short_to_L1');
  });

  it('no inviter (user without invite_edges row): full 15% to admin_fee', async () => {
    const r = await tdb.execute(sql`
      INSERT INTO users (ref_code) VALUES (${`orphan_${Date.now()}`}) RETURNING id
    `);
    const userId = Number((r[0] as { id: number }).id);

    const res = await accrueFromEntry(userId, 300_000_000n, { kind: 'entry_fee', id: 4 }, tdb);

    expect(res.chainDepth).toBe(0);
    expect(res.entries).toHaveLength(0);
    expect(res.adminRemainderMicro).toBe(45_000_000n);

    const adminFee = await tdb.execute(sql`
      SELECT memo, user_id FROM cash_ledger WHERE kind = 'admin_fee'
    `);
    expect(adminFee.length).toBe(1);
    expect((adminFee[0] as { memo: string; user_id: number }).memo).toBe('ref_chain_short_to_L0');
    expect(Number((adminFee[0] as { user_id: number }).user_id)).toBe(adminId);
  });

  it('self-invite loop (parent == child) is skipped; full remainder to admin', async () => {
    const r = await tdb.execute(sql`
      INSERT INTO users (ref_code) VALUES (${`self_${Date.now()}`}) RETURNING id
    `);
    const userId = Number((r[0] as { id: number }).id);
    // Corrupt: parent_user_id == child_user_id. Never should happen; defend anyway.
    await tdb.execute(sql`
      INSERT INTO invite_edges (child_user_id, parent_user_id) VALUES (${userId}, ${userId})
    `);

    const res = await accrueFromEntry(userId, 300_000_000n, { kind: 'entry_fee', id: 5 }, tdb);

    expect(res.chainDepth).toBe(0);
    expect(res.entries).toHaveLength(0);
    expect(res.adminRemainderMicro).toBe(45_000_000n);
  });

  it('micro-precision: $33 entry sums to exactly 4.95% of the entry', async () => {
    const chain = await seedChain(6, 'micro');

    const res = await accrueFromEntry(chain[0], 33_000_000n, { kind: 'entry_fee', id: 6 }, tdb);

    expect(res.entries.map((e) => e.amountMicro)).toEqual([
      1_650_000n,
      1_320_000n,
      990_000n,
      660_000n,
      330_000n,
    ]);
    const paid = res.entries.reduce((a, e) => a + e.amountMicro, 0n);
    expect(paid).toBe(4_950_000n);
    expect(res.adminRemainderMicro).toBe(0n);
  });

  it('re-running on the same (from_user, source) raises on the unique index (caller-owned idempotency)', async () => {
    const [leaf] = await seedChain(2, 'dup');
    const source = { kind: 'entry_fee', id: 99 };
    await accrueFromEntry(leaf, 300_000_000n, source, tdb);
    await expect(accrueFromEntry(leaf, 300_000_000n, source, tdb)).rejects.toThrow();
  });
});
