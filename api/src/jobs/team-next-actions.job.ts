/**
 * Daily 20:00 MSK: compute the "who to contact tomorrow" feed for every
 * active partner and (if new items were queued) schedule a notification
 * to open their /team dashboard.
 */
import { db } from '../db/client.js';
import { scheduledNotifications } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';
import * as TeamRepo from '../repos/team.js';
import { computeNextActionsForOwner } from '../services/team-actions.js';

const log = logger.child({ module: 'team-next-actions' });

async function runOnce(): Promise<void> {
  const owners = await TeamRepo.listActiveReferrers();
  if (owners.length === 0) {
    log.debug('no active referrers');
    return;
  }

  let totalQueued = 0;
  let notified = 0;
  for (const o of owners) {
    let queued = 0;
    try {
      queued = await computeNextActionsForOwner(o.referrer_id);
    } catch (err) {
      log.warn(
        { err: (err as Error).message, ownerId: o.referrer_id },
        'compute failed for owner',
      );
      continue;
    }
    totalQueued += queued;
    if (queued === 0) continue;
    if (o.tg_id === null) continue;
    try {
      await db.insert(scheduledNotifications).values({
        userId: o.referrer_id,
        kind: 'team_daily_actions',
        scheduledAt: new Date(),
        payload: { queued },
      });
      notified++;
    } catch (err) {
      // pending duplicate — not a problem.
      log.debug(
        { err: (err as Error).message, ownerId: o.referrer_id },
        'skipped duplicate team daily notification',
      );
    }
  }
  log.info(
    { owners: owners.length, totalQueued, notified },
    'team next-actions cycle done',
  );
}

registerJob({
  name: 'team-next-actions',
  // 20:00 Moscow time every day (timezone is set to Europe/Moscow by the
  // scheduler default, so we can express this in local time directly).
  schedule: '0 20 * * *',
  handler: runOnce,
  timezone: 'Europe/Moscow',
});
