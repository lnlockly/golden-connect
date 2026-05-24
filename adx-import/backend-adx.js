// src/routes/adx.js - Arsenal Profi Ad Exchange API
const express = require('express');
const router = express.Router();
const { authRequired } = require('../middleware/auth');
const { getDb } = require('../database');
const publisher = require('../services/ad-publisher');

const PLATFORM_FEE = 0.10; // 10% commission

// ── Helper: calculate price ────────────────────────────────────────
function calcPrice(channel, hours) {
  if (hours <= 24) return channel.price_24h;
  if (hours <= 48) return channel.price_48h || channel.price_24h * 1.8;
  return channel.price_72h || channel.price_24h * 2.5;
}

// ── Helper: log event ──────────────────────────────────────────────
function logEvent(db, orderId, event, details) {
  try {
    db.prepare('INSERT INTO adx_order_events (order_id, event, details) VALUES (?,?,?)').run(orderId, event, details || null);
  } catch(e) {}
}

// ── Helper: notify publisher via bot ──────────────────────────────
async function notifyPublisher(order, channel, advertiser) {
  try {
    const db = getDb();
    const publisher = db.prepare('SELECT tg_chat_id, language FROM users WHERE id=?').get(channel.user_id);
    if (!publisher || !publisher.tg_chat_id) return;

    const isRu = (publisher.language || 'ru') === 'ru';
    const hours = order.placement_hours;
    const price = order.publisher_earnings.toFixed(2);

    const startDate = new Date(order.start_at).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});

    const text = isRu
      ? `📣 *Новый запрос на размещение рекламы!*\n\nКанал: *${channel.title}* (${channel.member_count} 👥)\nДлительность: *${hours} часов*\nНачало: ${startDate}\nВаш заработок: *$${price}*\n\n📄 Текст поста:\n\`\`\`\n${(order.post_text||'').substring(0,300)}\n\`\`\`\n\n_Время на ответ: 12 часов_`
      : `📣 *New Ad Placement Request!*\n\nChannel: *${channel.title}* (${channel.member_count} 👥)\nDuration: *${hours} hours*\nStart: ${startDate}\nYour earnings: *$${price}*\n\n📄 Post text:\n\`\`\`\n${(order.post_text||'').substring(0,300)}\n\`\`\`\n\n_Response time: 12 hours_`;

    const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;
    const keyboard = {
      inline_keyboard: [[
        { text: isRu ? '✅ Принять' : '✅ Accept', callback_data: `adx_accept_${order.id}` },
        { text: isRu ? '❌ Отклонить' : '❌ Reject', callback_data: `adx_reject_${order.id}` }
      ]]
    };

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: publisher.tg_chat_id,
        text,
        parse_mode: 'Markdown',
        reply_markup: keyboard
      })
    });

    db.prepare('UPDATE adx_orders SET publisher_notified_at=CURRENT_TIMESTAMP WHERE id=?').run(order.id);
  } catch(e) {
    console.error('[ADX] notifyPublisher error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════════

router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM adx_categories ORDER BY sort_order').all();
  res.json({ success: true, categories: cats });
});

// ═══════════════════════════════════════════════════════════════════
// MARKETPLACE (public channel listing)
// ═══════════════════════════════════════════════════════════════════

