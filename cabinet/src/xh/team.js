// Golden Connect: Team CRM module.
// Commands: /team
// Reply button: "👥 Команда"
// Callbacks: xh_team, team_list, team_card:<id>, team_note:<id>, team_snooze:<id>:<days>, team_contacted:<id>,
//            team_write:<id>, team_next, team_funnel, team_tip, team_badges

const { InlineKeyboard } = require('grammy');
const { generateTeamTip } = require('./team-tips');

const STAGE_LABELS = {
  invited:   { emoji: '🔵', label: 'Приглашён' },
  joined:    { emoji: '🟡', label: 'Зашёл' },
  onboarded: { emoji: '🟢', label: 'Онбординг' },
  engaged:   { emoji: '🔥', label: 'Активный' },
  converted: { emoji: '✅', label: 'В компании' },
  dormant:   { emoji: '⚠️', label: 'Уснул' },
  lost:      { emoji: '⚫', label: 'Отвалился' },
};

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function trunc(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function relativeTime(iso) {
  if (!iso) return 'никогда';
  const diff = Date.now() - Date.parse(iso);
  if (isNaN(diff)) return '—';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн назад`;
  const mo = Math.floor(d / 30);
  return `${mo} мес назад`;
}

function displayName(u) {
  return u.displayName || u.email || (u.id ? `User${u.id}` : 'Гость');
}

function funnelBar(value, total) {
  if (!total) return '░░░░░░░░░░ 0%';
  const pct = Math.round((value / total) * 100);
  const filled = Math.round(pct / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled) + ` ${pct}%`;
}

function ensureInviter(ctx, storage) {
  try { return storage.ensureWebUserFromTelegram(ctx.from); }
  catch (e) { return null; }
}

function contactLine(r) {
  const name = displayName(r);
  const usernamePart = r.telegramUsername ? ` @${String(r.telegramUsername).replace(/^@/, '')}` : '';
  return `${escapeHtml(name)}${escapeHtml(usernamePart)}`;
}

async function sendTeamOverview(ctx, storage) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return ctx.reply('Не удалось получить ваш профиль.');
  const stats = storage.getTeamStats(inviter.id);
  const funnel = storage.getTeamFunnel(inviter.id);
  const allRefs = storage.listInviteeReferrals(inviter.id);
  const nextActions = storage.getNextActions(inviter.id).slice(0, 3);
  const { newBadges } = storage.syncBadges(inviter.id);

  const botUsername = (ctx.me && ctx.me.username) || 'GoldenConnect_bizbot';
  const refLink = `https://t.me/${botUsername}?start=ref_${inviter.referralCode || ''}`;

  const lines = ['👥 <b>Моя команда Golden Connect</b>', ''];
  if (stats.total === 0) {
    lines.push('🎯 У вас пока 0 рефералов — самое время пригласить первых!');
    lines.push('');
    lines.push('Ваша реф-ссылка:');
    lines.push(`<code>${escapeHtml(refLink)}</code>`);
    lines.push('');
    lines.push('Отправьте её друзьям — они перейдут в бот, и вы сразу получите уведомление!');
    const kb = new InlineKeyboard()
      .url('📤 Поделиться ссылкой', `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Присоединяйтесь к Golden Connect!')}`).row()
      .text('💡 Совет дня', 'team_tip');
    return ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb, disable_web_page_preview: true });
  }

  lines.push('📊 <b>Статистика:</b>');
  lines.push(`Всего рефералов: <b>${stats.total}</b>`);
  if (stats.joined)    lines.push(`🟡 Только зашли: <b>${stats.joined}</b>`);
  if (stats.onboarded) lines.push(`🟢 Онбординг: <b>${stats.onboarded}</b>`);
  if (stats.engaged)   lines.push(`🔥 Активные: <b>${stats.engaged}</b>`);
  if (stats.converted) lines.push(`✅ В компании: <b>${stats.converted}</b>`);
  if (stats.dormant)   lines.push(`⚠️ Уснули: <b>${stats.dormant}</b>`);
  if (stats.lost)      lines.push(`⚫ Отвалились: <b>${stats.lost}</b>`);
  lines.push('');
  lines.push('<b>Воронка конверсии:</b>');
  lines.push(`Зашли   <code>${funnelBar(funnel.joined, funnel.total)}</code>`);
  lines.push(`Онбрд   <code>${funnelBar(funnel.onboarded, funnel.total)}</code>`);
  lines.push(`Активны <code>${funnelBar(funnel.engaged, funnel.total)}</code>`);
  lines.push(`Компан  <code>${funnelBar(funnel.converted, funnel.total)}</code>`);

  // Inline compact list (top 8 sorted by stage priority)
  if (allRefs.length) {
    allRefs.sort((a, b) => {
      const order = { engaged: 1, joined: 2, onboarded: 3, converted: 4, dormant: 5, lost: 6, invited: 7 };
      const sa = order[a.referralStage] || 9;
      const sb = order[b.referralStage] || 9;
      if (sa !== sb) return sa - sb;
      return (Date.parse(b.lastActivityAt || 0) - Date.parse(a.lastActivityAt || 0));
    });
    lines.push('');
    lines.push(`👥 <b>Ваша команда (${allRefs.length}):</b>`);
    allRefs.slice(0, 8).forEach((r, i) => {
      const s = STAGE_LABELS[r.referralStage] || STAGE_LABELS.joined;
      const last = r.lastActivityAt ? relativeTime(r.lastActivityAt) : '—';
      lines.push(`${i + 1}. ${s.emoji} <b>${contactLine(r)}</b>`);
      lines.push(`   ${s.label} · ${last}`);
    });
    if (allRefs.length > 8) {
      lines.push(`<i>...и ещё ${allRefs.length - 8} (нажмите "Все рефералы")</i>`);
    }
  }

  if (nextActions.length) {
    lines.push('');
    lines.push('🎯 <b>Нужно связаться:</b>');
    nextActions.forEach((a) => {
      lines.push(`• ${contactLine(a.ref)} — ${escapeHtml(a.reason)}`);
    });
  }

  if (newBadges && newBadges.length) {
    lines.push('');
    lines.push('🎉 <b>Новые достижения:</b>');
    newBadges.forEach((b) => lines.push(`${b.icon} ${b.title} — ${b.desc}`));
  }

  const kb = new InlineKeyboard();
  // First 5 referrals as quick-access buttons
  allRefs.slice(0, 5).forEach((r) => {
    const s = STAGE_LABELS[r.referralStage] || STAGE_LABELS.joined;
    kb.text(`${s.emoji} ${trunc(contactLine(r), 30)}`, `team_card:${r.id}`).row();
  });
  kb.text('📋 Все', 'team_list')
    .text('🎯 Связаться', 'team_next').row()
    .text('📊 Воронка', 'team_funnel')
    .text('💡 Совет', 'team_tip').row()
    .text('🏆 Достижения', 'team_badges');

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendReferralsList(ctx, storage) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const refs = storage.listInviteeReferrals(inviter.id);
  if (!refs.length) {
    return ctx.reply('У вас пока нет рефералов. Поделитесь ссылкой через /ref!');
  }
  // Sort: active first, then by last activity
  refs.sort((a, b) => {
    const stageOrder = { engaged: 1, onboarded: 2, joined: 3, converted: 4, dormant: 5, lost: 6, invited: 7 };
    const sa = stageOrder[a.referralStage] || 9;
    const sb = stageOrder[b.referralStage] || 9;
    if (sa !== sb) return sa - sb;
    return (Date.parse(b.lastActivityAt || 0) - Date.parse(a.lastActivityAt || 0));
  });
  const lines = [`📋 <b>Ваши ${refs.length} рефералов</b>`, ''];
  refs.slice(0, 20).forEach((r) => {
    const s = STAGE_LABELS[r.referralStage] || STAGE_LABELS.joined;
    const time = relativeTime(r.lastActivityAt);
    lines.push(`${s.emoji} <b>${escapeHtml(displayName(r))}</b>`);
    lines.push(`   ${s.label} · ${time}`);
  });
  if (refs.length > 20) lines.push(`\n<i>...и ещё ${refs.length - 20}</i>`);

  const kb = new InlineKeyboard();
  refs.slice(0, 10).forEach((r) => {
    const s = STAGE_LABELS[r.referralStage] || STAGE_LABELS.joined;
    kb.text(`${s.emoji} ${trunc(displayName(r), 30)}`, `team_card:${r.id}`).row();
  });
  kb.text('🏠 Меню команды', 'xh_team');

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendReferralCard(ctx, storage, refId) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const ref = storage.getReferralCard(inviter.id, refId);
  if (!ref) return ctx.reply('Реферал не найден или не ваш.');
  const s = STAGE_LABELS[ref.referralStage] || STAGE_LABELS.joined;
  const joined = ref.createdAt ? relativeTime(ref.createdAt) : '—';
  const lastAct = relativeTime(ref.lastActivityAt);
  const lastAction = ref.lastAction ? escapeHtml(trunc(ref.lastAction, 60)) : '—';
  const note = ref.inviterNotes && ref.inviterNotes[String(inviter.id)] || '';
  const snoozeUntil = ref.inviterSnoozeUntil && ref.inviterSnoozeUntil[String(inviter.id)];
  const snoozeActive = snoozeUntil && Date.parse(snoozeUntil) > Date.now();

  const lines = [
    `👤 <b>${escapeHtml(displayName(ref))}</b>`,
  ];
  if (ref.telegramUsername) {
    lines.push(`📱 @${escapeHtml(ref.telegramUsername.replace(/^@/, ''))}`);
  } else if (ref.telegramUserId) {
    lines.push(`📱 ID: <code>${ref.telegramUserId}</code>`);
  }
  if (ref.email) lines.push(`📧 ${escapeHtml(ref.email)}`);
  const city = (ref.profile && ref.profile.city) || '';
  if (city) lines.push(`🏙 ${escapeHtml(city)}`);
  lines.push(
    `📅 Присоединился: ${joined}`,
    `📊 Стадия: ${s.emoji} <b>${s.label}</b>`,
    `💬 Последнее действие: ${lastAct}`,
    `   (${lastAction})`
  );

  // History (last 5)
  const history = Array.isArray(ref.activityLog) ? ref.activityLog.slice(-5).reverse() : [];
  if (history.length) {
    lines.push('', '📜 <b>История (5 последних):</b>');
    history.forEach((h) => {
      lines.push(`• ${relativeTime(h.at)} — ${escapeHtml(trunc(h.action, 50))}`);
    });
  }

  // Health courses of this referral (max info for inviter)
  try {
    const db = require('../planner/db/database');
    if (ref.telegramUserId) {
      const plannerUser = db.getUserByTgId ? db.getUserByTgId(ref.telegramUserId) : null;
      if (plannerUser) {
        const courses = db.getDb().prepare(`
          SELECT * FROM health_courses WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC
        `).all(plannerUser.id);
        if (courses.length) {
          lines.push('', '💊 <b>Активные стартовая анкета:</b>');
          for (const c of courses) {
            const total = db.getDb().prepare('SELECT COUNT(*) as c FROM health_course_log WHERE course_id = ?').get(c.id).c || 0;
            const taken = db.getDb().prepare("SELECT COUNT(*) as c FROM health_course_log WHERE course_id = ? AND status = 'taken'").get(c.id).c || 0;
            const dayNum = Math.floor((Date.now() - Date.parse(c.start_date)) / 86400000) + 1;
            const pct = total ? Math.round((taken / total) * 100) : 0;
            lines.push(`${c.product_emoji || '💊'} <b>${escapeHtml(c.product_name)}</b> · день ${dayNum}/${c.duration_days} · ${pct}%`);
          }
          // Last metrics
          const lastMetric = db.getDb().prepare(`
            SELECT * FROM health_metrics WHERE user_id = ? ORDER BY date DESC LIMIT 1
          `).get(plannerUser.id);
          if (lastMetric) {
            const parts = [];
            if (lastMetric.sleep) parts.push(`😴 ${lastMetric.sleep}/10`);
            if (lastMetric.energy) parts.push(`⚡ ${lastMetric.energy}/10`);
            if (lastMetric.mood) parts.push(`😊 ${lastMetric.mood}/10`);
            if (parts.length) {
              lines.push(`🌡 Самочувствие (${lastMetric.date}): ${parts.join(' · ')}`);
            }
          }
          lines.push('');
          lines.push('<i>💡 Реф реально использует продукты — отличный сигнал для разговора про компанию!</i>');
        }
      }
    }
  } catch (e) {
    console.error('[team_card_health_block]', e && e.message);
  }

  // Stage history
  const stageHist = Array.isArray(ref.referralStageHistory) ? ref.referralStageHistory.slice(-5) : [];
  if (stageHist.length) {
    lines.push('', '📈 <b>Стадии:</b>');
    stageHist.forEach((h) => {
      const sh = STAGE_LABELS[h.stage] || { emoji: '•', label: h.stage };
      lines.push(`${sh.emoji} ${sh.label} — ${relativeTime(h.at)}`);
    });
  }

  // Next-step hint
  lines.push('', '🎯 <b>Следующий шаг:</b>');
  if (ref.referralStage === 'converted') {
    lines.push('✅ Уже в компании! Поддерживайте отношения.');
  } else if (ref.referralStage === 'engaged') {
    lines.push('Предложите созвониться и обсудить условия компании.');
  } else if (ref.referralStage === 'onboarded') {
    lines.push('Пригласите посмотреть эфир или задать вопрос.');
  } else if (ref.referralStage === 'joined') {
    lines.push('Напишите приветствие, спросите что интересует.');
  } else if (ref.referralStage === 'dormant') {
    lines.push('⚠️ Тишина. Попробуйте вернуть через ценный контент.');
  } else {
    lines.push('Поздоровайтесь и расскажите про Golden Connect.');
  }

  if (note) {
    lines.push('', '📝 <b>Заметки:</b>');
    lines.push(escapeHtml(note));
  }
  if (snoozeActive) {
    lines.push('', `🔕 Отложено до ${relativeTime(snoozeUntil).replace('назад', '')}`);
  }

  const kb = new InlineKeyboard()
    .text('💬 Написать', `team_write:${ref.id}`)
    .text('✅ Связался', `team_contacted:${ref.id}`).row()
    .text('📝 Заметка', `team_note:${ref.id}`)
    .text('🔕 Отложить', `team_snooze:${ref.id}`).row()
    .text('← К списку', 'team_list');

  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendNextActions(ctx, storage) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const actions = storage.getNextActions(inviter.id);
  if (!actions.length) {
    return ctx.reply('🎉 Все на связи! Нет срочных дел в команде.', {
      reply_markup: new InlineKeyboard().text('🏠 Меню команды', 'xh_team'),
    });
  }
  const lines = ['🎯 <b>Нужно связаться</b>', ''];
  const urgent = actions.filter((a) => a.priority >= 8);
  const normal = actions.filter((a) => a.priority >= 5 && a.priority < 8);
  const low    = actions.filter((a) => a.priority < 5);

  if (urgent.length) {
    lines.push('🔥 <b>СРОЧНО:</b>');
    urgent.slice(0, 5).forEach((a) => {
      lines.push(`• ${escapeHtml(displayName(a.ref))} — ${escapeHtml(a.reason)}`);
    });
    lines.push('');
  }
  if (normal.length) {
    lines.push('📋 <b>Сегодня:</b>');
    normal.slice(0, 5).forEach((a) => {
      lines.push(`• ${escapeHtml(displayName(a.ref))} — ${escapeHtml(a.reason)}`);
    });
    lines.push('');
  }
  if (low.length) {
    lines.push('💤 <b>По возможности:</b>');
    low.slice(0, 5).forEach((a) => {
      lines.push(`• ${escapeHtml(displayName(a.ref))} — ${escapeHtml(a.reason)}`);
    });
  }
  const kb = new InlineKeyboard();
  actions.slice(0, 8).forEach((a) => {
    kb.text(`👤 ${trunc(displayName(a.ref), 30)}`, `team_card:${a.ref.id}`).row();
  });
  kb.text('🏠 Меню команды', 'xh_team');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendFunnel(ctx, storage) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const f = storage.getTeamFunnel(inviter.id);
  const lines = ['📊 <b>Воронка конверсии</b>', ''];
  lines.push(`Всего рефералов: <b>${f.total}</b>`);
  lines.push('');
  lines.push(`Зашли   <code>${funnelBar(f.joined, f.total)}</code>`);
  lines.push(`Онбрд   <code>${funnelBar(f.onboarded, f.total)}</code>`);
  lines.push(`Активны <code>${funnelBar(f.engaged, f.total)}</code>`);
  lines.push(`Компан  <code>${funnelBar(f.converted, f.total)}</code>`);
  lines.push('');
  if (f.total > 0) {
    const rate = Math.round((f.converted / f.total) * 100);
    lines.push(`🎯 Ваш ROI: <b>${rate}%</b> рефералов дошло до компании`);
  }
  const kb = new InlineKeyboard().text('🏠 Меню команды', 'xh_team');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendTip(ctx, storage, config, opts = {}) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  try { await ctx.replyWithChatAction('typing'); } catch (e) {}
  const tip = await generateTeamTip(storage, inviter, config, opts).catch(() => null);
  const lines = ['💡 <b>Совет дня — ваш AI-секретарь</b>', ''];
  if (tip) {
    lines.push(escapeHtml(tip));
  } else {
    lines.push('Пригласите первых рефералов через /ref — и я буду давать персональные советы по работе с каждым.');
  }
  const kb = new InlineKeyboard()
    .text('🔄 Другой совет', 'team_tip_new')
    .text('🏠 Меню команды', 'xh_team');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

