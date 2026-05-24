import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useT } from '../i18n/LangContext';
import '../styles/dashboard.css';

function fmt(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

interface StatusResp {
  ok: boolean;
  slug: string;
  state: 'queued' | 'deploying' | 'live' | 'failed';
  created_at: string;
  deployed_at?: string;
  character: {
    name: string;
    username?: string;
    bio?: string[];
    lore?: string[];
    topics?: string[];
    adjectives?: string[];
    style?: { all?: string[]; chat?: string[]; post?: string[] };
    modelProvider?: string;
  };
  plugins: string[];
  contact?: string;
  secret_keys?: string[];
  error?: string;
}

interface Msg { role: 'user' | 'assistant'; content: string }

function AgentChat({ slug, name }: { slug: string; name: string }) {
  const t = useT();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs, pending]);

  async function send() {
    const text = input.replace(/\s+/g, ' ').trim();
    if (!text || pending) return;
    const next: Msg[] = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setInput('');
    setPending(true);

    let resp: Response | null = null;
    try {
      resp = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, messages: next }),
      });
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: t('agent_detail.chat_err_connection') }]);
      setPending(false);
      return;
    }

    if (!resp.ok || !resp.body) {
      const errText = await resp.text().catch(() => '');
      setMsgs((m) => [...m, {
        role: 'assistant',
        content: fmt(t('agent_detail.chat_err_http'), {
          status: String(resp!.status),
          text: errText || 'chat unavailable',
        }),
      }]);
      setPending(false);
      return;
    }

    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let acc = '';
    setMsgs((m) => [...m, { role: 'assistant', content: '' }]);

    let buf = '';
    let rafId: number | null = null;
    const flush = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setMsgs((m) => {
          const c = m.slice();
          c[c.length - 1] = { role: 'assistant', content: acc };
          return c;
        });
      });
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('text:')) continue;
          try { acc += decodeURIComponent(line.slice(5)); } catch { acc += line.slice(5); }
        }
        flush();
      }
      if (rafId !== null) cancelAnimationFrame(rafId);
      setMsgs((m) => {
        const c = m.slice();
        c[c.length - 1] = { role: 'assistant', content: acc };
        return c;
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat-body" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="agent-chat-empty">
            {fmt(t('agent_detail.chat_empty'), { name })}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`agent-chat-msg ${m.role}`}>
            <div className="agent-chat-bubble">
              {m.content || <span className="agent-chat-typing">·  ·  ·</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="agent-chat-input">
        <textarea
          rows={1}
          placeholder={fmt(t('agent_detail.chat_placeholder'), { name })}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={pending}
        />
        <button type="button" onClick={send} disabled={pending || !input.trim()}>
          {pending ? '…' : t('agent_detail.chat_send')}
        </button>
      </div>
    </div>
  );
}

export default function AgentDetail() {
  const t = useT();
  const { slug = '' } = useParams<{ slug: string }>();
  const [data, setData] = useState<StatusResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = `TrendeX · ${slug}`;
  }, [slug]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/agent-status?slug=${encodeURIComponent(slug)}`);
        if (!alive) return;
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          setErr(j?.error ?? `status ${res.status}`);
          return;
        }
        const j = (await res.json()) as StatusResp;
        setData(j);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  if (err) {
    return (
      <div className="dash-root">
        <main className="dash-main">
          <Link to="/app" className="agent-back">{t('agent_detail.back')}</Link>
          <div className="agent-error">{fmt(t('agent_detail.not_found'), { err })}</div>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="dash-root">
        <main className="dash-main">
          <Link to="/app" className="agent-back">{t('agent_detail.back')}</Link>
          <div className="agent-loading">{fmt(t('agent_detail.loading'), { slug })}</div>
        </main>
      </div>
    );
  }

  const c = data.character;
  return (
    <div className="dash-root">
      <main className="dash-main">
        <Link to="/app" className="agent-back">{t('agent_detail.back')}</Link>

        <header className="agent-header">
          <div className="agent-header-main">
            <div className="agent-avatar">{c.name.slice(0, 2).toUpperCase()}</div>
            <div>
              <h1 className="agent-title">{c.name}</h1>
              <div className="agent-subtitle">
                <code>{data.slug}</code>
                <span className={`my-agent-badge status-${data.state}`}>{data.state}</span>
                <span>{c.modelProvider ?? 'anthropic'}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="agent-grid">
          <section className="agent-card">
            <h2>{t('agent_detail.about')}</h2>
            {Array.isArray(c.bio) && c.bio.length > 0 && (
              <>
                <h3>{t('agent_detail.bio')}</h3>
                <ul>{c.bio.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
            {Array.isArray(c.lore) && c.lore.length > 0 && (
              <>
                <h3>{t('agent_detail.lore')}</h3>
                <ul>{c.lore.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </>
            )}
            {Array.isArray(c.topics) && c.topics.length > 0 && (
              <>
                <h3>{t('agent_detail.topics')}</h3>
                <div className="agent-tags">{c.topics.map((tag) => <span key={tag} className="agent-tag">{tag}</span>)}</div>
              </>
            )}
            {Array.isArray(c.adjectives) && c.adjectives.length > 0 && (
              <>
                <h3>{t('agent_detail.vibe')}</h3>
                <div className="agent-tags">{c.adjectives.map((a) => <span key={a} className="agent-tag">{a}</span>)}</div>
              </>
            )}
          </section>

          <section className="agent-card">
            <h2>{t('agent_detail.plugins')}</h2>
            <ul className="agent-plugins">
              {data.plugins.map((p) => (
                <li key={p}>
                  <code>{p.replace(/^@elizaos\/plugin-/, '')}</code>
                </li>
              ))}
            </ul>
            {data.secret_keys && data.secret_keys.length > 0 && (
              <>
                <h3>{t('agent_detail.secrets')}</h3>
                <ul className="agent-plugins">
                  {data.secret_keys.map((k) => (
                    <li key={k}><code>{k}</code> · <span className="agent-dim">***</span></li>
                  ))}
                </ul>
              </>
            )}
            {data.contact && (
              <>
                <h3>{t('agent_detail.contact')}</h3>
                <div className="agent-dim">{data.contact}</div>
              </>
            )}
          </section>

          <section className="agent-card agent-card-chat">
            <h2>{t('agent_detail.chat')}</h2>
            <AgentChat slug={data.slug} name={c.name} />
          </section>
        </div>
      </main>
    </div>
  );
}
