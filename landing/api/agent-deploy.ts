/**
 * Agent deploy intake — `/api/agent-deploy`.
 *
 * Accepts a character.json + plugin list + secrets from the landing,
 * validates it, persists the request to an on-disk queue, "seals"
 * the secrets (XOR or base64 for MVP — see infra/README.md), and
 * fans the alert out to Telegram via the same path `api/order.ts`
 * uses.
 *
 * The deploy itself is handled out-of-band by `scripts/deploy-agent.sh`,
 * which picks up the queued JSON file and renders
 * `infra/k8s/agent-namespace.template.yaml` into a real k3s namespace.
 *
 * Request body (all fields required unless marked optional):
 *
 *   {
 *     track:     'agent_deploy',
 *     character: ElizaCharacter,            // name, bio[], system?, ...
 *     plugins:   string[],                  // @elizaos/plugin-*, 3..8 items
 *     secrets:   Record<string,string>,     // SCREAMING_SNAKE_CASE keys
 *     contact:   string,                    // @handle or email
 *     lang?:     'en' | 'ru' | 'zh'
 *   }
 *
 * Response (200):
 *
 *   { ok: true, slug, queued_at, status_url }
 */

import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/* ── shapes ───────────────────────────────────────────────── */

interface ElizaCharacter {
  name: string;
  bio: string[];
  // The runtime accepts a lot more; we pass them through untouched.
  [k: string]: unknown;
}

interface DeployBody {
  track?: string;
  character?: Partial<ElizaCharacter>;
  plugins?: unknown;
  secrets?: Record<string, unknown>;
  contact?: string;
  lang?: string;
}

interface QueueEntry {
  slug: string;
  state: 'queued' | 'deploying' | 'live' | 'failed';
  created_at: string;
  character: ElizaCharacter;
  plugins: string[];
  secrets: Record<string, string>; // REDACTED on disk
  contact: string;
  lang: 'en' | 'ru' | 'zh';
  error?: string;
  deployed_at?: string;
  ingress_url?: string;
}

/* ── paths ────────────────────────────────────────────────── */

const QUEUE_DIR = resolve(process.cwd(), 'infra/deploy-queue');

/* ── validation helpers ───────────────────────────────────── */

const NAME_RE    = /^[A-Za-zА-Яа-я0-9_-]+$/;
const PLUGIN_PRE = '@elizaos/plugin-';
const SECRET_KEY = /^[A-Z_][A-Z0-9_]*$/;

function isStrArray(v: unknown, min: number, max: number): v is string[] {
  if (!Array.isArray(v) || v.length < min || v.length > max) return false;
  return v.every((x) => typeof x === 'string' && x.trim().length > 0);
}

function validate(body: DeployBody): { ok: true; parsed: Omit<QueueEntry, 'slug' | 'state' | 'created_at'> } | { ok: false; error: string } {
  if (body.track !== 'agent_deploy') return { ok: false, error: 'bad track' };

  const ch = body.character;
  if (!ch || typeof ch !== 'object') return { ok: false, error: 'character missing' };

  const name = typeof ch.name === 'string' ? ch.name.trim() : '';
  if (name.length < 3 || name.length > 40) return { ok: false, error: 'character.name length 3..40' };
  if (!NAME_RE.test(name)) return { ok: false, error: 'character.name charset' };

  if (!isStrArray(ch.bio, 1, 5)) return { ok: false, error: 'character.bio must be 1..5 strings' };

  if (!isStrArray(body.plugins, 3, 8)) return { ok: false, error: 'plugins must be 3..8 strings' };
  const plugins = body.plugins as string[];
  for (const p of plugins) {
    if (!p.startsWith(PLUGIN_PRE)) return { ok: false, error: `plugin "${p}" must start with ${PLUGIN_PRE}` };
  }

  const secretsIn = body.secrets;
  if (!secretsIn || typeof secretsIn !== 'object' || Array.isArray(secretsIn)) {
    return { ok: false, error: 'secrets must be an object' };
  }
  const secretEntries = Object.entries(secretsIn);
  if (secretEntries.length > 20) return { ok: false, error: 'too many secrets (max 20)' };
  const secrets: Record<string, string> = {};
  for (const [k, v] of secretEntries) {
    if (!SECRET_KEY.test(k)) return { ok: false, error: `secret key "${k}" must match /^[A-Z_][A-Z0-9_]*$/` };
    if (typeof v !== 'string') return { ok: false, error: `secret "${k}" must be a string` };
    if (v.length > 512) return { ok: false, error: `secret "${k}" exceeds 512 chars` };
    secrets[k] = v;
  }

  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  if (contact.length < 3) return { ok: false, error: 'contact missing' };

  const lang = (body.lang === 'ru' || body.lang === 'zh') ? body.lang : 'en';

  // Pass-through character — we only enforce name/bio; everything
  // else (system, topics, adjectives, style, knowledge, ...) is the
  // frontend's contract with the runtime.
  const character: ElizaCharacter = { ...(ch as ElizaCharacter), name, bio: ch.bio as string[] };

  return {
    ok: true,
    parsed: { character, plugins, secrets, contact, lang },
  };
}

/* ── slug derivation ──────────────────────────────────────── */