router.get('/marketplace', authRequired, (req, res) => {
  const db = getDb();
  const { category, lang, min_subs, max_subs, min_price, max_price, sort = 'rating', q, page = 1 } = req.query;
  const limit = 24;
  const offset = (parseInt(page) - 1) * limit;

  let where = "c.status='active' AND c.in_network=1";
  const params = [];

  if (category) { where += " AND c.categories LIKE ?"; params.push(`%"${category}"%`); }
  if (lang) { where += " AND c.language=?"; params.push(lang); }
  if (min_subs) { where += " AND c.member_count >= ?"; params.push(parseInt(min_subs)); }
  if (max_subs) { where += " AND c.member_count <= ?"; params.push(parseInt(max_subs)); }
  if (min_price) { where += " AND c.price_24h >= ?"; params.push(parseFloat(min_price)); }
  if (max_price) { where += " AND c.price_24h <= ?"; params.push(parseFloat(max_price)); }
  if (q) { where += " AND (s.title LIKE ? OR s.username LIKE ? OR c.description LIKE ?)"; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const sortMap = {
    rating: 'c.rating DESC, c.total_orders DESC',
    price_asc: 'c.price_24h ASC',
    price_desc: 'c.price_24h DESC',
    subscribers: 'c.member_count DESC',
    er: 'c.engagement_rate DESC',
    popular: 'c.total_orders DESC',
    newest: 'c.created_at DESC'
  };
  const orderBy = sortMap[sort] || sortMap.rating;

  const channels = db.prepare(`
    SELECT c.*, s.title, s.username, s.avatar_url, s.tg_chat_id, s.type as channel_type,
      s.description as ch_description, s.photo_url as ch_photo_url,
      s.invite_link as ch_invite_link, s.is_verified as ch_is_verified
    FROM adx_channels c
    JOIN ad_sources s ON s.id = c.source_id
    WHERE ${where}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const total = db.prepare(`
    SELECT COUNT(*) as n FROM adx_channels c
    JOIN ad_sources s ON s.id = c.source_id
    WHERE ${where}
  `).get(...params);

  // Parse JSON fields
  channels.forEach(ch => {
    try { ch.categories = JSON.parse(ch.categories || '[]'); } catch(e) { ch.categories = []; }
    try { ch.post_buttons = JSON.parse(ch.post_buttons || '[]'); } catch(e) {}
  });

  res.json({ success: true, channels, total: total.n, page: parseInt(page), pages: Math.ceil(total.n / limit) });
});

router.get('/marketplace/:id', authRequired, (req, res) => {
  const db = getDb();
  const ch = db.prepare(`
    SELECT c.*, s.title, s.username, s.avatar_url, s.tg_chat_id, s.type as channel_type,
      s.description as ch_description, s.photo_url as ch_photo_url,
      s.invite_link as ch_invite_link, s.is_verified as ch_is_verified,
      s.linked_chat_id as ch_linked_chat_id
    FROM adx_channels c
    JOIN ad_sources s ON s.id = c.source_id
    WHERE c.id=? AND c.status='active' AND c.in_network=1
  `).get(req.params.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });

  // Stats history (14 days)
  const stats = db.prepare('SELECT * FROM adx_channel_stats WHERE channel_id=? ORDER BY date DESC LIMIT 14').all(ch.id);

  // Reviews
  const reviews = db.prepare(`
    SELECT r.*, u.username FROM adx_reviews r
    JOIN users u ON u.id=r.reviewer_user_id
    WHERE r.order_id IN (SELECT id FROM adx_orders WHERE channel_id=?)
    ORDER BY r.created_at DESC LIMIT 10
  `).all(ch.id);

  try { ch.categories = JSON.parse(ch.categories || '[]'); } catch(e) { ch.categories = []; }

  res.json({ success: true, channel: ch, stats, reviews });
});

// Budget-based channel suggestion
router.get('/budget-suggest', authRequired, (req, res) => {
  const db = getDb();
  const { budget, hours = 24, category, lang } = req.query;
  const budgetNum = parseFloat(budget);
  if (!budgetNum || budgetNum < 1) return res.status(400).json({ error: 'budget required' });

  const priceCol = hours == 48 ? 'c.price_48h' : hours == 72 ? 'c.price_72h' : 'c.price_24h';
  let where = `c.status='active' AND c.in_network=1 AND ${priceCol} > 0`;
  const params = [];
  if (category) { where += " AND c.categories LIKE ?"; params.push(`%"${category}"%`); }
  if (lang) { where += " AND c.language=?"; params.push(lang); }

  const allChannels = db.prepare(`
    SELECT c.id, c.member_count, c.engagement_rate, c.avg_views_per_post, c.price_24h, c.price_48h, c.price_72h,
      c.rating, c.total_orders, c.categories, c.language as lang, c.description,
      s.title, s.username, s.avatar_url, s.is_verified as ch_is_verified
    FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id
    WHERE ${where}
    ORDER BY c.rating DESC, c.member_count DESC
  `).all(...params);

  allChannels.forEach(ch => {
    try { ch.categories = JSON.parse(ch.categories || '[]'); } catch(e) { ch.categories = []; }
    ch.price = parseFloat(ch['price_' + hours + 'h']) || ch.price_24h;
  });

  // Greedy selection: best channels within budget
  let remaining = budgetNum;
  const selected = [];
  const sorted = allChannels.filter(ch => ch.price <= remaining)
    .sort((a, b) => {
      // Score: normalize by price to find best value
      const scoreA = (a.rating * 0.4 + Math.log10(a.member_count || 1) * 0.3 + (a.engagement_rate || 0) * 0.3) / Math.log10(a.price + 1);
      const scoreB = (b.rating * 0.4 + Math.log10(b.member_count || 1) * 0.3 + (b.engagement_rate || 0) * 0.3) / Math.log10(b.price + 1);
      return scoreB - scoreA;
    });

  for (const ch of sorted) {
    if (ch.price <= remaining && selected.length < 10) {
      selected.push(ch);
      remaining -= ch.price;
    }
  }

  res.json({
    success: true,
    budget: budgetNum,
    hours: parseInt(hours),
    selected,
    total_spend: Math.round((budgetNum - remaining) * 100) / 100,
    remaining: Math.round(remaining * 100) / 100,
    total_reach: selected.reduce((s, ch) => s + (ch.avg_views_per_post || Math.round(ch.member_count * 0.1)), 0)
  });
});

// ═══════════════════════════════════════════════════════════════════
// ORDERS (advertiser)
// ═══════════════════════════════════════════════════════════════════

router.post('/orders', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { channel_id, post_text, post_media_url, post_media_type, post_buttons, placement_hours, start_at, price_usd } = req.body;

  if (!channel_id || !post_text) return res.status(400).json({ error: 'channel_id and post_text required' });
  if (![24,48,72].includes(parseInt(placement_hours))) return res.status(400).json({ error: 'placement_hours must be 24, 48 or 72' });

  const channel = db.prepare(`
    SELECT c.*, s.title, s.tg_chat_id
    FROM adx_channels c JOIN ad_sources s ON s.id=c.source_id
    WHERE c.id=? AND c.status='active' AND c.in_network=1
  `).get(channel_id);
  if (!channel) return res.status(404).json({ error: 'Channel not found or not in network' });

  // Check channel owner isn't the advertiser
  if (channel.user_id === userId) return res.status(400).json({ error: 'Cannot advertise in your own channel' });

  // Check publisher account not frozen
  const publisher = db.prepare('SELECT balance_usd FROM users WHERE id=?').get(channel.user_id);
  if (channel.frozen_balance > 0 && (!publisher || publisher.balance_usd < 0)) {
    return res.status(400).json({ error: 'This channel is temporarily unavailable' });
  }

  // Advertiser sets their own price offer
  const price = parseFloat(req.body.price_usd);
  if (!price || price <= 0) return res.status(400).json({ error: 'price_usd required (advertiser sets the price)' });

  const platformFee = +(price * PLATFORM_FEE).toFixed(4);
  const publisherEarnings = +(price - platformFee).toFixed(4);

  // Check advertiser balance
  const advertiser = db.prepare('SELECT balance_usd FROM users WHERE id=?').get(userId);
  if (!advertiser || advertiser.balance_usd < price) {
    return res.status(400).json({ error: 'Insufficient balance', required: price, available: advertiser?.balance_usd || 0 });
  }

  const startDate = start_at ? new Date(start_at) : new Date(Date.now() + 3600000); // default: 1h from now
  const endDate = new Date(startDate.getTime() + parseInt(placement_hours) * 3600000);

  const insertOrder = db.prepare(`
    INSERT INTO adx_orders (advertiser_user_id, channel_id, post_text, post_media_url, post_media_type, post_buttons,
      placement_hours, start_at, end_at, price_usd, platform_fee_usd, publisher_earnings, tg_channel_id, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_approval')
  `);

  const result = db.transaction(() => {
    const r = insertOrder.run(userId, channel_id, post_text, post_media_url || null, post_media_type || 'none',
      JSON.stringify(post_buttons || []), parseInt(placement_hours),
      startDate.toISOString(), endDate.toISOString(),
      price, platformFee, publisherEarnings, channel.tg_chat_id);

    const orderId = r.lastInsertRowid;

    // Freeze advertiser balance (escrow)
    db.prepare('UPDATE users SET balance_usd = balance_usd - ? WHERE id=?').run(price, userId);
    db.prepare('INSERT INTO adx_escrow (order_id, advertiser_user_id, amount) VALUES (?,?,?)').run(orderId, userId, price);
    db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(userId, -price, 'adx_escrow', `Ad order #${orderId} - escrow hold`);

    logEvent(db, orderId, 'created', `Advertiser ${userId}, channel ${channel_id}, ${placement_hours}h, $${price}`);

    return orderId;
  })();

  const order = db.prepare('SELECT * FROM adx_orders WHERE id=?').get(result);

  // Notify publisher async
  notifyPublisher(order, channel, { id: userId }).catch(() => {});

  res.json({ success: true, order_id: result, order });
});

router.get('/orders', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { role = 'advertiser' } = req.query;

  let orders;
  if (role === 'publisher') {
    orders = db.prepare(`
      SELECT o.*, s.title as channel_title, s.username as channel_username,
             u.username as advertiser_name
      FROM adx_orders o
      JOIN adx_channels c ON c.id=o.channel_id
      JOIN ad_sources s ON s.id=c.source_id
      JOIN users u ON u.id=o.advertiser_user_id
      WHERE c.user_id=?
      ORDER BY o.created_at DESC LIMIT 50
    `).all(userId);
  } else {
    orders = db.prepare(`
      SELECT o.*, s.title as channel_title, s.username as channel_username
      FROM adx_orders o
      JOIN adx_channels c ON c.id=o.channel_id
      JOIN ad_sources s ON s.id=c.source_id
      WHERE o.advertiser_user_id=?
      ORDER BY o.created_at DESC LIMIT 50
    `).all(userId);
  }

  res.json({ success: true, orders });
});

