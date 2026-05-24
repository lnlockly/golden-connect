import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  dripState,
  users,
  inviteEdges,
  pendingReferrals,
} from '../db/schema.js';
import {
  toUserRow,
  type UserRowWire,
  toNum,
} from './mappers.js';

export interface UpsertUserInput {
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  invited_by_ref_code: string | null;
}

export interface TopReferrerWire {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  ref_code: string;
  direct_count: number;
}

export interface DescendantStatsWire {
  total_descendants: number;
  max_depth: number | null;
}

export interface DashboardStatsWire {
  total_users: number;
  joined_24h: number;
  joined_7d: number;
  avg_daily_7d: number;
  growth_rate_daily: number;
  projected_tomorrow: number;
  blocked: number;
  pending_referrals: number;
  broadcasts_total: number;
  broadcasts_sent: number;
  broadcasts_failed: number;
  top_direct: TopReferrerWire[];
  top_total: Array<TopReferrerWire & { total_descendants: number }>;
}

function refCodeForTgId(tgId: number): string {
  return String(tgId);
}

// --- Finders ---

export async function findByTgId(tgId: number): Promise<UserRowWire | null> {
  const r = await db.query.users.findFirst({ where: eq(users.tgId, tgId) });
  return r ? toUserRow(r) : null;
}

export async function findById(id: number): Promise<UserRowWire | null> {
  const r = await db.query.users.findFirst({ where: eq(users.id, id) });
  return r ? toUserRow(r) : null;
}

export async function findByUsername(username: string): Promise<UserRowWire | null> {
  const clean = username.startsWith('@') ? username.slice(1) : username;
  // Case-insensitive match against tg_username.
  const rows = await db.execute(sql`
    SELECT * FROM users
    WHERE LOWER(tg_username) = LOWER(${clean})
    LIMIT 1
  `);
  return rows[0] ? toUserRow(rows[0]) : null;
}

export async function findByRefCode(code: string): Promise<UserRowWire | null> {
  const r = await db.query.users.findFirst({ where: eq(users.refCode, code) });
  return r ? toUserRow(r) : null;
}

// --- Writers ---

/**
 * Create a new user. Mirrors the bot's behaviour exactly:
 *  - ref_code = decimal string of tg_id (same contract as refcode.ts)
 *  - if invited_by_ref_code resolves, stamp both denormalised columns
 *    AND insert an invite_edges row (single source of truth)
 */
export async function createUser(input: UpsertUserInput): Promise<UserRowWire> {
  let invitedByUserId: number | null = null;
  if (input.invited_by_ref_code) {
    const inviter = await findByRefCode(input.invited_by_ref_code);
    if (inviter) invitedByUserId = inviter.id;
  }

  const now = new Date();
  const [row] = await db
    .insert(users)
    .values({
      tgId: input.tg_id,
      tgUsername: input.username,
      firstName: input.first_name,
      lastName: input.last_name,
      languageCode: input.language_code,
      refCode: refCodeForTgId(input.tg_id),
      invitedByUserId,
      invitedByRefCode: input.invited_by_ref_code,
      joinedAt: now,
      lastSeenAt: now,
      isBlocked: false,
    })
    .returning();

  if (!row) throw new Error('user insert failed');

  // Mirror into invite_edges.
  if (invitedByUserId !== null) {
    try {
      await db.insert(inviteEdges).values({
        childUserId: row.id,
        parentUserId: invitedByUserId,
      });
    } catch {
      // unique violation on (child_user_id) — edge already present. Ignore.
    }
    // Mirror into `referrals` funnel table — what bot's /ref + /me read for
    // funnel counts and 'Мои рефералы' list. Stage starts at 'joined'
    // because we have a tg_id (the user opened the bot to call /start).
    // referral-stage-refresh.job.ts later promotes to 'active' / 'paid'.
    try {
      await db.execute(sql`
        INSERT INTO referrals (referrer_id, invitee_id, stage, source)
        VALUES (${invitedByUserId}, ${row.id}, 'joined', 'tg_signup')
        ON CONFLICT (referrer_id, invitee_id) DO NOTHING
      `);
    } catch {
      /* ignore — non-fatal mirror */
    }
  }

  // Phase 1B — Welcome drip initialisation. One-shot, idempotent (PK on
  // user_id). Failures here are non-fatal: a missed drip state costs us
  // the drip sequence but should NOT block user creation.
  try {
    await db
      .insert(dripState)
      .values({
        userId: row.id,
        startedAt: now,
        lastStepSent: -1,
      })
      .onConflictDoNothing({ target: dripState.userId });
  } catch {
    /* ignore — drip is best-effort */
  }

  return toUserRow(row);
}

