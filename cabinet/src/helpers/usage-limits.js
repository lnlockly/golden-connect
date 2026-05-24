// Golden Connect usage limits — per-day quotas with real tariff lookup via api.
// Plans: free / launch / boost / rocket
// Higher tier = higher daily caps. ROCKET = effectively unlimited.

const dbModule = require('../planner/db/database');
const config = require('../config');

const LIMITS = {
  free: {
    'shortener.create': 50,
    'ai.bio-gen': 5,
    'ai.text': 30,
    'ai.captions': 30,
    'ai.hashtags': 50,
    'ai.rewrite': 30,
    'video.transcribe': 5,
    'adcenter.send': 100,
    'adcenter.sources': 5,
    'adcenter.monitors': 2,
  },
  launch: {
    'shortener.create': 500,
    'ai.bio-gen': 30,
    'ai.text': 200,
    'ai.captions': 200,
    'ai.hashtags': 500,
    'ai.rewrite': 200,
    'video.transcribe': 30,
    'adcenter.send': 1000,
    'adcenter.sources': 30,
    'adcenter.monitors': 10,
  },
  boost: {
    'shortener.create': 5000,
    'ai.bio-gen': 100,
    'ai.text': 1000,
    'ai.captions': 1000,
    'ai.hashtags': 5000,
    'ai.rewrite': 1000,
    'video.transcribe': 100,
    'adcenter.send': 10000,
    'adcenter.sources': 100,
    'adcenter.monitors': 50,
  },
  rocket: {
    'shortener.create': 99999,
    'ai.bio-gen': 9999,
    'ai.text': 9999,
    'ai.captions': 9999,
    'ai.hashtags': 99999,
    'ai.rewrite': 9999,
    'video.transcribe': 9999,
    'adcenter.send': 999999,
    'adcenter.sources': 999,
    'adcenter.monitors': 999,
  },
};

const CAP_TYPES = { 'adcenter.sources': 'lifetime', 'adcenter.monitors': 'lifetime' };

let _schemaApplied = false;
function ensureSchema() {
  if (_schemaApplied) return;
  try {
    const db = dbModule.getDb();
    db.exec("CREATE TABLE IF NOT EXISTS app_usage (user_id INTEGER NOT NULL, service TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, service, day))");
    db.exec("CREATE INDEX IF NOT EXISTS idx_app_usage_user ON app_usage(user_id, day)");
    // Tariff cache columns
    try { db.exec("ALTER TABLE users ADD COLUMN tariff_cached_code TEXT"); } catch (_) {}
    try { db.exec("ALTER TABLE users ADD COLUMN tariff_cached_at DATETIME"); } catch (_) {}
    _schemaApplied = true;
  } catch (e) { console.error('[usage-limits] schema:', e.message); }
}

// In-memory tariff cache + DB persistent cache (TTL 5 min).
const TARIFF_CACHE = new Map();
const TARIFF_TTL_MS = 5 * 60 * 1000;

function _getEmailForUser(userId, optEmail) {
  if (optEmail && typeof optEmail === 'string' && optEmail.includes('@')) return optEmail.trim().toLowerCase();
  try {
    const db = dbModule.getDb();
    // planner.db users has tg_id but no email column — derive bot-email from tg_id
    const u = db.prepare('SELECT tg_id FROM users WHERE id=?').get(userId);
    if (u && u.tg_id) return 'tg' + u.tg_id + '@golden-connect.bot';
    return null;
  } catch (_) { return null; }
}

async function _fetchTariffFromApi(userId, optEmail) {
  const email = _getEmailForUser(userId, optEmail);
  if (!email) return 'free';
  const apiBase = String((config && config.golden-connectApiBaseUrl) || 'https://api.golden-connect.to').replace(/\/+$/, '');
  const secret  = String((config && config.golden-connectApiInternalSecret) || '');
  if (!secret) return 'free';
  try {
    const res = await fetch(apiBase + '/internal/finance/balances?email=' + encodeURIComponent(email), {
      method: 'GET',
      headers: { 'x-golden-connect-secret': secret, 'Content-Type': 'application/json' },
    });
    if (!res.ok) return 'free';
    const data = await res.json();
    const code = (data && data.tariff && data.tariff.code) || 'free';
    return ['free', 'launch', 'boost', 'rocket'].includes(code) ? code : 'free';
  } catch (e) {
    console.warn('[usage-limits] tariff fetch failed:', e && e.message);
    return 'free';
  }
}

function _readCachedTariff(userId) {
  // 1. Memory cache
  const m = TARIFF_CACHE.get(userId);
  if (m && (Date.now() - m.ts < TARIFF_TTL_MS)) return m.code;
  // 2. DB cache (persistent across restarts)
  try {
    const db = dbModule.getDb();
    const r = db.prepare('SELECT tariff_cached_code, tariff_cached_at FROM users WHERE id=?').get(userId);
    if (r && r.tariff_cached_code && r.tariff_cached_at) {
      const ageMs = Date.now() - new Date(r.tariff_cached_at + 'Z').getTime();
      if (ageMs < TARIFF_TTL_MS) {
        TARIFF_CACHE.set(userId, { code: r.tariff_cached_code, ts: Date.now() });
        return r.tariff_cached_code;
      }
    }
  } catch (_) {}
  return null;
}

