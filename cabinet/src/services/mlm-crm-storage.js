// cabinet/src/services/mlm-crm-storage.js
// Read-side cache for scraped contacts/companies + per-owner CRM notes.
// Contacts/companies are read-only (produced by scrape-mlmbaza.js).
// CRM notes (status, needs, history, next_call) are stored per-owner in
// data/mlm-crm-notes.json.

const fs = require('fs');
const path = require('path');

const DATA_DIR  = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', '..', '..', 'data');
const CONTACTS  = path.join(DATA_DIR, 'mlm-contacts.json');
const COMPANIES = path.join(DATA_DIR, 'mlm-companies.json');
const STATE     = path.join(DATA_DIR, 'mlm-scrape-state.json');
const NOTES     = path.join(DATA_DIR, 'mlm-crm-notes.json');

let cache = {
  contacts: null,
  companies: null,
  state: null,
  contactsMtime: 0,
  companiesMtime: 0,
  stateMtime: 0,
  byUsername: null,
  byCompanyId: null,
};

function readJsonSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}
function mtime(p) { try { return fs.statSync(p).mtimeMs; } catch { return 0; } }

function refresh() {
  const cm = mtime(CONTACTS), om = mtime(COMPANIES), sm = mtime(STATE);
  if (cm !== cache.contactsMtime || cache.contacts === null || om !== cache.companiesMtime) {
    // Reachable contacts — есть хотя бы один реальный канал для личных сообщений
    cache.contacts = readJsonSafe(CONTACTS, []).concat(readJsonSafe(CUSTOM_PATH, []))
      .filter(c => c.phone || c.contacts?.telegram || c.contacts?.whatsapp
                || c.contacts?.vk || c.contacts?.facebook || c.contacts?.instagram);
    cache.contactsMtime = cm;
    cache.byUsername = new Map();
    cache.byCompanyId = new Map();
    for (const c of cache.contacts) {
      if (c.username) cache.byUsername.set(c.username, c);
      if (c.company_id) {
        if (!cache.byCompanyId.has(c.company_id)) cache.byCompanyId.set(c.company_id, []);
        cache.byCompanyId.get(c.company_id).push(c);
      }
    }
  }
  if (om !== cache.companiesMtime || cache.companies === null) {
    cache.companies = readJsonSafe(COMPANIES, []);
    cache.companiesMtime = om;
  }
  if (sm !== cache.stateMtime || cache.state === null) {
    cache.state = readJsonSafe(STATE, { phase: 'idle', companiesIndex: [], processedCompanyIds: [] });
    cache.stateMtime = sm;
  }
}

// Notes — keyed by ownerId (string), then by contact username.
// { '<ownerId>': { '<username>': { status, needs, history:[{ts,msg,direction}], nextCall, notes, updated_at } } }
function loadNotes() { return readJsonSafe(NOTES, {}); }
function saveNotes(all) { writeJsonAtomic(NOTES, all); }

function getNote(ownerId, username) {
  const all = loadNotes();
  return (all[ownerId] && all[ownerId][username]) || null;
}
function setNote(ownerId, username, patch) {
  const all = loadNotes();
  if (!all[ownerId]) all[ownerId] = {};
  const cur = all[ownerId][username] || { status: 'new', needs: '', history: [], nextCall: null, notes: '' };
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  all[ownerId][username] = next;
  saveNotes(all);
  return next;
}
function appendHistory(ownerId, username, entry) {
  const all = loadNotes();
  if (!all[ownerId]) all[ownerId] = {};
  if (!all[ownerId][username]) all[ownerId][username] = { status: 'new', needs: '', history: [], nextCall: null, notes: '' };
  all[ownerId][username].history.push({ ...entry, ts: entry.ts || new Date().toISOString() });
  all[ownerId][username].updated_at = new Date().toISOString();
  saveNotes(all);
  return all[ownerId][username];
}

