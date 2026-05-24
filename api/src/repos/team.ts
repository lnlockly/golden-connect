/**
 * Team-CRM repo — notes partners keep on each referral + the daily
 * "who to contact" feed produced by `team-next-actions.job.ts`.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { teamContactNotes, teamNextActions, activityLog } from '../db/schema.js';

export interface NoteRow {
  id: number;
  contact_user_id: number;
  note: string;
  next_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

function asIso(d: Date | string | null): string | null {
  if (d === null) return null;
  if (d instanceof Date) return d.toISOString();
  return d;
}

export async function listNotesFor(
  ownerUserId: number,
  contactUserId: number,
): Promise<NoteRow[]> {
  const rows = await db
    .select()
    .from(teamContactNotes)
    .where(
      and(
        eq(teamContactNotes.ownerUserId, ownerUserId),
        eq(teamContactNotes.contactUserId, contactUserId),
      ),
    )
    .orderBy(desc(teamContactNotes.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    contact_user_id: r.contactUserId,
    note: r.note,
    next_contact_at: asIso(r.nextContactAt),
    created_at: asIso(r.createdAt) ?? '',
    updated_at: asIso(r.updatedAt) ?? '',
  }));
}

export interface SaveNoteInput {
  ownerUserId: number;
  contactUserId: number;
  note: string;
  nextContactAt: Date | null;
}

export async function saveNote(input: SaveNoteInput): Promise<NoteRow> {
  const [row] = await db
    .insert(teamContactNotes)
    .values({
      ownerUserId: input.ownerUserId,
      contactUserId: input.contactUserId,
      note: input.note,
      nextContactAt: input.nextContactAt,
    })
    .returning();
  if (!row) throw new Error('saveNote: insert returned nothing');

  await db.insert(activityLog).values({
    userId: input.ownerUserId,
    eventType: 'team_note_saved',
    payload: {
      contact_user_id: input.contactUserId,
      has_next_contact: input.nextContactAt !== null,
    },
  });

  return {
    id: row.id,
    contact_user_id: row.contactUserId,
    note: row.note,
    next_contact_at: asIso(row.nextContactAt),
    created_at: asIso(row.createdAt) ?? '',
    updated_at: asIso(row.updatedAt) ?? '',
  };
}

export interface NextActionRow {
  id: number;
  target_user_id: number;
  target_tg_username: string | null;
  target_first_name: string | null;
  action_type: string;
  reason: string;
  priority: number;
  created_at: string;
  done_at: string | null;
}

export async function listOpenActions(ownerUserId: number, limit = 20): Promise<NextActionRow[]> {
  const rows = await db.execute(sql`
    SELECT
      a.id::int              AS id,
      a.target_user_id::int  AS target_user_id,
      u.tg_username          AS target_tg_username,
      u.first_name           AS target_first_name,
      a.action_type          AS action_type,
      a.reason               AS reason,
      a.priority::int        AS priority,
      a.created_at           AS created_at,
      a.done_at              AS done_at
    FROM team_next_actions a
    JOIN users u ON u.id = a.target_user_id
    WHERE a.owner_user_id = ${ownerUserId} AND a.done_at IS NULL
    ORDER BY a.priority DESC, a.created_at ASC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    id: Number(r.id),
    target_user_id: Number(r.target_user_id),
    target_tg_username: r.target_tg_username ?? null,
    target_first_name: r.target_first_name ?? null,
    action_type: r.action_type,
    reason: r.reason,
    priority: Number(r.priority),
    created_at: asIso(r.created_at) ?? '',
    done_at: asIso(r.done_at),
  }));
}

export async function markActionDone(ownerUserId: number, actionId: number): Promise<boolean> {
  const res = await db
    .update(teamNextActions)
    .set({ doneAt: new Date() })
    .where(
      and(
        eq(teamNextActions.id, actionId),
        eq(teamNextActions.ownerUserId, ownerUserId),
        isNull(teamNextActions.doneAt),
      ),
    )
    .returning({ id: teamNextActions.id });
  return res.length > 0;
}

export interface NextActionCandidate {
  ownerUserId: number;
  targetUserId: number;
  actionType: 'call' | 'message' | 'followup' | 'congratulate';
  reason: string;
  priority: number;
}

/**
 * Upsert a candidate, treating same-day duplicates as identity. We do not
 * re-queue the same (owner, target, action_type) if an open entry already
 * exists — keeps the feed from ballooning across cron reruns.
 */
export async function upsertNextAction(c: NextActionCandidate): Promise<boolean> {
  const existing = await db.execute(sql`
    SELECT id FROM team_next_actions
    WHERE owner_user_id = ${c.ownerUserId}
      AND target_user_id = ${c.targetUserId}
      AND action_type = ${c.actionType}
      AND done_at IS NULL
    LIMIT 1
  `);
  if (existing.length > 0) return false;
  await db.insert(teamNextActions).values({
    ownerUserId: c.ownerUserId,
    targetUserId: c.targetUserId,
    actionType: c.actionType,
    reason: c.reason,
    priority: c.priority,
  });
  return true;
}

/**
 * List every active partner (anyone who has at least one referral row). The
 * next-actions job iterates over this and computes its feed. Also returns
 * the referrer's tg_id so the job can notify directly.
 */
export async function listActiveReferrers(): Promise<
  Array<{ referrer_id: number; tg_id: number | null }>
> {
  const rows = await db.execute(sql`
    SELECT DISTINCT r.referrer_id::int AS referrer_id, u.tg_id AS tg_id
    FROM referrals r
    JOIN users u ON u.id = r.referrer_id
    WHERE u.is_blocked = FALSE
  `);
  return rows.map((r: any) => ({
    referrer_id: Number(r.referrer_id),
    tg_id: r.tg_id === null ? null : Number(r.tg_id),
  }));
}

export interface RefereeSnapshot {
  referral_id: number;
  referrer_id: number;
  invitee_id: number;
  stage: string;
  stage_changed_at: string;
  invitee_joined_at: string;
  invitee_first_name: string | null;
  invitee_tg_username: string | null;
  last_activity_at: string | null;
}

/**
 * Per-owner snapshot used by the next-actions job. Adds the invitee's last
 * activity timestamp (any row in `activity_log`) so we can detect silence.
 */
export async function snapshotRefereesOf(ownerUserId: number): Promise<RefereeSnapshot[]> {
  const rows = await db.execute(sql`
    SELECT
      r.id::int                 AS referral_id,
      r.referrer_id::int        AS referrer_id,
      r.invitee_id::int         AS invitee_id,
      r.stage                   AS stage,
      r.stage_changed_at        AS stage_changed_at,
      u.joined_at               AS invitee_joined_at,
      u.first_name              AS invitee_first_name,
      u.tg_username             AS invitee_tg_username,
      (SELECT MAX(created_at) FROM activity_log WHERE user_id = r.invitee_id) AS last_activity_at
    FROM referrals r
    JOIN users u ON u.id = r.invitee_id
    WHERE r.referrer_id = ${ownerUserId}
  `);
  return rows.map((r: any) => ({
    referral_id: Number(r.referral_id),
    referrer_id: Number(r.referrer_id),
    invitee_id: Number(r.invitee_id),
    stage: r.stage,
    stage_changed_at: asIso(r.stage_changed_at) ?? '',
    invitee_joined_at: asIso(r.invitee_joined_at) ?? '',
    invitee_first_name: r.invitee_first_name ?? null,
    invitee_tg_username: r.invitee_tg_username ?? null,
    last_activity_at: asIso(r.last_activity_at),
  }));
}