router.get('/orders/:id', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const order = db.prepare(`
    SELECT o.*, s.title as channel_title, s.username as channel_username,
           c.user_id as publisher_user_id
    FROM adx_orders o
    JOIN adx_channels c ON c.id=o.channel_id
    JOIN ad_sources s ON s.id=c.source_id
    WHERE o.id=?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Not found' });
  if (order.advertiser_user_id !== userId && order.publisher_user_id !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const events = db.prepare('SELECT * FROM adx_order_events WHERE order_id=? ORDER BY created_at').all(order.id);
  res.json({ success: true, order, events });
});

router.delete('/orders/:id', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const order = db.prepare('SELECT * FROM adx_orders WHERE id=? AND advertiser_user_id=?').get(req.params.id, userId);
  if (!order) return res.status(404).json({ error: 'Not found' });
  if (!['pending_approval','rejected'].includes(order.status)) {
    return res.status(400).json({ error: 'Cannot cancel order in status: ' + order.status });
  }

  db.transaction(() => {
    db.prepare("UPDATE adx_orders SET status='cancelled', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
    // Refund
    db.prepare('UPDATE users SET balance_usd=balance_usd+? WHERE id=?').run(order.price_usd, userId);
    db.prepare("UPDATE adx_escrow SET status='refunded' WHERE order_id=?").run(order.id);
    db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(userId, order.price_usd, 'adx_refund', `Ad order #${order.id} cancelled - refund`);
    logEvent(db, order.id, 'cancelled', `Cancelled by advertiser ${userId}`);
  })();

  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════
// PUBLISHER CHANNELS
// ═══════════════════════════════════════════════════════════════════

router.get('/channels/my', authRequired, (req, res) => {
  const db = getDb();
  const channels = db.prepare(`
    SELECT c.*, s.title, s.username, s.avatar_url, s.tg_chat_id, s.member_count as src_member_count, s.type as channel_type
    FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id
    WHERE c.user_id=?
    ORDER BY c.created_at DESC
  `).all(req.user.id);

  channels.forEach(ch => {
    try { ch.categories = JSON.parse(ch.categories || '[]'); } catch(e) { ch.categories = []; }

    // Pending orders count
    ch.pending_orders = db.prepare("SELECT COUNT(*) as n FROM adx_orders WHERE channel_id=? AND status='pending_approval'").get(ch.id)?.n || 0;
    ch.active_orders = db.prepare("SELECT COUNT(*) as n FROM adx_orders WHERE channel_id=? AND status='active'").get(ch.id)?.n || 0;
  });

  // Sources not yet in adx
  const registered = channels.map(c => c.source_id);
  const available = db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND bot_is_admin=1 AND status='active'").all(req.user.id)
    .filter(s => !registered.includes(s.id));

  res.json({ success: true, channels, available_sources: available });
});

router.post('/channels/register', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { source_id, categories, language, description, price_24h, price_48h, price_72h } = req.body;

  if (!source_id) return res.status(400).json({ error: 'source_id required' });

  const source = db.prepare('SELECT * FROM ad_sources WHERE id=? AND user_id=? AND bot_is_admin=1').get(source_id, userId);
  if (!source) return res.status(404).json({ error: 'Channel not found or bot is not admin' });

  if (source.member_count < 200) return res.status(400).json({ error: 'Channel must have at least 200 subscribers' });

  const existing = db.prepare('SELECT id FROM adx_channels WHERE source_id=?').get(source_id);
  if (existing) return res.status(409).json({ error: 'Channel already registered' });

  const result = db.prepare(`
    INSERT INTO adx_channels (source_id, user_id, categories, language, description,
      price_24h, price_48h, price_72h, member_count, status, in_network)
    VALUES (?,?,?,?,?,?,?,?,?,'pending',0)
  `).run(source_id, userId,
    JSON.stringify(categories || []), language || 'ru',
    description || '', parseFloat(price_24h) || 0,
    Math.max(parseFloat(price_48h) || 0, parseFloat(price_24h) || 0),
    Math.max(parseFloat(price_72h) || 0, parseFloat(price_48h) || 0, parseFloat(price_24h) || 0),
    source.member_count);

  // Auto-approve if member_count >= 100 (for now; add manual moderation later)
  const channelId = result.lastInsertRowid;
  const channel = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(channelId);

  // Check moderation setting
  const moderationEnabled = getSetting(db, 'adx_moderation_enabled');
  const autoApprove = getSetting(db, 'adx_auto_approve') === '1' || moderationEnabled === '0';

  if (autoApprove || (source.member_count >= 100 && parseFloat(price_24h) > 0)) {
    db.prepare("UPDATE adx_channels SET status='active', in_network=1 WHERE id=?").run(channelId);
    res.json({ success: true, channel_id: channelId, status: 'active', auto_approved: true });
  } else {
    // Notify admin for manual review
    notifyAdminChannelPending({ ...channel, title: source.title, username: source.username, member_count: source.member_count }).catch(() => {});
    res.json({ success: true, channel_id: channelId, status: 'pending' });
  }
});


