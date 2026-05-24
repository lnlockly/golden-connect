/**
 * Seed the 8 tariff plans. Idempotent: upserts by `code`, so re-running
 * will refresh pricing but never duplicate.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx tsx scripts/seed-tariffs.ts
 *
 * Pricing (entry_usd / daily_cap_usd / monthly_fee_usd):
 *   Free   0    / 0   / 0
 *   Start  30   / 10  / 30
 *   Basic  60   / 20  / 60
 *   Core   100  / 30  / 100
 *   Pro    200  / 50  / 200
 *   Elite  300  / 60  / 300
 *   VIP    600  / 70  / 600
 *   Royal  1000 / 100 / 1000
 *
 * monthly_fee equals entry per the current pricing policy. Amounts are
 * stored as micro-USD (USD × 1_000_000) to match cash_ledger.amount_micro.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql as sqlTag } from 'drizzle-orm';
import { tariffs } from '../src/db/schema.js';

const USD = 1_000_000n;

const PLANS: Array<{
  code: string;
  name: string;
  entryUsd: number;
  dailyCapUsd: number;
  sortOrder: number;
}> = [
  { code: 'free', name: 'Free', entryUsd: 0, dailyCapUsd: 3, sortOrder: 0 },
  { code: 'start', name: 'Start', entryUsd: 30, dailyCapUsd: 10, sortOrder: 1 },
  { code: 'basic', name: 'Basic', entryUsd: 60, dailyCapUsd: 20, sortOrder: 2 },
  { code: 'core', name: 'Core', entryUsd: 100, dailyCapUsd: 30, sortOrder: 3 },
  { code: 'pro', name: 'Pro', entryUsd: 200, dailyCapUsd: 50, sortOrder: 4 },
  { code: 'elite', name: 'Elite', entryUsd: 300, dailyCapUsd: 60, sortOrder: 5 },
  { code: 'vip', name: 'VIP', entryUsd: 600, dailyCapUsd: 70, sortOrder: 6 },
  { code: 'royal', name: 'Royal', entryUsd: 1000, dailyCapUsd: 100, sortOrder: 7 },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL required');
    process.exit(1);
  }
  const client = postgres(url, { prepare: false });
  const db = drizzle(client);

  let inserted = 0;
  let updated = 0;
  for (const p of PLANS) {
    const entryMicro = BigInt(p.entryUsd) * USD;
    const dailyCapMicro = BigInt(p.dailyCapUsd) * USD;
    const monthlyFeeMicro = entryMicro;
    const result = await db
      .insert(tariffs)
      .values({
        code: p.code,
        name: p.name,
        entryMicro,
        dailyCapMicro,
        monthlyFeeMicro,
        sortOrder: p.sortOrder,
      })
      .onConflictDoUpdate({
        target: tariffs.code,
        set: {
          name: p.name,
          entryMicro,
          dailyCapMicro,
          monthlyFeeMicro,
          sortOrder: p.sortOrder,
        },
      })
      .returning({ id: tariffs.id, code: tariffs.code, createdAt: tariffs.createdAt });

    const row = result[0];
    // Drizzle onConflictDoUpdate doesn't expose xmax; approximate by
    // checking whether created_at is close to NOW(). For audit-quality
    // stats use a raw query — this counter is only a progress log.
    const ageMs = Date.now() - new Date(row.createdAt).getTime();
    if (ageMs < 5_000) inserted++;
    else updated++;
  }

  const [{ count }] = await db.execute<{ count: number }>(
    sqlTag`SELECT COUNT(*)::int AS count FROM tariffs`,
  );
  console.log(`tariffs seed: inserted~${inserted}, updated~${updated}, total=${count}`);
  await client.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
