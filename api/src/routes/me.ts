import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { ADMIN_REF_CODE, getInviter, getUserById } from '../services/users.js';
import { toLeadRow } from '../repos/mappers.js';
import * as LeadsRepo from '../repos/leads.js';
import { env } from '../services/env.js';
import {
  createInvoiceForLead,
  shapeInvoice,
} from '../services/invoices.js';
import { accrueForLead } from '../services/rewards.js';

function isAdminRecord(record: { user: { refCode: string }; wallet: { address: string } | null }): boolean {
  if (record.user.refCode === ADMIN_REF_CODE) return true;
  const addr = record.wallet?.address?.toLowerCase();
  return !!addr && env.adminWallets.includes(addr);
}

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me', requireAuth);
app.use('/me/*', requireAuth);

app.get('/me', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) {
    return c.json({ ok: false, error: 'user_not_found' }, 404);
  }
  const inviter = await getInviter(record.user.id);

  const balanceRows = await db.execute(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::text AS balance_micro
    FROM flow_ledger WHERE user_id = ${record.user.id}
  `);
  const balanceMicro = (balanceRows[0] as any)?.balance_micro ?? '0';

  return c.json({
    ok: true,
    user: {
      id: record.user.id,
      ref_code: record.user.refCode,
      tg_id: record.user.tgId,
      tg_username: record.user.tgUsername,
      joined_at: record.user.joinedAt,
      applied_on_site: record.user.appliedOnSite,
      is_admin: isAdminRecord(record),
    },
    wallet: record.wallet
      ? {
          address: record.wallet.address,
          chain_id: record.wallet.chainId,
          connected_at: record.wallet.connectedAt,
        }
      : null,
    balance_micro: balanceMicro,
    ref_code: record.user.refCode,
    invited_by: inviter
      ? {
          id: inviter.id,
          ref_code: inviter.refCode,
          username_masked: inviter.tgUsername ? `@${inviter.tgUsername}` : null,
        }
      : null,
  });
});

app.post('/me/link-telegram', async (c) => {
  return c.json({ ok: false, error: 'not_implemented' }, 501);
});

app.get('/me/agents', async (c) => {
  // Stub — Phase F.
  return c.json({ ok: false, error: 'not_implemented' }, 501);
});

/**
 * GET /me/leads — orders the user has submitted through the AI bot.
 * Admin (ref_code = 'admin') receives every lead in the system, paginated.
 * Regular users only see their own leads joined through `user_id`.
 */
app.get('/me/leads', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const isAdmin = isAdminRecord(record);
  const limit = Math.max(1, Math.min(100, Number(c.req.query('limit') ?? 30) || 30));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);

  const rows = isAdmin
    ? await db.execute(sql`
        SELECT l.*, u.ref_code AS _user_ref_code, u.tg_username AS _user_tg
        FROM leads l
        LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.id DESC LIMIT ${limit} OFFSET ${offset}
      `)
    : await db.execute(sql`
        SELECT * FROM leads
        WHERE user_id = ${session.id}
        ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
      `);

  return c.json({
    ok: true,
    leads: rows.map((r: any) => ({
      ...toLeadRow(r),
      submitter: isAdmin
        ? { ref_code: r._user_ref_code ?? null, tg_username: r._user_tg ?? null }
        : null,
    })),
    is_admin: isAdmin,
  });
});

const leadStatusSchema = z.object({
  status: z.enum(['taken', 'won', 'lost']),
  total_usd: z.number().int().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
});

/**
 * POST /me/leads/:id/status — admin-only status transitions.
 *
 * On `taken` transitions the admin optionally includes `total_usd` which is
 * persisted on the lead — this replaces the older two-step "approve → set
 * amount on won" flow so the user sees the price immediately when they
 * click Pay.
 *
 * On `won` we additionally run the referral-reward accrual
 * (`accrueForLead`) so the inviter tree gets credited in the same request.
 * The accrual is idempotent so re-running on an already-won lead is safe.
 */
app.post('/me/leads/:id/status', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) return c.json({ ok: false, error: 'user_not_found' }, 404);
  if (record.user.refCode !== ADMIN_REF_CODE) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = leadStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  if (parsed.data.status === 'taken') {
    await LeadsRepo.markTaken(id, session.tgId ?? 0);
    // If the admin set an amount on approve, write it immediately so the
    // Pay buttons can render. markTaken ignores non-new|snoozed rows, so
    // writing total_usd unconditionally (only when provided) keeps this
    // simple — the amount sticks even if the row was already taken.
    if (parsed.data.total_usd != null) {
      await db.execute(sql`
        UPDATE leads SET total_usd = ${parsed.data.total_usd} WHERE id = ${id}
      `);
    }
  } else {
    await LeadsRepo.resolve(id, parsed.data.status, {
      total_usd: parsed.data.total_usd ?? null,
      lost_reason: parsed.data.lost_reason ?? null,
    });
    if (parsed.data.status === 'won') {
      try {
        await accrueForLead(id);
      } catch (err) {
        // Log but don't fail the status transition — admin can re-run via
        // a manual job if the accrual craps out (e.g. DB hiccup).
        console.error('accrueForLead failed for lead', id, err);
      }
    }
  }
  return c.json({ ok: true });
});

/* -------------------- Payment intake (invoices) -------------------- */

const invoiceMethodSchema = z.object({
  method: z.enum(['platega', 'crypto_bep20']),
});

const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
const txSchema = z.object({
  tx_hash: z.string().regex(TX_HASH_RE),
});

// Invoice helpers live in `../services/invoices.ts`; shared with the
// internal academy enrollment proxy.

/**
 * POST /me/leads/:id/invoice — lazy invoice creation.
 *
 * Lead owner or admin can hit this. Lead must be `taken` (or `new` with a
 * `total_usd` already set) and have a `total_usd`. Re-hitting this with the
 * same method while a pending invoice exists returns that invoice rather
 * than creating a duplicate — so refreshing the page or double-clicking
 * Pay doesn't explode the table.
 */
app.post('/me/leads/:id/invoice', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = invoiceMethodSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const method = parsed.data.method;

  // Owner/admin gate lives here; the shared service is auth-agnostic.
  const leadRows = await db.execute(sql`
    SELECT user_id FROM leads WHERE id = ${id} LIMIT 1
  `);
  const lead = leadRows[0] as any;
  if (!lead) return c.json({ ok: false, error: 'lead_not_found' }, 404);
  const isAdmin = isAdminRecord(record);
  const ownsLead =
    lead.user_id != null && Number(lead.user_id) === session.id;
  if (!isAdmin && !ownsLead) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }

  const origin =
    c.req.header('origin') ||
    c.req.header('referer')?.replace(/\/$/, '') ||
    'http://localhost:5177';
  const apiOrigin = new URL(c.req.url).origin;
  const result = await createInvoiceForLead({
    leadId: id,
    method,
    origin,
    apiOrigin,
  });
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.status);
  }
  return c.json({ ok: true, invoice: result.invoice });
});

/**
 * POST /me/leads/:id/invoice/:invoiceId/tx — user submits a BSC tx hash
 * after paying the crypto invoice. We only store the hash — actual
 * confirmation is still manual (admin checks bscscan and marks `won`). A
 * background watcher will auto-confirm in a later task.
 */
app.post('/me/leads/:id/invoice/:invoiceId/tx', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const leadId = Number(c.req.param('id'));
  const invoiceId = Number(c.req.param('invoiceId'));
  if (!Number.isFinite(leadId) || !Number.isFinite(invoiceId)) {
    return c.json({ ok: false, error: 'bad_id' }, 400);
  }
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = txSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_tx_hash' }, 400);
  }

  const invRows = await db.execute(sql`
    SELECT i.*, l.user_id AS lead_user_id
    FROM invoices i JOIN leads l ON l.id = i.lead_id
    WHERE i.id = ${invoiceId} AND i.lead_id = ${leadId}
    LIMIT 1
  `);
  const inv = invRows[0] as any;
  if (!inv) return c.json({ ok: false, error: 'invoice_not_found' }, 404);
  if (inv.method !== 'crypto_bep20') {
    return c.json({ ok: false, error: 'wrong_method' }, 409);
  }

  const isAdmin = isAdminRecord(record);
  const ownsLead =
    inv.lead_user_id != null && Number(inv.lead_user_id) === session.id;
  if (!isAdmin && !ownsLead) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }

  await db.execute(sql`
    UPDATE invoices SET tx_hash = ${parsed.data.tx_hash} WHERE id = ${invoiceId}
  `);

  return c.json({ ok: true, invoice: shapeInvoice({ ...inv, tx_hash: parsed.data.tx_hash }) });
});

/** GET /me/leads/:id/invoices — list invoices for a lead (owner or admin). */
app.get('/me/leads/:id/invoices', async (c) => {
  const session = c.get('user');
  const record = await getUserById(session.id);
  if (!record) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);

  const leadRows = await db.execute(sql`
    SELECT user_id FROM leads WHERE id = ${id} LIMIT 1
  `);
  const lead = leadRows[0] as any;
  if (!lead) return c.json({ ok: false, error: 'lead_not_found' }, 404);

  const isAdmin = isAdminRecord(record);
  const ownsLead =
    lead.user_id != null && Number(lead.user_id) === session.id;
  if (!isAdmin && !ownsLead) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }

  const rows = await db.execute(sql`
    SELECT * FROM invoices WHERE lead_id = ${id} ORDER BY id DESC
  `);
  return c.json({
    ok: true,
    invoices: rows.map((r: any) => shapeInvoice(r)),
  });
});



export default app;
