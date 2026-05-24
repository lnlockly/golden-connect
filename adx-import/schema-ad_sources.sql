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
CREATE INDEX idx_ad_sources_user ON ad_sources(user_id);
