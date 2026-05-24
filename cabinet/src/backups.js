const fs = require('fs');
const path = require('path');

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatStamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    if (!error || error.code !== 'EEXIST') throw error;
  }
}

function createBackupManager(config) {
  const dataDir = path.resolve(process.cwd(), String(config.dataDir || './data'));
  const statePath = path.join(dataDir, 'state.json');
  const backupDir = path.resolve(
    process.cwd(),
    String(config.backupDir || path.join(dataDir, 'backups'))
  );
  const retentionDays = Math.max(1, Number(config.backupRetentionDays || 30));
  const intervalMs = Math.max(
    60 * 1000,
    Number(config.backupIntervalMs || 6 * 60 * 60 * 1000)
  );

  let lastBackupAt = null;
  let lastBackupPath = null;
  let lastBackupError = null;
  let backupTimer = null;

  function runBackup() {
    try {
      if (!fs.existsSync(statePath)) {
        lastBackupError = 'state.json not found';
        return { ok: false, reason: 'no_state_file' };
      }
      ensureDir(backupDir);
      const stamp = formatStamp(new Date());
      const target = path.join(backupDir, `state-${stamp}.json`);
      fs.copyFileSync(statePath, target);
      lastBackupAt = new Date().toISOString();
      lastBackupPath = target;
      lastBackupError = null;
      cleanupOldBackups();
      console.log(`[backup] saved ${target}`);
      return { ok: true, path: target, at: lastBackupAt };
    } catch (error) {
      lastBackupError = (error && error.message) || String(error);
      console.error('[backup_failed]', lastBackupError);
      return { ok: false, reason: lastBackupError };
    }
  }

  function cleanupOldBackups() {
    try {
      if (!fs.existsSync(backupDir)) return;
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const entries = fs.readdirSync(backupDir);
      let removed = 0;
      for (const name of entries) {
        if (!/^state-\d{8}-\d{4}\.json$/.test(name)) continue;
        const full = path.join(backupDir, name);
        try {
          const stat = fs.statSync(full);
          if (stat.mtimeMs < cutoff) {
            fs.unlinkSync(full);
            removed += 1;
          }
        } catch {}
      }
      if (removed > 0) {
        console.log(`[backup] cleaned ${removed} old backup(s)`);
      }
    } catch (error) {
      console.error('[backup_cleanup_failed]', error && error.message ? error.message : error);
    }
  }

  function listBackups() {
    try {
      if (!fs.existsSync(backupDir)) return [];
      return fs
        .readdirSync(backupDir)
        .filter((name) => /^state-\d{8}-\d{4}\.json$/.test(name))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  function start() {
    if (backupTimer) return;
    // Initial backup after 60s to not interfere with boot
    setTimeout(() => {
      runBackup();
    }, 60 * 1000).unref();
    backupTimer = setInterval(() => {
      runBackup();
    }, intervalMs);
    backupTimer.unref();
    console.log(`[backup] cron every ${Math.round(intervalMs / 60000)}min, retention ${retentionDays}d, dir: ${backupDir}`);
  }

  function stop() {
    if (backupTimer) {
      clearInterval(backupTimer);
      backupTimer = null;
    }
  }

  function getStatus() {
    return {
      lastBackupAt,
      lastBackupPath,
      lastBackupError,
      backupDir,
      retentionDays,
      intervalMinutes: Math.round(intervalMs / 60000),
      count: listBackups().length,
    };
  }

  return { start, stop, runBackup, getStatus, listBackups };
}

module.exports = { createBackupManager };
