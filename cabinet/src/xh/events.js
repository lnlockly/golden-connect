// Golden Connect: команды эфиров + deep-link handlers.
// Регистрируется ДО alpha bot setup, чтобы перехватить /start перед onboarding.

const { InlineKeyboard } = require('grammy');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim() + '…';
}

function formatMsk(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }) + ' МСК';
  } catch (e) { return ''; }
}

// Build a consistent, readable event card.
// Sections: theme | speakers | why-go | date+countdown | CTA
function formatEventCard(ev, opts = {}) {
  const lines = [];
  const includeStatus = opts.statusLine || null;
  const topic = String(ev.topic || '').trim();
  const title = String(ev.title || '').trim();
  const description = String(ev.description || '').trim();
  const speakerName = String(ev.speakerName || '').trim();
  const speakers = Array.isArray(ev.speakers) && ev.speakers.length
    ? ev.speakers.filter(Boolean)
    : (speakerName ? [speakerName] : []);

  // Header
  lines.push('🔴 <b>Живая встреча по теме:</b>');
  // Theme = topic if available, else title
  lines.push(topic ? topic : title);
  lines.push('');

  // Speakers block (always, even if just title-derived)
  if (speakers.length) {
    lines.push('👤 <b>Выступают профессора:</b>');
    speakers.forEach((s) => lines.push('• ' + escapeHtmlEv(s)));
    lines.push('');
  }

  // "Why you need it" — description, but only if it doesn't duplicate title/topic
  // De-duplicate: skip description if it starts with the same first 30 chars as title
  const norm = (s) => s.toLowerCase().replace(/[^\wа-яё]+/gi, ' ').trim().slice(0, 50);
  const dupTitle = title && description && norm(description).startsWith(norm(title).slice(0, 30));
  const dupTopic = topic && description && norm(description).startsWith(norm(topic).slice(0, 30));
  if (description && !dupTitle && !dupTopic) {
    lines.push('💡 <b>Почему тебе туда нужно:</b>');
    lines.push(escapeHtmlEv(opts.fullDescription ? description : truncate(description, 380)));
    lines.push('');
  }

  // Date + countdown
  if (ev.startsAt) {
    lines.push('📅 ' + escapeHtmlEv(formatMsk(ev.startsAt)));
    const diffMs = Date.parse(ev.startsAt) - Date.now();
    if (diffMs > 0) {
      const d = Math.floor(diffMs / 86400000);
      const h = Math.floor((diffMs % 86400000) / 3600000);
      if (d > 0) lines.push(`⏰ Через ${d} ${pluralDays(d)} ${h} ч`);
      else lines.push(`⏰ Через ${h} ч`);
    } else if (diffMs > -3600000) {
      lines.push('🔴 <b>Эфир идёт прямо сейчас!</b>');
    }
    lines.push('');
  }

  if (includeStatus) lines.push(includeStatus);

  // CTA line
  lines.push('👉 <b>Запишись на эфир — нажми кнопку ниже</b>');

  return lines.filter(l => l !== undefined && l !== null).join('\n');
}

