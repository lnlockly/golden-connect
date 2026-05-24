import { env } from './env.js';

/**
 * USDT BEP-20 intake helpers.
 *
 * BEP-20 transfers carry no memo field, so we encode an identifier into the
 * fractional part of the amount. Admin sees a unique "150.000123 USDT" and
 * can match it to exactly one pending invoice on bscscan. With <999 pending
 * invoices at once, collisions are impossible.
 */

/**
 * Build a unique USDT amount in 6-decimal micro units for a given base and
 * lead. `leadId % 999` lives in the last 3 decimals, leaving the first 3
 * decimal digits always zero — keeps the displayed value visually close to
 * the round USD figure (e.g. "150.000042" for leadId=42).
 */
export function generateUniqueAmount(baseUsd: number, leadId: number): bigint {
  if (!Number.isFinite(baseUsd) || baseUsd <= 0) {
    throw new Error('baseUsd must be a positive number');
  }
  // Round to cent precision first to avoid fp drift then scale to 6 decimals.
  const cents = Math.round(baseUsd * 100);
  const baseMicro = BigInt(cents) * 10_000n; // 1e4 = 1e6 / 1e2
  const suffix = BigInt(leadId % 999);
  return baseMicro + suffix;
}

/** Human-readable USDT amount from a micro-units bigint. */
export function microToHuman(micro: bigint): string {
  const neg = micro < 0n;
  const abs = neg ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracStr = frac.toString().padStart(6, '0');
  return `${neg ? '-' : ''}${whole.toString()}.${fracStr}`;
}

export function receiveAddress(): string {
  return env.bscReceiveAddress;
}

export function usdtContract(): string {
  return env.usdtBep20Contract;
}