// ── Direct channel registration (no Ad Center required) ───────────
router.post('/channels/register-direct', authRequired, async (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { chat_id, categories, language, description, price_24h, price_48h, price_72h } = req.body;

  if (!chat_id) return res.status(400).json({ error: 'chat_id required (e.g. @channelname)' });
  if (!price_24h || parseFloat(price_24h) < 1) return res.status(400).json({ error: 'price_24h required (min $1)' });

  try {
    // Check bot is admin in channel
    const check = await publisher.checkBotAdmin(chat_id);
    if (!check.ok) return res.status(400).json({ error: check.error || 'Bot is not admin in channel. Add @ARSENALPROFIbot as administrator first.' });

    const chatId = String(check.chat.id);
    const memberCount = check.chat.member_count || 0;

    // Create or find ad_source
    let source = db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND tg_chat_id=? AND status!='removed'").get(userId, chatId);
    if (!source) {
      const r = db.prepare(`INSERT INTO ad_sources (user_id, type, tg_chat_id, title, username, member_count, bot_is_admin, description, photo_url, invite_link, linked_chat_id, avg_post_views, is_verified)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        userId,
        check.chat.type === 'channel' ? 'tg_channel' : 'tg_group',
        chatId,
        check.chat.title || chat_id,
        check.chat.username || '',
        memberCount,
        check.bot_is_admin ? 1 : 0,
        check.chat.description || null,
        check.chat.photo_url || null,
        check.chat.invite_link || null,
        check.chat.linked_chat_id ? String(check.chat.linked_chat_id) : null,
        check.chat.avg_post_views || 0,
        check.chat.is_verified ? 1 : 0
      );
      source = db.prepare('SELECT * FROM ad_sources WHERE id=?').get(r.lastInsertRowid);
    } else {
      // Update existing
      db.prepare(`UPDATE ad_sources SET member_count=?, bot_is_admin=?, status='active',
        description=COALESCE(?, description), photo_url=COALESCE(?, photo_url),
        invite_link=COALESCE(?, invite_link), linked_chat_id=COALESCE(?, linked_chat_id),
        avg_post_views=CASE WHEN ? > 0 THEN ? ELSE avg_post_views END,
        is_verified=? WHERE id=?`)
        .run(memberCount, check.bot_is_admin ? 1 : 0,
          check.chat.description || null, check.chat.photo_url || null,
          check.chat.invite_link || null, check.chat.linked_chat_id ? String(check.chat.linked_chat_id) : null,
          check.chat.avg_post_views || 0, check.chat.avg_post_views || 0,
          check.chat.is_verified ? 1 : 0, source.id);
    }

    if (!check.bot_is_admin) return res.status(400).json({ error: 'Bot is not admin. Add @ARSENALPROFIbot as administrator to your channel.' });

    // Check already in ADX
    const existing = db.prepare('SELECT id, status FROM adx_channels WHERE source_id=?').get(source.id);
    if (existing) return res.status(409).json({ error: 'Channel already registered in Ad Exchange', channel_id: existing.id });

    const p24 = parseFloat(price_24h) || 5;
    const result = db.prepare(`
      INSERT INTO adx_channels (source_id, user_id, categories, language, description,
        price_24h, price_48h, price_72h, member_count, status, in_network)
      VALUES (?,?,?,?,?,?,?,?,?,'pending',0)
    `).run(source.id, userId,
      JSON.stringify(categories || []), language || 'ru',
      description || '', p24,
      Math.max(parseFloat(price_48h) || 0, Math.round(p24 * 1.7 * 100) / 100),
      Math.max(parseFloat(price_72h) || 0, Math.round(p24 * 2.2 * 100) / 100),
      memberCount);

    const channelId = result.lastInsertRowid;
    const channel2 = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(channelId);

    // Check moderation setting
    const moderationEnabled2 = getSetting(db, 'adx_moderation_enabled');
    const autoApprove2 = getSetting(db, 'adx_auto_approve') === '1' || moderationEnabled2 === '0';

    if (autoApprove2 || (memberCount >= 200 && p24 > 0)) {
      db.prepare("UPDATE adx_channels SET status='active', in_network=1 WHERE id=?").run(channelId);
      res.json({ success: true, channel_id: channelId, status: 'active', auto_approved: true, member_count: memberCount });
    } else {
      notifyAdminChannelPending({ ...channel2, title: check.chat.title, username: check.chat.username, member_count: memberCount }).catch(() => {});
      res.json({ success: true, channel_id: channelId, status: 'pending', member_count: memberCount });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/channels/:id', authRequired, (req, res) => {
  const db = getDb();
  const channel = db.prepare('SELECT * FROM adx_channels WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!channel) return res.status(404).json({ error: 'Not found' });

  const { categories, language, description, price_24h, price_48h, price_72h, in_network } = req.body;

  const updates = [];
  const params = [];
  if (categories !== undefined) { updates.push('categories=?'); params.push(JSON.stringify(categories)); }
  if (language !== undefined) { updates.push('language=?'); params.push(language); }
  if (description !== undefined) { updates.push('description=?'); params.push(description); }
  if (price_24h !== undefined) { updates.push('price_24h=?'); params.push(parseFloat(price_24h)); }
  const cur = db.prepare('SELECT price_24h, price_48h, price_72h FROM adx_channels WHERE id=?').get(req.params.id);
  if (price_48h !== undefined) {
    const p48 = Math.max(parseFloat(price_48h) || 0, cur ? cur.price_24h || 0 : 0);
    updates.push('price_48h=?'); params.push(p48);
  }
  if (price_72h !== undefined) {
    const p72 = Math.max(parseFloat(price_72h) || 0, cur ? cur.price_48h || 0 : 0);
    updates.push('price_72h=?'); params.push(p72);
  }
  if (in_network !== undefined && channel.status === 'active') {
    updates.push('in_network=?'); params.push(in_network ? 1 : 0);
  }

  if (updates.length > 0) {
    updates.push('updated_at=CURRENT_TIMESTAMP');
    params.push(req.params.id);
    db.prepare(`UPDATE adx_channels SET ${updates.join(',')} WHERE id=?`).run(...params);


  }

  const updated = db.prepare(`
    SELECT c.*, s.title, s.username FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id WHERE c.id=?
  `).get(req.params.id);
  try { updated.categories = JSON.parse(updated.categories || '[]'); } catch(e) { updated.categories = []; }

  res.json({ success: true, channel: updated });
});

// Publisher: accept order
router.post('/orders/:id/accept', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const order = db.prepare(`
    SELECT o.*, c.user_id as publisher_user_id, s.tg_chat_id
    FROM adx_orders o
    JOIN adx_channels c ON c.id=o.channel_id
    JOIN ad_sources s ON s.id=c.source_id
    WHERE o.id=?
  `).get(req.params.id);

  if (!order || order.publisher_user_id !== userId) return res.status(404).json({ error: 'Not found' });
  if (order.status !== 'pending_approval') return res.status(400).json({ error: 'Order not pending' });

  db.transaction(() => {
    db.prepare("UPDATE adx_orders SET status='approved', publisher_decision='accepted', publisher_decision_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
    logEvent(db, order.id, 'accepted', `Publisher ${userId} accepted`);
  })();

  // Schedule posting (async)
  scheduleAdPost(order).catch(e => console.error('[ADX] scheduleAdPost error:', e.message));

  res.json({ success: true });
});

// Publisher: reject order
router.post('/orders/:id/reject', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { reason } = req.body;
  const order = db.prepare(`
    SELECT o.*, c.user_id as publisher_user_id
    FROM adx_orders o JOIN adx_channels c ON c.id=o.channel_id
    WHERE o.id=?
  `).get(req.params.id);

  if (!order || order.publisher_user_id !== userId) return res.status(404).json({ error: 'Not found' });
  if (order.status !== 'pending_approval') return res.status(400).json({ error: 'Order not pending' });

  db.transaction(() => {
    db.prepare("UPDATE adx_orders SET status='rejected', publisher_decision='rejected', publisher_note=?, publisher_decision_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(reason || null, order.id);
    // Refund advertiser
    db.prepare('UPDATE users SET balance_usd=balance_usd+? WHERE id=?').run(order.price_usd, order.advertiser_user_id);
    db.prepare("UPDATE adx_escrow SET status='refunded' WHERE order_id=?").run(order.id);
    db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(order.advertiser_user_id, order.price_usd, 'adx_refund', `Ad order #${order.id} rejected by publisher - refund`);
    logEvent(db, order.id, 'rejected', `Publisher ${userId} rejected: ${reason || ''}`);
  })();

  // Notify advertiser
  notifyAdvertiser(order, 'rejected', reason).catch(() => {});

  res.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════
// STATS / EARNINGS
// ═══════════════════════════════════════════════════════════════════

router.get('/earnings', authRequired, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN o.status='completed' THEN o.publisher_earnings ELSE 0 END) as total_earned,
      COUNT(CASE WHEN o.status='completed' THEN 1 END) as completed_orders,
      COUNT(CASE WHEN o.status='pending_approval' THEN 1 END) as pending_orders,
      COUNT(CASE WHEN o.status='active' THEN 1 END) as active_orders
    FROM adx_orders o
    JOIN adx_channels c ON c.id=o.channel_id
    WHERE c.user_id=?
  `).get(userId);

  const recent = db.prepare(`
    SELECT o.*, s.title as channel_title
    FROM adx_orders o
    JOIN adx_channels c ON c.id=o.channel_id
    JOIN ad_sources s ON s.id=c.source_id
    WHERE c.user_id=? AND o.status IN ('completed','active')
    ORDER BY o.created_at DESC LIMIT 20
  `).all(userId);

  res.json({ success: true, stats, orders: recent });
});

// ═══════════════════════════════════════════════════════════════════
// AD POSTING + MONITORING
// ═══════════════════════════════════════════════════════════════════

async function scheduleAdPost(order) {
  const db = getDb();
  const now = new Date();
  const startAt = new Date(order.start_at);
  const delay = Math.max(0, startAt - now);

  setTimeout(async () => {
    try {
      const freshOrder = db.prepare('SELECT * FROM adx_orders WHERE id=?').get(order.id);
      if (freshOrder.status !== 'approved') return;

      const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;
      let messageId;

      // Build buttons
      let replyMarkup;
      try {
        const buttons = JSON.parse(freshOrder.post_buttons || '[]');
        if (buttons.length > 0) {
          replyMarkup = { inline_keyboard: [buttons.map(b => ({ text: b.text, url: b.url }))] };
        }
      } catch(e) {}

      const caption = freshOrder.post_text;

      if (freshOrder.post_media_url && freshOrder.post_media_type === 'photo') {
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: freshOrder.tg_channel_id, photo: freshOrder.post_media_url, caption, parse_mode: 'HTML', reply_markup: replyMarkup })
        });
        const data = await resp.json();
        messageId = data.result?.message_id;
      } else if (freshOrder.post_media_url && freshOrder.post_media_type === 'video') {
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: freshOrder.tg_channel_id, video: freshOrder.post_media_url, caption, parse_mode: 'HTML', reply_markup: replyMarkup })
        });
        const data = await resp.json();
        messageId = data.result?.message_id;
      } else {
        const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: freshOrder.tg_channel_id, text: caption, parse_mode: 'HTML', reply_markup: replyMarkup })
        });
        const data = await resp.json();
        messageId = data.result?.message_id;
      }

      if (messageId) {
        db.prepare("UPDATE adx_orders SET status='active', tg_message_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(messageId, order.id);
        logEvent(db, order.id, 'posted', `message_id: ${messageId}`);
        console.log(`[ADX] Posted order #${order.id} to ${freshOrder.tg_channel_id}, msg_id: ${messageId}`);
      }
    } catch(e) {
      console.error('[ADX] scheduleAdPost posting error:', e.message);
      db.prepare("UPDATE adx_orders SET status='failed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
    }
  }, delay);
}

