import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

interface InitResponse {
  ok: boolean;
  token: string;
  bot_link: string;
  expires_at?: string;
}

interface ClaimResponse {
  ok: boolean;
  pending?: boolean;
  user?: { id: number; ref_code: string; email?: string | null };
  token?: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 10 * 60 * 1000; // 10 minutes

export default function TgLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = params.get('mode'); // 'link' when adding TG to existing account
  const { refetch } = useAuth();

  const [token, setToken] = useState<string | null>(null);
  const [botLink, setBotLink] = useState<string | null>(null);
  const [status, setStatus] = useState<'initializing' | 'waiting' | 'expired' | 'error'>('initializing');
  const [error, setError] = useState<string | null>(null);

  // Ref to the deadline so the poller can self-terminate without relying
  // on React state (state updates are async — we need a synchronous read
  // inside the setTimeout callback).
  const deadlineRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Kick off the login session — single call on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await apiPost<InitResponse>('/auth/tg-login-init', mode ? { mode } : {});
        if (!active) return;
        setToken(res.token);
        setBotLink(res.bot_link);
        deadlineRef.current = Date.now() + MAX_POLL_MS;
        setStatus('waiting');
      } catch (e) {
        if (!active) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      active = false;
      cancelledRef.current = true;
    };
  }, [mode]);

  // Polling loop. Schedules itself via setTimeout (one shot at a time)
  // instead of setInterval so we can't pile up overlapping requests when
  // the API is slow.
  useEffect(() => {
    if (!token) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelledRef.current) return;
      if (deadlineRef.current !== null && Date.now() > deadlineRef.current) {
        setStatus('expired');
        return;
      }
      try {
        const res = await apiPost<ClaimResponse>('/auth/tg-login-claim', { token });
        if (cancelledRef.current) return;
        if (res.user && !res.pending) {
          // Refresh the AuthProvider state so /cabinet sees the user.
          await refetch();
          navigate('/cabinet', { replace: true });
          return;
        }
      } catch (e) {
        // Network/transient — stay in waiting state, keep polling.
        console.warn('tg-login-claim failed', e);
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [token, navigate, refetch]);

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>
          {mode === 'link' ? 'Привязка Telegram' : 'Вход через Telegram'}
        </h1>
        <p style={subtitleStyle}>
          {mode === 'link'
            ? 'Откройте бота — он привяжет Telegram к вашему аккаунту.'
            : 'Откройте бота — он войдёт за вас и вернёт на этот экран.'}
        </p>

        {status === 'initializing' ? (
          <div style={loadingStyle}>Готовим ссылку…</div>
        ) : null}

        {status === 'waiting' && botLink ? (
          <>
            <a
              href={botLink}
              target="_blank"
              rel="noopener noreferrer"
              style={tgBtnStyle}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
              </svg>
              Открыть Telegram
            </a>
            <div style={hintStyle}>
              Ждём подтверждения от бота… Эта страница обновится
              автоматически, когда вы нажмёте «Start» в боте.
            </div>
          </>
        ) : null}

        {status === 'expired' ? (
          <div style={errorStyle}>
            Время ожидания истекло. Обновите страницу, чтобы сгенерировать
            новую ссылку.
          </div>
        ) : null}

        {status === 'error' ? (
          <div style={errorStyle}>
            {error ?? 'Не удалось подготовить вход через Telegram.'}
          </div>
        ) : null}

        <div style={footerStyle}>
          <Link to="/login" style={linkStyle}>
            ← Назад ко входу
          </Link>
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
  background: '#0a0a0a',
  color: '#eaeaea',
  padding: '24px',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '32px 28px',
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 700,
  margin: 0,
  color: '#fff',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#9aa0a6',
  margin: '10px 0 24px',
};

const loadingStyle: React.CSSProperties = {
  padding: '20px',
  color: '#9aa0a6',
  fontSize: 14,
};

const tgBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: '14px 22px',
  borderRadius: 10,
  background: '#229ED9',
  color: '#fff',
  fontWeight: 600,
  fontSize: 16,
  textDecoration: 'none',
  cursor: 'pointer',
  width: '100%',
};

const hintStyle: React.CSSProperties = {
  marginTop: 18,
  fontSize: 13,
  color: '#9aa0a6',
};

const errorStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 8,
  background: 'rgba(209,67,67,0.15)',
  color: '#ff9a9a',
  fontSize: 13,
};

const footerStyle: React.CSSProperties = {
  marginTop: 24,
  fontSize: 14,
  color: '#9aa0a6',
};

const linkStyle: React.CSSProperties = {
  color: '#d4ff00',
  textDecoration: 'none',
};
