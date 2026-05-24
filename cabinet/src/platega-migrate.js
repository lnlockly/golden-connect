// Platega invoice ledger. Idempotent.
const dbModule = require('./planner/db/database');

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS platega_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT UNIQUE,
    order_id TEXT UNIQUE NOT NULL,
    user_id INTEGER,
    purpose TEXT NOT NULL,
    target_id INTEGER,
    amount_usd REAL NOT NULL,
    amount_rub INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    pay_url TEXT,
    raw_create TEXT,
    raw_webhook TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_platega_user ON platega_invoices(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_platega_status ON platega_invoices(status)`,
  `CREATE INDEX IF NOT EXISTS idx_platega_order ON platega_invoices(order_id)`,
];

function applyPlategaSchema() {
  const db = dbModule.getDb();
  try { for (const s of STATEMENTS) db.exec(s); }
  catch (e) { console.error('[platega-migrate]', e.message); }
  console.log('[platega] schema ready');
}

module.exports = { applyPlategaSchema };
