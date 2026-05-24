/**
 * roboai-pages.js — UI for /api/roboai/* (proxied to roboai-engine).
 *
 * Pages:
 *   - 'roboai-order' (advertiser) — campaigns wizard, audience, leads, prompts
 *   - 'roboai-earn'  (provider)   — accounts, bulk import, withdraw
 *   - 'roboai-moderation' (admin) — review PENDING_REVIEW campaigns
 *
 * All API calls go through cabinet's /api/roboai/* — JWT for the engine is
 * issued cabinet-side, so the browser never touches engine tokens directly.
 */
(function () {
  'use strict';

  function $$(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt$(cents) { return '$' + ((cents || 0) / 100).toFixed(2); }

  // Cabinet cookie path = /cabinet → fetches MUST go through /cabinet prefix
  // so the browser includes goldenConnect_cabinet_session cookie in the request.
  // Cabinet middleware strips /cabinet then matches our router on /api/roboai.
  async function callRoboai(method, path, body) {
    const init = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    };
    if (body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(body);
    }
    const r = await fetch('/cabinet/api/roboai' + path, init);
    const txt = await r.text();
    let parsed = null;
    try { parsed = txt ? JSON.parse(txt) : null; } catch (e) { /* ignore */ }
    return { ok: r.ok, status: r.status, data: parsed, raw: txt };
  }

  // Common style block (injected once)
  function injectStyles() {
    if (document.getElementById('roboai-styles')) return;
    const s = document.createElement('style');
    s.id = 'roboai-styles';
    s.textContent = `
      .ra-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:14px 0}
      .ra-card{background:var(--card,#161825);border:1px solid var(--border,#252837);border-radius:12px;padding:16px}
      .ra-card h3{margin:0 0 6px;font-size:13px;color:var(--text-muted,#9ba1ad);font-weight:600}
      .ra-card .v{font-size:22px;font-weight:700;color:var(--text,#e7e9ee)}
      .ra-tabs{display:flex;gap:6px;margin:12px 0;flex-wrap:wrap}
      .ra-tab{padding:8px 14px;border:1px solid var(--border,#252837);background:transparent;color:var(--text-muted,#9ba1ad);border-radius:8px;cursor:pointer;font-size:13px}
      .ra-tab.active{background:var(--accent-soft,rgba(0,212,255,.12));color:var(--accent,#00d4ff);border-color:var(--accent,#00d4ff)}
      .ra-empty{padding:36px 20px;text-align:center;color:var(--text-muted,#9ba1ad);background:var(--card,#161825);border:1px dashed var(--border,#252837);border-radius:12px}
      .ra-btn{padding:10px 18px;border-radius:8px;border:none;background:linear-gradient(135deg,#10b981,#059669);color:#fff;font-weight:700;cursor:pointer;font-size:14px}
      .ra-btn.warn{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000}
      .ra-btn.danger{background:#dc2626;color:#fff}
      .ra-btn-sec{padding:8px 14px;border-radius:8px;border:1px solid var(--border,#252837);background:transparent;color:var(--text,#e7e9ee);cursor:pointer;font-size:13px}
      .ra-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
      .ra-list{display:flex;flex-direction:column;gap:8px;margin-top:10px}
      .ra-item{padding:14px;background:var(--card,#161825);border:1px solid var(--border,#252837);border-radius:10px}
      .ra-item.alert{border-color:#dc2626}
      .ra-input,.ra-textarea{width:100%;padding:10px;border-radius:8px;border:1px solid var(--border,#252837);background:var(--bg,#0e1018);color:var(--text,#e7e9ee);font:inherit}
      .ra-textarea{font-family:ui-monospace,monospace;font-size:13px}
      .ra-pill{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;margin-right:4px}
      .ra-pill.s1{background:#fbbf24;color:#000}
      .ra-pill.s2{background:#3b82f6;color:#fff}
      .ra-pill.s3{background:#10b981;color:#fff}
      .ra-pill.draft{background:#6b7280;color:#fff}
      .ra-pill.running{background:#10b981;color:#fff}
      .ra-pill.paused{background:#fbbf24;color:#000}
      .ra-pill.review{background:#a855f7;color:#fff}
      .ra-pill.rejected{background:#ef4444;color:#fff}
      .ra-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center}
      .ra-modal{background:var(--card,#161825);border:1px solid var(--border,#252837);border-radius:12px;padding:20px;width:min(640px,90vw);max-height:90vh;overflow:auto}
    `;
    document.head.appendChild(s);
  }

  // ────────────────────────────────────────────────────────────────────
  // ADVERTISER — Заказать AI-рассылку
  // ────────────────────────────────────────────────────────────────────
  async function loadRoboaiOrderPage() {
    const root = $$('roboaiOrderContent');
    if (!root) return;
    injectStyles();
    document.getElementById('page-title').textContent = '🤖 Заказать AI-рассылку';

    root.innerHTML = `
      <div class="ra-grid">
        <div class="ra-card"><h3>Активные кампании</h3><div class="v" id="raoActive">—</div></div>
        <div class="ra-card"><h3>Сообщений сегодня</h3><div class="v" id="raoSentToday">—</div></div>
        <div class="ra-card"><h3>Лидов всего</h3><div class="v" id="raoLeads">—</div></div>
        <div class="ra-card"><h3>Потрачено / Бюджет</h3><div class="v" id="raoSpent">—</div></div>
      </div>

      <div class="ra-tabs">
        <button class="ra-tab active" data-tab="campaigns" onclick="window._roboaiOrderTab('campaigns')">📋 Мои кампании</button>
        <button class="ra-tab" data-tab="new" onclick="window._roboaiOrderTab('new')">➕ Новая кампания</button>
        <button class="ra-tab" data-tab="audience" onclick="window._roboaiOrderTab('audience')">🎯 Аудитория</button>
        <button class="ra-tab" data-tab="leads" onclick="window._roboaiOrderTab('leads')">💬 Лиды</button>
      </div>

      <div id="raoTabBody"><div class="ra-empty">Загрузка…</div></div>
    `;

    window._roboaiOrderTab = function (tab) {
      document.querySelectorAll('.ra-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      const body = $$('raoTabBody');
      if (tab === 'campaigns') return renderCampaigns(body);
      if (tab === 'new')       return renderNewCampaign(body);
      if (tab === 'audience')  return renderAudience(body);
      if (tab === 'leads')     return renderLeads(body);
    };

    callRoboai('GET', '/campaigns/stats').then(r => {
      if (r.ok && r.data?.stats) {
        const s = r.data.stats;
        $$('raoActive').textContent = s.active_campaigns || 0;
        $$('raoSentToday').textContent = s.sent_today || 0;
        $$('raoLeads').textContent = s.leads_total || 0;
        $$('raoSpent').textContent = fmt$(s.spent_cents) + ' / ' + fmt$(s.budget_cents);
      }
    });
    renderCampaigns($$('raoTabBody'));
  }

  function renderCampaigns(body) {
    body.innerHTML = '<div class="ra-empty">Загрузка кампаний…</div>';
    callRoboai('GET', '/campaigns').then(r => {
      if (!r.ok) {
        body.innerHTML = '<div class="ra-empty">Ошибка: ' + esc(r.data?.reason || r.status) + '</div>';
        return;
      }
      const items = (r.data?.campaigns) || [];
      if (!items.length) {
        body.innerHTML = '<div class="ra-empty">Пока нет кампаний. Нажми «Новая кампания» чтобы создать первую.</div>';
        return;
      }
      body.innerHTML = '<div class="ra-list">' + items.map(c => {
        const stat = (c.status || 'DRAFT').toLowerCase();
        const pillClass = { running:'running', paused:'paused', paused_no_funds:'paused', draft:'draft', pending_review:'review', rejected:'rejected', done:'draft' }[stat] || 'draft';
        const balanceCents = Number(c.balance_cents || 0);
        const spentCents = Number(c.spent_cents || 0);
        const autoTopup = !!c.auto_topup;
        const chunk = Number(c.topup_chunk_cents || 500);
        const minBal = Number(c.min_balance_cents || 100);
        // Balance health color.
        const balColor = balanceCents <= 0 ? '#ef4444' : balanceCents <= minBal ? '#f59e0b' : '#10b981';
        // Status human label.
        const statusHuman = {
          DRAFT: 'Черновик', PENDING_REVIEW: '⏳ На модерации', RUNNING: '✅ Активна',
          PAUSED: '⏸ На паузе', PAUSED_NO_FUNDS: '🔴 Нет средств', DONE: '✓ Завершена', REJECTED: '❌ Отклонена'
        }[c.status] || c.status;
        const pausedNoFundsBanner = c.status === 'PAUSED_NO_FUNDS' ? `
          <div style="margin-top:8px;padding:8px;background:rgba(239,68,68,0.08);border:1px solid #ef4444;border-radius:6px;font-size:12px;color:#fca5a5">
            ⚠️ Кампания остановлена из-за нулевого баланса. Пополни вручную или включи авто-пополнение — кампания возобновится автоматически.
          </div>` : '';
        return `<div class="ra-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
            <div style="flex:1;min-width:0">
              <span class="ra-pill ${pillClass}">${esc(statusHuman)}</span>
              <strong style="margin-left:6px">${esc(c.name)}</strong>
              ${c.niche ? `<span style="color:var(--text-muted);font-size:12px;margin-left:6px">${esc(c.niche)}</span>` : ''}
              <div style="font-size:11px;color:var(--text-muted);margin-top:4px;word-break:break-all">${esc(c.target_url || '')}</div>
            </div>
            <div style="text-align:right;min-width:160px">
              <div style="font-size:11px;color:var(--text-muted)">Баланс</div>
              <div style="font-size:20px;font-weight:700;color:${balColor};line-height:1.1">$${(balanceCents/100).toFixed(2)}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Потрачено: $${(spentCents/100).toFixed(2)}</div>
            </div>
          </div>
          ${pausedNoFundsBanner}
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:10px">
            <label style="display:inline-flex;align-items:center;gap:6px;font-size:11px;background:rgba(255,255,255,0.04);padding:5px 10px;border-radius:6px;cursor:pointer">
              <input type="checkbox" ${autoTopup ? 'checked' : ''} onchange="window._roboaiToggleAutoTopup(${c.id}, this.checked)" style="width:14px;height:14px">
              <span>🔄 Авто-пополнение +$${(chunk/100).toFixed(0)} при $${(minBal/100).toFixed(2)}</span>
            </label>
            <button class="ra-btn" style="font-size:12px;padding:5px 12px" onclick="window._roboaiOpenTopupModal(${c.id}, '${esc(c.name).replace(/'/g, "\\'")}')">💳 Пополнить</button>
            ${c.status === 'PENDING_REVIEW' ? '<span style="color:#a855f7;font-size:11px;padding:5px 10px">⏳ Ждёт админа</span>' :
              c.status === 'REJECTED' ? '<span style="color:#ef4444;font-size:11px;padding:5px 10px">❌ Отклонена</span>' :
              c.status === 'PAUSED_NO_FUNDS' ? '' :
              `<button class="ra-btn-sec" style="font-size:11px;padding:5px 10px" onclick="window._roboaiCampaignAction(${c.id},'${c.status === 'RUNNING' ? 'pause' : 'resume'}')">${c.status === 'RUNNING' ? '⏸ Пауза' : '▶️ Возобновить'}</button>`}
            <button class="ra-btn-sec" style="font-size:11px;padding:5px 10px" onclick="window._roboaiCampaignView(${c.id})">👁 Детали</button>
            <button class="ra-btn-sec" style="font-size:11px;padding:5px 10px" onclick="window._roboaiCampaignEditPrompt(${c.id})">✏️ Промт</button>
          </div>
        </div>`;
      }).join('') + '</div>';
    });
  }

  function renderNewCampaign(body) {
    // Reset wizard state on entry.
    window._roboaiWiz = {
      step: 1,
      brief: { url: '', name: '', description: '', countries: [], languages: ['ru'] },
      preview: null,
      budget: { deposit_cents: 500, auto_topup: true, topup_chunk_cents: 500, per_msg_price_cents: 5, dialog_target: 100 },
    };
    body.innerHTML = '<div id="raoWizContainer"></div>';
    window._roboaiWizRender();
  }

  // Render current step.
  window._roboaiWizRender = function () {
    const w = window._roboaiWiz;
    const root = document.getElementById('raoWizContainer');
    if (!root) return;
    const stepBar = `
      <div style="display:flex;gap:6px;margin-bottom:18px">
        ${[1,2,3,4].map(i => `<div style="flex:1;height:5px;border-radius:3px;background:${i <= w.step ? 'var(--accent,#00d4ff)' : 'rgba(255,255,255,0.08)'}"></div>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Шаг ${w.step} из 4 — ${['Бриф','AI-промт','Бюджет','Подтверждение'][w.step-1]}</div>`;
    let content = '';
    if (w.step === 1) content = renderStep1();
    else if (w.step === 2) content = renderStep2();
    else if (w.step === 3) content = renderStep3();
    else if (w.step === 4) content = renderStep4();
    root.innerHTML = `<div class="ra-card">${stepBar}${content}</div>`;
  };

  function renderStep1() {
    const b = window._roboaiWiz.brief;
    return `
      <h3 style="margin:0 0 14px">📝 Бриф кампании</h3>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">URL продукта/лендинга <span style="color:#ef4444">*</span></label>
      <input id="wizUrl" type="url" placeholder="https://example.com/landing" class="ra-input" value="${esc(b.url)}" style="margin-bottom:12px">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Имя кампании</label>
      <input id="wizName" type="text" placeholder="(необязательно — сгенерим автоматом)" class="ra-input" value="${esc(b.name)}" style="margin-bottom:12px">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Описание оффера <span style="color:#ef4444">*</span> <span style="font-size:11px;color:#fbbf24">(минимум 30 символов — это основа для AI-промта)</span></label>
      <textarea id="wizDesc" rows="4" placeholder="Например: продаём AI-CRM для предпринимателей в МЛМ — даёт авто-рассылку в TG + лиды + аналитика. Цена $97/мес. Целевая аудитория: МЛМ-лидеры с командой 50+." class="ra-textarea" style="margin-bottom:6px">${esc(b.description)}</textarea>
      <div id="wizDescCounter" style="font-size:11px;color:var(--text-muted);margin-bottom:14px">${b.description.length}/30 символов минимум</div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Гео аудитории (ISO-2, через запятую)</label>
      <input id="wizCountries" type="text" placeholder="ru, kz, by, ua" class="ra-input" value="${esc(b.countries.join(', '))}" style="margin-bottom:12px">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Языки (ISO-2)</label>
      <input id="wizLanguages" type="text" placeholder="ru, en" class="ra-input" value="${esc(b.languages.join(', '))}" style="margin-bottom:14px">
      <div class="ra-row">
        <button class="ra-btn" onclick="window._roboaiWizStep1Submit()">Далее →</button>
        <button class="ra-btn-sec" onclick="window._roboaiOrderTab('campaigns')">Отмена</button>
      </div>
      <script>
        (function(){
          const ta = document.getElementById('wizDesc');
          const c = document.getElementById('wizDescCounter');
          if (ta && c) ta.addEventListener('input', () => {
            const len = ta.value.length;
            c.textContent = len + '/30 символов минимум';
            c.style.color = len < 30 ? '#ef4444' : '#10b981';
          });
        })();
      </script>
    `;
  }

  window._roboaiWizStep1Submit = function () {
    const url = (document.getElementById('wizUrl')||{}).value || '';
    const name = (document.getElementById('wizName')||{}).value || '';
    const desc = (document.getElementById('wizDesc')||{}).value || '';
    const cc = (document.getElementById('wizCountries')||{}).value || '';
    const ll = (document.getElementById('wizLanguages')||{}).value || '';
    if (!url.trim() || !/^https?:\/\//.test(url.trim())) { alert('URL должен начинаться с http(s)://'); return; }
    if (desc.trim().length < 30) { alert('Описание должно быть минимум 30 символов'); return; }
    window._roboaiWiz.brief = {
      url: url.trim(),
      name: name.trim(),
      description: desc.trim(),
      countries: cc.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
      languages: ll.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    };
    window._roboaiWiz.step = 2;
    window._roboaiWizRender();
    // Fire AI preview.
    setTimeout(() => window._roboaiWizFetchPreview(), 50);
  };

  function renderStep2() {
    const w = window._roboaiWiz;
    if (!w.preview) {
      return `<h3 style="margin:0 0 14px">🤖 Генерируем AI-промт…</h3>
        <div style="color:var(--accent)">⏳ Groq читает страницу <code>${esc(w.brief.url)}</code> и собирает системный промт. Обычно 5-15 секунд.</div>
        <div id="wizPreviewErr" style="margin-top:10px"></div>`;
    }
    const p = w.preview;
    const reviewBlock = p.should_review ? `
      <div style="margin-bottom:12px;padding:10px;background:rgba(245,158,11,0.08);border:1px solid #f59e0b;border-radius:8px;font-size:12px">
        ⚠️ <b>На модерацию:</b> ${(p.review_reasons||[]).map(r => esc(r)).join(', ')}<br>
        Кампания будет создана со статусом PENDING_REVIEW. Админ одобрит вручную.
      </div>` : '';
    return `
      <h3 style="margin:0 0 14px">🤖 AI-промт готов</h3>
      ${reviewBlock}
      <div style="margin-bottom:12px">
        <span style="font-size:12px;color:var(--text-muted)">Ниша:</span>
        <b>${esc(p.niche || '—')}</b>
        <span style="font-size:11px;color:var(--text-muted)">(уверенность ${Math.round((p.niche_confidence||0)*100)}%)</span>
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Системный промт (отредактируй если надо)</label>
      <textarea id="wizSysPrompt" rows="6" class="ra-textarea" style="margin-bottom:12px">${esc(p.system_prompt || '')}</textarea>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Варианты первых сообщений (по одному на строку, минимум 1)</label>
      <textarea id="wizOpenings" rows="6" class="ra-textarea" style="margin-bottom:12px">${esc((p.opening_variants || []).join('\n'))}</textarea>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Правила ответов на типичные реакции</label>
      <textarea id="wizReplyRules" rows="3" class="ra-textarea" style="margin-bottom:14px">${esc(p.reply_rules || '')}</textarea>
      <div class="ra-row">
        <button class="ra-btn-sec" onclick="window._roboaiWizGoStep(1)">← Назад</button>
        <button class="ra-btn-sec" onclick="window._roboaiWizFetchPreview()">🔁 Сгенерировать заново</button>
        <button class="ra-btn" onclick="window._roboaiWizStep2Submit()">Далее →</button>
      </div>`;
  }

  window._roboaiWizFetchPreview = async function () {
    window._roboaiWiz.preview = null;
    window._roboaiWizRender();
    try {
      const r = await callRoboai('POST', '/campaigns/wizard/preview', {
        target_url: window._roboaiWiz.brief.url,
        description: window._roboaiWiz.brief.description,
      });
      if (!r.ok) {
        const err = document.getElementById('wizPreviewErr');
        if (err) err.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.data?.detail || r.data?.reason || r.status) + '</div>' +
          '<button class="ra-btn-sec" style="margin-top:10px" onclick="window._roboaiWizGoStep(1)">← Назад</button>';
        return;
      }
      window._roboaiWiz.preview = r.data;
      window._roboaiWizRender();
    } catch (e) {
      const err = document.getElementById('wizPreviewErr');
      if (err) err.innerHTML = '<div style="color:#ef4444">❌ Сеть: ' + esc(e.message || e) + '</div>';
    }
  };

  window._roboaiWizStep2Submit = function () {
    const sp = (document.getElementById('wizSysPrompt')||{}).value || '';
    const oo = (document.getElementById('wizOpenings')||{}).value || '';
    const rr = (document.getElementById('wizReplyRules')||{}).value || '';
    const openings = oo.split('\n').map(s => s.trim()).filter(Boolean);
    if (!sp.trim()) { alert('Системный промт не может быть пустым'); return; }
    if (!openings.length) { alert('Нужен хотя бы 1 вариант первого сообщения'); return; }
    window._roboaiWiz.preview.system_prompt = sp.trim();
    window._roboaiWiz.preview.opening_variants = openings;
    window._roboaiWiz.preview.reply_rules = rr.trim();
    window._roboaiWiz.step = 3;
    window._roboaiWizRender();
  };

  function renderStep3() {
    const b = window._roboaiWiz.budget;
    return `
      <h3 style="margin:0 0 14px">💰 Бюджет</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div>
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Стартовый депозит (USD, минимум $5)</label>
          <input id="wizDeposit" type="number" min="5" step="1" value="${(b.deposit_cents/100).toFixed(0)}" class="ra-input">
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Сумма списывается с основного баланса при создании.</div>
        </div>
        <div>
          <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Цена за сообщение</label>
          <input type="text" value="$${(b.per_msg_price_cents/100).toFixed(2)} (фикс)" class="ra-input" disabled>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Списывается с баланса кампании за каждое исходящее DM.</div>
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;cursor:pointer">
        <input id="wizAutoTopup" type="checkbox" ${b.auto_topup ? 'checked' : ''} style="width:18px;height:18px">
        <span><b>Авто-пополнение</b> — когда баланс падает до $1, автоматически списывать ещё $5 с основного кошелька</span>
      </label>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;line-height:1.4">
        💡 Без авто-топапа кампания встанет на паузу когда баланс закончится, придёт уведомление в @GoldenConnectCRMBot.<br>
        💡 С авто-топапом кампания работает непрерывно пока на основном кошельке есть деньги.
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Целевое количество диалогов (для ориентировки)</label>
      <input id="wizDialogTarget" type="number" min="10" step="10" value="${b.dialog_target}" class="ra-input" style="margin-bottom:6px">
      <div id="wizBudgetSummary" style="background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.3);border-radius:8px;padding:10px;margin-bottom:14px;font-size:12px"></div>
      <div class="ra-row">
        <button class="ra-btn-sec" onclick="window._roboaiWizGoStep(2)">← Назад</button>
        <button class="ra-btn" onclick="window._roboaiWizStep3Submit()">Далее →</button>
      </div>
      <script>
        (function(){
          function recalc() {
            const dep = parseInt((document.getElementById('wizDeposit')||{}).value || '5', 10);
            const target = parseInt((document.getElementById('wizDialogTarget')||{}).value || '100', 10);
            const msgsPerDialog = 4;
            const msgs = Math.floor(dep / 0.05);
            const at = (document.getElementById('wizAutoTopup')||{}).checked;
            const sum = document.getElementById('wizBudgetSummary');
            if (sum) sum.innerHTML = '📊 <b>Стартовый депозит $' + dep + '</b> ≈ <b>' + msgs + '</b> исходящих сообщений (~' + Math.floor(msgs/msgsPerDialog) + ' диалогов при ~' + msgsPerDialog + ' сообщений на лида).<br>' +
              (at ? '🔄 <b>Авто-топап ON</b> — после первой партии кампания будет автоматически добавлять по $5 пока хватает основного кошелька.' : '⏸ <b>Авто-топап OFF</b> — после исчерпания депозита кампания встанет на паузу.');
          }
          ['wizDeposit','wizDialogTarget','wizAutoTopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', recalc);
            if (el) el.addEventListener('change', recalc);
          });
          recalc();
        })();
      </script>
    `;
  }

  window._roboaiWizStep3Submit = function () {
    const dep = parseInt((document.getElementById('wizDeposit')||{}).value || '5', 10);
    if (dep < 5) { alert('Минимум $5'); return; }
    const auto = !!(document.getElementById('wizAutoTopup')||{}).checked;
    const target = parseInt((document.getElementById('wizDialogTarget')||{}).value || '100', 10);
    window._roboaiWiz.budget = {
      deposit_cents: dep * 100,
      auto_topup: auto,
      topup_chunk_cents: 500,
      per_msg_price_cents: 5,
      dialog_target: target,
    };
    window._roboaiWiz.step = 4;
    window._roboaiWizRender();
  };

  function renderStep4() {
    const w = window._roboaiWiz;
    const reviewBadge = w.preview?.should_review
      ? '<span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">⚠️ PENDING_REVIEW</span>'
      : '<span style="background:#10b981;color:#000;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700">✓ DRAFT (готово)</span>';
    return `
      <h3 style="margin:0 0 14px">✅ Подтверждение</h3>
      ${reviewBadge}
      <div style="margin:14px 0;padding:14px;background:rgba(255,255,255,0.03);border-radius:8px">
        <div style="margin-bottom:6px"><span style="color:var(--text-muted);font-size:12px">URL:</span> <code>${esc(w.brief.url)}</code></div>
        <div style="margin-bottom:6px"><span style="color:var(--text-muted);font-size:12px">Ниша:</span> <b>${esc(w.preview?.niche || '—')}</b></div>
        <div style="margin-bottom:6px"><span style="color:var(--text-muted);font-size:12px">Описание:</span> ${esc(w.brief.description.slice(0,200))}${w.brief.description.length>200?'…':''}</div>
        <div style="margin-bottom:6px"><span style="color:var(--text-muted);font-size:12px">Гео:</span> ${w.brief.countries.length?w.brief.countries.join(', '):'все'} | <span style="color:var(--text-muted);font-size:12px">Языки:</span> ${w.brief.languages.length?w.brief.languages.join(', '):'все'}</div>
      </div>
      <div style="margin-bottom:14px;padding:14px;background:rgba(0,212,255,0.05);border-left:3px solid var(--accent);border-radius:6px">
        <div style="font-weight:600;margin-bottom:6px">💰 Будет списано с основного кошелька: $${(w.budget.deposit_cents/100).toFixed(2)}</div>
        <div style="font-size:12px;color:var(--text-muted)">
          • Депозит на кампанию: $${(w.budget.deposit_cents/100).toFixed(2)}<br>
          • Цена за сообщение: $${(w.budget.per_msg_price_cents/100).toFixed(2)}<br>
          • Авто-топап: ${w.budget.auto_topup ? '✓ ON — +$5 при достижении $1' : '✗ OFF — пауза при $0'}
        </div>
      </div>
      <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;margin-bottom:14px;cursor:pointer">
        <input id="wizAgree" type="checkbox" style="width:18px;height:18px;margin-top:2px">
        <span>Подтверждаю, что промт не содержит мошенничества, гэмблинга, наркотиков или незаконного контента. Понимаю, что нарушение → бан + потеря депозита.</span>
      </label>
      <div class="ra-row">
        <button class="ra-btn-sec" onclick="window._roboaiWizGoStep(3)">← Назад</button>
        <button class="ra-btn" onclick="window._roboaiWizFinalSubmit()">🚀 Создать кампанию</button>
      </div>
      <div id="wizFinalStatus" style="margin-top:12px"></div>
    `;
  }

  window._roboaiWizGoStep = function (s) {
    window._roboaiWiz.step = s;
    window._roboaiWizRender();
  };

  window._roboaiWizFinalSubmit = async function () {
    const w = window._roboaiWiz;
    if (!(document.getElementById('wizAgree')||{}).checked) { alert('Подтверди согласие'); return; }
    const status = document.getElementById('wizFinalStatus');
    if (status) status.innerHTML = '<div style="color:var(--accent)">⏳ Создаю кампанию и списываю депозит…</div>';
    const r = await callRoboai('POST', '/campaigns/wizard/create', {
      name: w.brief.name || null,
      target_url: w.brief.url,
      description: w.brief.description,
      niche: w.preview?.niche || null,
      system_prompt: w.preview?.system_prompt || '',
      opening_variants: w.preview?.opening_variants || [],
      reply_rules: w.preview?.reply_rules || '',
      target_country_codes: w.brief.countries,
      target_language_codes: w.brief.languages,
      deposit_cents: w.budget.deposit_cents,
      auto_topup: w.budget.auto_topup,
      topup_chunk_cents: w.budget.topup_chunk_cents,
      per_msg_price_cents: w.budget.per_msg_price_cents,
      should_review: !!w.preview?.should_review,
      review_reasons: w.preview?.review_reasons || [],
    });
    if (!r.ok) {
      if (status) status.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.data?.detail || r.data?.reason || r.status) + '</div>';
      return;
    }
    if (status) status.innerHTML = `
      <div style="padding:14px;background:rgba(16,185,129,0.08);border:1px solid #10b981;border-radius:8px">
        <div style="color:#10b981;font-weight:600;font-size:15px;margin-bottom:6px">✅ Кампания #${r.data.campaign_id} создана</div>
        <div style="font-size:12px">Статус: <b>${esc(r.data.status)}</b> · Баланс: <b>$${(r.data.balance_cents/100).toFixed(2)}</b></div>
        ${r.data.status === 'PENDING_REVIEW' ? '<div style="font-size:11px;color:#fbbf24;margin-top:6px">⚠️ Кампания ушла на модерацию админу. Уведомление придёт когда одобрят.</div>' : ''}
      </div>
      <div style="margin-top:10px"><button class="ra-btn" onclick="window._roboaiOrderTab('campaigns')">📋 К списку кампаний</button></div>
    `;
  };


  function renderAudience(body) {
    body.innerHTML = `
      <div class="ra-card">
        <h3 style="font-size:16px;color:var(--text,#e7e9ee);margin-bottom:8px">Источники аудитории</h3>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
          Выбери из наших готовых баз, спарси чаты под заказ или загрузи свой список.
        </div>
        <div class="ra-row">
          <button class="ra-btn-sec" onclick="window._roboaiAudienceTab('curated')">📚 Наши базы</button>
          <button class="ra-btn-sec" onclick="window._roboaiAudienceTab('upload')">📤 Загрузить свой список</button>
          <button class="ra-btn-sec" onclick="window._roboaiAudienceTab('mine')">📁 Мои списки</button>
          <button class="ra-btn-sec" onclick="window._roboaiAudienceTab('parse')">🔍 Парсинг под заказ</button>
        </div>
      </div>
      <div id="raoAudBody" style="margin-top:14px"><div class="ra-empty">Выбери источник выше.</div></div>
    `;
  }

  function renderLeads(body) {
    body.innerHTML = '<div class="ra-empty">Загрузка лидов…</div>';
    callRoboai('GET', '/leads').then(r => {
      if (!r.ok) {
        body.innerHTML = '<div class="ra-empty">Ошибка: ' + esc(r.data?.reason || r.status) + '</div>';
        return;
      }
      const items = (r.data?.leads) || [];
      if (!items.length) {
        body.innerHTML = '<div class="ra-empty">Лидов пока нет. Запусти кампанию чтобы получить первых ответивших.</div>';
        return;
      }
      body.innerHTML = '<div class="ra-list">' + items.map(l => `
        <div class="ra-item">
          <strong>@${esc(l.username || 'user_' + l.telegram_id)}</strong>
          <span class="ra-pill" style="background:#10b981;color:#fff">${esc(l.outcome || 'INTERESTED')}</span>
          <span style="font-size:11px;color:var(--text-muted);margin-left:6px">score: ${(l.interest_score || 0).toFixed(2)}</span>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${esc(l.reply_summary || '')}</div>
        </div>
      `).join('') + '</div>';
    });
  }

  window._roboaiCreateCampaign = async function () {
    const url = $$('raoNewUrl').value.trim();
    const name = $$('raoNewName').value.trim() || 'Кампания';
    const desc = $$('raoNewDesc').value.trim();
    if (!url) { alert('Введи URL'); return; }
    const status = $$('raoNewStatus');
    status.innerHTML = '<div style="color:var(--accent)">⏳ AI читает сайт и генерит промт…</div>';
    const r = await callRoboai('POST', '/campaigns/draft-from-url', { name, target_url: url, description: desc });
    if (!r.ok) {
      status.innerHTML = '<div style="color:#ef4444">❌ Ошибка: ' + esc(r.data?.reason || r.status) + '</div>';
      return;
    }
    const d = r.data;
    let html = `<div style="color:#10b981">✅ Кампания #${d.campaign_id} создана со статусом <b>${esc(d.status)}</b></div>`;
    if (d.niche) html += `<div style="margin-top:6px;font-size:13px">Ниша: <b>${esc(d.niche)}</b></div>`;
    if (d.should_review && d.review_reasons?.length) {
      html += '<div style="margin-top:8px;padding:10px;border:1px solid #a855f7;border-radius:8px;background:rgba(168,85,247,0.1)"><b>⚠️ Кампания на модерации</b><ul style="margin:6px 0 0 18px;font-size:12px">';
      d.review_reasons.forEach(r => html += '<li>' + esc(r) + '</li>');
      html += '</ul></div>';
    }
    if (d.auto_prompt_error) {
      html += '<div style="color:#ef4444;margin-top:8px;font-size:12px">AI-генератор не сработал: ' + esc(d.auto_prompt_error) + '</div>';
    }
    html += '<div style="margin-top:10px"><button class="ra-btn-sec" onclick="window._roboaiOrderTab(\'campaigns\')">К списку кампаний</button></div>';
    status.innerHTML = html;
  };

  // ─── Top-up modal + auto-topup toggle ───
  window._roboaiOpenTopupModal = function (campaignId, campaignName) {
    showModal(`
      <h3 style="margin:0 0 8px">💳 Пополнить кампанию</h3>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
        <b>${esc(campaignName)}</b> · ID #${campaignId}<br>
        Сумма списывается с основного кошелька на баланс кампании. Расход — $0.05 за каждое исходящее сообщение.
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Сумма (USD, минимум $1)</label>
      <input id="raoTopupAmt" type="number" min="1" step="1" value="5" class="ra-input" style="margin-bottom:6px;font-size:18px;text-align:center">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Быстрый выбор:
        <button class="ra-btn-sec" style="font-size:11px;padding:3px 8px;margin-left:6px" onclick="document.getElementById('raoTopupAmt').value=5">$5</button>
        <button class="ra-btn-sec" style="font-size:11px;padding:3px 8px" onclick="document.getElementById('raoTopupAmt').value=20">$20</button>
        <button class="ra-btn-sec" style="font-size:11px;padding:3px 8px" onclick="document.getElementById('raoTopupAmt').value=50">$50</button>
        <button class="ra-btn-sec" style="font-size:11px;padding:3px 8px" onclick="document.getElementById('raoTopupAmt').value=100">$100</button>
      </div>
      <div id="raoTopupStatus" style="margin-bottom:10px"></div>
      <div class="ra-row">
        <button class="ra-btn" onclick="window._roboaiSubmitTopup(${campaignId})">Пополнить</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
    `);
    setTimeout(() => { const i = document.getElementById('raoTopupAmt'); if (i) i.focus(); }, 50);
  };

  window._roboaiSubmitTopup = async function (campaignId) {
    const amt = parseFloat((document.getElementById('raoTopupAmt')||{}).value || '0');
    if (!amt || amt < 1) { alert('Минимум $1'); return; }
    const st = document.getElementById('raoTopupStatus');
    if (st) st.innerHTML = '<div style="color:var(--accent)">⏳ Списываем с основного кошелька…</div>';
    const r = await callRoboai('POST', '/campaigns/' + campaignId + '/topup', { amount_cents: Math.round(amt * 100) });
    if (!r.ok) {
      if (st) st.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.data?.detail || r.data?.reason || r.status) + '</div>';
      return;
    }
    if (st) st.innerHTML = '<div style="color:#10b981">✅ Баланс пополнен. Текущий: $' + (r.data.balance_cents/100).toFixed(2) + '</div>';
    setTimeout(() => { window._roboaiCloseModal(); window._roboaiOrderTab('campaigns'); }, 1500);
  };

  window._roboaiToggleAutoTopup = async function (campaignId, enabled) {
    const r = await callRoboai('POST', '/campaigns/' + campaignId + '/auto-topup', { enabled });
    if (!r.ok) alert('Ошибка: ' + (r.data?.reason || r.status));
  };

  window._roboaiCampaignAction = async function (id, action) {
    const r = await callRoboai('POST', '/campaigns/' + id + '/' + action, {});
    if (!r.ok) { alert('Ошибка: ' + (r.data?.reason || r.status) + (r.data?.message ? '\n' + r.data.message : '')); return; }
    window._roboaiOrderTab('campaigns');
  };

  window._roboaiCampaignView = async function (id) {
    const r = await callRoboai('POST', '/campaigns/' + id + '/view', {});
    if (!r.ok) { alert('Ошибка: ' + (r.data?.reason || r.status)); return; }
    const c = r.data?.campaign;
    if (!c) return;
    const counts = c._count || {};
    showModal(`
      <h3 style="margin:0 0 12px">Кампания #${c.id}: ${esc(c.name)}</h3>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:8px">
        Статус: <b>${esc(c.status)}</b> · Ниша: <b>${esc(c.niche || '—')}</b> · Цена: <b>${fmt$(c.perMsgPriceCents)}</b>/msg
      </div>
      <div style="font-size:13px;margin-bottom:6px">URL: <a href="${esc(c.targetUrl||'')}" target="_blank">${esc(c.targetUrl||'')}</a></div>
      <div style="font-size:13px;margin-bottom:6px">Сообщений: ${counts.messages||0} · Аккаунтов в кампании: ${counts.assignments||0} · Лидов: ${counts.interactions||0}</div>
      <div style="font-size:13px;margin-bottom:4px">Бюджет: ${fmt$(c.spentCents)} / ${fmt$(c.totalBudgetCents)}</div>
      <hr style="border:0;border-top:1px solid var(--border);margin:12px 0">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">SYSTEM PROMPT:</div>
      <pre style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:6px;font-size:12px">${esc(c.systemPrompt)}</pre>
      <div style="font-size:12px;color:var(--text-muted);margin:10px 0 4px">OPENING VARIANTS:</div>
      <ol style="font-size:12px;padding-left:20px">${(c.openingVariants||[]).map(v => '<li>' + esc(v) + '</li>').join('')}</ol>
      ${c.replyRules ? `<div style="font-size:12px;color:var(--text-muted);margin:10px 0 4px">REPLY RULES:</div><pre style="white-space:pre-wrap;background:var(--bg);padding:10px;border-radius:6px;font-size:12px">${esc(c.replyRules)}</pre>` : ''}
      ${c.moderationLogs?.length ? '<div style="font-size:12px;color:var(--text-muted);margin:10px 0 4px">MODERATION:</div><ul style="font-size:12px;padding-left:20px">' + c.moderationLogs.map(m => `<li>${esc(m.aiVerdict)} (${(m.score||0).toFixed(2)}): ${esc(JSON.stringify(m.reasons))}</li>`).join('') + '</ul>' : ''}
      <div class="ra-row" style="margin-top:14px"><button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Закрыть</button></div>
    `);
  };

  window._roboaiCampaignEditPrompt = async function (id) {
    const r = await callRoboai('POST', '/campaigns/' + id + '/view', {});
    if (!r.ok) { alert('Ошибка: ' + (r.data?.reason || r.status)); return; }
    const c = r.data?.campaign;
    showModal(`
      <h3 style="margin:0 0 12px">Редактировать промт #${c.id}</h3>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">System prompt</label>
      <textarea id="raoEditSys" rows="6" class="ra-textarea" style="margin-bottom:12px">${esc(c.systemPrompt)}</textarea>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Opening variants (по одному на строку, 3-5 шт)</label>
      <textarea id="raoEditOpen" rows="6" class="ra-textarea" style="margin-bottom:12px">${esc((c.openingVariants||[]).join('\n'))}</textarea>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Reply rules</label>
      <textarea id="raoEditRules" rows="3" class="ra-textarea" style="margin-bottom:12px">${esc(c.replyRules || '')}</textarea>
      <div class="ra-row">
        <button class="ra-btn" onclick="window._roboaiSaveEditPrompt(${c.id})">💾 Сохранить</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
    `);
  };

  window._roboaiSaveEditPrompt = async function (id) {
    const sys = $$('raoEditSys').value;
    const opens = $$('raoEditOpen').value.split('\n').map(s => s.trim()).filter(Boolean);
    const rules = $$('raoEditRules').value;
    const r = await callRoboai('POST', '/campaigns/' + id + '/edit-prompt', {
      system_prompt: sys, opening_variants: opens, reply_rules: rules,
    });
    if (!r.ok) { alert('Ошибка: ' + (r.data?.reason || r.status)); return; }
    window._roboaiCloseModal();
    window._roboaiOrderTab('campaigns');
  };

  window._roboaiAudienceTab = function (which) {
    const b = $$('raoAudBody');
    if (which === 'curated') {
      b.innerHTML = '<div class="ra-empty">Загрузка курируемых баз…</div>';
      callRoboai('GET', '/audience/curated').then(r => {
        const items = (r.data?.lists) || [];
        if (!items.length) { b.innerHTML = '<div class="ra-empty">Курируемых баз пока нет — админ собирает.</div>'; return; }
        b.innerHTML = '<div class="ra-list">' + items.map(l => `
          <div class="ra-item"><strong>${esc(l.name)}</strong> <span style="color:var(--text-muted);font-size:12px">— ${l.size_cached || 0} контактов</span></div>
        `).join('') + '</div>';
      });
    } else if (which === 'upload') {
      b.innerHTML = `<div class="ra-card">
        <h3>Загрузить свой список</h3>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Поддерживаются форматы: @username, +79991234567, https://t.me/user, telegram_id (число), любой текст с этими элементами. Дубли убираются автоматически.</div>
        <textarea id="raoUpName" placeholder="Имя списка (необязательно)" class="ra-input" style="margin-bottom:8px"></textarea>
        <textarea id="raoUpCsv" rows="10" placeholder="@user1\\n+79990001122\\nhttps://t.me/user2\\n..." class="ra-textarea"></textarea>
        <div class="ra-row"><button class="ra-btn" onclick="window._roboaiUploadList()">📤 Загрузить</button></div>
        <div id="raoUpResult" style="margin-top:10px"></div>
      </div>`;
    } else if (which === 'mine') {
      b.innerHTML = '<div class="ra-empty">Загрузка списков…</div>';
      callRoboai('GET', '/audience/mine').then(r => {
        const items = (r.data?.lists) || [];
        if (!items.length) { b.innerHTML = '<div class="ra-empty">У тебя пока нет загруженных списков.</div>'; return; }
        b.innerHTML = '<div class="ra-list">' + items.map(l => `
          <div class="ra-item">
            <strong>${esc(l.name)}</strong>
            <span class="ra-pill" style="background:var(--accent-soft);color:var(--accent)">${esc(l.source)}</span>
            <span style="font-size:11px;color:var(--text-muted);margin-left:6px">${l.size_cached || 0} контактов</span>
            ${l.exclusive_to_owner ? '<span class="ra-pill" style="background:#fbbf24;color:#000">эксклюзив</span>' : ''}
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">создан ${esc(String(l.created_at).slice(0,10))}</div>
          </div>
        `).join('') + '</div>';
      });
    } else if (which === 'parse') {
      b.innerHTML = '<div class="ra-empty">Парсинг под заказ — в разработке.<br>Используй курируемые базы или свой список.</div>';
    }
  };

  window._roboaiUploadList = async function () {
    const text = $$('raoUpCsv').value.trim();
    const name = $$('raoUpName').value.trim();
    const result = $$('raoUpResult');
    if (!text) return;
    result.innerHTML = '<div style="color:var(--accent)">⏳ Парсинг…</div>';
    const r = await callRoboai('POST', '/audience/upload', { raw_text: text, name });
    if (!r.ok) {
      result.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.data?.reason || r.status) + '</div>';
      return;
    }
    const d = r.data;
    result.innerHTML = `<div style="color:#10b981">✅ Загружено</div>
      <div style="font-size:13px;margin-top:6px">Список #${d.list_id} · добавлено контактов: ${d.added_count || 0} · дубликатов: ${d.duplicates || 0}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">Новых Person в базе: ${d.new_persons || 0}</div>`;
  };

  function showModal(html) {
    // Remove any leftover.
    const prev = document.getElementById('raoNativeDialog');
    if (prev) { try { prev.close(); } catch(e){} prev.remove(); }
    // Native <dialog> — rendered in top layer, immune to stacking context bugs.
    const dlg = document.createElement('dialog');
    dlg.id = 'raoNativeDialog';
    dlg.className = 'ra-dialog';
    dlg.setAttribute('style', [
      'border:1px solid var(--border,#252837)',
      'border-radius:14px',
      'background:var(--card,#161825)',
      'color:var(--text,#fff)',
      'padding:0',
      'width:min(640px,92vw)',
      'max-height:90vh',
      'overflow:visible',
      'box-shadow:0 30px 80px rgba(0,0,0,.55)',
      'margin:auto'
    ].join(';') + ';');
    const inner = document.createElement('div');
    inner.className = 'ra-modal';
    inner.setAttribute('style', 'padding:22px;max-height:88vh;overflow-y:auto;');
    inner.innerHTML = html;
    dlg.appendChild(inner);
    document.body.appendChild(dlg);
    // Backdrop styling via injected stylesheet (one time).
    if (!document.getElementById('raoDialogStyles')) {
      const st = document.createElement('style');
      st.id = 'raoDialogStyles';
      st.textContent = `
        dialog.ra-dialog::backdrop {
          background: rgba(0,0,0,.72);
          -webkit-backdrop-filter: blur(8px);
          backdrop-filter: blur(8px);
        }
        dialog.ra-dialog[open] {
          animation: rao-dlg-in 200ms ease-out;
        }
        @keyframes rao-dlg-in {
          from { opacity:0; transform:scale(.95) translateY(-8px); }
          to   { opacity:1; transform:scale(1)   translateY(0);   }
        }
      `;
      document.head.appendChild(st);
    }
    // Click outside (on backdrop) closes.
    dlg.addEventListener('click', (e) => {
      const rect = dlg.getBoundingClientRect();
      const inDialog = (e.clientX >= rect.left && e.clientX <= rect.right &&
                        e.clientY >= rect.top  && e.clientY <= rect.bottom);
      if (!inDialog) window._roboaiCloseModal();
    });
    // Open in modal mode — top-layer rendering, ESC closes natively.
    try { dlg.showModal(); }
    catch(e) {
      // Fallback for browsers without <dialog>: position:fixed overlay.
      dlg.setAttribute('open', '');
      dlg.style.position = 'fixed';
      dlg.style.top = '50%';
      dlg.style.left = '50%';
      dlg.style.transform = 'translate(-50%,-50%)';
      dlg.style.zIndex = '2000000';
    }
  }
  window._roboaiCloseModal = function () {
    const dlg = document.getElementById('raoNativeDialog');
    if (dlg) {
      try { dlg.close(); } catch(e){}
      dlg.remove();
    }
    // Legacy cleanup in case old overlays linger.
    const old = document.getElementById('raoModalBack');
    if (old) old.remove();
    document.body.style.overflow = '';
  };

  window.loadRoboaiOrderPage = loadRoboaiOrderPage;

  // ────────────────────────────────────────────────────────────────────
  // PROVIDER — Заработок на аккаунтах
  // ────────────────────────────────────────────────────────────────────
  // SpamBot status chip (used by /roboai-earn — not loaded from crm-app.js here)
  if (!window.spamBotStatusChip) {
    window.spamBotStatusChip = function(state, frozenUntil) {
      if (!state) return '<span class="ra-pill" style="background:#888;color:#fff">no check</span>';
      if (state === 'clean') return '<span class="ra-pill" style="background:#22c55e;color:#fff">clean</span>';
      if (state === 'frozen_soft') {
        var dt = frozenUntil ? new Date(frozenUntil).toLocaleDateString('ru-RU') : '?';
        return '<span class="ra-pill" style="background:#fbbf24;color:#000">frozen ' + dt + '</span>';
      }
      if (state === 'restricted_dm') return '<span class="ra-pill" style="background:#f97316;color:#fff">no DM</span>';
      if (state === 'banned') return '<span class="ra-pill" style="background:#ef4444;color:#fff">BAN (proxy released)</span>';
      if (state === 'unresponsive') return '<span class="ra-pill" style="background:#888;color:#fff">no answer</span>';
      return '<span class="ra-pill">' + state + '</span>';
    };
  }
  if (!window.spamBotCheckAccount) {
    window.spamBotCheckAccount = async function(accountId, btn) {
      if (btn) { btn.disabled = true; btn.textContent = 'wait'; }
      try {
        await fetch('/cabinet/api/roboai/accounts/' + accountId + '/spambot-check', { method: 'POST' }).then(x => x.json());
        if (btn) btn.textContent = 'ok';
        if (window.loadRoboaiEarnPage) setTimeout(window.loadRoboaiEarnPage, 800);
      } catch (e) {
        if (btn) { btn.disabled = false; btn.textContent = 'recheck'; }
      }
    };
  }

  async function loadRoboaiEarnPage() {
    const root = $$('roboaiEarnContent');
    if (!root) return;
    injectStyles();
    document.getElementById('page-title').textContent = '💸 Заработок на аккаунтах';

    root.innerHTML = `
      <div class="ra-grid">
        <div class="ra-card"><h3>Аккаунтов всего</h3><div class="v" id="reTotal">—</div></div>
        <div class="ra-card"><h3>S1 / S2 / S3</h3><div class="v" id="reStages">—</div></div>
        <div class="ra-card"><h3>Действий сегодня</h3><div class="v" id="reTodayActs">—</div></div>
        <div class="ra-card"><h3>Заработано</h3><div class="v" id="reEarned">—</div></div>
        <div class="ra-card"><h3>На выплату</h3><div class="v" id="rePending">—</div></div>
      </div>

      <div class="ra-row">
        <button class="ra-btn warn" onclick="window._roboaiAddAccount('otp')">➕ Подключить аккаунт (OTP)</button>
        <button class="ra-btn-sec" onclick="window._roboaiAddAccount('bulk')">📋 Массовый импорт списком</button>
        <button class="ra-btn-sec" onclick="window._roboaiViewBatches()">📜 Импорт-batches</button>
        <button class="ra-btn-sec" onclick="window.roboaiUploadTdataZip()">📦 TDATA.zip</button>
        <button class="ra-btn-sec" onclick="window.roboaiUploadDocument()">📄 Документ со ссылками</button>
        <button class="ra-btn-sec" onclick="window._roboaiWithdraw()">💸 Вывести</button>
      </div>

      <div id="reNotifications" style="margin-bottom:14px"></div>
      <div id="reAccountsBody"><div class="ra-empty">Загрузка аккаунтов…</div></div>
    `;

    if (typeof window._roboaiLoadNotifications === 'function') window._roboaiLoadNotifications();
    callRoboai('GET', '/accounts/stats').then(r => {
      if (r.ok && r.data?.stats) {
        const s = r.data.stats;
        $$('reTotal').textContent = s.total || 0;
        $$('reStages').textContent = (s.s1 || 0) + ' / ' + (s.s2 || 0) + ' / ' + (s.s3 || 0);
        $$('reTodayActs').textContent = s.today_actions || 0;
        $$('reEarned').textContent = fmt$(s.earned_cents);
        $$('rePending').textContent = fmt$(s.pending_cents);
      }
    });

    callRoboai('GET', '/accounts').then(r => {
      const body = $$('reAccountsBody');
      if (!r.ok) { body.innerHTML = '<div class="ra-empty">Ошибка: ' + esc(r.data?.reason || r.status) + '</div>'; return; }
      const items = (r.data?.accounts) || [];
      if (!items.length) {
        body.innerHTML = '<div class="ra-empty">Подключи свой первый Telegram-аккаунт — мы прогреем его и подключим к рекламным кампаниям.<br>Доход 50% с каждого сообщения + MLM 10 уровней.</div>';
        return;
      }
      body.innerHTML = '<div class="ra-list">' + items.map(a => {
        const stageNum = (a.stage || 'S1')[1] || '1';
        const label = a.label || a.phone_masked || (a.username ? '@' + a.username : 'acc#' + a.id);
        const flag = a.country_code ? countryFlag(a.country_code) + ' ' : '';
        const labelAttr = String(label).replace(/"/g, '&quot;');
        // Status chip — derived from `state`. Green for active, amber for pending, red for failed/deactivated.
        const stateClr = { active: '#10b981', pending_signin: '#f59e0b', inactive: '#6b7280', deactivated: '#ef4444' }[a.state] || '#6b7280';
        const stateBg = { active: 'rgba(16,185,129,0.12)', pending_signin: 'rgba(245,158,11,0.12)', inactive: 'rgba(107,114,128,0.12)', deactivated: 'rgba(239,68,68,0.12)' }[a.state] || 'rgba(107,114,128,0.12)';
        const stateHuman = a.state_human || (a.is_active ? 'Подключен ✓' : 'Не подключён');
        const statusChip = `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${stateBg};color:${stateClr};margin-right:6px;border:1px solid ${stateClr}33">${esc(stateHuman)}</span>`;
        // Failure/last-stage explainer line.
        let explainer = '';
        if (!a.is_active && a.last_stage && a.last_stage.kind === 'error') {
          explainer = `<div style="font-size:11px;color:#ef4444;margin-top:4px">⚠ ${esc(a.last_stage.msg || '')}</div>`;
        } else if (a.deactivation_reason) {
          explainer = `<div style="font-size:11px;color:#ef4444;margin-top:4px">⚠ ${esc(a.deactivation_reason)}</div>`;
        } else if (!a.is_active && a.state === 'pending_signin') {
          explainer = `<div style="font-size:11px;color:#f59e0b;margin-top:4px">⏳ Код не введён / signIn не завершён. Нажми «Переподключить».</div>`;
        }
        // Proxy badge.
        const proxyBadge = a.proxy ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px">🌐 ${esc((a.proxy.geo || '').toUpperCase())} · v${a.proxy.version} · ${esc(a.proxy.host)}</div>` : '';
        // Reconnect button — visible when state is anything other than 'active'.
        // Earlier this only checked !is_active, but UI tumbler can flip isActive=true
        // while the underlying TG session is dead. State derived server-side now
        // respects deactivatedAt > isActive, so 'deactivated' is the truthful signal.
        const needsReconnect = a.state === 'deactivated' || a.state === 'pending_signin' || a.state === 'inactive' || !a.is_active;
        const reconnectBtn = !needsReconnect ? '' : `<button class="ra-btn warn" style="font-size:11px;padding:4px 10px;margin-right:6px" onclick="event.stopPropagation(); window._roboaiReconnect(${a.id}, '${labelAttr}')">🔄 Переподключить</button>`;
        // Live-probe button — always visible. Calls getMe() on the engine and syncs DB state.
        const probeBtn = `<button class="ra-btn-sec" style="font-size:11px;padding:4px 10px;margin-right:6px" onclick="event.stopPropagation(); window._roboaiProbeAccount(${a.id}, this)" title="Проверить сессию через TG (getMe)">🔍 Проверить статус</button>`;
        const activityBtn = `<button class="ra-btn-sec" style="font-size:11px;padding:4px 10px;margin-right:6px" onclick="event.stopPropagation(); window._roboaiToggleActivity(${a.id})">📊 Лог работы</button>`;
        return `<div class="ra-item" id="raoItem-${a.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div>
              <span class="ra-pill s${stageNum}">${esc(a.stage || 'S1')}</span>
              ${statusChip}
              <strong>${flag}${esc(label)}</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px">day ${a.day_in_stage || 0}${a.language_code ? ' · ' + esc(a.language_code) : ''}</span>
              ${proxyBadge}
              ${explainer}
            </div>
            <div>
              ${reconnectBtn}
              ${probeBtn}
              ${a.is_active ? activityBtn : ''}
              ${a.spam_bot_state ? window.spamBotStatusChip(a.spam_bot_state, a.spam_bot_frozen_until) : ""}
              ${a.is_active ? `<button class="ra-btn-sec" style="font-size:11px;padding:4px 8px" onclick="event.stopPropagation(); window.spamBotCheckAccount(${a.id}, this)" title="Перепроверить @SpamBot">🔄</button>` : ''}
              ${a.is_active ? `<span style="font-size:12px;color:var(--text-muted);margin-right:8px">сегодня: ${a.today_actions || 0}</span>` : ''}
              <button class="ra-btn-sec" style="font-size:11px;padding:4px 10px" onclick="event.stopPropagation(); window._roboaiDeleteAccount(${a.id}, '${labelAttr}')">🗑 Удалить</button>
            </div>
          </div>
          <div id="raoActivity-${a.id}" style="display:none;margin-top:10px;padding:10px;background:rgba(0,0,0,0.25);border-radius:6px;border:1px solid rgba(255,255,255,0.06)"></div>
        </div>`;
      }).join('') + '</div>';
    });
  }

  /** ISO-2 country code → flag emoji. */
  function countryFlag(c) {
    if (!c || typeof c !== 'string') return '';
    const cc = c.toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '';
    return String.fromCodePoint(...[...cc].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
  }

  // ─── Live probe of a single account via GramJS getMe() — syncs DB + UI ───
  // Replaces the DB-flag-based badge with the TRUTHFUL state.
  window._roboaiProbeAccount = async function (id, btn) {
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Проверяю…'; }
    try {
      const r = await fetch('/cabinet/api/roboai/accounts/' + id + '/probe', { method: 'POST' }).then(x => x.json());
      if (!r.ok) {
        alert('Не удалось проверить: ' + (r.reason || 'unknown'));
        return;
      }
      // Inline banner above the card so user immediately sees the result.
      const item = document.getElementById('raoItem-' + id);
      if (item) {
        const old = item.querySelector('.rao-probe-banner');
        if (old) old.remove();
        const banner = document.createElement('div');
        banner.className = 'rao-probe-banner';
        const bg = r.alive ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)';
        const clr = r.alive ? '#10b981' : '#ef4444';
        const icon = r.alive ? '✅' : '⚠️';
        banner.style.cssText = `margin-top:8px;padding:8px 12px;border-radius:6px;background:${bg};color:${clr};font-size:12px;border:1px solid ${clr}33`;
        banner.innerHTML = `${icon} ${(r.message || '').replace(/</g, '&lt;')}` + (r.username ? ` · <strong>@${esc(r.username)}</strong>` : '');
        item.appendChild(banner);
        setTimeout(() => { try { banner.remove(); } catch (_) {} }, 15_000);
      }
      // Don't re-render (avoids the jarring page-reload). The inline banner
      // is the immediate feedback; on next manual navigation the list re-fetches
      // and will pick up the synced state naturally.
    } catch (e) {
      alert('Сеть/ошибка: ' + (e && e.message ? e.message : e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  };

  // ─── Reconnect inactive account — re-sends OTP without deleting DB row ───
  window._roboaiReconnect = async function (id, label) {
    showModal(`
      <h3 style="margin:0 0 8px">🔄 Переподключить ${esc(label)}?</h3>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
        Сейчас отправим новый OTP-код на этот номер через тот же прокси, что был куплен ранее.<br>
        Когда придёт код в Telegram — введи его ниже.
      </div>
      <div id="raoRcStatus" style="margin-bottom:10px;color:var(--accent)">⏳ Отправляю код…</div>
      <div id="raoRcCodeBlock" style="display:none">
        <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Код из Telegram</label>
        <input id="raoRcCode" class="ra-input" placeholder="12345" style="margin-bottom:10px" />
        <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">2FA пароль (если есть)</label>
        <input id="raoRcPwd" class="ra-input" type="password" placeholder="—" style="margin-bottom:12px" />
        <div class="ra-row">
          <button class="ra-btn warn" onclick="window._roboaiReconnectConfirm(${id})">Подтвердить</button>
          <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
        </div>
      </div>
      <div class="ra-row" id="raoRcCancelOnly">
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
    `);
    try {
      const r = await fetch('/cabinet/api/roboai/accounts/connect-otp/reconnect/' + id, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).then(x => x.json());
      const st = document.getElementById('raoRcStatus');
      if (!r.ok) {
        if (st) st.innerHTML = '<span style="color:#ef4444">❌ ' + esc(r.message || r.detail || r.reason || 'unknown') + '</span>';
        return;
      }
      if (st) st.innerHTML = '✅ Код отправлен. Открой Telegram → чат «Telegram» → возьми код.';
      const blk = document.getElementById('raoRcCodeBlock');
      const co = document.getElementById('raoRcCancelOnly');
      if (blk) blk.style.display = '';
      if (co) co.style.display = 'none';
    } catch (e) {
      const st = document.getElementById('raoRcStatus');
      if (st) st.innerHTML = '<span style="color:#ef4444">❌ Сеть/ошибка: ' + esc(e.message || e) + '</span>';
    }
  };

  window._roboaiReconnectConfirm = async function (id) {
    const code = (document.getElementById('raoRcCode') || {}).value || '';
    const password = (document.getElementById('raoRcPwd') || {}).value || '';
    if (!code) return;
    const st = document.getElementById('raoRcStatus');
    if (st) st.innerHTML = '⏳ Завершаю подключение…';
    try {
      const r = await fetch('/cabinet/api/roboai/accounts/connect-otp/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: id, code: code.trim(), password_2fa: password || undefined }),
      }).then(x => x.json());
      if (r.ok) {
        if (st) st.innerHTML = '✅ Аккаунт подключён — @' + esc(r.username || '') + '. Закрой окно.';
        setTimeout(() => { window._roboaiCloseModal(); if (window.loadRoboaiEarnPage) window.loadRoboaiEarnPage(); }, 1500);
      } else {
        const human = ({
          '2fa_password_required': '🔐 У этого аккаунта включена облачная защита 2FA. Введи свой пароль в поле «2FA пароль» ниже и нажми Подтвердить ещё раз.',
          '2fa_password_invalid': '🔐 Пароль 2FA неверный. Проверь и попробуй ещё раз.',
          'phone_code_invalid': '❌ Неверный код. Возьми последний код из чата "Telegram".',
          'phone_code_expired': '⏳ Код устарел. Нажми «Переподключить» в карточке акка ещё раз — придёт новый.',
          'flood_wait': '⏳ Telegram попросил подождать (flood). Подожди 1-5 минут и попробуй снова.',
          'session_expired_restart_otp': '⏳ Сессия истекла. Нажми «Переподключить» — придёт новый код.',
        })[r.reason] || ('❌ ' + (r.message || r.detail || r.reason || 'unknown'));
        if (st) st.innerHTML = '<span style="color:' + (r.reason === '2fa_password_required' ? '#f59e0b' : '#ef4444') + '">' + esc(human) + '</span>';
        // Если требуется 2FA — подсветим поле и фокус.
        if (r.reason === '2fa_password_required') {
          const pwd = document.getElementById('raoRcPwd');
          if (pwd) { pwd.style.border = '2px solid #f59e0b'; pwd.focus(); }
        }
      }
    } catch (e) {
      if (st) st.innerHTML = '<span style="color:#ef4444">❌ Сеть/ошибка: ' + esc(e.message || e) + '</span>';
    }
  };

  // ─── Delete account flow with two-step confirm + 24h throttle awareness ───
  window._roboaiDeleteAccount = function (id, label) {
    showModal(`
      <h3 style="margin:0 0 8px;color:#ef4444">⚠️ Удалить аккаунт ${esc(label)}?</h3>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
        Аккаунт будет отключён от всех текущих кампаний и перенесён в архив. Telegram-сессия сохранится в зашифрованном виде — её можно восстановить позже через поддержку.<br><br>
        <b style="color:#fbbf24">Лимит:</b> 10 удалений за окно — потом блокировка на 24 часа.
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Причина (необязательно)</label>
      <textarea id="raoDelReason" rows="2" class="ra-textarea" placeholder="Например: продал номер, забыл пароль, ..." style="margin-bottom:12px"></textarea>
      <div class="ra-row">
        <button class="ra-btn danger" onclick="window._roboaiConfirmDelete(${id})">Да, удалить</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
      <div id="raoDelStatus" style="margin-top:10px"></div>
    `);
  };

  window._roboaiConfirmDelete = async function (id) {
    const reason = ($$('raoDelReason') && $$('raoDelReason').value || '').trim();
    const status = $$('raoDelStatus');
    if (status) status.innerHTML = '<div style="color:var(--accent)">⏳ Удаление…</div>';
    const r = await callRoboai('POST', '/accounts/' + id + '/delete', { confirm: true, reason });
    if (!r.ok) {
      const reasonText = r.data?.reason === 'delete_throttled'
        ? '⛔ Превышен лимит удалений — блокировка до ' + (r.data.stop_until || 'позднее') + '. Попробуй через 24 часа.'
        : '❌ Ошибка: ' + esc(r.data?.reason || r.status) + (r.data?.detail ? '\n' + esc(r.data.detail) : '');
      if (status) status.innerHTML = '<div style="color:#ef4444">' + reasonText + '</div>';
      return;
    }
    const d = r.data;
    let html = `<div style="color:#10b981">✅ Аккаунт удалён</div>`;
    html += `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Удалений в окне: ${d.total_deleted_in_window} · всего: ${d.lifetime_deleted}</div>`;
    if (d.throttled) html += `<div style="color:#fbbf24;margin-top:6px">⚠️ Лимит достигнут — следующее удаление через 24 часа.</div>`;
    if (status) status.innerHTML = html;
    setTimeout(() => {
      window._roboaiCloseModal();
      window.loadRoboaiEarnPage();
    }, 1200);
  };

  window._roboaiAddAccount = function (mode) {
    if (mode === 'otp') return openOtpWizard();
    if (mode === 'bulk') return openBulkWizard();
  };

  function openOtpWizard() {
    showModal(`
      <h3 style="margin:0 0 6px">📱 Подключить Telegram-аккаунт</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        Шаг <b>1 из 3</b> — введи номер телефона аккаунта.
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Номер телефона (E.164)</label>
      <input id="raoOtpPhone" type="tel" placeholder="+79991234567" autocomplete="tel"
             class="ra-input" style="margin-bottom:8px;font-size:16px">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px">
        Используется только для входа через нашу прокси и шифрованного хранения сессии. Не передаётся третьим лицам.
      </div>
      <!-- [otp-2fa-step1-2026-05-21] optional 2FA upfront -->
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Облачный пароль 2FA <span style="color:#6b7280">(если включён — укажи, иначе оставь пустым)</span></label>
      <input id="raoOtpPhase1_2fa" type="password" placeholder="—" autocomplete="off"
             class="ra-input" style="margin-bottom:6px">
      <div style="font-size:11px;color:#fbbf24;margin-bottom:12px;line-height:1.4">💡 Cloud password (Telegram → Privacy → Two-Step Verification). Заполнишь сейчас — не спросим повторно после кода.</div>
      <div class="ra-row">
        <button class="ra-btn warn" id="raoOtpSendBtn" onclick="window._roboaiOtpSend()">📨 Отправить код</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
      <div id="raoOtpStatus" style="margin-top:12px"></div>
    `);
    setTimeout(function(){ var i=$$('raoOtpPhone'); if (i) i.focus(); }, 50);
  }

  // ─── Step 1 → POST connect-otp/start ───
  window._roboaiOtpSend = async function () {
    const phoneRaw = ($('raoOtpPhone') && $('raoOtpPhone').value || '').trim().replace(/\s+/g, '');
    // [otp-2fa-step1-2026-05-21] remember the optional 2FA entered on step 1 to prefill step 2
    window._raoPrefill2fa = ($('raoOtpPhase1_2fa') && $('raoOtpPhase1_2fa').value || '').trim();
    const status = $$('raoOtpStatus');
    if (!phoneRaw) {
      status.innerHTML = '<div style="color:#ef4444">⚠️ Введи номер</div>';
      return;
    }
    if (!/^\+\d{8,15}$/.test(phoneRaw)) {
      status.innerHTML = '<div style="color:#ef4444">⚠️ Формат: +79991234567 (без пробелов и скобок)</div>';
      return;
    }
    const btn = $$('raoOtpSendBtn');
    if (btn) btn.disabled = true;
    status.innerHTML = '<div id="raoOtpLive" style="color:var(--accent)">⏳ Начинаю процесс…</div><div id="raoOtpLiveSub" style="font-size:11px;color:var(--text-muted);margin-top:4px">Поллинг каждые 2с</div>';
    let pollT = setInterval(async () => {
      try {
        const accId = window._raoLastOtpAccountId;
        if (!accId) return;
        const sr = await callRoboai('GET', '/accounts/connect-otp/status/' + accId);
        const live = document.getElementById('raoOtpLive');
        if (sr?.data?.ok && live) {
          const stages = {idle:{i:'⏳',c:'var(--accent)'},proxy:{i:'🌐',c:'#22c55e'},direct:{i:'🔗',c:'#22c55e'},connecting:{i:'🔄',c:'var(--accent)'},requesting_code:{i:'📨',c:'var(--accent)'},code_sent:{i:'✅',c:'#22c55e'},error:{i:'❌',c:'#ef4444'}};
          const st = sr.data.stage || 'idle';
          const m = sr.data.message || st;
          const meta = stages[st] || stages.idle;
          live.innerHTML = meta.i + ' ' + m;
          live.style.color = meta.c;
          const sub = document.getElementById('raoOtpLiveSub');
          if (sub) sub.textContent = 'Этап: ' + st;
          if (st === 'code_sent' || st === 'error') clearInterval(pollT);
        }
      } catch(e) {}
    }, 2000);
    const r = await callRoboai('POST', '/accounts/connect-otp/start', { phone: phoneRaw });
    if (btn) btn.disabled = false;
    if (!r.ok) {
      const reasonText = otpReasonMessage(r.data?.reason || r.status);
      if (pollT) clearInterval(pollT);
      status.innerHTML = '<div style="color:#ef4444">❌ ' + esc(reasonText) + '</div>' +
        (r.data?.detail ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + esc(r.data.detail) + '</div>' : '');
      return;
    }
    if (r.data?.account_id) {
      renderOtpStep2(r.data.account_id, phoneRaw);
    }
  };

  // ─── Step 2 form ───
  function renderOtpStep2(accountId, phoneRaw) {
    const masked = phoneRaw.slice(0, 3) + '***' + phoneRaw.slice(-2);
    const modal = document.querySelector('.ra-modal');
    if (!modal) return;
    modal.innerHTML = `
      <h3 style="margin:0 0 6px">📱 Подключить Telegram-аккаунт</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">
        Шаг <b>2 из 3</b> — введи 5-значный код, который пришёл в Telegram на номер <b>${esc(masked)}</b>.
      </div>
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Код подтверждения</label>
      <input id="raoOtpCode" type="text" inputmode="numeric" autocomplete="one-time-code"
             pattern="[0-9]*" maxlength="6" placeholder="12345"
             class="ra-input" style="margin-bottom:14px;font-size:18px;letter-spacing:4px;text-align:center">
      <label style="display:block;font-size:12px;color:var(--text-muted);margin-bottom:4px">Облачный пароль 2FA <span style="color:#6b7280">(заполни только если включён)</span></label>
      <input id="raoOtp2fa" type="password" placeholder="—" class="ra-input" style="margin-bottom:6px">
      <div style="font-size:11px;color:#fbbf24;margin-bottom:14px;line-height:1.4">💡 Если у тебя стоит cloud password (Telegram → Settings → Privacy → Two-Step Verification) — заполни сразу, чтобы не вводить два раза. Если 2FA выключен — оставь пустым.</div>
      <div class="ra-row">
        <button class="ra-btn" id="raoOtpConfirmBtn" onclick="window._roboaiOtpConfirm(${accountId})">✅ Подтвердить</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
      <div id="raoOtpStatus2" style="margin-top:12px"></div>
    `;
    // [otp-2fa-step1-2026-05-21] prefill 2FA from step 1 if provided
    setTimeout(function(){
      var pre = window._raoPrefill2fa;
      if (pre) { var f = $('raoOtp2fa'); if (f) f.value = pre; }
      var i = $('raoOtpCode'); if (i) i.focus();
    }, 50);
  }

  // ─── Step 2 → POST connect-otp/confirm ───
  window._roboaiOtpConfirm = async function (accountId) {
    const code = ($$('raoOtpCode') && $$('raoOtpCode').value || '').trim();
    const pw2fa = ($$('raoOtp2fa') && $$('raoOtp2fa').value || '').trim();
    const status = $$('raoOtpStatus2');
    if (!/^\d{4,7}$/.test(code)) {
      status.innerHTML = '<div style="color:#ef4444">⚠️ Код — только цифры (5 знаков обычно)</div>';
      return;
    }
    const btn = $$('raoOtpConfirmBtn');
    if (btn) btn.disabled = true;
    status.innerHTML = '<div id="raoOtpLive2" style="color:var(--accent)">⏳ Отправляю код...</div><div id="raoOtpLive2Sub" style="font-size:11px;color:var(--text-muted);margin-top:4px">Этап: starting</div>';
    const pollC = setInterval(async () => {
      try {
        const sr = await callRoboai('GET', '/accounts/connect-otp/status/' + accountId);
        const live = document.getElementById('raoOtpLive2');
        if (sr?.data?.ok && live) {
          const stages = {idle:{i:'⏳',c:'var(--accent)'},proxy:{i:'🌐',c:'#22c55e'},direct:{i:'🔗',c:'#22c55e'},connecting:{i:'🔄',c:'var(--accent)'},signing_in:{i:'🔐',c:'var(--accent)'},error:{i:'❌',c:'#ef4444'}};
          const st = sr.data.stage || 'idle';
          const m = sr.data.message || st;
          const meta = stages[st] || stages.idle;
          live.innerHTML = meta.i + ' ' + m;
          live.style.color = meta.c;
          const sub = document.getElementById('raoOtpLive2Sub');
          if (sub) sub.textContent = 'Этап: ' + st;
        }
      } catch(e) {}
    }, 2000);
    const body = { account_id: accountId, code };
    if (pw2fa) body.password_2fa = pw2fa;
    const r = await callRoboai('POST', '/accounts/connect-otp/confirm', body);
    clearInterval(pollC);
    if (btn) btn.disabled = false;
    if (!r.ok) {
      const reasonText = otpReasonMessage(r.data?.reason || r.status);
      status.innerHTML = '<div style="color:#ef4444">❌ ' + esc(reasonText) + '</div>' +
        (r.data?.reason === '2fa_password_required'
          ? '<div style="font-size:12px;color:#fbbf24;margin-top:6px">У тебя включён 2FA. Раскрой блок выше и введи cloud password, потом нажми «Подтвердить» снова.</div>'
          : (r.data?.detail ? '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">' + esc(r.data.detail) + '</div>' : ''));
      return;
    }
    renderOtpSuccess(r.data);
    // Reload list immediately so the new account appears without manual refresh.
    setTimeout(function () { window.loadRoboaiEarnPage(); }, 100);
  };

  // ─── Step 3 success ───
  function renderOtpSuccess(d) {
    const modal = document.querySelector('.ra-modal');
    if (!modal) return;
    const flag = d.country_code ? countryFlag(d.country_code) + ' ' : '';
    const lang = d.language_code ? ' · <code>' + esc(d.language_code) + '</code>' : '';
    const userName = d.username ? ' (@' + esc(d.username) + ')' : '';
    modal.innerHTML = `
      <h3 style="margin:0 0 6px;color:#10b981">✅ Аккаунт подключён</h3>
      <div style="font-size:13px;margin-bottom:14px">
        ${flag}<b>${esc(d.phone_masked || 'аккаунт #' + d.account_id)}</b>${userName}${lang}
      </div>
      <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px">
        Аккаунт переведён в стадию <b>S1</b> (прогрев). На 1-2 день — подписки/реакции/просмотры.
        С 3-го дня — первые DM по нарастающей. Через 14 дней — стадия S3 (боевые рассылки).<br><br>
        Сессия зашифрована (AES-256-GCM), прокси sticky-resident NodeMaven.
      </div>
      <div style="background:rgba(0,212,255,0.08);border:1px solid var(--accent,#00d4ff);border-radius:8px;padding:12px;margin-bottom:12px;font-size:12px">
        🔔 <b>Чтобы получать уведомления</b> (стадии прогрева, заработок, лимиты) — открой
        <a href="https://t.me/GoldenConnectTGbot" target="_blank" style="color:var(--accent);font-weight:bold">@GoldenConnectTGbot</a>
        и нажми <b>/start</b>. Это нужно сделать ОДИН раз.
      </div>
      <div class="ra-row">
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Закрыть</button>
      </div>
    `;
  }

  function otpReasonMessage(reason) {
    const map = {
      phone_required: 'Введи номер.',
      phone_format_invalid: 'Формат номера неверный — нужен +79991234567.',
      phone_number_invalid: 'Telegram говорит: такого номера не существует.',
      phone_number_banned: 'Этот номер заблокирован Telegram.',
      phone_number_flood: 'Telegram временно блокирует все попытки SMS на этот номер.',
      phone_code_invalid: 'Код неверный. Попробуй ещё раз.',
      phone_code_expired: 'Код устарел — запроси новый.',
      '2fa_password_required': 'Этот аккаунт защищён двухфакторной паролем.',
      '2fa_password_invalid': 'Cloud password неверный.',
      flood_wait: 'Слишком много попыток — Telegram заблокировал номер на несколько часов. Подожди.',
      session_expired_restart_otp: 'Сессия отправки кода истекла (10 мин). Нажми «Подключить аккаунт» снова.',
      proxy_provider_not_configured: 'Прокси-провайдер не настроен — обратись в поддержку.',
      proxy_blocks_telegram: 'Текущий прокси-провайдер блокирует Telegram. Проблема не в твоём номере — поддержка уведомлена и подключает другой шлюз.',
      proxy_failure: 'Прокси-канал к Telegram упал — попробуй ещё раз.',
      account_already_connected: 'Этот номер уже подключён. Найди карточку в списке.',
      account_not_found: 'Что-то пошло не так — попробуй заново с шага 1.',
      tg_timeout: 'Telegram не ответил вовремя — попробуй ещё раз.',
      tg_error: 'Telegram отказал — попробуй ещё раз.',
      auth_user_cancel: 'Ты нажал «Отмена» в Telegram-уведомлении о входе. Когда придёт следующий push с подозрительным IP — нажми «Это я», не «Отмена». Повтори OTP-флоу.',
      api_id_published_flood: 'Слишком много попыток с этим app-id — подожди 10-30 мин или попробуй другой номер.',
    };
    return map[reason] || ('Не получилось: ' + reason);
  }

  // ─── Bulk-import wizard (proper modal instead of prompt) ───
  function openBulkWizard() {
    showModal(`
      <h3 style="margin:0 0 6px">📋 Массовый импорт списка</h3>
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">
        Вставь список TG-аккаунтов в любом формате. Groq AI сам распарсит phone, api_id, api_hash, session_string, tdata.
      </div>
      <textarea id="raoBulkText" rows="10" class="ra-textarea" placeholder="+79991234567 password api_id api_hash session_string&#10;+79992345678 ..."></textarea>
      <div class="ra-row" style="margin-top:8px">
        <button class="ra-btn" onclick="window._roboaiBulkSubmit()">📥 Импортировать</button>
        <button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Отмена</button>
      </div>
      <div id="raoBulkStatus" style="margin-top:12px"></div>
    `);
  }
  window._roboaiBulkSubmit = async function () {
    const text = ($$('raoBulkText') && $$('raoBulkText').value || '').trim();
    const status = $$('raoBulkStatus');
    if (!text) { status.innerHTML = '<div style="color:#ef4444">⚠️ Пустой список</div>'; return; }
    status.innerHTML = '<div style="color:var(--accent)">⏳ Groq разбирает список + проверяет каждый аккаунт через прокси…</div>';
    const r = await callRoboai('POST', '/accounts/connect-bulk', { raw_text: text });
    if (!r.ok) {
      status.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.data?.reason || r.status) + '</div>';
      return;
    }
    const d = r.data;
    status.innerHTML =
      '<div style="color:#10b981">✅ Импорт #' + d.batch_id + '</div>' +
      '<div style="font-size:13px;margin-top:6px">Распознано: <b>' + (d.parsed_count || 0) + '</b>' +
      ' · Импортировано: <b>' + (d.imported_alive || 0) + '</b>' +
      ' · Мёртвые: ' + (d.imported_dead || 0) +
      ' · Ошибки парсинга: ' + (d.parse_errors || 0) + '</div>' +
      '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">' + esc(d.message || '') + '</div>';
    setTimeout(function () { window.loadRoboaiEarnPage(); }, 1500);
  };

  window._roboaiViewBatches = async function () {
    const r = await callRoboai('GET', '/accounts/bulk-batches');
    if (!r.ok) { alert('Ошибка'); return; }
    const items = r.data?.batches || [];
    let html = '<h3 style="margin:0 0 12px">Bulk-импорт batches</h3>';
    if (!items.length) html += '<div class="ra-empty">Импортов пока не было.</div>';
    else html += '<div class="ra-list">' + items.map(b => `
      <div class="ra-item">
        <span class="ra-pill ${b.status === 'DONE' ? 'running' : 'paused'}">#${b.id} ${esc(b.status)}</span>
        <span style="font-size:12px;margin-left:6px">parsed: ${b.parsedCount || 0} · ok: ${b.successCount || 0} · failed: ${b.failedCount || 0}</span>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(String(b.createdAt).slice(0,16))}</div>
        ${b.aiLog?.errors_sample?.length ? '<details style="margin-top:6px"><summary style="font-size:12px;cursor:pointer">errors sample</summary><pre style="font-size:11px;background:var(--bg);padding:6px;border-radius:4px;margin-top:4px">' + esc(JSON.stringify(b.aiLog.errors_sample, null, 2)) + '</pre></details>' : ''}
      </div>
    `).join('') + '</div>';
    html += '<div class="ra-row" style="margin-top:14px"><button class="ra-btn-sec" onclick="window._roboaiCloseModal()">Закрыть</button></div>';
    showModal(html);
  };

  window._roboaiWithdraw = function () {
    const amt = prompt('Сумма для вывода в USD (мин $20)');
    if (!amt) return;
    const addr = prompt('USDT TRC20 адрес');
    if (!addr) return;
    callRoboai('POST', '/payouts/withdraw', { amount_usd: parseFloat(amt), address: addr, network: 'TRC20' }).then(r => {
      alert(r.ok ? 'Заявка на вывод создана.' : 'Ошибка: ' + (r.data?.reason));
    });
  };

  window.loadRoboaiEarnPage = loadRoboaiEarnPage;

  // ────────────────────────────────────────────────────────────────────
  // ADMIN — Модерация AI-рассылок
  // ────────────────────────────────────────────────────────────────────
  async function loadRoboaiModerationPage() {
    const root = $$('roboaiModerationContent');
    if (!root) return;
    injectStyles();
    document.getElementById('page-title').textContent = '🛡 Модерация AI-рассылок';

    root.innerHTML = `
      <div class="ra-tabs">
        <button class="ra-tab active" data-tab="pending" onclick="window._roboaiModTab('pending')">⏳ На модерации</button>
        <button class="ra-tab" data-tab="all" onclick="window._roboaiModTab('all')">📋 Все кампании</button>
      </div>
      <div id="raoModBody"><div class="ra-empty">Загрузка…</div></div>
    `;
    window._roboaiModTab = function (tab) {
      document.querySelectorAll('.ra-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      const body = $$('raoModBody');
      const path = tab === 'pending' ? '/admin/moderation/pending' : '/admin/moderation/all';
      body.innerHTML = '<div class="ra-empty">Загрузка…</div>';
      callRoboai('GET', path).then(r => {
        if (!r.ok) {
          body.innerHTML = '<div class="ra-empty">Ошибка: ' + esc(r.data?.reason || r.status) + '</div>';
          return;
        }
        const items = (r.data?.campaigns) || [];
        if (!items.length) { body.innerHTML = '<div class="ra-empty">Нет кампаний.</div>'; return; }
        body.innerHTML = '<div class="ra-list">' + items.map(c => `
          <div class="ra-item ${c.status === 'PENDING_REVIEW' ? 'alert' : ''}">
            <span class="ra-pill ${c.status === 'PENDING_REVIEW' ? 'review' : c.status === 'RUNNING' ? 'running' : 'draft'}">${esc(c.status)}</span>
            <strong>#${c.id} ${esc(c.name)}</strong>
            <span style="font-size:12px;color:var(--text-muted);margin-left:6px">advertiser: ${c.advertiser_user_id} · ниша: ${esc(c.niche || '—')}</span>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px;word-break:break-all">URL: ${esc(c.target_url || '')}</div>
            ${c.review_reasons?.length ? '<ul style="font-size:12px;margin:6px 0 0 18px;color:#fbbf24">' + c.review_reasons.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : ''}
            <div class="ra-row">
              <button class="ra-btn-sec" onclick="window._roboaiCampaignView(${c.id})">👁 Детали</button>
              ${c.status === 'PENDING_REVIEW' ? `
                <button class="ra-btn" onclick="window._roboaiModAction(${c.id},'approve')">✅ Утвердить</button>
                <button class="ra-btn danger" onclick="window._roboaiModAction(${c.id},'reject')">❌ Отклонить</button>
              ` : ''}
            </div>
          </div>
        `).join('') + '</div>';
      });
    };

    window._roboaiModAction = async function (id, action) {
      const reason = action === 'reject' ? prompt('Причина отклонения:') : '';
      if (action === 'reject' && !reason) return;
      const r = await callRoboai('POST', '/admin/moderation/' + id + '/' + action,
        action === 'reject' ? { reason } : {});
      if (!r.ok) { alert('Ошибка: ' + (r.data?.reason || r.status)); return; }
      window._roboaiModTab('pending');
    };

    window._roboaiModTab('pending');
  }
  window.loadRoboaiModerationPage = loadRoboaiModerationPage;

// Singleton-modal helper: ensures only ONE .ra-modal-back exists on the page
// AND that its CSS is injected (so it works even on pages that didn't load roboai).
// Without this every click stacked another inline div below the marketplace.
function _raOpenModal(innerHtml) {
  // Inject styles if missing (user might have opened this modal from a page
  // that doesn't call injectStyles itself).
  if (!document.getElementById('ra-modal-css')) {
    const s = document.createElement('style');
    s.id = 'ra-modal-css';
    s.textContent = '.ra-modal-back{position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px}.ra-modal{background:var(--card,#161825);border:1px solid var(--border,#252837);border-radius:12px;padding:20px;width:min(640px,90vw);max-height:90vh;overflow:auto;color:var(--text,#e7e9ee)}';
    document.head.appendChild(s);
  }
  // Remove ANY existing backdrops (clean state, no stacking).
  document.querySelectorAll('.ra-modal-back').forEach(el => el.remove());
  const back = document.createElement('div');
  back.className = 'ra-modal-back';
  back.innerHTML = innerHtml;
  // Click on backdrop (outside .ra-modal) closes it.
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
}

// Close any open ra-modal on hash navigation so it doesn't bleed onto next page.
window.addEventListener('hashchange', () => {
  document.querySelectorAll('.ra-modal-back').forEach(el => el.remove());
});

// ─── [tdata-ui-fix-2026-05-18] TDATA.zip upload — proper endpoint + staged progress UI ────
window.roboaiUploadTdataZip = function() {
  _raOpenModal(`
    <div class="ra-modal">
      <h2>📦 Загрузить TDATA</h2>
      <p style="color:var(--text-muted);font-size:13px;margin:0 0 10px">
        Загрузи .zip с TDATA-папкой (Telegram Desktop session).<br>
        Прокси под аккаунт подберём автоматически.
      </p>

      <label for="raoTdataFile" id="raoTdataDrop" style="
        display:block;padding:24px;border:2px dashed var(--border);border-radius:12px;
        text-align:center;cursor:pointer;background:rgba(139,92,246,0.04);
        transition:all .15s ease;margin:14px 0
      ">
        <div style="font-size:36px;line-height:1">📦</div>
        <div style="margin-top:6px;font-weight:600">Кликни или перетащи .zip</div>
        <div id="raoTdataFileLabel" style="font-size:12px;color:var(--text-muted);margin-top:4px">
          до 50 MB · .zip с папкой tdata
        </div>
      </label>
      <input id="raoTdataFile" type="file" accept=".zip" style="display:none">

      <div style="margin:10px 0;font-size:12px;color:var(--text-muted)">
        Страна прокси:
        <select id="raoTdataCountry" style="margin-left:6px;padding:5px 8px;background:var(--card);border:1px solid var(--border);border-radius:6px;color:var(--text)">
          <option value="RU">🇷🇺 RU (для RU-акков)</option>
          <option value="UA">🇺🇦 UA</option>
          <option value="KZ">🇰🇿 KZ</option>
          <option value="US">🇺🇸 US</option>
        </select>
      </div>

      <div id="raoTdataProgress" style="display:none;margin:14px 0;padding:14px;background:var(--card);border-radius:10px;font-size:13px;line-height:1.8"></div>
      <div id="raoTdataStatus" style="margin-top:8px;min-height:18px"></div>

      <div class="ra-row" style="margin-top:14px;display:flex;gap:8px">
        <button class="ra-btn warn" id="raoTdataSubmit" onclick="window._roboaiSubmitTdata()">📤 Импортировать</button>
        <button class="ra-btn-sec" onclick="document.querySelector('.ra-modal-back')?.remove()">Отмена</button>
      </div>
    </div>
  `);

  // wire file label + drop visual
  setTimeout(() => {
    const inp = document.getElementById('raoTdataFile');
    const drop = document.getElementById('raoTdataDrop');
    const lbl = document.getElementById('raoTdataFileLabel');
    if (!inp || !drop) return;
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (f) {
        lbl.textContent = f.name + ' · ' + (f.size / 1024).toFixed(1) + ' KB';
        lbl.style.color = 'var(--accent)';
      }
    });
    ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.style.borderColor = 'var(--accent)';
      drop.style.background = 'rgba(139,92,246,0.12)';
    }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, (e) => {
      e.preventDefault(); drop.style.borderColor = 'var(--border)';
      drop.style.background = 'rgba(139,92,246,0.04)';
    }));
    drop.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        const dt = new DataTransfer();
        dt.items.add(f);
        inp.files = dt.files;
        inp.dispatchEvent(new Event('change'));
      }
    });
  }, 50);
};

