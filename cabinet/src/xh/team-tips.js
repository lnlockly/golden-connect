// Golden Connect: AI-powered daily tip for team management.
// Uses Groq API to analyze current team state and give a personalized suggestion.

const { buildCorePrompt } = require('../planner/bot/knowledge/core');
const { searchKnowledge, formatContext } = require('../planner/bot/knowledge/search');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');

const TIP_CACHE = new Map(); // inviterId → { at, tip }
const CACHE_TTL_MS = 2 * 3600 * 1000; // 2 hours

function buildPrompt(inviter, refs, stats, nextActions) {
  const lines = [
    'Ты — AI-ментор для партнёра проекта Golden Connect.',
    'Проект: Golden Connect — рекламная экосистема с распределённой прибылью. Платформа оплачивает внимание аудитории (до $20/день), партнёры получают % от оборота. 10 уровней реф-программы, Matching Bonus, Лидерский пул, Gift-счёт.',
    'Главная цель — довести реферала до активации платного тарифа (LAUNCH $45 / BOOST $90 / ROCKET $135). Первый шаг — FREE-регистрация; статус Partner даётся за 10 приглашённых на любой тариф.',
    '',
    '=== ВОРОНКА СТАДИЙ РЕФЕРАЛА ===',
    '🟡 joined — зашёл в бот, ничего не делал',
    '🟢 onboarded — прошёл онбординг (выбрал имя секретаря, стиль)',
    '🔥 engaged — активный (подписался на эфир / создал задачи)',
    '✅ converted — поставил company link = ЦЕЛЬ ДОСТИГНУТА',
    '⚠️ dormant — 7+ дней тишины',
    '⚫ lost — 30+ дней тишины',
    '',
    '=== ИНСТРУМЕНТЫ В БОТЕ @GoldenConnect_bizbot ===',
    '/ref — личная реф-ссылка партнёра + короткая t2gift.com/{code} + статистика по 10 уровням',
    '/promo — меню рекламных материалов:',
    '  /post — готовый пост под кампанию + реф-ссылка',
    '  /qr — QR-код с реф-ссылкой (брендированный PNG для листовок/визиток)',
    '  /short <url> — короткая ссылка t2gift.com/CODE для трекинга кликов',
    '  /hashtags — подборки хэштегов под Golden Connect-темы',
    '  /aipost — AI генерирует уникальный пост через Groq',
    '/team — текущая команда, воронка стадий, карточки рефералов',
    '/advice — Golden Connect-коуч: быстрые советы по приглашению, возражениям, тарифам',
    '🎯 Разместить рекламу (меню) — запуск платной кампании на бирже (подписки/задания)',
    '💰 Задания (заработать) (меню) — выполнять задания других партнёров за деньги',
    '/cabinet — вход в кабинет без пароля (там 17+ лендингов с автоподстановкой реф-кода)',
    '/meet — видеоконференция для группового онбординга рефералов',
    '/today /tomorrow /week — задачи в планировщике',
    '/add — создать задачу',
    '',
    '=== ЧТО МОЖЕТ ДЕЛАТЬ ПАРТНЁР ===',
    '1. Делиться реф-ссылкой через /ref (прямая ссылка и короткая t2gift.com)',
    '2. Использовать готовые посты из /promo + делать уникальные через /aipost',
    '3. Создавать QR-код через /qr для оффлайн-материалов (листовки, визитки)',
    '4. Писать рефералам напрямую через карточки в /team',
    '5. Запустить платную кампанию на бирже (🎯 Разместить рекламу) из Gift-счёта',
    '6. Провести /meet-встречу на 5-10 рефералов для группового онбординга',
    '7. Использовать /advice для тактических советов по конкретной ситуации',
    '',
    '=== ТЕКУЩЕЕ СОСТОЯНИЕ КОМАНДЫ ===',
    `Партнёр: ${inviter.displayName || inviter.email || 'Партнёр'}`,
    `Всего рефералов: ${stats.total}`,
    `Активных: ${stats.engaged}, Онбординг: ${stats.onboarded}, Зашли: ${stats.joined}, В компании: ${stats.converted}, Уснуло: ${stats.dormant}, Lost: ${stats.lost}`,
    '',
  ];
  if (nextActions && nextActions.length) {
    lines.push('=== РЕФЕРАЛЫ ТРЕБУЮЩИЕ ВНИМАНИЯ ===');
    nextActions.slice(0, 5).forEach((a, i) => {
      const name = a.ref.displayName || a.ref.email || `User${a.ref.id}`;
      const username = a.ref.telegramUsername ? ` (@${a.ref.telegramUsername.replace(/^@/, '')})` : '';
      const stage = a.ref.referralStage || 'joined';
      const last = a.ref.lastActivityAt ? new Date(a.ref.lastActivityAt).toLocaleDateString('ru-RU') : 'никогда';
      lines.push(`${i + 1}. ${name}${username} — стадия: ${stage}, последняя активность: ${last} — причина: ${a.reason}`);
    });
    lines.push('');
  }
  lines.push('=== ЗАДАНИЕ ===');
  lines.push('Дай КРАТКИЙ персонализированный совет (до 200 слов) на сегодня:');
  lines.push('1. Кого конкретно написать СЕЙЧАС (имя/username) — выбери самого тёплого из списка.');
  lines.push('2. Что именно написать (пример фразы 1-2 предложения).');
  lines.push('3. Какой инструмент бота использовать (укажи КОНКРЕТНУЮ команду).');
  lines.push('   Например: "Возьми пост из /post, отправь в личку. Или сгенерируй уникальный через /aipost".');
  lines.push('4. Почему именно этот человек и этот подход сработают.');
  lines.push('');
  lines.push('ВАЖНО:');
  lines.push('- НЕ говори общих фраз "поделитесь реф-ссылкой" — у нас есть конкретные инструменты.');
  lines.push('- Всегда называй конкретные команды бота: /post, /qr, /aipost, /short, /events.');
  lines.push('- Учитывай стадию: для joined — приветствие, для onboarded — рассказать про эфир,');
  lines.push('  для engaged — обсудить компанию, для dormant — вернуть через ценность.');
  lines.push('- Если команда пустая — посоветуй сделать первый /post или /qr и отправить 5 знакомым.');
  lines.push('- Пиши как живой ментор по-русски, без воды.');
  return lines.join('\n');
}

