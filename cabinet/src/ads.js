/**
 * Golden Connect Ads module — advertiser + executor flows (v2).
 *
 * v2 changelog:
 *   • Sessions persist to ad_sessions (survive bot restart).
 *   • Payment + campaign create wrapped in atomic SQLite transaction.
 *   • Cron: verify bot-admin status hourly; auto-pause broken sub-campaigns.
 *   • Pause / Resume / Refund buttons on "Мои кампании".
 *   • Fraud: min 3-day account age; instant retract on quick-leave (<60 sec).
 *   • Karma system: reject and quick-leave decrement; success increments.
 *   • AI-prompt is updated to advertise the /ads flow (done in ai-assistant).
 *
 * Entry: setupAds(bot, { db }) — call ONCE from createBot().
 * All amounts stored as integer cents (USD ×100).
 */

const { InlineKeyboard } = require('grammy');
// ── api Postgres balance bridge ──
// Fetch real Golden Connect platform balances (working, gift, subscription) by tg_id.
// Returns { gift, earned, karma } in cents to maintain compatibility with planner shape.
const _http = require('http');
async function fetchApiBalances(plannerUser) {
  // plannerUser has tg_id from planner SQLite
  const tgId = Number(plannerUser?.tg_id || 0);
  if (!tgId) return null;
  const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://goldenConnect-api:4001';
  const secret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
  if (!secret) return null;
  const email = 'tg' + tgId + '@goldenConnect.bot';
  return new Promise((resolve) => {
    try {
      const url = new URL(apiBase + '/internal/finance/balances?email=' + encodeURIComponent(email));
      const req = _http.request({
        method: 'GET',
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        headers: { 'x-goldenConnect-secret': secret },
        timeout: 4000,
      }, (r) => {
        let buf = '';
        r.on('data', (c) => buf += c);
        r.on('end', () => {
          try {
            const j = JSON.parse(buf);
            if (j && j.balances) {
              resolve({
                gift:   Math.round(Number(j.balances.gift?.usd || 0) * 100),
                earned: Math.round(Number(j.balances.working?.usd || 0) * 100),
                karma:  Number(j.balances.karma?.points || 0),
              });
              return;
            }
            resolve(null);
          } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end();
    } catch (_) { resolve(null); }
  });
}



// ── Phase F: api Postgres debit/credit bridge ──
const { creditApi, debitApi } = require('./services/balance-bridge');

// Wrapper: prefer api Postgres, fallback to planner if api unavailable.
async function getUnifiedBalances(plannerUser, fallbackBalances) {
  const apiBal = await fetchApiBalances(plannerUser);
  return apiBal || fallbackBalances || { gift: 0, earned: 0, karma: 100 };
}


const CENTS = 100;
const COMMISSION_BPS = 1000;       // 10% total platform commission
const SPONSOR_BPS = 500;           //  5% out of it goes to sponsor
const MIN_REWARD_CENTS = 1;        // $0.01 minimum (unified across bot + web)
const MIN_TARGET = 10;
const MAX_TARGET = 100000;
const CLAIM_TTL_HOURS = 72;  // 3d — external registrations need time
const ANTILEAVE_HOURS = 7 * 24;    // 7-day subscription window
const QUICK_LEAVE_SECONDS = 60;    // leaving within 60s → instant retract

// Karma proxy for milestone awards (fire-and-forget)
function _karmaAwardAds(plannerUserId, kind, sourceId, memo) {
  const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://goldenConnect-api:4001';
  const apiSecret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
  if (!apiSecret || !plannerUserId) return;
  // Resolve api email via tg_id
  let tgId = null;
  try {
    const dbm = require('./planner/db/database');
    const u = dbm.getDb().prepare('SELECT tg_id FROM users WHERE id = ?').get(plannerUserId);
    if (u && u.tg_id) tgId = u.tg_id;
  } catch (_) {}
  if (!tgId) return;
  const email = 'tg' + Math.abs(tgId) + '@goldenConnect.bot';
  const data = JSON.stringify({ email: email, kind: kind, source_id: sourceId || null, memo: memo || null });
  const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
  try {
    const url = new URL(apiBase + '/internal/karma/award');
    const req = httpMod.request({
      method: 'POST', hostname: url.hostname,
      port: url.port || (apiBase.startsWith('https') ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-goldenConnect-secret': apiSecret,
      },
      timeout: 5000,
    }, function (res) { res.resume(); });
    req.on('error', function () {});
    req.on('timeout', function () { req.destroy(); });
    req.write(data); req.end();
  } catch (e) {}
}

const DAILY_CLAIM_LIMIT = 25;
const MIN_ACCOUNT_AGE_DAYS = 3;
const KARMA_INITIAL = 100;
const KARMA_MIN_CLAIM = 40;        // below this → can't claim
const ADMIN_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const ANTILEAVE_CRON_INTERVAL_MS = 6 * 3600 * 1000;

// ============================================================================
// Schema migration
// ============================================================================
function applySchema(db) {
  const rawDb = db.getDb ? db.getDb() : db;

  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS platform_wallets (
      name TEXT PRIMARY KEY,
      balance_cents INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO platform_wallets (name, balance_cents) VALUES ('fee_pool', 0);

    CREATE TABLE IF NOT EXISTS ad_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      title TEXT,
      budget_cents INTEGER NOT NULL,
      reward_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL,
      sponsor_cents INTEGER NOT NULL,
      target_count INTEGER NOT NULL,
      completed_count INTEGER DEFAULT 0,
      paid_wallet TEXT,
      min_karma INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_camp_status ON ad_campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_camp_owner ON ad_campaigns(owner_user_id);

    CREATE TABLE IF NOT EXISTS ad_channel_tasks (
      campaign_id INTEGER PRIMARY KEY,
      channel_chat_id INTEGER NOT NULL,
      channel_username TEXT,
      channel_title TEXT,
      invite_link TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chan_task_chat ON ad_channel_tasks(channel_chat_id);

    CREATE TABLE IF NOT EXISTS ad_custom_tasks (
      campaign_id INTEGER PRIMARY KEY,
      description TEXT,
      instructions TEXT,
      proof_type TEXT,
      report_format TEXT DEFAULT '',
      ai_check_enabled INTEGER DEFAULT 0,
      ai_check_criteria TEXT DEFAULT '',
      photo_required INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ad_task_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'claimed',
      payout_target TEXT DEFAULT 'earned',
      reward_cents INTEGER NOT NULL,
      proof_text TEXT,
      proof_photo_file_id TEXT,
      claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      submitted_at DATETIME,
      decided_at DATETIME,
      decision_note TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_one ON ad_task_claims(campaign_id, executor_user_id);
    CREATE INDEX IF NOT EXISTS idx_claim_exec ON ad_task_claims(executor_user_id, status);

    CREATE TABLE IF NOT EXISTS ad_channel_joins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      channel_chat_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      left_at DATETIME,
      reward_retracted INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ad_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      kind TEXT NOT NULL,
      user_id INTEGER,
      wallet TEXT,
      amount_cents INTEGER NOT NULL,
      campaign_id INTEGER,
      claim_id INTEGER,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tx_user ON ad_transactions(user_id, created_at);

    -- v2: persistent bot conversation state
    CREATE TABLE IF NOT EXISTS ad_sessions (
      tg_user_id INTEGER PRIMARY KEY,
      flow TEXT NOT NULL,
      step TEXT,
      data_json TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Phase I: missing tables for task report submission + video flow
    CREATE TABLE IF NOT EXISTS ad_custom_task_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      report_text TEXT,
      photo_file_id TEXT,
      photo_url TEXT,
      ai_score INTEGER,
      ai_verdict TEXT,
      ai_reasoning TEXT,
      revised_count INTEGER DEFAULT 0,
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_report_claim ON ad_custom_task_reports(claim_id);
    CREATE INDEX IF NOT EXISTS idx_report_camp  ON ad_custom_task_reports(campaign_id);

    CREATE TABLE IF NOT EXISTS ad_video_tasks (
      campaign_id INTEGER PRIMARY KEY,
      video_file_id TEXT,
      video_url TEXT,
      video_title TEXT,
      video_duration_sec INTEGER DEFAULT 0,
      validation_mode TEXT DEFAULT 'text_report',
      quiz_json TEXT,
      criteria TEXT,
      min_score INTEGER DEFAULT 70
    );

    CREATE TABLE IF NOT EXISTS ad_video_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id INTEGER NOT NULL,
      executor_user_id INTEGER NOT NULL,
      reward_cents INTEGER NOT NULL,
      payout_target TEXT DEFAULT 'earned',
      status TEXT DEFAULT 'claimed',
      validation_data TEXT,
      ai_score INTEGER,
      ai_verdict TEXT,
      ai_reasoning TEXT,
      submitted_at DATETIME,
      paid_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_vclaim_exec ON ad_video_claims(executor_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_vclaim_camp ON ad_video_claims(campaign_id, status);
  `);

  const cols = rawDb.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  const ensureCol = (name, ddl) => {
    if (!cols.includes(name)) rawDb.exec(`ALTER TABLE users ADD COLUMN ${name} ${ddl}`);
  };
  ensureCol('gift_balance_cents',   'INTEGER DEFAULT 0');
  ensureCol('earned_balance_cents', 'INTEGER DEFAULT 0');
  ensureCol('ads_day',              'TEXT DEFAULT NULL');
  ensureCol('ads_day_count',        'INTEGER DEFAULT 0');
  ensureCol('ads_payout_target',    "TEXT DEFAULT 'earned'");
  ensureCol('ads_karma',            `INTEGER DEFAULT ${KARMA_INITIAL}`);

  // Ensure ad_campaigns has all needed columns (for older DBs that pre-date them)
  const adCols = rawDb.prepare("PRAGMA table_info(ad_campaigns)").all().map((c) => c.name);
  const ensureAdCol = (name, ddl) => {
    if (!adCols.includes(name)) {
      try { rawDb.exec(`ALTER TABLE ad_campaigns ADD COLUMN ${name} ${ddl}`); }
      catch (e) { console.warn('[ads schema] ensureAdCol', name, e.message); }
    }
  };
  ensureAdCol('paid_wallet', 'TEXT');
  ensureAdCol('refunded',    'INTEGER DEFAULT 0');
  ensureAdCol('paused_reason', 'TEXT');
  ensureAdCol('min_karma',     'INTEGER DEFAULT 0');
  ensureAdCol('ai_auto_approve', 'INTEGER DEFAULT 0'); // 0=manual, 1=AI auto-decides on submit

  // Phase I: ensure ad_custom_tasks has all required columns
  const ctCols = rawDb.prepare("PRAGMA table_info(ad_custom_tasks)").all().map((c) => c.name);
  const ensureCtCol = (name, ddl) => {
    if (!ctCols.includes(name)) {
      try { rawDb.exec(`ALTER TABLE ad_custom_tasks ADD COLUMN ${name} ${ddl}`); }
      catch (e) { console.warn('[ads schema] ensureCtCol', name, e.message); }
    }
  };
  ensureCtCol('report_format',    "TEXT DEFAULT ''");
  ensureCtCol('ai_check_enabled', 'INTEGER DEFAULT 0');
  ensureCtCol('ai_check_criteria', "TEXT DEFAULT ''");
  ensureCtCol('photo_required',   'INTEGER DEFAULT 0');

  // L.13: ensure ad_custom_task_reports has revised_count
  const ctrCols = rawDb.prepare("PRAGMA table_info(ad_custom_task_reports)").all().map((c) => c.name);
  if (!ctrCols.includes('revised_count')) {
    try { rawDb.exec("ALTER TABLE ad_custom_task_reports ADD COLUMN revised_count INTEGER DEFAULT 0"); }
    catch (e) { console.warn('[ads schema] revised_count', e.message); }
  }
}

// ============================================================================
// DB store
// ============================================================================
function makeStore(db) {
  const rawDb = db.getDb ? db.getDb() : db;

  const txn = (fn) => rawDb.transaction(fn);

  const get = {
    userByTgId: (tgId) => rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(tgId),
    userById:   (id)   => rawDb.prepare('SELECT * FROM users WHERE id = ?').get(id),
    balances: (userId) => {
      const u = rawDb.prepare('SELECT gift_balance_cents, earned_balance_cents, ads_karma FROM users WHERE id = ?').get(userId);
      return { gift: u?.gift_balance_cents || 0, earned: u?.earned_balance_cents || 0, karma: u?.ads_karma ?? KARMA_INITIAL };
    },
    session: (tgId) => {
      const row = rawDb.prepare('SELECT * FROM ad_sessions WHERE tg_user_id = ?').get(tgId);
      if (!row) return null;
      let data = {};
      try { data = JSON.parse(row.data_json || '{}'); } catch (_) {}
      return { flow: row.flow, step: row.step, data };
    },
    campaign: (id) => {
      const c = rawDb.prepare('SELECT * FROM ad_campaigns WHERE id = ?').get(id);
      if (!c) return null;
      if (c.kind === 'sub') c.channel = rawDb.prepare('SELECT * FROM ad_channel_tasks WHERE campaign_id = ?').get(id);
      if (c.kind === 'task') c.custom = rawDb.prepare('SELECT * FROM ad_custom_tasks WHERE campaign_id = ?').get(id);
      return c;
    },
    claim: (id) => rawDb.prepare('SELECT * FROM ad_task_claims WHERE id = ?').get(id),
    claimByPair: (campaignId, execId) =>
      rawDb.prepare('SELECT * FROM ad_task_claims WHERE campaign_id = ? AND executor_user_id = ?').get(campaignId, execId),
customTaskByCampaign: (campId) => rawDb.prepare('SELECT * FROM ad_custom_tasks WHERE campaign_id = ?').get(campId),
    listMyPendingReports: (ownerUserId, limit = 30) => rawDb.prepare(`
      SELECT r.*, c.id AS camp_id, c.title AS camp_title, c.reward_cents,
             ct.description, ct.report_format, ct.ai_check_criteria, ct.ai_check_enabled,
             u.first_name AS executor_name, u.tg_username AS executor_username,
             cl.status AS claim_status
      FROM ad_custom_task_reports r
      JOIN ad_task_claims cl ON cl.id = r.claim_id
      JOIN ad_campaigns c ON c.id = r.campaign_id
      JOIN ad_custom_tasks ct ON ct.campaign_id = c.id
      JOIN users u ON u.id = r.executor_user_id
      WHERE c.owner_user_id = ? AND cl.status IN ('submitted', 'rework')
      ORDER BY r.submitted_at DESC LIMIT ?
    `).all(ownerUserId, limit),
    activeCustomCampaigns: (limit = 30, excludeOwnerId = null) => {
      // L.11: optionally exclude owner's own tasks from catalog
      if (excludeOwnerId) {
        return rawDb.prepare(`
          SELECT c.*, ct.description, ct.report_format, ct.photo_required
          FROM ad_campaigns c JOIN ad_custom_tasks ct ON ct.campaign_id = c.id
          WHERE c.kind = 'task' AND c.status = 'active' AND c.completed_count < c.target_count
            AND c.owner_user_id != ?
          ORDER BY c.id DESC LIMIT ?
        `).all(excludeOwnerId, limit);
      }
      return rawDb.prepare(`
        SELECT c.*, ct.description, ct.report_format, ct.photo_required
        FROM ad_campaigns c JOIN ad_custom_tasks ct ON ct.campaign_id = c.id
        WHERE c.kind = 'task' AND c.status = 'active' AND c.completed_count < c.target_count
        ORDER BY c.id DESC LIMIT ?
      `).all(limit);
    },
    activeVideoCampaigns: (limit = 30, excludeOwnerId = null) => {
      if (excludeOwnerId) {
        return rawDb.prepare(`
          SELECT c.*, v.video_file_id, v.video_url, v.video_title, v.validation_mode, v.quiz_json, v.criteria, v.video_duration_sec
          FROM ad_campaigns c JOIN ad_video_tasks v ON v.campaign_id = c.id
          WHERE c.kind = 'video' AND c.status = 'active' AND c.completed_count < c.target_count
            AND c.owner_user_id != ?
          ORDER BY c.id DESC LIMIT ?
        `).all(excludeOwnerId, limit);
      }
      return rawDb.prepare(`
        SELECT c.*, v.video_file_id, v.video_url, v.video_title, v.validation_mode, v.quiz_json, v.criteria, v.video_duration_sec
        FROM ad_campaigns c JOIN ad_video_tasks v ON v.campaign_id = c.id
        WHERE c.kind = 'video' AND c.status = 'active' AND c.completed_count < c.target_count
        ORDER BY c.id DESC LIMIT ?
      `).all(limit);
    },
    videoTaskByCampaign: (campId) => rawDb.prepare('SELECT * FROM ad_video_tasks WHERE campaign_id = ?').get(campId),
    createCustomTask: ({ campaign_id, description, report_format, ai_check_enabled, ai_check_criteria, photo_required }) => {
      rawDb.prepare(`INSERT OR REPLACE INTO ad_custom_tasks (campaign_id, description, report_format, ai_check_enabled, ai_check_criteria, photo_required)
        VALUES (?, ?, ?, ?, ?, ?)`).run(campaign_id, description, report_format || '', ai_check_enabled ? 1 : 0, ai_check_criteria || '', photo_required ? 1 : 0);
    },
    createVideoTask: ({ campaign_id, video_file_id, video_url, video_title, video_duration_sec, validation_mode, quiz_json, criteria, min_score }) => {
      rawDb.prepare(`INSERT INTO ad_video_tasks (campaign_id, video_file_id, video_url, video_title, video_duration_sec, validation_mode, quiz_json, criteria, min_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(campaign_id, video_file_id || null, video_url || null, video_title || '', video_duration_sec || 0, validation_mode, quiz_json ? JSON.stringify(quiz_json) : null, criteria || '', min_score || 70);
    },
    submitReport: ({ claim_id, campaign_id, executor_user_id, report_text, photo_file_id, photo_url, ai_score, ai_verdict, ai_reasoning }) => {
      // L.2: status guard — only claimed/rework claims can submit a report
      const cur = rawDb.prepare("SELECT status FROM ad_task_claims WHERE id = ?").get(claim_id);
      if (!cur || !['claimed', 'rework'].includes(cur.status)) {
        return null; // signal: claim not in submittable state
      }
      const r = rawDb.prepare(`INSERT INTO ad_custom_task_reports
        (claim_id, campaign_id, executor_user_id, report_text, photo_file_id, photo_url, ai_score, ai_verdict, ai_reasoning)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(claim_id, campaign_id, executor_user_id, report_text || null, photo_file_id || null, photo_url || null, ai_score || null, ai_verdict || null, ai_reasoning || null);
      rawDb.prepare("UPDATE ad_task_claims SET status = 'submitted' WHERE id = ? AND status IN ('claimed','rework')").run(claim_id);
      return r.lastInsertRowid;
    },
    decideClaim: async ({ claim_id, decision, reason }) => {
      // Phase J: async + api Postgres credit for approve (planner cents was Phase H legacy)
      const cl = rawDb.prepare('SELECT * FROM ad_task_claims WHERE id = ?').get(claim_id);
      if (!cl) return { ok: false, reason: 'not_found' };
      if (decision === 'approve') {
        // L.1: idempotency guard — only submitted/rework claims can be paid (not already paid/expired/rejected)
        if (!['submitted', 'rework'].includes(cl.status)) {
          return { ok: false, reason: 'invalid_state', current_status: cl.status };
        }
        const wallet = cl.payout_target || 'earned';
        const apiWallet = wallet === 'gift' ? 'gift' : 'working';
        const exec = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(cl.executor_user_id);
        if (!exec || !exec.tg_id) return { ok: false, reason: 'executor_tg_missing' };

        // Atomic state transition first — if no row updated, abort before charging api
        const upd = rawDb.prepare("UPDATE ad_task_claims SET status = 'paid' WHERE id = ? AND status IN ('submitted','rework')").run(claim_id);
        if (upd.changes === 0) {
          return { ok: false, reason: 'race_lost', detail: 'concurrent decide' };
        }

        const { creditApi } = require('../services/balance-bridge');
        const cr = await creditApi({
          tgId: exec.tg_id, wallet: apiWallet, cents: cl.reward_cents,
          kind: 'task_approved', memo: 'task claim #' + claim_id,
          relatedUserId: cl.campaign_id,
        });
        if (!cr || !cr.ok) {
          // rollback the state flip — sent nothing
          rawDb.prepare("UPDATE ad_task_claims SET status = ? WHERE id = ?").run(cl.status, claim_id);
          return { ok: false, reason: 'api_credit_failed', error: cr && cr.error };
        }

        rawDb.prepare('UPDATE ad_campaigns SET completed_count = completed_count + 1 WHERE id = ?').run(cl.campaign_id);
        // L.4: +1 karma for approved task
        try { rawDb.prepare("UPDATE users SET ads_karma = COALESCE(ads_karma, 100) + 1 WHERE id = ?").run(cl.executor_user_id); } catch (_) {}
        try {
          const c = rawDb.prepare('SELECT owner_user_id, completed_count FROM ad_campaigns WHERE id = ?').get(cl.campaign_id);
          if (c) {
            if (c.completed_count === 100) _karmaAwardAds(c.owner_user_id, 'ad_100_views', cl.campaign_id, 'campaign:' + cl.campaign_id);
            if (c.completed_count === 1000) _karmaAwardAds(c.owner_user_id, 'ad_1000_views', cl.campaign_id, 'campaign:' + cl.campaign_id);
          }
        } catch (_) {}
        rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, campaign_id, claim_id, note)
          VALUES ('reward', ?, ?, ?, ?, ?, 'task_approved')`).run(cl.executor_user_id, wallet, cl.reward_cents, cl.campaign_id, claim_id);
        return { ok: true, paid_cents: cl.reward_cents, executor_user_id: cl.executor_user_id, executor_tg_id: exec.tg_id };
      } else if (decision === 'reject') {
        // L.1: only allow on submitted/rework
        if (!['submitted', 'rework'].includes(cl.status)) {
          return { ok: false, reason: 'invalid_state', current_status: cl.status };
        }
        const upd = rawDb.prepare("UPDATE ad_task_claims SET status = 'rejected', reject_reason = ? WHERE id = ? AND status IN ('submitted','rework')").run(reason || '', claim_id);
        if (upd.changes === 0) return { ok: false, reason: 'race_lost' };
        // L.4: −5 karma on reject
        try { rawDb.prepare("UPDATE users SET ads_karma = MAX(0, COALESCE(ads_karma, 100) - 5) WHERE id = ?").run(cl.executor_user_id); } catch (_) {}
        return { ok: true, executor_user_id: cl.executor_user_id, rejected: true };
      } else if (decision === 'rework') {
        // L.1: only allow on submitted (not on already-rework or paid)
        if (cl.status !== 'submitted') {
          return { ok: false, reason: 'invalid_state', current_status: cl.status };
        }
        const upd = rawDb.prepare("UPDATE ad_task_claims SET status = 'rework', reject_reason = ? WHERE id = ? AND status = 'submitted'").run(reason || '', claim_id);
        if (upd.changes === 0) return { ok: false, reason: 'race_lost' };
        try { rawDb.prepare('UPDATE ad_custom_task_reports SET revised_count = revised_count + 1 WHERE claim_id = ?').run(claim_id); }
        catch (_) {}
        // L.4: rework doesn't deduct karma — give the executor a chance
        return { ok: true, executor_user_id: cl.executor_user_id, rework: true };
      }
      return { ok: false, reason: 'invalid_decision' };
    },
    submitVideoValidation: async ({ claim_id, validation_data, ai_score, ai_verdict, ai_reasoning, auto_approve }) => {
      const cl = rawDb.prepare('SELECT * FROM ad_video_claims WHERE id = ?').get(claim_id);
      if (!cl) return { ok: false };
      rawDb.prepare(`UPDATE ad_video_claims SET validation_data = ?, ai_score = ?, ai_verdict = ?, ai_reasoning = ?, submitted_at = datetime('now')
        WHERE id = ?`).run(JSON.stringify(validation_data || {}), ai_score || null, ai_verdict || null, ai_reasoning || null, claim_id);
      if (auto_approve && ai_verdict === 'approve') {
        // Phase J: api Postgres credit (planner cents was legacy)
        const wallet = cl.payout_target || 'earned';
        const apiWallet = wallet === 'gift' ? 'gift' : 'working';
        const exec = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(cl.executor_user_id);
        if (exec && exec.tg_id) {
          const { creditApi } = require('../services/balance-bridge');
          await creditApi({
            tgId: exec.tg_id, wallet: apiWallet, cents: cl.reward_cents,
            kind: 'video_approved', memo: 'video claim #' + claim_id,
            relatedUserId: cl.campaign_id,
          });
        }
        rawDb.prepare("UPDATE ad_video_claims SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(claim_id);
        rawDb.prepare('UPDATE ad_campaigns SET completed_count = completed_count + 1 WHERE id = ?').run(cl.campaign_id);
        try {
          const c = rawDb.prepare('SELECT owner_user_id, completed_count FROM ad_campaigns WHERE id = ?').get(cl.campaign_id);
          if (c) {
            if (c.completed_count === 100) _karmaAwardAds(c.owner_user_id, 'ad_100_views', cl.campaign_id, 'campaign:' + cl.campaign_id);
            if (c.completed_count === 1000) _karmaAwardAds(c.owner_user_id, 'ad_1000_views', cl.campaign_id, 'campaign:' + cl.campaign_id);
          }
        } catch (_) {}
        rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, campaign_id, claim_id, note)
          VALUES ('reward', ?, ?, ?, ?, ?, 'video_auto_approved')`).run(cl.executor_user_id, wallet, cl.reward_cents, cl.campaign_id, claim_id);
        return { ok: true, paid: true, paid_cents: cl.reward_cents };
      }
      return { ok: true, paid: false };
    },
    createVideoClaim: ({ campaign_id, executor_user_id, reward_cents, payout_target }) => {
      const r = rawDb.prepare(`INSERT INTO ad_video_claims (campaign_id, executor_user_id, reward_cents, payout_target)
        VALUES (?, ?, ?, ?)`).run(campaign_id, executor_user_id, reward_cents, payout_target || 'earned');
      return r.lastInsertRowid;
    },
    videoClaimByPair: (campId, execId) =>
      rawDb.prepare('SELECT * FROM ad_video_claims WHERE campaign_id = ? AND executor_user_id = ?').get(campId, execId),

    activeChannelCampaign: (channelChatId) => rawDb.prepare(`
      SELECT c.*, t.channel_chat_id, t.channel_title
      FROM ad_campaigns c JOIN ad_channel_tasks t ON t.campaign_id = c.id
      WHERE c.status = 'active' AND c.kind = 'sub'
        AND t.channel_chat_id = ? AND c.completed_count < c.target_count
      ORDER BY c.id DESC LIMIT 1
    `).get(channelChatId),
    myCampaigns: (ownerId) =>
      rawDb.prepare('SELECT * FROM ad_campaigns WHERE owner_user_id = ? ORDER BY id DESC LIMIT 30').all(ownerId),
    myClaims: (execId, limit = 30) =>
      rawDb.prepare(`SELECT cl.*, c.kind, c.title FROM ad_task_claims cl
                     JOIN ad_campaigns c ON c.id = cl.campaign_id
                     WHERE cl.executor_user_id = ? ORDER BY cl.id DESC LIMIT ?`).all(execId, limit),
    activeSubsForExecutor: (execId, limit = 15) => rawDb.prepare(`
      SELECT c.*, t.channel_title, t.channel_username, t.invite_link, t.channel_chat_id
      FROM ad_campaigns c
      JOIN ad_channel_tasks t ON t.campaign_id = c.id
      WHERE c.status = 'active' AND c.kind = 'sub'
        AND c.owner_user_id != ?
        AND c.completed_count < c.target_count
        AND NOT EXISTS (
          SELECT 1 FROM ad_task_claims cl
          WHERE cl.campaign_id = c.id AND cl.executor_user_id = ?
            AND cl.status IN ('claimed','submitted','approved','paid')
        )
      ORDER BY c.reward_cents DESC, c.id DESC LIMIT ?
    `).all(execId, execId, limit),
    activeSubCampaigns: () =>
      rawDb.prepare(`SELECT c.id, c.owner_user_id, t.channel_chat_id, t.channel_title
                     FROM ad_campaigns c JOIN ad_channel_tasks t ON t.campaign_id = c.id
                     WHERE c.status IN ('active','paused_missing_admin')`).all(),
    lastChannelJoin: (channelChatId, execId) => rawDb.prepare(
      `SELECT * FROM ad_channel_joins WHERE channel_chat_id = ? AND executor_user_id = ?
       ORDER BY id DESC LIMIT 1`
    ).get(channelChatId, execId),
  };

  const put = {
    setSession: (tgId, payload) => {
      // Phase I fix: null/undefined means "clear session" (was destructured before, threw TypeError)
      if (payload == null) {
        rawDb.prepare('DELETE FROM ad_sessions WHERE tg_user_id = ?').run(tgId);
        return;
      }
      const { flow, step, data } = payload;
      rawDb.prepare(`INSERT INTO ad_sessions (tg_user_id, flow, step, data_json, updated_at)
                     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                     ON CONFLICT(tg_user_id) DO UPDATE SET
                       flow = excluded.flow, step = excluded.step,
                       data_json = excluded.data_json, updated_at = CURRENT_TIMESTAMP`)
        .run(tgId, flow, step || null, JSON.stringify(data || {}));
    },
    clearSession: (tgId) => rawDb.prepare('DELETE FROM ad_sessions WHERE tg_user_id = ?').run(tgId),

    balanceDelta: (userId, wallet, deltaCents) => {
      const col = wallet === 'gift' ? 'gift_balance_cents' : 'earned_balance_cents';
      rawDb.prepare(`UPDATE users SET ${col} = ${col} + ? WHERE id = ?`).run(deltaCents, userId);
    },
    karmaDelta: (userId, delta) => {
      rawDb.prepare('UPDATE users SET ads_karma = MAX(0, COALESCE(ads_karma,100) + ?) WHERE id = ?').run(delta, userId);
    },
    feePoolDelta: (deltaCents) => {
      rawDb.prepare(`UPDATE platform_wallets SET balance_cents = balance_cents + ?,
                     updated_at = CURRENT_TIMESTAMP WHERE name = 'fee_pool'`).run(deltaCents);
    },

    logTx: (tx) => {
      rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, campaign_id, claim_id, note)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(tx.kind, tx.user_id || null, tx.wallet || null, tx.amount_cents,
             tx.campaign_id || null, tx.claim_id || null, tx.note || null);
    },

    createCampaign: (c) => {
      const res = rawDb.prepare(`INSERT INTO ad_campaigns
        (owner_user_id, kind, status, title, budget_cents, reward_cents, fee_cents, sponsor_cents, target_count, paid_wallet, min_karma)
        VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(c.owner_user_id, c.kind, c.title, c.budget_cents, c.reward_cents,
             c.fee_cents, c.sponsor_cents, c.target_count, c.paid_wallet,
             Math.max(0, parseInt(c.min_karma, 10) || 0));
      return res.lastInsertRowid;
    },
    setChannelTask: (campaignId, t) => {
      rawDb.prepare(`INSERT OR REPLACE INTO ad_channel_tasks
        (campaign_id, channel_chat_id, channel_username, channel_title, invite_link)
        VALUES (?, ?, ?, ?, ?)`)
        .run(campaignId, t.channel_chat_id, t.channel_username || null,
             t.channel_title || null, t.invite_link || null);
    },
    setCustomTask: (campaignId, t) => {
      rawDb.prepare(`INSERT OR REPLACE INTO ad_custom_tasks
        (campaign_id, description, instructions, proof_type) VALUES (?, ?, ?, ?)`)
        .run(campaignId, t.description || '', t.instructions || '', t.proof_type || 'any');
    },
    createClaim: (claim) => {
      const res = rawDb.prepare(`INSERT INTO ad_task_claims
        (campaign_id, executor_user_id, status, payout_target, reward_cents)
        VALUES (?, ?, ?, ?, ?)`)
        .run(claim.campaign_id, claim.executor_user_id, claim.status || 'claimed',
             claim.payout_target || 'earned', claim.reward_cents);
      return res.lastInsertRowid;
    },
    updateClaim: (id, fields) => {
      const keys = Object.keys(fields);
      const set = keys.map((k) => `${k} = ?`).join(', ');
      rawDb.prepare(`UPDATE ad_task_claims SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
    },
    incCompleted: (campaignId) => {
      rawDb.prepare(`UPDATE ad_campaigns SET completed_count = completed_count + 1,
                     updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(campaignId);
      // Karma milestones for advertiser
      try {
        const c = rawDb.prepare('SELECT owner_user_id, completed_count FROM ad_campaigns WHERE id = ?').get(campaignId);
        if (c) {
          if (c.completed_count === 100) _karmaAwardAds(c.owner_user_id, 'ad_100_views', campaignId, 'campaign:' + campaignId);
          if (c.completed_count === 1000) _karmaAwardAds(c.owner_user_id, 'ad_1000_views', campaignId, 'campaign:' + campaignId);
        }
      } catch (_) {}
    },
    setCampaignStatus: (campaignId, status) => {
      rawDb.prepare(`UPDATE ad_campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(status, campaignId);
    },
    logChannelJoin: (j) => {
      const res = rawDb.prepare(`INSERT INTO ad_channel_joins (campaign_id, executor_user_id, channel_chat_id)
                                  VALUES (?, ?, ?)`).run(j.campaign_id, j.executor_user_id, j.channel_chat_id);
      return res.lastInsertRowid;
    },
    markChannelLeft: (channelChatId, execId) => {
      rawDb.prepare(`UPDATE ad_channel_joins SET left_at = CURRENT_TIMESTAMP
                     WHERE channel_chat_id = ? AND executor_user_id = ? AND left_at IS NULL`)
        .run(channelChatId, execId);
    },
    markJoinRetracted: (joinId) => {
      rawDb.prepare('UPDATE ad_channel_joins SET reward_retracted = 1 WHERE id = ?').run(joinId);
    },

    consumeDailyClaim: (userId, today) => {
      const u = rawDb.prepare('SELECT ads_day, ads_day_count FROM users WHERE id = ?').get(userId);
      if (u.ads_day !== today) {
        rawDb.prepare('UPDATE users SET ads_day = ?, ads_day_count = 1 WHERE id = ?').run(today, userId);
        return { ok: true, used: 1 };
      }
      if (u.ads_day_count >= DAILY_CLAIM_LIMIT) return { ok: false, used: u.ads_day_count };
      rawDb.prepare('UPDATE users SET ads_day_count = ads_day_count + 1 WHERE id = ?').run(userId);
      return { ok: true, used: u.ads_day_count + 1 };
    },

    setPayoutTarget: (userId, target) => {
      rawDb.prepare('UPDATE users SET ads_payout_target = ? WHERE id = ?').run(target, userId);
    },
  };

  // Architectural fix: 6 write-fns were mistakenly defined inside `get` instead of `put`.
  // All callsites use `store.put.<fn>`, so we alias them here to avoid the
  // 'store.put.X is not a function' crash without restructuring the file.
  // Phase I.r2: alias for marketplace channel listing (legacy callsite)
  if (!get.activeChannelMarket) {
    get.activeChannelMarket = (limit) => get.activeSubsForExecutor(0, limit || 30);
  }

  put.createCustomTask        = get.createCustomTask;
  put.createVideoTask         = get.createVideoTask;
  put.submitReport            = get.submitReport;
  put.decideClaim             = get.decideClaim;
  put.submitVideoValidation   = get.submitVideoValidation;
  put.createVideoClaim        = get.createVideoClaim;

  return { txn, get, put };
}

// ============================================================================
// Helpers
// ============================================================================
const fmtUsd = (cents) => '$' + (cents / CENTS).toFixed(2);
const esc = (s) => String(s || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const todayStr = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / (86400 * 1000);

// ============================================================================
// Setup entry
// ============================================================================
function setupAds(bot, deps) {
  const { db, storage } = deps;
  applySchema(db);
  const store = makeStore(db);
  const rawDb = db.getDb ? db.getDb() : db;

  console.log('[ads] v2 — schema ok, handlers registering');

  const MENU_ADVERTISER = '🎯 Разместить рекламу';
  const MENU_EXECUTOR   = '💰 Задания (заработать)';

  // L.8: /cancel global — clears any ad session (works in adv_*, submit_report, decide_reason, video_*)
  bot.command('cancel', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    store.put.setSession(ctx.from.id, null);
    await ctx.reply('❌ Текущая операция отменена. Напиши /start чтобы вернуться в меню.');
  });

  bot.hears(MENU_ADVERTISER, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    store.put.clearSession(ctx.from.id);
    await showAdvertiserMenu(ctx);
  });

  bot.hears(MENU_EXECUTOR, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    store.put.clearSession(ctx.from.id);
    await showExecutorMenu(ctx);
  });

  // ────────── advertiser menu ──────────
  async function showAdvertiserMenu(ctx) {
    const user = db.ensureUser(ctx.from);
    const _localBal = store.get.balances(user.id);
    const bal = await getUnifiedBalances(user, _localBal);
    const mine = store.get.myCampaigns(user.id);
    const active = mine.filter((c) => c.status === 'active').length;

    const kb = new InlineKeyboard()
      .text('📢 Подписка на канал/чат', 'adv_new_sub').row()
      .text('📝 Любое задание (с отчётом)', 'adv_new_task').row()
      .text('🎬 Просмотр видео [скоро]', 'adv_new_video').row()
      .text(`📊 Мои кампании (${mine.length})`, 'adv_list').row()
      .text('💵 Пополнить баланс', 'adv_topup');

    await ctx.reply(
      `🎯 <b>Разместить рекламу</b>\n\n` +
      `💰 Gift-баланс: <b>${fmtUsd(bal.gift)}</b>\n` +
      `💵 Заработано: <b>${fmtUsd(bal.earned)}</b>\n` +
      `📊 Активных кампаний: <b>${active}</b>\n\n` +
      `Создай задание — оно появится у исполнителей в разделе «💰 Задания (заработать)». ` +
      `Платформа берёт <b>10%</b> (из них 5% — твоему спонсору).`,
      { parse_mode: 'HTML', reply_markup: kb }
    );
  }

  bot.callbackQuery('adv_new_sub', async (ctx) => {
    await ctx.answerCallbackQuery();
    store.put.setSession(ctx.from.id, { flow: 'adv_sub', step: 'forward', data: {} });
    await ctx.reply(
      `📢 <b>Новая кампания: подписка на канал/чат</b>\n\n` +
      `<b>Шаг 1 из 3.</b>\n\n` +
      `1️⃣ Добавь меня <b>администратором</b> в свой канал или чат ` +
      `(достаточно прав «Управление сообщениями»).\n\n` +
      `2️⃣ Форвардни сюда <b>любой пост</b> из канала (или напиши @username публичного канала).\n\n` +
      `Отмена — /cancel`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('adv_new_task', async (ctx) => {
    await ctx.answerCallbackQuery();
    store.put.setSession(ctx.from.id, { flow: 'adv_task', step: 'description', data: {} });
    await ctx.reply(
      `📝 <b>Новая кампания: задание с отчётом</b>\n\n` +
      `Шаг 1/6 — Опиши <b>что нужно сделать</b> исполнителю:\n\n` +
      `<i>Например: «Оставь комментарий под нашим постом про здоровье в @GoldenConnectNews и поставь 🔥»</i>`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Отмена', 'adv_sub_cancel') }
    );
  });

  bot.callbackQuery('adv_new_task_OLD', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `📝 <b>Любое задание с отчётом</b>\n\nPhase 2 — в разработке.`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('adv_new_video', async (ctx) => {
    await ctx.answerCallbackQuery();
    store.put.setSession(ctx.from.id, { flow: 'adv_video', step: 'video', data: {} });
    await ctx.reply(
      `🎬 <b>Новая кампания: видео-задание</b>\n\n` +
      `Шаг 1/5 — Пришли само <b>видео</b> (как видео-сообщение или файл) или ссылку на YouTube/TikTok:\n\n` +
      `<i>Исполнитель будет смотреть видео + проходить проверку понимания.</i>`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('❌ Отмена', 'adv_sub_cancel') }
    );
    return;
  });

  bot.callbackQuery('adv_new_video_OLD', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(`🎬 <b>Просмотр видео</b>\n\nСкоро — оплачиваемые просмотры YouTube / Rutube.`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('adv_list', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const list = store.get.myCampaigns(user.id);
    if (!list.length) return ctx.reply('Пока нет кампаний. Создай первую через меню.');
    for (const c of list) {
      const emoji = c.kind === 'sub' ? '📢' : c.kind === 'task' ? '📝' : '🎬';
      const progress = `${c.completed_count}/${c.target_count}`;
      const spent = c.reward_cents * c.completed_count;
      const remaining = c.budget_cents - c.fee_cents - spent;
      const kb = new InlineKeyboard();
      if (c.status === 'active') kb.text('⏸ Пауза', `adv_pause_${c.id}`);
      if (c.status === 'paused' || c.status === 'paused_missing_admin') kb.text('▶️ Возобновить', `adv_resume_${c.id}`);
      if (['active', 'paused', 'paused_missing_admin'].includes(c.status) && remaining > 0) kb.text(`💵 Вернуть ${fmtUsd(remaining)}`, `adv_refund_${c.id}`);
      const statusLabel = { active: '🟢 active', paused: '⏸ paused', paused_missing_admin: '⚠️ нет админки', done: '✅ done', archived: '🗄 archived', rejected: '❌ rejected' }[c.status] || c.status;
      await ctx.reply(
        `${emoji} <b>#${c.id}</b> · ${esc(c.title || c.kind)}\n` +
        `📊 ${progress} · 💵 выплачено ${fmtUsd(spent)} / бюджет ${fmtUsd(c.budget_cents)}\n` +
        `Статус: ${statusLabel}`,
        { parse_mode: 'HTML', reply_markup: kb.inline_keyboard.length ? kb : undefined });
    }
  });

  bot.callbackQuery(/^adv_pause_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1], 10);
    const c = store.get.campaign(id);
    const user = db.ensureUser(ctx.from);
    if (!c || c.owner_user_id !== user.id) return ctx.reply('❌ Не твоя кампания.');
    if (c.status !== 'active') return ctx.reply('Сейчас не активна.');
    store.put.setCampaignStatus(id, 'paused');
    await ctx.reply(`⏸ Кампания #${id} поставлена на паузу. Исполнители её больше не видят.`);
  });

  bot.callbackQuery(/^adv_resume_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1], 10);
    const c = store.get.campaign(id);
    const user = db.ensureUser(ctx.from);
    if (!c || c.owner_user_id !== user.id) return ctx.reply('❌ Не твоя кампания.');
    if (!['paused', 'paused_missing_admin'].includes(c.status)) return ctx.reply('Нечего возобновлять.');
    // For sub-campaigns re-check bot-admin status before resuming
    if (c.kind === 'sub') {
      const ok = await checkBotIsAdmin(ctx.api, c.channel?.channel_chat_id || c.channel?.channel_chat_id);
      if (!ok) return ctx.reply('⚠️ Я всё ещё не админ в канале. Добавь меня заново и нажми «Возобновить».');
    }
    store.put.setCampaignStatus(id, 'active');
    await ctx.reply(`▶️ Кампания #${id} снова активна.`);
  });

  bot.callbackQuery(/^adv_refund_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const id = parseInt(ctx.match[1], 10);
    const c = store.get.campaign(id);
    const user = db.ensureUser(ctx.from);
    if (!c || c.owner_user_id !== user.id) return ctx.reply('❌ Не твоя кампания.');
    if (['done', 'archived', 'refunded'].includes(c.status)) return ctx.reply('Уже закрыта.');

    const spent = c.reward_cents * c.completed_count;
    const remaining = c.budget_cents - c.fee_cents - spent;
    if (remaining <= 0) return ctx.reply('Бюджет уже израсходован.');

    const wallet = c.paid_wallet || 'gift';
    store.txn(() => {
      store.put.balanceDelta(c.owner_user_id, wallet, remaining);
      store.put.setCampaignStatus(id, 'refunded');
      store.put.logTx({ kind: 'campaign_refund', user_id: c.owner_user_id, wallet, amount_cents: remaining, campaign_id: id });
    })();

    await ctx.reply(`💵 Возвращено <b>${fmtUsd(remaining)}</b> на <b>${wallet}</b>-баланс. Кампания закрыта.`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('adv_topup', async (ctx) => {
    await ctx.answerCallbackQuery();
    const siteBase = String(process.env.PUBLIC_BASE_URL || 'https://goldenConnect.to/cabinet').replace(/\/$/, '');
    let magicUrl = siteBase + '/cabinet#/finance';
    try {
      storage.ensureWebUserFromTelegram(ctx.from);
      const token = storage.createMagicLoginToken(ctx.from.id);
      if (token && token.token) {
        magicUrl = `${siteBase}/auth/magic?token=${encodeURIComponent(token.token)}&next=` + encodeURIComponent('/cabinet#/finance');
      }
    } catch (_) { /* fallback URL above */ }
    const kb = new InlineKeyboard()
      .webApp('📱 Открыть в Telegram', siteBase + '/cabinet#/finance').row()
      .url('🌐 Открыть на сайте', magicUrl);
    await ctx.reply(
      `💵 <b>Пополнение баланса</b>\n\nОткрой кабинет — раздел «Финансы» — выбери метод (USDT через CryptoBot работает мгновенно).`,
      { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
    );
  });

  // ────────── conversation router ──────────
  bot.on('message', async (ctx, next) => {
    if (ctx.chat?.type !== 'private') return next();
    const ses = store.get.session(ctx.from.id);
    if (!ses || !ses.flow) return next();

    const text = (ctx.message.text || '').trim();
    if (text === '/cancel') {
      store.put.clearSession(ctx.from.id);
      return ctx.reply('❌ Отменено.');
    }

    try {
      if (ses.flow === 'adv_sub') return advSubStep(ctx, ses);
    } catch (e) {
      console.error('[ads] conversation error', e && e.message);
    }
    return next();
  });

  async function advSubStep(ctx, ses) {
    const user = db.ensureUser(ctx.from);

    if (ses.step === 'forward') {
      let channelChatId = null;
      let channelUsername = null;
      const fwd = ctx.message.forward_from_chat;
      if (fwd && fwd.type === 'channel') {
        channelChatId = fwd.id;
        channelUsername = fwd.username ? '@' + fwd.username : null;
      } else if (ctx.message.text) {
        const m = ctx.message.text.trim().match(/^@?([a-zA-Z][a-zA-Z0-9_]{3,})$/);
        if (m) channelUsername = '@' + m[1];
      }
      if (!channelChatId && !channelUsername) {
        return ctx.reply('Нужен форвард поста из канала или @username публичного канала. Попробуй ещё раз или /cancel.');
      }

      let chat;
      try { chat = await ctx.api.getChat(channelChatId || channelUsername); }
      catch (e) { return ctx.reply(`❌ Не могу найти канал: ${esc(e.message)}\n\nУбедись что он публичный или я уже админ.`); }

      const me = await ctx.api.getMe();
      const isAdmin = await checkBotIsAdmin(ctx.api, chat.id);
      if (!isAdmin) {
        return ctx.reply(
          `⚠️ Я не админ в <b>${esc(chat.title)}</b>.\n\n` +
          `Открой канал → Управление → Администраторы → добавь @${esc(me.username)} и дай право «Управление сообщениями».\n` +
          `Потом форвардни пост заново.`, { parse_mode: 'HTML' });
      }

      let inviteLink = chat.username ? `https://t.me/${chat.username}` : null;
      if (!inviteLink) {
        try { inviteLink = await ctx.api.createChatInviteLink(chat.id, { name: 'Golden Connect Ads' }).then((r) => r.invite_link); } catch (_) {}
      }

      store.put.setSession(ctx.from.id, {
        flow: 'adv_sub', step: 'count',
        data: {
          channel_chat_id: chat.id,
          channel_username: chat.username ? '@' + chat.username : null,
          channel_title: chat.title || 'Канал',
          invite_link: inviteLink,
        }
      });
      return ctx.reply(
        `✅ Канал: <b>${esc(chat.title)}</b>\n` +
        (chat.username ? `@${esc(chat.username)}\n` : '') +
        `\n<b>Шаг 2 из 3.</b> Сколько подписчиков нужно? ${MIN_TARGET}–${MAX_TARGET}:`,
        { parse_mode: 'HTML' });
    }

    if (ses.step === 'count') {
      const n = parseInt((ctx.message.text || '').trim(), 10);
      if (!Number.isFinite(n) || n < MIN_TARGET || n > MAX_TARGET) {
        return ctx.reply(`Число от ${MIN_TARGET} до ${MAX_TARGET}. Попробуй ещё раз или /cancel.`);
      }
      ses.data.target_count = n;
      store.put.setSession(ctx.from.id, { flow: 'adv_sub', step: 'reward', data: ses.data });
      return ctx.reply(
        `<b>Шаг 3 из 3.</b> Сколько платишь за одного подписчика?\n\n` +
        `Минимум $0.01. Введи сумму в долларах (например 0.03 или 0.10):`, { parse_mode: 'HTML' });
    }

    if (ses.step === 'reward') {
      const raw = (ctx.message.text || '').trim().replace(',', '.');
      const usd = parseFloat(raw);
      if (!Number.isFinite(usd) || usd <= 0) return ctx.reply('Не понял сумму. Введи число (например 0.05) или /cancel.');
      const rewardCents = Math.round(usd * CENTS);
      if (rewardCents < MIN_REWARD_CENTS) return ctx.reply(`Минимум ${fmtUsd(MIN_REWARD_CENTS)} за одного.`);

      const payoutBudget = rewardCents * ses.data.target_count;
      const fee = Math.round((payoutBudget * COMMISSION_BPS) / (10000 - COMMISSION_BPS));
      const budget = payoutBudget + fee;
      const sponsorCents = Math.round((budget * SPONSOR_BPS) / 10000);

      ses.data.reward_cents = rewardCents;
      ses.data.payout_budget_cents = payoutBudget;
      ses.data.fee_cents = fee;
      ses.data.budget_cents = budget;
      ses.data.sponsor_cents = sponsorCents;
      // min_karma is system-managed — go straight to confirm
      store.put.setSession(ctx.from.id, { flow: 'adv_sub', step: 'confirm', data: ses.data });

      const _localBal = store.get.balances(user.id);
    const bal = await getUnifiedBalances(user, _localBal);
      const kb = new InlineKeyboard();
      if (bal.gift >= budget)    kb.text('✅ Оплатить с Gift-баланса', 'adv_sub_pay_gift').row();
      if (bal.earned >= budget)  kb.text('✅ Оплатить с Earned-баланса', 'adv_sub_pay_earned').row();
      if (bal.gift < budget && bal.earned < budget) kb.text('💵 Пополнить', 'adv_topup').row();
      kb.text('❌ Отмена', 'adv_sub_cancel');

      return ctx.reply(
        `<b>Сводка кампании</b>\n\n` +
        `📢 Канал: <b>${esc(ses.data.channel_title)}</b>\n` +
        `🎯 Цель: <b>${ses.data.target_count}</b> подписчиков\n` +
        `💵 Ставка: <b>${fmtUsd(ses.data.reward_cents)}</b> / чел.\n` +
        `💰 Выплаты исполнителям: <b>${fmtUsd(ses.data.payout_budget_cents)}</b>\n` +
        `💼 Комиссия 10%: <b>${fmtUsd(ses.data.fee_cents)}</b> (из них ${fmtUsd(ses.data.sponsor_cents)} спонсору)\n` +
        `────────────\n<b>К оплате: ${fmtUsd(budget)}</b>\n\n` +
        `💳 Gift ${fmtUsd(bal.gift)} · Earned ${fmtUsd(bal.earned)}`,
        { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  // Pay + create in a single atomic transaction
  bot.callbackQuery(/^adv_sub_pay_(gift|earned)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const ses = store.get.session(ctx.from.id);
    if (!ses || ses.flow !== 'adv_sub' || ses.step !== 'confirm') {
      return ctx.reply('Сессия истекла. Начни заново через меню.');
    }
    store.put.setSession(ctx.from.id, null); // L.5: prevent double-tap re-entry
    const wallet = ctx.match[1];
    const user = db.ensureUser(ctx.from);

    // Phase F: api Postgres debit FIRST (atomic check + deduct)
    // wallet 'gift' → api gift_balance_micro; 'earned' → api working balance
    const apiWallet = wallet === 'gift' ? 'gift' : 'working';
    const dr = await debitApi({
      tgId: user.tg_id, wallet: apiWallet, cents: ses.data.budget_cents,
      kind: 'campaign_fund_sub', memo: 'sub campaign: ' + (ses.data.channel_title || '?').slice(0, 60),
    });
    if (!dr || !dr.ok) {
      if (String(dr && dr.error).startsWith('insufficient')) return ctx.reply('❌ Баланса больше не хватает.');
      console.error('[ads] api debit failed', dr);
      return ctx.reply('❌ Ошибка списания: ' + (dr && dr.error || 'unknown'));
    }

    let campaignId;
    try {
      campaignId = store.txn(() => {
        const id = store.put.createCampaign({
          owner_user_id: user.id, kind: 'sub', title: ses.data.channel_title,
          budget_cents: ses.data.budget_cents, reward_cents: ses.data.reward_cents,
          fee_cents: ses.data.fee_cents, sponsor_cents: ses.data.sponsor_cents,
          target_count: ses.data.target_count, paid_wallet: wallet,
          min_karma: ses.data.min_karma || 0,
        });
        store.put.setChannelTask(id, {
          channel_chat_id: ses.data.channel_chat_id,
          channel_username: ses.data.channel_username,
          channel_title: ses.data.channel_title,
          invite_link: ses.data.invite_link,
        });

        // Log the campaign_fund tx (balance already deducted via api above)
        store.put.logTx({ kind: 'campaign_fund', user_id: user.id, wallet, amount_cents: -ses.data.budget_cents, campaign_id: id });

        const poolDelta = ses.data.fee_cents - (user.referred_by ? ses.data.sponsor_cents : 0);
        if (poolDelta > 0) {
          store.put.feePoolDelta(poolDelta);
          store.put.logTx({ kind: 'platform_fee', wallet: 'fee_pool', amount_cents: poolDelta, campaign_id: id });
        }
        return id;
      })();
    } catch (e) {
      // Rollback: refund api balance
      console.error('[ads] sub campaign creation failed after api debit, refunding:', e && e.message);
      try {
        await creditApi({ tgId: user.tg_id, wallet: apiWallet, cents: ses.data.budget_cents,
          kind: 'campaign_fund_refund', memo: 'auto-refund: campaign creation failed' });
      } catch (_) {}
      return ctx.reply('❌ Ошибка при создании кампании, деньги возвращены.');
    }

    // Sponsor bonus AFTER campaign created (api credit)
    if (user.referred_by) {
      try {
        const sponsor = store.get.userById(user.referred_by);
        if (sponsor && sponsor.tg_id) {
          await creditApi({ tgId: sponsor.tg_id, wallet: 'working', cents: ses.data.sponsor_cents,
            kind: 'sponsor_bonus', memo: 'sub campaign #' + campaignId + ' from ref ' + user.id });
          store.put.logTx({ kind: 'sponsor_bonus', user_id: sponsor.id, wallet: 'earned', amount_cents: ses.data.sponsor_cents, campaign_id: campaignId, note: `from referral ${user.id}` });
        }
      } catch (e) { console.warn('[ads] sponsor credit failed:', e && e.message); }
    }

    store.put.clearSession(ctx.from.id);
    await ctx.reply(
      `🚀 <b>Кампания #${campaignId} запущена!</b>\n\n` +
      `Награду зачисляю автоматически при вступлении. Уведомлю при заполнении.`, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('adv_sub_cancel', async (ctx) => {
    await ctx.answerCallbackQuery();
    store.put.clearSession(ctx.from.id);
    await ctx.reply('❌ Создание кампании отменено.');
  });

  // ────────── executor menu ──────────
  async function showExecutorMenu(ctx) {
    const user = db.ensureUser(ctx.from);
    const _localBal = store.get.balances(user.id);
    const bal = await getUnifiedBalances(user, _localBal);
    const subsCount = store.get.activeSubsForExecutor(user.id, 1000).length;
    const myClaims = store.get.myClaims(user.id, 1000);

    const kb = new InlineKeyboard()
      .text(`📢 Подписки на каналы (${subsCount})`, 'exec_subs').row()
      .text(`📝 Задания с отчётом`, 'exec_tasks').row()
      .text(`🎬 Просмотр видео`, 'exec_video').row()
      .text(`📜 Мои заявки (${myClaims.length})`, 'exec_claims').row()
      .text('🎁 Куда зачислять выплаты', 'exec_wallet');

    // Phase J.r2: api Postgres karma_points may be 0 for legacy users — fall back
    // to planner ads_karma so fresh accounts (default 100) aren't false-locked.
    const plannerKarma = (user.ads_karma == null) ? KARMA_INITIAL : user.ads_karma;
    const effKarma = Math.max(Number(bal.karma) || 0, plannerKarma);
    const karmaBar = effKarma >= 80 ? '🟢' : effKarma >= KARMA_MIN_CLAIM ? '🟡' : '🔴';

    // Phase K: karma is per-campaign filter now, not global blocker.
    // Only show karma-info hint when really low (< 40) so user sees how to grow it.
    const karmaWarn = effKarma < 40
      ? `ℹ️ <b>Карма ${effKarma}</b> — некоторые задания требуют более высокой кармы (рекламодатель указывает в фильтре).\n` +
        '   +1 за одобренное задание · −5 за быструю отписку или отклонение\n\n'
      : '';

    await ctx.reply(
      `💰 <b>Задания (заработать)</b>\n\n` +
      `💵 Earned: <b>${fmtUsd(bal.earned)}</b>\n` +
      `🎁 Gift: <b>${fmtUsd(bal.gift)}</b>\n` +
      `${karmaBar} Карма: <b>${effKarma}</b>\n` +
      `📋 Активных подписок: <b>${subsCount}</b>\n\n` +
      karmaWarn +
      `Выполняй задания и зарабатывай. Награда зачисляется автоматически.`,
      { parse_mode: 'HTML', reply_markup: kb });
  }

  bot.callbackQuery('exec_subs', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const list = store.get.activeSubsForExecutor(user.id, 15);
    if (!list.length) return ctx.reply('Сейчас нет доступных заданий. Загляни позже 👀');
    for (const c of list) {
      const remaining = c.target_count - c.completed_count;
      const kb = new InlineKeyboard().text(`✅ Подписаться и получить ${fmtUsd(c.reward_cents)}`, `exec_take_sub_${c.id}`);
      await ctx.reply(
        `📢 <b>${esc(c.channel_title || c.title || 'Канал')}</b>\n` +
        (c.channel_username ? `${esc(c.channel_username)}\n` : '') +
        `\n💵 Награда: <b>${fmtUsd(c.reward_cents)}</b>\n` +
        `📊 Осталось мест: <b>${remaining}</b> / ${c.target_count}`,
        { parse_mode: 'HTML', reply_markup: kb });
    }
  });

  bot.callbackQuery(/^exec_take_sub_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const campaignId = parseInt(ctx.match[1], 10);
    const user = db.ensureUser(ctx.from);

    // Fraud: account age ≥ 3 days
    const age = daysSince(user.created_at);
    if (age < MIN_ACCOUNT_AGE_DAYS) {
      return ctx.reply(`⏳ Аккаунт слишком молодой (${age.toFixed(1)} дн.). Задания доступны с ${MIN_ACCOUNT_AGE_DAYS}-го дня.`);
    }
    // Fraud: karma floor
    if ((user.ads_karma ?? KARMA_INITIAL) < KARMA_MIN_CLAIM) {
      return ctx.reply(`🔴 <b>Карма ниже ${KARMA_MIN_CLAIM}</b>

Текущая: <b>${user.ads_karma ?? KARMA_INITIAL}</b>. Доделай текущие заявки корректно — за каждое одобрение +1.`, { parse_mode: 'HTML' });
    }
    // Rate limit
    const rl = store.put.consumeDailyClaim(user.id, todayStr());
    if (!rl.ok) return ctx.reply(`❌ Дневной лимит ${DAILY_CLAIM_LIMIT} заявок исчерпан.`);

    const c = store.get.campaign(campaignId);
    if (!c || c.status !== 'active' || c.completed_count >= c.target_count) return ctx.reply('❌ Задание неактивно.');
    if (c.owner_user_id === user.id) return ctx.reply('❌ Нельзя брать свою кампанию.');
    // Phase K: per-campaign karma filter
    const _userKarma = Math.max(user.ads_karma ?? KARMA_INITIAL, 0);
    if ((c.min_karma || 0) > _userKarma) {
      return ctx.reply(`🔐 <b>Это задание требует кармы ${c.min_karma}+</b>\n\nТвоя текущая: <b>${_userKarma}</b>. Возьми задания без ограничений или подними карму выполнением подписок.`, { parse_mode: 'HTML' });
    }
    if (store.get.claimByPair(campaignId, user.id)) return ctx.reply('Ты уже брал это задание.');

    const payoutTarget = user.ads_payout_target || 'earned';
    const claimId = store.put.createClaim({
      campaign_id: campaignId, executor_user_id: user.id,
      status: 'claimed', payout_target: payoutTarget, reward_cents: c.reward_cents,
    });

    const link = c.channel?.invite_link ||
      (c.channel?.channel_username ? `https://t.me/${String(c.channel.channel_username).replace(/^@/, '')}` : null);
    const kb = new InlineKeyboard();
    if (link) kb.url('🔗 Перейти в канал', link).row();
    kb.text('🔄 Я подписался — проверить', `recheck_claim_${claimId}`).row();
    kb.text('↩️ К списку', 'exec_subs');

    await ctx.reply(
      `✅ Заявка #${claimId} создана.\n\n` +
      `Подпишись на канал по ссылке ниже — награда ${fmtUsd(c.reward_cents)} зачислится <b>автоматически</b>.\n\n` +
      `Если за 5 секунд не зачислилось — нажми «🔄 Я подписался — проверить».\n\n` +
      `⚠️ Если выйдешь в течение 60 сек. — заявка аннулируется. Отписка в 7 дн. — тоже минус награда.`,
      { parse_mode: 'HTML', reply_markup: kb });

    // Instant check: maybe user already subscribed before claim
    setTimeout(async () => {
      try {
        const r = await tryAutoCreditClaim(ctx, claimId);
        if (r.ok) {
          await ctx.api.sendMessage(ctx.from.id,
            `💸 <b>+${fmtUsd(r.reward_cents)}</b>\n\nЗадание «${esc(r.channel_title)}» зачислено (ты уже был подписан).`,
            { parse_mode: 'HTML' });
        }
      } catch (_) {}
    }, 1500);
  });

  bot.callbackQuery('exec_tasks', async (ctx) => {
    await ctx.answerCallbackQuery();
    const list = store.get.activeCustomCampaigns(15);
    if (!list.length) {
      return ctx.reply('📝 Сейчас нет доступных заданий с отчётом. Загляни позже.', {
        reply_markup: new InlineKeyboard().text('🔙 К меню', 'exec_subs').text('💼 Мои заявки', 'exec_claims'),
      });
    }
    let text = `📝 <b>Задания с отчётом</b> (${list.length})\n\n`;
    const kb = new InlineKeyboard();
    list.slice(0, 8).forEach((c, i) => {
      const remaining = (c.target_count || 0) - (c.completed_count || 0);
      text += `<b>${i+1}. ${esc((c.description || '').slice(0, 60))}…</b>\n`;
      text += `💵 <b>${fmtUsd(c.reward_cents)}</b> · 📊 ${remaining} мест${c.photo_required ? ' · 📸 фото нужно' : ''}\n\n`;
      kb.text(`✅ Взять #${c.id} (${fmtUsd(c.reward_cents)})`, 'exec_take_task_' + c.id).row();
    });
    kb.text('🔙 К меню', 'exec_subs');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });
  bot.callbackQuery('exec_video', async (ctx) => {
    await ctx.answerCallbackQuery();
    const list = store.get.activeVideoCampaigns(15);
    if (!list.length) {
      return ctx.reply('🎬 Сейчас нет видео-заданий. Загляни позже.', {
        reply_markup: new InlineKeyboard().text('🔙 К меню', 'exec_subs'),
      });
    }
    let text = `🎬 <b>Видео-задания</b> (${list.length})\n\n`;
    const kb = new InlineKeyboard();
    list.slice(0, 8).forEach((c, i) => {
      const remaining = (c.target_count || 0) - (c.completed_count || 0);
      const modeLabel = { text_report: '✏️ короткий отчёт', quiz: '🧪 квиз', voice_report: '🎤 голос-отчёт' }[c.validation_mode] || '?';
      text += `<b>${i+1}. ${esc((c.video_title || 'Видео').slice(0, 60))}</b>\n`;
      text += `💵 ${fmtUsd(c.reward_cents)} · ⏱ ${c.video_duration_sec || '?'}с · ${modeLabel} · 📊 ${remaining}\n\n`;
      kb.text(`▶️ Взять #${c.id}`, 'exec_take_video_' + c.id).row();
    });
    kb.text('🔙 К меню', 'exec_subs');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery('exec_claims', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const list = store.get.myClaims(user.id, 20);
    if (!list.length) return ctx.reply('Заявок пока нет.');
    const lines = list.map((cl) => {
      const icon = { claimed: '🟡', submitted: '🔵', approved: '🟢', paid: '💸', rejected: '❌', expired: '⏰', rework: '🔄' }[cl.status] || '•';
      let line = `${icon} #${cl.id} · ${esc(cl.title || cl.kind)} · ${fmtUsd(cl.reward_cents)} · ${cl.status}`;
      // L.22: show decision_note / reject_reason so executor sees why
      if ((cl.status === 'rework' || cl.status === 'rejected') && cl.reject_reason) {
        line += `\n   💬 ${esc(String(cl.reject_reason).slice(0, 200))}`;
      }
      return line;
    });
    await ctx.reply(lines.join('\n'));
  });

  bot.callbackQuery('exec_wallet', async (ctx) => {
    await ctx.answerCallbackQuery();
    const user = db.ensureUser(ctx.from);
    const cur = user.ads_payout_target || 'earned';
    const kb = new InlineKeyboard()
      .text((cur === 'earned' ? '✅ ' : '') + '💵 Earned (вывод от $10)', 'exec_wallet_earned').row()
      .text((cur === 'gift' ? '✅ ' : '') + '🎁 Gift (на свою рекламу)', 'exec_wallet_gift');
    await ctx.reply(
      `Куда зачислять награды:\n\n` +
      `<b>Earned</b> — заработано, вывод на карту/крипто при балансе $10+.\n` +
      `<b>Gift</b> — рекламный бюджет для своих кампаний.\n\n` +
      `Текущий: <b>${cur}</b>`, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/^exec_wallet_(earned|gift)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const target = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    store.put.setPayoutTarget(user.id, target);
    await ctx.reply(`✅ Теперь выплаты зачисляются на <b>${target}</b>-баланс.`, { parse_mode: 'HTML' });
  });

  // Phase H: manual recheck — for cases where chat_member event missed
  bot.callbackQuery(/^recheck_claim_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const claimId = parseInt(ctx.match[1], 10);
    const r = await tryAutoCreditClaim(ctx, claimId);
    if (r.ok) {
      await ctx.reply(
        `💸 <b>+${fmtUsd(r.reward_cents)}</b>\n\nЗадание «${esc(r.channel_title)}» зачислено!`,
        { parse_mode: 'HTML' });
    } else if (r.reason === 'not_subscribed') {
      await ctx.reply(`❌ Ты ещё не подписан на канал. Подпишись и нажми проверку снова.`);
    } else if (r.reason === 'not_claimable') {
      await ctx.reply(`ℹ️ Заявка уже закрыта или не существует.`);
    } else {
      await ctx.reply(`⚠️ Не получилось проверить (${r.reason || 'unknown'}). Попробуй через минуту.`);
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // Phase I: take task/video handlers + deeplink-friendly take fns
  // ════════════════════════════════════════════════════════════════════
  async function _commonTakeChecks(ctx, campaignId, expectedKind) {
    const user = db.ensureUser(ctx.from);
    const age = daysSince(user.created_at);
    if (age < MIN_ACCOUNT_AGE_DAYS) {
      await ctx.reply(`⏳ Аккаунт слишком молодой (${age.toFixed(1)} дн.). Задания доступны с ${MIN_ACCOUNT_AGE_DAYS}-го дня.`);
      return null;
    }
    if ((user.ads_karma ?? KARMA_INITIAL) < KARMA_MIN_CLAIM) {
      await ctx.reply(`🔴 <b>Карма ниже ${KARMA_MIN_CLAIM}</b>

Текущая: <b>${user.ads_karma ?? KARMA_INITIAL}</b>. Доделай текущие заявки корректно — за каждое одобрение +1.`, { parse_mode: 'HTML' });
      return null;
    }
    const rl = store.put.consumeDailyClaim(user.id, todayStr());
    if (!rl.ok) { await ctx.reply(`❌ Дневной лимит ${DAILY_CLAIM_LIMIT} заявок исчерпан.`); return null; }
    const c = store.get.campaign(campaignId);
    if (!c || c.status !== 'active' || c.completed_count >= c.target_count) {
      await ctx.reply('❌ Задание неактивно.'); return null;
    }
    if (expectedKind && c.kind !== expectedKind) {
      await ctx.reply('❌ Не тот тип задания.'); return null;
    }
    if (c.owner_user_id === user.id) { await ctx.reply('❌ Нельзя брать свою кампанию.'); return null; }
    // Phase K: per-campaign karma filter
    const _userKarma = Math.max(user.ads_karma ?? KARMA_INITIAL, 0);
    if ((c.min_karma || 0) > _userKarma) {
      await ctx.reply(`🔐 <b>Это задание требует кармы ${c.min_karma}+</b>\n\nТвоя текущая: <b>${_userKarma}</b>. Возьми задания без ограничений или подними карму выполнением подписок.`, { parse_mode: 'HTML' });
      return null;
    }
    return { user, c };
  }

  async function takeTaskCampaign(ctx, campaignId) {
    const r = await _commonTakeChecks(ctx, campaignId, 'task');
    if (!r) return;
    const { user, c } = r;
    if (store.get.claimByPair(campaignId, user.id)) return ctx.reply('Ты уже брал это задание.');
    const task = rawDb.prepare('SELECT * FROM ad_custom_tasks WHERE campaign_id = ?').get(campaignId);
    if (!task) return ctx.reply('❌ Параметры задания не найдены.');
    const payoutTarget = user.ads_payout_target || 'earned';
    const claimId = store.put.createClaim({
      campaign_id: campaignId, executor_user_id: user.id,
      status: 'claimed', payout_target: payoutTarget, reward_cents: c.reward_cents,
    });
    // Put executor into submit_report flow — handleMessage will catch the next message
    store.put.setSession(ctx.from.id, {
      flow: 'submit_report', step: 'await',
      data: { claim_id: claimId, campaign_id: campaignId, photo_required: !!task.photo_required },
    });
    let txt = `✅ <b>Заявка #${claimId} создана</b>\n\n`;
    txt += `<b>Задание:</b>\n${esc((task.description || '').slice(0, 600))}\n\n`;
    if (task.report_format) txt += `<b>Что нужно прислать:</b>\n${esc(task.report_format.slice(0, 300))}\n\n`;
    txt += task.photo_required
      ? `📸 Пришли <b>фото</b> с подписью или без — прямо следующим сообщением.\n`
      : `📝 Пришли <b>текст</b> или <b>фото</b> с описанием — следующим сообщением.\n`;
    txt += `\n💵 Награда: <b>${fmtUsd(c.reward_cents)}</b> (придёт после проверки автором).`;
    const kb = new InlineKeyboard().text('❌ Отменить', `task_cancel_${claimId}`);
    await ctx.reply(txt, { parse_mode: 'HTML', reply_markup: kb });
  }

  async function takeVideoCampaign(ctx, campaignId) {
    const r = await _commonTakeChecks(ctx, campaignId, 'video');
    if (!r) return;
    const { user, c } = r;
    if (store.get.videoClaimByPair && store.get.videoClaimByPair(campaignId, user.id)) {
      return ctx.reply('Ты уже брал это видео.');
    }
    const video = rawDb.prepare('SELECT * FROM ad_video_tasks WHERE campaign_id = ?').get(campaignId);
    const payoutTarget = user.ads_payout_target || 'earned';
    const vClaimId = store.put.createVideoClaim({
      campaign_id: campaignId, executor_user_id: user.id,
      reward_cents: c.reward_cents, payout_target: payoutTarget,
    });
    let txt = `▶️ <b>Видео-задание принято</b>\n\n`;
    if (video?.video_title) txt += `<b>${esc(video.video_title)}</b>\n`;
    if (video?.video_url) txt += `🔗 ${esc(video.video_url)}\n`;
    if (video?.video_duration_sec) txt += `⏱ ${video.video_duration_sec} сек.\n`;
    txt += `\n💵 Награда: <b>${fmtUsd(c.reward_cents)}</b> (после подтверждения просмотра).`;
    const kb = new InlineKeyboard();
    if (video?.video_url) kb.url('▶️ Открыть видео', video.video_url).row();
    kb.text('✅ Я посмотрел — отправить отчёт', `video_report_${vClaimId}`);
    await ctx.reply(txt, { parse_mode: 'HTML', reply_markup: kb });
  }

  bot.callbackQuery(/^exec_take_task_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return takeTaskCampaign(ctx, parseInt(ctx.match[1], 10));
  });
  bot.callbackQuery(/^exec_take_video_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    return takeVideoCampaign(ctx, parseInt(ctx.match[1], 10));
  });
  bot.callbackQuery(/^task_cancel_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery('Отменено');
    const claimId = parseInt(ctx.match[1], 10);
    rawDb.prepare("UPDATE ad_task_claims SET status='expired', decision_note='user_cancel' WHERE id = ? AND status = 'claimed'").run(claimId);
    store.put.setSession(ctx.from.id, null);
    try { await ctx.editMessageText('Заявка отменена.'); }
    catch (_) { try { await ctx.reply('Заявка отменена.'); } catch (_) {} }
  });

  // Expose for deeplink dispatcher in /start (top-level dispatchAdsDeeplink reads this)
  setupAds._takesByKind = { task: takeTaskCampaign, video: takeVideoCampaign };

  // ════════════════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════════════════
  // Phase J: report moderation (advertiser presses inline buttons on submitted report)
  // ════════════════════════════════════════════════════════════════════════════
  bot.callbackQuery(/^report_decide:(approve|reject|rework|ai):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const decision = ctx.match[1];
    const claimId = parseInt(ctx.match[2], 10);
    const cl = store.get.claim(claimId);
    if (!cl) return ctx.reply('❌ Заявка не найдена.');
    const camp = store.get.campaign(cl.campaign_id);
    const owner = camp && rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(camp.owner_user_id);
    if (!owner || owner.tg_id !== ctx.from.id) return ctx.reply('❌ Это не твоя кампания.');

    if (decision === 'approve') {
      const res = await store.put.decideClaim({ claim_id: claimId, decision: 'approve' });
      if (!res.ok) return ctx.reply('❌ ' + (res.reason || res.error || 'unknown'));
      try { await ctx.editMessageText(`✅ <b>Отчёт принят</b>\n\nНаграда ${fmtUsd(res.paid_cents)} начислена исполнителю.`, { parse_mode: 'HTML' }); }
      catch (_) { try { await ctx.reply(`✅ Принято. Награда ${fmtUsd(res.paid_cents)} начислена.`); } catch (_) {} }
      // Notify executor
      try {
        await ctx.api.sendMessage(res.executor_tg_id || res.executor_user_id,
          `💸 <b>+${fmtUsd(res.paid_cents)}</b>\n\nТвой отчёт по кампании #${cl.campaign_id} принят. Награда зачислена.`,
          { parse_mode: 'HTML' });
      } catch (_) {}
      return;
    }

    if (decision === 'reject' || decision === 'rework') {
      store.put.setSession(ctx.from.id, {
        flow: 'decide_reason', step: 'await',
        data: { claim_id: claimId, decision },
      });
      const txt = decision === 'reject'
        ? `❌ <b>Отклонить отчёт #${claimId}</b>\n\nНапиши причину следующим сообщением (минимум 3 символа). Исполнитель получит её и может взять другое задание.`
        : `🔄 <b>Отправить на доработку #${claimId}</b>\n\nНапиши <b>что именно</b> нужно доработать. Исполнитель получит твой комментарий и сможет прислать исправленный отчёт.`;
      return ctx.reply(txt, { parse_mode: 'HTML' });
    }

    if (decision === 'ai') {
      // L.7: guard — don't waste Groq quota on already-decided claims
      if (!['submitted', 'rework'].includes(cl.status)) {
        return ctx.reply(`ℹ️ Заявка уже ${cl.status} — AI-проверка не нужна.`);
      }
      try {
        const checker = require('./services/ai-task-checker');
        const rep = rawDb.prepare('SELECT * FROM ad_custom_task_reports WHERE claim_id = ? ORDER BY id DESC LIMIT 1').get(claimId);
        const task = rawDb.prepare('SELECT * FROM ad_custom_tasks WHERE campaign_id = ?').get(cl.campaign_id);
        if (!rep || !task) return ctx.reply('❌ Нет данных для AI-проверки.');
        await ctx.reply('🤖 AI проверяет отчёт…');
        const r = rep.photo_url
          ? await checker.checkPhotoReport({ criteria: task.ai_check_criteria || task.report_format || task.description, photoUrl: rep.photo_url, taskDescription: task.description })
          : await checker.checkTextReport({ criteria: task.ai_check_criteria || task.report_format || task.description, reportText: rep.report_text || '', taskDescription: task.description });
        rawDb.prepare('UPDATE ad_custom_task_reports SET ai_score=?, ai_verdict=?, ai_reasoning=? WHERE id=?')
          .run(r.score || null, r.verdict || null, r.reasoning || null, rep.id);
        const icon = r.verdict === 'approve' ? '✅' : r.verdict === 'reject' ? '❌' : '🤔';
        return ctx.reply(
          `${icon} <b>AI-проверка</b>\n\nScore: <b>${r.score}/100</b>\nВердикт: <b>${r.verdict}</b>\n\n<i>${esc((r.reasoning || '').slice(0, 800))}</i>\n\nРешение остаётся за тобой — кнопки выше всё ещё активны.`,
          { parse_mode: 'HTML' }
        );
      } catch (e) {
        return ctx.reply('❌ AI-проверка не удалась: ' + (e && e.message || 'unknown'));
      }
    }
  });

  // Phase J: rework loop — executor resubmits after rework
  bot.callbackQuery(/^resubmit_report_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const claimId = parseInt(ctx.match[1], 10);
    const cl = store.get.claim(claimId);
    if (!cl) return ctx.reply('❌ Заявка не найдена.');
    const exec = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(cl.executor_user_id);
    if (!exec || exec.tg_id !== ctx.from.id) return ctx.reply('❌ Это не твоя заявка.');
    if (cl.status !== 'rework') return ctx.reply('Эта заявка не на доработке (status=' + cl.status + ').');
    const task = rawDb.prepare('SELECT * FROM ad_custom_tasks WHERE campaign_id = ?').get(cl.campaign_id);
    store.put.setSession(ctx.from.id, {
      flow: 'submit_report', step: 'await',
      data: { claim_id: claimId, campaign_id: cl.campaign_id, photo_required: !!(task && task.photo_required) },
    });
    let txt = `🔄 <b>Доработка отчёта #${claimId}</b>\n\n`;
    if (cl.reject_reason) txt += `<b>Комментарий заказчика:</b>\n${esc(cl.reject_reason)}\n\n`;
    txt += task && task.photo_required
      ? `📸 Пришли исправленное <b>фото</b> с подписью или без — следующим сообщением.`
      : `📝 Пришли исправленный <b>текст</b> или фото — следующим сообщением.`;
    return ctx.reply(txt, { parse_mode: 'HTML' });
  });

  // L.3: video report handler (was MISSING — executor's "Я посмотрел" was a dead button)
  bot.callbackQuery(/^video_report_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const vClaimId = parseInt(ctx.match[1], 10);
    const cl = rawDb.prepare('SELECT * FROM ad_video_claims WHERE id = ?').get(vClaimId);
    if (!cl) return ctx.reply('❌ Заявка не найдена.');
    const exec = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(cl.executor_user_id);
    if (!exec || exec.tg_id !== ctx.from.id) return ctx.reply('❌ Это не твоя заявка.');
    if (cl.status !== 'claimed') return ctx.reply('Эта заявка уже обработана (status=' + cl.status + ').');
    const v = store.get.videoTaskByCampaign(cl.campaign_id);
    if (!v) return ctx.reply('❌ Параметры видео не найдены.');
    const mode = v.validation_mode || 'text_report';
    if (mode === 'quiz') {
      // Quiz: present questions (out of scope for this fix — fall back to text)
      store.put.setSession(ctx.from.id, { flow: 'video_text', step: 'await', data: { claim_id: vClaimId, campaign_id: cl.campaign_id } });
      await ctx.reply('✏️ Напиши кратко о чём было видео (1-3 предложения):');
    } else if (mode === 'voice_report') {
      store.put.setSession(ctx.from.id, { flow: 'video_voice', step: 'await', data: { claim_id: vClaimId, campaign_id: cl.campaign_id } });
      await ctx.reply('🎤 Запиши голосовое сообщение с кратким пересказом видео:');
    } else {
      store.put.setSession(ctx.from.id, { flow: 'video_text', step: 'await', data: { claim_id: vClaimId, campaign_id: cl.campaign_id } });
      await ctx.reply('✏️ Напиши кратко о чём было видео (1-3 предложения):');
    }
  });

  // Phase R.2: daily-plan add-to-planner from morning DM
  bot.callbackQuery(/^dp_add:(\d{4}-\d{2}-\d{2}):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const day = ctx.match[1];
    const idx = parseInt(ctx.match[2], 10);
    const user = db.ensureUser(ctx.from);
    const row = rawDb.prepare('SELECT plan_json FROM daily_plans WHERE user_id=? AND day=?').get(user.id, day);
    if (!row) return ctx.reply('План не найден. Открой /cabinet → Мой план.');
    let plan = null;
    try { plan = JSON.parse(row.plan_json); } catch (_) {}
    if (!plan || !plan[idx]) return ctx.reply('Задача не найдена.');
    const t = plan[idx];
    try {
      const { createTask } = require('./planner/db/database');
      createTask(user.id, {
        title: t.title,
        description: t.description || '',
        priority: t.priority || 2,
        due_date: day,
        due_time: t.suggested_time || null,
      });
      await ctx.reply(`✅ Добавлено в планировщик: <b>${esc(t.title)}</b>${t.suggested_time ? ' на ' + esc(t.suggested_time) : ''}`, { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply('❌ Не удалось добавить: ' + (e && e.message || 'unknown'));
    }
  });

  bot.callbackQuery(/^dp_refresh:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    await ctx.answerCallbackQuery('Генерирую новый план…');
    const day = ctx.match[1];
    const user = db.ensureUser(ctx.from);
    try {
      const { generateDailyPlan } = require('./services/daily-plan');
      const plan = await generateDailyPlan({ profile: {}, answers: {}, day });
      rawDb.prepare('INSERT OR REPLACE INTO daily_plans (user_id, day, plan_json) VALUES (?, ?, ?)')
        .run(user.id, day, JSON.stringify(plan));
      let txt = '📅 <b>Новый план на ' + day + ':</b>\n\n';
      plan.slice(0, 5).forEach(function (t, i) {
        const prio = t.priority === 1 ? '🔴' : t.priority === 2 ? '🟡' : '⚪';
        txt += `${i + 1}. ${prio} <b>${esc(t.title)}</b> · ${t.time_min}мин${t.suggested_time ? ' · ⏰' + t.suggested_time : ''}\n`;
        if (t.description) txt += `   <i>${esc(t.description.slice(0, 200))}</i>\n`;
      });
      const kb = new InlineKeyboard();
      plan.slice(0, 5).forEach(function(t, i) {
        kb.text(`✅ #${i + 1}`, `dp_add:${day}:${i}`);
        if (i % 2 === 1 || i === plan.length - 1) kb.row();
      });
      await ctx.reply(txt, { parse_mode: 'HTML', reply_markup: kb });
    } catch (e) {
      await ctx.reply('❌ Не удалось сгенерировать план: ' + (e && e.message || 'unknown'));
    }
  });

  // Phase S.1: "Мой баннер" — DM the user their personal Golden Connect banner
  bot.command(['banner', 'mybanner'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const row = rawDb.prepare('SELECT video_banner_path, video_banner_status, ref_code FROM users WHERE id=?').get(u.id);
    if (!row || !row.ref_code) return ctx.reply('У тебя ещё нет ref_code. Напиши /start.');
    let bannerInfo = null;
    if (row.video_banner_path && row.video_banner_status === 'ready') {
      const isMp4 = row.video_banner_path.endsWith('.mp4');
      bannerInfo = { path: row.video_banner_path, isVideo: isMp4 };
    } else {
      try {
        const { generateBanner } = require('./services/personal-banner');
        const dn = u.tg_username ? '@' + u.tg_username : (u.tg_first_name || 'Партнёр Golden Connect');
        bannerInfo = await generateBanner({ userId: u.id, refCode: row.ref_code, displayName: dn });
        rawDb.prepare("UPDATE users SET video_banner_path=?, video_banner_status='ready', video_banner_generated_at=datetime('now') WHERE id=?").run(bannerInfo.path, u.id);
      } catch (e) { return ctx.reply('❌ Не удалось сгенерировать: ' + (e && e.message || 'unknown')); }
    }
    try {
      const { InputFile } = require('grammy');
      const fileObj = new InputFile(bannerInfo.path);
      const caption = '🎨 <b>Твой персональный баннер Golden Connect</b>\n\n📱 QR-код ведёт на твою реф-ссылку.\nДелись в Telegram / Instagram / любых чатах.';
      if (bannerInfo.isVideo) {
        await ctx.replyWithVideo(fileObj, { caption, parse_mode: 'HTML' });
      } else {
        await ctx.replyWithPhoto(fileObj, { caption, parse_mode: 'HTML' });
      }
    } catch (e) { await ctx.reply('Ошибка отправки: ' + e.message); }
  });

  // ────────── chat_member: auto-verify / quick-leave retract ──────────
  bot.on('chat_member', async (ctx) => {
    try {
      const upd = ctx.chatMember || ctx.update?.chat_member;
      if (!upd) return;
      const newStatus = upd.new_chat_member?.status;
      const oldStatus = upd.old_chat_member?.status;
      const subjectTgId = upd.new_chat_member?.user?.id;
      const channelChatId = upd.chat?.id;
      if (!subjectTgId || !channelChatId) return;

      const joinedNow = ['member', 'administrator', 'creator'].includes(newStatus) &&
                        !['member', 'administrator', 'creator'].includes(oldStatus);
      const leftNow   = ['left', 'kicked'].includes(newStatus) &&
                        !['left', 'kicked'].includes(oldStatus);

      if (joinedNow) return handleChannelJoin(ctx, channelChatId, subjectTgId);
      if (leftNow)   return handleChannelLeave(ctx, channelChatId, subjectTgId);
    } catch (e) {
      console.error('[ads] chat_member error', e && e.message);
    }
  });


  // Phase H: instant getChatMember check + 'recheck' button — credits user even if
  // chat_member event never arrives (e.g. user subscribed before bot became admin).
  async function tryAutoCreditClaim(ctx, claimId) {
    const claim = store.get.claim(claimId);
    if (!claim || claim.status !== 'claimed') return { ok: false, reason: 'not_claimable' };
    const campaign = store.get.campaign(claim.campaign_id);
    if (!campaign || campaign.status !== 'active') return { ok: false, reason: 'campaign_inactive' };
    const channel = rawDb.prepare('SELECT * FROM ad_channel_tasks WHERE campaign_id = ?').get(claim.campaign_id);
    if (!channel || !channel.channel_chat_id) return { ok: false, reason: 'no_channel' };
    const executor = store.get.userById(claim.executor_user_id);
    if (!executor) return { ok: false, reason: 'no_executor' };

    let mem;
    try {
      mem = await ctx.api.getChatMember(channel.channel_chat_id, executor.tg_id);
    } catch (e) {
      return { ok: false, reason: 'check_failed', error: e && e.message };
    }
    const status = mem && mem.status;
    if (!['member', 'administrator', 'creator'].includes(status)) {
      return { ok: false, reason: 'not_subscribed', status };
    }

    try {
      store.txn(() => {
        const target = claim.payout_target || 'earned';
        store.put.balanceDelta(executor.id, target, claim.reward_cents);
        store.put.updateClaim(claim.id, { status: 'paid', decided_at: new Date().toISOString() });
        store.put.incCompleted(campaign.id);
        store.put.karmaDelta(executor.id, +1);
        store.put.logChannelJoin({ campaign_id: campaign.id, executor_user_id: executor.id, channel_chat_id: channel.channel_chat_id });
        store.put.logTx({ kind: 'claim_reward', user_id: executor.id, wallet: target, amount_cents: claim.reward_cents, campaign_id: campaign.id, claim_id: claim.id, note: 'auto_recheck' });
      })();
    } catch (e) {
      return { ok: false, reason: 'credit_txn_failed', error: e && e.message };
    }
    return { ok: true, reward_cents: claim.reward_cents, channel_title: channel.channel_title };
  }

  async function handleChannelJoin(ctx, channelChatId, subjectTgId) {
    const executor = store.get.userByTgId(subjectTgId);
    if (!executor) return;
    const campaign = store.get.activeChannelCampaign(channelChatId);
    if (!campaign || campaign.owner_user_id === executor.id) return;

    const claim = store.get.claimByPair(campaign.id, executor.id);
    if (!claim || claim.status !== 'claimed') return;

    try {
      store.txn(() => {
        const target = claim.payout_target || 'earned';
        store.put.balanceDelta(executor.id, target, claim.reward_cents);
        store.put.updateClaim(claim.id, { status: 'paid', decided_at: new Date().toISOString() });
        store.put.incCompleted(campaign.id);
        store.put.karmaDelta(executor.id, +1);
        store.put.logChannelJoin({ campaign_id: campaign.id, executor_user_id: executor.id, channel_chat_id: channelChatId });
        store.put.logTx({ kind: 'claim_reward', user_id: executor.id, wallet: target, amount_cents: claim.reward_cents, campaign_id: campaign.id, claim_id: claim.id });
      })();
    } catch (e) { return console.error('[ads] join credit txn failed', e && e.message); }

    const fresh = store.get.campaign(campaign.id);
    if (fresh.completed_count >= fresh.target_count) {
      store.put.setCampaignStatus(campaign.id, 'done');
      const owner = store.get.userById(fresh.owner_user_id);
      if (owner) try { await ctx.api.sendMessage(owner.tg_id,
        `🎉 <b>Кампания #${campaign.id} завершена!</b>\n${esc(campaign.channel_title)} · ${fresh.completed_count}/${fresh.target_count}`,
        { parse_mode: 'HTML' }); } catch (_) {}
    } else if ((fresh.completed_count * 10) % fresh.target_count < 10) {
      const owner = store.get.userById(fresh.owner_user_id);
      if (owner) try { await ctx.api.sendMessage(owner.tg_id, `✅ Кампания #${campaign.id}: ${fresh.completed_count}/${fresh.target_count}`); } catch (_) {}
    }

    try {
      await ctx.api.sendMessage(executor.tg_id,
        `💸 <b>+${fmtUsd(claim.reward_cents)}</b>\n\nЗадание «${esc(campaign.channel_title)}» выполнено.`,
        { parse_mode: 'HTML' });
    } catch (_) {}
  }

  async function handleChannelLeave(ctx, channelChatId, subjectTgId) {
    const executor = store.get.userByTgId(subjectTgId);
    if (!executor) return;
    store.put.markChannelLeft(channelChatId, executor.id);

    // Quick-leave check: find last join within 60s → instant retract
    const j = store.get.lastChannelJoin(channelChatId, executor.id);
    if (!j || j.reward_retracted) return;
    const secondsHeld = (Date.now() - new Date(j.joined_at).getTime()) / 1000;
    if (secondsHeld > QUICK_LEAVE_SECONDS) return;   // slow leave — handled by antileaver cron

    const claim = db.getDb ?
      db.getDb().prepare(`SELECT * FROM ad_task_claims WHERE campaign_id = ? AND executor_user_id = ? AND status = 'paid'`).get(j.campaign_id, executor.id)
      : null;
    if (!claim) return;

    try {
      store.txn(() => {
        const target = claim.payout_target || 'earned';
        store.put.balanceDelta(executor.id, target, -claim.reward_cents);
        store.put.updateClaim(claim.id, { status: 'expired', decision_note: 'quick leave (<60s)' });
        store.put.markJoinRetracted(j.id);
        store.put.karmaDelta(executor.id, -5);
        store.put.logTx({ kind: 'reward_retract', user_id: executor.id, wallet: target, amount_cents: -claim.reward_cents, campaign_id: j.campaign_id, claim_id: claim.id, note: 'quick leave' });
      })();
    } catch (e) { return console.error('[ads] quick-leave retract failed', e && e.message); }

    try { await ctx.api.sendMessage(executor.tg_id,
      `⚠️ Награда ${fmtUsd(claim.reward_cents)} аннулирована — выход из канала в течение минуты. Карма −5.`); } catch (_) {}
  }

  // ────────── helper: is bot admin in chat ──────────
  async function checkBotIsAdmin(api, chatId) {
    try {
      const me = await api.getMe();
      const m = await api.getChatMember(chatId, me.id);
      return ['administrator', 'creator'].includes(m.status);
    } catch (_) { return false; }
  }

  // ────────── cron 1: verify bot-admin on every active sub-campaign ──────────
  async function adminStatusCron() {
    try {
      const list = store.get.activeSubCampaigns();
      for (const c of list) {
        const ok = await checkBotIsAdmin(bot.api, c.channel_chat_id);
        const cur = store.get.campaign(c.id);
        if (!ok && cur.status === 'active') {
          store.put.setCampaignStatus(c.id, 'paused_missing_admin');
          const owner = store.get.userById(c.owner_user_id);
          if (owner) try { await bot.api.sendMessage(owner.tg_id,
            `⚠️ <b>Кампания #${c.id} на паузе</b> — я больше не админ в канале «${esc(c.channel_title)}».\n\n` +
            `Добавь меня обратно и нажми «▶️ Возобновить» в «Мои кампании».`,
            { parse_mode: 'HTML' }); } catch (_) {}
        } else if (ok && cur.status === 'paused_missing_admin') {
          store.put.setCampaignStatus(c.id, 'active');
          const owner = store.get.userById(c.owner_user_id);
          if (owner) try { await bot.api.sendMessage(owner.tg_id,
            `✅ Кампания #${c.id} снова активна — админство восстановлено.`); } catch (_) {}
        }
      }
    } catch (e) {
      console.error('[ads] admin-status cron error', e && e.message);
    }
  }
  setInterval(adminStatusCron, ADMIN_CHECK_INTERVAL_MS);
  setTimeout(adminStatusCron, 30 * 1000);  // first pass 30s after boot

  // Phase Q: gentle reminder for stuck 'claimed' claims (no report yet)
  function claimReminderCron() {
    try {
      const c12 = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
      const c10 = new Date(Date.now() - 10 * 3600 * 1000).toISOString();
      const c36 = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
      const c34 = new Date(Date.now() - 34 * 3600 * 1000).toISOString();
      // 12h reminder window (claimed 12-10h ago, no reminder yet)
      const r12 = rawDb.prepare(`SELECT cl.id, cl.executor_user_id, u.tg_id, c.id AS camp_id
        FROM ad_task_claims cl JOIN ad_campaigns c ON c.id=cl.campaign_id JOIN users u ON u.id=cl.executor_user_id
        WHERE cl.status='claimed' AND cl.claimed_at BETWEEN ? AND ?
          AND (cl.decision_note IS NULL OR cl.decision_note NOT LIKE '%reminder_12h%')`).all(c12, c10);
      for (const r of r12) {
        try {
          bot.api.sendMessage(r.tg_id,
            `⏰ <b>Напоминание про задание #${r.id}</b>

` +
            `Прошло 12 часов с момента взятия. Не забудь прислать <b>фото-отчёт</b> прямо в этот чат — иначе через 60 часов заявка автоматически закроется без выплаты.

` +
            `Если уже сделал но не понял куда отправить: просто отправь скриншот сюда (этим сообщением).`,
            { parse_mode: 'HTML' });
          rawDb.prepare("UPDATE ad_task_claims SET decision_note=COALESCE(decision_note,'')||'reminder_12h ' WHERE id=?").run(r.id);
        } catch (_) {}
      }
      const r36 = rawDb.prepare(`SELECT cl.id, cl.executor_user_id, u.tg_id
        FROM ad_task_claims cl JOIN users u ON u.id=cl.executor_user_id
        WHERE cl.status='claimed' AND cl.claimed_at BETWEEN ? AND ?
          AND (cl.decision_note IS NULL OR cl.decision_note NOT LIKE '%reminder_36h%')`).all(c36, c34);
      for (const r of r36) {
        try {
          bot.api.sendMessage(r.tg_id,
            `⚠️ <b>Последнее напоминание #${r.id}</b>

` +
            `Осталось 36 часов до автозакрытия заявки. Пришли фото-отчёт сюда чтобы получить награду.`,
            { parse_mode: 'HTML' });
          rawDb.prepare("UPDATE ad_task_claims SET decision_note=COALESCE(decision_note,'')||'reminder_36h ' WHERE id=?").run(r.id);
        } catch (_) {}
      }
      if (r12.length || r36.length) console.log(`[ads] reminders: 12h=${r12.length} 36h=${r36.length}`);
    } catch (e) { console.error('[ads] reminder cron', e && e.message); }
  }
  setInterval(claimReminderCron, 60 * 60_000);  // every hour

  // L.12: auto-expire claims stuck in 'claimed' state past CLAIM_TTL_HOURS
  function claimExpireCron() {
    try {
      const cutoff = new Date(Date.now() - CLAIM_TTL_HOURS * 3600 * 1000).toISOString();
      const expired = rawDb.prepare(
        "UPDATE ad_task_claims SET status = 'expired', decision_note = 'claim_ttl_expired' WHERE status = 'claimed' AND claimed_at < ?"
      ).run(cutoff);
      const expiredV = rawDb.prepare(
        "UPDATE ad_video_claims SET status = 'expired' WHERE status = 'claimed' AND created_at < ?"
      ).run(cutoff);
      if (expired.changes || expiredV.changes) {
        console.log(`[ads] claim-expire: task=${expired.changes} video=${expiredV.changes}`);
      }
    } catch (e) { console.error('[ads] claim-expire cron', e && e.message); }
  }
  setInterval(claimExpireCron, 30 * 60_000); // every 30 min

  // ────────── cron 2: antileaver (7-day window) ──────────
  function antileaverCron() {
    try {
      const rawDb = db.getDb ? db.getDb() : db;
      const cutoff = new Date(Date.now() - ANTILEAVE_HOURS * 3600 * 1000).toISOString();
      const bad = rawDb.prepare(`
        SELECT * FROM ad_channel_joins
        WHERE left_at IS NOT NULL AND reward_retracted = 0 AND joined_at > ?
      `).all(cutoff);
      for (const j of bad) {
        const claim = rawDb.prepare(
          `SELECT * FROM ad_task_claims WHERE campaign_id = ? AND executor_user_id = ? AND status = 'paid'`
        ).get(j.campaign_id, j.executor_user_id);
        if (!claim) continue;
        const exec = store.get.userById(j.executor_user_id);
        if (!exec) continue;

        try {
          store.txn(() => {
            const target = claim.payout_target || 'earned';
            store.put.balanceDelta(exec.id, target, -claim.reward_cents);
            store.put.updateClaim(claim.id, { status: 'expired', decision_note: 'left channel within 7d' });
            store.put.markJoinRetracted(j.id);
            store.put.karmaDelta(exec.id, -3);
            store.put.logTx({ kind: 'reward_retract', user_id: exec.id, wallet: target, amount_cents: -claim.reward_cents, campaign_id: j.campaign_id, claim_id: claim.id, note: '7-day retract' });
          })();
        } catch (e) { console.error('[ads] antileaver retract failed', e && e.message); continue; }

        try { bot.api.sendMessage(exec.tg_id,
          `⚠️ Награда ${fmtUsd(claim.reward_cents)} за канал списана — ты отписался в течение 7 дней. Карма −3.`); } catch (_) {}
      }
      if (bad.length) console.log(`[ads] antileaver: retracted ${bad.length} rewards`);
    } catch (e) {
      console.error('[ads] antileaver cron error', e && e.message);
    }
  }
  setInterval(antileaverCron, ANTILEAVE_CRON_INTERVAL_MS);

  console.log('[ads] v2 ready — persistent sessions, atomic pay, admin-watch, pause/refund, karma, antifraud');

  // ──── adv_task finalizers ────
  bot.callbackQuery(/^adv_task_photo:(0|1)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sess = store.get.session(ctx.from.id);
    if (!sess || sess.flow !== 'adv_task') return;
    sess.data.photo_required = ctx.match[1] === '1';
    sess.step = 'ai_choice';
    store.put.setSession(ctx.from.id, sess);
    const kb = new InlineKeyboard()
      .text('🤖 Да, AI поможет', 'adv_task_ai:1')
      .text('👤 Только ручная', 'adv_task_ai:0');
    await ctx.reply(`📝 <b>Шаг 4/6</b> — Использовать <b>AI-помощь</b> при проверке отчётов? (рекомендация approve/reject через нейросеть, финальное слово — за тобой)`, { parse_mode: 'HTML', reply_markup: kb });
  });

  bot.callbackQuery(/^adv_task_ai:(0|1)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sess = store.get.session(ctx.from.id);
    if (!sess || sess.flow !== 'adv_task') return;
    sess.data.ai_check_enabled = ctx.match[1] === '1';
    if (sess.data.ai_check_enabled) {
      sess.step = 'ai_criteria';
      store.put.setSession(ctx.from.id, sess);
      await ctx.reply(`📝 <b>Что AI должен проверить?</b> Пиши критерии для нейросети.\n\n<i>Например: «На фото — скриншот опубликованного комментария с упоминанием Golden Connect»</i>`, { parse_mode: 'HTML' });
    } else {
      sess.data.ai_check_criteria = '';
      sess.step = 'reward';
      store.put.setSession(ctx.from.id, sess);
      await ctx.reply(`📝 <b>Шаг 5/6</b> — <b>Сколько $</b> за выполнение? (0.10)`, { parse_mode: 'HTML' });
    }
  });

  bot.callbackQuery(/^adv_task_pay:(gift|earned)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sess = store.get.session(ctx.from.id);
    // L.5: double-tap guard — also check step + clear session immediately
    if (!sess || sess.flow !== 'adv_task' || sess.step !== 'wallet') return;
    store.put.setSession(ctx.from.id, null);
    const wallet = ctx.match[1];
    const d = sess.data;
    const user = db.ensureUser(ctx.from);
    // Phase F: api Postgres debit
    const apiWallet = wallet === 'gift' ? 'gift' : 'working';
    const dr = await debitApi({
      tgId: user.tg_id, wallet: apiWallet, cents: d.budget_cents,
      kind: 'campaign_fund_task', memo: 'task campaign: ' + (d.description || '').slice(0, 60),
    });
    if (!dr || !dr.ok) {
      if (String(dr && dr.error).startsWith('insufficient')) {
        return ctx.reply(`❌ Недостаточно средств на ${wallet} (api): нужно ${fmtUsd(d.budget_cents)}.`);
      }
      console.error('[ads] task api debit failed', dr);
      return ctx.reply('❌ Ошибка списания: ' + (dr && dr.error || 'unknown'));
    }
    const campId = store.put.createCampaign({
      owner_user_id: user.id, kind: 'task', status: 'active',
      title: d.description.slice(0, 80),
      budget_cents: d.budget_cents, reward_cents: d.reward_cents, fee_cents: d.fee_cents, sponsor_cents: d.sponsor_cents,
      target_count: d.target_count, paid_wallet: wallet,
      min_karma: d.min_karma || 0,
    });
    store.put.createCustomTask({
      campaign_id: campId, description: d.description, report_format: d.report_format,
      ai_check_enabled: d.ai_check_enabled, ai_check_criteria: d.ai_check_criteria,
      photo_required: d.photo_required,
    });
    rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, campaign_id, note)
      VALUES ('charge', ?, ?, ?, ?, 'task_create')`).run(user.id, wallet, -d.budget_cents, campId);
    // session was already cleared by L.5 guard at top of handler
    const _kb = new InlineKeyboard()
      .text('📊 Мои кампании', 'adv_list').row()
      .text('➕ Создать ещё', 'adv_menu');
    await ctx.reply(`✅ <b>Кампания #${campId} создана.</b>\n\nИсполнители увидят её в «💰 Задания (заработать)» → 📝 Задания с отчётом.`, { parse_mode: 'HTML', reply_markup: _kb });
  });

  // ──── adv_video finalizers ────
  bot.callbackQuery(/^adv_vid_mode:(text_report|quiz|voice_report)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sess = store.get.session(ctx.from.id);
    if (!sess || sess.flow !== 'adv_video') return;
    const mode = ctx.match[1];
    sess.data.validation_mode = mode;
    if (mode === 'quiz') {
      sess.step = 'quiz_input';
      store.put.setSession(ctx.from.id, sess);
      await ctx.reply(
        `🧪 <b>Шаг 3/5</b> — Пришли вопросы quiz в формате (по одному на строке):\n\n` +
        `<code>Что было в видео?|Лекция|Реклама|Музыка|2</code>\n` +
        `<code>Кто говорил?|Артём|Иван|Мария|1</code>\n\n` +
        `Где последняя цифра — <b>номер правильного варианта</b>.`,
        { parse_mode: 'HTML' }
      );
    } else {
      sess.step = 'criteria';
      store.put.setSession(ctx.from.id, sess);
      await ctx.reply(`📝 <b>Шаг 3/5</b> — Опиши <b>что должно быть в отчёте</b> (для AI-проверки):\n\n<i>Например: «Должен упомянуть тариф ROCKET и Matching Bonus»</i>`, { parse_mode: 'HTML' });
    }
  });

  bot.callbackQuery(/^adv_vid_pay:(gift|earned)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const sess = store.get.session(ctx.from.id);
    if (!sess || sess.flow !== 'adv_video' || sess.step !== 'wallet') return;
    store.put.setSession(ctx.from.id, null);
    const wallet = ctx.match[1];
    const d = sess.data;
    const user = db.ensureUser(ctx.from);
    const _localBal = store.get.balances(user.id);
    const bal = await getUnifiedBalances(user, _localBal);
    const have = wallet === 'gift' ? bal.gift : bal.earned;
    if (have < d.budget_cents) return ctx.reply(`❌ Недостаточно средств: есть ${fmtUsd(have)}, нужно ${fmtUsd(d.budget_cents)}.`);
    const col = wallet === 'gift' ? 'gift_balance_cents' : 'earned_balance_cents';
    rawDb.prepare(`UPDATE users SET ${col} = ${col} - ? WHERE id = ?`).run(d.budget_cents, user.id);
    const campId = store.put.createCampaign({
      owner_user_id: user.id, kind: 'video', status: 'active',
      title: d.video_title || 'Видео-задание',
      budget_cents: d.budget_cents, reward_cents: d.reward_cents, fee_cents: d.fee_cents, sponsor_cents: 0,
      target_count: d.target_count, paid_wallet: wallet,
      min_karma: d.min_karma || 0,
    });
    store.put.createVideoTask({
      campaign_id: campId,
      video_file_id: d.video_file_id, video_url: d.video_url,
      video_title: d.video_title, video_duration_sec: d.video_duration_sec,
      validation_mode: d.validation_mode, quiz_json: d.quiz, criteria: d.criteria,
      min_score: 70,
    });
    rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, campaign_id, note)
      VALUES ('charge', ?, ?, ?, ?, 'video_create')`).run(user.id, wallet, -d.budget_cents, campId);
    store.put.setSession(ctx.from.id, null);
    await ctx.reply(`✅ <b>Видео-кампания #${campId} создана.</b>\n\nДоступна в «💰 Задания» → 🎬 Видео-задания.`, { parse_mode: 'HTML' });
  });

  console.log('[ads] phase 2 ready — custom tasks + video tasks + AI checker');

  // ════════════════════════════════════════════════════════════════════════════
  // Phase S.6: video-promo menu + report flow
  // [phase-s6]
  async function _vmenuShow(ctx) {
    const u = db.ensureUser(ctx.from);
    const pending = rawDb.prepare(
      "SELECT a.id, a.sent_at, p.hashtag, p.source_platform " +
      "FROM tg_video_assignments a LEFT JOIN tg_video_pool p ON p.id=a.pool_id " +
      "WHERE a.user_id=? AND a.status='pending' ORDER BY a.sent_at DESC LIMIT 5"
    ).all(u.id);
    const reported = rawDb.prepare(
      "SELECT a.id, a.reported_at, a.report_url, p.hashtag " +
      "FROM tg_video_assignments a LEFT JOIN tg_video_pool p ON p.id=a.pool_id " +
      "WHERE a.user_id=? AND a.status='reported' ORDER BY a.reported_at DESC LIMIT 3"
    ).all(u.id);
    const totalReported = rawDb.prepare(
      "SELECT COUNT(*) AS n FROM tg_video_assignments WHERE user_id=? AND status='reported'"
    ).get(u.id).n;

    let txt = '🎬 <b>Твои видео-промо</b>\n\n';
    if (pending.length) {
      txt += '<b>⏳ Ждут отчёта (' + pending.length + '):</b>\n';
      pending.forEach(function (a) {
        const tag = a.hashtag ? ' #' + String(a.hashtag).replace(/^#/, '') : '';
        txt += '• #' + a.id + ' (' + (a.source_platform || '?') + ')' + tag + '\n';
      });
      txt += '\n';
    } else {
      txt += '<i>Сейчас нет невыполненных промо.</i>\n\n';
    }
    if (reported.length) {
      txt += '<b>✅ Последние отчёты:</b>\n';
      reported.forEach(function (a) {
        const url = a.report_url || '—';
        txt += '• <a href="' + esc(url) + '">' + esc(url.slice(0, 40)) + '</a>\n';
      });
      txt += '\n';
    }
    txt += '<b>Всего отчётов:</b> ' + totalReported + '\n';
    txt += 'За каждый принятый отчёт — <b>+5 кармы</b>.\n\n';
    txt += '💡 Видео приходят раз в день автоматически. Отправляй отчёты, чтобы получать новые.';

    const { InlineKeyboard } = require('grammy');
    const kb = new InlineKeyboard();
    if (pending.length) {
      pending.forEach(function (a) {
        kb.text('📨 Отчёт по #' + a.id, 'vrep:' + a.id).row();
      });
    }
    kb.text('🌐 Кабинет', 'open_cabinet').row();

    if (ctx.callbackQuery) {
      try { await ctx.editMessageText(txt, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb }); return; }
      catch (_) { /* fall through to reply */ }
    }
    return ctx.reply(txt, { parse_mode: 'HTML', disable_web_page_preview: true, reply_markup: kb });
  }

  bot.command(['video_promo', 'promo_video', 'vp'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return _vmenuShow(ctx);
  });

  bot.callbackQuery('vmenu', async (ctx) => {
    await ctx.answerCallbackQuery();
    return _vmenuShow(ctx);
  });

  bot.callbackQuery(/^vrep:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const assignmentId = parseInt(ctx.match[1], 10);
    const u = db.ensureUser(ctx.from);
    const a = rawDb.prepare(
      "SELECT id, user_id, status FROM tg_video_assignments WHERE id=?"
    ).get(assignmentId);
    if (!a) return ctx.reply('❌ Видео-промо #' + assignmentId + ' не найдено.');
    if (a.user_id !== u.id) return ctx.reply('❌ Это не твоё видео-промо.');
    if (a.status === 'reported') return ctx.reply('ℹ️ Отчёт по #' + assignmentId + ' уже принят.');
    if (a.status === 'failed') return ctx.reply('ℹ️ Это назначение помечено как failed — подожди следующее.');

    store.put.setSession(ctx.from.id, {
      flow: 'video_promo_report', step: 'await',
      data: { assignment_id: assignmentId },
    });
    return ctx.reply(
      '📨 <b>Отчёт по видео-промо #' + assignmentId + '</b>\n\n' +
      'Пришли <b>ссылку на опубликованный пост</b> следующим сообщением.\n' +
      'Подойдут TikTok, Instagram Reels, YouTube Shorts, VK Clips.\n\n' +
      '<i>За принятый отчёт — +5 кармы. /cancel чтобы отменить.</i>',
      { parse_mode: 'HTML' }
    );
  });
  // [/phase-s6]

}



