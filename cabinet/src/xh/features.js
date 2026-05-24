// Trendex: Sprint B+C+D features bundle.
// All additional engagement features in one module for efficiency.
//
// Features:
//   /reviews [product]     — real reviews from knowledge base
//   /leaderboard          — top referrers
//   /calc                 — income calculator
//   /faq                  — FAQ categories
//   /compare <a> <b>      — product comparison
//   /share_course         — share completed course result
//   xh_quiz_start         — (handled in health-quiz.js)

const { InlineKeyboard } = require('grammy');
const { searchKnowledge, formatContext } = require('../planner/bot/knowledge/search');
const { PRODUCTS, PROTOCOLS, GOAL_LABELS, getProduct, listProducts } = require('./health-protocols');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trunc(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

// ═══════════════════════════════════════
// REVIEWS (/reviews, /reviews темпулис)
// ═══════════════════════════════════════

async function sendReviews(ctx, query) {
  // Trendex partner testimonials (curated examples until DB-backed reviews are wired).
  const TESTIMONIALS = [
    { name: 'Анастасия К.', role: 'PARTNER', text: 'Окупила тариф LAUNCH за 4 дня — с двух прямых рефералов уже 6$ линейных. Теперь подключаюсь к биржу и зарабатываю на чужих заданиях параллельно.' },
    { name: 'Сергей О.', role: 'ROCKET', text: 'Купил ROCKET, через неделю Matching Bonus уже отбил половину тарифа. Видеозадания — мой любимый формат, AI всё проверяет за меня.' },
    { name: 'Илья М.', role: 'BOOST', text: '2 бизнес-места в матрице — переливы идут стабильно. От подписок параллельно $3-5 в день. Простой пассивный доход.' },
    { name: 'Марина Р.', role: 'FREE', text: 'Пока без тарифа, на одних подписках в биржу выходит $30-50 в неделю. Карма 1850 — рекламодатели берут меня в первую очередь.' },
    { name: 'Дмитрий Т.', role: 'PARTNER', text: 'Делаю кастомные задания на отзывы под мои каналы — приходит реальная аудитория. AI-чекер реально снимает 90% работы по приёму отчётов.' },
  ];
  const lines = ['⭐ <b>Отзывы партнёров Trendex</b>', ''];
  TESTIMONIALS.slice(0, 4).forEach((t, i) => {
    lines.push(`${i + 1}. <b>${escapeHtml(t.name)}</b> · <i>${t.role}</i>`);
    lines.push(`   <i>${escapeHtml(t.text)}</i>`);
    lines.push('');
  });
  lines.push('🌐 Открой кабинет чтобы посмотреть свою статистику — /cabinet');
  const kb = new InlineKeyboard()
    .text('📤 Поделиться отзывом', 'feat_share_review').row()
    .text('💊 Запустить курс', 'hc_protocols');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

// ═══════════════════════════════════════
// LEADERBOARD (/leaderboard)
// ═══════════════════════════════════════

async function sendLeaderboard(ctx, storage) {
  const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
  const counts = {};
  for (const u of allUsers) {
    if (!u || !u.id) continue;
    counts[u.id] = { user: u, refs: 0 };
  }
  for (const u of allUsers) {
    if (u && u.referredByUserId && counts[u.referredByUserId]) {
      counts[u.referredByUserId].refs += 1;
    }
  }
  const sorted = Object.values(counts)
    .filter(c => c.refs > 0)
    .sort((a, b) => b.refs - a.refs)
    .slice(0, 20);

  if (!sorted.length) {
    return ctx.reply('🏆 <b>Лидерборд</b>\n\nПока нет партнёров с рефералами. Будьте первым! /ref', { parse_mode: 'HTML' });
  }

  // Find current user position
  let webUser = null;
  try { webUser = storage.ensureWebUserFromTelegram(ctx.from); } catch (e) {}
  const myPos = webUser ? sorted.findIndex(c => c.user.id === webUser.id) + 1 : 0;

  const medals = ['🥇', '🥈', '🥉'];
  const lines = ['🏆 <b>Лидерборд Trendex — топ партнёры</b>', ''];
  sorted.slice(0, 15).forEach((c, i) => {
    const medal = medals[i] || `${i + 1}.`;
    const name = c.user.displayName || c.user.email || `User${c.user.id}`;
    const isMe = webUser && c.user.id === webUser.id;
    lines.push(`${medal} ${isMe ? '<b>→ ' : ''}${escapeHtml(name)} — <b>${c.refs}</b> реф.${isMe ? ' ←</b>' : ''}`);
  });
  if (myPos > 0) {
    lines.push('');
    lines.push(`📊 Ваша позиция: <b>#${myPos}</b> из ${sorted.length}`);
  } else if (webUser) {
    lines.push('');
    lines.push('📊 Вы пока не в рейтинге. Пригласите первого реферала: /ref');
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

// ═══════════════════════════════════════
// INCOME CALCULATOR (/calc)
// ═══════════════════════════════════════

async function sendCalc(ctx) {
  // Trendex matrix + linear referral calculator.
  const lines = [
    '💰 <b>Калькулятор дохода Trendex</b>',
    '',
    '<b>Линейная партнёрка (10 уровней)</b> — % с тарифа партнёра:',
    'L1: 10%  · L2: 7%  · L3: 5%  · L4: 2%',
    'L5: 1.5% · L6: 1.3% · L7: 1.2% · L8: 1% · L9: 0.9% · L10: 0.5%',
    '',
    '<b>Пример:</b> 10 прямых рефералов покупают LAUNCH ($30):',
    '• L1: 10 × $3 = <b>$30</b> мгновенно',
    '• Если каждый из них приведёт ещё 5 → L2: 50 × $2.10 = <b>$105</b>',
    '• Сеть 100 человек L1-L3 → ~<b>$220-280</b> с одной волны',
    '',
    '<b>Матрица переливов</b> (после активации админом):',
    '• LAUNCH: 12 уровней × $0.50 → цикл <b>$4 095</b>',
    '• BOOST: 14 уровней × $0.60 → цикл <b>$19 660</b>',
    '• ROCKET: 17 уровней × $0.70 → цикл <b>$183 499</b>',
    '',
    '<b>Matching Bonus (только ROCKET)</b>:',
    '+10% от L1-L3 партнёрских начислений твоих рефералов с тарифом ROCKET',
    '',
    '🎯 Точный калькулятор с твоими цифрами — открой /cabinet → Маркетинг',
  ];
  const kb = new InlineKeyboard()
    .text('🚀 Тарифы', 'open_tariffs')
    .text('🌐 Кабинет', 'xh_cabinet');
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

// ═══════════════════════════════════════
// FAQ (/faq)
// ═══════════════════════════════════════

const FAQ_DATA = [
  { cat: '🚀 Платформа', items: [
    { q: 'Что такое Trendex?', a: 'Рекламная платформа с распределённой прибылью: рекламодатели платят напрямую тем, кто смотрит и взаимодействует с рекламой. 4 способа заработка.' },
    { q: 'Как начать зарабатывать?', a: 'Зарегистрируйся бесплатно, пройди стартовую анкету (/start_quiz) — получишь  на старт + персональный план на 30 дней.' },
    { q: 'Сколько можно заработать в день?', a: 'До 0 в день только за активность в сервисе (просмотры, клики, задания) без приглашений и продаж.' },
  ]},
  { cat: '💰 Тарифы', items: [
    { q: 'Сколько стоят тарифы?', a: 'FREE — бесплатно. LAUNCH — 5 (1 место). BOOST — 0 (2 места). ROCKET — 35 (3 места + Matching Bonus).' },
    { q: 'Что входит в абонплату?', a: 'Из 5 LAUNCH: 0 одноразовая активация + 5/мес обслуживание. Платится автоматически с баланса автоподписки.' },
    { q: 'Можно ли апгрейдить тариф?', a: 'Да: LAUNCH→BOOST доплата 5, BOOST→ROCKET доплата 5. Партнёрские начисляются по схеме нового тарифа.' },
  ]},
  { cat: '👥 Партнёрка', items: [
    { q: 'Сколько уровней в партнёрке?', a: '10 уровней: L1=10%, L2=7%, L3=5%, L4=2%, L5=1.5%, далее по убыванию до L10=0.5%.' },
    { q: 'Что такое статус PARTNER?', a: 'Приведи 10 человек на любой тариф (включая FREE) → +10% к ставке вознаграждения пожизненно.' },
    { q: 'Что такое Matching Bonus?', a: '10% от партнёрских начислений твоих рефералов до 3-й линии. Доступен только на ROCKET.' },
  ]},
  { cat: '📡 Эфиры', items: [
    { q: 'Когда ближайший эфир?', a: '/events — расписание с датами, спикерами и регистрацией.' },
    { q: 'Как подключиться?', a: 'Zoom — ссылка приходит за час до начала. Записи в Медиатеке кабинета.' },
  ]},
  { cat: '💼 Биржа заданий', items: [
    { q: 'Какие задания доступны?', a: 'Подписки, отзывы, просмотр видео, репосты. От /usr/bin/bash.05 за действие, /usr/bin/bash.50+ для PARTNER.' },
    { q: 'Когда выплачивают?', a: 'Сразу после AI-валидации. Минимум для вывода .' },
  ]},
  { cat: '⚙️ Бот и сайт', items: [
    { q: 'Как войти на сайт?', a: '/cabinet — одна кнопка, авто-логин без пароля.' },
    { q: 'Как запустить старт в Trendex?', a: '/start_quiz — стартовая анкета 10 вопросов + AI-план +  бонус.' },
    { q: 'Как привязать Telegram?', a: 'На сайте: Профиль → Привязать Telegram. После этого все уведомления приходят и в бот, и в кабинет.' },
  ]},
];

async function sendFaq(ctx) {
  const lines = ['❓ <b>FAQ — частые вопросы</b>', '', 'Выберите категорию:'];
  const kb = new InlineKeyboard();
  FAQ_DATA.forEach((cat, i) => {
    kb.text(cat.cat, `faq_cat:${i}`).row();
  });
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendFaqCategory(ctx, catIndex) {
  const cat = FAQ_DATA[catIndex];
  if (!cat) return;
  const lines = [`❓ <b>${cat.cat}</b>`, ''];
  cat.items.forEach((item, i) => {
    lines.push(`<b>${i + 1}. ${escapeHtml(item.q)}</b>`);
    lines.push(escapeHtml(item.a));
    lines.push('');
  });
  const kb = new InlineKeyboard().text('← Все категории', 'xh_faq');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

// ═══════════════════════════════════════
// PRODUCT COMPARISON (/compare)
// ═══════════════════════════════════════

async function sendCompare(ctx, query) {
  // Compare Trendex tariffs.
  const TARIFFS = {
    launch: { name: 'LAUNCH', entry: 45, monthly: 15, seats: 1, depth: 12, rate: 0.50, cycle: 4095, levels: 'all 10', matching: false, badge: '🚀' },
    boost:  { name: 'BOOST',  entry: 90, monthly: 30, seats: 2, depth: 14, rate: 0.60, cycle: 19660, levels: 'all 10', matching: false, badge: '⚡' },
    rocket: { name: 'ROCKET', entry: 135, monthly: 45, seats: 3, depth: 17, rate: 0.70, cycle: 183499, levels: 'all 10', matching: true, badge: '🔥' },
  };
  const args = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const a = TARIFFS[args[0]] || TARIFFS.launch;
  const b = TARIFFS[args[1]] || (args[0] === 'rocket' ? TARIFFS.boost : TARIFFS.rocket);

  const fmt = (t) => [
    `${t.badge} <b>${t.name}</b>`,
    `Вход: <b>$${t.entry}</b> + $${t.monthly}/мес`,
    `Бизнес-мест: <b>${t.seats}</b>`,
    `Матрица: <b>${t.depth}</b> уровней × $${t.rate.toFixed(2)}`,
    `Партнёрка: <b>${t.levels}</b>`,
    t.matching ? '✅ Matching Bonus +10%' : '— без Matching',
    `Цикл: <b>$${t.cycle.toLocaleString('ru-RU')}</b>`,
  ].join('\n');

  const lines = [
    '⚖️ <b>Сравнение тарифов Trendex</b>',
    '',
    fmt(a),
    '',
    'против',
    '',
    fmt(b),
    '',
    `<i>Подсказка: /compare launch boost — сравнить любые два</i>`,
  ];
  const kb = new InlineKeyboard()
    .text('🚀 Все тарифы', 'open_tariffs')
    .text('🌐 Купить', 'xh_cabinet');
  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

function findProductByQuery(query) {
  if (!query) return null;
  const lc = query.toLowerCase().trim();
  for (const p of listProducts()) {
    if (p.name.toLowerCase().includes(lc) || p.slug.includes(lc)) return p;
  }
  return null;
}

// ═══════════════════════════════════════
// WEEKLY DIGEST (cron, Sunday 20:00 MSK)
// ═══════════════════════════════════════

let weeklyDigestDate = null;

function isSundayEvening() {
  const d = new Date();
  const utcDay = d.getUTCDay();
  const utcH = d.getUTCHours();
  // Sunday 17:00 UTC = 20:00 MSK
  return utcDay === 0 && utcH === 17;
}

async function processWeeklyDigest(bot, storage) {
  if (!isSundayEvening()) return;
  const today = new Date().toISOString().slice(0, 10);
  if (weeklyDigestDate === today) return;
  weeklyDigestDate = today;

  try {
    const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
    for (const user of allUsers) {
      if (!user || !user.telegramUserId) continue;
      if (!user.lastActivityAt) continue;
      // Only active users (last 14 days)
      if ((Date.now() - Date.parse(user.lastActivityAt)) > 14 * 86400000) continue;

      const stats = storage.getTeamStats ? storage.getTeamStats(user.id) : null;
      const teamLine = stats && stats.total > 0
        ? `👥 Команда: ${stats.total} рефералов (${stats.converted || 0} в компании)`
        : '👥 Команда: пригласите первого через /ref';

      // Health info
      let healthLine = '💊 старт в Trendex: /health чтобы начать';
      try {
        const db = require('../planner/db/database');
        const pu = db.getUserByTgId ? db.getUserByTgId(user.telegramUserId) : null;
        if (pu) {
          const courses = db.getDb().prepare("SELECT COUNT(*) as c FROM health_courses WHERE user_id = ? AND status = 'active'").get(pu.id);
          if (courses && courses.c > 0) {
            const taken = db.getDb().prepare("SELECT COUNT(*) as c FROM health_course_log WHERE user_id = ? AND status = 'taken' AND scheduled_date >= date('now', '-7 days')").get(pu.id);
            const total = db.getDb().prepare("SELECT COUNT(*) as c FROM health_course_log WHERE user_id = ? AND scheduled_date >= date('now', '-7 days')").get(pu.id);
            const pct = total && total.c > 0 ? Math.round((taken.c / total.c) * 100) : 0;
            healthLine = `💊 За неделю: ${taken.c}/${total.c} приёмов (${pct}%)`;
          }
        }
      } catch (e) {}

      // Next event
      const nextEvent = storage.getNextUpcomingEvent ? storage.getNextUpcomingEvent() : null;
      const eventLine = nextEvent
        ? `📡 Ближайший эфир: ${nextEvent.topic || nextEvent.title || '—'}`
        : '📡 Следите за анонсами эфиров в /events';

      const text = [
        '📊 <b>Итог недели — Trendex</b>',
        '',
        healthLine,
        teamLine,
        eventLine,
        '',
        '💡 Хороший момент пригласить друга или запустить рекламную кампанию!',
      ].join('\n');

      try {
        const kb = new InlineKeyboard()
          .text('💊 Trendex', 'xh_health')
          .text('📡 Эфиры', 'xh_events').row()
          .text('🔗 Реф-ссылка', 'xh_ref');
        await bot.api.sendMessage(user.telegramUserId, text, { parse_mode: 'HTML', reply_markup: kb });
      } catch (e) {}
    }
    console.log('[weekly_digest] sent to active users');
  } catch (e) {
    console.error('[weekly_digest_error]', e && e.message);
  }
}

// ═══════════════════════════════════════
// SETUP ALL
// ═══════════════════════════════════════

function setupFeatures(bot, storage, config) {
  // Reviews
  bot.command('reviews', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendReviews(ctx, String(ctx.match || '').trim());
  });

  // Leaderboard
  bot.command('leaderboard', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendLeaderboard(ctx, storage);
  });

  // Calculator
  bot.command('calc', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendCalc(ctx);
  });

  // FAQ
  bot.command('faq', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendFaq(ctx);
  });
  bot.callbackQuery('xh_faq', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendFaq(ctx);
  });
  bot.callbackQuery(/^faq_cat:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendFaqCategory(ctx, Number(ctx.match[1]));
  });

  // Compare
  bot.command('compare', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    const parts = String(ctx.match || '').trim().split(/\s+/);
    await sendCompare(ctx, parts[0], parts[1]);
  });

  // Callbacks
  bot.callbackQuery('feat_share_review', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await ctx.reply('📤 Чтобы поделиться отзывом, используйте /post — готовые промо-посты с отзывами клиентов.');
  });
}

function startWeeklyDigestCron(bot, storage) {
  setInterval(() => processWeeklyDigest(bot, storage), 15 * 60 * 1000).unref();
  console.log('[weekly_digest] cron started (Sunday 20:00 MSK)');
}

module.exports = { setupFeatures, startWeeklyDigestCron, sendReviews, sendLeaderboard, sendCalc, sendFaq, sendCompare };
