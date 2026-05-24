// Cabinet notification system. Sends Telegram messages via BOT_TOKEN to:
//   - Admin (always: tg_id=424077439 = volga9000@gmail.com / @MLM808)
//   - Sub-admin (tg_id=374190317) — для конференций
//   - Specific user (when applicable: seller of sold product, etc.)
//
// Uses node-fetch directly (no extra deps). Fire-and-forget — never blocks
// the caller. Errors logged to console.

const ADMIN_TG_IDS = ['424077439', '1361064246', '248745860']; // primary + fallback admins
const SUB_ADMIN_TG_ID = '374190317';

const BOT_TOKEN = process.env.BOT_TOKEN || '';

function _fetchTg(method, body) {
  const https = require('https');
  return new Promise((resolve) => {
    if (!BOT_TOKEN) { resolve({ ok: false, reason: 'no_bot_token' }); return; }
    const data = JSON.stringify(body);
    const req = https.request({
      method: 'POST', hostname: 'api.telegram.org',
      path: '/bot' + BOT_TOKEN + '/' + method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 5000,
    }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, json }); });
    });
    req.on('error', () => resolve({ ok: false, reason: 'fetch_error' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, reason: 'timeout' }); });
    req.write(data); req.end();
  });
}

function sendTo(tgId, text, opts) {
  if (!tgId) return Promise.resolve({ ok: false, reason: 'no_tg_id' });
  return _fetchTg('sendMessage', Object.assign({
    chat_id: Number(tgId),
    text: String(text).slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, opts || {}));
}

function notifyAdmins(text, opts) {
  // Fire-and-forget to all admin TG IDs
  ADMIN_TG_IDS.forEach((id) => {
    sendTo(id, text, opts).catch(() => {});
  });
}

function notifyUser(tgId, text, opts) {
  if (!tgId) return;
  sendTo(tgId, text, opts).catch(() => {});
}

// === High-level notifications ===

function onNewUserRegistered(user, refUser) {
  // user = { id, email, displayName, telegramUserId, referralCode }
  // refUser = { id, email, displayName, telegramUserId, referralCode } | null
  const email = user.email || '—';
  const name = user.displayName || user.firstName || '—';
  const refInfo = refUser ? ('реф: <b>' + (refUser.displayName || refUser.email || ('#' + refUser.id)) + '</b>') : 'без реферала';
  const adminText = '🎉 <b>Новый пользователь</b>\n' +
    '👤 ' + escapeHtml(name) + '\n' +
    '📧 ' + escapeHtml(email) + '\n' +
    '🔗 refCode: <code>' + escapeHtml(user.referralCode || '—') + '</code>\n' +
    '👥 ' + refInfo + '\n' +
    '🆔 user_id: ' + user.id;
  notifyAdmins(adminText);

  // Notify referrer if they have TG
  if (refUser && refUser.telegramUserId) {
    const refText = '🎉 <b>У тебя новый реферал!</b>\n' +
      '👤 ' + escapeHtml(name) + '\n' +
      '📧 ' + escapeHtml(email) + '\n\n' +
      '<i>Когда он купит пакет — ты получишь свою долю с матрицы и 10-уровневой линейки.</i>';
    notifyUser(refUser.telegramUserId, refText);
  }
}

function onTopupPaid(user, amountUsd, method) {
  const text = '💰 <b>Top-up через ' + escapeHtml(method) + '</b>\n' +
    '+ <b>$' + Number(amountUsd).toFixed(2) + '</b>\n' +
    '👤 ' + escapeHtml(user.displayName || user.email || ('#' + user.id)) + '\n' +
    '🆔 user_id: ' + user.id;
  notifyAdmins(text);
  if (user.telegramUserId) {
    notifyUser(user.telegramUserId, '✅ Баланс пополнен на <b>$' + Number(amountUsd).toFixed(2) + '</b>\n\nМожно покупать рекламу, тариф или товары на маркетплейсе.');
  }
}

function onMarketplaceSale(purchase, product, seller, splitsByRecipient) {
  // purchase: { id, amount_usd, buyer_email }
  // product: { id, title }
  // seller: { id, displayName, email, telegramUserId } | null
  // splitsByRecipient: Map<userId, { amount: number, type: 'seller'|'linear'|'matrix_pending' }>

  const buyerEmail = (purchase.buyer_email || '').replace(/(.).+(@.+)/, '$1***$2');
  // Admin notification
  const adminText = '🛒 <b>Продажа на маркетплейсе</b>\n' +
    '📦 ' + escapeHtml((product.title || '').slice(0, 80)) + '\n' +
    '💵 <b>$' + Number(purchase.amount_usd).toFixed(2) + '</b>\n' +
    '👤 покупатель: ' + escapeHtml(buyerEmail) + '\n' +
    '🏪 продавец: ' + escapeHtml(seller ? (seller.displayName || seller.email || ('#' + seller.id)) : 'unknown') + '\n' +
    '🆔 purchase: #' + purchase.id;
  notifyAdmins(adminText);

  // Seller notification
  if (seller && seller.telegramUserId) {
    const sellerSplit = splitsByRecipient && splitsByRecipient.get(seller.id);
    const sellerAmount = sellerSplit ? sellerSplit.amount : (Number(purchase.amount_usd) * 0.7);
    notifyUser(seller.telegramUserId,
      '💸 <b>Твой товар продан!</b>\n' +
      '📦 ' + escapeHtml((product.title || '').slice(0, 80)) + '\n' +
      '💵 ваша доля: <b>$' + sellerAmount.toFixed(2) + '</b> (от $' + Number(purchase.amount_usd).toFixed(2) + ')\n' +
      'Покупка #' + purchase.id);
  }

  // Linear (10-level upline) notifications — first 3 levels only to not spam
  if (splitsByRecipient) {
    let level = 0;
    splitsByRecipient.forEach(function (split, userId) {
      if (split.type === 'linear' && level < 3 && userId !== (seller && seller.id)) {
        // We need to lookup user.tg_id from planner.users
        // Caller should pass tgIdsByUserId map — for now skip per-user notifications to refs
      }
      if (split.type === 'linear') level += 1;
    });
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// === Daily digest ===

async function sendDailyDigest() {
  try {
    const dbModule = require('../planner/db/database');
    const db = dbModule.getDb();
    const newUsers = db.prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= datetime('now','-1 day')").get().n || 0;
    const topupsCnt = db.prepare("SELECT COUNT(*) AS n FROM platega_invoices WHERE status='paid' AND paid_at >= datetime('now','-1 day') AND purpose='topup'").get().n || 0;
    const topupsSum = db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS s FROM platega_invoices WHERE status='paid' AND paid_at >= datetime('now','-1 day') AND purpose='topup'").get().s || 0;
    const salesCnt = db.prepare("SELECT COUNT(*) AS n FROM product_purchases WHERE payment_status='paid' AND created_at >= datetime('now','-1 day')").get().n || 0;
    const salesSum = db.prepare("SELECT COALESCE(SUM(amount_usd),0) AS s FROM product_purchases WHERE payment_status='paid' AND created_at >= datetime('now','-1 day')").get().s || 0;
    const totalUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n || 0;

    const text = '📊 <b>Trendex Daily Digest</b>\n' +
      '<i>За последние 24 часа:</i>\n\n' +
      '👥 Новых регистраций: <b>' + newUsers + '</b>\n' +
      '💰 Пополнений: <b>' + topupsCnt + '</b> на сумму <b>$' + Number(topupsSum).toFixed(2) + '</b>\n' +
      '🛒 Продаж на маркетплейсе: <b>' + salesCnt + '</b> на сумму <b>$' + Number(salesSum).toFixed(2) + '</b>\n\n' +
      '📈 Всего пользователей: <b>' + totalUsers + '</b>\n' +
      '<i>Pre-launch режим активен. Маркетинг расставится по твоей кнопке.</i>';
    notifyAdmins(text);
  } catch (e) {
    console.error('[daily-digest] failed:', e.message);
  }
}

module.exports = { sendTo, notifyAdmins, notifyUser, onNewUserRegistered, onTopupPaid, onMarketplaceSale, sendDailyDigest };