function _writeCachedTariff(userId, code) {
  TARIFF_CACHE.set(userId, { code, ts: Date.now() });
  try {
    const db = dbModule.getDb();
    db.prepare("UPDATE users SET tariff_cached_code=?, tariff_cached_at=datetime('now') WHERE id=?").run(code, userId);
  } catch (_) {}
}

// SYNC variant — uses cache only. If no cache, returns 'free' (conservative)
// AND triggers async refresh in background.
function getUserPlan(userId) {
  if (!userId) return 'free';
  ensureSchema();
  const cached = _readCachedTariff(userId);
  if (cached) return cached;
  // Background refresh — do not block caller
  setImmediate(async () => {
    try {
      const code = await _fetchTariffFromApi(userId);
      _writeCachedTariff(userId, code);
    } catch (_) {}
  });
  return 'free';
}

// ASYNC variant — waits for fresh tariff if cache cold/expired.
async function getUserPlanAsync(userId, opts) {
  if (!userId) return 'free';
  ensureSchema();
  const cached = _readCachedTariff(userId);
  if (cached) return cached;
  const code = await _fetchTariffFromApi(userId, opts && opts.email);
  _writeCachedTariff(userId, code);
  return code;
}

function getLimit(plan, service) {
  const planLimits = LIMITS[plan] || LIMITS.free;
  const v = planLimits[service];
  if (typeof v === 'number') return v;
  return 999999;
}

function todayKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

function getUsedCount(userId, service) {
  ensureSchema();
  const db = dbModule.getDb();
  if (CAP_TYPES[service] === 'lifetime') {
    if (service === 'adcenter.sources') {
      try { return db.prepare("SELECT COUNT(*) AS c FROM ad_sources WHERE user_id=? AND status='active'").get(userId).c; }
      catch (_) { return 0; }
    }
    if (service === 'adcenter.monitors') {
      try { return db.prepare("SELECT COUNT(*) AS c FROM ad_monitor_sources WHERE user_id=? AND status='active'").get(userId).c; }
      catch (_) { return 0; }
    }
  }
  const row = db.prepare("SELECT count FROM app_usage WHERE user_id=? AND service=? AND day=?").get(userId, service, todayKey());
  return row ? row.count : 0;
}

// SYNC checkLimit — uses cached tariff.
function checkLimit(userId, service) {
  if (!userId) return { ok: true, allowed: true, used: 0, limit: 999999, plan: 'free' };
  const plan = getUserPlan(userId);
  const limit = getLimit(plan, service);
  const used = getUsedCount(userId, service);
  const allowed = used < limit;
  return { ok: allowed, allowed, used, limit, plan, service };
}

// ASYNC checkLimit — guarantees fresh tariff lookup.
async function checkLimitAsync(userId, service, opts) {
  if (!userId) return { ok: true, allowed: true, used: 0, limit: 999999, plan: 'free' };
  const plan = await getUserPlanAsync(userId, opts);
  const limit = getLimit(plan, service);
  const used = getUsedCount(userId, service);
  const allowed = used < limit;
  return { ok: allowed, allowed, used, limit, plan, service };
}

function trackUsage(userId, service, delta) {
  if (!userId) return;
  if (CAP_TYPES[service] === 'lifetime') return;
  ensureSchema();
  const db = dbModule.getDb();
  const day = todayKey();
  const inc = Math.max(1, Number(delta) || 1);
  try {
    db.prepare("INSERT INTO app_usage (user_id, service, day, count) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, service, day) DO UPDATE SET count=count+?")
      .run(userId, service, day, inc, inc);
  } catch (e) { console.error('[usage-limits] track:', e.message); }
}

function getUsageSummary(userId, services) {
  if (!userId) return {};
  const list = Array.isArray(services) ? services : Object.keys(LIMITS.free);
  const out = {};
  list.forEach(function (svc) {
    const r = checkLimit(userId, svc);
    out[svc] = { used: r.used, limit: r.limit, plan: r.plan };
  });
  return out;
}

function invalidatePlan(userId) {
  if (!userId) return;
  TARIFF_CACHE.delete(userId);
  try {
    const db = dbModule.getDb();
    db.prepare("UPDATE users SET tariff_cached_at=NULL WHERE id=?").run(userId);
  } catch (_) {}
}

module.exports = {
  checkLimit,
  checkLimitAsync,
  trackUsage,
  getUserPlan,
  getUserPlanAsync,
  getUsageSummary,
  ensureSchema,
  invalidatePlan,
  LIMITS,
};
