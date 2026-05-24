/**
 * URL Shortener API Routes v3.0
 * Campaigns, Links, QR Codes, Statistics, Tags, Rules, Bulk, Export, Compare
 * + URL Preview, OG Meta Tags, Pin/Star, Bio Page CRUD
 */
const express = require('express');
const crypto = require('crypto');

// [bio-sanitize] strip dangerous HTML tags/attrs from user-entered bio text
function _sanitizeText(input) {
  if (input == null) return null;
  let s = String(input);
  // Drop <script> and <style> blocks completely
  s = s.replace(/<\/?(?:script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, '');
  // Strip on*= event handlers (onclick=, onerror=, etc.)
  s = s.replace(/\s+on[a-z]+\s*=\s*\"[^\"]*\"/gi, '');
  s = s.replace(/\s+on[a-z]+\s*=\s*\'[^\']*\'/gi, '');
  // Strip javascript:// URLs
  s = s.replace(/javascript:/gi, '#');
  return s.slice(0, 5000);
}
const https = require('https');
const http = require('http');
const { getDb } = require('../database');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// URL Preview cache (in-memory, 1 hour TTL)
// ---------------------------------------------------------------------------
const _previewCache = new Map();
const PREVIEW_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const _previewRateLimit = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _previewCache) {
    if (now - v.ts > PREVIEW_CACHE_TTL) _previewCache.delete(k);
  }
  for (const [k, v] of _previewRateLimit) {
    if (now - v.start > 60000) _previewRateLimit.delete(k);
  }
}, 5 * 60 * 1000);

function generateCode(len = 6) {
  return crypto.randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, len);
}
function validateUrl(url) { return typeof url === 'string' && /^https?:\/\/.{3,2048}$/i.test(url); }
function validateAlias(alias) { return typeof alias === 'string' && /^[a-zA-Z0-9_-]{3,30}$/.test(alias); }

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// =====================================================================
// URL PREVIEW (fetch title, description, favicon from URL)
// =====================================================================

function fetchUrlContent(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout, headers: { 'User-Agent': 'Golden Connect-LinkPreview/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow one redirect
        return fetchUrlContent(res.headers.location, timeout).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; if (data.length > 200000) { res.destroy(); resolve(data); } });
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function extractMeta(html) {
  const result = { title: null, description: null, image: null, favicon: null };
  // OG title
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogTitle) result.title = ogTitle[1].slice(0, 200);
  // Fallback to <title>
  if (!result.title) {
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleTag) result.title = titleTag[1].trim().slice(0, 200);
  }
  // OG description
  const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)
    || html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  if (ogDesc) result.description = ogDesc[1].slice(0, 500);
  // OG image
  const ogImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImg) result.image = ogImg[1].slice(0, 1000);
  // Favicon
  const fav = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
  if (fav) result.favicon = fav[1].slice(0, 500);
  return result;
}

router.get('/preview', authRequired, async (req, res) => {
  try {
    const url = req.query.url;
    if (!url || !validateUrl(url)) return res.status(400).json({ error: 'Valid URL required' });

    // Rate limit: 10 req/min per user
    const userId = req.user.id;
    const now = Date.now();
    const rl = _previewRateLimit.get(userId);
    if (rl && now - rl.start < 60000 && rl.count >= 10) {
      return res.status(429).json({ error: 'Preview rate limit exceeded (10/min)' });
    }
    if (!rl || now - rl.start >= 60000) {
      _previewRateLimit.set(userId, { start: now, count: 1 });
    } else {
      rl.count++;
    }

    // Check cache
    if (_previewCache.has(url)) {
      return res.json({ success: true, ..._previewCache.get(url).data });
    }

    const html = await fetchUrlContent(url);
    const meta = extractMeta(html);

    // Resolve relative favicon
    if (meta.favicon && !meta.favicon.startsWith('http')) {
      try {
        const base = new URL(url);
        meta.favicon = new URL(meta.favicon, base.origin).toString();
      } catch {}
    }

    _previewCache.set(url, { ts: now, data: meta });
    res.json({ success: true, ...meta });
  } catch (e) {
    res.json({ success: true, title: null, description: null, image: null, favicon: null });
  }
});

// =====================================================================
// CAMPAIGNS
// =====================================================================

router.post('/campaigns', authRequired, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Campaign name is required' });
    if (name.trim().length > 50) return res.status(400).json({ error: 'Name too long (max 50)' });
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#667eea';
    const db = getDb();
    const result = db.prepare('INSERT INTO shortener_campaigns (user_id, name, description, color) VALUES (?, ?, ?, ?)').run(
      req.user.id, name.trim(), (description || '').trim().slice(0, 200), safeColor
    );
    res.json({ success: true, campaign: { id: result.lastInsertRowid, name: name.trim(), description: (description || '').trim(), color: safeColor } });
  } catch (e) { console.error('Campaign create:', e); res.status(500).json({ error: 'Failed to create campaign' }); }
});

router.get('/campaigns', authRequired, (req, res) => {
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*, COUNT(l.id) as link_count, COALESCE(SUM(l.total_clicks), 0) as total_clicks
      FROM shortener_campaigns c LEFT JOIN short_links l ON l.campaign_id = c.id
      WHERE c.user_id = ? GROUP BY c.id ORDER BY c.created_at DESC
    `).all(req.user.id);
    res.json({ success: true, campaigns });
  } catch (e) { console.error('Campaign list:', e); res.status(500).json({ error: 'Failed to list campaigns' }); }
});

router.put('/campaigns/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const camp = db.prepare('SELECT * FROM shortener_campaigns WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!camp) return res.status(404).json({ error: 'Campaign not found' });
    const { name, description, color } = req.body;
    if (name !== undefined && (!name || !name.trim())) return res.status(400).json({ error: 'Name is required' });
    const safeColor = color && /^#[0-9a-f]{6}$/i.test(color) ? color : camp.color;
    db.prepare('UPDATE shortener_campaigns SET name = ?, description = ?, color = ? WHERE id = ?').run(
      (name || camp.name).trim().slice(0, 50), (description !== undefined ? description : camp.description || '').trim().slice(0, 200), safeColor, camp.id
    );
    res.json({ success: true });
  } catch (e) { console.error('Campaign update:', e); res.status(500).json({ error: 'Failed to update campaign' }); }
});

router.delete('/campaigns/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('DELETE FROM shortener_campaigns WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ success: true });
  } catch (e) { console.error('Campaign delete:', e); res.status(500).json({ error: 'Failed to delete campaign' }); }
});

// =====================================================================
// LINKS (with UTM support)
// =====================================================================

router.post('/links', authRequired, async (req, res) => {
  try {
    const { destinationUrl, title, campaignId, customAlias, domain, utm_source, utm_medium, utm_campaign, utm_term, utm_content, og_title, og_description, og_image } = req.body;
    const _chkSh = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'shortener.create');
    if (!_chkSh.allowed) return res.status(429).json({ error: 'Daily link creation limit reached', code: 'LIMIT_REACHED', used: _chkSh.used, limit: _chkSh.limit, plan: _chkSh.plan, upgrade_url: '/pricing' });
    const db = getDb();

    if (campaignId) {
      const camp = db.prepare('SELECT id FROM shortener_campaigns WHERE id = ? AND user_id = ?').get(campaignId, req.user.id);
      if (!camp) return res.status(400).json({ error: 'Campaign not found' });
    }

    let code;
    if (customAlias) {
      if (!validateAlias(customAlias)) return res.status(400).json({ error: 'Alias: 3-30 chars, letters/numbers/_/- only' });
      const exists = db.prepare('SELECT id FROM short_links WHERE code = ?').get(customAlias);
      if (exists) return res.status(409).json({ error: 'This alias is already taken' });
      code = customAlias;
    } else {
      for (let i = 0; i < 5; i++) {
        code = generateCode();
        if (!db.prepare('SELECT id FROM short_links WHERE code = ?').get(code)) break;
        if (i === 4) return res.status(500).json({ error: 'Failed to generate unique code' });
      }
    }

    const count = db.prepare('SELECT COUNT(*) as cnt FROM short_links WHERE user_id = ?').get(req.user.id);
    if (count.cnt >= 10000) return res.status(400).json({ error: "Maximum 10000 links per account" });

    const safeUtm = (v) => v ? String(v).trim().slice(0, 200) || null : null;
    const safeOg = (v, max = 500) => v ? String(v).trim().slice(0, max) || null : null;

    const safeDomain = (domain && typeof domain === 'string' && domain.length < 50) ? domain.trim() : 't2gift.com';
    // Optional rotation URLs from body
    let postRotUrls = null;
    if (Array.isArray(req.body.destinationUrls)) {
      const cleaned = req.body.destinationUrls.map(u => String(u||'').trim()).filter(Boolean);
      for (const u of cleaned) { if (!validateUrl(u)) return res.status(400).json({ error: 'Invalid rotation URL: ' + u }); }
      postRotUrls = cleaned.length >= 2 ? JSON.stringify(cleaned) : null;
    }
    const postSplash = req.body.splashEnabled !== undefined ? (req.body.splashEnabled ? 1 : 0) : 1; // default ON
    const result = db.prepare(`INSERT INTO short_links (user_id, campaign_id, code, destination_url, destination_urls, splash_enabled, title, domain, utm_source, utm_medium, utm_campaign, utm_term, utm_content, og_title, og_description, og_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, campaignId || null, code, destinationUrl.trim(), postRotUrls, postSplash, (title || '').trim().slice(0, 100) || null, safeDomain,
      safeUtm(utm_source), safeUtm(utm_medium), safeUtm(utm_campaign), safeUtm(utm_term), safeUtm(utm_content),
      safeOg(og_title, 200), safeOg(og_description), safeOg(og_image, 1000)
    );
    require('../helpers/usage-limits').trackUsage(req.user ? req.user.id : null, 'shortener.create');
    res.json({
      success: true, link: {
        id: result.lastInsertRowid, code, destination_url: destinationUrl.trim(),
        title: (title || '').trim() || null, campaign_id: campaignId || null,
        is_active: 1, total_clicks: 0, is_pinned: 0, is_bio_visible: 0, domain: safeDomain,
        utm_source: safeUtm(utm_source), utm_medium: safeUtm(utm_medium),
        utm_campaign: safeUtm(utm_campaign), utm_term: safeUtm(utm_term), utm_content: safeUtm(utm_content),
        og_title: safeOg(og_title, 200), og_description: safeOg(og_description), og_image: safeOg(og_image, 1000)
      }
    });
  } catch (e) { console.error('Link create:', e); res.status(500).json({ error: 'Failed to create link' }); }
});

router.get('/links', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { campaign_id, search, sort, limit, offset, tag } = req.query;

    let sql = `SELECT l.*,
      (SELECT GROUP_CONCAT(t.tag, ',') FROM short_link_tags t WHERE t.link_id = l.id) as tags_csv
      FROM short_links l WHERE l.user_id = ?`;
    const params = [req.user.id];

    if (campaign_id) { sql += ' AND l.campaign_id = ?'; params.push(campaign_id); }
    if (search) {
      const trimmed = String(search).slice(0, 100); // prevent DoS via long LIKE pattern
      sql += ' AND (l.code LIKE ? OR l.title LIKE ? OR l.destination_url LIKE ?)';
      const s = `%${trimmed}%`;
      params.push(s, s, s);
    }
    if (tag) {
      sql += ' AND EXISTS (SELECT 1 FROM short_link_tags t WHERE t.link_id = l.id AND t.tag = ?)';
      params.push(tag);
    }

    if (sort === 'oldest') sql += ' ORDER BY l.is_pinned DESC, l.created_at ASC';
    else if (sort === 'clicks') sql += ' ORDER BY l.is_pinned DESC, l.total_clicks DESC';
    else sql += ' ORDER BY l.is_pinned DESC, l.created_at DESC';

    sql += ' LIMIT ? OFFSET ?';
    params.push(Math.min(+(limit || 200), 200), +(offset || 0));

    const links = db.prepare(sql).all(...params).map(link => {
      link.tags = link.tags_csv ? link.tags_csv.split(',') : [];
      delete link.tags_csv;
      return link;
    });

    res.json({ success: true, links });
  } catch (e) { console.error('Link list:', e); res.status(500).json({ error: 'Failed to list links' }); }
});

router.get('/links/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Include tags
    const tags = db.prepare('SELECT tag FROM short_link_tags WHERE link_id = ?').all(link.id).map(r => r.tag);
    link.tags = tags;

    res.json({ success: true, link });
  } catch (e) { res.status(500).json({ error: 'Failed to get link' }); }
});

