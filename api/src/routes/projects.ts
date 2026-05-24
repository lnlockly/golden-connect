/**
 * /api/partners — public-facing catalogue of partner projects + the
 * referral-walk algorithm built on top of `project_referrals` and
 * `project_referral_participations`.
 *
 * Endpoints:
 *
 *   Public (auth required, any user):
 *     GET    /api/partners
 *     GET    /api/partners/:id
 *     POST   /api/partners/:id/submit-link
 *     GET    /api/partners/:id/my-participation
 *     GET    /api/partners/:id/stats
 *     GET    /api/me/partner-participations
 *
 *   Admin only (auth + admin-tg-id allowlist):
 *     POST   /api/partners
 *     PATCH  /api/partners/:id
 *     DELETE /api/partners/:id     (soft delete: status='REJECTED')
 *
 *   Internal (x-goldenConnect-secret):
 *     POST   /internal/partners/admin-create
 *
 * Admin gate: there's no `users.is_admin` column in goldenConnect-api, so we
 * authorise the same way other admin routes (events.ts, monitor.ts) do
 * — by matching `ADMIN_REF_CODE` on the user OR by membership in
 * `env.adminTgIds` / `ADMIN_USER_IDS`. `ADMIN_USER_IDS` is honoured per
 * spec as a comma-separated user-id allowlist.
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { ADMIN_REF_CODE, getUserById } from '../services/users.js';
import { env } from '../services/env.js';
import { submitReferralLink } from '../services/project-referrals.js';

// ─── Admin authorisation helpers ────────────────────────────────

const ADMIN_USER_ID_SET: Set<number> = new Set(
  (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
);

const ADMIN_TG_ID_SET: Set<number> = new Set(
  (env.adminTgIds || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0),
);

/**
 * True when the session belongs to a Golden Connect admin. Three paths:
 *   1. user_id appears in ADMIN_USER_IDS env (cheap, no DB).
 *   2. user.ref_code === ADMIN_REF_CODE  (seeded root user).
 *   3. user.tg_id ∈ ADMIN_TG_IDS env     (Telegram allowlist).
 */
async function isAdminSession(userId: number): Promise<boolean> {
  if (ADMIN_USER_ID_SET.has(userId)) return true;
  const rec = await getUserById(userId);
  if (!rec) return false;
  if (rec.user.refCode === ADMIN_REF_CODE) return true;
  if (rec.user.tgId != null && ADMIN_TG_ID_SET.has(rec.user.tgId)) return true;
  return false;
}

// ─── App ────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AuthVars }>();

// All /api/partners + /api/me/partner-participations endpoints need a
// session. Internal ones get requireInternalSecret applied directly.
app.use('/api/partners', requireAuth);
app.use('/api/partners/*', requireAuth);
app.use('/api/me/partner-participations', requireAuth);

// ─── Helpers ────────────────────────────────────────────────────

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function parseBounds(c: any): { limit: number; offset: number } {
  const limitRaw = Number(c.req.query('limit') ?? 50);
  const offsetRaw = Number(c.req.query('offset') ?? 0);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
  return { limit, offset };
}

interface ProjectRow {
  id: number;
  author_user_id: number;
  title: string;
  description: string;
  business_sphere: string;
  status: string;
  stages: string[] | null;
  is_referral: boolean;
  website: string | null;
  ref_link_template: string | null;
  tags: string[] | null;
  images: string[] | null;
  budget: number | null;
  equity: number | null;
  created_at: Date;
  updated_at: Date;
  moderated_at: Date | null;
  moderation_reason: string | null;
  boosted_at: Date | null;
  category: string;
  risk_flag: boolean;
  sort_order: number;
  icon: string | null;
}

function shapeProject(p: ProjectRow) {
  return {
    id: p.id,
    author_user_id: p.author_user_id,
    title: p.title,
    description: p.description,
    business_sphere: p.business_sphere,
    status: p.status,
    stages: p.stages ?? [],
    is_referral: p.is_referral,
    website: p.website,
    ref_link_template: p.ref_link_template,
    tags: p.tags ?? [],
    images: p.images ?? [],
    budget: p.budget,
    equity: p.equity,
    created_at: p.created_at,
    updated_at: p.updated_at,
    moderated_at: p.moderated_at,
    moderation_reason: p.moderation_reason,
    boosted_at: p.boosted_at,
    category: p.category ?? 'services',
    risk_flag: p.risk_flag ?? false,
    sort_order: p.sort_order ?? 100,
    icon: p.icon,
  };
}

