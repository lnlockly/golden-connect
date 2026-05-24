/**
 * Hourly recompute of expired streaks — zeros out any user whose
 * `user_streaks.last_action_at` is older than 48h (the same threshold the
 * register-action route uses to reset on the next action). Without this the
 * UI would show a non-zero streak until the user came back, which reads as
 * dishonest; the cron keeps the displayed number honest even for lapsed users.
 *
 * Runs at minute 5 so it interleaves with other top-of-hour jobs.
 */
import { registerJob } from './scheduler.js';
import { zeroExpiredStreaks } from '../services/gamification.js';
import { logger } from '../lib/logger.js';

registerJob({
  name: 'streak-recompute',
  schedule: '5 * * * *',
  handler: async () => {
    const count = await zeroExpiredStreaks();
    if (count > 0) {
      logger.info({ count }, 'streak-recompute: zeroed expired streaks');
    }
  },
});
