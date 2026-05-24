// golden-connect-cabinet: тонкая обёртка. Создаёт Bot grammy, подключает:
//   1) Golden Connect handlers (events, referral, promo) — ДО alpha onboarding
//   2) Alpha-planner createBot(bot, webappUrl) — регистрирует онбординг, planner, AI, voice, dreams, meet
//   3) Golden Connect cron напоминаний об эфирах + alpha cron
// Экспорт совместим с существующим server.js: { bot, startCron, notifyWebUser }.

const { Bot } = require('grammy');

// Alpha-planner modules (ported to src/planner/)
const db = require('./planner/db/database');
const { createBot: setupAlphaBot } = require('./planner/bot/bot');
const { setupConversationalAI } = require('./planner/bot/ai-assistant');
const { setupVoiceHandler } = require('./planner/bot/voice');
const { setupGroupHandlers, setupReportHandler } = require('./planner/bot/group');
const { setupMeetHandlers } = require('./planner/conference/meet');
const { startReminderCron } = require('./planner/cron/reminders');
const { startAlertCron, setupAlertCallbacks, startMeetCron } = require('./planner/cron/alerts');
const { startPlannerCron } = require('./planner/bot/planner');
const { startDreamCoachCron } = require('./planner/bot/dreams');

// Golden Connect specific modules
const { setupGolden ConnectEvents } = require('./xh/events');
const { setupReferral } = require('./xh/referral');
const { setupPromo } = require('./xh/promo');
const { startEventRemindersCron } = require('./xh/events-cron');
const { setupTeam } = require('./xh/team');
const { createBirthdayStorage } = require('./xh/birthdays-storage');
const { setupBirthdays } = require('./xh/birthdays');
const { startBirthdayDigestCron } = require('./xh/birthdays-cron');
const { setupResults } = require('./xh/results');
const { setupBusinessCmds } = require('./xh/business-cmds');
const { setupGroupExtras, startGroupRemindersCron } = require('./xh/group-extras');
const { setupPersonalPlanner, startDailyDigestsCron } = require('./xh/personal-planner');
const { setupAchievements } = require('./xh/achievements');
const { setupGroupIntel, startGroupIntelCrons } = require('./xh/group-intel');
const { setupCoachMode } = require('./xh/coach');
const { setupChatNudge, startChatNudgeCron } = require('./xh/chat-nudge');
const { startTeamStageCron } = require('./xh/team-cron');
const { startTeamTasksCron } = require('./xh/team-tasks-cron');
// [golden-connect-rebrand] disabled: const { setupHealth } = require('./xh/health');
// [golden-connect-rebrand] disabled: const { setupHealthAI } = require('./xh/health-ai');
// [golden-connect-rebrand] disabled: const { startHealthCron } = require('./xh/health-cron');
const { setupSiteLink } = require('./xh/site-link');
// [golden-connect-rebrand] disabled: const { setupHealthQuiz } = require('./xh/health-quiz');
const { setupFeatures, startWeeklyDigestCron } = require('./xh/features');
const { startDripCron } = require('./xh/welcome-drip');
const { startNudgeCron } = require('./xh/auto-nudge');
const { setupMissions } = require('./xh/missions');
const { setupGamification } = require('./xh/gamification');
const { setupChallenges } = require('./xh/challenges');
const { createTelegramMonitor } = require('./xh/telegram-monitor');
const { setupRequiredChatGuard } = require('./xh/required-chat-guard');

