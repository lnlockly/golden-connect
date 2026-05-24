import { Hono } from 'hono';
import { z } from 'zod';
import { requireInternalSecret } from '../middleware/internal.js';
import * as AiTurnsRepo from '../repos/aiturns.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

app.get('/internal/aiturns/recent', async (c) => {
  const tgId = Number(c.req.query('tg_id'));
  const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') ?? 20) || 20));
  if (!Number.isFinite(tgId)) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  const rows = await AiTurnsRepo.recent(tgId, limit);
  return c.json({ ok: true, rows });
});

const appendSchema = z.object({
  tg_id: z.number().int(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

app.post('/internal/aiturns', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = appendSchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body' }, 400);
  await AiTurnsRepo.append(parsed.data.tg_id, parsed.data.role, parsed.data.content);
  return c.json({ ok: true });
});

app.delete('/internal/aiturns', async (c) => {
  const tgId = Number(c.req.query('tg_id'));
  if (!Number.isFinite(tgId)) return c.json({ ok: false, error: 'bad_tg_id' }, 400);
  const deleted = await AiTurnsRepo.reset(tgId);
  return c.json({ ok: true, deleted });
});

export default app;
