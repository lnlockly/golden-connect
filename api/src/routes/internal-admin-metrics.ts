/**
 * Aggregate metrics consumed by the bot's `/admin` dashboard. Single
 * round-trip so the admin panel renders fast.
 *
 * Auth: shared `x-goldenConnect-secret`. Bot already verifies the caller is
 * in `ADMIN_TG_IDS` before calling this — no public surface here.
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';

const app = new Hono();

app.use('/internal/admin/metrics-summary', requireInternalSecret);

app.get('/internal/admin/metrics-summary', async (c) => {
  // One CTE-style query: each metric is its own SELECT, the bot reassembles
  // the JSON. Failures of any single sub-query degrade gracefully — we
  // catch + fall back to zero so a missing table can't 500 the dashboard.
  async function safeNum(q: () => Promise<unknown>): Promise<number> {
    try {
      const r = (await q()) as Array<{ count?: string | number }>;
      const v = r[0]?.count ?? 0;
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    } catch {
      return 0;
    }
  }

  const usersTotal = await safeNum(() =>
    db.execute(sql`SELECT COUNT(*)::int AS count FROM users`),
  );
  const usersJoined24h = await safeNum(() =>
    db.execute(
      sql`SELECT COUNT(*)::int AS count FROM users WHERE joined_at >= now() - INTERVAL '24 hours'`,
    ),
  );
  const paymentsWeekUsd = await safeNum(() =>
    db.execute(sql`
      SELECT COALESCE(SUM(amount_usd), 0)::numeric AS count
      FROM invoices
      WHERE status = 'paid' AND paid_at >= now() - INTERVAL '7 days'
    `),
  );
  const eventsActive = await safeNum(() =>
    db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM events
      WHERE status IN ('published','live')
        AND starts_at >= now() - INTERVAL '6 hours'
    `),
  );
  const pendingReferrals = await safeNum(() =>
    db.execute(sql`SELECT COUNT(*)::int AS count FROM pending_referrals`),
  );

  return c.json({
    ok: true,
    metrics: {
      users_total: usersTotal,
      users_joined_24h: usersJoined24h,
      payments_week_usd: paymentsWeekUsd,
      events_active: eventsActive,
      pending_referrals: pendingReferrals,
    },
  });
});

export default app;
