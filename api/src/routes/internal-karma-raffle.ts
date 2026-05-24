/**
 * Admin-triggered karma raffle endpoints.
 *   POST /internal/karma-raffle/run/:id   — execute draw for raffle id
 *   POST /internal/karma-raffle/skip/:id  — skip current week (carry karma)
 *   GET  /internal/karma-raffle/pending   — list pending_admin raffles (for bot UI)
 *
 * Auth: x-golden-connect-secret header (cabinet → api).
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { executeRaffleDraw, skipRaffle } from '../jobs/karma-raffle.job.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'internal-karma-raffle' });
const app = new Hono();

app.use('/internal/karma-raffle/*', requireInternalSecret);

app.post('/internal/karma-raffle/run/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, error: 'bad_id' }, 400);
  try {
    const result = await executeRaffleDraw(id);
    if (!result.ok) return c.json({ ok: false, reason: result.reason }, 409);
    return c.json(result);
  } catch (e: any) {
    log.error({ err: e?.message, id }, 'run failed');
    return c.json({ ok: false, error: e?.message || 'run_failed' }, 500);
  }
});

app.post('/internal/karma-raffle/skip/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, error: 'bad_id' }, 400);
  try {
    const result = await skipRaffle(id);
    if (!result.ok) return c.json({ ok: false, reason: result.reason }, 409);
    return c.json(result);
  } catch (e: any) {
    log.error({ err: e?.message, id }, 'skip failed');
    return c.json({ ok: false, error: e?.message || 'skip_failed' }, 500);
  }
});

app.get('/internal/karma-raffle/pending', async (c) => {
  const rows = (await db.execute(sql`
    SELECT id, week_start, week_end, prize_pool_micro/1000000 AS prize_pool_usd, status
    FROM karma_raffles WHERE status='pending_admin' ORDER BY week_start DESC LIMIT 10
  `)) as unknown as Array<any>;
  return c.json({ ok: true, raffles: rows });
});

export default app;
