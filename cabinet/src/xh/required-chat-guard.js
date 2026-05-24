const { InlineKeyboard } = require('grammy');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toIso(value) {
  return new Date(value).toISOString();
}

function parseTime(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isChatMembershipConfirmed(member = {}) {
  const status = String(member.status || '').trim().toLowerCase();
  if (['creator', 'administrator', 'member'].includes(status)) return true;
  if (status === 'restricted') {
    if (member.is_member === undefined) return true;
    return Boolean(member.is_member);
  }
  return false;
}

function buildKeyboard(config) {
  const kb = new InlineKeyboard();
  if (config.requiredChatUrl) {
    kb.url('Вступить в чат', config.requiredChatUrl);
  }
  kb.text('Проверить', 'xh_reqchat_check');
  return kb;
}

function buildReminderText(config) {
  const title = escapeHtml(config.requiredChatTitle || 'чат Golden Connect');
  return [
    '⚠️ <b>Для продолжения работы бота нужно вступить в наш чат.</b>',
    '',
    `Чат: <b>${title}</b>`,
    '',
    'Бот продолжит работать и без вступления, но это напоминание будет появляться при вашей активности, пока вас нет в чате.',
    '',
    'После вступления нажмите <b>«Проверить»</b>. Если вы уже состоите в чате, уведомление исчезнет и больше не будет мешать.',
  ].join('\n');
}

function buildSuccessText(config) {
  const title = escapeHtml(config.requiredChatTitle || 'чат Golden Connect');
  return [
    '✅ <b>Проверка пройдена.</b>',
    '',
    `Вы состоите в чате <b>${title}</b>.`,
    'Напоминание отключено и больше не будет мешать, пока вы остаетесь участником чата.',
  ].join('\n');
}

function buildStillMissingText(config) {
  const title = escapeHtml(config.requiredChatTitle || 'чат Golden Connect');
  return [
    '⚠️ <b>Пока не вижу вас в чате.</b>',
    '',
    `Чтобы убрать это уведомление, вступите в <b>${title}</b> и нажмите <b>«Проверить»</b> ещё раз.`,
    '',
    'Пока вы не в чате, напоминание будет возвращаться при вашей активности, но не чаще одного раза в 60 минут.',
  ].join('\n');
}

async function sendOrEdit(ctx, text, config, keyboard) {
  const payload = {
    parse_mode: 'HTML',
    reply_markup: keyboard === undefined ? buildKeyboard(config) : keyboard,
    disable_web_page_preview: true,
  };
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, payload);
      return true;
    } catch (error) {}
  }
  await ctx.reply(text, payload);
  return true;
}

async function checkRequiredChatMembership(bot, config, telegramUserId) {
  try {
    const member = await bot.api.getChatMember(config.requiredChatId, telegramUserId);
    return {
      ok: true,
      isMember: isChatMembershipConfirmed(member),
      status: String(member && member.status ? member.status : '').trim().toLowerCase() || 'unknown',
      errorMessage: null,
    };
  } catch (error) {
    const message = String(
      (error && error.description)
      || (error && error.message)
      || error
      || 'unknown_error'
    );
    if (/user not found|member list is inaccessible|participant_id_invalid|user not participant|chat not found/i.test(message)) {
      return {
        ok: true,
        isMember: false,
        status: 'missing',
        errorMessage: null,
      };
    }
    return {
      ok: false,
      isMember: false,
      status: 'error',
      errorMessage: message.slice(0, 280),
    };
  }
}

function shouldRefreshStatus(record, config, force = false) {
  if (force) return true;
  if (!record || !record.lastCheckedAt) return true;
  const now = Date.now();
  if (record.isMember) {
    return !record.nextCheckAt || parseTime(record.nextCheckAt) <= now;
  }
  const lastCheckedAt = parseTime(record.lastCheckedAt);
  if (!lastCheckedAt) return true;
  return now - lastCheckedAt >= Number(config.requiredChatReminderCooldownMs || 60 * 60 * 1000);
}

function shouldSendReminder(record, config, force = false) {
  if (force) return true;
  if (!record || !record.lastReminderAt) return true;
  const lastReminderAt = parseTime(record.lastReminderAt);
  if (!lastReminderAt) return true;
  return Date.now() - lastReminderAt >= Number(config.requiredChatReminderCooldownMs || 60 * 60 * 1000);
}

