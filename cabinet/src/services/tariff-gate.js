// Tariff access gate — checks user has active paid tariff (LAUNCH/BOOST/ROCKET)
// with non-expired subscription. Used to lock premium features behind paywall.
//
// Source of truth: golden-connect-api /internal/finance/balances (email-keyed).
// Returns: tariff.code + tariff.expires_at.

const dbModule = require('../planner/db/database');

const PAID = new Set(['launch', 'boost', 'rocket']);
const CACHE = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 min — keep fresh enough that expires_at is accurate

function _emailFor(userId, override) {
  if (override) return String(override).trim().toLowerCase();
  try {
    const r = dbModule.getDb().prepare(
      'SELECT email, tg_id FROM users WHERE id=?'
    ).get(userId);
    if (r && r.email) return String(r.email).trim().toLowerCase();
    if (r && r.tg_id) return 'tg' + r.tg_id + '@golden-connect.bot';
  } catch (_) {}
  return null;
}

async function _fetchTariff(email, config) {
  const apiBase = String((config && config.goldenConnectApiBaseUrl) || 'https://api.golden-connect.to').replace(/\/+$/, '');
  const secret = String((config && config.goldenConnectApiInternalSecret) || process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET || '');
  if (!email || !secret) return null;
  try {
    const r = await fetch(apiBase + '/internal/finance/balances?email=' + encodeURIComponent(email), {
      method: 'GET',
      headers: { 'x-golden-connect-secret': secret, 'Content-Type': 'application/json' },
    });
    if (!r.ok) return null;
    const data = await r.json();
    return (data && data.tariff) || null;
  } catch (e) {
    console.warn('[tariff-gate] fetch failed:', e && e.message);
    return null;
  }
}

async function checkActiveTariff(webUser, opts = {}) {
  const userId = Number(webUser && webUser.id);
  if (!userId) return { ok: false, reason: 'no_user' };

  // 1-min cache to avoid hammering api on every /api/mlm/* request
  const cached = CACHE.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  const email = _emailFor(userId, opts.email || (webUser && webUser.email));
  const config = opts.config || {};
  const tariff = await _fetchTariff(email, config);

  let result;
  if (!tariff || !tariff.code || !PAID.has(String(tariff.code).toLowerCase())) {
    result = {
      ok: false,
      reason: 'no_paid_tariff',
      tariff: tariff ? tariff.code : 'free',
      detail: 'Доступ требует активный тариф LAUNCH / BOOST / ROCKET.',
    };
  } else if (!tariff.expires_at) {
    result = {
      ok: false,
      reason: 'no_expires',
      tariff: tariff.code,
      detail: 'Тариф найден, но дата окончания не известна — обратись в поддержку.',
    };
  } else if (new Date(tariff.expires_at).getTime() <= Date.now()) {
    result = {
      ok: false,
      reason: 'expired',
      tariff: tariff.code,
      expires_at: tariff.expires_at,
      detail: 'Подписка истекла — нужно продлить активность.',
    };
  } else {
    result = {
      ok: true,
      tariff: tariff.code,
      expires_at: tariff.expires_at,
      started_at: tariff.started_at,
      auto_renew: !!tariff.auto_renew,
    };
  }
  CACHE.set(userId, { ts: Date.now(), result });
  return result;
}

function makeRequireActiveTariff(config) {
  return async function requireActiveTariff(req, res, next) {
    const u = req.webUser;
    if (!u || !u.id) return res.status(401).json({ ok: false, reason: 'auth' });
    const check = await checkActiveTariff(u, { email: u.email, config });
    if (!check.ok) {
      return res.status(403).json({ ok: false, ...check, gate: 'active-tariff' });
    }
    req.activeTariff = check;
    return next();
  };
}

module.exports = { checkActiveTariff, makeRequireActiveTariff };
