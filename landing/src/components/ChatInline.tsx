import { useEffect, useRef, useState } from 'react';
import { useLang, useT } from '../i18n/LangContext';

type Role = 'user' | 'assistant';
interface Msg { role: Role; content: string }

export type ChatIntent =
  | 'order'
  | 'operator'
  | 'learner'
  | 'investor'
  | 'router'
  | 'create_agent';

/**
 * Speaker button — plays the assistant message via /api/tts (server
 * proxies to ElevenLabs). Self-contained: handles its own loading /
 * playing state, hides itself if the backend returns 503 (no API
 * key configured in the deployment) so the UI doesn't show a button
 * the user can't use.
 */
let TTS_DISABLED_PROCESS_LEVEL = false;

/**
 * Module-level singleton for the *currently-playing* TTS audio. Any
 * component (SpeakButton, auto-play effect, first-gesture greeting)
 * that starts a new clip MUST call `stopCurrentAudio()` first so we
 * never overlap two voices at once. Blob URLs are revoked on stop so
 * the browser doesn't accumulate leaked media elements.
 */
let currentAudio: HTMLAudioElement | null = null;
let currentAudioUrl: string | null = null;
let currentAudioToken = 0;

function stopCurrentAudio(): void {
  if (currentAudio) {
    try { currentAudio.onended = null; currentAudio.onpause = null; } catch { /* ignore */ }
    try { currentAudio.pause(); } catch { /* ignore */ }
    try { currentAudio.src = ''; } catch { /* ignore */ }
    currentAudio = null;
  }
  if (currentAudioUrl) {
    try { URL.revokeObjectURL(currentAudioUrl); } catch { /* ignore */ }
    currentAudioUrl = null;
  }
  // Bump token so any in-flight fetch that resolves *after* stop knows
  // it was superseded and must not start playback.
  currentAudioToken++;
}

function playAsCurrent(url: string, audio: HTMLAudioElement, onDone?: () => void): Promise<void> {
  stopCurrentAudio();
  const token = ++currentAudioToken;
  currentAudio = audio;
  currentAudioUrl = url;
  const cleanup = () => {
    if (currentAudioToken !== token) return; // superseded
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    if (currentAudio === audio) {
      currentAudio = null;
      currentAudioUrl = null;
    }
    if (onDone) onDone();
  };
  audio.onended = cleanup;
  audio.onerror = cleanup;
  return audio.play();
}

/**
 * Page-lifetime greeting guard. The landing mounts multiple ChatInline
 * instances (hero, PageChat on deep routes, TalkToAgent) and each one
 * has its own first-gesture greeting effect. Without this flag, the
 * same greeting can fire twice (StrictMode double-mount) or different
 * greetings can overlap when the user navigates between routes. First
 * instance to hear a gesture wins for the rest of the session.
 */
let GREETED_ONCE = false;

/**
 * Strip markdown + stage glyphs BEFORE sending text to TTS so Eleven
 * doesn't read "asterisk" / "hash" aloud and doesn't lisp on poison
 * emoji. The server-side normalizer catches most of this too, but we
 * clean here so the cache key matches across clients.
 */
