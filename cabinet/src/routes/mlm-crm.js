// cabinet/src/routes/mlm-crm.js
// API for MLM CRM (mlmbaza.com scraped database + per-owner CRM notes).
//
// Mount: app.use('/api/mlm', require('./routes/mlm-crm'));

const express = require('express');
const { authRequired } = require('../middleware/auth');
const storage = require('../services/mlm-crm-storage');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');
const { checkActiveTariff, makeRequireActiveTariff } = require('../services/tariff-gate');

const router = express.Router();
const config = require('../config');
const requireActiveTariff = makeRequireActiveTariff(config);

function ownerId(req) {
  return String(req.webUser?.id || req.user?.id || 'guest');
}

// PROBE — frontend gate. TG users (signed initData) and the unauthenticated
// "guest" sandbox are always allowed; cabinet-cookie users still go through
// the tariff check so paying customers keep seeing the paywall correctly.
// [mass-send-2026-05-19] Mass-send endpoints
const _massSend = require('../services/mass-send');

router.post('/bulk/start', authRequired, express.json(), async (req, res) => {
  try {
    const body = req.body || {};
    const leads = Array.isArray(body.leads) ? body.leads : null;
    const tmpl = body.message_template || body.text;
    if (!leads || leads.length === 0) return res.status(400).json({ ok: false, reason: 'leads_required' });
    if (!tmpl) return res.status(400).json({ ok: false, reason: 'message_required' });
    if (_massSend.hasLink(tmpl)) return res.status(400).json({ ok: false, reason: 'no_links_allowed' });

    const r = await _massSend.startJob({
      webUser: req.webUser,
      leads,
      messageTemplate: tmpl,
      aiVariation: body.ai_variation !== false,
      leadPool: req.app && req.app.locals && req.app.locals.leadPool,
    });
    return res.json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, reason: e.message });
  }
});

router.get('/bulk/status/:jobId', authRequired, (req, res) => {
  return res.json(_massSend.getStatus(req.params.jobId));
});

router.post('/bulk/cancel/:jobId', authRequired, (req, res) => {
  return res.json(_massSend.cancel(req.params.jobId));
});

// [journey-2026-05-21] Activation Journey endpoints
function _journey(req) { return req.app && req.app.locals && req.app.locals.journey; }
router.get('/journey', authRequired, (req, res) => {
  const j = _journey(req); if (!j) return res.status(503).json({ ok:false, reason:'journey_unavailable' });
  try { res.json(j.getJourney(req.webUser.id)); } catch (e) { res.status(500).json({ ok:false, reason:e.message }); }
});
router.post('/journey/sync', authRequired, express.json(), (req, res) => {
  const j = _journey(req); if (!j) return res.status(503).json({ ok:false });
  try { res.json(j.sync(req.webUser.id, req.body || {})); } catch (e) { res.status(500).json({ ok:false, reason:e.message }); }
});

// [crm-team-2026-05-20] CRM work-team endpoints
function _team(req) { return req.app && req.app.locals && req.app.locals.crmTeam; }
function _uid(req) { return req.webUser && req.webUser.id; }
function _teamErr(res, e) {
  const code = e && e.code;
  const status = code === 'forbidden' ? 403 : code === 'not_found' ? 404 : code === 'bad_request' ? 400 : 500;
  return res.status(status).json({ ok: false, reason: (e && e.message) || 'error' });
}

// claim pending invites on any team access
function _claim(req) { try { const t = _team(req); if (t && _uid(req)) t.claimPendingInvites(_uid(req)); } catch (_) {} }

router.get('/team/my', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false, reason:'team_unavailable' });
  _claim(req);
  res.json({ ok: true, teams: t.myTeams(_uid(req)) });
});
router.post('/team/create', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false, reason:'team_unavailable' });
  try { res.json(t.createTeam(_uid(req), req.body && req.body.name)); } catch (e) { _teamErr(res, e); }
});
router.get('/team/:id/members', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  if (!t.roleOf(req.params.id, _uid(req))) return res.status(403).json({ ok:false, reason:'forbidden' });
  res.json({ ok: true, members: t.listMembers(req.params.id) });
});
router.post('/team/:id/invite', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.invite(req.params.id, _uid(req), req.body && req.body.login, req.body && req.body.role)); } catch (e) { _teamErr(res, e); }
});
router.patch('/team/:id/member/:uid', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.setRole(req.params.id, _uid(req), Number(req.params.uid), req.body && req.body.role)); } catch (e) { _teamErr(res, e); }
});
router.delete('/team/:id/member/:uid', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.removeMember(req.params.id, _uid(req), Number(req.params.uid))); } catch (e) { _teamErr(res, e); }
});
router.get('/team/:id/tasks', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json({ ok: true, tasks: t.listTasks(req.params.id, _uid(req), { status: req.query.status, assignee: req.query.assignee }) }); } catch (e) { _teamErr(res, e); }
});
router.post('/team/:id/tasks', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.createTask(req.params.id, _uid(req), req.body || {})); } catch (e) { _teamErr(res, e); }
});
router.patch('/team/tasks/:tid', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.updateTask(req.params.tid, _uid(req), req.body || {})); } catch (e) { _teamErr(res, e); }
});
router.get('/team/tasks/:tid/comments', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.listComments(req.params.tid, _uid(req))); } catch (e) { _teamErr(res, e); }
});
router.post('/team/tasks/:tid/comment', authRequired, express.json(), (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json(t.addComment(req.params.tid, _uid(req), req.body && req.body.text)); } catch (e) { _teamErr(res, e); }
});
router.get('/team/:id/activity', authRequired, (req, res) => {
  const t = _team(req); if (!t) return res.status(503).json({ ok:false });
  try { res.json({ ok: true, activity: t.activity(req.params.id, _uid(req), Number(req.query.limit) || 50) }); } catch (e) { _teamErr(res, e); }
});

// [lead-pool-2026-05-19] Personal lead pool endpoints
function _getLeadPool(req) {
  // app.locals.leadPool is set in server.js
  return req.app && req.app.locals && req.app.locals.leadPool;
}
router.get('/leads/suggested', authRequired, (req, res) => {
  try {
    const lp = _getLeadPool(req);
    if (!lp) return res.status(503).json({ ok: false, reason: 'lead_pool_unavailable' });
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const r = lp.getSuggestedLeads(req.webUser.id, { limit });
    return res.json(r);
  } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
});