// ─── GET /api/partners — list ──────────────────────────────────

app.get('/api/partners', async (c) => {
  const { limit, offset } = parseBounds(c);
  const sphere = (c.req.query('sphere') || '').trim();

  const rows = (sphere
    ? await db.execute(sql`
        SELECT * FROM projects
        WHERE status = 'ACTIVE' AND business_sphere = ${sphere}
        ORDER BY boosted_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)
    : await db.execute(sql`
        SELECT * FROM projects
        WHERE status = 'ACTIVE'
        ORDER BY boosted_at DESC NULLS LAST, created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `)) as unknown as ProjectRow[];

  const totalRows = (sphere
    ? await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM projects
        WHERE status = 'ACTIVE' AND business_sphere = ${sphere}
      `)
    : await db.execute(sql`
        SELECT COUNT(*)::int AS c FROM projects WHERE status = 'ACTIVE'
      `)) as unknown as Array<{ c: number }>;

  return c.json({
    ok: true,
    items: rows.map(shapeProject),
    total: totalRows[0]?.c ?? 0,
    limit,
    offset,
  });
});

// ─── GET /api/partners/:id ─────────────────────────────────────

app.get('/api/partners/:id', async (c) => {
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);

  const rows = (await db.execute(sql`
    SELECT p.*, u.tg_username AS author_tg_username,
           u.first_name AS author_first_name
    FROM projects p
    LEFT JOIN users u ON u.id = p.author_user_id
    WHERE p.id = ${id}
    LIMIT 1
  `)) as unknown as Array<ProjectRow & {
    author_tg_username: string | null;
    author_first_name: string | null;
  }>;
  if (!rows[0]) return c.json({ ok: false, error: 'not_found' }, 404);

  const row = rows[0];
  return c.json({
    ok: true,
    project: shapeProject(row),
    author: {
      id: row.author_user_id,
      tg_username: row.author_tg_username,
      first_name: row.author_first_name,
    },
  });
});

// ─── POST /api/partners (admin) ────────────────────────────────

app.post('/api/partners', async (c) => {
  const session = c.get('user');
  if (!(await isAdminSession(session.id))) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const businessSphere = String(body.business_sphere || body.businessSphere || '').trim();
  if (!title || !description || !businessSphere) {
    return c.json({ ok: false, error: 'missing_required_fields' }, 400);
  }

  const authorUserId = Number(body.author_user_id || body.authorUserId || session.id);
  if (!Number.isFinite(authorUserId) || authorUserId <= 0) {
    return c.json({ ok: false, error: 'invalid_author' }, 400);
  }

  const category = ['services', 'mlm', 'startups'].includes(String(body.category)) ? String(body.category) : 'services';
  const inserted = (await db.execute(sql`
    INSERT INTO projects (
      author_user_id, title, description, business_sphere, status,
      stages, is_referral, website, ref_link_template, tags, images,
      budget, equity, category, risk_flag, sort_order, icon, moderated_at
    ) VALUES (
      ${authorUserId},
      ${title},
      ${description},
      ${businessSphere},
      ${String(body.status || 'ACTIVE')},
      ${Array.isArray(body.stages) ? (body.stages as string[]) : null},
      ${body.is_referral !== false},
      ${body.website ?? null},
      ${body.ref_link_template ?? body.refLinkTemplate ?? null},
      ${Array.isArray(body.tags) ? (body.tags as string[]) : null},
      ${Array.isArray(body.images) ? (body.images as string[]) : null},
      ${body.budget != null ? Number(body.budget) : null},
      ${body.equity != null ? Number(body.equity) : null},
      ${category},
      ${category === 'startups' ? true : (body.risk_flag === true)},
      ${body.sort_order != null ? Number(body.sort_order) : 100},
      ${body.icon ?? null},
      NOW()
    )
    RETURNING *
  `)) as unknown as ProjectRow[];
  return c.json({ ok: true, project: shapeProject(inserted[0]!) }, 201);
});

