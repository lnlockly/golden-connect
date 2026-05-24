// cabinet/scripts/rescrape-mlmbaza-diff.js
// Refresh-pass over mlmbaza: only fetches NEW leaders that didn't exist
// in the previous mlm-contacts.json. Designed to run weekly via cron.
//
// Strategy:
//   1) Re-fetch /companies/ index (cheap, 1 request).
//   2) For each company already known, fetch /company/{id} once and diff
//      its current leader-username list against ours.
//   3) Fetch only newly-added profiles. Append to mlm-contacts.json.
//   4) Persist updated state and bail out gracefully on failures.

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const https = require('https');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const CONTACTS = path.join(DATA_DIR, 'mlm-contacts.json');
const COMPANIES = path.join(DATA_DIR, 'mlm-companies.json');
const STATE = path.join(DATA_DIR, 'mlm-rescrape-state.json');

const RPS = +(process.env.RESCRAPE_RPS || 2);
const REQ_INTERVAL_MS = Math.max(50, Math.floor(1000 / RPS));
const UA = 'Mozilla/5.0 (compatible; Golden Connect/1.0; +https://golden-connect.to)';

function readJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }
function writeJsonAtomic(p, obj) { const t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(obj, null, 2)); fs.renameSync(t, p); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let lastReqAt = 0;
async function rateLimit() { const w = lastReqAt + REQ_INTERVAL_MS - Date.now(); if (w > 0) await sleep(w); lastReqAt = Date.now(); }
function fetch(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': UA }, timeout: 30000 }, (r) => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res({ status: r.statusCode || 0, body: d }));
    }).on('error', rej).on('timeout', () => rej(new Error('timeout')));
  }).catch(() => ({ status: 0, body: '' }));
}
async function get(url) { await rateLimit(); return fetch(url); }

function parseLeader(html, url) {
  const $ = cheerio.load(html);
  const out = {
    url, username: (url.match(/lider\/([^\/?#]+)/) || [])[1] || null,
    name: null, company: null, company_id: null,
    country: null, city: null, region: null,
    description: null, phone: null, email: null, skype: null, website: null,
    contacts: { telegram: null, whatsapp: null, vk: null, instagram: null, facebook: null, ok: null, youtube: null },
    photo: null, fetched_at: new Date().toISOString(),
  };
  if (out.username) out.username = decodeURIComponent(out.username);
  out.name = $('h1').first().text().trim().replace(/^\s*MLM лидер[:\s]*/i, '') || out.username;
  $('.user_view_d img, .user_view_l img').each((_, img) => {
    if (out.photo) return;
    const src = $(img).attr('src') || '';
    if (src && !/img\/social\//i.test(src)) out.photo = src.startsWith('http') ? src : ('https://mlmbaza.com' + src);
  });
  out.description = $('.user_content_d').first().text().trim().replace(/\s+/g, ' ').slice(0, 5000) || null;
  const cl = $('a.link_compani_d, a[href^="/company/"]').first();
  if (cl.length) {
    out.company = cl.text().trim();
    const m = (cl.attr('href') || '').match(/company\/(\d+)/);
    if (m) out.company_id = +m[1];
  }
  $('.user_view_line').each((_, el) => {
    const lab = $(el).find('.user_view_line_l').text().trim().toLowerCase().replace(/[:\s]+$/, '');
    const right = $(el).find('.user_view_line_r');
    const v = right.text().trim();
    const value = v === 'Не указан' ? null : v;
    if (/страна|country/.test(lab)) out.country = value;
    else if (/город|city/.test(lab)) out.city = value;
    else if (/телефон|phone/.test(lab)) {
      const tel = right.find('a[href^="tel:"]').attr('href');
      out.phone = (tel ? tel.replace(/^tel:/, '') : value || '').replace(/\s+/g, '').trim() || null;
    } else if (/e-?mail|почта/.test(lab)) {
      const em = right.find('a[href^="mailto:"]').attr('href');
      out.email = em ? em.replace(/^mailto:/, '') : value;
    }
  });
  $('a[href]').each((_, el) => {
    const h = ($(el).attr('href') || '').replace(/^http:\/\/(?=https?:)/, '').toLowerCase();
    const href = $(el).attr('href') || '';
    if (!out.contacts.telegram && /(t\.me\/|telegram\.me\/)/.test(h) && !/whatsapp|share/.test(h)) out.contacts.telegram = href;
    else if (!out.contacts.whatsapp && /(wa\.me|chat\.whatsapp\.com)/.test(h)) out.contacts.whatsapp = href;
    else if (!out.contacts.vk && /vk\.com\//.test(h) && !/share/.test(h)) out.contacts.vk = href;
  });
  return out;
}

(async () => {
  const contacts = readJson(CONTACTS, []);
  const companies = readJson(COMPANIES, []);
  const knownUsers = new Set(contacts.map(c => c.username).filter(Boolean));
  console.log(`[rescrape] base: ${contacts.length} contacts, ${companies.length} companies`);

  let added = 0, scanned = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    scanned++;
    const r = await get(`https://mlmbaza.com/company/${c.id}`);
    if (r.status !== 200) continue;
    const $ = cheerio.load(r.body);
    const newUsers = [];
    $('a[href^="/lider/"]').each((_, el) => {
      const m = ($(el).attr('href') || '').match(/\/lider\/([^\/?#]+)/);
      if (!m) return;
      const u = decodeURIComponent(m[1]);
      if (!knownUsers.has(u)) newUsers.push(u);
    });
    for (const u of newUsers) {
      const lr = await get(`https://mlmbaza.com/lider/${encodeURIComponent(u)}`);
      if (lr.status !== 200) continue;
      try {
        const profile = parseLeader(lr.body, `https://mlmbaza.com/lider/${u}`);
        contacts.push(profile);
        knownUsers.add(u);
        added++;
        if (added % 25 === 0) writeJsonAtomic(CONTACTS, contacts);
      } catch (e) { /* skip bad parse */ }
    }
    if (i % 50 === 0) console.log(`[rescrape] scanned ${scanned}/${companies.length}, added ${added} new`);
  }
  writeJsonAtomic(CONTACTS, contacts);
  writeJsonAtomic(STATE, {
    last_run: new Date().toISOString(),
    base_before: contacts.length - added,
    base_after: contacts.length,
    added,
  });
  console.log(`[rescrape] DONE: added ${added}, total ${contacts.length}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
