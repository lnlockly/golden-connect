/* Trendex Cabinet — Sokrater (URL Shortener UI). Phase B-C minimal.
   Talks to /cabinet/api/shortener/* endpoints (full Arsenal port behind).
*/
(function () {
  'use strict';
  const ROOT = '/cabinet/api/shortener';
  const SHORT_BASE = (location.origin + '/cabinet/s/');
  const STATE = { items: [], q: '', loading: false };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return s; } };

  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(ROOT + path, opts);
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (r.status === 401) { window.location.href = '/cabinet/login'; throw new Error('auth'); }
    if (!r.ok) throw new Error(d.reason || d.error || ('http_' + r.status));
    return d;
  }

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#00D4FF,#B14AED)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  async function loadList() {
    STATE.loading = true;
    renderList();
    try {
      const d = await api('GET', '/links?limit=200&search=' + encodeURIComponent(STATE.q || ''));
      STATE.items = d.links || d.items || [];
    } catch (e) { STATE.items = []; toast(e.message, true); }
    STATE.loading = false;
    renderList();
  }

  function renderHeader(host) {
    host.innerHTML =
      '<div class="shr-head">' +
        '<div class="shr-head-text">' +
          '<h2>🔗 Сократитель ссылок</h2>' +
          '<p>Создавай короткие ссылки <code>' + SHORT_BASE + 'CODE</code> с трекингом кликов, QR-кодами и UTM. ' +
          'Полный движок Arsenal: A/B-ротация, splash-страницы, OG-превью, теги, кампании.</p>' +
        '</div>' +
        '<button class="shr-cta" id="shrNewBtn">+ Новая ссылка</button>' +
      '</div>' +
      '<div class="shr-search-wrap">' +
        '<input type="search" class="shr-search" id="shrQ" placeholder="🔍 Поиск по URL или коду…">' +
      '</div>' +
      '<div id="shrList"></div>';
    $('shrNewBtn').addEventListener('click', openCreate);
    $('shrQ').addEventListener('input', (e) => { STATE.q = e.target.value; clearTimeout(window._shrDeb); window._shrDeb = setTimeout(loadList, 250); });
  }

  function renderList() {
    const el = $('shrList'); if (!el) return;
    if (STATE.loading) { el.innerHTML = '<div class="shr-empty">Загрузка…</div>'; return; }
    if (!STATE.items.length) {
      el.innerHTML = '<div class="shr-empty">' +
        '<div style="font-size:48px">🔗</div>' +
        '<h3>Пока нет коротких ссылок</h3>' +
        '<p>Создай первую — получишь компактный URL для соцсетей и SMS, плюс статистику переходов.</p>' +
        '<button class="shr-cta" onclick="window.Shr.openCreate()">+ Создать первую</button>' +
      '</div>';
      return;
    }
    el.innerHTML = STATE.items.map((l) => {
      const code = l.code;
      const short = SHORT_BASE + code;
      const dest = l.destination_url || '';
      const title = l.title || dest;
      const clicks = l.total_clicks || 0;
      const og = l.og_image ? '<img class="shr-og" src="' + esc(l.og_image) + '" alt="" loading="lazy">' : '';
      return (
        '<div class="shr-card" data-id="' + l.id + '">' +
          og +
          '<div class="shr-card-body">' +
            '<div class="shr-card-title" title="' + esc(dest) + '">' + esc(title) + '</div>' +
            '<a class="shr-card-short" href="' + esc(short) + '" target="_blank" rel="noopener">' + esc(short) + '</a>' +
            '<div class="shr-card-dest">→ ' + esc(dest) + '</div>' +
            '<div class="shr-card-meta">' +
              '<span>👆 ' + clicks + ' кликов</span>' +
              '<span>📅 ' + esc(fmtDate(l.created_at)) + '</span>' +
              (l.is_active ? '<span class="shr-tag-on">● активна</span>' : '<span class="shr-tag-off">○ выключена</span>') +
            '</div>' +
          '</div>' +
          '<div class="shr-card-actions">' +
            '<button class="shr-btn shr-btn-ghost" onclick="window.Shr.copy(\'' + esc(short) + '\')">📋 Копировать</button>' +
            '<button class="shr-btn shr-btn-ghost" onclick="window.Shr.qr(\'' + esc(code) + '\')">📱 QR</button>' +
            '<button class="shr-btn shr-btn-ghost" onclick="window.Shr.stats(' + l.id + ')">📊 Статистика</button>' +
            '<button class="shr-btn shr-btn-warn" onclick="window.Shr.del(' + l.id + ')">🗑</button>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  function openCreate() {
    if ($('shrCreateModal')) return;
    const m = document.createElement('div');
    m.id = 'shrCreateModal'; m.className = 'shr-modal';
    m.innerHTML =
      '<div class="shr-modal-card">' +
        '<div class="shr-modal-head"><h2>Новая короткая ссылка</h2>' +
        '<button class="shr-modal-close" onclick="window.Shr.closeCreate()">✕</button></div>' +
        '<form id="shrCreateForm" class="shr-modal-body">' +
          '<div class="shr-field"><label>Длинная ссылка *</label>' +
            '<input name="destinationUrl" type="url" placeholder="https://example.com/very-long-path?with=params" required></div>' +
          '<div class="shr-field"><label>Заголовок (опционально)</label>' +
            '<input name="title" type="text" placeholder="Промо лендинг весна 2026" maxlength="100"></div>' +
          '<div class="shr-field"><label>Свой код (опционально)</label>' +
            '<input name="alias" type="text" placeholder="my-promo (3-30 символов)" pattern="[a-zA-Z0-9_-]{3,30}">' +
            '<div class="shr-hint">Если пусто — сгенерируем автоматически.</div></div>' +
          '<div id="shrCreateErr" class="shr-error" style="display:none"></div>' +
          '<div class="shr-modal-actions">' +
            '<button type="button" class="shr-btn shr-btn-ghost" onclick="window.Shr.closeCreate()">Отмена</button>' +
            '<button type="submit" class="shr-btn shr-btn-primary" id="shrSubmit">Создать</button>' +
          '</div>' +
        '</form>' +
      '</div>';
    document.body.appendChild(m);
    $('shrCreateForm').addEventListener('submit', submitCreate);
  }
  function closeCreate() { const m = $('shrCreateModal'); if (m) m.remove(); }

  async function submitCreate(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const body = {
      destinationUrl: f.destinationUrl.value.trim(),
      title: f.title.value.trim(),
      alias: f.alias.value.trim() || undefined,
    };
    const btn = $('shrSubmit'); btn.disabled = true; btn.textContent = '⏳ Создаём…';
    try {
      const d = await api('POST', '/links', body);
      closeCreate();
      toast('🔗 Ссылка создана: ' + (d.link?.code || d.code || ''));
      await loadList();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Создать';
      const eb = $('shrCreateErr'); eb.textContent = 'Ошибка: ' + err.message; eb.style.display = '';
    }
  }

  async function del(id) {
    if (!confirm('Удалить эту ссылку? Старые переходы перестанут работать.')) return;
    try { await api('DELETE', '/links/' + id); toast('🗑 Удалено'); await loadList(); }
    catch (e) { toast(e.message, true); }
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => toast('📋 Скопировано'));
    } else {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove(); toast('📋 Скопировано');
    }
  }

  function qr(code) {
    const url = SHORT_BASE + code;
    const png = 'https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=' + encodeURIComponent(url);
    const m = document.createElement('div');
    m.className = 'shr-modal'; m.id = 'shrQrModal';
    m.innerHTML =
      '<div class="shr-modal-card" style="max-width:420px;text-align:center">' +
        '<div class="shr-modal-head"><h2>QR-код</h2>' +
        '<button class="shr-modal-close" onclick="document.getElementById(\'shrQrModal\').remove()">✕</button></div>' +
        '<div class="shr-modal-body">' +
          '<img src="' + png + '" alt="QR" style="width:100%;max-width:320px;border-radius:12px;background:#fff;padding:12px">' +
          '<p style="margin:12px 0 0;font-family:monospace;font-size:13px;color:#9ca3af;word-break:break-all">' + esc(url) + '</p>' +
          '<a href="' + png + '" download="qr-' + code + '.png" class="shr-btn shr-btn-primary" style="display:inline-block;margin-top:14px;text-decoration:none">⬇ Скачать PNG</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  }

  async function stats(id) {
    try {
      const d = await api('GET', '/links/' + id + '/stats');
      const s = d.stats || d;
      const m = document.createElement('div');
      m.className = 'shr-modal'; m.id = 'shrStatsModal';
      m.innerHTML =
        '<div class="shr-modal-card">' +
          '<div class="shr-modal-head"><h2>📊 Статистика</h2>' +
          '<button class="shr-modal-close" onclick="document.getElementById(\'shrStatsModal\').remove()">✕</button></div>' +
          '<div class="shr-modal-body">' +
            '<div class="shr-stat-row"><span>Всего кликов:</span><b>' + (s.total_clicks || s.totalClicks || 0) + '</b></div>' +
            '<div class="shr-stat-row"><span>Уникальных:</span><b>' + (s.unique_clicks || s.uniqueClicks || '—') + '</b></div>' +
            '<div class="shr-stat-row"><span>Сегодня:</span><b>' + (s.today || '—') + '</b></div>' +
            '<div class="shr-stat-row"><span>Эта неделя:</span><b>' + (s.this_week || s.week || '—') + '</b></div>' +
            (s.daily ? '<pre style="background:#0a0e16;padding:12px;border-radius:8px;margin-top:14px;font-size:11px;color:#9ca3af;max-height:240px;overflow:auto">' + esc(JSON.stringify(s.daily, null, 2)) + '</pre>' : '') +
          '</div>' +
        '</div>';
      document.body.appendChild(m);
    } catch (e) { toast('Не удалось получить статистику: ' + e.message, true); }
  }

  async function mount(host) {
    if (!host) host = $('shortenerPageContent'); if (!host) return;
    renderHeader(host);
    await loadList();
  }

  window.Shr = { mount, openCreate, closeCreate, del, copy, qr, stats };
  window.loadShortenerPage = function () { mount($('shortenerPageContent')); };
})();
