/* Trendex Cabinet v2 — modern dashboard, charts, themes, new pages */
(function () {
  'use strict';

  // ────────── Helpers ──────────
  const _$ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const usd = (cents) => '$' + (Number(cents || 0) / 100).toFixed(2);
  const fmtN = (n) => Number(n || 0).toLocaleString('ru-RU');
  const fmtTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso); const now = Date.now();
    const diff = (now - d.getTime()) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + ' дн';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  async function _api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    try {
      const r = await fetch(path, opts);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { return null; }
  }

  // ────────── Theme ──────────
  function initTheme() {
    const saved = localStorage.getItem('trendex-theme') || 'dark';
    document.body.setAttribute('data-theme', saved);
    setTimeout(injectThemeToggle, 100);
  }
  function injectThemeToggle() {
    if (_$('v2-theme-toggle-btn')) return;
    // Find sidebar (existing planner cabinet has <aside class="sidebar"> or .sb container)
    const sb = document.querySelector('.sidebar') || document.querySelector('aside') || document.querySelector('nav.sb') || _$('sidebar');
    // Anchor element to insert before — preferably the logout button
    const anchor = document.querySelector('.sb-logout') || document.querySelector('[onclick*="doLogout"]');

    const cur = document.body.getAttribute('data-theme') || 'dark';
    const btn = document.createElement('button');
    btn.id = 'v2-theme-toggle-btn';
    btn.className = 'v2-theme-toggle';
    btn.title = 'Сменить тему';
    btn.innerHTML = renderThemeBtn(cur);

    btn.addEventListener('click', () => {
      const c = document.body.getAttribute('data-theme') || 'dark';
      const next = c === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', next);
      localStorage.setItem('trendex-theme', next);
      btn.innerHTML = renderThemeBtn(next);
      // Sync mobile bottom-nav theme button
      const bb = _$('v2-bnav-theme-btn');
      if (bb) bb.querySelector('.v2-bnav-icon').textContent = next === 'light' ? '🌙' : '☀️';
      window.toast && window.toast('Тема: ' + (next === 'light' ? '☀️ Светлая' : '🌙 Тёмная'), 'info');
      if (window.Chart && typeof window._v2RedrawCharts === 'function') window._v2RedrawCharts();
    });

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(btn, anchor);
    } else if (sb) {
      sb.appendChild(btn);
    } else {
      // Fallback: append to body but with smaller, less intrusive position
      btn.style.position = 'fixed';
      btn.style.bottom = '20px';
      btn.style.left = '20px';
      btn.style.width = 'auto';
      btn.style.margin = '0';
      btn.style.zIndex = '50';
      document.body.appendChild(btn);
    }
  }

  function renderThemeBtn(theme) {
    const isLight = theme === 'light';
    const icon = isLight ? '🌙' : '☀️';
    const label = isLight ? 'Тёмная тема' : 'Светлая тема';
    const state = isLight ? 'сейчас: ☀️' : 'сейчас: 🌙';
    return '<span class="v2-tt-icon">' + icon + '</span>' +
           '<span class="v2-tt-label">' + label + '</span>' +
           '<span class="v2-tt-state">' + state + '</span>';
  }

  // ────────── Toast system ──────────
  function ensureToastHost() {
    let host = _$('v2-toast-host');
    if (!host) { host = document.createElement('div'); host.id = 'v2-toast-host'; host.className = 'v2-toast-host'; document.body.appendChild(host); }
    return host;
  }
  window.toast = function (msg, type) {
    const host = ensureToastHost();
    const t = document.createElement('div');
    t.className = 'v2-toast ' + (type || 'info');
    const icon = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' }[type || 'info'] || 'ℹ️';
    t.innerHTML = '<span>' + icon + '</span><span>' + esc(msg) + '</span>';
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
  };

  // ────────── Charts (Chart.js wrapper) ──────────
  const _charts = new Map();
  function chartColors() {
    const isLight = document.body.getAttribute('data-theme') === 'light';
    return {
      text: isLight ? '#1a202c' : '#e8edf5',
      grid: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
      accent1: isLight ? '#0099cc' : '#00D4FF',
      accent2: isLight ? '#8b3fc7' : '#B14AED',
      pink: '#FF2E97',
      green: '#10b981',
      gold: '#fbbf24',
    };
  }
  function makeLineChart(canvasId, labels, datasets, opts) {
    if (!window.Chart) return null;
    const ctx = _$(canvasId);
    if (!ctx) return null;
    if (_charts.has(canvasId)) _charts.get(canvasId).destroy();
    const colors = chartColors();
    const chart = new window.Chart(ctx, {
      type: 'line',
      data: { labels, datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutCubic' },
        plugins: { legend: { labels: { color: colors.text }}, tooltip: { mode: 'index', intersect: false }},
        scales: {
          x: { ticks: { color: colors.text }, grid: { color: colors.grid }},
          y: { ticks: { color: colors.text }, grid: { color: colors.grid }},
        },
        elements: { line: { tension: 0.35 }, point: { radius: 3, hoverRadius: 6 }},
      }, opts || {}),
    });
    _charts.set(canvasId, chart);
    return chart;
  }
  function makeBarChart(canvasId, labels, datasets, opts) {
    if (!window.Chart) return null;
    const ctx = _$(canvasId);
    if (!ctx) return null;
    if (_charts.has(canvasId)) _charts.get(canvasId).destroy();
    const colors = chartColors();
    const chart = new window.Chart(ctx, {
      type: 'bar',
      data: { labels, datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800 },
        plugins: { legend: { labels: { color: colors.text }}},
        scales: { x: { ticks: { color: colors.text }, grid: { color: colors.grid }},
                  y: { ticks: { color: colors.text }, grid: { color: colors.grid }}},
      }, opts || {}),
    });
    _charts.set(canvasId, chart);
    return chart;
  }
  function makeDoughnutChart(canvasId, labels, data, colors) {
    if (!window.Chart) return null;
    const ctx = _$(canvasId);
    if (!ctx) return null;
    if (_charts.has(canvasId)) _charts.get(canvasId).destroy();
    const c = chartColors();
    const chart = new window.Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors || [c.accent1, c.accent2, c.pink, c.green, c.gold], borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800, animateRotate: true },
        plugins: { legend: { position: 'right', labels: { color: c.text, padding: 14 }}},
      },
    });
    _charts.set(canvasId, chart);
    return chart;
  }
  function makeSparkline(canvasId, data) {
    if (!window.Chart) return null;
    const ctx = _$(canvasId);
    if (!ctx) return null;
    if (_charts.has(canvasId)) _charts.get(canvasId).destroy();
    const colors = chartColors();
    const grad = ctx.getContext('2d').createLinearGradient(0, 0, 0, 30);
    grad.addColorStop(0, colors.accent1 + '88');
    grad.addColorStop(1, colors.accent1 + '00');
    const chart = new window.Chart(ctx, {
      type: 'line',
      data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: colors.accent1, backgroundColor: grad, fill: true, tension: 0.4, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, plugins: { legend: { display: false }, tooltip: { enabled: false }}, scales: { x: { display: false }, y: { display: false }}, elements: { point: { radius: 0 }}},
    });
    _charts.set(canvasId, chart);
    return chart;
  }
  window._v2RedrawCharts = function () {
    // Re-render all visible cards' charts on theme change
    if (typeof loadDashboardV2 === 'function' && document.querySelector('#page-dashboard.active')) loadDashboardV2();
    if (typeof loadAnalyticsV2 === 'function' && document.querySelector('#page-analytics.active')) loadAnalyticsV2();
    if (typeof loadWalletV2 === 'function' && document.querySelector('#page-wallet.active')) loadWalletV2();
  };

  // ────────── Dashboard 2.0 ──────────
  async function loadDashboardV2() {
    const host = _$('dashboardContent') || _$('page-dashboard');
    if (!host) return;
    // Show skeleton
    host.innerHTML = `
      <div class="v2-dash-hero">
        <div class="v2-skel" style="height:24px;width:60%;margin-bottom:8px"></div>
        <div class="v2-skel" style="height:48px;width:40%;margin-bottom:14px"></div>
        <div class="v2-skel" style="height:14px;width:30%"></div>
      </div>
      <div class="v2-kpi-grid">
        ${[1,2,3,4,5,6].map(() => '<div class="v2-skel" style="height:90px"></div>').join('')}
      </div>
    `;

    // Fetch data in parallel
    const [dashRes, profRes, adsBal, leaderRes] = await Promise.all([
      _api('GET', '/cabinet/api/dashboard'),
      _api('GET', '/cabinet/api/profile/stats'),
      _api('GET', '/cabinet/api/ads/balances'),
      _api('GET', '/cabinet/api/ads/leaderboard?period=week'),
    ]);

    const d = (dashRes && dashRes.dashboard) || {};
    const stats = (profRes && profRes.stats) || {};
    const bal = adsBal || { gift_cents: 0, earned_cents: 0, karma: 100 };
    const me = (window.me || {});
    const name = me.firstName || me.displayName || me.email || 'Партнёр';

    // Fetch real Trendex balances FIRST so hero can show the proper Working amount.
    let finBal = null;
    try {
      const fr = await _api('GET', '/cabinet/api/finance/balances');
      if (fr && fr.ok) finBal = fr;
    } catch (_) {}
    const fb = (finBal && finBal.balances) || {};
    const workingUsd = Number(fb.working && fb.working.usd || 0);

    // Hero — show REAL working balance (api Postgres), not local ads-credits
    let html = `
      <div class="v2-dash-hero">
        <div class="v2-hero-title">👋 С возвращением, ${esc(name)}!</div>
        <div class="v2-hero-sub">Сегодня в системе: <b>${fmtN(d.todayUsers || 0)}</b> активных партнёров · твой ранг: <b>#${(leaderRes && leaderRes.items && leaderRes.items.findIndex(u => u.user_id === me.id) + 1) || '—'}</b></div>
        <div class="v2-hero-earn">$${workingUsd.toFixed(2)}</div>
        <div class="v2-hero-earn-lbl">💵 Working balance · доступно к выводу</div>
      </div>
    `;

    // 4-tile real balances row (before KPI grid) — finBal/fb already fetched above
    if (finBal && finBal.balances) {
      const subPct = (fb.subscription && fb.subscription.progress) || 0;
      const fmtUsd2 = (n) => { n = Number(n) || 0; return n % 1 === 0 ? '$' + n.toFixed(0) : '$' + n.toFixed(2); };
      html += '<div class="v2-bal-row" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0">' +
        '<div style="padding:14px 16px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px">' +
          '<div style="font-size:10px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase">🟢 Основной</div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:24px;font-weight:800;color:#10b981;margin-top:4px">' + fmtUsd2(fb.working.usd) + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:2px">можно вывести</div>' +
        '</div>' +
        '<div style="padding:14px 16px;background:rgba(177,74,237,0.08);border:1px solid rgba(177,74,237,0.25);border-radius:12px">' +
          '<div style="font-size:10px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase">🟣 Подписка</div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:24px;font-weight:800;color:#B14AED;margin-top:4px">' + fmtUsd2(fb.subscription.usd) + '<span style="font-size:13px;color:#94a3b8">/' + fmtUsd2(fb.subscription.cap_usd) + '</span></div>' +
          '<div style="height:3px;background:rgba(0,0,0,0.3);border-radius:2px;margin-top:6px;overflow:hidden"><div style="height:100%;background:linear-gradient(90deg,#B14AED,#FF2E97);width:' + subPct + '%"></div></div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:2px">копится 20% / на продление</div>' +
        '</div>' +
        '<div style="padding:14px 16px;background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);border-radius:12px">' +
          '<div style="font-size:10px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase">🎁 Gift</div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:24px;font-weight:800;color:#fbbf24;margin-top:4px">' + fmtUsd2(fb.gift.usd) + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:2px">бонус на рекламу</div>' +
        '</div>' +
        '<div style="padding:14px 16px;background:rgba(255,46,151,0.08);border:1px solid rgba(255,46,151,0.25);border-radius:12px">' +
          '<div style="font-size:10px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase">⚡ Карма</div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:24px;font-weight:800;color:#FF2E97;margin-top:4px">' + (fb.karma.points || 0) + ' <span style="font-size:13px;color:#94a3b8">пт</span></div>' +
          '<div style="font-size:11px;color:#94a3b8;margin-top:2px">для розыгрыша $100</div>' +
        '</div>' +
      '</div>';
    }

    // Karma widget — week points + rank + raffle countdown
    let karmaMe = null;
    try {
      const km = await _api('GET', '/cabinet/api/karma/me');
      if (km && km.ok) karmaMe = km;
    } catch (_) {}
    if (karmaMe) {
      const wkPts = Number(karmaMe.week_points || 0);
      const rank = karmaMe.week_rank;
      html += '<div class="cab-card karma_widget_v2" style="background:linear-gradient(135deg,rgba(255,46,151,0.08),rgba(177,74,237,0.08));border:1px solid rgba(255,46,151,0.25);margin-bottom:18px;padding:18px">' +
        '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">' +
          '<div style="font-size:42px">⚡</div>' +
          '<div style="flex:1;min-width:160px">' +
            '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em">Карма за неделю</div>' +
            '<div style="font-family:Orbitron,monospace;font-size:28px;font-weight:900;color:#FF2E97">' + wkPts.toLocaleString('ru-RU') + ' пт</div>' +
          '</div>' +
          (rank ? '<div style="text-align:center;padding:10px 16px;background:rgba(255,46,151,0.1);border-radius:10px"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase">Ранг</div><div style="font-family:Orbitron,monospace;font-size:24px;font-weight:900;color:#FF2E97">#' + rank + '</div></div>' : '') +
          '<button class="cab-btn" style="padding:10px 18px" onclick="goPage(\'karma\')">Подробнее →</button>' +
        '</div>' +
      '</div>';
    }

    // Streak widget
    if (karmaMe && (karmaMe.streak > 0 || karmaMe.next_milestone)) {
      const streak = karmaMe.streak || 0;
      const nextM = karmaMe.next_milestone;
      const reward = karmaMe.milestone_reward;
      const daysLeft = karmaMe.days_to_milestone;
      const pct = nextM ? Math.min(100, Math.round((streak / nextM) * 100)) : 100;
      const fireCount = streak >= 30 ? '🔥🔥🔥' : streak >= 14 ? '🔥🔥' : streak >= 7 ? '🔥' : (streak > 0 ? '✨' : '💤');
      html += '<div class="cab-card streak_widget_v2" style="background:linear-gradient(135deg,rgba(251,146,60,0.06),rgba(255,46,151,0.04));border:1px solid rgba(251,146,60,0.25);margin-bottom:18px;padding:14px 18px">' +
        '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">' +
          '<div style="font-size:32px">' + fireCount + '</div>' +
          '<div style="flex:1;min-width:160px">' +
            '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Стрик заходов</div>' +
            '<div style="font-family:Orbitron,monospace;font-size:24px;font-weight:900;color:#fb923c">' + streak + ' дн. подряд</div>' +
          '</div>' +
          (nextM ? '<div style="text-align:center;padding:8px 14px;background:rgba(251,146,60,0.1);border-radius:10px"><div style="font-size:10px;color:#94a3b8;text-transform:uppercase">Через</div><div style="font-family:Orbitron,monospace;font-size:18px;font-weight:800;color:#fb923c">' + daysLeft + ' дн</div><div style="font-size:11px;color:#fbbf24;font-weight:700">+' + reward + ' карма</div></div>' : '<div style="padding:8px 14px;background:rgba(251,191,36,0.1);border-radius:10px;color:#fbbf24;font-weight:700;font-size:12px">+50 карма / день</div>') +
        '</div>' +
        (nextM ? '<div style="margin-top:8px;height:6px;background:rgba(0,0,0,0.3);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#fb923c,#ff2e97)"></div></div>' : '') +
      '</div>';
    }

    // KPI grid
    const kpis = [
      { icon: '🎁', val: '$' + (Number(fb.gift && fb.gift.usd || 0)).toFixed(2), lbl: 'Gift (реклама)', spark: 'sk-gift' },
      { icon: '💼', val: d.tasksDone || 0, lbl: 'Заданий выполнено', spark: 'sk-tasks' },
      { icon: '👥', val: d.referralCount || 0, lbl: 'Прямых рефералов', spark: 'sk-refs' },
      { icon: '📢', val: d.campaignsActive || 0, lbl: 'Активных кампаний', spark: 'sk-camps' },
      { icon: '🏆', val: bal.karma, lbl: 'Карма (за неделю)', spark: null },
      { icon: '🔥', val: d.loginStreak || 1 + ' дн', lbl: 'Стрик логина', spark: null },
    ];
    html += '<div class="v2-kpi-grid">' + kpis.map(k => `
      <div class="v2-kpi">
        <div class="v2-kpi-icon">${k.icon}</div>
        <div class="v2-kpi-val">${esc(String(k.val))}</div>
        <div class="v2-kpi-lbl">${esc(k.lbl)}</div>
        ${k.spark ? '<canvas class="v2-kpi-spark" id="' + k.spark + '"></canvas>' : ''}
      </div>
    `).join('') + '</div>';

    // Daily challenge widget (compact)
    const ch = await _api('GET', '/cabinet/api/challenge/today').catch(() => null);
    if (ch && ch.challenge) {
      const c = ch.challenge;
      const pct = Math.round((c.progress / c.target) * 100);
      html += `
        <div class="v2-challenge">
          <div class="v2-challenge-head">
            <div class="v2-challenge-title">🏁 Челлендж дня: ${esc(c.title || 'Выполни задание')}</div>
            <div class="v2-challenge-reward">+${usd(c.reward_cents || 0)}</div>
          </div>
          <div class="v2-challenge-progress"><div class="v2-challenge-bar" style="width:${Math.min(100, pct)}%"></div></div>
          <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:var(--v2-text-mut)">
            <span>Прогресс: ${c.progress}/${c.target}</span>
            <span>${pct}%</span>
          </div>
        </div>
      `;
    }

    // Charts grid
    html += `
      <div class="v2-charts-grid">
        <div class="v2-chart-card">
          <h3>📈 Доходы за 30 дней</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-earn-chart"></canvas></div>
        </div>
        <div class="v2-chart-card">
          <h3>🥧 Источники дохода</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-source-chart"></canvas></div>
        </div>
      </div>
    `;

    // All tools — categorized grid, every sidebar entry visible
    const categories = [
      { title: '🚀 Главное', tools: [
        { icon: '💰', lbl: 'Финансы', go: 'finance' },
        { icon: '🎯', lbl: 'Мой план', go: 'my_plan' },
        { icon: '📊', lbl: 'Аналитика', go: 'analytics' },
        { icon: '🏆', lbl: 'Достижения', go: 'achievements' },
      ]},
      { title: '📡 Реклама', tools: [
        { icon: '🎯', lbl: 'Кампании', go: 'ads' },
        { icon: '💰', lbl: 'Биржа заданий', go: 'tasks' },
        { icon: '📡', lbl: 'TG-автопостинг', go: 'adcenter' },
        { icon: '🛒', lbl: 'ADX Биржа', go: 'adx' },
      ]},
      { title: '🛒 Бизнес', tools: [
        { icon: '🚀', lbl: 'Тарифы', go: 'marketing' },
        { icon: '🛒', lbl: 'Маркетплейс', go: 'marketplace' },
        { icon: '🏪', lbl: 'Мой магазин', go: 'myshop' },
        { icon: '📦', lbl: 'Продукты', go: 'products' },
      ]},
      { title: '🔗 Ссылки', tools: [
        { icon: '🔗', lbl: 'Сократитель', go: 'shortener' },
        { icon: '🌐', lbl: 'Bio-страница', go: 'bio' },
        { icon: '🌐', lbl: 'Лендинги', go: 'landings' },
        { icon: '🔗', lbl: 'Мои ссылки', go: 'links' },
      ]},
      { title: '👥 Команда и рост', tools: [
        { icon: '👥', lbl: 'Команда', go: 'team' },
        { icon: '🌐', lbl: 'Сеть', go: 'network' },
        { icon: '🏅', lbl: 'Рейтинг', go: 'rating' },
        { icon: '🏆', lbl: 'Топ', go: 'leaderboard' },
      ]},
      { title: '🎓 Обучение и помощь', tools: [
        { icon: '🎓', lbl: 'AI-Mentor', go: 'mentor' },
        { icon: '📚', lbl: 'Обучение', go: 'learning' },
        { icon: '❓', lbl: 'FAQ', go: 'faq' },
        { icon: '🤖', lbl: 'AI-помощник', go: 'ai' },
      ]},
      { title: '💬 Связь', tools: [
        { icon: '💬', lbl: 'Чаты', go: 'chats' },
        { icon: '📹', lbl: 'Видеозвонки', go: 'meet' },
        { icon: '📡', lbl: 'Эфиры', go: 'broadcasts' },
        { icon: '📷', lbl: 'Медиацентр', go: 'media' },
      ]},
      { title: '🛠 Инструменты', tools: [
        { icon: '🛠', lbl: 'Инструменты', go: 'tools' },
        { icon: '📄', lbl: 'Материалы', go: 'materials' },
        { icon: '📦', lbl: 'Заказы', go: 'withdrawals' },
        { icon: '🆘', lbl: 'Поддержка', go: 'support' },
      ]},
    ];

    html += '<div class="v2-tools-section"><h3 class="v2-section-title">🧰 Все инструменты</h3>';
    categories.forEach(cat => {
      html += '<div class="v2-cat-section">';
      html += '<div class="v2-cat-title">' + esc(cat.title) + '</div>';
      html += '<div class="v2-actions-grid">';
      cat.tools.forEach(a => {
        html += '<div class="v2-action" onclick="goPage(\'' + a.go + '\')">';
        html += '<span class="v2-action-icon">' + a.icon + '</span>';
        html += '<div class="v2-action-lbl">' + esc(a.lbl) + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    html += '</div>';

    // Activity feed
    html += '<div class="v2-feed"><h3>📰 Лента активности</h3><div id="v2-feed-list"></div></div>';

    host.innerHTML = html;

    // Render charts
    setTimeout(() => {
      // Earnings line chart (mocked from dashboard or computed)
      const earnDays = d.earningsByDay || generateMockDays(30);
      const labels = earnDays.map(x => x.label);
      const earnData = earnDays.map(x => x.value || 0);
      const colors = chartColors();
      makeLineChart('v2-earn-chart', labels, [
        { label: 'Заработано ($)', data: earnData,
          borderColor: colors.accent1,
          backgroundColor: colors.accent1 + '22',
          fill: true },
      ]);

      // Source pie
      makeDoughnutChart('v2-source-chart',
        ['Биржа', 'Партнёрка', 'Кампании', 'Маркетплейс'],
        [d.earnAds || 50, d.earnRefs || 30, d.earnCampaigns || 15, d.earnMarketplace || 5],
        [colors.accent1, colors.accent2, colors.pink, colors.gold]
      );

      // Sparklines for KPI
      makeSparkline('sk-gift', generateRandomSpark(7));
      makeSparkline('sk-tasks', generateRandomSpark(7));
      makeSparkline('sk-refs', generateRandomSpark(7));
      makeSparkline('sk-camps', generateRandomSpark(7));
    }, 50);

    // Render activity feed
    renderFeedV2(d, bal);
  }

  function generateMockDays(n) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push({ label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }), value: Math.random() * 5 });
    }
    return days;
  }
  function generateRandomSpark(n) {
    const arr = []; for (let i = 0; i < n; i++) arr.push(Math.random() * 100);
    return arr;
  }

  async function renderFeedV2(dash, bal) {
    const host = _$('v2-feed-list');
    if (!host) return;
    // Pull from notifications + transactions
    const [notes, tx] = await Promise.all([
      _api('GET', '/cabinet/api/notifications?limit=5'),
      _api('GET', '/cabinet/api/ads/transactions'),
    ]);
    const items = [];
    if (notes && notes.notifications) {
      notes.notifications.slice(0, 3).forEach(n => items.push({
        icon: '🔔', title: n.title || n.message || 'Уведомление',
        time: n.createdAt || n.created_at, amount: null,
      }));
    }
    if (tx && tx.items) {
      tx.items.slice(0, 5).forEach(t => items.push({
        icon: t.kind === 'reward' ? '✅' : t.kind === 'charge' ? '🛒' : '·',
        title: t.note || t.kind, time: t.created_at,
        amount: (t.amount_cents > 0 ? '+' : '') + usd(t.amount_cents),
      }));
    }
    if (!items.length) {
      host.innerHTML = '<div style="text-align:center;color:var(--v2-text-mut);padding:30px">Пока нет активности. Возьми первое задание или запусти кампанию!</div>';
      return;
    }
    host.innerHTML = items.slice(0, 8).map(i => `
      <div class="v2-feed-item">
        <div class="v2-feed-icon">${i.icon}</div>
        <div class="v2-feed-text">
          <div class="v2-feed-title">${esc(i.title)}</div>
          <div class="v2-feed-time">${fmtTime(i.time)}</div>
        </div>
        ${i.amount ? '<div class="v2-feed-amount">' + esc(i.amount) + '</div>' : ''}
      </div>
    `).join('');
  }

  // ────────── Analytics page ──────────
  async function loadAnalyticsV2() {
    const host = _$('analyticsContent') || _$('page-analytics');
    if (!host) return;
    host.innerHTML = `
      <h2 class="v2-section-title">📊 Аналитика</h2>
      <div class="v2-charts-grid">
        <div class="v2-chart-card">
          <h3>Доходы (60 дней)</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-an-earn"></canvas></div>
        </div>
        <div class="v2-chart-card">
          <h3>Активность по дням недели</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-an-week"></canvas></div>
        </div>
      </div>
      <div class="v2-charts-grid" style="grid-template-columns:1fr 1fr">
        <div class="v2-chart-card">
          <h3>Воронка рефералов</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-an-funnel"></canvas></div>
        </div>
        <div class="v2-chart-card">
          <h3>Топ-10 источников</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-an-sources"></canvas></div>
        </div>
      </div>
    `;
    setTimeout(() => {
      const colors = chartColors();
      const earnDays = generateMockDays(60);
      makeLineChart('v2-an-earn', earnDays.map(x => x.label), [
        { label: 'Биржа ($)', data: earnDays.map(() => Math.random() * 3),
          borderColor: colors.accent1, backgroundColor: colors.accent1 + '22', fill: true },
        { label: 'Партнёрка ($)', data: earnDays.map(() => Math.random() * 5),
          borderColor: colors.accent2, backgroundColor: colors.accent2 + '22', fill: true },
      ]);
      makeBarChart('v2-an-week',
        ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
        [{ label: 'Сообщений', data: [12, 19, 15, 25, 22, 30, 18],
           backgroundColor: colors.accent1 + 'cc', borderRadius: 6 }]
      );
      makeBarChart('v2-an-funnel',
        ['Зашли', 'Онбординг', 'Активные', 'Платная подписка'],
        [{ label: 'Рефералы', data: [50, 35, 20, 8],
           backgroundColor: [colors.gold, colors.accent1, colors.accent2, colors.green],
           borderRadius: 6 }],
        { indexAxis: 'y' }
      );
      makeDoughnutChart('v2-an-sources',
        ['Telegram', 'Сайт', 'Реф друзей', 'Прямые', 'Реклама'],
        [40, 25, 15, 12, 8]
      );
    }, 50);
  }

  // ────────── Achievements page ──────────
  async function loadAchievementsV2() {
    const host = _$('achievementsContent') || _$('page-achievements');
    if (!host) return;
    host.innerHTML = '<h2 class="v2-section-title">🏆 Достижения</h2><div id="v2-ach-list"><div class="v2-skel" style="height:200px"></div></div>';

    // Fetch via bot API (proxy through cabinet) — fallback: hardcoded list
    const BADGES = [
      { id: 'first_task', icon: '💼', title: 'Первое задание', desc: 'Выполни первое задание', reward: 0 },
      { id: 'tasks_10', icon: '⚡', title: 'Активный исполнитель', desc: '10 заданий', reward: 50 },
      { id: 'tasks_100', icon: '🔥', title: 'Профи биржи', desc: '100 заданий', reward: 500 },
      { id: 'first_dollar', icon: '💵', title: 'Первый доллар', desc: '$1 заработан', reward: 0 },
      { id: 'earned_10', icon: '💰', title: 'Десятка', desc: '$10 заработан', reward: 50 },
      { id: 'earned_100', icon: '🏆', title: 'Сотка', desc: '$100 заработан', reward: 500 },
      { id: 'first_camp', icon: '🎯', title: 'Первая кампания', desc: 'Создал кампанию', reward: 0 },
      { id: 'first_ref', icon: '🔗', title: 'Первый реферал', desc: 'Привёл партнёра', reward: 0 },
      { id: 'refs_10', icon: '👥', title: 'PARTNER', desc: '10 рефералов', reward: 100 },
      { id: 'refs_50', icon: '💎', title: 'Лидер', desc: '50 рефералов', reward: 500 },
      { id: 'streak_7', icon: '🔥', title: '7 дней', desc: '7-дн стрик логина', reward: 50 },
      { id: 'tariff_active', icon: '🚀', title: 'Активирован тариф', desc: 'Купил платный тариф', reward: 0 },
    ];
    const earnedRes = await _api('GET', '/cabinet/api/achievements');
    const earnedSet = new Set((earnedRes && earnedRes.earned) || []);
    const list = _$('v2-ach-list');
    list.innerHTML = '<div class="v2-ach-grid">' + BADGES.map(b => `
      <div class="v2-ach ${earnedSet.has(b.id) ? 'earned' : ''}">
        <div class="v2-ach-icon">${b.icon}</div>
        <div class="v2-ach-title">${esc(b.title)}</div>
        <div class="v2-ach-desc">${esc(b.desc)}</div>
        ${b.reward ? '<div class="v2-ach-reward">+' + usd(b.reward) + '</div>' : ''}
      </div>
    `).join('') + '</div>';

    // Stats
    const got = BADGES.filter(b => earnedSet.has(b.id)).length;
    list.innerHTML += `
      <div style="text-align:center;margin-top:24px;color:var(--v2-text-mut)">
        Получено: <b style="color:var(--v2-text)">${got}/${BADGES.length}</b> бейджей
      </div>
    `;
  }

  // ────────── Wallet page ──────────
  async function loadWalletV2() {
    // Перенаправление на #/finance — единая страница с 4 балансами
    // (Working / Gift / Subscription / Karma), пополнением, переводами и
    // выводом. Старая v2 wallet с 3 карточками (Earned / Gift / Matrix
    // Pending) заменена единым source of truth.
    const host = _$('walletContent') || _$('page-wallet');
    if (host) {
      host.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#94a3b8"><div style="font-size:32px;margin-bottom:12px">💰</div><div>Перенаправление на #/finance...</div></div>';
    }
    if (typeof window.goPage === 'function') {
      setTimeout(() => window.goPage('finance'), 250);
    } else {
      window.location.hash = '#/finance';
    }
  }
  async function _loadWalletV2Body() {

    const [finBalRes, txs, wd] = await Promise.all([
      _api('GET', '/cabinet/api/finance/balances'),
      _api('GET', '/cabinet/api/ads/transactions'),
      _api('GET', '/cabinet/api/withdrawals'),
    ]);
    const fb = (finBalRes && finBalRes.balances) || {};
    const _wUsd = Number(fb.working && fb.working.usd || 0);
    const _gUsd = Number(fb.gift && fb.gift.usd || 0);
    const _sUsd = Number(fb.subscription && fb.subscription.usd || 0);
    const _kPts = Number(fb.karma && fb.karma.points || 0);
    const _fmt = (n) => '$' + (Number(n) || 0).toFixed(2);
    let html = `
      <div class="v2-wallet-grid">
        <div class="v2-wallet v2-wallet--earned">
          <div class="v2-wallet-icon">💵</div>
          <div class="v2-wallet-amount">${_fmt(_wUsd)}</div>
          <div class="v2-wallet-lbl">Working · доступно к выводу (от $3)</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="v2-wallet-action" onclick="window._v2TopupEarned()" style="flex:1;min-width:140px;background:linear-gradient(135deg,#10b981,#059669)">💵 Пополнить</button>
            <button class="v2-wallet-action" onclick="window._v2Withdraw()" style="flex:1;min-width:140px">💸 Вывод</button>
          </div>
        </div>
        <div class="v2-wallet v2-wallet--gift">
          <div class="v2-wallet-icon">🎁</div>
          <div class="v2-wallet-amount">${_fmt(_gUsd)}</div>
          <div class="v2-wallet-lbl">Gift · для рекламы внутри платформы</div>
          <button class="v2-wallet-action" onclick="window._v2Topup()">💵 Пополнить</button>
        </div>
        <div class="v2-wallet v2-wallet--matrix">
          <div class="v2-wallet-icon">🟣</div>
          <div class="v2-wallet-amount">${_fmt(_sUsd)}</div>
          <div class="v2-wallet-lbl">Subscription · на оплату тарифа</div>
          <button class="v2-wallet-action ghost" onclick="window.location.hash='#/finance'">📊 Подробнее</button>
        </div>
      </div>

      <div class="v2-charts-grid" style="grid-template-columns:1fr">
        <div class="v2-chart-card">
          <h3>📈 Движения по балансам (30 дней)</h3>
          <div class="v2-chart-canvas-wrap"><canvas id="v2-wal-flow"></canvas></div>
        </div>
      </div>
    `;

    // Withdrawals history
    if (wd && wd.items && wd.items.length) {
      html += '<div class="v2-feed"><h3>💸 Заявки на вывод</h3>';
      wd.items.slice(0, 10).forEach(w => {
        const statusIcon = { pending: '⏳', processing: '🔄', paid: '✅', rejected: '❌' }[w.status] || '·';
        html += `
          <div class="v2-feed-item">
            <div class="v2-feed-icon">${statusIcon}</div>
            <div class="v2-feed-text">
              <div class="v2-feed-title">${usd(w.amount_cents)} · ${esc(w.currency || 'USDT')} · ${esc(w.status)}</div>
              <div class="v2-feed-time">${fmtTime(w.created_at)}</div>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    // Transactions
    if (txs && txs.items && txs.items.length) {
      html += '<div class="v2-feed"><h3>📋 Последние транзакции</h3>';
      txs.items.slice(0, 15).forEach(t => {
        const positive = (t.amount_cents || 0) > 0;
        html += `
          <div class="v2-feed-item">
            <div class="v2-feed-icon">${positive ? '✅' : '🛒'}</div>
            <div class="v2-feed-text">
              <div class="v2-feed-title">${esc(t.note || t.kind)}</div>
              <div class="v2-feed-time">${fmtTime(t.created_at)} · ${esc(t.wallet || 'earned')}</div>
            </div>
            <div class="v2-feed-amount" style="color:${positive ? 'var(--v2-green)' : 'var(--v2-red)'}">${positive ? '+' : ''}${usd(t.amount_cents)}</div>
          </div>
        `;
      });
      html += '</div>';
    }

    _$('v2-wallet-body').innerHTML = html;

    setTimeout(() => {
      const colors = chartColors();
      const days = generateMockDays(30);
      makeLineChart('v2-wal-flow', days.map(d => d.label), [
        { label: 'Earned', data: days.map(() => Math.random() * 3),
          borderColor: colors.green, backgroundColor: colors.green + '22', fill: true },
        { label: 'Gift', data: days.map(() => Math.random() * 2),
          borderColor: colors.gold, backgroundColor: colors.gold + '22', fill: true },
      ]);
    }, 50);
  }
  window._v2Withdraw = function () {
    if (window.goPage) window.goPage('withdrawals'); else window.location.hash = '#/withdrawals';
  };
  window._v2TopupEarned = function () {
    // Earned balance topup — redirect to the rich #/finance page where the
    // 4-balance system (working/gift/subscription/karma) handles cryptobot
    // + platega via /api/pay/create-invoice. Auto-opens the topup tab.
    window.location.hash = "#/finance";
    setTimeout(() => {
      const tab = document.querySelector('[data-tab="topup"]');
      if (tab && tab.click) tab.click();
    }, 700);
  };

  window._v2Topup = function () {
    if (window.goPage) window.goPage('ads'); else window.location.hash = '#/ads';
    setTimeout(() => { if (window.AdsWeb && window.AdsWeb.openTopUp) window.AdsWeb.openTopUp(); }, 600);
  };

  // ────────── Network tree ──────────
  async function loadNetworkV2() {
    const host = _$('networkContent') || _$('page-network');
    if (!host) return;
    host.innerHTML = '<h2 class="v2-section-title">🌐 Партнёрская сеть</h2><div id="v2-net-body"><div class="v2-skel" style="height:300px"></div></div>';

    const tree = await _api('GET', '/cabinet/api/team/tree?depth=10');
    const body = _$('v2-net-body');
    if (!tree || !tree.levels || !tree.levels.length) {
      body.innerHTML = '<div class="v2-feed" style="text-align:center;padding:40px">Пока нет рефералов. Поделись своей реф-ссылкой через /ref в боте, чтобы построить сеть.</div>';
      return;
    }
    let html = '<div class="v2-tree">';
    tree.levels.forEach((lvl, i) => {
      if (!lvl || !lvl.users || !lvl.users.length) return;
      html += `<div class="v2-tree-level">
        <div class="v2-tree-level-label">L${i+1} · ${lvl.users.length} человек · ${usd(lvl.totalEarnedCents || 0)} заработано</div>
        <div class="v2-tree-row">`;
      lvl.users.slice(0, 50).forEach(u => {
        const cls = (u.in_chat ? ' in-chat' : '') + (u.has_tariff ? ' has-tariff' : '');
        html += `<div class="v2-tree-node${cls}" title="${esc(u.name || 'User')}">
          ${u.has_tariff ? '🚀' : '🆓'} ${esc(u.name || 'User')}
          ${u.in_chat ? '<span style="color:var(--v2-green)">✓</span>' : ''}
        </div>`;
      });
      if (lvl.users.length > 50) html += `<div style="color:var(--v2-text-mut);font-size:0.85rem">…и ещё ${lvl.users.length - 50}</div>`;
      html += '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  // ────────── AI Mentor page ──────────
  async function loadMentorV2() {
    const host = _$('mentorContent') || _$('page-mentor');
    if (!host) return;
    host.innerHTML = '<h2 class="v2-section-title">🎓 AI-Mentor</h2><div id="v2-mentor-body"><div class="v2-skel" style="height:200px"></div></div>';
    const r = await _api('GET', '/cabinet/api/mentor/plan');
    const body = _$('v2-mentor-body');
    const plan = (r && r.plan) || ['🌱 Начни с малого: возьми первое задание на бирже (/jobs)', '🔗 Скопируй реф-ссылку из /ref и отправь 5 знакомым', '🚀 Изучи тарифы /tariffs — без них только 1 уровень партнёрки'];
    body.innerHTML = `
      <div class="v2-feed">
        <h3>📋 Твой план на сегодня</h3>
        ${plan.map((p, i) => `
          <div class="v2-feed-item">
            <div class="v2-feed-icon">${i+1}</div>
            <div class="v2-feed-text">
              <div class="v2-feed-title">${esc(p)}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="v2-feed" style="margin-top:14px">
        <h3>🤖 AI-помощник</h3>
        <p style="color:var(--v2-text-mut)">Задай вопрос про Trendex или попроси совет.</p>
        <textarea id="v2-mentor-input" placeholder="Например: какой тариф мне подходит?" style="width:100%;background:var(--v2-bg-elev);color:var(--v2-text);border:1px solid var(--v2-border);border-radius:10px;padding:12px;margin:10px 0;min-height:80px;font-family:inherit"></textarea>
        <button class="v2-wallet-action" onclick="window._v2MentorAsk()">🤖 Спросить</button>
        <div id="v2-mentor-answer" style="margin-top:14px"></div>
      </div>
    `;
  }
  window._v2MentorAsk = async function () {
    const input = _$('v2-mentor-input');
    const ans = _$('v2-mentor-answer');
    if (!input || !ans) return;
    const q = (input.value || '').trim();
    if (!q) return;
    ans.innerHTML = '<div style="padding:12px;color:var(--v2-text-mut)">🤖 Думаю…</div>';
    const r = await _api('POST', '/cabinet/api/mentor/ask', { question: q });
    if (r && r.answer) {
      ans.innerHTML = '<div style="padding:14px;background:var(--v2-grad-soft);border-radius:10px;color:var(--v2-text);line-height:1.6">' + esc(r.answer) + '</div>';
    } else {
      ans.innerHTML = '<div style="padding:14px;color:var(--v2-red)">AI временно недоступен. Попробуй в боте: /mentor</div>';
    }
  };

  // ────────── Group chat panel ──────────
  async function loadGroupChatV2() {
    const host = _$('groupChatContent') || _$('page-group_chat');
    if (!host) return;
    host.innerHTML = '<h2 class="v2-section-title">💬 Чат партнёров @TRENDEX_AD</h2><div id="v2-gc-body"><div class="v2-skel" style="height:300px"></div></div>';
    const r = await _api('GET', '/cabinet/api/group-chat/stats');
    const body = _$('v2-gc-body');
    const s = (r && r.stats) || { total: 0, active: 0, online: 0, today: 0 };
    body.innerHTML = `
      <div class="v2-kpi-grid">
        <div class="v2-kpi"><div class="v2-kpi-icon">👥</div><div class="v2-kpi-val">${s.active || 0}</div><div class="v2-kpi-lbl">Участников</div></div>
        <div class="v2-kpi"><div class="v2-kpi-icon">💚</div><div class="v2-kpi-val">${s.online || 0}</div><div class="v2-kpi-lbl">Онлайн (30 мин)</div></div>
        <div class="v2-kpi"><div class="v2-kpi-icon">🆕</div><div class="v2-kpi-val">${s.today || 0}</div><div class="v2-kpi-lbl">Новых сегодня</div></div>
        <div class="v2-kpi"><div class="v2-kpi-icon">🚪</div><div class="v2-kpi-val">${s.gone || 0}</div><div class="v2-kpi-lbl">Покинули</div></div>
      </div>
      <div class="v2-charts-grid" style="grid-template-columns:1fr">
        <div class="v2-chart-card">
          <h3>🏆 Топ активных за неделю</h3>
          <div id="v2-gc-top"></div>
        </div>
      </div>
      <div style="text-align:center;margin-top:14px">
        <a href="https://t.me/TRENDEX_AD" target="_blank" class="v2-wallet-action" style="display:inline-block;padding:14px 28px;text-decoration:none;color:#fff">🚀 Открыть чат @TRENDEX_AD</a>
      </div>
    `;
    const top = _$('v2-gc-top');
    const topUsers = (r && r.top) || [];
    if (!topUsers.length) {
      top.innerHTML = '<div style="padding:20px;text-align:center;color:var(--v2-text-mut)">Пока нет активности. Зайди в @TRENDEX_AD и пообщайся!</div>';
    } else {
      top.innerHTML = topUsers.slice(0, 10).map((u, i) => `
        <div class="v2-feed-item">
          <div class="v2-feed-icon">${['🥇','🥈','🥉','4.','5.','6.','7.','8.','9.','10.'][i]}</div>
          <div class="v2-feed-text">
            <div class="v2-feed-title">${esc(u.name || 'User')}</div>
            <div class="v2-feed-time">${u.msg_count_week || 0} сообщений</div>
          </div>
        </div>
      `).join('');
    }
  }

  // ────────── Cmd+K palette ──────────
  function initCmdK() {
    const ROUTES = [
      { name: 'Главная', desc: 'Dashboard', icon: '🏠', go: 'dashboard' },
      { name: 'Аналитика', desc: 'Графики и метрики', icon: '📊', go: 'analytics' },
      { name: 'Достижения', desc: '12 бейджей', icon: '🏆', go: 'achievements' },
      { name: 'Кошелёк', desc: 'Балансы и транзакции', icon: '💰', go: 'wallet' },
      { name: 'AI-Mentor', desc: 'План дня', icon: '🎓', go: 'mentor' },
      { name: 'Сеть', desc: '10-уровневое дерево', icon: '🌐', go: 'network' },
      { name: 'Чат партнёров', desc: '@TRENDEX_AD', icon: '💬', go: 'group_chat' },
      { name: 'Реклама', desc: 'Биржа + кампании', icon: '🎯', go: 'ads' },
      { name: 'Маркетплейс', desc: 'Товары', icon: '🛒', go: 'marketplace' },
      { name: 'Тарифы', desc: 'LAUNCH / BOOST / ROCKET', icon: '🚀', go: 'marketing' },
      { name: 'Команда', desc: 'CRM рефералов', icon: '👥', go: 'team' },
      { name: 'Видеозвонки', desc: 'Meet rooms', icon: '📹', go: 'meet' },
      { name: 'Настройки', desc: 'Профиль', icon: '⚙️', go: 'profile' },
      { name: 'Лидерборд', desc: 'Топ заработавших', icon: '🏅', go: 'leaderboard' },
    ];
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openCmdK(ROUTES);
      }
      if (e.key === 'Escape') closeCmdK();
    });
    function openCmdK(routes) {
      let m = _$('v2-cmdk-modal');
      if (m) return;
      m = document.createElement('div');
      m.id = 'v2-cmdk-modal'; m.className = 'v2-cmdk';
      m.innerHTML = `
        <div class="v2-cmdk-box" onclick="event.stopPropagation()">
          <input class="v2-cmdk-input" id="v2-cmdk-input" placeholder="Куда идём? (или начни печатать)..." autofocus>
          <div class="v2-cmdk-results" id="v2-cmdk-results"></div>
        </div>
      `;
      m.addEventListener('click', () => closeCmdK());
      document.body.appendChild(m);
      const input = _$('v2-cmdk-input');
      const results = _$('v2-cmdk-results');
      let active = 0;
      const filter = (q) => routes.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.desc.toLowerCase().includes(q.toLowerCase()));
      const render = (q) => {
        const filtered = filter(q);
        active = 0;
        results.innerHTML = filtered.map((r, i) => `
          <div class="v2-cmdk-item ${i === active ? 'active' : ''}" data-go="${r.go}" data-i="${i}">
            <div class="v2-cmdk-icon">${r.icon}</div>
            <div class="v2-cmdk-name">${esc(r.name)}</div>
            <div class="v2-cmdk-desc">${esc(r.desc)}</div>
          </div>
        `).join('');
        results.querySelectorAll('.v2-cmdk-item').forEach(el => el.addEventListener('click', () => {
          if (window.goPage) window.goPage(el.dataset.go);
          closeCmdK();
        }));
      };
      render('');
      input.addEventListener('input', () => render(input.value));
      input.addEventListener('keydown', (ke) => {
        const items = results.querySelectorAll('.v2-cmdk-item');
        if (ke.key === 'ArrowDown') { ke.preventDefault(); active = Math.min(items.length - 1, active + 1); }
        else if (ke.key === 'ArrowUp') { ke.preventDefault(); active = Math.max(0, active - 1); }
        else if (ke.key === 'Enter' && items[active]) { ke.preventDefault(); items[active].click(); }
        items.forEach((el, i) => el.classList.toggle('active', i === active));
      });
    }
    function closeCmdK() {
      const m = _$('v2-cmdk-modal'); if (m) m.remove();
    }
  }

  // ────────── Mobile bottom nav ──────────
  function initMobileSearchFab() {
    if (document.getElementById('v2-mobile-search-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'v2-mobile-search-btn';
    btn.className = 'v2-mobile-search';
    btn.title = 'Поиск (или Cmd+K)';
    btn.innerHTML = '🔍';
    btn.addEventListener('click', () => {
      // Trigger Cmd+K via keyboard event simulation
      const evt = new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true });
      document.dispatchEvent(evt);
    });
    document.body.appendChild(btn);
  }

  function initBottomNav() {
    if (_$('v2-bnav')) return;
    const nav = document.createElement('nav');
    nav.id = 'v2-bnav';
    nav.className = 'v2-bottom-nav';
    const themeNow = document.body.getAttribute('data-theme') || 'dark';
    nav.innerHTML = [
      { icon: '🏠', lbl: 'Главная', go: 'dashboard' },
      { icon: '📊', lbl: 'Анал.', go: 'analytics' },
      { icon: '💰', lbl: 'Кошёлек', go: 'wallet' },
      { icon: '🎯', lbl: 'Реклама', go: 'ads' },
      { icon: '👥', lbl: 'Команда', go: 'team' },
    ].map(b => `
      <button class="v2-bnav-btn" data-go="${b.go}" onclick="window._v2BnavGo('${b.go}')">
        <div class="v2-bnav-icon">${b.icon}</div>
        <div>${b.lbl}</div>
      </button>
    `).join('') + `
      <button class="v2-bnav-btn theme-toggle" id="v2-bnav-theme-btn" onclick="document.getElementById('v2-theme-toggle-btn')&&document.getElementById('v2-theme-toggle-btn').click()">
        <div class="v2-bnav-icon">${themeNow === 'light' ? '🌙' : '☀️'}</div>
        <div>Тема</div>
      </button>
    `;
    document.body.appendChild(nav);
  }

  // ────────── Init ──────────
  window._v2BnavGo = function(name) {
    if (typeof window.goPage === 'function') window.goPage(name);
    setTimeout(function() {
      var m = {
        dashboard: window.loadDashboardV2,
        analytics: window.loadAnalyticsV2,
        achievements: window.loadAchievementsV2,
        wallet: window.loadWalletV2,
        network: window.loadNetworkV2,
        mentor: window.loadMentorV2,
        group_chat: window.loadGroupChatV2,
      };
      var fn = m[name];
      if (fn) try { fn(); } catch(e) { console.error('[v2 nav]', e); }
    }, 80);
  };

  function init() {
    initTheme();
    setTimeout(() => {
      initCmdK();
      initBottomNav();
      initMobileSearchFab();
      // Override loadDashboard if it exists
      if (typeof window.loadDashboard === 'function') {
        window._loadDashboardOriginal = window.loadDashboard;
        window.loadDashboard = loadDashboardV2;
      }
      // Expose new page loaders
      window.loadAnalyticsV2 = loadAnalyticsV2;
      window.loadAchievementsV2 = loadAchievementsV2;
      window.loadWalletV2 = loadWalletV2;
      window.loadNetworkV2 = loadNetworkV2;
      window.loadMentorV2 = loadMentorV2;
      window.loadGroupChatV2 = loadGroupChatV2;
      window.loadDashboardV2 = loadDashboardV2;
      // Hook v2 loaders by wrapping goPage (loadPage is closure-scoped, can't override directly)
      if (typeof window.goPage === 'function') {
        const origGoPage = window.goPage;
        // [no-double-render-2026-05-13] dashboard removed — already routed via
        // the window.loadDashboard = loadDashboardV2 override above, so listing
        // it here caused two renders per navigation (race condition: user saw
        // different content on each refresh).
        const v2Loaders = {
          analytics: () => window.loadAnalyticsV2 && window.loadAnalyticsV2(),
          achievements: () => window.loadAchievementsV2 && window.loadAchievementsV2(),
          wallet: () => window.loadWalletV2 && window.loadWalletV2(),
          network: () => window.loadNetworkV2 && window.loadNetworkV2(),
          mentor: () => window.loadMentorV2 && window.loadMentorV2(),
          group_chat: () => window.loadGroupChatV2 && window.loadGroupChatV2(),
        };
        window.goPage = function (name) {
          origGoPage(name);
          // After base goPage runs activatePage+loadPage, fire v2 loader if applicable
          setTimeout(() => {
            const fn = v2Loaders[name];
            if (fn) fn();
          }, 30);
        };
      }
      // Also handle hashchange (back/forward, direct URL) for v2 pages
      window.addEventListener('hashchange', () => {
        const curr = (location.hash || '').replace('#/', '').split('?')[0] || 'dashboard';
        if (['analytics','achievements','wallet','network','mentor','group_chat'].includes(curr)) {
          setTimeout(() => {
            if (curr === 'analytics' && window.loadAnalyticsV2) window.loadAnalyticsV2();
            else if (curr === 'achievements' && window.loadAchievementsV2) window.loadAchievementsV2();
            else if (curr === 'wallet' && window.loadWalletV2) window.loadWalletV2();
            else if (curr === 'network' && window.loadNetworkV2) window.loadNetworkV2();
            else if (curr === 'mentor' && window.loadMentorV2) window.loadMentorV2();
            else if (curr === 'group_chat' && window.loadGroupChatV2) window.loadGroupChatV2();
          }, 30);
        }
      });
      // Sync bottom-nav active state with current page
      window.addEventListener('hashchange', () => {
        const curr = (location.hash || '').replace('#/', '') || 'dashboard';
        document.querySelectorAll('.v2-bnav-btn').forEach(b => b.classList.toggle('active', b.dataset.go === curr));
      });
      console.log('[cabinet-v2] ready · theme=' + document.body.getAttribute('data-theme'));
    }, 200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
