/**
 * Tariff renewal cron — Trendex Phase 5.
 *
 * Runs daily at 09:00 MSK. For every user with an active paid tariff:
 *
 *   T-3 (3 days before expires) → reminder: "Через 3 дня списание $15"
 *   T-1                          → reminder: "Завтра $15. Хватает: ✅/❌"
 *   T-0 (day of expiration)      → attempt auto-renewal:
 *                                    a) try debit subscription_balance_micro
 *                                    b) if not enough, debit working balance
 *                                    c) if both empty/insufficient → no-op
 *   T+1 (day after expired)      → if not renewed → downgrade to FREE
 *                                    (business_seats KEEP, just user.active_tariff_code='free')
 *
 * Each step writes a notifications_inbox row (auto-pushed to bot via
 * inbox-tg-deliver worker). Idempotent — checks tariff_history before
 * acting to avoid double-charging.
 *
 * Renewal cost = monthly_fee_micro from tariffs table (\$15 across all
 * paid tiers).
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { sendNotification } from '../services/balances.js';
import { logger } from '../lib/logger.js';
import { registerJob } from './scheduler.js';

const RENEWAL_DAYS = 30;

interface ExpiringUser {
  id: number;
  tg_id: number | null;
  email: string | null;
  active_tariff_code: string;
  tariff_expires_at: string;
  tariff_auto_renew: boolean;
  subscription_balance_micro: string | number;
  monthly_fee_micro: string | number;
  working_balance_micro: string | number;
}

async function loadExpiring(daysAhead: number): Promise<ExpiringUser[]> {
  // daysAhead=3,1,0,-1 → T-3, T-1, T-0, T+1
  return (await db.execute(sql`
    SELECT
      u.id, u.tg_id, u.email,
      u.active_tariff_code, u.tariff_expires_at, u.tariff_auto_renew,
      u.subscription_balance_micro::text AS subscription_balance_micro,
      t.monthly_fee_micro::text AS monthly_fee_micro,
      COALESCE((SELECT SUM(amount_micro) FROM cash_ledger WHERE user_id = u.id), 0)::text AS working_balance_micro
    FROM users u
    LEFT JOIN tariffs t ON t.code = u.active_tariff_code
    WHERE u.active_tariff_code != 'free'
      AND u.tariff_expires_at IS NOT NULL
      AND DATE(u.tariff_expires_at) = (CURRENT_DATE + ${daysAhead}::int * INTERVAL '1 day')::date
    ORDER BY u.id
  `)) as unknown as ExpiringUser[];
}

/** Already notified this cycle? Check tariff_history for a recent entry. */
async function alreadyHandled(userId: number, action: string, sinceHours: number): Promise<boolean> {
  const r = (await db.execute(sql`
    SELECT 1 FROM tariff_history
    WHERE user_id = ${userId} AND action = ${action}
      AND created_at >= NOW() - (${sinceHours} || ' hours')::interval
    LIMIT 1
  `)) as unknown as Array<{ '?column?': number }>;
  return r.length > 0;
}

