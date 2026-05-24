import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import * as UsersRepo from '../repos/users.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

function intParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// --- GET finders ---

app.get('/internal/users/by-tg/:tgId', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  const user = await UsersRepo.findByTgId(tgId);
  return c.json({ ok: true, user });
});

app.get('/internal/users/by-id/:id', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const user = await UsersRepo.findById(id);
  return c.json({ ok: true, user });
});

app.get('/internal/users/by-username/:name', async (c) => {
  const name = c.req.param('name');
  if (!name) return c.json({ ok: false, error: 'bad_name' }, 400);
  const user = await UsersRepo.findByUsername(name);
  return c.json({ ok: true, user });
});

app.get('/internal/users/by-ref/:code', async (c) => {
  const code = c.req.param('code');
  if (!code) return c.json({ ok: false, error: 'bad_code' }, 400);
  const user = await UsersRepo.findByRefCode(code);
  return c.json({ ok: true, user });
});

// --- POST create ---

const createSchema = z.object({
  tg_id: z.number().int(),
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  language_code: z.string().nullable().optional(),
  invited_by_ref_code: z.string().nullable().optional(),
});

app.post('/internal/users', async (c) => {
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
  const user = await UsersRepo.createUser({
    tg_id: parsed.data.tg_id,
    username: parsed.data.username ?? null,
    first_name: parsed.data.first_name ?? null,
    last_name: parsed.data.last_name ?? null,
    language_code: parsed.data.language_code ?? null,
    invited_by_ref_code: parsed.data.invited_by_ref_code ?? null,
  });
  return c.json({ ok: true, user });
});

// --- PATCH/POST mutators ---

const touchSchema = z.object({
  username: z.string().nullable().optional(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  language_code: z.string().nullable().optional(),
});

app.patch('/internal/users/by-tg/:tgId/touch', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = touchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }
  await UsersRepo.touch(tgId, parsed.data);
  return c.json({ ok: true });
});

const langSchema = z.object({ lang: z.string().min(1).max(8) });

app.post('/internal/users/by-tg/:tgId/language', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = langSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await UsersRepo.setLanguage(tgId, parsed.data.lang);
  return c.json({ ok: true });
});

const blockedSchema = z.object({ blocked: z.boolean() });

app.post('/internal/users/by-tg/:tgId/blocked', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = blockedSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await UsersRepo.setBlocked(tgId, parsed.data.blocked);
  return c.json({ ok: true });
});

const appliedSchema = z.object({ username: z.string().min(1) });

app.post('/internal/users/applied-by-username', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = appliedSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const changed = await UsersRepo.markAppliedByUsername(parsed.data.username);
  return c.json({ ok: true, changed });
});

app.post('/internal/users/by-tg/:tgId/presented', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  const changed = await UsersRepo.markPresented(tgId);
  return c.json({ ok: true, changed });
});

const notifsSchema = z.object({ enabled: z.boolean() });

app.post('/internal/users/by-tg/:tgId/notifications', async (c) => {
  const tgId = intParam(c.req.param('tgId'));
  if (tgId === null) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = notifsSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await UsersRepo.setRefNotifications(tgId, parsed.data.enabled);
  return c.json({ ok: true });
});

// --- Aggregates (literal paths — must be registered BEFORE /:id/*) ---

app.get('/internal/users/total', async (c) => {
  const count = await UsersRepo.totalUsers();
  return c.json({ ok: true, count });
});

app.get('/internal/users/joined-since', async (c) => {
  const ms = Number(c.req.query('ms'));
  if (!Number.isFinite(ms)) return c.json({ ok: false, error: 'bad_ms' }, 400);
  const count = await UsersRepo.joinedSince(ms);
  return c.json({ ok: true, count });
});

app.get('/internal/users/blocked-count', async (c) => {
  const count = await UsersRepo.blockedCount();
  return c.json({ ok: true, count });
});

app.get('/internal/users/pending-count', async (c) => {
  const count = await UsersRepo.pendingReferralsCount();
  return c.json({ ok: true, count });
});

app.get('/internal/users/top-direct', async (c) => {
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 10) || 10));
  const rows = await UsersRepo.topByDirect(limit);
  return c.json({ ok: true, rows });
});

app.get('/internal/users/top-total', async (c) => {
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 10) || 10));
  const rows = await UsersRepo.topByTotalDescendants(limit);
  return c.json({ ok: true, rows });
});

app.get('/internal/users/list', async (c) => {
  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await UsersRepo.listPaginated(limit, offset);
  return c.json({ ok: true, rows });
});

app.get('/internal/users/broadcast-list', async (c) => {
  const rows = await UsersRepo.allForBroadcast();
  return c.json({ ok: true, rows });
});

app.get('/internal/users/export', async (c) => {
  const rows = await UsersRepo.allForExport();
  return c.json({ ok: true, rows });
});

app.get('/internal/users/dashboard', async (c) => {
  const stats = await UsersRepo.dashboard();
  return c.json({ ok: true, stats });
});

// --- Referral graph (uses :id param — must come AFTER literal paths) ---

app.get('/internal/users/:id/direct-count', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const count = await UsersRepo.directCount(id);
  return c.json({ ok: true, count });
});

app.get('/internal/users/:id/descendants-stats', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const stats = await UsersRepo.descendantStats(id);
  return c.json({ ok: true, total_descendants: stats.total_descendants, max_depth: stats.max_depth });
});

app.get('/internal/users/:id/ancestors', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const rows = await UsersRepo.listAncestors(id);
  return c.json({ ok: true, rows });
});

app.get('/internal/users/:id/children', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const rows = await UsersRepo.children(id, limit, offset);
  return c.json({ ok: true, rows });
});

app.get('/internal/users/:id/subtree-joined-since', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const since = Number(c.req.query('since_ms'));
  if (!Number.isFinite(since)) return c.json({ ok: false, error: 'bad_since_ms' }, 400);
  const count = await UsersRepo.subtreeJoinedSince(id, since);
  return c.json({ ok: true, count });
});

app.get('/internal/users/:id/subtree-breakdown', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const max = Math.max(1, Math.min(64, Number(c.req.query('max') ?? 10) || 10));
  const rows = await UsersRepo.subtreeLevelBreakdown(id, max);
  return c.json({ ok: true, rows });
});

// --- Pending referrals ---

const resolvePendingSchema = z.object({ ref_code: z.string().min(1) });

app.post('/internal/users/resolve-pending', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = resolvePendingSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const resolved = await UsersRepo.resolvePending(parsed.data.ref_code);
  return c.json({ ok: true, resolved });
});

const pendingSchema = z.object({
  tg_id: z.number().int(),
  ref_code: z.string().min(1),
});

app.post('/internal/users/pending', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = pendingSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await UsersRepo.recordPendingReferral(parsed.data.tg_id, parsed.data.ref_code);
  return c.json({ ok: true });
});

export default app;
