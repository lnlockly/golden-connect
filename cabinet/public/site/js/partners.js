/* Trendex — Наши партнёры (Partners catalog + my participations)
 *   Read pattern from trdx-exchange.js. Pure vanilla, IIFE.
 *   Routes:
 *     #/partners              → catalog
 *     #/partners/:id          → detail
 *     #/my-partners           → my participations list
 */
(function () {
  'use strict';

  /* ── Helpers ────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function clamp(s, n) {
    s = String(s == null ? '' : s);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function fmtDaysAgo(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!t) return '';
    var d = Math.floor((Date.now() - t) / 86400000);
    if (d <= 0) return 'сегодня';
    if (d === 1) return 'вчера';
    if (d < 30) return d + ' дн. назад';
    if (d < 365) return Math.floor(d / 30) + ' мес. назад';
    return Math.floor(d / 365) + ' г. назад';
  }
  function toast(msg, kind) {
    if (window.toast) return window.toast(msg, kind || 'info');
    try { console.log('[toast]', kind || 'info', msg); } catch (_) {}
  }
  async function fetchJson(url, opts) {
    var r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts || {}));
    try { return await r.json(); } catch (e) { return { ok: false, reason: 'bad_json' }; }
  }

  /* ── Stage formatting ───────────────────────────────────────── */
  var STAGE_LABELS = {
    LOOKING_FOR_INVESTOR: '💰 Ищет инвестора',
    LOOKING_FOR_PARTNERS: '🤝 Ищет партнёров',
    EARLY_STAGE: '🌱 Ранняя стадия',
    GROWTH: '🚀 Активный рост',
    MVP: '🧪 MVP',
    LAUNCHED: '✅ Запущен',
    PRESALE: '🪙 Пресейл',
    BETA: '⚙️ Бета-тест',
    ACTIVE: '🟢 Активен'
  };
  function stageBadge(s) {
    var label = STAGE_LABELS[s] || s;
    return '<span style="display:inline-block;padding:4px 10px;background:rgba(177,74,255,.14);color:#d9b6ff;border:1px solid rgba(177,74,255,.30);border-radius:999px;font-size:11px;font-weight:600;margin-right:6px;margin-bottom:4px">' + esc(label) + '</span>';
  }

  /* ── State cache ────────────────────────────────────────────── */
  var _catalogCache = null;
  var _myParticipationsCache = null;

  /* ── API ────────────────────────────────────────────────────── */
  async function apiList(sphere) {
    var qs = '?limit=100&offset=0';
    if (sphere) qs += '&sphere=' + encodeURIComponent(sphere);
    return await fetchJson('/cabinet/api/partners' + qs);
  }
  async function apiOne(id) { return await fetchJson('/cabinet/api/partners/' + encodeURIComponent(id)); }
  async function apiMyPart(id) { return await fetchJson('/cabinet/api/partners/' + encodeURIComponent(id) + '/my-participation'); }
  async function apiStats(id) { return await fetchJson('/cabinet/api/partners/' + encodeURIComponent(id) + '/stats'); }
  async function apiSubmit(id, refLink, projectUsername) {
    return await fetchJson('/cabinet/api/partners/' + encodeURIComponent(id) + '/submit-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralLink: refLink, projectUsername: projectUsername || null })
    });
  }
  async function apiMineAll() { return await fetchJson('/cabinet/api/me/partner-participations'); }

  /* ── Layout shell ───────────────────────────────────────────── */
  function shell(inner) {
    return '<div style="max-width:1180px;margin:0 auto;padding:8px 0 32px">' + inner + '</div>';
  }
  function loadingBlock(msg) {
    return '<div class="cab-card" style="padding:40px 20px;text-align:center;color:#9ca3af;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,0.08);border-radius:14px"><div style="font-size:32px;margin-bottom:12px">⏳</div><div>' + esc(msg || 'Загрузка…') + '</div></div>';
  }
  function errorBlock(msg) {
    return '<div class="cab-card" style="padding:32px 20px;text-align:center;color:#ff5577;background:rgba(20,22,38,0.72);border:1px solid rgba(255,80,90,.30);border-radius:14px"><div style="font-size:28px;margin-bottom:10px">⚠️</div><div>' + esc(msg) + '</div></div>';
  }

  /* ── Catalog card ───────────────────────────────────────────── */
  function partnerHero(p) {
    var img = (p.images && p.images[0]) || '';
    if (img) {
      return '<div style="aspect-ratio:16/9;background:#0c0e1c url(' + esc(img) + ') center/cover no-repeat;border-radius:12px 12px 0 0"></div>';
    }
    var letter = (String(p.title || '?').charAt(0) || '?').toUpperCase();
    return '<div style="aspect-ratio:16/9;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:48px;font-weight:800;letter-spacing:-.04em;border-radius:12px 12px 0 0">' + esc(letter) + '</div>';
  }

  function catalogCard(p, joined) {
    var sphereTag = p.business_sphere ? '<span style="display:inline-block;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#00e0ff;font-weight:700;margin-bottom:6px">' + esc(p.business_sphere) + '</span>' : '';
    var tags = (p.tags || []).slice(0, 3).map(function (t) {
      return '<span style="display:inline-block;padding:3px 9px;background:rgba(255,255,255,.06);color:#cbd5e1;border-radius:999px;font-size:11px;margin-right:5px;margin-bottom:4px">#' + esc(t) + '</span>';
    }).join('');
    var ageStr = fmtDaysAgo(p.created_at);
    var joinedBadge = joined ? '<span title="Вы уже добавили свою реф-ссылку" style="position:absolute;top:10px;right:10px;width:30px;height:30px;border-radius:50%;background:#00ff94;color:#0a0a1a;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;box-shadow:0 4px 12px rgba(0,255,148,.40)">✓</span>' : '';
    return ''
      + '<article class="trd-prtnr-card" data-id="' + esc(p.id) + '" onclick="window.trdxPartnersGo(\'' + esc(p.id) + '\')" '
      + 'style="position:relative;cursor:pointer;display:flex;flex-direction:column;background:rgba(20,22,38,0.72);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.08);border-radius:14px;overflow:hidden;transition:transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease" '
      + 'onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 12px 28px rgba(0,0,0,.35)\';this.style.borderColor=\'rgba(177,74,255,.40)\'" '
      + 'onmouseleave="this.style.transform=\'\';this.style.boxShadow=\'\';this.style.borderColor=\'rgba(255,255,255,0.08)\'">'
      +   partnerHero(p)
      +   joinedBadge
      +   '<div style="padding:14px 16px 16px;display:flex;flex-direction:column;gap:8px;flex:1">'
      +     sphereTag
      +     '<h3 style="margin:0;font-size:17px;font-weight:700;color:#fff;line-height:1.3">' + esc(p.title || 'Без названия') + '</h3>'
      +     '<p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;flex:1">' + esc(clamp(p.description, 120)) + '</p>'
      +     (tags ? '<div style="margin-top:2px">' + tags + '</div>' : '')
      +     '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06)">'
      +       '<span style="font-size:11px;color:#6b7280">' + (ageStr ? 'обновлено ' + ageStr : '') + '</span>'
      +       '<span style="display:inline-block;padding:6px 12px;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);color:#0a0a1a;border-radius:8px;font-weight:700;font-size:12px">Получить ссылку →</span>'
      +     '</div>'
      +   '</div>'
      + '</article>';
  }

  /* ── Catalog view ───────────────────────────────────────────── */
  async function renderCatalog() {
    var host = document.getElementById('partners-content');
    if (!host) { console.error('[partners] #partners-content not found'); return; }
    host.innerHTML = shell(
      '<h2 style="margin:0 0 4px;font-size:26px;letter-spacing:-0.02em;color:#fff;font-family:Geist,Inter,sans-serif">🤝 Наши партнёры</h2>'
      + '<p style="color:#9ca3af;margin:0 0 22px;font-size:14px;max-width:760px;line-height:1.55">Партнёрские проекты Trendex. Добавь свою реф-ссылку из любого партнёра — мы найдём твоих рефералов и начислим <strong style="color:#00ff94">+10 TRDX</strong> за каждого приглашённого тобой человека в этом проекте.</p>'
      + '<div id="prtnr-filter-bar"></div>'
      + '<div id="prtnr-search-bar" style="margin:0 0 16px"><input id="prtnr-search" type="search" placeholder="🔍 Поиск по названию, описанию, тегам…" class="cab-input" style="width:100%;max-width:520px;padding:10px 14px;font-size:14px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#fff;outline:none" oninput="window.trdxPartnersFilter()" /></div>'
      + '<div id="prtnr-grid">' + loadingBlock('Загружаем партнёров…') + '</div>'
      + '<div style="margin-top:24px"><a href="#/my-partners" style="display:inline-block;padding:10px 18px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;text-decoration:none;font-weight:600;font-size:13px" onmouseenter="this.style.borderColor=\'rgba(0,224,255,.50)\'" onmouseleave="this.style.borderColor=\'rgba(255,255,255,.12)\'">📋 Мои реф-ссылки в партнёрах →</a></div>'
    );

    var data, mine;
    try {
      var results = await Promise.allSettled([apiList(''), apiMineAll()]);
      data = results[0].status === 'fulfilled' ? results[0].value : { ok: false };
      mine = results[1].status === 'fulfilled' ? results[1].value : { ok: false };
    } catch (e) {
      document.getElementById('prtnr-grid').innerHTML = errorBlock('Не удалось загрузить: ' + (e.message || e));
      return;
    }
    if (!data || !data.ok) {
      document.getElementById('prtnr-grid').innerHTML = errorBlock((data && data.reason) || 'Ошибка загрузки списка');
      return;
    }
    var items = (data.items || []).filter(function (p) { return p && (p.status === 'active' || !p.status); });
    _catalogCache = items;
    var joinedSet = {};
    if (mine && mine.ok && mine.items) {
      mine.items.forEach(function (row) {
        if (row && row.participation && row.partner) joinedSet[row.partner.id] = true;
      });
    }

    // Filter bar
    var spheres = uniq(items.map(function (p) { return p.business_sphere; }).filter(Boolean));
    var filterBar = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'
      + '<button class="prtnr-pill" data-sphere="" onclick="window.trdxPartnersFilter()" style="padding:7px 14px;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);color:#0a0a1a;border:none;border-radius:999px;font-weight:700;font-size:12px;cursor:pointer">Все (' + items.length + ')</button>';
    spheres.forEach(function (s) {
      var count = items.filter(function (p) { return p.business_sphere === s; }).length;
      filterBar += '<button class="prtnr-pill" data-sphere="' + esc(s) + '" onclick="window.trdxPartnersFilter()" style="padding:7px 14px;background:rgba(20,22,38,0.72);color:#cbd5e1;border:1px solid rgba(255,255,255,.10);border-radius:999px;font-weight:600;font-size:12px;cursor:pointer">' + esc(s) + ' (' + count + ')</button>';
    });
    filterBar += '</div>';
    document.getElementById('prtnr-filter-bar').innerHTML = filterBar;

    if (!items.length) {
      document.getElementById('prtnr-grid').innerHTML = '<div class="cab-card" style="padding:40px 20px;text-align:center;color:#9ca3af;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px">Пока нет активных партнёров. Скоро добавим!</div>';
      return;
    }

    window._trdxJoinedSet = joinedSet;
    renderGrid(items);

    // Pill click: track active sphere via dataset attribute on container
    document.querySelectorAll('.prtnr-pill').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.prtnr-pill').forEach(function (b) {
          b.style.background = 'rgba(20,22,38,0.72)';
          b.style.color = '#cbd5e1';
          b.style.border = '1px solid rgba(255,255,255,.10)';
        });
        btn.style.background = 'linear-gradient(135deg,#b14aff 0%,#00e0ff 100%)';
        btn.style.color = '#0a0a1a';
        btn.style.border = 'none';
        window._trdxCurrentSphere = btn.getAttribute('data-sphere') || '';
      });
    });
  }

  function renderGrid(items) {
    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">';
    items.forEach(function (p) { html += catalogCard(p, !!(window._trdxJoinedSet && window._trdxJoinedSet[p.id])); });
    html += '</div>';
    document.getElementById('prtnr-grid').innerHTML = html;
  }

  window.trdxPartnersFilter = function () {
    var q = (document.getElementById('prtnr-search') && document.getElementById('prtnr-search').value || '').toLowerCase().trim();
    var sphere = window._trdxCurrentSphere || '';
    var list = (_catalogCache || []).filter(function (p) {
      if (sphere && p.business_sphere !== sphere) return false;
      if (!q) return true;
      var hay = ((p.title || '') + ' ' + (p.description || '') + ' ' + ((p.tags || []).join(' '))).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    if (!list.length) {
      document.getElementById('prtnr-grid').innerHTML = '<div class="cab-card" style="padding:30px 20px;text-align:center;color:#9ca3af;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px">Ничего не найдено по вашему запросу</div>';
    } else {
      renderGrid(list);
    }
  };

  window.trdxPartnersGo = function (id) {
    location.hash = '#/partners/' + encodeURIComponent(id);
  };

  /* ── Detail view ────────────────────────────────────────────── */
  async function renderDetail(id) {
    var host = document.getElementById('partners-content');
    if (!host) return;
    host.innerHTML = shell(loadingBlock('Загружаем партнёра…'));

    var results = await Promise.allSettled([apiOne(id), apiMyPart(id), apiStats(id)]);
    var oneR = results[0].status === 'fulfilled' ? results[0].value : null;
    var partR = results[1].status === 'fulfilled' ? results[1].value : null;
    var statsR = results[2].status === 'fulfilled' ? results[2].value : null;

    if (!oneR || !oneR.ok || !oneR.partner) {
      host.innerHTML = shell(
        '<a href="#/partners" style="display:inline-block;margin-bottom:14px;color:#00e0ff;text-decoration:none;font-size:13px">← Назад к каталогу</a>'
        + errorBlock((oneR && oneR.reason) || 'Партнёр не найден')
      );
      return;
    }
    var p = oneR.partner;
    var part = partR && partR.ok ? partR.participation : null;
    var l1 = partR && partR.ok ? (partR.l1_referrals_count || 0) : 0;
    var total = partR && partR.ok ? (partR.total_team_size || 0) : 0;
    var byLevel = (statsR && statsR.ok && statsR.byLevel) || [];

    // Hero
    var heroImg = (p.images && p.images[0]) || '';
    var heroHtml = heroImg
      ? '<div style="aspect-ratio:21/9;background:#0c0e1c url(' + esc(heroImg) + ') center/cover no-repeat;border-radius:18px;margin-bottom:18px"></div>'
      : '<div style="aspect-ratio:21/9;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);border-radius:18px;margin-bottom:18px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:96px;font-weight:800">' + esc((p.title || '?').charAt(0).toUpperCase()) + '</div>';

    // Stages + tags
    var stages = (p.stages || []).map(stageBadge).join('');
    var sphereLine = p.business_sphere
      ? '<span style="display:inline-block;font-size:11px;letter-spacing:.10em;text-transform:uppercase;color:#00e0ff;font-weight:700;margin-right:8px">' + esc(p.business_sphere) + '</span>'
      : '';
    var tagsHtml = (p.tags || []).map(function (t) {
      return '<span style="display:inline-block;padding:4px 11px;background:rgba(255,255,255,.06);color:#cbd5e1;border-radius:999px;font-size:12px;margin-right:6px;margin-bottom:6px">#' + esc(t) + '</span>';
    }).join('');

    // Meta block (budget / equity / website)
    var meta = '';
    if (p.budget) meta += '<div><div style="font-size:10.5px;letter-spacing:.10em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px">Бюджет</div><div style="color:#fff;font-weight:700;font-size:15px">' + esc(p.budget) + '</div></div>';
    if (p.equity) meta += '<div><div style="font-size:10.5px;letter-spacing:.10em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px">Доля / Equity</div><div style="color:#fff;font-weight:700;font-size:15px">' + esc(p.equity) + '</div></div>';
    if (p.website) meta += '<div><div style="font-size:10.5px;letter-spacing:.10em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:4px">Сайт</div><a href="' + esc(p.website) + '" target="_blank" rel="noopener" style="color:#00e0ff;font-weight:700;font-size:14px;text-decoration:none;word-break:break-all">' + esc(p.website) + ' ↗</a></div>';
    var metaHtml = meta
      ? '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;padding:14px;background:rgba(255,255,255,.03);border-radius:10px;margin-top:14px">' + meta + '</div>'
      : '';

    // Participation card
    var partCard;
    if (part && part.referral_link) {
      var invName = part.inviter_tg_username
        ? '@' + part.inviter_tg_username
        : (part.inviter_first_name || (part.inviter_id ? 'партнёр #' + part.inviter_id : 'ищем…'));
      partCard = ''
        + '<div class="cab-card" style="padding:18px;background:linear-gradient(135deg,rgba(0,255,148,.10),rgba(0,224,255,.06));border:1px solid rgba(0,255,148,.30);border-radius:14px;margin-top:18px">'
        +   '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:20px">✅</span><h3 style="margin:0;font-size:16px;color:#fff">Вы зарегистрированы в этом партнёре</h3></div>'
        +   '<div style="font-size:11px;letter-spacing:.10em;color:#9ca3af;text-transform:uppercase;font-weight:700;margin-bottom:6px">Ваша реф-ссылка</div>'
        +   '<div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'
        +     '<input id="prtnr-mylink" readonly value="' + esc(part.referral_link) + '" style="flex:1;min-width:240px;padding:10px 12px;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#fff;font-size:13px;font-family:monospace" />'
        +     '<button onclick="window.trdxPartnersCopy(\'prtnr-mylink\')" style="padding:10px 16px;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);color:#0a0a1a;border:none;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer">📋 Копировать</button>'
        +   '</div>'
        +   '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">'
        +     '<div style="padding:12px;background:rgba(0,0,0,.20);border-radius:10px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:700">Ваш инвайтер</div><div style="color:#fff;font-weight:700">' + esc(invName) + '</div></div>'
        +     '<div style="padding:12px;background:rgba(0,0,0,.20);border-radius:10px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:700">L1 (прямые)</div><div style="color:#00ff94;font-weight:800;font-size:20px">' + l1 + '</div></div>'
        +     '<div style="padding:12px;background:rgba(0,0,0,.20);border-radius:10px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px;font-weight:700">Вся команда</div><div style="color:#00e0ff;font-weight:800;font-size:20px">' + total + '</div></div>'
        +   '</div>'
        +   (part.project_username ? '<div style="margin-top:10px;font-size:12px;color:#9ca3af">Ваш username в проекте: <strong style="color:#fff">@' + esc(part.project_username) + '</strong></div>' : '')
        + '</div>';
    } else {
      var hint = p.ref_link_template
        ? '<div style="font-size:12px;color:#9ca3af;margin-bottom:8px">Пример формата: <code style="background:rgba(255,255,255,.05);padding:2px 6px;border-radius:4px;color:#00e0ff;font-family:monospace">' + esc(p.ref_link_template) + '</code></div>'
        : '';
      partCard = ''
        + '<div class="cab-card" style="padding:18px;background:rgba(20,22,38,0.72);border:1px solid rgba(177,74,255,.30);border-radius:14px;margin-top:18px">'
        +   '<div style="padding:10px 14px;background:linear-gradient(135deg,rgba(177,74,255,.15),rgba(0,224,255,.10));border:1px dashed rgba(0,224,255,.40);border-radius:10px;margin-bottom:14px;font-size:13px;color:#e0e6ff;line-height:1.5">💡 Найди свою реф-ссылку у партнёра и добавь её сюда — <strong style="color:#00ff94">+10 TRDX</strong> за каждого реферала в этом проекте, плюс мы найдём твоего инвайтера и привяжем команду.</div>'
        +   '<h3 style="margin:0 0 12px;font-size:16px;color:#fff">📤 Добавить мою реф-ссылку</h3>'
        +   hint
        +   '<label style="display:block;margin-bottom:10px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:700">Реф-ссылка из партнёра <span style="color:#ff5577">*</span></div>'
        +     '<input id="prtnr-input-link" type="url" class="cab-input" placeholder="https://..." style="width:100%;padding:10px 12px;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#fff;font-size:13px;font-family:monospace;box-sizing:border-box" />'
        +   '</label>'
        +   '<label style="display:block;margin-bottom:14px"><div style="font-size:10.5px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;font-weight:700">Username в проекте (необязательно)</div>'
        +     '<input id="prtnr-input-uname" type="text" class="cab-input" placeholder="например trendexpro" maxlength="64" style="width:100%;padding:10px 12px;background:rgba(0,0,0,.30);border:1px solid rgba(255,255,255,.10);border-radius:8px;color:#fff;font-size:13px;box-sizing:border-box" />'
        +   '</label>'
        +   '<button id="prtnr-submit-btn" onclick="window.trdxPartnersSubmit(\'' + esc(id) + '\')" style="padding:12px 24px;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);color:#0a0a1a;border:none;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer">Добавить и получить инвайтера →</button>'
        + '</div>';
    }

    // Stats by level
    var statsHtml = '';
    if (byLevel && byLevel.length) {
      var maxC = byLevel.reduce(function (m, x) { return Math.max(m, x.count || 0); }, 0);
      statsHtml = '<div class="cab-card" style="padding:18px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-top:18px">'
        + '<h3 style="margin:0 0 14px;font-size:16px;color:#fff">📊 Ваша команда в этом проекте — по уровням</h3>';
      byLevel.forEach(function (row) {
        var pct = maxC > 0 ? Math.round((row.count / maxC) * 100) : 0;
        statsHtml += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
          + '<div style="width:48px;font-size:11px;color:#9ca3af;font-weight:700">L' + esc(row.level) + '</div>'
          + '<div style="flex:1;height:18px;background:rgba(255,255,255,.05);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + Math.max(pct, 2) + '%;background:linear-gradient(90deg,#b14aff,#00e0ff);transition:width 600ms ease"></div></div>'
          + '<div style="min-width:42px;text-align:right;color:#fff;font-weight:700;font-variant-numeric:tabular-nums">' + esc(row.count) + '</div>'
          + '</div>';
      });
      statsHtml += '</div>';
    }

    // Author
    var authorHtml = '';
    if (p.author) {
      var aname = p.author.tg_username ? '@' + p.author.tg_username : (p.author.first_name || ('partner #' + p.author.id));
      var ainit = (String(aname).replace('@', '').charAt(0) || '?').toUpperCase();
      authorHtml = '<div class="cab-card" style="padding:14px 16px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px;margin-top:18px;display:flex;align-items:center;gap:12px">'
        + '<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);display:flex;align-items:center;justify-content:center;color:#0a0a1a;font-weight:800;font-size:18px">' + esc(ainit) + '</div>'
        + '<div><div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.08em;font-weight:700">Куратор проекта</div>'
        + '<div style="color:#fff;font-weight:700;font-size:14px">' + esc(aname) + '</div></div>'
        + '</div>';
    }

    var html = ''
      + '<a href="#/partners" style="display:inline-block;margin-bottom:14px;color:#00e0ff;text-decoration:none;font-size:13px">← Назад к каталогу</a>'
      + heroHtml
      + '<div style="margin-bottom:6px">' + sphereLine + (stages || '') + '</div>'
      + '<h1 style="margin:0 0 12px;font-size:30px;font-weight:800;letter-spacing:-0.02em;color:#fff;font-family:Geist,Inter,sans-serif;line-height:1.15">' + esc(p.title || 'Без названия') + '</h1>'
      + (tagsHtml ? '<div style="margin-bottom:14px">' + tagsHtml + '</div>' : '')
      + '<div class="cab-card" style="padding:18px;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px">'
      +   '<p style="margin:0;color:#cbd5e1;font-size:14.5px;line-height:1.7;white-space:pre-wrap">' + esc(p.description || '') + '</p>'
      +   metaHtml
      + '</div>'
      + partCard
      + statsHtml
      + authorHtml;

    host.innerHTML = shell(html);
  }

  /* ── Submit handler ─────────────────────────────────────────── */
  window.trdxPartnersSubmit = async function (id) {
    var linkEl = document.getElementById('prtnr-input-link');
    var unameEl = document.getElementById('prtnr-input-uname');
    var btn = document.getElementById('prtnr-submit-btn');
    if (!linkEl || !linkEl.value.trim()) { toast('Вставь свою реф-ссылку', 'error'); return; }
    var raw = linkEl.value.trim();
    if (!/^https?:\/\//i.test(raw)) { toast('Ссылка должна начинаться с http:// или https://', 'error'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем…'; btn.style.opacity = '.7'; }
    var r = await apiSubmit(id, raw, unameEl ? unameEl.value.trim() : '');
    if (r && r.ok) {
      toast('+10 TRDX будет начислено когда найдём инвайтера', 'success');
      _myParticipationsCache = null;
      renderDetail(id);
    } else {
      var reason = r && r.reason;
      var msg = 'Ошибка';
      if (reason === 'link_taken') msg = 'Эта ссылка уже занята другим партнёром';
      else if (reason === 'already_submitted') msg = 'Вы уже добавили свою ссылку в этом партнёре';
      else if (reason === 'project_not_found') msg = 'Проект не найден или неактивен';
      else if (reason) msg = reason;
      toast(msg, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Добавить и получить инвайтера →'; btn.style.opacity = ''; }
    }
  };

  /* ── Copy helper ────────────────────────────────────────────── */
  window.trdxPartnersCopy = function (elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.select(); el.setSelectionRange(0, 99999);
    try { document.execCommand('copy'); toast('Скопировано', 'success'); }
    catch (e) {
      if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(function () { toast('Скопировано', 'success'); });
    }
  };

  /* ── My participations view ─────────────────────────────────── */
  async function renderMy() {
    var host = document.getElementById('my-partners-content');
    if (!host) { console.error('[partners] #my-partners-content not found'); return; }
    host.innerHTML = shell(
      '<a href="#/partners" style="display:inline-block;margin-bottom:14px;color:#00e0ff;text-decoration:none;font-size:13px">← К каталогу партнёров</a>'
      + '<h2 style="margin:0 0 4px;font-size:26px;letter-spacing:-0.02em;color:#fff;font-family:Geist,Inter,sans-serif">📋 Мои реф-ссылки в партнёрах</h2>'
      + '<p style="color:#9ca3af;margin:0 0 22px;font-size:14px;max-width:720px;line-height:1.55">Все партнёры, где вы добавили свою реф-ссылку. Кликни на карточку — посмотришь команду, инвайтера, и статистику.</p>'
      + '<div id="prtnr-my-grid">' + loadingBlock('Загружаем ваши участия…') + '</div>'
    );

    var data = await apiMineAll();
    if (!data || !data.ok) {
      document.getElementById('prtnr-my-grid').innerHTML = errorBlock((data && data.reason) || 'Ошибка загрузки');
      return;
    }
    var items = data.items || [];
    if (!items.length) {
      document.getElementById('prtnr-my-grid').innerHTML = ''
        + '<div class="cab-card" style="padding:46px 24px;text-align:center;background:rgba(20,22,38,0.72);border:1px solid rgba(255,255,255,.08);border-radius:14px">'
        + '<div style="font-size:48px;margin-bottom:12px">🤝</div>'
        + '<h3 style="margin:0 0 8px;color:#fff;font-size:18px">Вы ещё не зарегистрировались ни в одном партнёре</h3>'
        + '<p style="color:#9ca3af;margin:0 0 18px;font-size:13.5px;max-width:480px;margin-left:auto;margin-right:auto;line-height:1.55">Зайди в каталог, выбери проект и добавь свою реф-ссылку — мы найдём твоего инвайтера и начислим TRDX за рефералов.</p>'
        + '<a href="#/partners" style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#b14aff 0%,#00e0ff 100%);color:#0a0a1a;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none">Перейти в каталог →</a>'
        + '</div>';
      return;
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px">';
    items.forEach(function (row) {
      if (!row || !row.partner) return;
      var p = row.partner;
      var part = row.participation || {};
      var levels = (row.byLevel || []).slice(0, 5);
      var maxC = levels.reduce(function (m, x) { return Math.max(m, x.count || 0); }, 0);
      var bars = levels.map(function (lv) {
        var pct = maxC > 0 ? Math.round((lv.count / maxC) * 100) : 0;
        return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">'
          + '<div style="width:24px;font-size:10px;color:#9ca3af;font-weight:700">L' + esc(lv.level) + '</div>'
          + '<div style="flex:1;height:8px;background:rgba(255,255,255,.05);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.max(pct, 3) + '%;background:linear-gradient(90deg,#b14aff,#00e0ff)"></div></div>'
          + '<div style="min-width:24px;text-align:right;color:#fff;font-size:11px;font-weight:700">' + esc(lv.count) + '</div>'
          + '</div>';
      }).join('');
      html += '<article style="background:rgba(20,22,38,0.72);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:10px;transition:border-color 200ms ease, transform 200ms ease;cursor:pointer" '
        + 'onmouseenter="this.style.transform=\'translateY(-2px)\';this.style.borderColor=\'rgba(0,224,255,.40)\'" '
        + 'onmouseleave="this.style.transform=\'\';this.style.borderColor=\'rgba(255,255,255,0.08)\'" '
        + 'onclick="window.trdxPartnersGo(\'' + esc(p.id) + '\')">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">'
        +   '<div><div style="font-size:11px;color:#00e0ff;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px">' + esc(p.business_sphere || '') + '</div>'
        +   '<h3 style="margin:0;color:#fff;font-size:16px;font-weight:700">' + esc(p.title || 'Без названия') + '</h3></div>'
        +   '<span style="font-size:11px;background:rgba(0,255,148,.15);color:#00ff94;padding:3px 8px;border-radius:6px;font-weight:700;white-space:nowrap">✓ ДОБАВЛЕНО</span>'
        + '</div>'
        + (part.referral_link ? '<div style="padding:8px 10px;background:rgba(0,0,0,.25);border-radius:8px;font-family:monospace;font-size:11.5px;color:#cbd5e1;word-break:break-all">' + esc(part.referral_link) + '</div>' : '')
        + (bars ? '<div style="margin-top:4px">' + bars + '</div>' : '<div style="font-size:12px;color:#9ca3af">Пока нет рефералов на уровнях. Жди — мы их найдём по реф-ссылкам команды.</div>')
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,.06);font-size:12px;color:#9ca3af">'
        +   '<span>' + (part.created_at ? 'добавлено ' + fmtDaysAgo(part.created_at) : '') + '</span>'
        +   '<span style="color:#00e0ff;font-weight:600">Подробнее →</span>'
        + '</div>'
        + '</article>';
    });
    html += '</div>';
    document.getElementById('prtnr-my-grid').innerHTML = html;
  }

  /* ── Router ─────────────────────────────────────────────────── */
  function dispatchByHash() {
    var hash = String(location.hash || '');
    // hash form examples: "#/partners", "#/partners/abc-123", "#/my-partners"
    var m = hash.match(/^#\/partners\/([^/?#]+)/);
    if (m) {
      renderDetail(decodeURIComponent(m[1]));
    } else {
      renderCatalog();
    }
  }

  /* ── Public entries (wired into loadPage in cabinet.html) ───── */
  window.loadPartnersPage = function () {
    // Listen for hash changes ONCE so detail navigation works inside the page.
    if (!window._trdxPartnersHashBound) {
      window._trdxPartnersHashBound = true;
      window.addEventListener('hashchange', function () {
        // Only act if we are currently on partners page
        var pg = document.getElementById('page-partners');
        if (pg && pg.classList.contains('active')) dispatchByHash();
      });
    }
    dispatchByHash();
  };

  window.loadMyPartnersPage = function () { renderMy(); };
})();
