// Golden Connect: реферальная система в боте.
// Команды: /ref, /top
// Callback: xh_ref

const { InlineKeyboard } = require('grammy');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildRefLink(botUsername, refCode) {
  const base = `https://t.me/${botUsername || 'Golden Connect_bizbot'}`;
  return refCode ? `${base}?start=ref_${refCode}` : base;
}

function buildSiteLink(refCode) {
  const base = 'https://golden-connect.to/';
  return refCode ? `${base}?ref=${encodeURIComponent(refCode)}` : base;
}

function getReferralInfo(ctx, storage) {
  let webUser = null;
  try { webUser = storage.ensureWebUserFromTelegram(ctx.from); }
  catch (e) { console.error('[xh_ref_ensure]', e && e.message); }
  const botUsername = (ctx.me && ctx.me.username) || 'Golden Connect_bizbot';
  const refCode = (webUser && webUser.referralCode) || '';
  const refLink = buildRefLink(botUsername, refCode);
  const siteLink = buildSiteLink(refCode);
  const stats = webUser && typeof storage.getReferralStats === 'function'
    ? storage.getReferralStats(webUser.id, 5)
    : null;
  return { webUser, refCode, refLink, siteLink, stats, botUsername };
}

async function sendRefCard(ctx, storage) {
  const info = getReferralInfo(ctx, storage);
  const lines = [
    '🔗 <b>Ваши реферальные ссылки</b>',
    '',
    '🤖 Ссылка на бота:',
    `<code>${escapeHtml(info.refLink)}</code>`,
    '',
    '🌐 Ссылка на сайт:',
    `<code>${escapeHtml(info.siteLink)}</code>`,
    '',
  ];
  if (info.stats) {
    lines.push(`📊 Прямых рефералов: <b>${Number(info.stats.directReferrals || 0)}</b>`);
    lines.push(`📊 Всего в структуре: <b>${Number(info.stats.totalReferrals || 0)}</b>`);
    lines.push(`💰 Баллов: <b>${Number(info.stats.points || 0)}</b>`);
  }
  lines.push('');
  lines.push('<i>Приглашайте друзей и получайте бонусы!</i>');

  const shareText = encodeURIComponent('Присоединяйтесь к Golden Connect — эфиры с профессорами и натуральные рекламная платформа Golden Connect!');
  const shareBotUrl = `https://t.me/share/url?url=${encodeURIComponent(info.refLink)}&text=${shareText}`;
  const shareSiteUrl = `https://t.me/share/url?url=${encodeURIComponent(info.siteLink)}&text=${shareText}`;

  const kb = new InlineKeyboard()
    .url('📤 Поделиться ботом', shareBotUrl).row()
    .url('🌐 Поделиться сайтом', shareSiteUrl).row()
    .text('📊 Топ рефереров', 'xh_top');

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: kb,
    disable_web_page_preview: true,
  });
}

async function sendTop(ctx, storage) {
  // Simple: count direct referrals per user, sort desc, top 10
  const allUsers = typeof storage.listAllWebUsers === 'function' ? storage.listAllWebUsers() : [];
  const counts = {};
  for (const u of allUsers) {
    if (!u || !u.id) continue;
    counts[u.id] = { user: u, count: 0 };
  }
  for (const u of allUsers) {
    if (u && u.referredByUserId && counts[u.referredByUserId]) {
      counts[u.referredByUserId].count += 1;
    }
  }
  const users = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
  if (!users.length) {
    return ctx.reply('📊 <b>Топ рефереров</b>\n\nДанные пока недоступны. Пригласите друга чтобы стать первым!', { parse_mode: 'HTML' });
  }
  const lines = ['🏆 <b>Топ рефереров Golden Connect</b>', ''];
  users.forEach((item, i) => {
    const name = escapeHtml(item.user.displayName || item.user.email || `User${item.user.id}`);
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    lines.push(`${medal} ${name} — <b>${item.count}</b> реф.`);
  });
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

function setupReferral(bot, storage, config) {
  bot.command('ref', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendRefCard(ctx, storage);
  });

  bot.command('top', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendTop(ctx, storage);
  });

  bot.callbackQuery('xh_ref', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendRefCard(ctx, storage);
  });

  bot.callbackQuery('xh_top', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendTop(ctx, storage);
  });

  bot.hears('🔗 Реф', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await sendRefCard(ctx, storage);
  });
}

module.exports = { setupReferral };
