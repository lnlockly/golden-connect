-- Reverts 0006 and splits into two separate tables on the shared Neon DB:
-- the renamed table (currently `cash_ledger`, holding agentflow-api's data)
-- is renamed back to `flow_ledger`, and a new empty `cash_ledger` is created
-- for Golden Connect. FKs on matrix_accruals/referral_accruals/task_completions/
-- ad_impressions are rebound from the old (soon-to-be-renamed) cash_ledger
-- to the new cash_ledger.

-- 1. Drop child FKs so we can rename the table they reference.
ALTER TABLE "ad_impressions" DROP CONSTRAINT "ad_impressions_ledger_id_cash_ledger_id_fk";--> statement-breakpoint
ALTER TABLE "matrix_accruals" DROP CONSTRAINT "matrix_accruals_ledger_id_cash_ledger_id_fk";--> statement-breakpoint
ALTER TABLE "referral_accruals" DROP CONSTRAINT "referral_accruals_ledger_id_cash_ledger_id_fk";--> statement-breakpoint
ALTER TABLE "task_completions" DROP CONSTRAINT "task_completions_ledger_id_cash_ledger_id_fk";--> statement-breakpoint

-- 2. Rename the current cash_ledger back to flow_ledger (restores
--    agentflow-api's original table with its rows).
ALTER TABLE "cash_ledger" RENAME TO "flow_ledger";--> statement-breakpoint
ALTER TABLE "flow_ledger" DROP CONSTRAINT "cash_ledger_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "flow_ledger" DROP CONSTRAINT "cash_ledger_related_lead_id_leads_id_fk";--> statement-breakpoint
ALTER TABLE "flow_ledger" DROP CONSTRAINT "cash_ledger_related_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_related_lead_id_leads_id_fk" FOREIGN KEY ("related_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 3. Create a fresh, empty cash_ledger for Golden Connect.
CREATE TABLE "cash_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"amount_micro" bigint NOT NULL,
	"related_lead_id" integer,
	"related_user_id" integer,
	"level" integer,
	"memo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_related_lead_id_leads_id_fk" FOREIGN KEY ("related_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- 4. The pre-rename index `idx_ledger_user_time` rode along when the
--    table was renamed cash_ledger→flow_ledger above, so it's already
--    sitting on flow_ledger. Add the new index for cash_ledger.
CREATE INDEX "idx_cash_ledger_user_time" ON "cash_ledger" USING btree ("user_id","created_at");--> statement-breakpoint

-- 5. Rebind child FKs to the new cash_ledger.
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_accruals" ADD CONSTRAINT "matrix_accruals_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_accruals" ADD CONSTRAINT "referral_accruals_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;