function createBot(config, storage) {
  const bot = new Bot(config.botToken);
  const telegramMonitor = createTelegramMonitor({ bot, storage, config });

  // Initialize planner SQLite (creates tables if missing)
  try {
    db.getDb();
    console.log('[planner] SQLite DB ready');
  } catch (e) {
    console.error('[planner_db_init_failed]', e && e.message ? e.message : e);
  }

  // ===== Activity tracking middleware (FIRST) =====
  // Logs every interaction to webUser.activityLog for team CRM.
  bot.use(async (ctx, next) => {
    try {
      if (ctx.from && ctx.chat && ctx.chat.type === 'private') {
        const webUser = storage.ensureWebUserFromTelegram
          ? storage.ensureWebUserFromTelegram(ctx.from)
          : null;
        if (webUser) {
          let action = 'unknown';
          if (ctx.message && ctx.message.text) {
            action = 'message:' + ctx.message.text.slice(0, 40).replace(/\n/g, ' ');
          } else if (ctx.message && ctx.message.voice) {
            action = 'voice';
          } else if (ctx.message && ctx.message.photo) {
            action = 'photo';
          } else if (ctx.callbackQuery && ctx.callbackQuery.data) {
            action = 'cb:' + String(ctx.callbackQuery.data).slice(0, 40);
          }
          if (storage.logReferralActivity) storage.logReferralActivity(webUser.id, action);
          if (storage.refreshReferralStage) {
            const tr = storage.refreshReferralStage(webUser.id);
            if (tr && tr.new && webUser.referredByUserId) {
              // Async fire-and-forget inviter notification
              try {
                const { notifyInviterStageChange } = require('./xh/team-notify');
                notifyInviterStageChange(bot, storage, webUser.id, tr.old, tr.new).catch(() => {});
              } catch (e) {}
            }
          }
        }
      }
    } catch (e) {
      // Never break the request because of tracking
    }
    return next();
  });

  try {
    const requiredChatGuard = setupRequiredChatGuard(bot, storage, config);
    if (requiredChatGuard && typeof requiredChatGuard.middleware === 'function') {
      bot.use(requiredChatGuard.middleware);
    }
  } catch (e) {
    console.error('[required_chat_guard_setup]', e && e.message);
  }

  // ===== Golden Connect handlers FIRST (intercept deep links before alpha /start) =====
  try { setupGolden ConnectEvents(bot, storage, config); } catch (e) { console.error('[xh_events_setup]', e && e.message); }
  try { setupReferral(bot, storage, config); } catch (e) { console.error('[xh_referral_setup]', e && e.message); }
  try { setupPromo(bot, storage, config); } catch (e) { console.error('[xh_promo_setup]', e && e.message); }
  try { setupTeam(bot, storage, config); } catch (e) { console.error('[xh_team_setup]', e && e.message); }
  const birthdayStorage = createBirthdayStorage(config);
  try { setupBirthdays(bot, birthdayStorage, config); } catch (e) { console.error('[xh_birthdays_setup]', e && e.message); }
  try { setupResults(bot, storage, config); } catch (e) { console.error('[xh_results_setup]', e && e.message); }
  // [silence-gate-early] Install group-silence middleware BEFORE any chat handlers.
  // In groups not in tg_group_active, all messages are dropped except /goldenConnect_active|silent|status.
  try {
    const { setupSilenceGate } = require('./xh/group-silence');
    setupSilenceGate(bot);
    console.log('[group-silence] early gate installed (silent-by-default in groups)');
  } catch (e) { console.error('[group-silence-gate]', e && e.message); }
  try { setupBusinessCmds(bot, storage, config); } catch (e) { console.error('[xh_business_cmds_setup]', e && e.message); }
  try { setupGroupExtras(bot); } catch (e) { console.error('[xh_group_extras_setup]', e && e.message); }
  try { setupPersonalPlanner(bot); } catch (e) { console.error('[xh_personal_planner_setup]', e && e.message); }
  try { setupAchievements(bot, storage, config); } catch (e) { console.error('[xh_achievements_setup]', e && e.message); }
  try { setupGroupIntel(bot, storage, config); } catch (e) { console.error('[xh_group_intel_setup]', e && e.message); }
  try { setupCoachMode(bot, storage); } catch (e) { console.error('[coach_setup]', e && e.message); }
  try { setupChatNudge(bot); } catch (e) { console.error('[xh_chat_nudge_setup]', e && e.message); }
  // [x-health legacy] removed — handled by Golden Connect modules
  // [x-health AI legacy] removed
  try { setupSiteLink(bot, storage, config); } catch (e) { console.error('[xh_site_link_setup]', e && e.message); }
  // [x-health quiz legacy] removed
  try { setupFeatures(bot, storage, config); } catch (e) { console.error('[xh_features_setup]', e && e.message); }
  try { setupMissions(bot, storage, config); } catch (e) { console.error('[xh_missions_setup]', e && e.message); }
  try { setupGamification(bot, storage, config); } catch (e) { console.error('[xh_gamification_setup]', e && e.message); }
  try { setupChallenges(bot, storage, config); } catch (e) { console.error('[xh_challenges_setup]', e && e.message); }

  // ===== Alpha-planner bot (onboarding, planner, dreams, meet, admin-panel) =====
  try {
    setupAlphaBot(bot, config.publicBaseUrl || 'https://golden-connect.to/cabinet');
  } catch (e) {
    console.error('[alpha_setup]', e && e.message);
  }

  // ===== Group / voice / AI handlers =====
  const groqKeys = config.groqKeys;
  try { setupReportHandler(bot); } catch (e) { console.error('[report_setup]', e && e.message); }
  try { setupGroupHandlers(bot, groqKeys); } catch (e) { console.error('[group_setup]', e && e.message); }
  try { setupVoiceHandler(bot, groqKeys); } catch (e) { console.error('[voice_setup]', e && e.message); }
  try {
    const adsModule = require('./ads');
    adsModule.setupAds(bot, { db: require('./planner/db/database'), storage });
    // Early-message middleware: ads-flow sessions (submit_report, decide_reason,
    // video_text, video_voice, adv_task, adv_video) intercept text/photo/voice
    // BEFORE alpha-planner AI sees them.
    bot.use(async (ctx, next) => {
      try {
        const m = ctx.message;
        if (!m || !ctx.from || (ctx.chat && ctx.chat.type !== 'private')) return next();
        const handled = await adsModule.handleMessage(ctx, {
          db: require('./planner/db/database'),
          rawDb: require('./planner/db/database').getDb(),
          store: adsModule.makeStore(require('./planner/db/database').getDb()),
          GROQ_KEYS: (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean),
        });
        if (handled) return;
      } catch (e) { console.error('[ads_handle_msg]', e && e.message); }
      return next();
    });
  } catch (e) { console.error('[ads_setup]', e && e.message); }
  try { setupConversationalAI(bot, groqKeys); } catch (e) { console.error('[ai_setup]', e && e.message); }



  // Phase S.2+S.3: hashtag seed (once) + video-collector cron (every 6h)
  (function () {
    try {
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const { seedHashtags, collectAll, cleanup } = require('./services/video-collector');
      // Boot-time seed (no-op if already seeded)
      try { seedHashtags(rawDb); } catch (e) { console.warn('[video-collector] seed', e && e.message); }
      // Collect cron — every 6h, but first run delayed 5min after boot to avoid clogging startup
      const sixHours = 6 * 3600 * 1000;
      const initialDelay = 5 * 60 * 1000;
      setTimeout(async () => {
        try { const r = await collectAll(rawDb); console.log('[video-collector] initial collect:', r); } catch (e) { console.warn('[video-collector] initial', e && e.message); }
        setInterval(async () => {
          try { const r = await collectAll(rawDb); console.log('[video-collector] tick:', r); } catch (e) { console.warn('[video-collector] tick', e && e.message); }
          try { const removed = await cleanup(rawDb); if (removed) console.log('[video-collector] cleanup removed', removed); } catch (_) {}
        }, sixHours);
      }, initialDelay);
      console.log('[video-collector] scheduled (first run in 5 min, then every 6h)');
    } catch (e) {
      console.error('[video-collector] init failed', e && e.message);
    }
  })();
  // Phase S.1: personal video-banner generator cron (every 5 min, max 5/tick)
  setInterval(async () => {
    try {
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const { generateBanner } = require('./services/personal-banner');
      // Find users missing banner — must have ref_code, must have positive tg_id
      const queue = rawDb.prepare(
        "SELECT id, tg_id, tg_username, tg_first_name, ref_code FROM users " +
        "WHERE ref_code IS NOT NULL AND tg_id > 0 " +
        "  AND (video_banner_status IS NULL OR video_banner_status = 'pending') " +
        "ORDER BY id ASC LIMIT 3" /* [banner-cron-throttle] reduced from 5 to 3 to avoid event-loop blocking */
      ).all();
      if (!queue.length) return;
      for (let _i = 0; _i < queue.length; _i++) {
        if (_i > 0) await new Promise((res) => setImmediate(res)); // yield event loop
        const u = queue[_i];
        try {
          rawDb.prepare("UPDATE users SET video_banner_status='generating' WHERE id=?").run(u.id);
          const banner_path = await generateBanner({
            userId: u.id,
            refCode: u.ref_code,
            displayName: u.tg_username ? '@' + u.tg_username : (u.tg_first_name || 'Партнёр Golden Connect'),
          });
          rawDb.prepare(
            "UPDATE users SET video_banner_path=?, video_banner_status='ready', video_banner_generated_at=datetime('now') WHERE id=?"
          ).run(banner_path.path || banner_path, u.id);
          // DM user with the banner — sendVideo if mp4, sendPhoto if PNG fallback
          try {
            const { InputFile } = require('grammy');
            const fileObj = new InputFile(banner_path.path || banner_path);
            const caption = '🎬 <b>Твой персональный баннер Golden Connect готов!</b>\n\n' +
                            '📱 QR ведёт на твою реф-ссылку — делись в соцсетях, чате, оффлайн.\n\n' +
                            'Скачать в кабинете: golden-connect.to/cabinet → Промо-материалы.';
            if (banner_path && banner_path.isVideo) {
              await bot.api.sendVideo(u.tg_id, fileObj, { caption, parse_mode: 'HTML' });
            } else {
              await bot.api.sendPhoto(u.tg_id, fileObj, { caption, parse_mode: 'HTML' });
            }
          } catch (e) { console.warn('[banner-cron] DM failed', u.tg_id, e && e.message); }
          console.log('[banner-cron] generated for user', u.id);
        } catch (e) {
          console.error('[banner-cron] gen failed', u.id, e && e.message);
          rawDb.prepare("UPDATE users SET video_banner_status='failed' WHERE id=?").run(u.id);
        }
      }
    } catch (e) {
      console.error('[banner-cron] tick error', e && e.message);
    }
  }, 5 * 60 * 1000); // every 5 min
  console.log('[banner-cron] started — generates personal Golden Connect banners');

  // Phase S.5: rolling video-promo distribution (every 5 min, ceil(N/288) per tick)
  // [phase-s5-distrib]
  setInterval(async () => {
    try {
      const dbModule = require('./planner/db/database');
      const rawDb = dbModule.getDb();
      const { tickDistribute } = require('./services/video-distribution');
      const r = await tickDistribute(bot, rawDb);
      if (r.sent || (r.skipped && r.skipped.length)) {
        console.log('[video-distrib] tick:', JSON.stringify(r));
      }
    } catch (e) {
      console.error('[video-distrib] tick error', e && e.message);
    }
  }, 5 * 60 * 1000);
  // First-run delay 7 min — let banner-cron + collector get started first.
  setTimeout(async () => {
    try {
      const dbModule = require('./planner/db/database');
      const { tickDistribute } = require('./services/video-distribution');
      const r = await tickDistribute(bot, dbModule.getDb());
      console.log('[video-distrib] first-run:', JSON.stringify(r));
    } catch (e) { console.warn('[video-distrib] first-run', e && e.message); }
  }, 7 * 60 * 1000);
  console.log('[video-distrib] started — 1 promo/user/day spread over 24h');

    // [group-silence-init]
  try {
    const { setupCommands: setupGroupSilence } = require('./xh/group-silence');
    setupGroupSilence(bot);
    console.log('[group-silence] commands + my_chat_member listener registered');
  } catch (e) { console.error('[group-silence] init failed', e && e.message); }

// ────────── Karma raffle admin callbacks ──────────
  // [karma-raffle-admin]
  const ADMIN_TG_IDS_KRAF = ['424077439', '1361064246', '248745860'];
  bot.callbackQuery(/^kraf_(run|skip):(\d+)/, async (ctx) => {
    const action = ctx.match[1];
    const raffleId = parseInt(ctx.match[2], 10);
    const fromId = String(ctx.from && ctx.from.id);
    if (!ADMIN_TG_IDS_KRAF.includes(fromId)) {
      try { await ctx.answerCallbackQuery({ text: 'Tolko dlya admina', show_alert: true }); } catch (_) {}
      return;
    }
    try { await ctx.answerCallbackQuery({ text: action === 'run' ? 'Zapuskaem rozygrysh...' : 'Perenosim...', show_alert: false }); } catch (_) {}
    try {
      const apiBase = (config && config.goldenConnectApiBaseUrl) || 'https://api.golden-connect.to';
      const secret  = (config && config.goldenConnectApiInternalSecret) || '';
      const url = apiBase.replace(/\/+\$/, '') + '/internal/karma-raffle/' + action + '/' + raffleId;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-golden-connect-secret': secret },
      });
      const data = await res.json().catch(() => ({}));
      const DOLLAR = String.fromCharCode(36);
      if (res.ok && data.ok) {
        let body;
        if (action === 'run') {
          const payouts = (Number(data.total_paid_micro || 0) / 1e6).toFixed(2);
          body = '✅ <b>Розыгрыш проведён!</b>\n\nВыплачено: ' + DOLLAR + payouts + ' · Победителей: ' + (data.winners_count || 0) + '\n\nПризы зачислены на основной баланс.';
        } else {
          body = '⏭ <b>Розыгрыш перенесён на следующую неделю.</b>\n\nКарма НЕ сбрасывается — она перенесётся в новую неделю.';
        }
        try { await ctx.editMessageText(body, { parse_mode: 'HTML' }); } catch (_) { try { await ctx.reply(body, { parse_mode: 'HTML' }); } catch (__) {} }
      } else {
        const reason = (data && (data.reason || data.error)) || ('http_' + res.status);
        try { await ctx.reply('⚠️ Не удалось: ' + reason); } catch (_) {}
      }
    } catch (e) {
      console.error('[karma-raffle-admin]', e && e.message);
      try { await ctx.reply('❌ Ошибка: ' + (e && e.message || 'unknown')); } catch (_) {}
    }
  });

  // [pack2-bot-ux]
  // ────────── /me — compact dashboard ──────────
  // [trdx-cmd] Genesis TRDX — balance, utilities, recent ledger
  bot.command('trdx', async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      const u = ctx.me?.username || 'Golden Connect_bizbot';
      try { await ctx.reply('💎 TRDX — открой бота в личке: https://t.me/' + u + '?start=trdx', { parse_mode: 'HTML' }); } catch (_) {}
      return;
    }
    try {
      const wu = storage.findWebUserByTelegramId(ctx.from.id);
      let balance = 0;
      let recent = [];
      if (wu) {
        balance = storage.getTrxBalance(wu.id);
        recent = storage.getTrxLedger(wu.id, 10);
      }
      const reasonLabels = {
        registration: '🎉 Регистрация',
        registration_backfill: '🎁 Бонус для ранних',
        referral_free: '👥 Реферал (free)',
        referral_paid_launch: '🚀 Реферал купил LAUNCH',
        referral_paid_boost: '⚡ Реферал купил BOOST',
        referral_paid_rocket: '🔥 Реферал купил ROCKET',
      };
      const lines = [
        '💎 <b>Genesis TRDX</b>',
        '',
        'Твой баланс: <b>' + balance.toLocaleString('ru-RU') + ' TRDX</b>',
        '',
        '<b>Как получить ещё:</b>',
        '• Регистрация — <b>+100</b> (одноразово)',
        '• Бесплатный реферал — <b>+50</b> за каждого',
        '• Реферал купил LAUNCH ($45) — <b>+1 000</b>',
        '• Реферал купил BOOST ($90) — <b>+2 500</b>',
        '• Реферал купил ROCKET ($135) — <b>+7 500</b>',
        '',
        '<b>Что даст TRDX после старта:</b>',
        '1️⃣ Биржа — продажа TRDX за USD',
        '2️⃣ Оплата AI-сервисов и рассылок',
        '3️⃣ Ежеквартальный % от дохода Golden Connect',
        '4️⃣ Розыгрыши призов (чем больше TRDX — тем больше шанс)',
        '',
        '🔗 Подробнее: https://golden-connect.to/trdx',
      ];
      if (recent.length > 0) {
        lines.push('');
        lines.push('<b>Последние операции:</b>');
        recent.slice(0, 5).forEach((e) => {
          const sign = Number(e.amount) >= 0 ? '+' : '';
          const lbl = reasonLabels[e.reason] || e.reason;
          const when = (e.ts || '').slice(0, 10);
          lines.push('• ' + when + ' · ' + lbl + ' · <b>' + sign + Number(e.amount).toLocaleString('ru-RU') + '</b>');
        });
      }
      const { InlineKeyboard } = require('grammy');
      const kb = new InlineKeyboard()
        .url('🔗 Моя реф-ссылка', 'https://golden-connect.to/?ref=' + (wu?.referralCode || '')).row()
        .url('🌐 Подробно на сайте', 'https://golden-connect.to/trdx').row()
        .text('🏆 Топ-100', 'trdx_top');
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } catch (e) {
      console.error('[/trdx]', e && e.message);
      try { await ctx.reply('⚠️ Не удалось загрузить TRDX. Попробуй позже.'); } catch (_) {}
    }
  });

  bot.callbackQuery('trdx_top', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    try {
      const board = storage.getTrxLeaderboard(20);
      const lines = ['🏆 <b>Топ-20 держателей Genesis TRDX</b>', ''];
      board.forEach((row, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        const name = String(row.displayName || 'user').replace(/[<>&]/g, '');
        lines.push(medal + ' ' + name + ' — <b>' + Number(row.trxBalance).toLocaleString('ru-RU') + '</b>');
      });
      lines.push('');
      lines.push('Подробнее: /trdx');
      await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    } catch (e) { console.error('[trdx_top]', e && e.message); }
  });

    bot.command(['me', 'dashboard'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    try {
      const dbm = require('./planner/db/database');
      const u = dbm.ensureUser(ctx.from);
      const rawDb = dbm.getDb();
      // Balances + karma — try api proxy via internal helper
      let earned = 0, gift = 0, karma = 100, tariff = 'free';
      try {
        const apiBase = (config.goldenConnectApiBaseUrl || 'https://api.golden-connect.to').replace(/\/+$/, '');
        const sec = config.goldenConnectApiInternalSecret || '';
        const email = u.email || ('tg' + u.tg_id + '@golden-connect.bot');
        const r = await fetch(apiBase + '/internal/finance/balances?email=' + encodeURIComponent(email), {
          headers: { 'x-golden-connect-secret': sec },
        });
        if (r.ok) {
          const d = await r.json();
          if (d && d.balances) {
            earned = Number(d.balances.working?.usd || 0);
            gift = Number(d.balances.gift?.usd || 0);
            karma = Number(d.balances.karma?.points || 0);
          }
          if (d && d.tariff && d.tariff.code) tariff = d.tariff.code;
        }
      } catch (_) {}
      // Referrals
      let refCount = 0;
      try { refCount = rawDb.prepare('SELECT ref_count FROM users WHERE id=?').get(u.id)?.ref_count || 0; } catch (_) {}
      // Active tasks
      let activeClaims = 0;
      try {
        activeClaims = rawDb.prepare("SELECT COUNT(*) AS c FROM ad_claims WHERE executor_user_id=? AND status IN ('claimed', 'submitted', 'rework')").get(u.id)?.c || 0;
      } catch (_) {}
      const tariffEmoji = { free: '🟢', launch: '🚀', boost: '⚡', rocket: '💎' }[tariff] || '🟢';
      const refUrl = 'https://golden-connect.to/?ref=' + (u.ref_code || '');
      const txt =
        '📊 <b>Твоя сводка Golden Connect</b>\n\n' +
        '💵 Earned: <b>$' + earned.toFixed(2) + '</b>\n' +
        '🎁 Gift: <b>$' + gift.toFixed(2) + '</b>\n' +
        '⚡ Карма: <b>' + karma + '</b>\n' +
        '👥 Рефералов: <b>' + refCount + '</b>\n' +
        '📦 Активных заданий: <b>' + activeClaims + '</b>\n' +
        '' + tariffEmoji + ' Тариф: <b>' + tariff.toUpperCase() + '</b>\n' +
        /* [trdx-me] */ '💎 Genesis TRDX: <b>' + (() => { try { const wu = storage.findWebUserByTelegramId(u.tg_id); return wu ? Number(wu.trxBalance || 0).toLocaleString('ru-RU') : '0'; } catch (_) { return '0'; } })() + '</b> (см. /trdx)\n\n' +
        '🔗 Реф-ссылка: <code>' + refUrl + '</code>';
      const { InlineKeyboard } = require('grammy');
      const kb = new InlineKeyboard()
        .text('💰 Заработать', 'open_earn').text('🎯 Заказать рекламу', 'open_advertise').row()
        .text('💸 Вывести', 'open_withdraw').text('🌐 Кабинет', 'open_cabinet').row()
        .text('🔄 Обновить', 'me_refresh');
      await ctx.reply(txt, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
    } catch (e) {
      console.error('[/me]', e && e.message);
      await ctx.reply('⚠️ Не удалось загрузить сводку. Попробуй ещё раз через минуту.');
    }
  });

  bot.callbackQuery('me_refresh', async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: 'Обновляю...' }); } catch (_) {}
    // Re-trigger /me logic: easiest is to call bot.api.sendMessage with same content
    try { ctx.match = null; ctx.message = { text: '/me' }; } catch (_) {}
    // Just delete current message and ask user to /me again
    try { await ctx.deleteMessage(); } catch (_) {}
    try { await ctx.reply('Чтобы обновить — введи /me'); } catch (_) {}
  });

  bot.callbackQuery('open_cabinet', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    try {
      const { sendMagicLink } = require('./xh/site-link');
      const siteBase = String(config.publicBaseUrl || 'https://golden-connect.to/cabinet').replace(/\/+$/, '');
      await sendMagicLink(ctx, storage, siteBase);
    } catch (e) { console.warn('[open_cabinet]', e && e.message); }
  });
  bot.callbackQuery('open_earn', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    try { await ctx.reply('💰 <b>Заработать</b>\n\nВыбери тип в /jobs или прямо тут:', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[ { text: '📺 Подписки', callback_data: 'exec_subs' }, { text: '📝 Задания', callback_data: 'exec_tasks' }, { text: '🎬 Видео', callback_data: 'exec_video' } ]] } }); } catch (_) {}
  });
  bot.callbackQuery('open_advertise', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    try { await ctx.reply('🎯 <b>Заказать рекламу</b>\n\nКакой формат?', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[ { text: '📢 Подписки на канал', callback_data: 'adv_new_sub' }, { text: '📝 Custom-task', callback_data: 'adv_new_task' }, { text: '🎬 Видео-просмотр', callback_data: 'adv_new_video' } ]] } }); } catch (_) {}
  });
  bot.callbackQuery('open_withdraw', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    try { await ctx.reply('/withdraw'); } catch (_) {}
  });

  // ────────── /withdraw — request payout ──────────
  bot.command('withdraw', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const url = 'https://golden-connect.to/cabinet#/finance';
    await ctx.reply(
      '💸 <b>Вывод средств</b>\n\n' +
      'Минимум: <b>$5</b>\n' +
      'Способы: CryptoBot USDT (мгновенно, 0% комиссия) или Platega (карты РФ).\n\n' +
      'Открой кабинет → Финансы → Вывод:\n' + url,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  });

  // ────────── Persistent main-menu reply keyboard ──────────
  // [restore-2026-05-12] full menu — 📹 Звонки, planner buttons, AI/voice hint
  // were lost in /menu's lite keyboard; restored so users always see them.
  bot.command('menu', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    try {
      const { Keyboard } = require('grammy');
      const kb = new Keyboard()
        .text('🌐 Кабинет').text('🔗 Реф').row()
        .text('🎯 Разместить рекламу').text('💰 Задания (заработать)').row()
        .text('💵 Мои результаты').text('🚀 Тарифы').text('👥 Команда').row()
        .text('📋 Сегодня').text('📅 Завтра').text('📆 Неделя').row()
        .text('🔴 Эфиры').text('📹 Звонки').text('🤖 AI Инструменты').row()
        .text('📢 Промо-материалы').text('💡 Совет').text('☀️ Итог дня').row()
        .text('🧠 TG Neuro AI').text('💸 Вывести').text('🆘 Помощь')
        .resized().persistent();
      await ctx.reply(
        '📋 <b>Главное меню Golden Connect</b>\n\n' +
        '<b>Что умею:</b>\n' +
        '• 🎙 <b>Голосовые</b> — присылай голосовое, я расшифрую через Whisper и отвечу через AI\n' +
        '• 💬 <b>Текст</b> — пиши вопросы по платформе, я отвечу как AI-секретарь\n' +
        '• 📹 <b>Звонки</b> — создай конференцию или подключись к существующей\n' +
        '• 📋 <b>Планировщик</b> — задачи на сегодня/завтра/неделю\n\n' +
        'Нажми кнопку внизу или команду (/me, /withdraw, /help, /trdx).',
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } catch (e) { console.error('[/menu]', e && e.message); }
  });

  // Reply-keyboard hits — text → command equivalents
  bot.hears(['💰 Заработать', '💰 Задания (заработать)'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return ctx.api.sendMessage(ctx.chat.id, '/jobs').catch(() => {});
  });
  bot.hears(['🎯 Заказать рекламу'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return ctx.reply('🎯 <b>Заказать рекламу</b>\n\nКакой формат?', { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[ { text: '📢 Подписки на канал', callback_data: 'adv_new_sub' }, { text: '📝 Custom-task', callback_data: 'adv_new_task' }, { text: '🎬 Видео-просмотр', callback_data: 'adv_new_video' } ]] } });
  });
  bot.hears(['📊 Моя сводка'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    // forward to /me handler via re-run
    ctx.message.text = '/me';
    // Re-emit: easiest is to copy-paste /me inline minimal call
    try {
      await ctx.reply('📊 Используй команду /me для полной сводки.');
    } catch (_) {}
  });
  bot.hears(['💸 Вывести'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return ctx.reply('/withdraw');
  });
  // [magic-link] duplicate "🌐 Кабинет" handler removed — xh/site-link.js owns this hears() with magic-link
  bot.hears(['🆘 Помощь'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return ctx.reply('/help');
  });

  // ────────── TG Neuro AI ──────────
  bot.hears(['🧠 TG Neuro AI', '🤖 AI-рассылки'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    return ctx.reply(
      '🧠 <b>TG Neuro AI</b>\n\nДва способа использовать:',
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Зарабатывать (подключить аккаунты)', callback_data: 'roboai_earn' }],
            [{ text: '🎯 Заказать рассылку', callback_data: 'roboai_order' }],
            [{ text: '🧠 Самостоятельная рассылка (Premium)', url: 'https://t.me/Golden ConnectTGbot' }],
            [{ text: '📚 Что это? (FAQ)', callback_data: 'roboai_faq' }],
          ],
        },
      }
    );
  });
  bot.callbackQuery('roboai_order', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    return ctx.reply(
      '🎯 <b>Заказать рассылку</b>\n\n' +
      'Открой кабинет — конструктор кампании, AI-промт из URL, выбор аудитории, оплата с баланса:\n\n' +
      'https://golden-connect.to/cabinet#/roboai-order',
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  });
  bot.callbackQuery('roboai_earn', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    return ctx.reply(
      '💸 <b>Зарабатывать на аккаунтах</b>\n\n' +
      'Подключи свои Telegram-аккаунты на сайте — мы прогреем и подключим к рекламным кампаниям.\n' +
      '50% с каждого сообщения. MLM 10 уровней по партнёрке Golden Connect.\n\n' +
      'https://golden-connect.to/cabinet#/roboai-earn',
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
  });
  bot.callbackQuery('roboai_faq', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (_) {}
    return ctx.reply(
      '📚 <b>TG Neuro AI — три режима</b>\n\n' +
      '<b>1) Зарабатывать</b> — отдай нам свои TG-аккаунты, мы прогреваем и используем в рекламных кампаниях. 50% с каждого сообщения. Сам ничем не управляешь, только смотришь статистику.\n\n' +
      '<b>2) Заказать рассылку</b> — закажи рекламу через сайт, AI напишет промт из URL, мы рассылаем через прогретые аккаунты. От $0.05 за сообщение.\n\n' +
      '<b>3) Premium-режим в @Golden ConnectTGbot</b> — самостоятельная рассылка через бот (только на тарифах LAUNCH/BOOST/ROCKET). Полный контроль над кампаниями, аккаунтами и аудиторией.\n\n' +
      'Прокси покупаются автоматически (резидент). Один на каждый аккаунт.',
      { parse_mode: 'HTML' }
    );
  });

  // [reply-to-bot-ai] If user replies to a bot message in private — answer via Groq
  bot.on('message:text', async (ctx, next) => {
    try {
      if (ctx.chat?.type !== 'private') return next();
      const reply = ctx.message?.reply_to_message;
      if (!reply || !reply.from || !reply.from.is_bot) return next();
      const q = String(ctx.message.text || '').trim();
      if (!q || q.startsWith('/')) return next();
      // Skip if a session is active (handled by ads.js)
      const groqKeysList = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!groqKeysList.length) return next();
      const sysPrompt = 'Ты AI-помощник Golden Connect. Отвечай кратко (2-5 предложений), на русском, на основе вопроса юзера. Контекст: Golden Connect — рекламная платформа с тарифами LAUNCH/BOOST/ROCKET, партнёрской программой 10 уровней, биржей заданий. Если вопрос не про Golden Connect — отвечай кратко общим знанием.';
      const ctxQuoted = reply.text ? ('\nКонтекст (на что отвечаю): ' + String(reply.text).slice(0, 400)) : '';
      try {
        const k = groqKeysList[Math.floor(Math.random() * groqKeysList.length)];
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: sysPrompt },
              { role: 'user', content: q + ctxQuoted },
            ],
            temperature: 0.7,
            max_tokens: 400,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const txt = d?.choices?.[0]?.message?.content || 'Не уверен. Уточни вопрос или напиши /support.';
          await ctx.reply(txt);
          return;
        }
      } catch (e) { console.warn('[reply-ai]', e && e.message); }
    } catch (_) {}
    return next();
  });

    bot.catch(async (error) => {
    const ctx = error.ctx;
    const inner = error.error;
    const msg = inner && inner.message ? inner.message : String(inner || error);
    const stack = inner && inner.stack ? inner.stack : null;
    console.error('[bot_error]', {
      updateId: ctx && ctx.update && ctx.update.update_id,
      tgId:     ctx && ctx.from && ctx.from.id,
      type:     ctx && ctx.update && Object.keys(ctx.update).filter(k => k !== 'update_id')[0],
      data:     ctx && ctx.callbackQuery && ctx.callbackQuery.data,
      message:  msg,
    });
    if (stack) console.error('[bot_error stack]', stack);
    // Try to notify the user so the bot doesn't appear frozen
    try {
      if (ctx && ctx.callbackQuery) {
        // ack the callback query so the spinner stops, even if reply fails
        try { await ctx.answerCallbackQuery({ text: '⚠️ Ошибка — мы её уже видим в логах', show_alert: false }); } catch (_) {}
      }
      if (ctx && (ctx.chat || ctx.from)) {
        await ctx.reply('⚠️ Что-то пошло не так. Мы это видим в логах и чиним. Попробуй ещё раз через минуту или напиши /start.');
      }
    } catch (notifyErr) {
      console.error('[bot_error notify failed]', notifyErr && notifyErr.message);
    }
  });

  // ===== Notifications helpers (for /admin routes, cron etc) =====
  async function sendTelegramNotification(telegramUserId, text, opts = {}) {
    if (!telegramUserId) return false;
    try {
      await bot.api.sendMessage(telegramUserId, text, {
        parse_mode: opts.parseMode || 'HTML',
        reply_markup: opts.keyboard,
        disable_web_page_preview: opts.disablePreview !== false,
      });
      return true;
    } catch (e) {
      console.error('[tg_notify_error]', telegramUserId, e && e.message);
      return false;
    }
  }

  async function notifyWebUser(userId, text, opts = {}) {
    const user = storage.findWebUserById ? storage.findWebUserById(userId) : null;
    if (!user || !user.telegramUserId) return false;
    if (user.notificationSettings && user.notificationSettings.telegram === false) return false;
    return sendTelegramNotification(user.telegramUserId, text, opts);
  }

  // ===== Cron bootstrapping =====
  function startCron() {
    try { startReminderCron(bot); } catch (e) { console.error('[cron_reminders]', e && e.message); }
    try { startAlertCron(bot); } catch (e) { console.error('[cron_alerts]', e && e.message); }
    try { setupAlertCallbacks(bot); } catch (e) { console.error('[cron_alerts_cb]', e && e.message); }
    try { startPlannerCron(bot); } catch (e) { console.error('[cron_planner]', e && e.message); }
    try { startDreamCoachCron(bot, groqKeys); } catch (e) { console.error('[cron_dreams]', e && e.message); }
    try { startMeetCron(bot, config.publicBaseUrl || 'https://golden-connect.to/cabinet'); } catch (e) { console.error('[cron_meet]', e && e.message); }
    try { startEventRemindersCron(bot, storage); } catch (e) { console.error('[cron_xh_events]', e && e.message); }
    try { startTeamStageCron(bot, storage); } catch (e) { console.error('[cron_team_stage]', e && e.message); }
    try { startTeamTasksCron(bot, storage); } catch (e) { console.error('[cron_team_tasks]', e && e.message); }
    try { startBirthdayDigestCron(bot, birthdayStorage); } catch (e) { console.error('[cron_birthdays]', e && e.message); }
    // [x-health cron legacy] removed
    try { telegramMonitor.startCron(); } catch (e) { console.error('[cron_tg_monitor]', e && e.message); }
    try { startDripCron(bot, storage); } catch (e) { console.error('[cron_drip]', e && e.message); }
    try { startNudgeCron(bot, storage); } catch (e) { console.error('[cron_nudge]', e && e.message); }
    try { startWeeklyDigestCron(bot, storage); } catch (e) { console.error('[cron_weekly]', e && e.message); }
    try { startGroupRemindersCron(bot); } catch (e) { console.error('[cron_group_reminders]', e && e.message); }
    try { startDailyDigestsCron(bot, storage); } catch (e) { console.error('[cron_daily_digests]', e && e.message); }
    try { startGroupIntelCrons(bot, storage, config); } catch (e) { console.error('[cron_group_intel]', e && e.message); }
    try { startChatNudgeCron(bot); } catch (e) { console.error('[cron_chat_nudge]', e && e.message); }
        try { require('./services/health-alert').startHealthAlertCron(bot); } catch (e) { console.error('[health-alert]', e && e.message); }
    try { require('./services/trx').startTrxScanCron(storage, config); require('./services/trx').runRegistrationBackfill(storage); /* [trx-cron] */ } catch (e) { console.error('[trx]', e && e.message); }
    try {
    const { startPartnersNotifCron } = require('./cron/partners-notif-cron');
    // Use the same callGolden ConnectApi from web-routes (closure-bound to config)
    const helpers = require('./web-routes');
    const apiFn = (path, body) => {
      const fetch = require('node-fetch') || global.fetch;
      const base = (process.env.GOLDEN_CONNECT_API_BASE_URL || process.env.GOLDEN_CONNECT_API_BASE || config.goldenConnectApiBaseUrl || 'https://api.golden-connect.to').replace(/\/$/, '');
      const secret = process.env.INTERNAL_API_SECRET;
      const url = base + path;
      const method = body ? 'POST' : 'GET';
      const headers = { 'x-golden-connect-secret': secret, 'content-type': 'application/json' };
      const init = { method, headers, signal: AbortSignal.timeout(5000) };
      if (body) init.body = JSON.stringify(body);
      return fetch(url, init).then(r => r.json());
    };
    startPartnersNotifCron({ bot, config, callGolden ConnectApi: apiFn });
  } catch (e) { console.error('[partners-notif-cron]', e && e.message); }

  console.log('[bot] All crons: reminders, alerts, planner, dreams, meet, events, team, health, drip, nudge, weekly');
  }

  // [pw-reset] /reset_password — generate new random password + DM it
  // Two-step confirm via inline keyboard. Only works for users with linked web account.
  bot.command(['reset_password', 'reset', 'newpassword'], async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      return ctx.reply('Сброс пароля доступен только в личных сообщениях боту.');
    }
    try {
      const wu = storage.findWebUserByTelegramId ? storage.findWebUserByTelegramId(ctx.from.id) : null;
      if (!wu || !wu.email) {
        return ctx.reply(
          '⚠️ У тебя нет привязанного аккаунта на сайте.\n\n' +
          'Чтобы привязать — зарегистрируйся на https://golden-connect.to и войди тем же Telegram.',
          { parse_mode: 'HTML', disable_web_page_preview: true },
        );
      }
      const { InlineKeyboard } = require('grammy');
      const kb = new InlineKeyboard()
        .text('✅ Да, сбросить', 'pwreset_yes')
        .text('❌ Отмена', 'pwreset_no');
      return ctx.reply(
        '🔐 <b>Сброс пароля</b>\n\n' +
        'Сейчас будет создан <b>новый случайный пароль</b> для <code>' + String(wu.email).replace(/[<>&]/g, '') + '</code>.\n' +
        'Старый пароль перестанет работать. Действительно продолжить?',
        { parse_mode: 'HTML', reply_markup: kb },
      );
    } catch (e) {
      console.error('[/reset_password]', e && e.message);
      try { await ctx.reply('⚠️ Не удалось обработать запрос. Попробуй позже.'); } catch (_) {}
    }
  });

  bot.callbackQuery('pwreset_no', async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: 'Отменено' }); } catch (_) {}
    try { await ctx.editMessageText('❌ Сброс пароля отменён. Старый пароль продолжает работать.'); } catch (_) {}
  });

  bot.callbackQuery('pwreset_yes', async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: 'Создаю новый пароль...' }); } catch (_) {}
    try {
      const wu = storage.findWebUserByTelegramId ? storage.findWebUserByTelegramId(ctx.from.id) : null;
      if (!wu || !wu.id) {
        return ctx.editMessageText('⚠️ Аккаунт не найден. Сброс невозможен.');
      }
      // Generate 12-char alphanumeric password (no ambiguous chars)
      const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      const crypto = require('crypto');
      const bytes = crypto.randomBytes(12);
      let newPw = '';
      for (let i = 0; i < 12; i++) newPw += ALPHA[bytes[i] % ALPHA.length];
      const { hash, salt } = storage.hashPassword(newPw);
      storage.setWebUserPassword(wu.id, hash, salt);
      // Edit confirmation message (no password leak in chat history if user has webview cache)
      try { await ctx.editMessageText('✅ Пароль сброшен. Новый пароль отправлен следующим сообщением — сохрани его и сразу войди.'); } catch (_) {}
      await ctx.reply(
        '🔑 <b>Новый пароль</b>\n\n' +
        '<code>' + newPw + '</code>\n\n' +
        '<i>Нажми на пароль выше — скопируется.</i>\n\n' +
        '🔗 Войти: https://golden-connect.to/cabinet/login\n' +
        'Email: <code>' + String(wu.email).replace(/[<>&]/g, '') + '</code>\n\n' +
        '⚠️ После входа смени пароль на свой в Профиле.',
        { parse_mode: 'HTML', disable_web_page_preview: true },
      );
    } catch (e) {
      console.error('[pwreset_yes]', e && e.message);
      try { await ctx.editMessageText('⚠️ Не удалось сбросить пароль. Попробуй через минуту или напиши в /support.'); } catch (_) {}
    }
  });

  // Set bot commands menu (replace old Golden Connect menu entirely)
  bot.api.setMyCommands([
    { command: 'start', description: '🏠 Главное меню' },
    { command: 'me', description: '📊 Моя сводка (баланс, карма, рефералы)' },
    { command: 'trdx', description: '💎 Genesis TRDX — твой пресейл-баланс' },
    { command: 'menu', description: '📋 Постоянная клавиатура меню' },
    { command: 'vp', description: '🎬 Видео-промо (новые задания)' },
    { command: 'banner', description: '🎨 Мой персональный QR-баннер' },
    { command: 'today', description: '📅 Задачи на сегодня' },
    { command: 'tomorrow', description: '📅 Задачи на завтра' },
    { command: 'week', description: '📆 Задачи на неделю' },
    { command: 'habits', description: '📊 Привычки' },
    { command: 'leaderboard', description: '🏆 Топ партнёров' },
    { command: 'results', description: '📊 Мои результаты (трафик + заработок)' },
    { command: 'tariffs', description: '🚀 Тарифы (LAUNCH/BOOST/ROCKET)' },
    { command: 'balance', description: '💰 Мой баланс (быстро)' },
    { command: 'jobs', description: '💼 Биржа заданий' },
    { command: 'campaigns', description: '📢 Мои кампании' },
    { command: 'withdraw', description: '💸 Вывод (от $3)' },
    { command: 'topup', description: '💵 Пополнить gift-баланс' },
    { command: 'reset_password', description: '🔐 Восстановить пароль (новый придёт в ЛС)' },
    { command: 'calc', description: '💰 Калькулятор дохода' },
    { command: 'compare', description: '⚖️ Сравнить тарифы' },
    { command: 'reviews', description: '⭐ Отзывы партнёров' },
    { command: 'focus', description: '🍅 Pomodoro-таймер' },
    { command: 'goals', description: '🎯 Мои цели' },
    { command: 'journal', description: '📓 Личный журнал' },
    { command: 'summary', description: '📝 AI-резюме чата (в группах)' },
    { command: 'note', description: '📌 Заметка в группе' },
    { command: 'poll', description: '📊 Опрос (в группах)' },
    { command: 'remind', description: '⏰ Напоминание (в группах)' },
    { command: 'achievements', description: '🏆 Мои бейджи' },
    { command: 'recommend', description: '🤖 AI-выбор тарифа' },
    { command: 'mentor', description: '🎓 AI-коуч (план дня)' },
    { command: 'members', description: '👥 Участники группы' },
    { command: 'who', description: '🔍 Карточка участника /who @user' },
    { command: 'subscribe_events', description: '🔔 Подписать чат на эфиры (админ)' },
    { command: 'admin_log', description: '📋 Лог модерации (админ)' },
    { command: 'chat_status', description: '🔍 Я в общем чате?' },
    { command: 'faq', description: '❓ Частые вопросы' },
    { command: 'missions', description: '🎯 7-дневная программа партнёра' },
    { command: 'streaks', description: '🔥 Стрики и достижения' },
    { command: 'activity', description: '📰 Лента активности' },
    { command: 'challenge', description: '🏁 Реферальный челлендж' },
    { command: 'events', description: '🔴 Эфиры Golden Connect' },
    { command: 'team', description: '👥 Моя команда' },
    { command: 'promo', description: '🎯 Рекламные материалы' },
    { command: 'ref', description: '🔗 Реферальная ссылка' },
    { command: 'meet', description: '📹 Видеоконференция' },
    { command: 'aitools', description: '🤖 AI инструменты' },
    { command: 'tgmonitor', description: '📡 Telegram monitor' },
    { command: 'cabinet', description: '🌐 Открыть кабинет (авто-вход)' },
    { command: 'settings', description: '⚙️ Настройки' },
    { command: 'help', description: '❓ Справка' },
  ]).catch((e) => console.log('[set_commands_failed]', e && e.message));

  return { bot, startCron, notifyWebUser, sendTelegramNotification };
}

module.exports = { createBot };
