/**
 * Karma weekly raffle — Sunday 20:00 MSK (17:00 UTC).
 *
 * v2: Admin-triggered draw.
 *   - Cron at Sun 20:00 MSK only PREPARES the raffle (creates a row with
 *     status='pending_admin') and notifies @MLM808 (or any admin in
 *     ADMIN_TG_IDS) via Telegram with two inline buttons:
 *       [🎲 Разыграть] → POST /internal/karma-raffle/run/:id
 *       [⏭ Перенести]  → POST /internal/karma-raffle/skip/:id
 *   - Actual draw happens only when admin clicks the button.
 *
 * Distribution: $100 prize pool by ranking — 1st $30, 2nd $20, 3rd $15,
 *   4th $10, 5th $8, 6th $6, 7th $4, 8th $3, 9th $2, 10th $2 = $100.
 *
 * Idempotent: pending_admin row blocks re-prep; completed/reverted blocks re-draw.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sendNotification } from '../services/balances.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const PRIZE_POOL_USD = 100;
const DIST_PCT = [30, 20, 15, 10, 8, 6, 4, 3, 2, 2];

interface WeekBounds {
  start: Date;
  end: Date;
  weekStartDateStr: string;
}

function currentWeekBounds(): WeekBounds {
  const nowUtc = new Date();
  const nowMsk = new Date(nowUtc.getTime() + 3 * 3600 * 1000);
  const dayOfWeek = nowMsk.getUTCDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(Date.UTC(
    nowMsk.getUTCFullYear(), nowMsk.getUTCMonth(),
    nowMsk.getUTCDate() - daysSinceMonday, 0, 0, 0, 0
  ));
  const mondayUtc = new Date(monday.getTime() - 3 * 3600 * 1000);
  const sunday = new Date(mondayUtc.getTime() + 6 * 86400 * 1000 + 23 * 3600 * 1000 + 59 * 60 * 1000);
  return {
    start: mondayUtc,
    end: sunday,
    weekStartDateStr: monday.toISOString().slice(0, 10),
  };
}

interface TopWinner { user_id: number; pts: string | number; }

async function getTopForRaffle(bounds: WeekBounds): Promise<TopWinner[]> {
  // Group by COALESCE(tg_id, id) to prevent the same human getting two prizes
  // via duplicate accounts (TG-only + email-linked). Cf. raffle id=1 incident.
  return (await db.execute(sql`
    WITH per_user AS (
      SELECT kl.user_id, SUM(kl.points)::bigint AS pts
      FROM karma_log kl
      WHERE kl.points > 0
        AND kl.created_at >= ${bounds.start.toISOString()}
        AND kl.created_at <= ${bounds.end.toISOString()}
      GROUP BY kl.user_id
    ), dedup AS (
      SELECT DISTINCT ON (COALESCE(u.tg_id::text, 'u' || u.id::text))
        pu.user_id, pu.pts
      FROM per_user pu
      JOIN users u ON u.id = pu.user_id
      ORDER BY COALESCE(u.tg_id::text, 'u' || u.id::text), pu.pts DESC
    )
    SELECT user_id, pts FROM dedup
    ORDER BY pts DESC
    LIMIT 10
  `)) as unknown as TopWinner[];
}

/**
 * Send Telegram message via Bot API.
 * Reads BOT_TOKEN + ADMIN_TG_IDS from env.
 */
async function sendTgToAdmins(text: string, replyMarkup?: any): Promise<void> {
  const botToken = process.env.BOT_TOKEN;
  const adminIds = (process.env.ADMIN_TG_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!botToken || !adminIds.length) {
    logger.warn('karma-raffle: BOT_TOKEN or ADMIN_TG_IDS not set, skipping admin TG notify');
    return;
  }
  for (const tgId of adminIds) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: tgId,
          text,
          parse_mode: 'HTML',
          reply_markup: replyMarkup,
          disable_web_page_preview: true,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        logger.warn({ tgId, status: res.status, body: t.slice(0, 200) }, 'karma-raffle: admin TG send failed');
      }
    } catch (e: any) {
      logger.warn({ tgId, err: e?.message }, 'karma-raffle: admin TG send error');
    }
  }
}

