/**
 * CryptoBot service unit tests.
 *
 * These are pure — no DB, no network. `createInvoice` is exercised against
 * a stubbed `global.fetch`; the signature helper is checked against a
 * hand-rolled HMAC over a fixed payload.
 *
 * `../cryptobot.js` is loaded via dynamic import after `process.env` is
 * seeded, because env.ts snapshots `CRYPTOBOT_TOKEN` at module-load time
 * and ES static imports are hoisted above top-level env assignments.
 */
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.CRYPTOBOT_TOKEN = 'test-token-abc';

type CryptobotModule = typeof import('../cryptobot.js');

async function load(): Promise<CryptobotModule> {
  return import('../cryptobot.js');
}

describe('verifyWebhookSignature', () => {
  const token = 'test-token-abc';
  const body = JSON.stringify({ update_type: 'invoice_paid', payload: { invoice_id: 1 } });

  function sign(bodyStr: string, tok: string): string {
    const secret = crypto.createHash('sha256').update(tok).digest();
    return crypto.createHmac('sha256', secret).update(bodyStr).digest('hex');
  }

  it('accepts a correctly signed payload', async () => {
    const { verifyWebhookSignature } = await load();
    const sig = sign(body, token);
    expect(verifyWebhookSignature(body, sig, token)).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const { verifyWebhookSignature } = await load();
    const sig = sign(body, token);
    const tampered = body.replace('invoice_paid', 'invoice_expired');
    expect(verifyWebhookSignature(tampered, sig, token)).toBe(false);
  });

  it('rejects the wrong token', async () => {
    const { verifyWebhookSignature } = await load();
    const sig = sign(body, token);
    expect(verifyWebhookSignature(body, sig, 'different-token')).toBe(false);
  });

  it('rejects a blank signature header', async () => {
    const { verifyWebhookSignature } = await load();
    expect(verifyWebhookSignature(body, '', token)).toBe(false);
    expect(verifyWebhookSignature(body, null, token)).toBe(false);
  });

  it('rejects a malformed hex signature without throwing', async () => {
    const { verifyWebhookSignature } = await load();
    expect(verifyWebhookSignature(body, 'not-hex!!', token)).toBe(false);
  });
});

describe('createInvoice', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.CRYPTOBOT_TOKEN = 'test-token-abc';
    vi.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('POSTs the correct URL + token header + JSON body', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            invoice_id: 42,
            hash: 'h',
            asset: 'USDT',
            amount: '30.00',
            pay_url: 'https://pay.crypt.bot/abc',
            bot_invoice_url: 'https://t.me/CryptoBot?start=abc',
            status: 'active',
            created_at: '2026-04-21T00:00:00Z',
            expiration_date: '2026-04-22T00:00:00Z',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const { createInvoice } = await load();
    const inv = await createInvoice({
      asset: 'USDT',
      amount: '30.00',
      payload: 'entry:1:2:3',
      description: 'desc',
    });

    expect(inv.invoice_id).toBe(42);
    expect(inv.pay_url).toBe('https://pay.crypt.bot/abc');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('https://pay.crypt.bot/api/createInvoice');
    const headers = init.headers as Record<string, string>;
    expect(headers['Crypto-Pay-API-Token']).toBe('test-token-abc');
    expect(headers['content-type']).toBe('application/json');
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({
      asset: 'USDT',
      amount: '30.00',
      payload: 'entry:1:2:3',
      description: 'desc',
    });
  });

  it('throws when CryptoBot returns ok:false', async () => {
    global.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: { code: 400, name: 'BAD' } }), {
        status: 200,
      })) as unknown as typeof global.fetch;

    const { createInvoice } = await load();
    await expect(
      createInvoice({ asset: 'USDT', amount: '1', payload: 'x' }),
    ).rejects.toThrow(/BAD/);
  });

  it('throws CryptoBotNotConfiguredError when token is blank', async () => {
    process.env.CRYPTOBOT_TOKEN = '';
    vi.resetModules();
    const { createInvoice, CryptoBotNotConfiguredError } = await load();
    await expect(
      createInvoice({ asset: 'USDT', amount: '1', payload: 'x' }),
    ).rejects.toBeInstanceOf(CryptoBotNotConfiguredError);
  });
});
