/**
 * Weekly digest job — Phase 1B.
 *
 * Runs every Monday at 09:00 Europe/Moscow. Active users (joined > 24h
 * ago, not blocked, with a tg_id) receive a digest:
 *   • top-3 referrers of the previous ISO week (by new direct joins)
 *   • next upcoming events
 *   • "new on the platform" — placeholder bullet list, replaced in Ph 2
 *
 * Dedup: `digest_log` has PK (user_id, week_start). We compute week_start
 * as the UTC Monday of the CURRENT tick — i.e. "this week". Subsequent
 * retries within the same week are no-ops.
 */
import { and, asc, eq, gt, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  digestLog,
  events,
  inviteEdges,
  users,
} from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { tgSendMessage } from '../services/tg-send.js';
import { registerJob } from './scheduler.js';

/**
 * Returns the UTC Monday at 00:00 of the week containing `d`. ISO week
 * convention — Monday is day 1, Sunday is day 7.
 */
function utcMondayOf(d: Date): Date {
  const base = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = base.getUTCDay(); // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  const offset = dow === 0 ? -6 : 1 - dow;
  base.setUTCDate(base.getUTCDate() + offset);
  return base;
}

function formatMsk(d: Date): string {
  return d.toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface TopReferrer {
  userId: number;
  displayName: string;
  count: number;
}

async function fetchTopReferrers(weekStart: Date, weekEnd: Date): Promise<TopReferrer[]> {
  const rows = await db
    .select({
      parentUserId: inviteEdges.parentUserId,
      count: sql<number>`COUNT(*)::int`,
      firstName: users.firstName,
      tgUsername: users.tgUsername,
    })
    .from(inviteEdges)
    .innerJoin(users, eq(users.id, inviteEdges.parentUserId))
    .where(
      and(
        gte(inviteEdges.createdAt, weekStart),
        sql`${inviteEdges.createdAt} < ${weekEnd}`,
      ),
    )
    .groupBy(inviteEdges.parentUserId, users.firstName, users.tgUsername)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(3);

  return rows.map((r) => ({
    userId: r.parentUserId,
    displayName: r.tgUsername ? `@${r.tgUsername}` : r.firstName || `#${r.parentUserId}`,
    count: r.count,
  }));
}

async function fetchUpcomingEvents(limit = 3) {
  return await db
    .select()
    .from(events)
    .where(
      and(
        inArray(events.status, ['published', 'live']),
        gt(events.startsAt, new Date()),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);
}

function renderDigest(
  lang: string | null | undefined,
  top: TopReferrer[],
  upcoming: Array<{ title: string; startsAt: Date }>,
): string {
  const isRu = (lang ?? '').toLowerCase().startsWith('ru') || !lang;
  const lines: string[] = [];
  if (isRu) {
    lines.push('📊 <b>GOLDEN_CONNECT · Итоги недели</b>');
    lines.push('');
    if (top.length) {
      lines.push('<b>🏆 Топ-3 партнёра недели</b>');
      top.forEach((t, i) =>
        lines.push(`${i + 1}. ${escapeHtml(t.displayName)} — ${t.count} реф.`),
      );
      lines.push('');
    }
    if (upcoming.length) {
      lines.push('<b>📅 На этой неделе в эфирах</b>');
      upcoming.forEach((e) =>
        lines.push(`• ${formatMsk(e.startsAt)} МСК — ${escapeHtml(e.title)}`),
      );
      lines.push('');
    }
    lines.push('<b>✨ Что нового на платформе</b>');
    lines.push('• Обновили линейку тарифов (от free до royal)');
    lines.push('• Запустили живые эфиры с напоминаниями за 24 часа и за час');
    lines.push('• Включили челлендж «Invite 10 за 30 дней» — участвуй из кабинета');
    lines.push('');
    lines.push('Открой /start → «Моя команда», чтобы посмотреть свой прогресс, или /events — все ближайшие эфиры.');
  } else {
    lines.push('📊 <b>GOLDEN_CONNECT · Week recap</b>');
    lines.push('');
    if (top.length) {
      lines.push('<b>🏆 Top-3 partners of the week</b>');
      top.forEach((t, i) =>
        lines.push(`${i + 1}. ${escapeHtml(t.displayName)} — ${t.count} ref.`),
      );
      lines.push('');
    }
    if (upcoming.length) {
      lines.push("<b>📅 This week's events</b>");
      upcoming.forEach((e) =>
        lines.push(`• ${formatMsk(e.startsAt)} MSK — ${escapeHtml(e.title)}`),
      );
      lines.push('');
    }
    lines.push("<b>✨ What's new on the platform</b>");
    lines.push('• Refreshed tariff line-up (from free to royal)');
    lines.push('• Launched live events with 24h + 1h reminders');
    lines.push('• Running the "Invite 10 in 30 days" challenge — join from your cabinet');
    lines.push('');
    lines.push('Open /start → "My team" to check your progress, or /events to see what\'s coming up.');
  }
  return lines.join('\n');
}

async function run(): Promise<void> {
  const now = new Date();
  const weekStart = utcMondayOf(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 3600 * 1000);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 3600 * 1000);

  const top = await fetchTopReferrers(prevWeekStart, weekStart);
  const upcoming = await fetchUpcomingEvents();

  // Candidate set — joined > 24h ago, not blocked, has tg_id, and NO
  // digest_log row for this week_start yet. `week_start` is a DATE
  // column; we pass the UTC date string to avoid TZ drift.
  const weekStartDate = weekStart.toISOString().slice(0, 10);
  const cutoff = new Date(now.getTime() - 24 * 3600 * 1000);

  const candidates = await db.execute(sql`
    SELECT u.id, u.tg_id, u.language_code
    FROM users u
    LEFT JOIN digest_log d
      ON d.user_id = u.id AND d.week_start = ${weekStartDate}::date
    WHERE u.is_blocked = FALSE
      AND u.tg_id IS NOT NULL
      AND u.joined_at <= ${cutoff}
      AND d.user_id IS NULL
    LIMIT 2000
  `);

  for (const r of candidates as unknown as Array<{
    id: number;
    tg_id: number | null;
    language_code: string | null;
  }>) {
    if (!r.tg_id) continue;
    const text = renderDigest(r.language_code, top, upcoming);
    const res = await tgSendMessage(r.tg_id, text, {
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });
    if (res.ok || res.blocked) {
      try {
        await db.insert(digestLog).values({
          userId: r.id,
          weekStart: weekStartDate,
        });
      } catch (err) {
        // PK conflict — another tick raced us. Fine.
        logger.debug(
          { userId: r.id, err: (err as Error).message },
          'weekly-digest: log insert conflict',
        );
      }
    } else {
      logger.warn(
        { userId: r.id, err: res.error },
        'weekly-digest: send failed',
      );
    }
  }
}

registerJob({
  name: 'weekly-digest',
  // Monday 09:00 MSK.
  schedule: '0 9 * * 1',
  timezone: 'Europe/Moscow',
  handler: run,
});
