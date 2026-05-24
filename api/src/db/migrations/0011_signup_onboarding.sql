-- Phase: signup revamp + onboarding wizard
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "country" text,
  ADD COLUMN IF NOT EXISTS "bio" text,
  ADD COLUMN IF NOT EXISTS "avatar_url" text,
  ADD COLUMN IF NOT EXISTS "profile_filled_at" timestamp,
  ADD COLUMN IF NOT EXISTS "channels_joined_at" timestamp;
--> statement-breakpoint
ALTER TABLE "credentials"
  ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "email_verify_token" text,
  ADD COLUMN IF NOT EXISTS "email_verify_sent_at" timestamp;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credentials_verify_token" ON "credentials" ("email_verify_token");
