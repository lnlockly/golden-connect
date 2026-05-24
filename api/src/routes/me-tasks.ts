import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { completeTask, getTodayEarnings, type TaskKind } from '../services/task-pool.js';
import { payoutForTaskKind } from './_task-payouts.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/tasks', requireAuth);
app.use('/me/tasks/*', requireAuth);

const TASK_KINDS = ['ad_view', 'tg_sub', 'brief', 'story'] as const satisfies readonly TaskKind[];

const completeBodySchema = z
  .object({
    proof_url: z.string().url().optional(),
  })
  .partial();

/**
 * GET /me/tasks/today — UTC-day rollup of the caller's task and ad-view
 * earnings, plus the cap and remaining headroom on their tariff. Returns
 * `cap_micro: "0"` for users with no active tariff so the UI can prompt
 * an upgrade without a separate tariff lookup.
 */
app.get('/me/tasks/today', async (c) => {
  const session = c.get('user');
  const earnings = await getTodayEarnings(session.id);
  return c.json({
    ok: true,
    task_micro: String(earnings.taskMicro),
    ad_micro: String(earnings.adMicro),
    total_micro: String(earnings.totalMicro),
    cap_micro: String(earnings.capMicro),
    remaining_micro: String(earnings.remainingMicro),
  });
});

/**
 * POST /me/tasks/:kind/complete — user-facing task completion. Payout is
 * derived from `:kind` via payoutForTaskKind (server-side) so the caller
 * can't claim arbitrary amounts. `proof_url` is optional context; not
 * persisted by the underlying ledger writer today.
 */
app.post('/me/tasks/:kind/complete', async (c) => {
  const session = c.get('user');
  const kindParam = c.req.param('kind');
  if (!TASK_KINDS.includes(kindParam as TaskKind)) {
    return c.json({ ok: false, error: 'invalid_task_kind' }, 400);
  }
  const kind = kindParam as TaskKind;

  // Body is optional — empty POST is fine.
  let body: unknown = {};
  try {
    const raw = await c.req.text();
    if (raw.length > 0) body = JSON.parse(raw);
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = completeBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }

  const payoutMicro = payoutForTaskKind(kind);

  try {
    const result = await completeTask(session.id, kind, payoutMicro);
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
