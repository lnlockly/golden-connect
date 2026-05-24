// Marketplace schema bootstrap. Idempotent. Safe to run on every boot.
const dbModule = require('./planner/db/database');

const STATEMENTS = [
  // Per-user shops (separate entity, embeddable as bio widget)
  `CREATE TABLE IF NOT EXISTS user_shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    tagline TEXT,
    about_html TEXT,
    avatar_url TEXT,
    banner_url TEXT,
    theme_color TEXT DEFAULT '#00D4FF',
    accent_color TEXT DEFAULT '#B14AED',
    contact_tg TEXT,
    contact_email TEXT,
    social_links_json TEXT DEFAULT '[]',
    is_public INTEGER DEFAULT 1,
    total_views INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shops_slug ON user_shops(slug)`,

  // M2M: which products are showcased in which shop
  `CREATE TABLE IF NOT EXISTS shop_products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    is_featured INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    added_at TEXT DEFAULT (datetime('now')),
    UNIQUE(shop_id, product_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shopprod_shop ON shop_products(shop_id, position)`,
  `CREATE INDEX IF NOT EXISTS idx_shopprod_product ON shop_products(product_id)`,

  // Reviews — only paid buyers can write (purchase_id UNIQUE)
  `CREATE TABLE IF NOT EXISTS product_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    purchase_id INTEGER NOT NULL UNIQUE,
    buyer_user_id INTEGER,
    buyer_email TEXT,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    text TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reviews_product ON product_reviews(product_id)`,

  // Split ledger: 70 seller / 10 project / 15 multilevel / 5 pool
  `CREATE TABLE IF NOT EXISTS product_purchase_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    split_type TEXT NOT NULL,
    recipient_user_id INTEGER,
    upline_level INTEGER,
    amount_usd REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_splits_purchase ON product_purchase_splits(purchase_id)`,
  `CREATE INDEX IF NOT EXISTS idx_splits_recipient ON product_purchase_splits(recipient_user_id, split_type)`,
  // Visit tracking — anti-spam: 1 unique row per (entity, ip, hour)
  `CREATE TABLE IF NOT EXISTS shop_visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    hour_key TEXT NOT NULL,
    ref_source TEXT,
    ref_user_id INTEGER,
    visited_at TEXT DEFAULT (datetime('now')),
    UNIQUE(shop_id, ip_hash, hour_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shop_visits_shop ON shop_visits(shop_id, visited_at)`,

  `CREATE TABLE IF NOT EXISTS product_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    hour_key TEXT NOT NULL,
    ref_source TEXT,
    ref_user_id INTEGER,
    viewed_at TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, ip_hash, hour_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_product_views_product ON product_views(product_id, viewed_at)`,
];

// Columns to add to user_products if missing
const PRODUCT_COLS = [
  ['gallery_json', "TEXT DEFAULT '[]'"],
  ['video_url', 'TEXT'],
  ['variants_json', "TEXT DEFAULT '[]'"],
  ['slug', 'TEXT'],
  ['short_url', 'TEXT'],
  ['qr_url', 'TEXT'],
  ['og_image', 'TEXT'],
  ['avg_rating', 'REAL DEFAULT 0'],
  ['reviews_count', 'INTEGER DEFAULT 0'],
  ['view_count', 'INTEGER DEFAULT 0'],
  ['seller_pct', 'REAL DEFAULT 0.70'],
];

// Columns to add to product_purchases if missing
const PURCHASE_COLS = [
  ['shop_owner_user_id', 'INTEGER'],
  ['buyer_user_id', 'INTEGER'],
  ['split_done', 'INTEGER DEFAULT 0'],
];

function applyShopSchema() {
  const db = dbModule.getDb();
  try { for (const sql of STATEMENTS) db.exec(sql); }
  catch (e) { console.error('[shop-migrate] tables:', e.message); }

  // Add missing columns to user_products
  try {
    const have = new Set(db.prepare("PRAGMA table_info(user_products)").all().map(c => c.name));
    for (const [col, type] of PRODUCT_COLS) {
      if (!have.has(col)) {
        try { db.exec("ALTER TABLE user_products ADD COLUMN " + col + " " + type); }
        catch (e) { console.error('[shop-migrate] add', col, ':', e.message); }
      }
    }
  } catch (e) { console.error('[shop-migrate] user_products inspect:', e.message); }

  try {
    const havep = new Set(db.prepare("PRAGMA table_info(product_purchases)").all().map(c => c.name));
    for (const [col, type] of PURCHASE_COLS) {
      if (!havep.has(col)) {
        try { db.exec("ALTER TABLE product_purchases ADD COLUMN " + col + " " + type); }
        catch (e) { console.error('[shop-migrate] add purchase col', col, ':', e.message); }
      }
    }
  } catch (e) { console.error('[shop-migrate] product_purchases inspect:', e.message); }

  console.log('[shop] schema ready');
}

module.exports = { applyShopSchema };
