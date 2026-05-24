// Cabinet → api proxy for "Наши партнёры" (Trendex Partners).
//
// Mounted under the cabinet web router. Every request resolves the
// session's user → resolves their api-side email (tg<id>@trendex.bot
// for TG-only users) → forwards the call to trendex-api via
// callTrendexApi() so the api's own auth layer can validate.
//
// One quirk: api routes use Bearer auth on /api/* (the cabinet user
// session doesn't translate directly). We rely on the fact that cabinet
// already gets `internal/...` access via x-trendex-secret. So we
// reroute through internal endpoints when possible, otherwise we
// proxy with a one-shot internal credential.

const express = require('express');

function createPartnersRouter(deps) {
  const { storage, callTrendexApi, requireAuth } = deps;
  const router = express.Router();

  async function getEmail(req) {
    const u = req.webUser || storage.findWebUserById(req.session && req.session.userId);
    if (!u) return null;
    let email = String(u.email || '').trim().toLowerCase();
    const tgId = u.telegramUserId || u.telegram_user_id;
    if (!email && tgId) email = 'tg' + tgId + '@trendex.bot';
    return email || null;
  }

  // GET /api/partners — list ACTIVE projects
  router.get('/api/partners', requireAuth, async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.sphere) qs.set('sphere', String(req.query.sphere));
      if (req.query.category) qs.set('category', String(req.query.category));
      if (req.query.limit) qs.set('limit', String(req.query.limit));
      if (req.query.offset) qs.set('offset', String(req.query.offset));
      const path = '/internal/partners/list?' + qs.toString();
      const data = await callTrendexApi(path);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  // GET /api/partners-catalog — 3-category grouped catalog for GIFT CLUB
  router.get('/api/partners-catalog', requireAuth, async (req, res) => {
    try {
      const email = await getEmail(req);
      const qs = new URLSearchParams();
      if (email) qs.set('email', email);
      const data = await callTrendexApi('/internal/partners/catalog?' + qs.toString());
      res.json(data);
    } catch (e) {
      if (e && (e.status === 404 || (e.data && e.data.error === 'not_linked'))) {
        return res.json({ ok: true, linked: false, categories: [] });
      }
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  // GET /api/partners/:id — one project
  router.get('/api/partners/:id', requireAuth, async (req, res) => {
    try {
      const data = await callTrendexApi(`/internal/partners/get?id=${encodeURIComponent(req.params.id)}`);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  // POST /api/partners/:id/submit-link
  router.post('/api/partners/:id/submit-link', requireAuth, async (req, res) => {
    try {
      const email = await getEmail(req);
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const body = {
        email,
        project_id: Number(req.params.id),
        referral_link: String(req.body && req.body.referralLink || '').trim(),
        project_username: req.body && req.body.projectUsername ? String(req.body.projectUsername).trim() : null,
      };
      const data = await callTrendexApi('/internal/partners/submit-link', body);
      res.json(data);
    } catch (e) {
      const reason = (e && e.data && e.data.reason) || e.message || 'api_error';
      const status = (e && e.status) || 502;
      res.status(status).json({ ok: false, reason });
    }
  });

  // GET /api/partners/:id/my-participation
  router.get('/api/partners/:id/my-participation', requireAuth, async (req, res) => {
    try {
      const email = await getEmail(req);
      if (!email) return res.json({ ok: true, participation: null });
      const path = `/internal/partners/my-participation?email=${encodeURIComponent(email)}&project_id=${encodeURIComponent(req.params.id)}`;
      const data = await callTrendexApi(path);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  // GET /api/partners/:id/stats
  router.get('/api/partners/:id/stats', requireAuth, async (req, res) => {
    try {
      const email = await getEmail(req);
      const path = `/internal/partners/stats?project_id=${encodeURIComponent(req.params.id)}&email=${encodeURIComponent(email || '')}`;
      const data = await callTrendexApi(path);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  // GET /api/me/partner-participations
  router.get('/api/me/partner-participations', requireAuth, async (req, res) => {
    try {
      const email = await getEmail(req);
      if (!email) return res.json({ ok: true, items: [] });
      const data = await callTrendexApi(`/internal/partners/my-list?email=${encodeURIComponent(email)}`);
      res.json(data);
    } catch (e) {
      res.status(502).json({ ok: false, reason: e.message });
    }
  });

  return router;
}

module.exports = { createPartnersRouter };
