/**
 * Order / application intake.
 *
 * Three shapes of incoming payload, distinguished by `track`:
 *
 *   - **Order (default):**    { task, budget (≥$10), deadline, contact }
 *   - **Operator application:** { track:'operator', name, stack, portfolio,
 *                                 ai_experience, availability, stake_ready,
 *                                 contact }
 *   - **Learner application:**  { track:'learner', name, goal, background,
 *                                 level, hours_per_week, language_pref,
 *                                 contact }
 *
 * Contact is the only field required across all tracks.
 *
 * Delivery. Two mutually compatible delivery paths, both enabled
 * purely through env vars:
 *
 *   A. **Direct Telegram.** If `TG_BOT_TOKEN` + `TG_CHAT_ID` are set
 *      we POST sendMessage straight to Bot API. Each track can land
 *      in its own forum topic via `TG_TOPIC_ORDER` /
 *      `TG_TOPIC_OPERATOR` / `TG_TOPIC_LEARNER` (integer thread ids).
 *      If a topic id isn't set, the message goes to the chat's root.
 *
 *   B. **Webhook forward.** If `TG_BOT_WEBHOOK_URL` is set we also
 *      POST the structured JSON to it (optionally with a shared
 *      secret header). Useful if a bot server wants to do its own
 *      thing (enrichment, CRM, moderation queue).
 *
 * Both paths run in parallel. If either one fails we still return
 * 200 as long as the other succeeded. If *both* fail we 502.
 * If neither is configured we still return 200 and just log, so
 * the landing doesn't show an error to the visitor while the
 * infra is being wired up.
 */

interface OrderBody {
  // Common
  contact?: string;
  lang?: string;
  source?: string;
  transcript?: unknown;

  // Default (client order)
  task?: string;
  budget?: number | string;
  deadline?: string;

  // Track applications
  track?: 'operator' | 'learner' | 'investor';
  name?: string;
  // operator
  stack?: string;
  portfolio?: string;
  ai_experience?: string;
  availability?: string;
  stake_ready?: string;
  // learner
  goal?: string;
  background?: string;
  level?: string;
  hours_per_week?: string;
  language_pref?: string;
  // investor
  ticket_size?: string;
  thesis?: string;
}

const MIN_BUDGET = 10;

function str(v: unknown, max = 1000): string {
  return (v == null ? '' : String(v)).trim().slice(0, max);
}

