// CRM-APP-VERSION: no-email-2026-05-12-v10 — see console.log on init
console.log('%c[crm-app]%c v=no-email-2026-05-12-v10', 'background:#b14aed;color:#fff;padding:2px 6px;border-radius:3px', 'color:#9ba1ad', 'default view = В работе 00b7 lazy + auto-retry + tg-gate');
// crm-app.js — frontend SPA for Golden Connect CRM (MLM база).
// Talks to /api/mlm/*. Single-page, no framework.

const STATE = {
  filters: new Set(),
  category: '',
  country: '',
  city: '',
  selected: new Set(),
  appendMode: false,
  loadedItems: [],
  settings: { defaultOffer: '', tone: 'warm', lang: 'ru', greetingTemplate: '', dailyBatchSize: 25, offersByCategory: {}, digestChatId: null, businessConnection: null },
  sort: 'fresh',
  q: '',
  offset: 0,
  limit: 50,
  total: 0,
  current: null,        // currently open contact
  scrapeStatus: null,
  loading: false,
};

const API_BASE = location.pathname.startsWith('/cabinet/') ? '/cabinet' : '';

// [contact-pills-rich] Universal clipboard copy with execCommand fallback.
// Public so onclick="..." attributes can call it from inline pill markup.
// [contact-pills-rich] Inject styles once on script load.
(function _cpInjectStyles() {
  if (document.getElementById('cp-pill-styles')) return;
  const css = `
    .cp-wrap { display: inline-flex; align-items: stretch; margin: 0 4px 4px 0; border-radius: 8px; overflow: hidden; }
    .cp-link {
      padding: 6px 12px;
      background: var(--card, #1a1c2e);
      border: 1px solid var(--border, #252837);
      color: var(--text, #e7e9ee);
      text-decoration: none;
      font-size: 13px;
      border-radius: 8px 0 0 8px;
      border-right: none;
      transition: background .15s ease;
    }
    .cp-link:hover { background: var(--card-hover, rgba(139,92,246,0.12)); }
    .cp-link-disabled { opacity: 0.6; cursor: default; }
    .cp-copy {
      padding: 6px 10px;
      background: var(--card, #1a1c2e);
      border: 1px solid var(--border, #252837);
      color: var(--muted, #9ba1ad);
      cursor: pointer;
      font-size: 13px;
      border-radius: 0 8px 8px 0;
      border-left: 1px solid var(--border, #252837);
      transition: background .15s ease, color .15s ease;
    }
    .cp-copy:hover { background: rgba(139,92,246,0.15); color: var(--text, #e7e9ee); }
    .ic-phone-line {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px; color: var(--muted, #9ba1ad);
      margin-top: 2px;
    }
    .ic-phone-line .ic-num { font-family: 'JetBrains Mono', monospace; color: var(--text, #e7e9ee); }
    .ic-phone-line .ic-mini-copy {
      padding: 0 5px; background: transparent; border: none;
      color: var(--muted, #9ba1ad); cursor: pointer; font-size: 13px;
    }
    .ic-phone-line .ic-mini-copy:hover { color: var(--text, #fff); }
    /* [active-view-header] Prominent banner showing what slice is loaded */
    .active-view-header {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px;
      background: linear-gradient(90deg, rgba(177,74,237,0.18) 0%, rgba(0,212,255,0.10) 100%);
      border-bottom: 1px solid rgba(177,74,237,0.35);
      font-size: 13px;
      color: var(--text, #e7e9ee);
      animation: avh-slide 0.25s ease-out;
    }
    .avh-icon { font-size: 18px; line-height: 1; }
    .avh-label { font-weight: 700; color: #fff; }
    .avh-count { color: var(--muted, #9ba1ad); margin-left: auto; font-variant-numeric: tabular-nums; }
    .avh-clear {
      padding: 3px 9px; background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
      color: var(--text, #e7e9ee); cursor: pointer; font-size: 11px;
      transition: background 0.15s;
    }
    .avh-clear:hover { background: rgba(255,255,255,0.18); }
    @keyframes avh-slide { from { transform: translateY(-4px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `;
  const el = document.createElement('style');
  el.id = 'cp-pill-styles';
  el.textContent = css;
  document.head.appendChild(el);
})();

window._cpCopy = function (text, label) {
  const msg = '📋 ' + (label || 'скопировано');
  const doFlash = () => { try { (window.flash || (m=>console.log(m)))(msg); } catch (_) {} };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(doFlash).catch(() => fallback());
  } else { fallback(); }
  function fallback() {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      doFlash();
    } catch (_) { /* silent */ }
  }
};

// [greeting-hoist] Moved up from ~line 757 to avoid TDZ.
// Contact-card renderer (renderContactDetail) is called during init via
// state restoration / Telegram WebApp params; if buildGreetingFor runs
// before the original `const GREETING_POOL = {...}` line executes, JS
// throws "Cannot access GREETING_POOL before initialization".
// ---------- Messenger deep-links + greeting template ----------

// Random greeting variants — каждое сообщение чуть отличается (anti-spam)
const GREETING_POOL = {
  hello: [
    'здравствуйте', 'добрый день', 'приветствую', 'здравствуйте 🙂',
    'добрый вечер', 'приветствую вас', 'привет', 'здравствуйте 👋',
  ],
  source: [
    'нашёл ваш контакт в млм-базе', 'увидел ваш профиль на mlmbaza',
    'наткнулся на вас в базе млм-лидеров', 'нашёл вас через каталог млм',
    'увидел вас в открытой базе млм', 'смотрел базу млм-лидеров и нашёл вас',
    'попался ваш профиль в каталоге сетевиков', 'увидел вас в списке млм-лидеров',
  ],
  intent: [
    'давайте знакомиться', 'хочу познакомиться', 'хочется познакомиться',
    'решил написать познакомиться', 'захотелось пообщаться',
    'давайте пообщаемся', 'предлагаю знакомство', 'хотел бы познакомиться',
  ],
  question: [
    'вы ещё работаете в {{company}}?',
    'сейчас всё ещё в {{company}}?',
    'по-прежнему с {{company}}?',
    'продолжаете развиваться в {{company}}?',
    'ещё в {{company}}? интересно как там',
    'до сих пор в команде {{company}}?',
    'актуальна ли для вас {{company}}?',
    'остаётесь в {{company}} или уже куда-то перешли?',
  ],
};
function _pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomGreeting(c) {
  const company = (c.company || 'этой компании').toLowerCase();
  const parts = [
    _pick(GREETING_POOL.hello) + ',',
    _pick(GREETING_POOL.source) + ',',
    _pick(GREETING_POOL.intent) + '.',
    _pick(GREETING_POOL.question).replace(/\{\{company\}\}/g, company),
  ];
  return parts.join(' ');
}

const DEFAULT_GREETING = 'здравствуйте, нашёл ваш контакт в млм-базе, давайте знакомиться. вы ещё работаете в компании {{company}}?';
function buildGreetingFor(c) {
  // Если пользователь не задал свой шаблон — каждый раз выдаём чуть другой текст
  if (!STATE.settings.greetingTemplate) return randomGreeting(c);
  return STATE.settings.greetingTemplate
    .replace(/\{\{name\}\}/g, (c.name || '').toLowerCase())
    .replace(/\{\{company\}\}/g, (c.company || '').toLowerCase())
    .replace(/\{\{city\}\}/g, (c.city || '').toLowerCase())
    .replace(/\{\{country\}\}/g, (c.country || '').toLowerCase())
    .replace(/\{\{phone\}\}/g, c.phone || '');
}

// ─── Telegram WebApp integration ──────────────────────────────
// When CRM is opened from @Golden ConnectTGbot menu button, TG injects
// `window.Telegram.WebApp` with `initData` (signed payload). We attach it
// to every API request so the cabinet middleware can authenticate the
// user without cookies — the same TG account always gets the same ownerId.
const TG = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
const TG_INIT_DATA = TG && TG.initData ? TG.initData : '';
window.TG = TG; window.TG_INIT_DATA = TG_INIT_DATA;

if (TG) {
  try {
    TG.ready();
    TG.expand();
    // [tg-version-gate] enableClosingConfirmation requires TG WebApp 6.2+
    try { if (TG.enableClosingConfirmation && (typeof TG.isVersionAtLeast === "function" ? TG.isVersionAtLeast("6.2") : true)) TG.enableClosingConfirmation(); } catch (_) {}
    // Adopt TG theme tokens so the SPA matches the user's TG palette.
    const tp = TG.themeParams || {};
    const root = document.documentElement;
    if (tp.bg_color) root.style.setProperty('--tg-bg', tp.bg_color);
    if (tp.text_color) root.style.setProperty('--tg-fg', tp.text_color);
    if (tp.button_color) root.style.setProperty('--tg-btn', tp.button_color);
    if (tp.button_text_color) root.style.setProperty('--tg-btn-fg', tp.button_text_color);
    if (tp.hint_color) root.style.setProperty('--tg-hint', tp.hint_color);
    document.body.classList.add('in-tg');
    if (TG.colorScheme === 'dark') document.body.classList.add('tg-dark');
  } catch (_) {}
}

function tgHaptic(type) {
  try { TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred(type || 'light'); } catch (_) {}
}
window.tgHaptic = tgHaptic;

// [api-retry-2026-05-19] api() with auto-retry on transient 5xx (502/503/504) — common during k8s rollouts
async function api(method, path, body) {
  if (path.startsWith('/api/')) path = API_BASE + path;
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (TG_INIT_DATA) opt.headers['X-Telegram-InitData'] = TG_INIT_DATA;
  if (body) { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }

  // Retry policy: 2 retries on 502/503/504 with backoff 600ms → 1800ms.
  // GET/HEAD only — POST/PUT/DELETE retried only on PURE network failure
  // (no response received) so we don't double-submit forms.
  const retryable = ['GET', 'HEAD'].includes(String(method).toUpperCase());
  const MAX_TRIES = retryable ? 3 : 1;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    let r = null;
    try {
      r = await fetch(path, opt);
    } catch (netErr) {
      // pure network failure (offline, DNS, etc.) — retry once if GET
      lastErr = new Error('сеть недоступна');
      if (attempt < MAX_TRIES) { await _apiSleep(600 * attempt); continue; }
      throw lastErr;
    }
    const text = await r.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch {}
    if (r.ok) return data;
    // Transient 5xx → retry with backoff
    if (retryable && (r.status === 502 || r.status === 503 || r.status === 504) && attempt < MAX_TRIES) {
      console.warn('[api] ' + path + ' returned ' + r.status + ' — retry ' + attempt + '/' + (MAX_TRIES - 1));
      await _apiSleep(attempt === 1 ? 600 : 1800);
      continue;
    }
    // Surface a friendlier message for known transient codes
    let reason = (data && data.reason) || r.status;
    if (r.status === 503 || r.status === 502) reason = 'сервер обновляется, попробуй ещё раз через секунду';
    else if (r.status === 504) reason = 'сервер не успел ответить (таймаут)';
    else if (r.status === 401) reason = 'нужна авторизация (войди в кабинет)';
    else if (r.status === 429) reason = 'слишком много запросов — подожди минуту';
    throw new Error(reason);
  }
  throw lastErr || new Error('unknown error');
}
function _apiSleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

// Wrap plain `fetch(API_BASE + '/api/mlm/...')` calls that bypass api()
// so they also carry initData. Idempotent — only wraps once.
if (!window._tgFetchWrapped) {
  const _origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (TG_INIT_DATA && (url.indexOf('/api/mlm/') !== -1 || url.indexOf('/api/roboai/') !== -1)) {
        init = Object.assign({}, init || {});
        init.headers = Object.assign({}, init.headers || {}, { 'X-Telegram-InitData': TG_INIT_DATA });
      }
    } catch (_) {}
    return _origFetch(input, init);
  };
  window._tgFetchWrapped = true;
}

