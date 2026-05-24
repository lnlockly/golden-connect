// Trendex: Gamification — streak rewards + social proof activity feed.
//
// Streak rewards: when user hits N consecutive days → badge + celebration message.
// Activity feed: /activity → shows recent team + personal achievements.
//
// Commands: /streaks, /activity

const { InlineKeyboard } = require('grammy');

const STREAK_REWARDS = [
  { days: 3,  icon: '🌱', title: 'Росток',         desc: '3 дня без пропусков — отличное начало!' },
  { days: 7,  icon: '🥉', title: 'Бронза',          desc: '7 дней подряд — привычка формируется!' },
  { days: 14, icon: '🌟', title: 'Серебро',         desc: '2 недели! Вы на правильном пути.' },
  { days: 30, icon: '🥇', title: 'Золото',          desc: 'Месяц без пропусков — вы молодец!' },
  { days: 60, icon: '💎', title: 'Бриллиант',       desc: '60 дней! Trendex стало привычкой.' },
  { days: 90, icon: '🏆', title: 'Зал славы',       desc: '90 дней подряд — вы в топе Trendex!' },
];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureUser(ctx, storage) {
  try { return storage.ensureWebUserFromTelegram(ctx.from); } catch (e) { return null; }
}

function getStreak(userId) {
  try {
    const db = require('../planner/db/database');
    const rows = db.getDb().prepare(`
      SELECT scheduled_date,
             SUM(CASE WHEN status = 'taken' THEN 1 ELSE 0 END) as taken,
             COUNT(*) as total
      FROM health_course_log
      WHERE user_id = ?
      GROUP BY scheduled_date
      ORDER BY scheduled_date DESC
      LIMIT 100
    `).all(userId);
    let streak = 0;
    for (const r of rows) {
      if (r.taken === r.total && r.total > 0) streak += 1;
      else break;
    }
    return streak;
  } catch (e) { return 0; }
}

function getEarnedStreakRewards(streak) {
  return STREAK_REWARDS.filter(r => streak >= r.days);
}

function getNextReward(streak) {
  return STREAK_REWARDS.find(r => streak < r.days) || null;
}

