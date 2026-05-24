import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { invoices } from '../db/schema.js';
import {
  createInvoice as plategaCreateInvoice,
  PlategaNotConfiguredError,
} from './platega.js';
import {
  generateUniqueAmount,
  microToHuman,
  receiveAddress,
} from './crypto-invoice.js';

/**
 * Shared invoice helpers. Extracted from `routes/me.ts` so the internal
 * enrollment proxy (academy → /internal/leads/:id/create-invoice) can reuse
 * the exact same logic that the logged-in /me flow uses — one source of
 * truth for payment intake.
 */

export type InvoiceMethod = 'platega' | 'crypto_bep20';

const PLATEGA_TTL_MS = 30 * 60 * 1000;
const CRYPTO_TTL_MS = 2 * 60 * 60 * 1000;
// Suppress `ts-unused-export` nag — kept for parity with the route module
// even if nothing currently imports it.
export const TTL = { PLATEGA_TTL_MS, CRYPTO_TTL_MS };

export interface ShapedInvoice {
  id: number;
  method: InvoiceMethod;
  status: string;
  amount_usd: number;
  amount_usdt_micro: string | null;
  amount_usdt_human: string | null;
  crypto_address: string | null;
  payment_url: string | null;
  tx_hash: string | null;
  created_at: number | null;
  expires_at: number | null;
}

