/* Golden Connect cabinet — global starfield background
 * Injects a fixed <canvas> behind all content and runs a lightweight particle
 * network. Visible on every page, not just dashboard hero.
 *
 * Activated via <body class="ui-v3"> (same opt-in flag as v3 design system).
 */
(function () {
  'use strict';
  if (!document.body || !document.body.classList || !document.body.classList.contains('ui-v3')) return;
  if (document.getElementById('global-starfield')) return; // already mounted

  const canvas = document.createElement('canvas');
  canvas.id = 'global-starfield';
  canvas.style.cssText = [
    'position: fixed',
    'inset: 0',
    'width: 100vw',
    'height: 100vh',
    'pointer-events: none',
    'z-index: 0',
    'opacity: 0.55',
  ].join(';');
  // Insert as first child of body so it sits behind everything else (sidebar,
  // main content, modals all have z-index >= 1).
  document.body.insertBefore(canvas, document.body.firstChild);

  /* Lightweight particle network — fewer particles than the hero canvas so
   * full-viewport doesn't cost too much CPU. */
  class GlobalStarfield {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
      this.maxDist = 130;
      this.mouse = { x: -9999, y: -9999, radius: 100 };
      this.lastFrame = 0;
      this.resize();
      this.bind();
      this.animate();
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = window.innerWidth * dpr;
      this.canvas.height = window.innerHeight * dpr;
      this.canvas.style.width = window.innerWidth + 'px';
      this.canvas.style.height = window.innerHeight + 'px';
      this.ctx.scale(dpr, dpr);
      // density: ~1 particle per 14000 px², capped
      const count = Math.min(110, Math.floor((window.innerWidth * window.innerHeight) / 14000));
      this.particles = [];
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          r: Math.random() * 1.4 + 0.4,
          hue: Math.random() < 0.5 ? 280 : 190,
        });
      }
    }
    bind() {
      window.addEventListener('resize', () => this.resize(), { passive: true });
      window.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
      }, { passive: true });
      window.addEventListener('mouseleave', () => {
        this.mouse.x = -9999;
        this.mouse.y = -9999;
      });
      // Pause when tab is hidden (saves battery)
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.paused = true;
        else { this.paused = false; this.animate(); }
      });
    }
    animate() {
      if (this.paused) return;
      const w = window.innerWidth, h = window.innerHeight;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, w, h);

      // Move + draw particles
      for (const p of this.particles) {
        // Mouse repulsion
        const mdx = p.x - this.mouse.x;
        const mdy = p.y - this.mouse.y;
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < this.mouse.radius && md > 0) {
          const force = (this.mouse.radius - md) / this.mouse.radius;
          p.vx += (mdx / md) * force * 0.25;
          p.vy += (mdy / md) * force * 0.25;
        }
        p.x += p.vx; p.y += p.vy;
        // Drag
        p.vx *= 0.985; p.vy *= 0.985;
        // Add tiny drift so particles never freeze
        if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.05;
        if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.05;
        // Wrap edges
        if (p.x < 0) p.x = w; else if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h; else if (p.y > h) p.y = 0;
        // Draw glow
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, 0.9)`;
        ctx.shadowColor = `hsla(${p.hue}, 100%, 60%, 0.8)`;
        ctx.shadowBlur = 6;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      // Lines between near particles
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const a = this.particles[i], b = this.particles[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < this.maxDist) {
            const alpha = (1 - d / this.maxDist) * 0.3;
            ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 100%, 65%, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      requestAnimationFrame(() => this.animate());
    }
  }

  new GlobalStarfield(canvas);
})();
