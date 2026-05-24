/**
 * Tests for routes/webhooks-cryptobot.ts.
 *
 * Pure — no DB. We stub `entry-processor.processEntry` via `vi.mock` so
 * the route contract is exercised end-to-end (raw body → signature verify
 * → payload parse → processEntry call) without standing up Postgres.
 */
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.INTERNAL_API_SECRET ||= 'test-secret';
process.env.AUTH_JWT_SECRET ||= 'test-jwt-secret';
process.env.CRYPTOBOT_TOKEN = 'test-token-abc';

const processEntryMock = vi.fn(async (_args: unknown) => ({ ok: true }));
vi.mock('../../services/entry-processor.js', () => ({
  processEntry: (args: unknown) => processEntryMock(args),
}));

// Force marketing_active=true so the route hits processEntry rather than
// the pre-launch processLinearOnly branch.
vi.mock('../../services/system-settings.js', () => ({
  isMarketingActive: async () => true,
}));

function sign(body: string, token: string): string {
  const secret = crypto.createHash('sha256').update(token).digest();
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function buildApp() {
  const { createApp } = await import('../../server.js');
  return createApp();
}

describe('POST /webhooks/cryptobot', () => {
  beforeEach(() => {
    processEntryMock.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and calls processEntry on a valid invoice_paid update', async () => {
    const body = JSON.stringify({
      update_id: 1,
      update_type: 'invoice_paid',
      request_date: '2026-04-21T00:00:00Z',
      payload: {
        invoice_id: 9876,
        status: 'paid',
        payload: 'entry:7:3:1700000000000',
      },
    });
    const sig = sign(body, 'test-token-abc');

    const app = await buildApp();
    const res = await app.request('/webhooks/cryptobot', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'crypto-pay-api-signature': sig,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(processEntryMock).toHaveBeenCalledTimes(1);
    expect(processEntryMock).toHaveBeenCalledWith({
      userId: 7,
      tariffId: 3,
      paymentRefId: 'cryptobot:9876',
    });
  });

  it('returns 200 but skips processEntry when signature is invalid', async () => {
    const body = JSON.stringify({
      update_type: 'invoice_paid',
      payload: { invoice_id: 1, status: 'paid', payload: 'entry:1:1:1' },
    });

    const app = await buildApp();
    const res = await app.request('/webhooks/cryptobot', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'crypto-pay-api-signature': 'deadbeef',
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(processEntryMock).not.toHaveBeenCalled();
  });

  it('skips non invoice_paid update types', async () => {
    const body = JSON.stringify({
      update_type: 'invoice_expired',
      payload: { invoice_id: 2 },
    });
    const sig = sign(body, 'test-token-abc');

    const app = await buildApp();
    const res = await app.request('/webhooks/cryptobot', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'crypto-pay-api-signature': sig,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(processEntryMock).not.toHaveBeenCalled();
  });

  it('skips when payload shape is unparseable', async () => {
    const body = JSON.stringify({
      update_type: 'invoice_paid',
      payload: {
        invoice_id: 3,
        status: 'paid',
        payload: 'not-an-entry-payload',
      },
    });
    const sig = sign(body, 'test-token-abc');

    const app = await buildApp();
    const res = await app.request('/webhooks/cryptobot', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'crypto-pay-api-signature': sig,
      },
      body,
    });

    expect(res.status).toBe(200);
    expect(processEntryMock).not.toHaveBeenCalled();
  });
});
