-- Phase: 4-balance system (working / gift / subscription / karma) + matrix-frozen pre-launch
-- pre-start: matrix payouts frozen (will unfreeze by admin button later);
-- partner-line payouts ARE active; subscription accumulates 20% of all earnings up to cap;
-- karma is separate gamification balance for weekly raffles.

------------------------------------------------------------
-- 1. USERS — add subscription + karma + tariff lifecycle fields
------------------------------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "subscription_balance_micro" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "karma_points" bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "active_tariff_code" text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "tariff_started_at" timestamp,
  ADD COLUMN IF NOT EXISTS "tariff_expires_at" timestamp,
  ADD COLUMN IF NOT EXISTS "tariff_auto_renew" boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "matrix_frozen" boolean NOT NULL DEFAULT true;
--> statement-breakpoint

------------------------------------------------------------
-- 2. KARMA_LOG — audit trail for karma events
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "karma_log" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "points" bigint NOT NULL,
  "balance_after" bigint NOT NULL,
  "source_kind" text,
  "source_id" bigint,
  "memo" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "karma_log"
  ADD CONSTRAINT "karma_log_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_karma_log_user_time"
  ON "karma_log" ("user_id", "created_at" DESC);
--> statement-breakpoint

------------------------------------------------------------
-- 3. TRANSFERS — explicit movement between user's wallets (working/gift/subscription)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "wallet_transfers" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL,
  "from_wallet" text NOT NULL,
  "to_wallet" text NOT NULL,
  "amount_micro" bigint NOT NULL,
  "memo" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "wallet_transfers"
  ADD CONSTRAINT "wallet_transfers_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_wallet_transfers_user_time"
  ON "wallet_transfers" ("user_id", "created_at" DESC);
--> statement-breakpoint

------------------------------------------------------------
-- 4. KARMA_RAFFLE — weekly raffle records (winners + payout)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "karma_raffles" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "week_start" date NOT NULL UNIQUE,
  "week_end" date NOT NULL,
  "prize_pool_micro" bigint NOT NULL DEFAULT 0,
  "winners_count" integer NOT NULL DEFAULT 0,
  "drawn_at" timestamp with time zone,
  "status" text NOT NULL DEFAULT 'pending'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "karma_raffle_winners" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "raffle_id" bigint NOT NULL,
  "user_id" integer NOT NULL,
  "position" integer NOT NULL,
  "karma_points_at_draw" bigint NOT NULL,
  "prize_micro" bigint NOT NULL,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "karma_raffle_winners"
  ADD CONSTRAINT "karma_raffle_winners_raffle_id_fk"
  FOREIGN KEY ("raffle_id") REFERENCES "public"."karma_raffles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "karma_raffle_winners"
  ADD CONSTRAINT "karma_raffle_winners_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_karma_raffle_winners_user"
  ON "karma_raffle_winners" ("user_id", "raffle_id");
--> statement-breakpoint

------------------------------------------------------------
-- 5. SUBSCRIPTION_CAPS — config table for cap per tariff (cents/micro)
-- (could be hardcoded in app code, but table = easier admin tweaks)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "subscription_caps" (
  "tariff_code" text PRIMARY KEY,
  "cap_micro" bigint NOT NULL,
  "split_percent" integer NOT NULL DEFAULT 20,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

INSERT INTO "subscription_caps" ("tariff_code", "cap_micro", "split_percent") VALUES
  ('free',   45000000, 20),  -- $45 to upgrade to LAUNCH
  ('launch', 15000000, 20),  -- $15 = 1 month maintenance
  ('boost',  30000000, 20),  -- $30 = 1 month maintenance ×2
  ('rocket', 45000000, 20)   -- $45 = 1 month maintenance ×3
ON CONFLICT (tariff_code) DO UPDATE SET
  cap_micro = EXCLUDED.cap_micro,
  split_percent = EXCLUDED.split_percent,
  updated_at = now();
--> statement-breakpoint

------------------------------------------------------------
-- 6. TARIFF_HISTORY — purchase/upgrade/renew/expire audit
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "tariff_history" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL,
  "action" text NOT NULL,
  "prev_tariff" text,
  "new_tariff" text,
  "prev_seats" integer,
  "new_seats" integer,
  "amount_micro" bigint NOT NULL DEFAULT 0,
  "source_wallet" text,
  "expires_at" timestamp,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "tariff_history"
  ADD CONSTRAINT "tariff_history_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_tariff_history_user_time"
  ON "tariff_history" ("user_id", "created_at" DESC);
--> statement-breakpoint

------------------------------------------------------------
-- 7. NOTIFICATIONS_INBOX — user-facing notifications (separate from scheduled_notifications which is for outbound TG/email scheduling)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "notifications_inbox" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',
  "title" text NOT NULL,
  "body" text,
  "url" text,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "delivered_tg" boolean NOT NULL DEFAULT false,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
ALTER TABLE "notifications_inbox"
  ADD CONSTRAINT "notifications_inbox_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_notifications_inbox_user_time"
  ON "notifications_inbox" ("user_id", "created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_notifications_inbox_unread"
  ON "notifications_inbox" ("user_id") WHERE "read_at" IS NULL;
