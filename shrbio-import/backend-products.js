'use strict';
const express = require('express');
const router = express.Router();
const https = require('https');
const crypto = require('crypto');
const { getDb } = require('../database');
const { authRequired } = require('../middleware/auth');

const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN || '';
const CRYPTOBOT_API = 'pay.crypt.bot';
const BASE_URL = process.env.BASE_URL || 'https://app.arsenalprofi.com';

const CATEGORIES = ['course', 'ebook', 'template', 'music', 'software', 'preset', 'other'];

function cryptobotRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(params);
    const opts = {
      hostname: CRYPTOBOT_API, path: '/api/' + method, method: 'POST',
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ ok: false, error: 'parse_error' }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── My Products CRUD ──

// GET /api/products — list my products
router.get('/', authRequired, (req, res) => {
  try {
    const db = getDb();
    const products = db.prepare('SELECT * FROM user_products WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
    res.json({ success: true, products });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/products — create product
router.post('/', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { title, description, price_usd, download_url, preview_image, category } = req.body;
    if (!title || title.trim().length < 2) return res.status(400).json({ error: 'Title required (min 2 chars)' });
    if (price_usd !== undefined && (isNaN(price_usd) || price_usd < 0)) return res.status(400).json({ error: 'Invalid price' });

    const result = db.prepare(
      "INSERT INTO user_products (user_id, title, description, price_usd, download_url, preview_image, category) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(
      req.user.id,
      title.trim().substring(0, 200),
      (description || '').substring(0, 2000),
      Math.max(0, parseFloat(price_usd) || 0),
      (download_url || '').substring(0, 1000),
      (preview_image || '').substring(0, 1000),
      CATEGORIES.includes(category) ? category : 'other'
    );

    const product = db.prepare('SELECT * FROM user_products WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, product });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/products/:id — update product
router.put('/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM user_products WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { title, description, price_usd, download_url, preview_image, category, is_active } = req.body;
    db.prepare(`UPDATE user_products SET
      title = ?, description = ?, price_usd = ?, download_url = ?,
      preview_image = ?, category = ?, is_active = ?
      WHERE id = ? AND user_id = ?`).run(
      (title || product.title).substring(0, 200),
      (description !== undefined ? description : product.description || '').substring(0, 2000),
      Math.max(0, parseFloat(price_usd !== undefined ? price_usd : product.price_usd) || 0),
      (download_url !== undefined ? download_url : product.download_url || '').substring(0, 1000),
      (preview_image !== undefined ? preview_image : product.preview_image || '').substring(0, 1000),
      CATEGORIES.includes(category) ? category : product.category,
      is_active !== undefined ? (is_active ? 1 : 0) : product.is_active,
      product.id, req.user.id
    );

    const updated = db.prepare('SELECT * FROM user_products WHERE id = ?').get(product.id);
    res.json({ success: true, product: updated });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/products/:id
router.delete('/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM user_product_listings WHERE product_id = ? AND user_id = ?').run(req.params.id, req.user.id);
    db.prepare('DELETE FROM user_products WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Marketplace (public) ──

// GET /api/marketplace — browse products
router.get('/marketplace', (req, res) => {
  try {
    const db = getDb();
    const category = req.query.category;
    const search = req.query.search;
    const sort = req.query.sort || 'newest';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = 'p.is_active = 1';
    const params = [];
    if (category && CATEGORIES.includes(category)) { where += ' AND p.category = ?'; params.push(category); }
    if (search) { where += ' AND (p.title LIKE ? OR p.description LIKE ?)'; params.push('%' + search + '%', '%' + search + '%'); }

    let orderBy = 'p.id DESC';
    if (sort === 'popular') orderBy = 'p.total_sales DESC';
    else if (sort === 'price_low') orderBy = 'p.price_usd ASC';
    else if (sort === 'price_high') orderBy = 'p.price_usd DESC';

    const total = db.prepare('SELECT COUNT(*) as c FROM user_products p WHERE ' + where).get(...params)?.c || 0;
    const products = db.prepare(
      'SELECT p.*, u.username as seller_name FROM user_products p LEFT JOIN users u ON u.id = p.user_id WHERE ' + where + ' ORDER BY ' + orderBy + ' LIMIT ? OFFSET ?'
    ).all(...params, limit, offset);

    res.json({ success: true, products, total, page, pages: Math.ceil(total / limit) });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/marketplace/:id — single product
router.get('/marketplace/:id', (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare(
      'SELECT p.*, u.username as seller_name FROM user_products p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.is_active = 1'
    ).get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bio product listings ──

// POST /api/products/bio/:bioId/add — add product to bio
router.post('/bio/:bioId/add', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { product_id, is_featured } = req.body;
    const bio = db.prepare('SELECT id FROM user_bio_profiles WHERE id = ? AND user_id = ?').get(req.params.bioId, req.user.id);
    if (!bio) return res.status(404).json({ error: 'Bio page not found' });
    const product = db.prepare('SELECT id FROM user_products WHERE id = ? AND user_id = ?').get(product_id, req.user.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const maxPos = db.prepare('SELECT MAX(position) as m FROM user_product_listings WHERE bio_id = ?').get(bio.id)?.m || 0;
    db.prepare('INSERT OR IGNORE INTO user_product_listings (user_id, bio_id, product_id, is_featured, position) VALUES (?, ?, ?, ?, ?)')
      .run(req.user.id, bio.id, product_id, is_featured ? 1 : 0, maxPos + 1);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/products/bio/:bioId/remove — remove product from bio
router.delete('/bio/:bioId/remove', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { product_id } = req.body;
    db.prepare('DELETE FROM user_product_listings WHERE bio_id = ? AND product_id = ? AND user_id = ?')
      .run(req.params.bioId, product_id, req.user.id);
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/products/bio/:bioId — products listed on a bio
router.get('/bio/:bioId', (req, res) => {
  try {
    const db = getDb();
    const products = db.prepare(`
      SELECT p.*, pl.is_featured, pl.position
      FROM user_product_listings pl
      JOIN user_products p ON p.id = pl.product_id
      WHERE pl.bio_id = ? AND p.is_active = 1
      ORDER BY pl.is_featured DESC, pl.position ASC
    `).all(req.params.bioId);
    res.json({ success: true, products });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Purchase flow ──

// POST /api/products/:id/purchase — initiate purchase
router.post('/:id/purchase', async (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM user_products WHERE id = ? AND is_active = 1').get(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { buyer_email } = req.body;
    if (!buyer_email || !/^[^@]+@[^@]+\.[^@]+$/.test(buyer_email)) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    if (product.price_usd <= 0) {
      // Free product — generate download token immediately
      const token = crypto.randomBytes(32).toString('hex');
      db.prepare("INSERT INTO product_purchases (buyer_email, product_id, seller_user_id, amount_usd, payment_status, download_token) VALUES (?, ?, ?, 0, 'paid', ?)")
        .run(buyer_email, product.id, product.user_id, token);
      db.prepare('UPDATE user_products SET total_sales = total_sales + 1 WHERE id = ?').run(product.id);
      return res.json({ success: true, free: true, download_url: BASE_URL + '/api/products/download/' + token });
    }

    // Paid product — create CryptoBot invoice
    const downloadToken = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO product_purchases (buyer_email, product_id, seller_user_id, amount_usd, payment_status, download_token) VALUES (?, ?, ?, ?, 'pending', ?)")
      .run(buyer_email, product.id, product.user_id, product.price_usd, downloadToken);
    const purchaseId = db.prepare('SELECT last_insert_rowid() as id').get().id;

    if (!CRYPTOBOT_TOKEN) {
      // Dev mode
      db.prepare("UPDATE product_purchases SET payment_status = 'paid', invoice_id = 'dev_' || ? WHERE id = ?").run(Date.now().toString(), purchaseId);
      db.prepare('UPDATE user_products SET total_sales = total_sales + 1, total_revenue = total_revenue + ? WHERE id = ?').run(product.price_usd, product.id);
      return res.json({ success: true, free: false, dev_mode: true, download_url: BASE_URL + '/api/products/download/' + downloadToken });
    }

    const result = await cryptobotRequest('createInvoice', {
      currency_type: 'fiat', fiat: 'USD',
      amount: String(product.price_usd),
      description: 'Purchase: ' + product.title.substring(0, 100),
      payload: JSON.stringify({ type: 'product_purchase', purchase_id: purchaseId, product_id: product.id }),
      paid_btn_name: 'openBot',
      paid_btn_url: BASE_URL + '/api/products/download/' + downloadToken,
      allow_comments: false, allow_anonymous: true,
    });

    if (!result.ok) return res.status(502).json({ error: 'Payment error' });

    db.prepare('UPDATE product_purchases SET invoice_id = ? WHERE id = ?').run(String(result.result.invoice_id), purchaseId);
    res.json({ success: true, payment_url: result.result.pay_url, invoice_id: result.result.invoice_id });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/products/webhook/cryptobot — payment webhook
router.post('/webhook/cryptobot', (req, res) => {
  try {
    const db = getDb();
    const update = req.body;
    if (!update || update.update_type !== 'invoice_paid') return res.json({ ok: true });

    const invoice = update.payload ? JSON.parse(update.payload) : {};
    if (invoice.type !== 'product_purchase') return res.json({ ok: true });

    const purchase = db.prepare('SELECT * FROM product_purchases WHERE id = ?').get(invoice.purchase_id);
    if (!purchase || purchase.payment_status === 'paid') return res.json({ ok: true });

    db.prepare("UPDATE product_purchases SET payment_status = 'paid' WHERE id = ?").run(purchase.id);
    db.prepare('UPDATE user_products SET total_sales = total_sales + 1, total_revenue = total_revenue + ? WHERE id = ?')
      .run(purchase.amount_usd, purchase.product_id);

    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: true });
  }
});

// GET /api/products/download/:token — download product
router.get('/download/:token', (req, res) => {
  try {
    const db = getDb();
    const purchase = db.prepare("SELECT pp.*, p.download_url, p.title FROM product_purchases pp JOIN user_products p ON p.id = pp.product_id WHERE pp.download_token = ? AND pp.payment_status = 'paid'")
      .get(req.params.token);
    if (!purchase) return res.status(404).send('<html><body style="background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div><h1>Not found</h1><p>Invalid or expired download link.</p></div></body></html>');

    db.prepare('UPDATE product_purchases SET download_count = download_count + 1 WHERE id = ?').run(purchase.id);

    if (purchase.download_url) {
      return res.redirect(purchase.download_url);
    }
    res.send('<html><body style="background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><div><h1>Thank you!</h1><p>Your purchase of "' + purchase.title + '" is confirmed. The seller will contact you.</p></div></body></html>');
  } catch(e) {
    res.status(500).send('Error');
  }
});

// GET /api/products/my/stats — seller dashboard stats
router.get('/my/stats', authRequired, (req, res) => {
  try {
    const db = getDb();
    const totalProducts = db.prepare('SELECT COUNT(*) as c FROM user_products WHERE user_id = ?').get(req.user.id)?.c || 0;
    const totalSales = db.prepare('SELECT SUM(total_sales) as s FROM user_products WHERE user_id = ?').get(req.user.id)?.s || 0;
    const totalRevenue = db.prepare('SELECT SUM(total_revenue) as r FROM user_products WHERE user_id = ?').get(req.user.id)?.r || 0;
    const recentPurchases = db.prepare("SELECT pp.*, p.title FROM product_purchases pp JOIN user_products p ON p.id = pp.product_id WHERE pp.seller_user_id = ? AND pp.payment_status = 'paid' ORDER BY pp.id DESC LIMIT 10")
      .all(req.user.id);
    res.json({ success: true, stats: { totalProducts, totalSales, totalRevenue: totalRevenue.toFixed(2), recentPurchases } });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
