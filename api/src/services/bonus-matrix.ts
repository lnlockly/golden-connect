import { inArray, sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'bonus-matrix' });

const ROOT_POSITION = 0;

/**
 * Walk up users.invited_by_user_id chain until we find a user that is
 * already in the bonus matrix. Falls back to root (position 0) if no
 * matrixed ancestor found.
 */
async function findFirstAnchor(tx: DB, userId: number): Promise<number> {
  let currentId: number | null = userId;
  for (let i = 0; i < 30; i++) {
    if (currentId == null) break;
    const row = (await tx.execute(sql`
      SELECT u.id, u.invited_by_user_id, bm.position
      FROM users u
      LEFT JOIN bonus_matrix_positions bm ON bm.user_id = u.id
      WHERE u.id = ${currentId}
      LIMIT 1
    `)) as unknown as Array<{ id: number; invited_by_user_id: number | null; position: number | null }>;
    if (!row[0]) break;
    if (row[0].position != null) return Number(row[0].position);
    currentId = row[0].invited_by_user_id;
  }
  return ROOT_POSITION;
}

/**
 * BFS from anchor: find first slot where left (2N+1) or right (2N+2) is empty.
 */
async function bfsFindEmptySlot(tx: DB, anchorPos: number): Promise<number> {
  const occupiedRows = (await tx.execute(sql`SELECT position FROM bonus_matrix_positions`)) as unknown as Array<{ position: number }>;
  const occupied = new Set<number>(occupiedRows.map(r => Number(r.position)));

  const queue: number[] = [anchorPos];
  const visited = new Set<number>([anchorPos]);
  while (queue.length > 0) {
    const n = queue.shift()!;
    const left = 2 * n + 1;
    const right = 2 * n + 2;
    if (!occupied.has(left)) return left;
    if (!occupied.has(right)) return right;
    if (!visited.has(left)) { visited.add(left); queue.push(left); }
    if (!visited.has(right)) { visited.add(right); queue.push(right); }
    if (visited.size > 1_000_000) {
      throw new Error('bonus-matrix BFS exhausted');
    }
  }
  throw new Error('bonus-matrix BFS no slot');
}

/**
 * Place a single user in the bonus matrix. Idempotent — if already
 * placed, returns existing position.
 */
export async function placeBonusSeat(userId: number, tx: DB = db): Promise<number> {
  const run = async (txx: DB) => {
    const existing = (await txx.execute(sql`
      SELECT position FROM bonus_matrix_positions WHERE user_id = ${userId} LIMIT 1
    `)) as unknown as Array<{ position: number }>;
    if (existing[0]) return Number(existing[0].position);

    const cnt = (await txx.execute(sql`SELECT COUNT(*)::int AS n FROM bonus_matrix_positions`)) as unknown as Array<{ n: number }>;
    if (cnt[0].n === 0) {
      await txx.execute(sql`
        INSERT INTO bonus_matrix_positions (user_id, position, parent_position)
        VALUES (${userId}, ${ROOT_POSITION}, NULL)
      `);
      log.info({ userId, position: ROOT_POSITION }, 'bonus-matrix: root placed');
      return ROOT_POSITION;
    }

    const anchorPos = await findFirstAnchor(txx, userId);
    const slot = await bfsFindEmptySlot(txx, anchorPos);
    const parent = slot > 0 ? Math.floor((slot - 1) / 2) : null;
    await txx.execute(sql`
      INSERT INTO bonus_matrix_positions (user_id, position, parent_position)
      VALUES (${userId}, ${slot}, ${parent})
    `);
    log.info({ userId, position: slot, parent }, 'bonus-matrix: placed');
    return slot;
  };
  if (tx === db) return db.transaction(async (inner) => run(inner as unknown as DB));
  return run(tx);
}

/**
 * Backfill — place all not-yet-placed users in joined_at order.
 */
export async function backfillBonusMatrix(): Promise<{ placed: number; errors: number }> {
  const users = (await db.execute(sql`
    SELECT u.id FROM users u
    LEFT JOIN bonus_matrix_positions bm ON bm.user_id = u.id
    WHERE bm.id IS NULL
    ORDER BY u.joined_at ASC NULLS LAST, u.id ASC
  `)) as unknown as Array<{ id: number }>;

  log.info({ count: users.length }, 'bonus-matrix backfill: start');

  let placed = 0;
  let errors = 0;
  for (const u of users) {
    try {
      await placeBonusSeat(Number(u.id));
      placed++;
    } catch (e: any) {
      log.error({ userId: u.id, err: e?.message }, 'backfill failed');
      errors++;
    }
  }
  log.info({ placed, errors }, 'bonus-matrix backfill: done');
  return { placed, errors };
}

/**
 * Count of descendants (subtree size, not including self) for each given position.
 * Uses one CTE per position via UNION — efficient up to ~63 positions per call.
 */
export async function getDescendantCounts(positions: number[]): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  if (!positions.length) return m;
  // BFS per position up to depth 20 — collects subtree positions level by
  // level and counts how many are actually occupied.
  for (const root of positions) {
    // Walk all subtree positions: root*2+1, root*2+2, then their children, etc.
    // BFS up to depth 20.
    let frontier = [root];
    let total = 0;
    for (let d = 0; d < 20; d++) {
      const next: number[] = [];
      for (const p of frontier) next.push(2 * p + 1, 2 * p + 2);
      if (!next.length) break;
      const r = (await db.execute(sql.raw(
        `SELECT COUNT(*)::int AS n FROM bonus_matrix_positions WHERE position IN (${next.join(',') || 'NULL'})`
      ))) as unknown as Array<{ n: number }>;
      const cnt = Number(r[0]?.n ?? 0);
      total += cnt;
      if (cnt === 0) break;
      frontier = next;
    }
    m.set(root, total);
  }
  return m;
}

