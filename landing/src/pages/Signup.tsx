import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TgLoginButton } from '../components/cabinet/TgLoginButton';

const REF_STORAGE_KEY = 'goldenConnect_invited_by';

type Tab = 'tg' | 'email';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void; theme?: 'dark' | 'light' },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || '';

export default function Signup() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { signup, isAuthenticated, isLoading } = useAuth();

  const refCode = useMemo(() => {
    const fromQuery = params.get('ref');
    if (fromQuery) return fromQuery;
    try { return localStorage.getItem(REF_STORAGE_KEY); }
    catch { return null; }
  }, [params]);

  const [tab, setTab] = useState<Tab>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  // If already authed, skip straight to cabinet onboarding.
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/cabinet/panel', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  // Load Cloudflare Turnstile on demand only when the email tab is active
  // and a site key is configured. If no key — the widget simply stays hidden
  // and signup proceeds without a captcha token (server treats it as optional
  // until TURNSTILE_SECRET is set).
  useEffect(() => {
    if (tab !== 'email' || !TURNSTILE_SITE_KEY || !turnstileRef.current) return;

    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !turnstileRef.current) return;
      // Don't double-render
      if (turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: 'dark',
        callback: (token) => setCaptchaToken(token),
        'expired-callback': () => setCaptchaToken(null),
        'error-callback': () => setCaptchaToken(null),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Inject the script tag (idempotent by src).
      const existing = document.querySelector<HTMLScriptElement>('script[data-turnstile]');
      if (!existing) {
        const s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        s.async = true;
        s.defer = true;
        s.setAttribute('data-turnstile', '1');
        s.onload = renderWidget;
        document.head.appendChild(s);
      } else {
        existing.addEventListener('load', renderWidget, { once: true });
      }
    }

    return () => {
      cancelled = true;
      if (turnstileWidgetId.current && window.turnstile) {
        try { window.turnstile.remove(turnstileWidgetId.current); } catch { /* noop */ }
        turnstileWidgetId.current = null;
      }
    };
  }, [tab]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError('Подтвердите что вы не робот');
      return;
    }
    setSubmitting(true);
    try {
      await signup(email, password, refCode, captchaToken ?? undefined);
      navigate('/cabinet/panel', { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      // reset captcha so user can re-solve
      if (turnstileWidgetId.current && window.turnstile) {
        try { window.turnstile.reset(turnstileWidgetId.current); } catch { /* noop */ }
      }
      setCaptchaToken(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Регистрация в Golden Connect</h1>
        <p style={subtitleStyle}>
          Создайте аккаунт, чтобы начать зарабатывать на рекламной платформе.
        </p>

        {refCode ? (
          <div style={refBoxStyle}>
            По приглашению: <b style={{ color: '#00D4FF' }}>{refCode}</b>
          </div>
        ) : null}

        <div style={tabsWrapStyle}>
          <button
            type="button"
            onClick={() => setTab('tg')}
            style={tabBtnStyle(tab === 'tg')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-3px' }}>
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
            Через Telegram
          </button>
          <button
            type="button"
            onClick={() => setTab('email')}
            style={tabBtnStyle(tab === 'email')}
          >
            Почта + пароль
          </button>
        </div>

        {tab === 'tg' ? (
          <div style={tgBlockStyle}>
            <p style={{ margin: '0 0 16px', color: '#A0A8D0', fontSize: 14, lineHeight: 1.5 }}>
              Регистрация в один клик через Telegram-бота. Не нужно придумывать пароль — мы привяжем аккаунт к вашему Telegram.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <TgLoginButton label="Войти через Telegram" />
            </div>
            <p style={{ margin: '16px 0 0', color: '#6E7BAF', fontSize: 12, textAlign: 'center' }}>
              После нажатия откроется бот @Golden Connect_bizbot
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} style={formStyle}>
            <label style={labelStyle}>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
                placeholder="you@example.com"
              />
            </label>
            <label style={labelStyle}>
              Пароль
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={6}
                style={inputStyle}
                placeholder="минимум 6 символов"
              />
            </label>

            {TURNSTILE_SITE_KEY ? (
              <div ref={turnstileRef} style={{ display: 'flex', justifyContent: 'center', minHeight: 65 }} />
            ) : null}

            {error ? <div style={errorStyle}>{error}</div> : null}

            <button type="submit" disabled={submitting} style={primaryBtnStyle}>
              {submitting ? 'Создаём…' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        <div style={footerStyle}>
          Уже есть аккаунт?{' '}
          <Link to="/login" style={linkStyle}>Войти</Link>
        </div>
      </div>
    </div>
  );
}

const shellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(ellipse at 10% 10%, rgba(177, 74, 237, 0.2) 0%, transparent 50%), radial-gradient(ellipse at 90% 90%, rgba(0, 212, 255, 0.15) 0%, transparent 50%), #0A0E27',
  color: '#eaeaea',
  padding: '24px',
  fontFamily: 'Space Grotesk, -apple-system, sans-serif',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 460,
  background: 'rgba(22, 29, 63, 0.6)',
  border: '1px solid rgba(42, 53, 102, 0.6)',
  borderRadius: 16,
  padding: '32px 28px',
  backdropFilter: 'blur(8px)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  margin: 0,
  color: '#fff',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#A0A8D0',
  margin: '8px 0 24px',
};

const refBoxStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(0, 212, 255, 0.08)',
  border: '1px solid rgba(0, 212, 255, 0.3)',
  color: '#eaeaea',
  fontSize: 13,
  marginBottom: 16,
};

const tabsWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  padding: 4,
  background: 'rgba(10, 14, 39, 0.8)',
  borderRadius: 10,
  border: '1px solid rgba(42, 53, 102, 0.6)',
  marginBottom: 20,
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '10px 14px',
  borderRadius: 8,
  border: 'none',
  background: active ? 'linear-gradient(135deg, #00D4FF 0%, #B14AED 100%)' : 'transparent',
  color: active ? '#0A0E27' : '#A0A8D0',
  fontWeight: active ? 700 : 500,
  fontSize: 14,
  cursor: 'pointer',
  transition: 'all 0.2s',
});

const tgBlockStyle: React.CSSProperties = {
  padding: '12px 0',
  minHeight: 120,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
  color: '#A0A8D0',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(42, 53, 102, 0.8)',
  background: 'rgba(10, 14, 39, 0.6)',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '14px 18px',
  borderRadius: 10,
  background: 'linear-gradient(135deg, #00D4FF 0%, #B14AED 100%)',
  color: '#0A0E27',
  fontWeight: 700,
  fontSize: 15,
  border: 'none',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255, 46, 151, 0.15)',
  color: '#FF2E97',
  fontSize: 13,
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  textAlign: 'center',
  fontSize: 14,
  color: '#A0A8D0',
};

const linkStyle: React.CSSProperties = {
  color: '#00D4FF',
  textDecoration: 'none',
  fontWeight: 600,
};
