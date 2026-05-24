const fs = require('fs');
const path = require('path');
const express = require('express');
const { setupAdminRoutes } = require('./routes/admin');
const config = require('./config');
const { createStorage } = require('./storage');
const { createBot } = require('./bot');
// One-shot sample-data seed (idempotent, see scripts/seed-sample-data.js).
try { require("../scripts/seed-sample-data"); } catch (e) { console.error("[seed] failed:", e && e.message ? e.message : e); }
const { createWebRouter } = require('./web-routes');
const { buildSiteContent } = require('./site-content');
const { createBackupManager } = require('./backups');
const { createMonitoring } = require('./monitoring');
const http = require('http');
const { attachToApp: attachWebappConference } = require('./planner/webapp/attach');

if (!config.botToken) {
  console.error('BOT_TOKEN is required');
  process.exit(1);
}

const storage = createStorage(config);
const { bot, startCron, notifyWebUser } = createBot(config, storage);
const app = express();
app.set('trust proxy', 1);

// [web-ref-cookie-2026-05-17] Capture ?ref=xhCODE into a cookie so it survives to /register.
// Refs are referral codes (xh followed by alphanum). 30-day cookie, httpOnly:false
// (so register.html JS can read it via document.cookie). Cookie is overwritten
// on subsequent ?ref= clicks (last-touch attribution at landing time).
app.use((req, res, next) => {
  try {
    const raw = String((req.query && req.query.ref) || '').trim().toLowerCase();
    if (raw && /^xh[a-z0-9]{1,32}$/.test(raw)) {
      const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
      res.cookie('trendex_ref', raw, {
        path: '/',
        domain: cookieDomain,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax',
        secure: true,
      });
    }
  } catch (e) {
    // never break the request
  }
  next();
});
app.locals.storage = storage;

// [lead-pool-2026-05-19] Personal lead pool: per-user reservations on top of mlm-contacts.json.
// Two CRM operators no longer see the same 9,839 leads — each gets a private
// 50-lead reservation that recycles after 72h. Prerequisite for mass-send.
try {
  const leadPool = require('./services/lead-pool');
  const { getDb } = require('./planner/db/database');
  leadPool.init(getDb());
  app.locals.leadPool = leadPool;
  // Expire stale reservations every 30 min (lazy expiry on read covers per-user case)
  setInterval(() => { try { leadPool.expireOld(); } catch (e) { console.error('[lead-pool-cron]', e.message); } }, 30 * 60 * 1000);
  console.log('[lead-pool] initialized + cron armed (30min expiry)');
  // [crm-team-2026-05-20] CRM work-team (teams + task board + activity)
  try {
    const crmTeam = require('./services/crm-team');
    crmTeam.init(getDb(), storage);
    app.locals.crmTeam = crmTeam;
    // best-effort push via cabinet bot to a team member's TG
    try {
      crmTeam.setNotifier((webUserId, text) => {
        try {
          const wu = storage.getPublicWebUserById && storage.getPublicWebUserById(webUserId);
          const chatId = wu && wu.telegramUserId;
          if (chatId && global.__cabinetBot && global.__cabinetBot.api) {
            global.__cabinetBot.api.sendMessage(Number(chatId), text).catch(() => {});
          }
        } catch (_) {}
      });
    } catch (_) {}
    console.log('[crm-team] initialized');
    // [journey-2026-05-21] Activation Journey (replaces XP quests)
    try {
      const journey = require('./services/journey');
      journey.init(getDb(), storage);
      app.locals.journey = journey;
      console.log('[journey] initialized');
    } catch (e) { console.error('[journey init]', e && e.message ? e.message : e); }
  } catch (e) {
    console.error('[crm-team init]', e && e.message ? e.message : e);
  }
} catch (e) {
  console.error('[lead-pool init]', e && e.message ? e.message : e);
}  // [auth-fix] make storage reachable from middleware/auth.js for /api/mlm session resolution
app.locals.config = config;

// === Subpath mount ====================================================
// When BASE_PATH is set (e.g. "/cabinet"), the cabinet is reachable at
//   trendex.biz/cabinet/...   instead of  cabinet.trendex.biz/...
// We strip the prefix from incoming req.url so existing handlers (which
// are all written as if the app lived at root) continue to work, and we
// wrap res.redirect so that absolute-path redirects keep the prefix on
// the way back out to the browser. Cookies are scoped to BASE_PATH so
// session cookies don't leak to the rest of trendex.biz.
// [trailing-slash-fix] Force trailing slash on BASE_PATH bare URL.
// When BASE_PATH=/cabinet and external URL = /cabinet (no slash), browser
// treats 'cabinet' as a file and resolves relative paths against /,
// landing in trendex-landing pod and getting HTML back for js/css → 'Unexpected token <'.
const _RAW_BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
if (_RAW_BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === _RAW_BASE_PATH) {
      const qs = req.originalUrl && req.originalUrl.indexOf('?') >= 0 ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      return res.redirect(301, _RAW_BASE_PATH + '/' + qs);
    }
    next();
  });
}

