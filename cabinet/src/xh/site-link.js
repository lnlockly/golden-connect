// Golden Connect: Bot ↔ Site link module.
//
// 1. /cabinet command + "🌐 Кабинет" reply button → magic auto-login link
// 2. /start link_TOKEN → complete TG link from site
//
// Deep link format: t.me/GoldenConnect_bizbot?start=link_<TOKEN>

const { InlineKeyboard } = require('grammy');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function setupSiteLink(bot, storage, config) {
  const siteBase = String(config.publicBaseUrl || 'https://goldenConnect.to/cabinet').replace(/\/$/, '');

  // /cabinet command — generate magic login link
  bot.command('cabinet', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendMagicLink(ctx, storage, siteBase);
  });

  // Reply keyboard "🌐 Кабинет"
  bot.hears('🌐 Кабинет', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendMagicLink(ctx, storage, siteBase);
  });

  // Inline callback from /start main menu
  bot.callbackQuery('xh_cabinet', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendMagicLink(ctx, storage, siteBase);
  });

  // Handle /start link_TOKEN deep link (from site → bot)
  // This is registered as middleware in bot.js (before alpha's /start) via events.js
  // But we also need to handle it here if events.js doesn't catch it.
  // Actually it's better to add it to events.js parseStartPayload.
  // For now, add a callbackless handler — events.js middleware will catch link_ prefix.
}

async function sendMagicLink(ctx, storage, siteBase) {
  let webUser = null;
  try {
    webUser = storage.ensureWebUserFromTelegram(ctx.from);
  } catch (e) {}

  if (!webUser) {
    return ctx.reply(
      '⚠️ Не удалось найти ваш профиль.\n\nОткройте ' + siteBase + ' и зарегистрируйтесь, затем привяжите Telegram в настройках.',
      { disable_web_page_preview: true }
    );
  }

  const result = storage.createMagicLink(ctx.from.id, { id: ctx.from.id, username: ctx.from.username || null, first_name: ctx.from.first_name || null, last_name: ctx.from.last_name || null });
  if (!result) {
    // webUser exists but not linked to this TG id — maybe different account
    return ctx.reply(
      '⚠️ Ваш Telegram не привязан к аккаунту на сайте.\n\n' +
      'Зайдите на сайт (' + siteBase + '/login) → Профиль → "Привязать Telegram" → ' +
      'откроется этот бот и привяжет автоматически.',
      { disable_web_page_preview: true }
    );
  }

  const magicUrl = `${siteBase}/auth/magic?token=${encodeURIComponent(result.token)}`;
  // 2 buttons: Mini App (web_app, auto-auth via Telegram.WebApp.initData)
  // + browser link (magic token, single-use 15 min).
  const kb = new InlineKeyboard()
    .webApp('📱 Открыть в Telegram', siteBase + '/cabinet').row()
    .url('🌐 Открыть на сайте', magicUrl);

  // [copyable-magic-url-2026-05-14] include the magic URL as <code> so the
  // user can long-tap to copy and paste into any browser (not just TG's
  // in-app one). The .url button still works for one-tap open.
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  await ctx.reply(
    '🌐 <b>Ваш персональный кабинет Golden Connect</b>\n\n' +
    'Выбери способ открыть кабинет:\n\n' +
    '📱 <b>В Telegram</b> — мини-приложение прямо в чате\n' +
    '🌐 <b>На сайте</b> — в браузере, авто-вход по защищённой ссылке\n\n' +
    '🔗 <b>Скопировать ссылку</b> (нажми, чтобы скопировать):\n' +
    '<code>' + escapeHtml(magicUrl) + '</code>\n\n' +
    '⏰ Действует 15 минут. Открывается один раз — после использования становится недействительной.',
    { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true }
  );
}

// Handle link_TOKEN from /start deep link (called from events.js middleware)
async function handleTelegramLink(ctx, token, storage) {
  const result = storage.completeTelegramLink(token, ctx.from);
  if (!result || !result.ok) {
    const reasons = {
      expired: 'Ссылка истекла. Зайдите на сайт → Профиль → "Привязать Telegram" ещё раз.',
      not_found: 'Ссылка не найдена. Зайдите на сайт → Профиль → "Привязать Telegram".',
      user_not_found: 'Аккаунт не найден.',
      invalid: 'Неверная ссылка.',
    };
    return ctx.reply('⚠️ ' + (reasons[result && result.reason] || 'Не удалось привязать.'));
  }

  const displayName = (result.user && (result.user.displayName || result.user.email)) || 'ваш аккаунт';
  await ctx.reply(
    `✅ <b>Telegram привязан к аккаунту на сайте!</b>\n\n` +
    `👤 ${escapeHtml(displayName)}\n` +
    `📱 @${escapeHtml(ctx.from.username || String(ctx.from.id))}\n\n` +
    `Теперь вы будете получать напоминания о продуктах, эфирах и задачах прямо в Telegram.\n\n` +
    `Используйте /cabinet чтобы в любой момент войти в кабинет без пароля.`,
    { parse_mode: 'HTML' }
  );
}

module.exports = { setupSiteLink, handleTelegramLink, sendMagicLink };
