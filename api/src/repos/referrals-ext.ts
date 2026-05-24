/**
 * Phase 1A referral repo — referral_codes, referrals funnel, challenges,
 * badges. Separate from `repos/users.ts` (legacy 5-level rewards) and
 * `services/referrals-5lvl.ts` (payout engine) so the funnel/CRM layer
 * stays isolated from cash flows.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  referralCodes,
  referrals,
  referralChallenges,
  userBadges,
  activityLog,
} from '../db/schema.js';

export type ReferralStage =
  | 'invited'
  | 'joined'
  | 'active'
  | 'booked'
  | 'paid'
  | 'dormant'
  | 'lost';

export const REFERRAL_STAGES: readonly ReferralStage[] = [
  'invited',
  'joined',
  'active',
  'booked',
  'paid',
  'dormant',
  'lost',
] as const;

/** Monotonic ranking so downstream cron can only advance, never regress. */
const STAGE_RANK: Record<ReferralStage, number> = {
  invited: 0,
  joined: 1,
  active: 2,
  booked: 3,
  paid: 4,
  dormant: -1, // sidetrack; a later real activity can bump back to active
  lost: -2,
};

// --- referral_codes ---

/**
 * Return the caller's code, minting one if absent. Code format is a
 * compact url-safe slug derived from user_id + short random suffix so two
 * users cannot collide even if their ids share digits.
 */
export async function ensureCode(userId: number): Promise<string> {
  const existing = await db.query.referralCodes.findFirst({
    where: eq(referralCodes.userId, userId),
  });
  if (existing) return existing.code;

  // Small attempt loop — collisions are astronomically rare for 8-char
  // alphabets, but we loop so a flake doesn't surface to the caller.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = mintCode(userId);
    try {
      const [row] = await db
        .insert(referralCodes)
        .values({ userId, code })
        .returning();
      if (row) return row.code;
    } catch {
      // unique violation → retry
    }
  }
  throw new Error('ensureCode: failed to mint referral code');
}

export async function findUserByCode(code: string): Promise<number | null> {
  const r = await db.query.referralCodes.findFirst({ where: eq(referralCodes.code, code) });
  return r?.userId ?? null;
}

function mintCode(userId: number): string {
  const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  }
  // Base36 of user id guarantees uniqueness even when the random tail
  // ultimately collides with a stale row (see ensureCode retry loop).
  return `${userId.toString(36)}${s}`;
}

// --- referrals funnel ---

export interface AttachInput {
  referrerId: number;
  inviteeId: number;
  source: string | null;
}

export interface AttachResult {
  created: boolean;
  referral: { id: number; stage: ReferralStage };
}

/**
 * Record a new referrer↔invitee edge at stage='invited'. Idempotent — a
 * repeat call for the same (referrer, invitee) is a no-op, returning the
 * existing row. Self-referrals are rejected (bot would otherwise spam the
 * user with "you invited yourself" notifications).
 */
export async function attach(input: AttachInput): Promise<AttachResult | null> {
  if (input.referrerId === input.inviteeId) return null;

  const existing = await db.query.referrals.findFirst({
    where: and(
      eq(referrals.referrerId, input.referrerId),
      eq(referrals.inviteeId, input.inviteeId),
    ),
  });
  if (existing) {
    return {
      created: false,
      referral: { id: existing.id, stage: existing.stage as ReferralStage },
    };
  }

  const [row] = await db
    .insert(referrals)
    .values({
      referrerId: input.referrerId,
      inviteeId: input.inviteeId,
      stage: 'invited',
      source: input.source,
    })
    .returning();
  if (!row) return null;

  await db.insert(activityLog).values({
    userId: input.inviteeId,
    eventType: 'ref_attached',
    payload: {
      referrer_id: input.referrerId,
      source: input.source ?? null,
      referral_id: row.id,
    },
  });

  return { created: true, referral: { id: row.id, stage: 'invited' } };
}

export interface TransitionResult {
  changed: boolean;
  oldStage: ReferralStage | null;
  newStage: ReferralStage;
  referrerId: number;
  inviteeId: number;
}

/**
 * Advance a referral to the target stage when the new stage has a higher
 * rank than the current one. `dormant`/`lost` are side-channel flags — we
 * let them overwrite any non-paid active stage so a cron that notices
 * "no activity in 30d" can flip an engaged→dormant transition.
 */
