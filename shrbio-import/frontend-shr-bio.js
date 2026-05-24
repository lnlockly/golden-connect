  if (_shrUrlFormat === 'subdomain') {
    return 'https://' + code + '.' + domain;
  }
  return 'https://' + domain + '/' + code;
}

window._shrDomainChange = function(val) {
  _shrSelectedDomain = val;
  localStorage.setItem('shr_domain', val);
};

function _shrFlag(countryCode) {
  if (!countryCode || countryCode.length !== 2) return '';
  const cc = countryCode.toUpperCase();
  return String.fromCodePoint(...[...cc].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
}

function _shrTagColor(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return SHR_COLORS[Math.abs(hash) % SHR_COLORS.length];
}

function _shrRenderTags(tags) {
  if (!tags || !tags.length) return '';
  return tags.map(t =>
    `<span class="shr-tag-chip" style="background:${_shrTagColor(t)}20;color:${_shrTagColor(t)};border:1px solid ${_shrTagColor(t)}40">${_shrEsc(t)}</span>`
  ).join('');
}

function _shrPanelEl() {
  const customId = window._shrPanelId;
  if (customId) {
    const custom = document.getElementById(customId);
    if (custom) return custom;
  }
  return document.getElementById('shr-panel');
}

function _shrCopyText(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast(_shrT('copied'), 'success'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(_shrT('copied'), 'success');
  }
}

function _shrCloseModal() {
  const ov = document.querySelector('.shr-modal-overlay');
  if (ov) ov.remove();
  if (_shrStatsChart) { _shrStatsChart.destroy(); _shrStatsChart = null; }
}

function _shrShowModal(title, bodyHtml, opts) {
  _shrCloseModal();
  opts = opts || {};
  const width = opts.width || '700px';
  const div = document.createElement('div');
  div.className = 'shr-modal-overlay';
  div.innerHTML = `
    <div class="shr-modal" style="max-width:${width}">
      <div class="shr-modal-header">
        <h3>${title}</h3>
        <button class="shr-modal-close" onclick="window._shrCloseModal()">&times;</button>
      </div>
      <div class="shr-modal-body">${bodyHtml}</div>
    </div>`;
  div.addEventListener('click', e => { if (e.target === div) _shrCloseModal(); });
  document.body.appendChild(div);
  return div;
}

window._shrShowModal = _shrShowModal;
window._shrCloseModal = _shrCloseModal;

function _shrDeviceEmoji(d) {
  if (!d) return '';
  const dl = d.toLowerCase();
  if (dl.includes('mobile') || dl.includes('phone')) return '\u{1F4F1}';
  if (dl.includes('tablet')) return '\u{1F4F2}';
  if (dl.includes('desktop') || dl.includes('pc')) return '\u{1F5A5}\uFE0F';
  if (dl.includes('bot') || dl.includes('crawler')) return '\u{1F916}';
  return '\u{1F4BB}';
}

function _shrBrowserIcon(b) {
  if (!b) return '';
  const bl = b.toLowerCase();
  if (bl.includes('chrome')) return '\u{1F7E2}';
  if (bl.includes('firefox')) return '\u{1F7E0}';
  if (bl.includes('safari')) return '\u{1F535}';
  if (bl.includes('edge')) return '\u{1F7E6}';
  if (bl.includes('opera')) return '\u{1F534}';
  return '\u{1F310}';
}

function _shrReferrerEmoji(r) {
  if (!r) return '\u{1F517}';
  const rl = r.toLowerCase();
  if (rl.includes('google')) return '\u{1F50D}';
  if (rl.includes('facebook') || rl.includes('fb.')) return '\u{1F4D8}';
  if (rl.includes('twitter') || rl.includes('t.co')) return '\u{1F426}';
  if (rl.includes('telegram') || rl.includes('t.me')) return '\u{2708}\uFE0F';
  if (rl.includes('instagram')) return '\u{1F4F7}';
  if (rl.includes('youtube')) return '\u{1F4FA}';
  if (rl.includes('tiktok')) return '\u{1F3B5}';
  if (rl.includes('reddit')) return '\u{1F4E2}';
  if (rl === 'direct') return '\u{1F3AF}';
  return '\u{1F517}';
}

function _shrPercentBar(value, max, color) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return `<div class="shr-bd-bar"><div class="shr-bd-bar-fill" style="width:${pct}%;background:${color || '#667eea'}"></div></div>`;
}


// ============================================================
// 1. loadShortener() — Main page renderer
// ============================================================

function loadShortener() {
  window._shrPanelId = 'shr-panel';
  const el = document.getElementById('shortenerContent');
  if (!el) return;

  if (!API.isLoggedIn()) {
    el.innerHTML = `<div class="tools-hero" style="padding:60px 20px">${renderGuideButton('tools.shr')}
      <h2>${_shrT('title')}</h2>
      <p style="margin:20px 0">${_shrT('login_required')}</p>
      <button class="btn btn-primary" onclick="showLogin()">${_shrT('login')}</button>
    </div>${renderGuidePanel('tools.shr')}`;
    return;
  }

  try {
    el.innerHTML = `
      <div class="shr-container">
        ${renderGuidePanel('tools.shr')}
        <!-- Quick Shorten Form -->
        <div class="shr-quick shr-futuristic-card" style="position:relative">
          <div class="shr-title-row">
            <h2>${_shrT('title')}</h2>
            ${renderGuideButton('tools.shr')}
          </div>
          <div class="shr-quick-row" style="position:relative">
            <input type="url" id="shr-url" class="shr-input shr-futuristic-input" placeholder="${_shrT('paste_url')}" required
              onfocus="window._shrCheckClipboard()" oninput="window._shrOnUrlInput()" />
            <button class="btn btn-primary shr-futuristic-btn" onclick="window.shrCreate()" id="shr-create-btn">${_shrT('shorten')}</button>
          </div>
          <!-- URL Preview Card -->
          <div id="shr-preview-wrap"></div>

          <div class="shr-fields-grid">
            <div class="shr-field-group">
              <label class="shr-field-label" for="shr-alias">${_shrT('custom_alias')}</label>
              <input type="text" id="shr-alias" class="shr-input shr-input-sm shr-futuristic-input" placeholder="my-link" />
            </div>
            <div class="shr-field-group">
              <label class="shr-field-label" for="shr-domain">${_shrT('domain') || 'Domain'}</label>
              <select id="shr-domain" class="shr-input shr-input-sm shr-futuristic-input" onchange="window._shrDomainChange(this.value)">
                ${SHR_DOMAINS.map(d => '<option value="'+d+'"'+(d===_shrSelectedDomain?' selected':'')+'>'+d+'</option>').join('')}
              </select>
            </div>
            <div class="shr-field-group">
              <label class="shr-field-label" for="shr-campaign">${_shrT('campaign') || 'Campaign'}</label>
              <select id="shr-campaign" class="shr-input shr-input-sm shr-futuristic-input">
                <option value="">${_shrT('no_campaign')}</option>
              </select>
            </div>
            <div class="shr-field-group">
              <label class="shr-field-label" for="shr-title">${_shrT('title_optional')}</label>
              <input type="text" id="shr-title" class="shr-input shr-input-sm shr-futuristic-input" placeholder="" />
            </div>
          </div>

          <!-- Tags input -->
          <div class="shr-quick-opts">
            <div class="shr-tags-input" id="shr-tags-wrap">
              <div id="shr-tags-chips"></div>
              <input type="text" id="shr-tags-input" class="shr-input shr-input-sm" placeholder="${_shrT('add_tags')}"
                onkeydown="window._shrTagKeydown(event)" />
            </div>
          </div>

          <!-- OG Section (collapsible) -->
          <details class="shr-og-section" id="shr-og-section">
            <summary>${_shrT('og_section')}</summary>
            <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
              <input type="text" id="shr-og-title" class="shr-input shr-input-sm" placeholder="${_shrT('og_title')}" />
              <input type="text" id="shr-og-desc" class="shr-input shr-input-sm" placeholder="${_shrT('og_description')}" />
              <input type="url" id="shr-og-image" class="shr-input shr-input-sm" placeholder="${_shrT('og_image')}" />
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
                <button type="button" class="btn btn-sm shr-og-gen-btn" onclick="window._shrOpenOgGen('shr-og-image','shr-og-title','shr-og-desc')">&#127912; Создать OG-изображение</button>
                <button type="button" class="btn btn-sm shr-og-gen-btn" onclick="window._shrOpenQrCard('shr-og-image',document.getElementById('shr-url')?.value)">&#128241; QR-карточка как OG</button>
              </div>
              <div class="shr-og-preview-card" id="shr-og-preview-mini" style="display:none">
                <div class="shr-og-preview-image" id="shr-og-preview-img"></div>
                <div class="shr-og-preview-body">
                  <div class="shr-og-preview-title" id="shr-og-preview-title"></div>
                  <div class="shr-og-preview-desc" id="shr-og-preview-desc"></div>
                  <div class="shr-og-preview-url" id="shr-og-preview-url"></div>
                </div>
              </div>
            </div>
          </details>

          <!-- UTM Section -->
          <div class="shr-utm-section">
            <button class="shr-utm-toggle" onclick="window._shrToggleUtm()">
              <span id="shr-utm-arrow">\u25B6</span> UTM ${_shrT('parameters')}
            </button>
            <div class="shr-utm-fields" id="shr-utm-fields" style="display:none">
              <div class="shr-quick-opts">
                <input type="text" id="shr-utm-source" class="shr-input shr-input-sm" placeholder="utm_source" />
                <input type="text" id="shr-utm-medium" class="shr-input shr-input-sm" placeholder="utm_medium" />
                <input type="text" id="shr-utm-campaign" class="shr-input shr-input-sm" placeholder="utm_campaign" />
              </div>
              <div class="shr-quick-opts">
                <input type="text" id="shr-utm-term" class="shr-input shr-input-sm" placeholder="utm_term" />
                <input type="text" id="shr-utm-content" class="shr-input shr-input-sm" placeholder="utm_content" />
              </div>
            </div>
          </div>

          <!-- Format Toggle -->
          <div class="shr-format-toggle">
            <label>${_shrT('format')}:</label>
            <button class="shr-fmt-btn ${_shrUrlFormat === 'path' ? 'active' : ''}" onclick="window._shrSetFormat('path')">
              ${SHR_DOMAINS[0]}/<b>code</b>
            </button>
            <button class="shr-fmt-btn ${_shrUrlFormat === 'subdomain' ? 'active' : ''}" onclick="window._shrSetFormat('subdomain')">
              <b>code</b>.${SHR_DOMAINS[0]}
            </button>
          </div>

          <!-- Result -->
          <div class="shr-result" id="shr-result" style="display:none">
            <div class="shr-result-url" id="shr-result-url"></div>
            <button class="btn btn-sm" onclick="window._shrCopyResult()">${_shrT('copy')}</button>
            <button class="btn btn-sm" onclick="window._shrQrResult()">${_shrT('qr_code')}</button>
          </div>
        </div>

        <!-- Tabs -->
        <div class="shr-tabs">
          <button class="shr-tab ${_shrTab === 'links' ? 'active' : ''}" data-tab="links" onclick="window._shrSwitchTab('links')">&#128279; ${_shrT('tabLinks')}</button>
          <button class="shr-tab ${_shrTab === 'campaigns' ? 'active' : ''}" data-tab="campaigns" onclick="window._shrSwitchTab('campaigns')">&#128194; ${_shrT('tabCampaigns')}</button>
          <button class="shr-tab ${_shrTab === 'dashboard' ? 'active' : ''}" data-tab="dashboard" onclick="window._shrSwitchTab('dashboard')">&#128202; ${_shrT('tabDashboard')}</button>
          <button class="shr-tab ${_shrTab === 'bio' ? 'active' : ''}" data-tab="bio" onclick="window._shrSwitchTab('bio')">&#128100; ${_shrT('tabBio')}</button>
        </div>

        <!-- Panel -->
        <div class="shr-panel" id="shr-panel"></div>
      </div>`;

    _shrLoadAll();
  } catch (e) {
    console.error('loadShortener error:', e);
    el.innerHTML = `<div style="text-align:center;padding:40px;color:red">
      <h3>${_shrT('error')}</h3>
      <p>${_shrEsc(e.message)}</p>
      <button class="btn" onclick="loadShortener()">${_shrT('retry')}</button>
    </div>`;
  }
}


// ============================================================
// Bio Hub (standalone page)
// ============================================================

function _bioHubIsRu() {
  return (window.currentLang || 'en') === 'ru';
}

function _bioHubTxt(en, ru) {
  return _bioHubIsRu() ? ru : en;
}

