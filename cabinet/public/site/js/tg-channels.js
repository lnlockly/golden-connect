/* Trendex Cabinet — Мои TG-каналы (unified registry) */
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
    if (r.status === 429 && d.code === 'LIMIT_REACHED') {
      throw new Error('🚫 Лимит каналов: ' + d.used + '/' + d.limit + ' (план ' + (d.plan || 'free') + ')');
    }
    if (!r.ok || d.ok === false) throw new Error(d.reason || d.error || 'http_' + r.status);
    return d;
  }

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#10b981,#00D4FF)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  async function render() {
    const host = $('tgChannelsContent'); if (!host) return;
    host.innerHTML = '<div style="text-align:center;padding:30px;color:#9ca3af">Загрузка…</div>';
    let channels = [];
    try {
      const r = await api('GET', '/tg-channels');
      channels = r.channels || [];
    } catch (e) {
      host.innerHTML = '<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);padding:20px;border-radius:12px;color:#fca5a5">Не удалось загрузить: ' + esc(e.message) + '</div>';
      return;
    }

    let html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:20px">' +
      '<div style="flex:1;min-width:280px">' +
        '<h2 style="margin:0 0 6px;color:#fff;font-size:22px">📺 Мои Telegram-каналы</h2>' +
        '<p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.6;max-width:680px">Единый список твоих каналов и групп. Эти каналы доступны во всех инструментах: <strong>📡 TG-автопостинг</strong>, <strong>🛒 ADX Биржа</strong>, и в новых сервисах, которые появятся позже.</p>' +
      '</div>' +
      '<button class="cab-btn cab-btn-primary" onclick="window.TgCh.openAdd()" style="padding:10px 18px;white-space:nowrap">+ Добавить канал</button>' +
    '</div>';

    if (!channels.length) {
      html += '<div style="background:rgba(13,17,36,.6);border:1px dashed rgba(255,255,255,.15);border-radius:14px;padding:50px 24px;text-align:center;color:#9ca3af">' +
        '<div style="font-size:56px;margin-bottom:14px">📡</div>' +
        '<h3 style="color:#e8edf5;margin:0 0 10px">Каналов пока нет</h3>' +
        '<p style="max-width:480px;margin:0 auto 20px;line-height:1.6;font-size:14px">Подключи свой Telegram-канал — он сразу станет доступен во всех инструментах. Добавь нашего бота <a href="https://t.me/Trendex_bizbot" target="_blank" style="color:#00D4FF">@Trendex_bizbot</a> в админы канала, потом нажми кнопку ниже.</p>' +
        '<button class="cab-btn cab-btn-primary" onclick="window.TgCh.openAdd()">+ Подключить канал</button>' +
      '</div>';
      host.innerHTML = html;
      return;
    }

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">';
    channels.forEach(function (c) {
      const platform = c.type === 'tg_group' ? 'Группа' : 'Канал';
      const adminBadge = c.bot_is_admin
        ? '<span style="font-size:10px;color:#10b981">● бот админ</span>'
        : '<span style="font-size:10px;color:#fbbf24">⚠ не админ</span>';
      html += '<div class="cab-card" style="padding:14px" id="ch-' + c.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">' +
          '<div style="flex:1;min-width:0">' +
            '<strong style="color:#fff;font-size:14px;display:block">' + esc(c.title || ('Канал #' + c.id)) + '</strong>' +
            (c.username ? '<small style="color:#9ca3af">@' + esc(c.username) + '</small>' : '') +
          '</div>' +
          '<div style="text-align:right">' +
            '<div style="font-size:11px;color:#00D4FF">' + (c.member_count || 0) + ' 👤</div>' +
            '<div>' + adminBadge + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">' + platform + ' · ID ' + esc(c.tg_chat_id) + '</div>' +
        '<div id="usage-' + c.id + '" style="background:rgba(0,0,0,.25);border-radius:8px;padding:8px 10px;font-size:11px;color:#9ca3af;margin-bottom:10px">⏳ Загрузка статистики…</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="cab-btn cab-btn-sm cab-btn-primary" style="flex:1;font-size:12px" onclick="window.TgCh.useInAdc(' + c.id + ')">📡 В рассылку</button>' +
          '<button class="cab-btn cab-btn-sm" style="font-size:12px" onclick="window.TgCh.remove(' + c.id + ')" title="Удалить из общего списка">🗑</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    host.innerHTML = html;

    // Lazy-load usage stats per channel
    channels.forEach(function (c) {
      api('GET', '/tg-channels/' + c.id + '/usage').then(function (r) {
        const el = document.getElementById('usage-' + c.id); if (!el) return;
        const u = r.usage || {};
        const adc = u.adcenter || {};
        const parts = [];
        if (adc.posts_sent) parts.push('📤 ' + adc.posts_sent + ' рассылок');
        if (adc.in_campaigns) parts.push('🎯 в ' + adc.in_campaigns + ' кампан.');
        if (adc.in_monitors) parts.push('🤖 в ' + adc.in_monitors + ' монитор.');
        if (u.adx && u.adx.listed) parts.push('🛒 ADX-биржа');
        el.innerHTML = parts.length ? parts.join(' · ') : '<span style="color:#6b7280">Пока не используется в сервисах</span>';
      }).catch(function () {
        const el = document.getElementById('usage-' + c.id); if (el) el.style.display = 'none';
      });
    });
  }

  window.TgCh = {};

  window.TgCh.openAdd = function () {
    const m = document.createElement('div');
    m.id = 'tgChAddModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto';
    m.innerHTML = '<div class="cab-card" style="max-width:520px;width:100%">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0">+ Подключить TG-канал</h3>' +
      '<button onclick="document.getElementById(\'tgChAddModal\').remove()" style="background:none;border:none;color:#9ca3af;font-size:22px;cursor:pointer">✕</button></div>' +
      '<ol style="font-size:13px;color:var(--text-secondary,#9ca3af);line-height:1.8;padding-left:18px;margin:0 0 14px">' +
        '<li>Открой свой канал в Telegram</li>' +
        '<li>Зайди в настройки → Администраторы → Добавить администратора</li>' +
        '<li>Найди бота <a href="https://t.me/Trendex_bizbot" target="_blank" style="color:#00D4FF">@Trendex_bizbot</a> и сделай его админом (право «Публиковать сообщения»)</li>' +
        '<li>Скопируй сюда @username канала или ID (вид <code style="color:#00D4FF">-100xxxxxx</code>)</li>' +
      '</ol>' +
      '<div class="form-row"><label class="cab-label">@username канала или ID</label><input class="cab-input" id="tgch-input" placeholder="@my_channel  или  -1001234567890"></div>' +
      '<button class="cab-btn cab-btn-primary" id="tgch-submit" style="width:100%" onclick="window.TgCh.submit()">🔌 Подключить</button>' +
    '</div>';
    document.body.appendChild(m);
  };

  window.TgCh.submit = async function () {
    const v = ($('tgch-input') && $('tgch-input').value || '').trim();
    if (!v) return toast('Введите @username или ID', true);
    const btn = $('tgch-submit'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Проверяем доступ…'; }
    try {
      const r = await api('POST', '/tg-channels', { chat_id: v });
      const m = $('tgChAddModal'); if (m) m.remove();
      toast('✅ Канал «' + (r.channel.title || v) + '» подключён');
      render();
    } catch (e) {
      const reason = e.message || '';
      const human = ({
        'already_added': 'Этот канал уже подключён',
        'chat_id_required': 'Пустой chat_id',
        'no_planner_user': 'Профиль не найден — обратись в поддержку',
      })[reason] || reason;
      toast('❌ ' + human, true);
      if (btn) { btn.disabled = false; btn.textContent = '🔌 Подключить'; }
    }
  };

  window.TgCh.remove = async function (id) {
    if (!confirm('Удалить канал из общего списка? Активные расписания и мониторы перестанут работать с этим каналом.')) return;
    try {
      await api('DELETE', '/tg-channels/' + id);
      const card = $('ch-' + id); if (card) { card.style.opacity = '0'; card.style.transition = 'opacity .3s'; setTimeout(() => card.remove(), 300); }
      toast('Удалено');
    } catch (e) { toast('Ошибка: ' + e.message, true); }
  };

  window.TgCh.useInAdc = function (_id) {
    if (window.goPage) window.goPage('adcenter');
    setTimeout(function () {
      // Switch to instant tab if AdCenter is mounted
      try {
        if (window.AdC && window.AdC.mount) {
          // already mounted; fine
        }
      } catch (_) {}
    }, 200);
  };

  window.loadTgChannelsPage = render;
})();
