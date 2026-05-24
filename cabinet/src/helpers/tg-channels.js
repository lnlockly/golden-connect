// Unified TG-channels registry. ad_sources is the canonical store; this
// module is the only API that other services should use to read/write user
// channels — keeps the storage replaceable in one place.
const dbModule = require('../planner/db/database');

function list(userId) {
  const db = dbModule.getDb();
  return db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND status!='removed' ORDER BY added_at DESC").all(userId);
}

function getById(userId, id) {
  const db = dbModule.getDb();
  return db.prepare("SELECT * FROM ad_sources WHERE id=? AND user_id=? AND status!='removed'").get(id, userId);
}

function findByChatId(userId, chatId) {
  const db = dbModule.getDb();
  return db.prepare("SELECT * FROM ad_sources WHERE user_id=? AND tg_chat_id=? AND status!='removed'").get(userId, String(chatId));
}

function add(userId, payload) {
  // payload: { chat_id, type, title, username, member_count, bot_is_admin, photo_url, description, invite_link }
  const db = dbModule.getDb();
  const r = db.prepare(
    "INSERT INTO ad_sources (user_id, type, tg_chat_id, title, username, member_count, bot_is_admin, photo_url, description, invite_link) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    userId,
    payload.type || 'tg_channel',
    String(payload.chat_id),
    payload.title || '',
    payload.username || '',
    payload.member_count || 0,
    payload.bot_is_admin ? 1 : 0,
    payload.photo_url || null,
    payload.description || null,
    payload.invite_link || null,
  );
  return getById(userId, r.lastInsertRowid);
}

function softRemove(userId, id) {
  const db = dbModule.getDb();
  return db.prepare("UPDATE ad_sources SET status='removed' WHERE id=? AND user_id=?").run(id, userId).changes > 0;
}

function updateMeta(userId, id, patch) {
  const db = dbModule.getDb();
  const fields = ['title', 'username', 'member_count', 'bot_is_admin', 'photo_url', 'description', 'invite_link', 'avatar_url', 'is_verified', 'slow_mode_delay', 'avg_post_views'];
  for (const f of fields) {
    if (patch[f] !== undefined) {
      db.prepare("UPDATE ad_sources SET " + f + "=? WHERE id=? AND user_id=?").run(patch[f], id, userId);
    }
  }
  return getById(userId, id);
}

function getUsage(userId, channelId) {
  // Returns where this channel is referenced across services.
  const db = dbModule.getDb();
  const out = { adcenter: { posts_sent: 0, in_campaigns: 0, in_monitors: 0 }, adx: { listed: false } };
  try { out.adcenter.posts_sent = db.prepare("SELECT COUNT(*) c FROM ad_post_sources WHERE source_id=? AND status='sent'").get(channelId).c || 0; } catch (_) {}
  try { out.adcenter.in_campaigns = db.prepare("SELECT COUNT(DISTINCT campaign_id) c FROM ad_campaign_sources WHERE source_id=?").get(channelId).c || 0; } catch (_) {}
  try {
    const ch = getById(userId, channelId);
    if (ch) {
      out.adcenter.in_monitors = db.prepare(
        "SELECT COUNT(*) c FROM ad_monitor_sources WHERE user_id=? AND target_sources_json LIKE ?"
      ).get(userId, '%' + channelId + '%').c || 0;
    }
  } catch (_) {}
  try {
    const adx = db.prepare("SELECT id FROM adx_channels WHERE source_id=? AND user_id=?").get(channelId, userId);
    out.adx.listed = !!adx;
  } catch (_) {}
  return out;
}

module.exports = { list, getById, findByChatId, add, softRemove, updateMeta, getUsage };
