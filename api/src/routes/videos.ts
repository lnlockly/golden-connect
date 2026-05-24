import { Hono } from 'hono';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { videoComments, videoReactions, videos } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { ADMIN_REF_CODE, getUserById } from '../services/users.js';
import { env } from '../services/env.js';

async function isAdminUser(userId: number): Promise<boolean> {
  const record = await getUserById(userId);
  if (!record) return false;
  if (record.user.refCode === ADMIN_REF_CODE) return true;
  const addr = record.wallet?.address?.toLowerCase();
  if (addr && env.adminWallets.includes(addr)) return true;
  return false;
}

const videoInputSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.string().url().max(500),
  thumbnail_url: z.string().url().max(500).nullish(),
  duration_sec: z.number().int().nonnegative().max(36_000).nullish(),
  tags: z.array(z.string().max(64)).max(30).nullish(),
  is_published: z.boolean().optional(),
  order: z.number().int().optional(),
});

const videoPatchSchema = videoInputSchema.partial();

const commentSchema = z.object({
  text: z.string().min(1).max(2000),
});

const reactSchema = z.object({
  emoji: z.string().min(1).max(16),
});

function shapeVideo(row: typeof videos.$inferSelect) {
  return {
    id: Number(row.id),
    title: row.title,
    url: row.url,
    thumbnail_url: row.thumbnailUrl,
    duration_sec: row.durationSec,
    tags: row.tags ?? [],
    is_published: row.isPublished,
    order: row.order,
    created_at: row.createdAt,
  };
}

const app = new Hono<{ Variables: AuthVars }>();

/* -------------------- public list / detail -------------------- */

app.get('/videos', async (c) => {
  const rows = await db
    .select()
    .from(videos)
    .where(eq(videos.isPublished, true))
    .orderBy(asc(videos.order), desc(videos.createdAt));
  return c.json({ ok: true, videos: rows.map(shapeVideo) });
});

app.get('/videos/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);

  const row = await db.query.videos.findFirst({
    where: and(eq(videos.id, id), eq(videos.isPublished, true)),
  });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);

  const comments = await db
    .select()
    .from(videoComments)
    .where(eq(videoComments.videoId, id))
    .orderBy(desc(videoComments.createdAt))
    .limit(20);

  const reactionAgg = (await db.execute(sql`
    SELECT emoji, COUNT(*)::int AS count
    FROM video_reactions WHERE video_id = ${id}
    GROUP BY emoji
  `)) as Array<{ emoji: string; count: number }>;

  return c.json({
    ok: true,
    video: shapeVideo(row),
    comments: comments.map((cm) => ({
      id: Number(cm.id),
      video_id: Number(cm.videoId),
      user_id: cm.userId,
      text: cm.text,
      created_at: cm.createdAt,
    })),
    reactions: reactionAgg.map((r) => ({ emoji: r.emoji, count: Number(r.count) })),
  });
});

/* -------------------- user actions (auth) -------------------- */

app.use('/me/videos/*', requireAuth);

