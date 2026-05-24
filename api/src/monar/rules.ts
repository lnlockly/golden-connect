// Monar canonical constants. Single source of truth for the whole money model.
// Numbers taken from the 13-series marketing material — keep this file in sync
// with `agentflow/ops/goldenConnect-migration/monar-13-series-source.md`.

// =========================================================================
// LOTS
// =========================================================================

export const LOT_USD = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000] as const;
export type LotUsd = (typeof LOT_USD)[number];

// Per-lot configuration: business places ($10 each), days to ×2, cycles to close.
// Days are approximate — depend on actual flow of new participants.
export interface LotSpec {
  usd: LotUsd;
  businessPlaces: number;     // owned by participant ($10 each)
  technicalLots: number;      // owned by system (rest of the lot / $10)
  approxDaysToDouble: number;
  cyclesToClose: number;
  adsPostsPerWeek: number;
  adsWeeks: number;
  worldPoolAccess: number;    // how many of 8 monthly pools you get a share of
  vip: boolean;               // VIP-chat, personal TG branch, networking coef
}

// Each place costs $10. So for a $500 lot we have $500/$10 = 50 places total,
// of which 15 are owned by the user (business) and 35 are technical.
// Cross-check: 15 + 35 = 50. ✓
export const LOT_SPECS: Record<LotUsd, LotSpec> = {
  50:   { usd: 50,   businessPlaces: 2,  technicalLots: 3,  approxDaysToDouble: 90, cyclesToClose: 17, adsPostsPerWeek: 0, adsWeeks: 0,  worldPoolAccess: 0, vip: false },
  100:  { usd: 100,  businessPlaces: 4,  technicalLots: 6,  approxDaysToDouble: 85, cyclesToClose: 15, adsPostsPerWeek: 1, adsWeeks: 4,  worldPoolAccess: 0, vip: false },
  200:  { usd: 200,  businessPlaces: 7,  technicalLots: 13, approxDaysToDouble: 80, cyclesToClose: 14, adsPostsPerWeek: 2, adsWeeks: 8,  worldPoolAccess: 0, vip: false },
  300:  { usd: 300,  businessPlaces: 9,  technicalLots: 21, approxDaysToDouble: 75, cyclesToClose: 14, adsPostsPerWeek: 3, adsWeeks: 12, worldPoolAccess: 1, vip: false },
  400:  { usd: 400,  businessPlaces: 12, technicalLots: 28, approxDaysToDouble: 70, cyclesToClose: 13, adsPostsPerWeek: 4, adsWeeks: 16, worldPoolAccess: 2, vip: false },
  500:  { usd: 500,  businessPlaces: 15, technicalLots: 35, approxDaysToDouble: 65, cyclesToClose: 12, adsPostsPerWeek: 5, adsWeeks: 20, worldPoolAccess: 3, vip: true  },
  600:  { usd: 600,  businessPlaces: 18, technicalLots: 42, approxDaysToDouble: 60, cyclesToClose: 11, adsPostsPerWeek: 6, adsWeeks: 24, worldPoolAccess: 4, vip: true  },
  700:  { usd: 700,  businessPlaces: 21, technicalLots: 49, approxDaysToDouble: 55, cyclesToClose: 10, adsPostsPerWeek: 7, adsWeeks: 30, worldPoolAccess: 5, vip: true  },
  800:  { usd: 800,  businessPlaces: 25, technicalLots: 55, approxDaysToDouble: 50, cyclesToClose: 9,  adsPostsPerWeek: 8, adsWeeks: 36, worldPoolAccess: 6, vip: true  },
  900:  { usd: 900,  businessPlaces: 28, technicalLots: 62, approxDaysToDouble: 45, cyclesToClose: 8,  adsPostsPerWeek: 9, adsWeeks: 42, worldPoolAccess: 7, vip: true  },
  1000: { usd: 1000, businessPlaces: 32, technicalLots: 68, approxDaysToDouble: 40, cyclesToClose: 7,  adsPostsPerWeek: 10, adsWeeks: 50, worldPoolAccess: 8, vip: true  },
} as const;

export const PLACE_COST_USD = 10;
export const PLACE_COST_CENTS = PLACE_COST_USD * 100;

// =========================================================================
// PLACE DISTRIBUTION — what happens to each $10 entering a business place
// =========================================================================
// First entry into a place → 60% to participant, 40% to system funds.
// Second entry into a place → reinvest: spawns a new place at the queue tail.
//
// Within the 40% system share, the breakdown is:
// referral ladder + world pool + networking + events fund + infrastructure.
// These sub-percentages are not pinned by the marketing material so we keep
// them as conservative defaults; they sum to 40.

export const PARTICIPANT_PCT_PER_PLACE_ENTRY = 60;   // first $10 → $6 to participant
export const SYSTEM_PCT_PER_PLACE_ENTRY = 40;        // first $10 → $4 to funds