/**
 * CRON: prepare a pending_admin raffle row + notify admin via TG.
 * Does NOT distribute prizes.
 */
async function prepareWeeklyRaffle(): Promise<void> {
  const bounds = currentWeekBounds();

  const existing = (await db.execute(sql`
    SELECT id, status FROM karma_raffles WHERE week_start = ${bounds.weekStartDateStr}::date LIMIT 1
  `)) as unknown as Array<{ id: number; status: string }>;

  if (existing[0] && ['completed', 'reverted', 'skipped'].includes(existing[0].status)) {
    logger.info({ week: bounds.weekStartDateStr, status: existing[0].status }, 'karma-raffle: already finalized, skip');
    return;
  }
  if (existing[0]?.status === 'pending_admin') {
    logger.info({ week: bounds.weekStartDateStr }, 'karma-raffle: already pending admin decision, re-notify');
    // fall through and re-send TG so admin doesn't miss it
  }

  const top = await getTopForRaffle(bounds);
  if (top.length === 0) {
    logger.info({ week: bounds.weekStartDateStr }, 'karma-raffle: no participants, skip');
    return;
  }

  let raffleId: number;
  if (existing[0]) {
    raffleId = existing[0].id;
    await db.execute(sql`UPDATE karma_raffles SET status='pending_admin' WHERE id=${raffleId}`);
  } else {
    const ins = (await db.execute(sql`
      INSERT INTO karma_raffles (week_start, week_end, prize_pool_micro, status)
      VALUES (${bounds.weekStartDateStr}::date, ${bounds.end.toISOString().slice(0, 10)}::date,
              ${PRIZE_POOL_USD * 1_000_000}, 'pending_admin')
      RETURNING id
    `)) as unknown as Array<{ id: number }>;
    raffleId = ins[0].id;
  }

  // Format admin message
  const userInfos = (await db.execute(sql`
    SELECT id, COALESCE(tg_username, username, ('user_' || id)) AS handle
    FROM users WHERE id = ANY(${sql.raw('ARRAY[' + top.map((t) => t.user_id).join(',') + ']')}::int[])
  `)) as unknown as Array<{ id: number; handle: string }>;
  const idToHandle = new Map(userInfos.map((u) => [Number(u.id), u.handle]));

  let msg = `🎲 <b>Розыгрыш кармы — неделя ${bounds.weekStartDateStr}</b>\n\n`;
  msg += `Призовой пул: <b>$${PRIZE_POOL_USD}</b>. Топ ${top.length} участников:\n\n`;
  top.forEach((w, i) => {
    const pct = DIST_PCT[i] || 0;
    const prizeUsd = (PRIZE_POOL_USD * pct) / 100;
    const handle = idToHandle.get(Number(w.user_id)) || `user_${w.user_id}`;
    msg += `${i + 1}. @${handle} — ${w.pts} pts → $${prizeUsd}\n`;
  });
  msg += `\nВыбери действие:`;

  const replyMarkup = {
    inline_keyboard: [[
      { text: '🎲 Разыграть сейчас', callback_data: `kraf_run:${raffleId}` },
      { text: '⏭ Перенести на след. неделю', callback_data: `kraf_skip:${raffleId}` },
    ]],
  };

  await sendTgToAdmins(msg, replyMarkup);
  logger.info({ raffleId, week: bounds.weekStartDateStr, topSize: top.length }, 'karma-raffle: admin notified, awaiting decision');
}

/**
 * Execute draw for a specific raffleId. Called from API endpoint when admin
 * clicks "🎲 Разыграть сейчас". Re-fetches top from karma_log to avoid
 * acting on stale snapshot if any awards happened between prep and run.
 */
