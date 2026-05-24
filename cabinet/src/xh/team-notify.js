// Golden Connect: Team notifications — sent to inviter when referral transitions stage.

const { InlineKeyboard } = require('grammy');

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function displayName(u) {
  return u.displayName || u.email || (u.id ? `User${u.id}` : 'Гость');
}

function buildContactBlock(ref) {
  // Builds a detailed contact block with username, link, email, city
  const lines = [];
  const name = displayName(ref);
  lines.push(`👤 <b>${escapeHtml(name)}</b>`);
  if (ref.telegramUsername) {
    lines.push(`📱 @${escapeHtml(ref.telegramUsername.replace(/^@/, ''))}`);
  } else if (ref.telegramUserId) {
    lines.push(`📱 <a href="tg://user?id=${ref.telegramUserId}">Открыть профиль</a>`);
  }
  if (ref.email) lines.push(`📧 ${escapeHtml(ref.email)}`);
  const city = (ref.profile && ref.profile.city) || (ref.preferences && ref.preferences.city) || ref.city;
  if (city) lines.push(`🏙 ${escapeHtml(city)}`);
  return lines.join('\n');
}

const STAGE_MESSAGES = {
  joined: (ref) => {
    const contact = buildContactBlock(ref);
    return `🎉 <b>Новый реферал!</b>

${contact}

Пришёл по вашей ссылке и нажал /start.

🎯 <b>Что делать прямо сейчас:</b>
1️⃣ Напишите ему приветствие — спросите цель прихода
2️⃣ Отправьте свою реф-ссылку с приглашением (/ref)
3️⃣ Покажите тарифы и матрицу (/tariffs)

💡 <b>Шаблон первого сообщения:</b>
<i>"Привет! Рад что зашёл в Golden Connect. Что тебя интересует — заработок на партнёрке или запуск своей рекламы? Расскажу подробно как стартовать."</i>`;
  },
  onboarded: (ref) => {
    const contact = buildContactBlock(ref);
    return `📋 <b>Реферал прошёл онбординг!</b>

${contact}

Завершил стартовую анкету — готов к действиям.

🎯 <b>Что делать:</b>
1️⃣ Помоги выбрать тариф (LAUNCH / BOOST / ROCKET)
2️⃣ Покажи как работает биржа заданий (/jobs)
3️⃣ Расскажи про авто-подписку и систему выплат

💡 <b>Шаблон сообщения:</b>
<i>"Супер что прошёл анкету! Получил свой персональный план? Если есть вопросы по тарифам или партнёрке — пиши, разберём."</i>`;
  },
  engaged: (ref) => {
    const contact = buildContactBlock(ref);
    return `🔥 <b>Реферал стал активным!</b>

${contact}

Делает задания / приглашает свою сеть. Это ВАША конверсия!

🎯 <b>Что делать — КЛЮЧЕВОЙ МОМЕНТ:</b>
1️⃣ Обсудите план роста и апгрейд тарифа
2️⃣ Покажите Matching Bonus и Лидерский пул
3️⃣ Помогите запустить первую рекламную кампанию

💡 <b>Шаблон:</b>
<i>"Вижу ты активно используешь Golden Connect! Время апнуться до BOOST/ROCKET — глубже матрица + Matching. Давай созвонимся на 10 минут?"</i>`;
  },
  converted: (ref) => {
    const contact = buildContactBlock(ref);
    return `✅ <b>ПОБЕДА! Купил тариф!</b> 🏆

${contact}

+1 платный партнёр в твоей структуре. Это твой результат.

🎯 <b>Что делать дальше:</b>
1️⃣ Поздравь лично!
2️⃣ Помоги ему получить первых рефералов — поделись опытом
3️⃣ Добавь в чат партнёров @GOLDEN_CONNECT_AD

💡 <b>Шаблон:</b>
<i>"Поздравляю с тарифом! Теперь ты в матрице. Помогу стартовать — покажу как привести первых 10 партнёров и получить статус PARTNER."</i>`;
  },
  dormant: (ref) => {
    const contact = buildContactBlock(ref);
    return `⚠️ <b>Реферал молчит 7 дней</b>

${contact}

Последняя активность больше недели назад.

🎯 <b>Как вернуть:</b>
1️⃣ Напиши личное сообщение (НЕ шаблон)
2️⃣ Спроси что осталось непонятным после онбординга
3️⃣ Предложи конкретную возможность — биржу, партнёрку или челлендж

💡 <b>Шаблон:</b>
<i>"Привет! Давно не виделись в Golden Connect. На бирже появились новые задания и стартует новый челлендж недели. Хочешь посмотреть что подойдёт тебе?"</i>`;
  },
  lost: (ref) => {
    const contact = buildContactBlock(ref);
    return `😔 <b>Реферал не активен 30 дней</b>

${contact}

🎯 <b>Последний шанс:</b>
1️⃣ Отправь что-то ценное — кейс другого партнёра, новый формат заданий
2️⃣ Личное предложение (бонус, помощь со стартом)
3️⃣ Если молчит — отпусти, сосредоточься на активных

💡 <b>Шаблон:</b>
<i>"Привет! Вышли крупные обновления Golden Connect — новый Лидерский пул, апгрейд тарифа со скидкой. Если хочешь — расскажу подробнее за 5 минут."</i>`;
  }
};

async function notifyInviterStageChange(bot, storage, refUserId, oldStage, newStage) {
  try {
    const state = typeof storage.__readStateSnapshot === 'function' ? storage.__readStateSnapshot() : null;
    // Use findWebUserById for safe read
    const ref = storage.findWebUserById ? storage.findWebUserById(refUserId) : null;
    if (!ref) return false;
    const inviterId = ref.referredByUserId;
    if (!inviterId) return false;
    const inviter = storage.findWebUserById(inviterId);
    if (!inviter || !inviter.telegramUserId) return false;
    // Check snooze
    if (storage.isSnoozed && storage.isSnoozed(inviterId, ref)) return false;
    // Only send message for meaningful transitions
    const msgBuilder = STAGE_MESSAGES[newStage];
    if (!msgBuilder) return false;
    const kb = new InlineKeyboard()
      .text('👤 Открыть карточку', `team_card:${ref.id}`).row()
      .text('👥 Моя команда', 'xh_team');
    // Add direct TG link button if username available
    if (ref.telegramUsername) {
      kb.url('💬 Написать в Telegram', `https://t.me/${ref.telegramUsername.replace(/^@/, '')}`).row();
    } else if (ref.telegramUserId) {
      kb.url('💬 Написать в Telegram', `tg://user?id=${ref.telegramUserId}`).row();
    }
    await bot.api.sendMessage(inviter.telegramUserId, msgBuilder(ref), {
      parse_mode: 'HTML',
      reply_markup: kb,
      disable_web_page_preview: true,
    });
    // Sync badges, maybe send new badge notification
    if (newStage === 'converted' && storage.syncBadges) {
      const { newBadges } = storage.syncBadges(inviterId);
      if (newBadges && newBadges.length) {
        const lines = ['🏆 <b>Новые достижения!</b>', ''];
        newBadges.forEach((b) => lines.push(`${b.icon} <b>${b.title}</b> — ${b.desc}`));
        try {
          await bot.api.sendMessage(inviter.telegramUserId, lines.join('\n'), { parse_mode: 'HTML' });
        } catch (e) {}
      }
    }
    return true;
  } catch (e) {
    console.error('[team_notify_error]', e && e.message);
    return false;
  }
}

module.exports = { notifyInviterStageChange };
