// === Golden Connect compat layer for Arsenal-ported shortener+bio FE ===
// Extended Apr 25: added isLoggedIn, i18n namespace, renderGuide stubs, showLogin
(function () {
  if (!window.API) {
    window.API = {
      get:  (p)    => fetch(p, { credentials: 'same-origin' }).then(r => r.json()),
      post: (p, b) => fetch(p, { method: 'POST',   credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json()),
      put:  (p, b) => fetch(p, { method: 'PUT',    credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) }).then(r => r.json()),
      del:  (p)    => fetch(p, { method: 'DELETE', credentials: 'same-origin' }).then(r => r.json()),
    };
  }
  if (!window.showToast) {
    window.showToast = function (msg, type) {
      const t = document.createElement('div');
      t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:' +
        (type === 'error' ? '#ef4444' : 'linear-gradient(135deg,#00D4FF,#B14AED)') +
        ';color:#fff;padding:12px 20px;border-radius:12px;font-weight:600;box-shadow:0 8px 32px rgba(0,212,255,.3);z-index:10000;';
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; setTimeout(() => t.remove(), 400); }, 2800);
    };
  }
  if (!window.escapeHtml) {
    window.escapeHtml = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  }
  if (!window.currentLang) window.currentLang = (localStorage.getItem('cabinetLang') || 'ru');
  if (!window.t) window.t = function (key) { return key; };
  // Extended Apr 25: more helpers Arsenal FE expects
  if (window.API && !window.API.isLoggedIn) {
    window.API.isLoggedIn = function () {
      try { return document.cookie.split(";").some(function (c) { return /(?:^|;)\s*cabinet[A-Za-z]*=/.test(c); }) || true; }
      catch (_) { return true; }
    };
  }
  if (!window.i18n) window.i18n = { t: function (key) { return (window.t ? window.t(key) : null) || key; }, lang: window.currentLang || "ru" };
  if (!window.renderGuideButton) window.renderGuideButton = function () { return ""; };
  if (!window.renderGuidePanel)  window.renderGuidePanel  = function () { return ""; };
  if (!window.showLogin) window.showLogin = function () { try { window.location.href = "/cabinet/login"; } catch (_) {} };
})();

const SHR_DOMAINS = ['t2gift.com'];
const SHR_COLORS = ['#667eea','#764ba2','#f093fb','#f5576c','#4facfe','#00f2fe','#43e97b','#fa709a','#fee140','#30cfd0'];
let _shrLinks = [], _shrCampaigns = [], _shrTab = 'links', _shrStatsChart = null;
/* [bio-hub-v2] */ let _bioHubTab = 'pages', _bioHubPeriod = '30d';
let _shrUrlFormat = localStorage.getItem('shr_url_format') || 'path';
let _shrSelectedDomain = localStorage.getItem('shr_domain') || SHR_DOMAINS[0];
let _shrSelectedIds = new Set();
let _shrAllTags = [];
let _shrSearch = '';
let _shrFilterCampaign = '';
let _shrFilterTag = '';
let _shrFilterPinned = false;
let _shrSort = 'newest';
let _shrPreviewData = null;
let _shrPreviewTimeout = null;

// --- Helpers ---

function _shrT(key) { var v = i18n.t('tools.shr.' + key); return (v && !v.startsWith('tools.')) ? v : key; }

function _shrEsc(s) {
  return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
}

function _shrTimeAgo(dateStr) {
  if (!dateStr) return '';
  const now = Date.now(), then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return _shrT('just_now');
  if (diff < 3600) return Math.floor(diff / 60) + ' ' + _shrT('min_ago');
  if (diff < 86400) return Math.floor(diff / 3600) + ' ' + _shrT('hours_ago');
  if (diff < 2592000) return Math.floor(diff / 86400) + ' ' + _shrT('days_ago');
  return new Date(dateStr).toLocaleDateString();
}