/**
 * Top-level message handler for ads-flow sessions:
 *   • flow=submit_report → executor sends report (text + optional photo)
 *   • flow=decide_reason → author writes rejection/rework reason
 *   • flow=video_text / video_voice → text/voice report for video task
 *   • flow=adv_task / adv_video → multi-step campaign creation
 * Returns true if handled (caller should NOT pass to other handlers).
 */
async function handleMessage(ctx, deps) {
  const { db, store, rawDb, GROQ_KEYS } = deps;
  const sess = store.get.session(ctx.from.id);
  if (!sess) return false;
  const msg = ctx.message;
  if (!msg) return false;
  // ──── Phase S.6: video-promo report (executor sends URL) ────  // [phase-s6-h]
  if (sess.flow === 'video_promo_report') {
    const url = (msg.text || msg.caption || '').trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      return ctx.reply('🔗 Нужна ссылка вида https://… (TikTok / Reels / Shorts). Или /cancel.'), true;
    }
    const { assignment_id } = sess.data;
    const u = db.ensureUser(ctx.from);
    const a = rawDb.prepare(
      "SELECT id, user_id, status FROM tg_video_assignments WHERE id=?"
    ).get(assignment_id);
    if (!a || a.user_id !== u.id) {
      store.put.setSession(ctx.from.id, null);
      return ctx.reply('❌ Назначение не найдено.'), true;
    }
    if (a.status !== 'pending') {
      store.put.setSession(ctx.from.id, null);
      return ctx.reply('ℹ️ Этот отчёт уже обработан (status=' + a.status + ').'), true;
    }
    rawDb.prepare(
      "UPDATE tg_video_assignments " +
      "SET status='reported', reported_at=datetime('now'), report_url=? " +
      "WHERE id=?"
    ).run(url, assignment_id);
    try { store.put.karmaDelta(u.id, +5); } catch (_) {}
    store.put.setSession(ctx.from.id, null);
    await ctx.reply(
      '✅ <b>Отчёт принят!</b>\n\n' +
      '+5 кармы зачислено. Завтра пришлю следующее видео-промо автоматически.\n\n' +
      '🌐 Все отчёты: /vp',
      { parse_mode: 'HTML' }
    );
    return true;
  }


  // ──── Executor submitting custom-task report ────
  if (sess.flow === 'submit_report') {
    const { claim_id, campaign_id, photo_required } = sess.data;
    let photoFileId = null, photoUrl = null;
    if (msg.photo && msg.photo.length) {
      photoFileId = msg.photo[msg.photo.length - 1].file_id;
      try {
        const f = await ctx.api.getFile(photoFileId);
        photoUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${f.file_path}`;
      } catch (e) {}
    }
    const text = msg.caption || msg.text || '';
    if (photo_required && !photoFileId) {
      return ctx.reply('📸 Это задание требует фото. Прикрепи изображение к сообщению.'), true;
    }
    // L.15: clearer guidance for unsupported message types
    if (!text && !photoFileId) {
      if (msg.sticker || msg.video || msg.video_note || msg.voice || msg.audio || msg.document) {
        return ctx.reply('⚠️ Этот тип сообщения не подходит для отчёта. Пришли <b>текст</b> или <b>фото</b> (можно с подписью). Или /cancel чтобы отменить.', { parse_mode: 'HTML' }), true;
      }
      return ctx.reply('Пришли текст или фото с подписью.'), true;
    }
    const reportId = store.put.submitReport({
      claim_id, campaign_id, executor_user_id: db.ensureUser(ctx.from).id,
      report_text: text, photo_file_id: photoFileId, photo_url: photoUrl,
    });
    store.put.setSession(ctx.from.id, null);
    await ctx.reply(`✅ Отчёт отправлен на проверку. Награда придёт после подтверждения.`);

    // Notify author
    try {
      const camp = store.get.campaign(campaign_id);
      const ownerTg = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(camp.owner_user_id);
      if (ownerTg && ownerTg.tg_id) {
        const exName = ctx.from.first_name + (ctx.from.username ? ' @' + ctx.from.username : '');
        const { InlineKeyboard } = require('grammy');
        const kb = new InlineKeyboard()
          .text('🤖 AI-проверка', 'report_decide:ai:' + claim_id).row()
          .text('✅ Принять', 'report_decide:approve:' + claim_id)
          .text('❌ Отклонить', 'report_decide:reject:' + claim_id).row()
          .text('🔄 На доработку', 'report_decide:rework:' + claim_id);
        let n = `🔔 <b>Новый отчёт</b> по кампании #${campaign_id} от <b>${exName}</b>\n\n`;
        if (text) n += `<b>Текст:</b>\n${text.slice(0, 800)}\n\n`;
        if (photoUrl) n += `📸 фото прикреплено\n`;
        await ctx.api.sendMessage(ownerTg.tg_id, n, { parse_mode: 'HTML', reply_markup: kb });
        if (photoFileId) await ctx.api.sendPhoto(ownerTg.tg_id, photoFileId);
      }
    } catch (e) { console.error('[ads notify author]', e.message); }
    return true;
  }

  // ──── Author writing reject/rework reason ────
  if (sess.flow === 'decide_reason') {
    const { claim_id, decision } = sess.data;
    const reason = msg.text || '';
    if (!reason || reason.length < 3) return ctx.reply('Слишком короткая причина. Минимум 3 символа.'), true;
    const res = await store.put.decideClaim({ claim_id, decision, reason });
    if (!res.ok) {
      store.put.setSession(ctx.from.id, null);
      await ctx.reply('❌ Не удалось применить решение: ' + (res.error || res.reason || 'unknown'));
      return true;
    }
    store.put.setSession(ctx.from.id, null);
    await ctx.reply(`✅ Решение применено: <b>${decision === 'reject' ? 'отклонено' : 'на доработку'}</b>`, { parse_mode: 'HTML' });
    // Phase J: notify executor + add resubmit button for rework
    try {
      const ex = rawDb.prepare('SELECT u.tg_id FROM users u WHERE u.id = ?').get(res.executor_user_id);
      if (ex && ex.tg_id) {
        const icon = decision === 'reject' ? '❌' : '🔄';
        const txt = decision === 'reject'
          ? `${icon} <b>Твой отчёт отклонён</b>\n\nПричина: ${esc(reason)}\n\nМожешь взять другое задание.`
          : `${icon} <b>Отчёт на доработку</b>\n\nКомментарий заказчика:\n<i>${esc(reason)}</i>\n\nНажми кнопку ниже и пришли исправленный отчёт.`;
        const opts = { parse_mode: 'HTML' };
        if (decision === 'rework') {
          opts.reply_markup = new InlineKeyboard().text('📝 Прислать новый отчёт', `resubmit_report_${claim_id}`);
        }
        await ctx.api.sendMessage(ex.tg_id, txt, opts);
      }
    } catch (e) { console.error('[ads notify executor]', e && e.message); }
    return true;
  }

  // ──── Video text report ────
  if (sess.flow === 'video_text' && msg.text) {
    const { claim_id, campaign_id } = sess.data;
    const v = store.get.videoTaskByCampaign(campaign_id);
    const aiChecker = require('./services/ai-task-checker');
    await ctx.reply('🤖 AI проверяет…');
    const result = await aiChecker.checkTextReport({
      criteria: v.criteria || 'Опиши кратко содержание видео.',
      reportText: msg.text,
      taskDescription: v.video_title,
    });
    const minScore = v.min_score || 70;
    const autoApprove = result.score >= minScore;
    const fin = store.put.submitVideoValidation({
      claim_id, validation_data: { report_text: msg.text },
      ai_score: result.score, ai_verdict: result.verdict, ai_reasoning: result.reasoning,
      auto_approve: autoApprove,
    });
    store.put.setSession(ctx.from.id, null);
    if (fin.paid) {
      await ctx.reply(`✅ <b>Принято!</b> Score ${result.score}/100\n\nНаграда <b>${(fin.paid_cents/100).toFixed(2)}$</b> начислена.`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`📊 Score ${result.score}/100 (нужно ≥${minScore}).\n${result.reasoning}\n\nНаграда не начислена.`, { parse_mode: 'HTML' });
    }
    return true;
  }

  // ──── Video voice report ────
  if (sess.flow === 'video_voice' && (msg.voice || msg.audio)) {
    const fileId = (msg.voice || msg.audio).file_id;
    const { claim_id, campaign_id } = sess.data;
    const v = store.get.videoTaskByCampaign(campaign_id);
    await ctx.reply('🎤 Транскрибирую и проверяю…');
    try {
      const f = await ctx.api.getFile(fileId);
      const url = `https://api.telegram.org/file/bot${ctx.api.token}/${f.file_path}`;
      // Download + transcribe via Groq Whisper
      const https = require('https');
      const fs = require('fs');
      const path = require('path');
      const tmpFile = `/tmp/voice_${Date.now()}.ogg`;
      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(tmpFile);
        https.get(url, (r) => { r.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }).on('error', reject);
      });
      const fileBuf = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      const boundary = '----TX' + Math.random().toString(36).slice(2);
      const parts = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.ogg"\r\nContent-Type: audio/ogg\r\n\r\n`),
        fileBuf, Buffer.from('\r\n'),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nru\r\n`),
        Buffer.from(`--${boundary}--\r\n`),
      ];
      const body = Buffer.concat(parts);
      const groqKey = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',')[0].trim();
      const transcript = await new Promise((resolve, reject) => {
        const req = https.request({ method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/audio/transcriptions',
          headers: { 'Authorization': 'Bearer ' + groqKey, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
          timeout: 60000,
        }, (res) => { let buf = ''; res.on('data', c => buf += c); res.on('end', () => { try { resolve(JSON.parse(buf).text || ''); } catch (e) { reject(e); } }); });
        req.on('error', reject);
        req.write(body); req.end();
      });
      const aiChecker = require('./services/ai-task-checker');
      const result = await aiChecker.checkVoiceReport({
        criteria: v.criteria || 'Опиши кратко содержание видео.',
        transcript,
        taskDescription: v.video_title,
      });
      const minScore = v.min_score || 70;
      const fin = store.put.submitVideoValidation({
        claim_id, validation_data: { transcript },
        ai_score: result.score, ai_verdict: result.verdict, ai_reasoning: result.reasoning,
        auto_approve: result.score >= minScore,
      });
      store.put.setSession(ctx.from.id, null);
      let txt = `🎤 Транскрипция: <i>"${transcript.slice(0, 200)}…"</i>\n\n📊 Score ${result.score}/100\n${result.reasoning}\n\n`;
      txt += fin.paid ? `✅ Награда <b>${(fin.paid_cents/100).toFixed(2)}$</b> начислена.` : `❌ Не засчитано (нужно ≥${minScore}).`;
      await ctx.reply(txt, { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.reply('❌ Ошибка обработки голоса: ' + e.message);
    }
    return true;
  }

  // ──── Campaign creation flows: adv_task and adv_video (multi-step) ────
  if (sess.flow === 'adv_task') return await handleAdvTaskFlow(ctx, sess, deps);
  if (sess.flow === 'adv_video') return await handleAdvVideoFlow(ctx, sess, deps);

  return false;
}

async function handleAdvTaskFlow(ctx, sess, deps) {
  const { store, rawDb } = deps;
  const t = ctx.message && ctx.message.text;
  if (!t) return false;
  const d = sess.data;
  const { InlineKeyboard } = require('grammy');

  if (sess.step === 'description') {
    if (t.length < 10) return ctx.reply('Опиши задание подробнее (минимум 10 символов).'), true;
    d.description = t; sess.step = 'report_format';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`📝 <b>Шаг 2/6</b> — опиши <b>что должно быть в отчёте</b> от исполнителя.\n\n<i>Например: «Скриншот комментария + текст самого комментария»</i>`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'report_format') {
    if (t.length < 5) return ctx.reply('Опиши формат отчёта подробнее.'), true;
    d.report_format = t; sess.step = 'photo_required';
    store.put.setSession(ctx.from.id, sess);
    const kb = new InlineKeyboard().text('📸 Да, нужно фото', 'adv_task_photo:1').text('📝 Нет, только текст', 'adv_task_photo:0');
    return ctx.reply(`📝 <b>Шаг 3/6</b> — Нужно ли обязательное <b>фото</b> в отчёте?`, { parse_mode: 'HTML', reply_markup: kb }), true;
  }
  if (sess.step === 'ai_criteria') {
    if (t.length < 5) return ctx.reply('Опиши критерии AI-проверки подробнее.'), true;
    d.ai_check_criteria = t; sess.step = 'reward';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`📝 <b>Шаг 5/6</b> — <b>Сколько $</b> платишь за выполнение? (например: 0.10)`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'reward') {
    const reward = parseFloat(String(t).replace(',', '.'));
    if (!Number.isFinite(reward) || reward < 0.01 || reward > 100) return ctx.reply('Введи число от 0.01 до 100.'), true;
    d.reward_usd = reward; d.reward_cents = Math.round(reward * 100); sess.step = 'target';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`📝 <b>Шаг 6/6</b> — Сколько исполнителей нужно?`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'target') {
    const target = parseInt(t, 10);
    if (!Number.isFinite(target) || target < 1 || target > 10000) return ctx.reply('Введи число от 1 до 10000.'), true;
    d.target_count = target;
    const totalCents = d.reward_cents * target;
    const feeCents = Math.round(totalCents * 0.10);
    const sponsorCents = Math.round(totalCents * 0.05);
    const budgetCents = totalCents + feeCents;
    d.fee_cents = feeCents; d.sponsor_cents = sponsorCents; d.budget_cents = budgetCents;
    sess.step = 'wallet';
    store.put.setSession(ctx.from.id, sess);
    const kb = new InlineKeyboard()
      .text(`🎁 С Gift-баланса`, 'adv_task_pay:gift')
      .text(`💵 С Earned-баланса`, 'adv_task_pay:earned');
    return ctx.reply(
      `<b>Подытожим:</b>\n` +
      `📝 ${d.description.slice(0, 100)}\n` +
      `📋 Отчёт: ${d.report_format.slice(0, 100)}\n` +
      `${d.photo_required ? '📸' : '📝'} ${d.photo_required ? 'фото обязательно' : 'только текст'}\n` +
      `💵 ${(d.reward_cents/100).toFixed(2)}$ × ${d.target_count} = <b>${(d.reward_cents * d.target_count / 100).toFixed(2)}$</b> + 10% комиссия\n` +
      `<b>Итого к списанию: ${(d.budget_cents/100).toFixed(2)}$</b>\n\nОткуда списать?`,
      { parse_mode: 'HTML', reply_markup: kb }
    ), true;
  }
  return false;
}

async function handleAdvVideoFlow(ctx, sess, deps) {
  const { store, rawDb } = deps;
  const m = ctx.message;
  const d = sess.data;
  const { InlineKeyboard } = require('grammy');

  if (sess.step === 'video') {
    if (m.video) {
      d.video_file_id = m.video.file_id;
      d.video_duration_sec = m.video.duration || 0;
      d.video_title = m.caption || 'Видео';
    } else if (m.video_note) {
      d.video_file_id = m.video_note.file_id;
      d.video_duration_sec = m.video_note.duration || 0;
      d.video_title = 'Видео-заметка';
    } else if (m.text && /(https?:\/\/)|youtube\.com|youtu\.be|tiktok\.com|vimeo\.com/.test(m.text)) {
      d.video_url = m.text.trim();
      d.video_title = 'Видео по ссылке';
      d.video_duration_sec = 0;
    } else {
      return ctx.reply('Пришли видео-файл, видео-заметку или ссылку YouTube/TikTok.'), true;
    }
    sess.step = 'mode';
    store.put.setSession(ctx.from.id, sess);
    const kb = new InlineKeyboard()
      .text('✏️ Краткий отчёт', 'adv_vid_mode:text_report').row()
      .text('🧪 Quiz (вопросы)', 'adv_vid_mode:quiz').row()
      .text('🎤 Голосовой отчёт', 'adv_vid_mode:voice_report');
    return ctx.reply(`✅ Видео получено (${d.video_duration_sec}с).\n\n<b>Шаг 2/5</b> — Как проверять что человек реально посмотрел?`, { parse_mode: 'HTML', reply_markup: kb }), true;
  }

  if (sess.step === 'criteria') {
    const t = m.text;
    if (!t || t.length < 5) return ctx.reply('Опиши критерии подробнее.'), true;
    d.criteria = t; sess.step = 'reward';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`<b>Шаг 4/5</b> — Сколько $ за просмотр? (например: 0.05)`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'quiz_input') {
    const t = m.text;
    if (!t) return ctx.reply('Пришли quiz в формате описанном выше.'), true;
    // Parse simple format: lines "Вопрос|Опц1|Опц2|Опц3|правильный_номер_от_1"
    const quiz = [];
    for (const line of t.split('\n')) {
      const parts = line.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length < 4) continue;
      const correct = parseInt(parts[parts.length - 1], 10) - 1;
      const options = parts.slice(1, -1);
      if (options.length >= 2 && correct >= 0 && correct < options.length) {
        quiz.push({ q: parts[0], options, correct });
      }
    }
    if (!quiz.length) return ctx.reply('Не разобрал ни одного вопроса. Формат: "Вопрос|Опц1|Опц2|Опц3|2" — где 2 это номер правильного варианта.'), true;
    d.quiz = quiz; sess.step = 'reward';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`✅ Получено ${quiz.length} вопрос(ов).\n\n<b>Шаг 4/5</b> — Сколько $ за прохождение? (0.05)`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'reward') {
    const reward = parseFloat(String(m.text).replace(',', '.'));
    if (!Number.isFinite(reward) || reward < 0.01 || reward > 100) return ctx.reply('Введи число от 0.01 до 100.'), true;
    d.reward_usd = reward; d.reward_cents = Math.round(reward * 100); sess.step = 'target';
    store.put.setSession(ctx.from.id, sess);
    return ctx.reply(`<b>Шаг 5/5</b> — Сколько просмотров нужно?`, { parse_mode: 'HTML' }), true;
  }
  if (sess.step === 'target') {
    const target = parseInt(m.text, 10);
    if (!Number.isFinite(target) || target < 1 || target > 10000) return ctx.reply('Введи число от 1 до 10000.'), true;
    d.target_count = target;
    const totalCents = d.reward_cents * target;
    const feeCents = Math.round(totalCents * 0.10);
    const budgetCents = totalCents + feeCents;
    d.fee_cents = feeCents; d.budget_cents = budgetCents;
    sess.step = 'wallet';
    store.put.setSession(ctx.from.id, sess);
    const kb = new InlineKeyboard()
      .text(`🎁 С Gift-баланса`, 'adv_vid_pay:gift')
      .text(`💵 С Earned-баланса`, 'adv_vid_pay:earned');
    return ctx.reply(
      `<b>Подытожим:</b>\n🎬 ${d.video_title}\n💵 ${(d.reward_cents/100).toFixed(2)}$ × ${d.target_count} = <b>${(d.reward_cents * d.target_count / 100).toFixed(2)}$</b> + 10% = <b>${(d.budget_cents/100).toFixed(2)}$</b>\n\nОткуда списать?`,
      { parse_mode: 'HTML', reply_markup: kb }
    ), true;
  }
  return false;
}


// Phase I: deeplink dispatcher — called from planner /start when payload like `task_5` / `video_3` arrives
async function dispatchAdsDeeplink(ctx, payload) {
  const m = /^(task|video)_(\d+)$/.exec(payload || '');
  if (!m) return false;
  const kind = m[1];
  const id = parseInt(m[2], 10);
  const fns = setupAds._takesByKind || {};
  if (fns[kind]) {
    try { await fns[kind](ctx, id); return true; }
    catch (e) { console.error('[ads deeplink]', e && e.message); return false; }
  }
  return false;
}

module.exports = {
  dispatchAdsDeeplink, setupAds, applySchema, makeStore, handleMessage };
