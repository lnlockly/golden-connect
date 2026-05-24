import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { matrixAccruals, matrixPositions, users } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { depthOfPosition, getAbove3 } from '../services/matrix.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/matrix', requireAuth);

/**
 * GET /me/matrix — caller's matrix position, depth in the tree, the three
 * users above (parent / grandparent / great-grandparent), the count of
 * descendants beneath them, the running sum of matrix payouts they've
 * earned, and the most recent payout slices.
 *
 * Returns `position: null` and zeros for users not yet placed in the
 * matrix — the frontend renders that as "activate a tariff to claim a seat".
 */
app.get('/me/matrix', async (c) => {
  const session = c.get('user');

  const ownRows = await db
    .select({ position: matrixPositions.position })
    .from(matrixPositions)
    .where(eq(matrixPositions.userId, session.id))
    .limit(1);

  if (ownRows.length === 0) {
    return c.json({
      ok: true,
      position: null,
      level_in_tree: 0,
      above_3: [],
      downstream_count: 0,
      total_earned_micro: '0',
      recent_slices: [],
    });
  }

  const position = Number(ownRows[0].position);
  const levelInTree = depthOfPosition(position);
  const aboveIds = await getAbove3(session.id);

  // Resolve uplines to display rows. `aboveIds` is ordered L1, L2, L3, so
  // we keep that ordering after the IN-batch user lookup.
  let above3: Array<{ user_id: number; ref_code: string; tg_username: string | null; level: number }> = [];
  if (aboveIds.length > 0) {
    const userRows = await db.execute<{
      id: number;
      ref_code: string;
      tg_username: string | null;
    }>(sql`
      SELECT id::int AS id, ref_code, tg_username FROM users WHERE id = ANY(${aboveIds})
    `);
    const byId = new Map<number, { ref_code: string; tg_username: string | null }>();
    for (const r of userRows) byId.set(Number(r.id), { ref_code: r.ref_code, tg_username: r.tg_username });
    above3 = aboveIds.map((uid, idx) => {
      const u = byId.get(uid);
      return {
        user_id: uid,
        ref_code: u?.ref_code ?? '',
        tg_username: u?.tg_username ?? null,
        level: idx + 1,
      };
    });
  }

  // Count descendants by walking the ternary subtree rooted at `position`
  // via the parent formula floor((p-1)/3). Excludes the caller themselves.
  const subtreeRows = await db.execute<{ count: string }>(sql`
    WITH RECURSIVE subtree(pos) AS (
      SELECT position FROM matrix_positions WHERE position = ${position}
      UNION ALL
      SELECT mp.position
      FROM matrix_positions mp
      JOIN subtree st ON ((mp.position - 1) / 3) = st.pos
      WHERE mp.position > 0
    )
    SELECT (COUNT(*) - 1)::text AS count FROM subtree
  `);
  const downstreamCount = Number(subtreeRows[0]?.count ?? '0');

  const earnedRows = await db.execute<{ total: string }>(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::text AS total
    FROM matrix_accruals WHERE recipient_user_id = ${session.id}
  `);
  const totalEarnedMicro = earnedRows[0]?.total ?? '0';

  const recentRows = await db
    .select({
      id: matrixAccruals.id,
      fromUserId: matrixAccruals.fromUserId,
      fromPosition: matrixAccruals.fromPosition,
      level: matrixAccruals.level,
      amountMicro: matrixAccruals.amountMicro,
      createdAt: matrixAccruals.createdAt,
      fromRefCode: users.refCode,
      fromTgUsername: users.tgUsername,
    })
    .from(matrixAccruals)
    .leftJoin(users, eq(matrixAccruals.fromUserId, users.id))
    .where(eq(matrixAccruals.recipientUserId, session.id))
    .orderBy(desc(matrixAccruals.id))
    .limit(20);

  return c.json({
    ok: true,
    position,
    level_in_tree: levelInTree,
    above_3: above3,
    downstream_count: downstreamCount,
    total_earned_micro: totalEarnedMicro,
    recent_slices: recentRows.map((r) => ({
      id: Number(r.id),
      from_user_id: Number(r.fromUserId),
      from_position: Number(r.fromPosition),
      from_ref_code: r.fromRefCode ?? null,
      from_tg_username: r.fromTgUsername ?? null,
      level: Number(r.level),
      amount_micro: String(r.amountMicro),
      created_at: r.createdAt,
    })),
  });
});

export default app;
