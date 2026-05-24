-- Marketplace matrix deferral queue.
-- Pre-launch: matrix portion (7.5%) of marketplace sales accumulates here
-- instead of being distributed immediately (would all go to admin since
-- matrix_positions is empty pre-launch).
-- Post-launch (admin button): processPendingMpMatrix() drains this queue.

CREATE TABLE IF NOT EXISTS "mp_pending_matrix" (
  "id" serial PRIMARY KEY NOT NULL,
  "sale_id" text NOT NULL,
  "seller_user_id" integer NOT NULL,
  "matrix_pool_micro" bigint NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "processed_at" timestamp,
  "status" text DEFAULT 'pending' NOT NULL,
  "memo_base" text
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "mp_pending_matrix"
    ADD CONSTRAINT "mp_pending_matrix_sale_unique" UNIQUE ("sale_id");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_mp_pending_matrix_status"
  ON "mp_pending_matrix" USING btree ("status");