// [our-tg-btn-2026-05-20] purple "Наш TG" button — start a CRM dialog via our account, no profile-open
function _extractTgUser(c) {
  // Prefer explicit username if mlmbaza handle matches a TG handle; else parse the t.me URL
  var tg = c && c.contacts && c.contacts.telegram;
  if (tg) {
    var m = String(tg).match(/t\.me\/(?:@)?([A-Za-z0-9_]{3,})/);
    if (m) return m[1];
    var at = String(tg).match(/^@?([A-Za-z0-9_]{3,})$/);
    if (at) return at[1];
  }
  return null;
}
function _ourTgButton(c) {
  var u = _extractTgUser(c);
  // Phone fallback: leads from MLM bases often have a phone but no @username.
  // We can still write via our account by resolving the phone (importContacts).
  var phone = (c && c.phone) ? String(c.phone).replace(/[^\d+]/g, '') : '';
  if (phone && phone[0] !== '+') phone = '+' + phone;
  var name = (c && (c.name || c.username) || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
  if (!u && !phone) {
    return '<button title="У лида нет ни Telegram-username, ни телефона — написать через наш TG нельзя" disabled ' +
      'style="margin-top:6px;width:fit-content;font-size:11px;padding:4px 10px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--text-muted);opacity:.55;cursor:not-allowed">💬 Наш TG</button>';
  }
  var pid = c && c.person_id ? c.person_id : '';
  var byPhone = !u && phone;
  var label = byPhone ? '💬 Наш TG (по номеру)' : '💬 Наш TG';
  var title = byPhone
    ? 'Написать по номеру через наш Telegram-аккаунт (резолвим номер, $0.05 за сообщение). Сработает, если у лида не закрыт поиск по номеру.'
    : 'Написать лиду через наш Telegram-аккаунт (списывается $0.05 за сообщение)';
  return '<button onclick="event.stopPropagation();window._cardStartOurTg(\'' + (u || '') + '\',\'' + phone + '\',\'' + name + '\',\'' + pid + '\')" ' +
    'title="' + title + '" ' +
    'style="margin-top:6px;width:fit-content;font-size:11px;font-weight:600;padding:5px 12px;border-radius:8px;border:none;' +
    'background:linear-gradient(135deg,#8b5cf6,#7c4def);color:#fff;cursor:pointer;box-shadow:0 2px 8px rgba(139,92,246,0.35);transition:transform .12s" ' +
    'onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'translateY(0)\'">' + label + '</button>';
}
window._cardStartOurTg = function(username, phone, name, personId) {
  if (typeof window.txmsgOpenWith === 'function') {
    window.txmsgOpenWith({
      tg_username: username && username !== '' ? username : null,
      tg_phone: phone && phone !== '' ? phone : null,
      name: name && name !== '' ? name : null,
      person_id: personId && personId !== '' ? Number(personId) : null,
    });
  } else {
    alert('Мессенджер ещё загружается, попробуй через секунду.');
  }
};

// [last-contact-badge-2026-05-19] renders "Xд назад" badge when CRM note has updated_at
function _lastContactBadge(c) {
  if (!c || !c.crm) return '';
  var raw = c.crm.updated_at || (c.crm.history && c.crm.history.length ? c.crm.history[c.crm.history.length-1].ts : null);
  if (!raw) return '';
  var t = Date.parse(raw); if (!Number.isFinite(t)) return '';
  var diffMs = Date.now() - t;
  if (diffMs < 0) diffMs = 0;
  var sec = diffMs / 1000;
  var label;
  var color = '#94a3b8';
  if (sec < 60)               label = 'только что';
  else if (sec < 3600)        label = Math.floor(sec/60) + 'м назад';
  else if (sec < 86400)       label = Math.floor(sec/3600) + 'ч назад';
  else if (sec < 7*86400)     { label = Math.floor(sec/86400) + 'д назад'; color = '#fbbf24'; }
  else if (sec < 30*86400)    { label = Math.floor(sec/86400) + 'д назад'; color = '#f59e0b'; }
  else                        { label = Math.floor(sec/86400) + 'д назад'; color = '#ef4444'; }
  return '<span title="последний контакт: ' + raw + '" style="font-size:9px;color:' + color + ';background:rgba(255,255,255,0.04);padding:1px 5px;border-radius:6px;white-space:nowrap">⏱ ' + label + '</span>';
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderList(items, append) {
  const root = document.getElementById('contactList');
  if (!items.length && !append) {
    root.innerHTML = '<div class="empty">Ничего не найдено</div>';
    return;
  }
  const html = items.map(c => {
    // [card-redesign-2026-05-21] compact detailed card — no avatar, full info, left status bar
    const STC = { 'new':'#3b82f6', 'in-progress':'#fbbf24', 'callback':'#8b5cf6', 'closed':'#10b981', 'skip':'#6b7280' };
    const status = (c.crm && c.crm.status) || 'new';
    const stColor = STC[status] || '#3b82f6';
    const checked = STATE.selected.has(c.username) ? 'checked' : '';
    const sub = [c.company, c.country, c.city].filter(Boolean).join(' · ');
    const ml = msgrLinks(c);
    const u = esc(c.username);
    // contact chips — show everything we have
    const chip = (html2) => '<span class="lc-chip">' + html2 + '</span>';
    const chips = [];
    if (c.phone) chips.push('<span class="lc-chip lc-phone">📞 ' + esc(c.phone) +
      '<button class="lc-copy" title="Скопировать" onclick="event.stopPropagation();window._cpCopy(\'' + esc(String(c.phone)).replace(/'/g,'&#39;') + '\',\'телефон\')">📋</button></span>');
    if (ml.tg)  chips.push('<a class="lc-chip lc-tg"  onclick="event.stopPropagation();openMsgr(\'tg\',\'' + u + '\')" title="Telegram + текст">✈ TG</a>');
    if (ml.wa)  chips.push('<a class="lc-chip lc-wa"  onclick="event.stopPropagation();openMsgr(\'wa\',\'' + u + '\')" title="WhatsApp + текст">📱 WA</a>');
    if (ml.max) chips.push('<a class="lc-chip lc-max" onclick="event.stopPropagation();openMsgr(\'max\',\'' + u + '\')" title="MAX">Ⓜ MAX</a>');
    if (c.contacts && c.contacts.vk)        chips.push('<a class="lc-chip" href="' + esc(c.contacts.vk) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">VK</a>');
    if (c.contacts && c.contacts.instagram) chips.push('<a class="lc-chip" href="' + esc(c.contacts.instagram) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">IG</a>');
    if (c.contacts && c.contacts.email)     chips.push('<span class="lc-chip">✉ ' + esc(c.contacts.email) + '</span>');
    const desc = c.description ? '<div class="lc-desc">' + esc(String(c.description).slice(0,160)) + '</div>' : '';

    return `<div class="list-item lc-card${STATE.current === c.username ? ' active' : ''}" data-username="${u}" style="--stc:${stColor}">
      <div class="lc-row1">
        <input type="checkbox" class="bulk-cb" ${checked} data-u="${u}" onclick="event.stopPropagation()">
        <span class="lc-dot" style="background:${stColor}"></span>
        <span class="lc-name">${esc(c.name || c.username || '—')}</span>
        <span class="lc-spacer"></span>
        ${_lastContactBadge(c)}
        <select class="inline-status" data-u="${u}" onclick="event.stopPropagation()" onchange="changeStatusInline('${u}', this.value)">
          <option value="new"${status==='new'?' selected':''}>новый</option>
          <option value="in-progress"${status==='in-progress'?' selected':''}>в работе</option>
          <option value="callback"${status==='callback'?' selected':''}>созвон</option>
          <option value="closed"${status==='closed'?' selected':''}>закрыт</option>
          <option value="skip"${status==='skip'?' selected':''}>нет</option>
        </select>
      </div>
      ${sub ? '<div class="lc-sub">' + esc(sub) + '</div>' : ''}
      ${desc}
      <div class="lc-row2">
        <div class="lc-chips">${chips.join('')}</div>
        ${_ourTgButton(c)}
      </div>
    </div>`;
  }).join('');
  if (append) root.insertAdjacentHTML('beforeend', html); else { root.innerHTML = html; if (STATE.lastScrollTop != null) requestAnimationFrame(() => { try { root.scrollTop = STATE.lastScrollTop; } catch {} }); }
  root.querySelectorAll('.bulk-cb').forEach(cb => cb.addEventListener('change', e => toggleSelect(cb.dataset.u, cb.checked)));
  root.querySelectorAll('.list-item').forEach(el =>
    el.addEventListener('click', () => openContact(el.dataset.username)));
}

// [active-view-header] Compute the current filter description from STATE,
// render it in the header band above contactList. Called from loadContacts
// on success and from switchToView when the filter changes.
function updateActiveViewHeader(total) {
  const el = document.getElementById('activeViewHeader');
  if (!el) return;
  // Decide icon + label based on STATE
  let icon = '📋', label = 'Все контакты', tone = 'neutral';
  const filtersOn = [];
  if (STATE.filters && STATE.filters.size) {
    for (const f of STATE.filters) {
      if (f === 'contacted')      { icon = '🔥'; label = 'В работе'; tone = 'red'; }
      else if (f === 'todo-callback') { icon = '⏰'; label = 'Созвоны на неделе'; tone = 'amber'; }
      else if (f === 'uncontacted')   { icon = '🆕'; label = 'Не контактировал'; tone = 'cyan'; }
      else if (f === 'tg')        filtersOn.push('TG');
      else if (f === 'phone')     filtersOn.push('тел');
      else if (f === 'whatsapp')  filtersOn.push('WA');
      else if (f === 'email')     filtersOn.push('email');
      else if (f === 'ru')        filtersOn.push('Россия');
      else if (f === 'cis')       filtersOn.push('СНГ');
      else if (f === 'with-photo') filtersOn.push('фото');
    }
  }
  if (STATE.category) { label = (label === 'Все контакты' ? '' : label + ' · ') + 'Категория: ' + STATE.category; icon = '🏷'; }
  if (STATE.country)  { label = (label === 'Все контакты' ? '' : label + ' · ') + STATE.country; icon = '🌍'; }
  if (STATE.city)     { label = (label === 'Все контакты' ? '' : label + ' · ') + STATE.city; icon = '📍'; }
  if (STATE.q)        { icon = '🔍'; label = 'Поиск: "' + STATE.q + '"'; }
  if (filtersOn.length) {
    label = (label === 'Все контакты' ? '' : label + ' · ') + 'есть ' + filtersOn.join(', ');
  }
  // Sort indicator
  const sortLabels = { fresh: 'свежие', tg: 'TG', phone: 'с тел', ai: 'AI', alpha: 'A-Z' };
  const sortLabel = sortLabels[STATE.sort] || STATE.sort || '';

  const shown = (STATE.loadedItems && STATE.loadedItems.length) || 0;
  const t = Number(total != null ? total : STATE.total) || 0;

  el.innerHTML =
    '<span class="avh-icon">' + icon + '</span>' +
    '<span class="avh-label">' + esc(label) + '</span>' +
    (sortLabel ? '<span style="color:var(--muted,#9ba1ad);font-size:11px">· сортировка: ' + esc(sortLabel) + '</span>' : '') +
    '<span class="avh-count">' + shown + ' / ' + t.toLocaleString('ru-RU') + '</span>' +
    (label !== 'Все контакты' ? '<button class="avh-clear" onclick="clearAllFilters()">✕ Сбросить</button>' : '');
  el.style.display = 'flex';
}

// [loadContacts-debug] verbose error reporting + 15s timeout
async function loadContacts() {
  if (STATE.loading) {
    console.warn('[loadContacts] skipped: STATE.loading still true (stuck from previous call?)');
    return;
  }
  STATE.loading = true;
  const _t0 = Date.now();
  console.log('[loadContacts] start sort=' + STATE.sort + ' offset=' + STATE.offset + ' limit=' + STATE.limit + ' append=' + STATE.appendMode);
  try {
    const params = new URLSearchParams({
      sort: STATE.sort,
      q: STATE.q,
      offset: STATE.offset,
      limit: STATE.limit,
      filter: [...STATE.filters].join(','),
      offer: STATE.sort === 'ai' ? (STATE.settings && STATE.settings.defaultOffer) || '' : '',
      category: STATE.category,
      country: STATE.country,
      city: STATE.city,
    });
    // 15s timeout — if api hangs, show error instead of staying on Загрузка
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 15000) : null;
    let r;
    try {
      const url = API_BASE + '/api/mlm/contacts?' + params;
      const opt = { method: 'GET', credentials: 'same-origin', headers: {} };
      if (TG_INIT_DATA) opt.headers['X-Telegram-InitData'] = TG_INIT_DATA;
      if (ctrl) opt.signal = ctrl.signal;
      const resp = await fetch(url, opt);
      const text = await resp.text();
      console.log('[loadContacts] got HTTP ' + resp.status + ' body ' + text.length + ' chars in ' + (Date.now() - _t0) + 'ms');
      try { r = text ? JSON.parse(text) : null; } catch (parseErr) {
        throw new Error('JSON parse failed: ' + parseErr.message + ' — body starts with: ' + text.slice(0, 80));
      }
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status + ': ' + ((r && r.reason) || text.slice(0, 80)));
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!r || !Array.isArray(r.items)) {
      throw new Error('bad response shape: ' + JSON.stringify(r).slice(0, 200));
    }
    console.log('[loadContacts] parsed ' + r.items.length + ' items, total ' + r.total);
    STATE.total = r.total;
    if (STATE.appendMode) {
      STATE.loadedItems = STATE.loadedItems.concat(r.items);
      renderList(r.items, true);
    } else {
      STATE.loadedItems = r.items.slice();
      renderList(r.items, false);
      // Restore list scroll if user is just refreshing in place (e.g. after save)
      const _el = document.getElementById('contactList');
      if (_el && STATE.lastScrollTop != null) requestAnimationFrame(() => { _el.scrollTop = STATE.lastScrollTop; });
    }
    updateActiveViewHeader(r.total);
    const shown = STATE.loadedItems.length;
    document.getElementById('searchInput').placeholder =
      `Показано ${shown}/${r.total.toLocaleString('ru-RU')} — жми поиск или фильтры…`;
    // Sentinel for infinite scroll
    if (shown < r.total) {
      const list = document.getElementById('contactList');
      list.insertAdjacentHTML('beforeend',
        `<div class="empty" id="loadMoreSentinel" style="padding:20px;cursor:pointer" onclick="loadMore()">
           ⬇ загрузить ещё (осталось ${(r.total - shown).toLocaleString('ru-RU')})
         </div>`);
    }
  } catch (e) {
    console.error('[loadContacts] FAILED:', e);
    // [first-load-retry] One auto-retry on first failure — cabinet middleware
    // is cold on initial request and sometimes times out. Reset STATE.loading
    // before the retry so the guard doesn't bail.
    if (!window._lcRetried && !STATE.loadedItems.length) {
      window._lcRetried = true;
      console.log('[loadContacts] scheduling auto-retry in 800ms…');
      STATE.loading = false;
      setTimeout(() => { loadContacts(); }, 800);
      return;
    }
    const detail = (e && e.name === 'AbortError')
      ? 'Запрос /api/mlm/contacts не отвечает уже 15 секунд. Проверь интернет или открой DevTools → Network.'
      : (e && e.message) || String(e);
    document.getElementById('contactList').innerHTML =
      '<div class="empty" style="padding:24px;line-height:1.6">' +
      '<div style="font-size:20px;margin-bottom:10px">⚠ Ошибка загрузки списка</div>' +
      '<div style="color:#9ba1ad;font-size:13px;margin-bottom:14px">' + esc(detail) + '</div>' +
      '<button class="btn" onclick="STATE.loading=false;loadContacts()" style="margin-top:8px">↻ Попробовать снова</button>' +
      '</div>';
  } finally {
    STATE.loading = false;
  }
}

async function loadScrapeStatus() {
  try {
    const r = await api('GET', '/api/mlm/scrape-status');
    STATE.scrapeStatus = r.status;
    const bar = document.getElementById('scrapeBar');
    if (r.status.phase === 'done') {
      bar.innerHTML = `База загружена полностью: <b>${r.status.contacts_total.toLocaleString('ru-RU')}</b> контактов из ${r.status.total_companies} компаний`;
      bar.style.background = 'rgba(34,197,94,0.08)';
    } else {
      bar.innerHTML = `Скрейпинг: компаний <b>${r.status.processed_companies}/${r.status.total_companies}</b>, контактов <b>${r.status.contacts_total.toLocaleString('ru-RU')}</b>  <span class="pct">${r.status.progress_pct}%</span>`;
    }
  } catch (e) { /* silent */ }
}

async function openContact(username) {
  const _listEl = document.getElementById('contactList');
  if (_listEl) {
    STATE.lastScrollTop = _listEl.scrollTop;
    try { sessionStorage.setItem('crm_scroll', String(_listEl.scrollTop)); } catch {}
  }
  STATE.current = username;
  document.querySelectorAll('.list-item').forEach(el => {
    el.classList.toggle('active', el.dataset.username === username);
  });
  document.getElementById('layout').classList.add('show-detail');
  const root = document.getElementById('detailCol');
  root.innerHTML = '<div class="empty">Загрузка…</div>';
  // [opencontact-scroll-2026-05-19] ensure right pane is in view when user is scrolled far down
  try {
    root.scrollTop = 0;
    // Sticky positioning keeps the column visible on desktop, but on
    // browsers without sticky support OR if user scrolled past the layout
    // top, we explicitly scroll the WINDOW to the layout top.
    var layoutEl = document.getElementById('layout');
    if (layoutEl) {
      var rect = layoutEl.getBoundingClientRect();
      if (rect.top < 0) {
        window.scrollTo({ top: window.scrollY + rect.top - 8, behavior: 'smooth' });
      }
    }
  } catch(e) { /* silent */ }
  try {
    const r = await api('GET', '/api/mlm/contacts/' + encodeURIComponent(username));
    renderDetail(r.contact);
  } catch (e) {
    root.innerHTML = '<div class="empty">Ошибка: ' + esc(e.message) + '</div>';
  }
}

function renderDetail(c) {
  window._lastContact = c;
  // After DOM rendered we'll wire listeners (called via setTimeout at end of renderDetail)
  setTimeout(wireDetailHandlers, 0);
  const root = document.getElementById('detailCol');
  const note = c.crm || { status: 'new', needs: '', history: [], nextCall: null, notes: '' };
  // [contact-pills-rich] Each pill = link + 📋 copy. Phone uses sms:, TG/WA
  // use ml.* with prefilled greeting, email uses mailto: with body.
  const ml = msgrLinks(c);
  const greet = buildGreetingFor(c);
  const _g = encodeURIComponent(greet);
  const _esc1q = (v) => esc(String(v)).replace(/'/g, '&#39;');
  const _pill = (href, label, copyVal, copyLabel, target) => {
    const aTarget = target ? ` target="${target}" rel="noopener"` : '';
    const linkHtml = href ? `<a href="${esc(href)}"${aTarget} class="cp-link">${label}</a>` : `<span class="cp-link cp-link-disabled">${label}</span>`;
    const copyHtml = copyVal ? `<button class="cp-copy" title="${esc(copyLabel||'скопировать')}" onclick="event.stopPropagation();window._cpCopy('${_esc1q(copyVal)}','${_esc1q(copyLabel||'скопировано')}')">📋</button>` : '';
    return `<span class="cp-wrap">${linkHtml}${copyHtml}</span>`;
  };
  const links = [];
  if (c.url) links.push(`<a href="${esc(c.url)}" target="_blank" rel="noopener" class="cp-link">profile</a>`);
  if (c.contacts?.telegram) {
    links.push(_pill(ml.tg || c.contacts.telegram, '✈ TG', c.contacts.telegram, 'TG-ссылка скопирована', '_blank'));
  }
  if (c.contacts?.whatsapp) {
    links.push(_pill(ml.wa || c.contacts.whatsapp, '📱 WA', c.contacts.whatsapp, 'WA-ссылка скопирована', '_blank'));
  }
  if (c.phone) {
    const phoneClean = String(c.phone).replace(/[^\d+]/g, '');
    const smsHref = 'sms:' + phoneClean + '?body=' + _g;
    links.push(_pill(smsHref, '📞 ' + esc(c.phone), c.phone, 'телефон скопирован'));
  }
  // [email-removed] mlmbaza emails are obfuscated "[email protected]" — not usable, hidden.
  if (c.contacts?.vk) links.push(_pill(c.contacts.vk, 'VK', c.contacts.vk, 'VK-ссылка', '_blank'));
  if (c.contacts?.instagram) links.push(_pill(c.contacts.instagram, 'IG', c.contacts.instagram, 'IG-ссылка', '_blank'));
  if (c.contacts?.facebook) links.push(_pill(c.contacts.facebook, 'FB', c.contacts.facebook, 'FB-ссылка', '_blank'));
  if (c.contacts?.youtube) links.push(_pill(c.contacts.youtube, 'YT', c.contacts.youtube, 'YT-ссылка', '_blank'));

  root.innerHTML = `
    <div class="detail">
      <button class="btn" onclick="closeDetail()" style="float:right;display:none" id="backBtn">← Назад</button>
      <h2>${esc(c.name || c.username)}</h2>
      <div class="company-line">${esc(c.company || '')} ${c.country ? '· ' + esc(c.country) : ''} ${c.city ? '· ' + esc(c.city) : ''}</div>
      <div class="contact-row">${links.join('')}</div>
      ${(() => {
        const ml = msgrLinks(c);
        if (!c.phone) return '';
        return `<div style="margin-top:10px;padding:10px;background:rgba(139,92,246,0.05);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:11px;color:var(--muted);margin-bottom:6px;text-transform:uppercase">📨 написать с шаблоном</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${ml.wa ? `<button class="btn" onclick="openMsgr('wa','${esc(c.username)}')" style="background:#25D366;color:#fff;border-color:#25D366">📱 whatsapp</button>` : ''}
            ${ml.tg ? `<button class="btn" onclick="openMsgr('tg','${esc(c.username)}')" style="background:#229ED9;color:#fff;border-color:#229ED9">✈ telegram</button>` : ''}
            ${ml.max ? `<button class="btn" onclick="openMsgr('max','${esc(c.username)}')" style="background:#0077FF;color:#fff;border-color:#0077FF">M max</button>` : ''}
            <button class="btn" onclick="navigator.clipboard.writeText(buildGreetingFor(window._lastContact)).then(()=>flash('📋 Текст скопирован'))">📋 копировать текст</button>
            <button class="btn" onclick="window.txmsgOpenWith && window.txmsgOpenWith({person_id: window._lastContact?.id || null, tg_username: window._lastContact?.username || null, name: window._lastContact?.name || ''})" style="background:linear-gradient(135deg,var(--accent),#7c4def);color:#fff;border:none;font-weight:600">📨 Через наш TG</button>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic">«${esc(buildGreetingFor(c))}»</div>
        </div>`;
      })()}
      ${c.description ? `<div class="row"><label>Описание (с mlmbaza)</label><div class="val" style="font-size:12px;color:var(--muted);max-height:140px;overflow-y:auto">${esc(c.description)}</div></div>` : ''}

      <div class="row">
        <label>Статус</label>
        <select id="fStatus">
          <option value="new"${note.status==='new'?' selected':''}>новый</option>
          <option value="in-progress"${note.status==='in-progress'?' selected':''}>в работе</option>
          <option value="callback"${note.status==='callback'?' selected':''}>созвон назначен</option>
          <option value="closed"${note.status==='closed'?' selected':''}>закрыт (продажа)</option>
          <option value="skip"${note.status==='skip'?' selected':''}>не интересно</option>
        </select>
      </div>

      ${renderTagsField(c)}

      <div class="row">
        <label>🤖 AI-разведка лида (roboai)
          <button class="btn" onclick="aiEnrichContact('${esc(c.username)}')" style="float:right;font-size:11px;padding:3px 8px;background:var(--accent);color:#fff">✨ Запустить</button>
        </label>
        <div id="aiEnrichBox" style="min-height:30px;font-size:13px"><div class="empty" style="padding:10px;color:var(--muted);font-style:italic">Нажми "Запустить" — поищу TG-профиль, соцсети, биографию, интересы. Через Groq построю KB.</div></div>
      </div>

      <div class="row">
        <label>Потребности (что узнал у человека) <button class="btn" onclick="enrichNeeds('${esc(c.username)}')" style="float:right;font-size:11px;padding:3px 8px;margin-left:4px">✨ из описания</button>${c.contacts?.telegram ? `<button class="btn" onclick="enrichFromTg('${esc(c.username)}')" style="float:right;font-size:11px;padding:3px 8px">🔍 из TG</button>` : ''}</label>
        <textarea id="fNeeds" placeholder="Чего не хватает? Что ищет? Куда хочет вырасти?">${esc(note.needs || '')}</textarea>
      </div>

      <div class="row">
        <label>Дата следующего созвона</label>
        <input type="date" id="fNextCall" value="${esc(note.nextCall || '')}">
      </div>

      <div class="row">
        <label>Заметки</label>
        <textarea id="fNotes">${esc(note.notes || '')}</textarea>
      </div>

      <div class="actions">
        <button class="btn primary" id="saveCrmBtn" data-uname="${esc(c.username)}">💾 Сохранить</button>
        <button class="btn gold" onclick="generatePitch('${esc(c.username)}')">✨ Сгенерировать предложение</button>
        <button class="btn" onclick="openAgentPack('${esc(c.username)}')">📤 Pack для агента</button>
        ${c.contacts?.telegram ? `<button class="btn" onclick="tgDeeplink('${esc(c.username)}')">✈ Открыть в TG</button>` : ''}
        ${(c.contacts?.telegram && STATE.settings.businessConnection?.id) ? `<button class="btn" onclick="sendViaBot('${esc(c.username)}')" style="background:#229ED9;color:#fff;border-color:#229ED9">🤖 отправить через бота</button>` : ''}
      </div>

      <div id="pitchBox"></div>

      <h4 style="margin-top:24px;font-size:13px;color:var(--muted)">История переписки</h4>
      <div class="history" id="history">
        ${(note.history || []).map(h => `<div class="h-item"><div class="ts">${esc(h.ts)} · ${h.direction==='in'?'входящее':'исходящее'}</div>${esc(h.msg)}</div>`).join('') || '<div class="empty" style="padding:14px">пока пусто</div>'}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="text" id="hMsg" placeholder="Что сегодня писал/сказал…" onkeydown="if(event.key==='Enter')document.getElementById('addHistoryBtn').click()">
        <button class="btn" id="addHistoryBtn" data-uname="${esc(c.username)}">+ запись</button>
      </div>
    </div>`;
}

async function saveCrm(username) {
  if (!username) { flash('username не передан', true); return; }
  const patch = {
    status: document.getElementById('fStatus')?.value,
    needs: document.getElementById('fNeeds')?.value,
    nextCall: document.getElementById('fNextCall')?.value || null,
    notes: document.getElementById('fNotes')?.value,
  };
  const tags = parseTags(document.getElementById('fTags')?.value || '');
  let tagsOk = true, crmOk = false;
  try { await api('PUT', '/api/mlm/contacts/' + encodeURIComponent(username) + '/tags', { tags }); } catch { tagsOk = false; }
  try {
    await api('PUT', '/api/mlm/contacts/' + encodeURIComponent(username) + '/crm', patch);
    crmOk = true;
  } catch (e) { flash('не сохранилось: ' + e.message, true); return; }
  if (crmOk) {
    flash('💾 заметка сохранена' + (tagsOk ? '' : ' (теги пропущены — auth)'));
    loadContacts();
    loadFunnel?.();
    loadDashboard?.();
  }
}

async function addHistory(username) {
  if (!username) { flash('username не передан', true); return; }
  const input = document.getElementById('hMsg');
  const msg = (input?.value || '').trim();
  if (!msg) { flash('пусто — нечего сохранять', true); input?.focus(); return; }
  try {
    await api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/history', { msg });
    if (input) input.value = '';
    flash('+ запись добавлена');
    openContact(username);
  } catch (e) { flash('не сохранилось: ' + e.message, true); }
}

async function generatePitch(username) {
  const offer = prompt('Что ты предлагаешь? (одно предложение или абзац — будет использовано в генерации)',
    'Golden Connect — рекламная платформа: биржа исполнителей, партнёрка 10 уровней, кампании, маркетплейс, ИИ-рассылки и инвайтинг. Мгновенные выплаты в USDT.');
  if (!offer) return;
  const box = document.getElementById('pitchBox');
  box.innerHTML = '<div class="pitch-box">⏳ Генерирую…</div>';
  try {
    const r = await api('POST', `/api/mlm/contacts/${encodeURIComponent(username)}/generate-pitch`, { offer });
    box.innerHTML = `<div class="pitch-box"><div style="margin-bottom:10px;display:flex;gap:8px"><button class="btn" onclick="copyPitch()">📋 Копировать</button><button class="btn" onclick="generatePitch('${esc(username)}')">🔁 Ещё вариант</button><button class="btn" onclick="savePitchToHistory('${esc(username)}')">+ в историю</button></div><div id="pitchText">${esc(r.pitch)}</div></div>`;
  } catch (e) {
    box.innerHTML = `<div class="pitch-box" style="color:var(--red)">Ошибка: ${esc(e.message)}</div>`;
  }
}
function copyPitch() {
  const t = document.getElementById('pitchText')?.innerText || '';
  navigator.clipboard.writeText(t).then(() => flash('📋 Скопировано'));
}
async function savePitchToHistory(username) {
  const t = document.getElementById('pitchText')?.innerText || '';
  if (!t) return;
  await api('POST', `/api/mlm/contacts/${encodeURIComponent(username)}/history`, { msg: t });
  flash('+ в историю');
  openContact(username);
}

async function openAgentPack(username) {
  try {
    const r = await api('GET', `/api/mlm/contacts/${encodeURIComponent(username)}/agent-pack`);
    document.getElementById('agentPackJson').textContent = JSON.stringify(r.pack, null, 2);
    document.getElementById('modalOverlay').classList.add('show');
  } catch (e) { flash('Ошибка: ' + e.message, true); }
}
function closeModal() { document.getElementById('modalOverlay').classList.remove('show'); }
function copyAgentPack() {
  const t = document.getElementById('agentPackJson').textContent;
  navigator.clipboard.writeText(t).then(() => flash('📋 Скопировано'));
}
function closeDetail() {
  document.getElementById('layout').classList.remove('show-detail');
  const el = document.getElementById('contactList');
  if (el && STATE.lastScrollTop != null) {
    requestAnimationFrame(() => { el.scrollTop = STATE.lastScrollTop; });
  }
}

function flash(msg, err) {
  const d = document.createElement('div');
  d.textContent = msg;
  d.style = `position:fixed;top:20px;left:50%;transform:translateX(-50%);background:${err?'#ef4444':'#22c55e'};color:#fff;padding:10px 18px;border-radius:8px;z-index:200;font-size:13px;font-weight:500`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2200);
}


async function loadFacets() {
  try {
    const r = await api('GET', '/api/mlm/facets');
    const f = r.facets;
    const fillSel = (id, items, all) => {
      const sel = document.getElementById(id);
      const cur = sel.value;
      sel.innerHTML = '<option value="">' + all + '</option>' +
        items.map(it => '<option value="' + esc(it.key) + '"' + (cur === it.key ? ' selected' : '') + '>' + esc(it.key) + ' (' + it.count + ')</option>').join('');
    };
    fillSel('catSelect', f.categories, 'все направления');
    fillSel('countrySelect', f.countries.slice(0,40), 'все страны');
    fillSel('citySelect', f.cities.slice(0,80), 'все города');
  } catch (e) { /* silent */ }
}

async function loadGroupbyBar() {
  try {
    const r = await api('GET', '/api/mlm/groupby?by=category');
    const top = r.groups.slice(0, 12);
    document.getElementById('groupbyBar').innerHTML = top.map(g =>
      '<button class="pill cat-pill" data-cat="' + esc(g.key) + '">' + esc(g.key) + ' · <b>' + g.count + '</b></button>'
    ).join('');
    document.querySelectorAll('.cat-pill').forEach(b => {
      b.addEventListener('click', () => {
        STATE.category = b.dataset.cat === STATE.category ? '' : b.dataset.cat;
        document.getElementById('catSelect').value = STATE.category;
        STATE.offset = 0;
        loadContacts();
        document.querySelectorAll('.cat-pill').forEach(x => x.classList.toggle('on', x.dataset.cat === STATE.category));
      });
    });
  } catch (e) { /* silent */ }
}

// --- wire events ---
document.getElementById('searchInput').addEventListener('input', (e) => {
  STATE.q = e.target.value;
  STATE.offset = 0;
  STATE.appendMode = false;
  clearTimeout(window._sT);
  window._sT = setTimeout(() => { saveStateToUrl(); loadContacts(); }, 250);
});
document.getElementById('sortSelect').addEventListener('change', (e) => {
  STATE.sort = e.target.value;
  STATE.offset = 0;
  STATE.appendMode = false;
  saveStateToUrl();
  checkAiCta();
  loadContacts();
});
// [contacted-history-2026-05-19] pill click also adjusts sort for contacted / todo-callback
document.querySelectorAll('.toolbar .pill[data-filter]').forEach(b => {
  b.addEventListener('click', () => {
    const f = b.dataset.filter;
    const adding = !STATE.filters.has(f);
    if (adding) STATE.filters.add(f); else STATE.filters.delete(f);
    b.classList.toggle('on');
    // Auto-set sort when a context-aware pill is toggled ON
    var sortSel = document.getElementById('sortSelect');
    if (sortSel) {
      if (adding && f === 'contacted' && (STATE.sort === 'fresh' || !STATE.sort)) {
        STATE.sort = 'last-contact';
        sortSel.value = 'last-contact';
      } else if (adding && f === 'todo-callback' && (STATE.sort === 'fresh' || !STATE.sort)) {
        STATE.sort = 'next-call';
        sortSel.value = 'next-call';
      } else if (!adding && (f === 'contacted' || f === 'todo-callback')) {
        // Revert to fresh ONLY if currently on the auto-set sort
        if (f === 'contacted' && STATE.sort === 'last-contact') { STATE.sort = 'fresh'; sortSel.value = 'fresh'; }
        if (f === 'todo-callback' && STATE.sort === 'next-call') { STATE.sort = 'fresh'; sortSel.value = 'fresh'; }
      }
    }
    STATE.offset = 0;
    STATE.appendMode = false;
    saveStateToUrl();
    loadContacts();
  });
});
// [export-frontend-2026-05-20] export only contacted leads, handle empty case with a clear alert
document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  const params = new URLSearchParams({
    sort: STATE.sort, q: STATE.q,
    filter: [...STATE.filters].join(','),
    category: STATE.category, country: STATE.country, city: STATE.city,
  });
  const oldTxt = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳ готовлю…';
  try {
    const r = await fetch(API_BASE + '/api/mlm/export.xlsx?' + params, { credentials: 'same-origin' });
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      // server returned a structured error (e.g. no contacted leads)
      const j = await r.json().catch(() => ({}));
      alert(j.detail || j.reason || 'Не удалось сформировать экспорт.');
      return;
    }
    if (!r.ok) { alert('Ошибка экспорта: ' + r.status); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mlm-my-contacts-' + new Date().toISOString().slice(0,10) + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) {
    alert('Сеть недоступна: ' + (e.message || e));
  } finally {
    btn.disabled = false; btn.textContent = oldTxt;
  }
});
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});


