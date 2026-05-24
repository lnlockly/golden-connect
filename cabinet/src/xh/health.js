// Trendex: Health course planner.
// Commands: /health, /courses, /addcourse, /protocols, /checkin, /symptoms
// Reply button: 💊 Здоровье
// Callbacks: xh_health, hc_today, hc_courses, hc_add, hc_protocols,
//            hc_take:<id>, hc_skip:<id>, hc_snooze:<id>,
//            hc_protocol:<id>, hc_protocol_start:<id>,
//            hc_card:<id>, hc_pause:<id>, hc_finish:<id>,
//            hc_checkin, hc_metric:<field>:<val>

const { InlineKeyboard } = require('grammy');
const db = require('../planner/db/database');
const { PRODUCTS, PROTOCOLS, GOAL_LABELS, getProduct, getProtocol, listProducts, listProtocols } = require('./health-protocols');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trunc(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso, days) {
  const d = new Date(dateIso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Get planner user (from SQLite) by Telegram ctx
function getPlannerUser(ctx) {
  if (!ctx.from) return null;
  try {
    return db.ensureUser(ctx.from);
  } catch (e) {
    console.error('[health_get_planner_user]', e && e.message);
    return null;
  }
}

function progressBar(value, total, length = 20) {
  if (!total) return '░'.repeat(length) + ' 0%';
  const pct = Math.min(100, Math.round((value / total) * 100));
  const filled = Math.round((pct / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled) + ` ${pct}%`;
}

// Get today's pending log entries for user
function getTodayLogEntries(userId) {
  const today = todayIso();
  return db.getDb().prepare(`
    SELECT l.*, c.product_name, c.product_emoji, c.dose, c.goal
    FROM health_course_log l
    JOIN health_courses c ON l.course_id = c.id
    WHERE l.user_id = ? AND l.scheduled_date = ?
    ORDER BY l.scheduled_time
  `).all(userId, today);
}

function getActiveCourses(userId) {
  return db.getDb().prepare(`
    SELECT * FROM health_courses
    WHERE user_id = ? AND status = 'active'
    ORDER BY created_at DESC
  `).all(userId);
}

function getCourseProgress(courseId) {
  const total = db.getDb().prepare('SELECT COUNT(*) as c FROM health_course_log WHERE course_id = ?').get(courseId).c;
  const taken = db.getDb().prepare("SELECT COUNT(*) as c FROM health_course_log WHERE course_id = ? AND status = 'taken'").get(courseId).c;
  const skipped = db.getDb().prepare("SELECT COUNT(*) as c FROM health_course_log WHERE course_id = ? AND status = 'skipped'").get(courseId).c;
  return { total, taken, skipped, pct: total ? Math.round((taken / total) * 100) : 0 };
}

function getStreak(userId) {
  // Consecutive days where ALL scheduled doses were taken
  const rows = db.getDb().prepare(`
    SELECT scheduled_date,
           SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
           COUNT(*) as total
    FROM health_course_log
    WHERE user_id = ?
    GROUP BY scheduled_date
    ORDER BY scheduled_date DESC
    LIMIT 60
  `).all(userId);
  let streak = 0;
  for (const r of rows) {
    if (r.taken === r.total && r.total > 0) streak += 1;
    else break;
  }
  return streak;
}

// Generate log entries for a course on a given date based on schedule
function generateLogEntriesForDate(courseId, dateIso) {
  const course = db.getDb().prepare('SELECT * FROM health_courses WHERE id = ?').get(courseId);
  if (!course) return 0;
  let schedule;
  try { schedule = JSON.parse(course.schedule_json || '["08:00"]'); }
  catch (e) { schedule = ['08:00']; }
  if (!Array.isArray(schedule)) schedule = ['08:00'];

  const stmt = db.getDb().prepare(`
    INSERT OR IGNORE INTO health_course_log (course_id, user_id, scheduled_date, scheduled_time, dose, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `);
  let created = 0;
  for (const time of schedule) {
    const r = stmt.run(course.id, course.user_id, dateIso, time, course.dose || '');
    if (r.changes > 0) created += 1;
  }
  return created;
}

// Generate log entries for ALL active courses for today
function generateTodayForUser(userId) {
  const today = todayIso();
  const courses = getActiveCourses(userId);
  let total = 0;
  for (const c of courses) {
    total += generateLogEntriesForDate(c.id, today);
  }
  return total;
}

// ─────────────────────────────────────────────
// Bot commands and menu
// ─────────────────────────────────────────────

async function sendHealthMain(ctx) {
  const user = getPlannerUser(ctx);
  if (!user) return ctx.reply('Не удалось получить ваш профиль.');
  // Generate today's entries if missing
  generateTodayForUser(user.id);

  const todayEntries = getTodayLogEntries(user.id);
  const courses = getActiveCourses(user.id);
  const streak = getStreak(user.id);

  const lines = ['💊 <b>Мой курс здоровья Trendex</b>', ''];

  if (todayEntries.length > 0) {
    lines.push(`📅 <b>Сегодня (${todayEntries.length} приёмов):</b>`);
    for (const e of todayEntries) {
      const icon = e.status === 'taken' ? '✅' : (e.status === 'skipped' ? '❌' : '⏳');
      lines.push(`${icon} ${e.scheduled_time} ${e.product_emoji || '💊'} ${escapeHtml(e.product_name)} · ${escapeHtml(e.dose || '')}`);
    }
    lines.push('');
  }

  if (courses.length > 0) {
    lines.push(`📊 <b>Активные курсы (${courses.length}):</b>`);
    for (const c of courses) {
      const p = getCourseProgress(c.id);
      const dayNum = Math.floor((Date.now() - Date.parse(c.start_date)) / 86400000) + 1;
      lines.push(`${c.product_emoji || '💊'} ${escapeHtml(c.product_name)} · день ${dayNum}/${c.duration_days} · ${p.pct}%`);
    }
    lines.push('');
  } else {
    lines.push('У вас пока нет активных курсов.');
    lines.push('');
    lines.push('Начните с готового протокола или добавьте отдельный продукт.');
    lines.push('');
  }

  if (streak > 0) {
    lines.push(`🔥 <b>Стрик: ${streak} ${streak === 1 ? 'день' : 'дн.'} без пропусков</b>`);
    lines.push('');
  }

  const kb = new InlineKeyboard();
  if (todayEntries.length > 0) {
    // Quick actions for first 3 pending
    const pending = todayEntries.filter(e => e.status === 'pending').slice(0, 3);
    pending.forEach(e => {
      kb.text(`✅ Принял ${e.scheduled_time} ${trunc(e.product_name, 20)}`, `hc_take:${e.id}`).row();
    });
  }
  kb.text('🎯 Готовые протоколы', 'hc_protocols').row();
  kb.text('➕ Добавить курс', 'hc_add').text('📊 Все курсы', 'hc_courses').row();
  kb.text('🌡 Чек-ин', 'hc_checkin').text('💡 AI совет', 'hc_ai').row();

  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); return; }
    catch (e) {}
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendProtocolsList(ctx) {
  const protocols = listProtocols();
  const lines = ['🎯 <b>Готовые протоколы Trendex</b>', '', 'Выберите цель — и я создам комплексный курс из 2-3 продуктов.', ''];
  for (const p of protocols) {
    const productsList = p.products.map(slug => {
      const prod = getProduct(slug);
      return prod ? prod.name : slug;
    }).join(' + ');
    lines.push(`${p.emoji} <b>${escapeHtml(p.title)}</b> (${p.duration} дней)`);
    lines.push(`   ${escapeHtml(productsList)}`);
    lines.push('');
  }
  const kb = new InlineKeyboard();
  for (const p of protocols) {
    kb.text(`${p.emoji} ${p.title}`, `hc_protocol:${p.id}`).row();
  }
  kb.text('← Назад', 'xh_health');
  if (ctx.callbackQuery) {
    try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); return; }
    catch (e) {}
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendProtocolDetails(ctx, protocolId) {
  const proto = getProtocol(protocolId);
  if (!proto) return ctx.reply('Протокол не найден.');
  const lines = [
    `${proto.emoji} <b>Протокол "${escapeHtml(proto.title)}"</b>`,
    '',
    escapeHtml(proto.description),
    '',
    `📅 Длительность: <b>${proto.duration} дней</b>`,
    '',
    '<b>Состав:</b>',
  ];
  for (const slug of proto.products) {
    const p = getProduct(slug);
    if (!p) continue;
    lines.push(`${p.emoji} <b>${escapeHtml(p.name)}</b> · ${escapeHtml(p.defaultDose)}`);
    lines.push(`   ⏰ ${p.defaultSchedule.join(', ')}`);
    lines.push(`   <i>${escapeHtml(p.description)}</i>`);
    lines.push('');
  }
  lines.push('<i>Можно отредактировать каждый продукт после запуска.</i>');
  const kb = new InlineKeyboard()
    .text(`✅ Запустить протокол`, `hc_protocol_start:${protocolId}`).row()
    .text('← К протоколам', 'hc_protocols');
  try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
  catch (e) { await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
}

function startProtocol(userId, protocolId) {
  const proto = getProtocol(protocolId);
  if (!proto) return null;
  const startDate = todayIso();
  const endDate = addDays(startDate, proto.duration);
  const created = [];
  for (const slug of proto.products) {
    const p = getProduct(slug);
    if (!p) continue;
    const stmt = db.getDb().prepare(`
      INSERT INTO health_courses (user_id, product_slug, product_name, product_emoji, goal, dose, schedule_json, start_date, end_date, duration_days, status, protocol_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);
    const result = stmt.run(
      userId, p.slug, p.name, p.emoji, protocolId, p.defaultDose,
      JSON.stringify(p.defaultSchedule), startDate, endDate, proto.duration, protocolId
    );
    created.push({ id: result.lastInsertRowid, name: p.name });
    // Generate today's entries immediately
    generateLogEntriesForDate(result.lastInsertRowid, startDate);
  }
  return created;
}

async function sendProductCatalog(ctx) {
  const products = listProducts();
  const lines = ['💊 <b>Каталог продуктов Trendex</b>', '', 'Выберите продукт для добавления в курс:', ''];
  const kb = new InlineKeyboard();
  for (const p of products) {
    kb.text(`${p.emoji} ${p.name}`, `hc_addproduct:${p.slug}`).row();
  }
  kb.text('← Назад', 'xh_health');
  try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
  catch (e) { await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
}

async function sendProductDetails(ctx, slug) {
  const p = getProduct(slug);
  if (!p) return ctx.reply('Продукт не найден.');
  const goalsLine = (p.goals || []).map(g => GOAL_LABELS[g] && GOAL_LABELS[g].emoji + ' ' + GOAL_LABELS[g].title).filter(Boolean).join(', ');
  const lines = [
    `${p.emoji} <b>${escapeHtml(p.name)}</b>`,
    '',
    escapeHtml(p.description),
    '',
    `🎯 Цели: ${escapeHtml(goalsLine || '—')}`,
    `💊 Доза: ${escapeHtml(p.defaultDose)}`,
    `⏰ Расписание: ${p.defaultSchedule.join(', ')}`,
    `📅 Длительность: ${p.defaultDuration} дней`,
    '',
    `📋 <i>${escapeHtml(p.recommendations)}</i>`,
  ];
  if (p.contraindications && p.contraindications !== '—') {
    lines.push('');
    lines.push(`⚠️ Противопоказания: ${escapeHtml(p.contraindications)}`);
  }
  const kb = new InlineKeyboard()
    .text(`✅ Добавить курс`, `hc_addproduct_start:${slug}`).row()
    .text('← К каталогу', 'hc_add');
  try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
  catch (e) { await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
}

function addCourseFromProduct(userId, slug) {
  const p = getProduct(slug);
  if (!p) return null;
  const startDate = todayIso();
  const endDate = addDays(startDate, p.defaultDuration);
  const stmt = db.getDb().prepare(`
    INSERT INTO health_courses (user_id, product_slug, product_name, product_emoji, dose, schedule_json, start_date, end_date, duration_days, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  const result = stmt.run(
    userId, p.slug, p.name, p.emoji, p.defaultDose,
    JSON.stringify(p.defaultSchedule), startDate, endDate, p.defaultDuration
  );
  generateLogEntriesForDate(result.lastInsertRowid, startDate);
  return { id: result.lastInsertRowid, name: p.name };
}

async function sendCoursesList(ctx) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  const courses = getActiveCourses(user.id);
  if (!courses.length) {
    return ctx.reply('У вас пока нет активных курсов.\n\nДобавьте через /addcourse или выберите готовый протокол.');
  }
  const lines = ['📊 <b>Все активные курсы</b>', ''];
  const kb = new InlineKeyboard();
  for (const c of courses) {
    const p = getCourseProgress(c.id);
    const dayNum = Math.floor((Date.now() - Date.parse(c.start_date)) / 86400000) + 1;
    lines.push(`${c.product_emoji || '💊'} <b>${escapeHtml(c.product_name)}</b>`);
    lines.push(`   День ${dayNum}/${c.duration_days} · ${p.pct}%`);
    lines.push('');
    kb.text(`${c.product_emoji || '💊'} ${trunc(c.product_name, 25)}`, `hc_card:${c.id}`).row();
  }
  kb.text('← Назад', 'xh_health');
  try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
  catch (e) { await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
}

async function sendCourseCard(ctx, courseId) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  const c = db.getDb().prepare('SELECT * FROM health_courses WHERE id = ? AND user_id = ?').get(courseId, user.id);
  if (!c) return ctx.reply('Курс не найден.');
  const p = getCourseProgress(c.id);
  const dayNum = Math.floor((Date.now() - Date.parse(c.start_date)) / 86400000) + 1;
  const streak = getStreak(user.id);
  const recent = db.getDb().prepare(`
    SELECT * FROM health_course_log WHERE course_id = ? ORDER BY scheduled_date DESC, scheduled_time DESC LIMIT 8
  `).all(c.id);
  const lines = [
    `${c.product_emoji || '💊'} <b>${escapeHtml(c.product_name)}</b>`,
    '',
    `📅 Прогресс: <b>${dayNum}/${c.duration_days} дней</b>`,
    `<code>${progressBar(dayNum, c.duration_days)}</code>`,
    '',
    `✅ Приёмов: <b>${p.taken}/${p.total}</b> (${p.pct}%)`,
  ];
  if (p.skipped) lines.push(`❌ Пропусков: ${p.skipped}`);
  lines.push('');
  if (recent.length) {
    lines.push('📜 <b>Последние:</b>');
    recent.slice(0, 6).forEach(r => {
      const icon = r.status === 'taken' ? '✅' : r.status === 'skipped' ? '❌' : '⏳';
      lines.push(`${icon} ${r.scheduled_date} ${r.scheduled_time}`);
    });
  }
  const kb = new InlineKeyboard()
    .text('⏸ Пауза', `hc_pause:${c.id}`)
    .text('📅 Завершить', `hc_finish:${c.id}`).row()
    .text('← К списку', 'hc_courses');
  try { await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
  catch (e) { await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb }); }
}

async function handleTake(ctx, logId) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  const log = db.getDb().prepare('SELECT * FROM health_course_log WHERE id = ? AND user_id = ?').get(logId, user.id);
  if (!log) return ctx.answerCallbackQuery({ text: 'Не найдено', show_alert: true });
  db.getDb().prepare("UPDATE health_course_log SET status = 'taken', taken_at = CURRENT_TIMESTAMP WHERE id = ?").run(logId);
  const streak = getStreak(user.id);
  try { await ctx.answerCallbackQuery({ text: '✅ Молодец! +1 к стрику' }); } catch (e) {}
  // Refresh view
  await sendHealthMain(ctx);
}

async function handleSkip(ctx, logId) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  db.getDb().prepare("UPDATE health_course_log SET status = 'skipped' WHERE id = ? AND user_id = ?").run(logId, user.id);
  try { await ctx.answerCallbackQuery({ text: 'Отмечено как пропущено' }); } catch (e) {}
  await sendHealthMain(ctx);
}

async function handleSnooze(ctx, logId) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  // Snooze: shift scheduled_time by 30 min
  const log = db.getDb().prepare('SELECT * FROM health_course_log WHERE id = ? AND user_id = ?').get(logId, user.id);
  if (!log) return;
  const [h, m] = (log.scheduled_time || '08:00').split(':').map(Number);
  let total = h * 60 + m + 30;
  total = total % (24 * 60);
  const newH = Math.floor(total / 60).toString().padStart(2, '0');
  const newM = (total % 60).toString().padStart(2, '0');
  db.getDb().prepare("UPDATE health_course_log SET scheduled_time = ?, notified_at = NULL WHERE id = ?").run(`${newH}:${newM}`, logId);
  try { await ctx.answerCallbackQuery({ text: '⏰ Перенесено на 30 мин' }); } catch (e) {}
}

async function sendCheckinForm(ctx) {
  const lines = [
    '🌡 <b>Чек-ин самочувствия</b>',
    '',
    'Оцените по 10-балльной шкале каждый параметр.',
    'Нажмите кнопку чтобы поставить оценку.',
    '',
    '😴 <b>Сон:</b>',
  ];
  const kb = new InlineKeyboard();
  for (let i = 1; i <= 10; i++) kb.text(String(i), `hc_metric:sleep:${i}`);
  kb.row().text('Пропустить', 'hc_metric:sleep:0');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function handleMetric(ctx, field, value) {
  const user = getPlannerUser(ctx);
  if (!user) return;
  const val = parseInt(value, 10);
  // Keep state in user profile? Simpler: just save instantly
  const today = todayIso();
  let row = db.getDb().prepare('SELECT * FROM health_metrics WHERE user_id = ? AND date = ?').get(user.id, today);
  if (!row) {
    db.getDb().prepare('INSERT INTO health_metrics (user_id, date, time_of_day) VALUES (?, ?, ?)').run(user.id, today, 'morning');
    row = db.getDb().prepare('SELECT * FROM health_metrics WHERE user_id = ? AND date = ?').get(user.id, today);
  }
  if (val > 0) {
    db.getDb().prepare(`UPDATE health_metrics SET ${field} = ? WHERE id = ?`).run(val, row.id);
  }
  try { await ctx.answerCallbackQuery({ text: `${field}: ${val || 'пропуск'}` }); } catch (e) {}

  // Show next field or finish
  if (field === 'sleep') {
    const kb = new InlineKeyboard();
    for (let i = 1; i <= 10; i++) kb.text(String(i), `hc_metric:energy:${i}`);
    kb.row().text('Пропустить', 'hc_metric:energy:0');
    await ctx.reply('⚡ <b>Энергия:</b>', { parse_mode: 'HTML', reply_markup: kb });
  } else if (field === 'energy') {
    const kb = new InlineKeyboard();
    for (let i = 1; i <= 10; i++) kb.text(String(i), `hc_metric:mood:${i}`);
    kb.row().text('Пропустить', 'hc_metric:mood:0');
    await ctx.reply('😊 <b>Настроение:</b>', { parse_mode: 'HTML', reply_markup: kb });
  } else if (field === 'mood') {
    const kb = new InlineKeyboard().text('🏠 К здоровью', 'xh_health');
    await ctx.reply('✅ <b>Чек-ин записан!</b>\n\nПродолжайте в том же духе — это поможет AI давать точные советы.', {
      parse_mode: 'HTML', reply_markup: kb
    });
  }
}

function setupHealth(bot, storage, config) {
  bot.command('health', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendHealthMain(ctx);
  });
  bot.command('courses', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendCoursesList(ctx);
  });
  bot.command('addcourse', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendProductCatalog(ctx);
  });
  bot.command('protocols', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendProtocolsList(ctx);
  });
  bot.command('checkin', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendCheckinForm(ctx);
  });

  // Reply keyboard button
  bot.hears('💊 Здоровье', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendHealthMain(ctx);
  });

  // Callbacks
  bot.callbackQuery('xh_health', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendHealthMain(ctx);
  });
  bot.callbackQuery('hc_protocols', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendProtocolsList(ctx);
  });
  bot.callbackQuery(/^hc_protocol:(\w+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendProtocolDetails(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^hc_protocol_start:(\w+)$/, async (ctx) => {
    const user = getPlannerUser(ctx);
    if (!user) return ctx.answerCallbackQuery({ text: 'Ошибка', show_alert: true });
    const created = startProtocol(user.id, ctx.match[1]);
    if (!created) return ctx.answerCallbackQuery({ text: 'Не найден', show_alert: true });
    try { await ctx.answerCallbackQuery({ text: `✅ Запущено ${created.length} курсов` }); } catch (e) {}
    const lines = [
      '✅ <b>Протокол запущен!</b>',
      '',
      'Создано курсов:',
      ...created.map(c => `• ${escapeHtml(c.name)}`),
      '',
      'Бот будет напоминать о приёмах в указанное время.',
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('💊 К здоровью', 'xh_health') });
  });
  bot.callbackQuery('hc_add', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendProductCatalog(ctx);
  });
  bot.callbackQuery(/^hc_addproduct:(\w[\w-]*)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendProductDetails(ctx, ctx.match[1]);
  });
  bot.callbackQuery(/^hc_addproduct_start:(\w[\w-]*)$/, async (ctx) => {
    const user = getPlannerUser(ctx);
    if (!user) return ctx.answerCallbackQuery({ text: 'Ошибка', show_alert: true });
    const created = addCourseFromProduct(user.id, ctx.match[1]);
    if (!created) return ctx.answerCallbackQuery({ text: 'Не найден', show_alert: true });
    try { await ctx.answerCallbackQuery({ text: '✅ Курс добавлен' }); } catch (e) {}
    await ctx.reply(`✅ <b>${escapeHtml(created.name)}</b> добавлен в ваши курсы.\n\nЯ напомню в указанное время.`, {
      parse_mode: 'HTML', reply_markup: new InlineKeyboard().text('💊 К здоровью', 'xh_health')
    });
  });
  bot.callbackQuery('hc_courses', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendCoursesList(ctx);
  });
  bot.callbackQuery(/^hc_card:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendCourseCard(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^hc_pause:(\d+)$/, async (ctx) => {
    const user = getPlannerUser(ctx);
    if (!user) return;
    db.getDb().prepare("UPDATE health_courses SET status = 'paused' WHERE id = ? AND user_id = ?").run(Number(ctx.match[1]), user.id);
    try { await ctx.answerCallbackQuery({ text: '⏸ Курс на паузе' }); } catch (e) {}
    await sendHealthMain(ctx);
  });
  bot.callbackQuery(/^hc_finish:(\d+)$/, async (ctx) => {
    const user = getPlannerUser(ctx);
    if (!user) return;
    db.getDb().prepare("UPDATE health_courses SET status = 'completed' WHERE id = ? AND user_id = ?").run(Number(ctx.match[1]), user.id);
    try { await ctx.answerCallbackQuery({ text: '✅ Курс завершён' }); } catch (e) {}
    await sendHealthMain(ctx);
  });
  bot.callbackQuery(/^hc_take:(\d+)$/, async (ctx) => {
    await handleTake(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^hc_skip:(\d+)$/, async (ctx) => {
    await handleSkip(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^hc_snooze:(\d+)$/, async (ctx) => {
    await handleSnooze(ctx, Number(ctx.match[1]));
  });
  bot.callbackQuery('hc_checkin', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendCheckinForm(ctx);
  });
  bot.callbackQuery(/^hc_metric:(sleep|energy|mood):(\d+)$/, async (ctx) => {
    await handleMetric(ctx, ctx.match[1], ctx.match[2]);
  });
  bot.callbackQuery('hc_ai', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await ctx.reply(
      '💡 <b>AI-консультант Trendex</b>\n\n' +
      'Опишите ваши симптомы или цели — и я предложу подходящие продукты.\n\n' +
      'Пример: <i>"Болит горло уже второй день"</i>\n' +
      'Или: <i>"Хочу больше энергии"</i>\n\n' +
      'Используйте команду <code>/symptoms ваш вопрос</code>',
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = {
  setupHealth,
  generateTodayForUser,
  generateLogEntriesForDate,
  getActiveCourses,
  getCourseProgress,
  getTodayLogEntries,
};
