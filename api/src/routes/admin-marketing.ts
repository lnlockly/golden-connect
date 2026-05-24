// Admin endpoints for marketing engine activation.
// Auth: tg_id must be in ADMIN_TG_IDS env var (comma-separated).
import { Hono } from 'hono';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookings, tariffs, users } from '../db/schema.js';
import { processEntry, processMatrixAndPool } from '../services/entry-processor.js';
import { setSetting, isMarketingActive } from '../services/system-settings.js';

const app = new Hono();

const ADMIN_TG_IDS = (process.env.ADMIN_TG_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAdminTgId(tgId: string | number | null | undefined): boolean {
  if (!tgId) return false;
  return ADMIN_TG_IDS.includes(String(tgId));
}

async function requireAdmin(c: { req: { header: (n: string) => string | undefined } }): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  // Simple bearer-token style: header X-Admin-Tg-Id must be in ADMIN_TG_IDS
  // (called from cabinet which already authenticated the web user and verified tg_id match).
  const tgIdHeader = c.req.header('x-admin-tg-id');
  const secretHeader = c.req.header('x-admin-secret');
  // Allow either an admin TG id from env OR a shared admin secret.
  if (tgIdHeader && isAdminTgId(tgIdHeader)) return { ok: true };
  if (secretHeader && process.env.ADMIN_SECRET && secretHeader === process.env.ADMIN_SECRET) return { ok: true };
  return { ok: false, status: 401, reason: 'admin_required' };
}

