// Golden Connect: рекламные инструменты.
// Команды: /promo, /post, /qr, /short, /hashtags, /aipost, /banner
// Callback: xh_promo
//
// Reply keyboard button: "🎯 Реклама"

const { InlineKeyboard, InputFile } = require('grammy');
const QRCode = require('qrcode');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 10 готовых промо-постов (взяты из site-content.js / cabinet.html)
const PROMO_POSTS = [
  { id: 'platform-overview', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'Golden Connect — рекламная платформа нового поколения',
    text: 'Хочешь зарабатывать на рекламе? Golden Connect — экосистема с распределённой прибылью. До $25/день за активность + 10-уровневая партнёрка. Регистрация бесплатна, выплаты с первого дня: {link}',
    tags: ['#Golden Connect', '#Реклама', '#Заработок'] },
  { id: 'earn-50', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'До $25 в день за активность — без продаж и звонков',
    text: 'Просмотры, клики, простые задания — Golden Connect платит за внимание. Регистрация за 1 минуту, начни зарабатывать сегодня: {link}',
    tags: ['#Golden Connect', '#Заработок', '#Дополнительныйдоход'] },
  { id: 'partner-status', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'Статус PARTNER = +10% к каждой выплате',
    text: 'Приведи 10 человек — получишь статус PARTNER и +10% ко всем начислениям пожизненно. Можно даже на бесплатном тарифе. Старт здесь: {link}',
    tags: ['#Golden Connect', '#PARTNER', '#Реферальная'] },
  { id: 'tariff-launch', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'LAUNCH $45 — твой вход в матрицу Golden Connect',
    text: 'Активация $45 + $15/мес. 1 бизнес-место, 12 уровней матрицы × $0.50, все 10 уровней партнёрки. Полный цикл — $4 095. Pre-launch + x2 Gift: {link}',
    tags: ['#LAUNCH', '#Golden Connect', '#PreLaunch'] },
  { id: 'tariff-boost', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'BOOST $90 — удвоенный доход с той же сети',
    text: '2 бизнес-места, 14 уровней × $0.60, все 10 линий партнёрки, $90 + $30/мес. Цикл — $19 660. Доход в 4.8× больше LAUNCH при той же сети: {link}',
    tags: ['#BOOST', '#Golden Connect', '#Тариф'] },
  { id: 'tariff-rocket', img: '/cabinet/img/goldenConnect-logo.jpg', title: 'ROCKET $135 — Matching Bonus + максимум',
    text: '3 места, 17 уровней × $0.70, все 10 линий партнёрки, Matching Bonus +10% от L1-L3, доступ к Лидерскому пулу, $135 + $45/мес. Цикл — $183 499: {link}',
    tags: ['#ROCKET', '#MatchingBonus', '#Golden Connect'] },
  { id: 'marketplace', img: '/cabinet/img/goldenConnect-logo.jpg', title: '🛒 Маркетплейс Golden Connect — твои товары, твоя прибыль',
    text: 'Продавай курсы, e-books, шаблоны и любые цифровые товары. Сплит 70% тебе / 30% в сеть (или больше — настраивается). QR-код и короткая ссылка автоматически. Магазин = твой лендинг: {link}',
    tags: ['#Маркетплейс', '#Golden Connect', '#ЦифровыеТовары'] },
  { id: 'adcenter', img: '/cabinet/img/goldenConnect-logo.jpg', title: '📡 AdCenter — TG-автопостинг с AI-рерайтом',
    text: 'Подключи свои Telegram-каналы → бот сам рассылает посты. Расписание, AI-рерайт каждой публикации (Groq Llama), мониторы YouTube/TikTok, Smart-очередь по лучшим часам. Внутри Golden Connect: {link}',
    tags: ['#AdCenter', '#Telegram', '#Автопостинг'] },
  { id: 'bio-page', img: '/cabinet/img/goldenConnect-logo.jpg', title: '🌐 Bio-страница Golden Connect — Linktree с витриной',
    text: 'Одна ссылка — все твои каналы + товары + соцсети. Конструктор блоков, Shop Widget с твоими товарами, A/B тесты, кастомный домен. Зарегистрируйся и сделай свою за 5 минут: {link}',
    tags: ['#Bio', '#Golden Connect', '#Linktree'] },
  { id: 'ai-tools', img: '/cabinet/img/goldenConnect-logo.jpg', title: '✨ AI-инструменты Golden Connect — копирайтер, captions, транскрибация',
    text: 'AI-копирайтер (5 тонов × 3 длины), AI Captions для постов, транскрибация YouTube/TikTok видео, генератор хэштегов, QR, сократитель ссылок. Всё внутри кабинета без подписок на сторонние сервисы: {link}',
    tags: ['#AI', '#Golden Connect', '#Инструменты'] },
];

