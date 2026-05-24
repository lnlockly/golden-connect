import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { awardKarma, listTopKarma, KARMA_RULES, DAILY_CAPS } from '../services/karma.js';
import { logger } from '../lib/logger.js';

/**
 * Cabinet → api karma proxy. Cabinet doesn't talk to Postgres directly,
 * so any tool/action that wants to award karma calls this endpoint with
 * the internal secret.
 */

const log = logger.child({ module: 'internal-karma' });

const awardSchema = z.object({
  user_id: z.number().int().positive().optional(),
  email: z.string().email().optional(),
  kind: z.string().min(1).max(64),
  source_id: z.union([z.number(), z.string()]).optional().nullable(),
  memo: z.string().max(200).optional().nullable(),
});

const app = new Hono();

app.use('/internal/karma/*', requireInternalSecret);

app.post('/internal/karma/award', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = awardSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  let userId = parsed.data.user_id;
  if (!userId && parsed.data.email) {
    const r = (await db.execute(sql`
      SELECT user_id FROM credentials WHERE LOWER(email) = LOWER(${parsed.data.email}) LIMIT 1
    `)) as unknown as Array<{ user_id: number }>;
    userId = r[0]?.user_id ? Number(r[0].user_id) : undefined;
  }
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  const sourceId = parsed.data.source_id != null ? Number(parsed.data.source_id) : null;
  try {
    const res = await awardKarma(userId, parsed.data.kind, sourceId, parsed.data.memo ?? undefined);
    return c.json({ ok: true, points: Number(res.points), capped: res.capped });
  } catch (e: any) {
    log.error({ err: e?.message, userId, kind: parsed.data.kind }, 'awardKarma failed');
    return c.json({ ok: false, error: 'award_failed' }, 500);
  }
});

/** Public-ish leaderboard query (still internal-secret gated). */
app.get('/internal/karma/leaderboard', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const top = await listTopKarma(limit);
  // Resolve usernames
  const ids = top.map((t) => t.user_id);
  let nameMap = new Map<number, { tg_username: string | null; first_name: string | null }>();
  if (ids.length) {
    const rows = (await db.execute(sql`
      SELECT id, tg_username, first_name FROM users WHERE id = ANY(${ids})
    `)) as unknown as Array<{ id: number; tg_username: string | null; first_name: string | null }>;
    nameMap = new Map(rows.map((r) => [Number(r.id), { tg_username: r.tg_username, first_name: r.first_name }]));
  }
  return c.json({
    ok: true,
    items: top.map((t, i) => ({
      rank: i + 1,
      user_id: t.user_id,
      points: Number(t.points),
      tg_username: nameMap.get(t.user_id)?.tg_username || null,
      first_name: nameMap.get(t.user_id)?.first_name || null,
    })),
  });
});

/** User-facing: my karma stats (week earned, all-time, history). */
const meSchema = z.object({ user_id: z.number().int().positive().optional(), email: z.string().email().optional() });

app.post('/internal/karma/me', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const parsed = meSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false }, 400);
  let userId = parsed.data.user_id;
  if (!userId && parsed.data.email) {
    const r = (await db.execute(sql`
      SELECT user_id FROM credentials WHERE LOWER(email) = LOWER(${parsed.data.email}) LIMIT 1
    `)) as unknown as Array<{ user_id: number }>;
    userId = r[0]?.user_id ? Number(r[0].user_id) : undefined;
  }
  if (!userId) return c.json({ ok: false }, 404);

  const stats = (await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')
        THEN points ELSE 0 END), 0)::bigint AS week_points,
      COALESCE(SUM(points), 0)::bigint AS total_points,
      COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('day', NOW()))::int AS today_count
    FROM karma_log WHERE user_id = ${userId}
  `)) as unknown as Array<{ week_points: string; total_points: string; today_count: number }>;

  const history = (await db.execute(sql`
    SELECT kind, points, memo, created_at
    FROM karma_log WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 50
  `)) as unknown as Array<{ kind: string; points: string; memo: string | null; created_at: Date }>;

  // My rank in current week
  const rankRow = (await db.execute(sql`
    WITH wk AS (
      SELECT user_id, SUM(points)::bigint AS pts
      FROM karma_log
      WHERE points > 0
        AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')
      GROUP BY user_id
    ),
    ranked AS (SELECT user_id, pts, RANK() OVER (ORDER BY pts DESC) AS rnk FROM wk)
    SELECT rnk FROM ranked WHERE user_id = ${userId} LIMIT 1
  `)) as unknown as Array<{ rnk: number }>;

  // Read streak from users table
  const streakRow = (await db.execute(sql`
    SELECT login_streak, last_seen_at FROM users WHERE id = ${userId} LIMIT 1
  `)) as unknown as Array<{ login_streak: number; last_seen_at: Date | null }>;
  const streak = streakRow[0]?.login_streak || 0;
  const nextMilestone = streak < 7 ? 7 : streak < 14 ? 14 : streak < 30 ? 30 : null;
  const milestoneReward = streak < 7 ? 200 : streak < 14 ? 500 : streak < 30 ? 1500 : 50;

  return c.json({
    ok: true,
    week_points: Number(stats[0]?.week_points ?? 0),
    total_points: Number(stats[0]?.total_points ?? 0),
    today_count: Number(stats[0]?.today_count ?? 0),
    week_rank: rankRow[0]?.rnk ? Number(rankRow[0].rnk) : null,
    streak,
    next_milestone: nextMilestone,
    milestone_reward: milestoneReward,
    days_to_milestone: nextMilestone ? nextMilestone - streak : null,
    history: history.map((h) => ({
      kind: h.kind,
      points: Number(h.points),
      memo: h.memo,
      created_at: h.created_at,
    })),
  });
});

/** Read karma rules (so cabinet UI can render the table dynamically). */
app.get('/internal/karma/rules', async (c) => {
  const rules: Array<{ kind: string; points: number; daily_cap: number | null; lifetime: boolean }> = [];
  for (const [kind, points] of Object.entries(KARMA_RULES)) {
    rules.push({
      kind,
      points: Number(points),
      daily_cap: typeof DAILY_CAPS[kind] === 'number' ? DAILY_CAPS[kind] : null,
      lifetime: false, // set below
    });
  }
  // Mark lifetime kinds
  const lifetimeSet = new Set(['onboarding_done', 'profile_filled_100', 'task_first', 'tool_first', 'ad_first', 'marketplace_first_sale']);
  for (const r of rules) r.lifetime = lifetimeSet.has(r.kind);
  return c.json({ ok: true, rules });
});

export default app;