// GET /admin/marketing/status — returns current flag + pending count
app.get('/marketing/status', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);
  const active = await isMarketingActive();
  const pending = await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS n FROM bookings WHERE status='paid' AND marketing_processed = false`),
  );
  const total = await db.execute(sql.raw(`SELECT COUNT(*)::int AS n FROM bookings`));
  return c.json({
    ok: true,
    marketing_active: active,
    pending_bookings: Number((pending[0] as { n: number }).n),
    total_bookings: Number((total[0] as { n: number }).n),
  });
});

// POST /admin/marketing/activate — flips flag + processes pending bookings chronologically.
// Body: { dryRun?: boolean }
app.post('/marketing/activate', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);

  let body: { dryRun?: boolean } = {};
  try { body = await c.req.json(); } catch { /* empty body OK */ }
  const dryRun = body.dryRun === true;

  // Find paid bookings not yet processed, in chronological order
  const paidBookings = await db
    .select({
      id: bookings.id,
      userId: bookings.userId,
      tariffCode: bookings.tariffCode,
      paidAt: bookings.paidAt,
      invoiceId: bookings.invoiceId,
    })
    .from(bookings)
    .where(and(eq(bookings.status, 'paid'), eq(bookings.marketingProcessed, false)))
    .orderBy(asc(bookings.paidAt));

  // Get tariff_id mapping
  const tariffRows = await db.select({ id: tariffs.id, code: tariffs.code }).from(tariffs);
  const tariffByCode = new Map(tariffRows.map((t) => [t.code, t.id]));

  const processed: Array<{ bookingId: number; userId: number; tariffCode: string; matrixPosition: number | null }> = [];
  const failed: Array<{ bookingId: number; reason: string }> = [];

  if (!dryRun) {
    for (const b of paidBookings) {
      const tariffId = tariffByCode.get(b.tariffCode);
      if (!tariffId) { failed.push({ bookingId: b.id, reason: `tariff ${b.tariffCode} not found` }); continue; }
      try {
        // Linear was already paid on payment via processLinearOnly().
        // Here we only complete the matrix placement + task pool accrual.
        const result = await processMatrixAndPool({
          userId: b.userId,
          tariffId,
          paymentRefId: `booking:${b.id}`,
        });
        await db
          .update(bookings)
          .set({ marketingProcessed: true })
          .where(eq(bookings.id, b.id));
        processed.push({ bookingId: b.id, userId: b.userId, tariffCode: b.tariffCode, matrixPosition: result.matrixPosition ?? null });
      } catch (e) {
        failed.push({ bookingId: b.id, reason: (e as Error).message });
      }
    }
    await setSetting('marketing_active', 'true');
  }

  return c.json({
    ok: true,
    dryRun,
    candidates: paidBookings.length,
    processed: processed.length,
    failed: failed.length,
    details: { processed, failed },
  });
});

// POST /admin/marketing/deactivate — set flag back to false (emergency)
app.post('/marketing/deactivate', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);
  await setSetting('marketing_active', 'false');
  return c.json({ ok: true, marketing_active: false });
});



// GET /admin/network/tree?root_user_id=N&depth=3
// Returns the sponsor sub-tree rooted at the given user id. Used pre-launch
// to audit the chain "who is under whom" before flipping marketing on.
app.get('/network/tree', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);
  const rootRaw = c.req.query('root_user_id');
  const depthRaw = c.req.query('depth');
  const rootId = rootRaw ? Number(rootRaw) : null;
  const depth = Math.min(Math.max(Number(depthRaw || 5), 1), 10);
  if (!rootId || !Number.isFinite(rootId)) {
    return c.json({ ok: false, reason: 'root_user_id_required' }, 400 as const);
  }

  // BFS through invited_by_user_id pointers down to depth N.
  type Node = { id: number; firstName: string | null; refCode: string; tgUsername: string | null; bookings: number; tariffs: string[]; children: Node[] };
  const nodes = new Map<number, Node>();

  const root = await db.execute(sql.raw(`
    SELECT u.id, u.first_name AS "firstName", u.ref_code AS "refCode", u.tg_username AS "tgUsername"
    FROM users u WHERE u.id = ${rootId}
  `)) as Array<{ id: number; firstName: string | null; refCode: string; tgUsername: string | null }>;
  if (!root[0]) return c.json({ ok: false, reason: 'user_not_found' }, 404 as const);

  function makeNode(r: { id: number; firstName: string | null; refCode: string; tgUsername: string | null }): Node {
    return { id: r.id, firstName: r.firstName, refCode: r.refCode, tgUsername: r.tgUsername, bookings: 0, tariffs: [], children: [] };
  }
  nodes.set(root[0].id, makeNode(root[0]));

  let frontier = [root[0].id];
  for (let level = 0; level < depth; level++) {
    if (!frontier.length) break;
    const ids = frontier.join(',');
    const children = await db.execute(sql.raw(`
      SELECT u.id, u.first_name AS "firstName", u.ref_code AS "refCode", u.tg_username AS "tgUsername", u.invited_by_user_id AS "invitedBy"
      FROM users u
      WHERE u.invited_by_user_id IN (${ids})
      ORDER BY u.id
    `)) as Array<{ id: number; firstName: string | null; refCode: string; tgUsername: string | null; invitedBy: number }>;
    const next: number[] = [];
    for (const ch of children) {
      const n = makeNode(ch);
      nodes.set(ch.id, n);
      const parent = nodes.get(ch.invitedBy);
      if (parent) parent.children.push(n);
      next.push(ch.id);
    }
    frontier = next;
  }

  // Annotate each node with their booking summary
  const idsAll = Array.from(nodes.keys()).join(',');
  if (idsAll) {
    const bks = await db.execute(sql.raw(`
      SELECT user_id AS "userId", COUNT(*) AS cnt, ARRAY_AGG(tariff_code) AS tariffs
      FROM bookings WHERE user_id IN (${idsAll}) AND status = 'paid'
      GROUP BY user_id
    `)) as Array<{ userId: number; cnt: number; tariffs: string[] }>;
    for (const b of bks) {
      const n = nodes.get(b.userId);
      if (n) { n.bookings = Number(b.cnt); n.tariffs = b.tariffs || []; }
    }
  }

  return c.json({ ok: true, root_user_id: rootId, depth, tree: nodes.get(rootId) });
});

// GET /admin/network/upline?user_id=N — chain UP to the very top
app.get('/network/upline', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);
  const userId = Number(c.req.query('user_id') || 0);
  if (!userId) return c.json({ ok: false, reason: 'user_id_required' }, 400 as const);
  const chain: Array<{ id: number; firstName: string | null; refCode: string; tgUsername: string | null }> = [];
  let current = userId;
  for (let i = 0; i < 20; i++) {
    const rows = await db.execute(sql.raw(`
      SELECT u.id, u.first_name AS "firstName", u.ref_code AS "refCode", u.tg_username AS "tgUsername", u.invited_by_user_id AS "invitedBy"
      FROM users u WHERE u.id = ${current}
    `)) as Array<{ id: number; firstName: string | null; refCode: string; tgUsername: string | null; invitedBy: number | null }>;
    if (!rows[0]) break;
    chain.push({ id: rows[0].id, firstName: rows[0].firstName, refCode: rows[0].refCode, tgUsername: rows[0].tgUsername });
    if (!rows[0].invitedBy) break;
    current = rows[0].invitedBy;
  }
  return c.json({ ok: true, user_id: userId, upline: chain });
});

// GET /admin/network/pending-bookings — paid but not-yet-processed bookings,
// chronologically. This is exactly what /admin/marketing/activate will run
// through. Useful for sanity-checking before flipping the flag.
app.get('/network/pending-bookings', async (c) => {
  const auth = await requireAdmin(c);
  if (!auth.ok) return c.json({ ok: false, reason: auth.reason }, 401 as const);
  const rows = await db.execute(sql.raw(`
    SELECT b.id, b.user_id AS "userId", b.tariff_code AS "tariffCode", b.amount_usd AS "amountUsd",
           b.method, b.paid_at AS "paidAt", b.created_at AS "createdAt",
           u.first_name AS "firstName", u.tg_username AS "tgUsername", u.ref_code AS "refCode",
           u.invited_by_user_id AS "invitedBy"
    FROM bookings b
    LEFT JOIN users u ON u.id = b.user_id
    WHERE b.status = 'paid' AND b.marketing_processed = false
    ORDER BY b.paid_at ASC
    LIMIT 500
  `));
  return c.json({ ok: true, count: rows.length, bookings: rows });
});

export default app;
