// Trendex chat-join nudge: периодически зовёт юзеров вступить в @TRENDEX_AD
// если они там не состоят. Останавливается когда вступили.

const { InlineKeyboard } = require('grammy');
const { isSilenced: _gsIsSilenced } = require('./group-silence');
const db = require('../planner/db/database');

// Целевой чат — настраивается через env, по умолчанию @TRENDEX_AD
const TARGET_CHAT = process.env.TRENDEX_GROUP_CHAT || '@TRENDEX_AD';
const TARGET_CHAT_URL = 'https://t.me/' + String(TARGET_CHAT).replace(/^@/, '');

// График эскалации: после регистрации в боте → нудж через
// step 1 = 1 день, step 2 = 3 дня после step 1, step 3 = 7 дней, step 4 = 14 дней,
// потом раз в 14 дней (мягко, чтобы не задолбать).
const NUDGE_STEPS = [
  { step: 1, hoursAfter: 24 },
  { step: 2, hoursAfter: 24 * 3 },
  { step: 3, hoursAfter: 24 * 7 },
  { step: 4, hoursAfter: 24 * 14 },
];
const NUDGE_REPEAT_DAYS = 14; // после step 4 — раз в 14 дней

const NUDGE_TEXTS = {
  1: () => [
    '👋 Привет! Не нашёл тебя в нашем чате.',
    '',
    'У Trendex есть официальный чат партнёров — <b>' + TARGET_CHAT + '</b>',
    '',
    'Там:',
    '• 🔴 Анонсы эфиров с разбором кейсов',
    '• 💡 Обсуждение тарифов и стратегий',
    '• 👥 Поддержка от опытных партнёров',
    '• 🎯 Свежие шаблоны рекламных постов',
    '',
    'Заходи 👇',
  ].join('\n'),

  2: () => [
    '🔔 Напоминаю — наш чат <b>' + TARGET_CHAT + '</b> ждёт тебя.',
    '',
    'За эту неделю в чате обсудили:',
    '• Как окупить тариф LAUNCH за 5-7 дней',
    '• Свежие AI-инструменты для постов',
    '• Когда стартует расстановка матрицы',
    '',
    'Не пропускай — там вся актуальная инфа из первых рук.',
  ].join('\n'),

  3: () => [
    '💎 Третий раз зову — потому что это правда полезно.',
    '',
    'В <b>' + TARGET_CHAT + '</b> сейчас:',
    '• Топ-партнёры делятся работающими тактиками',
    '• Бот ' + (process.env.BOT_USERNAME ? '@' + process.env.BOT_USERNAME : '@Trendex_bizbot') + ' там тоже работает: /summary, /poll, /remind',
    '• Анонимная поддержка — можно писать от имени группы',
    '',
    'Если не зайдёшь сейчас — буду напоминать раз в 2 недели мягко 😉',
  ].join('\n'),

  4: () => [
    '✨ Последняя «настойчивая» напоминалка про чат <b>' + TARGET_CHAT + '</b>.',
    '',
    'Обещаю — после этого буду тихим, раз в 2 недели не больше.',
    '',
    'Просто загляни — посмотри что там, потом решишь.',
  ].join('\n'),

  default: () => [
    '👋 Привет! Если ещё не в чате <b>' + TARGET_CHAT + '</b> — заходи.',
    'Там всё свежее по Trendex 🚀',
  ].join('\n'),
};

