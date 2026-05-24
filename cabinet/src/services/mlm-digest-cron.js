// cabinet/src/services/mlm-digest-cron.js
// Daily morning digest для пользователей с digestChatId.
// Запускается каждую минуту, выполняет работу один раз в день в 9:00 MSK.

const storage = require('./mlm-crm-storage');
const notify = require('./notify');

let lastRunDate = null;

function isDigestTime() {
  const now = new Date();
  // 9:00 MSK = 6:00 UTC
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const todayKey = now.toISOString().slice(0, 10);
  return utcHour === 6 && utcMin < 5 && lastRunDate !== todayKey;
}

async function sendDigest(ownerId, chatId) {
  const dash = storage.getDashboard(ownerId);
  const batch = storage.getDailyBatch(ownerId);
  const total = batch.scheduled.length + batch.untouched.length;

  let lines = ['<b>📅 Доброе утро! Сводка по MLM CRM</b>', ''];
  if (batch.scheduled.length) {
    lines.push(`📞 <b>Запланированных созвонов на сегодня: ${batch.scheduled.length}</b>`);
    batch.scheduled.slice(0, 10).forEach(c => {
      lines.push(`  • ${c.name} · <i>${c.company || ''}</i>`);
    });
  }
  if (batch.untouched.length) {
    lines.push('', `➕ <b>Пачка новых на день: ${batch.untouched.length}</b>`);
    batch.untouched.slice(0, 5).forEach(c => {
      lines.push(`  • ${c.name} · <i>${c.company || ''}</i> · ${c.city || c.country || ''}`);
    });
  }
  lines.push('',
    `🔥 В работе: <b>${dash.in_work}</b>`,
    `✅ Закрыто всего: <b>${dash.closed}</b>`,
    `📅 Созвонов на неделе: <b>${dash.week_callbacks}</b>`,
    '',
    `<a href="https://crm.goldenConnect.to">→ открыть CRM</a>`
  );

  return notify.sendTo(chatId, lines.join('\n'));
}

async function tick() {
  if (!isDigestTime()) return;
  const todayKey = new Date().toISOString().slice(0, 10);
  lastRunDate = todayKey;

  try {
    // Read all settings buckets
    const fs = require('fs');
    const path = require('path');
    const DATA_DIR = process.env.DATA_DIR || '/data';
    const notesPath = path.join(DATA_DIR, 'mlm-crm-notes.json');
    if (!fs.existsSync(notesPath)) return;
    const all = JSON.parse(fs.readFileSync(notesPath, 'utf8'));
    const settings = all.__settings__ || {};
    for (const ownerId of Object.keys(settings)) {
      const s = settings[ownerId];
      if (!s?.digestChatId) continue;
      try {
        await sendDigest(ownerId, s.digestChatId);
        console.log(`[mlm-digest] sent to ${ownerId} → ${s.digestChatId}`);
      } catch (e) {
        console.warn(`[mlm-digest] fail ${ownerId}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[mlm-digest] tick err:', e.message);
  }
}

function startCron() {
  setInterval(tick, 60 * 1000);  // every minute
  console.log('[mlm-digest] cron started — fires daily at 09:00 MSK');
}

module.exports = { startCron, sendDigest };
