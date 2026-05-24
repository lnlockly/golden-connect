import { Hono } from 'hono';

// Phase C — stubs. Webhook-secret guard will land with real impl.
const app = new Hono();

app.post('/leads', (c) =>
  c.json({ ok: false, error: 'not_implemented', phase: 'C' }, 501),
);

app.post('/leads/:id/resolve', (c) =>
  c.json({ ok: false, error: 'not_implemented', phase: 'C' }, 501),
);

export default app;
