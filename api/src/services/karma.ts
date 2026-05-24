import { sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { addKarma, sendNotification } from './balances.js';
import { logger } from '../lib/logger.js';

/**
 * Karma v2 — full rewards table with daily caps and advertiser bias.
 *
 * Karma earns the user a slot in the weekly raffle (Sunday 20:00 MSK,
 * top-10 split a $100 USD pool 30/20/15/10/8/6/4/3/2/2).
 *
 * Three earning tiers:
 *   - Daily activity (login, chat) — caps prevent farming.
 *   - Executor (task complete, tools, links) — moderate caps.
 *   - Advertiser (campaign submit, topup, marketplace) — HIGHER rates,
 *     reflecting their direct economic contribution.
 */

// Default karma points per action.
export const KARMA_RULES: Record<string, bigint> = {
  // Daily presence
  login: 1n,
  login_streak_7: 200n,      // milestone bonus when streak hits 7
  login_streak_14: 500n,     // milestone bonus when streak hits 14
  login_streak_30: 1500n,    // milestone bonus when streak hits 30
  login_streak_30_plus: 50n, // daily bonus while streak >= 30
  chat_message: 1n,          // verified by bot in @TRENDEX_AD
  chat_reaction: 0n,         // disabled per user 2026-04-29

  // Onboarding / profile (one-shot)
  onboarding_done: 5n,
  profile_filled_100: 10n,

  // Executor
  task_complete: 1n,
  task_first: 5n,            // first task ever, lifetime bonus
  tool_use: 1n,              // shortener, qr, hashtags, banner, etc
  tool_first: 3n,            // first time per tool, lifetime bonus
  link_create: 1n,           // shorten URL
  bio_post: 1n,              // post via bio page

  // Advertiser (HIGHER bias)
  ad_submit: 5n,             // create campaign
  ad_first: 20n,             // first campaign lifetime bonus
  ad_100_views: 10n,         // campaign hit 100 impressions
  ad_1000_views: 50n,
  ad_topup_per_dollar: 2n,   // per $1 topped up to ad balance
  marketplace_list: 5n,      // list a product
  marketplace_first_sale: 25n, // first sale ever, lifetime bonus

  // Network / referrals
  referral_joined: 2n,
  referral_bought: 10n,
  referral_ad_submit: 3n,
  referral_l2_joined: 1n,
  self_buy_tariff: 20n,
  self_upgrade: 10n,

  // Events
  event_subscribe: 3n,
  event_attend: 5n,
};

/**
 * Daily caps — max times this kind can be awarded per user per UTC day.
 * Absent kinds = unlimited. Per-action karma still set in KARMA_RULES.
 */
export const DAILY_CAPS: Record<string, number> = {
  chat_message: 1,           // user spec: ровно 1 за день
  chat_reaction: 0,
  login: 1,
  login_streak_7: 1,
  login_streak_14: 1,
  login_streak_30: 1,
  login_streak_30_plus: 1,
  task_complete: 50,
  tool_use: 10,
  link_create: 5,
  bio_post: 5,
  ad_submit: 10,
  ad_topup_per_dollar: 100,
  marketplace_list: 5,
  event_subscribe: 5,
  event_attend: 5,
};

/**
 * Lifetime caps — kinds that can only be awarded once per user, ever.
 */
export const LIFETIME_KINDS = new Set<string>([
  'onboarding_done',
  'profile_filled_100',
  'task_first',
  'tool_first',
  'ad_first',
  'marketplace_first_sale',
]);

/**
 * Returns count of awards for `kind` for `userId` in the current UTC day.
 */
async function todayKindCount(tx: DB, userId: number, kind: string): Promise<number> {
  const r = (await tx.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM karma_log
    WHERE user_id = ${userId}
      AND kind = ${kind}
      AND created_at >= DATE_TRUNC('day', NOW())
  `)) as unknown as Array<{ n: number }>;
  return Number(r[0]?.n ?? 0);
}

async function lifetimeKindExists(tx: DB, userId: number, kind: string): Promise<boolean> {
  const r = (await tx.execute(sql`
    SELECT 1 FROM karma_log WHERE user_id = ${userId} AND kind = ${kind} LIMIT 1
  `)) as unknown as Array<unknown>;
  return r.length > 0;
}

/**
 * Award standard karma. Honors daily caps and lifetime restrictions.
 * Returns: { points: awarded, capped: true if daily cap reached or lifetime exhausted }.
 */
export async function awardKarma(
  userId: number,
  kind: string,
  sourceId?: number | bigint | null,
  memo?: string,
): Promise<{ points: bigint; capped: boolean }> {
  const points = KARMA_RULES[kind];
  if (!points || points <= 0n) {
    logger.debug({ kind }, 'awardKarma: unknown or zero kind');
    return { points: 0n, capped: false };
  }

  // Lifetime check
  if (LIFETIME_KINDS.has(kind)) {
    const existed = await lifetimeKindExists(db as unknown as DB, userId, kind);
    if (existed) return { points: 0n, capped: true };
  }

  // Daily cap check
  const cap = DAILY_CAPS[kind];
  if (typeof cap === 'number') {
    if (cap === 0) return { points: 0n, capped: true };
    const used = await todayKindCount(db as unknown as DB, userId, kind);
    if (used >= cap) return { points: 0n, capped: true };
  }

  await addKarma(userId, points, kind, kind, sourceId, memo);
  return { points, capped: false };
}

/** Award custom amount (admin grants, special promos). Bypasses caps. */
export async function awardKarmaCustom(
  userId: number,
  points: bigint,
  kind: string,
  memo?: string,
): Promise<bigint> {
  await addKarma(userId, points, kind, kind, null, memo);
  return points;
}

export async function readKarmaWeek(userId: number): Promise<bigint> {
  const r = (await db.execute(sql`
    SELECT COALESCE(SUM(points), 0)::bigint AS total
    FROM karma_log
    WHERE user_id = ${userId}
      AND created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')
  `)) as unknown as Array<{ total: string | number }>;
  return BigInt(r[0]?.total ?? 0);
}

export async function listTopKarma(
  limit = 10,
  since?: Date,
): Promise<Array<{ user_id: number; points: bigint }>> {
  const sinceISO = since ? since.toISOString() : null;
  const r = (await db.execute(sql`
    SELECT user_id, SUM(points)::bigint AS points
    FROM karma_log
    WHERE points > 0
      AND created_at >= ${sinceISO || sql`DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Moscow')`}
    GROUP BY user_id
    ORDER BY SUM(points) DESC
    LIMIT ${limit}
  `)) as unknown as Array<{ user_id: number; points: string | number }>;
  return r.map((x) => ({ user_id: Number(x.user_id), points: BigInt(x.points) }));
}

/** Track a daily login — handles streak progression + milestone bonuses + notifications. */
export async function trackLogin(userId: number, tx: DB = db): Promise<{ streak: number; karma: bigint; milestone: number | null }> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Award daily login (capped 1/day automatically; if already logged today returns capped:true)
  const r1 = await awardKarma(userId, 'login', null, `login:${todayStr}`);

  // Read current streak.
  const userRow = (await tx.execute(sql`
    SELECT login_streak, last_seen_at FROM users WHERE id = ${userId} LIMIT 1
  `)) as unknown as Array<{ login_streak: number | null; last_seen_at: Date | null }>;
  const oldStreak = userRow[0]?.login_streak ?? 0;
  const newStreak = oldStreak + (r1.points > 0n ? 1 : 0);

  // Persist streak only if today was a fresh login (not duplicate).
  if (r1.points > 0n) {
    await tx.execute(sql`
      UPDATE users SET login_streak = ${newStreak}, last_seen_at = NOW() WHERE id = ${userId}
    `);
  }

  let bonusKarma = r1.points;
  let milestone: number | null = null;

  // Milestone bonuses fire ONCE when streak crosses the threshold (oldStreak < N, newStreak >= N).
  // memo carries the streak number to keep karma_log audit clean.
  if (oldStreak < 7 && newStreak >= 7) {
    const r2 = await awardKarma(userId, 'login_streak_7', null, `streak:7:${todayStr}`);
    bonusKarma += r2.points;
    if (r2.points > 0n) milestone = 7;
  }
  if (oldStreak < 14 && newStreak >= 14) {
    const r3 = await awardKarma(userId, 'login_streak_14', null, `streak:14:${todayStr}`);
    bonusKarma += r3.points;
    if (r3.points > 0n) milestone = 14;
  }
  if (oldStreak < 30 && newStreak >= 30) {
    const r4 = await awardKarma(userId, 'login_streak_30', null, `streak:30:${todayStr}`);
    bonusKarma += r4.points;
    if (r4.points > 0n) milestone = 30;
  }

  // Continuous bonus for 30+ day streak — every day after the milestone.
  if (newStreak > 30 && r1.points > 0n) {
    const r5 = await awardKarma(userId, 'login_streak_30_plus', null, `streak30plus:${newStreak}:${todayStr}`);
    bonusKarma += r5.points;
  }

  // Send TG/inbox notification on milestone (fire-and-forget, don't block login).
  if (milestone !== null && bonusKarma > 0n) {
    const milestoneText: Record<number, string> = {
      7: '🔥 7 дней подряд в кабинете!\n\n+200 карма зачислено.\n\nСледующая цель: 14 дней → +500 карма.\nПродолжай!',
      14: '🔥🔥 2 недели подряд!\n\n+500 карма зачислено.\n\nСледующая цель: 30 дней → +1500 карма + ежедневный бонус.\nТы крут!',
      30: '🔥🔥🔥 30 дней подряд — легенда!\n\n+1500 карма зачислено.\n\nТеперь каждый день твоего стрика +50 карма автоматом. Не пропускай!',
    };
    const body = milestoneText[milestone];
    if (body) {
      sendNotification({
        userId,
        kind: 'karma_streak',
        title: `🔥 Серия ${milestone} дней — бонус ${bonusKarma > 0n ? '+' + Number(bonusKarma) : ''}`,
        body,
      }).catch((e: any) => logger.warn({ err: e?.message, userId, milestone }, 'streak notification failed'));
    }
  }

  return { streak: newStreak, karma: bonusKarma, milestone };
}