async function sendBadges(ctx, storage) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const { all } = storage.syncBadges(inviter.id);
  const ALL_BADGES = Object.values(storage.BADGES || {});
  const earned = new Set((all || []).map((b) => b.id));

  const lines = ['🏆 <b>Достижения</b>', ''];
  ALL_BADGES.forEach((b) => {
    if (earned.has(b.id)) {
      lines.push(`${b.icon} <b>${b.title}</b> ✓`);
      lines.push(`   ${b.desc}`);
    } else {
      lines.push(`🔒 <b>${b.title}</b>`);
      lines.push(`   ${b.desc}`);
    }
    lines.push('');
  });
  lines.push(`Получено: <b>${earned.size}</b> / ${ALL_BADGES.length}`);
  const kb = new InlineKeyboard().text('🏠 Меню команды', 'xh_team');
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

// Write action — gives user 2 options: open TG profile OR send via bot
async function sendWriteOptions(ctx, storage, refId) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const ref = storage.getReferralCard(inviter.id, refId);
  if (!ref) return ctx.reply('Реферал не найден.');
  const lines = [
    `💬 <b>Написать ${escapeHtml(displayName(ref))}</b>`,
    '',
    'Выберите как связаться:',
    '',
    '1️⃣ <b>Через Telegram</b> — откроется профиль реф, отправите сообщение лично',
    '',
    '2️⃣ <b>Через нашего бота</b> — ваше сообщение будет доставлено реф через Golden Connect Секретаря с пометкой "от вашего инвайтера"',
  ];
  const kb = new InlineKeyboard();
  const tgUser = ref.telegramUsername;
  const tgId = ref.telegramUserId;
  if (tgUser) {
    kb.url(`📱 @${tgUser}`, `https://t.me/${tgUser.replace(/^@/, '')}`).row();
  } else if (tgId) {
    kb.url(`📱 Открыть профиль`, `tg://user?id=${tgId}`).row();
  }
  kb.text('💬 Через бота', `team_send:${ref.id}`).row();
  kb.text('← Назад к карточке', `team_card:${ref.id}`);
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML', reply_markup: kb });
}

