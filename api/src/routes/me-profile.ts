import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users, credentials } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVars }>();
app.use('/me/*', requireAuth);

const profileSchema = z.object({
  first_name: z.string().max(80).optional().nullable(),
  last_name: z.string().max(80).optional().nullable(),
  country: z.string().max(60).optional().nullable(),
  language_code: z.string().max(8).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
});

app.get('/me/onboarding', async (c) => {
  const session = c.get('user');
  const [u] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!u) return c.json({ ok: false, error: 'user_not_found' }, 404);
  const [cred] = await db.select().from(credentials).where(eq(credentials.userId, session.id)).limit(1);

  const profileDone =
    Boolean(u.profileFilledAt) ||
    (Boolean(u.firstName) && Boolean(u.country) && Boolean(u.languageCode));
  const channelsDone = Boolean(u.channelsJoinedAt);
  const hasTelegram = Boolean(u.tgId);
  const emailVerified = Boolean(cred?.emailVerified);
  const verifyDone = emailVerified && hasTelegram;

  return c.json({
    ok: true,
    profile: {
      first_name: u.firstName,
      last_name: u.lastName,
      country: u.country ?? null,
      language_code: u.languageCode ?? null,
      bio: u.bio ?? null,
      avatar_url: u.avatarUrl ?? null,
    },
    status: {
      profile_done: profileDone,
      channels_done: channelsDone,
      verify_done: verifyDone,
      email: cred?.email ?? null,
      email_verified: emailVerified,
      has_telegram: hasTelegram,
      tg_username: u.tgUsername ?? null,
    },
    steps_total: 3,
    steps_done: [profileDone, channelsDone, verifyDone].filter(Boolean).length,
  });
});

app.patch('/me/profile', async (c) => {
  const session = c.get('user');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }
  const patch: Record<string, unknown> = {};
  if (parsed.data.first_name !== undefined) patch.firstName = parsed.data.first_name || null;
  if (parsed.data.last_name !== undefined) patch.lastName = parsed.data.last_name || null;
  if (parsed.data.country !== undefined) patch.country = parsed.data.country || null;
  if (parsed.data.language_code !== undefined) patch.languageCode = parsed.data.language_code || null;
  if (parsed.data.bio !== undefined) patch.bio = parsed.data.bio || null;
  if (parsed.data.avatar_url !== undefined) patch.avatarUrl = parsed.data.avatar_url || null;

  const [existing] = await db.select().from(users).where(eq(users.id, session.id)).limit(1);
  if (!existing) return c.json({ ok: false, error: 'user_not_found' }, 404);

  const afterFirst = patch.firstName ?? existing.firstName;
  const afterCountry = patch.country ?? existing.country;
  const afterLang = patch.languageCode ?? existing.languageCode;
  if (afterFirst && afterCountry && afterLang && !existing.profileFilledAt) {
    patch.profileFilledAt = new Date();
  }

  await db.update(users).set(patch).where(eq(users.id, session.id));
  return c.json({ ok: true });
});

app.post('/me/channels-joined', async (c) => {
  const session = c.get('user');
  await db
    .update(users)
    .set({ channelsJoinedAt: new Date() })
    .where(eq(users.id, session.id));
  return c.json({ ok: true });
});

export default app;
