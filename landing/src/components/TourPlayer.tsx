import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLang, useT } from '../i18n/LangContext';
import {
  fetchTourClip,
  isTtsDisabled,
  pauseCurrentAudio,
  playAsCurrent,
  resumeCurrentAudio,
  stopCurrentAudio,
  unlockAudio,
} from '../lib/tts';
import { stepsFor, type TourStep } from '../tour/scenarios';

/**
 * Guided-tour player. CTA in the hero kicks it off; once running,
 *
 *   - scrolls to each step's anchor
 *   - dims the whole page and spotlights the step's target elements
 *   - flies a pointer arrow onto the key element
 *   - plays the step's voice clip (TTS, Russian / English / Chinese)
 *   - shows a subtitle line with the current text
 *   - advances to the next step after playback ends
 *
 * Controls: pause / resume, prev, next, exit. Space bar toggles
 * pause. Esc exits. Voice is cancelled on exit so the user isn't
 * chased off the page by a still-playing clip.
 *
 * Prefetches the NEXT step's TTS while the current clip plays so
 * transitions feel gapless.
 */
export function TourPlayer() {
  const t = useT();
  const { lang: rawLang } = useLang();
  // The tour scenarios and TTS only ship en/ru/zh copy. Anything
  // else (es, vi, pt, uz, hi) is a cloned placeholder without audio,
  // so we collapse to English for the tour until proper localisation.
  const lang: 'en' | 'ru' | 'zh' =
    rawLang === 'ru' || rawLang === 'zh' ? rawLang : 'en';
  const location = useLocation();
  const navigate = useNavigate();
  const steps = useMemo(() => stepsFor('/'), []);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const prefetchRef = useRef<Map<number, Promise<{ url: string; audio: HTMLAudioElement } | null>>>(
    new Map(),
  );
  // Set to true when the user hits Prev. The next auto-advance
  // (triggered by audio ending) is swallowed so we stay on the
  // rewound step instead of flying forward again.
  const skipNextAutoAdvanceRef = useRef(false);
  // Monotonic id that invalidates in-flight steps when the user
  // skips or exits. A step that resolves with a stale id must not
  // start playback.
  const runTokenRef = useRef(0);

  // Spotlight / pointer DOM refs.
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef<HTMLDivElement | null>(null);
  const spotlightBoxesRef = useRef<HTMLDivElement[]>([]);

  // ── Lifecycle ────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    runTokenRef.current++;
    abortRef.current?.abort();
    abortRef.current = null;
    prefetchRef.current.clear();
    stopCurrentAudio();
    // Clear spotlight boxes.
    spotlightBoxesRef.current.forEach((el) => el.remove());
    spotlightBoxesRef.current = [];
    document.body.classList.remove('tour-running');
  }, []);

  const start = useCallback(() => {
    if (isTtsDisabled()) return;
    // Authorise audio playback within the user gesture — required
    // by iOS Safari (esp. older iPhones). Without this the tour
    // flies through silently because subsequent play() calls get
    // blocked by autoplay policy.
    unlockAudio();
    setRunning(true);
    setPaused(false);
    setStepIdx(0);
    document.body.classList.add('tour-running');
    // Prefetch EVERY step's TTS blob in parallel so playback chains
    // back-to-back without fetch latency or silent gaps between
    // clips. The map keyed by index is shared with the per-step
    // effect, which awaits these exact promises instead of firing
    // its own fetch.
    for (let i = 0; i < steps.length; i++) {
      if (!prefetchRef.current.has(i)) {
        const step = steps[i];
        const text = step.voice[lang] ?? step.voice.en;
        prefetchRef.current.set(
          i,
          fetchTourClip(step.id, lang, text).catch(() => null),
        );
      }
    }
  }, [lang, steps]);

  const exit = useCallback(() => {
    setRunning(false);
    setPaused(false);
    cleanup();
  }, [cleanup]);

  const next = useCallback(() => {
    runTokenRef.current++;
    abortRef.current?.abort();
    stopCurrentAudio();
    setStepIdx((i) => {
      const n = Math.min(steps.length - 1, i + 1);
      if (n === i) {
        // At end — auto-exit.
        setRunning(false);
        cleanup();
      }
      return n;
    });
  }, [cleanup, steps.length]);

  const prev = useCallback(() => {
    runTokenRef.current++;
    abortRef.current?.abort();
    stopCurrentAudio();
    skipNextAutoAdvanceRef.current = true;
    setStepIdx((i) => Math.max(0, i - 1));
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  // ── Global listeners (CTA bus, keyboard) ─────────────────────

  useEffect(() => {
    const onStart = () => start();
    window.addEventListener('trendex:tour-start', onStart);
    return () => window.removeEventListener('trendex:tour-start', onStart);
  }, [start]);

  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); exit(); return; }
      if (e.key === ' ')       { e.preventDefault(); togglePause(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, exit, next, prev, togglePause]);

  // Clean up on unmount.
  useEffect(() => cleanup, [cleanup]);

  // ── Pause/resume audio wiring ─────────────────────────────────

  useEffect(() => {
    if (!running) return;
    // The audio element is created via `new Audio(url)` inside
    // lib/tts.ts and never attached to the DOM, so
    // document.querySelectorAll('audio') doesn't find it. Call the
    // module-level helpers directly — they reach the singleton
    // reference the player shares with ChatInline.
    if (paused) pauseCurrentAudio();
    else resumeCurrentAudio();
  }, [paused, running, stepIdx]);

  // ── Prefetch a step's TTS blob (cached per-index). ──────────

  const prefetch = useCallback(
    (idx: number): Promise<{ url: string; audio: HTMLAudioElement } | null> => {
      const existing = prefetchRef.current.get(idx);
      if (existing) return existing;
      const step = steps[idx];
      if (!step) return Promise.resolve(null);
      const text = step.voice[lang] ?? step.voice.en;
      const p = fetchTourClip(step.id, lang, text).catch(() => null);
      prefetchRef.current.set(idx, p);
      return p;
    },
    [lang, steps],
  );

  // ── Spotlight / pointer geometry ─────────────────────────────

  const paintSpotlight = useCallback((step: TourStep) => {
    // Clear previous cutout boxes.
    spotlightBoxesRef.current.forEach((el) => el.remove());
    spotlightBoxesRef.current = [];
    const overlay = overlayRef.current;
    if (!overlay) return;

    const selectors = step.spotlight ?? [];
    selectors.forEach((sel) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      box.className = 'tour-spotlight-cutout';
      const pad = 10;
      box.style.left = `${r.left - pad}px`;
      box.style.top = `${r.top - pad}px`;
      box.style.width = `${r.width + pad * 2}px`;
      box.style.height = `${r.height + pad * 2}px`;
      overlay.appendChild(box);
      spotlightBoxesRef.current.push(box);
    });
  }, []);

  const movePointer = useCallback((step: TourStep) => {
    const pt = pointerRef.current;
    if (!pt) return;
    if (!step.pointer) { pt.style.opacity = '0'; return; }
    const el = document.querySelector(step.pointer);
    if (!el) { pt.style.opacity = '0'; return; }
    const r = el.getBoundingClientRect();
    const x = r.left + Math.min(r.width * 0.5, 160);
    const y = r.top + Math.min(r.height * 0.5, 80);
    pt.style.opacity = '1';
    pt.style.transform = `translate(${x}px, ${y}px)`;
  }, []);

  const layoutForStep = useCallback(
    (step: TourStep) => {
      paintSpotlight(step);
      movePointer(step);
    },
    [paintSpotlight, movePointer],
  );

  // Re-layout on resize / scroll while tour is running.
  useEffect(() => {
    if (!running) return;
    const step = steps[stepIdx];
    if (!step) return;
    const onFrame = () => layoutForStep(step);
    window.addEventListener('resize', onFrame);
    window.addEventListener('scroll', onFrame, { passive: true });
    return () => {
      window.removeEventListener('resize', onFrame);
      window.removeEventListener('scroll', onFrame);
    };
  }, [running, stepIdx, steps, layoutForStep]);

  // ── Drive a step ─────────────────────────────────────────────

  useEffect(() => {
    if (!running) return;
    const step = steps[stepIdx];
    if (!step) return;

    const myToken = ++runTokenRef.current;
    let cancelled = false;

    const run = async () => {
      // 1. Clear last step's spotlight IMMEDIATELY and hide pointer
      //    so we don't carry visuals from the previous section.
      spotlightBoxesRef.current.forEach((el) => el.remove());
      spotlightBoxesRef.current = [];
      if (pointerRef.current) pointerRef.current.style.opacity = '0';

      // 1a. Route navigation — if the step lives on a different
      //     page, push the router and wait for the lazy-loaded
      //     route to mount before scrolling.
      if (step.route && step.route !== location.pathname) {
        navigate(step.route);
        await wait(650);
        if (cancelled || myToken !== runTokenRef.current) return;
      }

      // 2. Kick off scroll + TTS playback IN PARALLEL. No waiting
      //    for scroll before audio — user asked for continuous
      //    narration, so any silence between steps has to be ~0.
      const target = document.querySelector(step.scrollTo);
      // Manual scroll that respects the caption's footprint. The
      // caption + controls occupy the bottom ~220px of the viewport,
      // so "center" in the naïve block:'center' sense puts the
      // active element UNDER the caption. We offset by half that
      // reserved area so the element sits in the middle of the
      // VISIBLE region above the caption.
      if (target) {
        const rect = (target as HTMLElement).getBoundingClientRect();
        const isPhone = window.innerWidth <= 640;
        const reservedBottom = isPhone ? 160 : 220; // caption + controls + buffer
        const visibleH = window.innerHeight - reservedBottom;
        // scrollAlign='start' → pin element top ~80px below viewport
        // top so users see the OPENING of a tall section (can scroll
        // to see the rest). Default center positioning is great for
        // short targets but clips both ends on phone when content
        // exceeds visibleH.
        const elemHeight = rect.height;
        const overflows = elemHeight > visibleH;
        const align = step.scrollAlign ?? (isPhone && overflows ? 'start' : 'center');
        let delta: number;
        if (align === 'start') {
          const pad = isPhone ? 72 : 96; // leave room for the nav
          delta = rect.top - pad;
        } else {
          const elemCentre = rect.top + elemHeight / 2;
          const desiredCentre = visibleH / 2;
          delta = elemCentre - desiredCentre;
        }
        const topY = Math.max(0, window.scrollY + delta);
        try {
          window.scrollTo({ top: topY, behavior: 'smooth' });
        } catch {
          window.scrollTo(0, topY);
        }
      } else {
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); }
        catch { window.scrollTo(0, 0); }
      }

      const myPrefetch = prefetch(stepIdx);
      prefetch(stepIdx + 1); // next-step warmup (already covered by bulk prefetch in start())

      // Paint spotlight multiple times — immediately, then at
      // 250 / 600 / 1000 / 1500 ms. Long smooth-scrolls on later
      // slides (#capital-market, #referral, #investors) settle
      // after our one-shot repaint fired, so the glow never
      // caught up. Idempotent — each call just updates position.
      layoutForStep(step);
      void (async () => {
        const marks = [250, 600, 1000, 1500];
        let acc = 0;
        for (const at of marks) {
          await wait(at - acc);
          acc = at;
          if (cancelled || myToken !== runTokenRef.current) return;
          layoutForStep(step);
        }
      })();

      // 3. Play audio. Because every clip was prefetched at tour
      //    start, this usually resolves instantly.
      let clip: { url: string; audio: HTMLAudioElement } | null = null;
      try { clip = await myPrefetch; } catch { clip = null; }
      if (cancelled || myToken !== runTokenRef.current) {
        if (clip) try { URL.revokeObjectURL(clip.url); } catch { /* ignore */ }
        return;
      }

      if (!clip) {
        // Hold a beat so the caption is readable even when TTS failed.
        await wait(2200);
      } else {
        try {
          await playAsCurrent(clip.url, clip.audio);
        } catch { /* autoplay blocked or superseded */ }
      }
      if (cancelled || myToken !== runTokenRef.current) return;

      // 4. Zero-gap advance. `holdMs` is only honoured when explicitly
      //    set by the step (the closing waitlist step wants a beat).
      //    Everything else flows directly into the next clip.
      if (step.holdMs && step.holdMs > 0) await wait(step.holdMs);
      if (cancelled || myToken !== runTokenRef.current) return;

      // If the user pressed Prev to land on this step, stay here
      // and pause — don't auto-advance past what they rewound to.
      if (skipNextAutoAdvanceRef.current) {
        skipNextAutoAdvanceRef.current = false;
        setPaused(true);
        return;
      }

      if (stepIdx < steps.length - 1) {
        setStepIdx((i) => (i === stepIdx ? i + 1 : i));
      } else {
        // Last step just ended — signal App to open the hero AI
        // chat so the user can drop an application right away.
        window.dispatchEvent(new Event('trendex:tour-ended'));
        // If we're running inside the Telegram Mini App (launched from
        // the bot's "Watch intro" webApp button), notify the bot so it
        // can mark presented_at + send the follow-up, then close the
        // WebView. No-op in regular web visits.
        try {
          const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string; sendData?: (s: string) => void; close?: () => void } } }).Telegram?.WebApp;
          if (tg?.initData) {
            tg.sendData?.(JSON.stringify({ type: 'tour_done' }));
            setTimeout(() => { try { tg.close?.(); } catch { /* ignore */ } }, 400);
          }
        } catch { /* ignore */ }
        setRunning(false);
        cleanup();
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [running, stepIdx, steps, prefetch, layoutForStep, cleanup]);

  // ── Render ───────────────────────────────────────────────────

  if (!running) {
    return (
      <button
        type="button"
        className="tour-cta-fab"
        onClick={start}
        aria-label={t('tour.cta_start')}
        title={t('tour.cta_start')}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span className="tour-cta-fab-label">{t('tour.cta_start')}</span>
      </button>
    );
  }

  const step = steps[stepIdx];
  const captionHtml = step?.captionHtml?.[lang];
  const caption = step
    ? (step.caption?.[lang] ?? step.voice[lang] ?? step.voice.en)
    : '';

  return (
    <>
      <div className="tour-overlay" ref={overlayRef} aria-hidden="true" />
      <div className="tour-pointer" ref={pointerRef} aria-hidden="true">
        <svg viewBox="0 0 48 48" width="48" height="48">
          <circle cx="24" cy="24" r="8" className="tour-pointer-dot" />
          <circle cx="24" cy="24" r="16" className="tour-pointer-ring" />
        </svg>
      </div>

      {captionsOn && (captionHtml || caption) && (
        captionHtml ? (
          <div
            className="tour-caption"
            role="status"
            aria-live="polite"
            /* captionHtml is author-controlled static copy from
               scenarios.ts (never user input), so HTML injection
               is safe here. We use it to render inline <a> links. */
            dangerouslySetInnerHTML={{ __html: captionHtml }}
          />
        ) : (
          <div className="tour-caption" role="status" aria-live="polite">
            {caption}
          </div>
        )
      )}

      <div className="tour-controls" role="group" aria-label={t('tour.controls_aria')}>
        <button
          type="button"
          className="tour-ctl"
          onClick={prev}
          disabled={stepIdx === 0}
          aria-label={t('tour.prev')}
          title={t('tour.prev')}
        >⏮</button>
        <button
          type="button"
          className="tour-ctl tour-ctl-play"
          onClick={togglePause}
          aria-label={paused ? t('tour.resume') : t('tour.pause')}
          title={paused ? t('tour.resume') : t('tour.pause')}
        >{paused ? '▶' : '⏸'}</button>
        <button
          type="button"
          className="tour-ctl"
          onClick={next}
          aria-label={t('tour.next')}
          title={t('tour.next')}
        >⏭</button>
        <div className="tour-progress" aria-label={t('tour.progress')}>
          {stepIdx + 1} / {steps.length}
        </div>
        <button
          type="button"
          className="tour-ctl tour-ctl-cc"
          onClick={() => setCaptionsOn((v) => !v)}
          aria-label={t('tour.captions_toggle')}
          title={t('tour.captions_toggle')}
          aria-pressed={captionsOn}
        >CC</button>
        <button
          type="button"
          className="tour-ctl tour-ctl-exit"
          onClick={exit}
          aria-label={t('tour.exit')}
          title={t('tour.exit')}
        >✕</button>
      </div>
    </>
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default TourPlayer;