function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS chat_join_nudges (
      tg_user_id INTEGER PRIMARY KEY,
      target_chat TEXT NOT NULL DEFAULT '${TARGET_CHAT}',
      is_member INTEGER DEFAULT 0,
      member_status TEXT,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_check_at DATETIME,
      last_check_ok INTEGER DEFAULT 0,
      nudges_sent INTEGER DEFAULT 0,
      last_nudge_at DATETIME,
      joined_at DATETIME,
      left_at DATETIME,
      blocked_bot INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cjn_pending ON chat_join_nudges(is_member, last_check_at);
  `);
}

// Called for every TG user that interacts with the bot in private — adds to tracker.
function rememberUser(tgUserId) {
  if (!tgUserId || tgUserId <= 0) return;
  try {
    const rawDb = db.getDb();
    rawDb.prepare(
      'INSERT OR IGNORE INTO chat_join_nudges (tg_user_id, target_chat) VALUES (?, ?)'
    ).run(tgUserId, TARGET_CHAT);
  } catch (e) {}
}

// Mark user as member (called from chat_member listener).
function markJoined(tgUserId) {
  try {
    const rawDb = db.getDb();
    rawDb.prepare(
      "INSERT INTO chat_join_nudges (tg_user_id, target_chat, is_member, member_status, joined_at, last_check_at, last_check_ok) " +
      "VALUES (?, ?, 1, 'member', datetime('now'), datetime('now'), 1) " +
      "ON CONFLICT(tg_user_id) DO UPDATE SET is_member = 1, member_status = 'member', " +
      "joined_at = COALESCE(joined_at, datetime('now')), last_check_at = datetime('now'), last_check_ok = 1, left_at = NULL"
    ).run(tgUserId, TARGET_CHAT);
  } catch (e) {}
}
function markLeft(tgUserId) {
  try {
    const rawDb = db.getDb();
    rawDb.prepare(
      "UPDATE chat_join_nudges SET is_member = 0, member_status = 'left', left_at = datetime('now'), last_check_at = datetime('now'), last_check_ok = 1 WHERE tg_user_id = ?"
    ).run(tgUserId);
  } catch (e) {}
}

function setupChatNudge(bot) {
  ensureSchema();

  // Track every user that talks to bot in private — they're nudge-candidates
  bot.use(async (ctx, next) => {
    try {
      if (ctx.chat?.type === 'private' && ctx.from?.id > 0) {
        rememberUser(ctx.from.id);
      }
    } catch (e) {}
    return next();
  });

  // Listen for chat_member events on the target chat
  bot.on('chat_member', async (ctx) => {
    try {
      const chat = ctx.chat;
      const isTarget = chat?.username === String(TARGET_CHAT).replace(/^@/, '') ||
                       String(chat?.id) === String(process.env.TRENDEX_GROUP_CHAT_ID || '');
      if (!isTarget) return;
      const upd = ctx.chatMember || ctx.update?.chat_member;
      if (!upd) return;
      const subj = upd.new_chat_member?.user;
      if (!subj || subj.is_bot) return;
      const newStatus = upd.new_chat_member?.status;
      if (['member', 'administrator', 'creator', 'restricted'].includes(newStatus)) {
        markJoined(subj.id);
        // Welcome message in private (if user opened bot)
        try {
          await ctx.api.sendMessage(subj.id,
            '🎉 <b>Спасибо что присоединился к ' + TARGET_CHAT + '!</b>\n\nБольше не буду звать туда — теперь видимся в общем чате.\n\nА в личке остаюсь — твой персональный AI-секретарь.',
            { parse_mode: 'HTML' });
        } catch (e) {}
      } else if (['left', 'kicked'].includes(newStatus)) {
        markLeft(subj.id);
      }
    } catch (e) {}
  });

  // /chat_status — пользователь сам может проверить статус
  bot.command('chat_status', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const status = await checkUserInChat(bot, ctx.from.id);
    if (status === 'member' || status === 'administrator' || status === 'creator') {
      await ctx.reply('✅ Ты в чате ' + TARGET_CHAT + ' — статус: <b>' + status + '</b>', { parse_mode: 'HTML' });
    } else {
      const kb = new InlineKeyboard().url('🚀 Присоединиться', TARGET_CHAT_URL);
      await ctx.reply('❌ Ты пока НЕ в чате ' + TARGET_CHAT + '. Присоединяйся!', { parse_mode: 'HTML', reply_markup: kb });
    }
  });

  console.log('[chat-nudge] ready · target=' + TARGET_CHAT);
}

async function checkUserInChat(bot, tgUserId) {
  try {
    const m = await bot.api.getChatMember(TARGET_CHAT, tgUserId);
    const status = m?.status || 'left';
    const rawDb = db.getDb();
    rawDb.prepare(
      "INSERT OR IGNORE INTO chat_join_nudges (tg_user_id, target_chat) VALUES (?, ?)"
    ).run(tgUserId, TARGET_CHAT);
    rawDb.prepare(
      "UPDATE chat_join_nudges SET member_status = ?, is_member = ?, last_check_at = datetime('now'), last_check_ok = 1 WHERE tg_user_id = ?"
    ).run(status, ['member','administrator','creator','restricted'].includes(status) ? 1 : 0, tgUserId);
    return status;
  } catch (e) {
    // user_not_participant or rate limit — log
    try {
      const rawDb = db.getDb();
      rawDb.prepare(
        "UPDATE chat_join_nudges SET last_check_at = datetime('now'), last_check_ok = 0, member_status = 'unknown' WHERE tg_user_id = ?"
      ).run(tgUserId);
    } catch {}
    return 'left';
  }
}

function nextStepIndex(nudgesSent) {
  if (nudgesSent < NUDGE_STEPS.length) return nudgesSent;
  return -1; // beyond steps → repeat mode
}

function shouldSendNudge(row) {
  if (row.is_member) return false;
  const sent = row.nudges_sent || 0;
  const idx = nextStepIndex(sent);
  // Time since last nudge OR since first_seen (for first nudge)
  const lastTs = row.last_nudge_at ? new Date(row.last_nudge_at).getTime() : new Date(row.first_seen_at).getTime();
  const elapsedHours = (Date.now() - lastTs) / 3600_000;
  if (idx === -1) {
    return elapsedHours >= NUDGE_REPEAT_DAYS * 24;
  }
  // For first nudge — measure from first_seen
  if (sent === 0) {
    const sinceFirst = (Date.now() - new Date(row.first_seen_at).getTime()) / 3600_000;
    return sinceFirst >= NUDGE_STEPS[0].hoursAfter;
  }
  return elapsedHours >= NUDGE_STEPS[idx].hoursAfter;
}

async function processNudgeBatch(bot) {
  const rawDb = db.getDb();
  // Pick candidates: not member, alive (last_check_ok or recent), check stale ≥ 4h
  const candidates = rawDb.prepare(`
    SELECT * FROM chat_join_nudges
    WHERE is_member = 0
      AND blocked_bot = 0
      AND tg_user_id > 0
      AND (last_check_at IS NULL OR last_check_at < datetime('now','-4 hours'))
    ORDER BY COALESCE(last_check_at, '0') ASC
    LIMIT 30
  `).all();

  for (const row of candidates) {
    // Step 1: check current status via TG API
    const status = await checkUserInChat(bot, row.tg_user_id);
    if (['member','administrator','creator','restricted'].includes(status)) {
      // joined since last check — congratulate + stop
      try {
        if ((row.nudges_sent || 0) > 0) {
          await bot.api.sendMessage(row.tg_user_id,
            '🎉 Заметил что ты в чате ' + TARGET_CHAT + ' — спасибо! Больше звать не буду.',
            { parse_mode: 'HTML' });
        }
      } catch (e) {}
      markJoined(row.tg_user_id);
      continue;
    }

    // Step 2: check if it's time to nudge
    const fresh = rawDb.prepare('SELECT * FROM chat_join_nudges WHERE tg_user_id = ?').get(row.tg_user_id);
    if (!fresh || !shouldSendNudge(fresh)) continue;

    const stepNum = (fresh.nudges_sent || 0) + 1;
    const text = (NUDGE_TEXTS[stepNum] || NUDGE_TEXTS.default)();
    const kb = new InlineKeyboard().url('🚀 Войти в чат', TARGET_CHAT_URL);

    try {
      await bot.api.sendMessage(row.tg_user_id, text, { parse_mode: 'HTML', reply_markup: kb });
      rawDb.prepare(
        "UPDATE chat_join_nudges SET nudges_sent = nudges_sent + 1, last_nudge_at = datetime('now') WHERE tg_user_id = ?"
      ).run(row.tg_user_id);
    } catch (e) {
      // 403: bot was blocked by user → mark and skip forever
      if (String(e.message || '').includes('blocked') || String(e.message || '').includes('403')) {
        rawDb.prepare('UPDATE chat_join_nudges SET blocked_bot = 1 WHERE tg_user_id = ?').run(row.tg_user_id);
      }
    }
    // small delay to avoid TG rate limit
    await new Promise(r => setTimeout(r, 200));
  }
}

function startChatNudgeCron(bot) {
  // Run every 30 min
  setInterval(async () => {
    try { await processNudgeBatch(bot); } catch (e) { console.error('[chat-nudge cron]', e.message); }
  }, 30 * 60_000);
  // First run after 60s startup
  setTimeout(() => processNudgeBatch(bot).catch(() => {}), 60_000);
  console.log('[chat-nudge] cron started — every 30 min, batch 30 users');
}

module.exports = { setupChatNudge, startChatNudgeCron, checkUserInChat };