// ─── PATCH /api/partners/:id (admin) ───────────────────────────

app.patch('/api/partners/:id', async (c) => {
  const session = c.get('user');
  if (!(await isAdminSession(session.id))) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  // Build a dynamic UPDATE — only the fields actually present in the
  // body are touched. drizzle's sql.join lets us assemble assignments
  // without raw string concat.
  const sets: any[] = [];
  if (body.title !== undefined) sets.push(sql`title = ${String(body.title)}`);
  if (body.description !== undefined) sets.push(sql`description = ${String(body.description)}`);
  if (body.business_sphere !== undefined) sets.push(sql`business_sphere = ${String(body.business_sphere)}`);
  if (body.status !== undefined) sets.push(sql`status = ${String(body.status)}`);
  if (body.stages !== undefined) sets.push(sql`stages = ${Array.isArray(body.stages) ? body.stages : null}`);
  if (body.is_referral !== undefined) sets.push(sql`is_referral = ${Boolean(body.is_referral)}`);
  if (body.website !== undefined) sets.push(sql`website = ${body.website ?? null}`);
  if (body.ref_link_template !== undefined) sets.push(sql`ref_link_template = ${body.ref_link_template ?? null}`);
  if (body.tags !== undefined) sets.push(sql`tags = ${Array.isArray(body.tags) ? body.tags : null}`);
  if (body.images !== undefined) sets.push(sql`images = ${Array.isArray(body.images) ? body.images : null}`);
  if (body.budget !== undefined) sets.push(sql`budget = ${body.budget != null ? Number(body.budget) : null}`);
  if (body.equity !== undefined) sets.push(sql`equity = ${body.equity != null ? Number(body.equity) : null}`);
  if (body.moderation_reason !== undefined) sets.push(sql`moderation_reason = ${body.moderation_reason ?? null}`);
  if (body.boosted_at !== undefined) {
    sets.push(sql`boosted_at = ${body.boosted_at ? new Date(body.boosted_at) : null}`);
  }
  if (sets.length === 0) return c.json({ ok: false, error: 'no_fields' }, 400);
  sets.push(sql`updated_at = NOW()`);

  const rows = (await db.execute(sql`
    UPDATE projects SET ${sql.join(sets, sql`, `)}
    WHERE id = ${id}
    RETURNING *
  `)) as unknown as ProjectRow[];
  if (!rows[0]) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, project: shapeProject(rows[0]) });
});

// ─── DELETE /api/partners/:id (admin, soft delete) ─────────────

app.delete('/api/partners/:id', async (c) => {
  const session = c.get('user');
  if (!(await isAdminSession(session.id))) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);

  const rows = (await db.execute(sql`
    UPDATE projects
    SET status = 'REJECTED', updated_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `)) as unknown as Array<{ id: number }>;
  if (!rows[0]) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true });
});

// ─── POST /api/partners/:id/submit-link ────────────────────────

app.post('/api/partners/:id/submit-link', async (c) => {
  const session = c.get('user');
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const referralLink = String(body.referralLink || body.referral_link || '').trim();
  if (!referralLink) return c.json({ ok: false, error: 'missing_referral_link' }, 400);
  const projectUsername = body.projectUsername || body.project_username
    ? String(body.projectUsername || body.project_username).trim()
    : undefined;

  try {
    const out = await submitReferralLink(session.id, id, referralLink, projectUsername);
    return c.json(out);
  } catch (e: any) {
    const msg = String(e?.message || 'submit_failed');
    if (msg === 'project_not_found') return c.json({ ok: false, error: msg }, 404);
    if (msg === 'link_taken' || msg === 'already_submitted') {
      return c.json({ ok: false, error: msg }, 409);
    }
    console.error('[partners.submit-link]', e);
    return c.json({ ok: false, error: 'internal_error' }, 500);
  }
});

// ─── GET /api/partners/:id/my-participation ────────────────────

