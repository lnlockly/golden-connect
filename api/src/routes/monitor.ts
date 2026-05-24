import { Hono } from 'hono';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { chatEvents, monitoredChats } from '../db/schema.js';
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

const TRACKING_VALUES = ['members', 'activity', 'all'] as const;
const EVENT_TYPES = ['message', 'join', 'leave', 'ban'] as const;

const addChatSchema = z.object({
  chat_id: z.number().int(),
  chat_title: z.string().max(200).nullish(),
  tracking: z.enum(TRACKING_VALUES).default('all'),
});

const eventSchema = z.object({
  chat_id: z.number().int(),
  event_type: z.enum(EVENT_TYPES),
  user_id_tg: z.number().int().nullish(),
  username: z.string().max(120).nullish(),
  payload: z.unknown().nullish(),
});

const app = new Hono<{ Variables: AuthVars }>();

/* -------------------- admin CRUD -------------------- */

app.use('/admin/monitor/*', requireAuth);

app.post('/admin/monitor/chats', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = addChatSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  try {
    const [row] = await db
      .insert(monitoredChats)
      .values({
        chatId: parsed.data.chat_id,
        chatTitle: parsed.data.chat_title ?? null,
        addedByUserId: session.id,
        tracking: parsed.data.tracking,
        active: true,
      })
      .returning();
    return c.json({ ok: true, chat: row });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      // Idempotent: flip active back on if it was soft-disabled.
      const [row] = await db
        .update(monitoredChats)
        .set({
          chatTitle: parsed.data.chat_title ?? null,
          tracking: parsed.data.tracking,
          active: true,
        })
        .where(eq(monitoredChats.chatId, parsed.data.chat_id))
        .returning();
      return c.json({ ok: true, chat: row });
    }
    throw e;
  }
});

app.delete('/admin/monitor/chats/:chat_id', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const chatId = Number(c.req.param('chat_id'));
  if (!Number.isFinite(chatId)) return c.json({ ok: false, error: 'bad_id' }, 400);

  // Soft-delete: preserve history; just flip `active` off so the monitor
  // middleware stops forwarding events.
  const [row] = await db
    .update(monitoredChats)
    .set({ active: false })
    .where(eq(monitoredChats.chatId, chatId))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true });
});

app.get('/admin/monitor/chats', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const rows = await db.select().from(monitoredChats);
  return c.json({ ok: true, chats: rows });
});

app.get('/admin/monitor/chats/:chat_id/stats', async (c) => {
  const session = c.get('user');
  if (!(await isAdminUser(session.id))) return c.json({ ok: false, error: 'forbidden' }, 403);
  const chatId = Number(c.req.param('chat_id'));
  if (!Number.isFinite(chatId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  const periodRaw = c.req.query('period') ?? '7d';
  // Accept `1d` .. `90d` — anything else falls back to 7d so a typo doesn't 500.
  const m = /^(\d+)d$/.exec(periodRaw);
  const days = m ? Math.min(90, Math.max(1, Number(m[1]))) : 7;

  const rows = (await db.execute(sql`
    SELECT
      date_trunc('day', created_at) AS day,
      event_type,
      COUNT(*)::int AS count
    FROM chat_events
    WHERE chat_id = ${chatId}
      AND created_at >= now() - ${sql.raw(`INTERVAL '${days} days'`)}
    GROUP BY 1, 2
    ORDER BY 1 ASC
  `)) as Array<{ day: string; event_type: string; count: number }>;

  return c.json({
    ok: true,
    chat_id: chatId,
    period_days: days,
    stats: rows.map((r) => ({ day: r.day, event_type: r.event_type, count: Number(r.count) })),
  });
});

/* -------------------- internal (bot middleware forwards here) -------------------- */

/* -------------------- internal admin shortcuts (bot wizards) -------------------- */

app.use('/internal/admin/monitor/*', requireInternalSecret);

app.get('/internal/admin/monitor/chats', async (c) => {
  const rows = await db.select().from(monitoredChats);
  return c.json({ ok: true, chats: rows });
});

app.post('/internal/admin/monitor/chats', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = addChatSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  try {
    const [row] = await db
      .insert(monitoredChats)
      .values({
        chatId: parsed.data.chat_id,
        chatTitle: parsed.data.chat_title ?? null,
        addedByUserId: null,
        tracking: parsed.data.tracking,
        active: true,
      })
      .returning();
    return c.json({ ok: true, chat: row });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('duplicate') || msg.includes('unique')) {
      // Idempotent: re-enable + update settings.
      const [row] = await db
        .update(monitoredChats)
        .set({
          chatTitle: parsed.data.chat_title ?? null,
          tracking: parsed.data.tracking,
          active: true,
        })
        .where(eq(monitoredChats.chatId, parsed.data.chat_id))
        .returning();
      return c.json({ ok: true, chat: row });
    }
    throw e;
  }
});

app.delete('/internal/admin/monitor/chats/:chat_id', async (c) => {
  const chatId = Number(c.req.param('chat_id'));
  if (!Number.isFinite(chatId)) return c.json({ ok: false, error: 'bad_id' }, 400);
  // Soft-delete: keep history, flip `active` off.
  const [row] = await db
    .update(monitoredChats)
    .set({ active: false })
    .where(eq(monitoredChats.chatId, chatId))
    .returning();
  if (!row) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true });
});

app.post('/internal/monitor/event', requireInternalSecret, async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);

  // Filter: only log if the chat is actively monitored AND the `tracking`
  // setting covers this event type. Cheap — single indexed lookup.
  const chat = await db.query.monitoredChats.findFirst({
    where: eq(monitoredChats.chatId, parsed.data.chat_id),
  });
  if (!chat || !chat.active) return c.json({ ok: true, skipped: 'not_monitored' });

  const isMemberEvent = parsed.data.event_type === 'join' || parsed.data.event_type === 'leave' || parsed.data.event_type === 'ban';
  const isActivityEvent = parsed.data.event_type === 'message';
  if (chat.tracking === 'members' && !isMemberEvent) return c.json({ ok: true, skipped: 'tracking_members' });
  if (chat.tracking === 'activity' && !isActivityEvent) return c.json({ ok: true, skipped: 'tracking_activity' });

  await db.insert(chatEvents).values({
    chatId: parsed.data.chat_id,
    eventType: parsed.data.event_type,
    userIdTg: parsed.data.user_id_tg ?? null,
    username: parsed.data.username ?? null,
    payload: (parsed.data.payload as any) ?? null,
  });

  return c.json({ ok: true });
});

export default app;
