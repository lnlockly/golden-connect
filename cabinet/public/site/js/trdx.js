// Genesis TRDX cabinet page — balance, recent ledger, 4 utilities, leaderboard.
(function () {
  'use strict';

  const REASON_LABELS = {
    registration: '🎉 Регистрация',
    registration_backfill: '🎁 Бонус для ранних',
    referral_free: '👥 Реферал (free)',
    referral_paid_launch: '🚀 Реферал → LAUNCH',
    referral_paid_boost: '⚡ Реферал → BOOST',
    referral_paid_rocket: '🔥 Реферал → ROCKET',
  };

  function fmt(n) {
    return Number(n || 0).toLocaleString('ru-RU');
  }

  async function fetchTrx() {
    try {
      const r = await fetch('/cabinet/api/trx/me', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  async function fetchLeaderboard() {
    try {
      const r = await fetch('/cabinet/api/trx/leaderboard?limit=20', { credentials: 'include' });
      if (!r.ok) return null;
      return await r.json();
    } catch (_) {
      return null;
    }
  }

  function renderUtilityCard(icon, title, desc) {
    return (
      '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:18px;display:flex;gap:14px;align-items:flex-start">' +
      '<div style="font-size:34px;line-height:1">' + icon + '</div>' +
      '<div style="flex:1">' +
      '<div style="font-size:15px;font-weight:700;color:#e0e7ff;margin-bottom:4px">' + title + '</div>' +
      '<div style="font-size:13px;color:#94a3b8;line-height:1.5">' + desc + '</div>' +
      '</div></div>'
    );
  }

  window.loadTrdxPage = async function () {
    const el = document.getElementById('trdxContent');
    if (!el) return;
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8">Загрузка TRDX...</div>';

    const [me, board] = await Promise.all([fetchTrx(), fetchLeaderboard()]);
    const balance = (me && me.ok) ? Number(me.balance || 0) : 0;
    const ledger = (me && me.ok && Array.isArray(me.ledger)) ? me.ledger : [];

    let html = '';

    html +=
      '<div style="background:linear-gradient(135deg,#7c3aed 0%,#3b82f6 100%);border-radius:18px;padding:30px;margin-bottom:22px;color:#fff;position:relative;overflow:hidden">' +
      '<div style="position:absolute;top:-30px;right:-30px;font-size:200px;opacity:0.1">💎</div>' +
      '<div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;margin-bottom:6px">Genesis TRDX</div>' +
      '<div style="font-size:48px;font-weight:800;line-height:1">' + fmt(balance) + ' <span style="font-size:22px;opacity:0.85">TRDX</span></div>' +
      '<div style="margin-top:10px;font-size:14px;opacity:0.95">Твой пресейл-баланс. Накапливается за регистрацию, рефералов и оплаченные тарифы.</div>' +
      '</div>';

    html +=
      '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">Как заработать TRDX</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:24px">';
    [
      ['🎉', 'Регистрация', '<b>+100 TRDX</b> один раз каждому новому юзеру'],
      ['👥', 'Бесплатный реферал', '<b>+50 TRDX</b> за каждого приглашённого, кто прошёл регистрацию'],
      ['🚀', 'Реферал → LAUNCH', '<b>+1 000 TRDX</b> когда твой реферал оплатил $45 тариф'],
      ['⚡', 'Реферал → BOOST', '<b>+2 500 TRDX</b> когда твой реферал оплатил $90 тариф'],
      ['🔥', 'Реферал → ROCKET', '<b>+7 500 TRDX</b> когда твой реферал оплатил $135 тариф'],
    ].forEach(function (row) {
      html += renderUtilityCard(row[0], row[1], row[2]);
    });
    html += '</div>';

    html +=
      '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">Что даст TRDX после старта</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:24px">';
    [
      ['💱', 'Биржа TRDX', 'После запуска биржи TRDX можно будет продать за USD прямо в кабинете. Ранние держатели получат самый ликвидный курс.'],
      ['🤖', 'Оплата AI-сервисов', 'TRDX тратятся на премиум-AI-рассылки, генерации контента, авто-постинг и другие новые сервисы платформы.'],
      ['💰', 'Дивиденды каждый квартал', 'Каждые 3 месяца держателям TRDX начисляется в долларах процент от дохода Golden Connect. Чем больше TRDX — тем больше доля.'],
      ['🎁', 'Розыгрыши призов', 'Регулярные розыгрыши ценных призов: чем больше у тебя TRDX, тем больше у тебя билетов и шанс победить.'],
    ].forEach(function (row) {
      html += renderUtilityCard(row[0], row[1], row[2]);
    });
    html += '</div>';

    html += '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">Последние операции</h3>';
    if (ledger.length === 0) {
      html += '<div style="background:#0f172a;border:1px dashed #334155;border-radius:12px;padding:18px;color:#94a3b8;text-align:center">Пока нет операций. Зови рефералов — TRDX начнёт капать автоматически.</div>';
    } else {
      html += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden">';
      ledger.slice(0, 25).forEach(function (e, i) {
        const sign = Number(e.amount) >= 0 ? '+' : '';
        const color = Number(e.amount) >= 0 ? '#22c55e' : '#ef4444';
        const lbl = REASON_LABELS[e.reason] || e.reason;
        const when = (e.ts || '').slice(0, 10);
        const border = i < ledger.length - 1 ? 'border-bottom:1px solid #1e293b;' : '';
        html +=
          '<div style="' + border + 'padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px">' +
          '<div style="flex:1"><div style="color:#e0e7ff;font-size:14px">' + lbl + '</div><div style="color:#64748b;font-size:12px;margin-top:2px">' + when + '</div></div>' +
          '<div style="color:' + color + ';font-weight:700;font-size:15px">' + sign + fmt(e.amount) + '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    if (board && board.ok && Array.isArray(board.leaderboard) && board.leaderboard.length) {
      html += '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">🏆 Топ-20 держателей</h3>';
      html += '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden">';
      board.leaderboard.forEach(function (row, i) {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '#' + (i + 1);
        const border = i < board.leaderboard.length - 1 ? 'border-bottom:1px solid #1e293b;' : '';
        const name = String(row.displayName || 'user').replace(/[<>&]/g, '');
        html +=
          '<div style="' + border + 'padding:10px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px">' +
          '<div style="display:flex;align-items:center;gap:10px"><div style="min-width:34px;color:#94a3b8;font-size:13px">' + medal + '</div><div style="color:#e0e7ff;font-size:14px">' + name + '</div></div>' +
          '<div style="color:#a78bfa;font-weight:700;font-size:14px">' + fmt(row.trxBalance) + '</div>' +
          '</div>';
      });
      html += '</div>';
    }

    html +=
      '<div style="margin-top:30px;padding:18px;background:#0b1120;border:1px solid #1e293b;border-radius:12px;color:#94a3b8;font-size:13px;line-height:1.6">' +
      '<b style="color:#e0e7ff">Важно:</b> Genesis TRDX — это пресейл-токен Golden Connect. Биржа, дивиденды и розыгрыши запустятся после официального старта платформы. Сейчас идёт фаза накопления — баланс не списывается, только растёт. Условия начисления и утилиты могут уточняться до запуска.' +
      '</div>';

    el.innerHTML = html;
  };
})();
