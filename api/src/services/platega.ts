import crypto from 'node:crypto';
import { env } from './env.js';

/**
 * Platega.io card-acquiring + crypto + SBP intake.
 *
 * Real API: POST {BASE}/transaction/process
 * Auth: X-MerchantId + X-Secret headers (not HMAC).
 * Webhook is authenticated by the SAME headers.
 *
 * paymentMethod values (per Platega docs):
 *   2  — SBP (СБП по QR)
 *   10 — Russian cards (MIR/Visa/MC)
 *   11 — Generic card acquiring
 *   12 — International cards
 *   13 — Crypto
 */

export const PAYMENT_METHODS = {
  SBP: 2,
  CARDS_RUB: 10,
  CARD_ACQUIRING: 11,
  INTERNATIONAL: 12,
  CRYPTO: 13,
} as const;

export class PlategaNotConfiguredError extends Error {
  code = 'platega_not_configured' as const;
  constructor() {
    super('Platega credentials are not configured');
    this.name = 'PlategaNotConfiguredError';
  }
}

export interface CreateInvoiceArgs {
  amountUsd: number;
  orderId: string;
  description?: string;
  paymentMethod?: number;
  returnUrl?: string;
  failedUrl?: string;
}

export interface CreateInvoiceResult {
  pay_url: string;
  invoice_id: string;
  amount_rub: number;
  expires_at: Date | null;
}

export interface PlategaWebhookBody {
  Id?: string;
  Status?: string;
  Amount?: number | string;
  Payload?: string;
  // legacy lower-case (defensive)
  id?: string;
  status?: string;
  amount_rub?: number | string;
  order_id?: string;
  [k: string]: unknown;
}

function assertConfigured(): void {
  if (!env.plategaMerchantId || !env.plategaApiSecret) {
    throw new PlategaNotConfiguredError();
  }
}

export function plategaConfigured(): boolean {
  return !!env.plategaMerchantId && !!env.plategaApiSecret;
}

export function usdToRubInt(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new Error('amountUsd must be a positive finite number');
  }
  return Math.round(amountUsd * env.plategaUsdRate);
}

export async function createInvoice(
  args: CreateInvoiceArgs,
): Promise<CreateInvoiceResult> {
  assertConfigured();

  const amountRubInt = usdToRubInt(args.amountUsd);
  const txId = crypto.randomUUID
    ? crypto.randomUUID()
    : crypto.randomBytes(16).toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-4$3-$4-');

  const baseUrl = String(env.plategaBaseUrl || 'https://app.platega.io').replace(/\/$/, '');
  const body = {
    paymentMethod: args.paymentMethod ?? PAYMENT_METHODS.SBP,
    id: txId,
    paymentDetails: { amount: amountRubInt, currency: 'RUB' },
    description: args.description ?? 'Trendex',
    return: args.returnUrl ?? `${env.appPublicUrl}/pay/thanks`,
    failedUrl: args.failedUrl ?? args.returnUrl ?? `${env.appPublicUrl}/pay/failed`,
    payload: args.orderId,
  };

  const res = await fetch(`${baseUrl}/transaction/process`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'X-MerchantId': env.plategaMerchantId,
      'X-Secret': env.plategaApiSecret,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`platega ${res.status}: ${text.slice(0, 400)}`);
  }
  let data: {
    redirect?: string;
    url?: string;
    transactionId?: string;
    id?: string;
    expiresIn?: string | number;
  };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('platega response not JSON: ' + text.slice(0, 200));
  }
  const pay_url = data.redirect ?? data.url;
  const invoice_id = data.transactionId ?? data.id;
  if (!pay_url || !invoice_id) {
    throw new Error('platega response missing redirect/transactionId: ' + JSON.stringify(data).slice(0, 200));
  }
  const expires_at = data.expiresIn ? new Date(data.expiresIn) : null;
  return { pay_url, invoice_id, amount_rub: amountRubInt, expires_at };
}

/**
 * Verify Platega webhook by checking that the request carries the same
 * X-MerchantId + X-Secret pair we use for outgoing API calls. There is no
 * HMAC here — this matches Platega's actual webhook auth scheme.
 */
export function verifyWebhookHeaders(
  headers: Record<string, string | string[] | undefined>,
): boolean {
  if (!env.plategaMerchantId || !env.plategaApiSecret) return false;
  const get = (name: string): string => {
    const v = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(v)) return String(v[0] ?? '');
    return String(v ?? '');
  };
  const gotId = get('x-merchantid') || get('X-MerchantId') || get('x-merchant-id');
  const gotSecret = get('x-secret') || get('X-Secret');
  if (!gotId || !gotSecret) return false;
  return (
    String(gotId).trim() === String(env.plategaMerchantId).trim() &&
    String(gotSecret).trim() === String(env.plategaApiSecret).trim()
  );
}

/**
 * Legacy: verify via HMAC body signature. Kept exported for backward
 * compatibility in tests; new code should call verifyWebhookHeaders().
 */
export function verifyWebhookSignature(
  _body: PlategaWebhookBody,
  _sigHeader: string | null | undefined,
  _secret: string,
): boolean {
  // No longer used — Platega uses header auth, not body signature.
  return false;
}

export function buildEntryOrderId(userId: number, tariffId: number): string {
  return `entry:${userId}:${tariffId}:${Date.now()}`;
}

export function parseEntryOrderId(
  orderId: string,
): { userId: number; tariffId: number; bookingId: number | null; ts: number } | null {
  const m = /^entry:(\d+):(\d+):(\d+)$/.exec(orderId);
  if (!m) return null;
  const fourth = Number(m[3]);
  const bookingId = fourth > 0 && fourth < 1_000_000_000 ? fourth : null;
  return {
    userId: Number(m[1]),
    tariffId: Number(m[2]),
    bookingId,
    ts: fourth,
  };
}