export async function transition(
  inviteeId: number,
  newStage: ReferralStage,
): Promise<TransitionResult | null> {
  const existing = await db.query.referrals.findFirst({
    where: eq(referrals.inviteeId, inviteeId),
  });
  if (!existing) return null;

  const oldStage = existing.stage as ReferralStage;
  if (oldStage === newStage) {
    return {
      changed: false,
      oldStage,
      newStage,
      referrerId: existing.referrerId,
      inviteeId: existing.inviteeId,
    };
  }

  const allowed = shouldAdvance(oldStage, newStage);
  if (!allowed) {
    return {
      changed: false,
      oldStage,
      newStage: oldStage,
      referrerId: existing.referrerId,
      inviteeId: existing.inviteeId,
    };
  }

  await db
    .update(referrals)
    .set({ stage: newStage, stageChangedAt: new Date() })
    .where(eq(referrals.id, existing.id));

  await db.insert(activityLog).values({
    userId: existing.inviteeId,
    eventType: 'ref_stage_change',
    payload: {
      referral_id: existing.id,
      referrer_id: existing.referrerId,
      from: oldStage,
      to: newStage,
    },
  });

  return {
    changed: true,
    oldStage,
    newStage,
    referrerId: existing.referrerId,
    inviteeId: existing.inviteeId,
  };
}

function shouldAdvance(from: ReferralStage, to: ReferralStage): boolean {
  // Terminal sinks can always be entered from any non-paid state.
  if (to === 'dormant' || to === 'lost') return from !== 'paid';
  // Cannot climb back from lost.
  if (from === 'lost') return false;
  // Otherwise strictly ascend the ladder.
  const fr = STAGE_RANK[from] ?? -99;
  const tr = STAGE_RANK[to] ?? -99;
  return tr > fr;
}

export interface FunnelCounts {
  invited: number;
  joined: number;
  active: number;
  booked: number;
  paid: number;
  dormant: number;
  lost: number;
  total: number;
}

export async function funnelFor(referrerId: number): Promise<FunnelCounts> {
  const rows = await db.execute(sql`
    SELECT stage, COUNT(*)::int AS n
    FROM referrals
    WHERE referrer_id = ${referrerId}
    GROUP BY stage
  `);
  const out: FunnelCounts = {
    invited: 0,
    joined: 0,
    active: 0,
    booked: 0,
    paid: 0,
    dormant: 0,
    lost: 0,
    total: 0,
  };
  for (const row of rows as any[]) {
    const s = row.stage as ReferralStage;
    const n = Number(row.n);
    if (s in out) {
      (out as unknown as Record<string, number>)[s] = n;
    }
    out.total += n;
  }
  return out;
}

export interface RefereeRow {
  referral_id: number;
  invitee_id: number;
  tg_username: string | null;
  first_name: string | null;
  stage: ReferralStage;
  stage_changed_at: string;
  source: string | null;
  created_at: string;
  last_contact_at: string | null;
}

export async function listForReferrer(
  referrerId: number,
  limit = 50,
  offset = 0,
): Promise<RefereeRow[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::int                  AS referral_id,
      r.invitee_id::int          AS invitee_id,
      u.tg_username              AS tg_username,
      u.first_name               AS first_name,
      r.stage                    AS stage,
      r.stage_changed_at         AS stage_changed_at,
      r.source                   AS source,
      r.created_at               AS created_at,
      (
        SELECT MAX(updated_at)
        FROM team_contact_notes tcn
        WHERE tcn.owner_user_id = ${referrerId}
          AND tcn.contact_user_id = r.invitee_id
      )                          AS last_contact_at
    FROM referrals r
    JOIN users u ON u.id = r.invitee_id
    WHERE r.referrer_id = ${referrerId}
    ORDER BY r.stage_changed_at DESC, r.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map((r: any) => ({
    referral_id: Number(r.referral_id),
    invitee_id: Number(r.invitee_id),
    tg_username: r.tg_username ?? null,
    first_name: r.first_name ?? null,
    stage: r.stage as ReferralStage,
    stage_changed_at: r.stage_changed_at,
    source: r.source ?? null,
    created_at: r.created_at,
    last_contact_at: r.last_contact_at ?? null,
  }));
}

export interface OpenRefereeForStageCheck {
  referral_id: number;
  invitee_id: number;
  referrer_id: number;
  invitee_tg_id: number | null;
  stage: ReferralStage;
  stage_changed_at: string;
  joined_at: string;
}