router.post('/leads/mark-written', authRequired, express.json(), (req, res) => {
  try {
    const lp = _getLeadPool(req);
    if (!lp) return res.status(503).json({ ok: false, reason: 'lead_pool_unavailable' });
    const leadId = String(req.body && req.body.leadId || '').trim();
    if (!leadId) return res.status(400).json({ ok: false, reason: 'leadId required' });
    return res.json(lp.markWritten(req.webUser.id, leadId));
  } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
});

router.post('/leads/mark-skipped', authRequired, express.json(), (req, res) => {
  try {
    const lp = _getLeadPool(req);
    if (!lp) return res.status(503).json({ ok: false, reason: 'lead_pool_unavailable' });
    const leadId = String(req.body && req.body.leadId || '').trim();
    if (!leadId) return res.status(400).json({ ok: false, reason: 'leadId required' });
    return res.json(lp.markSkipped(req.webUser.id, leadId));
  } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
});

router.get('/leads/stats', authRequired, (req, res) => {
  try {
    const lp = _getLeadPool(req);
    if (!lp) return res.status(503).json({ ok: false, reason: 'lead_pool_unavailable' });
    return res.json(lp.stats());
  } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
});

router.get('/access-check', async (req, res) => {
  if (req.tgUser) return res.json({ ok: true, viaTg: true, ownerId: ownerId(req) });
  if (!req.webUser || !req.webUser.id) return res.json({ ok: true, isGuest: true, ownerId: 'guest' });
  const r = await checkActiveTariff(req.webUser, { email: req.webUser?.email, config });
  return res.json({ ok: !!r.ok, ...r });
});

// (global paywall удалён — read-endpoints открыты, write-only под auth selectively)

