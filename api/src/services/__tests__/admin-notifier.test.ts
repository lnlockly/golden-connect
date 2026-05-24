/**
 * Unit tests for services/admin-notifier.ts.
 *
 * We stub the global `fetch` to capture the URL + body sent to Telegram and
 * assert:
 *   1. ADMIN_TG_IDS env overrides the hard-coded default list.
 *   2. Missing BOT_TOKEN → notifier is a no-op (zero fetches).
 *   3. The body shape the function produces (chat_id, parse_mode, text).
 *   4. A throwing fetch does not surface as a rejected promise (swallowed
 *      per the fire-and-forget contract).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyAdminsOfPayment } from '../admin-notifier.js';

describe('notifyAdminsOfPayment', () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.BOT_TOKEN;
  const originalAdmins = process.env.ADMIN_TG_IDS;

  beforeEach(() => {
    process.env.BOT_TOKEN = 'test-token';
    delete process.env.ADMIN_TG_IDS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.BOT_TOKEN;
    else process.env.BOT_TOKEN = originalToken;
    if (originalAdmins === undefined) delete process.env.ADMIN_TG_IDS;
    else process.env.ADMIN_TG_IDS = originalAdmins;
    vi.restoreAllMocks();
  });

  it('POSTs to Telegram once per default admin id with expected body', async () => {
    const calls: Array<{ url: string; body: unknown; headers: unknown }> = [];
    globalThis.fetch = vi.fn(async (url: unknown, init: unknown) => {
      const req = (init ?? {}) as {
        body?: string;
        headers?: Record<string, string>;
      };
      calls.push({
        url: String(url),
        body: req.body ? JSON.parse(req.body) : undefined,
        headers: req.headers,
      });
      return new Response('{"ok":true}', { status: 200 });
    }) as unknown as typeof fetch;

    await notifyAdminsOfPayment({
      method: 'cryptobot',
      userId: 42,
      tariffCode: 'rocket',
      entryUsd: 100,
      paymentRefId: 'cryptobot:abc123',
      matrixPosition: 47,
    });

    expect(calls).toHaveLength(3);
    const chatIds = calls.map((c) => (c.body as { chat_id: number }).chat_id);
    expect(chatIds.sort()).toEqual([248745860, 424077439, 1361064246].sort());

    for (const call of calls) {
      expect(call.url).toBe('https://api.telegram.org/bottest-token/sendMessage');
      const body = call.body as {
        chat_id: number;
        text: string;
        parse_mode: string;
      };
      expect(body.parse_mode).toBe('HTML');
      expect(body.text).toContain('ROCKET');
      expect(body.text).toContain('$100');
      expect(body.text).toContain('id 42');
      expect(body.text).toContain('Место в матрице: 47');
      expect(body.text).toContain('cryptobot:abc123');
      expect(body.text).toContain('CryptoBot USDT');
    }
  });

  it('honours ADMIN_TG_IDS env override', async () => {
    process.env.ADMIN_TG_IDS = '10, 20';
    const calls: Array<{ chatId: number }> = [];
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(((init ?? {}) as { body?: string }).body ?? '{}');
      calls.push({ chatId: body.chat_id });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    await notifyAdminsOfPayment({
      method: 'platega',
      userId: 1,
      tariffCode: 'pro',
      entryUsd: 200,
      paymentRefId: 'platega:xyz',
    });

    expect(calls.map((c) => c.chatId).sort((a, b) => a - b)).toEqual([10, 20]);
  });

  it('is a no-op when BOT_TOKEN is missing', async () => {
    delete process.env.BOT_TOKEN;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await notifyAdminsOfPayment({
      method: 'cryptobot',
      userId: 1,
      tariffCode: 'rocket',
      entryUsd: 100,
      paymentRefId: 'cryptobot:1',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders an em-dash when matrixPosition is null/undefined', async () => {
    let captured = '';
    globalThis.fetch = vi.fn(async (_url: unknown, init: unknown) => {
      const body = JSON.parse(((init ?? {}) as { body?: string }).body ?? '{}');
      captured = body.text as string;
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    process.env.ADMIN_TG_IDS = '10';
    await notifyAdminsOfPayment({
      method: 'platega',
      userId: 9,
      tariffCode: 'rocket',
      entryUsd: 50,
      paymentRefId: 'platega:z',
      matrixPosition: null,
    });

    expect(captured).toContain('Место в матрице: —');
  });

  it('swallows fetch rejections (fire-and-forget contract)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network blew up');
    }) as unknown as typeof fetch;

    await expect(
      notifyAdminsOfPayment({
        method: 'cryptobot',
        userId: 1,
        tariffCode: 'rocket',
        entryUsd: 100,
        paymentRefId: 'cryptobot:1',
      }),
    ).resolves.toBeUndefined();
  });
});
