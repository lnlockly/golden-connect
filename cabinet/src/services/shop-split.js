// Marketplace split engine: 70 seller / 10 project / 15 multilevel buyer upline / 5 pool.
// All splits logged to product_purchase_splits ledger; recipient_user_id NULL
// means project/pool absorbs that share.
const dbModule = require('../planner/db/database');

// Multilevel distribution as fractions of total UPLINE share (15% by default).
// Sums to 1.0 — actual amounts get scaled by uplineFracOfTotal.
const UPLINE_FRAC = [
  { level: 1, frac: 7.0 / 15.0 },
  { level: 2, frac: 2.0 / 15.0 },
  { level: 3, frac: 1.5 / 15.0 },
  { level: 4, frac: 1.0 / 15.0 },
  { level: 5, frac: 1.0 / 15.0 },
  { level: 6, frac: 0.5 / 15.0 },
  { level: 7, frac: 0.5 / 15.0 },
  { level: 8, frac: 0.5 / 15.0 },
  { level: 9, frac: 0.5 / 15.0 },
  { level: 10, frac: 0.5 / 15.0 },
];

// Default split ratios within the non-seller portion.
// project=10/30, linear=7.5/30, matrix=7.5/30 (PENDING), pool=5/30 — apply to (1 - seller_pct).
const PROJECT_FRAC = 10.0 / 30.0;       // 1/3
const LINEAR_FRAC = 7.5 / 30.0;         // 1/4 — buyer's 10-level upline (immediate)
const MATRIX_FRAC = 7.5 / 30.0;         // 1/4 — matrix structure (deferred until admin runs marketing)
const POOL_FRAC = 5.0 / 30.0;           // 1/6
// Backward-compat (kept so any external readers don't crash):
const UPLINE_FRAC_TOTAL = LINEAR_FRAC;

function uplineFor(db, userId, maxDepth) {
  const out = [];
  if (!userId) return out;
  let cur = userId;
  for (let i = 0; i < maxDepth; i += 1) {
    const u = db.prepare('SELECT id, referred_by FROM users WHERE id = ?').get(cur);
    if (!u) break;
    if (!u.referred_by) break;
    out.push(u.referred_by);
    cur = u.referred_by;
  }
  return out;
}