// [tdata-ui-fix-2026-05-18] friendly error messages mapped from server reasons
window._roboaiTdataErrMap = {
  'not a zip archive': 'Это не .zip-архив. Проверь файл.',
  'not a zip archive (PK magic bytes missing)': 'Это не .zip-архив. Проверь файл.',
  'tdata folder not found in archive': 'В архиве нет папки tdata/. Проверь, что zip-нул именно её.',
  'tdata-to-session returned no session': 'TDATA повреждён или защищён passcode. Попробуй другой.',
  'session string too short': 'TDATA повреждён.',
  'unsupported file type: .zip': '(старая ошибка — должно быть исправлено)',
};

window._roboaiSubmitTdata = async function() {
  const fileInp = document.getElementById('raoTdataFile');
  const file = fileInp && fileInp.files && fileInp.files[0];
  const country = (document.getElementById('raoTdataCountry')?.value || 'RU');
  const status = document.getElementById('raoTdataStatus');
  const progress = document.getElementById('raoTdataProgress');
  const submitBtn = document.getElementById('raoTdataSubmit');
  if (!file) { status.innerHTML = '<span style="color:#ef4444">Файл не выбран</span>'; return; }
  if (file.size > 50 * 1024 * 1024) {
    status.innerHTML = '<span style="color:#ef4444">Файл больше 50 MB. Telegram TDATA обычно &lt;5 MB.</span>';
    return;
  }
  status.textContent = '';
  if (submitBtn) submitBtn.setAttribute('disabled','true');

  // staged progress (visual hints — actual backend steps not streamed yet)
  const stages = [
    { id: 'upload',     label: 'Загружаю архив на сервер…' },
    { id: 'extract',    label: 'Распаковываю tdata-папку…' },
    { id: 'decrypt',    label: 'Расшифровываю сессию TDESKTOP…' },
    { id: 'proxy',      label: 'Подбираю прокси под акк…' },
    { id: 'verify',     label: 'Проверяю через Telegram…' },
  ];
  progress.style.display = 'block';
  progress.innerHTML = stages.map(s =>
    '<div data-stage="' + s.id + '" style="display:flex;align-items:center;gap:8px">' +
    '  <span class="ra-spin" style="display:inline-block;width:14px;text-align:center;opacity:.5">○</span>' +
    '  <span style="color:var(--text-muted)">' + s.label + '</span>' +
    '</div>'
  ).join('');

  const markStage = (id, state) => {
    const row = progress.querySelector('[data-stage="' + id + '"]');
    if (!row) return;
    const icon = row.querySelector('.ra-spin');
    const text = row.querySelector('span:last-child');
    if (state === 'active') { icon.textContent = '⏳'; icon.style.opacity = '1'; text.style.color = 'var(--text)'; }
    if (state === 'done')   { icon.textContent = '✓'; icon.style.color = '#22c55e'; icon.style.opacity = '1'; text.style.color = 'var(--text)'; }
    if (state === 'fail')   { icon.textContent = '✗'; icon.style.color = '#ef4444'; icon.style.opacity = '1'; text.style.color = '#ef4444'; }
  };

  // we don't have real-time backend streaming; simulate stage transitions
  // based on time so the user sees something happening.
  markStage('upload', 'active');
  const stageTimers = [
    setTimeout(() => { markStage('upload', 'done'); markStage('extract', 'active'); }, 800),
    setTimeout(() => { markStage('extract', 'done'); markStage('decrypt', 'active'); }, 2200),
    setTimeout(() => { markStage('decrypt', 'done'); markStage('proxy', 'active'); }, 5000),
    setTimeout(() => { markStage('proxy', 'done'); markStage('verify', 'active'); }, 8000),
  ];

  const fd = new FormData();
  fd.append('file', file, file.name || 'tdata.zip');
  fd.append('country', country);
  fd.append('userId', String(window.currentUserId || 1));
  try {
    const r = await fetch('/cabinet/api/roboai/accounts/import/single-zip', {
      method: 'POST',
      body: fd
    }).then(x => x.json());
    stageTimers.forEach(t => clearTimeout(t));
    // mark all done/fail
    if (r && r.ok && r.imported > 0) {
      stages.forEach(st => markStage(st.id, 'done'));
      const acc = r.accounts && r.accounts[0];
      const phone = acc && acc.phone ? '+' + String(acc.phone).slice(-7).replace(/(\d{4})(\d{3})/, '****$2') : '';
      status.innerHTML = '<span style="color:#22c55e;font-weight:600">' +
        '✅ Аккаунт подключён: #' + (acc && acc.accountId) +
        (phone ? ' · ' + phone : '') +
        (acc && acc.proxyId ? ' · 🌐 proxy #' + acc.proxyId : ' · ⚠️ proxy не назначен') +
        '</span>';
      setTimeout(() => {
        document.querySelector('.ra-modal-back')?.remove();
        if (window.loadRoboaiEarnPage) window.loadRoboaiEarnPage();
      }, 2500);
    } else {
      // identify which stage failed by reason
      const rawReason = (r && r.failed && r.failed[0] && r.failed[0].reason) || 'unknown error';
      const friendly = window._roboaiTdataErrMap[rawReason] || rawReason;
      // mark active stage as fail
      const active = progress.querySelector('[data-stage] .ra-spin');
      stages.forEach(st => {
        const row = progress.querySelector('[data-stage="' + st.id + '"] .ra-spin');
        if (row && row.textContent === '⏳') markStage(st.id, 'fail');
      });
      status.innerHTML = '<span style="color:#ef4444">❌ ' + friendly + '</span>';
      if (submitBtn) submitBtn.removeAttribute('disabled');
    }
  } catch (e) {
    stageTimers.forEach(t => clearTimeout(t));
    status.innerHTML = '<span style="color:#ef4444">Ошибка сети: ' + (e.message || e) + '</span>';
    if (submitBtn) submitBtn.removeAttribute('disabled');
  }
};

