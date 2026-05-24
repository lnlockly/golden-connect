import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { db } from '../db/client.js';
import { credentials } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { env } from '../services/env.js';
import { clientIp, rateLimit } from '../middleware/rateLimit.js';

const app = new Hono<{ Variables: AuthVars }>();

const verifyLimiter = rateLimit({
  key: (c) => `ip:${clientIp(c)}:send-verify`,
  windowSec: 60 * 15,
  max: 5,
});

async function sendVerifyEmail(to: string, link: string): Promise<boolean> {
  if (!env.resendApiKey) {
    console.log('[email-verify] NO_RESEND key — would send to ' + to + ': ' + link);
    return true;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.resendApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.emailFrom || 'Golden Connect <no-reply@goldenConnect.to>',
        to: [to],
        subject: 'Подтверждение email — Golden Connect',
        html:
          '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0A0E27;color:#fff;border-radius:12px">' +
          '<h2 style="color:#00D4FF;margin:0 0 16px">Подтверждение email</h2>' +
          '<p>Привет! Вы указали этот адрес при регистрации на Golden Connect.</p>' +
          '<p>Чтобы подтвердить — нажмите кнопку ниже:</p>' +
          '<p style="margin:24px 0"><a href="' + link + '" style="background:#00D4FF;color:#0A0E27;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Подтвердить email</a></p>' +
          '<p style="color:#A0A8D0;font-size:12px">Или перейдите по ссылке: <code style="color:#00D4FF">' + link + '</code></p>' +
          '<p style="color:#A0A8D0;font-size:12px;margin-top:24px">Если вы не регистрировались — просто проигнорируйте это письмо.</p>' +
          '</div>',
      }),
    });
    if (!res.ok) {
      console.error('[email-verify] resend failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[email-verify] resend error', e);
    return false;
  }
}

app.post('/auth/send-verify', requireAuth, verifyLimiter, async (c) => {
  const session = c.get('user');
  const [cred] = await db.select().from(credentials).where(eq(credentials.userId, session.id)).limit(1);
  if (!cred) return c.json({ ok: false, error: 'no_email_account' }, 404);
  if (cred.emailVerified) return c.json({ ok: true, already: true });

  if (cred.emailVerifySentAt && Date.now() - cred.emailVerifySentAt.getTime() < 60 * 1000) {
    return c.json({ ok: false, error: 'cooldown' }, 429);
  }

  const token = randomBytes(24).toString('base64url');
  await db
    .update(credentials)
    .set({ emailVerifyToken: token, emailVerifySentAt: new Date() })
    .where(eq(credentials.userId, session.id));

  const base = env.appPublicUrl || 'https://api.goldenConnect.to';
  const link = base + '/auth/verify?token=' + encodeURIComponent(token);
  const sent = await sendVerifyEmail(cred.email, link);

  return c.json({
    ok: true,
    sent,
    dev_link: env.resendApiKey ? undefined : link,
  });
});

app.get('/auth/verify', async (c) => {
  const token = c.req.query('token');
  if (!token || typeof token !== 'string') return c.text('invalid token', 400);
  const [cred] = await db
    .select()
    .from(credentials)
    .where(eq(credentials.emailVerifyToken, token))
    .limit(1);
  if (!cred) return c.text('token not found or already used', 404);

  if (cred.emailVerifySentAt && Date.now() - cred.emailVerifySentAt.getTime() > 24 * 60 * 60 * 1000) {
    return c.text('token expired', 410);
  }

  await db
    .update(credentials)
    .set({ emailVerified: true, emailVerifiedAt: new Date(), emailVerifyToken: null })
    .where(eq(credentials.id, cred.id));

  const landingOrigin = (env.allowedOrigins?.split(',')[0] || 'https://goldenConnect.to').trim();
  return c.redirect(landingOrigin + '/cabinet?verified=1', 302);
});

export default app;
