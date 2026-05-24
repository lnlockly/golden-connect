/**
 * Golden Connect Admin Panel — backend.
 *
 * Routes:
 *   POST /admin/api/login       — password → OTP sent via bot DM
 *   POST /admin/api/verify-otp  — OTP → JWT
 *   GET  /admin/api/me          — current admin info
 *   GET  /admin/api/dashboard   — KPIs
 *   GET  /admin/api/users       — list, search, paginate
 *   GET  /admin/api/users/:id   — single user
 *   POST /admin/api/users/:id/credit — manual balance credit (admin action)
 *   POST /admin/api/users/:id/freeze — freeze/unfreeze user
 *   GET  /admin/api/tariffs     — tariffs list + counts
 *   GET  /admin/api/cash-ledger — recent ledger entries (filterable)
 *   GET  /admin/api/withdrawals — pending withdrawal list
 *   POST /admin/api/withdrawals/:id/approve
 *   POST /admin/api/withdrawals/:id/reject
 *   GET  /admin/api/matrix      — bonus matrix tree (root)
 *
 * Env required:
 *   ADMIN_PASSWORD              — login password
 *   ADMIN_JWT_SECRET            — JWT signing secret
 *   ADMIN_TG_USER_ID            — admin's TG numeric id (for OTP delivery)
 *   GOLDEN_CONNECT_API_INTERNAL_URL    — api Postgres bridge
 *   GOLDEN_CONNECT_API_INTERNAL_SECRET
 */

function _timingSafeStrEq(a, b) {
  const ab = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ab.length !== bb.length) return false;
  return require('crypto').timingSafeEqual(ab, bb);
}

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const http = require('http');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_TG_USER_ID = String(process.env.ADMIN_TG_USER_ID || '');


// Math captcha (HMAC-signed, stateless) — mirrored from web-routes.js
function _captchaSecret() {
  return String(process.env.CAPTCHA_SECRET || process.env.SESSION_SECRET || process.env.PUBLIC_BASE_URL || 'goldenConnect-captcha-secret');
}
function makeCaptcha() {
  const ops = ['+', '-', '×'];
  const op = ops[Math.floor(Math.random() * ops.length)];
  const a = 1 + Math.floor(Math.random() * (op === '×' ? 9 : 49));
  const b = 1 + Math.floor(Math.random() * (op === '×' ? 9 : 49));
  let answer;
  if (op === '+') answer = a + b;
  else if (op === '-') answer = a - b;
  else answer = a * b;
  const exp = Date.now() + 10 * 60 * 1000;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = { a, b, op, answer, exp, nonce };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', _captchaSecret()).update(payloadB64).digest('base64url');
  return { id: payloadB64 + '.' + sig, question: a + ' ' + op + ' ' + b };
}
function verifyCaptcha(id, userAnswer) {
  if (!id || typeof id !== 'string' || id.indexOf('.') < 0) return false;
  const [payloadB64, sig] = id.split('.', 2);
  const expected = crypto.createHmac('sha256', _captchaSecret()).update(payloadB64).digest('base64url');
  if (sig !== expected) return false;
  try {
    const p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!p || !p.exp || p.exp < Date.now()) return false;
    const a = parseInt(String(userAnswer || '').trim(), 10);
    return Number.isFinite(a) && a === p.answer;
  } catch (_) { return false; }
}

const otpStore = new Map(); // sessionId -> { otp, expires, ip }

function randomOTP() { return String(Math.floor(100000 + Math.random() * 900000)); }
function randomSession() { return crypto.randomBytes(16).toString('hex'); }