async function notifyAdvertiser(order, event, details) {
  try {
    const db = getDb();
    const advertiser = db.prepare('SELECT tg_chat_id, language FROM users WHERE id=?').get(order.advertiser_user_id);
    if (!advertiser?.tg_chat_id) return;
    const isRu = (advertiser.language || 'ru') === 'ru';
    const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;

    let text;
    if (event === 'rejected') {
      text = isRu
        ? `❌ Ваш запрос на размещение рекламы #${order.id} отклонён.\nСредства $${order.price_usd.toFixed(2)} возвращены на баланс.${details ? `\nПричина: ${details}` : ''}`
        : `❌ Your ad request #${order.id} was rejected.\n$${order.price_usd.toFixed(2)} refunded to your balance.${details ? `\nReason: ${details}` : ''}`;
    } else if (event === 'completed') {
      text = isRu
        ? `✅ Реклама #${order.id} успешно завершена!\nСпасибо за использование Arsenal Profi Ads.`
        : `✅ Ad #${order.id} completed successfully!\nThank you for using Arsenal Profi Ads.`;
    }
    if (text) {
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: advertiser.tg_chat_id, text })
      });
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════════
// MONITORING CRON (called by external cron every 30min)
// ═══════════════════════════════════════════════════════════════════

router.post('/internal/monitor', (req, res) => {
  // Internal only - called by cron
  if (req.headers['x-internal-key'] !== (process.env.INTERNAL_KEY || 'adx_monitor_2026') && req.ip !== '127.0.0.1' && req.ip !== '::1') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  runMonitor().catch(e => console.error('[ADX Monitor]', e.message));
  res.json({ success: true, message: 'monitor started' });
});