router.put('/links/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const { destinationUrl, destinationUrls, splashEnabled, title, campaignId, isActive, expiresAt, utm_source, utm_medium, utm_campaign, utm_term, utm_content, og_title, og_description, og_image, is_bio_visible } = req.body;
    if (destinationUrl !== undefined && !validateUrl(destinationUrl)) return res.status(400).json({ error: 'Valid URL required' });
    // Validate rotation URLs
    let rotUrls = null;
    if (destinationUrls !== undefined) {
      if (Array.isArray(destinationUrls)) {
        const cleaned = destinationUrls.map(u => String(u||'').trim()).filter(Boolean);
        for (const u of cleaned) { if (!validateUrl(u)) return res.status(400).json({ error: 'Invalid URL in rotation list: ' + u }); }
        rotUrls = cleaned.length >= 2 ? JSON.stringify(cleaned) : null;
      } else if (destinationUrls === null) {
        rotUrls = null;
      }
    }
    if (campaignId !== undefined && campaignId !== null) {
      const camp = db.prepare('SELECT id FROM shortener_campaigns WHERE id = ? AND user_id = ?').get(campaignId, req.user.id);
      if (!camp) return res.status(400).json({ error: 'Campaign not found' });
    }

    const safeUtm = (v, fallback) => v !== undefined ? (v ? String(v).trim().slice(0, 200) || null : null) : fallback;
    const safeOgVal = (v, fallback, max = 500) => v !== undefined ? (v ? String(v).trim().slice(0, max) || null : null) : fallback;

    db.prepare(`UPDATE short_links SET destination_url=?, destination_urls=?, splash_enabled=?, title=?, campaign_id=?, is_active=?, expires_at=?,
      utm_source=?, utm_medium=?, utm_campaign=?, utm_term=?, utm_content=?,
      og_title=?, og_description=?, og_image=?, is_bio_visible=?,
      updated_at=datetime('now') WHERE id=?`).run(
      (destinationUrl || link.destination_url).trim(),
      destinationUrls !== undefined ? rotUrls : (link.destination_urls || null),
      splashEnabled !== undefined ? (splashEnabled ? 1 : 0) : (link.splash_enabled || 0),
      title !== undefined ? (title || '').trim().slice(0, 100) || null : link.title,
      campaignId !== undefined ? (campaignId || null) : link.campaign_id,
      isActive !== undefined ? (isActive ? 1 : 0) : link.is_active,
      expiresAt !== undefined ? (expiresAt || null) : link.expires_at,
      safeUtm(utm_source, link.utm_source),
      safeUtm(utm_medium, link.utm_medium),
      safeUtm(utm_campaign, link.utm_campaign),
      safeUtm(utm_term, link.utm_term),
      safeUtm(utm_content, link.utm_content),
      safeOgVal(og_title, link.og_title, 200),
      safeOgVal(og_description, link.og_description),
      safeOgVal(og_image, link.og_image, 1000),
      is_bio_visible !== undefined ? (is_bio_visible ? 1 : 0) : (link.is_bio_visible || 0),
      link.id
    );
    res.json({ success: true });
  } catch (e) { console.error('Link update:', e); res.status(500).json({ error: 'Failed to update link' }); }
});

router.delete('/links/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    // Protect promo links from deletion
    const link = db.prepare('SELECT id, utm_source FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    if (link.utm_source === 'promo') return res.status(403).json({ error: 'Promo links cannot be deleted. These are system-generated referral links.' });
    const result = db.prepare('DELETE FROM short_links WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete link' }); }
});

// =====================================================================
// STATISTICS (basic)
// =====================================================================

router.get('/links/:id/stats', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const period = req.query.period || 'all';
    let df = '';
    if (period === 'day') df = "AND c.created_at >= datetime('now', '-1 day')";
    else if (period === 'week') df = "AND c.created_at >= datetime('now', '-7 days')";
    else if (period === 'month') df = "AND c.created_at >= datetime('now', '-30 days')";

    // Batch all stats queries in a single transaction for performance
    const getStats = db.transaction((linkId) => {
      const clicksByDate = db.prepare(`SELECT date(created_at) as date, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY date(created_at) ORDER BY date ASC`).all(linkId);
      const totals = db.prepare(`SELECT COUNT(*) as total, COUNT(DISTINCT ip_address) as unique_ips FROM short_link_clicks c WHERE c.link_id = ? ${df}`).get(linkId);
      const today = db.prepare("SELECT COUNT(*) as cnt FROM short_link_clicks WHERE link_id = ? AND date(created_at) = date('now')").get(linkId);
      const topReferrers = db.prepare(`SELECT COALESCE(referer, 'Direct') as name, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY referer ORDER BY count DESC LIMIT 10`).all(linkId);
      const deviceBreakdown = db.prepare(`SELECT COALESCE(device_type, 'Unknown') as name, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY device_type ORDER BY count DESC`).all(linkId);
      const browserBreakdown = db.prepare(`SELECT COALESCE(browser, 'Unknown') as name, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY browser ORDER BY count DESC LIMIT 10`).all(linkId);
      const osBreakdown = db.prepare(`SELECT COALESCE(os, 'Unknown') as name, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY os ORDER BY count DESC LIMIT 10`).all(linkId);
      const countryBreakdown = db.prepare(`SELECT COALESCE(country, 'Unknown') as name, COUNT(*) as count FROM short_link_clicks c WHERE c.link_id = ? ${df} GROUP BY country ORDER BY count DESC LIMIT 10`).all(linkId);
      return { clicksByDate, totals, today, topReferrers, deviceBreakdown, browserBreakdown, osBreakdown, countryBreakdown };
    });
    const s = getStats(link.id);

    res.json({ success: true, clicksByDate: s.clicksByDate, totalClicks: s.totals.total, uniqueIps: s.totals.unique_ips, todayClicks: s.today.cnt, topReferrers: s.topReferrers, deviceBreakdown: s.deviceBreakdown, browserBreakdown: s.browserBreakdown, osBreakdown: s.osBreakdown, countryBreakdown: s.countryBreakdown });
  } catch (e) { console.error('Stats error:', e); res.status(500).json({ error: 'Failed to load stats' }); }
});

// =====================================================================
// ADVANCED STATISTICS
// =====================================================================

router.get('/links/:id/stats/advanced', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Clicks by hour of day (0-23)
    const clicksByHourRaw = db.prepare(`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM short_link_clicks WHERE link_id = ?
      GROUP BY hour ORDER BY hour ASC
    `).all(link.id);
    const clicksByHourMap = {};
    clicksByHourRaw.forEach(r => { clicksByHourMap[r.hour] = r.count; });
    const clicksByHour = [];
    for (let h = 0; h < 24; h++) {
      clicksByHour.push({ hour: h, count: clicksByHourMap[h] || 0 });
    }

    // Clicks by day of week (0=Sun .. 6=Sat)
    const clicksByDowRaw = db.prepare(`
      SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow, COUNT(*) as count
      FROM short_link_clicks WHERE link_id = ?
      GROUP BY dow ORDER BY dow ASC
    `).all(link.id);
    const clicksByDowMap = {};
    clicksByDowRaw.forEach(r => { clicksByDowMap[r.dow] = r.count; });
    const clicksByDayOfWeek = DAY_NAMES.map((day, i) => ({
      day, count: clicksByDowMap[i] || 0
    }));

    // Hourly heatmap: 7 rows (days) x 24 cols (hours)
    const heatmapRaw = db.prepare(`
      SELECT CAST(strftime('%w', created_at) AS INTEGER) as dow,
             CAST(strftime('%H', created_at) AS INTEGER) as hour,
             COUNT(*) as count
      FROM short_link_clicks WHERE link_id = ?
      GROUP BY dow, hour
    `).all(link.id);
    const hourlyHeatmap = Array.from({ length: 7 }, () => Array(24).fill(0));
    heatmapRaw.forEach(r => { hourlyHeatmap[r.dow][r.hour] = r.count; });

    // Click velocity
    const firstClick = db.prepare('SELECT MIN(created_at) as first FROM short_link_clicks WHERE link_id = ?').get(link.id);
    const totalClicksRow = db.prepare('SELECT COUNT(*) as total FROM short_link_clicks WHERE link_id = ?').get(link.id);
    const totalClicks = totalClicksRow.total;

    let avgPerDay = 0;
    if (firstClick.first && totalClicks > 0) {
      const diffMs = Date.now() - new Date(firstClick.first + 'Z').getTime();
      const diffDays = Math.max(diffMs / (1000 * 60 * 60 * 24), 1);
      avgPerDay = Math.round((totalClicks / diffDays) * 100) / 100;
    }

    let bestHour = 0, bestHourCount = 0;
    clicksByHour.forEach(h => { if (h.count > bestHourCount) { bestHour = h.hour; bestHourCount = h.count; } });

    let bestDay = 'Mon', bestDayCount = 0;
    clicksByDayOfWeek.forEach(d => { if (d.count > bestDayCount) { bestDay = d.day; bestDayCount = d.count; } });

    const clickVelocity = { avgPerDay, bestHour, bestDay };

    // Unique visitors
    const uniqueRow = db.prepare('SELECT COUNT(DISTINCT ip_address) as cnt FROM short_link_clicks WHERE link_id = ?').get(link.id);
    const uniqueVisitors = uniqueRow.cnt;

    // Top cities
    const topCities = db.prepare(`
      SELECT COALESCE(city, 'Unknown') as name, COUNT(*) as count
      FROM short_link_clicks WHERE link_id = ?
      GROUP BY city ORDER BY count DESC LIMIT 10
    `).all(link.id);

    // Languages
    const languages = db.prepare(`
      SELECT COALESCE(language, 'Unknown') as name, COUNT(*) as count
      FROM short_link_clicks WHERE link_id = ?
      GROUP BY language ORDER BY count DESC LIMIT 10
    `).all(link.id);

    // Click trend: last 30 days
    const clickTrend = db.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM short_link_clicks
      WHERE link_id = ? AND created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at) ORDER BY date ASC
    `).all(link.id);

    res.json({
      success: true,
      clicksByHour,
      clicksByDayOfWeek,
      hourlyHeatmap,
      clickVelocity,
      uniqueVisitors,
      topCities,
      languages,
      clickTrend
    });
  } catch (e) { console.error('Advanced stats error:', e); res.status(500).json({ error: 'Failed to load advanced stats' }); }
});

// =====================================================================
// STATS EXPORT (CSV)
// =====================================================================

router.get('/links/:id/stats/export', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const clicks = db.prepare(`
      SELECT created_at, ip_address, country, city, device_type, browser, os, referer, language
      FROM short_link_clicks WHERE link_id = ? ORDER BY created_at DESC
    `).all(link.id);

    const csvHeader = 'date,ip,country,city,device,browser,os,referer,language';
    const csvRows = clicks.map(c => {
      return [
        c.created_at || '',
        c.ip_address || '',
        (c.country || '').replace(/,/g, ' '),
        (c.city || '').replace(/,/g, ' '),
        c.device_type || '',
        (c.browser || '').replace(/,/g, ' '),
        (c.os || '').replace(/,/g, ' '),
        (c.referer || '').replace(/,/g, ' '),
        (c.language || '').replace(/,/g, ' ')
      ].join(',');
    });

    const csv = csvHeader + '\n' + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="clicks-${link.code}.csv"`);
    res.send(csv);
  } catch (e) { console.error('Stats export error:', e); res.status(500).json({ error: 'Failed to export stats' }); }
});

// =====================================================================
// COMPARE
// =====================================================================