export function deriveSlug(raw: string): string {
  const lower = raw.toLowerCase();
  // Transliterate? No — just replace anything that isn't ascii
  // [a-z0-9] with '-'. Non-latin characters become dashes which
  // keeps things DNS-safe without pulling in a translit lib.
  const dashed = lower.replace(/[^a-z0-9]+/g, '-');
  const collapsed = dashed.replace(/-+/g, '-').replace(/^-|-$/g, '');
  const trimmed = collapsed.slice(0, 32).replace(/-+$/, '');
  // K8s requires a non-empty DNS-1123 label starting with a letter.
  if (!trimmed || !/^[a-z]/.test(trimmed)) {
    return `agent-${Math.random().toString(36).slice(2, 6)}`;
  }
  return trimmed;
}

async function uniqueSlug(base: string): Promise<string> {
  await mkdir(QUEUE_DIR, { recursive: true });
  const taken = new Set((await readdir(QUEUE_DIR)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)));
  if (!taken.has(base)) return base;
  for (let i = 0; i < 8; i++) {
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const candidate = `${base.slice(0, 27)}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Give up after 8 tries — astronomically unlikely.
  return `${base.slice(0, 27)}-${Date.now().toString().slice(-4)}`;
}

/* ── secret sealing (MVP) ─────────────────────────────────── */

export function sealSecrets(secrets: Record<string, string>): { blob: string; scheme: 'xor-b64' | 'base64' } {
  const plaintext = JSON.stringify(secrets);
  const key = process.env.AGENT_SECRETS_KEY;
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn('[agent-deploy] AGENT_SECRETS_KEY not set — falling back to base64 (NOT ENCRYPTED).');
    return { blob: Buffer.from(plaintext, 'utf8').toString('base64'), scheme: 'base64' };
  }
  const keyBytes = Buffer.from(key, 'utf8');
  const text = Buffer.from(plaintext, 'utf8');
  const out = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text[i]! ^ keyBytes[i % keyBytes.length]!;
  }
  return { blob: out.toString('base64'), scheme: 'xor-b64' };
}

/* ── telegram fanout ──────────────────────────────────────── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatTelegramMessage(entry: QueueEntry): string {
  const secretKeys = Object.keys(entry.secrets);
  const rows: string[] = [
    '🤖 <b>Новый деплой агента (ElizaOS)</b>',
    '',
    `<b>Slug:</b> <code>${esc(entry.slug)}</code>`,
    `<b>Имя:</b> ${esc(entry.character.name)}`,
    `<b>Плагины:</b> ${esc(entry.plugins.join(', '))}`,
    `<b>Секреты (ключи):</b> ${secretKeys.length ? esc(secretKeys.join(', ')) : '—'}`,
    `<b>Контакт:</b> ${esc(entry.contact)}`,
    '',
    `<i>lang=${esc(entry.lang)} · ${entry.created_at}</i>`,
  ];
  return rows.join('\n');
}

async function sendTelegram(entry: QueueEntry): Promise<string | null> {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) return 'telegram: token or chat_id missing';

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: formatTelegramMessage(entry),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  const topicEnv = process.env.TG_TOPIC_DEPLOY;
  const topicId = topicEnv ? Number(topicEnv) : NaN;
  if (Number.isFinite(topicId)) body.message_thread_id = topicId;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return `telegram ${resp.status}: ${text.slice(0, 200)}`;
    }
    return null;
  } catch (err) {
    return `telegram: ${(err as Error).message || 'fetch failed'}`;
  }
}

/* ── handler ──────────────────────────────────────────────── */

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: DeployBody;
  try {
    body = (await req.json()) as DeployBody;
  } catch {
    return jsonErr(400, 'bad json');
  }

  const v = validate(body);
  if (!v.ok) return jsonErr(400, v.error);

  const { character, plugins, secrets, contact, lang } = v.parsed;

  const base = deriveSlug(character.name);
  const slug = await uniqueSlug(base);
  const createdAt = new Date().toISOString();

  // Queue record with secrets redacted to key-only.
  const redactedSecrets: Record<string, string> = {};
  for (const k of Object.keys(secrets)) redactedSecrets[k] = '***';

  const entry: QueueEntry = {
    slug,
    state: 'queued',
    created_at: createdAt,
    character,
    plugins,
    secrets: redactedSecrets,
    contact,
    lang,
  };

  // Write both files atomically-ish — we don't support concurrent
  // writers for the same slug (uniqueSlug covers that), so a plain
  // writeFile is fine.
  await mkdir(QUEUE_DIR, { recursive: true });
  const queuePath = resolve(QUEUE_DIR, `${slug}.json`);
  const sealedPath = resolve(QUEUE_DIR, `${slug}.secrets.enc`);
  await writeFile(queuePath, JSON.stringify(entry, null, 2), 'utf8');

  const sealed = sealSecrets(secrets);
  await writeFile(
    sealedPath,
    JSON.stringify({ scheme: sealed.scheme, blob: sealed.blob, slug }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  );

  // Best-effort Telegram fanout — failure does not block queueing.
  const tgErr = await sendTelegram(entry);
  if (tgErr) {
    // eslint-disable-next-line no-console
    console.warn('[agent-deploy] telegram fanout failed:', tgErr);
  }

  return new Response(JSON.stringify({
    ok: true,
    slug,
    queued_at: createdAt,
    status_url: `/api/agent-status?slug=${encodeURIComponent(slug)}`,
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Re-export for the status endpoint and any test harness.
export { QUEUE_DIR };
export type { QueueEntry };
// Silence unused-import warnings for paths that read the queue.
void existsSync;
