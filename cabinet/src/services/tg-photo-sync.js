// TG photo sync — fetch user profile photo via Bot API and save URL to db.
// Works only for users who have started/messaged the bot at least once.
const https = require('https');

const BOT_TOKEN = process.env.BOT_TOKEN || '';

function tgApi(method, params) {
  return new Promise((resolve, reject) => {
    if (!BOT_TOKEN) return reject(new Error('BOT_TOKEN missing'));
    const data = JSON.stringify(params || {});
    const req = https.request({
      method: 'POST', hostname: 'api.telegram.org', port: 443,
      path: '/bot' + BOT_TOKEN + '/' + method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      }, timeout: 10000,
    }, (r) => {
      let buf = ''; r.on('data', c => buf += c);
      r.on('end', () => {
        try {
          const j = JSON.parse(buf);
          if (!j.ok) return reject(new Error(j.description || 'tg_error'));
          resolve(j.result);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('tg_timeout')));
    req.write(data); req.end();
  });
}

/**
 * Get TG user's avatar URL or null. Returns null silently if user hasn't
 * messaged the bot or has no photo.
 */
async function fetchTgAvatar(tgUserId) {
  if (!tgUserId || !BOT_TOKEN) return null;
  try {
    const photos = await tgApi('getUserProfilePhotos', { user_id: Number(tgUserId), limit: 1 });
    if (!photos || !photos.photos || !photos.photos.length) return null;
    const sizes = photos.photos[0]; // first photo, all sizes
    if (!sizes || !sizes.length) return null;
    // Pick the largest size that's not too big — typically 320x320
    const target = sizes.find(s => s.width >= 160 && s.width <= 640) || sizes[sizes.length - 1];
    if (!target || !target.file_id) return null;

    const file = await tgApi('getFile', { file_id: target.file_id });
    if (!file || !file.file_path) return null;
    return 'https://api.telegram.org/file/bot' + BOT_TOKEN + '/' + file.file_path;
  } catch (e) {
    if (!/USER_NOT_PARTICIPANT|chat not found|user is deactivated|file is too big/i.test(e.message || '')) {
      console.warn('[tg-photo-sync]', tgUserId, e.message);
    }
    return null;
  }
}

/**
 * Get TG user's full info (first_name, last_name, username) or null.
 * Requires user_id. Uses getChat which works for users who messaged bot.
 */
async function fetchTgUserInfo(tgUserId) {
  if (!tgUserId || !BOT_TOKEN) return null;
  try {
    const chat = await tgApi('getChat', { chat_id: Number(tgUserId) });
    if (!chat) return null;
    return {
      first_name: chat.first_name || null,
      last_name: chat.last_name || null,
      username: chat.username || null,
      bio: chat.bio || null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Sync TG profile to api Postgres via internal endpoint.
 */
async function syncToApi(tgUserId, avatarUrl, info) {
  const apiBase = process.env.TRENDEX_API_INTERNAL_URL || 'http://trendex-api:4001';
  const apiSecret = process.env.TRENDEX_API_INTERNAL_SECRET;
  if (!apiSecret) return;
  const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
  const data = JSON.stringify({
    tg_id: tgUserId,
    avatar_url: avatarUrl,
    first_name: info && info.first_name,
    last_name: info && info.last_name,
    username: info && info.username,
  });
  return new Promise((resolve) => {
    try {
      const url = new URL(apiBase + '/internal/users/update-tg-profile');
      const req = httpMod.request({
        method: 'POST', hostname: url.hostname,
        port: url.port || (apiBase.startsWith('https') ? 443 : 80),
        path: url.pathname,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-trendex-secret': apiSecret,
        }, timeout: 5000,
      }, (r) => { r.resume(); resolve(r.statusCode); });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(0); });
      req.write(data); req.end();
    } catch (_) { resolve(0); }
  });
}

/**
 * Main entry — sync everything for this tgUserId.
 * Fire-and-forget. Never throws to caller.
 */
async function syncTgProfile(tgUserId) {
  if (!tgUserId) return;
  try {
    const [avatarUrl, info] = await Promise.all([
      fetchTgAvatar(tgUserId),
      fetchTgUserInfo(tgUserId),
    ]);
    if (!avatarUrl && !info) return;
    await syncToApi(tgUserId, avatarUrl, info);
  } catch (e) {
    console.warn('[tg-photo-sync] syncTgProfile failed', tgUserId, e.message);
  }
}

module.exports = { syncTgProfile, fetchTgAvatar, fetchTgUserInfo };
