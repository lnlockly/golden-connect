const { getDb } = require("./planner/db/database");

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS ad_sources (
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

CREATE INDEX IF NOT EXISTS idx_ad_sources_user ON ad_sources(user_id);

CREATE TABLE IF NOT EXISTS adx_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adx_channels (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES ad_sources(id),
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  in_network INTEGER DEFAULT 0,

  categories TEXT DEFAULT '[]',
  language TEXT DEFAULT 'ru',
  description TEXT,

  price_24h REAL DEFAULT 0,
  price_48h REAL DEFAULT 0,
  price_72h REAL DEFAULT 0,
  cpm REAL DEFAULT 0,
  min_order_hours INTEGER DEFAULT 24,

  member_count INTEGER DEFAULT 0,
  member_count_7d_ago INTEGER DEFAULT 0,
  avg_views_per_post INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  posts_per_day REAL DEFAULT 0,

  rating REAL DEFAULT 5.0,
  total_orders INTEGER DEFAULT 0,
  total_earnings REAL DEFAULT 0,
  accept_rate REAL DEFAULT 100,

  frozen_balance REAL DEFAULT 0,
  moderation_note TEXT,

  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adx_channel_stats (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES adx_channels(id),
  date TEXT NOT NULL,
  member_count INTEGER DEFAULT 0,
  avg_views INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  UNIQUE(channel_id, date)
);

CREATE TABLE IF NOT EXISTS adx_orders (
  id INTEGER PRIMARY KEY,
  advertiser_user_id INTEGER NOT NULL,
  channel_id INTEGER NOT NULL REFERENCES adx_channels(id),

  post_text TEXT,
  post_media_url TEXT,
  post_media_type TEXT DEFAULT 'none',
  post_buttons TEXT DEFAULT '[]',
  post_preview_html TEXT,

  placement_hours INTEGER DEFAULT 24,
  start_at DATETIME,
  end_at DATETIME,

  price_usd REAL NOT NULL,
  platform_fee_usd REAL NOT NULL,
  publisher_earnings REAL NOT NULL,

  status TEXT DEFAULT 'pending_approval',
  tg_message_id INTEGER,
  tg_channel_id TEXT,

  publisher_notified_at DATETIME,
  publisher_decision TEXT,
  publisher_decision_at DATETIME,

  last_check_at DATETIME,
  checks_count INTEGER DEFAULT 0,
  removed_early INTEGER DEFAULT 0,
  removal_detected_at DATETIME,

  advertiser_note TEXT,
  publisher_note TEXT,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adx_order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES adx_orders(id),
  event TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adx_penalties (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  publisher_user_id INTEGER NOT NULL,
  penalty_amount REAL NOT NULL,
  advertiser_refund REAL NOT NULL,
  platform_share REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  collected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS adx_reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  reviewer_user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, reviewer_user_id)
);

CREATE TABLE IF NOT EXISTS adx_escrow (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE,
  advertiser_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'held',
  released_at DATETIME,
  released_to INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const SEED_SQL = `INSERT INTO adx_categories VALUES(1,'business','Бизнес','Business','💼',1);
INSERT INTO adx_categories VALUES(2,'finance','Финансы','Finance','💰',2);
INSERT INTO adx_categories VALUES(3,'crypto','Крипто','Crypto','₿',3);
INSERT INTO adx_categories VALUES(4,'marketing','Маркетинг','Marketing','📣',4);
INSERT INTO adx_categories VALUES(5,'it_tech','IT и технологии','IT & Tech','💻',5);
INSERT INTO adx_categories VALUES(6,'entertainment','Развлечения','Entertainment','🎭',6);
INSERT INTO adx_categories VALUES(7,'education','Образование','Education','📚',7);
INSERT INTO adx_categories VALUES(8,'news','Новости','News','📰',8);
INSERT INTO adx_categories VALUES(9,'lifestyle','Лайфстайл','Lifestyle','✨',9);
INSERT INTO adx_categories VALUES(10,'health','Здоровье','Health','🏃',10);
INSERT INTO adx_categories VALUES(11,'gaming','Игры','Gaming','🎮',11);
INSERT INTO adx_categories VALUES(12,'travel','Путешествия','Travel','✈️',12);
INSERT INTO adx_categories VALUES(13,'food','Еда','Food','🍔',13);
INSERT INTO adx_categories VALUES(14,'other','Другое','Other','📌',14);
`;

function applyAdxSchema() {
  const db = getDb();
  try { db.exec(SCHEMA_SQL); }
  catch (e) { console.error("[adx-migrate schema]", e.message); }
  try {
    const n = db.prepare("SELECT COUNT(*) AS n FROM adx_categories").get().n;
    if (n === 0) db.exec(SEED_SQL);
  } catch (e) { console.warn("[adx-migrate seed]", e.message); }
  console.log("[adx] schema ready");
}

module.exports = { applyAdxSchema };
