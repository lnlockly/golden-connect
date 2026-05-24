/**
 * Every 30 min: walk referrals in non-terminal stages, check the invitee's
 * real state (bookings + payments), and advance the funnel. Writes a
 * `scheduled_notifications` row when the referrer deserves a ping
 * (joined→booked, anything→paid).
 *
 * Why we hit bookings + payments directly instead of the referral state
 * machine: the machine only records the *last* transition we acknowledged.
 * The source of truth for "did they pay?" lives in `bookings` / `invoices`,
 * so the cron's job is to reconcile the two.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { scheduledNotifications, activityLog } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';
import * as RefRepo from '../repos/referrals-ext.js';

const log = logger.child({ module: 'referral-stage-refresh' });

interface InviteeState {
  invitee_id: number;
  has_paid_booking: boolean;
  has_booking: boolean;
  has_activity_7d: boolean;
  joined_at: string;
  last_seen_at: string;
}

async function fetchInviteeStates(ids: number[]): Promise<Map<number, InviteeState>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute(sql`
    SELECT
      u.id::int                                                            AS invitee_id,
      u.joined_at                                                          AS joined_at,
      u.last_seen_at                                                       AS last_seen_at,
      EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = u.id AND b.status = 'paid') AS has_paid_booking,
      EXISTS (SELECT 1 FROM bookings b WHERE b.user_id = u.id)             AS has_booking,
      EXISTS (
        SELECT 1 FROM activity_log a
        WHERE a.user_id = u.id AND a.created_at >= NOW() - INTERVAL '7 days'
      )                                                                    AS has_activity_7d
    FROM users u
    WHERE u.id = ANY(${sql.raw(`ARRAY[${ids.join(',')}]::int[]`)})
  `);
  const out = new Map<number, InviteeState>();
  for (const r of rows as any[]) {
    out.set(Number(r.invitee_id), {
      invitee_id: Number(r.invitee_id),
      has_paid_booking: !!r.has_paid_booking,
      has_booking: !!r.has_booking,
      has_activity_7d: !!r.has_activity_7d,
      joined_at: r.joined_at,
      last_seen_at: r.last_seen_at,
    });
  }
  return out;
}

/** Return the stage an invitee SHOULD be at right now, given their state. */
function deriveStage(st: InviteeState, current: RefRepo.ReferralStage): RefRepo.ReferralStage {
  if (st.has_paid_booking) return 'paid';
  if (st.has_booking) return 'booked';
  if (st.has_activity_7d) return 'active';
  // If they joined > 30 days ago and have no 7-day activity, consider lost.
  const joinedMs = Date.parse(st.joined_at);
  const ageDays = Number.isFinite(joinedMs) ? (Date.now() - joinedMs) / 86400000 : 0;
  if (!st.has_activity_7d && current === 'active' && ageDays > 14) return 'dormant';
  if (current === 'dormant' && ageDays > 45) return 'lost';
  // In the invited→joined gap: assume anyone whose row exists in `users`
  // (i.e. hit /start) is at least "joined". Brand-new invites without a
  // users row never surface here — the query above joins on users.id.
  if (current === 'invited') return 'joined';
  return current;
}

async function queueReferrerNotification(
  referrerId: number,
  inviteeId: number,
  from: RefRepo.ReferralStage,
  to: RefRepo.ReferralStage,
): Promise<void> {
  // Only ping for meaningful transitions. "joined → active" is noise; the
  // partner cares about booking + payment conversion events.
  if (!shouldPing(from, to)) return;

  const kind = `ref_stage_${to}`;
  try {
    await db.insert(scheduledNotifications).values({
      userId: referrerId,
      kind,
      scheduledAt: new Date(),
      payload: {
        referral_invitee_id: inviteeId,
        from_stage: from,
        to_stage: to,
      },
    });
  } catch (err) {
    // Partial unique index on (user_id, kind, status='pending') — a pending
    // notification of the same kind already waits. That's fine; this one
    // will ride on the next delivery.
    log.debug(
      { err: (err as Error).message, referrerId, inviteeId, from, to },
      'skipped duplicate pending notification',
    );
  }
}

function shouldPing(from: RefRepo.ReferralStage, to: RefRepo.ReferralStage): boolean {
  if (to === 'paid') return true;
  if (from === 'joined' && to === 'booked') return true;
  if (from === 'active' && to === 'booked') return true;
  return false;
}

async function runOnce(): Promise<void> {
  const open = await RefRepo.listOpenForStageRefresh(500);
  if (open.length === 0) {
    log.debug('no open referrals to refresh');
    return;
  }
  const states = await fetchInviteeStates(open.map((o) => o.invitee_id));
  let flips = 0;
  for (const row of open) {
    const st = states.get(row.invitee_id);
    if (!st) continue;
    const target = deriveStage(st, row.stage);
    if (target === row.stage) continue;
    const res = await RefRepo.transition(row.invitee_id, target);
    if (!res || !res.changed) continue;
    flips++;
    await db.insert(activityLog).values({
      userId: row.referrer_id,
      eventType: 'ref_stage_refreshed',
      payload: {
        invitee_id: row.invitee_id,
        from: res.oldStage,
        to: res.newStage,
      },
    });
    await queueReferrerNotification(row.referrer_id, row.invitee_id, res.oldStage ?? 'invited', res.newStage);
    // On paid transitions also bump challenges + milestone badges — same
    // logic as the synchronous /internal/referrals/transition endpoint.
    if (res.newStage === 'paid') {
      try {
        await RefRepo.grantMilestoneBadgesForPaid(row.referrer_id);
        await RefRepo.bumpChallengesOnPaid(row.referrer_id);
      } catch (err) {
        log.warn(
          { err: (err as Error).message, referrerId: row.referrer_id },
          'badge/challenge bump failed',
        );
      }
    }
  }
  log.info({ scanned: open.length, flips }, 'stage refresh done');
}

registerJob({
  name: 'referral-stage-refresh',
  // Every 30 minutes. The cron engine serialises overlapping ticks.
  schedule: '*/30 * * * *',
  handler: runOnce,
});