['catSelect','countrySelect','citySelect'].forEach(id => {
  document.getElementById(id).addEventListener('change', (e) => {
    const f = id.replace('Select','');
    STATE[f === 'cat' ? 'category' : f] = e.target.value;
    STATE.offset = 0;
    STATE.appendMode = false;
    saveStateToUrl();
    loadContacts();
  });
});
document.getElementById('clearFiltersBtn')?.addEventListener('click', clearAllFilters);

// init
loadStateFromUrl();
loadFacets();
loadGroupbyBar();
loadScrapeStatus();
loadSettings();
loadFunnel();
loadDashboard();
startSSE();
setupDashboardClicks();
// [default-in-work] Default view on open = 'В работе' (contacted filter).
// switchToView('in-work') handles: clear filters → add 'contacted' → toggle
// pill → loadContacts(). Fast because most users have <100 contacted entries.
setupInfiniteScroll();
switchToView('in-work');
setInterval(loadScrapeStatus, 30000);   // refresh scrape progress every 30s


// ---------- Settings ----------
async function loadSettings() {
  try {
    const r = await api('GET', '/api/mlm/settings');
    STATE.settings = r.settings || STATE.settings;
  } catch {}
}
function openSettings() {
  document.getElementById('settingOffer').value = STATE.settings.defaultOffer || '';
  document.getElementById('settingGreeting').value = STATE.settings.greetingTemplate || DEFAULT_GREETING;
  document.getElementById('settingTone').value = STATE.settings.tone || 'warm';
  document.getElementById('settingDailyBatch').value = STATE.settings.dailyBatchSize || 25;
  document.getElementById('settingDigestChat').value = STATE.settings.digestChatId || '';
  // Workflow rules
  api('GET','/api/mlm/workflow-rules').then(r => {
    document.getElementById('settingWorkflowRules').value = (r.rules?.length ? JSON.stringify(r.rules, null, 2) : '');
  }).catch(() => {});
  api('GET','/api/mlm/custom-fields').then(r => {
    document.getElementById('settingCustomFields').value = (r.defs?.length ? JSON.stringify(r.defs, null, 2) : '');
  }).catch(() => {});
  api('GET','/api/mlm/webhooks').then(r => {
    document.getElementById('settingWebhookUrls').value = (r.urls || []).join('\n');
  }).catch(() => {});
  updateBizStatus();
  document.getElementById('settingOffersByCategory').value =
    STATE.settings.offersByCategory && Object.keys(STATE.settings.offersByCategory).length
      ? JSON.stringify(STATE.settings.offersByCategory, null, 2) : '';
  document.getElementById('settingLang').value = STATE.settings.lang || 'ru';
  document.getElementById('settingsOverlay').classList.add('show');
}
function closeSettings() { document.getElementById('settingsOverlay').classList.remove('show'); }
async function saveSettings() {
  const patch = {
    defaultOffer: document.getElementById('settingOffer').value,
    greetingTemplate: document.getElementById('settingGreeting').value,
    tone: document.getElementById('settingTone').value,
    dailyBatchSize: +document.getElementById('settingDailyBatch').value || 25,
    digestChatId: document.getElementById('settingDigestChat').value.trim() || null,
    offersByCategory: (() => {
      try { return JSON.parse(document.getElementById('settingOffersByCategory').value || '{}'); }
      catch { flash('JSON по направлениям невалиден — пропустил', true); return STATE.settings.offersByCategory || {}; }
    })(),
    lang: document.getElementById('settingLang').value,
  };
  try {
    const r = await api('PUT', '/api/mlm/settings', patch);
    // Workflow rules
    try {
      const wfRaw = document.getElementById('settingWorkflowRules').value.trim();
      const rules = wfRaw ? JSON.parse(wfRaw) : [];
      await api('PUT', '/api/mlm/workflow-rules', { rules });
    } catch (e) { console.warn('workflow rules JSON invalid'); }
    // Custom fields
    try {
      const cfRaw = document.getElementById('settingCustomFields').value.trim();
      const defs = cfRaw ? JSON.parse(cfRaw) : [];
      await api('PUT', '/api/mlm/custom-fields', { defs });
    } catch (e) { console.warn('custom fields JSON invalid'); }
    // Webhooks
    const urls = document.getElementById('settingWebhookUrls').value.split(/\n/).map(u => u.trim()).filter(Boolean);
    await api('PUT', '/api/mlm/webhooks', { urls });
    STATE.settings = r.settings;
    closeSettings();
    flash('💾 Сохранено');
    if (STATE.sort === 'ai') loadContacts();
  } catch (e) { flash('Ошибка: ' + e.message, true); }
}

