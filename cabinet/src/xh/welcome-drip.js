// Golden Connect: Welcome drip series — 5 auto-messages over 5 days for new users.
//
// Triggered when a user first does /start (ensureWebUserFromTelegram creates the user).
// Schedule stored in state.json webUser.dripSchedule = { day0: sentAt, day1: sentAt, ... }
//
// Cron: every 30 min checks who needs next drip message.

const { InlineKeyboard } = require('grammy');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Drip messages
const DRIP_MESSAGES = [
  {
    day: 0,
    delay: 60 * 1000, // 1 min after /start
    text: () => [
      '👋 <b>Привет! Я Golden Connect AI Секретарь</b>',
      '',
      'Golden Connect — рекламная платформа с распределённой прибылью. Ты можешь зарабатывать <b>4 способами</b>:',
      '',
      '1️⃣ <b>Биржа заданий</b> — подписки, отчёты, видео ($0.05–$1 за каждое)',
      '2️⃣ <b>Партнёрка</b> — 10 уровней, мгновенные выплаты при покупке партнёра ниже',
      '3️⃣ <b>Запуск кампаний</b> — закажи рекламу, бот автоматически найдёт исполнителей',
      '4️⃣ <b>Маркетплейс</b> — продай цифровой товар, забери 70%+',
      '',
      'Что попробуем первым?',
    ].join('\n'),
    keyboard: () => new InlineKeyboard()
      .text('💰 Найти задания', 'exec_subs')
      .text('🎯 Запустить рекламу', 'adv_menu').row()
      .text('🔗 Получить реф-ссылку', 'xh_ref'),
  },
  {
    day: 1,
    delay: 24 * 3600 * 1000,
    text: () => [
      '💰 <b>Способ #1 — Биржа заданий (без вложений)</b>',
      '',
      'В разделе «💰 Задания (заработать)» доступно:',
      '',
      '📢 <b>Подписка на канал</b> — нажми «Перейти», подпишись → награда зачислится за 1-2 секунды',
      '📝 <b>Отчёт по заданию</b> — выполни ТЗ от рекламодателя, пришли фото/текст → автор примет (помогает AI)',
      '🎬 <b>Видео-задание</b> — посмотри видео, ответь на quiz / запиши голосовой отчёт → AI проверит и заплатит',
      '',
      '⚠️ <b>Лимит:</b> 25 заявок в день · аккаунт ≥3 дня · карма ≥40',
      '💵 Можно вывести от <b>$3</b>',
    ].join('\n'),
    keyboard: () => new InlineKeyboard()
      .text('💰 Открыть биржу', 'exec_subs')
      .text('💼 Мои заявки', 'exec_claims'),
  },
  {
    day: 2,
    delay: 48 * 3600 * 1000,
    text: () => [
      '👥 <b>Способ #2 — Партнёрская сеть (10 уровней)</b>',
      '',
      'Каждый, кого ты пригласил по реф-ссылке, приносит тебе % от их покупки тарифа:',
      '',
      'L1: <b>10%</b>  ·  L2: <b>7%</b>  ·  L3: <b>5%</b>  ·  L4: <b>2%</b>',
      'L5–L10: 1.5% / 1.3% / 1.2% / 1% / 0.9% / 0.5%',
      '',
      '✅ <b>Линейные выплаты МГНОВЕННО</b> — как только партнёр оплатил тариф, ты сразу видишь начисление в кабинете',
      '🎁 <b>+10% Matching Bonus</b> на L1-L3 (для держателей тарифа ROCKET)',
      '',
      'Реф-ссылка автоматически у тебя — поделись с друзьями:',
    ].join('\n'),
    keyboard: () => new InlineKeyboard()
      .text('🔗 Моя реф-ссылка', 'xh_ref')
      .text('👥 Команда', 'xh_team').row()
      .text('🎯 Промо-материалы', 'xh_promo'),
  },
  {
    day: 3,
    delay: 72 * 3600 * 1000,
    text: () => [
      '🚀 <b>Способ #3 — Запусти СВОЮ кампанию</b>',
      '',
      'Хочешь рекламировать свой канал, услугу, товар? Запусти кампанию — бот сам найдёт исполнителей и заплатит им за тебя.',
      '',
      '📢 <b>Подписка на канал</b> — заплати $0.05-0.20 за подписчика, получай реальных людей',
      '📝 <b>Отчёт по заданию</b> — «оставь комментарий», «поставь 🔥», «напиши отзыв»',
      '🎬 <b>Видео-задание</b> — пусть посмотрят твоё видео и пройдут quiz',
      '',
      '💵 Платформа берёт <b>10%</b> комиссии (5% — твоему спонсору)',
      '🤖 <b>AI-помощник</b> проверит отчёты исполнителей за тебя',
      '',
      'Готов запустить?',
    ].join('\n'),
    keyboard: () => new InlineKeyboard()
      .text('🎯 Запустить кампанию', 'adv_menu')
      .text('💵 Пополнить баланс', 'adv_topup').row()
      .text('📊 Мои результаты', 'my_results'),
  },
  {
    day: 5,
    delay: 120 * 3600 * 1000,
    text: () => [
      '🚀 <b>Способ #4 — Активируй тариф (главный заработок)</b>',
      '',
      'Чтобы получать матричные доходы и Matching Bonus — выбери тариф:',
      '',
      '🚀 <b>LAUNCH</b> $45+$15/мес · 1 место · матрица 12×$0.50 · цикл $4 095',
      '⚡ <b>BOOST</b> $90+$30/мес · 2 места · 14×$0.60 · цикл $19 660',
      '🔥 <b>ROCKET</b> $135+$45/мес · 3 места · 17×$0.70 · цикл $183 499 + Matching',
      '',
      'Можно купить за карту/СБП (Platega) или USDT (CryptoBot).',
      '',
      '📅 Активация матрицы — через ~неделю после старта Pre-launch.',
      '⏳ Кто купил <b>раньше</b> — расставится <b>выше</b> в матрице (больше переливов от новичков).',
    ].join('\n'),
    keyboard: () => new InlineKeyboard()
      .text('🚀 Открыть тарифы', 'open_tariffs')
      .text('🌐 Личный кабинет', 'xh_cabinet'),
  },
];