app.get('/api/partners/:id/my-participation', async (c) => {
  const session = c.get('user');
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);

  const partRows = (await db.execute(sql`
    SELECT *
    FROM project_referral_participations
    WHERE user_id = ${session.id} AND project_id = ${id}
    LIMIT 1
  `)) as unknown as any[];

  // L1 referrals = direct project referrals at level=1.
  const l1Rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM project_referrals
    WHERE project_id = ${id} AND referrer_user_id = ${session.id} AND level = 1
  `)) as unknown as Array<{ c: number }>;

  // Team size = ALL descendants across every level for this user in the project.
  const teamRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM project_referrals
    WHERE project_id = ${id} AND referrer_user_id = ${session.id}
  `)) as unknown as Array<{ c: number }>;

  return c.json({
    ok: true,
    participation: partRows[0] ?? null,
    l1_referrals_count: l1Rows[0]?.c ?? 0,
    total_team_size: teamRows[0]?.c ?? 0,
  });
});

// ─── GET /api/partners/:id/stats ───────────────────────────────

app.get('/api/partners/:id/stats', async (c) => {
  const session = c.get('user');
  const id = parsePositiveInt(c.req.param('id'));
  if (!id) return c.json({ ok: false, error: 'invalid_id' }, 400);

  // Per-level fan-out for THIS user inside the project (mirrors BN's
  // getProjectReferralStats — scope by referrer = current user).
  const rows = (await db.execute(sql`
    SELECT level, COUNT(*)::int AS count
    FROM project_referrals
    WHERE project_id = ${id} AND referrer_user_id = ${session.id}
    GROUP BY level
    ORDER BY level ASC
  `)) as unknown as Array<{ level: number; count: number }>;

  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  return c.json({ ok: true, totalReferrals: total, byLevel: rows });
});

// ─── GET /api/me/partner-participations ────────────────────────

app.get('/api/me/partner-participations', async (c) => {
  const session = c.get('user');
  const rows = (await db.execute(sql`
    SELECT
      pp.*,
      p.title AS project_title,
      p.description AS project_description,
      p.website AS project_website,
      p.images AS project_images,
      p.business_sphere AS project_business_sphere,
      p.status AS project_status
    FROM project_referral_participations pp
    JOIN projects p ON p.id = pp.project_id
    WHERE pp.user_id = ${session.id}
    ORDER BY pp.created_at DESC
  `)) as unknown as any[];
  return c.json({ ok: true, items: rows });
});

// ─── Internal: POST /internal/partners/admin-create ────────────

// requireInternalSecret guards the secret header. No session needed.
app.use('/internal/partners/*', requireInternalSecret);

app.post('/internal/partners/admin-create', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const businessSphere = String(body.business_sphere || body.businessSphere || '').trim();
  const authorUserId = Number(body.author_user_id || body.authorUserId || 0);
  if (!title || !description || !businessSphere || !authorUserId) {
    return c.json({ ok: false, error: 'missing_required_fields' }, 400);
  }
  const category = ['services', 'mlm', 'startups'].includes(String(body.category)) ? String(body.category) : 'services';
  const inserted = (await db.execute(sql`
    INSERT INTO projects (
      author_user_id, title, description, business_sphere, status,
      stages, is_referral, website, ref_link_template, tags, images,
      budget, equity, category, risk_flag, sort_order, icon, moderated_at
    ) VALUES (
      ${authorUserId},
      ${title},
      ${description},
      ${businessSphere},
      ${String(body.status || 'ACTIVE')},
      ${Array.isArray(body.stages) ? (body.stages as string[]) : null},
      ${body.is_referral !== false},
      ${body.website ?? null},
      ${body.ref_link_template ?? body.refLinkTemplate ?? null},
      ${Array.isArray(body.tags) ? (body.tags as string[]) : null},
      ${Array.isArray(body.images) ? (body.images as string[]) : null},
      ${body.budget != null ? Number(body.budget) : null},
      ${body.equity != null ? Number(body.equity) : null},
      ${category},
      ${category === 'startups' ? true : (body.risk_flag === true)},
      ${body.sort_order != null ? Number(body.sort_order) : 100},
      ${body.icon ?? null},
      NOW()
    )
    RETURNING *
  `)) as unknown as ProjectRow[];
  return c.json({ ok: true, project: shapeProject(inserted[0]!) }, 201);
});


