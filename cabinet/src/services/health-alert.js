// Health-alert: пробует /health localhost каждые 5 минут;
// при db_ok=false шлёт TG admin (одно сообщение, debounce 1 час).
let _lastAlertAt = 0;
const ADMIN_TG_IDS = ['424077439', '1361064246', '248745860'];
const DEBOUNCE_MS = 60 * 60 * 1000; // 1 час

async function checkAndAlert(bot) {
  try {
    const res = await fetch('http://localhost:3810/cabinet/health');
    const d = await res.json();
    if (d && d.ok === false) {
      const now = Date.now();
      if (now - _lastAlertAt < DEBOUNCE_MS) return;
      _lastAlertAt = now;
      const msg = '🚨 <b>Trendex cabinet ALERT</b>\n\n' +
        'db_ok: ' + d.db_ok + '\n' +
        'bot_running: ' + d.bot_running + '\n' +
        'uptimeSec: ' + d.uptimeSec + '\n' +
        'webUsersCount: ' + d.webUsersCount;
      for (const tgId of ADMIN_TG_IDS) {
        try { await bot.api.sendMessage(tgId, msg, { parse_mode: 'HTML' }); } catch (_) {}
      }
    } else if (d && d.ok === true) {
      _lastAlertAt = 0; // reset on healthy state
    }
  } catch (_) {}
}

function startHealthAlertCron(bot) {
  setInterval(() => { checkAndAlert(bot).catch(() => {}); }, 5 * 60 * 1000).unref();
  console.log('[health-alert] started (every 5 min, debounce 1h)');
}

module.exports = { startHealthAlertCron };