/**
 * Rows the stage-refresh cron needs to re-check. Skips terminal stages
 * (paid/lost) because their membership decisions don't flip again.
 */
export async function listOpenForStageRefresh(
  limit = 200,
): Promise<OpenRefereeForStageCheck[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::int                  AS referral_id,
      r.invitee_id::int          AS invitee_id,
      r.referrer_id::int         AS referrer_id,
      u.tg_id                    AS invitee_tg_id,
      r.stage                    AS stage,
      r.stage_changed_at         AS stage_changed_at,
      u.joined_at                AS joined_at
    FROM referrals r
    JOIN users u ON u.id = r.invitee_id
    WHERE r.stage IN ('invited', 'joined', 'active', 'booked', 'dormant')
    ORDER BY r.stage_changed_at ASC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    referral_id: Number(r.referral_id),
    invitee_id: Number(r.invitee_id),
    referrer_id: Number(r.referrer_id),
    invitee_tg_id: r.invitee_tg_id === null ? null : Number(r.invitee_tg_id),
    stage: r.stage as ReferralStage,
    stage_changed_at: r.stage_changed_at,
    joined_at: r.joined_at,
  }));
}

export interface LeaderboardRow {
  user_id: number;
  tg_username: string | null;
  first_name: string | null;
  paid_count: number;
}