// ─────────────────────────────────────────────────────────────
// [internal-mirrors-2026-05-16] internal endpoints for cabinet proxy.
// Cabinet has the user session; api gets the user identity via
// ?email= (synthetic tg<id>@goldenConnect.bot for TG-only users) or ?user_id=.
// Internal endpoints already protected by requireInternalSecret at line ~442.
// ─────────────────────────────────────────────────────────────

async function resolveUserFromQuery(c: any): Promise<{ id: number } | null> {
  const queryParams = c.req.query();
  let userId = Number(queryParams.user_id || 0);
  if (Number.isFinite(userId) && userId > 0) {
    const r = (await db.execute(sql`SELECT id FROM users WHERE id = ${userId}`)) as any[];
    if (r[0]?.id) return { id: Number(r[0].id) };
  }
  const email = String(queryParams.email || '').trim().toLowerCase();
  if (email) {
    const m = email.match(/^tg(\d+)@goldenConnect\.bot$/);
    if (m) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${Number(m[1])} LIMIT 1`)) as any[];
      if (r[0]?.id) return { id: Number(r[0].id) };
    }
  }
  return null;
}

async function resolveUserFromBody(c: any): Promise<{ id: number } | null> {
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  let userId = Number(body.user_id || 0);
  if (Number.isFinite(userId) && userId > 0) {
    const r = (await db.execute(sql`SELECT id FROM users WHERE id = ${userId}`)) as any[];
    if (r[0]?.id) return { id: Number(r[0].id) };
  }
  const email = String(body.email || '').trim().toLowerCase();
  if (email) {
    const m = email.match(/^tg(\d+)@goldenConnect\.bot$/);
    if (m) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${Number(m[1])} LIMIT 1`)) as any[];
      if (r[0]?.id) return { id: Number(r[0].id) };
    }
  }
  return null;
}

// GET /internal/partners/list — catalog
app.get('/internal/partners/list', async (c) => {
  const queryParams = c.req.query();
  const limit = Math.min(200, Math.max(1, Number(queryParams.limit) || 50));
  const offset = Math.max(0, Number(queryParams.offset) || 0);
  const sphere = queryParams.sphere ? String(queryParams.sphere) : null;
  const category = queryParams.category ? String(queryParams.category) : null;
  const filterSql = category
    ? sql`WHERE status = 'ACTIVE' AND category = ${category}`
    : (sphere
      ? sql`WHERE status = 'ACTIVE' AND business_sphere = ${sphere}`
      : sql`WHERE status = 'ACTIVE'`);
  const rows = (await db.execute(sql`
    SELECT p.*, u.tg_username, u.first_name FROM projects p
    LEFT JOIN users u ON u.id = p.author_user_id
    ${filterSql}
    ORDER BY p.sort_order ASC, p.created_at DESC LIMIT ${limit} OFFSET ${offset}
  `)) as any[];
  const items = rows.map((r: any) => ({
    id: r.id, title: r.title, description: r.description,
    business_sphere: r.business_sphere, status: r.status, stages: r.stages,
    website: r.website, ref_link_template: r.ref_link_template, tags: r.tags,
    images: r.images, budget: r.budget, equity: r.equity,
    category: r.category ?? 'services', risk_flag: r.risk_flag ?? false,
    sort_order: r.sort_order ?? 100, icon: r.icon,
    created_at: r.created_at, updated_at: r.updated_at,
    author: { id: r.author_user_id, tg_username: r.tg_username, first_name: r.first_name },
  }));
  return c.json({ ok: true, items, total: items.length });
});