async function runMonitor() {
  const db = getDb();
  const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;

  // Check active orders
  const activeOrders = db.prepare(`
    SELECT o.*, c.user_id as publisher_user_id
    FROM adx_orders o JOIN adx_channels c ON c.id=o.channel_id
    WHERE o.status='active' AND o.tg_message_id IS NOT NULL
  `).all();

  for (const order of activeOrders) {
    try {
      const now = new Date();
      const endAt = new Date(order.end_at);

      // Check if ad should be completed
      if (now >= endAt) {
        db.transaction(() => {
          db.prepare("UPDATE adx_orders SET status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
          // Release payment to publisher
          db.prepare('UPDATE users SET balance_usd=balance_usd+? WHERE id=?').run(order.publisher_earnings, order.publisher_user_id);
          // Platform keeps platform_fee (already deducted from advertiser)
          db.prepare("UPDATE adx_escrow SET status='released', released_at=CURRENT_TIMESTAMP, released_to=? WHERE order_id=?").run(order.publisher_user_id, order.id);
          db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(order.publisher_user_id, order.publisher_earnings, 'adx_earning', `Ad order #${order.id} completed - earned $${order.publisher_earnings}`);
          db.prepare('UPDATE adx_channels SET total_orders=total_orders+1, total_earnings=total_earnings+? WHERE id=?').run(order.publisher_earnings, order.channel_id);
          logEvent(db, order.id, 'completed', `Paid publisher $${order.publisher_earnings}`);
        })();
        notifyAdvertiser(order, 'completed').catch(() => {});
        continue;
      }

      // Check if post still exists (verify presence)
      const checkResp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: order.tg_channel_id, from_chat_id: order.tg_channel_id, message_id: order.tg_message_id, disable_notification: true })
      });
      const checkData = await checkResp.json();

      db.prepare('UPDATE adx_orders SET last_check_at=CURRENT_TIMESTAMP, checks_count=checks_count+1 WHERE id=?').run(order.id);

      if (!checkData.ok && checkData.description && checkData.description.includes('message to forward not found')) {
        // Post was deleted!
        const elapsedHours = (now - new Date(order.start_at)) / 3600000;
        const totalHours = order.placement_hours;

        if (elapsedHours < totalHours * 0.9) { // deleted with >10% time remaining
          const penaltyAmount = order.price_usd * 2;
          const advertiserRefund = order.price_usd;
          const platformShare = order.price_usd;

          db.transaction(() => {
            db.prepare("UPDATE adx_orders SET status='penalty', removed_early=1, removal_detected_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);

            const publisher = db.prepare('SELECT balance_usd FROM users WHERE id=?').get(order.publisher_user_id);
            const canCollect = publisher && publisher.balance_usd >= penaltyAmount;

            db.prepare('INSERT INTO adx_penalties (order_id, publisher_user_id, penalty_amount, advertiser_refund, platform_share, status) VALUES (?,?,?,?,?,?)').run(
              order.id, order.publisher_user_id, penaltyAmount, advertiserRefund, platformShare,
              canCollect ? 'collected' : 'debt'
            );

            if (canCollect) {
              db.prepare('UPDATE users SET balance_usd=balance_usd-? WHERE id=?').run(penaltyAmount, order.publisher_user_id);
              db.prepare('UPDATE users SET balance_usd=balance_usd+? WHERE id=?').run(advertiserRefund, order.advertiser_user_id);
              db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(order.publisher_user_id, -penaltyAmount, 'adx_penalty', `Penalty for early removal of ad #${order.id}`);
              db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(order.advertiser_user_id, advertiserRefund, 'adx_refund', `Refund for ad #${order.id} removed early`);
            } else {
              // Publisher goes negative, freeze channel
              db.prepare('UPDATE users SET balance_usd=balance_usd-? WHERE id=?').run(penaltyAmount, order.publisher_user_id);
              db.prepare("UPDATE adx_channels SET frozen_balance=? WHERE user_id=? AND id=?").run(penaltyAmount, order.publisher_user_id, order.channel_id);
            }

            logEvent(db, order.id, 'penalty', `Early removal detected after ${elapsedHours.toFixed(1)}h of ${totalHours}h`);
          })();

          // Notify publisher about penalty
          notifyPenalty(order, penaltyAmount, advertiserRefund).catch(() => {});
        }
      } else if (checkData.ok) {
        // Delete the forwarded check message
        const fwdMsgId = checkData.result?.message_id;
        if (fwdMsgId) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: order.tg_channel_id, message_id: fwdMsgId })
          }).catch(() => {});
        }
      }
    } catch(e) {
      console.error(`[ADX Monitor] order #${order.id}:`, e.message);
    }
  }

  // Auto-expire pending orders (no response in 12h)
  const expiredPending = db.prepare(`
    SELECT o.*, c.user_id as publisher_user_id
    FROM adx_orders o JOIN adx_channels c ON c.id=o.channel_id
    WHERE o.status='pending_approval' AND datetime(o.publisher_notified_at, '+12 hours') < datetime('now')
  `).all();

  for (const order of expiredPending) {
    db.transaction(() => {
      db.prepare("UPDATE adx_orders SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(order.id);
      db.prepare('UPDATE users SET balance_usd=balance_usd+? WHERE id=?').run(order.price_usd, order.advertiser_user_id);
      db.prepare("UPDATE adx_escrow SET status='refunded' WHERE order_id=?").run(order.id);
      db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(order.advertiser_user_id, order.price_usd, 'adx_refund', `Ad order #${order.id} expired (no publisher response) - refund`);
      logEvent(db, order.id, 'expired', 'Publisher did not respond in 12h');
    })();
    notifyAdvertiser(order, 'rejected', 'Publisher did not respond in time (auto-refund)').catch(() => {});
  }

  console.log(`[ADX Monitor] checked ${activeOrders.length} active, expired ${expiredPending.length} pending`);
}

async function notifyPenalty(order, penaltyAmount, refundAmount) {
  try {
    const db = getDb();
    const publisher = db.prepare('SELECT tg_chat_id, language FROM users WHERE id=?').get(order.publisher_user_id);
    if (!publisher?.tg_chat_id) return;
    const isRu = (publisher.language || 'ru') === 'ru';
    const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;

    const text = isRu
      ? `⚠️ *Реклама удалена досрочно!*\n\nЗаказ #${order.id}\nШтраф: $${penaltyAmount.toFixed(2)} (2× сумма заказа)\n→ Возврат рекламодателю: $${refundAmount.toFixed(2)}\n→ Платформе: $${refundAmount.toFixed(2)}\n\nВаш аккаунт может быть заморожен до пополнения баланса.`
      : `⚠️ *Ad removed early!*\n\nOrder #${order.id}\nPenalty: $${penaltyAmount.toFixed(2)} (2× order amount)\n→ Advertiser refund: $${refundAmount.toFixed(2)}\n→ Platform: $${refundAmount.toFixed(2)}\n\nYour account may be frozen until balance is restored.`;

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: publisher.tg_chat_id, text, parse_mode: 'Markdown' })
    });
  } catch(e) {}
}


// ─── Admin approval helpers ────────────────────────────────────────────────

// ── Settings helpers ──────────────────────────────────────────────────────────
function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM bot_settings WHERE key=?').get(key);
  return row ? row.value : null;
}