router.get('/contacts', (req, res) => {
  try {
    const filters = (req.query.filter || req.query.filters || '')
      .toString().split(',').map(s => s.trim()).filter(Boolean);
    const result = storage.listContacts({
      ownerId: ownerId(req),
      sort: req.query.sort,
      filters,
      q: req.query.q,
      status: req.query.status,
      companyId: req.query.company_id,
      category: req.query.category,
      country: req.query.country,
      city: req.query.city,
      offer: req.query.offer || (req.query.sort === 'ai' ? storage.getSettings(ownerId(req)).defaultOffer : undefined),
      offset: req.query.offset,
      limit: req.query.limit,
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

router.get('/contacts/:username', (req, res) => {
  const c = storage.getContact(req.params.username, ownerId(req));
  if (!c) return res.status(404).json({ ok: false, reason: 'not_found' });
  res.json({ ok: true, contact: c });
});

router.put('/contacts/:username/crm', express.json(), (req, res) => {
  const allowed = ['status', 'needs', 'nextCall', 'notes'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  const note = storage.setNote(ownerId(req), req.params.username, patch);
  res.json({ ok: true, crm: note });
});

router.post('/contacts/:username/history', express.json(), (req, res) => {
  const { msg, direction = 'out' } = req.body || {};
  if (!msg) return res.status(400).json({ ok: false, reason: 'msg_required' });
  const note = storage.appendHistory(ownerId(req), req.params.username, { msg: String(msg).slice(0, 4000), direction });
  res.json({ ok: true, crm: note });
});

// Generate a personalized pitch via Groq.
router.post('/contacts/:username/generate-pitch', authRequired, express.json(), async (req, res) => {
  try {
    const c = storage.getContact(req.params.username, ownerId(req));
    if (!c) return res.status(404).json({ ok: false, reason: 'not_found' });
    const myOffer = String(req.body?.offer || '').slice(0, 2000) || 'Golden Connect — рекламная платформа с 4 способами заработка (биржа, партнёрка 10 уровней, кампании, маркетплейс) и мгновенными выплатами';
    const tone = req.body?.tone || 'warm';
    const lang = req.body?.lang || (c.country && /russi|рф|россия|украин|беларус|казах|молдов/i.test(c.country) ? 'ru' : 'ru');

    const groqKeys = getGroqKeys(req.app.locals.config || {});
    if (!groqKeys.length) return res.status(500).json({ ok: false, reason: 'groq_not_configured' });

    const note = c.crm || {};
    const sysPrompt = lang === 'en'
      ? 'You write short, warm, personal cold-outreach messages for B2B partnerships. 3-5 sentences. No sales clichés. Use the recipient\'s context (company, city, description) to be specific. Reply ONLY with the message text.'
      : 'Ты пишешь короткие тёплые личные сообщения для холодного аутрича по партнёрствам B2B. 3-5 предложений. Без штампов и канцелярита. Используй контекст получателя (компания, город, описание) чтобы быть конкретным. Отвечай ТОЛЬКО текстом сообщения, без префиксов.';

    const userPrompt = [
      lang === 'en' ? 'Recipient:' : 'Получатель:',
      `- ${lang === 'en' ? 'Name' : 'Имя'}: ${c.name || c.username}`,
      c.company ? `- ${lang === 'en' ? 'Company' : 'Компания'}: ${c.company}` : '',
      c.country ? `- ${lang === 'en' ? 'Country' : 'Страна'}: ${c.country}` : '',
      c.city ? `- ${lang === 'en' ? 'City' : 'Город'}: ${c.city}` : '',
      c.description ? `- ${lang === 'en' ? 'About' : 'О себе'}: ${String(c.description).slice(0, 700)}` : '',
      note.needs ? `- ${lang === 'en' ? 'Their known needs' : 'Известные потребности'}: ${note.needs}` : '',
      '',
      lang === 'en' ? 'My offer:' : 'Моё предложение:',
      myOffer,
      '',
      lang === 'en' ? 'Tone: ' + tone : 'Тон: ' + tone,
    ].filter(Boolean).join('\n');

    const r = await requestGroqChatCompletion([
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userPrompt },
    ], { groqKeys, maxTokens: 350, temperature: 0.85, model: 'llama-3.3-70b-versatile' });

    const text = (r?.choices?.[0]?.message?.content || '').trim();
    res.json({ ok: true, pitch: text });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});



// Per-owner dashboard summary
router.get('/dashboard', (req, res) => {
  res.json({ ok: true, dashboard: storage.getDashboard(ownerId(req)) });
});

// Daily batch — что обработать сегодня (запланированные созвоны + приоритетные новые)
router.get('/today', (req, res) => {
  res.json({ ok: true, batch: storage.getDailyBatch(ownerId(req)) });
});

// Auto-track share-click — фиксирует что нажали поделиться через мессенджер
router.post('/contacts/:username/share-click', express.json(), (req, res) => {
  const channel = String(req.body?.channel || 'unknown').slice(0, 20);
  const note = storage.trackShareClick(ownerId(req), req.params.username, channel);
  res.json({ ok: true, crm: note });
});


// L2 — Calendar (запланированные созвоны)
router.get('/calendar', (req, res) => {
  const range = String(req.query.range || 'week');
  res.json({ ok: true, items: storage.getCalendar(ownerId(req), range) });
});

// L2 — Tags
router.put('/contacts/:username/tags', express.json(), (req, res) => {
  const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
  storage.setTags(ownerId(req), req.params.username, tags);
  res.json({ ok: true, tags });
});

// L2 — Company notes (общие заметки на всю компанию)
router.get('/companies/:id/notes', (req, res) => {
  res.json({ ok: true, notes: storage.getCompanyNotes(ownerId(req), req.params.id) });
});
router.put('/companies/:id/notes', express.json(), (req, res) => {
  const notes = String(req.body?.notes || '');
  res.json({ ok: true, notes: storage.setCompanyNotes(ownerId(req), req.params.id, notes) });
});

// L2 — Auto-enrich «Потребности» через Groq из описания контакта
router.post('/contacts/:username/enrich-needs', authRequired, express.json(), async (req, res) => {
  try {
    const c = storage.getContact(req.params.username, ownerId(req));
    if (!c) return res.status(404).json({ ok: false, reason: 'not_found' });
    if (!c.description) return res.json({ ok: true, needs: '' });
    const groqKeys = getGroqKeys(req.app.locals.config || {});
    if (!groqKeys.length) return res.status(500).json({ ok: false, reason: 'groq_not_configured' });
    const sys = 'Извлеки из описания MLM-лидера 2-3 короткие тезисы что ему важно/нужно/в чём боль (для подготовки персонального оффера). Только маркер-список, без вступлений и комментариев. Каждый пункт — одна строка через дефис, до 80 символов.';
    const user = `Лидер: ${c.name}\nКомпания: ${c.company || 'не указана'}\nГород: ${c.city || ''} ${c.country || ''}\n\nОписание:\n${String(c.description).slice(0, 1500)}`;
    const r = await requestGroqChatCompletion([
      { role: 'system', content: sys }, { role: 'user', content: user },
    ], { groqKeys, maxTokens: 200, temperature: 0.4, model: 'llama-3.3-70b-versatile' });
    const text = (r?.choices?.[0]?.message?.content || '').trim();
    res.json({ ok: true, needs: text });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

// L2 — A/B pitch: 3 варианта одним запросом
router.post('/contacts/:username/generate-pitch-ab', authRequired, express.json(), async (req, res) => {
  try {
    const c = storage.getContact(req.params.username, ownerId(req));
    if (!c) return res.status(404).json({ ok: false, reason: 'not_found' });
    const settings = storage.getSettings(ownerId(req));
    const offer = String(req.body?.offer || settings.defaultOffer || '').slice(0, 2000) ||
      'Golden Connect — рекламная платформа: биржа, партнёрка 10 уровней, кампании, маркетплейс, ИИ-рассылки. Мгновенные выплаты в USDT.';
    const groqKeys = getGroqKeys(req.app.locals.config || {});
    if (!groqKeys.length) return res.status(500).json({ ok: false, reason: 'groq_not_configured' });
    const note = c.crm || {};

    const tones = ['тёплый дружеский', 'формальный деловой', 'смелый прямой'];
    const variants = [];
    for (const tone of tones) {
      const sys = `Напиши короткое cold-outreach сообщение для B2B знакомства. 3-5 предложений. Тон: ${tone}. Используй контекст получателя (компания, город, описание) для персонализации. Без штампов. Отвечай ТОЛЬКО текстом сообщения.`;
      const user = [
        'Получатель:',
        `- Имя: ${c.name || c.username}`,
        c.company ? `- Компания: ${c.company}` : '',
        c.country ? `- Страна: ${c.country}` : '',
        c.city ? `- Город: ${c.city}` : '',
        c.description ? `- О себе: ${String(c.description).slice(0, 600)}` : '',
        note.needs ? `- Известные потребности: ${note.needs}` : '',
        '',
        'Моё предложение:',
        offer,
      ].filter(Boolean).join('\n');
      try {
        const r = await requestGroqChatCompletion([
          { role: 'system', content: sys }, { role: 'user', content: user },
        ], { groqKeys, maxTokens: 350, temperature: 0.85, model: 'llama-3.3-70b-versatile' });
        const text = (r?.choices?.[0]?.message?.content || '').trim();
        variants.push({ tone, text });
      } catch (e) {
        variants.push({ tone, text: '', error: e.message });
      }
    }
    res.json({ ok: true, variants });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

// L2 — Quick-add manual contact
router.post('/contacts/manual', express.json(), (req, res) => {
  const r = storage.addManualContact(ownerId(req), req.body || {});
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});


// L3 — Activity log
router.get('/activity', (req, res) => {
  const limit = Math.min(+req.query.limit || 100, 500);
  res.json({ ok: true, log: storage.getActivityLog(ownerId(req), limit) });
});

// L3 — Conversion stats (last N days)
router.get('/conversion', (req, res) => {
  const days = Math.min(+req.query.days || 30, 365);
  res.json({ ok: true, conversion: storage.getConversion(ownerId(req), days) });
});

// L3 — Heatmap (out-messages by weekday × hour)
router.get('/heatmap', (req, res) => {
  const days = Math.min(+req.query.days || 30, 365);
  res.json({ ok: true, heatmap: storage.getHeatmap(ownerId(req), days) });
});

// L3 — Subscribe to daily digest (TG chat_id)
router.put('/digest-chat', express.json(), (req, res) => {
  const cid = req.body?.chatId;
  const r = storage.setDigestChat(ownerId(req), cid);
  res.json({ ok: true, settings: r });
});

// L4 — Business Bot connection storage (called by bot.js on `business_connection` update)
router.post('/_internal/business-connection', express.json(), (req, res) => {
  // Internal — protected by shared secret
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const { ownerId: oid, connection } = req.body || {};
  if (!oid || !connection?.id) return res.status(400).json({ ok: false, reason: 'bad_input' });
  storage.setSettings(oid, { businessConnection: connection });
  res.json({ ok: true });
});

// L4 — Send-via-Bot: ask Golden Connect bot to deliver message from user's account
router.post('/contacts/:username/send-via-bot', express.json(), async (req, res) => {
  const settings = storage.getSettings(ownerId(req));
  const bc = settings.businessConnection;
  if (!bc?.id) return res.status(400).json({ ok: false, reason: 'no_business_connection' });
  const text = String(req.body?.text || '').slice(0, 4000);
  if (!text) return res.status(400).json({ ok: false, reason: 'empty_text' });
  const c = storage.getContact(req.params.username, ownerId(req));
  if (!c?.contacts?.telegram) return res.status(400).json({ ok: false, reason: 'no_telegram_link' });
  // Forward request to bot (internal endpoint)
  try {
    const r = await fetch('http://golden-connect-bot:3000/internal/send-business', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({
        business_connection_id: bc.id,
        telegram_url: c.contacts.telegram,
        text,
      }),
    });
    const data = await r.json();
    if (!data.ok) return res.status(502).json(data);
    // Auto-log to history
    storage.appendHistory(ownerId(req), req.params.username, { msg: text, direction: 'sent-via-bot' });
    res.json({ ok: true, sent: true });
  } catch (e) {
    res.status(502).json({ ok: false, reason: e.message });
  }
});


// ─── A1 — Kanban view ────────────────────────────────────────
router.get('/kanban', (req, res) => {
  const opts = {
    category: req.query.category,
    country: req.query.country,
    companyId: req.query.company_id,
  };
  res.json({ ok: true, ...storage.getKanban(ownerId(req), opts) });
});

// ─── A2 — Saved Views ────────────────────────────────────────
router.get('/views', (req, res) => {
  res.json({ ok: true, views: storage.getViews(ownerId(req)) });
});
router.put('/views', express.json(), (req, res) => {
  const v = req.body || {};
  if (!v.id) v.id = 'v_' + Date.now();
  if (!v.name) return res.status(400).json({ ok: false, reason: 'name_required' });
  storage.saveView(ownerId(req), v);
  res.json({ ok: true, view: v });
});
router.delete('/views/:id', (req, res) => {
  storage.deleteView(ownerId(req), req.params.id);
  res.json({ ok: true });
});

// ─── B2 — Tasks / Reminders ──────────────────────────────────
router.get('/tasks', (req, res) => {
  const incDone = req.query.include_done === '1' || req.query.include_done === 'true';
  res.json({ ok: true, tasks: storage.listTasks(ownerId(req), { includeDone: incDone }) });
});
router.post('/tasks', express.json(), (req, res) => {
  const t = storage.addTask(ownerId(req), req.body || {});
  storage.fireWebhooks(ownerId(req), 'task.created', t);
  res.json({ ok: true, task: t });
});
router.put('/tasks/:id', express.json(), (req, res) => {
  const t = storage.updateTask(ownerId(req), req.params.id, req.body || {});
  if (!t) return res.status(404).json({ ok: false });
  if (req.body?.done) storage.fireWebhooks(ownerId(req), 'task.done', t);
  res.json({ ok: true, task: t });
});
router.delete('/tasks/:id', (req, res) => {
  storage.deleteTask(ownerId(req), req.params.id);
  res.json({ ok: true });
});

// ─── C2 — Webhooks (для отправки событий во внешние системы) ─
router.get('/webhooks', (req, res) => {
  res.json({ ok: true, urls: storage.getWebhooks(ownerId(req)) });
});
router.put('/webhooks', express.json(), (req, res) => {
  res.json({ ok: true, urls: storage.setWebhooks(ownerId(req), req.body?.urls || []) });
});

// ─── A4 — Bulk status / tag / delete ─────────────────────────
router.post('/bulk-status', express.json(), (req, res) => {
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
  const status = String(req.body?.status || '');
  if (!usernames.length || !status) return res.status(400).json({ ok: false });
  let ok = 0;
  for (const u of usernames) {
    storage.setNote(ownerId(req), u, { status });
    storage.fireWebhooks(ownerId(req), 'contact.status_changed', { username: u, status });
    ok++;
  }
  res.json({ ok: true, updated: ok });
});

router.post('/bulk-tag', express.json(), (req, res) => {
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
  const tagsToAdd = Array.isArray(req.body?.add) ? req.body.add : [];
  if (!usernames.length || !tagsToAdd.length) return res.status(400).json({ ok: false });
  let ok = 0;
  for (const u of usernames) {
    const cur = storage.getNote(ownerId(req), u)?.tags || [];
    const next = Array.from(new Set([...cur, ...tagsToAdd]));
    storage.setTags(ownerId(req), u, next);
    ok++;
  }
  res.json({ ok: true, updated: ok });
});


// ─── B3 — Deals ──────────────────────────────────────────────
router.get('/deals', (req, res) => {
  res.json({ ok: true, deals: storage.listDeals(ownerId(req), {
    stage: req.query.stage,
    contactUsername: req.query.contact,
  }) });
});
router.get('/deals/pipeline', (req, res) => {
  res.json({ ok: true, ...storage.getDealsPipeline(ownerId(req)) });
});
router.post('/deals', express.json(), (req, res) => {
  const d = storage.addDeal(ownerId(req), req.body || {});
  storage.fireWebhooks(ownerId(req), 'deal.created', d);
  res.json({ ok: true, deal: d });
});
router.put('/deals/:id', express.json(), (req, res) => {
  const prev = storage.listDeals(ownerId(req)).find(x => x.id === req.params.id);
  const d = storage.updateDeal(ownerId(req), req.params.id, req.body || {});
  if (!d) return res.status(404).json({ ok: false });
  if (prev && prev.stage !== d.stage) {
    storage.fireWebhooks(ownerId(req), 'deal.stage_changed', { id: d.id, from: prev.stage, to: d.stage, deal: d });
    storage.runWorkflow(ownerId(req), 'deal.stage_changed', { id: d.id, from: prev.stage, to: d.stage });
    if (d.stage === 'won') {
      storage.fireWebhooks(ownerId(req), 'deal.won', d);
      storage.runWorkflow(ownerId(req), 'deal.won', d);
    }
  }
  res.json({ ok: true, deal: d });
});
router.delete('/deals/:id', (req, res) => {
  storage.deleteDeal(ownerId(req), req.params.id);
  res.json({ ok: true });
});

// ─── B5 — Workflow Rules ─────────────────────────────────────
router.get('/workflow-rules', (req, res) => {
  res.json({ ok: true, rules: storage.getRules(ownerId(req)) });
});
router.put('/workflow-rules', express.json(), (req, res) => {
  res.json({ ok: true, rules: storage.setRules(ownerId(req), req.body?.rules || []) });
});

// ─── B4 — Custom Fields ──────────────────────────────────────
router.get('/custom-fields', (req, res) => {
  res.json({ ok: true, defs: storage.getCustomFieldDefs(ownerId(req)) });
});
router.put('/custom-fields', express.json(), (req, res) => {
  res.json({ ok: true, defs: storage.setCustomFieldDefs(ownerId(req), req.body?.defs || []) });
});

// ─── C1 — Reports ────────────────────────────────────────────
router.get('/reports/by-category', (req, res) => {
  res.json({ ok: true, rows: storage.reportByCategory(ownerId(req)) });
});
router.get('/reports/by-country', (req, res) => {
  res.json({ ok: true, rows: storage.reportByCountry(ownerId(req)) });
});
router.get('/reports/by-tag', (req, res) => {
  res.json({ ok: true, rows: storage.reportByTag(ownerId(req)) });
});
router.get('/reports/revenue', (req, res) => {
  const days = Math.min(+req.query.days || 90, 365);
  res.json({ ok: true, timeline: storage.reportRevenueTimeline(ownerId(req), days) });
});


// ─── D2 — SQLite ──────────────────────────────────────────────
let _sqlite = null;
try { _sqlite = require('../services/mlm-sqlite'); } catch (e) { console.warn('mlm-sqlite skip:', e.message); }

router.get('/sqlite/status', (req, res) => {
  res.json({ ok: true, status: _sqlite?.status() || { available: false } });
});
router.post('/sqlite/migrate', (req, res) => {
  if (!_sqlite) return res.status(503).json({ ok: false, reason: 'sqlite_disabled' });
  const r = _sqlite.migrate();
  res.json(r);
});
router.get('/sqlite/search', (req, res) => {
  if (!_sqlite) return res.status(503).json({ ok: false, reason: 'sqlite_disabled' });
  const items = _sqlite.search({
    q: req.query.q,
    companyId: req.query.company_id,
    country: req.query.country,
    city: req.query.city,
    hasTelegram: req.query.tg === '1',
    hasPhone: req.query.phone === '1',
    limit: +req.query.limit || 50,
    offset: +req.query.offset || 0,
  }) || [];
  res.json({ ok: true, items });
});

// ─── D3 — SSE Realtime stream ────────────────────────────────
// Broadcasts events to connected clients of the same ownerId.
const _sseClients = new Map(); // ownerId -> Set<res>
function _sseSubscribe(ownerId, res) {
  if (!_sseClients.has(ownerId)) _sseClients.set(ownerId, new Set());
  _sseClients.get(ownerId).add(res);
  res.on('close', () => {
    _sseClients.get(ownerId)?.delete(res);
    if (_sseClients.get(ownerId)?.size === 0) _sseClients.delete(ownerId);
  });
}
function broadcastEvent(ownerId, event, payload) {
  const set = _sseClients.get(ownerId);
  if (!set) return;
  const msg = 'event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n';
  for (const r of set) try { r.write(msg); } catch {}
}
// Expose globally for storage to fire
if (!global._mlmBroadcast) global._mlmBroadcast = broadcastEvent;

router.get('/events/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('event: hello\ndata: {"ok":true}\n\n');
  _sseSubscribe(ownerId(req), res);
  // Heartbeat every 25s (prevents proxy timeout)
  const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch {} }, 25000);
  req.on('close', () => clearInterval(hb));
});

// ─── E3 — Auto-обогащение из t.me/{username} ─────────────────
router.post('/contacts/:username/enrich-from-tg', authRequired, express.json(), async (req, res) => {
  try {
    const c = storage.getContact(req.params.username, ownerId(req));
    if (!c?.contacts?.telegram) return res.status(400).json({ ok: false, reason: 'no_tg_link' });
    // Extract username from t.me/USERNAME
    const m = c.contacts.telegram.match(/t\.me\/(?:\+)?([A-Za-z0-9_]+)/);
    if (!m) return res.status(400).json({ ok: false, reason: 'bad_tg_url' });
    const tgName = m[1];
    // Fetch TG web preview
    const https = require('https');
    const html = await new Promise((resolve, reject) => {
      https.get('https://t.me/' + tgName, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d));
      }).on('error', reject);
    }).catch(() => null);
    if (!html) return res.status(502).json({ ok: false, reason: 'fetch_failed' });
    // Extract bio + last channel description
    const bio = (html.match(/<meta property="og:description" content="([^"]+)"/) || [])[1] || '';
    const title = (html.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '';

    // Groq анализ → выводит "Потребности"
    const groqKeys = getGroqKeys(req.app.locals.config || {});
    if (!groqKeys.length) return res.json({ ok: true, bio, title, needs: '' });
    const sys = 'На основе TG-профиля MLM-лидера определи 2-3 коротких тезиса: чем человек интересуется, какие потенциальные потребности у него для cold-outreach. Каждый пункт через дефис, не более 80 символов.';
    const user = `TG-профиль: ${title}\n${bio}\n\nИзвестные контакты:\n- Компания: ${c.company || '?'}\n- Страна: ${c.country || '?'}\n- Город: ${c.city || '?'}`;
    const r = await requestGroqChatCompletion([
      { role: 'system', content: sys }, { role: 'user', content: user },
    ], { groqKeys, maxTokens: 200, temperature: 0.4, model: 'llama-3.3-70b-versatile' });
    const needs = (r?.choices?.[0]?.message?.content || '').trim();
    res.json({ ok: true, bio, title, needs });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

// ─── D6 — Roles & permissions (collaborators) ────────────────
// Stored in settings.collaborators = [{email, role}]
// Roles: owner (the user who created), manager (full read+write), operator (own only), viewer (read-only)

router.get('/team', (req, res) => {
  const s = storage.getSettings(ownerId(req));
  const collaborators = Array.isArray(s.collaborators) ? s.collaborators : [];
  res.json({
    ok: true,
    owner_id: ownerId(req),
    my_role: 'owner',  // simplified — full role logic см. D6 docs
    collaborators,
  });
});
router.put('/team', express.json(), (req, res) => {
  const collaborators = Array.isArray(req.body?.collaborators) ? req.body.collaborators.slice(0, 30).map(c => ({
    email: String(c.email || '').toLowerCase().slice(0, 120),
    role: ['manager','operator','viewer'].includes(c.role) ? c.role : 'viewer',
  })).filter(c => c.email) : [];
  storage.setSettings(ownerId(req), { collaborators });
  res.json({ ok: true, collaborators });
});

router.get('/facets', (req, res) => {
  res.json({ ok: true, facets: storage.getFacets() });
});

router.get('/groupby', (req, res) => {
  const by = String(req.query.by || 'category');
  if (!['category','country','city','company'].includes(by))
    return res.status(400).json({ ok: false, reason: 'bad_by' });
  res.json({ ok: true, by, groups: storage.getGroupBy(by) });
});

router.get('/companies', (req, res) => {
  res.json({ ok: true, companies: storage.getCompanies() });
});

router.get('/stats', (req, res) => {
  res.json({ ok: true, stats: storage.getStats() });
});

router.get('/scrape-status', (req, res) => {
  res.json({ ok: true, status: storage.getScrapeStatus() });
});

// JSON pack for an external TG-agent.
router.get('/contacts/:username/agent-pack', (req, res) => {
  const c = storage.getContact(req.params.username, ownerId(req));
  if (!c) return res.status(404).json({ ok: false, reason: 'not_found' });
  const note = c.crm || {};
  res.json({
    ok: true,
    pack: {
      schema_version: '1.0',
      contact: {
        name: c.name, username: c.username, profile_url: c.url,
        company: c.company, country: c.country, city: c.city,
        phone: c.phone, email: c.email,
        telegram: c.contacts?.telegram, whatsapp: c.contacts?.whatsapp,
        description: c.description,
      },
      crm: {
        status: note.status || 'new',
        needs: note.needs || '',
        next_call: note.nextCall || null,
        history: (note.history || []).slice(-20),
        notes: note.notes || '',
      },
      handoff: {
        suggested_channel: c.contacts?.telegram ? 'telegram' : (c.phone ? 'whatsapp' : 'email'),
        rate_limit_per_account_per_day: 30,
        randomize_delay_seconds: [60, 240],
      },
    },
  });
});

// Excel export — uses xlsx package (added to deps).
router.get('/export.xlsx', authRequired, async (req, res) => {
  try {
    const xlsx = require('xlsx');
    const filters = (req.query.filter || '').toString().split(',').map(s => s.trim()).filter(Boolean);
    // [export-contacted-only-2026-05-20] FORCE 'contacted' — operators may only export leads they have
    // actually worked with (have a CRM note/history for). This blocks
    // exfiltration of the entire shared MLM contact base.
    if (!filters.includes('contacted')) filters.push('contacted');
    // Drop 'uncontacted' if it slipped in — it contradicts contacted-only.
    const cleanFilters = filters.filter(f => f !== 'uncontacted');
    const r = storage.listContacts({
      ownerId: ownerId(req),
      sort: req.query.sort || 'last-contact',
      filters: cleanFilters,
      q: req.query.q,
      status: req.query.status,
      companyId: req.query.company_id,
      offset: 0,
      limit: 100000,
    });
    // Guard: if somehow nothing matched, return an empty-but-valid file with
    // a header row explaining why (instead of a confusing blank download).
    if (!r.items || r.items.length === 0) {
      return res.status(200).json({ ok: false, reason: 'no_contacted_leads', detail: 'Экспортировать можно только лидов, с которыми ты работал (есть статус/заметка/история). Сейчас таких нет.' });
    }
    const rows = r.items.map(c => ({
      'Имя': c.name || '',
      'Username': c.username || '',
      'Компания': c.company || '',
      'Страна': c.country || '',
      'Город': c.city || '',
      'Телефон': c.phone || '',
      'Telegram': c.contacts?.telegram || '',
      'WhatsApp': c.contacts?.whatsapp || '',
      'VK': c.contacts?.vk || '',
      'Instagram': c.contacts?.instagram || '',
      'Email': c.email || '',
      'Сайт': c.website || '',
      'Описание': (c.description || '').slice(0, 500),
      'Качество': c.quality_score,
      'Профиль mlmbaza': c.url || '',
      'Статус CRM': c.crm?.status || 'new',
      'Потребности': c.crm?.needs || '',
      'Что предлагал (последнее)': (c.crm?.history || []).slice(-1)[0]?.msg || '',
      'След. созвон': c.crm?.nextCall || '',
      'Заметки': c.crm?.notes || '',
    }));
    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.json_to_sheet(rows);
    xlsx.utils.book_append_sheet(wb, ws, 'MLM База');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="mlm-database-${new Date().toISOString().slice(0,10)}.xlsx"`);
    res.end(buf);
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});


// ---------- Settings (per-owner: defaultOffer, tone, lang) ----------
router.get('/settings', (req, res) => {
  res.json({ ok: true, settings: storage.getSettings(ownerId(req)) });
});
router.put('/settings', express.json(), (req, res) => {
  const allowed = ['defaultOffer', 'tone', 'lang'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = String(req.body[k] || '').slice(0, 4000);
  res.json({ ok: true, settings: storage.setSettings(ownerId(req), patch) });
});

// ---------- AI keyword rank (sort=ai, no LLM per item) ----------
// Already integrated into listContacts via sort=ai (handled in storage).

// ---------- Funnel ----------
router.get('/funnel', (req, res) => {
  res.json({ ok: true, funnel: storage.getFunnel(ownerId(req)) });
});

// ---------- Bulk pitch generation ----------
router.post('/bulk-pitch', authRequired, express.json(), async (req, res) => {
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames.slice(0, 30) : [];
  if (!usernames.length) return res.status(400).json({ ok: false, reason: 'no_usernames' });
  const owner = ownerId(req);
  const settings = storage.getSettings(owner);
  const offer = String(req.body?.offer || settings.defaultOffer || 'Golden Connect — рекламная платформа').slice(0, 2000);
  const tone = req.body?.tone || settings.tone || 'warm';

  const groqKeys = getGroqKeys({});
  if (!groqKeys.length) return res.status(500).json({ ok: false, reason: 'groq_not_configured' });

  const results = [];
  for (const username of usernames) {
    const c = storage.getContact(username, owner);
    if (!c) { results.push({ username, ok: false, reason: 'not_found' }); continue; }
    const note = c.crm || {};
    const lang = settings.lang || 'ru';
    const sysPrompt = lang === 'en'
      ? 'You write short warm personal cold-outreach. 3-5 sentences. Reply ONLY with message text.'
      : 'Ты пишешь короткие тёплые личные сообщения для холодного аутрича. 3-5 предложений. Без штампов. Отвечай ТОЛЬКО текстом сообщения.';
    const userPrompt = [
      lang === 'en' ? 'Recipient:' : 'Получатель:',
      `- ${c.name || c.username}`,
      c.company ? `Компания: ${c.company}` : '',
      c.city ? `Город: ${c.city}` : '',
      c.description ? `О себе: ${String(c.description).slice(0, 500)}` : '',
      note.needs ? `Известные потребности: ${note.needs}` : '',
      '',
      'Моё предложение: ' + offer,
      'Тон: ' + tone,
    ].filter(Boolean).join('\n');

    let pitch = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await requestGroqChatCompletion([
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userPrompt },
        ], { groqKeys, maxTokens: 350, temperature: 0.85, model: 'llama-3.3-70b-versatile' });
        pitch = (r?.choices?.[0]?.message?.content || '').trim();
        if (pitch) break;
      } catch (err) {
        if (/Rate limit|429/i.test(err.message) && attempt < 2) {
          await new Promise(r => setTimeout(r, 5000 + attempt * 5000));
          continue;
        }
        results.push({ username, ok: false, reason: err.message });
        break;
      }
    }
    if (pitch) {
      storage.appendHistory(owner, username, { msg: pitch, direction: 'out', source: 'bulk-pitch' });
      results.push({ username, ok: true, pitch });
    }
  }
  res.json({ ok: true, results });
});

// ---------- Bulk agent-pack (export many contacts as one JSON) ----------
router.get('/bulk-pack', authRequired, (req, res) => {
  const usernames = String(req.query.usernames || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 200);
  if (!usernames.length) return res.status(400).json({ ok: false, reason: 'no_usernames' });
  const owner = ownerId(req);
  const settings = storage.getSettings(owner);
  const items = usernames.map(u => {
    const c = storage.getContact(u, owner);
    if (!c) return null;
    const note = c.crm || {};
    return {
      contact: {
        name: c.name, username: c.username, profile_url: c.url,
        company: c.company, country: c.country, city: c.city,
        phone: c.phone, email: c.email,
        telegram: c.contacts?.telegram, whatsapp: c.contacts?.whatsapp,
        description: c.description,
      },
      crm: {
        status: note.status || 'new',
        needs: note.needs || '',
        next_call: note.nextCall || null,
        history: (note.history || []).slice(-10),
      },
    };
  }).filter(Boolean);
  res.json({
    ok: true,
    pack: {
      schema_version: '1.0-bulk',
      offer: settings.defaultOffer || '',
      contacts: items,
      handoff: {
        rate_limit_per_account_per_day: 30,
        randomize_delay_seconds: [60, 240],
      },
    },
  });
});

// ---------- CSV import ----------
router.post('/import-csv', express.text({ type: '*/*', limit: '4mb' }), (req, res) => {
  try {
    const csv = String(req.body || '');
    if (!csv.trim()) return res.status(400).json({ ok: false, reason: 'empty_body' });
    // Simple CSV parser — handles quoted fields, commas, newlines
    function parseCsv(text) {
      const rows = []; let cur = []; let field = ''; let inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
          if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
          else if (c === '"') inQuotes = false;
          else field += c;
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ',') { cur.push(field); field = ''; }
          else if (c === '\n' || c === '\r') {
            if (field || cur.length) { cur.push(field); rows.push(cur); cur = []; field = ''; }
            if (c === '\r' && text[i+1] === '\n') i++;
          }
          else field += c;
        }
      }
      if (field || cur.length) { cur.push(field); rows.push(cur); }
      return rows;
    }
    const rows = parseCsv(csv);
    if (!rows.length) return res.status(400).json({ ok: false, reason: 'no_rows' });
    const headers = rows[0].map(h => h.trim());
    const objects = rows.slice(1).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] || ''])));
    const result = storage.importCsvRows(ownerId(req), objects);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, reason: e.message });
  }
});

// ─── L5 — Whoami (frontend identity probe + auto-register TG digestChatId) ─
router.get('/whoami', (req, res) => {
  const oid = ownerId(req);
  const result = {
    ok: true,
    ownerId: oid,
    isGuest: oid === 'guest',
    isTg: !!req.tgUser,
    tg: req.tgUser ? {
      id: req.tgUser.id,
      username: req.tgUser.username,
      first_name: req.tgUser.first_name,
      language_code: req.tgUser.language_code,
      is_premium: req.tgUser.is_premium,
      photo_url: req.tgUser.photo_url,
    } : null,
  };
  if (req.tgUser) {
    // Auto-stamp digestChatId + language preference on first visit.
    storage.registerTgOwner(oid, req.tgUser);
    result.settings = storage.getSettings(oid);
  }
  res.json(result);
});

// ─── L5 — Internal: digest batch (called by bot push scheduler) ──
// Returns array of [{ ownerId, chatId, lang, digest }] for every owner who has
// a configured digestChatId and at least one due task / open lead today.
router.get('/_internal/digest-batch', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const out = [];
  for (const oid of storage.listOwners()) {
    const s = storage.getSettings(oid);
    if (!s.digestChatId) continue;
    const tasks = storage.listTasks(oid, { includeDone: false }) || [];
    const today = new Date().toISOString().slice(0, 10);
    const dueToday = tasks.filter((t) => !t.done && (!t.due || t.due.slice(0, 10) <= today));
    const dash = storage.getDashboard(oid) || {};
    if (!dueToday.length && !dash.newToday) continue;
    out.push({
      ownerId: oid,
      chatId: s.digestChatId,
      lang: s.lang || 'ru',
      digest: {
        tasksDueToday: dueToday.slice(0, 10),
        tasksTotalOpen: tasks.filter((t) => !t.done).length,
        leadsNew: dash.newToday || 0,
        leadsInProgress: dash.inProgress || 0,
        dealsWon: dash.dealsWon || 0,
        dealsOpen: dash.dealsOpen || 0,
      },
    });
  }
  res.json({ ok: true, items: out });
});

// ─── L5 — Internal: incoming Business Bot message recorded as CRM history ──
router.post('/_internal/business-message', express.json(), (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const { ownerId: oid, fromUsername, text, direction } = req.body || {};
  if (!oid || !fromUsername || !text) return res.status(400).json({ ok: false, reason: 'bad_input' });
  const note = storage.appendHistory(oid, String(fromUsername), {
    msg: String(text).slice(0, 4000),
    direction: direction || 'in',
    source: 'business-bot',
  });
  storage.fireWebhooks(oid, 'contact.message_received', { username: fromUsername, text });
  res.json({ ok: true, crm: note });
});

// ─── L5 — Internal: per-user dashboard tile for /stats /today /pipeline ──
router.get('/_internal/snapshot', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const oid = String(req.query.ownerId || '');
  if (!oid) return res.status(400).json({ ok: false, reason: 'bad_owner' });
  res.json({
    ok: true,
    dashboard: storage.getDashboard(oid),
    today: storage.getDailyBatch(oid),
    pipeline: storage.getDealsPipeline(oid),
    tasksOpen: storage.listTasks(oid, { includeDone: false }),
  });
});

// ─── L6 — AI Sales Session: next-lead picker ─────────────────────
// Returns the next "best" lead for a TG user to work, optionally skipping
// usernames the bot has already shown in this session. Priority:
//   1. Untouched + reachable + high quality_score
//   2. Already in-progress but no message in 3+ days
//   3. Callbacks scheduled for today
router.get('/_internal/next-lead', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const oid = String(req.query.ownerId || '');
  if (!oid) return res.status(400).json({ ok: false, reason: 'bad_owner' });
  const skip = new Set((req.query.skip || '').split(',').filter(Boolean));
  const batch = storage.getDailyBatch(oid);
  const candidate =
    (batch.scheduled || []).find((c) => !skip.has(c.username)) ||
    (batch.untouched || []).find((c) => !skip.has(c.username)) ||
    null;
  if (!candidate) return res.json({ ok: true, contact: null, exhausted: true });
  const fresh = storage.getContact(candidate.username, oid) || candidate;
  res.json({
    ok: true,
    contact: fresh,
    progress: {
      scheduled: (batch.scheduled || []).length,
      untouched: (batch.untouched || []).length,
    },
  });
});

// ─── L6 — AI Coach: lead-aware sales advice via Groq ─────────────
router.post('/_internal/coach', express.json(), async (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const { ownerId: oid, leadUsername, question, history } = req.body || {};
  if (!oid || !question) return res.status(400).json({ ok: false, reason: 'bad_input' });
  const settings = storage.getSettings(oid);
  const lead = leadUsername ? storage.getContact(leadUsername, oid) : null;
  const sys = [
    'Ты опытный SDR-наставник для MLM-индустрии. Тон: коротко, по делу, на русском.',
    'Цель: помочь пользователю вывести лида на 15-минутный созвон.',
    'НЕ продавай. НЕ генерируй длинные тексты. 2-4 предложения максимум.',
    'Используй технику "вопрос вместо утверждения" и "small commitment first".',
    settings.defaultOffer ? 'Оффер пользователя: ' + settings.defaultOffer : '',
    lead
      ? 'КОНТЕКСТ ЛИДА:\n- ' +
        [
          lead.name && 'Имя: ' + lead.name,
          lead.company && 'Компания: ' + lead.company,
          lead.city && 'Город: ' + lead.city,
          lead.country && 'Страна: ' + lead.country,
          lead.crm?.status && 'Статус: ' + lead.crm.status,
          lead.crm?.needs && 'Что хочет: ' + lead.crm.needs,
          lead.description && 'Описание: ' + lead.description.slice(0, 600),
        ]
          .filter(Boolean)
          .join('\n- ')
      : 'Нет активного лида.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const msgs = [{ role: 'system', content: sys }];
  if (Array.isArray(history)) {
    for (const h of history.slice(-6)) {
      if (h?.role && h?.content) msgs.push({ role: h.role, content: String(h.content).slice(0, 2000) });
    }
  }
  msgs.push({ role: 'user', content: String(question).slice(0, 4000) });
  try {
    const r = await requestGroqChatCompletion(msgs, {
      model: 'llama-3.3-70b-versatile',
      temperature: 0.4,
      maxTokens: 320,
      groqKeys: getGroqKeys(),
    });
    const text = r?.choices?.[0]?.message?.content || '';
    res.json({ ok: true, text });
  } catch (e) {
    res.status(502).json({ ok: false, reason: e.message });
  }
});

// ─── L5 — Internal: inline-query search for inline-mode results ──
router.get('/_internal/search', (req, res) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_API_SECRET) return res.status(403).json({ ok: false, reason: 'forbidden' });
  const oid = String(req.query.ownerId || '');
  const q = String(req.query.q || '').toLowerCase().trim();
  if (!oid) return res.status(400).json({ ok: false, reason: 'bad_owner' });
  const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 12));
  const result = storage.listContacts({
    q,
    ownerId: oid,
    sort: 'updated',
    page: 1,
    pageSize: limit,
  });
  res.json({ ok: true, items: (result?.items || []).slice(0, limit) });
});

// ---------- Agent-status webhook (external TG-agent reports back) ----------
router.post('/contacts/:username/agent-status', express.json(), (req, res) => {
  // Authenticated by shared secret token in body or header
  const expected = process.env.MLM_AGENT_TOKEN || '';
  const got = req.headers['x-mlm-agent-token'] || req.body?.token || '';
  if (!expected || got !== expected) return res.status(401).json({ ok: false, reason: 'bad_token' });
  const owner = String(req.body?.owner_id || 'guest');
  const username = req.params.username;
  const { status, msg, error } = req.body || {};
  const note = storage.appendHistory(owner, username, {
    msg: msg || (error ? `[error] ${error}` : '[agent ack]'),
    direction: error ? 'error' : 'out',
    source: 'agent-webhook',
  });
  if (status) storage.setNote(owner, username, { status });
  res.json({ ok: true, crm: note });
});

module.exports = router;
