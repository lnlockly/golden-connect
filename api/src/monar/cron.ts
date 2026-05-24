// Cron jobs for Monar:
//   - abonentka (weekly fee) — every hour, dueCharges() picks lots that have
//     crossed their 7-day boundary
//   - world-pool settle — once a day at 03:00 UTC, settles the previous
//     month if it's the 1st of the month

import cron from 'node-cron';
import { ensureMonarTables } from './init-sql.js';
import { chargeAbonentkaDue, settleWorldPool } from './repo.js';
import { periodOf } from './world-pool.js';

const TZ = process.env.TZ || 'UTC';

let abonentkaTask: cron.ScheduledTask | null = null;
let poolTask: cron.ScheduledTask | null = null;

export async function startMonarCron(log: { info: (...a: any[]) => void; error: (...a: any[]) => void }) {
  try { await ensureMonarTables(log); } catch (err) { log.error({ err }, 'monar.tables.ensure.failed'); }

  // Hourly: charge abonentka.
  abonentkaTask = cron.schedule('0 * * * *', async () => {
    try {
      const out = await chargeAbonentkaDue();
      if (out.charged + out.failed > 0) {
        log.info({ ...out }, 'monar.abonentka.tick');
      }
    } catch (err) {
      log.error({ err }, 'monar.abonentka.failed');
    }
  }, { timezone: TZ });

  // Daily 03:00: if today is the 1st of the month, settle the previous month.
  poolTask = cron.schedule('0 3 * * *', async () => {
    const today = new Date();
    if (today.getUTCDate() !== 1) return;
    const prev = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 15);
    const period = periodOf(prev);
    try {
      const out = await settleWorldPool({ period });
      log.info({ ...out }, 'monar.world_pool.settle');
    } catch (err) {
      log.error({ err, period }, 'monar.world_pool.settle.failed');
    }
  }, { timezone: TZ });
}

export function stopMonarCron() {
  abonentkaTask?.stop();
  poolTask?.stop();
}
