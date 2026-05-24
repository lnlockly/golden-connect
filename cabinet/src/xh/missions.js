// Golden Connect: Partner missions — 7-day step-by-step program for new partners.
// Each day has a concrete task → user marks complete → badge at the end.
//
// Command: /missions
// Stored in webUser.missions = { day1: { completed: true, at: iso }, ... }

const { InlineKeyboard } = require('grammy');

const MISSIONS = [
  { day: 1, title: 'Скопируй реф-ссылку и пригласи 5 друзей', icon: '🔗', desc: 'Открой /ref — твоя ссылка уже готова. Отправь её 5 знакомым.', action: '/ref' },
  { day: 2, title: 'Создай рекламный пост через AI', icon: '🤖', desc: '/promo → AI сгенерирует текст про Golden Connect и оформит для соцсетей.', action: '/promo' },
  { day: 3, title: 'Возьми первое задание-подписку (биржа)', icon: '💰', desc: 'Reply-кнопка «💰 Задания (заработать)» → выбери канал, подпишись, получи $0.05+', action: '💰 Задания (заработать)' },
  { day: 4, title: 'Запусти первую кампанию (от $5)', icon: '🎯', desc: 'Reply-кнопка «🎯 Разместить рекламу» → выбери тип задания, оплати из gift-баланса.', action: '🎯 Разместить рекламу' },
  { day: 5, title: 'Получи QR-код реф-ссылки', icon: '📱', desc: '/qr — красивый QR. Сохрани для визитки или поста в соцсетях.', action: '/qr' },
  { day: 6, title: 'Проверь команду и воронку рефералов', icon: '👥', desc: '/team — увидишь воронку (зашли/онбординг/активные/в компании). Напиши тем кто завис.', action: '/team' },
  { day: 7, title: 'Активируй тариф LAUNCH (или выше)', icon: '🚀', desc: '/tariffs — без тарифа линейные доходят, но матрица + Matching Bonus только с тарифом.', action: '/tariffs' },
];

function ensureUser(ctx, storage) {
  try { return storage.ensureWebUserFromTelegram(ctx.from); } catch (e) { return null; }
}

function getMissions(user) {
  return (user && user.dripSchedule) || {}; // reuse dripSchedule for mission tracking
}

function isMissionDone(user, day) {
  const m = getMissions(user);
  return !!m[`mission_day${day}`];
}

function getCompletedCount(user) {
  let count = 0;
  for (let d = 1; d <= 7; d++) {
    if (isMissionDone(user, d)) count++;
  }
  return count;
}

async function sendMissions(ctx, storage) {
  const user = ensureUser(ctx, storage);
  if (!user) return ctx.reply('Не удалось загрузить профиль.');
  const completed = getCompletedCount(user);
  const pct = Math.round((completed / 7) * 100);

  const lines = [
    '🎯 <b>Миссии партнёра Golden Connect</b>',
    '',
    `Прогресс: <b>${completed}/7</b> (${pct}%)`,
    `${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))}`,
    '',
  ];

  MISSIONS.forEach((m) => {
    const done = isMissionDone(user, m.day);
    lines.push(`${done ? '✅' : '⬜'} <b>День ${m.day}: ${m.icon} ${m.title}</b>`);
    if (!done) lines.push(`   <i>${m.desc}</i>`);
    lines.push('');
  });

  if (completed === 7) {
    lines.push('🏆 <b>Поздравляем! Все миссии выполнены!</b>');
    lines.push('Вы прошли программу партнёра Golden Connect.');
  } else {
    lines.push('Нажмите кнопку чтобы отметить выполненную миссию:');
  }

  const kb = new InlineKeyboard();
  MISSIONS.forEach((m) => {
    if (!isMissionDone(user, m.day)) {
      kb.text(`✅ День ${m.day}: ${m.icon}`, `mission_done:${m.day}`).row();
    }
  });
  if (completed < 7) {
    const nextUndone = MISSIONS.find(m => !isMissionDone(user, m.day));
    if (nextUndone) {
      kb.text(`▶️ Открыть ${nextUndone.action}`, `mission_open:${nextUndone.day}`).row();
    }
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

function setupMissions(bot, storage, config) {
  bot.command('missions', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendMissions(ctx, storage);
  });

  bot.callbackQuery(/^mission_done:(\d+)$/, async (ctx) => {
    const day = Number(ctx.match[1]);
    const user = ensureUser(ctx, storage);
    if (!user) return ctx.answerCallbackQuery({ text: 'Ошибка', show_alert: true });
    storage.setDripSent(user.id, `mission_day${day}`);
    try { await ctx.answerCallbackQuery({ text: `✅ День ${day} выполнен!` }); } catch (e) {}

    // Check if all done → badge
    const freshUser = storage.findWebUserById ? storage.findWebUserById(user.id) : user;
    const completed = getCompletedCount(freshUser || user);
    if (completed === 7) {
      await ctx.reply('🏆 <b>ВСЕ МИССИИ ВЫПОЛНЕНЫ!</b>\n\nВы прошли 7-дневную программу партнёра Golden Connect. Теперь вы знаете все инструменты.\n\nПродолжайте в том же духе! 💪', { parse_mode: 'HTML' });
    }
    await sendMissions(ctx, storage);
  });

  bot.callbackQuery(/^mission_open:(\d+)$/, async (ctx) => {
    const day = Number(ctx.match[1]);
    const mission = MISSIONS.find(m => m.day === day);
    if (!mission) return;
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await ctx.reply(`${mission.icon} <b>День ${day}: ${mission.title}</b>\n\n${mission.desc}\n\nНажмите ${mission.action} чтобы выполнить.`, { parse_mode: 'HTML' });
  });
}

module.exports = { setupMissions };
