CREATE TABLE "user_quests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"quest_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"reward_micro" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_quests" ADD CONSTRAINT "user_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_quests_user" ON "user_quests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "uniq_user_quest" ON "user_quests" USING btree ("user_id","quest_id");