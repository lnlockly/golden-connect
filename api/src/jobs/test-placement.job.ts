/**
 * Daily job: send "тестовая расстановка" simulation to FREE users with
 * a TG chat. Cron: 12:00 MSK every day (after the auto-renewal cron at
 * 09:00 MSK so renewed users are no longer FREE when this runs).
 *
 * Filters:
 *   - active_tariff_code IN ('free', NULL)
 *   - tg_id IS NOT NULL  (only TG users — email-only ones get this in
 *     cabinet on-demand)
 *   - last_seen_at >= NOW() - INTERVAL '14 days' (skip dormant)
 *   - Has not received a 'test_placement' inbox row in last 23 hours
 *     (anti-spam guard, also covers job double-firing)
 *
 * Writes:
 *   - notifications_inbox row with kind='test_placement', text=<sim msg>.
 *     The existing inbox-tg-deliver job will pick it up and send to TG
 *     within 60 seconds. No direct fetch to Telegram from here.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { simulateForUser, buildSimMessage } from '../services/test-placement.js';
import { registerJob } from './scheduler.js';

const log = logger.child({ module: 'test-placement-cron' });

interface CandidateRow {
  user_id: number;
  team_total: number;
}

async function fetchCandidates(): Promise<CandidateRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      u.id AS user_id,
      (SELECT COUNT(*)::int FROM users c WHERE c.invited_by_user_id = u.id) AS team_total
    FROM users u
    WHERE (u.active_tariff_code IS NULL OR u.active_tariff_code = 'free')
      AND u.tg_id IS NOT NULL
      AND (u.last_seen_at IS NULL OR u.last_seen_at >= NOW() - INTERVAL '14 days')
      AND NOT EXISTS (
        SELECT 1 FROM notifications_inbox n
        WHERE n.user_id = u.id
          AND n.kind = 'test_placement'
          AND n.created_at >= NOW() - INTERVAL '23 hours'
      )
    ORDER BY u.id
  `)) as unknown as Array<{ user_id: number; team_total: number }>;
  return rows.map(r => ({ user_id: Number(r.user_id), team_total: Number(r.team_total) }));
}

async function runOnce(): Promise<void> {
  const candidates = await fetchCandidates();
  log.info({ count: candidates.length }, 'test-placement: candidates picked');

  let sent = 0;
  let skipped_no_team = 0;
  let errors = 0;

  for (const c of candidates) {
    try {
      // Cheap: skip users with totally empty team — the message would be
      // all $0 and demotivating. They'll see something on cabinet
      // /me/test-placement when they actually have referrals.
      if (c.team_total === 0) { skipped_no_team++; continue; }

      const sim = await simulateForUser(c.user_id);
      const text = buildSimMessage(sim);

      await db.execute(sql`
        INSERT INTO notifications_inbox (user_id, kind, severity, title, body, url)
        VALUES (
          ${c.user_id},
          'test_placement',
          'info',
          ${'🎯 Тестовая расстановка'},
          ${text},
          '/cabinet#/finance'
        )
      `);
      sent++;
    } catch (e: any) {
      errors++;
      log.warn({ userId: c.user_id, err: e.message }, 'test-placement: per-user failure');
    }
  }

  log.info({ sent, skipped_no_team, errors, total: candidates.length }, 'test-placement: cron done');
}

registerJob({
  name: 'test-placement-cron',
  // 12:00 MSK = 09:00 UTC. The scheduler interprets schedules in
  // DEFAULT_TZ ('Europe/Moscow' per scheduler.ts) so we use 12:00.
  schedule: '0 12 * * *',
  timezone: 'Europe/Moscow',
  handler: runOnce,
});
