// Trendex Health Cron — generates daily log entries + dispatches reminders.
//
// Two cycles:
//   1. Daily morning generation (6:00 UTC = 9:00 MSK):
//      For every active course, create today's pending log entries
//      based on schedule_json.
//
//   2. Every 5 minutes:
//      For every pending entry where scheduled_time <= now+5min and not yet notified,
//      send Telegram reminder with [Take/Skip/Snooze] buttons.

const { InlineKeyboard } = require('grammy');
const db = require('../planner/db/database');
const { generateTodayForUser, generateLogEntriesForDate } = require('./health.js');

let lastGenDate = null;

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isMskMorning9() {
  // 9:00 MSK = 6:00 UTC, ±10 min
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  return h === 6 && m < 10;
}

async function processMorningGeneration() {
  try {
    const today = todayIso();
    if (lastGenDate === today) return;
    if (!isMskMorning9()) return;
    lastGenDate = today;

    // For every user with active courses, generate today's log entries
    const userRows = db.getDb().prepare(`
      SELECT DISTINCT user_id FROM health_courses WHERE status = 'active'
    `).all();
    let total = 0;
    for (const row of userRows) {
      total += generateTodayForUser(row.user_id);
    }
    console.log(`[health_cron] morning generation done: ${total} entries created for ${userRows.length} users`);
  } catch (e) {
    console.error('[health_cron_morning_error]', e && e.message);
  }
}

function nowHHMM() {
  const d = new Date();
  // Use Moscow time (UTC+3)
  const mskMs = d.getTime() + 3 * 3600 * 1000;
  const md = new Date(mskMs);
  return md.toISOString().slice(11, 16);
}

function compareTime(a, b) {
  return a.localeCompare(b);
}

async function processReminders(bot) {
  try {
    const today = todayIso();
    const now = nowHHMM();
    // Find pending entries for today where scheduled_time <= now (within next 5 min)
    const pending = db.getDb().prepare(`
      SELECT l.*, c.product_name, c.product_emoji, c.dose, c.duration_days, c.start_date, c.product_slug
      FROM health_course_log l
      JOIN health_courses c ON l.course_id = c.id
      JOIN users u ON l.user_id = u.id
      WHERE l.scheduled_date = ?
        AND l.status = 'pending'
        AND l.notified_at IS NULL
      ORDER BY l.scheduled_time
    `).all(today);

    for (const log of pending) {
      // Check if it's time (scheduled time <= now)
      if (compareTime(log.scheduled_time, now) > 0) continue;

      // Get user's tg_id
      const u = db.getDb().prepare('SELECT tg_id FROM users WHERE id = ?').get(log.user_id);
      if (!u || !u.tg_id) continue;

      // Calculate day number
      let dayNum = 1;
      try {
        dayNum = Math.floor((Date.now() - Date.parse(log.scheduled_date)) / 86400000) + 1;
        const startDay = Math.floor((Date.parse(log.scheduled_date) - Date.parse(log.start_date)) / 86400000) + 1;
        dayNum = startDay > 0 ? startDay : 1;
      } catch (e) {}

      const text = [
        `⏰ <b>Время принять ${log.product_emoji || '💊'} ${log.product_name}</b>`,
        '',
        `💊 ${log.dose || ''}`,
        `🕐 ${log.scheduled_time} (день ${dayNum} из ${log.duration_days})`,
      ].join('\n');

      const kb = new InlineKeyboard()
        .text('✅ Принял', `hc_take:${log.id}`).row()
        .text('⏰ Через 30 мин', `hc_snooze:${log.id}`)
        .text('❌ Пропустил', `hc_skip:${log.id}`);

      try {
        await bot.api.sendMessage(u.tg_id, text, { parse_mode: 'HTML', reply_markup: kb });
        db.getDb().prepare('UPDATE health_course_log SET notified_at = CURRENT_TIMESTAMP WHERE id = ?').run(log.id);
        console.log(`[health_cron] reminder sent to user=${log.user_id} log=${log.id}`);
      } catch (e) {
        console.error('[health_cron_send_error]', u.tg_id, e && e.message);
      }
    }

    // Auto-skip entries older than 1 hour past schedule
    db.getDb().prepare(`
      UPDATE health_course_log SET status = 'skipped'
      WHERE scheduled_date = ?
        AND status = 'pending'
        AND notified_at IS NOT NULL
        AND scheduled_time < ?
    `).run(today, addMinutesToHHMM(now, -60));
  } catch (e) {
    console.error('[health_cron_reminders_error]', e && e.message);
  }
}

function addMinutesToHHMM(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  let total = h * 60 + m + mins;
  if (total < 0) total = 0;
  total = total % (24 * 60);
  const nh = Math.floor(total / 60).toString().padStart(2, '0');
  const nm = (total % 60).toString().padStart(2, '0');
  return `${nh}:${nm}`;
}

function startHealthCron(bot) {
  // Run morning generation check every 5 min (gated by date+time)
  setInterval(() => { processMorningGeneration(); }, 5 * 60 * 1000).unref();
  // Initial run after 30s
  setTimeout(() => { processMorningGeneration(); }, 30 * 1000).unref();
  // Reminders every 5 min
  setTimeout(() => { processReminders(bot); }, 60 * 1000).unref();
  setInterval(() => { processReminders(bot); }, 5 * 60 * 1000).unref();
  console.log('[health_cron] started (morning gen 9:00 MSK + reminders every 5 min)');
}

module.exports = { startHealthCron, processMorningGeneration, processReminders };
