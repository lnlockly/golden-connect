// Trendex Ads-Site (banner + video) schema bootstrap. Idempotent.
const { getDb } = require('./planner/db/database');

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ad_banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    image_path TEXT NOT NULL,
    target_url TEXT NOT NULL,
    daily_budget_trdx REAL NOT NULL DEFAULT 50,
    total_budget_trdx REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    reject_reason TEXT,
    trust_decision TEXT,
    impressions_total INTEGER NOT NULL DEFAULT 0,
    clicks_total INTEGER NOT NULL DEFAULT 0,
    trdx_spent_total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT,
    reviewed_by INTEGER,
    paused_at TEXT,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ad_banners_user ON ad_banners(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_ad_banners_status ON ad_banners(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_ad_banners_format_active ON ad_banners(format, status, deleted_at);

CREATE TABLE IF NOT EXISTS ad_banner_impressions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    banner_id INTEGER NOT NULL,
    viewer_user_id INTEGER,
    ip_hash TEXT NOT NULL,
    ua_hash TEXT NOT NULL,
    slot TEXT NOT NULL,
    page_host TEXT,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imp_banner ON ad_banner_impressions(banner_id, ts);
CREATE INDEX IF NOT EXISTS idx_imp_dedup ON ad_banner_impressions(banner_id, ip_hash, ts);

CREATE TABLE IF NOT EXISTS ad_banner_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    banner_id INTEGER NOT NULL,
    viewer_user_id INTEGER,
    ip_hash TEXT NOT NULL,
    ua_hash TEXT NOT NULL,
    ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clk_banner ON ad_banner_clicks(banner_id, ts);

CREATE TABLE IF NOT EXISTS ad_banner_daily_stats (
    banner_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    impressions INTEGER NOT NULL DEFAULT 0,
    clicks INTEGER NOT NULL DEFAULT 0,
    trdx_spent REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (banner_id, day)
);

CREATE TABLE IF NOT EXISTS ad_banner_freq (
    banner_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    hour_bucket INTEGER NOT NULL,
    shown INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (banner_id, ip_hash, hour_bucket)
);
CREATE INDEX IF NOT EXISTS idx_freq_hour ON ad_banner_freq(hour_bucket);

CREATE TABLE IF NOT EXISTS ad_blocked_ips (
    ip_hash TEXT PRIMARY KEY,
    reason TEXT,
    banned_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    target_url TEXT NOT NULL,
    video_path TEXT,
    thumbnail_path TEXT,
    duration_sec REAL,
    file_size_bytes INTEGER,
    daily_budget_trdx REAL NOT NULL DEFAULT 100,
    total_budget_trdx REAL,
    status TEXT NOT NULL DEFAULT 'uploading',
    process_error TEXT,
    virus_scan_result TEXT,
    virus_scanned_at TEXT,
    reject_reason TEXT,
    trust_decision TEXT,
    impressions_total INTEGER NOT NULL DEFAULT 0,
    clicks_total INTEGER NOT NULL DEFAULT 0,
    trdx_spent_total REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT,
    reviewed_by INTEGER,
    paused_at TEXT,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ad_videos_user ON ad_videos(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_ad_videos_status ON ad_videos(status, deleted_at);

CREATE TABLE IF NOT EXISTS ad_video_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    viewer_user_id INTEGER,
    ip_hash TEXT NOT NULL,
    ua_hash TEXT NOT NULL,
    watch_seconds REAL NOT NULL DEFAULT 0,
    counted INTEGER NOT NULL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    last_heartbeat_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_views_video ON ad_video_views(video_id, started_at);
CREATE INDEX IF NOT EXISTS idx_views_dedup ON ad_video_views(video_id, ip_hash, started_at);

CREATE TABLE IF NOT EXISTS ad_video_force_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    viewer_user_id INTEGER,
    visitor_token TEXT,
    video_id INTEGER NOT NULL,
    shown_at INTEGER NOT NULL,
    watched_seconds REAL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_force_user ON ad_video_force_log(viewer_user_id, shown_at);
CREATE INDEX IF NOT EXISTS idx_force_token ON ad_video_force_log(visitor_token, shown_at);

CREATE TABLE IF NOT EXISTS ad_user_quota (
    user_id INTEGER NOT NULL,
    day TEXT NOT NULL,
    videos_uploaded INTEGER NOT NULL DEFAULT 0,
    banners_uploaded INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
`;

// [banner-automod-2026-05-17] AI auto-moderation columns
const AD_BANNERS_AI_COLS = [
  ['ai_verdict', 'TEXT'],
  ['ai_risk_score', 'INTEGER'],
  ['ai_reasons', 'TEXT'],
  ['ai_categories', 'TEXT'],
  ['ai_source', 'TEXT'],
];

function _ensureCols(db, table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of cols) {
    if (have.has(name)) continue;
    try {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
      console.log(`[ads-site-migrate] added column ${table}.${name}`);
    } catch (e) {
      console.error(`[ads-site-migrate] add column ${table}.${name} failed:`, e && e.message);
    }
  }
}

function applyAdsSiteSchema() {
  const db = getDb();
  try {
    db.exec(SCHEMA_SQL);
    _ensureCols(db, 'ad_banners', AD_BANNERS_AI_COLS);
    console.log('[ads-site] schema ready');
  } catch (e) {
    console.error('[ads-site-migrate] failed:', e && e.message);
  }
}

module.exports = { applyAdsSiteSchema };
