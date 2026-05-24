/**
 * Ad Center — Центр управления рекламой
 * /opt/banner-webapp/src/routes/ad-center.js
 * Регистрация: app.use('/api/ad-center', require('./src/routes/ad-center'));
 */
const express = require('express');
const { getDb } = require('../database');
const { authRequired } = require('../middleware/auth');
const { checkLimit, trackUsage } = require('../helpers/usage-limits');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fetch = require('node-fetch');

const publisher = require('../services/ad-publisher');
const aiWriter = require('../services/ad-ai-writer');
const transcriber = require('../services/ad-transcriber');
const videoComposer = require('../services/ad-video-composer');

const router = express.Router();

const MEDIA_UPLOAD_DIR = path.join('/app', 'public', 'uploads', 'ad-media');
if (!fs.existsSync(MEDIA_UPLOAD_DIR)) fs.mkdirSync(MEDIA_UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: MEDIA_UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const ok = /\.(mp4|mov|avi|webm|jpg|jpeg|png|gif|webp)$/i;
    if (ok.test(file.originalname)) cb(null, true);
    else cb(new Error('Unsupported file type'));
  }
});

// ════════════════════════════════════════
// КАМПАНИИ
// ════════════════════════════════════════

router.get('/campaigns', authRequired, (req, res) => {
  try {
    const db = getDb();
    const campaigns = db.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM ad_campaign_sources WHERE campaign_id=c.id) as sources_count,
        (SELECT COUNT(*) FROM ad_posts WHERE campaign_id=c.id) as posts_count,
        (SELECT COUNT(*) FROM ad_posts WHERE campaign_id=c.id AND status='sent') as sent_count,
        (SELECT COUNT(*) FROM ad_schedules WHERE campaign_id=c.id AND status='active') as active_schedules
      FROM ad_campaigns c
      WHERE c.user_id=? AND c.status!='deleted'
      ORDER BY c.updated_at DESC
    `).all(req.user.id);
    res.json({ success: true, campaigns });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/campaigns', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });

    const r = db.prepare(`INSERT INTO ad_campaigns (user_id, name, description) VALUES (?, ?, ?)`)
      .run(req.user.id, name, description || '');
    const campaign = db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, campaign });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/campaigns/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const c = db.prepare('SELECT * FROM ad_campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ success: false, error: 'Not found' });

    const { name, description, status } = req.body;
    if (name) db.prepare('UPDATE ad_campaigns SET name=?, updated_at=datetime(\'now\') WHERE id=?').run(name, c.id);
    if (description !== undefined) db.prepare('UPDATE ad_campaigns SET description=?, updated_at=datetime(\'now\') WHERE id=?').run(description, c.id);
    if (status) db.prepare('UPDATE ad_campaigns SET status=?, updated_at=datetime(\'now\') WHERE id=?').run(status, c.id);

    const updated = db.prepare('SELECT * FROM ad_campaigns WHERE id=?').get(c.id);
    res.json({ success: true, campaign: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/campaigns/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const c = db.prepare('SELECT * FROM ad_campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ success: false, error: 'Not found' });
    db.prepare('UPDATE ad_campaigns SET status=\'deleted\', updated_at=datetime(\'now\') WHERE id=?').run(c.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ИСТОЧНИКИ (каналы/чаты TG)
// ════════════════════════════════════════

router.get('/sources', authRequired, (req, res) => {
  try {
    const db = getDb();
    const sources = db.prepare('SELECT * FROM ad_sources WHERE user_id=? AND status!=\'removed\' ORDER BY added_at DESC')
      .all(req.user.id);
    res.json({ success: true, sources });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/sources/add', authRequired, async (req, res) => {
  try {
    const _lim_adcenter_sources = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'adcenter.sources');
    if (!_lim_adcenter_sources.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'adcenter.sources', used: _lim_adcenter_sources.used, limit: _lim_adcenter_sources.limit, plan: _lim_adcenter_sources.plan });
    const db = getDb();
    const { chat_id } = req.body;
    if (!chat_id) return res.status(400).json({ success: false, error: 'chat_id required (e.g. @channelname or -100xxxx)' });

    // Проверяем бота в канале
    const check = await publisher.checkBotAdmin(chat_id);
    if (!check.ok) return res.status(400).json({ success: false, error: check.error });

    // Дубликат?
    const exists = db.prepare('SELECT id FROM ad_sources WHERE user_id=? AND tg_chat_id=? AND status!=\'removed\'')
      .get(req.user.id, String(check.chat.id));
    if (exists) return res.status(400).json({ success: false, error: 'Source already added' });

    const r = db.prepare(`INSERT INTO ad_sources (user_id, type, tg_chat_id, title, username, member_count, bot_is_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      req.user.id,
      check.chat.type === 'channel' ? 'tg_channel' : 'tg_group',
      String(check.chat.id),
      check.chat.title,
      check.chat.username || '',
      check.chat.member_count || 0,
      check.bot_is_admin ? 1 : 0
    );

    const source = db.prepare('SELECT * FROM ad_sources WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, source, bot_is_admin: check.bot_is_admin });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/sources/:id/check', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const s = db.prepare('SELECT * FROM ad_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ success: false, error: 'Not found' });

    const check = await publisher.checkBotAdmin(s.tg_chat_id);
    if (check.ok) {
      db.prepare('UPDATE ad_sources SET title=?, member_count=?, bot_is_admin=?, status=\'active\' WHERE id=?')
        .run(check.chat.title, check.chat.member_count, check.bot_is_admin ? 1 : 0, s.id);
    } else {
      db.prepare('UPDATE ad_sources SET status=\'disconnected\' WHERE id=?').run(s.id);
    }

    res.json({ success: true, ...check });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/sources/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE ad_sources SET status=\'removed\' WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ПРИВЯЗКА ИСТОЧНИКОВ К КАМПАНИИ
// ════════════════════════════════════════

router.get('/campaigns/:id/sources', authRequired, (req, res) => {
  try {
    const db = getDb();
    const c = db.prepare('SELECT id FROM ad_campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const sources = db.prepare(`
      SELECT s.*, cs.id as link_id
      FROM ad_sources s
      JOIN ad_campaign_sources cs ON cs.source_id=s.id
      WHERE cs.campaign_id=? AND s.status!='removed'
    `).all(c.id);
    res.json({ success: true, sources });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/campaigns/:id/sources', authRequired, (req, res) => {
  try {
    const db = getDb();
    const c = db.prepare('SELECT id FROM ad_campaigns WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!c) return res.status(404).json({ success: false, error: 'Campaign not found' });

    const { source_ids } = req.body;
    if (!Array.isArray(source_ids)) return res.status(400).json({ success: false, error: 'source_ids array required' });

    const ins = db.prepare('INSERT OR IGNORE INTO ad_campaign_sources (campaign_id, source_id) VALUES (?, ?)');
    const addMany = db.transaction((ids) => { for (const id of ids) ins.run(c.id, id); });
    addMany(source_ids);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/campaigns/:cid/sources/:sid', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM ad_campaign_sources WHERE campaign_id=? AND source_id=?')
      .run(req.params.cid, req.params.sid);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ПОСТЫ / ОБЪЯВЛЕНИЯ
// ════════════════════════════════════════

router.get('/posts', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { campaign_id, type, status, limit: lim } = req.query;

    let sql = 'SELECT * FROM ad_posts WHERE user_id=?';
    const params = [req.user.id];

    if (campaign_id) { sql += ' AND campaign_id=?'; params.push(campaign_id); }
    if (type) { sql += ' AND type=?'; params.push(type); }
    if (status) { sql += ' AND status=?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    if (lim) { sql += ' LIMIT ?'; params.push(parseInt(lim) || 50); }

    const posts = db.prepare(sql).all(...params);
    // parse JSON fields
    for (const p of posts) {
      try { p.links = JSON.parse(p.links); } catch (e) { p.links = []; }
      try { p.video_sources = JSON.parse(p.video_sources); } catch (e) { p.video_sources = []; }
    }
    res.json({ success: true, posts });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/posts/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Not found' });
    try { post.links = JSON.parse(post.links); } catch (e) { post.links = []; }
    try { post.video_sources = JSON.parse(post.video_sources); } catch (e) { post.video_sources = []; }

    const deliveries = db.prepare('SELECT ps.*, s.title as source_title, s.username as source_username FROM ad_post_sources ps JOIN ad_sources s ON s.id=ps.source_id WHERE ps.post_id=?').all(post.id);
    res.json({ success: true, post, deliveries });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/posts', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { campaign_id, title, text_original, text_generated, text_final,
      media_type, media_url, media_source, links, video_sources, type } = req.body;

    const r = db.prepare(`INSERT INTO ad_posts
      (user_id, campaign_id, title, text_original, text_generated, text_final,
       media_type, media_url, media_source, links, video_sources, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
      .run(
        req.user.id,
        campaign_id || null,
        title || '',
        text_original || '',
        text_generated || '',
        text_final || text_generated || text_original || '',
        media_type || null,
        media_url || null,
        media_source || null,
        JSON.stringify(links || []),
        JSON.stringify(video_sources || []),
        type || 'instant'
      );

    const post = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, post });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/posts/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const p = db.prepare('SELECT id FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!p) return res.status(404).json({ success: false, error: 'Not found' });

    const fields = ['title', 'text_original', 'text_generated', 'text_final',
      'media_type', 'media_url', 'media_source', 'status', 'type', 'transcription_text'];
    const jsonFields = ['links', 'video_sources'];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        db.prepare(`UPDATE ad_posts SET ${f}=? WHERE id=?`).run(req.body[f], p.id);
      }
    }
    for (const f of jsonFields) {
      if (req.body[f] !== undefined) {
        db.prepare(`UPDATE ad_posts SET ${f}=? WHERE id=?`).run(JSON.stringify(req.body[f]), p.id);
      }
    }

    const updated = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(p.id);
    res.json({ success: true, post: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/posts/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM ad_posts WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ДЕЙСТВИЯ С ПОСТАМИ
// ════════════════════════════════════════

// Мгновенная рассылка
router.post('/posts/:id/send', authRequired, async (req, res) => {
  try {
    const _lim_adcenter_send = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'adcenter.send');
    if (!_lim_adcenter_send.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'adcenter.send', used: _lim_adcenter_send.used, limit: _lim_adcenter_send.limit, plan: _lim_adcenter_send.plan });
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    let { source_ids } = req.body;

    // Если не указаны source_ids, берём все из кампании
    if ((!source_ids || !source_ids.length) && post.campaign_id) {
      const cs = db.prepare('SELECT source_id FROM ad_campaign_sources WHERE campaign_id=?').all(post.campaign_id);
      source_ids = cs.map(x => x.source_id);
    }

    if (!source_ids || !source_ids.length) {
      return res.status(400).json({ success: false, error: 'No sources selected' });
    }

    // Обновляем статус
    db.prepare('UPDATE ad_posts SET status=\'sending\' WHERE id=?').run(post.id);

    // Отвечаем сразу — рассылка идёт в фоне
    trackUsage(req.user.id, 'adcenter.send', 1);
    res.json({ success: true, total: source_ids.length, sent: 0, async: true, post_id: post.id });

    // Рассылка в фоне (не блокируем HTTP)
    publisher.broadcastPost(post.id, source_ids).then(result => {
      const statusStr = result.failed > 0 ? 'partial' : 'sent';
      db.prepare("UPDATE ad_posts SET status=? WHERE id=?").run(statusStr, post.id);
    }).catch(e => {
      console.error('[AD-CENTER] Broadcast error:', e.message);
      db.prepare("UPDATE ad_posts SET status='failed' WHERE id=?").run(post.id);
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Предпросмотр (отправка себе)
router.post('/posts/:id/preview', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const user = db.prepare('SELECT tg_chat_id FROM users WHERE id=?').get(req.user.id);
    if (!user?.tg_chat_id) return res.status(400).json({ success: false, error: 'Connect Telegram first (/connect in bot)' });

    const fakeSource = { tg_chat_id: user.tg_chat_id, title: 'Preview' };
    const result = await publisher.sendToSource(post, fakeSource);

    res.json({ success: result.ok, preview: true, message_id: result.result?.message_id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Дублировать пост
router.post('/posts/:id/duplicate', authRequired, (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Not found' });

    const r = db.prepare(`INSERT INTO ad_posts
      (user_id, campaign_id, title, text_original, text_generated, text_final,
       media_type, media_url, media_source, links, video_sources, type, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')`)
      .run(req.user.id, post.campaign_id, post.title || '', post.text_original,
        post.text_generated, post.text_final, post.media_type, post.media_url,
        post.media_source, post.links, post.video_sources, post.type);

    const dup = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, post: dup });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// AI рерайт текста поста
router.post('/posts/:id/ai-rewrite', authRequired, async (req, res) => {
  try {
    const _lim_ai_rewrite = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'ai.rewrite');
    if (!_lim_ai_rewrite.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'ai.rewrite', used: _lim_ai_rewrite.used, limit: _lim_ai_rewrite.limit, plan: _lim_ai_rewrite.plan });
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Not found' });

    const text = post.text_final || post.text_generated || post.text_original;
    if (!text) return res.status(400).json({ success: false, error: 'No text to rewrite' });

    const rewritten = await aiWriter.rewriteAdText({
      text, language: req.body.language || 'ru', tone: req.body.tone || 'selling', userId: req.user.id
    });

    db.prepare('UPDATE ad_posts SET text_generated=?, text_final=? WHERE id=?').run(rewritten, rewritten, post.id);
    trackUsage(req.user.id, 'ai.rewrite', 1);
    res.json({ success: true, text: rewritten });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// AI ГЕНЕРАЦИЯ ТЕКСТА
// ════════════════════════════════════════

router.post('/ai/generate-text', authRequired, async (req, res) => {
  try {
    const _lim_ai_text = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'ai.text');
    if (!_lim_ai_text.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'ai.text', used: _lim_ai_text.used, limit: _lim_ai_text.limit, plan: _lim_ai_text.plan });
    const { prompt, tone, length, language, links, productInfo, transcription } = req.body;
    if (!prompt && !transcription) return res.status(400).json({ success: false, error: 'Prompt or transcription required' });

    const text = await aiWriter.generateAdText({
      prompt, tone: tone || 'selling', length: length || 'medium',
      language: language || 'ru', links, productInfo, transcription,
      userId: req.user.id
    });

    trackUsage(req.user.id, 'ai.text', 1);
    res.json({ success: true, text });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ВИДЕО-ТРАНСКРИБАЦИЯ
// ════════════════════════════════════════

router.post('/video/transcribe', authRequired, async (req, res) => {
  try {
    const _lim_video_transcribe = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'video.transcribe');
    if (!_lim_video_transcribe.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'video.transcribe', used: _lim_video_transcribe.used, limit: _lim_video_transcribe.limit, plan: _lim_video_transcribe.plan });
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    // Инфо о видео
    let info = {};
    try { info = await transcriber.getVideoInfo(url); } catch (e) { /* ignore */ }

    // Транскрибация
    const result = await transcriber.transcribeFromUrl(url);

    trackUsage(req.user.id, 'video.transcribe', 1);
    res.json({ success: true, text: result.text, cached: result.cached, info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/video/info', authRequired, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    const info = await transcriber.getVideoInfo(url);
    res.json({ success: true, info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// ССЫЛКИ — сокращение и QR
// ════════════════════════════════════════

router.post('/links/shorten', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const { url, title } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    // Генерируем короткий код
    const code = crypto.randomBytes(3).toString('hex');
    const shortUrl = `https://t2gift.com/${code}`;

    db.prepare(`INSERT INTO short_links (user_id, code, destination_url, title)
      VALUES (?, ?, ?, ?)`)
      .run(req.user.id, code, url, title || url.substring(0, 100));

    res.json({ success: true, short_url: shortUrl, code });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/links/qr', authRequired, (req, res) => {
  try {
    const { url, size } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });
    const qrSize = size || 300;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(url)}`;
    res.json({ success: true, qr_url: qrUrl });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// МЕДИА-БИБЛИОТЕКА
// ════════════════════════════════════════

router.get('/media', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { type } = req.query;
    let sql = 'SELECT * FROM ad_media_library WHERE user_id=?';
    const params = [req.user.id];
    if (type) { sql += ' AND type=?'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT 200';

    const media = db.prepare(sql).all(...params);
    res.json({ success: true, media });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/media/upload', authRequired, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file' });
    const db = getDb();

    const ext = path.extname(req.file.originalname).toLowerCase();
    const newName = req.file.filename + ext;
    const newPath = path.join(MEDIA_UPLOAD_DIR, newName);
    fs.renameSync(req.file.path, newPath);

    const isVideo = /\.(mp4|mov|avi|webm)$/i.test(ext);
    const type = isVideo ? 'video' : 'image';
    const url = `/uploads/ad-media/${newName}`;

    const r = db.prepare(`INSERT INTO ad_media_library (user_id, type, filename, url, size_bytes, source)
      VALUES (?, ?, ?, ?, ?, 'upload')`)
      .run(req.user.id, type, req.file.originalname, url, req.file.size);

    const media = db.prepare('SELECT * FROM ad_media_library WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, media });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/media/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const m = db.prepare('SELECT * FROM ad_media_library WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!m) return res.status(404).json({ success: false, error: 'Not found' });

    // Удаляем файл
    if (m.url && m.source === 'upload') {
      const fpath = path.join('/app/public', m.url);
      if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    }

    db.prepare('DELETE FROM ad_media_library WHERE id=?').run(m.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Импорт из существующих баннеров
router.get('/media/banners', authRequired, (req, res) => {
  try {
    const db = getDb();
    const banners = db.prepare(`SELECT id, title, image_url, created_at FROM generation_history
      WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).all(req.user.id);
    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Генерация видео-баннера для поста
router.post('/media/generate-video-banner', authRequired, async (req, res) => {
  try {
    const { template, title, subtitle } = req.body;
    // Proxy к video-banner API
    const token = req.headers.authorization;
    const r = await fetch('http://localhost:3001/api/video-banner/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ template: template || 'arsenal-suite', customText: { title, subtitle } })
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Генерация OG картинки для поста
router.post('/media/generate-og', authRequired, async (req, res) => {
  try {
    const { template_id, title, subtitle } = req.body;
    const url = `http://localhost:3001/api/og-suite/render/${template_id || 'default'}?format=png&sizePreset=og&title=${encodeURIComponent(title || '')}&subtitle=${encodeURIComponent(subtitle || '')}`;
    res.json({ success: true, og_url: url });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// РАСПИСАНИЯ (авто + запланированные)
// ════════════════════════════════════════

router.get('/schedules', authRequired, (req, res) => {
  try {
    const db = getDb();
    const schedules = db.prepare(`
      SELECT s.*, c.name as campaign_name, p.title as post_title,
             p.text_original as post_text, p.links as post_links, p.media_url, p.media_type,
             (SELECT COALESCE(SUM(sl.total_clicks),0) FROM short_links sl
              WHERE sl.user_id=s.user_id AND sl.campaign_id=s.campaign_id) as total_link_clicks,
             (SELECT COUNT(*) FROM short_links sl
              WHERE sl.user_id=s.user_id AND sl.campaign_id=s.campaign_id) as total_short_links
      FROM ad_schedules s
      LEFT JOIN ad_campaigns c ON c.id=s.campaign_id
      LEFT JOIN ad_posts p ON p.id=s.post_id
      WHERE s.user_id=? AND s.status!='deleted'
      ORDER BY s.created_at DESC
    `).all(req.user.id);

    for (const s of schedules) {
      try { s.video_source_urls = JSON.parse(s.video_source_urls); } catch (e) { s.video_source_urls = []; }
    }

    res.json({ success: true, schedules });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/schedules', authRequired, (req, res) => {
  try {
    const db = getDb();
    const { campaign_id, post_id, type, interval_minutes, scheduled_at,
      repeat_enabled, repeat_count, ai_rewrite, auto_media, auto_media_type,
      video_source_urls, max_runs } = req.body;

    if (!campaign_id) return res.status(400).json({ success: false, error: 'campaign_id required' });

    // Вычисляем next_run_at
    let nextRun = null;
    if (type === 'interval') {
      // First run immediately, then use interval
      nextRun = new Date().toISOString().replace('T', ' ').slice(0, 19);
    } else if (type === 'scheduled' && scheduled_at) {
      nextRun = scheduled_at;
    }

    const r = db.prepare(`INSERT INTO ad_schedules
      (user_id, campaign_id, post_id, type, interval_minutes, scheduled_at,
       repeat_enabled, repeat_count, ai_rewrite, auto_media, auto_media_type,
       video_source_urls, max_runs, next_run_at, auto_delete_previous, tg_cta_link, tg_cta_text, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`)
      .run(
        req.user.id, campaign_id, post_id || null,
        type || 'interval',
        Math.max(10, parseInt(interval_minutes) || 180),
        scheduled_at || null,
        repeat_enabled ? 1 : 0,
        parseInt(repeat_count) || 0,
        ai_rewrite !== false ? 1 : 0,
        auto_media ? 1 : 0,
        auto_media_type || null,
        JSON.stringify(video_source_urls || []),
        parseInt(max_runs) || 0,
        nextRun,
        req.body.auto_delete_previous ? 1 : 0,
        req.body.tg_cta_link || null,
        req.body.tg_cta_text || null
      );

    const schedule = db.prepare('SELECT * FROM ad_schedules WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, schedule });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/schedules/:id/run-now', authRequired, (req, res) => {
  try {
    const db = getDb();
    const s = db.prepare("SELECT id FROM ad_schedules WHERE id=? AND user_id=? AND status='active'").get(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ success: false, error: 'Not found or not active' });
    // Set next_run_at to now so cron picks it up
    db.prepare("UPDATE ad_schedules SET next_run_at=datetime('now') WHERE id=?").run(s.id);
    // Spawn cron immediately (non-blocking)
    const { spawn } = require('child_process');
    const cronPath = require('path').join(__dirname, '..', 'ad-center-cron.js');
    const child = spawn(process.execPath, [cronPath], {
      detached: true,
      stdio: 'ignore',
      cwd: require('path').join(__dirname, '..', '..')
    });
    child.unref();
    res.json({ success: true, message: 'Broadcast started!' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.put('/schedules/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    const s = db.prepare('SELECT id FROM ad_schedules WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ success: false, error: 'Not found' });

    const fields = ['type', 'interval_minutes', 'scheduled_at', 'repeat_enabled',
      'repeat_count', 'ai_rewrite', 'auto_media', 'auto_media_type', 'max_runs', 'status', 'next_run_at',
      'auto_delete_previous', 'tg_cta_link', 'tg_cta_text'];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        db.prepare(`UPDATE ad_schedules SET ${f}=? WHERE id=?`).run(req.body[f], s.id);
      }
    }
    if (req.body.video_source_urls !== undefined) {
      db.prepare('UPDATE ad_schedules SET video_source_urls=? WHERE id=?')
        .run(JSON.stringify(req.body.video_source_urls), s.id);
    }

    // Update post text/links/media if provided
    if (req.body.post_text !== undefined || req.body.post_links !== undefined || req.body.media_url !== undefined) {
      const sch = db.prepare('SELECT post_id FROM ad_schedules WHERE id=?').get(s.id);
      if (sch && sch.post_id) {
        if (req.body.post_text !== undefined) {
          db.prepare('UPDATE ad_posts SET text_original=?, text_final=? WHERE id=?')
            .run(req.body.post_text, req.body.post_text, sch.post_id);
        }
        if (req.body.post_links !== undefined) {
          db.prepare('UPDATE ad_posts SET links=? WHERE id=?')
            .run(JSON.stringify(req.body.post_links), sch.post_id);
        }
        if (req.body.media_url !== undefined) {
          db.prepare('UPDATE ad_posts SET media_url=?, media_type=? WHERE id=?')
            .run(req.body.media_url || null, req.body.media_type || null, sch.post_id);
        }
      } else if (req.body.post_text || req.body.media_url) {
        // No post yet — create one
        const campaign = db.prepare('SELECT campaign_id FROM ad_schedules WHERE id=?').get(s.id);
        if (campaign) {
          const pr = db.prepare('INSERT INTO ad_posts (user_id, campaign_id, title, text_original, text_final, media_url, media_type, type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(req.user.id, campaign.campaign_id, 'Auto base', req.body.post_text || '', req.body.post_text || '', req.body.media_url || null, req.body.media_type || null, 'auto');
          db.prepare('UPDATE ad_schedules SET post_id=? WHERE id=?').run(pr.lastInsertRowid, s.id);
        }
      }
    }

    const updated = db.prepare('SELECT * FROM ad_schedules WHERE id=?').get(s.id);
    res.json({ success: true, schedule: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/schedules/:id/pause', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE ad_schedules SET status=\'paused\' WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/schedules/:id/resume', authRequired, (req, res) => {
  try {
    const db = getDb();
    const s = db.prepare('SELECT * FROM ad_schedules WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!s) return res.status(404).json({ success: false, error: 'Not found' });

    // Пересчитываем next_run_at
    let nextRun;
    if (s.type === 'interval') {
      nextRun = new Date(Date.now() + (s.interval_minutes || 180) * 60000).toISOString().replace('T', ' ').slice(0, 19);
    } else {
      nextRun = s.scheduled_at;
    }

    db.prepare('UPDATE ad_schedules SET status=\'active\', next_run_at=? WHERE id=?').run(nextRun, s.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.delete('/schedules/:id', authRequired, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE ad_schedules SET status=\'deleted\' WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════
// СТАТИСТИКА
// ════════════════════════════════════════

router.get('/stats', authRequired, (req, res) => {
  try {
    const db = getDb();
    const uid = req.user.id;

    const campaigns = db.prepare('SELECT COUNT(*) as c FROM ad_campaigns WHERE user_id=? AND status!=\'deleted\'').get(uid).c;
    const sources = db.prepare('SELECT COUNT(*) as c FROM ad_sources WHERE user_id=? AND status=\'active\'').get(uid).c;
    const posts = db.prepare('SELECT COUNT(*) as c FROM ad_posts WHERE user_id=?').get(uid).c;
    const sent = db.prepare('SELECT COUNT(*) as c FROM ad_posts WHERE user_id=? AND status=\'sent\'').get(uid).c;
    const totalDelivered = db.prepare('SELECT COUNT(*) as c FROM ad_send_log l JOIN ad_posts p ON p.id=l.post_id WHERE p.user_id=? AND l.status=\'sent\'').get(uid).c;
    const activeSchedules = db.prepare('SELECT COUNT(*) as c FROM ad_schedules WHERE user_id=? AND status=\'active\'').get(uid).c;

    // Последние 7 дней
    const daily = db.prepare(`
      SELECT date(l.created_at) as day, COUNT(*) as sends
      FROM ad_send_log l JOIN ad_posts p ON p.id=l.post_id
      WHERE p.user_id=? AND l.status='sent' AND l.created_at >= datetime('now', '-7 days')
      GROUP BY day ORDER BY day
    `).all(uid);

    // Последние 5 отправок
    const recent = db.prepare(`
      SELECT p.id, p.title, p.status, p.sent_at, p.sent_count, p.fail_count
      FROM ad_posts p WHERE p.user_id=? AND p.status='sent'
      ORDER BY p.sent_at DESC LIMIT 5
    `).all(uid);

    res.json({
      success: true,
      stats: { campaigns, sources, posts, sent, totalDelivered, activeSchedules, daily, recent }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});



// ─── Video Compose Post — полный пайплайн ─────────────────────────────────────
// POST /api/ad-center/video/compose-post
// body: { video_url, banner_id?, prompt, tone, length, language, links[], source_ids[] }
// Пайплайн: скачать видео → транскрибация → вклеить баннер → AI текст → создать пост
router.post('/video/compose-post', authRequired, async (req, res) => {
  const db = getDb();
  try {
    const { video_url, banner_id, prompt, tone, length, language, links, source_ids, banner_position } = req.body;
    if (!video_url) return res.status(400).json({ error: 'video_url required' });

    const userId = req.user.id;
    const isRu = language === 'ru';
    const steps = [];

    // ── Step 1: Скачать видео + транскрибировать ──
    steps.push('downloading');
    res.writeHead && null; // keep alive hint
    console.log('[AD-CENTER] compose-post: downloading', video_url);

    const { text: transcription, videoPath, info } = await transcriber.downloadAndTranscribe(video_url);
    steps.push('transcribed');
    console.log('[AD-CENTER] compose-post: transcribed, text length:', transcription.length);

    // ── Step 2: Вклеить баннер (если указан) ──
    let finalVideoPath = videoPath;
    let finalVideoUrl = null;

    if (banner_id) {
      steps.push('composing');
      // Найти баннер-видео
      const bannerFile = path.join('/data/generated/banners', banner_id);
      const bannerMp4 = bannerFile.endsWith('.mp4') ? bannerFile : bannerFile + '.mp4';

      if (fs.existsSync(bannerMp4)) {
        const position = banner_position || 'intro'; // intro | outro | both
        const composeOpts = {};
        if (position === 'intro' || position === 'both') composeOpts.introBannerPath = bannerMp4;
        if (position === 'outro' || position === 'both') composeOpts.outroBannerPath = bannerMp4;

        const composed = await videoComposer.composeVideo(videoPath, composeOpts);
        finalVideoPath = composed.outputPath;
        finalVideoUrl = composed.publicUrl;
        console.log('[AD-CENTER] compose-post: video composed, url:', finalVideoUrl);
      } else {
        console.warn('[AD-CENTER] compose-post: banner not found:', bannerMp4);
        // Просто копируем оригинальное видео
        const composed = await videoComposer.composeVideo(videoPath, {});
        finalVideoPath = composed.outputPath;
        finalVideoUrl = composed.publicUrl;
      }
    } else {
      // Без баннера — просто копируем видео в public
      const composed = await videoComposer.composeVideo(videoPath, {});
      finalVideoPath = composed.outputPath;
      finalVideoUrl = composed.publicUrl;
    }

    // Удаляем оригинальное скачанное видео (composedVideo уже в public)
    try { if (videoPath !== finalVideoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch(e) {}

    // ── Step 3: AI генерация текста ──
    steps.push('generating_text');
    let generatedText = '';

    if (prompt || transcription) {
      try {
        generatedText = await aiWriter.mixTranscriptionWithAd({
          transcription,
          prompt: prompt || (isRu ? 'Смотрите видео!' : 'Watch the video!'),
          links: links || [],
          language: language || 'ru',
          userId
        });
      } catch(e) {
        console.error('[AD-CENTER] compose-post: AI text failed:', e.message);
        // Fallback: ручной текст
        generatedText = (prompt || '') + (transcription ? '\n\n' + (isRu ? '📝 Из видео: ' : '📝 From video: ') + transcription.substring(0, 500) : '');
      }
    }

    // Добавляем ссылки в конец текста если их нет
    if (links && links.length) {
      const linkBlock = links.map(l => l.short_url || l.url).filter(Boolean).join('\n');
      if (linkBlock && !generatedText.includes(linkBlock.split('\n')[0])) {
        generatedText += '\n\n🔗 ' + linkBlock;
      }
    }

    // ── Step 4: Создать пост в БД ──
    steps.push('creating_post');
    const fullMediaUrl = 'https://golden-connect.to' + finalVideoUrl;

    const postResult = db.prepare(`INSERT INTO ad_posts
      (user_id, campaign_id, title, text_original, text_generated, text_final, media_type, media_url, type, status, created_at)
      VALUES (?, NULL, ?, ?, ?, ?, 'video', ?, 'instant', 'ready', datetime('now'))`)
      .run(userId, info.title || 'Video post', prompt || '', generatedText, generatedText, fullMediaUrl);

    const post = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(postResult.lastInsertRowid);

    // ── Step 5: Если source_ids — сразу отправить ──
    let sendResult = null;
    if (source_ids && source_ids.length > 0) {
      steps.push('sending');
      try {
        sendResult = await publisher.broadcastPost(post.id, source_ids);
      } catch(e) {
        sendResult = { error: e.message };
      }
    }

    res.json({
      success: true,
      post,
      video_url: finalVideoUrl,
      full_video_url: fullMediaUrl,
      transcription: transcription.substring(0, 1000),
      video_info: info,
      generated_text: generatedText,
      send_result: sendResult,
      steps
    });

  } catch(e) {
    console.error('[AD-CENTER] compose-post error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Список доступных видео-баннеров для вклейки
router.get('/video/banners', authRequired, (req, res) => {
  try {
    const bannerDir = '/data/generated/banners';
    const files = fs.readdirSync(bannerDir).filter(f => f.endsWith('.mp4'));
    const banners = files.map(f => {
      const stat = fs.statSync(path.join(bannerDir, f));
      return {
        id: f,
        url: '/generated/banners/' + f,
        size: stat.size,
        created: stat.mtime
      };
    }).sort((a, b) => new Date(b.created) - new Date(a.created));
    res.json({ success: true, banners });
  } catch(e) {
    res.json({ success: true, banners: [] });
  }
});


// ─── Bot Channel Sync Endpoints ───────────────────────────────────────────────
const BOT_SECRET_AC = process.env.BOT_API_SECRET || 'arsnl_bot_secret_2026';

function botAuth(req, res, next) {
  if (req.headers['x-bot-token'] !== BOT_SECRET_AC) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Bot syncs a channel for a user (by tg_chat_id)
router.post('/bot/sync-channel', botAuth, (req, res) => {
  try {
    const { tg_user_id, channel_chat_id, title, username, member_count, bot_is_admin } = req.body;
    if (!tg_user_id || !channel_chat_id) return res.status(400).json({ error: 'Missing tg_user_id or channel_chat_id' });

    // Find user by tg_chat_id
    const user = getDb().prepare('SELECT id FROM users WHERE tg_chat_id=?').get(String(tg_user_id));
    if (!user) return res.json({ success: false, error: 'user_not_linked', message: 'User not linked via /connect' });

    // Check if already exists
    const existing = getDb().prepare("SELECT id, status FROM ad_sources WHERE user_id=? AND tg_chat_id=? AND status!='removed'")
      .get(user.id, String(channel_chat_id));

    if (existing) {
      // Update existing
      getDb().prepare('UPDATE ad_sources SET title=?, username=?, member_count=?, bot_is_admin=?, status=? WHERE id=?')
        .run(title || '', username || '', member_count || 0, bot_is_admin ? 1 : 0, 'active', existing.id);
      const source = getDb().prepare('SELECT * FROM ad_sources WHERE id=?').get(existing.id);
      return res.json({ success: true, action: 'updated', source });
    }

    // Create new
    const r = getDb().prepare(`INSERT INTO ad_sources (user_id, type, tg_chat_id, title, username, member_count, bot_is_admin, status, added_at)
      VALUES (?, 'telegram', ?, ?, ?, ?, ?, 'active', datetime('now'))`)
      .run(user.id, String(channel_chat_id), title || '', username || '', member_count || 0, bot_is_admin ? 1 : 0);

    const source = getDb().prepare('SELECT * FROM ad_sources WHERE id=?').get(r.lastInsertRowid);
    res.json({ success: true, action: 'created', source });
  } catch(e) {
    console.error('[ad-center] bot/sync-channel error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Bot removes a channel for a user
router.post('/bot/remove-channel', botAuth, (req, res) => {
  try {
    const { tg_user_id, channel_chat_id } = req.body;
    if (!tg_user_id || !channel_chat_id) return res.status(400).json({ error: 'Missing params' });

    const user = getDb().prepare('SELECT id FROM users WHERE tg_chat_id=?').get(String(tg_user_id));
    if (!user) return res.json({ success: false, error: 'user_not_linked' });

    getDb().prepare("UPDATE ad_sources SET status='removed' WHERE user_id=? AND tg_chat_id=?")
      .run(user.id, String(channel_chat_id));
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Bot gets user's channels list
router.get('/bot/channels', botAuth, (req, res) => {
  try {
    const tg_user_id = req.query.tg_user_id || req.headers['x-tg-user-id'];
    if (!tg_user_id) return res.status(400).json({ error: 'Missing tg_user_id' });

    const user = getDb().prepare('SELECT id FROM users WHERE tg_chat_id=?').get(String(tg_user_id));
    if (!user) return res.json({ success: true, channels: [], not_linked: true });

    const channels = getDb().prepare("SELECT * FROM ad_sources WHERE user_id=? AND status!='removed' ORDER BY added_at DESC")
      .all(user.id);
    res.json({ success: true, channels });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});


// ══════════════════════════════════════════════════════════════
// AD CENTER v2 — New Endpoints
// ══════════════════════════════════════════════════════════════

// ── TEMPLATES ──────────────────────────────────────────────────
router.get('/templates', authRequired, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ad_post_templates WHERE user_id=? ORDER BY use_count DESC, created_at DESC').all(req.user.id);
  rows.forEach(r => {
    try { r.links = JSON.parse(r.links_json || '[]'); } catch(e) { r.links = []; }
    try { r.tg_buttons = JSON.parse(r.tg_buttons_json || '[]'); } catch(e) { r.tg_buttons = []; }
  });
  res.json({ success: true, templates: rows });
});

router.post('/templates', authRequired, (req, res) => {
  const db = getDb();
  const { title, description, text_content, media_url, media_type, tg_buttons, links, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const r = db.prepare(
    'INSERT INTO ad_post_templates (user_id, title, description, text_content, media_url, media_type, tg_buttons_json, links_json, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title, description||'', text_content||'', media_url||'', media_type||'text',
    JSON.stringify(tg_buttons||[]), JSON.stringify(links||[]), tags||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

router.post('/templates/:id/use', authRequired, (req, res) => {
  const db = getDb();
  const t = db.prepare('SELECT * FROM ad_post_templates WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Not found' });
  db.prepare('UPDATE ad_post_templates SET use_count=use_count+1 WHERE id=?').run(t.id);
  try { t.links = JSON.parse(t.links_json || '[]'); } catch(e) { t.links = []; }
  try { t.tg_buttons = JSON.parse(t.tg_buttons_json || '[]'); } catch(e) { t.tg_buttons = []; }
  res.json({ success: true, template: t });
});

router.delete('/templates/:id', authRequired, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM ad_post_templates WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

// ── ANALYTICS ──────────────────────────────────────────────────
router.get('/analytics', authRequired, (req, res) => {
  const db = getDb();
  const uid = req.user.id;
  const totalPosts = (db.prepare('SELECT COUNT(*) as c FROM ad_posts WHERE user_id=?').get(uid) || {}).c || 0;
  const totalSent = (db.prepare("SELECT SUM(sent_count) as c FROM ad_posts WHERE user_id=? AND status='sent'").get(uid) || {}).c || 0;
  const totalFailed = (db.prepare("SELECT SUM(fail_count) as c FROM ad_posts WHERE user_id=? AND status='sent'").get(uid) || {}).c || 0;
  const sources = db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND status='active'").all(uid);
  const channelStats = sources.map(s => {
    const sent = (db.prepare("SELECT COUNT(*) as c FROM ad_send_log WHERE source_id=? AND status='sent'").get(s.id) || {}).c || 0;
    const failed = (db.prepare("SELECT COUNT(*) as c FROM ad_send_log WHERE source_id=? AND status='failed'").get(s.id) || {}).c || 0;
    const lastSent = db.prepare("SELECT created_at FROM ad_send_log WHERE source_id=? AND status='sent' ORDER BY created_at DESC LIMIT 1").get(s.id);
    const week = (db.prepare("SELECT COUNT(*) as c FROM ad_send_log WHERE source_id=? AND status='sent' AND created_at > datetime('now', '-7 days')").get(s.id) || {}).c || 0;
    return { id: s.id, title: s.title, tg_chat_id: s.tg_chat_id,
      sent_total: sent, failed_total: failed,
      delivery_rate: sent+failed > 0 ? Math.round(sent/(sent+failed)*100) : 100,
      sent_week: week, last_sent: lastSent ? lastSent.created_at : null };
  });
  const byDay = db.prepare(
    "SELECT date(created_at) as day, COUNT(*) as cnt FROM ad_send_log WHERE post_id IN (SELECT id FROM ad_posts WHERE user_id=?) AND status='sent' AND created_at > datetime('now', '-14 days') GROUP BY day ORDER BY day"
  ).all(uid);
  const byHour = db.prepare(
    "SELECT strftime('%H', created_at) as hour, COUNT(*) as cnt FROM ad_send_log WHERE post_id IN (SELECT id FROM ad_posts WHERE user_id=?) AND status='sent' GROUP BY hour ORDER BY cnt DESC"
  ).all(uid);
  res.json({ success: true,
    summary: { totalPosts, totalSent, totalFailed,
      deliveryRate: totalSent+totalFailed > 0 ? Math.round(totalSent/(totalSent+totalFailed)*100) : 100 },
    channels: channelStats, byDay, byHour });
});

// ── AUTO-IMPORT MONITORS ────────────────────────────────────────
router.get('/monitors', authRequired, (req, res) => {
  const db = getDb();
  res.json({ success: true, monitors: db.prepare('SELECT * FROM ad_monitor_sources WHERE user_id=? ORDER BY created_at DESC').all(req.user.id) });
});

router.post('/monitors', authRequired, async (req, res) => {
  const _lim_adcenter_monitors = await require('../helpers/usage-limits').checkLimitAsync(req.user.id, 'adcenter.monitors');
  if (!_lim_adcenter_monitors.ok) return res.status(429).json({ success: false, code: 'LIMIT_REACHED', service: 'adcenter.monitors', used: _lim_adcenter_monitors.used, limit: _lim_adcenter_monitors.limit, plan: _lim_adcenter_monitors.plan });
  const db = getDb();
  const { title, source_url, ai_prompt, interval_hours, campaign_id, target_sources, watermark_text, banner_video, language, auto_post } = req.body;
  if (!source_url) return res.status(400).json({ error: 'source_url required' });
  const platform = /youtube|youtu\.be/i.test(source_url) ? 'youtube' : /tiktok/i.test(source_url) ? 'tiktok' : /instagram/i.test(source_url) ? 'instagram' : 'other';
  const r = db.prepare(
    'INSERT INTO ad_monitor_sources (user_id, title, source_url, platform, ai_prompt, interval_hours, campaign_id, target_sources_json, watermark_text, banner_video, language, auto_post) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, title||source_url, source_url, platform, ai_prompt||'', interval_hours||6, campaign_id||null,
    JSON.stringify(target_sources||[]), watermark_text||'', banner_video||'', language||'ru', auto_post ? 1 : 0);
  res.json({ success: true, id: r.lastInsertRowid });
});

router.put('/monitors/:id', authRequired, (req, res) => {
  const db = getDb();
  const { title, ai_prompt, interval_hours, watermark_text, banner_video, language, status, target_sources, auto_post } = req.body;
  db.prepare(
    'UPDATE ad_monitor_sources SET title=COALESCE(?,title), ai_prompt=COALESCE(?,ai_prompt), interval_hours=COALESCE(?,interval_hours), watermark_text=COALESCE(?,watermark_text), banner_video=COALESCE(?,banner_video), language=COALESCE(?,language), status=COALESCE(?,status), auto_post=COALESCE(?,auto_post), target_sources_json=COALESCE(?,target_sources_json) WHERE id=? AND user_id=?'
  ).run(title, ai_prompt, interval_hours, watermark_text, banner_video, language, status,
    auto_post !== undefined ? (auto_post ? 1 : 0) : null,
    target_sources ? JSON.stringify(target_sources) : null, req.params.id, req.user.id);
  res.json({ success: true });
});

router.delete('/monitors/:id', authRequired, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM ad_monitor_sources WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  res.json({ success: true });
});

router.post('/monitors/:id/run', authRequired, async (req, res) => {
  const db = getDb();
  const monitor = db.prepare('SELECT * FROM ad_monitor_sources WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!monitor) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, message: 'Monitor check started' });
  processMonitor(monitor, db).catch(e => console.error('[MONITOR] Error:', e.message));
});

async function processMonitor(monitor, db) {
  const { execFile } = require('child_process');
  console.log('[MONITOR] Checking:', monitor.title);
  try {
    const latestVideo = await new Promise((resolve, reject) => {
      execFile('yt-dlp', ['--playlist-items', '1', '--dump-json', '--no-download', monitor.source_url],
        { timeout: 60000 }, (err, stdout) => {
          if (err) return reject(err);
          try { resolve(JSON.parse(stdout.trim().split('\n')[0])); } catch(e) { reject(e); }
        });
    });
    const videoId = latestVideo.id || latestVideo.webpage_url;
    if (videoId === monitor.last_video_id) {
      db.prepare('UPDATE ad_monitor_sources SET last_check=datetime("now") WHERE id=?').run(monitor.id);
      return;
    }
    console.log('[MONITOR] New video:', latestVideo.title);
    const videoUrl = latestVideo.webpage_url || latestVideo.url;
    let result = { text: '', videoPath: null };
    try { result = await transcribeFromUrl(videoUrl, { keepVideo: true }); } catch(e) { console.error('[MONITOR]', e.message); }
    let finalVideoPath = result.videoPath;
    if (finalVideoPath && monitor.watermark_text) {
      try { finalVideoPath = await addWatermark(finalVideoPath, monitor.watermark_text); } catch(e) {}
    }
    if (finalVideoPath && monitor.banner_video) {
      try { finalVideoPath = await mergeWithBanner(finalVideoPath, monitor.banner_video); } catch(e) {}
    }
    let aiText = '';
    try {
      if (result.text) {
        aiText = await mixTranscriptionWithAd({ transcription: result.text, prompt: monitor.ai_prompt || latestVideo.title || '', links: [], language: monitor.language || 'ru', userId: monitor.user_id });
      } else {
        aiText = await generateAdText({ prompt: monitor.ai_prompt || latestVideo.title || '', language: monitor.language || 'ru', tone: 'selling', length: 'medium', userId: monitor.user_id });
      }
    } catch(e) { aiText = (monitor.ai_prompt || '') + '\n\n' + (latestVideo.title || ''); }
    const mediaUrl = finalVideoPath || videoUrl;
    const postR = db.prepare(
      "INSERT INTO ad_posts (user_id, campaign_id, title, text_original, text_generated, text_final, media_url, media_type, type, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'video', 'auto_import', 'ready')"
    ).run(monitor.user_id, monitor.campaign_id || null, 'Auto: ' + (latestVideo.title || '').substring(0, 80), latestVideo.title || '', aiText, aiText, mediaUrl);
    if (monitor.auto_post) {
      const targetSources = JSON.parse(monitor.target_sources_json || '[]');
      if (targetSources.length) {
        try { await broadcastPost(postR.lastInsertRowid, targetSources); } catch(e) { console.error('[MONITOR] Broadcast error:', e.message); }
      }
    }
    db.prepare('UPDATE ad_monitor_sources SET last_check=datetime("now"), last_video_id=? WHERE id=?').run(videoId, monitor.id);
    console.log('[MONITOR] Done:', monitor.title);
  } catch(e) {
    console.error('[MONITOR] Failed:', e.message);
    db.prepare('UPDATE ad_monitor_sources SET last_check=datetime("now") WHERE id=?').run(monitor.id);
  }
}

// ── VIDEO PIPELINE ──────────────────────────────────────────────
router.post('/video/pipeline', authRequired, async (req, res) => {
  const { url, ai_prompt, language, watermark_text, banner_video_path, links, source_ids } = req.body;
  if (!url) return res.status(400).json({ error: 'url required' });
  res.json({ success: true, message: 'Pipeline started' });
  const db = getDb();
  (async () => {
    let videoPath;
    try {
      const result = await transcribeFromUrl(url, { keepVideo: true });
      videoPath = result.videoPath;
      if (videoPath && watermark_text) { try { videoPath = await addWatermark(videoPath, watermark_text); } catch(e) {} }
      if (videoPath && banner_video_path) { try { videoPath = await mergeWithBanner(videoPath, banner_video_path); } catch(e) {} }
      let aiText = '';
      try {
        if (result.text) {
          aiText = await mixTranscriptionWithAd({ transcription: result.text, prompt: ai_prompt||'', links: links||[], language: language||'ru', userId: req.user.id });
        } else {
          aiText = await generateAdText({ prompt: ai_prompt||url, language: language||'ru', tone: 'selling', length: 'medium', links: links||[], userId: req.user.id });
        }
      } catch(e) { aiText = ai_prompt || url; }
      const r = db.prepare(
        "INSERT INTO ad_posts (user_id, title, text_original, text_generated, text_final, media_url, media_type, type, status) VALUES (?, ?, ?, ?, ?, ?, 'video', 'pipeline', 'ready')"
      ).run(req.user.id, 'Video post', (result.text||'').substring(0, 100), aiText, aiText, videoPath || url);
      if (source_ids && source_ids.length) { try { await broadcastPost(r.lastInsertRowid, source_ids); } catch(e) {} }
      console.log('[PIPELINE] Done, post id:', r.lastInsertRowid);
    } catch(e) { console.error('[PIPELINE] Error:', e.message); }
  })();
});

// ── TRANSLATE POST ──────────────────────────────────────────────
router.post('/posts/:id/translate', authRequired, async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const { target_language, source_ids } = req.body;
  const text = post.text_final || post.text_generated || post.text_original || '';
  if (!text) return res.status(400).json({ error: 'No text to translate' });
  try {
    const translated = await generateAdText({
      prompt: 'Translate this Telegram post to ' + (target_language === 'en' ? 'English' : 'Russian') + ', preserve all links and HTML tags:\n\n' + text,
      tone: 'professional', length: 'medium', language: target_language || 'en', userId: req.user.id
    });
    const r = db.prepare(
      "INSERT INTO ad_posts (user_id, campaign_id, title, text_original, text_generated, text_final, media_url, media_type, type, status, translated_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'translated', 'ready', ?)"
    ).run(req.user.id, post.campaign_id, '[' + (target_language||'en').toUpperCase() + '] ' + (post.title||''), text, translated, translated, post.media_url, post.media_type, post.id);
    if (source_ids && source_ids.length) { try { await broadcastPost(r.lastInsertRowid, source_ids); } catch(e) {} }
    res.json({ success: true, translated_post_id: r.lastInsertRowid, text: translated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── A/B VARIANT ─────────────────────────────────────────────────
router.post('/posts/:id/ab-variant', authRequired, async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const text = post.text_final || post.text_generated || post.text_original || '';
  try {
    const variantText = await rewriteAdText({ text, language: req.body.language || 'ru', tone: 'creative', userId: req.user.id });
    const r = db.prepare(
      "INSERT INTO ad_posts (user_id, campaign_id, title, text_original, text_generated, text_final, media_url, media_type, type, status, ab_parent_id, ab_variant) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ab_variant', 'ready', ?, 'B')"
    ).run(req.user.id, post.campaign_id, (post.title||'') + ' [B]', text, variantText, variantText, post.media_url, post.media_type, post.id);
    res.json({ success: true, variant_id: r.lastInsertRowid, text: variantText });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── SMART QUEUE ─────────────────────────────────────────────────
router.post('/posts/:id/smart-queue', authRequired, async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  const { source_ids, spread_hours } = req.body;
  if (!source_ids || !source_ids.length) return res.status(400).json({ error: 'source_ids required' });
  const bestHours = db.prepare(
    "SELECT strftime('%H', created_at) as hour, COUNT(*) as cnt FROM ad_send_log WHERE post_id IN (SELECT id FROM ad_posts WHERE user_id=?) AND status='sent' GROUP BY hour ORDER BY cnt DESC LIMIT 5"
  ).all(req.user.id);
  const preferredHours = bestHours.length >= 2 ? bestHours.map(h => parseInt(h.hour)) : [9, 12, 18, 20];
  const hoursSpread = spread_hours || 4;
  const scheduled = [];
  source_ids.forEach((sourceId, i) => {
    const hourIdx = i % preferredHours.length;
    const targetHour = preferredHours[hourIdx];
    const now = new Date();
    const scheduledAt = new Date(now);
    scheduledAt.setHours(targetHour, 0, 0, 0);
    if (scheduledAt <= now) scheduledAt.setDate(scheduledAt.getDate() + 1);
    if (i > 0) scheduledAt.setHours(scheduledAt.getHours() + Math.floor(i * hoursSpread / source_ids.length));
    const isoStr = scheduledAt.toISOString().replace('T', ' ').substring(0, 19);
    db.prepare('INSERT INTO ad_smart_queue (user_id, post_id, source_id, scheduled_at) VALUES (?, ?, ?, ?)').run(req.user.id, post.id, sourceId, isoStr);
    scheduled.push({ source_id: sourceId, scheduled_at: scheduledAt.toISOString() });
  });
  db.prepare('UPDATE ad_posts SET smart_queue=1 WHERE id=?').run(post.id);
  res.json({ success: true, scheduled });
});

router.get('/queue', authRequired, (req, res) => {
  const db = getDb();
  const now = new Date();
  const startDate = now.toISOString().split('T')[0];
  const endDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const rows = db.prepare(
    "SELECT q.*, p.title as post_title, s.title as source_title FROM ad_smart_queue q LEFT JOIN ad_posts p ON p.id=q.post_id LEFT JOIN ad_sources s ON s.id=q.source_id WHERE q.user_id=? AND q.scheduled_at >= ? AND q.scheduled_at <= ? AND q.status='pending' ORDER BY q.scheduled_at"
  ).all(req.user.id, startDate, endDate);
  res.json({ success: true, queue: rows });
});

router.get('/calendar', authRequired, (req, res) => {
  const db = getDb();
  const y = req.query.year || new Date().getFullYear();
  const m = String(req.query.month || new Date().getMonth() + 1).padStart(2, '0');
  const startDate = y + '-' + m + '-01';
  const endDate = y + '-' + m + '-31';
  const schedules = db.prepare(
    "SELECT s.*, c.name as campaign_title FROM ad_schedules s LEFT JOIN ad_campaigns c ON c.id=s.campaign_id WHERE s.user_id=? AND s.status='active'"
  ).all(req.user.id);
  const sent = db.prepare(
    "SELECT id, title, sent_at, media_type, sent_count, fail_count FROM ad_posts WHERE user_id=? AND sent_at >= ? AND sent_at <= ? ORDER BY sent_at"
  ).all(req.user.id, startDate, endDate);
  const queued = db.prepare(
    "SELECT q.*, p.title as post_title, s.title as source_title FROM ad_smart_queue q LEFT JOIN ad_posts p ON p.id=q.post_id LEFT JOIN ad_sources s ON s.id=q.source_id WHERE q.user_id=? AND q.scheduled_at >= ? AND q.scheduled_at <= ? AND q.status='pending' ORDER BY q.scheduled_at"
  ).all(req.user.id, startDate, endDate);
  res.json({ success: true, schedules, sent, queued, year: y, month: m });
});


// ── Delete messages from channels ─────────────────────────────────────────
router.post('/posts/:id/delete-from-channels', authRequired, async (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Not found' });

    // Can also delete specific source_ids if provided
    const onlySourceIds = req.body.source_ids || null;

    let query = `
      SELECT ps.tg_message_id, ps.source_id, s.tg_chat_id, s.title as source_title
      FROM ad_post_sources ps
      JOIN ad_sources s ON s.id = ps.source_id
      WHERE ps.post_id = ? AND ps.tg_message_id IS NOT NULL`;
    const queryArgs = [req.params.id];
    if (onlySourceIds && onlySourceIds.length) {
      query += ` AND ps.source_id IN (${onlySourceIds.map(() => '?').join(',')})`;
      queryArgs.push(...onlySourceIds);
    }

    const sent = db.prepare(query).all(...queryArgs);
    const fetch = require('node-fetch');
    const BOT_TOKEN = process.env.TG_BOT_TOKEN || '8729355580:AAFY1MIHc3SDmMtjXnlzGBfUihTFVljoS2A';
    const TG_API = 'https://api.telegram.org/bot' + BOT_TOKEN;

    let deleted = 0, failed = 0;
    for (const msg of sent) {
      try {
        const resp = await fetch(TG_API + '/deleteMessage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: msg.tg_chat_id, message_id: msg.tg_message_id })
        });
        const data = await resp.json();
        if (data.ok) {
          deleted++;
          db.prepare("UPDATE ad_post_sources SET status='deleted' WHERE post_id=? AND source_id=?").run(req.params.id, msg.source_id);
        } else { failed++; }
      } catch (e) { failed++; }
    }

    res.json({ success: true, deleted, failed, total: sent.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Post delivery stats ────────────────────────────────────────────────────
router.get('/posts/:id/delivery', authRequired, (req, res) => {
  try {
    const db = getDb();
    const post = db.prepare('SELECT * FROM ad_posts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!post) return res.status(404).json({ success: false, error: 'Not found' });

    const deliveries = db.prepare(`
      SELECT ps.*, s.title as source_title, s.username as source_username, s.tg_chat_id, s.member_count
      FROM ad_post_sources ps
      LEFT JOIN ad_sources s ON s.id = ps.source_id
      WHERE ps.post_id = ?
      ORDER BY ps.sent_at DESC
    `).all(req.params.id);

    res.json({ success: true, post, deliveries });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});


router.processMonitor = processMonitor;
module.exports = router;
