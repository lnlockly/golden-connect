/**
 * Golden Connect 4-balance system — core helpers
 *
 * 4 balances: working / gift / subscription / karma
 *  - working: 80% of all earnings, withdrawable, can buy tariff
 *  - gift: ad spend only (bonuses, doubling pre-launch)
 *  - subscription: 20% of all earnings up to cap, only buys tariff
 *  - karma: gamification points for weekly raffle (not USD)
 *
 * Pre-launch matrix is FROZEN (matrix_frozen=true on users).
 * Partner-line referral payouts ARE active.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

// NOTE: We use raw SQL throughout this file (db.execute) instead of
// schema-typed selects because the new columns
// (subscription_balance_micro, karma_points, active_tariff_code, ...)
// aren't in src/db/schema.ts yet — adding them is a separate refactor
// that would touch many other files. Raw SQL is just as safe with
// parametrized template literals and lets us ship Phase 1 right now.

// ───────────── 4-balance constants ─────────────

export type Wallet = 'working' | 'gift' | 'subscription' | 'karma';

// Subscription caps in micro (1 USD = 1_000_000 micro)
// MUTABLE: can be overridden via subscription_caps table at runtime.
export const SUBSCRIPTION_CAP_MICRO_DEFAULT: Record<string, bigint> = {
  free:   45_000_000n,
  launch: 15_000_000n,
  boost:  30_000_000n,
  rocket: 45_000_000n,
};

export const SPLIT_PERCENT_DEFAULT = 20;
export const MICRO_PER_USD = 1_000_000n;

// ───────────── splitIncome (the heart of the 80/20 system) ─────────────

/**
 * Split incoming earning between working (80%) and subscription (20%).
 * Subscription cap enforced — overflow goes back to working.
 *
 * @param userId    target user
 * @param amountMicro positive amount earned (in micro USD)
 * @param sourceKind  'task'|'referral'|'matrix'|'matching'|'leader_pool'|'topup_to_working'|...
 * @param sourceId    optional FK reference
 * @param memo        free-text audit note
 * @returns { toWorking, toSubscription, capReached }
 */
