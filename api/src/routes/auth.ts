import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { env } from '../services/env.js';
import {
  consumeNonce,
  issueNonce,
  normalizeAddress,
  verifySiwe,
} from '../services/siwe.js';
import { attachInviter, findOrCreateUserByTg, findOrCreateUserByWallet } from '../services/users.js';
import { verifyTelegramInitData } from '../services/telegram.js';
import { sessionCookieName, sessionTtlSeconds, signSession } from '../services/jwt.js';

const app = new Hono();

const nonceSchema = z.object({
  address: z
    .string()
    .min(40)
    .max(64)
    .regex(/^0x[0-9a-fA-F]{40}$/, 'must be 0x-prefixed 20-byte hex'),
});

app.post('/auth/nonce', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = nonceSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_address' }, 400);
  }
  try {
    const { nonce, expiresAt } = await issueNonce(parsed.data.address);
    return c.json({ ok: true, nonce, expires_at: expiresAt.toISOString() });
  } catch (e) {
    console.error('[auth/nonce]', e);
    return c.json({ ok: false, error: 'server_error' }, 500);
  }
});

const verifySchema = z.object({
  message: z.string().min(1),
  signature: z.string().min(1),
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  ref_code: z.string().max(32).nullish(),
});

app.post('/auth/verify', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }
  const { message, signature, address, ref_code } = parsed.data;
  const normalized = normalizeAddress(address);

  // Verify SIWE message
  const verified = await verifySiwe({
    message,
    signature,
    expectedChainId: env.bscChainId,
  });
  if (!verified.ok) {
    return c.json({ ok: false, error: verified.reason }, 401);
  }
  if (normalizeAddress(verified.address) !== normalized) {
    return c.json({ ok: false, error: 'address_mismatch' }, 401);
  }

  // Consume nonce (must exist + not expired + not consumed)
  const nonceOk = await consumeNonce(normalized, verified.nonce);
  if (!nonceOk) {
    return c.json({ ok: false, error: 'nonce_invalid_or_expired' }, 401);
  }

  // Find or create user
  const { user, wallet } = await findOrCreateUserByWallet(normalized, verified.chainId);

  // Every user gets an inviter — real one by ref_code, or admin as fallback.
  await attachInviter(user.id, ref_code ?? null);

  // Issue JWT
  const token = signSession({
    sub: user.id,
    addr: wallet?.address ?? normalized,
    tg: user.tgId ?? null,
  });

  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionTtlSeconds,
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  });

  return c.json({
    ok: true,
    user: {
      id: user.id,
      ref_code: user.refCode,
      tg_id: user.tgId,
      tg_username: user.tgUsername,
      wallet: wallet?.address ?? normalized,
      chain_id: wallet?.chainId ?? verified.chainId,
    },
    token, // also returned for non-browser clients
  });
});

const tgSchema = z.object({
  init_data: z.string().min(1),
  ref_code: z.string().max(32).nullish(),
});

/**
 * POST /auth/telegram — Mini-App initData flow.
 * Body: { init_data: string, ref_code?: string }
 *   - init_data is the raw `Telegram.WebApp.initData` string.
 *   - validated via HMAC; user is looked up / created by tg_id.
 *   - ref_code optionally attaches an inviter on first signup.
 */
app.post('/auth/telegram', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = tgSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  // Prefer the BOT_TOKEN that the admin-notifier + auth-tg routes already use,
  // fall back to TELEGRAM_BOT_TOKEN for legacy envs.
  const botToken = env.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const verified = verifyTelegramInitData(parsed.data.init_data, botToken);
  if (!verified.ok) return c.json({ ok: false, error: verified.reason }, 401);

  const { user: tgUser, start_param } = verified;
  const user = await findOrCreateUserByTg(tgUser.id, tgUser.username ?? null);

  // attach inviter — ref_code from body first, then start_param
  const refCode = parsed.data.ref_code ?? start_param ?? null;
  await attachInviter(user.id, refCode);

  const token = signSession({
    sub: user.id,
    addr: null,
    tg: user.tgId ?? tgUser.id,
  });
  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionTtlSeconds,
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  });

  return c.json({
    ok: true,
    user: {
      id: user.id,
      ref_code: user.refCode,
      tg_id: user.tgId,
      tg_username: user.tgUsername,
    },
    token,
  });
});

app.post('/auth/logout', async (c) => {
  deleteCookie(c, sessionCookieName, {
    path: '/',
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  });
  return c.json({ ok: true });
});

export default app;
