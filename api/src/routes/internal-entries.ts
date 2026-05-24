import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import { processEntry } from '../services/entry-processor.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

const bodySchema = z.object({
  user_id: z.number().int().positive(),
  tariff_id: z.number().int().positive(),
  payment_ref_id: z.string().min(1).max(128).nullable().optional(),
});

/**
 * POST /internal/entries — kicks off the full entry-processor pipeline for
 * a paid tariff activation. Called by the bot/payment webhook once a user's
 * deposit is confirmed. Runs entirely inside one DB transaction; either
 * everything is written (matrix shares, refs, task pool fund, admin fee)
 * or nothing is.
 *
 * Body: { user_id, tariff_id, payment_ref_id? }.
 * Returns the processor result with all bigints stringified.
 */
app.post('/internal/entries', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  try {
    const result = await processEntry({
      userId: parsed.data.user_id,
      tariffId: parsed.data.tariff_id,
      paymentRefId: parsed.data.payment_ref_id ?? null,
    });
    return c.json({
      ok: result.ok,
      entry_micro: String(result.entryMicro),
      matrix_position: Number(result.matrixPosition),
      referrals_paid_levels: Number(result.referralsPaidLevels),
      admin_fee_micro: String(result.adminFeeMicro),
      total_distributed_micro: String(result.totalDistributedMicro),
      running_sum_micro: String(result.runningSumMicro),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return c.json({ ok: false, error: 'process_entry_failed', detail: msg }, 500);
  }
});

export default app;
