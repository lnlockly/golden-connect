/**
 * Shared TTS singleton — used by ChatInline's speaker button, the
 * voice-mode auto-play, the first-gesture greeting, AND the Tour
 * player. Every caller must route audio playback through this
 * module so two voices can never overlap.
 *
 * Lifecycle:
 *   - fetchTtsBlob() — cached POST /api/tts with AbortController
 *   - playAsCurrent()  — stops whatever is playing, starts the new clip
 *   - stopCurrentAudio() — kills current playback + revokes blob URL
 *   - isTtsDisabled()    — backend returned 503 once; hide UI affordances
 */

let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let currentAudioToken = 0;

/** Single persistent <audio> element created inside a user gesture.
 *  iOS Safari (especially older, e.g. iPhone 7) only authorises audio
 *  playback on elements whose first `.play()` was called during a
 *  gesture. Creating a new Audio() per clip loses that privilege
 *  between awaits — play() silently rejects and the tour flies
 *  through without sound. By reusing ONE element and just swapping
 *  `src`, the gesture permission carries through every clip. */
let persistentAudio: HTMLAudioElement | null = null;

/** Call once inside a user gesture (tap / click) to authorise audio
 *  playback for the rest of the session. Subsequent playAsCurrent()
 *  calls will work on iOS Safari without needing another gesture. */
export function unlockAudio(): void {
  if (persistentAudio) return;
  const a = new Audio();
  a.preload = 'auto';
  a.setAttribute('playsinline', 'true');
  a.setAttribute('webkit-playsinline', 'true');
  // Simplest iOS unlock: call play() inside the current user
  // gesture on an empty element, swallow any rejection, and keep
  // the element around. Once unlocked, future .src swaps + .play()
  // succeed without another gesture.
  try {
    const unlockPromise = a.play();
    if (unlockPromise && typeof unlockPromise.catch === 'function') {
      unlockPromise.catch(() => { /* expected on some versions */ });
    }
  } catch { /* ignore */ }
  persistentAudio = a;
}

let ttsDisabled = false;

export function isTtsDisabled(): boolean {
  return ttsDisabled;
}

export function stopCurrentAudio(): void {
  if (currentAudio) {
    try { currentAudio.onended = null; currentAudio.onpause = null; currentAudio.onerror = null; } catch { /* ignore */ }
    try { currentAudio.pause(); } catch { /* ignore */ }
    try { currentAudio.src = ''; } catch { /* ignore */ }
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try { URL.revokeObjectURL(currentAudioUrl); } catch { /* ignore */ }
    currentAudioUrl = null;
  }
  currentAudioToken++;
}

/** Current audio token. A caller can snapshot this before an async op
 *  and bail if it changed while they were awaiting. */
export function snapshotAudioToken(): number {
  return currentAudioToken;
}

/** Pause the currently-playing clip without tearing it down. The
 *  audio element is detached (not in the DOM), so callers can't
 *  find it via document.querySelectorAll; this helper is the only
 *  correct way to pause from outside the module. */
export function pauseCurrentAudio(): void {
  if (currentAudio) {
    try { currentAudio.pause(); } catch { /* ignore */ }
  }
}

/** Resume whatever was paused by pauseCurrentAudio. If no clip is
 *  loaded, this is a no-op. */
export function resumeCurrentAudio(): void {
  if (currentAudio && currentAudio.paused && currentAudio.src) {
    try { void currentAudio.play(); } catch { /* ignore */ }
  }
}

/** Returns a promise that resolves when playback ends (naturally or
 *  via stopCurrentAudio). Uses the persistent audio element set up
 *  by unlockAudio() when available (so iOS Safari keeps playing across
 *  multiple clips); falls back to the passed element on desktop
 *  browsers where that isn't needed. */