function loadBioHubPage() {
  const root = document.getElementById('bioHubContent');
  if (!root) return;
  window._shrPanelId = null;

  if (!API.isLoggedIn()) {
    root.innerHTML = `<div class="card" style="max-width:760px;margin:20px auto">
      <h3 style="margin:0 0 8px">${_bioHubTxt('Bio Hub', 'Bio Hub')}</h3>
      <p style="margin:0 0 16px;color:var(--text-secondary)">${_bioHubTxt('Please log in to manage your Bio pages.', 'Войдите, чтобы управлять Bio-страницами.')}</p>
      <button class="btn btn-primary" onclick="showLogin()">${_bioHubTxt('Log In', 'Войти')}</button>
    </div>`;
    return;
  }

  if (_bioHubTab !== 'dashboard' && _bioHubTab !== 'pages') _bioHubTab = 'dashboard';

  root.innerHTML = `
    <div class="card" style="margin-bottom:12px">
      <div class="card-header" style="align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div>
          <h3 style="margin:0 0 6px">🌐 Bio Hub</h3>
          <div style="font-size:0.9rem;color:var(--text-secondary)">${_bioHubTxt('Professional workspace for Bio pages, analytics, domains, AI and A/B tests.', 'Профессиональный кабинет для Bio-страниц, аналитики, доменов, AI и A/B тестов.')}</div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="_bioHubQuickCreate()">${_bioHubTxt('Create Page', 'Создать страницу')}</button>
          <button class="btn btn-secondary btn-sm" onclick="_bioHubOpenShortenerBio()">${_bioHubTxt('Open in Shortener', 'Открыть в шортенере')}</button>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">
        <button class="btn btn-sm btn-secondary" id="bioHubTabDashboard" onclick="_bioHubSwitchTab('dashboard')">📊 ${_bioHubTxt('Dashboard', 'Дашборд')}</button>
        <button class="btn btn-sm btn-secondary" id="bioHubTabPages" onclick="_bioHubSwitchTab('pages')">📄 ${_bioHubTxt('Pages Manager', 'Менеджер страниц')}</button>
      </div>
    </div>
    <div id="bioHubPanel"></div>
  `;

  _bioHubUpdateTabButtons();
  _bioHubRenderCurrentTab();
}

window.loadBioHubPage = loadBioHubPage;

function _bioHubUpdateTabButtons() {
  const d = document.getElementById('bioHubTabDashboard');
  const p = document.getElementById('bioHubTabPages');
  if (d) d.classList.toggle('btn-primary', _bioHubTab === 'dashboard');
  if (d) d.classList.toggle('btn-secondary', _bioHubTab !== 'dashboard');
  if (p) p.classList.toggle('btn-primary', _bioHubTab === 'pages');
  if (p) p.classList.toggle('btn-secondary', _bioHubTab !== 'pages');
}

window._bioHubSwitchTab = function(tab) {
  _bioHubTab = tab === 'pages' ? 'pages' : 'dashboard';
  _bioHubUpdateTabButtons();
  _bioHubRenderCurrentTab();
};

window._bioHubSetPeriod = function(period) {
  _bioHubPeriod = period || '30d';
  if (_bioHubTab === 'dashboard') _bioHubRenderCurrentTab();
};

window._bioHubQuickCreate = function() {
  _bioHubTab = 'pages';
  _bioHubUpdateTabButtons();
  _bioHubRenderCurrentTab().then(() => {
    setTimeout(() => { if (window._bioCreatePage) window._bioCreatePage(); }, 60);
  });
};

window._bioHubEditPage = function(pageId) {
  _bioHubTab = 'pages';
  _bioHubUpdateTabButtons();
  _bioHubRenderCurrentTab().then(() => {
    setTimeout(() => { if (window._bioEditPage) window._bioEditPage(pageId); }, 60);
  });
};

window._bioHubShowStats = function(pageId) {
  _bioHubTab = 'pages';
  _bioHubUpdateTabButtons();
  _bioHubRenderCurrentTab().then(() => {
    setTimeout(() => { if (window._bioShowStats) window._bioShowStats(pageId); }, 60);
  });
};

window._bioHubOpenShortenerBio = function() {
  navigateTo('shortener');
  setTimeout(() => { if (window._shrSwitchTab) window._shrSwitchTab('bio'); }, 60);
};

