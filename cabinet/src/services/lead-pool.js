// Personal lead pool — reservation layer on top of /data/mlm-contacts.json.
//
// Why: the 9,839-contact MLM database was shared between CRM operators.
// Two users could select overlapping leads → both spam same person.
//
// How: a SQLite table `lead_assignment` (in planner.db) maps each lead to
// at most ONE active CRM operator at a time, with a TTL (default 72h).
// When a user requests "suggested leads", we:
//   1. Return leads they already have active reservations on
//   2. If they have fewer than N active reservations, atomically reserve
//      more from the unreserved pool
//   3. Expired reservations (status=expired) are recycled by a cron
//
// Lead-id = stable hash of (username || url || name+company). We don't trust
// the JSON array index because the file gets re-shuffled on rescrape.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/data';
const CONTACTS_PATH = path.join(DATA_DIR, 'mlm-contacts.json');

const DEFAULT_TTL_HOURS = Number(process.env.LEAD_POOL_TTL_HOURS || 72);
const DEFAULT_BATCH = Number(process.env.LEAD_POOL_DEFAULT_BATCH || 50);
const MAX_ACTIVE_PER_USER = Number(process.env.LEAD_POOL_MAX_ACTIVE || 200);

let _db = null;
function _setDb(db) { _db = db; }

function _stableLeadId(c) {
  // Prefer username; fall back to url, then synthetic name+company hash.
  const key = (c.username || c.url || `${c.name || ''}::${c.company || ''}`).toLowerCase().trim();
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

let _contactsCache = null;
let _contactsCacheTs = 0;
const CACHE_TTL_MS = 60_000;

function _loadContacts() {
  const now = Date.now();
  if (_contactsCache && now - _contactsCacheTs < CACHE_TTL_MS) return _contactsCache;
  try {
    const raw = fs.readFileSync(CONTACTS_PATH, 'utf8');
    const arr = JSON.parse(raw);
    // Index by stable lead id for O(1) lookup
    const byId = new Map();
    for (const c of arr) byId.set(_stableLeadId(c), c);
    _contactsCache = { arr, byId };
    _contactsCacheTs = now;
    return _contactsCache;
  } catch (e) {
    console.error('[lead-pool] load contacts failed:', e.message);
    return { arr: [], byId: new Map() };
  }
}

function applySchema(db) {
  // Idempotent CREATE — table + indexes + partial unique on (lead_id WHERE status='active').
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_assignment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      lead_username TEXT,
      assigned_to_user_id INTEGER NOT NULL,
      assigned_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      released_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_la_user ON lead_assignment(assigned_to_user_id, status);
    CREATE INDEX IF NOT EXISTS idx_la_lead ON lead_assignment(lead_id, status);
    CREATE INDEX IF NOT EXISTS idx_la_expires ON lead_assignment(expires_at, status);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_la_one_active_per_lead
      ON lead_assignment(lead_id) WHERE status='active';
  `);
  console.log('[lead-pool] schema ready');
}

function init(db) { _setDb(db); applySchema(db); }

/**
 * Get suggested leads for a user. Returns an array of contact rows with
 * .reservation = { expiresAt, hoursLeft } attached.
 */
function getSuggestedLeads(userId, opts = {}) {
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || DEFAULT_BATCH));
  const now = Date.now();
  const ttlMs = (Number(opts.ttlHours) || DEFAULT_TTL_HOURS) * 3600 * 1000;
  const contacts = _loadContacts();

  // 1) Read current active assignments for this user
  const existing = _db.prepare(`
    SELECT lead_id, expires_at FROM lead_assignment
    WHERE assigned_to_user_id = ? AND status = 'active'
    ORDER BY assigned_at DESC
  `).all(Number(userId));

  // Drop expired (lazy expire — cron handles full cleanup, but we expire here too)
  const validExisting = [];
  const toExpireIds = [];
  for (const r of existing) {
    if (r.expires_at < now) toExpireIds.push(r.lead_id);
    else validExisting.push(r);
  }
  if (toExpireIds.length) {
    const stmt = _db.prepare(`UPDATE lead_assignment SET status='expired', released_reason='ttl' WHERE lead_id=? AND assigned_to_user_id=? AND status='active'`);
    const tx = _db.transaction((ids) => { for (const id of ids) stmt.run(id, Number(userId)); });
    tx(toExpireIds);
  }

  // 2) Reserve more if we have fewer than limit
  const needToReserve = Math.max(0, limit - validExisting.length);
  let reservedNew = 0;
  if (needToReserve > 0 && validExisting.length < MAX_ACTIVE_PER_USER) {
    // Pool of leads NOT in any active assignment
    const takenIds = new Set(
      _db.prepare(`SELECT lead_id FROM lead_assignment WHERE status='active'`).all().map(r => r.lead_id)
    );
    const insertStmt = _db.prepare(`
      INSERT OR IGNORE INTO lead_assignment
        (lead_id, lead_username, assigned_to_user_id, assigned_at, expires_at, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);
    const txReserve = _db.transaction((rows) => {
      for (const r of rows) insertStmt.run(r.lead_id, r.username || null, Number(userId), now, now + ttlMs);
    });
    const candidates = [];
    // Shuffle index pool so different users hit different leads first
    // (still O(N) but N=9839 — negligible).
    const allIds = Array.from(contacts.byId.keys());
    // Fisher-Yates partial — pick `needToReserve * 3` random candidates and filter
    const seen = new Set();
    let tries = 0;
    while (candidates.length < needToReserve && tries < allIds.length) {
      const i = Math.floor(Math.random() * allIds.length);
      const id = allIds[i];
      if (seen.has(id)) { tries++; continue; }
      seen.add(id);
      tries++;
      if (takenIds.has(id)) continue;
      const c = contacts.byId.get(id);
      if (!c) continue;
      candidates.push({ lead_id: id, username: c.username || null });
    }
    txReserve(candidates);
    reservedNew = candidates.length;
    for (const c of candidates) validExisting.push({ lead_id: c.lead_id, expires_at: now + ttlMs });
  }

  // 3) Hydrate full contact rows + attach reservation meta
  const out = [];
  for (const r of validExisting) {
    const c = contacts.byId.get(r.lead_id);
    if (!c) continue;
    out.push({
      ...c,
      _leadId: r.lead_id,
      reservation: {
        expiresAt: new Date(r.expires_at).toISOString(),
        hoursLeft: Math.max(0, Math.round((r.expires_at - now) / 3600_000)),
      },
    });
  }
  return { ok: true, contacts: out, reserved_new: reservedNew, total_active: out.length };
}