router.post('/compare', authRequired, (req, res) => {
  try {
    const { linkIds } = req.body;
    if (!Array.isArray(linkIds) || linkIds.length < 2 || linkIds.length > 4) {
      return res.status(400).json({ error: 'Provide 2-4 link IDs to compare' });
    }

    const db = getDb();
    const results = [];

    for (const linkId of linkIds) {
      const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(linkId, req.user.id);
      if (!link) return res.status(404).json({ error: `Link ${linkId} not found or not yours` });

      const totals = db.prepare('SELECT COUNT(*) as total, COUNT(DISTINCT ip_address) as unique_ips FROM short_link_clicks WHERE link_id = ?').get(link.id);

      // Avg per day
      const firstClick = db.prepare('SELECT MIN(created_at) as first FROM short_link_clicks WHERE link_id = ?').get(link.id);
      let avgPerDay = 0;
      if (firstClick.first && totals.total > 0) {
        const diffMs = Date.now() - new Date(firstClick.first + 'Z').getTime();
        const diffDays = Math.max(diffMs / (1000 * 60 * 60 * 24), 1);
        avgPerDay = Math.round((totals.total / diffDays) * 100) / 100;
      }

      const clicksByDate = db.prepare(`
        SELECT date(created_at) as date, COUNT(*) as count
        FROM short_link_clicks WHERE link_id = ? AND created_at >= datetime('now', '-30 days')
        GROUP BY date(created_at) ORDER BY date ASC
      `).all(link.id);

      const deviceBreakdown = db.prepare(`
        SELECT COALESCE(device_type, 'Unknown') as name, COUNT(*) as count
        FROM short_link_clicks WHERE link_id = ?
        GROUP BY device_type ORDER BY count DESC
      `).all(link.id);

      const browserBreakdown = db.prepare(`
        SELECT COALESCE(browser, 'Unknown') as name, COUNT(*) as count
        FROM short_link_clicks WHERE link_id = ?
        GROUP BY browser ORDER BY count DESC LIMIT 10
      `).all(link.id);

      const countryBreakdown = db.prepare(`
        SELECT COALESCE(country, 'Unknown') as name, COUNT(*) as count
        FROM short_link_clicks WHERE link_id = ?
        GROUP BY country ORDER BY count DESC LIMIT 10
      `).all(link.id);

      results.push({
        id: link.id,
        code: link.code,
        title: link.title,
        destination_url: link.destination_url,
        totalClicks: totals.total,
        uniqueIps: totals.unique_ips,
        avgPerDay,
        clicksByDate,
        deviceBreakdown,
        browserBreakdown,
        countryBreakdown
      });
    }

    res.json({ success: true, links: results });
  } catch (e) { console.error('Compare error:', e); res.status(500).json({ error: 'Failed to compare links' }); }
});

// =====================================================================
// TAGS
// =====================================================================

router.get('/tags', authRequired, (req, res) => {
  try {
    const db = getDb();
    const tags = db.prepare(`
      SELECT tag, COUNT(*) as count
      FROM short_link_tags WHERE user_id = ?
      GROUP BY tag ORDER BY count DESC
    `).all(req.user.id);
    res.json({ success: true, tags });
  } catch (e) { console.error('Tags list error:', e); res.status(500).json({ error: 'Failed to list tags' }); }
});

router.post('/links/:id/tags', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const { tags } = req.body;
    if (!Array.isArray(tags)) return res.status(400).json({ error: 'Tags must be an array' });
    if (tags.length > 10) return res.status(400).json({ error: 'Maximum 10 tags per link' });

    // Validate each tag
    for (const tag of tags) {
      if (typeof tag !== 'string' || tag.trim().length === 0 || tag.trim().length > 30) {
        return res.status(400).json({ error: `Invalid tag: "${tag}" (max 30 chars, non-empty)` });
      }
    }

    // Delete existing tags
    db.prepare('DELETE FROM short_link_tags WHERE link_id = ?').run(link.id);

    // Insert new tags
    const insertTag = db.prepare('INSERT INTO short_link_tags (user_id, link_id, tag) VALUES (?, ?, ?)');
    const uniqueTags = [...new Set(tags.map(t => t.trim()))];
    for (const tag of uniqueTags) {
      insertTag.run(req.user.id, link.id, tag);
    }

    res.json({ success: true, tags: uniqueTags });
  } catch (e) { console.error('Tags update error:', e); res.status(500).json({ error: 'Failed to update tags' }); }
});

// =====================================================================
// BULK OPERATIONS
// =====================================================================

router.post('/links/bulk', authRequired, (req, res) => {
  try {
    const { action, linkIds, value } = req.body;
    if (!Array.isArray(linkIds) || linkIds.length === 0) return res.status(400).json({ error: 'linkIds array required' });
    if (linkIds.length > 100) return res.status(400).json({ error: 'Maximum 100 links per bulk operation' });

    const validActions = ['delete', 'activate', 'deactivate', 'setCampaign', 'addTags', 'pin', 'unpin'];
    if (!validActions.includes(action)) return res.status(400).json({ error: `Invalid action. Use: ${validActions.join(', ')}` });

    const db = getDb();

    // Verify all links belong to user
    const placeholders = linkIds.map(() => '?').join(',');
    const ownedLinks = db.prepare(`SELECT id FROM short_links WHERE id IN (${placeholders}) AND user_id = ?`).all(...linkIds, req.user.id);
    const ownedIds = ownedLinks.map(l => l.id);

    if (ownedIds.length === 0) return res.status(404).json({ error: 'No matching links found' });

    const ownedPlaceholders = ownedIds.map(() => '?').join(',');
    let affected = 0;

    switch (action) {
      case 'delete': {
        // Exclude promo links from bulk deletion
        const promoIds = db.prepare(`SELECT id FROM short_links WHERE id IN (${ownedPlaceholders}) AND utm_source = 'promo'`).all(...ownedIds).map(r => r.id);
        const deletableIds = ownedIds.filter(id => !promoIds.includes(id));
        if (deletableIds.length === 0 && promoIds.length > 0) {
          return res.json({ success: true, affected: 0, message: 'Promo links cannot be deleted', skipped_promo: promoIds.length });
        }
        if (deletableIds.length > 0) {
          const delPlaceholders = deletableIds.map(() => '?').join(',');
          affected = db.prepare(`DELETE FROM short_links WHERE id IN (${delPlaceholders})`).run(...deletableIds).changes;
        }
        if (promoIds.length > 0) {
          console.log('Bulk delete: protected ' + promoIds.length + ' promo links from deletion');
        }
      }
        break;

      case 'activate':
        affected = db.prepare(`UPDATE short_links SET is_active = 1, updated_at = datetime('now') WHERE id IN (${ownedPlaceholders})`).run(...ownedIds).changes;
        break;

      case 'deactivate':
        affected = db.prepare(`UPDATE short_links SET is_active = 0, updated_at = datetime('now') WHERE id IN (${ownedPlaceholders})`).run(...ownedIds).changes;
        break;

      case 'setCampaign': {
        if (value !== null && value !== undefined) {
          const camp = db.prepare('SELECT id FROM shortener_campaigns WHERE id = ? AND user_id = ?').get(value, req.user.id);
          if (!camp) return res.status(400).json({ error: 'Campaign not found' });
        }
        affected = db.prepare(`UPDATE short_links SET campaign_id = ?, updated_at = datetime('now') WHERE id IN (${ownedPlaceholders})`).run(value || null, ...ownedIds).changes;
        break;
      }

      case 'pin':
        affected = db.prepare(`UPDATE short_links SET is_pinned = 1, updated_at = datetime('now') WHERE id IN (${ownedPlaceholders})`).run(...ownedIds).changes;
        break;

      case 'unpin':
        affected = db.prepare(`UPDATE short_links SET is_pinned = 0, updated_at = datetime('now') WHERE id IN (${ownedPlaceholders})`).run(...ownedIds).changes;
        break;

      case 'addTags': {
        if (!Array.isArray(value) || value.length === 0) return res.status(400).json({ error: 'value must be an array of tags' });
        if (value.length > 10) return res.status(400).json({ error: 'Maximum 10 tags' });
        for (const tag of value) {
          if (typeof tag !== 'string' || tag.trim().length === 0 || tag.trim().length > 30) {
            return res.status(400).json({ error: `Invalid tag: "${tag}"` });
          }
        }
        const insertTag = db.prepare('INSERT OR IGNORE INTO short_link_tags (user_id, link_id, tag) VALUES (?, ?, ?)');
        const addTagsTransaction = db.transaction(() => {
          let count = 0;
          for (const linkId of ownedIds) {
            for (const tag of value) {
              // Check current count
              const existing = db.prepare('SELECT COUNT(*) as cnt FROM short_link_tags WHERE link_id = ?').get(linkId);
              if (existing.cnt < 10) {
                insertTag.run(req.user.id, linkId, tag.trim());
                count++;
              }
            }
          }
          return count;
        });
        affected = addTagsTransaction();
        break;
      }
    }

    res.json({ success: true, action, affected, processed: ownedIds.length });
  } catch (e) { console.error('Bulk operation error:', e); res.status(500).json({ error: 'Failed to perform bulk operation' }); }
});

// =====================================================================
// CSV EXPORT (all links)
// =====================================================================

router.get('/export/links', authRequired, (req, res) => {
  try {
    const db = getDb();

    const links = db.prepare(`
      SELECT l.*,
        c.name as campaign_name,
        (SELECT GROUP_CONCAT(t.tag, ';') FROM short_link_tags t WHERE t.link_id = l.id) as tags_csv
      FROM short_links l
      LEFT JOIN shortener_campaigns c ON c.id = l.campaign_id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `).all(req.user.id);

    const csvHeader = 'code,destination_url,title,campaign,clicks,status,created,tags,utm_source,utm_medium';
    const csvRows = links.map(l => {
      return [
        l.code || '',
        `"${(l.destination_url || '').replace(/"/g, '""')}"`,
        `"${(l.title || '').replace(/"/g, '""')}"`,
        `"${(l.campaign_name || '').replace(/"/g, '""')}"`,
        l.total_clicks || 0,
        l.is_active ? 'active' : 'inactive',
        l.created_at || '',
        `"${(l.tags_csv || '').replace(/"/g, '""')}"`,
        `"${(l.utm_source || '').replace(/"/g, '""')}"`,
        `"${(l.utm_medium || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csv = csvHeader + '\n' + csvRows.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="links-export.csv"');
    res.send(csv);
  } catch (e) { console.error('Export links error:', e); res.status(500).json({ error: 'Failed to export links' }); }
});

// =====================================================================
// CLONE LINK
// =====================================================================

router.post('/links/:id/clone', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    // Check limit
    const count = db.prepare('SELECT COUNT(*) as cnt FROM short_links WHERE user_id = ?').get(req.user.id);
    if (count.cnt >= 10000) return res.status(400).json({ error: "Maximum 10000 links per account" });

    // Generate new code
    let newCode;
    for (let i = 0; i < 5; i++) {
      newCode = generateCode();
      if (!db.prepare('SELECT id FROM short_links WHERE code = ?').get(newCode)) break;
      if (i === 4) return res.status(500).json({ error: 'Failed to generate unique code' });
    }

    // Clone the link
    const result = db.prepare(`
      INSERT INTO short_links (user_id, campaign_id, code, destination_url, title, utm_source, utm_medium, utm_campaign, utm_term, utm_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, link.campaign_id, newCode, link.destination_url,
      link.title ? `${link.title} (copy)`.slice(0, 100) : null,
      link.utm_source, link.utm_medium, link.utm_campaign, link.utm_term, link.utm_content
    );
    const newId = result.lastInsertRowid;

    // Clone tags
    const tags = db.prepare('SELECT tag FROM short_link_tags WHERE link_id = ?').all(link.id);
    const insertTag = db.prepare('INSERT INTO short_link_tags (user_id, link_id, tag) VALUES (?, ?, ?)');
    for (const t of tags) {
      insertTag.run(req.user.id, newId, t.tag);
    }

    // Clone rules
    const rules = db.prepare('SELECT rule_type, rule_value, destination_url, priority FROM short_link_rules WHERE link_id = ?').all(link.id);
    const insertRule = db.prepare('INSERT INTO short_link_rules (link_id, rule_type, rule_value, destination_url, priority) VALUES (?, ?, ?, ?, ?)');
    for (const r of rules) {
      insertRule.run(newId, r.rule_type, r.rule_value, r.destination_url, r.priority);
    }

    // Return the new link
    const newLink = db.prepare('SELECT * FROM short_links WHERE id = ?').get(newId);
    const newTags = db.prepare('SELECT tag FROM short_link_tags WHERE link_id = ?').all(newId).map(r => r.tag);
    newLink.tags = newTags;

    res.json({ success: true, link: newLink });
  } catch (e) { console.error('Clone error:', e); res.status(500).json({ error: 'Failed to clone link' }); }
});

// =====================================================================
// SMART RULES
// =====================================================================

router.get('/links/:id/rules', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const rules = db.prepare('SELECT * FROM short_link_rules WHERE link_id = ? ORDER BY priority ASC').all(link.id);
    res.json({ success: true, rules });
  } catch (e) { console.error('Rules list error:', e); res.status(500).json({ error: 'Failed to list rules' }); }
});

router.post('/links/:id/rules', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const { rules } = req.body;
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'Rules must be an array' });
    if (rules.length > 20) return res.status(400).json({ error: 'Maximum 20 rules per link' });

      // Validate each rule
    for (const rule of rules) {
      if (!rule.rule_type || typeof rule.rule_type !== 'string') {
        return res.status(400).json({ error: 'Each rule must have a rule_type' });
      }
      if (!rule.destination_url || !validateUrl(rule.destination_url)) {
        return res.status(400).json({ error: `Invalid destination_url in rule: "${rule.destination_url}"` });
      }
    }

    // Delete existing rules
    db.prepare('DELETE FROM short_link_rules WHERE link_id = ?').run(link.id);

    // Insert new rules
    const insertRule = db.prepare('INSERT INTO short_link_rules (link_id, rule_type, rule_value, destination_url, priority) VALUES (?, ?, ?, ?, ?)');
    const insertedRules = [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const result = insertRule.run(
        link.id,
        r.rule_type.trim().slice(0, 50),
        (r.rule_value || '').trim().slice(0, 200),
        r.destination_url.trim(),
        r.priority !== undefined ? r.priority : i
      );
      insertedRules.push({
        id: result.lastInsertRowid,
        link_id: link.id,
        rule_type: r.rule_type.trim(),
        rule_value: (r.rule_value || '').trim(),
        destination_url: r.destination_url.trim(),
        priority: r.priority !== undefined ? r.priority : i
      });
    }

    res.json({ success: true, rules: insertedRules });
  } catch (e) { console.error('Rules update error:', e); res.status(500).json({ error: 'Failed to update rules' }); }
});