app.post('/me/videos/:id/comment', async (c) => {
  const session = c.get('user');
  const videoId = Number(c.req.param('id'));
  if (!Number.isFinite(videoId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const exists = await db.query.videos.findFirst({ where: eq(videos.id, videoId) });
  if (!exists) return c.json({ ok: false, error: 'video_not_found' }, 404);

  const [row] = await db
    .insert(videoComments)
    .values({ videoId, userId: session.id, text: parsed.data.text.trim() })
    .returning();

  return c.json({
    ok: true,
    comment: {
      id: Number(row!.id),
      video_id: Number(row!.videoId),
      user_id: row!.userId,
      text: row!.text,
      created_at: row!.createdAt,
    },
  });
});

app.delete('/me/videos/:id/comments/:commentId', async (c) => {
  const session = c.get('user');
  const commentId = Number(c.req.param('commentId'));
  if (!Number.isFinite(commentId)) return c.json({ ok: false, error: 'bad_id' }, 400);

  const row = await db.query.videoComments.findFirst({
    where: eq(videoComments.id, commentId),
  });
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  if (row.userId !== session.id) return c.json({ ok: false, error: 'forbidden' }, 403);

  await db.delete(videoComments).where(eq(videoComments.id, commentId));
  return c.json({ ok: true });
});

app.post('/me/videos/:id/react', async (c) => {
  const session = c.get('user');
  const videoId = Number(c.req.param('id'));
  if (!Number.isFinite(videoId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = reactSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const exists = await db.query.videos.findFirst({ where: eq(videos.id, videoId) });
  if (!exists) return c.json({ ok: false, error: 'video_not_found' }, 404);

  // Idempotent upsert on (video_id, user_id, emoji) — re-reacting same emoji
  // is a no-op that still returns 200.
  try {
    await db
      .insert(videoReactions)
      .values({ videoId, userId: session.id, emoji: parsed.data.emoji });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (!msg.includes('duplicate') && !msg.includes('unique')) throw e;
  }
  return c.json({ ok: true });
});

app.delete('/me/videos/:id/react/:emoji', async (c) => {
  const session = c.get('user');
  const videoId = Number(c.req.param('id'));
  if (!Number.isFinite(videoId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const emoji = decodeURIComponent(c.req.param('emoji'));
  await db
    .delete(videoReactions)
    .where(
      and(
        eq(videoReactions.videoId, videoId),
        eq(videoReactions.userId, session.id),
        eq(videoReactions.emoji, emoji),
      ),
    );
  return c.json({ ok: true });
});

/* -------------------- admin -------------------- */

app.use('/admin/videos', requireAuth);
app.use('/admin/videos/*', requireAuth);

app.post('/admin/videos', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = videoInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const [row] = await db
    .insert(videos)
    .values({
      title: parsed.data.title,
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnail_url ?? null,
      durationSec: parsed.data.duration_sec ?? null,
      tags: parsed.data.tags ?? null,
      isPublished: parsed.data.is_published ?? false,
      order: parsed.data.order ?? 0,
      createdByUserId: session.id,
    })
    .returning();

  return c.json({ ok: true, video: shapeVideo(row!) });
});

app.patch('/admin/videos/:id', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = videoPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const patch: Partial<typeof videos.$inferInsert> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.url !== undefined) patch.url = parsed.data.url;
  if (parsed.data.thumbnail_url !== undefined) patch.thumbnailUrl = parsed.data.thumbnail_url ?? null;
  if (parsed.data.duration_sec !== undefined) patch.durationSec = parsed.data.duration_sec ?? null;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags ?? null;
  if (parsed.data.is_published !== undefined) patch.isPublished = parsed.data.is_published;
  if (parsed.data.order !== undefined) patch.order = parsed.data.order;

  if (Object.keys(patch).length === 0) return c.json({ ok: false, error: 'empty_patch' }, 400);

  const [row] = await db.update(videos).set(patch).where(eq(videos.id, id)).returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, video: shapeVideo(row) });
});

/* -------------------- internal admin shortcuts (bot wizards) --------------------
 * Same rationale as promo: bot has no JWT, uses shared `x-goldenConnect-secret`.
 */

app.use('/internal/admin/videos*', requireInternalSecret);

app.get('/internal/admin/videos', async (c) => {
  const rows = await db
    .select()
    .from(videos)
    .orderBy(asc(videos.order), desc(videos.createdAt));
  return c.json({ ok: true, videos: rows.map(shapeVideo) });
});

app.post('/internal/admin/videos', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = videoInputSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const [row] = await db
    .insert(videos)
    .values({
      title: parsed.data.title,
      url: parsed.data.url,
      thumbnailUrl: parsed.data.thumbnail_url ?? null,
      durationSec: parsed.data.duration_sec ?? null,
      tags: parsed.data.tags ?? null,
      isPublished: parsed.data.is_published ?? false,
      order: parsed.data.order ?? 0,
      createdByUserId: null,
    })
    .returning();

  if (!row) return c.json({ ok: false, error: 'insert_failed' }, 500);
  return c.json({ ok: true, video: shapeVideo(row) });
});

app.patch('/internal/admin/videos/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = videoPatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  const patch: Partial<typeof videos.$inferInsert> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.url !== undefined) patch.url = parsed.data.url;
  if (parsed.data.thumbnail_url !== undefined) patch.thumbnailUrl = parsed.data.thumbnail_url ?? null;
  if (parsed.data.duration_sec !== undefined) patch.durationSec = parsed.data.duration_sec ?? null;
  if (parsed.data.tags !== undefined) patch.tags = parsed.data.tags ?? null;
  if (parsed.data.is_published !== undefined) patch.isPublished = parsed.data.is_published;
  if (parsed.data.order !== undefined) patch.order = parsed.data.order;
  if (Object.keys(patch).length === 0) return c.json({ ok: false, error: 'empty_patch' }, 400);

  const [row] = await db.update(videos).set(patch).where(eq(videos.id, id)).returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, video: shapeVideo(row) });
});

app.delete('/internal/admin/videos/:id', async (c) => {
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const [row] = await db.delete(videos).where(eq(videos.id, id)).returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true });
});

export default app;
