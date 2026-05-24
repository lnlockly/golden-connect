// Trendex personal planner extras (private chat only):
//   /focus 25       — Pomodoro / focus timer
//   /goals          — set & track personal goals
//   /journal text   — quick personal note (text or voice via existing handler)
//   /journal_list   — show last journal entries
//   /journal_search — search journal
//   Plus: 9:00 morning digest + 21:00 evening digest (cron)

const { InlineKeyboard } = require('grammy');

function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function(c) { return ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]; }); }
const { getBalance } = require('../services/balance-bridge');
const db = require('../planner/db/database');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtUsd(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }
function pad(n) { return String(n).padStart(2, '0'); }

function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS personal_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_value INTEGER,
      current_value INTEGER DEFAULT 0,
      deadline DATE,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      done_at DATETIME
    );
    CREATE INDEX IF NOT EXISTS idx_pg_user ON personal_goals(user_id, status);

    CREATE TABLE IF NOT EXISTS personal_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_pj_user ON personal_journal(user_id, id);

    CREATE TABLE IF NOT EXISTS personal_focus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      tg_chat_id INTEGER NOT NULL,
      duration_min INTEGER NOT NULL,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ends_at DATETIME NOT NULL,
      completed INTEGER DEFAULT 0,
      task_text TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pf_pending ON personal_focus(completed, ends_at);

    CREATE TABLE IF NOT EXISTS personal_digest_log (
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      sent_at DATETIME NOT NULL,
      PRIMARY KEY (user_id, kind, sent_at)
    );
  `);
}

function setupPersonalPlanner(bot) {
  ensureSchema();

  // ── /focus 25 — pomodoro timer ──
  bot.command(['focus', 'pomodoro'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return ctx.reply('💡 /focus работает только в личке.');
    const arg = (ctx.match || '').trim();
    let mins = parseInt(arg, 10);
    let label = '';
    if (!Number.isFinite(mins) || mins < 1 || mins > 180) {
      mins = 25; label = arg || '';
    } else {
      // Try to extract label after the number
      label = arg.replace(/^\d+\s*/, '').trim();
    }
    const u = db.ensureUser(ctx.from);
    const ends = new Date(Date.now() + mins * 60_000);
    const rawDb = db.getDb();
    rawDb.prepare(
      'INSERT INTO personal_focus (user_id, tg_chat_id, duration_min, ends_at, task_text) VALUES (?, ?, ?, ?, ?)'
    ).run(u.id, ctx.chat.id, mins, ends.toISOString(), label || null);
    await ctx.reply(
      `🍅 <b>Focus mode: ${mins} мин</b>${label ? '\n<i>' + escapeHtml(label) + '</i>' : ''}\n\n` +
      `⏰ Закончу в ${pad(ends.getHours())}:${pad(ends.getMinutes())}\n` +
      `🚫 На время фокуса — никаких уведомлений.\n\n` +
      `<i>Команды: /focus_done — завершить раньше</i>`,
      { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('⏹ Завершить', 'focus_stop') }
    );
  });

  bot.command('focus_done', stopFocus);
  bot.callbackQuery('focus_stop', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch {}
    return stopFocus(ctx);
  });

  async function stopFocus(ctx) {
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const cur = rawDb.prepare(
      "SELECT * FROM personal_focus WHERE user_id = ? AND completed = 0 ORDER BY id DESC LIMIT 1"
    ).get(u.id);
    if (!cur) return ctx.reply('🍅 Активного фокуса нет. Запусти: /focus 25');
    rawDb.prepare("UPDATE personal_focus SET completed = 1 WHERE id = ?").run(cur.id);
    const elapsed = Math.round((Date.now() - new Date(cur.started_at).getTime()) / 60_000);
    return ctx.reply(`✅ Фокус-сессия завершена.\nРеально провёл: <b>${elapsed} мин</b> из ${cur.duration_min}.`, { parse_mode: 'HTML' });
  }

  // ── /goals — список целей + добавить ──
  bot.command('goals', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const goals = rawDb.prepare(
      "SELECT * FROM personal_goals WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 10"
    ).all(u.id);
    const lines = ['🎯 <b>Мои цели</b>', ''];
    if (!goals.length) {
      lines.push('<i>Целей пока нет. Добавь первую — это удерживает фокус и даёт дофамин.</i>');
      lines.push('');
      lines.push('Формат: <code>/goal_add Заработать $100|100|2026-05-30</code>');
      lines.push('Где: <i>название | целевое число (опц) | дедлайн (опц)</i>');
    } else {
      goals.forEach(g => {
        const pct = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : 0;
        const bar = g.target_value
          ? '█'.repeat(Math.min(10, Math.floor(pct / 10))) + '░'.repeat(Math.max(0, 10 - Math.floor(pct / 10)))
          : '';
        lines.push(`<b>#${g.id} ${escapeHtml(g.title)}</b>`);
        if (g.target_value) lines.push(`   ${bar} ${g.current_value}/${g.target_value} (${pct}%)`);
        if (g.deadline) lines.push(`   📅 до ${g.deadline}`);
        lines.push('');
      });
      lines.push('Добавить: /goal_add название|target|deadline');
      lines.push('Прогресс: /goal_progress ID +N (например /goal_progress 5 +20)');
      lines.push('Завершить: /goal_done ID');
    }
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('goal_add', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const txt = (ctx.match || '').trim();
    if (!txt) return ctx.reply('Формат: /goal_add Заработать $100|100|2026-05-30');
    const parts = txt.split('|').map(s => s.trim());
    const title = parts[0];
    if (!title || title.length < 3) return ctx.reply('Название слишком короткое.');
    const target = parts[1] ? parseInt(parts[1], 10) : null;
    const deadline = parts[2] || null;
    const rawDb = db.getDb();
    const r = rawDb.prepare(
      'INSERT INTO personal_goals (user_id, title, target_value, deadline) VALUES (?, ?, ?, ?)'
    ).run(u.id, title.slice(0, 200), Number.isFinite(target) ? target : null, deadline);
    await ctx.reply(`✅ Цель #${r.lastInsertRowid} добавлена. Проверь: /goals`);
  });

  bot.command('goal_progress', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const txt = (ctx.match || '').trim();
    const m = txt.match(/^(\d+)\s+([+-]?\d+)/);
    if (!m) return ctx.reply('Формат: /goal_progress ID +N (например +20)');
    const goalId = parseInt(m[1], 10);
    const delta = parseInt(m[2], 10);
    const rawDb = db.getDb();
    const g = rawDb.prepare('SELECT * FROM personal_goals WHERE id = ? AND user_id = ?').get(goalId, u.id);
    if (!g) return ctx.reply('Цель не найдена.');
    const newVal = (g.current_value || 0) + delta;
    rawDb.prepare('UPDATE personal_goals SET current_value = ? WHERE id = ?').run(newVal, goalId);
    let msg = `✅ Цель «${escapeHtml(g.title)}»: ${newVal}` + (g.target_value ? ` / ${g.target_value}` : '');
    if (g.target_value && newVal >= g.target_value) {
      rawDb.prepare("UPDATE personal_goals SET status = 'done', done_at = datetime('now') WHERE id = ?").run(goalId);
      msg += '\n\n🎉 <b>ЦЕЛЬ ДОСТИГНУТА!</b> Поздравляю!';
    }
    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  bot.command('goal_done', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const id = parseInt((ctx.match || '').trim(), 10);
    if (!id) return ctx.reply('Формат: /goal_done <ID>');
    const rawDb = db.getDb();
    rawDb.prepare("UPDATE personal_goals SET status = 'done', done_at = datetime('now') WHERE id = ? AND user_id = ?").run(id, u.id);
    await ctx.reply(`✅ Цель #${id} завершена.`);
  });

  // ── /journal text — quick note ──
  bot.command('journal', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const txt = (ctx.match || '').trim();
    if (!txt) {
      // show last 5
      const rawDb = db.getDb();
      const rows = rawDb.prepare(
        'SELECT id, text, created_at FROM personal_journal WHERE user_id = ? ORDER BY id DESC LIMIT 5'
      ).all(u.id);
      if (!rows.length) return ctx.reply('📓 Журнал пуст. Добавь первую заметку: /journal твоя мысль');
      const lines = ['📓 <b>Последние записи журнала:</b>', ''];
      rows.forEach(r => {
        lines.push(`<b>#${r.id}</b> · ${r.created_at}`);
        lines.push(escapeHtml(r.text.slice(0, 250)));
        lines.push('');
      });
      lines.push('Поиск: /journal_search слово · Все: /journal_list');
      return ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    }
    const rawDb = db.getDb();
    const r = rawDb.prepare(
      'INSERT INTO personal_journal (user_id, text) VALUES (?, ?)'
    ).run(u.id, txt.slice(0, 5000));
    await ctx.reply(`📓 Запись #${r.lastInsertRowid} сохранена.`);
  });

  bot.command('journal_search', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const q = (ctx.match || '').trim();
    if (!q) return ctx.reply('Формат: /journal_search слово');
    const rawDb = db.getDb();
    const rows = rawDb.prepare(
      "SELECT id, text, created_at FROM personal_journal WHERE user_id = ? AND text LIKE ? ORDER BY id DESC LIMIT 20"
    ).all(u.id, '%' + q + '%');
    if (!rows.length) return ctx.reply('🔍 Не найдено.');
    const lines = [`🔍 <b>Найдено ${rows.length}:</b>`, ''];
    rows.forEach(r => {
      lines.push(`<b>#${r.id}</b> · ${r.created_at}`);
      lines.push(escapeHtml(r.text.slice(0, 250)));
      lines.push('');
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('journal_list', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const rows = rawDb.prepare(
      'SELECT id, text, created_at FROM personal_journal WHERE user_id = ? ORDER BY id DESC LIMIT 30'
    ).all(u.id);
    if (!rows.length) return ctx.reply('📓 Журнал пуст.');
    const lines = ['📓 <b>Последние 30 записей:</b>', ''];
    rows.forEach(r => {
      lines.push(`<b>#${r.id}</b> · ${r.created_at}`);
      lines.push(escapeHtml(r.text.slice(0, 150)));
      lines.push('');
    });
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  console.log('[personal-planner] /focus /goals /journal ready');
}

// ── Cron: Daily digests (9:00 morning, 21:00 evening MSK) ──
function startDailyDigestsCron(bot, storage) {
  let lastMorning = '';
  let lastEvening = '';
  setInterval(async () => {
    try {
      const now = new Date();
      const mskOffset = 3 * 60; // MSK = UTC+3
      const local = new Date(now.getTime() + mskOffset * 60_000);
      const hour = local.getUTCHours();
      const min = local.getUTCMinutes();
      const dayKey = local.toISOString().slice(0, 10);

      // 9:00 MSK morning digest
      if (hour === 9 && min < 5 && lastMorning !== dayKey) {
        lastMorning = dayKey;
        await sendMorningDigest(bot, storage);
      }
      // 21:00 MSK evening digest
      if (hour === 21 && min < 5 && lastEvening !== dayKey) {
        lastEvening = dayKey;
        await sendEveningDigest(bot, storage);
      }
    } catch (e) { console.error('[daily-digests cron]', e && e.message); }
  }, 60_000); // check every minute
  console.log('[personal-planner] daily digests cron started (9:00 + 21:00 MSK)');
}

async function sendMorningDigest(bot, storage) {
  const rawDb = db.getDb();
  // Active users with TG id, who logged in within last 14 days
  const users = rawDb.prepare(
    "SELECT id, tg_id, tg_first_name FROM users WHERE tg_id > 0 AND last_seen_at IS NOT NULL AND last_seen_at >= datetime('now','-14 days')"
  ).all();
  console.log('[morning digest]', users.length, 'users');
  for (const u of users) {
    try {
      // Get pending tasks count for today
      const today = new Date().toISOString().slice(0, 10);
      const tasksToday = rawDb.prepare(
        "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status != 'done' AND due_date = ?"
      ).get(u.id, today)?.n || 0;
      // Phase H: balances from api Postgres
      const _bal = await getBalance({ tgId: u.tg_id });
      const earned = { earned_balance_cents: _bal.working_cents, gift_balance_cents: _bal.gift_cents };

      const tipText = pickRandomTip(u);
      const lines = [
        `☀️ <b>Доброе утро, ${u.tg_first_name || 'партнёр'}!</b>`,
        '',
      ];
      if (tasksToday > 0) lines.push(`📋 На сегодня в планировщике: <b>${tasksToday}</b> задач`);
      lines.push(`💰 Earned: <b>${fmtUsd(earned.earned_balance_cents)}</b>  ·  🎁 Gift: <b>${fmtUsd(earned.gift_balance_cents)}</b>`);
      lines.push('');

      // Phase R.2: get today's AI plan (top-3 tasks) + inline-button to add each
      let dpKb = null;
      try {
        const today = new Date().toISOString().slice(0, 10);
        const cached = rawDb.prepare('SELECT plan_json FROM daily_plans WHERE user_id=? AND day=?').get(u.id, today);
        let plan = null;
        if (cached) { try { plan = JSON.parse(cached.plan_json); } catch (_) {} }
        if (!plan) {
          const { generateDailyPlan } = require('../services/daily-plan');
          // No web profile here — pass minimal context (planner DB has limited info)
          plan = await generateDailyPlan({ profile: {}, answers: {}, day: today });
          try { rawDb.prepare('CREATE TABLE IF NOT EXISTS daily_plans (user_id INTEGER NOT NULL, day TEXT NOT NULL, plan_json TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (user_id, day))').run(); } catch (_) {}
          rawDb.prepare('INSERT OR REPLACE INTO daily_plans (user_id, day, plan_json) VALUES (?, ?, ?)')
            .run(u.id, today, JSON.stringify(plan));
        }
        if (plan && plan.length) {
          lines.push('📅 <b>Твой план на сегодня:</b>');
          plan.slice(0, 5).forEach(function(t, i) {
            const prio = t.priority === 1 ? '🔴' : t.priority === 2 ? '🟡' : '⚪';
            const sug = t.suggested_time ? ' · ⏰' + t.suggested_time : '';
            lines.push(`${i + 1}. ${prio} <b>${esc(t.title)}</b> · ${t.time_min}мин${sug}`);
          });
          lines.push('');
          // Build inline keyboard — "✅ В планировщик" button per task (5 buttons in 2 rows)
          const { InlineKeyboard } = require('grammy');
          dpKb = new InlineKeyboard();
          plan.slice(0, 5).forEach(function(t, i) {
            dpKb.text(`✅ #${i + 1}`, `dp_add:${today}:${i}`);
            if (i % 2 === 1 || i === plan.length - 1) dpKb.row();
          });
          dpKb.text('↻ Новый план', `dp_refresh:${today}`).row()
              .text('🌐 Открыть в кабинете', 'xh_cabinet');
        }
      } catch (e) { console.warn('[morning digest] daily plan failed', e && e.message); }

      lines.push(`💡 <b>Совет на сегодня:</b>\n${tipText}`);
      lines.push('');
      lines.push('Хорошего дня! /today  ·  /jobs  ·  /promo');

      await bot.api.sendMessage(u.tg_id, lines.join('\n'), { parse_mode: 'HTML', reply_markup: dpKb || undefined });
    } catch (e) { /* user blocked bot */ }
  }
}

async function sendEveningDigest(bot, storage) {
  const rawDb = db.getDb();
  const users = rawDb.prepare(
    "SELECT id, tg_id, tg_first_name FROM users WHERE tg_id > 0 AND last_seen_at IS NOT NULL AND last_seen_at >= datetime('now','-14 days')"
  ).all();
  console.log('[evening digest]', users.length, 'users');
  for (const u of users) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const doneToday = rawDb.prepare(
        "SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND date(updated_at) = ?"
      ).get(u.id, today)?.n || 0;
      const earnedToday = rawDb.prepare(
        "SELECT COALESCE(SUM(CASE WHEN kind = 'reward' THEN amount_cents ELSE 0 END), 0) AS s FROM ad_transactions WHERE user_id = ? AND date(created_at) = ?"
      ).get(u.id, today)?.s || 0;
      const tasksDoneAd = rawDb.prepare(
        "SELECT COUNT(DISTINCT claim_id) AS n FROM ad_transactions WHERE user_id = ? AND kind = 'reward' AND date(created_at) = ?"
      ).get(u.id, today)?.n || 0;

      // Only send if there's any activity to report
      if (!doneToday && !earnedToday && !tasksDoneAd) continue;

      const lines = [
        `🌙 <b>Итог дня</b>`,
        '',
      ];
      if (doneToday) lines.push(`✅ Задач выполнено: <b>${doneToday}</b>`);
      if (tasksDoneAd) lines.push(`💼 Заданий на бирже: <b>${tasksDoneAd}</b>`);
      if (earnedToday) lines.push(`💵 Заработано сегодня: <b>${fmtUsd(earnedToday)}</b>`);
      lines.push('');
      lines.push('Подробнее: /results · Завтра жди утренний digest 🌅');

      await bot.api.sendMessage(u.tg_id, lines.join('\n'), { parse_mode: 'HTML' });
    } catch (e) { /* user blocked bot */ }
  }
}

const TIPS = [
  'Возьми хотя бы 3 задания на бирже — займёт 5 минут, принесёт ~$0.20-0.50.',
  'Поделись реф-ссылкой в одном чате/канале, где ты состоишь. 1-2 регистрации = большой шаг.',
  'Создай мини-кампанию подписки на свой канал ($5 = ~50-100 подписчиков).',
  'Зайди в /team и напиши тем кто завис на стадии «онбординг» — приветливое сообщение возвращает 30%.',
  'Загляни в /aitools — там готовые посты, баннеры и видео-генератор.',
  'Открой /tariffs — без активации матрица не приносит, а партнёры под тобой её ждут.',
  'Пройди /missions — 7 дней по 5 минут = базовая прокачка партнёра.',
  'Проверь /balance — если ≥ $3, можно подать заявку на вывод.',
  'Загляни на /events — следующий эфир собирает «холодных» рефералов в одном месте.',
  '/promo → /aipost → готовый пост с твоей ссылкой за 10 секунд.',
];
function pickRandomTip(u) {
  return TIPS[Math.floor(Math.random() * TIPS.length)];
}

module.exports = { setupPersonalPlanner, startDailyDigestsCron };
