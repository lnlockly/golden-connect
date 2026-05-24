/* ═════════════════════════════════════════════════════════════════════════
   Trendex Cabinet v3 — Hero (Phase 2)

   Self-mounting hero block on the dashboard:
   - WebGL-style particle network on canvas (mouse-reactive)
   - Aurora-gradient greeting "Привет, <name>"
   - 4 KPI cards with count-up animation

   No build step, no dependencies. Loaded via <script> after cabinet-v2.js.
   Auto-mounts when #page-dashboard becomes active.
   ═════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  if (!document.body.classList.contains('ui-v3')) return;
  if (window.__v3HeroMounted) return;
  window.__v3HeroMounted = true;

  // ── Style block scoped to v3 hero ───────────────────────────────────────
  const css = `
    .v3-hero { position: relative; isolation: isolate; overflow: hidden;
      border-radius: 20px; margin: 16px 0 24px;
      background: var(--v3-bg-surface);
      border: 1px solid var(--v3-border-faint);
      min-height: 220px; padding: 36px 32px 40px; }
    .v3-hero canvas { position: absolute; inset: 0; width: 100%; height: 100%;
      z-index: 0; pointer-events: none; opacity: 0.85; }
    .v3-hero::after { content: ''; position: absolute; inset: 0;
      background: radial-gradient(ellipse 80% 60% at 15% 100%, rgba(177,74,255,0.15), transparent 60%),
                  radial-gradient(ellipse 60% 50% at 85% 0%,   rgba(0,224,255,0.10),  transparent 60%);
      z-index: 1; pointer-events: none; }
    .v3-hero-content { position: relative; z-index: 2; display: flex;
      flex-direction: column; gap: 8px; max-width: 720px; }
    .v3-hero-greeting { font-family: var(--v3-font-display);
      font-size: clamp(24px, 3.4vw, 38px); font-weight: 700;
      letter-spacing: -0.025em; line-height: 1.1; margin: 0;
      background: linear-gradient(135deg, #ffffff 0%, #d2b3ff 40%, #66e4ff 90%);
      background-clip: text; -webkit-background-clip: text;
      -webkit-text-fill-color: transparent; color: transparent; }
    .v3-hero-sub { color: var(--v3-text-secondary); font-size: 15px;
      line-height: 1.55; margin: 0; max-width: 580px; }
    /* [hero-3d-cards-2026-05-21] new 3D tech stat cards */
    .v3-hero-stat-row { display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px; margin-top: 28px; position: relative; z-index: 2; }
    @media (max-width: 720px) {
      .v3-hero { padding: 24px 18px 28px; }
      .v3-hero-stat-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    .v3-stat-card {
      position: relative; padding: 16px 16px 18px; border-radius: 16px;
      background: linear-gradient(160deg, rgba(28,32,46,0.92), rgba(14,16,26,0.92));
      border: 1px solid rgba(255,255,255,0.07);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 26px rgba(0,0,0,0.40);
      overflow: hidden;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), border-color .25s, box-shadow .25s;
    }
    /* neon top accent line, color per card via --accent */
    .v3-stat-card::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
      background: linear-gradient(90deg, transparent, var(--accent,#00e0ff), transparent);
      opacity: .9;
    }
    .v3-stat-card:hover {
      transform: translateY(-3px);
      border-color: var(--accent,#00e0ff);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 10px 34px rgba(0,0,0,0.5), 0 0 26px color-mix(in srgb, var(--accent,#00e0ff) 30%, transparent);
    }
    .v3-stat-label {
      font-family: var(--v3-font-display, 'Orbitron', sans-serif);
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em;
      color: var(--v3-text-tertiary, #8b93a7); margin: 0 0 10px; font-weight: 700;
      display: flex; align-items: center; gap: 6px;
    }
    /* the big 3D extruded number */
    .v3-stat-value {
      font-family: 'Orbitron', var(--v3-font-mono, monospace);
      font-variant-numeric: tabular-nums; font-size: 30px; font-weight: 800;
      letter-spacing: 0.5px; line-height: 1; margin: 0;
      color: #f4f7ff;
      /* layered shadow = extruded 3D look */
      text-shadow:
        0 1px 0 rgba(255,255,255,0.25),
        0 2px 0 color-mix(in srgb, var(--accent,#00e0ff) 55%, #0a0c14),
        0 3px 0 color-mix(in srgb, var(--accent,#00e0ff) 40%, #0a0c14),
        0 4px 6px rgba(0,0,0,0.55),
        0 0 18px color-mix(in srgb, var(--accent,#00e0ff) 45%, transparent);
      white-space: nowrap;
    }
    .v3-stat-value .unit { font-size: 13px; font-weight: 700; opacity: .65; text-shadow: none; margin-left: 3px; }
    .v3-stat-delta {
      font-size: 10px; margin-top: 8px; font-family: var(--v3-font-mono, monospace);
      letter-spacing: 0.08em; color: var(--v3-text-tertiary, #8b93a7);
      display: inline-block; padding: 2px 8px; border-radius: 6px;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
    }
    .v3-stat-delta:empty { display: none; }
    .v3-stat-delta.pos { color: #7CFC00; border-color: rgba(124,252,0,0.3); }
    .v3-stat-delta.neg { color: #ff5470; border-color: rgba(255,84,112,0.3); }
    /* subscription progress bar */
    .v3-stat-prog { height: 4px; border-radius: 3px; margin-top: 10px; overflow: hidden;
      background: rgba(255,255,255,0.08); }
    .v3-stat-prog > i { display: block; height: 100%; border-radius: 3px;
      background: linear-gradient(90deg, var(--accent,#b14aff), #ff2e97); }
  `;
  const styleEl = document.createElement('style');
  styleEl.id = 'v3-hero-css';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ═══════════ PARTICLE NETWORK (canvas 2D, ~80 particles) ═══════════ */
  class ParticleNetwork {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.parts = [];
      this.maxDist = 130;
      this.mouse = { x: -1000, y: -1000, active: false };
      this.reducedMotion = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.colorA = [177, 74, 255]; // violet
      this.colorB = [0, 224, 255];  // cyan
      this.running = true;
      this.resize = this.resize.bind(this);
      this.onMouse = this.onMouse.bind(this);
      this.onLeave = this.onLeave.bind(this);
      this.tick = this.tick.bind(this);

      this.resize();
      window.addEventListener('resize', this.resize, { passive: true });
      // Hero mouse-reactive — attach to parent so we don't block canvas pointer
      const parent = canvas.parentElement;
      if (parent) {
        parent.addEventListener('mousemove', this.onMouse, { passive: true });
        parent.addEventListener('mouseleave', this.onLeave, { passive: true });
      }
      requestAnimationFrame(this.tick);
    }

    resize() {
      const r = this.cv.getBoundingClientRect();
      this.w = r.width;
      this.h = r.height;
      this.cv.width = this.w * this.dpr;
      this.cv.height = this.h * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const target = Math.min(90, Math.round((this.w * this.h) / 12000));
      // Add or remove to match target
      while (this.parts.length < target) {
        this.parts.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: 0.8 + Math.random() * 1.4,
        });
      }
      while (this.parts.length > target) this.parts.pop();
    }

    onMouse(e) {
      const r = this.cv.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.mouse.active = true;
    }
    onLeave() { this.mouse.active = false; this.mouse.x = -1000; this.mouse.y = -1000; }

    tick() {
      if (!this.running) return;
      const { ctx, parts, w, h, maxDist, mouse } = this;
      ctx.clearRect(0, 0, w, h);

      // Update positions
      for (const p of parts) {
        if (!this.reducedMotion) {
          p.x += p.vx; p.y += p.vy;
          // Mouse repulsion
          if (mouse.active) {
            const dx = p.x - mouse.x, dy = p.y - mouse.y;
            const d2 = dx * dx + dy * dy;
            const limit = 100;
            if (d2 < limit * limit && d2 > 0) {
              const d = Math.sqrt(d2);
              const force = (limit - d) / limit * 0.6;
              p.x += (dx / d) * force;
              p.y += (dy / d) * force;
            }
          }
        }
        // Bounce edges
        if (p.x < 0) { p.x = 0; p.vx *= -1; }
        if (p.x > w) { p.x = w; p.vx *= -1; }
        if (p.y < 0) { p.y = 0; p.vy *= -1; }
        if (p.y > h) { p.y = h; p.vy *= -1; }
      }

      // Draw connections
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        for (let j = i + 1; j < parts.length; j++) {
          const q = parts[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < maxDist * maxDist) {
            const d = Math.sqrt(d2);
            const t = 1 - d / maxDist; // 0..1
            // Color blend across distance
            const r = Math.round(this.colorA[0] * t + this.colorB[0] * (1 - t));
            const g = Math.round(this.colorA[1] * t + this.colorB[1] * (1 - t));
            const b = Math.round(this.colorA[2] * t + this.colorB[2] * (1 - t));
            ctx.strokeStyle = `rgba(${r},${g},${b},${0.18 * t})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of parts) {
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grad.addColorStop(0, 'rgba(177, 74, 255, 0.85)');
        grad.addColorStop(1, 'rgba(177, 74, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(220, 200, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(this.tick);
    }

    destroy() {
      this.running = false;
      window.removeEventListener('resize', this.resize);
      const parent = this.cv.parentElement;
      if (parent) {
        parent.removeEventListener('mousemove', this.onMouse);
        parent.removeEventListener('mouseleave', this.onLeave);
      }
    }
  }

  /* ═══════════ COUNT-UP ANIMATION ═══════════ */
  // [no-countup-2026-05-13] countUp animation disabled — was causing visible
  // mid-tween states in screenshots (e.g. "$800. 74 .", "59..."). Direct render
  // is cleaner and avoids layout shift while values change.
  function countUp(el, target, opts) {
    opts = opts || {};
    const isMoney = !!opts.money;
    el.textContent = isMoney ? formatMoney(target) : Math.round(target).toLocaleString('ru-RU');
  }
  function formatMoney(v) {
    const n = Number(v) || 0;
    return '$' + (n % 1 === 0 ? n.toFixed(0) : n.toFixed(2));
  }

  /* ═══════════ HERO MARKUP + MOUNT ═══════════ */
  // [v3-polish] resolveName — wait briefly for window.me to populate (cabinet
    // boots me via async /api/auth/me; hero mounts before it lands).
    function resolveName() {
      const m = window.me || {};
      const raw = m.firstName || m.displayName || m.username || m.email;
      if (!raw) return null;
      // For emails strip domain so we don't say "Привет, vasily@gmail.com"
      const at = String(raw).indexOf('@');
      return at > 0 ? String(raw).slice(0, at) : String(raw);
    }
    function buildHero() {
      const name = resolveName() || 'друг';
    const hr = new Date().getHours();
    const part = hr < 6 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
    const el = document.createElement('div');
    el.className = 'v3-hero';
    el.innerHTML = `
      <canvas data-v3-canvas></canvas>
      <div class="v3-hero-content">
        <p class="v3-hero-greeting">${part}, ${escapeHtml(name)}</p>
        <p class="v3-hero-sub">Твой рабочий стол. Все каналы, балансы и команда — в одном месте.</p>
        <p class="v3-hero-slogan" style="font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:var(--v3-text-tertiary);margin-top:8px;font-weight:700">— БУДЬ В ТРЕНДЕ —</p>
      </div>
      <div class="v3-hero-stat-row">
        <div class="v3-stat-card" style="--accent:#10e0a0">
          <p class="v3-stat-label">🟢 Основной баланс</p>
          <p class="v3-stat-value" data-stat="working">—</p>
          <p class="v3-stat-delta" data-stat-delta="working"></p>
        </div>
        <div class="v3-stat-card" style="--accent:#fbbf24">
          <p class="v3-stat-label">🟡 Рекламный</p>
          <p class="v3-stat-value" data-stat="gift">—</p>
          <p class="v3-stat-delta" data-stat-delta="gift"></p>
        </div>
        <div class="v3-stat-card" style="--accent:#ff2e97">
          <p class="v3-stat-label">⚡ Карма</p>
          <p class="v3-stat-value" data-stat="karma">—</p>
          <p class="v3-stat-delta" data-stat-delta="karma"></p>
        </div>
        <div class="v3-stat-card" style="--accent:#b14aff">
          <p class="v3-stat-label">🟣 Автоподписка</p>
          <p class="v3-stat-value" data-stat="subscription">—</p>
          <div class="v3-stat-prog"><i data-stat-prog="subscription" style="width:0%"></i></div>
          <p class="v3-stat-delta" data-stat-delta="subscription"></p>
        </div>
      </div>
    `;
    return el;
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
  }

  /* ═══════════ FETCH + RENDER STATS ═══════════ */
  async function populateStats(hero) {
    try {
      const r = await fetch('/cabinet/api/finance/balances', { credentials: 'same-origin' });
      const d = await r.json();
      if (!d || !d.ok) return;
      const b = d.balances || {};
      const m = (x) => Number(((x || {}).usd) || 0);
      const k = Number(((b.karma) || {}).points || 0);
      const stats = {
        working: { val: m(b.working), money: true },
        gift:    { val: m(b.gift),    money: true },
        karma:   { val: k,            money: false },
        subscription: { val: m(b.subscription), money: true },
      };
      Object.keys(stats).forEach(key => {
        const el = hero.querySelector(`[data-stat="${key}"]`);
        if (el) countUp(el, stats[key].val, { money: stats[key].money });
      });
      // [hero-3d-cards-2026-05-21] subscription progress bar
      const prog = hero.querySelector('[data-stat-prog="subscription"]');
      if (prog) {
        const p = Math.max(0, Math.min(100, Number((b.subscription || {}).progress) || 0));
        prog.style.width = p + '%';
      }
      // karma unit
      const kEl = hero.querySelector('[data-stat="karma"]');
      if (kEl && !kEl.querySelector('.unit')) kEl.innerHTML = kEl.textContent + '<span class="unit">пт</span>';
      // Tariff in subscription delta
      if (d.tariff && d.tariff.code) {
        const td = hero.querySelector('[data-stat-delta="subscription"]');
        if (td) {
          td.textContent = (d.tariff.code || 'free').toUpperCase();
          td.classList.add(d.tariff.code === 'free' ? '' : 'pos');
        }
      }
    } catch (e) {
      console.warn('[v3-hero] balances fetch failed', e && e.message);
    }
  }

  /* ═══════════ MOUNTING — auto on dashboard activation ═══════════ */
  let activeNetwork = null;
  let activeHero = null;
  function mount() {
    const dash = document.getElementById('page-dashboard');
    if (!dash) return;
    // If a real dashboard inner exists, prepend hero above all
    if (dash.querySelector('.v3-hero')) return;

    const hero = buildHero();
    // Insert as the very first child of dashboard
    dash.insertBefore(hero, dash.firstChild);
    activeHero = hero;

    // Init canvas
    const canvas = hero.querySelector('[data-v3-canvas]');
    if (canvas) {
      try { activeNetwork = new ParticleNetwork(canvas); }
      catch (e) { console.warn('[v3-hero] canvas init failed', e); }
    }

    // Fetch stats
    populateStats(hero);

    // [v3-polish] If we rendered 'друг' fallback, poll window.me up to 3s
    // and swap once a real name appears.
    if (!resolveName()) {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        const real = resolveName();
        if (real) {
          const greet = hero.querySelector('.v3-hero-greeting');
          if (greet) {
            const text = greet.textContent || '';
            const replaced = text.replace(/, друг$/, ', ' + real);
            greet.textContent = replaced !== text ? replaced : text;
          }
          clearInterval(iv);
        } else if (tries > 30) {
          clearInterval(iv);
        }
      }, 100);
    }

    // [v3-polish] Hide legacy duplicate "Балансы" section if it exists below
    // so user doesn't see the same 4 numbers twice.
    setTimeout(() => {
      const dash = document.getElementById('page-dashboard');
      if (!dash) return;
      dash.querySelectorAll('.cab-card').forEach(card => {
        const txt = (card.textContent || '').trim();
        if (/^Балансы\b/i.test(txt) || /Working balance.*Gift balance.*Karma.*Subscription/i.test(txt)) {
          card.style.display = 'none';
        }
        // Hide the dashboard hero card that says greeting again
        if (card.querySelector('#dash-balances') || card.querySelector('[id^=dashGreet]')) {
          card.style.display = 'none';
        }
      });
      // Also hide any element with id="dash-balances" specifically
      const oldBalances = document.getElementById('dash-balances');
      if (oldBalances) {
        const wrap = oldBalances.closest('.cab-card') || oldBalances;
        wrap.style.display = 'none';
      }
    }, 600);
  }
  function unmount() {
    if (activeNetwork) { activeNetwork.destroy(); activeNetwork = null; }
    if (activeHero && activeHero.parentNode) activeHero.parentNode.removeChild(activeHero);
    activeHero = null;
  }

  // Mount when dashboard is active (initial + on goPage)
  function checkMount() {
    const dash = document.getElementById('page-dashboard');
    const onDash = dash && dash.classList.contains('active');
    if (onDash && !activeNetwork) {
      mount();
    } else if (!onDash && activeNetwork) {
      // Pause canvas when not visible (save CPU)
      activeNetwork.running = false;
    } else if (onDash && activeNetwork && !activeNetwork.running) {
      // Resume
      activeNetwork.running = true;
      requestAnimationFrame(activeNetwork.tick);
    }
  }

  // Initial mount after a tick (let cabinet boot first)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(checkMount, 500), { once: true });
  } else {
    setTimeout(checkMount, 500);
  }

  // Hook into goPage / activatePage to re-evaluate mount
  const origGoPage = window.goPage;
  if (typeof origGoPage === 'function' && !origGoPage.__v3HeroHooked) {
    window.goPage = function (page) {
      const r = origGoPage.apply(this, arguments);
      setTimeout(checkMount, 100);
      setTimeout(checkMount, 600);
      return r;
    };
    window.goPage.__v3HeroHooked = true;
  } else {
    // Polling fallback if goPage isn't ready yet
    let tries = 0;
    const iv = setInterval(() => {
      if (typeof window.goPage === 'function' && !window.goPage.__v3HeroHooked) {
        const orig = window.goPage;
        window.goPage = function (page) {
          const r = orig.apply(this, arguments);
          setTimeout(checkMount, 100);
          setTimeout(checkMount, 600);
          return r;
        };
        window.goPage.__v3HeroHooked = true;
        clearInterval(iv);
      }
      if (++tries > 80) clearInterval(iv);
    }, 100);
  }

  // Expose for manual remount if needed
  window.__v3Hero = { mount, unmount, checkMount };
})();
