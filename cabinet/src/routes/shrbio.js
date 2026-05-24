// Golden Connect Shortener + Bio routers — Phase B (full Arsenal port via shims).
const express = require('express');
const dbModule = require('../planner/db/database');
const arsenalShortener = require('./shortener-arsenal');
const arsenalRedirect  = require('./shortener-redirect-arsenal');
const arsenalProducts  = require('./products-arsenal');

function plannerUserFor(rawDb, webUser) {
  let u;
  if (webUser.telegramUserId) {
    u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(Number(webUser.telegramUserId));
    if (u) return u;
  }
  const synth = -Math.abs(Number(webUser.id));
  u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(synth);
  if (u) return u;
  return dbModule.ensureUser({
    id: synth,
    username: (webUser.email || 'user').split('@')[0],
    first_name: webUser.displayName || webUser.email || ('User ' + webUser.id),
  });
}

// Inject req.user (Arsenal idiom) before delegating to verbatim Arsenal router.
function userBridge(requireAuth) {
  const rawDb = dbModule.getDb();
  return function (req, res, next) {
    requireAuth(req, res, function () {
      const u = plannerUserFor(rawDb, req.webUser);
      // Provide the keys Arsenal code reads.
      req.user = {
        id: u.id,
        username: u.tg_username || (req.webUser.email || '').split('@')[0],
        balance_usd: (u.gift_balance_cents || 0) / 100,
        tg_chat_id: u.tg_id,
        language: u.language || 'ru',
      };
      next();
    });
  };
}

function createShortenerRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  // Public health probe — BEFORE auth bridge
  router.get('/health', (_req, res) => {
    try { const n = require('../planner/db/database').getDb().prepare('SELECT COUNT(*) AS n FROM short_links').get().n; res.json({ ok: true, phase: "B", links: n }); }
    catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.use(userBridge(requireAuth));
  router.use('/', arsenalShortener);
  return router;
}

function createBioRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  const rawDb = dbModule.getDb();
  router.get('/health', (_req, res) => {
    try { const n = rawDb.prepare('SELECT COUNT(*) AS n FROM user_bio_profiles').get().n; res.json({ ok: true, phase: 'A', profiles: n }); }
    catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.get('/profile', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(rawDb, req.webUser);
      const p = rawDb.prepare('SELECT * FROM user_bio_profiles WHERE user_id = ? LIMIT 1').get(u.id);
      res.json({ ok: true, profile: p || null });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  return router;
}

// Public-facing redirect: GET /s/:code → 302 to destination + log click
function createPublicRedirectRouter() {
  // Use Arsenal's full redirect router (handles splash, password, A/B, rotation).
  return arsenalRedirect;
}

function createProductsRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  router.use(express.json({ limit: '2mb' }));
  // Webhook is public (no auth bridge); other endpoints need bridge.
  router.use(function (req, res, next) {
    if (req.path.startsWith('/webhook') || req.path.startsWith('/download/')) return next();
    return userBridge(requireAuth)(req, res, next);
  });
  router.use('/', arsenalProducts);
  return router;
}

module.exports = { createShortenerRouter, createBioRouter, createPublicRedirectRouter, createProductsRouter };