async function sendStreaks(ctx, storage) {
  const user = ensureUser(ctx, storage);
  if (!user) return ctx.reply('Не удалось загрузить профиль.');
  let plannerUserId = null;
  try {
    const db = require('../planner/db/database');
    const pu = db.getUserByTgId ? db.getUserByTgId(user.telegramUserId) : null;
    if (pu) plannerUserId = pu.id;
  } catch (e) {}

  if (!plannerUserId) {
    return ctx.reply('Запустите курс Trendex (/health) чтобы начать отслеживать стрики.');
  }

  const streak = getStreak(plannerUserId);
  const earned = getEarnedStreakRewards(streak);
  const next = getNextReward(streak);

  const lines = [
    '🔥 <b>Ваши стрики</b>',
    '',
    `Текущий стрик: <b>${streak} ${pluralDays(streak)}</b> без пропусков`,
    '',
    '<b>Достижения:</b>',
  ];

  STREAK_REWARDS.forEach(r => {
    const done = streak >= r.days;
    lines.push(`${done ? r.icon : '🔒'} <b>${r.title}</b> (${r.days} дней)${done ? ' ✓' : ''}`);
    if (!done && r === next) {
      lines.push(`   <i>Осталось ${r.days - streak} ${pluralDays(r.days - streak)}</i>`);
    }
  });

  if (next) {
    lines.push('');
    lines.push(`🎯 Следующая награда: <b>${next.icon} ${next.title}</b> через ${next.days - streak} ${pluralDays(next.days - streak)}`);
  } else {
    lines.push('');
    lines.push('🏆 <b>Все награды получены! Вы — легенда Trendex!</b>');
  }

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

function pluralDays(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'день';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'дня';
  return 'дней';
}

// Check if user just hit a new streak milestone → send celebration
async function checkStreakMilestone(bot, userId, telegramUserId) {
  if (!telegramUserId) return;
  try {
    const db = require('../planner/db/database');
    const pu = db.getUserByTgId ? db.getUserByTgId(telegramUserId) : null;
    if (!pu) return;
    const streak = getStreak(pu.id);
    const reward = STREAK_REWARDS.find(r => r.days === streak);
    if (!reward) return;
    // Check if we already celebrated (store in a simple key)
    const key = `streak_${reward.days}`;
    // Use planner DB user notes or skip dedup for simplicity
    await bot.api.sendMessage(telegramUserId,
      `${reward.icon} <b>Новое достижение: ${reward.title}!</b>\n\n${reward.desc}\n\n🔥 Стрик: ${streak} ${pluralDays(streak)}\n\nПродолжайте в том же духе!`,
      { parse_mode: 'HTML' }
    );
  } catch (e) {}
}

// ═══════════════════════════════════════
// ACTIVITY FEED (/activity)
// ═══════════════════════════════════════

async function sendActivityFeed(ctx, storage) {
  const user = ensureUser(ctx, storage);
  if (!user) return ctx.reply('Не удалось загрузить профиль.');

  const lines = ['📰 <b>Лента активности Trendex</b>', ''];

  // Recent team events (from all webUsers)
  const allUsers = storage.listAllWebUsers ? storage.listAllWebUsers() : [];
  const events = [];

  for (const u of allUsers) {
    if (!u) continue;
    // New users (last 7 days)
    if (u.createdAt && (Date.now() - Date.parse(u.createdAt)) < 7 * 86400000) {
      events.push({
        at: u.createdAt,
        text: `👋 <b>${escapeHtml(u.displayName || 'Новый участник')}</b> присоединился к Trendex`,
      });
    }
    // Stage transitions (last 7 days)
    if (Array.isArray(u.referralStageHistory)) {
      for (const h of u.referralStageHistory.slice(-3)) {
        if (!h.at || (Date.now() - Date.parse(h.at)) > 7 * 86400000) continue;
        const stageLabels = {
          onboarded: 'прошёл онбординг',
          engaged: 'стал активным',
          converted: '🎉 зарегистрировался в компании!',
        };
        if (stageLabels[h.stage]) {
          events.push({
            at: h.at,
            text: `${h.stage === 'converted' ? '✅' : '📊'} <b>${escapeHtml(u.displayName || 'Участник')}</b> ${stageLabels[h.stage]}`,
          });
        }
      }
    }
    // Badges (last 7 days)
    if (Array.isArray(u.badges)) {
      for (const b of u.badges) {
        if (!b.earnedAt || (Date.now() - Date.parse(b.earnedAt)) > 7 * 86400000) continue;
        events.push({
          at: b.earnedAt,
          text: `${b.icon} <b>${escapeHtml(u.displayName || 'Партнёр')}</b> получил бейдж "${b.title}"`,
        });
      }
    }
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  if (events.length === 0) {
    lines.push('Пока нет новых событий. Приглашайте друзей — здесь появится активность!');
  } else {
    events.slice(0, 15).forEach((e) => {
      const time = timeAgo(e.at);
      lines.push(`${e.text}`);
      lines.push(`   <i>${time}</i>`);
      lines.push('');
    });
  }

  const kb = new InlineKeyboard()
    .text('👥 Моя команда', 'xh_team')
    .text('🏆 Лидерборд', 'feat_leaderboard');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

function timeAgo(iso) {
  const diff = Date.now() - Date.parse(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  return `${d} дн назад`;
}

function setupGamification(bot, storage, config) {
  bot.command('streaks', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendStreaks(ctx, storage);
  });

  bot.command('activity', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendActivityFeed(ctx, storage);
  });

  bot.callbackQuery('feat_leaderboard', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const { sendLeaderboard } = require('./features');
    await sendLeaderboard(ctx, storage);
  });
}

module.exports = { setupGamification, checkStreakMilestone, sendStreaks, sendActivityFeed };
