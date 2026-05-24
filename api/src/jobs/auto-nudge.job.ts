/**
 * Auto-nudge job — Phase 1B.
 *
 * Runs every day at 10:00 Europe/Moscow. Picks users who have been in
 * the system > 3 days and still haven't:
 *   • paid for a booking, and
 *   • invited a single referral, and
 *   • the drip has either finished OR its last step was >2 days ago.
 *
 * For each hit we send at most one "soft" nudge per `nudge_kind` per
 * UTC-day (enforced by a partial unique index in schema). We also
 * rate-limit at the application level: no same-kind nudge within 3 days
 * on the same user (cheaper to skip in a query than to rely on the day
 * unique alone).
 *
 * Phase 1B only defines ONE nudge kind — 'stuck_no_action'. Later phases
 * can register more kinds and share the same log.
 */
import { and, desc, eq, isNotNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  bookings,
  dripState,
  inviteEdges,
  nudgeLog,
  users,
} from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { tgSendMessage } from '../services/tg-send.js';
import { registerJob } from './scheduler.js';

const NUDGE_KIND = 'stuck_no_action';
const NUDGE_COOLDOWN_DAYS = 3;

function renderNudge(lang: string | null | undefined): string {
  // Soft, non-pushy nudge for users who joined >3 days ago and still have
  // no booking / no referrals. Tone: friendly check-in, one clear next
  // step, short. Localised RU/EN; falls back to RU.
  const c = (lang ?? '').toLowerCase();
  if (!c || c.startsWith('ru')) {
    return [
      '👋 Привет, давно не виделись!',
      '',
      'Ты уже несколько дней в TRENDEX, но пока не сделал(а) ни одного бронирования и не пригласил(а) друзей. Может что-то непонятно или не хватило времени?',
      '',
      'Загляни в /start — внутри короткий путь: открыть кабинет, посмотреть тарифы, получить свою ссылку. Если остались вопросы — просто напиши сюда, помогу разобраться.',
    ].join('\n');
  }
  return [
    '👋 Hey, long time no see!',
    '',
    "You've been in TRENDEX for a few days but haven't made a single booking or invited anyone yet. Something unclear, or just busy?",
    '',
    "Open /start — the short path is right there: open the cabinet, check tariffs, grab your link. Got questions? Just drop them here and I'll help.",
  ].join('\n');
}

async function run(): Promise<void> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
  const cooldownCutoff = new Date(
    now.getTime() - NUDGE_COOLDOWN_DAYS * 24 * 3600 * 1000,
  );

  // Find users joined > 3 days ago, not blocked, with a tg_id. Left-join
  // bookings + invite_edges + drip_state + last nudge so we can filter
  // in a single pass.
  const rows = await db.execute(sql`
    SELECT
      u.id AS user_id,
      u.tg_id,
      u.language_code,
      COALESCE(b.paid_count, 0)::int      AS paid_bookings,
      COALESCE(r.child_count, 0)::int     AS direct_referrals,
      d.completed_at                      AS drip_completed_at,
      d.last_step_at                      AS drip_last_step_at,
      n.last_sent_at                      AS last_nudge_at
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS paid_count
      FROM bookings
      WHERE status = 'paid'
      GROUP BY user_id
    ) b ON b.user_id = u.id
    LEFT JOIN (
      SELECT parent_user_id AS user_id, COUNT(*) AS child_count
      FROM invite_edges
      GROUP BY parent_user_id
    ) r ON r.user_id = u.id
    LEFT JOIN drip_state d ON d.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MAX(sent_at) AS last_sent_at
      FROM nudge_log
      WHERE nudge_kind = ${NUDGE_KIND}
      GROUP BY user_id
    ) n ON n.user_id = u.id
    WHERE u.joined_at <= ${threeDaysAgo}
      AND u.is_blocked = FALSE
      AND u.tg_id IS NOT NULL
      AND COALESCE(b.paid_count, 0) = 0
      AND COALESCE(r.child_count, 0) = 0
      AND (
        d.completed_at IS NOT NULL
        OR (d.last_step_at IS NOT NULL AND d.last_step_at <= ${twoDaysAgo})
      )
      AND (
        n.last_sent_at IS NULL
        OR n.last_sent_at <= ${cooldownCutoff}
      )
    LIMIT 500
  `);

  for (const r of rows as unknown as Array<{
    user_id: number;
    tg_id: number | null;
    language_code: string | null;
  }>) {
    if (!r.tg_id) continue;
    const text = renderNudge(r.language_code);
    const res = await tgSendMessage(r.tg_id, text, {
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });

    if (res.ok || res.blocked) {
      try {
        await db.insert(nudgeLog).values({
          userId: r.user_id,
          nudgeKind: NUDGE_KIND,
          reason: 'no_booking_no_refs',
        });
      } catch (err) {
        // Unique-per-day conflict → already logged today. Fine.
        logger.debug(
          { userId: r.user_id, err: (err as Error).message },
          'auto-nudge: log insert conflict (already sent today)',
        );
      }
    } else {
      logger.warn(
        { userId: r.user_id, err: res.error },
        'auto-nudge: send failed',
      );
    }
  }

  // Hush unused imports kept for future filters.
  void and;
  void eq;
  void isNotNull;
  void lte;
  void or;
  void desc;
  void bookings;
  void inviteEdges;
  void dripState;
  void users;
}

registerJob({
  name: 'auto-nudge',
  // Daily at 10:00 MSK.
  schedule: '0 10 * * *',
  timezone: 'Europe/Moscow',
  handler: run,
});
