/**
 * Event reminder job — Phase 1B.
 *
 * Two responsibilities, in one tick every 10 minutes:
 *
 *   1. Schedule pass. For every published event where
 *      `starts_at - now` lands inside a ±window of 24h or 1h, insert a
 *      pending row in `scheduled_notifications` for each registered user
 *      who doesn't yet have a `event_reminders_sent` row with that kind.
 *      Windows are large enough (±20 min) that the 10-min tick reliably
 *      catches every event at least once per kind.
 *
 *   2. Drain pass. Pick up to BATCH due `scheduled_notifications` rows
 *      (status='pending', scheduled_at <= now, kind starts with 'event_'),
 *      send each via tgSendMessage, and stamp the row + an
 *      `event_reminders_sent` dedup record on success.
 *
 * Also covers "live" kind: when starts_at is within ±5 minutes we insert
 * an immediate 'live' notification. 'live' dedup is on the same unique
 * (event,user,kind) index so a second tick won't double-send.
 *
 * All state lives in the DB; the cron handler itself is stateless.
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  eventRegistrations,
  eventRemindersSent,
  events,
  scheduledNotifications,
  users,
} from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { tgSendMessage } from '../services/tg-send.js';
import { registerJob } from './scheduler.js';

type ReminderKind = '24h' | '1h' | 'live';

interface WindowDef {
  kind: ReminderKind;
  /** Center of the window, in minutes before starts_at. */
  leadMin: number;
  /** Half-width of the window, in minutes. */
  slackMin: number;
}

const WINDOWS: readonly WindowDef[] = [
  { kind: '24h', leadMin: 24 * 60, slackMin: 20 },
  { kind: '1h', leadMin: 60, slackMin: 20 },
  { kind: 'live', leadMin: 0, slackMin: 5 },
];

const DRAIN_BATCH = 100;

function renderText(row: {
  title: string;
  topic: string | null;
  startsAt: Date;
  joinUrl: string | null;
}, kind: ReminderKind, lang: string | null | undefined): string {
  // Phase 2B tone-of-voice copy. Kept concise so a long title still fits
  // well under Telegram's 4k cap. Localised to RU/EN based on
  // users.language_code; falls back to RU.
  const isRu = !lang || lang.toLowerCase().startsWith('ru');
  const whenMsk = row.startsAt.toLocaleString(isRu ? 'ru-RU' : 'en-GB', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const header = isRu
    ? (kind === 'live'
        ? '🔴 <b>Эфир GOLDEN_CONNECT начинается прямо сейчас</b>'
        : kind === '1h'
          ? '⏰ <b>Через час в эфире GOLDEN_CONNECT</b>'
          : '📅 <b>Завтра в эфире GOLDEN_CONNECT — не пропусти</b>')
    : (kind === 'live'
        ? '🔴 <b>A GOLDEN_CONNECT event is starting right now</b>'
        : kind === '1h'
          ? '⏰ <b>In one hour on GOLDEN_CONNECT</b>'
          : '📅 <b>Tomorrow on GOLDEN_CONNECT — don\'t miss it</b>');

  const timeLabel = isRu ? 'МСК' : 'MSK';
  const openLabel = isRu
    ? (kind === 'live' ? '▶️ Войти на эфир' : '▶️ Ссылка на эфир')
    : (kind === 'live' ? '▶️ Join now' : '▶️ Join link');
  const footer = isRu
    ? (kind === 'live'
        ? 'Заходи — мы уже начали.'
        : kind === '1h'
          ? 'Готовься, ссылка ниже.'
          : 'Пришлю ещё напоминание за час до старта.')
    : (kind === 'live'
        ? 'Jump in — we\'ve started.'
        : kind === '1h'
          ? 'Get ready — link below.'
          : 'I\'ll ping you again one hour before the start.');

  const lines: string[] = [header, '', `<b>${escapeHtml(row.title)}</b>`];
  if (row.topic) lines.push(escapeHtml(row.topic));
  lines.push('', `🕐 ${whenMsk} ${timeLabel}`);
  lines.push('', footer);
  if (row.joinUrl) {
    lines.push('', `<a href="${escapeHtml(row.joinUrl)}">${openLabel}</a>`);
  }
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function schedulePass(): Promise<void> {
  // Pull all published/live events starting in the next 25 hours — any
  // window we care about falls in that range.
  const now = new Date();
  const horizon = new Date(now.getTime() + 25 * 3600 * 1000);
  const upcoming = await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        sql`${events.startsAt} <= ${horizon.toISOString()}`,
        sql`${events.startsAt} >= ${new Date(now.getTime() - 10 * 60 * 1000).toISOString()}`,
      ),
    );

  for (const ev of upcoming) {
    for (const w of WINDOWS) {
      const target = new Date(ev.startsAt.getTime() - w.leadMin * 60 * 1000);
      const diffMs = Math.abs(target.getTime() - now.getTime());
      if (diffMs > w.slackMin * 60 * 1000) continue;

      // Find registered users who haven't received this kind yet.
      const regs = await db
        .select({ userId: eventRegistrations.userId })
        .from(eventRegistrations)
        .leftJoin(
          eventRemindersSent,
          and(
            eq(eventRemindersSent.eventId, ev.id),
            eq(eventRemindersSent.userId, eventRegistrations.userId),
            eq(eventRemindersSent.kind, w.kind),
          ),
        )
        .where(
          and(
            eq(eventRegistrations.eventId, ev.id),
            sql`${eventRemindersSent.id} IS NULL`,
          ),
        );

      if (regs.length === 0) continue;

      const kindTag = `event_${w.kind}`;
      const rows = regs.map((r) => ({
        userId: r.userId,
        kind: kindTag,
        scheduledAt: now,
        payload: { event_id: ev.id, reminder_kind: w.kind },
        status: 'pending' as const,
      }));

      // ON CONFLICT DO NOTHING leans on the partial unique index
      // (user_id, kind) WHERE status='pending' installed by Phase 0.
      // NOTE: our scheduled_notifications uniqueness isn't per-event —
      // it's per (user,kind). For event_24h that's fine because two
      // different events can't both be "24h from now" in the same 20-min
      // window for the same user in practice. If they are, one slips to
      // the next tick. Acceptable for Phase 1B.
      try {
        await db
          .insert(scheduledNotifications)
          .values(rows)
          .onConflictDoNothing();
      } catch (err) {
        logger.warn(
          { eventId: ev.id, kind: w.kind, err: (err as Error).message },
          'event-reminders: schedule insert failed (ignored)',
        );
      }
    }
  }
}

