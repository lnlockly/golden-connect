import { Hono } from 'hono';
import { sql } from '../db/client.js';

const app = new Hono();

const VERSION = process.env.npm_package_version ?? '0.1.0';

app.get('/health', async (c) => {
  let dbLatencyMs: number | null = null;
  let dbOk = false;
  try {
    const start = Date.now();
    await sql`select 1`;
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return c.json({ ok: true, version: VERSION, db_ok: dbOk, db_latency_ms: dbLatencyMs });
});

export default app;
