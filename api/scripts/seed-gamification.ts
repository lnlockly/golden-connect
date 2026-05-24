/**
 * Seed the gamification content: quests, mission templates, quizzes.
 * Idempotent: upserts by primary key so reruns only refresh rows.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-gamification.ts
 *
 * Run order is independent — each table is self-contained; no FK between
 * these content tables.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as sqlTag } from 'drizzle-orm';
import {
  missionTemplates,
  quests,
  quizzes,
} from '../src/db/schema.js';
import { MISSION_TEMPLATES } from '../src/seeds/mission-templates.seed.js';
import { QUESTS } from '../src/seeds/quests.seed.js';
import { QUIZZES } from '../src/seeds/quizzes.seed.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const client = postgres(url, { prepare: false });
  const db = drizzle(client);

  let mCount = 0;
  for (const t of MISSION_TEMPLATES) {
    await db
      .insert(missionTemplates)
      .values(t)
      .onConflictDoUpdate({
        target: missionTemplates.id,
        set: {
          title: t.title,
          description: t.description ?? '',
          steps: t.steps as object,
          policy: t.policy as object,
          active: t.active ?? true,
        },
      });
    mCount++;
  }

  let qCount = 0;
  for (const q of QUESTS) {
    await db
      .insert(quests)
      .values(q)
      .onConflictDoUpdate({
        target: quests.id,
        set: {
          chapter: q.chapter,
          title: q.title,
          description: q.description ?? '',
          xp: q.xp ?? 0,
          criteria: q.criteria as object,
          orderIdx: q.orderIdx ?? 0,
          active: q.active ?? true,
        },
      });
    qCount++;
  }

  let zCount = 0;
  for (const z of QUIZZES) {
    await db
      .insert(quizzes)
      .values(z)
      .onConflictDoUpdate({
        target: quizzes.id,
        set: {
          title: z.title,
          description: z.description ?? '',
          questions: z.questions as object,
          resultMap: z.resultMap as object,
          active: z.active ?? true,
        },
      });
    zCount++;
  }

  const [{ quests_count }] = await db.execute<{ quests_count: number }>(
    sqlTag`SELECT COUNT(*)::int AS quests_count FROM quests`,
  );
  const [{ missions_count }] = await db.execute<{ missions_count: number }>(
    sqlTag`SELECT COUNT(*)::int AS missions_count FROM mission_templates`,
  );
  const [{ quizzes_count }] = await db.execute<{ quizzes_count: number }>(
    sqlTag`SELECT COUNT(*)::int AS quizzes_count FROM quizzes`,
  );
  console.log(
    `gamification seed: missions=${mCount}/${missions_count}, quests=${qCount}/${quests_count}, quizzes=${zCount}/${quizzes_count}`,
  );
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
