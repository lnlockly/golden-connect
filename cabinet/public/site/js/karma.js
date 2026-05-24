/* /karma page — leaderboard + my stats + rules */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
  }); }
  function fmt(n) { n = Number(n) || 0; return n.toLocaleString('ru-RU'); }

  function nextSundayMsk() {
    var now = new Date();
    var msk = new Date(now.getTime() + 3 * 3600 * 1000);
    var dow = msk.getUTCDay();
    var daysUntilSunday = (7 - dow) % 7;
    if (daysUntilSunday === 0 && msk.getUTCHours() >= 20) daysUntilSunday = 7;
    var target = new Date(msk);
    target.setUTCDate(msk.getUTCDate() + daysUntilSunday);
    target.setUTCHours(20, 0, 0, 0);
    return new Date(target.getTime() - 3 * 3600 * 1000);
  }

  function formatCountdown(targetDate) {
    var diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return 'розыгрыш скоро';
    var days = Math.floor(diff / 86400000);
    var hrs = Math.floor((diff % 86400000) / 3600000);
    var min = Math.floor((diff % 3600000) / 60000);
    return days + 'д ' + hrs + 'ч ' + min + 'мин';
  }

  var KIND_LABELS = {
    login: 'Заход в кабинет',
    login_streak_7: 'Стрик 7 дней',
    login_streak_30: 'Стрик 30 дней',
    chat_message: 'Сообщение в чат',
    onboarding_done: 'Анкета пройдена',
    profile_filled_100: 'Профиль 100%',
    task_complete: 'Задание выполнено',
    task_first: 'Первое задание',
    tool_use: 'Использован инструмент',
    tool_first: 'Первый раз тулза',
    link_create: 'Создана короткая ссылка',
    bio_post: 'Пост в Bio',
    ad_submit: 'Подана реклама',
    ad_first: 'Первая реклама',
    ad_100_views: 'Реклама — 100 показов',
    ad_1000_views: 'Реклама — 1000 показов',
    ad_topup_per_dollar: 'Пополнение рекламы',
    marketplace_list: 'Товар выложен',
    marketplace_first_sale: 'Первая продажа на маркетплейсе',
    referral_joined: 'Реферал зарегистрирован',
    referral_bought: 'Реферал купил тариф',
    referral_ad_submit: 'Реферал подал рекламу',
    referral_l2_joined: 'L2 реферал',
    self_buy_tariff: 'Покупка тарифа',
    self_upgrade: 'Апгрейд тарифа',
    event_subscribe: 'Подписка на эфир',
    event_attend: 'Посещён эфир',
  };

  window.loadKarmaPage = async function () {
    var root = $('karmaContent') || $('karma_pageContent');
    if (!root) return;
    root.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">⚡ Загружаю карму...</div>';

    var resMe, resTop, resRules;
    try {
      resMe = await fetch('/cabinet/api/karma/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    } catch (e) { resMe = null; }
    try {
      resTop = await fetch('/cabinet/api/karma/leaderboard?limit=50', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    } catch (e) { resTop = null; }
    try {
      resRules = await fetch('/cabinet/api/karma/rules', { credentials: 'same-origin' }).then(function (r) { return r.json(); });
    } catch (e) { resRules = null; }

    var html = '';

    // Hero with my stats + raffle countdown
    var me = (resMe && resMe.ok) ? resMe : { week_points: 0, total_points: 0, week_rank: null };
    var nextRaffle = nextSundayMsk();
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(255,46,151,0.08),rgba(177,74,237,0.08));border:1px solid rgba(255,46,151,0.25);margin-bottom:18px;padding:24px">' +
      '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">' +
        '<div style="font-size:64px">⚡</div>' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-size:11px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase">Моя карма за неделю</div>' +
          '<div style="font-family:Orbitron,monospace;font-size:42px;font-weight:900;color:#FF2E97;line-height:1.1">' + fmt(me.week_points) + ' <span style="font-size:18px;color:#94a3b8">пт</span></div>' +
          '<div style="font-size:13px;color:#cbd5e1;margin-top:4px">Всего за всё время: <strong>' + fmt(me.total_points) + ' пт</strong></div>' +
        '</div>' +
        (me.week_rank ?
          '<div style="text-align:center;padding:14px 20px;background:rgba(255,46,151,0.1);border-radius:14px;border:1px solid rgba(255,46,151,0.3)">' +
            '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Мой ранг</div>' +
            '<div style="font-family:Orbitron,monospace;font-size:36px;font-weight:900;color:#FF2E97">#' + me.week_rank + '</div>' +
          '</div>'
        : '') +
        '<div style="text-align:center;padding:14px 20px;background:rgba(0,212,255,0.1);border-radius:14px;border:1px solid rgba(0,212,255,0.3)">' +
          '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase">До розыгрыша</div>' +
          '<div style="font-family:Orbitron,monospace;font-size:18px;font-weight:800;color:#00D4FF" id="karma-countdown">' + formatCountdown(nextRaffle) + '</div>' +
          '<div style="font-size:11px;color:#cbd5e1;margin-top:2px">воскресенье 20:00 МСК</div>' +
        '</div>' +
      '</div>' +
      '<div style="margin-top:14px;padding:14px;background:rgba(0,0,0,0.25);border-radius:10px;font-size:13px;color:#cbd5e1;line-height:1.6">' +
        '<strong style="color:#fbbf24">🎁 Призовой фонд: $100</strong> делится между топ-10 в воскресенье 20:00 МСК.<br>' +
        'Распределение: 1м=$30, 2м=$20, 3м=$15, 4м=$10, 5м=$8, 6м=$6, 7м=$4, 8м=$3, 9м=$2, 10м=$2.' +
      '</div>' +
    '</div>';

    // Streak section
    if (resMe && resMe.ok) {
      const streak = resMe.streak || 0;
      const nextM = resMe.next_milestone;
      const reward = resMe.milestone_reward;
      const daysLeft = resMe.days_to_milestone;
      const pct = nextM ? Math.min(100, Math.round((streak / nextM) * 100)) : 100;
      const fireCount = streak >= 30 ? '🔥🔥🔥' : streak >= 14 ? '🔥🔥' : streak >= 7 ? '🔥' : (streak > 0 ? '✨' : '💤');
      html += '<div class="cab-card" style="margin-bottom:18px;padding:18px;border:1px solid rgba(251,146,60,0.25);background:linear-gradient(135deg,rgba(251,146,60,0.06),rgba(255,46,151,0.04))">' +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<div style="font-size:36px">' + fireCount + '</div>' +
          '<div style="flex:1;min-width:200px">' +
            '<div style="font-size:11px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase">Серия дней подряд</div>' +
            '<div style="font-family:Orbitron,monospace;font-size:30px;font-weight:900;color:#fb923c">' + streak + ' <span style="font-size:14px;color:#94a3b8">дн.</span></div>' +
            (nextM ? '<div style="font-size:13px;color:#cbd5e1;margin-top:2px">До <strong style="color:#fb923c">+' + reward + ' карма</strong> осталось ' + daysLeft + ' дн.</div>' : '<div style="font-size:13px;color:#cbd5e1;margin-top:2px">+50 карма каждый день — ты в Зале славы 30+!</div>') +
          '</div>' +
          (nextM ? '<div style="flex:1 1 100%;margin-top:8px"><div style="height:8px;background:rgba(0,0,0,0.3);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#fb923c,#ff2e97);transition:width .3s"></div></div></div>' : '') +
        '</div>' +
        '<div style="margin-top:12px;font-size:12px;color:#94a3b8">Бонусы: 7 дней → +200, 14 → +500, 30 → +1500. После 30 — +50 каждый следующий день. Серия сбрасывается после пропуска 36+ часов.</div>' +
      '</div>';
    }

    // Leaderboard
    var top = (resTop && resTop.ok && resTop.items) ? resTop.items : [];
    html += '<div class="cab-card" style="margin-bottom:18px">' +
      '<h3 style="margin:0 0 14px;color:#fff">🏆 Топ-50 этой недели</h3>';
    if (!top.length) {
      html += '<div style="text-align:center;padding:30px;color:#94a3b8">Пока никто не набрал кармы. Будь первым!</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:6px">';
      top.forEach(function (u) {
        var medal = u.rank === 1 ? '🥇' : u.rank === 2 ? '🥈' : u.rank === 3 ? '🥉' : '#' + u.rank;
        var prize = u.rank === 1 ? '$30' : u.rank === 2 ? '$20' : u.rank === 3 ? '$15'
          : u.rank === 4 ? '$10' : u.rank === 5 ? '$8' : u.rank === 6 ? '$6'
          : u.rank === 7 ? '$4' : u.rank === 8 ? '$3' : u.rank <= 10 ? '$2' : '—';
        var name = u.tg_username ? '@' + esc(u.tg_username) : (u.first_name ? esc(u.first_name) : 'User #' + u.user_id);
        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:rgba(0,0,0,0.2)">' +
          '<div style="font-size:20px;width:48px;text-align:center">' + medal + '</div>' +
          '<div style="flex:1;color:#fff;font-weight:600">' + name + '</div>' +
          '<div style="font-family:Orbitron,monospace;color:#FF2E97;font-weight:700;min-width:80px;text-align:right">' + fmt(u.points) + ' пт</div>' +
          '<div style="color:#10b981;font-weight:700;width:60px;text-align:right">' + prize + '</div>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // History
    var hist = (resMe && resMe.history) || [];
    html += '<div class="cab-card" style="margin-bottom:18px"><h3 style="margin:0 0 14px;color:#fff">📜 История начислений</h3>';
    if (!hist.length) {
      html += '<div style="text-align:center;padding:24px;color:#94a3b8">История пуста. Действуй на платформе — карма пойдёт.</div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:4px;max-height:400px;overflow-y:auto">';
      hist.forEach(function (h) {
        var lbl = KIND_LABELS[h.kind] || h.kind;
        var when = new Date(h.created_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px">' +
          '<div style="flex:1;color:#cbd5e1">' + esc(lbl) + (h.memo ? ' <span style="color:#64748b">(' + esc(h.memo) + ')</span>' : '') + '</div>' +
          '<div style="color:#94a3b8;font-size:11px">' + esc(when) + '</div>' +
          '<div style="color:#10b981;font-weight:700;min-width:48px;text-align:right">+' + fmt(h.points) + '</div>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Rules table
    var rules = (resRules && resRules.ok && resRules.rules) || [];
    html += '<div class="cab-card"><h3 style="margin:0 0 14px;color:#fff">📋 За что начисляется карма</h3>';
    if (rules.length) {
      var groups = {
        '🧑 Ежедневная активность': ['login', 'login_streak_7', 'login_streak_30', 'chat_message'],
        '💼 Executor (исполнитель)': ['task_complete', 'task_first', 'tool_use', 'tool_first', 'link_create', 'bio_post'],
        '📢 Advertiser (рекламодатель)': ['ad_submit', 'ad_first', 'ad_100_views', 'ad_1000_views', 'ad_topup_per_dollar', 'marketplace_list', 'marketplace_first_sale'],
        '🌐 Сеть / партнёрка': ['referral_joined', 'referral_bought', 'referral_ad_submit', 'referral_l2_joined', 'self_buy_tariff', 'self_upgrade'],
        '📋 Профиль / эфиры': ['onboarding_done', 'profile_filled_100', 'event_subscribe', 'event_attend'],
      };
      var ruleByKind = {};
      rules.forEach(function (r) { ruleByKind[r.kind] = r; });
      Object.keys(groups).forEach(function (gname) {
        html += '<div style="margin-bottom:18px"><h4 style="margin:8px 0;color:#cbd5e1;font-size:14px">' + gname + '</h4>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:8px">';
        groups[gname].forEach(function (k) {
          var r = ruleByKind[k];
          if (!r) return;
          var capStr = '';
          if (r.lifetime) capStr = '<span style="color:#fbbf24;font-size:10px">★ 1 раз</span>';
          else if (r.daily_cap === 0) capStr = '<span style="color:#ef4444;font-size:10px">отключено</span>';
          else if (r.daily_cap) capStr = '<span style="color:#94a3b8;font-size:10px">до ' + r.daily_cap + '/день</span>';
          else capStr = '<span style="color:#10b981;font-size:10px">без лимита</span>';
          html += '<div style="padding:8px 12px;background:rgba(0,0,0,0.2);border-radius:8px;display:flex;align-items:center;gap:10px;font-size:13px">' +
            '<div style="flex:1;color:#cbd5e1">' + esc(KIND_LABELS[k] || k) + '</div>' +
            '<div style="color:#FF2E97;font-weight:700;min-width:40px;text-align:right">+' + r.points + '</div>' +
            '<div style="min-width:80px;text-align:right">' + capStr + '</div>' +
          '</div>';
        });
        html += '</div></div>';
      });
    }
    html += '</div>';

    root.innerHTML = html;
  };
})();
