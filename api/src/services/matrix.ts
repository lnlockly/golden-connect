import { inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cashLedger, matrixAccruals, matrixPositions } from '../db/schema.js';
import { applyIncomeSplit } from './income-split.js';

/**
 * Global 2-wide (binary) matrix — the heart of TrendeX matrix payouts.
 *
 * Topology (matches matrix-launch.ts):
 *   • position 0 = company root (admin user)
 *   • children of position N: 2N+1 (left), 2N+2 (right)
 *   • parent of position N: floor((N-1)/2)
 *
 * Payout (per presentation slide 6):
 *   • LAUNCH buyer: pays 12 levels up at \$0.50 each = \$6.00 total
 *   • BOOST  buyer: pays 14 levels up at \$0.60 each = \$8.40 total
 *   • ROCKET buyer: pays 17 levels up at \$0.70 each = \$11.90 total
 *
 * If buyer's chain to root is shorter than required depth, undistributed
 * shares accumulate to admin (kind='admin_fee', memo='matrix_no_upstream').
 *
 * The uniqueness constraint (from_user_id, level) on matrix_accruals is
 * the idempotency guard: a given payer can only ever pay each matrix
 * level once.
 */

export const MATRIX_WIDTH = 2;

export type TariffCode = 'launch' | 'boost' | 'rocket';

export interface TariffMatrixSpec {
  depth: number;             // levels up to pay
  ratePerLevelMicro: bigint; // fixed amount per level
}

export const TARIFF_MATRIX: Record<TariffCode, TariffMatrixSpec> = {
  launch: { depth: 12, ratePerLevelMicro: 500_000n },   // \$0.50
  boost:  { depth: 14, ratePerLevelMicro: 600_000n },   // \$0.60
  rocket: { depth: 17, ratePerLevelMicro: 700_000n },   // \$0.70
};

/** Parent position for `p`, or null for the root. */
export function parentPosition(p: number): number | null {
  if (!Number.isInteger(p) || p < 0) return null;
  if (p === 0) return null;
  return Math.floor((p - 1) / MATRIX_WIDTH);
}

/** Depth of position `p` in the tree; depth of root (0) is 0. */
export function depthOfPosition(p: number): number {
  let d = 0;
  let cur = p;
  while (cur > 0) {
    cur = Math.floor((cur - 1) / MATRIX_WIDTH);
    d++;
  }
  return d;
}

/** Up to `n` ancestor positions above `p`, nearest first. Empty if `p` is root. */
export function aboveN(p: number, n: number): number[] {
  const out: number[] = [];
  let cur = p;
  for (let i = 0; i < n; i++) {
    const par = parentPosition(cur);
    if (par === null) break;
    out.push(par);
    cur = par;
  }
  return out;
}

type Tx = typeof db;

/**
 * Returns the deepest matrix position for `userId` (multi-seat — pick the
 * one furthest from root so payout chain reaches max upline). Returns null
 * if user is not yet placed in matrix.
 */
async function getDeepestPosition(tx: Tx, userId: number): Promise<number | null> {
  const rows = (await tx.execute(sql`
    SELECT position FROM matrix_positions WHERE user_id = ${userId}
  `)) as unknown as Array<{ position: number }>;
  if (!rows.length) return null;
  return Math.max(...rows.map(r => Number(r.position)));
}

/**
 * Resolve owner user_id for a list of positions in one query.
 */
async function resolveOwnersOfPositions(
  tx: Tx,
  positions: number[],
): Promise<Map<number, number>> {
  if (!positions.length) return new Map();
  const rows = await tx
    .select({ position: matrixPositions.position, userId: matrixPositions.userId })
    .from(matrixPositions)
    .where(inArray(matrixPositions.position, positions));
  const m = new Map<number, number>();
  for (const r of rows) m.set(Number(r.position), Number(r.userId));
  return m;
}

export interface MatrixShareRecord {
  level: number;
  recipientUserId: number;
  position: number;
  amountMicro: bigint;
}

export interface AccrueFromEntryResult {
  poolMicro: bigint;          // total fixed payout for this tariff
  shares: MatrixShareRecord[];
  adminFeeMicro: bigint;
  adminUserId: number | null;
  depth: number;
  ratePerLevelMicro: bigint;
}

/**
 * Pay the buyer's matrix uplines per slide-6 fixed rates.
 *
 *   pool = depth × ratePerLevel  (e.g. ROCKET = 17 × \$0.70 = \$11.90)
 *
 * For each ancestor at level 1..depth:
 *   - if exists, credit \$rate
 *   - else accumulate to adminFee (matrix_no_upstream)
 *
 * Idempotency on (matrix_accruals.fromUserId, level) — re-running the
 * same buyer/tariff is a no-op.
 */
