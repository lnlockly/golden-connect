// AdCenter in-process scheduler. Runs every 60s in cabinet pod.
// - Spawns ad-center-cron.js (handles ad_schedules)
// - Polls ad_monitor_sources for due monitors and triggers processMonitor
const path = require('path');
const { spawn } = require('child_process');

let started = false;
let _scheduleSpawnLock = false;

function spawnSchedulesCron() {
  if (_scheduleSpawnLock) return;
  _scheduleSpawnLock = true;
  try {
    const cronPath = path.join(__dirname, 'ad-center-cron.js');
    const child = spawn(process.execPath, [cronPath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(__dirname, '..'),
    });
    child.unref();
    child.on('exit', () => { _scheduleSpawnLock = false; });
    setTimeout(() => { _scheduleSpawnLock = false; }, 290000);
  } catch (e) {
    console.error('[adc-tick] spawn schedules cron failed:', e.message);
    _scheduleSpawnLock = false;
  }
}

let _monitorBusy = false;
async function tickMonitors() {
  if (_monitorBusy) return;
  _monitorBusy = true;
  try {
    const dbModule = require('./planner/db/database');
    const db = dbModule.getDb();
    let arsenal;
    try { arsenal = require('./routes/ad-center-arsenal'); }
    catch (e) { console.error('[adc-tick] cannot load arsenal route:', e.message); return; }
    const processMonitor = arsenal && arsenal.processMonitor;
    if (typeof processMonitor !== 'function') return;

    const due = db.prepare(`
      SELECT * FROM ad_monitor_sources
      WHERE status='active'
        AND (
          last_check IS NULL
          OR datetime(last_check, '+' || COALESCE(interval_hours, 6) || ' hours') <= datetime('now')
        )
      ORDER BY (last_check IS NULL) DESC, last_check ASC
      LIMIT 5
    `).all();

    if (!due.length) return;
    console.log('[adc-tick] processing', due.length, 'due monitor(s)');
    for (const m of due) {
      try {
        await processMonitor(m, db);
      } catch (e) {
        console.error('[adc-tick] monitor', m.id, 'error:', e.message);
        try { db.prepare("UPDATE ad_monitor_sources SET last_check=datetime('now') WHERE id=?").run(m.id); } catch (_) {}
      }
    }
  } catch (e) {
    console.error('[adc-tick] tickMonitors fatal:', e.message);
  } finally {
    _monitorBusy = false;
  }
}

function start() {
  if (started) return;
  started = true;
  // Schedules: spawn ad-center-cron every 60s
  setInterval(spawnSchedulesCron, 60 * 1000);
  // Monitors: every 5 minutes
  setInterval(() => { tickMonitors().catch(() => {}); }, 5 * 60 * 1000);
  // First run after short delay
  setTimeout(spawnSchedulesCron, 30 * 1000);
  setTimeout(() => tickMonitors().catch(() => {}), 90 * 1000);
  console.log('[adc-tick] started: schedules every 60s, monitors every 5min');
}

module.exports = { start, spawnSchedulesCron, tickMonitors };
