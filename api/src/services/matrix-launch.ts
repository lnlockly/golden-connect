/**
 * Phase 10 — Matrix launch + binary-tree placement.
 *
 * Pre-launch: every business_seat purchased is recorded in business_seats
 * but matrix_positions is empty. users.matrix_frozen = true.
 *
 * Launch (admin button):
 *   1. Backfill: take all active business_seats sorted by activated_at,
 *      place each via BFS (sponsor anchor → first empty slot in subtree).
 *   2. Flip users.matrix_frozen = false everywhere.
 *
 * Post-launch: every NEW tariff buy calls placeSeatForUser() during the
 * same transaction as the purchase, so seat ends up in matrix immediately.
 *
 * Topology: heap-style linear-indexed binary tree.
 *   • position 0 = company root (admin user)
 *   • children of position N: 2N+1 (left) and 2N+2 (right)
 *   • parent of position N: floor((N-1)/2)
 *
 * Placement algorithm:
 *   1. Resolve "anchor" — the closest matrixed ancestor in the referral chain.
 *      Walk users.invited_by_user_id up until we find a user with a row in
 *      matrix_positions. If none found, fall back to root (position 0).
 *   2. BFS from anchor's position downward, level-order, return first slot
 *      where left or right child is missing.
 */

import { sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { logger } from '../lib/logger.js';

const ROOT_POSITION = 0;

/** Walk up users.invited_by_user_id until we find a user with a matrix position. */
export async function findFirstMatrixedAncestor(
  tx: DB,
  startUserId: number,
): Promise<{ userId: number; position: number } | null> {
  let currentId: number | null = startUserId;
  // Cap iterations to prevent runaway loops on broken referral chains.
  for (let i = 0; i < 30; i++) {
    if (currentId == null) break;
    const row = (await tx.execute(sql`
      SELECT u.id, u.invited_by_user_id, mp.position
      FROM users u
      LEFT JOIN matrix_positions mp ON mp.user_id = u.id
      WHERE u.id = ${currentId}
      LIMIT 1
    `)) as unknown as Array<{ id: number; invited_by_user_id: number | null; position: number | null }>;
    if (!row[0]) break;
    if (row[0].position != null) {
      return { userId: row[0].id, position: row[0].position };
    }
    currentId = row[0].invited_by_user_id;
  }
  return null;
}

/** BFS down from an anchor position to find the first slot with an empty child. */
export async function bfsFindEmptySlotUnder(
  tx: DB,
  anchorPosition: number,
): Promise<number> {
  // Collect all occupied positions for fast lookup. For large matrices
  // we'd want an index-based search; at <1M nodes this is fine.
  const occupiedRows = (await tx.execute(sql`
    SELECT position FROM matrix_positions
  `)) as unknown as Array<{ position: number }>;
  const occupied = new Set<number>(occupiedRows.map(r => Number(r.position)));

  // BFS from anchor downward
  const queue: number[] = [anchorPosition];
  const visited = new Set<number>([anchorPosition]);
  while (queue.length > 0) {
    const n = queue.shift()!;
    const left = 2 * n + 1;
    const right = 2 * n + 2;
    if (!occupied.has(left)) return left;
    if (!occupied.has(right)) return right;
    if (!visited.has(left))  { visited.add(left);  queue.push(left); }
    if (!visited.has(right)) { visited.add(right); queue.push(right); }
    // Safety: cap exploration depth so we don't churn for hours on a
    // huge tree. 17 levels = 262143 nodes (ROCKET max).
    if (visited.size > 300_000) {
      throw new Error('matrix BFS exhausted — tree larger than expected');
    }
  }
  // Should be unreachable — even one anchor has 2 children
  throw new Error('matrix BFS found no slot from anchor ' + anchorPosition);
}

/**
 * Place a seat for `ownerUserId`. Returns the assigned matrix position.
 * If user already has a position, returns that (idempotent).
 *
 * Multi-seat: matrix_positions has UNIQUE(user_id, seat_index). BOOST has
 * 2 seats and ROCKET 3, so the same user gets multiple positions in the
 * tree. Additional seats (seat_index > 1) anchor under the user's own
 * first position so they live in the user's own subtree.
 */
export async function placeSeatForUser(tx: DB, ownerUserId: number, seatIndex: number = 1): Promise<number> {
  // Idempotency: if (user_id, seat_index) already exists, return its position.
  const existing = (await tx.execute(sql`
    SELECT position FROM matrix_positions
    WHERE user_id = ${ownerUserId} AND seat_index = ${seatIndex}
    LIMIT 1
  `)) as unknown as Array<{ position: number }>;
  if (existing[0]) return Number(existing[0].position);

  // Total positions in matrix
  const cnt = (await tx.execute(sql`SELECT COUNT(*)::int AS n FROM matrix_positions`)) as unknown as Array<{ n: number }>;
  if (cnt[0].n === 0) {
    // First seat ever — gets the root.
    await tx.execute(sql`
      INSERT INTO matrix_positions (user_id, seat_index, position)
      VALUES (${ownerUserId}, ${seatIndex}, ${ROOT_POSITION})
    `);
    return ROOT_POSITION;
  }

  // Find anchor — nearest matrixed ancestor in referral chain.
  // For seatIndex > 1 of the same user, anchor = user's own first seat
  // (so additional seats place under the user's own subtree).
  let anchorPos: number = ROOT_POSITION;
  if (seatIndex > 1) {
    const ownFirst = (await tx.execute(sql`
      SELECT position FROM matrix_positions
      WHERE user_id = ${ownerUserId}
      ORDER BY seat_index ASC LIMIT 1
    `)) as unknown as Array<{ position: number }>;
    if (ownFirst[0]) anchorPos = Number(ownFirst[0].position);
  } else {
    const anchor = await findFirstMatrixedAncestor(tx, ownerUserId);
    if (anchor) anchorPos = anchor.position;
  }

  const slotPosition = await bfsFindEmptySlotUnder(tx, anchorPos);
  await tx.execute(sql`
    INSERT INTO matrix_positions (user_id, seat_index, position)
    VALUES (${ownerUserId}, ${seatIndex}, ${slotPosition})
  `);
  return slotPosition;
}

/**
 * Place ALL seats for a user based on their tariff. Idempotent — if seats
 * are already placed, returns existing positions.
 */
export async function placeAllSeatsForUser(
  tx: DB,
  ownerUserId: number,
  seatCount: number,
): Promise<number[]> {
  const positions: number[] = [];
  for (let i = 1; i <= seatCount; i++) {
    const pos = await placeSeatForUser(tx, ownerUserId, i);
    positions.push(pos);
  }
  return positions;
}

/** Get all matrix positions for a user, ordered by seat_index. */
export async function getUserMatrixPositions(
  tx: DB,
  userId: number,
): Promise<Array<{ seatIndex: number; position: number }>> {
  const rows = (await tx.execute(sql`
    SELECT seat_index, position
    FROM matrix_positions
    WHERE user_id = ${userId}
    ORDER BY seat_index ASC
  `)) as unknown as Array<{ seat_index: number; position: number }>;
  return rows.map(r => ({ seatIndex: Number(r.seat_index), position: Number(r.position) }));
}

/**
 * Backfill: place all active business_seats into matrix in chronological
 * order. Idempotent — placeSeatForUser skips users already in matrix.
 *
 * Returns counts for admin UI feedback.
 */
export async function launchMatrixBackfill(): Promise<{
  total_seats: number;
  placed: number;
  skipped_already_in_matrix: number;
  errors: number;
  unfrozen_users: number;
}> {
  const result = { total_seats: 0, placed: 0, skipped_already_in_matrix: 0, errors: 0, unfrozen_users: 0 };

  await db.transaction(async (tx) => {
    // 1. Read all active business_seats in activation order
    const seats = (await tx.execute(sql`
      SELECT user_id, MIN(activated_at) AS first_activated
      FROM business_seats
      WHERE deactivated_at IS NULL
      GROUP BY user_id
      ORDER BY MIN(activated_at) ASC
    `)) as unknown as Array<{ user_id: number; first_activated: string | Date }>;
    result.total_seats = seats.length;

    // 2. Place each (group by user_id since matrix is one-position-per-user)
    for (const seat of seats) {
      try {
        const before = (await tx.execute(sql`
          SELECT 1 FROM matrix_positions WHERE user_id = ${seat.user_id} LIMIT 1
        `)) as unknown as any[];
        if (before.length > 0) {
          result.skipped_already_in_matrix++;
          continue;
        }
        await placeSeatForUser(tx as unknown as DB, seat.user_id);
        result.placed++;
      } catch (e: any) {
        logger.error({ userId: seat.user_id, err: e.message }, 'matrix backfill: placement failed');
        result.errors++;
      }
    }

    // 3. Unfreeze matrix globally
    const unfreeze = (await tx.execute(sql`
      UPDATE users SET matrix_frozen = false
      WHERE matrix_frozen = true
      RETURNING id
    `)) as unknown as any[];
    result.unfrozen_users = unfreeze.length;
  });

  logger.warn(
    { total: result.total_seats, placed: result.placed, errors: result.errors, unfrozen: result.unfrozen_users },
    'matrix-launch: backfill complete',
  );

  // Drain marketplace pending matrix (sales made before launch)
  try {
    const { processPendingMpMatrix } = await import('./mp-matrix-process.js');
    const mpRes = await processPendingMpMatrix();
    logger.info({ mp_drain: mpRes }, 'matrix-launch: mp pending drain done');
  } catch (e: any) {
    logger.warn({ err: e?.message }, 'matrix-launch: mp pending drain failed (non-fatal)');
  }

  return result;
}

/** Has the matrix been launched? Reads users.matrix_frozen. */
export async function isMatrixLaunched(): Promise<boolean> {
  const r = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM users WHERE matrix_frozen = false
  `)) as unknown as Array<{ n: number }>;
  return Number(r[0]?.n ?? 0) > 0;
}
