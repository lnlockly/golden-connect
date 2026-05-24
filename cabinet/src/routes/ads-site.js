// Trendex Ads-Site router — banner advertising (Phase 2). Video coming in Phase 3.
//
// Routes (all under /api/ads-site, mounted from web-routes.js):
//   POST   /banner/create               — multipart upload, auth required
//   GET    /banner/list                 — current user's banners + stats
//   GET    /banner/:id/stats            — detailed stats with day breakdown
//   POST   /banner/:id/pause            — pause active banner
//   POST   /banner/:id/resume           — resume paused
//   DELETE /banner/:id                  — soft delete + remove file
//   GET    /banner/serve?slot=<id>&format=<f>  — public ad-server, returns banner JSON
//   POST   /banner/track/impression     — public, body { banner_id, slot }
//   POST   /banner/track/click          — public, body { banner_id }   (also fires from /r redirect)
//   GET    /admin/queue                 — admin only, pending banners
//   POST   /admin/banner/:id/approve    — admin only
//   POST   /admin/banner/:id/reject     — admin only, body { reason }
//   GET    /info                        — public meta: formats, prices

const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dbModule = require('../planner/db/database');
const { processBannerImage, deleteBannerAsset, BANNER_FORMATS, MAX_BANNER_BYTES } = require('../services/secure-upload');
const trxBilling = require('../services/trx-billing');
const trustScore = require('../services/trust-score');
const adModerator = require('../services/ad-moderator'); // [banner-automod-2026-05-17]

const PRICE_BANNER_IMPRESSION = 0.05;   // TRDX per counted impression
const FREQ_CAP_PER_HOUR = 1;            // same banner ≤1 view per IP per hour
const MIN_DAILY_BUDGET = 5;             // can't set lower than 5 TRDX/day
const MAX_DAILY_BUDGET = 50000;
const VIEWER_DAILY_CAP = 200;           // a single IP can earn ≤200 counted impressions/day across all ads (anti-farming)
const ADMIN_TG_IDS = String(process.env.ADMIN_TG_IDS || '424077439,1361064246,248745860')
  .split(',').map(s => Number(s.trim())).filter(Boolean);

function _hashStr(s) {
  return crypto.createHash('sha256').update(String(s || '')).digest('hex').slice(0, 16);
}
function _ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
  return _hashStr(ip || 'unknown');
}
function _uaHash(req) {
  return _hashStr(String(req.headers['user-agent'] || ''));
}
function _todayUtc() { return new Date().toISOString().slice(0, 10); }
function _hourBucket() { return Math.floor(Date.now() / (60 * 60 * 1000)); }

