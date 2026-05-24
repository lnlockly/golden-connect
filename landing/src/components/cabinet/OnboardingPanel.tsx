import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../../lib/api';
import { TgLoginButton } from './TgLoginButton';

interface OnboardingResp {
  ok: boolean;
  profile: {
    first_name: string | null;
    last_name: string | null;
    country: string | null;
    language_code: string | null;
    bio: string | null;
    avatar_url: string | null;
  };
  status: {
    profile_done: boolean;
    channels_done: boolean;
    verify_done: boolean;
    email: string | null;
    email_verified: boolean;
    has_telegram: boolean;
    tg_username: string | null;
  };
  steps_done: number;
  steps_total: number;
}

// Placeholder channel list — owner (Артём) provides final URLs later.
// Until then we show what's planned and let user skip.
const CHANNELS: { url: string; label: string; note?: string }[] = [
  { url: '#', label: 'Канал Golden Connect (новости)', note: 'ссылка появится после запуска' },
  { url: '#', label: 'Чат сообщества', note: 'ссылка появится после запуска' },
];

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  // apiPost exists but there is no apiPatch helper — inline a tiny one using fetch.
  // Mirrors api.ts BASE_URL + same credentials/cookie behaviour.
  const baseUrl =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
    'http://localhost:4000';
  const token = localStorage.getItem('af_session');
  const res = await fetch(baseUrl + path, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ': ' + text);
  }
  return (await res.json()) as T;
}

export function OnboardingPanel() {
  const [params] = useSearchParams();
  const [data, setData] = useState<OnboardingResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(() => {
    // Auto-open step 1 when coming from signup.
    if (params.get('onboarding') === '1') return 1;
    if (params.get('verified') === '1') return 3;
    return null;
  });

  const refresh = useCallback(async () => {
    try {
      const r = await apiGet<OnboardingResp>('/me/onboarding');
      setData(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // When all 3 done — collapse everything.
  useEffect(() => {
    if (data && data.steps_done === data.steps_total) setExpanded(null);
  }, [data]);

  if (error) {
    return (
      <div style={errorBoxStyle}>
        Не получилось загрузить статус онбординга: {error}
      </div>
    );
  }
  if (!data) return <div style={panelStyle}>Загрузка…</div>;

  const allDone = data.steps_done === data.steps_total;

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Панель управления</h2>
          <a
            href="/cabinet/#/dashboard"
            style={{
              display: 'block',
              margin: '14px 0 18px',
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #FFB800 0%, #FF2E97 100%)',
              color: '#0a0a0f',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '16px',
              borderRadius: '14px',
              textAlign: 'center',
              boxShadow: '0 8px 24px rgba(255, 46, 151, 0.35)',
            }}
          >
            🚀 Перейти в полный кабинет (AI-CRM, рассылки, биллинг)
            <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '4px', opacity: 0.85 }}>
              Онбординг можно закончить позже — он сохранится
            </div>
          </a>
          <p style={subStyle}>
            {allDone ? 'Все шаги пройдены — добро пожаловать в Golden Connect!' : `Пройдено ${data.steps_done} из ${data.steps_total} шагов`}
          </p>
        </div>
        <div style={progressRingStyle(data.steps_done, data.steps_total)}>
          <span style={progressNumStyle}>{data.steps_done}/{data.steps_total}</span>
        </div>
      </div>

      <div style={stepsStyle}>
        <Step
          num={1}
          title="Заполнить профиль"
          done={data.status.profile_done}
          expanded={expanded === 1}
          onToggle={() => setExpanded(expanded === 1 ? null : 1)}
        >
          <ProfileForm profile={data.profile} onSaved={refresh} />
        </Step>

        <Step
          num={2}
          title="Подписаться на каналы и чаты"
          done={data.status.channels_done}
          expanded={expanded === 2}
          onToggle={() => setExpanded(expanded === 2 ? null : 2)}
        >
          <ChannelsBlock done={data.status.channels_done} onDone={refresh} />
        </Step>

        <Step
          num={3}
          title="Подтвердить почту и подключить Telegram"
          done={data.status.verify_done}
          expanded={expanded === 3}
          onToggle={() => setExpanded(expanded === 3 ? null : 3)}
        >
          <VerifyBlock status={data.status} onRefresh={refresh} />
        </Step>
      </div>
    </div>
  );
}

/* ============================== Step shell ============================== */

interface StepProps {
  num: number;
  title: string;
  done: boolean;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function Step({ num, title, done, expanded, onToggle, children }: StepProps) {
  return (
    <div style={stepWrapStyle(done, expanded)}>
      <button type="button" onClick={onToggle} style={stepHeaderBtnStyle(done, expanded)}>
        <span style={stepNumStyle(done)}>{done ? '✓' : num}</span>
        <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, color: done ? '#A0A8D0' : '#fff' }}>
          {title}
        </span>
        <span style={{ color: '#6E7BAF', fontSize: 13 }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded ? <div style={stepBodyStyle}>{children}</div> : null}
    </div>
  );
}

