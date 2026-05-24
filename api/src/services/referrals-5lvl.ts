import { sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { cashLedger, referralAccruals } from '../db/schema.js';
import { ADMIN_REF_CODE } from './users.js';

/**
 * 5-level referral accrual.
 *
 * When a user pays an entry (or any qualifying event), 15% of the amount is
 * split up the invite_edges chain: 5% / 4% / 3% / 2% / 1%. Levels with no
 * ancestor (chain shorter than 5, or no inviter at all) are bundled into a
 * single `admin_fee` credit to the root admin user with memo
 * `ref_chain_short_to_L{K}` where K is the number of filled levels.
 *
 * Integer-scaled math: percentages are encoded as parts-per-million so all
 * arithmetic stays in `bigint` and never drifts from float rounding.
 */

export const REFERRAL_CURVE_5LVL = [0.05, 0.04, 0.03, 0.02, 0.01] as const;

const CURVE_PPM: readonly bigint[] = [50_000n, 40_000n, 30_000n, 20_000n, 10_000n];
const PPM = 1_000_000n;
export const MAX_REFERRAL_LEVEL = 5;

export function pctForLevel5(level: number): number {
  if (level < 1 || level > MAX_REFERRAL_LEVEL) return 0;
  return REFERRAL_CURVE_5LVL[level - 1];
}

/** Integer share for a level: floor(entryMicro * ppm / 1e6). */
export function levelShareMicro(entryMicro: bigint, level: number): bigint {
  if (level < 1 || level > MAX_REFERRAL_LEVEL) return 0n;
  if (entryMicro <= 0n) return 0n;
  return (entryMicro * CURVE_PPM[level - 1]) / PPM;
}

/** Sum of shares for levels `filledLevels+1`..5. 0 when chain is full. */
export function totalRemainderMicro(entryMicro: bigint, filledLevels: number): bigint {
  let sum = 0n;
  for (let lvl = filledLevels + 1; lvl <= MAX_REFERRAL_LEVEL; lvl++) {
    sum += levelShareMicro(entryMicro, lvl);
  }
  return sum;
}

export interface AccrualEntry {
  recipientUserId: number;
  level: number;
  amountMicro: bigint;
  ledgerId: number;
}

export interface AccrualResult {
  chainDepth: number;
  entries: AccrualEntry[];
  adminRemainderMicro: bigint;
  adminLedgerId: number | null;
}

export interface AccrueSource {
  /** cash_ledger kind triggering the payout (e.g. 'entry_fee'). Stored on referral_accruals.source_kind. */
  kind: string;
  /** Related row id (e.g. user_tariffs.id). Null allowed but breaks the unique index's dedup — caller must ensure idempotency. */
  id: number | null;
}

async function findAdminUserId(tx: DB): Promise<number | null> {
  const rows = await tx.execute(sql`
    SELECT id FROM users WHERE ref_code = ${ADMIN_REF_CODE} LIMIT 1
  `);
  const row = rows[0] as { id?: number } | undefined;
  return row?.id != null ? Number(row.id) : null;
}

/**
 * Walk invite_edges from `fromUserId` up to 5 hops. Depth counter (not a
 * visited set) guarantees termination; the `<> child_user_id` clause defends
 * against corrupt self-loop rows without needing extra state.
 */
async function walkChain(tx: DB, fromUserId: number): Promise<Array<{ id: number; lvl: number }>> {
  const rows = await tx.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT ie.parent_user_id AS id, 1 AS lvl
      FROM invite_edges ie
      WHERE ie.child_user_id = ${fromUserId}
        AND ie.parent_user_id <> ie.child_user_id
      UNION ALL
      SELECT ie.parent_user_id, c.lvl + 1
      FROM invite_edges ie
      JOIN chain c ON ie.child_user_id = c.id
      WHERE c.lvl < ${MAX_REFERRAL_LEVEL}
        AND ie.parent_user_id <> ie.child_user_id
    )
    SELECT id, lvl FROM chain ORDER BY lvl ASC
  `);
  return rows.map((r) => {
    const rr = r as { id: number; lvl: number };
    return { id: Number(rr.id), lvl: Number(rr.lvl) };
  });
}

/**
 * Accrue ref_L1..L5 rewards for an entry from `fromUserId`. Writes to
 * cash_ledger + referral_accruals for each filled level, plus one admin_fee
 * ledger row for any short-chain remainder.
 *
 * Idempotency is caller-owned: the (from_user_id, level, source_kind,
 * source_id) unique index on referral_accruals will raise on double-insert,
 * so callers should invoke this at most once per (fromUserId, source).
 *
 * Pass a `tx` to compose with an enclosing transaction; otherwise a fresh one
 * is opened.
 */
export async function accrueFromEntry(
  fromUserId: number,
  entryMicro: bigint,
  source: AccrueSource,
  tx: DB = db,
): Promise<AccrualResult> {
  if (entryMicro <= 0n) {
    return { chainDepth: 0, entries: [], adminRemainderMicro: 0n, adminLedgerId: null };
  }

  const run = async (txx: DB): Promise<AccrualResult> => {
    const chain = await walkChain(txx, fromUserId);
    const memo = `ref:${source.kind}:${source.id ?? 'null'}`;

    const entries: AccrualEntry[] = [];
    for (const { id: ancestorId, lvl } of chain) {
      const amountMicro = levelShareMicro(entryMicro, lvl);
      if (amountMicro <= 0n) continue;

      const [ledgerRow] = await txx
        .insert(cashLedger)
        .values({
          userId: ancestorId,
          kind: `ref_L${lvl}`,
          amountMicro,
          relatedUserId: fromUserId,
          level: lvl,
          memo,
        })
        .returning({ id: cashLedger.id });

      await txx.insert(referralAccruals).values({
        recipientUserId: ancestorId,
        fromUserId,
        level: lvl,
        sourceKind: source.kind,
        sourceId: source.id,
        amountMicro,
        ledgerId: ledgerRow.id,
      });

      entries.push({ recipientUserId: ancestorId, level: lvl, amountMicro, ledgerId: ledgerRow.id });
    }

    const filledLevels = entries.length;
    const remainder = totalRemainderMicro(entryMicro, filledLevels);
    let adminLedgerId: number | null = null;

    if (remainder > 0n) {
      const adminId = await findAdminUserId(txx);
      if (!adminId) {
        throw new Error(`admin user (ref_code='${ADMIN_REF_CODE}') not found — call ensureAdminUser() at boot`);
      }
      const [row] = await txx
        .insert(cashLedger)
        .values({
          userId: adminId,
          kind: 'admin_fee',
          amountMicro: remainder,
          relatedUserId: fromUserId,
          level: null,
          memo: `ref_chain_short_to_L${filledLevels}`,
        })
        .returning({ id: cashLedger.id });
      adminLedgerId = row.id;
    }

    return {
      chainDepth: filledLevels,
      entries,
      adminRemainderMicro: remainder,
      adminLedgerId,
    };
  };

  if (tx === db) {
    return await db.transaction(async (inner) => run(inner as unknown as DB));
  }
  return run(tx);
}
