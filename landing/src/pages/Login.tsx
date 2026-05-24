import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { TgLoginButton } from '../components/cabinet/TgLoginButton';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // If we're already authed (cookie is live), skip the form entirely.
  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/cabinet', { replace: true });
  }, [isLoading, isAuthenticated, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/cabinet', { replace: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={shellStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Вход в Golden Connect</h1>
        <p style={subtitleStyle}>
          Войдите, чтобы забронировать место до запуска.
        </p>

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
              autoComplete="current-password"
              minLength={6}
              style={inputStyle}
              placeholder="••••••••"
            />
          </label>

          {error ? <div style={errorStyle}>{error}</div> : null}

          <button type="submit" disabled={submitting} style={primaryBtnStyle}>
            {submitting ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <div style={dividerStyle}>
          <span>или</span>
        </div>

        <TgLoginButton />

        <div style={footerStyle}>
          Нет аккаунта?{' '}
          <Link to="/signup" style={linkStyle}>
            Зарегистрироваться
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
  maxWidth: 420,
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '32px 28px',
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 700,
  margin: 0,
  color: '#fff',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#9aa0a6',
  margin: '8px 0 24px',
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
  color: '#9aa0a6',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.3)',
  color: '#fff',
  fontSize: 15,
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  marginTop: 4,
  padding: '12px 18px',
  borderRadius: 10,
  background: '#d4ff00',
  color: '#0a0a0a',
  fontWeight: 700,
  fontSize: 15,
  border: 'none',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(209,67,67,0.15)',
  color: '#ff9a9a',
  fontSize: 13,
};

const dividerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '20px 0 16px',
  color: '#6b6759',
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  textAlign: 'center',
  justifyContent: 'center',
};

const footerStyle: React.CSSProperties = {
  marginTop: 20,
  textAlign: 'center',
  fontSize: 14,
  color: '#9aa0a6',
};

const linkStyle: React.CSSProperties = {
  color: '#d4ff00',
  textDecoration: 'none',
  fontWeight: 600,
};
