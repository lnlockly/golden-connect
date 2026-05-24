// Golden Connect Birthdays module — track birthdays of contacts and generate
// AI-powered congratulations.
//
// Commands:
//   /dr                                     — main dashboard
//   /addbirthday <name> <date> [@username]  — quick add (e.g. "Иван 14.05")
//   /addbirthday                            — interactive add
//
// Reply button: 🎂 Дни рождения (registered if main menu wires it)
//
// Callbacks:
//   dr_main           — show dashboard
//   dr_view:<id>      — open contact card
//   dr_gen:<id>       — generate congratulations via Groq
//   dr_regen:<id>:<msgId>   — regenerate over existing message
//   dr_share:<id>     — open share dialog (switch_inline_query)
//   dr_send:<id>      — send via Business connection (Phase 2, Premium-only)
//   dr_del:<id>       — delete contact
//   dr_add_start      — start interactive add wizard
//   dr_lang:<lang>    — set congratulation language for owner
//
// Inline query handler: returns a one-shot inline result with the prepared
// congratulation text so user can pick any chat to forward into.

const { InlineKeyboard } = require('grammy');
const {
  escapeHtml, parseDateLoose, isValidDay,
  todayMsk, daysUntil, ageThisYear, formatDate, formatRelativeDay,
  sortByUpcoming, groupByRange,
} = require('./birthdays-helpers');
const { getGroqKeys, requestGroqChatCompletion } = require('../utils/groq-rotator');

// Owner-level state (lang preference, last generated text per birthday id)
function getOwnerLang(ctx) {
  const code = String((ctx.from && ctx.from.language_code) || 'ru').toLowerCase();
  return code.startsWith('ru') ? 'ru' : 'en';
}