export async function splitIncome(
  userId: number,
  amountMicro: bigint,
  sourceKind: string,
  sourceId?: number | null,
  memo?: string,
): Promise<{ toWorking: bigint; toSubscription: bigint; capReached: boolean }> {
  if (amountMicro <= 0n) return { toWorking: 0n, toSubscription: 0n, capReached: false };

  // 1. Read user's tariff + current subscription balance + cap (raw SQL)
  const userRows = (await db.execute(sql`
    SELECT u.active_tariff_code, u.subscription_balance_micro,
           c.cap_micro, c.split_percent
    FROM users u
    LEFT JOIN subscription_caps c ON c.tariff_code = u.active_tariff_code
    WHERE u.id = ${userId}
    LIMIT 1
  `)) as unknown as Array<{
    active_tariff_code: string | null;
    subscription_balance_micro: string | number | null;
    cap_micro: string | number | null;
    split_percent: number | null;
  }>;

  if (!userRows[0]) throw new Error('splitIncome: user not found ' + userId);
  const r = userRows[0];

  const tariffCode = r.active_tariff_code || 'free';
  const subBalCurrent: bigint = BigInt(r.subscription_balance_micro ?? 0);
  const cap: bigint = r.cap_micro != null
    ? BigInt(r.cap_micro)
    : (SUBSCRIPTION_CAP_MICRO_DEFAULT[tariffCode] ?? 0n);
  const splitPct = r.split_percent != null ? Number(r.split_percent) : SPLIT_PERCENT_DEFAULT;

  // 3. Compute split with cap enforcement
  let toSub: bigint;
  let toWorking: bigint;
  let capReached = subBalCurrent >= cap;

  if (capReached) {
    toSub = 0n;
    toWorking = amountMicro;
  } else {
    const want = (amountMicro * BigInt(splitPct)) / 100n;
    const room = cap - subBalCurrent;
    toSub = want <= room ? want : room;
    toWorking = amountMicro - toSub;
    capReached = subBalCurrent + toSub >= cap;
  }

  // 4. Apply atomically
  await db.transaction(async (tx) => {
    if (toSub > 0n) {
      await tx.execute(sql`
        UPDATE users SET subscription_balance_micro = subscription_balance_micro + ${Number(toSub)}
        WHERE id = ${userId}
      `);
    }
    if (toWorking > 0n) {
      // Working balance = cash_ledger sum (already used by api). Insert credit row.
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, related_user_id, memo)
        VALUES (${userId}, ${sourceKind + '_working'}, ${Number(toWorking)},
                ${sourceId ?? null}, ${memo ?? null})
      `);
    }
  });

  return { toWorking, toSubscription: toSub, capReached };
}

// ───────────── addToGift (ad balance — bonuses only, no split) ─────────────

export async function addToGift(
  userId: number,
  amountMicro: bigint,
  sourceKind: string,
  memo?: string,
): Promise<void> {
  if (amountMicro <= 0n) return;
  await db.execute(sql`
    UPDATE users SET gift_balance_micro = gift_balance_micro + ${Number(amountMicro)}
    WHERE id = ${userId}
  `);
  await db.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, ${sourceKind + '_gift'}, ${Number(amountMicro)}, ${memo ?? null})
  `);
}

// ───────────── addKarma (gamification points) ─────────────

export async function addKarma(
  userId: number,
  points: bigint,
  kind: string,
  sourceKind?: string,
  sourceId?: number | bigint | null,
  memo?: string,
): Promise<bigint> {
  if (points <= 0n) {
    const rs = (await db.execute(sql`SELECT karma_points FROM users WHERE id = ${userId}`)) as unknown as Array<{ karma_points: string | number }>;
    return BigInt(rs[0]?.karma_points ?? 0);
  }
  const updRows = (await db.execute(sql`
    UPDATE users SET karma_points = karma_points + ${Number(points)}
    WHERE id = ${userId}
    RETURNING karma_points
  `)) as unknown as Array<{ karma_points: string | number }>;
  const after = BigInt(updRows[0]?.karma_points ?? 0);
  await db.execute(sql`
    INSERT INTO karma_log (user_id, kind, points, balance_after, source_kind, source_id, memo)
    VALUES (${userId}, ${kind}, ${Number(points)}, ${Number(after)},
            ${sourceKind ?? null}, ${sourceId ? Number(sourceId) : null}, ${memo ?? null})
  `);
  return after;
}

// ───────────── transferBetweenWallets ─────────────

export async function transferBetweenWallets(
  userId: number,
  fromWallet: Wallet,
  toWallet: Wallet,
  amountMicro: bigint,
  memo?: string,
): Promise<void> {
  if (amountMicro <= 0n) throw new Error('amount must be positive');
  if (fromWallet === 'gift') throw new Error('cannot transfer FROM gift wallet');
  if (toWallet === 'gift') throw new Error('cannot transfer TO gift wallet (only via bonus mechanisms)');
  if (fromWallet === 'karma' || toWallet === 'karma') throw new Error('karma is not transferable');
  if (fromWallet === toWallet) throw new Error('same wallet');

  await db.transaction(async (tx) => {
    // Lock the user row for the rest of the transaction so concurrent
    // transfers / income splits cannot see a stale balance and double-spend.
    // Read both balances under lock to validate sufficiency before any write.
    const lockRows = (await tx.execute(sql`
      SELECT u.id, u.subscription_balance_micro::bigint AS sub
      FROM users u
      WHERE u.id = ${userId}
      FOR UPDATE OF u
    `)) as unknown as Array<{ id: number; sub: string | number }>;
    if (!lockRows[0]) throw new Error('user_not_found');
    const subBal = BigInt(lockRows[0].sub ?? 0);

    if (fromWallet === 'subscription' && subBal < amountMicro) {
      throw new Error('insufficient_subscription');
    }
    if (fromWallet === 'working') {
      // Working balance is sum(cash_ledger.amount_micro). The lock above
      // does not protect cash_ledger writes from other tx (no FK lock),
      // so we re-sum here to verify pre-debit. Risk window: another
      // tx can credit working between this read and our negative insert,
      // but since we are inserting a NEGATIVE row, even with concurrent
      // credits the final sum is correct; only over-debit is the danger.
      const workRows = (await tx.execute(sql`
        SELECT COALESCE(SUM(amount_micro), 0)::bigint AS work
        FROM cash_ledger
        WHERE user_id = ${userId}
      `)) as unknown as Array<{ work: string | number }>;
      const workBal = BigInt(workRows[0]?.work ?? 0);
      if (workBal < amountMicro) throw new Error('insufficient_working');
    }

    // Debits — guards above already ensured sufficiency under lock.
    if (fromWallet === 'working') {
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
        VALUES (${userId}, ${'transfer_out_to_' + toWallet}, ${-Number(amountMicro)}, ${memo ?? null})
      `);
    } else if (fromWallet === 'subscription') {
      await tx.execute(sql`
        UPDATE users SET subscription_balance_micro = subscription_balance_micro - ${Number(amountMicro)}
        WHERE id = ${userId}
      `);
    }

    if (toWallet === 'working') {
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
        VALUES (${userId}, ${'transfer_in_from_' + fromWallet}, ${Number(amountMicro)}, ${memo ?? null})
      `);
    } else if (toWallet === 'subscription') {
      await tx.execute(sql`
        UPDATE users SET subscription_balance_micro = subscription_balance_micro + ${Number(amountMicro)}
        WHERE id = ${userId}
      `);
    }

    // Audit row
    await tx.execute(sql`
      INSERT INTO wallet_transfers (user_id, from_wallet, to_wallet, amount_micro, memo)
      VALUES (${userId}, ${fromWallet}, ${toWallet}, ${Number(amountMicro)}, ${memo ?? null})
    `);
  });
}

