CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"user_id" integer,
	"method" text NOT NULL,
	"amount_usd" double precision NOT NULL,
	"amount_usdt_micro" bigint,
	"crypto_address" text,
	"platega_id" text,
	"platega_url" text,
	"tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoices_lead" ON "invoices" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_status_created" ON "invoices" USING btree ("status","created_at");