// Trust-score for ad moderation:
//   - 'trusted' → auto-approve (e.g. user has email + ≥1 paid referral OR has paid tariff themselves)
//   - 'manual'  → manual review queue
//
// We deliberately tie trust to economic activity (paid tariffs in their network or themselves)
// because that filters out spammers / single-shot accounts.

const dbModule = require('../planner/db/database');

let _storage = null;
function init(storage) { _storage = storage; }

function _getEmail(userId) {
  try {
    const wu = _storage && _storage.getPublicWebUserById && _storage.getPublicWebUserById(userId);
    return (wu && wu.email) || null;
  } catch (_) { return null; }
}

function _getReferralsCount(userId) {
  try {
    const wu = _storage && _storage.getPublicWebUserById && _storage.getPublicWebUserById(userId);
    return Number((wu && wu.referralsCount) || 0);
  } catch (_) { return 0; }
}

// [trust-tariff-fix] go through usage-limits which has live api-backed cache
// with background refresh. Direct SQL read returned stale 'free' for users
// who just bought a tariff and never hit a cache-warming endpoint.
function _getTariff(userId) {
  try {
    const { getUserPlan } = require('../helpers/usage-limits');
    return String(getUserPlan(userId) || 'free').toLowerCase();
  } catch (_) { return 'free'; }
}

// Async variant — blocks until a fresh tariff is known. Use this for
// critical write-paths like video upload, not for hot/render paths.
async function _getTariffAsync(userId) {
  try {
    const { getUserPlanAsync } = require('../helpers/usage-limits');
    return String((await getUserPlanAsync(userId)) || 'free').toLowerCase();
  } catch (_) { return 'free'; }
}

function _hasPaidReferralInNetwork(userId) {
  // Quick heuristic: if any direct referral has trxLastAwardedTier !== 'free' → trust signal.
  try {
    if (!_storage || !_storage.listWebUsersForTrxScan) return false;
    const tracked = _storage.listWebUsersForTrxScan();
    return tracked.some(t => Number(t.referredByUserId) === Number(userId)
      && t.trxLastAwardedTier && t.trxLastAwardedTier !== 'free');
  } catch (_) { return false; }
}

function evaluate(userId) {
  const email = _getEmail(userId);
  const tariff = _getTariff(userId);
  const refs = _getReferralsCount(userId);
  const paidInNet = _hasPaidReferralInNetwork(userId);

  // Trusted: has email AND at least one of:
  //   - own paid tariff (LAUNCH/BOOST/ROCKET)
  //   - has a paid referral in network
  //   - 5+ free referrals (some social proof)
  const ownPaid = ['launch', 'boost', 'rocket'].includes(String(tariff).toLowerCase());
  const social = refs >= 5;
  const trusted = !!email && (ownPaid || paidInNet || social);

  return {
    decision: trusted ? 'trusted' : 'manual',
    signals: { email: !!email, tariff, refs, paidInNet, ownPaid, social },
  };
}

function isTrusted(userId) { return evaluate(userId).decision === 'trusted'; }

// Tariff gate for video uploads (only paid tariffs).
function canUploadVideo(userId) {
  const tariff = String(_getTariff(userId)).toLowerCase();
  return ['launch', 'boost', 'rocket'].includes(tariff);
}

// [trust-tariff-fix] Async variant for critical gates (video upload).
// Blocks until api is queried so cold-cache users on paid tariffs are not
// falsely rejected. Caches the result for ~5 min via usage-limits.
async function canUploadVideoAsync(userId) {
  const tariff = await _getTariffAsync(userId);
  return ['launch', 'boost', 'rocket'].includes(tariff);
}

module.exports = { init, evaluate, isTrusted, canUploadVideo, canUploadVideoAsync };
