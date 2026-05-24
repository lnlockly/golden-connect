// Golden Connect Group Intelligence — умный бот в групповом чате @GOLDEN_CONNECT_AD.
//
// Покрывает фазы:
//   А — Membership tracking (join/leave/welcome)
//   Б — Activity tracking (count + last active)
//   В — Уведомления о событиях в группу (cron из postgres events)
//   Г — AI-ответы при mention/reply бота
//   Д — Daily/Weekly digest в группу
//   Е — Антиспам + /warn /mute /ban
//   Ж — CRM связка с web_users
//   З — Cross-context (личка↔группа), drip onboarding после group join

const { InlineKeyboard } = require('grammy');
const { isSilenced: _gsIsSilenced } = require('./group-silence');
const { getBalance } = require('../services/balance-bridge');
const https = require('https');
// ---- Karma proxy: api /internal/karma/award (fire-and-forget) ----
function awardKarmaApi(plannerUserId, kind, sourceId, memo) {
  const apiBase = process.env.GOLDEN_CONNECT_API_INTERNAL_URL || 'http://goldenConnect-api:4001';
  const apiSecret = process.env.GOLDEN_CONNECT_API_INTERNAL_SECRET;
  if (!apiSecret || !plannerUserId) return;
  const rawDb = require('../planner/db/database').getDb();
  let tgId = null;
  try {
    const u = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(plannerUserId);
    if (u && u.tg_id) tgId = u.tg_id;
  } catch (_) {}
  if (!tgId) return;
  const email = 'tg' + Math.abs(tgId) + '@goldenConnect.bot';
  const data = JSON.stringify({ email: email, kind: kind, source_id: sourceId || null, memo: memo || null });
  const httpMod = apiBase.startsWith('https') ? require('https') : require('http');
  try {
    const url = new URL(apiBase + '/internal/karma/award');
    const req = httpMod.request({
      method: 'POST', hostname: url.hostname,
      port: url.port || (apiBase.startsWith('https') ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'x-goldenConnect-secret': apiSecret,
      },
      timeout: 5000,
    }, function (res) { res.resume(); });
    req.on('error', function () {});
    req.on('timeout', function () { req.destroy(); });
    req.write(data); req.end();
  } catch (e) {}
}

const db = require('../planner/db/database');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const TEXT_MODEL = 'llama-3.3-70b-versatile';

const FLOOD_LIMIT = 10;            // 10 msg / minute → flood
const FLOOD_WINDOW_MS = 60_000;
const WARNS_TO_MUTE = 3;
const MUTE_DURATION_SEC = 3600;    // 1 hour default mute

const floodTracker = new Map();    // chatId:userId -> [timestamps]

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtUsd(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }
function pad(n) { return String(n).padStart(2, '0'); }

