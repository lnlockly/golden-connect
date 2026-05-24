import { sql, eq } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { users, cashLedger } from '../db/schema.js';

/**
 * Gift balance — Marketing v2 (2026-04).
 *
 * Advertising-credit balance accumulated on business-seat activations.
 *
 * Per presentation page 13:
 *   - Before official launch: 10 USD per activated seat (×2 pre-launch)
 *   - After official launch:  5  USD per activated seat
 *
 * Gift funds are spent ONLY inside the platform (banner + contextual ads),
 * never withdrawn. We track them on `users.gift_balance_micro` with an
 * accompanying `cash_ledger` row (kind = 'gift_credit') for audit.
 *
 * The pre/post-launch flag is env-controlled (`LAUNCH_AT`) so we don't
 * need to re-deploy to flip it. Default = pre-launch (double).
 */

const PRE_LAUNCH_GIFT_MICRO = 10_000_000n; // $10
const POST_LAUNCH_GIFT_MICRO = 5_000_000n; //  $5

/**
 * Is the platform still in pre-launch window? Governed by env `LAUNCH_AT`
 * (ISO-8601 timestamp). Absent = pre-launch (lenient default during the
 * ramp-up phase).
 */
export function isPreLaunch(now: Date = new Date()): boolean {
  const raw = process.env.LAUNCH_AT;
  if (!raw) return true;
  const launch = new Date(raw);
  if (Number.isNaN(launch.getTime())) return true;
  return now < launch;
}

/** Gift amount per seat at the given moment. */
export function giftAmountPerSeatMicro(now: Date = new Date()): bigint {
  return isPreLaunch(now) ? PRE_LAUNCH_GIFT_MICRO : POST_LAUNCH_GIFT_MICRO;
}

/**
 * Credit the gift balance for a seat activation. Idempotent per
 * (seatId, 'seat_activation') — call this once when `business_seats` row
 * is inserted and not again on renewal of the same seat.
 *
 * Writes an audit row to `cash_ledger` with kind='gift_credit' and
 * updates the denormalised `users.gift_balance_micro` atomically.
 */
export async function creditForSeatActivation(
  userId: number,
  seatId: number,
  tx: DB = db,
): Promise<{ amountMicro: bigint; ledgerId: number }> {
  const amountMicro = giftAmountPerSeatMicro();

  const run = async (txx: DB) => {
    const [ledgerRow] = await txx
      .insert(cashLedger)
      .values({
        userId,
        kind: 'gift_credit',
        amountMicro,
        relatedUserId: null,
        level: null,
        memo: `gift_seat_activation:${seatId}`,
      })
      .returning({ id: cashLedger.id });

    await txx
      .update(users)
      .set({ giftBalanceMicro: sql`${users.giftBalanceMicro} + ${amountMicro}` })
      .where(eq(users.id, userId));

    return { amountMicro, ledgerId: ledgerRow.id };
  };

  if (tx === db) {
    return await db.transaction(async (inner) => run(inner as unknown as DB));
  }
  return run(tx);
}

/**
 * Spend gift balance on an in-platform ad impression / click. Deducts
 * atomically; raises if the balance would go negative so the caller
 * can show "insufficient gift balance" without double-charging.
 */
export async function spendGift(
  userId: number,
  amountMicro: bigint,
  memo: string,
  tx: DB = db,
): Promise<{ ok: true; newBalanceMicro: bigint } | { ok: false; shortfallMicro: bigint }> {
  if (amountMicro <= 0n) {
    return { ok: true, newBalanceMicro: 0n };
  }

  const run = async (txx: DB) => {
    const [row] = await txx
      .select({ balance: users.giftBalanceMicro })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const current = row?.balance ?? 0n;
    if (current < amountMicro) {
      return { ok: false as const, shortfallMicro: amountMicro - current };
    }

    await txx.insert(cashLedger).values({
      userId,
      kind: 'gift_spend',
      amountMicro: -amountMicro,
      relatedUserId: null,
      level: null,
      memo,
    });

    await txx
      .update(users)
      .set({ giftBalanceMicro: sql`${users.giftBalanceMicro} - ${amountMicro}` })
      .where(eq(users.id, userId));

    return { ok: true as const, newBalanceMicro: current - amountMicro };
  };

  if (tx === db) {
    return await db.transaction(async (inner) => run(inner as unknown as DB));
  }
  return run(tx);
}

/** Raw read helper for the cabinet summary endpoint. */
export async function getGiftBalanceMicro(userId: number, tx: DB = db): Promise<bigint> {
  const [row] = await tx
    .select({ balance: users.giftBalanceMicro })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.balance ?? 0n;
}
