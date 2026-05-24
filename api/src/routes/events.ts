/**
 * Events feature surface (Phase 1B).
 *
 * Three audiences share this file:
 *   • Public     — `/events` (list) and `/events/:id` (card).
 *   • Signed-in  — `/me/events/*` (register, unregister, upcoming-for-me).
 *   • Admin      — `/admin/events/*` (CRUD + registrations list), gated
 *                  via ADMIN_TG_IDS env or ADMIN_REF_CODE session user.
 *
 * Admin check strategy:
 *   We already have the auth middleware (cookie or bearer JWT → user id).
 *   For admin mutations we additionally require the authed user's tg_id
 *   or ref_code to match the allowlist. See `isAdminSession()` below.
 *
 * Event status lifecycle:
 *   draft → published → live → finished | cancelled
 *   Only `published` (and `live`) rows appear on the public list.
 */
import { Hono } from 'hono';
import { and, asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import {
  dripState,
  eventRegistrations,
  events,
  users,
} from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { env } from '../services/env.js';
import { ADMIN_REF_CODE, getUserById } from '../services/users.js';

const app = new Hono<{ Variables: AuthVars }>();

// --- Helpers --------------------------------------------------------------

function parseAdminTgIds(): Set<number> {
  const src = env.adminTgIds || '1361064246,424077439,248745860';
  return new Set(
    src
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
}

const ADMIN_TG_ID_SET = parseAdminTgIds();

async function isAdminSession(userId: number): Promise<boolean> {
  const rec = await getUserById(userId);
  if (!rec) return false;
  if (rec.user.refCode === ADMIN_REF_CODE) return true;
  if (rec.user.tgId != null && ADMIN_TG_ID_SET.has(rec.user.tgId)) return true;
  return false;
}

function shapeEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    topic: row.topic,
    description: row.description,
    speakers: row.speakers,
    tags: row.tags,
    starts_at: row.startsAt,
    duration_min: row.durationMin,
    join_url: row.joinUrl,
    recording_url: row.recordingUrl,
    status: row.status,
    created_by_user_id: row.createdByUserId,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function eventIdFromParam(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

// --- Public list / card ---------------------------------------------------

app.get('/events', async (c) => {
  const limitRaw = Number(c.req.query('limit') ?? 20);
  const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        gt(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
  return c.json({ ok: true, events: rows.map(shapeEvent) });
});

app.get('/events/:id', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const row = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  // Never leak drafts to anonymous viewers — they'd show up via scraping.
  if (row.status === 'draft') {
    return c.json({ ok: false, error: 'not_found' }, 404);
  }
  return c.json({ ok: true, event: shapeEvent(row) });
});

// --- Me: register / unregister / upcoming ---------------------------------

app.use('/me/events/*', requireAuth);

app.post('/me/events/:id/register', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const session = c.get('user');
  const ev = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!ev) return c.json({ ok: false, error: 'not_found' }, 404);
  if (ev.status !== 'published' && ev.status !== 'live') {
    return c.json({ ok: false, error: 'not_open' }, 409);
  }

  // ON CONFLICT DO NOTHING via Drizzle — upsert keeps first registered_at.
  await db
    .insert(eventRegistrations)
    .values({
      eventId: id,
      userId: session.id,
      source: 'web',
    })
    .onConflictDoNothing({
      target: [eventRegistrations.eventId, eventRegistrations.userId],
    });

  return c.json({ ok: true, event: shapeEvent(ev) });
});

app.post('/me/events/:id/unregister', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const session = c.get('user');
  await db
    .delete(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, id),
        eq(eventRegistrations.userId, session.id),
      ),
    );
  return c.json({ ok: true });
});