// ============================================================================
// SCHEMA
// ============================================================================
function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS group_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      tg_user_id INTEGER NOT NULL,
      tg_username TEXT, first_name TEXT, last_name TEXT,
      language_code TEXT, is_premium INTEGER DEFAULT 0,
      status TEXT,                   -- 'member'|'left'|'kicked'|'admin'|'creator'|'restricted'
      joined_at DATETIME, left_at DATETIME,
      invited_by_tg_id INTEGER,
      web_user_id INTEGER,           -- link to cabinet webUsers
      tariff_code TEXT,
      goldenConnect_status TEXT,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(chat_id, tg_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_gm_chat ON group_members(chat_id, status);
    CREATE INDEX IF NOT EXISTS idx_gm_user ON group_members(tg_user_id);

    CREATE TABLE IF NOT EXISTS group_activity (
      chat_id INTEGER NOT NULL,
      tg_user_id INTEGER NOT NULL,
      msg_count_total INTEGER DEFAULT 0,
      msg_count_today INTEGER DEFAULT 0,
      msg_count_week INTEGER DEFAULT 0,
      last_msg_at DATETIME,
      last_msg_text TEXT,
      activity_day TEXT,    -- last day we counted today (YYYY-MM-DD)
      activity_week TEXT,   -- last ISO week we counted week (YYYY-Www)
      reactions_received INTEGER DEFAULT 0,
      mentions_received INTEGER DEFAULT 0,
      PRIMARY KEY (chat_id, tg_user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_ga_last ON group_activity(chat_id, last_msg_at);

    CREATE TABLE IF NOT EXISTS group_event_subs (
      chat_id INTEGER PRIMARY KEY,
      subscribed_by_tg_id INTEGER,
      notify_24h INTEGER DEFAULT 0,
      notify_1h INTEGER DEFAULT 0,
      notify_start INTEGER DEFAULT 1,
      pin_messages INTEGER DEFAULT 0,
      welcome_enabled INTEGER DEFAULT 1,
      welcome_text TEXT,
      ai_mention_enabled INTEGER DEFAULT 1,
      antispam_enabled INTEGER DEFAULT 1,
      digest_morning INTEGER DEFAULT 0,
      digest_evening INTEGER DEFAULT 0,
      digest_weekly INTEGER DEFAULT 0,
      subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      announced_event_ids TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS group_warnings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      tg_user_id INTEGER NOT NULL,
      issued_by_tg_id INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_gw_user ON group_warnings(chat_id, tg_user_id);

    CREATE TABLE IF NOT EXISTS group_admin_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      action TEXT,                   -- warn|mute|unmute|ban|unban|antispam_block
      target_tg_id INTEGER,
      issuer_tg_id INTEGER,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cross_context_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tg_user_id INTEGER NOT NULL,
      chat_id INTEGER,
      event_type TEXT,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS group_drip_progress (
      tg_user_id INTEGER NOT NULL,
      chat_id INTEGER NOT NULL,
      step INTEGER NOT NULL,         -- 1=1h, 2=24h, 3=72h
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tg_user_id, chat_id, step)
    );

    CREATE TABLE IF NOT EXISTS kv_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // One-time migration v1: silence chat noise for existing subs
  try {
    const flagRow = rawDb.prepare("SELECT value FROM kv_state WHERE key = 'gi_quiet_migration_v1'").get();
    if (!flagRow) {
      rawDb.prepare("UPDATE group_event_subs SET notify_24h = 0, notify_1h = 0, digest_weekly = 0").run();
      rawDb.prepare("INSERT OR REPLACE INTO kv_state (key, value) VALUES ('gi_quiet_migration_v1', ?)").run(String(Date.now()));
      console.log('[group-intel] one-time migration: quieted chat notifs for existing groups');
    }
  } catch (e) { console.warn('[group-intel] quiet migration skipped:', e.message); }
}

// ============================================================================
// CRM связка: подтянуть web_user данные по tg_user_id
// ============================================================================
function getWebUserDataByTgId(tgId, storage) {
  try {
    if (!storage || !storage.findWebUserByTelegramId) return null;
    const wu = storage.findWebUserByTelegramId(tgId);
    if (!wu) return null;
    let stats = null;
    try { stats = storage.getTeamStats ? storage.getTeamStats(wu.id) : null; } catch (e) {}
    return { wu, stats };
  } catch (e) { return null; }
}

async function getPlatformDataByTgId(tgId) {
  try {
    // Phase H: balances from api Postgres; id still from planner for compat
    const rawDb = db.getDb();
    const local = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(tgId);
    if (!local) return null;
    const bal = await getBalance({ tgId });
    return {
      id: local.id,
      gift_balance_cents: bal.gift_cents,
      earned_balance_cents: bal.working_cents,
      ads_karma: bal.karma,
    };
  } catch (e) { return null; }
}

async function getUnifiedUserCard(tgUserId, chatId, storage) {
  const rawDb = db.getDb();
  const member = rawDb.prepare(
    'SELECT * FROM group_members WHERE tg_user_id = ? AND chat_id = ?'
  ).get(tgUserId, chatId);
  const activity = rawDb.prepare(
    'SELECT * FROM group_activity WHERE tg_user_id = ? AND chat_id = ?'
  ).get(tgUserId, chatId);
  const platform = await getPlatformDataByTgId(tgUserId);
  const web = getWebUserDataByTgId(tgUserId, storage);
  return { member, activity, platform, web };
}

// ============================================================================
// LISTENERS — chat_member, message middleware, mention reply
// ============================================================================
function setupGroupIntel(bot, storage, config) {
  ensureSchema();

  // ── chat_member: join/leave/promote tracking ──────────────────────────────
  bot.on('chat_member', async (ctx) => {
    try {
      const upd = ctx.chatMember || ctx.update?.chat_member;
      if (!upd) return;
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
      if (!isGroup) return;
      const newM = upd.new_chat_member;
      const oldM = upd.old_chat_member;
      const subj = newM?.user;
      if (!subj) return;
      const newStatus = newM.status;
      const oldStatus = oldM?.status;
      const inviterId = upd.from?.id;

      const rawDb = db.getDb();
      const wuData = getWebUserDataByTgId(subj.id, storage);
      const platform = await getPlatformDataByTgId(subj.id);

      rawDb.prepare(`
        INSERT INTO group_members
          (chat_id, tg_user_id, tg_username, first_name, last_name, language_code, is_premium,
           status, joined_at, web_user_id, invited_by_tg_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')), ?, ?)
        ON CONFLICT(chat_id, tg_user_id) DO UPDATE SET
          tg_username = excluded.tg_username,
          first_name = excluded.first_name,
          last_name = excluded.last_name,
          language_code = excluded.language_code,
          is_premium = excluded.is_premium,
          status = excluded.status,
          web_user_id = COALESCE(excluded.web_user_id, group_members.web_user_id),
          left_at = CASE WHEN excluded.status IN ('left','kicked') THEN datetime('now') ELSE NULL END
      `).run(
        ctx.chat.id, subj.id, subj.username || null, subj.first_name || null, subj.last_name || null,
        subj.language_code || null, subj.is_premium ? 1 : 0,
        newStatus,
        ['member','administrator','creator'].includes(newStatus) ? new Date().toISOString() : null,
        wuData?.wu?.id || null,
        inviterId !== subj.id ? inviterId : null
      );

      // Cross-context log
      rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, chat_id, event_type, payload) VALUES (?, ?, ?, ?)")
        .run(subj.id, ctx.chat.id, 'chat_member_' + newStatus, JSON.stringify({ from: oldStatus, to: newStatus }));

      const wasJoin = ['left', 'kicked', undefined].includes(oldStatus) && ['member','administrator','creator'].includes(newStatus);
      const wasLeave = ['member','administrator','creator'].includes(oldStatus) && ['left','kicked'].includes(newStatus);

      if (wasJoin) {
        await onMemberJoined(ctx, subj, storage, config, wuData, platform);
      } else if (wasLeave) {
        await onMemberLeft(ctx, subj);
      }
    } catch (e) { console.error('[group-intel chat_member]', e && e.message); }
  });

  // ── message middleware: activity tracking + flood detect + mention handler ──
  bot.use(async (ctx, next) => {
    try {
      const m = ctx.message;
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
      if (isGroup && m && ctx.from) {
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const week = isoWeek(now);
        const text = m.text || m.caption || '';

        // 1. Activity counter
        try {
          const rawDb = db.getDb();
          rawDb.prepare(`
            INSERT INTO group_activity
              (chat_id, tg_user_id, msg_count_total, msg_count_today, msg_count_week,
               last_msg_at, last_msg_text, activity_day, activity_week)
            VALUES (?, ?, 1, 1, 1, datetime('now'), ?, ?, ?)
            ON CONFLICT(chat_id, tg_user_id) DO UPDATE SET
              msg_count_total = msg_count_total + 1,
              msg_count_today = CASE WHEN activity_day = excluded.activity_day THEN msg_count_today + 1 ELSE 1 END,
              msg_count_week  = CASE WHEN activity_week = excluded.activity_week THEN msg_count_week + 1 ELSE 1 END,
              last_msg_at = datetime('now'),
              last_msg_text = excluded.last_msg_text,
              activity_day = excluded.activity_day,
              activity_week = excluded.activity_week
          `).run(ctx.chat.id, ctx.from.id, text.slice(0, 200), today, week);
          // Karma: 1 chat_message per day (server-side cap + anti-farm)
          // Rules: >=30 chars, >=5 unique words, no recent duplicate (24h), interval >=10 min
          if (text && text.length >= 30) {
            try {
              const words = text.toLowerCase().match(/\b\w+\b/g) || [];
              const uniqueWords = new Set(words);
              if (uniqueWords.size < 5) throw new Error('too few unique words');

              // Hash check - refuse duplicates within 24h
              const crypto = require('crypto');
              const hash = crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex').slice(0, 16);
              const dup = rawDb.prepare(`SELECT 1 FROM group_msg_hashes WHERE tg_user_id=? AND hash=? AND created_at > datetime('now','-1 day') LIMIT 1`).get(ctx.from.id, hash);
              if (dup) throw new Error('duplicate within 24h');

              // Min interval 10 min
              const recent = rawDb.prepare(`SELECT 1 FROM group_msg_hashes WHERE tg_user_id=? AND created_at > datetime('now','-10 minutes') LIMIT 1`).get(ctx.from.id);
              if (recent) throw new Error('too soon');

              rawDb.prepare(`INSERT INTO group_msg_hashes (tg_user_id, hash, created_at) VALUES (?, ?, datetime('now'))`).run(ctx.from.id, hash);
              const u = rawDb.prepare('SELECT id FROM users WHERE tg_id = ?').get(ctx.from.id);
              if (u && u.id) awardKarmaApi(u.id, 'chat_message', null, 'chat:' + ctx.chat.id);
            } catch (_) {}
          }
        } catch (e) {}

        // Backfill member entry if missing (user was already in chat before bot joined)
        try {
          const rawDb = db.getDb();
          const exists = rawDb.prepare('SELECT 1 FROM group_members WHERE chat_id = ? AND tg_user_id = ?').get(ctx.chat.id, ctx.from.id);
          if (!exists) {
            const wuData = getWebUserDataByTgId(ctx.from.id, storage);
            rawDb.prepare(`
              INSERT INTO group_members (chat_id, tg_user_id, tg_username, first_name, last_name, language_code, is_premium, status, joined_at, web_user_id)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'member', datetime('now'), ?)
            `).run(
              ctx.chat.id, ctx.from.id, ctx.from.username || null, ctx.from.first_name || null, ctx.from.last_name || null,
              ctx.from.language_code || null, ctx.from.is_premium ? 1 : 0, wuData?.wu?.id || null
            );
          }
        } catch (e) {}

        // 2. Anti-flood
        const sub = getSub(ctx.chat.id);
        if (sub?.antispam_enabled) {
          const key = ctx.chat.id + ':' + ctx.from.id;
          const arr = (floodTracker.get(key) || []).filter(t => Date.now() - t < FLOOD_WINDOW_MS);
          arr.push(Date.now());
          floodTracker.set(key, arr);
          if (arr.length > FLOOD_LIMIT) {
            // Auto-warn for flood
            await issueWarning(ctx, ctx.from.id, null, 'flood/spam', bot);
            floodTracker.delete(key);
          }
        }

        // 3. AI mention reply — silenced groups skip /* [silenced-skip-mention] */
        if (_gsIsSilenced(ctx.chat.id)) { return next(); }
        const me = ctx.me?.username;
        const mentioned = me && (text.includes('@' + me) || (m.reply_to_message?.from?.username === me));
        if (mentioned && sub?.ai_mention_enabled) {
          await handleAiMention(ctx, text, storage);
        } else if (sub?.ai_mention_enabled) {
          // Lead detection passively
          const leadScore = detectLeadIntent(text);
          if (leadScore >= 70 && !ctx.from.is_bot) {
            await onLeadDetected(ctx, leadScore, storage, config);
          }
        }
      }
    } catch (e) { console.error('[group-intel mw]', e && e.message); }
    return next();
  });

  registerCommands(bot, storage, config);
  console.log('[group-intel] all listeners + commands registered');
}

function isoWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return date.getUTCFullYear() + '-W' + pad(wk);
}

function getSub(chatId) {
  try {
    return db.getDb().prepare('SELECT * FROM group_event_subs WHERE chat_id = ?').get(chatId);
  } catch (e) { return null; }
}

