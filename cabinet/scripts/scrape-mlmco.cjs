// scrape-mlmco.cjs — resumable Cloudflare-aware scraper for mlmco.net.
// Designed to run as a long-lived k8s Job mounted on the cabinet PVC.
//
// Output (under /data):
//   mlmco-state.json     — { phase, slugs[], processedCompanies[], leaderSlugs[], processedLeaders[] }
//   mlmco-companies.json — [{ slug, name, leader_count }]
//   mlmco-contacts.json  — [{ source, slug, name, company, url, ...crm fields }]
//
// Strategy:
//   1. Index phase: walk /mlm_companies?page=N (1..60) → collect company slugs
//   2. Companies phase: visit /mlm_companies/{slug} → collect leader slugs + meta
//   3. Leaders phase: visit /mlm_leaders/{slug} → parse profile (name/phone/socials/...)
//
// Resilience:
//   - All progress persisted atomically every 20 items
//   - SIGINT/SIGTERM → flush + exit
//   - Single Puppeteer Page reused; auto-restart on navigation timeouts
//   - Throttles at ~1 req/4s to look human + respect CF

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONTACTS = path.join(DATA_DIR, 'mlmco-contacts.json');
const COMPANIES = path.join(DATA_DIR, 'mlmco-companies.json');
const STATE = path.join(DATA_DIR, 'mlmco-state.json');

const BASE = 'https://mlmco.net';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const CHROMIUM = process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser';
const MAX_LIST_PAGES = Number(process.env.MAX_LIST_PAGES) || 60;
const PAGE_SETTLE_MS = Number(process.env.PAGE_SETTLE_MS) || 2500;
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT) || 60000;

function readJson(p, fb) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; }
}
function writeJsonAtomic(p, obj) {
  const t = p + '.tmp';
  fs.writeFileSync(t, JSON.stringify(obj, null, 2));
  fs.renameSync(t, p);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function ts() { return new Date().toISOString().slice(11, 19); }
function log(...a) { console.log('[' + ts() + ']', ...a); }

// ─── persistent state ─────────────────────────────────────────────
let state = readJson(STATE, {
  phase: 'index',
  slugs: [],
  processedCompanies: [],
  leaderSlugs: [],
  processedLeaders: [],
});
let companies = readJson(COMPANIES, []);
let contacts = readJson(CONTACTS, []);
const seenCompanies = new Set(state.processedCompanies);
const seenLeaders = new Set(state.processedLeaders);

function flushAll(label) {
  writeJsonAtomic(STATE, state);
  writeJsonAtomic(COMPANIES, companies);
  writeJsonAtomic(CONTACTS, contacts);
  if (label) log(label);
}

let stopping = false;
process.on('SIGINT', () => { stopping = true; log('SIGINT — flushing'); flushAll('saved'); process.exit(0); });
process.on('SIGTERM', () => { stopping = true; log('SIGTERM — flushing'); flushAll('saved'); process.exit(0); });

// ─── browser lifecycle ────────────────────────────────────────────
let browser = null;
let page = null;
async function startBrowser() {
  if (browser) { try { await browser.close(); } catch (_) {} }
  browser = await puppeteer.launch({
    executablePath: CHROMIUM,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--lang=ru-RU,ru',
    ],
  });
  page = await browser.newPage();
  await page.setUserAgent(UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.5' });
  await page.setViewport({ width: 1280, height: 800 });
  // Block images/fonts for speed.
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'image' || t === 'font' || t === 'media' || t === 'stylesheet') req.abort();
    else req.continue();
  });
}

async function visit(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await sleep(PAGE_SETTLE_MS);
      const html = await page.content();
      // Cloudflare "just a moment" → wait + retry
      if (html.includes('Just a moment') || html.includes('challenge-platform')) {
        log('  CF challenge on', url, 'attempt', attempt);
        await sleep(8000);
        continue;
      }
      return html;
    } catch (e) {
      log('  visit error', attempt, url, e.message);
      if (attempt === 3) return null;
      try { await startBrowser(); } catch (_) {}
      await sleep(5000);
    }
  }
  return null;
}

