import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

import chatHandler from '../api/chat';
import orderHandler from '../api/order';
import agentDeployHandler from '../api/agent-deploy';
import agentStatusHandler from '../api/agent-status';
import agentChatHandler from '../api/agent-chat';
import ttsHandler from '../api/tts';

const app = new Hono();
const DIST = resolve(process.cwd(), 'dist');

/* ── API routes ────────────────────────────────────────── */
app.all('/api/chat',         (c) => chatHandler(c.req.raw));
app.all('/api/order',        (c) => orderHandler(c.req.raw));
app.all('/api/agent-deploy', (c) => agentDeployHandler(c.req.raw));
app.all('/api/agent-status', (c) => agentStatusHandler(c.req.raw));
app.all('/api/agent-chat',   (c) => agentChatHandler(c.req.raw));
app.all('/api/tts',          (c) => ttsHandler(c.req.raw));

/* ── Static + SPA fallback ────────────────────────────────
   We serve /dist with proper MIME types and fall through to
   /dist/index.html for anything that doesn't map to a file
   on disk (so /whitepaper works client-side).              */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.txt':  'text/plain; charset=utf-8',
  '.map':  'application/json; charset=utf-8',
};

function safeFile(rel: string): string | null {
  const clean = rel.replace(/\?.*$/, '').replace(/^\/+/, '');
  const abs = resolve(DIST, clean);
  if (!abs.startsWith(DIST)) return null;
  if (!existsSync(abs) || !statSync(abs).isFile()) return null;
  return abs;
}

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const filePath = safeFile(url.pathname) ?? safeFile('index.html');
  if (!filePath) return c.text('Not found', 404);

  const body = await readFile(filePath);
  const headers: Record<string, string> = {
    'content-type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
  };
  // Long-cache hashed assets, no-cache index.html
  if (filePath.endsWith('index.html')) {
    headers['cache-control'] = 'no-cache, no-store, must-revalidate';
  } else if (filePath.includes(`${join('dist', 'assets')}`)) {
    headers['cache-control'] = 'public, max-age=604800, immutable';
  } else {
    headers['cache-control'] = 'public, max-age=3600';
  }
  // @ts-expect-error — Buffer is acceptable for Response body in Node's Hono adapter
  return new Response(body, { headers });
});

const port = Number(process.env.PORT ?? 80);
serve({ fetch: app.fetch, port });
console.log(`[goldenConnect] listening on :${port}`);
