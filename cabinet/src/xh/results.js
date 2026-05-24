// Trendex: Мои результаты — траффик + заработок партнёра.
// Команда: /results, /earnings
// Callback: my_results
const { InlineKeyboard } = require('grammy');
const { getBalance } = require('../services/balance-bridge');
const db = require('../planner/db/database');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtUsd(cents) {
  const n = Number(cents || 0) / 100;
  return '$' + n.toFixed(2);
}

function pad(n) { return String(n).padStart(2, '0'); }
function relDateRu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин назад';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч назад';
  if (diff < 7 * 86400) return Math.floor(diff / 86400) + ' дн назад';
  return pad(d.getDate()) + '.' + pad(d.getMonth() + 1);
}

async function sendResults(ctx, storage) {
  const tgUser = ctx.from;
  const rawDb = db.getDb();
  const u = db.ensureUser(tgUser);

  // Phase H: balances from api Postgres (single source); ads_day_count still planner
  const bal = await getBalance({ tgId: tgUser.id });
  const localRow = rawDb.prepare('SELECT ads_day_count FROM users WHERE id = ?').get(u.id) || {};
  const adRow = {
    gift_balance_cents: bal.gift_cents,
    earned_balance_cents: bal.working_cents,
    ads_karma: bal.karma,
    ads_day_count: localRow.ads_day_count || 0,
  };

  // Total ad_transactions (lifetime + today)
  const today = new Date().toISOString().slice(0, 10);
  const txStats = rawDb.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'reward' THEN amount_cents ELSE 0 END), 0) AS earned_total,
      COALESCE(SUM(CASE WHEN kind = 'reward' AND DATE(created_at) = ? THEN amount_cents ELSE 0 END), 0) AS earned_today,
      COUNT(DISTINCT CASE WHEN kind = 'reward' THEN claim_id END) AS tasks_done
    FROM ad_transactions WHERE user_id = ?
  `).get(today, u.id) || { earned_total: 0, earned_today: 0, tasks_done: 0 };

  // Active claims (in progress)
  const activeClaims = rawDb.prepare(`
    SELECT COUNT(*) AS n FROM ad_task_claims WHERE executor_user_id = ? AND status IN ('claimed', 'submitted', 'rework')
  `).get(u.id).n || 0;

  // My active campaigns (as advertiser)
  const myCamps = rawDb.prepare(`
    SELECT COUNT(*) AS n,
      COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(completed_count), 0) AS total_completions
    FROM ad_campaigns WHERE owner_user_id = ?
  `).get(u.id) || { n: 0, active: 0, total_completions: 0 };

  // Referrals (from cabinet web user — joined by tg id)
  let webUser = null;
  try { webUser = storage.ensureWebUserFromTelegram(tgUser); } catch (e) {}
  const refStats = (webUser && storage.getTeamStats) ? storage.getTeamStats(webUser.id) : null;
  const refLink = (webUser && webUser.referralCode)
    ? 'https://t.me/' + ((ctx.me && ctx.me.username) || 'Trendex_bizbot') + '?start=ref_' + webUser.referralCode
    : null;

  // Karma indicator
  const karma = adRow.ads_karma ?? 100;
  const karmaIcon = karma >= 80 ? '🟢' : karma >= 40 ? '🟡' : '🔴';
  const karmaLabel = karma >= 80 ? 'отличная' : karma >= 40 ? 'нормальная' : 'низкая';

  // Last 5 transactions
  const recent = rawDb.prepare(`
    SELECT kind, amount_cents, note, created_at FROM ad_transactions
    WHERE user_id = ? ORDER BY id DESC LIMIT 5
  `).all(u.id);

  // Build text
  const lines = [];
  lines.push('📊 <b>Мои результаты</b>');
  lines.push('');
  lines.push('💰 <b>Балансы</b>');
  lines.push('   💵 Заработано: <b>' + fmtUsd(adRow.earned_balance_cents) + '</b>' + (adRow.earned_balance_cents >= 300 ? ' · можно вывести' : ''));
  lines.push('   🎁 Gift (на свою рекламу): <b>' + fmtUsd(adRow.gift_balance_cents) + '</b>');
  lines.push('');
  lines.push('🎯 <b>Заработок на заданиях</b>');
  lines.push('   📅 Сегодня: <b>' + fmtUsd(txStats.earned_today) + '</b>');
  lines.push('   📊 Всего: <b>' + fmtUsd(txStats.earned_total) + '</b> за <b>' + (txStats.tasks_done || 0) + '</b> заданий');
  lines.push('   🔄 В работе: <b>' + activeClaims + '</b>');
  lines.push('   ' + karmaIcon + ' Карма: <b>' + karma + '</b> (' + karmaLabel + ')');
  lines.push('');
  if (myCamps.n > 0) {
    lines.push('📢 <b>Мои кампании</b>');
    lines.push('   Активных: <b>' + myCamps.active + '</b> / всего <b>' + myCamps.n + '</b>');
    lines.push('   Выполнено исполнителями: <b>' + myCamps.total_completions + '</b>');
    lines.push('');
  }
  if (refStats) {
    lines.push('👥 <b>Партнёрская сеть</b>');
    lines.push('   Прямых рефералов: <b>' + (refStats.total || 0) + '</b>');
    if (refStats.engaged) lines.push('   🔥 Активных: <b>' + refStats.engaged + '</b>');
    if (refStats.converted) lines.push('   ✅ В компании: <b>' + refStats.converted + '</b>');
    lines.push('   <i>Линейные доходы 10 уровней начисляются мгновенно при покупке тарифа партнёром ниже</i>');
    lines.push('');
  }
  if (recent.length) {
    lines.push('📝 <b>Последние операции</b>');
    recent.forEach((tx) => {
      const sign = tx.amount_cents > 0 ? '+' : '';
      const icon = tx.kind === 'reward' ? '✅' : tx.kind === 'charge' ? '🛒' : tx.kind === 'refund' ? '↩️' : '·';
      lines.push('   ' + icon + ' ' + sign + fmtUsd(tx.amount_cents) + ' · ' + (tx.note || tx.kind) + ' · ' + relDateRu(tx.created_at));
    });
    lines.push('');
  }
  if (refLink) {
    lines.push('🔗 <b>Твоя реф-ссылка:</b>');
    lines.push('<code>' + escapeHtml(refLink) + '</code>');
    lines.push('');
  }
  lines.push('<i>Мгновенные линейные выплаты + накопительная матрица (запуск через ~неделю).</i>');

  const kb = new InlineKeyboard()
    .text('💰 Найти задания', 'exec_subs').text('🎯 Запустить рекламу', 'adv_menu').row()
    .text('🏆 Топ заработавших', 'open_leaderboard').text('💼 Мои заявки', 'exec_claims').row()
    .text('👥 Команда', 'xh_team').text('🔗 Реф-материалы', 'xh_promo').row()
    .text('💸 Вывести', 'open_withdraw');

  return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
}

function setupResults(bot, storage, config) {
  bot.hears('💵 Мои результаты', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    return sendResults(ctx, storage);
  });

  bot.command(['results', 'earnings'], async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    return sendResults(ctx, storage);
  });
  bot.callbackQuery('my_results', async (ctx) => {
    await ctx.answerCallbackQuery();
    return sendResults(ctx, storage);
  });
  // Lightweight redirects for buttons referenced from the results card
  bot.callbackQuery('open_leaderboard', async (ctx) => {
    await ctx.answerCallbackQuery();
    const url = (config && config.publicBaseUrl ? config.publicBaseUrl.replace(/\/+$/, '') : 'https://trendex.biz/cabinet') + '/cabinet#/leaderboard';
    return ctx.reply('🏆 Топ заработавших — открыть в кабинете:\n' + url);
  });
  bot.callbackQuery('open_withdraw', async (ctx) => {
    await ctx.answerCallbackQuery();
    const url = (config && config.publicBaseUrl ? config.publicBaseUrl.replace(/\/+$/, '') : 'https://trendex.biz/cabinet') + '/cabinet#/withdrawals';
    return ctx.reply('💸 Заявка на вывод (минимум $3, ручной режим):\n' + url);
  });
  bot.callbackQuery('adv_menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Trigger the existing "🎯 Разместить рекламу" reply-keyboard handler.
    // The original code listens via bot.hears(); to be safe we just print menu instructions.
    return ctx.reply('🎯 Нажми кнопку <b>«Разместить рекламу»</b> в нижней клавиатуре, или вызови /promo для материалов.', { parse_mode: 'HTML' });
  });
}

module.exports = { setupResults };
