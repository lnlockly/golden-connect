import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/balance', requireAuth);
app.use('/ledger', requireAuth);
app.use('/ledger/*', requireAuth);

/** GET /balance — sum of user's flow_ledger in micro-units. */
app.get('/balance', async (c) => {
  const user = c.var.user;
  const rows = await db.execute(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::text AS balance_micro
    FROM flow_ledger WHERE user_id = ${user.id}
  `);
  const balanceMicro = (rows[0] as any)?.balance_micro ?? '0';
  return c.json({
    balance_micro: balanceMicro,
    formatted: (Number(balanceMicro) / 1e6).toFixed(2),
  });
});

/** GET /ledger?cursor=0&limit=50 — paginated ledger feed, all kinds. */
app.get('/ledger', async (c) => {
  const user = c.var.user;
  const cursor = Math.max(0, Number(c.req.query('cursor') ?? 0) || 0);
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 50) || 50));

  const rows = await db.execute(sql`
    SELECT id, kind, amount_micro::text, level, memo, related_lead_id, related_user_id, created_at
    FROM flow_ledger
    WHERE user_id = ${user.id}
    ORDER BY id DESC
    OFFSET ${cursor} LIMIT ${limit}
  `);

  return c.json({
    rows: rows.map((r: any) => ({
      id: Number(r.id),
      kind: r.kind,
      amount_micro: r.amount_micro,
      level: r.level !== null ? Number(r.level) : null,
      memo: r.memo,
      related_lead_id: r.related_lead_id !== null ? Number(r.related_lead_id) : null,
      related_user_id: r.related_user_id !== null ? Number(r.related_user_id) : null,
      created_at: r.created_at,
    })),
    next_cursor: rows.length === limit ? cursor + rows.length : null,
  });
});

export default app;