// GET /internal/partners/catalog?email= — каталог сгруппированный по 3 категориям +
// флаг "сдал ли юзер ссылку" по каждому проекту.
app.get('/internal/partners/catalog', async (c) => {
  const u = await resolveUserFromQuery(c);
  const rows = (await db.execute(sql`
    SELECT p.*, u.tg_username, u.first_name FROM projects p
    LEFT JOIN users u ON u.id = p.author_user_id
    WHERE p.status = 'ACTIVE'
    ORDER BY p.sort_order ASC, p.created_at DESC
  `)) as any[];

  // submitted set for this user
  let submitted = new Set<number>();
  if (u) {
    const parts = (await db.execute(sql`
      SELECT project_id FROM project_referral_participations
      WHERE user_id = ${u.id} AND has_submitted_link = TRUE
    `)) as any[];
    submitted = new Set(parts.map((p: any) => Number(p.project_id)));
  }

  const cats: Record<string, any> = {
    services: { key: 'services', title: 'Рекламные Сервисы от Компаний-Партнёров', color: 'blue', risk: false, projects: [] },
    mlm:      { key: 'mlm',      title: 'МЛМ Компании', color: 'green', risk: false, projects: [] },
    startups: { key: 'startups', title: 'Стартапы', color: 'red', risk: true, projects: [] },
  };
  for (const r of rows) {
    const cat = (r.category && cats[r.category]) ? r.category : 'services';
    cats[cat].projects.push({
      id: r.id, title: r.title, description: r.description, icon: r.icon,
      website: r.website, ref_link_template: r.ref_link_template,
      risk_flag: r.risk_flag ?? false, tags: r.tags, images: r.images,
      submitted: submitted.has(Number(r.id)),
    });
  }
  return c.json({ ok: true, linked: !!u, categories: [cats.services, cats.mlm, cats.startups] });
});

// GET /internal/partners/get?id=N
app.get('/internal/partners/get', async (c) => {
  const id = Number(c.req.query().id || 0);
  if (!id) return c.json({ ok: false, reason: 'no_id' }, 400);
  const rows = (await db.execute(sql`
    SELECT p.*, u.tg_username, u.first_name FROM projects p
    LEFT JOIN users u ON u.id = p.author_user_id
    WHERE p.id = ${id}
  `)) as any[];
  if (!rows[0]) return c.json({ ok: false, reason: 'not_found' }, 404);
  const r = rows[0];
  const partner = {
    id: r.id, title: r.title, description: r.description,
    business_sphere: r.business_sphere, status: r.status, stages: r.stages,
    website: r.website, ref_link_template: r.ref_link_template, tags: r.tags,
    images: r.images, budget: r.budget, equity: r.equity,
    created_at: r.created_at, updated_at: r.updated_at,
    author: { id: r.author_user_id, tg_username: r.tg_username, first_name: r.first_name },
  };
  return c.json({ ok: true, partner });
});

// POST /internal/partners/submit-link  body: { email|user_id, project_id, referral_link, project_username? }
app.post('/internal/partners/submit-link', async (c) => {
  const user = await resolveUserFromBody(c);
  if (!user) return c.json({ ok: false, reason: 'user_not_found' }, 404);
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const projectId = Number(body.project_id || 0);
  const refLink = String(body.referral_link || '').trim();
  const projUsername = body.project_username ? String(body.project_username).trim() : null;
  if (!projectId || !refLink) return c.json({ ok: false, reason: 'missing_fields' }, 400);
  try {
    const { submitReferralLink } = await import('../services/project-referrals.js');
    const result = await submitReferralLink(user.id, projectId, refLink, projUsername || undefined);
    return c.json({ ok: true as const, participationId: result.participationId, inviterId: result.inviterId });
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg === 'link_taken') return c.json({ ok: false, reason: 'link_taken' }, 409);
    if (msg === 'already_submitted') return c.json({ ok: false, reason: 'already_submitted' }, 409);
    if (msg === 'project_not_found') return c.json({ ok: false, reason: 'project_not_found' }, 404);
    console.error('[submit-link]', e);
    return c.json({ ok: false, reason: msg || 'error' }, 500);
  }
});

