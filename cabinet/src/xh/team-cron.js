// Trendex: Team cron — periodic stage recomputation + daily digest.
// - Every 30 min: iterate all webUsers with referredByUserId, refresh stage, notify inviters on transitions.
// - Daily 20:00 MSK: send digest to each inviter with activity summary.

const { InlineKeyboard } = require('grammy');
const { isSilenced: _gsIsSilenced } = require('./group-silence');
const { notifyInviterStageChange } = require('./team-notify');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function processStageRefresh(bot, storage) {
  try {
    const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
    for (const u of allUsers) {
      if (!u || !u.referredByUserId) continue;
      try {
        const tr = storage.refreshReferralStage(u.id);
        if (tr && tr.new) {
          await notifyInviterStageChange(bot, storage, u.id, tr.old, tr.new).catch(() => {});
        }
      } catch (e) { console.error('[team_stage_refresh]', u.id, e && e.message); }
    }
  } catch (e) {
    console.error('[team_cron_error]', e && e.message);
  }
}

function isMskEvening20() {
  // 20:00 МСК = 17:00 UTC (±5 мин tolerance)
  const h = new Date().getUTCHours();
  const m = new Date().getUTCMinutes();
  return h === 17 && m < 5;
}

let digestSentToday = null; // YYYY-MM-DD
async function processDailyDigest(bot, storage) {
  try {
    if (!isMskEvening20()) return;
    const today = new Date().toISOString().slice(0, 10);
    if (digestSentToday === today) return;
    digestSentToday = today;

    const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
    // Group refs by inviter
    const byInviter = new Map();
    for (const u of allUsers) {
      if (!u.referredByUserId) continue;
      if (!byInviter.has(u.referredByUserId)) byInviter.set(u.referredByUserId, []);
      byInviter.get(u.referredByUserId).push(u);
    }
    for (const [inviterId, refs] of byInviter.entries()) {
      try {
        const inviter = storage.findWebUserById(inviterId);
        if (!inviter || !inviter.telegramUserId) continue;
        const stats = storage.getTeamStats(inviterId);
        const nextActions = storage.getNextActions(inviterId).slice(0, 3);
        const lines = [
          '📊 <b>Итоги дня — команда Trendex</b>',
          '',
          `Всего рефералов: <b>${stats.total}</b>`,
        ];
        if (stats.joined)    lines.push(`🟡 Новые: ${stats.joined}`);
        if (stats.onboarded) lines.push(`🟢 Онбординг: ${stats.onboarded}`);
        if (stats.engaged)   lines.push(`🔥 Активные: ${stats.engaged}`);
        if (stats.converted) lines.push(`✅ В компании: ${stats.converted}`);
        if (stats.dormant)   lines.push(`⚠️ Уснули: ${stats.dormant}`);
        if (nextActions.length) {
          lines.push('', '🎯 <b>Завтра нужно связаться с:</b>');
          nextActions.forEach((a, i) => {
            const name = a.ref.displayName || a.ref.email || `User${a.ref.id}`;
            lines.push(`${i + 1}. ${escapeHtml(name)} — ${escapeHtml(a.reason)}`);
          });
        }
        const kb = new InlineKeyboard().text('👥 Открыть команду', 'xh_team');
        await bot.api.sendMessage(inviter.telegramUserId, lines.join('\n'), {
          parse_mode: 'HTML', reply_markup: kb,
        });
      } catch (e) { console.error('[team_digest_send]', inviterId, e && e.message); }
    }
  } catch (e) {
    console.error('[team_digest_error]', e && e.message);
  }
}

function startTeamStageCron(bot, storage) {
  // Initial run after 60s
  setTimeout(() => { processStageRefresh(bot, storage); }, 60 * 1000).unref();
  // Every 30 min: stage refresh
  setInterval(() => { processStageRefresh(bot, storage); }, 30 * 60 * 1000).unref();
  // Every 5 min: check if it's 20:00 MSK for digest
  setInterval(() => { processDailyDigest(bot, storage); }, 5 * 60 * 1000).unref();
  console.log('[team_cron] started (stage refresh 30min + daily digest 20:00 MSK)');
}

module.exports = { startTeamStageCron, processStageRefresh, processDailyDigest };
