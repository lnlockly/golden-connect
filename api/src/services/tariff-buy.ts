/**
 * Buy / upgrade / renew a tariff using internal balances (no external pay).
 *
 * Wraps the existing processLinearOnly() entry processor, but funds the
 * purchase from `subscription_balance_micro` + working balance instead of
 * from an external payment. Sequence:
 *
 *  1. Read user's working + subscription balances + cap
 *  2. Pre-check sufficient combined funds for entryMicro (or upgrade delta)
 *  3. Move funds: subscription → working for the part covered by subscription
 *     (uses transferBetweenWallets — single audit trail in wallet_transfers)
 *  4. processLinearOnly() — debits working as `entry_fee`, pays 10-lvl
 *     referrals + Matching Bonus + 10% admin fee, creates userTariffs row
 *  5. Insert N business_seats (1/2/3 by tariff)
 *  6. Update users.active_tariff_code / started_at / expires_at
 *  7. Write tariff_history audit row
 *  8. Send "tariff_purchased" notification via inbox+bot
 *
 * Matrix is FROZEN pre-launch (see users.matrix_frozen). Seats are created
 * but not placed into matrix tree — Phase 10 launch button does the
 * retroactive backfill in activated_at order.
 */

import { sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, type DB } from '../db/client.js';
import { processLinearOnly } from './entry-processor.js';
import {
  readBalances,
  transferBetweenWallets,
  sendNotification,
} from './balances.js';
import { logger } from '../lib/logger.js';
import { placeSeatForUser, placeAllSeatsForUser, isMatrixLaunched } from './matrix-launch.js';
import { awardKarma } from './karma.js';
import { creditForSeatActivation } from './gift-balance.js';

const RENEWAL_DAYS = 30;

export type TariffCode = 'launch' | 'boost' | 'rocket';

const SEATS_BY_TARIFF: Record<TariffCode, number> = {
  launch: 1,
  boost: 2,
  rocket: 3,
};

const PRICE_USD: Record<TariffCode, number> = {
  launch: 45,
  boost: 90,
  rocket: 135,
};

export type SourcePolicy = 'subscription_first' | 'working_first' | 'subscription_only';

export interface AllocateResult {
  ok: boolean;
  reason?: 'insufficient_funds' | 'insufficient_subscription';
  fromSub: bigint;
  fromWork: bigint;
}

/**
 * Pure allocation of a tariff cost across (subscription, working) balances.
 *
 * Returns ok=false with a structured reason when funds can't cover the cost
 * (caller maps that to the BuyTariffResult error path). When ok=true,
 * fromSub + fromWork == cost is invariant.
 */
export function allocatePayment(
  cost: bigint,
  subscription: bigint,
  working: bigint,
  policy: SourcePolicy,
): AllocateResult {
  if (policy === 'subscription_only') {
    if (subscription < cost) {
      return { ok: false, reason: 'insufficient_subscription', fromSub: 0n, fromWork: 0n };
    }
    return { ok: true, fromSub: cost, fromWork: 0n };
  }

  if (subscription + working < cost) {
    return { ok: false, reason: 'insufficient_funds', fromSub: 0n, fromWork: 0n };
  }

  if (policy === 'working_first') {
    const fromWork = cost <= working ? cost : working;
    const fromSub = cost - fromWork;
    return { ok: true, fromSub, fromWork };
  }

  // subscription_first (default)
  const fromSub = cost <= subscription ? cost : subscription;
  const fromWork = cost - fromSub;
  return { ok: true, fromSub, fromWork };
}

export interface BuyTariffArgs {
  userId: number;
  tariffCode: TariffCode;
  /**
   * 'subscription_first' (default): drain subscription_balance first, top
   * up the rest from working. 'working_first': inverse. 'subscription_only'
   * fails if subscription alone isn't enough.
   */
  sourcePolicy?: 'subscription_first' | 'working_first' | 'subscription_only';
}

export interface BuyTariffResult {
  ok: boolean;
  reason?: string;
  tariff_code?: TariffCode;
  amount_paid_micro?: string;
  paid_from_subscription_micro?: string;
  paid_from_working_micro?: string;
  expires_at?: string;
  seats_created?: number;
  partner_chain_depth?: number;
}

/**
 * Resolve tariff_id from `tariffs` table by code (the table holds the
 * canonical price/depth/rate config).
 */
async function getTariffByCode(tx: DB, code: string): Promise<{
  id: number;
  entryMicro: bigint;
  businessSeatsCount: number;
} | null> {
  const rows = (await tx.execute(sql`
    SELECT id, entry_micro, business_seats_count
    FROM tariffs
    WHERE code = ${code} AND is_active = true
    LIMIT 1
  `)) as unknown as Array<{ id: number; entry_micro: string | number; business_seats_count: number }>;
  if (!rows[0]) return null;
  return {
    id: Number(rows[0].id),
    entryMicro: BigInt(rows[0].entry_micro),
    businessSeatsCount: Number(rows[0].business_seats_count),
  };
}

