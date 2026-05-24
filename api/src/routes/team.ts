/**
 * Phase 1A team-CRM HTTP surface.
 *
 *   /me/team/overview                (auth) — funnel counts
 *   /me/team/referrals               (auth) — list of my referees
 *   /me/team/notes/:contactUserId    (auth) — POST note + next_contact_at
 *   /me/team/next-actions            (auth) — open actions for me
 *   /me/team/next-actions/:id/done   (auth) — mark done
 *   /internal/team/compute-next-actions (internal) — cron trigger
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import * as TeamRepo from '../repos/team.js';
import * as RefRepo from '../repos/referrals-ext.js';
import { computeNextActionsForOwner } from '../services/team-actions.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/team', requireAuth);
app.use('/me/team/*', requireAuth);

// GET /me/team/overview — funnel counts.
app.get('/me/team/overview', async (c) => {
  const session = c.get('user');
  const funnel = await RefRepo.funnelFor(session.id);
  return c.json({ ok: true, funnel });
});

// GET /me/team/referrals — list of my referees with stage + last_contact_at.
app.get('/me/team/referrals', async (c) => {
  const session = c.get('user');
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await RefRepo.listForReferrer(session.id, limit, offset);
  return c.json({ ok: true, rows });
});

const noteSchema = z.object({
  note: z.string().min(1).max(2000),
  next_contact_at: z.string().datetime().nullable().optional(),
});

// POST /me/team/notes/:contactUserId — save note (and optional reminder ts).
app.post('/me/team/notes/:contactUserId', async (c) => {
  const session = c.get('user');
  const contactUserId = Number(c.req.param('contactUserId'));
  if (!Number.isFinite(contactUserId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const saved = await TeamRepo.saveNote({
    ownerUserId: session.id,
    contactUserId,
    note: parsed.data.note,
    nextContactAt: parsed.data.next_contact_at ? new Date(parsed.data.next_contact_at) : null,
  });
  return c.json({ ok: true, note: saved });
});

// GET /me/team/notes/:contactUserId — list my notes for a single contact.
app.get('/me/team/notes/:contactUserId', async (c) => {
  const session = c.get('user');
  const contactUserId = Number(c.req.param('contactUserId'));
  if (!Number.isFinite(contactUserId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const rows = await TeamRepo.listNotesFor(session.id, contactUserId);
  return c.json({ ok: true, rows });
});

// GET /me/team/next-actions — the daily feed.
app.get('/me/team/next-actions', async (c) => {
  const session = c.get('user');
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 20) || 20));
  const rows = await TeamRepo.listOpenActions(session.id, limit);
  return c.json({ ok: true, rows });
});

// POST /me/team/next-actions/:id/done
app.post('/me/team/next-actions/:id/done', async (c) => {
  const session = c.get('user');
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const ok = await TeamRepo.markActionDone(session.id, id);
  return c.json({ ok });
});

// ------------------------------ internal ------------------------------

const internal = new Hono();
internal.use('/internal/team/*', requireInternalSecret);

// GET /internal/team/:userId/overview — funnel counts by user_id.
internal.get('/internal/team/:userId/overview', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const funnel = await RefRepo.funnelFor(userId);
  return c.json({ ok: true, funnel });
});

// GET /internal/team/:userId/next-actions — feed by user_id.
internal.get('/internal/team/:userId/next-actions', async (c) => {
  const userId = Number(c.req.param('userId'));
  if (!Number.isFinite(userId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 20) || 20));
  const rows = await TeamRepo.listOpenActions(userId, limit);
  return c.json({ ok: true, rows });
});

// POST /internal/team/:userId/next-actions/:id/done
internal.post('/internal/team/:userId/next-actions/:id/done', async (c) => {
  const userId = Number(c.req.param('userId'));
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(userId) || !Number.isFinite(id)) {
    return c.json({ ok: false, error: 'bad_id' }, 400);
  }
  const ok = await TeamRepo.markActionDone(userId, id);
  return c.json({ ok });
});

// POST /internal/team/:userId/notes/:contactUserId — bot-side note save.
const internalNoteSchema = z.object({
  note: z.string().min(1).max(2000),
  next_contact_at: z.string().datetime().nullable().optional(),
});
internal.post('/internal/team/:userId/notes/:contactUserId', async (c) => {
  const userId = Number(c.req.param('userId'));
  const contactUserId = Number(c.req.param('contactUserId'));
  if (!Number.isFinite(userId) || !Number.isFinite(contactUserId)) {
    return c.json({ ok: false, error: 'bad_id' }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalNoteSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const saved = await TeamRepo.saveNote({
    ownerUserId: userId,
    contactUserId,
    note: parsed.data.note,
    nextContactAt: parsed.data.next_contact_at ? new Date(parsed.data.next_contact_at) : null,
  });
  return c.json({ ok: true, note: saved });
});

// POST /internal/team/compute-next-actions — cron trigger; also callable
// manually for debugging.
internal.post('/internal/team/compute-next-actions', async (c) => {
  const referrers = await TeamRepo.listActiveReferrers();
  let queued = 0;
  for (const { referrer_id } of referrers) {
    queued += await computeNextActionsForOwner(referrer_id);
  }
  return c.json({ ok: true, referrers: referrers.length, actions_queued: queued });
});

// POST /internal/team/by-email/referrals — list L1 referrals for caller (by email)
internal.post('/internal/team/by-email/referrals', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const email = String(body?.email || '').toLowerCase().trim();
  if (!email) return c.json({ ok: false, error: 'no_email' }, 400);

  const { db } = await import('../db/client.js');
  const { sql: drSql } = await import('drizzle-orm');

  // Resolve email -> userId. Synthetic tg<id>@goldenConnect.bot OR real email via credentials.
  let userId: number | null = null;
  const m = email.match(/^tg(\d+)@goldenConnect\.bot$/);
  if (m) {
    const tgId = Number(m[1]);
    const r = (await db.execute(drSql`SELECT id FROM users WHERE tg_id = ${tgId} LIMIT 1`)) as any[];
    if (r[0]?.id) userId = Number(r[0].id);
  } else {
    const r = (await db.execute(drSql`SELECT user_id FROM credentials WHERE email = ${email} LIMIT 1`)) as any[];
    if (r[0]?.user_id) userId = Number(r[0].user_id);
  }

  if (!userId) return c.json({ ok: true, rows: [], userId: null });

  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 200) || 200));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await RefRepo.listForReferrer(userId, limit, offset);
  return c.json({ ok: true, userId, rows });
});

// POST /internal/team/by-email/overview — funnel for caller (by email)
internal.post('/internal/team/by-email/overview', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const email = String(body?.email || '').toLowerCase().trim();
  if (!email) return c.json({ ok: false, error: 'no_email' }, 400);

  const { db } = await import('../db/client.js');
  const { sql: drSql } = await import('drizzle-orm');

  let userId: number | null = null;
  const m = email.match(/^tg(\d+)@goldenConnect\.bot$/);
  if (m) {
    const tgId = Number(m[1]);
    const r = (await db.execute(drSql`SELECT id FROM users WHERE tg_id = ${tgId} LIMIT 1`)) as any[];
    if (r[0]?.id) userId = Number(r[0].id);
  } else {
    const r = (await db.execute(drSql`SELECT user_id FROM credentials WHERE email = ${email} LIMIT 1`)) as any[];
    if (r[0]?.user_id) userId = Number(r[0].user_id);
  }

  if (!userId) return c.json({ ok: true, funnel: { total: 0, joined: 0, onboarded: 0, engaged: 0, converted: 0, dormant: 0, lost: 0 }, userId: null });

  const funnel = await RefRepo.funnelFor(userId);
  return c.json({ ok: true, userId, funnel });
});

app.route('/', internal);




export default app;