const HASHTAG_POOLS = {
  антиэйдж: ['#AntiAge', '#Омоложение', '#Ревентус', '#Пептиды', '#Красота', '#Golden Connect'],
  тарифы: ['#Golden Connect', '#Тарифы', '#LAUNCH', '#BOOST', '#ROCKET'],
  энергия: ['#Энергия', '#Борофлавин', '#Тонус', '#ЗОЖ', '#Долголетие', '#Golden Connect'],
  суставы: ['#Суставы', '#Олигохит', '#Кости', '#Движение', '#Golden Connect'],
  default: ['#Golden Connect', '#Golden Connect', '#Натуральное', '#ЗОЖ', '#Долголетие'],
};

function getSiteBase() {
  return 'https://goldenConnect.to/cabinet';
}

function buildRefSiteLink(refCode) {
  return `${getSiteBase()}/?ref=${encodeURIComponent(refCode)}`;
}

function buildRefBotLink(botUsername, refCode) {
  return `https://t.me/${botUsername || 'Golden Connect_bizbot'}?start=ref_${encodeURIComponent(refCode)}`;
}

function getUserContext(ctx, storage) {
  let webUser = null;
  try { webUser = storage.ensureWebUserFromTelegram(ctx.from); } catch (e) {}
  const refCode = (webUser && webUser.referralCode) || 'guest';
  const botUsername = (ctx.me && ctx.me.username) || 'Golden Connect_bizbot';
  return {
    webUser,
    refCode,
    botUsername,
    siteLink: buildRefSiteLink(refCode),
    botLink: buildRefBotLink(botUsername, refCode),
  };
}

async function sendPromoMenu(ctx) {
  const kb = new InlineKeyboard()
    .text('📝 Готовый пост', 'promo:post_random').row()
    .text('🖼 Пост + фото', 'promo:post_photo_random').row()
    .text('📱 QR-код с реф-ссылкой', 'promo:qr').row()
    .text('🔗 Короткая ссылка', 'promo:short').row()
    .text('#️⃣ Хештеги', 'promo:hashtags').row()
    .text('🤖 AI-пост про Golden Connect', 'promo:aipost');

  await ctx.reply(
    '🎯 <b>Рекламные инструменты Golden Connect</b>\n\n' +
    'Выберите что вам нужно:\n\n' +
    '📝 <b>Готовые посты</b> — 10 шаблонов со ссылкой на ваш реф\n' +
    '🖼 <b>С фотографией продукта</b>\n' +
    '📱 <b>QR-код</b> — с вашей реф-ссылкой\n' +
    '🔗 <b>Short URL</b> — сократить любую ссылку\n' +
    '#️⃣ <b>Хештеги</b> — по теме\n' +
    '🤖 <b>AI-генератор</b> — пост через Groq AI',
    { parse_mode: 'HTML', reply_markup: kb }
  );
}

function pickRandomPost() {
  return PROMO_POSTS[Math.floor(Math.random() * PROMO_POSTS.length)];
}

function renderPost(post, siteLink) {
  const body = post.text.replace('{link}', siteLink);
  return `${body}\n\n${post.tags.join(' ')}`;
}

async function sendPost(ctx, storage, withPhoto) {
  const info = getUserContext(ctx, storage);
  const post = pickRandomPost();
  const text = renderPost(post, info.siteLink);

  const shareText = encodeURIComponent(text);
  const tgShareUrl = `https://t.me/share/url?url=${encodeURIComponent(info.siteLink)}&text=${shareText}`;
  const waShareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  const vkShareUrl = `https://vk.com/share.php?url=${encodeURIComponent(info.siteLink)}`;

  const kb = new InlineKeyboard()
    .url('📤 Telegram', tgShareUrl).url('💬 WhatsApp', waShareUrl).row()
    .url('👥 ВКонтакте', vkShareUrl).row()
    .text('🔄 Другой пост', 'promo:post_random')
    .text('🤖 AI вариант', 'promo:aipost');

  const photoUrl = withPhoto && post.img ? `${getSiteBase()}${post.img}` : null;
  if (photoUrl) {
    try {
      await ctx.replyWithPhoto(photoUrl, { caption: text.slice(0, 1024), reply_markup: kb });
      return;
    } catch (e) {
      // Fallback to text
    }
  }
  await ctx.reply(text, { reply_markup: kb, disable_web_page_preview: true });
}

