import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { logger } from '../lib/logger.js';

const app = new Hono();

app.use('/internal/users/update-tg-profile', requireInternalSecret);

const bodySchema = z.object({
  tg_id: z.union([z.number(), z.string()]),
  avatar_url: z.string().url().optional().nullable(),
  first_name: z.string().max(120).optional().nullable(),
  last_name: z.string().max(120).optional().nullable(),
  username: z.string().max(64).optional().nullable(),
});

app.post('/internal/users/update-tg-profile', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const tgId = String(parsed.data.tg_id);
  const av = parsed.data.avatar_url || null;
  const fn = parsed.data.first_name || null;
  const ln = parsed.data.last_name || null;
  const un = parsed.data.username || null;

  if (!av && !fn && !ln && !un) return c.json({ ok: true, updated: 0 });

  try {
    // Use drizzle sql template with COALESCE — preserves existing values when new is null
    const r = (await db.execute(sql`
      UPDATE users SET
        avatar_url = COALESCE(${av}, avatar_url),
        tg_username = COALESCE(${un}, tg_username),
        first_name = CASE WHEN COALESCE(NULLIF(first_name, ''), '') = '' THEN COALESCE(${fn}, first_name) ELSE first_name END,
        last_name = CASE WHEN COALESCE(NULLIF(last_name, ''), '') = '' THEN COALESCE(${ln}, last_name) ELSE last_name END
      WHERE tg_id = ${tgId}
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    logger.info({ tgId, updated: r.length }, 'tg-profile synced');
    return c.json({ ok: true, updated: r.length, user_ids: r.map(x => Number(x.id)) });
  } catch (e: any) {
    logger.error({ err: e?.message, tgId }, 'tg-profile sync failed');
    return c.json({ ok: false, error: e.message }, 500);
  }
});

export default app;
