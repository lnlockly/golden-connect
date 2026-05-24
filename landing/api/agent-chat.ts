/**
 * Agent chat — `/api/agent-chat`.
 *
 * Local "dev runtime" for a queued agent. We don't actually spin up a
 * real ElizaOS container on the laptop — instead we read the character
 * spec from the deploy queue, build a faithful system prompt out of
 * it (name, bio, lore, topics, adjectives, style), and stream Claude
 * as that character. The wire format matches /api/chat so the existing
 * streaming reader in ChatInline can be reused verbatim.
 *
 * Request shape: POST { slug: string; messages: [{role, content}] }
 * Response: line-framed stream of `text:<uri-encoded>` frames.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { getClaudeOAuthToken, CLAUDE_CODE_SYSTEM_PREFIX } from './_claude-oauth';
import { QUEUE_DIR, type QueueEntry } from './agent-deploy';

interface InMsg { role: 'user' | 'assistant'; content: string }
interface Body { slug: string; messages: InMsg[] }

const SLUG_RE = /^[a-z][a-z0-9-]{0,31}$/;

function sseLine(kind: 'text', payload: string): string {
  return `${kind}:${encodeURIComponent(payload)}\n`;
}

/** Compose a faithful ElizaOS-style character system prompt. */
function buildCharacterSystem(entry: QueueEntry): string {
  const c = entry.character;
  const parts: string[] = [];
  parts.push(`You are ${c.name}, an AI agent built on Golden Connect's ElizaOS runtime.`);
  if (Array.isArray(c.bio) && c.bio.length) {
    parts.push(`\n## Bio\n${c.bio.map((s) => `- ${s}`).join('\n')}`);
  }
  if (Array.isArray(c.lore) && c.lore.length) {
    parts.push(`\n## Lore\n${c.lore.map((s) => `- ${s}`).join('\n')}`);
  }
  if (Array.isArray(c.topics) && c.topics.length) {
    parts.push(`\n## Topics you talk about\n${c.topics.join(', ')}`);
  }
  if (Array.isArray(c.adjectives) && c.adjectives.length) {
    parts.push(`\n## Vibe\n${c.adjectives.join(', ')}`);
  }
  const styleAll = c.style?.all;
  if (Array.isArray(styleAll) && styleAll.length) {
    parts.push(`\n## Style\n${styleAll.map((s) => `- ${s}`).join('\n')}`);
  }
  if (Array.isArray(entry.plugins) && entry.plugins.length) {
    const short = entry.plugins
      .map((p) => p.replace(/^@elizaos\/plugin-/, ''))
      .join(', ');
    parts.push(`\n## Plugins available\n${short}`);
  }
  parts.push(`\n## Rules
- Stay in character. Mirror the visitor's language (EN / RU / ZH).
- Keep messages short — 1-3 sentences per turn unless the user asks for depth.
- Never claim to be Claude or mention Anthropic. You are ${c.name}.
- You're running in a local dev sandbox — external plugin side-effects
  (Telegram sends, web crawls, on-chain txs) are stubbed out. If asked
  to perform one, acknowledge and describe what you *would* do.`);
  return parts.join('\n');
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  let body: Body;
  try { body = (await req.json()) as Body; } catch { return new Response('bad json', { status: 400 }); }

  const slug = (body.slug ?? '').trim();
  if (!slug || !SLUG_RE.test(slug)) return new Response('bad slug', { status: 400 });
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return new Response('no messages', { status: 400 });
  }

  let entry: QueueEntry;
  try {
    const raw = await readFile(resolve(QUEUE_DIR, `${slug}.json`), 'utf8');
    entry = JSON.parse(raw) as QueueEntry;
  } catch {
    return new Response('agent not found', { status: 404 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = apiKey ? null : await getClaudeOAuthToken().catch(() => null);
  if (!apiKey && !oauthToken) {
    return new Response('no Claude credentials', { status: 500 });
  }

  const characterSystem = buildCharacterSystem(entry);
  const system = oauthToken
    ? [
        { type: 'text' as const, text: CLAUDE_CODE_SYSTEM_PREFIX },
        { type: 'text' as const, text: characterSystem },
      ]
    : characterSystem;

  const messages = body.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  const client = apiKey
    ? new Anthropic({ apiKey })
    : new Anthropic({
        authToken: oauthToken!,
        defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
      });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        const resp = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system,
          messages,
        });
        for await (const event of resp) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(enc.encode(sseLine('text', event.delta.text)));
          }
        }
      } catch (err) {
        const msg = (err as Error).message || 'stream error';
        controller.enqueue(enc.encode(sseLine('text', `\n[error: ${msg}]`)));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}
