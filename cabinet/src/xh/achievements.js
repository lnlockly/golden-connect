// Golden Connect achievements — badges + daily challenge.
//
// Badges fire once per user when criteria met.
// Daily challenge: bot picks one challenge per day, user accepts → trackable.

const { InlineKeyboard } = require('grammy');
const db = require('../planner/db/database');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function fmtUsd(cents) { return '$' + (Number(cents || 0) / 100).toFixed(2); }

const BADGES = [
  { id: 'onboarded',    icon: '🎖', title: 'Onboarded', desc: 'Прошёл стартовую анкету и получил персональный план', reward_cents: 100, condition: 'manual' },
  { id: 'first_task',   icon: '💼', title: 'Первое задание', desc: 'Выполни первое задание на бирже', reward_cents: 0,  condition: 'tasks_done >= 1' },
  { id: 'tasks_10',     icon: '⚡', title: 'Активный исполнитель', desc: '10 заданий выполнено', reward_cents: 50, condition: 'tasks_done >= 10' },
  { id: 'tasks_100',    icon: '🔥', title: 'Профи биржи', desc: '100 заданий выполнено', reward_cents: 500, condition: 'tasks_done >= 100' },
  { id: 'first_dollar', icon: '💵', title: 'Первый доллар', desc: 'Заработал первый $1', reward_cents: 0,  condition: 'earned_total_cents >= 100' },
  { id: 'earned_10',    icon: '💰', title: 'Десятка', desc: 'Заработал $10', reward_cents: 50, condition: 'earned_total_cents >= 1000' },
  { id: 'earned_100',   icon: '🏆', title: 'Сотка', desc: 'Заработал $100', reward_cents: 500, condition: 'earned_total_cents >= 10000' },
  { id: 'first_camp',   icon: '🎯', title: 'Первая кампания', desc: 'Создал первую кампанию', reward_cents: 0,  condition: 'campaigns_total >= 1' },
  { id: 'first_ref',    icon: '🔗', title: 'Первый реферал', desc: 'Привёл первого партнёра', reward_cents: 0,  condition: 'referrals >= 1' },
  { id: 'refs_10',      icon: '👥', title: 'PARTNER', desc: '10 рефералов = статус PARTNER', reward_cents: 100, condition: 'referrals >= 10' },
  { id: 'refs_50',      icon: '💎', title: 'Лидер', desc: '50 рефералов', reward_cents: 500, condition: 'referrals >= 50' },
  { id: 'streak_7',     icon: '🔥', title: '7 дней подряд', desc: '7-дневный стрик логина', reward_cents: 50, condition: 'login_streak >= 7' },
  { id: 'tariff_active',icon: '🚀', title: 'Активирован тариф', desc: 'Активирован любой платный тариф', reward_cents: 0, condition: 'tariff_active = 1' },
];

