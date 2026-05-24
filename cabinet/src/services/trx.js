// Genesis TRDX — tariff-upgrade reward service.
// Scans webUsers with referredByUserId, fetches their current tariff from golden-connect-api,
// and awards the inviter the diff between current tier and last-awarded tier.
//
// Tier values (TRDX awarded to inviter when referee reaches that tier):
//   free=0, launch=1000, boost=2500, rocket=7500
// On upgrade, inviter gets only the delta (e.g. launch→rocket = 6500).

const TIER_VALUE = { free: 0, launch: 1000, boost: 2500, rocket: 7500 };

let _config = null;
let _storage = null;
let _running = false;

function tierAmount(code) {
  return TIER_VALUE[String(code || 'free').toLowerCase()] || 0;
}

async function _fetchTariffCode(email, telegramUserId) {
  if (!email) {
    if (telegramUserId) email = 'tg' + telegramUserId + '@golden-connect.bot';
    else return 'free';
  }
  const apiBase = String((_config && _config.goldenConnectApiBaseUrl) || 'https://api.golden-connect.to').replace(/\/+$/, '');
  const secret = String((_config && _config.goldenConnectApiInternalSecret) || '');
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
  } catch (_) {
    return 'free';
  }
}

async function runTariffAwardScan() {
  if (_running) return { skipped: true, reason: 'already_running' };
  _running = true;
  const stats = { scanned: 0, awarded: 0, totalTrx: 0, errors: 0 };
  try {
    const users = _storage.listWebUsersForTrxScan();
    for (const u of users) {
      stats.scanned++;
      try {
        const currentTier = await _fetchTariffCode(u.email, u.telegramUserId);
        const lastTier = u.trxLastAwardedTier || 'free';
        const currentVal = tierAmount(currentTier);
        const lastVal = tierAmount(lastTier);
        if (currentVal > lastVal) {
          const delta = currentVal - lastVal;
          _storage.awardTrx(u.referredByUserId, delta, 'referral_paid_' + currentTier, u.id);
          _storage.setTrxLastAwardedTier(u.id, currentTier);
          stats.awarded++;
          stats.totalTrx += delta;
        }
      } catch (e) {
        stats.errors++;
        console.warn('[trx-scan] user', u.id, 'err:', e && e.message);
      }
    }
    if (stats.awarded > 0) {
      console.log('[trx-scan] awarded', stats.awarded, 'inviters,', stats.totalTrx, 'TRDX total');
    }
    return stats;
  } finally {
    _running = false;
  }
}

function startTrxScanCron(storage, config) {
  _storage = storage;
  _config = config;
  // First run after 2 min (let bot warm up), then every 10 min.
  setTimeout(() => { runTariffAwardScan().catch(() => {}); }, 120000);
  setInterval(() => { runTariffAwardScan().catch(() => {}); }, 10 * 60 * 1000).unref();
  console.log('[trx-scan] started (every 10 min, first run in 2 min)');
}

function runRegistrationBackfill(storage) {
  try {
    const n = storage.backfillRegistrationBonus();
    if (n > 0) console.log('[trx-backfill] credited 100 TRDX to', n, 'existing users');
    return n;
  } catch (e) {
    console.error('[trx-backfill] failed:', e && e.message);
    return 0;
  }
}

module.exports = { startTrxScanCron, runTariffAwardScan, runRegistrationBackfill, tierAmount, TIER_VALUE };