// ───────────── readBalances (single source for bot/cabinet/admin) ─────────────

export interface UserBalances {
  working_micro: bigint;
  gift_micro: bigint;
  subscription_micro: bigint;
  subscription_cap_micro: bigint;
  karma_points: bigint;
  active_tariff: string;
  tariff_expires_at: Date | null;
  tariff_auto_renew: boolean;
  tariff_started_at: Date | null;
  tariff_business_seats_count: number;
}

export async function readBalances(userId: number): Promise<UserBalances> {
  const rows = await db.execute(sql`
    SELECT
      u.gift_balance_micro,
      u.subscription_balance_micro,
      u.karma_points,
      u.active_tariff_code,
      u.tariff_expires_at,
      u.tariff_started_at,
      u.tariff_auto_renew,
      c.cap_micro,
      t.business_seats_count AS active_seats_count,
      COALESCE((SELECT SUM(amount_micro) FROM cash_ledger WHERE user_id = ${userId}), 0)::bigint AS working_micro
    FROM users u
    LEFT JOIN subscription_caps c ON c.tariff_code = u.active_tariff_code
    LEFT JOIN tariffs t ON t.code = u.active_tariff_code AND t.is_active = true
    WHERE u.id = ${userId}
    LIMIT 1
  `);
  if (!rows[0]) throw new Error('user not found ' + userId);
  const r: any = rows[0];
  return {
    working_micro: BigInt(r.working_micro ?? 0),
    gift_micro: BigInt(r.gift_balance_micro ?? 0),
    subscription_micro: BigInt(r.subscription_balance_micro ?? 0),
    subscription_cap_micro: BigInt(r.cap_micro ?? 0),
    karma_points: BigInt(r.karma_points ?? 0),
    active_tariff: String(r.active_tariff_code ?? 'free'),
    tariff_expires_at: r.tariff_expires_at ? new Date(r.tariff_expires_at) : null,
    tariff_auto_renew: !!r.tariff_auto_renew,
    tariff_started_at: r.tariff_started_at ? new Date(r.tariff_started_at) : null,
    tariff_business_seats_count: Number(r.active_seats_count ?? 0),
  };
}

// ───────────── Notifications inbox (web bell + bot push) ─────────────

export type NotifSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * UNIFIED notification — appears BOTH in cabinet bell-dropdown AND in @GoldenConnect_bizbot.
 *
 * Single source of truth: notifications_inbox row.
 *  - Site reads via /api/notifications (filters by user_id, sorts by created_at)
 *  - TG worker (api/src/jobs/inbox-tg-deliver.job.ts) polls delivered_tg=false
 *    and pushes to @GoldenConnect_bizbot every minute. Sets delivered_tg=true after success.
 *  - skipBot=true → notification only in cabinet (no TG push). Useful for
 *    low-priority info that would spam the bot.
 *
 * Returns the inbox row id for cross-references.
 */
export async function sendNotification(opts: {
  userId: number;
  kind: string;          // identifier like 'tariff_renewed', 'topup_success' (internal — user doesn't see)
  title: string;         // shown to user in both places
  body?: string;         // shown to user in both places
  url?: string;          // deep-link, e.g. '/cabinet/cabinet#/finance' — TG button "Открыть"
  severity?: NotifSeverity;
  meta?: Record<string, unknown>;
  skipBot?: boolean;     // default: deliver to BOTH cabinet+bot. Set true for cabinet-only.
}): Promise<bigint> {
  const sev = opts.severity || 'info';
  const metaText = JSON.stringify(opts.meta || {});
  // delivered_tg starts as TRUE (=already delivered = don't push)
  // when skipBot=true; otherwise FALSE so worker picks it up.
  const deliveredTg = opts.skipBot ? true : false;
  const rows = (await db.execute(sql`
    INSERT INTO notifications_inbox
      (user_id, kind, severity, title, body, url, meta, delivered_tg)
    VALUES
      (${opts.userId}, ${opts.kind}, ${sev}, ${opts.title},
       ${opts.body ?? null}, ${opts.url ?? null},
       ${metaText}::jsonb, ${deliveredTg})
    RETURNING id
  `)) as unknown as Array<{ id: number | string }>;
  return BigInt(rows[0]?.id ?? 0);
}

export async function markRead(userId: number, notifId: bigint): Promise<void> {
  await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE id = ${Number(notifId)} AND user_id = ${userId} AND read_at IS NULL
  `);
}

export async function markAllRead(userId: number): Promise<number> {
  const r = await db.execute(sql`
    UPDATE notifications_inbox SET read_at = NOW()
    WHERE user_id = ${userId} AND read_at IS NULL
  `);
  return r.length;
}
