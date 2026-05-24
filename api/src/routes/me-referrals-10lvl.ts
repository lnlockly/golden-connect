import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { MAX_REFERRAL_LEVEL, REFERRAL_CURVE_10LVL } from '../services/referrals-10lvl.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/referrals/10lvl', requireAuth);

interface LevelRow {
  level: number;
  count: number;
  earned_micro: string;
  pct: number;
}

/**
 * GET /me/referrals/5lvl — ten-row breakdown of the caller's classic
 * referral earnings: how many distinct downlines have ever paid into each
 * level, and how much that level has paid out in total. Plus a flat
 * grand-total so the dashboard tile doesn't need a second sum.
 *
 * Direct SQL aggregates against `referral_accruals` — that table is the
 * source of truth for ref_L1..L10 credits and is paired 1:1 with the
 * matching `cash_ledger` rows by the accrual writer.
 */
app.get('/me/referrals/10lvl', async (c) => {
  const session = c.get('user');

  // One pass per level: COUNT(DISTINCT from_user_id), SUM(amount_micro).
  // Group + COALESCE handles missing levels (no payouts yet).
  const rows = await db.execute<{
    level: number;
    payers: number;
    total: string;
  }>(sql`
    SELECT level::int AS level,
           COUNT(DISTINCT from_user_id)::int AS payers,
           COALESCE(SUM(amount_micro), 0)::text AS total
    FROM referral_accruals
    WHERE recipient_user_id = ${session.id}
      AND level BETWEEN 1 AND ${MAX_REFERRAL_LEVEL}
    GROUP BY level
  `);

  const byLevel = new Map<number, { payers: number; total: bigint }>();
  for (const r of rows) {
    byLevel.set(Number(r.level), {
      payers: Number(r.payers),
      total: BigInt(r.total),
    });
  }

  const levels: LevelRow[] = [];
  let grandTotal = 0n;
  for (let lvl = 1; lvl <= MAX_REFERRAL_LEVEL; lvl++) {
    const entry = byLevel.get(lvl);
    const total = entry?.total ?? 0n;
    grandTotal += total;
    levels.push({
      level: lvl,
      count: entry?.payers ?? 0,
      earned_micro: String(total),
      pct: REFERRAL_CURVE_10LVL[lvl - 1] ?? 0,
    });
  }

  return c.json({
    ok: true,
    levels,
    total_earned_micro: String(grandTotal),
  });
});

export default app;