// GET /internal/partners/my-participation?email=&project_id=
app.get('/internal/partners/my-participation', async (c) => {
  const user = await resolveUserFromQuery(c);
  const projectId = Number(c.req.query().project_id || 0);
  if (!user || !projectId) return c.json({ ok: true, participation: null });
  const rows = (await db.execute(sql`
    SELECT * FROM project_referral_participations WHERE user_id = ${user.id} AND project_id = ${projectId}
  `)) as any[];
  const participation = rows[0] || null;
  let l1 = 0, total = 0;
  if (participation) {
    const r1 = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM project_referrals WHERE referrer_user_id = ${user.id} AND project_id = ${projectId} AND level = 1
    `)) as any[];
    l1 = Number(r1[0]?.n || 0);
    const r2 = (await db.execute(sql`
      SELECT COUNT(*)::int AS n FROM project_referrals WHERE referrer_user_id = ${user.id} AND project_id = ${projectId}
    `)) as any[];
    total = Number(r2[0]?.n || 0);
  }
  return c.json({ ok: true, participation, l1_referrals_count: l1, total_team_size: total });
});

// GET /internal/partners/stats?project_id=&email=
app.get('/internal/partners/stats', async (c) => {
  const user = await resolveUserFromQuery(c);
  const projectId = Number(c.req.query().project_id || 0);
  if (!projectId) return c.json({ ok: true, byLevel: [] });
  const filterSql = user
    ? sql`WHERE project_id = ${projectId} AND referrer_user_id = ${user.id}`
    : sql`WHERE project_id = ${projectId}`;
  const rows = (await db.execute(sql`
    SELECT level, COUNT(*)::int AS count FROM project_referrals
    ${filterSql}
    GROUP BY level ORDER BY level
  `)) as any[];
  return c.json({ ok: true, byLevel: rows.map((r: any) => ({ level: Number(r.level), count: Number(r.count) })) });
});

// GET /internal/partners/my-list?email=
app.get('/internal/partners/my-list', async (c) => {
  const user = await resolveUserFromQuery(c);
  if (!user) return c.json({ ok: true, items: [] });
  const rows = (await db.execute(sql`
    SELECT prp.*, p.id AS pid, p.title, p.description, p.business_sphere, p.images
    FROM project_referral_participations prp
    JOIN projects p ON p.id = prp.project_id
    WHERE prp.user_id = ${user.id}
    ORDER BY prp.created_at DESC
  `)) as any[];
  const items = rows.map((r: any) => ({
    participation: {
      id: r.id, user_id: r.user_id, project_id: r.project_id,
      referral_link: r.referral_link, project_username: r.project_username,
      invited_by: r.invited_by, has_submitted_link: r.has_submitted_link,
      is_approved: r.is_approved, created_at: r.created_at,
    },
    partner: {
      id: r.pid, title: r.title, description: r.description,
      business_sphere: r.business_sphere, images: r.images,
    },
  }));
  return c.json({ ok: true, items });
});

// GET /internal/partners/pending-notifications?limit=50 — for bot worker
app.get('/internal/partners/pending-notifications', async (c) => {
  const limit = Math.min(200, Math.max(1, Number(c.req.query().limit) || 50));
  // Add delivered_at column if not exists (idempotent at first call)
  try {
    await db.execute(sql`ALTER TABLE project_notifications_log ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`);
  } catch (_) {}
  const rows = (await db.execute(sql`
    SELECT pnl.id, pnl.user_id, pnl.project_id, pnl.kind, pnl.payload, pnl.sent_at,
           u.tg_id, p.title AS project_title
    FROM project_notifications_log pnl
    LEFT JOIN users u ON u.id = pnl.user_id
    LEFT JOIN projects p ON p.id = pnl.project_id
    WHERE pnl.delivered_at IS NULL AND u.tg_id IS NOT NULL
    ORDER BY pnl.sent_at ASC LIMIT ${limit}
  `)) as any[];
  return c.json({ ok: true, notifications: rows });
});

// POST /internal/partners/mark-delivered  body: { ids: [n1, n2, ...] }
app.post('/internal/partners/mark-delivered', async (c) => {
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const ids = Array.isArray(body.ids) ? body.ids.map((x: any) => Number(x)).filter((n: number) => n > 0) : [];
  if (!ids.length) return c.json({ ok: true, updated: 0 });
  await db.execute(sql`UPDATE project_notifications_log SET delivered_at = NOW() WHERE id = ANY(${ids}::int[])`);
  return c.json({ ok: true, updated: ids.length });
});


export default app;