export function playAsCurrent(url: string, audio: HTMLAudioElement): Promise<void> {
  stopCurrentAudio();
  const token = ++currentAudioToken;
  // Prefer the gesture-unlocked singleton so iOS keeps permission.
  const el = persistentAudio ?? audio;
  try {
    el.src = url;
    // .load() after src-change is what older iOS Safari actually
    // needs to reset the media pipeline. Without it, the element
    // keeps the previous clip's state and .play() is a no-op.
    el.load();
    el.currentTime = 0;
  } catch { /* ignore */ }
  currentAudio = el;
  currentAudioUrl = url;
  return new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      if (currentAudioToken !== token) { resolve(); return; }
      // Only revoke if the URL looks like a blob: (not a static
      // /tour-audio/ path). Revoking a normal URL is a no-op but
      // avoids false errors in some console panels.
      if (url.startsWith('blob:')) {
        try { URL.revokeObjectURL(url); } catch { /* ignore */ }
      }
      if (currentAudio === el) {
        currentAudio = null;
        currentAudioUrl = null;
      }
      resolve();
    };
    el.onended = cleanup;
    el.onerror = cleanup;
    // Watchdog: if onended / onerror never fire within (duration ||
    // 30s) + 3s, advance anyway. Covers browsers where the audio
    // element stalls silently.
    const watchdogMs = 33_000;
    const watchdog = setTimeout(cleanup, watchdogMs);
    const origCleanup = cleanup;
    el.onended = () => { clearTimeout(watchdog); origCleanup(); };
    el.onerror = () => { clearTimeout(watchdog); origCleanup(); };
    const playPromise = el.play();
    if (playPromise && typeof (playPromise as Promise<void>).catch === 'function') {
      (playPromise as Promise<void>).catch(() => {
        clearTimeout(watchdog);
        origCleanup();
      });
    }
  });
}

export interface FetchTtsOptions {
  text: string;
  lang: 'ru' | 'en' | 'zh';
  signal?: AbortSignal;
}

export interface FetchTtsResult {
  url: string;
  audio: HTMLAudioElement;
}

/** Fetches a TTS clip from /api/tts and returns a blob URL + a new
 *  <audio> element bound to it. The caller is responsible for calling
 *  playAsCurrent(url, audio) — this function doesn't start playback. */
export async function fetchTtsBlob(opts: FetchTtsOptions): Promise<FetchTtsResult | null> {
  if (ttsDisabled) return null;
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: opts.text, lang: opts.lang }),
    signal: opts.signal,
  });
  if (res.status === 503) {
    ttsDisabled = true;
    return null;
  }
  if (!res.ok) return null;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return { url, audio };
}

/** Bump this whenever scenarios.ts voice text changes and the
 *  tour MP3s get rebaked — forces every browser to re-download
 *  the updated clip instead of reusing the old one from disk
 *  cache under the same URL. */
const TOUR_AUDIO_VERSION = 'v8';

/** Fetch (HEAD-check then handle via direct src) a PRE-BAKED tour
 *  MP3. Returns the direct URL, not a blob — direct URLs are
 *  maximally compatible (every browser handles them; blob URLs
 *  can misbehave on older WebViews / Yandex / Samsung Internet
 *  edge cases). Browser's native HTTP cache does the prefetch. */
export async function fetchTourClip(
  stepId: string,
  lang: 'ru' | 'en' | 'zh',
  text: string,
  signal?: AbortSignal,
): Promise<FetchTtsResult | null> {
  const staticUrl = `/tour-audio/${stepId}.${lang}.mp3?v=${TOUR_AUDIO_VERSION}`;
  try {
    // HEAD verifies the file exists + warms the cache on many
    // browsers. If HEAD is blocked (CORS / old browsers), fall
    // through to GET.
    let ok = false;
    try {
      const head = await fetch(staticUrl, { method: 'HEAD', signal });
      ok = head.ok;
    } catch { /* fall through */ }
    if (!ok) {
      const res = await fetch(staticUrl, { signal });
      if (!res.ok) throw new Error('static 404');
      // Drain the body so the browser's HTTP cache stores it; we
      // still use the direct URL below so <audio> fetches from cache.
      await res.blob().catch(() => undefined);
    }
    const audio = new Audio();
    audio.preload = 'auto';
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    // No crossOrigin — /tour-audio/ is same-origin, setting it to
    // 'anonymous' forced a CORS preflight that older Safari
    // (iPhone 7) rejected silently, leaving audio loaded but muted.
    return { url: staticUrl, audio };
  } catch { /* fall through to live TTS */ }
  return fetchTtsBlob({ text, lang, signal });
}
