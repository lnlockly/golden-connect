// cabinet/src/middleware/tg-initdata.js
// Telegram WebApp initData validator.
// Spec: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// Usage (app.js mount order):
//   app.use(require('./middleware/tg-initdata').tgInitData);
//   app.use('/api/mlm', require('./routes/mlm-crm'));
//
// On every request, if header `X-Telegram-InitData` is present and valid,
// `req.tgUser` is set { id, username, first_name, language_code }
// and `req.webUser` is shimmed to `{ id: 'tg_' + tg.id, email: 'tg_'+id+'@tg.bot', ... }`
// so downstream `ownerId(req)` resolves to a stable per-TG-user identity
// without forcing a real cabinet registration.

const crypto = require('crypto');

const INITDATA_TTL_SEC = 24 * 60 * 60; // 1 day — TG default

function readInitData(req) {
  return (
    req.headers['x-telegram-initdata'] ||
    req.headers['x-telegram-init-data'] ||
    (req.query && req.query.tgInitData) ||
    ''
  );
}

function verifyInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  // Canonical pair string: keys sorted alphabetically, joined "k=v\nk=v..."
  const pairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (computedHash !== hash) return null;
  // Replay-protection: TG signs `auth_date` in seconds.
  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > INITDATA_TTL_SEC) return null;
  let user = null;
  try { user = JSON.parse(params.get('user') || 'null'); } catch (_) {}
  if (!user || !user.id) return null;
  return {
    id: user.id,
    username: user.username || null,
    first_name: user.first_name || null,
    last_name: user.last_name || null,
    language_code: user.language_code || null,
    is_premium: !!user.is_premium,
    photo_url: user.photo_url || null,
    raw: initData,
  };
}

function tgInitData(req, res, next) {
  try {
    const token = process.env.BOT_TOKEN || process.env.TG_BOT_TOKEN || '';
    const raw = readInitData(req);
    if (!raw || !token) return next();
    const u = verifyInitData(String(raw), token);
    if (!u) return next();
    req.tgUser = u;
    // Synthesize a webUser so ownerId() picks it up.
    if (!req.webUser || !req.webUser.id) {
      req.webUser = {
        id: 'tg_' + u.id,
        email: 'tg_' + u.id + '@tg.bot',
        tg_id: u.id,
        tg_username: u.username,
        tg_first_name: u.first_name,
        tg_language: u.language_code,
        viaTg: true,
      };
      req.user = req.webUser;
    }
  } catch (_) { /* swallow — never block API on validator bugs */ }
  return next();
}

// Internal impersonation: bot server calls cabinet with X-Internal-Secret +
// X-Internal-Owner: tg_<id>. Cabinet trusts the header and sets req.webUser.
// Lets the bot reuse every public /api/mlm/* endpoint without duplicating
// routes for "internal" variants.
function internalImpersonate(req, res, next) {
  try {
    const secret = process.env.INTERNAL_API_SECRET || '';
    const got = req.headers['x-internal-secret'] || '';
    if (!secret || got !== secret) return next();
    const owner = String(req.headers['x-internal-owner'] || '').trim();
    if (!owner) return next();
    if (!req.webUser || !req.webUser.id) {
      req.webUser = {
        id: owner,
        email: owner.startsWith('tg_') ? owner + '@tg.bot' : owner + '@internal',
        viaInternal: true,
      };
      req.user = req.webUser;
    }
  } catch (_) {}
  return next();
}

module.exports = { tgInitData, verifyInitData, internalImpersonate };