function splitPurchase(purchaseId) {
  const db = dbModule.getDb();
  const purchase = db.prepare('SELECT * FROM product_purchases WHERE id = ?').get(purchaseId);
  if (!purchase) return { ok: false, reason: 'no_purchase' };
  if (purchase.payment_status !== 'paid') return { ok: false, reason: 'not_paid' };
  if (purchase.split_done) return { ok: true, reason: 'already_done' };

  const amount = Number(purchase.amount_usd) || 0;
  if (amount <= 0) {
    // Free product — just mark done, log a 'free' entry for audit
    db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, amount_usd) VALUES (?, 'free', 0)").run(purchaseId);
    db.prepare("UPDATE product_purchases SET split_done = 1 WHERE id = ?").run(purchaseId);
    return { ok: true, free: true };
  }

  const sellerId = purchase.seller_user_id || null;
  const buyerId = purchase.buyer_user_id || null;
  // Read configurable seller_pct from the product (clamped 0.01..0.70)
  let sellerPct = 0.70;
  try {
    const prod = db.prepare('SELECT seller_pct FROM user_products WHERE id = ?').get(purchase.product_id);
    if (prod && prod.seller_pct !== null && prod.seller_pct !== undefined) {
      sellerPct = Math.max(0.01, Math.min(0.70, Number(prod.seller_pct)));
    }
  } catch (_) {}
  const nonSeller = 1 - sellerPct;

  const sellerShare = +(amount * sellerPct).toFixed(4);
  const projectShare = +(amount * nonSeller * PROJECT_FRAC).toFixed(4);
  const poolShare = +(amount * nonSeller * POOL_FRAC).toFixed(4);
  const linearTotal = amount * nonSeller * LINEAR_FRAC;
  const matrixTotal = +(amount * nonSeller * MATRIX_FRAC).toFixed(4);

  const tx = db.transaction(() => {
    // Seller share (configurable, default 70%)
    db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, recipient_user_id, amount_usd) VALUES (?, 'seller', ?, ?)")
      .run(purchaseId, sellerId, sellerShare);

    db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, amount_usd) VALUES (?, 'project', ?)")
      .run(purchaseId, projectShare);

    db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, amount_usd) VALUES (?, 'pool', ?)")
      .run(purchaseId, poolShare);

    // 7.5%: linear 10-level upline of buyer (immediate)
    const upline = uplineFor(db, buyerId, UPLINE_FRAC.length);
    let unfilled = 0;
    for (const cfg of UPLINE_FRAC) {
      const recip = upline[cfg.level - 1] || null;
      const share = +(linearTotal * cfg.frac).toFixed(4);
      if (recip) {
        db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, recipient_user_id, upline_level, amount_usd) VALUES (?, 'linear', ?, ?, ?)")
          .run(purchaseId, recip, cfg.level, share);
      } else {
        unfilled += share;
      }
    }
    if (unfilled > 0) {
      db.prepare("INSERT INTO product_purchase_splits (purchase_id, split_type, amount_usd) VALUES (?, 'project_unfilled_linear', ?)")
        .run(purchaseId, +unfilled.toFixed(4));
    }

    db.prepare("UPDATE product_purchases SET split_done = 1 WHERE id = ?").run(purchaseId);
    if (sellerId) {
      db.prepare("UPDATE user_shops SET total_sales = total_sales + 1 WHERE user_id = ?").run(sellerId);
    }
  });

  try { tx(); }
  catch (e) { return { ok: false, reason: e.message }; }

  // Dispatch real money distribution to api (Postgres). Local product_purchase_splits
  // is kept as audit; api credits cash_ledger working balance + 80/20 subscription split.
  try {
    const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://golden-connect-api:4001';
    const apiSecret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
    if (apiSecret && sellerId) {
      const priceMicro = String(BigInt(Math.round(amount * 1_000_000)));
      const payload = JSON.stringify({
        sale_id: purchaseId,
        seller_user_id: sellerId,
        price_micro: priceMicro,
        seller_pct: sellerPct,
      });
      const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
      const url = new URL(apiBase + '/internal/marketplace/distribute-sale');
      const req = httpMod.request({
        method: 'POST', hostname: url.hostname,
        port: url.port || (apiBase.startsWith('https') ? 443 : 80),
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-golden-connect-secret': apiSecret,
        },
        timeout: 15000,
      }, (res) => {
        let buf = '';
        res.on('data', (c) => buf += c);
        res.on('end', () => {
          if (res.statusCode >= 400) {
            console.warn('[shop-split] api distribute failed', res.statusCode, buf.slice(0, 200));
          } else {
            console.log('[shop-split] api distribute ok purchase', purchaseId);
          }
        });
      });
      req.on('error', (e) => console.warn('[shop-split] api dispatch err', e.message));
      req.on('timeout', () => req.destroy());
      req.write(payload);
      req.end();
    }
  } catch (e) {
    console.warn('[shop-split] api dispatch wrapper err', e && e.message);
  }

  // Fire notifications (fire-and-forget)
  try {
    const notify = require('./notify');
    const product = db.prepare('SELECT id, title FROM user_products WHERE id=?').get(purchase.product_id);
    let sellerInfo = null;
    if (sellerId) {
      const ru = db.prepare('SELECT id, tg_id, tg_username, first_name FROM users WHERE id=?').get(sellerId);
      if (ru) sellerInfo = { id: ru.id, displayName: ru.first_name, telegramUserId: ru.tg_id, email: null };
    }
    notify.onMarketplaceSale(purchase, product || { id: purchase.product_id, title: '?' }, sellerInfo, null);
  } catch (e) { console.warn('[notify-sale]', e.message); }
  return { ok: true, amount, sellerShare, projectShare, poolShare };
}

function getEarnings(userId) {
  const db = dbModule.getDb();
  // Total earnings by split_type
  const byType = db.prepare(
    "SELECT split_type, SUM(amount_usd) AS total, COUNT(*) AS n FROM product_purchase_splits WHERE recipient_user_id = ? GROUP BY split_type"
  ).all(userId);
  const out = { seller: 0, upline: 0, total: 0, byLevel: {}, byType: byType };
  byType.forEach(function (r) {
    out[r.split_type] = (out[r.split_type] || 0) + (Number(r.total) || 0);
    out.total += Number(r.total) || 0;
  });
  // Upline earnings by level
  const byLvl = db.prepare(
    "SELECT upline_level, SUM(amount_usd) AS total, COUNT(*) AS n FROM product_purchase_splits WHERE recipient_user_id = ? AND split_type = 'upline' GROUP BY upline_level ORDER BY upline_level"
  ).all(userId);
  byLvl.forEach(function (r) { out.byLevel[r.upline_level] = { total: Number(r.total), n: r.n }; });
  return out;
}

module.exports = { splitPurchase, getEarnings, UPLINE_FRAC, PROJECT_FRAC, POOL_FRAC, UPLINE_FRAC_TOTAL };