// ============================================================================
// ON-MEMBER-JOIN: smart welcome + cross-context drip
// ============================================================================
async function onMemberJoined(ctx, user, storage, config, wuData, platform) {
  const sub = getSub(ctx.chat.id);
  if (!sub?.welcome_enabled && !sub) {
    // Auto-enable welcome on first join after bot subscribed (or always for goldenConnect chat)
  }
  const name = (user.first_name || 'Гость') + (user.username ? ' @' + user.username : '');

  // Build personalized welcome
  let lines;
  if (wuData?.wu) {
    const wu = wuData.wu;
    const stats = wuData.stats;
    // [tariff-wire] fetch real tariff via tariff-gate.js (1-min cached)
    let tariffLine = '';
    try {
      const { checkActiveTariff } = require('../services/tariff-gate');
      const t = await checkActiveTariff({ id: wu.id, email: wu.email }, { config });
      if (t && t.ok && t.expires_at) {
        const exp = new Date(t.expires_at).toLocaleDateString('ru-RU');
        tariffLine = `· тариф <b>${String(t.tariff || '').toUpperCase()}</b> до ${exp}`;
      } else if (t && t.tariff && t.tariff !== 'free') {
        tariffLine = `· тариф <b>${String(t.tariff).toUpperCase()}</b> (нужно продлить)`;
      }
    } catch (_) {}
    const refsLine = stats?.total ? `· ${stats.total} рефералов` : '';
    lines = [
      `👋 <b>${escapeHtml(name)}</b>, добро пожаловать!`,
      `Уже знаком с Golden Connect — статус: <b>${escapeHtml(wu.partner_status || 'PARTNER')}</b> ${refsLine} ${tariffLine}`,
      ``,
      `🎯 В чате обсуждаем рекламу, заработок и новости платформы.`,
    ];
  } else {
    lines = [
      `👋 Привет, <b>${escapeHtml(name)}</b>!`,
      ``,
      `Это чат партнёров Golden Connect — рекламной платформы с распределённой прибылью.`,
      `4 способа заработка: биржа заданий, реф-сеть, кампании, маркетплейс.`,
      ``,
      `🚀 Открой бота в личке — там познакомлю с системой за 2 минуты:`,
    ];
  }

  // Special: if invited via specific ref-link
  let invitedBy = null;
  if (wuData?.wu?.referredByUserId && storage.findWebUserById) {
    invitedBy = storage.findWebUserById(wuData.wu.referredByUserId);
  }
  if (invitedBy) {
    lines.push('');
    lines.push(`🎁 Тебя пригласил <b>${escapeHtml(invitedBy.displayName || 'партнёр')}</b>${invitedBy.telegramUsername ? ' @' + invitedBy.telegramUsername : ''}`);
    // Notify inviter in private
    if (invitedBy.telegramUserId) {
      try {
        await ctx.api.sendMessage(invitedBy.telegramUserId,
          `🎉 <b>Твой реферал ${escapeHtml(name)}</b> только что зашёл в чат @GOLDEN_CONNECT_AD!\n\n` +
          `💡 Поприветствуй его публично — это удерживает 30% новичков. Затем напиши в личку — у меня в кабинете найдёшь шаблоны.`,
          { parse_mode: 'HTML' });
      } catch (e) {}
    }
  }

  const kb = new InlineKeyboard();
  if (!wuData?.wu) {
    kb.url('🚀 Открыть бота в личке', `https://t.me/${ctx.me?.username || 'GoldenConnect_bizbot'}?start=hi_from_group`).row();
  }
  kb.text('💡 Что делать?', 'gi_help_new');

  // [ai-welcome-public] AI-generated welcome posted PUBLICLY in the group.
  // Each new member triggers a fresh Groq call → different services + different angle every time.
  // Visible to all chat members (including old ones) so each greeting is interesting.
  // Skip if the chat is silenced via /goldenConnect_silent.
  try {
    if (!_gsIsSilenced(ctx.chat.id)) {
      const { generateWelcome } = require('../services/ai-welcome');
      const welcomeText = await generateWelcome({
        name: user.first_name || (user.username ? '@' + user.username : 'друг'),
        isMember: !!(wuData && wuData.wu),
        lang: (user.language_code === 'en') ? 'en' : 'ru',
      });
      if (welcomeText) {
        // [ai-welcome-public-kb] Inline URL-buttons that deep-link to bot functions.
        // Same buttons for everyone — taps open private chat with the right /start payload.
        const _u = (ctx.me && ctx.me.username) || 'GoldenConnect_bizbot';
        const kb = new InlineKeyboard()
          .url('🚀 Открыть бота', `https://t.me/${_u}?start=hi`).row()
          .url('💰 Биржа заданий', `https://t.me/${_u}?start=jobs`)
          .url('💎 Genesis TRDX',  `https://t.me/${_u}?start=trdx`).row()
          .url('🚀 Тарифы',        `https://t.me/${_u}?start=tariffs`)
          .url('🤖 AI-Mentor',     `https://t.me/${_u}?start=mentor`);
        await ctx.reply(welcomeText, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: kb,
        });
      }
    }
  } catch (e) { console.warn('[ai-welcome-public]', e && e.message); }

  // Schedule cross-context drip in personal chat (1h, 24h, 72h)
  // Cron will pick this up via group_drip_progress table.
  // No action here — cron checks pending users.
}

async function onMemberLeft(ctx, user) {
  // Soft log only — no notification (people leave, don't shame them)
  const rawDb = db.getDb();
  rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, chat_id, event_type, payload) VALUES (?, ?, 'group_left', '')")
    .run(user.id, ctx.chat.id);
}

// ============================================================================
// AI MENTION HANDLER
// ============================================================================
const { buildCorePrompt } = require('../planner/bot/knowledge/core');

const SYS_GROUP_AI_INTRO = `Ты — Golden Connect AI ассистент @GOLDEN_CONNECT_AD в групповом чате партнёров.

ПРАВИЛА ОТВЕТА В ГРУППЕ:
- КРАТКО: 1-3 предложения, не больше 500 символов. Это групповой чат, длинные простыни никто не читает.
- На русском по умолчанию (если человек пишет на другом языке — отвечай на нём).
- Опирайся ТОЛЬКО на факты ниже (тарифы, проценты, бонусы). Не выдумывай цифры.
- Ссылайся на конкретные команды/разделы: «открой /ref», «зайди в /cabinet → Партнёрка».
- Если вопрос требует развёрнутого ответа — скажи «открой /cabinet#/ai_chat для подробностей» или «напиши боту в личку».
- Уважай контекст: если человек уже на ROCKET — не предлагай LAUNCH; если на FREE — не дави сразу на ROCKET.
- НЕ консультируй по здоровью, БАДам, лечению, медицине — мягко перенаправь.
- НЕ обещай гарантированный доход; показывай примеры из презы.
- Используй уважительный тон (на «ты»), без панибратства.`;

const SYS_GROUP_AI = SYS_GROUP_AI_INTRO + '\n\n' + buildCorePrompt();

async function handleAiMention(ctx, text, storage) {
  if (!GROQ_KEYS.length) return;
  // Strip @mention
  const me = ctx.me?.username;
  const cleanText = me ? text.replace('@' + me, '').trim() : text.trim();
  if (cleanText.length < 3) return; // just mention, no question

  // Get unified card for personalization
  const card = await getUnifiedUserCard(ctx.from.id, ctx.chat.id, storage);
  let userCtx = '';
  if (card.web?.wu) {
    const wu = card.web.wu;
    const refs = card.web.stats?.total || 0;
    const tariff = wu.active_tariff_code || wu.partner_status || 'FREE';
    const status = wu.partner_status || (refs >= 10 ? 'PARTNER' : '—');
    userCtx = `\n[КОНТЕКСТ СПРАШИВАЮЩЕГО: тариф=${tariff} · статус=${status} · рефералов=${refs}. Адаптируй совет под его уровень.]`;
  } else {
    userCtx = '\n[КОНТЕКСТ СПРАШИВАЮЩЕГО: ещё не зарегистрирован в кабинете — мягко предложи /start у бота.]';
  }

  try {
    const ans = await callGroqText(SYS_GROUP_AI + userCtx, cleanText);
    if (!ans) return;
    await ctx.reply(`@${ctx.from.username || ctx.from.first_name}, ${ans}`,
      { reply_to_message_id: ctx.message.message_id });
  } catch (e) {
    console.error('[group-intel mention]', e && e.message);
  }
}

