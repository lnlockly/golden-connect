import { Link } from 'react-router-dom';

interface Props {
  // Optional `mode` forwarded to the TG-login page. Callers from inside
  // the cabinet pass `mode=link` so the TG id is attached to the current
  // account instead of creating a new one. Unauth login callers leave it
  // blank.
  mode?: 'link';
  label?: string;
}

export function TgLoginButton({ mode, label }: Props) {
  const href = mode ? `/tg-login?mode=${mode}` : '/tg-login';
  return (
    <Link
      to={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '12px 18px',
        borderRadius: 10,
        background: '#229ED9',
        color: '#fff',
        fontWeight: 600,
        fontSize: 15,
        textDecoration: 'none',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
      </svg>
      {label ?? (mode === 'link' ? 'Привязать Telegram' : 'Войти через Telegram')}
    </Link>
  );
}