/** Wrap a value in a code-like span for HTML parse-mode. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatMessage(p: Record<string, unknown>): string {
  const track = String(p.track ?? 'order');
  const lang  = String(p.lang  ?? 'en');
  const src   = String(p.source ?? 'chat');

  const HEADER: Record<string, string> = {
    order:    '🟢 <b>Новый заказ</b>',
    operator: '🟡 <b>Новая заявка — оператор</b>',
    learner:  '🔵 <b>Новая заявка — обучение</b>',
    investor: '🟣 <b>Новая заявка — инвестор</b>',
  };

  const rows: string[] = [HEADER[track] ?? `📥 <b>Заявка (${esc(track)})</b>`, ''];

  const add = (label: string, v: unknown) => {
    const s = str(v, 2000);
    if (s) rows.push(`<b>${esc(label)}:</b> ${esc(s)}`);
  };

  if (track === 'order') {
    add('Задача', p.task);
    add('Бюджет', p.budget ? `$${p.budget}` : '');
    add('Срок', p.deadline);
  } else if (track === 'operator') {
    add('Имя', p.name);
    add('Стек', p.stack);
    add('Портфолио', p.portfolio);
    add('AI опыт', p.ai_experience);
    add('Часов/нед', p.availability);
    add('Готов стейкать', p.stake_ready);
  } else if (track === 'learner') {
    add('Имя', p.name);
    add('Цель', p.goal);
    add('Бэкграунд', p.background);
    add('Уровень', p.level);
    add('Часов/нед', p.hours_per_week);
    add('Язык обучения', p.language_pref);
  } else if (track === 'investor') {
    add('Имя / фонд', p.name);
    add('Тикет', p.ticket_size);
    add('Тезис', p.thesis);
  }

  add('Контакт', p.contact);
  rows.push('', `<i>${esc(src)} · ${esc(lang)} · ${new Date().toISOString()}</i>`);
  return rows.join('\n');
}

async function sendTelegram(payload: Record<string, unknown>): Promise<string | null> {
  const token = process.env.TG_BOT_TOKEN;
  const chatId = process.env.TG_CHAT_ID;
  if (!token || !chatId) return 'telegram: token or chat_id missing';

  const track = String(payload.track ?? 'order');
  const topicEnv =
    track === 'operator' ? process.env.TG_TOPIC_OPERATOR
    : track === 'learner' ? process.env.TG_TOPIC_LEARNER
    : track === 'investor' ? process.env.TG_TOPIC_INVESTOR
    : process.env.TG_TOPIC_ORDER;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: formatMessage(payload),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  const topicId = topicEnv ? Number(topicEnv) : NaN;
  if (Number.isFinite(topicId)) body.message_thread_id = topicId;

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return `telegram ${resp.status}: ${text.slice(0, 200)}`;
    }
    return null;
  } catch (err) {
    return `telegram: ${(err as Error).message || 'fetch failed'}`;
  }
}

async function sendWebhook(payload: Record<string, unknown>): Promise<string | null> {
  const url = process.env.TG_BOT_WEBHOOK_URL;
  if (!url) return 'webhook: url not set';
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.TG_BOT_WEBHOOK_SECRET
          ? { 'x-trendex-secret': process.env.TG_BOT_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) return `webhook ${resp.status}`;
    return null;
  } catch (err) {
    return `webhook: ${(err as Error).message || 'fetch failed'}`;
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 });
  }

  let body: OrderBody;
  try {
    body = (await req.json()) as OrderBody;
  } catch {
    return jsonErr(400, 'bad json');
  }

  const contact = str(body.contact, 200);
  if (contact.length < 3) return jsonErr(400, 'contact missing');

  const track = body.track;
  let payload: Record<string, unknown>;

  if (track === 'operator') {
    payload = {
      track: 'operator',
      name:          str(body.name, 200),
      stack:         str(body.stack, 500),
      portfolio:     str(body.portfolio, 500),
      ai_experience: str(body.ai_experience, 1000),
      availability:  str(body.availability, 200),
      stake_ready:   str(body.stake_ready, 100),
      contact,
    };
  } else if (track === 'learner') {
    payload = {
      track: 'learner',
      name:           str(body.name, 200),
      goal:           str(body.goal, 500),
      background:     str(body.background, 500),
      level:          str(body.level, 100),
      hours_per_week: str(body.hours_per_week, 100),
      language_pref:  str(body.language_pref, 50),
      contact,
    };
  } else if (track === 'investor') {
    payload = {
      track: 'investor',
      name:        str(body.name, 200),
      ticket_size: str(body.ticket_size, 100),
      thesis:      str(body.thesis, 1000),
      contact,
    };
  } else {
    // default client order
    const task = str(body.task, 2000);
    const budgetRaw = typeof body.budget === 'number'
      ? body.budget
      : Number(String(body.budget ?? '').replace(/[^\d.]/g, ''));

    if (task.length < 5) return jsonErr(400, 'task too short');
    if (!Number.isFinite(budgetRaw) || budgetRaw < MIN_BUDGET) {
      return jsonErr(400, `budget below $${MIN_BUDGET}`);
    }

    payload = {
      track: 'order',
      task,
      budget: Math.round(budgetRaw),
      deadline: str(body.deadline, 120),
      contact,
    };
  }

  payload.lang   = body.lang   ?? 'en';
  payload.source = body.source ?? 'chat';
  payload.ts     = new Date().toISOString();

  // Fan out to both delivery paths. We want a lead to survive if
  // one of them fails — log the errors, succeed if any one worked.
  const [tgErr, hookErr] = await Promise.all([
    sendTelegram(payload),
    sendWebhook(payload),
  ]);

  // A "missing config" is not an error — treat as no-op.
  const tgConfigured   = !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID);
  const hookConfigured = !!process.env.TG_BOT_WEBHOOK_URL;
  const tgOk   = tgConfigured   && !tgErr;
  const hookOk = hookConfigured && !hookErr;

  if ((tgConfigured || hookConfigured) && !tgOk && !hookOk) {
    return jsonErr(502, `all delivery paths failed: tg=${tgErr ?? 'ok'}; webhook=${hookErr ?? 'ok'}`);
  }

  return new Response(JSON.stringify({
    ok: true,
    track: payload.track,
    delivered: { telegram: tgOk, webhook: hookOk },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