export async function executeRaffleDraw(raffleId: number): Promise<{
  ok: boolean;
  reason?: string;
  winners_count?: number;
  total_paid_micro?: number;
}> {
  const r = (await db.execute(sql`
    SELECT id, week_start, week_end, status, prize_pool_micro
    FROM karma_raffles WHERE id = ${raffleId} LIMIT 1
  `)) as unknown as Array<{
    id: number; week_start: string; week_end: string; status: string; prize_pool_micro: number;
  }>;
  if (!r[0]) return { ok: false, reason: 'not_found' };
  if (['completed', 'skipped'].includes(r[0].status)) return { ok: false, reason: 'already_' + r[0].status };

  const bounds: WeekBounds = {
    start: new Date(r[0].week_start + 'T00:00:00Z'),
    end: new Date(r[0].week_end + 'T23:59:59Z'),
    weekStartDateStr: r[0].week_start.slice(0, 10),
  };
  const top = await getTopForRaffle(bounds);
  if (top.length === 0) {
    await db.execute(sql`UPDATE karma_raffles SET status='skipped', drawn_at=NOW() WHERE id=${raffleId}`);
    return { ok: false, reason: 'no_participants' };
  }

  let totalPaid = 0;
  let totalPaidMicro = 0;
  for (let i = 0; i < top.length; i++) {
    const winner = top[i];
    const pct = DIST_PCT[i] || 0;
    const prizeUsd = (PRIZE_POOL_USD * pct) / 100;
    const prizeMicro = BigInt(Math.floor(prizeUsd * 1_000_000));
    if (prizeMicro <= 0n) continue;

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
        VALUES (${winner.user_id}, 'karma_raffle_prize', ${Number(prizeMicro)},
                ${'week_' + bounds.weekStartDateStr + ' rank_' + (i + 1)})
      `);
      await tx.execute(sql`
        INSERT INTO karma_raffle_winners (raffle_id, user_id, position, karma_points_at_draw, prize_micro, paid_at)
        VALUES (${raffleId}, ${winner.user_id}, ${i + 1}, ${Number(winner.pts)}, ${Number(prizeMicro)}, NOW())
      `);
    });

    await sendNotification({
      userId: winner.user_id,
      kind: 'karma_raffle_won',
      severity: 'success',
      title: `🎉 Ты выиграл $${prizeUsd} в розыгрыше кармы!`,
      body: `Место в топе: #${i + 1} · Кармы за неделю: ${winner.pts}\n💰 $${prizeUsd} зачислено на 🟢 Основной баланс — можно вывести.`,
      url: '/cabinet#/finance',
      meta: { rank: i + 1, prize_usd: prizeUsd, week: bounds.weekStartDateStr, karma: String(winner.pts) },
    });

    totalPaid++;
    totalPaidMicro += Number(prizeMicro);
  }

  await db.execute(sql`
    UPDATE karma_raffles SET status='completed', drawn_at=NOW(), winners_count=${totalPaid} WHERE id=${raffleId}
  `);
  try {
    await db.execute(sql`UPDATE users SET karma_points=0 WHERE karma_points > 0`);
  } catch (e: any) {
    logger.error({ err: e?.message }, 'karma-raffle: weekly reset failed');
  }
  logger.info({ raffleId, winners: totalPaid }, 'karma-raffle: drawn by admin');
  return { ok: true, winners_count: totalPaid, total_paid_micro: totalPaidMicro };
}

/** Mark raffle as skipped (no draw this week, prize pool not used). */
export async function skipRaffle(raffleId: number): Promise<{ ok: boolean; reason?: string }> {
  const r = (await db.execute(sql`SELECT status FROM karma_raffles WHERE id=${raffleId}`)) as unknown as Array<{ status: string }>;
  if (!r[0]) return { ok: false, reason: 'not_found' };
  if (['completed', 'skipped'].includes(r[0].status)) return { ok: false, reason: 'already_' + r[0].status };
  await db.execute(sql`UPDATE karma_raffles SET status='skipped', drawn_at=NOW() WHERE id=${raffleId}`);
  // Carry karma_points to next week (do NOT reset)
  logger.info({ raffleId }, 'karma-raffle: skipped by admin (karma carries to next week)');
  return { ok: true };
}

// Sunday 20:00 MSK = Sunday 17:00 UTC — only PREPARE + notify admin.
registerJob({
  name: 'karma-raffle-prepare',
  schedule: '0 17 * * 0',
  handler: prepareWeeklyRaffle,
});

logger.info('karma-raffle: v2 worker registered (Sun 20:00 MSK — admin-triggered)');
