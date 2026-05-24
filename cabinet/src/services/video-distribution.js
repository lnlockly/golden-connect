/**
 * Phase S.5 — rolling video distribution.
 *
 * Pure cron worker. Once per 5-min tick:
 *   1. Count eligible users (tg_id, banner ready, ref_code).
 *   2. target = clamp(ceil(eligible / 288), 1, MAX_PER_TICK).
 *   3. Pick `target` oldest-served users skipping anyone with a pending
 *      (unreported) assignment, or anyone served within COOLDOWN_HOURS.
 *   4. For each: pick a pool video they haven't seen, run overlay,
 *      sendVideo with [📨 Отправить отчёт] button (callback `vrep:<id>`).
 *
 * Assignment is inserted BEFORE send so a network error leaves a row
 * we can retry from. Used_count on the pool video bumps only after success.
 */
const fs = require('fs');
const { InputFile } = require('grammy');
const { applyDiagonalOverlay } = require('./video-overlay');

const TICKS_PER_DAY = 288;       // 5-min tick × 288 = 24h
const MAX_PER_TICK = 5;          // hard cap — overlay queue is single-threaded
const COOLDOWN_HOURS = 22;       // "1/day" with drift tolerance

function _eligibleCount(db) {
  return db.prepare(
    "SELECT COUNT(*) AS n FROM users " +
    "WHERE tg_id > 0 AND ref_code IS NOT NULL " +
    "  AND video_banner_status='ready' AND video_banner_path IS NOT NULL"
  ).get().n;
}

function _pickUsers(db, limit) {
  return db.prepare(
    "SELECT u.id, u.tg_id, u.tg_username, u.tg_first_name, u.ref_code, " +
    "       u.video_banner_path " +
    "FROM users u " +
    "WHERE u.tg_id > 0 AND u.ref_code IS NOT NULL " +
    "  AND u.video_banner_status='ready' " +
    "  AND u.video_banner_path IS NOT NULL " +
    "  AND (u.last_video_sent_at IS NULL " +
    "       OR u.last_video_sent_at < datetime('now', ?)) " +
    "  AND NOT EXISTS (" +
    "       SELECT 1 FROM tg_video_assignments a " +
    "       WHERE a.user_id = u.id AND a.status = 'pending') " +
    "ORDER BY COALESCE(u.last_video_sent_at, '1970-01-01') ASC, u.id ASC " +
    "LIMIT ?"
  ).all('-' + COOLDOWN_HOURS + ' hours', limit);
}

function _pickVideoForUser(db, userId) {
  return db.prepare(
    "SELECT id, file_path, source_url, hashtag, duration_sec " +
    "FROM tg_video_pool " +
    "WHERE status = 'available' " +
    "  AND id NOT IN (SELECT pool_id FROM tg_video_assignments WHERE user_id = ?) " +
    "ORDER BY used_count ASC, downloaded_at DESC " +
    "LIMIT 1"
  ).get(userId);
}

function _caption(user, video) {
  const handle = user.tg_username
    ? '@' + user.tg_username
    : (user.tg_first_name || 'Партнёр');
  const tag = video.hashtag ? '#' + String(video.hashtag).replace(/^#/, '') : '';
  return (
    '🎬 <b>Твой видео-промо на сегодня</b>\n\n' +
    handle + ', опубликуй это видео в TikTok / Reels / Shorts ' + tag + '\n' +
    'QR-баннер уже встроен и движется по диагонали — зрители его поймают.\n\n' +
    '📊 После публикации жми «📨 Отправить отчёт» → кидай ссылку → +карма + статистика.\n\n' +
    '🔗 <a href="https://goldenConnect.to/?ref=' + user.ref_code + '">Твоя реф-ссылка</a>'
  );
}

async function _sendOne(bot, db, user) {
  const video = _pickVideoForUser(db, user.id);
  if (!video) return { skipped: 'pool_empty' };
  if (!video.file_path || !fs.existsSync(video.file_path)) {
    db.prepare("UPDATE tg_video_pool SET status='missing' WHERE id=?").run(video.id);
    return { skipped: 'pool_file_missing', poolId: video.id };
  }
  if (!user.video_banner_path || !fs.existsSync(user.video_banner_path)) {
    return { skipped: 'banner_missing' };
  }

  let overlayPath;
  try {
    overlayPath = await applyDiagonalOverlay({
      srcVideo: video.file_path,
      bannerPng: user.video_banner_path,
      durationSec: video.duration_sec || null,
    });
  } catch (e) {
    return { skipped: 'overlay_failed', error: e.message };
  }

  const ins = db.prepare(
    "INSERT INTO tg_video_assignments (user_id, pool_id, overlay_path, status) " +
    "VALUES (?, ?, ?, 'pending')"
  ).run(user.id, video.id, overlayPath);
  const assignmentId = ins.lastInsertRowid;

  try {
    await bot.api.sendVideo(user.tg_id, new InputFile(overlayPath), {
      caption: _caption(user, video),
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '📨 Отправить отчёт', callback_data: 'vrep:' + assignmentId },
          { text: '🎬 Мои видео-промо', callback_data: 'vmenu' },
        ]],
      },
    });
  } catch (e) {
    db.prepare("UPDATE tg_video_assignments SET status='failed' WHERE id=?").run(assignmentId);
    // Cleanup overlay file — no point keeping it if user never saw it
    try { fs.unlinkSync(overlayPath); } catch (_) {}
    return { skipped: 'send_failed', error: e.message };
  }

  db.prepare("UPDATE tg_video_pool SET used_count = used_count + 1 WHERE id = ?").run(video.id);
  db.prepare("UPDATE users SET last_video_sent_at = datetime('now') WHERE id = ?").run(user.id);
  return { sent: true, assignmentId, poolId: video.id, userId: user.id };
}

async function tickDistribute(bot, db) {
  const eligible = _eligibleCount(db);
  if (!eligible) return { eligible: 0, target: 0, sent: 0, skipped: [] };
  const target = Math.min(MAX_PER_TICK, Math.max(1, Math.ceil(eligible / TICKS_PER_DAY)));
  const candidates = _pickUsers(db, target);
  if (!candidates.length) return { eligible, target, sent: 0, skipped: [] };

  const out = { eligible, target, sent: 0, skipped: [] };
  for (const u of candidates) {
    try {
      const r = await _sendOne(bot, db, u);
      if (r.sent) out.sent++;
      else out.skipped.push(Object.assign({ user: u.id }, r));
    } catch (e) {
      out.skipped.push({ user: u.id, error: e && e.message });
    }
  }
  return out;
}

module.exports = {
  tickDistribute,
  TICKS_PER_DAY,
  MAX_PER_TICK,
  COOLDOWN_HOURS,
};
