// Trendex ADX router (Phase A — read-only marketplace).
// Ported & adapted from banner-webapp/src/routes/adx.js.
// Balance translation: Arsenal used users.balance_usd (REAL, $); Trendex uses
// users.gift_balance_cents + users.earned_balance_cents (INTEGER, cents).
// User id: Arsenal req.user.id → Trendex req.webUser.id → map to planner.users.id via tg_id bridge.

const express = require('express');
const { getDb, ensureUser } = require('../planner/db/database');

const PLATFORM_FEE = 0.10;           // 10% — matches our ads module
const SPONSOR_SHARE = 0.05;          // 5% out of it goes to sponsor (ads parity)

function createAdxRouter(config, storage, requireAuth, bot) {
  const router = express.Router();

  // ---- Identity bridge: web user → planner user (synthetic tg_id = -webId if not linked)
  function plannerUserFor(webUser) {
    const db = getDb();
    let u;
    if (webUser.telegramUserId) {
      u = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(Number(webUser.telegramUserId));
      if (u) return u;
    }
    const syntheticTgId = -Math.abs(Number(webUser.id));
    u = db.prepare('SELECT * FROM users WHERE tg_id = ?').get(syntheticTgId);
    if (u) return u;
    // ensureUser creates default planner record
    return ensureUser({
      id: syntheticTgId,
      username: (webUser.email || 'user').split('@')[0],
      first_name: webUser.displayName || webUser.email || ('User ' + webUser.id),
    });
  }

  function centsToUsd(c) { return (c || 0) / 100; }

  // ============================================================
  // GET /api/adx/categories — public-ish but requires auth
  // ============================================================
  router.get('/categories', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const cats = db.prepare('SELECT * FROM adx_categories ORDER BY sort_order').all();
      res.json({ ok: true, categories: cats });
    } catch (e) {
      console.error('[adx/categories]', e.message);
      res.status(500).json({ ok: false, reason: 'categories_failed' });
    }
  });

  // ============================================================
  // GET /api/adx/marketplace — channel listing with filters
  // Params: q, category, min_price, max_price, min_members, sort
  // ============================================================
  router.get('/marketplace', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const { q, category, min_price, max_price, min_members, sort, page, limit } = req.query || {};
      const where = ["c.status = 'approved'", 'c.in_network = 1'];
      const args = [];
      if (category) { where.push("c.categories LIKE '%' || ? || '%'"); args.push(String(category)); }
      if (min_price) { where.push('c.price_24h >= ?'); args.push(Number(min_price)); }
      if (max_price) { where.push('c.price_24h <= ?'); args.push(Number(max_price)); }
      if (min_members) { where.push('c.member_count >= ?'); args.push(Number(min_members)); }
      const orderBy = {
        price_asc: 'c.price_24h ASC',
        price_desc: 'c.price_24h DESC',
        members_desc: 'c.member_count DESC',
        rating_desc: 'c.rating DESC',
        cpm_asc: 'c.cpm ASC',
      }[sort] || 'c.rating DESC, c.member_count DESC';
      const pageN = Math.max(1, Number(page) || 1);
      const lim = Math.min(50, Math.max(5, Number(limit) || 20));
      const offset = (pageN - 1) * lim;
      const rows = db.prepare(`
        SELECT c.id, c.source_id, c.categories, c.language, c.description,
               c.price_24h, c.price_48h, c.price_72h, c.cpm, c.min_order_hours,
               c.member_count, c.avg_views_per_post, c.engagement_rate, c.posts_per_day,
               c.rating, c.total_orders, c.accept_rate
        FROM adx_channels c
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
      `).all(...args, lim, offset);
      const total = db.prepare(`SELECT COUNT(*) as n FROM adx_channels c WHERE ${where.join(' AND ')}`).get(...args).n;
      res.json({ ok: true, items: rows, total, page: pageN, limit: lim });
    } catch (e) {
      console.error('[adx/marketplace]', e.message);
      res.status(500).json({ ok: false, reason: 'marketplace_failed' });
    }
  });

  // ============================================================
  // GET /api/adx/channels/my — advertiser's own registered channels
  // ============================================================
  router.get('/channels/my', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const rows = db.prepare(`SELECT * FROM adx_channels WHERE user_id = ? ORDER BY id DESC`).all(u.id);
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('[adx/channels/my]', e.message);
      res.status(500).json({ ok: false, reason: 'my_channels_failed' });
    }
  });

  // ============================================================
  // GET /api/adx/orders — as advertiser (my outgoing orders)
  // ============================================================
  router.get('/orders', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const rows = db.prepare(`
        SELECT o.*, ch.description AS channel_description, s.title AS source_title, s.url AS source_url
        FROM adx_orders o
        JOIN adx_channels ch ON ch.id = o.channel_id
        LEFT JOIN ad_sources s ON s.id = ch.source_id
        WHERE o.advertiser_user_id = ?
        ORDER BY o.id DESC LIMIT 100
      `).all(u.id);
      res.json({ ok: true, items: rows });
    } catch (e) {
      console.error('[adx/orders]', e.message);
      res.status(500).json({ ok: false, reason: 'orders_failed' });
    }
  });

  // ============================================================
  // GET /api/adx/earnings — as publisher (my incoming orders stats)
  // ============================================================
  router.get('/earnings', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const myChans = db.prepare('SELECT id FROM adx_channels WHERE user_id = ?').all(u.id).map((r) => r.id);
      if (!myChans.length) return res.json({ ok: true, orders: [], totals: { total_earned: 0, orders_count: 0 } });
      const placeholders = myChans.map(() => '?').join(',');
      const orders = db.prepare(`
        SELECT o.*, ch.description AS channel_description, s.title AS source_title
        FROM adx_orders o
        JOIN adx_channels ch ON ch.id = o.channel_id
        LEFT JOIN ad_sources s ON s.id = ch.source_id
        WHERE o.channel_id IN (${placeholders})
        ORDER BY o.id DESC LIMIT 100
      `).all(...myChans);
      const totals = db.prepare(`
        SELECT COALESCE(SUM(publisher_earnings), 0) AS total_earned, COUNT(*) AS orders_count
        FROM adx_orders WHERE channel_id IN (${placeholders}) AND status IN ('published','completed')
      `).get(...myChans);
      res.json({ ok: true, orders, totals });
    } catch (e) {
      console.error('[adx/earnings]', e.message);
      res.status(500).json({ ok: false, reason: 'earnings_failed' });
    }
  });

  // ============================================================
  // POST /api/adx/channels/register  /* [adx-register-real] */
  // body: { username, categories: [], language?, description?,
  //         price_24h, price_48h?, price_72h?, min_order_hours? }
  // ============================================================
  router.post('/channels/register', requireAuth, express.json({ limit: '128kb' }), async (req, res) => {
    try {
      if (!bot || !bot.api) {
        return res.status(503).json({ ok: false, reason: 'bot_unavailable' });
      }
      const u = plannerUserFor(req.webUser);
      const body = req.body || {};
      const usernameRaw = String(body.username || '').trim().replace(/^[@/]+/, '').replace(/^https?:\/\/t\.me\//i, '');
      const categories = Array.isArray(body.categories) ? body.categories.filter(Boolean).slice(0, 5) : [];
      const language = String(body.language || 'ru').slice(0, 6);
      const descIn = String(body.description || '').slice(0, 500);
      const price24 = Math.max(1, Math.min(100000, Number(body.price_24h) || 0));
      const price48 = Math.max(0, Number(body.price_48h) || price24 * 1.7);
      const price72 = Math.max(0, Number(body.price_72h) || price24 * 2.3);
      const minHours = Math.max(1, Math.min(168, Number(body.min_order_hours) || 24));

      if (!usernameRaw) return res.status(400).json({ ok: false, reason: 'username_required' });
      if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(usernameRaw)) {
        return res.status(400).json({ ok: false, reason: 'username_invalid', detail: 'Username должен быть 5-32 символа: буквы, цифры, _' });
      }
      if (!categories.length) return res.status(400).json({ ok: false, reason: 'category_required' });
      if (!(price24 > 0)) return res.status(400).json({ ok: false, reason: 'price_required' });

      // Step 1: resolve @username via Telegram API
      let chat;
      try {
        chat = await bot.api.getChat('@' + usernameRaw);
      } catch (e) {
        const msg = e && e.message ? e.message.toLowerCase() : '';
        if (msg.includes('not found') || msg.includes('chat not found')) {
          return res.status(404).json({ ok: false, reason: 'channel_not_found',
            detail: '@' + usernameRaw + ' не найден. Проверь username.' });
        }
        console.error('[adx/register] getChat failed:', e && e.message);
        return res.status(502).json({ ok: false, reason: 'tg_api_failed', detail: e.message });
      }
      if (chat.type !== 'channel' && chat.type !== 'supergroup') {
        return res.status(400).json({ ok: false, reason: 'not_a_channel',
          detail: 'Это не канал/супергруппа (type=' + chat.type + ').' });
      }

      // Step 2: verify bot is admin in this channel
      let botStatus = null;
      try {
        const me = await bot.api.getMe();
        const member = await bot.api.getChatMember(chat.id, me.id);
        botStatus = member.status;
      } catch (e) {
        console.warn('[adx/register] getChatMember failed:', e && e.message);
      }
      if (!['administrator', 'creator'].includes(botStatus)) {
        return res.status(403).json({ ok: false, reason: 'bot_not_admin',
          detail: 'Бот @Trendex_bizbot должен быть администратором канала. Добавь его в канал и дай право публиковать сообщения.' });
      }

      // Step 3: verify the registering user is admin/creator of this channel
      // (bot can check chat administrators if it has the right; otherwise we trust based on
      // ownership claim — but we still log it for audit)
      let isOwner = false;
      try {
        const tgId = req.webUser && req.webUser.telegramUserId;
        if (tgId) {
          const m = await bot.api.getChatMember(chat.id, Number(tgId));
          isOwner = ['administrator', 'creator'].includes(m.status);
        }
      } catch (_) { /* tg may refuse the call without bot rights — non-fatal */ }
      if (!isOwner && req.webUser && req.webUser.telegramUserId) {
        return res.status(403).json({ ok: false, reason: 'not_channel_admin',
          detail: 'Ты должен быть админом этого канала (бот видит твой TG-аккаунт там).' });
      }

      // Step 4: fetch member count
      let memberCount = 0;
      try { memberCount = await bot.api.getChatMemberCount(chat.id); } catch (_) {}

      // Step 5: dedup — if this user already registered the same chat, return its row
      const db = getDb();
      const existing = db.prepare(
        `SELECT s.id AS source_id, c.id AS channel_id FROM ad_sources s
          LEFT JOIN adx_channels c ON c.source_id = s.id
          WHERE s.tg_chat_id=? AND s.user_id=?`
      ).get(String(chat.id), u.id);
      if (existing && existing.channel_id) {
        return res.json({ ok: true, channel_id: existing.channel_id, already: true });
      }

      // Step 6: insert ad_sources + adx_channels (transaction)
      const desc = descIn || (chat.description ? String(chat.description).slice(0, 500) : '');
      const tx = db.transaction(() => {
        let sourceId;
        if (existing && existing.source_id) {
          sourceId = existing.source_id;
          db.prepare(`UPDATE ad_sources SET title=?, username=?, member_count=?, bot_is_admin=1, description=? WHERE id=?`)
            .run(chat.title || '@' + usernameRaw, usernameRaw, memberCount, desc, sourceId);
        } else {
          const r = db.prepare(`
            INSERT INTO ad_sources (user_id, type, tg_chat_id, title, username, member_count, bot_is_admin, status, description)
            VALUES (?, 'tg_channel', ?, ?, ?, ?, 1, 'active', ?)
          `).run(u.id, String(chat.id), chat.title || '@' + usernameRaw, usernameRaw, memberCount, desc);
          sourceId = r.lastInsertRowid;
        }

        // Trust-based status: trusted users → approved + in_network, others → pending
        const _trustScore = require('../services/trust-score');
        const trusted = _trustScore.isTrusted(req.webUser.id);
        const status = trusted ? 'approved' : 'pending';
        const inNet = trusted ? 1 : 0;

        const cpm = memberCount > 0 ? +(price24 * 1000 / memberCount).toFixed(4) : 0;

        const r2 = db.prepare(`
          INSERT INTO adx_channels (source_id, user_id, status, in_network,
            categories, language, description,
            price_24h, price_48h, price_72h, cpm, min_order_hours,
            member_count, avg_views_per_post, engagement_rate, posts_per_day,
            rating, total_orders, total_earnings, accept_rate)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 5.0, 0, 0, 100)
        `).run(sourceId, u.id, status, inNet, JSON.stringify(categories),
                language, desc, price24, price48, price72, cpm, minHours, memberCount);
        return r2.lastInsertRowid;
      });
      const channelId = tx();

      // Notify admins on pending
      const ADMIN_TG = String(process.env.ADMIN_TG_IDS || '424077439,1361064246,248745860')
        .split(',').map(s => Number(s.trim())).filter(Boolean);
      try {
        const _trustScore = require('../services/trust-score');
        const trusted = _trustScore.isTrusted(req.webUser.id);
        if (!trusted && bot && bot.api) {
          for (const a of ADMIN_TG) {
            bot.api.sendMessage(a,
              '📥 <b>Новый канал на ADX-модерацию</b>\n\n' +
              'User: <b>' + (req.webUser.email || req.webUser.id) + '</b>\n' +
              'Канал: @' + usernameRaw + ' · ' + memberCount + ' подписчиков\n' +
              'Цена/24ч: $' + price24,
              { parse_mode: 'HTML' }).catch(() => {});
          }
        }
      } catch (_) {}

      const row = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(channelId);
      return res.json({ ok: true, channel: row });
    } catch (e) {
      console.error('[adx/register]', e && e.message);
      return res.status(500).json({ ok: false, reason: 'register_failed', detail: e && e.message });
    }
  });

  // DELETE /api/adx/channels/:id — soft remove (advertiser cancels listing)
  router.delete('/channels/:id', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const id = Number(req.params.id);
      const r = db.prepare(`UPDATE adx_channels SET status='deleted', in_network=0 WHERE id=? AND user_id=?`)
        .run(id, u.id);
      return res.json({ ok: r.changes > 0 });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // ============================================================
  // ORDER FLOW  /* [adx-orders-real] */
  // POST /api/adx/orders   — create order, charge advertiser, notify publisher
  // POST /api/adx/orders/:id/accept   — publisher accepts; bot autoposts to channel
  // POST /api/adx/orders/:id/decline  — publisher rejects; advertiser refunded
  // POST /api/adx/orders/:id/cancel   — advertiser cancels pending; refund
  // ============================================================
  function _priceForHours(ch, hours) {
    if (hours <= 24) return Number(ch.price_24h) || 0;
    if (hours <= 48) return Number(ch.price_48h) || (Number(ch.price_24h) * 1.7);
    return Number(ch.price_72h) || (Number(ch.price_24h) * 2.3);
  }
  function _toCents(usd) { return Math.round(Number(usd || 0) * 100); }
  function _fromCents(c) { return Math.round(Number(c || 0)) / 100; }

  function _chargeGift(db, userId, cents, note) {
    const u = db.prepare('SELECT gift_balance_cents FROM users WHERE id=?').get(userId);
    if (!u) throw new Error('user_not_found');
    const have = Number(u.gift_balance_cents || 0);
    if (have < cents) {
      const e = new Error('insufficient_balance');
      e.code = 'INSUFFICIENT';
      e.have = have; e.need = cents;
      throw e;
    }
    db.prepare('UPDATE users SET gift_balance_cents = gift_balance_cents - ? WHERE id=?').run(cents, userId);
    return have - cents;
  }
  function _creditGift(db, userId, cents) {
    db.prepare('UPDATE users SET gift_balance_cents = gift_balance_cents + ? WHERE id=?').run(cents, userId);
  }
  function _creditEarned(db, userId, cents) {
    db.prepare('UPDATE users SET earned_balance_cents = earned_balance_cents + ? WHERE id=?').run(cents, userId);
  }
  function _logEvent(db, orderId, event, details) {
    try {
      db.prepare('INSERT INTO adx_order_events (order_id, event, details) VALUES (?,?,?)').run(orderId, event, details ? JSON.stringify(details) : null);
    } catch (_) {}
  }

  router.post('/orders', requireAuth, express.json({ limit: '32kb' }), async (req, res) => {
    try {
      const db = getDb();
      const advertiser = plannerUserFor(req.webUser);
      const body = req.body || {};
      const channelId = Number(body.channel_id);
      const placementHours = [24, 48, 72].includes(Number(body.placement_hours)) ? Number(body.placement_hours) : 24;
      const postText = String(body.post_text || '').trim();
      const mediaUrl = body.media_url ? String(body.media_url).trim().slice(0, 500) : null;
      const advertiserNote = String(body.advertiser_note || '').slice(0, 300);

      if (!channelId) return res.status(400).json({ ok: false, reason: 'channel_required' });
      if (postText.length < 10) return res.status(400).json({ ok: false, reason: 'post_too_short', detail: 'Текст поста минимум 10 символов.' });
      if (postText.length > 3500) return res.status(400).json({ ok: false, reason: 'post_too_long', detail: 'Максимум 3500 символов.' });

      const ch = db.prepare('SELECT * FROM adx_channels WHERE id=?').get(channelId);
      if (!ch || ch.status !== 'approved' || !ch.in_network) {
        return res.status(404).json({ ok: false, reason: 'channel_not_available' });
      }
      if (Number(ch.user_id) === Number(advertiser.id)) {
        return res.status(400).json({ ok: false, reason: 'self_order_forbidden', detail: 'Нельзя заказать рекламу в собственном канале.' });
      }
      if (placementHours < Number(ch.min_order_hours)) {
        return res.status(400).json({ ok: false, reason: 'duration_too_short',
          detail: 'Этот канал принимает заказы от ' + ch.min_order_hours + ' часов.' });
      }

      const priceUsd = +(_priceForHours(ch, placementHours)).toFixed(2);
      const priceCents = _toCents(priceUsd);
      const platformFeeCents = Math.round(priceCents * PLATFORM_FEE);
      const publisherCents = priceCents - platformFeeCents;

      // Charge + create order in one transaction
      const tx = db.transaction(() => {
        _chargeGift(db, advertiser.id, priceCents, 'adx_order_escrow');
        const r = db.prepare(`
          INSERT INTO adx_orders (advertiser_user_id, channel_id, post_text, post_media_url, post_media_type,
            placement_hours, price_usd, platform_fee_usd, publisher_earnings, status, advertiser_note)
          VALUES (?,?,?,?,?,?,?,?,?, 'pending_approval', ?)
        `).run(advertiser.id, channelId, postText, mediaUrl, mediaUrl ? 'photo' : 'none',
                placementHours, priceUsd, _fromCents(platformFeeCents), _fromCents(publisherCents), advertiserNote);
        const oid = r.lastInsertRowid;
        db.prepare(`
          INSERT INTO adx_escrow (order_id, advertiser_user_id, amount, status) VALUES (?,?,?, 'held')
        `).run(oid, advertiser.id, priceUsd);
        _logEvent(db, oid, 'created', { price: priceUsd, hours: placementHours });
        return oid;
      });
      let orderId;
      try { orderId = tx(); }
      catch (e) {
        if (e.code === 'INSUFFICIENT') return res.status(402).json({ ok: false, reason: 'insufficient_balance',
          detail: 'Не хватает рекламного баланса. Нужно $' + priceUsd + ', есть $' + _fromCents(e.have) });
        throw e;
      }

      // Notify publisher in TG
      try {
        const publisher = db.prepare('SELECT tg_id FROM users WHERE id=?').get(ch.user_id);
        if (publisher && publisher.tg_id > 0 && bot && bot.api) {
          const msg = '📥 <b>Новый заказ ADX</b>\n\n'
            + 'Канал: ' + (ch.description ? ch.description.slice(0, 80) : 'Канал #' + ch.id) + '\n'
            + 'Длительность: ' + placementHours + 'ч\n'
            + 'Твой доход: <b>$' + _fromCents(publisherCents).toFixed(2) + '</b>\n\n'
            + 'Открой заявку и подтверди публикацию: https://trendex.biz/cabinet#/ads-earn';
          bot.api.sendMessage(publisher.tg_id, msg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(() => {});
        }
      } catch (_) {}

      const order = db.prepare('SELECT * FROM adx_orders WHERE id=?').get(orderId);
      return res.json({ ok: true, order });
    } catch (e) {
      console.error('[adx/orders create]', e && e.message);
      return res.status(500).json({ ok: false, reason: 'create_failed', detail: e && e.message });
    }
  });

  // Publisher accepts → bot publishes
  router.post('/orders/:id/accept', requireAuth, async (req, res) => {
    try {
      if (!bot || !bot.api) return res.status(503).json({ ok: false, reason: 'bot_unavailable' });
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const id = Number(req.params.id);
      const o = db.prepare(`
        SELECT o.*, c.user_id AS publisher_id, s.tg_chat_id, s.title AS channel_title
        FROM adx_orders o
        JOIN adx_channels c ON c.id = o.channel_id
        LEFT JOIN ad_sources s ON s.id = c.source_id
        WHERE o.id=?
      `).get(id);
      if (!o) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (Number(o.publisher_id) !== Number(u.id)) return res.status(403).json({ ok: false, reason: 'not_publisher' });
      if (o.status !== 'pending_approval') return res.status(400).json({ ok: false, reason: 'wrong_status', current: o.status });
      if (!o.tg_chat_id) return res.status(500).json({ ok: false, reason: 'channel_missing_chat_id' });

      // Publish via bot
      let sent;
      try {
        if (o.post_media_url && o.post_media_type === 'photo') {
          sent = await bot.api.sendPhoto(o.tg_chat_id, o.post_media_url, { caption: o.post_text, parse_mode: 'HTML' });
        } else {
          sent = await bot.api.sendMessage(o.tg_chat_id, o.post_text, { parse_mode: 'HTML', disable_web_page_preview: false });
        }
      } catch (e) {
        console.error('[adx/accept] sendMessage failed:', e && e.message);
        return res.status(502).json({ ok: false, reason: 'publish_failed', detail: e && e.message });
      }

      const start = Date.now();
      const end = start + Number(o.placement_hours) * 3600 * 1000;
      const startIso = new Date(start).toISOString();
      const endIso = new Date(end).toISOString();
      db.prepare(`
        UPDATE adx_orders SET status='published', tg_message_id=?, tg_channel_id=?,
          start_at=?, end_at=?, publisher_decision='accept', publisher_decision_at=datetime('now'), updated_at=datetime('now')
        WHERE id=?
      `).run(sent.message_id, String(o.tg_chat_id), startIso, endIso, id);
      db.prepare(`UPDATE adx_channels SET total_orders = total_orders + 1 WHERE id=?`).run(o.channel_id);
      _logEvent(db, id, 'published', { tg_message_id: sent.message_id, end_at: endIso });

      // Notify advertiser
      try {
        const adv = db.prepare('SELECT tg_id FROM users WHERE id=?').get(o.advertiser_user_id);
        if (adv && adv.tg_id > 0) {
          bot.api.sendMessage(adv.tg_id,
            '✅ <b>Твой пост опубликован</b>\n\nКанал: ' + (o.channel_title || '#' + o.channel_id)
            + '\nДлительность: ' + o.placement_hours + 'ч\nЗакрытие: ' + endIso.replace('T',' ').slice(0,16) + ' UTC',
            { parse_mode: 'HTML' }).catch(() => {});
        }
      } catch (_) {}

      return res.json({ ok: true, message_id: sent.message_id, end_at: endIso });
    } catch (e) {
      console.error('[adx/accept]', e && e.message);
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // Publisher declines → refund advertiser
  router.post('/orders/:id/decline', requireAuth, express.json({ limit: '4kb' }), (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const id = Number(req.params.id);
      const reason = String((req.body && req.body.reason) || '').slice(0, 200);
      const o = db.prepare(`
        SELECT o.*, c.user_id AS publisher_id FROM adx_orders o
        JOIN adx_channels c ON c.id = o.channel_id WHERE o.id=?
      `).get(id);
      if (!o) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (Number(o.publisher_id) !== Number(u.id)) return res.status(403).json({ ok: false, reason: 'not_publisher' });
      if (o.status !== 'pending_approval') return res.status(400).json({ ok: false, reason: 'wrong_status' });

      const tx = db.transaction(() => {
        _creditGift(db, o.advertiser_user_id, _toCents(o.price_usd));
        db.prepare(`UPDATE adx_orders SET status='rejected', publisher_decision='decline', publisher_note=?, publisher_decision_at=datetime('now'), updated_at=datetime('now') WHERE id=?`)
          .run(reason, id);
        db.prepare(`UPDATE adx_escrow SET status='refunded', released_at=datetime('now'), released_to=? WHERE order_id=?`)
          .run(o.advertiser_user_id, id);
        _logEvent(db, id, 'declined', { reason });
      });
      tx();

      try {
        const adv = db.prepare('SELECT tg_id FROM users WHERE id=?').get(o.advertiser_user_id);
        if (adv && adv.tg_id > 0 && bot && bot.api) {
          bot.api.sendMessage(adv.tg_id,
            '❌ <b>Заказ ADX отклонён</b>\n\n' + (reason ? 'Причина: ' + reason + '\n' : '')
            + 'Возврат: $' + Number(o.price_usd).toFixed(2) + ' зачислен на твой рекламный баланс.',
            { parse_mode: 'HTML' }).catch(() => {});
        }
      } catch (_) {}
      return res.json({ ok: true, refunded: o.price_usd });
    } catch (e) {
      console.error('[adx/decline]', e && e.message);
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // Advertiser cancels (pending only)
  router.post('/orders/:id/cancel', requireAuth, (req, res) => {
    try {
      const db = getDb();
      const u = plannerUserFor(req.webUser);
      const id = Number(req.params.id);
      const o = db.prepare('SELECT * FROM adx_orders WHERE id=?').get(id);
      if (!o) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (Number(o.advertiser_user_id) !== Number(u.id)) return res.status(403).json({ ok: false, reason: 'not_owner' });
      if (o.status !== 'pending_approval') return res.status(400).json({ ok: false, reason: 'wrong_status' });

      const tx = db.transaction(() => {
        _creditGift(db, o.advertiser_user_id, _toCents(o.price_usd));
        db.prepare(`UPDATE adx_orders SET status='cancelled', updated_at=datetime('now') WHERE id=?`).run(id);
        db.prepare(`UPDATE adx_escrow SET status='refunded', released_at=datetime('now'), released_to=? WHERE order_id=?`)
          .run(o.advertiser_user_id, id);
        _logEvent(db, id, 'cancelled', null);
      });
      tx();
      return res.json({ ok: true, refunded: o.price_usd });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // ─ Cron: complete published orders past end_at; release escrow → publisher earned_balance
  function _completeExpired() {
    try {
      const db = getDb();
      const now = new Date().toISOString();
      const expired = db.prepare(`
        SELECT o.*, c.user_id AS publisher_id FROM adx_orders o
        JOIN adx_channels c ON c.id = o.channel_id
        WHERE o.status='published' AND o.end_at IS NOT NULL AND o.end_at <= ?
      `).all(now);
      for (const o of expired) {
        const tx = db.transaction(() => {
          _creditEarned(db, o.publisher_id, _toCents(o.publisher_earnings));
          db.prepare(`UPDATE adx_orders SET status='completed', updated_at=datetime('now') WHERE id=?`).run(o.id);
          db.prepare(`UPDATE adx_escrow SET status='released', released_at=datetime('now'), released_to=? WHERE order_id=?`)
            .run(o.publisher_id, o.id);
          db.prepare(`UPDATE adx_channels SET total_earnings = total_earnings + ? WHERE id=?`).run(o.publisher_earnings, o.channel_id);
          _logEvent(db, o.id, 'completed', { publisher_earnings: o.publisher_earnings });
        });
        try { tx(); } catch (e) { console.warn('[adx-cron] complete failed for', o.id, ':', e.message); }
      }
      if (expired.length) console.log('[adx-cron] completed', expired.length, 'orders');
    } catch (e) {
      console.warn('[adx-cron] tick err:', e && e.message);
    }
  }
  router._adxCompleteExpired = _completeExpired;

  // ============================================================
  // GET /api/adx/health — simple probe
  // ============================================================
  router.get('/health', (_req, res) => {
    try {
      const db = getDb();
      const n = db.prepare('SELECT COUNT(*) AS n FROM adx_categories').get().n;
      res.json({ ok: true, phase: 'A', categories: n });
    } catch (e) {
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  return router;
}

module.exports = { createAdxRouter };
