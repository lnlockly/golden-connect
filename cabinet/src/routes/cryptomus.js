const { invalidatePlan: _invPlan } = require('../helpers/usage-limits');
// Golden Connect Cryptomus integration — top-up gift balance with crypto.
// Docs: https://doc.cryptomus.com/payments/creating-invoice
//
// Flow:
//   1. User clicks "Пополнить" → POST /api/cryptomus/invoice with amount in cents
//   2. We call Cryptomus invoice API → get url + uuid → save pending row
//   3. User pays at the returned URL
//   4. Cryptomus calls our webhook /api/cryptomus/webhook with sign
//   5. We verify sign → on 'paid' status → credit gift_balance_cents
//
// Env required:
//   CRYPTOMUS_MERCHANT_ID  (UUID from cabinet)
//   CRYPTOMUS_PAYMENT_KEY  (API key, used in sign)
//   CRYPTOMUS_WEBHOOK_KEY  (separate webhook key, optional but recommended)

const express = require('express');
const crypto = require('crypto');
const https = require('https');
const dbModule = require('../planner/db/database');

const MIN_USD = 5;
const MAX_USD = 5000;
const CENTS = 100;

function ensureSchema() {
  const db = dbModule.getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS cryptomus_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT UNIQUE,
      order_id TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      url TEXT,
      currency TEXT DEFAULT 'USD',
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      paid_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cryptomus_user ON cryptomus_invoices(user_id);
    CREATE INDEX IF NOT EXISTS idx_cryptomus_status ON cryptomus_invoices(status);
  `);
}

function makeSign(payload, key) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');
  return crypto.createHash('md5').update(body + key).digest('hex');
}

function cryptomusRequest(path, payload) {
  return new Promise((resolve, reject) => {
    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID || '';
    const apiKey = process.env.CRYPTOMUS_PAYMENT_KEY || '';
    if (!merchantId || !apiKey) return reject(new Error('cryptomus credentials missing'));
    const body = JSON.stringify(payload);
    const sign = makeSign(payload, apiKey);
    const req = https.request({
      method: 'POST',
      hostname: 'api.cryptomus.com',
      path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'merchant': merchantId,
        'sign': sign,
      },
      timeout: 15000,
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.state === 0 || parsed.result) return resolve(parsed);
          reject(new Error('cryptomus: ' + JSON.stringify(parsed)));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('cryptomus timeout')));
    req.write(body);
    req.end();
  });
}

function verifyWebhookSign(body, sign) {
  const key = process.env.CRYPTOMUS_WEBHOOK_KEY || process.env.CRYPTOMUS_PAYMENT_KEY || '';
  if (!key) return false;
  const { sign: _ignored, ...rest } = body;
  const expected = makeSign(rest, key);
  return expected === sign;
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

function createCryptomusRouter(_config, _storage, requireAuth) {
  ensureSchema();
  const router = express.Router();
  const rawDb = dbModule.getDb();

  router.get('/health', (_req, res) => {
    const ok = !!process.env.CRYPTOMUS_MERCHANT_ID && !!process.env.CRYPTOMUS_PAYMENT_KEY;
    res.json({ ok: true, configured: ok });
  });

  // Create invoice — returns Cryptomus payment URL.
  router.post('/invoice', requireAuth, async (req, res) => {
    try {
      const u = plannerUserFor(rawDb, req.webUser);
      const amountUsd = Number(req.body && req.body.amount_usd);
      if (!Number.isFinite(amountUsd) || amountUsd < MIN_USD || amountUsd > MAX_USD) {
        return res.status(400).json({ ok: false, reason: 'invalid_amount', min: MIN_USD, max: MAX_USD });
      }
      const orderId = 'topup-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
      const amountCents = Math.round(amountUsd * CENTS);
      const baseUrl = (process.env.PUBLIC_BASE_URL || 'https://golden-connect.to/cabinet').replace(/\/$/, '');
      const apiBase = baseUrl.replace('/cabinet', '');
      const payload = {
        amount: amountUsd.toFixed(2),
        currency: 'USD',
        order_id: orderId,
        url_callback: apiBase + '/cabinet/api/cryptomus/webhook',
        url_return:   baseUrl + '/cabinet#/ads',
        url_success:  baseUrl + '/cabinet#/ads?topup=ok',
        is_payment_multiple: false,
        lifetime: 3600,
        to_currency: 'USDT',
      };
      let resp;
      try { resp = await cryptomusRequest('/v1/payment', payload); }
      catch (e) { return res.status(503).json({ ok: false, reason: 'cryptomus_unavailable', detail: e.message }); }

      const result = resp.result || {};
      rawDb.prepare(`INSERT INTO cryptomus_invoices (uuid, order_id, user_id, amount_cents, status, url, currency, raw_response)
                     VALUES (?, ?, ?, ?, 'pending', ?, 'USD', ?)`)
        .run(result.uuid || null, orderId, u.id, amountCents, result.url || null, JSON.stringify(resp).slice(0, 4000));
      res.json({ ok: true, order_id: orderId, url: result.url, uuid: result.uuid, amount_usd: amountUsd, expires_at: result.expired_at });
    } catch (e) {
      console.error('[cryptomus invoice]', e.message);
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // Webhook — Cryptomus pings us when payment status changes.
  router.post('/webhook', express.json({ limit: '256kb' }), (req, res) => {
    try {
      const body = req.body || {};
      const sign = body.sign || req.headers['sign'] || '';
      if (!verifyWebhookSign(body, sign)) {
        console.warn('[cryptomus webhook] bad sign for order', body.order_id);
        return res.status(401).json({ ok: false });
      }
      const orderId = body.order_id;
      const status = String(body.status || '').toLowerCase();
      const inv = rawDb.prepare('SELECT * FROM cryptomus_invoices WHERE order_id = ?').get(orderId);
      if (!inv) return res.json({ ok: true, ignored: 'unknown_order' });
      if (inv.status === 'paid') return res.json({ ok: true, already: true });
      const paidStates = ['paid', 'paid_over'];
      if (paidStates.includes(status)) {
        // Credit gift_balance + log tx atomically
        const txn = rawDb.transaction(() => {
          rawDb.prepare("UPDATE cryptomus_invoices SET status = 'paid', paid_at = datetime('now'), raw_response = ? WHERE id = ?")
            .run(JSON.stringify(body).slice(0, 4000), inv.id);
          // Phase E dual-write
          (async () => { try { await creditApi({ tgId: row.tg_id, wallet: 'gift', cents, kind: 'topup_cryptomus', memo: 'cryptomus webhook ' + (paymentId || '') }); } catch (e) { console.warn('[cryptomus] api credit failed:', e && e.message); } })();
          // Phase G: planner cents write removed (api Postgres is single source)
          // Log transaction in ad_transactions for unified ledger
          rawDb.prepare(`INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note)
                         VALUES ('topup', ?, 'gift', ?, ?)`)
            .run(inv.user_id, inv.amount_cents, 'cryptomus ' + orderId);
        });
        txn();
        console.log('[cryptomus webhook] credited', inv.amount_cents, 'cents to user', inv.user_id);
      } else if (['cancel', 'fail', 'system_fail', 'wrong_amount'].includes(status)) {
        rawDb.prepare("UPDATE cryptomus_invoices SET status = ?, raw_response = ? WHERE id = ?")
          .run(status, JSON.stringify(body).slice(0, 4000), inv.id);
      }
      res.json({ ok: true });
    } catch (e) {
      console.error('[cryptomus webhook] error', e.message);
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/invoices', requireAuth, (req, res) => {
    try {
      const u = plannerUserFor(rawDb, req.webUser);
      const items = rawDb.prepare('SELECT id, order_id, amount_cents, status, url, created_at, paid_at FROM cryptomus_invoices WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(u.id);
      res.json({ ok: true, items });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  return router;
}

module.exports = { createCryptomusRouter };