app.get('/me/events/upcoming', async (c) => {
  const session = c.get('user');
  // Everything I'm registered for (future) + the next N upcoming public
  // events I'm NOT yet registered for (so the UI can merge). Kept as two
  // arrays so the client renders them in distinct sections if it wants.
  const mine = await db
    .select()
    .from(events)
    .innerJoin(
      eventRegistrations,
      eq(eventRegistrations.eventId, events.id),
    )
    .where(
      and(
        eq(eventRegistrations.userId, session.id),
        gt(events.startsAt, new Date()),
        inArray(events.status, ['published', 'live']),
      ),
    )
    .orderBy(asc(events.startsAt));

  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        gt(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(10);

  const mineIds = new Set(mine.map((r) => r.events.id));
  return c.json({
    ok: true,
    registered: mine.map((r) => shapeEvent(r.events)),
    upcoming: upcoming.filter((e) => !mineIds.has(e.id)).map(shapeEvent),
  });
});

// --- Admin: CRUD + registrations list -------------------------------------

app.use('/admin/events/*', requireAuth);
app.use('/admin/events', requireAuth);

// Helper returning forbidden if the current session isn't admin-enabled.
// Callers must `if (deny) return deny;` immediately.
async function guardAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Response | null> {
  const session = c.get('user') as { id: number };
  const ok = await isAdminSession(session.id);
  if (!ok) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  return null;
}

const speakersSchema = z
  .array(z.string().min(1).max(200))
  .max(20);

const createSchema = z.object({
  title: z.string().min(1).max(240),
  topic: z.string().max(240).nullish(),
  description: z.string().max(4000).nullish(),
  speakers: speakersSchema.optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  starts_at: z.string().datetime(),
  duration_min: z.number().int().positive().max(24 * 60).optional(),
  join_url: z.string().url().nullish(),
  recording_url: z.string().url().nullish(),
  status: z.enum(['draft', 'published', 'live', 'finished', 'cancelled']).optional(),
});

app.post('/admin/events', async (c) => {
  const deny = await guardAdmin(c);
  if (deny) return deny;
  const session = c.get('user');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  const [row] = await db
    .insert(events)
    .values({
      title: parsed.data.title,
      topic: parsed.data.topic ?? null,
      description: parsed.data.description ?? null,
      speakers: parsed.data.speakers ?? [],
      tags: parsed.data.tags ?? [],
      startsAt: new Date(parsed.data.starts_at),
      durationMin: parsed.data.duration_min ?? 60,
      joinUrl: parsed.data.join_url ?? null,
      recordingUrl: parsed.data.recording_url ?? null,
      status: parsed.data.status ?? 'draft',
      createdByUserId: session.id,
    })
    .returning();

  if (!row) return c.json({ ok: false, error: 'insert_failed' }, 500);
  return c.json({ ok: true, event: shapeEvent(row) });
});

const patchSchema = createSchema.partial();

app.patch('/admin/events/:id', async (c) => {
  const deny = await guardAdmin(c);
  if (deny) return deny;
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.topic !== undefined) patch.topic = parsed.data.topic;
  if (parsed.data.description !== undefined) patch.description = parsed.data.description;
  if (parsed.data.speakers !== undefined) patch.speakers = parsed.data.speakers;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags;
  if (parsed.data.starts_at !== undefined) patch.startsAt = new Date(parsed.data.starts_at);
  if (parsed.data.duration_min !== undefined) patch.durationMin = parsed.data.duration_min;
  if (parsed.data.join_url !== undefined) patch.joinUrl = parsed.data.join_url;
  if (parsed.data.recording_url !== undefined) patch.recordingUrl = parsed.data.recording_url;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

  const [row] = await db
    .update(events)
    .set(patch)
    .where(eq(events.id, id))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, event: shapeEvent(row) });
});

const publishSchema = z.object({
  status: z.enum(['draft', 'published', 'live', 'finished', 'cancelled']),
});

app.post('/admin/events/:id/publish', async (c) => {
  const deny = await guardAdmin(c);
  if (deny) return deny;
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = { status: 'published' };
  }
  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const [row] = await db
    .update(events)
    .set({ status: parsed.data.status, updatedAt: new Date() })
    .where(eq(events.id, id))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, event: shapeEvent(row) });
});

app.get('/admin/events/:id/registrations', async (c) => {
  const deny = await guardAdmin(c);
  if (deny) return deny;
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);

  const rows = await db
    .select({
      id: eventRegistrations.id,
      userId: eventRegistrations.userId,
      source: eventRegistrations.source,
      registeredAt: eventRegistrations.registeredAt,
      tgId: users.tgId,
      tgUsername: users.tgUsername,
      firstName: users.firstName,
    })
    .from(eventRegistrations)
    .innerJoin(users, eq(users.id, eventRegistrations.userId))
    .where(eq(eventRegistrations.eventId, id))
    .orderBy(desc(eventRegistrations.registeredAt));

  return c.json({
    ok: true,
    registrations: rows.map((r) => ({
      id: r.id,
      user_id: r.userId,
      source: r.source,
      registered_at: r.registeredAt,
      tg_id: r.tgId,
      tg_username: r.tgUsername,
      first_name: r.firstName,
    })),
  });
});

// --- Internal (bot-side) wrappers -----------------------------------------
// The bot is stateless and can't hold a user session cookie — it calls
// /internal/* with the shared x-goldenConnect-secret. These endpoints mirror the
// public ones but key on user_id from the path.

const internal = new Hono();
internal.use('/internal/events/*', requireInternalSecret);
internal.use('/internal/me/*', requireInternalSecret);

