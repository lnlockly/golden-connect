/* Trendex Cabinet — Ad Center (TG Autoposting) Phase A+B UI */
(function () {
  'use strict';
  const ROOT = '/cabinet/api/ad-center';
  const STATE = { tab: 'instant', sources: [], posts: [], schedules: [], templates: [] };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate = (s) => { try { return new Date(s).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return s; } };

  async function api(method, path, body) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(ROOT + path, opts);
    let d = {}; try { d = await r.json(); } catch (_) {}
    if (r.status === 401) { window.location.href = '/cabinet/login'; throw new Error('auth'); }
    if (r.status === 429 && d.code === 'LIMIT_REACHED') {
      const labels = { 'ai.text': 'AI-копирайтер', 'ai.rewrite': 'AI-рерайт', 'video.transcribe': 'Транскрибация видео', 'adcenter.send': 'Рассылка постов', 'adcenter.sources': 'Каналов (всего)', 'adcenter.monitors': 'Мониторов (всего)' };
      const lbl = labels[d.service] || d.service;
      const isLifetime = (d.service === 'adcenter.sources' || d.service === 'adcenter.monitors');
      const msg = isLifetime
        ? '🚫 Достигнут лимит: ' + lbl + ' — ' + d.used + '/' + d.limit + ' (план ' + (d.plan || 'free') + ')'
        : '🚫 Дневной лимит: ' + lbl + ' — ' + d.used + '/' + d.limit + ' (обновится в 00:00 UTC)';
      const e = new Error(msg);
      e.limitInfo = d;
      throw e;
    }
    if (!r.ok) throw new Error(d.error || d.reason || ('http_' + r.status));
    return d;
  }
  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' + (isErr ? '#ef4444' : 'linear-gradient(135deg,#00D4FF,#B14AED)') + ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
  }

  function renderHeader(host) {
    host.innerHTML =
      '<div class="adc-hero">' +
        '<div class="adc-hero-text">' +
          '<h2>📡 TG-автопостинг</h2>' +
          '<p>Подключи свои Telegram-каналы — отправляй посты в один или несколько каналов одной кнопкой. Расписание, AI-рерайт, шаблоны, аналитика. Все возможности Arsenal Profi внутри Trendex.</p>' +
        '</div>' +
        '<div class="adc-hero-actions">' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openAddSource()">+ Добавить канал</button>' +
        '</div>' +
      '</div>' +
      '<div class="adc-tabs">' +
        '<button class="adc-tab' + (STATE.tab === 'instant' ? ' adc-tab--active' : '') + '" data-tab="instant">⚡ Мгновенная рассылка</button>' +
        '<button class="adc-tab' + (STATE.tab === 'sources' ? ' adc-tab--active' : '') + '" data-tab="sources">📺 Каналы</button>' +
        '<button class="adc-tab' + (STATE.tab === 'history' ? ' adc-tab--active' : '') + '" data-tab="history">📜 История постов</button>' +
        '<button class="adc-tab' + (STATE.tab === 'schedules' ? ' adc-tab--active' : '') + '" data-tab="schedules">🔄 Авторассылки</button>' +
        '<button class="adc-tab' + (STATE.tab === 'templates' ? ' adc-tab--active' : '') + '" data-tab="templates">📝 Шаблоны</button>' +
        '<button class="adc-tab' + (STATE.tab === 'queue' ? ' adc-tab--active' : '') + '" data-tab="queue">🧠 Smart-очередь</button>' +
        '<button class="adc-tab' + (STATE.tab === 'calendar' ? ' adc-tab--active' : '') + '" data-tab="calendar">📅 Календарь</button>' +
        '<button class="adc-tab' + (STATE.tab === 'monitors' ? ' adc-tab--active' : '') + '" data-tab="monitors">🤖 Мониторы YT/TT</button>' +
        '<button class="adc-tab' + (STATE.tab === 'analytics' ? ' adc-tab--active' : '') + '" data-tab="analytics">📊 Аналитика</button>' +
      '</div>' +
      '<div id="adcBody"></div>';
    host.querySelectorAll('.adc-tab').forEach((b) => b.addEventListener('click', () => {
      STATE.tab = b.dataset.tab; renderHeader(host); loadTab();
    }));
  }

  async function loadTab() {
    const body = $('adcBody'); if (!body) return;
    body.innerHTML = '<div class="adc-loading">Загрузка…</div>';
    try {
      if (STATE.tab === 'instant') return renderInstant(body);
      if (STATE.tab === 'sources') return renderSources(body);
      if (STATE.tab === 'history') return renderHistory(body);
      if (STATE.tab === 'schedules') return renderSchedules(body);
      if (STATE.tab === 'templates') return renderTemplates(body);
      if (STATE.tab === 'monitors') return renderMonitors(body);
      if (STATE.tab === 'queue') return renderQueue(body);
      if (STATE.tab === 'calendar') return renderCalendar(body);
      if (STATE.tab === 'analytics') return renderAnalytics(body);
    } catch (e) { body.innerHTML = '<div class="adc-empty"><h3>Ошибка</h3><p>' + esc(e.message) + '</p></div>'; }
  }

  // === INSTANT BROADCAST ===
  async function renderInstant(body) {
    const d = await api('GET', '/sources').catch(() => ({ items: [] }));
    STATE.sources = d.items || d.sources || [];
    if (!STATE.sources.length) {
      body.innerHTML = '<div class="adc-empty">' +
        '<div style="font-size:48px">📺</div>' +
        '<h3>Нет подключённых каналов</h3>' +
        '<p>Сначала подключи хотя бы один Telegram-канал — добавь @Trendex_bizbot админом и нажми «+ Добавить канал».</p>' +
        '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openAddSource()">+ Добавить канал</button>' +
      '</div>';
      return;
    }
    body.innerHTML =
      '<div class="adc-card">' +
        '<h3 style="margin-top:0">⚡ Мгновенная рассылка</h3>' +
        '<div class="adc-field">' +
          '<label>Текст поста</label>' +
          '<textarea id="adcInstantText" rows="6" placeholder="Привет всем! Сегодня запускаем..."></textarea>' +
          '<div class="adc-hint">Поддержка HTML: <code>&lt;b&gt;</code>, <code>&lt;i&gt;</code>, <code>&lt;a href=&quot;&quot;&gt;</code>. До 4096 символов.</div>' +
        '</div>' +
        '<div class="adc-field">' +
          '<label>Медиа (опционально)</label>' +
          '<input id="adcInstantMedia" type="url" placeholder="https://...jpg / https://...mp4 / https://youtube.com/...">' +
        '</div>' +
        '<div class="adc-field">' +
          '<label>Кнопки (опционально, по 1 на строку, формат: <code>Текст | https://url</code>)</label>' +
          '<textarea id="adcInstantButtons" rows="2" placeholder="Купить | https://trendex.biz/?ref=ABC&#10;Подробнее | https://t.me/example"></textarea>' +
        '</div>' +
        '<div class="adc-field">' +
          '<label>Каналы получатели</label>' +
          '<div class="adc-channels">' +
            STATE.sources.map((src) =>
              '<label class="adc-channel-item">' +
                '<input type="checkbox" data-src="' + src.id + '" checked>' +
                '<div><b>' + esc(src.title || src.username || ('Канал #' + src.id)) + '</b>' +
                (src.username ? '<br><small>@' + esc(src.username) + '</small>' : '') +
                (src.member_count ? '<br><small>👥 ' + src.member_count + '</small>' : '') +
                '</div>' +
              '</label>'
            ).join('') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.sendInstant()">📡 Отправить во все выбранные</button>' +
          '<button class="adc-btn adc-btn-ghost" onclick="window.AdC.aiRewrite()">✨ AI-рерайт (3 варианта)</button>' +
        '</div>' +
        '<div id="adcInstantStatus" style="margin-top:14px"></div>' +
      '</div>';
  }

  window.AdC = window.AdC || {};
