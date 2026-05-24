// Golden Connect daily AI-nudge — one Groq-generated message per day, broadcast to all active users.
//
// Redesign 2026-05-09:
//   Old: 3 stage-based static NUDGE_RULES, fired in 10:00-11:00 MSK.
//   Bug: 30-min cron tick → 2 sends in the morning window (dedup field mismatch).
//   New: ONE Groq call/day generates fresh varied text → broadcast to all users with TG link.
//        Per-user dedup via storage.setDripSent(user.id, 'nudge_YYYY-MM-DD').
//
// Cost: 1 Groq call/day total (not per-user) — uses ai-welcome service.

const { InlineKeyboard } = require('grammy');
const { generateWelcome } = require('../services/ai-welcome');

let _todaysMessage = { day: null, text: null };

function _todayKey() {
  // YYYY-MM-DD in MSK timezone
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000); // UTC+3
  return msk.toISOString().slice(0, 10);
}

function _isMskMorning() {
  const h = new Date().getUTCHours();
  return h >= 7 && h < 8; // 10:00-11:00 MSK
}

async function _ensureTodaysMessage() {
  const today = _todayKey();
  if (_todaysMessage.day === today && _todaysMessage.text) return _todaysMessage.text;

  let text;
  try {
    text = await generateWelcome({ name: 'друг', isMember: true, lang: 'ru' });
  } catch (e) {
    console.warn('[nudge] generateWelcome failed:', e && e.message);
    text = '';
  }
  if (!text) {
    // Hard fallback if Groq is down — generic friendly nudge.
    text = '👋 Привет! Загляни в кабинет — за вчера у нас несколько обновлений по партнёрке и инструментам. Подробности внутри.';
  }
  _todaysMessage = { day: today, text };
  console.log('[nudge] today\'s message ready (' + today + '), ' + text.length + ' chars');
  return text;
}

function _buildKeyboard(botUsername) {
  const u = botUsername || 'Golden Connect_bizbot';
  return new InlineKeyboard()
    .url('🌐 Открыть кабинет', 'https://t.me/' + u + '?start=cab').row()
    .url('💎 Genesis TRDX', 'https://t.me/' + u + '?start=trdx')
    .url('💰 Биржа заданий', 'https://t.me/' + u + '?start=jobs').row()
    .url('🚀 Тарифы', 'https://t.me/' + u + '?start=tariffs');
}

async function processNudges(bot, storage) {
  if (!_isMskMorning()) return;
  const today = _todayKey();
  const dripKey = 'nudge_' + today;

  let text;
  try { text = await _ensureTodaysMessage(); }
  catch (e) { console.error('[nudge] message gen failed:', e && e.message); return; }

  let me = null;
  try { me = await bot.api.getMe(); } catch (_) {}
  const kb = _buildKeyboard(me && me.username);

  let allUsers = [];
  try { allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : []; }
  catch (e) { console.error('[nudge] listAllWebUsers failed:', e && e.message); return; }

  let sent = 0, skipped = 0, blocked = 0, dupSkipped = 0;
  // [tg-dedup] Skip duplicate webUsers that share the same telegramUserId
  // (e.g. user signed up twice via different flows). Otherwise same TG account
  // gets the message N times.
  const seenTg = new Set();
  for (const user of allUsers) {
    if (!user || !user.telegramUserId) { skipped++; continue; }
    const tgKey = String(user.telegramUserId);
    if (seenTg.has(tgKey)) {
      // Mark this duplicate webUser as sent so on retry it does not re-fire.
      try { storage.setDripSent(user.id, dripKey); } catch (_) {}
      dupSkipped++;
      continue;
    }
    seenTg.add(tgKey);
    // Dedup — read THE field setDripSent writes to.
    const drip = (user.dripSchedule && typeof user.dripSchedule === 'object') ? user.dripSchedule : {};
    if (drip[dripKey]) { skipped++; continue; }

    try {
      await bot.api.sendMessage(user.telegramUserId, text, {
        parse_mode: 'HTML',
        reply_markup: kb,
        disable_web_page_preview: true,
      });
      storage.setDripSent(user.id, dripKey);
      sent++;
      // Soft TG rate limit — 25 msg/sec is safe (TG global cap is 30/sec).
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {
      // Mark as sent so we don't retry — common case: user blocked the bot.
      storage.setDripSent(user.id, dripKey);
      blocked++;
    }
  }
  if (sent > 0 || blocked > 0) {
    console.log('[nudge] daily ' + today + ' done: sent=' + sent + ' blocked=' + blocked + ' skipped=' + skipped + ' tg_dup_skipped=' + dupSkipped);
  }
}

function startNudgeCron(bot, storage) {
  // Ticks every 30 min. processNudges() gates itself to MSK morning + per-user dedup.
  setInterval(() => processNudges(bot, storage).catch(() => {}), 30 * 60 * 1000).unref();
  console.log('[nudge_cron] started — daily AI-nudge to all users at 10:00-11:00 MSK');
}

module.exports = { startNudgeCron, processNudges, _ensureTodaysMessage };