export async function leaderboard(
  since: Date,
  limit = 20,
): Promise<LeaderboardRow[]> {
  const rows = await db.execute(sql`
    SELECT
      r.referrer_id::int          AS user_id,
      u.tg_username               AS tg_username,
      u.first_name                AS first_name,
      COUNT(*)::int               AS paid_count
    FROM referrals r
    JOIN users u ON u.id = r.referrer_id
    WHERE r.stage = 'paid' AND r.stage_changed_at >= ${since.toISOString()}
    GROUP BY r.referrer_id, u.tg_username, u.first_name
    ORDER BY paid_count DESC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    user_id: Number(r.user_id),
    tg_username: r.tg_username ?? null,
    first_name: r.first_name ?? null,
    paid_count: Number(r.paid_count),
  }));
}

// --- challenges ---

export interface ChallengeTemplate {
  id: string;
  goal: number;
  durationDays: number;
  badgeId: string;
}

/**
 * Hardcoded catalog. Text for the UI lives in i18n; this module only
 * cares about the mechanical shape. Admin-editable templates are a Phase 2
 * nice-to-have.
 */
export const CHALLENGE_CATALOG: readonly ChallengeTemplate[] = [
  { id: 'invite_3_in_7d', goal: 3, durationDays: 7, badgeId: 'challenger_bronze' },
  { id: 'invite_5_in_14d', goal: 5, durationDays: 14, badgeId: 'challenger_silver' },
  { id: 'invite_10_in_30d', goal: 10, durationDays: 30, badgeId: 'challenger_gold' },
] as const;

export interface ChallengeRow {
  id: number;
  challenge_id: string;
  goal: number;
  progress: number;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
}

export async function listActiveChallenges(userId: number): Promise<ChallengeRow[]> {
  const rows = await db
    .select()
    .from(referralChallenges)
    .where(and(eq(referralChallenges.userId, userId), isNull(referralChallenges.completedAt)));
  return rows.map((r) => ({
    id: r.id,
    challenge_id: r.challengeId,
    goal: r.goal,
    progress: r.progress,
    expires_at: asIso(r.expiresAt),
    completed_at: r.completedAt ? asIso(r.completedAt) : null,
    created_at: asIso(r.createdAt),
  }));
}

export async function listCompletedChallenges(userId: number): Promise<ChallengeRow[]> {
  const rows = await db.execute(sql`
    SELECT * FROM referral_challenges
    WHERE user_id = ${userId} AND completed_at IS NOT NULL
    ORDER BY completed_at DESC
    LIMIT 50
  `);
  return rows.map((r: any) => ({
    id: Number(r.id),
    challenge_id: r.challenge_id,
    goal: Number(r.goal),
    progress: Number(r.progress),
    expires_at: asIso(r.expires_at),
    completed_at: r.completed_at ? asIso(r.completed_at) : null,
    created_at: asIso(r.created_at),
  }));
}

export async function startChallenge(
  userId: number,
  templateId: string,
): Promise<{ started: boolean; challenge?: ChallengeRow }> {
  const tmpl = CHALLENGE_CATALOG.find((t) => t.id === templateId);
  if (!tmpl) return { started: false };

  const expires = new Date(Date.now() + tmpl.durationDays * 86400000);
  try {
    const [row] = await db
      .insert(referralChallenges)
      .values({
        userId,
        challengeId: tmpl.id,
        goal: tmpl.goal,
        progress: 0,
        expiresAt: expires,
      })
      .returning();
    if (!row) return { started: false };
    return {
      started: true,
      challenge: {
        id: row.id,
        challenge_id: row.challengeId,
        goal: row.goal,
        progress: row.progress,
        expires_at: asIso(row.expiresAt),
        completed_at: null,
        created_at: asIso(row.createdAt),
      },
    };
  } catch {
    // Unique partial index → active row already exists.
    return { started: false };
  }
}

/**
 * Walk user's active challenges and bump progress / close ones whose
 * target was reached. `paidCountSinceStart` is computed by caller (the
 * transition path) so we don't have to re-query referrals per challenge.
 */
export async function bumpChallengesOnPaid(
  userId: number,
): Promise<Array<{ challengeId: string; badgeId: string; completed: boolean }>> {
  const active = await listActiveChallenges(userId);
  const awarded: Array<{ challengeId: string; badgeId: string; completed: boolean }> = [];
  for (const ch of active) {
    const tmpl = CHALLENGE_CATALOG.find((t) => t.id === ch.challenge_id);
    if (!tmpl) continue;
    // Count fresh paid referrals *within the challenge window*. This
    // beats maintaining a running counter (which breaks on back-fills).
    const cnt = await db.execute(sql`
      SELECT COUNT(*)::int AS n
      FROM referrals
      WHERE referrer_id = ${userId}
        AND stage = 'paid'
        AND stage_changed_at >= ${ch.created_at}
    `);
    const progress = Number((cnt[0] as any)?.n ?? 0);
    const isDone = progress >= ch.goal;
    await db.execute(sql`
      UPDATE referral_challenges
      SET progress = ${progress},
          completed_at = CASE WHEN ${isDone} THEN NOW() ELSE completed_at END
      WHERE id = ${ch.id}
    `);
    if (isDone) {
      await grantBadge(userId, tmpl.badgeId, {
        source: 'challenge',
        challenge_id: tmpl.id,
      });
    }
    awarded.push({ challengeId: ch.challenge_id, badgeId: tmpl.badgeId, completed: isDone });
  }
  return awarded;
}

// --- badges ---

export interface BadgeRow {
  id: number;
  badge_id: string;
  earned_at: string;
  payload: unknown;
}

export async function listBadges(userId: number): Promise<BadgeRow[]> {
  const rows = await db
    .select()
    .from(userBadges)
    .where(eq(userBadges.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    badge_id: r.badgeId,
    earned_at: asIso(r.earnedAt),
    payload: r.payload,
  }));
}

export async function grantBadge(
  userId: number,
  badgeId: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  try {
    await db.insert(userBadges).values({ userId, badgeId, payload });
    await db.insert(activityLog).values({
      userId,
      eventType: 'badge_earned',
      payload: { badge_id: badgeId, ...payload },
    });
    return true;
  } catch {
    // Unique violation → already owned.
    return false;
  }
}

// --- milestone badges (referral-count based) ---

/**
 * Grants count-threshold badges when a new paid referral lands. Keeps the
 * award decisions centralised so bot code never has to know thresholds.
 */
export async function grantMilestoneBadgesForPaid(userId: number): Promise<string[]> {
  const res = await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM referrals
    WHERE referrer_id = ${userId} AND stage = 'paid'
  `);
  const paidCount = Number((res[0] as any)?.n ?? 0);
  const thresholds: Array<{ at: number; badge: string }> = [
    { at: 1, badge: 'first_paid' },
    { at: 5, badge: 'partner_5' },
    { at: 10, badge: 'partner_10' },
    { at: 25, badge: 'partner_25' },
  ];
  const granted: string[] = [];
  for (const t of thresholds) {
    if (paidCount >= t.at) {
      const ok = await grantBadge(userId, t.badge, { paid_count: paidCount });
      if (ok) granted.push(t.badge);
    }
  }
  return granted;
}

function asIso(d: Date | string): string {
  if (d instanceof Date) return d.toISOString();
  return d;
}
