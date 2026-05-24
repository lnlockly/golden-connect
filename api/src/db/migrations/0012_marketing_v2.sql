-- Phase: new marketing model (FREE/LAUNCH/BOOST/ROCKET + business seats + partner status + matching bonus + leader pool)
-- Replaces legacy Silver/Gold/Platinum + start/basic/core + Activity Score + Jackpot + Platinum Smart Matrix.

ALTER TABLE "tariffs"
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "business_seats_count" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "matrix_depth" integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS "matrix_rate_micro" bigint NOT NULL DEFAULT 500000,
  ADD COLUMN IF NOT EXISTS "ref_levels" integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "has_matching_bonus" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- Deactivate legacy tariffs (start/basic/core). Rows stay for ledger FK history.
UPDATE "tariffs" SET "is_active" = false WHERE "code" IN ('start', 'basic', 'core');
--> statement-breakpoint

-- Seed the four new tariffs. ON CONFLICT keeps re-runs idempotent.
-- entry_micro = activation fee (one-time). monthly_fee_micro = $15/mo maintenance.
-- Matrix rates: LAUNCH $0.5/lvl × 12, BOOST $0.6/lvl × 14, ROCKET $0.7/lvl × 17.
INSERT INTO "tariffs" (code, name, entry_micro, daily_cap_micro, monthly_fee_micro, sort_order, is_active, business_seats_count, matrix_depth, matrix_rate_micro, ref_levels, has_matching_bonus)
VALUES
  ('free',   'FREE',         0,         20000000,         0, 0, true, 0,  0,       0, 1,  false),
  ('launch', 'LAUNCH',   30000000,      20000000,  15000000, 1, true, 1, 12,  500000, 10, false),
  ('boost',  'BOOST',    75000000,      20000000,  15000000, 2, true, 2, 14,  600000, 10, false),
  ('rocket', 'ROCKET',  120000000,      20000000,  15000000, 3, true, 3, 17,  700000, 10, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  entry_micro = EXCLUDED.entry_micro,
  daily_cap_micro = EXCLUDED.daily_cap_micro,
  monthly_fee_micro = EXCLUDED.monthly_fee_micro,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  business_seats_count = EXCLUDED.business_seats_count,
  matrix_depth = EXCLUDED.matrix_depth,
  matrix_rate_micro = EXCLUDED.matrix_rate_micro,
  ref_levels = EXCLUDED.ref_levels,
  has_matching_bonus = EXCLUDED.has_matching_bonus;
--> statement-breakpoint

-- Users: partner status flag + gift balance
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "partner_status" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "partner_status_since" timestamp,
  ADD COLUMN IF NOT EXISTS "gift_balance_micro" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "qualified_refs_l1" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Business seats (1..N per user, each tied to a tariff).
-- A ROCKET holder has `business_seats_count=3` paid, but they can also hold
-- multiple seats of the same tariff (one account can open unlimited seats).
CREATE TABLE IF NOT EXISTS "business_seats" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tariff_id" integer NOT NULL REFERENCES "tariffs"("id"),
  "seat_index" integer NOT NULL DEFAULT 1,
  "activated_at" timestamp NOT NULL DEFAULT now(),
  "deactivated_at" timestamp,
  "monthly_fee_paid_until" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_seats_user_active" ON "business_seats"("user_id") WHERE "deactivated_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_seats_tariff" ON "business_seats"("tariff_id");
--> statement-breakpoint

-- Matching Bonus ledger — only ROCKET holders receive (10% off L1..L3 partner accruals).
CREATE TABLE IF NOT EXISTS "matching_bonus_ledger" (
  "id" bigserial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "from_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "line_depth" integer NOT NULL CHECK ("line_depth" BETWEEN 1 AND 3),
  "source_flow_ledger_id" bigint,
  "amount_micro" bigint NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_matching_user" ON "matching_bonus_ledger"("user_id");
CREATE INDEX IF NOT EXISTS "idx_matching_from" ON "matching_bonus_ledger"("from_user_id");
--> statement-breakpoint

-- Leader Pool: biweekly snapshot + distribution (1st / 15th of each month).
CREATE TABLE IF NOT EXISTS "leader_pool_distributions" (
  "id" serial PRIMARY KEY,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "total_pool_micro" bigint NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'pending',
  "distributed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "leader_pool_period_unique" UNIQUE ("period_start", "period_end")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "leader_pool_awards" (
  "id" bigserial PRIMARY KEY,
  "distribution_id" integer NOT NULL REFERENCES "leader_pool_distributions"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "rank" integer NOT NULL CHECK ("rank" BETWEEN 1 AND 15),
  "percent_bp" integer NOT NULL,
  "amount_micro" bigint NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_leader_awards_user" ON "leader_pool_awards"("user_id");
CREATE INDEX IF NOT EXISTS "idx_leader_awards_dist" ON "leader_pool_awards"("distribution_id");
