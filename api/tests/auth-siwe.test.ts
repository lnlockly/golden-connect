import { describe, expect, it, beforeAll } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweMessage } from 'siwe';

const hasDb = !!process.env.DATABASE_URL && !!process.env.AUTH_JWT_SECRET;
const d = hasDb ? describe : describe.skip;

d('SIWE end-to-end (requires DATABASE_URL + AUTH_JWT_SECRET)', () => {
  let createApp: () => any;

  beforeAll(async () => {
    const mod = await import('../src/server.js');
    createApp = mod.createApp;
  });

  it('nonce → verify → /me happy path', { timeout: 30_000 }, async () => {
    const app = createApp();
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const address = account.address;

    // 1. Issue nonce
    const nonceRes = await app.request('/auth/nonce', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    expect(nonceRes.status).toBe(200);
    const nonceJson = (await nonceRes.json()) as { nonce: string };
    expect(typeof nonceJson.nonce).toBe('string');

    // 2. Build SIWE message and sign it
    const siwe = new SiweMessage({
      domain: 'goldenConnect.ai',
      address,
      statement: 'Sign in to Golden Connect',
      uri: 'https://goldenConnect.ai',
      version: '1',
      chainId: Number(process.env.BSC_CHAIN_ID ?? 56),
      nonce: nonceJson.nonce,
      issuedAt: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    const message = siwe.prepareMessage();
    const signature = await account.signMessage({ message });

    // 3. Verify
    const verifyRes = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, signature, message }),
    });
    expect(verifyRes.status).toBe(200);
    const setCookie = verifyRes.headers.get('set-cookie');
    expect(setCookie).toContain('af_session=');
    const verifyJson = (await verifyRes.json()) as any;
    expect(verifyJson.ok).toBe(true);
    expect(verifyJson.user.wallet.toLowerCase()).toBe(address.toLowerCase());
    expect(typeof verifyJson.token).toBe('string');

    // 4. /me with bearer
    const meRes = await app.request('/me', {
      headers: { authorization: `Bearer ${verifyJson.token}` },
    });
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as any;
    expect(meJson.ok).toBe(true);
    expect(meJson.wallet.address.toLowerCase()).toBe(address.toLowerCase());
    expect(meJson.balance_micro).toBe('0');
    expect(meJson.invited_by).toBeNull();

    // 5. Nonce is single-use — second verify with same message must fail
    const replayRes = await app.request('/auth/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, signature, message }),
    });
    expect([401, 400]).toContain(replayRes.status);
  });
});
