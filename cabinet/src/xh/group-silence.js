// Group-level "silent mode" for Golden Connect bot.
// SEMANTICS: groups are SILENT BY DEFAULT. Bot only does technical work
// (ADX channel-membership checks, autoposting). To enable chat features
// (member tracking commands, AI replies, welcome messages, digests, drip)
// admin must run /goldenConnect_active inside the group.
//
// Storage: tg_group_active(chat_id PRIMARY KEY, activated_by, activated_at).
// Absence of row => silent. Legacy table tg_group_silenced kept but unused.

let _db = null;
function _getDb() {
  if (_db) return _db;
  const dbm = require('../planner/db/database');
  _db = dbm.getDb();
  try {
    _db.exec(`
      CREATE TABLE IF NOT EXISTS tg_group_active (
        chat_id INTEGER PRIMARY KEY,
        activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        activated_by INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_tg_active_chat ON tg_group_active(chat_id);
      CREATE TABLE IF NOT EXISTS tg_group_silenced (
        chat_id INTEGER PRIMARY KEY,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        muted_by INTEGER
      );
    `);
  } catch (_) {}
  return _db;
}

// Returns TRUE if the bot must be silent in this group.
// Private chats (chat_id > 0) are NEVER silenced.
function isSilenced(chatId) {
  if (!chatId || chatId > 0) return false;
  try {
    const r = _getDb().prepare('SELECT 1 FROM tg_group_active WHERE chat_id=?').get(Number(chatId));
    return !r; // absent = silent
  } catch (_) { return true; } // db error = err on safe side = silent
}

function isActive(chatId) { return !isSilenced(chatId); }

// Mark group as active (admin opted in to chat features)
function setActive(chatId, activatedByTgId) {
  if (!chatId) return;
  try {
    _getDb().prepare(
      'INSERT OR REPLACE INTO tg_group_active (chat_id, activated_by, activated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
    ).run(Number(chatId), activatedByTgId ? Number(activatedByTgId) : null);
  } catch (e) { console.warn('[group-silence] setActive', e && e.message); }
}

// Mark group as silent (default state, no-op if already silent)
function setSilenced(chatId, _mutedByTgId) {
  if (!chatId) return;
  try {
    _getDb().prepare('DELETE FROM tg_group_active WHERE chat_id=?').run(Number(chatId));
  } catch (e) { console.warn('[group-silence] setSilenced', e && e.message); }
}

async function isChatAdmin(ctx) {
  try {
    if (!ctx.chat || ctx.chat.type === 'private') return true;
    const m = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return ['creator', 'administrator'].includes(m && m.status);
  } catch (_) { return false; }
}

function setupCommands(bot) {
  // /goldenConnect_active — admin: enable chat features in this group
  bot.command('goldenConnect_active', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в группе.');
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админ группы может это включить.');
    setActive(ctx.chat.id, ctx.from.id);
    return ctx.reply(
      '✅ <b>Чат-режим включён в этой группе.</b>\n\n' +
      'Теперь бот будет:\n' +
      '• Приветствовать новых участников (AI-приветствие)\n' +
      '• Отвечать на команды /members, /quiet, /active7d, /who и др.\n' +
      '• Отвечать на @упоминания через AI\n' +
      '• Присылать утренний/вечерний digest активности\n' +
      '• Drip-сообщения новичкам в личку\n\n' +
      'Технические функции (ADX-проверка подписок, автопостинг) работают всегда независимо от этого режима.\n\n' +
      'Чтобы вернуть тишину — /goldenConnect_silent',
      { parse_mode: 'HTML' }
    );
  });

  // /goldenConnect_silent — admin: disable chat features (back to default)
  bot.command('goldenConnect_silent', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в группе.');
    if (!await isChatAdmin(ctx)) return ctx.reply('⛔ Только админ группы может это переключить.');
    setSilenced(ctx.chat.id, ctx.from.id);
    return ctx.reply(
      '🤫 <b>Тихий режим вернулся (это поведение по умолчанию).</b>\n\n' +
      'Бот больше не отвечает в чате. Технические функции остаются:\n' +
      '• ADX-проверка подписок на каналы\n' +
      '• Автопостинг по расписанию (если настроен)\n' +
      '• Учёт join/leave (silent)\n\n' +
      'Чтобы включить чат-режим — /goldenConnect_active',
      { parse_mode: 'HTML' }
    );
  });

  // /goldenConnect_status — show current mode
  bot.command('goldenConnect_status', async (ctx) => {
    if (!ctx.chat || ctx.chat.type === 'private') return ctx.reply('Эта команда работает только в группе.');
    const active = isActive(ctx.chat.id);
    return ctx.reply(
      active
        ? '✅ Режим: <b>Чат-режим включён</b>.\n\nБот реагирует на команды, упоминания, шлёт digest. /goldenConnect_silent чтобы выключить.'
        : '🤫 Режим: <b>Тихий (по умолчанию)</b>.\n\nБот молчит в чате, делает только тех. работу (ADX, автопостинг). /goldenConnect_active чтобы включить чат-функции.',
      { parse_mode: 'HTML' }
    );
  });

  // my_chat_member — бот добавлен в группу. НЕ авто-активируем — silent by default.
  bot.on('my_chat_member', async (ctx) => {
    try {
      const upd = ctx.myChatMember || ctx.update?.my_chat_member;
      if (!upd) return;
      const chat = upd.chat;
      if (!chat || (chat.type !== 'group' && chat.type !== 'supergroup')) return;
      const newStatus = upd.new_chat_member?.status;
      const oldStatus = upd.old_chat_member?.status;
      const becameMember = ['member', 'administrator'].includes(newStatus) &&
                           !['member', 'administrator'].includes(oldStatus);
      if (!becameMember) return;
      // Default = silent. No welcome message. Admin sees status via /goldenConnect_status.
    } catch (e) { console.warn('[group-silence] my_chat_member', e && e.message); }
  });
}

// Early-running middleware: in silent groups, drop ALL chat messages
// except the three mode-toggle commands. Must be installed BEFORE other
// bot.command/bot.on handlers so it can short-circuit them.
function setupSilenceGate(bot) {
  bot.use(async (ctx, next) => {
    try {
      const c = ctx.chat;
      if (!c || (c.type !== 'group' && c.type !== 'supergroup')) return next();
      if (isActive(c.id)) return next();
      // Group is silent (default). Allow only admin mode-toggle commands.
      const txt = (ctx.message && ctx.message.text) || '';
      if (/^\/(goldenConnect_active|goldenConnect_silent|goldenConnect_status)(@|\b)/.test(txt)) return next();
      // Otherwise: drop. Bot stays silent in chat.
      return; // do not call next() — no further handlers fire
    } catch (_) { return next(); }
  });
}

module.exports = { isSilenced, isActive, setSilenced, setActive, setupCommands, setupSilenceGate };
