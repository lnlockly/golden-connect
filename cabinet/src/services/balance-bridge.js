// Cabinet→api Postgres balance bridge.
// Used by: cryptomus.js, platega.js, achievements.js, web-routes.js, ads.js
//
// Functions:
//   creditApi(opts) - add to wallet (gift/subscription/working)
//   debitApi(opts)  - subtract from wallet (returns ok=false if insufficient)
//   getApi(opts)    - read all balances
//
// Identity resolution: pass tg_id OR user_id (api Postgres) OR email.
// All amounts in CENTS (USD ×100). api converts to micro internally.

const _http = require('http');

function _post(path, payload, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://goldenConnect-api:4001';
    const secret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
    if (!secret) return resolve({ ok: false, error: 'no_secret' });
    const data = JSON.stringify(payload || {});
    try {
      const url = new URL(apiBase + path);
      const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
      const req = httpMod.request({
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (apiBase.startsWith('https') ? 443 : 80),
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-goldenConnect-secret': secret,
        },
        timeout: timeoutMs,
      }, (r) => {
        let buf = '';
        r.on('data', (c) => buf += c);
        r.on('end', () => {
          try { resolve(JSON.parse(buf)); }
          catch { resolve({ ok: false, error: 'invalid_json', raw: buf.slice(0, 200) }); }
        });
      });
      req.on('error', (e) => resolve({ ok: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
      req.write(data);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: e.message });
    }
  });
}

/**
 * Credit user balance. Returns { ok, userId, wallet, cents } or { ok: false, error }.
 * @param {Object} opts
 * @param {number} [opts.tgId] Telegram user id (preferred for bot-side)
 * @param {number} [opts.userId] api Postgres user_id (preferred when known)
 * @param {string} [opts.email] email (real or tg<id>@goldenConnect.bot)
 * @param {'gift'|'subscription'|'working'} opts.wallet
 * @param {number} opts.cents Amount in cents (must be > 0)
 * @param {string} opts.kind cash_ledger.kind label
 * @param {string} [opts.memo]
 * @param {number} [opts.relatedUserId]
 */
async function creditApi({ tgId, userId, email, wallet, cents, kind, memo, relatedUserId } = {}) {
  const r = await _post('/internal/balance/credit', {
    tg_id: tgId, user_id: userId, email,
    wallet, cents, kind, memo,
    related_user_id: relatedUserId,
  });
  // Phase H: balance changed — drop any cached read for this identity
  if (r && r.ok) {
    try { invalidateBalanceCache({ tgId, userId, email }); } catch (_) {}
  }
  return r;
}

/**
 * Debit user balance. Returns { ok, ... } or { ok: false, error: 'insufficient_*' }.
 */
async function debitApi({ tgId, userId, email, wallet, cents, kind, memo, relatedUserId } = {}) {
  const r = await _post('/internal/balance/debit', {
    tg_id: tgId, user_id: userId, email,
    wallet, cents, kind, memo,
    related_user_id: relatedUserId,
  });
  if (r && r.ok) {
    try { invalidateBalanceCache({ tgId, userId, email }); } catch (_) {}
  }
  return r;
}

/**
 * Get all balances. Returns { ok, working_cents, gift_cents, subscription_cents, karma } or null.
 */
async function getApi({ tgId, userId, email } = {}) {
  return _post('/internal/balance/get', {
    tg_id: tgId, user_id: userId, email,
  });
}

module.exports = { creditApi, debitApi, getApi };

// ═══ Phase H: in-memory 5s cache + unified getBalance + formatBalance ═══
const _balanceCache = new Map();
const _CACHE_TTL_MS = 5000;

function _cacheKey(opts) {
  if (opts.userId) return 'u:' + opts.userId;
  if (opts.tgId)   return 't:' + opts.tgId;
  if (opts.email)  return 'e:' + String(opts.email).toLowerCase();
  return null;
}

/**
 * Unified balance read with cache + safe defaults.
 * THIS IS THE single source of truth wrapper. Use this from bot + web.
 *
 * @returns {Promise<{ok:boolean, working_cents:number, gift_cents:number,
 *                    subscription_cents:number, karma:number, userId?:number,
 *                    error?:string}>}
 */
async function getBalance(opts = {}) {
  const key = _cacheKey(opts);
  if (key) {
    const c = _balanceCache.get(key);
    if (c && c.expires > Date.now()) return c.data;
  }
  const r = await getApi(opts);
  const data = (r && r.ok) ? {
    ok: true,
    userId: r.userId,
    working_cents: r.working_cents || 0,
    gift_cents: r.gift_cents || 0,
    subscription_cents: r.subscription_cents || 0,
    karma: r.karma == null ? 100 : r.karma,
  } : {
    ok: false,
    working_cents: 0, gift_cents: 0, subscription_cents: 0, karma: 100,
    error: (r && r.error) || 'fetch_failed',
  };
  if (key && data.ok) _balanceCache.set(key, { data, expires: Date.now() + _CACHE_TTL_MS });
  return data;
}

/** Invalidate cache after credit/debit so next read sees fresh value. */
function invalidateBalanceCache(opts = {}) {
  const key = _cacheKey(opts);
  if (key) _balanceCache.delete(key);
  // Also clear keys for the same user under different identifiers we may not know
  // (cheap: clear all if cache size small)
  if (_balanceCache.size > 200) _balanceCache.clear();
}

/** Format cents → "$1.23" */
function formatUsd(cents) {
  return '$' + ((cents || 0) / 100).toFixed(2);
}

module.exports.getBalance = getBalance;
module.exports.invalidateBalanceCache = invalidateBalanceCache;
module.exports.formatUsd = formatUsd;
