// cabinet/src/services/mlm-sqlite.js
// SQLite layer for MLM CRM — стартует пустую базу, делает миграцию из JSON.
// Используется как fallback-уровень: JSON остаётся источником истины для
// текущей версии, SQLite — read-cache для быстрых фильтров и FTS поиска.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(__dirname, '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'mlm.sqlite');
const CONTACTS_JSON = path.join(DATA_DIR, 'mlm-contacts.json');
const COMPANIES_JSON = path.join(DATA_DIR, 'mlm-companies.json');

let _db = null;
function db() {
  if (_db) return _db;
  let SqliteCtor;
  try { SqliteCtor = require('better-sqlite3'); }
  catch (e) {
    console.warn('[mlm-sqlite] better-sqlite3 not installed — DB layer disabled');
    return null;
  }
  _db = new SqliteCtor(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.exec(SCHEMA);
  return _db;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  username TEXT PRIMARY KEY,
  name TEXT,
  company TEXT,
  company_id INTEGER,
  country TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  description TEXT,
  telegram TEXT,
  whatsapp TEXT,
  vk TEXT,
  url TEXT,
  fetched_at TEXT,
  raw_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_contacts_country ON contacts(country);
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city);
CREATE INDEX IF NOT EXISTS idx_contacts_has_tg ON contacts(telegram) WHERE telegram IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_has_phone ON contacts(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY,
  name TEXT,
  category TEXT,
  leader_count INTEGER,
  tags TEXT,
  ai_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_companies_category ON companies(category);

-- FTS5 для умного поиска
CREATE VIRTUAL TABLE IF NOT EXISTS contacts_fts USING fts5(
  username, name, company, country, city, description,
  content='contacts', content_rowid='rowid'
);
`;

// Migrate JSON → SQLite. Idempotent: ON CONFLICT REPLACE.
function migrate() {
  const d = db(); if (!d) return { ok: false, reason: 'no_db' };
  let contactsN = 0, companiesN = 0;
  try {
    if (fs.existsSync(COMPANIES_JSON)) {
      const arr = JSON.parse(fs.readFileSync(COMPANIES_JSON, 'utf8'));
      const stmt = d.prepare('INSERT OR REPLACE INTO companies (id, name, category, leader_count, tags, ai_note) VALUES (?,?,?,?,?,?)');
      const txn = d.transaction((rows) => {
        for (const r of rows) {
          stmt.run(r.id, r.name || null, r.category || null, r.leaderCount || null,
            r.tags ? JSON.stringify(r.tags) : null, r.ai_note || null);
        }
      });
      txn(arr);
      companiesN = arr.length;
    }
    if (fs.existsSync(CONTACTS_JSON)) {
      const arr = JSON.parse(fs.readFileSync(CONTACTS_JSON, 'utf8'));
      const stmt = d.prepare(`INSERT OR REPLACE INTO contacts (
        username, name, company, company_id, country, city, phone, email,
        description, telegram, whatsapp, vk, url, fetched_at, raw_json
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const txn = d.transaction((rows) => {
        for (const r of rows) {
          if (!r.username) continue;
          stmt.run(
            r.username, r.name || null, r.company || null, r.company_id || null,
            r.country || null, r.city || null, r.phone || null, r.email || null,
            r.description || null, r.contacts?.telegram || null, r.contacts?.whatsapp || null,
            r.contacts?.vk || null, r.url || null, r.fetched_at || null,
            JSON.stringify(r)
          );
        }
      });
      txn(arr);
      contactsN = arr.length;
    }
    // Rebuild FTS index
    d.exec("INSERT INTO contacts_fts(contacts_fts) VALUES('rebuild');");
  } catch (e) {
    console.error('[mlm-sqlite] migrate err:', e.message);
    return { ok: false, error: e.message };
  }
  console.log(`[mlm-sqlite] migrated ${contactsN} contacts, ${companiesN} companies`);
  return { ok: true, contacts: contactsN, companies: companiesN };
}

// Fast filtered search via SQL
function search(opts = {}) {
  const d = db(); if (!d) return null;
  const where = []; const params = {};
  if (opts.q) {
    // FTS5 full-text — much faster than substring
    const ftsQ = String(opts.q).replace(/['"]/g, '').split(/\s+/).filter(Boolean).map(t => t + '*').join(' ');
    const sql = `SELECT c.* FROM contacts_fts f
                 JOIN contacts c ON c.rowid = f.rowid
                 WHERE contacts_fts MATCH ?
                 LIMIT ? OFFSET ?`;
    return d.prepare(sql).all(ftsQ, opts.limit || 50, opts.offset || 0);
  }
  if (opts.companyId) { where.push('company_id = @companyId'); params.companyId = +opts.companyId; }
  if (opts.country) { where.push('LOWER(country) = LOWER(@country)'); params.country = opts.country; }
  if (opts.city) { where.push('LOWER(city) = LOWER(@city)'); params.city = opts.city; }
  if (opts.hasTelegram) where.push('telegram IS NOT NULL');
  if (opts.hasPhone) where.push('phone IS NOT NULL');
  let sql = 'SELECT * FROM contacts';
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' LIMIT @limit OFFSET @offset';
  params.limit = +opts.limit || 50;
  params.offset = +opts.offset || 0;
  return d.prepare(sql).all(params);
}

function status() {
  const d = db(); if (!d) return { available: false };
  return {
    available: true,
    contacts: d.prepare('SELECT COUNT(*) c FROM contacts').get().c,
    companies: d.prepare('SELECT COUNT(*) c FROM companies').get().c,
    db_path: DB_PATH,
    db_size_kb: fs.existsSync(DB_PATH) ? Math.round(fs.statSync(DB_PATH).size / 1024) : 0,
  };
}

module.exports = { db, migrate, search, status };