/**
 * BUY a tariff for an user that's currently FREE (no active paid tariff).
 * For upgrades from a paid tariff, use `upgradeTariff()` below.
 */
export async function buyTariffFromBalance(args: BuyTariffArgs): Promise<BuyTariffResult> {
  const { userId, tariffCode } = args;
  const sourcePolicy = args.sourcePolicy || 'subscription_first';

  const balances = await readBalances(userId);
  if (balances.active_tariff !== 'free' && balances.active_tariff !== '') {
    return { ok: false, reason: 'already_has_paid_tariff_use_upgrade' };
  }

  // Resolve tariff config
  const tariff = await getTariffByCode(db as unknown as DB, tariffCode);
  if (!tariff) return { ok: false, reason: 'tariff_not_found' };
  const cost = tariff.entryMicro;

  // Combined affordability
  const total = balances.working_micro + balances.subscription_micro;
  if (total < cost) {
    return {
      ok: false,
      reason: 'insufficient_funds',
      amount_paid_micro: cost.toString(),
      paid_from_subscription_micro: '0',
      paid_from_working_micro: '0',
    };
  }

  // Allocate: how much from each wallet
  const alloc = allocatePayment(
    cost, balances.subscription_micro, balances.working_micro, sourcePolicy,
  );
  if (!alloc.ok) return { ok: false, reason: alloc.reason };
  const { fromSub, fromWork } = alloc;

  // Atomic: move subscription → working, then run entry processor (which
  // debits working as entry_fee + pays referrals + matching + admin fee).
  let chainDepth = 0;
  await db.transaction(async (tx) => {
    if (fromSub > 0n) {
      // Move subscription→working as a top-up for the entry processor
      await transferBetweenWallets(
        userId, 'subscription', 'working', fromSub,
        `tariff_buy:${tariffCode}:from_subscription`,
      );
    }

    // Now working balance has the full cost — run entry processor.
    // It writes a -cost entry_fee row in cash_ledger, pays partner chain,
    // creates a userTariffs row, and runs admin fee.
    const refId = 'balance:' + crypto.randomUUID().slice(0, 12);
    const result = await processLinearOnly({
      userId,
      tariffId: tariff.id,
      paymentRefId: refId,
      tx: tx as unknown as DB,
    });
    chainDepth = result.referralsPaidLevels;

    // Set up tariff lifecycle on users table
    const expiresAt = new Date(Date.now() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);
    await tx.execute(sql`
      UPDATE users SET
        active_tariff_code = ${tariffCode},
        tariff_started_at = NOW(),
        tariff_expires_at = ${expiresAt.toISOString()},
        tariff_auto_renew = true
      WHERE id = ${userId}
    `);

    // Create N business_seats — each pinned to this tariff at activation time.
    // Pre-launch: matrix_position is NULL (filled later by Phase 10 admin button).
    const seatCount = SEATS_BY_TARIFF[tariffCode];
    const seatIds: number[] = [];
    for (let i = 1; i <= seatCount; i++) {
      const r = (await tx.execute(sql`
        INSERT INTO business_seats (user_id, tariff_id, seat_index, monthly_fee_paid_until)
        VALUES (${userId}, ${tariff.id}, ${i}, ${expiresAt.toISOString()})
        RETURNING id
      `)) as unknown as Array<{ id: number }>;
      seatIds.push(r[0].id);
    }

    // Gift balance accrual — $10 (pre-launch) / $5 (post-launch) per seat.
    // LAUNCH 1×=$10, BOOST 2×=$20, ROCKET 3×=$30 in pre-launch mode.
    for (const seatId of seatIds) {
      await creditForSeatActivation(userId, seatId, tx as unknown as DB);
    }

    // Audit row
    await tx.execute(sql`
      INSERT INTO tariff_history
        (user_id, action, prev_tariff, new_tariff, prev_seats, new_seats,
         amount_micro, source_wallet, expires_at)
      VALUES
        (${userId}, 'buy', 'free', ${tariffCode},
         0, ${seatCount}, ${Number(cost)},
         ${sourcePolicy}, ${expiresAt.toISOString()})
    `);

    // Matrix placement (post-launch only) — pre-launch, business_seat is
    // created but no matrix node; admin button later does the backfill.
    try {
      const launched = await isMatrixLaunched();
      if (launched) {
        const positions = await placeAllSeatsForUser(tx as unknown as DB, userId, seatCount);
        logger.info({ userId, positions, tariff: tariffCode, seatCount }, 'matrix: all seats placed at buy');
      }
    } catch (e: any) {
      logger.warn({ userId, err: e.message }, 'matrix placement failed (non-fatal)');
    }
  });

  // Karma reward for tariff buy (+20)
  await awardKarma(userId, 'self_buy_tariff', null, 'tariff ' + tariffCode);

  // Award inviter +10 karma (referral_bought)
  try {
    const invRow = (await db.execute(sql`
      SELECT invited_by_user_id FROM users WHERE id = ${userId} LIMIT 1
    `)) as unknown as Array<{ invited_by_user_id: number | null }>;
    if (invRow[0]?.invited_by_user_id) {
      await awardKarma(invRow[0].invited_by_user_id, 'referral_bought', userId,
        'referral bought ' + tariffCode);
    }
  } catch { /* non-fatal */ }

  // Notification — UNIFIED (cabinet bell + bot push via worker)
  await sendNotification({
    userId,
    kind: 'tariff_purchased',
    severity: 'success',
    title: `🚀 Тариф ${tariffCode.toUpperCase()} активирован`,
    body: `Списано $${PRICE_USD[tariffCode]}. Открыто ${SEATS_BY_TARIFF[tariffCode]} бизнес-мест${SEATS_BY_TARIFF[tariffCode] === 1 ? '' : 'а'}.\nСледующее списание — через 30 дней.`,
    url: '/cabinet/cabinet#/finance',
    meta: {
      tariff: tariffCode,
      cost_usd: PRICE_USD[tariffCode],
      from_subscription_usd: Number(fromSub) / 1e6,
      from_working_usd: Number(fromWork) / 1e6,
    },
  });

  logger.info(
    { userId, tariff: tariffCode, fromSub: fromSub.toString(), fromWork: fromWork.toString(), chainDepth },
    'tariff bought from balance',
  );

  return {
    ok: true,
    tariff_code: tariffCode,
    amount_paid_micro: cost.toString(),
    paid_from_subscription_micro: fromSub.toString(),
    paid_from_working_micro: fromWork.toString(),
    expires_at: new Date(Date.now() + RENEWAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    seats_created: SEATS_BY_TARIFF[tariffCode],
    partner_chain_depth: chainDepth,
  };
}

/**
 * UPGRADE current paid tariff (LAUNCH→BOOST, LAUNCH→ROCKET, BOOST→ROCKET).
 *
 *   delta = target.price − current.price
 *   delta_seats = target.seats − current.seats
 *
 * Charges only the delta (доплата), pays referrals on the delta amount
 * by the NEW tariff's curve (since user is now on the new tier),
 * adds delta_seats new business_seats. Existing seats keep their original
 * tariff_at_placement (matrix payouts use that historical tariff once
 * matrix unfreezes — we don't rewrite history).
 *
 * Downgrades are NOT supported (returns reason='cannot_downgrade').
 */
export async function upgradeTariffFromBalance(args: BuyTariffArgs): Promise<BuyTariffResult> {
  const { userId, tariffCode: targetCode } = args;
  const sourcePolicy = args.sourcePolicy || 'subscription_first';

  const balances = await readBalances(userId);
  const currentCode = balances.active_tariff || 'free';
  if (currentCode === 'free') {
    return { ok: false, reason: 'no_active_tariff_use_buy' };
  }
  if (currentCode === targetCode) {
    return { ok: false, reason: 'already_on_this_tariff' };
  }

  // Tariff configs
  const target = await getTariffByCode(db as unknown as DB, targetCode);
  const current = await getTariffByCode(db as unknown as DB, currentCode);
  if (!target || !current) return { ok: false, reason: 'tariff_lookup_failed' };
  if (target.entryMicro <= current.entryMicro) {
    return { ok: false, reason: 'cannot_downgrade' };
  }

  const delta = target.entryMicro - current.entryMicro;
  const deltaSeats = target.businessSeatsCount - current.businessSeatsCount;

  const totalAvail = balances.working_micro + balances.subscription_micro;
  if (totalAvail < delta) {
    return {
      ok: false, reason: 'insufficient_funds',
      amount_paid_micro: delta.toString(),
    };
  }

  // Same allocation logic as buyTariffFromBalance — use the shared helper.
  const alloc = allocatePayment(
    delta, balances.subscription_micro, balances.working_micro, sourcePolicy,
  );
  if (!alloc.ok) return { ok: false, reason: alloc.reason };
  const { fromSub, fromWork } = alloc;

  let chainDepth = 0;
  await db.transaction(async (tx) => {
    if (fromSub > 0n) {
      await transferBetweenWallets(
        userId, 'subscription', 'working', fromSub,
        `tariff_upgrade:${currentCode}→${targetCode}:from_subscription`,
      );
    }

    // Re-use processLinearOnly with the TARGET tariff_id.
    // Note: it reads target.entryMicro from tariffs table — but we want only
    // the delta paid out. We work around this by passing a custom entryMicro
    // via direct SQL: the processor unfortunately reads from tariffs. To do
    // it correctly we duplicate the smaller entry-fee + referrals path here:
    const refId = 'balance:upgrade:' + crypto.randomUUID().slice(0, 8);
    const paymentMemo = `entry_payment:${refId}`;

    // 1. entry_fee debit (working balance)
    await tx.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
      VALUES (${userId}, 'entry_fee_upgrade', ${-Number(delta)}, ${paymentMemo})
    `);

    // 2. 10-lvl partner payouts on DELTA (by TARGET tariff curve = the current
    //    function uses ROCKET-bonus matching only when recipient is on ROCKET,
    //    so just calling it works correctly).
    const referrals10lvl = await import('./referrals-10lvl.js');
    const matchingBonus = await import('./matching-bonus.js');
    const refRes = await referrals10lvl.accrueFromEntry(
      userId,
      delta,
      { kind: 'entry_fee', id: null },
      tx as unknown as DB,
    );
    chainDepth = refRes.chainDepth;
    for (const refEntry of refRes.entries) {
      await matchingBonus.accrueFromReferral(
        refEntry.recipientUserId,
        refEntry.amountMicro,
        refEntry.ledgerId,
        tx as unknown as DB,
      );
    }
    // 3. admin fee 10% of delta
    const adminFee = (delta * 10n) / 100n;
    const adminRows = (await tx.execute(sql`
      SELECT id FROM users WHERE tg_id = -1 LIMIT 1
    `)) as unknown as Array<{ id: number }>;
    if (adminRows[0]?.id) {
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
        VALUES (${adminRows[0].id}, 'admin_fee', ${Number(adminFee)}, ${userId}, 'tariff_upgrade_split_10pct')
      `);
    }

    // 4. Update users to new tariff (don't rewrite tariff_started_at — keeps cycle)
    const expiresAt = new Date(Date.now() + RENEWAL_DAYS * 24 * 60 * 60 * 1000);
    await tx.execute(sql`
      UPDATE users SET
        active_tariff_code = ${targetCode},
        tariff_expires_at = ${expiresAt.toISOString()}
      WHERE id = ${userId}
    `);

    // 5. Add delta_seats new business_seats. Their tariff_id = target.
    for (let i = 0; i < deltaSeats; i++) {
      await tx.execute(sql`
        INSERT INTO business_seats (user_id, tariff_id, seat_index, monthly_fee_paid_until)
        VALUES (${userId}, ${target.id},
                ${current.businessSeatsCount + i + 1},
                ${expiresAt.toISOString()})
      `);
    }

    // 6. Audit row
    await tx.execute(sql`
      INSERT INTO tariff_history
        (user_id, action, prev_tariff, new_tariff, prev_seats, new_seats,
         amount_micro, source_wallet, expires_at)
      VALUES
        (${userId}, 'upgrade', ${currentCode}, ${targetCode},
         ${current.businessSeatsCount}, ${target.businessSeatsCount},
         ${Number(delta)}, ${sourcePolicy}, ${expiresAt.toISOString()})
    `);
  });

  await awardKarma(userId, 'self_upgrade', null, 'upgrade ' + currentCode + '->' + targetCode);
  await sendNotification({
    userId,
    kind: 'tariff_upgraded',
    severity: 'success',
    title: `🆙 Апгрейд ${currentCode.toUpperCase()} → ${targetCode.toUpperCase()}`,
    body: `Доплата $${Number(delta) / 1e6}. Добавлено ${deltaSeats} бизнес-мест${deltaSeats === 1 ? 'о' : 'а'}.\nТеперь у вас ${target.businessSeatsCount} мест в матрице.`,
    url: '/cabinet/cabinet#/finance',
    meta: {
      from_tariff: currentCode,
      to_tariff: targetCode,
      delta_usd: Number(delta) / 1e6,
      seats_added: deltaSeats,
    },
  });

  logger.info(
    { userId, from: currentCode, to: targetCode, delta: delta.toString(), chainDepth },
    'tariff upgraded from balance',
  );

  return {
    ok: true,
    tariff_code: targetCode,
    amount_paid_micro: delta.toString(),
    paid_from_subscription_micro: fromSub.toString(),
    paid_from_working_micro: fromWork.toString(),
    seats_created: deltaSeats,
    partner_chain_depth: chainDepth,
  };
}