export const SYSTEM_SUBSPLIT_PCT = {
  referralLadder: 21,   // 10 + 5 + 3 + 2 + 1 = 21
  worldPool:       9,
  networking:      4,
  eventsFund:      3,
  infrastructure:  3,
} as const;
// Sanity: must sum to SYSTEM_PCT_PER_PLACE_ENTRY (40)
const _SYS_SUM = Object.values(SYSTEM_SUBSPLIT_PCT).reduce((a, b) => a + b, 0);
if (_SYS_SUM !== SYSTEM_PCT_PER_PLACE_ENTRY) {
  throw new Error(`SYSTEM_SUBSPLIT_PCT must sum to ${SYSTEM_PCT_PER_PLACE_ENTRY}, got ${_SYS_SUM}`);
}

// =========================================================================
// REFERRAL LADDER (5 levels)
// =========================================================================

export const REFERRAL_LADDER_PCT = [10, 5, 3, 2, 1] as const;
// Sanity: must sum to SYSTEM_SUBSPLIT_PCT.referralLadder
const _REF_SUM = REFERRAL_LADDER_PCT.reduce((a, b) => a + b, 0);
if (_REF_SUM !== SYSTEM_SUBSPLIT_PCT.referralLadder) {
  throw new Error(`REFERRAL_LADDER_PCT must sum to ${SYSTEM_SUBSPLIT_PCT.referralLadder}, got ${_REF_SUM}`);
}

// =========================================================================
// CYCLE / REINVEST
// =========================================================================

// On lot closure (×2), half of the proceeds is auto-routed into a new lot.
export const AUTO_REINVEST_PCT_OF_DOUBLED = 50;

// Withdrawal rule: after lot closes, user must activate a new lot of at least
// 50% of the doubled proceeds before withdrawals open.
export const WITHDRAW_MIN_NEW_LOT_PCT = 50;

// =========================================================================
// ABONENTKA (weekly fee)
// =========================================================================

export const ABONENTKA_WEEKLY_PCT_OF_LOT = 0.5;   // 0.5% per week
export const ABONENTKA_PERIOD_DAYS = 7;
export const ABONENTKA_NOTIFY_BEFORE_HOURS = 24;
// On non-payment, places are frozen but position is kept.

// =========================================================================
// CREDIT LOT (free starter)
// =========================================================================

export const CREDIT_LOT_USD = 10;
export const CREDIT_LOT_USD_CENTS = CREDIT_LOT_USD * 100;
// One per user. Unlocked when the user activates their first real lot ≥ $50.

// =========================================================================
// WORLD POOL (monthly)
// =========================================================================

export const WORLD_POOL_TOTAL_BUCKETS = 8;
export const WORLD_POOL_PAYOUT_DAY_OF_MONTH = 1; // first of next month
export const WORLD_POOL_MIN_LOT_USD = 300;
export const WORLD_POOL_AUTO_ACTIVATE_NEW_LOT = true;

// =========================================================================
// ADS PACKAGE (per lot — see LOT_SPECS.adsPostsPerWeek/adsWeeks)
// =========================================================================

export const ADS_MAX_POST_CHARS = 1000;
export const ADS_MAX_POST_IMAGES = 5;
export const ADS_AUTOTRANSLATE_LANGUAGES = 46;
export const ADS_MESSENGER_CHANNELS = [
  'telegram', 'whatsapp', 'facebook_messenger', 'wechat',
  'viber', 'discord', 'line', 'qq', 'signal',
] as const;

// =========================================================================
// NETWORKING (fund split by activity × lot coefficient)
// =========================================================================

export interface NetworkingCoef {
  lotMinUsd: LotUsd;
  coefficient: number;
}
// Coefficients grow with lot tier. Lot $500 = 1.5x, $1000 = 2.0x.
export const NETWORKING_COEF: NetworkingCoef[] = [
  { lotMinUsd: 50,   coefficient: 1.0 },
  { lotMinUsd: 300,  coefficient: 1.3 },
  { lotMinUsd: 500,  coefficient: 1.5 },
  { lotMinUsd: 700,  coefficient: 1.7 },
  { lotMinUsd: 1000, coefficient: 2.0 },
];

export function networkingCoefOf(lotUsd: number): number {
  let coef = 1.0;
  for (const tier of NETWORKING_COEF) {
    if (lotUsd >= tier.lotMinUsd) coef = tier.coefficient;
  }
  return coef;
}

// =========================================================================
// BALANCES (3 balance types)
// =========================================================================

export type BalanceKind = 'topup' | 'income' | 'referral';
export const BALANCE_KINDS: readonly BalanceKind[] = ['topup', 'income', 'referral'] as const;

// Only `income` balance allows withdrawal. `referral` must be moved to `income` first.
export const WITHDRAWABLE_BALANCE: BalanceKind = 'income';

// =========================================================================
// INCOME SOURCES
// =========================================================================

export type IncomeSource =
  | 'primary'         // main lot doubling
  | 'referral'        // 5-level ladder
  | 'world_pool'      // monthly bucket payout
  | 'networking'      // speaking events
  | 'ads';            // ads platform revenue

export const INCOME_SOURCES: readonly IncomeSource[] = [
  'primary', 'referral', 'world_pool', 'networking', 'ads',
] as const;