router.delete('/rules/:ruleId', authRequired, (req, res) => {
  try {
    const db = getDb();
    // Verify ownership via JOIN
    const rule = db.prepare(`
      SELECT r.* FROM short_link_rules r
      JOIN short_links l ON l.id = r.link_id
      WHERE r.id = ? AND l.user_id = ?
    `).get(req.params.ruleId, req.user.id);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    db.prepare('DELETE FROM short_link_rules WHERE id = ?').run(rule.id);
    res.json({ success: true });
  } catch (e) { console.error('Rule delete error:', e); res.status(500).json({ error: 'Failed to delete rule' }); }
});

// =====================================================================
// QR CODES
// =====================================================================

router.post('/links/:id/qr', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const { label, color, bgColor, size } = req.body;
    if (!label || typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'Label is required' });
    const qrCount = db.prepare('SELECT COUNT(*) as cnt FROM short_link_qrcodes WHERE link_id = ?').get(link.id);
    if (qrCount.cnt >= 20) return res.status(400).json({ error: 'Maximum 20 QR codes per link' });
    const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
    const safeBg = /^#[0-9a-f]{6}$/i.test(bgColor) ? bgColor : '#ffffff';
    const safeSize = Math.min(Math.max(+(size || 400), 100), 1000);
    const result = db.prepare('INSERT INTO short_link_qrcodes (link_id, label, color, bg_color, size) VALUES (?, ?, ?, ?, ?)').run(
      link.id, label.trim().slice(0, 50), safeColor, safeBg, safeSize
    );
    const qrId = result.lastInsertRowid;
    const QRCode = require('qrcode');
    const shortUrl = `https://${link.domain || 't2gift.com'}/${link.code}?qr=${qrId}`;
    const dataUrl = await QRCode.toDataURL(shortUrl, { width: safeSize, color: { dark: safeColor, light: safeBg }, errorCorrectionLevel: 'M' });
    res.json({ success: true, qrcode: { id: qrId, label: label.trim(), dataUrl, shortUrl, total_clicks: 0 } });
  } catch (e) { console.error('QR create:', e); res.status(500).json({ error: 'Failed to create QR code' }); }
});

router.get('/links/:id/qr', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const qrcodes = db.prepare('SELECT * FROM short_link_qrcodes WHERE link_id = ? ORDER BY created_at DESC').all(link.id);
    const QRCode = require('qrcode');
    for (const qr of qrcodes) {
      try {
        const shortUrl = `https://${link.domain || 't2gift.com'}/${link.code}?qr=${qr.id}`;
        qr.dataUrl = await QRCode.toDataURL(shortUrl, { width: qr.size || 400, color: { dark: qr.color || '#000000', light: qr.bg_color || '#ffffff' }, errorCorrectionLevel: 'M' });
      } catch { qr.dataUrl = null; }
    }
    res.json({ success: true, qrcodes });
  } catch (e) { console.error('QR list:', e); res.status(500).json({ error: 'Failed to list QR codes' }); }
});

router.delete('/qr/:qrId', authRequired, (req, res) => {
  try {
    const db = getDb();
    const qr = db.prepare('SELECT q.* FROM short_link_qrcodes q JOIN short_links l ON l.id = q.link_id WHERE q.id = ? AND l.user_id = ?').get(req.params.qrId, req.user.id);
    if (!qr) return res.status(404).json({ error: 'QR code not found' });
    db.prepare('DELETE FROM short_link_qrcodes WHERE id = ?').run(qr.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Failed to delete QR code' }); }
});

// =====================================================================
// DASHBOARD (basic)
// =====================================================================

router.get('/dashboard', authRequired, (req, res) => {
  try {
    const db = getDb();
    const totals = db.prepare('SELECT COUNT(*) as totalLinks, COALESCE(SUM(total_clicks), 0) as totalClicks FROM short_links WHERE user_id = ?').get(req.user.id);
    const topLinks = db.prepare('SELECT id, code, destination_url, total_clicks, title FROM short_links WHERE user_id = ? ORDER BY total_clicks DESC LIMIT 5').all(req.user.id);
    const recentClicks = db.prepare('SELECT c.*, l.code FROM short_link_clicks c JOIN short_links l ON l.id = c.link_id WHERE l.user_id = ? ORDER BY c.created_at DESC LIMIT 20').all(req.user.id);
    res.json({ success: true, totalLinks: totals.totalLinks, totalClicks: totals.totalClicks, topLinks, recentClicks });
  } catch (e) { console.error('Dashboard:', e); res.status(500).json({ error: 'Failed to load dashboard' }); }
});

// =====================================================================
// ADVANCED DASHBOARD
// =====================================================================

router.get('/dashboard/advanced', authRequired, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    // Overall trend: clicks per day for last 30 days
    const overallTrend = db.prepare(`
      SELECT date(c.created_at) as date, COUNT(*) as count
      FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ? AND c.created_at >= datetime('now', '-30 days')
      GROUP BY date(c.created_at) ORDER BY date ASC
    `).all(userId);

    // Click calendar: last 90 days (for GitHub-style heatmap)
    const clickCalendar = db.prepare(`
      SELECT date(c.created_at) as date, COUNT(*) as count
      FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ? AND c.created_at >= datetime('now', '-90 days')
      GROUP BY date(c.created_at) ORDER BY date ASC
    `).all(userId);

    // Top hours
    const topHours = db.prepare(`
      SELECT CAST(strftime('%H', c.created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ?
      GROUP BY hour ORDER BY count DESC
    `).all(userId);

    // Top days of week
    const topDaysRaw = db.prepare(`
      SELECT CAST(strftime('%w', c.created_at) AS INTEGER) as dow, COUNT(*) as count
      FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ?
      GROUP BY dow ORDER BY count DESC
    `).all(userId);
    const topDays = topDaysRaw.map(d => ({ day: DAY_NAMES[d.dow], count: d.count }));

    // Growth rate: this week vs last week
    const thisWeek = db.prepare(`
      SELECT COUNT(*) as cnt FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ? AND c.created_at >= datetime('now', '-7 days')
    `).get(userId).cnt;
    const lastWeek = db.prepare(`
      SELECT COUNT(*) as cnt FROM short_link_clicks c
      JOIN short_links l ON l.id = c.link_id
      WHERE l.user_id = ? AND c.created_at >= datetime('now', '-14 days') AND c.created_at < datetime('now', '-7 days')
    `).get(userId).cnt;
    let growthRate = 0;
    if (lastWeek > 0) {
      growthRate = Math.round(((thisWeek - lastWeek) / lastWeek) * 10000) / 100;
    } else if (thisWeek > 0) {
      growthRate = 100;
    }

    // Links by status
    const activeCount = db.prepare('SELECT COUNT(*) as cnt FROM short_links WHERE user_id = ? AND is_active = 1').get(userId).cnt;
    const inactiveCount = db.prepare('SELECT COUNT(*) as cnt FROM short_links WHERE user_id = ? AND is_active = 0').get(userId).cnt;
    const expiredCount = db.prepare("SELECT COUNT(*) as cnt FROM short_links WHERE user_id = ? AND expires_at IS NOT NULL AND expires_at < datetime('now')").get(userId).cnt;
    const linksByStatus = { active: activeCount, inactive: inactiveCount, expired: expiredCount };

    // Campaign performance
    const campaignPerformance = db.prepare(`
      SELECT c.id, c.name, c.color,
        COUNT(l.id) as linkCount,
        COALESCE(SUM(l.total_clicks), 0) as totalClicks
      FROM shortener_campaigns c
      LEFT JOIN short_links l ON l.campaign_id = c.id
      WHERE c.user_id = ?
      GROUP BY c.id
      ORDER BY totalClicks DESC
    `).all(userId);

    res.json({
      success: true,
      overallTrend,
      clickCalendar,
      topHours,
      topDays,
      growthRate,
      linksByStatus,
      campaignPerformance
    });
  } catch (e) { console.error('Advanced dashboard error:', e); res.status(500).json({ error: 'Failed to load advanced dashboard' }); }
});

// =====================================================================
// PIN/STAR (toggle favorite)
// =====================================================================

