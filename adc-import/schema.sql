CREATE TABLE tg_broadcasts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER,
    message_ru TEXT,
    message_en TEXT,
    media_template TEXT,
    media_params TEXT,
    media_url TEXT,
    target_filter TEXT,
    total_recipients INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  );
CREATE TABLE ad_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
CREATE TABLE ad_sources (
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
    added_at TEXT NOT NULL DEFAULT (datetime('now')), best_hours TEXT DEFAULT NULL, total_sent INTEGER DEFAULT 0, total_failed INTEGER DEFAULT 0, last_sent_at TEXT DEFAULT NULL, description TEXT, photo_url TEXT, invite_link TEXT, linked_chat_id TEXT, avg_post_views REAL, is_verified INTEGER DEFAULT 0, slow_mode_delay INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
CREATE TABLE ad_campaign_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    source_id INTEGER NOT NULL,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES ad_sources(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, source_id)
  );
CREATE TABLE ad_posts (
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
    sent_at TEXT, ab_variant TEXT DEFAULT NULL, ab_parent_id INTEGER DEFAULT NULL, tg_buttons_json TEXT DEFAULT NULL, utm_auto INTEGER DEFAULT 0, watermark_text TEXT DEFAULT NULL, smart_queue INTEGER DEFAULT 0, translated_from INTEGER DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE SET NULL
  );
CREATE TABLE ad_post_sources (
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
CREATE TABLE ad_schedules (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')), auto_delete_previous INTEGER DEFAULT 0, last_post_id INTEGER, tg_cta_link TEXT, tg_cta_text TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (post_id) REFERENCES ad_posts(id) ON DELETE SET NULL
  );
CREATE TABLE ad_media_library (
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')), tg_file_id TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
CREATE TABLE ad_send_log (
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
CREATE TABLE ad_post_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    text_content TEXT,
    media_url TEXT,
    media_type TEXT DEFAULT 'text',
    tg_buttons_json TEXT,
    links_json TEXT,
    tags TEXT,
    use_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE ad_monitor_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    platform TEXT,
    last_check TEXT,
    last_video_id TEXT,
    auto_post INTEGER DEFAULT 1,
    campaign_id INTEGER,
    target_sources_json TEXT DEFAULT '[]',
    ai_prompt TEXT,
    interval_hours INTEGER DEFAULT 6,
    watermark_text TEXT,
    banner_video TEXT,
    language TEXT DEFAULT 'ru',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now'))
  );
CREATE TABLE ad_smart_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    post_id INTEGER,
    source_id INTEGER NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TEXT,
    error_text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