function ownerName(ctx) {
  if (!ctx.from) return '';
  return [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ').trim() || ctx.from.username || '';
}

function fmtBirthdayLine(b, baseToday, lang) {
  const days = daysUntil(b.month, b.day, baseToday);
  const date = formatDate(b.month, b.day, lang);
  const age = b.year ? ageThisYear(b.year, b.month, b.day, baseToday) : null;
  const ageStr = age != null ? (lang === 'en' ? `, turning ${age}` : `, ${age} ${pluralYears(age)}`) : '';
  const rel = days === 0 ? '' : ` · ${formatRelativeDay(days, lang)}`;
  return `${escapeHtml(b.name)} — ${date}${ageStr}${rel}`;
}

function pluralYears(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'год';
  if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'года';
  return 'лет';
}

async function buildDashboard(ctx, storage, lang) {
  const ownerId = String(ctx.from.id);
  const list = storage.listBirthdays(ownerId);
  const today = todayMsk();
  const groups = groupByRange(list, today);

  const T = lang === 'en' ? {
    title: '🎂 <b>Birthdays</b>',
    today: '📍 <b>Today</b>',
    week: '📅 <b>This week</b>',
    month: '📆 <b>This month</b>',
    later: '🗓 <b>Later</b>',
    empty: 'No birthdays saved yet. Hit ➕ Add to start, or send <code>/addbirthday Ivan 14.05</code>',
    add: '➕ Add',
    refresh: '🔄 Refresh',
    settings: '⚙️ Settings',
    cong: '✨ Congratulate',
    open: '👤 Open',
  } : {
    title: '🎂 <b>Дни рождения</b>',
    today: '📍 <b>Сегодня</b>',
    week: '📅 <b>На неделе</b>',
    month: '📆 <b>На месяц</b>',
    later: '🗓 <b>Дальше</b>',
    empty: 'Пока нет записей. Нажми ➕ Добавить или отправь <code>/addbirthday Иван 14.05</code>',
    add: '➕ Добавить',
    refresh: '🔄 Обновить',
    settings: '⚙️ Настройки',
    cong: '✨ Поздравить',
    open: '👤 Открыть',
  };

  const lines = [T.title, ''];
  if (list.length === 0) {
    lines.push(T.empty);
  } else {
    const sections = [
      [T.today, groups.today],
      [T.week,  groups.week],
      [T.month, groups.month],
      [T.later, groups.later],
    ];
    let printed = 0;
    for (const [label, items] of sections) {
      if (!items.length) continue;
      lines.push(`${label} (${items.length})`);
      for (const b of items.slice(0, 10)) {
        lines.push('  • ' + fmtBirthdayLine(b, today, lang));
      }
      if (items.length > 10) lines.push(`  … +${items.length - 10}`);
      lines.push('');
      printed += items.length;
    }
    if (printed === 0) lines.push(T.empty);
  }

  const kb = new InlineKeyboard();
  // Quick action buttons for today's birthdays
  for (const b of groups.today.slice(0, 6)) {
    kb.text(`${T.cong} — ${b.name.slice(0, 18)}`, `dr_gen:${b.id}`).row();
  }
  // List buttons for upcoming people
  const upcoming = [...groups.week, ...groups.month].slice(0, 6);
  for (const b of upcoming) {
    const days = daysUntil(b.month, b.day, todayMsk());
    const label = `${b.name.slice(0, 18)} · ${formatDate(b.month, b.day, lang)}`;
    kb.text(label, `dr_view:${b.id}`).row();
  }
  kb.text(T.add, 'dr_add_start').text(T.refresh, 'dr_main').row();
  kb.text(T.settings, 'dr_settings');

  return { text: lines.join('\n'), keyboard: kb };
}

function buildContactCard(b, lang) {
  const T = lang === 'en' ? {
    head: '👤',
    born: 'Birthday',
    age: 'Turning',
    note: 'Note',
    tg: 'Telegram',
    cong: '✨ Generate congratulation',
    share: '📤 Share',
    edit: '✏️ Edit',
    del: '❌ Delete',
    back: '« Back',
  } : {
    head: '👤',
    born: 'Дата',
    age: 'Возраст в этом году',
    note: 'Заметка',
    tg: 'Telegram',
    cong: '✨ Сгенерировать поздравление',
    share: '📤 Поделиться',
    edit: '✏️ Изменить',
    del: '❌ Удалить',
    back: '« Назад',
  };

  const today = todayMsk();
  const age = b.year ? ageThisYear(b.year, b.month, b.day, today) : null;
  const days = daysUntil(b.month, b.day, today);
  const dateStr = formatDate(b.month, b.day, lang) + (b.year ? ` ${b.year}` : '');
  const lines = [
    `${T.head} <b>${escapeHtml(b.name)}</b>`,
    `${T.born}: ${dateStr} (${formatRelativeDay(days, lang)})`,
  ];
  if (age != null) lines.push(`${T.age}: ${age} ${lang === 'en' ? '' : pluralYears(age)}`);
  if (b.tgUsername) lines.push(`${T.tg}: @${escapeHtml(String(b.tgUsername).replace(/^@/, ''))}`);
  if (b.note) lines.push(`${T.note}: ${escapeHtml(b.note)}`);

  const kb = new InlineKeyboard()
    .text(T.cong, `dr_gen:${b.id}`).row()
    .text(T.edit, `dr_edit:${b.id}`).text(T.del, `dr_del:${b.id}`).row()
    .text(T.back, 'dr_main');

  return { text: lines.join('\n'), keyboard: kb };
}

function congratulationPrompt(b, ownerName, lang) {
  const today = todayMsk();
  const age = b.year ? ageThisYear(b.year, b.month, b.day, today) : null;
  if (lang === 'en') {
    return [
      `Write a short, warm, sincere birthday greeting for "${b.name}" from "${ownerName || 'a close friend'}".`,
      `2-3 sentences max. Personal tone. No clichés like "wish you happiness, health, success".`,
      age != null ? `They are turning ${age} this year.` : '',
      b.note ? `Personal context (use it subtly): ${b.note}` : '',
      `Use 1-2 emoji at most. Reply ONLY with the greeting text in English, nothing else.`,
    ].filter(Boolean).join('\n');
  }
  return [
    `Напиши короткое тёплое искреннее поздравление с днём рождения для "${b.name}" от "${ownerName || 'близкого человека'}".`,
    `Максимум 2-3 предложения. Личный душевный тон. Без штампов вроде "счастья, здоровья, успехов".`,
    age != null ? `В этом году ему/ей исполняется ${age} ${pluralYears(age)}.` : '',
    b.note ? `Личный контекст (используй ненавязчиво): ${b.note}` : '',
    `Не более 1-2 эмодзи. В ответе ТОЛЬКО текст поздравления на русском, без префиксов.`,
  ].filter(Boolean).join('\n');
}

async function generateCongrats(b, ownerName, lang, config) {
  const groqKeys = getGroqKeys(config);
  if (!groqKeys.length) {
    return lang === 'en'
      ? `Happy birthday, ${b.name}! Wishing you a wonderful year ahead. 🎉`
      : `С днём рождения, ${b.name}! Пусть этот год будет для тебя особенным. 🎉`;
  }
  const prompt = congratulationPrompt(b, ownerName, lang);
  const res = await requestGroqChatCompletion([
    { role: 'system', content: lang === 'en'
      ? 'You write short, warm, personal birthday messages. Reply only with the greeting text.'
      : 'Ты пишешь короткие тёплые личные поздравления. Отвечай только текстом поздравления.' },
    { role: 'user', content: prompt },
  ], { groqKeys, maxTokens: 250, temperature: 0.85, model: 'llama-3.3-70b-versatile' });

  const text = (res && (res.content || res.text || '')).trim();
  if (!text) {
    return lang === 'en'
      ? `Happy birthday, ${b.name}! 🎂`
      : `С днём рождения, ${b.name}! 🎂`;
  }
  return text;
}

function congratsKeyboard(birthdayId, lang) {
  const T = lang === 'en' ? {
    regen: '🔁 New version',
    share: '📤 Share',
    send: '🎂 Send to contact',
    back: '« Back to list',
  } : {
    regen: '🔁 Ещё вариант',
    share: '📤 Поделиться',
    send: '🎂 Отправить от меня',
    back: '« К списку',
  };
  const kb = new InlineKeyboard()
    .text(T.regen, `dr_gen:${birthdayId}`).row()
    .switchInlineCurrent(T.share, `dr_${birthdayId}`).row()
    .text(T.send, `dr_send:${birthdayId}`).row()
    .text(T.back, 'dr_main');
  return kb;
}

// ---------- module setup ----------
function setupBirthdays(bot, storage, config) {
  // Ensure storage helpers exist (added in our storage.js patch)
  if (typeof storage.listBirthdays !== 'function') {
    console.warn('[birthdays] storage helpers missing — module not active');
    return;
  }

  // /dr — main dashboard
  bot.command(['dr', 'birthdays'], async (ctx) => {
    const lang = getOwnerLang(ctx);
    const { text, keyboard } = await buildDashboard(ctx, storage, lang);
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
  });

  // /addbirthday  (interactive or quick)
  bot.command('addbirthday', async (ctx) => {
    const lang = getOwnerLang(ctx);
    const args = (ctx.match || '').toString().trim();
    if (!args) {
      const T = lang === 'en' ? {
        head: '➕ <b>Add birthday</b>',
        body: 'Send the contact like:\n<code>Ivan Petrov 14.05</code>\nor with year:\n<code>Maria 14.05.1990</code>\nor with telegram:\n<code>Oleg 09.05 @oleg</code>\n\nOr just send a <b>contact card</b> in this chat — I\'ll pick name and ask the date.',
      } : {
        head: '➕ <b>Добавить день рождения</b>',
        body: 'Отправь так:\n<code>Иван Петров 14.05</code>\nили с годом:\n<code>Мария 14.05.1990</code>\nили с TG:\n<code>Олег 09.05 @oleg</code>\n\nИли просто <b>пришли карточку контакта</b> в чат — я возьму имя и спрошу дату.',
      };
      // Mark expectation in awaitingInput state
      storage.setBirthdayWizardState(String(ctx.from.id), { mode: 'await_quickadd' });
      await ctx.reply(`${T.head}\n\n${T.body}`, { parse_mode: 'HTML' });
      return;
    }
    await tryQuickAdd(ctx, storage, args, lang);
  });

  // Plain text fallback when wizard expects input
  bot.on('message:text', async (ctx, next) => {
    const ownerId = String(ctx.from.id);
    const wiz = storage.getBirthdayWizardState(ownerId);
    if (!wiz) return next();
    if (wiz.mode === 'await_quickadd') {
      const lang = getOwnerLang(ctx);
      const handled = await tryQuickAdd(ctx, storage, ctx.message.text.trim(), lang);
      if (handled) storage.clearBirthdayWizardState(ownerId);
      return;
    }
    if (wiz.mode === 'await_date_for_contact') {
      const lang = getOwnerLang(ctx);
      const parsed = parseDateLoose(ctx.message.text.trim());
      if (!parsed) {
        await ctx.reply(lang === 'en'
          ? 'Could not parse date. Try "14.05" or "14.05.1990".'
          : 'Не удалось разобрать дату. Попробуй «14.05» или «14.05.1990».');
        return;
      }
      const id = storage.addBirthday(ownerId, {
        name: wiz.name,
        day: parsed.day,
        month: parsed.month,
        year: parsed.year,
        tgUsername: wiz.tgUsername || null,
        tgUserId: wiz.tgUserId || null,
        source: 'contact-card',
      });
      storage.clearBirthdayWizardState(ownerId);
      await ctx.reply(lang === 'en'
        ? `✅ Saved: ${wiz.name} — ${formatDate(parsed.month, parsed.day, lang)}`
        : `✅ Сохранил: ${wiz.name} — ${formatDate(parsed.month, parsed.day, lang)}`);
      return;
    }
    return next();
  });

  // Contact card forwarded to bot — pre-fill name and ask date
  bot.on('message:contact', async (ctx) => {
    const c = ctx.message.contact;
    const ownerId = String(ctx.from.id);
    const lang = getOwnerLang(ctx);
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Без имени';
    storage.setBirthdayWizardState(ownerId, {
      mode: 'await_date_for_contact',
      name,
      tgUsername: null,
      tgUserId: c.user_id || null,
    });
    await ctx.reply(lang === 'en'
      ? `Got <b>${escapeHtml(name)}</b>. Now send their birthday — like <code>14.05</code> or <code>14.05.1990</code>.`
      : `Принял <b>${escapeHtml(name)}</b>. Теперь отправь дату рождения — например <code>14.05</code> или <code>14.05.1990</code>.`,
      { parse_mode: 'HTML' });
  });

  // Callbacks
  bot.callbackQuery('dr_main', async (ctx) => {
    const lang = getOwnerLang(ctx);
    const { text, keyboard } = await buildDashboard(ctx, storage, lang);
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    } catch {
      await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' });
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dr_view:(.+)$/, async (ctx) => {
    const lang = getOwnerLang(ctx);
    const id = ctx.match[1];
    const b = storage.getBirthday(String(ctx.from.id), id);
    if (!b) { await ctx.answerCallbackQuery({ text: 'Не найдено', show_alert: false }); return; }
    const { text, keyboard } = buildContactCard(b, lang);
    try { await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' }); }
    catch { await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' }); }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^dr_gen:(.+)$/, async (ctx) => {
    const lang = getOwnerLang(ctx);
    const id = ctx.match[1];
    const b = storage.getBirthday(String(ctx.from.id), id);
    if (!b) { await ctx.answerCallbackQuery({ text: 'Не найдено' }); return; }
    await ctx.answerCallbackQuery({ text: lang === 'en' ? 'Generating…' : 'Генерирую…' });
    let text;
    try {
      text = await generateCongrats(b, ownerName(ctx), lang, config);
    } catch (e) {
      text = lang === 'en'
        ? `Happy birthday, ${b.name}! Wishing you a wonderful year. 🎂`
        : `С днём рождения, ${b.name}! Пусть этот год будет особенным. 🎂`;
    }
    storage.saveBirthdayLastText(String(ctx.from.id), id, text);
    const wrapped = `🎂 <b>${escapeHtml(b.name)}</b>\n\n${escapeHtml(text)}`;
    await ctx.reply(wrapped, {
      reply_markup: congratsKeyboard(id, lang),
      parse_mode: 'HTML',
    });
  });

  bot.callbackQuery(/^dr_send:(.+)$/, async (ctx) => {
    const lang = getOwnerLang(ctx);
    const id = ctx.match[1];
    const ownerId = String(ctx.from.id);
    const b = storage.getBirthday(ownerId, id);
    const text = storage.getBirthdayLastText(ownerId, id);
    if (!b || !text) { await ctx.answerCallbackQuery({ text: 'Сначала ✨ Сгенерировать' }); return; }

    const bizConn = storage.getBusinessConnection(ownerId);
    if (!bizConn) {
      await ctx.answerCallbackQuery({
        text: lang === 'en'
          ? 'Connect this bot in Telegram → Settings → Telegram Business → Chatbots, then try again.'
          : 'Подключи бота в Telegram → Настройки → Telegram Business → Чат-боты, потом снова.',
        show_alert: true,
      });
      return;
    }
    if (!b.tgUserId) {
      await ctx.answerCallbackQuery({
        text: lang === 'en'
          ? 'No Telegram user_id for this contact. Use Share instead.'
          : 'Нет TG user_id у контакта. Используй «Поделиться».',
        show_alert: true,
      });
      return;
    }
    try {
      await ctx.api.raw.sendMessage({
        chat_id: b.tgUserId,
        text,
        business_connection_id: bizConn,
      });
      storage.markBirthdaySent(ownerId, id);
      await ctx.answerCallbackQuery({
        text: lang === 'en' ? '✅ Sent from your account' : '✅ Отправлено от твоего имени',
        show_alert: false,
      });
    } catch (e) {
      await ctx.answerCallbackQuery({
        text: (lang === 'en' ? 'Failed: ' : 'Ошибка: ') + (e.description || e.message || 'unknown'),
        show_alert: true,
      });
    }
  });

  bot.callbackQuery(/^dr_del:(.+)$/, async (ctx) => {
    const lang = getOwnerLang(ctx);
    const id = ctx.match[1];
    storage.deleteBirthday(String(ctx.from.id), id);
    await ctx.answerCallbackQuery({ text: lang === 'en' ? 'Deleted' : 'Удалено' });
    const { text, keyboard } = await buildDashboard(ctx, storage, lang);
    try { await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: 'HTML' }); }
    catch { await ctx.reply(text, { reply_markup: keyboard, parse_mode: 'HTML' }); }
  });

  bot.callbackQuery('dr_add_start', async (ctx) => {
    const lang = getOwnerLang(ctx);
    storage.setBirthdayWizardState(String(ctx.from.id), { mode: 'await_quickadd' });
    await ctx.answerCallbackQuery();
    const T = lang === 'en'
      ? 'Send: <code>Ivan 14.05</code>  or with year:  <code>Ivan 14.05.1990</code>  or with TG:  <code>Ivan 14.05 @ivan</code>'
      : 'Отправь: <code>Иван 14.05</code>  или с годом:  <code>Иван 14.05.1990</code>  или с TG:  <code>Иван 14.05 @ivan</code>';
    await ctx.reply(T, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('dr_settings', async (ctx) => {
    const lang = getOwnerLang(ctx);
    await ctx.answerCallbackQuery();
    const ownerId = String(ctx.from.id);
    const has = !!storage.getBusinessConnection(ownerId);
    const T = lang === 'en' ? {
      head: '⚙️ <b>Birthday settings</b>',
      lang: `Congratulation language: <b>${lang.toUpperCase()}</b> (auto from your TG language)`,
      biz: has
        ? '✅ Business Bot connected — congratulations can be sent from your account automatically.'
        : '⚠️ Business Bot not connected.\nTo enable auto-sending: Settings → Telegram Business → Chatbots → @' + (ctx.me.username || 'GoldenConnect_bizbot'),
      time: 'Morning ping: 09:00 MSK',
    } : {
      head: '⚙️ <b>Настройки</b>',
      lang: `Язык поздравлений: <b>${lang.toUpperCase()}</b> (автоматически по языку TG)`,
      biz: has
        ? '✅ Business Bot подключён — могу отправлять поздравления от твоего имени.'
        : '⚠️ Business Bot не подключён.\nЧтобы включить авто-отправку: Настройки TG → Telegram Business → Чат-боты → @' + (ctx.me.username || 'GoldenConnect_bizbot'),
      time: 'Утренний пинг: 09:00 MSK',
    };
    await ctx.reply([T.head, '', T.lang, T.biz, T.time].join('\n'), { parse_mode: 'HTML' });
  });

  // Inline mode — share prepared text via "📤 Поделиться"
  bot.on('inline_query', async (ctx) => {
    const q = (ctx.inlineQuery.query || '').trim();
    const m = q.match(/^dr_(.+)$/);
    if (!m) return;
    const id = m[1];
    const ownerId = String(ctx.from.id);
    const text = storage.getBirthdayLastText(ownerId, id);
    if (!text) {
      await ctx.answerInlineQuery([], { cache_time: 1 });
      return;
    }
    const b = storage.getBirthday(ownerId, id);
    await ctx.answerInlineQuery([
      {
        type: 'article',
        id: `bday_${id}`,
        title: '🎂 ' + (b ? b.name : 'Поздравление'),
        description: text.slice(0, 60) + (text.length > 60 ? '…' : ''),
        input_message_content: { message_text: text },
      },
    ], { cache_time: 1, is_personal: true });
  });

  // Business connection lifecycle: save / forget per owner
  // Telegram sends business_connection update when user enables/disables bot.
  bot.on('business_connection', async (ctx) => {
    const conn = ctx.businessConnection;
    if (!conn) return;
    const ownerId = String(conn.user.id);
    if (conn.is_enabled) {
      storage.setBusinessConnection(ownerId, conn.id);
      try {
        const lang = getOwnerLang({ from: conn.user });
        await ctx.api.sendMessage(ownerId, lang === 'en'
          ? '✅ Business Bot enabled. /dr — manage birthdays. I can now send congratulations from your account.'
          : '✅ Business Bot подключён. /dr — управление днями рождения. Теперь могу слать поздравления от твоего имени.');
      } catch {}
    } else {
      storage.clearBusinessConnection(ownerId);
    }
  });
}

// Quick-add parser. Returns true if recognised.
async function tryQuickAdd(ctx, storage, raw, lang) {
  const ownerId = String(ctx.from.id);
  // Format: "<Name parts...> <date> [@username]"
  const text = raw.replace(/\s+/g, ' ').trim();
  // Extract @username (optional, last token)
  let tgUsername = null;
  const usernameMatch = text.match(/(@[A-Za-z0-9_]{4,})\s*$/);
  let core = text;
  if (usernameMatch) {
    tgUsername = usernameMatch[1].slice(1);
    core = text.slice(0, usernameMatch.index).trim();
  }
  // Find date as last token-group
  const tokens = core.split(' ');
  if (tokens.length < 2) {
    await ctx.reply(lang === 'en'
      ? 'Format: <name> <date>. E.g. "Ivan 14.05"'
      : 'Формат: <имя> <дата>. Например «Иван 14.05»');
    return false;
  }
  let dateToken = tokens[tokens.length - 1];
  let parsed = parseDateLoose(dateToken);
  if (!parsed && tokens.length >= 3) {
    // Maybe date is "14 мая"
    dateToken = tokens.slice(-2).join(' ');
    parsed = parseDateLoose(dateToken);
    if (parsed) tokens.splice(-2, 2);
  } else if (parsed) {
    tokens.pop();
  }
  if (!parsed) {
    await ctx.reply(lang === 'en'
      ? `Could not parse date in "${escapeHtml(raw)}".`
      : `Не нашёл дату в «${escapeHtml(raw)}».`);
    return false;
  }
  const name = tokens.join(' ').trim();
  if (!name) {
    await ctx.reply(lang === 'en' ? 'Name is required.' : 'Нужно имя.');
    return false;
  }
  const id = storage.addBirthday(ownerId, {
    name, day: parsed.day, month: parsed.month, year: parsed.year,
    tgUsername, source: 'manual',
  });
  await ctx.reply(lang === 'en'
    ? `✅ Saved: <b>${escapeHtml(name)}</b> — ${formatDate(parsed.month, parsed.day, lang)}${parsed.year ? ` ${parsed.year}` : ''}`
    : `✅ Сохранил: <b>${escapeHtml(name)}</b> — ${formatDate(parsed.month, parsed.day, lang)}${parsed.year ? ` ${parsed.year}` : ''}`,
    { parse_mode: 'HTML' });
  return true;
}

module.exports = { setupBirthdays };