// Mark drip as sent for a user
function markDripSent(storage, userId, dayKey) {
  try {
    if (storage.setDripSent) storage.setDripSent(userId, dayKey);
  } catch (e) {}
}

function isDripSent(user, dayKey) {
  return user && user.dripSchedule && user.dripSchedule[dayKey];
}

// Process drip cron — check all users who need next message
async function processDrip(bot, storage) {
  try {
    const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
    const now = Date.now();

    for (const user of allUsers) {
      if (!user || !user.telegramUserId) continue;
      if (!user.createdAt) continue;
      const createdAt = Date.parse(user.createdAt);
      if (isNaN(createdAt)) continue;

      for (const msg of DRIP_MESSAGES) {
        const dayKey = `day${msg.day}`;
        if (isDripSent(user, dayKey)) continue;
        const elapsed = now - createdAt;
        if (elapsed < msg.delay) continue;
        // Don't send if user was created more than 7 days ago (avoid spam on old users)
        if (elapsed > 7 * 24 * 3600 * 1000) {
          markDripSent(storage, user.id, dayKey);
          continue;
        }

        try {
          const text = msg.text();
          const kb = msg.keyboard();
          await bot.api.sendMessage(user.telegramUserId, text, {
            parse_mode: 'HTML',
            reply_markup: kb,
            disable_web_page_preview: true,
          });
          markDripSent(storage, user.id, dayKey);
          console.log(`[drip] sent day${msg.day} to user=${user.id}`);
        } catch (e) {
          // User blocked bot or other error — mark as sent to avoid retries
          markDripSent(storage, user.id, dayKey);
          console.error(`[drip] failed day${msg.day} user=${user.id}:`, e && e.message);
        }
        break; // Send only one message per check cycle per user
      }
    }
  } catch (e) {
    console.error('[drip_cron_error]', e && e.message);
  }
}

function startDripCron(bot, storage) {
  // Check every 30 min
  setTimeout(() => processDrip(bot, storage), 2 * 60 * 1000).unref();
  setInterval(() => processDrip(bot, storage), 30 * 60 * 1000).unref();
  console.log('[drip_cron] started (welcome series, check every 30 min)');
}

module.exports = { startDripCron, processDrip, DRIP_MESSAGES };