window.roboaiUploadDocument = function() {
  _raOpenModal(`
    <div class="ra-modal">
      <h2>📄 Документ со ссылками</h2>
      <p style="color:var(--text-muted);font-size:13px">Загрузи .txt / .csv / .docx с download-ссылками на .zip-архивы TDATA. Я найду все URL через AI и импортирую каждый акк.</p>
      <input id="raoDocFile" type="file" accept=".txt,.csv,.docx,.list" style="margin:10px 0;display:block;width:100%">
      <div style="margin:10px 0;font-size:12px;color:var(--text-muted)">
        Страна прокси:
        <select id="raoDocCountry" style="margin-left:6px">
          <option value="RU">🇷🇺 RU</option>
          <option value="UA">🇺🇦 UA</option>
          <option value="KZ">🇰🇿 KZ</option>
          <option value="US">🇺🇸 US</option>
        </select>
      </div>
      <div class="ra-row" style="margin-top:10px">
        <button class="ra-btn-sec" id="raoDocPreviewBtn" onclick="window._roboaiDocPreview()">👁 Preview ссылок</button>
        <button class="ra-btn warn" id="raoDocSubmit" onclick="window._roboaiDocImport()">📤 Импортировать все</button>
        <button class="ra-btn-sec" onclick="document.querySelector('.ra-modal-back')?.remove()">Отмена</button>
      </div>
      <div id="raoDocStatus" style="margin-top:10px"></div>
    </div>`);
};