export async function touch(
  tgId: number,
  patch: {
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    language_code?: string | null;
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE users SET
      tg_username   = COALESCE(${patch.username ?? null}, tg_username),
      first_name    = COALESCE(${patch.first_name ?? null}, first_name),
      last_name     = COALESCE(${patch.last_name ?? null}, last_name),
      language_code = COALESCE(${patch.language_code ?? null}, language_code),
      last_seen_at  = NOW()
    WHERE tg_id = ${tgId}
  `);
}

export async function setLanguage(tgId: number, lang: string): Promise<void> {
  await db.execute(sql`
    UPDATE users SET language_code = ${lang}, last_seen_at = NOW()
    WHERE tg_id = ${tgId}
  `);
}

export async function setBlocked(tgId: number, blocked: boolean): Promise<void> {
  await db
    .update(users)
    .set({ isBlocked: blocked })
    .where(eq(users.tgId, tgId));
}

export async function markAppliedByUsername(username: string): Promise<boolean> {
  const clean = username.startsWith('@') ? username.slice(1) : username;
  const res = await db.execute(sql`
    UPDATE users
    SET applied_on_site = TRUE, applied_at = NOW()
    WHERE LOWER(tg_username) = LOWER(${clean}) AND applied_on_site = FALSE
    RETURNING id
  `);
  return res.length > 0;
}

export async function markPresented(tgId: number): Promise<boolean> {
  const res = await db.execute(sql`
    UPDATE users
    SET presented_at = NOW()
    WHERE tg_id = ${tgId} AND presented_at IS NULL
    RETURNING id
  `);
  return res.length > 0;
}

export async function setRefNotifications(
  tgId: number,
  enabled: boolean,
): Promise<void> {
  await db
    .update(users)
    .set({ refNotificationsEnabled: enabled })
    .where(eq(users.tgId, tgId));
}

// --- Referral graph queries ---

export async function directCount(userId: number): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM users WHERE invited_by_user_id = ${userId}
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function descendantStats(userId: number): Promise<DescendantStatsWire> {
  const rows = await db.execute(sql`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT id, 0 FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, d.depth + 1
      FROM users u JOIN descendants d ON u.invited_by_user_id = d.id
      WHERE d.depth < 64
    )
    SELECT (COUNT(*) - 1)::int AS total_descendants, MAX(depth)::int AS max_depth
    FROM descendants
  `);
  const row = rows[0] as any;
  return {
    total_descendants: toNum(row?.total_descendants ?? 0),
    max_depth: row?.max_depth === null || row?.max_depth === undefined
      ? null
      : toNum(row.max_depth),
  };
}

export interface AncestorRow {
  user_id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  is_blocked: number;
  ref_notifications_enabled: number;
  depth: number;
}

export async function listAncestors(userId: number): Promise<AncestorRow[]> {
  const rows = await db.execute(sql`
    WITH RECURSIVE anc(id, depth) AS (
      SELECT invited_by_user_id, 1
      FROM users
      WHERE id = ${userId} AND invited_by_user_id IS NOT NULL
      UNION ALL
      SELECT u.invited_by_user_id, a.depth + 1
      FROM users u JOIN anc a ON u.id = a.id
      WHERE u.invited_by_user_id IS NOT NULL AND a.depth < 64
    )
    SELECT
      u.id::int                    AS user_id,
      u.tg_id                      AS tg_id,
      u.tg_username                AS username,
      u.first_name                 AS first_name,
      u.language_code              AS language_code,
      u.is_blocked                 AS is_blocked,
      u.ref_notifications_enabled  AS ref_notifications_enabled,
      a.depth::int                 AS depth
    FROM anc a
    JOIN users u ON u.id = a.id
    ORDER BY a.depth ASC
  `);
  return rows.map((r: any) => ({
    user_id: toNum(r.user_id),
    tg_id: toNum(r.tg_id),
    username: r.username ?? null,
    first_name: r.first_name ?? null,
    language_code: r.language_code ?? null,
    is_blocked: r.is_blocked ? 1 : 0,
    ref_notifications_enabled: r.ref_notifications_enabled ? 1 : 0,
    depth: toNum(r.depth),
  }));
}

export async function children(
  userId: number,
  limit: number,
  offset: number,
): Promise<UserRowWire[]> {
  const rows = await db.execute(sql`
    SELECT * FROM users
    WHERE invited_by_user_id = ${userId}
    ORDER BY joined_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map((r: any) => toUserRow(r));
}

