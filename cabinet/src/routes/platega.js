const { creditApi } = require('../services/balance-bridge');
// Platega router for cabinet: top-up, webhook, product purchase support.
const express = require('express');
const platega = require('../services/platega');
const dbModule = require('../planner/db/database');
const https = require('https');
const { invalidatePlan: _invPlan } = require('../helpers/usage-limits');

const PUBLIC_BASE = (process.env.PUBLIC_BASE || 'https://trendex.biz').replace(/\/$/, '');

function _bridgePlannerUser(rawDb, wu) {
  if (!wu) return null;
  let pu = null;
  if (wu.telegramUserId) pu = rawDb.prepare('SELECT id, gift_balance_cents FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
  if (!pu) pu = rawDb.prepare('SELECT id, gift_balance_cents FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
  return pu;
}

function createPlategaRouter(_config, _storage, requireAuth) {
  const router = express.Router();
  router.use(express.json({ limit: '256kb' }));

  router.get('/status', (req, res) => res.json({ ok: true, configured: platega.plategaConfigured() }));

  router.post('/topup', requireAuth, async (req, res) => {
    try {
      if (!platega.plategaConfigured()) return res.status(503).json({ ok: false, reason: 'platega_not_configured' });
      const amountUsd = Math.max(5, Math.min(5000, Number((req.body && req.body.amount_usd) || 0)));
      const method = Number((req.body && req.body.payment_method) || platega.PAYMENT_METHODS.SBP);
      if (!amountUsd) return res.status(400).json({ ok: false, reason: 'amount_invalid_min_5_max_5000' });
      const rawDb = dbModule.getDb();
      const pu = _bridgePlannerUser(rawDb, req.webUser);
      if (!pu) return res.status(403).json({ ok: false, reason: 'no_planner_user' });

      const orderId = platega.makeOrderId('cabtopup', String(pu.id));
      const ins = rawDb.prepare(
        "INSERT INTO platega_invoices (order_id, user_id, purpose, amount_usd, amount_rub, status) VALUES (?, ?, 'topup', ?, ?, 'pending')"
      ).run(orderId, pu.id, amountUsd, platega.usdToRubInt(amountUsd));

      let inv;
      try {
        inv = await platega.createInvoice({
          amountUsd, orderId,
          paymentMethod: method,
          description: 'Trendex top-up $' + amountUsd.toFixed(2),
          returnUrl: PUBLIC_BASE + '/cabinet#/pay?platega=ok',
          failedUrl: PUBLIC_BASE + '/cabinet#/pay?platega=fail',
          payload: orderId,
        });
      } catch (e) {
        rawDb.prepare("UPDATE platega_invoices SET status='failed', raw_create=? WHERE id=?").run(JSON.stringify({ error: e.message }), ins.lastInsertRowid);
        return res.status(502).json({ ok: false, reason: 'platega_create_failed', detail: e.message });
      }
      rawDb.prepare("UPDATE platega_invoices SET invoice_id=?, pay_url=?, raw_create=? WHERE id=?")
        .run(String(inv.invoice_id), inv.pay_url, JSON.stringify(inv.raw || {}), ins.lastInsertRowid);
      return res.json({ ok: true, pay_url: inv.pay_url, invoice_id: inv.invoice_id, amount_rub: inv.amount_rub, order_id: orderId });
    } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/product-purchase', async (req, res) => {
    try {
      if (!platega.plategaConfigured()) return res.status(503).json({ ok: false, reason: 'platega_not_configured' });
      const productId = Number((req.body && req.body.product_id) || 0);
      const buyerEmail = String((req.body && req.body.buyer_email) || '').trim().toLowerCase();
      const method = Number((req.body && req.body.payment_method) || platega.PAYMENT_METHODS.SBP);
      if (!productId) return res.status(400).json({ ok: false, reason: 'product_id_required' });
      if (!buyerEmail || !/^[^@]+@[^@]+\.[^@]+$/.test(buyerEmail)) return res.status(400).json({ ok: false, reason: 'valid_email_required' });
      const rawDb = dbModule.getDb();
      const product = rawDb.prepare("SELECT * FROM user_products WHERE id = ? AND is_active = 1").get(productId);
      if (!product) return res.status(404).json({ ok: false, reason: 'product_not_found' });
      const amountUsd = Number(product.price_usd || 0);
      if (amountUsd <= 0) return res.status(400).json({ ok: false, reason: 'product_is_free' });

      const crypto = require('crypto');
      const downloadToken = crypto.randomBytes(32).toString('hex');
      const shopOwnerId = Number((req.body && req.body.shop_owner_user_id) || 0) || null;
      const buyerUserId = Number((req.body && req.body.buyer_user_id) || 0) || null;

      const purchaseIns = rawDb.prepare(
        "INSERT INTO product_purchases (buyer_email, product_id, seller_user_id, amount_usd, payment_status, download_token, shop_owner_user_id, buyer_user_id) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)"
      ).run(buyerEmail, product.id, product.user_id, amountUsd, downloadToken, shopOwnerId, buyerUserId);
      const purchaseId = purchaseIns.lastInsertRowid;

      const orderId = platega.makeOrderId('cabprod', String(purchaseId));
      const ins = rawDb.prepare(
        "INSERT INTO platega_invoices (order_id, user_id, purpose, target_id, amount_usd, amount_rub, status) VALUES (?, ?, 'product', ?, ?, ?, 'pending')"
      ).run(orderId, product.user_id, purchaseId, amountUsd, platega.usdToRubInt(amountUsd));

      let inv;
      try {
        inv = await platega.createInvoice({
          amountUsd, orderId, paymentMethod: method,
          description: 'Purchase: ' + (product.title || '').slice(0, 80),
          returnUrl: PUBLIC_BASE + '/cabinet/api/products/download/' + downloadToken,
          failedUrl: PUBLIC_BASE + '/cabinet/p/' + (product.slug || 'p') + '-' + product.id,
          payload: orderId,
        });
      } catch (e) {
        rawDb.prepare("UPDATE platega_invoices SET status='failed', raw_create=? WHERE id=?").run(JSON.stringify({ error: e.message }), ins.lastInsertRowid);
        rawDb.prepare("UPDATE product_purchases SET payment_status='failed' WHERE id=?").run(purchaseId);
        return res.status(502).json({ ok: false, reason: 'platega_create_failed', detail: e.message });
      }
      rawDb.prepare("UPDATE platega_invoices SET invoice_id=?, pay_url=?, raw_create=? WHERE id=?")
        .run(String(inv.invoice_id), inv.pay_url, JSON.stringify(inv.raw || {}), ins.lastInsertRowid);
      rawDb.prepare("UPDATE product_purchases SET invoice_id=? WHERE id=?").run(String(inv.invoice_id), purchaseId);
      return res.json({ ok: true, pay_url: inv.pay_url, invoice_id: inv.invoice_id, amount_rub: inv.amount_rub, download_token: downloadToken });
    } catch (e) { return res.status(500).json({ ok: false, reason: e.message }); }
  });

  return router;
}

// Webhook: verify X-MerchantId+X-Secret headers, dispatch by Payload prefix.
// If invoice not found locally and starts with "entry:" or anything non-cabinet,
// forward the body+headers to https://api.trendex.biz/webhooks/platega.
function _forwardToApi(body, headers) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      method: 'POST', hostname: 'api.trendex.biz', path: '/webhooks/platega', port: 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-MerchantId': headers['x-merchantid'] || headers['X-MerchantId'] || '',
        'X-Secret': headers['x-secret'] || headers['X-Secret'] || '',
      },
      timeout: 8000,
    }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c); res.on('end', () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on('error', () => resolve({ status: 0, body: 'forward_error' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'forward_timeout' }); });
    req.write(data); req.end();
  });
}

