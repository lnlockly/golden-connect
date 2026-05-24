// CRM mass-send pipeline: send first message to 20-50 selected leads.
// In-memory job state (Map<jobId, JobState>), TTL 1h.
//
// Pipeline per lead:
//   1. validate (no links via regex, no obvious spam markers)
//   2. optional AI-vary via Groq (cheap rephrase keeping meaning, NO links)
//   3. mark lead as 'written' in lead-pool
//   4. call roboai-engine /api/crm/conversations/start + /:id/send via internal proxy
//   5. wait 5-15s random delay (anti-ban) → next lead
//
// Cancellation: jobs[id].cancelled = true → next iteration breaks.
// Failure: per-lead { ok, reason } collected into job.results.

const crypto = require('crypto');

const jwt = require('jsonwebtoken');
const ROBOAI_ENGINE_URL =
  process.env.ROBOAI_ENGINE_URL ||
  'http://roboai-engine.golden-connect.svc.cluster.local:3001';
const ROBOAI_JWT_SECRET = process.env.ROBOAI_JWT_SECRET;
const JWT_TTL_SECONDS = 15 * 60;

function _signEngineToken(webUser) {
  if (!ROBOAI_JWT_SECRET) throw new Error('ROBOAI_JWT_SECRET not configured');
  return jwt.sign(
    {
      sub: Number(webUser.id),
      scope: 'roboai',
      email: webUser.email || null,
      tg_id: webUser.telegramUserId ? Number(webUser.telegramUserId) : null,
      is_admin: !!webUser.isAdmin,
    },
    ROBOAI_JWT_SECRET,
    { expiresIn: JWT_TTL_SECONDS },
  );
}

// ─────────────────────────────────────────────────────────────────
// Link / URL detection — server-side guardrail. Catches:
//   - http(s):// anything
//   - t.me/* tg://*
//   - bare domains with TLD (.com .ru .io .ai .me)
//   - sneaky cyrillic homoglyph variants (basic)
//   - shortened forms (bit.ly, tinyurl)
// ─────────────────────────────────────────────────────────────────
const LINK_REGEX = /(https?:\/\/|t\.me\/|tg:\/\/|telegra\.ph|bit\.ly|tinyurl\.com|t\.co\/|\b[a-z][a-z0-9-]*\.(com|net|org|io|ai|me|biz|info|ru|ua|kz|by|us|app|xyz|club|shop|store|online|tech|dev|cloud|tg|link|page)\b)/i;

function hasLink(text) {
  if (!text || typeof text !== 'string') return false;
  return LINK_REGEX.test(text);
}

// ─────────────────────────────────────────────────────────────────
// Groq variation — cheap rephrase that keeps meaning, varies opening,
// word-order, light synonyms. Strict: NO links, NO emoji-spam, max
// length 600 chars. Falls back to original on any failure.
// ─────────────────────────────────────────────────────────────────
const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
let _groqIdx = 0;
function _nextGroqKey() {
  if (!GROQ_KEYS.length) return null;
  const k = GROQ_KEYS[_groqIdx % GROQ_KEYS.length];
  _groqIdx++;
  return k;
}

async function varyMessage(baseText, recipientName) {
  if (!GROQ_KEYS.length) return baseText;
  const key = _nextGroqKey();
  if (!key) return baseText;
  const prompt = `Перефразируй сообщение СОХРАНЯЯ смысл и тон. Допустимы:
- разное приветствие (Привет / Здравствуй / Добрый день / etc.)
- лёгкие синонимы
- изменение порядка фраз
Запрещено:
- добавлять ссылки, домены, @username
- добавлять эмодзи, если их не было в оригинале
- менять суть предложения
- делать сообщение длиннее оригинала более чем на 20%
- ставить любые URL

Адресат: ${recipientName || '(имя неизвестно)'}.
Оригинал:
"""
${baseText}
"""
Верни ТОЛЬКО перефразированный текст, без кавычек, без объяснений.`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.GROQ_VARY_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'Ты переписываешь сообщения. Лаконичные ответы без преамбулы.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    clearTimeout(timer);
    if (!r.ok) return baseText;
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content?.trim();
    if (!txt || txt.length < 5) return baseText;
    if (hasLink(txt)) {
      console.warn('[mass-send] AI variation included a link, falling back to original');
      return baseText;
    }
    if (txt.length > baseText.length * 1.4 + 50) return baseText; // hallucinated extra content
    return txt;
  } catch (e) {
    return baseText;
  }
}

// ─────────────────────────────────────────────────────────────────
// Job state
// ─────────────────────────────────────────────────────────────────
const JOBS = new Map(); // jobId → state
const JOB_TTL_MS = 60 * 60 * 1000;

function _genJobId() { return crypto.randomBytes(8).toString('hex'); }

function _gcJobs() {
  const now = Date.now();
  for (const [id, j] of JOBS) {
    if (now - j.createdAt > JOB_TTL_MS) JOBS.delete(id);
  }
}