// Snooze prompt — offer 3/7/14/30 days
async function sendSnoozeOptions(ctx, storage, refId) {
  const inviter = ensureInviter(ctx, storage);
  if (!inviter) return;
  const ref = storage.getReferralCard(inviter.id, refId);
  if (!ref) return;
  const kb = new InlineKeyboard()
    .text('3 дня', `team_snz:${refId}:3`).text('7 дней', `team_snz:${refId}:7`).row()
    .text('14 дней', `team_snz:${refId}:14`).text('30 дней', `team_snz:${refId}:30`).row()
    .text('❌ Отмена', `team_card:${refId}`);
  await ctx.reply(`🔕 <b>Отложить напоминание про ${escapeHtml(displayName(ref))}</b>\n\nНа сколько?`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

// Pending sessions for notes and messages (inviterId → { type, refId })
const pendingInput = new Map();

function setupTeam(bot, storage, config) {
  // /team command
  bot.command('team', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendTeamOverview(ctx, storage);
  });

  // Reply keyboard buttons
  bot.hears('👥 Команда', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendTeamOverview(ctx, storage);
  });
  bot.hears('💡 Совет', async (ctx) => {
    if (ctx.chat && ctx.chat.type !== 'private') return;
    await sendTip(ctx, storage, config);
  });

  // Callbacks
  bot.callbackQuery('xh_team', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendTeamOverview(ctx, storage);
  });
  bot.callbackQuery('team_list', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendReferralsList(ctx, storage);
  });
  bot.callbackQuery('team_next', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendNextActions(ctx, storage);
  });
  bot.callbackQuery('team_funnel', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendFunnel(ctx, storage);
  });
  bot.callbackQuery('team_tip', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendTip(ctx, storage, config);
  });
  bot.callbackQuery('team_tip_new', async (ctx) => {
    try { await ctx.answerCallbackQuery({ text: '🔄 Генерирую новый...' }); } catch (e) {}
    await sendTip(ctx, storage, config, { force: true });
  });
  bot.callbackQuery('team_badges', async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendBadges(ctx, storage);
  });
  bot.callbackQuery(/^team_card:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendReferralCard(ctx, storage, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^team_write:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendWriteOptions(ctx, storage, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^team_send:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const refId = Number(ctx.match[1]);
    const inviter = ensureInviter(ctx, storage);
    pendingInput.set(ctx.from.id, { type: 'message', refId });
    const ref = storage.getReferralCard(inviter.id, refId);
    await ctx.reply(
      `💬 Напишите сообщение для <b>${escapeHtml(displayName(ref))}</b>.\n\n` +
      `Оно будет доставлено через Golden Connect Секретаря с пометкой "от @${ctx.from.username || inviter.displayName || 'инвайтера'}".\n\n` +
      `Для отмены напишите /cancel`,
      { parse_mode: 'HTML' }
    );
  });
  bot.callbackQuery(/^team_note:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    const refId = Number(ctx.match[1]);
    pendingInput.set(ctx.from.id, { type: 'note', refId });
    const inviter = ensureInviter(ctx, storage);
    const ref = storage.getReferralCard(inviter.id, refId);
    const existing = storage.getInviterNote(inviter.id, refId);
    await ctx.reply(
      `📝 <b>Заметка про ${escapeHtml(displayName(ref))}</b>\n\n` +
      (existing ? `Текущая: <i>${escapeHtml(existing)}</i>\n\n` : '') +
      'Отправьте новый текст заметки:\n\n<i>/cancel — отмена</i>',
      { parse_mode: 'HTML' }
    );
  });
  bot.callbackQuery(/^team_snooze:(\d+)$/, async (ctx) => {
    try { await ctx.answerCallbackQuery(); } catch (e) {}
    await sendSnoozeOptions(ctx, storage, Number(ctx.match[1]));
  });
  bot.callbackQuery(/^team_snz:(\d+):(\d+)$/, async (ctx) => {
    const refId = Number(ctx.match[1]);
    const days = Number(ctx.match[2]);
    const inviter = ensureInviter(ctx, storage);
    if (!inviter) return ctx.answerCallbackQuery({ text: 'Ошибка', show_alert: true });
    const until = new Date(Date.now() + days * 86400000).toISOString();
    storage.setInviterSnooze(inviter.id, refId, until);
    try { await ctx.answerCallbackQuery({ text: `🔕 Отложено на ${days} дн.` }); } catch (e) {}
    await sendReferralCard(ctx, storage, refId);
  });
  bot.callbackQuery(/^team_contacted:(\d+)$/, async (ctx) => {
    const refId = Number(ctx.match[1]);
    const inviter = ensureInviter(ctx, storage);
    if (!inviter) return;
    storage.markInviterContacted(inviter.id, refId);
    try { await ctx.answerCallbackQuery({ text: '✅ Отмечено' }); } catch (e) {}
    await sendReferralCard(ctx, storage, refId);
  });

  // Handle pending input for notes / messages
  bot.on('message:text', async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return next();
    const p = pendingInput.get(ctx.from.id);
    if (!p) return next();
    const text = String(ctx.message.text || '').trim();
    if (text === '/cancel') {
      pendingInput.delete(ctx.from.id);
      return ctx.reply('Отменено.');
    }
    if (text.startsWith('/')) return next(); // don't eat other commands
    pendingInput.delete(ctx.from.id);
    const inviter = ensureInviter(ctx, storage);
    if (!inviter) return;
    if (p.type === 'note') {
      storage.setInviterNote(inviter.id, p.refId, text);
      await ctx.reply('✅ Заметка сохранена.');
      await sendReferralCard(ctx, storage, p.refId);
      return;
    }
    if (p.type === 'message') {
      const ref = storage.getReferralCard(inviter.id, p.refId);
      if (!ref || !ref.telegramUserId) {
        return ctx.reply('⚠️ Не удалось найти TG-контакт реферала.');
      }
      const senderName = ctx.from.username ? '@' + ctx.from.username : (inviter.displayName || 'Инвайтер');
      try {
        await bot.api.sendMessage(ref.telegramUserId,
          `💌 <b>Сообщение от ${escapeHtml(senderName)}</b>\n\n${escapeHtml(text)}\n\n<i>— через Golden Connect Секретаря</i>`,
          { parse_mode: 'HTML' }
        );
        storage.markInviterContacted(inviter.id, p.refId);
        await ctx.reply('✅ Сообщение доставлено.');
      } catch (e) {
        await ctx.reply('⚠️ Не удалось доставить: ' + (e && e.message || 'unknown'));
      }
      return;
    }
    return next();
  });
}

module.exports = { setupTeam, STAGE_LABELS };
