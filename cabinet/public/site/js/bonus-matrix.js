/* /bonus_matrix v3 — avatars, descendants count, click-to-focus, breadcrumb */
(function () {
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c];
  }); }
  function fmt(n) { n = Number(n) || 0; return n.toLocaleString('ru-RU'); }

  function nameOf(node) {
    if (!node) return '—';
    if (node.tg_username) return '@' + node.tg_username;
    if (node.first_name) return node.first_name;
    return '#' + node.user_id;
  }
  function initialsOf(node) {
    if (!node) return '?';
    var src = node.first_name || node.tg_username || ('U' + node.user_id);
    return String(src).trim().charAt(0).toUpperCase() || '?';
  }
  function colorForUser(userId) {
    var hue = (Number(userId || 0) * 137) % 360;
    return 'hsl(' + hue + ', 70%, 55%)';
  }

  var DEPTH_OPTIONS = [
    { key: 'compact', depth: 2, label: '7 мест' },
    { key: 'medium',  depth: 3, label: '15 мест' },
    { key: 'wide',    depth: 4, label: '31 место' },
  ];
  var currentDepth = (function () {
    try { var s = localStorage.getItem('bm_depth'); if (s && DEPTH_OPTIONS.find(o => o.key === s)) return s; } catch (_) {}
    return 'medium';
  })();

  // Focus user: which user's tree to render. null = self (current logged-in user).
  var focusUserId = null;
  var meUserId = null;
  var meUsername = null;

  function injectStyles() {
    if ($('bm-styles-v3')) return;
    var css = document.createElement('style');
    css.id = 'bm-styles-v3';
    css.textContent = `
      .bm-hero {
        position: relative; overflow: hidden;
        background: linear-gradient(135deg, rgba(0,212,255,0.08), rgba(177,74,237,0.08), rgba(255,46,151,0.06));
        border: 1px solid rgba(0,212,255,0.2);
        margin-bottom: 18px; padding: 28px; border-radius: 18px;
      }
      .bm-hero::before {
        content: ''; position: absolute; inset: 0;
        background:
          radial-gradient(circle at 20% 30%, rgba(0,212,255,0.18), transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(255,46,151,0.18), transparent 50%);
        pointer-events: none; opacity: 0.6;
      }
      .bm-hero > * { position: relative; z-index: 1; }
      .bm-toggle {
        display: inline-flex; gap: 4px; padding: 4px;
        background: rgba(0,0,0,0.3); border-radius: 12px;
        border: 1px solid rgba(0,212,255,0.2);
      }
      .bm-toggle button {
        background: transparent; border: none; color: #94a3b8;
        padding: 8px 16px; border-radius: 8px; cursor: pointer;
        font-size: 13px; font-weight: 600; transition: all 0.2s;
      }
      .bm-toggle button:hover { color: #fff; background: rgba(255,255,255,0.05); }
      .bm-toggle button.active {
        background: linear-gradient(135deg, #00D4FF, #B14AED);
        color: #fff; box-shadow: 0 4px 14px rgba(0,212,255,0.35);
      }
      .bm-breadcrumb {
        display: flex; flex-wrap: wrap; gap: 4px; align-items: center;
        padding: 10px 14px; background: rgba(0,0,0,0.2);
        border-radius: 10px; margin-bottom: 14px;
        font-size: 12px;
      }
      .bm-bc-item {
        background: rgba(0,212,255,0.1); color: #00D4FF;
        padding: 4px 10px; border-radius: 999px;
        cursor: pointer; transition: all 0.2s;
        border: 1px solid rgba(0,212,255,0.25);
      }
      .bm-bc-item:hover { background: rgba(0,212,255,0.25); transform: translateY(-1px); }
      .bm-bc-current { background: linear-gradient(135deg,#FF2E97,#B14AED); color: #fff; cursor: default; border-color: transparent; }
      .bm-bc-arrow { color: #64748b; }
      .bm-stage {
        position: relative; perspective: 1800px; perspective-origin: 50% 0%;
        padding: 30px 20px 20px; overflow-x: auto; overflow-y: visible;
        min-height: 400px;
        background:
          radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.06), transparent 60%),
          radial-gradient(ellipse at 50% 100%, rgba(177,74,237,0.04), transparent 50%);
        border-radius: 16px;
      }
      .bm-tree {
        transform-style: preserve-3d; transform: rotateX(8deg);
        transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        display: flex; flex-direction: column; align-items: center;
        min-width: max-content;
      }
      .bm-stage:hover .bm-tree { transform: rotateX(2deg); }
      .bm-row { display: flex; align-items: flex-start; gap: 8px; position: relative; margin-top: 28px; transform-style: preserve-3d; }
      .bm-row:first-child { margin-top: 0; }
      .bm-cell { display: flex; flex-direction: column; align-items: center; flex: 1 1 auto; min-width: 0; transform-style: preserve-3d; position: relative; }

      .bm-card {
        position: relative;
        padding: 12px 14px 10px;
        min-width: 130px; max-width: 180px;
        background: rgba(13, 17, 36, 0.7);
        backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(0,212,255,0.3);
        border-radius: 14px;
        color: #e0f4ff;
        box-shadow: 0 8px 24px rgba(0, 212, 255, 0.18), 0 0 0 1px rgba(255,255,255,0.06) inset;
        text-align: center;
        transform: translateZ(20px);
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s, border-color 0.3s;
        cursor: pointer;
        animation: bm-fadein 0.5s ease both;
      }
      @keyframes bm-fadein { from { opacity: 0; transform: translateZ(0) translateY(10px); } to { opacity: 1; transform: translateZ(20px) translateY(0); } }
      .bm-card:hover {
        transform: translateZ(50px) scale(1.06);
        box-shadow: 0 18px 50px rgba(0,212,255,0.45), 0 0 0 1px rgba(0,212,255,0.5) inset;
      }
      .bm-card-empty {
        background: transparent !important;
        border: 1px dashed rgba(148,163,184,0.25) !important;
        opacity: 0.5; box-shadow: none !important; cursor: default;
      }
      .bm-card-empty:hover { transform: translateZ(20px) !important; }
      .bm-card-me {
        background: linear-gradient(135deg, rgba(255,46,151,0.95), rgba(177,74,237,0.95)) !important;
        border-color: #ff2e97 !important;
        color: #fff;
        box-shadow: 0 12px 32px rgba(255, 46, 151, 0.55), 0 0 0 2px rgba(255,255,255,0.18) inset !important;
        animation: bm-pulse 2.4s infinite, bm-fadein 0.5s ease both;
      }
      .bm-card-focus:not(.bm-card-me) {
        border-color: #00D4FF !important;
        box-shadow: 0 12px 32px rgba(0, 212, 255, 0.5), 0 0 0 2px rgba(0,212,255,0.5) inset !important;
      }
      @keyframes bm-pulse {
        0%, 100% { box-shadow: 0 12px 32px rgba(255,46,151,0.55), 0 0 0 2px rgba(255,255,255,0.18) inset; }
        50% { box-shadow: 0 12px 48px rgba(255,46,151,0.95), 0 0 0 2px rgba(255,255,255,0.4) inset; }
      }
      .bm-me-badge {
        position: absolute; top: -10px; right: -10px;
        background: #fff; color: #ff2e97;
        font-size: 10px; font-weight: 800;
        padding: 4px 10px; border-radius: 999px;
        box-shadow: 0 2px 10px rgba(255,46,151,0.4); letter-spacing: 0.05em;
      }
      .bm-avatar {
        width: 40px; height: 40px; border-radius: 50%; margin: 0 auto 6px;
        display: flex; align-items: center; justify-content: center;
        font-size: 16px; font-weight: 800; color: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.35), 0 0 0 2px rgba(255,255,255,0.08);
        background-size: cover; background-position: center;
        overflow: hidden;
      }
      .bm-avatar img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
      .bm-card-empty .bm-avatar { background: rgba(148,163,184,0.15) !important; color: rgba(148,163,184,0.4); }
      .bm-level {
        font-size: 9px; color: #94a3b8;
        letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 2px;
      }
      .bm-card-me .bm-level, .bm-card-focus .bm-level { color: rgba(255,255,255,0.85); }
      .bm-name {
        font-size: 12px; font-weight: 700;
        word-break: break-word; line-height: 1.2;
      }
      .bm-pos {
        font-size: 10px; color: #64748b;
        margin-top: 2px; font-family: 'JetBrains Mono', monospace;
      }
      .bm-card-me .bm-pos, .bm-card-focus .bm-pos { color: rgba(255,255,255,0.65); }
      .bm-desc-badge {
        margin-top: 6px;
        display: inline-flex; align-items: center; gap: 3px;
        padding: 2px 8px; background: rgba(16,185,129,0.15);
        border: 1px solid rgba(16,185,129,0.35);
        border-radius: 999px; font-size: 10px; font-weight: 700; color: #10b981;
      }
      .bm-card-me .bm-desc-badge { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.3); color: #fff; }
      .bm-connector {
        position: absolute; top: -28px; left: 50%; width: 1px; height: 28px;
        background: linear-gradient(180deg, transparent, rgba(0,212,255,0.4));
      }
      .bm-stage::-webkit-scrollbar { height: 8px; }
      .bm-stage::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); border-radius: 4px; }
      .bm-stage::-webkit-scrollbar-thumb { background: linear-gradient(90deg,#00D4FF,#B14AED); border-radius: 4px; }
      .bm-stat-tile {
        padding: 14px 18px;
        background: linear-gradient(135deg, rgba(0,212,255,0.06), rgba(177,74,237,0.06));
        border: 1px solid rgba(0,212,255,0.2);
        border-radius: 12px; text-align: center;
        transition: transform 0.2s, border-color 0.2s;
      }
      .bm-stat-tile:hover { transform: translateY(-2px); border-color: rgba(0,212,255,0.5); }
      .bm-feed-item { animation: bm-feed-slide 0.4s ease both; }
      @keyframes bm-feed-slide { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
      @media (max-width: 768px) {
        .bm-tree { transform: rotateX(0deg) !important; }
        .bm-card { min-width: 100px; padding: 8px 10px 6px; }
        .bm-name { font-size: 10px; }
        .bm-avatar { width: 32px; height: 32px; font-size: 13px; }
        .bm-level, .bm-pos { font-size: 8px; }
        .bm-row { gap: 4px; margin-top: 22px; }
        .bm-stage { padding: 20px 8px 12px; }
      }
    `;
    document.head.appendChild(css);
  }

  function buildLevels(rootNode, depth) {
    var byPos = new Map();
    function walk(n) { if (!n) return; byPos.set(n.position, n); if (n.children) n.children.forEach(walk); }
    walk(rootNode);
    var rootPos = rootNode.position;
    var levels = [[rootPos]];
    for (var d = 1; d <= depth; d++) {
      var prev = levels[d - 1]; var next = [];
      for (var i = 0; i < prev.length; i++) {
        var p = prev[i]; next.push(2 * p + 1, 2 * p + 2);
      }
      levels.push(next);
    }
    return { byPos: byPos, levels: levels };
  }

  function avatarHtml(node, color) {
    if (node && node.avatar_url) {
      return '<div class="bm-avatar"><img src="' + esc(node.avatar_url) + '" alt="' + esc(initialsOf(node)) + '" loading="lazy" onerror="this.parentNode.innerHTML=\'' + esc(initialsOf(node)) + '\';this.parentNode.style.background=\'linear-gradient(135deg,' + color + ',' + color.replace('55%)', '40%)') + ')\'"></div>';
    }
    return '<div class="bm-avatar" style="background:linear-gradient(135deg,' + color + ',' + color.replace('55%)', '40%)') + ')">' + esc(initialsOf(node)) + '</div>';
  }

  function renderTreeLevels(rootNode, depth, focusUid, currentMeUid) {
    var data = buildLevels(rootNode, depth);
    var html = '';
    for (var l = 0; l <= depth; l++) {
      var row = data.levels[l];
      html += '<div class="bm-row">';
      for (var i = 0; i < row.length; i++) {
        var pos = row[i];
        var node = data.byPos.get(pos);
        if (node) {
          var isMe = node.user_id === currentMeUid;
          var isFocus = node.user_id === focusUid && !isMe;
          var classNames = 'bm-card' + (isMe ? ' bm-card-me' : '') + (isFocus ? ' bm-card-focus' : '');
          var color = colorForUser(node.user_id);
          var lbl = l === 0 ? 'TOP' : 'L' + l;
          var descBadge = (node.descendants_count > 0)
            ? '<div class="bm-desc-badge">👥 ' + fmt(node.descendants_count) + '</div>'
            : '';
          html += '<div class="bm-cell">' +
            (l > 0 ? '<div class="bm-connector"></div>' : '') +
            '<div class="' + classNames + '" data-uid="' + node.user_id + '" title="' + esc(nameOf(node)) + ' · #' + pos + (node.descendants_count ? ' · ' + node.descendants_count + ' под ним' : '') + '">' +
              (isMe ? '<div class="bm-me-badge">ТЫ</div>' : '') +
              avatarHtml(node, color) +
              '<div class="bm-level">' + lbl + '</div>' +
              '<div class="bm-name">' + esc(nameOf(node)) + '</div>' +
              '<div class="bm-pos">#' + pos + '</div>' +
              descBadge +
            '</div>' +
          '</div>';
        } else {
          html += '<div class="bm-cell">' +
            (l > 0 ? '<div class="bm-connector"></div>' : '') +
            '<div class="bm-card bm-card-empty">' +
              '<div class="bm-avatar">·</div>' +
              '<div class="bm-level">L' + l + '</div>' +
              '<div class="bm-name" style="color:#64748b">пусто</div>' +
              '<div class="bm-pos">#' + pos + '</div>' +
            '</div>' +
          '</div>';
        }
      }
      html += '</div>';
    }
    return html;
  }

  async function fetchUpline() {
    if (!focusUserId || focusUserId === meUserId) return null;
    try {
      var r = await fetch('/cabinet/api/bonus-matrix/upline?user_id=' + focusUserId + '&height=10', { credentials: 'same-origin' }).then(r => r.json());
      return r && r.ok ? r.chain : null;
    } catch (_) { return null; }
  }

  function renderBreadcrumb(uplineChain, focusName) {
    if (!uplineChain) return '';
    // Chain comes from focus → root. Reverse for breadcrumb.
    var arr = uplineChain.slice().reverse();
    var html = '<div class="bm-breadcrumb">';
    arr.forEach(function (u, idx) {
      var name = u.tg_username ? '@' + u.tg_username : (u.first_name || ('#' + u.user_id));
      html += '<span class="bm-bc-item" data-uid="' + u.user_id + '">' + esc(name) + '</span>';
      html += '<span class="bm-bc-arrow">▸</span>';
    });
    html += '<span class="bm-bc-item bm-bc-current">' + esc(focusName) + '</span>';
    if (focusUserId !== meUserId) {
      html += '<span style="margin-left:auto;flex:0 0 auto"><button class="bm-bc-item" data-uid="' + meUserId + '" style="background:rgba(255,46,151,0.15);border-color:rgba(255,46,151,0.35);color:#FF2E97">🏠 К себе</button></span>';
    }
    html += '</div>';
    return html;
  }

  window.loadBonusMatrixPage = async function () {
    var root = $('bonusMatrixContent') || $('bonus_matrixContent');
    if (!root) return;
    injectStyles();
    if (!root.dataset.initialLoadDone) {
      root.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8">⚡ Загружаю карту сообщества...</div>';
    }

    var depthOpt = DEPTH_OPTIONS.find(o => o.key === currentDepth) || DEPTH_OPTIONS[1];

    var resMe, resTree, resGlobal, resUpline;
    try { resMe = await fetch('/cabinet/api/bonus-matrix/me', { credentials: 'same-origin' }).then(r => r.json()); } catch (_) { resMe = null; }
    if (resMe && resMe.ok) {
      meUserId = resMe.user_id;
      if (focusUserId == null) focusUserId = meUserId;
    }
    var treeUrl = '/cabinet/api/bonus-matrix/tree?depth=' + depthOpt.depth +
      (focusUserId && focusUserId !== meUserId ? '&focus_user_id=' + focusUserId : '');
    try { resTree = await fetch(treeUrl, { credentials: 'same-origin' }).then(r => r.json()); } catch (_) { resTree = null; }
    try { resGlobal = await fetch('/cabinet/api/bonus-matrix/global?limit=20', { credentials: 'same-origin' }).then(r => r.json()); } catch (_) { resGlobal = null; }
    if (focusUserId && focusUserId !== meUserId) {
      resUpline = await fetchUpline();
    }

    var html = '';
    var me = resMe && resMe.ok ? resMe : null;
    var totalInMatrix = me ? me.total_in_matrix : (resGlobal && resGlobal.total) || 0;
    var focusedTree = resTree && resTree.ok ? resTree.tree : null;
    var focusedNode = focusedTree;

    // Hero
    html += '<div class="bm-hero">' +
      '<div style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:18px">' +
        '<div style="font-size:64px;line-height:1;filter:drop-shadow(0 8px 20px rgba(255,46,151,0.4))">🎁</div>' +
        '<div style="flex:1;min-width:220px">' +
          '<div style="font-size:11px;color:#94a3b8;letter-spacing:.12em;text-transform:uppercase;font-weight:600">Карта сообщества</div>' +
          '<div style="font-family:Orbitron,monospace;font-size:32px;font-weight:900;background:linear-gradient(135deg,#00D4FF,#FF2E97);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;line-height:1.1">Карта сообщества</div>' +
          (me
            ? '<div style="font-size:14px;color:#cbd5e1;margin-top:6px">Твоя позиция <strong style="color:#FF2E97">#' + me.position + '</strong> · под тобой <strong style="color:#10b981">' + me.downline_total + '</strong> человек</div>'
            : '') +
        '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">' +
        '<div class="bm-stat-tile"><div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Всего</div><div style="font-family:Orbitron,monospace;font-size:24px;font-weight:800;color:#00D4FF">' + fmt(totalInMatrix) + '</div></div>' +
        (me ? '<div class="bm-stat-tile"><div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Под тобой</div><div style="font-family:Orbitron,monospace;font-size:24px;font-weight:800;color:#10b981">' + fmt(me.downline_total) + '</div></div>' : '') +
        (me ? '<div class="bm-stat-tile"><div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Глубина</div><div style="font-family:Orbitron,monospace;font-size:24px;font-weight:800;color:#fbbf24">' + Object.keys(me.downline_by_level || {}).length + ' ур.</div></div>' : '') +
        (me ? '<div class="bm-stat-tile"><div style="font-size:11px;color:#94a3b8;text-transform:uppercase">Твоя поз.</div><div style="font-family:Orbitron,monospace;font-size:24px;font-weight:800;color:#FF2E97">#' + me.position + '</div></div>' : '') +
      '</div>' +
      '<div style="font-size:13px;color:#cbd5e1;line-height:1.6;padding:12px 14px;background:rgba(0,0,0,0.25);border-radius:10px">' +
        '🌐 <strong>Карта сообщества</strong> — все участники Monar по факту регистрации. Привязка по реф-коду. Кликай по карточкам — проваливайся в сеть любого юзера. Никаких выплат — это карта сообщества, не очередь и не пирамида.' +
      '</div>' +
    '</div>';

    // Tree section with toggle + breadcrumb
    var focusName = focusedTree ? nameOf(focusedTree) : '';
    html += '<div class="cab-card" style="margin-bottom:18px;padding:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">' +
        '<h3 style="margin:0;color:#fff">🌳 Структура' + (focusUserId && focusUserId !== meUserId ? ' · ' + esc(focusName) : ' · твоя') + '</h3>' +
        '<div class="bm-toggle">' +
          DEPTH_OPTIONS.map(function (o) { return '<button data-depth="' + o.key + '"' + (o.key === currentDepth ? ' class="active"' : '') + '>' + o.label + '</button>'; }).join('') +
        '</div>' +
      '</div>';

    if (focusUserId && focusUserId !== meUserId && resUpline) {
      html += renderBreadcrumb(resUpline, focusName);
    }

    if (focusedTree && me) {
      html += '<div class="bm-stage"><div class="bm-tree">' + renderTreeLevels(focusedTree, depthOpt.depth, focusUserId, meUserId) + '</div></div>';
      html += '<div style="font-size:11px;color:#94a3b8;text-align:center;margin-top:10px">' +
        'Клик на карточку — открыть его сеть · ' +
        '<span style="color:#10b981">👥 N</span> = людей в поддереве · ' +
        'Toggle меняет глубину просмотра' +
      '</div>';
    } else {
      html += '<div style="text-align:center;padding:30px;color:#94a3b8">Структура пока не загружена.</div>';
    }
    html += '</div>';

    // Downline by level
    if (me && me.downline_by_level && Object.keys(me.downline_by_level).length > 0) {
      html += '<div class="cab-card" style="margin-bottom:18px"><h3 style="margin:0 0 14px;color:#fff">📊 Твоя сеть по уровням</h3>';
      html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px">';
      var levels = Object.keys(me.downline_by_level).map(Number).sort((a, b) => a - b);
      levels.forEach(function (l) {
        var n = me.downline_by_level[l];
        var pct = Math.min(100, (n / Math.pow(2, l)) * 100);
        html += '<div style="position:relative;text-align:center;padding:14px 10px;background:rgba(0,0,0,0.3);border-radius:10px;overflow:hidden">' +
          '<div style="position:absolute;inset:auto 0 0 0;height:3px;background:rgba(0,0,0,0.4)"><div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#00D4FF,#B14AED)"></div></div>' +
          '<div style="font-size:11px;color:#94a3b8;text-transform:uppercase">L' + l + '</div>' +
          '<div style="font-family:Orbitron,monospace;font-size:22px;font-weight:800;color:#00D4FF">' + n + '<span style="font-size:11px;color:#94a3b8">/' + Math.pow(2, l) + '</span></div>' +
        '</div>';
      });
      html += '</div></div>';
    }

    // Live recent feed
    if (resGlobal && resGlobal.ok && resGlobal.recent && resGlobal.recent.length) {
      html += '<div class="cab-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h3 style="margin:0;color:#fff">🔴 Свежие участники</h3><span style="font-size:11px;color:#94a3b8">обновляется каждые 30 сек</span></div>';
      html += '<div style="display:flex;flex-direction:column;gap:6px;max-height:380px;overflow-y:auto">';
      resGlobal.recent.forEach(function (r, idx) {
        var when = new Date(r.joined_at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        var n = r.tg_username ? '@' + r.tg_username : (r.first_name || ('User #' + r.user_id));
        var color = colorForUser(r.user_id);
        var initial = (r.first_name || r.tg_username || 'U').charAt(0).toUpperCase();
        html += '<div class="bm-feed-item" data-uid="' + r.user_id + '" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:rgba(0,0,0,0.2);border-radius:10px;font-size:13px;cursor:pointer;transition:background 0.2s;animation-delay:' + (idx * 30) + 'ms" onmouseover="this.style.background=\'rgba(0,212,255,0.1)\'" onmouseout="this.style.background=\'rgba(0,0,0,0.2)\'">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,' + color + ',' + color.replace('55%)', '40%)') + ');display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;box-shadow:0 4px 10px rgba(0,0,0,0.3)">' + esc(initial) + '</div>' +
          '<div style="flex:1;color:#cbd5e1;font-weight:600">' + esc(n) + '</div>' +
          '<div style="color:#00D4FF;font-family:Orbitron,monospace;font-size:11px;font-weight:700">#' + r.position + '</div>' +
          '<div style="color:#94a3b8;font-size:11px">' + esc(when) + '</div>' +
        '</div>';
      });
      html += '</div></div>';
    }

    root.innerHTML = html;
    root.dataset.initialLoadDone = '1';

    // Wire depth toggle
    root.querySelectorAll('.bm-toggle button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var newDepth = btn.getAttribute('data-depth');
        if (newDepth === currentDepth) return;
        currentDepth = newDepth;
        try { localStorage.setItem('bm_depth', newDepth); } catch (_) {}
        window.loadBonusMatrixPage();
      });
    });

    // Wire card clicks (focus on user)
    root.querySelectorAll('.bm-card[data-uid]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        e.stopPropagation();
        var uid = parseInt(card.getAttribute('data-uid'), 10);
        if (!uid || uid === focusUserId) return;
        focusUserId = uid;
        window.loadBonusMatrixPage();
      });
    });

    // Wire breadcrumb clicks
    root.querySelectorAll('.bm-bc-item[data-uid]').forEach(function (it) {
      it.addEventListener('click', function () {
        var uid = parseInt(it.getAttribute('data-uid'), 10);
        if (!uid || uid === focusUserId) return;
        focusUserId = uid;
        window.loadBonusMatrixPage();
      });
    });

    // Wire feed clicks (focus)
    root.querySelectorAll('.bm-feed-item[data-uid]').forEach(function (it) {
      it.addEventListener('click', function () {
        var uid = parseInt(it.getAttribute('data-uid'), 10);
        if (!uid || uid === focusUserId) return;
        focusUserId = uid;
        window.loadBonusMatrixPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    if (window.__bmRefreshTimer) clearInterval(window.__bmRefreshTimer);
    window.__bmRefreshTimer = setInterval(function () {
      if (document.querySelector('#page-bonus_matrix.active') && window.loadBonusMatrixPage && focusUserId === meUserId) {
        window.loadBonusMatrixPage();
      } else if (!document.querySelector('#page-bonus_matrix.active')) {
        clearInterval(window.__bmRefreshTimer); window.__bmRefreshTimer = null;
      }
    }, 30000);
  };
})();
