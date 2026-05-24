/**
 * Daily mission-progress tick — runs at 03:00 MSK.
 *
 * For every active (user, mission) enrollment we compute "days since last
 * completion". If that exceeds the template's policy.pause_after_days (or
 * default 3), we stamp an activity_log row marking the mission paused. If it
 * exceeds policy.reset_after_days (default 14), we wipe progress so the user
 * can restart.
 *
 * The logic is intentionally additive — we NEVER delete the day=-1 sentinel
 * (that would re-enroll the user silently); we only delete day>=0 rows on
 * reset so the user gets an empty progress back.
 */
import { and, eq, sql } from 'drizzle-orm';
import { registerJob } from './scheduler.js';
import { db } from '../db/client.js';
import {
  missionTemplates,
  userMissions,
  activityLog,
} from '../db/schema.js';
import { logger } from '../lib/logger.js';

const DEFAULT_PAUSE_AFTER_DAYS = 3;
const DEFAULT_RESET_AFTER_DAYS = 14;

interface MissionPolicy {
  pause_after_days?: number;
  reset_after_days?: number;
}

registerJob({
  name: 'mission-progress-tick',
  schedule: '0 3 * * *',
  timezone: 'Europe/Moscow',
  handler: async () => {
    const tmpls = await db
      .select()
      .from(missionTemplates)
      .where(eq(missionTemplates.active, true));
    if (tmpls.length === 0) return;

    let paused = 0;
    let reset = 0;

    for (const tmpl of tmpls) {
      const policy = (tmpl.policy as MissionPolicy) ?? {};
      const pauseAfter = policy.pause_after_days ?? DEFAULT_PAUSE_AFTER_DAYS;
      const resetAfter = policy.reset_after_days ?? DEFAULT_RESET_AFTER_DAYS;

      // Find all users who enrolled but whose most recent completed row is
      // older than `pauseAfter` days and less than `resetAfter` days.
      const stale = await db.execute<{
        user_id: number;
        max_completed: string | null;
        enrolled_at: string;
      }>(sql`
        SELECT um.user_id,
               MAX(CASE WHEN um.day >= 0 THEN um.completed_at END) AS max_completed,
               MAX(CASE WHEN um.day = -1 THEN um.created_at END)   AS enrolled_at
          FROM user_missions um
         WHERE um.mission_id = ${tmpl.id}
         GROUP BY um.user_id
      `);
      const rows = Array.isArray(stale)
        ? stale
        : ((stale as { rows?: unknown[] }).rows ?? []);
      const now = Date.now();

      for (const r of rows as Array<{
        user_id: number;
        max_completed: string | null;
        enrolled_at: string;
      }>) {
        const lastTs = r.max_completed ? Date.parse(r.max_completed) : Date.parse(r.enrolled_at);
        if (!Number.isFinite(lastTs)) continue;
        const daysIdle = (now - lastTs) / (24 * 3_600_000);

        if (daysIdle >= resetAfter) {
          // Reset: wipe day>=0 rows, keep the -1 enrolment so UI keeps
          // "enrolled" state but zero progress.
          await db
            .delete(userMissions)
            .where(
              and(
                eq(userMissions.userId, r.user_id),
                eq(userMissions.missionId, tmpl.id),
                sql`${userMissions.day} >= 0`,
              ),
            );
          await db.insert(activityLog).values({
            userId: r.user_id,
            eventType: 'missions.reset',
            payload: { mission_id: tmpl.id, days_idle: Math.round(daysIdle) },
          });
          reset += 1;
        } else if (daysIdle >= pauseAfter) {
          await db.insert(activityLog).values({
            userId: r.user_id,
            eventType: 'missions.paused',
            payload: { mission_id: tmpl.id, days_idle: Math.round(daysIdle) },
          });
          paused += 1;
        }
      }
    }

    if (paused > 0 || reset > 0) {
      logger.info(
        { paused, reset, templates: tmpls.length },
        'mission-progress-tick: nudge summary',
      );
    }
  },
});
