/**
 * Missions HTTP routes — enroll / mark-day / public template card.
 *
 * Tables:
 *   mission_templates (public library)
 *   user_missions     (per-user per-day rows)
 *
 * Enrollment is represented as a user_missions row with day=-1 (sentinel)
 * so `hasUserEnrolled` is a cheap WHERE on the existing unique index.
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  missionTemplates,
  userMissions,
  activityLog,
} from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { checkQuestProgress } from '../services/gamification.js';

const app = new Hono<{ Variables: AuthVars }>();

interface MissionStep {
  day: number;
  key: string;
  title: string;
  description?: string;
}

app.use('/me/missions', requireAuth);
app.use('/me/missions/*', requireAuth);
app.use('/internal/missions/*', requireInternalSecret);

// ---------------------------------------------------------------------------
// Internal bot-facing variants — take user_id in the URL rather than relying
// on a session cookie/JWT. Keep parity with /me/ endpoints.
// ---------------------------------------------------------------------------

async function fetchMissionsForUser(userId: number) {
  const tmpls = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.active, true));
  const rows = await db
    .select()
    .from(userMissions)
    .where(eq(userMissions.userId, userId))
    .orderBy(asc(userMissions.missionId), asc(userMissions.day));
  const byMission = new Map<string, Array<typeof rows[number]>>();
  for (const r of rows) {
    if (!byMission.has(r.missionId)) byMission.set(r.missionId, []);
    byMission.get(r.missionId)!.push(r);
  }
  return tmpls.map((t) => {
    const list = byMission.get(t.id) ?? [];
    const enrolled = list.some((r) => r.day === -1);
    const completedDays = list
      .filter((r) => r.day >= 0 && r.completedAt !== null)
      .map((r) => r.day);
    const steps = Array.isArray(t.steps) ? (t.steps as MissionStep[]) : [];
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      enrolled,
      total_days: steps.length,
      completed_days: completedDays,
      steps,
    };
  });
}

app.get('/internal/missions/user/:userId', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId) || userId <= 0) {
    return c.json({ ok: false, error: 'bad_user_id' }, 400);
  }
  const missions = await fetchMissionsForUser(userId);
  return c.json({ ok: true, missions });
});

const internalEnrolSchema = z.object({ user_id: z.number().int().positive(), mission_id: z.string() });

app.post('/internal/missions/enroll', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalEnrolSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const [tmpl] = await db
    .select()
    .from(missionTemplates)
    .where(and(eq(missionTemplates.id, parsed.data.mission_id), eq(missionTemplates.active, true)))
    .limit(1);
  if (!tmpl) return c.json({ ok: false, error: 'not_found' }, 404);
  try {
    await db.insert(userMissions).values({
      userId: parsed.data.user_id,
      missionId: parsed.data.mission_id,
      day: -1,
      stepKey: 'enroll',
      completedAt: new Date(),
    });
  } catch {
    /* idempotent */
  }
  return c.json({ ok: true });
});

const internalCompleteSchema = z.object({
  user_id: z.number().int().positive(),
  mission_id: z.string(),
  day: z.number().int().min(0).max(365),
});

app.post('/internal/missions/complete-day', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalCompleteSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const [tmpl] = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.id, parsed.data.mission_id))
    .limit(1);
  if (!tmpl) return c.json({ ok: false, error: 'not_found' }, 404);
  const steps = Array.isArray(tmpl.steps) ? (tmpl.steps as MissionStep[]) : [];
  const step = steps.find((s) => s.day === parsed.data.day);
  if (!step) return c.json({ ok: false, error: 'day_not_in_template' }, 400);
  try {
    await db.insert(userMissions).values({
      userId: parsed.data.user_id,
      missionId: parsed.data.mission_id,
      day: parsed.data.day,
      stepKey: step.key,
      completedAt: new Date(),
    });
  } catch {
    return c.json({ ok: true, already_done: true });
  }
  const done = await db
    .select({ day: userMissions.day })
    .from(userMissions)
    .where(
      and(
        eq(userMissions.userId, parsed.data.user_id),
        eq(userMissions.missionId, parsed.data.mission_id),
      ),
    );
  const completedDays = new Set(done.filter((r) => r.day >= 0).map((r) => r.day));
  const allDone = steps.every((s) => completedDays.has(s.day));
  if (allDone) {
    try {
      await checkQuestProgress(parsed.data.user_id, 'mission_completed', {
        context: { mission_id: parsed.data.mission_id },
      });
    } catch {
      /* noop */
    }
  }
  return c.json({ ok: true, all_done: allDone });
});

// ---------------------------------------------------------------------------
// GET /missions/:id — public template card (no auth, bot can show preview).
// ---------------------------------------------------------------------------

app.get('/missions/:id', async (c) => {
  const id = c.req.param('id');
  const [tmpl] = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.id, id))
    .limit(1);
  if (!tmpl) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({
    ok: true,
    mission: {
      id: tmpl.id,
      title: tmpl.title,
      description: tmpl.description,
      steps: tmpl.steps,
      active: tmpl.active,
    },
  });
});

// ---------------------------------------------------------------------------
// GET /me/missions — my enrollments with progress per template.
// ---------------------------------------------------------------------------

