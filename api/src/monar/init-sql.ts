// Self-bootstrap: create Monar tables on first start if missing.
// Idempotent (CREATE TABLE IF NOT EXISTS + indexes IF NOT EXISTS).
// Runs once on server boot via startMonarCron's caller path.

import { sql } from '../db/client.js';

const DDL = [
  // ---------- monar_lots ----------
  `CREATE TABLE IF NOT EXISTS monar_lots (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    lot_usd         INTEGER NOT NULL,
    business_places INTEGER NOT NULL,
    technical_lots  INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active',
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at       TIMESTAMPTZ,
    proceeds_cents  BIGINT NOT NULL DEFAULT 0,
    is_credit       BOOLEAN NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS monar_lots_user_idx ON monar_lots (user_id, status)`,

  // ---------- monar_places ----------
  `CREATE TABLE IF NOT EXISTS monar_places (
    id               SERIAL PRIMARY KEY,
    lot_id           INTEGER NOT NULL,
    owner_user_id    INTEGER,
    kind             TEXT NOT NULL,
    cycle            INTEGER NOT NULL DEFAULT 0,
    entries_received INTEGER NOT NULL DEFAULT 0,
    position         BIGINT NOT NULL,
    joined_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS monar_places_position_idx ON monar_places (position)`,
  `CREATE INDEX IF NOT EXISTS monar_places_owner_idx ON monar_places (owner_user_id, lot_id)`,

  // ---------- monar_income_accruals ----------
  `CREATE TABLE IF NOT EXISTS monar_income_accruals (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL,
    source          TEXT NOT NULL,
    amount_cents    BIGINT NOT NULL,
    place_id        INTEGER,
    referral_level  INTEGER,
    meta            JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS monar_income_accruals_user_idx ON monar_income_accruals (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS monar_income_accruals_source_idx ON monar_income_accruals (source, created_at)`,

  // ---------- monar_balances ----------
  `CREATE TABLE IF NOT EXISTS monar_balances (
    user_id        INTEGER PRIMARY KEY,
    topup_cents    BIGINT NOT NULL DEFAULT 0,
    income_cents   BIGINT NOT NULL DEFAULT 0,
    referral_cents BIGINT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---------- monar_balance_ops ----------
  `CREATE TABLE IF NOT EXISTS monar_balance_ops (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL,
    kind          TEXT NOT NULL,
    direction     TEXT NOT NULL,
    amount_cents  BIGINT NOT NULL,
    reason        TEXT NOT NULL,
    ref_id        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS monar_balance_ops_user_idx ON monar_balance_ops (user_id, created_at)`,

  // ---------- monar_world_pool_periods ----------
  `CREATE TABLE IF NOT EXISTS monar_world_pool_periods (
    id          SERIAL PRIMARY KEY,
    period      TEXT NOT NULL,
    total_cents BIGINT NOT NULL DEFAULT 0,
    settled_at  TIMESTAMPTZ
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS monar_world_pool_periods_period_uniq ON monar_world_pool_periods (period)`,

  // ---------- monar_world_pool_payouts ----------
  `CREATE TABLE IF NOT EXISTS monar_world_pool_payouts (
    id            SERIAL PRIMARY KEY,
    period_id     INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    bucket_index  INTEGER NOT NULL,
    amount_cents  BIGINT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS monar_world_pool_payouts_period_idx ON monar_world_pool_payouts (period_id, user_id)`,

  // ---------- monar_referral_links ----------
  `CREATE TABLE IF NOT EXISTS monar_referral_links (
    user_id          INTEGER PRIMARY KEY,
    inviter_user_id  INTEGER,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,

  // ---------- monar_referral_stats ----------
  `CREATE TABLE IF NOT EXISTS monar_referral_stats (
    user_id            INTEGER NOT NULL,
    level              INTEGER NOT NULL,
    count              INTEGER NOT NULL DEFAULT 0,
    total_volume_cents BIGINT NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS monar_referral_stats_pk ON monar_referral_stats (user_id, level)`,

  // ---------- monar_abonentka_charges ----------
  `CREATE TABLE IF NOT EXISTS monar_abonentka_charges (
    id            SERIAL PRIMARY KEY,
    lot_id        INTEGER NOT NULL,
    user_id       INTEGER NOT NULL,
    amount_cents  BIGINT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    due_at        TIMESTAMPTZ NOT NULL,
    paid_at       TIMESTAMPTZ
  )`,
  `CREATE INDEX IF NOT EXISTS monar_abonentka_charges_lot_idx ON monar_abonentka_charges (lot_id, due_at)`,

  // ---------- monar_credit_lots ----------
  `CREATE TABLE IF NOT EXISTS monar_credit_lots (
    user_id      INTEGER PRIMARY KEY,
    granted      BOOLEAN NOT NULL DEFAULT true,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    unlocked     BOOLEAN NOT NULL DEFAULT false,
    unlocked_at  TIMESTAMPTZ,
    amount_cents BIGINT NOT NULL
  )`,

  // ---------- monar_networking_talks ----------
  `CREATE TABLE IF NOT EXISTS monar_networking_talks (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    period      TEXT NOT NULL,
    talk_type   TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS monar_networking_talks_user_period_idx ON monar_networking_talks (user_id, period)`,

  // ---------- monar_ads_campaigns ----------
  `CREATE TABLE IF NOT EXISTS monar_ads_campaigns (
    id          SERIAL PRIMARY KEY,
    lot_id      INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    posts_used  INTEGER NOT NULL DEFAULT 0,
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS monar_ads_campaigns_lot_uniq ON monar_ads_campaigns (lot_id)`,

  // ---------- monar_ads_posts ----------
  `CREATE TABLE IF NOT EXISTS monar_ads_posts (
    id           SERIAL PRIMARY KEY,
    campaign_id  INTEGER NOT NULL,
    text         TEXT NOT NULL,
    image_urls   JSONB,
    languages    JSONB,
    published_at TIMESTAMPTZ
  )`,

  // ---------- monar_operations ----------
  `CREATE TABLE IF NOT EXISTS monar_operations (
    id            SERIAL PRIMARY KEY,
    kind          TEXT NOT NULL,
    payload       JSONB,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
  )`,
];

let initialized = false;

export async function ensureMonarTables(log?: { info?: (...a: any[]) => void; error?: (...a: any[]) => void }): Promise<void> {
  if (initialized) return;
  for (const stmt of DDL) {
    await sql.unsafe(stmt);
  }
  initialized = true;
  log?.info?.({ tables: 13 }, 'monar.tables.ensured');
}
