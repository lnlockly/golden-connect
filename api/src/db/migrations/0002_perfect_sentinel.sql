CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_tg_id" bigint NOT NULL,
	"text" text NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_referrals" (
	"tg_id" bigint PRIMARY KEY NOT NULL,
	"ref_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_idx" integer NOT NULL,
	"delay_hours" double precision NOT NULL,
	"text_ru" text NOT NULL,
	"text_en" text,
	"text_zh" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "snooze_until" timestamp;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "chat_id" bigint;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "message_thread_id" bigint;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "posted_message_id" bigint;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "language_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invited_by_ref_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "presented_at" timestamp;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_step_id_reminder_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."reminder_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_step" ON "reminder_sends" USING btree ("user_id","step_id");--> statement-breakpoint
CREATE INDEX "idx_reminder_sends_user" ON "reminder_sends" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reminder_steps_order" ON "reminder_steps" USING btree ("order_idx");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_leads_contact" ON "leads" USING btree ("contact");--> statement-breakpoint
CREATE INDEX "idx_leads_posted" ON "leads" USING btree ("chat_id","posted_message_id");--> statement-breakpoint
CREATE INDEX "idx_leads_created" ON "leads" USING btree ("created_at");