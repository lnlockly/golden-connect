/**
 * Shortener Redirect - Public endpoint for short link redirects
 * GET /:code -> 302 redirect to destination_url with click tracking
 * POST /:code/verify -> Password verification for protected links
 *
 * Features:
 *   - Password-protected links (SHA-256 + timingSafeEqual)
 *   - Smart redirects (device/browser/os/country/language rules + rotation)
 *   - Language tracking from Accept-Language header
 *   - UTM parameter auto-append
 *   - Rate-limited click tracking
 */
const express = require('express');
const geoip = require('geoip-lite');

// ── Rotation helper ─────────────────────────────────────────────
function pickRotatedUrl(link, getDb) {
  let urls = [];
  try { urls = JSON.parse(link.destination_urls || '[]'); } catch (_) { urls = []; }
  urls = (Array.isArray(urls) ? urls : []).map(u => String(u || '').trim()).filter(Boolean);
  if (urls.length < 2) return link.destination_url;
  const idx = (Number(link.rotation_index) || 0) % urls.length;
  const next = (idx + 1) % urls.length;
  try { getDb().prepare('UPDATE short_links SET rotation_index=? WHERE id=?').run(next, link.id); } catch (_) {}
  return urls[idx] || link.destination_url;
}

// ── Splash page renderer ────────────────────────────────────────
function renderSplashPage(destination, link) {
  const safeDest = String(destination).replace(/"/g, '&quot;');
  const title = String((link && link.title) || 'Переход').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  let host = '';
  try { host = new URL(destination).hostname.replace(/^www\./, ''); } catch (_) {}
  return `<!doctype html><html lang="ru"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title}…</title>
<meta http-equiv="refresh" content="0;url=${safeDest}">
<link rel="canonical" href="${safeDest}">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,sans-serif;background:radial-gradient(ellipse at top,#1a1a2e 0%,#0a0a1a 50%,#000 100%);color:#e2e8f0;overflow:hidden}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
.brand{font-size:14px;font-weight:600;color:#a5b4fc;letter-spacing:.15em;text-transform:uppercase;opacity:.7;margin-bottom:32px}
.spinner{width:64px;height:64px;border:3px solid rgba(165,180,252,.15);border-top-color:#6366f1;border-radius:50%;animation:spin .9s linear infinite;margin-bottom:28px;position:relative}
.spinner::after{content:'';position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle,rgba(99,102,241,.25),transparent 70%)}
@keyframes spin{to{transform:rotate(360deg)}}
.title{font-size:22px;font-weight:700;background:linear-gradient(135deg,#a5b4fc,#22d3ee);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px}
.host{font-size:14px;color:#94a3b8;margin-bottom:24px;font-family:ui-monospace,Menlo,monospace}
.host b{color:#22d3ee;font-weight:600}
.bar{width:240px;max-width:80%;height:3px;background:rgba(255,255,255,.06);border-radius:99px;overflow:hidden;position:relative}
.bar::after{content:'';position:absolute;left:-30%;top:0;bottom:0;width:30%;background:linear-gradient(90deg,transparent,#6366f1,transparent);animation:slide 1.4s linear infinite}
@keyframes slide{to{left:100%}}
.hint{position:absolute;bottom:24px;left:0;right:0;font-size:12px;color:#475569;text-align:center}
.hint a{color:#94a3b8;text-decoration:none}
.hint a:hover{color:#a5b4fc}
@media(max-width:480px){.title{font-size:18px}.spinner{width:52px;height:52px}}
</style>
</head>
<body>
<div class="wrap">
<div class="brand">⚡ T2GIFT</div>
<div class="spinner"></div>
<div class="title">Переходим на сайт…</div>
<div class="host">→ <b>${host}</b></div>
<div class="bar"></div>
</div>
<div class="hint">Если страница не открылась автоматически — <a href="${safeDest}">нажмите здесь</a></div>
<script>
// Immediate JS redirect — fastest path
(function(){
  var d="${safeDest}";
  // Use replace so back button skips splash
  setTimeout(function(){ try{ window.location.replace(d); }catch(e){ window.location.href = d; } }, 30);
})();
</script>
</body></html>`;
}

const crypto = require('crypto');
const { getDb } = require('../database');
const router = express.Router();

// ---------------------------------------------------------------------------
// Rate limiter (same pattern as abtest.js)
// ---------------------------------------------------------------------------
const _rateLimiter = new Map();
const RATE_LIMIT = 300;
const RATE_WINDOW = 5 * 60 * 1000;

function checkRate(ip) {
  const now = Date.now();
  const entry = _rateLimiter.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    _rateLimiter.set(ip, { start: now, count: 1 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of _rateLimiter) {
    if (now - entry.start > RATE_WINDOW) _rateLimiter.delete(ip);
  }
}, 10 * 60 * 1000);

// ---------------------------------------------------------------------------
// User-Agent parser
// ---------------------------------------------------------------------------
function parseUA(ua) {
  if (!ua) return { device_type: 'Desktop', browser: 'Other', os: 'Other' };
  const device_type = /tablet|ipad/i.test(ua) ? 'Tablet'
    : /mobile|android.*mobile|iphone|ipod/i.test(ua) ? 'Mobile' : 'Desktop';
  const browser = /edg/i.test(ua) ? 'Edge' : /opr|opera/i.test(ua) ? 'Opera'
    : /firefox/i.test(ua) ? 'Firefox' : /safari/i.test(ua) && !/chrome/i.test(ua) ? 'Safari'
    : /chrome|chromium|crios/i.test(ua) ? 'Chrome' : 'Other';
  const os = /windows/i.test(ua) ? 'Windows' : /macintosh|mac os/i.test(ua) ? 'macOS'
    : /iphone|ipad|ipod/i.test(ua) ? 'iOS' : /android/i.test(ua) ? 'Android'
    : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device_type, browser, os };
}

