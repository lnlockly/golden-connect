/* Golden Connect Cabinet — Bio constructor (Phase D minimal).
   Talks to /cabinet/api/shortener/bio/* (admin endpoints already live).
*/
(function () {
  'use strict';
  const ROOT = '/cabinet/api/shortener/bio';
  const PUBLIC_BASE = location.origin + '/bio/';
  const STATE = { profile: null, links: [], dirty: false };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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

  async function load() {
    try {
      const d = await api('GET', '/profile');
      STATE.profile = d.profile || null;
      STATE.links = (d.profile && d.profile.links) || [];
      render();
    } catch (e) { toast('Загрузка: ' + e.message, true); }
  }

  function render() {
    const host = $('bioPageContent'); if (!host) return;
    const p = STATE.profile;
    const username = p ? p.username : '';
    const publicUrl = p ? PUBLIC_BASE + username : '';
    host.innerHTML =
      '<div class="bio-head">' +
        '<div class="bio-head-text">' +
          '<h2>🌐 Bio-страница</h2>' +
          '<p>Личная мини-витрина с твоими ссылками. Похоже на Linktree, но с темами, A/B-тестами и QR.</p>' +
        '</div>' +
        (p ? '<a class="bio-cta" href="' + esc(publicUrl) + '" target="_blank">🔗 Открыть страницу</a>' : '') +
      '</div>' +
      '<div class="bio-grid">' +
        '<div class="bio-form">' +
          '<h3>Профиль</h3>' +
          '<div class="bio-field"><label>Username (латиница, 3-30)</label>' +
            '<input id="bio-username" value="' + esc(p ? p.username : '') + '" placeholder="myusername" maxlength="30"></div>' +
          '<div class="bio-field"><label>Имя на странице</label>' +
            '<input id="bio-display" value="' + esc(p ? p.display_name : '') + '" placeholder="Ваше имя" maxlength="60"></div>' +
          '<div class="bio-field"><label>О себе</label>' +
            '<textarea id="bio-bio" rows="3" placeholder="Краткое описание (до 200 символов)" maxlength="200">' + esc(p ? p.bio : '') + '</textarea></div>' +
          '<div class="bio-field"><label>Аватар (URL)</label>' +
            '<input id="bio-avatar" value="' + esc(p ? p.avatar_url : '') + '" placeholder="https://..."></div>' +
          '<div class="bio-row">' +
            '<div class="bio-field"><label>Цвет</label><input id="bio-color" type="color" value="' + esc((p && p.theme_color) || '#00D4FF') + '"></div>' +
            '<div class="bio-field"><label>Фон</label>' +
              '<select id="bio-bg">' +
                ['gradient','solid','dots','waves','particles','mesh','aurora','matrix','confetti','bokeh'].map((b) =>
                  '<option value="' + b + '"' + ((p && p.background) === b ? ' selected' : '') + '>' + b + '</option>').join('') +
              '</select></div>' +
            '<div class="bio-field"><label>Стиль кнопок</label>' +
              '<select id="bio-btn">' +
                ['rounded','pill','square','outline','filled','shadow','neon','glass'].map((b) =>
                  '<option value="' + b + '"' + ((p && p.button_style) === b ? ' selected' : '') + '>' + b + '</option>').join('') +
              '</select></div>' +
          '</div>' +
          '<button class="bio-btn bio-btn-primary" onclick="window.Bio.saveProfile()">💾 Сохранить профиль</button>' +
          (p ? '<div style="margin-top:14px;padding:12px;background:rgba(0,212,255,.08);border:1px solid rgba(0,212,255,.25);border-radius:8px;font-size:13px"><b>Публичный URL:</b><br><a href="' + esc(publicUrl) + '" target="_blank" style="color:#00D4FF;word-break:break-all">' + esc(publicUrl) + '</a></div>' : '') +
        '</div>' +
        '<div class="bio-links">' +
          '<h3>Ссылки <button class="bio-btn-add" onclick="window.Bio.addLink()" ' + (p ? '' : 'disabled') + '>+ Добавить</button></h3>' +
          (p ? renderLinks() : '<p style="color:#9ca3af">Сначала сохрани профиль.</p>') +
        '</div>' +
      '</div>';
  }

  function renderLinks() {
    if (!STATE.links.length) return '<p style="color:#9ca3af;text-align:center;padding:30px">Нет ссылок. Жми «+ Добавить».</p>';
    return STATE.links.map((l) =>
      '<div class="bio-link-row" data-id="' + l.id + '">' +
        '<input class="bio-link-title" placeholder="Название" value="' + esc(l.title || '') + '" data-field="title">' +
        '<input class="bio-link-url" placeholder="https://..." value="' + esc(l.url || l.content || '') + '" data-field="url">' +
        '<div class="bio-link-actions">' +
          '<button class="bio-btn-icon" onclick="window.Bio.saveLink(' + l.id + ')" title="Сохранить">💾</button>' +
          '<button class="bio-btn-icon" onclick="window.Bio.delLink(' + l.id + ')" title="Удалить">🗑</button>' +
        '</div>' +
      '</div>'
    ).join('');
  }

  async function saveProfile() {
    const body = {
      username: $('bio-username').value.trim().toLowerCase(),
      display_name: $('bio-display').value.trim(),
      bio: $('bio-bio').value.trim(),
      avatar_url: $('bio-avatar').value.trim(),
      theme_color: $('bio-color').value,
      background: $('bio-bg').value,
      button_style: $('bio-btn').value,
      show_avatar: 1,
      is_public: 1,
    };
    if (!/^[a-z0-9_-]{3,30}$/.test(body.username)) {
      return toast('Username: латиница/цифры/-/_, 3-30 символов', true);
    }
    try {
      const d = await api('POST', '/profile', body);
      toast('💾 Профиль сохранён');
      STATE.profile = d.profile || body;
      // re-fetch full state including links
      await load();
    } catch (e) { toast(e.message, true); }
  }

  async function addLink() {
    if (!STATE.profile || !STATE.profile.id) return;
    try {
      const d = await api('POST', '/pages/' + STATE.profile.id + '/links', {
        title: 'Новая ссылка', url: 'https://', type: 'link', position: STATE.links.length,
      });
      const link = d.link || d;
      STATE.links.push(link);
      render();
      toast('+ Добавлено');
    } catch (e) { toast(e.message, true); }
  }

  async function saveLink(id) {
    const row = document.querySelector('.bio-link-row[data-id="' + id + '"]'); if (!row) return;
    const title = row.querySelector('[data-field="title"]').value.trim();
    const url = row.querySelector('[data-field="url"]').value.trim();
    try {
      await api('PUT', '/pages/' + STATE.profile.id + '/links/' + id, { title, url, content: url });
      toast('💾 Сохранено');
    } catch (e) { toast(e.message, true); }
  }

  async function delLink(id) {
    if (!confirm('Удалить ссылку?')) return;
    try {
      await api('DELETE', '/pages/' + STATE.profile.id + '/links/' + id);
      STATE.links = STATE.links.filter((l) => l.id !== id);
      render();
      toast('🗑 Удалено');
    } catch (e) { toast(e.message, true); }
  }

  window.Bio = { mount: load, saveProfile, addLink, saveLink, delLink };
  window.loadBioPage = function () { load(); };
})();
