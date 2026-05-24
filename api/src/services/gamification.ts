/**
 * Gamification service — the logic behind /internal/gamification/register-action
 * and /internal/quests/check-progress.
 *
 * Design points:
 *  - Streak rules live here, not in the route, so the hourly cron recompute
 *    can reuse the same thresholds.
 *  - Badge grants use raw SQL against `user_badges` (owned by Phase 1A). If
 *    the table doesn't exist yet we swallow the error — the streak itself is
 *    persisted regardless.
 *  - `checkQuestProgress` walks every active quest whose criteria key matches
 *    the incoming trigger_event. Quests with threshold semantics are
 *    incremented by one per call; quests with "one-shot" semantics
 *    (e.g. quiz_completed) complete in a single call.
 */
import { sql, and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import {
  quests,
  userQuestProgress,
  userStreaks,
  userXp,
  activityLog,
} from '../db/schema.js';
import { levelForXp } from './xp.js';

const STREAK_WINDOW_MIN_HOURS = 24;
const STREAK_WINDOW_MAX_HOURS = 48;

const STREAK_BADGE_THRESHOLDS: Array<{ days: number; badge: string }> = [
  { days: 3, badge: 'streak_3' },
  { days: 30, badge: 'streak_30' },
  { days: 90, badge: 'streak_90' },
];

export interface RegisterActionResult {
  streak: number;
  longestStreak: number;
  badgesEarned: string[];
}

/**
 * Upsert a streak row for the given user + action. Returns the post-update
 * streak values so callers can render the celebration message.
 *
 * Transactionless on purpose — the two statements are independent (a streak
 * update that fires after an expired window races with itself only in the
 * case of two actions within a few ms; the upsert semantics converge).
 */
export async function registerAction(
  userId: number,
  actionType: string,
  now: Date = new Date(),
): Promise<RegisterActionResult> {
  const [existing] = await db
    .select()
    .from(userStreaks)
    .where(eq(userStreaks.userId, userId))
    .limit(1);

  let current = 1;
  if (existing?.lastActionAt) {
    const elapsedMs = now.getTime() - existing.lastActionAt.getTime();
    const elapsedH = elapsedMs / 3_600_000;
    if (elapsedH < STREAK_WINDOW_MIN_HOURS) {
      // Same-day action — hold the streak.
      current = existing.currentStreak;
    } else if (elapsedH < STREAK_WINDOW_MAX_HOURS) {
      current = existing.currentStreak + 1;
    } else {
      current = 1;
    }
  }
  const longest = Math.max(existing?.longestStreak ?? 0, current);

  if (existing) {
    await db
      .update(userStreaks)
      .set({
        currentStreak: current,
        longestStreak: longest,
        lastActionAt: now,
        lastActionType: actionType,
      })
      .where(eq(userStreaks.userId, userId));
  } else {
    await db.insert(userStreaks).values({
      userId,
      currentStreak: current,
      longestStreak: longest,
      lastActionAt: now,
      lastActionType: actionType,
    });
  }

  // Fire activity_log row. Best-effort — the streak update itself is what
  // counts, so we don't want a log failure to fail the call.
  try {
    await db.insert(activityLog).values({
      userId,
      eventType: 'gamification.action_registered',
      payload: { action_type: actionType, streak: current },
    });
  } catch {
    /* noop */
  }

  const badgesEarned = await grantStreakBadges(userId, current);
  return { streak: current, longestStreak: longest, badgesEarned };
}

/**
 * Grant any streak badges the user crossed. Writes to the Phase 1A
 * `user_badges` table via raw SQL — if the table doesn't exist yet we catch
 * and return an empty list so streak flow keeps working stand-alone.
 */
export async function grantStreakBadges(
  userId: number,
  streak: number,
): Promise<string[]> {
  const granted: string[] = [];
  for (const { days, badge } of STREAK_BADGE_THRESHOLDS) {
    if (streak < days) continue;
    try {
      const rows = await db.execute<{ badge_id: string }>(
        sql`INSERT INTO user_badges (user_id, badge_id, earned_at)
            VALUES (${userId}, ${badge}, NOW())
            ON CONFLICT (user_id, badge_id) DO NOTHING
            RETURNING badge_id`,
      );
      // `rows` shape varies between postgres-js driver versions; the common
      // interface exposes .length and iteration.
      const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
      if (list.length > 0) granted.push(badge);
    } catch {
      // user_badges not yet migrated → silently skip.
    }
  }
  return granted;
}

/**
 * Recompute zeroes for streaks that have drifted past 48h idle. Called by
 * the hourly cron `streak-recompute.job.ts`.
 */
export async function zeroExpiredStreaks(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STREAK_WINDOW_MAX_HOURS * 3_600_000);
  const cutoffIso = cutoff.toISOString();
  const rows = await db
    .update(userStreaks)
    .set({ currentStreak: 0 })
    .where(
      and(
        sql`${userStreaks.currentStreak} > 0`,
        sql`${userStreaks.lastActionAt} IS NOT NULL`,
        sql`${userStreaks.lastActionAt} < ${cutoffIso}::timestamptz`,
      ),
    )
    .returning({ userId: userStreaks.userId });
  if (rows.length > 0) {
    try {
      await db.insert(activityLog).values({
        userId: null,
        eventType: 'gamification.streaks_reset',
        payload: { count: rows.length, cutoff: cutoff.toISOString() },
      });
    } catch {
      /* noop */
    }
  }
  return rows.length;
}

