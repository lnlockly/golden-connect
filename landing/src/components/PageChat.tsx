import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../i18n/LangContext';
import { ChatInline } from './ChatInline';

export type PageChatIntent =
  | 'investor_deep'
  | 'business_deep'
  | 'operators_deep'
  | 'token_deep'
  | 'how_deep'
  | 'marketing_deep'
  | 'whitepaper_deep';

export interface PageSection { id: string; label: string }

export interface PageChatProps {
  intent: PageChatIntent;
  /** Path the user is on, e.g. "/investors". */
  page: string;
  /** Section ids that actually render on this page + a short label.
      Hardcoded per-page (not DOM-scanned) so the backend can point
      the user at the right anchor. */
  sections: PageSection[];
}

/**
 * Page-aware docked chat. Renders a compact pill at the bottom of
 * every deep sub-page; tapping it expands into a bottom-sheet with
 * the full <ChatInline /> transcript. The backend is told which page
 * and which sections the user is looking at, and may emit `nav:`
 * lines telling us to scroll to an anchor or route to another page.
 *
 * Mount this as the LAST child of the page so it overlays content.
 *
 * Not mounted on "/" (HeroChat owns that) or "/app" (dashboard has
 * its own chat surface).
 */
export function PageChat({ intent, page, sections }: PageChatProps) {
  const t = useT();
  const navigate = useNavigate();

  // Per-pathname open state — survives soft navigations within a
  // single route but doesn't leak across routes. Keyed by pathname.
  const storageKey = `golden-connect_pagechat_open_${page}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, open ? '1' : '0');
    } catch { /* non-fatal */ }
  }, [open, storageKey]);

  // Let CSS know the page has a docked chat so <main> can reserve
  // safe-area padding without every page importing the rule itself.
  useEffect(() => {
    const prev = document.body.getAttribute('data-has-pagechat');
    document.body.setAttribute('data-has-pagechat', '1');
    return () => {
      if (prev == null) document.body.removeAttribute('data-has-pagechat');
      else document.body.setAttribute('data-has-pagechat', prev);
    };
  }, []);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Listen for the `nav:` SSE line ChatInline forwards out as a
  // CustomEvent (see ChatInline wiring below). The backend emits
  // at most one nav: per reply; we scroll and/or route accordingly.
  const handleNav = useCallback(
    (action: { route?: string; scroll?: string; focus?: string }) => {
      try {
        if (action.route && action.route !== page) {
          navigate(action.route);
          // Wait one paint + one extra tick for the lazy-loaded page
          // to mount, then scroll if requested.
          if (action.scroll) {
            setTimeout(() => {
              const el = document.querySelector(action.scroll!);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 220);
          }
          // Keep the sheet open so the user sees the context on the
          // new page too — PageChat on the target page will re-mount
          // with its own pathname state.
          return;
        }
        if (action.scroll) {
          const el = document.querySelector(action.scroll);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (action.focus === 'input') {
          // Focus our pill input if collapsed, otherwise the inner
          // textarea. Done on the next tick to avoid fighting React.
          setTimeout(() => {
            const sel = open
              ? '.pagechat-body .chat-inline-input textarea'
              : '.pagechat-pill-input';
            const el = document.querySelector<HTMLElement>(sel);
            el?.focus();
          }, 0);
        }
      } catch (e) {
        // Never crash on unknown / malformed actions.
        // eslint-disable-next-line no-console
        console.warn('[pagechat] nav action failed', e, action);
      }
    },
    [navigate, open, page],
  );

  useEffect(() => {
    const onEvt = (ev: Event) => {
      const ce = ev as CustomEvent<{ route?: string; scroll?: string; focus?: string }>;
      if (ce?.detail) handleNav(ce.detail);
    };
    window.addEventListener('golden-connect:pagechat-nav', onEvt as EventListener);
    return () => window.removeEventListener('golden-connect:pagechat-nav', onEvt as EventListener);
  }, [handleNav]);

  // ── Mobile drag-to-dismiss on the handle. ────────────────────
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dragStartY = useRef<number | null>(null);
  const onHandleDown = (e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    sheetRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (dragStartY.current == null || !sheetRef.current) return;
    const dy = e.clientY - dragStartY.current;
    dragStartY.current = null;
    try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    sheetRef.current.style.transform = '';
    if (dy > 80) setOpen(false);
  };

  return (
    <>
      {open && (
        <div
          className="pagechat-backdrop open"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      <div className="pagechat-dock" role="region" aria-label={t('pagechat.ready')}>
        {!open && (
          <button
            type="button"
            className="pagechat-pill"
            onClick={() => setOpen(true)}
            aria-label={t('pagechat.expand')}
          >
            <span className="pagechat-pill-mark" aria-hidden="true">AF</span>
            <span className="pagechat-pill-input" role="textbox" aria-readonly="true">
              {window.innerWidth < 480
                ? t('pagechat.placeholder_short')
                : t('pagechat.placeholder')}
            </span>
            <span
              className="pagechat-pill-mic"
              aria-hidden="true"
              title={t('pagechat.expand')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="8" y1="22" x2="16" y2="22" />
              </svg>
            </span>
          </button>
        )}

        {open && (
          <div
            ref={sheetRef}
            className="pagechat-sheet open"
            role="dialog"
            aria-modal="true"
            aria-label={t('pagechat.ready')}
          >
            <header className="pagechat-sheet-head">
              <div
                className="pagechat-handle-wrap"
                onPointerDown={onHandleDown}
                onPointerMove={onHandleMove}
                onPointerUp={onHandleUp}
                onPointerCancel={onHandleUp}
                title={t('pagechat.handle_hint')}
                aria-hidden="true"
              >
                <span className="pagechat-handle" />
              </div>
              <button
                type="button"
                className="pagechat-close"
                onClick={() => setOpen(false)}
                aria-label={t('pagechat.close')}
                title={t('pagechat.close')}
              >×</button>
            </header>
            <div className="pagechat-body">
              {/* Wrap in the same "hero-chat--embedded hero-chat-card"
                  container the main landing uses so every embedded-chat
                  style in part18.css (circular mic / voice / send
                  buttons, transparent masked body, proper typography)
                  cascades here too. Result: identical chat UI on
                  every page, no custom PageChat overrides needed. */}
              <div className="hero-chat--embedded">
                <div className="hero-chat-card">
                  <ChatInline
                    intent="order"
                    greetingKey={`pagechat.greeting_${intent}`}
                    placeholderKey="pagechat.placeholder"
                    footKey="pagechat.foot"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Register page context for ChatInline's fetch to read. We
          mount an invisible script-free element, but the actual
          registration is a side-effect in the useEffect above the
          return. See the effect below. */}
      <PageChatContextBridge intent={intent} page={page} sections={sections} />
    </>
  );
}

/**
 * Non-visual helper that pushes { intent, page, sections } onto a
 * window-level slot so ChatInline's /api/chat request body can
 * pick them up without a new prop. This keeps ChatInline
 * unmodified except for a single optional merge — see notes in
 * ChatInline.tsx (we read window.__golden-connectPageCtx in the send
 * path). Safe to run multiple times; last-write-wins.
 */
function PageChatContextBridge({
  intent,
  page,
  sections,
}: {
  intent: PageChatIntent;
  page: string;
  sections: PageSection[];
}) {
  useEffect(() => {
    (window as unknown as { __golden-connectPageCtx?: unknown }).__golden-connectPageCtx = {
      intent,
      page,
      sections,
    };
    return () => {
      const cur = (window as unknown as { __golden-connectPageCtx?: { page?: string } })
        .__golden-connectPageCtx;
      if (cur && cur.page === page) {
        (window as unknown as { __golden-connectPageCtx?: unknown }).__golden-connectPageCtx = undefined;
      }
    };
  }, [intent, page, sections]);
  return null;
}

export default PageChat;