function detectLeadIntent(text) {
  const t = String(text || '').toLowerCase();
  const triggers = [
    'хочу зарабатывать', 'как заработать', 'как купить', 'сколько платят', 'как платят',
    'хочу попробовать', 'как начать', 'купить тариф', 'хочу инвестировать', 'как стать партнёром',
    'как работает', 'регистрация', 'присоединиться'
  ];
  let score = 0;
  for (const tr of triggers) if (t.includes(tr)) score += 30;
  return Math.min(100, score);
}

async function onLeadDetected(ctx, score, storage, config) {
  // Just log + optional admin notify
  const rawDb = db.getDb();
  rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, chat_id, event_type, payload) VALUES (?, ?, 'lead_detected', ?)")
    .run(ctx.from.id, ctx.chat.id, JSON.stringify({ score, text: (ctx.message.text || '').slice(0, 200) }));

  // Optional: ping admins from ADMIN_TG_IDS env
  const admins = String(process.env.ADMIN_TG_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean);
  for (const adminId of admins) {
    try {
      await ctx.api.sendMessage(adminId,
        `🎯 <b>Lead в чате @${ctx.chat?.username || 'group'}</b>\n\n` +
        `От: <b>${escapeHtml(ctx.from.first_name || 'User')}</b>${ctx.from.username ? ' @' + ctx.from.username : ''}\n` +
        `Score: ${score}/100\n\n` +
        `<i>"${escapeHtml((ctx.message.text || '').slice(0, 300))}"</i>\n\n` +
        `Возьми в работу: напиши в личку`,
        { parse_mode: 'HTML', reply_markup: ctx.from.username
          ? new InlineKeyboard().url('💬 Написать', `https://t.me/${ctx.from.username}`)
          : undefined });
    } catch (e) {}
  }
}

