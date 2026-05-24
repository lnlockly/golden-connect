-- Bonus Matrix — every user placed on registration regardless of tariff.
-- Separate from matrix_positions (which is gated by tariff purchase).
-- For visualization of community structure + future bonus distributions.

CREATE TABLE IF NOT EXISTS "bonus_matrix_positions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "position" integer NOT NULL,
  "parent_position" integer,
  "joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bonus_matrix_positions"
    ADD CONSTRAINT "bonus_matrix_user_unique" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bonus_matrix_positions"
    ADD CONSTRAINT "bonus_matrix_position_unique" UNIQUE ("position");
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "bonus_matrix_positions"
    ADD CONSTRAINT "bonus_matrix_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bonus_matrix_parent" ON "bonus_matrix_positions" ("parent_position");
CREATE INDEX IF NOT EXISTS "idx_bonus_matrix_joined" ON "bonus_matrix_positions" ("joined_at");