async function drainPass(): Promise<void> {
  const now = new Date();
  // Fetch due pending notifications of kind event_*. Drizzle's LIKE helper
  // takes a sql fragment here.
  const due = await db
    .select({
      id: scheduledNotifications.id,
      userId: scheduledNotifications.userId,
      kind: scheduledNotifications.kind,
      payload: scheduledNotifications.payload,
    })
    .from(scheduledNotifications)
    .where(
      and(
        eq(scheduledNotifications.status, 'pending'),
        lte(scheduledNotifications.scheduledAt, now),
        sql`${scheduledNotifications.kind} LIKE 'event_%'`,
      ),
    )
    .limit(DRAIN_BATCH);

  if (due.length === 0) return;

  for (const n of due) {
    const payload = (n.payload ?? {}) as { event_id?: number; reminder_kind?: ReminderKind };
    const eventId = payload.event_id;
    const reminderKind = payload.reminder_kind;
    if (!eventId || !reminderKind) {
      // Malformed row — mark failed so we don't loop on it.
      await db
        .update(scheduledNotifications)
        .set({ status: 'failed', error: 'bad_payload', attempts: sql`${scheduledNotifications.attempts} + 1` })
        .where(eq(scheduledNotifications.id, n.id));
      continue;
    }

    const ev = await db.query.events.findFirst({ where: eq(events.id, eventId) });
    const user = await db.query.users.findFirst({ where: eq(users.id, n.userId) });
    if (!ev || !user || user.tgId == null || user.isBlocked) {
      await db
        .update(scheduledNotifications)
        .set({
          status: 'skipped',
          error: !ev ? 'event_missing' : !user ? 'user_missing' : user.isBlocked ? 'user_blocked' : 'no_tg_id',
          attempts: sql`${scheduledNotifications.attempts} + 1`,
          sentAt: now,
        })
        .where(eq(scheduledNotifications.id, n.id));
      continue;
    }

    const text = renderText(
      {
        title: ev.title,
        topic: ev.topic,
        startsAt: ev.startsAt,
        joinUrl: ev.joinUrl,
      },
      reminderKind,
      user.languageCode,
    );
    const res = await tgSendMessage(user.tgId, text, {
      parseMode: 'HTML',
      disableWebPagePreview: false,
    });

    if (res.ok) {
      await db
        .update(scheduledNotifications)
        .set({
          status: 'sent',
          sentAt: new Date(),
          attempts: sql`${scheduledNotifications.attempts} + 1`,
        })
        .where(eq(scheduledNotifications.id, n.id));
      await db
        .insert(eventRemindersSent)
        .values({
          eventId,
          userId: n.userId,
          kind: reminderKind,
        })
        .onConflictDoNothing();
    } else if (res.blocked) {
      await db
        .update(scheduledNotifications)
        .set({
          status: 'skipped',
          error: 'bot_blocked',
          attempts: sql`${scheduledNotifications.attempts} + 1`,
          sentAt: new Date(),
        })
        .where(eq(scheduledNotifications.id, n.id));
    } else {
      await db
        .update(scheduledNotifications)
        .set({
          status: 'failed',
          error: res.error ?? 'send_failed',
          attempts: sql`${scheduledNotifications.attempts} + 1`,
        })
        .where(eq(scheduledNotifications.id, n.id));
    }
  }
}

async function run(): Promise<void> {
  await schedulePass();
  await drainPass();
}

registerJob({
  name: 'event-reminders',
  // Every 10 minutes. MSK tz isn't relevant for an interval expression but
  // kept consistent with other jobs.
  schedule: '*/10 * * * *',
  timezone: 'Europe/Moscow',
  handler: run,
});
