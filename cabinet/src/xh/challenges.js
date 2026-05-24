// Trendex: Referral challenges with time limits.
// "Пригласи 3 за неделю = 10% бонус" → countdown + progress + auto-reward.
//
// Command: /challenge
// Active challenge stored in webUser.activeChallenge = { id, goal, progress, endsAt }
// Checked on each referral event.

const { InlineKeyboard } = require('grammy');

const CHALLENGES = [
  { id: 'ref3_7d',  goal: 3,  days: 7,  title: '3 реферала за 7 дней',      reward: '🥉 Бейдж "Быстрый старт"' },
  { id: 'ref5_14d', goal: 5,  days: 14, title: '5 рефералов за 2 недели',    reward: '🥈 Бейдж "Сетевик"' },
  { id: 'ref10_30d',goal: 10, days: 30, title: '10 рефералов за месяц',      reward: '🥇 Бейдж "Лидер роста"' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureUser(ctx, storage) {
  try { return storage.ensureWebUserFromTelegram(ctx.from); } catch (e) { return null; }
}

function getActiveChallenge(user) {
  if (!user || !user.dripSchedule) return null;
  const raw = user.dripSchedule['active_challenge'];
  if (!raw) return null;
  try {
    const ch = JSON.parse(raw);
    if (ch.endsAt && Date.parse(ch.endsAt) < Date.now()) return null; // expired
    return ch;
  } catch (e) { return null; }
}

function countRecentRefs(storage, userId, sinceDays) {
  const refs = storage.listInviteeReferrals ? storage.listInviteeReferrals(userId) : [];
  const cutoff = Date.now() - sinceDays * 86400000;
  return refs.filter(r => r.createdAt && Date.parse(r.createdAt) > cutoff).length;
}

async function sendChallenge(ctx, storage) {
  const user = ensureUser(ctx, storage);
  if (!user) return ctx.reply('Не удалось загрузить профиль.');
  const active = getActiveChallenge(user);

  if (active) {
    const ch = CHALLENGES.find(c => c.id === active.id);
    if (!ch) return;
    const progress = countRecentRefs(storage, user.id, ch.days);
    const remaining = Math.max(0, Math.ceil((Date.parse(active.endsAt) - Date.now()) / 86400000));
    const pct = Math.min(100, Math.round((progress / ch.goal) * 100));

    if (progress >= ch.goal) {
      // Completed!
      storage.setDripSent(user.id, `challenge_${ch.id}_won`);
      storage.setDripSent(user.id, 'active_challenge'); // clear
      return ctx.reply(
        `🎉 <b>ЧЕЛЛЕНДЖ ВЫПОЛНЕН!</b>\n\n` +
        `${ch.title}\n\n` +
        `Результат: <b>${progress}/${ch.goal}</b> рефералов\n\n` +
        `Награда: ${ch.reward}\n\n` +
        `💪 Готовы к следующему? /challenge`,
        { parse_mode: 'HTML' }
      );
    }

    const lines = [
      `🏁 <b>Активный челлендж</b>`,
      '',
      `<b>${ch.title}</b>`,
      '',
      `Прогресс: <b>${progress}/${ch.goal}</b> (${pct}%)`,
      `${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))}`,
      '',
      `⏰ Осталось: <b>${remaining} дн.</b>`,
      `🎁 Награда: ${ch.reward}`,
      '',
      `Приглашайте друзей через /ref!`,
    ];
    const kb = new InlineKeyboard()
      .text('🔗 Реф-ссылка', 'xh_ref').row()
      .text('🎯 Промо-материалы', 'xh_promo');
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
  }

  // No active challenge — offer to start
  const lines = [
    '🏁 <b>Реферальные челленджи</b>',
    '',
    'Выберите челлендж и выполните за указанное время:',
    '',
  ];
  const kb = new InlineKeyboard();
  CHALLENGES.forEach(ch => {
    const alreadyWon = user.dripSchedule && user.dripSchedule[`challenge_${ch.id}_won`];
    lines.push(`${alreadyWon ? '✅' : '🏁'} <b>${ch.title}</b>`);
    lines.push(`   🎁 ${ch.reward}${alreadyWon ? ' — выполнен!' : ''}`);
    lines.push('');
    if (!alreadyWon) {
      kb.text(`▶️ Начать: ${ch.title}`, `challenge_start:${ch.id}`).row();
    }
  });

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

function setupChallenges(bot, storage, config) {
  bot.command('challenge', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendChallenge(ctx, storage);
  });

  bot.callbackQuery(/^challenge_start:(\w+)$/, async (ctx) => {
    const chId = ctx.match[1];
    const ch = CHALLENGES.find(c => c.id === chId);
    if (!ch) return ctx.answerCallbackQuery({ text: 'Не найден', show_alert: true });
    const user = ensureUser(ctx, storage);
    if (!user) return;

    const challenge = {
      id: ch.id,
      startedAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + ch.days * 86400000).toISOString(),
    };
    // Store as JSON string in dripSchedule
    storage.setDripSent(user.id, 'active_challenge');
    // Actually need to store JSON — use a workaround via dripSchedule string
    try {
      const allUsers = storage.listAllWebUsers();
      const u = allUsers.find(x => x.id === user.id);
      if (u) {
        // Store challenge data directly
        const state = require('fs').readFileSync(require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json'), 'utf8');
        const s = JSON.parse(state);
        if (s.webUsers[String(user.id)]) {
          if (!s.webUsers[String(user.id)].dripSchedule) s.webUsers[String(user.id)].dripSchedule = {};
          s.webUsers[String(user.id)].dripSchedule['active_challenge'] = JSON.stringify(challenge);
          require('fs').writeFileSync(require('path').join(process.cwd(), process.env.DATA_DIR || 'data', 'state.json'), JSON.stringify(s, null, 2));
        }
      }
    } catch (e) {
      console.error('[challenge_start]', e && e.message);
    }

    try { await ctx.answerCallbackQuery({ text: '🏁 Челлендж начат!' }); } catch (e) {}
    await ctx.reply(
      `🏁 <b>Челлендж начат!</b>\n\n` +
      `<b>${ch.title}</b>\n\n` +
      `⏰ У вас ${ch.days} дней.\n` +
      `🎁 Награда: ${ch.reward}\n\n` +
      `Начните приглашать прямо сейчас — /ref`,
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = { setupChallenges };
