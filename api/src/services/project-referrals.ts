/**
 * Project referrals — ported from Business Network's
 * `ProjectReferralService` (NestJS/Prisma) to Trendex API
 * (Hono + drizzle + raw SQL).
 *
 * Public surface (see exports at bottom):
 *
 *   - findSponsorWithLink(userId, projectId)
 *       Walk up users.invited_by_user_id and return the first ancestor
 *       that already participates in the project with a submitted link,
 *       OR the project author if encountered first. Null if none.
 *
 *   - createReferralChain(projectId, newUserId, directSponsorId)
 *       Build the multi-level project_referrals tree by walking up the
 *       PROJECT chain (project_referral_participations.invited_by) and
 *       inserting one row per level.
 *
 *   - notifySponsorsAboutNewParticipant(userId, projectId)
 *       Walk users.invited_by_user_id up; for each ancestor write a row
 *       into project_notifications_log — `skip_missed` for ancestors who
 *       have no submitted link (and keep walking), `new_participant` for
 *       the first ancestor with a link (and stop). Always logs an
 *       `author_new` entry for the project author at the end if not
 *       already covered.
 *
 *   - awardL1ReferralReward(participationId)
 *       Idempotently credit +10 TRDX to the direct sponsor when the
 *       referred user has submitted a link. Routes through the standard
 *       80/20 working/subscription split via `applyIncomeSplit`.
 *
 *   - submitReferralLink(userId, projectId, referralLink, projectUsername?)
 *       Orchestrator: validates the project, enforces link uniqueness,
 *       upserts the participation row, populates the project_referrals
 *       multi-level tree, queues sponsor notifications, and pays the
 *       L1 reward. Returns `{ ok, participationId, inviterId }`.
 *
 * Notifications are NOT delivered here — this layer only records intent
 * into `project_notifications_log`. A separate bot worker consumes that
 * table and dispatches Telegram messages. Decoupling transport from the
 * referral algorithm keeps this service idempotent and DB-only.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { applyIncomeSplit } from './income-split.js';

const MAX_DEPTH = 100;
// 10 TRDX = 10_000_000 micro (1 TRDX = 1e6 micro across the project).
const L1_REWARD_MICRO = 10_000_000n;

// ─────────────────────────────────────────────────────────────────
// 1. findSponsorWithLink
// ─────────────────────────────────────────────────────────────────

/**
 * Walk up `users.invited_by_user_id` starting from `userId`. Return the
 * id of the first ancestor that EITHER (a) already participates in
 * `projectId` with `has_submitted_link = TRUE`, OR (b) is the project's
 * author. Returns `null` after `MAX_DEPTH` hops or when the chain ends
 * without a match.
 */