async function _bioHubRenderCurrentTab() {
  const panel = document.getElementById('bioHubPanel');
  if (!panel) return;

  if (_bioHubTab === 'pages') {
    panel.innerHTML = '<div id="bioHubBioPanel"></div>';
    window._shrPanelId = 'bioHubBioPanel';
    await _shrRenderBioManager();
    return;
  }

  window._shrPanelId = null;
  panel.innerHTML = `<div class="card"><div style="text-align:center;padding:26px">${_bioHubTxt('Loading dashboard...', 'Загружаю дашборд...')}</div></div>`;

  try {
    const res = await API.get('/api/shortener/bio/dashboard?period=' + encodeURIComponent(_bioHubPeriod));
    const dash = res.dashboard || {};
    const totals = dash.totals || {};
    const topPages = Array.isArray(dash.top_pages) ? dash.top_pages : [];
    const viewsByDay = Array.isArray(dash.views_by_day) ? dash.views_by_day : [];
    const devices = Array.isArray(dash.devices) ? dash.devices : [];
    const browsers = Array.isArray(dash.browsers) ? dash.browsers : [];
    const maxViews = Math.max(1, ...viewsByDay.map(v => Number(v.views || 0)));

    let html = '';
    html += `<div class="grid-4" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-value">${Number(totals.pages || 0)}</div><div class="stat-label">${_bioHubTxt('Bio Pages', 'Bio-страницы')}</div></div>
      <div class="stat-card"><div class="stat-value">${Number(totals.total_views || 0)}</div><div class="stat-label">${_bioHubTxt('Total Views', 'Всего просмотров')}</div></div>
      <div class="stat-card"><div class="stat-value">${Number(totals.total_clicks || 0)}</div><div class="stat-label">${_bioHubTxt('Total Clicks', 'Всего кликов')}</div></div>
      <div class="stat-card"><div class="stat-value">${Number(totals.ctr || 0).toFixed(1)}%</div><div class="stat-label">CTR</div></div>
    </div>`;

    html += `<div class="grid-2">
      <div class="card">
        <div class="card-header" style="margin-bottom:10px">
          <h3 style="margin:0">${_bioHubTxt('Traffic Trend', 'Динамика трафика')}</h3>
          <select class="form-control" style="max-width:130px" onchange="_bioHubSetPeriod(this.value)">
            <option value="7d" ${_bioHubPeriod === '7d' ? 'selected' : ''}>7d</option>
            <option value="30d" ${_bioHubPeriod === '30d' ? 'selected' : ''}>30d</option>
            <option value="90d" ${_bioHubPeriod === '90d' ? 'selected' : ''}>90d</option>
            <option value="all" ${_bioHubPeriod === 'all' ? 'selected' : ''}>All</option>
          </select>
        </div>
        <div style="height:220px;display:flex;align-items:flex-end;gap:4px;overflow-x:auto;padding:6px 0">
          ${viewsByDay.length ? viewsByDay.map(v => {
            const h = Math.max(8, Math.round((Number(v.views || 0) / maxViews) * 100));
            return `<div title="${_shrEsc(v.day)}: ${Number(v.views || 0)}" style="width:14px;min-width:14px;height:${h}%;background:linear-gradient(180deg,#667eea,#8b5cf6);border-radius:5px"></div>`;
          }).join('') : `<div style="color:var(--text-secondary)">${_bioHubTxt('No data yet', 'Пока нет данных')}</div>`}
        </div>
      </div>
      <div class="card">
        <h3 style="margin:0 0 12px">${_bioHubTxt('Top Pages', 'Топ страниц')}</h3>
        ${topPages.length ? topPages.map(p => {
          const name = _shrEsc(p.page_name || p.display_name || p.username || ('#' + p.id));
          const username = _shrEsc(p.username || '');
          const views = Number(p.total_views || 0);
          const clicks = Number(p.total_clicks || 0);
          const ctr = views > 0 ? ((clicks / views) * 100).toFixed(1) : '0.0';
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="min-width:0">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
              <div style="font-size:0.8rem;color:var(--text-secondary)">@${username} · ${views} views · ${clicks} clicks · CTR ${ctr}%</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-sm btn-secondary" onclick="_bioHubEditPage(${p.id})">${_bioHubTxt('Edit', 'Редактировать')}</button>
              <button class="btn btn-sm btn-secondary" onclick="_bioHubShowStats(${p.id})">${_bioHubTxt('Stats', 'Статистика')}</button>
            </div>
          </div>`;
        }).join('') : `<p style="color:var(--text-secondary);margin:0">${_bioHubTxt('No pages yet. Create your first page.', 'Пока нет страниц. Создай первую страницу.')}</p>`}
      </div>
    </div>`;

    html += `<div class="grid-2" style="margin-top:12px">
      <div class="card">
        <h3 style="margin:0 0 10px">${_bioHubTxt('Devices', 'Устройства')}</h3>
        ${devices.length ? devices.map(d => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${_shrEsc(d.device_type || 'unknown')}</span><strong>${Number(d.c || 0)}</strong></div>`).join('') : `<p style="color:var(--text-secondary);margin:0">${_bioHubTxt('No data', 'Нет данных')}</p>`}
      </div>
      <div class="card">
        <h3 style="margin:0 0 10px">${_bioHubTxt('Browsers', 'Браузеры')}</h3>
        ${browsers.length ? browsers.map(b => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border)"><span>${_shrEsc(b.browser || 'unknown')}</span><strong>${Number(b.c || 0)}</strong></div>`).join('') : `<p style="color:var(--text-secondary);margin:0">${_bioHubTxt('No data', 'Нет данных')}</p>`}
      </div>
    </div>`;

    panel.innerHTML = html;
  } catch (e) {
    panel.innerHTML = `<div class="card"><div style="padding:14px;color:#ef4444">
      ${_bioHubTxt('Failed to load Bio dashboard', 'Не удалось загрузить Bio дашборд')}: ${_shrEsc(e.message || 'error')}
      <div style="margin-top:10px"><button class="btn btn-secondary btn-sm" onclick="_bioHubSwitchTab('dashboard')">${_bioHubTxt('Retry', 'Повторить')}</button></div>
    </div></div>`;
  }
}


// ============================================================
// 2. _shrLoadAll() — Load links + campaigns + tags
// ============================================================

async function _shrLoadAll() {
  try {
    const [linksRes, campRes, tagsRes] = await Promise.all([
      API.get('/api/shortener/links'),
      API.get('/api/shortener/campaigns'),
      API.get('/api/shortener/tags').catch(() => ({ tags: [] }))
    ]);

    // Normalize link fields: API returns destination_url, total_clicks, is_active, campaign_id, created_at
    _shrLinks = (linksRes.links || linksRes || []).map(l => ({
      ...l,
      url: l.destination_url || l.url || '',
      destination: l.destination_url || l.destination || '',
      clicks: l.total_clicks || l.clicks || 0,
      status: (l.expires_at && new Date(l.expires_at) < new Date()) ? 'expired' : (l.is_active ? 'active' : 'inactive'),
      campaignId: l.campaign_id || l.campaignId || null,
      createdAt: l.created_at || l.createdAt || '',
      tags: typeof l.tags === 'string' ? l.tags.split(',').filter(Boolean) : (Array.isArray(l.tags) ? l.tags : [])
    }));
    _shrCampaigns = campRes.campaigns || campRes || [];
    _shrAllTags = (tagsRes.tags || tagsRes || []).map(t => typeof t === 'object' ? t.tag : t);

    // Populate campaign selects
    _shrPopulateCampaignSelects();

    // Render current tab
    _shrRenderTab();
  } catch (e) {
    console.error('_shrLoadAll error:', e);
    showToast(_shrT('load_error') + ': ' + e.message, 'error');
  }
}

function _shrPopulateCampaignSelects() {
  const createSel = document.getElementById('shr-campaign');
  if (createSel) {
    let opts = `<option value="">${_shrT('no_campaign')}</option>`;
    _shrCampaigns.forEach(c => {
      opts += `<option value="${_shrEsc(c.id || c.name)}">${_shrEsc(c.name)}</option>`;
    });
    createSel.innerHTML = opts;
  }
}


// ============================================================
// Tab switching & rendering
// ============================================================

window._shrSwitchTab = function(tab) {
  _shrTab = tab;
  document.querySelectorAll('.shr-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  _shrRenderTab();
};

function _shrRenderTab() {
  const panel = _shrPanelEl();
  if (!panel) return;

  if (_shrTab === 'links') {
    window.shrRenderLinks();
  } else if (_shrTab === 'campaigns') {
    _shrRenderCampaigns();
  } else if (_shrTab === 'dashboard') {
    _shrLoadDashboard();
  } else if (_shrTab === 'bio') {
    _shrRenderBioManager();
  }
}


// ============================================================
// 3. shrCreate() — Create link
// ============================================================

window.shrCreate = async function() {
  const urlInput = document.getElementById('shr-url');
  const url = urlInput ? urlInput.value.trim() : '';
  if (!url) { showToast(_shrT('enter_url'), 'error'); return; }

  const alias = (document.getElementById('shr-alias')?.value || '').trim();
  const campaignId = document.getElementById('shr-campaign')?.value || '';
  const title = (document.getElementById('shr-title')?.value || '').trim();

  // Gather tags
  const tagChips = document.querySelectorAll('#shr-tags-chips .shr-tag-chip');
  const tags = [];
  tagChips.forEach(c => tags.push(c.dataset.tag || c.textContent.replace('\u00D7', '').trim()));

  // UTM
  const utm = {};
  ['source','medium','campaign','term','content'].forEach(k => {
    const v = (document.getElementById('shr-utm-' + k)?.value || '').trim();
    if (v) utm[k] = v;
  });

  const btn = document.getElementById('shr-create-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const body = { destinationUrl: url };
    if (alias) body.customAlias = alias;
    body.domain = _shrSelectedDomain || SHR_DOMAINS[0];
    if (campaignId) body.campaignId = +campaignId;
    if (title) body.title = title;
    // UTM fields
    ['source','medium','campaign','term','content'].forEach(k => {
      if (utm[k]) body['utm_' + k] = utm[k];
    });
    // OG fields
    const ogTitle = (document.getElementById('shr-og-title')?.value || '').trim();
    const ogDesc = (document.getElementById('shr-og-desc')?.value || '').trim();
    const ogImage = (document.getElementById('shr-og-image')?.value || '').trim();
    if (ogTitle) body.og_title = ogTitle;
    if (ogDesc) body.og_description = ogDesc;
    if (ogImage) body.og_image = ogImage;

    const res = await API.post('/api/shortener/links', body);
    if (res.error) { showToast(res.error, 'error'); if (btn) { btn.disabled = false; btn.textContent = _shrT('shorten'); } return; }

    // Save tags after link created
    const linkId = res.link?.id || res.id;
    if (tags.length && linkId) {
      await API.post('/api/shortener/links/' + linkId + '/tags', { tags }).catch(() => {});
    }

    // Show result
    const shortUrl = _shrBuildUrl(res.link?.code || res.code, res.link?.domain || _shrSelectedDomain || SHR_DOMAINS[0]);
    const resultEl = document.getElementById('shr-result');
    const resultUrl = document.getElementById('shr-result-url');
    if (resultEl && resultUrl) {
      resultUrl.textContent = shortUrl;
      resultUrl.dataset.url = shortUrl;
      resultUrl.dataset.linkId = res.link?.id || res.id || '';
      resultEl.style.display = 'flex';
      // Confetti effect
      _shrConfetti(resultEl);
    }

    // Clear inputs
    if (urlInput) urlInput.value = '';
    if (document.getElementById('shr-alias')) document.getElementById('shr-alias').value = '';
    if (document.getElementById('shr-title')) document.getElementById('shr-title').value = '';
    document.getElementById('shr-tags-chips').innerHTML = '';
    ['source','medium','campaign','term','content'].forEach(k => {
      const el = document.getElementById('shr-utm-' + k);
      if (el) el.value = '';
    });
    // Clear OG fields
    ['shr-og-title','shr-og-desc','shr-og-image'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    // Clear preview
    const pw = document.getElementById('shr-preview-wrap');
    if (pw) pw.innerHTML = '';
    _shrPreviewData = null;

    showToast(_shrT('created'), 'success');

    // Reload links
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('create_error'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _shrT('shorten'); }
  }
};


// ============================================================
// Tag input helpers
// ============================================================

window._shrTagKeydown = function(e) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    const input = document.getElementById('shr-tags-input');
    const tag = (input?.value || '').replace(/,/g, '').trim();
    if (!tag) return;
    _shrAddTagChip('shr-tags-chips', tag);
    input.value = '';
  }
};

function _shrAddTagChip(containerId, tag) {
  const container = document.getElementById(containerId);
  if (!container) return;
  // Check duplicate
  const existing = container.querySelectorAll('.shr-tag-chip');
  for (const c of existing) {
    if ((c.dataset.tag || '').toLowerCase() === tag.toLowerCase()) return;
  }
  const chip = document.createElement('span');
  chip.className = 'shr-tag-chip';
  chip.dataset.tag = tag;
  const color = _shrTagColor(tag);
  chip.style.background = color + '20';
  chip.style.color = color;
  chip.style.border = '1px solid ' + color + '40';
  chip.innerHTML = _shrEsc(tag) + ' <span style="cursor:pointer;margin-left:4px" onclick="this.parentElement.remove()">\u00D7</span>';
  container.appendChild(chip);
}


// ============================================================
// UTM & format toggles
// ============================================================

window._shrToggleUtm = function() {
  const fields = document.getElementById('shr-utm-fields');
  const arrow = document.getElementById('shr-utm-arrow');
  if (!fields) return;
  const visible = fields.style.display !== 'none';
  fields.style.display = visible ? 'none' : 'block';
  if (arrow) arrow.textContent = visible ? '\u25B6' : '\u25BC';
};

window._shrSetFormat = function(fmt) {
  _shrUrlFormat = fmt;
  localStorage.setItem('shr_url_format', fmt);
  document.querySelectorAll('.shr-fmt-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.shr-fmt-btn').forEach(b => {
    if ((fmt === 'path' && b.innerHTML.includes(SHR_DOMAINS[0] + '/<b>')) ||
        (fmt === 'subdomain' && b.innerHTML.includes('</b>.' + SHR_DOMAINS[0]))) {
      b.classList.add('active');
    }
  });
};

window._shrCopyResult = function() {
  const el = document.getElementById('shr-result-url');
  if (el) _shrCopyText(el.dataset.url || el.textContent);
};

window._shrQrResult = function() {
  const el = document.getElementById('shr-result-url');
  const url = el && (el.dataset.url || el.textContent.trim());
  if (!url) return;

  // Build QR image URL (qrserver.com — same as used elsewhere in the app)
  const qrImg = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&color=6366f1&bgcolor=0a0e1a&margin=10&data=' + encodeURIComponent(url);
  const qrImgHQ = 'https://api.qrserver.com/v1/create-qr-code/?size=512x512&color=6366f1&bgcolor=0a0e1a&margin=10&data=' + encodeURIComponent(url);

  _shrShowModal(_shrT('qr_code'), `
    <div style="text-align:center">
      <p style="margin-bottom:14px;font-size:0.85rem;color:var(--text-muted);word-break:break-all">${_shrEsc(url)}</p>
      <div style="display:inline-block;padding:12px;background:#0a0e1a;border-radius:12px;border:1px solid rgba(99,102,241,.3)">
        <img src="${qrImg}" alt="QR Code" style="width:260px;height:260px;display:block;border-radius:6px" />
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <a href="${qrImgHQ}" download="qr.png" class="btn btn-primary" style="text-decoration:none">&#8659; PNG (512px)</a>
        <a href="${qrImgHQ}" target="_blank" class="btn btn-secondary" style="text-decoration:none">&#128279; Full size</a>
      </div>
    </div>
  `);
};


// ============================================================
// 4. shrRenderLinks() — Render link list
// ============================================================

window.shrRenderLinks = function() {
  const panel = _shrPanelEl();
  if (!panel) return;

  // Filters bar
  let html = `<div class="shr-filters">
    <input type="text" class="shr-input shr-input-sm" placeholder="${_shrT('search')}" value="${_shrEsc(_shrSearch)}"
      oninput="window._shrSetSearch(this.value)" id="shr-link-search" />
    <select class="shr-input shr-input-sm" onchange="window._shrSetFilterCampaign(this.value)" id="shr-filter-campaign">
      <option value="">${_shrT('all_campaigns')}</option>
      ${_shrCampaigns.map(c => `<option value="${_shrEsc(c.id || c.name)}" ${_shrFilterCampaign === String(c.id || c.name) ? 'selected' : ''}>${_shrEsc(c.name)}</option>`).join('')}
    </select>
    <select class="shr-input shr-input-sm" onchange="window._shrSetFilterTag(this.value)" id="shr-filter-tag">
      <option value="">${_shrT('all_tags')}</option>
      ${_shrAllTags.map(t => `<option value="${_shrEsc(t)}" ${_shrFilterTag === t ? 'selected' : ''}>${_shrEsc(t)}</option>`).join('')}
    </select>
    <select class="shr-input shr-input-sm" onchange="window._shrSetSort(this.value)">
      <option value="newest" ${_shrSort === 'newest' ? 'selected' : ''}>${_shrT('newest')}</option>
      <option value="oldest" ${_shrSort === 'oldest' ? 'selected' : ''}>${_shrT('oldest')}</option>
      <option value="clicks" ${_shrSort === 'clicks' ? 'selected' : ''}>${_shrT('most_clicks')}</option>
      <option value="alpha" ${_shrSort === 'alpha' ? 'selected' : ''}>${_shrT('alphabetical')}</option>
    </select>
    <button class="btn btn-xs shr-filter-pinned ${_shrFilterPinned ? 'active' : ''}" onclick="window._shrTogglePinnedFilter()">&#9733; ${_shrT('pinned_only')}</button>
  </div>`;

  // Bulk toolbar
  const selCount = _shrSelectedIds.size;
  html += `<div class="shr-bulk-bar" id="shr-bulk-bar" style="display:${selCount > 0 ? 'flex' : 'none'}">
    <span class="shr-bulk-count">${selCount} ${_shrT('selected')}</span>
    <button class="btn btn-sm" onclick="window.shrBulkAction('activate')">${_shrT('activate')}</button>
    <button class="btn btn-sm" onclick="window.shrBulkAction('deactivate')">${_shrT('deactivate')}</button>
    <button class="btn btn-sm" onclick="window.shrBulkAction('pin')">&#9733; ${_shrT('pin')}</button>
    <button class="btn btn-sm" onclick="window.shrBulkAction('unpin')">${_shrT('unpin')}</button>
    <button class="btn btn-sm" onclick="window._shrBulkCampaignPrompt()">${_shrT('campaign')}</button>
    <button class="btn btn-sm" onclick="window._shrBulkTagsPrompt()">${_shrT('tags')}</button>
    <button class="btn btn-sm" onclick="window.shrExportCSV()">${_shrT('export_csv')}</button>
    <button class="btn btn-sm btn-danger" onclick="window.shrBulkAction('delete')">${_shrT('delete')}</button>
    ${(selCount >= 2 && selCount <= 4) ? `<button class="btn btn-sm btn-primary" onclick="window.shrOpenCompare()">${_shrT('compare')}</button>` : ''}
  </div>`;

  // Filter links
  let filtered = _shrFilterLinks();

  // Sort
  filtered = _shrSortLinks(filtered);

  if (filtered.length === 0) {
    html += `<div style="text-align:center;padding:40px;color:#999">${_shrT('no_links')}</div>`;
  } else {
    html += '<div class="shr-links-list">';
    filtered.forEach(link => {
      const shortUrl = _shrBuildUrl(link.code, link.domain);
      const isChecked = _shrSelectedIds.has(link.id) ? 'checked' : '';
      const statusClass = link.status === 'active' ? 'shr-badge-active' :
                          link.status === 'expired' ? 'shr-badge-expired' : 'shr-badge-inactive';
      const statusLabel = link.status === 'active' ? _shrT('active') :
                          link.status === 'expired' ? _shrT('expired') : _shrT('inactive');

      const isPinned = link.is_pinned || link.isPinned;

      const _qrMini = 'https://api.qrserver.com/v1/create-qr-code/?size=72x72&data=' + encodeURIComponent(shortUrl) + '&margin=1&bgcolor=ffffff&color=000000';
      html += `<div class="shr-link-row ${isPinned ? 'pinned' : ''}" data-id="${link.id}">
        ${link.og_image ? `<div class="shr-link-og-banner"><img src="${_shrEsc(link.og_image)}" alt="OG" loading="lazy" onerror="this.parentNode.remove()"></div>` : ''}
        <div class="shr-link-top">
          <label class="shr-link-checkbox">
            <input type="checkbox" ${isChecked} onchange="window._shrToggleSelect(${link.id})" />
          </label>
          <button class="shr-pin-btn ${isPinned ? 'pinned' : ''}" onclick="window._shrTogglePin(${link.id})" title="${isPinned ? _shrT('unpin') : _shrT('pin')}">&#9733;</button>
          <div class="shr-link-info">
            <div class="shr-link-short">
              <a href="${_shrEsc(shortUrl)}" target="_blank">${_shrEsc(shortUrl)}</a>
              ${link.title ? `<span class="shr-link-title">${_shrEsc(link.title)}</span>` : ''}
              <span class="shr-badge ${statusClass}">${statusLabel}</span>
              ${isPinned ? `<span class="shr-badge" style="background:#fef3c7;color:#92400e">${_shrT('pinned')}</span>` : ''}
            </div>
            <div class="shr-link-dest" title="${_shrEsc(link.url || link.destination)}">${_shrEsc(_shrTruncate(link.url || link.destination, 80))}</div>
            <div class="shr-link-bottom">
              <div class="shr-link-tags">${_shrRenderTags(link.tags)}</div>
              <span class="shr-link-clicks">&#128202; ${link.clicks || 0} ${_shrT('clicks')}</span>
              <span class="shr-link-time">${_shrTimeAgo(link.createdAt || link.created_at)}</span>
            </div>
          </div>
        </div>
        <div class="shr-link-actions">
          <button class="btn btn-xs" onclick="window._shrCopyLink('${_shrEsc(shortUrl)}')" title="${_shrT('copy')}">&#128203;</button>
          <button class="btn btn-xs" onclick="window.shrOpenStats(${link.id})" title="${_shrT('stats')}">&#128202;</button>
          <button class="btn btn-xs" onclick="window.shrOpenQr(${link.id})" title="${_shrT('qr_code')}">QR</button>
          <button class="btn btn-xs" onclick="window.shrOpenEdit(${link.id})" title="${_shrT('edit')}">&#9999;&#65039;</button>
          <button class="btn btn-xs" onclick="window.shrCloneLink(${link.id})" title="${_shrT('clone')}">&#128196;</button>
          <button class="btn btn-xs" onclick="window.shrOpenRules(${link.id})" title="${_shrT('rules')}">&#9881;&#65039;</button>
          <button class="btn btn-xs btn-danger" onclick="window._shrDeleteLink(${link.id})" title="${_shrT('delete')}">&#128465;&#65039;</button>
        </div>
        <div class="shr-link-qr-mini"><img src="${_qrMini}" alt="QR" loading="lazy" title="${shortUrl}"></div>
      </div>`;
    });
    html += '</div>';
  }

  panel.innerHTML = html;
};

function _shrTruncate(s, max) {
  if (!s) return '';
  return s.length > max ? s.substring(0, max) + '...' : s;
}

function _shrFilterLinks() {
  let result = [..._shrLinks];

  if (_shrSearch) {
    const q = _shrSearch.toLowerCase();
    result = result.filter(l =>
      (l.code || '').toLowerCase().includes(q) ||
      (l.url || l.destination || '').toLowerCase().includes(q) ||
      (l.title || '').toLowerCase().includes(q) ||
      (l.tags || []).some(t => t.toLowerCase().includes(q))
    );
  }

  if (_shrFilterCampaign) {
    result = result.filter(l => String(l.campaignId || l.campaign_id) === _shrFilterCampaign);
  }

  if (_shrFilterTag) {
    result = result.filter(l => (l.tags || []).includes(_shrFilterTag));
  }

  if (_shrFilterPinned) {
    result = result.filter(l => l.is_pinned || l.isPinned);
  }

  return result;
}

function _shrSortLinks(links) {
  const sorted = [...links];
  switch (_shrSort) {
    case 'newest':
      sorted.sort((a, b) => new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0));
      break;
    case 'oldest':
      sorted.sort((a, b) => new Date(a.createdAt || a.created_at || 0) - new Date(b.createdAt || b.created_at || 0));
      break;
    case 'clicks':
      sorted.sort((a, b) => (b.clicks || b.total_clicks || 0) - (a.clicks || a.total_clicks || 0));
      break;
    case 'alpha':
      sorted.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      break;
  }
  return sorted;
}

// Filter/sort setters
window._shrSetSearch = function(v) { _shrSearch = v; window.shrRenderLinks(); };
window._shrSetFilterCampaign = function(v) { _shrFilterCampaign = v; window.shrRenderLinks(); };
window._shrSetFilterTag = function(v) { _shrFilterTag = v; window.shrRenderLinks(); };
window._shrSetSort = function(v) { _shrSort = v; window.shrRenderLinks(); };

// Checkbox / selection
window._shrToggleSelect = function(id) {
  if (_shrSelectedIds.has(id)) {
    _shrSelectedIds.delete(id);
  } else {
    _shrSelectedIds.add(id);
  }
  _shrUpdateBulkBar();
};

function _shrUpdateBulkBar() {
  const bar = document.getElementById('shr-bulk-bar');
  if (!bar) return;
  const count = _shrSelectedIds.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  const countSpan = bar.querySelector('.shr-bulk-count');
  if (countSpan) countSpan.textContent = count + ' ' + _shrT('selected');

  // Show/hide compare button
  const compareExists = bar.querySelector('[onclick*="shrOpenCompare"]');
  if (count >= 2 && count <= 4) {
    if (!compareExists) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.onclick = () => window.shrOpenCompare();
      btn.textContent = _shrT('compare');
      bar.appendChild(btn);
    }
  } else if (compareExists) {
    compareExists.remove();
  }
}

window._shrCopyLink = function(url) { _shrCopyText(url); };

window._shrDeleteLink = async function(id) {
  if (!confirm(_shrT('confirm_delete'))) return;
  try {
    await API.del('/api/shortener/links/' + id);
    showToast(_shrT('deleted'), 'success');
    _shrSelectedIds.delete(id);
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('delete_error'), 'error');
  }
};


// ============================================================
// 5. _shrRenderCampaigns() — Campaign cards grid
// ============================================================

function _shrRenderCampaigns() {
  const panel = _shrPanelEl();
  if (!panel) return;

  let html = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
    <h3>${_shrT('campaigns')}</h3>
    <button class="btn btn-primary btn-sm" onclick="window._shrCreateCampaign()">${_shrT('new_campaign')}</button>
  </div>`;

  if (_shrCampaigns.length === 0) {
    html += `<div class="shr-empty-state">
      <div class="shr-empty-state-icon">&#128194;</div>
      <div class="shr-empty-state-title">${_shrT('no_campaigns')}</div>
      <div class="shr-empty-state-text">${_shrT('campaigns') || 'Campaigns'}</div>
      <button class="btn btn-primary" style="margin-top:16px" onclick="window._shrCreateCampaign()">+ ${_shrT('new_campaign')}</button>
    </div>`;
  } else {
    html += '<div class="shr-campaigns-grid">';
    _shrCampaigns.forEach((c, i) => {
      const color = SHR_COLORS[i % SHR_COLORS.length];
      const linkCount = _shrLinks.filter(l => String(l.campaignId || l.campaign_id) === String(c.id)).length;
      const totalClicks = _shrLinks
        .filter(l => String(l.campaignId || l.campaign_id) === String(c.id))
        .reduce((sum, l) => sum + (l.clicks || 0), 0);

      html += `<div class="shr-campaign-card" style="border-top:3px solid ${color};cursor:pointer" onclick="window._shrOpenCampaignLinks(${c.id}, '${_shrEsc(c.name)}')">
        <div class="shr-campaign-name">${_shrEsc(c.name)}</div>
        ${c.description ? `<div class="shr-campaign-desc">${_shrEsc(c.description)}</div>` : ''}
        <div class="shr-campaign-stats">
          <span>&#128279; ${linkCount} ${_shrT('links')}</span>
          <span>&#128202; ${totalClicks} ${_shrT('clicks')}</span>
        </div>
        <div class="shr-campaign-actions" onclick="event.stopPropagation()">
          <button class="btn btn-xs btn-primary" onclick="window._shrOpenCampaignLinks(${c.id}, '${_shrEsc(c.name)}')">&#128279; ${_shrT('links')}</button>
          <button class="btn btn-xs" onclick="window._shrEditCampaign(${c.id})">${_shrT('edit')}</button>
          <button class="btn btn-xs btn-danger" onclick="window._shrDeleteCampaign(${c.id})">${_shrT('delete')}</button>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  panel.innerHTML = html;
}

window._shrOpenCampaignLinks = function(campaignId, campaignName) {
  // Switch to links tab and filter by this campaign
  _shrTab = 'links';
  _shrFilterCampaign = String(campaignId);

  // Re-render the full shortener UI with links tab active + campaign filter
  const panel = _shrPanelEl();
  const tabs = document.querySelectorAll('.shr-tab');
  tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'links'));

  // Show campaign header banner
  window.shrRenderLinks();

  // After render, inject campaign header at top of panel and set dropdown
  setTimeout(function() {
    const filterSel = document.getElementById('shr-filter-campaign');
    if (filterSel) {
      filterSel.value = String(campaignId);
    }
    // Add campaign context banner at top
    const panel = _shrPanelEl();
    if (panel) {
      const banner = document.createElement('div');
      banner.id = 'shr-campaign-banner';
      banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.3);border-radius:10px;margin-bottom:14px;font-size:0.9rem;';
      banner.innerHTML = '&#128194; <strong>' + campaignName + '</strong>' +
        '<span style="color:var(--text-muted);margin-left:4px">' +
          '— ' + _shrLinks.filter(function(l){ return String(l.campaignId || l.campaign_id) === String(campaignId); }).length + ' ссылок' +
        '</span>' +
        '<button class="btn btn-xs" style="margin-left:auto" onclick="window._shrSetFilterCampaign(\'\');document.getElementById(\'shr-campaign-banner\')?.remove()">✕ Все ссылки</button>';
      const existing = document.getElementById('shr-campaign-banner');
      if (existing) existing.remove();
      panel.insertBefore(banner, panel.firstChild);
    }
  }, 50);
};

window._shrCreateCampaign = async function() {
  const name = prompt(_shrT('campaign_name'));
  if (!name) return;
  const description = prompt(_shrT('campaign_description')) || '';
  try {
    await API.post('/api/shortener/campaigns', { name, description });
    showToast(_shrT('campaign_created'), 'success');
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrEditCampaign = async function(id) {
  const camp = _shrCampaigns.find(c => c.id === id);
  if (!camp) return;
  const name = prompt(_shrT('campaign_name'), camp.name);
  if (!name) return;
  const description = prompt(_shrT('campaign_description'), camp.description || '') || '';
  try {
    await API.put('/api/shortener/campaigns/' + id, { name, description });
    showToast(_shrT('updated'), 'success');
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrDeleteCampaign = async function(id) {
  if (!confirm(_shrT('confirm_delete'))) return;
  try {
    await API.del('/api/shortener/campaigns/' + id);
    showToast(_shrT('deleted'), 'success');
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};


// ============================================================
// 6. shrOpenEdit(id) — Edit link modal
// ============================================================

window.shrOpenEdit = async function(id) {
  const link = _shrLinks.find(l => l.id === id);
  if (!link) { showToast(_shrT('not_found'), 'error'); return; }

  const body = `
    <div class="shr-edit-form">
      <label style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${_shrT('destination')}</span>
        <span id="shr-rot-info" style="font-size:11px;color:#94a3b8;font-weight:400"></span>
      </label>
      <div id="shr-edit-url-list" class="shr-url-list"></div>
      <button type="button" class="shr-add-url-btn" onclick="window._shrAddUrlRow()" style="margin-top:6px;padding:8px 14px;background:linear-gradient(135deg,rgba(99,102,241,.15),rgba(34,211,238,.10));border:1px dashed rgba(99,102,241,.4);border-radius:8px;color:#a5b4fc;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;gap:6px">+ Add URL (rotator)</button>
      <input type="url" id="shr-edit-url" style="display:none" />

      <label>${_shrT('title_optional')}</label>
      <input type="text" id="shr-edit-title" class="shr-input" value="${_shrEsc(link.title || '')}" />

      <label>${_shrT('campaign')}</label>
      <select id="shr-edit-campaign" class="shr-input">
        <option value="">${_shrT('no_campaign')}</option>
        ${_shrCampaigns.map(c => `<option value="${_shrEsc(c.id || c.name)}" ${String(link.campaignId || link.campaign_id) === String(c.id) ? 'selected' : ''}>${_shrEsc(c.name)}</option>`).join('')}
      </select>

      <label>${_shrT('status')}</label>
      <select id="shr-edit-status" class="shr-input">
        <option value="active" ${link.status === 'active' ? 'selected' : ''}>${_shrT('active')}</option>
        <option value="inactive" ${link.status === 'inactive' ? 'selected' : ''}>${_shrT('inactive')}</option>
      </select>

      <label>${_shrT('expiry')}</label>
      <input type="datetime-local" id="shr-edit-expiry" class="shr-input" value="${(link.expires_at || link.expiresAt) ? (link.expires_at || link.expiresAt).slice(0, 16) : ''}" />

      <label>${_shrT('password')} (${_shrT('optional')})</label>
      <input type="text" id="shr-edit-password" class="shr-input" value="${_shrEsc(link.password || '')}" placeholder="${_shrT('leave_empty')}" />

      <label style="display:flex;align-items:center;gap:10px;margin-top:14px;padding:10px 12px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.18);border-radius:10px;cursor:pointer">
        <input type="checkbox" id="shr-edit-splash" ${(link.splash_enabled === undefined ? true : link.splash_enabled) ? 'checked' : ''} style="width:18px;height:18px;accent-color:#6366f1">
        <div style="flex:1">
          <div style="font-weight:600;color:#e2e8f0;font-size:13px">Splash-page (preloader)</div>
          <div style="font-size:11px;color:#94a3b8;margin-top:2px">Show branded loading page on slow redirects</div>
        </div>
      </label>

      <div class="shr-utm-section" style="margin-top:12px">
        <button class="shr-utm-toggle" onclick="document.getElementById('shr-edit-utm').style.display = document.getElementById('shr-edit-utm').style.display === 'none' ? 'block' : 'none'">
          \u25B6 UTM ${_shrT('parameters')}
        </button>
        <div id="shr-edit-utm" style="display:none;margin-top:8px">
          <input type="text" id="shr-edit-utm-source" class="shr-input shr-input-sm" placeholder="utm_source" value="${_shrEsc(link.utm_source || '')}" />
          <input type="text" id="shr-edit-utm-medium" class="shr-input shr-input-sm" placeholder="utm_medium" value="${_shrEsc(link.utm_medium || '')}" style="margin-top:6px" />
          <input type="text" id="shr-edit-utm-campaign" class="shr-input shr-input-sm" placeholder="utm_campaign" value="${_shrEsc(link.utm_campaign || '')}" style="margin-top:6px" />
          <input type="text" id="shr-edit-utm-term" class="shr-input shr-input-sm" placeholder="utm_term" value="${_shrEsc(link.utm_term || '')}" style="margin-top:6px" />
          <input type="text" id="shr-edit-utm-content" class="shr-input shr-input-sm" placeholder="utm_content" value="${_shrEsc(link.utm_content || '')}" style="margin-top:6px" />
        </div>
      </div>

      <label style="margin-top:12px">${_shrT('tags')}</label>
      <div class="shr-tags-input">
        <div id="shr-edit-tags-chips">${(link.tags || []).map(t =>
          `<span class="shr-tag-chip" data-tag="${_shrEsc(t)}" style="background:${_shrTagColor(t)}20;color:${_shrTagColor(t)};border:1px solid ${_shrTagColor(t)}40">${_shrEsc(t)} <span style="cursor:pointer;margin-left:4px" onclick="this.parentElement.remove()">\u00D7</span></span>`
        ).join('')}</div>
        <input type="text" id="shr-edit-tags-input" class="shr-input shr-input-sm" placeholder="${_shrT('add_tags')}"
          onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();window._shrAddEditTag()}" />
      </div>

      <details class="shr-og-section" style="margin-top:12px" ${(link.og_title || link.og_description || link.og_image) ? 'open' : ''}>
        <summary>${_shrT('og_section')}</summary>
        <div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
          <input type="text" id="shr-edit-og-title" class="shr-input shr-input-sm" placeholder="${_shrT('og_title')}" value="${_shrEsc(link.og_title || '')}" />
          <input type="text" id="shr-edit-og-desc" class="shr-input shr-input-sm" placeholder="${_shrT('og_description')}" value="${_shrEsc(link.og_description || '')}" />
          <div class="shr-og-image-wrap">
            ${link.og_image && link.og_image.startsWith('data:')
              ? `<div class="shr-og-image-preview"><img src="${_shrEsc(link.og_image)}" alt="OG"><button type="button" class="shr-og-clear-btn" onclick="document.getElementById('shr-edit-og-image').value='';this.parentNode.remove();document.getElementById('shr-edit-og-image').style.display=''">&times;</button></div><input type="url" id="shr-edit-og-image" class="shr-input shr-input-sm" placeholder="${_shrT('og_image')}" value="${_shrEsc(link.og_image)}" style="display:none">`
              : `<input type="url" id="shr-edit-og-image" class="shr-input shr-input-sm" placeholder="${_shrT('og_image')}" value="${_shrEsc(link.og_image || '')}">`
            }
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
            <button type="button" class="btn btn-sm shr-og-gen-btn" onclick="window._shrOpenOgGen('shr-edit-og-image','shr-edit-og-title','shr-edit-og-desc')">&#127912; Создать OG-изображение</button>
            <button type="button" class="btn btn-sm shr-og-gen-btn" onclick="window._shrOpenQrCard('shr-edit-og-image','${_shrEsc(_shrBuildUrl(link.code,link.domain)||link.url||link.destination||'')}')">&#128241; QR-карточка как OG</button>
          </div>
        </div>
      </details>

      <div class="shr-bio-toggle-card">
        <div class="shr-bio-toggle-left">
          <div class="shr-bio-toggle-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="15" x2="12" y2="15"/></svg>
          </div>
          <div>
            <div class="shr-bio-toggle-title">${_shrT('show_on_bio')}</div>
            <div class="shr-bio-toggle-desc">${window.currentLang === 'ru' ? 'Добавить ссылку на вашу Bio-страницу' : 'Add this link to your Bio page'}</div>
          </div>
        </div>
        <label class="shr-bio-toggle">
          <input type="checkbox" id="shr-edit-bio-visible" ${link.is_bio_visible ? 'checked' : ''}>
          <span class="toggle-track"></span>
        </label>
      </div>

      <div style="margin-top:16px;text-align:right">
        <button class="btn" onclick="window._shrCloseModal()">${_shrT('cancel')}</button>
        <button class="btn btn-primary" onclick="window._shrSaveEdit(${id})">${_shrT('save')}</button>
      </div>
    </div>`;

  _shrShowModal(_shrT('edit_link') + ': ' + _shrEsc(link.code), body);
  setTimeout(function(){ if (window._shrInitUrlRows) window._shrInitUrlRows(link); }, 30);
};

window._shrAddEditTag = function() {
  const input = document.getElementById('shr-edit-tags-input');
  const tag = (input?.value || '').replace(/,/g, '').trim();
  if (!tag) return;
  _shrAddTagChip('shr-edit-tags-chips', tag);
  input.value = '';
};


// === URL rotator helpers ===
window._shrAddUrlRow = function(initialValue) {
  var list = document.getElementById('shr-edit-url-list');
  if (!list) return;
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px';
  var num = document.createElement('span');
  num.className = 'shr-url-num';
  num.style.cssText = 'flex:0 0 24px;height:32px;display:flex;align-items:center;justify-content:center;background:rgba(99,102,241,.14);color:#a5b4fc;border-radius:6px;font-size:12px;font-weight:700';
  num.textContent = String(list.children.length + 1);
  var inp = document.createElement('input');
  inp.type = 'url'; inp.className = 'shr-input shr-rot-url';
  inp.placeholder = 'https://...'; inp.value = initialValue || ''; inp.style.flex = '1';
  var rm = document.createElement('button');
  rm.type = 'button';
  rm.style.cssText = 'flex:0 0 32px;height:32px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:6px;color:#fca5a5;cursor:pointer;font-size:14px';
  rm.innerHTML = '&#10005;';
  rm.title = 'Remove';
  rm.onclick = function() {
    if (list.children.length <= 1) { inp.value = ''; window._shrUpdateRotInfo(); return; }
    row.remove(); window._shrRenumber(); window._shrUpdateRotInfo();
  };
  row.appendChild(num); row.appendChild(inp); row.appendChild(rm);
  list.appendChild(row);
  inp.addEventListener('input', window._shrUpdateRotInfo);
  window._shrUpdateRotInfo();
};
window._shrRenumber = function() {
  var list = document.getElementById('shr-edit-url-list'); if (!list) return;
  Array.from(list.children).forEach(function(row, i) {
    var num = row.querySelector('.shr-url-num'); if (num) num.textContent = String(i + 1);
  });
};
window._shrUpdateRotInfo = function() {
  var info = document.getElementById('shr-rot-info'); if (!info) return;
  var urls = Array.from(document.querySelectorAll('#shr-edit-url-list input.shr-rot-url'))
    .map(function(i){return (i.value||'').trim();}).filter(Boolean);
  if (urls.length >= 2) {
    info.innerHTML = '&#x1F504; Rotator: <b style="color:#22d3ee">' + urls.length + ' URLs</b> &mdash; round-robin';
  } else { info.textContent = ''; }
};
window._shrInitUrlRows = function(link) {
  var list = document.getElementById('shr-edit-url-list'); if (!list) return;
  list.innerHTML = '';
  var urls = [];
  if (link.destination_urls) { try { urls = JSON.parse(link.destination_urls); } catch(e) {} }
  if (!Array.isArray(urls) || !urls.length) {
    urls = [link.url || link.destination_url || link.destination || ''];
  }
  urls.forEach(function(u){ window._shrAddUrlRow(u); });
};

window._shrSaveEdit = async function(id) {
  const urlInputs = Array.from(document.querySelectorAll('#shr-edit-url-list input.shr-rot-url'));
  const allUrls = urlInputs.map(i => (i.value || '').trim()).filter(Boolean);
  const url = allUrls[0] || (document.getElementById('shr-edit-url')?.value || '').trim();
  if (!url) { showToast(_shrT('enter_url') || 'URL required', 'error'); return; }
  const splashEnabled = document.getElementById('shr-edit-splash')?.checked ? 1 : 0;
  const destinationUrls = allUrls.length >= 2 ? allUrls : null;

  const title = (document.getElementById('shr-edit-title')?.value || '').trim();
  const campaignId = document.getElementById('shr-edit-campaign')?.value || '';
  const status = document.getElementById('shr-edit-status')?.value || 'active';
  const expiresAt = document.getElementById('shr-edit-expiry')?.value || null;
  const password = (document.getElementById('shr-edit-password')?.value || '').trim() || null;

  // Tags
  const tagChips = document.querySelectorAll('#shr-edit-tags-chips .shr-tag-chip');
  const tags = [];
  tagChips.forEach(c => tags.push(c.dataset.tag || c.textContent.replace('\u00D7', '').trim()));

  // UTM
  const utm = {};
  ['source','medium','campaign','term','content'].forEach(k => {
    const v = (document.getElementById('shr-edit-utm-' + k)?.value || '').trim();
    if (v) utm[k] = v;
  });

  try {
    const body = {
      destinationUrl: url,
      destinationUrls: destinationUrls,
      splashEnabled: splashEnabled,
      title,
      campaignId: campaignId ? +campaignId : null,
      isActive: status === 'active' ? 1 : 0,
      expiresAt: expiresAt || null,
      password: password || null
    };
    // UTM fields
    ['source','medium','campaign','term','content'].forEach(k => {
      body['utm_' + k] = utm[k] || null;
    });
    // OG fields
    body.og_title = (document.getElementById('shr-edit-og-title')?.value || '').trim() || null;
    body.og_description = (document.getElementById('shr-edit-og-desc')?.value || '').trim() || null;
    body.og_image = (document.getElementById('shr-edit-og-image')?.value || '').trim() || null;
    // Bio visible
    body.is_bio_visible = document.getElementById('shr-edit-bio-visible')?.checked ? 1 : 0;

    await API.put('/api/shortener/links/' + id, body);
    // Save tags
    if (tags.length || true) {
      await API.post('/api/shortener/links/' + id + '/tags', { tags }).catch(() => {});
    }
    showToast(_shrT('updated'), 'success');
    _shrCloseModal();
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('update_error'), 'error');
  }
};


// ============================================================
// 7. shrOpenStats(id) — ENHANCED stats modal
// ============================================================

window.shrOpenStats = async function(id) {
  const link = _shrLinks.find(l => l.id === id);
  if (!link) { showToast(_shrT('not_found'), 'error'); return; }

  const shortUrl = _shrBuildUrl(link.code, link.domain);
  const body = `<div id="shr-stats-content"><div style="text-align:center;padding:30px">${_shrT('loading')}...</div></div>`;
  _shrShowModal(_shrT('stats') + ': ' + _shrEsc(shortUrl), body, { width: '900px' });

  _shrLoadStatsData(id, '7d');
};

async function _shrLoadStatsData(linkId, period) {
  const container = document.getElementById('shr-stats-content');
  if (!container) return;

  try {
    const [statsRes, advRes] = await Promise.all([
      API.get('/api/shortener/links/' + linkId + '/stats?period=' + period),
      API.get('/api/shortener/links/' + linkId + '/stats/advanced').catch(() => ({}))
    ]);

    const stats = statsRes || {};
    const adv = advRes || {};

    _shrRenderStatsContent(container, linkId, period, stats, adv);
  } catch (e) {
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; } container.innerHTML = `<div style="color:red;padding:20px">${_shrT('error')}: ${_shrEsc(e.message)}</div>`;
  }
}

function _shrRenderStatsContent(container, linkId, period, stats, adv) {
  const periods = [
    { key: 'today', label: _shrT('today') },
    { key: '7d', label: '7 ' + _shrT('days') },
    { key: '30d', label: '30 ' + _shrT('days') },
    { key: 'all', label: _shrT('all_time') }
  ];

  // Summary values
  const totalClicks = stats.totalClicks || stats.total || 0;
  const todayClicks = stats.todayClicks || stats.today || 0;
  const uniqueClicks = stats.uniqueClicks || stats.unique || stats.uniqueIps || 0;
  const dailyData = stats.daily || stats.byDate || stats.clicksByDate || [];
  const avgPerDay = adv.clickVelocity ? adv.clickVelocity.avgPerDay : (dailyData.length > 0 ? Math.round(totalClicks / dailyData.length) : 0);

  // Best hour/day — prefer pre-computed from advanced stats
  const hourly = adv.clicksByHour || adv.hourly || stats.hourly || [];
  const bestHour = adv.clickVelocity ? adv.clickVelocity.bestHour : _shrFindBest(hourly, 'hour', 'count');
  const daily2 = adv.clicksByDayOfWeek || adv.daily || stats.weekday || [];
  const bestDay = adv.clickVelocity ? adv.clickVelocity.bestDay : _shrFindBest(daily2, 'day', 'count');
  const dayNames = [_shrT('sun'), _shrT('mon'), _shrT('tue'), _shrT('wed'), _shrT('thu'), _shrT('fri'), _shrT('sat')];

  let html = '';

  // Period tabs
  html += `<div class="shr-period-tabs">
    ${periods.map(p => `<button class="shr-period-tab ${p.key === period ? 'active' : ''}"
      onclick="window._shrChangePeriod(${linkId}, '${p.key}')">${p.label}</button>`).join('')}
  </div>`;

  // Summary cards
  html += `<div class="shr-stats-summary">
    <div class="shr-stat-card">
      <span class="num">${totalClicks}</span>
      <div class="label">${_shrT('total_clicks')}</div>
    </div>
    <div class="shr-stat-card">
      <span class="num">${todayClicks}</span>
      <div class="label">${_shrT('today')}</div>
    </div>
    <div class="shr-stat-card">
      <span class="num">${uniqueClicks}</span>
      <div class="label">${_shrT('unique')}</div>
    </div>
    <div class="shr-stat-card">
      <span class="num">${typeof avgPerDay === 'number' ? avgPerDay : 0}</span>
      <div class="label">${_shrT('avg_per_day')}</div>
    </div>
    <div class="shr-stat-card">
      <span class="num">${bestHour !== null && bestHour !== undefined ? bestHour + ':00' : '-'}</span>
      <div class="label">${_shrT('best_hour')}</div>
    </div>
    <div class="shr-stat-card">
      <span class="num">${bestDay !== null && bestDay !== undefined ? (dayNames[bestDay] || bestDay) : '-'}</span>
      <div class="label">${_shrT('best_day')}</div>
    </div>
  </div>`;

  // Chart toggle + chart
  html += `<div class="shr-chart-wrap">
    <div class="shr-chart-toggle">
      <button id="shr-chart-bar-btn" class="btn btn-xs active" onclick="window._shrToggleChartType('bar', ${linkId})">${_shrT('bar')}</button>
      <button id="shr-chart-line-btn" class="btn btn-xs" onclick="window._shrToggleChartType('line', ${linkId})">${_shrT('line')}</button>
    </div>
    <canvas id="shr-stats-chart" height="200"></canvas>
  </div>`;

  // Heatmap (day-of-week x hour)
  html += _shrBuildHeatmap(adv.hourlyHeatmap || adv.heatmap || hourly, dayNames);

  // Breakdown sections
  html += '<div class="shr-breakdown-grid">';
  html += _shrBuildBreakdownSection(_shrT('referrers'), adv.referrers || stats.referrers || [], 'referrer', _shrReferrerEmoji);
  html += _shrBuildBreakdownSection(_shrT('devices'), adv.devices || stats.devices || [], 'device', _shrDeviceEmoji);
  html += _shrBuildBreakdownSection(_shrT('browsers'), adv.browsers || stats.browsers || [], 'browser', _shrBrowserIcon);
  html += _shrBuildBreakdownSection(_shrT('os'), adv.os || stats.os || [], 'os');
  html += _shrBuildBreakdownSection(_shrT('countries'), adv.countries || stats.countries || [], 'country', function(c) { return _shrFlag(c); });
  html += _shrBuildBreakdownSection(_shrT('languages'), adv.languages || stats.languages || [], 'language');
  html += _shrBuildBreakdownSection(_shrT('cities'), adv.cities || stats.cities || [], 'city');
  html += '</div>';

  // Export button
  html += `<div style="text-align:right;margin-top:16px">
    <button class="btn btn-sm" onclick="window._shrExportStatsCSV(${linkId}, '${period}')">${_shrT('export_csv')}</button>
  </div>`;

  container.innerHTML = html;

  // Render chart (prefer adv.clickTrend for 30-day trend)
  const chartData = adv.clickTrend && adv.clickTrend.length ? adv.clickTrend : dailyData;
  _shrRenderChart(chartData, 'bar');
}

function _shrFindBest(arr, keyProp, valProp) {
  if (!arr || !arr.length) return null;
  let best = arr[0], bestVal = 0;
  arr.forEach(item => {
    const val = typeof item === 'object' ? (item[valProp] || item.clicks || 0) : 0;
    if (val > bestVal) { bestVal = val; best = item; }
  });
  return typeof best === 'object' ? (best[keyProp] ?? best.name ?? null) : best;
}

window._shrChangePeriod = function(linkId, period) {
  _shrLoadStatsData(linkId, period);
};

window._shrToggleChartType = function(type, linkId) {
  const canvas = document.getElementById('shr-stats-chart');
  if (!canvas) return;

  document.getElementById('shr-chart-bar-btn')?.classList.toggle('active', type === 'bar');
  document.getElementById('shr-chart-line-btn')?.classList.toggle('active', type === 'line');

  if (_shrStatsChart) {
    _shrStatsChart.config.type = type === 'bar' ? 'bar' : 'line';
    if (type === 'line') {
      _shrStatsChart.data.datasets[0].fill = false;
      _shrStatsChart.data.datasets[0].backgroundColor = 'transparent';
      _shrStatsChart.data.datasets[0].pointRadius = 3;
    } else {
      _shrStatsChart.data.datasets[0].fill = false;
      _shrStatsChart.data.datasets[0].backgroundColor = '#667eea80';
      _shrStatsChart.data.datasets[0].pointRadius = 0;
    }
    _shrStatsChart.update();
  }
};

function _shrRenderChart(dailyData, chartType) {
  if (_shrStatsChart) { _shrStatsChart.destroy(); _shrStatsChart = null; }

  const canvas = document.getElementById('shr-stats-chart');
  if (!canvas || !dailyData || !dailyData.length) return;

  const labels = dailyData.map(d => d.date || d.day || d.label || '');
  const values = dailyData.map(d => d.count || d.clicks || d.value || 0);

  _shrStatsChart = new Chart(canvas.getContext('2d'), {
    type: chartType,
    data: {
      labels: labels,
      datasets: [{
        label: _shrT('clicks'),
        data: values,
        backgroundColor: chartType === 'bar' ? '#667eea80' : 'transparent',
        borderColor: '#667eea',
        borderWidth: 2,
        fill: chartType === 'line',
        tension: 0.3,
        pointRadius: chartType === 'line' ? 3 : 0,
        pointBackgroundColor: '#667eea'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 } },
        x: { ticks: { maxRotation: 45 } }
      }
    }
  });
}

// --- Heatmap builder ---

function _shrBuildHeatmap(heatmapData, dayNames) {
  // heatmapData can be:
  // - 2D array [7][24] (from adv.hourlyHeatmap)
  // - Array of { day: 0-6, hour: 0-23, count: N }
  // - Or just hourly array: [{ hour: 0, count: N }]

  const grid = {}; // "day-hour" -> count
  let maxCount = 0;

  if (Array.isArray(heatmapData) && heatmapData.length === 7 && Array.isArray(heatmapData[0])) {
    // 2D array format [dow][hour]
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const c = heatmapData[d][h] || 0;
        grid[d + '-' + h] = c;
        if (c > maxCount) maxCount = c;
      }
    }
  } else if (Array.isArray(heatmapData)) {
    heatmapData.forEach(item => {
      if (item.day !== undefined && item.hour !== undefined) {
        const key = item.day + '-' + item.hour;
        grid[key] = (grid[key] || 0) + (item.count || item.clicks || 0);
        if (grid[key] > maxCount) maxCount = grid[key];
      } else if (item.hour !== undefined) {
        for (let d = 0; d < 7; d++) {
          const key = d + '-' + item.hour;
          grid[key] = item.count || item.clicks || 0;
          if (grid[key] > maxCount) maxCount = grid[key];
        }
      }
    });
  }

  // Reorder: Mon=1..Sun=0 display as Mon, Tue, ..., Sun
  const dayOrder = [1, 2, 3, 4, 5, 6, 0];
  const dayLabels = [dayNames[1], dayNames[2], dayNames[3], dayNames[4], dayNames[5], dayNames[6], dayNames[0]];

  let html = `<div class="shr-heatmap">
    <h4>${_shrT('click_heatmap')}</h4>
    <div class="shr-heatmap-grid">
      <div class="shr-heatmap-row">
        <div class="shr-heatmap-label"></div>`;
  for (let h = 0; h < 24; h++) {
    html += `<div class="shr-heatmap-label" style="font-size:0.6rem;justify-content:center">${h}</div>`;
  }
  html += '</div>';

  dayOrder.forEach((dayIdx, rowIdx) => {
    html += `<div class="shr-heatmap-row">
        <div class="shr-heatmap-label">${dayLabels[rowIdx]}</div>`;
    for (let h = 0; h < 24; h++) {
      const count = grid[dayIdx + '-' + h] || 0;
      const intensity = maxCount > 0 ? count / maxCount : 0;
      const alpha = Math.round(intensity * 100) / 100;
      const bg = count > 0 ? `rgba(102, 126, 234, ${0.1 + alpha * 0.9})` : 'rgba(102, 126, 234, 0.03)';
      html += `<div class="shr-heatmap-cell" style="background:${bg}" title="${dayLabels[rowIdx]} ${h}:00 - ${count} ${_shrT('clicks')}">${count > 0 ? count : ''}</div>`;
    }
    html += '</div>';
  });

  html += '    </div></div>';
  return html;
}

// --- Breakdown section builder ---

function _shrBuildBreakdownSection(title, data, nameKey, iconFn) {
  if (!data || !data.length) return '';

  const maxVal = Math.max(...data.map(d => d.count || d.clicks || d.value || 0));
  const total = data.reduce((s, d) => s + (d.count || d.clicks || d.value || 0), 0);

  let html = `<div class="shr-breakdown-section">
    <h4>${title}</h4>`;
  data.slice(0, 10).forEach((item, i) => {
    const name = item[nameKey] || item.name || item.label || _shrT('unknown');
    const count = item.count || item.clicks || item.value || 0;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const icon = iconFn ? iconFn(name) : '';
    const color = SHR_COLORS[i % SHR_COLORS.length];

    html += `<div class="shr-bd-row">
      <span class="shr-bd-name">${icon ? icon + ' ' : ''}${_shrEsc(name)}</span>
      <span class="shr-bd-count">${count} (${pct}%)</span>
      ${_shrPercentBar(count, maxVal, color)}
    </div>`;
  });
  html += '</div>';
  return html;
}

window._shrExportStatsCSV = async function(linkId, period) {
  try {
    const res = await API.get('/api/shortener/links/' + linkId + '/stats/export?period=' + period);
    if (res.csv || res.data) {
      _shrDownloadCSV(res.csv || res.data, 'stats-' + linkId + '.csv');
    } else {
      showToast(_shrT('no_data'), 'info');
    }
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

function _shrDownloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// ============================================================
// 8. shrOpenCompare() — Comparison modal
// ============================================================

window.shrOpenCompare = async function() {
  const ids = Array.from(_shrSelectedIds);
  if (ids.length < 2 || ids.length > 4) {
    showToast(_shrT('select_2_4'), 'error');
    return;
  }

  const body = `<div id="shr-compare-content"><div style="text-align:center;padding:30px">${_shrT('loading')}...</div></div>`;
  _shrShowModal(_shrT('compare_links'), body, { width: '950px' });

  try {
    const res = await API.post('/api/shortener/compare', { linkIds: ids });
    _shrRenderCompareContent(res);
  } catch (e) {
    const el = document.getElementById('shr-compare-content');
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; } if (el) el.innerHTML = `<div style="color:red;padding:20px">${_shrT('error')}: ${_shrEsc(e.message)}</div>`;
  }
};

function _shrRenderCompareContent(data) {
  const container = document.getElementById('shr-compare-content');
  if (!container) return;

  const links = data.links || data.results || [];
  if (!links.length) {
    container.innerHTML = `<div style="padding:20px">${_shrT('no_data')}</div>`;
    return;
  }

  let html = '';

  // Metrics table
  html += '<div class="shr-compare-table"><table><thead><tr><th></th>';
  links.forEach((l, i) => {
    html += `<th style="color:${SHR_COLORS[i % SHR_COLORS.length]}">${_shrEsc(l.code || l.link?.code || '')}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Rows: Total Clicks, Unique, Avg/Day
  const metrics = [
    { key: 'totalClicks', label: _shrT('total_clicks'), extract: l => l.totalClicks || l.total || l.stats?.totalClicks || 0 },
    { key: 'unique', label: _shrT('unique'), extract: l => l.uniqueClicks || l.unique || l.stats?.unique || 0 },
    { key: 'avg', label: _shrT('avg_per_day'), extract: l => l.avgPerDay || l.avg || l.stats?.avgPerDay || 0 }
  ];

  metrics.forEach(m => {
    const values = links.map(l => m.extract(l));
    const maxVal = Math.max(...values);

    html += `<tr><td><strong>${m.label}</strong></td>`;
    values.forEach(v => {
      const isWinner = v === maxVal && maxVal > 0;
      html += `<td>${isWinner ? '<span class="shr-compare-winner">' : ''}${v}${isWinner ? ' \u{1F3C6}</span>' : ''}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  // Overlay chart
  html += '<div class="shr-chart-wrap"><canvas id="shr-compare-chart" height="250"></canvas></div>';

  // Device/Browser/Country comparison
  html += '<div class="shr-breakdown-grid">';
  ['devices', 'browsers', 'countries'].forEach(category => {
    html += `<div class="shr-breakdown-section"><h4>${_shrT(category)}</h4>`;
    // Gather all unique names
    const allNames = new Set();
    links.forEach(l => {
      const arr = l[category] || l.stats?.[category] || [];
      arr.forEach(item => allNames.add(item.name || item.device || item.browser || item.country || ''));
    });

    allNames.forEach(name => {
      if (!name) return;
      html += `<div class="shr-bd-row"><span class="shr-bd-name">${category === 'countries' ? _shrFlag(name) + ' ' : ''}${_shrEsc(name)}</span>`;
      links.forEach((l, i) => {
        const arr = l[category] || l.stats?.[category] || [];
        const found = arr.find(item => (item.name || item.device || item.browser || item.country || '') === name);
        const count = found ? (found.count || found.clicks || 0) : 0;
        html += `<span style="color:${SHR_COLORS[i % SHR_COLORS.length]};margin-left:12px;font-weight:600">${count}</span>`;
      });
      html += '</div>';
    });
    html += '</div>';
  });
  html += '</div>';

  container.innerHTML = html;

  // Render overlay chart
  const canvas = document.getElementById('shr-compare-chart');
  if (canvas) {
    const datasets = links.map((l, i) => {
      const daily = l.daily || l.stats?.daily || l.byDate || [];
      return {
        label: l.code || l.link?.code || 'Link ' + (i + 1),
        data: daily.map(d => d.count || d.clicks || 0),
        borderColor: SHR_COLORS[i % SHR_COLORS.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: SHR_COLORS[i % SHR_COLORS.length]
      };
    });

    // Use longest daily array for labels
    let maxLabels = [];
    links.forEach(l => {
      const daily = l.daily || l.stats?.daily || l.byDate || [];
      const labels = daily.map(d => d.date || d.day || d.label || '');
      if (labels.length > maxLabels.length) maxLabels = labels;
    });

    new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels: maxLabels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }
}



// ============================================================
// Shortener: OG Image Generator + QR Card Generator
// ============================================================
const _SHR_OG_API = '/api/og-suite';

window._shrOpenOgGen = async function(imgInputId, titleInputId, descInputId) {
  const titleVal = (document.getElementById(titleInputId)?.value || '').trim();
  const descVal  = (document.getElementById(descInputId)?.value  || '').trim();
  _shrShowModal('\u{1F3A8} \u0421\u043e\u0437\u0434\u0430\u0442\u044c OG-\u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435', '<div id="shr-og-gen-body" style="min-height:120px;display:flex;align-items:center;justify-content:center"><span>\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430 \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432...</span></div>');
  try {
    const res = await API.get(_SHR_OG_API + '/templates');
    const templates = Array.isArray(res) ? res : (res.templates || []);
    if (!templates.length) throw new Error('\u041d\u0435\u0442 \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432');
    window._shrOggTpl = templates[0].id || templates[0].templateId || templates[0].name || '';
    let tplHtml = '';
    templates.forEach((t, i) => {
      const tid = t.id || t.templateId || t.name || '';
      const sel = i === 0 ? 'var(--primary,#6366f1)' : '#444';
      tplHtml += '<div class="shr-ogg-tpl' + (i===0?' selected':'') + '" data-tid="' + _shrEsc(tid) + '" onclick="window._shrOggSelect(this)" style="cursor:pointer;border:2px solid ' + sel + ';border-radius:8px;overflow:hidden;aspect-ratio:1.91/1;background:#111"><img src="' + _SHR_OG_API + '/render/' + encodeURIComponent(tid) + '?format=png&sizePreset=og" style="width:100%;height:100%;object-fit:cover" loading="lazy"></div>';
    });
    const body = '<div style="display:flex;flex-direction:column;gap:12px">'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + '<input type="text" id="shr-ogg-title" class="shr-input shr-input-sm" placeholder="\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a" value="' + _shrEsc(titleVal) + '" style="flex:1;min-width:120px" oninput="window._shrOggPreview()">'
      + '<input type="text" id="shr-ogg-desc"  class="shr-input shr-input-sm" placeholder="\u041e\u043f\u0438\u0441\u0430\u043d\u0438\u0435"  value="' + _shrEsc(descVal)  + '" style="flex:1;min-width:120px" oninput="window._shrOggPreview()">'
      + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;max-height:180px;overflow-y:auto" id="shr-ogg-tpls">' + tplHtml + '</div>'
      + '<div style="border-radius:10px;overflow:hidden;aspect-ratio:1.91/1;background:#111"><img id="shr-ogg-pimg" src="" style="width:100%;height:100%;object-fit:cover"></div>'
      + '<div style="text-align:right;display:flex;gap:8px;justify-content:flex-end">'
      + '<button class="btn" onclick="window._shrCloseModal()">\u041e\u0442\u043c\u0435\u043d\u0430</button>'
      + '<button class="btn btn-primary" onclick="window._shrOggConfirm(\'' + _shrEsc(imgInputId) + '\')">\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u043a\u0430\u043a OG</button>'
      + '</div></div>';
    document.getElementById('shr-og-gen-body').innerHTML = body;
    window._shrOggPreview();
  } catch(e) {
    const b = document.getElementById('shr-og-gen-body');
    if(b) b.innerHTML = '<p style="color:red;padding:16px">' + _shrEsc(e.message) + '</p>';
  }
};

window._shrOggSelect = function(el) {
  document.querySelectorAll('.shr-ogg-tpl').forEach(t => { t.style.borderColor='#444'; t.classList.remove('selected'); });
  el.style.borderColor = 'var(--primary,#6366f1)'; el.classList.add('selected');
  window._shrOggTpl = el.dataset.tid;
  window._shrOggPreview();
};

window._shrOggPreview = function() {
  const tpl = window._shrOggTpl; if (!tpl) return;
  const title = document.getElementById('shr-ogg-title')?.value || '';
  const desc  = document.getElementById('shr-ogg-desc')?.value  || '';
  const q = new URLSearchParams({ format:'png', sizePreset:'og', t: Date.now() });
  if (title) q.set('title', title);
  if (desc)  q.set('subtitle', desc);
  const img = document.getElementById('shr-ogg-pimg');
  if (img) img.src = _SHR_OG_API + '/render/' + encodeURIComponent(tpl) + '?' + q;
};

window._shrOggConfirm = function(imgInputId) {
  const tpl = window._shrOggTpl; if (!tpl) return;
  const title = document.getElementById('shr-ogg-title')?.value || '';
  const desc  = document.getElementById('shr-ogg-desc')?.value  || '';
  const q = new URLSearchParams({ format:'png', sizePreset:'og' });
  if (title) q.set('title', title);
  if (desc)  q.set('subtitle', desc);
  const url = location.origin + _SHR_OG_API + '/render/' + encodeURIComponent(tpl) + '?' + q;
  const inp = document.getElementById(imgInputId);
  if (inp) { inp.value = url; inp.dispatchEvent(new Event('input')); }
  window._shrCloseModal();
  showToast('OG-\u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u0434\u043e\u0431\u0430\u0432\u043b\u0435\u043d\u043e', 'success');
};

// QR Card as OG Image (canvas-based)
const _SHR_QR_SCHEMES = [
  { id:'dark',   bg1:'#0f0f1a', bg2:'#1a1a3e', text:'#ffffff', accent:'#7c3aed', qrBg:'#ffffff', qrFg:'#000000' },
  { id:'purple', bg1:'#1a0540', bg2:'#2d0b6b', text:'#ffffff', accent:'#c084fc', qrBg:'#ffffff', qrFg:'#1a0540' },
  { id:'blue',   bg1:'#0c1a3e', bg2:'#1a3a7e', text:'#ffffff', accent:'#60a5fa', qrBg:'#ffffff', qrFg:'#0c1a3e' },
  { id:'green',  bg1:'#0a1f0a', bg2:'#1a4a1a', text:'#ffffff', accent:'#4ade80', qrBg:'#ffffff', qrFg:'#0a1f0a' },
  { id:'gold',   bg1:'#1a0e00', bg2:'#3d2400', text:'#fbbf24', accent:'#f59e0b', qrBg:'#fff8e7', qrFg:'#1a0e00' },
  { id:'light',  bg1:'#f8fafc', bg2:'#e2e8f0', text:'#0f172a', accent:'#6366f1', qrBg:'#0f172a', qrFg:'#ffffff' },
];

window._shrOpenQrCard = function(imgInputId, linkUrl) {
  const url = linkUrl || '';
  const schBtns = _SHR_QR_SCHEMES.map(s =>
    '<button type="button" class="btn btn-sm shr-qrc-scheme' + (s.id==='dark'?' active':'') + '" data-id="' + s.id + '"'
    + ' style="background:linear-gradient(135deg,' + s.bg1 + ',' + s.bg2 + ');color:' + s.text + ';border-color:' + (s.id==='dark'?s.accent:'#444') + '"'
    + ' onclick="window._shrQrcScheme(\'' + s.id + '\')">' + s.id + '</button>'
  ).join('');
  const body = '<div id="shr-qrc-body" style="display:flex;flex-direction:column;gap:12px">'
    + '<input type="url" id="shr-qrc-url" class="shr-input shr-input-sm" placeholder="URL \u0434\u043b\u044f QR" value="' + _shrEsc(url) + '" oninput="window._shrQrcMark()">'
    + '<input type="text" id="shr-qrc-title" class="shr-input shr-input-sm" placeholder="\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a (\u043e\u043f\u0446\u0438\u043e\u043d\u0430\u043b\u044c\u043d\u043e)">'
    + '<input type="text" id="shr-qrc-caption" class="shr-input shr-input-sm" placeholder="\u041f\u043e\u0434\u043f\u0438\u0441\u044c" value="\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043a\u043e\u0434 \u0434\u043b\u044f \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u0430">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + schBtns + '</div>'
    + '<button class="btn btn-primary" id="shr-qrc-gen" onclick="window._shrQrcRender()" style="width:100%">&#128241; \u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c QR-\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443</button>'
    + '<div style="border-radius:10px;overflow:hidden;background:#111;min-height:80px;display:flex;align-items:center;justify-content:center" id="shr-qrc-prev"><span style="color:#666;font-size:12px">\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u00ab\u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u00bb</span></div>'
    + '<div id="shr-qrc-ok" style="display:none;padding:8px 12px;border-radius:8px;background:#052e16;color:#4ade80;font-size:13px">&#10003; \u041a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u0433\u043e\u0442\u043e\u0432\u0430</div>'
    + '<div style="text-align:right;display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn" onclick="window._shrCloseModal()">\u041e\u0442\u043c\u0435\u043d\u0430</button>'
    + '<button class="btn btn-primary" id="shr-qrc-use" disabled onclick="window._shrQrcUse(\'' + _shrEsc(imgInputId) + '\')">\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u043a\u0430\u043a OG</button>'
    + '</div></div>';
  _shrShowModal('&#128241; QR-\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0430 \u043a\u0430\u043a OG-\u0438\u0437\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u0435', body);
  window._shrQrcSchemeId = 'dark';
  window._shrQrcDataUrl = null;
};

window._shrQrcMark = function() {
  window._shrQrcDataUrl = null;
  const u = document.getElementById('shr-qrc-use'); if(u) u.disabled = true;
  const ok = document.getElementById('shr-qrc-ok'); if(ok) ok.style.display='none';
};

window._shrQrcScheme = function(id) {
  window._shrQrcSchemeId = id;
  document.querySelectorAll('.shr-qrc-scheme').forEach(b => {
    const s = _SHR_QR_SCHEMES.find(x=>x.id===b.dataset.id);
    b.style.borderColor = b.dataset.id===id ? s.accent : '#444';
    b.classList.toggle('active', b.dataset.id===id);
  });
  window._shrQrcMark();
  // Auto re-render if URL is filled
  const urlVal = (document.getElementById('shr-qrc-url')?.value||'').trim();
  if (urlVal) window._shrQrcRender();
};

window._shrQrcRender = async function() {
  const url = (document.getElementById('shr-qrc-url')?.value||'').trim();
  if (!url) { showToast('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 URL', 'error'); return; }
  const title   = document.getElementById('shr-qrc-title')?.value   || '';
  const caption = document.getElementById('shr-qrc-caption')?.value || '\u041e\u0442\u0441\u043a\u0430\u043d\u0438\u0440\u0443\u0439\u0442\u0435 QR-\u043a\u043e\u0434';
  const scheme  = _SHR_QR_SCHEMES.find(s=>s.id===window._shrQrcSchemeId) || _SHR_QR_SCHEMES[0];
  const btn = document.getElementById('shr-qrc-gen');
  if (btn) { btn.disabled=true; btn.textContent='\u0413\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f...'; }
  try {
    const SIZE=1080, PAD=Math.round(SIZE*0.05), QRS=Math.round(SIZE*0.54);
    const canvas=document.createElement('canvas'); canvas.width=canvas.height=SIZE;
    const ctx=canvas.getContext('2d');
    const grad=ctx.createLinearGradient(0,0,SIZE,SIZE);
    grad.addColorStop(0,scheme.bg1); grad.addColorStop(1,scheme.bg2);
    ctx.fillStyle=grad; ctx.fillRect(0,0,SIZE,SIZE);
    ctx.strokeStyle=scheme.accent+'40'; ctx.lineWidth=Math.round(SIZE*0.004);
    const brm=Math.round(SIZE*0.025);
    _shrQrcRRect(ctx,brm,brm,SIZE-brm*2,SIZE-brm*2,brm); ctx.stroke();
    const tY=Math.round(SIZE*0.11), tFs=Math.round(SIZE*0.042);
    ctx.font='800 '+tFs+'px Inter,Segoe UI,sans-serif';
    ctx.fillStyle=scheme.text; ctx.textAlign='center';
    ctx.shadowColor=scheme.accent+'80'; ctx.shadowBlur=Math.round(SIZE*0.015);
    ctx.fillText((title||'\u0421\u0441\u044b\u043b\u043a\u0430').slice(0,28), SIZE/2, tY); ctx.shadowBlur=0;
    const lW=Math.round(SIZE*0.18), lY=tY+Math.round(SIZE*0.025);
    const lg=ctx.createLinearGradient(SIZE/2-lW/2,0,SIZE/2+lW/2,0);
    lg.addColorStop(0,scheme.accent+'00'); lg.addColorStop(0.5,scheme.accent); lg.addColorStop(1,scheme.accent+'00');
    ctx.fillStyle=lg; ctx.fillRect(SIZE/2-lW/2,lY,lW,Math.round(SIZE*0.004));
    const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size='+QRS+'x'+QRS+'&data='+encodeURIComponent(url)+'&bgcolor='+scheme.qrBg.replace('#','')+'&color='+scheme.qrFg.replace('#','')+'&margin=1&ecc=H';
    const qrImg=await _shrQrcLoadImg(qrUrl);
    if(qrImg){
      const qrX=(SIZE-QRS)/2, qrY=Math.round(SIZE*0.185), bp=Math.round(SIZE*0.02);
      ctx.fillStyle=scheme.qrBg; ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=Math.round(SIZE*0.03);
      _shrQrcRRect(ctx,qrX-bp,qrY-bp,QRS+bp*2,QRS+bp*2,Math.round(SIZE*0.02)); ctx.fill(); ctx.shadowBlur=0;
      ctx.strokeStyle=scheme.accent+'80'; ctx.lineWidth=Math.round(SIZE*0.003);
      _shrQrcRRect(ctx,qrX-bp,qrY-bp,QRS+bp*2,QRS+bp*2,Math.round(SIZE*0.02)); ctx.stroke();
      ctx.drawImage(qrImg,qrX,qrY,QRS,QRS);
    }
    const cY=Math.round(SIZE*0.84), cFs=Math.round(SIZE*0.033);
    ctx.font='600 '+cFs+'px Inter,Segoe UI,sans-serif'; ctx.fillStyle=scheme.accent; ctx.textAlign='center';
    ctx.fillText(caption.slice(0,60),SIZE/2,cY);
    const uY=cY+Math.round(SIZE*0.05), uFs=Math.round(SIZE*0.022);
    ctx.font='400 '+uFs+'px Inter,Segoe UI,sans-serif'; ctx.fillStyle=scheme.text+'80';
    ctx.fillText(url.slice(0,48),SIZE/2,uY);
    window._shrQrcDataUrl=canvas.toDataURL('image/png',0.95);
    const prev=document.getElementById('shr-qrc-prev');
    if(prev) prev.innerHTML='<img src="'+window._shrQrcDataUrl+'" style="width:100%;border-radius:8px">';
    const ok=document.getElementById('shr-qrc-ok'); if(ok) ok.style.display='block';
    const useBtn=document.getElementById('shr-qrc-use'); if(useBtn) useBtn.disabled=false;
  } catch(e){ showToast('\u041e\u0448\u0438\u0431\u043a\u0430: '+e.message,'error'); }
  finally{ if(btn){btn.disabled=false; btn.textContent='\u{1F4F1} \u0421\u0433\u0435\u043d\u0435\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c QR-\u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0443';} }
};

window._shrQrcUse = async function(imgInputId) {
  if(!window._shrQrcDataUrl) return;
  const useBtn = document.getElementById('shr-qrc-use');
  if(useBtn){ useBtn.disabled=true; useBtn.textContent='Загрузка...'; }
  try {
    const res = await API.post('/api/shortener/upload-og', { dataUrl: window._shrQrcDataUrl });
    if(res.url) {
      const inp = document.getElementById(imgInputId);
      if(inp){ inp.value = location.origin + res.url; inp.dispatchEvent(new Event('input')); }
      window._shrCloseModal();
      showToast('QR-карточка добавлена как OG','success');
    } else {
      throw new Error(res.error || 'Ошибка загрузки');
    }
  } catch(e) {
    showToast('Ошибка: '+e.message,'error');
    if(useBtn){ useBtn.disabled=false; useBtn.textContent='Использовать как OG'; }
  }
};








function _shrQrcLoadImg(src){
  return new Promise(resolve=>{
    const img=new window.Image(); img.crossOrigin='anonymous';
    img.onload=()=>resolve(img); img.onerror=()=>resolve(null); img.src=src;
  });
}
function _shrQrcRRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

// ============================================================
// 9. shrOpenQr(linkId) — QR manager
// ============================================================

window.shrOpenQr = async function(linkId) {
  const link = _shrLinks.find(l => l.id === linkId);
  if (!link) { showToast(_shrT('not_found'), 'error'); return; }

  const shortUrl = _shrBuildUrl(link.code, link.domain);

  const body = `<div id="shr-qr-content"><div style="text-align:center;padding:30px">${_shrT('loading')}...</div></div>`;
  _shrShowModal(_shrT('qr_code') + ': ' + _shrEsc(link.code), body);

  try {
    const res = await API.get('/api/shortener/links/' + linkId + '/qr');
    const qrCodes = res.qrcodes || res.qrCodes || res.codes || [];

    let html = `<p style="margin-bottom:16px">${_shrT('url')}: <a href="${_shrEsc(shortUrl)}" target="_blank">${_shrEsc(shortUrl)}</a></p>`;

    if (Array.isArray(qrCodes) && qrCodes.length) {
      html += '<div class="shr-qr-grid">';
      qrCodes.forEach(qr => {
        html += `<div class="shr-qr-card">
          <img src="${_shrEsc(qr.url || qr.image || qr.dataUrl)}" alt="QR" style="max-width:200px" />
          <div style="margin-top:8px">
            ${qr.style ? `<span class="shr-badge">${_shrEsc(qr.style)}</span>` : ''}
            <a href="${_shrEsc(qr.url || qr.image || qr.dataUrl)}" download="qr-${_shrEsc(link.code)}.png" class="btn btn-xs">${_shrT('download')}</a>
          </div>
        </div>`;
      });
      html += '</div>';
    } else if (typeof qrCodes === 'string' || res.url || res.image || res.dataUrl) {
      const imgUrl = typeof qrCodes === 'string' ? qrCodes : (res.url || res.image || res.dataUrl);
      html += `<div style="text-align:center">
        <img src="${_shrEsc(imgUrl)}" alt="QR" style="max-width:250px" />
        <div style="margin-top:12px">
          <a href="${_shrEsc(imgUrl)}" download="qr-${_shrEsc(link.code)}.png" class="btn btn-sm">${_shrT('download')}</a>
        </div>
      </div>`;
    } else {
      html += `<div style="text-align:center;padding:20px;color:#999">${_shrT('no_qr')}</div>`;
    }

    // Generate new QR
    html += `<div style="margin-top:20px;border-top:1px solid #eee;padding-top:16px">
      <h4>${_shrT('generate_qr')}</h4>
      <div class="shr-quick-opts">
        <select id="shr-qr-style" class="shr-input shr-input-sm">
          <option value="default">${_shrT('default')}</option>
          <option value="dots">${_shrT('dots')}</option>
          <option value="rounded">${_shrT('rounded')}</option>
        </select>
        <input type="color" id="shr-qr-fg" value="#000000" class="shr-input shr-input-sm" title="${_shrT('foreground')}" />
        <input type="color" id="shr-qr-bg" value="#FFFFFF" class="shr-input shr-input-sm" title="${_shrT('background')}" />
        <button class="btn btn-primary btn-sm" onclick="window._shrGenerateQr(${linkId})">${_shrT('generate')}</button>
      </div>
    </div>`;

    document.getElementById('shr-qr-content').innerHTML = html;
  } catch (e) {
    document.getElementById('shr-qr-content').innerHTML =
      `<div style="color:red;padding:20px">${_shrT('error')}: ${_shrEsc(e.message)}</div>`;
  }
};

window._shrGenerateQr = async function(linkId) {
  const style = document.getElementById('shr-qr-style')?.value || 'default';
  const fg = document.getElementById('shr-qr-fg')?.value || '#000000';
  const bg = document.getElementById('shr-qr-bg')?.value || '#FFFFFF';

  try {
    const res = await API.post('/api/shortener/links/' + linkId + '/qr', { label: style, color: fg, bg_color: bg });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast(_shrT('qr_generated'), 'success');
    window.shrOpenQr(linkId); // Reload
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};


// ============================================================
// 10. shrCloneLink(id) — Clone link
// ============================================================

window.shrCloneLink = async function(id) {
  try {
    await API.post('/api/shortener/links/' + id + '/clone');
    showToast(_shrT('cloned'), 'success');
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('clone_error'), 'error');
  }
};


// ============================================================
// 11. shrOpenRules(id) — Smart Rules editor modal
// ============================================================

window.shrOpenRules = async function(id) {
  const link = _shrLinks.find(l => l.id === id);
  if (!link) { showToast(_shrT('not_found'), 'error'); return; }

  const body = `<div id="shr-rules-content"><div style="text-align:center;padding:30px">${_shrT('loading')}...</div></div>`;
  _shrShowModal(_shrT('rules') + ': ' + _shrEsc(link.code), body, { width: '800px' });

  try {
    const res = await API.get('/api/shortener/links/' + id + '/rules');
    const rules = res.rules || res || [];
    _shrRenderRulesContent(id, rules);
  } catch (e) {
    document.getElementById('shr-rules-content').innerHTML =
      `<div style="color:red;padding:20px">${_shrT('error')}: ${_shrEsc(e.message)}</div>`;
  }
};

function _shrRenderRulesContent(linkId, rules) {
  const container = document.getElementById('shr-rules-content');
  if (!container) return;

  let html = '';

  // Existing rules list
  if (rules.length) {
    html += '<div class="shr-rules-list">';
    rules.forEach((rule, idx) => {
      html += `<div class="shr-rule-row" data-idx="${idx}">
        <div class="shr-rule-info">
          <span class="shr-badge">${_shrEsc(rule.type)}</span>
          <span class="shr-rule-value">${_shrEsc(rule.value || rule.condition || '')}</span>
          <span class="shr-rule-arrow">\u2192</span>
          <span class="shr-rule-dest">${_shrEsc(_shrTruncate(rule.destination || rule.url || '', 50))}</span>
          ${rule.priority !== undefined ? `<span class="shr-rule-priority">P${rule.priority}</span>` : ''}
          ${rule.type === 'rotation' && rule.weight ? `<span class="shr-rule-weight">W:${rule.weight}</span>` : ''}
        </div>
        <button class="btn btn-xs btn-danger" onclick="window._shrRemoveRuleRow(${linkId}, ${idx})">\u{1F5D1}\uFE0F</button>
      </div>`;
    });
    html += '</div>';
  } else {
    html += `<div style="padding:16px;color:#999;text-align:center">${_shrT('no_rules')}</div>`;
  }

  // Add rule form
  html += `<div class="shr-add-rule" style="margin-top:20px;border-top:1px solid #eee;padding-top:16px">
    <h4>${_shrT('add_rule')}</h4>
    <div class="shr-quick-opts">
      <select id="shr-rule-type" class="shr-input shr-input-sm" onchange="window._shrRuleTypeChanged()">
        <option value="device">${_shrT('device')}</option>
        <option value="browser">${_shrT('browser')}</option>
        <option value="os">${_shrT('os')}</option>
        <option value="language">${_shrT('language')}</option>
        <option value="country">${_shrT('country')}</option>
        <option value="rotation">${_shrT('rotation')}</option>
      </select>
      <input type="text" id="shr-rule-value" class="shr-input shr-input-sm" placeholder="${_shrT('value')}" />
      <input type="url" id="shr-rule-dest" class="shr-input shr-input-sm" placeholder="${_shrT('destination')}" />
      <input type="number" id="shr-rule-priority" class="shr-input shr-input-sm" placeholder="${_shrT('priority')}" value="10" min="1" max="100" style="width:70px" />
    </div>
    <div id="shr-rule-rotation-fields" style="display:none;margin-top:8px">
      <p style="font-size:13px;color:#999">${_shrT('rotation_help')}</p>
      <div id="shr-rotation-urls">
        <div class="shr-quick-opts" style="margin-top:4px">
          <input type="url" class="shr-input shr-input-sm shr-rot-url" placeholder="${_shrT('url')} 1" />
          <input type="number" class="shr-input shr-input-sm shr-rot-weight" placeholder="${_shrT('weight')}" value="50" min="1" max="100" style="width:80px" />
        </div>
        <div class="shr-quick-opts" style="margin-top:4px">
          <input type="url" class="shr-input shr-input-sm shr-rot-url" placeholder="${_shrT('url')} 2" />
          <input type="number" class="shr-input shr-input-sm shr-rot-weight" placeholder="${_shrT('weight')}" value="50" min="1" max="100" style="width:80px" />
        </div>
      </div>
      <button class="btn btn-xs" onclick="window._shrAddRotationRow()" style="margin-top:6px">+ ${_shrT('add_url')}</button>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-primary btn-sm" onclick="window._shrAddRule(${linkId})">${_shrT('add_rule')}</button>
    </div>
  </div>`;

  // Save all button
  html += `<div style="margin-top:20px;text-align:right">
    <button class="btn" onclick="window._shrCloseModal()">${_shrT('close')}</button>
  </div>`;

  // Store current rules in a data attribute
  container.innerHTML = html;
  container.dataset.rules = JSON.stringify(rules);
  container.dataset.linkId = linkId;
}

window._shrRuleTypeChanged = function() {
  const type = document.getElementById('shr-rule-type')?.value;
  const rotFields = document.getElementById('shr-rule-rotation-fields');
  const valInput = document.getElementById('shr-rule-value');
  const destInput = document.getElementById('shr-rule-dest');

  if (type === 'rotation') {
    if (rotFields) rotFields.style.display = 'block';
    if (valInput) valInput.style.display = 'none';
    if (destInput) destInput.style.display = 'none';
  } else {
    if (rotFields) rotFields.style.display = 'none';
    if (valInput) valInput.style.display = '';
    if (destInput) destInput.style.display = '';
  }
};

window._shrAddRotationRow = function() {
  const container = document.getElementById('shr-rotation-urls');
  if (!container) return;
  const count = container.querySelectorAll('.shr-rot-url').length + 1;
  const div = document.createElement('div');
  div.className = 'shr-quick-opts';
  div.style.marginTop = '4px';
  div.innerHTML = `
    <input type="url" class="shr-input shr-input-sm shr-rot-url" placeholder="${_shrT('url')} ${count}" />
    <input type="number" class="shr-input shr-input-sm shr-rot-weight" placeholder="${_shrT('weight')}" value="50" min="1" max="100" style="width:80px" />
    <button class="btn btn-xs btn-danger" onclick="this.parentElement.remove()">\u00D7</button>`;
  container.appendChild(div);
