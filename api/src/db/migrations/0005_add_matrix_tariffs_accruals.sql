CREATE TABLE "ad_impressions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"campaign_id" text,
	"reward_micro" bigint NOT NULL,
	"day_bucket" date NOT NULL,
	"ledger_id" integer,
	"watched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matrix_accruals" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"from_position" integer NOT NULL,
	"level" integer NOT NULL,
	"amount_micro" bigint NOT NULL,
	"ledger_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matrix_positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"position" integer NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matrix_positions_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "matrix_positions_position_unique" UNIQUE("position")
);
--> statement-breakpoint
CREATE TABLE "referral_accruals" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_user_id" integer NOT NULL,
	"from_user_id" integer NOT NULL,
	"level" integer NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" integer,
	"amount_micro" bigint NOT NULL,
	"ledger_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"entry_micro" bigint NOT NULL,
	"daily_cap_micro" bigint NOT NULL,
	"monthly_fee_micro" bigint NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tariffs_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "task_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"task_id" text NOT NULL,
	"reward_micro" bigint NOT NULL,
	"day_bucket" date NOT NULL,
	"ledger_id" integer,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tariffs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tariff_id" integer NOT NULL,
	"active_since" timestamp DEFAULT now() NOT NULL,
	"active_until" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_impressions" ADD CONSTRAINT "ad_impressions_ledger_id_flow_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."flow_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_accruals" ADD CONSTRAINT "matrix_accruals_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_accruals" ADD CONSTRAINT "matrix_accruals_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_accruals" ADD CONSTRAINT "matrix_accruals_ledger_id_flow_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."flow_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matrix_positions" ADD CONSTRAINT "matrix_positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_accruals" ADD CONSTRAINT "referral_accruals_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_accruals" ADD CONSTRAINT "referral_accruals_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_accruals" ADD CONSTRAINT "referral_accruals_ledger_id_flow_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."flow_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_ledger_id_flow_ledger_id_fk" FOREIGN KEY ("ledger_id") REFERENCES "public"."flow_ledger"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tariffs" ADD CONSTRAINT "user_tariffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tariffs" ADD CONSTRAINT "user_tariffs_tariff_id_tariffs_id_fk" FOREIGN KEY ("tariff_id") REFERENCES "public"."tariffs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ad_imp_user_day" ON "ad_impressions" USING btree ("user_id","day_bucket");--> statement-breakpoint
CREATE INDEX "idx_matrix_accr_recipient" ON "matrix_accruals" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_matrix_accr_from" ON "matrix_accruals" USING btree ("from_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_matrix_accr_from_level" ON "matrix_accruals" USING btree ("from_user_id","level");--> statement-breakpoint
CREATE INDEX "idx_matrix_pos" ON "matrix_positions" USING btree ("position");--> statement-breakpoint
CREATE INDEX "idx_ref_accr_recipient" ON "referral_accruals" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_ref_accr_source" ON "referral_accruals" USING btree ("from_user_id","level","source_kind","source_id");--> statement-breakpoint
CREATE INDEX "idx_tariffs_sort" ON "tariffs" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_task_completions_user_day" ON "task_completions" USING btree ("user_id","day_bucket");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_task_completion" ON "task_completions" USING btree ("user_id","task_id");--> statement-breakpoint
CREATE INDEX "idx_user_tariffs_user" ON "user_tariffs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_tariffs_active" ON "user_tariffs" USING btree ("user_id","is_active");