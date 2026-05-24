import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import * as RemindersRepo from '../repos/reminders.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

function intParam(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Literal paths first
app.get('/internal/reminders/steps', async (c) => {
  const rows = await RemindersRepo.listAll();
  return c.json({ ok: true, rows });
});

const createStepSchema = z.object({
  order_idx: z.number().int().optional(),
  delay_hours: z.number(),
  text_ru: z.string().min(1),
  text_en: z.string().nullable().optional(),
  text_zh: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

app.post('/internal/reminders/steps', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = createStepSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', issues: parsed.error.issues }, 400);
  }
  const step = await RemindersRepo.create({
    order_idx: parsed.data.order_idx,
    delay_hours: parsed.data.delay_hours,
    text_ru: parsed.data.text_ru,
    text_en: parsed.data.text_en ?? null,
    text_zh: parsed.data.text_zh ?? null,
    enabled: parsed.data.enabled,
  });
  return c.json({ ok: true, id: step.id, step });
});

const patchStepSchema = z.object({
  order_idx: z.number().int().optional(),
  delay_hours: z.number().optional(),
  text_ru: z.string().optional(),
  text_en: z.string().nullable().optional(),
  text_zh: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
});

app.patch('/internal/reminders/steps/:id', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = patchStepSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  const changed = await RemindersRepo.patch(id, parsed.data);
  return c.json({ ok: true, changed });
});

app.delete('/internal/reminders/steps/:id', async (c) => {
  const id = intParam(c.req.param('id'));
  if (id === null) return c.json({ ok: false, error: 'bad_id' }, 400);
  await RemindersRepo.remove(id);
  return c.json({ ok: true });
});

app.get('/internal/reminders/pending', async (c) => {
  const limit = Math.max(1, Math.min(500, Number(c.req.query('limit') ?? 50) || 50));
  const candidates = await RemindersRepo.listDue(limit);
  return c.json({ ok: true, candidates });
});

const sendsSchema = z.object({
  user_id: z.number().int(),
  step_id: z.number().int(),
});

app.post('/internal/reminders/sends', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = sendsSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await RemindersRepo.recordSent(parsed.data.user_id, parsed.data.step_id);
  return c.json({ ok: true });
});

export default app;