// ---------------------------------------------------------------------------
// Accept-Language parser — returns primary language code (e.g. 'en', 'ru')
// ---------------------------------------------------------------------------
function parsePrimaryLanguage(header) {
  if (!header) return null;
  // Accept-Language: en-US,en;q=0.9,ru;q=0.8  ->  'en'
  const first = header.split(',')[0]; // 'en-US'
  if (!first) return null;
  const lang = first.split(';')[0].trim().split('-')[0].toLowerCase();
  return lang || null;
}

// ---------------------------------------------------------------------------
// UTM append — merges link-level UTM params into a destination URL
// ---------------------------------------------------------------------------
function appendUTM(destinationUrl, link) {
  const utmFields = [
    { column: 'utm_source',   param: 'utm_source' },
    { column: 'utm_medium',   param: 'utm_medium' },
    { column: 'utm_campaign', param: 'utm_campaign' },
    { column: 'utm_term',     param: 'utm_term' },
    { column: 'utm_content',  param: 'utm_content' },
  ];

  let hasUtm = false;
  for (const f of utmFields) {
    if (link[f.column]) { hasUtm = true; break; }
  }
  if (!hasUtm) return destinationUrl;

  try {
    const url = new URL(destinationUrl);
    for (const f of utmFields) {
      if (link[f.column] && !url.searchParams.has(f.param)) {
        url.searchParams.set(f.param, link[f.column]);
      }
    }
    return url.toString();
  } catch {
    // If URL parsing fails, fall back to manual query string append
    const sep = destinationUrl.includes('?') ? '&' : '?';
    const parts = [];
    for (const f of utmFields) {
      if (link[f.column]) {
        parts.push(`${f.param}=${encodeURIComponent(link[f.column])}`);
      }
    }
    return parts.length ? destinationUrl + sep + parts.join('&') : destinationUrl;
  }
}

