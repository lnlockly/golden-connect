const os = require('os');

const MB = 1024 * 1024;

function createMonitoring({ config, bot, storage, startedAt, getBackupStatus }) {
  const chatId = Number(config.monitorChatId || config.supportForwardChatId || 0) || null;
  const checkIntervalMs = Math.max(
    60 * 1000,
    Number(config.monitorIntervalMs || 5 * 60 * 1000)
  );
  const memoryThresholdMb = Math.max(128, Number(config.monitorMemoryMb || 500));
  const backupStaleHours = Math.max(1, Number(config.monitorBackupStaleHours || 12));

  const lastAlerts = new Map();
  const alertCooldownMs = 60 * 60 * 1000; // 1 hour same-code alert cooldown
  let timer = null;
  let startupSent = false;

  async function notifyAdmin(text) {
    if (!chatId) return false;
    try {
      await bot.api.sendMessage(chatId, text, { disable_web_page_preview: true });
      return true;
    } catch (error) {
      console.error('[monitor_notify_failed]', error && error.message ? error.message : error);
      return false;
    }
  }

  function alertOnce(code, text) {
    const now = Date.now();
    const last = lastAlerts.get(code) || 0;
    if (now - last < alertCooldownMs) return;
    lastAlerts.set(code, now);
    notifyAdmin(text);
  }

  function clearAlert(code) {
    lastAlerts.delete(code);
  }

  async function checkBot() {
    try {
      await bot.api.getMe();
      clearAlert('bot_unreachable');
    } catch (error) {
      alertOnce(
        'bot_unreachable',
        `🚨 trendex-cabinet: Telegram API недоступен\n${(error && error.message) || error}`
      );
    }
  }

  function checkMemory() {
    const usage = process.memoryUsage();
    const rssMb = Math.round(usage.rss / MB);
    if (rssMb > memoryThresholdMb) {
      alertOnce(
        'memory_high',
        `⚠️ trendex-cabinet: высокое потребление памяти\nRSS: ${rssMb} MB (порог ${memoryThresholdMb} MB)`
      );
    } else if (rssMb < memoryThresholdMb * 0.8) {
      clearAlert('memory_high');
    }
    return rssMb;
  }

  function checkBackups() {
    if (typeof getBackupStatus !== 'function') return;
    const status = getBackupStatus();
    if (!status) return;
    if (status.lastBackupError) {
      alertOnce(
        'backup_failed',
        `🚨 trendex-cabinet: ошибка бэкапа\n${status.lastBackupError}`
      );
      return;
    }
    if (!status.lastBackupAt) return;
    const ageMs = Date.now() - new Date(status.lastBackupAt).getTime();
    const ageHours = ageMs / 3600000;
    if (ageHours > backupStaleHours) {
      alertOnce(
        'backup_stale',
        `⚠️ trendex-cabinet: последний бэкап ${ageHours.toFixed(1)}ч назад (порог ${backupStaleHours}ч)`
      );
    } else {
      clearAlert('backup_stale');
    }
  }

  async function runChecks() {
    try {
      checkMemory();
      checkBackups();
      await checkBot();
    } catch (error) {
      console.error('[monitor_run_failed]', error && error.message ? error.message : error);
    }
  }

  async function sendStartup() {
    if (startupSent) return;
    startupSent = true;
    const host = os.hostname();
    const node = process.version;
    const mem = Math.round(process.memoryUsage().rss / MB);
    await notifyAdmin(
      `✅ trendex-cabinet запущен\nhost: ${host}\nnode: ${node}\nRSS: ${mem} MB\npid: ${process.pid}`
    );
  }

  function start() {
    if (timer) return;
    if (!chatId) {
      console.log('[monitor] disabled (no MONITOR_CHAT_ID / SUPPORT_FORWARD_CHAT_ID set)');
      return;
    }
    // Startup alert after 15s (let bot finish connecting)
    setTimeout(() => {
      sendStartup();
    }, 15 * 1000).unref();
    timer = setInterval(runChecks, checkIntervalMs);
    timer.unref();
    console.log(
      `[monitor] started: chat=${chatId}, interval=${Math.round(checkIntervalMs / 1000)}s, mem_threshold=${memoryThresholdMb}MB`
    );
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function getStatus() {
    const usage = process.memoryUsage();
    return {
      enabled: Boolean(chatId),
      chatId,
      intervalSec: Math.round(checkIntervalMs / 1000),
      memoryThresholdMb,
      uptimeSec: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null,
      rssMb: Math.round(usage.rss / MB),
      heapUsedMb: Math.round(usage.heapUsed / MB),
      activeAlerts: Array.from(lastAlerts.keys()),
    };
  }

  return { start, stop, notifyAdmin, runChecks, getStatus };
}

module.exports = { createMonitoring };