// ─────────────────────────────────────────────────────────────────
// Forward to engine — same JWT scheme as roboai.js proxy uses.
// ─────────────────────────────────────────────────────────────────
async function _engineCall(path, body, webUser) {
  const url = ROBOAI_ENGINE_URL.replace(/\/+$/, '') + path;
  const token = _signEngineToken(webUser);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify(body || {}),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: j };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
// Public API: start a mass-send job
// ─────────────────────────────────────────────────────────────────
async function startJob({ webUser, leads, messageTemplate, aiVariation, leadPool }) {
  const userId = webUser && webUser.id;
  if (!Array.isArray(leads) || leads.length === 0) {
    throw new Error('leads array required');
  }
  if (leads.length > 100) throw new Error('max 100 leads per job');
  if (!messageTemplate || typeof messageTemplate !== 'string' || messageTemplate.trim().length < 4) {
    throw new Error('message_template too short');
  }
  if (hasLink(messageTemplate)) {
    throw new Error('message contains a link — links are forbidden in mass-send');
  }

  _gcJobs();
  const jobId = _genJobId();
  const state = {
    jobId,
    userId,
    createdAt: Date.now(),
    leads: leads.slice(0),
    messageTemplate: messageTemplate.trim(),
    aiVariation: aiVariation !== false,
    cancelled: false,
    completed: 0,
    failed: 0,
    skipped: 0,
    results: [],
    currentStage: 'queued',
    finishedAt: null,
  };
  JOBS.set(jobId, state);

  state.webUser = webUser;
  // Fire-and-forget runner
  setImmediate(() => _runJob(state, leadPool).catch((e) => {
    state.error = e.message;
    state.finishedAt = Date.now();
    console.error('[mass-send-runner]', e.message);
  }));

  return { ok: true, jobId, total: leads.length };
}

async function _runJob(state, leadPool) {
  state.currentStage = 'running';
  for (let i = 0; i < state.leads.length; i++) {
    if (state.cancelled) { state.currentStage = 'cancelled'; break; }
    const lead = state.leads[i];
    const slot = { index: i, lead: lead.username || lead.name || lead.leadId, ok: false, reason: null };

    try {
      // Variation
      let text = state.messageTemplate;
      if (state.aiVariation) {
        text = await varyMessage(text, lead.name || lead.username);
      }
      // Belt-and-suspenders: re-check no links in final text
      if (hasLink(text)) { slot.reason = 'link_in_text'; state.skipped++; state.results.push(slot); continue; }

      // Start conversation in engine
      const startRes = await _engineCall(
        '/api/crm/conversations/start',
        {
          target_tg_username: lead.username || null,
          target_tg_id: lead.tg_id ? String(lead.tg_id) : null,
          target_name: lead.name || null,
          person_id: lead.person_id || null,
        },
        state.webUser,
      );
      if (!startRes.ok || !startRes.body || !startRes.body.id) {
        slot.reason = 'start_failed: ' + (startRes.body && startRes.body.reason || startRes.status);
        state.failed++; state.results.push(slot); continue;
      }
      const convId = startRes.body.id;

      // Send first message
      const sendRes = await _engineCall(
        `/api/crm/conversations/${convId}/send`,
        { text },
        state.webUser,
      );
      if (!sendRes.ok) {
        slot.reason = 'send_failed: ' + (sendRes.body && sendRes.body.reason || sendRes.status);
        state.failed++; state.results.push(slot); continue;
      }

      // Mark in lead-pool as written (permanent attribution)
      try {
        if (leadPool && lead.leadId) leadPool.markWritten(state.userId, lead.leadId);
      } catch (_) {}

      slot.ok = true;
      slot.convId = convId;
      slot.finalText = text.slice(0, 200);
      state.completed++;
      state.results.push(slot);
    } catch (e) {
      slot.reason = e.message;
      state.failed++;
      state.results.push(slot);
    }

    // Anti-ban: random 5-15s delay between leads (skip on last)
    if (i < state.leads.length - 1) {
      const delay = 5000 + Math.floor(Math.random() * 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  if (!state.cancelled) state.currentStage = 'completed';
  state.finishedAt = Date.now();
}

function getStatus(jobId) {
  const j = JOBS.get(jobId);
  if (!j) return { ok: false, reason: 'not_found' };
  return {
    ok: true,
    jobId: j.jobId,
    total: j.leads.length,
    completed: j.completed,
    failed: j.failed,
    skipped: j.skipped,
    cancelled: j.cancelled,
    stage: j.currentStage,
    started_at: new Date(j.createdAt).toISOString(),
    finished_at: j.finishedAt ? new Date(j.finishedAt).toISOString() : null,
    results: j.results.slice(-30), // tail
    progress_pct: j.leads.length > 0 ? Math.round((j.completed + j.failed + j.skipped) * 100 / j.leads.length) : 0,
  };
}

function cancel(jobId) {
  const j = JOBS.get(jobId);
  if (!j) return { ok: false, reason: 'not_found' };
  j.cancelled = true;
  return { ok: true };
}

module.exports = { startJob, getStatus, cancel, hasLink, varyMessage };
