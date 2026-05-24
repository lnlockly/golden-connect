import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import * as BroadcastsRepo from '../repos/broadcasts.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

function intParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const createSchema = z.object({
  admin_tg_id: z.number().int(),
  text: z.string().min(1),
});

app.post('/internal/broadcasts', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const id = await BroadcastsRepo.create(parsed.data.admin_tg_id, parsed.data.text);
  return c.json({ ok: true, id });
});

const patchSchema = z.object({
  sent_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
});

app.patch('/internal/broadcasts/:id', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await BroadcastsRepo.updateProgress(id, parsed.data.sent_count, parsed.data.failed_count);
  return c.json({ ok: true });
});

export default app;
