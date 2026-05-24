const cron = require('node-cron');
const { InlineKeyboard } = require('grammy');
const { isAdmin } = require('../planner/bot/admin-panel');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');

const DIGEST_TIMEZONE = 'Europe/Moscow';

function createTelegramMonitor({ bot, storage, config }) {
  const runtime = {
    botProfile: null,
    lastDailyDigestKey: '',
  };

  function now() {
    return new Date();
  }

  function toIso(value) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  }

  function toChatKey(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (/^-?\d+$/.test(text)) return text;
    return text.replace(/^@+/, '').toLowerCase();
  }

  function getDateKeyMsk(value = now()) {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: DIGEST_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }

  function formatDateTimeRu(value) {
    if (!value) return 'n/a';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'n/a';
    return new Intl.DateTimeFormat('ru-RU', {
      timeZone: DIGEST_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function trimText(value, maxLength = 3900) {
    const text = String(value || '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function detectMediaKind(message = {}) {
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) return 'document';
    if (message.audio) return 'audio';
    if (message.voice) return 'voice';
    if (message.video_note) return 'video_note';
    if (message.sticker) return 'sticker';
    if (message.animation) return 'animation';
    if (message.poll) return 'poll';
    return '';
  }

  function extractMessageText(message = {}) {
    return String(message.text || message.caption || '').replace(/\s+/g, ' ').trim();
  }

  function extractAuthor(message = {}, fallbackFrom = null) {
    const from = message.from || fallbackFrom || null;
    if (from) {
      return {
        authorId: Number.isFinite(Number(from.id)) ? Number(from.id) : null,
        authorUsername: from.username || '',
        authorName: [from.first_name, from.last_name].filter(Boolean).join(' ').trim() || from.username || '',
      };
    }
    const senderChat = message.sender_chat || null;
    if (senderChat) {
      return {
        authorId: null,
        authorUsername: senderChat.username || '',
        authorName: senderChat.title || senderChat.username || 'Channel',
      };
    }
    return {
      authorId: null,
      authorUsername: '',
      authorName: '',
    };
  }

  function getWatchedChats() {
    return Array.isArray(config.tgMonitorWatchChats) ? config.tgMonitorWatchChats.map((item) => toChatKey(item)) : [];
  }

  function shouldWatchChat(chat = {}) {
    if (!config.tgMonitorEnabled) return false;
    const type = String(chat.type || '').trim().toLowerCase();
    if (!type || type === 'private') return false;
    const watchList = getWatchedChats();
    if (!watchList.length) return true;
    const chatId = toChatKey(chat.id);
    const username = toChatKey(chat.username);
    return watchList.includes(chatId) || (username && watchList.includes(username));
  }

  function getBootstrapTargets() {
    const output = new Set(getWatchedChats());
    const channelUrl = String(config.links && config.links.channel || '').trim();
    const channelMatch = channelUrl.match(/t\.me\/([A-Za-z0-9_]+)/i);
    if (channelMatch && channelMatch[1]) {
      output.add(channelMatch[1].toLowerCase());
    }
    return Array.from(output);
  }

  function isAllowedAdmin(ctx) {
    if (!ctx || !ctx.from) return false;
    if (isAdmin(ctx.from.id)) return true;
    const username = String(ctx.from.username || '').trim().toLowerCase();
    const allowedUsernames = Array.isArray(config.tgMonitorAdminUsernames)
      ? config.tgMonitorAdminUsernames.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return Boolean(username && allowedUsernames.includes(username));
  }

  function buildMenuKeyboard(options = {}) {
    const subscribed = Boolean(options.subscribed);
    return new InlineKeyboard()
      .text('Overview', 'tgm_menu').text('Chats', 'tgm_chats').row()
      .text('Recent', 'tgm_recent').text('Digest now', 'tgm_digest').row()
      .text(subscribed ? 'Unsubscribe digest' : 'Subscribe digest', subscribed ? 'tgm_unsubscribe' : 'tgm_subscribe')
      .text('Privacy help', 'tgm_privacy_help');
  }

  async function refreshBotProfile() {
    try {
      runtime.botProfile = await bot.api.getMe();
      return runtime.botProfile;
    } catch (error) {
      return runtime.botProfile;
    }
  }

  async function refreshTrackedChats() {
    const existing = storage.listTelegramMonitorChats();
    const targets = new Map();
    existing.forEach((item) => {
      targets.set(toChatKey(item.chatId), item);
    });
    getBootstrapTargets().forEach((item) => {
      const key = toChatKey(item);
      if (!key || targets.has(key)) return;
      targets.set(key, { chatId: key, username: /^\-?\d+$/.test(key) ? null : key });
    });

    for (const item of targets.values()) {
      try {
        const chatRef = item.numericChatId || (/^-?\d+$/.test(String(item.chatId || '')) ? Number(item.chatId) : `@${String(item.username || item.chatId).replace(/^@+/, '')}`);
        const chat = await bot.api.getChat(chatRef);
        let memberCount = item.memberCount || 0;
        try {
          memberCount = await bot.api.getChatMemberCount(chatRef);
        } catch {}
        storage.upsertTelegramMonitorChat({
          chatId: chat.id,
          title: chat.title,
          username: chat.username,
          type: chat.type,
          isForum: Boolean(chat.is_forum),
          description: chat.description || item.description,
          inviteLink: chat.invite_link || item.inviteLink,
          memberCount,
          enabled: item.enabled,
          messageCount: item.messageCount,
          lastMessageAt: item.lastMessageAt,
          lastMessageText: item.lastMessageText,
          lastActor: item.lastActor,
          lastDigestAt: item.lastDigestAt,
        });
      } catch {}
    }
  }

  function buildOverviewText() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const stats = storage.getTelegramMonitorStats({ since, limit: 500 });
    const chats = storage.listTelegramMonitorChats();
    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    const latest = stats.latestEvent;
    const botProfile = runtime.botProfile;

    const topAuthors = stats.topAuthors.length
      ? stats.topAuthors.map((item) => `• ${escapeHtml(item.label)}: ${item.count}`).join('\n')
      : '• Пока нет активных авторов';

    return trimText(
      [
        '<b>Telegram Monitor</b>',
        '',
        `Chats tracked: <b>${chats.length}</b>`,
        `Events 24h: <b>${stats.totalEvents}</b>`,
        `Active authors: <b>${stats.uniqueAuthors}</b>`,
        `Questions: <b>${stats.questionCount}</b>`,
        `Links: <b>${stats.linkCount}</b>`,
        `Media: <b>${stats.mediaCount}</b>`,
        `Recipients: <b>${recipients.length}</b>`,
        `Privacy mode: <b>${botProfile && botProfile.can_read_all_group_messages ? 'full read' : 'limited'}</b>`,
        latest
          ? `Last activity: <b>${escapeHtml(latest.chatTitle || latest.chatUsername || latest.chatId)}</b> at ${escapeHtml(formatDateTimeRu(latest.createdAt))}`
          : 'Last activity: no events yet',
        '',
        '<b>Top authors 24h</b>',
        topAuthors,
      ].join('\n'),
      3600,
    );
  }

  function buildChatsText() {
    const chats = storage.listTelegramMonitorChats();
    if (!chats.length) {
      return '<b>Telegram Monitor</b>\n\nNo chats collected yet.';
    }
    const lines = ['<b>Tracked chats</b>', ''];
    chats.slice(0, 20).forEach((item, index) => {
      lines.push(
        `${index + 1}. <b>${escapeHtml(item.title || item.username || item.chatId)}</b>`,
        `   type: ${escapeHtml(item.type || 'unknown')} | users: ${item.memberCount || 0} | msgs: ${item.messageCount || 0}`,
        `   last: ${escapeHtml(formatDateTimeRu(item.lastMessageAt))}`,
        item.lastMessageText ? `   ${escapeHtml(item.lastMessageText.slice(0, 120))}` : '   no text yet',
        '',
      );
    });
    return trimText(lines.join('\n'), 3600);
  }

  function buildRecentEventsText() {
    const events = storage.listTelegramMonitorEvents({ limit: 12 });
    if (!events.length) {
      return '<b>Recent events</b>\n\nNo events collected yet.';
    }
    const lines = ['<b>Recent events</b>', ''];
    events.forEach((item, index) => {
      const author = item.authorName || (item.authorUsername ? `@${item.authorUsername}` : 'unknown');
      lines.push(
        `${index + 1}. <b>${escapeHtml(item.chatTitle || item.chatUsername || item.chatId)}</b>`,
        `   ${escapeHtml(formatDateTimeRu(item.createdAt))} | ${escapeHtml(item.eventType)} | ${escapeHtml(author)}`,
        item.text ? `   ${escapeHtml(item.text.slice(0, 180))}` : `   [${escapeHtml(item.mediaKind || 'empty')}]`,
        '',
      );
    });
    return trimText(lines.join('\n'), 3600);
  }

  function buildFallbackDigest(events, stats, periodStartAt, periodEndAt) {
    const topAuthors = stats.topAuthors.length
      ? stats.topAuthors.map((item) => `${item.label} (${item.count})`).join(', ')
      : 'нет данных';
    const highlights = events
      .slice(-5)
      .map((item) => {
        const author = item.authorName || (item.authorUsername ? `@${item.authorUsername}` : 'участник');
        const body = item.text ? item.text.slice(0, 180) : `[${item.mediaKind || item.eventType}]`;
        return `• ${item.chatTitle || item.chatUsername || item.chatId}: ${author} — ${body}`;
      })
      .join('\n');

    return trimText(
      [
        '<b>Сводка Telegram Golden Connect за 24 часа</b>',
        '',
        `Период: ${escapeHtml(formatDateTimeRu(periodStartAt))} - ${escapeHtml(formatDateTimeRu(periodEndAt))}`,
        `Сообщений: <b>${stats.totalEvents}</b>`,
        `Активных авторов: <b>${stats.uniqueAuthors}</b>`,
        `Вопросов: <b>${stats.questionCount}</b>`,
        `Сообщений со ссылками: <b>${stats.linkCount}</b>`,
        `Медиа: <b>${stats.mediaCount}</b>`,
        '',
        `<b>Самые активные</b>: ${escapeHtml(topAuthors)}`,
        '',
        '<b>Последние сигналы</b>',
        highlights || '• Пока нечего показывать',
      ].join('\n'),
      3900,
    );
  }

  async function requestAIDigest(events, stats, periodStartAt, periodEndAt) {
    const groqKeys = getGroqKeys(config);
    if (!groqKeys.length || !events.length) return null;

    const compactEvents = events.slice(-Math.max(5, Math.min(Number(config.tgMonitorAiMaxItems || 80), 120))).map((item) => ({
      at: item.createdAt,
      chat: item.chatTitle || item.chatUsername || item.chatId,
      author: item.authorName || item.authorUsername || item.authorId || 'unknown',
      type: item.eventType,
      media: item.mediaKind || '',
      text: item.text || '',
    }));

    const systemPrompt = [
      'Ты аналитик Telegram-контуров Golden Connect.',
      'Тебе нужно сделать короткую, конкретную и полезную сводку для администратора.',
      'Пиши по-русски.',
      'Нужны 4 блока:',
      '1. Что происходило.',
      '2. Какие вопросы/боли/интересы повторялись.',
      '3. Где нужны действия администратора.',
      '4. Что стоит сделать сегодня.',
      'Не выдумывай факты. Не пиши лишнюю воду.',
    ].join(' ');

    const userPrompt = JSON.stringify({
      periodStartAt,
      periodEndAt,
      stats,
      events: compactEvents,
    });

    try {
      const parsed = await requestGroqChatCompletion([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {
        groqKeys,
        temperature: 0.2,
        maxTokens: 900,
        timeoutMs: 20000,
      });
      const content = String(parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content || '').trim();
      if (!content) return null;
      return {
        model: parsed.model || 'groq',
        summary: trimText(content, 3900),
      };
    } catch {
      return null;
    }
  }

  async function generateDigest(options = {}) {
    const periodEndAt = options.periodEndAt || now().toISOString();
    const periodStartAt = options.periodStartAt || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const events = storage.listTelegramMonitorEvents({
      chatId: options.chatId,
      since: periodStartAt,
      until: periodEndAt,
      limit: Math.max(50, Math.min(Number(config.tgMonitorMaxEvents || 10000), 500)),
    }).reverse();
    const stats = storage.getTelegramMonitorStats({
      chatId: options.chatId,
      since: periodStartAt,
      until: periodEndAt,
      limit: Math.max(50, Math.min(Number(config.tgMonitorMaxEvents || 10000), 500)),
    });

    const aiDigest = await requestAIDigest(events, stats, periodStartAt, periodEndAt);
    return {
      title: options.chatId ? `Сводка по чату ${options.chatId}` : 'Сводка Telegram Golden Connect',
      summary: aiDigest && aiDigest.summary ? aiDigest.summary : buildFallbackDigest(events, stats, periodStartAt, periodEndAt),
      model: aiDigest && aiDigest.model ? aiDigest.model : 'fallback',
      stats,
      periodStartAt,
      periodEndAt,
    };
  }

  async function showMenu(ctx) {
    await refreshBotProfile();
    await refreshTrackedChats();
    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    const subscribed = recipients.some((item) => item.telegramUserId === Number(ctx.from && ctx.from.id));
    const text = buildOverviewText();
    const keyboard = buildMenuKeyboard({ subscribed });
    if (ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
      } catch {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
      }
      return;
    }
    await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  }

  async function showChats(ctx) {
    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    const subscribed = recipients.some((item) => item.telegramUserId === Number(ctx.from && ctx.from.id));
    await ctx.editMessageText(buildChatsText(), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildMenuKeyboard({ subscribed }),
    }).catch(async () => {
      await ctx.reply(buildChatsText(), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildMenuKeyboard({ subscribed }),
      });
    });
  }

  async function showRecent(ctx) {
    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    const subscribed = recipients.some((item) => item.telegramUserId === Number(ctx.from && ctx.from.id));
    await ctx.editMessageText(buildRecentEventsText(), {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildMenuKeyboard({ subscribed }),
    }).catch(async () => {
      await ctx.reply(buildRecentEventsText(), {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildMenuKeyboard({ subscribed }),
      });
    });
  }

  async function showPrivacyHelp(ctx) {
    const text = trimText([
      '<b>Privacy mode</b>',
      '',
      'Сейчас бот может быть ограничен privacy mode. Для полноценного чтения всех сообщений в группе лучше отключить privacy через BotFather:',
      '1. Открыть BotFather',
      '2. Выбрать @GoldenConnect_bizbot',
      '3. Команда /setprivacy',
      '4. Выключить privacy mode',
      '',
      'После этого мониторинг будет надёжнее для всех обычных сообщений, а не только для команд и части событий.',
    ].join('\n'), 3000);
    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildMenuKeyboard({
        subscribed: storage.listTelegramMonitorRecipients().some((item) => item.isActive && item.telegramUserId === Number(ctx.from && ctx.from.id)),
      }),
    }).catch(async () => {
      await ctx.reply(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildMenuKeyboard({
          subscribed: storage.listTelegramMonitorRecipients().some((item) => item.isActive && item.telegramUserId === Number(ctx.from && ctx.from.id)),
        }),
      });
    });
  }

  async function runManualDigest(ctx) {
    const digest = await generateDigest();
    storage.saveTelegramMonitorDigest(digest);
    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    const subscribed = recipients.some((item) => item.telegramUserId === Number(ctx.from && ctx.from.id));
    const text = trimText(`<b>${escapeHtml(digest.title)}</b>\n\n${digest.summary}`, 3900);
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: buildMenuKeyboard({ subscribed }),
      }).catch(async () => {
        await ctx.reply(text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: buildMenuKeyboard({ subscribed }),
        });
      });
      return;
    }
    await ctx.reply(text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: buildMenuKeyboard({ subscribed }),
    });
  }

  async function sendDailyDigestIfNeeded() {
    const nowDate = now();
    const currentHour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: DIGEST_TIMEZONE,
      hour: '2-digit',
      hour12: false,
    }).format(nowDate));
    const currentMinute = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: DIGEST_TIMEZONE,
      minute: '2-digit',
    }).format(nowDate));

    if (currentHour !== Number(config.tgMonitorDailyHourMsk || 21)) return;
    if (currentMinute !== Number(config.tgMonitorDailyMinuteMsk || 0)) return;

    const dateKey = getDateKeyMsk(nowDate);
    if (runtime.lastDailyDigestKey === dateKey) return;
    const existing = storage.listTelegramMonitorDigests({ limit: 5 }).find((item) => {
      if (!item || item.chatId) return false;
      return getDateKeyMsk(item.createdAt) === dateKey;
    });
    if (existing) {
      runtime.lastDailyDigestKey = dateKey;
      return;
    }

    const recipients = storage.listTelegramMonitorRecipients().filter((item) => item.isActive);
    if (!recipients.length) return;

    const digest = await generateDigest();
    const saved = storage.saveTelegramMonitorDigest(digest);
    const text = trimText(`<b>${escapeHtml(saved.title || digest.title)}</b>\n\n${digest.summary}`, 3900);
    const keyboard = new InlineKeyboard().text('Open monitor', 'tgm_menu');

    for (const recipient of recipients) {
      try {
        await bot.api.sendMessage(recipient.telegramUserId, text, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
        storage.touchTelegramMonitorRecipientDelivery(recipient.telegramUserId);
      } catch {}
    }

    runtime.lastDailyDigestKey = dateKey;
  }

  function captureChatEvent(ctx) {
    const update = ctx.update || {};

    if (update.my_chat_member && update.my_chat_member.chat) {
      const chat = update.my_chat_member.chat;
      if (shouldWatchChat(chat)) {
        storage.upsertTelegramMonitorChat({
          chatId: chat.id,
          title: chat.title,
          username: chat.username,
          type: chat.type,
          isForum: Boolean(chat.is_forum),
          description: chat.description,
          inviteLink: chat.invite_link,
        });
      }
      return;
    }

    const message = ctx.message || ctx.editedMessage || ctx.channelPost || ctx.editedChannelPost || null;
    if (message && message.chat && shouldWatchChat(message.chat)) {
      const author = extractAuthor(message, ctx.from);
      const eventType = ctx.message
        ? 'message'
        : ctx.editedMessage
          ? 'edited_message'
          : ctx.channelPost
            ? 'channel_post'
            : 'edited_channel_post';
      storage.addTelegramMonitorEvent({
        chat: message.chat,
        chatId: message.chat.id,
        chatTitle: message.chat.title,
        chatUsername: message.chat.username,
        chatType: message.chat.type,
        chatDescription: message.chat.description,
        chatInviteLink: message.chat.invite_link,
        isForum: Boolean(message.chat.is_forum),
        eventType,
        messageId: message.message_id,
        messageThreadId: message.message_thread_id,
        text: extractMessageText(message),
        mediaKind: detectMediaKind(message),
        authorId: author.authorId,
        authorName: author.authorName,
        authorUsername: author.authorUsername,
        createdAt: message.date ? new Date(Number(message.date) * 1000).toISOString() : now().toISOString(),
        editedAt: message.edit_date ? new Date(Number(message.edit_date) * 1000).toISOString() : null,
      });
      return;
    }

    if (update.message_reaction && update.message_reaction.chat && shouldWatchChat(update.message_reaction.chat)) {
      const reaction = update.message_reaction;
      const user = reaction.user || reaction.actor_chat || {};
      storage.addTelegramMonitorEvent({
        chat: reaction.chat,
        chatId: reaction.chat.id,
        chatTitle: reaction.chat.title,
        chatUsername: reaction.chat.username,
        chatType: reaction.chat.type,
        isForum: Boolean(reaction.chat.is_forum),
        eventType: 'message_reaction',
        messageId: reaction.message_id,
        authorId: user.id,
        authorName: user.first_name || user.title || user.username || '',
        authorUsername: user.username || '',
        text: `reactions: ${JSON.stringify(reaction.new_reaction || [])}`,
        createdAt: reaction.date ? new Date(Number(reaction.date) * 1000).toISOString() : now().toISOString(),
      });
    }
  }

  bot.use(async (ctx, next) => {
    try {
      captureChatEvent(ctx);
    } catch {}
    return next();
  });

  bot.command('tgmonitor', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return;
    await showMenu(ctx);
  });

  bot.command('tgmonitor_subscribe', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return;
    storage.registerTelegramMonitorRecipient({
      telegramUserId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    await ctx.reply('Digest subscription is enabled. Daily summary will be sent here once per day.');
  });

  bot.command('tgmonitor_digest', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return;
    await runManualDigest(ctx);
  });

  bot.callbackQuery('tgm_menu', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    await ctx.answerCallbackQuery();
    await showMenu(ctx);
  });

  bot.callbackQuery('tgm_chats', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    await ctx.answerCallbackQuery();
    await showChats(ctx);
  });

  bot.callbackQuery('tgm_recent', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    await ctx.answerCallbackQuery();
    await showRecent(ctx);
  });

  bot.callbackQuery('tgm_digest', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    await ctx.answerCallbackQuery('Building digest...');
    await runManualDigest(ctx);
  });

  bot.callbackQuery('tgm_subscribe', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    storage.registerTelegramMonitorRecipient({
      telegramUserId: ctx.from.id,
      username: ctx.from.username,
      firstName: ctx.from.first_name,
    });
    await ctx.answerCallbackQuery('Subscribed');
    await showMenu(ctx);
  });

  bot.callbackQuery('tgm_unsubscribe', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    storage.unregisterTelegramMonitorRecipient(ctx.from.id);
    await ctx.answerCallbackQuery('Unsubscribed');
    await showMenu(ctx);
  });

  bot.callbackQuery('tgm_privacy_help', async (ctx) => {
    if (!isAllowedAdmin(ctx)) return ctx.answerCallbackQuery('Access denied');
    await ctx.answerCallbackQuery();
    await showPrivacyHelp(ctx);
  });

  function startCron() {
    cron.schedule('* * * * *', async () => {
      try {
        await sendDailyDigestIfNeeded();
      } catch (error) {
        console.error('[tg_monitor_digest_cron]', error && error.message ? error.message : error);
      }
    });
    refreshBotProfile().catch(() => {});
    refreshTrackedChats().catch(() => {});
    console.log('[tg_monitor] started (capture + admin menu + daily digest)');
  }

  return {
    startCron,
    refreshTrackedChats,
    generateDigest,
  };
}

module.exports = { createTelegramMonitor };