function ensureSchema() {
  const rawDb = db.getDb();
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id INTEGER NOT NULL,
      badge_id TEXT NOT NULL,
      earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reward_cents INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, badge_id)
    );

    CREATE TABLE IF NOT EXISTS daily_challenges (
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      status TEXT DEFAULT 'offered',
      progress INTEGER DEFAULT 0,
      target INTEGER NOT NULL,
      reward_cents INTEGER NOT NULL,
      offered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      PRIMARY KEY (user_id, day)
    );
  `);
}

// [tariff-wire] now async; populates tariff_active + tariff_days_remaining
// via tariff-gate.js which hits goldenConnect-api /internal/finance/balances (1-min cache).
async function getUserMetrics(userId, opts = {}) {
  const rawDb = db.getDb();
  const adStats = rawDb.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'reward' THEN amount_cents ELSE 0 END), 0) AS earned_total,
      COUNT(DISTINCT CASE WHEN kind = 'reward' THEN claim_id END) AS tasks_done
    FROM ad_transactions WHERE user_id = ?
  `).get(userId) || {};
  const camps = rawDb.prepare('SELECT COUNT(*) AS n FROM ad_campaigns WHERE owner_user_id = ?').get(userId)?.n || 0;

  let tariff_active = 0;
  let tariff_days_remaining = 0;
  let tariff_code = 'free';
  try {
    const { checkActiveTariff } = require('../services/tariff-gate');
    const u = rawDb.prepare('SELECT id, email, tg_id FROM users WHERE id = ?').get(userId);
    if (u) {
      const webUser = { id: u.id, email: u.email };
      const check = await checkActiveTariff(webUser, { config: opts.config });
      if (check && check.ok) {
        tariff_active = 1;
        tariff_code = String(check.tariff || 'free').toLowerCase();
        if (check.expires_at) {
          tariff_days_remaining = Math.max(0, Math.ceil(
            (new Date(check.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          ));
        }
      } else if (check && check.tariff) {
        tariff_code = String(check.tariff).toLowerCase();
      }
    }
  } catch (_) { /* tariff lookup non-fatal */ }

  return {
    earned_total_cents: adStats.earned_total || 0,
    tasks_done: adStats.tasks_done || 0,
    campaigns_total: camps,
    referrals: 0, // populated by checkAndAwardBadges via storage
    login_streak: 0,
    tariff_active,
    tariff_days_remaining,
    tariff_code,
  };
}

function evalCondition(cond, m) {
  // Simple safe evaluation: "metric OP value" forms only.
  const match = String(cond).match(/^(\w+)\s*(>=|<=|>|<|=)\s*(\d+)$/);
  if (!match) return false;
  const [, name, op, valStr] = match;
  const lhs = Number(m[name] || 0);
  const rhs = Number(valStr);
  if (op === '>=') return lhs >= rhs;
  if (op === '<=') return lhs <= rhs;
  if (op === '>')  return lhs > rhs;
  if (op === '<')  return lhs < rhs;
  if (op === '=')  return lhs === rhs;
  return false;
}

async function checkAndAwardBadges(bot, userId, tgChatId, storage, config) {
  const rawDb = db.getDb();
  const metrics = await getUserMetrics(userId, { config });
  // Patch in referrals from web_user via storage
  try {
    const u = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(userId);
    if (u && u.tg_id > 0) {
      const wu = storage.findWebUserByTelegramId
        ? storage.findWebUserByTelegramId(u.tg_id)
        : null;
      if (wu && storage.getTeamStats) {
        const ts = storage.getTeamStats(wu.id);
        metrics.referrals = ts?.total || 0;
      }
    }
  } catch (e) {}

  const earned = rawDb.prepare('SELECT badge_id FROM user_achievements WHERE user_id = ?').all(userId);
  const earnedSet = new Set(earned.map(r => r.badge_id));

  const newlyAwarded = [];
  for (const b of BADGES) {
    if (earnedSet.has(b.id)) continue;
    if (evalCondition(b.condition, metrics)) {
      rawDb.prepare(
        'INSERT OR IGNORE INTO user_achievements (user_id, badge_id, reward_cents) VALUES (?, ?, ?)'
      ).run(userId, b.id, b.reward_cents);
      if (b.reward_cents > 0) {
        rawDb.prepare(
          "INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note) VALUES ('reward', ?, 'gift', ?, ?)"
        ).run(userId, b.reward_cents, 'achievement_' + b.id);
        // Phase H finalize: actually credit api Postgres (the planner UPDATE used to be the only path)
        try {
          const tgRow = rawDb.prepare('SELECT tg_id FROM users WHERE id = ?').get(userId);
          if (tgRow && tgRow.tg_id) {
            await creditApi({
              tgId: tgRow.tg_id, wallet: 'gift', cents: b.reward_cents,
              kind: 'achievement', memo: 'badge ' + b.id,
            });
          }
        } catch (e) { console.warn('[achievements] api credit failed:', e && e.message); }
      }
      newlyAwarded.push(b);
    }
  }

  // Notify user
  if (newlyAwarded.length && tgChatId) {
    for (const b of newlyAwarded) {
      try {
        const txt = `🎉 <b>Новый бейдж: ${b.icon} ${escapeHtml(b.title)}</b>\n\n` +
                    `${escapeHtml(b.desc)}` +
                    (b.reward_cents > 0 ? `\n\n💰 Бонус: <b>${fmtUsd(b.reward_cents)}</b> в gift-баланс` : '');
        await bot.api.sendMessage(tgChatId, txt, { parse_mode: 'HTML' });
      } catch (e) {}
    }
  }
  return newlyAwarded;
}

const CHALLENGES = [
  { id: 'do_3_tasks', title: 'Сделай 3 задания на бирже', target: 3, reward_cents: 30, metric: 'tasks_done' },
  { id: 'do_5_tasks', title: 'Сделай 5 заданий', target: 5, reward_cents: 50, metric: 'tasks_done' },
  { id: 'invite_1', title: 'Пригласи 1 друга', target: 1, reward_cents: 50, metric: 'referrals' },
  { id: 'create_camp', title: 'Запусти кампанию (любую)', target: 1, reward_cents: 100, metric: 'campaigns_total' },
];

let _achConfig = null;
function setupAchievements(bot, storage, config) {
  _achConfig = config || null;
  ensureSchema();

  // ── /achievements — show user's badges ──
  bot.command(['achievements', 'badges'], async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const rawDb = db.getDb();
    const earned = rawDb.prepare(
      'SELECT badge_id, earned_at, reward_cents FROM user_achievements WHERE user_id = ?'
    ).all(u.id);
    const earnedMap = new Map(earned.map(r => [r.badge_id, r]));

    const lines = ['🏆 <b>Мои достижения</b>', ''];
    let totalRewards = 0;
    BADGES.forEach(b => {
      const e = earnedMap.get(b.id);
      if (e) {
        lines.push(`✅ ${b.icon} <b>${escapeHtml(b.title)}</b>`);
        lines.push(`   <i>${escapeHtml(b.desc)}</i>${b.reward_cents ? ' · +' + fmtUsd(b.reward_cents) : ''}`);
        totalRewards += b.reward_cents;
      } else {
        lines.push(`◽ ${b.icon} <i>${escapeHtml(b.title)}</i> — ${escapeHtml(b.desc)}`);
      }
      lines.push('');
    });
    lines.push(`Получено: <b>${earned.length}/${BADGES.length}</b> бейджей · бонусы: <b>${fmtUsd(totalRewards)}</b>`);

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });

    // Re-check on view (in case user just hit a milestone)
    await checkAndAwardBadges(bot, u.id, ctx.chat.id, storage, _achConfig);
  });

  // ── /challenge — daily challenge ──
  bot.command('challenge', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const u = db.ensureUser(ctx.from);
    const today = new Date().toISOString().slice(0, 10);
    const rawDb = db.getDb();
    let row = rawDb.prepare('SELECT * FROM daily_challenges WHERE user_id = ? AND day = ?').get(u.id, today);
    if (!row) {
      // pick random
      const pick = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
      rawDb.prepare(
        "INSERT INTO daily_challenges (user_id, day, challenge_id, target, reward_cents, status) VALUES (?, ?, ?, ?, ?, 'offered')"
      ).run(u.id, today, pick.id, pick.target, pick.reward_cents);
      row = rawDb.prepare('SELECT * FROM daily_challenges WHERE user_id = ? AND day = ?').get(u.id, today);
    }
    const def = CHALLENGES.find(c => c.id === row.challenge_id);
    const metrics = await getUserMetrics(u.id, { config: _achConfig });
    let progress = metrics[def.metric] || 0;
    // For challenges we measure delta from offer time — simpler: just current value
    if (def.metric === 'tasks_done') {
      // count tasks done TODAY only
      progress = rawDb.prepare(
        "SELECT COUNT(DISTINCT claim_id) AS n FROM ad_transactions WHERE user_id = ? AND kind = 'reward' AND date(created_at) = ?"
      ).get(u.id, today)?.n || 0;
    }
    const done = progress >= row.target;

    if (done && row.status !== 'completed') {
      rawDb.prepare(
        "UPDATE daily_challenges SET status='completed', completed_at=datetime('now'), progress=? WHERE user_id=? AND day=?"
      ).run(progress, u.id, today);
      // Phase H: planner cents UPDATE removed
      rawDb.prepare(
        "INSERT INTO ad_transactions (kind, user_id, wallet, amount_cents, note) VALUES ('reward', ?, 'gift', ?, 'daily_challenge')"
      ).run(u.id, row.reward_cents);
      // Credit api Postgres
      try { if (u.tg_id) await creditApi({ tgId: u.tg_id, wallet: 'gift', cents: row.reward_cents, kind: 'daily_challenge', memo: 'daily_challenge' }); } catch (e) { console.warn('[achievements] api credit failed:', e && e.message); }
    }

    const lines = [
      '🏁 <b>Челлендж дня</b>',
      '',
      `<b>${escapeHtml(def.title)}</b>`,
      `Прогресс: <b>${progress}/${row.target}</b>`,
      `Награда: <b>${fmtUsd(row.reward_cents)}</b> в gift-баланс`,
      '',
    ];
    if (done) lines.push('✅ <b>Челлендж выполнен!</b> Бонус начислен.');
    else lines.push('Завтра новый челлендж. Не пропусти!');

    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  console.log('[achievements] /achievements /challenge ready');
}

// Hook to call after key events (paid task, referral signup, campaign create).
async function onKeyEvent(bot, storage, userId, tgChatId, config) {
  try { await checkAndAwardBadges(bot, userId, tgChatId, storage, config || _achConfig); } catch (e) {}
}

const { creditApi } = require('../services/balance-bridge');

module.exports = { setupAchievements, checkAndAwardBadges, onKeyEvent, BADGES };
