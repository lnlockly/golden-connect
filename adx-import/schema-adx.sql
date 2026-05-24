CREATE TABLE adx_categories (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
)
CREATE TABLE adx_channels (
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
)
CREATE TABLE adx_channel_stats (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES adx_channels(id),
  date TEXT NOT NULL,
  member_count INTEGER DEFAULT 0,
  avg_views INTEGER DEFAULT 0,
  posts_count INTEGER DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  UNIQUE(channel_id, date)
)
CREATE TABLE adx_orders (
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
)
CREATE TABLE adx_order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES adx_orders(id),
  event TEXT NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
CREATE TABLE adx_penalties (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  publisher_user_id INTEGER NOT NULL,
  penalty_amount REAL NOT NULL,
  advertiser_refund REAL NOT NULL,
  platform_share REAL NOT NULL,
  status TEXT DEFAULT 'pending',
  collected_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
CREATE TABLE adx_reviews (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL,
  reviewer_user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, reviewer_user_id)
)
CREATE TABLE adx_escrow (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL UNIQUE,
  advertiser_user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'held',
  released_at DATETIME,
  released_to INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
