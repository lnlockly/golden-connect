/**
 * Ad Publisher — отправка постов в TG каналы/чаты
 * С кешированием file_id — файл загружается в TG ОДИН раз,
 * затем используется file_id (мгновенно, 0 трафика)
 */
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { getDb } = require('../database');

const BOT_TOKEN = process.env.TG_BOT_TOKEN || '8729355580:AAFY1MIHc3SDmMtjXnlzGBfUihTFVljoS2A';
const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// ── file_id cache (in-memory + DB) ──
const fileIdCache = new Map();

function getCachedFileId(mediaUrl) {
  if (!mediaUrl) return null;
  // Check memory cache first
  if (fileIdCache.has(mediaUrl)) return fileIdCache.get(mediaUrl);
  // Check DB
  try {
    const db = getDb();
    const row = db.prepare('SELECT tg_file_id FROM ad_media_library WHERE url = ? AND tg_file_id IS NOT NULL').get(mediaUrl);
    if (row && row.tg_file_id) {
      fileIdCache.set(mediaUrl, row.tg_file_id);
      return row.tg_file_id;
    }
  } catch(e) {}
  return null;
}

function saveCachedFileId(mediaUrl, fileId) {
  if (!mediaUrl || !fileId) return;
  fileIdCache.set(mediaUrl, fileId);
  try {
    const db = getDb();
    db.prepare('UPDATE ad_media_library SET tg_file_id = ? WHERE url = ?').run(fileId, mediaUrl);
  } catch(e) {}
}

function extractFileId(result, mediaType) {
  if (!result || !result.result) return null;
  const msg = result.result;
  if (mediaType === 'video' && msg.video) return msg.video.file_id;
  if (msg.photo && msg.photo.length) return msg.photo[msg.photo.length - 1].file_id;
  if (msg.animation) return msg.animation.file_id;
  if (msg.document) return msg.document.file_id;
  return null;
}

/**
 * Отправка поста в один источник (канал/чат)
 */