function cleanForTts(raw: string): string {
  return raw
    // inline code / bold / italic / strikethrough
    .replace(/[*_~`]+/g, '')
    // markdown headers / bullets / quote prefixes at line-start
    .replace(/^\s*[#>\-+•·]+\s*/gm, '')
    // naked links → visible text only
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // fenced code blocks — drop entirely
    .replace(/```[\s\S]*?```/g, ' ')
    // stage markers / status dots / poison glyphs
    .replace(/[🔊🎙🟢🔴🟡🔵🟣🛠👉📊⚡✨✅🎁●■]/g, '')
    // collapse whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function SpeakButton({
  text, lang, ready,
}: { text: string; lang: 'en' | 'ru' | 'zh'; ready: boolean }) {
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const abortRef = useRef<AbortController | null>(null);
  const [hidden, setHidden] = useState(TTS_DISABLED_PROCESS_LEVEL);

  // Reset local UI state when the shared audio is stopped by somebody
  // else (auto-play effect, another speaker button, voice-mode toggle).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  if (hidden) return null;

  async function play() {
    if (state !== 'idle') {
      // Toggle stop on a second click — interrupts fetch + playback.
      abortRef.current?.abort();
      abortRef.current = null;
      stopCurrentAudio();
      setState('idle');
      return;
    }
    // Starting new playback ALWAYS cancels any prior audio (auto-greet,
    // other speaker button, voice-mode auto-play) so voices never stack.
    stopCurrentAudio();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState('loading');
    try {
      const resp = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cleanForTts(text), lang }),
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) { setState('idle'); return; }
      if (resp.status === 503) {
        TTS_DISABLED_PROCESS_LEVEL = true;
        setHidden(true);
        setState('idle');
        return;
      }
      if (!resp.ok || !resp.body) throw new Error(`tts ${resp.status}`);
      const blob = await resp.blob();
      if (ctrl.signal.aborted) { setState('idle'); return; }
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      setState('playing');
      await playAsCurrent(url, a, () => setState('idle'));
    } catch {
      setState('idle');
    }
  }

  return (
    <button
      type="button"
      className={`chat-msg-speak${state === 'playing' ? ' playing' : ''}${state === 'loading' ? ' loading' : ''}${ready ? ' ready' : ''}`}
      onClick={play}
      aria-label={state === 'playing' ? 'Stop' : 'Play voice'}
      title={state === 'playing' ? 'Stop' : 'Voice'}
    >
      {state === 'loading' ? '…' : state === 'playing' ? '◼' : '🔊'}
    </button>
  );
}

interface Props {
  intent?: ChatIntent;
  /** Fully-qualified i18n key for the first assistant message.
      Defaults to `chat.greeting`. */
  greetingKey?: string;
  /** Fully-qualified i18n key for the agent display name in the header.
      Defaults to `chat.agent_name`. */
  agentNameKey?: string;
  /** Textarea placeholder. Track-specific by default so the operator /
      learner modals don't show "Describe your task — e.g. a landing". */
  placeholderKey?: string;
  /** Footer microcopy under the input. */
  footKey?: string;
  /** Pre-fill the textarea with this text on first mount. Used by
      <HeroArea> to carry over whatever the visitor typed into the
      collapsed grey pill before the chat mounted. We don't auto-send
      — the visitor hits Enter to confirm, keeping agency. */
  pendingUserMessage?: string;
}

const MIN_BUDGET = 10;

// Locale → BCP-47 tag for the browser SpeechRecognition API. Anything
// we don't explicitly map falls back to en-US since the underlying
// engines all accept it.
const SR_LANG_MAP: Record<string, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  zh: 'zh-CN',
};

// Minimal structural type for the browser SpeechRecognition instance
// so we don't pull in `dom.iterable` typings for the whole project.
interface SRInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SREvent) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  onspeechend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
interface SREvent {
  resultIndex: number;
  results: {
    length: number;
    [i: number]: {
      isFinal: boolean;
      length: number;
      [j: number]: { transcript: string };
    };
  };
}

// Push a new entry into localStorage['goldenConnect.myAgents'] so the
// dashboard's MyAgents widget surfaces it. Matches the shape used by
// CreateAgentModal.tsx so both paths converge on the same list.
interface MyAgentEntry {
  name: string;
  ticker: string;
  status: 'queued' | 'deploying' | 'live' | 'failed';
  deployedAt: string;
  slug?: string;
}
function pushMyAgent(entry: MyAgentEntry) {
  try {
    const raw = localStorage.getItem('goldenConnect.myAgents');
    const list: MyAgentEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(
      (a) => !(a.name === entry.name && a.ticker === entry.ticker),
    );
    filtered.unshift(entry);
    localStorage.setItem('goldenConnect.myAgents', JSON.stringify(filtered));
    window.dispatchEvent(new Event('goldenConnect:my-agents-changed'));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

// Inline microphone glyph — keeps the bundle free of icon packages.
function VoiceIcon() {
  // Stylised speaker / sound-wave icon. Single colour, currentColor.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 5L6 9H3v6h3l5 4V5z" />
      <path d="M15.5 8.5a4 4 0 0 1 0 7" />
      <path d="M18.5 5.5a8 8 0 0 1 0 13" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      stroke="currentColor"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="8" y1="22" x2="16" y2="22" />
    </svg>
  );
}

export function ChatInline({
  intent = 'order',
  greetingKey = 'chat.greeting',
  agentNameKey = 'chat.agent_name',
  placeholderKey = 'chat.placeholder',
  footKey = 'chat.foot',
  pendingUserMessage,
}: Props = {}) {
  const t = useT();
  const { lang: rawLang } = useLang();
  // SpeakButton / TTS only ships en/ru/zh voices; collapse extras to en.
  const lang: 'en' | 'ru' | 'zh' =
    rawLang === 'ru' || rawLang === 'zh' ? rawLang : 'en';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState(pendingUserMessage ?? '');
  const [interim, setInterim] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [listening, setListening] = useState(false);
  // Voice mode: when on, every completed assistant reply auto-plays
  // through /api/tts, and the mic stays primed for hands-free chat.
  // Persisted across sessions; default ON for first-time visitors
  // (returning users keep whatever they last chose).
  const [voiceMode, setVoiceMode] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem('goldenConnect.voiceMode');
      if (raw === '1') return true;
      if (raw === '0') return false;
      return true; // NEW default for first-time visitors
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('goldenConnect.voiceMode', voiceMode ? '1' : '0'); }
    catch { /* private mode etc — non-fatal */ }
  }, [voiceMode]);
  // Mic-permission bookkeeping. We can't request getUserMedia at mount
  // because browsers block prompts without a prior user-gesture — so
  // we wait for the first interaction (click / keystroke / mic tap)
  // and fire the request then. Once denied we never ask again.
  const micPermRef = useRef<'unknown' | 'granted' | 'denied'>('unknown');
  const [micPermState, setMicPermState] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  // Track which assistant message indices we've already auto-played
  // so toggling voice mode mid-conversation doesn't replay history.
  const playedAutoRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!voiceMode) return;
    if (TTS_DISABLED_PROCESS_LEVEL) return;
    if (pending) return;
    const lastIdx = msgs.length - 1;
    const last = msgs[lastIdx];
    if (!last || last.role !== 'assistant' || !last.content) return;
    if (playedAutoRef.current.has(lastIdx)) return;
    // Skip the very first assistant message — it's the localized
    // greeting, which is already played by the first-gesture effect
    // below. Auto-playing it here too was the source of the
    // "greeting speaks twice / overlaps" bug.
    if (lastIdx === 0) { playedAutoRef.current.add(lastIdx); return; }
    playedAutoRef.current.add(lastIdx);
    // Short settle delay lets the bubble animation land before the
    // voice kicks in — otherwise it feels rushed on fast responses.
    let cancelled = false;
    const ctrl = new AbortController();
    const delayTimer = setTimeout(() => {
      if (cancelled) return;
      (async () => {
        try {
          // Cancel any previous audio (greeting, speaker click, prior
          // auto-play) so rapid-fire replies never overlap voices.
          stopCurrentAudio();
          const resp = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: cleanForTts(last.content), lang }),
            signal: ctrl.signal,
          });
          if (cancelled || ctrl.signal.aborted) return;
          if (resp.status === 503) { TTS_DISABLED_PROCESS_LEVEL = true; return; }
          if (!resp.ok || !resp.body) return;
          const blob = await resp.blob();
          if (cancelled || ctrl.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const a = new Audio(url);
          await playAsCurrent(url, a);
        } catch { /* fail silent — chat keeps working without voice */ }
      })();
    }, 150);
    return () => {
      cancelled = true;
      ctrl.abort();
      clearTimeout(delayTimer);
    };
  }, [voiceMode, pending, msgs, lang]);

  // When voice-mode is switched OFF mid-playback, immediately silence
  // whatever is currently playing. Owner asked for the toggle to feel
  // like a hard mute, not a delayed-until-next-turn switch.
  useEffect(() => {
    if (!voiceMode) stopCurrentAudio();
  }, [voiceMode]);
  // Request mic permission on the first real user interaction.
  // Browsers require a user-gesture before surfacing the permission
  // prompt, so we defer it to the first mousedown / keydown / touch.
  // Fires once — on grant we immediately stop the tracks (we're not
  // recording; SpeechRecognition opens its own stream later).
  useEffect(() => {
    if (!voiceMode) return;
    if (micPermRef.current !== 'unknown') return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    let fired = false;
    const handler = () => {
      if (fired) return;
      fired = true;
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('keydown', handler, true);
      document.removeEventListener('touchstart', handler, true);
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then((stream) => {
          micPermRef.current = 'granted';
          setMicPermState('granted');
          // We don't record here — SpeechRecognition will open its
          // own capture. Release tracks immediately so the browser
          // doesn't show a permanent "recording" indicator.
          try { stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        })
        .catch(() => {
          micPermRef.current = 'denied';
          setMicPermState('denied');
        });
    };
    document.addEventListener('mousedown', handler, true);
    document.addEventListener('keydown', handler, true);
    document.addEventListener('touchstart', handler, true);
    return () => {
      document.removeEventListener('mousedown', handler, true);
      document.removeEventListener('keydown', handler, true);
      document.removeEventListener('touchstart', handler, true);
    };
  }, [voiceMode]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recogRef = useRef<SRInstance | null>(null);

  // Feature-detect once per mount. We still render the mic button
  // when the API is absent, just disabled with an explanatory tooltip.
  const srSupported =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as unknown as { webkitSpeechRecognition?: unknown })
          .webkitSpeechRecognition,
    );

  useEffect(() => {
    if (msgs.length === 0) {
      setMsgs([{ role: 'assistant', content: t(greetingKey) }]);
    }
  }, [msgs.length, t, greetingKey]);

  // Owner ask: play the greeting voice line the moment the user
  // FIRST interacts with the page (click / tap / key). Browsers
  // block autoplay without a gesture — this one-shot listener
  // hits the /api/tts endpoint with the localized greeting text
  // the moment a gesture arrives, then unsubscribes.
  //
  // Guards:
  //   1. Module-level GREETED_ONCE — prevents duplicate playback when
  //      multiple ChatInline instances mount (hero + PageChat on deep
  //      routes + TalkToAgent) or when StrictMode double-mounts in dev.
  //   2. voiceMode must be ON — if the user muted voice we don't greet.
  //   3. Not cached if TTS is disabled at the process level.
  useEffect(() => {
    if (GREETED_ONCE) return;
    if (!voiceMode) return;
    if (TTS_DISABLED_PROCESS_LEVEL) return;
    const greetTxt = t(greetingKey);
    if (!greetTxt) return;
    const ctrl = new AbortController();
    let fired = false;
    const play = () => {
      if (fired || GREETED_ONCE) return;
      fired = true;
      GREETED_ONCE = true;
      document.removeEventListener('click', play, true);
      document.removeEventListener('keydown', play, true);
      document.removeEventListener('touchstart', play, true);
      fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: cleanForTts(greetTxt), lang }),
        signal: ctrl.signal,
      })
        .then((r) => {
          if (r.status === 503) { TTS_DISABLED_PROCESS_LEVEL = true; return null; }
          return r.ok ? r.blob() : null;
        })
        .then((blob) => {
          if (!blob || ctrl.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const a = new Audio(url);
          void playAsCurrent(url, a).catch(() => { /* autoplay blocked — silent */ });
        })
        .catch(() => { /* TTS unavailable or aborted — silent */ });
    };
    document.addEventListener('click', play, true);
    document.addEventListener('keydown', play, true);
    document.addEventListener('touchstart', play, true);
    return () => {
      ctrl.abort();
      document.removeEventListener('click', play, true);
      document.removeEventListener('keydown', play, true);
      document.removeEventListener('touchstart', play, true);
    };
    // Only on mount / greeting-key change; don't retrigger per lang
    // switch mid-session (user already spoke/clicked by then).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greetingKey]);

  // Stop any playing audio on unmount — otherwise navigating away
  // from a page while the greeting is still speaking leaves it
  // playing against the new page's greeting.
  useEffect(() => {
    return () => { stopCurrentAudio(); };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, pending]);

  // Clean up any running SpeechRecognition instance on unmount so we
  // never leak an active mic capture across navigation.
  useEffect(() => {
    return () => {
      try { recogRef.current?.abort(); } catch { /* ignore */ }
      recogRef.current = null;
    };
  }, []);

  function stopListening() {
    setListening(false);
    setInterim('');
    const r = recogRef.current;
    if (!r) return;
    try { r.stop(); } catch { /* ignore */ }
  }

  function startListening() {
    if (!srSupported || listening || pending) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SRInstance;
      webkitSpeechRecognition?: new () => SRInstance;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    try {
      const r = new Ctor();
      r.continuous = true;
      r.interimResults = true;
      r.lang = SR_LANG_MAP[lang] ?? 'en-US';

      let finalBuffer = '';

      r.onresult = (ev: SREvent) => {
        let interimText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const result = ev.results[i];
          const piece = result[0]?.transcript ?? '';
          if (result.isFinal) finalBuffer += piece;
          else interimText += piece;
        }
        if (finalBuffer) {
          // Append final segments to the textarea value as the user
          // would have typed them; keep the interim transcript in a
          // preview slot so the user sees it without it committing.
          setInput((prev) => {
            const joiner = prev && !/\s$/.test(prev) ? ' ' : '';
            const next = prev + joiner + finalBuffer;
            finalBuffer = '';
            return next;
          });
        }
        setInterim(interimText);
      };

      r.onerror = (ev: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[chat-mic] recognition error', ev);
        setListening(false);
        setInterim('');
      };

      r.onend = () => {
        setListening(false);
        setInterim('');
      };

      r.onspeechend = () => {
        // Auto-submit only when the transcript so far is ≥ 4 chars —
        // anything shorter is almost always a misfire (throat-clear,
        // ambient noise) and would waste an /api/chat round-trip.
        try { r.stop(); } catch { /* ignore */ }
        setListening(false);
        setInterim('');
        setInput((current) => {
          if (current.trim().length >= 4) {
            setTimeout(() => { void send(current); }, 0);
          }
          return current;
        });
      };

      recogRef.current = r;
      setListening(true);
      r.start();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[chat-mic] failed to start', err);
      setListening(false);
      setInterim('');
      recogRef.current = null;
    }
  }

  async function send(overrideText?: string) {
    const raw = (overrideText ?? input);
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text || pending) return;

    // Any send action cancels in-flight voice capture.
    if (listening) stopListening();

    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setInterim('');
    setPending(true);
    setError(null);

    // Retry the /api/chat request silently on transient failures — the
    // owner asked for a spinner, not a red error toast, when the upstream
    // (rate limit / network blip / Claude 529) recovers within a few s.
    //
    // When <PageChat> mounted us inside a deep sub-page, it parks
    // { intent, page, sections } on window.__goldenConnectPageCtx so the
    // backend can tailor the system prompt and answer/nav about that
    // page. Merge it into the request body here — unaffected when
    // the hero chat or dashboard chat calls us (ctx is absent).
    const pageCtx = (window as unknown as {
      __goldenConnectPageCtx?: {
        intent?: string;
        page?: string;
        sections?: { id: string; label: string }[];
      };
    }).__goldenConnectPageCtx;
    const chatIntent = pageCtx?.intent || intent;

    let resp: Response | null = null;
    const delays = [400, 1200, 3000];
    for (let attempt = 0; attempt < delays.length + 1; attempt++) {
      try {
        const r = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: next,
            lang,
            intent: chatIntent,
            minBudget: MIN_BUDGET,
            ...(pageCtx?.page ? { page: pageCtx.page } : {}),
            ...(pageCtx?.sections ? { sections: pageCtx.sections } : {}),
          }),
        });
        if (r.ok && r.body) { resp = r; break; }
      } catch { /* fetch itself failed — retry */ }
      const nextDelay = delays[attempt];
      if (nextDelay === undefined) break;
      await new Promise((res) => setTimeout(res, nextDelay));
    }

    try {
      if (!resp || !resp.body) throw new Error('chat unavailable');
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      let order: Record<string, unknown> | null = null;
      // The new <<<LEAD_SUBMIT>>> path is handled server-side (api/chat.ts
      // POSTs to goldenConnect-api /internal/leads and emits a single `lead:`
      // SSE line on success). We flip this flag when we see the line so
      // the footer confirmation ("заявка отправлена") lights up without
      // the client having to re-fire an HTTP request.
      let leadSubmitted = false;
      setMsgs((m) => [...m, { role: 'assistant', content: '' }]);

      // Streaming throttle. We used to `setMsgs` on every chunk, which
      // means hundreds of React re-renders for a long reply — enough
      // to cause noticeable jank on low-end devices. Instead we batch
      // updates via requestAnimationFrame (~1 per ~16ms), which keeps
      // the UI live at ~60fps without flooding the reconciler.
      let rafId: number | null = null;
      let pendingAcc = '';
      const scheduleUpdate = () => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const snapshot = pendingAcc;
          setMsgs((m) => {
            const c = m.slice();
            c[c.length - 1] = { role: 'assistant', content: snapshot };
            return c;
          });
        });
      };

      // Network reads chop the SSE stream at arbitrary byte boundaries —
      // they don't respect newlines or URI-escape boundaries. We have
      // to buffer leftover text across reads, otherwise mid-line cuts
      // cause us to (a) drop the tail half of a `text:` payload, or
      // (b) hand a half-decoded `%D1%`-style sequence to
      // decodeURIComponent, which throws and we silently lose chars.
      // The visible symptom was words getting eaten mid-reply.
      let buf = '';
      const handleLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        if (line.startsWith('text:')) {
          let piece = line.slice(5);
          try { piece = decodeURIComponent(piece); } catch { /* raw */ }
          acc += piece;
          pendingAcc = acc;
          scheduleUpdate();
        } else if (line.startsWith('order:')) {
          try { order = JSON.parse(line.slice(6)); } catch { /* skip */ }
        } else if (line.startsWith('lead:')) {
          // Server-side lead submission succeeded. Flip the confirmation
          // flag; the existing `chat-sent` footer picks it up.
          try {
            const parsed = JSON.parse(line.slice(5));
            if (parsed && parsed.ok) leadSubmitted = true;
          } catch { /* skip */ }
        } else if (line.startsWith('nav:')) {
          // Deep-page navigation hint. PageChat listens on this event
          // and decides whether to scroll, route, or focus the input.
          // We never crash on a malformed nav — worst case it's ignored.
          try {
            const action = JSON.parse(line.slice(4));
            if (action && typeof action === 'object') {
              window.dispatchEvent(new CustomEvent('goldenConnect:pagechat-nav', { detail: action }));
            }
          } catch { /* skip malformed */ }
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // Process every COMPLETE line; keep the dangling tail (no
        // trailing newline yet) for the next read.
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const raw of lines) handleLine(raw);
      }
      // Flush any final partial line that had no trailing newline.
      if (buf) handleLine(buf);
      // Cancel any pending RAF and apply the final content synchronously
      // so the voice-mode auto-play effect sees the fully-assembled text
      // on the very next render (instead of waiting a frame).
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      setMsgs((m) => {
        const c = m.slice();
        c[c.length - 1] = { role: 'assistant', content: acc };
        return c;
      });

      if (order) {
        // Branch on the track: agent_deploy payloads have a totally
        // different shape (character + plugins + secrets + contact)
        // than the marketplace order shape (task + budget + deadline).
        // TypeScript can't narrow `order` through the closure that
        // assigns it inside the stream loop — pin the non-null value
        // into a local so spread / member access works.
        const ord = order as Record<string, unknown>;
        const track = typeof ord.track === 'string' ? ord.track : null;
        const endpoint = track === 'agent_deploy' ? '/api/agent-deploy' : '/api/order';
        const body = track === 'agent_deploy'
          ? { ...ord, lang }
          : { ...ord, lang, transcript: next, source: `chat-${intent}` };

        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          // For agent-deploy successes, mirror the wizard's behaviour:
          // push a queued entry into localStorage so the MyAgents
          // widget on /app picks the new agent up.
          if (track === 'agent_deploy' && res.ok) {
            try {
              const j = await res.json();
              const ch = (ord.character as Record<string, unknown> | undefined) ?? {};
              const chName = typeof ch.name === 'string' ? ch.name : '';
              const tickerGuess = typeof ord.ticker === 'string' ? ord.ticker : '';
              pushMyAgent({
                name: chName,
                ticker: tickerGuess,
                status: 'queued',
                deployedAt: new Date().toISOString(),
                slug: typeof j?.slug === 'string' ? j.slug : undefined,
              });
            } catch {
              /* localStorage push is best-effort */
            }
          }
        } catch {
          /* swallow — the chat UI still shows success toast */
        }
        setSent(true);
      }
      // Server-side lead submission (<<<LEAD_SUBMIT>>> marker path)
      // lights up the same "заявка отправлена" footer as the legacy
      // order: path, but without any client-side HTTP.
      if (leadSubmitted) setSent(true);
    } catch (e) {
      // No scary red. Drop in a subtle assistant-style recovery bubble in the
      // user's language so they can just retry.
      const retryText =
        lang === 'ru'
          ? 'Секунду, связь моргнула. Попробуй отправить ещё раз.'
          : lang === 'zh'
          ? '稍等,连接闪了一下。请再发送一次。'
          : 'Tiny hiccup — please send that again.';
      setMsgs((m) => [...m, { role: 'assistant', content: retryText }]);
      // Keep error state for dev/logs only, not for UI red-box.
      setError((e as Error).message || 'error');
    } finally {
      setPending(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const micDenied = micPermState === 'denied';
  const micTitle = !srSupported
    ? t('chat.mic.unsupported')
    : micDenied
    ? t('chat.mic.unsupported')
    : listening
    ? t('chat.mic.listening')
    : t('chat.mic.idle');

  return (
    <div className="chat-inline">
      <header className="chat-inline-head" data-voice-on={voiceMode ? '1' : '0'}>
        <div className="chat-inline-left">
          <span className="chat-inline-avatar">AF</span>
          <div>
            <div className="chat-inline-name">{t(agentNameKey)}</div>
            <div className="chat-inline-status">
              <span className="dot" />
              {t('chat.online')}
            </div>
          </div>
        </div>
      </header>

      <div className="chat-inline-body" ref={scrollRef}>
        {msgs.map((m, i) => {
          const isLastAssistant =
            m.role === 'assistant' &&
            i === msgs.length - 1 &&
            !pending &&
            !!m.content;
          return (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === 'assistant' && <span className="chat-msg-ava">AF</span>}
              <div className="chat-msg-bubble">
                {m.content || (
                  <span className="chat-typing"><span /><span /><span /></span>
                )}
                {m.role === 'assistant' && m.content && (
                  <SpeakButton text={m.content} lang={lang} ready={isLastAssistant} />
                )}
              </div>
            </div>
          );
        })}
        {pending && msgs[msgs.length - 1]?.role === 'user' && (
          <div className="chat-msg assistant">
            <span className="chat-msg-ava">AF</span>
            <div className="chat-msg-bubble">
              <span className="chat-typing"><span /><span /><span /></span>
            </div>
          </div>
        )}
        {sent && (
          <div className="chat-sent">
            <span className="dot" />
            {t('chat.sent')}
          </div>
        )}
        {/* Red `chat-error` toast intentionally dropped: retries happen
            silently and a grey recovery bubble is appended to the thread
            if the request ultimately fails. See the setMsgs call in the
            catch block above. */}
        {null}
        {error && null}
      </div>

      <div className="chat-inline-input chat-input">
        <textarea
          rows={1}
          placeholder={
            listening && interim
              ? interim
              : listening
              ? t('chat.mic.listening')
              : t(placeholderKey)
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={pending}
        />
        <button
          type="button"
          className={`chat-input-mic ${listening ? 'listening' : 'idle'}`}
          onClick={() => {
            if (!srSupported || micDenied) return;
            if (listening) stopListening();
            else startListening();
          }}
          disabled={!srSupported || pending || micDenied}
          title={micTitle}
          aria-label={micTitle}
          aria-pressed={listening}
        >
          {listening ? (
            <span className="chat-input-mic-pulse" aria-hidden="true" />
          ) : (
            <MicIcon />
          )}
        </button>
        <button
          type="button"
          className={`chat-input-voice${voiceMode ? ' on' : ''}`}
          onClick={() => setVoiceMode((v) => !v)}
          title={voiceMode ? t('chat.voice.on') : t('chat.voice.off')}
          aria-label={voiceMode ? t('chat.voice.on') : t('chat.voice.off')}
          aria-pressed={voiceMode}
        >
          <VoiceIcon />
        </button>
        <button
          onClick={() => send()}
          disabled={pending || !input.trim() || listening}
          type="button"
        >
          {pending ? '…' : '→'}
        </button>
      </div>

      <div className="chat-inline-foot">{t(footKey)}</div>
    </div>
  );
}
