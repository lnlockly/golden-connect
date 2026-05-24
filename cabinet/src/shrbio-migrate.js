// Trendex Shortener+Bio schema bootstrap. Idempotent. Inlined.
const { getDb } = require("./planner/db/database");

const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS shortener_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT DEFAULT '#667eea',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS short_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      campaign_id INTEGER,
      code TEXT UNIQUE NOT NULL,
      destination_url TEXT NOT NULL,
      title TEXT,
      is_active INTEGER DEFAULT 1,
      total_clicks INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      password_hash TEXT, utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT, og_title TEXT, og_description TEXT, og_image TEXT, is_pinned INTEGER DEFAULT 0, is_bio_visible INTEGER DEFAULT 0, domain TEXT DEFAULT 't2gift.online', promo_video_url TEXT, promo_video_ready INTEGER NOT NULL DEFAULT 0, destination_urls TEXT, splash_enabled INTEGER DEFAULT 1, rotation_index INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (campaign_id) REFERENCES shortener_campaigns(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS short_link_qrcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      color TEXT DEFAULT '#000000',
      bg_color TEXT DEFAULT '#ffffff',
      size INTEGER DEFAULT 400,
      total_clicks INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (link_id) REFERENCES short_links(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS short_link_clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      qr_id INTEGER,
      ip_address TEXT,
      country TEXT,
      city TEXT,
      referer TEXT,
      user_agent TEXT,
      device_type TEXT,
      browser TEXT,
      os TEXT,
      created_at TEXT DEFAULT (datetime('now')), language TEXT,
      FOREIGN KEY (link_id) REFERENCES short_links(id) ON DELETE CASCADE,
      FOREIGN KEY (qr_id) REFERENCES short_link_qrcodes(id) ON DELETE SET NULL
    );

CREATE TABLE IF NOT EXISTS short_link_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      link_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (link_id) REFERENCES short_links(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS short_link_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL,
      rule_type TEXT NOT NULL,
      rule_value TEXT NOT NULL,
      destination_url TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      FOREIGN KEY (link_id) REFERENCES short_links(id) ON DELETE CASCADE
    );

CREATE TABLE IF NOT EXISTS user_bio_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    slug TEXT NOT NULL DEFAULT 'main',
    username TEXT NOT NULL,
    page_name TEXT DEFAULT 'My Bio',
    display_name TEXT,
    bio TEXT,
    avatar_url TEXT,
    theme_color TEXT DEFAULT '#667eea',
    background TEXT DEFAULT 'gradient',
    show_avatar INTEGER DEFAULT 1,
    is_public INTEGER DEFAULT 1,
    social_links TEXT,
    button_style TEXT,
    bg_image TEXT,
    bg_video TEXT,
    meta_title TEXT,
    meta_description TEXT,
    total_views INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, slug),
    UNIQUE(username)
  );

CREATE TABLE IF NOT EXISTS bio_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    icon TEXT DEFAULT '',
    position INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    total_clicks INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), type TEXT DEFAULT 'link', content TEXT DEFAULT '',
    FOREIGN KEY (bio_id) REFERENCES user_bio_profiles(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS bio_social_icons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio_id INTEGER NOT NULL,
    platform TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    position INTEGER DEFAULT 0,
    FOREIGN KEY (bio_id) REFERENCES user_bio_profiles(id) ON DELETE CASCADE
  );

CREATE TABLE IF NOT EXISTS bio_page_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    referer TEXT,
    language TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS bio_link_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio_id INTEGER NOT NULL,
    link_id INTEGER NOT NULL,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS bio_social_clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bio_id INTEGER NOT NULL,
    social_id INTEGER NOT NULL,
    ip_address TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

CREATE TABLE IF NOT EXISTS bio_ab_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bio_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT DEFAULT 'A/B Test',
  variant_b_json TEXT NOT NULL,
  split_ratio INTEGER DEFAULT 50,
  is_active INTEGER DEFAULT 0,
  impressions_a INTEGER DEFAULT 0,
  impressions_b INTEGER DEFAULT 0,
  clicks_a INTEGER DEFAULT 0,
  clicks_b INTEGER DEFAULT 0,
  started_at TEXT,
  ended_at TEXT,
  winner TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_usd REAL DEFAULT 0,
  download_url TEXT,
  preview_image TEXT,
  category TEXT DEFAULT 'other',
  is_active INTEGER DEFAULT 1,
  total_sales INTEGER DEFAULT 0,
  total_revenue REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_product_listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  bio_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  is_featured INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  UNIQUE(bio_id, product_id)
);

CREATE TABLE IF NOT EXISTS product_purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_email TEXT,
  product_id INTEGER NOT NULL,
  seller_user_id INTEGER NOT NULL,
  amount_usd REAL,
  invoice_id TEXT,
  payment_status TEXT DEFAULT 'pending',
  download_token TEXT UNIQUE,
  download_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bio_custom_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bio_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  dns_status TEXT DEFAULT 'pending',
  verification_token TEXT,
  ssl_status TEXT DEFAULT 'none',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_promo_banners (user_id INTEGER PRIMARY KEY, template TEXT, style TEXT, status TEXT DEFAULT pending, error_text TEXT, created_at TEXT);
`;

function applyShrBioSchema() {
  const db = getDb();
  try { db.exec(SCHEMA_SQL); }
  catch (e) { console.error("[shrbio-migrate]", e.message); }
  console.log("[shrbio] schema ready");
}

module.exports = { applyShrBioSchema };
