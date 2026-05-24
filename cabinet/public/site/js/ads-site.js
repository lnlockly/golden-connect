// Cabinet page /cabinet#/ads-site — banner management (Phase 2).
// Two tabs: Баннеры (free) + Видео (locked for free, comes in Phase 3).
(function () {
  'use strict';

  const API = (p) => '/cabinet/api/ads-site' + p;
  const FORMATS = [
    { id: '728x90',  label: '728×90 — leaderboard',     w: 728, h: 90 },
    { id: '300x250', label: '300×250 — medium rect',    w: 300, h: 250 },
    { id: '160x600', label: '160×600 — skyscraper',     w: 160, h: 600 },
    { id: '320x50',  label: '320×50 — mobile leaderboard', w: 320, h: 50 },
    { id: 'sticky-bottom', label: 'Sticky bottom (mobile, 728×90 base)', w: 728, h: 90 },
  ];

  const STATUS_BADGES = {
    pending:   { label: '⏳ На модерации',  color: '#fbbf24' },
    active:    { label: '✅ Активен',         color: '#22c55e' },
    paused:    { label: '⏸ Пауза',           color: '#94a3b8' },
    rejected:  { label: '❌ Отклонён',        color: '#ef4444' },
    exhausted: { label: '💸 Бюджет исчерпан', color: '#f97316' },
    deleted:   { label: '🗑 Удалён',          color: '#64748b' },
  };

  function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  function fmtTrx(n) { return fmt(Math.round((Number(n) || 0) * 100) / 100); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  async function fetchJson(url, opts) {
    try {
      const r = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
      const j = await r.json();
      return j;
    } catch (_) { return null; }
  }

  async function loadBanners() {
    const j = await fetchJson(API('/banner/list'));
    return (j && j.ok) ? j.banners : [];
  }

  function renderBannerCard(b) {
    const badge = STATUS_BADGES[b.status] || { label: b.status, color: '#94a3b8' };
    return ''
      + '<div class="ads-card" style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">'
      + '  <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">'
      + (b.image_url ? '    <img src="' + escapeHtml(b.image_url) + '" style="max-width:200px;max-height:120px;border-radius:8px;background:#1e293b" alt="">' : '')
      + '    <div style="flex:1;min-width:200px">'
      + '      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px">'
      + '        <h4 style="margin:0;color:#e0e7ff;font-size:15px">' + escapeHtml(b.name) + '</h4>'
      + '        <span style="background:' + badge.color + '22;color:' + badge.color + ';padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">' + badge.label + '</span>'
      + '      </div>'
      + '      <div style="font-size:12px;color:#94a3b8;margin-bottom:6px"><b>' + escapeHtml(b.format) + '</b> · → <a href="' + escapeHtml(b.target_url) + '" target="_blank" rel="noopener" style="color:#a78bfa">' + escapeHtml(b.target_url.slice(0, 50)) + '</a></div>'
      + '      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;margin:8px 0">'
      + '        <div><div style="color:#64748b">Показы</div><div style="color:#e0e7ff;font-weight:700">' + fmt(b.impressions_total) + '</div></div>'
      + '        <div><div style="color:#64748b">Клики</div><div style="color:#e0e7ff;font-weight:700">' + fmt(b.clicks_total) + '</div></div>'
      + '        <div><div style="color:#64748b">CTR</div><div style="color:#e0e7ff;font-weight:700">' + b.ctr + '%</div></div>'
      + '        <div><div style="color:#64748b">Потрачено</div><div style="color:#a78bfa;font-weight:700">' + fmtTrx(b.trdx_spent_total) + ' TRDX</div></div>'
      + '      </div>'
      + '      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Дневной бюджет: <b>' + fmt(b.daily_budget_trdx) + ' TRDX</b>' + (b.total_budget_trdx ? ' · Общий: ' + fmt(b.total_budget_trdx) : '') + '</div>'
      + (b.reject_reason ? '      <div style="background:#7f1d1d22;border:1px solid #7f1d1d;color:#fca5a5;padding:8px;border-radius:6px;font-size:12px;margin-bottom:8px">Причина отклонения: ' + escapeHtml(b.reject_reason) + '</div>' : '')
      + '      <div style="display:flex;gap:8px;flex-wrap:wrap">'
      + (b.status === 'active'    ? '<button class="cab-btn" data-act="pause"  data-id="' + b.id + '">⏸ Пауза</button>' : '')
      + (b.status === 'paused'    ? '<button class="cab-btn cab-btn-primary" data-act="resume" data-id="' + b.id + '">▶️ Возобновить</button>' : '')
      + '        <button class="cab-btn" data-act="stats"  data-id="' + b.id + '">📊 Статистика</button>'
      + '        <button class="cab-btn" data-act="delete" data-id="' + b.id + '" style="color:#ef4444">🗑 Удалить</button>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function buildCreateForm() {
    return ''
      + '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(167,139,250,0.2);border-radius:14px;padding:20px;margin-bottom:20px">'
      + '  <h3 style="margin:0 0 14px;color:#e0e7ff">📤 Создать новый баннер</h3>'
      + '  <form id="ads-create-form" style="display:grid;gap:12px">'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Название</label>'
      + '      <input class="cab-input" name="name" required maxlength="80" placeholder="Промо моего сайта" style="width:100%"></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Формат</label>'
      + '      <select class="cab-input" name="format" required style="width:100%">'
      +        FORMATS.map(f => '<option value="' + f.id + '">' + f.label + '</option>').join('')
      + '      </select></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">URL для перехода</label>'
      + '      <input class="cab-input" name="target_url" type="url" required placeholder="https://example.com/page" style="width:100%"></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Изображение (PNG/JPG/WEBP/GIF, до 1.5 МБ — любой размер, система подгонит)</label>'
      + '      <input class="cab-input" name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" required style="width:100%"></div>'
      + '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '      <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Бюджет/день, TRDX</label>'
      + '        <input class="cab-input" name="daily_budget_trdx" type="number" min="5" max="50000" value="50" required style="width:100%"></div>'
      + '      <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Общий бюджет (опционально)</label>'
      + '        <input class="cab-input" name="total_budget_trdx" type="number" min="0" placeholder="без ограничения" style="width:100%"></div>'
      + '    </div>'
      + '    <div style="background:#0b1120;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:12px;color:#94a3b8">'
      + '      💵 Цена: <b style="color:#e0e7ff">0.05 TRDX</b> за 1 засчитанный показ · CTR обычно 0.3-2% · 1000 показов ≈ 50 TRDX'
      + '    </div>'
      + '    <div style="background:#1e1b4b22;border:1px solid #4338ca;border-radius:8px;padding:10px;font-size:12px;color:#cbd5e1">'
      + '      ❌ <b>Запрещено:</b> казино, скам, 18+, политика, медицинские утверждения, поддельные документы. На жалобу удаляем без возврата TRDX.'
      + '    </div>'
      + '    <button type="submit" class="cab-btn cab-btn-primary" style="font-size:14px;padding:11px">📤 Загрузить и отправить</button>'
      + '  </form>'
      + '  <div id="ads-create-status" style="margin-top:10px;font-size:12px"></div>'
      + '</div>';
  }

  async function showStatsModal(bannerId) {
    const j = await fetchJson(API('/banner/' + bannerId + '/stats'));
    if (!j || !j.ok) { alert('Не удалось загрузить статистику'); return; }
    const days = j.daily || [];
    const max = Math.max(1, ...days.map(d => d.impressions || 0));
    const rows = days.map(d => ''
      + '<div style="display:grid;grid-template-columns:90px 1fr 60px 60px 80px;gap:8px;padding:6px 0;border-bottom:1px solid #1e293b;font-size:12px">'
      + '  <div style="color:#94a3b8">' + d.day + '</div>'
      + '  <div><div style="background:#7c3aed;height:8px;border-radius:4px;width:' + Math.max(2, (d.impressions / max) * 100) + '%"></div></div>'
      + '  <div style="text-align:right">' + fmt(d.impressions) + '</div>'
      + '  <div style="text-align:right">' + fmt(d.clicks) + '</div>'
      + '  <div style="text-align:right;color:#a78bfa">' + fmtTrx(d.trdx_spent) + '</div>'
      + '</div>').join('');
    const html = ''
      + '<div style="position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:20px" id="ads-stats-modal">'
      + '  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:20px;max-width:680px;width:100%;max-height:80vh;overflow:auto">'
      + '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      + '      <h3 style="margin:0;color:#e0e7ff">📊 Статистика — ' + escapeHtml(j.banner.name) + '</h3>'
      + '      <button onclick="document.getElementById(\'ads-stats-modal\').remove()" style="background:none;border:none;color:#94a3b8;font-size:22px;cursor:pointer">×</button>'
      + '    </div>'
      + '    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">'
      + '      <div style="background:#1e293b;padding:10px;border-radius:8px"><div style="font-size:11px;color:#94a3b8">Показы (всего)</div><div style="font-weight:700;color:#e0e7ff;font-size:16px">' + fmt(j.banner.impressions_total) + '</div></div>'
      + '      <div style="background:#1e293b;padding:10px;border-radius:8px"><div style="font-size:11px;color:#94a3b8">Клики</div><div style="font-weight:700;color:#e0e7ff;font-size:16px">' + fmt(j.banner.clicks_total) + '</div></div>'
      + '      <div style="background:#1e293b;padding:10px;border-radius:8px"><div style="font-size:11px;color:#94a3b8">CTR</div><div style="font-weight:700;color:#e0e7ff;font-size:16px">' + j.banner.ctr + '%</div></div>'
      + '      <div style="background:#1e293b;padding:10px;border-radius:8px"><div style="font-size:11px;color:#94a3b8">Сегодня</div><div style="font-weight:700;color:#a78bfa;font-size:16px">' + fmtTrx(j.today_spent) + ' TRDX</div></div>'
      + '    </div>'
      + '    <div style="display:grid;grid-template-columns:90px 1fr 60px 60px 80px;gap:8px;padding:6px 0;border-bottom:2px solid #334155;font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase">'
      + '      <div>День</div><div>График</div><div style="text-align:right">Показы</div><div style="text-align:right">Клики</div><div style="text-align:right">TRDX</div>'
      + '    </div>'
      +      (rows || '<div style="padding:20px;text-align:center;color:#94a3b8">Пока нет показов</div>')
      + '  </div>'
      + '</div>';
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    document.body.appendChild(wrap.firstElementChild);
  }

  function bindActions(container) {
    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const id = Number(btn.dataset.id);
      if (act === 'stats') return showStatsModal(id);
      if (act === 'pause')  { await fetchJson(API('/banner/' + id + '/pause'), { method: 'POST' }); return window.loadAdsSitePage(); }
      if (act === 'resume') { await fetchJson(API('/banner/' + id + '/resume'), { method: 'POST' }); return window.loadAdsSitePage(); }
      if (act === 'delete') {
        if (!confirm('Удалить баннер? Файл будет стёрт с сервера, потраченное TRDX не возвращается.')) return;
        await fetchJson(API('/banner/' + id), { method: 'DELETE' });
        return window.loadAdsSitePage();
      }
    });

    const form = container.querySelector('#ads-create-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const status = container.querySelector('#ads-create-status');
        status.style.color = '#94a3b8';
        status.textContent = 'Загружаю...';
        try {
          const r = await fetch(API('/banner/create'), { method: 'POST', body: fd, credentials: 'include' });
          const j = await r.json();
          if (j && j.ok) {
            const trustNote = j.trust && j.trust.decision === 'trusted'
              ? '✅ Авто-аппрув — баннер активен. Ротация начнётся в течение пары минут.'
              : '⏳ Отправлено на модерацию. Уведомим когда одобрят.';
            status.style.color = '#22c55e';
            status.textContent = trustNote;
            form.reset();
            setTimeout(() => window.loadAdsSitePage(), 1200);
          } else {
            status.style.color = '#ef4444';
            const reason = j && j.detail ? j.detail : (j && j.reason) || 'unknown';
            status.textContent = '⚠️ Ошибка: ' + reason;
          }
        } catch (e) {
          status.style.color = '#ef4444';
          status.textContent = '⚠️ Сеть упала, попробуй ещё раз';
        }
      });
    }
  }

  window.loadAdsSitePage = async function () {
    const el = document.getElementById('adsSiteContent');
    if (!el) return;
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8">Загрузка...</div>';

    const banners = await loadBanners();

    let html = ''
      + '<div style="margin-bottom:18px">'
      + '  <div style="display:inline-flex;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:4px;gap:4px">'
      + '    <button class="ads-tab ads-tab-active" data-tab="banners" style="background:#7c3aed;color:#fff;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px">📐 Баннеры</button>'
      + '    <button class="ads-tab" data-tab="videos" style="background:transparent;color:#94a3b8;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;font-size:13px">🎬 Видео <span style="font-size:10px;background:#fbbf24;color:#000;padding:1px 5px;border-radius:4px;margin-left:4px">SOON</span></button>'
      + '  </div>'
      + '</div>'
      + '<div id="ads-tab-banners">';

    html += buildCreateForm();
    html += '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">📋 Мои баннеры (' + banners.length + ')</h3>';
    if (!banners.length) {
      html += '<div style="background:#0f172a;border:1px dashed #334155;border-radius:12px;padding:30px;color:#94a3b8;text-align:center">Пока нет баннеров. Создай первый — получишь авто-аппрув если у тебя email + хотя бы 1 платный реферал.</div>';
    } else {
      html += banners.map(renderBannerCard).join('');
    }
    html += '</div>';

    html += '<div id="ads-tab-videos" style="display:none"><div id="ads-videos-host" style="padding:20px;text-align:center;color:#94a3b8">Загрузка видео-раздела...</div></div>';
    /* [video-tab-real] */

    el.innerHTML = html;

    // Tabs
    el.querySelectorAll('.ads-tab').forEach(t => t.addEventListener('click', () => {
      el.querySelectorAll('.ads-tab').forEach(x => {
        x.classList.remove('ads-tab-active');
        x.style.background = 'transparent';
        x.style.color = '#94a3b8';
      });
      t.classList.add('ads-tab-active');
      t.style.background = '#7c3aed';
      t.style.color = '#fff';
      const which = t.dataset.tab;
      el.querySelector('#ads-tab-banners').style.display = (which === 'banners') ? '' : 'none';
      el.querySelector('#ads-tab-videos').style.display  = (which === 'videos')  ? '' : 'none';
    }));

    bindActions(el);
  };

  // ────────────────────── VIDEO TAB ──────────────────────
  async function _loadVideoTab() {
    const host = document.getElementById('ads-videos-host');
    if (!host) return;
    const j = await fetchJson(API('/video/list'));
    if (!j || !j.ok) { host.innerHTML = '<div style="color:#ef4444">Ошибка загрузки</div>'; return; }
    const canUpload = !!j.can_upload;
    const videos = j.videos || [];
    const quota = j.quota || { today: 0, daily_max: 2, active: 0, stored_max: 5 };

    let html = '';
    if (!canUpload) {
      html += '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(251,191,36,0.3);border-radius:14px;padding:30px;text-align:center;margin-bottom:20px">'
        + '  <div style="font-size:50px;margin-bottom:14px">🎬🔒</div>'
        + '  <h3 style="margin:0 0 10px;color:#e0e7ff">Видео-реклама — только для платных тарифов</h3>'
        + '  <p style="color:#94a3b8;margin:0 0 14px;font-size:14px;max-width:520px;margin-left:auto;margin-right:auto">Загружай видео до 5 минут, плати 0.10 TRDX за зачтённый просмотр (≥10 сек). Доступно тарифам LAUNCH ($45), BOOST ($90), ROCKET ($135).</p>'
        + '  <a href="#/marketing" class="cab-btn cab-btn-primary" style="display:inline-block;margin-top:8px">🚀 Купить тариф</a>'
        + '</div>';
    } else {
      html += _buildVideoForm(quota);
    }

    html += '<h3 style="margin:24px 0 12px;color:#e0e7ff;font-size:18px">📋 Мои видео (' + videos.length + ')</h3>';
    if (!videos.length) {
      html += '<div style="background:#0f172a;border:1px dashed #334155;border-radius:12px;padding:24px;color:#94a3b8;text-align:center">Пока нет видео. Загрузи первое — через минуту начнёт показываться зрителям.</div>';
    } else {
      html += videos.map(_renderVideoCard).join('');
    }

    host.innerHTML = html;
    if (canUpload) _bindVideoForm(host);
    host.addEventListener('click', _videoActions);
  }

  function _buildVideoForm(q) {
    const remaining = Math.max(0, q.daily_max - q.today);
    return ''
      + '<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid rgba(167,139,250,0.2);border-radius:14px;padding:20px;margin-bottom:20px">'
      + '  <h3 style="margin:0 0 14px;color:#e0e7ff">🎬 Загрузить видео</h3>'
      + '  <div style="background:#0b1120;border:1px solid #1e293b;border-radius:8px;padding:8px 12px;margin-bottom:12px;font-size:12px;color:#94a3b8">'
      + '    Сегодня загружено: <b>' + q.today + '/' + q.daily_max + '</b> (осталось ' + remaining + ') · Хранится активных: <b>' + q.active + '/' + q.stored_max + '</b>'
      + '  </div>'
      + (remaining === 0 ? '<div style="background:#7f1d1d22;border:1px solid #7f1d1d;color:#fca5a5;padding:10px;border-radius:8px;font-size:13px">Лимит на сегодня исчерпан. Завтра можно загружать снова.</div>' :
      '  <form id="ads-vid-form" style="display:grid;gap:12px">'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Заголовок (видим на этапе модерации, не зрителям)</label>'
      + '      <input class="cab-input" name="title" required maxlength="80" style="width:100%"></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">URL для перехода</label>'
      + '      <input class="cab-input" name="target_url" type="url" required placeholder="https://example.com/page" style="width:100%"></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Описание (видно зрителям, до 500 символов)</label>'
      + '      <textarea class="cab-input" name="description" maxlength="500" rows="2" style="width:100%;resize:vertical"></textarea></div>'
      + '    <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Видео-файл (MP4/WebM, до 5 мин, до 200 МБ)</label>'
      + '      <input class="cab-input" name="video" type="file" accept="video/mp4,video/webm" required style="width:100%"></div>'
      + '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
      + '      <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Бюджет/день, TRDX</label>'
      + '        <input class="cab-input" name="daily_budget_trdx" type="number" min="5" max="50000" value="100" required style="width:100%"></div>'
      + '      <div><label style="font-size:12px;color:#94a3b8;display:block;margin-bottom:4px">Общий бюджет (опционально)</label>'
      + '        <input class="cab-input" name="total_budget_trdx" type="number" min="0" placeholder="без ограничения" style="width:100%"></div>'
      + '    </div>'
      + '    <div style="background:#0b1120;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:12px;color:#94a3b8">'
      + '      💵 Цена: <b style="color:#e0e7ff">0.10 TRDX</b> за зачтённый просмотр (≥10 сек). После загрузки идёт транскодинг 30-60 сек, затем модерация.'
      + '    </div>'
      + '    <div style="background:#1e1b4b22;border:1px solid #4338ca;border-radius:8px;padding:10px;font-size:12px;color:#cbd5e1">'
      + '      ❌ <b>Запрещено:</b> казино, скам, 18+, политика, медицинские утверждения. На жалобу удаляем без возврата TRDX.'
      + '    </div>'
      + '    <button type="submit" class="cab-btn cab-btn-primary" style="font-size:14px;padding:11px">📤 Загрузить</button>'
      + '  </form>'
      + '  <div id="ads-vid-status" style="margin-top:10px;font-size:12px"></div>')
      + '</div>';
  }

  function _renderVideoCard(v) {
    const badge = STATUS_BADGES[v.status] || (v.status === 'uploading' ? { label: '⬆️ Загрузка', color: '#60a5fa' }
      : v.status === 'processing' ? { label: '⚙️ Обработка', color: '#a78bfa' }
      : v.status === 'failed' ? { label: '❌ Ошибка', color: '#ef4444' }
      : { label: v.status, color: '#94a3b8' });
    const errBlock = v.process_error ? '<div style="background:#7f1d1d22;border:1px solid #7f1d1d;color:#fca5a5;padding:8px;border-radius:6px;font-size:12px;margin-bottom:8px">Ошибка обработки: ' + escapeHtml(v.process_error) + '</div>' : '';
    return ''
      + '<div class="ads-card" style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;padding:14px;margin-bottom:12px">'
      + '  <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">'
      + (v.thumb_url ? '    <img src="' + escapeHtml(v.thumb_url) + '" style="max-width:240px;max-height:135px;border-radius:8px;background:#1e293b" alt="">' : '')
      + '    <div style="flex:1;min-width:200px">'
      + '      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px">'
      + '        <h4 style="margin:0;color:#e0e7ff;font-size:15px">' + escapeHtml(v.title) + '</h4>'
      + '        <span style="background:' + badge.color + '22;color:' + badge.color + ';padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">' + badge.label + '</span>'
      + '      </div>'
      + '      <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">⏱ ' + (v.duration_sec ? Math.round(v.duration_sec) + 's' : '?') + ' · → <a href="' + escapeHtml(v.target_url) + '" target="_blank" rel="noopener" style="color:#a78bfa">' + escapeHtml(v.target_url.slice(0, 50)) + '</a></div>'
      +        errBlock
      + '      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:12px;margin:8px 0">'
      + '        <div><div style="color:#64748b">Просмотры (≥10s)</div><div style="color:#e0e7ff;font-weight:700">' + fmt(v.impressions_total) + '</div></div>'
      + '        <div><div style="color:#64748b">Клики</div><div style="color:#e0e7ff;font-weight:700">' + fmt(v.clicks_total) + '</div></div>'
      + '        <div><div style="color:#64748b">CTR</div><div style="color:#e0e7ff;font-weight:700">' + v.ctr + '%</div></div>'
      + '        <div><div style="color:#64748b">Потрачено</div><div style="color:#a78bfa;font-weight:700">' + fmtTrx(v.trdx_spent_total) + ' TRDX</div></div>'
      + '      </div>'
      + '      <div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Бюджет/день: <b>' + fmt(v.daily_budget_trdx) + ' TRDX</b>' + (v.total_budget_trdx ? ' · Общий: ' + fmt(v.total_budget_trdx) : '') + '</div>'
      + (v.reject_reason ? '      <div style="background:#7f1d1d22;border:1px solid #7f1d1d;color:#fca5a5;padding:8px;border-radius:6px;font-size:12px;margin-bottom:8px">Отклонено: ' + escapeHtml(v.reject_reason) + '</div>' : '')
      + '      <div style="display:flex;gap:8px;flex-wrap:wrap">'
      + (v.status === 'active'    ? '<button class="cab-btn" data-vact="pause"  data-vid="' + v.id + '">⏸ Пауза</button>' : '')
      + (v.status === 'paused'    ? '<button class="cab-btn cab-btn-primary" data-vact="resume" data-vid="' + v.id + '">▶️ Возобновить</button>' : '')
      + (v.video_url ? '        <a class="cab-btn" href="' + escapeHtml(v.video_url) + '" target="_blank">▶️ Превью</a>' : '')
      + '        <button class="cab-btn" data-vact="delete" data-vid="' + v.id + '" style="color:#ef4444">🗑 Удалить (с диска)</button>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  function _bindVideoForm(container) {
    const form = container.querySelector('#ads-vid-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const status = container.querySelector('#ads-vid-status');
      status.style.color = '#94a3b8';
      status.textContent = '⬆️ Загружаю и запускаю транскодинг (30-60 сек)...';
      try {
        const r = await fetch(API('/video/upload'), { method: 'POST', body: fd, credentials: 'include' });
        const j = await r.json();
        if (j && j.ok) {
          status.style.color = '#22c55e';
          status.textContent = j.note || '✅ Загружено';
          form.reset();
          setTimeout(_loadVideoTab, 4000);
          // poll status every 5s for 60s
          let tries = 0;
          const poll = setInterval(() => { tries++; if (tries > 12) clearInterval(poll); else _loadVideoTab(); }, 5000);
        } else {
          status.style.color = '#ef4444';
          status.textContent = '⚠️ ' + (j && (j.detail || j.reason) || 'unknown');
        }
      } catch (e2) {
        status.style.color = '#ef4444';
        status.textContent = '⚠️ Сеть упала, попробуй ещё раз';
      }
    });
  }

  async function _videoActions(e) {
    const btn = e.target.closest('button[data-vact]');
    if (!btn) return;
    const act = btn.dataset.vact;
    const id = Number(btn.dataset.vid);
    if (act === 'pause')  { await fetchJson(API('/video/' + id + '/pause'),  { method: 'POST' }); return _loadVideoTab(); }
    if (act === 'resume') { await fetchJson(API('/video/' + id + '/resume'), { method: 'POST' }); return _loadVideoTab(); }
    if (act === 'delete') {
      if (!confirm('Удалить видео? Файл будет стёрт с сервера, потраченное TRDX не возвращается.')) return;
      await fetchJson(API('/video/' + id), { method: 'DELETE' });
      return _loadVideoTab();
    }
  }

  // Hook into tab switching: when user clicks "Видео" tab, lazy-load.
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest && e.target.closest('.ads-tab');
    if (!t) return;
    if (t.dataset.tab === 'videos') setTimeout(_loadVideoTab, 30);
  });

})();
