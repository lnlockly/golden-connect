// Golden Connect Ad Center router — wraps Arsenal's ad-center.js with auth bridge.
const express = require('express');
const dbModule = require('../planner/db/database');
const arsenalRouter = require('./ad-center-arsenal');

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

function userBridge(requireAuth) {
  const rawDb = dbModule.getDb();
  return function (req, res, next) {
    requireAuth(req, res, function () {
      const u = plannerUserFor(rawDb, req.webUser);
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

function createAdCenterRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  // Public health
  router.get('/health', (_req, res) => {
    try {
      const n = dbModule.getDb().prepare('SELECT COUNT(*) AS n FROM ad_sources').get().n;
      res.json({ ok: true, phase: 'A', sources: n });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.use(express.json({ limit: '4mb' }));
  router.use(userBridge(requireAuth));
  router.use('/', arsenalRouter);
  return router;
}

module.exports = { createAdCenterRouter };
