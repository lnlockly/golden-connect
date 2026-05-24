/* Golden Connect Cabinet — GiftClub pages (5 sub-views).
   Reads from /cabinet/api/me/gift/* (which proxies to golden-connect-api /me/gift/*).
   Imported via migration from GiftClub MySQL — see gift_* tables in Neon. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  // Helper: format USDT — input is bigint micro (×10^8) as string or number
  function fmtUsdt(microStr) {
    const micro = typeof microStr === 'bigint' ? microStr : BigInt(microStr || 0);
    const whole = micro / 100000000n;
    const frac = micro % 100000000n;
    const fracStr = String(frac).padStart(8, '0').substring(0, 4);
    return Number(whole).toLocaleString('ru-RU') + '.' + fracStr;
  }
  function fmtMicroToNum(m) { return Number(BigInt(m || 0)) / 100000000; }

  function api(method, path, body) {
    return fetch('/cabinet' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
  }

  function emptyState(title, hint) {
    return '<div class="gift-empty"><h3>' + title + '</h3><p>' + (hint || '') + '</p></div>';
  }
  function notLinkedBanner() {
    return '<div class="gift-empty">' +
      '<h3>🎁 Вы пока не связаны с аккаунтом GiftClub</h3>' +
      '<p>Если у вас был аккаунт на giftclub.online — мы привяжем его автоматически при первом входе с того же Telegram-аккаунта. Все балансы и статусы появятся здесь.</p>' +
      '</div>';
  }

  // ===========================================================
  // PAGE 1: Overview
  // ===========================================================
  window.loadGiftOverviewPage = async function () {
    const root = $('giftOverviewContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка GIFT данных…</div>';
    const d = await api('GET', '/api/me/gift/overview');
    if (!d || !d.ok) {
      root.innerHTML = emptyState('Ошибка загрузки', d && d.error ? d.error : 'Нет ответа от сервера');
      return;
    }
    if (!d.linked) { root.innerHTML = notLinkedBanner(); return; }

    const giverLine = d.giver_level
      ? '<b>Д-' + d.giver_level.level + '</b> · от ' + fmtUsdt(d.giver_level.min_amount_micro) + ' USDT'
      : 'не присвоен';
    const leaderLine = d.leader_level
      ? '<b>Л-' + d.leader_level.level + '</b> · нужно ' + d.leader_level.needs_ref + ' рефералов'
      : 'не присвоен';
    const html = `
      <div class="gift-hero">
        <div class="gift-badge">🎁 GiftClub</div>
        <h2>Привет, ${d.name || 'участник GIFT'}!</h2>
        <p class="gift-sub">Аккаунт <code>gc_user_id=${d.gc_user_id}</code> · роль: <b>${d.role}</b></p>
      </div>
      <div class="gift-cards">
        <div class="gift-card gift-card-gold">
          <div class="gift-card-label">💰 Суммарный GIFT баланс</div>
          <div class="gift-card-value">${fmtUsdt(d.total_balance_micro)} <span class="gift-card-cur">USDT</span></div>
          <div class="gift-card-sub">по ${d.types_with_balance} типам балансов</div>
        </div>
        <div class="gift-card">
          <div class="gift-card-label">🏆 Категория Дарителя</div>
          <div class="gift-card-value-sm">${giverLine}</div>
        </div>
        <div class="gift-card">
          <div class="gift-card-label">👑 Уровень Лидера</div>
          <div class="gift-card-value-sm">${leaderLine}</div>
        </div>
        <div class="gift-card">
          <div class="gift-card-label">🔁 Мульти-аккаунты</div>
          <div class="gift-card-value-sm">${d.multi_accounts > 0 ? d.multi_accounts + ' дополнительных' : 'только основной'}</div>
        </div>
      </div>
      <div class="gift-actions">
        <button class="gift-btn" onclick="goPage('gift-balances')">💰 Все балансы</button>
        <button class="gift-btn" onclick="goPage('gift-statuses')">🏆 Статусы</button>
        <button class="gift-btn" onclick="goPage('gift-network')">🌳 Реф-сеть</button>
        ${d.multi_accounts > 0 ? '<button class="gift-btn" onclick="goPage(\'gift-accounts\')">🔁 Переключить аккаунт</button>' : ''}
      </div>
      <div class="gift-info">
        <h4>ℹ О GiftClub</h4>
        <p>GiftClub — это маркетинг и реферальная программа от giftclub.online, объединённая с Golden Connect. Ваши накопленные балансы и статусы перенесены и доступны только для просмотра. Балансы можно вывести через стандартный Golden Connect-флоу.</p>
      </div>
    `;
    root.innerHTML = html;
  };

  // ===========================================================
  // PAGE 2: Balances
  // ===========================================================
  function wdStatusLabel(s) {
    return { pending: '⏳ В обработке', approved: '✅ Одобрено', paid: '💸 Выплачено', rejected: '❌ Отклонено' }[s] || s;
  }

  window.loadGiftBalancesPage = async function () {
    const root = $('giftBalancesContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка балансов…</div>';
    const d = await api('GET', '/api/me/gift/balances');
    if (!d || !d.ok) { root.innerHTML = emptyState('Ошибка', d && d.error); return; }
    if (d.linked === false) { root.innerHTML = notLinkedBanner(); return; }

    const two = d.two || { main_micro: '0', current_micro: '0' };
    const wd = await api('GET', '/api/me/gift/withdrawals');
    const wdList = (wd && wd.ok && wd.withdrawals) || [];

    const wdRows = wdList.length ? wdList.map(w => `
      <tr>
        <td>${fmtUsdt(w.amount_micro)} USDT</td>
        <td>${w.network} · <span class="gp-mono">${(w.address || '').slice(0, 10)}…</span></td>
        <td>${wdStatusLabel(w.status)}</td>
        <td>${new Date(w.created_at).toLocaleDateString('ru-RU')}</td>
      </tr>`).join('') : '<tr><td colspan="4" class="gift-t-center">Заявок пока нет</td></tr>';

    root.innerHTML = `
      <div class="gift-page-head"><h2>💰 Балансы</h2></div>
      <div class="gb-cards">
        <div class="gb-card gb-card-main">
          <div class="gb-card-label">🟦 Основной баланс</div>
          <div class="gb-card-amt">${fmtUsdt(two.main_micro)} <span class="gb-cur">USDT</span></div>
          <div class="gb-card-hint">Пополняется с личного кошелька. Используется для покупки статусов Даритель.</div>
          <div class="gb-card-actions">
            <button class="gift-btn" onclick="window._gbTopup()">Пополнить</button>
            <button class="gift-btn gift-btn-ghost" onclick="window._gbTransfer('to_current')">→ в Текущий</button>
          </div>
        </div>
        <div class="gb-card gb-card-current">
          <div class="gb-card-label">🟩 Текущий баланс</div>
          <div class="gb-card-amt">${fmtUsdt(two.current_micro)} <span class="gb-cur">USDT</span></div>
          <div class="gb-card-hint">Заработок и кешбэк. Вывод от ${10} USDT, либо перевод на Основной.</div>
          <div class="gb-card-actions">
            <button class="gift-btn" onclick="window._gbWithdraw()">Вывести</button>
            <button class="gift-btn gift-btn-ghost" onclick="window._gbTransfer('to_main')">→ в Основной</button>
          </div>
        </div>
      </div>
      <div id="gbActionPanel"></div>
      <div class="gift-page-head" style="margin-top:18px"><h3 style="margin:0;color:#cbd5e1;font-size:15px">📋 Заявки на вывод</h3></div>
      <div class="gift-table-wrap">
        <table class="gift-table">
          <thead><tr><th>Сумма</th><th>Адрес</th><th>Статус</th><th>Дата</th></tr></thead>
          <tbody>${wdRows}</tbody>
        </table>
      </div>
    `;
  };

  function _gbPanel(html) { const p = $('gbActionPanel'); if (p) { p.innerHTML = html; p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } }

  window._gbTopup = function () {
    _gbPanel(`
      <div class="gb-form">
        <h4>Пополнить Основной с личного кошелька (1:1)</h4>
        <input id="gbTopupAmt" class="gift-search" type="number" min="1" step="0.01" placeholder="Сумма в USDT" style="width:100%;margin-bottom:10px">
        <div id="gbMsg"></div>
        <button class="gift-btn" style="width:100%" onclick="window._gbDoTopup()">Пополнить</button>
      </div>`);
  };
  window._gbDoTopup = async function () {
    const amt = parseFloat(($('gbTopupAmt') || {}).value);
    const msg = $('gbMsg');
    if (!(amt > 0)) { if (msg) msg.innerHTML = '<div class="gp-err">Введите сумму</div>'; return; }
    if (msg) msg.innerHTML = '<div class="gift-loading">Отправка…</div>';
    const r = await api('POST', '/api/me/gift/topup', { amount_usdt: amt });
    _gbAfter(r, 'Основной баланс пополнен');
  };

  window._gbTransfer = function (direction) {
    const label = direction === 'to_current' ? 'из Основного в Текущий' : 'из Текущего в Основной';
    _gbPanel(`
      <div class="gb-form">
        <h4>Перевод ${label}</h4>
        <input id="gbTrAmt" class="gift-search" type="number" min="0.01" step="0.01" placeholder="Сумма в USDT" style="width:100%;margin-bottom:10px">
        <div id="gbMsg"></div>
        <button class="gift-btn" style="width:100%" onclick="window._gbDoTransfer('${direction}')">Перевести</button>
      </div>`);
  };
  window._gbDoTransfer = async function (direction) {
    const amt = parseFloat(($('gbTrAmt') || {}).value);
    const msg = $('gbMsg');
    if (!(amt > 0)) { if (msg) msg.innerHTML = '<div class="gp-err">Введите сумму</div>'; return; }
    if (msg) msg.innerHTML = '<div class="gift-loading">Отправка…</div>';
    const r = await api('POST', '/api/me/gift/transfer', { direction, amount_usdt: amt });
    _gbAfter(r, 'Перевод выполнен');
  };

  window._gbWithdraw = function () {
    _gbPanel(`
      <div class="gb-form">
        <h4>Заявка на вывод с Текущего (от 10 USDT)</h4>
        <input id="gbWdAmt" class="gift-search" type="number" min="10" step="0.01" placeholder="Сумма в USDT (≥10)" style="width:100%;margin-bottom:10px">
        <input id="gbWdAddr" class="gift-search" placeholder="USDT-адрес кошелька" style="width:100%;margin-bottom:10px">
        <select id="gbWdNet" class="gift-sort" style="width:100%;margin-bottom:10px">
          <option value="TRC20">TRC20 (Tron)</option>
          <option value="BEP20">BEP20 (BSC)</option>
          <option value="ERC20">ERC20 (Ethereum)</option>
        </select>
        <div id="gbMsg"></div>
        <button class="gift-btn" style="width:100%" onclick="window._gbDoWithdraw()">Создать заявку</button>
      </div>`);
  };
  window._gbDoWithdraw = async function () {
    const amt = parseFloat(($('gbWdAmt') || {}).value);
    const address = (($('gbWdAddr') || {}).value || '').trim();
    const network = ($('gbWdNet') || {}).value || 'TRC20';
    const msg = $('gbMsg');
    if (!(amt >= 10)) { if (msg) msg.innerHTML = '<div class="gp-err">Минимум 10 USDT</div>'; return; }
    if (!address) { if (msg) msg.innerHTML = '<div class="gp-err">Укажите адрес</div>'; return; }
    if (msg) msg.innerHTML = '<div class="gift-loading">Отправка…</div>';
    const r = await api('POST', '/api/me/gift/withdraw', { amount_usdt: amt, address, network });
    _gbAfter(r, 'Заявка на вывод создана');
  };

  function _gbAfter(r, okText) {
    const msg = $('gbMsg');
    if (r && r.ok) {
      if (msg) msg.innerHTML = '<div class="gp-ok">✅ ' + okText + '</div>';
      setTimeout(() => { window.loadGiftBalancesPage(); }, 1200);
    } else {
      const map = {
        insufficient_working: 'Недостаточно средств на личном кошельке Golden Connect',
        insufficient_balance: 'Недостаточно средств на балансе',
        not_linked_to_golden-connect: 'Ваш GIFT-аккаунт не связан с кошельком Golden Connect',
        min_10_usdt: 'Минимальная сумма вывода — 10 USDT',
        address_required: 'Укажите адрес кошелька',
        bad_amount: 'Некорректная сумма',
      };
      const reason = (r && (r.reason || r.error)) || 'ошибка';
      if (msg) msg.innerHTML = '<div class="gp-err">' + (map[reason] || reason) + '</div>';
    }
  }

  // ===========================================================
  // PAGE 3: Statuses (Giver + Leader)
  // ===========================================================
  window.loadGiftStatusesPage = async function () {
    const root = $('giftStatusesContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка статусов…</div>';
    const d = await api('GET', '/api/me/gift/statuses');
    if (!d || !d.ok) { root.innerHTML = emptyState('Ошибка', d && d.error); return; }

    const tiers = d.tiers || [];
    const current = d.current_tier || 0;

    const cards = tiers.map(t => {
      const active = t.tier === current;
      const achieved = current >= t.tier && current > 0;
      return `
        <div class="gst-card ${active ? 'gst-active' : ''}">
          <div class="gst-head">Даритель ${t.tier}${active ? ' <span class="gst-badge">★ ваш статус</span>' : (achieved ? ' <span class="gst-badge-done">✓</span>' : '')}</div>
          <div class="gst-pool">${t.pool_percent}% <span class="gst-pool-l">на всех</span></div>
          <div class="gst-entry">Вход: <b>${t.entry_usdt} USDT</b></div>
        </div>`;
    }).join('');

    root.innerHTML = `
      <div class="gift-page-head"><h2>🏆 Статусы Дарителя</h2></div>
      <p class="gift-hint">«% на всех» — доля распределения супер-пула на этом статусе. Статус покупается с <b>Основного баланса</b>. Даритель 5 — пока не запущен.</p>
      <div class="gst-grid">${cards}</div>
      <div class="gst-card gst-locked">
        <div class="gst-head">Даритель 5 <span class="gst-badge-soon">скоро</span></div>
        <div class="gst-pool">— <span class="gst-pool-l">не запущен</span></div>
      </div>
    `;
  };

  // ===========================================================
  // PAGE: Profile (кто пригласил + Лидер структуры)
  // ===========================================================
  function _personName(p) {
    if (!p) return '—';
    const n = [p.name, p.surname].filter(Boolean).join(' ').trim();
    const u = p.telegram_username ? '@' + p.telegram_username : '';
    return (n || u || ('ID ' + p.id)) + (n && u ? ' · ' + u : '');
  }
  window.loadGiftProfilePage = async function () {
    const root = $('giftProfileContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка профиля…</div>';
    const d = await api('GET', '/api/me/gift/profile');
    if (!d || !d.ok) { root.innerHTML = emptyState('Ошибка', d && d.error); return; }
    if (d.linked === false) { root.innerHTML = notLinkedBanner(); return; }

    const leader = d.structure_leader;
    root.innerHTML = `
      <div class="gift-page-head"><h2>👤 Профиль</h2></div>
      <div class="gp-prof-grid">
        <div class="gp-prof-card">
          <div class="gp-prof-label">🙋 Кто пригласил</div>
          <div class="gp-prof-val">${esc(_personName(d.inviter))}</div>
          <div class="gp-prof-sub">Ваш непосредственный пригласитель в структуре</div>
        </div>
        <div class="gp-prof-card">
          <div class="gp-prof-label">👑 Лидер структуры</div>
          <div class="gp-prof-val">${leader ? esc(_personName(leader)) + ' <span class="gp-prof-badge">Л-' + leader.leader_level + '</span>' : '—'}</div>
          <div class="gp-prof-sub">Ближайший наставник-лидер по вашей восходящей ветке</div>
        </div>
      </div>
    `;
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ===========================================================
  // PAGE: Guide / Инструкции (черновой контент)
  // ===========================================================
  window.loadGiftGuidePage = function () {
    const root = $('giftGuideContent');
    if (!root) return;
    root.innerHTML = `
      <div class="gift-page-head"><h2>📖 Инструкции GIFT CLUB</h2></div>
      <p class="gift-hint">Черновая версия. Полные тексты и регламент будут добавлены позже.</p>
      <div class="gd-section">
        <h3>🎁 Что такое GIFT CLUB</h3>
        <p>Подарочный клуб экосистемы Солидар: статусы Даритель, кешбэк-пул, реферальная сеть и каталог проектов-партнёров. Здесь собрано всё по проекту в одном меню.</p>
      </div>
      <div class="gd-section">
        <h3>💰 Балансы</h3>
        <ul>
          <li><b>Основной</b> — пополняется с вашего личного кошелька Golden Connect 1:1. С него покупаются статусы Дарителя.</li>
          <li><b>Текущий</b> — сюда поступает заработок и кешбэк. Можно вывести (заявка от 10 USDT) или перевести на Основной.</li>
          <li>Перевод между балансами — мгновенный, без комиссии.</li>
        </ul>
      </div>
      <div class="gd-section">
        <h3>🏆 Статусы Дарителя</h3>
        <ul>
          <li>Даритель 1 — вход 5 USDT, 10% на всех.</li>
          <li>Даритель 2 — вход 20 USDT, 30% на всех.</li>
          <li>Даритель 3 — вход 25 USDT, 10% на всех.</li>
          <li>Даритель 4 — вход 100 USDT, 50% на всех.</li>
          <li>Даритель 5 — пока не запущен.</li>
        </ul>
        <p>«% на всех» — доля распределения супер-пула на вашем статусе.</p>
      </div>
      <div class="gd-section">
        <h3>🚀 Каталог проектов</h3>
        <p>Участвуйте в проектах экосистемы (🔵 Сервисы / 🟢 МЛМ / 🔴 Стартапы). Сдайте свою реферальную ссылку проекта — за каждого реферала 1-й линии получите <b>+10 TRDX</b>. Стартапы — повышенный риск, анализируйте сами.</p>
      </div>
      <div class="gd-section">
        <h3>👤 Профиль</h3>
        <p>Видно, кто вас пригласил, и кто ваш лидер структуры (ближайший наставник-лидер по восходящей ветке).</p>
      </div>
    `;
  };

  // ===========================================================
  // PAGE 4: Network (15-level referral tree)
  // ===========================================================
  let _giftCurrentLevel = 1;
  window.loadGiftNetworkPage = async function () {
    const root = $('giftNetworkContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка реф-сети…</div>';
    const sum = await api('GET', '/api/me/gift/referrals/summary');
    if (!sum || !sum.ok) { root.innerHTML = emptyState('Ошибка', sum && sum.error); return; }

    const summaryRows = (sum.summary || []).map(s => `
      <button class="gift-level-btn ${_giftCurrentLevel === s.level ? 'active' : ''}" data-level="${s.level}">
        Уровень ${s.level}<br><b>${s.count}</b>
      </button>`).join('') || '<div class="gift-empty"><p>Реф-сеть пуста</p></div>';

    root.innerHTML = `
      <div class="gift-page-head">
        <h2>🌳 GIFT Реф-сеть</h2>
        <div class="gift-total">Всего в команде: <b>${sum.total || 0}</b></div>
      </div>
      <div class="gift-levels">${summaryRows}</div>
      <div id="giftNetworkList" class="gift-net-list"></div>
    `;

    // attach click handlers
    root.querySelectorAll('.gift-level-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        _giftCurrentLevel = Number(btn.dataset.level);
        root.querySelectorAll('.gift-level-btn').forEach(b => b.classList.toggle('active', b === btn));
        await loadLevel(_giftCurrentLevel);
      });
    });
    if (sum.summary && sum.summary.length) await loadLevel(_giftCurrentLevel);
  };
  async function loadLevel(level) {
    const list = $('giftNetworkList');
    list.innerHTML = '<div class="gift-loading">Загрузка уровня ' + level + '…</div>';
    const d = await api('GET', '/api/me/gift/referrals?level=' + level);
    if (!d || !d.ok) { list.innerHTML = emptyState('Ошибка', d && d.error); return; }
    if (!d.members || !d.members.length) { list.innerHTML = '<div class="gift-empty"><p>На этом уровне никого нет</p></div>'; return; }
    list.innerHTML = `
      <h3>Уровень ${level} — ${d.count} человек${d.count >= 500 ? ' (показано первые 500)' : ''}</h3>
      <div class="gift-net-grid">
        ${d.members.map(m => `
          <div class="gift-net-item">
            <div class="gift-net-name">${m.name || 'Без имени'}</div>
            <div class="gift-net-tg">${m.telegram_username ? '@' + m.telegram_username : 'TG: ' + (m.telegram_chat_id || '—')}</div>
            <div class="gift-net-date">Регистрация: ${m.created_at ? new Date(m.created_at).toLocaleDateString('ru-RU') : '-'}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ===========================================================
  // PAGE 5: Multi-accounts (switcher)
  // ===========================================================
  window.loadGiftAccountsPage = async function () {
    const root = $('giftAccountsContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка аккаунтов…</div>';
    const d = await api('GET', '/api/me/gift/accounts');
    if (!d || !d.ok) { root.innerHTML = emptyState('Ошибка', d && d.error); return; }
    if (!d.accounts || !d.accounts.length) {
      root.innerHTML = '<div class="gift-empty"><h3>Нет связанных GIFT аккаунтов</h3></div>';
      return;
    }
    const rows = d.accounts.map(a => `
      <div class="gift-acc-row ${a.is_current ? 'current' : ''} ${a.is_main ? 'main' : ''}">
        <div class="gift-acc-info">
          <div class="gift-acc-name">
            ${a.is_main ? '⭐ ' : ''}${a.name || 'Аккаунт #' + a.id}
            ${a.surname && a.surname !== 'NULL' ? ' ' + a.surname : ''}
            ${a.is_current ? '<span class="gift-badge-current">сейчас</span>' : ''}
          </div>
          <div class="gift-acc-meta">
            gift_id=${a.id} · gc=${a.gc_user_id} · ${a.role}
            ${a.telegram_username ? ' · @' + a.telegram_username : ''}
          </div>
        </div>
        ${a.is_current ? '' :
          '<button class="gift-btn-sm" onclick="window._giftSwitchTo(' + a.id + ')">Переключиться</button>'}
      </div>
    `).join('');
    root.innerHTML = `
      <h2>🔁 Мои GIFT аккаунты</h2>
      <p class="gift-hint">У вас связано <b>${d.accounts.length}</b> аккаунтов одним Telegram chat_id. Переключайтесь между ними чтобы видеть балансы и статусы каждого.</p>
      <div class="gift-acc-list">${rows}</div>
    `;
  };
  // ===========================================================
  // PAGE 6: Команда (Partner program) — tree / levels / table
  // ===========================================================
  let _giftTeamMode = 'tree';
  window.loadGiftTeamPage = async function () {
    const root = $('giftTeamContent');
    if (!root) return;
    root.innerHTML = `
      <div class="gift-page-head"><h2>🤝 Моя команда GiftClub</h2></div>
      <div class="gift-team-modes">
        <button class="gift-mode-btn ${_giftTeamMode==='tree'?'active':''}" data-mode="tree">🌳 Дерево</button>
        <button class="gift-mode-btn ${_giftTeamMode==='levels'?'active':''}" data-mode="levels">📊 По уровням</button>
        <button class="gift-mode-btn ${_giftTeamMode==='table'?'active':''}" data-mode="table">📋 Таблица</button>
      </div>
      <div id="giftTeamBody"><div class="gift-loading">Загрузка…</div></div>
    `;
    root.querySelectorAll('.gift-mode-btn').forEach(b => {
      b.addEventListener('click', () => {
        _giftTeamMode = b.dataset.mode;
        root.querySelectorAll('.gift-mode-btn').forEach(x => x.classList.toggle('active', x === b));
        renderTeamMode();
      });
    });
    renderTeamMode();
  };

  async function renderTeamMode() {
    const body = $('giftTeamBody');
    if (!body) return;
    body.innerHTML = '<div class="gift-loading">Загрузка…</div>';
    if (_giftTeamMode === 'tree') return renderTeamTree(body);
    if (_giftTeamMode === 'levels') return renderTeamLevels(body);
    if (_giftTeamMode === 'table') return renderTeamTable(body);
  }

  // --- Tree (lazy drill-down) ---
  function nodeRow(n) {
    const bal = fmtMicroToNum(n.balance_micro).toFixed(2);
    const giver = n.giver_level ? 'Д-' + n.giver_level : '—';
    const expandable = n.direct_refs > 0;
    return `
      <div class="gift-tree-node" data-id="${n.id}" data-loaded="0">
        <div class="gift-tree-row ${expandable ? 'expandable' : ''}">
          ${expandable ? '<span class="gift-tree-toggle">▶</span>' : '<span class="gift-tree-dot">•</span>'}
          <span class="gift-tree-name">${n.name || 'Без имени'}</span>
          ${n.telegram_username ? '<span class="gift-tree-tg">@' + n.telegram_username + '</span>' : ''}
          <span class="gift-tree-badge">${giver}</span>
          <span class="gift-tree-meta">${n.direct_refs} реф · команда ${n.total_team}</span>
          <span class="gift-tree-bal">$${bal}</span>
        </div>
        <div class="gift-tree-children" style="display:none"></div>
      </div>`;
  }
  async function renderTeamTree(body) {
    const d = await api('GET', '/api/me/gift/team/tree');
    if (!d || !d.ok || d.linked === false) { body.innerHTML = notLinkedBanner(); return; }
    body.innerHTML = `
      <div class="gift-tree-head">Ты — команда <b>${d.root ? d.root.total_team : 0}</b> человек. Кликай ▶ чтобы раскрыть кто кого пригласил.</div>
      <div class="gift-tree-root">${(d.children||[]).map(nodeRow).join('') || '<div class="gift-empty"><p>У тебя пока нет приглашённых</p></div>'}</div>
    `;
    body.querySelectorAll('.gift-tree-row.expandable').forEach(row => {
      row.addEventListener('click', async () => {
        const node = row.closest('.gift-tree-node');
        const kids = node.querySelector('.gift-tree-children');
        const toggle = row.querySelector('.gift-tree-toggle');
        if (node.dataset.loaded === '1') {
          const vis = kids.style.display !== 'none';
          kids.style.display = vis ? 'none' : 'block';
          toggle.textContent = vis ? '▶' : '▼';
          return;
        }
        toggle.textContent = '⏳';
        const sub = await api('GET', '/api/me/gift/team/tree?parent_gift_id=' + node.dataset.id);
        kids.innerHTML = (sub.children||[]).map(nodeRow).join('') || '<div class="gift-tree-empty">нет данных</div>';
        node.dataset.loaded = '1';
        kids.style.display = 'block';
        toggle.textContent = '▼';
        _attachTreeHandlers(kids);
      });
    });
  }
  function _attachTreeHandlers(container) {
    container.querySelectorAll(':scope > .gift-tree-node > .gift-tree-row.expandable').forEach(row => {
      if (row.dataset.bound) return;
      row.dataset.bound = '1';
      row.addEventListener('click', async () => {
        const node = row.closest('.gift-tree-node');
        const kids = node.querySelector('.gift-tree-children');
        const toggle = row.querySelector('.gift-tree-toggle');
        if (node.dataset.loaded === '1') {
          const vis = kids.style.display !== 'none';
          kids.style.display = vis ? 'none' : 'block';
          toggle.textContent = vis ? '▶' : '▼';
          return;
        }
        toggle.textContent = '⏳';
        const sub = await api('GET', '/api/me/gift/team/tree?parent_gift_id=' + node.dataset.id);
        kids.innerHTML = (sub.children||[]).map(nodeRow).join('') || '<div class="gift-tree-empty">нет данных</div>';
        node.dataset.loaded = '1';
        kids.style.display = 'block';
        toggle.textContent = '▼';
        _attachTreeHandlers(kids);
      });
    });
  }

  // --- Levels ---
  async function renderTeamLevels(body) {
    const d = await api('GET', '/api/me/gift/team/levels');
    if (!d || !d.ok || d.linked === false) { body.innerHTML = notLinkedBanner(); return; }
    if (!d.levels || !d.levels.length) { body.innerHTML = '<div class="gift-empty"><p>Команда пуста</p></div>'; return; }
    body.innerHTML = `
      <div class="gift-total" style="margin-bottom:14px">Всего в команде: <b>${d.total}</b></div>
      <div class="gift-levels-list">
        ${d.levels.map(l => `
          <div class="gift-level-row">
            <span class="gift-level-num">Уровень ${l.level}</span>
            <div class="gift-level-bar"><div class="gift-level-fill" style="width:${Math.min(100, l.count/d.levels[0].count*100)}%"></div></div>
            <span class="gift-level-count">${l.count}</span>
          </div>`).join('')}
      </div>
    `;
  }

  // --- Table (search + filter + pagination) ---
  let _teamPage = 1, _teamSearch = '', _teamSort = 'level';
  async function renderTeamTable(body) {
    body.innerHTML = `
      <div class="gift-team-filters">
        <input id="giftTeamSearch" class="gift-search" placeholder="🔍 Поиск по имени или @username…" value="${_teamSearch}">
        <select id="giftTeamSort" class="gift-sort">
          <option value="level">По уровню</option>
          <option value="balance">По балансу</option>
          <option value="date">По дате</option>
          <option value="name">По имени</option>
        </select>
      </div>
      <div id="giftTeamTableWrap"><div class="gift-loading">Загрузка…</div></div>
    `;
    const searchEl = $('giftTeamSearch'), sortEl = $('giftTeamSort');
    sortEl.value = _teamSort;
    let t;
    searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { _teamSearch = searchEl.value.trim(); _teamPage = 1; loadTablePage(); }, 400); });
    sortEl.addEventListener('change', () => { _teamSort = sortEl.value; _teamPage = 1; loadTablePage(); });
    loadTablePage();
  }
  async function loadTablePage() {
    const wrap = $('giftTeamTableWrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="gift-loading">Загрузка…</div>';
    const qs = `?page=${_teamPage}&sort=${_teamSort}` + (_teamSearch ? '&search=' + encodeURIComponent(_teamSearch) : '');
    const d = await api('GET', '/api/me/gift/team/table' + qs);
    if (!d || !d.ok || d.linked === false) { wrap.innerHTML = notLinkedBanner(); return; }
    if (!d.rows || !d.rows.length) { wrap.innerHTML = '<div class="gift-empty"><p>Никого не найдено</p></div>'; return; }
    const rows = d.rows.map(r => `
      <tr>
        <td>${r.name || '—'}${r.telegram_username ? '<div class="gift-bal-desc">@' + r.telegram_username + '</div>' : ''}</td>
        <td class="gift-t-center">${r.level}</td>
        <td>${r.inviter_name || '—'}${r.inviter_username ? ' <span class="muted">@' + r.inviter_username + '</span>' : ''}</td>
        <td class="gift-t-center">${r.giver_level ? 'Д-' + r.giver_level : '—'}</td>
        <td class="gift-bal-amt">$${fmtMicroToNum(r.balance_micro).toFixed(2)}</td>
        <td class="muted">${r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU') : '—'}</td>
      </tr>`).join('');
    wrap.innerHTML = `
      <div class="gift-total" style="margin-bottom:8px">Найдено: <b>${d.total}</b> · стр. ${d.page}/${d.pages}</div>
      <div class="gift-table-wrap"><table class="gift-table">
        <thead><tr><th>Имя</th><th>Ур.</th><th>Кто пригласил</th><th>Статус</th><th>Баланс</th><th>Дата</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="gift-pager">
        <button class="gift-btn-sm" ${d.page<=1?'disabled':''} onclick="window._giftTeamGoPage(${d.page-1})">← Назад</button>
        <span>${d.page} / ${d.pages}</span>
        <button class="gift-btn-sm" ${d.page>=d.pages?'disabled':''} onclick="window._giftTeamGoPage(${d.page+1})">Вперёд →</button>
      </div>
    `;
  }
  window._giftTeamGoPage = function (p) { _teamPage = p; loadTablePage(); };

  window._giftSwitchTo = async function (accountId) {
    const r = await api('POST', '/api/me/gift/switch-account', { account_id: accountId });
    if (r && r.ok) {
      // Reload overview to reflect new account
      window.loadGiftAccountsPage();
      if (typeof goPage === 'function') setTimeout(() => goPage('gift-overview'), 300);
    } else {
      alert('Не удалось переключить: ' + (r && r.error || 'неизвестная ошибка'));
    }
  };

})();