function createWebhookRouter() {
  const router = express.Router();
  router.use(express.json({ limit: '64kb' }));
  router.post('/', async (req, res) => {
    try {
      const body = req.body || {};
      const headers = req.headers || {};
      // Always verify the X-MerchantId+X-Secret pair before doing ANYTHING
      if (!platega.verifyWebhookHeaders(headers)) {
        console.warn('[platega-webhook] bad headers; gotMerchant=', headers['x-merchantid'], ' gotSecret-len=', (headers['x-secret'] || '').length);
        return res.json({ ok: true });
      }
      // Platega webhook fields (capitalized): Id, Status, Amount, Payload
      const txId = body.Id || body.id || body.transactionId;
      const status = String(body.Status || body.status || '').toLowerCase();
      const payload = body.Payload || body.payload || '';
      const amountRub = Number(body.Amount || body.amount || 0);
      const orderId = String(payload || '').trim();

      const rawDb = dbModule.getDb();
      let inv = null;
      if (orderId) inv = rawDb.prepare('SELECT * FROM platega_invoices WHERE order_id = ?').get(orderId);
      if (!inv && txId) inv = rawDb.prepare('SELECT * FROM platega_invoices WHERE invoice_id = ?').get(String(txId));

      if (!inv) {
        // Not ours → forward to trendex-api
        const fwd = await _forwardToApi(body, headers);
        console.log('[platega-webhook] forwarded to api:', fwd.status);
        return res.json({ ok: true });
      }

      rawDb.prepare("UPDATE platega_invoices SET raw_webhook=? WHERE id=?").run(JSON.stringify(body), inv.id);
      if (inv.status === 'paid') return res.json({ ok: true });

      if (status === 'confirmed' || status === 'paid' || status === 'success') {
        rawDb.prepare("UPDATE platega_invoices SET status='paid', paid_at=datetime('now') WHERE id=?").run(inv.id);
        if (inv.purpose === 'topup' && inv.user_id) {
          const cents = Math.round(Number(inv.amount_usd) * 100);
          (async () => { try { const invRow = rawDb.prepare("SELECT tg_id FROM users WHERE id = ?").get(inv.user_id); if (invRow && invRow.tg_id) await creditApi({ tgId: invRow.tg_id, wallet: 'gift', cents, kind: 'topup_platega', memo: 'platega inviter bonus' }); } catch (e) { console.warn('[platega] api credit failed:', e && e.message); } })();
          /* Phase G: planner cents write removed — api Postgres is single source (dual-write above) */
          try {
            const _notify = require('../services/notify');
            const ru = rawDb.prepare("SELECT id, tg_id, tg_username, first_name FROM users WHERE id=?").get(inv.user_id);
            if (ru) _notify.onTopupPaid({ id: ru.id, displayName: ru.first_name, telegramUserId: ru.tg_id, email: null }, inv.amount_usd, 'Platega');
          } catch (e) { console.warn('[notify-topup]', e.message); }
          console.log('[platega-webhook] topup credited:', inv.amount_usd, 'USD to user', inv.user_id);
        } else if (inv.purpose === 'product' && inv.target_id) {
          rawDb.prepare("UPDATE product_purchases SET payment_status='paid' WHERE id=?").run(inv.target_id);
          const purchase = rawDb.prepare("SELECT * FROM product_purchases WHERE id=?").get(inv.target_id);
          if (purchase) {
            rawDb.prepare("UPDATE user_products SET total_sales = total_sales + 1, total_revenue = total_revenue + ? WHERE id = ?").run(purchase.amount_usd, purchase.product_id);
            try { require('../services/shop-split').splitPurchase(purchase.id); console.log('[platega-webhook] split done:', purchase.id); }
            catch (e) { console.error('[platega-webhook] split failed:', e.message); }
          }
        }
      } else if (status === 'canceled' || status === 'cancelled' || status === 'failed' || status === 'expired') {
        rawDb.prepare("UPDATE platega_invoices SET status=? WHERE id=?").run(status, inv.id);
      }
      return res.json({ ok: true });
    } catch (e) { console.error('[platega-webhook] error:', e.message); return res.json({ ok: true }); }
  });
  return router;
}

module.exports = { createPlategaRouter, createWebhookRouter };
