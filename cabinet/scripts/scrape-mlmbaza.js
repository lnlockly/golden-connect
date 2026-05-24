// scrape-mlmbaza.js — full mlmbaza.com scraper.
// Run: node cabinet/scripts/scrape-mlmbaza.js [--max-companies=N] [--rps=1]
//
// Output (incremental, atomic):
//   data/mlm-contacts.json  — array of leader objects, deduped by username
//   data/mlm-companies.json — array of company {id,name,leader_count,...}
//   data/mlm-scrape-state.json — checkpoint {phase, lastCompanyId, lastLeaderIdx, fetchedTotal, ts}
//
// Resumes automatically from checkpoint. Press Ctrl+C — checkpoint persists.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const CONTACTS_PATH = path.join(DATA_DIR, 'mlm-contacts.json');
const COMPANIES_PATH = path.join(DATA_DIR, 'mlm-companies.json');
const STATE_PATH = path.join(DATA_DIR, 'mlm-scrape-state.json');

const ARG = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([\w-]+)=?(.*)$/);
  return m ? [m[1], m[2] || true] : [a, true];
}));
const RPS = Number(ARG.rps || 1);              // requests per second
const MAX_COMPANIES = Number(ARG['max-companies'] || 0); // 0 = no limit
const REQ_INTERVAL_MS = Math.max(50, Math.floor(1000 / RPS));
const USER_AGENT = 'Mozilla/5.0 (compatible; Golden Connect/1.0; +https://goldenConnect.to)';

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---- atomic JSON helpers ----
function readJsonSafe(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(p, obj) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p);
}

// ---- state ----
let state = readJsonSafe(STATE_PATH, {
  phase: 'companies',     // companies | leaders | done
  companiesIndex: null,   // [{id,name,leaderCount}]
  pendingCompanyId: null, // current company being processed
  processedCompanyIds: [],
  fetchedLeaderUsernames: [], // for dedup
  startedAt: new Date().toISOString(),
  updatedAt: null,
  lastError: null,
});
let contacts = readJsonSafe(CONTACTS_PATH, []);
let companies = readJsonSafe(COMPANIES_PATH, []);
const seenUsernames = new Set(state.fetchedLeaderUsernames);

let lastReqAt = 0;
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function rateLimit() {
  const now = Date.now();
  const wait = lastReqAt + REQ_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
}

function fetch(url, attempt = 0) {
  return new Promise((res, rej) => {
    https.get(url, {
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ru,en' },
      timeout: 30000,
    }, (r) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => res({ status: r.statusCode || 0, body: data }));
    }).on('error', rej).on('timeout', () => rej(new Error('timeout')));
  }).catch(async (e) => {
    if (attempt < 3) {
      const wait = (attempt + 1) * 5000;
      console.warn(`[fetch retry ${attempt + 1}] ${url} after ${wait}ms (${e.message})`);
      await sleep(wait);
      return fetch(url, attempt + 1);
    }
    return { status: 0, body: '', error: e.message };
  });
}

async function get(url) {
  await rateLimit();
  let r = await fetch(url);
  // Retry on 429/5xx
  for (let i = 0; (r.status === 429 || (r.status >= 500 && r.status <= 599)) && i < 3; i++) {
    const wait = 5000 * (i + 1);
    console.warn(`[backoff] ${r.status} on ${url}, wait ${wait}ms`);
    await sleep(wait);
    r = await fetch(url);
  }
  return r;
}