app.get('/me/missions', async (c) => {
  const session = c.get('user');

  // Pull active templates + all user_missions rows for this user.
  const tmpls = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.active, true));
  const rows = await db
    .select()
    .from(userMissions)
    .where(eq(userMissions.userId, session.id))
    .orderBy(asc(userMissions.missionId), asc(userMissions.day));

  const byMission = new Map<string, Array<typeof rows[number]>>();
  for (const r of rows) {
    if (!byMission.has(r.missionId)) byMission.set(r.missionId, []);
    byMission.get(r.missionId)!.push(r);
  }

  const missions = tmpls.map((t) => {
    const list = byMission.get(t.id) ?? [];
    const enrolled = list.some((r) => r.day === -1);
    const completedDays = list
      .filter((r) => r.day >= 0 && r.completedAt !== null)
      .map((r) => r.day);
    const steps = Array.isArray(t.steps) ? (t.steps as MissionStep[]) : [];
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      enrolled,
      total_days: steps.length,
      completed_days: completedDays,
      steps,
    };
  });
  return c.json({ ok: true, missions });
});

// ---------------------------------------------------------------------------
// POST /me/missions/:id/enroll — write the day=-1 sentinel row.
// ---------------------------------------------------------------------------

app.post('/me/missions/:id/enroll', async (c) => {
  const session = c.get('user');
  const id = c.req.param('id');
  const [tmpl] = await db
    .select()
    .from(missionTemplates)
    .where(and(eq(missionTemplates.id, id), eq(missionTemplates.active, true)))
    .limit(1);
  if (!tmpl) return c.json({ ok: false, error: 'not_found' }, 404);

  // Idempotent enrol: unique index (user,mission,day) prevents duplicates.
  try {
    await db.insert(userMissions).values({
      userId: session.id,
      missionId: id,
      day: -1,
      stepKey: 'enroll',
      completedAt: new Date(),
    });
  } catch {
    // already enrolled — silent success
  }

  try {
    await db.insert(activityLog).values({
      userId: session.id,
      eventType: 'missions.enrolled',
      payload: { mission_id: id },
    });
  } catch {
    /* noop */
  }

  return c.json({ ok: true, mission_id: id });
});

// ---------------------------------------------------------------------------
// POST /me/missions/:mission_id/days/:day/complete — mark one step done.
// ---------------------------------------------------------------------------

const completeSchema = z.object({ step_key: z.string().optional() });

app.post('/me/missions/:mission_id/days/:day/complete', async (c) => {
  const session = c.get('user');
  const missionId = c.req.param('mission_id');
  const dayNum = Number(c.req.param('day'));
  if (!Number.isFinite(dayNum) || dayNum < 0 || dayNum > 365) {
    return c.json({ ok: false, error: 'invalid_day' }, 400);
  }

  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    /* empty body ok */
  }
  const parsed = completeSchema.safeParse(body);
  const stepKey = parsed.success ? parsed.data.step_key ?? null : null;

  const [tmpl] = await db
    .select()
    .from(missionTemplates)
    .where(eq(missionTemplates.id, missionId))
    .limit(1);
  if (!tmpl) return c.json({ ok: false, error: 'not_found' }, 404);

  const steps = Array.isArray(tmpl.steps) ? (tmpl.steps as MissionStep[]) : [];
  const step = steps.find((s) => s.day === dayNum);
  if (!step) return c.json({ ok: false, error: 'day_not_in_template' }, 400);

  try {
    await db.insert(userMissions).values({
      userId: session.id,
      missionId,
      day: dayNum,
      stepKey: stepKey ?? step.key,
      completedAt: new Date(),
    });
  } catch {
    // Unique violation → already marked; return success (idempotent).
    return c.json({ ok: true, already_done: true });
  }

  try {
    await db.insert(activityLog).values({
      userId: session.id,
      eventType: 'missions.day_completed',
      payload: { mission_id: missionId, day: dayNum, step_key: step.key },
    });
  } catch {
    /* noop */
  }

  // If every day is now done → fire the mission_completed quest check.
  const done = await db
    .select({ day: userMissions.day })
    .from(userMissions)
    .where(
      and(
        eq(userMissions.userId, session.id),
        eq(userMissions.missionId, missionId),
      ),
    );
  const completedDays = new Set(done.filter((r) => r.day >= 0).map((r) => r.day));
  const allDone = steps.every((s) => completedDays.has(s.day));

  let questGrant: Awaited<ReturnType<typeof checkQuestProgress>> | null = null;
  if (allDone) {
    try {
      questGrant = await checkQuestProgress(session.id, 'mission_completed', {
        context: { mission_id: missionId },
      });
      await db.insert(activityLog).values({
        userId: session.id,
        eventType: 'missions.completed',
        payload: { mission_id: missionId },
      });
    } catch {
      /* noop */
    }
  }

  return c.json({
    ok: true,
    day: dayNum,
    all_done: allDone,
    quests_granted: questGrant?.grantedQuests ?? [],
  });
});

// Unused import guard — silence the unused-warning for desc/eq chains that
// we deliberately kept in the imports for future pagination hooks.
void desc;

export default app;