// ---------- Bulk select / actions ----------
function toggleSelect(username, checked) {
  if (checked) STATE.selected.add(username); else STATE.selected.delete(username);
  updateBulkBar();
}
function bulkClear() { STATE.selected.clear(); updateBulkBar(); document.querySelectorAll('.bulk-cb').forEach(c => c.checked = false); }
function updateBulkBar() {
  const n = STATE.selected.size;
  document.getElementById('bulkBar').style.display = n ? 'flex' : 'none';
  document.getElementById('bulkCount').textContent = n + ' выбрано';
}
async function bulkPitch() {
  if (!STATE.selected.size) return;
  if (!STATE.settings.defaultOffer) { flash('Сначала задай «Мой оффер» в настройках ⚙', true); return; }
  if (STATE.selected.size > 30) { flash('За раз не больше 30 (Groq rate limit)', true); return; }
  if (!confirm(`Сгенерировать pitches для ${STATE.selected.size} контактов? Будет потрачено столько же запросов к Groq.`)) return;
  flash('⏳ Генерирую…');
  try {
    const r = await api('POST', '/api/mlm/bulk-pitch', { usernames: [...STATE.selected] });
    const ok = r.results.filter(x => x.ok).length;
    const fail = r.results.length - ok;
    flash(`✅ Сгенерировано ${ok}${fail ? `, ошибок ${fail}` : ''}`);
    bulkClear();
    loadContacts();
    loadFunnel();
  } catch (e) { flash('Ошибка: ' + e.message, true); }
}
function bulkPack() {
  if (!STATE.selected.size) return;
  const u = [...STATE.selected].join(',');
  api('GET', '/api/mlm/bulk-pack?usernames=' + encodeURIComponent(u)).then(r => {
    document.getElementById('agentPackJson').textContent = JSON.stringify(r.pack, null, 2);
    document.getElementById('modalOverlay').classList.add('show');
  }).catch(e => flash('Ошибка: ' + e.message, true));
}

// ---------- Funnel ----------
async function loadFunnel() {
  try {
    const r = await api('GET', '/api/mlm/funnel');
    const f = r.funnel;
    if (!f.touched) { document.getElementById('funnelBar').style.display = 'none'; return; }
    const b = f.buckets;
    document.getElementById('funnelBar').style.display = 'block';
    document.getElementById('funnelBar').innerHTML =
      `📊 Воронка: <b style="color:#9ba1ad">${b.new} новых</b> → <b style="color:#f97316">${b['in-progress']} в работе</b> → <b style="color:#3b82f6">${b.callback} созвон</b> → <b style="color:#22c55e">${b.closed} закрыто</b> · ${b.skip} пропущено · всего касаний: <b>${f.touched}</b>`;
  } catch {}
}

