import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { ChatIntent } from './ChatInline';
import { HeroChat } from './HeroChat';
import { useT } from '../i18n/LangContext';
import { HeroInputPill } from './HeroInputPill';

const WAVE_BARS = 80;

export interface HeroAreaHandle {
  /** Open the chat from outside (e.g. a section CTA). Intent is
      already set by the parent via onIntentChange → we just reveal
      the chat and scroll back to the hero. */
  expand: () => void;
  /** Collapse without resetting intent — matches the back-button. */
  collapse: () => void;
}

interface Props {
  chatIntent: ChatIntent;
  chatResetKey: number;
  onChatReset: () => void;
}

export const HeroArea = forwardRef<HeroAreaHandle, Props>(function HeroArea(
  { chatIntent, chatResetKey, onChatReset },
  ref,
) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const [pendingInput, setPendingInput] = useState('');
  // Once a pending message has been handed off to <HeroChat> as its
  // initial textarea contents, we null it so flipping back-and-forth
  // doesn't keep re-seeding it.
  const [pendingConsumed, setPendingConsumed] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  const doExpand = useCallback(() => {
    setExpanded(true);
  }, []);

  const doCollapse = useCallback(() => {
    setExpanded(false);
  }, []);

  useImperativeHandle(ref, () => ({
    expand: () => {
      setExpanded(true);
      // Only scroll the hero into view when it's actually off-screen.
      // Visitors who are already on the hero (typing in the pill)
      // shouldn't get their page yanked around — that was the
      // "не сьезжай" complaint.
      requestAnimationFrame(() => {
        const el = heroRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= -80 && rect.bottom > 0 && rect.top < window.innerHeight;
        if (!inView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    },
    collapse: doCollapse,
  }), [doCollapse]);

  // Focus the chat's textarea when we transition from collapsed →
  // expanded. Accessibility requirement from the spec.
  useEffect(() => {
    if (!expanded) return;
    const id = requestAnimationFrame(() => {
      const ta = heroRef.current?.querySelector<HTMLTextAreaElement>(
        '.chat-inline-input textarea',
      );
      if (ta) {
        ta.focus();
        // Place the cursor at the end of any pre-filled text.
        const len = ta.value.length;
        try { ta.setSelectionRange(len, len); } catch { /* ignore */ }
      }
    });
    return () => cancelAnimationFrame(id);
  }, [expanded, chatIntent, chatResetKey]);

  // Reset the "consumed" latch whenever a track CTA resets the chat
  // — that way a fresh pending message could conceivably be pushed
  // again. In practice we clear pendingInput on handoff, so this is
  // mostly defensive.
  useEffect(() => {
    setPendingConsumed(false);
  }, [chatResetKey]);

  // First handoff of pendingInput into the chat consumes it.
  const handoffPending = !pendingConsumed && pendingInput.length > 0
    ? pendingInput
    : undefined;

  // Consume once the chat has mounted with it.
  useEffect(() => {
    if (expanded && handoffPending) {
      setPendingConsumed(true);
    }
  }, [expanded, handoffPending]);

  return (
    <section
      id="top"
      className={`hero-v2 hero-area${expanded ? ' hero-v2--expanded' : ''}`}
      ref={heroRef}
    >
      <div className="hero-wave" aria-hidden="true">
        <div className="hero-wave-bars">
          {Array.from({ length: WAVE_BARS }).map((_, i) => (
            <span
              key={i}
              className="hero-wave-bar"
              style={{ animationDelay: `${(i % 13) * 70}ms` }}
            />
          ))}
        </div>
        <div className="hero-wave-fade" />
      </div>

      <h1 className="hero-brand" aria-label="GOLDEN_CONNECT">GOLDEN_CONNECT</h1>

      <button
        type="button"
        className="hero-tour-cta"
        onClick={() => window.dispatchEvent(new Event('golden-connect:tour-start'))}
        aria-label={t('tour.cta_start')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>{t('tour.cta_start')}</span>
      </button>

      {!expanded && (
        <div className="hero-area-pill-wrap">
          <HeroInputPill
            value={pendingInput}
            onChange={setPendingInput}
            onExpand={doExpand}
          />
        </div>
      )}

      {expanded && (
        <div className="hero-area-chat">
          <HeroChat
            intent={chatIntent}
            resetKey={chatResetKey}
            onReset={onChatReset}
            onBack={doCollapse}
            backLabelKey="hero_input.collapse_aria"
            className="hero-chat--embedded"
            pendingUserMessage={handoffPending}
          />
        </div>
      )}
    </section>
  );
});
