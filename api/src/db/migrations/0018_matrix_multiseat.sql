-- Phase 10b: multi-seat matrix support
-- BOOST has 2 business_seats, ROCKET has 3 — each seat now gets its own
-- matrix position. matrix_positions.user_id is no longer unique;
-- (user_id, seat_index) becomes the new uniqueness key.

ALTER TABLE "matrix_positions" DROP CONSTRAINT IF EXISTS "matrix_positions_user_id_unique";
--> statement-breakpoint

ALTER TABLE "matrix_positions" ADD COLUMN IF NOT EXISTS "seat_index" integer NOT NULL DEFAULT 1;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "matrix_positions"
    ADD CONSTRAINT "matrix_positions_user_seat_unique"
    UNIQUE ("user_id", "seat_index");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_matrix_positions_user_id"
  ON "matrix_positions" USING btree ("user_id");