const BASE_PATH = (process.env.BASE_PATH || '').replace(/\/+$/, '');
if (BASE_PATH) {
  app.use((req, res, next) => {
    if (req.url === BASE_PATH) {
      req.url = '/';
    } else if (req.url.startsWith(BASE_PATH + '/')) {
      req.url = req.url.slice(BASE_PATH.length) || '/';
    }
    const origRedirect = res.redirect.bind(res);
    res.redirect = function patched(statusOrUrl, maybeUrl) {
      let status = 302; let target;
      if (typeof statusOrUrl === 'number') { status = statusOrUrl; target = maybeUrl; }
      else { target = statusOrUrl; }
      if (typeof target === 'string' && target.startsWith('/') && !target.startsWith(BASE_PATH + '/') && target !== BASE_PATH) {
        target = BASE_PATH + target;
      }
      return origRedirect(status, target);
    };
    next();
  });
}
config.basePath = BASE_PATH;

const startedAt = Date.now();
const backupManager = createBackupManager(config);
const monitoring = createMonitoring({
  config,
  bot,
  storage,
  startedAt,
  getBackupStatus: () => backupManager.getStatus(),
});
const siteRoot = path.join(__dirname, '..', 'public', 'site');
const siteContent = buildSiteContent(config);
const indexTemplate = fs.readFileSync(path.join(siteRoot, 'index.html'), 'utf8');

function sendNoStoreFile(res, filePath) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  return res.sendFile(filePath);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeJsonScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function pickLocalizedValue(map, lang, fallback = '') {
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    return String(map[lang] || map.ru || fallback || '').trim();
  }
  return String(map || fallback || '').trim();
}

function buildAbsoluteUrl(origin, urlOrPath) {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return new URL('/', origin).toString();
  if (/^https?:\/\//i.test(raw)) return raw;
  return new URL(raw.startsWith('/') ? raw : `/${raw}`, origin).toString();
}

function fillUrlTemplate(template, values = {}) {
  const source = String(template || '').trim();
  if (!source) return '';
  return source.replace(/\{(ref|referralCode|code|lang|landingId|source)\}/gi, (match, token) => {
    const key = String(token || '').trim().toLowerCase();
    const resolved = values[key];
    return resolved === undefined || resolved === null ? '' : encodeURIComponent(String(resolved));
  });
}

function buildCompanyReferralUrlByCode(referralCode, params = {}) {
  const template = String(siteContent.links && siteContent.links.companyRegistrationTemplate || '').trim();
  const companyCatalog = String(siteContent.links && (siteContent.links.companyCatalog || siteContent.links.shop) || '').trim();
  const companyMain = String(siteContent.links && (siteContent.links.companyMain || siteContent.links.officialSite) || '').trim();
  if (template) {
    return fillUrlTemplate(template, {
      ref: referralCode,
      referralcode: referralCode,
      code: referralCode,
      lang: params.lang || 'ru',
      landingid: params.landingId || 'health',
      source: params.source || 'bio',
    });
  }
  return companyCatalog || companyMain || '';
}

function buildLandingMeta(req) {
  const origin = String(config.publicBaseUrl || '').trim().replace(/\/$/, '')
    || `${req.protocol}://${req.get('host')}`;
  const library = siteContent.landingLibrary || {};
  const defaultLanguage = String(library.defaultLanguage || 'ru').trim().toLowerCase();
  const languages = Array.isArray(library.languages) ? library.languages : [];
  const types = Array.isArray(library.types) ? library.types : [];
  const requestedLang = String(req.query.lang || defaultLanguage).trim().toLowerCase();
  const requestedLanding = String(req.query.landing || 'health').trim().toLowerCase();
  const lang = languages.some((item) => item.id === requestedLang) ? requestedLang : defaultLanguage;
  const landingId = types.some((item) => item.id === requestedLanding) ? requestedLanding : 'health';
  const landing = types.find((item) => item.id === landingId) || {};
  const defaultTitle = pickLocalizedValue(siteContent.landing && siteContent.landing.heroTitle, lang, 'Trendex');
  const defaultDescription = pickLocalizedValue(siteContent.landing && siteContent.landing.heroText, lang, 'Каталог, лендинги, рекламные материалы и кабинет партнёра Trendex.');
  const rawTitle = pickLocalizedValue(landing.heroTitle, lang, defaultTitle) || defaultTitle;
  const title = rawTitle.toLowerCase().includes('trendex') ? rawTitle : `${rawTitle} | Trendex`;
  const description = pickLocalizedValue(landing.descriptions, lang, defaultDescription) || defaultDescription;
  const canonical = new URL('/', origin);
  if (landingId !== 'health') canonical.searchParams.set('landing', landingId);
  if (lang !== defaultLanguage) canonical.searchParams.set('lang', lang);

  const seo = siteContent.seo || {};
  const imagePath = (seo.landingImages && seo.landingImages[landingId]) || seo.defaultImage || '/media/brand-og.jpg';
  const image = buildAbsoluteUrl(origin, imagePath);
  const imageAlt = `${rawTitle} — Trendex`;
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const alternateLinks = languages.map((item) => {
    const href = new URL('/', origin);
    if (landingId !== 'health') href.searchParams.set('landing', landingId);
    if (item.id !== defaultLanguage) href.searchParams.set('lang', item.id);
    return {
      hreflang: item.id,
      href: href.toString(),
    };
  });
  const xDefault = new URL('/', origin);
  if (landingId !== 'health') xDefault.searchParams.set('landing', landingId);
  const isValidUrl = (value) => {
    if (!value) return false;
    try {
      const u = new URL(String(value));
      return Boolean(u.protocol && u.host);
    } catch (e) {
      return false;
    }
  };
  const sameAs = [
    siteContent.links && siteContent.links.officialSite,
    siteContent.links && siteContent.links.companyMain,
    siteContent.links && siteContent.links.channel,
    siteContent.links && siteContent.links.mainChat,
  ].filter(isValidUrl);
  const uniqueSameAs = Array.from(new Set(sameAs));
  const orgName = (siteContent.brand && siteContent.brand.name) || 'Trendex';
  const orgLogo = buildAbsoluteUrl(origin, (seo.logo || seo.defaultImage || '/media/brand-og.jpg'));
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: orgName,
      url: `${origin}/`,
      logo: orgLogo,
      sameAs: uniqueSameAs,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Trendex',
      url: `${origin}/`,
      inLanguage: lang,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: rawTitle,
      description,
      url: canonical.toString(),
      inLanguage: lang,
      primaryImageOfPage: image,
    },
  ];

  return {
    lang,
    dir,
    title,
    description,
    canonical: canonical.toString(),
    image,
    imageAlt,
    alternateLinks,
    xDefaultHref: xDefault.toString(),
    structuredData,
  };
}

