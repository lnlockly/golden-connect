import { useEffect, useRef } from 'react';
import { useT } from '../i18n/LangContext';
import { ChatInline, type ChatIntent } from './ChatInline';

/**
 * Single chat widget that lives in the hero slot. The visitor never
 * sees more than one chat on the landing — every track-specific CTA
 * (Marketplace "Order", TheSplit "Operator / Learner", Investor
 * "Talk" etc.) just calls `openChat(intent)` from App.tsx, which
 * bumps `resetKey` and scrolls back here.
 *
 * Keyed on `intent`-`resetKey` so switching tracks restarts the
 * conversation — old messages don't leak across intents.
 */

interface Props {
  intent: ChatIntent;
  resetKey: number;
  onReset: () => void;
  /** Optional wrapper className — lets the parent (<HeroArea>) style
      the chat differently when it's being rendered inside the hero
      slot vs. the legacy standalone section. */
  className?: string;
  /** Optional first-user-message that the outer state machine
      captured in the collapsed input pill. When present, it's
      pre-filled into <ChatInline>'s textarea so the visitor can
      hit Enter to send — we intentionally avoid auto-sending so
      the visitor keeps agency. */
  pendingUserMessage?: string;
  /** Optional back-button. Renders as a small pill in the head. */
  onBack?: () => void;
  /** i18n key for the back-button label. Defaults to the existing
      "Back to start" reset copy. */
  backLabelKey?: string;
}

const KEYS: Record<ChatIntent, { greet: string; agent: string; placeholder: string; foot: string }> = {
  router: {
    greet:       'hero_chat.router.greeting',
    agent:       'hero_chat.router.agent_name',
    placeholder: 'hero_chat.router.placeholder',
    foot:        'hero_chat.router.foot',
  },
  order: {
    greet:       'chat.greeting',
    agent:       'chat.agent_name',
    placeholder: 'chat.placeholder',
    foot:        'chat.foot',
  },
  operator: {
    greet:       'split.leader.greeting',
    agent:       'split.leader.agent_name',
    placeholder: 'split.leader.placeholder',
    foot:        'split.leader.foot',
  },
  learner: {
    greet:       'split.learner.greeting',
    agent:       'split.learner.agent_name',
    placeholder: 'split.learner.placeholder',
    foot:        'split.learner.foot',
  },
  investor: {
    greet:       'hero_chat.investor.greeting',
    agent:       'hero_chat.investor.agent_name',
    placeholder: 'hero_chat.investor.placeholder',
    foot:        'hero_chat.investor.foot',
  },
  create_agent: {
    greet:       'hero_chat.create_agent.greeting',
    agent:       'hero_chat.create_agent.agent_name',
    placeholder: 'hero_chat.create_agent.placeholder',
    foot:        'hero_chat.create_agent.foot',
  },
};

export function HeroChat({
  intent,
  resetKey,
  onReset,
  className,
  pendingUserMessage,
  onBack,
  backLabelKey,
}: Props) {
  const t = useT();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Scroll the chat into view whenever the caller bumps resetKey —
  // that's the signal from App.tsx that a track CTA was pressed.
  // Skip when onBack is present — in that mode we're embedded inside
  // the hero and the hero handles its own scroll behaviour.
  useEffect(() => {
    if (resetKey === 0) return;
    if (onBack) return;
    wrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [resetKey, intent, onBack]);

  const keys = KEYS[intent];

  return (
    <section
      id="chat"
      className={`section-hero-chat${className ? ` ${className}` : ''}`}
      ref={wrapRef}
    >
      <div className="hero-chat-head">
        <div className="hero-chat-eyebrow">{t('hero_chat.eyebrow')}</div>
        <h2 className="hero-chat-h">{t(`hero_chat.${intent}.h`)}</h2>
        {onBack && (
          <button
            type="button"
            className="hero-chat-reset"
            onClick={onBack}
            aria-label={t('hero_input.collapse_aria')}
          >
            ← {t(backLabelKey ?? 'hero_chat.back_to_router')}
          </button>
        )}
        {!onBack && intent !== 'router' && (
          <button
            type="button"
            className="hero-chat-reset"
            onClick={onReset}
          >
            ← {t('hero_chat.back_to_router')}
          </button>
        )}
      </div>

      <div className="hero-chat-card">
        <ChatInline
          key={`${intent}-${resetKey}`}
          intent={intent}
          greetingKey={keys.greet}
          agentNameKey={keys.agent}
          placeholderKey={keys.placeholder}
          footKey={keys.foot}
          pendingUserMessage={pendingUserMessage}
        />
      </div>
    </section>
  );
}