/** Mark a reservation as "written" (user sent first msg) → permanent attribution. */
function markWritten(userId, leadId) {
  const r = _db.prepare(`UPDATE lead_assignment SET status='written', released_reason='first_msg' WHERE lead_id=? AND assigned_to_user_id=? AND status='active'`).run(leadId, Number(userId));
  return { ok: true, changed: r.changes };
}

/** User skipped a lead → release with 7d cool-off (recorded but not re-served to same user). */
function markSkipped(userId, leadId) {
  const r = _db.prepare(`UPDATE lead_assignment SET status='skipped', released_reason='user_skip' WHERE lead_id=? AND assigned_to_user_id=? AND status='active'`).run(leadId, Number(userId));
  return { ok: true, changed: r.changes };
}

/** Cron: expire all assignments past TTL → recycle back to pool. */
function expireOld() {
  const now = Date.now();
  const r = _db.prepare(`UPDATE lead_assignment SET status='expired', released_reason='ttl_cron' WHERE expires_at < ? AND status='active'`).run(now);
  if (r.changes > 0) console.log('[lead-pool] expired', r.changes, 'stale assignments');
  return r.changes;
}

/** Admin metrics. */
function stats() {
  const counts = _db.prepare(`SELECT status, COUNT(*) AS n FROM lead_assignment GROUP BY status`).all();
  const total = _loadContacts().arr.length;
  const active = (counts.find(c => c.status === 'active') || {}).n || 0;
  return { ok: true, total_leads: total, active_reservations: active, by_status: counts };
}

module.exports = {
  init,
  getSuggestedLeads,
  markWritten,
  markSkipped,
  expireOld,
  stats,
  _stableLeadId, // exposed for endpoint that needs to map username → leadId
};
