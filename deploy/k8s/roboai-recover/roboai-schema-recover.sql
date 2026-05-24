-- Recreate CRM manual-send tables in roboai schema (lost in Neon→self-hosted PG migration).
-- These were created ad-hoc via prisma db push on old Neon, never committed as a migration,
-- so prisma migrate deploy on the new DB did not recreate them.
-- Reconstructed from raw $queryRaw statements in roboai-engine dist (crm-manual/*).

SET search_path TO roboai, public;

CREATE TABLE IF NOT EXISTS roboai."CrmConversation" (
  id                          SERIAL PRIMARY KEY,
  "ownerUserId"               INTEGER      NOT NULL,
  "accountId"                 INTEGER      NOT NULL,
  "personId"                  INTEGER,
  "targetTgUsername"          TEXT,
  "targetTgId"                BIGINT,
  "targetName"                TEXT,
  status                      TEXT         NOT NULL DEFAULT 'active',
  "unreadCount"               INTEGER      NOT NULL DEFAULT 0,
  "folderId"                  INTEGER,
  "lastUserMsgAt"             TIMESTAMPTZ,
  "lastLeadMsgAt"             TIMESTAMPTZ,
  "totalSpentCents"           INTEGER      NOT NULL DEFAULT 0,
  "targetTgUnreachable"       BOOLEAN      NOT NULL DEFAULT false,
  "targetTgUnreachableReason" TEXT,
  "createdAt"                 TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"                 TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmConversation_owner_status_idx"
  ON roboai."CrmConversation" ("ownerUserId", status);
CREATE INDEX IF NOT EXISTS "CrmConversation_folder_idx"
  ON roboai."CrmConversation" ("folderId");

CREATE TABLE IF NOT EXISTS roboai."CrmConversationMessage" (
  id                 SERIAL PRIMARY KEY,
  "conversationId"   INTEGER      NOT NULL,
  direction          TEXT         NOT NULL,
  text               TEXT         NOT NULL DEFAULT '',
  "aiSuggestionUsed" BOOLEAN      NOT NULL DEFAULT false,
  "aiSuggestionRaw"  TEXT,
  "costCents"        INTEGER      NOT NULL DEFAULT 0,
  "tgMessageId"      BIGINT,
  "sentAt"           TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmConversationMessage_conv_sent_idx"
  ON roboai."CrmConversationMessage" ("conversationId", "sentAt");

CREATE TABLE IF NOT EXISTS roboai."CrmDailyCap" (
  "ownerUserId" INTEGER NOT NULL,
  "accountId"   INTEGER NOT NULL,
  "day"         DATE    NOT NULL,
  "sentCount"   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("ownerUserId", "accountId", "day")
);

CREATE TABLE IF NOT EXISTS roboai."CrmFolder" (
  id            SERIAL PRIMARY KEY,
  "ownerUserId" INTEGER     NOT NULL,
  name          TEXT        NOT NULL,
  emoji         TEXT,
  "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "CrmFolder_owner_idx"
  ON roboai."CrmFolder" ("ownerUserId");
-- Recover post-2026-05-12 schema changes lost when Neon→self-hosted PG migration
-- replayed only committed prisma migrations (db push changes were never committed).
-- Additive only. Does NOT touch CRM tables or rename FK constraints.

-- 1) AdCampaignStatus enum gains PAUSED_NO_FUNDS (billing query filters on it)
ALTER TYPE roboai."AdCampaignStatus" ADD VALUE IF NOT EXISTS 'PAUSED_NO_FUNDS';

-- 2) AdCampaign deposit-billing columns (fixes BillingCron + AdCampaignDispatcher)
ALTER TABLE roboai."AdCampaign"
  ADD COLUMN IF NOT EXISTS "autoTopup"              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "balanceCents"           INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastLowBalanceNotifyAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastTopupAt"            TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "minBalanceCents"        INTEGER NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS "pausedReason"           TEXT,
  ADD COLUMN IF NOT EXISTS "shadowCampaignId"       INTEGER,
  ADD COLUMN IF NOT EXISTS "topupChunkCents"        INTEGER NOT NULL DEFAULT 500;

-- 3) Campaign / Dialog additive columns
ALTER TABLE roboai."Campaign"
  ADD COLUMN IF NOT EXISTS "maxNewDialogsPerAccountPerDay" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE roboai."Dialog"
  ADD COLUMN IF NOT EXISTS "adCampaignId"        INTEGER,
  ADD COLUMN IF NOT EXISTS "firstMessageSentAt"  TIMESTAMP(3);

-- 4) CampaignBilling table (billing events ledger; in prisma schema, not yet in DB)
CREATE TABLE IF NOT EXISTS roboai."CampaignBilling" (
  id            SERIAL PRIMARY KEY,
  "campaignId"  INTEGER NOT NULL,
  "userId"      INTEGER NOT NULL,
  kind          TEXT    NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  source        TEXT,
  "dialogId"    INTEGER,
  meta          JSONB,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CampaignBilling_campaignId_createdAt_idx"
  ON roboai."CampaignBilling" ("campaignId", "createdAt");
CREATE INDEX IF NOT EXISTS "CampaignBilling_userId_createdAt_idx"
  ON roboai."CampaignBilling" ("userId", "createdAt");

-- 5) MlmPayout table (raw-only, referenced by billing.service INSERT/UPDATE)
CREATE TABLE IF NOT EXISTS roboai."MlmPayout" (
  id                SERIAL PRIMARY KEY,
  "campaignId"      INTEGER,
  "dialogId"        INTEGER,
  "sourceUserId"    INTEGER,
  "recipientUserId" INTEGER,
  kind              TEXT    NOT NULL,
  level             INTEGER,
  "amountMicro"     BIGINT  NOT NULL DEFAULT 0,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "settledAt"       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "MlmPayout_recipient_idx"
  ON roboai."MlmPayout" ("recipientUserId", "createdAt");
