import crypto from 'node:crypto';

/**
 * CryptoBot (Telegram @CryptoBot) Crypto Pay API.
 *
 * Docs: https://help.crypt.bot/crypto-pay-api
 *
 * We speak to `https://pay.crypt.bot/api/*` over plain fetch — no SDK. The
 * token is sent as `Crypto-Pay-API-Token`. Webhooks are signed with
 * HMAC-SHA256 where the secret key is SHA256(token) and the signature is
 * delivered hex-encoded via the `crypto-pay-api-signature` header.
 *
 * When `CRYPTOBOT_TOKEN` is blank the route layer maps
 * `CRYPTOBOT_NOT_CONFIGURED` to HTTP 503 so the UI can show a "coming soon"
 * toast instead of a broken button.
 */

const API_BASE = 'https://pay.crypt.bot/api';

export class CryptoBotNotConfiguredError extends Error {
  code = 'CRYPTOBOT_NOT_CONFIGURED' as const;
  constructor() {
    super('CryptoBot credentials are not configured');
    this.name = 'CryptoBotNotConfiguredError';
  }
}

export interface CreateInvoiceArgs {
  asset: 'USDT' | 'TON' | 'BTC' | 'ETH' | 'BNB' | 'TRX' | 'USDC';
  amount: string;
  payload: string;
  description?: string;
}

export interface CryptoBotInvoice {
  invoice_id: number;
  hash: string;
  asset: string;
  amount: string;
  pay_url: string;
  mini_app_pay_url?: string;
  bot_invoice_url?: string;
  web_app_invoice_url?: string;
  status: 'active' | 'paid' | 'expired';
  created_at: string;
  expiration_date?: string;
  payload?: string;
  description?: string;
}

interface CryptoBotApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: { code: number; name: string };
}

export interface CryptoBotInvoicePaidUpdate {
  update_id: number;
  update_type: 'invoice_paid';
  request_date: string;
  payload: CryptoBotInvoice;
}

function token(): string {
  return process.env.CRYPTOBOT_TOKEN ?? '';
}

export function cryptobotConfigured(): boolean {
  return !!token();
}

export async function createInvoice(
  args: CreateInvoiceArgs,
): Promise<CryptoBotInvoice> {
  const apiToken = token();
  if (!apiToken) throw new CryptoBotNotConfiguredError();

  const body = {
    asset: args.asset,
    amount: args.amount,
    payload: args.payload,
    ...(args.description ? { description: args.description } : {}),
  };

  const res = await fetch(`${API_BASE}/createInvoice`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'Crypto-Pay-API-Token': apiToken,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`cryptobot createInvoice failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as CryptoBotApiResponse<CryptoBotInvoice>;
  if (!data.ok || !data.result) {
    throw new Error(
      `cryptobot createInvoice error: ${data.error?.name ?? 'unknown'}`,
    );
  }
  return data.result;
}

/**
 * Verify a Crypto Pay webhook signature.
 *
 * Scheme: `HMAC-SHA256(body, SHA256(token))`, hex-encoded, delivered in the
 * `crypto-pay-api-signature` header. Returns false (never throws) on any
 * shape mismatch so a stray public POST at the webhook URL is silently
 * rejected rather than 500-ing.
 */
export function verifyWebhookSignature(
  bodyString: string,
  signatureHeader: string | null | undefined,
  apiToken: string,
): boolean {
  if (!signatureHeader || !apiToken) return false;
  const secret = crypto.createHash('sha256').update(apiToken).digest();
  const expected = crypto
    .createHmac('sha256', secret)
    .update(bodyString)
    .digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signatureHeader, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
