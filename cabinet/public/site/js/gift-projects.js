/* GIFT CLUB — Каталог проектов (3 категории: 🔵 Сервисы / 🟢 МЛМ / 🔴 Стартапы).
   Реф-механика переиспользует существующие /cabinet/api/partners/:id/* (submit-link, stats).
   Каталог группами: /cabinet/api/partners-catalog. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);

  function api(method, path, body) {
    return fetch('/cabinet' + path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  const CAT_STYLE = {
    blue:  { cls: 'gp-cat-blue',  dot: '🔵' },
    green: { cls: 'gp-cat-green', dot: '🟢' },
    red:   { cls: 'gp-cat-red',   dot: '🔴' },
  };

  window.loadGiftProjectsPage = async function () {
    const root = $('giftProjectsContent');
    if (!root) return;
    root.innerHTML = '<div class="gift-loading">Загрузка каталога…</div>';
    const d = await api('GET', '/api/partners-catalog');
    if (!d || !d.ok) { root.innerHTML = '<div class="gift-empty"><h3>Ошибка</h3><p>' + esc(d && d.reason || 'нет ответа') + '</p></div>'; return; }

    const cats = d.categories || [];
    const hasAny = cats.some(c => c.projects && c.projects.length);

    let html = `
      <div class="gift-page-head"><h2>🚀 Каталог проектов</h2></div>
      <p class="gift-hint">Участвуй в проектах экосистемы Солидар Клуба. Сдай свою реферальную ссылку в проекте — за каждого реферала 1-й линии получишь <b>+10 TRDX</b> 💎</p>
    `;

    if (!hasAny) {
      html += '<div class="gift-empty"><h3>Каталог наполняется</h3><p>Проекты скоро появятся.</p></div>';
      root.innerHTML = html;
      return;
    }

    for (const cat of cats) {
      const st = CAT_STYLE[cat.color] || CAT_STYLE.blue;
      html += `<div class="gp-cat ${st.cls}">`;
      html += `<div class="gp-cat-head">${st.dot} ${esc(cat.title)}</div>`;
      if (cat.risk) {
        html += `<div class="gp-risk">⚠️ <b>Повышенный риск.</b> В отличие от Сервисов и продуктовых МЛМ-компаний, участие в стартапах всегда сопровождается повышенным риском. Проводите собственный анализ — участие в любом проекте вы берёте на себя со всеми рисками.</div>`;
      }
      if (!cat.projects || !cat.projects.length) {
        html += `<div class="gp-empty-cat">Пока нет проектов в этой категории</div>`;
      } else {
        html += `<div class="gp-grid">`;
        for (const p of cat.projects) {
          html += `
            <div class="gp-card">
              <div class="gp-card-icon">${esc(p.icon || '📦')}</div>
              <div class="gp-card-title">${esc(p.title)}${p.submitted ? ' <span class="gp-badge-ok">✓ участвую</span>' : ''}</div>
              <div class="gp-card-desc">${esc(p.description || '')}</div>
              <div class="gp-card-actions">
                ${p.website ? `<a class="gp-btn-go" href="${esc(p.website)}" target="_blank" rel="noopener">Перейти</a>` : ''}
                <button class="gp-btn-link" onclick="window._gpOpenSubmit(${p.id}, '${esc(p.title).replace(/'/g, "\\'")}')">${p.submitted ? 'Моя ссылка' : 'Сдать реф-ссылку'}</button>
              </div>
            </div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }
    root.innerHTML = html;
  };

  // Modal to submit referral link for a project
  window._gpOpenSubmit = function (projectId, title) {
    let modal = $('gpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'gpModal';
      modal.className = 'gp-modal-overlay';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="gp-modal">
        <div class="gp-modal-head">🔗 ${esc(title)}<span class="gp-modal-x" onclick="window._gpCloseModal()">✕</span></div>
        <div class="gp-modal-body">
          <p class="gift-hint">Вставь свою реферальную ссылку этого проекта (берётся в личном кабинете партнёра на сайте проекта). Система найдёт твоего спонсора и построит ветку. За L1 рефералов — +10 TRDX.</p>
          <input id="gpRefLink" class="gift-search" placeholder="https://проект.com/?ref=ТВОЙ_КОД" style="width:100%;margin-bottom:10px">
          <input id="gpRefUser" class="gift-search" placeholder="Твой ник в проекте (необязательно)" style="width:100%;margin-bottom:12px">
          <div id="gpSubmitMsg"></div>
          <button class="gift-btn" style="width:100%" onclick="window._gpSubmit(${projectId})">Сдать ссылку</button>
        </div>
      </div>`;
    modal.style.display = 'flex';
    // load existing participation
    api('GET', '/api/partners/' + projectId + '/my-participation').then(r => {
      if (r && r.ok && r.participation && r.participation.referral_link) {
        const inp = $('gpRefLink'); if (inp) inp.value = r.participation.referral_link;
        const msg = $('gpSubmitMsg');
        if (msg) msg.innerHTML = `<div class="gp-stat">Твоя L1-команда: <b>${r.l1_referrals_count || 0}</b> · вся команда: <b>${r.total_team_size || 0}</b></div>`;
      }
    });
  };
  window._gpCloseModal = function () { const m = $('gpModal'); if (m) m.style.display = 'none'; };
  window._gpSubmit = async function (projectId) {
    const link = ($('gpRefLink') || {}).value || '';
    const uname = ($('gpRefUser') || {}).value || '';
    const msg = $('gpSubmitMsg');
    if (!/^https?:\/\//i.test(link.trim())) { if (msg) msg.innerHTML = '<div class="gp-err">Введите корректную ссылку (http/https)</div>'; return; }
    if (msg) msg.innerHTML = '<div class="gift-loading">Отправка…</div>';
    const r = await api('POST', '/api/partners/' + projectId + '/submit-link', { referralLink: link.trim(), projectUsername: uname.trim() || undefined });
    if (r && r.ok) {
      if (msg) msg.innerHTML = '<div class="gp-ok">✅ Ссылка принята! +10 TRDX будет начислено когда система найдёт твоего спонсора.</div>';
      setTimeout(() => { window._gpCloseModal(); window.loadGiftProjectsPage(); }, 1500);
    } else {
      const reason = r && r.reason || r && r.error || 'ошибка';
      const map = { link_taken: 'Эта ссылка уже занята другим участником', already_submitted: 'Ты уже сдал ссылку в этом проекте', project_not_found: 'Проект не найден' };
      if (msg) msg.innerHTML = '<div class="gp-err">' + esc(map[reason] || reason) + '</div>';
    }
  };
})();
