/* Golden Connect Cabinet — Маркетинг и тарифы */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#FF2E97,#B14AED)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(255,46,151,.3);z-index:10000;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 3000);
  }

  // Per official Golden Connect presentation (14 pages, April 2026).
  const TARIFFS = [
    {
      code: 'free', name: 'FREE', total: 0, entry: 0, monthly: 0, seats: 0,
      depth: 0, rate: 0, cycle: 0, badge: '🆓', color: '#9ca3af',
      features: [
        '✓ Кабинет: AdCenter, Tools, Bio, Маркетплейс',
        '✓ Заработок до <strong>$25/день</strong> за активность',
        '✓ <strong>L1 рефералка 10%</strong>',
        '✓ Статус <strong>PARTNER</strong> при 10+ рефах = +10% к ставке',
        '✗ Без матрицы переливов',
        '✗ Без линий 2-10',
      ],
      cta: null, cta_disabled: true,
    },
    {
      code: 'launch', name: 'LAUNCH', total: 45, entry: 45, monthly: 15, seats: 1,
      depth: 12, rate: 0.5, cycle: 4095, badge: '🚀', color: '#10b981',
      features: [
        '✓ Всё из FREE +',
        '✓ <strong>1 бизнес-место</strong> в матрице',
        '✓ Глубина <strong>12 уровней × $0.50</strong>',
        '✓ Партнёрка: <strong>L1-L3</strong> (10/5/5%)',
        '✓ <strong>+10%</strong> к ставке за активность',
        '✓ Цикл (30 дней): <strong>$4 095</strong>',
      ],
      cta: 'Активировать · $45', cta_disabled: false,
    },
    {
      code: 'boost', name: 'BOOST', total: 90, entry: 90, monthly: 30, seats: 2,
      depth: 14, rate: 0.6, cycle: 19660, badge: '⚡', color: '#00D4FF',
      features: [
        '✓ Всё из LAUNCH +',
        '✓ <strong>2 бизнес-места</strong>',
        '✓ Глубина <strong>14 уровней × $0.60</strong>',
        '✓ Партнёрка: <strong>L1-L5</strong> (10/5/5/3/3%)',
        '✓ Доход в <strong>3.6×</strong> при той же сети',
        '✓ Цикл (30 дней): <strong>$19 660</strong>',
      ],
      cta: 'Активировать · $90', cta_disabled: false, popular: true,
    },
    {
      code: 'rocket', name: 'ROCKET', total: 135, entry: 135, monthly: 45, seats: 3,
      depth: 17, rate: 0.7, cycle: 183499, badge: '🔥', color: '#FF2E97',
      features: [
        '✓ Всё из BOOST +',
        '✓ <strong>3 бизнес-места</strong>',
        '✓ Глубина <strong>17 уровней × $0.70</strong>',
        '✓ Партнёрка: <strong>все 10 линий</strong> (до 1% на L8-L10)',
        '✓ <strong>Matching Bonus</strong>: +10% от партнёрских L1-L3',
        '✓ Цикл (30 дней): <strong>$183 499</strong>',
      ],
      cta: 'Активировать · $135', cta_disabled: false,
    },
  ];

  // Per page 8 of presentation v2 — different limits per tariff
  const REFERRAL_PCT = [
    { l: 1,  free: 10, launch: 10,  boost: 10,  rocket: 10 },
    { l: 2,  free: 0,  launch: 5,   boost: 5,   rocket: 5 },
    { l: 3,  free: 0,  launch: 5,   boost: 5,   rocket: 5 },
    { l: 4,  free: 0,  launch: 0,   boost: 3,   rocket: 3 },
    { l: 5,  free: 0,  launch: 0,   boost: 3,   rocket: 3 },
    { l: 6,  free: 0,  launch: 0,   boost: 0,   rocket: 2 },
    { l: 7,  free: 0,  launch: 0,   boost: 0,   rocket: 2 },
    { l: 8,  free: 0,  launch: 0,   boost: 0,   rocket: 1 },
    { l: 9,  free: 0,  launch: 0,   boost: 0,   rocket: 1 },
    { l: 10, free: 0,  launch: 0,   boost: 0,   rocket: 1 },
  ];

  // Per page 11: top-15 leader pool distribution
  const LEADER_POOL = [
    { rank: 1, pct: 30 }, { rank: 2, pct: 20 }, { rank: 3, pct: 10 },
    { rank: 4, pct: 6 },  { rank: 5, pct: 5 },  { rank: 6, pct: 5 },
    { rank: 7, pct: 4 },  { rank: 8, pct: 4 },  { rank: 9, pct: 3 },
    { rank: 10, pct: 3 }, { rank: 11, pct: 3 }, { rank: 12, pct: 2 },
    { rank: 13, pct: 2 }, { rank: 14, pct: 2 }, { rank: 15, pct: 1 },
  ];

  let STATE = { stats: null, plategaOk: false };

  async function render() {
    const host = $('marketingContent'); if (!host) return;
    host.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загружаем данные…</div>';

    try {
      const [stats, st, bal] = await Promise.all([
        fetch('/cabinet/api/profile/stats', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null),
        fetch('/cabinet/api/platega/status', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({ configured: false })),
        fetch('/cabinet/api/finance/balances', { credentials: 'same-origin' }).then(r => r.json()).catch(() => null),
      ]);
      STATE.stats = stats;
      STATE.plategaOk = !!(st && st.configured);
      STATE.balances = bal;
    } catch (_) {}

    const refs = (STATE.stats && STATE.stats.referrals) || { total: 0, byLevel: {} };
    // REAL balances from api Postgres (was using planner ads-balance which is unrelated)
    const fb = (STATE.balances && STATE.balances.balances) || {};
    const workingUsd = Number(fb.working && fb.working.usd || 0);
    const giftUsd = Number(fb.gift && fb.gift.usd || 0);
    const subscriptionUsd = Number(fb.subscription && fb.subscription.usd || 0);
    const totalUsd = workingUsd + giftUsd + subscriptionUsd;

    let html = '';

    // Active tariff banner — only for paid tariffs
    const activeTariff = STATE.balances && STATE.balances.tariff;
    const activeCode = activeTariff && activeTariff.code ? String(activeTariff.code).toLowerCase() : 'free';
    if (activeTariff && activeCode !== 'free') {
      const code = activeCode.toUpperCase();
      const startedDate = activeTariff.started_at ? new Date(activeTariff.started_at) : null;
      const expiresDate = activeTariff.expires_at ? new Date(activeTariff.expires_at) : null;
      const daysLeft = expiresDate ? Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
      const fmtDate = function (d) { return d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'; };
      const seats = Number(activeTariff.seats || 0);
      const PRICES = { launch: 45, boost: 90, rocket: 135 };
      const COLORS = { LAUNCH: '#10b981', BOOST: '#00D4FF', ROCKET: '#FF2E97' };
      const ICONS = { LAUNCH: '🚀', BOOST: '⚡', ROCKET: '💎' };
      const tColor = COLORS[code] || '#10b981';
      const tIcon = ICONS[code] || '🚀';
      const tPrice = PRICES[activeCode] || 0;
      const daysColor = daysLeft == null ? '#94a3b8' : (daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#fbbf24' : '#10b981');
      const daysLabel = daysLeft == null ? '—' : (daysLeft > 0 ? daysLeft + ' ' + (daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней') : 'истёк');

      html += '<div class="cab-card mk-active-tariff" style="background:linear-gradient(135deg,' + tColor + '18,' + tColor + '05);border:2px solid ' + tColor + '66;margin-bottom:18px;padding:24px">' +
        '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:18px">' +
          '<div style="font-size:60px;line-height:1">' + tIcon + '</div>' +
          '<div style="flex:1;min-width:220px">' +
            '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8;font-weight:600">Твой активный тариф</div>' +
            '<div style="font-family:Orbitron,monospace;font-size:36px;font-weight:900;color:' + tColor + ';line-height:1.1;margin-top:4px">' + code + ' · $' + tPrice + '</div>' +
            '<div style="font-size:14px;color:#cbd5e1;margin-top:6px">' + seats + ' бизнес-' + (seats === 1 ? 'место' : 'места') + ' · авто-продление: ' + (activeTariff.auto_renew ? '<span style="color:#10b981;font-weight:700">ВКЛ ✓</span>' : '<span style="color:#ef4444;font-weight:700">ВЫКЛ</span>') + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">' +
          '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Куплен</div><div style="font-size:16px;font-weight:700;color:#fff;margin-top:2px">' + fmtDate(startedDate) + '</div></div>' +
          '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Действует до</div><div style="font-size:16px;font-weight:700;color:#fff;margin-top:2px">' + fmtDate(expiresDate) + '</div></div>' +
          '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Осталось</div><div style="font-size:16px;font-weight:800;color:' + daysColor + ';margin-top:2px">' + daysLabel + '</div></div>' +
          '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Мест в матрице</div><div style="font-size:16px;font-weight:800;color:' + tColor + ';margin-top:2px">' + seats + '</div></div>' +
        '</div>' +
      '</div>';
    }

    // Pre-launch banner — feature-flag aware
    html += '<div id="prelaunchBanner" class="cab-card" style="background:linear-gradient(135deg,rgba(251,191,36,.1),rgba(255,46,151,.1));border:1px solid rgba(251,191,36,.4);margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">' +
        '<div><div style="color:#fbbf24;font-weight:800;font-size:16px;margin-bottom:4px">🟡 Pre-launch режим</div>' +
        '<div style="font-size:13px;color:#cbd5e1;line-height:1.6">Можно покупать пакеты, тратить Gift, делать рекламу и продавать на маркетплейсе. Матрица и реферальные начисления <strong>расставятся chronologically</strong> когда админ активирует маркетинг.</div></div>' +
        '<div id="adminPanelSlot"></div>' +
      '</div>' +
    '</div>';

    // Hero
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(255,46,151,.08),rgba(177,74,237,.08));border:1px solid rgba(255,46,151,.25);margin-bottom:18px;text-align:center">' +
      '<div style="font-size:48px;margin-bottom:8px">🚀</div>' +
      '<h2 style="margin:0 0 8px;color:#fff;font-size:24px">Маркетинг Golden Connect 2026</h2>' +
      '<p style="margin:0 auto 14px;color:#cbd5e1;font-size:14px;line-height:1.6;max-width:680px">Партнёрская программа на 10 уровней + матрица переливов. Рефералка из 30% от каждой покупки распределяется на твою линейку — зарабатывай на чужой активности.</p>' +
    '</div>';

    // Current state KPIs — real balances from api Postgres
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px">' +
      '<div class="cab-card" style="text-align:center"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Working</div><div style="font-size:24px;font-weight:800;color:#10b981;font-family:Orbitron,monospace">$' + workingUsd.toFixed(2) + '</div><div style="font-size:10px;color:#9ca3af">для вывода</div></div>' +
      '<div class="cab-card" style="text-align:center"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Gift</div><div style="font-size:24px;font-weight:800;color:#fbbf24;font-family:Orbitron,monospace">$' + giftUsd.toFixed(2) + '</div><div style="font-size:10px;color:#9ca3af">на рекламу</div></div>' +
      '<div class="cab-card" style="text-align:center"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Subscription</div><div style="font-size:24px;font-weight:800;color:#B14AED;font-family:Orbitron,monospace">$' + subscriptionUsd.toFixed(2) + '</div><div style="font-size:10px;color:#9ca3af">на тариф</div></div>' +
      '<div class="cab-card" style="text-align:center"><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">Рефералов</div><div style="font-size:28px;font-weight:800;color:#FF2E97;font-family:Orbitron,monospace">' + (refs.total || 0) + '</div></div>' +
    '</div>';

    // Pre-launch banner ($10 vs $5 gift)
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(251,191,36,.1),rgba(255,46,151,.1));border:1px solid rgba(251,191,36,.4);margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">' +
      '<div><div style="color:#fbbf24;font-weight:800;font-size:18px;margin-bottom:4px">🎁 Условия до запуска: x2 Gift</div>' +
      '<div style="font-size:13px;color:#cbd5e1;line-height:1.6">До официального старта Golden Connect удваивает Gift-баланс: <strong style="color:#fbbf24">$10</strong> на каждое бизнес-место (после запуска — $5). Средства расходуются на баннерную/контекстную рекламу внутри платформы.</div></div>' +
      '<div style="font-size:42px">⏰</div>' +
    '</div>';

    // Tariff cards
    html += '<h3 style="color:#fff;margin:24px 0 14px">📋 Тарифы и матрица</h3>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px">';
    TARIFFS.forEach(function (t) {
      const popular = t.popular ? '<div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#FF2E97,#B14AED);color:#fff;padding:3px 14px;border-radius:20px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.05em">Популярный</div>' : '';
      html += '<div class="cab-card" style="position:relative;border:2px solid ' + t.color + (t.popular ? ';box-shadow:0 12px 40px ' + t.color + '33' : '') + ';display:flex;flex-direction:column">' +
        popular +
        '<div style="text-align:center;margin-bottom:12px"><div style="font-size:36px">' + t.badge + '</div>' +
        '<h3 style="margin:6px 0;color:' + t.color + ';font-size:22px">' + t.name + '</h3>' +
        (t.seats > 0 ? '<div style="color:#9ca3af;font-size:12px">' + t.seats + ' бизнес-мест' + (t.seats > 1 ? 'а' : 'о') + '</div>' : '<div style="color:#9ca3af;font-size:12px">базовый план</div>') +
        '</div>' +
        '<div style="text-align:center;margin-bottom:14px">' +
          (t.total === 0
            ? '<div style="font-size:32px;font-weight:800;color:#fff">Бесплатно</div>'
            : '<div style="font-size:32px;font-weight:800;color:#fff;line-height:1">$' + t.total + '</div>' +
              '<div style="color:#9ca3af;font-size:11px;margin-top:4px">далее $' + t.monthly + '/мес</div>') +
        '</div>' +
        '<ul style="list-style:none;padding:0;margin:0 0 18px;font-size:13px;color:#cbd5e1;line-height:1.7;flex:1">';
      t.features.forEach(function (f) { html += '<li>' + f + '</li>'; });
      html += '</ul>';
      if (t.cycle > 0) {
        html += '<div style="background:rgba(0,0,0,.3);padding:10px;border-radius:8px;text-align:center;margin-bottom:12px"><div style="font-size:11px;color:#9ca3af">Полный цикл матрицы<br><span style="font-size:9px">(30 дней)</span></div><div style="font-size:20px;font-weight:800;color:' + t.color + ';font-family:Orbitron,monospace">$' + t.cycle.toLocaleString('ru-RU') + '</div></div>';
      }
      if (t.cta && !t.cta_disabled) {
        html += '<button class="cab-btn cab-btn-primary" style="width:100%;background:linear-gradient(135deg,' + t.color + ',#B14AED);font-weight:800" onclick="window.MarketingUI.buy(\'' + t.code + '\')">' + t.cta + '</button>';
      } else {
        html += '<button class="cab-btn" disabled style="width:100%;opacity:.5;cursor:not-allowed">Текущий план</button>';
      }
      html += '</div>';
    });
    html += '</div>';
    html += '<div style="font-size:12px;color:#9ca3af;text-align:center;margin-bottom:24px">На одном аккаунте можно открыть неограниченное количество бизнес-мест — каждое увеличивает доход с той же сети.</div>';

    // Referral table (per page 8)
    html += '<div class="cab-card" style="margin-bottom:18px"><h3 style="margin:0 0 12px;color:#fff">🌳 Партнёрские начисления по линиям</h3>' +
      '<div style="font-size:12px;color:#9ca3af;margin-bottom:10px">Процент от дохода приглашённых партнёров на соответствующей линии</div>' +
      '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="border-bottom:1px solid rgba(255,255,255,.08);color:#9ca3af;font-size:11px;text-transform:uppercase">' +
          '<th style="text-align:left;padding:8px 6px">Линия</th>' +
          '<th style="text-align:right;padding:8px 6px;color:#9ca3af">FREE / PARTNER</th>' +
          '<th style="text-align:right;padding:8px 6px;color:#10b981">LAUNCH</th>' +
          '<th style="text-align:right;padding:8px 6px;color:#00D4FF">BOOST</th>' +
          '<th style="text-align:right;padding:8px 6px;color:#FF2E97">ROCKET</th>' +
        '</tr></thead><tbody>';
    let sumFree = 0, sumLaunch = 0, sumBoost = 0, sumRocket = 0;
    REFERRAL_PCT.forEach(function (r) {
      sumFree += r.free; sumLaunch += r.launch; sumBoost += r.boost; sumRocket += r.rocket;
      const fmt = (v, color) => v > 0
        ? '<td style="text-align:right;padding:6px;color:' + color + ';font-weight:700">' + v + '%</td>'
        : '<td style="text-align:right;padding:6px;color:#3a3f4a">—</td>';
      html += '<tr style="border-bottom:1px solid rgba(255,255,255,.04)">' +
        '<td style="padding:6px;color:#fff;font-weight:700">L' + r.l + '</td>' +
        fmt(r.free, '#cbd5e1') +
        fmt(r.launch, '#10b981') +
        fmt(r.boost, '#00D4FF') +
        fmt(r.rocket, '#FF2E97') +
        '</tr>';
    });
    html += '<tr style="border-top:1px solid rgba(255,255,255,.15);font-weight:800"><td style="padding:8px 6px;color:#fff">Итого</td>' +
      '<td style="text-align:right;padding:8px 6px;color:#cbd5e1">' + sumFree + '%</td>' +
      '<td style="text-align:right;padding:8px 6px;color:#10b981">' + sumLaunch + '%</td>' +
      '<td style="text-align:right;padding:8px 6px;color:#00D4FF">' + sumBoost + '%</td>' +
      '<td style="text-align:right;padding:8px 6px;color:#FF2E97">' + sumRocket + '%</td></tr>';
    html += '</tbody></table></div></div>';

    // Matching Bonus + Leader Pool
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(360px,100%),1fr));gap:14px;margin-bottom:18px">';
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(255,46,151,.05),rgba(177,74,237,.05));border:1px solid rgba(255,46,151,.25)">' +
      '<h3 style="margin:0 0 12px;color:#FF2E97">🏆 Matching Bonus (только ROCKET)</h3>' +
      '<div style="font-size:13px;color:#cbd5e1;line-height:1.7;margin-bottom:10px">Дополнительные <strong style="color:#FF2E97">10%</strong> от партнёрских начислений твоих рефералов до 3-й линии включительно — сверх всех прочих доходов.</div>' +
      '<div style="background:rgba(0,0,0,.3);padding:10px;border-radius:8px;font-size:12px;color:#cbd5e1"><strong>Пример:</strong> рефералы L1 получили партнёрских $100 → Matching Bonus тебе = <strong style="color:#10b981">$10</strong></div>' +
    '</div>';
    html += '<div class="cab-card" style="background:linear-gradient(135deg,rgba(251,191,36,.05),rgba(255,46,151,.05));border:1px solid rgba(251,191,36,.25)">' +
      '<h3 style="margin:0 0 12px;color:#fbbf24">👑 Leader Pool</h3>' +
      '<div style="font-size:13px;color:#cbd5e1;line-height:1.7;margin-bottom:10px">Доход с 3 верхних админ-аккаунтов Golden Connect → пул топ-15 партнёров. Распределение <strong>1 и 15 числа</strong> каждого месяца по обороту/активности.</div>' +
      '<div style="font-size:11px;color:#9ca3af">Топ-3: 30% / 20% / 10%. Остальные 12 мест: 6/5/5/4/4/3/3/3/2/2/2/1%</div>' +
    '</div>';
    html += '</div>';

    // Splits explanation
    html += '<div class="cab-card" style="background:rgba(0,0,0,.25);margin-bottom:18px">' +
      '<h3 style="margin:0 0 12px;color:#fff">💸 Как делится каждая активация бизнес-места</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;font-size:13px">' +
        '<div style="padding:12px;background:rgba(16,185,129,.1);border-radius:8px;border:1px solid rgba(16,185,129,.25)"><div style="font-size:24px;font-weight:800;color:#10b981">40%</div><div style="color:#9ca3af">Матрица переливов</div></div>' +
        '<div style="padding:12px;background:rgba(0,212,255,.1);border-radius:8px;border:1px solid rgba(0,212,255,.25)"><div style="font-size:24px;font-weight:800;color:#00D4FF">30%</div><div style="color:#9ca3af">10 уровней рефералки</div></div>' +
        '<div style="padding:12px;background:rgba(177,74,237,.1);border-radius:8px;border:1px solid rgba(177,74,237,.25)"><div style="font-size:24px;font-weight:800;color:#B14AED">20%</div><div style="color:#9ca3af">Task Pool</div></div>' +
        '<div style="padding:12px;background:rgba(251,191,36,.1);border-radius:8px;border:1px solid rgba(251,191,36,.25)"><div style="font-size:24px;font-weight:800;color:#fbbf24">10%</div><div style="color:#9ca3af">Платформа</div></div>' +
      '</div>' +
    '</div>';

    // Referral levels chart (current user state)
    html += '<div class="cab-card">' +
      '<h3 style="margin:0 0 12px;color:#fff">📊 Твоя 10-уровневая линейка</h3>';
    let totalRefs = 0;
    for (let i = 1; i <= 10; i++) {
      const n = (refs.byLevel && refs.byLevel[i]) || 0;
      totalRefs += n;
      const w = Math.max(2, n * 12);
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px"><span style="width:60px;color:#9ca3af;font-size:12px">L' + i + '</span>' +
        '<div style="flex:1;background:rgba(0,0,0,.25);border-radius:4px;overflow:hidden;height:18px;position:relative"><div style="background:linear-gradient(90deg,#00D4FF,#B14AED);height:100%;width:' + Math.min(100, w) + '%;display:flex;align-items:center;padding-left:8px;font-size:11px;color:#fff;font-weight:700">' + (n > 0 ? n : '') + '</div></div></div>';
    }
    html += '<div style="margin-top:10px;font-size:13px;color:#9ca3af;text-align:right">Всего рефералов: <strong style="color:#fff">' + totalRefs + '</strong></div>' +
    '</div>';

    host.innerHTML = html;
  }

  window.MarketingUI = {};

  function _fmtUsd(n) {
    n = Number(n) || 0;
    return n % 1 === 0 ? '$' + n.toFixed(0) : '$' + n.toFixed(2);
  }

  // ── BALANCE-DRIVEN BUY FLOW ──
  // 1. Fetch /api/finance/tariff-options → costs + can_afford
  // 2. If can_afford → confirm modal → POST buy-tariff/upgrade-tariff
  // 3. If shortfall → modal with topup CTA
  window.MarketingUI.buy = async function (tariffCode) {
    let opts;
    try {
      const r = await fetch('/cabinet/api/finance/tariff-options', { credentials: 'same-origin' });
      opts = await r.json();
      if (!r.ok || !opts.ok) {
        if (r.status === 401) {
          toast('Сессия истекла. Перенаправляю на вход...', true);
          setTimeout(() => {
            window.location.href = '/cabinet/login?next=' + encodeURIComponent(window.location.pathname + window.location.hash);
          }, 1200);
          return;
        }
        toast('Не удалось получить балансы: ' + (opts.reason || r.status), true);
        return;
      }
      // [tariff-opts-no-tg] User registered email-only, no Telegram link → no api account yet.
      // Show a friendly prompt instead of trying to render an empty options grid.
      if (opts.user_state === 'no_api_account') {
        toast(opts.hint || 'Привяжи Telegram чтобы открыть кошелёк и тарифы — /start у @GoldenConnect_bizbot', true);
        return;
      }
    } catch (e) {
      toast('Ошибка соединения: ' + e.message, true);
      return;
    }
    const target = opts.options.find(function (o) { return o.code === tariffCode; });
    if (!target) { toast('Тариф не найден', true); return; }
    if (target.action === 'current') { toast('Этот тариф уже активен', true); return; }
    if (target.action === 'locked')  { toast('Понижение тарифа не поддерживается', true); return; }
    if (!target.can_afford) { _showShortfallModal(tariffCode, target, opts); return; }
    _showConfirmBuyModal(tariffCode, target, opts);
  };

  function _showConfirmBuyModal(tariffCode, target, opts) {
    const isUpgrade = target.action === 'upgrade';
    const fromSubUsd = Number(target.from_subscription_micro) / 1e6;
    const fromWorkUsd = Number(target.from_working_micro) / 1e6;
    const m = document.createElement('div');
    m.id = 'tariffBuyModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    const seatsLabel = target.seats === 1 ? 'место' : (target.seats < 5 ? 'места' : 'мест');
    m.innerHTML =
      '<div class="cab-card" style="max-width:480px;width:100%">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<h3 style="margin:0">' + (isUpgrade ? '🆙 Апгрейд' : '🚀 Активация') + ' тарифа</h3>' +
          '<button onclick="document.getElementById(\'tariffBuyModal\').remove()" style="background:none;border:none;color:#9ca3af;font-size:22px;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="text-align:center;margin-bottom:18px">' +
          '<div style="font-size:13px;color:#9ca3af">' + (isUpgrade ? 'Доплата за апгрейд' : 'Стоимость активации') + '</div>' +
          '<div style="font-size:36px;font-weight:900;background:linear-gradient(135deg,#FF2E97,#B14AED);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">' + _fmtUsd(target.cost_usd) + '</div>' +
          '<div style="font-size:13px;color:#9ca3af">тариф ' + tariffCode.toUpperCase() + ' · ' + target.seats + ' бизнес-' + seatsLabel + '</div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:14px;margin-bottom:14px">' +
          '<div style="font-size:12px;color:#9ca3af;letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Будет списано:</div>' +
          (fromSubUsd > 0 ? '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:#B14AED">🟣 Автоподписка</span><strong style="color:#fff">' + _fmtUsd(fromSubUsd) + '</strong></div>' : '') +
          (fromWorkUsd > 0 ? '<div style="display:flex;justify-content:space-between;padding:8px 0"><span style="color:#10b981">🟢 Основной</span><strong style="color:#fff">' + _fmtUsd(fromWorkUsd) + '</strong></div>' : '') +
        '</div>' +
        '<button class="cab-btn cab-btn-primary" style="width:100%;padding:14px;font-size:15px" id="tariffBuyConfirmBtn">' +
          (isUpgrade ? '🆙 Апгрейдить за ' : '🚀 Купить за ') + _fmtUsd(target.cost_usd) +
        '</button>' +
        '<button class="cab-btn" style="width:100%;padding:10px;background:transparent;color:#9ca3af;margin-top:8px" onclick="document.getElementById(\'tariffBuyModal\').remove()">Отмена</button>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById('tariffBuyConfirmBtn').addEventListener('click', function () {
      _executeBuy(tariffCode, isUpgrade);
    });
  }

  function _showShortfallModal(tariffCode, target, opts) {
    const shortfall = Number(target.shortfall_micro) / 1e6;
    const totalAvail = Number(opts.balances.total_available_micro) / 1e6;
    const m = document.createElement('div');
    m.id = 'tariffShortfallModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    m.innerHTML =
      '<div class="cab-card" style="max-width:480px;width:100%">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
          '<h3 style="margin:0">⚠️ Недостаточно средств</h3>' +
          '<button onclick="document.getElementById(\'tariffShortfallModal\').remove()" style="background:none;border:none;color:#9ca3af;font-size:22px;cursor:pointer">✕</button>' +
        '</div>' +
        '<div style="text-align:center;margin-bottom:18px">' +
          '<div style="font-size:13px;color:#9ca3af">Не хватает</div>' +
          '<div style="font-size:32px;font-weight:900;color:#ef4444">' + _fmtUsd(shortfall) + '</div>' +
          '<div style="font-size:13px;color:#9ca3af">для ' + (target.action === 'upgrade' ? 'апгрейда до ' : 'покупки ') + tariffCode.toUpperCase() + '</div>' +
        '</div>' +
        '<div style="background:rgba(0,0,0,.25);border-radius:10px;padding:14px;margin-bottom:14px;font-size:13px;color:#9ca3af">' +
          'Нужно: <strong style="color:#fff">' + _fmtUsd(target.cost_usd) + '</strong><br>' +
          'Доступно (Основной + Автоподписка): <strong style="color:#fff">' + _fmtUsd(totalAvail) + '</strong>' +
        '</div>' +
        '<button class="cab-btn cab-btn-primary" style="width:100%;padding:14px;margin-bottom:8px" onclick="window.location.hash=\'#/finance\';document.getElementById(\'tariffShortfallModal\').remove();">💰 Пополнить баланс</button>' +
        '<button class="cab-btn" style="width:100%;padding:10px;background:transparent;color:#9ca3af" onclick="document.getElementById(\'tariffShortfallModal\').remove()">Закрыть</button>' +
      '</div>';
    document.body.appendChild(m);
  }

  async function _executeBuy(tariffCode, isUpgrade) {
    const btn = document.getElementById('tariffBuyConfirmBtn');
    if (btn) { btn.disabled = true; btn.textContent = '⚡ Обработка...'; }
    try {
      const url = isUpgrade ? '/cabinet/api/finance/upgrade-tariff' : '/cabinet/api/finance/buy-tariff';
      const r = await fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tariff: tariffCode, source_policy: 'subscription_first' }),
      });
      const d = await r.json();
      const m = document.getElementById('tariffBuyModal');
      if (m) m.remove();
      if (!r.ok || !d.ok) {
        const reason = d.reason || ('http_' + r.status);
        const msg = reason === 'insufficient_funds' ? 'Недостаточно средств'
          : reason === 'cannot_downgrade' ? 'Понижение тарифа не поддерживается'
          : reason === 'already_has_paid_tariff_use_upgrade' ? 'Уже есть платный тариф — используйте апгрейд'
          : reason === 'no_active_tariff_use_buy' ? 'Сначала купите базовый тариф'
          : 'Ошибка: ' + reason;
        toast(msg, true);
        return;
      }
      const usd = Number(d.amount_paid_micro) / 1e6;
      toast((isUpgrade ? '🆙 Апгрейд успешен! Списано ' : '🚀 Тариф активирован! Списано ') + _fmtUsd(usd));
      setTimeout(function () { if (typeof render === 'function') render(); }, 1200);
    } catch (e) {
      toast('Ошибка соединения: ' + e.message, true);
    }
  }


  
  // Load admin status + show "Активировать маркетинг" button if user is admin
  async function _loadAdminPanel() {
    try {
      const r = await fetch('/cabinet/api/admin/marketing/status', { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      if (!d.ok) return;
      const slot = document.getElementById('adminPanelSlot');
      if (!slot) return;
      slot.innerHTML = '<div style="text-align:right">' +
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">Админ-панель · Pending: <strong>' + d.pending_bookings + '</strong></div>' +
        (d.marketing_active
          ? '<button class="cab-btn" onclick="window.MarketingUI.deactivate()" style="background:#ef4444;color:#fff">⏸ Деактивировать маркетинг</button>'
          : '<button class="cab-btn cab-btn-primary" onclick="window.MarketingUI.activate()" style="background:linear-gradient(135deg,#10b981,#00D4FF)">🚀 АКТИВИРОВАТЬ МАРКЕТИНГ (' + d.pending_bookings + ')</button>') +
      '</div>';
    } catch (_) { /* not admin or endpoint missing — ignore */ }
  }

  window.MarketingUI.activate = async function () {
    if (!confirm('Точно запустить маркетинг? Будут обработаны ВСЕ pending бронирования chronologically (matrix + refs + matching). Это необратимо.')) return;
    try {
      const r = await fetch('/cabinet/api/admin/marketing/activate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun: false }) });
      const d = await r.json();
      if (!r.ok || !d.ok) return toast('Ошибка: ' + (d.reason || r.status), true);
      toast('🚀 Маркетинг активирован! Обработано ' + d.processed + ' из ' + d.candidates + ', ошибок: ' + d.failed);
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.MarketingUI.deactivate = async function () {
    if (!confirm('Деактивировать маркетинг (pre-launch снова)? Старые начисления НЕ откатятся, новые покупки будут только записываться как booking.')) return;
    try {
      const r = await fetch('/cabinet/api/admin/marketing/deactivate', { method: 'POST', credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok || !d.ok) return toast('Ошибка: ' + (d.reason || r.status), true);
      toast('⏸ Маркетинг деактивирован');
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  // Auto-fetch admin panel after render
  const _origRender = render;
  window.loadMarketingPage = function () { _origRender(); setTimeout(_loadAdminPanel, 200); };
})();
