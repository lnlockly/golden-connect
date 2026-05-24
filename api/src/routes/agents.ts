import { Hono } from 'hono';

// Phase F — stubs.
const app = new Hono();

app.get('/agents', (c) =>
  c.json({ ok: false, error: 'not_implemented', phase: 'F' }, 501),
);

app.get('/agents/:slug', (c) =>
  c.json({ ok: false, error: 'not_implemented', phase: 'F' }, 501),
);

app.post('/agents', (c) =>
  c.json({ ok: false, error: 'not_implemented', phase: 'F' }, 501),
);

export default app;