// ---------- CSV import ----------
function openCsv() { document.getElementById('csvOverlay').classList.add('show'); }
function closeCsv() { document.getElementById('csvOverlay').classList.remove('show'); }
async function uploadCsv() {
  const csv = document.getElementById('csvText').value.trim();
  if (!csv) return;
  try {
    const r = await fetch(API_BASE + '/api/mlm/import-csv', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'text/csv' },
      body: csv,
    });
    const data = await r.json();
    if (!data.ok) throw new Error(data.reason || 'fail');
    flash(`📥 Добавлено ${data.added} контактов (всего custom: ${data.total_custom})`);
    closeCsv();
    document.getElementById('csvText').value = '';
    loadContacts();
    loadScrapeStatus();
  } catch (e) { flash('Ошибка: ' + e.message, true); }
}

// TG deeplink — открывает чат с предзаполненным текстом из последнего pitch
function tgDeeplink(username) {
  const c = window._lastContact;
  if (!c?.contacts?.telegram) return;
  let url = c.contacts.telegram;
  // Take last out-msg from history if any
  const last = (c.crm?.history || []).slice().reverse().find(h => h.direction === 'out');
  if (last) url += (url.includes('?') ? '&' : '?') + 'text=' + encodeURIComponent(last.msg);
  window.open(url, '_blank');
}

['settingsOverlay','csvOverlay','calOverlay','quickAddOverlay','activityOverlay','analyticsOverlay','bizInstrOverlay','tasksOverlay','dealsOverlay','reportsOverlay'].forEach(id => {
  document.getElementById(id)?.addEventListener('click', e => { if (e.target.id === id) e.target.classList.remove('show'); });
});


// ---------- Infinite scroll ----------
function loadMore() {
  if (STATE.loading) return;
  STATE.appendMode = true;
  STATE.offset = STATE.loadedItems.length;
  loadContacts().finally(() => { STATE.appendMode = false; });
}
function setupInfiniteScroll() {
  const list = document.getElementById('contactList');
  if (!list || list._scrollWired) return;
  list._scrollWired = true;
  list.addEventListener('scroll', () => {
    STATE.lastScrollTop = list.scrollTop;
    try { sessionStorage.setItem('crm_scroll', String(list.scrollTop)); } catch {}
    if (STATE.loading) return;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 200;
    if (atBottom && STATE.loadedItems.length < STATE.total) {
      loadMore();
    }
  });
}

// ---------- Select-all helpers ----------
function selectAllOnPage() {
  STATE.loadedItems.forEach(c => STATE.selected.add(c.username));
  document.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = true);
  updateBulkBar();
}
async function selectAllMatching() {
  if (STATE.total > 500 && !confirm(`Выбрать все ${STATE.total} контактов под фильтром? Это много.`)) return;
  flash('⏳ Загружаю всех…');
  try {
    const params = new URLSearchParams({
      sort: STATE.sort, q: STATE.q, offset: 0, limit: Math.min(STATE.total, 5000),
      filter: [...STATE.filters].join(','),
      offer: STATE.sort === 'ai' ? STATE.settings.defaultOffer : '',
      category: STATE.category, country: STATE.country, city: STATE.city,
    });
    const r = await api('GET', '/api/mlm/contacts?' + params);
    r.items.forEach(c => STATE.selected.add(c.username));
    document.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = true);
    updateBulkBar();
    flash(`☑ Выбрано ${STATE.selected.size}`);
  } catch (e) { flash('Ошибка: ' + e.message, true); }
}

// ---------- Clear filters ----------
function clearAllFilters() {
  STATE.filters.clear();
  STATE.category = STATE.country = STATE.city = STATE.q = '';
  STATE.sort = 'fresh';
  STATE.offset = 0;
  document.getElementById('searchInput').value = '';
  document.getElementById('sortSelect').value = 'fresh';
  document.getElementById('catSelect').value = '';
  document.getElementById('countrySelect').value = '';
  document.getElementById('citySelect').value = '';
  document.querySelectorAll('.toolbar .pill.on').forEach(p => p.classList.remove('on'));
  saveStateToUrl();
  loadContacts();
}

// ---------- URL state (read+write) ----------
function saveStateToUrl() {
  const p = new URLSearchParams();
  if (STATE.sort && STATE.sort !== 'fresh') p.set('sort', STATE.sort);
  if (STATE.q) p.set('q', STATE.q);
  if (STATE.category) p.set('cat', STATE.category);
  if (STATE.country) p.set('country', STATE.country);
  if (STATE.city) p.set('city', STATE.city);
  if (STATE.filters.size) p.set('f', [...STATE.filters].join(','));
  const url = location.pathname + (p.toString() ? '?' + p.toString() : '') + location.hash;
  history.replaceState(null, '', url);
}
function loadStateFromUrl() {
  const p = new URLSearchParams(location.search);
  if (p.get('sort')) STATE.sort = p.get('sort');
  if (p.get('q')) STATE.q = p.get('q');
  if (p.get('cat')) STATE.category = p.get('cat');
  if (p.get('country')) STATE.country = p.get('country');
  if (p.get('city')) STATE.city = p.get('city');
  if (p.get('f')) (p.get('f').split(',').filter(Boolean)).forEach(x => STATE.filters.add(x));
  // Sync DOM
  document.getElementById('searchInput').value = STATE.q;
  document.getElementById('sortSelect').value = STATE.sort;
  STATE.filters.forEach(f => {
    const b = document.querySelector(`.toolbar .pill[data-filter="${f}"]`);
    if (b) b.classList.add('on');
  });
}

// ---------- Inline status edit (in row) ----------
function changeStatusInline(username, newStatus) {
  api('PUT', `/api/mlm/contacts/${encodeURIComponent(username)}/crm`, { status: newStatus })
    .then(() => { flash('✓ ' + newStatus); loadContacts(); loadFunnel(); })
    .catch(e => flash('Auth? ' + e.message, true));
}

function normPhone(p) { return String(p || '').replace(/[^\d+]/g, '').replace(/^00/, '+'); }
function msgrLinks(c) {
  const phone = normPhone(c.phone);
  const phoneNoplus = phone.replace(/^\+/, '');
  const text = encodeURIComponent(buildGreetingFor(c));
  return {
    wa: phone ? `https://wa.me/${phoneNoplus}?text=${text}` : null,
    tg: c.contacts?.telegram
      ? c.contacts.telegram + (c.contacts.telegram.includes('?') ? '&' : '?') + 'text=' + text
      : (phone ? `https://t.me/${phone}` : null),
    max: phone ? `https://max.ru/${phoneNoplus}` : null,
  };
}


// Open messenger with greeting pre-copied to clipboard (insurance for
// TG/MAX where deep-link ?text= doesn't always carry through).
window.openMsgr = function(kind, username) {
  const c = STATE.loadedItems.find(x => x.username === username) || window._lastContact;
  if (!c) { flash('контакт не найден', true); return; }
  const text = buildGreetingFor(c);
  const ml = msgrLinks(c);
  const url = ml[kind];
  if (!url) { flash('нет ' + kind + ' для этого контакта', true); return; }
  // Авто-трекинг: статус → "в работе" + запись в history
  api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/share-click', { channel: kind }).catch(()=>{});
  tgHaptic('medium');
  // [openMsgr-tg-gate] Inside a REAL Telegram WebApp — initData is signed by TG.
  // Outside (regular browser with telegram-web-app.js loaded), TG_INIT_DATA is ''
  // and TG.openTelegramLink/openLink hang trying to reach a TG-host frame.
  if (TG && TG_INIT_DATA) {
    if (kind === 'tg' && c.contacts?.telegram) {
      // Copy greeting first, then open the contact's TG profile via the
      // Telegram-native opener (no browser tab switch).
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      try { TG.openTelegramLink(c.contacts.telegram); } catch (_) { window.open(url, '_blank'); }
      flash('📋 текст в буфере — вставь в чат');
    } else if (kind === 'wa' || kind === 'max') {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
      try { TG.openLink(url); } catch (_) { window.open(url, '_blank'); }
      flash('📋 текст в буфере · открываю ' + kind);
    } else {
      window.open(url, '_blank');
    }
  } else {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        flash('📋 текст в буфере — вставь в чат (ctrl+v) · контакт в работе');
      }).catch(() => {});
    }
    window.open(url, '_blank');
  }
  // Обновить статусы в UI
  setTimeout(() => { loadDashboard(); loadFunnel(); loadContacts(); }, 1000);
};

// ─── Native "Share to TG chat" — uses Telegram inline-mode picker ────────
// Inside the Telegram WebApp, this opens the chat list to pick recipients,
// pre-filling the inline query so @Golden ConnectTGbot returns the matching
// contact card. Outside TG, falls back to the legacy t.me/share URL.
window.tgShareContact = function(username) {
  const c = STATE.loadedItems.find(x => x.username === username) || window._lastContact;
  if (!c) { flash('контакт не найден', true); return; }
  api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/share-click', { channel: 'inline' }).catch(()=>{});
  tgHaptic('light');
  if (TG && TG.switchInlineQuery) {
    try {
      TG.switchInlineQuery(c.name || c.username, ['users', 'groups']);
      return;
    } catch (_) {}
  }
  const text = buildGreetingFor(c);
  const url = 'https://t.me/share/url?url=' + encodeURIComponent('https://goldenConnect.to') + '&text=' + encodeURIComponent(text);
  window.open(url, '_blank');
};


// ---------- Dashboard ----------
async function loadDashboard() {
  try {
    const r = await api('GET', '/api/mlm/dashboard');
    const d = r.dashboard;
    if (!d.touched_total) {
      // First-time user — still show "today" call to action
      document.getElementById('dashboardBar').style.display = 'block';
      document.getElementById('dashInWork').textContent = '0';
      document.getElementById('dashWeek').textContent = '0';
      document.getElementById('dashWeekHint').textContent = '0 сегодня';
      document.getElementById('dashClosed').textContent = '0';
    } else {
      document.getElementById('dashboardBar').style.display = 'block';
      document.getElementById('dashInWork').textContent = d.in_work;
      document.getElementById('dashWeek').textContent = d.week_callbacks;
      document.getElementById('dashWeekHint').textContent = d.today_callbacks + ' сегодня';
      document.getElementById('dashClosed').textContent = d.closed;
    }
  } catch {}
  try {
    const t = await api('GET', '/api/mlm/today');
    const total = t.batch.scheduled.length + t.batch.untouched.length;
    document.getElementById('dashToday').textContent = total;
    document.getElementById('dashTodayHint').textContent = t.batch.scheduled.length + ' созвонов + ' + t.batch.untouched.length + ' новых';
  } catch {}
}

function setupDashboardClicks() {
  // [click-debug] Log every binding + every click so we know it's wired
  const cards = document.querySelectorAll('.dash-card');
  console.log('[setupDashboardClicks] found ' + cards.length + ' .dash-card tiles');
  cards.forEach(b => {
    if (b._wired) return;
    b._wired = true;
    b.addEventListener('click', (e) => {
      console.log('[dash-card CLICK] view=' + b.dataset.view);
      e.preventDefault();
      e.stopPropagation();
      switchToView(b.dataset.view);
    });
  });
}

function resetFiltersUi() {
  STATE.filters.clear();
  STATE.category = STATE.country = STATE.city = STATE.q = '';
  STATE.appendMode = false; STATE.offset = 0;
  document.querySelectorAll('.toolbar .pill.on').forEach(p => p.classList.remove('on'));
  document.getElementById('searchInput').value = '';
  ['catSelect','countrySelect','citySelect'].forEach(id => document.getElementById(id).value = '');
}

async function switchToView(view) {
  // [click-debug] Trace KPI tile clicks + reset stuck loading state.
  console.log('%c[switchToView]%c view=' + view, 'background:#00d4ff;color:#000;padding:2px 5px;border-radius:3px', 'color:#9ba1ad', '(was STATE.loading=' + STATE.loading + ')');
  STATE.loading = false;
  if (view === 'calendar') return openCalendar();
  resetFiltersUi();
  if (view === 'in-work') {
    STATE.filters.add('contacted');
    document.querySelector(".toolbar .pill[data-filter='contacted']")?.classList.add('on');
    saveStateToUrl(); loadContacts();
  } else if (view === 'callbacks') {
    STATE.filters.add('todo-callback');
    document.querySelector(".toolbar .pill[data-filter='todo-callback']")?.classList.add('on');
    saveStateToUrl(); loadContacts();
  } else if (view === 'closed') {
    STATE.filters.add('contacted');
    document.querySelector(".toolbar .pill[data-filter='contacted']")?.classList.add('on');
    flash('фильтр "в работе" — для статуса "закрыт" используй сорт по статусам');
    saveStateToUrl(); loadContacts();
  } else if (view === 'today') {
    return openTodayView();
  }
}

async function openTodayView() {
  flash('⏳ загружаю дневную пачку…');
  try {
    const r = await api('GET', '/api/mlm/today');
    const items = r.batch.scheduled.concat(r.batch.untouched);
    if (!items.length) { flash('сегодня всё выполнено! 🎉'); return; }
    STATE.loadedItems = items.slice();
    STATE.total = items.length;
    renderList(items, false);
    document.getElementById('searchInput').placeholder = '📅 пачка на сегодня: ' + items.length + ' контактов';
    // [active-view-header] manual override for today-batch which doesn't use STATE.filters
    const _avh = document.getElementById('activeViewHeader');
    if (_avh) {
      _avh.innerHTML = '<span class="avh-icon">📅</span><span class="avh-label">На сегодня</span>' +
        '<span class="avh-count">' + items.length + ' контактов</span>' +
        '<button class="avh-clear" onclick="clearAllFilters()">✕ Сбросить</button>';
      _avh.style.display = 'flex';
    }
    flash('📅 пачка на сегодня: ' + r.batch.scheduled.length + ' созвонов + ' + r.batch.untouched.length + ' приоритетных');
  } catch (e) { flash('ошибка: ' + e.message, true); }
}



