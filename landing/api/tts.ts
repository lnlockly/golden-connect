/**
 * Text-to-speech proxy. POST `{ text, voice_id?, lang? }` → audio/mpeg.
 * ElevenLabs key stays server-side.
 *
 * Cache: SHA-256(CACHE_VERSION|model|voice|lang|text). Bump CACHE_VERSION
 * to invalidate the in-memory LRU AND every browser's ETag (ETag is
 * prefixed with the version). Only cache responses ≥ 2048 B with a valid
 * MP3 magic header — prevents a truncated upstream blob from poisoning
 * every future request (the "mumbling greeting" bug).
 *
 * Owner bust switch: `?nocache=1` or header `x-tts-nocache: 1` bypasses
 * the LRU read (still writes on success).
 *
 * Text is normalized (strip poison emoji/control chars, collapse ws) and
 * smart-clamped to 600 chars at the nearest sentence boundary.
 * Missing API key → 503 so UI can hide the speaker button.
 */
import { createHash } from 'node:crypto';

interface Body {
  text?: string;
  voice_id?: string;
  /** Locale hint — picks a voice if voice_id isn't supplied. */
  lang?: 'en' | 'ru' | 'zh';
}

/** Bump to invalidate the in-memory LRU AND every browser's ETag. */
const CACHE_VERSION = 'v4';

const FALLBACK_VOICE = process.env.ELEVENLABS_VOICE_ID || 'jqcCZkN6Knx8BJ5TBdYR';
const DEFAULT_VOICES: Record<'en' | 'ru' | 'zh', string> = {
  en: process.env.ELEVENLABS_VOICE_ID_EN || FALLBACK_VOICE,
  ru: process.env.ELEVENLABS_VOICE_ID_RU || FALLBACK_VOICE,
  zh: process.env.ELEVENLABS_VOICE_ID_ZH || FALLBACK_VOICE,
};

const MAX_TEXT_CHARS = 600;
const MIN_CACHEABLE_BYTES = 2048;
// eleven_multilingual_v2 = higher-quality cross-language voice (RU/EN/ZH all
// read smoothly). Flash was cheaper but mumbled/glitched on owner's tests.
// Override with ELEVENLABS_MODEL_ID env if you need to roll back to flash.
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

// Known TTS-poison glyphs. Stage markers, status dots, meta icons.
const POISON_EMOJI = /[\u{1F50A}\u{1F399}\u{1F7E2}\u{1F534}\u{1F7E1}\u{1F535}\u{1F7E3}\u{1F6E0}\u{1F449}\u{1F4CA}\u26A1\u2728\u2705\u{1F381}]/gu;
// Control chars except \n \t.
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

// Bounded LRU. ~50 × ~20 KB ≈ 1 MB ceiling per pod.
const CACHE_MAX = 50;
const cache = new Map<string, Uint8Array>();