// ---- parse companies index ----
function parseCompaniesIndex(html) {
  const $ = cheerio.load(html);
  const items = [];
  $('a[href^="/company/"]').each((_, el) => {
    const href = $(el).attr('href');
    const m = href.match(/\/company\/(\d+)/);
    if (!m) return;
    const id = +m[1];
    // text: "Amway 138" or "Amway"
    const text = $(el).text().trim();
    const cm = text.match(/^(.+?)\s+(\d+)\s*$/);
    const name = (cm ? cm[1] : text).trim();
    const leaderCount = cm ? +cm[2] : null;
    items.push({ id, name, leaderCount });
  });
  // Dedup by id
  const byId = new Map();
  for (const it of items) if (!byId.has(it.id)) byId.set(it.id, it);
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// ---- parse company page (list of leader usernames) ----
function parseCompanyPage(html, companyId) {
  const $ = cheerio.load(html);
  const usernames = new Set();
  $('a[href^="/lider/"]').each((_, el) => {
    const href = $(el).attr('href');
    const m = href.match(/\/lider\/([^\/?#]+)/);
    if (m) usernames.add(decodeURIComponent(m[1]));
  });
  const h1 = $('h1').first().text().trim();
  return { name: h1.replace(/^Млм компания\s*/i, '').trim() || null, usernames: [...usernames] };
}

// ---- parse leader profile ----
function parseLeader(html, url) {
  const $ = cheerio.load(html);
  const out = {
    url,
    username: (url.match(/lider\/([^\/?#]+)/) || [])[1] || null,
    name: null, company: null, company_id: null,
    country: null, city: null, region: null,
    description: null, phone: null, email: null, skype: null, website: null,
    contacts: { telegram: null, whatsapp: null, vk: null, instagram: null, facebook: null, ok: null, youtube: null },
    photo: null,
    fetched_at: new Date().toISOString(),
  };
  if (out.username) out.username = decodeURIComponent(out.username);

  const h1 = $('h1').first().text().trim();
  if (h1) out.name = h1.replace(/^\s*MLM лидер[:\s]*/i, '').trim() || h1;

  // Profile photo — find user_view image that ISN'T a social icon
  $('.user_view_d img, .user_view_l img, img.profile_photo').each((_, img) => {
    if (out.photo) return;
    const src = $(img).attr('src') || '';
    if (!src) return;
    if (/img\/social\//i.test(src)) return; // skip social icons
    out.photo = src.startsWith('http') ? src : ('https://mlmbaza.com' + src);
  });

  const about = $('.user_content_d').first().text().trim();
  if (about) out.description = about.replace(/\s+/g, ' ').slice(0, 5000);

  const compLink = $('a.link_compani_d, a[href^="/company/"]').first();
  if (compLink.length) {
    out.company = compLink.text().trim();
    const m = (compLink.attr('href') || '').match(/company\/(\d+)/);
    if (m) out.company_id = +m[1];
  }

  $('.user_view_line').each((_, el) => {
    const label = $(el).find('.user_view_line_l').text().trim().toLowerCase().replace(/[:\s]+$/, '');
    const right = $(el).find('.user_view_line_r');
    const valueRaw = right.text().trim();
    const value = valueRaw === 'Не указан' ? null : valueRaw;
    if (!label) return;
    if (/страна|country/.test(label)) out.country = value;
    else if (/город|city/.test(label)) out.city = value;
    else if (/регион|state/.test(label)) out.region = value;
    else if (/телефон|phone/.test(label)) {
      const tel = right.find('a[href^="tel:"]').attr('href');
      out.phone = (tel ? tel.replace(/^tel:/, '') : value || '').replace(/\s+/g, '').trim() || null;
    } else if (/e-?mail|почта/.test(label)) {
      const em = right.find('a[href^="mailto:"]').attr('href');
      out.email = em ? em.replace(/^mailto:/, '') : value;
    } else if (/skype/.test(label)) {
      out.skype = value;
    } else if (/сайт|web|site/.test(label)) {
      out.website = right.find('a').attr('href') || value;
    }
  });

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').replace(/^http:\/\/(?=https?:)/, '');
    const h = href.toLowerCase();
    if (!out.contacts.telegram && /(t\.me\/|telegram\.me\/)/.test(h) && !/whatsapp|share/.test(h)) out.contacts.telegram = href;
    else if (!out.contacts.whatsapp && /(wa\.me|chat\.whatsapp\.com|whatsapp\.com\/send)/.test(h)) out.contacts.whatsapp = href;
    else if (!out.contacts.vk && /vk\.com\//.test(h) && !/share|wall|widget/.test(h)) out.contacts.vk = href;
    else if (!out.contacts.instagram && /instagram\.com\//.test(h) && !/share/.test(h)) out.contacts.instagram = href;
    else if (!out.contacts.facebook && /facebook\.com\//.test(h) && !/share|sharer|widget/.test(h)) out.contacts.facebook = href;
    else if (!out.contacts.ok && /ok\.ru\//.test(h) && !/share/.test(h)) out.contacts.ok = href;
    else if (!out.contacts.youtube && /(youtube\.com\/|youtu\.be\/)/.test(h)) out.contacts.youtube = href;
  });

  return out;
}

// ---- persistence helpers ----
function saveAll(reason = 'tick') {
  state.updatedAt = new Date().toISOString();
  state.fetchedLeaderUsernames = [...seenUsernames];
  writeJsonAtomic(STATE_PATH, state);
  writeJsonAtomic(CONTACTS_PATH, contacts);
  writeJsonAtomic(COMPANIES_PATH, companies);
}

function logProgress(extra) {
  const now = new Date().toISOString();
  const ms = Date.now();
  console.log(`[${now}] ${extra} | total contacts=${contacts.length} companies=${state.processedCompanyIds.length}/${state.companiesIndex ? state.companiesIndex.length : '?'}`);
}

// ---- main ----
async function main() {
  // Phase 1: companies index
  if (!state.companiesIndex || state.companiesIndex.length === 0) {
    console.log('[phase=companies] fetching index...');
    const r = await get('https://mlmbaza.com/companies/');
    if (r.status !== 200) throw new Error('companies index failed: ' + r.status);
    state.companiesIndex = parseCompaniesIndex(r.body);
    companies = state.companiesIndex.map((c) => ({ ...c, fetched: false }));
    console.log(`[phase=companies] found ${state.companiesIndex.length} companies`);
    state.phase = 'leaders';
    saveAll('companies-index');
  }

  // Phase 2: per company → leader usernames → leader profiles
  state.phase = 'leaders';
  let totalCompanies = state.companiesIndex.length;
  if (MAX_COMPANIES > 0) totalCompanies = Math.min(totalCompanies, MAX_COMPANIES);

  for (let i = 0; i < totalCompanies; i++) {
    const c = state.companiesIndex[i];
    if (state.processedCompanyIds.includes(c.id)) continue;

    state.pendingCompanyId = c.id;
    saveAll('company-start');

    const compUrl = `https://mlmbaza.com/company/${c.id}`;
    const r = await get(compUrl);
    if (r.status !== 200) {
      console.warn(`[company ${c.id}] http=${r.status} skipping`);
      state.processedCompanyIds.push(c.id);
      continue;
    }
    const cp = parseCompanyPage(r.body, c.id);
    const idx = companies.findIndex((x) => x.id === c.id);
    if (idx >= 0) {
      companies[idx].leaderCount = cp.usernames.length;
      companies[idx].fetched = true;
    }
    console.log(`[company ${i+1}/${totalCompanies} #${c.id} ${cp.name || c.name}] ${cp.usernames.length} leaders`);

    for (const username of cp.usernames) {
      if (seenUsernames.has(username)) continue;
      const url = `https://mlmbaza.com/lider/${encodeURIComponent(username)}`;
      const lr = await get(url);
      if (lr.status !== 200) {
        console.warn(`[leader ${username}] http=${lr.status}`);
        seenUsernames.add(username);
        continue;
      }
      try {
        const profile = parseLeader(lr.body, url);
        contacts.push(profile);
        seenUsernames.add(username);
      } catch (e) {
        console.warn(`[leader ${username}] parse err: ${e.message}`);
        seenUsernames.add(username);
      }
      // Save every 50 leaders
      if (contacts.length % 50 === 0) {
        saveAll('checkpoint');
        logProgress(`+50 leaders`);
      }
    }

    state.processedCompanyIds.push(c.id);
    saveAll('company-end');
    logProgress(`company ${c.id} done`);
  }

  state.phase = 'done';
  state.pendingCompanyId = null;
  saveAll('finished');
  console.log(`\n=== DONE === total contacts=${contacts.length}`);
}

// graceful shutdown
process.on('SIGINT', () => { console.log('\n[SIGINT] saving state...'); saveAll('sigint'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n[SIGTERM] saving state...'); saveAll('sigterm'); process.exit(0); });

main().catch((e) => {
  console.error('FATAL:', e);
  state.lastError = String(e.message || e);
  saveAll('fatal');
  process.exit(1);
});