// ============================================================================
// COMMANDS
// ============================================================================
function registerCommands(bot, storage, config) {

  // ── /sync_chat — manually sync admins to group_members table ──
  bot.command(['sync_chat', 'init_chat'], async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы могут синхронизировать чат.');
    const synced = await syncChatAdmins(ctx, storage);
    let memberCount = 0;
    try { memberCount = await ctx.api.getChatMemberCount(ctx.chat.id); } catch (e) {}
    await ctx.reply(
      '🔄 <b>Синхронизация чата</b>\n\n' +
      'Загружено админов: <b>' + synced + '</b>\n' +
      'Всего участников по данным TG: <b>' + memberCount + '</b>\n\n' +
      '<i>Обычные участники добавятся автоматически когда напишут первое сообщение.</i>\n\n' +
      '⚠️ Если бот в группе с privacy mode = ON, он НЕ видит обычные сообщения. Отключи privacy в @BotFather:\n' +
      '<code>/mybots → Bot Settings → Group Privacy → Turn off</code>',
      { parse_mode: 'HTML' }
    );
  });

  // ── /members — overview of chat ──
  bot.command('members', async (ctx) => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    if (!isGroup) return ctx.reply('💡 /members работает в группе.');
    const rawDb = db.getDb();
    const stats = rawDb.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status IN ('member','administrator','creator') THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status IN ('left','kicked') THEN 1 ELSE 0 END) AS gone,
        SUM(CASE WHEN web_user_id IS NOT NULL THEN 1 ELSE 0 END) AS linked
      FROM group_members WHERE chat_id = ?
    `).get(ctx.chat.id) || {};
    const onlineCnt = rawDb.prepare(
      "SELECT COUNT(DISTINCT tg_user_id) AS n FROM group_activity WHERE chat_id = ? AND last_msg_at >= datetime('now','-30 minutes')"
    ).get(ctx.chat.id)?.n || 0;
    const today = rawDb.prepare(
      "SELECT COUNT(*) AS n FROM group_members WHERE chat_id = ? AND status IN ('member','administrator','creator') AND date(joined_at) = date('now')"
    ).get(ctx.chat.id)?.n || 0;
    await ctx.reply(
      `👥 <b>Участники чата</b>\n\n` +
      `📊 Активных сейчас: <b>${stats.active || 0}</b>\n` +
      `📅 Зашли сегодня: <b>${today}</b>\n` +
      `🚪 Покинули чат: <b>${stats.gone || 0}</b>\n` +
      `💚 Онлайн (30 мин): <b>${onlineCnt}</b>\n` +
      `🔗 Связано с Golden Connect: <b>${stats.linked || 0}</b>\n\n` +
      `Команды: /joined_today /silent /active /who @user`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /joined_today, /joined_week ──
  bot.command(['joined_today', 'newcomers'], async (ctx) => {
    if (!isGroup(ctx)) return;
    return joinedReport(ctx, "date(joined_at) = date('now')", '🆕 <b>Новые участники сегодня</b>');
  });
  bot.command('joined_week', async (ctx) => {
    if (!isGroup(ctx)) return;
    return joinedReport(ctx, "joined_at >= datetime('now','-7 days')", '🆕 <b>Новые участники за неделю</b>');
  });

  function joinedReport(ctx, whereClause, title) {
    const rawDb = db.getDb();
    const rows = rawDb.prepare(`
      SELECT tg_user_id, tg_username, first_name, joined_at, web_user_id
      FROM group_members
      WHERE chat_id = ? AND status IN ('member','administrator','creator') AND ${whereClause}
      ORDER BY joined_at DESC LIMIT 30
    `).all(ctx.chat.id);
    if (!rows.length) return ctx.reply(`${title}\n\nПока никого новых.`, { parse_mode: 'HTML' });
    const lines = [title, ''];
    rows.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      const link = r.web_user_id ? ' · 🔗 партнёр' : '';
      lines.push(`${i+1}. <b>${escapeHtml(name)}</b>${link}`);
      lines.push(`   ${r.joined_at}`);
    });
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  }

  // ── /silent — те кто давно не писал ──
  bot.command('silent', async (ctx) => {
    if (!isGroup(ctx)) return;
    const rawDb = db.getDb();
    const rows = rawDb.prepare(`
      SELECT m.tg_user_id, m.tg_username, m.first_name, a.last_msg_at
      FROM group_members m
      LEFT JOIN group_activity a ON a.chat_id = m.chat_id AND a.tg_user_id = m.tg_user_id
      WHERE m.chat_id = ? AND m.status IN ('member','administrator','creator')
        AND (a.last_msg_at IS NULL OR a.last_msg_at < datetime('now','-7 days'))
      ORDER BY a.last_msg_at NULLS FIRST LIMIT 20
    `).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('🔇 Все участники активны за последнюю неделю.');
    const lines = ['🔇 <b>Не писали 7+ дней</b>', ''];
    rows.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      const last = r.last_msg_at || 'никогда';
      lines.push(`${i+1}. <b>${escapeHtml(name)}</b> · ${last}`);
    });
    lines.push('');
    lines.push('💡 Можно тегнуть их или написать в личку — реактивация даёт 25% возврата.');
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // ── /active — топ активных за неделю ──
  bot.command(['active', 'top_chat'], async (ctx) => {
    if (!isGroup(ctx)) return;
    const rawDb = db.getDb();
    const rows = rawDb.prepare(`
      SELECT a.tg_user_id, a.msg_count_week, m.tg_username, m.first_name
      FROM group_activity a
      JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id
      WHERE a.chat_id = ? AND a.msg_count_week > 0
      ORDER BY a.msg_count_week DESC LIMIT 10
    `).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('📊 Активности на этой неделе пока нет.');
    const lines = ['🏆 <b>Топ-10 активных за неделю</b>', ''];
    const medals = ['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.'];
    rows.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      lines.push(`${medals[i]} <b>${escapeHtml(name)}</b> — ${r.msg_count_week} сообщений`);
    });
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('active_today', async (ctx) => {
    if (!isGroup(ctx)) return;
    const rawDb = db.getDb();
    const rows = rawDb.prepare(`
      SELECT a.msg_count_today, m.tg_username, m.first_name
      FROM group_activity a JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id
      WHERE a.chat_id = ? AND a.msg_count_today > 0 AND a.activity_day = date('now')
      ORDER BY a.msg_count_today DESC LIMIT 10
    `).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('📊 Сегодня пока никто не писал.');
    const lines = ['🌟 <b>Активные сегодня</b>', ''];
    rows.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      lines.push(`${i+1}. <b>${escapeHtml(name)}</b> — ${r.msg_count_today}`);
    });
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('online', async (ctx) => {
    if (!isGroup(ctx)) return;
    const rawDb = db.getDb();
    const rows = rawDb.prepare(`
      SELECT m.first_name, m.tg_username, a.last_msg_at
      FROM group_activity a JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id
      WHERE a.chat_id = ? AND a.last_msg_at >= datetime('now','-30 minutes')
      ORDER BY a.last_msg_at DESC
    `).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('💚 Никто не писал за последние 30 минут.');
    const lines = [`💚 <b>Онлайн сейчас (${rows.length})</b>`, ''];
    rows.forEach(r => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      lines.push(`• <b>${escapeHtml(name)}</b>`);
    });
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // ── /who @username — карточка участника ──
  bot.command('who', async (ctx) => {
    if (!isGroup(ctx)) return;
    const arg = (ctx.match || '').trim().replace(/^@/, '');
    if (!arg) return ctx.reply('Формат: /who @username');
    const rawDb = db.getDb();
    const m = rawDb.prepare(
      'SELECT * FROM group_members WHERE chat_id = ? AND tg_username = ? COLLATE NOCASE LIMIT 1'
    ).get(ctx.chat.id, arg);
    if (!m) return ctx.reply('Не нашёл такого участника в нашей базе чата.');
    const card = await getUnifiedUserCard(m.tg_user_id, ctx.chat.id, storage);
    return ctx.reply(formatUserCard(card, ctx.chat.id), { parse_mode: 'HTML' });
  });

  // ── /events in group / subscribe ──
  bot.command('events', async (ctx) => {
    if (isGroup(ctx)) return ctx.reply('🔴 Список эфиров — открой в личке у бота: /events', {
      reply_markup: new InlineKeyboard().url('Открыть', `https://t.me/${ctx.me?.username || 'GoldenConnect_bizbot'}?start=events`)
    });
  });

  bot.command(['subscribe_events', 'sub_events'], async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы группы могут подписать чат.');
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO group_event_subs (chat_id, subscribed_by_tg_id, welcome_enabled, ai_mention_enabled, antispam_enabled)
      VALUES (?, ?, 1, 1, 1)
      ON CONFLICT(chat_id) DO UPDATE SET subscribed_at = datetime('now')
    `).run(ctx.chat.id, ctx.from.id);
    await ctx.reply(
      `✅ <b>Чат подписан на события Golden Connect</b>\n\n` +
      `Уведомления:\n` +
      `   ✅ За 24 часа до эфира\n` +
      `   ✅ За 1 час до эфира\n` +
      `   ✅ В момент старта\n\n` +
      `Также включено: welcome новичкам · AI-ответы при @упоминании · антиспам\n\n` +
      `Настройки: /event_settings`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command(['unsubscribe_events', 'unsub_events'], async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const rawDb = db.getDb();
    rawDb.prepare('DELETE FROM group_event_subs WHERE chat_id = ?').run(ctx.chat.id);
    await ctx.reply('🔕 Чат отписан от событий.');
  });

  bot.command('event_settings', async (ctx) => {
    if (!isGroup(ctx)) return;
    const sub = getSub(ctx.chat.id);
    if (!sub) return ctx.reply('Чат не подписан. /subscribe_events сначала.');
    const lines = [
      '⚙️ <b>Настройки группы</b>',
      '',
      `${sub.notify_24h ? '✅' : '❌'} Уведомления за 24 часа до эфира`,
      `${sub.notify_1h ? '✅' : '❌'} Уведомления за 1 час до эфира`,
      `${sub.notify_start ? '✅' : '❌'} В момент старта`,
      `${sub.welcome_enabled ? '✅' : '❌'} Welcome новичкам`,
      `${sub.ai_mention_enabled ? '✅' : '❌'} AI-ответы при @упоминании`,
      `${sub.antispam_enabled ? '✅' : '❌'} Антиспам / антифлуд`,
      `${sub.digest_morning ? '✅' : '❌'} Утренний digest 10:00 МСК`,
      `${sub.digest_evening ? '✅' : '❌'} Вечерний digest 21:00 МСК`,
      `${sub.digest_weekly ? '✅' : '❌'} Недельный digest (вс 20:00)`,
      '',
      'Переключатели: /toggle ai · /toggle antispam · /toggle morning · /toggle evening · /toggle weekly · /toggle welcome',
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('toggle', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const arg = (ctx.match || '').trim().toLowerCase();
    const map = {
      ai: 'ai_mention_enabled', antispam: 'antispam_enabled',
      morning: 'digest_morning', evening: 'digest_evening', weekly: 'digest_weekly',
      welcome: 'welcome_enabled',
    };
    const col = map[arg];
    if (!col) return ctx.reply('Доступно: /toggle ai|antispam|morning|evening|weekly|welcome');
    const rawDb = db.getDb();
    rawDb.prepare(
      `UPDATE group_event_subs SET ${col} = 1 - ${col} WHERE chat_id = ?`
    ).run(ctx.chat.id);
    const newVal = rawDb.prepare(`SELECT ${col} AS v FROM group_event_subs WHERE chat_id = ?`).get(ctx.chat.id)?.v;
    await ctx.reply(`${col}: ${newVal ? 'ВКЛ ✅' : 'ВЫКЛ ❌'}`);
  });

  // ── Moderation: /warn /mute /unmute /ban /unban ──
  bot.command('warn', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return ctx.reply('Используй /warn в reply на сообщение нарушителя.');
    const reason = (ctx.match || '').trim() || 'без указания причины';
    await issueWarning(ctx, replyTo.from.id, ctx.from.id, reason, bot);
  });

  bot.command('mute', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return ctx.reply('Используй /mute в reply.');
    const arg = (ctx.match || '').trim();
    let durSec = 3600; // default 1h
    const m = arg.match(/^(\d+)\s*(мин|min|m|ч|h|hour|час|часа|часов|d|дн)?/);
    if (m) {
      const n = parseInt(m[1], 10);
      const unit = (m[2] || 'мин').toLowerCase();
      if (unit.startsWith('м')) durSec = n * 60;
      else if (unit.startsWith('ч') || unit === 'h') durSec = n * 3600;
      else if (unit.startsWith('d') || unit.startsWith('дн')) durSec = n * 86400;
    }
    try {
      await ctx.api.restrictChatMember(ctx.chat.id, replyTo.from.id, {
        can_send_messages: false, can_send_media_messages: false, can_send_other_messages: false,
      }, { until_date: Math.floor(Date.now() / 1000) + durSec });
      logAdmin(ctx.chat.id, 'mute', replyTo.from.id, ctx.from.id, `${durSec}s`);
      await ctx.reply(`🔇 Замьючен на ${Math.round(durSec/60)} мин: ${replyTo.from.first_name}`);
    } catch (e) { await ctx.reply('❌ Не получилось: ' + e.message); }
  });

  bot.command('unmute', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return ctx.reply('Reply на пользователя.');
    try {
      await ctx.api.restrictChatMember(ctx.chat.id, replyTo.from.id, {
        can_send_messages: true, can_send_media_messages: true, can_send_other_messages: true,
        can_add_web_page_previews: true,
      });
      logAdmin(ctx.chat.id, 'unmute', replyTo.from.id, ctx.from.id, '');
      await ctx.reply('🔊 Размьючен.');
    } catch (e) { await ctx.reply('❌ ' + e.message); }
  });

  bot.command('ban', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return ctx.reply('Reply на пользователя.');
    try {
      await ctx.api.banChatMember(ctx.chat.id, replyTo.from.id);
      logAdmin(ctx.chat.id, 'ban', replyTo.from.id, ctx.from.id, (ctx.match || '').trim());
      await ctx.reply(`🔨 Забанен: ${replyTo.from.first_name}`);
    } catch (e) { await ctx.reply('❌ ' + e.message); }
  });

  bot.command('unban', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const replyTo = ctx.message?.reply_to_message;
    if (!replyTo?.from) return ctx.reply('Reply на пользователя.');
    try {
      await ctx.api.unbanChatMember(ctx.chat.id, replyTo.from.id);
      logAdmin(ctx.chat.id, 'unban', replyTo.from.id, ctx.from.id, '');
      await ctx.reply('✅ Разбанен.');
    } catch (e) { await ctx.reply('❌ ' + e.message); }
  });

  bot.command('admin_log', async (ctx) => {
    if (!isGroup(ctx)) return;
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админы.');
    const rawDb = db.getDb();
    const rows = rawDb.prepare(
      'SELECT * FROM group_admin_log WHERE chat_id = ? ORDER BY id DESC LIMIT 20'
    ).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('📋 Лог модерации пуст.');
    const lines = ['📋 <b>Лог модерации</b>', ''];
    rows.forEach(r => {
      lines.push(`<b>${r.action}</b> · target tg:${r.target_tg_id} · by tg:${r.issuer_tg_id} · ${r.created_at}`);
      if (r.reason) lines.push(`   <i>${escapeHtml(r.reason)}</i>`);
    });
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // Inline callback for help-new — silent in groups (bot is invisible there) /* [no-gi-help-new] */
  // [admin-help] Admin-only command list reveal in group
  bot.command('goldenConnect_help', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') return; // private uses bot menu
    if (!await isChatAdmin(ctx)) return; // silent for non-admins
    const lines = [
      '🛠 <b>Команды бота Golden Connect</b> (только админ может видеть)',
      '',
      '<b>В личке</b>:',
      '• /tariffs — тарифы LAUNCH/BOOST/ROCKET',
      '• /jobs — биржа заданий ($0.05+ за 5 мин)',
      '• /balance — мой баланс',
      '• /ref — реферальная ссылка',
      '• /me — моя сводка',
      '• /trdx — мой Genesis TRDX баланс',
      '• /menu — главное меню',
      '',
      '<b>В группе (для админов)</b>:',
      '• /goldenConnect_active — включить полный режим',
      '• /goldenConnect_silent — тихий режим (трекер + анонсы)',
      '• /goldenConnect_status — текущий режим',
      '• /goldenConnect_help — этот справочник',
      '• /members /quiet /active7d /who @user — статистика',
    ];
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

    bot.callbackQuery('gi_help_new', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch {}
    // Send DM-only deep-link via answerCallbackQuery url? grammY does not support url here for callback.
    // Instead just answer with a toast and do nothing public.
    try { await ctx.answerCallbackQuery({ text: 'Открой бота в личке: t.me/' + (ctx.me?.username || 'GoldenConnect_bizbot'), show_alert: false }); } catch {}
  });
}

function isGroup(ctx) {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

async function isChatAdmin(ctx) {
  try {
    const m = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return ['administrator', 'creator'].includes(m.status);
  } catch (e) { return false; }
}

async function syncChatAdmins(ctx, storage) {
  try {
    const admins = await ctx.api.getChatAdministrators(ctx.chat.id);
    const rawDb = db.getDb();
    let count = 0;
    for (const a of admins) {
      const u = a.user;
      if (!u || u.is_bot) continue;
      const wuData = getWebUserDataByTgId(u.id, storage);
      rawDb.prepare(
        "INSERT INTO group_members (chat_id, tg_user_id, tg_username, first_name, last_name, language_code, is_premium, status, joined_at, web_user_id) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?) " +
        "ON CONFLICT(chat_id, tg_user_id) DO UPDATE SET " +
        "tg_username = excluded.tg_username, " +
        "first_name = excluded.first_name, " +
        "status = excluded.status, " +
        "web_user_id = COALESCE(excluded.web_user_id, group_members.web_user_id)"
      ).run(ctx.chat.id, u.id, u.username || null, u.first_name || null, u.last_name || null, u.language_code || null, u.is_premium ? 1 : 0, a.status, wuData && wuData.wu && wuData.wu.id || null);
      count++;
    }
    return count;
  } catch (e) {
    console.error('[group-intel sync]', e.message);
    return 0;
  }
}

function logAdmin(chatId, action, targetId, issuerId, reason) {
  try {
    db.getDb().prepare(
      'INSERT INTO group_admin_log (chat_id, action, target_tg_id, issuer_tg_id, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(chatId, action, targetId, issuerId, reason || '');
  } catch (e) {}
}

async function issueWarning(ctx, targetTgId, issuerTgId, reason, bot) {
  const rawDb = db.getDb();
  rawDb.prepare(
    "INSERT INTO group_warnings (chat_id, tg_user_id, issued_by_tg_id, reason, expires_at) VALUES (?, ?, ?, ?, datetime('now','+30 days'))"
  ).run(ctx.chat.id, targetTgId, issuerTgId || null, reason || '');
  logAdmin(ctx.chat.id, 'warn', targetTgId, issuerTgId, reason);

  // Count active warnings
  const cnt = rawDb.prepare(
    "SELECT COUNT(*) AS n FROM group_warnings WHERE chat_id = ? AND tg_user_id = ? AND expires_at > datetime('now')"
  ).get(ctx.chat.id, targetTgId)?.n || 1;

  await ctx.reply(`⚠️ Предупреждение #${cnt}/${WARNS_TO_MUTE}: ${reason}`);

  if (cnt >= WARNS_TO_MUTE) {
    try {
      await ctx.api.restrictChatMember(ctx.chat.id, targetTgId, {
        can_send_messages: false,
      }, { until_date: Math.floor(Date.now() / 1000) + MUTE_DURATION_SEC });
      logAdmin(ctx.chat.id, 'mute_auto', targetTgId, null, '3 warnings');
      await ctx.reply(`🔇 Авто-мут на ${MUTE_DURATION_SEC / 60} мин (${WARNS_TO_MUTE} предупреждения).`);
    } catch (e) {}
  }
}

