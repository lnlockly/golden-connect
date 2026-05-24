import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tgLoginTokens, users } from '../db/schema.js';
import { env } from '../services/env.js';
import { sessionCookieName, sessionTtlSeconds, signSession } from '../services/jwt.js';
import { findOrCreateUserByTg } from '../services/users.js';
import { safeEqual } from '../middleware/internal.js';

const app = new Hono();

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 min

function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? 'Golden Connectrobot';
}

async function gcExpired(): Promise<void> {
  try {
    await db.delete(tgLoginTokens).where(lt(tgLoginTokens.expiresAt, new Date()));
  } catch {
    /* best-effort */
  }
}

app.post('/auth/tg-login-init', async (c) => {
  await gcExpired();
  const token = randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db.insert(tgLoginTokens).values({ token, expiresAt });
  return c.json({
    ok: true,
    token,
    bot_link: `https://t.me/${botUsername()}?start=login_${token}`,
    expires_at: expiresAt.toISOString(),
  });
});

const verifySchema = z.object({
  token: z.string().min(16).max(128),
  tg_id: z.number().int().positive(),
  tg_username: z.string().max(64).nullish(),
});

/**
 * Internal endpoint — called by the bot when a user opens
 * `/start login_<token>`. Stamps the token with the TG identity. Later the
 * client polls /auth/tg-login-claim to swap token → JWT.
 */
app.post('/auth/tg-link-verify', async (c) => {
  const secret = c.req.header('x-goldenConnect-secret') ?? '';
  if (!env.internalSecret || !safeEqual(secret, env.internalSecret)) {
    return c.json({ ok: false, error: 'forbidden' }, 403);
  }
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

  const row = await db.query.tgLoginTokens.findFirst({
    where: eq(tgLoginTokens.token, parsed.data.token),
  });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  if (row.expiresAt < new Date()) {
    await db.delete(tgLoginTokens).where(eq(tgLoginTokens.token, row.token));
    return c.json({ ok: false, error: 'expired' }, 410);
  }

  await db
    .update(tgLoginTokens)
    .set({
      tgId: parsed.data.tg_id,
      tgUsername: parsed.data.tg_username ?? null,
      claimedAt: new Date(),
    })
    .where(eq(tgLoginTokens.token, row.token));

  return c.json({ ok: true });
});

const claimSchema = z.object({ token: z.string().min(16).max(128) });

/**
 * Called by the landing client after the user opens the bot link. When the
 * token has a tg_id stamped on it (from tg-link-verify), we resolve the
 * matching user (create if needed) and issue a JWT. One-shot — the token
 * row is deleted on success.
 */
app.post('/auth/tg-login-claim', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = claimSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }

  const row = await db.query.tgLoginTokens.findFirst({
    where: eq(tgLoginTokens.token, parsed.data.token),
  });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  if (row.expiresAt < new Date()) {
    await db.delete(tgLoginTokens).where(eq(tgLoginTokens.token, row.token));
    return c.json({ ok: false, error: 'expired' }, 410);
  }
  if (!row.claimedAt || !row.tgId) {
    return c.json({ ok: true, pending: true });
  }

  const user = await findOrCreateUserByTg(row.tgId, row.tgUsername ?? null);

  // Delete the token — one-shot.
  await db.delete(tgLoginTokens).where(eq(tgLoginTokens.token, row.token));

  const token = signSession({ sub: user.id, addr: null, tg: user.tgId ?? row.tgId });
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

export default app;
