/**
 * /api/roboai/* — bridge from Golden Connect cabinet to roboai-engine.
 *
 * - Issues short-lived JWTs signed with ROBOAI_JWT_SECRET (shared via k8s
 *   secret with roboai-engine, where TenantJwtGuard validates them).
 * - Proxies all sub-paths to ROBOAI_ENGINE_URL (defaults to in-cluster service).
 * - JWT payload: { sub: webUser.id, scope: 'roboai',
 *                  email: webUser.email, tg_id: webUser.telegramUserId }
 *   roboai-engine resolves goldenConnect-api users.id from email or tg_id (uses the
 *   same resolveUserId pattern as goldenConnect-api/internal-finance.ts).
 */
const express = require('express');
const _tgMw = require('../middleware/tg-initdata');
const jwt = require('jsonwebtoken');

const ROBOAI_ENGINE_URL =
  process.env.ROBOAI_ENGINE_URL ||
  'http://roboai-engine.goldenConnect.svc.cluster.local:3001';
const ROBOAI_JWT_SECRET = process.env.ROBOAI_JWT_SECRET;
const JWT_TTL_SECONDS = 15 * 60; // 15 min

function signRoboaiToken(webUser) {
  if (!ROBOAI_JWT_SECRET) {
    throw new Error('ROBOAI_JWT_SECRET not configured');
  }
  return jwt.sign(
    {
      sub: Number(webUser.id),
      scope: 'roboai',
      email: webUser.email || null,
      tg_id: webUser.telegramUserId ? Number(webUser.telegramUserId) : null,
      is_admin: !!webUser.isAdmin,
    },
    ROBOAI_JWT_SECRET,
    { expiresIn: JWT_TTL_SECONDS }
  );
}

async function proxyToEngine(req, res, jwtToken) {
  // Express strips '/api/roboai' (router.use mount) and we already stripped
  // '/cabinet' upstream. Re-prefix with '/api' so we hit engine controllers
  // declared as @Controller('api/accounts'), @Controller('api/campaigns'),
  // etc — instead of leads42's bare /accounts (no api prefix), which is a
  // different controller from the original leads42 codebase.
  const targetPath = '/api' + req.url;
  const url = ROBOAI_ENGINE_URL.replace(/\/+$/, '') + targetPath;
  const init = {
    method: req.method,
    headers: {
      Authorization: 'Bearer ' + jwtToken,
      'Content-Type': req.headers['content-type'] || 'application/json',
      'x-forwarded-for': req.ip || '',
      'x-forwarded-user': String(req.webUser.id),
    },
  };
  // [roboai-multipart-2026-05-18] for multipart, forward the raw buffer as-is so boundary is preserved
  if (req._isMultipart && req._rawMultipartBody) {
    init.body = req._rawMultipartBody;
    if (req.headers['content-length']) init.headers['Content-Length'] = req.headers['content-length'];
  } else if (!['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  // Long-running engine calls (auth.SendCode through SOCKS5 proxy can take
  // up to ~60s on cold connections). Cabinet → engine fetch needs a wider
  // window than Node fetch default and than Cloudflare 100s ceiling so we
  // don't get a generic 524 — we'd rather return a structured timeout.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  init.signal = ctrl.signal;
  let r;
  try {
    r = await fetch(url, init);
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') {
      return res.status(504).json({ ok: false, reason: 'engine_timeout', detail: 'Engine did not respond within 90s — Telegram or proxy is slow. Try again.' });
    }
    return res
      .status(502)
      .json({ ok: false, reason: 'engine_unreachable', detail: String(e && e.message) });
  }
  clearTimeout(timer);
  res.status(r.status);
  for (const [k, v] of r.headers.entries()) {
    if (['content-encoding', 'transfer-encoding', 'connection'].includes(k.toLowerCase())) continue;
    res.setHeader(k, v);
  }
  const text = await r.text();
  return res.send(text);
}

// [roboai-multipart-2026-05-18] buffer raw body for multipart uploads (file uploads break otherwise)
const _getRawBody = require('raw-body');

function createRoboaiRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  // [roboai-multipart-2026-05-18] JSON parser only for non-multipart requests.
  // For multipart we buffer raw bytes via raw-body and forward as-is so
  // multer on the engine side can parse the boundary correctly.
  router.use((req, res, next) => {
    const ct = String(req.headers['content-type'] || '');
    if (ct.toLowerCase().startsWith('multipart/')) {
      // Read raw body — limit 60MB so 50MB TDATA + headers fits.
      _getRawBody(req, { limit: '60mb', length: req.headers['content-length'] }, (err, buf) => {
        if (err) {
          console.error('[roboai-proxy] raw-body err:', err.message);
          return res.status(413).json({ ok: false, reason: 'body_too_large_or_unreadable', detail: err.message });
        }
        req._rawMultipartBody = buf;
        req._isMultipart = true;
        next();
      });
      return;
    }
    express.json({ limit: '4mb' })(req, res, next);
  });

  // Public health (no auth) — verifies engine is reachable.
  router.get('/_health', async (_req, res) => {
    try {
      const r = await fetch(ROBOAI_ENGINE_URL.replace(/\/+$/, '') + '/healthz');
      const txt = await r.text();
      res.json({ ok: r.ok, status: r.status, engine: ROBOAI_ENGINE_URL, body: txt });
    } catch (e) {
      res.status(502).json({ ok: false, reason: 'engine_unreachable', detail: String(e && e.message) });
    }
  });

  // Accept TG WebApp initData OR internal impersonation BEFORE requireAuth, so users
  // opening cabinet from @GoldenConnectCRMBot don't need a cabinet session cookie.
  router.use(_tgMw.tgInitData);
  router.use(_tgMw.internalImpersonate);
  // All /api/roboai/* requests require cabinet session OR TG initData OR internal secret.
  router.use(requireAuth);

  // Catch-all proxy.
  router.all('/*', async (req, res) => {
    let token;
    try {
      token = signRoboaiToken(req.webUser);
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'jwt_signing_failed', detail: String(e && e.message) });
    }
    return proxyToEngine(req, res, token);
  });

  return router;
}

module.exports = { createRoboaiRouter };
