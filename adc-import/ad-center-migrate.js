/**
 * Ad Center — миграция БД.
 * Запускать: node /opt/banner-webapp/scripts/ad-center-migrate.js
 * Безопасно запускать повторно (CREATE TABLE IF NOT EXISTS).
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bannergen.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('[AD-CENTER-MIGRATE] Database:', DB_PATH);

// ─── 1. Рекламные кампании ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ad_campaigns_user ON ad_campaigns(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_campaigns');

// ─── 2. Источники публикации (каналы/чаты TG) ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'tg_channel',
    tg_chat_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    username TEXT,
    member_count INTEGER DEFAULT 0,
    bot_is_admin INTEGER DEFAULT 0,
    avatar_url TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ad_sources_user ON ad_sources(user_id);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_sources');

// ─── 3. Связь кампания ↔ источники ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_campaign_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES ad_sources(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, source_id)
  );
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_campaign_sources');

// ─── 4. Рекламные посты/объявления ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    campaign_id INTEGER,
    title TEXT NOT NULL DEFAULT '',
    text_original TEXT,
    text_generated TEXT,
    text_final TEXT,
    media_type TEXT,
    media_url TEXT,
    media_source TEXT,
    links TEXT NOT NULL DEFAULT '[]',
    video_sources TEXT NOT NULL DEFAULT '[]',
    transcription_text TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    type TEXT NOT NULL DEFAULT 'instant',
    sent_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ad_posts_user ON ad_posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_posts_campaign ON ad_posts(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_ad_posts_status ON ad_posts(status);
  CREATE INDEX IF NOT EXISTS idx_ad_posts_type ON ad_posts(type);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_posts');

// ─── 5. Связь пост ↔ источник (результат отправки) ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_post_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    tg_message_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TEXT,
    error_text TEXT,
    FOREIGN KEY (post_id) REFERENCES ad_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES ad_sources(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ad_post_sources_post ON ad_post_sources(post_id);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_post_sources');

// ─── 6. Расписания авторассылок ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    campaign_id INTEGER NOT NULL,
    post_id INTEGER,
    type TEXT NOT NULL DEFAULT 'interval',
    interval_minutes INTEGER DEFAULT 180,
    scheduled_at TEXT,
    repeat_enabled INTEGER NOT NULL DEFAULT 0,
    repeat_count INTEGER NOT NULL DEFAULT 0,
    ai_rewrite INTEGER NOT NULL DEFAULT 1,
    auto_media INTEGER NOT NULL DEFAULT 0,
    auto_media_type TEXT,
    video_source_urls TEXT NOT NULL DEFAULT '[]',
    video_source_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    last_run_at TEXT,
    next_run_at TEXT,
    total_runs INTEGER NOT NULL DEFAULT 0,
    max_runs INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES ad_posts(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ad_schedules_user ON ad_schedules(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_schedules_status ON ad_schedules(status);
  CREATE INDEX IF NOT EXISTS idx_ad_schedules_next ON ad_schedules(next_run_at);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_schedules');

// ─── 7. Медиа-библиотека ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_media_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'image',
    filename TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT,
    size_bytes INTEGER DEFAULT 0,
    width INTEGER,
    height INTEGER,
    duration_sec INTEGER,
    source TEXT NOT NULL DEFAULT 'upload',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ad_media_user ON ad_media_library(user_id);
  CREATE INDEX IF NOT EXISTS idx_ad_media_type ON ad_media_library(type);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_media_library');

// ─── 8. Лог отправок (детальный) ───
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_send_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    schedule_id INTEGER,
    source_id INTEGER NOT NULL,
    tg_message_id TEXT,
    text_sent TEXT,
    media_sent TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    error_text TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (post_id) REFERENCES ad_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES ad_sources(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_ad_send_log_post ON ad_send_log(post_id);
  CREATE INDEX IF NOT EXISTS idx_ad_send_log_schedule ON ad_send_log(schedule_id);
`);
console.log('[AD-CENTER-MIGRATE] ✓ ad_send_log');

console.log('[AD-CENTER-MIGRATE] ✅ All tables created successfully!');
db.close();