async function recordHistory(
  userId: number,
  action: string,
  prevTariff: string,
  newTariff: string,
  amountMicro: bigint,
  source: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO tariff_history (user_id, action, prev_tariff, new_tariff, amount_micro, source_wallet)
    VALUES (${userId}, ${action}, ${prevTariff}, ${newTariff}, ${Number(amountMicro)}, ${source})
  `);
}

// ─────────── T-3: 3-day reminder ───────────
async function processT3(): Promise<number> {
  const users = await loadExpiring(3);
  let sent = 0;
  for (const u of users) {
    if (await alreadyHandled(u.id, 'reminder_t3', 23)) continue;
    const renewalUsd = Number(u.monthly_fee_micro) / 1e6;
    const subUsd = Number(u.subscription_balance_micro) / 1e6;
    const enough = Number(u.subscription_balance_micro) >= Number(u.monthly_fee_micro);
    await sendNotification({
      userId: u.id,
      kind: 'tariff_renewal_reminder_t3',
      severity: 'info',
      title: `📅 Через 3 дня — продление тарифа`,
      body: `Тариф ${u.active_tariff_code.toUpperCase()} истекает через 3 дня.\nСумма продления: $${renewalUsd}.\nНа автоподписке: $${subUsd.toFixed(2)} ${enough ? '✅ хватает' : '— не хватает, пополни'}.`,
      url: '/cabinet/cabinet#/finance',
      meta: { tariff: u.active_tariff_code, renewal_usd: renewalUsd, has_funds: enough },
    });
    await recordHistory(u.id, 'reminder_t3', u.active_tariff_code, u.active_tariff_code, 0n, 'cron');
    sent++;
  }
  return sent;
}

// ─────────── T-1: tomorrow reminder ───────────
async function processT1(): Promise<number> {
  const users = await loadExpiring(1);
  let sent = 0;
  for (const u of users) {
    if (await alreadyHandled(u.id, 'reminder_t1', 23)) continue;
    const renewalMicro = BigInt(u.monthly_fee_micro);
    const subMicro = BigInt(u.subscription_balance_micro);
    const workMicro = BigInt(u.working_balance_micro);
    const totalMicro = subMicro + workMicro;
    const enough = totalMicro >= renewalMicro;
    const renewalUsd = Number(renewalMicro) / 1e6;
    await sendNotification({
      userId: u.id,
      kind: 'tariff_renewal_reminder_t1',
      severity: enough ? 'warning' : 'error',
      title: `⏰ Завтра — списание $${renewalUsd}`,
      body: enough
        ? `Завтра спишется $${renewalUsd} с автоподписки за продление ${u.active_tariff_code.toUpperCase()}.\n${subMicro >= renewalMicro ? '✅ Полностью с автоподписки' : `🟣 С автоподписки: $${(Number(subMicro)/1e6).toFixed(2)}\n🟢 С основного: $${(Number(renewalMicro - subMicro)/1e6).toFixed(2)}`}`
        : `⚠️ НЕ ХВАТАЕТ $${(Number(renewalMicro - totalMicro)/1e6).toFixed(2)} для продления!\nЕсли не пополнить — завтра тариф понизится до FREE (места сохранятся).\nПополни баланс до 09:00 завтра.`,
      url: '/cabinet/cabinet#/finance',
      meta: { tariff: u.active_tariff_code, renewal_usd: renewalUsd, enough },
    });
    await recordHistory(u.id, 'reminder_t1', u.active_tariff_code, u.active_tariff_code, 0n, 'cron');
    sent++;
  }
  return sent;
}

// ─────────── T-0: actual renewal attempt ───────────
async function processT0(): Promise<{ renewed: number; insufficient: number; skipped: number }> {
  const users = await loadExpiring(0);
  let renewed = 0, insufficient = 0, skipped = 0;
  for (const u of users) {
    if (!u.tariff_auto_renew) {
      skipped++;
      continue;
    }
    if (await alreadyHandled(u.id, 'renew', 23)) continue;

    const renewalMicro = BigInt(u.monthly_fee_micro);
    const subMicro = BigInt(u.subscription_balance_micro);
    const workMicro = BigInt(u.working_balance_micro);
    const totalAvail = subMicro + workMicro;

    if (totalAvail < renewalMicro) {
      // Insufficient — notify only, don't downgrade yet (T+1 handles that)
      const need = renewalMicro - totalAvail;
      await sendNotification({
        userId: u.id,
        kind: 'tariff_insufficient',
        severity: 'error',
        title: `🚨 Не хватает $${(Number(need)/1e6).toFixed(2)} для продления`,
        body: `Тариф ${u.active_tariff_code.toUpperCase()} истекает СЕГОДНЯ.\nДоступно: $${(Number(totalAvail)/1e6).toFixed(2)} (Sub+Working).\nНужно: $${(Number(renewalMicro)/1e6).toFixed(2)}.\n\nЕсли не пополнить до 09:00 завтра — тариф понизится до FREE.\nБизнес-места ОСТАНУТСЯ — после оплаты тариф восстановится.`,
        url: '/cabinet/cabinet#/finance',
        meta: { tariff: u.active_tariff_code, renewal_usd: Number(renewalMicro)/1e6, shortfall_usd: Number(need)/1e6 },
      });
      await recordHistory(u.id, 'renew_failed', u.active_tariff_code, u.active_tariff_code, renewalMicro, 'cron_insufficient');
      insufficient++;
      continue;
    }

    // Enough — debit, extend, notify success
    const newExpires = new Date(Date.now() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);
    const fromSub = subMicro >= renewalMicro ? renewalMicro : subMicro;
    const fromWork = renewalMicro - fromSub;

    try {
      await db.transaction(async (tx) => {
        if (fromSub > 0n) {
          await tx.execute(sql`
            UPDATE users SET subscription_balance_micro = subscription_balance_micro - ${Number(fromSub)}
            WHERE id = ${u.id}
          `);
          await tx.execute(sql`
            INSERT INTO wallet_transfers (user_id, from_wallet, to_wallet, amount_micro, memo)
            VALUES (${u.id}, 'subscription', 'tariff_renewal', ${Number(fromSub)},
                    ${'auto-renew ' + u.active_tariff_code})
          `);
        }
        if (fromWork > 0n) {
          await tx.execute(sql`
            INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
            VALUES (${u.id}, 'tariff_renewal', ${-Number(fromWork)},
                    ${'auto-renew from working ' + u.active_tariff_code})
          `);
        }
        await tx.execute(sql`
          UPDATE users SET tariff_expires_at = ${newExpires.toISOString()}
          WHERE id = ${u.id}
        `);
        // Extend monthly_fee_paid_until on all business_seats
        await tx.execute(sql`
          UPDATE business_seats SET monthly_fee_paid_until = ${newExpires.toISOString()}
          WHERE user_id = ${u.id} AND deactivated_at IS NULL
        `);
      });
      await recordHistory(u.id, 'renew', u.active_tariff_code, u.active_tariff_code, renewalMicro,
        fromSub > 0n && fromWork === 0n ? 'subscription' : fromWork > 0n && fromSub === 0n ? 'working' : 'mix');
      await sendNotification({
        userId: u.id,
        kind: 'tariff_renewed',
        severity: 'success',
        title: `✅ Тариф продлён на 30 дней`,
        body: `${u.active_tariff_code.toUpperCase()} активен до ${newExpires.toLocaleDateString('ru-RU')}.\nСписано: $${(Number(renewalMicro)/1e6).toFixed(2)} (${fromSub > 0n ? `🟣 авто $${(Number(fromSub)/1e6).toFixed(2)}` : ''}${fromSub > 0n && fromWork > 0n ? ' + ' : ''}${fromWork > 0n ? `🟢 основной $${(Number(fromWork)/1e6).toFixed(2)}` : ''}).`,
        url: '/cabinet/cabinet#/finance',
        meta: { tariff: u.active_tariff_code, renewal_usd: Number(renewalMicro)/1e6 },
      });
      renewed++;
    } catch (e: any) {
      logger.error({ userId: u.id, err: e.message }, 'tariff renewal failed');
    }
  }
  return { renewed, insufficient, skipped };
}

// ─────────── T+1: downgrade unpaid ───────────
async function processTplus1(): Promise<number> {
  const users = await loadExpiring(-1);
  let downgraded = 0;
  for (const u of users) {
    if (await alreadyHandled(u.id, 'expire', 47)) continue;
    // Verify still expired (some edge case might have renewed late)
    const cur = (await db.execute(sql`
      SELECT active_tariff_code, tariff_expires_at FROM users WHERE id = ${u.id}
    `)) as unknown as Array<{ active_tariff_code: string; tariff_expires_at: string }>;
    if (!cur[0] || cur[0].active_tariff_code === 'free') continue;
    if (new Date(cur[0].tariff_expires_at) > new Date()) continue;

    await db.execute(sql`
      UPDATE users SET active_tariff_code = 'free', tariff_auto_renew = false
      WHERE id = ${u.id}
    `);
    // business_seats are KEPT (Q4=a per user spec — places saved forever)
    await recordHistory(u.id, 'expire', u.active_tariff_code, 'free', 0n, 'cron_expired');
    await sendNotification({
      userId: u.id,
      kind: 'tariff_expired',
      severity: 'error',
      title: `⚠️ Тариф ${u.active_tariff_code.toUpperCase()} понижен до FREE`,
      body: `Не получилось списать $${(Number(u.monthly_fee_micro)/1e6).toFixed(2)} за продление.\n\n✅ Бизнес-места СОХРАНЕНЫ — после пополнения тариф можно восстановить.\n\nПополни баланс и купи тариф снова через #/marketing.`,
      url: '/cabinet/cabinet#/marketing',
      meta: { prev_tariff: u.active_tariff_code },
    });
    downgraded++;
  }
  return downgraded;
}

// ─────────── Main worker ───────────
async function processTariffRenewals(): Promise<void> {
  try {
    const t3 = await processT3();
    const t1 = await processT1();
    const t0 = await processT0();
    const tplus1 = await processTplus1();
    if (t3 + t1 + t0.renewed + t0.insufficient + tplus1 > 0) {
      logger.info(
        { t3_reminder: t3, t1_reminder: t1, t0_renewed: t0.renewed, t0_insufficient: t0.insufficient, tplus1_downgraded: tplus1 },
        'tariff-renewal: tick complete',
      );
    }
  } catch (e: any) {
    logger.error({ err: e.message }, 'tariff-renewal: tick failed');
  }
}

// Cron: 09:00 МСК = 06:00 UTC. Daily.
registerJob({
  name: 'tariff-renewal',
  schedule: '0 6 * * *',
  handler: processTariffRenewals,
});

logger.info('tariff-renewal: worker registered (daily 09:00 MSK)');
