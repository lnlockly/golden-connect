/**
 * Streak warning — daily 19:00 UTC (22:00 MSK).
 *
 * Finds users whose streak is >0 and last_seen_at is between 24-30 hours
 * ago (i.e., they're about to lose their streak in 6 hours). Sends a
 * gentle nudge via the inbox+bot pipeline.
 *
 * Throttle: same user notified at most once per streak break window.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sendNotification } from '../services/balances.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const log = logger.child({ job: 'streak-warning' });

async function run(): Promise<void> {
  try {
    const at_risk = (await db.execute(sql`
      SELECT id, login_streak, last_seen_at
      FROM users
      WHERE login_streak >= 3
        AND last_seen_at IS NOT NULL
        AND last_seen_at < NOW() - INTERVAL '24 hours'
        AND last_seen_at > NOW() - INTERVAL '32 hours'
    `)) as unknown as Array<{ id: number; login_streak: number; last_seen_at: Date }>;

    log.info({ count: at_risk.length }, 'streak-warning: dispatching nudges');

    for (const u of at_risk) {
      const next = u.login_streak < 7 ? 7 : u.login_streak < 14 ? 14 : u.login_streak < 30 ? 30 : (u.login_streak + 1);
      const reward = u.login_streak < 7 ? '+200' : u.login_streak < 14 ? '+500' : u.login_streak < 30 ? '+1500' : '+50';
      try {
        await sendNotification({
          userId: u.id,
          kind: 'karma_streak_warning',
          title: `⏰ Серия ${u.login_streak} дней под угрозой`,
          body: `Зайди сегодня в кабинет, чтобы сохранить серию.\n\nСледующая цель: ${next} дней → ${reward} карма.\n\ngolden-connect.to/cabinet`,
        });
      } catch (e: any) {
        log.warn({ userId: u.id, err: e?.message }, 'streak warning failed');
      }
    }
  } catch (e: any) {
    log.error({ err: e?.message }, 'streak-warning job failed');
  }
}

registerJob({
  name: 'streak-warning',
  schedule: '0 19 * * *', // daily 19:00 UTC = 22:00 MSK
  handler: run,
});

export default {};
