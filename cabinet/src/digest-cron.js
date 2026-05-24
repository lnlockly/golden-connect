// Daily digest cron — sends summary to admin TG at 21:00 MSK every day.
// Uses simple setInterval since cabinet has only 1 replica (no HA needed).
const notify = require('./services/notify');

let started = false;
let _lastDigestDay = null;

function _todayMskKey() {
  const d = new Date();
  // MSK = UTC+3
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  return msk.toISOString().slice(0, 10);
}
function _isMskHour(h) {
  const d = new Date();
  return ((d.getUTCHours() + 3) % 24) === h;
}

function start() {
  if (started) return;
  started = true;
  console.log('[digest-cron] started: daily 21:00 MSK to admin');
  setInterval(() => {
    try {
      if (_isMskHour(21)) {
        const today = _todayMskKey();
        if (_lastDigestDay !== today) {
          _lastDigestDay = today;
          console.log('[digest-cron] firing daily digest', today);
          notify.sendDailyDigest().catch((e) => console.error('[digest-cron] err:', e.message));
        }
      }
    } catch (e) { console.error('[digest-cron] tick err:', e.message); }
  }, 60 * 1000); // check every minute
}

module.exports = { start };