/* ============================== Step 1: Profile ============================== */

function ProfileForm({ profile, onSaved }: { profile: OnboardingResp['profile']; onSaved: () => Promise<void> }) {
  const [firstName, setFirstName] = useState(profile.first_name ?? '');
  const [lastName, setLastName] = useState(profile.last_name ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [lang, setLang] = useState(profile.language_code ?? 'ru');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await apiPatch('/me/profile', {
        first_name: firstName || null,
        last_name: lastName || null,
        country: country || null,
        language_code: lang || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="avatar" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', alignSelf: 'center', border: '2px solid rgba(0, 212, 255, 0.3)' }} />
      ) : null}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Имя *">
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required maxLength={80} style={inputStyle} placeholder="Иван" />
        </Field>
        <Field label="Фамилия">
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} style={inputStyle} placeholder="Иванов" />
        </Field>
        <Field label="Страна *">
          <input value={country} onChange={(e) => setCountry(e.target.value)} required maxLength={60} style={inputStyle} placeholder="Россия" />
        </Field>
        <Field label="Язык *">
          <select value={lang} onChange={(e) => setLang(e.target.value)} required style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="ru">Русский</option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="uz">O'zbekcha</option>
            <option value="pt">Português</option>
            <option value="zh">中文</option>
            <option value="vi">Tiếng Việt</option>
            <option value="hi">हिन्दी</option>
          </select>
        </Field>
      </div>
      <Field label="Ссылка на аватар (URL изображения)">
        <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} type="url" maxLength={500} style={inputStyle} placeholder="https://example.com/photo.jpg" />
      </Field>
      <Field label="О себе">
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} rows={4} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Немного о себе, опыте, интересах…" />
      </Field>
      {err ? <div style={errorBoxStyle}>{err}</div> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {saved ? <span style={{ color: '#00FF94', fontSize: 13 }}>✓ Сохранено</span> : null}
      </div>
    </form>
  );
}

/* ============================== Step 2: Channels ============================== */

function ChannelsBlock({ done, onDone }: { done: boolean; onDone: () => Promise<void> }) {
  const [submitting, setSubmitting] = useState(false);
  const confirm = async () => {
    setSubmitting(true);
    try {
      await apiPost('/me/channels-joined');
      await onDone();
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, color: '#A0A8D0', fontSize: 14 }}>
        Подпишитесь на наши каналы и чаты, чтобы получать новости и общаться с сообществом.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {CHANNELS.map((ch, i) => (
          <div key={i} style={channelItemStyle}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>{ch.label}</div>
              {ch.note ? <div style={{ color: '#6E7BAF', fontSize: 12 }}>{ch.note}</div> : null}
            </div>
            {ch.url && ch.url !== '#' ? (
              <a href={ch.url} target="_blank" rel="noreferrer" style={tgLinkBtnStyle}>Открыть</a>
            ) : (
              <span style={{ color: '#6E7BAF', fontSize: 12 }}>скоро</span>
            )}
          </div>
        ))}
      </div>
      {done ? (
        <div style={{ color: '#00FF94', fontSize: 14 }}>✓ Вы подтвердили подписку</div>
      ) : (
        <button type="button" onClick={confirm} disabled={submitting} style={primaryBtnStyle}>
          {submitting ? 'Отмечаем…' : 'Я подписался / пропустить'}
        </button>
      )}
    </div>
  );
}

/* ============================== Step 3: Verify + TG ============================== */

