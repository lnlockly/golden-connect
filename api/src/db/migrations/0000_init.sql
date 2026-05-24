CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" integer,
	"name" text NOT NULL,
	"ticker" text,
	"character" jsonb NOT NULL,
	"plugins" jsonb NOT NULL,
	"state" text DEFAULT 'queued' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deployed_at" timestamp,
	"ingress_url" text,
	"error" text,
	CONSTRAINT "agents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ai_turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"tg_id" bigint,
	"user_id" integer,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flow_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"amount_micro" bigint NOT NULL,
	"related_lead_id" integer,
	"related_user_id" integer,
	"level" integer,
	"memo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"child_user_id" integer NOT NULL,
	"parent_user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_edges_child_user_id_unique" UNIQUE("child_user_id")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"track" text NOT NULL,
	"contact" text,
	"payload" jsonb NOT NULL,
	"source" text,
	"lang" text,
	"status" text DEFAULT 'new' NOT NULL,
	"taken_by_tg_id" bigint,
	"taken_at" timestamp,
	"resolved_at" timestamp,
	"total_usd" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"address" text NOT NULL,
	"chain_id" integer DEFAULT 56 NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_wallets_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"tg_id" bigint,
	"tg_username" text,
	"ref_code" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"applied_on_site" boolean DEFAULT false NOT NULL,
	"applied_at" timestamp,
	"ref_notifications_enabled" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_tg_id_unique" UNIQUE("tg_id"),
	CONSTRAINT "users_ref_code_unique" UNIQUE("ref_code")
);
--> statement-breakpoint
CREATE TABLE "wallet_nonces" (
	"address" text PRIMARY KEY NOT NULL,
	"nonce" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_related_lead_id_leads_id_fk" FOREIGN KEY ("related_lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flow_ledger" ADD CONSTRAINT "flow_ledger_related_user_id_users_id_fk" FOREIGN KEY ("related_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_edges" ADD CONSTRAINT "invite_edges_child_user_id_users_id_fk" FOREIGN KEY ("child_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_edges" ADD CONSTRAINT "invite_edges_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_wallets" ADD CONSTRAINT "user_wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_ai_turns_user_time" ON "ai_turns" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ledger_user_time" ON "flow_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_invite_parent" ON "invite_edges" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "idx_leads_user" ON "leads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leads_status" ON "leads" USING btree ("status");