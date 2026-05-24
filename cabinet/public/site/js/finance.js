/* Trendex Cabinet — Finance page (4 balances + topup/transfer/withdraw + history)
   Talks to /cabinet/api/finance/* and /cabinet/api/notifications/*. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' +
      (isErr ? '#ef4444' : 'linear-gradient(135deg,#FF2E97,#B14AED)') +
      ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(255,46,151,.3);z-index:10000';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }
  function fmtUsd(n) {
    n = Number(n) || 0;
    return n % 1 === 0 ? '$' + n.toFixed(0) : '$' + n.toFixed(2);
  }
  function relTime(iso) {
    if (!iso) return '';
    const d = (typeof iso === 'string') ? new Date(iso) : iso;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'только что';
    if (diff < 3600) return Math.floor(diff / 60) + ' мин';
    if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + ' дн';
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  }
  function api(method, path, body) {
    return fetch('/cabinet' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(async (r) => {
      const text = await r.text();
      if (!text) return { ok: r.ok, reason: r.ok ? null : 'empty_response_' + r.status };
      try {
        const data = JSON.parse(text);
        if (!r.ok && data && data.ok === undefined) data.ok = false;
        return data;
      } catch (_) {
        // Got HTML/text instead of JSON — usually 502/503 from upstream
        // (Cloudflare error page, gateway timeout, Platega misconfig).
        const isHtml = text.indexOf('<') === 0 || text.indexOf('<!DOCTYPE') !== -1;
        return {
          ok: false,
          reason: isHtml ? 'gateway_error_' + r.status : 'invalid_response_' + r.status,
          http_status: r.status,
        };
      }
    }).catch(e => ({ ok: false, reason: e.message }));
  }

  let STATE = { balances: null, options: null, txs: [] };

  async function fetchAll() {
    const [bal, opts, tx] = await Promise.all([
      api('GET', '/api/finance/balances'),
      api('GET', '/api/finance/tariff-options'),
      api('GET', '/api/finance/transactions?limit=50'),
    ]);
    _fetchTestPlacement();
    STATE.balances = bal && bal.ok ? bal : null;
    STATE.options = opts && opts.ok ? opts : null;
    STATE.txs = tx && tx.ok ? tx.items : [];
  }

  function balanceCard(label, valueUsd, sub, color, icon, extra) {
    return '<div class="fin-bal ' + color + '">' +
      '<div class="fin-bal-label">' + icon + ' ' + label + '</div>' +
      '<div class="fin-bal-value">' + valueUsd + '</div>' +
      (sub ? '<div class="fin-bal-sub">' + sub + '</div>' : '') +
      (extra || '') +
    '</div>';
  }

  function renderHeroWorking() {
    const b = STATE.balances && STATE.balances.balances;
    const usd = (b && b.working && b.working.usd) || 0;
    return '<div class="fin-hero">' +
      '<div class="fin-hero-label">🟢 Основной баланс</div>' +
      '<div class="fin-hero-amount">' + fmtUsd(usd) + '</div>' +
      '<div class="fin-hero-sub">Сюда падают заработанные средства · с него же выводишь и покупаешь тариф</div>' +
      '<div class="fin-hero-actions">' +
        '<button class="fin-hero-btn fin-hero-btn--topup" onclick="window.FinanceUI.scrollToTopup()">💳 Пополнить</button>' +
        '<button class="fin-hero-btn fin-hero-btn--transfer" onclick="window.FinanceUI._gotoTab(\'transfer\')">🔁 Перевести</button>' +
        '<button class="fin-hero-btn fin-hero-btn--withdraw" onclick="window.FinanceUI._gotoTab(\'withdraw\')">💸 Вывести</button>' +
      '</div>' +
    '</div>';
  }

  function renderOtherBalances() {
    const b = STATE.balances && STATE.balances.balances;
    if (!b) return '';
    const subProgress = (b.subscription && b.subscription.progress) || 0;
    const subCap = (b.subscription && b.subscription.cap_usd) || 0;
    return '<div class="fin-info-grid">' +
      '<div class="fin-info-card fin-info-card--sub">' +
        '<div class="fin-info-label">💎 Подписка</div>' +
        '<div class="fin-info-amount">' + fmtUsd(b.subscription.usd) + '</div>' +
        '<div class="fin-sub-progress" style="margin:8px 0"><div class="fin-sub-progress-fill" style="width:' + subProgress + '%"></div></div>' +
        '<div class="fin-info-hint">' + subProgress + '% от cap ' + fmtUsd(subCap) + '</div>' +
        '<div class="fin-info-source">Автоматически копится 20% с каждого дохода. Идёт на оплату ежемесячного тарифа. Перевести в Основной можно вручную.</div>' +
      '</div>' +
      '<div class="fin-info-card fin-info-card--gift">' +
        '<div class="fin-info-label">🎁 Gift</div>' +
        '<div class="fin-info-amount">' + fmtUsd(b.gift.usd) + '</div>' +
        '<div class="fin-info-hint">бонус за активацию мест</div>' +
        '<div class="fin-info-source">Тратится на рекламу внутри платформы. Не выводится. $5 после запуска / $10 до запуска за каждое бизнес-место.</div>' +
      '</div>' +
      '<div class="fin-info-card fin-info-card--karma">' +
        '<div class="fin-info-label">⚡ Карма</div>' +
        '<div class="fin-info-amount">' + (b.karma.points || 0) + ' <span style="font-size:14px;color:#94a3b8">pt</span></div>' +
        '<div class="fin-info-hint">для еженедельного розыгрыша</div>' +
        '<div class="fin-info-source">+1 за вход, +1 за задание, +10 за реферала купившего тариф, +20 за свой тариф. Топ-10 за неделю делят $100 в воскресенье 20:00 МСК.</div>' +
      '</div>' +
    '</div>';
  }

  function renderBalances() {
    return renderHeroWorking();
  }

  function renderTariffBanner() {
    const t = STATE.balances && STATE.balances.tariff;
    if (!t) return '';
    const code = String(t.code || 'free').toUpperCase();
    const isFree = code === 'FREE';
    const startedDate = t.started_at ? new Date(t.started_at) : null;
    const expiresDate = t.expires_at ? new Date(t.expires_at) : null;
    const daysLeft = expiresDate ? Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
    const fmtDate = (d) => d ? d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const seats = Number(t.seats || 0);
    const PRICES = { free: 0, launch: 45, boost: 90, rocket: 135 };
    const COLORS = { FREE: '#9ca3af', LAUNCH: '#10b981', BOOST: '#00D4FF', ROCKET: '#FF2E97' };
    const ICONS = { FREE: '🆓', LAUNCH: '🚀', BOOST: '⚡', ROCKET: '💎' };
    const tColor = COLORS[code] || '#9ca3af';
    const tIcon = ICONS[code] || '🚀';
    const tPrice = PRICES[String(t.code || 'free').toLowerCase()] || 0;

    let upgrade = null;
    if (STATE.options) {
      const order = ['launch', 'boost', 'rocket'];
      const cur = String(t.code).toLowerCase();
      const curIdx = order.indexOf(cur);
      const nextCode = curIdx >= 0 && curIdx < 2 ? order[curIdx + 1] : (cur === 'free' ? 'launch' : null);
      if (nextCode) {
        const opt = STATE.options.options.find(o => o.code === nextCode);
        if (opt && opt.action !== 'current' && opt.action !== 'locked') {
          upgrade = { code: nextCode, cost: opt.cost_usd, action: opt.action };
        }
      }
    }

    const daysColor = daysLeft == null ? '#94a3b8' : (daysLeft <= 3 ? '#ef4444' : daysLeft <= 7 ? '#fbbf24' : '#10b981');

    return '<div class="fin-tariff-card-big" style="background:linear-gradient(135deg,' + tColor + '11,' + tColor + '03);border:2px solid ' + tColor + '55;border-radius:18px;padding:24px;margin-bottom:18px">' +
      '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:' + (isFree ? '0' : '18px') + '">' +
        '<div style="font-size:54px;line-height:1">' + tIcon + '</div>' +
        '<div style="flex:1;min-width:200px">' +
          '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#94a3b8">Активный тариф</div>' +
          '<div style="font-family:Orbitron,monospace;font-size:34px;font-weight:900;color:' + tColor + ';line-height:1.1">' + code + (isFree ? '' : ' · $' + tPrice) + '</div>' +
          (isFree
            ? '<div style="font-size:13px;color:#cbd5e1;margin-top:4px">Базовый · до $20/день · L1 партнёрки 10%</div>'
            : '<div style="font-size:13px;color:#cbd5e1;margin-top:4px">' + seats + ' бизнес-' + (seats === 1 ? 'место' : 'места') + ' · авто-продление: ' + (t.auto_renew ? '<span style="color:#10b981">ВКЛ ✓</span>' : '<span style="color:#ef4444">ВЫКЛ</span>') + '</div>') +
        '</div>' +
        (upgrade
          ? '<button class="fin-tariff-cta" style="background:linear-gradient(135deg,' + tColor + ',#B14AED);color:#fff;border:none;padding:14px 22px;border-radius:12px;font-weight:800;cursor:pointer;font-size:14px" onclick="window.location.hash=\'#/marketing\'">' +
            (upgrade.action === 'upgrade' ? '🆙 Апнуться до ' + upgrade.code.toUpperCase() : '🚀 Активировать ' + upgrade.code.toUpperCase()) +
            ' · $' + upgrade.cost + '</button>'
          : '') +
      '</div>' +
      (isFree ? '' : '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">' +
        '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Куплен</div><div style="font-size:15px;font-weight:700;color:#fff;margin-top:2px">' + fmtDate(startedDate) + '</div></div>' +
        '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Действует до</div><div style="font-size:15px;font-weight:700;color:#fff;margin-top:2px">' + fmtDate(expiresDate) + '</div></div>' +
        (daysLeft != null ? '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Осталось</div><div style="font-size:15px;font-weight:800;color:' + daysColor + ';margin-top:2px">' + (daysLeft > 0 ? daysLeft + ' ' + (daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней') : 'истёк') + '</div></div>' : '') +
        '<div><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8">Мест в матрице</div><div style="font-size:15px;font-weight:800;color:' + tColor + ';margin-top:2px">' + seats + '</div></div>' +
      '</div>') +
    '</div>';
  }

  function renderTabs() {
    return '<div class="fin-tabs">' +
      '<button class="fin-tab active" data-tab="overview">📊 Обзор</button>' +
      '<button class="fin-tab" data-tab="transfer">🔁 Перевести</button>' +
      '<button class="fin-tab" data-tab="withdraw">💸 Вывести</button>' +
      '<button class="fin-tab" data-tab="karma">⚡ Карма</button>' +
      '<button class="fin-tab" data-tab="history">📜 История</button>' +
    '</div>';
  }

  async function _fetchTestPlacement() {
    try {
      const r = await api('GET', '/api/finance/test-placement');
      if (r && r.ok) STATE.placement = r;
    } catch (e) { /* non-fatal */ }
  }

  function _renderPlacementCard() {
    const p = STATE.placement;
    const isFree = !STATE.balances || !STATE.balances.tariff || STATE.balances.tariff.code === 'free';
    if (!p || !p.ok) return '';
    const t = p.tariffs;
    return '<div class="fin-form" style="background:linear-gradient(135deg,rgba(255,46,151,.06),rgba(0,212,255,.06));border:1px solid rgba(255,46,151,.2)">' +
      '<h3 style="margin:0 0 6px">🎯 Тестовая расстановка</h3>' +
      '<div style="font-size:12px;color:#94a3b8;margin-bottom:12px">' +
        'Команда: <b style="color:#fff">' + (p.team_total || 0) + '</b> чел. (L1: ' + (p.team_by_level[1]||0) + ', L2: ' + (p.team_by_level[2]||0) + ', L3: ' + (p.team_by_level[3]||0) + ')' +
      '</div>' +
      (isFree
        ? '<div style="font-size:13px;color:#cbd5e1;margin-bottom:10px">Если бы ты сейчас активировал тариф, твой потенциальный доход с этой команды был бы:</div>'
        : '<div style="font-size:13px;color:#cbd5e1;margin-bottom:10px">Сравнение тарифов на текущей команде (включая твой текущий план):</div>'
      ) +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr));gap:10px">' +
        '<div style="padding:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:10px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="color:#10b981">🚀 LAUNCH</b><span style="color:#9ca3af;font-size:11px">$45</span></div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:900;color:#10b981;margin:6px 0">' + t.launch.total_fmt + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;line-height:1.5">матрица: ' + t.launch.matrix_fmt + '<br>рефералы: ' + t.launch.refs_fmt + '</div>' +
        '</div>' +
        '<div style="padding:12px;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);border-radius:10px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="color:#00D4FF">⚡ BOOST</b><span style="color:#9ca3af;font-size:11px">$90</span></div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:900;color:#00D4FF;margin:6px 0">' + t.boost.total_fmt + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;line-height:1.5">матрица: ' + t.boost.matrix_fmt + '<br>рефералы: ' + t.boost.refs_fmt + '</div>' +
        '</div>' +
        '<div style="padding:12px;background:rgba(255,46,151,.08);border:1px solid rgba(255,46,151,.25);border-radius:10px">' +
          '<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="color:#FF2E97">💎 ROCKET</b><span style="color:#9ca3af;font-size:11px">$135</span></div>' +
          '<div style="font-family:Orbitron,sans-serif;font-size:22px;font-weight:900;color:#FF2E97;margin:6px 0">' + t.rocket.total_fmt + '</div>' +
          '<div style="font-size:11px;color:#94a3b8;line-height:1.5">матрица: ' + t.rocket.matrix_fmt + '<br>рефералы: ' + t.rocket.refs_fmt + (Number(t.rocket.matching_micro) > 0 ? '<br>matching: ' + t.rocket.matching_fmt : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#6b7280;margin-top:10px;font-style:italic">Разовая оценка при условии что вся команда купит средний тариф $90.</div>' +
    '</div>';
  }

  function _renderQuickActions() {
    return '<div class="fin-form fin-quick-actions" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(200px,100%),1fr));gap:10px;padding:16px">' +
      '<button class="fin-btn" style="background:linear-gradient(135deg,#10b981,#059669)" onclick="window.FinanceUI._gotoTab(\'topup\')">💳 Пополнить</button>' +
      '<button class="fin-btn" style="background:linear-gradient(135deg,#00D4FF,#B14AED)" onclick="window.FinanceUI._gotoTab(\'transfer\')">🔁 Перевести</button>' +
      '<button class="fin-btn" style="background:linear-gradient(135deg,#FF2E97,#B14AED)" onclick="window.FinanceUI._gotoTab(\'withdraw\')">💸 Вывести</button>' +
    '</div>';
  }

  function renderOverviewPanel() {
    const placementCard = _renderPlacementCard();
    const recent = STATE.txs.slice(0, 5);
    if (!recent.length) {
      return placementCard + '<div class="fin-form"><h3>📊 Обзор</h3><p style="color:#94a3b8;margin:0">Пока операций нет. Сделай первое задание на бирже или пригласи партнёра.</p></div>';
    }
    return placementCard + '<div class="fin-form">' +
      '<h3>📊 Последние 5 операций</h3>' +
      '<div class="fin-history">' +
      recent.map(txRow).join('') +
      '</div>' +
      '<p style="color:#94a3b8;font-size:12px;margin:12px 0 0">Полная история — во вкладке «📜 История»</p>' +
    '</div>';
  }

  function txRow(t) {
    const amt = Number(t.amount_usd) || 0;
    const isIncome = amt > 0;
    const isKarma = t.wallet === 'karma' || t.kind && t.kind.startsWith('karma_');
    const isTransfer = t.kind === 'transfer' || (t.kind && t.kind.startsWith('subscription_'));
    let iconCls = 'income';
    if (isKarma) iconCls = 'karma';
    else if (isTransfer) iconCls = 'transfer';
    else if (!isIncome) iconCls = 'expense';
    const icon = isKarma ? '⚡' : isTransfer ? '🔁' : isIncome ? '💵' : '💸';
    const kindMap = {
      task_reward: 'Биржа заданий',
      ad_view: 'Просмотр рекламы',
      'ref_L1': 'Партнёрка L1',
      'ref_L2': 'Партнёрка L2',
      'ref_L3': 'Партнёрка L3',
      'matching_bonus': 'Matching Bonus',
      'subscription_split': 'В автоподписку',
      'subscription_direct': 'В автоподписку',
      'tariff_renewal': 'Продление тарифа',
      'entry_fee': 'Покупка тарифа',
      'entry_fee_upgrade': 'Апгрейд тарифа',
      'withdraw_pending': 'Запрос вывода',
      'leader_pool_fund': 'Лидерский пул',
      'transfer': 'Перевод',
    };
    const label = kindMap[t.kind] || t.kind;
    const amtCls = isIncome ? 'income' : isKarma ? '' : 'expense';
    const amtStr = isKarma ? '+' + Math.abs(amt) : (isIncome ? '+' : '') + fmtUsd(amt);
    return '<div class="fin-tx">' +
      '<div class="fin-tx-icon ' + iconCls + '">' + icon + '</div>' +
      '<div class="fin-tx-body">' +
        '<div class="fin-tx-kind">' + label + '</div>' +
        (t.memo ? '<div class="fin-tx-memo">' + (t.memo.length > 60 ? t.memo.slice(0, 57) + '...' : t.memo) + '</div>' : '') +
        '<div class="fin-tx-time">' + relTime(t.created_at) + '</div>' +
      '</div>' +
      '<div class="fin-tx-amount ' + amtCls + '">' + amtStr + '</div>' +
    '</div>';
  }

  function renderTopupPanel() {
    return '<div class="fin-form">' +
      '<h3>💳 Пополнить ОСНОВНОЙ баланс</h3>' +
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px">Зачисление на 🟢 Основной баланс. Минимум $5. Другие балансы (Gift/Подписка/Карма) пополняются автоматически системой и через этот метод не доступны.</p>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Сумма $</label>' +
        '<div class="fin-chips">' +
          ['10','30','50','100','200'].map(v =>
            '<button class="fin-chip" onclick="document.getElementById(\'fin-topup-amount\').value=' + v + '">' + v + '</button>'
          ).join('') +
        '</div>' +
        '<input type="number" id="fin-topup-amount" class="fin-input" placeholder="50" min="5" step="1">' +
      '</div>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Метод оплаты</label>' +
        '<div class="fin-chips" style="flex-wrap:wrap;gap:6px">' +
          '<button class="fin-chip active" data-method="cryptobot">🪙 USDT (CryptoBot)</button>' +
          '<button class="fin-chip" data-method="platega_sbp">📱 СБП (Россия)</button>' +
          '<button class="fin-chip" data-method="platega_crypto">₿ Крипта (Platega)</button>' +
        '</div>' +
        '<div style="font-size:11px;color:#94a3b8;margin-top:6px">Зачисляется в USD на основной баланс. Курс к рублю Platega рассчитывает сама.</div>' +
      '</div>' +
      '<button class="fin-btn" onclick="window.FinanceUI._topup()">Перейти к оплате</button>' +
    '</div>';
  }

  function renderTransferPanel() {
    return '<div class="fin-form">' +
      '<h3>🔁 Перевод между балансами</h3>' +
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px">Например, перевести с 🟢 Основного на 🟣 Автоподписку чтобы накопить на тариф/апгрейд.</p>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Откуда</label>' +
        '<select id="fin-tx-from" class="fin-select">' +
          '<option value="working">🟢 Основной</option>' +
          '<option value="subscription">🟣 Автоподписка</option>' +
        '</select>' +
      '</div>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Куда</label>' +
        '<select id="fin-tx-to" class="fin-select">' +
          '<option value="subscription">🟣 Автоподписка</option>' +
          '<option value="working">🟢 Основной</option>' +
        '</select>' +
      '</div>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Сумма $</label>' +
        '<input type="number" id="fin-tx-amount" class="fin-input" placeholder="10" min="0.01" step="0.01">' +
      '</div>' +
      '<button class="fin-btn" onclick="window.FinanceUI._transfer()">Перевести</button>' +
    '</div>';
  }

  function renderWithdrawPanel() {
    return '<div class="fin-form">' +
      '<h3>💸 Вывод средств</h3>' +
      '<p style="color:#94a3b8;font-size:13px;margin:0 0 16px">С 🟢 Основного баланса. Минимум $3. Обработка вручную в течение 24ч.</p>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Сумма $</label>' +
        '<input type="number" id="fin-wd-amount" class="fin-input" placeholder="10" min="3" step="0.01">' +
      '</div>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Метод</label>' +
        '<select id="fin-wd-method" class="fin-select">' +
          '<option value="usdt_trc20">🪙 USDT TRC-20 (комиссия 2%)</option>' +
          '<option value="usdt_bep20">🪙 USDT BEP-20 (2%)</option>' +
          '<option value="card_rub">💳 Карта RUB (5%)</option>' +
          '<option value="sbp">📱 СБП (1%)</option>' +
        '</select>' +
      '</div>' +
      '<div class="fin-input-group">' +
        '<label class="fin-input-label">Адрес / номер карты</label>' +
        '<input type="text" id="fin-wd-address" class="fin-input" placeholder="TXxxx... или 1234 5678 ...">' +
      '</div>' +
      '<button class="fin-btn" onclick="window.FinanceUI._withdraw()">Создать заявку</button>' +
    '</div>';
  }

  function renderHistoryPanel() {
    if (!STATE.txs.length) return '<div class="fin-form"><h3>📜 История</h3><p style="color:#94a3b8;margin:0">Пока операций нет.</p></div>';
    return '<div class="fin-history">' + STATE.txs.map(txRow).join('') + '</div>';
  }

  function renderKarmaPanel() {
    // Karma panel uses a placeholder + async fetch (single-shot per tab open)
    setTimeout(_loadKarmaData, 50);
    return '<div class="fin-form" id="fin-karma-root"><div style="padding:30px;text-align:center;color:#94a3b8">⚡ Загрузка кармы...</div></div>';
  }

  async function _loadKarmaData() {
    const root = $('fin-karma-root');
    if (!root) return;
    const r = await api('GET', '/api/finance/karma');
    if (!r || !r.ok) {
      root.innerHTML = '<div style="padding:30px;text-align:center;color:#ef4444">Не удалось загрузить карму</div>';
      return;
    }
    const k = r.karma || {};
    const total = Number(k.total || 0);
    const week = Number(k.this_week || 0);
    const rank = k.my_rank;

    // Header big numbers
    let html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">';
    html += '<div style="background:linear-gradient(135deg,rgba(255,46,151,0.1),rgba(177,74,237,0.1));border:1px solid rgba(255,46,151,0.25);border-radius:12px;padding:16px;text-align:center">';
    html += '<div style="font-family:Orbitron,sans-serif;font-size:28px;font-weight:900;color:#FF2E97">' + total + '</div>';
    html += '<div style="font-size:11px;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;margin-top:4px">Всего кармы</div>';
    html += '</div>';
    html += '<div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center">';
    html += '<div style="font-family:Orbitron,sans-serif;font-size:28px;font-weight:900;color:#fff">' + week + '</div>';
    html += '<div style="font-size:11px;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;margin-top:4px">За неделю</div>';
    html += '</div>';
    html += '<div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;text-align:center">';
    html += '<div style="font-family:Orbitron,sans-serif;font-size:28px;font-weight:900;color:' + (rank ? '#10b981' : '#94a3b8') + '">' + (rank ? '#' + rank : '—') + '</div>';
    html += '<div style="font-size:11px;color:#94a3b8;letter-spacing:.1em;text-transform:uppercase;margin-top:4px">Твоё место</div>';
    html += '</div>';
    html += '</div>';

    // Info block
    html += '<div style="background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:16px">';
    html += '<h4 style="margin:0 0 8px;color:#f5f5fa">🎁 Розыгрыш каждое воскресенье 20:00 МСК</h4>';
    html += '<div style="font-size:13px;color:#94a3b8;line-height:1.6">';
    html += 'Призовой фонд <strong style="color:#10b981">$100</strong>, делится на топ-10 по карме за неделю.<br>';
    html += '1 место — $30, 2 — $20, 3 — $15, 4 — $10, 5 — $8, 6 — $6, 7 — $4, 8 — $3, 9-10 — по $2.<br>';
    html += '<span style="color:#FF2E97">Карма обнуляется в начале недели (ПН 00:00 МСК) для рейтинга, но общий total остаётся.</span>';
    html += '</div></div>';

    // Earn karma rules
    html += '<div style="background:#14122a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:16px;margin-bottom:16px">';
    html += '<h4 style="margin:0 0 10px;color:#f5f5fa;font-size:14px">⚡ Как зарабатывать карму:</h4>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:6px;font-size:12px">';
    var rules = [
      ['🔥 Login streak (день)', '+1'],
      ['✅ Задание на бирже', '+1'],
      ['📡 Подписка на эфир', '+3'],
      ['📝 Прошёл онбординг', '+5'],
      ['👥 Реферал зашёл', '+2'],
      ['💎 Реферал купил тариф', '+10'],
      ['🆙 Апгрейд тарифа', '+10'],
      ['🚀 Купил тариф', '+20'],
    ];
    rules.forEach(function(r) {
      html += '<div style="display:flex;justify-content:space-between;padding:6px 8px;background:rgba(255,255,255,0.03);border-radius:6px"><span style="color:#94a3b8">' + r[0] + '</span><strong style="color:#FF2E97">' + r[1] + '</strong></div>';
    });
    html += '</div></div>';

    // Leaderboard
    if (r.leaderboard && r.leaderboard.length) {
      html += '<h4 style="margin:18px 0 10px;color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em">🏆 Топ недели</h4>';
      html += '<div style="background:#14122a;border-radius:12px;border:1px solid rgba(255,255,255,0.06);overflow:hidden">';
      r.leaderboard.forEach(function(L) {
        var medal = L.rank === 1 ? '🥇' : L.rank === 2 ? '🥈' : L.rank === 3 ? '🥉' : '#' + L.rank;
        var prize = L.rank === 1 ? '$30' : L.rank === 2 ? '$20' : L.rank === 3 ? '$15' : L.rank === 4 ? '$10' : L.rank === 5 ? '$8' : L.rank === 6 ? '$6' : L.rank === 7 ? '$4' : L.rank === 8 ? '$3' : L.rank <= 10 ? '$2' : '—';
        html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03)">';
        html += '<div style="font-size:18px;width:36px;text-align:center">' + medal + '</div>';
        html += '<div style="flex:1;color:#94a3b8;font-size:13px">User #' + L.user_id + '</div>';
        html += '<div style="font-family:Orbitron,sans-serif;color:#fff;font-weight:700">' + L.points + ' к</div>';
        html += '<div style="color:#10b981;font-weight:700;width:50px;text-align:right">' + prize + '</div>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<div style="text-align:center;padding:24px;color:#94a3b8;background:#14122a;border-radius:12px;margin-top:18px">Топ ещё пуст — стань первым!</div>';
    }

    // Last raffle
    if (r.last_raffle) {
      var lr = r.last_raffle;
      html += '<h4 style="margin:18px 0 10px;color:#94a3b8;font-size:13px;text-transform:uppercase;letter-spacing:.1em">📅 Прошлый розыгрыш (' + new Date(lr.drawn_at).toLocaleDateString('ru-RU') + ')</h4>';
      html += '<div style="background:#14122a;border-radius:12px;border:1px solid rgba(255,255,255,0.06);padding:14px;font-size:13px;color:#94a3b8">';
      html += 'Призовой фонд: <strong style="color:#10b981">$' + lr.prize_pool_usd + '</strong> · Победителей: ' + lr.winners.length;
      html += '</div>';
    }

    root.innerHTML = html;
  }

  function renderPanel(tab) {
    switch (tab) {
      case 'overview': return renderOverviewPanel();
      case 'transfer': return renderTransferPanel();
      case 'withdraw': return renderWithdrawPanel();
      case 'karma':    return renderKarmaPanel();
      case 'history':  return renderHistoryPanel();
      default:         return renderOverviewPanel();
    }
  }

  async function render(activeTab) {
    activeTab = activeTab || 'overview';
    const root = $('financeContent') || $('finance_pageContent');
    if (!root) return;
    root.innerHTML = '<div class="fin-wrap">' + renderBalances() + renderOtherBalances() + '<div class="fin-topup-top">' + renderTopupPanel() + '</div>' + renderTariffBanner() + renderTabs() + '<div id="fin-panel" class="fin-panel active"></div></div>';
    $('fin-panel').innerHTML = renderPanel(activeTab);

    // Tab clicks
    root.querySelectorAll('.fin-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.fin-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('fin-panel').innerHTML = renderPanel(btn.dataset.tab);
      });
    });
    // Topup chip
    root.querySelectorAll('.fin-chip[data-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.fin-chip[data-method]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  window.FinanceUI = {};
  window.FinanceUI._gotoTab = function (tab) {
    const btn = document.querySelector('.fin-tab[data-tab="' + tab + '"]');
    if (btn) btn.click();
  };
  window.FinanceUI.scrollToTopup = function () {
    const el = document.querySelector('.fin-topup-top');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const inp = document.getElementById('fin-topup-amount');
      if (inp) setTimeout(function () { try { inp.focus(); } catch (_) {} }, 250);
    }
  };
  window.FinanceUI._topup = async function () {
    const usd = Number($('fin-topup-amount') ? $('fin-topup-amount').value : 0);
    if (!usd || usd < 5) { toast('Минимум $5', true); return; }
    if (usd > 5000) { toast('Максимум $5000 за раз', true); return; }
    const methodEl = document.querySelector('.fin-chip[data-method].active');
    const method = methodEl ? methodEl.dataset.method : 'cryptobot';
    // POST /api/finance/topup → cabinet bridge → api /create-topup-invoice
    // → returns pay_url. After payment the webhook credits Working balance.
    const r = await api('POST', '/api/finance/topup', { amount_usd: usd, method });
    if (!r || !r.ok) {
      const map = {
        amount_min_5: 'Минимум $5',
        amount_max_5000: 'Максимум $5000',
        invalid_method: 'Неверный метод оплаты',
        cryptobot_not_configured: 'CryptoBot не настроен',
        platega_not_configured: 'Платежный шлюз не настроен. Используй USDT (CryptoBot).',
        invoice_create_failed: 'Платёжный шлюз вернул ошибку. Попробуй другой метод или позже.',
        gateway_error_502: 'Платёжный сервис недоступен. Выбери USDT (CryptoBot) — он работает.',
        gateway_error_503: 'Платёжный сервис временно недоступен. Через минуту попробуй снова.',
        not_authenticated: 'Сессия истекла. Обнови страницу и войди.',
      };
      const code = (r && (r.reason || (r.error || ''))) || 'unknown';
      // For Platega-specific errors auto-fallback hint to user
      const friendly = map[code] || ('Ошибка: ' + code);
      toast(friendly, true);
      return;
    }
    const url = r.pay_url || r.mini_app_pay_url;
    if (url) window.location.href = url;
    else toast('Не получили платёжную ссылку', true);
  };
  window.FinanceUI._transfer = async function () {
    const from = $('fin-tx-from').value;
    const to = $('fin-tx-to').value;
    const usd = Number($('fin-tx-amount').value);
    if (!usd || usd <= 0) { toast('Сумма > 0', true); return; }
    if (from === to) { toast('Выбери разные кошельки', true); return; }
    const r = await api('POST', '/api/finance/transfer', { from, to, amount_micro: Math.floor(usd * 1e6) });
    if (!r || !r.ok) { toast('Ошибка: ' + (r && r.reason || 'unknown'), true); return; }
    toast('🔁 Переведено ' + fmtUsd(usd));
    setTimeout(() => render('overview'), 600);
    fetchAll();
  };
  window.FinanceUI._withdraw = async function () {
    const usd = Number($('fin-wd-amount').value);
    const method = $('fin-wd-method').value;
    const address = String($('fin-wd-address').value || '').trim();
    if (!usd || usd < 3) { toast('Минимум $3', true); return; }
    if (!address) { toast('Укажи адрес/номер', true); return; }
    const r = await api('POST', '/api/finance/withdraw', { amount_micro: Math.floor(usd * 1e6), method, address });
    if (!r || !r.ok) { toast('Ошибка: ' + (r && r.reason || 'unknown'), true); return; }
    toast('💸 Заявка на вывод создана. Обработка до 24ч.');
    setTimeout(() => render('history'), 600);
    fetchAll();
  };

  window.loadFinancePage = async function () {
    await fetchAll();
    render('overview');
  };

  // ──── Single-purpose page loaders (separate sidebar entries) ────
  // Each renders ONLY its panel into its own #page-<x> container, no
  // tab bar. Same render functions and event wiring as inside the rich
  // /finance overview, but isolated for users who want to focus on one
  // action.

  function _wireTopupChips(root) {
    if (!root) return;
    root.querySelectorAll('.fin-chip[data-method]').forEach(btn => {
      btn.addEventListener('click', () => {
        root.querySelectorAll('.fin-chip[data-method]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  window.loadTopupPage = async function () {
    const root = $('topupContent');
    if (!root) return;
    root.innerHTML = '<div class="fin-wrap">' + renderHeroWorking() + renderTopupPanel() + '</div>';
    _wireTopupChips(root);
    fetchAll().then(() => {
      // Re-render hero with fresh balance once data arrives.
      const wrap = root.querySelector('.fin-wrap');
      if (wrap) {
        wrap.innerHTML = renderHeroWorking() + renderTopupPanel();
        _wireTopupChips(root);
      }
    });
  };

  window.loadTransferPage = async function () {
    const root = $('transferContent');
    if (!root) return;
    root.innerHTML = '<div class="fin-wrap">' + renderHeroWorking() + renderTransferPanel() + '</div>';
    fetchAll().then(() => {
      const wrap = root.querySelector('.fin-wrap');
      if (wrap) wrap.innerHTML = renderHeroWorking() + renderTransferPanel();
    });
  };


  // ──── BELL ICON ────
  let _bellState = { items: [], unread: 0 };

  async function _bellRefresh() {
    const r = await api('GET', '/api/notifications?limit=20');
    if (r && r.ok) _bellState.items = r.items || [];
    const c = await api('GET', '/api/notifications/unread-count');
    if (c && c.ok) _bellState.unread = c.count || 0;
    _bellRender();
  }

  function _bellRender() {
    let host = document.getElementById('bell-host');
    if (!host) {
      // Inject into header. cab-nav-wrap holds nav buttons.
      const nav = document.querySelector('.cab-nav-wrap') || document.querySelector('header') || document.body;
      if (!nav) return;
      host = document.createElement('div');
      host.id = 'bell-host';
      host.className = 'bell-host';
      // Insert before logout button if exists
      const logoutBtn = nav.querySelector('.cab-nav-logout, [onclick*="doLogout"]');
      if (logoutBtn) nav.insertBefore(host, logoutBtn);
      else nav.appendChild(host);
    }
    const badge = _bellState.unread > 0 ? '<span class="bell-badge">' + _bellState.unread + '</span>' : '';
    host.innerHTML =
      '<button class="bell-btn" onclick="window.BellUI.toggle()" title="Уведомления">🔔' + badge + '</button>' +
      '<div class="bell-dropdown" id="bell-drop">' +
        '<div class="bell-head"><h4>Уведомления</h4>' +
          (_bellState.unread > 0 ? '<button class="bell-mark-all" onclick="window.BellUI.markAll()">Прочитать все</button>' : '') +
        '</div>' +
        '<div class="bell-list">' +
          (_bellState.items.length === 0
            ? '<div class="bell-empty">Уведомлений пока нет</div>'
            : _bellState.items.map(_bellItem).join('')
          ) +
        '</div>' +
      '</div>';
  }
  function _bellItem(n) {
    const cls = 'bell-item severity-' + (n.severity || 'info') + (n.is_read ? '' : ' unread');
    return '<div class="' + cls + '" onclick="window.BellUI.click(\'' + n.id + '\',\'' + (n.url || '').replace(/[\\\\\']/g, '') + '\')">' +
      '<div class="bell-item-title">' + (n.title || '') + '</div>' +
      (n.body ? '<div class="bell-item-body">' + n.body + '</div>' : '') +
      '<div class="bell-item-time">' + relTime(n.created_at) + '</div>' +
    '</div>';
  }

  window.BellUI = {
    toggle: function () {
      const d = document.getElementById('bell-drop'); if (!d) return;
      d.classList.toggle('open');
      if (d.classList.contains('open')) _bellRefresh();
    },
    markAll: async function () {
      await api('POST', '/api/notifications/read-all');
      _bellRefresh();
    },
    click: function (id, url) {
      api('POST', '/api/notifications/' + id + '/read');
      if (url) window.location.href = url;
      else _bellRefresh();
    },
  };

  // Auto-poll bell every 60s + initial load
  function _bellInit() {
    _bellRefresh();
    setInterval(_bellRefresh, 60_000);
    // Close dropdown on click outside
    document.addEventListener('click', e => {
      const d = document.getElementById('bell-drop');
      const h = document.getElementById('bell-host');
      if (d && h && !h.contains(e.target)) d.classList.remove('open');
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _bellInit);
  else setTimeout(_bellInit, 600);
  // Self-init: independently of cabinet.html's loadPage dispatcher,
  // listen for #/finance and render the page. This fixes the case where
  // a user has a stale cabinet.html cached without the case finance in
  // loadPage — the page was added in commit 5093106 but old browser tabs
  // still have the version that ignores #/finance.
  function _financeSelfInit() {
    const hash = (location.hash || '').replace(/^#\/?/, '').split('?')[0] || '';
    if (hash === 'finance' && typeof window.loadFinancePage === 'function') {
      // Make sure #page-finance exists and is visible
      const sec = document.getElementById('page-finance');
      if (sec) {
        document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
        sec.classList.add('active');
      }
      window.loadFinancePage();
    }
  }
  window.addEventListener('hashchange', _financeSelfInit);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _financeSelfInit, { once: true });
  } else {
    setTimeout(_financeSelfInit, 200);
  }

})();