function sendOtpViaBot(tgUserId, otp) {
  return new Promise((resolve) => {
    if (!tgUserId) return resolve(false);
    const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) return resolve(false);
    const data = JSON.stringify({
      chat_id: Number(tgUserId),
      text: '🔐 <b>Golden Connect Admin OTP</b>\n\nКод: <code>' + otp + '</code>\n\nДействителен 10 минут. Никому не передавай.',
      parse_mode: 'HTML',
    });
    const req = require('https').request({
      method: 'POST', hostname: 'api.telegram.org', port: 443,
      path: '/bot' + token + '/sendMessage',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 7000,
    }, (r) => { r.resume(); resolve(r.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.write(data); req.end();
  });
}

function callApi(path, payload, method = 'POST') {
  return new Promise((resolve) => {
    const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://goldenConnect-api:4001';
    const secret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
    if (!secret) return resolve({ ok: false, error: 'no_secret' });
    const data = method === 'GET' ? null : JSON.stringify(payload || {});
    const url = new URL(apiBase + path);
    const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
    const headers = { 'x-goldenConnect-secret': secret };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = httpMod.request({
      method, hostname: url.hostname, port: url.port || (apiBase.startsWith('https') ? 443 : 80),
      path: url.pathname + url.search, headers, timeout: 10000,
    }, (r) => {
      let buf = '';
      r.on('data', (c) => buf += c);
      r.on('end', () => {
        try { resolve(JSON.parse(buf)); } catch { resolve({ ok: false, raw: buf.slice(0, 500) }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    if (data) req.write(data);
    req.end();
  });
}

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts. Wait 15 min.' }),
});

const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  handler: (req, res) => res.status(429).json({ error: 'Too many OTP attempts.' }),
});

function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Auth required' });
  try {
    const dec = jwt.verify(auth.slice(7), ADMIN_JWT_SECRET);
    if (dec.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
    req.admin = dec;
    next();
  } catch { return res.status(401).json({ error: 'Invalid/expired token' }); }
}

function cleanOtpStore() {
  const now = Date.now();
  for (const [k, v] of otpStore.entries()) if (v.expires < now) otpStore.delete(k);
}

function setupAdminRoutes(_storage, _config) {
  const router = express.Router();
  router.use(express.json({ limit: '1mb' }));

  // GET /api/captcha → fresh captcha
  router.get('/api/captcha', (req, res) => {
    try { return res.json({ ok: true, ...makeCaptcha() }); }
    catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  });

  // POST /api/login → email + password + captcha → OTP sent via TG
  router.post('/api/login', loginRateLimit, async (req, res) => {
    cleanOtpStore();
    const { email, password, captchaId, captchaAnswer } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
    if (!ADMIN_PASSWORD || !ADMIN_EMAIL) return res.status(500).json({ error: 'ADMIN_EMAIL/ADMIN_PASSWORD not configured' });
    if (!verifyCaptcha(captchaId, captchaAnswer)) return res.status(400).json({ error: 'Неверная капча' });
    if (String(email).toLowerCase().trim() !== ADMIN_EMAIL) return res.status(401).json({ error: 'Неверный email или пароль' });
    if (!_timingSafeStrEq(password, ADMIN_PASSWORD)) return res.status(401).json({ error: 'Неверный email или пароль' });

    const sessionId = randomSession();
    const otp = randomOTP();
    otpStore.set(sessionId, { otp, expires: Date.now() + 10 * 60 * 1000, ip: req.ip });
    const sent = await sendOtpViaBot(ADMIN_TG_USER_ID, otp);
    res.json({ ok: true, sessionId, sent_via: sent ? 'telegram' : 'log_only', otp_hint: !sent ? otp : undefined });
    if (!sent) console.log('[admin] OTP for sessionId', sessionId, '=', otp);
  });

  // POST /api/verify-otp → JWT
  router.post('/api/verify-otp', otpRateLimit, (req, res) => {
    cleanOtpStore();
    const { sessionId, otp } = req.body || {};
    const rec = otpStore.get(sessionId);
    if (!rec) return res.status(400).json({ error: 'Session expired or not found' });
    if (rec.expires < Date.now()) { otpStore.delete(sessionId); return res.status(400).json({ error: 'OTP expired' }); }
    if (String(otp).trim() !== rec.otp) return res.status(401).json({ error: 'Invalid OTP' });
    otpStore.delete(sessionId);

    const token = jwt.sign({ role: 'admin', iat: Math.floor(Date.now() / 1000) }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
    res.json({ ok: true, token });
  });

  router.get('/api/me', adminAuth, (req, res) => {
    res.json({ ok: true, admin: req.admin, server_time: new Date().toISOString() });
  });

  // ─── Dashboard ─────────────────────────────────
  router.get('/api/dashboard', adminAuth, async (req, res) => {
    const r = await callApi('/internal/admin/dashboard', null, 'GET');
    res.json(r);
  });

  // ─── Users ─────────────────────────────────────
  router.get('/api/users', adminAuth, async (req, res) => {
    const q = new URLSearchParams({
      limit: req.query.limit || '50',
      offset: req.query.offset || '0',
      search: req.query.search || '',
    }).toString();
    const r = await callApi('/internal/admin/users?' + q, null, 'GET');
    res.json(r);
  });

  router.get('/api/users/:id', adminAuth, async (req, res) => {
    const r = await callApi('/internal/admin/users/' + Number(req.params.id), null, 'GET');
    res.json(r);
  });

  router.post('/api/users/:id/credit', adminAuth, async (req, res) => {
    const userId = Number(req.params.id);
    const { wallet, cents, memo } = req.body || {};
    const r = await callApi('/internal/balance/credit', {
      user_id: userId, wallet: wallet || 'gift', cents: Number(cents) || 0,
      kind: 'admin_credit', memo: memo || 'manual credit by admin',
    });
    res.json(r);
  });

  router.post('/api/users/:id/debit', adminAuth, async (req, res) => {
    const userId = Number(req.params.id);
    const { wallet, cents, memo } = req.body || {};
    const r = await callApi('/internal/balance/debit', {
      user_id: userId, wallet: wallet || 'gift', cents: Number(cents) || 0,
      kind: 'admin_debit', memo: memo || 'manual debit by admin',
    });
    res.json(r);
  });

  // ─── Tariffs ──────────────────────────────────
  router.get('/api/tariffs', adminAuth, async (req, res) => {
    const r = await callApi('/internal/admin/tariffs', null, 'GET');
    res.json(r);
  });

  // ─── Cash ledger ──────────────────────────────
  router.get('/api/cash-ledger', adminAuth, async (req, res) => {
    const q = new URLSearchParams({
      limit: req.query.limit || '100', offset: req.query.offset || '0',
      kind: req.query.kind || '', user_id: req.query.user_id || '',
    }).toString();
    const r = await callApi('/internal/admin/cash-ledger?' + q, null, 'GET');
    res.json(r);
  });

  // ─── Bonus matrix ─────────────────────────────
  router.get('/api/matrix', adminAuth, async (req, res) => {
    const r = await callApi('/internal/admin/matrix', null, 'GET');
    res.json(r);
  });

  return router;
}

module.exports = { setupAdminRoutes, adminAuth };
