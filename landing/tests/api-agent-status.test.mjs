// @ts-check
// Tests for api/agent-status.ts (owned by the backend sub-agent).
//
// Contract:
//   GET /api/agent-status?slug=<slug>
//   Reads infra/deploy-queue/<slug>.json and returns its state.
//   Missing slug (or no file) → 404.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSubject, REPO_ROOT } from './helpers/load.mjs';

const { mod } = await loadSubject([
  'api/agent-status.ts',
  'api/agent-status.js',
  'api/agent-status.mjs',
  'api/agent-status/index.ts',
  'dist/api/agent-status.js',
]);

function pickHandler(m) {
  if (!m) return null;
  const candidates = [m.default, m.GET, m.handler, m.status, m.onRequestGet];
  for (const c of candidates) {
    if (typeof c === 'function') return c;
  }
  if (m.default && typeof m.default.fetch === 'function') {
    return (req) => m.default.fetch(req);
  }
  if (m.app && typeof m.app.fetch === 'function') {
    return (req) => m.app.fetch(req);
  }
  return null;
}

const handler = pickHandler(mod);

async function readJson(res) {
  if (res && typeof res.json === 'function') {
    try { return await res.json(); } catch { return null; }
  }
  if (res && res.body !== undefined) return res.body;
  return null;
}

function statusOf(res) {
  if (res && typeof res.status === 'number') return res.status;
  return null;
}

const QUEUE_DIR = resolve(REPO_ROOT, 'infra', 'deploy-queue');
const TEST_SLUG = 'test-slug-xxx';
const QUEUE_FILE = resolve(QUEUE_DIR, `${TEST_SLUG}.json`);

if (!handler) {
  test.skip('api/agent-status handler not yet available', () => {});
} else {
  test('GET ?slug=<existing> → 200 and returns the queued state', async (t) => {
    // Seed a queue file just for this test.
    mkdirSync(QUEUE_DIR, { recursive: true });
    writeFileSync(
      QUEUE_FILE,
      JSON.stringify({
        slug: TEST_SLUG,
        state: 'queued',
        queued_at: new Date().toISOString(),
      }),
      'utf8',
    );

    t.after(() => {
      if (existsSync(QUEUE_FILE)) rmSync(QUEUE_FILE);
    });

    const req = new Request(`http://localhost/api/agent-status?slug=${TEST_SLUG}`);
    const res = await handler(req);
    assert.equal(statusOf(res), 200);
    const body = await readJson(res);
    assert.ok(body, 'body parses as JSON');
    assert.equal(body.state, 'queued');
  });

  test('missing slug → 404', async () => {
    const req = new Request('http://localhost/api/agent-status');
    const res = await handler(req);
    const s = statusOf(res);
    assert.ok(s === 404 || s === 400, `expected 404 (or 400) for missing slug, got ${s}`);
  });

  test('unknown slug → 404', async () => {
    const req = new Request('http://localhost/api/agent-status?slug=does-not-exist-zzz');
    const res = await handler(req);
    assert.equal(statusOf(res), 404);
  });
}