export async function subtreeJoinedSince(
  userId: number,
  sinceMs: number,
): Promise<number> {
  // sinceMs is a unix-ms threshold; convert to timestamp for pg compare.
  const sinceTs = new Date(sinceMs);
  const rows = await db.execute(sql`
    WITH RECURSIVE d(id, joined_at) AS (
      SELECT id, joined_at FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, u.joined_at
      FROM users u JOIN d ON u.invited_by_user_id = d.id
    )
    SELECT COUNT(*)::int AS c FROM d WHERE joined_at >= ${sinceTs} AND id <> ${userId}
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function subtreeLevelBreakdown(
  userId: number,
  maxLevels: number,
): Promise<Array<{ level: number; count: number }>> {
  const rows = await db.execute(sql`
    WITH RECURSIVE d(id, depth) AS (
      SELECT id, 0 FROM users WHERE id = ${userId}
      UNION ALL
      SELECT u.id, d.depth + 1
      FROM users u JOIN d ON u.invited_by_user_id = d.id
      WHERE d.depth < ${maxLevels}
    )
    SELECT depth::int AS level, COUNT(*)::int AS count
    FROM d WHERE depth > 0
    GROUP BY depth
    ORDER BY depth
  `);
  return rows.map((r: any) => ({
    level: toNum(r.level),
    count: toNum(r.count),
  }));
}

// --- Pending referrals ---

export async function resolvePending(newUserRefCode: string): Promise<number> {
  const pending = await db.execute(sql`
    SELECT tg_id FROM pending_referrals WHERE ref_code = ${newUserRefCode}
  `);
  if (pending.length === 0) return 0;

  const inviter = await findByRefCode(newUserRefCode);
  if (!inviter) return 0;

  let n = 0;
  for (const p of pending) {
    const tgId = toNum((p as any).tg_id);
    const res = await db.execute(sql`
      UPDATE users
      SET invited_by_user_id = ${inviter.id},
          invited_by_ref_code = ${newUserRefCode}
      WHERE tg_id = ${tgId} AND invited_by_user_id IS NULL
      RETURNING id
    `);
    if (res.length > 0) {
      const childId = toNum((res[0] as any).id);
      // Mirror into invite_edges.
      try {
        await db.insert(inviteEdges).values({
          childUserId: childId,
          parentUserId: inviter.id,
        });
      } catch {
        // edge already exists → ignore.
      }
      // Mirror into `referrals` funnel table (see createUser above).
      try {
        await db.execute(sql`
          INSERT INTO referrals (referrer_id, invitee_id, stage, source)
          VALUES (${inviter.id}, ${childId}, 'joined', 'pending_resolve')
          ON CONFLICT (referrer_id, invitee_id) DO NOTHING
        `);
      } catch {
        /* ignore — non-fatal mirror */
      }
    }
    await db
      .delete(pendingReferrals)
      .where(eq(pendingReferrals.tgId, tgId));
    n++;
  }
  return n;
}

export async function recordPendingReferral(
  tgId: number,
  refCode: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO pending_referrals (tg_id, ref_code, created_at)
    VALUES (${tgId}, ${refCode}, NOW())
    ON CONFLICT (tg_id) DO UPDATE SET
      ref_code = EXCLUDED.ref_code,
      created_at = EXCLUDED.created_at
  `);
}

// --- Aggregates ---

export async function totalUsers(): Promise<number> {
  const rows = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users`);
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function joinedSince(sinceMs: number): Promise<number> {
  const sinceTs = new Date(sinceMs);
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM users WHERE joined_at >= ${sinceTs}
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function blockedCount(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM users WHERE is_blocked = TRUE
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function pendingReferralsCount(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM pending_referrals
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}

// --- Leaderboard ---

export async function topByDirect(limit: number): Promise<TopReferrerWire[]> {
  const rows = await db.execute(sql`
    SELECT u.id::int AS id,
           u.tg_id AS tg_id,
           u.tg_username AS username,
           u.first_name AS first_name,
           u.ref_code AS ref_code,
           (SELECT COUNT(*)::int FROM users c WHERE c.invited_by_user_id = u.id) AS direct_count
    FROM users u
    ORDER BY direct_count DESC, u.joined_at ASC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    id: toNum(r.id),
    tg_id: r.tg_id === null ? 0 : toNum(r.tg_id),
    username: r.username ?? null,
    first_name: r.first_name ?? null,
    ref_code: r.ref_code ?? '',
    direct_count: toNum(r.direct_count),
  }));
}