function VerifyBlock({ status, onRefresh }: { status: OnboardingResp['status']; onRefresh: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  const sendVerify = async () => {
    setSending(true);
    setErr(null);
    try {
      const r = await apiPost<{ ok: boolean; sent: boolean; dev_link?: string; already?: boolean }>('/auth/send-verify');
      setSent(true);
      if (r.dev_link) setDevLink(r.dev_link);
      if (r.already) await onRefresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Email verify */}
      <div style={verifyRowStyle}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>Подтверждение email</div>
          <div style={{ color: '#6E7BAF', fontSize: 12, marginTop: 2 }}>
            {status.email ?? 'email не привязан'} — {status.email_verified ? '✓ подтверждён' : 'не подтверждён'}
          </div>
        </div>
        {status.email_verified ? (
          <span style={{ color: '#00FF94', fontSize: 13 }}>✓</span>
        ) : status.email ? (
          <button type="button" onClick={sendVerify} disabled={sending || sent} style={secondaryBtnStyle}>
            {sending ? 'Отправка…' : sent ? 'Отправлено' : 'Отправить письмо'}
          </button>
        ) : null}
      </div>
      {devLink ? (
        <div style={{ ...errorBoxStyle, background: 'rgba(255, 184, 0, 0.1)', borderColor: 'rgba(255, 184, 0, 0.4)', color: '#FFB800', fontSize: 12 }}>
          [DEV] SMTP не настроен. Ссылка для верификации: <a href={devLink} style={{ color: '#FFB800' }}>открыть</a>
        </div>
      ) : null}

      {/* TG link */}
      <div style={verifyRowStyle}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#fff', fontSize: 14 }}>Привязка Telegram</div>
          <div style={{ color: '#6E7BAF', fontSize: 12, marginTop: 2 }}>
            {status.has_telegram
              ? (status.tg_username ? '✓ привязан @' + status.tg_username : '✓ привязан')
              : 'не привязан'}
          </div>
        </div>
        {status.has_telegram ? (
          <span style={{ color: '#00FF94', fontSize: 13 }}>✓</span>
        ) : (
          <TgLoginButton mode="link" label="Привязать" />
        )}
      </div>

      {err ? <div style={errorBoxStyle}>{err}</div> : null}
    </div>
  );
}

/* ============================== atoms ============================== */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#A0A8D0' }}>
      {label}
      {children}
    </label>
  );
}

/* ============================== styles ============================== */

const panelStyle: React.CSSProperties = {
  background: 'rgba(22, 29, 63, 0.6)',
  border: '1px solid rgba(42, 53, 102, 0.6)',
  borderRadius: 16,
  padding: '24px',
  marginBottom: 24,
  color: '#fff',
  fontFamily: 'Space Grotesk, -apple-system, sans-serif',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 20,
  gap: 16,
};

const titleStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  margin: 0,
  background: 'linear-gradient(135deg, #00D4FF, #B14AED)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};

const subStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#A0A8D0',
  margin: '4px 0 0',
};

const progressRingStyle = (done: number, total: number): React.CSSProperties => ({
  width: 64,
  height: 64,
  borderRadius: '50%',
  background:
    done === total
      ? 'conic-gradient(#00FF94 0deg 360deg)'
      : `conic-gradient(#00D4FF ${(done / total) * 360}deg, rgba(42,53,102,0.8) ${(done / total) * 360}deg 360deg)`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  flexShrink: 0,
});

const progressNumStyle: React.CSSProperties = {
  background: '#161D3F',
  width: 50,
  height: 50,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 13,
  color: '#fff',
};

const stepsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const stepWrapStyle = (done: boolean, expanded: boolean): React.CSSProperties => ({
  background: done ? 'rgba(0, 255, 148, 0.04)' : 'rgba(10, 14, 39, 0.6)',
  border: '1px solid ' + (done ? 'rgba(0, 255, 148, 0.3)' : expanded ? 'rgba(0, 212, 255, 0.4)' : 'rgba(42, 53, 102, 0.6)'),
  borderRadius: 12,
  overflow: 'hidden',
  transition: 'all 0.2s',
});

const stepHeaderBtnStyle = (done: boolean, _expanded: boolean): React.CSSProperties => ({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '14px 16px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: '#fff',
  fontSize: 15,
  // subtle highlight on done
  opacity: done ? 0.85 : 1,
});

const stepNumStyle = (done: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: done ? '#00FF94' : 'linear-gradient(135deg, #00D4FF, #B14AED)',
  color: '#0A0E27',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  fontSize: 14,
  flexShrink: 0,
});

const stepBodyStyle: React.CSSProperties = {
  padding: '0 16px 16px 16px',
  borderTop: '1px solid rgba(42, 53, 102, 0.4)',
  paddingTop: 16,
};

const inputStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid rgba(42, 53, 102, 0.8)',
  background: 'rgba(10, 14, 39, 0.8)',
  color: '#fff',
  fontSize: 14,
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, #00D4FF 0%, #B14AED 100%)',
  color: '#0A0E27',
  fontWeight: 700,
  fontSize: 14,
  border: 'none',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  background: 'transparent',
  color: '#00D4FF',
  fontWeight: 600,
  fontSize: 13,
  border: '1px solid #00D4FF',
  cursor: 'pointer',
};

const errorBoxStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  background: 'rgba(255, 46, 151, 0.1)',
  border: '1px solid rgba(255, 46, 151, 0.3)',
  color: '#FF2E97',
  fontSize: 13,
};

const channelItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 12px',
  background: 'rgba(10, 14, 39, 0.6)',
  border: '1px solid rgba(42, 53, 102, 0.6)',
  borderRadius: 8,
};

const tgLinkBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  background: '#229ED9',
  color: '#fff',
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};

const verifyRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 14px',
  background: 'rgba(10, 14, 39, 0.6)',
  border: '1px solid rgba(42, 53, 102, 0.6)',
  borderRadius: 8,
};
