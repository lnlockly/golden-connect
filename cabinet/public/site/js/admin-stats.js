/* Trendex Cabinet — Admin «Статистика Trendex» + withdrawals queue + matrix launch */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  function fmtUsd(n) { n = Number(n) || 0; return '$' + n.toFixed(n % 1 === 0 ? 0 : 2); }
  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' +
      (isErr ? '#ef4444' : 'linear-gradient(135deg,#FF2E97,#B14AED)') +
      ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;z-index:10000';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
  function api(method, path, body) {
    return fetch('/cabinet' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).catch(e => ({ ok: false, reason: e.message }));
  }

  let STATE = { stats: null, withdrawals: [] };

  async function fetchStats() {
    const [s, w] = await Promise.all([
      api('GET', '/api/admin/stats'),
      api('GET', '/api/admin/withdrawals?status=pending'),
    ]);
    STATE.stats = s && s.ok ? s : null;
    STATE.withdrawals = w && w.ok ? w.items : [];
  }

  function statBlock(label, value, sub, color) {
    return '<div style="background:linear-gradient(140deg,#14122a,#1a1734);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px;border-top:3px solid ' + (color || '#B14AED') + '">' +
      '<div style="font-size:11px;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;margin-bottom:8px">' + label + '</div>' +
      '<div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:800;color:#f5f5fa">' + value + '</div>' +
      (sub ? '<div style="font-size:11px;color:#94a3b8;margin-top:4px">' + sub + '</div>' : '') +
    '</div>';
  }

  function renderStats() {
    if (!STATE.stats) return '<div style="padding:40px;text-align:center;color:#94a3b8">Нет доступа или загрузка...</div>';
    const s = STATE.stats;
    const u = s.users;
    const b = s.balances_total;
    return '<div style="max-width:1200px;margin:0 auto;padding:24px 16px">' +
      '<h2 style="color:#f5f5fa;margin:0 0 18px">📊 Статистика Trendex</h2>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Пользователи</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">' +
        statBlock('Всего', u.total, u.partner_status + ' со статусом PARTNER', '#10b981') +
        statBlock('FREE', u.free, '', '#94a3b8') +
        statBlock('LAUNCH', u.launch, fmtUsd(u.launch * 45) + ' активаций', '#10b981') +
        statBlock('BOOST', u.boost, fmtUsd(u.boost * 90) + ' активаций', '#00d4ff') +
        statBlock('ROCKET', u.rocket, fmtUsd(u.rocket * 135) + ' активаций', '#ff2e97') +
      '</div>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Балансы юзеров (всего)</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">' +
        statBlock('Основной', fmtUsd(b.working_usd), 'к выплате', '#10b981') +
        statBlock('Автоподписка', fmtUsd(b.subscription_usd), 'на тарифы', '#B14AED') +
        statBlock('Рекламный', fmtUsd(b.gift_usd), 'на ADX/баннеры', '#fbbf24') +
        statBlock('Карма', String(b.karma_points), 'для розыгрышей', '#FF2E97') +
      '</div>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Заработки за 30 дней (по источникам)</h3>' +
      '<div style="background:#14122a;border-radius:12px;padding:16px;border:1px solid rgba(255,255,255,0.06);margin-bottom:16px">' +
        (s.earnings_30d.length === 0
          ? '<div style="color:#94a3b8;text-align:center;padding:20px">Пока без заработков</div>'
          : s.earnings_30d.map(e => '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.03)"><span style="color:#94a3b8;font-size:13px">' + e.kind + '</span><strong style="color:#f5f5fa">' + fmtUsd(e.total_usd) + '</strong></div>').join('')) +
      '</div>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Cashflow прогноз</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">' +
        statBlock('Истекают за 7 дней', s.expiring_7d.count, 'юзеры', '#fbbf24') +
        statBlock('Потенциальный доход', fmtUsd(s.expiring_7d.potential_revenue_usd), 'если продлят', '#10b981') +
        statBlock('Pending выводов', s.withdrawals.pending_count, fmtUsd(s.withdrawals.pending_usd), '#ef4444') +
        statBlock('Одобрено выводов', s.withdrawals.approved_count, fmtUsd(s.withdrawals.approved_usd), '#10b981') +
      '</div>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Очередь выводов (pending)</h3>' +
      '<div id="withdrawals-list" style="background:#14122a;border-radius:12px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;margin-bottom:16px">' +
        renderWithdrawals() +
      '</div>' +

      '<h3 style="color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em;margin:18px 0 10px">Управление платформой</h3>' +
      '<div style="background:linear-gradient(135deg,rgba(177,74,237,0.1),rgba(255,46,151,0.1));border:1px solid rgba(177,74,237,0.3);border-radius:14px;padding:18px;margin-bottom:24px">' +
        '<h4 style="margin:0 0 8px;color:#fff">🚀 Запустить матрицу</h4>' +
        '<p style="color:#94a3b8;font-size:13px;margin:0 0 12px">Все купленные business_seats будут размещены в матрице через BFS (sponsor anchor → free slot). После запуска начисления по матрице активируются.</p>' +
        '<button onclick="window.AdminUI.launchMatrix()" style="background:linear-gradient(135deg,#B14AED,#FF2E97);color:white;border:none;padding:12px 24px;border-radius:10px;font-weight:700;cursor:pointer">🚀 Запустить</button>' +
      '</div>' +

    '</div>';
  }

  function renderWithdrawals() {
    if (!STATE.withdrawals.length) {
      return '<div style="padding:24px;text-align:center;color:#94a3b8">Нет ожидающих заявок</div>';
    }
    return STATE.withdrawals.map(w =>
      '<div style="padding:12px 14px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
        '<div style="flex:1;min-width:240px">' +
          '<div style="color:#f5f5fa;font-weight:600">' + (w.email || ('@' + (w.tg_id || '?'))) + '</div>' +
          '<div style="color:#94a3b8;font-size:12px;font-family:monospace">' + (w.memo || '') + '</div>' +
          '<div style="color:#64748b;font-size:11px">' + new Date(w.created_at).toLocaleString('ru-RU') + '</div>' +
        '</div>' +
        '<div style="font-family:Orbitron,sans-serif;font-size:18px;font-weight:700;color:#10b981">' + fmtUsd(w.amount_usd) + '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<button onclick="window.AdminUI.approveWithdraw(' + w.id + ')" style="background:#10b981;color:#fff;border:none;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer">✓ Одобрить</button>' +
          '<button onclick="window.AdminUI.rejectWithdraw(' + w.id + ')" style="background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid #ef4444;padding:8px 14px;border-radius:8px;font-weight:700;cursor:pointer">✕ Отклонить</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  window.AdminUI = {
    approveWithdraw: async function (id) {
      if (!confirm('Одобрить вывод #' + id + '? Деньги будут отправлены оффлайн.')) return;
      const r = await api('POST', '/api/admin/withdrawals/' + id + '/approve');
      if (r.ok) { toast('✅ Одобрено'); window.loadAdminStatsPage(); }
      else toast('Ошибка: ' + (r.reason || ''), true);
    },
    rejectWithdraw: async function (id) {
      const reason = prompt('Причина отклонения (увидит юзер):');
      if (!reason) return;
      const r = await api('POST', '/api/admin/withdrawals/' + id + '/reject', { reason });
      if (r.ok) { toast('✕ Отклонено, средства возвращены'); window.loadAdminStatsPage(); }
      else toast('Ошибка', true);
    },
    launchMatrix: async function () {
      if (!confirm('🚀 Запустить матрицу? Это необратимое действие — все business_seats будут размещены в дереве матрицы.')) return;
      const r = await api('POST', '/api/admin/matrix/launch');
      if (r.ok) toast('🚀 Запуск начат: ' + (r.users_unfrozen || '?') + ' юзеров разморожено');
      else toast('Ошибка: ' + (r.reason || ''), true);
    },
  };

  window.loadAdminStatsPage = async function () {
    const root = $('admin_statsContent') || $('adminStatsContent');
    if (!root) return;
    root.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">⚡ Загрузка...</div>';
    await fetchStats();
    if (!STATE.stats) {
      root.innerHTML = '<div style="padding:40px;text-align:center;color:#ef4444">У тебя нет прав админа.</div>';
      return;
    }
    root.innerHTML = renderStats();
  };
})();
