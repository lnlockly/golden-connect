import { Hono } from 'hono';
import { asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tariffs } from '../db/schema.js';

const app = new Hono();

/**
 * GET /tariffs — public list of all tariff plans, ordered by sortOrder.
 * Used by the landing page pricing grid and the upgrade modal in the
 * dashboard. No auth required: prices are public information.
 *
 * BigInt micros are emitted as strings to survive JSON round-trips
 * without precision loss.
 */
app.get('/tariffs', async (c) => {
  const rows = await db
    .select({
      id: tariffs.id,
      code: tariffs.code,
      name: tariffs.name,
      entryMicro: tariffs.entryMicro,
      dailyCapMicro: tariffs.dailyCapMicro,
      monthlyFeeMicro: tariffs.monthlyFeeMicro,
      sortOrder: tariffs.sortOrder,
    })
    .from(tariffs)
    .orderBy(asc(tariffs.sortOrder), asc(tariffs.id));

  return c.json({
    ok: true,
    tariffs: rows.map((r) => ({
      id: Number(r.id),
      code: r.code,
      name: r.name,
      entry_micro: String(r.entryMicro),
      daily_cap_micro: String(r.dailyCapMicro),
      monthly_fee_micro: String(r.monthlyFeeMicro),
      sort_order: Number(r.sortOrder),
    })),
  });
});

export default app;