async function sendQr(ctx, storage) {
  const info = getUserContext(ctx, storage);
  try {
    const buf = await QRCode.toBuffer(info.siteLink, {
      type: 'png',
      width: 800,
      margin: 2,
      color: { dark: '#10b981', light: '#0a0a0f' },
    });
    await ctx.replyWithPhoto(new InputFile(buf, 'xh-ref-qr.png'), {
      caption: `📱 <b>Ваш QR-код с реф-ссылкой</b>\n\n<code>${info.siteLink}</code>\n\nСохраните картинку и используйте в соцсетях, на визитках, в постах.`,
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error('[xh_promo_qr]', e && e.message);
    await ctx.reply('⚠️ Не удалось сгенерировать QR-код.');
  }
}

async function sendShortPrompt(ctx) {
  await ctx.reply(
    '🔗 <b>Короткая ссылка</b>\n\n' +
    'Отправьте команду в формате:\n' +
    '<code>/short https://example.com/очень-длинная-ссылка</code>\n\n' +
    'Я верну вам короткий URL вида <code>https://goldenConnect.to/cabinet/s/CODE</code>',
    { parse_mode: 'HTML' }
  );
}

async function handleShortCommand(ctx, storage) {
  const url = String(ctx.match || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    return ctx.reply('Использование: <code>/short https://example.com</code>', { parse_mode: 'HTML' });
  }
  try {
    // Try storage.createShortLink if exists
    if (typeof storage.createShortLink === 'function') {
      const info = getUserContext(ctx, storage);
      const item = storage.createShortLink({ url, userId: info.webUser && info.webUser.id });
      const shortUrl = `${getSiteBase()}/s/${item.code || item.id}`;
      return ctx.reply(
        `✅ Короткая ссылка готова:\n\n<code>${shortUrl}</code>\n\nОригинал: ${url}`,
        { parse_mode: 'HTML', disable_web_page_preview: true }
      );
    }
    // Fallback: just echo
    return ctx.reply(
      `🔗 Короткая ссылка временно недоступна. Используйте оригинал:\n\n${url}`,
      { disable_web_page_preview: true }
    );
  } catch (e) {
    console.error('[xh_promo_short]', e && e.message);
    await ctx.reply('⚠️ Ошибка создания короткой ссылки.');
  }
}

async function sendHashtags(ctx, topic) {
  const key = String(topic || '').toLowerCase().trim();
  const pool = HASHTAG_POOLS[key] || HASHTAG_POOLS.default;
  const all = [...pool, ...HASHTAG_POOLS.default].filter((v, i, a) => a.indexOf(v) === i);
  const text =
    '#️⃣ <b>Хештеги для постов</b>' + (key ? ` (тема: ${escapeHtml(key)})` : '') + '\n\n' +
    all.join(' ') + '\n\n' +
    '<i>Копируйте и вставляйте в свои посты.</i>';
  await ctx.reply(text, { parse_mode: 'HTML' });
}

async function sendAiPost(ctx, storage, config) {
  const info = getUserContext(ctx, storage);
  const groqKeys = getGroqKeys(config);
  if (!groqKeys.length) {
    return ctx.reply('⚠️ AI-генератор временно недоступен.');
  }
  try { await ctx.replyWithChatAction('typing'); } catch (e) {}
  const product = PROMO_POSTS[Math.floor(Math.random() * PROMO_POSTS.length)];
  // STRICT: AI MUST use the user's actual referral link, never invent URLs
  const prompt = [
    'Напиши короткий продающий пост для соцсетей (до 180 слов) про рекламную платформу Golden Connect.',
    'Golden Connect = рекламная платформа с распределённой прибылью. 4 способа заработка:',
    '1) Биржа заданий (подписки, отзывы, видео) — $0.05+ за каждое',
    '2) 10-уровневая партнёрка с мгновенными выплатами при покупке',
    '3) Запуск своих рекламных кампаний с AI-проверкой отчётов',
    '4) Маркетплейс цифровых товаров (сплит 70/30)',
    'Тарифы: FREE (бесплатно) / LAUNCH $45 / BOOST $90 / ROCKET $135 (с Matching Bonus +10%)',
    'Целевая аудитория: те кто хочет зарабатывать на рекламе и партнёрке.',
    'Стиль: живой, цепляющий, конкретные цифры, без клише.',
    '',
    '⚠️ КРИТИЧЕСКИ ВАЖНО ПРО ССЫЛКУ:',
    'Используй ТОЛЬКО эту реф-ссылку (это персональная ссылка автора поста, по ней он получит % с регистраций):',
    info.siteLink,
    'НЕ ВЫДУМЫВАЙ другие URL. НЕ пиши cabinet.goldenConnect.to, не пиши другие домены.',
    'Закончи призывом перейти по ссылке выше.',
    '',
    'В конце добавь 5 релевантных хештегов про заработок и партнёрку.',
    'НЕ упоминай БАДы, продукты для здоровья, эфиры с профессорами — у нас этого нет.',
  ].join('\n');

  try {
    const payload = await requestGroqChatCompletion([{ role: 'user', content: prompt }], {
      groqKeys,
      temperature: 0.8,
      maxTokens: 800,
      timeoutMs: 25000,
    });
    let result = (payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) || '';
    // Post-process: replace ANY URL containing goldenConnect.to or cabinet.goldenConnect.to with the user's actual ref link
    if (result && info.siteLink) {
      // Replace any URL that looks like goldenConnect domain (with or without ref param)
      result = result.replace(/https?:\/\/(cabinet\.)?goldenConnect\.biz[^\s\<\>"'\)\]]*/gi, info.siteLink);
      // Also catch any ref-code-shaped URLs that AI might invent
      result = result.replace(/cabinet\.goldenConnect\.biz[^\s\<\>"'\)\]]*/gi, info.siteLink);
    }
    const text = result || 'Не удалось сгенерировать пост.';
    const kb = new InlineKeyboard()
      .text('🔄 Сгенерировать ещё', 'promo:aipost').row()
      .text('🎯 Меню рекламы', 'xh_promo');
    await ctx.reply('🤖 <b>AI-пост</b>\n\n' + escapeHtml(text), {
      parse_mode: 'HTML',
      reply_markup: kb,
      disable_web_page_preview: true,
    });
  } catch (e) {
    await ctx.reply('⚠️ AI-генератор недоступен: ' + (e && e.message || 'unknown'));
  }
}

function setupPromo(bot, storage, config) {
  bot.command('promo', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendPromoMenu(ctx);
  });
  bot.command('post', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendPost(ctx, storage, true);
  });
  bot.command('qr', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendQr(ctx, storage);
  });
  bot.command('short', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    if (!String(ctx.match || '').trim()) return sendShortPrompt(ctx);
    await handleShortCommand(ctx, storage);
  });
  bot.command('hashtags', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendHashtags(ctx, String(ctx.match || '').trim());
  });
  bot.command('aipost', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendAiPost(ctx, storage, config);
  });

  // Callbacks
  bot.callbackQuery('xh_promo', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendPromoMenu(ctx);
  });
  bot.callbackQuery('promo:post_random', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendPost(ctx, storage, false);
  });
  bot.callbackQuery('promo:post_photo_random', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendPost(ctx, storage, true);
  });
  bot.callbackQuery('promo:qr', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendQr(ctx, storage);
  });
  bot.callbackQuery('promo:short', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendShortPrompt(ctx);
  });
  bot.callbackQuery('promo:hashtags', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendHashtags(ctx, '');
  });
  bot.callbackQuery('promo:aipost', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendAiPost(ctx, storage, config);
  });

  // Reply keyboard
  bot.hears('📢 Промо-материалы', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    try { await sendPromoMenu(ctx); } catch (e) { console.error('[promo hears]', e.message); }
  });

  bot.hears('🎯 Реклама', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendPromoMenu(ctx);
  });
}

module.exports = { setupPromo };
