// Activation Journey — replaces the old gamified XP-quests.
//
// A dynamic checklist of REAL first-result steps. Each step auto-completes
// from the user's actual state; completing a step credits a one-time TRDX
// reward (idempotent, recorded in SQLite journey_claim).
//
// State sources:
//   - profile_filled : webUser onboarding/profile fields (storage)
//   - connect_account: ≥1 connected TG account  (count reported by client sync)
//   - first_lead     : ≥1 CRM conversation       (count reported by client sync)
//   - invite_partner : referralsCount ≥ 1        (storage)
//   - buy_tariff     : tariff != free            (count/flag reported by client sync)
//
// Engine-dependent counts (accounts, leads, tariff) are reported by the
// frontend via /journey/sync — the frontend already fetches them. The server
// owns reward crediting so it can't be gamed by replaying sync.

let _db = null;
let _storage = null;
function init(db, storage) { _db = db; _storage = storage; applySchema(db); }

function applySchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS journey_claim (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      step_id TEXT NOT NULL,
      reward_trdx INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_journey_claim ON journey_claim(user_id, step_id);
    -- last reported engine counts per user (so GET reflects them without a sync)
    CREATE TABLE IF NOT EXISTS journey_state (
      user_id INTEGER PRIMARY KEY,
      account_count INTEGER NOT NULL DEFAULT 0,
      lead_count INTEGER NOT NULL DEFAULT 0,
      broadcast_count INTEGER NOT NULL DEFAULT 0,
      has_tariff INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER
    );
  `);
  console.log('[journey] schema ready');
}

// Step catalog — order matters (rail top→bottom).
const STEPS = [
  { id: 'profile_filled', title: 'Заполни профиль',        desc: 'Опыт, бюджет, источник трафика — чтобы подобрать путь', reward: 10, cta: { label: 'Профиль', page: 'profile' } },
  { id: 'connect_account',title: 'Подключи TG-аккаунт',     desc: 'Через телефон или TDATA — для рассылок и аренды',        reward: 20, cta: { label: 'Подключить', page: 'roboai-earn' } },
  { id: 'invite_partner', title: 'Пригласи партнёра',       desc: 'Отправь свою реф-ссылку — построй команду',             reward: 20, cta: { label: 'Реф-ссылки', page: 'links' } },
  { id: 'first_lead',     title: 'Получи первого лида',      desc: 'Напиши лиду в CRM или запусти рассылку',                reward: 30, cta: { label: 'Открыть CRM', page: 'crm' } },
  { id: 'buy_tariff',     title: 'Активируй тариф',          desc: 'Снимет лимиты и откроет 10 уровней партнёрки',          reward: 50, cta: { label: 'Тарифы', page: 'finance' } },
];

function _profileFilled(userId) {
  try {
    const u = _storage && _storage.getPublicWebUserById ? _storage.getPublicWebUserById(userId) : null;
    if (!u) return false;
    // consider filled if onboarding completed OR a couple of profile fields set
    if (u.onboardingCompletedAt) return true;
    const p = u.profile || {};
    const hits = [u.experienceLevel && u.experienceLevel !== 'new', p.trafficSource, p.monthlyBudget, p.niche].filter(Boolean).length;
    return hits >= 2;
  } catch (_) { return false; }
}
function _referrals(userId) {
  try { const u = _storage.getPublicWebUserById(userId); return Number((u && u.referralsCount) || 0); } catch (_) { return 0; }
}
function _readState(userId) {
  const r = _db.prepare(`SELECT * FROM journey_state WHERE user_id=?`).get(Number(userId));
  return r || { account_count: 0, lead_count: 0, broadcast_count: 0, has_tariff: 0 };
}

function _isDone(stepId, userId, st) {
  switch (stepId) {
    case 'profile_filled':  return _profileFilled(userId);
    case 'connect_account': return st.account_count > 0;
    case 'invite_partner':  return _referrals(userId) > 0;
    case 'first_lead':      return st.lead_count > 0 || st.broadcast_count > 0;
    case 'buy_tariff':      return st.has_tariff > 0;
    default: return false;
  }
}

// Credit reward once when a step is done. Returns total newly-credited TRDX.
function _settleRewards(userId, st) {
  let credited = 0;
  const claimedRows = _db.prepare(`SELECT step_id FROM journey_claim WHERE user_id=?`).all(Number(userId));
  const claimed = new Set(claimedRows.map(r => r.step_id));
  for (const step of STEPS) {
    if (claimed.has(step.id)) continue;
    if (!_isDone(step.id, userId, st)) continue;
    try {
      _db.prepare(`INSERT OR IGNORE INTO journey_claim (user_id, step_id, reward_trdx, claimed_at) VALUES (?,?,?,?)`)
        .run(Number(userId), step.id, step.reward, Date.now());
      if (_storage && _storage.awardTrx) _storage.awardTrx(Number(userId), step.reward, 'journey:' + step.id);
      credited += step.reward;
    } catch (e) { console.error('[journey] settle', step.id, e.message); }
  }
  return credited;
}

function getJourney(userId) {
  const st = _readState(userId);
  const credited = _settleRewards(userId, st);
  const claimedRows = _db.prepare(`SELECT step_id FROM journey_claim WHERE user_id=?`).all(Number(userId));
  const claimed = new Set(claimedRows.map(r => r.step_id));
  const steps = STEPS.map(s => ({
    id: s.id, title: s.title, desc: s.desc, reward: s.reward, cta: s.cta,
    done: _isDone(s.id, userId, st),
    claimed: claimed.has(s.id),
  }));
  const doneCount = steps.filter(s => s.done).length;
  return {
    ok: true,
    steps,
    done_count: doneCount,
    total: steps.length,
    progress_pct: Math.round(doneCount / steps.length * 100),
    all_done: doneCount === steps.length,
    just_credited_trdx: credited,
    trx_balance: (_storage && _storage.getTrxBalance) ? _storage.getTrxBalance(userId) : null,
  };
}

// Frontend reports engine-side counts it already fetched.
function sync(userId, payload) {
  const st = _readState(userId);
  const account_count = Math.max(st.account_count, Number(payload.account_count) || 0);
  const lead_count = Math.max(st.lead_count, Number(payload.lead_count) || 0);
  const broadcast_count = Math.max(st.broadcast_count, Number(payload.broadcast_count) || 0);
  const has_tariff = (payload.has_tariff ? 1 : st.has_tariff) ? 1 : 0;
  _db.prepare(`
    INSERT INTO journey_state (user_id, account_count, lead_count, broadcast_count, has_tariff, updated_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      account_count=excluded.account_count,
      lead_count=excluded.lead_count,
      broadcast_count=excluded.broadcast_count,
      has_tariff=excluded.has_tariff,
      updated_at=excluded.updated_at
  `).run(Number(userId), account_count, lead_count, broadcast_count, has_tariff, Date.now());
  return getJourney(userId);
}

module.exports = { init, applySchema, getJourney, sync };
