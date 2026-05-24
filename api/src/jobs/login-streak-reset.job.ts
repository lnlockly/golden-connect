/**
 * Daily login_streak reset.
 *
 * Runs at 02:00 UTC every day. For users whose last_seen_at is older
 * than 1.5 days, reset login_streak = 0 (streak broken).
 *
 * This complements karma.trackLogin() which increments the streak
 * on each daily login. Without this reset, a user could leave for a
 * week and return with streak intact — defeats the engagement purpose.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const log = logger.child({ job: 'login-streak-reset' });

async function run(): Promise<void> {
  try {
    // First fetch users who will be reset, so we can notify them.
    const losers = (await db.execute(sql`
      SELECT id, login_streak FROM users
      WHERE login_streak > 0
        AND (last_seen_at IS NULL OR last_seen_at < NOW() - INTERVAL '36 hours')
    `)) as unknown as Array<{ id: number; login_streak: number }>;

    if (losers.length > 0) {
      const ids = losers.map(u => u.id);
      await db.execute(sql`UPDATE users SET login_streak = 0 WHERE id = ANY(${ids})`);
      log.info({ resetCount: losers.length }, 'login_streak reset');

      // Notify each user about lost streak (best-effort)
      try {
        const { sendNotification } = await import('../services/balances.js');
        for (const u of losers) {
          if (u.login_streak < 3) continue; // don't bother with tiny streaks
          await sendNotification({
            userId: u.id,
            kind: 'karma_streak_lost',
            title: '😔 Серия прервана',
            body: `Ты не зашёл в кабинет более 36 часов — серия из ${u.login_streak} дней сброшена.\n\nЗайди сегодня, чтобы начать новую и идти к +200 карма (7 дней).`,
          });
        }
      } catch (e: any) {
        log.warn({ err: e?.message }, 'streak-lost notifications failed (non-fatal)');
      }
    }
  } catch (e: any) {
    log.error({ err: e?.message }, 'login_streak job failed');
  }
}

registerJob({
  name: 'login-streak-reset',
  schedule: '0 2 * * *', // daily 02:00 UTC
  handler: run,
});

export default {};
