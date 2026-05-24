/* Trendex ADX — Phase A: categories + marketplace listing (read-only).
   Progressive enhancement: Phase B adds channel registration + order flow.
*/
(function () {
  'use strict';
  const ROOT = '/cabinet/api/adx';
  let STATE = { categories: [], items: [], filters: {}, loading: false };

  function esc(s){ return String(s==null?'':s).replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  function money(n){ return '$' + Number(n||0).toFixed(2); }
  function fmtNum(n){ return Number(n||0).toLocaleString('ru-RU'); }

  async function fetchJson(url, opts) {
    const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
    if (r.status === 401) { window.location.href = '/cabinet/login'; throw new Error('auth'); }
    return r.json();
  }

  async function ensureCategories() {
    if (STATE.categories.length) return;
    const data = await fetchJson(ROOT + '/categories');
    STATE.categories = (data && data.ok && data.categories) || [];
  }

  async function loadMarket() {
    STATE.loading = true;
    const q = new URLSearchParams();
    Object.entries(STATE.filters).forEach(([k, v]) => v && q.set(k, v));
    const data = await fetchJson(ROOT + '/marketplace?' + q.toString());
    STATE.items = (data && data.ok && data.items) || [];
    STATE.loading = false;
    renderGrid();
  }

  function renderHero(el) {
    el.innerHTML =
      '<div class="adx-hero">' +
        '<div class="adx-hero-inner">' +
          '<div class="adx-hero-badge">NEW · Trendex ADX</div>' +
          '<h1>Биржа TG-каналов для рекламы</h1>' +
          '<p>Размещайте посты в отобранных каналах Trendex-партнёров. Автомодерация, эскроу, рейтинги, возвраты — всё в одном месте.</p>' +
          '<div class="adx-hero-ctas">' +
            '<button class="adx-btn adx-btn-primary" onclick="window.Adx.goMarket()">🛒 Открыть каталог</button>' +
            '<button class="adx-btn adx-btn-ghost" onclick="window.Adx.goRegister()">📣 Добавить свой канал</button>' +
            '<button class="adx-btn adx-btn-ghost" onclick="window.Adx.openMyOrders()">📋 Мои заказы</button>' +
            '<button class="adx-btn adx-btn-ghost" onclick="window.Adx.openIncoming()">📥 Входящие на канал</button>' +
          '</div>' +
          '<div class="adx-hero-stats" id="adxHeroStats"></div>' +
        '</div>' +
      '</div>';
  }

  function renderFilters() {
    const catOpts = STATE.categories.map((c) =>
      '<option value="'+esc(c.slug)+'">'+esc(c.name_ru || c.name_en)+'</option>').join('');
    return (
      '<div class="adx-filters">' +
        '<input type="search" id="adxQ" placeholder="Поиск по каналу..." oninput="window.Adx.setFilter(\'q\', this.value)">' +
        '<select id="adxCat" onchange="window.Adx.setFilter(\'category\', this.value)">' +
          '<option value="">Все категории</option>' + catOpts +
        '</select>' +
        '<input type="number" id="adxMinMem" placeholder="Подписчиков от" min="0" oninput="window.Adx.setFilter(\'min_members\', this.value)">' +
        '<input type="number" id="adxMaxPrice" placeholder="Цена до, $" min="0" oninput="window.Adx.setFilter(\'max_price\', this.value)">' +
        '<select id="adxSort" onchange="window.Adx.setFilter(\'sort\', this.value)">' +
          '<option value="rating_desc">Сначала лучшие</option>' +
          '<option value="members_desc">Больше подписчиков</option>' +
          '<option value="price_asc">Дешевле</option>' +
          '<option value="price_desc">Дороже</option>' +
          '<option value="cpm_asc">Выгодный CPM</option>' +
        '</select>' +
      '</div>'
    );
  }

  function renderGrid() {
    const grid = document.getElementById('adxGrid');
    if (!grid) return;
    if (STATE.loading) { grid.innerHTML = '<div class="adx-empty">Загрузка…</div>'; return; }
    if (!STATE.items.length) {
      grid.innerHTML = '<div class="adx-empty">' +
        '<div style="font-size:42px;margin-bottom:8px">📭</div>' +
        '<h3>Каталог пока пуст</h3>' +
        '<p>Партнёры ещё не добавили каналы в биржу. Будь первым — добавь свой канал прямо сейчас и получи 0% комиссии на первые 10 заказов.</p>' +
        '<button class="adx-btn adx-btn-primary" onclick="window.Adx.goRegister()">📣 Добавить канал</button>' +
      '</div>';
      return;
    }
    grid.innerHTML = STATE.items.map((c) =>
      '<div class="adx-card">' +
        '<div class="adx-card-head">' +
          '<div class="adx-card-title">' + esc(c.description || ('Канал #' + c.id)) + '</div>' +
          '<div class="adx-card-rating">★ ' + Number(c.rating || 5).toFixed(1) + '</div>' +
        '</div>' +
        '<div class="adx-card-metrics">' +
          '<div><b>' + fmtNum(c.member_count) + '</b><span>подписчиков</span></div>' +
          '<div><b>' + fmtNum(c.avg_views_per_post) + '</b><span>просмотров/пост</span></div>' +
          '<div><b>' + Number(c.engagement_rate || 0).toFixed(1) + '%</b><span>вовлечение</span></div>' +
        '</div>' +
        '<div class="adx-card-price">' + money(c.price_24h) + '<small>/ 24ч</small></div>' +
        '<button class="adx-btn adx-btn-primary adx-card-cta" onclick="window.Adx.startOrder(' + c.id + ')">🛒 Заказать</button>' +
      '</div>'
    ).join('');
  }

  async function render(el) {
    try {
      await ensureCategories();
    } catch (_) {}
    el.innerHTML = '';
    renderHero(el);
    const wrap = document.createElement('div');
    wrap.className = 'adx-wrap';
    wrap.innerHTML = renderFilters() + '<div id="adxGrid" class="adx-grid"></div>';
    el.appendChild(wrap);
    try { await loadMarket(); } catch (_) { renderGrid(); }
  }

  window.Adx = {
    mount: render,
    setFilter(key, value) {
      STATE.filters[key] = value || undefined;
      clearTimeout(window._adxDebounce);
      window._adxDebounce = setTimeout(loadMarket, 250);
    },
    goMarket() { document.getElementById('adxGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); },
    goRegister() { _openRegisterModal(); },  /* [adx-register-ui] */
    startOrder(channelId) { _openOrderModal(channelId); },  /* [adx-orders-ui] */
    openMyOrders() { _openMyOrdersModal(); },
    openIncoming() { _openIncomingModal(); },
  };

  // auto-mount when page becomes visible
  document.addEventListener('click', function (e) {
    const tgt = e.target.closest('[data-page="adx"]');
    if (!tgt) return;
    setTimeout(function () {
      const host = document.getElementById('adxPageContent');
      if (host && !host.dataset.mounted) {
        host.dataset.mounted = '1';
        window.Adx.mount(host);
      }
    }, 100);
  }, true);

  window.loadAdxPage = function () {
    const host = document.getElementById('adxPageContent');
    if (!host) return;
    if (host.dataset.mounted !== '1') { host.dataset.mounted = '1'; window.Adx.mount(host); }
  };


  // ────────── REGISTRATION MODAL ──────────
  function _openRegisterModal() {
    if (document.getElementById('adx-reg-modal')) return;
    if (!STATE.categories.length) {
      ensureCategories().catch(()=>{}).finally(() => _openRegisterModal());
      return;
    }

    const catRows = STATE.categories.map(c =>
      '<label style="display:flex;gap:6px;align-items:center;padding:6px 8px;border:1px solid #1e293b;border-radius:6px;cursor:pointer;font-size:12px;background:#0b1120">'
      + '<input type="checkbox" name="cat" value="' + esc(c.slug) + '">'
      + esc(c.name_ru || c.name_en) + '</label>'
    ).join('');

    const wrap = document.createElement('div');
    wrap.id = 'adx-reg-modal';
    wrap.innerHTML =
      '<style>'
      + '#adx-reg-modal{position:fixed;inset:0;z-index:99990;background:rgba(0,0,0,0.78);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto;font-family:-apple-system,sans-serif}'
      + '#adx-reg-card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:22px;max-width:640px;width:100%;color:#e0e7ff;margin-top:30px}'
      + '#adx-reg-card h3{margin:0 0 12px;font-size:18px}'
      + '#adx-reg-card label.fld{display:block;margin-bottom:12px;font-size:12px;color:#94a3b8}'
      + '#adx-reg-card input.cab-input,#adx-reg-card select.cab-input,#adx-reg-card textarea.cab-input{width:100%;background:#0b1120;border:1px solid #1e293b;border-radius:8px;color:#e0e7ff;padding:10px 12px;margin-top:4px;font-size:14px;outline:none;font-family:inherit}'
      + '#adx-reg-card input.cab-input:focus{border-color:#7c3aed}'
      + '#adx-reg-card .cats{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}'
      + '#adx-reg-card .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}'
      + '#adx-reg-card .info{background:#1e1b4b22;border:1px solid #4338ca;color:#cbd5e1;padding:10px 12px;border-radius:8px;font-size:12px;margin-bottom:12px;line-height:1.5}'
      + '#adx-reg-card .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}'
      + '#adx-reg-card button{cursor:pointer;font-weight:600;padding:10px 18px;border-radius:8px;border:none;font-size:14px}'
      + '#adx-reg-card button.primary{background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff}'
      + '#adx-reg-card button.ghost{background:transparent;color:#94a3b8;border:1px solid #334155}'
      + '#adx-reg-status{font-size:13px;margin-top:10px;line-height:1.5}'
      + '</style>'
      + '<div id="adx-reg-card">'
      + '<h3>📣 Добавить канал в биржу</h3>'
      + '<div class="info">'
      + '⚠️ <b>Важно:</b> бот <b>@Trendex_bizbot</b> должен быть админом твоего канала с правом публикации сообщений. Также ты сам должен быть указан как админ канала.'
      + '</div>'
      + '<form id="adx-reg-form">'
      + '<label class="fld">@username канала или ссылка t.me/<input class="cab-input" name="username" required placeholder="my_awesome_channel" maxlength="64"></label>'
      + '<label class="fld">Описание (опционально, до 500)<textarea class="cab-input" name="description" maxlength="500" rows="2"></textarea></label>'
      + '<div class="fld">Категории (можно несколько):<div class="cats">' + catRows + '</div></div>'
      + '<div class="row">'
      + '  <label class="fld">Цена за 24ч, $<input class="cab-input" name="price_24h" type="number" min="1" max="100000" step="0.5" value="5" required></label>'
      + '  <label class="fld">Цена за 48ч (опц.)<input class="cab-input" name="price_48h" type="number" min="0" step="0.5" placeholder="авто"></label>'
      + '  <label class="fld">Цена за 72ч (опц.)<input class="cab-input" name="price_72h" type="number" min="0" step="0.5" placeholder="авто"></label>'
      + '</div>'
      + '<div class="row">'
      + '  <label class="fld">Язык<select class="cab-input" name="language"><option value="ru">Русский</option><option value="en">English</option><option value="uk">Українська</option><option value="es">Español</option></select></label>'
      + '  <label class="fld">Мин. часов заказа<input class="cab-input" name="min_order_hours" type="number" min="1" max="168" value="24"></label>'
      + '  <div></div>'
      + '</div>'
      + '<div class="actions">'
      + '<button type="button" class="ghost" id="adx-reg-cancel">Отмена</button>'
      + '<button type="submit" class="primary">📣 Добавить канал</button>'
      + '</div>'
      + '<div id="adx-reg-status"></div>'
      + '</form>'
      + '</div>';
    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    document.getElementById('adx-reg-cancel').addEventListener('click', close);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

    document.getElementById('adx-reg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const cats = Array.from(f.querySelectorAll('input[name="cat"]:checked')).map(x => x.value);
      const status = document.getElementById('adx-reg-status');
      status.style.color = '#94a3b8';
      status.textContent = '⏳ Проверяю канал в Telegram...';
      const body = {
        username: f.username.value.trim(),
        description: f.description.value.trim(),
        categories: cats,
        language: f.language.value,
        price_24h: Number(f.price_24h.value),
        price_48h: f.price_48h.value ? Number(f.price_48h.value) : undefined,
        price_72h: f.price_72h.value ? Number(f.price_72h.value) : undefined,
        min_order_hours: Number(f.min_order_hours.value),
      };
      try {
        const r = await fetch(ROOT + '/channels/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (j && j.ok) {
          status.style.color = '#22c55e';
          status.textContent = j.already
            ? '✓ Этот канал уже добавлен.'
            : '✓ Канал добавлен' + (j.channel && j.channel.in_network ? ' и активен' : ' и отправлен на модерацию') + '.';
          setTimeout(() => { close(); loadMarket().catch(()=>{}); }, 1400);
        } else {
          status.style.color = '#ef4444';
          status.textContent = '⚠️ ' + (j && (j.detail || j.reason) || 'Ошибка');
        }
      } catch (err) {
        status.style.color = '#ef4444';
        status.textContent = '⚠️ Сеть упала — попробуй ещё раз';
      }
    });
  }


  // ────────── ORDER MODAL (advertiser places an order) ──────────
  async function _openOrderModal(channelId) {
    if (document.getElementById('adx-order-modal')) return;
    let ch = STATE.items.find(x => x.id === channelId);
    if (!ch) {
      try {
        const r = await fetchJson(ROOT + '/marketplace?limit=200');
        ch = (r && r.items || []).find(x => x.id === channelId);
      } catch (_) {}
    }
    if (!ch) { alert('Канал не найден'); return; }

    const wrap = document.createElement('div');
    wrap.id = 'adx-order-modal';
    wrap.innerHTML =
      '<style>#adx-order-modal{position:fixed;inset:0;z-index:99991;background:rgba(0,0,0,0.78);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto;font-family:-apple-system,sans-serif}'
      + '#adx-order-card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:22px;max-width:680px;width:100%;color:#e0e7ff;margin-top:30px}'
      + '#adx-order-card h3{margin:0 0 10px;font-size:18px}'
      + '#adx-order-card label.fld{display:block;margin-bottom:12px;font-size:12px;color:#94a3b8}'
      + '#adx-order-card .cab-input,#adx-order-card textarea.cab-input,#adx-order-card select.cab-input{width:100%;background:#0b1120;border:1px solid #1e293b;border-radius:8px;color:#e0e7ff;padding:10px 12px;margin-top:4px;font-size:14px;font-family:inherit;outline:none}'
      + '#adx-order-card .price-box{background:linear-gradient(135deg,#7c3aed22,#3b82f622);border:1px solid rgba(167,139,250,0.35);border-radius:8px;padding:12px;margin-top:6px}'
      + '#adx-order-card .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}'
      + '#adx-order-card button{cursor:pointer;font-weight:600;padding:10px 18px;border-radius:8px;border:none;font-size:14px}'
      + '#adx-order-card button.primary{background:linear-gradient(135deg,#7c3aed,#3b82f6);color:#fff}'
      + '#adx-order-card button.ghost{background:transparent;color:#94a3b8;border:1px solid #334155}'
      + '#adx-order-status{font-size:13px;margin-top:10px;line-height:1.5}'
      + '</style>'
      + '<div id="adx-order-card">'
      + '<h3>🛒 Заказать пост в канале</h3>'
      + '<div style="background:#0b1120;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;margin-bottom:12px">'
      + '<div style="font-size:13px"><b>' + esc(ch.description || ('Канал #' + ch.id)) + '</b></div>'
      + '<div style="font-size:12px;color:#94a3b8;margin-top:4px">' + fmtNum(ch.member_count) + ' подписчиков · CPM $' + Number(ch.cpm||0).toFixed(2) + '</div>'
      + '</div>'
      + '<form id="adx-order-form">'
      + '<label class="fld">Длительность размещения<select class="cab-input" name="placement_hours">'
      +   '<option value="24" selected>24 часа — $' + Number(ch.price_24h).toFixed(2) + '</option>'
      +   '<option value="48">48 часов — $' + Number(ch.price_48h || ch.price_24h * 1.7).toFixed(2) + '</option>'
      +   '<option value="72">72 часа — $' + Number(ch.price_72h || ch.price_24h * 2.3).toFixed(2) + '</option>'
      + '</select></label>'
      + '<label class="fld">Текст поста (HTML, до 3500 символов)<textarea class="cab-input" name="post_text" rows="6" maxlength="3500" required minlength="10" placeholder="Текст с разрешённой HTML-разметкой Telegram: <b>, <i>, <a href>, <code>"></textarea></label>'
      + '<label class="fld">Ссылка на изображение (опционально)<input class="cab-input" name="media_url" type="url" placeholder="https://example.com/banner.jpg"></label>'
      + '<label class="fld">Заметка для паблишера (опционально, не отображается зрителям)<input class="cab-input" name="advertiser_note" type="text" maxlength="300"></label>'
      + '<div class="price-box">'
      + '  <div style="font-size:12px;color:#94a3b8">К оплате с твоего рекламного баланса</div>'
      + '  <div id="adx-order-price" style="font-size:24px;font-weight:800;color:#a78bfa">$' + Number(ch.price_24h).toFixed(2) + '</div>'
      + '  <div style="font-size:11px;color:#64748b;margin-top:4px">10% — комиссия платформы. Если паблишер откажется или не опубликует — возврат на баланс.</div>'
      + '</div>'
      + '<div class="actions">'
      + '<button type="button" class="ghost" id="adx-order-cancel">Отмена</button>'
      + '<button type="submit" class="primary">🛒 Разместить заказ</button>'
      + '</div>'
      + '<div id="adx-order-status"></div>'
      + '</form></div>';
    document.body.appendChild(wrap);

    const close = () => wrap.remove();
    document.getElementById('adx-order-cancel').addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

    const priceMap = { 24: ch.price_24h, 48: ch.price_48h || ch.price_24h * 1.7, 72: ch.price_72h || ch.price_24h * 2.3 };
    const sel = wrap.querySelector('select[name="placement_hours"]');
    sel.addEventListener('change', () => {
      const v = Number(sel.value);
      document.getElementById('adx-order-price').textContent = '$' + Number(priceMap[v]).toFixed(2);
    });

    document.getElementById('adx-order-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      const status = document.getElementById('adx-order-status');
      status.style.color = '#94a3b8';
      status.textContent = '⏳ Отправляю заказ...';
      try {
        const r = await fetch(ROOT + '/orders', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            channel_id: ch.id,
            placement_hours: Number(f.placement_hours.value),
            post_text: f.post_text.value,
            media_url: f.media_url.value || null,
            advertiser_note: f.advertiser_note.value,
          }),
        });
        const j = await r.json();
        if (j && j.ok) {
          status.style.color = '#22c55e';
          status.textContent = '✓ Заказ создан! Паблишер получил уведомление в Telegram. Проверяй статус в «Мои заказы».';
          setTimeout(close, 1800);
        } else {
          status.style.color = '#ef4444';
          status.textContent = '⚠️ ' + (j && (j.detail || j.reason) || 'Ошибка');
        }
      } catch (_) {
        status.style.color = '#ef4444';
        status.textContent = '⚠️ Сеть упала — попробуй ещё раз';
      }
    });
  }

  // ────────── MY ORDERS MODAL (advertiser side) ──────────
  async function _openMyOrdersModal() {
    if (document.getElementById('adx-myo-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'adx-myo-modal';
    wrap.innerHTML = _modalShell('📋 Мои заказы (рекламодатель)', '<div id="adx-myo-list" style="margin-top:14px">Загрузка...</div>');
    document.body.appendChild(wrap);
    wrap.querySelector('.adx-modal-close').addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });

    const data = await fetchJson(ROOT + '/orders').catch(() => null);
    const list = document.getElementById('adx-myo-list');
    if (!data || !data.ok) { list.innerHTML = '<div style="color:#ef4444">Ошибка</div>'; return; }
    const items = data.items || [];
    if (!items.length) { list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:24px">Заказов пока нет.</div>'; return; }
    list.innerHTML = items.map(o => _orderRow(o, 'advertiser')).join('');
    list.addEventListener('click', _ordersClick);
  }

  // ────────── INCOMING ORDERS (publisher side) ──────────
  async function _openIncomingModal() {
    if (document.getElementById('adx-inc-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'adx-inc-modal';
    wrap.innerHTML = _modalShell('📥 Входящие заказы (на твои каналы)', '<div id="adx-inc-list" style="margin-top:14px">Загрузка...</div>');
    document.body.appendChild(wrap);
    wrap.querySelector('.adx-modal-close').addEventListener('click', () => wrap.remove());
    wrap.addEventListener('click', e => { if (e.target === wrap) wrap.remove(); });

    const data = await fetchJson(ROOT + '/earnings').catch(() => null);
    const list = document.getElementById('adx-inc-list');
    if (!data || !data.ok) { list.innerHTML = '<div style="color:#ef4444">Ошибка</div>'; return; }
    const orders = data.orders || [];
    if (!orders.length) { list.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:24px">Заказов на твои каналы пока нет.</div>'; return; }
    list.innerHTML = ''
      + '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px;margin-bottom:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">'
      +   '<div><div style="font-size:11px;color:#94a3b8">Заработано (всего)</div><div style="font-size:20px;font-weight:800;color:#22c55e">$' + Number((data.totals && data.totals.total_earned) || 0).toFixed(2) + '</div></div>'
      +   '<div><div style="font-size:11px;color:#94a3b8">Завершённых заказов</div><div style="font-size:20px;font-weight:800;color:#e0e7ff">' + ((data.totals && data.totals.orders_count) || 0) + '</div></div>'
      + '</div>'
      + orders.map(o => _orderRow(o, 'publisher')).join('');
    list.addEventListener('click', _ordersClick);
  }

  function _orderRow(o, who) {
    const statusBadge = {
      pending_approval: ['#fbbf24', '⏳ Ждёт публикации'],
      published: ['#22c55e', '📢 Опубликован'],
      completed: ['#94a3b8', '✓ Завершён'],
      rejected: ['#ef4444', '❌ Отклонён'],
      cancelled: ['#94a3b8', '🚫 Отменён'],
    }[o.status] || ['#94a3b8', o.status];
    const actions = [];
    if (who === 'advertiser' && o.status === 'pending_approval') {
      actions.push('<button class="adx-btn" data-act="cancel" data-id="' + o.id + '" style="color:#ef4444;border:1px solid #334155;background:transparent;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer">Отменить</button>');
    }
    if (who === 'publisher' && o.status === 'pending_approval') {
      actions.push('<button class="adx-btn adx-btn-primary" data-act="accept" data-id="' + o.id + '" style="padding:6px 12px;font-size:12px">✅ Принять и опубликовать</button>');
      actions.push('<button class="adx-btn" data-act="decline" data-id="' + o.id + '" style="color:#ef4444;border:1px solid #334155;background:transparent;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer">❌ Отклонить</button>');
    }
    return '<div style="background:#0b1120;border:1px solid #1e293b;border-radius:10px;padding:12px;margin-bottom:8px">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px">'
      +   '<div style="font-size:13px;color:#e0e7ff;font-weight:600">' + esc(o.channel_description || o.source_title || ('Канал #' + o.channel_id)) + '</div>'
      +   '<span style="background:' + statusBadge[0] + '22;color:' + statusBadge[0] + ';padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">' + statusBadge[1] + '</span>'
      + '</div>'
      + '<div style="font-size:12px;color:#94a3b8;margin-bottom:6px">' + o.placement_hours + 'ч · '
      + (who === 'advertiser' ? 'Списано: <b style="color:#fbbf24">$' + Number(o.price_usd).toFixed(2) + '</b>'
                              : 'Твой доход: <b style="color:#22c55e">$' + Number(o.publisher_earnings).toFixed(2) + '</b>') + '</div>'
      + '<details style="margin:6px 0"><summary style="cursor:pointer;color:#a78bfa;font-size:12px">Текст поста</summary><div style="background:#0f172a;padding:10px;border-radius:6px;font-size:12px;color:#cbd5e1;margin-top:6px;white-space:pre-wrap">' + esc(o.post_text || '') + '</div></details>'
      + (actions.length ? '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' + actions.join('') + '</div>' : '')
      + '</div>';
  }

  async function _ordersClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = Number(btn.dataset.id);
    const path = '/orders/' + id + '/' + act;
    if (act === 'decline') {
      const reason = prompt('Причина отказа (опционально):') || '';
      const r = await fetch(ROOT + path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) });
      const j = await r.json();
      alert(j && j.ok ? 'Заказ отклонён, средства возвращены рекламодателю.' : 'Ошибка: ' + (j && (j.detail || j.reason)));
      const wrap = btn.closest('[id^="adx-"]'); if (wrap) wrap.remove();
      return;
    }
    if (act === 'cancel' && !confirm('Отменить заказ? Деньги вернутся на баланс.')) return;
    if (act === 'accept' && !confirm('Подтвердить публикацию? Бот опубликует пост в канале прямо сейчас.')) return;
    const r = await fetch(ROOT + path, { method: 'POST', credentials: 'same-origin' });
    const j = await r.json();
    if (j && j.ok) {
      alert(act === 'accept' ? '✅ Опубликовано!' : act === 'cancel' ? 'Отменено, $' + Number(j.refunded||0).toFixed(2) + ' возвращено.' : 'OK');
      const wrap = btn.closest('[id^="adx-"]'); if (wrap) wrap.remove();
    } else {
      alert('⚠️ ' + (j && (j.detail || j.reason) || 'Ошибка'));
    }
  }

  function _modalShell(title, inner) {
    return '<style>'
      + '.adx-mdl-shell{position:fixed;inset:0;z-index:99991;background:rgba(0,0,0,0.78);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto;font-family:-apple-system,sans-serif}'
      + '.adx-mdl-card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:20px;max-width:760px;width:100%;color:#e0e7ff;margin-top:30px;max-height:85vh;overflow-y:auto}'
      + '.adx-modal-close{background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer;float:right}'
      + '</style>'
      + '<div class="adx-mdl-shell" style="position:fixed;inset:0;background:rgba(0,0,0,0.78);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto;z-index:99991">'
      + '<div class="adx-mdl-card" style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:22px;max-width:760px;width:100%;margin-top:30px;color:#e0e7ff;max-height:85vh;overflow-y:auto">'
      + '<button class="adx-modal-close" style="float:right;background:transparent;border:none;color:#94a3b8;font-size:22px;cursor:pointer">×</button>'
      + '<h3 style="margin:0 0 10px;font-size:18px">' + title + '</h3>'
      + inner
      + '</div></div>';
  }
})();