/* [adc-limit-modal-v1] */
window.AdC = window.AdC || {};
window.AdC.showLimitUpgrade = function (opts) {
  opts = opts || {};
  var plan = opts.plan || 'free';
  var limit = opts.limit || 0;
  var used = opts.used || 0;
  var service = opts.service || 'AI';
  var serviceLabels = {
    'ai.text': 'AI-копирайтер',
    'ai.rewrite': 'AI-рерайт',
    'ai.captions': 'AI-подписи',
    'ai.hashtags': 'AI-хэштеги',
    'ai.bio-gen': 'AI-генератор bio',
    'video.transcribe': 'Транскрибация',
    'adcenter.send': 'Рассылка постов',
  };
  var planLimits = {
    'ai.text':         { free: 30,  launch: 200,  boost: 1000, rocket: 9999 },
    'ai.rewrite':      { free: 30,  launch: 200,  boost: 1000, rocket: 9999 },
    'ai.captions':     { free: 30,  launch: 200,  boost: 1000, rocket: 9999 },
    'ai.hashtags':     { free: 50,  launch: 500,  boost: 5000, rocket: 99999 },
    'ai.bio-gen':      { free: 5,   launch: 30,   boost: 100,  rocket: 9999 },
    'video.transcribe':{ free: 5,   launch: 30,   boost: 100,  rocket: 9999 },
    'adcenter.send':   { free: 100, launch: 1000, boost: 10000, rocket: 999999 },
  };
  var pl = planLimits[service] || { free: limit, launch: limit*7, boost: limit*30, rocket: '∞' };
  var label = serviceLabels[service] || service;
  var existing = document.getElementById('adcLimitModal'); if (existing) existing.remove();
  var m = document.createElement('div');
  m.id = 'adcLimitModal';
  m.className = 'adc-modal';
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px';
  var planBadge = plan === 'free' ? '🟢 FREE' : (plan === 'launch' ? '🚀 LAUNCH' : (plan === 'boost' ? '⚡ BOOST' : '💎 ROCKET'));
  var html = '<div style="background:#11151f;border:1px solid #00D4FF44;border-radius:18px;padding:28px;max-width:520px;width:100%;color:#e8edf5">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;font-size:1.2rem">⚡ Лимит ' + label + '</h3><button onclick="document.getElementById(&quot;adcLimitModal&quot;).remove()" style="background:none;border:none;color:#94a3b8;font-size:24px;cursor:pointer">×</button></div>';
  html += '<p style="color:#94a3b8;margin-bottom:16px;line-height:1.5">Ты исчерпал свой дневной лимит на тарифе <b>' + planBadge + '</b>: <b>' + used + '/' + limit + '</b> запросов.</p>';
  html += '<div style="background:rgba(0,212,255,.06);border:1px solid rgba(0,212,255,.2);border-radius:12px;padding:14px;margin-bottom:16px">';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#00D4FF;margin-bottom:10px;font-weight:700">📊 Лимиты по тарифам</div>';
  html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;font-size:13px">';
  ['free','launch','boost','rocket'].forEach(function(pp){
    var bg = pp === plan ? 'rgba(0,212,255,.18)' : 'rgba(255,255,255,.04)';
    var border = pp === plan ? '1px solid #00D4FF' : '1px solid transparent';
    var label2 = { free:'FREE', launch:'LAUNCH', boost:'BOOST', rocket:'ROCKET' }[pp];
    var price = { free:'$0', launch:'$45', boost:'$90', rocket:'$135' }[pp];
    html += '<div style="text-align:center;padding:10px 6px;border-radius:8px;background:' + bg + ';border:' + border + '"><div style="font-weight:700;font-size:11px;color:#fff">' + label2 + '</div><div style="color:#94a3b8;font-size:10px;margin:2px 0">' + price + '</div><div style="color:#fff;font-weight:700">' + pl[pp] + '/день</div></div>';
  });
  html += '</div></div>';
  if (plan === 'free' || plan === 'launch') {
    html += '<a href="#/marketing" onclick="document.getElementById(&quot;adcLimitModal&quot;).remove();if(window.goPage)goPage(&quot;marketing&quot;);" style="display:block;text-align:center;background:linear-gradient(135deg,#00D4FF,#B14AED);color:#0a0c12;font-weight:700;padding:14px;border-radius:12px;text-decoration:none">🚀 Поднять тариф — больше AI</a>';
  } else {
    html += '<div style="text-align:center;color:#94a3b8;font-size:13px">Лимит обновится в 00:00 UTC.</div>';
  }
  html += '</div>';
  m.innerHTML = html;
  document.body.appendChild(m);
  m.addEventListener('click', function(e){ if(e.target===m) m.remove(); });
};


  window.AdC.aiRewrite = async function () {
    var ta = document.getElementById('adcInstantText');
    var src = ta && ta.value.trim();
    if (!src) return toast('Сначала введи текст', 'error');
    var btn = document.querySelector('[onclick*="aiRewrite"]');
    if (btn) { btn.disabled = true; btn.textContent = '✨ Генерирую 3 варианта…'; }
    try {
      var variants = [];
      // Run 3 parallel rewrites with different "tone" hints
      var tones = ['energetic', 'professional', 'casual'];
      var labels = { energetic: '🔥 Энергично', professional: '💼 Профи', casual: '😊 Дружелюбно' };
      var results = await Promise.all(tones.map(function (tone) {
        return api('POST', '/ai/generate-text', { prompt: src, tone: tone, length: 'medium' })
          .then(function (r) { return { tone: tone, text: (r && (r.text || r.result)) || '' }; })
          .catch(function (err) { if (err && err.status === 429) window._adcLimitErr = err; return { tone: tone, text: '' }; });
      }));
      variants = results.filter(function (r) { return r.text; });
      if (!variants.length) {
        if (window._adcLimitErr) { var le = window._adcLimitErr; window._adcLimitErr = null; window.AdC.showLimitUpgrade({ plan: le.plan, limit: le.limit, used: le.used, service: le.service || 'ai.text' }); return; }
        throw new Error('AI вернул пусто');
      }
      window._adcAiVariants = variants;
      window._adcAiLabels = labels;
      var m = document.createElement('div');
      m.id = 'adcAiModal';
      m.className = 'adc-modal';
      var html = '<div class="adc-modal-card" style="max-width:720px"><div class="adc-modal-head"><h3>✨ Выбери лучший вариант</h3>' +
        '<button class="adc-close" onclick="document.getElementById(\'adcAiModal\').remove()">✕</button></div>' +
        '<div class="adc-modal-body">';
      variants.forEach(function (v, idx) {
        html += '<div class="adc-card" style="margin-bottom:10px;border:1px solid rgba(0,212,255,.18)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<strong style="color:#00D4FF">' + (labels[v.tone] || v.tone) + '</strong>' +
            '<button class="adc-btn adc-btn-primary" onclick="window.AdC.useAiVariant(' + idx + ')">Выбрать</button>' +
          '</div>' +
          '<div style="white-space:pre-wrap;font-size:13px;line-height:1.5;color:#e8edf5">' + esc(v.text) + '</div>' +
        '</div>';
      });
      html += '</div></div>';
      m.innerHTML = html;
      document.body.appendChild(m);
    } catch (e) {
      toast('Ошибка AI: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✨ AI-рерайт текста (3 варианта)'; }
    }
  };

  window.AdC.useAiVariant = function (idx) {
    var v = (window._adcAiVariants || [])[idx];
    if (!v) return;
    var ta = document.getElementById('adcInstantText');
    if (ta) ta.value = v.text;
    var modal = document.getElementById('adcAiModal');
    if (modal) modal.remove();
    toast('✨ Текст вставлен');
  };
