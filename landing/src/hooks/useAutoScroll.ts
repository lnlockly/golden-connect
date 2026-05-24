import { useEffect } from 'react';

/**
 * Slide-based auto-scroll. Instead of drifting pixel-by-pixel, we
 * smooth-scroll from one `<section>` to the next on a timer — like a
 * guided tour. Each section gets the visitor's attention for
 * `slideDurationMs`, then we smoothly snap to the next one.
 *
 *  - Kicks in after `initialDelayMs`.
 *  - Pauses on real user input (wheel, touchmove, arrow/space/pageup/down).
 *  - Resumes from the current position after `resumeAfterIdleMs` of idle.
 *  - Stops on the last section.
 *  - Disabled when prefers-reduced-motion.
 */
export interface AutoScrollOpts {
  initialDelayMs?: number;
  slideDurationMs?: number;
  resumeAfterIdleMs?: number;
}

const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ', 'Spacebar',
]);

export function useAutoScroll(opts: AutoScrollOpts = {}) {
  const initialDelayMs    = opts.initialDelayMs    ?? 4000;
  const slideDurationMs   = opts.slideDurationMs   ?? 7000;
  const resumeAfterIdleMs = opts.resumeAfterIdleMs ?? 7000;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mql?.matches) return;

    let stopped = false;
    let running = false;
    let tickTimer:  ReturnType<typeof setTimeout> | null = null;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let kickTimer:   ReturnType<typeof setTimeout> | null = null;

    function getSections(): HTMLElement[] {
      return Array.from(document.querySelectorAll('main section')) as HTMLElement[];
    }

    function currentIndex(sections: HTMLElement[]): number {
      // Pick the section whose top is closest to (but not past) the
      // current scroll position. Using a small forgiveness buffer so
      // mid-scroll the "current" index flips cleanly.
      const y = window.scrollY + 40;
      let best = 0;
      for (let i = 0; i < sections.length; i++) {
        const top = sections[i].offsetTop;
        if (top <= y) best = i;
        else break;
      }
      return best;
    }

    function advance() {
      if (stopped || !running) return;
      const sections = getSections();
      if (sections.length === 0) {
        stopped = true;
        return;
      }
      const idx = currentIndex(sections);
      const next = sections[idx + 1];
      if (!next) {
        stopped = true;
        running = false;
        return;
      }
      // Account for the sticky nav (72px) so the section top is not
      // swallowed under the header on sections shorter than the
      // viewport.
      const targetY = Math.max(0, next.offsetTop - 72);
      window.scrollTo({ top: targetY, left: 0, behavior: 'smooth' });
      tickTimer = setTimeout(advance, slideDurationMs);
    }

    function start() {
      if (stopped || running) return;
      running = true;
      tickTimer = setTimeout(advance, slideDurationMs);
    }

    function pause() {
      if (stopped) return;
      running = false;
      if (tickTimer   != null) { clearTimeout(tickTimer);   tickTimer = null; }
      if (resumeTimer != null) { clearTimeout(resumeTimer); resumeTimer = null; }
      resumeTimer = setTimeout(() => {
        if (!stopped) start();
      }, resumeAfterIdleMs);
    }

    const onWheel     = () => pause();
    const onTouchMove = () => pause();
    const onKeyDown   = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) pause();
    };

    kickTimer = setTimeout(() => {
      if (!stopped) start();
    }, initialDelayMs);

    window.addEventListener('wheel',     onWheel,     { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('keydown',   onKeyDown);

    return () => {
      stopped = true;
      if (tickTimer   != null) clearTimeout(tickTimer);
      if (resumeTimer != null) clearTimeout(resumeTimer);
      if (kickTimer   != null) clearTimeout(kickTimer);
      window.removeEventListener('wheel',     onWheel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown',   onKeyDown);
    };
  }, [initialDelayMs, slideDurationMs, resumeAfterIdleMs]);
}
