import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tariffs, userTariffs } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { getTodayEarnings } from '../services/task-pool.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/tariff', requireAuth);

/**
 * GET /me/tariff — caller's currently active tariff plan, or null when the
 * user has never paid an entry. Joins user_tariffs (latest active row) onto
 * tariffs to expose the human name and limits the dashboard renders.
 *
 * BigInt micros stringified so JSON survives the trip.
 */
app.get('/me/tariff', async (c) => {
  const session = c.get('user');

  const rows = await db
    .select({
      userTariffId: userTariffs.id,
      activeSince: userTariffs.activeSince,
      activeUntil: userTariffs.activeUntil,
      isActive: userTariffs.isActive,
      tariffId: tariffs.id,
      code: tariffs.code,
      name: tariffs.name,
      entryMicro: tariffs.entryMicro,
      dailyCapMicro: tariffs.dailyCapMicro,
      monthlyFeeMicro: tariffs.monthlyFeeMicro,
    })
    .from(userTariffs)
    .innerJoin(tariffs, eq(userTariffs.tariffId, tariffs.id))
    .where(and(eq(userTariffs.userId, session.id), eq(userTariffs.isActive, true)))
    .orderBy(desc(userTariffs.activeSince))
    .limit(1);

  const earnings = await getTodayEarnings(session.id);
  const today = {
    earned_micro: String(earnings.totalMicro),
    cap_micro: String(earnings.capMicro),
    remaining_micro: String(earnings.remainingMicro),
  };

  const row = rows[0];
  if (!row) return c.json({ ok: true, tariff: null, today });

  return c.json({
    ok: true,
    tariff: {
      user_tariff_id: Number(row.userTariffId),
      tariff_id: Number(row.tariffId),
      code: row.code,
      name: row.name,
      entry_micro: String(row.entryMicro),
      daily_cap_micro: String(row.dailyCapMicro),
      monthly_fee_micro: String(row.monthlyFeeMicro),
      active_since: row.activeSince,
      active_until: row.activeUntil,
      is_active: row.isActive,
    },
    today,
  });
});

export default app;