// Contact-quality score — used by sort=quality.
function qualityScore(c) {
  let s = 0;
  if (c.contacts?.telegram) s += 5;
  if (c.phone) s += 4;
  if (c.contacts?.whatsapp) s += 3;
  if (c.email) s += 2;
  if (c.contacts?.vk) s += 1;
  if (c.contacts?.instagram) s += 1;
  if (c.contacts?.facebook) s += 1;
  if (c.description && c.description.length > 50) s += 1;
  if (c.photo && !/img\/social\//.test(c.photo)) s += 1;
  return s;
}

// Region tier — RU/UA/BY/KZ first, then other CIS, then EU/Other.
function regionTier(c) {
  const country = String(c.country || '').toLowerCase();
  if (/росси|russia|rus|рф/.test(country)) return 0;
  if (/украин|ukraine|беларус|belarus|казахстан|kazakhstan|молдов|moldov|армен|armenia|узбекистан|кыргызстан|таджикистан|туркменистан/.test(country)) return 1;
  if (/germany|deutschland|polska|poland|estonia|latvia|lithuania|finland|france|italy|spain|england|usa|america/.test(country)) return 2;
  if (country) return 3;
  return 4;
}

// Public list — applies sort + filters + search + pagination.
function listContacts(opts = {}) {
  refresh();
  const ownerId = String(opts.ownerId || '');
  const allNotes = loadNotes();
  const ownerNotes = allNotes[ownerId] || {};

  let items = cache.contacts.slice();

  // Filters
  const f = new Set((opts.filters || []).filter(Boolean));
  if (f.has('tg')) items = items.filter(c => c.contacts?.telegram);
  if (f.has('phone')) items = items.filter(c => c.phone);
  if (f.has('whatsapp')) items = items.filter(c => c.contacts?.whatsapp);
  if (f.has('email')) items = items.filter(c => c.email);
  if (f.has('ru')) items = items.filter(c => regionTier(c) === 0);
  if (f.has('cis')) items = items.filter(c => regionTier(c) <= 1);
  if (f.has('with-photo')) items = items.filter(c => c.photo && !/img\/social\//.test(c.photo));
  if (f.has('contacted')) items = items.filter(c => ownerNotes[c.username]);
  if (f.has('uncontacted')) items = items.filter(c => !ownerNotes[c.username]);
  if (f.has('todo-callback')) items = items.filter(c => ownerNotes[c.username]?.nextCall);

  // Status filter
  if (opts.status) items = items.filter(c => (ownerNotes[c.username]?.status || 'new') === opts.status);

  // Company filter
  if (opts.companyId) items = items.filter(c => c.company_id === +opts.companyId);
  // Category filter (via company)
  if (opts.category) {
    const catMap = new Map((cache.companies||[]).map(c => [c.id, c.category]));
    items = items.filter(c => catMap.get(c.company_id) === opts.category);
  }
  // Country / city exact filters (case-insensitive)
  if (opts.country) {
    const need = String(opts.country).trim().toLowerCase();
    items = items.filter(c => String(c.country||'').trim().toLowerCase() === need);
  }
  if (opts.city) {
    const need = String(opts.city).trim().toLowerCase();
    items = items.filter(c => String(c.city||'').trim().toLowerCase() === need);
  }

  // Search
  const q = String(opts.q || '').trim().toLowerCase();
  if (q) {
    items = items.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.country || '').toLowerCase().includes(q) ||
      (c.username || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  }

  // [contacted-history-2026-05-19] Sort
  let sort = opts.sort || 'fresh';
  // Auto-promote 'fresh' to 'last-contact' when filter=contacted is active —
  // user reading the contacted list expects history-style ordering.
  if (sort === 'fresh' && f.has('contacted')) sort = 'last-contact';
  // Same for 'todo-callback' — sort by upcoming call asc.
  if (sort === 'fresh' && f.has('todo-callback')) sort = 'next-call';

  function _lastContactTs(c) {
    const note = ownerNotes[c.username];
    if (!note) return 0;
    // Prefer note.updated_at, fall back to last history entry, then nextCall
    let t = note.updated_at ? Date.parse(note.updated_at) : 0;
    if (!t && Array.isArray(note.history) && note.history.length) {
      t = Date.parse(note.history[note.history.length - 1].ts || 0);
    }
    return Number.isFinite(t) ? t : 0;
  }

  if (sort === 'fresh') {
    items.sort((a, b) => String(b.fetched_at || '').localeCompare(String(a.fetched_at || '')));
  } else if (sort === 'last-contact') {
    items.sort((a, b) => _lastContactTs(b) - _lastContactTs(a));
  } else if (sort === 'next-call') {
    items.sort((a, b) => {
      const aT = ownerNotes[a.username]?.nextCall ? Date.parse(ownerNotes[a.username].nextCall) : Infinity;
      const bT = ownerNotes[b.username]?.nextCall ? Date.parse(ownerNotes[b.username].nextCall) : Infinity;
      return aT - bT;
    });
  } else if (sort === 'company') {
    items.sort((a, b) => {
      const cmp = String(a.company || 'я').localeCompare(String(b.company || 'я'));
      if (cmp !== 0) return cmp;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  } else if (sort === 'quality') {
    items.sort((a, b) => qualityScore(b) - qualityScore(a));
  } else if (sort === 'region') {
    items.sort((a, b) => {
      const cmp = regionTier(a) - regionTier(b);
      if (cmp !== 0) return cmp;
      return String(a.country || '').localeCompare(String(b.country || ''));
    });
  } else if (sort === 'name') {
    items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  } else if (sort === 'ai') {
    items = rankContactsByOffer(items, opts.offer || '');
  }

  const total = items.length;
  const offset = +opts.offset || 0;
  const limit = Math.min(+opts.limit || 50, 500);
  const slice = items.slice(offset, offset + limit);

  // Attach owner-specific note
  const enriched = slice.map(c => ({
    ...c,
    quality_score: qualityScore(c),
    crm: ownerNotes[c.username] || null,
  }));

  return { total, offset, limit, items: enriched };
}

function getContact(username, ownerId) {
  refresh();
  const c = cache.byUsername?.get(username);
  if (!c) return null;
  const allNotes = loadNotes();
  const note = allNotes[ownerId]?.[username] || null;
  return { ...c, quality_score: qualityScore(c), crm: note };
}

function getCompanies() {
  refresh();
  return cache.companies || [];
}

function getStats() {
  refresh();
  const items = cache.contacts || [];
  const tg = items.filter(c => c.contacts?.telegram).length;
  const phone = items.filter(c => c.phone).length;
  const wa = items.filter(c => c.contacts?.whatsapp).length;
  const email = items.filter(c => c.email).length;
  const byCountry = {};
  for (const c of items) {
    const k = c.country || '—';
    byCountry[k] = (byCountry[k] || 0) + 1;
  }
  return {
    total: items.length,
    with_telegram: tg, with_phone: phone, with_whatsapp: wa, with_email: email,
    countries_top: Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 20),
    companies_total: (cache.companies || []).length,
  };
}

function getScrapeStatus() {
  refresh();
  const s = cache.state || {};
  const total = (s.companiesIndex || []).length;
  const done = (s.processedCompanyIds || []).length;
  return {
    phase: s.phase,
    total_companies: total,
    processed_companies: done,
    pending_company_id: s.pendingCompanyId,
    contacts_total: (cache.contacts || []).length,
    started_at: s.startedAt,
    updated_at: s.updatedAt,
    last_error: s.lastError || null,
    progress_pct: total ? Math.round((done / total) * 100) : 0,
  };
}



// Returns counters for filter UI dropdowns.
function getFacets() {
  refresh();
  const items = cache.contacts || [];
  const companies = cache.companies || [];
  const catMap = new Map(companies.map(c => [c.id, c.category]));
  const counts = { categories: {}, countries: {}, cities: {} };
  for (const c of items) {
    const cat = catMap.get(c.company_id) || 'Другое';
    counts.categories[cat] = (counts.categories[cat] || 0) + 1;
    const co = (c.country || '—').trim();
    counts.countries[co] = (counts.countries[co] || 0) + 1;
    const ci = (c.city || '').trim();
    if (ci) counts.cities[ci] = (counts.cities[ci] || 0) + 1;
  }
  const sortByCnt = obj => Object.entries(obj).sort((a,b) => b[1]-a[1]).map(([k,v]) => ({key:k, count:v}));
  return {
    categories: sortByCnt(counts.categories),
    countries: sortByCnt(counts.countries),
    cities: sortByCnt(counts.cities).slice(0, 200),
  };
}

// Group-by counter — by 'category' | 'country' | 'city' | 'company'
function getGroupBy(by) {
  refresh();
  const items = cache.contacts || [];
  const companies = cache.companies || [];
  const catMap = new Map(companies.map(c => [c.id, c.category]));
  const out = {};
  for (const c of items) {
    let key;
    if (by === 'category') key = catMap.get(c.company_id) || 'Другое';
    else if (by === 'country') key = c.country || '—';
    else if (by === 'city') key = c.city || '—';
    else if (by === 'company') key = c.company || '—';
    else key = '—';
    out[key] = (out[key] || 0) + 1;
  }
  return Object.entries(out).sort((a,b) => b[1]-a[1]).map(([k,v]) => ({key:k, count:v}));
}



// Per-owner settings (saved alongside notes under '__settings__' bucket).
const SETTINGS_BUCKET = '__settings__';
function getSettings(ownerId) {
  const all = loadNotes();
  return all[SETTINGS_BUCKET]?.[ownerId] || { defaultOffer: '', tone: 'warm', lang: 'ru' };
}
function setSettings(ownerId, patch) {
  const all = loadNotes();
  if (!all[SETTINGS_BUCKET]) all[SETTINGS_BUCKET] = {};
  const cur = all[SETTINGS_BUCKET][ownerId] || { defaultOffer: '', tone: 'warm', lang: 'ru' };
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  all[SETTINGS_BUCKET][ownerId] = next;
  saveNotes(all);
  return next;
}


// ---------- AI keyword scoring (no LLM per item) ----------
// Tokenises "my offer" + each contact description, ranks contacts by
// keyword overlap weighted by IDF-like rarity. ~20ms for full base.
const STOP_WORDS = new Set([
  'и','в','на','с','для','по','к','о','у','от','до','за','из','при','об','то','что','как','же','а','но','или',
  'the','a','an','of','for','with','to','from','at','on','in','and','or','is','are','this','that',
  'не','нет','есть','быть','может','можно','наш','свой','этот','этого','такой'
]);
function tokenise(text) {
  return String(text || '').toLowerCase()
    .replace(/[^а-яё\w]+/giu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

function rankContactsByOffer(items, offer) {
  const offerTokens = new Set(tokenise(offer));
  if (!offerTokens.size) return items;
  // Scoring: sum of (token in description ? 1 : 0) + name/company match bonus
  return items.map(c => {
    let s = 0;
    const desc = c.description || '';
    const dt = tokenise(desc);
    const dtSet = new Set(dt);
    for (const t of offerTokens) if (dtSet.has(t)) s += 2;
    // name/company bonus
    for (const t of offerTokens) {
      if ((c.name || '').toLowerCase().includes(t)) s += 1;
      if ((c.company || '').toLowerCase().includes(t)) s += 1;
    }
    // signal-quality bump
    if (c.contacts?.telegram) s += 1.5;
    if (c.phone) s += 0.5;
    return { ...c, _aiScore: +s.toFixed(2) };
  }).sort((a, b) => (b._aiScore || 0) - (a._aiScore || 0));
}

// ---------- Funnel ----------
function getFunnel(ownerId) {
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const buckets = { new: 0, 'in-progress': 0, callback: 0, closed: 0, skip: 0 };
  let withCallback = 0;
  let withHistory = 0;
  for (const username of Object.keys(notes)) {
    const n = notes[username];
    if (!n || typeof n !== 'object') continue;
    if (typeof n.status === 'string' && n.status in buckets) buckets[n.status]++;
    if (n.nextCall) withCallback++;
    if (Array.isArray(n.history) && n.history.length) withHistory++;
  }
  refresh();
  const totalBase = (cache.contacts || []).length;
  const touchedUsernames = Object.keys(notes).filter(k => k !== '__settings__');
  return {
    total_base: totalBase,
    touched: touchedUsernames.length,
    buckets,
    with_callback: withCallback,
    with_history: withHistory,
  };
}

// ---------- CSV import (manual additions) ----------
const CUSTOM_PATH = path.join(DATA_DIR, 'mlm-custom-contacts.json');
function listCustom() { return readJsonSafe(CUSTOM_PATH, []); }
function importCsvRows(ownerId, rows) {
  const cur = listCustom();
  const seen = new Set(cur.map(c => c.username));
  let added = 0;
  for (const r of rows) {
    const username = String(r.username || r.Username || r.tg || r.Telegram || r.phone || r.Phone || '').replace(/^@/, '').trim();
    if (!username || seen.has(username)) continue;
    cur.push({
      url: null,
      username,
      name: String(r.name || r.Name || r['Имя'] || username),
      company: String(r.company || r.Company || r['Компания'] || ''),
      country: String(r.country || r.Country || r['Страна'] || ''),
      city: String(r.city || r.City || r['Город'] || ''),
      phone: String(r.phone || r.Phone || r['Телефон'] || '') || null,
      email: String(r.email || r.Email || '') || null,
      contacts: {
        telegram: String(r.telegram || r.Telegram || r.tg || ''),
        whatsapp: String(r.whatsapp || r.WhatsApp || ''),
        vk: String(r.vk || r.VK || ''),
      },
      description: String(r.description || r['Описание'] || ''),
      photo: null,
      fetched_at: new Date().toISOString(),
      _custom: true,
      _imported_by: ownerId,
    });
    seen.add(username);
    added++;
  }
  writeJsonAtomic(CUSTOM_PATH, cur);
  // Bust contacts cache by touching mtime
  cache.contacts = null;
  return { added, total_custom: cur.length };
}



// Per-owner daily processing batch:
//   - all callbacks scheduled for today (nextCall = today)
//   - + top-N untouched contacts (highest quality, region-priority)
//   N comes from settings.dailyBatchSize (default 25)
function getDailyBatch(ownerId) {
  refresh();
  const settings = (loadNotes()[SETTINGS_BUCKET] || {})[ownerId] || {};
  const N = +settings.dailyBatchSize || 25;
  const today = new Date().toISOString().slice(0, 10);
  const allNotes = loadNotes();
  const ownerNotes = allNotes[ownerId] || {};

  const items = cache.contacts || [];
  const companies = cache.companies || [];
  const catMap = new Map(companies.map(c => [c.id, c.category]));

  // 1) scheduled callbacks for today
  const scheduled = items.filter(c =>
    ownerNotes[c.username]?.nextCall === today &&
    ownerNotes[c.username]?.status !== 'closed' &&
    ownerNotes[c.username]?.status !== 'skip'
  );

  // 2) top-N untouched, prefer phone+region+quality
  const touched = new Set(Object.keys(ownerNotes));
  const untouched = items
    .filter(c => !touched.has(c.username))
    .filter(c => c.phone || c.contacts?.telegram)
    .sort((a, b) => {
      const t = regionTier(a) - regionTier(b);
      if (t !== 0) return t;
      return qualityScore(b) - qualityScore(a);
    })
    .slice(0, Math.max(0, N - scheduled.length));

  return {
    today,
    daily_size: N,
    scheduled: scheduled.map(c => ({ ...c, _why: 'scheduled', crm: ownerNotes[c.username] })),
    untouched: untouched.map(c => ({ ...c, _why: 'priority', quality_score: qualityScore(c) })),
  };
}

// Per-owner dashboard summary
function getDashboard(ownerId) {
  refresh();
  const allNotes = loadNotes();
  const notes = allNotes[ownerId] || {};
  const usernames = Object.keys(notes).filter(k => k !== '__settings__');
  const today = new Date().toISOString().slice(0, 10);
  const weekFromNow = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const buckets = { new: 0, 'in-progress': 0, callback: 0, closed: 0, skip: 0 };
  let lastTouch = null;
  let todayCallbacks = 0;
  let weekCallbacks = 0;

  for (const u of usernames) {
    const n = notes[u];
    if (!n || typeof n !== 'object') continue;
    if (n.status in buckets) buckets[n.status]++;
    if (n.nextCall === today) todayCallbacks++;
    if (n.nextCall && n.nextCall >= today && n.nextCall <= weekFromNow) weekCallbacks++;
    if (n.updated_at && (!lastTouch || n.updated_at > lastTouch)) lastTouch = n.updated_at;
  }

  return {
    in_work: buckets['in-progress'] + buckets.callback,
    closed: buckets.closed,
    today_callbacks: todayCallbacks,
    week_callbacks: weekCallbacks,
    touched_total: usernames.length,
    last_touch: lastTouch,
    by_status: buckets,
  };
}

// Auto-track when user clicks share button — set status=in-progress if was new
function trackShareClick(ownerId, username, channel) {
  const all = loadNotes();
  if (!all[ownerId]) all[ownerId] = {};
  const cur = all[ownerId][username] || { status: 'new', needs: '', history: [], nextCall: null, notes: '' };
  if (cur.status === 'new') cur.status = 'in-progress';
  cur.history = cur.history || [];
  cur.history.push({
    ts: new Date().toISOString(),
    direction: 'share-click',
    channel,
    msg: '[поделился через ' + channel + ']',
  });
  cur.updated_at = new Date().toISOString();
  all[ownerId][username] = cur;
  saveNotes(all);
  return cur;
}



// ---------- L2: tags / company-notes / calendar / templates ----------
const COMPANY_NOTES_BUCKET = '__company_notes__';

function getTags(ownerId, username) {
  return getNote(ownerId, username)?.tags || [];
}
function setTags(ownerId, username, tags) {
  return setNote(ownerId, username, { tags: Array.isArray(tags) ? tags.slice(0, 20).map(t => String(t).slice(0, 30)) : [] });
}

function getCompanyNotes(ownerId, companyId) {
  const all = loadNotes();
  return (all[COMPANY_NOTES_BUCKET]?.[ownerId]?.[String(companyId)]) || '';
}
function setCompanyNotes(ownerId, companyId, text) {
  const all = loadNotes();
  if (!all[COMPANY_NOTES_BUCKET]) all[COMPANY_NOTES_BUCKET] = {};
  if (!all[COMPANY_NOTES_BUCKET][ownerId]) all[COMPANY_NOTES_BUCKET][ownerId] = {};
  all[COMPANY_NOTES_BUCKET][ownerId][String(companyId)] = String(text || '').slice(0, 4000);
  saveNotes(all);
  return all[COMPANY_NOTES_BUCKET][ownerId][String(companyId)];
}

// Calendar — все запланированные созвоны owner-а с фильтром периода
function getCalendar(ownerId, range) {
  refresh();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = (() => {
    const d = new Date();
    if (range === 'today') return today;
    if (range === 'week') { d.setDate(d.getDate() + 7);  return d.toISOString().slice(0, 10); }
    if (range === 'month') { d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10); }
    return null;
  })();
  const allNotes = loadNotes();
  const notes = allNotes[ownerId] || {};
  const items = cache.contacts || [];
  const byUsername = new Map(items.map(c => [c.username, c]));
  const out = [];
  for (const u of Object.keys(notes)) {
    const n = notes[u];
    if (!n?.nextCall) continue;
    if (n.nextCall < today) continue;          // прошло
    if (horizon && n.nextCall > horizon) continue;
    if (n.status === 'closed' || n.status === 'skip') continue;
    const c = byUsername.get(u);
    if (!c) continue;
    out.push({ contact: c, nextCall: n.nextCall, status: n.status, notes: n.notes || '', needs: n.needs || '' });
  }
  out.sort((a, b) => a.nextCall.localeCompare(b.nextCall));
  return out;
}

// Custom contact — пользователь создаёт нового вручную (отдельно от scrape базы)
function addManualContact(ownerId, fields) {
  const cur = listCustom();
  const username = String(fields.username || ('manual-' + Date.now())).slice(0, 50);
  if (cur.find(x => x.username === username)) return { ok: false, reason: 'username_exists' };
  const c = {
    url: null, username,
    name: String(fields.name || username).slice(0, 200),
    company: String(fields.company || '').slice(0, 200),
    company_id: null,
    country: String(fields.country || '').slice(0, 100),
    city: String(fields.city || '').slice(0, 100),
    region: null,
    description: String(fields.description || '').slice(0, 2000),
    phone: String(fields.phone || '').replace(/[^\d+]/g, '') || null,
    email: String(fields.email || '') || null,
    skype: null,
    website: null,
    contacts: {
      telegram: String(fields.telegram || '') || null,
      whatsapp: String(fields.whatsapp || '') || null,
      vk: String(fields.vk || '') || null,
      instagram: null, facebook: null, ok: null, youtube: null,
    },
    photo: null,
    fetched_at: new Date().toISOString(),
    _custom: true,
    _imported_by: ownerId,
  };
  cur.push(c);
  writeJsonAtomic(CUSTOM_PATH, cur);
  cache.contacts = null;
  return { ok: true, contact: c };
}



// ---------- L3 — Analytics ----------

// Activity log: последние N действий по всем контактам владельца
function getActivityLog(ownerId, limit = 100) {
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const out = [];
  for (const username of Object.keys(notes)) {
    if (username === '__settings__') continue;
    const n = notes[username];
    if (!Array.isArray(n?.history)) continue;
    for (const h of n.history) {
      out.push({
        ts: h.ts,
        direction: h.direction,
        channel: h.channel || null,
        msg: h.msg,
        username,
        contact_name: cache.byUsername?.get(username)?.name || username,
      });
    }
  }
  out.sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')));
  return out.slice(0, limit);
}

// Conversion: за период (default 30 дней)
function getConversion(ownerId, days = 30) {
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const buckets = { touched: 0, in_work: 0, callback: 0, closed: 0, skip: 0 };
  for (const u of Object.keys(notes)) {
    if (u === '__settings__') continue;
    const n = notes[u];
    if (!n?.updated_at || n.updated_at < since) continue;
    buckets.touched++;
    if (n.status === 'in-progress') buckets.in_work++;
    if (n.status === 'callback') buckets.callback++;
    if (n.status === 'closed') buckets.closed++;
    if (n.status === 'skip') buckets.skip++;
  }
  const total = buckets.touched || 1;
  return {
    days,
    touched: buckets.touched,
    in_work: buckets.in_work,
    callback: buckets.callback,
    closed: buckets.closed,
    skip: buckets.skip,
    conversion_to_callback_pct: Math.round((buckets.callback / total) * 1000) / 10,
    conversion_to_closed_pct: Math.round((buckets.closed / total) * 1000) / 10,
  };
}

// Heatmap по дням недели и часам: сколько 'out' сообщений в каждом слоте
function getHeatmap(ownerId, days = 30) {
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const since = Date.now() - days * 86400 * 1000;
  // 7 days x 24 hours matrix
  const m = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const u of Object.keys(notes)) {
    if (u === '__settings__') continue;
    const h = notes[u]?.history || [];
    for (const ev of h) {
      const ts = +new Date(ev.ts);
      if (!ts || ts < since) continue;
      const d = new Date(ts);
      const day = (d.getDay() + 6) % 7;  // monday = 0
      const hour = d.getHours();
      m[day][hour]++;
    }
  }
  return { days, matrix: m };
}

// TG digest config — chat_id куда слать утренний пинг
function setDigestChat(ownerId, chatId) {
  return setSettings(ownerId, { digestChatId: String(chatId || '').trim() || null });
}



// ---------- A2 — Saved Views ----------
const VIEWS_BUCKET = '__views__';

function getViews(ownerId) {
  const all = loadNotes();
  return all[VIEWS_BUCKET]?.[ownerId] || [];
}
function saveView(ownerId, view) {
  const all = loadNotes();
  if (!all[VIEWS_BUCKET]) all[VIEWS_BUCKET] = {};
  if (!all[VIEWS_BUCKET][ownerId]) all[VIEWS_BUCKET][ownerId] = [];
  const list = all[VIEWS_BUCKET][ownerId];
  const idx = list.findIndex(v => v.id === view.id);
  if (idx >= 0) list[idx] = view; else list.push(view);
  saveNotes(all);
  return view;
}
function deleteView(ownerId, viewId) {
  const all = loadNotes();
  if (!all[VIEWS_BUCKET]?.[ownerId]) return;
  all[VIEWS_BUCKET][ownerId] = all[VIEWS_BUCKET][ownerId].filter(v => v.id !== viewId);
  saveNotes(all);
}

// ---------- B2 — Tasks / Reminders ----------
const TASKS_BUCKET = '__tasks__';

function listTasks(ownerId, opts = {}) {
  const all = loadNotes();
  let tasks = all[TASKS_BUCKET]?.[ownerId] || [];
  if (opts.includeDone !== true) tasks = tasks.filter(t => !t.done);
  tasks.sort((a, b) => String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999')));
  return tasks;
}
function addTask(ownerId, task) {
  const all = loadNotes();
  if (!all[TASKS_BUCKET]) all[TASKS_BUCKET] = {};
  if (!all[TASKS_BUCKET][ownerId]) all[TASKS_BUCKET][ownerId] = [];
  const t = {
    id: task.id || 't_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    title: String(task.title || '').slice(0, 200),
    contactUsername: task.contactUsername || null,
    dueDate: task.dueDate || null,
    dueTime: task.dueTime || null,
    done: !!task.done,
    notes: String(task.notes || '').slice(0, 1000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  all[TASKS_BUCKET][ownerId].push(t);
  saveNotes(all);
  return t;
}
function updateTask(ownerId, taskId, patch) {
  const all = loadNotes();
  const list = all[TASKS_BUCKET]?.[ownerId] || [];
  const i = list.findIndex(t => t.id === taskId);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, updated_at: new Date().toISOString() };
  saveNotes(all);
  return list[i];
}
function deleteTask(ownerId, taskId) {
  const all = loadNotes();
  if (!all[TASKS_BUCKET]?.[ownerId]) return;
  all[TASKS_BUCKET][ownerId] = all[TASKS_BUCKET][ownerId].filter(t => t.id !== taskId);
  saveNotes(all);
}

// ---------- C2 — Webhooks ----------
const WEBHOOKS_BUCKET = '__webhooks__';

function getWebhooks(ownerId) {
  const all = loadNotes();
  return all[WEBHOOKS_BUCKET]?.[ownerId] || [];
}
function setWebhooks(ownerId, urls) {
  const all = loadNotes();
  if (!all[WEBHOOKS_BUCKET]) all[WEBHOOKS_BUCKET] = {};
  all[WEBHOOKS_BUCKET][ownerId] = Array.isArray(urls) ? urls.slice(0, 10).map(String) : [];
  saveNotes(all);
  return all[WEBHOOKS_BUCKET][ownerId];
}

// Fire webhooks (background, fire-and-forget) when an event happens
function fireWebhooks(ownerId, eventType, payload) {
  const urls = getWebhooks(ownerId);
  if (!urls.length) return;
  const https = require('https');
  const http = require('http');
  const body = JSON.stringify({ event: eventType, ownerId, ts: new Date().toISOString(), payload });
  urls.forEach(u => {
    try {
      const url = new URL(u);
      const lib = url.protocol === 'http:' ? http : https;
      const req = lib.request({
        method: 'POST',
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'GoldenConnectCRM/1.0' },
        timeout: 5000,
      }, () => {});
      req.on('error', () => {});
      req.on('timeout', () => req.destroy());
      req.write(body); req.end();
    } catch {}
  });
}

// ---------- A1 — Kanban: contacts grouped by status ----------
function getKanban(ownerId, opts = {}) {
  refresh();
  const allNotes = loadNotes();
  const ownerNotes = allNotes[ownerId] || {};
  const items = cache.contacts || [];

  // Apply same filters as listContacts
  let filtered = items;
  if (opts.companyId) filtered = filtered.filter(c => c.company_id === +opts.companyId);
  if (opts.category) {
    const catMap = new Map((cache.companies||[]).map(c => [c.id, c.category]));
    filtered = filtered.filter(c => catMap.get(c.company_id) === opts.category);
  }
  if (opts.country) {
    const need = String(opts.country).trim().toLowerCase();
    filtered = filtered.filter(c => String(c.country||'').trim().toLowerCase() === need);
  }

  // Only contacts that have any CRM activity (touched)
  filtered = filtered.filter(c => ownerNotes[c.username]);

  const columns = { 'new': [], 'in-progress': [], 'callback': [], 'closed': [], 'skip': [] };
  for (const c of filtered) {
    const n = ownerNotes[c.username];
    const status = n.status || 'new';
    if (!columns[status]) continue;
    columns[status].push({
      ...c,
      crm: n,
      _last_touch: n.updated_at || n.created_at || '',
    });
  }
  // Sort each column by last touched (most recent first)
  Object.values(columns).forEach(col => col.sort((a, b) => String(b._last_touch).localeCompare(String(a._last_touch))));

  return {
    columns,
    counts: Object.fromEntries(Object.entries(columns).map(([k, v]) => [k, v.length])),
  };
}



// ─────────────────────────────────────────────────────────────
// B3 — Deals (sales pipeline)
// ─────────────────────────────────────────────────────────────
const DEALS_BUCKET = '__deals__';
const DEAL_STAGES = ['lead', 'qualified', 'demo', 'proposal', 'won', 'lost'];

function listDeals(ownerId, opts = {}) {
  const all = loadNotes();
  let deals = all[DEALS_BUCKET]?.[ownerId] || [];
  if (opts.stage) deals = deals.filter(d => d.stage === opts.stage);
  if (opts.contactUsername) deals = deals.filter(d => d.contactUsername === opts.contactUsername);
  if (opts.openOnly !== false) {
    // По умолчанию исключаем закрытые won/lost (если openOnly не выключен)
  }
  deals.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return deals;
}

function addDeal(ownerId, data) {
  const all = loadNotes();
  if (!all[DEALS_BUCKET]) all[DEALS_BUCKET] = {};
  if (!all[DEALS_BUCKET][ownerId]) all[DEALS_BUCKET][ownerId] = [];
  const stage = DEAL_STAGES.includes(data.stage) ? data.stage : 'lead';
  const d = {
    id: 'd_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    title: String(data.title || '').slice(0, 200),
    contactUsername: data.contactUsername || null,
    amount: +data.amount || 0,
    currency: String(data.currency || 'USD').slice(0, 8),
    stage,
    probability: typeof data.probability === 'number' ? data.probability : (
      { lead: 10, qualified: 30, demo: 50, proposal: 70, won: 100, lost: 0 }[stage] || 10
    ),
    expectedCloseDate: data.expectedCloseDate || null,
    notes: String(data.notes || '').slice(0, 2000),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  all[DEALS_BUCKET][ownerId].push(d);
  saveNotes(all);
  return d;
}

function updateDeal(ownerId, dealId, patch) {
  const all = loadNotes();
  const list = all[DEALS_BUCKET]?.[ownerId] || [];
  const i = list.findIndex(d => d.id === dealId);
  if (i < 0) return null;
  const merged = { ...list[i], ...patch, updated_at: new Date().toISOString() };
  if (DEAL_STAGES.includes(merged.stage) === false) merged.stage = list[i].stage;
  list[i] = merged;
  saveNotes(all);
  return merged;
}

function deleteDeal(ownerId, dealId) {
  const all = loadNotes();
  if (!all[DEALS_BUCKET]?.[ownerId]) return;
  all[DEALS_BUCKET][ownerId] = all[DEALS_BUCKET][ownerId].filter(d => d.id !== dealId);
  saveNotes(all);
}

function getDealsPipeline(ownerId) {
  const deals = listDeals(ownerId);
  const cols = Object.fromEntries(DEAL_STAGES.map(st => [st, []]));
  let totalValue = 0, weightedValue = 0;
  for (const d of deals) {
    if (!cols[d.stage]) cols[d.stage] = [];
    cols[d.stage].push(d);
    if (d.stage !== 'lost') {
      totalValue += d.amount;
      weightedValue += d.amount * (d.probability / 100);
    }
  }
  const counts = Object.fromEntries(DEAL_STAGES.map(st => [st, (cols[st] || []).length]));
  const sumByStage = Object.fromEntries(DEAL_STAGES.map(st => [
    st, (cols[st] || []).reduce((s, d) => s + d.amount, 0)
  ]));
  return {
    stages: DEAL_STAGES,
    columns: cols,
    counts,
    sumByStage,
    total_value: Math.round(totalValue),
    weighted_value: Math.round(weightedValue),
  };
}

// ─────────────────────────────────────────────────────────────
// B5 — Workflow Automation
// ─────────────────────────────────────────────────────────────
const RULES_BUCKET = '__workflow_rules__';
const RULE_TRIGGERS = ['contact.status_changed', 'task.created', 'task.due_today', 'deal.won', 'deal.stage_changed'];
const RULE_ACTIONS = ['notify_tg', 'webhook', 'create_task'];

function getRules(ownerId) {
  const all = loadNotes();
  return all[RULES_BUCKET]?.[ownerId] || [];
}
function setRules(ownerId, rules) {
  const all = loadNotes();
  if (!all[RULES_BUCKET]) all[RULES_BUCKET] = {};
  all[RULES_BUCKET][ownerId] = Array.isArray(rules) ? rules.filter(r => r && r.trigger && r.action).slice(0, 50) : [];
  saveNotes(all);
  return all[RULES_BUCKET][ownerId];
}

function runWorkflow(ownerId, event, payload) {
  // Запускается асинхронно из любого place where event happens.
  const rules = getRules(ownerId);
  if (!rules.length) return;
  const settings = (loadNotes()[SETTINGS_BUCKET] || {})[ownerId] || {};
  const notify = require('./notify');
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger !== event) continue;
    // Optional condition: r.condition is { field, op, value } applied to payload
    if (r.condition) {
      const v = payload?.[r.condition.field];
      const target = r.condition.value;
      const ok = r.condition.op === 'eq' ? v === target :
                 r.condition.op === 'neq' ? v !== target :
                 r.condition.op === 'contains' ? String(v || '').includes(target) :
                 false;
      if (!ok) continue;
    }
    try {
      if (r.action === 'notify_tg' && settings.digestChatId) {
        const msg = '🔔 <b>' + r.title + '</b>\n' + event + ': ' + JSON.stringify(payload).slice(0, 500);
        notify.sendTo(settings.digestChatId, msg).catch(() => {});
      } else if (r.action === 'create_task' && r.taskTitle) {
        addTask(ownerId, {
          title: r.taskTitle.replace(/\{\{(\w+)\}\}/g, (_, k) => payload?.[k] || ''),
          contactUsername: payload?.username || null,
          dueDate: r.taskDueDate || null,
        });
      } else if (r.action === 'webhook') {
        // Webhooks already fire automatically (storage.fireWebhooks), here as fallback
        fireWebhooks(ownerId, event, payload);
      }
    } catch (e) {
      console.warn('[workflow] rule failed:', e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// B4 — Custom fields (по контакту)
// ─────────────────────────────────────────────────────────────
const CFIELDS_BUCKET = '__custom_fields_defs__';

function getCustomFieldDefs(ownerId) {
  const all = loadNotes();
  return all[CFIELDS_BUCKET]?.[ownerId] || [];
}
function setCustomFieldDefs(ownerId, defs) {
  const all = loadNotes();
  if (!all[CFIELDS_BUCKET]) all[CFIELDS_BUCKET] = {};
  // defs = [{ id, label, type: text|number|date|select, options? }]
  all[CFIELDS_BUCKET][ownerId] = Array.isArray(defs) ? defs.slice(0, 30).map(d => ({
    id: String(d.id || '').slice(0, 30).replace(/[^a-z0-9_]/gi, '') || 'f_' + Date.now(),
    label: String(d.label || '').slice(0, 50),
    type: ['text', 'number', 'date', 'select'].includes(d.type) ? d.type : 'text',
    options: Array.isArray(d.options) ? d.options.slice(0, 20).map(String) : [],
  })).filter(d => d.label) : [];
  saveNotes(all);
  return all[CFIELDS_BUCKET][ownerId];
}

function getCustomFieldValues(ownerId, username) {
  const n = getNote(ownerId, username);
  return n?.customFields || {};
}
function setCustomFieldValues(ownerId, username, values) {
  return setNote(ownerId, username, { customFields: values });
}

// ─────────────────────────────────────────────────────────────
// C1 — Reports (pre-built)
// ─────────────────────────────────────────────────────────────
function reportByCategory(ownerId) {
  refresh();
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const companies = cache.companies || [];
  const catMap = new Map(companies.map(c => [c.id, c.category]));
  const items = cache.contacts || [];
  const stats = {};
  for (const u of Object.keys(notes)) {
    if (u === '__settings__') continue;
    const n = notes[u]; if (!n?.status) continue;
    const c = cache.byUsername?.get(u); if (!c) continue;
    const cat = catMap.get(c.company_id) || 'Другое';
    if (!stats[cat]) stats[cat] = { touched: 0, closed: 0, callback: 0 };
    stats[cat].touched++;
    if (n.status === 'closed') stats[cat].closed++;
    if (n.status === 'callback') stats[cat].callback++;
  }
  return Object.entries(stats).map(([cat, v]) => ({
    category: cat, ...v,
    conv_pct: v.touched ? Math.round((v.closed / v.touched) * 1000) / 10 : 0,
  })).sort((a, b) => b.touched - a.touched);
}

function reportByCountry(ownerId) {
  refresh();
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const stats = {};
  for (const u of Object.keys(notes)) {
    if (u === '__settings__') continue;
    const n = notes[u]; if (!n?.status) continue;
    const c = cache.byUsername?.get(u); if (!c) continue;
    const co = c.country || '—';
    if (!stats[co]) stats[co] = { touched: 0, closed: 0 };
    stats[co].touched++;
    if (n.status === 'closed') stats[co].closed++;
  }
  return Object.entries(stats).map(([co, v]) => ({
    country: co, ...v,
    conv_pct: v.touched ? Math.round((v.closed / v.touched) * 1000) / 10 : 0,
  })).sort((a, b) => b.touched - a.touched).slice(0, 20);
}

function reportByTag(ownerId) {
  const all = loadNotes();
  const notes = all[ownerId] || {};
  const stats = {};
  for (const u of Object.keys(notes)) {
    if (u === '__settings__') continue;
    const n = notes[u]; if (!Array.isArray(n?.tags)) continue;
    for (const t of n.tags) {
      if (!stats[t]) stats[t] = { count: 0, closed: 0 };
      stats[t].count++;
      if (n.status === 'closed') stats[t].closed++;
    }
  }
  return Object.entries(stats).map(([tag, v]) => ({
    tag, ...v,
    conv_pct: v.count ? Math.round((v.closed / v.count) * 1000) / 10 : 0,
  })).sort((a, b) => b.count - a.count);
}

function reportRevenueTimeline(ownerId, days = 90) {
  const all = loadNotes();
  const deals = all[DEALS_BUCKET]?.[ownerId] || [];
  const since = Date.now() - days * 86400 * 1000;
  const byDay = {};
  for (const d of deals) {
    if (d.stage !== 'won') continue;
    const ts = +new Date(d.updated_at);
    if (!ts || ts < since) continue;
    const day = new Date(ts).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + d.amount;
  }
  return Object.entries(byDay).sort().map(([day, sum]) => ({ day, sum }));
}

module.exports = {
  listContacts,
  getContact,
  getCompanies,
  getStats,
  getScrapeStatus,
  setNote,
  getNote,
  appendHistory,
  qualityScore,
  regionTier,
  getFacets,
  getGroupBy,
  getSettings,
  setSettings,
  rankContactsByOffer,
  getFunnel,
  listCustom,
  importCsvRows,
  getDailyBatch,
  getDashboard,
  trackShareClick,
  getTags,
  setTags,
  getCompanyNotes,
  setCompanyNotes,
  getCalendar,
  addManualContact,
  getActivityLog,
  getViews,
  saveView,
  deleteView,
  listTasks,
  addTask,
  updateTask,
  deleteTask,
  getWebhooks,
  setWebhooks,
  fireWebhooks,
  getKanban,
  listDeals,
  addDeal,
  updateDeal,
  deleteDeal,
  getDealsPipeline,
  getRules,
  setRules,
  runWorkflow,
  getCustomFieldDefs,
  setCustomFieldDefs,
  getCustomFieldValues,
  setCustomFieldValues,
  reportByCategory,
  reportByCountry,
  reportByTag,
  reportRevenueTimeline,
  getConversion,
  getHeatmap,
  setDigestChat,
  listOwners,
  registerTgOwner,
};

// ── L5 — owner enumeration (for daily digest sweep) ──────────────
function listOwners() {
  const all = loadNotes();
  return Object.keys(all).filter((k) => !k.startsWith('__'));
}

// ── L5 — first-time TG WebApp visit: stamp digestChatId + lang ───
function registerTgOwner(ownerId, tgUser) {
  if (!ownerId || !tgUser?.id) return null;
  const cur = getSettings(ownerId);
  const patch = {};
  if (!cur.digestChatId) patch.digestChatId = tgUser.id;
  if (!cur.lang && tgUser.language_code) patch.lang = tgUser.language_code.startsWith('ru') ? 'ru' : 'en';
  if (!cur.tgUsername && tgUser.username) patch.tgUsername = tgUser.username;
  if (Object.keys(patch).length) setSettings(ownerId, patch);
  return getSettings(ownerId);
}
