/**
 * Agent status — `/api/agent-status?slug=<slug>`.
 *
 * Deliberately minimal: reads the on-disk queue file that
 * `api/agent-deploy.ts` writes and returns the current state.
 *
 * We don't watch files or subscribe to k8s events here — the
 * deploy script (scripts/deploy-agent.sh) is responsible for
 * rewriting the JSON as the lifecycle advances
 * (queued → deploying → live | failed). This endpoint is safe
 * to poll at ~1 Hz; the payload is a few hundred bytes.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { QUEUE_DIR, type QueueEntry } from './agent-deploy';

/** A slug is a DNS-1123 label — strict to avoid `../` probes. */
const SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const slug = (url.searchParams.get('slug') ?? '').trim();
  if (!slug || !SLUG_RE.test(slug)) return jsonErr(400, 'bad slug');

  const path = resolve(QUEUE_DIR, `${slug}.json`);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return jsonErr(404, 'not found');
  }

  let entry: QueueEntry;
  try {
    entry = JSON.parse(raw) as QueueEntry;
  } catch {
    return jsonErr(500, 'queue file corrupted');
  }

  return new Response(JSON.stringify({
    ok: true,
    slug: entry.slug,
    state: entry.state,
    created_at: entry.created_at,
    deployed_at: entry.deployed_at,
    ingress_url: entry.ingress_url,
    error: entry.error,
    character: entry.character,
    plugins: entry.plugins,
    contact: entry.contact,
    lang: entry.lang,
    // secrets are redacted in the queue file (values are `***`); we pass
    // the key list through so the detail page can show what plugins were
    // configured without leaking the actual tokens.
    secret_keys: entry.secrets ? Object.keys(entry.secrets) : [],
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      // The state can flip under us — never cache.
      'cache-control': 'no-store',
    },
  });
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
