DROP INDEX "uniq_user_quest";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_quest" ON "user_quests" USING btree ("user_id","quest_id");