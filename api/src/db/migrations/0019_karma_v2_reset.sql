-- Karma v2 reset + login_streak column.
-- User: 'прошлые действия по карме удали и новое что мы продумали сделай'.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_streak" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Wipe karma_log entirely — old reward semantics don't match new rules.
TRUNCATE TABLE "karma_log";
--> statement-breakpoint

-- Reset all users' karma_points to 0 (start fresh with new rules).
UPDATE "users" SET "karma_points" = 0;