// ─── parsers (regex, no cheerio dep) ──────────────────────────────
function parseCompanySlugs(html) {
  const out = new Set();
  const re = /\/mlm_companies\/([a-z0-9-]+)(?:[?#"]|$)/g;
  let m; while ((m = re.exec(html))) { if (m[1] !== 'add') out.add(m[1]); }
  return [...out];
}

function parseLeaderSlugs(html) {
  const out = new Set();
  const re = /\/mlm_leaders\/([a-zA-Z0-9_-]+)(?:[?#"]|$)/g;
  let m; while ((m = re.exec(html))) out.add(m[1]);
  return [...out];
}

function parseH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
}

function pickAttr(html, attr) {
  const re = new RegExp(attr + '=["\']([^"\']+)["\']', 'i');
  const m = html.match(re); return m ? m[1] : null;
}

function pickLink(html, regex) {
  const m = html.match(regex);
  return m ? m[0] : null;
}

function parseLeaderProfile(html, slug, fallbackCompany) {
  const name = parseH1(html) || slug.replace(/[-_]+/g, ' ');
  const phoneMatch = html.match(/(?:tel:|\b)\+?\d[\d\s().-]{7,}/);
  const phone = phoneMatch ? phoneMatch[0].replace(/^tel:/, '').replace(/\s+/g, '') : null;
  const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0] : null;
  const contacts = {
    telegram: pickLink(html, /https?:\/\/(?:t\.me|telegram\.me)\/[a-zA-Z0-9_]+/),
    whatsapp: pickLink(html, /https?:\/\/(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)\/[^"'\s<>]+/),
    vk: pickLink(html, /https?:\/\/vk\.com\/[^"'\s<>?]+/),
    instagram: pickLink(html, /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>?]+/),
    facebook: pickLink(html, /https?:\/\/(?:www\.)?facebook\.com\/[^"'\s<>?]+/),
    youtube: pickLink(html, /https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^"'\s<>?]+/),
    ok: pickLink(html, /https?:\/\/ok\.ru\/[^"'\s<>?]+/),
  };
  let photo = null;
  const imgMatch = html.match(/<img[^>]*src=["']([^"']+)["']/i);
  if (imgMatch && !/icon|logo|placeholder|svg/i.test(imgMatch[1])) {
    photo = imgMatch[1].startsWith('http') ? imgMatch[1] : BASE + imgMatch[1];
  }
  return {
    source: 'mlmco',
    slug,
    name,
    company: fallbackCompany,
    url: BASE + '/mlm_leaders/' + slug,
    phone,
    email,
    contacts,
    photo,
    fetched_at: new Date().toISOString(),
  };
}

// ─── main loop ────────────────────────────────────────────────────
(async () => {
  log('starting; phase=' + state.phase + ' slugs=' + state.slugs.length +
      ' companies_processed=' + seenCompanies.size +
      ' leaders=' + state.leaderSlugs.length +
      ' contacts=' + contacts.length);
  await startBrowser();

  // Phase 1 — list pages
  if (state.phase === 'index') {
    for (let p = 1; p <= MAX_LIST_PAGES && !stopping; p++) {
      const html = await visit(BASE + '/mlm_companies?page=' + p);
      if (!html) { log('list', p, 'EMPTY'); continue; }
      const found = parseCompanySlugs(html);
      let added = 0;
      for (const s of found) if (!state.slugs.includes(s)) { state.slugs.push(s); added++; }
      log('list', p, '+' + added, 'total', state.slugs.length);
      writeJsonAtomic(STATE, state);
      if (added === 0 && p > 3) { log('no new slugs, stopping list walk'); break; }
    }
    state.phase = 'companies';
    flushAll('phase 1 done — ' + state.slugs.length + ' companies');
  }

  // Phase 2 — company pages → leader slugs
  for (let i = 0; i < state.slugs.length && !stopping; i++) {
    const slug = state.slugs[i];
    if (seenCompanies.has(slug)) continue;
    const html = await visit(BASE + '/mlm_companies/' + encodeURIComponent(slug));
    if (!html) { seenCompanies.add(slug); state.processedCompanies = [...seenCompanies]; continue; }
    const h1 = parseH1(html) || slug;
    const leaderSlugs = parseLeaderSlugs(html);
    if (!companies.find((c) => c.slug === slug)) {
      companies.push({ slug, name: h1, leader_count: leaderSlugs.length });
    }
    for (const ls of leaderSlugs) {
      if (!state.leaderSlugs.includes(ls)) state.leaderSlugs.push(ls);
    }
    seenCompanies.add(slug);
    state.processedCompanies = [...seenCompanies];
    if ((i + 1) % 20 === 0) {
      flushAll('co ' + (i + 1) + '/' + state.slugs.length + ' ' + slug + ' +' + leaderSlugs.length + ' leaders; total ' + state.leaderSlugs.length);
    }
  }
  if (state.phase === 'companies') {
    state.phase = 'leaders';
    flushAll('phase 2 done — ' + state.leaderSlugs.length + ' unique leaders');
  }

  // Phase 3 — leader profiles
  for (let i = 0; i < state.leaderSlugs.length && !stopping; i++) {
    const ls = state.leaderSlugs[i];
    if (seenLeaders.has(ls)) continue;
    if (contacts.find((c) => c.slug === ls)) { seenLeaders.add(ls); continue; }
    // Find which company they belong to (best-effort: first company that listed them — skipped for speed)
    const html = await visit(BASE + '/mlm_leaders/' + encodeURIComponent(ls));
    if (!html) { seenLeaders.add(ls); continue; }
    try {
      const profile = parseLeaderProfile(html, ls, null);
      contacts.push(profile);
    } catch (e) {
      log('parse fail', ls, e.message);
    }
    seenLeaders.add(ls);
    state.processedLeaders = [...seenLeaders];
    if ((i + 1) % 25 === 0) {
      flushAll('ld ' + (i + 1) + '/' + state.leaderSlugs.length + ' contacts=' + contacts.length);
    }
  }

  flushAll('DONE — companies=' + companies.length + ' contacts=' + contacts.length);
  try { await browser.close(); } catch (_) {}
  process.exit(0);
})().catch((e) => {
  log('FATAL', e.message);
  flushAll('crashed — state saved');
  process.exit(1);
});