function wireDetailHandlers() {
  const saveBtn = document.getElementById('saveCrmBtn');
  if (saveBtn && !saveBtn._wired) {
    saveBtn._wired = true;
    saveBtn.addEventListener('click', () => saveCrm(saveBtn.dataset.uname));
  }
  const histBtn = document.getElementById('addHistoryBtn');
  if (histBtn && !histBtn._wired) {
    histBtn._wired = true;
    histBtn.addEventListener('click', () => addHistory(histBtn.dataset.uname));
  }
  // Autosave on blur for notes/needs (with subtle flash)
  ['fNotes','fNeeds','fTags'].forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._wired) return;
    el._wired = true;
    el.addEventListener('blur', () => {
      if (saveBtn) silentSave(saveBtn.dataset.uname);
    });
  });
}
async function silentSave(username) {
  if (!username) return;
  const patch = {
    status: document.getElementById('fStatus')?.value,
    needs: document.getElementById('fNeeds')?.value,
    nextCall: document.getElementById('fNextCall')?.value || null,
    notes: document.getElementById('fNotes')?.value,
  };
  const tags = parseTags(document.getElementById('fTags')?.value || '');
  try {
    await api('PUT', '/api/mlm/contacts/' + encodeURIComponent(username) + '/tags', { tags });
    await api('PUT', '/api/mlm/contacts/' + encodeURIComponent(username) + '/crm', patch);
    flash('💾 авто-сохранено');
  } catch (e) {
    flash('не сохранилось: ' + e.message, true);
  }
}


// ---------- L3: Activity log ----------
function openActivity() {
  document.getElementById('activityOverlay').classList.add('show');
  loadActivity();
}
function closeActivity() { document.getElementById('activityOverlay').classList.remove('show'); }
async function loadActivity() {
  const body = document.getElementById('activityBody');
  body.innerHTML = '<div class="empty">⏳…</div>';
  try {
    const r = await api('GET', '/api/mlm/activity?limit=100');
    if (!r.log.length) { body.innerHTML = '<div class="empty">пока пусто — пиши контактам, история появится тут</div>'; return; }
    body.innerHTML = r.log.map(h => {
      const date = h.ts ? new Date(h.ts).toLocaleString('ru-RU') : '';
      const dir = h.direction === 'share-click' ? '📤 ' + (h.channel || '') :
                  h.direction === 'sent-via-bot' ? '🤖 через бота' :
                  h.direction === 'in' ? '⬅ входящее' : '➡ исходящее';
      return '<div style="padding:8px 10px;background:var(--card);border-radius:6px;margin-bottom:6px;cursor:pointer" onclick="closeActivity();openContact(\'' + esc(h.username) + '\')">' +
        '<div style="font-size:11px;color:var(--muted)">' + esc(date) + ' · ' + esc(dir) + '</div>' +
        '<div style="font-weight:600;font-size:13px">' + esc(h.contact_name) + '</div>' +
        '<div style="font-size:12px;color:var(--text);margin-top:3px">' + esc(h.msg) + '</div>' +
        '</div>';
    }).join('');
  } catch (e) { body.innerHTML = '<div class="empty">ошибка: ' + esc(e.message) + '</div>'; }
}

// ---------- L3: Analytics (conversion + heatmap) ----------
function openAnalytics() {
  document.getElementById('analyticsOverlay').classList.add('show');
  loadAnalytics();
}
function closeAnalytics() { document.getElementById('analyticsOverlay').classList.remove('show'); }
async function loadAnalytics() {
  const body = document.getElementById('analyticsBody');
  body.innerHTML = '<div class="empty">⏳…</div>';
  try {
    const [conv, hm] = await Promise.all([
      api('GET', '/api/mlm/conversion?days=30'),
      api('GET', '/api/mlm/heatmap?days=30'),
    ]);
    const c = conv.conversion;
    // Heatmap
    const m = hm.heatmap.matrix;
    const max = Math.max(1, ...m.flat());
    const days = ['пн','вт','ср','чт','пт','сб','вс'];
    let table = '<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px"><tr><td></td>' +
      Array.from({length:24}, (_,h) => '<td style="text-align:center;color:var(--muted);padding:2px">' + h + '</td>').join('') + '</tr>';
    for (let d = 0; d < 7; d++) {
      table += '<tr><td style="color:var(--muted);padding:2px 6px">' + days[d] + '</td>';
      for (let h = 0; h < 24; h++) {
        const v = m[d][h];
        const alpha = v / max;
        table += '<td style="background:rgba(139,92,246,' + (0.05 + alpha * 0.85) + ');text-align:center;padding:4px 1px;color:' + (alpha > 0.4 ? '#fff' : 'var(--muted)') + '">' + (v || '') + '</td>';
      }
      table += '</tr>';
    }
    table += '</table>';
    body.innerHTML =
      '<h4 style="margin-top:8px">📈 Конверсия за 30 дней</h4>' +
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">' +
        '<div style="padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">всего касаний</div><div style="font-size:22px;font-weight:700">' + c.touched + '</div></div>' +
        '<div style="padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">в работе</div><div style="font-size:22px;font-weight:700;color:var(--gold)">' + c.in_work + '</div></div>' +
        '<div style="padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">созвоны</div><div style="font-size:22px;font-weight:700;color:#3b82f6">' + c.callback + '</div></div>' +
        '<div style="padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">закрытия</div><div style="font-size:22px;font-weight:700;color:var(--green)">' + c.closed + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:12px;margin-bottom:14px">' +
        '<div style="flex:1;padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">% до созвона</div><div style="font-size:18px;font-weight:700">' + c.conversion_to_callback_pct + '%</div></div>' +
        '<div style="flex:1;padding:10px;background:var(--card);border-radius:8px"><div style="color:var(--muted);font-size:11px">% до закрытия</div><div style="font-size:18px;font-weight:700">' + c.conversion_to_closed_pct + '%</div></div>' +
      '</div>' +
      '<h4 style="margin-top:18px">🔥 Heatmap отправок (пн-вс × 00-23)</h4>' +
      '<div style="font-size:11px;color:var(--muted);margin-bottom:6px">когда чаще писал — фиолетово, пусто — тёмно</div>' +
      table;
  } catch (e) { body.innerHTML = '<div class="empty">ошибка: ' + esc(e.message) + '</div>'; }
}

// ---------- L4: Business Bot ----------
function openBizInstructions() { document.getElementById('bizInstrOverlay').classList.add('show'); }
function closeBizInstr() { document.getElementById('bizInstrOverlay').classList.remove('show'); }

async function updateBizStatus() {
  const box = document.getElementById('bizStatusBox');
  if (!box) return;
  const bc = STATE.settings.businessConnection;
  if (bc?.id) {
    box.innerHTML = '<span style="color:var(--green)">✓ Business Bot подключён</span> · user_id <code>' + (bc.user_id || '?') + '</code> · ' + (bc.can_reply ? 'можно слать сообщения' : 'только чтение');
  } else {
    box.innerHTML = 'Business Bot не подключён. Нажми инструкцию ниже — это даст возможность слать сообщения автоматом от твоего имени в один клик.';
  }
}

async function sendViaBot(username) {
  if (!STATE.settings.businessConnection?.id) {
    flash('сначала подключи Business Bot (см. ⚙ настройки)', true); return;
  }
  const text = prompt('Текст сообщения (отправится прямо сейчас от твоего имени через бота):', buildGreetingFor(window._lastContact));
  if (!text?.trim()) return;
  try {
    const r = await api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/send-via-bot', { text });
    flash('🤖 отправлено через бота');
    openContact(username);
  } catch (e) { flash('не отправилось: ' + e.message, true); }
}


// ---------- A1 — Kanban view ----------
const KANBAN_COLS = [
  { id: 'new', title: 'новые', color: '#9ba1ad' },
  { id: 'in-progress', title: 'в работе', color: '#f97316' },
  { id: 'callback', title: 'созвон', color: '#3b82f6' },
  { id: 'closed', title: 'закрыто', color: '#22c55e' },
  { id: 'skip', title: 'нет', color: '#ef4444' },
];
let KANBAN_ON = false;
function toggleKanban() {
  KANBAN_ON = !KANBAN_ON;
  document.getElementById('kanbanView').style.display = KANBAN_ON ? 'block' : 'none';
  document.getElementById('layout').style.display = KANBAN_ON ? 'none' : 'grid';
  if (KANBAN_ON) loadKanban();
}
async function loadKanban() {
  const wrap = document.getElementById('kanbanCols');
  wrap.innerHTML = '<div class="empty">⏳…</div>';
  try {
    const params = new URLSearchParams({
      category: STATE.category || '',
      country: STATE.country || '',
    });
    const r = await api('GET', '/api/mlm/kanban?' + params);
    wrap.innerHTML = KANBAN_COLS.map(col => {
      const cards = r.columns[col.id] || [];
      const cardsHtml = cards.map(c =>
        '<div class="kanban-card" draggable="true" data-uname="' + esc(c.username) + '" style="padding:8px 10px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:grab" onclick="openContact(\'' + esc(c.username) + '\')">' +
          '<div style="font-weight:600;font-size:13px">' + esc(c.name || c.username) + '</div>' +
          '<div style="font-size:11px;color:var(--muted)">' + esc(c.company || '') + ' · ' + esc(c.city || c.country || '') + '</div>' +
          (c.crm?.notes ? '<div style="font-size:11px;margin-top:4px;color:var(--text)">' + esc(c.crm.notes.slice(0,80)) + '</div>' : '') +
        '</div>'
      ).join('');
      return '<div class="kanban-col" data-col="' + col.id + '" style="flex:1;min-width:240px;background:var(--card);border-radius:8px;padding:10px;border-top:3px solid ' + col.color + '">' +
        '<div style="font-weight:600;margin-bottom:8px;color:' + col.color + '">' + col.title + ' · ' + cards.length + '</div>' +
        '<div class="kanban-col-body" style="min-height:50px">' + (cards.length ? cardsHtml : '<div class="empty" style="padding:14px;font-size:11px">пусто</div>') + '</div>' +
        '</div>';
    }).join('');
    wireKanbanDnD();
  } catch (e) { wrap.innerHTML = '<div class="empty">ошибка: ' + esc(e.message) + '</div>'; }
}
function wireKanbanDnD() {
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/uname', card.dataset.uname);
      card.style.opacity = '0.4';
    });
    card.addEventListener('dragend', () => card.style.opacity = '1');
  });
  document.querySelectorAll('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.style.background = 'rgba(139,92,246,0.1)'; });
    col.addEventListener('dragleave', () => col.style.background = '');
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.style.background = '';
      const u = e.dataTransfer.getData('text/uname');
      const newStatus = col.dataset.col;
      if (!u || !newStatus) return;
      try {
        await api('PUT', '/api/mlm/contacts/' + encodeURIComponent(u) + '/crm', { status: newStatus });
        flash('→ ' + newStatus);
        loadKanban();
        loadDashboard?.();
      } catch (e) { flash('ошибка: ' + e.message, true); }
    });
  });
}

// ---------- A2 — Saved Views ----------
async function loadViews() {
  try {
    const r = await api('GET', '/api/mlm/views');
    const sel = document.getElementById('viewSelect');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">📌 view…</option>' +
      r.views.map(v => '<option value="' + esc(v.id) + '">' + esc(v.name) + '</option>').join('') +
      '<option value="__manage__">⚙ управлять</option>';
    sel.value = cur;
  } catch {}
}
async function applyView(viewId) {
  if (viewId === '__manage__') return manageViews();
  if (!viewId) return;
  const r = await api('GET', '/api/mlm/views');
  const v = r.views.find(x => x.id === viewId);
  if (!v) return;
  STATE.filters = new Set(v.filters || []);
  STATE.sort = v.sort || 'fresh';
  STATE.q = v.q || '';
  STATE.category = v.category || '';
  STATE.country = v.country || '';
  STATE.city = v.city || '';
  STATE.offset = 0;
  // Sync UI
  document.getElementById('searchInput').value = STATE.q;
  document.getElementById('sortSelect').value = STATE.sort;
  document.getElementById('catSelect').value = STATE.category;
  document.getElementById('countrySelect').value = STATE.country;
  document.getElementById('citySelect').value = STATE.city;
  document.querySelectorAll('.toolbar .pill').forEach(b => b.classList.toggle('on', STATE.filters.has(b.dataset.filter)));
  saveStateToUrl();
  loadContacts();
}
async function promptSaveView() {
  const name = prompt('Имя для этого набора фильтров:');
  if (!name) return;
  const view = {
    id: 'v_' + Date.now(),
    name: name.slice(0, 60),
    filters: [...STATE.filters],
    sort: STATE.sort,
    q: STATE.q,
    category: STATE.category,
    country: STATE.country,
    city: STATE.city,
  };
  await api('PUT', '/api/mlm/views', view);
  await loadViews();
  document.getElementById('viewSelect').value = view.id;
  flash('📌 сохранено как «' + name + '»');
}
async function manageViews() {
  const r = await api('GET', '/api/mlm/views');
  if (!r.views.length) { flash('сохранённых view ещё нет'); return; }
  const name = prompt('Удалить view по имени (точно):\n\n' + r.views.map(v => '• ' + v.name).join('\n'));
  if (!name) return;
  const v = r.views.find(x => x.name === name);
  if (!v) { flash('не найден', true); return; }
  await fetch(API_BASE + '/api/mlm/views/' + v.id, { method: 'DELETE' });
  await loadViews();
  flash('удалено');
}

