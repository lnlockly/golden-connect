// Daily 09:00 MSK morning digest of today's birthdays.
// Sends private message to each owner who has at least one birthday today.

const cron = require('node-cron');
const { InlineKeyboard } = require('grammy');
const { todayMsk, daysUntil, ageThisYear, formatDate, escapeHtml } = require('./birthdays-helpers');

function ownerLangFromState(s) {
  // We don't store explicit lang; default to 'ru' unless overridden.
  return (s && s.lang) || 'ru';
}

function buildMorningMessage(items, lang) {
  const T = lang === 'en' ? {
    head: '🎂 <b>Birthdays today</b>',
    cong: '✨',
    age: 'turning',
    you_have: items.length === 1 ? '1 contact has a birthday today.' : `${items.length} contacts have a birthday today.`,
  } : {
    head: '🎂 <b>Сегодня день рождения</b>',
    cong: '✨',
    age: 'исполняется',
    you_have: items.length === 1 ? 'Сегодня день рождения у 1 человека.' : `Сегодня дни рождения у ${items.length} человек.`,
  };
  const today = todayMsk();
  const lines = [T.head, '', T.you_have, ''];
  for (const b of items) {
    const age = b.year ? ageThisYear(b.year, b.month, b.day, today) : null;
    const ageStr = age != null ? ` — ${T.age} ${age}` : '';
    lines.push(`• <b>${escapeHtml(b.name)}</b>${ageStr}`);
  }
  const kb = new InlineKeyboard();
  for (const b of items) {
    kb.text(`${T.cong} ${b.name.slice(0, 22)}`, `dr_gen:${b.id}`).row();
  }
  return { text: lines.join('\n'), keyboard: kb };
}

function startBirthdayDigestCron(bot, storage, opts = {}) {
  if (typeof storage.listBirthdayOwners !== 'function') {
    console.warn('[birthdays-cron] storage helpers missing — cron not started');
    return;
  }
  // 09:00 MSK = 06:00 UTC (server may run in UTC)
  // Run every minute and trigger only on our window so server TZ doesn't matter.
  const expr = opts.cronExpr || '* * * * *';
  let lastRunDay = null;
  cron.schedule(expr, async () => {
    try {
      const t = todayMsk();
      const hourMin = `${String(t.hour ?? new Date(Date.now() + 3*3600*1000).getUTCHours()).padStart(2,'0')}:${String(new Date(Date.now() + 3*3600*1000).getUTCMinutes()).padStart(2,'0')}`;
      const targetTime = opts.time || '09:00';
      // Compute MSK hh:mm from now
      const utc = new Date();
      const msk = new Date(utc.getTime() + 3 * 3600 * 1000);
      const hhmm = `${String(msk.getUTCHours()).padStart(2,'0')}:${String(msk.getUTCMinutes()).padStart(2,'0')}`;
      const dayKey = `${msk.getUTCFullYear()}-${msk.getUTCMonth() + 1}-${msk.getUTCDate()}`;
      if (hhmm !== targetTime) return;
      if (lastRunDay === dayKey) return;
      lastRunDay = dayKey;

      const owners = storage.listBirthdayOwners();
      for (const ownerId of owners) {
        const list = storage.listBirthdays(ownerId);
        const todaysItems = list.filter(b => daysUntil(b.month, b.day, t) === 0);
        if (!todaysItems.length) continue;
        const lang = (storage.getBirthdayPrefs && storage.getBirthdayPrefs(ownerId)?.lang) || 'ru';
        const { text, keyboard } = buildMorningMessage(todaysItems, lang);
        try {
          await bot.api.sendMessage(ownerId, text, { reply_markup: keyboard, parse_mode: 'HTML' });
        } catch (e) {
          console.warn('[birthdays-cron] send fail for', ownerId, e.description || e.message);
        }
      }
    } catch (e) {
      console.error('[birthdays-cron] error:', e.message);
    }
  });
  console.log('[birthdays-cron] started, daily 09:00 MSK');
}

module.exports = { startBirthdayDigestCron };
