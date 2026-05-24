// Trendex Withdrawals — earned balance → crypto/card payout via Cryptomus.
// Flow:
//   1. User submits POST /api/withdrawals { amount_usd, currency, address }
//   2. Backend deducts earned_balance immediately (hold) → status='pending'
//   3. Admin sees pending queue → POST /api/admin/withdrawals/:id/approve
//   4. Backend calls Cryptomus payout API → on success status='paid'+tx_hash
//   5. On reject: POST .../reject → balance refunded
const { creditApi, debitApi, getBalance } = require('../services/balance-bridge');
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const dbModule = require('../planner/db/database');

const CENTS = 100;
const MIN_USD = 3;
const FEE_BPS = 200; // 2% withdraw fee

function ensureSchema() {
  const db = dbModule.getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      fee_cents INTEGER DEFAULT 0,
      net_cents INTEGER NOT NULL,
      currency TEXT NOT NULL,
      address TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_hash TEXT,
      cryptomus_uuid TEXT,
      reject_reason TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      processed_at TEXT,
      raw_response TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
  `);
}

function plannerUserFor(rawDb, webUser) {
  let u;
  if (webUser.telegramUserId) {
    u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(Number(webUser.telegramUserId));
    if (u) return u;
  }
  const synth = -Math.abs(Number(webUser.id));
  u = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(synth);
  if (u) return u;
  return dbModule.ensureUser({
    id: synth,
    username: (webUser.email || 'user').split('@')[0],
    first_name: webUser.displayName || webUser.email || ('User ' + webUser.id),
  });
}

function makeSign(payload, key) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return crypto.createHash('md5').update(body + key).digest('hex');
}

/* DISABLED — manual approve mode
function cryptomusPayout(payload) {
  return new Promise((resolve, reject) => {
    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID || '';
    const payoutKey = process.env.CRYPTOMUS_PAYOUT_KEY || process.env.CRYPTOMUS_PAYMENT_KEY || '';
    if (!merchantId || !payoutKey) return reject(new Error('cryptomus payout creds missing'));
    const body = JSON.stringify(payload);
    const sign = makeSign(payload, payoutKey);
    const req = https.request({
      method: 'POST', hostname: 'api.cryptomus.com', path: '/v1/payout',
      headers: {
        'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body),
        'merchant': merchantId, 'sign': sign,
      },
      timeout: 20000,
    }, (res) => {
      let data = ''; res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('cryptomus payout timeout')));
    req.write(body); req.end();
  });
}
*/

function createWithdrawalsRouter(_config, storage, requireAuth, requireAdmin) {
  ensureSchema();
  const router = express.Router();
  const rawDb = dbModule.getDb();

  router.get('/health', (_req, res) => {
    const ok = true; // manual approve mode
    res.json({ ok: true, configured: ok, min_usd: MIN_USD, fee_bps: FEE_BPS });
  });

  // List MY withdrawals
  router.get('/', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(rawDb, req.webUser);
      const items = rawDb.prepare('SELECT id, amount_cents, fee_cents, net_cents, currency, address, status, tx_hash, reject_reason, created_at, processed_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id);
      res.json({ ok: true, items });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // Create withdrawal request
  router.post('/', requireAuth, async (req, res) => {
    try {
      const body = req.body || {};
      const amountUsd = Number(body.amount_usd);
      const currency = String(body.currency || 'USDT').toUpperCase();
      const address = String(body.address || '').trim();
      if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD) return res.status(400).json({ ok: false, reason: 'min_usd', min: MIN_USD });
      if (!['USDT', 'USDC', 'BTC', 'ETH', 'TON'].includes(currency)) return res.status(400).json({ ok: false, reason: 'unsupported_currency' });
      if (address.length < 20 || address.length > 200) return res.status(400).json({ ok: false, reason: 'invalid_address' });

      const u = plannerUserFor(rawDb, req.webUser);
      const amountCents = Math.round(amountUsd * CENTS);
      const feeCents = Math.round((amountCents * FEE_BPS) / 10000);
      const netCents = amountCents - feeCents;
      // Phase H: gate on api Postgres (single source); planner number is stale
      const _wbal = await getBalance({ tgId: u.tg_id });
      const balance = _wbal.working_cents;
      if (balance < amountCents) return res.status(402).json({ ok: false, reason: 'insufficient_balance', need_cents: amountCents, have_cents: balance });

      // Phase I.r2: debit api Postgres BEFORE creating the SQLite hold,
      // so an api failure aborts the request instead of leaving an inconsistent withdrawal row.
      if (u.tg_id) {
        const dr = await debitApi({
          tgId: u.tg_id, wallet: 'working', cents: amountCents,
          kind: 'withdrawal_request', memo: 'withdrawal request',
        });
        if (!dr || !dr.ok) {
          if (String(dr && dr.error || '').startsWith('insufficient')) {
            return res.status(402).json({ ok: false, reason: 'insufficient_balance' });
          }
          return res.status(502).json({ ok: false, reason: 'api_debit_failed', error: dr && dr.error });
        }
      }

      let id;
      try {
        id = rawDb.transaction(() => {
          const r = rawDb.prepare(`INSERT INTO withdrawals (user_id, amount_cents, fee_cents, net_cents, currency, address, status)
                                    VALUES (?, ?, ?, ?, ?, ?, 'pending')`)
            .run(u.id, amountCents, feeCents, netCents, currency, address);
          rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note)
                         VALUES ('withdraw_hold', ?, 'earned', ?, ?)`).run(u.id, -amountCents, 'withdraw #' + r.lastInsertRowid);
          return r.lastInsertRowid;
        })();
      } catch (e) {
        // SQLite tx failed AFTER api debit — best-effort refund the api side
        try {
          const { creditApi } = require('../services/balance-bridge');
          await creditApi({ tgId: u.tg_id, wallet: 'working', cents: amountCents, kind: 'withdrawal_rollback', memo: 'rollback after sqlite tx failure' });
        } catch (_) {}
        return res.status(500).json({ ok: false, reason: 'db_failed', detail: e.message });
      }

      res.status(201).json({ ok: true, withdrawal_id: id, amount_cents: amountCents, fee_cents: feeCents, net_cents: netCents });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ─── Admin endpoints ───
  router.get('/admin', requireAdmin, (_req, res) => {
    try {
      const items = rawDb.prepare(`SELECT w.*, u.tg_username, u.tg_first_name FROM withdrawals w
                                    LEFT JOIN users u ON u.id = w.user_id
                                    WHERE w.status IN ('pending','processing') ORDER BY w.id ASC LIMIT 200`).all();
      res.json({ ok: true, items });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/admin/:id/approve', requireAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const w = rawDb.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      if (!w || w.status !== 'pending') return res.status(404).json({ ok: false, reason: 'not_pending' });

      rawDb.prepare("UPDATE withdrawals SET status='processing' WHERE id = ?").run(id);
      // MANUAL MODE: do not call Cryptomus. Admin marks paid with optional tx_hash.
      const manualTxHash = String((req.body && req.body.tx_hash) || '').trim();
      const manualNote = String((req.body && req.body.note) || '').trim();
      rawDb.prepare("UPDATE withdrawals SET status='paid', tx_hash=?, processed_at=datetime('now'), raw_response=? WHERE id=?")
        .run(manualTxHash || null, JSON.stringify({ mode: 'manual', note: manualNote, by_admin_at: new Date().toISOString() }), id);
      return res.json({ ok: true, manual: true, id, tx_hash: manualTxHash || null });

      const orderId = 'wd-' + id + '-' + Date.now();
      try {
        const resp = await cryptomusPayout({
          amount: (w.net_cents / CENTS).toFixed(2),
          currency: w.currency,
          order_id: orderId,
          address: w.address,
          is_subtract: 1,
          network: w.currency === 'USDT' ? 'TRON' : (w.currency === 'USDC' ? 'TRON' : undefined),
          url_callback: (process.env.PUBLIC_BASE_URL || 'https://trendex.biz/cabinet').replace(/\/$/, '').replace('/cabinet','') + '/cabinet/api/withdrawals/webhook',
        });
        if (resp.state === 0 && resp.result) {
          rawDb.prepare(`UPDATE withdrawals SET status='paid', cryptomus_uuid=?, tx_hash=?, processed_at=datetime('now'), raw_response=? WHERE id=?`)
            .run(resp.result.uuid || null, resp.result.txid || null, JSON.stringify(resp).slice(0, 4000), id);
          rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note)
                         VALUES ('withdraw_paid', ?, 'earned', 0, ?)`).run(w.user_id, 'paid out via cryptomus #' + id);
          return res.json({ ok: true, status: 'paid', tx: resp.result.txid });
        }
        rawDb.prepare("UPDATE withdrawals SET status='pending', raw_response=? WHERE id=?").run(JSON.stringify(resp).slice(0, 4000), id);
        return res.status(502).json({ ok: false, reason: 'cryptomus_error', resp });
      } catch (e) {
        rawDb.prepare("UPDATE withdrawals SET status='pending' WHERE id = ?").run(id);
        return res.status(500).json({ ok: false, reason: e.message });
      }
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/admin/:id/reject', requireAdmin, (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const reason = String((req.body && req.body.reason) || 'rejected by admin').slice(0, 200);
      const w = rawDb.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
      if (!w || !['pending', 'processing'].includes(w.status)) return res.status(404).json({ ok: false, reason: 'not_pending' });
      rawDb.transaction(() => {
        rawDb.prepare("UPDATE withdrawals SET status='rejected', reject_reason=?, processed_at=datetime('now') WHERE id=?").run(reason, id);
        /* Phase G: planner cents write removed (api dual-write above is single source) */
        // Phase F dual-write
        (async () => { try { const u2 = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(w.user_id); if (u2 && u2.tg_id) await creditApi({ tgId: u2.tg_id, wallet: 'working', cents: w.amount_cents, kind: 'withdrawal_refund', memo: 'withdrawal #' + w.id + ' refund' }); } catch (e) { console.warn('[withdrawals] api refund credit failed:', e && e.message); } })();
        rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note)
                       VALUES ('withdraw_refund', ?, 'earned', ?, ?)`).run(w.user_id, w.amount_cents, 'refund #' + id + ': ' + reason);
      })();
      res.json({ ok: true, status: 'rejected', refunded_cents: w.amount_cents });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  return router;
}

module.exports = { createWithdrawalsRouter };
