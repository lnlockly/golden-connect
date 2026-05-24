const express = require('express');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { buildSiteContent } = require('./site-content');
const { getBalance } = require('./services/balance-bridge');
const { createGoldenConnectVideoLibrary } = require('./video-library');
const { createRateLimiter } = require('./rate-limit');
const { hasGroqKeys, requestGroqChatCompletion } = require('./utils/groq-rotator');
const { createAdxRouter } = require('./routes/adx');
const { createAdsWebRouter } = require('./routes/ads-web');
const { createShortenerRouter, createBioRouter, createPublicRedirectRouter, createProductsRouter } = require('./routes/shrbio');
const { createCryptomusRouter } = require('./routes/cryptomus');
const { createWithdrawalsRouter } = require('./routes/withdrawals');
const { createAdCenterRouter } = require('./routes/ad-center');
const { createRoboaiRouter } = require('./routes/roboai');
const { applyAdCenterSchema } = require('./adc-migrate');
const { applyShopSchema } = require('./shop-migrate');
const { applyPlategaSchema } = require('./platega-migrate');
const { createPlategaRouter, createWebhookRouter: createPlategaWebhookRouter } = require('./routes/platega');
const adcTick = require('./adc-tick');
const { applyShrBioSchema } = require('./shrbio-migrate');
const { applyAdxSchema } = require('./adx-migrate');
const { applyAdsSiteSchema } = require('./adsite-migrate');
const { createAdsSiteRouter } = require('./routes/ads-site');
const _trxBilling = require('./services/trx-billing');
const _trustScore = require('./services/trust-score');

function parseModelJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const variants = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) variants.push(fenced[1].trim());
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) variants.push(text.slice(firstBrace, lastBrace + 1));
  for (const candidate of variants) {
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }
  return null;
}

function normalizeAiList(value, limit = 8) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeAiDraft(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    title: String(data.title || '').trim(),
    topic: String(data.topic || '').trim(),
    description: String(data.description || '').trim(),
    speakers: normalizeAiList(data.speakers, 8),
    tags: normalizeAiList(data.tags, 12),
    announcementPost: String(data.announcementPost || '').trim(),
    registrationCta: String(data.registrationCta || '').trim(),
    shortHook: String(data.shortHook || '').trim(),
  };
}

function buildAdminEventAiMessages(body) {
  const mode = String(body.mode || 'both').trim().toLowerCase();
  const brief = String(body.brief || '').trim();
  const title = String(body.title || '').trim();
  const topic = String(body.topic || '').trim();
  const description = String(body.description || '').trim();
  const startsAt = String(body.startsAt || '').trim();
  const durationMinutes = Number(body.durationMinutes || 0) || 90;
  const speakers = Array.isArray(body.speakers) ? body.speakers : [];
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const joinUrl = String(body.joinUrl || '').trim();

  const modeHint = mode === 'post'
    ? 'Сфокусируйся на сильном посте-анонсе для Telegram и социальных сетей.'
    : mode === 'fill'
      ? 'Сфокусируйся на качественном заполнении карточки эфира.'
      : 'Сделай и качественную карточку эфира, и сильный пост-анонс.';

  return [
    {
      role: 'system',
      content:
        'Ты маркетинговый AI-редактор проекта Golden Connect. Помогаешь администратору быстро готовить продающие, аккуратные и понятные анонсы эфиров, встреч и конференций. ' +
        'Пиши только по-русски. Стиль: уверенный, живой, тёплый, профессиональный. ' +
        'Не пиши медицинских диагнозов, не обещай гарантированного излечения, не используй агрессивный кликбейт. ' +
        'Нужен не сухой справочник, а продающая и удобная для публикации подача. ' +
        'Верни только JSON без пояснений и без markdown. ' +
        'Формат JSON: {"title":"","topic":"","description":"","speakers":[""],"tags":[""],"announcementPost":"","registrationCta":"","shortHook":""}.',
    },
    {
      role: 'user',
      content:
        `Подготовь материалы для страницы "Управление эфирами". ${modeHint}\n\n` +
        `Что уже известно:\n` +
        `Название: ${title || 'не заполнено'}\n` +
        `Тема: ${topic || 'не заполнено'}\n` +
        `Описание: ${description || 'не заполнено'}\n` +
        `Дата и время: ${startsAt || 'не заполнено'}\n` +
        `Длительность: ${durationMinutes} минут\n` +
        `Спикеры: ${speakers.length ? speakers.join(', ') : 'не заполнено'}\n` +
        `Теги: ${tags.length ? tags.join(', ') : 'не заполнено'}\n` +
        `Ссылка на эфир: ${joinUrl || 'не заполнено'}\n` +
        `Бриф от администратора: ${brief || 'нет дополнительного брифа'}\n\n` +
        `Требования:\n` +
        `1. title — сильное название эфира, без мусора и канцелярита.\n` +
        `2. topic — короткая тема или категория.\n` +
        `3. description — 2-3 абзаца для карточки эфира: что будет, для кого, почему стоит прийти.\n` +
        `4. speakers — список спикеров, если их можно корректно сформулировать.\n` +
        `5. tags — короткие тематические теги без #.\n` +
        `6. announcementPost — готовый продающий пост-анонс для Telegram: сильный первый абзац, смысл программы, кому полезно, призыв прийти. Если есть дата, время и ссылка, органично впиши их.\n` +
        `7. registrationCta — короткий отдельный призыв к действию.\n` +
        `8. shortHook — короткий цепляющий подзаголовок или первая строка.\n` +
        `9. Ничего не выдумывай, если данных нет: лучше аккуратно обобщи.\n` +
        `10. Верни только JSON.`,
    },
  ];
}