export function shapeInvoice(row: any): ShapedInvoice {
  // Accept both drizzle-builder (camelCase) and raw db.execute (snake_case).
  const pick = (camel: string, snake: string) =>
    row[camel] !== undefined ? row[camel] : row[snake];
  const method = pick('method', 'method') as InvoiceMethod;
  const microRaw = pick('amountUsdtMicro', 'amount_usdt_micro');
  const micro: bigint | null = microRaw != null ? BigInt(microRaw) : null;
  const toMs = (v: unknown): number | null => {
    if (v == null) return null;
    if (v instanceof Date) return v.getTime();
    // Postgres returns timestamps as "YYYY-MM-DD HH:MM:SS[.us]" without a Z
    // — `new Date()` would treat that as local time. Normalise to ISO UTC.
    let s = String(v);
    if (/^\d{4}-\d{2}-\d{2} /.test(s) && !/[zZ]$/.test(s)) {
      s = s.replace(' ', 'T') + 'Z';
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  };
  return {
    id: Number(pick('id', 'id')),
    method,
    status: pick('status', 'status') as string,
    amount_usd: Number(pick('amountUsd', 'amount_usd')),
    amount_usdt_micro: micro != null ? micro.toString() : null,
    amount_usdt_human: micro != null ? microToHuman(micro) : null,
    crypto_address: pick('cryptoAddress', 'crypto_address') ?? null,
    payment_url: pick('plategaUrl', 'platega_url') ?? null,
    tx_hash: pick('txHash', 'tx_hash') ?? null,
    created_at: toMs(pick('createdAt', 'created_at')),
    expires_at: toMs(pick('expiresAt', 'expires_at')),
  };
}

export interface CreateForLeadArgs {
  leadId: number;
  method: InvoiceMethod;
  /** origin for platega success_url redirect (falls back to localhost). */
  origin?: string | null;
  /** origin of the api server for the platega webhook callback. */
  apiOrigin: string;
}

export type CreateForLeadResult =
  | { ok: true; invoice: ShapedInvoice }
  | {
      ok: false;
      status: 404 | 409 | 502 | 503;
      error:
        | 'lead_not_found'
        | 'bad_status'
        | 'amount_not_set'
        | 'platega_not_configured'
        | 'platega_failed';
    };

/**
 * Lazy invoice creation for a lead — the same logic `/me/leads/:id/invoice`
 * uses, but without the owner/admin gate. Callers decide who's allowed.
 *
 * Lead must be `taken` (or `new` with a `total_usd` already set) and have a
 * `total_usd`. Re-running with the same method while a pending invoice
 * exists returns that invoice rather than creating a duplicate.
 */
export async function createInvoiceForLead(
  args: CreateForLeadArgs,
): Promise<CreateForLeadResult> {
  const { leadId, method, apiOrigin } = args;
  const origin = args.origin ?? 'http://localhost:5177';

  const leadRows = await db.execute(sql`
    SELECT id, user_id, status, total_usd FROM leads WHERE id = ${leadId} LIMIT 1
  `);
  const lead = leadRows[0] as any;
  if (!lead) return { ok: false, status: 404, error: 'lead_not_found' };

  if (!['taken', 'new'].includes(lead.status)) {
    return { ok: false, status: 409, error: 'bad_status' };
  }
  if (lead.total_usd == null) {
    return { ok: false, status: 409, error: 'amount_not_set' };
  }

  const amountUsd = Number(lead.total_usd);
  const nowMs = Date.now();

  const existingRows = await db.execute(sql`
    SELECT * FROM invoices
    WHERE lead_id = ${leadId} AND method = ${method} AND status = 'pending'
    ORDER BY id DESC LIMIT 1
  `);
  const existing = existingRows[0] as any;
  if (existing) {
    const shaped = shapeInvoice(existing);
    if (shaped.expires_at != null && shaped.expires_at > nowMs) {
      return { ok: true, invoice: shaped };
    }
  }

  if (method === 'crypto_bep20') {
    const micro = generateUniqueAmount(amountUsd, leadId);
    const addr = receiveAddress();
    const expiresAt = new Date(nowMs + CRYPTO_TTL_MS);
    const [inserted] = await db
      .insert(invoices)
      .values({
        leadId,
        userId: lead.user_id ?? null,
        method: 'crypto_bep20',
        amountUsd,
        amountUsdtMicro: micro,
        cryptoAddress: addr,
        status: 'pending',
        expiresAt,
      })
      .returning();
    return { ok: true, invoice: shapeInvoice(inserted) };
  }

  // method === 'platega'
  // Legacy lead-flow adapter onto the new entry-flow Platega client. The
  // service only accepts `{ amountUsd, orderId, description }`; `origin` and
  // `apiOrigin` are now derived from APP_PUBLIC_URL inside the service, so
  // the per-call overrides here are ignored — lead-flow callers get the same
  // canonical URLs as the tariff-entry flow. `expires_at` is nullable on the
  // new response, so we fall back to the local TTL when absent.
  void origin;
  void apiOrigin;
  try {
    const result = await plategaCreateInvoice({
      amountUsd,
      orderId: `lead-${leadId}-${Date.now()}`,
      description: `Lead #${leadId}`,
    });
    const [inserted] = await db
      .insert(invoices)
      .values({
        leadId,
        userId: lead.user_id ?? null,
        method: 'platega',
        amountUsd,
        plategaId: result.invoice_id,
        plategaUrl: result.pay_url,
        status: 'pending',
        expiresAt: result.expires_at ?? new Date(Date.now() + PLATEGA_TTL_MS),
      })
      .returning();
    return { ok: true, invoice: shapeInvoice(inserted) };
  } catch (err) {
    if (err instanceof PlategaNotConfiguredError) {
      return { ok: false, status: 503, error: 'platega_not_configured' };
    }
    console.error('platega invoice create failed', err);
    return { ok: false, status: 502, error: 'platega_failed' };
  }
}

export type SetTxResult =
  | { ok: true; invoice: ShapedInvoice }
  | {
      ok: false;
      status: 404 | 409;
      error: 'invoice_not_found' | 'wrong_method';
    };

/**
 * Record a submitted BSC tx hash for the most recent pending crypto
 * invoice on a lead. We do not verify on-chain here — a background watcher
 * (or a human admin) later transitions the lead to `won`.
 */
export async function setTxHashForLead(
  leadId: number,
  txHash: string,
): Promise<SetTxResult> {
  const rows = await db.execute(sql`
    SELECT * FROM invoices
    WHERE lead_id = ${leadId} AND method = 'crypto_bep20'
    ORDER BY id DESC LIMIT 1
  `);
  const inv = rows[0] as any;
  if (!inv) return { ok: false, status: 404, error: 'invoice_not_found' };
  if (inv.method !== 'crypto_bep20') {
    return { ok: false, status: 409, error: 'wrong_method' };
  }
  await db.execute(sql`
    UPDATE invoices SET tx_hash = ${txHash} WHERE id = ${inv.id}
  `);
  return {
    ok: true,
    invoice: shapeInvoice({ ...inv, tx_hash: txHash }),
  };
}