export async function findSponsorWithLink(
  userId: number,
  projectId: number,
): Promise<number | null> {
  // Resolve project author once — encountering them shortcuts the walk.
  const projectRows = (await db.execute(sql`
    SELECT author_user_id FROM projects WHERE id = ${projectId} LIMIT 1
  `)) as unknown as Array<{ author_user_id: number }>;
  if (!projectRows[0]) return null;
  const authorId = Number(projectRows[0].author_user_id);

  // Start from `userId`'s direct upline (not from `userId` itself).
  const userRows = (await db.execute(sql`
    SELECT invited_by_user_id FROM users WHERE id = ${userId} LIMIT 1
  `)) as unknown as Array<{ invited_by_user_id: number | null }>;
  if (!userRows[0]) return null;

  let currentId: number | null = userRows[0].invited_by_user_id;
  let depth = 0;

  while (currentId && depth < MAX_DEPTH) {
    // Hit the project author? They always count as a sponsor.
    if (currentId === authorId) return currentId;

    const partRows = (await db.execute(sql`
      SELECT has_submitted_link
      FROM project_referral_participations
      WHERE user_id = ${currentId} AND project_id = ${projectId}
      LIMIT 1
    `)) as unknown as Array<{ has_submitted_link: boolean | null }>;

    if (partRows[0]?.has_submitted_link === true) return currentId;

    // Climb one level.
    const upRows = (await db.execute(sql`
      SELECT invited_by_user_id FROM users WHERE id = ${currentId} LIMIT 1
    `)) as unknown as Array<{ invited_by_user_id: number | null }>;
    currentId = upRows[0]?.invited_by_user_id ?? null;
    depth++;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────
// 2. createReferralChain
// ─────────────────────────────────────────────────────────────────

/**
 * Walk up the PROJECT chain (project_referral_participations.invited_by)
 * starting at `directSponsorId` and insert one project_referrals row at
 * each level binding the chain to `newUserId`. Uses ON CONFLICT DO
 * NOTHING so re-runs don't error on the UNIQUE(project_id,
 * referrer_user_id, referred_user_id, level) constraint.
 *
 * Important: the upline used here is the PROJECT upline (sponsor inside
 * the project), NOT the global users.invited_by_user_id. Two users may
 * have a different sponsor inside a partner project than they have in
 * the global matrix.
 */
export async function createReferralChain(
  projectId: number,
  newUserId: number,
  directSponsorId: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    let currentSponsorId: number | null = directSponsorId;
    let level = 1;

    while (currentSponsorId && level <= MAX_DEPTH) {
      await tx.execute(sql`
        INSERT INTO project_referrals
          (project_id, referrer_user_id, referred_user_id, level)
        VALUES (${projectId}, ${currentSponsorId}, ${newUserId}, ${level})
        ON CONFLICT (project_id, referrer_user_id, referred_user_id, level)
        DO NOTHING
      `);

      // Climb the project upline (not the global users upline).
      const upRows = (await tx.execute(sql`
        SELECT invited_by
        FROM project_referral_participations
        WHERE user_id = ${currentSponsorId} AND project_id = ${projectId}
        LIMIT 1
      `)) as unknown as Array<{ invited_by: number | null }>;

      currentSponsorId = upRows[0]?.invited_by ?? null;
      level++;
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// 3. notifySponsorsAboutNewParticipant
// ─────────────────────────────────────────────────────────────────

/**
 * Walk users.invited_by_user_id from `userId` upward and record
 * intent-to-notify rows in `project_notifications_log`:
 *
 *   - ancestor NOT in project (or has_submitted_link=false):
 *       insert kind='skip_missed' (line = depth + 1) and KEEP walking.
 *
 *   - ancestor in project with submitted link:
 *       insert kind='new_participant' and STOP.
 *
 * Finally, if the project's author has not been notified above, insert
 * kind='author_new' so the project owner gets a heads-up too.
 *
 * The bot worker is responsible for actually sending Telegram messages
 * by reading this table.
 */
export async function notifySponsorsAboutNewParticipant(
  userId: number,
  projectId: number,
): Promise<void> {
  const projectRows = (await db.execute(sql`
    SELECT author_user_id FROM projects WHERE id = ${projectId} LIMIT 1
  `)) as unknown as Array<{ author_user_id: number }>;
  if (!projectRows[0]) return;
  const authorId = Number(projectRows[0].author_user_id);

  const userRows = (await db.execute(sql`
    SELECT invited_by_user_id FROM users WHERE id = ${userId} LIMIT 1
  `)) as unknown as Array<{ invited_by_user_id: number | null }>;
  if (!userRows[0]) return;

  let currentId: number | null = userRows[0].invited_by_user_id;
  let depth = 0;
  let foundSponsorWithLink = false;
  // Track which ancestors already received a row so that the closing
  // author_new step does not duplicate when the author was also the
  // sponsor that caught the chain.
  const notifiedIds = new Set<number>();

  while (currentId && depth < MAX_DEPTH && !foundSponsorWithLink) {
    const line = depth + 1;
    const partRows = (await db.execute(sql`
      SELECT has_submitted_link
      FROM project_referral_participations
      WHERE user_id = ${currentId} AND project_id = ${projectId}
      LIMIT 1
    `)) as unknown as Array<{ has_submitted_link: boolean | null }>;

    const hasLink = partRows[0]?.has_submitted_link === true;

    if (!hasLink) {
      // Sponsor missed this referral — log the warning and keep going.
      await db.execute(sql`
        INSERT INTO project_notifications_log (user_id, project_id, kind, payload)
        VALUES (
          ${currentId},
          ${projectId},
          'skip_missed',
          ${sql`${JSON.stringify({ line, projectId, newUserId: userId })}::jsonb`}
        )
        ON CONFLICT DO NOTHING
      `);
      notifiedIds.add(currentId);

      const upRows = (await db.execute(sql`
        SELECT invited_by_user_id FROM users WHERE id = ${currentId} LIMIT 1
      `)) as unknown as Array<{ invited_by_user_id: number | null }>;
      currentId = upRows[0]?.invited_by_user_id ?? null;
      depth++;
    } else {
      // First sponsor WITH a link — they get the new-participant notif
      // and the walk stops here.
      await db.execute(sql`
        INSERT INTO project_notifications_log (user_id, project_id, kind, payload)
        VALUES (
          ${currentId},
          ${projectId},
          'new_participant',
          ${sql`${JSON.stringify({ line, projectId, newUserId: userId })}::jsonb`}
        )
        ON CONFLICT DO NOTHING
      `);
      notifiedIds.add(currentId);
      foundSponsorWithLink = true;
    }
  }

  // Always tell the project author about the new participant — unless
  // the author IS the new participant or already got a notif above.
  if (authorId !== userId && !notifiedIds.has(authorId)) {
    await db.execute(sql`
      INSERT INTO project_notifications_log (user_id, project_id, kind, payload)
      VALUES (
        ${authorId},
        ${projectId},
        'author_new',
        ${sql`${JSON.stringify({ projectId, newUserId: userId })}::jsonb`}
      )
      ON CONFLICT DO NOTHING
    `);
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. awardL1ReferralReward
// ─────────────────────────────────────────────────────────────────

/**
 * Idempotently credit +10 TRDX (10_000_000 micro) to the inviter of the
 * participation row. Skips when:
 *
 *   - participation has no submitted link
 *   - participation has no inviter
 *   - participation.l1_reward_paid is already TRUE
 *
 * The credit goes through applyIncomeSplit() so the standard 80/20
 * working/subscription split applies to partner-line earnings.
 */
export async function awardL1ReferralReward(participationId: number): Promise<void> {
  await db.transaction(async (tx) => {
    // Lock the participation row so concurrent callers can't both pass
    // the "not paid yet" guard and double-credit.
    const rows = (await tx.execute(sql`
      SELECT id, user_id, project_id, invited_by, has_submitted_link, l1_reward_paid
      FROM project_referral_participations
      WHERE id = ${participationId}
      LIMIT 1
      FOR UPDATE
    `)) as unknown as Array<{
      id: number;
      user_id: number;
      project_id: number;
      invited_by: number | null;
      has_submitted_link: boolean | null;
      l1_reward_paid: boolean | null;
    }>;

    if (!rows[0]) return;
    const p = rows[0];

    if (!p.has_submitted_link) return;
    if (!p.invited_by) return;
    if (p.l1_reward_paid) return;

    const memo = `project_${p.project_id}_l1_user_${p.user_id}`;

    // Positive income row credited to the inviter. We capture the row
    // id so the auto-split row can reference it in its memo for audit.
    const ledgerRows = (await tx.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
      VALUES (
        ${p.invited_by},
        'partner_l1_referral',
        ${Number(L1_REWARD_MICRO)},
        ${p.user_id},
        ${memo}
      )
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    const ledgerId = ledgerRows[0]?.id ?? null;

    // Apply the 80/20 working/subscription split inside the same tx so
    // either both side-effects land or neither does.
    await applyIncomeSplit(
      tx as unknown as typeof db,
      p.invited_by,
      L1_REWARD_MICRO,
      'partner_l1_referral',
      ledgerId,
    );

    await tx.execute(sql`
      UPDATE project_referral_participations
      SET l1_reward_paid = TRUE, l1_reward_paid_at = NOW(), updated_at = NOW()
      WHERE id = ${participationId}
    `);
  });
}

// ─────────────────────────────────────────────────────────────────
// 5. submitReferralLink — orchestrator
// ─────────────────────────────────────────────────────────────────

export interface SubmitReferralLinkResult {
  ok: true;
  participationId: number;
  inviterId: number | null;
}

/**
 * Validates the project, enforces link uniqueness within the project,
 * finds the sponsor via the global upline, upserts the participation
 * row, then runs three side-effects: build the multi-level project
 * referral chain, queue sponsor notifications, and pay the L1 reward.
 *
 * Throws Error('project_not_found' | 'link_taken' | 'already_submitted')
 * — callers map these to HTTP responses.
 */
export async function submitReferralLink(
  userId: number,
  projectId: number,
  referralLink: string,
  projectUsername?: string,
): Promise<SubmitReferralLinkResult> {
  // 1. Project must exist.
  const projectRows = (await db.execute(sql`
    SELECT id FROM projects WHERE id = ${projectId} LIMIT 1
  `)) as unknown as Array<{ id: number }>;
  if (!projectRows[0]) throw new Error('project_not_found');

  // 2. Link must be unique within the project (any other user holding
  //    this same link in this same project blocks the submission).
  const dupRows = (await db.execute(sql`
    SELECT id FROM project_referral_participations
    WHERE project_id = ${projectId}
      AND referral_link = ${referralLink}
      AND user_id <> ${userId}
    LIMIT 1
  `)) as unknown as Array<{ id: number }>;
  if (dupRows[0]) throw new Error('link_taken');

  // 3. If a participation row already exists, refuse re-submission once
  //    a link has been recorded. This mirrors BN behaviour.
  const existing = (await db.execute(sql`
    SELECT id, has_submitted_link
    FROM project_referral_participations
    WHERE user_id = ${userId} AND project_id = ${projectId}
    LIMIT 1
  `)) as unknown as Array<{ id: number; has_submitted_link: boolean | null }>;
  if (existing[0]?.has_submitted_link) throw new Error('already_submitted');

  // 4. Resolve the inviter via the global users upline.
  const inviterId = await findSponsorWithLink(userId, projectId);

  // 5. Upsert participation row inside a transaction so chain + notif
  //    side-effects all see the new row (or none of them run).
  const participationId = await db.transaction(async (tx) => {
    const upsert = (await tx.execute(sql`
      INSERT INTO project_referral_participations
        (user_id, project_id, referral_link, project_username, invited_by,
         has_submitted_link, notified_at)
      VALUES (
        ${userId},
        ${projectId},
        ${referralLink},
        ${projectUsername ?? null},
        ${inviterId},
        TRUE,
        NOW()
      )
      ON CONFLICT (user_id, project_id) DO UPDATE
      SET referral_link = EXCLUDED.referral_link,
          project_username = EXCLUDED.project_username,
          invited_by = EXCLUDED.invited_by,
          has_submitted_link = TRUE,
          notified_at = COALESCE(project_referral_participations.notified_at, NOW()),
          updated_at = NOW()
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    return Number(upsert[0]!.id);
  });

  // 6. Post-commit side-effects. Each uses its own transaction. If any
  //    fail, the participation row is still in place — the bot worker
  //    can retry notifications by reading the log table, and the reward
  //    is idempotent on participation id.
  if (inviterId) {
    await createReferralChain(projectId, userId, inviterId);
  }
  await notifySponsorsAboutNewParticipant(userId, projectId);
  await awardL1ReferralReward(participationId);

  return { ok: true, participationId, inviterId };
}
