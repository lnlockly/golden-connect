// Golden Connect: Health quiz — 5 questions → personalized protocol recommendation.
// Entry: callback xh_quiz_start, command /quiz
// Flow: question → inline buttons → next question → result with protocol + start button

const { InlineKeyboard } = require('grammy');
const { PROTOCOLS, getProduct } = require('./health-protocols');

const QUESTIONS = [
  {
    id: 'concern',
    text: '🎯 <b>Шаг 1/5:</b> Что вас больше всего беспокоит?',
    options: [
      { text: '🛡 Иммунитет / простуды', value: 'immunity' },
      { text: '⚡ Усталость / нет энергии', value: 'energy' },
      { text: '✨ Кожа / морщины / anti-age', value: 'antiage' },
      { text: '🦴 Суставы / кости', value: 'joints' },
      { text: '🍃 Детокс / очищение', value: 'detox' },
      { text: '💄 Косметология', value: 'cosmetology' },
    ],
  },
  {
    id: 'age',
    text: '📅 <b>Шаг 2/5:</b> Ваш возраст?',
    options: [
      { text: '18-30', value: '18-30' },
      { text: '30-45', value: '30-45' },
      { text: '45-60', value: '45-60' },
      { text: '60+', value: '60+' },
    ],
  },
  {
    id: 'experience',
    text: '💊 <b>Шаг 3/5:</b> Принимали раньше БАДы или натуральные продукты?',
    options: [
      { text: 'Да, регулярно', value: 'regular' },
      { text: 'Иногда', value: 'sometimes' },
      { text: 'Нет, впервые', value: 'never' },
    ],
  },
  {
    id: 'budget',
    text: '💰 <b>Шаг 4/5:</b> Комфортный бюджет на месяц?',
    options: [
      { text: 'До 3000₽', value: 'low' },
      { text: '3000-6000₽', value: 'medium' },
      { text: '6000₽+', value: 'high' },
    ],
  },
  {
    id: 'goal',
    text: '🎯 <b>Шаг 5/5:</b> Главная цель?',
    options: [
      { text: 'Укрепить здоровье', value: 'health' },
      { text: 'Решить конкретную проблему', value: 'problem' },
      { text: 'Профилактика', value: 'prevention' },
      { text: 'Красота и молодость', value: 'beauty' },
    ],
  },
];

// Map answers → protocol ID
function recommendProtocol(answers) {
  const concern = answers.concern || 'immunity';
  // Direct mapping from concern to protocol
  const map = {
    immunity: 'immunity',
    energy: 'energy',
    antiage: 'antiage',
    joints: 'joints',
    detox: 'detox',
    cosmetology: 'cosmetology',
  };
  let protocolId = map[concern] || 'immunity';
  // Adjust by goal
  if (answers.goal === 'beauty' && protocolId === 'immunity') protocolId = 'antiage';
  if (answers.goal === 'problem' && answers.concern === 'energy') protocolId = 'rehabilitation';
  return protocolId;
}

// User sessions (in-memory, cleared on restart — OK for quiz)
const quizSessions = new Map(); // tgUserId → { step, answers }

function setupHealthQuiz(bot, storage, config) {
  // Start quiz
  bot.command('quiz', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await startQuiz(ctx);
  });

  bot.callbackQuery('xh_quiz_start', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await startQuiz(ctx);
  });

  // Answer callbacks: quiz_<questionId>_<value>
  bot.callbackQuery(/^quiz_(\w+)_(.+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const questionId = ctx.match[1];
    const value = ctx.match[2];
    const session = quizSessions.get(ctx.from.id) || { step: 0, answers: {} };
    session.answers[questionId] = value;

    // Find next question
    const currentIdx = QUESTIONS.findIndex(q => q.id === questionId);
    const nextIdx = currentIdx + 1;

    if (nextIdx < QUESTIONS.length) {
      session.step = nextIdx;
      quizSessions.set(ctx.from.id, session);
      await sendQuestion(ctx, nextIdx);
    } else {
      // Quiz complete — show result
      quizSessions.delete(ctx.from.id);
      await showResult(ctx, session.answers);
    }
  });
}

async function startQuiz(ctx) {
  quizSessions.set(ctx.from.id, { step: 0, answers: {} });
  await ctx.reply(
    '🧪 <b>Подбор протокола Golden Connect</b>\n\nОтветьте на 5 вопросов — и я подберу идеальный курс здоровья для вас.\n\nЭто займёт 1 минуту.',
    { parse_mode: 'HTML' }
  );
  await sendQuestion(ctx, 0);
}

async function sendQuestion(ctx, index) {
  const q = QUESTIONS[index];
  if (!q) return;
  const kb = new InlineKeyboard();
  q.options.forEach((opt, i) => {
    kb.text(opt.text, `quiz_${q.id}_${opt.value}`);
    if ((i + 1) % 2 === 0 || i === q.options.length - 1) kb.row();
  });
  await ctx.reply(q.text, { parse_mode: 'HTML', reply_markup: kb });
}

async function showResult(ctx, answers) {
  const protocolId = recommendProtocol(answers);
  const proto = PROTOCOLS[protocolId];
  if (!proto) {
    return ctx.reply('Не удалось подобрать протокол. Попробуйте /health');
  }

  const products = proto.products.map(slug => getProduct(slug)).filter(Boolean);
  const lines = [
    '✅ <b>Ваш персональный протокол готов!</b>',
    '',
    `${proto.emoji} <b>${proto.title}</b> (${proto.duration} дней)`,
    '',
    proto.description,
    '',
    '<b>Состав:</b>',
  ];
  for (const p of products) {
    lines.push(`${p.emoji} <b>${p.name}</b> — ${p.defaultDose}`);
    lines.push(`   ⏰ ${p.defaultSchedule.join(', ')}`);
  }
  lines.push('');
  lines.push('🔥 Бот будет напоминать о каждом приёме.');
  lines.push('📊 Прогресс, стрики и чек-ин самочувствия.');

  const kb = new InlineKeyboard()
    .text(`✅ Запустить "${proto.title}"`, `hc_protocol_start:${protocolId}`).row()
    .text('🔄 Пройти заново', 'xh_quiz_start')
    .text('💊 Все протоколы', 'hc_protocols');

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

module.exports = { setupHealthQuiz };
