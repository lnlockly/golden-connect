// Golden Connect Marketing Coach (reуses /symptoms + /health_ai endpoints for continuity).
//
// The x-health "AI symptom checker" is gone. These commands now run a dedicated
// Golden Connect partnership / invitation coach — quick personalised tactical advice
// without the long main-chat context.

const { buildCorePrompt } = require('../planner/bot/knowledge/core');
const { searchKnowledge, formatContext } = require('../planner/bot/knowledge/search');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function callGroq(messages, opts = {}) {
  const groqKeys = getGroqKeys(opts.groqKeys || opts.groqKey);
  if (!groqKeys.length) throw new Error('GROQ keys not set');
  return requestGroqChatCompletion(messages, {
    groqKeys,
    temperature: opts.temperature || 0.7,
    maxTokens: opts.maxTokens || 800,
    timeoutMs: 25000,
  }).then((payload) => (
    (payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) || ''
  ));
}

// Takes a user question (ANY topic around Golden Connect growth) and returns
// tactical advice — which commands to run, what to say, how to handle it.
async function goldenConnectAdvice(question, config) {
  const groqKeys = getGroqKeys(config);
  if (!groqKeys.length) {
    return 'AI временно недоступен. Пока — открой /promo или /ref и сделай первые действия вручную.';
  }

  let knowledgeBlock = '';
  try {
    const chunks = searchKnowledge(question, { maxResults: 5 });
    knowledgeBlock = formatContext(chunks, { maxChars: 2000 });
  } catch (e) {}

  const systemPrompt = [
    'Ты — AI-коуч партнёра Golden Connect. Отвечаешь коротко, конкретно и тактически — как ментор.',
    '',
    'ТЕМЫ которые ты покрываешь:',
    '- Как пригласить друга/коллегу/подписчика в Golden Connect',
    '- Что ответить на возражения ("где подвох?", "нет времени", "не умею продавать")',
    '- Какой тариф посоветовать (FREE → LAUNCH → BOOST → ROCKET)',
    '- Как работать с реф-ссылкой, лендингами, Gift-счётом',
    '- Как использовать биржу (разместить рекламу / взять задания)',
    '- Как запустить свой канал/группу в Telegram под реферальный трафик',
    '- Как провести /meet с 5-10 рефералами',
    '- Какие команды бота использовать под задачу (/ref, /promo, /aipost, /post, /qr, /short, /team, /events)',
    '',
    'ТЕМЫ которые ты НЕ покрываешь (мягко отказывай и возвращай к Golden Connect):',
    '- Здоровье, медицина, БАДы, симптомы, диагностика, лечение',
    '- Юридические вопросы, налоги',
    '- Общие бытовые темы',
    '',
    'ФОРМАТ ОТВЕТА:',
    '1. Короткий прямой совет (1-2 предложения сути).',
    '2. Конкретные команды бота / разделы кабинета которые нужно использовать.',
    '3. Пример фразы/скрипта если речь о переписке с рефералом.',
    '4. Без воды. Без общих фраз типа "работайте над собой". Только конкретика.',
    '',
    'Без markdown разметки. Используй эмодзи умеренно.',
    '',
    buildCorePrompt(),
    '',
    knowledgeBlock,
  ].join('\n');

  try {
    const result = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: String(question || '').slice(0, 600) },
    ], { groqKeys, maxTokens: 600, temperature: 0.7 });
    return result || 'AI не дал ответа. Попробуй переформулировать вопрос.';
  } catch (e) {
    return 'AI временно недоступен: ' + (e && e.message || 'ошибка соединения');
  }
}

function setupHealthAI(bot, storage, config) {
  // /advice — новое основное имя команды (коуч по Golden Connect)
  bot.command(['advice', 'coach'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    const text = String(ctx.match || '').trim();
    if (!text) {
      return ctx.reply(
        '🎯 <b>Golden Connect-коуч</b>\n\n' +
        'Спроси всё что связано с привлечением и заработком на Golden Connect — дам тактический совет.\n\n' +
        'Примеры:\n' +
        '<code>/advice как пригласить друга который скептик</code>\n' +
        '<code>/advice какой тариф посоветовать новичку без денег</code>\n' +
        '<code>/advice мой реферал молчит 2 недели что делать</code>\n' +
        '<code>/advice как запустить канал под Golden Connect</code>',
        { parse_mode: 'HTML' }
      );
    }
    try { await ctx.replyWithChatAction('typing'); } catch (e) {}
    const advice = await goldenConnectAdvice(text, config);
    await ctx.reply(escapeHtml(advice), { disable_web_page_preview: true });
  });

  // /symptoms и /health_ai — старые команды, теперь редиректят на /advice
  // и больше НЕ консультируют по здоровью (просто отдают Golden Connect-совет, если задан вопрос).
  bot.command(['symptoms', 'health_ai'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    const text = String(ctx.match || '').trim();
    if (!text) {
      return ctx.reply(
        '🎯 <b>Эта команда переехала</b>\n\n' +
        'Используй <code>/advice</code> — коуч по Golden Connect (приглашения, тарифы, инструменты, возражения).\n\n' +
        'По здоровью мы больше не консультируем — это не наша сфера.',
        { parse_mode: 'HTML' }
      );
    }
    try { await ctx.replyWithChatAction('typing'); } catch (e) {}
    const advice = await goldenConnectAdvice(text, config);
    await ctx.reply(escapeHtml(advice), { disable_web_page_preview: true });
  });
}

module.exports = { setupHealthAI, goldenConnectAdvice };