internal.get('/internal/events/upcoming', async (c) => {
  const limit = Math.max(1, Math.min(50, Number(c.req.query('limit') ?? 10) || 10));
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        gt(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
  return c.json({ ok: true, events: rows.map(shapeEvent) });
});

internal.get('/internal/events/:id', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const row = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, event: shapeEvent(row) });
});

const botRegisterSchema = z.object({
  user_id: z.number().int().positive(),
  source: z.enum(['tg', 'web', 'deep-link']).optional(),
});

internal.post('/internal/events/:id/register', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = botRegisterSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const ev = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!ev) return c.json({ ok: false, error: 'not_found' }, 404);
  if (ev.status !== 'published' && ev.status !== 'live') {
    return c.json({ ok: false, error: 'not_open' }, 409);
  }

  await db
    .insert(eventRegistrations)
    .values({
      eventId: id,
      userId: parsed.data.user_id,
      source: parsed.data.source ?? 'tg',
    })
    .onConflictDoNothing({
      target: [eventRegistrations.eventId, eventRegistrations.userId],
    });

  return c.json({ ok: true, event: shapeEvent(ev) });
});

internal.post('/internal/events/:id/unregister', async (c) => {
  const id = eventIdFromParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = z.object({ user_id: z.number().int().positive() }).safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  await db
    .delete(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, id),
        eq(eventRegistrations.userId, parsed.data.user_id),
      ),
    );
  return c.json({ ok: true });
});

internal.get('/internal/me/:userId/events/upcoming', async (c) => {
  const uid = eventIdFromParam(c.req.param('userId'));
  if (uid === null) return c.json({ ok: false, error: 'bad_user_id' }, 400);

  const mine = await db
    .select()
    .from(events)
    .innerJoin(
      eventRegistrations,
      eq(eventRegistrations.eventId, events.id),
    )
    .where(
      and(
        eq(eventRegistrations.userId, uid),
        gt(events.startsAt, new Date()),
        inArray(events.status, ['published', 'live']),
      ),
    )
    .orderBy(asc(events.startsAt));

  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        gt(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(10);

  const mineIds = new Set(mine.map((r) => r.events.id));
  return c.json({
    ok: true,
    registered: mine.map((r) => shapeEvent(r.events)),
    upcoming: upcoming.filter((e) => !mineIds.has(e.id)).map(shapeEvent),
  });
});

// Admin-create shortcut used by the bot wizard. The bot already
// validates that the caller is in ADMIN_TG_IDS before calling this, and
// the shared `x-goldenConnect-secret` header proves the request came from our
// bot pod. Intentionally NOT exposed without the secret, so there's no
// direct-from-web abuse vector.
const botAdminCreateSchema = z.object({
  title: z.string().min(1).max(240),
  topic: z.string().max(240).nullish(),
  description: z.string().max(4000).nullish(),
  speakers: z.array(z.string().min(1).max(200)).max(20).optional(),
  tags: z.array(z.string().min(1).max(64)).max(20).optional(),
  starts_at: z.string().datetime(),
  duration_min: z.number().int().positive().max(24 * 60).optional(),
  join_url: z.string().url().nullish(),
  status: z.enum(['draft', 'published']).optional(),
  created_by_user_id: z.number().int().positive().optional(),
});

internal.post('/internal/events/admin-create', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = botAdminCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const [row] = await db
    .insert(events)
    .values({
      title: parsed.data.title,
      topic: parsed.data.topic ?? null,
      description: parsed.data.description ?? null,
      speakers: parsed.data.speakers ?? [],
      tags: parsed.data.tags ?? [],
      startsAt: new Date(parsed.data.starts_at),
      durationMin: parsed.data.duration_min ?? 60,
      joinUrl: parsed.data.join_url ?? null,
      status: parsed.data.status ?? 'draft',
      createdByUserId: parsed.data.created_by_user_id ?? null,
    })
    .returning();
  if (!row) return c.json({ ok: false, error: 'insert_failed' }, 500);
  return c.json({ ok: true, event: shapeEvent(row) });
});

// Init welcome drip — called by the internal users create endpoint after
// the bot creates a fresh user. Idempotent: returns ok even if already
// inited (thanks to ON CONFLICT DO NOTHING on primary key).
const initDripSchema = z.object({ user_id: z.number().int().positive() });

internal.post('/internal/drip/init', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = initDripSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  await db
    .insert(dripState)
    .values({
      userId: parsed.data.user_id,
      startedAt: new Date(),
      lastStepSent: -1,
    })
    .onConflictDoNothing({ target: dripState.userId });

  return c.json({ ok: true });
});

// Mount the internal sub-app at root — Hono supports nesting apps.
app.route('/', internal);

// Re-export for types we don't need — nothing to export.
void sql;

export default app;