// ============================================================================
// USER CARD FORMATTING
// ============================================================================
function formatUserCard(card, chatId) {
  const m = card.member;
  const a = card.activity;
  const p = card.platform;
  const wu = card.web?.wu;
  const ts = card.web?.stats;

  const name = (m?.first_name || 'User') + (m?.tg_username ? ' @' + m.tg_username : '');
  const lines = [`👤 <b>${escapeHtml(name)}</b>`];

  if (m?.joined_at) lines.push(`⏰ В чате с ${m.joined_at.slice(0, 10)}`);
  if (a?.last_msg_at) {
    const mins = Math.floor((Date.now() - new Date(a.last_msg_at).getTime()) / 60000);
    const lbl = mins < 60 ? mins + ' мин назад' : mins < 1440 ? Math.floor(mins/60) + ' ч назад' : Math.floor(mins/1440) + ' дн назад';
    lines.push(`📊 ${a.msg_count_total || 0} сообщений всего · последнее ${lbl}`);
    lines.push(`   за неделю: ${a.msg_count_week || 0} · сегодня: ${a.msg_count_today || 0}`);
  }

  if (wu) {
    lines.push('');
    lines.push(`📡 <b>Golden Connect профиль</b>`);
    lines.push(`   💎 Статус: ${escapeHtml(wu.partner_status || 'FREE')}`);
    if (ts) {
      lines.push(`   👥 Рефералов: <b>${ts.total || 0}</b>${ts.engaged ? ` · 🔥 активных ${ts.engaged}` : ''}`);
    }
    if (wu.referredByUserId) lines.push(`   🔗 Реферер: id ${wu.referredByUserId}`);
  }

  if (p) {
    lines.push('');
    lines.push(`💰 Заработано: <b>${fmtUsd(p.earned_balance_cents)}</b> · Gift: <b>${fmtUsd(p.gift_balance_cents)}</b> · Карма ${p.ads_karma || 100}`);
  }

  return lines.join('\n');
}