const { createTrdxExchangeRoutes } = require('./routes/trdx-exchange');
const { createPartnersRouter } = require('./routes/partners');
function createWebRouter(config, storage, bot) {
  const router = express.Router();
  const siteContent = buildSiteContent(config);
  try { applyAdxSchema(); } catch (e) { console.error('[adx-migrate_failed]', e && e.message); }
  try { applyAdsSiteSchema(); } catch (e) { console.error('[adsite-migrate_failed]', e && e.message); }
  // [ads-site-mount-after-bodyparser] init billing + trust here, mount router LATER (after express.json)
  try { _trxBilling.init(storage); _trustScore.init(storage); } catch(e){ console.error('[ads-site-init]', e && e.message); }
  const _adsRouter = createAdsSiteRouter({ requireAuth, requireAdmin, storage, bot });
  router._adsRouter = _adsRouter;
  try { applyAdCenterSchema(); } catch (e) { console.error('[adc-migrate_failed]', e && e.message); }
  try { applyShopSchema(); } catch (e) { console.error('[shop-migrate_failed]', e && e.message); }
  try { require('./digest-cron').start(); } catch (e) { console.error('[digest-cron_failed]', e && e.message); }
  try { applyPlategaSchema(); } catch (e) { console.error('[platega-migrate_failed]', e && e.message); }
  try { adcTick.start(); } catch (e) { console.error('[adc-tick_failed]', e && e.message); }
  try { applyShrBioSchema(); } catch (e) { console.error('[shrbio-migrate_failed]', e && e.message); }
  const goldenConnectVideoLibrary = createGoldenConnectVideoLibrary(config);
  const protocolTemplates = Array.isArray(siteContent.memberPortal && siteContent.memberPortal.protocolTemplates)
    ? siteContent.memberPortal.protocolTemplates
    : Array.isArray(siteContent.protocols)
      ? siteContent.protocols
      : [];
  const onboardingSteps = Array.isArray(siteContent.memberPortal && siteContent.memberPortal.onboardingSteps)
    ? siteContent.memberPortal.onboardingSteps
    : [];
  const supportCategories = Array.isArray(siteContent.memberPortal && siteContent.memberPortal.supportCategories)
    ? siteContent.memberPortal.supportCategories
    : [];
  const cookieName = String(config.sessionCookieName || 'goldenConnect_site_session').trim();
  const sessionTtlDays = Math.max(1, Math.min(180, Number(config.sessionTtlDays || 30)));
  const secureCookies = /^https:\/\//i.test(String(config.publicBaseUrl || ''));
  const contentAdminEmails = new Set(
    (Array.isArray(config.contentAdminEmails) ? config.contentAdminEmails : [])
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  );

  router.use(express.json({ limit: '1mb' }));
  router.use(express.urlencoded({ extended: false }));

  // [ads-site-mount-after-bodyparser] mount AFTER body parser so req.body is populated
  router.use('/api/ads-site', _adsRouter);

  const rateLimitEnabled = config.rateLimitEnabled !== false;
  const apiLimiter = rateLimitEnabled
    ? createRateLimiter({
        name: 'api',
        windowMs: 60 * 1000,
        max: Number(config.rateLimitApiPerMin || 300),
      })
    : (req, res, next) => next();
  const publicLimiter = rateLimitEnabled
    ? createRateLimiter({
        name: 'public',
        windowMs: 60 * 1000,
        max: Number(config.rateLimitPublicPerMin || 60),
      })
    : (req, res, next) => next();
  const authLimiter = rateLimitEnabled
    ? createRateLimiter({
        name: 'auth',
        windowMs: 60 * 1000,
        max: Number(config.rateLimitAuthPerMin || 10),
        message: 'Слишком много попыток входа. Подождите минуту.',
      })
    : (req, res, next) => next();

  router.use('/api', apiLimiter);
  // [global-write-rate-limit] 60 writes/min per IP for any /api POST/PUT/DELETE
  const _writeLimits = new Map();
  router.use('/api', function (req, res, next) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (!ip) return next();
    const now = Date.now();
    const lim = _writeLimits.get(ip) || { count: 0, reset: now + 60000 };
    if (now > lim.reset) { lim.count = 0; lim.reset = now + 60000; }
    lim.count++;
    _writeLimits.set(ip, lim);
    if (lim.count > 60) {
      res.set('Retry-After', String(Math.ceil((lim.reset - now) / 1000)));
      return res.status(429).json({ ok: false, error: 'rate_limit', retry_after_sec: Math.ceil((lim.reset - now) / 1000) });
    }
    next();
  });
  router.use('/api/public', publicLimiter);
  router.use('/api/auth/login', authLimiter);
  router.use('/api/auth/register', authLimiter);
  router.use('/api/auth/bot/start', authLimiter);

  function parseCookies(req) {
    const raw = String((req.headers && req.headers.cookie) || '');
    if (!raw) return {};
    return raw.split(';').reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx <= 0) return acc;
      const key = decodeURIComponent(part.slice(0, idx).trim());
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      if (key) acc[key] = value;
      return acc;
    }, {});
  }

  function serializeCookie(name, value, options = {}) {
    // [sso-cookie] domain option lets session cookie span goldenConnect.to subdomains
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
    parts.push(`Max-Age=${Math.max(0, Number(options.maxAge || 0))}`);
    parts.push(`Path=${options.path || '/'}`);
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.httpOnly !== false) parts.push('HttpOnly');
    parts.push(`SameSite=${options.sameSite || 'Lax'}`);
    if (options.secure) parts.push('Secure');
    return parts.join('; ');
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', serializeCookie(cookieName, '', {
      maxAge: 0,
      path: config.basePath || '/',
      secure: secureCookies,
      domain: config.cookieDomain || undefined,
    }));
  }

  function validatePassword(password) {
    const value = String(password || '');
    if (value.length < 8) return { ok: false, reason: 'too_short' };
    if (value.length > 128) return { ok: false, reason: 'too_long' };
    return { ok: true };
  }

  function createSessionForUser(req, res, userId) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = storage.hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + (sessionTtlDays * 24 * 60 * 60 * 1000)).toISOString();
    const session = storage.createWebSession(userId, tokenHash, {
      expiresAt,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
    res.setHeader('Set-Cookie', serializeCookie(cookieName, rawToken, {
      maxAge: sessionTtlDays * 24 * 60 * 60,
      path: config.basePath || '/',
      secure: secureCookies,
      domain: config.cookieDomain || undefined,
    }));
    return session;
  }


  // ── Telegram WebApp initData verification ────────────────────────
  // Verifies the HMAC-signed payload Telegram passes when a user opens
  // the WebApp from a bot menu button. Returns the parsed user profile
  // if the signature is valid, null otherwise.
  function _verifyTgWebAppInitData(initData) {
    try {
      const botToken = process.env.BOT_TOKEN || '';
      if (!botToken || !initData) return null;
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      if (!hash) return null;
      params.delete('hash');
      const checkString = Array.from(params.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => k + '=' + v)
        .join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const computed = crypto.createHmac('sha256', secretKey).update(checkString).digest('hex');
      if (computed !== hash) return null;
      // Optional: reject very old auth_date (>24h)
      const authDate = Number(params.get('auth_date') || 0);
      if (authDate && Date.now() / 1000 - authDate > 24 * 3600) return null;
      const userJson = params.get('user');
      if (!userJson) return null;
      const user = JSON.parse(userJson);
      if (!user || !user.id) return null;
      return {
        id: Number(user.id),
        username: user.username || null,
        first_name: user.first_name || null,
        last_name: user.last_name || null,
        language_code: user.language_code || null,
        is_premium: !!user.is_premium,
        photo_url: user.photo_url || null,
        start_param: params.get('start_param') || null,
      };
    } catch (e) {
      console.warn('[tg-webapp-auth] verify failed:', e.message);
      return null;
    }
  }

  router.post('/api/auth/tg-webapp', (req, res) => {
    try {
      const initData = String((req.body && req.body.initData) || '').trim();
      if (!initData) return res.status(400).json({ ok: false, reason: 'init_data_required' });

      const tgUser = _verifyTgWebAppInitData(initData);
      if (!tgUser) return res.status(401).json({ ok: false, reason: 'invalid_init_data' });

      // Reuse existing bot-OTP flow: create a synthetic request, then complete it.
      // This exercises the same tested find-or-create logic in storage.
      const reqRow = storage.createBotAuthRequest({
        ip: req.ip,
        userAgent: req.headers['user-agent'] || 'tg-webapp',
      });
      const completion = storage.completeBotAuthRequest(reqRow.requestId, {
        id: tgUser.id,
        username: tgUser.username,
        first_name: tgUser.first_name,
        last_name: tgUser.last_name,
        languageCode: tgUser.language_code,
      });
      if (!completion.ok || !completion.user) {
        return res.status(500).json({ ok: false, reason: completion.reason || 'complete_failed' });
      }
      // Capture inviter from TG WebApp start_param (e.g. start_param=ref_xhCODE).
      // Only set ONCE; never overwrite an existing referredByUserId so users
      // can't shop around for a new sponsor by re-clicking ref links.
      try {
        const sp = String(tgUser.start_param || '').trim();
        if (sp.startsWith('ref_') && completion.user && !completion.user.referredByUserId) {
          const refCode = sp.slice(4).toLowerCase();
          if (refCode && storage.findWebUserByReferralCode) {
            const inviter = storage.findWebUserByReferralCode(refCode);
            if (inviter && inviter.id !== completion.user.id && storage.setWebUserReferredBy) {
              storage.setWebUserReferredBy(completion.user.id, inviter.id);
              try { storage.logReferralActivity && storage.logReferralActivity(completion.user.id, 'tg_webapp_register'); } catch {}
            }
          }
        }
      } catch (e) {
        console.error('[tg-webapp-auth] inviter capture failed:', e && e.message);
      }

      // Revoke any existing session for a different user
      const existingCtx = resolveSession(req);
      if (existingCtx && existingCtx.tokenHash && existingCtx.user && existingCtx.user.id !== completion.user.id) {
        storage.revokeWebSession(existingCtx.tokenHash);
      }
      // Set new session cookie
      storage.updateWebUserLogin(completion.user.id);
      createSessionForUser(req, res, completion.user.id);
      // Quest auto-triggers (best-effort, never block auth)
      try {
        const u = completion.user;
        if (u && u.id && QUESTS && Array.isArray(QUESTS)) {
          const triggersToFire = ['login_streak', 'telegram_linked'];
          for (const trigger of triggersToFire) {
            const matched = QUESTS.filter(q => q.type === 'auto' && q.trigger === trigger && !q.triggerValue);
            for (const q of matched) {
              try { storage.completeQuest(u.id, q.id, q.xp); } catch {}
            }
          }
        }
      } catch (e) { console.error('[quest_trigger]', e && e.message); }
      const publicUser = storage.getPublicWebUserById(completion.user.id);
      return res.json({ ok: true, user: publicUser, isNew: completion.created === true });
    } catch (e) {
      console.error('[tg-webapp-auth] error:', e.message);
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });


    function resolveSession(req) {
    const cookies = parseCookies(req);
    const rawToken = String(cookies[cookieName] || '').trim();
    if (!rawToken) return null;
    const tokenHash = storage.hashSha256(rawToken);
    const session = storage.getWebSession(tokenHash);
    if (!session) return null;
    storage.touchWebSession(session.id);
    return {
      rawToken,
      tokenHash,
      session,
      user: session.user,
    };
  }

  function requireAuth(req, res, next) {
    const sessionCtx = resolveSession(req);
    if (!sessionCtx || !sessionCtx.user) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, reason: 'auth_required' });
    }
    req.webSessionCtx = sessionCtx;
    req.webSession = sessionCtx.session;
    req.webUser = sessionCtx.user;
    return next();
  }

  function parseLimit(value, fallback = 20, max = 300) {
    const resolved = Number(value);
    if (!Number.isFinite(resolved)) return fallback;
    return Math.max(1, Math.min(max, Math.floor(resolved)));
  }

  function canManageMediaLibrary(user) {
    if (!user) return false;
    const email = String(user.email || '').trim().toLowerCase();
    if (email && contentAdminEmails.has(email)) return true;
    if (!contentAdminEmails.size) {
      const role = String(user.userRole || '').trim().toLowerCase();
      const isRootPartner = !Number(user.referredByUserId || 0) && ['partner', 'hybrid'].includes(role);
      return Number(user.id || 0) === 1 || isRootPartner;
    }
    return false;
  }

  function isContentAdmin(user) {
    if (!user) return false;
    const email = String(user.email || '').trim().toLowerCase();
    if (email && contentAdminEmails.has(email)) return true;
    // Fallback: пользователь id=1 (root/owner) всегда админ
    if (Number(user.id || 0) === 1) return true;
    return false;
  }

  function requireAdmin(req, res, next) {
    const sessionCtx = resolveSession(req);
    if (!sessionCtx || !sessionCtx.user) {
      return res.status(401).json({ ok: false, reason: 'auth_required' });
    }
    if (!isContentAdmin(sessionCtx.user)) {
      return res.status(403).json({ ok: false, reason: 'forbidden' });
    }
    req.webSessionCtx = sessionCtx;
    req.webUser = sessionCtx.user;
    return next();
  }

  function publicEventShape(ev, opts = {}) {
    if (!ev) return null;
    const refCode = String(opts.refCode || '').trim();
    let recordingUrl = String(ev.recordingUrl || '').trim();
    if (!recordingUrl && ev.recordingVideoId) {
      const params = new URLSearchParams();
      if (refCode) params.set('ref', refCode);
      params.set('src', 'video');
      params.set('video', String(ev.recordingVideoId));
      recordingUrl = `/media?${params.toString()}`;
    }
    return {
      id: ev.id,
      title: ev.title,
      description: ev.description,
      speakerName: ev.speakerName,
      speakers: Array.isArray(ev.speakers) ? ev.speakers : [],
      topic: ev.topic || '',
      startsAt: ev.startsAt,
      durationMinutes: ev.durationMinutes,
      timezone: ev.timezone || 'Europe/Moscow',
      coverImage: ev.coverImage || '',
      joinUrl: ev.joinUrl || '',
      recordingUrl,
      recordingVideoId: ev.recordingVideoId || '',
      tags: Array.isArray(ev.tags) ? ev.tags : [],
      status: ev.status || 'upcoming',
      visibility: ev.visibility || 'public',
    };
  }

  function buildMediaLibraryItems(limit) {
    const safeLimit = parseLimit(limit, 300, 1000);
    const manualItems = typeof storage.listMediaLibraryEntries === 'function'
      ? storage.listMediaLibraryEntries(safeLimit)
      : [];
    const videoItems = goldenConnectVideoLibrary.listVideoItems(safeLimit);
    const combined = videoItems.concat(manualItems);
    const seen = new Set();
    const deduped = [];

    combined.forEach((item) => {
      const key = String(item && (item.id || item.sourceExternalId || item.url || item.title) || '').trim().toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      deduped.push(item);
    });

    deduped.sort((a, b) => {
      const aVideo = String(a && a.kind || '') === 'video';
      const bVideo = String(b && b.kind || '') === 'video';
      if (aVideo !== bVideo) return aVideo ? -1 : 1;
      const scoreDiff = (Number(b && b.featuredScore || 0) || 0) - (Number(a && a.featuredScore || 0) || 0);
      if (scoreDiff) return scoreDiff;
      const aTime = Date.parse(a && a.updatedAt || a && a.createdAt || '') || 0;
      const bTime = Date.parse(b && b.updatedAt || b && b.createdAt || '') || 0;
      return bTime - aTime;
    });

    return deduped.slice(0, safeLimit);
  }

  function mediaLibraryPermissions(user) {
    return {
      canManage: canManageMediaLibrary(user),
      mode: contentAdminEmails.size ? 'configured_admins' : 'owner_fallback',
    };
  }

  function compactPublicMediaItem(item, options = {}) {
    if (!item || typeof item !== 'object') return item;
    const compact = { ...item };
    const includeTranscript = Boolean(options.includeTranscript);
    if (!includeTranscript && typeof compact.transcript === 'string' && compact.transcript) {
      if (!compact.transcriptPreview) {
        compact.transcriptPreview = compact.transcript.slice(0, 900);
      }
      compact.transcript = null;
    }
    return compact;
  }

  // Public landing stats — total users / joined 24h / payments week
  // Proxies to api /internal/admin/metrics-summary, no auth required.
  router.get('/api/public/stats', async (req, res) => {
    try {
      const data = await callGoldenConnectApi('/internal/admin/metrics-summary');
      const m = (data && data.metrics) || {};
      res.json({
        ok: true,
        users_total: Number(m.users_total || 0),
        users_joined_24h: Number(m.users_joined_24h || 0),
        payments_week_usd: Number(m.payments_week_usd || 0),
      });
    } catch (e) {
      res.json({ ok: false, users_total: 0, users_joined_24h: 0, payments_week_usd: 0 });
    }
  });

  router.get('/api/public/media-library', (req, res) => {
    const rawId = String((req.query && (req.query.video || req.query.id)) || '').trim();
    if (rawId) {
      const item = goldenConnectVideoLibrary.getVideoItemById(rawId);
      if (!item) {
        return res.status(404).json({ ok: false, reason: 'not_found' });
      }
      const includeTranscript = String((req.query && req.query.full) || '').trim() === '1';
      return res.json({ ok: true, item: compactPublicMediaItem(item, { includeTranscript }) });
    }
    const safeLimit = parseLimit(req.query && req.query.limit, 200, 600);
    const items = goldenConnectVideoLibrary.listVideoItems(safeLimit).map(compactPublicMediaItem);
    return res.json({
      ok: true,
      items,
    });
  });

  // ── Karma proxy endpoints ──

  // ── Bonus matrix proxy ──
  router.get('/api/bonus-matrix/me', requireAuth, async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId || u.telegram_user_id;
      const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const data = await callGoldenConnectApi('/internal/bonus-matrix/me', { email: email });
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/bonus-matrix/tree', requireAuth, async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId || u.telegram_user_id;
      const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const depth = Math.min(parseInt(req.query.depth, 10) || 4, 6);
      const focusUserId = parseInt(req.query.focus_user_id, 10);
      let path = '/internal/bonus-matrix/tree?depth=' + depth;
      if (focusUserId && focusUserId > 0) {
        path += '&focus_user_id=' + focusUserId;
      } else {
        path += '&email=' + encodeURIComponent(email);
      }
      const data = await callGoldenConnectApi(path);
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/bonus-matrix/upline', requireAuth, async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId || u.telegram_user_id;
      const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const userIdParam = parseInt(req.query.user_id, 10);
      const height = Math.min(parseInt(req.query.height, 10) || 10, 30);
      let path = '/internal/bonus-matrix/upline?height=' + height;
      if (userIdParam && userIdParam > 0) {
        path += '&user_id=' + userIdParam;
      } else {
        path += '&email=' + encodeURIComponent(email);
      }
      const data = await callGoldenConnectApi(path);
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/bonus-matrix/global', publicLimiter, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const data = await callGoldenConnectApi('/internal/bonus-matrix/global?limit=' + limit);
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/karma/leaderboard', publicLimiter, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const data = await callGoldenConnectApi('/internal/karma/leaderboard?limit=' + limit);
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/karma/me', requireAuth, async (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId || u.telegram_user_id;
      const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const data = await callGoldenConnectApi('/internal/karma/me', { email: email });
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  // [trdx-api] Genesis TRDX endpoints
  router.get('/api/trx/me', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const balance = storage.getTrxBalance(u.id);
      const ledger = storage.getTrxLedger(u.id, 50);
      return res.json({ ok: true, balance, ledger });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/trx/leaderboard', publicLimiter, (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
      const data = storage.getTrxLeaderboard(limit);
      return res.json({ ok: true, leaderboard: data });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/trx/info', publicLimiter, (req, res) => {
    return res.json({
      ok: true,
      info: {
        token: 'TRDX',
        fullName: 'Genesis TRDX',
        rewards: {
          registration: 100,
          referralFree: 50,
          referralLaunch: 1000,
          referralBoost: 2500,
          referralRocket: 7500,
        },
        utilities: [
          { id: 'exchange', title: 'Биржа TRDX', description: 'После запуска — продажа TRDX за USD на внутренней бирже.' },
          { id: 'services', title: 'Оплата AI-сервисов', description: 'Оплата AI-рассылок, генераций, премиум-сервисов кабинета через TRDX.' },
          { id: 'dividends', title: 'Ежеквартальные дивиденды', description: 'Держателям TRDX — % от дохода Golden Connect каждые 3 месяца в долларах.' },
          { id: 'lottery', title: 'Розыгрыши призов', description: 'Чем больше TRDX — тем больше билетов в розыгрыше ценных призов.' },
        ],
      },
    });
  });

    router.get('/api/karma/rules', publicLimiter, async (req, res) => {
    try {
      const data = await callGoldenConnectApi('/internal/karma/rules');
      res.json(data);
    } catch (e) { res.status(502).json({ ok: false, reason: e.message }); }
  });

  router.get('/api/public/referral-profile', (req, res) => {
    const ref = String((req.query && req.query.ref) || '').trim().toLowerCase();
    if (!ref) {
      return res.status(400).json({ ok: false, reason: 'ref_required' });
    }
    if (!storage.findWebUserByReferralCode) {
      return res.status(501).json({ ok: false, reason: 'referral_unavailable' });
    }
    const user = storage.findWebUserByReferralCode(ref);
    if (!user) {
      return res.json({
        ok: true,
        profile: null,
        companyLink: buildBotReferralUrl('xh160f8'),
        referralCode: ref
      });
    }
    const publicUser = storage.getPublicWebUserById ? storage.getPublicWebUserById(user.id) : user;
    const profile = publicUser && publicUser.profile ? publicUser.profile : {};
    const contact = (() => {
      const preferred = String(publicUser && publicUser.preferredContact || '').trim();
      if (preferred && preferred.toLowerCase() !== 'telegram') return preferred;
      if (profile && profile.phone) return profile.phone;
      const tg = String(publicUser && publicUser.telegramUsername || '').trim();
      if (tg) return tg.startsWith('@') ? tg : `@${tg}`;
      return '';
    })();
    const name = (publicUser && (publicUser.displayName || publicUser.email)) || 'Команда Golden Connect';
    const email = (publicUser && publicUser.email) || '';
    const companyLink = (publicUser && publicUser.goldenConnectRefLink)
      || buildBotReferralUrl(publicUser)
      || buildBotReferralUrl('xh160f8');
    return res.json({
      ok: true,
      profile: { name, contact, email },
      companyLink,
      referralCode: publicUser && publicUser.referralCode ? publicUser.referralCode : ref,
    });
  });

  router.get('/api/company-link', requireAuth, (req, res) => {
    const inviterId = Number(req.webUser && req.webUser.referredByUserId) || 0;
    const inviter = inviterId && storage.findWebUserById ? storage.findWebUserById(inviterId) : null;
    const publicInviter = inviter && storage.getPublicWebUserById ? storage.getPublicWebUserById(inviter.id) : null;
    const profile = publicInviter && publicInviter.profile ? publicInviter.profile : {};
    const contact = (() => {
      const preferred = String(publicInviter && publicInviter.preferredContact || '').trim();
      if (preferred && preferred.toLowerCase() !== 'telegram') return preferred;
      if (profile && profile.phone) return profile.phone;
      const tg = String(publicInviter && publicInviter.telegramUsername || '').trim();
      if (tg) return tg.startsWith('@') ? tg : `@${tg}`;
      return '';
    })();
    const name = (publicInviter && (publicInviter.displayName || publicInviter.email)) || 'Команда Golden Connect';
    const email = (publicInviter && publicInviter.email) || '';
    const companyLink = (publicInviter && publicInviter.goldenConnectRefLink)
      || buildBotReferralUrl(publicInviter || inviter || 'xh160f8');

    return res.json({
      ok: true,
      profile: publicInviter ? { name, contact, email } : null,
      companyLink,
      referralCode: String((publicInviter && publicInviter.referralCode) || 'xh160f8').trim()
    });
  });

  router.get('/api/public/video-comments', (req, res) => {
    const videoId = String((req.query && (req.query.video || req.query.videoId || req.query.id)) || '').trim();
    if (!videoId) {
      return res.status(400).json({ ok: false, reason: 'video_required' });
    }
    const limit = parseLimit(req.query && req.query.limit, 80, 200);
    const items = storage.listVideoComments ? storage.listVideoComments(videoId, limit) : [];
    return res.json({ ok: true, items, total: items.length });
  });

  router.post('/api/video-comments', requireAuth, (req, res) => {
    try {
      if (!storage.addVideoComment) {
        return res.status(501).json({ ok: false, reason: 'comments_unavailable' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const videoId = String(body.videoId || body.video || body.id || '').trim();
      if (!videoId) {
        return res.status(400).json({ ok: false, reason: 'video_required' });
      }
      const item = storage.addVideoComment(req.webUser.id, videoId, body);
      const items = storage.listVideoComments ? storage.listVideoComments(videoId, 80) : [];
      return res.status(201).json({ ok: true, item, items, total: items.length });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'EMPTY_MESSAGE') {
        return res.status(400).json({ ok: false, reason: 'empty_message' });
      }
      return res.status(500).json({ ok: false, reason: 'comment_create_failed' });
    }
  });

  router.get('/api/public/video-reactions', (req, res) => {
    const videoId = String((req.query && (req.query.video || req.query.videoId || req.query.id)) || '').trim();
    if (!videoId) {
      return res.status(400).json({ ok: false, reason: 'video_required' });
    }
    const sessionCtx = resolveSession(req);
    const summary = storage.getVideoReactions
      ? storage.getVideoReactions(videoId, sessionCtx && sessionCtx.user ? sessionCtx.user.id : null)
      : { likes: 0, dislikes: 0, userReaction: null };
    return res.json({ ok: true, ...(summary || { likes: 0, dislikes: 0, userReaction: null }) });
  });

  router.post('/api/video-reactions', requireAuth, (req, res) => {
    try {
      if (!storage.setVideoReaction) {
        return res.status(501).json({ ok: false, reason: 'reactions_unavailable' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const videoId = String(body.videoId || body.video || body.id || '').trim();
      if (!videoId) {
        return res.status(400).json({ ok: false, reason: 'video_required' });
      }
      const summary = storage.setVideoReaction(req.webUser.id, videoId, body.reaction || body.value || '');
      if (!summary) {
        return res.status(400).json({ ok: false, reason: 'reaction_invalid' });
      }
      return res.json({ ok: true, ...summary });
    } catch {
      return res.status(500).json({ ok: false, reason: 'reaction_failed' });
    }
  });

  function buildPublicUrl(pathname = '/', params = {}) {
    const base = String(config.publicBaseUrl || '').trim().replace(/\/$/, '');
    const path = String(pathname || '/').trim() || '/';
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(base ? `${base}${normalizedPath}` : `http://localhost${normalizedPath}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
    if (base) return url.toString();
    return `${normalizedPath}${url.search}`;
  }

  function fillTemplate(template, values = {}) {
    const source = String(template || '').trim();
    if (!source) return '';
    return source.replace(/\{(ref|referralCode|code|lang|landingId|source)\}/gi, (match, token) => {
      const key = String(token || '').trim().toLowerCase();
      const resolved = values[key];
      return resolved === undefined || resolved === null ? '' : encodeURIComponent(String(resolved));
    });
  }

  function getBotUsername() {
    return String(config.botUsername || siteContent.brand.botUsername || 'GoldenConnect_bizbot')
      .trim()
      .replace(/^@+/, '') || 'GoldenConnect_bizbot';
  }

  function buildBotReferralUrl(userOrCode) {
    const rawRefCode = typeof userOrCode === 'string'
      ? String(userOrCode || '').trim()
      : String((userOrCode && userOrCode.referralCode) || '').trim();
    const refCode = rawRefCode || 'xh160f8';
    return `https://t.me/${getBotUsername()}?start=ref_${encodeURIComponent(refCode)}`;
  }

  function buildCompanyReferralUrl(user, params = {}) {
    const referralCode = String((user && user.referralCode) || '').trim();
    const template = String(siteContent.links.companyRegistrationTemplate || '').trim();
    const companyCatalog = String(siteContent.links.companyCatalog || siteContent.links.shop || '').trim();
    const companyMain = String(siteContent.links.companyMain || siteContent.links.officialSite || '').trim();
    if (template) {
      return fillTemplate(template, {
        ref: referralCode,
        referralcode: referralCode,
        code: referralCode,
        lang: params.lang || 'ru',
        landingid: params.landingId || 'main',
        source: params.source || 'site',
      });
    }
    return companyCatalog || companyMain || '';
  }

  function buildShareLink(channel, url, text) {
    const safeUrl = String(url || '').trim();
    const safeText = String(text || '').trim();
    if (!safeUrl) return '';
    if (channel === 'telegram') {
      return `https://t.me/share/url?url=${encodeURIComponent(safeUrl)}&text=${encodeURIComponent(safeText)}`;
    }
    if (channel === 'whatsapp') {
      return `https://wa.me/?text=${encodeURIComponent(`${safeText} ${safeUrl}`.trim())}`;
    }
    if (channel === 'vk') {
      return `https://vk.com/share.php?url=${encodeURIComponent(safeUrl)}`;
    }
    if (channel === 'email') {
      return `mailto:?subject=${encodeURIComponent('Golden Connect')}&body=${encodeURIComponent(`${safeText}\n${safeUrl}`.trim())}`;
    }
    if (channel === 'linkedin') {
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(safeUrl)}`;
    }
    if (channel === 'x') {
      return `https://twitter.com/intent/tweet?url=${encodeURIComponent(safeUrl)}&text=${encodeURIComponent(safeText)}`;
    }
    return safeUrl;
  }

  function buildWorkspacePayload(user) {
    const referralCode = String((user && user.referralCode) || '').trim();
    const displayName = String((user && user.displayName) || (user && user.email) || 'партнер').trim();
    const siteReferralLink = buildPublicUrl('/', { ref: referralCode });
    const botReferralLink = buildBotReferralUrl(user);
    const cabinetReferralLink = buildPublicUrl('/register', { ref: referralCode });
    const companyReferralLink = buildCompanyReferralUrl(user);
    const landingLinks = safeArray(siteContent.landingLibrary && siteContent.landingLibrary.types).flatMap((landing) =>
      safeArray(siteContent.landingLibrary && siteContent.landingLibrary.languages).map((language) => ({
        id: `${landing.id}_${language.id}`,
        landingId: landing.id,
        language: language.id,
        languageLabel: language.label,
        title: `${(landing.titles && (landing.titles[language.id] || landing.titles.ru)) || landing.title || landing.id} · ${language.label}`,
        shortTitle: (landing.labels && (landing.labels[language.id] || landing.labels.ru)) || landing.id,
        description: (landing.descriptions && (landing.descriptions[language.id] || landing.descriptions.ru)) || landing.description || '',
        icon: landing.icon || '',
        audience: landing.audience,
        goal: landing.goal,
        focus: landing.focus || '',
        url: buildPublicUrl(landing.path, { ref: referralCode, lang: language.id, landing: landing.id }),
      }))
    );

    return {
      displayName,
      referralCode,
      siteReferralLink,
      botReferralLink,
      cabinetReferralLink,
      companyReferralLink,
      companyCatalogLink: String(siteContent.links.companyCatalog || siteContent.links.shop || '').trim(),
      officialCompanyLink: String(siteContent.links.companyMain || siteContent.links.officialSite || '').trim(),
      catalogLink: String(siteContent.links.payment || siteContent.links.shop || '').trim(),
      shareLinks: {
        telegram: buildShareLink('telegram', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
        whatsapp: buildShareLink('whatsapp', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
        vk: buildShareLink('vk', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
        email: buildShareLink('email', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
        linkedin: buildShareLink('linkedin', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
        x: buildShareLink('x', siteReferralLink, 'Посмотри мой кабинет Golden Connect'),
      },
      landingLinks,
    };
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function parseJsonBody(payload) {
    try {
      return JSON.parse(String(payload || '{}'));
    } catch {
      return null;
    }
  }

  function requestArsenalJson(targetPath, payload) {
    return new Promise((resolve, reject) => {
      const baseUrl = new URL(String(config.arsenal && config.arsenal.apiBaseUrl || 'https://goldenConnect.to'));
      const body = JSON.stringify(payload || {});
      const req = https.request({
        protocol: baseUrl.protocol,
        hostname: baseUrl.hostname,
        port: baseUrl.port || (baseUrl.protocol === 'https:' ? 443 : 80),
        method: 'POST',
        path: targetPath,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'goldenConnect-cabinet/1.0',
          ...(config.arsenal && config.arsenal.apiKey ? { Authorization: `Bearer ${config.arsenal.apiKey}` } : {}),
        },
      }, (proxyRes) => {
        let raw = '';
        proxyRes.on('data', (chunk) => {
          raw += String(chunk || '');
        });
        proxyRes.on('end', () => {
          const data = parseJsonBody(raw);
          if (proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && data) {
            resolve(data);
            return;
          }
          reject(new Error((data && (data.error || data.reason)) || `arsenal_http_${proxyRes.statusCode || 500}`));
        });
      });
      req.on('error', reject);
      req.setTimeout(20000, () => req.destroy(new Error('arsenal_timeout')));
      req.write(body);
      req.end();
    });
  }

  function buildLocalHashtags(input, platform, count = 18) {
    const topic = String(input || '').toLowerCase();
    const words = topic
      .replace(/[^\p{L}\p{N}\s#-]+/gu, ' ')
      .split(/\s+/)
      .map((item) => item.replace(/^#+/, '').trim())
      .filter((item) => item.length >= 3)
      .slice(0, 12);
    const base = words.map((item) => `#${item}`);
    const presets = [
      '#goldenConnect',
      '#натуральныепродукты',
      '#здоровье',
      '#партнерство',
      '#реклама',
      '#реферальнаяссылка',
      '#здоровыйобразжизни',
      platform === 'tiktok' ? '#tiktok' : platform === 'instagram' ? '#instagram' : '#socialmedia',
    ];
    return Array.from(new Set([...base, ...presets])).slice(0, Math.max(6, Math.min(30, Number(count) || 18)));
  }

  function buildLocalCaptions(topic, platform, tone) {
    const text = String(topic || '').trim();
    const style = String(tone || 'helpful').trim();
    return [
      {
        caption: `Собрал(а) удобный вход в Golden Connect: материалы, AI и партнёрский кабинет в одном месте. Тема: ${text}. Формат для ${platform}, тон ${style}.`,
      },
      {
        caption: `Если хотите спокойно разобраться в компании, продуктах и возможностях партнёра, начните с кабинета Golden Connect. Тема: ${text}.`,
      },
      {
        caption: `Удобнее всего стартовать через сайт: там уже есть ссылки, обучение, материалы и следующий шаг в официальный контур компании. Тема: ${text}.`,
      },
    ];
  }

  function getVisitorIdFromRequest(req, body = null) {
    const payload = body && typeof body === 'object' ? body : {};
    return String(
      payload.visitorId
      || (req.query && req.query.visitorId)
      || req.headers['x-visitor-id']
      || ''
    ).trim();
  }

  function attachMarketingVisitorIfPresent(req, userId, body = null) {
    const visitorId = getVisitorIdFromRequest(req, body);
    if (!visitorId || !userId) return null;
    try {
      return storage.attachMarketingVisitor(visitorId, userId);
    } catch {
      return null;
    }
  }

  function resolveFavoriteEntity(kind, itemId) {
    const normalizedKind = String(kind || '').trim().toLowerCase();
    const normalizedItemId = String(itemId || '').trim();
    if (!normalizedKind || !normalizedItemId) return null;
    if (normalizedKind === 'product') {
      const item = siteContent.products.find((entry) => entry.id === normalizedItemId);
      if (!item) return null;
      return {
        kind: 'product',
        itemId: item.id,
        title: item.title,
        summary: item.shortDescription || item.story || null,
        url: siteContent.links.payment || siteContent.links.shop || '',
        meta: {
          category: item.category || null,
          priceLabel: item.priceLabel || null,
        },
      };
    }
    if (normalizedKind === 'content') {
      const item = siteContent.contentHub.find((entry) => entry.id === normalizedItemId);
      if (!item) return null;
      return {
        kind: 'content',
        itemId: item.id,
        title: item.title,
        summary: item.description || null,
        url: item.url || null,
        meta: {
          type: item.type || null,
        },
      };
    }
    if (normalizedKind === 'protocol') {
      const item = resolveProtocol(normalizedItemId);
      if (!item) return null;
      return {
        kind: 'protocol',
        itemId: item.id,
        title: item.title,
        summary: item.summary || null,
        url: null,
        meta: {
          durationDays: item.durationDays || null,
          intensity: item.intensity || item.audience || null,
        },
      };
    }
    return null;
  }

  function buildAiResponse(message, user) {
    const text = String(message || '').trim();
    const lower = text.toLowerCase();
    const displayName = user && user.displayName ? user.displayName : 'друг';
    const paymentUrl = siteContent.links.payment || siteContent.links.shop || '';
    const instructionsUrl = siteContent.links.instructions || '';
    const officialSiteUrl = siteContent.links.officialSite || '';

    if (!text) {
      return {
        role: 'assistant',
        content: 'Напиши короткий вопрос, и я направлю тебя в нужный продукт, партнёрский блок или раздел с материалами.',
      };
    }

    if (/(product|catalog|shop|товар|продукт|магазин|купить)/i.test(lower)) {
      return {
        role: 'assistant',
        content: paymentUrl
          ? `Начни с раздела продуктов: там уже собран публичный каталог Golden Connect с карточками, сценариями применения и быстрым переходом к витрине. Текущая точка входа в оплату: ${paymentUrl}`
          : 'Начни с раздела продуктов в кабинете. Там уже собран каталог Golden Connect с краткими описаниями, сценариями применения и следующим шагом.',
      };
    }

    if (/(partner|referral|реф|партнер)/i.test(lower)) {
      return {
        role: 'assistant',
        content: 'Открой раздел Partner в кабинете. Там уже есть твоя реферальная ссылка, лестница уровней, баллы и сценарий вывода средств.',
      };
    }

    if (/(point|балл|withdraw|вывод|выплат)/i.test(lower)) {
      return {
        role: 'assistant',
        content: 'Баллы и выплаты живут внутри кабинета. Сначала посмотри обзор по баллам, а затем отправь заявку на вывод в блоке Withdrawals.',
      };
    }

    if (/(presentation|company|презентац|компан)/i.test(lower)) {
      return {
        role: 'assistant',
        content: officialSiteUrl
          ? `Смотри блок «О компании» и раздел Content Hub. Мы уже перенесли ключевые публичные материалы Golden Connect на сайт, а официальный источник лежит здесь: ${officialSiteUrl}`
          : 'Смотри блок «О компании» и раздел Content Hub. Там собраны эксперты, признание продукции, инструкции и партнерские материалы.',
      };
    }

    if (/(chat|channel|канал|чат)/i.test(lower)) {
      return {
        role: 'assistant',
        content: 'Перейди в Content Hub за актуальными ссылками на канал и чат. Это самый короткий путь из кабинета в живое сообщество.',
      };
    }

    if (/(instruction|инструкц|живая вода|живой воды)/i.test(lower)) {
      return {
        role: 'assistant',
        content: instructionsUrl
          ? `Инструкции вынесены в отдельный блок материалов. Для «Живой воды» уже добавлен официальный раздел: ${instructionsUrl}`
          : 'Инструкции собраны в контент-хабе рядом с каталогом и материалами компании.',
      };
    }

    return {
      role: 'assistant',
      content: `Лучший следующий шаг для тебя, ${displayName}: начни с dashboard, выбери, хочешь ли ты купить, расти как партнер или задать вопрос по продукту, и я проведу тебя дальше.`,
    };
  }

  function buildDashboardPayload(userId) {
    const user = storage.getPublicWebUserById(userId);
    const orders = storage.listOrders(userId, 6);
    const withdrawals = storage.listWithdrawals(userId, 6);
    const aiMessages = storage.listAiMessages(userId, 20);
    const tasks = storage.listTasks(userId, 200);
    const supportRequests = storage.listSupportRequests(userId, 20);
    const notifications = storage.listNotifications(userId, 20);
    const protocolHistory = storage.listProtocolRecords ? storage.listProtocolRecords(userId, 12) : [];
    const favorites = storage.listFavorites ? storage.listFavorites(userId, 24) : [];
    const partner = storage.getReferralStats(userId, 5);
    const pendingWithdrawals = withdrawals.filter((item) => item.status === 'pending').length;
    const openTasks = tasks.filter((item) => item.status !== 'done').length;
    const completedTasks = tasks.filter((item) => item.status === 'done').length;
    const unreadNotifications = notifications.filter((item) => !item.readAt).length;
    const activeProtocol = protocolTemplates.find((item) => item.id === (user && user.activeProtocolId)) || null;
    const activeProtocolRecord = protocolHistory.find((item) => item.status === 'active') || null;
    const saved = buildSavedPayload(user);
    const activity = buildActivityFeed(userId, 20);
    const marketing = storage.getMarketingContext ? storage.getMarketingContext({ userId }) : null;

    return {
      user,
      stats: {
        points: Number((partner && partner.points) || (user && user.points) || 0),
        directReferrals: Number((partner && partner.directReferrals) || 0),
        totalReferrals: Number((partner && partner.totalReferrals) || 0),
        ordersCount: orders.length,
        pendingWithdrawals,
        aiMessagesCount: aiMessages.length,
        openTasks,
        completedTasks,
        supportRequestsCount: supportRequests.length,
        unreadNotifications,
        savedItemsCount: saved.counts.total,
        activeProtocolsCount: protocolHistory.filter((item) => item.status === 'active').length,
        protocolHistoryCount: protocolHistory.length,
      },
      quickActions: [
        { id: 'links', label: 'Открыть мои ссылки', view: 'links' },
        { id: 'landings', label: 'Выбрать лендинг по языку', view: 'landings' },
        { id: 'materials', label: 'Взять готовые материалы', view: 'materials' },
        { id: 'tools', label: 'Запустить Arsenal и инструменты', view: 'tools' },
      ],
      recentOrders: orders,
      recentWithdrawals: withdrawals,
      recentSupportRequests: supportRequests.slice(0, 4),
      notifications: notifications.slice(0, 6),
      activity: activity.slice(0, 12),
      activeProtocol,
      activeProtocolRecord,
      protocolHistory: protocolHistory.slice(0, 6),
      tasksPreview: tasks.slice(0, 6),
      planner: {
        summary: {
          total: tasks.length,
          open: openTasks,
          completed: completedTasks,
          overdue: tasks.filter((item) => item.dueAt && item.status !== 'done' && Date.parse(item.dueAt) < Date.now()).length,
        },
        items: tasks.slice(0, 10),
      },
      profile: user && user.profile ? user.profile : {},
      preferences: user && user.preferences ? user.preferences : {},
      onboarding: {
        ...(user && user.onboarding ? user.onboarding : {}),
        steps: onboardingSteps,
      },
      saved,
      favorites: favorites.slice(0, 12),
      support: {
        summary: {
          total: supportRequests.length,
          open: supportRequests.filter((item) => item.status !== 'closed' && item.status !== 'resolved').length,
          waitingReply: supportRequests.filter((item) => item.status === 'waiting_reply').length,
        },
        items: supportRequests.slice(0, 6),
      },
      partner,
      workspace: buildWorkspacePayload(user),
      marketing,
      memberPortal: {
        onboardingSteps,
        supportCategories,
        protocolTemplates: protocolTemplates.slice(0, 6),
      },
      links: siteContent.links,
    };
  }

  function resolveProtocol(protocolId) {
    return protocolTemplates.find((item) => item.id === String(protocolId || '').trim()) || null;
  }

  function buildSavedPayload(user) {
    const collections = storage.getSavedCollections(user && user.id);
    const protocols = (collections.protocolIds || [])
      .map((id) => resolveProtocol(id))
      .filter(Boolean);
    const products = (collections.productIds || [])
      .map((id) => siteContent.products.find((item) => item.id === id))
      .filter(Boolean);
    const content = (collections.contentIds || [])
      .map((id) => siteContent.contentHub.find((item) => item.id === id))
      .filter(Boolean);

    return {
      protocols,
      products,
      content,
      counts: {
        protocols: protocols.length,
        products: products.length,
        content: content.length,
        total: protocols.length + products.length + content.length,
      },
    };
  }

  function buildProtocolPayload(userId) {
    const user = storage.getPublicWebUserById(userId);
    const tasks = storage.listTasks(userId, 300);
    const history = storage.listProtocolRecords ? storage.listProtocolRecords(userId, 100) : [];
    return {
      activeProtocolId: user && user.activeProtocolId ? user.activeProtocolId : null,
      activeRecord: history.find((item) => item.status === 'active') || null,
      items: protocolTemplates.map((protocol) => {
        const protocolTasks = tasks.filter((item) => item.protocolId === protocol.id);
        const completedTasks = protocolTasks.filter((item) => item.status === 'done').length;
        const record = history.find((item) => item.templateId === protocol.id && item.status === 'active')
          || history.find((item) => item.templateId === protocol.id)
          || null;
        return {
          ...protocol,
          isActive: protocol.id === (user && user.activeProtocolId),
          isSaved: Boolean(user && Array.isArray(user.savedProtocolIds) && user.savedProtocolIds.includes(protocol.id)),
          activation: record,
          progress: {
            totalTasks: protocolTasks.length || (
              Array.isArray(protocol.taskBlueprints) && protocol.taskBlueprints.length
                ? protocol.taskBlueprints.length
                : Array.isArray(protocol.tasks)
                  ? protocol.tasks.length
                  : 0
            ),
            completedTasks,
            percent: record && Number.isFinite(Number(record.progressPercent))
              ? Number(record.progressPercent)
              : ((protocolTasks.length || (
                Array.isArray(protocol.taskBlueprints) && protocol.taskBlueprints.length
                  ? protocol.taskBlueprints.length
                  : Array.isArray(protocol.tasks)
                    ? protocol.tasks.length
                    : 0
              ))
                ? Math.round((completedTasks / (protocolTasks.length || (
                  Array.isArray(protocol.taskBlueprints) && protocol.taskBlueprints.length
                    ? protocol.taskBlueprints.length
                    : protocol.tasks.length
                ))) * 100)
                : 0),
          },
        };
      }),
      history,
    };
  }

  function buildActivityFeed(userId, limit = 20) {
    const stored = storage.listActivityFeed ? storage.listActivityFeed(userId, limit).map((item) => ({
      id: `activity_${item.id}`,
      createdAt: item.createdAt,
      kind: item.kind || 'system',
      title: item.title || 'Update',
      text: item.text || '',
      view: item.view || 'overview',
    })) : [];
    const orders = storage.listOrders(userId, limit).map((item) => ({
      id: `order_${item.id}`,
      createdAt: item.createdAt,
      kind: 'order',
      title: 'Новая заявка на продукт',
      text: item.productName || item.productId || 'Оформлена заявка',
      view: 'products',
    }));
    const withdrawals = storage.listWithdrawals(userId, limit).map((item) => ({
      id: `withdrawal_${item.id}`,
      createdAt: item.createdAt,
      kind: 'withdrawal',
      title: 'Заявка на вывод',
      text: `${item.amount} ₽ · ${item.status}`,
      view: 'withdrawals',
    }));
    const support = storage.listSupportRequests(userId, limit).map((item) => ({
      id: `support_${item.id}`,
      createdAt: item.createdAt,
      kind: 'support',
      title: item.subject || 'Запрос в поддержку',
      text: item.message || '',
      view: 'support',
    }));
    const notifications = storage.listNotifications(userId, limit).map((item) => ({
      id: `notification_${item.id}`,
      createdAt: item.createdAt,
      kind: item.kind || 'system',
      title: item.title || 'Обновление',
      text: item.message || '',
      view: item.actionView || 'overview',
    }));
    const taskEvents = storage.listTasks(userId, limit)
      .filter((item) => item.completedAt)
      .map((item) => ({
        id: `task_${item.id}`,
        createdAt: item.completedAt,
        kind: 'task',
        title: 'Задача выполнена',
        text: item.title || '',
        view: 'overview',
      }));

    return [...stored, ...orders, ...withdrawals, ...support, ...notifications, ...taskEvents]
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .filter((item, index, items) => items.findIndex((entry) => entry.id === item.id) === index)
      .slice(0, Math.max(1, Math.min(100, Number(limit) || 20)));
  }

  function buildTelegramStartUrl(requestId) {
    const botUsername = String(config.botUsername || siteContent.brand.botUsername || '').trim().replace(/^@+/, '');
    if (!botUsername || !requestId) return '';
    return `https://t.me/${botUsername}?start=web_${requestId}`;
  }

  router.get('/api/site/config', (req, res) => {
    const sessionCtx = resolveSession(req);
    return res.json({
      ok: true,
      site: siteContent,
      auth: {
        emailEnabled: true,
        botEnabled: Boolean(String(config.botUsername || siteContent.brand.botUsername || '').trim()),
        botUsername: String(config.botUsername || siteContent.brand.botUsername || '').trim() || null,
        registrationMode: 'email_or_telegram',
      },
      session: sessionCtx && sessionCtx.user ? {
        authenticated: true,
        user: { ...sessionCtx.user, isAdmin: isContentAdmin(sessionCtx.user) },
      } : {
        authenticated: false,
      },
    });
  });

  router.post('/api/marketing/visit', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sessionCtx = resolveSession(req);
      const visitorId = getVisitorIdFromRequest(req, body);
      if (!visitorId) {
        return res.status(400).json({ ok: false, reason: 'visitor_id_required' });
      }

      const result = storage.upsertMarketingVisit({
        ...body,
        visitorId,
        userId: sessionCtx && sessionCtx.user ? sessionCtx.user.id : null,
      });

      return res.status(201).json({
        ok: true,
        visitor: result.visitor,
        context: result.context,
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'VISITOR_ID_REQUIRED') {
        return res.status(400).json({ ok: false, reason: 'visitor_id_required' });
      }
      return res.status(500).json({ ok: false, reason: 'marketing_visit_failed' });
    }
  });

  router.post('/api/marketing/events', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sessionCtx = resolveSession(req);
      const visitorId = getVisitorIdFromRequest(req, body);
      if (!visitorId) {
        return res.status(400).json({ ok: false, reason: 'visitor_id_required' });
      }
      if (!String(body.eventType || '').trim()) {
        return res.status(400).json({ ok: false, reason: 'event_type_required' });
      }

      const userId = sessionCtx && sessionCtx.user ? sessionCtx.user.id : null;
      const event = storage.recordMarketingEvent({
        ...body,
        visitorId,
        userId,
      });
      if (userId) attachMarketingVisitorIfPresent(req, userId, body);

      return res.status(201).json({
        ok: true,
        event,
        context: storage.getMarketingContext ? storage.getMarketingContext({ visitorId, userId }) : null,
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'marketing_event_failed' });
    }
  });

  router.get('/api/marketing/context', (req, res) => {
    const sessionCtx = resolveSession(req);
    const visitorId = getVisitorIdFromRequest(req, req.query && typeof req.query === 'object' ? req.query : {});
    return res.json({
      ok: true,
      context: storage.getMarketingContext
        ? storage.getMarketingContext({
            visitorId,
            userId: sessionCtx && sessionCtx.user ? sessionCtx.user.id : null,
          })
        : null,
    });
  });

  // ── Magic-link issuance (called by bot via shared INTERNAL_API_SECRET)
  router.post('/api/bot/issue-magic-link', (req, res) => {
    const expected = String(config.goldenConnectApiInternalSecret || '').trim();
    const got = String(req.headers['x-goldenConnect-secret'] || '').trim();
    if (!expected || got !== expected) {
      return res.status(401).json({ ok: false, reason: 'unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tgId = Number(body.tg_id || body.tgId || 0);
    if (!Number.isFinite(tgId) || tgId <= 0) {
      return res.status(400).json({ ok: false, reason: 'tg_id_required' });
    }
    const link = storage.createMagicLink(tgId, {
      id: tgId,
      username: body.username || null,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      language_code: body.language_code || null,
    });
    // publicBaseUrl env may already include /cabinet (e.g. https://goldenConnect.to/cabinet/) — strip it so we add the canonical /cabinet/auth/magic path exactly once.
    const rawBase = (config.publicBaseUrl || 'https://goldenConnect.to').replace(/\/+$/, '').replace(/\/cabinet$/, '');
    return res.json({
      ok: true,
      token: link.token,
      url: rawBase + '/cabinet/auth/magic?token=' + encodeURIComponent(link.token),
      expires_at: link.expiresAt,
    });
  });

  // ── Magic-link consumption (user clicks the URL from bot)
  router.get('/auth/magic', (req, res) => {
    const token = String((req.query && req.query.token) || '').trim();
    if (!token) return res.redirect(302, '/cabinet/login?reason=magic_invalid');
    const consumed = storage.consumeMagicLink(token);
    if (!consumed) return res.redirect(302, '/cabinet/login?reason=magic_expired');
    let user;
    try {
      user = storage.ensureWebUserFromTelegram(consumed.profile || { id: consumed.tgId });
    } catch (e) {
      return res.redirect(302, '/cabinet/login?reason=magic_user_failed');
    }
    storage.updateWebUserLogin(user.id);
    createSessionForUser(req, res, user.id);
    return res.redirect(302, '/cabinet');
  });

  router.post('/api/auth/bot/start', (req, res) => {
    const botUsername = String(config.botUsername || siteContent.brand.botUsername || '').trim().replace(/^@+/, '');
    if (!botUsername) {
      return res.status(503).json({ ok: false, reason: 'bot_login_unavailable' });
    }

    const request = storage.createBotAuthRequest({
      ip: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });

    return res.status(201).json({
      ok: true,
      requestId: request.requestId,
      status: request.status,
      expiresAt: request.expiresAt,
      botUsername,
      botUrl: buildTelegramStartUrl(request.requestId),
    });
  });

  router.get('/api/auth/bot/status', (req, res) => {
    const requestId = String((req.query && req.query.requestId) || '').trim();
    if (!requestId) {
      return res.status(400).json({ ok: false, reason: 'request_id_required' });
    }

    const request = storage.getBotAuthRequest(requestId);
    if (!request) {
      return res.json({
        ok: true,
        status: 'expired',
      });
    }

    if (request.status === 'completed' && request.user) {
      const sessionCtx = resolveSession(req);
      if (sessionCtx && sessionCtx.tokenHash && sessionCtx.user && sessionCtx.user.id !== request.user.id) {
        storage.revokeWebSession(sessionCtx.tokenHash);
      }
      if (!sessionCtx || !sessionCtx.user || sessionCtx.user.id !== request.user.id) {
        storage.updateWebUserLogin(request.user.id);
        createSessionForUser(req, res, request.user.id);
      }
      attachMarketingVisitorIfPresent(req, request.user.id, req.query && typeof req.query === 'object' ? req.query : {});

      return res.json({
        ok: true,
        status: 'authenticated',
        user: storage.getPublicWebUserById(request.user.id),
        context: storage.getMarketingContext
          ? storage.getMarketingContext({
              visitorId: getVisitorIdFromRequest(req, req.query && typeof req.query === 'object' ? req.query : {}),
              userId: request.user.id,
            })
          : null,
      });
    }

    return res.json({
      ok: true,
      status: 'pending',
      expiresAt: request.expiresAt,
    });
  });


  // ─── Math captcha (HMAC-signed, stateless) ────────────────────
  // Format: id = base64(JSON{n1,n2,op,exp,nonce}) + "." + base64(HMAC256)
  function _captchaSecret() {
    return String(config.sessionSecret || config.publicBaseUrl || 'goldenConnect-captcha-secret');
  }
  function makeCaptcha() {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    const a = 1 + Math.floor(Math.random() * (op === '×' ? 9 : 49));
    const b = 1 + Math.floor(Math.random() * (op === '×' ? 9 : 49));
    let answer;
    if (op === '+') answer = a + b;
    else if (op === '-') answer = a - b;
    else answer = a * b;
    const exp = Date.now() + 10 * 60 * 1000;
    const nonce = crypto.randomBytes(8).toString('hex');
    const payload = { a, b, op, answer, exp, nonce };
    const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', _captchaSecret()).update(payloadB64).digest('base64url');
    return { id: payloadB64 + '.' + sig, question: a + ' ' + op + ' ' + b };
  }
  function verifyCaptcha(id, userAnswer) {
    if (!id || typeof id !== 'string' || id.indexOf('.') < 0) return false;
    const [payloadB64, sig] = id.split('.', 2);
    const expected = crypto.createHmac('sha256', _captchaSecret()).update(payloadB64).digest('base64url');
    if (sig !== expected) return false;
    try {
      const p = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
      if (!p || !p.exp || p.exp < Date.now()) return false;
      const a = parseInt(String(userAnswer || '').trim(), 10);
      return Number.isFinite(a) && a === p.answer;
    } catch (_) { return false; }
  }

  router.get('/api/auth/captcha', (req, res) => {
    try { return res.json({ ok: true, ...makeCaptcha() }); }
    catch (e) { return res.status(500).json({ ok: false }); }
  });
  router.post('/api/auth/register', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const displayName = String(body.displayName || '').trim();
      const referralCode = String(body.referralCode || body.ref || '').trim().toLowerCase();

      if (!verifyCaptcha(body.captchaId, body.captchaAnswer)) {
        return res.status(400).json({ ok: false, reason: 'captcha_failed' });
      }

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ ok: false, reason: 'invalid_email' });
      }

      const passwordState = validatePassword(password);
      if (!passwordState.ok) {
        return res.status(400).json({ ok: false, reason: passwordState.reason || 'invalid_password' });
      }

      if (storage.findWebUserByEmail(email)) {
        return res.status(409).json({ ok: false, reason: 'email_exists' });
      }

      const referrer = referralCode ? storage.findWebUserByReferralCode(referralCode) : null;
      const { hash, salt } = storage.hashPassword(password);

      // Username (Phase A): user-supplied or default from email prefix
      const usernameRaw = String(body.username || '').trim();
      let usernameSan = usernameRaw ? usernameRaw.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) : '';
      if (usernameRaw && (usernameSan.length < 3 || usernameSan.length > 32)) {
        return res.status(400).json({ ok: false, reason: 'invalid_username' });
      }

      const user = storage.createWebUser({
        email,
        username: usernameSan || undefined,
        passwordHash: hash,
        passwordSalt: salt,
        displayName,
        userRole: body.userRole,
        experienceLevel: body.experienceLevel,
        focusAreas: body.focusAreas,
        goalsSummary: body.goalsSummary,
        preferredContact: body.preferredContact,
        preferences: body.preferences,
        profile: body.profile,
        onboarding: body.onboarding,
        referredByUserId: referrer ? referrer.id : null,
      });

      storage.updateWebUserLogin(user.id);
      createSessionForUser(req, res, user.id);
      attachMarketingVisitorIfPresent(req, user.id, body);

      return res.status(201).json({
        ok: true,
        user: storage.getPublicWebUserById(user.id),
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'EMAIL_EXISTS') {
        return res.status(409).json({ ok: false, reason: 'email_exists' });
      }
      return res.status(500).json({ ok: false, reason: 'register_failed' });
    }
  });

  router.post('/api/auth/login', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const email = String(body.email || '').trim().toLowerCase();
      if (!verifyCaptcha(body.captchaId, body.captchaAnswer)) {
        return res.status(400).json({ ok: false, reason: 'captcha_failed' });
      }
      const password = String(body.password || '');
      const user = storage.findWebUserByEmail(email);

      if (!user) {
        return res.status(401).json({ ok: false, reason: 'invalid_credentials' });
      }

      if (!storage.verifyPassword(password, user.passwordSalt, user.passwordHash)) {
        return res.status(401).json({ ok: false, reason: 'invalid_credentials' });
      }

      storage.updateWebUserLogin(user.id);
      createSessionForUser(req, res, user.id);
      attachMarketingVisitorIfPresent(req, user.id, body);

      return res.json({
        ok: true,
        user: storage.getPublicWebUserById(user.id),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'login_failed' });
    }
  });

  router.get('/api/auth/me', (req, res) => {
    const sessionCtx = resolveSession(req);
    if (!sessionCtx || !sessionCtx.user) {
      clearSessionCookie(res);
      return res.json({ ok: true, user: null });
    }
    const user = sessionCtx.user;
    return res.json({
      ok: true,
      user: { ...user, isAdmin: isContentAdmin(user) },
    });
  });

  router.post('/api/auth/logout', (req, res) => {
    const sessionCtx = resolveSession(req);
    if (sessionCtx && sessionCtx.tokenHash) {
      storage.revokeWebSession(sessionCtx.tokenHash);
    }
    clearSessionCookie(res);
    return res.json({ ok: true });
  });

  router.get('/api/dashboard', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      dashboard: buildDashboardPayload(req.webUser.id),
    });
  });

  // POST /api/auth/password — set initial password OR change existing one.
  router.post('/api/auth/password', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const newPassword = String(body.newPassword || '').trim();
      const currentPassword = String(body.currentPassword || '').trim();
      if (newPassword.length < 8) {
        return res.status(400).json({ ok: false, reason: 'password_too_short', detail: 'Минимум 8 символов' });
      }
      if (newPassword.length > 128) {
        return res.status(400).json({ ok: false, reason: 'password_too_long' });
      }
      const me = storage.findWebUserById(req.webUser.id);
      if (!me) return res.status(404).json({ ok: false, reason: 'user_not_found' });
      const hasPassword = !!(me.passwordHash && me.passwordSalt);
      if (hasPassword) {
        if (!currentPassword) {
          return res.status(400).json({ ok: false, reason: 'current_password_required' });
        }
        if (!storage.verifyPassword(currentPassword, me.passwordSalt, me.passwordHash)) {
          return res.status(403).json({ ok: false, reason: 'current_password_invalid' });
        }
      }
      const { hash, salt } = storage.hashPassword(newPassword);
      storage.setWebUserPassword(me.id, hash, salt);
      return res.json({ ok: true, has_password: true, was_set: !hasPassword });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'password_set_failed', detail: e?.message });
    }
  });

  // POST /api/auth/password-recovery — bot-only flow: regenerate password,
  // save it, return it once. Bot then DMs the user.
  // Authenticated via internal secret + tg_id resolver.
  router.post('/api/auth/password-recovery', (req, res) => {
    const secret = String(req.headers['x-internal-secret'] || '').trim();
    if (!secret || secret !== process.env.INTERNAL_API_SECRET) {
      return res.status(401).json({ ok: false, reason: 'unauthorized' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const tgId = String(body.tg_id || '').trim();
      if (!tgId) return res.status(400).json({ ok: false, reason: 'tg_id_required' });
      const me = storage.findWebUserByTelegramId(tgId);
      if (!me) return res.status(404).json({ ok: false, reason: 'user_not_found' });
      // Generate a 12-char random password (letters + digits)
      const crypto = require('crypto');
      const newPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
      const { hash, salt } = storage.hashPassword(newPassword);
      storage.setWebUserPassword(me.id, hash, salt);
      return res.json({
        ok: true,
        new_password: newPassword,
        login: me.email || me.username,
        cabinet_url: (process.env.PUBLIC_BASE_URL || 'https://goldenConnect.to') + '/cabinet'
      });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'recovery_failed', detail: e?.message });
    }
  });

    router.get('/api/profile', requireAuth, (req, res) => {
    try { awardKarmaGoldenConnect(req, 'login', null, new Date().toISOString().slice(0, 10)); } catch (_) {}
    return res.json({
      ok: true,
      user: storage.getPublicWebUserById(req.webUser.id),
      support: siteContent.support || { topics: [], contactModes: [] },
      memberPortal: {
        onboardingSteps,
        supportCategories,
      },
      roles: [
        { id: 'client', title: 'Клиент' },
        { id: 'partner', title: 'Партнер' },
        { id: 'hybrid', title: 'Клиент + партнер' },
      ],
      levels: [
        { id: 'new', title: 'Новичок' },
        { id: 'steady', title: 'В процессе' },
        { id: 'advanced', title: 'Продвинутый' },
      ],
    });
  });

  router.post('/api/profile', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const user = storage.updateWebUserProfile(req.webUser.id, {
        displayName: body.displayName,
        email: body.email,
        userRole: body.userRole,
        experienceLevel: body.experienceLevel,
        focusAreas: body.focusAreas,
        goalsSummary: body.goalsSummary,
        city: body.city,
        preferredContact: body.preferredContact,
        notificationSettings: body.notificationSettings,
        profile: body.profile,
        preferences: body.preferences,
        onboarding: body.onboarding,
        completeOnboarding: body.completeOnboarding,
      });
      return res.json({ ok: true, user });
    } catch {
      return res.status(500).json({ ok: false, reason: 'profile_update_failed' });
    }
  });

  router.patch('/api/profile', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const user = storage.updateWebUserProfile(req.webUser.id, body);
      return res.json({ ok: true, user });
    } catch {
      return res.status(500).json({ ok: false, reason: 'profile_update_failed' });
    }
  });

  router.get('/api/onboarding', requireAuth, (req, res) => {
    const user = storage.getPublicWebUserById(req.webUser.id);
    return res.json({
      ok: true,
      onboarding: {
        ...(user && user.onboarding ? user.onboarding : {}),
        steps: onboardingSteps,
      },
      supportCategories,
    });
  });

  router.post('/api/onboarding', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const user = storage.updateWebUserProfile(req.webUser.id, {
        onboarding: body,
        completeOnboarding: body.complete === true || body.completeOnboarding === true,
      });
      return res.json({
        ok: true,
        user,
        onboarding: {
          ...(user && user.onboarding ? user.onboarding : {}),
          steps: onboardingSteps,
        },
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'onboarding_update_failed' });
    }
  });

  router.get('/api/protocols', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      protocols: buildProtocolPayload(req.webUser.id),
    });
  });

  router.get('/api/protocols/templates', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: protocolTemplates,
    });
  });

  router.post('/api/protocols/activate', requireAuth, (req, res) => {
    try {
      const protocolId = String((req.body && req.body.protocolId) || '').trim();
      const protocol = resolveProtocol(protocolId);
      if (!protocol) {
        return res.status(404).json({ ok: false, reason: 'protocol_not_found' });
      }
      const user = storage.activateProtocol(req.webUser.id, protocol);
      return res.json({
        ok: true,
        user,
        protocols: buildProtocolPayload(req.webUser.id),
        tasks: storage.listTasks(req.webUser.id, 300),
        history: storage.listProtocolRecords ? storage.listProtocolRecords(req.webUser.id, 100) : [],
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'protocol_activate_failed' });
    }
  });

  router.patch('/api/protocols/:protocolId', requireAuth, (req, res) => {
    try {
      if (!storage.updateProtocolRecord) {
        return res.status(501).json({ ok: false, reason: 'protocol_update_unavailable' });
      }
      const item = storage.updateProtocolRecord(req.webUser.id, req.params.protocolId, req.body || {});
      if (!item) {
        return res.status(404).json({ ok: false, reason: 'protocol_not_found' });
      }
      return res.json({
        ok: true,
        item,
        protocols: buildProtocolPayload(req.webUser.id),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'protocol_update_failed' });
    }
  });

  router.get('/api/saved', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      saved: buildSavedPayload(storage.getPublicWebUserById(req.webUser.id)),
    });
  });

  router.post('/api/saved/toggle', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = storage.toggleSavedItem(req.webUser.id, body.kind, body.itemId);
      if (!result) {
        return res.status(400).json({ ok: false, reason: 'invalid_saved_item' });
      }
      return res.json({
        ok: true,
        ...result,
        saved: buildSavedPayload(storage.getPublicWebUserById(req.webUser.id)),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'saved_toggle_failed' });
    }
  });

  router.get('/api/favorites', requireAuth, (req, res) => {
    const kind = String((req.query && req.query.kind) || '').trim() || undefined;
    const items = (storage.listFavorites ? storage.listFavorites(req.webUser.id, parseLimit(req.query && req.query.limit, 100), kind) : [])
      .map((item) => ({
        ...item,
        entity: resolveFavoriteEntity(item.kind, item.itemId),
      }));
    return res.json({
      ok: true,
      items,
    });
  });

  router.post('/api/favorites', requireAuth, (req, res) => {
    try {
      if (!storage.saveFavorite) {
        return res.status(501).json({ ok: false, reason: 'favorites_unavailable' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const entity = resolveFavoriteEntity(body.kind, body.itemId);
      const favorite = storage.saveFavorite(req.webUser.id, {
        ...(entity || {}),
        kind: body.kind,
        itemId: body.itemId,
        title: body.title || (entity && entity.title),
        summary: body.summary || (entity && entity.summary),
        url: body.url || (entity && entity.url),
        meta: body.meta || (entity && entity.meta),
      });
      if (!favorite) {
        return res.status(400).json({ ok: false, reason: 'favorite_invalid' });
      }
      return res.status(201).json({
        ok: true,
        item: {
          ...favorite,
          entity: resolveFavoriteEntity(favorite.kind, favorite.itemId),
        },
        items: storage.listFavorites(req.webUser.id, 100).map((item) => ({
          ...item,
          entity: resolveFavoriteEntity(item.kind, item.itemId),
        })),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'favorite_save_failed' });
    }
  });

  router.delete('/api/favorites/:kind/:itemId', requireAuth, (req, res) => {
    try {
      if (!storage.removeFavorite) {
        return res.status(501).json({ ok: false, reason: 'favorites_unavailable' });
      }
      const result = storage.removeFavorite(req.webUser.id, req.params.kind, req.params.itemId);
      if (!result) {
        return res.status(404).json({ ok: false, reason: 'favorite_not_found' });
      }
      return res.json({
        ok: true,
        result,
        items: storage.listFavorites(req.webUser.id, 100).map((item) => ({
          ...item,
          entity: resolveFavoriteEntity(item.kind, item.itemId),
        })),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'favorite_remove_failed' });
    }
  });

  router.get('/api/tasks', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listTasks(req.webUser.id, 300),
    });
  });

  router.post('/api/tasks', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const task = storage.upsertTask(req.webUser.id, body);
      return res.status(201).json({
        ok: true,
        task,
        items: storage.listTasks(req.webUser.id, 300),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'task_upsert_failed' });
    }
  });

  router.post('/api/tasks/toggle', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const task = storage.toggleTask(req.webUser.id, body.taskId, body.completed);
      if (!task) {
        return res.status(404).json({ ok: false, reason: 'task_not_found' });
      }
      return res.json({
        ok: true,
        task,
        items: storage.listTasks(req.webUser.id, 300),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'task_toggle_failed' });
    }
  });

  router.get('/api/planner', requireAuth, (req, res) => {
    const items = storage.listTasks(req.webUser.id, parseLimit(req.query && req.query.limit, 300));
    return res.json({
      ok: true,
      items,
      summary: {
        total: items.length,
        open: items.filter((item) => item.status !== 'done').length,
        completed: items.filter((item) => item.status === 'done').length,
        overdue: items.filter((item) => item.dueAt && item.status !== 'done' && Date.parse(item.dueAt) < Date.now()).length,
      },
    });
  });

  router.post('/api/planner', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const task = storage.upsertTask(req.webUser.id, body);
      return res.status(201).json({
        ok: true,
        task,
        items: storage.listTasks(req.webUser.id, 300),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'planner_upsert_failed' });
    }
  });

  router.patch('/api/planner/:taskId', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const task = storage.upsertTask(req.webUser.id, {
        ...body,
        id: req.params.taskId,
      });
      return res.json({
        ok: true,
        task,
        items: storage.listTasks(req.webUser.id, 300),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'planner_update_failed' });
    }
  });

  router.get('/api/support', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      topics: (siteContent.support && siteContent.support.topics) || [],
      contactModes: (siteContent.support && siteContent.support.contactModes) || [],
      supportCategories,
      items: storage.listSupportRequests(req.webUser.id, 100),
    });
  });

  router.post('/api/support', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const item = storage.createSupportRequest(req.webUser.id, body);
      return res.status(201).json({
        ok: true,
        item,
        items: storage.listSupportRequests(req.webUser.id, 100),
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'EMPTY_MESSAGE') {
        return res.status(400).json({ ok: false, reason: 'empty_message' });
      }
      return res.status(500).json({ ok: false, reason: 'support_create_failed' });
    }
  });

  router.get('/api/support/requests', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      supportCategories,
      items: storage.listSupportRequests(req.webUser.id, parseLimit(req.query && req.query.limit, 100)),
    });
  });

  router.post('/api/support/requests', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const item = storage.createSupportRequest(req.webUser.id, body);
      return res.status(201).json({
        ok: true,
        item,
        items: storage.listSupportRequests(req.webUser.id, 100),
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'EMPTY_MESSAGE') {
        return res.status(400).json({ ok: false, reason: 'empty_message' });
      }
      return res.status(500).json({ ok: false, reason: 'support_create_failed' });
    }
  });

  router.post('/api/support/requests/:requestId/messages', requireAuth, (req, res) => {
    try {
      if (!storage.appendSupportRequestMessage) {
        return res.status(501).json({ ok: false, reason: 'support_thread_unavailable' });
      }
      const item = storage.appendSupportRequestMessage(req.webUser.id, req.params.requestId, req.body || {});
      if (!item) {
        return res.status(404).json({ ok: false, reason: 'support_request_not_found' });
      }
      return res.json({
        ok: true,
        item,
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'EMPTY_MESSAGE') {
        return res.status(400).json({ ok: false, reason: 'empty_message' });
      }
      return res.status(500).json({ ok: false, reason: 'support_message_failed' });
    }
  });

  router.get('/api/notifications', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listNotifications(req.webUser.id, 100),
    });
  });

  router.post('/api/notifications/read', requireAuth, (req, res) => {
    try {
      const notification = storage.markNotificationRead(req.webUser.id, req.body && req.body.notificationId);
      if (!notification) {
        return res.status(404).json({ ok: false, reason: 'notification_not_found' });
      }
      return res.json({
        ok: true,
        notification,
        items: storage.listNotifications(req.webUser.id, 100),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'notification_update_failed' });
    }
  });

  router.post('/api/notifications/:notificationId/read', requireAuth, (req, res) => {
    try {
      const notification = storage.markNotificationRead(req.webUser.id, req.params.notificationId);
      if (!notification) {
        return res.status(404).json({ ok: false, reason: 'notification_not_found' });
      }
      return res.json({
        ok: true,
        notification,
        items: storage.listNotifications(req.webUser.id, 100),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'notification_update_failed' });
    }
  });

  router.post('/api/notifications/read-all', requireAuth, (req, res) => {
    try {
      const updated = storage.markAllNotificationsRead ? storage.markAllNotificationsRead(req.webUser.id) : 0;
      return res.json({
        ok: true,
        updated,
        items: storage.listNotifications(req.webUser.id, 100),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'notification_update_failed' });
    }
  });

  router.get('/api/activity', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: buildActivityFeed(req.webUser.id, parseLimit(req.query && req.query.limit, 50)),
    });
  });

  router.get('/api/products', (req, res) => {
    return res.json({
      ok: true,
      items: siteContent.products,
      links: {
        shop: siteContent.links.shop,
        payment: siteContent.links.payment,
      },
    });
  });

  router.get('/api/orders', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listOrders(req.webUser.id, 100),
    });
  });

  router.post('/api/orders', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const productId = String(body.productId || '').trim();
      const quantity = Math.max(1, Math.min(99, Number(body.quantity || 1) || 1));
      const note = String(body.note || '').trim();
      const product = siteContent.products.find((item) => item.id === productId);

      if (!product) {
        return res.status(404).json({ ok: false, reason: 'product_not_found' });
      }

      const order = storage.createOrder(req.webUser.id, {
        productId: product.id,
        productName: product.title,
        quantity,
        unitPrice: Number(product.priceRub || 0),
        total: Number(product.priceRub || 0) * quantity,
        currency: 'RUB',
        status: 'pending_payment',
        note,
      });

      return res.status(201).json({
        ok: true,
        order,
        redirectUrl: siteContent.links.payment || siteContent.links.shop || '',
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'order_create_failed' });
    }
  });

  router.get('/api/partner', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      overview: storage.getReferralStats(req.webUser.id, 5),
      marketing: storage.getMarketingContext ? storage.getMarketingContext({ userId: req.webUser.id }) : null,
      workspace: buildWorkspacePayload(req.webUser),
      levels: siteContent.partner.levels,
      rewards: siteContent.partner.rewards,
      payoutChecklist: siteContent.partner.payoutChecklist,
      structureUrl: siteContent.links.structure,
      referralCenter: siteContent.referralCenter,
      landingLibrary: siteContent.landingLibrary,
      promoCenter: siteContent.promoCenter,
      learningCenter: siteContent.learningCenter,
      arsenal: siteContent.arsenal,
    });
  });

  router.get('/api/leads', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listLeadDeskEntries ? storage.listLeadDeskEntries(req.webUser.id, parseLimit(req.query && req.query.limit, 120, 400)) : [],
      marketing: storage.getMarketingContext ? storage.getMarketingContext({ userId: req.webUser.id }) : null,
    });
  });

  router.post('/api/leads/:visitorId', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const entry = storage.upsertLeadDeskEntry(req.webUser.id, req.params.visitorId, {
        stageOverride: body.stageOverride || body.stageId,
        note: body.note,
        ownerTag: body.ownerTag || body.tag,
        followUpAt: body.followUpAt,
        pinned: body.pinned,
      });
      return res.json({
        ok: true,
        entry,
        items: storage.listLeadDeskEntries ? storage.listLeadDeskEntries(req.webUser.id, 200) : [],
        marketing: storage.getMarketingContext ? storage.getMarketingContext({ userId: req.webUser.id }) : null,
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'LEAD_VISITOR_REQUIRED') {
        return res.status(400).json({ ok: false, reason: 'lead_visitor_required' });
      }
      if (message === 'LEAD_NOT_FOUND') {
        return res.status(404).json({ ok: false, reason: 'lead_not_found' });
      }
      return res.status(500).json({ ok: false, reason: 'lead_save_failed' });
    }
  });

  router.delete('/api/leads/:visitorId', requireAuth, (req, res) => {
    const removed = storage.removeLeadDeskEntry ? storage.removeLeadDeskEntry(req.webUser.id, req.params.visitorId) : null;
    if (!removed) {
      return res.status(404).json({ ok: false, reason: 'lead_not_found' });
    }
    return res.json({
      ok: true,
      removed,
      items: storage.listLeadDeskEntries ? storage.listLeadDeskEntries(req.webUser.id, 200) : [],
      marketing: storage.getMarketingContext ? storage.getMarketingContext({ userId: req.webUser.id }) : null,
    });
  });

  router.get('/api/withdrawals', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listWithdrawals(req.webUser.id, 100),
      payoutChecklist: siteContent.partner.payoutChecklist,
    });
  });

  router.post('/api/withdrawals', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const withdrawal = storage.createWithdrawal(req.webUser.id, {
        amount: body.amount,
        method: body.method,
        payoutDetails: body.payoutDetails,
        note: body.note,
      });

      return res.status(201).json({
        ok: true,
        withdrawal,
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'Invalid amount') {
        return res.status(400).json({ ok: false, reason: 'invalid_amount' });
      }
      return res.status(500).json({ ok: false, reason: 'withdrawal_create_failed' });
    }
  });

  router.get('/api/media-library', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: buildMediaLibraryItems(req.query && req.query.limit),
      permissions: mediaLibraryPermissions(req.webUser),
    });
  });

  router.post('/api/media-library', requireAuth, (req, res) => {
    if (!canManageMediaLibrary(req.webUser)) {
      return res.status(403).json({ ok: false, reason: 'forbidden' });
    }
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const entry = storage.upsertMediaLibraryEntry(req.webUser.id, body);
      return res.json({
        ok: true,
        entry,
        items: buildMediaLibraryItems(1000),
        permissions: mediaLibraryPermissions(req.webUser),
      });
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'Media entry title required') {
        return res.status(400).json({ ok: false, reason: 'title_required' });
      }
      if (message === 'Media entry content required') {
        return res.status(400).json({ ok: false, reason: 'content_required' });
      }
      return res.status(500).json({ ok: false, reason: 'media_library_save_failed' });
    }
  });

  router.delete('/api/media-library/:entryId', requireAuth, (req, res) => {
    if (!canManageMediaLibrary(req.webUser)) {
      return res.status(403).json({ ok: false, reason: 'forbidden' });
    }
    const removed = storage.removeMediaLibraryEntry(req.webUser.id, req.params.entryId);
    if (!removed) {
      return res.status(404).json({ ok: false, reason: 'media_entry_not_found' });
    }
    return res.json({
      ok: true,
      removed,
      items: buildMediaLibraryItems(1000),
      permissions: mediaLibraryPermissions(req.webUser),
    });
  });

  router.get('/api/shortener/links', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.getShortLinks(req.webUser.id, parseLimit(req.query && req.query.limit, 100, 300)),
    });
  });

  router.post('/api/shortener/links', requireAuth, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const url = String(body.url || body.targetUrl || body.link || '').trim();
      const title = String(body.title || body.name || 'Referral link').trim();
      if (!url) {
        return res.status(400).json({ ok: false, reason: 'url_required' });
      }

      let bridge = null;
      if (config.arsenal && config.arsenal.proxyEnabled) {
        try {
          bridge = await requestArsenalJson('/api/shortener/links', {
            url,
            title,
            referralCode: req.webUser.referralCode || '',
          });
        } catch {
          bridge = null;
        }
      }

      const link = storage.createShortLink(req.webUser.id, {
        url,
        title,
        slug: body.slug || body.code || '',
      });

      return res.status(201).json({
        ok: true,
        provider: bridge ? 'arsenal+local' : 'local',
        bridge,
        link,
        items: storage.getShortLinks(req.webUser.id, 100),
      });
      // Karma: tool_use + link_create (capped server-side)
      try { awardKarmaGoldenConnect(req, 'tool_use', null, 'shortener'); awardKarmaGoldenConnect(req, 'link_create', null, link && link.code); } catch (_) {}
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      if (message === 'Invalid short link url') {
        return res.status(400).json({ ok: false, reason: 'invalid_url' });
      }
      return res.status(500).json({ ok: false, reason: 'shortener_failed' });
    }
  });

  router.post('/api/tools/qr', requireAuth, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const url = String(body.url || body.targetUrl || body.text || '').trim();
      if (!url) {
        return res.status(400).json({ ok: false, reason: 'url_required' });
      }

      if (config.arsenal && config.arsenal.proxyEnabled) {
        try {
          const bridge = await requestArsenalJson('/api/tools/qr', {
            url,
            text: url,
            title: body.title || '',
          });
          const dataUrl = String(
            (bridge && bridge.dataUrl)
            || (bridge && bridge.qr)
            || (bridge && bridge.image)
            || ''
          ).trim();
          if (dataUrl) {
            return (function(){ try { awardKarmaGoldenConnect(req, 'tool_use', null, 'qr'); } catch (_) {} })(); res.json({
              ok: true,
              qr: {
                url,
                dataUrl,
                provider: 'arsenal',
              },
            });
          }
        } catch {
          // fall back to local generation
        }
      }

      const dataUrl = await QRCode.toDataURL(url, {
        width: Math.max(240, Math.min(1024, Number(body.size) || 360)),
        margin: 1,
      });
      return res.json({
        ok: true,
        qr: {
          url,
          dataUrl,
          provider: 'local',
        },
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'qr_failed' });
    }
  });

  router.post('/api/aitools/hashtags', requireAuth, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const input = String(body.input || body.topic || body.text || '').trim();
      const platform = String(body.platform || 'instagram').trim().toLowerCase();
      const count = Math.max(6, Math.min(30, Number(body.count) || 18));
      if (!input) {
        return res.status(400).json({ ok: false, reason: 'input_required' });
      }

      if (config.arsenal && config.arsenal.proxyEnabled) {
        try {
          const bridge = await requestArsenalJson('/api/aitools/hashtags', {
            input,
            topic: input,
            platform,
            count,
          });
          const hashtags = safeArray(
            (bridge && bridge.hashtags)
            || (bridge && bridge.tags)
            || (bridge && bridge.items)
            || (bridge && bridge.data)
          )
            .map((item) => (typeof item === 'string' ? item : item && item.tag ? item.tag : ''))
            .filter(Boolean);
          if (hashtags.length) {
            return (function(){ try { awardKarmaGoldenConnect(req, 'tool_use', null, 'hashtags'); } catch (_) {} })(); res.json({
              ok: true,
              provider: 'arsenal',
              hashtags,
            });
          }
        } catch {
          // fall back to local generation
        }
      }

      return res.json({
        ok: true,
        provider: 'local',
        hashtags: buildLocalHashtags(input, platform, count),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'hashtags_failed' });
    }
  });

  router.post('/api/aitools/caption', requireAuth, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const topic = String(body.topic || body.input || body.text || '').trim();
      const platform = String(body.platform || 'instagram').trim().toLowerCase();
      const tone = String(body.tone || 'helpful').trim().toLowerCase();
      if (!topic) {
        return res.status(400).json({ ok: false, reason: 'topic_required' });
      }

      if (config.arsenal && config.arsenal.proxyEnabled) {
        try {
          const bridge = await requestArsenalJson('/api/aitools/caption', {
            topic,
            input: topic,
            platform,
            tone,
          });
          const items = safeArray(
            (bridge && bridge.captions)
            || (bridge && bridge.items)
            || (bridge && bridge.data)
          ).map((item) => {
            if (typeof item === 'string') return { caption: item };
            return { caption: String(item && (item.caption || item.text || item.value) || '').trim() };
          }).filter((item) => item.caption);
          if (items.length) {
            return (function(){ try { awardKarmaGoldenConnect(req, 'tool_use', null, 'caption'); } catch (_) {} })(); res.json({
              ok: true,
              provider: 'arsenal',
              items,
            });
          }
        } catch {
          // fall back to local generation
        }
      }

      return res.json({
        ok: true,
        provider: 'local',
        items: buildLocalCaptions(topic, platform, tone),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'caption_failed' });
    }
  });


  router.get('/api/usage/status', requireAuth, (req, res) => {
    try {
      const _lim = require('./helpers/usage-limits');
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.json({ ok: true, plan: 'free', usage: {} });
      const services = (req.query.services || '').toString().split(',').filter(Boolean);
      const usage = _lim.getUsageSummary(pu.id, services.length ? services : undefined);
      return res.json({ ok: true, plan: _lim.getUserPlan(pu.id), usage });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // ── Unified TG-channels registry (shared across services) ──────────
  router.get('/api/tg-channels', requireAuth, (req, res) => {
    try {
      const tg = require('./helpers/tg-channels');
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.json({ ok: true, channels: [] });
      const items = tg.list(pu.id);
      return res.json({ ok: true, channels: items });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/tg-channels', requireAuth, async (req, res) => {
    try {
      const tg = require('./helpers/tg-channels');
      const _lim = require('./helpers/usage-limits');
      const publisher = require('./services/ad-publisher');
      const dbModule = require('./planner/db/database');
      const dbm = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.status(403).json({ ok: false, reason: 'no_planner_user' });
      const lim = await _lim.checkLimitAsync(pu.id, 'adcenter.sources', { email: u.email });
      if (!lim.ok) return res.status(429).json({ ok: false, code: 'LIMIT_REACHED', service: 'adcenter.sources', used: lim.used, limit: lim.limit, plan: lim.plan });
      const chatId = (req.body && (req.body.chat_id || req.body.channel || req.body.username)) || '';
      if (!chatId) return res.status(400).json({ ok: false, reason: 'chat_id_required' });
      const check = await publisher.checkBotAdmin(chatId);
      if (!check.ok) return res.status(400).json({ ok: false, reason: check.error });
      const exists = tg.findByChatId(pu.id, check.chat.id);
      if (exists) return res.status(400).json({ ok: false, reason: 'already_added', channel: exists });
      const ch = tg.add(pu.id, {
        chat_id: check.chat.id,
        type: check.chat.type === 'channel' ? 'tg_channel' : 'tg_group',
        title: check.chat.title,
        username: check.chat.username || '',
        member_count: check.chat.member_count || 0,
        bot_is_admin: check.bot_is_admin ? 1 : 0,
      });
      return res.json({ ok: true, channel: ch, bot_is_admin: check.bot_is_admin });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.delete('/api/tg-channels/:id', requireAuth, (req, res) => {
    try {
      const tg = require('./helpers/tg-channels');
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.status(403).json({ ok: false });
      const ok = tg.softRemove(pu.id, Number(req.params.id));
      return res.json({ ok });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/tg-channels/:id/usage', requireAuth, (req, res) => {
    try {
      const tg = require('./helpers/tg-channels');
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.json({ ok: true, usage: {} });
      return res.json({ ok: true, usage: tg.getUsage(pu.id, Number(req.params.id)) });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // ── Shops (one shop per user) + public product card ───────────────
  function _bridgePlannerUser(rawDb, wu) {
    if (!wu) return null;
    let pu = null;
    if (wu.telegramUserId) pu = rawDb.prepare('SELECT id, ref_code, tg_first_name, tg_username FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
    if (!pu) pu = rawDb.prepare('SELECT id, ref_code, tg_first_name, tg_username FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
    return pu;
  }

  function _slugify(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u0400-\u04FF]/g, function (c) {
        const m = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sh','ы':'y','э':'e','ю':'yu','я':'ya','ъ':'','ь':'' };
        return m[c] || '';
      })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  router.get('/api/shops/me', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const pu = _bridgePlannerUser(rawDb, req.webUser);
      if (!pu) return res.status(403).json({ ok: false, reason: 'no_planner_user' });
      let shop = rawDb.prepare('SELECT * FROM user_shops WHERE user_id = ?').get(pu.id);
      if (!shop) return res.json({ ok: true, shop: null });
      let socials = []; try { socials = JSON.parse(shop.social_links_json || '[]'); } catch (_) {}
      shop.social_links = socials;
      const products = rawDb.prepare(
        "SELECT p.*, sp.is_featured, sp.position FROM shop_products sp JOIN user_products p ON p.id = sp.product_id WHERE sp.shop_id = ? AND p.is_active = 1 ORDER BY sp.is_featured DESC, sp.position ASC"
      ).all(shop.id);
      return res.json({ ok: true, shop, products });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/shops/me', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const pu = _bridgePlannerUser(rawDb, req.webUser);
      if (!pu) return res.status(403).json({ ok: false, reason: 'no_planner_user' });
      const b = req.body || {};
      let shop = rawDb.prepare('SELECT * FROM user_shops WHERE user_id = ?').get(pu.id);
      if (!shop) {
        let baseSlug = _slugify(b.slug || pu.tg_username || pu.tg_first_name || ('shop-' + pu.id));
        if (!baseSlug) baseSlug = 'shop-' + pu.id;
        let slug = baseSlug;
        let n = 1;
        while (rawDb.prepare('SELECT id FROM user_shops WHERE slug = ?').get(slug)) {
          n += 1; slug = baseSlug + '-' + n;
        }
        const r = rawDb.prepare(
          "INSERT INTO user_shops (user_id, slug, title, tagline, about_html, avatar_url, banner_url, theme_color, accent_color, contact_tg, contact_email, social_links_json, is_public) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).run(
          pu.id, slug, (b.title || pu.tg_first_name || 'Магазин ' + pu.id).slice(0, 120),
          (b.tagline || '').slice(0, 200),
          (b.about_html || '').slice(0, 8000),
          b.avatar_url || null, b.banner_url || null,
          b.theme_color || '#00D4FF', b.accent_color || '#B14AED',
          (b.contact_tg || '').slice(0, 60), (b.contact_email || '').slice(0, 120),
          JSON.stringify(Array.isArray(b.social_links) ? b.social_links : []),
          b.is_public === false ? 0 : 1,
        );
        shop = rawDb.prepare('SELECT * FROM user_shops WHERE id = ?').get(r.lastInsertRowid);
      } else {
        const fields = ['title', 'tagline', 'about_html', 'avatar_url', 'banner_url', 'theme_color', 'accent_color', 'contact_tg', 'contact_email'];
        for (const f of fields) {
          if (b[f] !== undefined) rawDb.prepare("UPDATE user_shops SET " + f + " = ? WHERE id = ?").run(b[f], shop.id);
        }
        if (b.is_public !== undefined) rawDb.prepare("UPDATE user_shops SET is_public = ? WHERE id = ?").run(b.is_public ? 1 : 0, shop.id);
        if (b.social_links !== undefined) rawDb.prepare("UPDATE user_shops SET social_links_json = ? WHERE id = ?").run(JSON.stringify(b.social_links || []), shop.id);
        if (b.slug && b.slug !== shop.slug) {
          const newSlug = _slugify(b.slug);
          if (newSlug && !rawDb.prepare('SELECT id FROM user_shops WHERE slug = ? AND id != ?').get(newSlug, shop.id)) {
            rawDb.prepare("UPDATE user_shops SET slug = ? WHERE id = ?").run(newSlug, shop.id);
          }
        }
        shop = rawDb.prepare('SELECT * FROM user_shops WHERE id = ?').get(shop.id);
      }
      return res.json({ ok: true, shop });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/shops/products', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const pu = _bridgePlannerUser(rawDb, req.webUser);
      if (!pu) return res.status(403).json({ ok: false, reason: 'no_planner_user' });
      let shop = rawDb.prepare('SELECT * FROM user_shops WHERE user_id = ?').get(pu.id);
      if (!shop) return res.status(400).json({ ok: false, reason: 'create_shop_first' });
      const productId = Number(req.body && req.body.product_id);
      if (!productId) return res.status(400).json({ ok: false, reason: 'product_id_required' });
      const product = rawDb.prepare("SELECT id FROM user_products WHERE id = ? AND is_active = 1").get(productId);
      if (!product) return res.status(404).json({ ok: false, reason: 'product_not_found' });
      const maxPos = rawDb.prepare('SELECT MAX(position) AS m FROM shop_products WHERE shop_id = ?').get(shop.id);
      try {
        rawDb.prepare("INSERT INTO shop_products (shop_id, product_id, is_featured, position) VALUES (?, ?, ?, ?)")
          .run(shop.id, productId, req.body.is_featured ? 1 : 0, ((maxPos && maxPos.m) || 0) + 1);
      } catch (_) { /* UNIQUE collision */ return res.status(400).json({ ok: false, reason: 'already_in_shop' }); }
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.delete('/api/shops/products/:productId', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const pu = _bridgePlannerUser(rawDb, req.webUser);
      if (!pu) return res.status(403).json({ ok: false });
      const shop = rawDb.prepare('SELECT id FROM user_shops WHERE user_id = ?').get(pu.id);
      if (!shop) return res.json({ ok: true });
      rawDb.prepare("DELETE FROM shop_products WHERE shop_id = ? AND product_id = ?").run(shop.id, Number(req.params.productId));
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/shops/me/analytics', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.json({ ok: true, analytics: null });

      const shop = rawDb.prepare('SELECT * FROM user_shops WHERE user_id = ?').get(pu.id);
      if (!shop) return res.json({ ok: true, analytics: null });

      // Visits 14d daily breakdown
      const visits14d = rawDb.prepare(
        "SELECT date(visited_at) AS day, COUNT(*) AS cnt, COUNT(DISTINCT ip_hash) AS unique_visitors FROM shop_visits WHERE shop_id = ? AND visited_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day"
      ).all(shop.id);

      const totals = rawDb.prepare(
        "SELECT COUNT(*) AS total_visits, COUNT(DISTINCT ip_hash) AS unique_visitors, COUNT(CASE WHEN visited_at >= datetime('now', '-7 days') THEN 1 END) AS week_visits, COUNT(CASE WHEN visited_at >= datetime('now', '-1 day') THEN 1 END) AS today_visits FROM shop_visits WHERE shop_id = ?"
      ).get(shop.id);

      // Products in this shop with stats
      const products = rawDb.prepare(
        "SELECT p.id, p.title, p.price_usd, p.view_count, p.total_sales, p.total_revenue, p.avg_rating, p.reviews_count, p.seller_pct, sp.is_featured, " +
        "(SELECT COUNT(DISTINCT pv.ip_hash) FROM product_views pv WHERE pv.product_id = p.id) AS unique_views_all_time " +
        "FROM shop_products sp JOIN user_products p ON p.id = sp.product_id WHERE sp.shop_id = ? AND p.is_active = 1 ORDER BY p.total_sales DESC, p.view_count DESC"
      ).all(shop.id);

      // Recent purchases (last 30) where buyer_user_id or shop_owner_user_id mentioned this shop owner
      const recentSales = rawDb.prepare(
        "SELECT pp.id, pp.amount_usd, pp.buyer_email, pp.created_at, p.title AS product_title FROM product_purchases pp JOIN user_products p ON p.id = pp.product_id WHERE pp.payment_status = 'paid' AND (pp.seller_user_id = ? OR pp.shop_owner_user_id = ?) ORDER BY pp.created_at DESC LIMIT 20"
      ).all(pu.id, pu.id);

      // Revenue 14d (from purchases where pu.id is seller or shop-owner)
      const revenue14d = rawDb.prepare(
        "SELECT date(created_at) AS day, COUNT(*) AS sales, SUM(amount_usd) AS revenue FROM product_purchases WHERE payment_status = 'paid' AND (seller_user_id = ? OR shop_owner_user_id = ?) AND created_at >= datetime('now', '-14 days') GROUP BY day ORDER BY day"
      ).all(pu.id, pu.id);

      // Earnings totals (from splits)
      const earnings = rawDb.prepare(
        "SELECT split_type, SUM(amount_usd) AS total, COUNT(*) AS n FROM product_purchase_splits WHERE recipient_user_id = ? GROUP BY split_type"
      ).all(pu.id);

      // Top referrers (which ?ref=N drove most visits)
      const topReferrers = rawDb.prepare(
        "SELECT ref_user_id, COUNT(*) AS visits FROM shop_visits WHERE shop_id = ? AND ref_user_id IS NOT NULL GROUP BY ref_user_id ORDER BY visits DESC LIMIT 5"
      ).all(shop.id);

      // Conversion: total visits / total sales count for owner
      const totalSales = rawDb.prepare(
        "SELECT COUNT(*) AS c FROM product_purchases WHERE payment_status = 'paid' AND (seller_user_id = ? OR shop_owner_user_id = ?)"
      ).get(pu.id, pu.id).c || 0;

      const conversionPct = totals.total_visits > 0 ? Math.round((totalSales / totals.total_visits) * 1000) / 10 : 0;

      return res.json({
        ok: true,
        analytics: {
          shop: { id: shop.id, slug: shop.slug, title: shop.title },
          totals: {
            total_visits: totals.total_visits || 0,
            unique_visitors: totals.unique_visitors || 0,
            week_visits: totals.week_visits || 0,
            today_visits: totals.today_visits || 0,
            total_sales: totalSales,
            conversion_pct: conversionPct,
          },
          visits14d,
          revenue14d,
          products,
          recentSales,
          earnings,
          topReferrers,
        },
      });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/shops/me/earnings', requireAuth, (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const wu = req.webUser;
      let pu = null;
      if (wu.telegramUserId) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(Number(wu.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(wu.id));
      if (!pu) return res.json({ ok: true, earnings: { total: 0 } });
      const split = require('./services/shop-split');
      return res.json({ ok: true, earnings: split.getEarnings(pu.id) });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/shops/by-slug/:slug', (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const slug = String(req.params.slug || '').toLowerCase();
      const shop = rawDb.prepare("SELECT * FROM user_shops WHERE slug = ? AND is_public = 1").get(slug);
      if (!shop) return res.status(404).json({ ok: false, reason: 'not_found' });
      let socials = []; try { socials = JSON.parse(shop.social_links_json || '[]'); } catch (_) {}
      shop.social_links = socials;
      const products = rawDb.prepare(
        "SELECT p.*, sp.is_featured, sp.position FROM shop_products sp JOIN user_products p ON p.id = sp.product_id WHERE sp.shop_id = ? AND p.is_active = 1 ORDER BY sp.is_featured DESC, sp.position ASC"
      ).all(shop.id);
      try { rawDb.prepare("UPDATE user_shops SET total_views = total_views + 1 WHERE id = ?").run(shop.id); } catch (_) {}
      try { _tracker.trackShopVisit(req, shop.id, Number(req.query.ref) || null); } catch (_) {}
      return res.json({ ok: true, shop, products });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // Public shop landing page
  router.get('/shop/:slug', (req, res) => {
    try {
      const _tracker = require('./services/shop-tracker');
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const slug = String(req.params.slug || '').toLowerCase();
      const shop = rawDb.prepare("SELECT s.*, u.tg_username, u.tg_first_name FROM user_shops s LEFT JOIN users u ON u.id = s.user_id WHERE s.slug = ? AND s.is_public = 1").get(slug);
      if (!shop) return res.status(404).type('html').send('<h1>404 Магазин не найден</h1>');
      try { rawDb.prepare("UPDATE user_shops SET total_views = total_views + 1 WHERE id = ?").run(shop.id); } catch (_) {}
      try { _tracker.trackShopVisit(req, shop.id, Number(req.query.ref) || null); } catch (_) {}
      const products = rawDb.prepare(
        "SELECT p.*, sp.is_featured, sp.position FROM shop_products sp JOIN user_products p ON p.id = sp.product_id WHERE sp.shop_id = ? AND p.is_active = 1 ORDER BY sp.is_featured DESC, sp.position ASC"
      ).all(shop.id);
      let socials = []; try { socials = JSON.parse(shop.social_links_json || '[]'); } catch (_) {}
      const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const acc1 = escAttr(shop.theme_color || '#00D4FF');
      const acc2 = escAttr(shop.accent_color || '#B14AED');
      const title = escAttr(shop.title || 'Магазин');
      const tagline = escAttr(shop.tagline || '');
      const desc = (shop.about_html || shop.tagline || ('Магазин ' + shop.title)).slice(0, 200);
      const ogImage = shop.banner_url || shop.avatar_url || '/cabinet/img/og-default.png';
      let bodyHtml = '<!doctype html><html lang="ru"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + title + '</title>' +
        '<meta name="description" content="' + escAttr(desc) + '">' +
        '<meta property="og:type" content="website">' +
        '<meta property="og:title" content="' + title + '">' +
        '<meta property="og:description" content="' + escAttr(desc) + '">' +
        '<meta property="og:image" content="' + escAttr(ogImage) + '">' +
        '<meta name="twitter:card" content="summary_large_image">' +
        '<script type="application/ld+json">' + JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Product",
          "name": p.title || "Product",
          "description": String(p.description || "").slice(0, 500),
          "image": ogImg,
          "sku": String(p.id),
          "brand": { "@type": "Brand", "name": "Golden Connect Marketplace" },
          "offers": {
            "@type": "Offer",
            "url": "https://goldenConnect.to/p/" + req.params.slugId,
            "priceCurrency": "USD",
            "price": String(price),
            "availability": "https://schema.org/InStock",
            "seller": { "@type": "Person", "name": p.seller_name || "Anonymous" }
          },
          "aggregateRating": (p.avg_rating && p.review_count) ? {
            "@type": "AggregateRating",
            "ratingValue": String(p.avg_rating || 0),
            "reviewCount": String(p.review_count || 0)
          } : undefined
        }) + '</script>' +
        '<style>' +
          ':root{--c1:' + acc1 + ';--c2:' + acc2 + '}' +
          'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#070b14;color:#e8edf5;line-height:1.5}' +
          '.banner{height:200px;background:' + (shop.banner_url ? "url('" + escAttr(shop.banner_url) + "') center/cover" : 'linear-gradient(135deg,var(--c1),var(--c2))') + '}' +
          '.head{max-width:980px;margin:-80px auto 0;padding:0 18px;text-align:center;position:relative}' +
          '.avatar{width:140px;height:140px;border-radius:50%;background:#070b14;border:4px solid #070b14;background-size:cover;background-position:center;margin:0 auto;box-shadow:0 12px 40px rgba(0,0,0,.5);' +
            (shop.avatar_url ? "background-image:url('" + escAttr(shop.avatar_url) + "')" : 'background:linear-gradient(135deg,var(--c1),var(--c2))') + '}' +
          'h1{font-size:32px;margin:14px 0 4px;color:#fff}' +
          '.tagline{color:#9ca3af;font-size:15px;margin-bottom:14px}' +
          '.about{max-width:640px;margin:0 auto 24px;color:#cbd5e1;font-size:14px;line-height:1.7;padding:14px 18px;background:rgba(13,17,36,.6);border-radius:12px;border:1px solid rgba(255,255,255,.06);white-space:pre-wrap;text-align:left}' +
          '.contacts{display:flex;justify-content:center;gap:10px;margin-bottom:24px;flex-wrap:wrap}' +
          '.contacts a{background:rgba(0,0,0,.3);color:#00D4FF;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px;border:1px solid rgba(0,212,255,.2)}' +
          '.contacts a:hover{background:rgba(0,212,255,.1)}' +
          '.section-title{max-width:980px;margin:30px auto 14px;padding:0 18px;color:#fff;font-size:20px;font-weight:700}' +
          '.grid{max-width:980px;margin:0 auto;padding:0 18px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}' +
          '.card{background:rgba(13,17,36,.6);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.08);transition:transform .15s,border-color .15s;text-decoration:none;color:inherit;display:flex;flex-direction:column}' +
          '.card:hover{transform:translateY(-2px);border-color:rgba(0,212,255,.35)}' +
          '.card-img{height:180px;background:linear-gradient(135deg,rgba(0,212,255,.1),rgba(177,74,237,.1));position:relative;background-size:cover;background-position:center}' +
          '.card-feat{position:absolute;top:8px;left:8px;background:#fbbf24;color:#000;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:800}' +
          '.card-price{position:absolute;top:8px;right:8px;background:#10b981;color:#fff;padding:3px 10px;border-radius:6px;font-size:13px;font-weight:800}' +
          '.card-body{padding:14px;flex:1;display:flex;flex-direction:column}' +
          '.card-title{color:#fff;font-size:14px;font-weight:700;margin:0 0 6px}' +
          '.card-rating{color:#fbbf24;font-size:12px;margin-bottom:6px}' +
          '.card-desc{color:#9ca3af;font-size:12px;line-height:1.5;flex:1}' +
          '.empty{text-align:center;padding:40px 20px;color:#9ca3af;background:rgba(13,17,36,.6);border-radius:14px;border:1px dashed rgba(255,255,255,.15);max-width:600px;margin:0 auto}' +
          'footer{padding:30px 18px;text-align:center;color:#6b7280;font-size:12px}' +
          'footer a{color:#00D4FF;text-decoration:none}' +
        '</style></head><body>' +
        '<div class="banner"></div>' +
        '<div class="head"><div class="avatar"></div>' +
        '<h1>' + escHtml(shop.title || 'Магазин') + '</h1>' +
        (tagline ? '<div class="tagline">' + escHtml(shop.tagline) + '</div>' : '');
      // Contacts
      bodyHtml += '<div class="contacts">';
      if (shop.contact_tg) bodyHtml += '<a href="https://t.me/' + escAttr(String(shop.contact_tg).replace(/^@/, '')) + '" target="_blank">📱 Telegram</a>';
      if (shop.contact_email) bodyHtml += '<a href="mailto:' + escAttr(shop.contact_email) + '">✉ Email</a>';
      socials.forEach(function (s) { if (s && s.url && s.label) bodyHtml += '<a href="' + escAttr(s.url) + '" target="_blank">' + escHtml(s.label) + '</a>'; });
      bodyHtml += '</div>';
      if (shop.about_html) bodyHtml += '<div class="about">' + escHtml(shop.about_html) + '</div>';
      bodyHtml += '</div>';
      // Products
      bodyHtml += '<div class="section-title">🛍 Товары (' + products.length + ')</div>';
      if (!products.length) {
        bodyHtml += '<div class="grid"><div class="empty" style="grid-column:1/-1"><h3 style="color:#e8edf5">Товаров пока нет</h3><p>Владелец магазина ещё не добавил товары.</p></div></div>';
      } else {
        bodyHtml += '<div class="grid">';
        products.forEach(function (p) {
          const slug = p.slug || 'p';
          const cardUrl = '/cabinet/p/' + slug + '-' + p.id + '?ref=' + shop.user_id;
          const stars = p.reviews_count ? ('★★★★★'.slice(0, Math.round(p.avg_rating || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(p.avg_rating || 0))) : '';
          bodyHtml += '<a class="card" href="' + escAttr(cardUrl) + '">' +
            '<div class="card-img"' + (p.preview_image ? ' style="background-image:url(' + JSON.stringify(p.preview_image) + ')"' : '') + '>' +
              (p.is_featured ? '<span class="card-feat">⭐ ТОП</span>' : '') +
              '<span class="card-price">$' + Number(p.price_usd || 0).toFixed(2) + '</span>' +
            '</div>' +
            '<div class="card-body">' +
              '<div class="card-title">' + escHtml(p.title) + '</div>' +
              (stars ? '<div class="card-rating">' + stars + ' <span style="color:#9ca3af">(' + p.reviews_count + ')</span></div>' : '') +
              '<div class="card-desc">' + escHtml((p.description || '').slice(0, 100)) + ((p.description || '').length > 100 ? '…' : '') + '</div>' +
            '</div>' +
          '</a>';
        });
        bodyHtml += '</div>';
      }
      bodyHtml += '<footer>Магазин на <a href="/cabinet/">Golden Connect Marketplace</a> · Создай свой за 60 секунд</footer></body></html>';
      res.type('html').send(bodyHtml);
    } catch (e) {
      res.status(500).type('html').send('<h1>500 ' + e.message + '</h1>');
    }
  });

  // Public global marketplace catalog (no auth)
  router.get('/marketplace', (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const cat = (req.query.cat || '').toString();
      const sort = (req.query.sort || 'popular').toString();
      const search = (req.query.q || '').toString().trim();
      let where = "p.is_active = 1";
      const params = [];
      if (cat) { where += " AND p.category = ?"; params.push(cat); }
      if (search) { where += " AND (p.title LIKE ? OR p.description LIKE ?)"; params.push('%' + search + '%', '%' + search + '%'); }
      let orderBy = 'p.id DESC';
      if (sort === 'popular') orderBy = 'p.total_sales DESC, p.id DESC';
      else if (sort === 'rating') orderBy = 'p.avg_rating DESC, p.reviews_count DESC';
      else if (sort === 'price_low') orderBy = 'p.price_usd ASC';
      else if (sort === 'price_high') orderBy = 'p.price_usd DESC';
      else if (sort === 'max_network') orderBy = 'COALESCE(p.seller_pct, 0.70) ASC, p.id DESC';
      else if (sort === 'max_network') orderBy = 'COALESCE(p.seller_pct, 0.70) ASC, p.id DESC';
      const products = rawDb.prepare(
        "SELECT p.*, u.tg_username AS seller_username, u.tg_first_name AS seller_name FROM user_products p LEFT JOIN users u ON u.id = p.user_id WHERE " + where + " ORDER BY " + orderBy + " LIMIT 200"
      ).all(...params);
      const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const cats = [['', 'Все'], ['course', 'Курсы'], ['ebook', 'E-books'], ['template', 'Шаблоны'], ['music', 'Музыка'], ['software', 'Софт'], ['preset', 'Пресеты'], ['other', 'Другое']];
      const sorts = [['popular', '🔥 Популярные'], ['rating', '⭐ Рейтинг'], ['max_network', '🤝 Макс. в сеть'], ['newest', '🆕 Новые'], ['price_low', '💰 Дешевле'], ['price_high', '💎 Дороже']];
      let html = '<!doctype html><html lang="ru"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Golden Connect Marketplace — Товары от пользователей</title>' +
        '<meta name="description" content="Курсы, шаблоны, цифровые товары от создателей по всему миру. С отзывами и реферальной программой.">' +
        '<meta property="og:title" content="Golden Connect Marketplace">' +
        '<meta property="og:image" content="/cabinet/img/og-default.png">' +
        '<style>' +
          'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#070b14;color:#e8edf5;line-height:1.5}' +
          'header{padding:18px;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.4);display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}' +
          'header h1{margin:0;font-size:22px;color:#fff}' +
          'header a{color:#00D4FF;text-decoration:none}' +
          '.toolbar{max-width:1200px;margin:0 auto;padding:18px;display:flex;gap:12px;flex-wrap:wrap;align-items:center}' +
          '.search{flex:1;min-width:200px;background:#0c111a;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:10px 14px;color:#fff;font-size:14px}' +
          '.chips{display:flex;gap:6px;flex-wrap:wrap}' +
          '.chip{background:rgba(13,17,36,.6);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:6px 14px;color:#9ca3af;font-size:12px;text-decoration:none;cursor:pointer}' +
          '.chip.active{background:linear-gradient(135deg,#00D4FF,#B14AED);color:#fff;border-color:transparent}' +
          '.grid{max-width:1200px;margin:0 auto;padding:0 18px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}' +
          '.card{background:rgba(13,17,36,.6);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.08);text-decoration:none;color:inherit;display:flex;flex-direction:column;transition:transform .15s}' +
          '.card:hover{transform:translateY(-2px)}' +
          '.card-img{height:180px;background:linear-gradient(135deg,rgba(0,212,255,.1),rgba(177,74,237,.1));position:relative;background-size:cover;background-position:center}' +
          '.card-price{position:absolute;top:8px;right:8px;background:#10b981;color:#fff;padding:3px 10px;border-radius:6px;font-size:13px;font-weight:800}' +
          '.card-body{padding:14px;flex:1;display:flex;flex-direction:column}' +
          '.card-cat{display:inline-block;background:rgba(0,212,255,.1);color:#00D4FF;padding:2px 8px;border-radius:5px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}' +
          '.card-title{color:#fff;font-size:14px;font-weight:700;margin:0 0 4px}' +
          '.card-seller{color:#9ca3af;font-size:11px;margin-bottom:6px}' +
          '.card-rating{color:#fbbf24;font-size:12px;margin-bottom:6px}' +
          '.empty{text-align:center;padding:60px 20px;color:#9ca3af}' +
          'footer{padding:24px;text-align:center;color:#6b7280;font-size:12px}' +
        '</style></head><body>' +
      '<header><h1>🛍 Golden Connect Marketplace</h1><div><a href="/cabinet/">← В кабинет</a></div></header>' +
      '<div class="toolbar">' +
        '<form method="GET" style="flex:1;display:flex;gap:8px"><input class="search" name="q" placeholder="🔍 Поиск товара..." value="' + escAttr(search) + '"><input type="hidden" name="cat" value="' + escAttr(cat) + '"><input type="hidden" name="sort" value="' + escAttr(sort) + '"></form>' +
        '<div class="chips">';
      cats.forEach(function (c) {
        const active = (cat === c[0] || (!cat && !c[0]));
        const url = '/marketplace?cat=' + encodeURIComponent(c[0]) + '&sort=' + encodeURIComponent(sort) + (search ? '&q=' + encodeURIComponent(search) : '');
        html += '<a class="chip' + (active ? ' active' : '') + '" href="' + url + '">' + c[1] + '</a>';
      });
      html += '</div><div class="chips">';
      sorts.forEach(function (s) {
        const active = (sort === s[0]);
        const url = '/marketplace?sort=' + encodeURIComponent(s[0]) + (cat ? '&cat=' + encodeURIComponent(cat) : '') + (search ? '&q=' + encodeURIComponent(search) : '');
        html += '<a class="chip' + (active ? ' active' : '') + '" href="' + url + '">' + s[1] + '</a>';
      });
      html += '</div></div>';
      if (!products.length) {
        html += '<div class="empty"><div style="font-size:64px">🔍</div><h2 style="color:#e8edf5">Товары не найдены</h2><p>Попробуй изменить фильтры или поисковый запрос.</p></div>';
      } else {
        html += '<div class="grid">';
        products.forEach(function (p) {
          const slug = p.slug || 'p';
          const url = '/cabinet/p/' + slug + '-' + p.id;
          const stars = p.reviews_count ? ('★★★★★'.slice(0, Math.round(p.avg_rating || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(p.avg_rating || 0))) : '';
          html += '<a class="card" href="' + escAttr(url) + '">' +
            '<div class="card-img"' + (p.preview_image ? ' style="background-image:url(' + JSON.stringify(p.preview_image) + ')"' : '') + '>' +
              '<span class="card-price">$' + Number(p.price_usd || 0).toFixed(2) + '</span>' +
            '</div>' +
            '<div class="card-body">' +
              (p.category ? '<div class="card-cat">' + escHtml(p.category) + '</div>' : '') +
              '<div class="card-title">' + escHtml(p.title) + '</div>' +
              '<div class="card-seller">от ' + escHtml(p.seller_name || ('#' + p.user_id)) + (p.seller_username ? ' · @' + escHtml(p.seller_username) : '') + '</div>' +
              (stars ? '<div class="card-rating">' + stars + ' <span style="color:#9ca3af">(' + p.reviews_count + ')</span></div>' : '') +
              (p.seller_pct !== null && p.seller_pct < 0.70 ? '<div style="display:inline-block;background:rgba(16,185,129,.15);color:#10b981;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;margin-top:4px">🤝 в сеть: ' + Math.round((1 - p.seller_pct) * 100) + '%</div>' : '') +
            '</div>' +
          '</a>';
        });
        html += '</div>';
      }
      html += '<footer>Golden Connect Marketplace · <a href="/cabinet/" style="color:#9ca3af">Хочешь продавать тут? Зарегистрируйся в кабинете</a></footer></body></html>';
      res.type('html').send(html);
    } catch (e) {
      res.status(500).type('html').send('<h1>500 ' + e.message + '</h1>');
    }
  });

  // ── Reviews ────────────────────────────────────────────────────────
  router.get('/api/product-reviews/:id/link', (req, res) => {
    try {
      const t = String(req.query.token || '').trim();
      if (!t) return res.status(400).json({ ok: false, reason: 'token_required' });
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const p = rawDb.prepare("SELECT slug FROM user_products WHERE id = ?").get(req.params.id);
      const slug = (p && p.slug) || 'p';
      return res.json({ ok: true, url: '/cabinet/p/' + slug + '-' + req.params.id + '?t=' + encodeURIComponent(t) + '#review' });
    } catch (e) {
      return res.status(500).json({ ok: false });
    }
  });

  router.get('/api/product-reviews/:id', (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const reviews = rawDb.prepare(
        "SELECT id, rating, text, buyer_email, created_at FROM product_reviews WHERE product_id = ? ORDER BY id DESC LIMIT 100"
      ).all(req.params.id);
      // Mask emails (a***@b***.com)
      reviews.forEach(function (r) {
        if (r.buyer_email) {
          const at = r.buyer_email.indexOf('@');
          if (at > 0) r.buyer_email = r.buyer_email.charAt(0) + '***' + r.buyer_email.substring(at);
        }
      });
      return res.json({ ok: true, reviews });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // POST /api/product-reviews/:id — only paid buyers, token-gated.
  // body: { token, rating (1-5), text }
  router.post('/api/product-reviews/:id', (req, res) => {
    try {
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const productId = Number(req.params.id);
      const b = req.body || {};
      const rating = Math.min(5, Math.max(1, parseInt(b.rating, 10) || 0));
      const text = String(b.text || '').trim().slice(0, 2000);
      const token = String(b.token || '').trim();
      if (!rating) return res.status(400).json({ ok: false, reason: 'rating_1_to_5_required' });
      if (!token) return res.status(400).json({ ok: false, reason: 'token_required' });
      const purchase = rawDb.prepare(
        "SELECT id, product_id, buyer_email, buyer_user_id FROM product_purchases WHERE download_token = ? AND payment_status = 'paid' AND product_id = ?"
      ).get(token, productId);
      if (!purchase) return res.status(403).json({ ok: false, reason: 'not_a_buyer' });
      try {
        rawDb.prepare(
          "INSERT INTO product_reviews (product_id, purchase_id, buyer_user_id, buyer_email, rating, text) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(productId, purchase.id, purchase.buyer_user_id || null, purchase.buyer_email || null, rating, text);
      } catch (_) {
        return res.status(400).json({ ok: false, reason: 'already_reviewed' });
      }
      // Recalc avg + count
      const agg = rawDb.prepare(
        "SELECT AVG(rating) AS avg, COUNT(*) AS cnt FROM product_reviews WHERE product_id = ?"
      ).get(productId);
      rawDb.prepare("UPDATE user_products SET avg_rating = ?, reviews_count = ? WHERE id = ?")
        .run(agg.avg || 0, agg.cnt || 0, productId);
      return res.json({ ok: true, avg_rating: agg.avg, reviews_count: agg.cnt });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // Public product card (server-rendered HTML with OG meta)
  router.get('/p/:slugId', (req, res) => {
    try {
      const _tracker = require('./services/shop-tracker');
      const dbm = require('./planner/db/database');
      const rawDb = dbm.getDb();
      const sid = String(req.params.slugId || '');
      const m = sid.match(/-(\d+)$/);
      const id = m ? Number(m[1]) : Number(sid);
      if (!id) return res.status(404).type('html').send('<h1>404 Product not found</h1>');
      const p = rawDb.prepare("SELECT p.*, u.tg_first_name AS seller_name, u.tg_username AS seller_username FROM user_products p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.is_active = 1").get(id);
      if (!p) return res.status(404).type('html').send('<h1>404 Product not found</h1>');
      try { rawDb.prepare("UPDATE user_products SET view_count = COALESCE(view_count, 0) + 1 WHERE id = ?").run(id); } catch (_) {}
      try { _tracker.trackProductView(req, id, Number(req.query.ref) || null); } catch (_) {}
      let gallery = []; try { gallery = JSON.parse(p.gallery_json || '[]'); } catch (_) {}
      const heroImg = (gallery[0] || p.preview_image || p.og_image || '/cabinet/img/og-default.png');
      const ogImg = p.og_image || heroImg;
      const title = String(p.title || 'Product').replace(/[<>"]/g, '');
      const desc = String(p.description || '').replace(/[<>"]/g, '').slice(0, 200);
      const escAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const price = Number(p.price_usd || 0);
      const stars = '★★★★★'.slice(0, Math.round(p.avg_rating || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(p.avg_rating || 0));
      const html = '<!doctype html><html lang="ru"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>' + escAttr(title) + ' — Golden Connect Marketplace</title>' +
        '<meta name="description" content="' + escAttr(desc) + '">' +
        '<meta property="og:type" content="product">' +
        '<meta property="og:title" content="' + escAttr(title) + '">' +
        '<meta property="og:description" content="' + escAttr(desc) + '">' +
        '<meta property="og:image" content="' + escAttr(ogImg) + '">' +
        '<meta property="product:price:amount" content="' + price + '">' +
        '<meta property="product:price:currency" content="USD">' +
        '<meta name="twitter:card" content="summary_large_image">' +
        '<style>' +
          'body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#070b14;color:#e8edf5;line-height:1.5}' +
          '.hero{max-width:1100px;margin:0 auto;padding:24px 18px;display:grid;grid-template-columns:1fr 1fr;gap:32px}' +
          '@media(max-width:760px){.hero{grid-template-columns:1fr}}' +
          '.gal{background:rgba(13,17,36,.6);border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}' +
          '.gal img{width:100%;display:block;aspect-ratio:1/1;object-fit:cover}' +
          '.thumbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(70px,1fr));gap:8px;padding:10px}' +
          '.thumbs img{cursor:pointer;border-radius:6px;border:1px solid rgba(255,255,255,.08)}' +
          'h1{font-size:28px;margin:0 0 6px}' +
          '.price{font-size:36px;font-weight:800;color:#10b981;font-family:"Orbitron",monospace;margin:14px 0}' +
          '.rating{color:#fbbf24;margin-bottom:8px}' +
          '.rating .num{color:#9ca3af;font-size:13px;margin-left:6px}' +
          '.seller{color:#9ca3af;font-size:13px;margin-bottom:14px}' +
          '.desc{color:#cbd5e1;font-size:15px;white-space:pre-wrap;margin:14px 0;padding:14px;background:rgba(0,0,0,.25);border-radius:10px;border:1px solid rgba(255,255,255,.06)}' +
          '.btn{background:linear-gradient(135deg,#00D4FF,#B14AED);color:#fff;border:none;padding:14px 24px;border-radius:12px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;display:inline-block;width:100%;text-align:center;box-sizing:border-box}' +
          '.btn:hover{transform:translateY(-1px)}' +
          '.qrshort{display:flex;gap:14px;margin-top:18px;align-items:center;background:rgba(0,0,0,.25);padding:12px;border-radius:10px}' +
          '.qrshort img{width:88px;height:88px;background:#fff;border-radius:6px;padding:4px}' +
          '.short{font-family:monospace;color:#00D4FF;word-break:break-all;font-size:13px}' +
          '.cat{display:inline-block;background:rgba(0,212,255,.1);color:#00D4FF;padding:3px 10px;border-radius:6px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}' +
          '.video{margin-top:14px}' +
          '.video iframe,.video video{width:100%;aspect-ratio:16/9;border-radius:10px;border:0}' +
          'header{padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.4)}' +
          'header a{color:#00D4FF;text-decoration:none;font-weight:700}' +
          'footer{padding:30px 18px;text-align:center;color:#6b7280;font-size:12px}' +
        '</style>' +
      '</head><body>' +
      '<header><a href="/marketplace">← Golden Connect Marketplace</a></header>' +
      '<div class="hero">' +
        '<div>' +
          '<div class="gal"><img id="hero-img" src="' + escAttr(heroImg) + '" alt="' + escAttr(title) + '">' +
          (gallery.length > 1 ? '<div class="thumbs">' + gallery.map(function (g) { return '<img src="' + escAttr(g) + '" onclick="document.getElementById(\'hero-img\').src=this.src">'; }).join('') + '</div>' : '') +
          '</div>' +
          (p.video_url ? '<div class="video">' + (/youtu/.test(p.video_url) ? '<iframe src="' + escAttr(p.video_url.replace('watch?v=', 'embed/')) + '" allowfullscreen></iframe>' : '<video src="' + escAttr(p.video_url) + '" controls></video>') + '</div>' : '') +
        '</div>' +
        '<div>' +
          (p.category ? '<div class="cat">' + escHtml(p.category) + '</div>' : '') +
          '<h1>' + escHtml(title) + '</h1>' +
          (p.reviews_count ? '<div class="rating">' + stars + '<span class="num">' + (p.avg_rating || 0).toFixed(1) + ' · ' + p.reviews_count + ' отзывов</span></div>' : '') +
          '<div class="seller">от <strong>' + escHtml(p.seller_name || ('Продавец #' + p.user_id)) + '</strong>' + (p.seller_username ? ' · @' + escHtml(p.seller_username) : '') + '</div>' +
          '<div class="price">$' + price.toFixed(2) + '</div>' +
          '<a class="btn" href="/cabinet/api/products/' + id + '/buy?ref=' + encodeURIComponent(req.query.ref || '') + '">🛒 Купить — $' + price.toFixed(2) + '</a>' +
          (p.seller_pct !== null && p.seller_pct !== undefined && p.seller_pct < 0.70 ? '<div style="margin-top:10px;padding:10px 12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;font-size:12px;color:#10b981">🤝 Этот продавец отдаёт <strong>' + Math.round((1 - p.seller_pct) * 100) + '%</strong> выручки в сеть (10% проекту · 7.5% линейка · 7.5% матрица · 5% пул)</div>' : '') +
          (p.description ? '<div class="desc">' + escHtml(p.description) + '</div>' : '') +
          (p.short_url || p.qr_url ? '<div class="qrshort">' +
            (p.qr_url ? '<img src="' + escAttr(p.qr_url) + '" alt="QR">' : '') +
            '<div><div style="font-size:11px;color:#9ca3af;margin-bottom:4px">Поделиться:</div>' +
            (p.short_url ? '<div class="short">' + escHtml(p.short_url) + '</div>' : '') +
            '</div>' +
          '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div style="max-width:1100px;margin:30px auto;padding:0 18px">' +
        '<h2 style="color:#fff;margin:0 0 14px;font-size:22px">⭐ Отзывы (' + (p.reviews_count || 0) + ')</h2>' +
        '<div id="reviews-list" style="display:grid;gap:10px;margin-bottom:14px"><div style="color:#9ca3af;font-size:13px">Загружаем отзывы...</div></div>' +
        '<div id="review-form-wrap" style="display:none;background:rgba(13,17,36,.6);border:1px solid rgba(0,212,255,.25);border-radius:12px;padding:18px">' +
          '<h3 style="margin:0 0 10px;color:#fff;font-size:16px">📝 Оставить отзыв</h3>' +
          '<div style="font-size:13px;color:#9ca3af;margin-bottom:10px">Только покупатели могут оставлять отзывы. Один отзыв на каждую покупку.</div>' +
          '<div id="r-stars" style="display:flex;gap:6px;margin-bottom:10px"></div>' +
          '<textarea id="r-text" placeholder="Расскажи о впечатлениях..." rows="4" style="width:100%;background:#0a0e16;color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:10px;font-size:14px;font-family:inherit;box-sizing:border-box;margin-bottom:10px"></textarea>' +
          '<button type="button" onclick="window._submitReview()" style="background:linear-gradient(135deg,#00D4FF,#B14AED);color:#fff;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;width:100%">Отправить отзыв</button>' +
          '<div id="review-status" style="font-size:13px;margin-top:10px"></div>' +
        '</div>' +
        '<script src="/cabinet/js/product-reviews.js?pid=' + id + '"></script>' +
      '</div>' +
      '<footer>Golden Connect Marketplace · <a href="https://goldenConnect.to" style="color:#9ca3af">goldenConnect.to</a></footer>' +
      '</body></html>';
      res.type('html').send(html);
    } catch (e) {
      res.status(500).type('html').send('<h1>500 ' + e.message + '</h1>');
    }
  });

  // ── Admin: marketing activation (proxies to goldenConnect-api) ─────────
  function _isCabinetAdmin(req) {
    const u = req.webUser || {};
    const adminEmails = ['volga9000@gmail.com'];
    const adminTgIds = ['424077439', '1361064246', '248745860'];
    const subAdminTgIds = ['374190317'];
    const allowedTgIds = adminTgIds.concat(subAdminTgIds);
    if (u.email && adminEmails.includes(String(u.email).toLowerCase())) return 'admin';
    if (u.telegramUserId && adminTgIds.includes(String(u.telegramUserId))) return 'admin';
    if (u.telegramUserId && subAdminTgIds.includes(String(u.telegramUserId))) return 'subadmin';
    return null;
  }
  async function _adminApiProxy(method, path, body) {
    const apiBase = (process.env.GOLDEN_CONNECT_API_URL || 'http://goldenConnect-api.goldenConnect.svc.cluster.local').replace(/\/$/, '');
    const adminTgId = '424077439'; // hard-coded primary admin tg_id, since cabinet→api needs ANY admin tg_id
    return new Promise((resolve) => {
      const url = new URL(apiBase + path);
      const data = body ? JSON.stringify(body) : '';
      const lib = url.protocol === 'https:' ? require('https') : require('http');
      const req = lib.request({
        method, hostname: url.hostname, port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'X-Admin-Tg-Id': adminTgId },
        timeout: 30000,
      }, (res) => {
        let buf = ''; res.on('data', (c) => buf += c);
        res.on('end', () => { let json = null; try { json = JSON.parse(buf); } catch (_) {} resolve({ status: res.statusCode, json, text: buf }); });
      });
      req.on('error', (e) => resolve({ status: 0, json: null, text: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, text: 'timeout' }); });
      if (data) req.write(data);
      req.end();
    });
  }
  router.get('/api/admin/marketing/status', requireAuth, async (req, res) => {
    const role = _isCabinetAdmin(req);
    if (!role) return res.status(403).json({ ok: false, reason: 'admin_only' });
    const r = await _adminApiProxy('GET', '/admin/marketing/status');
    if (r.status >= 200 && r.status < 300 && r.json) return res.json(r.json);
    return res.status(r.status || 502).json({ ok: false, reason: r.text || 'api_error' });
  });
  router.post('/api/admin/marketing/activate', requireAuth, async (req, res) => {
    if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false, reason: 'admin_only' });
    const r = await _adminApiProxy('POST', '/admin/marketing/activate', req.body || {});
    if (r.status >= 200 && r.status < 300 && r.json) return res.json(r.json);
    return res.status(r.status || 502).json({ ok: false, reason: r.text || 'api_error' });
  });
  router.post('/api/admin/marketing/deactivate', requireAuth, async (req, res) => {
    if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false, reason: 'admin_only' });
    const r = await _adminApiProxy('POST', '/admin/marketing/deactivate', {});
    if (r.status >= 200 && r.status < 300 && r.json) return res.json(r.json);
    return res.status(r.status || 502).json({ ok: false, reason: r.text || 'api_error' });
  });

  // ── Profile stats: refs / balances / claims / campaigns / completeness
  // Adaptive onboarding recommendations based on user profile
  router.get('/api/onboarding/recommend', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const profile = summarizeProfile(u);
      const paths = computeRecommendations(u);
      res.json({ ok: true, profile, paths });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

    router.get('/api/profile/stats', requireAuth, async (req, res) => {
    try {
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const u = req.webUser;
      // Bridge to planner user id
      let pu;
      if (u.telegramUserId) pu = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(Number(u.telegramUserId));
      if (!pu) pu = rawDb.prepare('SELECT * FROM users WHERE tg_id = ?').get(-Math.abs(u.id));

      // Referral counts (web side, by 10 levels)
      const refStats = (typeof storage.getReferralStats === 'function' ? storage.getReferralStats(u.id, 10) : null);

      // Phase H: balances from api Postgres (single source of truth)
      let bal = { gift_cents: 0, earned_cents: 0, karma: 100 };
      if (pu && pu.tg_id) {
        const _b = await getBalance({ tgId: pu.tg_id });
        bal = { gift_cents: _b.gift_cents, earned_cents: _b.working_cents, karma: _b.karma };
      }

      // Campaigns + claims (planner side)
      const camps = pu ? {
        total: rawDb.prepare('SELECT COUNT(*) AS n FROM ad_campaigns WHERE owner_user_id = ?').get(pu.id).n,
        active: rawDb.prepare("SELECT COUNT(*) AS n FROM ad_campaigns WHERE owner_user_id = ? AND status='active'").get(pu.id).n,
        done: rawDb.prepare("SELECT COUNT(*) AS n FROM ad_campaigns WHERE owner_user_id = ? AND status='done'").get(pu.id).n,
        totalSpent: rawDb.prepare("SELECT COALESCE(SUM(reward_cents*completed_count),0) AS s FROM ad_campaigns WHERE owner_user_id = ?").get(pu.id).s,
      } : { total: 0, active: 0, done: 0, totalSpent: 0 };

      const claims = pu ? {
        total: rawDb.prepare('SELECT COUNT(*) AS n FROM ad_task_claims WHERE executor_user_id = ?').get(pu.id).n,
        paid: rawDb.prepare("SELECT COUNT(*) AS n FROM ad_task_claims WHERE executor_user_id = ? AND status='paid'").get(pu.id).n,
        rejected: rawDb.prepare("SELECT COUNT(*) AS n FROM ad_task_claims WHERE executor_user_id = ? AND status IN ('rejected','expired')").get(pu.id).n,
        totalEarned: rawDb.prepare("SELECT COALESCE(SUM(reward_cents),0) AS s FROM ad_task_claims WHERE executor_user_id = ? AND status='paid'").get(pu.id).s,
      } : { total: 0, paid: 0, rejected: 0, totalEarned: 0 };

      // Profile completeness: count filled fields / total
      const pub = storage.getPublicWebUserById(u.id) || {};
      const prof = pub.profile || {};
      const onboarding = pub.onboarding || {};
      const fields = [
        pub.displayName, pub.email, pub.preferredContact, pub.userRole,
        pub.experienceLevel, pub.goalsSummary,
        prof.phone, prof.city, prof.country, prof.birthDate,
        onboarding.primaryGoal, (onboarding.focusAreas && onboarding.focusAreas.length ? '1' : ''),
        pub.goldenConnectRefLink,
        // Extended Golden Connect fields (stored in profile.notes JSON or separate)
        prof.niche, prof.trafficSource, prof.monthlyBudget, prof.workSchedule,
        prof.socialTelegram, prof.socialInstagram, prof.socialYoutube, prof.socialTiktok,
      ];
      const filled = fields.filter(Boolean).length;
      const total = fields.length;
      const completeness = Math.round((filled / total) * 100);

      res.json({
        ok: true,
        balances: bal,
        campaigns: camps,
        claims,
        referrals: refStats || { total: 0, byLevel: {} },
        completeness,
        completenessFilled: filled,
        completenessTotal: total,
        memberSince: pub.createdAt || null,
      });
    } catch (e) {
      console.error('[profile-stats]', e.message);
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/ai/messages', requireAuth, (req, res) => {
    return res.json({
      ok: true,
      items: storage.listAiMessages(req.webUser.id, 100),
      quickPrompts: siteContent.ai.quickPrompts,
    });
  });

  router.post('/api/ai/messages', requireAuth, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const content = String(body.content || '').trim();
      if (!content) {
        return res.status(400).json({ ok: false, reason: 'empty_message' });
      }

      const userMessage = storage.appendAiMessage(req.webUser.id, {
        role: 'user',
        content,
      });

      let assistantMessage;
      try {
        // Golden Connect unified brain: same system prompt as Telegram bot.
        const dbModule = require('./planner/db/database');
        const { getSystemPrompt } = require('./planner/bot/ai-assistant');
        const { hasGroqKeys: _h, requestGroqChatCompletion } = require('./utils/groq-rotator');
        if (!_h(config)) throw new Error('groq not configured');
        // Build a synthetic planner-user view for getSystemPrompt
        const u = req.webUser;
        const synthUser = {
          tg_first_name: u.displayName || (u.email || '').split('@')[0],
          secretary_name: 'Golden Connect AI',
          secretary_style: 'business',
          user_notes: '',
          timezone: 'Europe/Moscow',
        };
        const sysPrompt = getSystemPrompt(synthUser);
        // Pull last 8 web AI messages for context
        const history = storage.listAiMessages(u.id, 8) || [];
        const messages = [
          { role: 'system', content: sysPrompt },
          ...history.filter((m) => m.role === 'user' || m.role === 'assistant')
            .slice(-7).map((m) => ({ role: m.role, content: String(m.content || '').slice(0, 2000) })),
          { role: 'user', content: String(content).slice(0, 4000) },
        ];
        const resp = await requestGroqChatCompletion(messages, { groqKeys: config, model: 'llama-3.3-70b-versatile', maxTokens: 800, temperature: 0.7, timeoutMs: 30000 });
        const aiText = (resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || '';
        assistantMessage = storage.appendAiMessage(u.id, { role: 'assistant', content: aiText || 'AI не дал ответа. Попробуй ещё раз.' });
      } catch (eAi) {
        console.error('[ai-web]', eAi.message);
        assistantMessage = storage.appendAiMessage(req.webUser.id, buildAiResponse(content, req.webUser));
      }

      return res.status(201).json({
        ok: true,
        userMessage,
        assistantMessage,
        items: storage.listAiMessages(req.webUser.id, 100),
      });
    } catch {
      return res.status(500).json({ ok: false, reason: 'ai_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // QUEST ROUTES
  // ─────────────────────────────────────────────
  const { QUESTS, CHAPTERS, getDailyQuests } = require('./quests-data');

  router.get('/api/quests', requireAuth, (req, res) => {
    try {
      const { completedIds, totalXp, loginStreak } = storage.getQuestStats(req.webUser.id);
      const progress = storage.getQuestProgress(req.webUser.id);

      const chaptersWithQuests = CHAPTERS.map((ch, idx) => {
        const quests = QUESTS.filter((q) => q.chapter === ch.id).map((q) => ({
          ...q,
          completed: completedIds.includes(q.id),
          completedAt: progress[q.id] ? progress[q.id].completedAt : null,
          earnedXp: progress[q.id] ? progress[q.id].xp : 0,
        }));
        const completedCount = quests.filter((q) => q.completed).length;
        const unlocked = idx === 0 || completedIds.length >= (ch.unlockAt || 0);
        const locked = !unlocked;
        return {
          ...ch,
          quests,
          completed: completedCount,
          total: quests.length,
          completedCount,
          totalCount: quests.length,
          progressPct: quests.length ? Math.round((completedCount / quests.length) * 100) : 0,
          unlocked,
          locked,
          unlockRequirement: ch.unlockAt || 0,
        };
      });

      const dailyQuests = getDailyQuests().map((q) => ({
        ...q,
        completed: completedIds.includes(q.id),
      }));

      return res.json({
        ok: true,
        totalXp,
        loginStreak,
        chapters: chaptersWithQuests,
        dailyQuests,
        completedCount: completedIds.length,
        totalCount: QUESTS.length,
      });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'quests_failed' });
    }
  });

  router.post('/api/quests/:questId/complete', requireAuth, (req, res) => {
    try {
      const questId = String(req.params.questId || '').trim();
      const quest = QUESTS.find((q) => q.id === questId);
      if (!quest) return res.status(404).json({ ok: false, reason: 'quest_not_found' });
      if (quest.type !== 'manual') return res.status(400).json({ ok: false, reason: 'not_manual' });

      // Проверить — already completed once-quest
      if (quest.repeatType === 'once') {
        const { completedIds } = storage.getQuestStats(req.webUser.id);
        if (completedIds.includes(questId)) {
          return res.status(400).json({ ok: false, reason: 'already_completed' });
        }
      }

      const record = storage.completeQuest(req.webUser.id, questId, quest.xp);

      // Проверить разблокировку следующей главы
      const { completedIds } = storage.getQuestStats(req.webUser.id);
      CHAPTERS.forEach((ch) => {
        if (ch.id > 1 && isChapterUnlocked(ch.id, completedIds)) {
          const wasUnlocked = isChapterUnlocked(ch.id, completedIds.filter((id) => id !== questId));
          if (!wasUnlocked) {
            const state = storage.getQuestProgress(req.webUser.id); // side-effect: just to get state context
            // Push chapter unlock notification via storage helper
            storage.pushQuestChapterNotification && storage.pushQuestChapterNotification._raw
              ? null
              : null; // notification already pushed in completeQuest flow
          }
        }
      });

      return res.json({ ok: true, record, questId, xp: quest.xp, xpEarned: quest.xp, message: `+${quest.xp} XP` });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'complete_failed' });
    }
  });

  // Trigger auto quest from action (copy link, shortlink, etc.)
  router.post('/api/quests/trigger', requireAuth, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const trigger = String(body.trigger || '').trim();
      if (!trigger) return res.status(400).json({ ok: false, reason: 'no_trigger' });

      const triggered = QUESTS.filter((q) => q.type === 'auto' && q.trigger === trigger && !q.triggerValue);
      const completed = [];
      triggered.forEach((q) => {
        const rec = storage.completeQuest(req.webUser.id, q.id, q.xp);
        if (rec) completed.push({ questId: q.id, xp: q.xp });
      });

      return res.json({ ok: true, completed });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'trigger_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // EVENTS ROUTES (конференции / эфиры)
  // ─────────────────────────────────────────────

  // Public — ближайший эфир
  router.get('/api/events/next', (req, res) => {
    try {
      const refCode = String((req.query && req.query.ref) || '').trim();
      const ev = storage.getNextUpcomingEvent();
      return res.json({ ok: true, event: publicEventShape(ev, { refCode }) });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'next_event_failed' });
    }
  });

  // Public — список предстоящих
  router.get('/api/events/upcoming', (req, res) => {
    try {
      const limit = parseLimit(req.query && req.query.limit, 10, 50);
      const refCode = String((req.query && req.query.ref) || '').trim();
      const items = storage.listUpcomingEvents(limit).map((ev) => publicEventShape(ev, { refCode }));
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'upcoming_events_failed' });
    }
  });

  // Public — прошедшие с видеозаписями
  router.get('/api/events/past', (req, res) => {
    try {
      const limit = parseLimit(req.query && req.query.limit, 20, 100);
      const refCode = String((req.query && req.query.ref) || '').trim();
      const items = storage.listPastEvents(limit).map((ev) => publicEventShape(ev, { refCode }));
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'past_events_failed' });
    }
  });

  // Auth — список для кабинета (с флагом subscribed)
  router.get('/api/events', requireAuth, (req, res) => {
    try {
      const upcoming = req.query.upcoming === '1' || req.query.upcoming === 'true';
      const events = storage.listEvents({ upcoming });
      const result = events.map((ev) => ({
        ...ev,
        subscribed: storage.isSubscribedToEvent(req.webUser.id, ev.id),
      }));
      return res.json({ ok: true, events: result });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'events_failed' });
    }
  });

  // Admin — полный список (включая неопубликованные/отменённые)
  router.get('/api/admin/events', requireAdmin, (req, res) => {
    try {
      const events = storage.listEvents({
        upcoming: false,
        includeCanceled: true,
        includeUnpublished: true,
      });
      return res.json({ ok: true, events });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'admin_events_failed' });
    }
  });

  // Admin — загрузка обложки эфира.
  // Принимает бинарные данные (express.raw) с заголовками:
  //   Content-Type: image/jpeg | image/png | image/webp | image/gif
  //   X-Filename: original_name.jpg (для извлечения расширения)
  // Возвращает { ok, url: '/media/events/<file>' }
  const coverUploadRaw = express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    limit: '8mb',
  });
  router.post('/api/admin/events/upload-cover', requireAdmin, coverUploadRaw, (req, res) => {
    try {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || buf.length === 0) {
        console.warn('[cover_upload] empty body — content-type:', req.headers['content-type']);
        return res.status(400).json({ ok: false, reason: 'empty_body' });
      }
      const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      const extMap = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/gif': '.gif',
      };
      const ext = extMap[contentType] || '';
      if (!ext) {
        return res.status(415).json({ ok: false, reason: 'unsupported_type' });
      }
      // X-Filename header is URI-encoded by client
      let rawName = String(req.headers['x-filename'] || '').trim();
      try { rawName = decodeURIComponent(rawName); } catch (_) {}
      rawName = rawName.toLowerCase();
      const safeBase = rawName
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'cover';
      const stamp = Date.now();
      const rand = crypto.randomBytes(3).toString('hex');
      const filename = `event-${stamp}-${rand}-${safeBase}${ext}`;
      const dir = path.join(__dirname, '..', 'public', 'site', 'media', 'events');
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {
        if (!e || e.code !== 'EEXIST') throw e;
      }
      const full = path.join(dir, filename);
      fs.writeFileSync(full, buf);
      let stat; try { stat = fs.statSync(full); } catch (_) { stat = null; }
      if (!stat || stat.size !== buf.length) {
        console.error('[cover_upload] post-write verify failed', { full, expected: buf.length, got: stat && stat.size });
        return res.status(500).json({ ok: false, reason: 'write_verify_failed', dir });
      }
      const url = `/media/events/${filename}`;
      console.log('[cover_upload] ok', { filename, size: buf.length });
      return res.status(201).json({ ok: true, url, filename, size: buf.length });
    } catch (e) {
      const code = e && e.code;
      const reason = code === 'EACCES' || code === 'EROFS' ? 'filesystem_readonly'
        : code === 'ENOSPC' ? 'disk_full' : 'upload_failed';
      console.error('[cover_upload_failed]', reason, code || '', e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, reason, code });
    }
  });

  // Admin — создать
  router.post('/api/admin/events/ai-draft', requireAdmin, async (req, res) => {
    try {
      if (!hasGroqKeys(config)) {
        return res.status(503).json({ ok: false, reason: 'ai_unavailable' });
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const response = await requestGroqChatCompletion(buildAdminEventAiMessages(body), {
        groqKeys: config,
        model: 'llama-3.3-70b-versatile',
        temperature: 0.55,
        maxTokens: 1400,
        timeoutMs: 30000,
      });
      const content = String(response?.choices?.[0]?.message?.content || '').trim();
      const parsed = parseModelJson(content);
      if (!parsed) {
        return res.status(502).json({ ok: false, reason: 'ai_bad_payload' });
      }
      return res.json({ ok: true, draft: normalizeAiDraft(parsed) });
    } catch (e) {
      console.error('[admin_event_ai_failed]', e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, reason: 'ai_failed' });
    }
  });

  router.post('/api/admin/events', requireAdmin, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!body.title) return res.status(400).json({ ok: false, reason: 'no_title' });
      if (!body.startsAt) return res.status(400).json({ ok: false, reason: 'no_starts_at' });
      const event = storage.upsertEvent({
        ...body,
        id: undefined,
        createdBy: req.webUser && req.webUser.id,
        updatedBy: req.webUser && req.webUser.id,
      });
      return res.status(201).json({ ok: true, event });
    } catch (e) {
      console.error('[admin_event_create_failed]', e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, reason: 'event_create_failed' });
    }
  });

  // Admin — обновить
  router.put('/api/admin/events/:eventId', requireAdmin, (req, res) => {
    try {
      const eventId = String(req.params.eventId || '');
      const existing = storage.getEvent(eventId);
      if (!existing) return res.status(404).json({ ok: false, reason: 'not_found' });
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const event = storage.upsertEvent({
        ...body,
        id: eventId,
        updatedBy: req.webUser && req.webUser.id,
      });
      return res.json({ ok: true, event });
    } catch (e) {
      console.error('[admin_event_update_failed]', e && e.message ? e.message : e);
      return res.status(500).json({ ok: false, reason: 'event_update_failed' });
    }
  });

  // Admin — soft delete (canceled=true)
  router.delete('/api/admin/events/:eventId', requireAdmin, (req, res) => {
    try {
      const eventId = String(req.params.eventId || '');
      const hard = String((req.query && req.query.hard) || '') === '1';
      const ok = hard ? storage.hardDeleteEvent(eventId) : storage.deleteEvent(eventId);
      if (!ok) return res.status(404).json({ ok: false, reason: 'not_found' });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'event_delete_failed' });
    }
  });

  // POST /api/events — legacy, теперь требует админа (совместимость с кабинетом)
  router.post('/api/events', requireAdmin, (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (!body.title) return res.status(400).json({ ok: false, reason: 'no_title' });
      const event = storage.upsertEvent({
        ...body,
        createdBy: req.webUser && req.webUser.id,
        updatedBy: req.webUser && req.webUser.id,
      });
      return res.status(201).json({ ok: true, event });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'event_create_failed' });
    }
  });

  router.post('/api/events/:eventId/subscribe', requireAuth, (req, res) => {
    try {
      const eventId = String(req.params.eventId || '');
      const ev = storage.getEvent(eventId);
      if (!ev) return res.status(404).json({ ok: false, reason: 'event_not_found' });
      const sub = storage.subscribeToEvent(req.webUser.id, eventId);
      return res.json({ ok: true, subscription: sub });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'subscribe_failed' });
    }
  });

  router.delete('/api/events/:eventId/subscribe', requireAuth, (req, res) => {
    try {
      const eventId = String(req.params.eventId || '');
      storage.unsubscribeFromEvent(req.webUser.id, eventId);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'unsubscribe_failed' });
    }
  });

  router.post('/api/events/:eventId/attend', requireAuth, (req, res) => {
    try {
      const eventId = String(req.params.eventId || '');
      const total = storage.markEventAttended(req.webUser.id, eventId);

      // Auto-complete event quests
      const { completedIds } = storage.getQuestStats(req.webUser.id);
      const eventQuests = QUESTS.filter((q) => q.trigger === 'event_attended');
      eventQuests.forEach((q) => {
        if (!completedIds.includes(q.id) && total >= (q.triggerValue || 1)) {
          storage.completeQuest(req.webUser.id, q.id, q.xp);
        }
      });

      return res.json({ ok: true, totalAttended: total });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'attend_failed' });
    }
  });

  router.get('/api/events/my', requireAuth, (req, res) => {
    try {
      const subs = storage.listUserEventSubscriptions(req.webUser.id);
      return res.json({ ok: true, events: subs });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'my_events_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // WEB PUSH NOTIFICATIONS
  // ─────────────────────────────────────────────

  const webPushModule = (() => {
    try { return require('./web-push'); } catch (e) { return null; }
  })();
  if (webPushModule) webPushModule.initVapid(config);

  router.get('/api/push/vapid-key', (req, res) => {
    const key = config.vapidPublicKey || process.env.VAPID_PUBLIC_KEY || '';
    if (!key) return res.status(503).json({ ok: false, reason: 'not_configured' });
    return res.json({ ok: true, key });
  });

  router.post('/api/push/subscribe', requireAuth, (req, res) => {
    try {
      const sub = req.body && req.body.subscription;
      if (!sub || !sub.endpoint) return res.status(400).json({ ok: false, reason: 'no_subscription' });
      if (webPushModule) {
        webPushModule.saveSubscription(storage, req.webUser.id, sub);
      }
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'subscribe_failed' });
    }
  });

  router.post('/api/push/unsubscribe', requireAuth, (req, res) => {
    try {
      const endpoint = req.body && req.body.endpoint;
      if (endpoint && webPushModule) {
        webPushModule.removeSubscription(storage, endpoint);
      }
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'unsubscribe_failed' });
    }
  });

  // Internal: send push to a specific user (called by roboai-engine CrmInboundCron).
  // Auth via x-internal-secret header (INTERNAL_API_SECRET env).
  router.post('/api/push/internal/notify-user', async (req, res) => {
    try {
      const got = String(req.headers['x-internal-secret'] || '');
      const expected = String(process.env.INTERNAL_API_SECRET || '');
      if (!expected || got !== expected) return res.status(401).json({ ok: false, reason: 'unauthorized' });
      if (!webPushModule) return res.status(503).json({ ok: false, reason: 'push_not_available' });
      const body = req.body || {};
      const userId = Number(body.user_id || 0);
      if (!userId) return res.status(400).json({ ok: false, reason: 'user_id required' });
      const payload = {
        title: body.title || 'Golden Connect CRM',
        body: body.body || '',
        url: body.url || '/cabinet/crm-app.html',
        icon: body.icon || '/cabinet/favicon-32x32.png',
        tag: body.tag || 'crm-inbound',
        requireInteraction: !!body.requireInteraction,
      };
      const sent = await webPushModule.sendPushToUser(storage, userId, payload);
      return res.json({ ok: true, sent });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'push_internal_failed', detail: String(e && e.message) });
    }
  });

  // Admin: send push to all (broadcast)
  router.post('/api/push/broadcast', requireAdmin, async (req, res) => {
    try {
      if (!webPushModule) return res.status(503).json({ ok: false, reason: 'push_not_available' });
      const body = req.body || {};
      const payload = {
        title: body.title || 'Golden Connect',
        body: body.body || 'Новое уведомление',
        url: body.url || '/cabinet',
        icon: body.icon || '/favicon.ico',
      };
      const sent = await webPushModule.sendPushBroadcast(payload);
      return res.json({ ok: true, sent });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'broadcast_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // TELEGRAM LINK (site → bot)
  // ─────────────────────────────────────────────

  router.post('/api/profile/link-telegram', requireAuth, (req, res) => {
    try {
      const result = storage.createTelegramLinkToken(req.webUser.id);
      if (!result) return res.status(500).json({ ok: false, reason: 'token_failed' });
      const botUsername = String(config.botUsername || 'GoldenConnect_bizbot').trim();
      const botLink = `https://t.me/${botUsername}?start=link_${result.token}`;
      return res.json({ ok: true, token: result.token, botLink, expiresAt: result.expiresAt });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'link_failed' });
    }
  });

  router.get('/api/profile/link-telegram/status', requireAuth, (req, res) => {
    try {
      const status = storage.getTelegramLinkStatus(req.webUser.id);
      return res.json({ ok: true, ...status });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'status_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // TEAM / CRM API (current user = inviter)
  // ─────────────────────────────────────────────

  router.get('/api/team/stats', requireAuth, (req, res) => {
    try {
      const stats = storage.getTeamStats(req.webUser.id);
      const funnel = storage.getTeamFunnel(req.webUser.id);
      const { all: badges } = storage.syncBadges(req.webUser.id);
      return res.json({ ok: true, stats, funnel, badges });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_stats_failed' });
    }
  });

  router.get('/api/team/referrals', requireAuth, async (req, res) => {
    try {
      // 1) Local cabinet referrals (state.json — people who signed up via cabinet)
      const localRefs = storage.listInviteeReferrals(req.webUser.id);
      const localEnriched = localRefs.map((r) => ({
        id: r.id,
        source: 'cabinet',
        displayName: r.displayName,
        email: r.email,
        telegramUserId: r.telegramUserId,
        telegramUsername: r.telegramUsername,
        referralStage: r.referralStage || storage.computeReferralStage(r),
        lastActivityAt: r.lastActivityAt,
        lastAction: r.lastAction,
        createdAt: r.createdAt,
        onboardingCompletedAt: r.onboardingCompletedAt,
        goldenConnectRefLink: r.goldenConnectRefLink,
        note: (r.inviterNotes && r.inviterNotes[String(req.webUser.id)]) || '',
        snoozedUntil: (r.inviterSnoozeUntil && r.inviterSnoozeUntil[String(req.webUser.id)]) || null,
        contactedAt: (r.inviterContactedAt && r.inviterContactedAt[String(req.webUser.id)]) || null,
      }));

      // 2) api/Postgres referrals (people who joined via Telegram bot)
      let apiRefs = [];
      try {
        const u = req.webUser;
        const tgId = u.telegramUserId || u.telegram_user_id;
        const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
        if (email) {
          const apiRes = await callGoldenConnectApi('/internal/team/by-email/referrals', { email });
          if (apiRes && Array.isArray(apiRes.rows)) {
            apiRefs = apiRes.rows.map((r) => ({
              id: r.invitee_id,
              source: 'api',
              displayName: r.first_name || (r.tg_username ? '@' + r.tg_username : 'User #' + r.invitee_id),
              email: null,
              telegramUserId: null,
              telegramUsername: r.tg_username,
              referralStage: r.stage || 'joined',
              lastActivityAt: r.stage_changed_at,
              lastAction: r.source ? ('source: ' + r.source) : '',
              createdAt: r.created_at,
              onboardingCompletedAt: null,
              goldenConnectRefLink: null,
              note: '',
              snoozedUntil: null,
              contactedAt: r.last_contact_at,
            }));
          }
        }
      } catch (e) {
        console.warn('[team/referrals] api fetch failed:', e.message);
      }

      // Merge: dedupe by telegramUsername or invitee_id
      const seen = new Set();
      const merged = [];
      for (const r of [...localEnriched, ...apiRefs]) {
        const key = r.telegramUsername ? '@' + r.telegramUsername.toLowerCase() : 'id_' + r.id;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(r);
      }
      // Sort: most recent first
      merged.sort((a, b) => {
        const av = a.lastActivityAt || a.createdAt || '';
        const bv = b.lastActivityAt || b.createdAt || '';
        return String(bv).localeCompare(String(av));
      });

      return res.json({ ok: true, items: merged });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_refs_failed', error: e.message });
    }
  });

  router.get('/api/team/referrals/:refId', requireAuth, (req, res) => {
    try {
      const refId = Number(req.params.refId);
      const ref = storage.getReferralCard(req.webUser.id, refId);
      if (!ref) return res.status(404).json({ ok: false, reason: 'not_found' });
      return res.json({ ok: true, referral: ref });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_card_failed' });
    }
  });

  router.post('/api/team/referrals/:refId/note', requireAuth, (req, res) => {
    try {
      const refId = Number(req.params.refId);
      const note = String((req.body && req.body.note) || '');
      const ok = storage.setInviterNote(req.webUser.id, refId, note);
      if (!ok) return res.status(404).json({ ok: false, reason: 'not_found' });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_note_failed' });
    }
  });

  router.post('/api/team/referrals/:refId/snooze', requireAuth, (req, res) => {
    try {
      const refId = Number(req.params.refId);
      const days = Math.max(1, Math.min(60, Number((req.body && req.body.days) || 7)));
      const until = new Date(Date.now() + days * 86400000).toISOString();
      const ok = storage.setInviterSnooze(req.webUser.id, refId, until);
      if (!ok) return res.status(404).json({ ok: false, reason: 'not_found' });
      return res.json({ ok: true, until });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_snooze_failed' });
    }
  });

  router.post('/api/team/referrals/:refId/contacted', requireAuth, (req, res) => {
    try {
      const refId = Number(req.params.refId);
      const ok = storage.markInviterContacted(req.webUser.id, refId);
      if (!ok) return res.status(404).json({ ok: false, reason: 'not_found' });
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_contacted_failed' });
    }
  });

  router.get('/api/team/next-actions', requireAuth, (req, res) => {
    try {
      const actions = storage.getNextActions(req.webUser.id);
      return res.json({ ok: true, actions });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_next_failed' });
    }
  });

  router.get('/api/team/tip', requireAuth, async (req, res) => {
    try {
      const { generateTeamTip } = require('./xh/team-tips');
      const tip = await generateTeamTip(storage, req.webUser, config);
      return res.json({ ok: true, tip });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'team_tip_failed' });
    }
  });

  // ─────────────────────────────────────────────
  // HEALTH COURSE API
  // ─────────────────────────────────────────────

  function getPlannerUserByTg(req) {
    if (!req.webUser || !req.webUser.telegramUserId) return null;
    try {
      const db = require('./planner/db/database');
      return db.getUserByTgId ? db.getUserByTgId(req.webUser.telegramUserId) : null;
    } catch (e) { return null; }
  }

  router.get('/api/health/courses', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.json({ ok: true, courses: [], note: 'Привяжите Telegram чтобы вести курсы' });
      const db = require('./planner/db/database');
      const { getCourseProgress } = require('./xh/health');
      const courses = db.getDb().prepare(`
        SELECT * FROM health_courses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC
      `).all(pu.id);
      const enriched = courses.map((c) => ({
        ...c,
        progress: getCourseProgress(c.id),
        dayNum: Math.floor((Date.now() - Date.parse(c.start_date)) / 86400000) + 1,
      }));
      return res.json({ ok: true, courses: enriched });
    } catch (e) {
      console.error('[api_health_courses]', e && e.message);
      return res.status(500).json({ ok: false, reason: 'health_courses_failed' });
    }
  });

  router.get('/api/health/today', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.json({ ok: true, items: [] });
      const { getTodayLogEntries, generateTodayForUser } = require('./xh/health');
      generateTodayForUser(pu.id);
      const items = getTodayLogEntries(pu.id);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'health_today_failed' });
    }
  });

  router.get('/api/health/protocols', requireAuth, (req, res) => {
    try {
      const { listProtocols, getProduct } = require('./xh/health-protocols');
      const protocols = listProtocols().map((p) => ({
        ...p,
        productDetails: p.products.map((slug) => getProduct(slug)).filter(Boolean),
      }));
      return res.json({ ok: true, protocols });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'protocols_failed' });
    }
  });

  router.get('/api/health/products', requireAuth, (req, res) => {
    try {
      const { listProducts } = require('./xh/health-protocols');
      return res.json({ ok: true, products: listProducts() });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'products_failed' });
    }
  });

  router.post('/api/health/courses/:id/take', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.status(400).json({ ok: false, reason: 'no_planner_user' });
      const db = require('./planner/db/database');
      const logId = Number(req.params.id);
      db.getDb().prepare("UPDATE health_course_log SET status = 'taken', taken_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").run(logId, pu.id);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'take_failed' });
    }
  });

  router.post('/api/health/protocols/:id/start', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.status(400).json({ ok: false, reason: 'no_planner_user' });
      // Reuse health.js startProtocol via direct call
      const { getProtocol, getProduct } = require('./xh/health-protocols');
      const proto = getProtocol(req.params.id);
      if (!proto) return res.status(404).json({ ok: false, reason: 'not_found' });
      const db = require('./planner/db/database');
      const today = new Date().toISOString().slice(0, 10);
      const end = new Date(Date.now() + proto.duration * 86400000).toISOString().slice(0, 10);
      const created = [];
      for (const slug of proto.products) {
        const p = getProduct(slug);
        if (!p) continue;
        const r = db.getDb().prepare(`
          INSERT INTO health_courses (user_id, product_slug, product_name, product_emoji, goal, dose, schedule_json, start_date, end_date, duration_days, status, protocol_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `).run(pu.id, p.slug, p.name, p.emoji, proto.id, p.defaultDose, JSON.stringify(p.defaultSchedule), today, end, proto.duration, proto.id);
        created.push({ id: r.lastInsertRowid, name: p.name });
      }
      const { generateTodayForUser } = require('./xh/health');
      generateTodayForUser(pu.id);
      return res.json({ ok: true, created });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'protocol_start_failed' });
    }
  });

  router.post('/api/health/checkin', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.status(400).json({ ok: false, reason: 'no_planner_user' });
      const db = require('./planner/db/database');
      const body = req.body || {};
      const today = new Date().toISOString().slice(0, 10);
      const sleep = Math.max(0, Math.min(10, Number(body.sleep) || 0));
      const energy = Math.max(0, Math.min(10, Number(body.energy) || 0));
      const mood = Math.max(0, Math.min(10, Number(body.mood) || 0));
      const symptoms = String(body.symptoms || '').slice(0, 500);
      db.getDb().prepare(`
        INSERT INTO health_metrics (user_id, date, sleep, energy, mood, symptoms)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(pu.id, today, sleep || null, energy || null, mood || null, symptoms || null);
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'checkin_failed' });
    }
  });

  router.get('/api/health/metrics', requireAuth, (req, res) => {
    try {
      const pu = getPlannerUserByTg(req);
      if (!pu) return res.json({ ok: true, items: [] });
      const db = require('./planner/db/database');
      const items = db.getDb().prepare(`
        SELECT * FROM health_metrics WHERE user_id = ? ORDER BY date DESC LIMIT 30
      `).all(pu.id);
      return res.json({ ok: true, items });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'metrics_failed' });
    }
  });

  router.post('/api/health/symptoms', requireAuth, async (req, res) => {
    try {
      const { recommendProducts } = require('./xh/health-ai');
      const symptoms = String((req.body && req.body.symptoms) || '').trim();
      if (!symptoms) return res.status(400).json({ ok: false, reason: 'no_symptoms' });
      const advice = await recommendProducts(symptoms, config);
      return res.json({ ok: true, advice });
    } catch (e) {
      return res.status(500).json({ ok: false, reason: 'symptoms_failed' });
    }
  });


  // ───────── Payment bridge → goldenConnect-api (Hono) ─────────
  // The cabinet keeps users in its own SQLite. Payment infra (CryptoBot +
  // Platega + bookings ledger) lives in the legacy goldenConnect-api service;
  // this section proxies cabinet → /internal/pay/* on that service using
  // the shared INTERNAL_API_SECRET.
  const PAY_API_BASE = String(config.goldenConnectApiBaseUrl || '').replace(/\/+$/, '');
  const PAY_INTERNAL_SECRET = String(config.goldenConnectApiInternalSecret || '');

  async function callGoldenConnectApi(path, body) {
    // [callgoldenConnectapi-retry-2026-05-21] timeout + retry for transient ingress/rollout failures
    if (!PAY_INTERNAL_SECRET) {
      const err = new Error('pay_bridge_not_configured');
      err.status = 503;
      throw err;
    }
    const url = PAY_API_BASE + path;
    const isGet = !body;
    const maxTries = isGet ? 3 : 1; // never auto-retry writes on response errors
    let lastErr = null;
    for (let attempt = 1; attempt <= maxTries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      let res;
      try {
        res = await fetch(url, {
          method: body ? 'POST' : 'GET',
          signal: ctrl.signal,
          headers: {
            'Content-Type': 'application/json',
            'x-goldenConnect-secret': PAY_INTERNAL_SECRET,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (netErr) {
        clearTimeout(timer);
        lastErr = new Error('api_unreachable: ' + (netErr && (netErr.name || netErr.message)));
        lastErr.status = 502;
        if (attempt < maxTries) { await new Promise(r => setTimeout(r, 400 * attempt)); continue; }
        throw lastErr;
      }
      clearTimeout(timer);
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
      if (!res.ok) {
        // transient 5xx on a GET → retry; otherwise surface
        if (isGet && (res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxTries) {
          await new Promise(r => setTimeout(r, 400 * attempt));
          continue;
        }
        const err = new Error(data && data.error ? data.error : ('api_' + res.status));
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    }
    throw lastErr || new Error('api_failed');
  }

  // Award karma via api proxy (fire-and-forget).
  function awardKarmaGoldenConnect(req, kind, sourceId, memo) {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return;
      const tgId = u.telegramUserId || u.telegram_user_id;
      const email = u.email || (tgId ? 'tg' + tgId + '@goldenConnect.bot' : null);
      if (!email) return;
      callGoldenConnectApi('/internal/karma/award', {
        email: email, kind: kind,
        source_id: sourceId || null, memo: memo || null,
      }).catch(function () {});
    } catch (e) {}
  }

/**
 * Patch: append cabinet → api proxy routes for /api/finance/* and /api/notifications/*
 * Mounted in cabinet/src/web-routes.js right after callGoldenConnectApi definition.
 *
 * Each route resolves the cabinet user's email → api-side user_id, then
 * proxies through INTERNAL_API_SECRET to /internal/finance/* or /internal/notifications/*.
 */

  // ───────── GiftClub bridge → goldenConnect-api /internal/gift/* ───────────
  // Mirrors the finance bridge: cabinet session → email → goldenConnect-api with secret.
  // Read-only views over imported gift_* tables. See migration 0102.
  function _giftIdentity(req) {
    const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!u) return null;
    const tgId = u.telegramUserId || u.telegram_user_id;
    let email = String(u.email || '').trim().toLowerCase();
    return { email: email || null, tgId: tgId || null };
  }
  function _giftRegister(path) {
    router.get('/api/me/gift/' + path, requireAuth, async (req, res) => {
      try {
        const ident = _giftIdentity(req);
        if (!ident || (!ident.email && !ident.tgId)) return res.status(400).json({ ok: false, reason: 'no_identity' });
        const qs = new URLSearchParams();
        if (ident.email) qs.set('email', ident.email);
        if (ident.tgId) qs.set('tg_id', String(ident.tgId));
        ['level','account_id','parent_gift_id','search','page','sort','status'].forEach(function(k){
          if (req.query[k] !== undefined && req.query[k] !== '') qs.set(k, String(req.query[k]));
        });
        const data = await callGoldenConnectApi('/internal/gift/' + path + '?' + qs.toString());
        res.json(data);
      } catch (e) {
        // Gracefully degrade: if user has no gift link, return empty success
        if (e && (e.status === 404 || (e.data && e.data.error === 'not_linked'))) {
          return res.json({ ok: true, linked: false });
        }
        res.status((e && e.status) || 502).json({ ok: false, reason: (e && e.message) || 'gift_bridge_error' });
      }
    });
  }
  _giftRegister('overview');
  _giftRegister('balances');
  _giftRegister('statuses');
  _giftRegister('referrals/summary');
  _giftRegister('referrals');
  _giftRegister('accounts');
  // Partner program (team) — tree / levels / table
  _giftRegister('team/tree');
  _giftRegister('team/levels');
  _giftRegister('team/table');
  _giftRegister('withdrawals');
  _giftRegister('profile');

  // POST money-bridge: topup (working→Основной), transfer (Основной↔Текущий), withdraw (Текущий→заявка)
  function _giftPost(path) {
    router.post('/api/me/gift/' + path, requireAuth, async (req, res) => {
      try {
        const ident = _giftIdentity(req);
        if (!ident || (!ident.email && !ident.tgId)) return res.status(400).json({ ok: false, reason: 'no_identity' });
        const qs = new URLSearchParams();
        if (ident.email) qs.set('email', ident.email);
        if (ident.tgId) qs.set('tg_id', String(ident.tgId));
        const data = await callGoldenConnectApi('/internal/gift/' + path + '?' + qs.toString(), req.body || {});
        res.json(data);
      } catch (e) {
        res.status((e && e.status) || 502).json({ ok: false, reason: (e && (e.data && e.data.reason)) || (e && e.message) || 'gift_bridge_error' });
      }
    });
  }
  _giftPost('topup');
  _giftPost('transfer');
  _giftPost('withdraw');

  router.post('/api/me/gift/switch-account', requireAuth, async (req, res) => {
    try {
      const ident = _giftIdentity(req);
      if (!ident || (!ident.email && !ident.tgId)) return res.status(400).json({ ok: false, reason: 'no_identity' });
      const body = Object.assign({}, ident.email ? { email: ident.email } : {}, ident.tgId ? { tg_id: ident.tgId } : {}, req.body || {});
      const data = await callGoldenConnectApi('/internal/gift/switch-account', { method: 'POST', body });
      res.json(data);
    } catch (e) {
      res.status((e && e.status) || 502).json({ ok: false, reason: (e && e.message) || 'gift_switch_error' });
    }
  });

  // ───────── Finance bridge → goldenConnect-api /internal/finance/* ─────────

  // Helper: resolve cabinet session → api user identifier (email is canonical
  // bridge; api side does findOrCreateUserByEmail).
  function _financeBuildPayload(req, body) {
    const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!u) return null;
    const tgId = u.telegramUserId || u.telegram_user_id;
    let email = String(u.email || '').trim().toLowerCase();
    if (!email && tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
    if (!email) return null;
    return Object.assign({ email }, body || {});
  }

  router.get('/api/finance/balances', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const tgId = u.telegramUserId || u.telegram_user_id;
      let email = String(u.email || '').trim().toLowerCase();
      if (!email && tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      try {
        const data = await callGoldenConnectApi('/internal/finance/balances?email=' + encodeURIComponent(email));
        res.json(data);
      } catch (apiErr) {
        // 404 from api side = api-side user does not exist yet (cabinet email
        // user without TG link or pending tariff buy). Return empty zeros so
        // the UI renders gracefully — actions like topup/buy-tariff create
        // the api-side user lazily on first invocation.
        if (apiErr && (apiErr.status === 404 || (apiErr.data && apiErr.data.reason === 'user_not_found'))) {
          return res.json({
            ok: true,
            balances: {
              working: { micro: '0', usd: 0 },
              gift: { micro: '0', usd: 0 },
              subscription: { micro: '0', usd: 0, cap_micro: '45000000', cap_usd: 45, progress: 0 },
              karma: { points: '0' },
              total_available_micro: '0',
            },
            tariff: { code: 'free', expires_at: null, auto_renew: false },
            _bridge: 'pending_api_user',
          });
        }
        throw apiErr;
      }
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/finance/tariff-options', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      let email = String(u.email || '').trim().toLowerCase();
      const tgId = u.telegramUserId || u.telegram_user_id;
      if (!email && tgId) email = 'tg' + tgId + '@goldenConnect.bot';
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      try {
        const data = await callGoldenConnectApi('/internal/finance/tariff-options?email=' + encodeURIComponent(email));
        res.json(data);
      } catch (apiErr) {
        // [tariff-opts-404] cabinet user has no api account yet (email-only, no TG link).
        // Mirror /api/finance/balances behaviour: degrade gracefully so the UI doesn't
        // pop "api_404" toast — surface a structured response with an explanatory hint.
        if (apiErr && (apiErr.status === 404 || (apiErr.data && apiErr.data.reason === 'user_not_found'))) {
          return res.json({
            ok: true,
            options: [],
            user_state: 'no_api_account',
            hint: 'Привяжи Telegram через /start у @GoldenConnect_bizbot чтобы открыть кошелёк и тарифы.',
            _bridge: 'pending_api_user',
          });
        }
        throw apiErr;
      }
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/finance/buy-tariff', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {
        tariff: String((req.body && req.body.tariff) || '').toLowerCase(),
        source_policy: String((req.body && req.body.source_policy) || 'subscription_first'),
      });
      if (!payload) return res.status(401).json({ ok: false, reason: 'no_email' });
      const data = await callGoldenConnectApi('/internal/finance/buy-tariff', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message, details: e.data });
    }
  });

  router.post('/api/finance/upgrade-tariff', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {
        tariff: String((req.body && req.body.tariff) || '').toLowerCase(),
        source_policy: String((req.body && req.body.source_policy) || 'subscription_first'),
      });
      if (!payload) return res.status(401).json({ ok: false, reason: 'no_email' });
      const data = await callGoldenConnectApi('/internal/finance/upgrade-tariff', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message, details: e.data });
    }
  });

  router.post('/api/finance/transfer', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {
        from: String((req.body && req.body.from) || ''),
        to: String((req.body && req.body.to) || ''),
        amount_micro: Number((req.body && req.body.amount_micro) || 0),
      });
      if (!payload) return res.status(401).json({ ok: false });
      const data = await callGoldenConnectApi('/internal/finance/transfer', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/finance/topup', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const tgId = u.telegramUserId || u.telegram_user_id;
      let email = String(u.email || '').trim().toLowerCase();
      if (!email && tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const amountUsd = Number(body.amount_usd || 0);
      const method = String(body.method || 'cryptobot');
      if (!Number.isFinite(amountUsd) || amountUsd < 5) {
        return res.status(400).json({ ok: false, reason: 'amount_min_5' });
      }
      if (amountUsd > 5000) {
        return res.status(400).json({ ok: false, reason: 'amount_max_5000' });
      }
      const ALLOWED_METHODS = new Set([
        'cryptobot',
        'platega', 'platega_sbp', 'platega_card_rub',
        'platega_acquiring', 'platega_intl', 'platega_crypto',
      ]);
      if (!ALLOWED_METHODS.has(method)) {
        return res.status(400).json({ ok: false, reason: 'invalid_method' });
      }

      // Inviter ref code (so api can stamp invited_by on lazy-create).
      let inviterRefCode = null;
      try {
        const refByCabId = u.referredByUserId || u.referred_by_user_id;
        if (refByCabId && storage.findWebUserById) {
          const inv = storage.findWebUserById(refByCabId);
          if (inv && inv.referralCode) inviterRefCode = inv.referralCode;
        }
      } catch (e) { /* non-fatal */ }

      const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.displayName || u.name || null;
      const data = await callGoldenConnectApi('/internal/pay/create-topup-invoice', {
        email,
        amount_usd: amountUsd,
        method,
        display_name: displayName,
        ref_code: u.refCode || u.ref_code || null,
        inviter_ref_code: inviterRefCode,
      });
      res.json(data);
    } catch (e) {
      console.error('[finance/topup] bridge failed', e && e.message);
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/finance/withdraw', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {
        amount_micro: Number((req.body && req.body.amount_micro) || 0),
        method: String((req.body && req.body.method) || ''),
        address: String((req.body && req.body.address) || ''),
      });
      if (!payload) return res.status(401).json({ ok: false });
      const data = await callGoldenConnectApi('/internal/finance/withdraw', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/finance/transactions', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      let email = String(u.email || '').trim().toLowerCase();
      const tgId = u.telegramUserId || u.telegram_user_id;
      if (!email && tgId) email = 'tg' + tgId + '@goldenConnect.bot';
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const data = await callGoldenConnectApi('/internal/finance/transactions?email='
        + encodeURIComponent(email) + '&limit=' + limit);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/notifications', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      let email = String(u.email || '').trim().toLowerCase();
      const tgId = u.telegramUserId || u.telegram_user_id;
      if (!email && tgId) email = 'tg' + tgId + '@goldenConnect.bot';
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const unread = req.query.unread === '1' ? '&unread=1' : '';
      const data = await callGoldenConnectApi('/internal/notifications?email='
        + encodeURIComponent(email) + '&limit=' + limit + unread);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });


  router.get('/api/finance/test-placement', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const tgId = u.telegramUserId || u.telegram_user_id;
      let email = String(u.email || '').trim().toLowerCase();
      if (!email && tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
      if (!email) return res.status(400).json({ ok: false, reason: 'no_email' });
      const data = await callGoldenConnectApi('/internal/finance/test-placement?email=' + encodeURIComponent(email));
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/finance/karma', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      let email = String(u.email || '').trim().toLowerCase();
      const tgId = u.telegramUserId || u.telegram_user_id;
      if (!email && tgId) email = 'tg' + tgId + '@goldenConnect.bot';
      const data = await callGoldenConnectApi('/internal/finance/karma?email=' + encodeURIComponent(email));
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });
  router.get('/api/notifications/unread-count', requireAuth, async (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      let email = String(u.email || '').trim().toLowerCase();
      const tgId = u.telegramUserId || u.telegram_user_id;
      if (!email && tgId) email = 'tg' + tgId + '@goldenConnect.bot';
      const data = await callGoldenConnectApi('/internal/notifications/unread-count?email='
        + encodeURIComponent(email));
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {});
      if (!payload) return res.status(401).json({ ok: false });
      const data = await callGoldenConnectApi('/internal/notifications/'
        + encodeURIComponent(req.params.id) + '/read', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/notifications/read-all', requireAuth, async (req, res) => {
    try {
      const payload = _financeBuildPayload(req, {});
      if (!payload) return res.status(401).json({ ok: false });
      const data = await callGoldenConnectApi('/internal/notifications/read-all', payload);
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });


  // Static tariff list (matches what goldenConnect-api has active as of 2026-04).


/**
 * Cabinet → api admin proxy. Inserted into web-routes.js after finance proxy block.
 * Auth: requires session.user.email in ADMIN_EMAILS env (or users.is_admin=true via api).
 */

  // ───────── Admin bridge → goldenConnect-api /internal/admin/* ─────────

  function _adminCheckSession(req) {
    const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!u) return null;
    // Reuse existing cabinet admin check (contentAdminEmails set + id=1 fallback)
    return isContentAdmin(u) ? u : null;
  }

  router.get('/api/admin/stats', requireAuth, async (req, res) => {
    if (!_adminCheckSession(req)) return res.status(403).json({ ok: false, reason: 'not_admin' });
    try {
      const data = await callGoldenConnectApi('/internal/admin/stats');
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/admin/withdrawals', requireAuth, async (req, res) => {
    if (!_adminCheckSession(req)) return res.status(403).json({ ok: false });
    try {
      const status = String(req.query.status || 'pending');
      const data = await callGoldenConnectApi('/internal/admin/withdrawals?status=' + encodeURIComponent(status));
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/admin/withdrawals/:id/approve', requireAuth, async (req, res) => {
    if (!_adminCheckSession(req)) return res.status(403).json({ ok: false });
    try {
      const data = await callGoldenConnectApi('/internal/admin/withdrawals/'
        + encodeURIComponent(req.params.id) + '/approve', {});
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/admin/withdrawals/:id/reject', requireAuth, async (req, res) => {
    if (!_adminCheckSession(req)) return res.status(403).json({ ok: false });
    try {
      const data = await callGoldenConnectApi('/internal/admin/withdrawals/'
        + encodeURIComponent(req.params.id) + '/reject',
        { reason: String((req.body && req.body.reason) || '') });
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });

  router.post('/api/admin/matrix/launch', requireAuth, async (req, res) => {
    if (!_adminCheckSession(req)) return res.status(403).json({ ok: false });
    try {
      const data = await callGoldenConnectApi('/internal/admin/matrix/launch', { confirm: true });
      res.json(data);
    } catch (e) {
      res.status(e && e.status || 502).json({ ok: false, reason: e.message });
    }
  });


  // ───────── Meet bridge → alpha-planner conference rooms ─────────
  // Frontend `loadMeet()` posts to /cabinet/api/meet/create expecting
  // { ok, url } with the WebApp link. We create a planner conf room
  // (planner DB owns the rooms + signaling) and return the join URL.
  router.post('/api/meet/create', requireAuth, async (req, res) => {
    try {
      const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });

      const plannerDb = require('./planner/db/database');
      // Find or create a planner-side user row for this cabinet user.
      // The planner ensureUser expects a TG-shaped profile; for non-TG
      // users we fall back to a synthetic id derived from the cabinet uid.
      const tgId = Number(user.telegramUserId || user.telegram_user_id || 0)
        || (1_000_000_000 + Number(user.id));
      const profile = {
        id: tgId,
        first_name: user.displayName || user.firstName || ('User' + user.id),
        last_name: user.lastName || '',
        username: user.telegramUsername || null,
      };
      const plannerUser = plannerDb.ensureUser(profile);
      const name = String((req.body && req.body.name) || '').trim()
        || ('Звонок ' + new Date().toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }));
      const room = plannerDb.createConfRoom(name, plannerUser.id, null);

      const base = (config.publicBaseUrl || 'https://cabinet.goldenConnect.to').replace(/\/+$/, '');
      const url = base + '/meet?conf=' + room.id;
      return res.json({ ok: true, url, room_id: room.id, room_name: room.name });
    } catch (e) {
      console.error('[meet] create failed', e && e.message);
      return res.status(500).json({ ok: false, reason: 'meet_create_failed' });
    }
  });


  // ===== Chat rooms =====
  router.get('/api/chat/rooms', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const rooms = storage.listChatRooms(u.id);
      res.json({ ok: true, rooms });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.post('/api/chat/rooms', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const body = req.body || {};
      const name = (body.name || '').toString().trim();
      if (!name) return res.status(400).json({ ok: false, error: 'name_required' });
      const isPublic = !!body.isPublic;
      const room = storage.createChatRoom(u.id, name, isPublic);
      res.json({ ok: true, room });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.get('/api/chat/rooms/:id/messages', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const room = storage.getChatRoom(req.params.id);
      if (!room) return res.status(404).json({ ok: false, error: 'not_found' });
      const isMember = (room.members || []).indexOf(String(u.id)) >= 0;
      if (!isMember && !room.isPublic) return res.status(403).json({ ok: false, error: 'forbidden' });
      const messages = storage.getChatMessages(room.id, req.query.limit);
      res.json({ ok: true, messages });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.post('/api/chat/rooms/:id/messages', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const room = storage.getChatRoom(req.params.id);
      if (!room) return res.status(404).json({ ok: false, error: 'not_found' });
      const text = (req.body && req.body.text || '').toString().trim();
      if (!text) return res.status(400).json({ ok: false, error: 'empty' });
      const displayName = u.displayName || u.firstName || u.telegramUsername || ('User #' + u.id);
      const msg = storage.addChatMessage(room.id, u.id, text, displayName);
      if (!msg) return res.status(403).json({ ok: false, error: 'forbidden' });
      res.json({ ok: true, message: msg });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

  router.post('/api/chat/rooms/:id/join', requireAuth, (req, res) => {
    try {
      const u = req.webUser || (req.session && storage.findWebUserById(req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const room = storage.getChatRoom(req.params.id) || storage.getChatRoomByInvite(req.params.id);
      if (!room) return res.status(404).json({ ok: false, error: 'not_found' });
      const updated = storage.joinChatRoom(room.id, u.id);
      res.json({ ok: true, room: updated });
    } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
  });

    router.get('/api/meet/rooms', requireAuth, async (req, res) => {
    try {
      const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const plannerDb = require('./planner/db/database');
      const tgId = Number(user.telegramUserId || user.telegram_user_id || 0)
        || (1_000_000_000 + Number(user.id));
      const plannerUser = plannerDb.ensureUser({
        id: tgId,
        first_name: user.displayName || user.firstName || ('User' + user.id),
        username: user.telegramUsername || null,
      });
      const rooms = plannerDb.getUserConfRooms(plannerUser.id) || [];
      const base = (config.publicBaseUrl || 'https://cabinet.goldenConnect.to').replace(/\/+$/, '');
      const out = rooms.map((r) => ({
        id: r.id, name: r.name, member_count: r.member_count || 0,
        url: base + '/meet?conf=' + r.id,
      }));
      return res.json({ ok: true, rooms: out });
    } catch (e) {
      console.error('[meet] list failed', e && e.message);
      return res.status(500).json({ ok: false, reason: 'meet_list_failed' });
    }
  });


// ───────── Gift-balance top-up (CABINET-LOCAL CryptoBot invoice) ─────────
  // We create the invoice directly with CryptoBot Pay API so the payload tells
  // OUR cabinet webhook to credit users.gift_balance_cents on payment.
  // Min top-up: $5. Currency: USDT.
  router.post('/api/ads/gift-topup', requireAuth, async (req, res) => {
    try {
      const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const amount = Number((req.body && req.body.amount_usd) || 0);
      if (!Number.isFinite(amount) || amount < 5) {
        return res.status(400).json({ ok: false, reason: 'min_amount_5_usd' });
      }
      const cbToken = String(process.env.CRYPTOBOT_TOKEN || '').trim();
      if (!cbToken) return res.status(503).json({ ok: false, reason: 'cryptobot_not_configured' });

      const tgId = user.telegramUserId || ('cab' + user.id);
      const payload = JSON.stringify({ kind: 'gift_topup', user_id: user.id, tg_id: tgId, amount_usd: amount });
      const fetchOpts = {
        method: 'POST',
        headers: { 'Crypto-Pay-API-Token': cbToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset: 'USDT',
          amount: amount.toFixed(2),
          description: 'Golden Connect Ads Gift top-up',
          payload,
          paid_btn_name: 'openBot',
          paid_btn_url: 'https://t.me/GoldenConnect_bizbot',
          allow_anonymous: false,
        }),
      };
      const resp = await fetch('https://pay.crypt.bot/api/createInvoice', fetchOpts);
      const data = await resp.json();
      if (!data.ok) {
        console.error('[gift-topup] cryptobot error', data);
        return res.status(502).json({ ok: false, reason: 'cryptobot_error', details: data });
      }
      const inv = data.result;
      // Persist a pending row in cabinet so the webhook can reconcile.
      const db = require('../planner/db/database').getDb();
      db.exec(`CREATE TABLE IF NOT EXISTS gift_topups (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
        amount_usd REAL NOT NULL, invoice_id TEXT NOT NULL UNIQUE,
        pay_url TEXT, status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT (datetime('now')), paid_at TEXT, raw TEXT)`);
      db.prepare('INSERT INTO gift_topups (user_id, amount_usd, invoice_id, pay_url, raw) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, amount, String(inv.invoice_id), inv.pay_url, JSON.stringify(inv));
      return res.json({ ok: true, pay_url: inv.pay_url, invoice_id: inv.invoice_id, amount_usd: amount });
    } catch (e) {
      console.error('[gift-topup] failed', e && e.message);
      return res.status(500).json({ ok: false, reason: 'gift_topup_failed' });
    }
  });

  // CryptoBot webhook receiver — credits gift_balance on paid invoices.
  // Mount at root /cabinet/api/ads/gift-topup/webhook (no auth — verified by token).
  router.post('/api/ads/gift-topup/webhook', express.json(), async (req, res) => {
    try {
      const update = req.body || {};
      // CryptoBot signature verification
      const sig = String(req.headers['crypto-pay-api-signature'] || '');
      const cbToken = String(process.env.CRYPTOBOT_TOKEN || '').trim();
      if (cbToken && sig) {
        const secret = require('crypto').createHash('sha256').update(cbToken).digest();
        const computed = require('crypto').createHmac('sha256', secret).update(JSON.stringify(update)).digest('hex');
        if (computed !== sig) return res.status(401).json({ ok: false, reason: 'bad_signature' });
      }
      if (update.update_type !== 'invoice_paid' || !update.payload || !update.payload.payload) {
        return res.json({ ok: true, ignored: true });
      }
      let info;
      try { info = JSON.parse(update.payload.payload); } catch { return res.json({ ok: true, ignored: 'bad_payload' }); }
      if (info.kind !== 'gift_topup' || !info.user_id || !info.amount_usd) {
        return res.json({ ok: true, ignored: 'wrong_kind' });
      }
      const db = require('../planner/db/database').getDb();
      const invoiceId = String(update.payload.invoice_id);
      const row = db.prepare('SELECT * FROM gift_topups WHERE invoice_id = ?').get(invoiceId);
      if (!row || row.status === 'paid') return res.json({ ok: true, dedup: true });
      const cents = Math.round(Number(info.amount_usd) * 100);
      // Credit gift balance on planner.users (where ads-system reads from)
      const tgUser = db.prepare('SELECT u.id FROM users u JOIN web_user_link wul ON wul.tg_id = u.tg_id WHERE wul.web_user_id = ?').get(info.user_id);
      let plannerUserId = tgUser ? tgUser.id : null;
      if (!plannerUserId) {
        // Fallback: find by negative tg_id (synthetic for non-TG users)
        const synth = db.prepare('SELECT id FROM users WHERE tg_id = ?').get(-Math.abs(Number(info.user_id)));
        plannerUserId = synth ? synth.id : null;
      }
      if (plannerUserId) {
        (async () => { try { const r = db.prepare('SELECT tg_id FROM users WHERE id = ?').get(plannerUserId); if (r && r.tg_id) await creditApi({ tgId: r.tg_id, wallet: 'gift', cents, kind: 'topup_web', memo: 'web topup' }); } catch (e) { console.warn('[web topup] api credit:', e && e.message); } })();
        /* Phase G: planner cents write removed (api dual-write above is single source) */
      }
      db.prepare("UPDATE gift_topups SET status = 'paid', paid_at = datetime('now') WHERE id = ?").run(row.id);
      console.log('[gift-topup] credited $' + (cents/100) + ' to web_user', info.user_id, 'planner', plannerUserId);
      return res.json({ ok: true, credited_cents: cents });
    } catch (e) {
      console.error('[gift-topup webhook] failed', e && e.message);
      return res.status(500).json({ ok: false, reason: 'webhook_failed' });
    }
  });

// ───────── Marketplace: buy a product ─────────
  // POST /cabinet/api/products/:id/buy { method: 'cryptobot'|'platega' }
  // Creates payment invoice; on webhook → services/shop-split.js distributes
  // 70%/10%/7.5%/7.5%/5% per the marketing v2 spec (matrix portion is
  // recorded as 'matrix_pending' until admin activates marketing).
  router.post('/api/products/:id/buy', requireAuth, async (req, res) => {
    try {
      const productId = parseInt(req.params.id, 10);
      const method = String((req.body && req.body.method) || 'cryptobot');
      const buyer = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!buyer) return res.status(401).json({ ok: false, reason: 'not_authenticated' });

      const db = require('./planner/db/database').getDb();
      const product = db.prepare('SELECT * FROM user_products WHERE id = ?').get(productId);
      if (!product) return res.status(404).json({ ok: false, reason: 'product_not_found' });
      if (product.user_id === buyer.id) return res.status(400).json({ ok: false, reason: 'cannot_buy_own_product' });
      const priceUsd = Number(product.price_usd || 0);
      if (priceUsd <= 0) {
        // Free product — no invoice; just record purchase + mark accessible.
        const purchase = db.prepare(`INSERT INTO product_purchases (product_id, buyer_user_id, amount_usd, status, paid_at)
          VALUES (?, ?, 0, 'paid', datetime('now'))`).run(product.id, buyer.id);
        return res.json({ ok: true, free: true, purchase_id: purchase.lastInsertRowid });
      }

      // Create pending purchase row first, then invoice.
      const purchase = db.prepare(`INSERT INTO product_purchases (product_id, buyer_user_id, amount_usd, status)
        VALUES (?, ?, ?, 'pending')`).run(product.id, buyer.id, priceUsd);
      const purchaseId = purchase.lastInsertRowid;

      if (method === 'cryptobot') {
        const cbToken = String(process.env.CRYPTOBOT_TOKEN || '').trim();
        if (!cbToken) return res.status(503).json({ ok: false, reason: 'cryptobot_not_configured' });
        const payload = JSON.stringify({ kind: 'product_purchase', purchase_id: purchaseId, product_id: product.id, buyer_user_id: buyer.id });
        const r = await fetch('https://pay.crypt.bot/api/createInvoice', {
          method: 'POST',
          headers: { 'Crypto-Pay-API-Token': cbToken, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            asset: 'USDT', amount: priceUsd.toFixed(2),
            description: 'Golden Connect: ' + (product.title || 'товар'),
            payload, allow_anonymous: false,
          }),
        });
        const data = await r.json();
        if (!data.ok) {
          db.prepare("UPDATE product_purchases SET status='failed' WHERE id=?").run(purchaseId);
          return res.status(502).json({ ok: false, reason: 'cryptobot_error', details: data });
        }
        const inv = data.result;
        db.prepare('UPDATE product_purchases SET invoice_id=? WHERE id=?').run(String(inv.invoice_id), purchaseId);
        return res.json({ ok: true, pay_url: inv.pay_url, invoice_id: inv.invoice_id, purchase_id: purchaseId });
      }

      if (method === 'platega') {
        // Reuse the existing platega route which already builds product invoices.
        // (See cabinet/src/routes/platega.js — same pattern.)
        const plategaRoute = require('./routes/platega');
        // Create the platega invoice directly here for simplicity:
        const merchantId = String(process.env.PLATEGA_MERCHANT_ID || '').trim();
        const apiSecret = String(process.env.PLATEGA_API_SECRET || '').trim();
        if (!merchantId || !apiSecret) return res.status(503).json({ ok: false, reason: 'platega_not_configured' });
        const baseUrl = String(process.env.PLATEGA_BASE_URL || 'https://app.platega.io').replace(/\/+$/, '');
        const usdRate = Number(process.env.PLATEGA_USD_RATE || 90);
        const rub = Math.round(priceUsd * usdRate * 100) / 100;
        const orderUuid = require('crypto').randomUUID();
        const cbBase = String(process.env.PUBLIC_BASE_URL || 'https://goldenConnect.to/cabinet').replace(/\/+$/, '').replace('/cabinet','');
        const callbackUrl = cbBase + '/cabinet/api/platega/webhook';
        const r = await fetch(baseUrl + '/transaction/process', {
          method: 'POST',
          headers: { 'X-MerchantId': merchantId, 'X-Secret': apiSecret, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: orderUuid, paymentMethod: 2, amount: rub, currency: 'RUB',
            description: 'Golden Connect: ' + (product.title || 'товар'),
            payload: 'product:' + purchaseId,
            return: cbBase + '/cabinet#/marketplace',
            callback_url: callbackUrl,
          }),
        });
        const data = await r.json();
        if (!data || !data.redirect) {
          db.prepare("UPDATE product_purchases SET status='failed' WHERE id=?").run(purchaseId);
          return res.status(502).json({ ok: false, reason: 'platega_error', details: data });
        }
        db.prepare('UPDATE product_purchases SET invoice_id=? WHERE id=?').run(String(data.id || orderUuid), purchaseId);
        // Insert into platega_invoices for webhook reconciliation
        db.prepare(`INSERT INTO platega_invoices (order_id, user_id, purpose, target_id, amount_usd, amount_rub, status, invoice_id)
          VALUES (?, ?, 'product', ?, ?, ?, 'pending', ?)`)
          .run(orderUuid, buyer.id, product.id, priceUsd, rub, String(data.id || orderUuid));
        return res.json({ ok: true, pay_url: data.redirect, purchase_id: purchaseId });
      }

      return res.status(400).json({ ok: false, reason: 'invalid_method' });
    } catch (e) {
      console.error('[product/buy]', e && e.message);
      return res.status(500).json({ ok: false, reason: e.message });
    }
  });

  // CryptoBot webhook for product purchases.
  router.post('/api/products/cryptobot-webhook', express.json(), async (req, res) => {
    try {
      const update = req.body || {};
      if (update.update_type !== 'invoice_paid' || !update.payload || !update.payload.payload) return res.json({ ok: true, ignored: true });
      let info; try { info = JSON.parse(update.payload.payload); } catch { return res.json({ ok: true, ignored: 'bad_payload' }); }
      if (info.kind !== 'product_purchase' || !info.purchase_id) return res.json({ ok: true, ignored: 'wrong_kind' });
      const db = require('./planner/db/database').getDb();
      const purchase = db.prepare('SELECT * FROM product_purchases WHERE id = ?').get(info.purchase_id);
      if (!purchase || purchase.status === 'paid') return res.json({ ok: true, dedup: true });
      db.prepare("UPDATE product_purchases SET status='paid', paid_at=datetime('now') WHERE id=?").run(info.purchase_id);
      // Run split distribution
      const split = require('./services/shop-split');
      try { split.distributePurchase(info.purchase_id); } catch (e) { console.error('[shop-split]', e.message); }
      // Notify seller
      try {
        const product = db.prepare('SELECT user_id, title, price_usd FROM user_products WHERE id = ?').get(purchase.product_id);
        const seller = db.prepare('SELECT tg_id FROM users WHERE id = ?').get(product.user_id);
        if (seller && seller.tg_id) {
          const notify = require('./services/notify');
          notify.notifyAdmins && notify.onMarketplaceSale && notify.onMarketplaceSale({ buyerUserId: purchase.buyer_user_id, productTitle: product.title, amountUsd: product.price_usd, sellerTgId: seller.tg_id });
        }
      } catch (e) { console.error('[seller notify]', e.message); }
      return res.json({ ok: true });
    } catch (e) {
      console.error('[product webhook]', e && e.message);
      return res.status(500).json({ ok: false });
    }
  });

  // ───────── Ads top-up: create platega/cryptobot invoice ─────────
  router.post('/api/ads/topup', requireAuth, async (req, res) => {
    try {
      const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
      const amount = Number((req.body && req.body.amount_usd) || 0);
      const method = String((req.body && req.body.method) || '').trim();
      if (!Number.isFinite(amount) || amount < 5) {
        return res.status(400).json({ ok: false, reason: 'min_amount_5_usd' });
      }
      if (method !== 'platega' && method !== 'cryptobot') {
        return res.status(400).json({ ok: false, reason: 'invalid_method' });
      }
      let email = String(user.email || '').trim().toLowerCase();
      if (!email) {
        const tgId = user.telegramUserId || user.telegram_user_id;
        if (tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
      }
      if (!email) return res.status(400).json({ ok: false, reason: 'email_missing' });

      // Top-up uses a synthetic tariff_code so the api side can route.
      // For now we reuse 'launch' but stamp metadata. TODO: dedicated topup tariffs.
      let inviterRefCode = null;
      try {
        const refBy = user.referredByUserId || user.referred_by_user_id;
        if (refBy && storage.findWebUserById) {
          const inviter = storage.findWebUserById(refBy);
          if (inviter && inviter.referralCode) inviterRefCode = inviter.referralCode;
        }
      } catch (e) {}
      const data = await callGoldenConnectApi('/internal/pay/create-invoice', {
        email,
        tariff_code: 'launch',
        method,
        display_name: user.displayName || null,
        ref_code: user.refCode || user.ref_code || null,
        inviter_ref_code: inviterRefCode,
        purpose: 'ads_topup',
        amount_override_usd: amount,
      });
      res.json(data);
    } catch (e) {
      console.error('[ads] topup failed', e && e.message);
      res.status(e && e.status || 502).json({
        ok: false,
        reason: (e && e.message) || 'topup_failed',
        details: e && e.data || null,
      });
    }
  });

  router.get('/api/pay/tariffs', (req, res) => {
    res.json({
      ok: true,
      tariffs: [
        { code: 'launch', name: 'LAUNCH', price_usd: 30, monthly_fee_usd: 15, seats: 1, matrix_depth: 12, matrix_rate_usd: 0.5, has_matching_bonus: false, cycle_income_usd: 4095, blurb: '1 бизнес-место · матрица 12 × $0.5' },
        { code: 'boost',  name: 'BOOST',  price_usd: 75, monthly_fee_usd: 15, seats: 2, matrix_depth: 14, matrix_rate_usd: 0.6, has_matching_bonus: false, cycle_income_usd: 19660, blurb: '2 бизнес-места · матрица 14 × $0.6' },
        { code: 'rocket', name: 'ROCKET', price_usd: 120, monthly_fee_usd: 15, seats: 3, matrix_depth: 17, matrix_rate_usd: 0.7, has_matching_bonus: true, cycle_income_usd: 183499, blurb: '3 места · матрица 17 × $0.7 · Matching Bonus' }
      ]
    });
  });

  router.post('/api/pay/create-invoice', requireAuth, async (req, res) => {
    const { tariff_code, method } = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!tariff_code || !method) {
      return res.status(400).json({ ok: false, reason: 'tariff_code and method required' });
    }
    if (method !== 'cryptobot' && method !== 'platega') {
      return res.status(400).json({ ok: false, reason: 'method must be cryptobot or platega' });
    }
    const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
    let email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      // TG-WebApp users have no email — synthesize a deterministic one so
      // the api-side findOrCreateUserByEmail() can still bridge to a row.
      const tgId = user.telegramUserId || user.telegram_user_id;
      if (tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
    }
    if (!email) return res.status(400).json({ ok: false, reason: 'email_missing' });
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.name || user.displayName || null;

    try {
      // Look up the BUYER's inviter (sponsor) by their referredByUserId.
      // The api needs inviter_ref_code (not the buyer's own ref_code) so it
      // can stamp users.invited_by_user_id on create — that's what the
      // matrix engine reads for spillover when admin activates marketing.
      let inviterRefCode = null;
      try {
        const refByCabId = user.referredByUserId || user.referred_by_user_id;
        if (refByCabId && storage.findWebUserById) {
          const inviter = storage.findWebUserById(refByCabId);
          if (inviter && inviter.referralCode) inviterRefCode = inviter.referralCode;
        }
      } catch (e) {
        console.error('[pay] inviter lookup failed', e && e.message);
      }
      const data = await callGoldenConnectApi('/internal/pay/create-invoice', {
        email,
        tariff_code,
        method,
        display_name: displayName,
        ref_code: user.refCode || user.ref_code || null,
        inviter_ref_code: inviterRefCode,
      });
      res.json(data);
    } catch (e) {
      console.error('[pay] create-invoice bridge failed', e && e.message);
      res.status(e && e.status || 502).json({
        ok: false,
        reason: (e && e.message) || 'pay_bridge_error',
        details: e && e.data || null,
      });
    }
  });

  router.get('/api/pay/bookings', requireAuth, async (req, res) => {
    const user = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!user) return res.status(401).json({ ok: false, reason: 'not_authenticated' });
    let email = String(user.email || '').trim().toLowerCase();
    if (!email) {
      const tgId = user.telegramUserId || user.telegram_user_id;
      if (tgId) email = 'tg' + String(tgId) + '@goldenConnect.bot';
    }
    if (!email) return res.json({ ok: true, bookings: [] });
    try {
      const data = await callGoldenConnectApi('/internal/pay/bookings?email=' + encodeURIComponent(email));
      res.json(data);
    } catch (e) {
      console.error('[pay] bookings bridge failed', e && e.message);
      res.status(e && e.status || 502).json({ ok: false, reason: (e && e.message) || 'pay_bridge_error' });
    }
  });


  // ─────── Public AI chat (Groq-backed, rate-limited) ───────
  // Shared endpoint used by the in-cabinet widget (#page-ai and FAB).
  // Accepts {messages:[{role, content},...]} with a system prompt at
  // index 0 embedded by the client. Responds {content} in one shot.
  const _aiChatLimits = new Map();
  router.post('/api/public/ai-chat', async (req, res) => {
    try {
      const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown').split(',')[0].trim();
      const now = Date.now();
      const lim = _aiChatLimits.get(ip) || { count: 0, reset: now + 60000 };
      if (now > lim.reset) { lim.count = 0; lim.reset = now + 60000; }
      lim.count++;
      _aiChatLimits.set(ip, lim);
      if (lim.count > 20) {
        return res.status(429).json({ error: 'Too many requests', content: 'Слишком много запросов, подождите минуту.' });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const msgs = Array.isArray(body.messages) ? body.messages : null;
      if (!msgs) return res.status(400).json({ error: 'messages required' });

      const keys = (config.groqKeys && config.groqKeys.length) ? config.groqKeys : (config.groqKey ? [config.groqKey] : []);
      if (!keys.length) {
        return res.json({ content: 'AI временно не настроен. Попробуй позже или напиши в поддержку.' });
      }

      const apiMessages = msgs.slice(-14).map((m) => ({
        role: m && (m.role === 'system' || m.role === 'assistant') ? m.role : 'user',
        content: String((m && m.content) || '').slice(0, 3000),
      })).filter((m) => m.content.length);

      const model = process.env.AI_MODEL || 'llama-3.3-70b-versatile';
      let lastErr = null;
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        try {
          const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: apiMessages,
              temperature: 0.7,
              max_tokens: 700,
            }),
          });
          if (!resp.ok) {
            const text = await resp.text();
            lastErr = 'groq_' + resp.status + ':' + text.slice(0, 200);
            if (resp.status === 401 || resp.status === 429) continue;
            break;
          }
          const data = await resp.json();
          const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          return res.json({ content: content || 'Пусто.' });
        } catch (e) {
          lastErr = (e && e.message) || String(e);
        }
      }
      console.error('[ai-chat] all groq keys failed:', lastErr);
      return res.status(502).json({ error: lastErr || 'ai_unavailable', content: 'Не удалось получить ответ — все ключи недоступны. Попробуйте позже.' });
    } catch (e) {
      console.error('[ai-chat] handler error:', e && e.message);
      return res.status(500).json({ error: (e && e.message) || 'internal', content: 'Ошибка сервера. Попробуйте ещё раз.' });
    }
  });

  const _adxRouter = createAdxRouter(config, storage, requireAuth, bot);
  router.use('/api/adx', _adxRouter);
  // ADX completion cron: every 5 min release escrow for expired orders
  if (_adxRouter && _adxRouter._adxCompleteExpired) {
    setTimeout(() => { try { _adxRouter._adxCompleteExpired(); } catch (_) {} }, 90000);
    setInterval(() => { try { _adxRouter._adxCompleteExpired(); } catch (_) {} }, 5 * 60 * 1000).unref();
  }
  // ───────── Cabinet v2 endpoints (data for new dashboard) ─────────

  router.get('/api/achievements', requireAuth, (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId;
      const earned = [];
      try {
        const planner = require('./planner/db/database');
        const pdb = planner.getDb();
        const pUser = pdb.prepare('SELECT id FROM users WHERE tg_id = ?').get(tgId);
        if (pUser) {
          const rows = pdb.prepare('SELECT badge_id FROM user_achievements WHERE user_id = ?').all(pUser.id);
          rows.forEach(r => earned.push(r.badge_id));
        }
      } catch (e) {}
      res.json({ ok: true, earned });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.get('/api/challenge/today', requireAuth, (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const tgId = u.telegramUserId;
      const today = new Date().toISOString().slice(0, 10);
      try {
        const pdb = require('./planner/db/database').getDb();
        const pUser = pdb.prepare('SELECT id FROM users WHERE tg_id = ?').get(tgId);
        if (!pUser) return res.json({ ok: true, challenge: null });
        const ch = pdb.prepare('SELECT * FROM daily_challenges WHERE user_id = ? AND day = ?').get(pUser.id, today);
        if (!ch) return res.json({ ok: true, challenge: null });
        const titles = {
          do_3_tasks: 'Сделай 3 задания на бирже', do_5_tasks: 'Сделай 5 заданий',
          invite_1: 'Пригласи 1 друга', create_camp: 'Запусти кампанию',
        };
        return res.json({ ok: true, challenge: {
          title: titles[ch.challenge_id] || ch.challenge_id,
          progress: ch.progress, target: ch.target, reward_cents: ch.reward_cents,
          status: ch.status,
        }});
      } catch (e) { return res.json({ ok: true, challenge: null }); }
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.get('/api/team/tree', requireAuth, async (req, res) => {
    // [team-tree-v2]
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      // Try to fetch full referral tree (up to L10) from api Postgres.
      try {
        const email = String(u.email || '').trim().toLowerCase();
        if (email) {
          const apiRes = await callGoldenConnectApi('/internal/team/by-email/referrals', { email });
          const list = (apiRes && Array.isArray(apiRes.referrals)) ? apiRes.referrals : null;
          if (list) {
            const root = { id: u.id, ref_code: u.referralCode || '' };
            const tree = list.map(function(r) {
              return {
                level: Number(r.level || 1),
                parent_user_id: Number(r.parent_user_id || u.id),
                user_id: Number(r.user_id || r.id),
                ref_code: r.ref_code || '',
                username_masked: r.username_masked || (r.tg_username ? '@' + r.tg_username : null) || null,
                tg_username: r.tg_username || null,
                joined_at: r.joined_at || r.created_at || null,
              };
            });
            const stats = {
              direct: tree.filter(function(t){ return t.level === 1; }).length,
              total: tree.length,
              by_level: [1,2,3,4,5,6,7,8,9,10].map(function(L){
                return { level: L, count: tree.filter(function(t){ return t.level === L; }).length };
              }).filter(function(b){ return b.count > 0; }),
            };
            return res.json({ ok: true, root, stats, tree });
          }
        }
      } catch (apiErr) { console.warn('[team/tree] api fetch failed:', apiErr && apiErr.message); }
      // [recursive-tree-fallback] Fallback: recursive walk through planner.db users.referred_by
      const refs = storage.listInviteeReferrals ? storage.listInviteeReferrals(u.id) : [];
      // Build deeper tree from planner.db (users.referred_by points to inviter)
      try {
        const pdb = require('./planner/db/database').getDb();
        const refByCol = pdb.prepare("PRAGMA table_info(users)").all().some(c => c.name === 'referred_by');
        if (refByCol) {
          // Try to seed root from u.id mapped to a planner user via tg_id or web user id
          const myTg = u.telegramUserId || u.telegram_user_id;
          const myPlannerRow = myTg
            ? pdb.prepare('SELECT id, ref_code FROM users WHERE tg_id=?').get(myTg)
            : null;
          if (myPlannerRow) {
            const rootId = myPlannerRow.id;
            const tree = [];
            const seen = new Set([rootId]);
            let frontier = [rootId];
            for (let level = 1; level <= 10 && frontier.length; level++) {
              const placeholders = frontier.map(() => '?').join(',');
              const next = pdb.prepare(
                'SELECT id, tg_id, tg_username, tg_first_name, ref_code, referred_by, created_at FROM users WHERE referred_by IN (' + placeholders + ')'
              ).all(...frontier);
              for (const r of next) {
                if (seen.has(r.id)) continue;
                seen.add(r.id);
                tree.push({
                  level,
                  parent_user_id: r.referred_by,
                  user_id: r.id,
                  ref_code: r.ref_code || ('u' + r.id),
                  username_masked: r.tg_username ? '@' + r.tg_username : (r.tg_first_name || ('User' + r.id)),
                  tg_username: r.tg_username || null,
                  joined_at: r.created_at || null,
                });
              }
              frontier = next.map(r => r.id);
            }
            if (tree.length) {
              return res.json({
                ok: true,
                root: { id: rootId, ref_code: myPlannerRow.ref_code || '' },
                stats: {
                  direct: tree.filter(t => t.level === 1).length,
                  total: tree.length,
                  by_level: [1,2,3,4,5,6,7,8,9,10].map(L => ({ level: L, count: tree.filter(t => t.level === L).length })).filter(b => b.count > 0),
                },
                tree,
                levels: [{ users: tree.filter(t => t.level === 1).map(t => ({ name: t.username_masked, has_tariff: false, in_chat: false })), totalEarnedCents: 0 }],
              });
            }
          }
        }
      } catch (recErr) { console.warn('[team/tree] recursive fallback:', recErr && recErr.message); }
      // Group by level (simplified — just L1 for now; extending requires recursive query)
      const levels = [{ users: refs.map(r => ({
        name: r.displayName || r.email || ('User' + r.id),
        in_chat: false,
        has_tariff: !!(r.activeTariff),
      })), totalEarnedCents: 0 }];
      const tree = refs.map(function(r,i){ return { level: 1, parent_user_id: u.id, user_id: r.id, ref_code: r.ref_code || ('u' + r.id), username_masked: r.displayName || r.email || ('User' + r.id), tg_username: null, joined_at: r.createdAt || null }; });
      return res.json({ ok: true, levels, root: { id: u.id, ref_code: u.referralCode || '' }, stats: { direct: tree.length, total: tree.length, by_level: [{ level: 1, count: tree.length }] }, tree });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.get('/api/mentor/plan', requireAuth, (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const stats = storage.getTeamStats ? storage.getTeamStats(u.id) : { total: 0 };
      const plan = [];
      if (!stats.total) plan.push('🌱 Начни с малого: возьми первое задание на бирже (открой /jobs в боте)');
      plan.push('🔗 Скопируй реф-ссылку из /ref в боте и отправь 5 знакомым');
      plan.push('🚀 Изучи тарифы /tariffs — без них доступна только 1 уровень партнёрки');
      plan.push('💬 Зайди в чат партнёров @GOLDEN_CONNECT_AD — там обсуждают актуальное');
      plan.push('🎯 Создай первую рекламную кампанию (/campaigns) — даже на $5 даст 50+ подписчиков');
      return res.json({ ok: true, plan });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.post('/api/mentor/ask', requireAuth, async (req, res) => {
    try {
      const q = String((req.body && req.body.question) || '').trim();
      if (!q) return res.status(400).json({ ok: false });
      const checker = require('./services/ai-task-checker');
      // Use checkTextReport as a generic Groq call
      const r = await checker.checkTextReport({
        criteria: 'Ответь кратко (2-4 предложения) как AI-помощник партнёра рекламной платформы Golden Connect (LAUNCH/BOOST/ROCKET тарифы, биржа заданий, 10-уровневая партнёрка, маркетплейс).',
        reportText: q, taskDescription: 'Вопрос партнёра',
      });
      res.json({ ok: true, answer: r.reasoning || 'Уточни вопрос — попробую помочь.' });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.get('/api/group-chat/stats', requireAuth, (req, res) => {
    try {
      const targetChat = process.env.GOLDEN_CONNECT_GROUP_CHAT || '@GOLDEN_CONNECT_AD';
      const pdb = require('./planner/db/database').getDb();
      const stats = pdb.prepare(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('member','administrator','creator') THEN 1 ELSE 0 END) AS active, SUM(CASE WHEN status IN ('left','kicked') THEN 1 ELSE 0 END) AS gone FROM group_members"
      ).get();
      const today = pdb.prepare("SELECT COUNT(*) AS n FROM group_members WHERE date(joined_at) = date('now')").get()?.n || 0;
      const online = pdb.prepare("SELECT COUNT(DISTINCT tg_user_id) AS n FROM group_activity WHERE last_msg_at >= datetime('now','-30 minutes')").get()?.n || 0;
      const top = pdb.prepare(
        "SELECT m.first_name, m.tg_username, a.msg_count_week FROM group_activity a JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id WHERE a.msg_count_week > 0 ORDER BY a.msg_count_week DESC LIMIT 10"
      ).all();
      res.json({
        ok: true,
        target_chat: targetChat,
        stats: { total: stats?.total || 0, active: stats?.active || 0, gone: stats?.gone || 0, today, online },
        top: top.map(t => ({ name: (t.first_name || 'User') + (t.tg_username ? ' @' + t.tg_username : ''), msg_count_week: t.msg_count_week })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, reason: e.message });
    }
  });

  router.get('/api/notifications', requireAuth, (req, res) => {
    try {
      const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
      if (!u) return res.status(401).json({ ok: false });
      const ns = storage.listUserNotifications ? storage.listUserNotifications(u.id, 20) : [];
      res.json({ ok: true, notifications: ns });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  // === Onboarding wizard endpoints ===
// Inserted into web-routes.js before /api/ads mount
// Schema, API, AI plan generation (Groq) with deterministic fallback.

  // Onboarding: 10-step wizard, $1 reward + 'onboarded' badge on completion
  function _onbDb() {
    try { return require('./planner/db/database').getDb(); } catch (e) { return null; }
  }
  function _onbEnsureTable() {
    const db = _onbDb(); if (!db) return null;
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS user_onboarding (
        user_id INTEGER PRIMARY KEY,
        web_user_id INTEGER,
        tg_id INTEGER,
        step INTEGER DEFAULT 0,
        answers TEXT DEFAULT '{}',
        plan TEXT,
        completed_at INTEGER,
        reward_paid INTEGER DEFAULT 0,
        source TEXT,
        created_at INTEGER DEFAULT (strftime('%s','now')*1000),
        updated_at INTEGER DEFAULT (strftime('%s','now')*1000)
      )`);
    } catch (e) {}
    return db;
  }
  function _onbGetCtx(req) {
    const u = (req.webUser || storage.findWebUserById(req.session && req.session.userId));
    if (!u) return null;
    const db = _onbEnsureTable(); if (!db) return null;
    // Stable synthetic tg_id for email-only users: use -webUserId so each
    // web_user has its own row in users table (no NULL collisions).
    const synthTgId = u.telegramUserId || -Math.abs(Number(u.id) || 0);
    if (!synthTgId) return null;
    let row;
    try { row = db.prepare('SELECT id FROM users WHERE tg_id = ?').get(synthTgId); } catch (e) {}
    if (row && row.id) return { plannerUserId: row.id, webUserId: u.id, tgId: synthTgId, webUser: u };
    try {
      // Use INSERT (not INSERT OR IGNORE) since we now have a deterministic key.
      const r = db.prepare('INSERT OR IGNORE INTO users (tg_id, first_name) VALUES (?, ?)')
                  .run(synthTgId, u.displayName || u.email || 'User');
      let id = r.lastInsertRowid;
      if (!id) {
        // Conflict (very rare race) — re-fetch
        const again = db.prepare('SELECT id FROM users WHERE tg_id = ?').get(synthTgId);
        if (again && again.id) id = again.id;
      }
      return id ? { plannerUserId: id, webUserId: u.id, tgId: synthTgId, webUser: u } : null;
    } catch (e) { return null; }
  }
  function _onbStaticPlan(answers) {
    const fear = answers['9'] || '';
    const time = answers['4'] || '';
    const network = answers['7'] || '';
    const channels = answers['8'] || '';
    const lines = [];
    lines.push('🎯 ТВОЙ ПЛАН на 30 дней:');
    lines.push('');
    lines.push('📅 ДЕНЬ 1-3 (старт):');
    lines.push('• /tariffs — выбери тариф (FREE для начала ок)');
    lines.push('• /ref — скопируй реф-ссылку и отправь 5-10 знакомым');
    lines.push('• /jobs — сделай 3 задания, поймёшь как платят');
    lines.push('• Зайди в @GOLDEN_CONNECT_AD — представься партнёрам');
    lines.push('');
    lines.push('📅 НЕДЕЛЯ 1 (первый доход):');
    lines.push('• 5 заданий в день = $0.25-0.50/день');
    lines.push('• Пригласи 5 человек по реф-ссылке');
    if (channels.indexOf('telegram') >= 0 || channels.indexOf('all') >= 0) {
      lines.push('• /aipost — сгенерируй пост, разошли в каналы');
    }
    lines.push('• /bio — собери все ссылки на одной странице');
    lines.push('');
    lines.push('📅 МЕСЯЦ 1 (выход на доход):');
    if (network.indexOf('500') >= 0 || network.indexOf('1000') >= 0) {
      lines.push('• /campaigns — запусти первую рекламу ($5-10 = 50+ подписчиков)');
    }
    lines.push('• Стань PARTNER: 10 партнёров → +10% пожизненно');
    lines.push('• Открой L2-L3: купи LAUNCH ($45), окупится за 9 рефералов');
    lines.push('');
    lines.push('💡 ГЛАВНОЕ:');
    if (fear.indexOf('clients') >= 0) lines.push('• Биржа + чат партнёров дают первых лидов автоматом');
    if (fear.indexOf('time') >= 0 || time === '30m') lines.push('• Хватит 20-30 минут: задания + 2-3 поста реф-ссылки');
    if (fear.indexOf('roi') >= 0) lines.push('• Старт с FREE — ничего не теряешь, проверишь сам');
    lines.push('• Каждый день в кабинете: трекинг + AI-помощник');
    lines.push('');
    lines.push('🎁 БОНУС: $1 зачислен на gift-баланс — используй на /campaigns');
    return lines.join('\n');
  }
  async function _onbAIPlan(answers, webUser) {
    try {
      const generator = require('./services/ai-onboarding');
      if (!generator || typeof generator.generatePersonalPlan !== 'function') {
        return _onbStaticPlan(answers);
      }
      // Resolve sponsor (referrer) info to inject contact at the end
      let sponsor = null;
      try {
        const sponsorId = webUser && (webUser.referredByUserId || webUser.referred_by_user_id);
        if (sponsorId && storage && storage.findWebUserById) {
          const s = storage.findWebUserById(sponsorId);
          if (s) sponsor = {
            displayName: s.displayName || s.firstName || null,
            telegramUsername: s.telegramUsername || null,
          };
        }
      } catch (e) { /* non-fatal */ }
      const text = await generator.generatePersonalPlan(answers, sponsor);
      if (text && text.length > 100) return text;
    } catch (e) { console.warn('[onboarding] generator failed:', e && e.message); }
    return _onbStaticPlan(answers);
  }

  router.get('/api/onboarding/state', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req);
      if (!ctx) return res.status(401).json({ ok: false });
      const db = _onbDb();
      let row = null;
      try { row = db.prepare('SELECT * FROM user_onboarding WHERE user_id = ?').get(ctx.plannerUserId); } catch (e) {}
      let answers = {};
      try { answers = row && row.answers ? JSON.parse(row.answers) : {}; } catch (e) {}
      res.json({
        ok: true,
        step: row ? row.step : 0,
        answers,
        plan: row && row.plan ? row.plan : null,
        completed: !!(row && row.completed_at),
        reward_paid: !!(row && row.reward_paid),
      });
    } catch (e) { res.status(500).json({ ok: false }); }
  });

  router.post('/api/onboarding/answer', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req);
      if (!ctx) return res.status(401).json({ ok: false });
      const step = parseInt((req.body && req.body.step) || 0, 10);
      const answer = String((req.body && req.body.answer) || '').slice(0, 500);
      const source = String((req.body && req.body.source) || 'cabinet').slice(0, 32);
      if (!step || step < 1 || step > 10) return res.status(400).json({ ok: false, reason: 'bad_step' });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      let row = null;
      try { row = db.prepare('SELECT * FROM user_onboarding WHERE user_id = ?').get(ctx.plannerUserId); } catch (e) {}
      let answers = {};
      if (row && row.answers) { try { answers = JSON.parse(row.answers); } catch (e) {} }
      answers[String(step)] = answer;
      if (!row) {
        db.prepare('INSERT INTO user_onboarding (user_id, web_user_id, tg_id, step, answers, source) VALUES (?,?,?,?,?,?)')
          .run(ctx.plannerUserId, ctx.webUserId, ctx.tgId, step, JSON.stringify(answers), source);
      } else {
        db.prepare("UPDATE user_onboarding SET step = ?, answers = ?, updated_at = strftime('%s','now')*1000 WHERE user_id = ?")
          .run(Math.max(step, row.step || 0), JSON.stringify(answers), ctx.plannerUserId);
      }
      res.json({ ok: true, step, total: 10 });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  router.post('/api/onboarding/complete', requireAuth, async (req, res) => {
    try {
      const ctx = _onbGetCtx(req);
      if (!ctx) return res.status(401).json({ ok: false });
      const source = String((req.body && req.body.source) || 'cabinet').slice(0, 32);
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      let row = null;
      try { row = db.prepare('SELECT * FROM user_onboarding WHERE user_id = ?').get(ctx.plannerUserId); } catch (e) {}
      if (!row) return res.status(400).json({ ok: false, reason: 'no_answers' });
      let answers = {};
      try { answers = JSON.parse(row.answers || '{}'); } catch (e) {}
      const plan = await _onbAIPlan(answers, ctx.webUser);
      // Pay $1 once via gift_balance_cents (same mechanism as achievements rewards)
      let rewardPaid = !!row.reward_paid;
      let rewardAmount = 0;
      if (!rewardPaid) {
        try {
          // Phase E dual-write
          (async () => { try { const r = db.prepare('SELECT tg_id FROM users WHERE id = ?').get(ctx.plannerUserId); if (r && r.tg_id) await creditApi({ tgId: r.tg_id, wallet: 'gift', cents: 100, kind: 'promo_bonus', memo: 'promo +$1' }); } catch (e) { console.warn('[promo] api credit:', e && e.message); } })();
          /* Phase G: planner cents write removed (api dual-write above is single source) */
          db.prepare("INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note) VALUES ('reward', ?, 'gift', 100, 'onboarding')")
            .run(ctx.plannerUserId);
          rewardPaid = true;
          rewardAmount = 100;
        } catch (e) { console.error('[onboarding] reward pay failed:', e.message); }
      }
      // Award badge (idempotent)
      try {
        db.prepare('INSERT OR IGNORE INTO user_achievements (user_id, badge_id, reward_cents) VALUES (?, ?, ?)')
          .run(ctx.plannerUserId, 'onboarded', rewardAmount);
      } catch (e) {}
      try {
        db.prepare("UPDATE user_onboarding SET plan = ?, completed_at = strftime('%s','now')*1000, reward_paid = ?, source = COALESCE(source, ?), step = 10 WHERE user_id = ?")
          .run(plan, rewardPaid ? 1 : 0, source, ctx.plannerUserId);
      } catch (e) {}
      res.json({ ok: true, plan, reward_paid: rewardPaid, reward_cents: rewardAmount, badge: 'onboarded' });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  // ── Phase R: daily AI plan ─────────────────────────────────────
  function _dpEnsureTable() {
    const db = _onbDb(); if (!db) return null;
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS daily_plans (
        user_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, day)
      )`);
    } catch (_) {}
    return db;
  }
  async function _dpFetchOrGenerate(ctx, force) {
    const db = _dpEnsureTable(); if (!db) return null;
    const today = new Date().toISOString().slice(0, 10);
    if (!force) {
      const row = db.prepare('SELECT plan_json, created_at FROM daily_plans WHERE user_id=? AND day=?').get(ctx.plannerUserId, today);
      if (row) {
        try { return { plan: JSON.parse(row.plan_json), cached: true, day: today, created_at: row.created_at }; } catch(_) {}
      }
    }
    // Build profile snapshot from onboarding answers + webUser profile
    const onbRow = db.prepare('SELECT data_json FROM user_onboarding WHERE user_id=?').get(ctx.plannerUserId);
    let answers = {};
    try { answers = onbRow ? (JSON.parse(onbRow.data_json || '{}').answers || {}) : {}; } catch(_) {}
    const profile = (ctx.webUser && ctx.webUser.profile) || {};
    const { generateDailyPlan } = require('./services/daily-plan');
    const tasks = await generateDailyPlan({ profile, answers });
    db.prepare('INSERT OR REPLACE INTO daily_plans (user_id, day, plan_json) VALUES (?, ?, ?)')
      .run(ctx.plannerUserId, today, JSON.stringify(tasks));
    return { plan: tasks, cached: false, day: today };
  }
  router.get('/api/my-plan/daily', requireAuth, async (req, res) => {
    try {
      const ctx = _onbGetCtx(req); if (!ctx) return res.status(401).json({ ok: false });
      const r = await _dpFetchOrGenerate(ctx, false);
      if (!r) return res.status(500).json({ ok: false, reason: 'gen_failed' });
      res.json({ ok: true, ...r });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.post('/api/my-plan/daily/refresh', requireAuth, async (req, res) => {
    try {
      const ctx = _onbGetCtx(req); if (!ctx) return res.status(401).json({ ok: false });
      const r = await _dpFetchOrGenerate(ctx, true);
      if (!r) return res.status(500).json({ ok: false, reason: 'gen_failed' });
      res.json({ ok: true, ...r });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

  

  // Phase S.2: admin hashtag management
  router.get('/api/admin/hashtags', requireAuth, (req, res) => {
    try {
      if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      const rows = db.prepare("SELECT id, hashtag, category, priority, active, added_at FROM tg_video_hashtags ORDER BY active DESC, priority DESC, hashtag ASC").all();
      const stats = db.prepare("SELECT COUNT(*) AS n_pool, SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) AS available FROM tg_video_pool").get();
      res.json({ ok: true, hashtags: rows, pool_stats: stats });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.post('/api/admin/hashtags', requireAuth, (req, res) => {
    try {
      if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false });
      const body = req.body || {};
      const hashtag = String(body.hashtag || '').trim().replace(/^#+/, '').slice(0, 60);
      const category = String(body.category || 'other').slice(0, 32);
      const priority = Math.max(1, Math.min(10, parseInt(body.priority, 10) || 5));
      if (!hashtag) return res.status(400).json({ ok: false, reason: 'empty_hashtag' });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      try {
        const r = db.prepare('INSERT INTO tg_video_hashtags (hashtag, category, priority, active) VALUES (?, ?, ?, 1)').run(hashtag, category, priority);
        res.json({ ok: true, id: r.lastInsertRowid });
      } catch (e) {
        if (String(e.message || '').includes('UNIQUE')) return res.status(409).json({ ok: false, reason: 'duplicate' });
        throw e;
      }
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.post('/api/admin/hashtags/:id/toggle', requireAuth, (req, res) => {
    try {
      if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false });
      const id = parseInt(req.params.id, 10);
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      db.prepare('UPDATE tg_video_hashtags SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id=?').run(id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.post('/api/admin/hashtags/collect-now', requireAuth, async (req, res) => {
    try {
      if (_isCabinetAdmin(req) !== 'admin') return res.status(403).json({ ok: false });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      const { collectAll } = require('./services/video-collector');
      const r = await collectAll(db);
      res.json({ ok: true, ...r });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });

    // Phase S.1: serve user's personal video-banner PNG
  router.get('/api/my-banner.png', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req);
      if (!ctx) return res.status(401).send('unauthorized');
      const dbm = require('./planner/db/database');
      const row = dbm.getDb().prepare(
        'SELECT video_banner_path, video_banner_status, ref_code FROM users WHERE id=?'
      ).get(ctx.plannerUserId);
      if (!row) return res.status(404).send('user not found');
      if (!row.video_banner_path || row.video_banner_status !== 'ready') {
        // Synchronous on-demand generation if not yet done
        if (!row.ref_code) return res.status(400).send('no ref_code');
        const { generateBanner } = require('./services/personal-banner');
        const dn = (ctx.webUser && (ctx.webUser.displayName || ctx.webUser.email)) || ('user' + ctx.plannerUserId);
        return generateBanner({ userId: ctx.plannerUserId, refCode: row.ref_code, displayName: dn })
          .then((p) => {
            dbm.getDb().prepare("UPDATE users SET video_banner_path=?, video_banner_status='ready', video_banner_generated_at=datetime('now') WHERE id=?")
              .run(p, ctx.plannerUserId);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'private, max-age=300');
            require('fs').createReadStream(p).pipe(res);
          })
          .catch((e) => res.status(500).send('gen failed: ' + (e.message || 'unknown')));
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'private, max-age=300');
      require('fs').createReadStream(row.video_banner_path).pipe(res);
    } catch (e) { res.status(500).send('error: ' + (e.message || 'unknown')); }
  });

    router.get('/api/onboarding/plan', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req);
      if (!ctx) return res.status(401).json({ ok: false });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      let row = null;
      try { row = db.prepare('SELECT * FROM user_onboarding WHERE user_id = ?').get(ctx.plannerUserId); } catch (e) {}
      if (!row || !row.plan) return res.json({ ok: true, plan: null, completed: false });
      let answers = {};
      try { answers = JSON.parse(row.answers || '{}'); } catch (e) {}
      res.json({
        ok: true,
        plan: row.plan,
        answers,
        completed: !!row.completed_at,
        completed_at: row.completed_at,
        reward_paid: !!row.reward_paid,
      });
    } catch (e) { res.status(500).json({ ok: false }); }
  });



  // Phase S.7: user-facing video-promo routes  // [phase-s7]
  router.get('/api/my-video-promo', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req); if (!ctx) return res.status(401).json({ ok: false });
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      const pending = db.prepare(
        "SELECT a.id, a.sent_at, p.hashtag, p.source_platform " +
        "FROM tg_video_assignments a LEFT JOIN tg_video_pool p ON p.id=a.pool_id " +
        "WHERE a.user_id=? AND a.status='pending' ORDER BY a.sent_at DESC LIMIT 10"
      ).all(ctx.plannerUserId);
      const reported = db.prepare(
        "SELECT a.id, a.sent_at, a.reported_at, a.report_url, p.hashtag, p.source_platform " +
        "FROM tg_video_assignments a LEFT JOIN tg_video_pool p ON p.id=a.pool_id " +
        "WHERE a.user_id=? AND a.status='reported' ORDER BY a.reported_at DESC LIMIT 50"
      ).all(ctx.plannerUserId);
      const totals = db.prepare(
        "SELECT COUNT(*) AS total, " +
        "  SUM(CASE WHEN status='reported' THEN 1 ELSE 0 END) AS reported " +
        "FROM tg_video_assignments WHERE user_id=?"
      ).get(ctx.plannerUserId);
      res.json({ ok: true, pending, reported, totals: { total: totals.total||0, reported: totals.reported||0 } });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.post('/api/my-video-promo/:id/report', requireAuth, (req, res) => {
    try {
      const ctx = _onbGetCtx(req); if (!ctx) return res.status(401).json({ ok: false });
      const url = String((req.body && req.body.url) || '').trim();
      if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, reason: 'bad_url' });
      const id = parseInt(req.params.id, 10);
      const db = _onbDb(); if (!db) return res.status(500).json({ ok: false });
      const a = db.prepare("SELECT id, user_id, status FROM tg_video_assignments WHERE id=?").get(id);
      if (!a) return res.status(404).json({ ok: false, reason: 'not_found' });
      if (a.user_id !== ctx.plannerUserId) return res.status(403).json({ ok: false, reason: 'not_yours' });
      if (a.status !== 'pending') return res.status(409).json({ ok: false, reason: 'already_' + a.status });
      db.prepare(
        "UPDATE tg_video_assignments SET status='reported', reported_at=datetime('now'), report_url=? WHERE id=?"
      ).run(url, id);
      try {
        db.prepare("UPDATE users SET ads_karma = MAX(0, COALESCE(ads_karma, 100) + 5) WHERE id=?").run(ctx.plannerUserId);
      } catch (_) {}
      res.json({ ok: true, karma_delta: 5 });
    } catch (e) { res.status(500).json({ ok: false, reason: e.message }); }
  });
  router.use('/api/ads', createAdsWebRouter(config, storage, requireAuth, bot));
  router.use('/api/shortener', createShortenerRouter(config, storage, requireAuth));
  router.use('/api/bio', createBioRouter(config, storage, requireAuth));
  router.use('/api/cryptomus', createCryptomusRouter(config, storage, requireAuth));
  router.use('/api/withdrawals', createWithdrawalsRouter(config, storage, requireAuth, requireAdmin));
  router.use('/api/ad-center', createAdCenterRouter(config, storage, requireAuth));
  router.use('/api/roboai', createRoboaiRouter(config, storage, requireAuth));
  router.use('/api/products', createProductsRouter(config, storage, requireAuth));
  router.use('/api/platega', createPlategaRouter(config, storage, requireAuth));
  router.use('/webhooks/platega', createPlategaWebhookRouter());
  // [trdx-exchange-2026-05-14] mount the P2P TRDX/USD exchange sub-router
  try {
    const dbModule = require('./planner/db/database');
    const trdxRouter = createTrdxExchangeRoutes({ storage, callGoldenConnectApi, requireAuth, dbModule });
    router.use(trdxRouter);
  } catch (e) { console.error('[trdx-exchange-mount]', e && e.message); }

  // [partners-2026-05-16] mount /api/partners proxy → goldenConnect-api internal endpoints
  try {
    const partnersRouter = createPartnersRouter({ storage, callGoldenConnectApi, requireAuth });
    router.use(partnersRouter);
  } catch (e) { console.error('[partners-mount]', e && e.message); }

  return router;
}

module.exports = { createWebRouter };
