ALTER TABLE "flow_ledger" RENAME TO "cash_ledger";--> statement-breakpoint
ALTER TABLE "ad_impressions" DROP CONSTRAINT "ad_impressions_ledger_id_flow_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_ledger" DROP CONSTRAINT "flow_ledger_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_ledger" DROP CONSTRAINT "flow_ledger_related_lead_id_leads_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_ledger" DROP CONSTRAINT "flow_ledger_related_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "matrix_accruals" DROP CONSTRAINT "matrix_accruals_ledger_id_flow_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "referral_accruals" DROP CONSTRAINT "referral_accruals_ledger_id_flow_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "task_completions" DROP CONSTRAINT "task_completions_ledger_id_flow_ledger_id_fk";
--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_related_lead_id_leads_id_fk" FOREIGN KEY ("related_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_ledger" ADD CONSTRAINT "cash_ledger_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_accruals" ADD CONSTRAINT "matrix_accruals_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_accruals" ADD CONSTRAINT "referral_accruals_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_ledger_id_cash_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."cash_ledger"("id") ON DELETE no action ON UPDATE no action;