// ============================================================================
// CRON: events to groups + digests + drip + weekly bonus
// ============================================================================
function startGroupIntelCrons(bot, storage, config) {
  // 1. Event notifications to groups (check every 5 min)
  setInterval(async () => { try { await broadcastEventsToGroups(bot, config); } catch (e) { console.error('[gi events cron]', e.message); } }, 5 * 60_000);

  // 2. Daily digest morning (10:00 MSK) + evening (21:00 MSK) — checked every minute
  let lastMorning = '';
  let lastEvening = '';
  let lastWeekly = '';
  setInterval(async () => {
    try {
      const now = new Date();
      const local = new Date(now.getTime() + 3 * 3600_000); // MSK
      const hour = local.getUTCHours();
      const min = local.getUTCMinutes();
      const dow = local.getUTCDay(); // 0 = Sun
      const dayKey = local.toISOString().slice(0, 10);
      const weekKey = local.toISOString().slice(0, 10) + '-W';

      if (hour === 10 && min < 5 && lastMorning !== dayKey) {
        lastMorning = dayKey;
        await sendGroupDigests(bot, 'morning');
      }
      if (hour === 21 && min < 5 && lastEvening !== dayKey) {
        lastEvening = dayKey;
        await sendGroupDigests(bot, 'evening');
      }
      // Weekly digest Sunday 20:00 MSK
      if (dow === 0 && hour === 20 && min < 5 && lastWeekly !== weekKey) {
        lastWeekly = weekKey;
        await sendGroupDigests(bot, 'weekly');
      }
    } catch (e) { console.error('[gi digest cron]', e.message); }
  }, 60_000);

  // 3. Cross-context drip in personal chat (1h, 24h, 72h after group join)
  setInterval(async () => { try { await runCrossContextDrip(bot); } catch (e) { console.error('[gi drip cron]', e.message); } }, 5 * 60_000);

  // 4. Weekly activity bonus (top-3 of each chat get $1 in gift)
  let lastBonusWeek = '';
  setInterval(async () => {
    try {
      const now = new Date();
      const local = new Date(now.getTime() + 3 * 3600_000);
      const dow = local.getUTCDay(); const hour = local.getUTCHours();
      const wk = isoWeek(local);
      if (dow === 1 && hour === 0 && lastBonusWeek !== wk) {
        lastBonusWeek = wk;
        // Bonus removed 2026-04-29; function is now no-op for rewards but still
        // resets msg_count_week counters per chat.
        await awardWeeklyActivityBonus(bot);
      }
    } catch (e) { console.error('[gi bonus cron]', e.message); }
  }, 60_000);

  // 5. Reset daily counters at midnight MSK
  let lastResetDay = '';
  setInterval(async () => {
    try {
      const now = new Date();
      const local = new Date(now.getTime() + 3 * 3600_000);
      const hour = local.getUTCHours();
      const dayKey = local.toISOString().slice(0, 10);
      if (hour === 0 && lastResetDay !== dayKey) {
        lastResetDay = dayKey;
        const rawDb = db.getDb();
        rawDb.prepare("UPDATE group_activity SET msg_count_today = 0 WHERE activity_day != ?").run(dayKey);
        rawDb.prepare("DELETE FROM group_warnings WHERE expires_at < datetime('now')").run();
      }
    } catch (e) {}
  }, 60_000);

  console.log('[group-intel] crons started: events + digests + drip + weekly bonus + reset');
}

// ── EVENTS broadcast to groups ──
async function broadcastEventsToGroups(bot, config) {
  // Fetch upcoming events from API postgres via internal call
  const apiBase = String(config?.goldenConnectApiBaseUrl || 'https://api.goldenConnect.to').replace(/\/+$/, '');
  const secret = String(config?.goldenConnectApiInternalSecret || '');
  if (!secret) return;

  let events = [];
  try {
    const r = await fetch(apiBase + '/internal/events/upcoming?within_hours=48', {
      headers: { 'x-goldenConnect-secret': secret }
    });
    if (r.ok) events = (await r.json()).events || [];
  } catch (e) {
    // Fallback: skip (events module may not have this endpoint)
    return;
  }

  if (!events.length) return;

  const rawDb = db.getDb();
  const subs = rawDb.prepare('SELECT * FROM group_event_subs WHERE notify_24h = 1 OR notify_1h = 1 OR notify_start = 1').all();

  for (const sub of subs) {
    let announced = [];
    try { announced = JSON.parse(sub.announced_event_ids || '[]'); } catch {}
    for (const ev of events) {
      const evTime = new Date(ev.starts_at).getTime();
      const minutesUntil = Math.floor((evTime - Date.now()) / 60_000);
      let phase = null;
      if (minutesUntil > 1440 && minutesUntil < 1500 && sub.notify_24h) phase = '24h';
      else if (minutesUntil > 60 && minutesUntil < 75 && sub.notify_1h) phase = '1h';
      else if (minutesUntil > -10 && minutesUntil < 5 && sub.notify_start) phase = 'start';
      if (!phase) continue;

      const tag = ev.id + ':' + phase;
      if (announced.includes(tag)) continue;

      const phaseEmoji = phase === 'start' ? '🔴 НАЧИНАЕТСЯ' : phase === '1h' ? '⏰ Через 1 час' : '📅 Завтра';
      const text = `${phaseEmoji}\n\n🔴 <b>${escapeHtml(ev.title)}</b>\n\n${escapeHtml((ev.description || '').slice(0, 400))}` +
                   (ev.url ? `\n\n🔗 ${ev.url}` : '');
      try {
        if (_gsIsSilenced(sub.chat_id)) { console.log('[group-intel] events: chat', sub.chat_id, 'is silenced — skip'); continue; } const sent = await bot.api.sendMessage(sub.chat_id, text, { parse_mode: 'HTML' });
        if (sub.pin_messages && phase === 'start') {
          try { await bot.api.pinChatMessage(sub.chat_id, sent.message_id); } catch {}
        }
        announced.push(tag);
      } catch (e) {}
    }
    rawDb.prepare('UPDATE group_event_subs SET announced_event_ids = ? WHERE chat_id = ?')
      .run(JSON.stringify(announced.slice(-50)), sub.chat_id);
  }
}

// ── DIGESTS to groups ──
async function sendGroupDigests(bot, kind) {
  const rawDb = db.getDb();
  const col = kind === 'morning' ? 'digest_morning' : kind === 'evening' ? 'digest_evening' : 'digest_weekly';
  const subs = rawDb.prepare(`SELECT chat_id FROM group_event_subs WHERE ${col} = 1`).all();
  for (const s of subs) {
    let text;
    try {
      if (kind === 'morning') text = await buildMorningDigest(s.chat_id);
      else if (kind === 'evening') text = await buildEveningDigest(s.chat_id);
      else text = await buildWeeklyDigest(s.chat_id);
      if (text && !_gsIsSilenced(s.chat_id)) await bot.api.sendMessage(s.chat_id, text, { parse_mode: 'HTML' });
    } catch (e) { console.error('[gi digest]', e.message); }
  }
}

async function buildMorningDigest(chatId) {
  const rawDb = db.getDb();
  const total = rawDb.prepare("SELECT COUNT(*) AS n FROM group_members WHERE chat_id = ? AND status IN ('member','administrator','creator')").get(chatId)?.n || 0;
  const newToday = rawDb.prepare("SELECT COUNT(*) AS n FROM group_members WHERE chat_id = ? AND date(joined_at) = date('now')").get(chatId)?.n || 0;
  return `☀️ <b>Доброе утро, команда!</b>\n\n` +
         `👥 Сейчас в чате: <b>${total}</b> участников${newToday ? ` (+${newToday} за вчера)` : ''}\n` +
         `🎯 Сегодня — рабочий день. Хорошего!`;
}

