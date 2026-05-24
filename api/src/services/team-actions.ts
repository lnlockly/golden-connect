/**
 * Rules that translate referee snapshots into "what should the partner
 * do next?" candidates. Invoked from both the cron job and the internal
 * compute endpoint so the behaviour is identical whether the trigger is
 * scheduled or manual.
 *
 * Heuristic, not ML: priority integers are tuned by hand. Adjust by
 * editing this file — no migration needed.
 */
import * as TeamRepo from '../repos/team.js';

const DAY_MS = 86400000;

export async function computeNextActionsForOwner(ownerUserId: number): Promise<number> {
  const snapshots = await TeamRepo.snapshotRefereesOf(ownerUserId);
  const now = Date.now();
  let queued = 0;

  for (const s of snapshots) {
    const stageAgeDays = daysSince(s.stage_changed_at, now);
    const lastActMs = s.last_activity_at ? Date.parse(s.last_activity_at) : null;
    const silenceDays = lastActMs !== null ? (now - lastActMs) / DAY_MS : Infinity;

    // 1) brand-new invitee who never completed /start within 24h
    if (s.stage === 'invited' && stageAgeDays >= 1) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'followup',
        reason: 'invited_no_join_24h',
        priority: 7,
      });
      if (ok) queued++;
      continue;
    }

    // 2) paid — congratulate once, high priority, one-off
    if (s.stage === 'paid' && stageAgeDays <= 2) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'congratulate',
        reason: 'just_paid',
        priority: 9,
      });
      if (ok) queued++;
      continue;
    }

    // 3) booked but silent >3 days → nudge to finalise payment
    if (s.stage === 'booked' && silenceDays >= 3) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'call',
        reason: 'booked_silent_3d',
        priority: 8,
      });
      if (ok) queued++;
      continue;
    }

    // 4) active but silent >7 days → dormant risk
    if (s.stage === 'active' && silenceDays >= 7) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'message',
        reason: 'active_silent_7d',
        priority: 6,
      });
      if (ok) queued++;
      continue;
    }

    // 5) dormant user — win-back attempt once per week
    if (s.stage === 'dormant' && stageAgeDays >= 7) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'message',
        reason: 'winback_dormant',
        priority: 4,
      });
      if (ok) queued++;
      continue;
    }

    // 6) joined but never reached "active" within 7 days — send value pitch
    if (s.stage === 'joined' && stageAgeDays >= 7) {
      const ok = await TeamRepo.upsertNextAction({
        ownerUserId,
        targetUserId: s.invitee_id,
        actionType: 'message',
        reason: 'joined_no_activity_7d',
        priority: 5,
      });
      if (ok) queued++;
    }
  }

  return queued;
}

function daysSince(iso: string, nowMs: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (nowMs - t) / DAY_MS);
}
