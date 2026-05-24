import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import { completeTask, type TaskKind } from '../services/task-pool.js';
import { payoutForTaskKind } from './_task-payouts.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

const TASK_KINDS = ['ad_view', 'tg_sub', 'brief', 'story'] as const satisfies readonly TaskKind[];

const bodySchema = z.object({
  user_id: z.number().int().positive(),
  task_kind: z.enum(TASK_KINDS),
  proof_url: z.string().url().optional(),
});

/**
 * POST /internal/tasks/complete — credit a task or ad-view payout to a user,
 * clamped to their tariff's daily cap. Payout is derived server-side from
 * `task_kind` (see _task-payouts.ts) so callers can't claim arbitrary
 * amounts. `proof_url` is accepted but currently advisory — not persisted
 * by the underlying ledger writer; future work will surface it on the
 * task_completions row.
 */
app.post('/internal/tasks/complete', async (c) => {
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

  const payoutMicro = payoutForTaskKind(parsed.data.task_kind);

  try {
    const result = await completeTask(
      parsed.data.user_id,
      parsed.data.task_kind,
      payoutMicro,
    );
    if (!result.ok) {
      return c.json({ ok: false, error: result.reason }, 409);
    }
    return c.json({
      ok: true,
      paid_micro: String(result.paidMicro),
      partial: result.reason === 'partial_cap',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return c.json({ ok: false, error: 'complete_task_failed', detail: msg }, 500);
  }
});

export default app;