/**
 * Walk up from `userId` through parent chain — returns chain of positions/users.
 */
export async function getUpline(userId: number, height: number = 10): Promise<Array<{ position: number; user_id: number; tg_username: string | null; first_name: string | null; avatar_url: string | null }>> {
  const startRow = (await db.execute(sql`
    SELECT position FROM bonus_matrix_positions WHERE user_id = ${userId} LIMIT 1
  `)) as unknown as Array<{ position: number }>;
  if (!startRow[0]) return [];
  let pos = Number(startRow[0].position);
  const chain: number[] = [];
  for (let i = 0; i < height; i++) {
    if (pos === 0) break;
    const parent = Math.floor((pos - 1) / 2);
    chain.push(parent);
    pos = parent;
  }
  if (chain.length === 0) return [];
  const rows = (await db.execute(sql.raw(
    `SELECT bm.position, bm.user_id, u.tg_username, u.first_name, u.avatar_url
     FROM bonus_matrix_positions bm
     LEFT JOIN users u ON u.id = bm.user_id
     WHERE bm.position IN (${chain.join(',')})`
  ))) as unknown as Array<any>;
  const byPos = new Map<number, any>();
  for (const r of rows) byPos.set(Number(r.position), r);
  return chain.map(p => byPos.get(p)).filter(Boolean).map(r => ({
    position: Number(r.position),
    user_id: Number(r.user_id),
    tg_username: r.tg_username,
    first_name: r.first_name,
    avatar_url: r.avatar_url,
  }));
}

/**
 * Get bonus-matrix tree starting from a root user, going N levels deep.
 * Returns nested structure for UI rendering.
 */
export async function getBonusMatrixTree(rootUserId: number, depth: number = 4): Promise<any> {
  const rootRow = (await db.execute(sql`
    SELECT bm.position, bm.user_id, bm.parent_position, bm.joined_at,
           u.tg_username, u.first_name
    FROM bonus_matrix_positions bm
    LEFT JOIN users u ON u.id = bm.user_id
    WHERE bm.user_id = ${rootUserId} LIMIT 1
  `)) as unknown as Array<any>;
  if (!rootRow[0]) return null;
  const rootPos = Number(rootRow[0].position);

  // Collect all positions within `depth` levels under rootPos.
  const collected: number[] = [rootPos];
  let frontier = [rootPos];
  for (let d = 0; d < depth; d++) {
    const next: number[] = [];
    for (const p of frontier) {
      next.push(2 * p + 1, 2 * p + 2);
    }
    collected.push(...next);
    frontier = next;
  }

  const rows = (await db.execute(sql.raw(
    `SELECT bm.position, bm.user_id, bm.parent_position, bm.joined_at,
            u.tg_username, u.first_name, u.avatar_url
     FROM bonus_matrix_positions bm
     LEFT JOIN users u ON u.id = bm.user_id
     WHERE bm.position IN (${collected.join(',') || 'NULL'})`
  ))) as unknown as Array<any>;

  // Compute descendants count for each position shown
  const descCounts = await getDescendantCounts(collected);

  const byPos = new Map<number, any>();
  for (const r of rows) {
    const pos = Number(r.position);
    byPos.set(pos, {
      position: pos,
      user_id: Number(r.user_id),
      tg_username: r.tg_username,
      first_name: r.first_name,
      avatar_url: r.avatar_url,
      joined_at: r.joined_at,
      descendants_count: descCounts.get(pos) || 0,
      children: [],
    });
  }

  for (const node of byPos.values()) {
    const left = byPos.get(2 * node.position + 1);
    const right = byPos.get(2 * node.position + 2);
    if (left) node.children.push(left);
    if (right) node.children.push(right);
  }

  return byPos.get(rootPos) || null;
}

/** Stats for a user's view: their position + downline counts per level. */
export async function getBonusMatrixStats(userId: number): Promise<any> {
  const row = (await db.execute(sql`
    SELECT position FROM bonus_matrix_positions WHERE user_id = ${userId} LIMIT 1
  `)) as unknown as Array<{ position: number }>;
  if (!row[0]) return null;
  const pos = Number(row[0].position);

  // Total in-system count
  const totalRow = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM bonus_matrix_positions`)) as unknown as Array<{ n: number }>;
  const total = Number(totalRow[0]?.n ?? 0);

  // Count downline by level (up to 10 levels deep)
  const byLevel: Record<number, number> = {};
  let frontier = [pos];
  for (let d = 1; d <= 10; d++) {
    const next: number[] = [];
    for (const p of frontier) next.push(2 * p + 1, 2 * p + 2);
    if (next.length === 0) break;
    const cnt = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM bonus_matrix_positions WHERE position = ANY(${sql.raw('ARRAY[' + next.join(',') + ']::int[]')})
    `)) as unknown as Array<{ n: number }>;
    byLevel[d] = Number(cnt[0]?.n ?? 0);
    frontier = next;
    if (byLevel[d] === 0) break;
  }
  const downlineTotal = Object.values(byLevel).reduce((a, b) => a + b, 0);

  return {
    user_id: userId,
    position: pos,
    total_in_matrix: total,
    downline_total: downlineTotal,
    downline_by_level: byLevel,
  };
}
