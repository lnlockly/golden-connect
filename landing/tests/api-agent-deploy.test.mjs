// @ts-check
// Tests for api/agent-deploy.ts (owned by the backend sub-agent).
//
// The handler contract (per the hosted-agent MVP spec):
//   POST /api/agent-deploy
//   body: { track: 'agent_deploy', character: {...}, plugins: string[],
//           secrets: Record<string,string>, contact: string, lang?: 'en'|'ru'|'zh' }
//   200 -> { ok: true, slug, queued_at, status_url }
//   400 -> { ok: false, error: string }
//
// Tests run fully offline: we do NOT write real secrets, and Telegram
// fanout is a best-effort fire-and-forget inside the handler (no env
// vars -> skipped inside the handler itself). Each test cleans up its
// queue file afterwards so repeat runs stay deterministic.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, rmSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadSubject, REPO_ROOT } from './helpers/load.mjs';

const { mod } = await loadSubject([
  'api/agent-deploy.ts',
  'api/agent-deploy.js',
  'api/agent-deploy.mjs',
  'api/agent-deploy/index.ts',
  'dist/api/agent-deploy.js',
]);

function pickHandler(m) {
  if (!m) return null;
  const candidates = [m.default, m.POST, m.handler, m.deploy, m.onRequestPost];
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

const QUEUE_DIR = resolve(REPO_ROOT, 'infra', 'deploy-queue');

/** A well-formed payload that should pass validation. */
function makeValidPayload() {
  return {
    track: 'agent_deploy',
    character: {
      name: 'Astro-Sage-Test',
      bio: ['I am an astrology-flavoured crypto oracle.'],
      lore: ['Born during a Mercury retrograde.'],
      topics: ['astrology', 'crypto'],
      adjectives: ['playful'],
      style: { all: ['terse'], chat: [], post: [] },
      plugins: ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
      modelProvider: 'anthropic',
      settings: { model: 'claude-sonnet-4-6', secrets: {} },
    },
    plugins: ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
    secrets: {
      ANTHROPIC_API_KEY: 'sk-test',
      TELEGRAM_BOT_TOKEN: '123:abc',
    },
    contact: 'founder@example.com',
    lang: 'en',
  };
}

function makeRequest(payload) {
  return new Request('http://localhost/api/agent-deploy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

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

/** Delete any queue files whose slug starts with `prefix`. */
function cleanupQueue(prefix) {
  if (!existsSync(QUEUE_DIR)) return;
  for (const f of readdirSync(QUEUE_DIR)) {
    if (f.startsWith(prefix)) {
      try { rmSync(resolve(QUEUE_DIR, f)); } catch { /* ignore */ }
    }
  }
}

if (!handler) {
  test.skip('api/agent-deploy handler not yet available', () => {});
} else {
  test('valid payload → 200 with {ok, slug, queued_at, status_url}', async (t) => {
    mkdirSync(QUEUE_DIR, { recursive: true });
    t.after(() => cleanupQueue('astro-sage-test'));

    const res = await handler(makeRequest(makeValidPayload()));
    assert.equal(statusOf(res), 200, 'expected 200');
    const body = await readJson(res);
    assert.ok(body, 'body parses as JSON');
    assert.equal(body.ok, true);
    assert.equal(typeof body.slug, 'string');
    assert.ok(body.slug.length > 0, 'slug is non-empty');
    assert.ok('queued_at' in body, 'queued_at present');
    assert.equal(typeof body.status_url, 'string');
    // The status_url encodes the slug (may be URL-encoded).
    assert.ok(
      body.status_url.includes(body.slug) || body.status_url.includes(encodeURIComponent(body.slug)),
      `status_url ${body.status_url} does not reference slug ${body.slug}`,
    );
  });

  test('missing character.name → 400 with ok:false', async () => {
    const bad = makeValidPayload();
    delete bad.character.name;
    const res = await handler(makeRequest(bad));
    assert.equal(statusOf(res), 400);
    const body = await readJson(res);
    assert.ok(body);
    assert.equal(body.ok, false);
  });

  test('malformed plugin package name → 400', async () => {
    const bad = makeValidPayload();
    // Keep the array at 3 items so we exercise the *name shape* check, not the min-size check.
    bad.plugins = ['not-a-plugin', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'];
    const res = await handler(makeRequest(bad));
    assert.equal(statusOf(res), 400);
    const body = await readJson(res);
    assert.ok(body);
    assert.equal(body.ok, false);
  });

  test('secret key that does not match /^[A-Z_][A-Z0-9_]*$/ → 400', async () => {
    const bad = makeValidPayload();
    bad.secrets = { 'lowercase-key': 'value' };
    const res = await handler(makeRequest(bad));
    assert.equal(statusOf(res), 400);
    const body = await readJson(res);
    assert.ok(body);
    assert.equal(body.ok, false);
  });

  test('very long contact is accepted, not rejected', async (t) => {
    mkdirSync(QUEUE_DIR, { recursive: true });
    t.after(() => cleanupQueue('astro-sage-test'));

    const payload = makeValidPayload();
    payload.contact = 'x'.repeat(5000) + '@example.com';
    const res = await handler(makeRequest(payload));
    const status = statusOf(res);
    assert.ok(status && status >= 200 && status < 300, `expected 2xx, got ${status}`);
    const body = await readJson(res);
    assert.ok(body);
    assert.equal(body.ok, true);
  });
}