// ---------- A4 — Bulk status / tag ----------
async function bulkSetStatus() {
  const sel = document.getElementById('bulkStatusSel');
  const status = sel.value;
  if (!status || !STATE.selected.size) { sel.value = ''; return; }
  if (!confirm('Сменить статус на «' + status + '» для ' + STATE.selected.size + ' контактов?')) { sel.value = ''; return; }
  try {
    const r = await api('POST', '/api/mlm/bulk-status', { usernames: [...STATE.selected], status });
    flash('✓ обновлено: ' + r.updated);
    bulkClear();
    loadContacts(); loadDashboard?.();
  } catch (e) { flash('ошибка: ' + e.message, true); }
  sel.value = '';
}
async function bulkAddTag() {
  if (!STATE.selected.size) return;
  const tagsRaw = prompt('Добавить тег(и) для ' + STATE.selected.size + ' (через пробел, # необязательно):');
  if (!tagsRaw) return;
  const add = tagsRaw.split(/\s+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
  try {
    const r = await api('POST', '/api/mlm/bulk-tag', { usernames: [...STATE.selected], add });
    flash('🏷 тегов добавлено: ' + r.updated);
    bulkClear(); loadContacts();
  } catch (e) { flash('ошибка: ' + e.message, true); }
}

// ---------- B2 — Tasks ----------
function openTasks() { document.getElementById('tasksOverlay').classList.add('show'); loadTasks(); }
function closeTasks() { document.getElementById('tasksOverlay').classList.remove('show'); }
async function loadTasks() {
  const show = document.getElementById('showDoneTasks').checked;
  const body = document.getElementById('tasksList');
  body.innerHTML = '⏳…';
  try {
    const r = await api('GET', '/api/mlm/tasks?include_done=' + (show ? '1' : '0'));
    if (!r.tasks.length) { body.innerHTML = '<div class="empty">задач пока нет</div>'; return; }
    const today = new Date().toISOString().slice(0,10);
    body.innerHTML = r.tasks.map(t => {
      const overdue = t.dueDate && t.dueDate < today && !t.done;
      return '<div style="padding:8px 10px;background:var(--card);border:1px solid ' + (overdue ? 'var(--red)' : 'var(--border)') + ';border-radius:6px;margin-bottom:6px;display:flex;gap:8px;align-items:center">' +
        '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' onchange="toggleTask(\'' + esc(t.id) + '\', this.checked)">' +
        '<div style="flex:1">' +
          '<div style="' + (t.done ? 'text-decoration:line-through;opacity:0.6' : '') + '">' + esc(t.title) + '</div>' +
          '<div style="font-size:11px;color:' + (overdue ? 'var(--red)' : 'var(--muted)') + '">' + esc(t.dueDate || 'без даты') + (t.contactUsername ? ' · ' + esc(t.contactUsername) : '') + '</div>' +
        '</div>' +
        '<button class="btn" onclick="deleteTaskUi(\'' + esc(t.id) + '\')" style="font-size:11px;padding:3px 6px">✕</button>' +
      '</div>';
    }).join('');
  } catch (e) { body.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
async function createTask() {
  const title = document.getElementById('newTaskTitle').value.trim();
  if (!title) return;
  const dueDate = document.getElementById('newTaskDue').value || null;
  try {
    await api('POST', '/api/mlm/tasks', { title, dueDate });
    document.getElementById('newTaskTitle').value = '';
    document.getElementById('newTaskDue').value = '';
    loadTasks();
    flash('+ задача');
  } catch (e) { flash('ошибка: ' + e.message, true); }
}
async function toggleTask(id, done) {
  await api('PUT', '/api/mlm/tasks/' + id, { done });
  loadTasks();
}
async function deleteTaskUi(id) {
  if (!confirm('Удалить задачу?')) return;
  await fetch(API_BASE + '/api/mlm/tasks/' + id, { method: 'DELETE' });
  loadTasks();
}


// ─── B3 — Deals ──────────────────────────────────────────────
const DEAL_STAGES_UI = [
  { id: 'lead', title: 'лид', color: '#9ba1ad' },
  { id: 'qualified', title: 'квалифицирован', color: '#f97316' },
  { id: 'demo', title: 'демо', color: '#f59e0b' },
  { id: 'proposal', title: 'предложение', color: '#3b82f6' },
  { id: 'won', title: 'выигран', color: '#22c55e' },
  { id: 'lost', title: 'проигран', color: '#ef4444' },
];
function openDeals() { document.getElementById('dealsOverlay').classList.add('show'); loadDealsPipeline(); }
function closeDeals() { document.getElementById('dealsOverlay').classList.remove('show'); }
async function loadDealsPipeline() {
  const wrap = document.getElementById('dealsPipeline');
  wrap.innerHTML = '<div class="empty">⏳…</div>';
  try {
    const r = await api('GET', '/api/mlm/deals/pipeline');
    document.getElementById('dealsSummary').innerHTML =
      '<span style="padding:6px 10px;background:var(--card);border-radius:6px">общая сумма: <b>$' + (r.total_value || 0).toLocaleString('ru-RU') + '</b></span>' +
      '<span style="padding:6px 10px;background:var(--card);border-radius:6px">взвешенная (учёт %): <b>$' + (r.weighted_value || 0).toLocaleString('ru-RU') + '</b></span>';

    wrap.innerHTML = DEAL_STAGES_UI.map(st => {
      const items = r.columns[st.id] || [];
      const sum = r.sumByStage[st.id] || 0;
      const cards = items.map(d =>
        '<div class="deal-card" draggable="true" data-id="' + esc(d.id) + '" style="padding:8px;background:var(--bg-2);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:grab">' +
          '<div style="font-weight:600;font-size:12px">' + esc(d.title) + '</div>' +
          '<div style="font-size:11px;color:var(--accent);margin-top:2px">$' + d.amount.toLocaleString('ru-RU') + ' · ' + d.probability + '%</div>' +
          (d.contactUsername ? '<div style="font-size:10px;color:var(--muted);margin-top:2px">👤 ' + esc(d.contactUsername) + '</div>' : '') +
          '<button class="btn" onclick="deleteDealUi(\'' + esc(d.id) + '\')" style="font-size:9px;padding:2px 5px;float:right;margin-top:3px">✕</button>' +
        '</div>'
      ).join('');
      return '<div class="deal-col" data-stage="' + st.id + '" style="flex:1;min-width:170px;background:var(--card);border-radius:8px;padding:8px;border-top:3px solid ' + st.color + '">' +
        '<div style="font-weight:600;margin-bottom:6px;color:' + st.color + ';font-size:12px">' + st.title + ' (' + items.length + ') · $' + sum.toLocaleString('ru-RU') + '</div>' +
        '<div class="deal-col-body" style="min-height:40px">' + (items.length ? cards : '<div class="empty" style="padding:8px;font-size:10px">пусто</div>') + '</div>' +
        '</div>';
    }).join('');
    wireDealsDnD();
  } catch (e) { wrap.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}
function wireDealsDnD() {
  document.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/dealId', card.dataset.id); card.style.opacity = '0.4'; });
    card.addEventListener('dragend', () => card.style.opacity = '1');
  });
  document.querySelectorAll('.deal-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.style.background = 'rgba(139,92,246,0.1)'; });
    col.addEventListener('dragleave', () => col.style.background = '');
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.style.background = '';
      const id = e.dataTransfer.getData('text/dealId');
      if (!id) return;
      try {
        await api('PUT', '/api/mlm/deals/' + id, { stage: col.dataset.stage });
        flash('→ ' + col.dataset.stage);
        loadDealsPipeline();
      } catch (e) { flash(e.message, true); }
    });
  });
}
async function createDeal() {
  const title = document.getElementById('newDealTitle').value.trim();
  const amount = +document.getElementById('newDealAmount').value || 0;
  const contactUsername = document.getElementById('newDealContact').value.trim() || null;
  if (!title) { flash('название обязательно', true); return; }
  try {
    await api('POST', '/api/mlm/deals', { title, amount, contactUsername });
    document.getElementById('newDealTitle').value = '';
    document.getElementById('newDealAmount').value = '';
    document.getElementById('newDealContact').value = '';
    loadDealsPipeline();
    flash('+ сделка');
  } catch (e) { flash(e.message, true); }
}
async function deleteDealUi(id) {
  if (!confirm('Удалить сделку?')) return;
  await fetch(API_BASE + '/api/mlm/deals/' + id, { method: 'DELETE' });
  loadDealsPipeline();
}