async function notifyAdminChannelPending(channel) {
  try {
    const db = getDb();
    const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;
    // Try bot_settings first, then env var
    const ADMIN_CHAT_ID = getSetting(db, 'adx_admin_chat_id') || process.env.ADMIN_TG_CHAT_ID || '';
    if (!ADMIN_CHAT_ID) {
      console.log('[ADX] No admin chat_id configured. Set ADMIN_TG_CHAT_ID or use /becomeadmin in bot.');
      return;
    }

    const owner = db.prepare('SELECT username, email FROM users WHERE id=?').get(channel.user_id);

    const text = `🏪 *Новый канал на модерацию*

Канал: *${channel.title}*${channel.username ? ' (@' + channel.username + ')' : ''}
Подписчиков: *${channel.member_count?.toLocaleString()}*
Владелец: ${owner?.username || 'unknown'} (${owner?.email || ''})
ID канала в системе: #${channel.id}

Проверь канал и подтверди или отклони:`;

    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Одобрить', callback_data: `adx_ch_approve_${channel.id}` },
        { text: '❌ Отклонить', callback_data: `adx_ch_reject_${channel.id}` }
      ]]
    };

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text, parse_mode: 'Markdown', reply_markup: keyboard })
    });
    console.log('[ADX] Admin notified about channel #' + channel.id);
  } catch(e) { console.error('[ADX] notifyAdmin error:', e.message); }
}

// API: get/set moderation settings (for bot admin panel)
router.get('/admin/settings', authRequired, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM bot_settings WHERE key LIKE 'adx_%'").all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json({ success: true, settings });
});

router.post('/admin/settings', authRequired, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Admin only' });
  const db = getDb();
  const { key, value } = req.body;
  const allowed = ['adx_auto_approve', 'adx_moderation_enabled', 'adx_admin_chat_id'];
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting' });
  db.prepare("INSERT OR REPLACE INTO bot_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));
  res.json({ success: true });
});

// Public API for bot (no auth, uses bot secret)
router.post('/bot/admin-settings', (req, res) => {
  const db = getDb();
  const { secret, key, value } = req.body;
  const BOT_SECRET = process.env.BOT_SECRET || process.env.TG_BOT_TOKEN || '';
  if (!secret || secret !== BOT_SECRET.slice(-10)) return res.status(403).json({ error: 'Forbidden' });
  const allowed = ['adx_auto_approve', 'adx_moderation_enabled', 'adx_admin_chat_id'];
  if (!allowed.includes(key)) return res.status(400).json({ error: 'Unknown setting' });
  db.prepare("INSERT OR REPLACE INTO bot_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, String(value));
  res.json({ success: true });
});

router.post('/bot/admin-settings-get', (req, res) => {
  const db = getDb();
  const { secret } = req.body;
  const BOT_SECRET = process.env.BOT_SECRET || process.env.TG_BOT_TOKEN || '';
  if (!secret || secret !== BOT_SECRET.slice(-10)) return res.status(403).json({ error: 'Forbidden' });
  const keys = ['adx_auto_approve', 'adx_moderation_enabled', 'adx_admin_chat_id'];
  const settings = {};
  for (const k of keys) {
    const row = db.prepare('SELECT value FROM bot_settings WHERE key=?').get(k);
    settings[k] = row ? row.value : null;
  }
  const pending = db.prepare("SELECT COUNT(*) as n FROM adx_channels WHERE status='pending'").get();
  res.json({ success: true, settings, pending_count: pending ? pending.n : 0 });
});

// Admin: approve channel
router.post('/admin/channels/:id/approve', authRequired, (req, res) => {
  const db = getDb();
  // Check is_admin
  const user = db.prepare('SELECT is_admin FROM users WHERE id=?').get(req.user.id);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });

  const channel = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Not found' });

  db.prepare("UPDATE adx_channels SET status='active', in_network=1, moderation_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.note || null, req.params.id);

  // Notify publisher
  notifyChannelOwnerApproval(channel, true).catch(() => {});

  res.json({ success: true });
});

// Admin: reject channel
router.post('/admin/channels/:id/reject', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id=?').get(req.user.id);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });

  const channel = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Not found' });

  db.prepare("UPDATE adx_channels SET status='rejected', in_network=0, moderation_note=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(req.body.reason || null, req.params.id);

  notifyChannelOwnerApproval(channel, false, req.body.reason).catch(() => {});

  res.json({ success: true });
});

// Admin: list pending channels
router.get('/admin/channels/pending', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT is_admin FROM users WHERE id=?').get(req.user.id);
  if (!user?.is_admin) return res.status(403).json({ error: 'Admin only' });

  const channels = db.prepare(`
    SELECT c.*, s.title, s.username, s.avatar_url, s.tg_chat_id, s.member_count as src_subs,
           u.username as owner_name, u.email as owner_email
    FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id
    JOIN users u ON u.id=c.user_id
    WHERE c.status IN ('pending_admin','rejected')
    ORDER BY c.created_at DESC
  `).all();
  res.json({ success: true, channels });
});

async function notifyChannelOwnerApproval(channel, approved, reason) {
  try {
    const db = getDb();
    const owner = db.prepare('SELECT tg_chat_id, language FROM users WHERE id=?').get(channel.user_id);
    if (!owner?.tg_chat_id) return;
    const isRu = (owner.language || 'ru') === 'ru';
    const BOT_TOKEN = process.env.TG_BOT_TOKEN || process.env.BOT_TOKEN;

    const text = approved
      ? (isRu ? `✅ *Ваш канал одобрен!*\n\nКанал добавлен в рекламную сеть Arsenal Profi и теперь виден рекламодателям.\n\nОткройте Ad Center → Биржа → Мои каналы для управления.`
               : `✅ *Your channel approved!*\n\nYour channel is now live in Arsenal Profi Ad Network and visible to advertisers.\n\nOpen Ad Center → Exchange → My Channels to manage.`)
      : (isRu ? `❌ *Канал не прошёл модерацию*\n\n${reason ? 'Причина: ' + reason : 'Не соответствует требованиям сети.'}\n\nОбратитесь в поддержку если считаете это ошибкой.`
               : `❌ *Channel rejected*\n\n${reason ? 'Reason: ' + reason : 'Does not meet network requirements.'}\n\nContact support if you think this is a mistake.`);

    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: owner.tg_chat_id, text, parse_mode: 'Markdown' })
    });
  } catch(e) {}
}