/**
 * Grant XP to a user and keep `user_xp.level` in sync. Returns the new total
 * so route handlers can decide whether to DM a "level up" message.
 */
export async function addXp(
  userId: number,
  delta: number,
): Promise<{ totalXp: number; level: number; previousLevel: number }> {
  if (delta <= 0) {
    const [row] = await db
      .select()
      .from(userXp)
      .where(eq(userXp.userId, userId))
      .limit(1);
    const total = row?.totalXp ?? 0;
    const lvl = row?.level ?? 1;
    return { totalXp: total, level: lvl, previousLevel: lvl };
  }
  const [existing] = await db
    .select()
    .from(userXp)
    .where(eq(userXp.userId, userId))
    .limit(1);
  const prev = existing?.totalXp ?? 0;
  const prevLevel = existing?.level ?? 1;
  const total = prev + delta;
  const level = levelForXp(total);
  if (existing) {
    await db
      .update(userXp)
      .set({ totalXp: total, level, updatedAt: new Date() })
      .where(eq(userXp.userId, userId));
  } else {
    await db
      .insert(userXp)
      .values({ userId, totalXp: total, level });
  }
  return { totalXp: total, level, previousLevel: prevLevel };
}

/** Criteria shape for typed checks. `type` is the discriminator. */
export interface QuestCriteria {
  type: string;
  threshold?: number;
  mission_id?: string;
  quiz_id?: string;
  fields?: string[];
  [key: string]: unknown;
}

export interface CheckProgressResult {
  grantedQuests: Array<{ questId: string; xp: number }>;
  totalXpGranted: number;
}

/**
 * Walk every active quest whose criteria.type matches `triggerEvent`.
 *
 *   triggerEvent 'referral_count'  → quests with criteria.type='referral_count'
 *   triggerEvent 'booking_paid'    → quests with criteria.type='booking_paid'
 *   triggerEvent 'streak_days'     → quests with criteria.type='streak_days'
 *   triggerEvent 'quiz_completed'  → quests with criteria.type='quiz_completed'
 *   triggerEvent 'mission_completed' → quests with criteria.type='mission_completed'
 *   triggerEvent 'profile_filled'  → quests with criteria.type='profile_filled'
 *
 * For threshold-style quests we increment `progress` by `incrementBy` (default
 * 1) and complete if progress >= threshold. For one-shot quests (no threshold)
 * we complete immediately.
 */
export async function checkQuestProgress(
  userId: number,
  triggerEvent: string,
  opts: { incrementBy?: number; absoluteValue?: number; context?: Record<string, unknown> } = {},
): Promise<CheckProgressResult> {
  const incrementBy = opts.incrementBy ?? 1;
  const absolute = opts.absoluteValue;
  const context = opts.context ?? {};

  // Fetch all active quests whose criteria.type matches. We parse JSON in JS
  // rather than filter in SQL — the quest set is small (dozens) and keeping
  // the condition in code avoids a jsonb_path_query expression.
  const rows = await db
    .select()
    .from(quests)
    .where(eq(quests.active, true));

  const matching = rows.filter((q) => {
    const c = q.criteria as QuestCriteria | null;
    return c && c.type === triggerEvent;
  });

  const granted: Array<{ questId: string; xp: number }> = [];
  let xpSum = 0;

  for (const q of matching) {
    const criteria = q.criteria as QuestCriteria;
    // Subfilter for quests that scope by id (e.g. quiz_id, mission_id).
    if (criteria.quiz_id && context.quiz_id !== criteria.quiz_id) continue;
    if (criteria.mission_id && context.mission_id !== criteria.mission_id) continue;

    const [prog] = await db
      .select()
      .from(userQuestProgress)
      .where(
        and(
          eq(userQuestProgress.userId, userId),
          eq(userQuestProgress.questId, q.id),
        ),
      )
      .limit(1);

    if (prog?.completedAt) continue; // already done

    const threshold = typeof criteria.threshold === 'number' ? criteria.threshold : 1;
    const newProgress =
      typeof absolute === 'number'
        ? absolute
        : (prog?.progress ?? 0) + incrementBy;
    const completed = newProgress >= threshold;

    if (prog) {
      await db
        .update(userQuestProgress)
        .set({
          progress: newProgress,
          completedAt: completed ? new Date() : null,
          xpGranted: completed ? q.xp : 0,
        })
        .where(
          and(
            eq(userQuestProgress.userId, userId),
            eq(userQuestProgress.questId, q.id),
          ),
        );
    } else {
      await db.insert(userQuestProgress).values({
        userId,
        questId: q.id,
        progress: newProgress,
        completedAt: completed ? new Date() : null,
        xpGranted: completed ? q.xp : 0,
      });
    }

    if (completed && q.xp > 0) {
      await addXp(userId, q.xp);
      try {
        await db.insert(activityLog).values({
          userId,
          eventType: 'gamification.quest_completed',
          payload: { quest_id: q.id, xp: q.xp, trigger: triggerEvent },
        });
      } catch {
        /* noop */
      }
      granted.push({ questId: q.id, xp: q.xp });
      xpSum += q.xp;
    }
  }

  return { grantedQuests: granted, totalXpGranted: xpSum };
}