function createGuardState(config, checkResult, options = {}) {
  const now = Date.now();
  return {
    isMember: Boolean(checkResult && checkResult.isMember),
    status: checkResult && checkResult.status ? checkResult.status : (checkResult && checkResult.isMember ? 'member' : 'missing'),
    errorMessage: checkResult && checkResult.errorMessage ? checkResult.errorMessage : null,
    lastCheckedAt: toIso(now),
    nextCheckAt: checkResult && checkResult.isMember
      ? toIso(now + Number(config.requiredChatCheckTtlMs || 7 * 24 * 60 * 60 * 1000))
      : null,
    ...(options.includeReminder ? {
      lastReminderAt: toIso(now),
      reminderCount: Number(options.previousReminderCount || 0) + 1,
    } : null),
  };
}

function setupRequiredChatGuard(bot, storage, config) {
  const enabled = Boolean(config && config.requiredChatEnabled && config.requiredChatId && config.requiredChatUrl);
  if (!enabled) {
    return {
      middleware: async (ctx, next) => next(),
    };
  }

  const chatTitle = config.requiredChatTitle || 'чат Golden Connect';

  bot.callbackQuery('xh_reqchat_check', async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: 'Проверяю участие в чате...' }); } catch (error) {}

    const checkResult = await checkRequiredChatMembership(bot, config, Number(ctx.from && ctx.from.id));
    const previous = storage.getRequiredChatGuard
      ? storage.getRequiredChatGuard(ctx.from && ctx.from.id, config.requiredChatId)
      : null;

    if (checkResult.ok && checkResult.isMember) {
      if (storage.upsertRequiredChatGuard) {
        storage.upsertRequiredChatGuard(ctx.from && ctx.from.id, config.requiredChatId, createGuardState(config, checkResult));
      }
      const successKeyboard = config.requiredChatUrl
        ? new InlineKeyboard().url('Открыть чат', config.requiredChatUrl)
        : undefined;
      try {
        await sendOrEdit(ctx, buildSuccessText(config), {
          ...config,
          requiredChatTitle: chatTitle,
        }, successKeyboard);
      } catch (error) {
        await ctx.reply(buildSuccessText(config), { parse_mode: 'HTML', disable_web_page_preview: true });
      }
      return;
    }

    if (storage.upsertRequiredChatGuard) {
      storage.upsertRequiredChatGuard(
        ctx.from && ctx.from.id,
        config.requiredChatId,
        createGuardState(config, checkResult, {
          includeReminder: true,
          previousReminderCount: previous && previous.reminderCount,
        })
      );
    }

    try { await ctx.answerCallbackQuery({ text: 'Пока не вижу вас в чате', show_alert: false }); } catch (error) {}
    await sendOrEdit(ctx, buildStillMissingText(config), {
      ...config,
      requiredChatTitle: chatTitle,
    });
  });

  async function middleware(ctx, next) {
    if (!ctx.from || ctx.chat?.type !== 'private') return next();
    if (ctx.callbackQuery && String(ctx.callbackQuery.data || '').startsWith('xh_reqchat_')) return next();

    const existing = storage.getRequiredChatGuard
      ? storage.getRequiredChatGuard(ctx.from.id, config.requiredChatId)
      : null;

    let current = existing;
    if (shouldRefreshStatus(existing, config, false)) {
      const checked = await checkRequiredChatMembership(bot, config, ctx.from.id);
      if (checked.ok && storage.upsertRequiredChatGuard) {
        current = storage.upsertRequiredChatGuard(
          ctx.from.id,
          config.requiredChatId,
          createGuardState(config, checked)
        );
      } else if (!checked.ok) {
        console.error('[required_chat_guard_check]', checked.errorMessage || 'unknown_error');
      }
    }

    if (current && current.isMember) {
      return next();
    }

    if (!current || shouldSendReminder(current, config, false)) {
      if (storage.upsertRequiredChatGuard) {
        current = storage.upsertRequiredChatGuard(
          ctx.from.id,
          config.requiredChatId,
          {
            isMember: false,
            status: (current && current.status) || 'missing',
            errorMessage: (current && current.errorMessage) || null,
            lastReminderAt: toIso(Date.now()),
            reminderCount: Number((current && current.reminderCount) || 0) + 1,
          }
        );
      }
      try {
        await ctx.reply(buildReminderText(config), {
          parse_mode: 'HTML',
          reply_markup: buildKeyboard({
            ...config,
            requiredChatTitle: chatTitle,
          }),
          disable_web_page_preview: true,
        });
      } catch (error) {
        console.error('[required_chat_guard_notify]', error && error.message ? error.message : error);
      }
    }

    return next();
  }

  setTimeout(async () => {
    try {
      const chat = await bot.api.getChat(config.requiredChatId);
      console.log(`[required_chat_guard] enabled for ${chat.title || chatTitle} (${config.requiredChatId})`);
    } catch (error) {
      console.error('[required_chat_guard_init]', error && error.message ? error.message : error);
    }
  }, 1000).unref();

  return { middleware };
}

module.exports = { setupRequiredChatGuard };
