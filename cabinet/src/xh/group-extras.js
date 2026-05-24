// Golden Connect group bot extras: /summary, /poll, /note, /search, /remind.
// Layered on top of the existing planner/bot/group.js (which has /task,
// /assign, /list, /board, /mytasks, /done, /stats, /gs_admin, /gs_settings).
//
// Persistence: piggy-backs on planner SQLite via planner/db/database.js.
// Adds two tables on first run: group_msg_buffer (rolling chat for /summary)
// and group_notes (searchable notes per workspace).

const { InlineKeyboard } = require('grammy');
const https = require('https');
const db = require('../planner/db/database');

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const TEXT_MODEL = 'llama-3.3-70b-versatile';

const MSG_BUFFER_LIMIT = 200;       // keep last 200 msgs per chat
const SUMMARY_WINDOW = 100;         // summarize last 100 msgs
const SUMMARY_COOLDOWN_MS = 60_000; // 1 min between /summary calls

// In-memory cooldown for /summary
const lastSummary = new Map();

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS group_msg_buffer (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      tg_user_id INTEGER,
      from_name TEXT,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gmb_chat ON group_msg_buffer(chat_id, id);

    CREATE TABLE IF NOT EXISTS group_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      author_tg_id INTEGER,
      author_name TEXT,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gn_chat ON group_notes(chat_id, id);

    CREATE TABLE IF NOT EXISTS group_reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER NOT NULL,
      created_by_tg_id INTEGER,
      created_by_name TEXT,
      text TEXT NOT NULL,
      due_at DATETIME NOT NULL,
      fired INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_gr_due ON group_reminders(fired, due_at);
  `);
}

function rememberMsg(chatId, fromTgId, fromName, text) {
  if (!text || text.length > 1500) return;
  const rawDb = db.getDb();
  rawDb.prepare(
    'INSERT INTO group_msg_buffer (chat_id, tg_user_id, from_name, text) VALUES (?, ?, ?, ?)'
  ).run(chatId, fromTgId || null, fromName || '', text.slice(0, 1500));
  // Trim to MSG_BUFFER_LIMIT per chat
  const cnt = rawDb.prepare('SELECT COUNT(*) AS n FROM group_msg_buffer WHERE chat_id = ?').get(chatId).n;
  if (cnt > MSG_BUFFER_LIMIT) {
    const cut = cnt - MSG_BUFFER_LIMIT;
    rawDb.prepare(
      'DELETE FROM group_msg_buffer WHERE id IN (SELECT id FROM group_msg_buffer WHERE chat_id = ? ORDER BY id ASC LIMIT ?)'
    ).run(chatId, cut);
  }
}

async function callGroq(systemPrompt, userPrompt) {
  if (!GROQ_KEYS.length) throw new Error('no_groq_keys');
  const body = JSON.stringify({
    model: TEXT_MODEL, max_tokens: 800, temperature: 0.4,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return new Promise((resolve, reject) => {
    const key = GROQ_KEYS[Math.floor(Math.random() * GROQ_KEYS.length)];
    const req = https.request({
      method: 'POST', hostname: 'api.groq.com', path: '/openai/v1/chat/completions',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: 25000,
    }, (res) => {
      let buf = ''; res.on('data', (c) => buf += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(buf);
          resolve(j.choices?.[0]?.message?.content || '');
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('groq_timeout')));
    req.write(body); req.end();
  });
}

function setupGroupExtras(bot) {
  ensureSchema();

  // ── Pre-collect group messages into buffer (lightweight middleware) ──
  bot.use(async (ctx, next) => {
    try {
      const m = ctx.message;
      const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
      if (isGroup && m && m.text && !m.text.startsWith('/')) {
        const name = (ctx.from?.first_name || '') + (ctx.from?.username ? ' @' + ctx.from.username : '');
        rememberMsg(ctx.chat.id, ctx.from?.id, name, m.text);
      }
    } catch (e) {}
    return next();
  });

  // ── /summary — AI-резюме последних N сообщений ──
  bot.command('summary', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 /summary работает только в групповом чате.');

    const last = lastSummary.get(ctx.chat.id) || 0;
    if (Date.now() - last < SUMMARY_COOLDOWN_MS) {
      return ctx.reply(`⏳ Подожди немного — резюме можно делать раз в минуту.`);
    }
    lastSummary.set(ctx.chat.id, Date.now());

    const rawDb = db.getDb();
    const msgs = rawDb.prepare(
      'SELECT from_name, text, created_at FROM group_msg_buffer WHERE chat_id = ? ORDER BY id DESC LIMIT ?'
    ).all(ctx.chat.id, SUMMARY_WINDOW).reverse();

    if (msgs.length < 5) {
      return ctx.reply('🤔 Нечего резюмировать — слишком мало сообщений в буфере.');
    }

    const transcript = msgs.map(m => `${m.from_name || 'User'}: ${m.text}`).join('\n');
    const sys = 'Ты делаешь краткое резюме делового чата. Возвращай 3 раздела: ОБСУДИЛИ, РЕШИЛИ, ДЕЙСТВИЯ (кто что должен сделать). На русском, до 250 слов, без воды.';
    const usr = 'Сделай резюме этой переписки:\n\n' + transcript;

    const thinking = await ctx.reply('🤖 Готовлю резюме…');
    try {
      const out = await callGroq(sys, usr);
      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id,
        '📝 <b>Резюме последних ' + msgs.length + ' сообщений</b>\n\n' + escapeHtml(out),
        { parse_mode: 'HTML' });
    } catch (e) {
      await ctx.api.editMessageText(ctx.chat.id, thinking.message_id,
        '❌ AI недоступен: ' + (e.message || 'unknown'));
    }
  });

  // ── /poll Вопрос?|Опц1|Опц2|Опц3 — встроенный опрос ──
  bot.command('poll', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 /poll работает только в группе.');
    const txt = (ctx.match || '').trim();
    if (!txt) {
      return ctx.reply(
        '📊 <b>Создать опрос</b>\n\n' +
        'Формат: /poll Вопрос?|Опц1|Опц2|Опц3\n\n' +
        'Пример: <code>/poll Когда созвон?|Завтра 14:00|В пятницу|Через неделю</code>',
        { parse_mode: 'HTML' }
      );
    }
    const parts = txt.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) return ctx.reply('Нужны минимум вопрос + 2 варианта (через |).');
    const question = parts[0];
    const options = parts.slice(1, 11); // TG limit: 10 options
    try {
      await ctx.api.sendPoll(ctx.chat.id, question, options.map(o => ({ text: o })), {
        is_anonymous: false, allows_multiple_answers: false,
      });
    } catch (e) {
      await ctx.reply('❌ Не получилось создать опрос: ' + (e.message || ''));
    }
  });

  // ── /note текст — сохранить заметку группы ──
  bot.command('note', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 /note работает только в группе. В личке используй /journal.');
    const text = (ctx.match || '').trim();
    if (!text) return ctx.reply('Формат: /note <i>текст заметки</i>', { parse_mode: 'HTML' });

    const rawDb = db.getDb();
    const name = (ctx.from?.first_name || '') + (ctx.from?.username ? ' @' + ctx.from.username : '');
    const r = rawDb.prepare(
      'INSERT INTO group_notes (chat_id, author_tg_id, author_name, text) VALUES (?, ?, ?, ?)'
    ).run(ctx.chat.id, ctx.from?.id, name, text.slice(0, 2000));
    await ctx.reply(`📌 Заметка #${r.lastInsertRowid} сохранена. Поиск: /search <слово>`, { reply_to_message_id: ctx.message.message_id });
  });

  // ── /search query — поиск по заметкам группы ──
  bot.command('search', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 /search работает только в группе.');
    const q = (ctx.match || '').trim();
    if (!q) return ctx.reply('Формат: /search <i>что ищем</i>', { parse_mode: 'HTML' });
    const rawDb = db.getDb();
    const rows = rawDb.prepare(
      "SELECT id, author_name, text, created_at FROM group_notes WHERE chat_id = ? AND text LIKE ? ORDER BY id DESC LIMIT 10"
    ).all(ctx.chat.id, '%' + q + '%');
    if (!rows.length) return ctx.reply('🔍 Ничего не нашлось.');
    const lines = ['🔍 <b>Найдено ' + rows.length + ':</b>', ''];
    rows.forEach(r => {
      lines.push(`📌 <b>#${r.id}</b> · <i>${escapeHtml(r.author_name || 'User')}</i> · ${r.created_at}`);
      lines.push(escapeHtml(r.text.slice(0, 300)));
      lines.push('');
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // ── /notes — последние 10 заметок группы ──
  bot.command('notes', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 Только в группе.');
    const rawDb = db.getDb();
    const rows = rawDb.prepare(
      'SELECT id, author_name, text, created_at FROM group_notes WHERE chat_id = ? ORDER BY id DESC LIMIT 10'
    ).all(ctx.chat.id);
    if (!rows.length) return ctx.reply('📋 Заметок пока нет. Создай первую: /note <текст>');
    const lines = ['📋 <b>Последние заметки группы:</b>', ''];
    rows.forEach(r => {
      lines.push(`<b>#${r.id}</b> · <i>${escapeHtml(r.author_name || 'User')}</i>`);
      lines.push(escapeHtml(r.text.slice(0, 200)));
      lines.push('');
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  // ── /remind 30мин текст / /remind 18:00 текст ──
  bot.command('remind', async (ctx) => {
    const isGroup = ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup');
    if (!isGroup) return ctx.reply('💡 /remind в группе. В личке используй планировщик /add.');
    const txt = (ctx.match || '').trim();
    if (!txt) {
      return ctx.reply(
        '⏰ <b>Напоминание группе</b>\n\n' +
        '/remind 30мин Созвон\n' +
        '/remind 1ч Перерыв\n' +
        '/remind 18:00 Дедлайн отчёта',
        { parse_mode: 'HTML' }
      );
    }
    // Parse: "30мин текст" / "1ч текст" / "18:00 текст" / "завтра 10:00 текст"
    let dueAt = null;
    const m1 = txt.match(/^(\d+)\s*(мин|min|m)\s+(.+)/i);
    const m2 = txt.match(/^(\d+)\s*(ч|h|hour|hours|час|часа|часов)\s+(.+)/i);
    const m3 = txt.match(/^(\d{1,2}):(\d{2})\s+(.+)/);
    let body = '';
    if (m1) { dueAt = new Date(Date.now() + Number(m1[1]) * 60_000); body = m1[3]; }
    else if (m2) { dueAt = new Date(Date.now() + Number(m2[1]) * 3600_000); body = m2[3]; }
    else if (m3) {
      const d = new Date();
      d.setHours(Number(m3[1]), Number(m3[2]), 0, 0);
      if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
      dueAt = d; body = m3[3];
    } else {
      return ctx.reply('Не понял время. Примеры: «30мин», «1ч», «18:00»');
    }
    if (!body || body.length < 2) return ctx.reply('Слишком короткое описание.');

    const rawDb = db.getDb();
    const name = (ctx.from?.first_name || '') + (ctx.from?.username ? ' @' + ctx.from.username : '');
    rawDb.prepare(
      'INSERT INTO group_reminders (chat_id, created_by_tg_id, created_by_name, text, due_at) VALUES (?, ?, ?, ?, ?)'
    ).run(ctx.chat.id, ctx.from?.id, name, body.slice(0, 500), dueAt.toISOString());
    const dt = dueAt.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    await ctx.reply(`⏰ Напомню группе в ${dt}: <i>${escapeHtml(body)}</i>`, { parse_mode: 'HTML' });
  });

  console.log('[group-extras] /summary /poll /note /search /notes /remind ready');
}

// Cron: fire group reminders that are due.
function startGroupRemindersCron(bot) {
  setInterval(async () => {
    try {
      const rawDb = db.getDb();
      const due = rawDb.prepare(
        "SELECT * FROM group_reminders WHERE fired = 0 AND due_at <= datetime('now') LIMIT 20"
      ).all();
      for (const r of due) {
        try {
          await bot.api.sendMessage(
            r.chat_id,
            `⏰ <b>Напоминание</b>\n\n${escapeHtml(r.text)}\n\n<i>от ${escapeHtml(r.created_by_name || 'User')}</i>`,
            { parse_mode: 'HTML' }
          );
        } catch (e) { /* chat blocked / removed bot */ }
        rawDb.prepare('UPDATE group_reminders SET fired = 1 WHERE id = ?').run(r.id);
      }
    } catch (e) { console.error('[group-reminders cron]', e && e.message); }
  }, 30_000); // every 30 sec
  console.log('[group-extras] reminders cron started (every 30s)');
}

module.exports = { setupGroupExtras, startGroupRemindersCron };
