// Drizzle schema for Monar. ALL tables are prefixed `monar_` so they never
// collide with existing trendex schema. Still NOT exported from
// `src/db/schema.ts` — activation = adding `export * from '../monar/schema.js'`
// there + running `npm run generate` to create the migration.

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// -------------------------------------------------------------------------
// Lots
// -------------------------------------------------------------------------

export const monarLots = pgTable(
  'monar_lots',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    lotUsd: integer('lot_usd').notNull(),                   // 50..1000
    businessPlaces: integer('business_places').notNull(),
    technicalLots: integer('technical_lots').notNull(),
    status: text('status').notNull().default('active'),     // 'active' | 'closed' | 'frozen'
    activatedAt: timestamp('activated_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    proceedsCents: bigint('proceeds_cents', { mode: 'number' }).default(0).notNull(),
    isCredit: boolean('is_credit').default(false).notNull(), // true = free $10 starter
  },
  (t) => ({
    byUser: index('monar_lots_user_idx').on(t.userId, t.status),
  }),
);

// -------------------------------------------------------------------------
// Global queue places (single chain for everybody)
// -------------------------------------------------------------------------

export const monarPlaces = pgTable(
  'monar_places',
  {
    id: serial('id').primaryKey(),
    lotId: integer('lot_id').notNull(),
    ownerUserId: integer('owner_user_id'),                  // null = technical place
    kind: text('kind').notNull(),                           // 'business' | 'technical'
    cycle: integer('cycle').default(0).notNull(),
    entriesReceived: integer('entries_received').default(0).notNull(), // 0..2
    position: bigint('position', { mode: 'number' }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byPosition: index('monar_places_position_idx').on(t.position),
    byOwner: index('monar_places_owner_idx').on(t.ownerUserId, t.lotId),
  }),
);

// -------------------------------------------------------------------------
// Income accruals (every payout to a user with source tag)
// -------------------------------------------------------------------------

export const monarIncomeAccruals = pgTable(
  'monar_income_accruals',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    source: text('source').notNull(),                       // see IncomeSource
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    placeId: integer('place_id'),                           // origin place if applicable
    referralLevel: integer('referral_level'),               // 1..5 for source='referral'
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index('monar_income_accruals_user_idx').on(t.userId, t.createdAt),
    bySource: index('monar_income_accruals_source_idx').on(t.source, t.createdAt),
  }),
);

// -------------------------------------------------------------------------
// 3-balance accounting
// -------------------------------------------------------------------------

export const monarBalances = pgTable(
  'monar_balances',
  {
    userId: integer('user_id').primaryKey(),
    topupCents: bigint('topup_cents', { mode: 'number' }).default(0).notNull(),
    incomeCents: bigint('income_cents', { mode: 'number' }).default(0).notNull(),
    referralCents: bigint('referral_cents', { mode: 'number' }).default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const monarBalanceOps = pgTable(
  'monar_balance_ops',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    kind: text('kind').notNull(),                           // 'topup' | 'income' | 'referral'
    direction: text('direction').notNull(),                 // 'credit' | 'debit' | 'transfer'
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),                       // free-form, e.g. 'lot_buy', 'lot_close', 'pool_payout'
    refId: text('ref_id'),                                  // optional foreign id (lot id, place id, etc)
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index('monar_balance_ops_user_idx').on(t.userId, t.createdAt),
  }),
);

// -------------------------------------------------------------------------
// World pool buckets (monthly settlements)
// -------------------------------------------------------------------------

export const monarWorldPoolPeriods = pgTable(
  'monar_world_pool_periods',
  {
    id: serial('id').primaryKey(),
    period: text('period').notNull(),                       // YYYY-MM
    totalCents: bigint('total_cents', { mode: 'number' }).default(0).notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => ({
    uniq: uniqueIndex('monar_world_pool_periods_period_uniq').on(t.period),
  }),
);

export const monarWorldPoolPayouts = pgTable(
  'monar_world_pool_payouts',
  {
    id: serial('id').primaryKey(),
    periodId: integer('period_id').notNull(),
    userId: integer('user_id').notNull(),
    bucketIndex: integer('bucket_index').notNull(),         // 0..7
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byPeriod: index('monar_world_pool_payouts_period_idx').on(t.periodId, t.userId),
  }),
);

// -------------------------------------------------------------------------
// Referral graph (5 levels)
// -------------------------------------------------------------------------

export const monarReferralLinks = pgTable(
  'monar_referral_links',
  {
    userId: integer('user_id').primaryKey(),
    inviterUserId: integer('inviter_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
);

export const monarReferralStats = pgTable(
  'monar_referral_stats',
  {
    userId: integer('user_id').notNull(),
    level: integer('level').notNull(),                      // 1..5
    count: integer('count').default(0).notNull(),
    totalVolumeCents: bigint('total_volume_cents', { mode: 'number' }).default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: uniqueIndex('monar_referral_stats_pk').on(t.userId, t.level),
  }),
);

// -------------------------------------------------------------------------
// Abonentka (weekly fee)
// -------------------------------------------------------------------------

export const monarAbonentkaCharges = pgTable(
  'monar_abonentka_charges',
  {
    id: serial('id').primaryKey(),
    lotId: integer('lot_id').notNull(),
    userId: integer('user_id').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending'),    // 'pending' | 'paid' | 'failed'
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }),
  },
  (t) => ({
    byLot: index('monar_abonentka_charges_lot_idx').on(t.lotId, t.dueAt),
  }),
);

// -------------------------------------------------------------------------
// Credit lot (free $10 starter)
// -------------------------------------------------------------------------

export const monarCreditLots = pgTable(
  'monar_credit_lots',
  {
    userId: integer('user_id').primaryKey(),
    granted: boolean('granted').default(true).notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
    unlocked: boolean('unlocked').default(false).notNull(),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
  },
);

// -------------------------------------------------------------------------
// Networking (talks count per user per month, then fund split)
// -------------------------------------------------------------------------

export const monarNetworkingTalks = pgTable(
  'monar_networking_talks',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    period: text('period').notNull(),                       // YYYY-MM
    talkType: text('talk_type').notNull(),                  // 'webinar' | 'meetup' | 'presentation' | ...
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserPeriod: index('monar_networking_talks_user_period_idx').on(t.userId, t.period),
  }),
);

// -------------------------------------------------------------------------
// Ads campaigns (track posts per lot)
// -------------------------------------------------------------------------

export const monarAdsCampaigns = pgTable(
  'monar_ads_campaigns',
  {
    id: serial('id').primaryKey(),
    lotId: integer('lot_id').notNull(),
    userId: integer('user_id').notNull(),
    postsUsed: integer('posts_used').default(0).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byLot: uniqueIndex('monar_ads_campaigns_lot_uniq').on(t.lotId),
  }),
);

export const monarAdsPosts = pgTable(
  'monar_ads_posts',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id').notNull(),
    text: text('text').notNull(),
    imageUrls: jsonb('image_urls'),                         // array of urls
    languages: jsonb('languages'),                          // array of translated content
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
);

// -------------------------------------------------------------------------
// Operations log (for admin / audit)
// -------------------------------------------------------------------------

export const monarOperations = pgTable(
  'monar_operations',
  {
    id: serial('id').primaryKey(),
    kind: text('kind').notNull(),
    payload: jsonb('payload'),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
);
