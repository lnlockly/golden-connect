import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import { db } from '../db/client.js';
import * as LeadsRepo from '../repos/leads.js';
import {
  createInvoiceForLead,
  setTxHashForLead,
} from '../services/invoices.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

function intParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const createSchema = z.object({
  track: z.string().min(1),
  contact: z.string().nullable().optional(),
  payload: z.any(),
  source: z.string().nullable().optional(),
  lang: z.string().nullable().optional(),
  chat_id: z.number().int().nullable().optional(),
  message_thread_id: z.number().int().nullable().optional(),
  posted_message_id: z.number().int().nullable().optional(),
});

app.post('/internal/leads', async (c) => {
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
  const lead = await LeadsRepo.create({
    track: parsed.data.track,
    contact: parsed.data.contact ?? null,
    payload: parsed.data.payload,
    source: parsed.data.source ?? null,
    lang: parsed.data.lang ?? null,
    chat_id: parsed.data.chat_id ?? null,
    message_thread_id: parsed.data.message_thread_id ?? null,
    posted_message_id: parsed.data.posted_message_id ?? null,
  });
  return c.json({ ok: true, id: lead.id, lead });
});

// Literal paths before /:id/*
app.get('/internal/leads/by-posted', async (c) => {
  const chatId = Number(c.req.query('chat_id'));
  const messageId = Number(c.req.query('message_id'));
  if (!Number.isFinite(chatId) || !Number.isFinite(messageId)) {
    return c.json({ ok: false, error: 'bad_params' }, 400);
  }
  const lead = await LeadsRepo.findByPostedMessage(chatId, messageId);
  return c.json({ ok: true, lead });
});

app.get('/internal/leads/recent-by-contact', async (c) => {
  const contact = c.req.query('contact');
  const sinceMs = Number(c.req.query('since_ms'));
  if (!contact || !Number.isFinite(sinceMs)) {
    return c.json({ ok: false, error: 'bad_params' }, 400);
  }
  const count = await LeadsRepo.recentByContact(contact, sinceMs);
  return c.json({ ok: true, count });
});

app.get('/internal/leads/latest-in-thread', async (c) => {
  const chatId = Number(c.req.query('chat_id'));
  const threadId = Number(c.req.query('thread_id'));
  if (!Number.isFinite(chatId) || !Number.isFinite(threadId)) {
    return c.json({ ok: false, error: 'bad_params' }, 400);
  }
  const lead = await LeadsRepo.latestInThread(chatId, threadId);
  return c.json({ ok: true, lead });
});

app.get('/internal/leads/by-status/:status', async (c) => {
  const status = c.req.param('status') ?? 'all';
  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 50) || 50));
  const offset = Math.max(0, Number(c.req.query('offset') ?? 0) || 0);
  const [rows, total] = await Promise.all([
    LeadsRepo.listByStatus(status, limit, offset),
    LeadsRepo.countByStatus(status),
  ]);
  return c.json({ ok: true, rows, total });
});

app.get('/internal/leads/:id', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  const lead = await LeadsRepo.findById(id);
  return c.json({ ok: true, lead });
});

const takeSchema = z.object({ taken_by_tg_id: z.number().int() });

app.post('/internal/leads/:id/take', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = takeSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await LeadsRepo.markTaken(id, parsed.data.taken_by_tg_id);
  return c.json({ ok: true });
});

const resolveSchema = z.object({
  status: z.enum(['won', 'lost']),
  total_usd: z.number().int().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
});

app.post('/internal/leads/:id/resolve', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await LeadsRepo.resolve(id, parsed.data.status, {
    total_usd: parsed.data.total_usd ?? null,
    lost_reason: parsed.data.lost_reason ?? null,
  });
  return c.json({ ok: true });
});

const snoozeSchema = z.object({ until_ms: z.number().int() });

const postedSchema = z.object({
  chat_id: z.number().int(),
  message_thread_id: z.number().int().nullable().optional(),
  posted_message_id: z.number().int(),
});

app.post('/internal/leads/:id/posted', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = postedSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await LeadsRepo.setPosted(
    id,
    parsed.data.chat_id,
    parsed.data.message_thread_id ?? null,
    parsed.data.posted_message_id,
  );
  return c.json({ ok: true });
});

/* -------------------- Enrollment-flow actions --------------------
 *
 * These three endpoints drive the anonymous academy enrollment flow:
 *   1. /internal/leads                 — existing creation endpoint
 *   2. /internal/leads/:id/approve     — mark `taken` + write total_usd so
 *                                        subsequent invoice creation has
 *                                        the amount it needs
 *   3. /internal/leads/:id/create-invoice — build a platega or crypto
 *                                        invoice, returns payment details
 *
 * Plus `/internal/leads/:id/invoice-tx` so the anonymous thanks page can
 * submit a tx hash once the user has paid their crypto invoice.
 *
 * All four sit behind `requireInternalSecret` — we trust the caller
 * because it holds the shared `INTERNAL_API_SECRET`.
 */

const approveSchema = z.object({
  total_usd: z.number().int().positive(),
});

app.post('/internal/leads/:id/approve', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  // Mark `taken` (idempotent: repo only transitions new|snoozed → taken).
  // 0 here is the "system" admin tg_id — there's no real operator for the
  // automated enrollment flow. Could swap in a sentinel later if needed.
  await LeadsRepo.markTaken(id, 0);

  // Always write the amount — separate from the status guard above, because
  // the order page needs total_usd available even if the lead was already
  // taken on a prior submit.
  await db.execute(sql`
    UPDATE leads SET total_usd = ${parsed.data.total_usd} WHERE id = ${id}
  `);

  const lead = await LeadsRepo.findById(id);
  if (!lead) return c.json({ ok: false, error: 'lead_not_found' }, 404);
  return c.json({ ok: true, lead });
});

const internalInvoiceSchema = z.object({
  method: z.enum(['platega', 'crypto_bep20']),
});

app.post('/internal/leads/:id/create-invoice', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  const origin =
    c.req.header('origin') ||
    c.req.header('referer')?.replace(/\/$/, '') ||
    'http://localhost:5178';
  const apiOrigin = new URL(c.req.url).origin;

  const result = await createInvoiceForLead({
    leadId: id,
    method: parsed.data.method,
    origin,
    apiOrigin,
  });
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.status);
  }
  return c.json({ ok: true, invoice: result.invoice });
});

const TX_HASH_RE = /^0x[0-9a-f]{64}$/;
const internalTxSchema = z.object({
  tx_hash: z.string().regex(TX_HASH_RE),
});

app.post('/internal/leads/:id/invoice-tx', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = internalTxSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_tx_hash' }, 400);
  }

  const result = await setTxHashForLead(id, parsed.data.tx_hash);
  if (!result.ok) {
    return c.json({ ok: false, error: result.error }, result.status);
  }
  return c.json({ ok: true, invoice: result.invoice });
});

app.post('/internal/leads/:id/snooze', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = snoozeSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await LeadsRepo.snooze(id, parsed.data.until_ms);
  return c.json({ ok: true });
});

export default app;