/**
 * XP leaderboard — top N users for a time window.
 * Period `all` returns the raw `user_xp.total_xp` ranking; other periods sum
 * `activity_log` events of type `gamification.quest_completed` inside the
 * window. That avoids a separate "xp_events" table at the cost of a scan.
 */
export async function leaderboardTop(
  period: 'day' | 'week' | 'month' | 'all',
  limit = 20,
): Promise<Array<{ userId: number; xp: number; level: number }>> {
  if (period === 'all') {
    const rows = await db
      .select({
        userId: userXp.userId,
        xp: userXp.totalXp,
        level: userXp.level,
      })
      .from(userXp)
      .orderBy(desc(userXp.totalXp))
      .limit(limit);
    return rows;
  }

  const now = new Date();
  const sinceHours = period === 'day' ? 24 : period === 'week' ? 24 * 7 : 24 * 30;
  const since = new Date(now.getTime() - sinceHours * 3_600_000);

  // Sum xp from activity_log.payload.xp for the window.
  const raw = await db.execute<{ user_id: number; xp: number; level: number | null }>(
    sql`SELECT al.user_id                          AS user_id,
               COALESCE(SUM((al.payload->>'xp')::int), 0) AS xp,
               ux.level                             AS level
          FROM activity_log al
          LEFT JOIN user_xp ux ON ux.user_id = al.user_id
         WHERE al.event_type = 'gamification.quest_completed'
           AND al.created_at >= ${since}
           AND al.user_id IS NOT NULL
         GROUP BY al.user_id, ux.level
         ORDER BY xp DESC
         LIMIT ${limit}`,
  );
  const list = Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? []);
  return (list as Array<{ user_id: number; xp: number; level: number | null }>).map((r) => ({
    userId: Number(r.user_id),
    xp: Number(r.xp) || 0,
    level: r.level ?? 1,
  }));
}

/** Read-only helpers used by `/me/*` routes. */
export async function getStreak(userId: number) {
  const [row] = await db
    .select()
    .from(userStreaks)
    .where(eq(userStreaks.userId, userId))
    .limit(1);
  if (!row) {
    return { currentStreak: 0, longestStreak: 0, lastActionAt: null as Date | null };
  }
  return {
    currentStreak: row.currentStreak,
    longestStreak: row.longestStreak,
    lastActionAt: row.lastActionAt ?? null,
  };
}

export async function getXp(userId: number) {
  const [row] = await db
    .select()
    .from(userXp)
    .where(eq(userXp.userId, userId))
    .limit(1);
  if (!row) return { totalXp: 0, level: 1 };
  return { totalXp: row.totalXp, level: row.level };
}

export async function listUserQuests(userId: number) {
  const rows = await db
    .select({
      questId: quests.id,
      chapter: quests.chapter,
      title: quests.title,
      description: quests.description,
      xp: quests.xp,
      orderIdx: quests.orderIdx,
      progress: userQuestProgress.progress,
      completedAt: userQuestProgress.completedAt,
      criteria: quests.criteria,
    })
    .from(quests)
    .leftJoin(
      userQuestProgress,
      and(
        eq(userQuestProgress.questId, quests.id),
        eq(userQuestProgress.userId, userId),
      ),
    )
    .where(eq(quests.active, true))
    .orderBy(quests.chapter, quests.orderIdx);
  return rows;
}

export { isNull };