export async function accrueFromEntry(
  buyerId: number,
  _entryMicroIgnored: bigint,
  tariffId: number,
  tx: Tx = db,
): Promise<AccrueFromEntryResult> {
  // Resolve tariff code from tariffId
  const tariffRow = (await tx.execute(sql`
    SELECT code FROM tariffs WHERE id = ${tariffId} LIMIT 1
  `)) as unknown as Array<{ code: string }>;
  const code = tariffRow[0]?.code as TariffCode | undefined;
  if (!code || !TARIFF_MATRIX[code]) {
    throw new Error(`accrueFromEntry: unknown tariff ${tariffId} / ${code}`);
  }
  const spec = TARIFF_MATRIX[code];
  const poolMicro = spec.ratePerLevelMicro * BigInt(spec.depth);

  const run = async (txx: Tx): Promise<AccrueFromEntryResult> => {
    const startPos = await getDeepestPosition(txx, buyerId);
    if (startPos === null) {
      throw new Error(`buyer ${buyerId} has no matrix position`);
    }

    // Walk up `depth` levels collecting ancestor positions.
    const ancestors = aboveN(startPos, spec.depth);
    const owners = await resolveOwnersOfPositions(txx, ancestors);

    const [adminRow] = await txx
      .select({ userId: matrixPositions.userId })
      .from(matrixPositions)
      .where(sql`${matrixPositions.position} = 0`)
      .limit(1);
    const adminUserId = adminRow ? Number(adminRow.userId) : null;

    const shares: MatrixShareRecord[] = [];
    let adminFeeMicro = 0n;
    const memo = `entry:tariff:${tariffId}`;

    for (let i = 0; i < spec.depth; i++) {
      const level = i + 1;
      const ancestorPos = ancestors[i];
      const recipientUserId = ancestorPos !== undefined ? owners.get(ancestorPos) : undefined;
      if (recipientUserId === undefined) {
        // chain ended (buyer too shallow) — admin sweeps the dust
        adminFeeMicro += spec.ratePerLevelMicro;
        continue;
      }
      const [ledger] = await txx
        .insert(cashLedger)
        .values({
          userId: recipientUserId,
          kind: 'matrix_share',
          amountMicro: spec.ratePerLevelMicro,
          relatedUserId: buyerId,
          level,
          memo,
        })
        .returning({ id: cashLedger.id });
      // Apply 80/20 split — writes paired subscription_split row and updates user.subscription_balance_micro.
      await applyIncomeSplit(txx, recipientUserId, spec.ratePerLevelMicro, 'matrix_share', ledger.id);
      await txx.insert(matrixAccruals).values({
        recipientUserId,
        fromUserId: buyerId,
        fromPosition: startPos,
        level,
        amountMicro: spec.ratePerLevelMicro,
        ledgerId: ledger.id,
      });
      shares.push({
        level,
        recipientUserId,
        position: ancestorPos as number,
        amountMicro: spec.ratePerLevelMicro,
      });
    }

    if (adminFeeMicro > 0n) {
      if (adminUserId === null) {
        throw new Error('admin position 0 not seeded — cannot sweep matrix_no_upstream');
      }
      await txx.insert(cashLedger).values({
        userId: adminUserId,
        kind: 'admin_fee',
        amountMicro: adminFeeMicro,
        relatedUserId: buyerId,
        memo: 'matrix_no_upstream',
      });
    }

    return {
      poolMicro,
      shares,
      adminFeeMicro,
      adminUserId,
      depth: spec.depth,
      ratePerLevelMicro: spec.ratePerLevelMicro,
    };
  };

  if (tx === db) return db.transaction(async (inner) => run(inner as unknown as Tx));
  return run(tx);
}

/**
 * Legacy export kept for assignPosition/getAbove3 callers — single-position
 * lookup. Returns up to 3 ancestor user_ids for tests/back-compat.
 * New code should use aboveN + resolveOwners directly.
 */
export async function getAbove3(userId: number, tx: Tx = db): Promise<number[]> {
  const own = await tx
    .select({ position: matrixPositions.position })
    .from(matrixPositions)
    .where(sql`${matrixPositions.userId} = ${userId}`)
    .limit(1);
  if (own.length === 0) return [];
  const pos = Number(own[0].position);
  const parents = aboveN(pos, 3);
  if (parents.length === 0) return [];
  const owners = await resolveOwnersOfPositions(tx, parents);
  const out: number[] = [];
  for (const p of parents) {
    const uid = owners.get(p);
    if (uid !== undefined) out.push(uid);
  }
  return out;
}

/**
 * Assigns a matrix position to userId (LEGACY — single seat). New code
 * should use placeSeatForUser / placeAllSeatsForUser from matrix-launch.ts.
 */
export async function assignPosition(
  userId: number,
  tx: Tx = db,
  seatIndex: number = 1,
): Promise<number> {
  const run = async (txx: Tx): Promise<number> => {
    const rows = await txx.execute<{ position: number }>(sql`
      SELECT position FROM matrix_positions ORDER BY position DESC LIMIT 1 FOR UPDATE
    `);
    const next = rows.length > 0 ? Number(rows[0].position) + 1 : 0;
    await txx.insert(matrixPositions).values({ userId, position: next, seatIndex });
    return next;
  };
  if (tx === db) return db.transaction(async (inner) => run(inner as unknown as Tx));
  return run(tx);
}
