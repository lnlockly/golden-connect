// Shop / product visit tracker. INSERT OR IGNORE on (entity, ip-hash, hour).
const crypto = require('crypto');
const dbModule = require('../planner/db/database');

function _ipHash(req) {
  const ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim() || '0.0.0.0';
  return crypto.createHash('sha256').update(ip + '|' + (req.headers['user-agent'] || '')).digest('hex').slice(0, 24);
}

function _hourKey() {
  const d = new Date();
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + '-' + String(d.getUTCHours()).padStart(2, '0');
}

function trackShopVisit(req, shopId, refUserId) {
  try {
    const db = dbModule.getDb();
    const refSource = (req.headers.referer || '').slice(0, 200);
    db.prepare(
      "INSERT OR IGNORE INTO shop_visits (shop_id, ip_hash, hour_key, ref_source, ref_user_id) VALUES (?, ?, ?, ?, ?)"
    ).run(shopId, _ipHash(req), _hourKey(), refSource || null, refUserId || null);
  } catch (e) { /* ignore */ }
}

function trackProductView(req, productId, refUserId) {
  try {
    const db = dbModule.getDb();
    const refSource = (req.headers.referer || '').slice(0, 200);
    db.prepare(
      "INSERT OR IGNORE INTO product_views (product_id, ip_hash, hour_key, ref_source, ref_user_id) VALUES (?, ?, ?, ?, ?)"
    ).run(productId, _ipHash(req), _hourKey(), refSource || null, refUserId || null);
  } catch (e) { /* ignore */ }
}

module.exports = { trackShopVisit, trackProductView };