async function callGroq(prompt, groqConfig) {
  const groqKeys = getGroqKeys(groqConfig);
  if (!groqKeys.length) throw new Error('GROQ keys not set');
  const payload = await requestGroqChatCompletion([{ role: 'user', content: prompt }], {
    groqKeys,
    temperature: 0.8,
    maxTokens: 600,
    timeoutMs: 25000,
  });
  return (payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) || '';
}

async function generateTeamTip(storage, inviter, config, opts = {}) {
  if (!inviter || !inviter.id) return null;
  if (opts.force) TIP_CACHE.delete(inviter.id);
  const cached = TIP_CACHE.get(inviter.id);
  if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) return cached.tip;

  const stats = storage.getTeamStats(inviter.id);
  const refs = storage.listInviteeReferrals(inviter.id);
  const nextActions = storage.getNextActions(inviter.id);

  // Fallback shallow tip for empty team
  if (stats.total === 0) {
    const tip = [
      'Команда пока пустая — идеальный момент начать!',
      '',
      '🛠 Используйте инструменты бота:',
      '/ref — ваша персональная реф-ссылка + статистика',
      '/post — готовый промо-пост с фото продукта',
      '/qr — QR-код для оффлайн-материалов',
      '/aipost — AI генерирует уникальный пост',
      '',
      '🎯 План на сегодня:',
      '1. /post → возьмите готовый пост',
      '2. Отправьте 5 знакомым, которым может быть интересна тема Golden Connect',
      '3. Не массово — лично, с короткой подписью "узнал про проект, посмотри"',
      '',
      'Главное правило: не больше 5 человек за раз. Контекст важнее количества.',
    ].join('\n');
    TIP_CACHE.set(inviter.id, { at: Date.now(), tip });
    return tip;
  }

  const groqKeys = getGroqKeys(config);
  if (!groqKeys.length) {
    // Fallback without AI — but still mentions specific tools
    const tip = nextActions.length
      ? [
          `У вас ${nextActions.length} рефералов, которым нужно внимание.`,
          '',
          'Начните с самого тёплого — откройте /team и нажмите карточку.',
          '',
          'Используйте /post или /aipost для свежего поста, /qr для QR-кода.',
          'Можно сгенерировать /short — короткую ссылку под трек.',
        ].join('\n')
      : [
          'Все на связи. Используйте это время чтобы пригласить новых партнёров.',
          '',
          'Инструменты:',
          '/post — готовый пост с фото',
          '/aipost — AI пост',
          '/qr — QR-код',
          '/ref — ваша ссылка',
        ].join('\n');
    TIP_CACHE.set(inviter.id, { at: Date.now(), tip });
    return tip;
  }

  try {
    // RAG: fetch relevant knowledge (about team/partnership/broadcasts)
    let knowledgeBlock = '';
    try {
      const refTopics = nextActions && nextActions.length
        ? nextActions.slice(0, 3).map(a => a.reason).join(' ')
        : 'партнёрство реферал эфир';
      const chunks = searchKnowledge('команда партнёр эфир ' + refTopics, { maxResults: 3 });
      knowledgeBlock = formatContext(chunks, { maxChars: 1500 });
    } catch (e) {}

    const prompt = buildCorePrompt() + '\n\n' + knowledgeBlock + '\n\n' + buildPrompt(inviter, refs, stats, nextActions);
    const tip = await callGroq(prompt, groqKeys);
    if (tip) TIP_CACHE.set(inviter.id, { at: Date.now(), tip });
    return tip;
  } catch (e) {
    console.error('[team_tip_groq]', e && e.message);
    return 'AI временно недоступен. Совет: свяжитесь с теми рефералами, которые недавно были активны.';
  }
}

module.exports = { generateTeamTip };