async function sendToSource(post, source) {
  const chatId = source.tg_chat_id;
  const text = post.text_final || post.text_generated || post.text_original || '';
  let replyMarkup = null;
  if (post.tg_buttons_json) { try { const btns = JSON.parse(post.tg_buttons_json); if (btns && btns.length) replyMarkup = { inline_keyboard: btns.map(row => Array.isArray(row) ? row : [row]) }; } catch(e) {} }
  const mediaUrl = post.media_url;
  const mediaType = post.media_type;

  let result;

  if (mediaType === 'video' && mediaUrl) {
    // Check file_id cache first
    const cachedId = getCachedFileId(mediaUrl);
    if (cachedId) {
      // Use cached file_id — instant, zero bandwidth
      result = await tgRequest('sendVideo', {
        chat_id: chatId,
        video: cachedId,
        caption: text.substring(0, 1024),
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
      // If file_id expired (rare), fall through to re-upload
      if (result.ok) return result;
      console.log('[publisher] Cached file_id expired, re-uploading:', mediaUrl);
      fileIdCache.delete(mediaUrl);
    }

    if (mediaUrl.startsWith('http')) {
      result = await tgRequest('sendVideo', {
        chat_id: chatId,
        video: mediaUrl,
        caption: text.substring(0, 1024),
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
    } else {
      const localPath = mediaUrl.startsWith('/') ? path.join('/opt/banner-webapp/public', mediaUrl) : mediaUrl;
      if (!fs.existsSync(localPath)) {
        return { ok: false, description: 'Media file not found: ' + localPath };
      }
      result = await tgSendFile('sendVideo', chatId, localPath, 'video', text, replyMarkup);
    }
    // Cache file_id from response
    if (result.ok) {
      const fid = extractFileId(result, 'video');
      if (fid) saveCachedFileId(mediaUrl, fid);
    }

  } else if (mediaUrl && (mediaType === 'image' || mediaType === 'photo' || mediaType === 'og_image' || mediaType === 'video_banner')) {
    const cachedId = getCachedFileId(mediaUrl);
    if (cachedId) {
      result = await tgRequest('sendPhoto', {
        chat_id: chatId,
        photo: cachedId,
        caption: text.substring(0, 1024),
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
      if (result.ok) return result;
      fileIdCache.delete(mediaUrl);
    }

    if (mediaUrl.startsWith('http')) {
      result = await tgRequest('sendPhoto', {
        chat_id: chatId,
        photo: mediaUrl,
        caption: text.substring(0, 1024),
        parse_mode: 'HTML',
        ...(replyMarkup ? { reply_markup: replyMarkup } : {})
      });
    } else {
      const localPath = mediaUrl.startsWith('/') ? path.join('/opt/banner-webapp/public', mediaUrl) : mediaUrl;
      if (!fs.existsSync(localPath)) {
        return { ok: false, description: 'Media file not found: ' + localPath };
      }
      result = await tgSendFile('sendPhoto', chatId, localPath, 'photo', text, replyMarkup);
    }
    if (result.ok) {
      const fid = extractFileId(result, 'photo');
      if (fid) saveCachedFileId(mediaUrl, fid);
    }

  } else {
    result = await tgRequest('sendMessage', {
      chat_id: chatId,
      text: text.substring(0, 4096),
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    });
  }

  return result;
}

/**
 * Массовая рассылка поста по всем источникам кампании
 */
async function broadcastPost(postId, sourceIds) {
  const db = getDb();
  const post = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(postId);
  if (!post) throw new Error('Post not found');

  const sources = sourceIds && sourceIds.length > 0
    ? db.prepare(`SELECT * FROM ad_sources WHERE id IN (${sourceIds.map(() => '?').join(',')}) AND status='active'`).all(...sourceIds)
    : [];

  if (!sources.length) throw new Error('No active sources');

  let sentCount = 0;
  let failCount = 0;
  const results = [];

  for (const source of sources) {
    try {
      if (sentCount > 0) await sleep(1000);

      const result = await sendToSource(post, source);

      if (result.ok) {
        sentCount++;
        const msgId = result.result?.message_id || null;

        db.prepare(`INSERT INTO ad_send_log (post_id, source_id, tg_message_id, text_sent, media_sent, status)
          VALUES (?, ?, ?, ?, ?, 'sent')`).run(postId, source.id, msgId, post.text_final, post.media_url);

        db.prepare(`INSERT OR REPLACE INTO ad_post_sources (post_id, source_id, tg_message_id, status, sent_at)
          VALUES (?, ?, ?, 'sent', datetime('now'))`).run(postId, source.id, msgId);

        db.prepare(`UPDATE ad_sources SET total_sent=COALESCE(total_sent,0)+1, last_sent_at=datetime('now') WHERE id=?`).run(source.id);
        results.push({ source_id: source.id, title: source.title, status: 'sent', message_id: msgId });
      } else {
        failCount++;
        const errMsg = result.description || 'Unknown TG error';
        db.prepare(`INSERT INTO ad_send_log (post_id, source_id, status, error_text)
          VALUES (?, ?, 'failed', ?)`).run(postId, source.id, errMsg);
        db.prepare(`INSERT OR REPLACE INTO ad_post_sources (post_id, source_id, status, error_text)
          VALUES (?, ?, 'failed', ?)`).run(postId, source.id, errMsg);
        db.prepare('UPDATE ad_sources SET total_failed=COALESCE(total_failed,0)+1 WHERE id=?').run(source.id);
        results.push({ source_id: source.id, title: source.title, status: 'failed', error: errMsg });
      }
    } catch (e) {
      failCount++;
      db.prepare(`INSERT INTO ad_send_log (post_id, source_id, status, error_text)
        VALUES (?, ?, 'failed', ?)`).run(postId, source.id, e.message);
      results.push({ source_id: source.id, title: source.title, status: 'failed', error: e.message });
    }
  }

  db.prepare(`UPDATE ad_posts SET status='sent', sent_count=?, fail_count=?, sent_at=datetime('now') WHERE id=?`)
    .run(sentCount, failCount, postId);

  return { sent: sentCount, failed: failCount, total: sources.length, results };
}

/**
 * Проверить что бот — админ в канале
 */
async function checkBotAdmin(chatId) {
  try {
    const chatInfo = await tgRequest('getChat', { chat_id: chatId });
    if (!chatInfo.ok) return { ok: false, error: chatInfo.description || 'Chat not found' };

    const me = await tgRequest('getMe', {});
    const botId = me.result?.id;

    const member = await tgRequest('getChatMember', { chat_id: chatId, user_id: botId });
    const isAdmin = member.ok && ['administrator', 'creator'].includes(member.result?.status);

    const countResp = await tgRequest('getChatMemberCount', { chat_id: chatId });
    const memberCount = countResp.ok ? countResp.result : (chatInfo.result.member_count || 0);

    const chat = chatInfo.result;

    let photoUrl = null;
    if (chat.photo?.big_file_id) {
      try {
        const fp = await tgRequest('getFile', { file_id: chat.photo.big_file_id });
        if (fp.ok && fp.result?.file_path) {
          photoUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fp.result.file_path}`;
        }
      } catch(e) {}
    }

    let inviteLink = chat.invite_link || (chat.username ? `https://t.me/${chat.username}` : null);
    if (!inviteLink && isAdmin) {
      try {
        const il = await tgRequest('exportChatInviteLink', { chat_id: chatId });
        if (il.ok) inviteLink = il.result;
      } catch(e) {}
    }

    const avgPostViews = chat.pinned_message?.views || 0;

    return {
      ok: true,
      chat: {
        id: chat.id,
        title: chat.title || '',
        username: chat.username || '',
        type: chat.type,
        member_count: memberCount,
        description: chat.description || chat.bio || '',
        photo_url: photoUrl,
        invite_link: inviteLink,
        linked_chat_id: chat.linked_chat_id || null,
        avg_post_views: avgPostViews,
        slow_mode_delay: chat.slow_mode_delay || 0,
        is_verified: chat.is_verified || false,
        has_protected_content: chat.has_protected_content || false
      },
      bot_is_admin: isAdmin,
      bot_permissions: {
        can_post_messages: member.result?.can_post_messages || false,
        can_edit_messages: member.result?.can_edit_messages || false,
        can_delete_messages: member.result?.can_delete_messages || false,
        can_invite_users: member.result?.can_invite_users || false,
        can_pin_messages: member.result?.can_pin_messages || false
      }
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function getChatInfo(chatId) {
  try {
    const r = await tgRequest('getChat', { chat_id: chatId });
    if (!r.ok) return null;
    const count = await tgRequest('getChatMemberCount', { chat_id: chatId });
    const chat = r.result;
    return {
      id: chat.id,
      title: chat.title || '',
      username: chat.username || '',
      type: chat.type,
      member_count: count.ok ? count.result : 0,
      description: chat.description || chat.bio || '',
      invite_link: chat.invite_link || (chat.username ? `https://t.me/${chat.username}` : null),
      linked_chat_id: chat.linked_chat_id || null,
      is_verified: chat.is_verified || false
    };
  } catch (e) {
    return null;
  }
}

// ── Helpers ──

async function tgRequest(method, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(`${TG_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return r.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') return { ok: false, description: 'TG API timeout (30s)' };
    throw e;
  }
}

async function tgSendFile(method, chatId, filePath, fieldName, caption, replyMarkup) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(fieldName, fs.createReadStream(filePath));
  if (caption) {
    form.append('caption', caption.substring(0, 1024));
    form.append('parse_mode', 'HTML');
  }
  if (replyMarkup) {
    form.append('reply_markup', JSON.stringify(replyMarkup));
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min for large files
  try {
    const r = await fetch(`${TG_API}/${method}`, { method: 'POST', body: form, signal: controller.signal });
    clearTimeout(timeoutId);
    return r.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') return { ok: false, description: 'File upload timeout (120s)' };
    throw e;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function deleteTgMessage(chatId, messageId) {
  try {
    return await tgRequest('deleteMessage', { chat_id: chatId, message_id: messageId });
  } catch (e) {
    return { ok: false, description: e.message };
  }
}

module.exports = {
  deleteTgMessage,
  sendToSource,
  broadcastPost,
  checkBotAdmin,
  getChatInfo
};
