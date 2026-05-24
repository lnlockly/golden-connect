// Weekly fee: 0.5% of lot cost, charged every 7 days against the topup balance.
// Goes towards additional technical places that push the global queue.

import {
  ABONENTKA_NOTIFY_BEFORE_HOURS,
  ABONENTKA_PERIOD_DAYS,
  ABONENTKA_WEEKLY_PCT_OF_LOT,
  LotUsd,
} from './rules.js';

export interface ActiveLot {
  id: number;
  userId: number;
  lotUsd: LotUsd;
  activatedAt: number;          // unix ms
  lastChargeAt: number | null;  // unix ms, null if never charged yet
  closed: boolean;
}

export interface AbonentkaChargeDue {
  lotId: number;
  userId: number;
  lotUsd: LotUsd;
  amountCents: number;
  dueAt: number;                // unix ms
}

// Compute the weekly fee for a given lot in cents.
export function weeklyFeeCents(lotUsd: LotUsd): number {
  return Math.round(lotUsd * 100 * (ABONENTKA_WEEKLY_PCT_OF_LOT / 100));
}

// Find all active lots that are due for a weekly charge as of `now`.
// A lot is due if (now - lastChargeAt) >= 7 days (or, on first charge, if
// (now - activatedAt) >= 7 days).
export function dueCharges(lots: ActiveLot[], now: number): AbonentkaChargeDue[] {
  const out: AbonentkaChargeDue[] = [];
  const periodMs = ABONENTKA_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  for (const lot of lots) {
    if (lot.closed) continue;
    const base = lot.lastChargeAt ?? lot.activatedAt;
    const due = base + periodMs;
    if (now < due) continue;
    out.push({
      lotId: lot.id,
      userId: lot.userId,
      lotUsd: lot.lotUsd,
      amountCents: weeklyFeeCents(lot.lotUsd),
      dueAt: due,
    });
  }
  return out;
}

// Which lots should we send a "charge coming" notification for (24h before)?
export function dueNotifications(lots: ActiveLot[], now: number): AbonentkaChargeDue[] {
  const out: AbonentkaChargeDue[] = [];
  const periodMs = ABONENTKA_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  const noticeMs = ABONENTKA_NOTIFY_BEFORE_HOURS * 60 * 60 * 1000;
  for (const lot of lots) {
    if (lot.closed) continue;
    const base = lot.lastChargeAt ?? lot.activatedAt;
    const due = base + periodMs;
    if (now < due - noticeMs || now >= due) continue;
    out.push({
      lotId: lot.id,
      userId: lot.userId,
      lotUsd: lot.lotUsd,
      amountCents: weeklyFeeCents(lot.lotUsd),
      dueAt: due,
    });
  }
  return out;
}