function _shrBuildUrl(code, domain) {
  domain = domain || SHR_DOMAINS[0];
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
window.loadShortener = loadShortener;

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
    const res = await API.get('/cabinet/api/shortener/bio/dashboard?period=' + encodeURIComponent(_bioHubPeriod));
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
      API.get('/cabinet/api/shortener/links'),
      API.get('/cabinet/api/shortener/campaigns'),
      API.get('/cabinet/api/shortener/tags').catch(() => ({ tags: [] }))
    ]);

    // Normalize link fields: API returns destination_url, total_clicks, is_active, campaign_id, created_at
    const _linksArr = Array.isArray(linksRes) ? linksRes : (Array.isArray(linksRes?.links) ? linksRes.links : (Array.isArray(linksRes?.items) ? linksRes.items : [])); _shrLinks = _linksArr.map(l => ({
      ...l,
      url: l.destination_url || l.url || '',
      destination: l.destination_url || l.destination || '',
      clicks: l.total_clicks || l.clicks || 0,
      status: (l.expires_at && new Date(l.expires_at) < new Date()) ? 'expired' : (l.is_active ? 'active' : 'inactive'),
      campaignId: l.campaign_id || l.campaignId || null,
      createdAt: l.created_at || l.createdAt || '',
      tags: typeof l.tags === 'string' ? l.tags.split(',').filter(Boolean) : (Array.isArray(l.tags) ? l.tags : [])
    }));
    _shrCampaigns = Array.isArray(campRes) ? campRes : (Array.isArray(campRes?.campaigns) ? campRes.campaigns : []);
    const _tagsArr = Array.isArray(tagsRes) ? tagsRes : (Array.isArray(tagsRes?.tags) ? tagsRes.tags : []); _shrAllTags = _tagsArr.map(t => typeof t === 'object' ? t.tag : t);

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

    const res = await API.post('/cabinet/api/shortener/links', body);
    if (res.error) { showToast(res.error, 'error'); if (btn) { btn.disabled = false; btn.textContent = _shrT('shorten'); } return; }

    // Save tags after link created
    const linkId = res.link?.id || res.id;
    if (tags.length && linkId) {
      await API.post('/cabinet/api/shortener/links/' + linkId + '/tags', { tags }).catch(() => {});
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
    await API.del('/cabinet/api/shortener/links/' + id);
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
    await API.post('/cabinet/api/shortener/campaigns', { name, description });
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
    await API.put('/cabinet/api/shortener/campaigns/' + id, { name, description });
    showToast(_shrT('updated'), 'success');
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrDeleteCampaign = async function(id) {
  if (!confirm(_shrT('confirm_delete'))) return;
  try {
    await API.del('/cabinet/api/shortener/campaigns/' + id);
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

    await API.put('/cabinet/api/shortener/links/' + id, body);
    // Save tags
    if (tags.length || true) {
      await API.post('/cabinet/api/shortener/links/' + id + '/tags', { tags }).catch(() => {});
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
      API.get('/cabinet/api/shortener/links/' + linkId + '/stats?period=' + period),
      API.get('/cabinet/api/shortener/links/' + linkId + '/stats/advanced').catch(() => ({}))
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
    const res = await API.get('/cabinet/api/shortener/links/' + linkId + '/stats/export?period=' + period);
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
    const res = await API.post('/cabinet/api/shortener/compare', { linkIds: ids });
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
    const res = await API.post('/cabinet/api/shortener/upload-og', { dataUrl: window._shrQrcDataUrl });
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
    const res = await API.get('/cabinet/api/shortener/links/' + linkId + '/qr');
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
    const res = await API.post('/cabinet/api/shortener/links/' + linkId + '/qr', { label: style, color: fg, bg_color: bg });
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
    await API.post('/cabinet/api/shortener/links/' + id + '/clone');
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
    const res = await API.get('/cabinet/api/shortener/links/' + id + '/rules');
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
};

window._shrAddRule = async function(linkId) {
  const container = document.getElementById('shr-rules-content');
  if (!container) return;

  const type = document.getElementById('shr-rule-type')?.value || 'device';
  const priority = parseInt(document.getElementById('shr-rule-priority')?.value) || 10;

  let rules = [];
  try { rules = JSON.parse(container.dataset.rules || '[]'); } catch (e) { /* ignore */ }

  if (type === 'rotation') {
    const urls = document.querySelectorAll('.shr-rot-url');
    const weights = document.querySelectorAll('.shr-rot-weight');
    urls.forEach((u, i) => {
      const url = u.value.trim();
      const weight = parseInt(weights[i]?.value) || 50;
      if (url) {
        rules.push({ type: 'rotation', destination: url, weight, priority });
      }
    });
  } else {
    const value = (document.getElementById('shr-rule-value')?.value || '').trim();
    const destination = (document.getElementById('shr-rule-dest')?.value || '').trim();
    if (!value || !destination) { showToast(_shrT('fill_all_fields'), 'error'); return; }
    rules.push({ type, value, destination, priority });
  }

  try {
    await API.post('/cabinet/api/shortener/links/' + linkId + '/rules', { rules });
    showToast(_shrT('rules_saved'), 'success');
    // Reload rules
    const res = await API.get('/cabinet/api/shortener/links/' + linkId + '/rules');
    _shrRenderRulesContent(linkId, res.rules || res || []);
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrRemoveRuleRow = async function(linkId, idx) {
  const container = document.getElementById('shr-rules-content');
  if (!container) return;

  let rules = [];
  try { rules = JSON.parse(container.dataset.rules || '[]'); } catch (e) { /* ignore */ }

  rules.splice(idx, 1);

  try {
    await API.post('/cabinet/api/shortener/links/' + linkId + '/rules', { rules });
    showToast(_shrT('rule_deleted'), 'success');
    const res = await API.get('/cabinet/api/shortener/links/' + linkId + '/rules');
    _shrRenderRulesContent(linkId, res.rules || res || []);
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};


// ============================================================
// 12. _shrLoadDashboard() — ENHANCED dashboard
// ============================================================

async function _shrLoadDashboard() {
  const panel = _shrPanelEl();
  if (!panel) return;

  panel.innerHTML = `<div style="text-align:center;padding:30px">${_shrT('loading')}...</div>`;

  try {
    const res = await API.get('/cabinet/api/shortener/dashboard/advanced');
    const dash = res || {};

    let html = '';

    // Quick stats cards
    const growth = dash.growthRate || dash.growth || 0;
    const activeLinks = dash.activeLinks || _shrLinks.filter(l => l.status === 'active').length;
    const totalClicks = dash.totalClicks || _shrLinks.reduce((s, l) => s + (l.clicks || 0), 0);
    const bestCampaign = dash.bestCampaign || '';

    html += `<div class="shr-dash-cards">
      <div class="shr-dash-card">
        <div class="shr-dash-card-value" style="color:${growth >= 0 ? '#43e97b' : '#f5576c'}">
          ${growth >= 0 ? '\u2191' : '\u2193'} ${Math.abs(growth)}%
        </div>
        <div class="shr-dash-card-label">${_shrT('growth_rate')}</div>
      </div>
      <div class="shr-dash-card">
        <div class="shr-dash-card-value">${activeLinks}</div>
        <div class="shr-dash-card-label">${_shrT('active_links')}</div>
      </div>
      <div class="shr-dash-card">
        <div class="shr-dash-card-value">${totalClicks}</div>
        <div class="shr-dash-card-label">${_shrT('total_clicks')}</div>
      </div>
      <div class="shr-dash-card">
        <div class="shr-dash-card-value">${_shrEsc(bestCampaign) || '-'}</div>
        <div class="shr-dash-card-label">${_shrT('best_campaign')}</div>
      </div>
    </div>`;

    // Overall trend chart (30 days)
    const trend = dash.trend || dash.daily || [];
    html += `<div class="shr-chart-wrap" style="margin-top:20px">
      <h4>${_shrT('clicks_trend')} (30 ${_shrT('days')})</h4>
      <canvas id="shr-dash-trend-chart" height="200"></canvas>
    </div>`;

    // GitHub-style calendar heatmap (90 days)
    html += _shrBuildCalendarHeatmap(dash.calendar || dash.daily90 || trend);

    // Campaign leaderboard
    const campaigns = dash.campaignStats || [];
    if (campaigns.length) {
      const maxCampClicks = Math.max(...campaigns.map(c => c.clicks || c.count || 0));
      html += `<div class="shr-breakdown-section" style="margin-top:20px">
        <h4>${_shrT('campaign_leaderboard')}</h4>`;
      campaigns.forEach((c, i) => {
        const clicks = c.clicks || c.count || 0;
        const color = SHR_COLORS[i % SHR_COLORS.length];
        html += `<div class="shr-bd-row">
          <span class="shr-bd-name">${_shrEsc(c.name)}</span>
          <span class="shr-bd-count">${clicks}</span>
          ${_shrPercentBar(clicks, maxCampClicks, color)}
        </div>`;
      });
      html += '</div>';
    }

    // Top hours/days
    const topHours = dash.topHours || [];
    const topDays = dash.topDays || [];
    if (topHours.length || topDays.length) {
      html += '<div class="shr-breakdown-grid" style="margin-top:20px">';
      if (topHours.length) {
        const maxH = Math.max(...topHours.map(h => h.count || h.clicks || 0));
        html += `<div class="shr-breakdown-section"><h4>${_shrT('top_hours')}</h4>`;
        topHours.slice(0, 6).forEach((h, i) => {
          const count = h.count || h.clicks || 0;
          html += `<div class="shr-bd-row">
            <span class="shr-bd-name">${h.hour || h.name}:00</span>
            <span class="shr-bd-count">${count}</span>
            ${_shrPercentBar(count, maxH, SHR_COLORS[i % SHR_COLORS.length])}
          </div>`;
        });
        html += '</div>';
      }
      if (topDays.length) {
        const dayNames = [_shrT('sun'), _shrT('mon'), _shrT('tue'), _shrT('wed'), _shrT('thu'), _shrT('fri'), _shrT('sat')];
        const maxD = Math.max(...topDays.map(d => d.count || d.clicks || 0));
        html += `<div class="shr-breakdown-section"><h4>${_shrT('top_days')}</h4>`;
        topDays.slice(0, 7).forEach((d, i) => {
          const count = d.count || d.clicks || 0;
          const dayLabel = dayNames[d.day] || d.name || d.day;
          html += `<div class="shr-bd-row">
            <span class="shr-bd-name">${dayLabel}</span>
            <span class="shr-bd-count">${count}</span>
            ${_shrPercentBar(count, maxD, SHR_COLORS[i % SHR_COLORS.length])}
          </div>`;
        });
        html += '</div>';
      }
      html += '</div>';
    }

    panel.innerHTML = html;

    // Render trend chart
    if (trend.length) {
      const canvas = document.getElementById('shr-dash-trend-chart');
      if (canvas) {
        new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: {
            labels: trend.map(d => d.date || d.day || d.label || ''),
            datasets: [{
              label: _shrT('clicks'),
              data: trend.map(d => d.count || d.clicks || d.value || 0),
              borderColor: '#667eea',
              backgroundColor: 'rgba(102,126,234,0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 2,
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
    }
  } catch (e) {
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; } panel.innerHTML = `<div style="color:red;padding:20px">${_shrT('error')}: ${_shrEsc(e.message)}</div>`;
  }
}

function _shrBuildCalendarHeatmap(dailyData) {
  if (!dailyData || !dailyData.length) return '';

  // Build date->count map
  const dateMap = {};
  let maxCount = 0;
  dailyData.forEach(d => {
    const date = d.date || d.day || d.label || '';
    const count = d.count || d.clicks || d.value || 0;
    if (date) {
      dateMap[date] = count;
      if (count > maxCount) maxCount = count;
    }
  });

  // Generate 90 days of cells
  const today = new Date();
  const cells = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayOfWeek = d.getDay(); // 0=Sun
    cells.push({ date: dateStr, dayOfWeek, count: dateMap[dateStr] || 0 });
  }

  // Build grid: 7 rows (Mon-Sun) x ~13 columns (weeks)
  // Reorder to Mon=0, Tue=1, ..., Sun=6
  const dayReorder = d => (d === 0 ? 6 : d - 1); // Sun=6, Mon=0
  const dayLabels = [_shrT('mon'), _shrT('tue'), _shrT('wed'), _shrT('thu'), _shrT('fri'), _shrT('sat'), _shrT('sun')];

  // Organize into weeks
  const weeks = [];
  let currentWeek = [];
  cells.forEach(cell => {
    const reordered = dayReorder(cell.dayOfWeek);
    if (reordered === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push({ ...cell, row: reordered });
  });
  if (currentWeek.length) weeks.push(currentWeek);

  let html = `<div class="shr-calendar" style="margin-top:20px">
    <h4>${_shrT('activity')} (90 ${_shrT('days')})</h4>
    <div class="shr-cal-grid">
      <div class="shr-cal-labels">
        ${dayLabels.map(l => `<div class="shr-cal-day-label">${l}</div>`).join('')}
      </div>
      <div class="shr-cal-weeks">`;

  weeks.forEach(week => {
    html += '<div class="shr-cal-week">';
    // Fill empty cells at start
    if (week.length > 0 && week[0].row > 0) {
      for (let i = 0; i < week[0].row; i++) {
        html += '<div class="shr-cal-cell shr-cal-empty"></div>';
      }
    }
    week.forEach(cell => {
      const intensity = maxCount > 0 ? cell.count / maxCount : 0;
      let level = 0;
      if (cell.count > 0) {
        if (intensity <= 0.25) level = 1;
        else if (intensity <= 0.5) level = 2;
        else if (intensity <= 0.75) level = 3;
        else level = 4;
      }
      html += `<div class="shr-cal-cell shr-cal-level-${level}" title="${cell.date}: ${cell.count} ${_shrT('clicks')}"></div>`;
    });
    // Fill empty cells at end
    const lastRow = week.length > 0 ? week[week.length - 1].row : -1;
    for (let i = lastRow + 1; i < 7; i++) {
      html += '<div class="shr-cal-cell shr-cal-empty"></div>';
    }
    html += '</div>';
  });

  html += `</div>
    </div>
    <div class="shr-cal-legend">
      <span>${_shrT('less')}</span>
      <div class="shr-cal-cell shr-cal-level-0"></div>
      <div class="shr-cal-cell shr-cal-level-1"></div>
      <div class="shr-cal-cell shr-cal-level-2"></div>
      <div class="shr-cal-cell shr-cal-level-3"></div>
      <div class="shr-cal-cell shr-cal-level-4"></div>
      <span>${_shrT('more')}</span>
    </div>
  </div>`;

  return html;
}


// ============================================================
// 13. Bulk operations
// ============================================================

window.shrBulkAction = async function(action, value) {
  const ids = Array.from(_shrSelectedIds);
  if (!ids.length) { showToast(_shrT('none_selected'), 'error'); return; }

  if (action === 'delete') {
    if (!confirm(_shrT('confirm_bulk_delete').replace('{n}', ids.length))) return;
  }

  try {
    await API.post('/cabinet/api/shortener/links/bulk', { action, linkIds: ids, value });
    showToast(_shrT('bulk_done'), 'success');
    _shrSelectedIds.clear();
    await _shrLoadAll();
  } catch (e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrBulkCampaignPrompt = function() {
  const names = _shrCampaigns.map(c => c.name).join(', ');
  const name = prompt(_shrT('enter_campaign') + '\n' + _shrT('available') + ': ' + names);
  if (!name) return;
  const camp = _shrCampaigns.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (camp) {
    window.shrBulkAction('campaign', camp.id || camp.name);
  } else {
    showToast(_shrT('campaign_not_found'), 'error');
  }
};

window._shrBulkTagsPrompt = function() {
  const input = prompt(_shrT('enter_tags_comma'));
  if (!input) return;
  const tags = input.split(',').map(t => t.trim()).filter(Boolean);
  if (tags.length) {
    window.shrBulkAction('tags', tags);
  }
};

window.shrExportCSV = async function() {
  try {
    const res = await API.get('/cabinet/api/shortener/export/links');
    if (res.csv || res.data || typeof res === 'string') {
      _shrDownloadCSV(res.csv || res.data || res, 'shortener-links.csv');
      showToast(_shrT('exported'), 'success');
    } else {
      // Try to build CSV from current links
      let csv = 'Code,URL,Title,Clicks,Status,Campaign,Tags,Created\n';
      _shrLinks.forEach(l => {
        csv += `"${l.code || ''}","${l.url || l.destination_url || ''}","${l.title || ''}",${l.clicks || l.total_clicks || 0},"${l.status || ''}","","${(l.tags || []).join(';')}","${l.createdAt || l.created_at || ''}"\n`;
      });
      _shrDownloadCSV(csv, 'shortener-links.csv');
      showToast(_shrT('exported'), 'success');
    }
  } catch (e) {
    // Fallback: export from local data
    let csv = 'Code,URL,Title,Clicks,Status,Campaign,Tags,Created\n';
    _shrLinks.forEach(l => {
      csv += `"${l.code || ''}","${l.url || l.destination || ''}","${l.title || ''}",${l.clicks || 0},"${l.status || ''}","${l.campaignName || ''}","${(l.tags || []).join(';')}","${l.createdAt || l.created_at || ''}"\n`;
    });
    _shrDownloadCSV(csv, 'shortener-links.csv');
    showToast(_shrT('exported'), 'success');
  }
};


// ============================================================
// 14. Tag helpers (additional)
// ============================================================

// _shrTagColor and _shrRenderTags already defined above


// ============================================================
// 15. URL Preview (auto-paste + preview card)
// ============================================================

window._shrCheckClipboard = async function() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    const text = await navigator.clipboard.readText();
    if (text && /^https?:\/\/.{3,}/i.test(text)) {
      const urlInput = document.getElementById('shr-url');
      if (urlInput && !urlInput.value) {
        // Show paste tooltip
        const row = urlInput.closest('.shr-quick-row');
        if (row && !row.querySelector('.shr-paste-tooltip')) {
          const tip = document.createElement('div');
          tip.className = 'shr-paste-tooltip';
          tip.textContent = _shrT('paste_clipboard');
          tip.onclick = function() {
            urlInput.value = text;
            tip.remove();
            window._shrOnUrlInput();
          };
          row.appendChild(tip);
          setTimeout(() => tip.remove(), 5000);
        }
      }
    }
  } catch {}
};

window._shrOnUrlInput = function() {
  clearTimeout(_shrPreviewTimeout);
  const url = (document.getElementById('shr-url')?.value || '').trim();
  if (!url || !/^https?:\/\/.{3,}/i.test(url)) {
    const pw = document.getElementById('shr-preview-wrap');
    if (pw) pw.innerHTML = '';
    return;
  }
  _shrPreviewTimeout = setTimeout(() => _shrFetchPreview(url), 800);
};

async function _shrFetchPreview(url) {
  const wrap = document.getElementById('shr-preview-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="shr-preview-loading">${_shrT('fetching_preview')}</div>`;

  try {
    const res = await API.get('/cabinet/api/shortener/preview?url=' + encodeURIComponent(url));
    _shrPreviewData = res;

    if (!res.title && !res.description) {
      wrap.innerHTML = '';
      return;
    }

    const favicon = res.favicon ? `<img src="${_shrEsc(res.favicon)}" class="shr-preview-favicon" onerror="this.style.display='none'">` : '<div class="shr-preview-favicon" style="background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:16px">&#127760;</div>';

    wrap.innerHTML = `<div class="shr-preview-card">
      ${favicon}
      <div class="shr-preview-info">
        <div class="shr-preview-title">${_shrEsc(res.title || '')}</div>
        <div class="shr-preview-desc">${_shrEsc(res.description || '')}</div>
      </div>
      <div class="shr-preview-actions">
        <button onclick="window._shrAutoFillOG()">${_shrT('auto_fill')}</button>
      </div>
    </div>`;

    // Auto-fill title if empty
    const titleInput = document.getElementById('shr-title');
    if (titleInput && !titleInput.value && res.title) {
      titleInput.value = res.title.slice(0, 100);
    }
  } catch {
    wrap.innerHTML = '';
  }
}

window._shrAutoFillOG = function() {
  if (!_shrPreviewData) return;
  const { title, description, image } = _shrPreviewData;
  const ogTitle = document.getElementById('shr-og-title');
  const ogDesc = document.getElementById('shr-og-desc');
  const ogImage = document.getElementById('shr-og-image');
  if (ogTitle && !ogTitle.value && title) ogTitle.value = title;
  if (ogDesc && !ogDesc.value && description) ogDesc.value = description;
  if (ogImage && !ogImage.value && image) ogImage.value = image;
  // Open OG section
  const section = document.getElementById('shr-og-section');
  if (section) section.open = true;
  showToast(_shrT('og_auto'), 'success');
};


// ============================================================
// 16. Pin/Star toggle
// ============================================================

window._shrTogglePin = async function(id) {
  try {
    id = Number(id);
    const res = await API.put('/cabinet/api/shortener/links/' + id + '/pin', {});
    if (res.error) { showToast(res.error, 'error'); return; }
    // Update local state
    const link = _shrLinks.find(l => Number(l.id) === id);
    if (link) {
      link.is_pinned = res.is_pinned;
      link.isPinned = res.is_pinned;
    }
    window.shrRenderLinks();
    showToast(res.is_pinned ? (_shrT('pinned') || 'Pinned') : (_shrT('unpinned') || 'Unpinned'), 'success');
  } catch (e) {
    console.error('Pin toggle error:', e);
    showToast(e.message || _shrT('error'), 'error');
  }
};

window._shrTogglePinnedFilter = function() {
  _shrFilterPinned = !_shrFilterPinned;
  window.shrRenderLinks();
};


// ============================================================
// 17. Bio Page Editor
// ============================================================


// Bio social platforms
const BIO_SOCIALS = [
  { key: 'instagram', label: 'Instagram', icon: '\ud83d\udcf7', placeholder: 'https://instagram.com/...' },
  { key: 'tiktok', label: 'TikTok', icon: '\ud83c\udfb5', placeholder: 'https://tiktok.com/@...' },
  { key: 'youtube', label: 'YouTube', icon: '\u25b6\ufe0f', placeholder: 'https://youtube.com/...' },
  { key: 'telegram', label: 'Telegram', icon: '\u2708\ufe0f', placeholder: 'https://t.me/...' },
  { key: 'twitter', label: 'X / Twitter', icon: '\ud83d\udc26', placeholder: 'https://x.com/...' },
  { key: 'vk', label: 'VK', icon: '\ud83c\udf10', placeholder: 'https://vk.com/...' },
  { key: 'facebook', label: 'Facebook', icon: '\ud83d\udc64', placeholder: 'https://facebook.com/...' },
  { key: 'linkedin', label: 'LinkedIn', icon: '\ud83d\udcbc', placeholder: 'https://linkedin.com/in/...' },
  { key: 'whatsapp', label: 'WhatsApp', icon: '\ud83d\udcac', placeholder: 'https://wa.me/...' },
  { key: 'github', label: 'GitHub', icon: '\ud83d\udcbb', placeholder: 'https://github.com/...' },
  { key: 'spotify', label: 'Spotify', icon: '\ud83c\udfa7', placeholder: 'https://open.spotify.com/...' },
  { key: 'pinterest', label: 'Pinterest', icon: '\ud83d\udccc', placeholder: 'https://pinterest.com/...' },
  { key: 'website', label: 'Website', icon: '\ud83c\udf10', placeholder: 'https://...' }
];

const BIO_BTN_STYLES = [
  { key: 'glass', label: 'Glass' },
  { key: 'pill', label: 'Pill' },
  { key: 'rounded', label: 'Rounded' },
  { key: 'square', label: 'Square' },
  { key: 'outline', label: 'Outline' },
  { key: 'filled', label: 'Filled' },
  { key: 'shadow', label: 'Shadow' },
  { key: 'neon', label: 'Neon' }
];

// ===================== BIO MANAGER (Phase 1) =====================

let _bioPages = [];
let _bioCurrentPage = null;
let _bioDragItem = null;

async function _shrRenderBioManager() {
  const panel = _shrPanelEl();
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:30px">' + _shrT('loading') + '...</div>';

  try {
    const res = await API.get('/cabinet/api/shortener/bio/pages');
    _bioPages = res.pages || [];

    let html = '<div class="bio-manager">';
    html += '<div class="bio-manager-header">';
    html += '<h3>\u{1F4C4} ' + (_shrT('bio_pages') || 'Bio Pages') + ' <span style="font-weight:400;font-size:0.85rem;color:var(--text-secondary)">(' + _bioPages.length + ')</span></h3>';
    html += '<button class="btn btn-primary btn-sm" onclick="window._bioCreatePage()"><span style="margin-right:4px">+</span>' + (_shrT('bio_create_page') || 'Create Page') + '</button>';
    html += '</div>';

    // Bio Instructions Block
    var isRu = (window.currentLang || 'en') === 'ru';
    html += '<div class="bio-instructions" style="margin:16px 0;padding:16px 20px;background:linear-gradient(135deg,rgba(102,126,234,0.08),rgba(118,75,162,0.06));border:1px solid rgba(102,126,234,0.2);border-radius:14px">';
    html += '<div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="var c=this.parentElement.querySelector(\x27.bio-instr-body\x27);var a=this.querySelector(\x27.bio-instr-arrow\x27);if(c.style.display===\x27none\x27){c.style.display=\x27block\x27;a.textContent=\x27\u25BC\x27}else{c.style.display=\x27none\x27;a.textContent=\x27\u25B6\x27}">';
    html += '<span style="font-size:20px">\u{1F4D6}</span>';
    html += '<span style="font-weight:700;font-size:0.95rem;flex:1">' + (isRu ? 'Что такое Bio-страница и зачем она нужна?' : 'What is a Bio page and why do you need one?') + '</span>';
    html += '<span class="bio-instr-arrow" style="font-size:12px;color:var(--text-muted)">\u25B6</span>';
    html += '</div>';
    html += '<div class="bio-instr-body" style="display:none;margin-top:14px;font-size:0.88rem;line-height:1.7;color:var(--text-secondary)">';

    if (isRu) {
      html += '<p style="margin-bottom:10px"><b>Bio-страница</b> — это ваша персональная страница со всеми ссылками, контактами и соцсетями. Как Linktree, только <b>бесплатно</b> и с большим функционалом.</p>';
      html += '<div style="margin-bottom:12px"><b>\u{1F3AF} Что вы получаете:</b></div>';
      html += '<ul style="margin:0 0 12px 16px;padding:0">';
      html += '<li><b>Персональный URL</b> — <span style="color:#667eea">goldenConnect.to/bio/ваш-логин</span></li>';
      html += '<li><b>Красивый дизайн</b> — 14 фонов, 8 стилей кнопок, кастомные цвета</li>';
      html += '<li><b>Все ссылки</b> — добавьте любые ссылки, соцсети, контакты</li>';
      html += '<li><b>Аналитика</b> — кто заходит, откуда, с каких устройств</li>';
      html += '<li><b>QR-код</b> — для визиток, флаеров, баннеров</li>';
      html += '<li><b>ИИ-генерация</b> — ИИ заполнит страницу за вас</li>';
      html += '<li><b>A/B тесты</b> — тестируйте разные варианты</li>';
      html += '</ul>';
      html += '<div style="margin-bottom:10px"><b>\u{1F4CB} Как создать Bio-страницу:</b></div>';
      html += '<ol style="margin:0 0 12px 16px;padding:0">';
      html += '<li>Нажмите <b>«Создать страницу»</b></li>';
      html += '<li>Придумайте <b>логин</b> — это будет URL вашей страницы (например: <span style="color:#667eea">goldenConnect.to/bio/ivan</span>)</li>';
      html += '<li>Заполните <b>имя</b> и <b>описание</b> (или нажмите <b>AI</b> — ИИ сделает за вас)</li>';
      html += '<li>Добавьте <b>ссылки</b> и <b>соцсети</b></li>';
      html += '<li>Выберите <b>тему</b> и <b>фон</b></li>';
      html += '<li>Готово! Делитесь ссылкой на вашу Bio-страницу</li>';
      html += '</ol>';
      html += '<div style="margin-bottom:8px"><b>\u{1F4A1} Идеально подходит для:</b></div>';
      html += '<p style="margin:0">Визиток, Instagram био, Telegram профилей, резюме, портфолио, лендингов. Вместо платного Linktree ($24/мес) — всё бесплатно!</p>';
    } else {
      html += '<p style="margin-bottom:10px"><b>Bio page</b> is your personal page with all links, contacts, and social media. Like Linktree, but <b>free</b> and with more features.</p>';
      html += '<div style="margin-bottom:12px"><b>\u{1F3AF} What you get:</b></div>';
      html += '<ul style="margin:0 0 12px 16px;padding:0">';
      html += '<li><b>Personal URL</b> — <span style="color:#667eea">goldenConnect.to/bio/your-login</span></li>';
      html += '<li><b>Beautiful design</b> — 14 backgrounds, 8 button styles, custom colors</li>';
      html += '<li><b>All links</b> — add any links, socials, contacts</li>';
      html += '<li><b>Analytics</b> — who visits, from where, which devices</li>';
      html += '<li><b>QR code</b> — for business cards, flyers, banners</li>';
      html += '<li><b>AI generation</b> — AI fills your page for you</li>';
      html += '<li><b>A/B tests</b> — test different variants</li>';
      html += '</ul>';
      html += '<div style="margin-bottom:10px"><b>\u{1F4CB} How to create a Bio page:</b></div>';
      html += '<ol style="margin:0 0 12px 16px;padding:0">';
      html += '<li>Click <b>"Create Page"</b></li>';
      html += '<li>Choose a <b>login</b> — this will be your page URL (e.g.: <span style="color:#667eea">goldenConnect.to/bio/john</span>)</li>';
      html += '<li>Fill in <b>name</b> and <b>description</b> (or press <b>AI</b> — AI will do it for you)</li>';
      html += '<li>Add <b>links</b> and <b>social media</b></li>';
      html += '<li>Pick a <b>theme</b> and <b>background</b></li>';
      html += '<li>Done! Share the link to your Bio page</li>';
      html += '</ol>';
      html += '<div style="margin-bottom:8px"><b>\u{1F4A1} Perfect for:</b></div>';
      html += '<p style="margin:0">Business cards, Instagram bio, Telegram profiles, resumes, portfolios, landing pages. Instead of paid Linktree ($24/mo) — all free!</p>';
    }

    html += '</div></div>';

    if (_bioPages.length === 0) {
      var ru = _bioHubIsRu();
      html += '<div class="bio-empty-state" style="text-align:center;padding:60px 20px;background:linear-gradient(135deg,rgba(0,212,255,.05),rgba(177,74,237,.05));border:1px dashed rgba(177,74,237,.3);border-radius:20px;margin-top:12px">';
      html += '<div style="font-size:64px;margin-bottom:16px">🌍</div>';
      html += '<h2 style="margin:0 0 12px;font-size:22px;color:var(--text)">' + (ru ? 'Создай свою Bio-страницу' : 'Create Your Bio Page') + '</h2>';
      html += '<p style="color:var(--text-secondary);margin:0 auto 24px;max-width:520px;line-height:1.6">' + (ru ? 'Одна красивая страница со всеми твоими ссылками, соцсетями и QR-кодом. Идеально для Instagram bio, Telegram, визиток. AI-генерация, A/B тесты, статистика, кастомные домены — всё включено.' : 'One beautiful page with all your links, socials and QR. AI generation, A/B tests, stats, custom domains.') + '</p>';
      html += '<button class="btn btn-primary" onclick="window._bioCreatePage()" style="padding:14px 32px;font-size:15px;font-weight:700;background:linear-gradient(135deg,#00D4FF,#B14AED);border:none;color:#fff;border-radius:12px;cursor:pointer;box-shadow:0 12px 28px rgba(177,74,237,.32)">+ ' + (ru ? 'Создать первую страницу' : 'Create First Page') + '</button>';
      html += '<div style="margin-top:32px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;max-width:680px;margin-left:auto;margin-right:auto;text-align:left">';
      var feats = ru ? [
        {i:'✨',t:'AI-генерация',d:'AI заполнит страницу за тебя'},
        {i:'🧪',t:'A/B тесты',d:'Сравни 2 варианта, выбери лучший'},
        {i:'📊',t:'Аналитика',d:'Просмотры, клики, устройства'},
        {i:'📱',t:'QR-код',d:'Для визиток, сторис, оффлайн'},
        {i:'🌍',t:'Свой домен',d:'yourname.com — твоя bio'},
        {i:'🛒',t:'Маркетплейс',d:'Продавай прямо со страницы'}
      ] : [
        {i:'✨',t:'AI Generation',d:'AI fills your page'},
        {i:'🧪',t:'A/B Tests',d:'Compare variants, pick winner'},
        {i:'📊',t:'Analytics',d:'Views, clicks, devices'},
        {i:'📱',t:'QR Code',d:'For business cards, stories'},
        {i:'🌍',t:'Custom Domain',d:'yourname.com → your bio'},
        {i:'🛒',t:'Marketplace',d:'Sell directly from page'}
      ];
      feats.forEach(function (f) {
        html += '<div style="padding:14px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid var(--border)"><div style="font-size:24px;margin-bottom:6px">' + f.i + '</div><div style="font-weight:700;margin-bottom:2px;color:var(--text)">' + f.t + '</div><div style="font-size:12px;color:var(--text-secondary)">' + f.d + '</div></div>';
      });
      html += '</div></div>';
    } else {
      html += '<div class="bio-pages-grid">';
      for (const p of _bioPages) {
        const color = p.theme_color || '#667eea';
        html += '<div class="bio-page-card" onclick="window._bioEditPage(' + p.id + ')">';
        html += '<div class="bio-page-card-header" style="background:linear-gradient(135deg,' + _shrEsc(color) + ',' + _shrEsc(color) + '88)">';
        if (p.avatar_url) {
          html += '<img src="' + _shrEsc(p.avatar_url) + '" class="bio-page-card-avatar" onerror="this.style.display=\'none\'" />';
        } else {
          html += '<div class="bio-page-card-avatar-placeholder" style="border-color:' + _shrEsc(color) + '">' + _shrEsc((p.display_name || p.username || '?').charAt(0).toUpperCase()) + '</div>';
        }
        html += '</div>';
        html += '<div class="bio-page-card-body">';
        html += '<div class="bio-page-card-name">' + _shrEsc(p.page_name || p.display_name || p.username) + '</div>';
        html += '<div class="bio-page-card-username">@' + _shrEsc(p.username) + '</div>';
        html += '<div class="bio-page-card-stats">';
        html += '<span>\u{1F517} ' + (p.link_count || 0) + '</span>';
        html += '<span>\u{1F465} ' + (p.social_count || 0) + '</span>';
        html += '<span>\u{1F441} ' + (p.total_views || 0) + '</span>';
        html += '</div>';
        html += '<div class="bio-page-card-actions">';
        html += '<a href="/bio/' + _shrEsc(p.username) + '" target="_blank" class="bio-action-btn bio-action-primary" onclick="event.stopPropagation()" title="' + (_shrT('bio_preview') || 'Preview') + '"><i class="fas fa-external-link-alt"></i> ' + (_shrT('bio_preview') || 'Preview') + '</a>';
        html += '<button class="bio-action-btn" onclick="event.stopPropagation();window._bioShowStats(' + p.id + ')" title="Stats"><i class="fas fa-chart-bar"></i> ' + (_shrT('stats') || 'Stats') + '</button>';
        html += '<button class="bio-action-btn" onclick="event.stopPropagation();window._bioShowQR(' + p.id + ')" title="QR"><i class="fas fa-qrcode"></i> QR</button>';
        html += '<button class="bio-action-btn bio-action-ai" onclick="event.stopPropagation();window._bioShowAI(' + p.id + ')" title="AI Generate">&#10024; AI</button>';
        html += '<div class="bio-action-dropdown" onclick="event.stopPropagation()">';
        html += '<button class="bio-action-btn bio-action-more" onclick="event.stopPropagation();this.parentElement.classList.toggle(\'open\')" title="' + (_shrT('bio_more_actions') || 'More') + '"><i class="fas fa-ellipsis-h"></i></button>';
        html += '<div class="bio-dropdown-menu">';
        html += '<button onclick="event.stopPropagation();window._bioEditPage(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-pen"></i> ' + (_shrT('edit') || 'Edit') + '</button>';
        html += '<button onclick="event.stopPropagation();window._bioShowAI(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-magic"></i> ' + (_shrT('bio_ai_generate') || 'AI Generate') + '</button>';
        html += '<button onclick="event.stopPropagation();window._bioShowABTest(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-flask"></i> ' + (_shrT('bio_ab_title') || 'A/B Test') + '</button>';
        html += '<button onclick="event.stopPropagation();window._bioShowProducts(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-shopping-bag"></i> ' + (_shrT('mp_bio_products') || 'Products') + '</button>';
        html += '<button onclick="event.stopPropagation();window._bioShowDomain(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-globe"></i> ' + (_shrT('cd_title') || 'Domain') + '</button>';
        html += '<button onclick="event.stopPropagation();window._bioClonePage(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-copy"></i> ' + (_shrT('bio_clone') || 'Clone') + '</button>';
        html += '<div class="bio-dropdown-divider"></div>';
        html += '<button class="bio-dropdown-danger" onclick="event.stopPropagation();window._bioDeletePage(' + p.id + ');this.closest(\'.bio-action-dropdown\').classList.remove(\'open\')"><i class="fas fa-trash"></i> ' + (_shrT('bio_delete') || 'Delete') + '</button>';
        html += '</div></div>';
        html += '</div>';
        html += '</div></div>';
      }
      html += '</div>';
    }

    html += '</div>';
    panel.innerHTML = html;
    // Close dropdown on outside click
    document.addEventListener('click', function(e) {
      if (!e.target.closest('.bio-action-dropdown')) {
        document.querySelectorAll('.bio-action-dropdown.open').forEach(function(d) { d.classList.remove('open'); });
      }
    });
  } catch (e) {
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; }
    panel.innerHTML = '<div style="color:red;padding:20px">' + _shrT('error') + ': ' + _shrEsc(e.message) + '</div>';
  }
}

// Create new bio page
window._bioCreatePage = async function() {
  const panel = _shrPanelEl();
  if (!panel) return;

  panel.innerHTML = '<div class="bio-page-editor">' +
    '<div class="bio-editor-header">' +
    '<button class="btn btn-sm" onclick="_shrRenderBioManager()">\u2190 ' + (_shrT('back') || 'Back') + '</button>' +
    '<h3>' + (_shrT('bio_new_page') || 'New Bio Page') + '</h3>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px">' +
    '<div><label>' + ((_shrT('bio_page_login') || (window.currentLang === 'ru' ? 'Логин вашей страницы' : 'Your page login'))) + '</label>' +
    '<input type="text" id="bio-new-username" class="shr-input" placeholder="your-name" oninput="var p=document.getElementById(\x27bio-new-urlprev\x27);if(p)p.innerHTML=\x27\x1F517 goldenConnect.to/bio/<b>\x27+this.value.toLowerCase().replace(/[^a-z0-9._-]/g,\x27\x27)+\x27</b>\x27" />' +
    '<div id="bio-new-urlprev" style="font-size:12px;color:#667eea;margin-top:6px;font-weight:500;word-break:break-all">\x1F517 goldenConnect.to/bio/<b>your-name</b></div></div>' +
    '<div><label>' + (_shrT('bio_page_name') || 'Page Name') + '</label>' +
    '<input type="text" id="bio-new-pagename" class="shr-input" value="My Bio" /></div>' +
    '</div>' +
    '<div style="margin-top:12px"><label>' + (_shrT('bio_display_name') || 'Display Name') + '</label>' +
    '<input type="text" id="bio-new-displayname" class="shr-input" placeholder="Your Name" /></div>' +
    '<div style="margin-top:16px;display:flex;gap:12px">' +
    '<button class="btn btn-primary" onclick="window._bioSaveNewPage()">\u2713 ' + (_shrT('bio_create') || 'Create') + '</button>' +
    '<button class="btn" onclick="_shrRenderBioManager()">' + (_shrT('cancel') || 'Cancel') + '</button>' +
    '</div></div>';
};

window._bioSaveNewPage = async function() {
  const username = (document.getElementById('bio-new-username')?.value || '').trim().toLowerCase();
  const pageName = (document.getElementById('bio-new-pagename')?.value || '').trim();
  const displayName = (document.getElementById('bio-new-displayname')?.value || '').trim();
  if (!username) { showToast((window.currentLang === 'ru' ? 'Введите логин для страницы' : 'Page login required'), 'error'); return; }
  try {
    var res = await API.post('/cabinet/api/shortener/bio/pages', { username, page_name: pageName, display_name: displayName, slug: username });
    if (res.error) { showToast(res.error, 'error'); return; }
    showToast((_shrT('bio_created') || 'Bio page created!'), 'success');
    _shrRenderBioManager();
  } catch(e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

// Edit page
window._bioEditPage = async function(id) {
  const panel = _shrPanelEl();
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:30px">' + _shrT('loading') + '...</div>';

  try {
    const res = await API.get('/cabinet/api/shortener/bio/pages/' + id);
    _bioCurrentPage = res.page;
    const p = _bioCurrentPage;
    const bioColors = ['#667eea','#764ba2','#f5576c','#4facfe','#43e97b','#fa709a','#30cfd0','#f093fb','#ffd700','#ff6b6b','#1a1a2e','#0f172a'];

    let html = '<div class="bio-page-editor">';

    // Header with back button
    html += '<div class="bio-editor-header">';
    html += '<button class="btn btn-sm" onclick="_shrRenderBioManager()">\u2190 ' + (_shrT('back') || 'Back') + '</button>';
    html += '<h3>' + _shrEsc(p.page_name || 'Edit Page') + '</h3>';
    html += '<a href="/bio/' + _shrEsc(p.username) + '" target="_blank" class="btn btn-sm">\u{1F441} ' + (_shrT('bio_preview') || 'Preview') + '</a>';
    html += '</div>';

    // URL info
    html += '<p style="color:var(--text-secondary);margin:8px 0 16px;font-size:0.85rem">' + (_shrT('bio_url') || 'URL') + ': <a href="https://goldenConnect.to/bio/' + _shrEsc(p.username) + '" target="_blank">goldenConnect.to/bio/' + _shrEsc(p.username) + '</a></p>';

    // === Basic Info ===
    html += '<div class="bio-editor-section">';
    html += '<h4>' + (_shrT('bio_basic_info') || 'Basic Info') + '</h4>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    html += '<div><label>' + ((_shrT('bio_page_login') || (window.currentLang === 'ru' ? 'Логин вашей страницы' : 'Your page login'))) + '</label>';
    html += '<input type="text" id="bio-ed-username" class="shr-input" value="' + _shrEsc(p.username || '') + '" oninput="var p=document.getElementById(\x27bio-ed-urlprev\x27);if(p)p.innerHTML=\x27\x1F517 goldenConnect.to/bio/<b>\x27+this.value.toLowerCase().replace(/[^a-z0-9._-]/g,\x27\x27)+\x27</b>\x27" />';
    html += '<div id="bio-ed-urlprev" style="font-size:12px;color:#667eea;margin-top:6px;font-weight:500;word-break:break-all">\x1F517 goldenConnect.to/bio/<b>' + _shrEsc(p.username || '') + '</b></div></div>';
    html += '<div><label>' + (_shrT('bio_page_name') || 'Page Name') + '</label>';
    html += '<input type="text" id="bio-ed-pagename" class="shr-input" value="' + _shrEsc(p.page_name || '') + '" /></div>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px">';
    html += '<div><label>' + (_shrT('bio_display_name') || 'Display Name') + '</label>';
    html += '<input type="text" id="bio-ed-displayname" class="shr-input" value="' + _shrEsc(p.display_name || '') + '" /></div>';
    html += '<div><label>' + (_shrT('bio_avatar') || 'Avatar URL') + '</label>';
    html += '<input type="url" id="bio-ed-avatar" class="shr-input" value="' + _shrEsc(p.avatar_url || '') + '" placeholder="https://..." /></div>';
    html += '</div>';
    html += '<label style="margin-top:8px">' + (_shrT('bio_text') || 'Bio') + '</label>';
    html += '<textarea id="bio-ed-bio" class="shr-input" rows="3" maxlength="500">' + _shrEsc(p.bio || '') + '</textarea>';
    html += '</div>';

    // === Theme ===
    html += '<div class="bio-editor-section">';
    html += '<h4>' + (_shrT('bio_theme') || 'Theme') + '</h4>';
    html += '<label>' + (_shrT('bio_theme_color') || 'Color') + '</label>';
    html += '<div class="shr-color-swatches" id="bio-ed-colors">';
    html += bioColors.map(function(c) { return '<div class="shr-color-swatch ' + ((p.theme_color || '#667eea') === c ? 'active' : '') + '" style="background:' + c + '" onclick="window._bioSelectColor(\'' + c + '\')"></div>'; }).join('');
    html += '</div>';
    html += '<input type="hidden" id="bio-ed-color" value="' + _shrEsc(p.theme_color || '#667eea') + '" />';

    // Background
    html += '<label style="margin-top:12px">' + (_shrT('bio_background') || 'Background') + '</label>';
    html += '<div class="shr-bg-picker" id="bio-ed-bg-picker">';
    var bgTypes = ['gradient','solid','dots','waves','particles','mesh','aurora','matrix','confetti','gradient-shift','bokeh','noise','custom-image','custom-video'];
    var bgLabels = {gradient:'Gradient',solid:'Solid',dots:'Dots',waves:'Waves',particles:'Particles',mesh:'Mesh',aurora:'Aurora',matrix:'Matrix',confetti:'Confetti','gradient-shift':'Shift',bokeh:'Bokeh',noise:'Noise','custom-image':'Image','custom-video':'Video'};
    html += bgTypes.map(function(bg) {
      return '<div class="shr-bg-option ' + ((p.background||'gradient')===bg?'active':'') + '" data-bg="' + bg + '" onclick="window._bioSelectBg(\'' + bg + '\')">' +
        '<div class="shr-bg-thumb shr-bg-thumb-' + bg + '"></div><span>' + (bgLabels[bg]||bg) + '</span></div>';
    }).join('');
    html += '</div>';
    html += '<input type="hidden" id="bio-ed-bg" value="' + _shrEsc(p.background || 'gradient') + '" />';
    html += '<div id="bio-ed-custom-bg" style="display:' + ((p.background||'').startsWith('custom')?'block':'none') + ';margin-top:10px">';
    html += '<input type="url" id="bio-ed-bg-image" class="shr-input shr-input-sm" value="' + _shrEsc(p.bg_image || '') + '" placeholder="Image URL" style="margin-bottom:6px;display:' + (p.background==='custom-image'?'block':'none') + '" />';
    html += '<input type="url" id="bio-ed-bg-video" class="shr-input shr-input-sm" value="' + _shrEsc(p.bg_video || '') + '" placeholder="Video URL (.mp4)" style="display:' + (p.background==='custom-video'?'block':'none') + '" />';
    html += '</div>';

    // Button style
    html += '<label style="margin-top:12px">' + (_shrT('bio_btn_style') || 'Button Style') + '</label>';
    html += '<div class="shr-btn-style-picker" id="bio-ed-btn-styles">';
    html += BIO_BTN_STYLES.map(function(s) {
      return '<div class="shr-btn-style-option ' + ((p.button_style || 'glass') === s.key ? 'active' : '') + '" data-style="' + s.key + '" onclick="window._bioSelectBtnStyle(\'' + s.key + '\')">' +
        '<div class="shr-btn-style-preview shr-btn-preview-' + s.key + '">Link</div><span>' + s.label + '</span></div>';
    }).join('');
    html += '</div>';
    html += '<input type="hidden" id="bio-ed-btn-style" value="' + _shrEsc(p.button_style || 'glass') + '" />';
    html += '</div>';

    // === Links ===
    html += '<div class="bio-editor-section">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    html += '<h4>\u{1F517} ' + (_shrT('bio_links') || 'Links') + ' (' + (p.links ? p.links.length : 0) + ')</h4>';
    html += '<div class="bio-block-type-selector">';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'link\')"><i class="fas fa-link"></i> ' + (_shrT('bio_add_link') || 'Link') + '</button>';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'heading\')"><i class="fas fa-heading"></i> ' + (_shrT('bio_add_heading') || 'Heading') + '</button>';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'text\')"><i class="fas fa-align-left"></i> ' + (_shrT('bio_add_text') || 'Text') + '</button>';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'image\')"><i class="fas fa-image"></i> ' + (_shrT('bio_add_image') || 'Image') + '</button>';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'divider\')"><i class="fas fa-minus"></i> ' + (_shrT('bio_add_divider') || 'Divider') + '</button>';
    html += '<button class="bio-block-type-btn" onclick="window._bioAddBlock(\'shop_widget\')"><i class="fas fa-store"></i> 🛍 Мой магазин</button>';
    html += '</div>';
    html += '</div>';
    html += '<div id="bio-ed-links" class="bio-links-list">';
    if (p.links && p.links.length > 0) {
      html += _bioRenderLinks(p.links);
    } else {
      html += '<p style="color:var(--text-secondary);padding:12px;text-align:center">' + (_shrT('bio_no_links') || 'No links yet. Add your first link!') + '</p>';
    }
    html += '</div></div>';

    // === Social Icons ===
    html += '<div class="bio-editor-section">';
    html += '<h4>\u{1F310} ' + (_shrT('bio_social_links') || 'Social Links') + '</h4>';
    html += '<div class="shr-bio-social-grid">';
    var socialPlatforms = ['instagram','tiktok','youtube','telegram','twitter','vk','facebook','linkedin','whatsapp','github','spotify','pinterest','website'];
    var socialIcons = {instagram:'\u{1F4F7}',tiktok:'\u{1F3B5}',youtube:'\u{1F534}',telegram:'\u2708',twitter:'\u{1D54F}',vk:'VK',facebook:'f',linkedin:'in',whatsapp:'\u{1F4DE}',github:'\u{1F431}',spotify:'\u{1F3B5}',pinterest:'P',website:'\u{1F310}'};
    var socialPlaceholders = {instagram:'https://instagram.com/...',tiktok:'https://tiktok.com/@...',youtube:'https://youtube.com/...',telegram:'https://t.me/...',twitter:'https://x.com/...',vk:'https://vk.com/...',facebook:'https://facebook.com/...',linkedin:'https://linkedin.com/in/...',whatsapp:'https://wa.me/...',github:'https://github.com/...',spotify:'https://open.spotify.com/...',pinterest:'https://pinterest.com/...',website:'https://...'};

    // Build a map from current socials
    var socialMap = {};
    if (p.socials) p.socials.forEach(function(s) { socialMap[s.platform] = s.url; });

    socialPlatforms.forEach(function(platform) {
      html += '<div class="shr-bio-social-row">';
      html += '<span class="shr-bio-social-icon">' + (socialIcons[platform] || platform) + '</span>';
      html += '<input type="url" id="bio-ed-social-' + platform + '" class="shr-input shr-input-sm" value="' + _shrEsc(socialMap[platform] || '') + '" placeholder="' + (socialPlaceholders[platform] || '') + '" />';
      html += '</div>';
    });
    html += '</div></div>';

    // === SEO ===
    html += '<div class="bio-editor-section">';
    html += '<h4>\u{1F50D} SEO</h4>';
    html += '<label>' + (_shrT('bio_meta_title') || 'Meta Title') + '</label>';
    html += '<input type="text" id="bio-ed-meta-title" class="shr-input" value="' + _shrEsc(p.meta_title || '') + '" placeholder="' + (_shrT('bio_meta_title_hint') || 'Custom page title for search engines') + '" />';
    html += '<label style="margin-top:8px">' + (_shrT('bio_meta_desc') || 'Meta Description') + '</label>';
    html += '<textarea id="bio-ed-meta-desc" class="shr-input" rows="2" maxlength="500">' + _shrEsc(p.meta_description || '') + '</textarea>';
    html += '</div>';

    // === Settings ===
    html += '<div class="bio-editor-section">';
    html += '<label><input type="checkbox" id="bio-ed-public" ' + (p.is_public ? 'checked' : '') + ' /> ' + (_shrT('bio_public') || 'Public page') + '</label>';
    html += '<label style="margin-left:16px"><input type="checkbox" id="bio-ed-avatar-show" ' + (p.show_avatar ? 'checked' : '') + ' /> ' + (_shrT('bio_show_avatar') || 'Show avatar') + '</label>';
    html += '</div>';

    // === Save ===
    html += '<div style="margin-top:16px;display:flex;gap:12px">';
    html += '<button class="btn btn-sm btn-outline" onclick="_bioShowAI(' + id + ')" title="AI"><i class="fas fa-magic"></i> AI</button>' +
            '<button class="btn btn-primary" onclick="window._bioSavePage(' + p.id + ')">\u2713 ' + (_shrT('bio_save') || 'Save') + '</button>';
    html += '<button class="btn" onclick="_shrRenderBioManager()">' + (_shrT('back') || 'Back') + '</button>';
    html += '</div>';

    // === Preview ===
    html += '<div style="margin-top:20px">';
    html += '<h4>' + (_shrT('bio_preview') || 'Preview') + '</h4>';
    html += '<div class="shr-bio-preview-frame">';
    html += '<iframe src="/bio/' + _shrEsc(p.username) + '" id="bio-ed-iframe"></iframe>';
    html += '</div></div>';

    html += '</div>';
    panel.innerHTML = html;
  } catch(e) {
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; }
    panel.innerHTML = '<div style="color:red;padding:20px">' + _shrT('error') + ': ' + _shrEsc(e.message) + '</div>';
  }
};

function _bioRenderLinks(links) {
  var html = '';
  if (!links || links.length === 0) {
    html += '<p style="color:var(--text-secondary);text-align:center;padding:16px">No blocks yet. Add links, text, images below.</p>';
    return html;
  }
  links.forEach(function(l, i) {
    var type = l.type || 'link';
    html += '<div class="bio-block-item" draggable="true" ondragstart="window._bioDragStart(event,' + l.id + ')" ondragover="event.preventDefault()" ondrop="window._bioDrop(event,' + l.id + ')">';
    html += '<div class="bio-block-item-header">';
    html += '<span class="bio-block-item-type">';
    if (type === 'link') html += '<i class="fas fa-link"></i> Link';
    else if (type === 'heading') html += '<i class="fas fa-heading"></i> Heading';
    else if (type === 'text') html += '<i class="fas fa-align-left"></i> Text';
    else if (type === 'image') html += '<i class="fas fa-image"></i> Image';
    else if (type === 'divider') html += '<i class="fas fa-minus"></i> Divider';
    else html += '<i class="fas fa-link"></i> Link';
    html += '</span>';
    html += '<div class="bio-block-item-controls">';
    if (type === 'link') {
      var tog = l.is_active ? 'checked' : '';
      html += '<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" ' + tog + ' onchange="window._bioToggleLink(' + _bioCurrentPage.id + ',' + l.id + ',this.checked)" style="accent-color:#667eea"> <span style="font-size:0.7rem;color:var(--text-secondary)">ON</span></label>';
    }
    html += '<button class="bio-block-del" onclick="window._bioDeleteLink(' + _bioCurrentPage.id + ',' + l.id + ')" title="Delete"><i class="fas fa-trash"></i></button>';
    html += '</div></div>';
    if (type === 'link') {
      html += '<input class="shr-input" style="margin-bottom:6px;font-weight:600" placeholder="Link title" value="' + _shrEsc(l.title || '') + '" onchange="window._bioUpdateBlock(' + l.id + ',\'title\',this.value)">';
      html += '<input class="shr-input" placeholder="https://..." value="' + _shrEsc(l.url || '') + '" onchange="window._bioUpdateBlock(' + l.id + ',\'url\',this.value)">';
    } else if (type === 'heading') {
      html += '<input class="shr-input" style="font-weight:700;font-size:1rem" placeholder="Heading text" value="' + _shrEsc(l.title || '') + '" onchange="window._bioUpdateBlock(' + l.id + ',\'title\',this.value)">';
    } else if (type === 'text') {
      html += '<textarea class="bio-block-text-content" placeholder="Your text..." onchange="window._bioUpdateBlock(' + l.id + ',\'content\',this.value)">' + _shrEsc(l.content || '') + '</textarea>';
    } else if (type === 'image') {
      html += '<input class="bio-block-image-url" placeholder="Image URL (https://...)" value="' + _shrEsc(l.url || '') + '" onchange="window._bioUpdateBlock(' + l.id + ',\'url\',this.value);var img=this.nextElementSibling;if(this.value)img.src=this.value;img.style.display=this.value?\'block\':\'none\'">';
      html += '<img class="bio-block-image-preview" src="' + _shrEsc(l.url || '') + '" style="display:' + (l.url ? 'block' : 'none') + '" onerror="this.style.display=\'none\'">';
    } else if (type === 'divider') {
      html += '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.15);margin:4px 0">';
    }
    html += '</div>';
  });
  return html;
}

// Save page
window._bioSavePage = async function(id) {
  var socialPlatforms = ['instagram','tiktok','youtube','telegram','twitter','vk','facebook','linkedin','whatsapp','github','spotify','pinterest','website'];
  var socials = [];
  socialPlatforms.forEach(function(platform) {
    var val = (document.getElementById('bio-ed-social-' + platform)?.value || '').trim();
    if (val) socials.push({ platform: platform, url: val });
  });

  // Save inline link edits
  var linkUpdates = [];
  document.querySelectorAll('.bio-link-item').forEach(function(el) {
    var lid = el.dataset.linkId;
    var title = el.querySelector('.bio-link-title')?.value || '';
    var url = el.querySelector('.bio-link-url')?.value || '';
    if (lid && url) linkUpdates.push({ id: Number(lid), title: title, url: url });
  });

  try {
    // 1. Save page settings
    await API.put('/cabinet/api/shortener/bio/pages/' + id, {
      username: (document.getElementById('bio-ed-username')?.value || '').trim().toLowerCase(),
      page_name: (document.getElementById('bio-ed-pagename')?.value || '').trim(),
      display_name: (document.getElementById('bio-ed-displayname')?.value || '').trim(),
      bio: (document.getElementById('bio-ed-bio')?.value || '').trim(),
      avatar_url: (document.getElementById('bio-ed-avatar')?.value || '').trim(),
      theme_color: document.getElementById('bio-ed-color')?.value || '#667eea',
      background: document.getElementById('bio-ed-bg')?.value || 'gradient',
      bg_image: (document.getElementById('bio-ed-bg-image')?.value || '').trim(),
      bg_video: (document.getElementById('bio-ed-bg-video')?.value || '').trim(),
      button_style: document.getElementById('bio-ed-btn-style')?.value || 'glass',
      is_public: document.getElementById('bio-ed-public')?.checked ? 1 : 0,
      show_avatar: document.getElementById('bio-ed-avatar-show')?.checked ? 1 : 0,
      meta_title: (document.getElementById('bio-ed-meta-title')?.value || '').trim(),
      meta_description: (document.getElementById('bio-ed-meta-desc')?.value || '').trim()
    });

    // 2. Save socials
    await API.put('/cabinet/api/shortener/bio/pages/' + id + '/socials', { socials: socials });

    // 3. Save inline link edits
    for (var lu of linkUpdates) {
      await API.put('/cabinet/api/shortener/bio/pages/' + id + '/links/' + lu.id, { title: lu.title, url: lu.url });
    }

    showToast((_shrT('bio_saved') || 'Saved!'), 'success');

    // Refresh iframe
    var iframe = document.getElementById('bio-ed-iframe');
    if (iframe) iframe.src = iframe.src;
  } catch(e) {
    showToast(e.message || _shrT('error'), 'error');
  }
};

// Theme selectors
window._bioSelectColor = function(color) {
  document.getElementById('bio-ed-color').value = color;
  document.querySelectorAll('#bio-ed-colors .shr-color-swatch').forEach(function(s) {
    s.classList.toggle('active', s.style.background === color || s.style.backgroundColor === color);
  });
};

window._bioSelectBg = function(bg) {
  document.getElementById('bio-ed-bg').value = bg;
  document.querySelectorAll('#bio-ed-bg-picker .shr-bg-option').forEach(function(el) { el.classList.toggle('active', el.dataset.bg === bg); });
  var cust = document.getElementById('bio-ed-custom-bg');
  if (cust) cust.style.display = bg.startsWith('custom') ? 'block' : 'none';
  var imgIn = document.getElementById('bio-ed-bg-image');
  var vidIn = document.getElementById('bio-ed-bg-video');
  if (imgIn) imgIn.style.display = bg === 'custom-image' ? 'block' : 'none';
  if (vidIn) vidIn.style.display = bg === 'custom-video' ? 'block' : 'none';
};

window._bioSelectBtnStyle = function(style) {
  document.getElementById('bio-ed-btn-style').value = style;
  document.querySelectorAll('#bio-ed-btn-styles .shr-btn-style-option').forEach(function(el) { el.classList.toggle('active', el.dataset.style === style); });
};

// Links CRUD
window._bioAddBlock = async function(type) {
  if (!_bioCurrentPage) return;
  type = type || 'link';
  var data = { type: type };
  if (type === 'link') { data.title = 'New Link'; data.url = ''; }
  else if (type === 'heading') { data.title = 'Heading'; }
  else if (type === 'text') { data.content = 'Your text here...'; }
  else if (type === 'image') { data.url = ''; }
  else if (type === 'divider') { data.title = '---'; }
  else if (type === 'shop_widget') { data.title = '🛍 Мой магазин'; data.content = JSON.stringify({ limit: 8, featured_only: false }); }
  try {
    var res = await API.post('/cabinet/api/shortener/bio/pages/' + _bioCurrentPage.id + '/links', data);
    if (res && res.link) {
      _bioCurrentPage.links = _bioCurrentPage.links || [];
      _bioCurrentPage.links.push(res.link);
      document.getElementById('bio-ed-links').innerHTML = _bioRenderLinks(_bioCurrentPage.links);
      showToast((_shrT('bio_link_added') || 'Block added'), 'success');
    }
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};
window._bioAddLink = function() { window._bioAddBlock('link'); };

window._bioDeleteLink = async function(pageId, linkId) {
  if (!confirm((_shrT('bio_delete_link_confirm') || 'Delete this link?'))) return;
  try {
    await API.del('/cabinet/api/shortener/bio/pages/' + pageId + '/links/' + linkId);
    if (_bioCurrentPage && _bioCurrentPage.links) {
      _bioCurrentPage.links = _bioCurrentPage.links.filter(function(l) { return l.id !== linkId; });
      document.getElementById('bio-ed-links').innerHTML = _bioRenderLinks(_bioCurrentPage.links);
    }
    showToast((_shrT('bio_link_deleted') || 'Link deleted'), 'success');
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

window._bioUpdateBlock = async function(linkId, field, value) {
  if (!_bioCurrentPage) return;
  var data = {};
  data[field] = value;
  try {
    await API.put('/cabinet/api/shortener/bio/pages/' + _bioCurrentPage.id + '/links/' + linkId, data);
    if (_bioCurrentPage.links) {
      var link = _bioCurrentPage.links.find(function(l) { return l.id === linkId; });
      if (link) link[field] = value;
    }
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

window._bioToggleLink = async function(pageId, linkId, active) {
  try {
    await API.put('/cabinet/api/shortener/bio/pages/' + pageId + '/links/' + linkId, { is_active: active ? 1 : 0 });
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

// Drag & drop reorder
window._bioDragStart = function(e, id) {
  _bioDragItem = id;
  e.dataTransfer.effectAllowed = 'move';
};

window._bioDragOver = function(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
};

window._bioDrop = async function(e, targetId) {
  e.preventDefault();
  if (!_bioDragItem || _bioDragItem === targetId || !_bioCurrentPage) return;
  var links = _bioCurrentPage.links || [];
  var fromIdx = links.findIndex(function(l) { return l.id === _bioDragItem; });
  var toIdx = links.findIndex(function(l) { return l.id === targetId; });
  if (fromIdx === -1 || toIdx === -1) return;
  var item = links.splice(fromIdx, 1)[0];
  links.splice(toIdx, 0, item);
  _bioCurrentPage.links = links;
  document.getElementById('bio-ed-links').innerHTML = _bioRenderLinks(links);

  var order = links.map(function(l) { return l.id; });
  try {
    await API.put('/cabinet/api/shortener/bio/pages/' + _bioCurrentPage.id + '/links/reorder', { order: order });
  } catch(e) {}
  _bioDragItem = null;
};

// Clone page
window._bioClonePage = async function(id) {
  try {
    await API.post('/cabinet/api/shortener/bio/pages/' + id + '/clone');
    showToast((_shrT('bio_cloned') || 'Page cloned!'), 'success');
    _shrRenderBioManager();
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

// Delete page
window._bioDeletePage = async function(id) {
  if (!confirm((_shrT('bio_delete_confirm') || 'Delete this bio page? This cannot be undone.'))) return;
  try {
    var _delRes = await API.del('/cabinet/api/shortener/bio/pages/' + id);
    if (_delRes.error) { showToast(_delRes.error, 'error'); return; }
    showToast((_shrT('bio_deleted') || 'Bio page deleted'), 'success');
    _shrRenderBioManager();
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

// Keep backward compat aliases
window._shrSelectBg = window._bioSelectBg;
window._shrSelectBtnStyle = window._bioSelectBtnStyle;
window._shrSelectBioColor = window._bioSelectColor;
window._shrSaveBio = function() { if (_bioCurrentPage) window._bioSavePage(_bioCurrentPage.id); };


// ===================== AI BIO GENERATION (Phase 4) =====================
window._bioShowAI = function(pageId) {
  const t = _shrT;
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'bioAIModal';
  modal.innerHTML = `
    <div class="modal-content bio-ai-modal">
      <div class="modal-header">
        <h3>${t('bio_ai_title')}</h3>
        <button class="modal-close" onclick="document.getElementById('bioAIModal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>${t('bio_ai_description')}</label>
          <textarea id="bioAIDesc" rows="4" class="form-control" placeholder="${t('bio_ai_placeholder')}"></textarea>
        </div>
        <div class="bio-ai-options">
          <div class="form-group" style="flex:1">
            <label>${t('bio_ai_language')}</label>
            <select id="bioAILang" class="form-control">
              <option value="en">English</option>
              <option value="ru">Русский</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="pt">Português</option>
              <option value="ar">العربية</option>
              <option value="tr">Türkçe</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>${t('bio_ai_style')}</label>
            <select id="bioAIStyle" class="form-control">
              <option value="professional">${t('bio_ai_professional')}</option>
              <option value="creative">${t('bio_ai_creative')}</option>
              <option value="minimal">${t('bio_ai_minimal')}</option>
              <option value="bold">${t('bio_ai_bold')}</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary bio-ai-generate-btn" onclick="_bioRunAI(${pageId})">
          <span class="bio-ai-btn-text">${t('bio_ai_generate')}</span>
          <span class="bio-ai-spinner" style="display:none"><i class="fas fa-spinner fa-spin"></i></span>
        </button>
        <div id="bioAIResult" style="display:none">
          <hr>
          <h4>${t('bio_ai_result')}</h4>
          <div id="bioAIPreview"></div>
          <div class="bio-ai-actions">
            <button class="btn btn-success" onclick="_bioApplyAI(${pageId}, 'all')">${t('bio_ai_apply_all')}</button>
            <button class="btn btn-outline" onclick="_bioApplyAI(${pageId}, 'text')">${t('bio_ai_apply_text')}</button>
            <button class="btn btn-outline" onclick="_bioApplyAI(${pageId}, 'theme')">${t('bio_ai_apply_theme')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Set language based on current i18n
  const curLang = localStorage.getItem('language') || 'en';
  const langSel = document.getElementById('bioAILang');
  if (langSel) {
    const opt = langSel.querySelector('option[value="' + curLang + '"]');
    if (opt) langSel.value = curLang;
  }
};

window._bioAIData = null;

window._bioRunAI = async function(pageId) {
  const desc = document.getElementById('bioAIDesc')?.value?.trim();
  if (!desc || desc.length < 10) {
    showToast(_shrT('bio_ai_desc_short'), 'error');
    return;
  }

  const btn = document.querySelector('.bio-ai-generate-btn');
  const btnText = btn?.querySelector('.bio-ai-btn-text');
  const spinner = btn?.querySelector('.bio-ai-spinner');
  if (btn) btn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (spinner) spinner.style.display = 'inline';

  try {
    const resp = await API.post('/cabinet/api/shortener/bio/ai-generate', {
      business_description: desc,
      language: document.getElementById('bioAILang')?.value || 'en',
      style: document.getElementById('bioAIStyle')?.value || 'professional'
    });

    if (!resp.success || !resp.result) {
      showToast(resp.error || 'AI generation failed', 'error');
      return;
    }

    window._bioAIData = resp.result;
    const r = resp.result;

    // Render preview
    const preview = document.getElementById('bioAIPreview');
    if (preview) {
      let html = '<div class="bio-ai-preview-card">';
      html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_ai_name') + ':</strong> ' + _escHtml(r.display_name) + '</div>';
      html += '<div class="bio-ai-preview-row"><strong>Bio:</strong> ' + _escHtml(r.bio) + '</div>';
      html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_ai_bg') + ':</strong> <span class="badge">' + r.recommended_background + '</span></div>';
      html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_ai_btn') + ':</strong> <span class="badge">' + r.recommended_button_style + '</span></div>';
      html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_ai_color') + ':</strong> <span style="display:inline-block;width:20px;height:20px;border-radius:4px;background:' + r.recommended_theme_color + ';vertical-align:middle"></span> ' + r.recommended_theme_color + '</div>';
      if (r.suggested_links?.length) {
        html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_links') + ':</strong><ul>';
        r.suggested_links.forEach(l => { html += '<li>' + _escHtml(l.title) + ' &mdash; <a href="' + _escHtml(l.url) + '" target="_blank">' + _escHtml(l.url) + '</a></li>'; });
        html += '</ul></div>';
      }
      if (r.suggested_socials?.length) {
        html += '<div class="bio-ai-preview-row"><strong>' + _shrT('bio_ai_socials') + ':</strong> ' + r.suggested_socials.join(', ') + '</div>';
      }
      if (r.meta_title) html += '<div class="bio-ai-preview-row"><strong>SEO Title:</strong> ' + _escHtml(r.meta_title) + '</div>';
      if (r.meta_description) html += '<div class="bio-ai-preview-row"><strong>SEO Desc:</strong> ' + _escHtml(r.meta_description) + '</div>';
      html += '</div>';
      preview.innerHTML = html;
    }

    document.getElementById('bioAIResult').style.display = 'block';
    showToast(_shrT('bio_ai_success'), 'success');
  } catch(e) {
    showToast(e.message || 'AI generation failed', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.style.display = 'inline';
    if (spinner) spinner.style.display = 'none';
  }
};

window._bioApplyAI = async function(pageId, mode) {
  const data = window._bioAIData;
  if (!data) return;

  // Get current page data
  try {
    const resp = await API.get('/cabinet/api/shortener/bio/pages/' + pageId);
    if (!resp.page) return;

    const updates = {};
    if (mode === 'all' || mode === 'text') {
      if (data.display_name) updates.display_name = data.display_name;
      if (data.bio) updates.bio = data.bio;
      if (data.meta_title) updates.meta_title = data.meta_title;
      if (data.meta_description) updates.meta_description = data.meta_description;
    }
    if (mode === 'all' || mode === 'theme') {
      if (data.recommended_theme_color) updates.theme_color = data.recommended_theme_color;
      if (data.recommended_background) updates.background = data.recommended_background;
      if (data.recommended_button_style) updates.button_style = data.recommended_button_style;
    }

    // Apply updates to page
    if (Object.keys(updates).length > 0) {
      const merged = { ...resp.page, ...updates };
      await API.put('/cabinet/api/shortener/bio/pages/' + pageId, merged);
    }

    // Add suggested links (if mode=all)
    if ((mode === 'all') && data.suggested_links?.length) {
      for (const link of data.suggested_links) {
        if (link.title && link.url) {
          try { await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/links', link); } catch(e) {}
        }
      }
    }

    // Close modal and reload editor
    document.getElementById('bioAIModal')?.remove();
    showToast(_shrT('bio_ai_applied'), 'success');
    _bioEditPage(pageId);
  } catch(e) {
    showToast(e.message || 'Apply failed', 'error');
  }
};

function _escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
// ===================== END AI BIO GENERATION =====================

// ===================== A/B TESTING (Phase 5) =====================
window._bioShowABTest = async function(pageId) {
  const t = _shrT;
  try {
    const resp = await API.get('/cabinet/api/shortener/bio/pages/' + pageId + '/ab-test');
    const pageResp = await API.get('/cabinet/api/shortener/bio/pages/' + pageId);
    const tests = resp.tests || [];
    const page = pageResp.page;
    const activeTest = tests.find(t => t.is_active);
    const pastTests = tests.filter(t => !t.is_active);

    let html = '<div class="bio-ab-container">';
    html += '<h3>' + t('bio_ab_title') + '</h3>';

    if (activeTest) {
      const ctrA = activeTest.impressions_a > 0 ? (activeTest.clicks_a / activeTest.impressions_a * 100).toFixed(1) : '0.0';
      const ctrB = activeTest.impressions_b > 0 ? (activeTest.clicks_b / activeTest.impressions_b * 100).toFixed(1) : '0.0';
      html += '<div class="bio-ab-active">';
      html += '<div class="bio-ab-badge">' + t('bio_ab_active') + '</div>';
      html += '<h4>' + _escHtml(activeTest.name) + '</h4>';
      html += '<div class="bio-ab-split">' + t('bio_ab_split') + ': ' + activeTest.split_ratio + '% A / ' + (100 - activeTest.split_ratio) + '% B</div>';
      html += '<div class="bio-ab-comparison">';
      html += '<div class="bio-ab-variant">';
      html += '<div class="bio-ab-variant-label">A (' + t('bio_ab_original') + ')</div>';
      html += '<div class="bio-ab-metric"><span class="bio-ab-number">' + activeTest.impressions_a + '</span> ' + t('bio_ab_impressions') + '</div>';
      html += '<div class="bio-ab-metric"><span class="bio-ab-number">' + activeTest.clicks_a + '</span> ' + t('bio_ab_clicks') + '</div>';
      html += '<div class="bio-ab-metric">CTR: <span class="bio-ab-number">' + ctrA + '%</span></div>';
      html += '</div>';
      html += '<div class="bio-ab-vs">VS</div>';
      html += '<div class="bio-ab-variant">';
      html += '<div class="bio-ab-variant-label">B (' + t('bio_ab_variant') + ')</div>';
      html += '<div class="bio-ab-metric"><span class="bio-ab-number">' + activeTest.impressions_b + '</span> ' + t('bio_ab_impressions') + '</div>';
      html += '<div class="bio-ab-metric"><span class="bio-ab-number">' + activeTest.clicks_b + '</span> ' + t('bio_ab_clicks') + '</div>';
      html += '<div class="bio-ab-metric">CTR: <span class="bio-ab-number">' + ctrB + '%</span></div>';
      html += '</div>';
      html += '</div>';
      html += '<div class="bio-ab-actions">';
      html += '<button class="btn btn-danger" onclick="_bioEndABTest(' + pageId + ',' + activeTest.id + ')">' + t('bio_ab_end') + '</button>';
      html += '</div>';
      html += '</div>';
    } else {
      // Create new test form
      html += '<div class="bio-ab-create">';
      html += '<p>' + t('bio_ab_desc') + '</p>';
      html += '<div class="form-group"><label>' + t('bio_ab_test_name') + '</label>';
      html += '<input type="text" id="abTestName" class="form-control" value="A/B Test" maxlength="100"></div>';
      html += '<div class="form-group"><label>' + t('bio_ab_split_ratio') + '</label>';
      html += '<input type="range" id="abSplitRatio" min="10" max="90" value="50" class="form-control" oninput="document.getElementById(\'abSplitLabel\').textContent=this.value+\'% A / \'+(100-this.value)+\'% B\'">';
      html += '<span id="abSplitLabel">50% A / 50% B</span></div>';
      html += '<hr>';
      html += '<h4>' + t('bio_ab_variant_b') + '</h4>';
      html += '<div class="form-group"><label>' + t('bio_display_name') + '</label>';
      html += '<input type="text" id="abVarName" class="form-control" value="' + _escHtml(page?.display_name || '') + '"></div>';
      html += '<div class="form-group"><label>Bio</label>';
      html += '<textarea id="abVarBio" class="form-control" rows="2">' + _escHtml(page?.bio || '') + '</textarea></div>';
      html += '<div class="form-group"><label>' + t('bio_theme_color') + '</label>';
      html += '<input type="color" id="abVarColor" class="form-control" value="' + (page?.theme_color || '#667eea') + '"></div>';
      html += '<div class="form-group"><label>' + t('bio_ai_bg') + '</label>';
      html += '<select id="abVarBg" class="form-control">';
      ['gradient','particles','waves','matrix','aurora','starfield','geometric','bubbles','lightning','rain','fireflies','galaxy','smoke','ripple'].forEach(function(bg) {
        html += '<option value="' + bg + '"' + (bg === page?.background ? ' selected' : '') + '>' + bg + '</option>';
      });
      html += '</select></div>';
      html += '<div class="form-group"><label>' + t('bio_ai_btn') + '</label>';
      html += '<select id="abVarBtn" class="form-control">';
      ['glass','outline','neon','minimal','gradient','shadow','pill','flat'].forEach(function(s) {
        html += '<option value="' + s + '"' + (s === page?.button_style ? ' selected' : '') + '>' + s + '</option>';
      });
      html += '</select></div>';
      html += '<button class="btn btn-primary" onclick="_bioStartABTest(' + pageId + ')">' + t('bio_ab_start') + '</button>';
      html += '</div>';
    }

    // Past tests
    if (pastTests.length > 0) {
      html += '<h4 style="margin-top:24px">' + t('bio_ab_history') + '</h4>';
      html += '<div class="bio-ab-history">';
      pastTests.forEach(function(pt) {
        var cA = pt.impressions_a > 0 ? (pt.clicks_a / pt.impressions_a * 100).toFixed(1) : '0.0';
        var cB = pt.impressions_b > 0 ? (pt.clicks_b / pt.impressions_b * 100).toFixed(1) : '0.0';
        html += '<div class="bio-ab-history-item">';
        html += '<strong>' + _escHtml(pt.name) + '</strong>';
        html += '<span class="bio-ab-winner">' + (pt.winner === 'A' ? 'A' : pt.winner === 'B' ? 'B' : t('bio_ab_tie')) + '</span>';
        html += '<span>A: ' + cA + '% CTR | B: ' + cB + '% CTR</span>';
        html += '<div class="bio-ab-history-actions">';
        if (pt.winner === 'B') {
          html += '<button class="btn btn-sm btn-success" onclick="_bioApplyVariantB(' + pageId + ',' + pt.id + ')">' + t('bio_ab_apply_b') + '</button>';
        }
        html += '<button class="btn btn-sm btn-danger" onclick="_bioDeleteABTest(' + pageId + ',' + pt.id + ')">' + t('bio_delete') + '</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '</div>';
    }

    html += '</div>';

    // Show in modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'bioABModal';
    modal.innerHTML = '<div class="modal-content bio-ab-modal"><div class="modal-header"><h3>' + t('bio_ab_title') + '</h3><button class="modal-close" onclick="document.getElementById(\'bioABModal\').remove()">&times;</button></div><div class="modal-body">' + html + '</div></div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  } catch(e) {
    showToast(e.message || 'Error loading A/B tests', 'error');
  }
};

window._bioStartABTest = async function(pageId) {
  try {
    const variantB = {
      display_name: document.getElementById('abVarName')?.value || '',
      bio: document.getElementById('abVarBio')?.value || '',
      theme_color: document.getElementById('abVarColor')?.value || '#667eea',
      background: document.getElementById('abVarBg')?.value || 'gradient',
      button_style: document.getElementById('abVarBtn')?.value || 'glass'
    };
    const name = document.getElementById('abTestName')?.value || 'A/B Test';
    const splitRatio = parseInt(document.getElementById('abSplitRatio')?.value) || 50;

    await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/ab-test', {
      name: name,
      variant_b: variantB,
      split_ratio: splitRatio
    });
    showToast(_shrT('bio_ab_started'), 'success');
    document.getElementById('bioABModal')?.remove();
    _bioShowABTest(pageId);
  } catch(e) {
    showToast(e.message || 'Error starting A/B test', 'error');
  }
};

window._bioEndABTest = async function(pageId, testId) {
  if (!confirm(_shrT('bio_ab_end_confirm'))) return;
  try {
    const resp = await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/ab-test/' + testId + '/end');
    showToast(_shrT('bio_ab_ended') + (resp.winner ? ' Winner: ' + resp.winner + ' (A: ' + resp.ctr_a + '% / B: ' + resp.ctr_b + '%)' : ''), 'success');
    document.getElementById('bioABModal')?.remove();
    _bioShowABTest(pageId);
  } catch(e) {
    showToast(e.message || 'Error ending test', 'error');
  }
};

window._bioApplyVariantB = async function(pageId, testId) {
  if (!confirm(_shrT('bio_ab_apply_confirm'))) return;
  try {
    await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/ab-test/' + testId + '/apply-b');
    showToast(_shrT('bio_ab_applied'), 'success');
    document.getElementById('bioABModal')?.remove();
  } catch(e) {
    showToast(e.message || 'Error applying variant B', 'error');
  }
};

window._bioDeleteABTest = async function(pageId, testId) {
  if (!confirm(_shrT('bio_delete_confirm'))) return;
  try {
    await API.del('/cabinet/api/shortener/bio/pages/' + pageId + '/ab-test/' + testId);
    showToast(_shrT('bio_deleted'), 'success');
    document.getElementById('bioABModal')?.remove();
    _bioShowABTest(pageId);
  } catch(e) {
    showToast(e.message || 'Error deleting test', 'error');
  }
};
// ===================== END A/B TESTING =====================

// ===================== MARKETPLACE (Phase 7) =====================
window.loadMarketplacePage = async function() {
  var t = _shrT;
  var c = document.getElementById('marketplaceContent');
  if (!c) return;
  c.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';

  try {
    var myResp = await API.get('/cabinet/api/products');
    var statsResp = await API.get('/cabinet/api/products/my/stats');
    var products = myResp.products || [];
    var stats = statsResp.stats || {};

    var totalProducts = stats.totalProducts || 0;
    var totalSales = stats.totalSales || 0;
    var totalRev = stats.totalRevenue || '0.00';

    var html = '<div class="mp-page">';

    // ── Hero header ──
    html += '<div class="mp-hero">' +
      '<div class="mp-hero-icon">\ud83d\udecd\ufe0f</div>' +
      '<div class="mp-hero-text">' +
        '<h1>Маркетплейс <span class="mp-badge-new">NEW</span></h1>' +
        '<p>Продавай курсы, e-books, шаблоны и любые цифровые товары. Авто-выплаты, реферальный сплит, QR-карточка.</p>' +
      '</div>' +
    '</div>';

    // ── Stat cards ──
    html += '<div class="mp-stats">' +
      '<div class="mp-stat mp-stat-blue">' +
        '<div class="mp-stat-icon">\ud83d\udce6</div>' +
        '<div class="mp-stat-body"><div class="mp-stat-num">' + totalProducts + '</div><div class="mp-stat-cap">Товаров</div></div>' +
      '</div>' +
      '<div class="mp-stat mp-stat-green">' +
        '<div class="mp-stat-icon">\ud83d\udcb8</div>' +
        '<div class="mp-stat-body"><div class="mp-stat-num">' + totalSales + '</div><div class="mp-stat-cap">Продаж</div></div>' +
      '</div>' +
      '<div class="mp-stat mp-stat-gold">' +
        '<div class="mp-stat-icon">\ud83d\udcb0</div>' +
        '<div class="mp-stat-body"><div class="mp-stat-num">\u0024' + totalRev + '</div><div class="mp-stat-cap">Доход</div></div>' +
      '</div>' +
    '</div>';

    // [ads-slot shop-grid 300x250]
    html += '<div data-ad-slot="shop-grid" data-ad-format="300x250" style="margin:14px auto;max-width:300px;text-align:center"></div>';

    // ── Toolbar ──
    html += '<div class="mp-toolbar">' +
      '<h2 class="mp-section-title">\ud83d\udce6 Мои товары <span class="mp-count">' + totalProducts + '</span></h2>' +
      '<div class="mp-toolbar-actions">' +
        '<button class="mp-btn mp-btn-primary" onclick="_mpCreateProduct()"><span>+</span> Добавить товар</button>' +
        '<button class="mp-btn mp-btn-ghost" onclick="_mpBrowse()">\ud83d\udecd\ufe0f Каталог</button>' +
      '</div>' +
    '</div>';

    if (products.length === 0) {
      html += '<div class="mp-empty">' +
        '<div class="mp-empty-icon">\ud83d\udcca</div>' +
        '<h3>У тебя пока нет товаров</h3>' +
        '<p>Добавь первый цифровой продукт за 1 минуту — ты получишь готовый магазин с QR-кодом, реф-сплитом и авто-выплатами.</p>' +
        '<div class="mp-empty-actions">' +
          '<button class="mp-btn mp-btn-primary mp-btn-lg" onclick="_mpCreateProduct()"><span>+</span> Создать первый товар</button>' +
          '<button class="mp-btn mp-btn-ghost mp-btn-lg" onclick="_mpBrowse()">Посмотреть каталог</button>' +
        '</div>' +
        '<div class="mp-empty-tips">' +
          '<div class="mp-tip"><div class="mp-tip-emoji">\ud83d\udcda</div><div><strong>Курсы и обучение</strong><br><span>Видео-уроки, мини-курсы</span></div></div>' +
          '<div class="mp-tip"><div class="mp-tip-emoji">\ud83d\udcd6</div><div><strong>E-book / PDF</strong><br><span>Гайды, методички, чек-листы</span></div></div>' +
          '<div class="mp-tip"><div class="mp-tip-emoji">\ud83c\udfa8</div><div><strong>Шаблоны и пресеты</strong><br><span>Notion, Figma, LR пресеты</span></div></div>' +
        '</div>' +
      '</div>';
    } else {
      html += '<div class="mp-grid">';
      products.forEach(function(p) {
        var img = p.preview_image
          ? '<img src="' + _escHtml(p.preview_image) + '" alt="' + _escHtml(p.title) + '">'
          : '<div class="mp-card-noimg">\ud83d\udce6</div>';
        var catLabels = { course:'\ud83d\udcda Курс', ebook:'\ud83d\udcd6 E-book', template:'\ud83d\udccb Шаблон', music:'\ud83c\udfb5 Музыка', software:'\ud83d\udcbb Программа', preset:'\ud83c\udfa8 Пресет', other:'\ud83d\udce6 Другое' };
        var catLabel = catLabels[p.category] || p.category;
        html += '<div class="mp-card">' +
          '<div class="mp-card-img">' + img + '<span class="mp-card-cat">' + catLabel + '</span></div>' +
          '<div class="mp-card-body">' +
            '<h4 class="mp-card-title">' + _escHtml(p.title) + '</h4>' +
            '<div class="mp-card-row"><span class="mp-card-price">\u0024' + (p.price_usd || 0).toFixed(2) + '</span><span class="mp-card-sales">' + p.total_sales + ' \ud83d\udcb8</span></div>' +
          '</div>' +
          '<div class="mp-card-actions">' +
            '<button class="mp-card-btn" onclick="event.stopPropagation();window._mpCopyLink(' + p.id + ')" title="Копировать ссылку">\ud83d\udd17</button>' +
            '<button class="mp-card-btn" onclick="_mpEditProduct(' + p.id + ')" title="Редактировать">\u270f\ufe0f</button>' +
            '<button class="mp-card-btn mp-card-btn-danger" onclick="_mpDeleteProduct(' + p.id + ')" title="Удалить">\ud83d\uddd1\ufe0f</button>' +
          '</div>' +
        '</div>';
      });
      html += '</div>';
    }

    html += '</div>';
    c.innerHTML = html;
  } catch(e) {
    c.innerHTML = '<div class="error-state"><p>' + (e.message || 'Error') + '</p></div>';
  }
};

window._mpCreateProduct = function() {
  var t = _shrT;
  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'mpModal';
  var h = '<div class="modal-content mp-modal">';
  h += '<div class="modal-header"><h3>' + t('mp_add_product') + '</h3><button class="modal-close" onclick="document.getElementById(\'mpModal\').remove()">&times;</button></div>';
  h += '<div class="modal-body">';
  h += '<div class="form-group"><label>' + t('mp_title') + '</label><input type="text" id="mpTitle" class="form-control" maxlength="200"></div>';
  h += '<div class="form-group"><label>' + t('mp_description') + '</label><textarea id="mpDesc" class="form-control" rows="3" maxlength="2000"></textarea></div>';
  h += '<div class="form-group"><label>' + t('mp_price') + ' (USD)</label><input type="number" id="mpPrice" class="form-control" min="0" step="0.01" value="0"></div>';
  h += '<div class="form-group"><label>' + t('mp_category') + '</label><select id="mpCategory" class="form-control">';
  h += '<option value="course">📚 Курс</option><option value="ebook">📖 Электронная книга</option><option value="template">📋 Шаблон</option>';
  h += '<option value="music">🎵 Музыка</option><option value="software">💻 Программа</option><option value="preset">🎨 Пресет</option><option value="other">📦 Другое</option></select></div>';
  h += '<div class="form-group"><label>' + t('mp_download_url') + '</label><input type="url" id="mpDownload" class="form-control" placeholder="https://..."></div>';
  h += '<div class="form-group"><label>' + t('mp_preview_image') + '</label><input type="url" id="mpPreview" class="form-control" placeholder="https://..."></div>';
  h += '<div class="form-group"><label>Галерея (доп. фото, по одному URL на строку)</label><textarea id="mpGallery" class="form-control" rows="3" placeholder="https://...img1.jpg\nhttps://...img2.jpg"></textarea></div>';
  h += '<div class="form-group"><label>Видео-обзор (URL YouTube или mp4)</label><input type="url" id="mpVideo" class="form-control" placeholder="https://youtube.com/watch?v=... или прямая ссылка .mp4"></div>';
  h += '<div class="form-group"><label>Партнёрка: какую долю оставлять себе</label>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    '<input type="range" id="mpSellerPct" min="1" max="70" value="70" oninput="window._mpSellerPctOn(this.value)" style="flex:1">' +
    '<strong id="mpSellerPctVal" style="min-width:50px;text-align:right;color:#10b981;font-family:monospace">70%</strong>' +
    '</div>' +
    '<div style="font-size:11px;color:#9ca3af;margin-top:4px">По умолчанию: <strong>70% себе</strong> · <strong>30% в сеть</strong> (10% проекту, <strong>7.5% линейка</strong> покупателя, <strong>7.5% матрица</strong>, 5% общий пул). Понижай свою долю — больше товаров получат продавцы в сети, и твой товар будет выше в сортировке «🤝 Макс. в сеть».</div></div>';
window._mpSellerPctOn = function (v) { var el = document.getElementById('mpSellerPctVal'); if (el) el.textContent = v + '%'; };
  h += '<button class="btn btn-primary" style="width:100%" onclick="_mpSaveProduct()">' + t('mp_save') + '</button>';
  h += '</div></div>';
  modal.innerHTML = h;
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
};

window._mpSaveProduct = async function(editId) {
  try {
    var galTxt = (document.getElementById('mpGallery') && document.getElementById('mpGallery').value) || '';
    var gallery = galTxt.split(/[\n,]/).map(function(s){return s.trim();}).filter(function(s){return s && /^https?:/i.test(s);});
    var data = {
      title: document.getElementById('mpTitle').value,
      description: document.getElementById('mpDesc').value,
      price_usd: parseFloat(document.getElementById('mpPrice').value) || 0,
      category: document.getElementById('mpCategory').value,
      download_url: document.getElementById('mpDownload').value,
      preview_image: document.getElementById('mpPreview').value,
      gallery_json: JSON.stringify(gallery),
      video_url: (document.getElementById('mpVideo') && document.getElementById('mpVideo').value) || '',
      seller_pct: (parseFloat(document.getElementById('mpSellerPct') && document.getElementById('mpSellerPct').value) || 70) / 100
    };
    if (!data.title || data.title.trim().length < 2) { showToast(_shrT('mp_title') + ' — обязательно', 'error'); return; }
    if (editId) { await API.put('/cabinet/api/products/' + editId, data); }
    else { await API.post('/cabinet/api/products', data); }
    document.getElementById('mpModal').remove();
    showToast(_shrT('mp_saved'), 'success');
    loadMarketplacePage();
  } catch(e) { showToast(e.message || 'Error', 'error'); }
};

window._mpEditProduct = async function(id) {
  try {
    var resp = await API.get('/cabinet/api/products');
    var product = (resp.products || []).find(function(p) { return p.id === id; });
    if (!product) return;
    _mpCreateProduct();
    setTimeout(function() {
      document.getElementById('mpTitle').value = product.title || '';
      document.getElementById('mpDesc').value = product.description || '';
      document.getElementById('mpPrice').value = product.price_usd || 0;
      document.getElementById('mpCategory').value = product.category || 'other';
      document.getElementById('mpDownload').value = product.download_url || '';
      document.getElementById('mpPreview').value = product.preview_image || '';
      try {
        var g = product.gallery_json ? JSON.parse(product.gallery_json) : [];
        if (document.getElementById('mpGallery')) document.getElementById('mpGallery').value = (g || []).join('\n');
      } catch (_) {}
      if (document.getElementById('mpVideo')) document.getElementById('mpVideo').value = product.video_url || '';
      if (document.getElementById('mpSellerPct')) {
        const sp = product.seller_pct ? Math.round(product.seller_pct * 100) : 70;
        document.getElementById('mpSellerPct').value = sp;
        if (document.getElementById('mpSellerPctVal')) document.getElementById('mpSellerPctVal').textContent = sp + '%';
      }
      var btn = document.querySelector('#mpModal .btn-primary');
      if (btn) btn.setAttribute('onclick', '_mpSaveProduct(' + id + ')');
    }, 100);
  } catch(e) { showToast(e.message, 'error'); }
};

window._mpDeleteProduct = async function(id) {
  if (!confirm(_shrT('mp_delete_confirm'))) return;
  try {
    await API.del('/cabinet/api/products/' + id);
    showToast(_shrT('mp_deleted'), 'success');
    loadMarketplacePage();
  } catch(e) { showToast(e.message, 'error'); }
};

/* [mp-v2] */ window._mpBrowse = async function () {
  var c = document.getElementById('marketplaceContent');
  if (!c) return;
  c.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i></div>';
  try {
    var resp = await API.get('/cabinet/api/products/marketplace');
    var products = resp.products || [];
    window._mpBrowseAll = products;
    window._mpBrowseFilter = { q: '', cat: 'all', sort: 'new' };
    var html = '<div class="mp-page">';
    html += '<div class="mp-hero" style="background:linear-gradient(135deg,rgba(0,212,255,.08),rgba(177,74,237,.08))">' +
      '<div class="mp-hero-icon">\ud83d\udecd\ufe0f</div>' +
      '<div class="mp-hero-text"><h1>Каталог товаров</h1>' +
      '<p>Найди цифровые продукты от других партнёров: курсы, e-books, шаблоны, музыка, пресеты и не только.</p></div>' +
      '<button class="mp-btn mp-btn-ghost" onclick="loadMarketplacePage()" style="margin-left:auto">\u2190 Мои товары</button>' +
    '</div>';
    var cats = [['all','Все','\ud83d\udce6'],['course','Курсы','\ud83d\udcda'],['ebook','E-books','\ud83d\udcd6'],['template','Шаблоны','\ud83d\udccb'],['music','Музыка','\ud83c\udfb5'],['software','Программы','\ud83d\udcbb'],['preset','Пресеты','\ud83c\udfa8'],['other','Другое','\u2728']];
    html += '<div class="mp-toolbar" style="flex-wrap:wrap;gap:12px;align-items:center">' +
      '<input id="mpSearchInput" type="search" placeholder="\ud83d\udd0d Поиск по названию, описанию, продавцу..." oninput="window._mpRenderBrowse()" style="flex:1 1 280px;padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:14px">' +
      '<select id="mpSortSelect" onchange="window._mpRenderBrowse()" style="padding:10px 14px;border-radius:12px;border:1px solid var(--border);background:rgba(255,255,255,.04);color:var(--text);font-size:14px">' +
        '<option value="new">\ud83c\udd95 Новые</option>' +
        '<option value="sales">\ud83d\udd25 Популярные</option>' +
        '<option value="price-low">\ud83d\udcb0 Цена возр.</option>' +
        '<option value="price-high">\ud83d\udcb0 Цена убыв.</option>' +
      '</select>' +
    '</div>';
    html += '<div id="mpCategoryChips" style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px">';
    cats.forEach(function (k) {
      var act = k[0] === 'all';
      html += '<button class="mp-cat-chip" data-cat="' + k[0] + '" onclick="window._mpSelectCat(this)" style="padding:8px 14px;border-radius:999px;border:1px solid ' + (act ? 'var(--accent)' : 'var(--border)') + ';background:' + (act ? 'rgba(0,212,255,.12)' : 'transparent') + ';color:' + (act ? 'var(--accent)' : 'var(--text-secondary)') + ';cursor:pointer;font-weight:600;font-size:13px;font-family:inherit">' + k[2] + ' ' + k[1] + '</button>';
    });
    html += '</div><div id="mpBrowseGrid"></div></div>';
    c.innerHTML = html;
    window._mpRenderBrowse();
  } catch (e) { c.innerHTML = '<div class="error-state"><p>' + (e.message || 'Error') + '</p></div>'; }
};

window._mpSelectCat = function (btn) {
  if (!window._mpBrowseFilter) window._mpBrowseFilter = { q:'', cat:'all', sort:'new' };
  window._mpBrowseFilter.cat = btn.getAttribute('data-cat');
  document.querySelectorAll('#mpCategoryChips .mp-cat-chip').forEach(function (b) {
    var act = b === btn;
    b.style.borderColor = act ? 'var(--accent)' : 'var(--border)';
    b.style.background = act ? 'rgba(0,212,255,.12)' : 'transparent';
    b.style.color = act ? 'var(--accent)' : 'var(--text-secondary)';
  });
  window._mpRenderBrowse();
};

window._mpRenderBrowse = function () {
  var grid = document.getElementById('mpBrowseGrid');
  if (!grid) return;
  var products = window._mpBrowseAll || [];
  var f = window._mpBrowseFilter || { q:'', cat:'all', sort:'new' };
  var qInp = document.getElementById('mpSearchInput');
  var sortInp = document.getElementById('mpSortSelect');
  if (qInp) f.q = (qInp.value || '').toLowerCase().trim();
  if (sortInp) f.sort = sortInp.value || 'new';
  var filtered = products.filter(function (p) {
    if (f.cat !== 'all' && p.category !== f.cat) return false;
    if (!f.q) return true;
    var hay = (p.title + ' ' + (p.description || '') + ' ' + (p.seller_name || '')).toLowerCase();
    return hay.indexOf(f.q) >= 0;
  });
  if (f.sort === 'sales') filtered.sort(function (a, b) { return (b.total_sales || 0) - (a.total_sales || 0); });
  else if (f.sort === 'price-low') filtered.sort(function (a, b) { return (a.price_usd || 0) - (b.price_usd || 0); });
  else if (f.sort === 'price-high') filtered.sort(function (a, b) { return (b.price_usd || 0) - (a.price_usd || 0); });
  else filtered.sort(function (a, b) { return (new Date(b.created_at || 0)) - (new Date(a.created_at || 0)); });
  if (!filtered.length) {
    grid.innerHTML = '<div class="mp-empty" style="padding:60px 20px"><div class="mp-empty-icon">\ud83d\udd0d</div><h3>Ничего не найдено</h3><p>Попробуй убрать фильтры или сменить категорию.</p></div>';
    return;
  }
  var html = '<div class="mp-grid">';
  var catLabels = { course:'\ud83d\udcda Курс', ebook:'\ud83d\udcd6 E-book', template:'\ud83d\udccb Шаблон', music:'\ud83c\udfb5 Музыка', software:'\ud83d\udcbb Программа', preset:'\ud83c\udfa8 Пресет', other:'\u2728 Другое' };
  filtered.forEach(function (p) {
    var img = p.preview_image ? '<img src="' + _escHtml(p.preview_image) + '" alt="' + _escHtml(p.title) + '">' : '<div class="mp-card-noimg">\ud83d\udce6</div>';
    var hasPrice = (p.price_usd || 0) > 0;
    var price = hasPrice ? ('$' + Number(p.price_usd).toFixed(2)) : 'Free';
    html += '<div class="mp-card" onclick="window._mpProductView(' + p.id + ')" style="cursor:pointer">';
    html += '<div class="mp-card-img">' + img + '<span class="mp-card-cat">' + (catLabels[p.category] || p.category || '') + '</span></div>';
    html += '<div class="mp-card-body">';
    html += '<h4 class="mp-card-title">' + _escHtml(p.title) + '</h4>';
    if (p.description) html += '<p style="font-size:12px;color:var(--text-secondary);margin:4px 0 8px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + _escHtml(String(p.description).slice(0, 140)) + '</p>';
    html += '<div class="mp-card-row"><span class="mp-card-price">' + price + '</span><span class="mp-card-sales">' + (p.total_sales || 0) + ' \ud83d\udcb8</span></div>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">\ud83d\udc64 ' + _escHtml(p.seller_name || 'Anonymous') + '</div>';
    html += '</div></div>';
  });
  html += '</div>';
  grid.innerHTML = html;
};

window._mpProductView = function (id) {
  var p = (window._mpBrowseAll || []).find(function (x) { return x.id === id; });
  if (!p) return;
  var hasPrice = (p.price_usd || 0) > 0;
  var price = hasPrice ? ('$' + Number(p.price_usd).toFixed(2)) : 'Free';
  var img = p.preview_image ? '<img src="' + _escHtml(p.preview_image) + '" style="width:100%;max-height:280px;object-fit:cover;border-radius:14px">' : '';
  var modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'mpProductModal';
  var h = '<div class="modal-content" style="max-width:600px">';
  h += '<div class="modal-header"><h3>' + _escHtml(p.title) + '</h3><button class="modal-close" onclick="document.getElementById(&quot;mpProductModal&quot;).remove()">×</button></div>';
  h += '<div class="modal-body">' + img;
  h += '<div style="margin:14px 0"><span style="font-size:24px;font-weight:800;color:var(--accent)">' + price + '</span> · <span style="color:var(--text-secondary)">' + (p.total_sales || 0) + ' продаж</span></div>';
  if (p.description) h += '<p style="line-height:1.6;color:var(--text-secondary);margin-bottom:14px;white-space:pre-wrap">' + _escHtml(p.description) + '</p>';
  h += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">Продавец: <b>' + _escHtml(p.seller_name || 'Anonymous') + '</b></div>';
  if (p.purchase_link) {
    h += '<a href="' + _escHtml(p.purchase_link) + '" target="_blank" style="display:block;text-align:center;padding:14px;background:linear-gradient(135deg,#00D4FF,#B14AED);color:#fff;border-radius:12px;text-decoration:none;font-weight:700">\ud83d\udecd\ufe0f Купить за ' + price + '</a>';
  } else {
    h += '<div style="padding:14px;background:rgba(255,255,255,.04);border-radius:12px;color:var(--text-secondary);text-align:center;font-size:13px">Свяжитесь с продавцом для покупки.</div>';
  }
  h += '</div></div>';
  modal.innerHTML = h;
  document.body.appendChild(modal);
  modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
};

window._bioShowProducts = async function(pageId) {
  var t = _shrT;
  try {
    var myProducts = await API.get('/cabinet/api/products');
    var bioProducts = await API.get('/cabinet/api/products/bio/' + pageId);
    var listed = {};
    (bioProducts.products || []).forEach(function(p) { listed[p.id] = true; });

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'bioProductsModal';
    var h = '<div class="modal-content mp-modal">';
    h += '<div class="modal-header"><h3>' + t('mp_bio_products') + '</h3><button class="modal-close" onclick="document.getElementById(\'bioProductsModal\').remove()">&times;</button></div>';
    h += '<div class="modal-body">';
    if ((myProducts.products || []).length === 0) {
      h += '<p>' + t('mp_no_products') + '</p>';
    } else {
      h += '<div class="mp-bio-products-list">';
      (myProducts.products || []).forEach(function(p) {
        h += '<div class="mp-bio-product-item">';
        h += '<span>' + _escHtml(p.title) + ' (\u0024' + (p.price_usd || 0).toFixed(2) + ')</span>';
        if (listed[p.id]) {
          h += '<button class="btn btn-sm btn-danger" onclick="_bioRemoveProduct(' + pageId + ',' + p.id + ')"><i class="fas fa-minus"></i></button>';
        } else {
          h += '<button class="btn btn-sm btn-success" onclick="_bioAddProduct(' + pageId + ',' + p.id + ')"><i class="fas fa-plus"></i></button>';
        }
        h += '</div>';
      });
      h += '</div>';
    }
    h += '</div></div>';
    modal.innerHTML = h;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  } catch(e) { showToast(e.message, 'error'); }
};

window._bioAddProduct = async function(bioId, productId) {
  try {
    await API.post('/cabinet/api/products/bio/' + bioId + '/add', { product_id: productId });
    showToast(_shrT('mp_added_to_bio'), 'success');
    document.getElementById('bioProductsModal').remove();
    _bioShowProducts(bioId);
  } catch(e) { showToast(e.message, 'error'); }
};

window._bioRemoveProduct = async function(bioId, productId) {
  try {
    await API.del('/cabinet/api/products/bio/' + bioId + '/remove', { product_id: productId });
    showToast(_shrT('mp_removed_from_bio'), 'success');
    document.getElementById('bioProductsModal').remove();
    _bioShowProducts(bioId);
  } catch(e) { showToast(e.message, 'error'); }
};
// ===================== END MARKETPLACE =====================

// ===================== CUSTOM DOMAINS (Phase 6) =====================
window._bioShowDomain = async function(pageId) {
  var t = _shrT;
  try {
    var resp = await API.get('/cabinet/api/shortener/bio/pages/' + pageId + '/domain');
    var domains = resp.domains || [];

    var modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'bioDomainModal';
    var h = '<div class="modal-content bio-domain-modal">';
    h += '<div class="modal-header"><h3>' + t('cd_title') + '</h3><button class="modal-close" onclick="document.getElementById(\'bioDomainModal\').remove()">&times;</button></div>';
    h += '<div class="modal-body">';

    if (domains.length > 0) {
      h += '<div class="cd-domains-list">';
      domains.forEach(function(d) {
        var statusClass = d.dns_status === 'verified' ? 'cd-status-ok' : 'cd-status-pending';
        var sslClass = d.ssl_status === 'active' ? 'cd-status-ok' : 'cd-status-pending';
        h += '<div class="cd-domain-item">';
        h += '<div class="cd-domain-name">' + _escHtml(d.domain) + '</div>';
        h += '<div class="cd-domain-status">';
        h += '<span class="cd-badge ' + statusClass + '">DNS: ' + d.dns_status + '</span> ';
        h += '<span class="cd-badge ' + sslClass + '">SSL: ' + (d.ssl_status || 'none') + '</span>';
        h += '</div>';
        h += '<div class="cd-domain-actions">';
        if (d.dns_status !== 'verified') {
          h += '<button class="btn btn-sm btn-primary" onclick="_bioVerifyDomain(' + pageId + ',' + d.id + ')">' + t('cd_verify') + '</button> ';
        }
        h += '<button class="btn btn-sm btn-danger" onclick="_bioRemoveDomain(' + pageId + ',' + d.id + ')">' + t('bio_delete') + '</button>';
        h += '</div>';
        if (d.error_message) h += '<div class="cd-error">' + _escHtml(d.error_message) + '</div>';
        h += '</div>';
      });
      h += '</div>';
    }

    h += '<hr>';
    h += '<h4>' + t('cd_add_new') + '</h4>';
    h += '<div class="form-group"><label>' + t('cd_domain') + '</label>';
    h += '<input type="text" id="cdNewDomain" class="form-control" placeholder="bio.example.com"></div>';
    h += '<div class="cd-instructions">';
    h += '<p>' + t('cd_instructions') + ':</p>';
    h += '<ol><li>' + t('cd_step1') + '</li>';
    h += '<li>' + t('cd_step2') + '</li>';
    h += '<li>' + t('cd_step3') + '</li></ol>';
    h += '</div>';
    h += '<button class="btn btn-primary" onclick="_bioAddDomain(' + pageId + ')">' + t('cd_add') + '</button>';

    h += '</div></div>';
    modal.innerHTML = h;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  }
};

window._bioAddDomain = async function(pageId) {
  var domain = document.getElementById('cdNewDomain')?.value?.trim();
  if (!domain) { showToast('Enter domain', 'error'); return; }
  try {
    var resp = await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/domain', { domain: domain });
    if (resp.success) {
      showToast(_shrT('cd_added'), 'success');
      document.getElementById('bioDomainModal')?.remove();
      _bioShowDomain(pageId);
    } else {
      showToast(resp.error || 'Error', 'error');
    }
  } catch(e) { showToast(e.message, 'error'); }
};

window._bioVerifyDomain = async function(pageId, domainId) {
  try {
    var resp = await API.post('/cabinet/api/shortener/bio/pages/' + pageId + '/domain/' + domainId + '/verify');
    if (resp.verified) {
      showToast(_shrT('cd_verified') + (resp.ssl ? ' + SSL' : ''), 'success');
    } else {
      showToast(resp.error || _shrT('cd_not_verified'), 'error');
    }
    document.getElementById('bioDomainModal')?.remove();
    _bioShowDomain(pageId);
  } catch(e) { showToast(e.message, 'error'); }
};

window._bioRemoveDomain = async function(pageId, domainId) {
  if (!confirm(_shrT('cd_remove_confirm'))) return;
  try {
    await API.del('/cabinet/api/shortener/bio/pages/' + pageId + '/domain/' + domainId);
    showToast(_shrT('cd_removed'), 'success');
    document.getElementById('bioDomainModal')?.remove();
    _bioShowDomain(pageId);
  } catch(e) { showToast(e.message, 'error'); }
};
// ===================== END CUSTOM DOMAINS =====================




// ===================== END BIO MANAGER =====================

// ===================== BIO STATS + QR (Phase 3) =====================

window._bioShowStats = async function(pageId) {
  var panel = _shrPanelEl();
  if (!panel) return;
  panel.innerHTML = '<div style="text-align:center;padding:30px">' + _shrT('loading') + '...</div>';

  try {
    var period = '30d';
    var res = await API.get('/cabinet/api/shortener/bio/pages/' + pageId + '/stats?period=' + period);
    var s = res.stats;

    var html = '<div class="bio-stats-page">';
    html += '<div class="bio-editor-header">';
    html += '<button class="btn btn-sm" onclick="window._bioEditPage(' + pageId + ')">\u2190 ' + (_shrT('back') || 'Back') + '</button>';
    html += '<h3>\u{1F4CA} ' + (_shrT('bio_stats') || 'Statistics') + '</h3>';
    html += '<select class="shr-input" style="width:auto;padding:4px 8px" onchange="window._bioLoadStats(' + pageId + ',this.value)" id="bio-stats-period">';
    html += '<option value="24h">' + (_shrT('bio_24h') || '24 Hours') + '</option>';
    html += '<option value="7d">' + (_shrT('bio_7d') || '7 Days') + '</option>';
    html += '<option value="30d" selected>' + (_shrT('bio_30d') || '30 Days') + '</option>';
    html += '<option value="90d">' + (_shrT('bio_90d') || '90 Days') + '</option>';
    html += '<option value="all">' + (_shrT('bio_all_time') || 'All Time') + '</option>';
    html += '</select></div>';

    // Summary cards
    html += '<div class="bio-stats-cards">';
    html += '<div class="bio-stat-card"><div class="bio-stat-value">' + (s.total_views || 0) + '</div><div class="bio-stat-label">' + (_shrT('bio_total_views') || 'Total Views') + '</div></div>';
    html += '<div class="bio-stat-card"><div class="bio-stat-value">' + (s.period_views || 0) + '</div><div class="bio-stat-label">' + (_shrT('bio_period_views') || 'Period Views') + '</div></div>';
    html += '<div class="bio-stat-card"><div class="bio-stat-value">' + (s.total_clicks || 0) + '</div><div class="bio-stat-label">' + (_shrT('bio_total_clicks') || 'Total Clicks') + '</div></div>';
    var ctr = s.total_views > 0 ? ((s.total_clicks / s.total_views) * 100).toFixed(1) : '0.0';
    html += '<div class="bio-stat-card"><div class="bio-stat-value">' + ctr + '%</div><div class="bio-stat-label">CTR</div></div>';
    html += '</div>';

    // Views chart (simple bar chart)
    if (s.views_by_day && s.views_by_day.length > 0) {
      var maxViews = Math.max.apply(null, s.views_by_day.map(function(d){return d.views})) || 1;
      html += '<div class="bio-stats-section"><h4>' + (_shrT('bio_views_chart') || 'Views Over Time') + '</h4>';
      html += '<div class="bio-chart">';
      s.views_by_day.forEach(function(d) {
        var pct = Math.round((d.views / maxViews) * 100);
        var label = d.day.substring(5); // MM-DD
        html += '<div class="bio-chart-bar-wrap" title="' + d.day + ': ' + d.views + '">';
        html += '<div class="bio-chart-bar" style="height:' + Math.max(pct, 4) + '%"></div>';
        html += '<div class="bio-chart-label">' + label + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    // Devices + Browsers + OS
    html += '<div class="bio-stats-grid">';

    // Devices
    html += '<div class="bio-stats-section"><h4>' + (_shrT('bio_devices') || 'Devices') + '</h4>';
    if (s.devices && s.devices.length > 0) {
      s.devices.forEach(function(d) {
        html += '<div class="bio-stat-row"><span>' + _shrEsc(d.device_type) + '</span><strong>' + d.c + '</strong></div>';
      });
    } else { html += '<p style="color:var(--text-secondary)">No data</p>'; }
    html += '</div>';

    // Browsers
    html += '<div class="bio-stats-section"><h4>' + (_shrT('bio_browsers') || 'Browsers') + '</h4>';
    if (s.browsers && s.browsers.length > 0) {
      s.browsers.forEach(function(d) {
        html += '<div class="bio-stat-row"><span>' + _shrEsc(d.browser) + '</span><strong>' + d.c + '</strong></div>';
      });
    } else { html += '<p style="color:var(--text-secondary)">No data</p>'; }
    html += '</div>';

    // Top links
    html += '<div class="bio-stats-section"><h4>' + (_shrT('bio_top_links') || 'Top Links') + '</h4>';
    if (s.top_links && s.top_links.length > 0) {
      s.top_links.forEach(function(l) {
        html += '<div class="bio-stat-row"><span>' + _shrEsc(l.title || l.url) + '</span><strong>' + (l.total_clicks || 0) + '</strong></div>';
      });
    } else { html += '<p style="color:var(--text-secondary)">No data</p>'; }
    html += '</div>';

    html += '</div>'; // grid
    html += '</div>'; // page
    panel.innerHTML = html;
  } catch(e) {
    if (/auth|token|unauthorized|401/i.test(e.message) && window.showGlobalAuthPromo) { window.showGlobalAuthPromo(); return; }
    panel.innerHTML = '<div style="color:red;padding:20px">' + _shrT('error') + ': ' + _shrEsc(e.message) + '</div>';
  }
};

window._bioLoadStats = function(pageId, period) {
  window._bioShowStats(pageId);
};

// QR Modal
window._bioShowQR = async function(pageId) {
  try {
    var res = await API.get('/cabinet/api/shortener/bio/pages/' + pageId + '/qr?size=400');
    var overlay = document.createElement('div');
    overlay.className = 'bio-qr-overlay';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    var modal = document.createElement('div');
    modal.className = 'bio-qr-modal';
    modal.innerHTML = '<h3>QR Code</h3>' +
      '<img src="' + res.qr + '" class="bio-qr-image" />' +
      '<p style="font-size:0.85rem;color:var(--text-secondary);margin:8px 0">' + _shrEsc(res.url) + '</p>' +
      '<div style="display:flex;gap:8px;justify-content:center">' +
      '<a href="' + res.qr + '" download="bio-qr.png" class="btn btn-primary btn-sm">\u{2B07} Download PNG</a>' +
      '<button class="btn btn-sm" onclick="this.closest(\'.bio-qr-overlay\').remove()">Close</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  } catch(e) {
    showToast(e.message || 'Error generating QR', 'error');
  }
};

// ===================== END BIO STATS + QR =====================




// ============================================================
// 18. Confetti effect
// ============================================================

function _shrConfetti(parentEl) {
  const colors = ['#667eea','#f5576c','#43e97b','#ffd700','#4facfe','#fa709a'];
  const container = document.createElement('div');
  container.className = 'shr-confetti-container';
  parentEl.style.position = 'relative';
  parentEl.appendChild(container);

  for (let i = 0; i < 8; i++) {
    const p = document.createElement('div');
    p.className = 'shr-confetti-particle';
    p.style.background = colors[i % colors.length];
    p.style.left = (Math.random() * 60 - 30) + 'px';
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.animationDuration = (0.8 + Math.random() * 0.6) + 's';
    container.appendChild(p);
  }

  setTimeout(() => container.remove(), 2000);
}


// ============================================================
// Expose modal close to window
// ============================================================

window._shrCloseModal = _shrCloseModal;

// ============================================================
// === Dashboard / Control Panel ===
// ============================================================



/* [mp-v2-extras] */
window._mpCopyLink = function (id) {
  var link = location.origin + '/cabinet/cabinet#/marketplace?p=' + id;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(link).catch(function(){});
  }
  if (typeof showToast === 'function') showToast('Ссылка скопирована', 'success');
  else if (typeof toast === 'function') toast('Ссылка скопирована');
  else alert('Ссылка: ' + link);
};

window._mpAddToShop = async function (productId, btn) {
  try {
    if (btn) { btn.disabled = true; btn.textContent = '⏳…'; }
    const r = await fetch('/cabinet/api/shops/products', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: productId })
    });
    const d = await r.json();
    if (!r.ok || d.ok === false) {
      const msg = ({
        'create_shop_first': 'Сначала создай магазин (раздел «Мой магазин»)',
        'already_in_shop': 'Уже в твоём магазине',
        'product_not_found': 'Товар не найден',
      })[d.reason] || (d.reason || 'Ошибка');
      if (typeof showToast === 'function') showToast(msg, 'error');
      else alert(msg);
      if (btn) { btn.disabled = false; btn.textContent = '+ В магазин'; }
      return;
    }
    if (typeof showToast === 'function') showToast('+ Добавлено в твой магазин', 'success');
    if (btn) { btn.textContent = '✓ В магазине'; btn.disabled = true; }
  } catch (e) {
    if (typeof showToast === 'function') showToast(e.message || 'Ошибка', 'error');
    if (btn) { btn.disabled = false; btn.textContent = '+ В магазин'; }
  }
};

// Post-process marketplace browse cards: inject "+ В магазин" button into each card if missing.
(function () {
  function injectAddToShop() {
    try {
      const cards = document.querySelectorAll('#marketplaceContent .mp-product-card-public');
      cards.forEach(function (card, idx) {
        if (card.dataset.shopBtnDone) return;
        card.dataset.shopBtnDone = '1';
        // Try to read product id from edit/delete buttons or anchors
        let pid = null;
        const editBtn = card.querySelector('[onclick*=_mpEditProduct]');
        if (editBtn) {
          const m = editBtn.getAttribute('onclick').match(/_mpEditProduct\((\d+)\)/);
          if (m) pid = Number(m[1]);
        }
        if (!pid) {
          const buyA = card.querySelector('a[href*="/cabinet/p/"]');
          if (buyA) {
            const m = buyA.getAttribute('href').match(/-(\d+)(?:[\?#]|$)/);
            if (m) pid = Number(m[1]);
          }
        }
        if (!pid) return;
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary btn-sm';
        btn.style.cssText = 'margin-top:8px;width:100%;background:linear-gradient(135deg,#10b981,#00D4FF);color:#fff;border:none;padding:8px;border-radius:6px;font-weight:700;cursor:pointer';
        btn.textContent = '+ В магазин';
        btn.onclick = function () { window._mpAddToShop(pid, btn); };
        card.appendChild(btn);
      });
    } catch (_) {}
  }
  // Observe the marketplace container for re-renders
  const obs = new MutationObserver(function () { setTimeout(injectAddToShop, 50); });
  document.addEventListener('DOMContentLoaded', function () {
    const c = document.getElementById('marketplaceContent');
    if (c) obs.observe(c, { childList: true, subtree: true });
    setTimeout(injectAddToShop, 500);
  });
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    const c = document.getElementById('marketplaceContent');
    if (c) obs.observe(c, { childList: true, subtree: true });
    setTimeout(injectAddToShop, 500);
  }
})();


// [pack3-share-helper]
window._shareLink = function (url, title) {
  url = String(url || '');
  title = String(title || 'Golden Connect');
  var enc = encodeURIComponent;
  var nets = [
    { id: 'tg', label: 'TG', color: '#0088cc', url: 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(title) },
    { id: 'wa', label: 'WA', color: '#25D366', url: 'https://wa.me/?text=' + enc(title + ' ' + url) },
    { id: 'vk', label: 'VK', color: '#0077FF', url: 'https://vk.com/share.php?url=' + enc(url) + '&title=' + enc(title) },
    { id: 'x',  label: 'X',  color: '#000000', url: 'https://twitter.com/intent/tweet?text=' + enc(title) + '&url=' + enc(url) },
    { id: 'fb', label: 'FB', color: '#1877F2', url: 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url) },
    { id: 'ok', label: 'OK', color: '#FF8C00', url: 'https://connect.ok.ru/offer?url=' + enc(url) + '&title=' + enc(title) },
  ];
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
    nets.map(function (n) { return '<a href="' + n.url + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:' + n.color + ';color:#fff;font-size:11px;font-weight:700;text-decoration:none">' + n.label + '</a>'; }).join('') +
  '</div>';
};
