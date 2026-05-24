/**
 * Phase 1A referral HTTP surface.
 *
 *   /me/referral/code         (auth) — mint/return user's ref code
 *   /me/referral/stats        (auth) — funnel + challenges + badges
 *   /internal/referrals/attach          (internal) — bot calls on /start ref_X
 *   /internal/referrals/transition      (internal) — stage advance trigger
 *   /referrals/leaderboard    (auth) — top 20 paid-referrers in window
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import * as RefRepo from '../repos/referrals-ext.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/referral', requireAuth);
app.use('/me/referral/*', requireAuth);
app.use('/referrals/leaderboard', requireAuth);

// POST /me/referral/code → mints code on first call, returns deep-link.
app.post('/me/referral/code', async (c) => {
  const session = c.get('user');
  const code = await RefRepo.ensureCode(session.id);
  const botUsername = c.req.header('x-bot-username') ?? null;
  const deepLink = botUsername ? `https://t.me/${botUsername}?start=ref_${code}` : null;
  return c.json({ ok: true, code, deep_link: deepLink });
});

// GET /me/referral/stats — roll-up: funnel + active/completed challenges + badges.
app.get('/me/referral/stats', async (c) => {
  const session = c.get('user');
  const [funnel, active, completed, badges] = await Promise.all([
    RefRepo.funnelFor(session.id),
    RefRepo.listActiveChallenges(session.id),
    RefRepo.listCompletedChallenges(session.id),
    RefRepo.listBadges(session.id),
  ]);
  return c.json({
    ok: true,
    funnel,
    challenges: { active, completed, catalog: RefRepo.CHALLENGE_CATALOG },
    badges,
  });
});

// GET /me/referrals — paginated list of my referees.
app.get('/me/referrals', requireAuth, async (c) => {
  const session = c.get('user');
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await RefRepo.listForReferrer(session.id, limit, offset);
  return c.json({ ok: true, rows });
});

// GET /referrals/leaderboard — paid-conversion champions in rolling window.
app.get('/referrals/leaderboard', async (c) => {
  const daysRaw = Number(c.req.query('days') ?? 30);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 20) || 20));
  const since = new Date(Date.now() - days * 86400000);
  const rows = await RefRepo.leaderboard(since, limit);
  return c.json({ ok: true, rows, window_days: days });
});

// ------------------------------ internal ------------------------------

const internal = new Hono();
internal.use('/internal/referrals/*', requireInternalSecret);

// GET /internal/referrals/:userId/stats — same shape as /me/referral/stats
// but keyed by user_id (for the bot which talks on behalf of a tg user).
internal.get('/internal/referrals/:userId/stats', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const [funnel, active, completed, badges] = await Promise.all([
    RefRepo.funnelFor(userId),
    RefRepo.listActiveChallenges(userId),
    RefRepo.listCompletedChallenges(userId),
    RefRepo.listBadges(userId),
  ]);
  return c.json({
    ok: true,
    funnel,
    challenges: { active, completed, catalog: RefRepo.CHALLENGE_CATALOG },
    badges,
  });
});

// GET /internal/referrals/:userId/list — paginated referees for the bot.
internal.get('/internal/referrals/:userId/list', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await RefRepo.listForReferrer(userId, limit, offset);
  return c.json({ ok: true, rows });
});

// POST /internal/referrals/:userId/code — mint/return a code for the user.
internal.post('/internal/referrals/:userId/code', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const code = await RefRepo.ensureCode(userId);
  return c.json({ ok: true, code });
});

// GET /internal/referrals/leaderboard — unauthed internal mirror.
internal.get('/internal/referrals/leaderboard', async (c) => {
  const daysRaw = Number(c.req.query('days') ?? 30);
  const days = Math.max(1, Math.min(365, Number.isFinite(daysRaw) ? daysRaw : 30));
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 20) || 20));
  const since = new Date(Date.now() - days * 86400000);
  const rows = await RefRepo.leaderboard(since, limit);
  return c.json({ ok: true, rows, window_days: days });
});

// POST /internal/referrals/:userId/challenge/start — start a challenge for user.
internal.post('/internal/referrals/:userId/challenge/start', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!body || typeof body.template_id !== 'string') {
    return c.json({ ok: false, error: 'bad_template' }, 400);
  }
  const result = await RefRepo.startChallenge(userId, body.template_id);
  return c.json({ ok: result.started, challenge: result.challenge ?? null });
});

const attachSchema = z.object({
  referrer_id: z.number().int(),
  invitee_id: z.number().int(),
  source: z.string().max(40).nullable().optional(),
});

// POST /internal/referrals/attach — bot calls when a /start ref_<code>
// lands a new user. Idempotent.
internal.post('/internal/referrals/attach', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const result = await RefRepo.attach({
    referrerId: parsed.data.referrer_id,
    inviteeId: parsed.data.invitee_id,
    source: parsed.data.source ?? null,
  });
  if (!result) return c.json({ ok: false, error: 'self_referral' }, 400);
  return c.json({ ok: true, ...result });
});

const transitionSchema = z.object({
  invitee_id: z.number().int(),
  stage: z.enum(['invited', 'joined', 'active', 'booked', 'paid', 'dormant', 'lost']),
});

// POST /internal/referrals/transition — other subsystems (booking, payment
// webhook, cron) flip a referral forward. Returns the change summary so
// the caller can fan-out notifications.
internal.post('/internal/referrals/transition', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = transitionSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }
  const result = await RefRepo.transition(parsed.data.invitee_id, parsed.data.stage);
  if (!result) return c.json({ ok: false, error: 'not_found' }, 404);

  // On a paid transition we also bump challenges and milestone badges.
  // Doing this here (not in a cron) so the notification fan-out in the
  // caller's bot has the fresh badge/challenge state immediately.
  let newBadges: string[] = [];
  let challenges: Array<{ challengeId: string; badgeId: string; completed: boolean }> = [];
  if (result.changed && result.newStage === 'paid') {
    newBadges = await RefRepo.grantMilestoneBadgesForPaid(result.referrerId);
    challenges = await RefRepo.bumpChallengesOnPaid(result.referrerId);
  }

  return c.json({
    ok: true,
    ...result,
    new_badges: newBadges,
    challenges_advanced: challenges,
  });
});

app.route('/', internal);

export default app;