// ---------------------------------------------------------------------------
// Smart redirect rules — evaluate short_link_rules for a given link
// Returns an override destination URL or null (use default)
// ---------------------------------------------------------------------------
function evaluateRules(db, link, parsedUA, language) {
  let rules;
  try {
    rules = db.prepare(
      'SELECT * FROM short_link_rules WHERE link_id = ? ORDER BY priority DESC'
    ).all(link.id);
  } catch {
    // Table may not exist yet — skip silently
    return null;
  }

  if (!rules || rules.length === 0) return null;

  for (const rule of rules) {
    const ruleValue = (rule.rule_value || '').trim();
    const ruleType = (rule.rule_type || '').toLowerCase();

    switch (ruleType) {
      case 'device': {
        if (ruleValue.toLowerCase() === parsedUA.device_type.toLowerCase()) {
          return rule.destination_url;
        }
        break;
      }
      case 'browser': {
        if (ruleValue.toLowerCase() === parsedUA.browser.toLowerCase()) {
          return rule.destination_url;
        }
        break;
      }
      case 'os': {
        if (ruleValue.toLowerCase() === parsedUA.os.toLowerCase()) {
          return rule.destination_url;
        }
        break;
      }
      case 'country': {
        // Country is typically set via a header by a reverse proxy / CDN
        // Common headers: cf-ipcountry (Cloudflare), x-country, geoip-country
        // We don't have geo-IP here, so this is a placeholder match
        // The request may carry it from upstream
        break;
      }
      case 'language': {
        if (language && ruleValue.toLowerCase() === language.toLowerCase()) {
          return rule.destination_url;
        }
        break;
      }
      case 'rotation': {
        // rule_value is a JSON array: [{url, weight}, ...]
        try {
          const entries = JSON.parse(ruleValue);
          if (!Array.isArray(entries) || entries.length === 0) break;
          const totalWeight = entries.reduce((sum, e) => sum + (Number(e.weight) || 1), 0);
          let rand = Math.random() * totalWeight;
          for (const entry of entries) {
            rand -= (Number(entry.weight) || 1);
            if (rand <= 0) return entry.url;
          }
          return entries[entries.length - 1].url;
        } catch {
          break;
        }
      }
      default:
        break;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Styled HTML helpers
// ---------------------------------------------------------------------------
function errorPage(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - Arsenal Profi</title><style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:40px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}.accent{height:4px;border-radius:2px;background:linear-gradient(90deg,#7c3aed,#3b82f6);margin-bottom:24px}
h1{font-size:20px;color:#1f2937;margin-bottom:12px}p{color:#6b7280;margin-bottom:24px;line-height:1.5}a{color:#7c3aed;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style></head>
<body><div class="card"><div class="accent"></div><h1>${title}</h1><p>${message}</p><a href="https://app.arsenalprofi.com">&larr; Arsenal Profi</a></div></body></html>`;
}

function passwordPage(code, errorMsg) {
  const errorHtml = errorMsg
    ? `<div class="error">${errorMsg}</div>`
    : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Password Required - Arsenal Profi</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5}
.card{background:#fff;border-radius:12px;padding:40px;max-width:420px;width:90vw;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.accent{height:4px;border-radius:2px;background:linear-gradient(90deg,#7c3aed,#3b82f6);margin-bottom:24px}
h1{font-size:20px;color:#1f2937;margin-bottom:8px}
p{color:#6b7280;margin-bottom:20px;line-height:1.5;font-size:14px}
.lock-icon{font-size:36px;margin-bottom:16px;display:block}
form{display:flex;flex-direction:column;gap:12px}
input[type="password"]{padding:10px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;transition:border-color .2s}
input[type="password"]:focus{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.12)}
button{padding:10px 14px;border:none;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff;font-size:15px;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.9}
.error{background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:13px;margin-bottom:4px}
.back{margin-top:16px;display:inline-block;color:#7c3aed;text-decoration:none;font-weight:500;font-size:13px}
.back:hover{text-decoration:underline}
</style></head>
<body><div class="card">
  <div class="accent"></div>
  <span class="lock-icon">&#128274;</span>
  <h1>Password Required</h1>
  <p>This link is protected. Enter the password to continue.</p>
  ${errorHtml}
  <form method="POST" action="/${code}/verify">
    <input type="password" name="password" placeholder="Enter password" required autofocus autocomplete="off">
    <button type="submit">Unlock &amp; Continue</button>
  </form>
  <a class="back" href="https://app.arsenalprofi.com">&larr; Arsenal Profi</a>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// Bot / Crawler detection for OG meta tags
// ---------------------------------------------------------------------------
const BOT_UA_REGEX = /facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discord|slackbot|pinterest|googlebot|bingbot|yandexbot|applebot|skypeuripreview|vkshare|embedly|quora|outbrain|w3c_validator/i;

function isBotRequest(ua) {
  return BOT_UA_REGEX.test(ua || '');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildShortRequestUrl(req, code) {
  const host = (req.get('x-forwarded-host') || req.get('host') || 'app.arsenalprofi.com').replace(/\/+$/, '');
  const forwardedProto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const protocol = forwardedProto || (req.secure ? 'https' : 'http');
  return `${protocol}://${host}/s/${encodeURIComponent(String(code || ''))}`;
}

function hasPreviewFlag(req) {
  const previewRaw = req.query.preview ?? req.query.share ?? '';
  const preview = String(previewRaw || '').trim().toLowerCase();
  return preview === '1' || preview === 'true' || preview === 'yes' || preview === 'on';
}

function ogMetaPage(link, shortUrl, destination) {
  const title = escapeHtml(link.og_title || link.title || link.destination_url || '');
  const desc = escapeHtml(link.og_description || '');
  const image = escapeHtml(link.og_image || '');
  const safeShortUrl = escapeHtml(shortUrl);
  const safeDestination = escapeHtml(destination);

  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
${image ? `<meta property="og:image" content="${image}">` : ''}
${image ? `<meta property="og:image:secure_url" content="${image}">` : ''}
<meta property="og:url" content="${safeShortUrl}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Arsenal Profi">
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
${image ? `<meta name="twitter:image" content="${image}">` : ''}
<link rel="canonical" href="${safeShortUrl}">
<meta http-equiv="refresh" content="0;url=${safeDestination}">
<title>${title}</title>
</head><body><p>Redirecting to <a href="${safeDestination}">${title}</a>...</p></body></html>`;
}

// ---------------------------------------------------------------------------
// Core redirect logic (shared by GET and password-verify POST)
// ---------------------------------------------------------------------------
function performRedirect(req, res, link) {
  const db = getDb();
  const ip = req.ip;
  const ua = req.get('user-agent') || '';
  const { device_type, browser, os } = parseUA(ua);
  const language = parsePrimaryLanguage(req.get('accept-language'));
  const referer = req.get('referer') || req.get('referrer') || null;
  const qrId = req.query.qr ? parseInt(req.query.qr, 10) || null : null;

  // GeoIP lookup
  let country = null, city = null;
  try {
    const cleanIp = String(ip || '').replace(/^::ffff:/, '');
    if (cleanIp && cleanIp !== '127.0.0.1' && cleanIp !== '::1') {
      const geo = geoip.lookup(cleanIp);
      if (geo) {
        country = geo.country || null;
        city = geo.city || null;
      }
    }
  } catch (_) { /* ignore geo errors */ }

  // --- Click tracking ---
  const shouldLog = checkRate(ip);
  if (shouldLog) {
    try {
      db.prepare(
        `INSERT INTO short_link_clicks (link_id, qr_id, ip_address, country, city, referer, user_agent, device_type, browser, os, language, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(link.id, qrId, ip, country, city, referer, ua, device_type, browser, os, language);
    } catch {
      db.prepare(
        `INSERT INTO short_link_clicks (link_id, qr_id, ip_address, country, city, referer, user_agent, device_type, browser, os, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(link.id, qrId, ip, country, city, referer, ua, device_type, browser, os);
    }

    db.prepare('UPDATE short_links SET total_clicks = total_clicks + 1 WHERE id = ?').run(link.id);
    if (qrId) {
      db.prepare('UPDATE short_link_qrcodes SET total_clicks = total_clicks + 1 WHERE id = ?').run(qrId);
    }
  }

  // --- Smart redirect rules ---
  let destination = pickRotatedUrl(link, getDb);
  const ruleOverride = evaluateRules(db, link, { device_type, browser, os }, language);
  if (ruleOverride) {
    destination = ruleOverride;
  }

  // --- UTM append ---
  destination = appendUTM(destination, link);

  // --- OG meta page for bots and explicit share preview ---
  const shouldServeOg = (isBotRequest(ua) || hasPreviewFlag(req))
    && (link.og_title || link.og_description || link.og_image);
  if (shouldServeOg) {
    const shortRequestUrl = buildShortRequestUrl(req, link.code);
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).send(ogMetaPage(link, shortRequestUrl, destination));
  }

  // Splash page (preloader for slow destinations) — opt-in via splash_enabled
  // Skip if user explicitly requests direct redirect via ?direct=1
  const wantDirect = String(req.query.direct || '') === '1';
  if (link.splash_enabled && !wantDirect) {
    res.set('Cache-Control', 'no-store');
    return res.status(200).type('html').send(renderSplashPage(destination, link));
  }

  res.redirect(302, destination);
}

// ---------------------------------------------------------------------------
// GET /:code - Redirect (or show password page)
// ---------------------------------------------------------------------------
router.get('/:code', (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE code = ? COLLATE NOCASE').get(req.params.code);

    if (!link) {
      return res.status(404).send(
        errorPage('Link not found', 'The short link you are looking for does not exist or has been removed.')
      );
    }
    if (!link.is_active) {
      return res.status(410).send(
        errorPage('Link deactivated', 'This link has been deactivated by its owner.')
      );
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).send(
        errorPage('Link expired', 'This link has expired and is no longer available.')
      );
    }

    // --- Password protection ---
    if (link.password_hash) {
      return res.status(200).send(passwordPage(req.params.code));
    }

    performRedirect(req, res, link);
  } catch (error) {
    console.error('Shortener redirect error:', error);
    res.redirect(302, 'https://app.arsenalprofi.com');
  }
});

// ---------------------------------------------------------------------------
// POST /:code/verify - Verify password for protected links
// ---------------------------------------------------------------------------
router.post('/:code/verify', express.urlencoded({ extended: false }), (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE code = ? COLLATE NOCASE').get(req.params.code);

    if (!link) {
      return res.status(404).send(
        errorPage('Link not found', 'The short link you are looking for does not exist or has been removed.')
      );
    }
    if (!link.is_active) {
      return res.status(410).send(
        errorPage('Link deactivated', 'This link has been deactivated by its owner.')
      );
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).send(
        errorPage('Link expired', 'This link has expired and is no longer available.')
      );
    }
    if (!link.password_hash) {
      // No password set — just redirect
      return performRedirect(req, res, link);
    }

    const password = req.body && req.body.password ? req.body.password : '';
    if (!password) {
      return res.status(200).send(passwordPage(req.params.code, 'Please enter a password.'));
    }

    // Hash the submitted password and compare with stored hash using timingSafeEqual
    const submittedHash = crypto.createHash('sha256').update(password).digest('hex');
    const storedHash = link.password_hash;

    // timingSafeEqual requires buffers of equal length
    const submittedBuf = Buffer.from(submittedHash, 'utf8');
    const storedBuf = Buffer.from(storedHash, 'utf8');

    let isMatch = false;
    if (submittedBuf.length === storedBuf.length) {
      isMatch = crypto.timingSafeEqual(submittedBuf, storedBuf);
    }

    if (!isMatch) {
      return res.status(200).send(passwordPage(req.params.code, 'Incorrect password. Please try again.'));
    }

    // Password correct — proceed with redirect
    performRedirect(req, res, link);
  } catch (error) {
    console.error('Password verify error:', error);
    res.redirect(302, 'https://app.arsenalprofi.com');
  }
});

module.exports = router;