function _isHeadlessUA(ua) {
  if (!ua) return true;  // empty UA = bot
  const s = String(ua).toLowerCase();
  return /headlesschrome|phantomjs|puppeteer|playwright|selenium|wget|curl|python-requests|go-http|axios\/|node-fetch/.test(s);
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function _validUrl(u) {
  try {
    const url = new URL(String(u));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch { return false; }
}

function createAdsSiteRouter({ requireAuth, requireAdmin, storage, bot }) {
  const router = express.Router();

  // multer to memory; we re-encode via sharp anyway
  const upload = multer({
    storage: multer.memoryStorage(),
    // [banner-size-fix-2026-05-16] 10 MB allowance — sharp downscales anyway
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  // ── helpers using runtime db ────────────────────────────────────────────
  function db() { return dbModule.getDb(); }

  function _publicBanner(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      format: row.format,
      image_url: row.image_path
        ? '/cabinet/ads-asset/banner/' + path.basename(row.image_path)
        : null,
      target_url: row.target_url,
      daily_budget_trdx: row.daily_budget_trdx,
      total_budget_trdx: row.total_budget_trdx,
      status: row.status,
      reject_reason: row.reject_reason,
      impressions_total: row.impressions_total,
      clicks_total: row.clicks_total,
      trdx_spent_total: row.trdx_spent_total,
      ctr: row.impressions_total > 0
        ? Math.round((row.clicks_total / row.impressions_total) * 10000) / 100
        : 0,
      created_at: row.created_at,
      approved_at: row.approved_at,
    };
  }

  function _todaySpent(bannerId) {
    const r = db().prepare(
      'SELECT trdx_spent FROM ad_banner_daily_stats WHERE banner_id=? AND day=?'
    ).get(bannerId, _todayUtc());
    return Number(r?.trdx_spent || 0);
  }

  function _viewerCountedToday(ipHash) {
    const r = db().prepare(
      `SELECT COUNT(*) AS c FROM ad_banner_impressions WHERE ip_hash=? AND ts >= ?`
    ).get(ipHash, Date.now() - 24 * 60 * 60 * 1000);
    return Number(r?.c || 0);
  }

  function _isIpBanned(ipHash) {
    const r = db().prepare('SELECT 1 FROM ad_blocked_ips WHERE ip_hash=?').get(ipHash);
    return !!r;
  }

  function _bumpDailyStats(bannerId, { impressions = 0, clicks = 0, trdx = 0 }) {
    const day = _todayUtc();
    db().prepare(`
      INSERT INTO ad_banner_daily_stats (banner_id, day, impressions, clicks, trdx_spent)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(banner_id, day) DO UPDATE SET
        impressions = impressions + excluded.impressions,
        clicks = clicks + excluded.clicks,
        trdx_spent = trdx_spent + excluded.trdx_spent
    `).run(bannerId, day, impressions, clicks, trdx);
  }

  // ───────────────────────────────────────────────────────────────────────
  // PUBLIC: meta
  // ───────────────────────────────────────────────────────────────────────
  router.get('/info', (req, res) => {
    return res.json({
      ok: true,
      banner: {
        formats: Object.keys(BANNER_FORMATS).map(k => ({ id: k, ...BANNER_FORMATS[k] })),
        price_per_impression_trdx: PRICE_BANNER_IMPRESSION,
        max_image_bytes: MAX_BANNER_BYTES,
        min_daily_budget_trdx: MIN_DAILY_BUDGET,
        max_daily_budget_trdx: MAX_DAILY_BUDGET,
        slots: [
          { id: 'cab-top', label: 'Кабинет — баннер сверху', format: '728x90' },
          { id: 'cab-side', label: 'Кабинет — sidebar', format: '160x600' },
          { id: 'bio-top', label: 'Bio-страницы', format: '300x250' },
          { id: 'shop-grid', label: 'Между карточками shop', format: '300x250' },
          { id: 'mobile-sticky', label: 'Sticky-bottom (моб.)', format: 'sticky-bottom' },
        ],
      },
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // CREATE banner — auth required
  // ───────────────────────────────────────────────────────────────────────
  router.post('/banner/create', requireAuth, upload.single('image'), async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false, reason: 'auth' });
      if (!req.file || !req.file.buffer) return res.status(400).json({ ok: false, reason: 'no_image' });

      const name = String(req.body.name || '').trim().slice(0, 80) || 'Без названия';
      const format = String(req.body.format || '').trim();
      const targetUrl = String(req.body.target_url || '').trim();
      const dailyBudget = Math.min(MAX_DAILY_BUDGET, Math.max(MIN_DAILY_BUDGET, Number(req.body.daily_budget_trdx) || MIN_DAILY_BUDGET));
      const totalBudget = req.body.total_budget_trdx != null && Number(req.body.total_budget_trdx) > 0
        ? Number(req.body.total_budget_trdx)
        : null;

      if (!BANNER_FORMATS[format]) return res.status(400).json({ ok: false, reason: 'bad_format', detail: 'Unknown format ' + format });
      if (!_validUrl(targetUrl)) return res.status(400).json({ ok: false, reason: 'bad_url' });

      // Quota: max 5 active banners per user (for sanity / not a hard requirement, but keeps things tidy)
      const activeCount = db().prepare(
        `SELECT COUNT(*) AS c FROM ad_banners WHERE user_id=? AND deleted_at IS NULL AND status IN ('pending','active','paused')`
      ).get(u.id)?.c || 0;
      if (activeCount >= 20) return res.status(429).json({ ok: false, reason: 'quota', detail: 'Слишком много активных баннеров. Удали неактуальные.' });

      // Process image (virus scan + sharp re-encode)
      let asset;
      try {
        asset = await processBannerImage(req.file.buffer, { format, userId: u.id, originalName: req.file.originalname }); // [virus-scan-orig-2026-05-17]
      } catch (e) {
        const detail = e && e.message;
        const code = (e && e.code) || 'UNKNOWN';
        return res.status(400).json({ ok: false, reason: 'image_failed', code, detail });
      }

      // [banner-automod-2026-05-17] AI auto-moderation (Groq vision) → falls back to trust-score
      const trust = trustScore.evaluate(u.id);
      let ai = { ok: false, verdict: 'review', risk_score: 50, reasons: ['ai_unavailable'], categories: {} };
      try {
        ai = await adModerator.moderateBanner({
          imagePath: asset.path, name, targetUrl, format,
        });
      } catch (e) {
        console.error('[ads-site] ai moderate failed:', e && e.message);
      }
      const decision = adModerator.decide({ trustDecision: trust.decision, ai });
      const status = decision.status;
      const approvedAt = decision.approvedAt;

      const result = db().prepare(`
        INSERT INTO ad_banners (user_id, name, format, image_path, target_url,
          daily_budget_trdx, total_budget_trdx, status, trust_decision, approved_at,
          reject_reason, ai_verdict, ai_risk_score, ai_reasons, ai_categories, ai_source)
        VALUES (?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?)
      `).run(
        u.id, name, format, asset.path, targetUrl, dailyBudget, totalBudget,
        status, trust.decision, approvedAt,
        decision.rejectReason, ai.verdict || null, Math.round(ai.risk_score || 0),
        JSON.stringify(ai.reasons || []), JSON.stringify(ai.categories || {}),
        decision.source,
      );

      const bannerId = result.lastInsertRowid;

      // Notify admins ONLY when human review still needed (status=pending).
      // AI-approved or AI-rejected → no spam, but still log a summary line
      // for ai_reject so admin can audit.
      if (status === 'pending' && bot && bot.api && ADMIN_TG_IDS.length) {
        const aiLine = ai.ok
          ? `🤖 AI: ${ai.verdict} · risk ${Math.round(ai.risk_score)} · ${(ai.reasons[0] || 'no-flags')}`
          : `🤖 AI: unavailable (${ai.reasons[0] || 'unknown'}) — fallback to trust-score`;
        const msg = `📥 <b>Новый баннер на модерацию</b>\n\n`
          + `Юзер: <b>${(u.displayName || u.email || u.id)}</b>\n`
          + `Формат: ${format}\n`
          + `URL: ${targetUrl}\n`
          + `Бюджет: ${dailyBudget} TRDX/день\n`
          + `${aiLine}\n\n`
          + `Открыть → /admin/ads-moderation`;
        for (const adminId of ADMIN_TG_IDS) {
          bot.api.sendMessage(adminId, msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
        }
      }
      if (status === 'rejected' && bot && bot.api && ADMIN_TG_IDS.length) {
        // [banner-automod-2026-05-17] log AI-rejection so admin can audit false-positives
        const msg = `🚫 <b>AI отклонил баннер</b>\n\n`
          + `Юзер: <b>${(u.displayName || u.email || u.id)}</b>\n`
          + `Причина: ${decision.rejectReason}\n`
          + `Risk: ${Math.round(ai.risk_score)}/100\n`
          + `Reasons: ${(ai.reasons || []).join('; ')}\n\n`
          + `Открыть → /admin/ads-moderation`;
        for (const adminId of ADMIN_TG_IDS) {
          bot.api.sendMessage(adminId, msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
        }
      }

      const banner = db().prepare('SELECT * FROM ad_banners WHERE id=?').get(bannerId);
      return res.json({ ok: true, banner: _publicBanner(banner), trust });
    } catch (e) {
      console.error('[ads-site] banner/create:', e && e.message);
      return res.status(500).json({ ok: false, reason: 'internal' });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // LIST current user's banners
  // ───────────────────────────────────────────────────────────────────────
  router.get('/banner/list', requireAuth, (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const rows = db().prepare(
      `SELECT * FROM ad_banners WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC`
    ).all(u.id);
    return res.json({ ok: true, banners: rows.map(_publicBanner) });
  });

  // ───────────────────────────────────────────────────────────────────────
  // STATS — last 30 days breakdown
  // ───────────────────────────────────────────────────────────────────────
  router.get('/banner/:id/stats', requireAuth, (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const id = Number(req.params.id);
    const banner = db().prepare(`SELECT * FROM ad_banners WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, u.id);
    if (!banner) return res.status(404).json({ ok: false, reason: 'not_found' });
    const daily = db().prepare(
      `SELECT day, impressions, clicks, trdx_spent FROM ad_banner_daily_stats WHERE banner_id=? ORDER BY day DESC LIMIT 30`
    ).all(id);
    const todaySpent = _todaySpent(id);
    return res.json({ ok: true, banner: _publicBanner(banner), daily, today_spent: todaySpent });
  });

  // ───────────────────────────────────────────────────────────────────────
  // PAUSE / RESUME / DELETE
  // ───────────────────────────────────────────────────────────────────────
  function _findOwn(req, res) {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) { res.status(401).json({ ok: false }); return null; }
    const id = Number(req.params.id);
    const b = db().prepare(`SELECT * FROM ad_banners WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, u.id);
    if (!b) { res.status(404).json({ ok: false, reason: 'not_found' }); return null; }
    return { user: u, banner: b };
  }

  router.post('/banner/:id/pause', requireAuth, (req, res) => {
    const ctx = _findOwn(req, res); if (!ctx) return;
    if (ctx.banner.status !== 'active') return res.status(400).json({ ok: false, reason: 'not_active' });
    db().prepare(`UPDATE ad_banners SET status='paused', paused_at=datetime('now') WHERE id=?`).run(ctx.banner.id);
    return res.json({ ok: true });
  });

  router.post('/banner/:id/resume', requireAuth, (req, res) => {
    const ctx = _findOwn(req, res); if (!ctx) return;
    if (ctx.banner.status !== 'paused') return res.status(400).json({ ok: false, reason: 'not_paused' });
    db().prepare(`UPDATE ad_banners SET status='active', paused_at=NULL WHERE id=?`).run(ctx.banner.id);
    return res.json({ ok: true });
  });

  router.delete('/banner/:id', requireAuth, async (req, res) => {
    const ctx = _findOwn(req, res); if (!ctx) return;
    db().prepare(`UPDATE ad_banners SET deleted_at=datetime('now'), status='deleted' WHERE id=?`).run(ctx.banner.id);
    // Best-effort: also remove the file from disk (we soft-delete the row but kill the asset).
    if (ctx.banner.image_path) await deleteBannerAsset(ctx.banner.image_path).catch(() => {});
    return res.json({ ok: true });
  });

  // ───────────────────────────────────────────────────────────────────────
  // SERVE — public ad-server endpoint
  // ───────────────────────────────────────────────────────────────────────
  router.get('/banner/serve', (req, res) => {
    try {
      const slot = String(req.query.slot || '').slice(0, 32);
      const format = String(req.query.format || '').slice(0, 32);
      if (!slot || !BANNER_FORMATS[format]) return res.json({ ok: true, banner: null });

      const ipH = _ipHash(req);
      const uaH = _uaHash(req);
      if (_isIpBanned(ipH)) return res.json({ ok: true, banner: null, reason: 'ip_banned' });
      if (_isHeadlessUA(req.headers['user-agent'])) return res.json({ ok: true, banner: null, reason: 'bot' });

      // Candidates: active, format-match, not over budget today.
      const cands = db().prepare(`
        SELECT b.*,
          COALESCE((SELECT trdx_spent FROM ad_banner_daily_stats s WHERE s.banner_id=b.id AND s.day=?), 0) AS today_spent
        FROM ad_banners b
        WHERE b.deleted_at IS NULL AND b.status='active' AND b.format=?
      `).all(_todayUtc(), format);

      // Filter by daily budget remaining + freq cap + advertiser TRDX balance
      const eligible = [];
      const hourBucket = _hourBucket();
      for (const c of cands) {
        if (Number(c.today_spent) >= Number(c.daily_budget_trdx)) continue;
        if (c.total_budget_trdx != null && Number(c.trdx_spent_total) >= Number(c.total_budget_trdx)) continue;

        // Advertiser must have TRDX balance ≥ price.
        const balance = storage.getTrxBalance ? storage.getTrxBalance(c.user_id) : 0;
        if (balance < PRICE_BANNER_IMPRESSION) continue;

        // Frequency cap.
        const freq = db().prepare(
          `SELECT shown FROM ad_banner_freq WHERE banner_id=? AND ip_hash=? AND hour_bucket=?`
        ).get(c.id, ipH, hourBucket);
        if (freq && freq.shown >= FREQ_CAP_PER_HOUR) continue;

        eligible.push(c);
      }
      if (!eligible.length) return res.json({ ok: true, banner: null });

      // Weighted random by remaining daily budget — banner with more budget wins more often.
      const weights = eligible.map(c => Math.max(1, Number(c.daily_budget_trdx) - Number(c.today_spent)));
      const total = weights.reduce((a, b) => a + b, 0);
      let pick = Math.random() * total;
      let chosen = eligible[0];
      for (let i = 0; i < eligible.length; i++) {
        pick -= weights[i];
        if (pick <= 0) { chosen = eligible[i]; break; }
      }

      // Reserve frequency slot pre-emptively (we'll only count the impression
      // when the client confirms via /track/impression).
      db().prepare(`
        INSERT INTO ad_banner_freq (banner_id, ip_hash, hour_bucket, shown)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(banner_id, ip_hash, hour_bucket) DO UPDATE SET shown = shown + 1
      `).run(chosen.id, ipH, hourBucket);

      return res.json({
        ok: true,
        banner: {
          id: chosen.id,
          format: chosen.format,
          width: (BANNER_FORMATS[chosen.format] || {}).w || null,   /* [ad-loader-rework-2026-05-21] */
          height: (BANNER_FORMATS[chosen.format] || {}).h || null,
          image_url: '/cabinet/ads-asset/banner/' + path.basename(chosen.image_path),
          click_url: '/r/banner/' + chosen.id,
        },
      });
    } catch (e) {
      console.error('[ads-site] serve:', e && e.message);
      return res.status(500).json({ ok: false });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // TRACK impression (called by client when banner is ≥50% visible ≥1s)
  // ───────────────────────────────────────────────────────────────────────
  router.post('/banner/track/impression', (req, res) => {
    try {
      const bannerId = Number(req.body && req.body.banner_id);
      const slot = String((req.body && req.body.slot) || '').slice(0, 32);
      if (!bannerId) return res.json({ ok: false, reason: 'no_id' });

      const ipH = _ipHash(req);
      const uaH = _uaHash(req);
      if (_isIpBanned(ipH)) return res.json({ ok: false, reason: 'ip_banned' });
      if (_isHeadlessUA(req.headers['user-agent'])) return res.json({ ok: false, reason: 'bot' });

      const banner = db().prepare(`SELECT * FROM ad_banners WHERE id=? AND deleted_at IS NULL AND status='active'`).get(bannerId);
      if (!banner) return res.json({ ok: false, reason: 'not_active' });

      // Anti-farm: viewer cap per day.
      if (_viewerCountedToday(ipH) >= VIEWER_DAILY_CAP) return res.json({ ok: false, reason: 'viewer_cap' });

      // Daily-budget recheck.
      const todaySpent = _todaySpent(bannerId);
      if (todaySpent + PRICE_BANNER_IMPRESSION > Number(banner.daily_budget_trdx)) return res.json({ ok: false, reason: 'budget_today' });
      if (banner.total_budget_trdx != null && Number(banner.trdx_spent_total) + PRICE_BANNER_IMPRESSION > Number(banner.total_budget_trdx)) {
        db().prepare(`UPDATE ad_banners SET status='exhausted' WHERE id=?`).run(bannerId);
        return res.json({ ok: false, reason: 'budget_total' });
      }

      // Charge advertiser. If insufficient — pause banner.
      const charge = trxBilling.tryCharge(banner.user_id, PRICE_BANNER_IMPRESSION,
        'banner_impression', { refUserId: req.session?.userId || null });
      if (!charge.ok) {
        db().prepare(`UPDATE ad_banners SET status='paused', paused_at=datetime('now') WHERE id=?`).run(bannerId);
        return res.json({ ok: false, reason: 'no_balance' });
      }

      // Log impression + bump counters.
      db().prepare(`
        INSERT INTO ad_banner_impressions (banner_id, viewer_user_id, ip_hash, ua_hash, slot, page_host, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(bannerId, req.session?.userId || null, ipH, uaH, slot,
              String(req.headers['origin'] || '').slice(0, 100), Date.now());
      db().prepare(`
        UPDATE ad_banners SET impressions_total = impressions_total + 1,
                              trdx_spent_total = trdx_spent_total + ? WHERE id=?
      `).run(PRICE_BANNER_IMPRESSION, bannerId);
      _bumpDailyStats(bannerId, { impressions: 1, trdx: PRICE_BANNER_IMPRESSION });

      return res.json({ ok: true });
    } catch (e) {
      console.error('[ads-site] track/impression:', e && e.message);
      return res.status(500).json({ ok: false });
    }
  });

  // ───────────────────────────────────────────────────────────────────────
  // TRACK click (also called from /r/banner/:id redirect handler)
  // ───────────────────────────────────────────────────────────────────────
  function _logClick(bannerId, req) {
    const ipH = _ipHash(req);
    const uaH = _uaHash(req);
    if (_isIpBanned(ipH)) return false;
    db().prepare(`
      INSERT INTO ad_banner_clicks (banner_id, viewer_user_id, ip_hash, ua_hash, ts)
      VALUES (?, ?, ?, ?, ?)
    `).run(bannerId, req.session?.userId || null, ipH, uaH, Date.now());
    db().prepare(`UPDATE ad_banners SET clicks_total = clicks_total + 1 WHERE id=?`).run(bannerId);
    _bumpDailyStats(bannerId, { clicks: 1 });
    return true;
  }

  router.post('/banner/track/click', (req, res) => {
    const bannerId = Number(req.body && req.body.banner_id);
    if (!bannerId) return res.json({ ok: false });
    _logClick(bannerId, req);
    return res.json({ ok: true });
  });

  // ───────────────────────────────────────────────────────────────────────
  // ADMIN
  // ───────────────────────────────────────────────────────────────────────
  router.get('/admin/queue', requireAdmin, (req, res) => {
    const rows = db().prepare(
      `SELECT b.*, w.email FROM ad_banners b LEFT JOIN users w ON w.id=b.user_id
       WHERE b.deleted_at IS NULL AND b.status='pending' ORDER BY b.created_at DESC LIMIT 200`
    ).all();
    return res.json({ ok: true, banners: rows.map(r => ({ ..._publicBanner(r), email: r.email })) });
  });

  router.post('/admin/banner/:id/approve', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const adminId = req.adminUser?.id || req.webUser?.id || null;
    db().prepare(`UPDATE ad_banners SET status='active', approved_at=datetime('now'), reviewed_by=? WHERE id=?`)
      .run(adminId, id);
    return res.json({ ok: true });
  });

  router.post('/admin/banner/:id/reject', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || '').slice(0, 200) || 'не указана';
    const adminId = req.adminUser?.id || req.webUser?.id || null;
    db().prepare(`UPDATE ad_banners SET status='rejected', reject_reason=?, reviewed_by=? WHERE id=?`)
      .run(reason, adminId, id);
    return res.json({ ok: true });
  });

  // Click redirect helper exposed for server.js to mount at /r/banner/:id (outside /api)
  function clickRedirectHandler(req, res) {
    const id = Number(req.params.id);
    const banner = db().prepare(`SELECT id, target_url FROM ad_banners WHERE id=? AND deleted_at IS NULL`).get(id);
    if (!banner) return res.status(404).type('text/plain').send('not found');
    _logClick(id, req);
    return res.redirect(302, banner.target_url);
  }

  // ─────────────────────────────────────────────────────────────────────
  // VIDEO ADVERTISING — Phase 3 /* [video-routes] */
  // ─────────────────────────────────────────────────────────────────────
  const path2 = require('path');
  const fs2 = require('fs');
  const videoPipeline = require('../services/video-pipeline');

  const PRICE_VIDEO_VIEW = 0.10;            // TRDX per ≥10s view
  const FORCE_WATCH_COOLDOWN_HOURS = 6;     // 1 forced video per visitor per 6h
  const FORCE_WATCH_MIN_SEC = 10;           // counts as view after 10s watched
  const VIDEO_MAX_PER_DAY = 2;
  const VIDEO_MAX_STORED = 5;

  const uploadVideo = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, videoPipeline.ADS_TMP_DIR),
      filename:    (req, file, cb) => cb(null, 'vid_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + path2.extname(file.originalname || '').slice(0, 6).replace(/[^.a-zA-Z0-9]/g, '')),
    }),
    limits: { fileSize: videoPipeline.MAX_INPUT_BYTES, files: 1 },
  });

  function _publicVideo(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      target_url: row.target_url,
      video_url: row.video_path ? '/cabinet/ads-asset/video/' + path2.basename(row.video_path) : null,
      thumb_url: row.thumbnail_path ? '/cabinet/ads-asset/video/thumb/' + path2.basename(row.thumbnail_path) : null,
      duration_sec: row.duration_sec,
      daily_budget_trdx: row.daily_budget_trdx,
      total_budget_trdx: row.total_budget_trdx,
      status: row.status,
      reject_reason: row.reject_reason,
      process_error: row.process_error,
      impressions_total: row.impressions_total,
      clicks_total: row.clicks_total,
      trdx_spent_total: row.trdx_spent_total,
      ctr: row.impressions_total > 0 ? Math.round((row.clicks_total / row.impressions_total) * 10000) / 100 : 0,
      created_at: row.created_at,
      approved_at: row.approved_at,
    };
  }

  function _todayVideoUploads(userId) {
    const r = db().prepare(`SELECT videos_uploaded FROM ad_user_quota WHERE user_id=? AND day=?`)
      .get(userId, _todayUtc());
    return Number(r?.videos_uploaded || 0);
  }
  function _bumpVideoQuota(userId) {
    db().prepare(`
      INSERT INTO ad_user_quota (user_id, day, videos_uploaded, banners_uploaded)
      VALUES (?, ?, 1, 0)
      ON CONFLICT(user_id, day) DO UPDATE SET videos_uploaded = videos_uploaded + 1
    `).run(userId, _todayUtc());
  }
  function _activeVideosCount(userId) {
    return Number(db().prepare(
      `SELECT COUNT(*) AS c FROM ad_videos WHERE user_id=? AND deleted_at IS NULL AND status NOT IN ('failed','rejected','deleted')`
    ).get(userId)?.c || 0);
  }

  // ── Tariff gate: only paid tariffs can upload videos
  router.post('/video/upload', requireAuth, async (req, res, next) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false, reason: 'auth' });
    // [trust-tariff-fix] await canUploadVideoAsync so a cold tariff cache
    // doesn't falsely reject paid users on their first /ads-site visit.
    if (!(await trustScore.canUploadVideoAsync(u.id))) {
      return res.status(403).json({ ok: false, reason: 'tariff_required',
        detail: 'Видео-реклама доступна только тарифам LAUNCH/BOOST/ROCKET. Купи тариф в /cabinet#/marketing.' });
    }
    if (_todayVideoUploads(u.id) >= VIDEO_MAX_PER_DAY) {
      return res.status(429).json({ ok: false, reason: 'daily_quota',
        detail: `Лимит ${VIDEO_MAX_PER_DAY} загрузки в сутки исчерпан. Попробуй завтра.` });
    }
    if (_activeVideosCount(u.id) >= VIDEO_MAX_STORED) {
      return res.status(429).json({ ok: false, reason: 'stored_quota',
        detail: `Хранится максимум ${VIDEO_MAX_STORED} видео. Удали старое чтобы загрузить новое.` });
    }
    return next();
  }, uploadVideo.single('video'), async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!req.file || !req.file.path) return res.status(400).json({ ok: false, reason: 'no_video' });

      const title = String(req.body.title || '').trim().slice(0, 80) || 'Без названия';
      const description = String(req.body.description || '').trim().slice(0, 500);
      const targetUrl = String(req.body.target_url || '').trim();
      const dailyBudget = Math.min(MAX_DAILY_BUDGET, Math.max(MIN_DAILY_BUDGET, Number(req.body.daily_budget_trdx) || 100));
      const totalBudget = req.body.total_budget_trdx != null && Number(req.body.total_budget_trdx) > 0
        ? Number(req.body.total_budget_trdx) : null;

      if (!_validUrl(targetUrl)) {
        fs2.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ ok: false, reason: 'bad_url' });
      }

      const trust = trustScore.evaluate(u.id);

      const result = db().prepare(`
        INSERT INTO ad_videos (user_id, title, description, target_url, video_path,
          daily_budget_trdx, total_budget_trdx, status, trust_decision)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(u.id, title, description, targetUrl, req.file.path,
              dailyBudget, totalBudget, 'uploading', trust.decision);
      const videoId = result.lastInsertRowid;

      _bumpVideoQuota(u.id);

      // Fire-and-forget transcode pipeline.
      videoPipeline.enqueue(videoId);

      // Notify admins if pending
      if (trust.decision !== 'trusted' && bot && bot.api && ADMIN_TG_IDS.length) {
        const msg = `🎬 <b>Новое видео на модерацию (после транскодинга)</b>\n\n`
          + `Юзер: <b>${escapeHtml(u.displayName || u.email || u.id)}</b>\n`
          + `Заголовок: ${escapeHtml(title)}\n`
          + `URL: ${targetUrl}\n`
          + `Бюджет: ${dailyBudget} TRDX/день`;
        for (const adminId of ADMIN_TG_IDS) {
          bot.api.sendMessage(adminId, msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
        }
      }

      const video = db().prepare('SELECT * FROM ad_videos WHERE id=?').get(videoId);
      return res.json({ ok: true, video: _publicVideo(video), trust,
        note: 'Видео загружено и отправлено на обработку (транскодинг 30-60 сек). Обнови список через минуту.' });
    } catch (e) {
      if (req.file?.path) fs2.promises.unlink(req.file.path).catch(() => {});
      console.error('[ads-site] video upload:', e && e.message);
      return res.status(500).json({ ok: false, reason: 'internal' });
    }
  });

  router.get('/video/list', requireAuth, async (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const rows = db().prepare(
      `SELECT * FROM ad_videos WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC`
    ).all(u.id);
    const tariffOk = await trustScore.canUploadVideoAsync(u.id);
    const todayUploads = _todayVideoUploads(u.id);
    const activeCount = _activeVideosCount(u.id);
    return res.json({
      ok: true,
      videos: rows.map(_publicVideo),
      can_upload: tariffOk,
      quota: { today: todayUploads, daily_max: VIDEO_MAX_PER_DAY, active: activeCount, stored_max: VIDEO_MAX_STORED },
    });
  });

  router.get('/video/:id/stats', requireAuth, (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const id = Number(req.params.id);
    const v = db().prepare(`SELECT * FROM ad_videos WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, u.id);
    if (!v) return res.status(404).json({ ok: false, reason: 'not_found' });
    const views = Number(db().prepare(`SELECT COUNT(*) AS c FROM ad_video_views WHERE video_id=? AND counted=1`).get(id)?.c || 0);
    return res.json({ ok: true, video: _publicVideo(v), counted_views: views });
  });

  router.post('/video/:id/pause', requireAuth, (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const id = Number(req.params.id);
    const r = db().prepare(`UPDATE ad_videos SET status='paused', paused_at=datetime('now') WHERE id=? AND user_id=? AND status='active'`).run(id, u.id);
    return res.json({ ok: r.changes > 0 });
  });
  router.post('/video/:id/resume', requireAuth, (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const id = Number(req.params.id);
    const r = db().prepare(`UPDATE ad_videos SET status='active', paused_at=NULL WHERE id=? AND user_id=? AND status='paused'`).run(id, u.id);
    return res.json({ ok: r.changes > 0 });
  });

  router.delete('/video/:id', requireAuth, async (req, res) => {
    const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
    if (!u) return res.status(401).json({ ok: false });
    const id = Number(req.params.id);
    const v = db().prepare(`SELECT * FROM ad_videos WHERE id=? AND user_id=? AND deleted_at IS NULL`).get(id, u.id);
    if (!v) return res.status(404).json({ ok: false, reason: 'not_found' });
    db().prepare(`UPDATE ad_videos SET deleted_at=datetime('now'), status='deleted' WHERE id=?`).run(id);
    await videoPipeline.deleteVideoAssets(v);
    return res.json({ ok: true });
  });

  // ── ADMIN ─────────────────────────────────────────────────────────────
  router.get('/admin/video/queue', requireAdmin, (req, res) => {
    const rows = db().prepare(
      `SELECT v.*, u.email FROM ad_videos v LEFT JOIN users u ON u.id=v.user_id
       WHERE v.deleted_at IS NULL AND v.status='pending' ORDER BY v.created_at DESC LIMIT 200`
    ).all();
    return res.json({ ok: true, videos: rows.map(r => ({ ..._publicVideo(r), email: r.email })) });
  });
  router.post('/admin/video/:id/approve', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    db().prepare(`UPDATE ad_videos SET status='active', approved_at=datetime('now'), reviewed_by=? WHERE id=?`)
      .run(req.webUser?.id || null, id);
    return res.json({ ok: true });
  });
  router.post('/admin/video/:id/reject', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const reason = String(req.body?.reason || '').slice(0, 200) || 'не указана';
    db().prepare(`UPDATE ad_videos SET status='rejected', reject_reason=?, reviewed_by=? WHERE id=?`)
      .run(reason, req.webUser?.id || null, id);
    return res.json({ ok: true });
  });

  // ── FORCE-WATCH trigger (public) ──────────────────────────────────────
  // Returns { show: true|false, video: {...} } — client opens modal if show=true.
  router.get('/video/should-show', (req, res) => {
    try {
      const userId = req.session?.userId || null;
      const ipH = _ipHash(req);
      // Tariff gate: skip force-watch for paid users + don't force on bots
      if (userId && trustScore.canUploadVideo(userId)) return res.json({ ok: true, show: false, reason: 'paid_tariff' });
      if (_isHeadlessUA(req.headers['user-agent'])) return res.json({ ok: true, show: false, reason: 'bot' });
      if (_isIpBanned(ipH)) return res.json({ ok: true, show: false, reason: 'ip_banned' });

      // Cooldown: if shown within FORCE_WATCH_COOLDOWN_HOURS — skip
      const cutoff = Date.now() - FORCE_WATCH_COOLDOWN_HOURS * 60 * 60 * 1000;
      const visitorToken = _hashStr(ipH + ':' + _uaHash(req)).slice(0, 24);
      const recent = db().prepare(`
        SELECT id FROM ad_video_force_log
        WHERE shown_at >= ? AND (
          (? IS NOT NULL AND viewer_user_id = ?)
          OR (? IS NULL AND visitor_token = ?)
        )
        LIMIT 1
      `).get(cutoff, userId, userId, userId, visitorToken);
      if (recent) return res.json({ ok: true, show: false, reason: 'cooldown' });

      // Pick random active video with budget remaining
      const cands = db().prepare(`
        SELECT v.*,
          -- [trdx-spent-fix] ad_video_views has no trdx_spent column;
          -- derive today's TRDX spend from counted views * PRICE_VIDEO_VIEW (0.10).
          COALESCE((SELECT SUM(counted) * ${PRICE_VIDEO_VIEW} FROM ad_video_views vv WHERE vv.video_id=v.id AND vv.started_at >= ?), 0) AS today_spent
        FROM ad_videos v
        WHERE v.deleted_at IS NULL AND v.status='active'
      `).all(Date.now() - 24 * 60 * 60 * 1000);

      const eligible = [];
      for (const c of cands) {
        // Skip if advertiser balance too low
        const balance = storage.getTrxBalance ? storage.getTrxBalance(c.user_id) : 0;
        if (balance < PRICE_VIDEO_VIEW) continue;
        // Daily budget check (rough — based on impressions × price; cleaner aggregation in future)
        const todayBurn = (c.today_spent || 0);
        if (todayBurn >= Number(c.daily_budget_trdx)) continue;
        eligible.push(c);
      }
      if (!eligible.length) return res.json({ ok: true, show: false, reason: 'no_inventory' });

      const weights = eligible.map(c => Math.max(1, Number(c.daily_budget_trdx)));
      const total = weights.reduce((a, b) => a + b, 0);
      let pick = Math.random() * total;
      let chosen = eligible[0];
      for (let i = 0; i < eligible.length; i++) { pick -= weights[i]; if (pick <= 0) { chosen = eligible[i]; break; } }

      // Insert force-log row immediately so we honour cooldown even if viewer doesn't watch.
      db().prepare(`
        INSERT INTO ad_video_force_log (viewer_user_id, visitor_token, video_id, shown_at, watched_seconds, clicked)
        VALUES (?, ?, ?, ?, 0, 0)
      `).run(userId, visitorToken, chosen.id, Date.now());

      return res.json({
        ok: true,
        show: true,
        video: {
          id: chosen.id,
          title: chosen.title,
          description: chosen.description,
          target_url: chosen.target_url,
          video_url: '/cabinet/ads-asset/video/' + path2.basename(chosen.video_path),
          thumb_url: chosen.thumbnail_path ? '/cabinet/ads-asset/video/thumb/' + path2.basename(chosen.thumbnail_path) : null,
          duration_sec: chosen.duration_sec,
          min_watch_sec: FORCE_WATCH_MIN_SEC,
        },
      });
    } catch (e) {
      console.error('[ads-site] should-show:', e && e.message);
      return res.json({ ok: true, show: false });
    }
  });

  // Heartbeat — called every 2 sec by client. Once watch_seconds≥10 we count.
  router.post('/video/track/heartbeat', (req, res) => {
    try {
      const videoId = Number(req.body && req.body.video_id);
      const watch = Math.max(0, Math.min(600, Number(req.body && req.body.watch_seconds) || 0));
      if (!videoId) return res.json({ ok: false });
      const ipH = _ipHash(req);
      if (_isIpBanned(ipH)) return res.json({ ok: false });
      const uaH = _uaHash(req);

      const v = db().prepare(`SELECT * FROM ad_videos WHERE id=? AND deleted_at IS NULL AND status='active'`).get(videoId);
      if (!v) return res.json({ ok: false });

      // Find or create the view row keyed by (video, ip, started today)
      const startWin = Date.now() - 24 * 60 * 60 * 1000;
      let view = db().prepare(`
        SELECT * FROM ad_video_views WHERE video_id=? AND ip_hash=? AND started_at >= ? ORDER BY id DESC LIMIT 1
      `).get(videoId, ipH, startWin);
      if (!view) {
        const r = db().prepare(`
          INSERT INTO ad_video_views (video_id, viewer_user_id, ip_hash, ua_hash, watch_seconds, counted, clicked, started_at, last_heartbeat_at)
          VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?)
        `).run(videoId, req.session?.userId || null, ipH, uaH, Date.now(), Date.now());
        view = { id: r.lastInsertRowid, watch_seconds: 0, counted: 0 };
      }

      const newWatch = Math.max(Number(view.watch_seconds || 0), watch);
      db().prepare(`UPDATE ad_video_views SET watch_seconds=?, last_heartbeat_at=? WHERE id=?`).run(newWatch, Date.now(), view.id);

      // Update force-log progress
      db().prepare(`
        UPDATE ad_video_force_log SET watched_seconds = MAX(watched_seconds, ?)
        WHERE video_id=? AND shown_at >= ? ORDER BY id DESC
      `).run(newWatch, videoId, startWin);

      // Cross 10s threshold → count + charge
      if (!view.counted && newWatch >= FORCE_WATCH_MIN_SEC) {
        // Anti-farm cap (per-IP daily counted views)
        const todayCounted = Number(db().prepare(`
          SELECT COUNT(*) AS c FROM ad_video_views WHERE ip_hash=? AND counted=1 AND started_at >= ?
        `).get(ipH, startWin)?.c || 0);
        if (todayCounted >= 50) return res.json({ ok: true, counted: false, reason: 'viewer_cap' });

        // Daily budget recheck
        const todayBurn = Number(db().prepare(`
          SELECT IFNULL(SUM(0.10), 0) AS s FROM ad_video_views WHERE video_id=? AND counted=1 AND started_at >= ?
        `).get(videoId, startWin)?.s || 0);
        if (todayBurn + PRICE_VIDEO_VIEW > Number(v.daily_budget_trdx)) return res.json({ ok: true, counted: false, reason: 'budget_today' });

        const charge = trxBilling.tryCharge(v.user_id, PRICE_VIDEO_VIEW, 'video_view',
          { refUserId: req.session?.userId || null });
        if (!charge.ok) {
          db().prepare(`UPDATE ad_videos SET status='paused', paused_at=datetime('now') WHERE id=?`).run(videoId);
          return res.json({ ok: true, counted: false, reason: 'no_balance' });
        }
        db().prepare(`UPDATE ad_video_views SET counted=1 WHERE id=?`).run(view.id);
        db().prepare(`UPDATE ad_videos SET impressions_total = impressions_total + 1, trdx_spent_total = trdx_spent_total + ? WHERE id=?`)
          .run(PRICE_VIDEO_VIEW, videoId);
        return res.json({ ok: true, counted: true });
      }
      return res.json({ ok: true, counted: false });
    } catch (e) {
      console.error('[ads-site] heartbeat:', e && e.message);
      return res.json({ ok: false });
    }
  });

  // Click tracking for video CTAs
  router.post('/video/track/click', (req, res) => {
    const videoId = Number(req.body && req.body.video_id);
    if (!videoId) return res.json({ ok: false });
    const ipH = _ipHash(req);
    if (_isIpBanned(ipH)) return res.json({ ok: false });
    const v = db().prepare(`SELECT id, target_url FROM ad_videos WHERE id=? AND deleted_at IS NULL`).get(videoId);
    if (!v) return res.json({ ok: false });
    db().prepare(`UPDATE ad_videos SET clicks_total = clicks_total + 1 WHERE id=?`).run(videoId);
    db().prepare(`UPDATE ad_video_views SET clicked=1 WHERE video_id=? AND ip_hash=? AND counted=1 AND clicked=0`).run(videoId, ipH);
    db().prepare(`UPDATE ad_video_force_log SET clicked=1 WHERE video_id=? AND shown_at >= ?`).run(videoId, Date.now() - 60 * 60 * 1000);
    return res.json({ ok: true, target_url: v.target_url });
  });

  router._clickRedirectHandler = clickRedirectHandler;

  // [banner-size-fix-2026-05-16] friendly multer-error handler so the
  // frontend sees a JSON error instead of fetch() throwing on a reset
  // connection. Without this, multer.LIMIT_FILE_SIZE breaks the TCP
  // stream → frontend shows "Сеть упала" generic catch.
  router.use((err, req, res, next) => {
    if (err && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        reason: 'too_big',
        detail: 'Файл больше 10 МБ. Сожмите изображение или сохраните в JPG.',
      });
    }
    if (err && err.name === 'MulterError') {
      return res.status(400).json({ ok: false, reason: 'upload_error', detail: err.message || err.code });
    }
    next(err);
  });

  return router;
}

module.exports = { createAdsSiteRouter };