;

  window.AdC.sendInstant = async function () {
    const text = $('adcInstantText').value.trim();
    const media = $('adcInstantMedia').value.trim();
    const btnRaw = $('adcInstantButtons').value.trim();
    const sourceIds = Array.from(document.querySelectorAll('.adc-channel-item input[type=checkbox]:checked'))
      .map((c) => parseInt(c.dataset.src, 10));
    if (!text && !media) { toast('Нужен текст или медиа', true); return; }
    if (!sourceIds.length) { toast('Выбери хотя бы один канал', true); return; }
    const buttons = btnRaw.split('\n').map((line) => {
      const [t, u] = line.split('|').map((s) => (s || '').trim());
      return t && u ? { text: t, url: u } : null;
    }).filter(Boolean);

    const status = $('adcInstantStatus');
    status.innerHTML = '<div class="adc-hint">⏳ Отправляем в ' + sourceIds.length + ' канал(ов)…</div>';
    try {
      const r = await api('POST', '/posts', {
        title: text.slice(0, 60),
        text, media_url: media || null,
        buttons,
        source_ids: sourceIds,
        send_now: true,
      });
      status.innerHTML = '<div style="color:#10b981;font-weight:600">✅ Отправлено! Пост #' + (r.post_id || r.id || '?') + '. Проверь каналы.</div>';
      $('adcInstantText').value = '';
      $('adcInstantMedia').value = '';
      $('adcInstantButtons').value = '';
    } catch (e) {
      status.innerHTML = '<div style="color:#ef4444;font-weight:600">❌ ' + esc(e.message) + '</div>';
    }
  };

  // === SOURCES TAB ===
  async function renderSources(body) {
    const d = await api('GET', '/sources').catch(() => ({ items: [] }));
    const sources = d.items || d.sources || [];
    if (!sources.length) {
      body.innerHTML = '<div class="adc-empty"><div style="font-size:48px">📺</div><h3>Каналов нет</h3><p>Добавь свой первый канал.</p>' +
        '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openAddSource()">+ Добавить канал</button></div>';
      return;
    }
    body.innerHTML = '<div class="adc-cards-grid">' + sources.map((src) =>
      '<div class="adc-card">' +
        '<h4 style="margin:0 0 6px">📺 ' + esc(src.title || src.username || ('Канал #' + src.id)) + '</h4>' +
        (src.username ? '<div style="color:#00D4FF;font-size:13px">@' + esc(src.username) + '</div>' : '') +
        '<div style="color:#9ca3af;font-size:12px;margin-top:6px">' +
          '👥 ' + (src.member_count || '?') + ' подписчиков · 📡 ' + (src.total_sent || 0) + ' отправлено' +
        '</div>' +
        '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="adc-btn adc-btn-ghost" onclick="window.AdC.testChannel(' + src.id + ')">🧪 Тест-пост</button>' +
          '<button class="adc-btn adc-btn-warn" onclick="window.AdC.removeSource(' + src.id + ')">🗑</button>' +
        '</div>' +
      '</div>'
    ).join('') + '</div>';
  }

  window.AdC.testChannel = async function (id) {
    try {
      await api('POST', '/posts', {
        title: 'Тест Trendex',
        text: '🧪 Тестовый пост из Trendex AdCenter — если видишь это, всё работает ✅',
        source_ids: [id], send_now: true,
      });
      toast('✅ Тест отправлен');
    } catch (e) { toast('❌ ' + e.message, true); }
  };

  window.AdC.removeSource = async function (id) {
    if (!confirm('Удалить канал из списка? Авторассылки на него остановятся.')) return;
    try {
      await api('POST', '/bot/remove-channel', { source_id: id });
      toast('🗑 Удалено'); loadTab();
    } catch (e) { toast('❌ ' + e.message, true); }
  };

  window.AdC.openAddSource = function () {
    if ($('adcAddModal')) return;
    const m = document.createElement('div');
    m.id = 'adcAddModal'; m.className = 'adc-modal';
    m.innerHTML =
      '<div class="adc-modal-card">' +
        '<div class="adc-modal-head"><h3>+ Добавить TG-канал</h3>' +
        '<button class="adc-close" onclick="document.getElementById(\'adcAddModal\').remove()">✕</button></div>' +
        '<div class="adc-modal-body">' +
          '<div style="background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);padding:14px;border-radius:10px;margin-bottom:14px;font-size:13px;line-height:1.6">' +
            '<b>3 шага:</b><br>' +
            '1. Открой свой TG-канал → Управление → Администраторы<br>' +
            '2. Добавь <b>@Trendex_bizbot</b> с правами «Публикация сообщений»<br>' +
            '3. Введи @username канала ниже и нажми «Подключить»' +
          '</div>' +
          '<div class="adc-field">' +
            '<label>@username публичного канала или ID канала</label>' +
            '<input id="adcAddInput" type="text" placeholder="@my_channel или -1001234567890">' +
          '</div>' +
          '<div id="adcAddErr" style="color:#ef4444;font-size:13px;display:none"></div>' +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
            '<button class="adc-btn adc-btn-ghost" onclick="document.getElementById(\'adcAddModal\').remove()">Отмена</button>' +
            '<button class="adc-btn adc-btn-primary" id="adcAddBtn" onclick="window.AdC.addSource()">Подключить</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
  };

  window.AdC.addSource = async function () {
    const input = $('adcAddInput').value.trim();
    if (!input) return;
    const err = $('adcAddErr'); err.style.display = 'none';
    const btn = $('adcAddBtn'); btn.disabled = true; btn.textContent = '⏳ Проверяю…';
    try {
      const r = await api('POST', '/bot/sync-channel', { channel: input });
      $('adcAddModal').remove();
      toast('✅ Канал «' + (r.title || input) + '» подключён');
      loadTab();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Подключить';
      err.textContent = '❌ ' + e.message + '. Проверь что бот добавлен админом и права «Публикация».';
      err.style.display = 'block';
    }
  };

  // === HISTORY TAB ===
  async function renderHistory(body) {
    const d = await api('GET', '/posts?limit=50').catch(() => ({ items: [] }));
    const posts = d.items || d.posts || [];
    if (!posts.length) { body.innerHTML = '<div class="adc-empty"><h3>Постов пока нет</h3><p>Отправь первый через «⚡ Мгновенная рассылка».</p></div>'; return; }
    body.innerHTML = '<div class="adc-table-wrap"><table class="adc-table">' +
      '<thead><tr><th>#</th><th>Текст</th><th>Каналы</th><th>Статус</th><th>Создан</th></tr></thead><tbody>' +
      posts.map((p) => '<tr>' +
        '<td>#' + p.id + '</td>' +
        '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc((p.text || '').slice(0, 100)) + '</td>' +
        '<td>' + (p.sources_count || p.source_ids?.length || '?') + '</td>' +
        '<td>' + esc(p.status || '—') + '</td>' +
        '<td>' + esc(fmtDate(p.created_at)) + '</td>' +
      '</tr>').join('') + '</tbody></table></div>';
  }

  // === ANALYTICS (rich) ===
  async function renderAnalytics(body) {
    let data;
    try { data = await api('GET', '/analytics'); }
    catch (e) { body.innerHTML = '<div class="adc-empty"><h3>Аналитика недоступна</h3><p>' + esc(e.message) + '</p></div>'; return; }
    const sm = data.summary || {};
    const channels = data.channels || [];
    const byDay = data.byDay || [];
    const byHour = data.byHour || [];
    const totalChannels = channels.length;
    const activeChannels = channels.filter(function (c) { return c.sent_week > 0; }).length;

    let html = '<div class="adc-cards-grid" style="margin-bottom:18px">' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + (sm.totalPosts || 0) + '</div><div class="adc-stat-lbl">Всего постов</div></div>' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + (sm.totalSent || 0) + '</div><div class="adc-stat-lbl">Доставлено</div></div>' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + (sm.totalFailed || 0) + '</div><div class="adc-stat-lbl">Ошибок</div></div>' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + (sm.deliveryRate || 0) + '%</div><div class="adc-stat-lbl">Доставляемость</div></div>' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + totalChannels + '</div><div class="adc-stat-lbl">Каналов</div></div>' +
      '<div class="adc-stat-box"><div class="adc-stat-num">' + activeChannels + '</div><div class="adc-stat-lbl">Активны (7д)</div></div>' +
    '</div>';

    // 14-day bar chart
    html += '<div class="adc-card"><h3 style="margin:0 0 12px;color:#fff">📈 Отправки за 14 дней</h3>';
    if (!byDay.length) {
      html += '<div class="adc-hint">Нет данных за последние 14 дней.</div>';
    } else {
      const maxV = Math.max.apply(null, byDay.map(function (d) { return d.cnt; }));
      html += '<div class="adc-bars">';
      // Build full 14-day window even if some days are zero
      const map = {};
      byDay.forEach(function (d) { map[d.day] = d.cnt; });
      for (let k = 13; k >= 0; k--) {
        const dt = new Date(); dt.setDate(dt.getDate() - k);
        const key = dt.toISOString().slice(0, 10);
        const v = map[key] || 0;
        const h = maxV > 0 ? Math.max(2, Math.round(v / maxV * 100)) : 2;
        html += '<div class="adc-bar-col"><div class="adc-bar" style="height:' + h + '%" title="' + key + ': ' + v + '"></div>' +
          '<div class="adc-bar-lbl">' + (dt.getDate()) + '</div></div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Best hours
    html += '<div class="adc-card"><h3 style="margin:0 0 12px;color:#fff">⏰ Лучшие часы для публикации</h3>';
    if (!byHour.length) {
      html += '<div class="adc-hint">Накопится после первых 20-30 публикаций.</div>';
    } else {
      const sortedByHour = byHour.slice().sort(function (a, b) { return Number(a.hour) - Number(b.hour); });
      const maxH = Math.max.apply(null, byHour.map(function (h) { return h.cnt; }));
      html += '<div class="adc-bars adc-bars-hours">';
      for (let h = 0; h < 24; h++) {
        const found = sortedByHour.find(function (x) { return Number(x.hour) === h; });
        const v = found ? found.cnt : 0;
        const ht = maxH > 0 ? Math.max(2, Math.round(v / maxH * 100)) : 2;
        const isTop = byHour.slice(0, 3).some(function (x) { return Number(x.hour) === h; });
        html += '<div class="adc-bar-col"><div class="adc-bar' + (isTop ? ' adc-bar--top' : '') + '" style="height:' + ht + '%" title="' + h + ':00 - ' + v + '"></div>' +
          '<div class="adc-bar-lbl">' + (h < 10 ? '0' + h : h) + '</div></div>';
      }
      html += '</div>';
      const top = byHour.slice(0, 3).map(function (x) { return x.hour + ':00'; }).join(', ');
      html += '<div class="adc-hint" style="margin-top:8px">🏆 Топ-3: ' + esc(top) + '</div>';
    }
    html += '</div>';

    // Per-channel table
    html += '<div class="adc-card"><h3 style="margin:0 0 12px;color:#fff">📺 По каналам</h3>';
    if (!channels.length) {
      html += '<div class="adc-hint">Нет активных каналов.</div>';
    } else {
      html += '<div class="adc-table-wrap"><table class="adc-table"><thead><tr>' +
        '<th>Канал</th><th>Доставлено</th><th>Ошибок</th><th>Делив-rate</th><th>За неделю</th><th>Последняя отправка</th>' +
        '</tr></thead><tbody>';
      channels.sort(function (a, b) { return (b.sent_week || 0) - (a.sent_week || 0); });
      channels.forEach(function (c) {
        const last = c.last_sent ? new Date(c.last_sent).toLocaleString('ru-RU') : '—';
        const rateColor = c.delivery_rate >= 95 ? '#10b981' : c.delivery_rate >= 80 ? '#fbbf24' : '#ef4444';
        html += '<tr>' +
          '<td><strong>' + esc(c.title || ('#' + c.id)) + '</strong></td>' +
          '<td>' + (c.sent_total || 0) + '</td>' +
          '<td>' + (c.failed_total || 0) + '</td>' +
          '<td><span style="color:' + rateColor + ';font-weight:700">' + c.delivery_rate + '%</span></td>' +
          '<td>' + (c.sent_week || 0) + '</td>' +
          '<td style="font-size:11px">' + esc(last) + '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }
    html += '</div>';

    body.innerHTML = html;
  }

  // === SMART QUEUE ===
  async function renderQueue(body) {
    let data;
    try { data = await api('GET', '/queue'); }
    catch (e) { body.innerHTML = '<div class="adc-empty"><h3>Smart-очередь недоступна</h3><p>' + esc(e.message) + '</p></div>'; return; }
    const items = data.queue || [];
    let html = '<div style="margin-bottom:14px">' +
      '<h3 style="margin:0;color:#fff">🧠 Smart-очередь — ближайшие 7 дней</h3>' +
      '<p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Очередь, заполненная Smart-Queue (умное распределение постов по лучшим часам). Создать очередь можно из карточки поста в "Истории постов".</p>' +
    '</div>';
    if (!items.length) {
      html += '<div class="adc-empty"><div style="font-size:48px">🧠</div><h3>Очередь пуста</h3>' +
        '<p>Открой пост в "Истории постов" → Smart-Queue → бот сам распределит по лучшим часам и каналам.</p></div>';
      body.innerHTML = html;
      return;
    }
    // Group by date
    const groups = {};
    items.forEach(function (q) {
      const d = (q.scheduled_at || '').slice(0, 10) || '?';
      if (!groups[d]) groups[d] = [];
      groups[d].push(q);
    });
    Object.keys(groups).sort().forEach(function (d) {
      const dateLabel = new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
      html += '<div class="adc-card" style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<strong style="color:#fff">' + esc(dateLabel) + '</strong>' +
          '<span style="color:#9ca3af;font-size:12px">' + groups[d].length + ' пост(ов)</span>' +
        '</div>';
      groups[d].forEach(function (q) {
        const t = (q.scheduled_at || '').slice(11, 16);
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid rgba(255,255,255,.05);gap:8px">' +
          '<div><span style="color:#00D4FF;font-family:monospace">' + esc(t) + '</span> ' +
          '<strong>' + esc(q.post_title || 'Пост #' + q.post_id) + '</strong></div>' +
          '<div style="font-size:11px;color:#9ca3af">→ ' + esc(q.source_title || 'Канал #' + q.source_id) + '</div>' +
        '</div>';
      });
      html += '</div>';
    });
    body.innerHTML = html;
  }

  // === CALENDAR ===
  async function renderCalendar(body) {
    if (!STATE.cal) {
      const now = new Date();
      STATE.cal = { y: now.getFullYear(), m: now.getMonth() + 1 };
    }
    const y = STATE.cal.y, m = STATE.cal.m;
    let data;
    try { data = await api('GET', '/calendar?year=' + y + '&month=' + m); }
    catch (e) { body.innerHTML = '<div class="adc-empty"><h3>Календарь недоступен</h3><p>' + esc(e.message) + '</p></div>'; return; }
    const sent = data.sent || [];
    const queued = data.queued || [];
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const dayNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
      '<h3 style="margin:0;color:#fff">📅 ' + monthNames[m - 1] + ' ' + y + '</h3>' +
      '<div style="display:flex;gap:6px">' +
        '<button class="adc-btn adc-btn-ghost" onclick="window.AdC.calNav(-1)">◀</button>' +
        '<button class="adc-btn adc-btn-ghost" onclick="window.AdC.calToday()">Сегодня</button>' +
        '<button class="adc-btn adc-btn-ghost" onclick="window.AdC.calNav(1)">▶</button>' +
      '</div>' +
    '</div>';

    // Build day map
    const dayMap = {};
    sent.forEach(function (p) {
      const d = (p.sent_at || '').slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { sent: [], queued: [] };
      dayMap[d].sent.push(p);
    });
    queued.forEach(function (q) {
      const d = (q.scheduled_at || '').slice(0, 10);
      if (!d) return;
      if (!dayMap[d]) dayMap[d] = { sent: [], queued: [] };
      dayMap[d].queued.push(q);
    });

    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0).getDate();
    let startWeekday = firstDay.getDay(); // 0=Sun
    if (startWeekday === 0) startWeekday = 7; // Mon-first
    const todayIso = new Date().toISOString().slice(0, 10);

    html += '<div class="adc-cal-grid">';
    dayNames.forEach(function (n) { html += '<div class="adc-cal-dayname">' + n + '</div>'; });
    for (let i = 1; i < startWeekday; i++) html += '<div class="adc-cal-empty"></div>';
    for (let d = 1; d <= lastDay; d++) {
      const iso = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const cell = dayMap[iso] || { sent: [], queued: [] };
      const isToday = iso === todayIso;
      html += '<div class="adc-cal-cell' + (isToday ? ' adc-cal-cell--today' : '') + '" onclick="window.AdC.calDayDetail(\'' + iso + '\')">' +
        '<div class="adc-cal-num">' + d + '</div>';
      if (cell.sent.length) html += '<div class="adc-cal-pill adc-cal-pill--sent">📤 ' + cell.sent.length + '</div>';
      if (cell.queued.length) html += '<div class="adc-cal-pill adc-cal-pill--queued">⏳ ' + cell.queued.length + '</div>';
      html += '</div>';
    }
    html += '</div>';
    html += '<div class="adc-hint" style="margin-top:8px">📤 — отправлено · ⏳ — в Smart-очереди · клик по дню — подробности</div>';

    body.innerHTML = html;
    window._calData = dayMap;
  }

  window.AdC.calNav = function (delta) {
    if (!STATE.cal) return;
    let m = STATE.cal.m + delta;
    let y = STATE.cal.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    STATE.cal = { y: y, m: m };
    loadTab();
  };
  window.AdC.calToday = function () {
    const now = new Date();
    STATE.cal = { y: now.getFullYear(), m: now.getMonth() + 1 };
    loadTab();
  };
  window.AdC.calDayDetail = function (iso) {
    const cell = (window._calData || {})[iso] || { sent: [], queued: [] };
    if (!cell.sent.length && !cell.queued.length) return toast('В этот день ничего нет');
    const m = document.createElement('div');
    m.id = 'adcCalModal';
    m.className = 'adc-modal';
    let body = '<div class="adc-modal-card"><div class="adc-modal-head"><h3>📅 ' + esc(new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })) + '</h3>' +
      '<button class="adc-close" onclick="document.getElementById(\'adcCalModal\').remove()">✕</button></div>' +
      '<div class="adc-modal-body">';
    if (cell.sent.length) {
      body += '<h4 style="color:#10b981;margin:0 0 8px">📤 Отправлено (' + cell.sent.length + ')</h4>';
      cell.sent.forEach(function (p) {
        const t = (p.sent_at || '').slice(11, 16);
        body += '<div class="adc-card" style="padding:10px;margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between"><strong>' + esc(p.title || 'Пост #' + p.id) + '</strong>' +
          '<span style="color:#9ca3af;font-family:monospace">' + esc(t) + '</span></div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-top:4px">✓ ' + (p.sent_count || 0) + ' / ✗ ' + (p.fail_count || 0) + '</div></div>';
      });
    }
    if (cell.queued.length) {
      body += '<h4 style="color:#00D4FF;margin:14px 0 8px">⏳ В Smart-очереди (' + cell.queued.length + ')</h4>';
      cell.queued.forEach(function (q) {
        const t = (q.scheduled_at || '').slice(11, 16);
        body += '<div class="adc-card" style="padding:10px;margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between"><strong>' + esc(q.post_title || 'Пост #' + q.post_id) + '</strong>' +
          '<span style="color:#9ca3af;font-family:monospace">' + esc(t) + '</span></div>' +
          '<div style="font-size:11px;color:#9ca3af;margin-top:4px">→ ' + esc(q.source_title || 'Канал #' + q.source_id) + '</div></div>';
      });
    }
    body += '</div></div>';
    m.innerHTML = body;
    document.body.appendChild(m);
  };

  // === SCHEDULES ===
  async function renderSchedules(body) {
    try {
      const r = await api('GET', '/schedules');
      const items = (r && (r.schedules || r.items)) || (Array.isArray(r) ? r : []);
      let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div><h3 style="margin:0;color:#fff">🔄 Авторассылки</h3>' +
        '<p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Расписание автопостинга — интервал или конкретное время. AI-рерайт можно включить.</p></div>' +
        '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewSchedule()">+ Новое расписание</button>' +
      '</div>';
      if (!items.length) {
        html += '<div class="adc-empty"><div style="font-size:48px">📅</div><h3>Расписаний нет</h3>' +
          '<p>Создай авторассылку: один раз настроишь — посты будут лететь сами по интервалу или по времени.</p>' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewSchedule()">Создать первое</button></div>';
      } else {
        html += '<div class="adc-table-wrap"><table class="adc-table"><thead><tr>' +
          '<th>#</th><th>Тип</th><th>Параметры</th><th>Статус</th><th>Запусков</th><th>След.</th><th></th>' +
          '</tr></thead><tbody>';
        items.forEach(function (it) {
          const params = it.type === 'interval'
            ? 'каждые ' + (it.interval_minutes || '?') + ' мин'
            : (it.scheduled_at ? new Date(it.scheduled_at).toLocaleString('ru-RU') : '—');
          const status = it.status === 'active'
            ? '<span style="color:#10b981">✓ активно</span>'
            : '<span style="color:#9ca3af">⏸ пауза</span>';
          const nxt = it.next_run_at ? new Date(it.next_run_at).toLocaleString('ru-RU') : '—';
          const postPreview = (it.post_text || '').slice(0, 60) + ((it.post_text || '').length > 60 ? '…' : '');
          html += '<tr>' +
            '<td>#' + it.id + '</td>' +
            '<td>' + (it.type === 'interval' ? '🔁 интервал' : '⏰ время') + '</td>' +
            '<td><div>' + esc(params) + (it.ai_rewrite ? ' <span style="color:#00D4FF;font-size:11px">+ AI</span>' : '') + '</div>' +
              (postPreview ? '<div style="font-size:11px;color:#9ca3af;margin-top:3px">' + esc(postPreview) + '</div>' : '') + '</td>' +
            '<td>' + status + '</td>' +
            '<td>' + (it.total_runs || it.runs_count || 0) + (it.max_runs ? ' / ' + it.max_runs : '') + '</td>' +
            '<td>' + esc(nxt) + '</td>' +
            '<td style="white-space:nowrap">' +
              '<button class="adc-btn adc-btn-ghost" style="padding:6px 10px" onclick="window.AdC.runScheduleNow(' + it.id + ')">▶</button> ' +
              '<button class="adc-btn adc-btn-ghost" style="padding:6px 10px" onclick="window.AdC.toggleSchedule(' + it.id + ',\'' + (it.status === 'active' ? 'paused' : 'active') + '\')">' + (it.status === 'active' ? '⏸' : '▶') + '</button> ' +
              '<button class="adc-btn adc-btn-warn" style="padding:6px 10px" onclick="window.AdC.deleteSchedule(' + it.id + ')">🗑</button>' +
            '</td>' +
          '</tr>';
        });
        html += '</tbody></table></div>';
      }
      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = '<div class="adc-empty"><h3>Не удалось загрузить расписания</h3><p>' + esc(e.message) + '</p></div>';
    }
  }

  window.AdC.openNewSchedule = async function () {
    let sources = [];
    try { const r = await api('GET', '/sources'); sources = (r && (r.sources || r.items)) || (Array.isArray(r) ? r : []); } catch (_) {}
    const channels = sources.filter(function (s) { return s.status === 'active' || s.status === undefined; });
    const m = document.createElement('div');
    m.id = 'adcSchedModal';
    m.className = 'adc-modal';
    let chOpts = '<div class="adc-channels">';
    channels.forEach(function (c) {
      chOpts += '<label class="adc-channel-item"><input type="checkbox" value="' + c.id + '" data-sched-ch>' +
        '<div><strong>' + esc(c.title || c.username || ('Канал #' + c.id)) + '</strong>' +
        (c.username ? '<br><small>@' + esc(c.username) + '</small>' : '') + '</div></label>';
    });
    chOpts += '</div>';
    if (!channels.length) chOpts = '<div class="adc-hint">Сначала добавь хотя бы один канал во вкладке "Каналы".</div>';

    m.innerHTML = '<div class="adc-modal-card"><div class="adc-modal-head"><h3>+ Новое расписание</h3>' +
      '<button class="adc-close" onclick="document.getElementById(\'adcSchedModal\').remove()">✕</button></div>' +
      '<div class="adc-modal-body">' +
        '<div class="adc-field"><label>Текст поста</label><textarea id="schedText" rows="4" placeholder="Текст, который будет публиковаться по расписанию"></textarea></div>' +
        '<div class="adc-field"><label>Каналы для публикации</label>' + chOpts + '</div>' +
        '<div class="adc-field"><label>Тип расписания</label>' +
          '<select id="schedType" onchange="window.AdC.schedTypeChange()">' +
            '<option value="interval">🔁 Интервал (каждые N минут)</option>' +
            '<option value="scheduled">⏰ Конкретное время</option>' +
          '</select></div>' +
        '<div class="adc-field" id="schedIntervalRow"><label>Интервал, минут</label><input type="number" id="schedInterval" min="5" value="60"></div>' +
        '<div class="adc-field" id="schedAtRow" style="display:none"><label>Дата и время первого запуска</label><input type="datetime-local" id="schedAt"></div>' +
        '<div class="adc-field"><label><input type="checkbox" id="schedAi" style="width:auto;margin-right:6px">✨ AI-рерайт перед каждой публикацией</label>' +
          '<div class="adc-hint">Каждый раз генерируется свежий вариант текста — снижает риск спам-фильтра.</div></div>' +
        '<div class="adc-field"><label>Лимит запусков (опционально)</label><input type="number" id="schedMaxRuns" min="0" value="0">' +
          '<div class="adc-hint">0 = без лимита</div></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="adc-btn adc-btn-ghost" onclick="document.getElementById(\'adcSchedModal\').remove()">Отмена</button>' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.saveSchedule()">Создать</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(m);
  };

  window.AdC.schedTypeChange = function () {
    const t = document.getElementById('schedType').value;
    document.getElementById('schedIntervalRow').style.display = t === 'interval' ? '' : 'none';
    document.getElementById('schedAtRow').style.display = t === 'scheduled' ? '' : 'none';
  };

  window.AdC.saveSchedule = async function () {
    const text = document.getElementById('schedText').value.trim();
    const channels = [].slice.call(document.querySelectorAll('[data-sched-ch]:checked')).map(function (c) { return Number(c.value); });
    const type = document.getElementById('schedType').value;
    const ai = document.getElementById('schedAi').checked;
    const maxRuns = Number(document.getElementById('schedMaxRuns').value) || 0;
    if (!text) return toast('Введи текст', 'error');
    if (!channels.length) return toast('Выбери хотя бы один канал', 'error');
    let intervalMin = 0;
    let scheduledAt = null;
    if (type === 'interval') {
      intervalMin = Number(document.getElementById('schedInterval').value);
      if (!intervalMin || intervalMin < 5) return toast('Минимум 5 минут', 'error');
    } else {
      const at = document.getElementById('schedAt').value;
      if (!at) return toast('Укажи дату и время', 'error');
      scheduledAt = new Date(at).toISOString().replace('T', ' ').slice(0, 19);
    }
    try {
      // 1. Ensure user has a "Авторассылки" campaign
      const camR = await api('GET', '/campaigns');
      let campaigns = (camR && (camR.campaigns || camR.items)) || [];
      let camp = campaigns.find(function (c) { return c.name === 'Авторассылки'; });
      if (!camp) {
        const newC = await api('POST', '/campaigns', { name: 'Авторассылки', description: 'Авто-создано из вкладки Авторассылки' });
        camp = (newC && newC.campaign) || newC;
      }
      // 2. Attach selected channels to campaign (idempotent on backend)
      try { await api('POST', '/campaigns/' + camp.id + '/sources', { source_ids: channels }); } catch (_) {}
      // 3. Create draft post with the text, attached to campaign
      const postR = await api('POST', '/posts', {
        campaign_id: camp.id,
        title: 'Schedule ' + new Date().toISOString().slice(0, 16),
        text_original: text,
        text_final: text,
        type: 'scheduled',
      });
      const post = (postR && postR.post) || postR;
      // 4. Create schedule
      const payload = {
        campaign_id: camp.id,
        post_id: post.id,
        type: type,
        ai_rewrite: ai ? 1 : 0,
        max_runs: maxRuns,
      };
      if (type === 'interval') payload.interval_minutes = intervalMin;
      else payload.scheduled_at = scheduledAt;
      await api('POST', '/schedules', payload);
      const m = document.getElementById('adcSchedModal'); if (m) m.remove();
      toast('🔄 Расписание создано');
      loadTab();
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  window.AdC.runScheduleNow = async function (id) {
    try { await api('POST', '/schedules/' + id + '/run-now'); toast('▶ Запущено'); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };
  window.AdC.toggleSchedule = async function (id, status) {
    try { await api('PUT', '/schedules/' + id, { status: status }); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };
  window.AdC.deleteSchedule = async function (id) {
    if (!confirm('Удалить расписание?')) return;
    try { await api('DELETE', '/schedules/' + id); toast('Удалено'); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  // === TEMPLATES ===
  async function renderTemplates(body) {
    try {
      const r = await api('GET', '/templates');
      const items = (r && (r.templates || r.items)) || (Array.isArray(r) ? r : []);
      let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<div><h3 style="margin:0;color:#fff">📝 Шаблоны постов</h3>' +
        '<p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Сохраняй удачные тексты — переиспользуй одной кнопкой во вкладке "Мгновенная рассылка".</p></div>' +
        '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewTemplate()">+ Новый шаблон</button>' +
      '</div>';
      if (!items.length) {
        html += '<div class="adc-empty"><div style="font-size:48px">📝</div><h3>Шаблонов нет</h3>' +
          '<p>Сохрани часто используемые тексты как шаблон — потом одной кнопкой подставишь в инстант-рассылку.</p>' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewTemplate()">Создать шаблон</button></div>';
      } else {
        html += '<div class="adc-cards-grid">';
        items.forEach(function (it) {
          html += '<div class="adc-card">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
              '<strong style="color:#fff">' + esc(it.title || ('Шаблон #' + it.id)) + '</strong>' +
              '<span style="font-size:11px;color:#9ca3af">↻ ' + (it.use_count || 0) + '</span>' +
            '</div>' +
            '<div style="font-size:12px;color:#9ca3af;line-height:1.5;max-height:80px;overflow:hidden;margin-bottom:10px">' + esc((it.text_content || it.text || '').slice(0, 200)) + ((it.text_content || it.text || '').length > 200 ? '…' : '') + '</div>' +
            '<div style="display:flex;gap:6px">' +
              '<button class="adc-btn adc-btn-primary" style="flex:1;padding:6px 10px;font-size:12px" onclick="window.AdC.useTemplate(' + it.id + ')">Использовать</button>' +
              '<button class="adc-btn adc-btn-warn" style="padding:6px 10px;font-size:12px" onclick="window.AdC.deleteTemplate(' + it.id + ')">🗑</button>' +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      body.innerHTML = html;
    } catch (e) {
      body.innerHTML = '<div class="adc-empty"><h3>Не удалось загрузить шаблоны</h3><p>' + esc(e.message) + '</p></div>';
    }
  }

  window.AdC.openNewTemplate = function () {
    const m = document.createElement('div');
    m.id = 'adcTplModal';
    m.className = 'adc-modal';
    m.innerHTML = '<div class="adc-modal-card"><div class="adc-modal-head"><h3>+ Новый шаблон</h3>' +
      '<button class="adc-close" onclick="document.getElementById(\'adcTplModal\').remove()">✕</button></div>' +
      '<div class="adc-modal-body">' +
        '<div class="adc-field"><label>Название</label><input id="tplTitle" placeholder="Например: Утренний прогрев"></div>' +
        '<div class="adc-field"><label>Текст шаблона</label><textarea id="tplText" rows="6"></textarea></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="adc-btn adc-btn-ghost" onclick="document.getElementById(\'adcTplModal\').remove()">Отмена</button>' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.saveTemplate()">Сохранить</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(m);
  };

  window.AdC.saveTemplate = async function () {
    const title = document.getElementById('tplTitle').value.trim();
    const text = document.getElementById('tplText').value.trim();
    if (!title || !text) return toast('Заполни название и текст', 'error');
    try {
      await api('POST', '/templates', { title: title, text_content: text });
      const m = document.getElementById('adcTplModal'); if (m) m.remove();
      toast('Шаблон сохранён');
      loadTab();
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  window.AdC.useTemplate = async function (id) {
    try {
      const r = await api('POST', '/templates/' + id + '/use');
      const text = (r && r.template && (r.template.text_content || r.template.text)) || (r && r.text) || '';
      // Switch to instant tab and prefill
      STATE.tab = 'instant';
      const host = $('adCenterContent');
      renderHeader(host);
      await loadTab();
      setTimeout(function () {
        const ta = document.getElementById('adcInstantText');
        if (ta) { ta.value = text; ta.focus(); }
        toast('Текст вставлен в "Мгновенная рассылка"');
      }, 80);
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  window.AdC.deleteTemplate = async function (id) {
    if (!confirm('Удалить шаблон?')) return;
    try { await api('DELETE', '/templates/' + id); toast('Удалено'); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  // === MONITORS (YouTube / TikTok / Instagram) ===
  async function renderMonitors(body) {
    let items = [];
    try {
      const r = await api('GET', '/monitors');
      items = (r && (r.monitors || r.items)) || (Array.isArray(r) ? r : []);
    } catch (e) {
      body.innerHTML = '<div class="adc-empty"><h3>Не удалось загрузить мониторы</h3><p>' + esc(e.message) + '</p></div>';
      return;
    }
    let html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">' +
      '<div><h3 style="margin:0;color:#fff">🤖 Авто-мониторы YouTube/TikTok</h3>' +
      '<p style="margin:4px 0 0;color:#9ca3af;font-size:12px">Бот сам проверяет канал/блогера, скачивает свежее видео, делает рерайт под твой промт и публикует в выбранные TG-каналы. Watermark + банер опционально.</p></div>' +
      '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewMonitor()">+ Новый монитор</button>' +
    '</div>';
    if (!items.length) {
      html += '<div class="adc-empty"><div style="font-size:48px">🛰</div><h3>Мониторов нет</h3>' +
        '<p>Подключи YouTube-канал или TikTok-аккаунт — бот автоматически переопубликует свежие ролики с твоим текстом и оформлением.</p>' +
        '<button class="adc-btn adc-btn-primary" onclick="window.AdC.openNewMonitor()">Создать первый монитор</button></div>';
      body.innerHTML = html;
      return;
    }
    html += '<div class="adc-cards-grid">';
    items.forEach(function (m) {
      const platformIcon = m.platform === 'youtube' ? '▶️' : m.platform === 'tiktok' ? '🎵' : m.platform === 'instagram' ? '📷' : '🔗';
      const statusBadge = m.status === 'active'
        ? '<span style="color:#10b981;font-size:11px">● активен</span>'
        : '<span style="color:#9ca3af;font-size:11px">⏸ пауза</span>';
      const lastCheck = m.last_check ? new Date(m.last_check).toLocaleString('ru-RU') : '—';
      html += '<div class="adc-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:6px">' +
          '<strong style="color:#fff;font-size:14px">' + platformIcon + ' ' + esc(m.title || 'Монитор #' + m.id) + '</strong>' +
          statusBadge +
        '</div>' +
        '<div style="font-size:11px;color:#9ca3af;word-break:break-all;margin-bottom:6px">' + esc((m.source_url || '').slice(0, 60)) + ((m.source_url || '').length > 60 ? '…' : '') + '</div>' +
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">⏰ каждые ' + (m.interval_hours || '?') + ' ч · посл. ' + esc(lastCheck) +
          (m.auto_post ? ' · <span style="color:#00D4FF">📡 автопост</span>' : ' · черновик') + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<button class="adc-btn adc-btn-primary" style="flex:1;padding:6px 10px;font-size:12px" onclick="window.AdC.runMonitor(' + m.id + ')">▶ Проверить сейчас</button>' +
          '<button class="adc-btn adc-btn-ghost" style="padding:6px 10px;font-size:12px" onclick="window.AdC.toggleMonitor(' + m.id + ',\'' + (m.status === 'active' ? 'paused' : 'active') + '\')">' + (m.status === 'active' ? '⏸' : '▶') + '</button>' +
          '<button class="adc-btn adc-btn-warn" style="padding:6px 10px;font-size:12px" onclick="window.AdC.deleteMonitor(' + m.id + ')">🗑</button>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  window.AdC.openNewMonitor = async function () {
    let sources = [];
    try { const r = await api('GET', '/sources'); sources = (r && (r.sources || r.items)) || (Array.isArray(r) ? r : []); } catch (_) {}
    const channels = sources.filter(function (s) { return s.status === 'active' || s.is_active === 1 || s.is_active === undefined; });
    let chOpts = '<div class="adc-channels">';
    channels.forEach(function (c) {
      chOpts += '<label class="adc-channel-item"><input type="checkbox" value="' + c.id + '" data-mon-ch>' +
        '<div><strong>' + esc(c.title || c.username || ('Канал #' + c.id)) + '</strong>' +
        (c.username ? '<br><small>@' + esc(c.username) + '</small>' : '') + '</div></label>';
    });
    chOpts += '</div>';
    if (!channels.length) chOpts = '<div class="adc-hint">Нет активных каналов. Сначала добавь канал во вкладке "Каналы".</div>';

    const m = document.createElement('div');
    m.id = 'adcMonModal';
    m.className = 'adc-modal';
    m.innerHTML = '<div class="adc-modal-card" style="max-width:620px"><div class="adc-modal-head"><h3>+ Новый авто-монитор</h3>' +
      '<button class="adc-close" onclick="document.getElementById(\'adcMonModal\').remove()">✕</button></div>' +
      '<div class="adc-modal-body">' +
        '<div class="adc-field"><label>Название</label><input id="monTitle" placeholder="Например: ТопGEAR YouTube"></div>' +
        '<div class="adc-field"><label>URL источника</label><input id="monUrl" placeholder="https://youtube.com/@channel  или  https://tiktok.com/@user">' +
          '<div class="adc-hint">Поддерживается всё, что умеет yt-dlp: YouTube канал/плейлист, TikTok автор, Instagram, Twitch и др.</div></div>' +
        '<div class="adc-field"><label>Промт для AI-рерайта</label><textarea id="monPrompt" rows="3" placeholder="Например: Перепиши описание ролика как рекламный пост, добавь призыв подписаться, эмодзи и хештеги."></textarea></div>' +
        '<div class="adc-field"><label>Каналы для публикации</label>' + chOpts + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          '<div class="adc-field"><label>Интервал, часов</label><input type="number" id="monInterval" min="1" value="6"></div>' +
          '<div class="adc-field"><label>Язык</label><select id="monLang"><option value="ru">Русский</option><option value="en">English</option><option value="es">Español</option><option value="de">Deutsch</option></select></div>' +
        '</div>' +
        '<div class="adc-field"><label>Watermark (необязательно)</label><input id="monWatermark" placeholder="Например: @MyChannel"><div class="adc-hint">Текст водяного знака на видео.</div></div>' +
        '<div class="adc-field"><label><input type="checkbox" id="monAuto" style="width:auto;margin-right:6px" checked>📡 Сразу публиковать (без апрува)</label>' +
          '<div class="adc-hint">Если выключить — пост создастся как черновик в "Истории постов".</div></div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button class="adc-btn adc-btn-ghost" onclick="document.getElementById(\'adcMonModal\').remove()">Отмена</button>' +
          '<button class="adc-btn adc-btn-primary" onclick="window.AdC.saveMonitor()">Создать</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(m);
  };

  window.AdC.saveMonitor = async function () {
    const title = document.getElementById('monTitle').value.trim();
    const url = document.getElementById('monUrl').value.trim();
    const prompt = document.getElementById('monPrompt').value.trim();
    const interval = Number(document.getElementById('monInterval').value) || 6;
    const lang = document.getElementById('monLang').value;
    const wm = document.getElementById('monWatermark').value.trim();
    const auto = document.getElementById('monAuto').checked ? 1 : 0;
    const channels = [].slice.call(document.querySelectorAll('[data-mon-ch]:checked')).map(function (c) { return Number(c.value); });
    if (!title) return toast('Введи название', 'error');
    if (!url || !/^https?:/i.test(url)) return toast('URL обязателен', 'error');
    if (auto && !channels.length) return toast('Для автопостинга выбери хотя бы один канал', 'error');
    try {
      await api('POST', '/monitors', {
        title: title,
        source_url: url,
        ai_prompt: prompt,
        interval_hours: interval,
        language: lang,
        watermark_text: wm,
        auto_post: auto,
        target_sources_json: JSON.stringify(channels),
      });
      const modal = document.getElementById('adcMonModal'); if (modal) modal.remove();
      toast('🤖 Монитор создан');
      loadTab();
    } catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  window.AdC.runMonitor = async function (id) {
    try { await api('POST', '/monitors/' + id + '/run'); toast('▶ Проверка запущена — пост появится через 1-3 мин'); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };
  window.AdC.toggleMonitor = async function (id, status) {
    try { await api('PUT', '/monitors/' + id, { status: status }); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };
  window.AdC.deleteMonitor = async function (id) {
    if (!confirm('Удалить монитор?')) return;
    try { await api('DELETE', '/monitors/' + id); toast('Удалено'); loadTab(); }
    catch (e) { toast('Ошибка: ' + e.message, 'error'); }
  };

  function renderSoon(body) {
    body.innerHTML = '<div class="adc-empty"><div style="font-size:56px">⚙️</div><h3>Скоро</h3>' +
      '<p>Готовится в следующей фазе.</p></div>';
  }

  // === MOUNT ===
  async function mount(host) {
    if (!host) host = $('adCenterContent'); if (!host) return;
    renderHeader(host);
    fetchUsageBanner(host);
    await loadTab();
  }

  async function fetchUsageBanner(host) {
    try {
      const r = await fetch('/cabinet/api/usage/status?services=ai.text,video.transcribe,adcenter.send,adcenter.sources,adcenter.monitors', { credentials: 'same-origin' });
      if (!r.ok) return;
      const d = await r.json();
      const u = (d && d.usage) || {};
      const items = [];
      const fmt = (svc, label, icon) => {
        const x = u[svc]; if (!x) return null;
        const pct = x.limit > 0 ? Math.round(x.used / x.limit * 100) : 0;
        const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#fbbf24' : '#9ca3af';
        return '<span style="color:' + color + ';font-size:12px">' + icon + ' ' + label + ' ' + x.used + '/' + x.limit + '</span>';
      };
      const a = fmt('ai.text', 'AI', '✨');
      const b = fmt('video.transcribe', 'Транс', '🎤');
      const c = fmt('adcenter.send', 'Рассылка', '📡');
      const ds = fmt('adcenter.sources', 'Каналы', '📺');
      const dm = fmt('adcenter.monitors', 'Мониторы', '🤖');
      [a, b, c, ds, dm].forEach((x) => x && items.push(x));
      if (!items.length) return;
      // Inject into hero actions div
      const hero = host.querySelector('.adc-hero-actions');
      if (!hero) return;
      let usageDiv = host.querySelector('.adc-usage-banner');
      if (!usageDiv) {
        usageDiv = document.createElement('div');
        usageDiv.className = 'adc-usage-banner';
        usageDiv.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;padding:6px 10px;background:rgba(0,0,0,.25);border-radius:8px;margin-top:8px;width:100%';
        const heroEl = host.querySelector('.adc-hero');
        if (heroEl) heroEl.appendChild(usageDiv);
      }
      usageDiv.innerHTML = items.join('<span style="color:rgba(255,255,255,.15)">·</span>');
    } catch (_) {}
  }
  window.AdC.mount = mount;
  window.loadAdCenterPage = function () { mount($('adCenterContent')); };
})();