function renderLandingPage(req, res) {
  const meta = buildLandingMeta(req);
  const alternateLinksMarkup = [
    ...meta.alternateLinks.map((item) => `<link rel="alternate" hreflang="${escapeHtml(item.hreflang)}" href="${escapeHtml(item.href)}">`),
    `<link rel="alternate" hreflang="x-default" href="${escapeHtml(meta.xDefaultHref)}">`,
  ].join('\n  ');
  const html = indexTemplate
    .replace(/%%HTML_LANG%%/g, escapeHtml(meta.lang))
    .replace(/%%HTML_DIR%%/g, escapeHtml(meta.dir))
    .replace(/%%PAGE_TITLE%%/g, escapeHtml(meta.title))
    .replace(/%%PAGE_DESCRIPTION%%/g, escapeHtml(meta.description))
    .replace(/%%PAGE_CANONICAL%%/g, escapeHtml(meta.canonical))
    .replace(/%%PAGE_OG_IMAGE%%/g, escapeHtml(meta.image))
    .replace(/%%PAGE_OG_IMAGE_ALT%%/g, escapeHtml(meta.imageAlt))
    .replace(/%%ALTERNATE_LINKS%%/g, alternateLinksMarkup)
    .replace(/%%STRUCTURED_DATA%%/g, escapeJsonScript(meta.structuredData));
  return res.type('html').send(html);
}