router.put('/links/:id/pin', authRequired, (req, res) => {
  try {
    const db = getDb();
    const link = db.prepare('SELECT * FROM short_links WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });
    const newPinned = link.is_pinned ? 0 : 1;
    db.prepare('UPDATE short_links SET is_pinned = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newPinned, link.id);
    res.json({ success: true, is_pinned: newPinned });
  } catch (e) { console.error('Pin toggle error:', e); res.status(500).json({ error: 'Failed to toggle pin' }); }
});

// =====================================================================
// BIO PAGE CRUD
// =====================================================================

router.get('/bio', authRequired, (req, res) => {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM user_bio_profiles WHERE user_id = ? ORDER BY id ASC LIMIT 1').get(req.user.id);
  if (profile) {
    profile.links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ? ORDER BY position ASC, id ASC').all(profile.id);
    profile.socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ? ORDER BY position ASC').all(profile.id);
  }
  res.json({ success: true, profile: profile || null });
});

router.put('/bio', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { username, display_name, bio, avatar_url, theme_color, background, show_avatar, is_public, social_links, button_style } = req.body;
    if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
      return res.status(400).json({ error: 'Username: 3-30 chars, letters/numbers/_/- only' });
    }

    const existing = db.prepare('SELECT * FROM user_bio_profiles WHERE user_id = ?').get(req.user.id);
    const safeColor = /^#[0-9a-f]{6}$/i.test(theme_color) ? theme_color : '#667eea';
    const ALL_BGS = ['gradient','solid','dots','waves','particles','mesh','aurora','matrix','confetti','gradient-shift','bokeh','noise','custom-image','custom-video'];
    const safeBg = ALL_BGS.includes(background) ? background : 'gradient';
    const safeBgImage = (typeof req.body.bg_image === 'string' && req.body.bg_image.length < 1000) ? req.body.bg_image.trim() : (existing?.bg_image || null);
    const safeBgVideo = (typeof req.body.bg_video === 'string' && req.body.bg_video.length < 1000) ? req.body.bg_video.trim() : (existing?.bg_video || null);
    const safeButtonStyle = ['glass', 'pill', 'rounded', 'square', 'outline', 'filled', 'shadow', 'neon'].includes(button_style) ? button_style : (existing?.button_style || 'glass');
    const safeSocial = (typeof social_links === 'object' && social_links !== null) ? JSON.stringify(social_links).slice(0,2000) : (existing?.social_links || '{}');

    if (existing) {
      // Check username uniqueness (excluding self)
      const dup = db.prepare('SELECT id FROM user_bio_profiles WHERE username = ? AND user_id != ?').get(username.toLowerCase(), req.user.id);
      if (dup) return res.status(409).json({ error: 'This username is already taken' });

      db.prepare(`UPDATE user_bio_profiles SET username=?, display_name=?, bio=?, avatar_url=?, theme_color=?, background=?, show_avatar=?, is_public=?, social_links=?, button_style=?, bg_image=?, bg_video=? WHERE user_id=?`).run(
        username.toLowerCase().trim(),
        (display_name || '').trim().slice(0, 100) || null,
        (bio || '').trim().slice(0, 500) || null,
        (avatar_url || '').trim().slice(0, 1000) || null,
        safeColor, safeBg,
        show_avatar !== undefined ? (show_avatar ? 1 : 0) : existing.show_avatar,
        is_public !== undefined ? (is_public ? 1 : 0) : existing.is_public,
        safeSocial, safeButtonStyle, safeBgImage, safeBgVideo,
        req.user.id
      );
    } else {
      // Check username uniqueness
      const dup = db.prepare('SELECT id FROM user_bio_profiles WHERE username = ?').get(username.toLowerCase());
      if (dup) return res.status(409).json({ error: 'This username is already taken' });

      db.prepare(`INSERT INTO user_bio_profiles (user_id, username, display_name, bio, avatar_url, theme_color, background, show_avatar, is_public, social_links, button_style, bg_image, bg_video) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id,
        username.toLowerCase().trim(),
        (display_name || '').trim().slice(0, 100) || null,
        (bio || '').trim().slice(0, 500) || null,
        (avatar_url || '').trim().slice(0, 1000) || null,
        safeColor, safeBg,
        show_avatar !== undefined ? (show_avatar ? 1 : 0) : 1,
        is_public !== undefined ? (is_public ? 1 : 0) : 1,
        safeSocial, safeButtonStyle, safeBgImage, safeBgVideo
      );
    }

    const profile = db.prepare('SELECT * FROM user_bio_profiles WHERE user_id = ?').get(req.user.id);
    res.json({ success: true, profile });
  } catch (e) { console.error('Bio update error:', e); res.status(500).json({ error: 'Failed to update bio profile' }); }
});



// ===================== BIO PAGES API (Phase 1) =====================

// [bio-tariff-fix-golden-connect] Golden Connect tariffs: free/launch/boost/rocket. Old keys (starter/pro/agency) kept as aliases for safety.
const BIO_PAGE_LIMITS = { free: 1, launch: 5, boost: 15, rocket: 50, starter: 5, pro: 15, agency: 50 };
const ALL_BG_TYPES = ['gradient','solid','dots','waves','particles','mesh','aurora','matrix','confetti','gradient-shift','bokeh','noise','custom-image','custom-video'];
const ALL_BTN_STYLES = ['glass','pill','rounded','square','outline','filled','shadow','neon'];

// Helper: get user plan (reads from users.plan directly)
const _usageLimits = require('../helpers/usage-limits');
function _bioGetUserPlan(userId) {
  return _usageLimits.getUserPlan(userId);
}

// Helper: validate bio fields
function _bioSanitize(body) {
  const username = (body.username || '').trim().toLowerCase();
  if (username && !/^[a-zA-Z0-9_-]{3,30}$/.test(username)) return { error: 'Invalid username (3-30 chars, a-z 0-9 _ -)' };

  return {
    username,
    slug: (body.slug || 'main').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').substring(0, 30) || 'main',
    page_name: (body.page_name || 'My Bio').substring(0, 100),
    display_name: (body.display_name || '').substring(0, 100),
    bio: (body.bio || '').substring(0, 500),
    avatar_url: (body.avatar_url || '').substring(0, 500),
    theme_color: /^#[0-9a-fA-F]{6}$/.test(body.theme_color) ? body.theme_color : '#667eea',
    background: ALL_BG_TYPES.includes(body.background) ? body.background : 'gradient',
    show_avatar: body.show_avatar === false || body.show_avatar === 0 ? 0 : 1,
    is_public: body.is_public === false || body.is_public === 0 ? 0 : 1,
    button_style: ALL_BTN_STYLES.includes(body.button_style) ? body.button_style : 'glass',
    bg_image: (typeof body.bg_image === 'string' && body.bg_image.length < 1000) ? body.bg_image.trim() : null,
    bg_video: (typeof body.bg_video === 'string' && body.bg_video.length < 1000) ? body.bg_video.trim() : null,
    meta_title: (body.meta_title || '').substring(0, 200),
    meta_description: (body.meta_description || '').substring(0, 500),
    social_links: null // kept for backward compat, not used in new flow
  };
}

// GET /api/shortener/bio/pages — list all bio pages for user
router.get('/bio/pages', authRequired, (req, res) => {
  try {
    const db = getDb();
    const pages = db.prepare('SELECT * FROM user_bio_profiles WHERE user_id = ? ORDER BY id ASC').all(req.user.id);
    // Attach link count and social count
    for (const p of pages) {
      p.link_count = db.prepare('SELECT COUNT(*) as c FROM bio_links WHERE bio_id = ?').get(p.id).c;
      p.social_count = db.prepare('SELECT COUNT(*) as c FROM bio_social_icons WHERE bio_id = ?').get(p.id).c;
    }
    res.json({ success: true, pages });
  } catch(err) {
    console.error('Bio pages list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// =====================================================================
// PROMO LINKS — auto-created short links for promo posts
// =====================================================================
const PROMO_SERVICE_IDS = ['banners', 'shortener', 'qr', 'hashtags', 'social-kit', 'image-tools', 'og-gen', 'pdf'];

function createPromoLinksForUser(db, userId) {
  try {
    const user = db.prepare('SELECT ref_code FROM users WHERE id = ?').get(userId);
    if (!user || !user.ref_code) return [];
    const created = [];
    for (const svc of PROMO_SERVICE_IDS) {
      const existing = db.prepare("SELECT id, code, domain FROM short_links WHERE user_id = ? AND utm_source = 'promo' AND utm_campaign = ?").get(userId, svc);
      if (existing) { created.push(existing); continue; }
      let code;
      for (let i = 0; i < 10; i++) {
        code = require('crypto').randomBytes(4).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
        if (!db.prepare('SELECT id FROM short_links WHERE code = ?').get(code)) break;
      }
      const refUrl = 'https://golden-connect.to/?ref=' + user.ref_code + '&utm_source=promo&utm_campaign=' + svc;
      const result = db.prepare(
        "INSERT INTO short_links (user_id, code, destination_url, title, domain, utm_source, utm_campaign) VALUES (?, ?, ?, ?, 't2gift.com', 'promo', ?)"
      ).run(userId, code, refUrl, '[Promo] ' + svc, svc);
      created.push({ id: result.lastInsertRowid, code, domain: 't2gift.com' });
    }
    return created;
  } catch (e) {
    console.error('createPromoLinksForUser error:', e.message);
    return [];
  }
}

// GET /api/shortener/promo-links — get all promo short links with stats
router.get('/promo-links', authRequired, (req, res) => {
  try {
    const db = getDb();
    const links = db.prepare(
      "SELECT id, code, domain, destination_url, title, utm_campaign as service_id, total_clicks, created_at FROM short_links WHERE user_id = ? AND utm_source = 'promo' ORDER BY utm_campaign"
    ).all(req.user.id);
    res.json({ success: true, links });
  } catch (e) {
    console.error('promo-links get:', e);
    res.status(500).json({ error: 'Failed to get promo links' });
  }
});

// POST /api/shortener/promo-links/ensure — create missing promo links
router.post('/promo-links/ensure', authRequired, (req, res) => {
  try {
    const db = getDb();
    createPromoLinksForUser(db, req.user.id);
    const links = db.prepare(
      "SELECT id, code, domain, destination_url, title, utm_campaign as service_id, total_clicks, created_at FROM short_links WHERE user_id = ? AND utm_source = 'promo' ORDER BY utm_campaign"
    ).all(req.user.id);
    res.json({ success: true, links });
  } catch (e) {
    console.error('promo-links ensure:', e);
    res.status(500).json({ error: 'Failed to ensure promo links' });
  }
});


// ═══ Promo Images with QR Codes ═══
const promoImagesHelper = require('../helpers/promo-images');

// GET /api/shortener/promo-images — check existing promo images
router.get('/promo-images', authRequired, (req, res) => {
  try {
    const images = promoImagesHelper.getExistingImages(req.user.id);
    res.json({ success: true, images, count: Object.keys(images).length });
  } catch(e) {
    res.json({ error: e.message });
  }
});

// POST /api/shortener/promo-images/generate — generate promo card images with QR
router.post('/promo-images/generate', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const links = db.prepare("SELECT * FROM short_links WHERE user_id = ? AND utm_source = 'promo'").all(req.user.id);
    if (!links.length) {
      return res.json({ error: 'No promo links found. Ensure promo links first.' });
    }
    const lang = req.body.lang || 'ru';
    const images = await promoImagesHelper.generatePromoImages(req.user.id, links, lang);
    res.json({ success: true, images, count: Object.keys(images).length });
  } catch(e) {
    console.error('promo-images generate:', e);
    res.json({ error: e.message || 'Failed to generate images' });
  }
});



// POST /api/shortener/bio/pages — create new bio page
router.post('/bio/pages', authRequired, async (req, res) => {
  try {
    const db = getDb();
    // [bio-tariff-fresh] Use async fetch — returns fresh tariff from api on cold cache.
    let plan = 'free';
    try { plan = await _usageLimits.getUserPlanAsync(req.user.id, { email: req.user.email }); }
    catch (_) { plan = _bioGetUserPlan(req.user.id); }
    const limit = BIO_PAGE_LIMITS[plan] || 1;
    const count = db.prepare('SELECT COUNT(*) as c FROM user_bio_profiles WHERE user_id = ?').get(req.user.id).c;
    if (count >= limit) {
      return res.status(403).json({ error: 'Bio page limit reached (' + limit + ' for ' + plan + ' plan). Upgrade to create more.' });
    }

    const s = _bioSanitize(req.body);
    if (s.error) return res.status(400).json({ error: s.error });
    if (!s.username) return res.status(400).json({ error: 'Username is required' });

    // Check username uniqueness
    const existing = db.prepare('SELECT id FROM user_bio_profiles WHERE username = ?').get(s.username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    // Check slug uniqueness for this user
    const existingSlug = db.prepare('SELECT id FROM user_bio_profiles WHERE user_id = ? AND slug = ?').get(req.user.id, s.slug);
    if (existingSlug) return res.status(409).json({ error: 'Slug already exists for your account' });

    const result = db.prepare(`INSERT INTO user_bio_profiles
      (user_id, slug, username, page_name, display_name, bio, avatar_url, theme_color, background,
       show_avatar, is_public, button_style, bg_image, bg_video, meta_title, meta_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, s.slug, s.username, s.page_name, s.display_name, s.bio, s.avatar_url,
      s.theme_color, s.background, s.show_avatar, s.is_public, s.button_style,
      s.bg_image, s.bg_video, s.meta_title, s.meta_description
    );

    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ?').get(result.lastInsertRowid);
    page.links = [];
    page.socials = [];
    res.json({ success: true, page });
  } catch(err) {
    console.error('Bio page create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/shortener/bio/pages/:id — get single page with links and socials
router.get('/bio/pages/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    page.links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ? ORDER BY position ASC, id ASC').all(page.id);
    page.socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ? ORDER BY position ASC').all(page.id);
    res.json({ success: true, page });
  } catch(err) {
    console.error('Bio page get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/shortener/bio/pages/:id — update bio page
router.put('/bio/pages/:id', authRequired, (req, res) => {
    // [bio-sanitize-apply] Strip dangerous HTML from user input
    if (req.body) {
      ['bio', 'display_name', 'page_name', 'meta_title', 'meta_description'].forEach(function (k) {
        if (typeof req.body[k] === 'string') req.body[k] = _sanitizeText(req.body[k]);
      });
    }
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const s = _bioSanitize(req.body);
    if (s.error) return res.status(400).json({ error: s.error });
    if (!s.username) return res.status(400).json({ error: 'Username is required' });

    // Check username uniqueness (excluding current)
    const existing = db.prepare('SELECT id FROM user_bio_profiles WHERE username = ? AND id != ?').get(s.username, page.id);
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    // Check slug uniqueness (excluding current)
    const existingSlug = db.prepare('SELECT id FROM user_bio_profiles WHERE user_id = ? AND slug = ? AND id != ?').get(req.user.id, s.slug, page.id);
    if (existingSlug) return res.status(409).json({ error: 'Slug already exists' });

    db.prepare(`UPDATE user_bio_profiles SET
      slug=?, username=?, page_name=?, display_name=?, bio=?, avatar_url=?, theme_color=?, background=?,
      show_avatar=?, is_public=?, button_style=?, bg_image=?, bg_video=?, meta_title=?, meta_description=?
      WHERE id=?`).run(
      s.slug, s.username, s.page_name, s.display_name, s.bio, s.avatar_url,
      s.theme_color, s.background, s.show_avatar, s.is_public, s.button_style,
      s.bg_image, s.bg_video, s.meta_title, s.meta_description, page.id
    );

    const updated = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ?').get(page.id);
    updated.links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ? ORDER BY position ASC, id ASC').all(page.id);
    updated.socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ? ORDER BY position ASC').all(page.id);
    res.json({ success: true, page: updated });
  } catch(err) {
    console.error('Bio page update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shortener/bio/pages/:id — delete bio page
router.delete('/bio/pages/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    // Delete links and socials (CASCADE should handle, but be explicit)
    db.prepare('DELETE FROM bio_links WHERE bio_id = ?').run(page.id);
    db.prepare('DELETE FROM bio_social_icons WHERE bio_id = ?').run(page.id);
    db.prepare('DELETE FROM user_bio_profiles WHERE id = ?').run(page.id);
    res.json({ success: true });
  } catch(err) {
    console.error('Bio page delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/shortener/bio/pages/:id/clone — clone bio page
router.post('/bio/pages/:id/clone', authRequired, async (req, res) => {
  try {
    const db = getDb();
    let plan = 'free';
    try { plan = await _usageLimits.getUserPlanAsync(req.user.id, { email: req.user.email }); }
    catch (_) { plan = _bioGetUserPlan(req.user.id); }
    const limit = BIO_PAGE_LIMITS[plan] || 1;
    const count = db.prepare('SELECT COUNT(*) as c FROM user_bio_profiles WHERE user_id = ?').get(req.user.id).c;
    if (count >= limit) {
      return res.status(403).json({ error: 'Bio page limit reached' });
    }

    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const newSlug = page.slug + '-copy-' + Date.now().toString(36);
    const newUsername = page.username + '-' + Date.now().toString(36);

    const result = db.prepare(`INSERT INTO user_bio_profiles
      (user_id, slug, username, page_name, display_name, bio, avatar_url, theme_color, background,
       show_avatar, is_public, button_style, bg_image, bg_video, meta_title, meta_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id, newSlug, newUsername, page.page_name + ' (Copy)', page.display_name, page.bio,
      page.avatar_url, page.theme_color, page.background, page.show_avatar, page.is_public,
      page.button_style, page.bg_image, page.bg_video, page.meta_title, page.meta_description
    );
    const newId = result.lastInsertRowid;

    // Clone links
    const links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ?').all(page.id);
    const insertLink = db.prepare('INSERT INTO bio_links (bio_id, title, url, icon, position, is_active) VALUES (?, ?, ?, ?, ?, ?)');
    for (const l of links) {
      insertLink.run(newId, l.title, l.url, l.icon, l.position, l.is_active);
    }

    // Clone socials
    const socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ?').all(page.id);
    const insertSocial = db.prepare('INSERT INTO bio_social_icons (bio_id, platform, url, position) VALUES (?, ?, ?, ?)');
    for (const s of socials) {
      insertSocial.run(newId, s.platform, s.url, s.position);
    }

    const cloned = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ?').get(newId);
    cloned.links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ?').all(newId);
    cloned.socials = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ?').all(newId);
    res.json({ success: true, page: cloned });
  } catch(err) {
    console.error('Bio page clone error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================== BIO LINKS CRUD =====================

// POST /api/shortener/bio/pages/:id/links — add link
router.post('/bio/pages/:id/links', authRequired, (req, res) => {
    // [bio-link-sanitize] Strip dangerous HTML from link fields
    if (req.body) {
      ['title', 'content', 'description'].forEach(function (k) {
        if (typeof req.body[k] === 'string') req.body[k] = _sanitizeText(req.body[k]);
      });
      // url should not have javascript:
      if (typeof req.body.url === 'string' && /^javascript:/i.test(req.body.url.trim())) req.body.url = '#';
    }
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const title = (req.body.title || '').substring(0, 200);
    const url = (req.body.url || '').substring(0, 1000);
    const icon = (req.body.icon || '').substring(0, 50);
    // URL optional - user fills in after creating

    // Get next position
    const maxPos = db.prepare('SELECT MAX(position) as m FROM bio_links WHERE bio_id = ?').get(page.id);
    const position = (maxPos.m || 0) + 1;

    const type = (req.body.type || 'link').substring(0, 20);
    const content = (req.body.content || '').substring(0, 5000);
    const result = db.prepare('INSERT INTO bio_links (bio_id, title, url, icon, position, type, content) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      page.id, title, url, icon, position, type, content
    );
    const link = db.prepare('SELECT * FROM bio_links WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, link });
  } catch(err) {
    console.error('Bio link add error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/shortener/bio/pages/:id/links/:lid — update link
router.put('/bio/pages/:id/links/:lid', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const link = db.prepare('SELECT * FROM bio_links WHERE id = ? AND bio_id = ?').get(req.params.lid, page.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    const title = (req.body.title !== undefined ? req.body.title : link.title).substring(0, 200);
    const url = (req.body.url !== undefined ? req.body.url : link.url).substring(0, 1000);
    const icon = (req.body.icon !== undefined ? req.body.icon : link.icon || '').substring(0, 50);
    const is_active = req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : link.is_active;

    db.prepare('UPDATE bio_links SET title=?, url=?, icon=?, is_active=? WHERE id=?').run(title, url, icon, is_active, link.id);
    const updated = db.prepare('SELECT * FROM bio_links WHERE id = ?').get(link.id);
    res.json({ success: true, link: updated });
  } catch(err) {
    console.error('Bio link update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/shortener/bio/pages/:id/links/:lid — delete link
router.delete('/bio/pages/:id/links/:lid', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const link = db.prepare('SELECT * FROM bio_links WHERE id = ? AND bio_id = ?').get(req.params.lid, page.id);
    if (!link) return res.status(404).json({ error: 'Link not found' });

    db.prepare('DELETE FROM bio_links WHERE id = ?').run(link.id);
    res.json({ success: true });
  } catch(err) {
    console.error('Bio link delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/shortener/bio/pages/:id/links/reorder — reorder links
router.put('/bio/pages/:id/links/reorder', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const order = req.body.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array of link IDs' });

    const updatePos = db.prepare('UPDATE bio_links SET position = ? WHERE id = ? AND bio_id = ?');
    const tx = db.transaction(() => {
      for (let i = 0; i < order.length; i++) {
        updatePos.run(i, order[i], page.id);
      }
    });
    tx();

    const links = db.prepare('SELECT * FROM bio_links WHERE bio_id = ? ORDER BY position ASC, id ASC').all(page.id);
    res.json({ success: true, links });
  } catch(err) {
    console.error('Bio links reorder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================== BIO SOCIALS =====================

// PUT /api/shortener/bio/pages/:id/socials — set socials (replace all)
router.put('/bio/pages/:id/socials', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const socials = req.body.socials;
    if (!Array.isArray(socials)) return res.status(400).json({ error: 'socials must be array' });

    const VALID_PLATFORMS = ['instagram','tiktok','youtube','telegram','twitter','vk','facebook','linkedin','whatsapp','github','spotify','pinterest','website'];

    const tx = db.transaction(() => {
      db.prepare('DELETE FROM bio_social_icons WHERE bio_id = ?').run(page.id);
      const insert = db.prepare('INSERT INTO bio_social_icons (bio_id, platform, url, position) VALUES (?, ?, ?, ?)');
      let pos = 0;
      for (const s of socials) {
        if (!s.platform || !s.url) continue;
        if (!VALID_PLATFORMS.includes(s.platform)) continue;
        const url = String(s.url).substring(0, 500).trim();
        if (!url) continue;
        insert.run(page.id, s.platform, url, pos++);
      }
    });
    tx();

    const updated = db.prepare('SELECT * FROM bio_social_icons WHERE bio_id = ? ORDER BY position ASC').all(page.id);
    res.json({ success: true, socials: updated });
  } catch(err) {
    console.error('Bio socials update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================== TRACKING (no auth) =====================

// POST /api/shortener/bio/track/visit
router.post('/bio/track/visit', (req, res) => {
  try {
    const db = getDb();
    const { bio_id, ref } = req.body;
    if (!bio_id) return res.json({ ok: true });

    const ua = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const referer = ref || req.headers['referer'] || '';
    const language = req.headers['accept-language']?.split(',')[0] || '';

    // Device detection
    let device_type = 'desktop';
    if (/mobile|android|iphone|ipad/i.test(ua)) device_type = /ipad|tablet/i.test(ua) ? 'tablet' : 'mobile';

    // Browser detection
    let browser = 'other';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome/i.test(ua)) browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    // OS detection
    let os = 'other';
    if (/windows/i.test(ua)) os = 'Windows';
    else if (/macintosh|mac os/i.test(ua)) os = 'macOS';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/iphone|ipad/i.test(ua)) os = 'iOS';
    else if (/linux/i.test(ua)) os = 'Linux';

    db.prepare(`INSERT INTO bio_page_visits (bio_id, ip_address, user_agent, device_type, browser, os, referer, language, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(bio_id, ip, ua.substring(0, 500), device_type, browser, os, referer.substring(0, 500), language);

    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});

// POST /api/shortener/bio/track/link-click
router.post('/bio/track/link-click', (req, res) => {
  try {
    const db = getDb();
    const { bio_id, link_id } = req.body;
    if (!bio_id || !link_id) return res.json({ ok: true });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    db.prepare('UPDATE bio_links SET total_clicks = total_clicks + 1 WHERE id = ? AND bio_id = ?').run(link_id, bio_id);
    db.prepare(`INSERT INTO bio_link_clicks (bio_id, link_id, ip_address, created_at) VALUES (?, ?, ?, datetime('now'))`).run(bio_id, link_id, ip);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});

// POST /api/shortener/bio/track/social-click
router.post('/bio/track/social-click', (req, res) => {
  try {
    const db = getDb();
    const { bio_id, social_id } = req.body;
    if (!bio_id || !social_id) return res.json({ ok: true });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    db.prepare(`INSERT INTO bio_social_clicks (bio_id, social_id, ip_address, created_at) VALUES (?, ?, ?, datetime('now'))`).run(bio_id, social_id, ip);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});


// ===================== STATS + QR (Phase 3) =====================

// GET /api/shortener/bio/pages/:id/stats — page statistics
// GET /api/shortener/bio/dashboard — aggregated dashboard for all user bio pages
router.get('/bio/dashboard', authRequired, (req, res) => {
  try {
    const db = getDb();
    const period = req.query.period || '30d';
    let dateFilter = "datetime('now', '-30 days')";
    if (period === '7d') dateFilter = "datetime('now', '-7 days')";
    else if (period === '24h') dateFilter = "datetime('now', '-1 day')";
    else if (period === '90d') dateFilter = "datetime('now', '-90 days')";
    else if (period === 'all') dateFilter = "datetime('2020-01-01')";

    const topPages = db.prepare(`
      SELECT
        p.id, p.username, p.page_name, p.display_name, p.total_views,
        COALESCE(SUM(bl.total_clicks), 0) AS total_clicks,
        COUNT(bl.id) AS links_count
      FROM user_bio_profiles p
      LEFT JOIN bio_links bl ON bl.bio_id = p.id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.total_views DESC, total_clicks DESC
      LIMIT 10
    `).all(req.user.id);

    const totals = db.prepare(`
      SELECT
        COUNT(DISTINCT p.id) AS pages,
        COALESCE(SUM(p.total_views), 0) AS total_views,
        COALESCE(SUM(bl.total_clicks), 0) AS total_clicks,
        COUNT(bl.id) AS total_links
      FROM user_bio_profiles p
      LEFT JOIN bio_links bl ON bl.bio_id = p.id
      WHERE p.user_id = ?
    `).get(req.user.id);

    const periodViews = db.prepare(`
      SELECT COUNT(*) AS c
      FROM bio_page_visits v
      JOIN user_bio_profiles p ON p.id = v.bio_id
      WHERE p.user_id = ? AND v.created_at >= ${dateFilter}
    `).get(req.user.id).c || 0;

    const viewsByDay = db.prepare(`
      SELECT date(v.created_at) AS day, COUNT(*) AS views
      FROM bio_page_visits v
      JOIN user_bio_profiles p ON p.id = v.bio_id
      WHERE p.user_id = ? AND v.created_at >= ${dateFilter}
      GROUP BY day
      ORDER BY day ASC
    `).all(req.user.id);

    const devices = db.prepare(`
      SELECT COALESCE(v.device_type, 'unknown') AS device_type, COUNT(*) AS c
      FROM bio_page_visits v
      JOIN user_bio_profiles p ON p.id = v.bio_id
      WHERE p.user_id = ? AND v.created_at >= ${dateFilter}
      GROUP BY v.device_type
      ORDER BY c DESC
      LIMIT 8
    `).all(req.user.id);

    const browsers = db.prepare(`
      SELECT COALESCE(v.browser, 'unknown') AS browser, COUNT(*) AS c
      FROM bio_page_visits v
      JOIN user_bio_profiles p ON p.id = v.bio_id
      WHERE p.user_id = ? AND v.created_at >= ${dateFilter}
      GROUP BY v.browser
      ORDER BY c DESC
      LIMIT 8
    `).all(req.user.id);

    const activeDomains = db.prepare(`
      SELECT COUNT(*) AS c
      FROM bio_custom_domains
      WHERE user_id = ? AND (dns_status = 'verified' OR ssl_status = 'active')
    `).get(req.user.id).c || 0;

    const totalViews = Number(totals?.total_views || 0);
    const totalClicks = Number(totals?.total_clicks || 0);
    const ctr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;

    res.json({
      success: true,
      dashboard: {
        period,
        totals: {
          pages: Number(totals?.pages || 0),
          total_links: Number(totals?.total_links || 0),
          total_views: totalViews,
          period_views: Number(periodViews || 0),
          total_clicks: totalClicks,
          active_domains: Number(activeDomains || 0),
          ctr
        },
        views_by_day: viewsByDay,
        devices,
        browsers,
        top_pages: topPages
      }
    });
  } catch (err) {
    console.error('Bio dashboard error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/bio/pages/:id/stats', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const period = req.query.period || '30d';
    let dateFilter = "datetime('now', '-30 days')";
    if (period === '7d') dateFilter = "datetime('now', '-7 days')";
    else if (period === '24h') dateFilter = "datetime('now', '-1 day')";
    else if (period === '90d') dateFilter = "datetime('now', '-90 days')";
    else if (period === 'all') dateFilter = "datetime('2020-01-01')";

    // Views over time
    const viewsByDay = db.prepare(`SELECT date(created_at) as day, COUNT(*) as views
      FROM bio_page_visits WHERE bio_id = ? AND created_at >= ${dateFilter}
      GROUP BY day ORDER BY day ASC`).all(page.id);

    // Total views
    const totalViews = page.total_views || 0;
    const periodViews = db.prepare(`SELECT COUNT(*) as c FROM bio_page_visits WHERE bio_id = ? AND created_at >= ${dateFilter}`).get(page.id).c;

    // Devices
    const devices = db.prepare(`SELECT device_type, COUNT(*) as c FROM bio_page_visits WHERE bio_id = ? AND created_at >= ${dateFilter} GROUP BY device_type ORDER BY c DESC`).all(page.id);

    // Browsers
    const browsers = db.prepare(`SELECT browser, COUNT(*) as c FROM bio_page_visits WHERE bio_id = ? AND created_at >= ${dateFilter} GROUP BY browser ORDER BY c DESC`).all(page.id);

    // OS
    const oses = db.prepare(`SELECT os, COUNT(*) as c FROM bio_page_visits WHERE bio_id = ? AND created_at >= ${dateFilter} GROUP BY os ORDER BY c DESC`).all(page.id);

    // Top links
    const topLinks = db.prepare(`SELECT bl.title, bl.url, bl.total_clicks,
      (SELECT COUNT(*) FROM bio_link_clicks WHERE link_id = bl.id AND created_at >= ${dateFilter}) as period_clicks
      FROM bio_links bl WHERE bl.bio_id = ? ORDER BY bl.total_clicks DESC LIMIT 10`).all(page.id);

    // Referers
    const referers = db.prepare(`SELECT referer, COUNT(*) as c FROM bio_page_visits WHERE bio_id = ? AND referer != '' AND created_at >= ${dateFilter} GROUP BY referer ORDER BY c DESC LIMIT 10`).all(page.id);

    // Total link clicks
    const totalClicks = db.prepare('SELECT SUM(total_clicks) as c FROM bio_links WHERE bio_id = ?').get(page.id).c || 0;

    res.json({
      success: true,
      stats: {
        total_views: totalViews,
        period_views: periodViews,
        total_clicks: totalClicks,
        views_by_day: viewsByDay,
        devices,
        browsers,
        oses,
        top_links: topLinks,
        referers
      }
    });
  } catch(err) {
    console.error('Bio stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/shortener/bio/pages/:id/qr — generate QR code
router.get('/bio/pages/:id/qr', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const QRCode = require('qrcode');
    const url = 'https://golden-connect.to/bio/' + page.username;
    const color = req.query.color || '#000000';
    const bg = req.query.bg || '#ffffff';
    const size = Math.min(parseInt(req.query.size) || 300, 1000);

    QRCode.toDataURL(url, {
      width: size,
      margin: 2,
      color: { dark: color, light: bg }
    }, (err, dataUrl) => {
      if (err) return res.status(500).json({ error: 'QR generation failed' });
      res.json({ success: true, qr: dataUrl, url });
    });
  } catch(err) {
    console.error('Bio QR error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ===================== END STATS + QR =====================

// ===================== AI BIO GENERATION (Phase 4) =====================

// POST /api/shortener/bio/ai-generate — generate bio page content with AI
router.post('/bio/ai-generate', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    // Rate limit: check daily usage
    const today = new Date().toISOString().split('T')[0];
    const usageCount = db.prepare(
      "SELECT COUNT(*) as c FROM bio_page_visits WHERE bio_id = -1 AND ip_address = ? AND date(created_at) = ?"
    ).get('ai_gen_' + userId, today)?.c || 0;

    const _chkBioGen = await require('../helpers/usage-limits').checkLimitAsync(userId, 'ai.bio-gen', { email: req.webUser ? req.webUser.email : null });
    if (!_chkBioGen.allowed) {
      return res.status(429).json({
        error: 'Daily AI generation limit reached', code: 'LIMIT_REACHED',
        used: _chkBioGen.used, limit: _chkBioGen.limit, plan: _chkBioGen.plan,
        hasOwnKey: _chkBioGen.hasOwnKey, ai: true,
        upgrade_url: '/pricing',
        groq_key_hint: !_chkBioGen.hasOwnKey
      });
    }

    const { business_description, language, style } = req.body;
    if (!business_description || business_description.trim().length < 10) {
      return res.status(400).json({ error: 'Business description must be at least 10 characters' });
    }

    const lang = ['en','ru','es','fr','de','zh','ja','ko','pt','ar','hi','tr'].includes(language) ? language : 'en';
    const styleOpt = ['professional','creative','minimal','bold'].includes(style) ? style : 'professional';

    // Golden Connect: groq-rotator (round-robin across all configured keys)
    const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');
    const config = require('../config');
    const groqKeys = getGroqKeys(config);
    if (!groqKeys.length) {
      return res.status(503).json({ error: 'AI service not available' });
    }

    const backgrounds = ['gradient','particles','waves','matrix','aurora','starfield','geometric','bubbles','lightning','rain','fireflies','galaxy','smoke','ripple'];
    const buttonStyles = ['glass','outline','neon','minimal','gradient','shadow','pill','flat'];

    const systemPrompt = lang === 'ru'
      ? `Ты — AI-ассистент для создания bio-страниц (аналог Linktree). Генерируй креативный, привлекательный контент.
Стиль: ${styleOpt}. Ответ ТОЛЬКО в формате JSON, без markdown.`
      : `You are an AI assistant for creating bio pages (like Linktree). Generate creative, engaging content.
Style: ${styleOpt}. Respond ONLY in valid JSON format, no markdown.`;

    const userPrompt = lang === 'ru'
      ? `Создай bio-страницу для: "${business_description.substring(0, 500)}"

Верни JSON:
{
  "display_name": "имя/бренд (до 50 символов)",
  "bio": "описание (до 200 символов, с эмодзи)",
  "suggested_links": [
    {"title": "название ссылки", "url": "https://example.com"},
    {"title": "название ссылки 2", "url": "https://example.com"}
  ],
  "suggested_socials": ["instagram", "telegram", "youtube"],
  "recommended_button_style": "одно из: ${buttonStyles.join(', ')}",
  "recommended_background": "одно из: ${backgrounds.join(', ')}",
  "recommended_theme_color": "#hex цвет",
  "meta_title": "SEO заголовок (до 60 символов)",
  "meta_description": "SEO описание (до 160 символов)"
}`
      : `Create a bio page for: "${business_description.substring(0, 500)}"

Return JSON:
{
  "display_name": "name/brand (up to 50 chars)",
  "bio": "description (up to 200 chars, with emojis)",
  "suggested_links": [
    {"title": "link title", "url": "https://example.com"},
    {"title": "link title 2", "url": "https://example.com"}
  ],
  "suggested_socials": ["instagram", "twitter", "youtube"],
  "recommended_button_style": "one of: ${buttonStyles.join(', ')}",
  "recommended_background": "one of: ${backgrounds.join(', ')}",
  "recommended_theme_color": "#hex color",
  "meta_title": "SEO title (up to 60 chars)",
  "meta_description": "SEO description (up to 160 chars)"
}`;

    const r = await requestGroqChatCompletion([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { groqKeys, model: 'llama-3.3-70b-versatile', maxTokens: 800, temperature: 0.8, timeoutMs: 30000, responseFormat: 'json_object' });

    let result;
    try {
      result = JSON.parse(r.choices?.[0]?.message?.content || '{}');
    } catch(e) {
      return res.status(500).json({ error: 'AI returned invalid JSON' });
    }

    // Validate and sanitize result
    result.display_name = (result.display_name || '').substring(0, 100);
    result.bio = (result.bio || '').substring(0, 500);
    result.recommended_theme_color = /^#[0-9a-fA-F]{6}$/.test(result.recommended_theme_color) ? result.recommended_theme_color : '#667eea';
    result.recommended_background = backgrounds.includes(result.recommended_background) ? result.recommended_background : 'gradient';
    result.recommended_button_style = buttonStyles.includes(result.recommended_button_style) ? result.recommended_button_style : 'glass';
    result.meta_title = (result.meta_title || '').substring(0, 200);
    result.meta_description = (result.meta_description || '').substring(0, 500);
    if (!Array.isArray(result.suggested_links)) result.suggested_links = [];
    result.suggested_links = result.suggested_links.slice(0, 10).map(l => ({
      title: (l.title || '').substring(0, 100),
      url: (l.url || '').substring(0, 500)
    }));
    if (!Array.isArray(result.suggested_socials)) result.suggested_socials = [];

    // Track usage (reuse bio_page_visits with bio_id=-1 as AI usage tracker)
    db.prepare("INSERT INTO bio_page_visits (bio_id, ip_address, created_at) VALUES (-1, ?, datetime('now'))").run('ai_gen_' + userId);

    res.json({ success: true, result });
  } catch(e) {
    console.error('AI bio generate error:', e.message);
    res.status(500).json({ error: 'AI generation failed: ' + e.message });
  }
});

// ===================== END AI BIO GENERATION =====================

// ===================== A/B TESTING (Phase 5) =====================

// POST /api/shortener/bio/pages/:id/ab-test — create A/B test
router.post('/bio/pages/:id/ab-test', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    // Only one active test per page
    const existing = db.prepare('SELECT id FROM bio_ab_tests WHERE bio_id = ? AND is_active = 1').get(page.id);
    if (existing) return res.status(400).json({ error: 'Page already has an active A/B test' });

    const { name, variant_b, split_ratio } = req.body;
    if (!variant_b || typeof variant_b !== 'object') return res.status(400).json({ error: 'variant_b is required (object)' });

    const ratio = Math.min(90, Math.max(10, parseInt(split_ratio) || 50));
    const result = db.prepare(
      "INSERT INTO bio_ab_tests (bio_id, user_id, name, variant_b_json, split_ratio, is_active, started_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'))"
    ).run(page.id, req.user.id, (name || 'A/B Test').substring(0, 100), JSON.stringify(variant_b), ratio);

    const test = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, test });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shortener/bio/pages/:id/ab-test — get A/B tests for page
router.get('/bio/pages/:id/ab-test', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    const tests = db.prepare('SELECT * FROM bio_ab_tests WHERE bio_id = ? ORDER BY id DESC').all(page.id);
    tests.forEach(t => { try { t.variant_b = JSON.parse(t.variant_b_json); } catch(e) { t.variant_b = {}; } });
    res.json({ success: true, tests });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/shortener/bio/pages/:id/ab-test/:tid — update A/B test
router.put('/bio/pages/:id/ab-test/:tid', authRequired, (req, res) => {
  try {
    const db = getDb();
    const test = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ? AND user_id = ?').get(req.params.tid, req.user.id);
    if (!test) return res.status(404).json({ error: 'A/B test not found' });

    const { name, variant_b, split_ratio } = req.body;
    if (variant_b && typeof variant_b === 'object') {
      db.prepare('UPDATE bio_ab_tests SET variant_b_json = ? WHERE id = ?').run(JSON.stringify(variant_b), test.id);
    }
    if (name) db.prepare('UPDATE bio_ab_tests SET name = ? WHERE id = ?').run(name.substring(0, 100), test.id);
    if (split_ratio) {
      const ratio = Math.min(90, Math.max(10, parseInt(split_ratio)));
      db.prepare('UPDATE bio_ab_tests SET split_ratio = ? WHERE id = ?').run(ratio, test.id);
    }

    const updated = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ?').get(test.id);
    try { updated.variant_b = JSON.parse(updated.variant_b_json); } catch(e) { updated.variant_b = {}; }
    res.json({ success: true, test: updated });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shortener/bio/pages/:id/ab-test/:tid/end — end A/B test
router.post('/bio/pages/:id/ab-test/:tid/end', authRequired, (req, res) => {
  try {
    const db = getDb();
    const test = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ? AND user_id = ?').get(req.params.tid, req.user.id);
    if (!test) return res.status(404).json({ error: 'A/B test not found' });

    // Determine winner
    const ctrA = test.impressions_a > 0 ? (test.clicks_a / test.impressions_a * 100) : 0;
    const ctrB = test.impressions_b > 0 ? (test.clicks_b / test.impressions_b * 100) : 0;
    let winner = 'tie';
    if (ctrA > ctrB + 1) winner = 'A';
    else if (ctrB > ctrA + 1) winner = 'B';

    db.prepare("UPDATE bio_ab_tests SET is_active = 0, ended_at = datetime('now'), winner = ? WHERE id = ?").run(winner, test.id);

    // If winner is B and user wants to apply, they can do it manually
    const updated = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ?').get(test.id);
    try { updated.variant_b = JSON.parse(updated.variant_b_json); } catch(e) { updated.variant_b = {}; }
    res.json({ success: true, test: updated, winner, ctr_a: ctrA.toFixed(2), ctr_b: ctrB.toFixed(2) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/shortener/bio/pages/:id/ab-test/:tid — delete A/B test
router.delete('/bio/pages/:id/ab-test/:tid', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM bio_ab_tests WHERE id = ? AND user_id = ?').run(req.params.tid, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shortener/bio/pages/:id/ab-test/:tid/apply-b — apply variant B to page
router.post('/bio/pages/:id/ab-test/:tid/apply-b', authRequired, (req, res) => {
  try {
    const db = getDb();
    const test = db.prepare('SELECT * FROM bio_ab_tests WHERE id = ? AND user_id = ?').get(req.params.tid, req.user.id);
    if (!test) return res.status(404).json({ error: 'A/B test not found' });

    let varB;
    try { varB = JSON.parse(test.variant_b_json); } catch(e) { return res.status(400).json({ error: 'Invalid variant B data' }); }

    // Apply variant B fields to the page
    const fields = ['display_name','bio','theme_color','background','button_style','meta_title','meta_description'];
    const updates = [];
    const values = [];
    fields.forEach(f => {
      if (varB[f] !== undefined) { updates.push(f + ' = ?'); values.push(varB[f]); }
    });

    if (updates.length > 0) {
      values.push(test.bio_id);
      values.push(req.user.id);
      db.prepare('UPDATE user_bio_profiles SET ' + updates.join(', ') + ' WHERE id = ? AND user_id = ?').run(...values);
    }

    res.json({ success: true, applied_fields: updates.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Internal: track A/B impression/click (called from bio-page.js tracking)
router.post('/bio/track/ab-click', (req, res) => {
  try {
    const db = getDb();
    const { test_id, variant } = req.body;
    if (!test_id || !variant) return res.json({ ok: true });
    const col = variant === 'b' ? 'clicks_b' : 'clicks_a';
    db.prepare('UPDATE bio_ab_tests SET ' + col + ' = ' + col + ' + 1 WHERE id = ? AND is_active = 1').run(test_id);
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});

// ===================== END A/B TESTING =====================


// ===================== CUSTOM DOMAINS (Phase 6) =====================

// POST /api/shortener/bio/pages/:id/domain — add custom domain
router.post('/bio/pages/:id/domain', authRequired, (req, res) => {
  try {
    const db = getDb();
    const page = db.prepare('SELECT * FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!page) return res.status(404).json({ error: 'Bio page not found' });

    // Plan check
    const plan = _bioGetUserPlan(req.user.id);
    const limits = { free: 0, starter: 1, pro: 3, agency: 999 };
    const limit = limits[plan] || 0;
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM bio_custom_domains WHERE user_id = ?').get(req.user.id)?.c || 0;
    if (existingCount >= limit) {
      return res.status(403).json({ error: 'Custom domain limit reached for your plan (' + limit + ')' });
    }

    let { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain required' });
    domain = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) {
      return res.status(400).json({ error: 'Invalid domain format' });
    }

    // Check not already taken
    const existing = db.prepare('SELECT id FROM bio_custom_domains WHERE domain = ?').get(domain);
    if (existing) return res.status(400).json({ error: 'Domain already registered' });

    const token = require('crypto').randomBytes(16).toString('hex');
    db.prepare("INSERT INTO bio_custom_domains (bio_id, user_id, domain, verification_token) VALUES (?, ?, ?, ?)")
      .run(page.id, req.user.id, domain, token);

    const domainRow = db.prepare('SELECT * FROM bio_custom_domains WHERE domain = ?').get(domain);
    res.json({
      success: true, domain: domainRow,
      instructions: {
        type: 'CNAME',
        name: domain,
        value: 'golden-connect.to',
        txt_name: '_bio-verify.' + domain,
        txt_value: token
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/shortener/bio/pages/:id/domain — get domains for page
router.get('/bio/pages/:id/domain', authRequired, (req, res) => {
  try {
    const db = getDb();
    const domains = db.prepare('SELECT * FROM bio_custom_domains WHERE bio_id = ? AND user_id = ?').all(req.params.id, req.user.id);
    res.json({ success: true, domains });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/shortener/bio/pages/:id/domain/:did/verify — verify DNS
router.post('/bio/pages/:id/domain/:did/verify', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const domainRow = db.prepare('SELECT * FROM bio_custom_domains WHERE id = ? AND user_id = ?').get(req.params.did, req.user.id);
    if (!domainRow) return res.status(404).json({ error: 'Domain not found' });

    const dns = require('dns').promises;
    let verified = false;
    let errorMsg = '';

    // Method 1: Check CNAME
    try {
      const cname = await dns.resolveCname(domainRow.domain);
      if (cname.some(c => c.includes('golden-connect.to') || c.includes('81.91.177.204'))) {
        verified = true;
      }
    } catch(e) {
      // CNAME might not exist, try A record
    }

    // Method 2: Check A record pointing to our IP
    if (!verified) {
      try {
        const addresses = await dns.resolve4(domainRow.domain);
        if (addresses.includes('144.217.65.94')) {
          verified = true;
        }
      } catch(e) {
        errorMsg = 'DNS not found for ' + domainRow.domain;
      }
    }

    if (verified) {
      db.prepare("UPDATE bio_custom_domains SET dns_status = 'verified', error_message = NULL WHERE id = ?").run(domainRow.id);

      // Golden Connect: auto-create k8s Ingress + Certificate via cert-manager.
      let sslOk = false;
      let sslMsg = 'pending';
      try {
        const k8s = require('../k8s-client');
        if (k8s.isAvailable()) {
          await k8s.createIngressForBioDomain(domainRow.domain);
          await k8s.createCertificateForBioDomain(domainRow.domain);
          sslMsg = 'ingress+certificate requested; cert-manager will issue SSL within 1-2 min';
        } else {
          sslMsg = 'k8s SA not mounted; admin must run `node scripts/bio-domain-ingress.js DOMAIN BIO_ID | kubectl apply -f -`';
        }
      } catch (e) {
        sslMsg = 'k8s api error: ' + e.message;
      }

      db.prepare("UPDATE bio_custom_domains SET ssl_status = 'provisioning', error_message = ? WHERE id = ?").run(sslMsg, domainRow.id);

      const updated = db.prepare('SELECT * FROM bio_custom_domains WHERE id = ?').get(domainRow.id);
      res.json({ success: true, domain: updated, verified: true, ssl: sslOk });
    } else {
      db.prepare("UPDATE bio_custom_domains SET dns_status = 'pending', error_message = ? WHERE id = ?").run(errorMsg, domainRow.id);
      res.json({ success: false, verified: false, error: errorMsg || 'DNS not pointing to golden-connect.to. Add CNAME ' + domainRow.domain + ' → golden-connect.to, or A record → 144.217.65.94.' });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/shortener/bio/pages/:id/domain/:did — remove domain
router.delete('/bio/pages/:id/domain/:did', authRequired, (req, res) => {
  try {
    const db = getDb();
    const domainRow = db.prepare('SELECT * FROM bio_custom_domains WHERE id = ? AND user_id = ?').get(req.params.did, req.user.id);
    if (!domainRow) return res.status(404).json({ error: 'Domain not found' });

    // Remove nginx config
    const confPath = '/etc/nginx/conf.d/bio-' + domainRow.domain.replace(/\./g, '-') + '.conf';
    try { fs.unlinkSync(confPath); execSync('nginx -s reload 2>&1', { timeout: 10000 }); } catch(e) {}

    db.prepare('DELETE FROM bio_custom_domains WHERE id = ?').run(domainRow.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

function _generateNginxConf(domain, bioId) {
  const db = getDb();
  const page = db.prepare('SELECT username FROM user_bio_profiles WHERE id = ?').get(bioId);
  const username = page ? page.username : '';
  return 'server {\n' +
    '  listen 443 ssl http2;\n' +
    '  server_name ' + domain + ';\n' +
    '  ssl_certificate /etc/letsencrypt/live/' + domain + '/fullchain.pem;\n' +
    '  ssl_certificate_key /etc/letsencrypt/live/' + domain + '/privkey.pem;\n' +
    '  location / {\n' +
    '    proxy_pass http://127.0.0.1:3001/bio/' + username + ';\n' +
    '    proxy_set_header Host $host;\n' +
    '    proxy_set_header X-Real-IP $remote_addr;\n' +
    '    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n' +
    '    proxy_set_header X-Forwarded-Proto $scheme;\n' +
    '  }\n' +
    '  location /api/ {\n' +
    '    proxy_pass http://127.0.0.1:3001/api/;\n' +
    '    proxy_set_header Host $host;\n' +
    '    proxy_set_header X-Real-IP $remote_addr;\n' +
    '  }\n' +
    '}\n' +
    'server {\n' +
    '  listen 80;\n' +
    '  server_name ' + domain + ';\n' +
    '  return 301 https://$host$request_uri;\n' +
    '}\n';
}

// ===================== END CUSTOM DOMAINS =====================

// ===================== END BIO PAGES API =====================


// ── Upload OG image (base64 dataUrl) ─────────────────────────────────────────
router.post('/upload-og', authRequired, async (req, res) => {
  try {
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid dataUrl' });
    }
    const fs = require('fs');
    const path = require('path');
    const crypto = require('crypto');
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return res.status(400).json({ error: 'Invalid dataUrl format' });
    const ext = match[1] === 'image/png' ? 'png' : 'jpg';
    const buf = Buffer.from(match[2], 'base64');
    const dir = path.join(__dirname, '../../public/uploads/shortener-og');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = crypto.randomBytes(8).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(dir, filename), buf);
    const url = '/uploads/shortener-og/' + filename;
    res.json({ success: true, url });
  } catch (e) {
    console.error('upload-og error:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
