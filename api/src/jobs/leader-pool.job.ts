/**
 * Leader pool distribution — twice a month (1st and 15th, at 12:00 MSK).
 *
 * The pool fund accumulates 5% of every partner-line accrual via
 * accrueLeaderPool() in services/income-split.ts (kind='leader_pool_fund'
 * on the matrix-position-0 admin user).
 *
 * Distribution per Golden Connect presentation page 11 (top-15 by partner
 * earnings during the period):
 *   1: 30%, 2: 20%, 3: 10%, 4: 6%, 5: 5%, 6: 5%,
 *   7: 4%,  8: 4%,  9: 3%, 10: 3%, 11: 3%, 12: 2%,
 *   13: 2%, 14: 2%, 15: 1%   (total 100%)
 *
 * Period:
 *   - 1st of month: distribute fund accumulated 16 → end of last month
 *   - 15th of month: distribute fund accumulated 1 → 14
 *
 * Top-15 ranked by SUM of cash_ledger amount_micro WHERE kind LIKE 'ref_L%'
 * during the period (their partner earnings drove the pool).
 *
 * Idempotent: writes leader_pool_distribution rows; checks before re-running.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sendNotification } from '../services/balances.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const DIST_PCT = [30, 20, 10, 6, 5, 5, 4, 4, 3, 3, 3, 2, 2, 2, 1]; // 15 ranks

interface PoolPeriod {
  startUtc: Date;
  endUtc: Date;
  label: string; // e.g. '2026-04-A' (first half) or '2026-04-B' (second half)
}

function currentPeriod(): PoolPeriod {
  const nowUtc = new Date();
  const nowMsk = new Date(nowUtc.getTime() + 3 * 3600 * 1000);
  const dom = nowMsk.getUTCDate();
  const year = nowMsk.getUTCFullYear();
  const month = nowMsk.getUTCMonth();

  if (dom <= 2) {
    // 1st distribution: cover 16th–end of LAST month
    const lastMonth = month === 0 ? 11 : month - 1;
    const lastYear = month === 0 ? year - 1 : year;
    const start = new Date(Date.UTC(lastYear, lastMonth, 16, -3, 0, 0, 0)); // 00:00 MSK
    const end = new Date(Date.UTC(year, month, 1, -3, 0, 0, 0));            // 00:00 MSK 1st
    return {
      startUtc: start, endUtc: end,
      label: `${lastYear}-${String(lastMonth + 1).padStart(2, '0')}-B`,
    };
  } else {
    // 15th distribution: cover 1st–14th of THIS month
    const start = new Date(Date.UTC(year, month, 1, -3, 0, 0, 0));   // 00:00 MSK 1st
    const end = new Date(Date.UTC(year, month, 15, -3, 0, 0, 0));    // 00:00 MSK 15th
    return {
      startUtc: start, endUtc: end,
      label: `${year}-${String(month + 1).padStart(2, '0')}-A`,
    };
  }
}

interface LeaderPoolWinner {
  user_id: number;
  partner_earned_micro: bigint;
}

async function processLeaderPool(): Promise<void> {
  const period = currentPeriod();

  // Idempotency: did we already run for this period?
  const existing = (await db.execute(sql`
    SELECT 1 FROM tariff_history
    WHERE action = 'leader_pool_distribution'
      AND source_wallet = ${period.label}
    LIMIT 1
  `)) as unknown as any[];
  if (existing.length > 0) {
    logger.info({ period: period.label }, 'leader-pool: already distributed for period');
    return;
  }

  // Pool fund: SUM(amount_micro) WHERE kind='leader_pool_fund' for the period
  const fundRows = (await db.execute(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::bigint AS total
    FROM cash_ledger
    WHERE kind = 'leader_pool_fund'
      AND created_at >= ${period.startUtc.toISOString()}
      AND created_at < ${period.endUtc.toISOString()}
  `)) as unknown as Array<{ total: string | number }>;
  const fundMicro = BigInt(fundRows[0]?.total ?? 0);

  if (fundMicro <= 0n) {
    logger.info({ period: period.label }, 'leader-pool: empty fund, skip');
    return;
  }

  // Top-15 by partner-line earnings (ref_Lx) during the period
  const top = (await db.execute(sql`
    SELECT user_id, SUM(amount_micro)::bigint AS earned
    FROM cash_ledger
    WHERE kind LIKE 'ref_L%'
      AND amount_micro > 0
      AND created_at >= ${period.startUtc.toISOString()}
      AND created_at < ${period.endUtc.toISOString()}
    GROUP BY user_id
    ORDER BY SUM(amount_micro) DESC
    LIMIT 15
  `)) as unknown as Array<{ user_id: number; earned: string | number }>;

  if (top.length === 0) {
    logger.info({ period: period.label, fund: fundMicro.toString() }, 'leader-pool: no eligible partners');
    return;
  }

  // Distribute
  let totalPaid = 0n;
  for (let i = 0; i < top.length; i++) {
    const winner = top[i];
    const pct = DIST_PCT[i] || 0;
    const prizeMicro = (fundMicro * BigInt(pct)) / 100n;
    if (prizeMicro <= 0n) continue;

    await db.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
      VALUES (${winner.user_id}, 'leader_pool_prize', ${Number(prizeMicro)},
              ${'leader_pool ' + period.label + ' rank_' + (i + 1)})
    `);

    const prizeUsd = (Number(prizeMicro) / 1e6).toFixed(2);
    const earnedUsd = (Number(winner.earned) / 1e6).toFixed(2);
    await sendNotification({
      userId: winner.user_id,
      kind: 'leader_pool_prize',
      severity: 'success',
      title: `🏆 Лидерский пул: $${prizeUsd}`,
      body: `Период ${period.label} · Место #${i + 1} в топ-15\nТвои партнёрские за период: $${earnedUsd}\n💰 $${prizeUsd} зачислено на 🟢 Основной баланс.`,
      url: '/cabinet/cabinet#/finance',
      meta: { period: period.label, rank: i + 1, prize_usd: Number(prizeUsd) },
    });
    totalPaid += prizeMicro;
  }

  // Mark distributed via tariff_history (cheap audit row)
  await db.execute(sql`
    INSERT INTO tariff_history (user_id, action, source_wallet, amount_micro)
    VALUES (0, 'leader_pool_distribution', ${period.label}, ${Number(totalPaid)})
  `);

  logger.info(
    { period: period.label, fund_micro: fundMicro.toString(), paid_micro: totalPaid.toString(), winners: top.length },
    'leader-pool: distributed',
  );
}

// 1st and 15th at 12:00 MSK = 09:00 UTC
registerJob({
  name: 'leader-pool',
  schedule: '0 9 1,15 * *',
  handler: processLeaderPool,
});

logger.info('leader-pool: worker registered (1st & 15th at 12:00 MSK)');