function renderBioHubPage(req, res) {
  const code = String(req.params.code || '').trim().toLowerCase();
  const user = storage.findWebUserByReferralCode(code);
  if (!user) {
    return res.status(404).type('html').send('<!doctype html><title>Bio Hub not found</title><h1>Bio Hub not found</h1>');
  }

  const origin = String(config.publicBaseUrl || '').trim().replace(/\/$/, '')
    || `${req.protocol}://${req.get('host')}`;
  const library = siteContent.landingLibrary || {};
  const defaultLanguage = String(library.defaultLanguage || 'ru').trim().toLowerCase();
  const languages = Array.isArray(library.languages) ? library.languages : [];
  const types = Array.isArray(library.types) ? library.types : [];
  const requestedLang = String(req.query.lang || defaultLanguage).trim().toLowerCase();
  const requestedLanding = String(req.query.landing || 'health').trim().toLowerCase();
  const lang = languages.some((item) => item.id === requestedLang) ? requestedLang : defaultLanguage;
  const landingId = types.some((item) => item.id === requestedLanding) ? requestedLanding : 'health';
  const landing = types.find((item) => item.id === landingId) || {};
  const language = languages.find((item) => item.id === lang) || {};
  const displayName = String(user.displayName || user.email || 'Trendex Partner').trim();
  const headline = String(req.query.headline || '').trim().slice(0, 120)
    || `${displayName} · Trendex`;
  const summary = String(req.query.summary || '').trim().slice(0, 220)
    || pickLocalizedValue(landing.descriptions, lang, pickLocalizedValue(siteContent.landing && siteContent.landing.heroText, lang, 'Каталог, лендинги, рекламные материалы и быстрый вход в Trendex.'));

  const landingTitle = pickLocalizedValue(landing.titles, lang, landing.title || 'Trendex');
  const landingUrl = new URL('/', origin);
  landingUrl.searchParams.set('ref', code);
  landingUrl.searchParams.set('landing', landingId);
  landingUrl.searchParams.set('lang', lang);
  const registerUrl = new URL('/register', origin);
  registerUrl.searchParams.set('ref', code);
  const companyUrl = buildCompanyReferralUrlByCode(code, { lang, landingId, source: 'bio' });
  const catalogUrl = String(siteContent.links && (siteContent.links.companyCatalog || siteContent.links.shop) || '').trim();
  const officialUrl = String(siteContent.links && (siteContent.links.companyMain || siteContent.links.officialSite) || '').trim();
  const themeImage = buildAbsoluteUrl(
    origin,
    ((siteContent.seo || {}).landingImages && (siteContent.seo || {}).landingImages[landingId])
      || (siteContent.seo || {}).defaultImage
      || '/media/brand-og.jpg'
  );

  const actionCards = [
    {
      title: 'Главный лендинг',
      text: 'Персональный лендинг под текущий сценарий и язык.',
      href: landingUrl.toString(),
      label: 'Открыть лендинг',
    },
    {
      title: 'Регистрация у нас',
      text: 'Быстрый вход в кабинет и материалы по вашей рекомендации.',
      href: registerUrl.toString(),
      label: 'Открыть регистрацию',
    },
    {
      title: 'Регистрация в компании',
      text: 'Переход в официальный контур компании по вашей ссылке.',
      href: companyUrl || catalogUrl || officialUrl || landingUrl.toString(),
      label: 'Открыть компанию',
    },
  ];

  const html = `<!doctype html>
<html lang="${escapeHtml(lang)}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${escapeHtml(headline)} | Trendex Bio Hub</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <meta property="og:title" content="${escapeHtml(headline)}">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:image" content="${escapeHtml(themeImage)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${escapeHtml(buildAbsoluteUrl(origin, req.originalUrl || req.url || `/hub/${code}`))}">
  <style>
    :root{color-scheme:dark;--bg:#071018;--card:rgba(10,18,31,.82);--line:rgba(148,163,184,.18);--text:#f8fafc;--muted:#b6c5d6;--cyan:#25d0ff;--gold:#ffd166;--green:#7ae582}
    *{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;background:radial-gradient(circle at top,#12304b 0,#071018 48%,#04070d 100%);color:var(--text)}
    .shell{min-height:100vh;padding:32px 18px 48px}.wrap{max-width:980px;margin:0 auto}.hero{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(37,208,255,.14),rgba(255,209,102,.10));border:1px solid var(--line);border-radius:28px;padding:28px}
    .hero-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;align-items:center}.eyebrow{display:inline-flex;padding:8px 14px;border-radius:999px;background:rgba(37,208,255,.12);border:1px solid rgba(37,208,255,.22);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan)}
    h1{margin:16px 0 10px;font-size:clamp(32px,5vw,54px);line-height:1.02}.lead{margin:0 0 18px;color:var(--muted);font-size:17px;line-height:1.7}
    .meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:18px}.chip{display:inline-flex;padding:9px 12px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid var(--line);font-size:13px;color:var(--muted)}
    .actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:24px}.action{display:flex;flex-direction:column;gap:10px;padding:18px;border-radius:20px;background:var(--card);border:1px solid var(--line);backdrop-filter:blur(18px)}
    .action h2{margin:0;font-size:18px}.action p{margin:0;color:var(--muted);line-height:1.6}.action a,.cta{display:inline-flex;align-items:center;justify-content:center;padding:13px 16px;border-radius:14px;background:linear-gradient(135deg,var(--cyan),#2de1c2);color:#041018;text-decoration:none;font-weight:800}
    .action-secondary{background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02));color:var(--text);border:1px solid var(--line)}
    .preview{border-radius:24px;overflow:hidden;min-height:260px;border:1px solid var(--line);background:#0b1320;position:relative}.preview img{display:block;width:100%;height:100%;object-fit:cover;opacity:.88}
    .preview-copy{position:absolute;inset:auto 16px 16px 16px;padding:16px;border-radius:18px;background:rgba(4,7,13,.72);border:1px solid rgba(255,255,255,.10);backdrop-filter:blur(18px)}
    .preview-copy strong{display:block;font-size:18px;margin-bottom:8px}.preview-copy span{display:block;color:var(--muted);font-size:14px;line-height:1.5}
    .linkbox{margin-top:22px;padding:16px 18px;border-radius:18px;background:rgba(4,7,13,.48);border:1px solid var(--line);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;word-break:break-all;color:#d8e5f3}
    .footer{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-top:18px;color:var(--muted);font-size:13px}
    .footer a{color:var(--gold);text-decoration:none}
    @media (max-width: 840px){.hero-grid{grid-template-columns:1fr}.shell{padding:20px 14px 36px}.hero{padding:20px}}
  </style>
</head>
<body>
  <div class="shell">
    <div class="wrap">
      <section class="hero">
        <div class="hero-grid">
          <div>
            <span class="eyebrow">Trendex Bio Hub</span>
            <h1>${escapeHtml(headline)}</h1>
            <p class="lead">${escapeHtml(summary)}</p>
            <div class="meta">
              <span class="chip">Сценарий: ${escapeHtml(landingTitle)}</span>
              <span class="chip">Язык: ${escapeHtml(language.nativeLabel || language.label || lang.toUpperCase())}</span>
              <span class="chip">Код: ${escapeHtml(code)}</span>
            </div>
            <a class="cta" href="${escapeHtml(landingUrl.toString())}">Открыть основной лендинг</a>
            <div class="linkbox">${escapeHtml(landingUrl.toString())}</div>
          </div>
          <div class="preview">
            <img src="${escapeHtml(themeImage)}" alt="${escapeHtml(landingTitle)}">
            <div class="preview-copy">
              <strong>${escapeHtml(landingTitle)}</strong>
              <span>Один удобный вход в каталог, материалы, кабинет партнёра и переход в официальный контур компании.</span>
            </div>
          </div>
        </div>
      </section>
      <section class="actions">
        ${actionCards.map((item) => `
          <article class="action">
            <h2>${escapeHtml(item.title)}</h2>
            <p>${escapeHtml(item.text)}</p>
            <a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
          </article>
        `).join('')}
      </section>
      <div class="footer">
        <span>Официальный маршрут Trendex: лендинг, кабинет, каталог и компания в одной ссылочной схеме.</span>
        ${officialUrl ? `<a href="${escapeHtml(officialUrl)}">Официальный сайт компании</a>` : ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  return res.type('html').send(html);
}

app.disable('x-powered-by');
// [cabinet-path-early] cabinet route MUST run before createWebRouter
app.get('/cabinet', (req, res) => res.redirect(301, '/'));

// [robots-txt-v1]
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Allow: /bio/',
    'Allow: /landing/',
    'Allow: /landings',
    'Allow: /sitemap.xml',
    'Allow: /sitemap-bio.xml',
    'Disallow: /cabinet/api/',
    'Disallow: /cabinet/admin/',
    'Disallow: /api/',
    'Disallow: /webhooks/',
    '',
    'Sitemap: https://trendex.biz/sitemap.xml',
    ''
  ].join('\n'));
});
// [sitemap-bio-v1] Dynamic sitemap with all published bio pages
app.get('/sitemap-bio.xml', (req, res) => {
  try {
    const db = require('./planner/db/database').getDb();
    const rows = db.prepare("SELECT username, created_at AS updated_at FROM user_bio_profiles WHERE is_public=1 ORDER BY id ASC LIMIT 5000").all();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    rows.forEach(function (r) {
      const lastmod = r.created_at ? String(r.updated_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      xml += '<url><loc>https://trendex.biz/bio/' + encodeURIComponent(r.username) + '</loc><lastmod>' + lastmod + '</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n';
    });
    xml += '</urlset>';
    res.type('application/xml').send(xml);
  } catch (e) { res.status(500).send('<error>' + (e.message || '') + '</error>'); }
});
app.get('/sitemap.xml', (req, res) => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += '<sitemap><loc>https://trendex.biz/sitemap-bio.xml</loc></sitemap>\n';
  xml += '</sitemapindex>';
  res.type('application/xml').send(xml);
});
  // external /cabinet/cabinet → /cabinet
app.get('/cabinet/*', (req, res) => res.redirect(301, '/'));  // external /cabinet/cabinet/* → /cabinet
/* [ads-site-server-wire] */
const _webRouter = createWebRouter(config, storage, bot);
// crm.trendex.biz — root → crm-app.html
app.use((req, res, next) => {
  if (req.hostname === 'crm.trendex.biz' && (req.path === '/' || req.path === '')) {
    return res.redirect(302, '/crm-app.html');
  }
  next();
});

app.use(_webRouter);

// MLM CRM daily digest cron (9:00 MSK)
require('./services/mlm-digest-cron').startCron();

// MLM CRM API (mlmbaza.com база + per-owner notes + Groq pitch)
// initData → req.tgUser, internal-secret → req.webUser (impersonation)
const _tgMw = require('./middleware/tg-initdata');
app.use('/api/mlm', _tgMw.tgInitData, _tgMw.internalImpersonate, require('./routes/mlm-crm'));
// Static for banner assets — /cabinet/ads-asset/banner/<file> after BASE_PATH strip becomes /ads-asset/...
app.use('/ads-asset', require('express').static(require('path').join(process.env.DATA_DIR || '/data', 'ads'), { maxAge: '7d', fallthrough: true }));
// Click-redirect outside /api: /r/banner/:id
app.get('/r/banner/:id', (req, res) => {
  try {
    const ar = _webRouter && _webRouter._adsRouter; if (!ar || !ar._clickRedirectHandler) return res.status(404).send('not found');
    return ar._clickRedirectHandler(req, res);
  } catch (e) { console.error('[r/banner]', e && e.message); return res.status(500).send('err'); }
});

// ────────── Trendex Admin Panel ──────────
try {
  const adminRouter = setupAdminRoutes(storage, config);
  app.use('/admin', adminRouter);
  app.get('/admin', (req, res) => res.sendFile(require('path').join(__dirname, '..', 'public', 'admin.html')));
  console.log('[admin] panel mounted at /admin');
} catch (e) { console.error('[admin] mount failed:', e && e.message); }

app.use('/s', require('./routes/shrbio').createPublicRedirectRouter());
app.use('/bio', require('./routes/bio-public-arsenal'));
app.use('/cabinet/bio', require('./routes/bio-public-arsenal'));

// Trendex custom-domain bio root: any request with Host header NOT in our
// own domains is delegated to the bio renderer (which looks up bio_custom_domains).
// Whitelist by lookup: only delegate to bio router if Host is a VERIFIED
// custom domain in bio_custom_domains. Otherwise pass through (k8s probes,
// pod IP, internal traffic etc. go to normal handlers).
const _bioDomainCache = new Map();
const _bioDomainCacheTtl = 60 * 1000;
app.use((req, res, next) => {
  const host = String(req.hostname || '').toLowerCase();
  if (!host || host === 'trendex.biz' || host.endsWith('.trendex.biz')) return next();
  // Skip API/static/cabinet/etc. paths even if Host is custom
  const p = req.path || '';
  if (p.startsWith('/api') || p.startsWith('/cabinet') || p.startsWith('/s/') ||
      p.startsWith('/socket.io') || p === '/health' || p.startsWith('/planner') ||
      p.startsWith('/meet')) return next();
  // Cache lookup
  try {
    const cached = _bioDomainCache.get(host);
    const now = Date.now();
    let isBioDomain = cached && (now - cached.at) < _bioDomainCacheTtl ? cached.val : null;
    if (isBioDomain === null) {
      const db = require('./planner/db/database').getDb();
      const row = db.prepare("SELECT 1 FROM bio_custom_domains WHERE LOWER(domain) = ? AND dns_status = 'verified' LIMIT 1").get(host);
      isBioDomain = !!row;
      _bioDomainCache.set(host, { val: isBioDomain, at: now });
    }
    if (!isBioDomain) return next();
  } catch (e) { return next(); }
  return require('./routes/bio-public-arsenal')(req, res, next);
});

// Wrap express app in a raw http.Server so Socket.IO (video-call
// signalling from planner/webapp) can attach to the same port. Without
// this wrap, app.listen() would return a server but the planner webapp
// routes + Socket.IO wouldn't be mounted.
const httpServer = http.createServer(app);
try {
  attachWebappConference(app, httpServer, {
    botToken: config.botToken,
    basePath: '/planner',
    joinPath: '/meet',
    socketPath: '/socket.io/',
    sessionCookieName: config.sessionCookieName,
    storage,
  });
} catch (err) {
  console.error('[http] webapp attach failed', err && err.message);
}

if (config.trendexVideoDir && fs.existsSync(config.trendexVideoDir)) {
  app.use(config.trendexVideoPublicPath, express.static(config.trendexVideoDir, {
    maxAge: '7d',
    index: false,
    fallthrough: true,
  }));
}
app.get('/', (req, res) => {
  if (req.query && req.query.src === 'video' && req.query.video) {
    const params = new URLSearchParams(req.query).toString();
    return res.redirect(302, params ? `/media?${params}` : '/media');
  }
  return sendNoStoreFile(res, path.join(siteRoot, 'cabinet.html')); // [cabinet-root-fix]
});
app.get('/s/:code', (req, res) => {
  const item = storage.getShortLinkByCode(req.params.code);
  if (!item || !item.url) {
    return res.status(404).send('Short link not found');
  }
  storage.incrementShortLinkClick(req.params.code);
  return res.redirect(302, item.url);
});

// On-the-fly image converter (WebP/AVIF) for /cabinet/img/*
app.get('/img-x', require('./services/image-convert').convertImage);
app.get('/cabinet/img-x', require('./services/image-convert').convertImage);

// Fast health for k8s probes — no DB, no storage scan, just process alive.
let _healthzReady = false;
app.get('/healthz', (req, res) => res.json({ ok: true, ready: _healthzReady }));

app.get('/health', (req, res) => {
  // [health-deep-v1] db_ok + bot_running checks
  let db_ok = false;
  try { require('./planner/db/database').getDb().prepare('SELECT 1').get(); db_ok = true; } catch (_) {}
  let bot_running = false;
  try { bot_running = !!(bot && (bot.botInfo || bot.isInited)); } catch (_) {}
  const mem = process.memoryUsage();
  const mb = (n) => Math.round(n / (1024 * 1024));
  const backup = backupManager.getStatus();
  const tgMonitorChats = storage.listTelegramMonitorChats ? storage.listTelegramMonitorChats() : [];
  const tgMonitorRecipients = storage.listTelegramMonitorRecipients ? storage.listTelegramMonitorRecipients().filter((item) => item.isActive) : [];
  const tgMonitorEvents = storage.listTelegramMonitorEvents ? storage.listTelegramMonitorEvents({ limit: 10 }) : [];
  res.json({
    ok: true,
    service: 'trendex-cabinet',
    db_ok,
    bot_running,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    pid: process.pid,
    node: process.version,
    memory: {
      rssMb: mb(mem.rss),
      heapUsedMb: mb(mem.heapUsed),
      heapTotalMb: mb(mem.heapTotal),
    },
    telegramUsersCount: storage.getUsersCount(),
    webUsersCount: storage.countWebUsers(),
    backup: {
      lastAt: backup.lastBackupAt,
      count: backup.count,
      error: backup.lastBackupError,
    },
    telegramMonitor: {
      chats: tgMonitorChats.length,
      recipients: tgMonitorRecipients.length,
      latestEventAt: tgMonitorEvents[0] ? tgMonitorEvents[0].createdAt : null,
    },
    monitor: monitoring.getStatus(),
  });
});

app.post('/admin/backup/run', (req, res) => {
  const token = String(req.headers['x-admin-token'] || '').trim();
  const expected = String(process.env.ADMIN_TOKEN || '').trim();
  if (!expected || token !== expected) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const result = backupManager.runBackup();
  return res.json(result);
});

// Separate pages
app.get('/login', (req, res) => sendNoStoreFile(res, path.join(siteRoot, 'login.html')));
app.get('/register', (req, res) => sendNoStoreFile(res, path.join(siteRoot, 'register.html')));
// Magic auto-login from Telegram bot
app.get('/auth/magic', (req, res) => {
  const token = String(req.query.token || '').trim();
  if (!token) {
    return res.status(400).type('html').send('<!doctype html><title>Ошибка</title><body style="background:#080a0f;color:#e8eaed;font-family:sans-serif;text-align:center;padding:60px"><h1>Ссылка недействительна</h1><p>Откройте бот <a href="https://t.me/Trendex_bizbot" style="color:#10b981">@Trendex_bizbot</a> и нажмите "🌐 Кабинет".</p></body>');
  }
  const user = storage.verifyMagicLoginToken(token);
  if (!user) {
    return res.status(401).type('html').send('<!doctype html><title>Ссылка истекла</title><body style="background:#080a0f;color:#e8eaed;font-family:sans-serif;text-align:center;padding:60px"><h1>Ссылка истекла или уже использована</h1><p>Откройте бот <a href="https://t.me/Trendex_bizbot" style="color:#10b981">@Trendex_bizbot</a> и нажмите "🌐 Кабинет" для новой ссылки.</p></body>');
  }
  // Create session
  const rawToken = require('crypto').randomBytes(32).toString('base64url');
  const tokenHash = storage.hashSha256(rawToken);
  const sessionTtlDays = Math.max(1, Math.min(180, Number(config.sessionTtlDays || 30)));
  const expiresAt = new Date(Date.now() + (sessionTtlDays * 24 * 60 * 60 * 1000)).toISOString();
  storage.createWebSession(user.id, tokenHash, {
    expiresAt,
    ip: req.ip,
    userAgent: req.headers['user-agent'] || '',
  });
  const secureCookies = /^https:\/\//i.test(String(config.publicBaseUrl || ''));
  const cookieName = String(config.sessionCookieName || 'trendex_site_session').trim();
  const parts = [`${encodeURIComponent(cookieName)}=${encodeURIComponent(rawToken)}`];
  parts.push(`Max-Age=${sessionTtlDays * 24 * 60 * 60}`);
  parts.push('Path=/');
  parts.push('HttpOnly');
  parts.push('SameSite=Lax');
  if (secureCookies) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  return res.redirect(302, '/');
});
app.get('/hub/:code', (req, res) => renderBioHubPage(req, res));
app.get('/trdx', (req, res) => res.sendFile(path.join(siteRoot, 'trdx.html'))); /* [trdx-page] */
app.get('/reviews', (req, res) => res.sendFile(path.join(siteRoot, 'reviews.html')));
app.get('/faq', (req, res) => res.sendFile(path.join(siteRoot, 'faq.html')));
app.get('/landings', (req, res) => res.sendFile(path.join(siteRoot, 'landings-public.html')));
app.get('/media', (req, res) => res.sendFile(path.join(siteRoot, 'media-public.html')));
app.get('/product/:slug', (req, res) => res.sendFile(path.join(siteRoot, 'product.html')));
app.get('/products-library', (req, res) => res.sendFile(path.join(siteRoot, 'products-library.html')));

app.get('/landing/official', (req, res) => res.sendFile(path.join(siteRoot, 'landing-official.html')));
app.get('/landing/youth', (req, res) => res.sendFile(path.join(siteRoot, 'landing-youth.html')));
app.get('/landing/health', (req, res) => res.sendFile(path.join(siteRoot, 'landing-health.html')));
app.get('/landing/catalog', (req, res) => res.sendFile(path.join(siteRoot, 'landing-catalog.html')));
app.get('/landing/biopunk', (req, res) => res.sendFile(path.join(siteRoot, 'landing-biopunk.html')));
app.get('/landing/luxury', (req, res) => res.sendFile(path.join(siteRoot, 'landing-luxury.html')));
app.get('/landing/brutalist', (req, res) => res.sendFile(path.join(siteRoot, 'landing-brutalist.html')));
app.get('/landing/cyberpunk', (req, res) => res.sendFile(path.join(siteRoot, 'landing-cyberpunk.html')));
app.get('/landing/crm-pro', (req, res) => res.sendFile(path.join(siteRoot, 'landing-crm-pro.html')));
app.get('/landing/wellness', (req, res) => res.sendFile(path.join(siteRoot, 'landing-wellness.html')));
app.get('/landing/techdata', (req, res) => res.sendFile(path.join(siteRoot, 'landing-techdata.html')));
app.get('/landing/aurora', (req, res) => res.sendFile(path.join(siteRoot, 'landing-aurora.html')));
app.get('/landing/swiss', (req, res) => res.sendFile(path.join(siteRoot, 'landing-swiss.html')));
app.get('/landing/synthwave', (req, res) => res.sendFile(path.join(siteRoot, 'landing-synthwave.html')));
app.get('/landing/couture', (req, res) => res.sendFile(path.join(siteRoot, 'landing-couture.html')));
app.get('/landing/depth3d', (req, res) => res.sendFile(path.join(siteRoot, 'landing-depth3d.html')));
app.get('/landing/one-product', (req, res) => res.sendFile(path.join(siteRoot, 'landing-one-product.html')));
app.get('/landing/quiz', (req, res) => res.sendFile(path.join(siteRoot, 'landing-quiz.html')));
app.get('/landing/family', (req, res) => res.sendFile(path.join(siteRoot, 'landing-family.html')));
app.get('/landing/skeptic', (req, res) => res.sendFile(path.join(siteRoot, 'landing-skeptic.html')));
app.get('/landing/urgency', (req, res) => res.sendFile(path.join(siteRoot, 'landing-urgency.html')));
app.get('/landing/broadcast', (req, res) => res.sendFile(path.join(siteRoot, 'landing-broadcast.html')));
app.get('/landing/main-copy', (req, res) => res.sendFile(path.join(siteRoot, 'landing-main-copy.html')));


// === LEAD COLLECTION ===
app.options('/api/lead', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.sendStatus(200);
});
app.post('/api/lead', express.json(), (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { name, phone, source } = req.body || {};
  if (!name || !phone) return res.status(400).json({ ok: false, error: 'name and phone required' });
  try {
    const leadsPath = path.join(process.cwd(), 'data/leads.json');
    const leads = JSON.parse(fs.readFileSync(leadsPath, 'utf8') || '[]');
    leads.push({ name, phone, source: source || 'broadcast-landing', createdAt: new Date().toISOString() });
    fs.writeFileSync(leadsPath, JSON.stringify(leads, null, 2), 'utf8');
    console.log('[LEAD]', name, phone, source);
  } catch(e) {
    console.error('[LEAD ERROR]', e.message);
  }
  res.json({ ok: true });
});

app.get('/spasibo', (req, res) => res.sendFile(path.join(siteRoot, 'spasibo.html')));

// Persistent uploads (videos, large files) from /data/uploads
const UPLOADS_DIR = (process.env.DATA_DIR || '/data') + '/uploads';
try { require('fs').mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e) {}
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', fallthrough: true }));

// [html-no-cache] HTML always revalidate so version-stamp changes propagate immediately
app.use(express.static(siteRoot, {
  maxAge: '5m',
  extensions: ['html'],
  index: false,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path === '/health') return next();
  return renderLandingPage(req, res);
});

const server = httpServer.listen(config.port, () => {
  console.log(`[http] listening on :${config.port}`);
});

async function start() {
  // When trendex-bot deployment owns the long-poller (per Trendex k8s split,
  // commit 4be2fcb), cabinet should skip bot.start() to avoid 409 Conflict
  // with the bot deployment polling the same token. We still need cron jobs
  // + backup + monitoring to run, so they fire regardless.
  if (process.env.CABINET_BOT_POLL_DISABLED === '1') {
    console.log('[bot] CABINET_BOT_POLL_DISABLED=1 — skipping bot.start; cron + backup still running');
    startCron();
    backupManager.start();
    monitoring.start();
    return;
  }
  await bot.api.deleteWebhook({ drop_pending_updates: false }).catch((error) => {
    console.warn('[delete_webhook_failed]', error && error.message ? error.message : error);
  });
  const me = await bot.api.getMe();
  console.log(`[bot] starting as @${me.username || 'unknown'} (${me.id})`);
  await bot.start({
    allowed_updates: ['message', 'edited_message', 'callback_query', 'inline_query',
                      'chat_member', 'my_chat_member', 'channel_post'],
    onStart: (info) => {
      console.log(`[bot] long polling started for @${info.username || me.username || 'unknown'}`);
      startCron();
      backupManager.start();
      monitoring.start();
    },
  });
}

function shutdown(signal) {
  console.log(`[shutdown] ${signal}`);
  try {
    bot.stop();
  } catch {}
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

start().catch((error) => {
  // Bot startup failures (e.g. 409 Conflict — another instance has the same
  // token via long polling) must NOT kill the web server. We log and stay up;
  // bot-dependent crons will no-op until token is freed and pod restarts.
  console.error('[bot_startup_failed_nonfatal]', error && error.stack ? error.stack : error);
});

// Trendex: poll cert-manager status for bio custom domains every 60s.
function _bioDomainSslCron() {
  try {
    const k8s = require('./k8s-client');
    if (!k8s.isAvailable()) return;
    const db = require('./planner/db/database').getDb();
    const rows = db.prepare("SELECT id, domain FROM bio_custom_domains WHERE dns_status = 'verified' AND ssl_status IN ('provisioning','pending_manual','pending')").all();
    rows.forEach(async (r) => {
      try {
        const st = await k8s.getCertificateStatus(r.domain);
        if (st.ready) {
          db.prepare("UPDATE bio_custom_domains SET ssl_status = 'active', error_message = NULL WHERE id = ?").run(r.id);
          console.log('[bio-ssl-cron] activated', r.domain);
        } else if (st.message) {
          db.prepare("UPDATE bio_custom_domains SET error_message = ? WHERE id = ?").run(st.message.slice(0, 200), r.id);
        }
      } catch (e) { /* ignore single-domain errors */ }
    });
  } catch (e) { /* ignore */ }
}
setInterval(_bioDomainSslCron, 60 * 1000);
setTimeout(_bioDomainSslCron, 30 * 1000);  // first pass 30s after boot
