/* Trendex Cabinet — Мой магазин (shop builder + products) */
(function () {
  'use strict';
  const ROOT = '/cabinet/api';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(ROOT + path, opts);
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (r.status === 401) { window.location.href = '/cabinet/login'; throw new Error('auth'); }
    if (!r.ok || d.ok === false || d.success === false) {
      throw new Error(d.reason || d.error || 'http_' + r.status);
    }
    return d;
  }

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#10b981,#00D4FF)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  let STATE = { tab: 'overview', shop: null, products: [], myProducts: [] };

  async function render() {
    const host = $('myShopContent'); if (!host) return;
    host.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загрузка…</div>';
    try {
      const r = await api('GET', '/shops/me');
      STATE.shop = r.shop;
      STATE.products = r.products || [];
    } catch (e) {
      host.innerHTML = '<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);padding:20px;border-radius:12px;color:#fca5a5">Не удалось загрузить: ' + esc(e.message) + '</div>';
      return;
    }

    if (!STATE.shop) {
      host.innerHTML = '<div style="background:rgba(13,17,36,.6);border:1px dashed rgba(255,255,255,.15);border-radius:14px;padding:50px 24px;text-align:center;color:#9ca3af;max-width:680px;margin:0 auto">' +
        '<div style="font-size:64px;margin-bottom:14px">🏪</div>' +
        '<h2 style="color:#e8edf5;margin:0 0 10px">Создай свой магазин</h2>' +
        '<p style="line-height:1.6;font-size:14px;margin:0 0 20px">Магазин — твоя постоянная витрина: одна ссылка для всех соцсетей, лендинг о тебе и галерея товаров. Можно добавлять как свои товары, так и любые из общего маркетплейса.</p>' +
        '<button class="cab-btn cab-btn-primary" onclick="window.MyShop.create()">🏪 Создать магазин</button>' +
      '</div>';
      return;
    }

    renderShop(host);
  }

  function renderShop(host) {
    const sh = STATE.shop;
    const shopUrl = window.location.origin + '/cabinet/shop/' + sh.slug;
    let html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:18px">' +
      '<div style="flex:1;min-width:280px">' +
        '<h2 style="margin:0 0 6px;color:#fff;font-size:22px">🏪 ' + esc(sh.title || 'Мой магазин') + '</h2>' +
        '<div style="font-size:13px;color:#9ca3af">Ссылка: <a href="' + esc(shopUrl) + '" target="_blank" style="color:#00D4FF">' + esc(shopUrl) + '</a></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button class="cab-btn" onclick="navigator.clipboard.writeText(\'' + shopUrl + '\').then(function(){window.MyShop.toast(\'Ссылка скопирована\')})">📋 Копировать ссылку</button>' +
        '<a class="cab-btn cab-btn-primary" href="' + esc(shopUrl) + '" target="_blank">👁 Открыть</a>' +
      '</div>' +
    '</div>';

    // Tabs
    html += '<div style="display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:8px;flex-wrap:wrap">';
    const tabs = [
      ['overview', '📊 Обзор'],
      ['settings', '⚙ Настройки'],
      ['products', '📦 Товары в магазине'],
      ['add', '+ Добавить товары'],
      ['share', '🔗 Поделиться'],
      ['analytics', '📊 Аналитика'],
    ];
    tabs.forEach(function (t) {
      const active = STATE.tab === t[0];
      html += '<button class="ms-tab" onclick="window.MyShop.tab(\'' + t[0] + '\')" style="background:' + (active ? 'rgba(0,212,255,.1)' : 'transparent') + ';border:1px solid ' + (active ? 'rgba(0,212,255,.4)' : 'transparent') + ';border-radius:10px 10px 0 0;padding:8px 14px;color:' + (active ? '#00D4FF' : '#9ca3af') + ';font-weight:600;cursor:pointer;font-size:13px">' + t[1] + '</button>';
    });
    html += '</div>';
    html += '<div id="ms-body"></div>';
    host.innerHTML = html;
    renderTab();
  }

  function renderTab() {
    const body = $('ms-body'); if (!body) return;
    if (STATE.tab === 'overview') return renderOverview(body);
    if (STATE.tab === 'settings') return renderSettings(body);
    if (STATE.tab === 'products') return renderProducts(body);
    if (STATE.tab === 'add') return renderAdd(body);
    if (STATE.tab === 'share') return renderShare(body);
    if (STATE.tab === 'analytics') return renderAnalytics(body);
  }

  function renderOverview(body) {
    const sh = STATE.shop;
    const total = STATE.products.length;
    const featured = STATE.products.filter(function (p) { return p.is_featured; }).length;
    body.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:18px">' +
        '<div class="cab-card"><div style="font-size:28px;font-weight:800;color:#00D4FF">' + (sh.total_views || 0) + '</div><div style="font-size:12px;color:#9ca3af">Просмотров витрины</div></div>' +
        '<div class="cab-card"><div style="font-size:28px;font-weight:800;color:#10b981">' + (sh.total_sales || 0) + '</div><div style="font-size:12px;color:#9ca3af">Продаж всего</div></div>' +
        '<div class="cab-card"><div style="font-size:28px;font-weight:800;color:#fbbf24">' + total + '</div><div style="font-size:12px;color:#9ca3af">Товаров в магазине</div></div>' +
        '<div class="cab-card"><div style="font-size:28px;font-weight:800;color:#B14AED">' + featured + '</div><div style="font-size:12px;color:#9ca3af">⭐ Топовые</div></div>' +
      '</div>' +
      '<div class="cab-card" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0;color:#fff">💰 Заработок от продаж</h3><button class="cab-btn cab-btn-sm" onclick="window.MyShop.loadEarnings()">↻ Обновить</button></div>' +
        '<div id="shopEarnings" style="color:#9ca3af;font-size:13px">Загрузка…</div>' +
      '</div>' +
      '<div class="cab-card" style="background:linear-gradient(135deg,rgba(16,185,129,.08),rgba(0,212,255,.08));border:1px solid rgba(16,185,129,.25)">' +
        '<h3 style="margin:0 0 10px;color:#fff">📈 Как продвигать магазин</h3>' +
        '<ul style="margin:0;padding-left:20px;color:#cbd5e1;line-height:1.8;font-size:14px">' +
          '<li>Добавь ссылку на магазин в био Telegram, Instagram, TikTok</li>' +
          '<li>Опубликуй пост со ссылкой через <a href="#" onclick="event.preventDefault();window.goPage(\'adcenter\')" style="color:#00D4FF">📡 TG-автопостинг</a></li>' +
          '<li>QR-код магазина повесь в офлайне (визитки, упаковка)</li>' +
          '<li>За каждую продажу с твоего магазина: 70% получает автор товара, 15% — твоя 10-уровневая партнёрка, 10% — проект, 5% — общий пул</li>' +
        '</ul>' +
      '</div>';
  }

  function renderSettings(body) {
    const sh = STATE.shop;
    body.innerHTML =
      '<div class="cab-card">' +
        '<div class="form-row"><label class="cab-label">Название магазина</label><input class="cab-input" id="ms-title" value="' + esc(sh.title) + '" maxlength="120"></div>' +
        '<div class="form-row"><label class="cab-label">Слаган</label><input class="cab-input" id="ms-tagline" value="' + esc(sh.tagline || '') + '" placeholder="Один меткий слоган для шапки"></div>' +
        '<div class="form-row"><label class="cab-label">URL слага (часть адреса)</label><input class="cab-input" id="ms-slug" value="' + esc(sh.slug) + '" maxlength="60">' +
          '<div class="cab-hint" style="font-size:11px;color:#6b7280;margin-top:4px">Адрес: /cabinet/shop/' + esc(sh.slug) + '</div></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="form-row"><label class="cab-label">Цвет акцент 1</label><input class="cab-input" id="ms-c1" value="' + esc(sh.theme_color || '#00D4FF') + '" placeholder="#00D4FF"></div>' +
          '<div class="form-row"><label class="cab-label">Цвет акцент 2</label><input class="cab-input" id="ms-c2" value="' + esc(sh.accent_color || '#B14AED') + '" placeholder="#B14AED"></div>' +
        '</div>' +
        '<div class="form-row"><label class="cab-label">URL аватара (квадратное фото)</label><input class="cab-input" id="ms-avatar" value="' + esc(sh.avatar_url || '') + '" placeholder="https://..."></div>' +
        '<div class="form-row"><label class="cab-label">URL баннера (1500×500)</label><input class="cab-input" id="ms-banner" value="' + esc(sh.banner_url || '') + '" placeholder="https://..."></div>' +
        '<div class="form-row"><label class="cab-label">О магазине (HTML/текст)</label><textarea class="cab-input" id="ms-about" rows="6" placeholder="Расскажи о себе, твоём опыте, кому помогаешь, что отличает твой магазин">' + esc(sh.about_html || '') + '</textarea></div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="form-row"><label class="cab-label">Telegram (@username)</label><input class="cab-input" id="ms-tg" value="' + esc(sh.contact_tg || '') + '" placeholder="@my_username"></div>' +
          '<div class="form-row"><label class="cab-label">Email для связи</label><input class="cab-input" id="ms-email" value="' + esc(sh.contact_email || '') + '" placeholder="me@example.com"></div>' +
        '</div>' +
        '<div class="form-row" style="display:flex;align-items:center;gap:8px"><label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="checkbox" id="ms-public" ' + (sh.is_public ? 'checked' : '') + ' style="width:18px;height:18px"> Магазин виден всем (публично)</label></div>' +
        '<button class="cab-btn cab-btn-primary" style="width:100%" onclick="window.MyShop.save()">💾 Сохранить настройки</button>' +
      '</div>';
  }

  function renderProducts(body) {
    if (!STATE.products.length) {
      body.innerHTML = '<div class="cab-card" style="text-align:center;padding:40px"><div style="font-size:48px">📦</div><h3 style="color:#e8edf5">В магазине пока нет товаров</h3><p style="color:#9ca3af">Перейди во вкладку «+ Добавить товары» — выбирай из своих или из общего маркетплейса.</p><button class="cab-btn cab-btn-primary" onclick="window.MyShop.tab(\'add\')">+ Добавить товары</button></div>';
      return;
    }
    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">';
    STATE.products.forEach(function (p) {
      const slug = p.slug || 'p';
      const cardUrl = window.location.origin + '/cabinet/p/' + slug + '-' + p.id;
      const stars = p.reviews_count
        ? '★★★★★'.slice(0, Math.round(p.avg_rating || 0)) + '☆☆☆☆☆'.slice(0, 5 - Math.round(p.avg_rating || 0))
        : '';
      html += '<div class="cab-card" style="padding:0;overflow:hidden;display:flex;flex-direction:column">' +
        '<div style="height:140px;background:' + (p.preview_image ? 'url(' + esc(p.preview_image) + ') center/cover' : 'linear-gradient(135deg,rgba(0,212,255,.15),rgba(177,74,237,.15))') + ';position:relative">' +
          (p.is_featured ? '<span style="position:absolute;top:8px;left:8px;background:#fbbf24;color:#000;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">⭐ ТОП</span>' : '') +
          '<span style="position:absolute;top:8px;right:8px;background:#10b981;color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">$' + Number(p.price_usd || 0).toFixed(2) + '</span>' +
        '</div>' +
        '<div style="padding:12px;display:flex;flex-direction:column;flex:1">' +
          '<strong style="color:#fff;font-size:14px;margin-bottom:4px">' + esc(p.title) + '</strong>' +
          (stars ? '<div style="color:#fbbf24;font-size:12px;margin-bottom:4px">' + stars + ' <span style="color:#9ca3af">(' + p.reviews_count + ')</span></div>' : '') +
          '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px;flex:1">' + esc((p.description || '').slice(0, 80)) + ((p.description || '').length > 80 ? '…' : '') + '</div>' +
          '<div style="display:flex;gap:6px"><a class="cab-btn cab-btn-sm" style="flex:1;text-align:center;font-size:12px;text-decoration:none" href="' + esc(cardUrl) + '" target="_blank">👁 Карточка</a>' +
          '<button class="cab-btn cab-btn-sm" style="font-size:12px" onclick="window.MyShop.toggleFeat(' + p.id + ',' + (p.is_featured ? 0 : 1) + ')" title="Сделать топ">' + (p.is_featured ? '★' : '☆') + '</button>' +
          '<button class="cab-btn cab-btn-sm" style="font-size:12px;background:rgba(239,68,68,.15);color:#fca5a5" onclick="window.MyShop.removeProd(' + p.id + ')">🗑</button></div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  async function renderAdd(body) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загрузка каталога…</div>';
    let myProducts = [];
    let mkProducts = [];
    try {
      const m = await api('GET', '/products');
      myProducts = m.products || [];
    } catch (_) {}
    try {
      const r = await fetch(ROOT + '/products/marketplace?sort=popular', { credentials: 'same-origin' });
      const d = await r.json();
      mkProducts = d.products || [];
    } catch (_) {}

    const inShop = new Set(STATE.products.map(function (p) { return p.id; }));

    let html = '';
    // My products
    html += '<div class="cab-card" style="margin-bottom:14px"><h3 style="margin:0 0 10px;color:#fff">📦 Мои товары</h3>';
    if (!myProducts.length) {
      html += '<p style="color:#9ca3af;font-size:13px;margin:0 0 10px">У тебя ещё нет товаров. Создай первый в разделе «Продукты».</p>' +
        '<button class="cab-btn cab-btn-primary" onclick="window.goPage(\'products\')">+ Создать товар</button>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">';
      myProducts.forEach(function (p) {
        const added = inShop.has(p.id);
        html += '<div style="background:rgba(0,0,0,.25);border-radius:10px;padding:10px;border:1px solid ' + (added ? 'rgba(16,185,129,.3)' : 'rgba(255,255,255,.06)') + '">' +
          '<strong style="color:#fff;font-size:13px;display:block;margin-bottom:4px">' + esc(p.title) + '</strong>' +
          '<div style="color:#9ca3af;font-size:11px;margin-bottom:8px">$' + Number(p.price_usd || 0).toFixed(2) + ' · ' + esc(p.category || 'other') + '</div>' +
          (added
            ? '<button class="cab-btn cab-btn-sm" disabled style="width:100%;opacity:.55">✓ В магазине</button>'
            : '<button class="cab-btn cab-btn-sm cab-btn-primary" style="width:100%" onclick="window.MyShop.addProd(' + p.id + ')">+ В магазин</button>') +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Marketplace products (others')
    html += '<div class="cab-card"><h3 style="margin:0 0 10px;color:#fff">🛒 Из общего маркетплейса</h3>' +
      '<p style="color:#9ca3af;font-size:13px;margin:0 0 12px">Добавь любой популярный товар к себе. Каждая продажа через твой магазин: 70% автору, 15% твоей 10-уровневой партнёрке, 10% проекту, 5% в общий пул.</p>';
    if (!mkProducts.length) {
      html += '<p style="color:#6b7280;font-size:13px">Маркетплейс пока пуст — будь первым продавцом!</p>';
    } else {
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">';
      mkProducts.forEach(function (p) {
        const added = inShop.has(p.id);
        html += '<div style="background:rgba(0,0,0,.25);border-radius:10px;padding:10px;border:1px solid ' + (added ? 'rgba(16,185,129,.3)' : 'rgba(255,255,255,.06)') + '">' +
          '<strong style="color:#fff;font-size:13px;display:block;margin-bottom:4px">' + esc(p.title) + '</strong>' +
          '<div style="color:#9ca3af;font-size:11px;margin-bottom:4px">$' + Number(p.price_usd || 0).toFixed(2) + ' · от ' + esc(p.seller_name || '#' + p.user_id) + '</div>' +
          (p.reviews_count ? '<div style="color:#fbbf24;font-size:11px;margin-bottom:8px">★ ' + (p.avg_rating || 0).toFixed(1) + ' (' + p.reviews_count + ')</div>' : '<div style="margin-bottom:8px"></div>') +
          (added
            ? '<button class="cab-btn cab-btn-sm" disabled style="width:100%;opacity:.55">✓ В магазине</button>'
            : '<button class="cab-btn cab-btn-sm cab-btn-primary" style="width:100%" onclick="window.MyShop.addProd(' + p.id + ')">+ В магазин</button>') +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    body.innerHTML = html;
  }

  // === Public API ===
  async function renderAnalytics(body) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загружаем аналитику…</div>';
    let data;
    try {
      const r = await api('GET', '/shops/me/analytics');
      data = r.analytics;
    } catch (e) {
      body.innerHTML = '<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);padding:20px;border-radius:12px;color:#fca5a5">Не удалось загрузить: ' + esc(e.message) + '</div>';
      return;
    }
    if (!data) {
      body.innerHTML = '<div class="cab-card" style="text-align:center;padding:40px"><div style="font-size:48px">📊</div><h3 style="color:#e8edf5">Магазин ещё не создан</h3></div>';
      return;
    }
    const t = data.totals || {};
    const earn = (data.earnings || []).reduce(function (acc, r) { acc[r.split_type] = r.total; return acc; }, {});
    const totalEarned = (earn.seller || 0) + (earn.upline || 0);

    let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:18px">' +
      _kpi('👁', t.unique_visitors, 'Уникальных посетителей', '#00D4FF') +
      _kpi('📈', t.total_visits, 'Всего визитов', '#B14AED') +
      _kpi('🔥', t.today_visits, 'Сегодня', '#fbbf24') +
      _kpi('🛒', t.total_sales, 'Покупок', '#10b981') +
      _kpi('💯', t.conversion_pct + '%', 'Конверсия', '#F472B6') +
      _kpi('💰', '$' + totalEarned.toFixed(2), 'Всего заработано', '#10b981') +
    '</div>';

    // 14-day visits + revenue chart
    const days = {};
    (data.visits14d || []).forEach(function (d) { days[d.day] = days[d.day] || {}; days[d.day].visits = d.cnt; days[d.day].unique = d.unique_visitors; });
    (data.revenue14d || []).forEach(function (d) { days[d.day] = days[d.day] || {}; days[d.day].revenue = d.revenue; days[d.day].sales = d.sales; });
    const dayKeys = [];
    for (let k = 13; k >= 0; k--) {
      const dt = new Date(); dt.setDate(dt.getDate() - k);
      dayKeys.push(dt.toISOString().slice(0, 10));
    }
    const maxV = Math.max(1, Object.values(days).reduce(function (m, d) { return Math.max(m, d.visits || 0); }, 0));
    const maxR = Math.max(1, Object.values(days).reduce(function (m, d) { return Math.max(m, d.revenue || 0); }, 0));

    html += '<div class="cab-card" style="margin-bottom:14px"><h3 style="margin:0 0 12px;color:#fff">📈 14 дней</h3>' +
      '<div style="display:flex;gap:3px;align-items:flex-end;height:140px;padding:0 4px">' +
      dayKeys.map(function (k) {
        const d = days[k] || {};
        const vh = Math.max(2, Math.round((d.visits || 0) / maxV * 100));
        const rh = Math.max(0, Math.round((d.revenue || 0) / maxR * 100));
        const dt = new Date(k);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:0">' +
          '<div style="width:100%;display:flex;gap:1px;height:120px;align-items:flex-end">' +
          '<div title="Визиты ' + (d.visits || 0) + '" style="flex:1;background:linear-gradient(180deg,#00D4FF,#B14AED);border-radius:3px 3px 0 0;height:' + vh + '%"></div>' +
          (rh > 0 ? '<div title="Доход $' + (d.revenue || 0).toFixed(2) + '" style="flex:1;background:#10b981;border-radius:3px 3px 0 0;height:' + rh + '%"></div>' : '') +
          '</div>' +
          '<div style="font-size:10px;color:#9ca3af">' + dt.getDate() + '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
      '<div style="display:flex;gap:14px;justify-content:center;margin-top:10px;font-size:11px;color:#9ca3af">' +
        '<span><span style="display:inline-block;width:10px;height:10px;background:linear-gradient(135deg,#00D4FF,#B14AED);border-radius:2px;margin-right:4px"></span> Визиты</span>' +
        '<span><span style="display:inline-block;width:10px;height:10px;background:#10b981;border-radius:2px;margin-right:4px"></span> Доход</span>' +
      '</div>' +
    '</div>';

    // Top products
    html += '<div class="cab-card" style="margin-bottom:14px"><h3 style="margin:0 0 12px;color:#fff">🏆 Товары: статистика и конверсия</h3>';
    if (!data.products || !data.products.length) {
      html += '<div style="color:#9ca3af;font-size:13px">Нет товаров в магазине.</div>';
    } else {
      html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<thead><tr style="border-bottom:1px solid rgba(255,255,255,.08);color:#9ca3af;font-size:11px;text-transform:uppercase">' +
          '<th style="text-align:left;padding:8px 6px">Товар</th>' +
          '<th style="text-align:right;padding:8px 6px">Просмотры</th>' +
          '<th style="text-align:right;padding:8px 6px">Уникальные</th>' +
          '<th style="text-align:right;padding:8px 6px">Продажи</th>' +
          '<th style="text-align:right;padding:8px 6px">Конверсия</th>' +
          '<th style="text-align:right;padding:8px 6px">Доход</th>' +
        '</tr></thead><tbody>';
      data.products.forEach(function (p) {
        const conv = (p.view_count || 0) > 0 ? Math.round((p.total_sales / p.view_count) * 1000) / 10 : 0;
        const convColor = conv >= 5 ? '#10b981' : conv >= 1 ? '#fbbf24' : '#9ca3af';
        html += '<tr style="border-bottom:1px solid rgba(255,255,255,.04)">' +
          '<td style="padding:8px 6px"><strong style="color:#fff">' + esc((p.title || '').slice(0, 40)) + '</strong>' + (p.is_featured ? ' <span style="color:#fbbf24">⭐</span>' : '') + '</td>' +
          '<td style="text-align:right;padding:8px 6px;color:#cbd5e1">' + (p.view_count || 0) + '</td>' +
          '<td style="text-align:right;padding:8px 6px;color:#9ca3af">' + (p.unique_views_all_time || 0) + '</td>' +
          '<td style="text-align:right;padding:8px 6px;color:#10b981;font-weight:700">' + (p.total_sales || 0) + '</td>' +
          '<td style="text-align:right;padding:8px 6px;color:' + convColor + ';font-weight:700">' + conv + '%</td>' +
          '<td style="text-align:right;padding:8px 6px;color:#10b981;font-family:monospace">$' + (p.total_revenue || 0).toFixed(2) + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    // Recent sales
    html += '<div class="cab-card" style="margin-bottom:14px"><h3 style="margin:0 0 12px;color:#fff">📦 Последние продажи</h3>';
    if (!data.recentSales || !data.recentSales.length) {
      html += '<div style="color:#9ca3af;font-size:13px">Покупок ещё не было.</div>';
    } else {
      html += '<div style="display:grid;gap:8px">';
      data.recentSales.forEach(function (s) {
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(0,0,0,.25);border-radius:8px;font-size:13px">' +
          '<div><strong style="color:#fff">' + esc(s.product_title || ('Товар #' + s.id)) + '</strong>' +
          '<div style="font-size:11px;color:#9ca3af">' + esc((s.buyer_email || '').replace(/(.).+(@.+)/, '$1***$2')) + ' · ' + (s.created_at || '').slice(0, 16) + '</div></div>' +
          '<div style="color:#10b981;font-weight:800;font-family:monospace">$' + Number(s.amount_usd || 0).toFixed(2) + '</div>' +
        '</div>';
      });
      html += '</div>';
    }
    html += '</div>';

    // Top referrers
    if (data.topReferrers && data.topReferrers.length) {
      html += '<div class="cab-card"><h3 style="margin:0 0 12px;color:#fff">🚀 Топ источники трафика</h3>' +
        '<div style="display:grid;gap:6px">';
      data.topReferrers.forEach(function (r) {
        html += '<div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(0,0,0,.2);border-radius:6px;font-size:13px">' +
          '<span>📎 ref_user_id #' + r.ref_user_id + '</span><strong style="color:#00D4FF">' + r.visits + ' визитов</strong></div>';
      });
      html += '</div></div>';
    }

    body.innerHTML = html;
  }

  function _kpi(icon, val, lbl, color) {
    return '<div class="cab-card" style="padding:14px"><div style="font-size:24px;margin-bottom:4px">' + icon + '</div>' +
      '<div style="font-size:24px;font-weight:800;color:' + color + ';font-family:Orbitron,monospace;line-height:1">' + val + '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:4px">' + lbl + '</div></div>';
  }

  function renderShare(body) {
    const sh = STATE.shop;
    const shopUrl = window.location.origin + '/cabinet/shop/' + sh.slug;
    body.innerHTML =
      '<div class="cab-card" style="margin-bottom:14px">' +
        '<h3 style="margin:0 0 10px;color:#fff">🔗 Прямая ссылка</h3>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input class="cab-input" value="' + shopUrl + '" readonly style="font-family:monospace;color:#00D4FF" id="ms-link">' +
          '<button class="cab-btn" onclick="document.getElementById(\'ms-link\').select();document.execCommand(\'copy\');window.MyShop.toast(\'Скопировано\')">📋</button>' +
        '</div>' +
        '<div class="cab-hint" style="font-size:11px;color:#6b7280;margin-top:6px">Эту ссылку клади в био соцсетей, рассылку, визитки. Все продажи через неё считаются твои (ты получишь 15% c 10 уровней + 70% если это твой собственный товар).</div>' +
      '</div>' +
      '<div class="cab-card">' +
        '<h3 style="margin:0 0 10px;color:#fff">📲 QR-код магазина</h3>' +
        '<div id="ms-qr" style="text-align:center;padding:20px"><div class="cab-loading">Генерация…</div></div>' +
        '<div class="cab-hint" style="font-size:11px;color:#6b7280;margin-top:6px;text-align:center">Сохрани и распечатай — на визитках, упаковке, мерче</div>' +
      '</div>';
    // Generate QR via /api/tools/qr
    fetch('/cabinet/api/tools/qr', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: shopUrl, size: 480 }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        const box = document.getElementById('ms-qr'); if (!box) return;
        if (d.ok && d.qr && d.qr.dataUrl) {
          box.innerHTML = '<img src="' + d.qr.dataUrl + '" style="max-width:240px;background:#fff;padding:8px;border-radius:8px">' +
            '<div style="margin-top:10px"><a class="cab-btn" href="' + d.qr.dataUrl + '" download="shop-' + sh.slug + '.png">⬇ Скачать PNG</a></div>';
        } else { box.innerHTML = '<div class="cab-hint">QR недоступен</div>'; }
      })
      .catch(function () { document.getElementById('ms-qr').innerHTML = '<div class="cab-hint">Ошибка генерации QR</div>'; });
  }

  window.MyShop = {};

  window.MyShop.create = async function () {
    try {
      await api('POST', '/shops/me', {});
      toast('🏪 Магазин создан');
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.MyShop.save = async function () {
    const payload = {
      title: $('ms-title').value.trim(),
      tagline: $('ms-tagline').value.trim(),
      slug: $('ms-slug').value.trim(),
      theme_color: $('ms-c1').value.trim() || '#00D4FF',
      accent_color: $('ms-c2').value.trim() || '#B14AED',
      avatar_url: $('ms-avatar').value.trim() || null,
      banner_url: $('ms-banner').value.trim() || null,
      about_html: $('ms-about').value,
      contact_tg: $('ms-tg').value.trim(),
      contact_email: $('ms-email').value.trim(),
      is_public: $('ms-public').checked,
    };
    if (!payload.title) return toast('Введи название', true);
    try {
      await api('POST', '/shops/me', payload);
      toast('💾 Сохранено');
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.MyShop.tab = function (t) { STATE.tab = t; render(); };

  window.MyShop.addProd = async function (productId) {
    try {
      await api('POST', '/shops/products', { product_id: productId });
      toast('+ Добавлено в магазин');
      render();
    } catch (e) {
      const msg = ({ 'create_shop_first': 'Сначала создай магазин', 'already_in_shop': 'Уже в магазине', 'product_not_found': 'Товар не найден' })[e.message] || e.message;
      toast('Ошибка: ' + msg, true);
    }
  };

  window.MyShop.removeProd = async function (productId) {
    if (!confirm('Убрать товар из магазина? (сам товар не удалится)')) return;
    try {
      await api('DELETE', '/shops/products/' + productId);
      toast('Убрано из магазина');
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.MyShop.toggleFeat = async function (productId, featured) {
    // No PATCH endpoint; remove+add with featured flag
    try {
      await api('DELETE', '/shops/products/' + productId);
      await api('POST', '/shops/products', { product_id: productId, is_featured: featured });
      toast(featured ? '⭐ В топ' : 'Снято с топа');
      render();
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.MyShop.toast = toast;

  window.loadMyShopPage = render;
})();
