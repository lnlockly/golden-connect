// Golden Connect Coach Mode — еженедельный персональный коуч в личке после welcome-drip.
//
// Cron: Mon + Thu at 9:00 MSK (06:00 UTC).
// Для каждого user с TG-ботом и завершившим welcome-drip (день 4):
//   1. Определяет состояние (рефералы, тариф, активность)
//   2. Выбирает один совет «следующий шаг» из правил
//   3. Шлёт DM с inline [Сделал][Пропустить][Пауза]
//   4. Логирует в cross_context_events
//
// Юзер пишет /pause_coach → бот не пишет 30 дней
// Юзер /resume_coach → возобновляет

const { InlineKeyboard } = require('grammy');
const db = require('../planner/db/database');

const COACH_KEY_PAUSED = 'coachPausedUntil';

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS coach_state (
      tg_user_id INTEGER PRIMARY KEY,
      paused_until DATETIME,
      last_sent_at DATETIME,
      last_advice_key TEXT,
      sent_count INTEGER DEFAULT 0,
      done_count INTEGER DEFAULT 0,
      skip_count INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_coach_last ON coach_state(last_sent_at);
  `);
}

/**
 * Compute user state for coaching.
 * Returns { tariff, refsTotal, refsPaid, daysSinceSignup, daysSinceLastBotMsg, lastSiteVisit }
 */
function computeUserState(tgUserId, storage) {
  const rawDb = db.getDb();
  const wu = storage.findWebUserByTelegramId ? storage.findWebUserByTelegramId(tgUserId) : null;
  if (!wu) return null;

  const stats = (typeof storage.getReferralStats === 'function') ? storage.getReferralStats(wu.id, 10) : null;
  const refsTotal = (stats && stats.total) || 0;
  const refsPaid = (stats && stats.byStage && stats.byStage.paid) || 0;

  const tariff = String(wu.activeTariff || wu.partnerStatus || 'free').toLowerCase();

  const signupAt = wu.createdAt ? new Date(wu.createdAt).getTime() : Date.now();
  const daysSinceSignup = Math.floor((Date.now() - signupAt) / (1000 * 60 * 60 * 24));

  // Last bot message: pull from cross_context_events
  let lastBotAt = null;
  try {
    const r = rawDb.prepare("SELECT MAX(created_at) AS t FROM cross_context_events WHERE tg_user_id = ? AND event_type LIKE 'bot_%'").get(tgUserId);
    if (r && r.t) lastBotAt = new Date(r.t).getTime();
  } catch (_) {}
  const daysSinceLastBotMsg = lastBotAt ? Math.floor((Date.now() - lastBotAt) / (1000 * 60 * 60 * 24)) : 999;

  return {
    wu, refsTotal, refsPaid, tariff,
    daysSinceSignup, daysSinceLastBotMsg,
  };
}

/**
 * Pick the next advice based on user state.
 * Returns { key, text, kb, urgent } or null if nothing to suggest.
 */
function pickAdvice(state) {
  const { refsTotal, refsPaid, tariff, daysSinceSignup, daysSinceLastBotMsg } = state;

  // Re-engage: dormant 14+ days
  if (daysSinceLastBotMsg > 14 && daysSinceSignup > 7) {
    return {
      key: 'reengage_dormant',
      text: [
        '👋 Давно не виделись!',
        '',
        'За время твоего отсутствия в Golden Connect:',
        '• Запущены новые рекламные слоты — больше дохода в ленте',
        '• Маркетплейс оживился — продают курсы и боты',
        '• Свежие промо-материалы в кабинете',
        '',
        'Загляни в /cabinet — посмотришь что нового. На FREE доход <b>до $25/день</b>.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .url('🚀 Открыть кабинет', 'https://t.me/Golden Connect_bizbot?start=cab').row()
        .text('✅ Сделал', 'coach_done').text('⏸ Пауза 30д', 'coach_pause'),
    };
  }

  // 0 рефералов на 5+ день
  if (refsTotal === 0 && daysSinceSignup >= 5) {
    return {
      key: 'first_refs',
      text: [
        '🎯 <b>Совет дня: пригласи первых 3-х</b>',
        '',
        'Сейчас у тебя 0 рефералов. Это норм для старта, но важно сделать первый шаг.',
        '',
        'Что сделать сегодня:',
        '1. Открой /ref — твоя реф-ссылка',
        '2. Отправь её 3 близким контактам с фразой:',
        '<i>«Тестирую Golden Connect — рекламная платформа, платит за внимание. Зацени.»</i>',
        '3. Один из 3 обычно регистрируется → начнётся партнёрка',
        '',
        '💡 Не продавай — просто покажи. Платформа сама объяснит.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .text('🔗 Моя реф-ссылка', 'xh_ref')
        .text('📋 Шаблоны постов', 'xh_promo').row()
        .text('✅ Сделал', 'coach_done').text('⏭ Пропустить', 'coach_skip'),
    };
  }

  // 1-3 рефа но 0 платных
  if (refsTotal >= 1 && refsTotal <= 3 && refsPaid === 0) {
    return {
      key: 'meet_refs',
      text: [
        '🎯 <b>Совет: проведи групповой созвон</b>',
        '',
        `У тебя <b>${refsTotal}</b> ${refsTotal === 1 ? 'реферал' : 'рефералов'}, но никто пока не активировал тариф.`,
        '',
        'Лучший способ конверсии — личный созвон 15-20 минут:',
        '1. /meet — создай комнату',
        '2. Пригласи всех своих рефералов одной ссылкой',
        '3. Покажи кабинет в screen-share, объясни LAUNCH ($45)',
        '4. Минимум 1 из 3 обычно активируется в первые сутки',
        '',
        '💰 LAUNCH окупается на 5-10 рефералах. Это реалистично за 2 недели.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .text('📹 Создать созвон', 'xh_meet')
        .text('👥 Моя команда', 'xh_team').row()
        .text('✅ Сделал', 'coach_done').text('⏭ Пропустить', 'coach_skip'),
    };
  }

  // 5+ рефов на FREE — пора апгрейд
  if (refsTotal >= 5 && tariff === 'free') {
    return {
      key: 'upgrade_launch',
      text: [
        '🚀 <b>Совет: пора активировать LAUNCH</b>',
        '',
        `У тебя уже <b>${refsTotal}</b> рефералов. На FREE ты получаешь только L1 10%, теряя 8 нижних линий.`,
        '',
        'LAUNCH ($45 + $15/мес):',
        '• 1 бизнес-место в матрице 12 уровней × $0.5',
        '• Все 10 линий партнёрки активны (до L10)',
        '• Цикл матрицы — $4 095',
        '• Окупается на 5-10 активных рефералах',
        '',
        '💡 Если хоть 1 из твоих 5 рефералов купит LAUNCH тоже — ты сразу +$4.5 на L1.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .url('💎 Активировать LAUNCH', 'https://goldenConnect.to/cabinet#/marketing').row()
        .text('🤔 Подумаю', 'coach_skip').text('⏸ Пауза', 'coach_pause'),
    };
  }

  // На LAUNCH 14+ дней, мало рефералов растут — пуш контент
  if (tariff === 'launch' && daysSinceSignup >= 14 && refsTotal < 10) {
    return {
      key: 'launch_promote',
      text: [
        '📢 <b>Совет: запусти контент-волну</b>',
        '',
        `Ты на LAUNCH ${daysSinceSignup} дней, но рост рефералов медленный (${refsTotal}).`,
        '',
        'Ускорь воронку:',
        '1. /aipost — AI-генератор сделает уникальный пост за 1 минуту',
        '2. Опубликуй в свой Telegram/Insta/VK',
        '3. /post — готовые промо-тексты под разные аудитории',
        '4. Запусти Gift-баланс на рекламу внутри платформы (биржа ADX)',
        '',
        '🎯 Цель — 3 поста в неделю минимум. Через 30 дней цикл матрицы должен закрыться.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .text('🤖 AI-пост', 'xh_aipost')
        .text('📋 Промо', 'xh_promo').row()
        .text('💼 ADX биржа', 'xh_adx').row()
        .text('✅ Сделал', 'coach_done').text('⏭ Пропустить', 'coach_skip'),
    };
  }

  // BOOST/ROCKET — Matching Bonus / Лидерский пул
  if ((tariff === 'boost' || tariff === 'rocket') && daysSinceSignup >= 7) {
    return {
      key: 'leader_pool',
      text: [
        '🏆 <b>Совет: целься в Лидерский пул</b>',
        '',
        `Ты на ${tariff.toUpperCase()} — уже играешь по серьёзным правилам.`,
        '',
        '1 и 15 числа Лидерский пул делится среди топ-15 партнёров по обороту:',
        '• 1 место — 30% пула',
        '• 2 — 20%, 3 — 10%',
        '• 4-15 — от 6% до 1%',
        '',
        'Сейчас твой ранг — посмотри в /cabinet#/finance.',
        '',
        '💡 Чтобы попасть в топ-15: 5+ рефералов в неделю на платных тарифах. Считается оборот = их активация + месячная.',
      ].join('\n'),
      kb: new InlineKeyboard()
        .url('🏆 Лидерский пул', 'https://goldenConnect.to/cabinet#/finance').row()
        .text('✅ Понял', 'coach_done').text('⏭ Пропустить', 'coach_skip'),
    };
  }

  // Default — generic check-in
  return null;
}

/**
 * Send coach DM to one user, log result.
 */
async function sendCoachDM(bot, tgUserId, advice) {
  const rawDb = db.getDb();
  try {
    await bot.api.sendMessage(tgUserId, advice.text, {
      parse_mode: 'HTML',
      reply_markup: advice.kb,
      disable_web_page_preview: true,
    });
    rawDb.prepare(`
      INSERT INTO coach_state (tg_user_id, last_sent_at, last_advice_key, sent_count)
      VALUES (?, datetime('now'), ?, 1)
      ON CONFLICT(tg_user_id) DO UPDATE SET
        last_sent_at = datetime('now'),
        last_advice_key = excluded.last_advice_key,
        sent_count = coach_state.sent_count + 1
    `).run(tgUserId, advice.key);
    rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, event_type, payload) VALUES (?, 'coach_sent', ?)")
      .run(tgUserId, advice.key);
    return true;
  } catch (e) {
    if (/blocked by|chat not found|user is deactivated/i.test(e.message)) {
      // Silently ignore blocked users
      return false;
    }
    console.warn('[coach] send failed', tgUserId, e.message);
    return false;
  }
}

/**
 * Run coach cycle — find eligible users, send personalized advice.
 */
async function runCoachCycle(bot, storage) {
  ensureSchema();
  const rawDb = db.getDb();

  // Find users eligible for coaching:
  // - Has tg_id (registered via bot)
  // - Last coach message > 3 days ago (or never sent)
  // - Not currently paused
  const candidates = rawDb.prepare(`
    SELECT u.tg_id
    FROM users u
    LEFT JOIN coach_state cs ON cs.tg_user_id = u.tg_id
    WHERE u.tg_id > 0
      AND (cs.paused_until IS NULL OR cs.paused_until < datetime('now'))
      AND (cs.last_sent_at IS NULL OR cs.last_sent_at < datetime('now','-3 days'))
    LIMIT 200
  `).all();

  let sent = 0, skipped = 0;
  for (const row of candidates) {
    const tgId = Number(row.tg_id);
    if (!tgId) continue;
    const state = computeUserState(tgId, storage);
    if (!state) { skipped++; continue; }
    const advice = pickAdvice(state);
    if (!advice) { skipped++; continue; }
    const ok = await sendCoachDM(bot, tgId, advice);
    if (ok) sent++; else skipped++;
    await new Promise(r => setTimeout(r, 100)); // rate-limit
  }
  console.log(`[coach] cycle done: sent=${sent} skipped=${skipped}`);
}

/**
 * Register handlers + cron.
 */
function setupCoachMode(bot, storage) {
  ensureSchema();

  // /pause_coach — пауза 30 дней
  bot.command('pause_coach', async (ctx) => {
    if (!ctx.from || ctx.chat.type !== 'private') return;
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO coach_state (tg_user_id, paused_until)
      VALUES (?, datetime('now','+30 days'))
      ON CONFLICT(tg_user_id) DO UPDATE SET paused_until = datetime('now','+30 days')
    `).run(ctx.from.id);
    await ctx.reply('⏸ Coach на паузе 30 дней. Включить раньше — /resume_coach');
  });

  // /resume_coach
  bot.command('resume_coach', async (ctx) => {
    if (!ctx.from || ctx.chat.type !== 'private') return;
    const rawDb = db.getDb();
    rawDb.prepare("UPDATE coach_state SET paused_until = NULL WHERE tg_user_id = ?").run(ctx.from.id);
    await ctx.reply('▶️ Coach снова активен. Следующий совет — в Пн или Чт в 9:00 MSK.');
  });

  // Inline button handlers
  bot.callbackQuery('coach_done', async (ctx) => {
    const rawDb = db.getDb();
    rawDb.prepare("UPDATE coach_state SET done_count = done_count + 1 WHERE tg_user_id = ?").run(ctx.from.id);
    rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, event_type, payload) VALUES (?, 'coach_done', '')").run(ctx.from.id);
    await ctx.answerCallbackQuery({ text: '🎉 Молодец! Жду следующего шага.' });
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [[{ text: '✅ Сделано', callback_data: 'noop' }]] } }); } catch (_) {}
  });

  bot.callbackQuery('coach_skip', async (ctx) => {
    const rawDb = db.getDb();
    rawDb.prepare("UPDATE coach_state SET skip_count = skip_count + 1 WHERE tg_user_id = ?").run(ctx.from.id);
    rawDb.prepare("INSERT INTO cross_context_events (tg_user_id, event_type, payload) VALUES (?, 'coach_skip', '')").run(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Окей, пропустил. Через 3-4 дня — другой совет.' });
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [[{ text: '⏭ Пропущено', callback_data: 'noop' }]] } }); } catch (_) {}
  });

  bot.callbackQuery('coach_pause', async (ctx) => {
    const rawDb = db.getDb();
    rawDb.prepare(`
      INSERT INTO coach_state (tg_user_id, paused_until)
      VALUES (?, datetime('now','+30 days'))
      ON CONFLICT(tg_user_id) DO UPDATE SET paused_until = datetime('now','+30 days')
    `).run(ctx.from.id);
    await ctx.answerCallbackQuery({ text: '⏸ Пауза на 30 дней. /resume_coach — включить раньше.' });
    try { await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [[{ text: '⏸ На паузе', callback_data: 'noop' }]] } }); } catch (_) {}
  });

  // Cron: every 30 minutes check if it's time (Mon/Thu 9:00 MSK = 06:00 UTC)
  let lastCycle = 0;
  setInterval(async () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMin = now.getUTCMinutes();
    const dayOfWeek = now.getUTCDay(); // 1=Mon, 4=Thu
    if ((dayOfWeek === 1 || dayOfWeek === 4) && utcHour === 6 && utcMin < 30) {
      // Run only once per cycle (avoid double-fire if interval triggers within window twice)
      if (Date.now() - lastCycle < 4 * 60 * 60 * 1000) return;
      lastCycle = Date.now();
      try { await runCoachCycle(bot, storage); }
      catch (e) { console.error('[coach cron]', e.message); }
    }
  }, 30 * 60 * 1000);

  console.log('[coach] mode started · cron Mon+Thu 09:00 MSK');
}

module.exports = { setupCoachMode, runCoachCycle, ensureSchema, pickAdvice, computeUserState };
