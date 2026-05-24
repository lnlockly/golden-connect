// Cabinet page /cabinet#/ads-moderation — admin-only banner + video review queue.
// Hidden in sidebar for non-admin users.
(function () {
  'use strict';

  const API = (p) => '/cabinet/api/ads-site' + p;

  function fmt(n) { return Number(n || 0).toLocaleString('ru-RU'); }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  async function fetchJson(url, opts) {
    try {
      const r = await fetch(url, Object.assign({ credentials: 'include' }, opts || {}));
      return await r.json();
    } catch (_) { return null; }
  }

  function renderBannerCard(b) {
    return ''
      + '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px;margin-bottom:10px">'
      + '<div style="display:flex;gap:14px;flex-wrap:wrap">'
      + (b.image_url ? '<img src="' + escapeHtml(b.image_url) + '" style="max-width:240px;max-height:140px;border-radius:8px;background:#1e293b">' : '')
      + '<div style="flex:1;min-width:200px">'
      + '<h4 style="margin:0 0 4px;color:#e0e7ff">' + escapeHtml(b.name) + '</h4>'
      + '<div style="font-size:12px;color:#94a3b8">User: <b>' + escapeHtml(b.email || '?') + '</b> · Format: ' + escapeHtml(b.format) + '</div>'
      + '<div style="font-size:12px;color:#94a3b8;margin:4px 0">→ <a href="' + escapeHtml(b.target_url) + '" target="_blank" rel="noopener" style="color:#a78bfa">' + escapeHtml(b.target_url) + '</a></div>'
      + '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Бюджет: ' + fmt(b.daily_budget_trdx) + ' TRDX/день · Создан: ' + (b.created_at || '').slice(0, 16) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<button class="cab-btn cab-btn-primary" data-mod="approve-banner" data-id="' + b.id + '">✅ Одобрить</button>'
      + '<button class="cab-btn" data-mod="reject-banner" data-id="' + b.id + '" style="color:#ef4444">❌ Отклонить</button>'
      + '</div></div></div></div>';
  }

  function renderVideoCard(v) {
    return ''
      + '<div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:14px;margin-bottom:10px">'
      + '<div style="display:flex;gap:14px;flex-wrap:wrap">'
      + (v.thumb_url ? '<img src="' + escapeHtml(v.thumb_url) + '" style="max-width:240px;max-height:140px;border-radius:8px;background:#1e293b">' : '')
      + '<div style="flex:1;min-width:200px">'
      + '<h4 style="margin:0 0 4px;color:#e0e7ff">' + escapeHtml(v.title) + '</h4>'
      + '<div style="font-size:12px;color:#94a3b8">User: <b>' + escapeHtml(v.email || '?') + '</b> · Длительность: ' + (v.duration_sec ? Math.round(v.duration_sec) + 's' : '?') + '</div>'
      + '<div style="font-size:12px;color:#94a3b8;margin:4px 0">→ <a href="' + escapeHtml(v.target_url) + '" target="_blank" rel="noopener" style="color:#a78bfa">' + escapeHtml(v.target_url) + '</a></div>'
      + (v.description ? '<div style="font-size:12px;color:#cbd5e1;background:#0b1120;padding:8px;border-radius:6px;margin:6px 0">' + escapeHtml(v.description) + '</div>' : '')
      + '<div style="font-size:12px;color:#94a3b8;margin-bottom:10px">Бюджет: ' + fmt(v.daily_budget_trdx) + ' TRDX/день · Создан: ' + (v.created_at || '').slice(0, 16) + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + (v.video_url ? '<a class="cab-btn" href="' + escapeHtml(v.video_url) + '" target="_blank">▶️ Просмотреть</a>' : '')
      + '<button class="cab-btn cab-btn-primary" data-mod="approve-video" data-id="' + v.id + '">✅ Одобрить</button>'
      + '<button class="cab-btn" data-mod="reject-video" data-id="' + v.id + '" style="color:#ef4444">❌ Отклонить</button>'
      + '</div></div></div></div>';
  }

  async function _bind(host) {
    host.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-mod]');
      if (!btn) return;
      const act = btn.dataset.mod;
      const id = Number(btn.dataset.id);
      if (act.startsWith('approve-')) {
        const kind = act.replace('approve-', '');
        const r = await fetchJson(API('/admin/' + kind + '/' + id + '/approve'), { method: 'POST' });
        if (r && r.ok) window.loadAdsModerationPage();
        else alert('Не удалось одобрить');
      } else if (act.startsWith('reject-')) {
        const kind = act.replace('reject-', '');
        const reason = prompt('Причина отклонения:');
        if (reason == null) return;
        const r = await fetchJson(API('/admin/' + kind + '/' + id + '/reject'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ reason }),
        });
        if (r && r.ok) window.loadAdsModerationPage();
        else alert('Не удалось отклонить');
      }
    });
  }

  window.loadAdsModerationPage = async function () {
    const el = document.getElementById('adsModerationContent');
    if (!el) return;
    el.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8">Загрузка очереди...</div>';

    const [bq, vq] = await Promise.all([
      fetchJson(API('/admin/queue')),
      fetchJson(API('/admin/video/queue')),
    ]);

    if ((!bq || !bq.ok) && (!vq || !vq.ok)) {
      el.innerHTML = '<div style="background:#7f1d1d22;border:1px solid #7f1d1d;color:#fca5a5;padding:14px;border-radius:8px">Доступ запрещён или ошибка. Открой эту страницу под учёткой контент-администратора.</div>';
      return;
    }

    const banners = (bq && bq.banners) || [];
    const videos = (vq && vq.videos) || [];

    let html = ''
      + '<h2 style="margin:0 0 14px;color:#e0e7ff">🛡 Модерация рекламы</h2>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:20px">'
      + '  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px"><div style="font-size:11px;color:#94a3b8">Баннеры в очереди</div><div style="font-size:24px;font-weight:800;color:#fbbf24">' + banners.length + '</div></div>'
      + '  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px"><div style="font-size:11px;color:#94a3b8">Видео в очереди</div><div style="font-size:24px;font-weight:800;color:#a78bfa">' + videos.length + '</div></div>'
      + '</div>'
      + '<h3 style="margin:18px 0 10px;color:#e0e7ff">📐 Баннеры</h3>';
    html += banners.length ? banners.map(renderBannerCard).join('') :
      '<div style="background:#0f172a;border:1px dashed #334155;border-radius:8px;padding:14px;color:#94a3b8;text-align:center">Очередь пуста ✓</div>';

    html += '<h3 style="margin:24px 0 10px;color:#e0e7ff">🎬 Видео</h3>';
    html += videos.length ? videos.map(renderVideoCard).join('') :
      '<div style="background:#0f172a;border:1px dashed #334155;border-radius:8px;padding:14px;color:#94a3b8;text-align:center">Очередь пуста ✓</div>';

    el.innerHTML = html;
    _bind(el);
  };
})();
