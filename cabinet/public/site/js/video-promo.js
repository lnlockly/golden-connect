/* Phase S.7 — Video-promo cabinet page.
 *
 * Shows the user's pending video-promo assignments (if any), lets them submit
 * the published URL via a small form, and renders recent history + totals.
 *
 * If me.isAdmin is true, an admin block at the bottom exposes hashtag CRUD
 * (toggle/add) + a "Collect now" trigger for the video-collector cron.
 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtDate(d) {
    if (!d) return '—';
    try {
      const dt = new Date(d.indexOf('T') < 0 ? d.replace(' ', 'T') + 'Z' : d);
      return dt.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return d; }
  }

  async function _api(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    let json;
    try { json = await r.json(); } catch (_) { json = { ok: false, reason: 'bad_response' }; }
    return { status: r.status, json };
  }

  function renderEmpty() {
    return '<div class="cab-card" style="padding:32px;text-align:center">' +
      '<div style="font-size:48px;margin-bottom:12px">🎬</div>' +
      '<h3 style="margin:0 0 8px">Видео-промо ещё не пришло</h3>' +
      '<p style="color:var(--text-secondary);margin:0 0 14px">Бот пришлёт первое видео в течение нескольких часов после регистрации. Каждый день — новое.</p>' +
      '<a class="cab-btn cab-btn-primary" href="https://t.me/GoldenConnect_bizbot" target="_blank" rel="noopener">Открыть бота</a>' +
      '</div>';
  }

  function renderPending(pending) {
    if (!pending.length) {
      return '<div class="cab-card" style="padding:18px">' +
        '<h3 style="margin:0 0 6px">⏳ Ничего не ждёт отчёта</h3>' +
        '<p style="color:var(--text-secondary);margin:0">Завтра прилетит следующее видео-промо.</p>' +
        '</div>';
    }
    let h = '<div class="cab-card" style="padding:18px">';
    h += '<h3 style="margin:0 0 14px">⏳ Ждут отчёта (' + pending.length + ')</h3>';
    pending.forEach(function (a) {
      const tag = a.hashtag ? '#' + esc(String(a.hashtag).replace(/^#/, '')) : '';
      h += '<div style="border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:var(--bg-soft)">';
      h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
      h += '<div><b>#' + a.id + '</b> · ' + esc(a.source_platform || '?') + (tag ? ' · ' + tag : '') + '</div>';
      h += '<div style="color:var(--text-secondary);font-size:12px">прислано ' + fmtDate(a.sent_at) + '</div>';
      h += '</div>';
      h += '<div style="display:flex;gap:8px">';
      h += '<input class="cab-input" id="vrep-url-' + a.id + '" placeholder="https://tiktok.com/@you/video/..." style="flex:1" />';
      h += '<button class="cab-btn cab-btn-primary" onclick="window._vpSubmitReport(' + a.id + ')">📨 Отправить</button>';
      h += '</div>';
      h += '<div id="vrep-msg-' + a.id + '" style="margin-top:8px;font-size:13px"></div>';
      h += '</div>';
    });
    h += '<p style="color:var(--text-secondary);margin:6px 0 0;font-size:13px">' +
      'За каждый принятый отчёт — <b>+5 кармы</b>. Можешь также отправить ссылку прямо в боте — кнопка под видео.</p>';
    h += '</div>';
    return h;
  }

  function renderHistory(reported, totals) {
    let h = '<div class="cab-card" style="padding:18px;margin-top:12px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
    h += '<h3 style="margin:0">✅ Принятые отчёты</h3>';
    h += '<div style="color:var(--text-secondary)">всего: <b>' + totals.reported + '</b></div>';
    h += '</div>';
    if (!reported.length) {
      h += '<p style="color:var(--text-secondary);margin:0">Ещё нет отправленных отчётов.</p>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:8px">';
      reported.forEach(function (a) {
        const url = a.report_url || '';
        const tag = a.hashtag ? '#' + esc(String(a.hashtag).replace(/^#/, '')) : '';
        h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-soft);border-radius:10px">';
        h += '<div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
        h += '<b>#' + a.id + '</b> · ';
        h += url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" style="color:var(--accent)">' + esc(url) + '</a>' : '—';
        if (tag) h += ' <span style="color:var(--text-secondary)">' + tag + '</span>';
        h += '</div>';
        h += '<div style="color:var(--text-secondary);font-size:12px;flex-shrink:0">' + fmtDate(a.reported_at) + '</div>';
        h += '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function renderHeader(totals) {
    let h = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">';
    h += '<div class="cab-card" style="padding:14px"><div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase">Всего получено</div><div style="font-size:24px;font-weight:800;margin-top:4px">' + totals.total + '</div></div>';
    h += '<div class="cab-card" style="padding:14px"><div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase">Принято отчётов</div><div style="font-size:24px;font-weight:800;margin-top:4px;color:var(--accent)">' + totals.reported + '</div></div>';
    h += '<div class="cab-card" style="padding:14px"><div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase">Карма за отчёты</div><div style="font-size:24px;font-weight:800;margin-top:4px;color:#fbbf24">+' + (totals.reported * 5) + '</div></div>';
    h += '</div>';
    return h;
  }

  async function renderAdminBlock() {
    if (!window.me || !window.me.isAdmin) return '';
    const r = await _api('GET', '/cabinet/api/admin/hashtags');
    if (r.status !== 200 || !r.json.ok) return '';
    const tags = r.json.hashtags || [];
    const ps = r.json.pool_stats || {};
    let h = '<div class="cab-card" style="padding:18px;margin-top:18px;border:1px solid #fbbf24">';
    h += '<h3 style="margin:0 0 4px">🛠 Админ — хэштеги для сбора видео</h3>';
    h += '<p style="color:var(--text-secondary);margin:0 0 14px">Пул: <b>' + (ps.available || 0) + '</b> доступно из <b>' + (ps.n_pool || 0) + '</b> загруженных. Активных тегов: <b>' + tags.filter(function (t) { return t.active; }).length + '</b>.</p>';
    h += '<div style="display:flex;gap:8px;margin-bottom:12px">';
    h += '<input class="cab-input" id="vp-new-tag" placeholder="новый хэштег (без #)" style="flex:1" />';
    h += '<select class="cab-input" id="vp-new-cat" style="max-width:160px"><option value="ai">ai</option><option value="business">business</option><option value="other">other</option></select>';
    h += '<input class="cab-input" id="vp-new-pri" type="number" min="1" max="10" value="5" style="max-width:80px" title="приоритет" />';
    h += '<button class="cab-btn cab-btn-primary" onclick="window._vpAddHashtag()">+ Добавить</button>';
    h += '<button class="cab-btn" onclick="window._vpCollectNow(this)">🔄 Сбор</button>';
    h += '</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
    tags.forEach(function (t) {
      const bg = t.active ? 'var(--accent-soft)' : 'rgba(127,127,127,.15)';
      const col = t.active ? 'var(--accent)' : 'var(--text-secondary)';
      h += '<span onclick="window._vpToggleHashtag(' + t.id + ')" title="клик чтобы вкл/выкл" style="cursor:pointer;padding:5px 10px;border-radius:14px;background:' + bg + ';color:' + col + ';font-size:13px;font-weight:600">' +
        (t.active ? '' : '⏸ ') + '#' + esc(t.hashtag) + ' <span style="opacity:.6">·' + (t.priority || 5) + '·' + esc(t.category || '?') + '</span></span>';
    });
    h += '</div>';
    h += '<p id="vp-admin-msg" style="margin:10px 0 0;font-size:13px;color:var(--text-secondary)"></p>';
    h += '</div>';
    return h;
  }

  window.loadVideoPromoPage = async function () {
    const root = document.getElementById('video_promo_content');
    if (!root) return;
    root.innerHTML = '<div class="cab-loading">Загрузка…</div>';
    const r = await _api('GET', '/cabinet/api/my-video-promo');
    if (r.status === 401) {
      root.innerHTML = '<div class="cab-card" style="padding:18px">Требуется вход.</div>';
      return;
    }
    if (r.status !== 200 || !r.json.ok) {
      root.innerHTML = '<div class="cab-card" style="padding:18px;color:#ef4444">Ошибка: ' + esc(r.json.reason || 'unknown') + '</div>';
      return;
    }
    const totals = r.json.totals || { total: 0, reported: 0 };
    const pending = r.json.pending || [];
    const reported = r.json.reported || [];
    if (!totals.total) {
      root.innerHTML = renderEmpty() + (await renderAdminBlock());
      return;
    }
    root.innerHTML =
      renderHeader(totals) +
      renderPending(pending) +
      renderHistory(reported, totals) +
      (await renderAdminBlock());
  };

  window._vpSubmitReport = async function (assignmentId) {
    const inp = document.getElementById('vrep-url-' + assignmentId);
    const msg = document.getElementById('vrep-msg-' + assignmentId);
    const url = (inp.value || '').trim();
    if (!/^https?:\/\//i.test(url)) {
      msg.innerHTML = '<span style="color:#ef4444">Нужна ссылка вида https://…</span>';
      return;
    }
    msg.innerHTML = '<span style="color:var(--text-secondary)">Отправляю…</span>';
    const r = await _api('POST', '/cabinet/api/my-video-promo/' + assignmentId + '/report', { url: url });
    if (r.status === 200 && r.json.ok) {
      msg.innerHTML = '<span style="color:#10b981">✅ Принято! +5 кармы.</span>';
      setTimeout(window.loadVideoPromoPage, 800);
    } else {
      msg.innerHTML = '<span style="color:#ef4444">❌ ' + esc(r.json.reason || 'не удалось') + '</span>';
    }
  };

  window._vpAddHashtag = async function () {
    const tag = (document.getElementById('vp-new-tag').value || '').trim();
    const cat = document.getElementById('vp-new-cat').value;
    const pri = parseInt(document.getElementById('vp-new-pri').value, 10) || 5;
    const m = document.getElementById('vp-admin-msg');
    if (!tag) { m.textContent = 'Пустой тег'; return; }
    m.textContent = 'Добавляю…';
    const r = await _api('POST', '/cabinet/api/admin/hashtags', { hashtag: tag, category: cat, priority: pri });
    if (r.status === 200 && r.json.ok) { window.loadVideoPromoPage(); }
    else { m.textContent = 'Ошибка: ' + (r.json.reason || 'unknown'); }
  };

  window._vpToggleHashtag = async function (id) {
    await _api('POST', '/cabinet/api/admin/hashtags/' + id + '/toggle');
    window.loadVideoPromoPage();
  };

  window._vpCollectNow = async function (btn) {
    const m = document.getElementById('vp-admin-msg');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Собираю…'; }
    m.textContent = 'Запускаю сбор…';
    const r = await _api('POST', '/cabinet/api/admin/hashtags/collect-now');
    if (btn) { btn.disabled = false; btn.textContent = '🔄 Сбор'; }
    if (r.status === 200 && r.json.ok) {
      m.textContent = 'Собрано: ' + (r.json.added || 0) + ' видео из ' + (r.json.tried || 0) + ' хэштегов.';
      setTimeout(window.loadVideoPromoPage, 1200);
    } else {
      m.textContent = 'Ошибка сбора: ' + (r.json.reason || 'unknown');
    }
  };
})();