async function buildEveningDigest(chatId) {
  const rawDb = db.getDb();
  const todayMsgs = rawDb.prepare("SELECT SUM(msg_count_today) AS n FROM group_activity WHERE chat_id = ? AND activity_day = date('now')").get(chatId)?.n || 0;
  if (todayMsgs < 5) return null; // skip if no real activity
  const top3 = rawDb.prepare(`
    SELECT m.first_name, m.tg_username, a.msg_count_today
    FROM group_activity a JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id
    WHERE a.chat_id = ? AND a.activity_day = date('now') AND a.msg_count_today > 0
    ORDER BY a.msg_count_today DESC LIMIT 3
  `).all(chatId);
  const lines = ['🌙 <b>Итог дня</b>', `📨 Сообщений: <b>${todayMsgs}</b>`];
  if (top3.length) {
    lines.push('');
    lines.push('🥇 Самые активные:');
    top3.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      lines.push(`   ${i+1}. <b>${escapeHtml(name)}</b> (${r.msg_count_today})`);
    });
  }
  return lines.join('\n');
}

async function buildWeeklyDigest(chatId) {
  const rawDb = db.getDb();
  const wkMsgs = rawDb.prepare("SELECT SUM(msg_count_week) AS n FROM group_activity WHERE chat_id = ?").get(chatId)?.n || 0;
  const newWk = rawDb.prepare("SELECT COUNT(*) AS n FROM group_members WHERE chat_id = ? AND joined_at >= datetime('now','-7 days')").get(chatId)?.n || 0;
  const top5 = rawDb.prepare(`
    SELECT m.first_name, m.tg_username, a.msg_count_week
    FROM group_activity a JOIN group_members m ON m.chat_id = a.chat_id AND m.tg_user_id = a.tg_user_id
    WHERE a.chat_id = ? AND a.msg_count_week > 0
    ORDER BY a.msg_count_week DESC LIMIT 5
  `).all(chatId);
  const lines = ['📊 <b>Итоги недели в чате</b>', '',
    `📨 Сообщений: <b>${wkMsgs}</b>`,
    `🆕 Новых участников: <b>${newWk}</b>`,
  ];
  if (top5.length) {
    lines.push('');
    lines.push('🏆 Топ активных:');
    top5.forEach((r, i) => {
      const name = (r.first_name || 'User') + (r.tg_username ? ' @' + r.tg_username : '');
      lines.push(`${['🥇','🥈','🥉','4.','5.'][i]} <b>${escapeHtml(name)}</b> — ${r.msg_count_week}`);
    });
    lines.push('');
    lines.push('💰 Топ-3 получили <b>$1</b> в gift-баланс за активность!');
  }
  return lines.join('\n');
}

// ── Cross-context drip ──
async function runCrossContextDrip(bot) {
  const rawDb = db.getDb();
  // [drip-static] Static drip templates — no Groq burn for DMs.
  // Multiple variants per step; pick by user_id hash so same user sees consistent thread.
  const _DRIP_TEXTS = {
    1: [
      '👋 Привет! Видел тебя в чате @GOLDEN_CONNECT_AD.\n\nЕсли коротко — Golden Connect это экосистема: биржа заданий с микро-выплатами, маркетплейс цифровых товаров, реферальная сеть на 10 уровней и пресейл-токен платформы. Приходи в кабинет, там удобно всё попробовать.',
      '👋 Привет от Golden Connect!\n\nУ нас можно зарабатывать на коротких заданиях, продавать свои продукты в маркетплейсе и строить партнёрскую сеть. Плюс копится Genesis TRDX — токен платформы. Загляни в кабинет — там пригодится.',
      '👋 Рад приветствовать в Golden Connect!\n\nКоротко: бирижа заданий ($0.05+ за 5 минут), bio-страница для соцсетей, шортер ссылок и накопление пресейл-токена TRDX. Открой меня — расскажу подробнее.',
    ],
    2: [
      '💡 День 2 в Golden Connect.\n\nСамое время освоить кабинет: глянь Bio-страницу, попробуй шортер ссылок и QR-карточки, посмотри маркетплейс. Если планируешь приглашать партнёров — реферальная программа платит до 10 уровней вглубь.',
      '💡 Совет на день 2.\n\nЕсли цель — пассивный доход, обрати внимание на пресейл Genesis TRDX (копится за активность и рефералов) и партнёрские тарифы с матрицей. Если активный заработок — биржа заданий уже работает.',
      '💡 День 2.\n\nДля рекламодателей: у нас есть баннерная реклама на сайте и видео-реклама с гарантированными показами — оплата во внутренней TRDX-валюте. Для партнёров: реф-сеть и Matching Bonus +10%. Выбери своё.',
    ],
    3: [
      '🚀 День 3 — пора решить будешь ли ты партнёром.\n\nБез тарифа доступна L1 партнёрка (10% с прямой линии). С тарифом — матрица 12-17 уровней + Matching Bonus. Окупается обычно на 5-10 рефералах. Загляни в кабинет → раздел Маркетинг.',
      '🚀 День 3.\n\nЕсли уже что-то делаешь — посмотри AI-Mentor, он подскажет следующий шаг. Если ещё ищешь — попробуй Golden Connect Meet (видеозвонки) или ADX (биржа TG-каналов). Площадка даёт много форматов под разные сценарии.',
      '🚀 День 3 — закрепляем результат.\n\nЛучшие партнёры на этом шаге: 1) активируют тариф, 2) подключают Bio + шортер для соцсетей, 3) начинают копить TRDX через рефералов. Любая комбинация работает — главное начать.',
    ],
  };
  function _pickDrip(stepId, userId) {
    const arr = _DRIP_TEXTS[stepId] || [];
    if (!arr.length) return '';
    return arr[Math.abs(Number(userId) || 0) % arr.length];
  }
  for (const step of [
    { id: 1, hoursAfter: 1 },
    { id: 2, hoursAfter: 24 },
    { id: 3, hoursAfter: 72 },
  ]) {
    const candidates = rawDb.prepare(`
      SELECT m.tg_user_id, m.chat_id, m.first_name
      FROM group_members m
      LEFT JOIN group_drip_progress p ON p.tg_user_id = m.tg_user_id AND p.chat_id = m.chat_id AND p.step = ?
      WHERE m.status IN ('member','administrator','creator')
        AND m.joined_at <= datetime('now','-${step.hoursAfter} hours')
        AND m.joined_at >= datetime('now','-30 days')
        AND p.tg_user_id IS NULL
        AND m.tg_user_id > 0
      LIMIT 50
    `).all(step.id);
    for (const c of candidates) {
      try {
        const txt = _pickDrip(step.id, c.tg_user_id);
        if (txt) {
          await bot.api.sendMessage(c.tg_user_id, txt, { parse_mode: 'HTML', disable_web_page_preview: true });
        }
        rawDb.prepare(
          'INSERT OR IGNORE INTO group_drip_progress (tg_user_id, chat_id, step) VALUES (?, ?, ?)'
        ).run(c.tg_user_id, c.chat_id, step.id);
      } catch (e) {
        // user blocked bot — mark as sent to skip
        rawDb.prepare(
          'INSERT OR IGNORE INTO group_drip_progress (tg_user_id, chat_id, step) VALUES (?, ?, ?)'
        ).run(c.tg_user_id, c.chat_id, step.id);
      }
    }
  }
}

// ── Weekly activity bonus REMOVED by user request 2026-04-29 ──
// Previously: +$1 to gift_balance for top-3 most active chat members per week.
// Reset of weekly counters (below) kept so msg_count_week still resets cleanly.
async function awardWeeklyActivityBonus(_bot) {
  // no-op
  const rawDb = db.getDb();
  const subs = rawDb.prepare('SELECT chat_id FROM group_event_subs').all();
  for (const s of subs) {
    void s;
    // Reset weekly counters
    rawDb.prepare('UPDATE group_activity SET msg_count_week = 0 WHERE chat_id = ?').run(s.chat_id);
  }
}

// ============================================================================
// Helpers: callGroqText
// ============================================================================
async function callGroqText(systemPrompt, userPrompt) {
  if (!GROQ_KEYS.length) return '';
  const body = JSON.stringify({
    model: TEXT_MODEL, max_tokens: 300, temperature: 0.5,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return new Promise((resolve, reject) => {
    const key = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
    const req = https.request({
      method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          resolve(j.choices?.[0]?.message?.content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => req.destroy());
    req.write(body); req.end();
  });
}

module.exports = { setupGroupIntel, startGroupIntelCrons };
