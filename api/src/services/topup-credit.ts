/**
 * Working-balance topup credit helper.
 *
 * Used by webhook handlers (cryptobot + platega) when the invoice payload
 * begins with "topup:". Inserts ONE positive cash_ledger row with
 * kind='topup' so the user's working balance increments by the paid amount.
 *
 * Idempotency: the cash_ledger memo carries the provider invoice id (e.g.
 * "cryptobot:9876"). Before inserting we check if a row with the same memo
 * already exists for this user — if yes, no-op so retries don't double-credit.
 */

import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'topup-credit' });

/**
 * Parse a "topup:<userId>:<microAmount>" payload string.
 * Returns null if the string is not a topup payload.
 */
export function parseTopupPayload(
  raw: string | undefined,
): { userId: number; microAmount: bigint } | null {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 3 || parts[0] !== 'topup') return null;
  const userId = Number(parts[1]);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  let micro: bigint;
  try {
    micro = BigInt(parts[2]);
  } catch {
    return null;
  }
  if (micro <= 0n) return null;
  return { userId, microAmount: micro };
}

/**
 * Credit a user's working balance by `microAmount`. Idempotent on `paymentRefId`.
 * Returns the new ledger row id, or null if a row already existed (idempotent skip).
 */
export async function creditWorkingBalanceTopup(
  userId: number,
  microAmount: bigint,
  paymentRefId: string,
): Promise<{ ok: true; ledgerId: number | null; alreadyCredited: boolean }> {
  if (microAmount <= 0n) {
    return { ok: true, ledgerId: null, alreadyCredited: false };
  }

  // Idempotency check — same memo on cash_ledger means we already processed this invoice.
  const existing = (await db.execute(sql`
    SELECT id FROM cash_ledger
    WHERE user_id = ${userId} AND kind = 'topup' AND memo = ${paymentRefId}
    LIMIT 1
  `)) as unknown as Array<{ id: number }>;
  if (existing[0]?.id) {
    log.info({ userId, paymentRefId }, 'topup: already credited (idempotent)');
    return { ok: true, ledgerId: Number(existing[0].id), alreadyCredited: true };
  }

  const inserted = (await db.execute(sql`
    INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
    VALUES (${userId}, 'topup', ${Number(microAmount)}, ${paymentRefId})
    RETURNING id
  `)) as unknown as Array<{ id: number }>;
  const ledgerId = inserted[0]?.id ? Number(inserted[0].id) : null;
  log.info({ userId, microAmount: microAmount.toString(), paymentRefId, ledgerId }, 'topup: credited working balance');

  // Karma reward for advertiser top-up: +2 per $1, daily cap 100/day.
  try {
    const { awardKarma } = await import('./karma.js');
    const dollars = Math.floor(Number(microAmount) / 1_000_000);
    for (let i = 0; i < dollars; i++) {
      const r = await awardKarma(userId, 'ad_topup_per_dollar', ledgerId, 'topup_$' + (i + 1));
      if (r.capped) break; // daily cap reached, stop
    }
  } catch (e: any) {
    log.warn({ userId, err: e?.message }, 'karma award (topup) failed — non-fatal');
  }

  return { ok: true, ledgerId, alreadyCredited: false };
}