window._roboaiDocPreview = async function() {
  const f = document.getElementById('raoDocFile')?.files?.[0];
  const status = document.getElementById('raoDocStatus');
  if (!f) { status.innerHTML = '<span style="color:#ef4444">Файл не выбран</span>'; return; }
  status.innerHTML = '⏳ ищу ссылки через AI…';
  const fd = new FormData();
  fd.append('file', f, f.name);
  try {
    const r = await fetch('/cabinet/api/roboai/accounts/import/preview', {
      method: 'POST',
      body: fd
    }).then(x => x.json());
    status.innerHTML = '<div style="padding:10px;background:rgba(139,92,246,0.08);border-radius:8px"><strong>Найдено: ' + (r.refined_count || 0) + ' ссылок</strong><div style="font-size:11px;max-height:140px;overflow-y:auto;margin-top:8px;font-family:monospace">' + (r.urls || []).slice(0, 30).map(u => '<div>' + u + '</div>').join('') + '</div></div>';
  } catch (e) {
    status.innerHTML = '<span style="color:#ef4444">Ошибка: ' + e.message + '</span>';
  }
};

window._roboaiDocImport = async function() {
  const f = document.getElementById('raoDocFile')?.files?.[0];
  const country = (document.getElementById('raoDocCountry')?.value || 'RU');
  const status = document.getElementById('raoDocStatus');
  if (!f) { status.innerHTML = '<span style="color:#ef4444">Файл не выбран</span>'; return; }
  status.innerHTML = '⏳ скачиваю и импортирую (это может занять 5-30 мин)…';
  const fd = new FormData();
  fd.append('file', f, f.name);
  fd.append('country', country);
  fd.append('userId', String(window.currentUserId || 1));
  try {
    const r = await fetch('/cabinet/api/roboai/accounts/import/document', {
      method: 'POST',
      body: fd
    }).then(x => x.json());
    status.innerHTML = '<div style="padding:10px;background:rgba(34,197,94,0.08);border-radius:8px"><strong>✅ Импортировано: ' + (r.imported || 0) + '</strong> из ' + (r.urls?.length || 0) + (r.failed?.length ? '<br>❌ Ошибок: ' + r.failed.length : '') + '</div>';
    setTimeout(() => { document.querySelector('.ra-modal-back')?.remove(); if (window.loadRoboaiEarnPage) window.loadRoboaiEarnPage(); }, 3000);
  } catch (e) {
    status.innerHTML = '<span style="color:#ef4444">Ошибка: ' + e.message + '</span>';
  }
};


  // ─── Working notifications panel (top of /roboai-earn) ───
  window._roboaiLoadNotifications = async function () {
    const slot = document.getElementById('reNotifications');
    if (!slot) return;
    try {
      const r = await fetch('/cabinet/api/roboai/accounts/notifications').then(x => x.json());
      const items = (r && r.ok && r.notifications) || [];
      if (!items.length) { slot.innerHTML = ''; return; }
      // Sort: critical first, then warn, then info.
      const sevRank = { critical: 0, warn: 1, info: 2 };
      items.sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9));
      const worst = items[0]?.severity || 'info';
      const headerColor = { critical: '#ef4444', warn: '#f59e0b', info: '#3b82f6' }[worst] || '#6b7280';
      const headerBg = { critical: 'rgba(239,68,68,0.10)', warn: 'rgba(245,158,11,0.10)', info: 'rgba(59,130,246,0.10)' }[worst] || 'rgba(107,114,128,0.10)';
      const cards = items.map(n => {
        const color = { critical: '#ef4444', warn: '#f59e0b', info: '#3b82f6' }[n.severity] || '#6b7280';
        const bg = { critical: 'rgba(239,68,68,0.06)', warn: 'rgba(245,158,11,0.06)', info: 'rgba(59,130,246,0.06)' }[n.severity] || 'rgba(255,255,255,0.03)';
        const created = n.created_at ? new Date(n.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        let deadline = '';
        if (n.archive_at) {
          const ms = new Date(n.archive_at).getTime() - Date.now();
          if (ms > 0) {
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            deadline = `<div style="font-size:11px;color:#f59e0b;margin-top:4px">⏰ До автоархива: ${d}д ${h}ч</div>`;
          } else {
            deadline = `<div style="font-size:11px;color:#ef4444;margin-top:4px">⏰ Дедлайн прошёл — акк может быть архивирован на ближайшем тике</div>`;
          }
        }
        const phone = n.phone_masked || ('acc#' + n.account_id);
        const labelAttr = String(phone).replace(/"/g, '&quot;');
        const reconnectBtn = (n.type === 'disconnect' && n.account_id)
          ? `<button class="ra-btn warn" style="font-size:12px;padding:6px 12px;margin-right:6px" onclick="window._roboaiReconnect(${n.account_id}, '${labelAttr}')">🔄 Переподключить</button>`
          : '';
        const dismissBtn = `<button class="ra-btn-sec" style="font-size:11px;padding:5px 10px" onclick="window._roboaiDismissNotification(${n.id}, this)">Понятно</button>`;
        return `<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:12px;background:${bg};border:1px solid ${color}33;border-left:3px solid ${color};border-radius:8px;margin-bottom:8px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <strong style="color:${color}">${n.severity === 'critical' ? '🚨' : n.severity === 'warn' ? '⚠️' : 'ℹ️'} ${esc(phone)}</strong>
              <span style="font-size:11px;color:var(--text-muted)">${esc(created)}</span>
            </div>
            <div style="font-size:13px;color:var(--text)">${esc(n.message || '')}</div>
            ${deadline}
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            ${reconnectBtn}
            ${dismissBtn}
          </div>
        </div>`;
      }).join('');
      slot.innerHTML = `
        <div style="background:${headerBg};border:1px solid ${headerColor}33;border-radius:10px;padding:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <div style="font-weight:600;font-size:14px;color:${headerColor}">🔔 Рабочие уведомления (${items.length})</div>
          </div>
          ${cards}
        </div>`;
    } catch (e) {
      slot.innerHTML = '';
    }
  };
  window._roboaiDismissNotification = async function (id, btn) {
    try {
      if (btn) btn.disabled = true;
      await fetch('/cabinet/api/roboai/accounts/notifications/' + id + '/dismiss', { method: 'POST' });
      if (window._roboaiLoadNotifications) window._roboaiLoadNotifications();
    } catch (e) {}
  };

  // Auto-refresh notifications every 60s while on roboai-earn.
  if (!window._roboaiNotifPollInterval) {
    window._roboaiNotifPollInterval = setInterval(() => {
      if (location.hash.includes('roboai-earn') && document.getElementById('reNotifications')) {
        window._roboaiLoadNotifications && window._roboaiLoadNotifications();
      }
    }, 60_000);
  }

  // ─── Activity panel: warmup day + plan + action log ───
  window._roboaiToggleActivity = async function (id) {
    const slot = document.getElementById('raoActivity-' + id);
    if (!slot) return;
    if (slot.style.display !== 'none') { slot.style.display = 'none'; slot.innerHTML = ''; return; }
    slot.style.display = '';
    slot.innerHTML = '<div style="color:var(--text-muted);font-size:12px">⏳ Загружаю историю работы…</div>';
    try {
      const r = await fetch('/cabinet/api/roboai/accounts/' + id + '/activity').then(x => x.json());
      if (!r.ok) {
        slot.innerHTML = '<div style="color:#ef4444">❌ ' + esc(r.reason || 'unknown') + '</div>';
        return;
      }
      const phase = r.phase || ('Day ' + r.day);
      const plan = r.day_plan || {};
      const done = r.done_today || {};
      const labelMap = { channel_view: 'Чтение каналов', internal_message: 'Внутренние сообщения', self_check: 'Самопроверка', first_dm: 'Первые DM', search: 'Поиск', read_group: 'Чтение групп', reaction: 'Реакции', comment: 'Комментарии', profile_update: 'Обновление профиля' };
      const planRows = [];
      const planFields = [
        ['searches', 'search', 'Поиск'],
        ['groupsToJoin', null, 'Вступить в группы'],
        ['groupsToRead', 'read_group', 'Прочитать групп'],
        ['reactions', 'reaction', 'Реакции'],
        ['comments', 'comment', 'Комментарии'],
        ['firstDms', 'first_dm', 'Первые DM'],
      ];
      for (const [planKey, doneKey, label] of planFields) {
        const target = plan[planKey] || 0;
        if (!target && !done[doneKey]) continue;
        const did = doneKey ? (done[doneKey] || 0) : 0;
        const pct = target > 0 ? Math.min(100, Math.round((did / target) * 100)) : 0;
        const color = pct >= 100 ? '#10b981' : (pct >= 50 ? '#f59e0b' : '#6b7280');
        planRows.push(`
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="min-width:160px;font-size:12px">${esc(label)}</span>
            <div style="flex:1;height:6px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden">
              <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s"></div>
            </div>
            <span style="min-width:50px;text-align:right;font-size:12px;color:${color}">${did}/${target}</span>
          </div>`);
      }
      const restNote = plan.rest ? '<div style="color:#f59e0b;font-size:12px;margin-bottom:8px">😴 День отдыха — TG-аккаунт остывает после регистрации, никаких действий.</div>' : '';
      const logsHtml = (r.logs || []).map(l => {
        const at = new Date(l.executed_at);
        const time = at.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const typeLabel = labelMap[l.action_type] || l.action_type;
        const statusIcon = l.status === 'ok' ? '✓' : (l.status === 'error' ? '✗' : '~');
        const statusColor = l.status === 'ok' ? '#10b981' : (l.status === 'error' ? '#ef4444' : '#f59e0b');
        return `<div style="font-size:11px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;gap:8px">
          <span style="color:var(--text-muted);min-width:90px">${esc(time)}</span>
          <span style="color:${statusColor};min-width:14px">${statusIcon}</span>
          <span style="min-width:130px">${esc(typeLabel)}</span>
          <span style="color:var(--text-muted);flex:1">${esc(l.target || l.details || '')}</span>
        </div>`;
      }).join('');
      const logsBlock = (r.logs || []).length
        ? `<div style="margin-top:10px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">📜 Последние действия (всего ${r.logs.length})</div>${logsHtml}</div>`
        : '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Действий пока нет — warmup-планировщик подхватит акк на следующем тике (каждые 15 мин).</div>';
      slot.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <div>
            <span style="font-weight:600;font-size:14px">📈 ${esc(phase)}</span>
            <span style="color:var(--text-muted);font-size:12px;margin-left:6px">(День ${r.day} от регистрации)</span>
          </div>
          <div style="font-size:12px;color:var(--text-muted)">Сегодня выполнено: <b style="color:var(--accent)">${r.total_today || 0}</b></div>
        </div>
        ${restNote}
        ${planRows.length ? '<div style="margin-bottom:8px">' + planRows.join('') + '</div>' : ''}
        ${logsBlock}
      `;
    } catch (e) {
      slot.innerHTML = '<div style="color:#ef4444">❌ Сеть: ' + esc(e.message || e) + '</div>';
    }
  };

})();
