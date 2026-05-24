/**
 * Gamification HTTP surface. Mix of /internal/* (bot-only, secret-gated) and
 * /me/* (user session, JWT-gated) endpoints.
 *
 * Scope — Phase 1C:
 *  - POST /internal/gamification/register-action
 *  - POST /internal/quests/check-progress
 *  - GET  /me/gamification/streaks
 *  - GET  /me/gamification/xp
 *  - GET  /me/quests
 *  - GET  /gamification/leaderboard   (public read-only)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import {
  registerAction,
  checkQuestProgress,
  getStreak,
  getXp,
  listUserQuests,
  leaderboardTop,
} from '../services/gamification.js';
import { levelProgress } from '../services/xp.js';

const app = new Hono<{ Variables: AuthVars }>();

// ---------------------------------------------------------------------------
// Internal routes — bot-only, gated by x-golden-connect-secret.
// ---------------------------------------------------------------------------

app.use('/internal/gamification/*', requireInternalSecret);
app.use('/internal/quests/*', requireInternalSecret);

const registerActionSchema = z.object({
  user_id: z.number().int().positive(),
  action_type: z.string().min(1).max(64),
});

app.post('/internal/gamification/register-action', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = registerActionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const res = await registerAction(parsed.data.user_id, parsed.data.action_type);
  // Also check streak-based quests in one round-trip so the bot doesn't need
  // to chain calls. A no-match is cheap (empty list of matching quests).
  const questRes = await checkQuestProgress(parsed.data.user_id, 'streak_days', {
    absoluteValue: res.streak,
  });
  return c.json({
    ok: true,
    streak: res.streak,
    longest_streak: res.longestStreak,
    badges_earned: res.badgesEarned,
    quests_granted: questRes.grantedQuests,
  });
});

const checkProgressSchema = z.object({
  user_id: z.number().int().positive(),
  trigger_event: z.string().min(1).max(64),
  increment_by: z.number().int().positive().optional(),
  absolute_value: z.number().int().nonnegative().optional(),
  context: z.record(z.unknown()).optional(),
});

// Bot-facing read-only proxies. The bot has no JWT for a given user — it
// dispatches on tg_id → user_id server-side. We keep these under
// /internal/gamification/* so they're secret-gated.

app.get('/internal/gamification/streaks/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ ok: false, error: 'bad_user_id' }, 400);
  }
  const s = await getStreak(userId);
  return c.json({
    ok: true,
    current_streak: s.currentStreak,
    longest_streak: s.longestStreak,
    last_action_at: s.lastActionAt?.toISOString() ?? null,
  });
});

app.get('/internal/gamification/xp/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ ok: false, error: 'bad_user_id' }, 400);
  }
  const xp = await getXp(userId);
  const prog = levelProgress(xp.totalXp);
  return c.json({
    ok: true,
    total_xp: xp.totalXp,
    level: prog.level,
    xp_in_level: prog.xpInLevel,
    xp_to_next: prog.xpToNext,
    xp_span: prog.xpSpan,
    fraction: prog.fraction,
  });
});

app.get('/internal/gamification/quests/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ ok: false, error: 'bad_user_id' }, 400);
  }
  const rows = await listUserQuests(userId);
  const byChapter = new Map<
    string,
    Array<{
      id: string;
      title: string;
      description: string;
      xp: number;
      completed: boolean;
      progress: number;
      completed_at: string | null;
    }>
  >();
  for (const r of rows) {
    if (!byChapter.has(r.chapter)) byChapter.set(r.chapter, []);
    byChapter.get(r.chapter)!.push({
      id: r.questId,
      title: r.title,
      description: r.description,
      xp: r.xp,
      completed: r.completedAt !== null,
      progress: r.progress ?? 0,
      completed_at: r.completedAt?.toISOString() ?? null,
    });
  }
  return c.json({
    ok: true,
    chapters: Array.from(byChapter.entries()).map(([chapter, items]) => ({
      chapter,
      quests: items,
    })),
  });
});

app.post('/internal/quests/check-progress', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = checkProgressSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const res = await checkQuestProgress(parsed.data.user_id, parsed.data.trigger_event, {
    incrementBy: parsed.data.increment_by,
    absoluteValue: parsed.data.absolute_value,
    context: parsed.data.context,
  });
  return c.json({
    ok: true,
    granted: res.grantedQuests,
    total_xp_granted: res.totalXpGranted,
  });
});

// ---------------------------------------------------------------------------
// User-facing routes — JWT session required.
// ---------------------------------------------------------------------------

app.use('/me/gamification/*', requireAuth);
app.use('/me/quests', requireAuth);

app.get('/me/gamification/streaks', async (c) => {
  const session = c.get('user');
  const s = await getStreak(session.id);
  return c.json({
    ok: true,
    current_streak: s.currentStreak,
    longest_streak: s.longestStreak,
    last_action_at: s.lastActionAt?.toISOString() ?? null,
  });
});

app.get('/me/gamification/xp', async (c) => {
  const session = c.get('user');
  const xp = await getXp(session.id);
  const prog = levelProgress(xp.totalXp);
  return c.json({
    ok: true,
    total_xp: xp.totalXp,
    level: prog.level,
    xp_in_level: prog.xpInLevel,
    xp_to_next: prog.xpToNext,
    xp_span: prog.xpSpan,
    fraction: prog.fraction,
  });
});

app.get('/me/quests', async (c) => {
  const session = c.get('user');
  const rows = await listUserQuests(session.id);

  // Group by chapter; within a chapter keep the original order.
  const byChapter = new Map<
    string,
    Array<{
      id: string;
      title: string;
      description: string;
      xp: number;
      completed: boolean;
      progress: number;
      completed_at: string | null;
    }>
  >();
  for (const r of rows) {
    const chap = r.chapter;
    if (!byChapter.has(chap)) byChapter.set(chap, []);
    byChapter.get(chap)!.push({
      id: r.questId,
      title: r.title,
      description: r.description,
      xp: r.xp,
      completed: r.completedAt !== null,
      progress: r.progress ?? 0,
      completed_at: r.completedAt?.toISOString() ?? null,
    });
  }

  return c.json({
    ok: true,
    chapters: Array.from(byChapter.entries()).map(([chapter, items]) => ({
      chapter,
      quests: items,
    })),
  });
});

// ---------------------------------------------------------------------------
// Public: leaderboard (no auth). Exposes user_id + xp only — bot maps ids to
// display names via its cached users repo.
// ---------------------------------------------------------------------------

app.get('/gamification/leaderboard', async (c) => {
  const periodRaw = (c.req.query('period') ?? 'week').toLowerCase();
  const period = (['day', 'week', 'month', 'all'].includes(periodRaw)
    ? periodRaw
    : 'week') as 'day' | 'week' | 'month' | 'all';
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 20) || 20));
  const rows = await leaderboardTop(period, limit);
  return c.json({
    ok: true,
    period,
    rows: rows.map((r, i) => ({
      rank: i + 1,
      user_id: r.userId,
      xp: r.xp,
      level: r.level,
    })),
  });
});

export default app;
