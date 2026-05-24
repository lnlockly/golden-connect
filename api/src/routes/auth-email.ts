import { Hono, type Context } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { credentials, users } from '../db/schema.js';
import { env } from '../services/env.js';
import { sessionCookieName, sessionTtlSeconds, signSession } from '../services/jwt.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { attachInviter, generateRefCode } from '../services/users.js';
import { clientIp, rateLimit } from '../middleware/rateLimit.js';

const app = new Hono();

// Rate-limit auth endpoints: 10 attempts / IP / minute.
const authLimiter = rateLimit({
  key: (c) => `ip:${clientIp(c)}:${c.req.path}`,
  windowSec: 60,
  max: 10,
});
app.use('/auth/signup', authLimiter);
app.use('/auth/login', authLimiter);

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(6).max(128),
  ref_code: z.string().max(32).nullish(),
  turnstile_token: z.string().max(2048).nullish(),
});

async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  if (!env.turnstileSecret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.turnstileSecret,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data?.success);
  } catch {
    return false;
  }
}


const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(128),
});

function setSessionCookie(c: Context, token: string): void {
  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionTtlSeconds,
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  });
}

app.post('/auth/signup', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }
  if (env.turnstileSecret) {
    const ok = await verifyTurnstile(parsed.data.turnstile_token, clientIp(c));
    if (!ok) return c.json({ ok: false, error: "captcha_failed" }, 400);
  }
  const email = parsed.data.email.toLowerCase().trim();

  const existing = await db.query.credentials.findFirst({
    where: eq(credentials.email, email),
  });
  if (existing) {
    return c.json({ ok: false, error: 'email_taken' }, 409);
  }

  const passwordHash = hashPassword(parsed.data.password);

  // Create user + credentials in sequence (Drizzle postgres.js doesn't expose
  // interactive txns on every driver; we're fine — email unique covers races).
  let userId = 0;
  let userRefCode = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const refCode = generateRefCode(8);
    try {
      const [user] = await db.insert(users).values({ refCode }).returning();
      if (!user) throw new Error('insert user failed');
      userId = user.id;
      userRefCode = user.refCode;
      break;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('ref_code')) continue;
      throw e;
    }
  }
  if (!userId) {
    return c.json({ ok: false, error: 'ref_code_exhaustion' }, 500);
  }

  try {
    await db.insert(credentials).values({ userId, email, passwordHash });
  } catch (e: any) {
    // Race on unique(email) — undo user row so no orphan.
    await db.delete(users).where(eq(users.id, userId));
    const msg = String(e?.message ?? e);
    if (msg.includes('email') || msg.includes('unique')) {
      return c.json({ ok: false, error: 'email_taken' }, 409);
    }
    throw e;
  }

  await attachInviter(userId, parsed.data.ref_code ?? null);

  const token = signSession({ sub: userId, addr: null, tg: null });
  setSessionCookie(c, token);

  return c.json({
    ok: true,
    user: { id: userId, ref_code: userRefCode, email },
    token,
  });
});

app.post('/auth/login', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }
  const email = parsed.data.email.toLowerCase().trim();

  const cred = await db.query.credentials.findFirst({
    where: eq(credentials.email, email),
  });
  if (!cred) {
    return c.json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  if (!verifyPassword(parsed.data.password, cred.passwordHash)) {
    return c.json({ ok: false, error: 'invalid_credentials' }, 401);
  }

  const user = await db.query.users.findFirst({ where: eq(users.id, cred.userId) });
  if (!user) {
    return c.json({ ok: false, error: 'user_gone' }, 500);
  }

  const token = signSession({ sub: user.id, addr: null, tg: user.tgId ?? null });
  setSessionCookie(c, token);

  return c.json({
    ok: true,
    user: { id: user.id, ref_code: user.refCode, email, tg_id: user.tgId },
    token,
  });
});

export default app;
