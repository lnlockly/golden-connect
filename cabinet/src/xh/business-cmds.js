// Golden Connect business-side bot commands: tariffs, balance, jobs, campaigns,
// withdraw, topup. Replaces a chunk of the legacy x-health surface.

const { InlineKeyboard } = require('grammy');
const { getBalance } = require('../services/balance-bridge');
const db = require('../planner/db/database');

const TARIFFS = [
  { code: 'free',   name: 'FREE',   entry: 0,   monthly: 0,  seats: 0, depth: 0, rate: 0,    cycle: 0,    levels: 'L1 (10%)', matching: false, badge: '🆓' },
  { code: 'launch', name: 'LAUNCH', entry: 45,  monthly: 15, seats: 1, depth: 12, rate: 0.50, cycle: 4095,   levels: 'all 10 lines', matching: false, badge: '🚀' },
  { code: 'boost',  name: 'BOOST',  entry: 90,  monthly: 30, seats: 2, depth: 14, rate: 0.60, cycle: 19660,  levels: 'all 10 lines', matching: false, badge: '⚡' },
  { code: 'rocket', name: 'ROCKET', entry: 135, monthly: 45, seats: 3, depth: 17, rate: 0.70, cycle: 183499, levels: 'all 10 lines + Matching Bonus', matching: true, badge: '🔥' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtUsd(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }

function buildCabUrl(config, path) {
  const base = (config && config.publicBaseUrl ? config.publicBaseUrl : 'https://golden-connect.to/cabinet').replace(/\/+$/, '');
  return base + path;
}

function setupBusinessCmds(bot, storage, config) {
  // [group-redirect-silent] In a group, send a private DM to the user instead of replying in chat.
  // If the user never started the bot, sendMessage throws (forbidden) and we silently swallow.
  async function _groupRedirect(ctx, payload, label) {
    const fromId = ctx.from && ctx.from.id;
    if (!fromId) return;
    try {
      await ctx.api.sendMessage(
        fromId,
        '💡 Ты написал /' + payload + ' в группе.\n\n' + label + ' работает прямо здесь, в личке.\nНажми /' + payload + ' ещё раз — я открою.',
        { parse_mode: 'HTML' }
      );
    } catch (_) {
      // user hasn't started bot or blocked it — silent
    }
  }
  // ── /tariffs — list of all tariffs with prices and CTA to cabinet ──
  async function sendTariffsCard(ctx) {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    const lines = ['🚀 <b>Тарифы Golden Connect</b>', ''];
    TARIFFS.forEach((t) => {
      lines.push(`${t.badge} <b>${t.name}</b>${t.entry === 0 ? ' (бесплатно)' : ` — $${t.entry} + $${t.monthly}/мес`}`);
      if (t.seats === 0) {
        lines.push('   • Только биржа заданий + L1 партнёрка (10%)');
      } else {
        lines.push(`   • Бизнес-мест: <b>${t.seats}</b> · Матрица: <b>${t.depth}</b> × $${t.rate.toFixed(2)}`);
        lines.push(`   • Партнёрка: ${t.levels}${t.matching ? ' · ✅ Matching +10%' : ''}`);
        lines.push(`   • Цикл: <b>$${t.cycle.toLocaleString('ru-RU')}</b>`);
      }
      lines.push('');
    });
    lines.push('💵 Оплата: карта/СБП (Platega) или USDT (CryptoBot)');
    const kb = new InlineKeyboard()
      .url('🚀 Купить тариф', buildCabUrl(config, '/cabinet#/marketing')).row()
      .text('⚖️ Сравнить', 'cmp_tariffs')
      .text('💰 Калькулятор', 'calc_tariff');
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  }


  // [group-redirect] /start payload dispatcher — handles deep-links from group → DM
  bot.command('start', async (ctx, next) => {
    try {
      if (!ctx.chat || ctx.chat.type !== 'private') return next();
      const payload = (ctx.match || '').trim();
      if (!payload) return next();
      // Map deep-link payload → invoke same handler we have in this file
      switch (payload) {
        case 'tariffs':  return sendTariffsCard(ctx);
        case 'jobs':
          return ctx.reply('💰 Открываю биржу заданий…', {
            reply_markup: new InlineKeyboard()
              .text('📢 Подписки', 'exec_subs').text('📝 С отчётом', 'exec_tasks').row()
              .text('🎬 Видео', 'exec_video').text('💼 Мои заявки', 'exec_claims'),
          });
        case 'balance':
        case 'topup':
        case 'withdraw':
        case 'campaigns':
        case 'recommend':
        case 'mentor':
        case 'trdx':
          // Quick hint — let user re-tap the command (auto-clickable in Telegram).
          return ctx.reply('Жми /' + payload + ' прямо здесь — открою.');
        case 'hi':
          // Generic warm hello, falls through to planner /start menu.
          break;
      }
    } catch (e) { console.error('[group-redirect /start]', e && e.message); }
    return next();
  });

    bot.command(['tariffs','tariff'], async (ctx) => { if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'tariffs', '🚀 Тарифы'); return sendTariffsCard(ctx); });
  bot.hears('🚀 Тарифы', async (ctx) => { if (ctx.chat && ctx.chat.type !== 'private') return; return sendTariffsCard(ctx); });

  bot.callbackQuery('open_tariffs', async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply(
      '🚀 Открыть тарифы и оплатить — в кабинете:\n' + buildCabUrl(config, '/cabinet#/marketing'),
      { reply_markup: new InlineKeyboard().url('🚀 Открыть', buildCabUrl(config, '/cabinet#/marketing')) }
    );
  });

  // ── /balance — quick balance check ──
  bot.command('balance', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'balance', '💰 Баланс');
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const r = rawDb.prepare('SELECT gift_balance_cents, earned_balance_cents, ads_karma FROM users WHERE id = ?').get(u.id) || {};
    const gift = r.gift_balance_cents || 0;
    const earned = r.earned_balance_cents || 0;
    const karma = r.ads_karma ?? 100;
    const karmaIcon = karma >= 80 ? '🟢' : karma >= 40 ? '🟡' : '🔴';
    const text = [
      '💰 <b>Твой баланс</b>',
      '',
      `💵 Заработано: <b>${fmtUsd(earned)}</b>${earned >= 300 ? ' · доступен вывод' : '  · вывод от $3'}`,
      `🎁 Gift (своя реклама): <b>${fmtUsd(gift)}</b>`,
      `${karmaIcon} Карма: <b>${karma}</b>`,
      '',
      'Подробнее: /results',
    ].join('\n');
    const kb = new InlineKeyboard()
      .text('💸 Вывести', 'open_withdraw')
      .text('💵 Пополнить gift', 'open_topup').row()
      .text('📊 Подробно', 'my_results');
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb });
  });

  // ── /jobs — alias for biржа ──
  bot.command(['jobs', 'work'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'jobs', '💰 Биржа заданий');
    await ctx.reply('💰 Открываю биржу заданий…', {
      reply_markup: new InlineKeyboard()
        .text('📢 Подписки', 'exec_subs')
        .text('📝 С отчётом', 'exec_tasks').row()
        .text('🎬 Видео', 'exec_video')
        .text('💼 Мои заявки', 'exec_claims'),
    });
  });

  // ── /campaigns — мои кампании ──
  bot.command('campaigns', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'campaigns', '📢 Мои кампании');
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const camps = rawDb.prepare(
      'SELECT id, kind, title, status, completed_count, target_count, reward_cents FROM ad_campaigns WHERE owner_user_id = ? ORDER BY id DESC LIMIT 10'
    ).all(u.id);
    if (!camps.length) {
      return ctx.reply('📢 У тебя пока нет кампаний.\n\nЗапусти первую — нажми «🎯 Разместить рекламу» в нижнем меню.',
        { reply_markup: new InlineKeyboard().text('🎯 Запустить', 'adv_menu') });
    }
    const lines = ['📢 <b>Мои кампании</b>', ''];
    const kindIcon = { subscribe: '📢', task: '📝', video: '🎬' };
    camps.forEach((c) => {
      const remaining = (c.target_count || 0) - (c.completed_count || 0);
      const statusIcon = c.status === 'active' ? '🟢' : c.status === 'paused' ? '⏸' : c.status === 'done' ? '✅' : '·';
      lines.push(`${statusIcon} ${kindIcon[c.kind] || '·'} <b>#${c.id}</b> ${escapeHtml((c.title || '').slice(0, 50))}`);
      lines.push(`    ${fmtUsd(c.reward_cents)} × ${c.completed_count}/${c.target_count} (${remaining} осталось)`);
    });
    const kb = new InlineKeyboard()
      .text('🎯 Новая', 'adv_menu')
      .text('📥 На проверке', 'adv_pending').row()
      .url('📊 Подробнее в кабинете', buildCabUrl(config, '/cabinet#/ads'));
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  });

  // ── /withdraw — quick link to withdraw page ──
  bot.command(['withdraw', 'cashout'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'withdraw', '💸 Вывод');
    const u = db.ensureUser(ctx.from);
    // Phase H: read from api Postgres (single source of truth)
    const bal = await getBalance({ tgId: ctx.from.id });
    const earned = bal.working_cents;
    if (earned < 300) {
      return ctx.reply(
        `💸 <b>Вывод</b>\n\nТекущий earned-баланс: <b>${fmtUsd(earned)}</b>\nМинимум для заявки: <b>$3.00</b>\n\nПродолжай выполнять задания и приглашать партнёров.`,
        { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('💰 Найти задания', 'exec_subs') }
      );
    }
    await ctx.reply(
      `💸 <b>Заявка на вывод</b>\n\nДоступно: <b>${fmtUsd(earned)}</b>\nПодай заявку в кабинете — администратор обработает вручную в течение 24ч.`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💸 Открыть вывод', buildCabUrl(config, '/cabinet#/withdrawals')) }
    );
  });

  // ── /topup — top up gift balance ──
  bot.command(['topup', 'deposit'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return _groupRedirect(ctx, 'topup', '💵 Пополнение');
    await ctx.reply(
      '💵 <b>Пополнить gift-баланс</b>\n\nGift используется для оплаты твоих рекламных кампаний.\nМинимум: $5\nМетоды: USDT (CryptoBot), карта/СБП (Platega)',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().url('💵 Пополнить', buildCabUrl(config, '/cabinet#/ads')) }
    );
  });

  // ── support callbacks: cmp_tariffs / calc_tariff / adv_pending ──
  bot.callbackQuery('cmp_tariffs', async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply('Сравнение: /compare launch boost  · или /compare boost rocket');
  });
  bot.callbackQuery('calc_tariff', async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply('Калькулятор: /calc');
  });
  bot.callbackQuery('adv_pending', async (ctx) => {
    await ctx.answerCallbackQuery();
    return ctx.reply('📥 На проверке — открой в кабинете:\n' + buildCabUrl(config, '/cabinet#/ads'));
  });

  // ── /recommend — AI рекомендатель тарифа ──
  bot.command(['recommend', 'whichplan'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return _groupRedirect(ctx, 'recommend', '🎯 AI-подбор тарифа');
    const session = ctx.session = ctx.session || {};
    session.recommendStep = 'budget';
    session.recommendData = {};
    await ctx.reply(
      '🤖 <b>AI-рекомендатель тарифа</b>\n\nОтвечу за 3 вопроса, какой тариф тебе подходит.\n\n<b>1/3</b> Какой бюджет на старт?',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
        .text('💵 До $50', 'rec_budget:low').row()
        .text('💰 $50-150', 'rec_budget:mid').row()
        .text('💎 От $150', 'rec_budget:high').row() }
    );
  });

  bot.callbackQuery(/^rec_budget:(low|mid|high)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = ctx.session = ctx.session || {};
    s.recommendData = s.recommendData || {};
    s.recommendData.budget = ctx.match[1];
    s.recommendStep = 'experience';
    await ctx.reply(
      '<b>2/3</b> Опыт в сетевом маркетинге?',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
        .text('🌱 Новичок', 'rec_exp:new').row()
        .text('🌿 Есть опыт', 'rec_exp:mid').row()
        .text('🌳 Профессионал', 'rec_exp:pro').row() }
    );
  });

  bot.callbackQuery(/^rec_exp:(new|mid|pro)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = ctx.session = ctx.session || {};
    s.recommendData = s.recommendData || {};
    s.recommendData.experience = ctx.match[1];
    s.recommendStep = 'goal';
    await ctx.reply(
      '<b>3/3</b> Главная цель?',
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
        .text('💼 Подработка', 'rec_goal:side').row()
        .text('💰 Полная замена дохода', 'rec_goal:replace').row()
        .text('🚀 Большой бизнес', 'rec_goal:scale').row() }
    );
  });

  bot.callbackQuery(/^rec_goal:(side|replace|scale)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const s = ctx.session = ctx.session || {};
    s.recommendData = s.recommendData || {};
    s.recommendData.goal = ctx.match[1];
    const d = s.recommendData;
    // Decision matrix
    let pick = 'launch';
    let why = '';
    if (d.budget === 'high' && d.goal === 'scale') {
      pick = 'rocket';
      why = 'У тебя есть бюджет и цель масштабироваться. ROCKET даёт 3 бизнес-места, 15 уровней матрицы и Matching Bonus +10%.';
    } else if (d.budget === 'high' || (d.experience === 'pro' && d.budget === 'mid')) {
      pick = 'rocket';
      why = 'Ты опытный или с большим бюджетом. ROCKET окупится быстрее всего за счёт Matching Bonus.';
    } else if (d.budget === 'mid' || d.goal === 'replace') {
      pick = 'boost';
      why = 'Средний бюджет + серьёзная цель. BOOST даёт 2 бизнес-места и цикл $19 660.';
    } else if (d.experience === 'new' && d.budget === 'low') {
      pick = 'launch';
      why = 'Стартуем с минимума. LAUNCH ($45) — самый дешёвый платный тариф, окупается на 7-15 рефералах.';
    } else {
      pick = 'launch';
      why = 'Безопасный старт. LAUNCH даст разобраться с системой без больших вложений.';
    }
    const tariffs = {
      launch: { name: 'LAUNCH', price: '$45 + $15/мес', features: ['1 место', 'матрица 12×$0.5', 'все 10 линий', 'цикл $4 095'] },
      boost:  { name: 'BOOST',  price: '$90 + $30/мес', features: ['2 места', 'матрица 14×$0.6', 'все 10 линий', 'цикл $19 660'] },
      rocket: { name: 'ROCKET', price: '$135 + $45/мес', features: ['3 места', 'матрица 17×$0.7', 'все 10 линий', 'Matching +10%', 'цикл $183 499'] },
    };
    const t = tariffs[pick];
    const lines = [
      '🤖 <b>AI рекомендует: ' + t.name + '</b>',
      '',
      '💡 <b>Почему:</b>',
      why,
      '',
      '🚀 <b>' + t.name + ' — ' + t.price + '</b>',
      ...t.features.map(f => '   • ' + f),
      '',
      'Перейди в кабинет чтобы оплатить:',
    ];
    s.recommendStep = null; s.recommendData = null;
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: new InlineKeyboard()
      .text('🚀 Открыть тарифы', 'open_tariffs').row()
      .text('⚖️ Сравнить с другими', 'cmp_tariffs') });
  });

  // ── /mentor — AI-коуч (короткий план на день/неделю) ──
  bot.command(['mentor', 'coach'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return _groupRedirect(ctx, 'mentor', '🎓 AI-Mentor');
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    // Phase H: read from api Postgres
    const bal = await getBalance({ tgId: ctx.from.id });
    const earned = { earned_balance_cents: bal.working_cents, gift_balance_cents: bal.gift_cents, ads_karma: bal.karma };
    const tasksDone = rawDb.prepare(
      "SELECT COUNT(DISTINCT claim_id) AS n FROM ad_transactions WHERE user_id = ? AND kind = 'reward'"
    ).get(u.id)?.n || 0;
    const camps = rawDb.prepare('SELECT COUNT(*) AS n FROM ad_campaigns WHERE owner_user_id = ?').get(u.id)?.n || 0;

    let stage = 'newbie';
    if (camps > 0 && tasksDone > 5) stage = 'active';
    else if (tasksDone > 5) stage = 'executor';
    else if (earned.gift_balance_cents > 500) stage = 'has_budget';

    const PLAN = {
      newbie: [
        '🌱 <b>План для новичка</b>',
        '',
        'Шаг 1 — выполни первое задание на бирже (5 минут).',
        '   /jobs → выбери канал → подпишись → получи $0.05+',
        '',
        'Шаг 2 — поделись своей реф-ссылкой с 3 знакомыми.',
        '   /ref → скопируй ссылку → отправь друзьям',
        '',
        'Шаг 3 — пройди /missions (7 миссий, базовый онбординг).',
      ],
      executor: [
        '⚡ <b>План для исполнителя</b>',
        '',
        'У тебя уже есть опыт на бирже. Время масштабироваться:',
        '',
        '1. Возьми 5-10 заданий за день — это до $1 чистыми.',
        '2. Создай свою первую кампанию ($5 = ~50-100 подписчиков на твой канал).',
        '3. Запусти партнёрку — /promo → /aipost → пост со своей ссылкой.',
      ],
      has_budget: [
        '💰 <b>План: есть бюджет</b>',
        '',
        'У тебя ' + fmtUsd(earned.gift_balance_cents) + ' в gift — пора инвестировать в свой рост:',
        '',
        '1. Запусти подписку на канал ($5 → 50 подписчиков).',
        '2. Запусти кастомное задание «оставь отзыв под нашим постом» ($10 → 100 отзывов).',
        '3. Активируй тариф LAUNCH ($45 — окупается за 5-10 рефералов).',
      ],
      active: [
        '🚀 <b>План для активного партнёра</b>',
        '',
        'Ты уже в системе. Растим объёмы:',
        '',
        '1. Запусти видео-кампанию (просмотр + quiz) — лучшая конверсия в подписчики.',
        '2. Подними тариф до BOOST/ROCKET для Matching Bonus.',
        '3. Используй /team для пинга «уснувших» рефералов.',
        '4. Поставь цель: /goals «10 рефералов с тарифом за месяц».',
      ],
    };
    const lines = PLAN[stage] || PLAN.newbie;
    lines.push('');
    lines.push('💡 Получай новый план каждый раз: /mentor');
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  console.log('[business-cmds] /recommend /mentor (Phase 5) ready');

}

module.exports = { setupBusinessCmds };