function lruGet(key: string): Uint8Array | undefined {
  const v = cache.get(key);
  if (v === undefined) return undefined;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function lruSet(key: string, value: Uint8Array): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function cacheKey(text: string, voiceId: string, lang: string): string {
  return createHash('sha256')
    .update(`${CACHE_VERSION}|${MODEL_ID}|${voiceId}|${lang}|${text}`)
    .digest('hex');
}

/** Real MP3 starts with 'ID3' tag or MPEG frame sync (0xFFFB/0xFFF3/0xFFF2). */
function looksLikeMp3(buf: Uint8Array): boolean {
  if (buf.byteLength < 3) return false;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // "ID3"
  if (buf[0] === 0xff && (buf[1] === 0xfb || buf[1] === 0xf3 || buf[1] === 0xf2)) return true;
  return false;
}

function normalizeText(raw: string): string {
  return raw
    .replace(POISON_EMOJI, '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clamp to MAX_TEXT_CHARS, backtracking to a sentence boundary or space. */
function smartClamp(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  const window = text.slice(0, MAX_TEXT_CHARS);
  const tail = window.slice(-80);
  const boundary = Math.max(
    tail.lastIndexOf('.'),
    tail.lastIndexOf('!'),
    tail.lastIndexOf('?'),
    tail.lastIndexOf('\u2026'), // …
    tail.lastIndexOf('\n'),
  );
  if (boundary >= 0) {
    return window.slice(0, MAX_TEXT_CHARS - 80 + boundary + 1).trim();
  }
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > 0 ? window.slice(0, lastSpace) : window).trim();
}

const COMMON_HEADERS = {
  'content-type': 'audio/mpeg',
  'cache-control': 'public, max-age=86400, immutable',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonErr(405, 'method not allowed');

  // KILL SWITCH — owner ran out of ElevenLabs credits. Returning
  // 503 trips the client's TTS_DISABLED_PROCESS_LEVEL flag, which
  // hides speaker buttons, disables voice-mode auto-play, and
  // silently skips the greeting. The guided tour is unaffected —
  // it plays pre-baked /tour-audio/*.mp3 static files.
  // Flip TTS_KILL=0 on the pod env to re-enable.
  if (process.env.TTS_KILL !== '0') return jsonErr(503, 'tts disabled');

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return jsonErr(503, 'tts not configured');

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonErr(400, 'bad json');
  }

  const normalized = normalizeText(body.text ?? '');
  if (normalized.length < 1) return jsonErr(400, 'text empty');
  const clamped = smartClamp(normalized);

  const lang: 'en' | 'ru' | 'zh' =
    body.lang === 'ru' || body.lang === 'zh' ? body.lang : 'en';
  const voiceId =
    body.voice_id && /^[A-Za-z0-9]+$/.test(body.voice_id)
      ? body.voice_id
      : DEFAULT_VOICES[lang];

  const url = new URL(req.url, 'http://x');
  const bypass =
    url.searchParams.get('nocache') === '1' ||
    req.headers.get('x-tts-nocache') === '1';

  const hash = cacheKey(clamped, voiceId, lang);
  const etag = `"${CACHE_VERSION}-${hash}"`;

  if (!bypass && req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  if (!bypass) {
    const cached = lruGet(etag);
    if (cached) {
      logLine('HIT', cached.byteLength, voiceId, lang, clamped.length);
      return new Response(cached, {
        status: 200,
        headers: { ...COMMON_HEADERS, etag, 'x-tts-cache': 'HIT' },
      });
    }
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clamped,
        model_id: MODEL_ID,
        // Higher stability + lower style = steadier pitch, less waver,
        // fewer compression-style artifacts (the "noise" owner flagged).
        // similarity_boost dropped slightly so the voice doesn't pump
        // on emphatic syllables in Russian.
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
        },
        // Max quality output format — the default is lower bitrate,
        // which is audible as "fuzz" on longer sentences.
        output_format: 'mp3_44100_192',
      }),
    },
  ).catch((err) => new Response(`upstream fetch failed: ${err}`, { status: 502 }));

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '');
    return jsonErr(
      upstream.status || 502,
      `tts upstream ${upstream.status}: ${bodyText.slice(0, 200)}`,
    );
  }

  const buf = new Uint8Array(await upstream.arrayBuffer());

  if (!looksLikeMp3(buf)) {
    console.warn(`[tts] refusing non-mp3 upstream bytes=${buf.byteLength}`);
    return jsonErr(502, 'tts upstream returned non-mp3');
  }

  if (buf.byteLength >= MIN_CACHEABLE_BYTES) {
    lruSet(etag, buf);
    logLine('MISS', buf.byteLength, voiceId, lang, clamped.length);
  } else {
    console.warn(`[tts] skip cache: tiny payload bytes=${buf.byteLength}`);
    logLine('SKIP', buf.byteLength, voiceId, lang, clamped.length);
  }

  return new Response(buf, {
    status: 200,
    headers: { ...COMMON_HEADERS, etag, 'x-tts-cache': 'MISS' },
  });
}

function logLine(
  cacheStatus: 'HIT' | 'MISS' | 'SKIP',
  bytes: number,
  voice: string,
  lang: string,
  textLen: number,
): void {
  console.log(
    JSON.stringify({ tts: true, cache: cacheStatus, bytes, voice, lang, textLen }),
  );
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