function escapeHtmlEv(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pluralDays(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
  return 'дней';
}

// Parse payloads: remind_ev_001[_ref_CODE], subscribe_ev_001, event_ev_001, ref_CODE, web_..., link_TOKEN
function parseStartPayload(raw) {
  const text = String(raw || '').trim();
  if (!text) return { kind: 'empty' };
  if (/^web_/i.test(text)) return { kind: 'web', token: text.slice(4) };
  if (/^conf_/i.test(text)) return { kind: 'conf', roomId: text.slice(5).toUpperCase() };
  if (/^link_/i.test(text)) return { kind: 'link', token: text.slice(5) };
  if (/^cab$/i.test(text)) return { kind: 'cab' };
  const reMulti = /^(remind|subscribe|event)_(ev_\d+)(?:_ref_([a-z0-9_-]+))?$/i;
  const mm = text.match(reMulti);
  if (mm) return { kind: mm[1].toLowerCase(), eventId: mm[2], refCode: (mm[3] || '').toLowerCase() || null };
  if (/^ref_[a-z0-9_-]+$/i.test(text)) return { kind: 'ref', refValue: text.slice(4) };
  return { kind: 'unknown', raw: text };
}

async function safeSend(ctx, text, opts) {
  try { await ctx.reply(text, opts); } catch (e) {
    console.error('[xh_events_reply_failed]', e && e.message);
  }
}

function setupGoldenConnectEvents(bot, storage, config) {
  // Intercept /start with payload BEFORE alpha's /start handler.
  // We use bot.use() middleware that checks /start message, and if it's our payload, handles it
  // and stops propagation. Otherwise calls next().
  bot.use(async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !msg.text || ctx.chat?.type !== 'private') return next();
    const m = msg.text.match(/^\/start(?:\s+(.+))?$/);
    if (!m) return next();
    const payload = (m[1] || '').trim();
    const parsed = parseStartPayload(payload);
    if (parsed.kind === 'remind' || parsed.kind === 'subscribe' || parsed.kind === 'event') {
      await handleEventDeepLink(ctx, parsed, storage, config);
      return; // stop — don't call alpha /start
    }
    if (parsed.kind === 'link') {
      // Telegram link from site — complete the binding
      const { handleTelegramLink } = require('./site-link');
      await handleTelegramLink(ctx, parsed.token, storage);
      return; // stop — don't call alpha /start
    }
    if (parsed.kind === 'cab') {
      // [magic-cab] /start cab → sendMagicLink (dual-option hub: WebApp + magic URL)
      try {
        const { sendMagicLink } = require('./site-link');
        const siteBase = String(config.publicBaseUrl || 'https://goldenConnect.to/cabinet').replace(/\/+$/, '');
        await sendMagicLink(ctx, storage, siteBase);
      } catch (e) { console.warn('[magic-cab]', e && e.message); }
      return;
    }
    if (parsed.kind === 'ref' && !/^\d+$/.test(parsed.refValue)) {
      // Try ref attribution, then continue to normal /start flow
      await maybeAttributeReferral(ctx, parsed.refValue, storage, bot);
      // Fall through to alpha's /start for onboarding
    }
    return next();
  });

  // /events — list upcoming broadcasts
  bot.command('events', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const events = storage.listUpcomingEvents(10);
    if (!events.length) {
      return safeSend(ctx,
        '📡 Пока нет запланированных эфиров Golden Connect.\n\nСледите за анонсами в этом боте.',
        { parse_mode: 'HTML' }
      );
    }
    const lines = ['📡 <b>Предстоящие эфиры Golden Connect</b>', ''];
    events.forEach((ev, i) => {
      const dt = ev.startsAt
        ? new Date(ev.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
      lines.push(`${i + 1}. <b>${escapeHtml(truncate(ev.title, 80))}</b>`);
      if (ev.speakerName) lines.push(`   👤 ${escapeHtml(ev.speakerName)}`);
      lines.push(`   🕐 ${dt} МСК`);
      lines.push('');
    });
    const kb = new InlineKeyboard();
    events.slice(0, 5).forEach((ev) => {
      kb.text(`🔔 ${truncate(ev.title, 28)}`, `xh_subscribe:${ev.id}`).row();
    });
    await safeSend(ctx, lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  });

  // /event <id> — show specific event
  bot.command('event', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const id = String(ctx.match || '').trim();
    const ev = id ? storage.getEvent(id) : storage.getNextUpcomingEvent();
    if (!ev) return safeSend(ctx, 'Эфир не найден.');
    await sendEventCard(ctx, ev, storage);
  });

  // Inline callback menu button (from /start main menu)
  bot.callbackQuery('xh_events', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const events = storage.listUpcomingEvents(10);
    if (!events.length) {
      return ctx.reply('📡 Пока нет запланированных эфиров Golden Connect.');
    }
    const lines = ['📡 <b>Предстоящие эфиры Golden Connect</b>', ''];
    events.forEach((ev, i) => {
      const dt = ev.startsAt
        ? new Date(ev.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
      lines.push(`${i + 1}. <b>${escapeHtml(truncate(ev.title, 80))}</b>`);
      if (ev.speakerName) lines.push(`   👤 ${escapeHtml(ev.speakerName)}`);
      lines.push(`   🕐 ${dt} МСК`);
      lines.push('');
    });
    const kb = new InlineKeyboard();
    events.slice(0, 5).forEach((ev) => {
      kb.text(`🔔 ${truncate(ev.title, 28)}`, `xh_subscribe:${ev.id}`).row();
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  });

  // Subscribe button
  // [event-rsvp] RSVP button: 'Приду' / 'Запись' / 'Не приду'.
  // Records user response, edits the keyboard in place with updated counts +
  // user-mark, sends a transient confirmation toast.
  bot.callbackQuery(/^xh_rsvp:([a-z0-9_]+):(attend|record|skip)$/i, async (ctx) => {
    try {
      const eventId = ctx.match[1];
      const response = ctx.match[2].toLowerCase();
      const tgId = ctx.from?.id;
      if (!tgId) { await ctx.answerCallbackQuery({ text: 'Не вижу твоего ID', show_alert: false }); return; }

      // Resolve webUser by TG id (or auto-create a guest record)
      let userId = null;
      const tgUser = storage.findWebUserByTelegramId ? storage.findWebUserByTelegramId(tgId) : null;
      if (tgUser && tgUser.id) userId = tgUser.id;
      else if (storage.upsertWebUserFromTelegram) {
        const created = storage.upsertWebUserFromTelegram({
          telegramUserId: tgId,
          username: ctx.from?.username || null,
          displayName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(' ') || null,
        });
        userId = created && created.id;
      }
      if (!userId) { await ctx.answerCallbackQuery({ text: 'Зайди в кабинет — /cab', show_alert: true }); return; }

      const ev = storage.getEvent ? storage.getEvent(eventId) : null;
      if (!ev) { await ctx.answerCallbackQuery({ text: 'Эфир не найден', show_alert: true }); return; }

      const result = storage.recordEventRsvp(userId, eventId, response);
      const labels = { attend: 'Приду', record: 'Посмотрю в записи', skip: 'Не приду' };

      let toast;
      if (result && result.action === 'cleared') {
        toast = '❎ Ответ снят';
      } else {
        toast = '✅ Записано: ' + (labels[response] || response);
        if (response === 'attend' || response === 'record') {
          toast += ' · напомним заранее';
        }
      }
      await ctx.answerCallbackQuery({ text: toast, show_alert: false });

      // Rebuild keyboard with updated stats + user mark
      const cron = require('./events-cron');
      if (cron.buildRsvpKeyboard) {
        const kb = cron.buildRsvpKeyboard(ev, storage, userId);
        try {
          await ctx.editMessageReplyMarkup({ reply_markup: kb });
        } catch (e) {
          // Telegram throws if the markup is unchanged or message too old to edit; ignore.
          if (!/not modified|message is not modified|message to edit not found/i.test(e?.description || e?.message || '')) {
            console.warn('[xh_rsvp_edit_failed]', e?.description || e?.message);
          }
        }
      }
    } catch (e) {
      console.error('[xh_rsvp_handler_error]', e && e.message);
      try { await ctx.answerCallbackQuery({ text: 'Ошибка, попробуй ещё раз', show_alert: false }); } catch (_) {}
    }
  });

  bot.callbackQuery(/^xh_subscribe:(ev_\d+)$/, async (ctx) => {
    const eventId = ctx.match[1];
    const ev = storage.getEvent(eventId);
    if (!ev) {
      try { await ctx.answerCallbackQuery({ text: 'Эфир не найден', show_alert: true }); } catch (e) {}
      return;
    }
    let webUser = null;
    try {
      webUser = storage.ensureWebUserFromTelegram(ctx.from);
    } catch (e) { console.error('[xh_subscribe_ensure_user]', e && e.message); }
    if (!webUser) {
      try { await ctx.answerCallbackQuery({ text: 'Не удалось привязать', show_alert: true }); } catch (e) {}
      return;
    }
    try {
      storage.subscribeToEvent(webUser.id, eventId);
      try { await ctx.answerCallbackQuery({ text: '✅ Вы подписаны' }); } catch (e) {}
      await ctx.reply(
        `✅ Подписка на эфир «${escapeHtml(ev.title)}» оформлена.\n\n` +
        `Я напомню каждый день за 2, 1 и 0 дней утром, за час до начала и в момент старта.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      try { await ctx.answerCallbackQuery({ text: 'Ошибка', show_alert: true }); } catch (e2) {}
    }
  });

  // Reply keyboard button "🔴 Эфиры"
  bot.hears('🔴 Эфиры', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const events = storage.listUpcomingEvents(10);
    if (!events.length) return ctx.reply('📡 Пока нет запланированных эфиров Golden Connect.');
    const lines = ['📡 <b>Предстоящие эфиры Golden Connect</b>', ''];
    events.forEach((ev, i) => {
      const dt = ev.startsAt
        ? new Date(ev.startsAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
        : '—';
      lines.push(`${i + 1}. <b>${escapeHtml(truncate(ev.title, 80))}</b>`);
      if (ev.speakerName) lines.push(`   👤 ${escapeHtml(ev.speakerName)}`);
      lines.push(`   🕐 ${dt} МСК`);
      lines.push('');
    });
    const kb = new InlineKeyboard();
    events.slice(0, 5).forEach((ev) => {
      kb.text(`🔔 ${truncate(ev.title, 28)}`, `xh_subscribe:${ev.id}`).row();
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  });
}

async function sendEventCard(ctx, ev, storage) {
  const text = formatEventCard(ev);
  const kb = new InlineKeyboard().text('🔔 Записаться на эфир', `xh_subscribe:${ev.id}`).row();
  if (ev.joinUrl) kb.url('▶️ Открыть эфир', ev.joinUrl).row();
  kb.url('🌐 Сайт Golden Connect', 'https://cabinet.goldenConnect.to/');
  await ctx.reply(text, { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

async function handleEventDeepLink(ctx, parsed, storage, config) {
  const eventId = parsed.eventId;
  const ev = storage.getEvent(eventId);
  if (!ev) {
    return ctx.reply('Эфир не найден или уже прошёл. Откройте сайт: https://cabinet.goldenConnect.to/');
  }
  let webUser = null;
  try { webUser = storage.ensureWebUserFromTelegram(ctx.from); }
  catch (e) { console.error('[xh_deep_link_ensure]', e && e.message); }
  // Attribute referral if ref code present
  if (parsed.refCode && webUser && !webUser.referredByUserId) {
    try {
      const inviter = storage.findWebUserByReferralCode(parsed.refCode);
      if (inviter && inviter.id !== webUser.id) {
        storage.setWebUserReferredBy(webUser.id, inviter.id);
        // Transition stage + send rich notification via team-notify
        try {
          storage.transitionReferralStage(webUser.id, 'joined');
          const { notifyInviterStageChange } = require('./team-notify');
          notifyInviterStageChange(ctx.api ? { api: ctx.api } : bot, storage, webUser.id, null, 'joined').catch(() => {});
        } catch (e) {}
      }
    } catch (e) {}
  }
  // Subscribe to event
  if ((parsed.kind === 'remind' || parsed.kind === 'subscribe') && webUser) {
    try { storage.subscribeToEvent(webUser.id, eventId); }
    catch (e) { console.error('[xh_deep_link_subscribe]', e && e.message); }
  }
  const isSubscribed = parsed.kind === 'remind' || parsed.kind === 'subscribe';
  const statusLine = isSubscribed
    ? '✅ <b>Вы подписаны на напоминания.</b>\n   Я напомню за 2, 1 и 0 дней до эфира,\n   за час и в момент старта.'
    : null;
  const text = formatEventCard(ev, { statusLine });
  const kb = new InlineKeyboard();
  if (parsed.kind === 'event' || !isSubscribed) {
    kb.text('🔔 Записаться на эфир', `xh_subscribe:${eventId}`).row();
  }
  if (ev.joinUrl) kb.url('▶️ Открыть эфир', ev.joinUrl).row();
  kb.url('🌐 Сайт Golden Connect', 'https://cabinet.goldenConnect.to/').row();
  await ctx.reply(text, {
    parse_mode: 'HTML',
    reply_markup: kb,
    disable_web_page_preview: true,
  });
}

async function maybeAttributeReferral(ctx, refCode, storage, bot) {
  if (!refCode) return;
  try {
    const webUser = storage.ensureWebUserFromTelegram(ctx.from);
    if (!webUser || webUser.referredByUserId) return;
    const inviter = storage.findWebUserByReferralCode(String(refCode).toLowerCase());
    if (inviter && inviter.id !== webUser.id) {
      storage.setWebUserReferredBy(webUser.id, inviter.id);
      // Rich notification via team-notify (with contacts, buttons, next steps)
      try {
        storage.transitionReferralStage(webUser.id, 'joined');
        const { notifyInviterStageChange } = require('./team-notify');
        notifyInviterStageChange(bot, storage, webUser.id, null, 'joined').catch(() => {});
      } catch (e) {}
    }
  } catch (e) {}
}

module.exports = { setupGoldenConnectEvents, parseStartPayload };
