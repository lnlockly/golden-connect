// Streak counter — call on any user activity (bot interaction or cabinet visit).
// Bumps streak +1 if last_login_day == yesterday, resets to 1 if older, no-op if today.
// Awards +25 karma every 7 consecutive days.
function trackUserStreak(rawDb, userId) {
  if (!userId) return null;
  try {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10);
    const yest = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const u = rawDb.prepare('SELECT login_streak, last_login_day FROM users WHERE id=?').get(userId);
    if (!u) return null;
    if (u.last_login_day === yyyymmdd) return { streak: u.login_streak || 1, isNewDay: false };
    let newStreak;
    if (u.last_login_day === yest) newStreak = (u.login_streak || 0) + 1;
    else newStreak = 1;
    rawDb.prepare('UPDATE users SET login_streak=?, last_login_day=? WHERE id=?').run(newStreak, yyyymmdd, userId);
    let karmaBonus = 0;
    if (newStreak > 0 && newStreak % 7 === 0) {
      karmaBonus = 25;
      try { rawDb.prepare("UPDATE users SET ads_karma = MAX(0, COALESCE(ads_karma, 100) + ?) WHERE id=?").run(karmaBonus, userId); } catch (_) {}
    }
    return { streak: newStreak, isNewDay: true, karmaBonus };
  } catch (e) { console.warn('[streak] track:', e && e.message); return null; }
}
module.exports = { trackUserStreak };