export async function topByTotalDescendants(
  limit: number,
): Promise<Array<TopReferrerWire & { total_descendants: number }>> {
  // One-shot recursive CTE — for each user with children, compute the
  // descendant count via a single CTE, then rank and slice.
  const rows = await db.execute(sql`
    WITH RECURSIVE tree(root_id, node_id, depth) AS (
      SELECT u.id AS root_id, u.id AS node_id, 0
      FROM users u
      WHERE EXISTS (SELECT 1 FROM users c WHERE c.invited_by_user_id = u.id)
      UNION ALL
      SELECT t.root_id, c.id, t.depth + 1
      FROM tree t
      JOIN users c ON c.invited_by_user_id = t.node_id
      WHERE t.depth < 64
    ),
    agg AS (
      SELECT root_id AS id, COUNT(*) - 1 AS total
      FROM tree
      GROUP BY root_id
    )
    SELECT u.id::int AS id,
           u.tg_id   AS tg_id,
           u.tg_username AS username,
           u.first_name  AS first_name,
           u.ref_code AS ref_code,
           agg.total::int AS total_descendants,
           (SELECT COUNT(*)::int FROM users c WHERE c.invited_by_user_id = u.id) AS direct_count
    FROM agg
    JOIN users u ON u.id = agg.id
    ORDER BY agg.total DESC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    id: toNum(r.id),
    tg_id: r.tg_id === null ? 0 : toNum(r.tg_id),
    username: r.username ?? null,
    first_name: r.first_name ?? null,
    ref_code: r.ref_code ?? '',
    direct_count: toNum(r.direct_count),
    total_descendants: toNum(r.total_descendants),
  }));
}

// --- Lists ---

export async function listPaginated(
  limit: number,
  offset: number,
): Promise<UserRowWire[]> {
  const rows = await db.execute(sql`
    SELECT * FROM users
    ORDER BY joined_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return rows.map((r: any) => toUserRow(r));
}

export async function allForBroadcast(): Promise<Array<{ id: number; tg_id: number }>> {
  const rows = await db.execute(sql`
    SELECT id::int AS id, tg_id FROM users
    WHERE is_blocked = FALSE AND tg_id IS NOT NULL
    ORDER BY id ASC
  `);
  return rows.map((r: any) => ({
    id: toNum(r.id),
    tg_id: toNum(r.tg_id),
  }));
}

export async function allForExport(): Promise<UserRowWire[]> {
  const rows = await db.execute(sql`
    SELECT * FROM users ORDER BY joined_at ASC
  `);
  return rows.map((r: any) => toUserRow(r));
}

// --- Dashboard ---

export async function dashboard(): Promise<DashboardStatsWire> {
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  const bstatsRows = await db.execute(sql`
    SELECT COUNT(*)::int AS total,
           COALESCE(SUM(sent_count), 0)::int AS sent,
           COALESCE(SUM(failed_count), 0)::int AS failed
    FROM broadcasts
  `);
  const b = bstatsRows[0] as any;

  const total = await totalUsers();
  const joined7d = await joinedSince(now - 7 * dayMs);
  const avgDaily = joined7d / 7;
  const denom = Math.max(total - joined7d, 1);
  const growthRate = joined7d / denom / 7;
  const projected = Math.round(total * growthRate);

  const [joined24h, blockedN, pendingN, topDirect, topTotal] = await Promise.all([
    joinedSince(now - dayMs),
    blockedCount(),
    pendingReferralsCount(),
    topByDirect(10),
    topByTotalDescendants(10),
  ]);

  return {
    total_users: total,
    joined_24h: joined24h,
    joined_7d: joined7d,
    avg_daily_7d: Math.round(avgDaily * 10) / 10,
    growth_rate_daily: Math.round(growthRate * 10000) / 10000,
    projected_tomorrow: projected,
    blocked: blockedN,
    pending_referrals: pendingN,
    broadcasts_total: toNum(b?.total ?? 0),
    broadcasts_sent: toNum(b?.sent ?? 0),
    broadcasts_failed: toNum(b?.failed ?? 0),
    top_direct: topDirect,
    top_total: topTotal,
  };
}