// ─── AI Channel Selection ──────────────────────────────────────────────────
router.post('/ai-suggest', authRequired, async (req, res) => {
  const db = getDb();
  const { description, budget_usd, target_audience, language } = req.body;

  if (!description || !budget_usd) return res.status(400).json({ error: 'description and budget_usd required' });

  // Get all active channels
  const channels = db.prepare(`
    SELECT c.*, s.title, s.username, s.type as channel_type
    FROM adx_channels c
    JOIN ad_sources s ON s.id=c.source_id
    WHERE c.status='active' AND c.in_network=1
    ORDER BY c.rating DESC, c.member_count DESC
    LIMIT 50
  `).all();

  if (channels.length === 0) return res.json({ success: true, suggestions: [], message: 'No channels in network yet' });

  // Build channels summary for AI
  const channelsSummary = channels.map(ch => {
    let cats = [];
    try { cats = JSON.parse(ch.categories || '[]'); } catch(e) {}
    return `ID:${ch.id} | ${ch.title} | ${ch.member_count} subs | ER:${ch.engagement_rate||0}% | Lang:${ch.language} | Categories:${cats.join(',')} | Rating:${ch.rating}`;
  }).join('\n');

  const prompt = `You are an advertising consultant for a Telegram ad marketplace.

ADVERTISER REQUEST:
- What to advertise: ${description}
- Total budget: $${budget_usd}
- Target audience: ${target_audience || 'not specified'}
- Preferred language: ${language || 'any'}

AVAILABLE CHANNELS:
${channelsSummary}

Select the BEST 3-5 channels for this advertisement. Consider:
1. Category relevance to what's being advertised
2. Channel language matches target audience
3. Budget feasibility (total must fit within $${budget_usd})
4. Engagement rate and subscriber count quality over quantity
5. Channel rating

Respond in JSON format:
{
  "suggestions": [
    {
      "channel_id": <id>,
      "reason_ru": "<why this channel in Russian>",
      "reason_en": "<why in English>",
      "suggested_price": <suggested price USD for 24h>,
      "suggested_hours": <24 or 48>
    }
  ],
  "total_suggested_budget": <sum of all prices>,
  "strategy_ru": "<brief campaign strategy in Russian>",
  "strategy_en": "<brief strategy in English>"
}`;

  try {
    const Groq = require('groq-sdk');
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500
    });

    const raw = completion.choices[0].message.content;
    let result;
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestions: [], error: 'parse_error' };
    } catch(e) { result = { suggestions: [], error: 'parse_error', raw }; }

    // Enrich with channel data
    if (result.suggestions) {
      result.suggestions = result.suggestions.map(s => {
        const ch = channels.find(c => c.id === s.channel_id);
        if (!ch) return s;
        let cats = [];
        try { cats = JSON.parse(ch.categories || '[]'); } catch(e) {}
        return { ...s, channel: { ...ch, categories: cats } };
      }).filter(s => s.channel);
    }

    res.json({ success: true, ...result });
  } catch(e) {
    console.error('[ADX AI] Error:', e.message);
    // Fallback: return top channels by rating
    const fallback = channels.slice(0, 5).map(ch => {
      let cats = [];
      try { cats = JSON.parse(ch.categories || '[]'); } catch(e) {}
      return {
        channel_id: ch.id,
        reason_ru: 'Популярный канал с высоким рейтингом',
        reason_en: 'Popular channel with high rating',
        suggested_price: Math.min(parseFloat(budget_usd) / 3, 50),
        suggested_hours: 24,
        channel: { ...ch, categories: cats }
      };
    });
    res.json({ success: true, suggestions: fallback, strategy_ru: 'Автоподбор (AI недоступен)', strategy_en: 'Auto-selection (AI unavailable)' });
  }
});

// Confirm AI suggestion (create orders for all suggested channels)
router.post('/ai-suggest/confirm', authRequired, async (req, res) => {
  const db = getDb();
  const userId = req.user.id;
  const { suggestions } = req.body; // Array of { channel_id, price_usd, hours, post_text, post_media_url, post_media_type, start_at }

  if (!suggestions || !suggestions.length) return res.status(400).json({ error: 'suggestions required' });

  // Check total balance
  const totalPrice = suggestions.reduce((sum, s) => sum + parseFloat(s.price_usd || 0), 0);
  const user = db.prepare('SELECT balance_usd FROM users WHERE id=?').get(userId);
  if (!user || user.balance_usd < totalPrice) {
    return res.status(400).json({ error: 'Insufficient balance', required: totalPrice, available: user?.balance_usd || 0 });
  }

  const createdOrders = [];
  const errors = [];

  for (const s of suggestions) {
    try {
      const channel = db.prepare(`
        SELECT c.*, src.title, src.tg_chat_id
        FROM adx_channels c JOIN ad_sources src ON src.id=c.source_id
        WHERE c.id=? AND c.status='active' AND c.in_network=1
      `).get(s.channel_id);
      if (!channel) { errors.push(`Channel ${s.channel_id} not found`); continue; }
      if (channel.user_id === userId) { errors.push(`Cannot advertise in own channel`); continue; }

      const price = parseFloat(s.price_usd);
      const hours = parseInt(s.hours || s.placement_hours || 24);
      const platformFee = +(price * PLATFORM_FEE).toFixed(4);
      const publisherEarnings = +(price - platformFee).toFixed(4);
      const startDate = s.start_at ? new Date(s.start_at) : new Date(Date.now() + 3600000);
      const endDate = new Date(startDate.getTime() + hours * 3600000);

      const r = db.transaction(() => {
        const ins = db.prepare(`
          INSERT INTO adx_orders (advertiser_user_id, channel_id, post_text, post_media_url, post_media_type, post_buttons,
            placement_hours, start_at, end_at, price_usd, platform_fee_usd, publisher_earnings, tg_channel_id, status)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending_approval')
        `).run(userId, s.channel_id, s.post_text, s.post_media_url || null, s.post_media_type || 'none',
          JSON.stringify(s.post_buttons || []), hours,
          startDate.toISOString(), endDate.toISOString(),
          price, platformFee, publisherEarnings, channel.tg_chat_id);

        const orderId = ins.lastInsertRowid;
        db.prepare('UPDATE users SET balance_usd=balance_usd-? WHERE id=?').run(price, userId);
        db.prepare('INSERT INTO adx_escrow (order_id, advertiser_user_id, amount) VALUES (?,?,?)').run(orderId, userId, price);
        db.prepare('INSERT INTO balance_transactions (user_id, amount, type, description) VALUES (?,?,?,?)').run(userId, -price, 'adx_escrow', `AI campaign order #${orderId}`);

        return orderId;
      })();

      createdOrders.push(r);
      const order = db.prepare('SELECT * FROM adx_orders WHERE id=?').get(r);
      notifyPublisher(order, channel, { id: userId }).catch(() => {});
    } catch(e) {
      errors.push(e.message);
    }
  }

  res.json({ success: true, created_orders: createdOrders, errors, total_charged: totalPrice });
});

module.exports = router;
module.exports.runMonitor = runMonitor;
