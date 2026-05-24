// Pure money-distribution functions for Monar.
// Two distinct events:
//   1) `distributePlaceEntry` — one $10 entry into a single business place
//      (60% to participant, 40% to system funds + referral ladder)
//   2) `distributeLotPurchase` — the moment a lot is bought:
//      splits into business places (owned) + technical lots (system)

import {
  LOT_SPECS,
  LotUsd,
  PARTICIPANT_PCT_PER_PLACE_ENTRY,
  PLACE_COST_CENTS,
  REFERRAL_LADDER_PCT,
  SYSTEM_SUBSPLIT_PCT,
} from './rules.js';

// -------------------------------------------------------------------------
// Place entry: one $10 hitting a single business place owned by ownerUserId.
// -------------------------------------------------------------------------

export interface PlaceEntryInput {
  ownerUserId: number;
  uplineUserIds: number[];   // length 0..5, level 1 first
  // Whether this is the first or second entry on this place.
  // First → distribute. Second → reinvest into new place (handled by queue.ts).
  entryIndex: 1 | 2;
}

export interface PlaceEntryDistribution {
  ownerCents: number;
  refs: Array<{ userId: number; level: number; cents: number }>;
  worldPoolCents: number;
  networkingCents: number;
  eventsFundCents: number;
  infraCents: number;
  // For invariant check: equals PLACE_COST_CENTS exactly on entryIndex=1.
  totalCents: number;
  // True if this entry triggers a reinvest (second hit on the place).
  reinvest: boolean;
}

export function distributePlaceEntry(input: PlaceEntryInput): PlaceEntryDistribution {
  if (input.entryIndex === 2) {
    // Second entry → full $10 reinvested into a new place. Caller (queue.ts)
    // does the actual spawn. No splits here.
    return {
      ownerCents: 0,
      refs: [],
      worldPoolCents: 0,
      networkingCents: 0,
      eventsFundCents: 0,
      infraCents: 0,
      totalCents: 0,
      reinvest: true,
    };
  }

  const total = PLACE_COST_CENTS;
  const ownerCents = pctCents(total, PARTICIPANT_PCT_PER_PLACE_ENTRY);

  const refs: PlaceEntryDistribution['refs'] = [];
  let refsTotal = 0;
  for (let i = 0; i < REFERRAL_LADDER_PCT.length; i++) {
    const userId = input.uplineUserIds[i];
    if (userId === undefined) break;
    const cents = pctCents(total, REFERRAL_LADDER_PCT[i]);
    refs.push({ userId, level: i + 1, cents });
    refsTotal += cents;
  }
  // Missing upline % overflows into world pool to keep arithmetic balanced.
  const refsBudget = pctCents(total, SYSTEM_SUBSPLIT_PCT.referralLadder);
  const refsOverflow = refsBudget - refsTotal;

  const worldPoolCents = pctCents(total, SYSTEM_SUBSPLIT_PCT.worldPool) + refsOverflow;
  const networkingCents = pctCents(total, SYSTEM_SUBSPLIT_PCT.networking);
  const eventsFundCents = pctCents(total, SYSTEM_SUBSPLIT_PCT.eventsFund);
  const infraCents = pctCents(total, SYSTEM_SUBSPLIT_PCT.infrastructure);

  const sum = ownerCents + refsTotal + worldPoolCents + networkingCents + eventsFundCents + infraCents;

  return {
    ownerCents,
    refs,
    worldPoolCents,
    networkingCents,
    eventsFundCents,
    infraCents,
    totalCents: sum,
    reinvest: false,
  };
}

// -------------------------------------------------------------------------
// Lot purchase: splits the lot into business places + technical lots
// -------------------------------------------------------------------------

export interface LotPurchaseInput {
  userId: number;
  lotUsd: LotUsd;
}

export interface LotPurchaseSplit {
  userId: number;
  lotUsd: LotUsd;
  businessPlaces: number;
  technicalLots: number;
  ownerBusinessCents: number;     // = businessPlaces * $10
  systemTechnicalCents: number;   // = technicalLots * $10
  totalCents: number;             // = lotUsd * 100
}

export function distributeLotPurchase(input: LotPurchaseInput): LotPurchaseSplit {
  const spec = LOT_SPECS[input.lotUsd];
  const ownerBusiness = spec.businessPlaces * PLACE_COST_CENTS;
  const sysTechnical = spec.technicalLots * PLACE_COST_CENTS;
  return {
    userId: input.userId,
    lotUsd: input.lotUsd,
    businessPlaces: spec.businessPlaces,
    technicalLots: spec.technicalLots,
    ownerBusinessCents: ownerBusiness,
    systemTechnicalCents: sysTechnical,
    totalCents: ownerBusiness + sysTechnical,
  };
}

// -------------------------------------------------------------------------
// Lot closure (×2): split proceeds 50% to income balance, 50% to auto-reinvest
// -------------------------------------------------------------------------

export interface LotClosureInput {
  userId: number;
  lotUsd: LotUsd;
}

export interface LotClosurePayout {
  userId: number;
  lotUsd: LotUsd;
  totalProceedsCents: number;     // 2× lotUsd in cents
  toIncomeBalanceCents: number;   // 50%
  toReinvestCents: number;        // 50%
}

export function distributeLotClosure(input: LotClosureInput): LotClosurePayout {
  const total = input.lotUsd * 100 * 2;
  const half = Math.trunc(total / 2);
  return {
    userId: input.userId,
    lotUsd: input.lotUsd,
    totalProceedsCents: total,
    toIncomeBalanceCents: half,
    toReinvestCents: total - half,
  };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

function pctCents(amountCents: number, pct: number): number {
  return Math.trunc((amountCents * pct) / 100);
}