// ─── C1 — Reports ────────────────────────────────────────────
function openReports() { document.getElementById('reportsOverlay').classList.add('show'); loadReport('category'); }
function closeReports() { document.getElementById('reportsOverlay').classList.remove('show'); }
async function loadReport(type, btn) {
  document.querySelectorAll('.rep-tab.on').forEach(x => x.classList.remove('on'));
  if (btn) btn.classList.add('on'); else document.querySelector('.rep-tab[data-rep="' + type + '"]')?.classList.add('on');
  const body = document.getElementById('reportBody');
  body.innerHTML = '⏳…';
  try {
    if (type === 'revenue') {
      const r = await api('GET', '/api/mlm/reports/revenue?days=90');
      if (!r.timeline.length) { body.innerHTML = '<div class="empty">пока нет выигранных сделок</div>'; return; }
      const max = Math.max(...r.timeline.map(x => x.sum));
      body.innerHTML = '<table style="width:100%;font-size:12px">' + r.timeline.map(x =>
        '<tr><td style="width:90px;color:var(--muted)">' + esc(x.day) + '</td><td><div style="background:var(--green);height:14px;border-radius:3px;width:' + Math.round(x.sum / max * 100) + '%"></div></td><td style="width:90px;text-align:right;font-weight:600">$' + x.sum.toLocaleString('ru-RU') + '</td></tr>'
      ).join('') + '</table>';
      return;
    }
    const r = await api('GET', '/api/mlm/reports/by-' + type);
    if (!r.rows.length) { body.innerHTML = '<div class="empty">пусто</div>'; return; }
    const keyField = type;
    const max = Math.max(...r.rows.map(x => x.touched || x.count));
    body.innerHTML = '<table style="width:100%;font-size:12px;border-collapse:collapse">' +
      '<thead><tr style="color:var(--muted)"><th style="text-align:left;padding:6px">' + esc(keyField) + '</th><th>всего</th><th>закрыто</th><th>конв %</th></tr></thead>' +
      '<tbody>' + r.rows.map(x => {
        const count = x.touched || x.count;
        return '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:6px">' + esc(x[keyField]) + '</td>' +
          '<td style="text-align:center">' + count + '</td>' +
          '<td style="text-align:center">' + (x.closed || 0) + '</td>' +
          '<td style="text-align:center">' + (x.conv_pct || 0) + '%</td>' +
        '</tr>';
      }).join('') + '</tbody></table>';
  } catch (e) { body.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
}


// ─── D3 — SSE realtime listener ───────────────────────────────
var _sseSource = null; // [tdz-fix] var so hoisted as undefined — startSSE() is called from init BEFORE the original let declaration line
function startSSE() {
  if (_sseSource) return;
  try {
    _sseSource = new EventSource(API_BASE + '/api/mlm/events/stream');
    _sseSource.addEventListener('contact.status_changed', e => {
      flash('🔔 статус обновлён');
      loadContacts(); loadDashboard?.();
    });
    _sseSource.addEventListener('deal.won', e => {
      flash('🎉 сделка выиграна');
      loadDashboard?.();
    });
    _sseSource.addEventListener('task.created', e => {
      flash('+ новая задача');
    });
    _sseSource.onerror = () => { /* auto-reconnect */ };
  } catch (e) { console.warn('SSE failed:', e.message); }
}

// ─── E3 — enrich from t.me ─────────────────────────────────────
async function enrichFromTg(username) {
  flash('🔍 читаю t.me…');
  try {
    const r = await api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/enrich-from-tg', {});
    const f = document.getElementById('fNeeds');
    if (f && r.needs) f.value = r.needs;
    flash('✨ обогащено из TG: ' + (r.title || 'без названия'));
  } catch (e) { flash(e.message, true); }
}

// ---------- L2: Calendar ----------
async function openCalendar() {
  document.getElementById('calOverlay').classList.add('show');
  loadCalendar('week', document.querySelector('.cal-range[data-range=\"week\"]'));
}
function closeCal() { document.getElementById('calOverlay').classList.remove('show'); }

async function loadCalendar(range, btn) {
  document.querySelectorAll('.cal-range.on').forEach(x => x.classList.remove('on'));
  btn?.classList.add('on');
  const body = document.getElementById('calBody');
  body.innerHTML = '<div class=\"empty\">⏳…</div>';
  try {
    const r = await api('GET', '/api/mlm/calendar?range=' + encodeURIComponent(range));
    const items = r.items || [];
    if (!items.length) { body.innerHTML = '<div class=\"empty\">в этом периоде созвонов нет</div>'; return; }
    // Group by date
    const groups = {};
    items.forEach(it => { (groups[it.nextCall] = groups[it.nextCall] || []).push(it); });
    const today = new Date().toISOString().slice(0,10);
    body.innerHTML = Object.keys(groups).sort().map(date => {
      const isToday = date === today;
      const dayLabel = isToday ? '📍 сегодня · ' + date : date;
      return '<div style=\"margin-bottom:14px\">' +
        '<div style=\"font-weight:600;color:' + (isToday ? '#f97316' : 'var(--accent)') + ';margin-bottom:6px\">' + dayLabel + '</div>' +
        groups[date].map(it => {
          const c = it.contact;
          return '<div onclick=\"closeCal();openContact(\'' + esc(c.username) + '\')\" style=\"padding:10px;background:var(--card);border:1px solid var(--border);border-radius:6px;margin-bottom:6px;cursor:pointer\">' +
            '<div style=\"font-weight:600\">' + esc(c.name || c.username) + '</div>' +
            '<div style=\"font-size:11px;color:var(--muted)\">' + esc(c.company || '') + ' · ' + esc(c.city || c.country || '') + ' · ' + esc(it.status) + '</div>' +
            (it.notes ? '<div style=\"font-size:11px;margin-top:4px\">' + esc(it.notes) + '</div>' : '') +
            '</div>';
        }).join('') +
        '</div>';
    }).join('');
  } catch (e) { body.innerHTML = '<div class=\"empty\">ошибка: ' + esc(e.message) + '</div>'; }
}

// ─── L6 AI РАЗВЕДКА (roboai engine) ──────────────────────────────────
// Three lightweight tabs injected at the bottom of the contact detail card:
//   📚 Знаем о лиде  → Person.kbJson (companies, interests, pain_points, best_approach)
//   💬 Переписка     → all dialogs across all warmed accounts
//   📜 Журнал KB     → PersonProfileSnapshot history (audit)

async function aiEnrichContact(username) {
  const c = window._lastContact;
  if (!c) { flash('Сначала откройте контакт', true); return; }
  const box = document.getElementById('aiEnrichBox');
  if (!box) return;
  box.innerHTML = '⏳ запускаю разведку (~10-30 сек)…';
  try {
    const body = {
      userId: window.currentUserId || 1, // owner of warm pool; cabinet user id
      username: c.username,
      phone: c.phone,
      name: c.name,
      company: c.company
    };
    const r = await fetch('/cabinet/api/roboai/leads/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(x => x.json());
    if (!r || r.stage === 'failed' || r.stage === 'discovery') {
      box.innerHTML = '<div class="empty">❌ ' + (r?.reason || 'не удалось найти TG-аккаунт лида') + '</div>';
      return;
    }
    flash('✨ разведка завершена');
    // Auto-load KB panel
    aiLoadKb(r.personId);
  } catch (e) {
    box.innerHTML = '<div class="empty">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function aiLoadKb(personId) {
  const box = document.getElementById('aiEnrichBox');
  if (!box) return;
  box.innerHTML = '⏳ загружаю базу знаний…';
  try {
    const r = await fetch('/cabinet/api/roboai/leads/enrich/' + personId + '/kb').then(x => x.json());
    if (!r.ok) { box.innerHTML = '<div class="empty">'+ esc(r.reason || 'нет данных') + '</div>'; return; }
    const p = r.person;
    const kb = p.kb || {};
    const ct = p.contacts || {};
    const extraBtns = [
      ct.telegram && `<a class="btn" href="${esc(ct.telegram)}" target="_blank" style="background:#229ED9;color:#fff">✈ TG</a>`,
      ct.whatsapp && `<a class="btn" href="${esc(ct.whatsapp)}" target="_blank" style="background:#25D366;color:#fff">📱 WA</a>`,
      ct.vk && `<a class="btn" href="${esc(ct.vk)}" target="_blank">VK</a>`,
      ct.instagram && `<a class="btn" href="${esc(ct.instagram)}" target="_blank">IG</a>`,
      ct.linkedin && `<a class="btn" href="${esc(ct.linkedin)}" target="_blank">LinkedIn</a>`
    ].filter(Boolean).join(' ');

    const company = (kb.companies && kb.companies[0]) || null;
    box.innerHTML = `
      <div style="padding:12px;background:rgba(139,92,246,0.06);border:1px solid var(--border);border-radius:10px">
        <div style="display:flex;gap:6px;border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:10px">
          <button class="btn" onclick="aiTab('kb')" id="aiTabKb" style="background:var(--accent);color:#fff">📚 Знаем</button>
          <button class="btn" onclick="aiTab('dialog')" id="aiTabDialog">💬 Переписка</button>
          <button class="btn" onclick="aiTab('audit')" id="aiTabAudit">📜 Журнал</button>
          <button class="btn" onclick="aiEnrichContact('${esc(p.username || '')}')" style="margin-left:auto;font-size:11px">🔄 Обновить</button>
        </div>
        <div id="aiPaneKb">
          ${extraBtns ? '<div style="margin-bottom:10px">' + extraBtns + '</div>' : ''}
          <div class="row"><label>Возраст / город / страна</label><div class="val">${kb.age_estimate ? kb.age_estimate + ' лет' : '—'} · ${esc(kb.city || p.country || '—')}</div></div>
          ${company ? '<div class="row"><label>Работает</label><div class="val">' + esc(company.name) + ' (' + esc(company.role || 'роль ?') + ', ' + (company.years ? company.years + ' лет' : 'срок ?') + ')</div></div>' : ''}
          ${kb.interests?.length ? '<div class="row"><label>Интересы</label><div class="val">' + kb.interests.map(esc).join(', ') + '</div></div>' : ''}
          ${kb.pain_points?.length ? '<div class="row"><label>Болевые точки</label><div class="val" style="color:#f97316">' + kb.pain_points.map(esc).join(' · ') + '</div></div>' : ''}
          ${kb.best_approach ? '<div class="row"><label>Как зайти (best approach)</label><div class="val" style="color:var(--accent);font-style:italic">«' + esc(kb.best_approach) + '»</div></div>' : ''}
          ${kb.objections?.length ? '<div class="row"><label>Возражения, которые уже звучали</label><div class="val">' + kb.objections.map(esc).join(' · ') + '</div></div>' : ''}
          ${kb.intent ? '<div class="row"><label>Текущий intent</label><div class="val">' + esc(kb.intent) + '</div></div>' : ''}
          <div class="row"><label>Уверенность KB</label><div class="val">${Math.round((p.kbConfidence || 0) * 100)}%</div></div>
        </div>
        <div id="aiPaneDialog" style="display:none">⏳ загружаю…</div>
        <div id="aiPaneAudit" style="display:none">⏳ загружаю…</div>
      </div>`;
    window._aiPersonId = p.id;
  } catch (e) {
    box.innerHTML = '<div class="empty">Ошибка: ' + esc(e.message) + '</div>';
  }
}

function aiTab(name) {
  ['kb', 'dialog', 'audit'].forEach(n => {
    const pane = document.getElementById('aiPane' + n[0].toUpperCase() + n.slice(1));
    const btn = document.getElementById('aiTab' + n[0].toUpperCase() + n.slice(1));
    if (!pane || !btn) return;
    pane.style.display = (n === name) ? '' : 'none';
    btn.style.background = (n === name) ? 'var(--accent)' : '';
    btn.style.color = (n === name) ? '#fff' : '';
  });
  if (name === 'dialog' && window._aiPersonId) aiLoadDialogs(window._aiPersonId);
  if (name === 'audit' && window._aiPersonId) aiLoadAudit(window._aiPersonId);
}

async function aiLoadDialogs(personId) {
  const pane = document.getElementById('aiPaneDialog');
  if (!pane) return;
  try {
    const r = await fetch('/cabinet/api/roboai/leads/' + personId + '/dialogs').then(x => x.json()).catch(() => ({ ok: false }));
    if (!r.ok || !r.dialogs?.length) {
      pane.innerHTML = '<div class="empty">Переписок пока нет</div>';
      return;
    }
    pane.innerHTML = r.dialogs.map(d => `
      <div style="padding:8px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;color:var(--muted)">${esc(new Date(d.createdAt).toLocaleString('ru-RU'))} · акк @${esc(d.account?.username || '?')}</div>
        ${(d.messages || []).map(m => `
          <div style="margin-top:4px;${m.from === 'user' ? 'padding-left:20px' : 'padding-right:20px'}">
            <span style="font-size:10px;color:var(--muted)">${m.from === 'user' ? '⬅ они' : '➡ мы'}</span>
            ${esc(m.text).slice(0, 400)}
          </div>
        `).join('')}
      </div>
    `).join('');
  } catch (e) {
    pane.innerHTML = '<div class="empty">Ошибка: ' + esc(e.message) + '</div>';
  }
}

async function aiLoadAudit(personId) {
  const pane = document.getElementById('aiPaneAudit');
  if (!pane) return;
  try {
    const r = await fetch('/cabinet/api/roboai/leads/enrich/' + personId + '/kb').then(x => x.json());
    if (!r.ok) { pane.innerHTML = '<div class="empty">пусто</div>'; return; }
    pane.innerHTML = (r.snapshots || []).map(s => `
      <div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px">
        <div>${esc(new Date(s.fetchedAt).toLocaleString('ru-RU'))}</div>
        <div style="color:var(--muted);font-size:11px">${esc(s.source)}</div>
      </div>
    `).join('') || '<div class="empty">нет снимков</div>';
  } catch (e) {
    pane.innerHTML = '<div class="empty">Ошибка: ' + esc(e.message) + '</div>';
  }
}

window.aiEnrichContact = aiEnrichContact;
window.aiLoadKb = aiLoadKb;
window.aiTab = aiTab;

// ─── SpamBot статус чип (для roboai-earn) ─────────────────────────────
window.spamBotStatusChip = function(state, frozenUntil) {
  if (!state) return '<span class="ra-pill" style="background:#888;color:#fff">⚪ не проверен</span>';
  if (state === 'clean') return '<span class="ra-pill" style="background:#22c55e;color:#fff">🟢 чисто</span>';
  if (state === 'frozen_soft') {
    const dt = frozenUntil ? new Date(frozenUntil).toLocaleDateString('ru-RU') : '?';
    return '<span class="ra-pill" style="background:#fbbf24;color:#000">🟡 заморожен до ' + dt + '</span>';
  }
  if (state === 'restricted_dm') return '<span class="ra-pill" style="background:#f97316;color:#fff">🟠 нельзя DM</span>';
  if (state === 'banned') return '<span class="ra-pill" style="background:#ef4444;color:#fff">🔴 БАН (прокси освобождена)</span>';
  if (state === 'unresponsive') return '<span class="ra-pill" style="background:#888;color:#fff">⚪ не отвечает</span>';
  return '<span class="ra-pill">' + state + '</span>';
};

window.spamBotCheckAccount = async function(accountId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  try {
    const r = await fetch('/cabinet/api/roboai/accounts/' + accountId + '/spambot-check', { method: 'POST' }).then(x => x.json());
    if (btn) btn.textContent = '✓';
    if (window.flash) flash('SpamBot: ' + (r.state || 'unknown'));
    // refresh roboai-earn page if loader exists
    if (window.loadRoboaiEarnPage) setTimeout(window.loadRoboaiEarnPage, 800);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = '🔄'; }
    if (window.flash) flash('Ошибка: ' + e.message, true);
  }
};

// ---------- L2: Auto-enrich «Потребности» ----------
async function enrichNeeds(username) {
  const f = document.getElementById('fNeeds');
  if (!f) return;
  const old = f.value;
  f.value = '⏳ генерирую из описания…';
  try {
    const r = await api('POST', '/api/mlm/contacts/' + encodeURIComponent(username) + '/enrich-needs', {});
    f.value = r.needs || old;
    flash('✨ обогащено через Groq');
  } catch (e) {
    f.value = old;
    flash('ошибка: ' + e.message, true);
  }
}

// ---------- L2: Tags ----------
function renderTagsField(c) {
  const tags = c.crm?.tags || [];
  return '<div class=\"row\"><label>теги (#хештег через пробел)</label>' +
    '<input type=\"text\" id=\"fTags\" placeholder=\"#холодный #vip #созвон_завтра\" value=\"' + esc(tags.map(t => '#' + t).join(' ')) + '\">' +
    '<div style=\"font-size:10px;color:var(--muted);margin-top:3px\">сохраняются вместе со статусом</div>' +
    '</div>';
}
function parseTags(input) {
  return String(input || '').split(/\s+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, 20);
}

// ---------- L2: Company notes ----------
async function loadCompanyNotes(companyId) {
  if (!companyId) return '';
  try {
    const r = await api('GET', '/api/mlm/companies/' + companyId + '/notes');
    return r.notes || '';
  } catch { return ''; }
}
async function saveCompanyNotes(companyId, text) {
  if (!companyId) return;
  try { await api('PUT', '/api/mlm/companies/' + companyId + '/notes', { notes: text }); flash('💾 заметка на компанию сохранена'); }
  catch (e) { flash('ошибка: ' + e.message, true); }
}

// ---------- L2: Quick-add manual contact ----------
function openQuickAdd() { document.getElementById('quickAddOverlay').classList.add('show'); }
function closeQuickAdd() { document.getElementById('quickAddOverlay').classList.remove('show'); }
async function submitQuickAdd() {
  const fields = {
    name: document.getElementById('qaName').value.trim(),
    company: document.getElementById('qaCompany').value.trim(),
    country: document.getElementById('qaCountry').value.trim(),
    city: document.getElementById('qaCity').value.trim(),
    phone: document.getElementById('qaPhone').value.trim(),
    telegram: document.getElementById('qaTelegram').value.trim(),
    email: document.getElementById('qaEmail').value.trim(),
    description: document.getElementById('qaDescription').value.trim(),
    username: 'manual-' + Date.now(),
  };
  if (!fields.name) { flash('имя обязательно', true); return; }
  try {
    const r = await api('POST', '/api/mlm/contacts/manual', fields);
    flash('✓ добавлен');
    closeQuickAdd();
    ['qaName','qaCompany','qaCountry','qaCity','qaPhone','qaTelegram','qaEmail','qaDescription'].forEach(id => document.getElementById(id).value = '');
    loadContacts(); loadDashboard();
  } catch (e) { flash('ошибка: ' + e.message, true); }
}

// (L2 calendar теперь поддерживается ниже в основной switchToView)

// ---------- AI sort CTA ----------
function checkAiCta() {
  if (STATE.sort === 'ai' && !STATE.settings.defaultOffer) {
    flash('🎯 Задай «Мой оффер» в ⚙ настройках — без него AI-сорт не работает', true);
  }
}
