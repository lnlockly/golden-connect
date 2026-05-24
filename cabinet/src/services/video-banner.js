/**
 * Video Banner Generator API v2
 * POST /api/video-banner/generate  — start generation
 * GET  /api/video-banner/status/:id — check status / download
 * GET  /api/video-banner/templates  — list templates
 */
// Adapted from Golden Connect banner-webapp for Golden Connect (cabinet/src/services/video-banner.js).
// Self-contained service: TEMPLATES + STYLES + renderers, no express router.
// Exports: generateVideo(templateId, params) → { id, path, mp4_url, file_size, width, height }
//          listTemplates() → array of { id, name, description, category, defaults }
const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

// Golden Connect: store output on PVC at /data/banners
const OUTPUT_DIR = process.env.VIDEO_BANNER_DIR || '/data/banners';
try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); } catch (_) {}

// Use system Chromium (Alpine pkg "chromium") — set via PUPPETEER_EXECUTABLE_PATH
const CHROMIUM_PATH = process.env.PUPPETEER_EXECUTABLE_PATH ||
  (fs.existsSync('/usr/bin/chromium-browser') ? '/usr/bin/chromium-browser' :
   fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

const jobs = new Map();
let activeJobs = 0;
const MAX_CONCURRENT = 3;

// Cleanup old jobs every 10 min
setInterval(() => {
  const cutoff = Date.now() - 30 * 60000;
  for (const [id, j] of jobs) {
    if (j.createdAt < cutoff) jobs.delete(id);
  }
}, 600000);

// ═══════════════════════════════════════════════════════════
// STYLE PRESETS — different visual themes
// ═══════════════════════════════════════════════════════════

const STYLES = {
  // 1. Dark purple (original)
  darkPurple: {
    bg: '#080014',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(139,92,246,0.20) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(236,72,153,0.16) 0%, transparent 60%),
      linear-gradient(160deg, #080014 0%, #0d0030 40%, #080020 70%, #080014 100%)`,
    gridColor: 'rgba(139,92,246,0.06)',
    orbs: [
      { color: '#7c3aed', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#db2777', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#0891b2', pos: 'top:20%;right:-5%', size: '30%' }
    ],
    accent: '#c084fc', accentAlt: '#f472b6',
    text: '#f0eaff', textMuted: 'rgba(240,234,255,0.6)',
    particleColor: 'rgba(192,132,252,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#c084fc 40%,#f472b6 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#7c3aed,#db2777)',
    btnShadow: 'rgba(124,58,237,0.5)'
  },

  // 2. Ocean blue
  oceanBlue: {
    bg: '#020c1b',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 10% 0%, rgba(6,182,212,0.25) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 90% 100%, rgba(59,130,246,0.20) 0%, transparent 60%),
      linear-gradient(160deg, #020c1b 0%, #0a1628 40%, #041225 70%, #020c1b 100%)`,
    gridColor: 'rgba(6,182,212,0.06)',
    orbs: [
      { color: '#0891b2', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#3b82f6', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#06b6d4', pos: 'top:30%;right:-10%', size: '30%' }
    ],
    accent: '#22d3ee', accentAlt: '#60a5fa',
    text: '#e0f2fe', textMuted: 'rgba(224,242,254,0.6)',
    particleColor: 'rgba(34,211,238,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#22d3ee 40%,#60a5fa 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#0891b2,#3b82f6)',
    btnShadow: 'rgba(8,145,178,0.5)'
  },

  // 3. Emerald green
  emeraldGreen: {
    bg: '#021a0a',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(16,185,129,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(34,197,94,0.18) 0%, transparent 60%),
      linear-gradient(160deg, #021a0a 0%, #042f16 40%, #031f0e 70%, #021a0a 100%)`,
    gridColor: 'rgba(16,185,129,0.06)',
    orbs: [
      { color: '#10b981', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#22c55e', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#059669', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#34d399', accentAlt: '#4ade80',
    text: '#ecfdf5', textMuted: 'rgba(236,253,245,0.6)',
    particleColor: 'rgba(52,211,153,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#34d399 40%,#4ade80 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#10b981,#22c55e)',
    btnShadow: 'rgba(16,185,129,0.5)'
  },

  // 4. Sunset orange
  sunsetOrange: {
    bg: '#1a0a00',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(249,115,22,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(239,68,68,0.18) 0%, transparent 60%),
      linear-gradient(160deg, #1a0a00 0%, #2d1200 40%, #1f0d00 70%, #1a0a00 100%)`,
    gridColor: 'rgba(249,115,22,0.06)',
    orbs: [
      { color: '#f97316', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#ef4444', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#eab308', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#fb923c', accentAlt: '#f87171',
    text: '#fff7ed', textMuted: 'rgba(255,247,237,0.6)',
    particleColor: 'rgba(251,146,60,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#fb923c 40%,#f87171 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#f97316,#ef4444)',
    btnShadow: 'rgba(249,115,22,0.5)'
  },

  // 5. Rose gold
  roseGold: {
    bg: '#1a0812',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(244,114,182,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(251,191,36,0.16) 0%, transparent 60%),
      linear-gradient(160deg, #1a0812 0%, #2d0f20 40%, #1f0a18 70%, #1a0812 100%)`,
    gridColor: 'rgba(244,114,182,0.06)',
    orbs: [
      { color: '#f472b6', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#fbbf24', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#e879f9', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#f9a8d4', accentAlt: '#fcd34d',
    text: '#fdf2f8', textMuted: 'rgba(253,242,248,0.6)',
    particleColor: 'rgba(249,168,212,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#f9a8d4 40%,#fcd34d 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#ec4899,#f59e0b)',
    btnShadow: 'rgba(236,72,153,0.5)'
  },

  // 6. Neon cyber
  neonCyber: {
    bg: '#000a0a',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(0,255,136,0.15) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(0,200,255,0.15) 0%, transparent 60%),
      linear-gradient(160deg, #000a0a 0%, #001a1a 40%, #000f0f 70%, #000a0a 100%)`,
    gridColor: 'rgba(0,255,136,0.08)',
    orbs: [
      { color: '#00ff88', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#00c8ff', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#ff00aa', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#00ff88', accentAlt: '#00c8ff',
    text: '#e0fff0', textMuted: 'rgba(224,255,240,0.6)',
    particleColor: 'rgba(0,255,136,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#00ff88 40%,#00c8ff 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#00cc6a,#0099cc)',
    btnShadow: 'rgba(0,255,136,0.5)'
  },

  // 7. Minimal light
  minimalLight: {
    bg: '#f8fafc',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(99,102,241,0.08) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(236,72,153,0.06) 0%, transparent 60%),
      linear-gradient(160deg, #f8fafc 0%, #eef2ff 40%, #f0f4ff 70%, #f8fafc 100%)`,
    gridColor: 'rgba(99,102,241,0.06)',
    orbs: [
      { color: '#c7d2fe', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#fce7f3', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#cffafe', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#6366f1', accentAlt: '#ec4899',
    text: '#1e293b', textMuted: 'rgba(30,41,59,0.5)',
    particleColor: 'rgba(99,102,241,0.3)',
    gradText: 'linear-gradient(135deg,#1e293b 0%,#6366f1 40%,#ec4899 70%,#1e293b 100%)',
    btnGrad: 'linear-gradient(135deg,#6366f1,#ec4899)',
    btnShadow: 'rgba(99,102,241,0.3)'
  },

  // 8. Warm dark
  warmDark: {
    bg: '#1c1008',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(217,119,6,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(180,83,9,0.14) 0%, transparent 60%),
      linear-gradient(160deg, #1c1008 0%, #2a1a0e 40%, #201209 70%, #1c1008 100%)`,
    gridColor: 'rgba(217,119,6,0.06)',
    orbs: [
      { color: '#d97706', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#b45309', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#f59e0b', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#fbbf24', accentAlt: '#f59e0b',
    text: '#fef3c7', textMuted: 'rgba(254,243,199,0.6)',
    particleColor: 'rgba(251,191,36,0.4)',
    gradText: 'linear-gradient(135deg,#fff 0%,#fbbf24 40%,#f59e0b 70%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#d97706,#b45309)',
    btnShadow: 'rgba(217,119,6,0.5)'
  },

  // 9. Casino Gold
  casinoGold: {
    bg: '#0a0500',
    bodyBefore: `radial-gradient(ellipse 80% 60% at 0% 0%, rgba(212,175,55,0.20) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 100% 100%, rgba(180,30,30,0.22) 0%, transparent 60%),
      linear-gradient(160deg, #0a0500 0%, #160b00 40%, #0d0600 70%, #0a0500 100%)`,
    gridColor: 'rgba(212,175,55,0.07)',
    orbs: [
      { color: '#d4af37', pos: 'top:-15%;left:-10%', size: '50%' },
      { color: '#b41e1e', pos: 'bottom:-10%;right:-5%', size: '40%' },
      { color: '#f5c518', pos: 'top:25%;right:-8%', size: '30%' }
    ],
    accent: '#f5c518', accentAlt: '#e53e3e',
    text: '#fff8e1', textMuted: 'rgba(255,248,225,0.6)',
    particleColor: 'rgba(245,197,24,0.5)',
    gradText: 'linear-gradient(135deg,#fff 0%,#f5c518 35%,#ffd700 55%,#e53e3e 80%,#fff 100%)',
    btnGrad: 'linear-gradient(135deg,#c8940a,#e53e3e)',
    btnShadow: 'rgba(212,175,55,0.6)'
  }
};

// ═══════════════════════════════════════════════════════════
// CSS GENERATOR — builds CSS from style preset
// ═══════════════════════════════════════════════════════════

function buildCSS(w, h, style, customBg) {
  const s = STYLES[style] || STYLES.darkPurple;
  const bg = customBg || s.bg;
  const isLight = style === 'minimalLight';

  return `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: ${w}px; height: ${h}px; overflow: hidden;
  font-family: 'Segoe UI', system-ui, -apple-system, 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
  color: ${s.text}; background: ${bg}; position: relative;
}
body::before {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background: ${s.bodyBefore};
}
body::after {
  content: ''; position: absolute; inset: 0; z-index: 0;
  background-image:
    linear-gradient(${s.gridColor} 1px, transparent 1px),
    linear-gradient(90deg, ${s.gridColor} 1px, transparent 1px);
  background-size: 30px 30px;
  animation: gridScroll 12s linear infinite;
}
@keyframes gridScroll { 0%{background-position:0 0} 100%{background-position:30px 30px} }
.orb { position:absolute; border-radius:50%; filter:blur(50px); opacity:0.35; z-index:1; }
${s.orbs.map((o, i) => `.orb-${i+1} { width:${o.size};height:${o.size};background:${o.color};${o.pos}; animation:of${i+1} ${6+i*2}s ease-in-out infinite alternate; }`).join('\n')}
@keyframes of1 { from{transform:translate(0,0) scale(1)} to{transform:translate(12px,-18px) scale(1.12)} }
@keyframes of2 { from{transform:translate(0,0) scale(1)} to{transform:translate(-8px,12px) scale(1.08)} }
@keyframes of3 { from{transform:translate(0,0) scale(1)} to{transform:translate(8px,-8px) scale(1.1)} }
.particles { position:absolute; inset:0; z-index:1; overflow:hidden; pointer-events:none; }
.particle {
  position:absolute; width:2px; height:2px;
  background:${s.particleColor}; border-radius:50%;
  animation: particleRise linear infinite;
}
.particle:nth-child(1){left:8%;animation-duration:7s;animation-delay:0s;}
.particle:nth-child(2){left:22%;animation-duration:9s;animation-delay:1s;width:3px;height:3px;}
.particle:nth-child(3){left:42%;animation-duration:6s;animation-delay:2s;}
.particle:nth-child(4){left:62%;animation-duration:8s;animation-delay:0.5s;}
.particle:nth-child(5){left:78%;animation-duration:7.5s;animation-delay:1.5s;}
.particle:nth-child(6){left:92%;animation-duration:6.5s;animation-delay:3s;width:3px;height:3px;}
@keyframes particleRise { 0%{bottom:-5px;opacity:0} 10%{opacity:0.7} 90%{opacity:0.2} 100%{bottom:110%;opacity:0} }
@keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
@keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
@keyframes logoPulse {
  0%,100% { box-shadow: 0 0 30px ${s.btnShadow}, 0 0 60px ${s.btnShadow}; }
  50%     { box-shadow: 0 0 50px ${s.accent}, 0 0 90px ${s.btnShadow}; }
}
.content { position:relative; z-index:2; width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:5%; text-align:center; }
.grad-text {
  font-weight:900; letter-spacing:-0.5px; line-height:1;
  background:${s.gradText};
  background-size:200% 200%;
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
  background-clip:text; animation:gradShift 4s ease-in-out infinite;
}
.logo-box {
  background:${s.btnGrad}; border-radius:20%;
  display:flex; align-items:center; justify-content:center;
  box-shadow:0 0 30px ${s.btnShadow}; animation:logoPulse 3s ease-in-out infinite;
}
.qr-wrap { position:relative; }
.qr-ring {
  position:absolute; inset:-4px; border-radius:16px;
  background:conic-gradient(from 0deg,${s.accent},${s.accentAlt},${s.accent});
  z-index:0; animation:ringRot 3s linear infinite;
}
@keyframes ringRot { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
.qr-inner {
  position:relative; z-index:1; background:#fff; border-radius:12px; padding:4%;
  box-shadow:0 0 30px ${s.btnShadow};
  animation:qrPulse 2s ease-in-out infinite;
}
@keyframes qrPulse {
  0%,100%{box-shadow:0 0 30px ${s.btnShadow};}
  50%{box-shadow:0 0 45px ${s.accentAlt}80;}
}
.qr-inner img { display:block; width:100%; height:100%; image-rendering:pixelated; }
.ticker-wrap { width:100%; overflow:hidden; position:relative; }
.ticker-wrap::before,.ticker-wrap::after {
  content:''; position:absolute; left:0; right:0; height:30%; z-index:3; pointer-events:none;
}
.ticker-wrap::before { top:0; background:linear-gradient(to bottom,${bg},transparent); }
.ticker-wrap::after  { bottom:0; background:linear-gradient(to top,${bg},transparent); }
.ticker { display:flex; flex-direction:column; }
.ticker-item {
  display:flex; align-items:center; gap:3%; padding:1.5% 4%; flex-shrink:0;
  font-weight:600; white-space:nowrap;
}
.ticker-text {
  background:linear-gradient(90deg,${isLight ? '#334155' : '#e0d4ff'} 0%,${s.accent} 100%);
  -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
}
.chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3% 5%; background:${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)'};
  border:1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.12)'}; border-radius:100px;
  font-weight:600; color:${s.text};
}
.cta-btn {
  padding:3% 8%; background:${s.btnGrad};
  border:none; border-radius:12px; color:#fff; font-weight:700;
  text-decoration:none; display:inline-block;
  box-shadow:0 0 20px ${s.btnShadow};
  animation:btnPulse 2.5s ease-in-out infinite;
}
@keyframes btnPulse {
  0%,100%{box-shadow:0 0 20px ${s.btnShadow};}
  50%{box-shadow:0 0 40px ${s.accentAlt}90;}
}
`;
}

function orbsHTML(style) {
  const s = STYLES[style] || STYLES.darkPurple;
  return s.orbs.map((_, i) => `<div class="orb orb-${i+1}"></div>`).join('');
}

function particlesHTML() {
  return '<div class="particles">' + Array(6).fill('<div class="particle"></div>').join('') + '</div>';
}

// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════
const TEMPLATES = {

  // ── 1. Service Ticker (QR + scrolling features list) ──
  'service-ticker': {
    name: 'Service Ticker',
    description: 'QR-код + скроллинг услуг — идеален для ботов и сервисов',
    category: 'universal',
    defaults: {
      title: 'Your Brand',
      subtitle: 'Описание сервиса',
      qr_url: 'https://example.com',
      bot_name: 'example.com',
      services: ['✅ Функция 1','✅ Функция 2','✅ Функция 3','✅ Функция 4','✅ Функция 5','✅ Функция 6'],
      stats: ['PRO','FREE','24/7','NEW'],
      style: 'darkPurple',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderTicker(p)
  },

  // ── 2. Big Sale — скидка / распродажа ──
  'big-sale': {
    name: 'Big Sale',
    description: 'Яркий баннер со скидкой, features + CTA',
    category: 'ecommerce',
    defaults: {
      title: '-50%',
      subtitle: 'Только сегодня!',
      brand: 'YOUR BRAND',
      cta: '🛒 Купить сейчас',
      features: ['✅ Бесплатная доставка','⭐ Гарантия качества','🔥 Хит продаж','💎 Премиум'],
      qr_url: '',
      style: 'sunsetOrange',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderSale(p)
  },

  // ── 3. Event Countdown ──
  'event-countdown': {
    name: 'Event Countdown',
    description: 'Баннер мероприятия с обратным отсчётом',
    category: 'event',
    defaults: {
      title: 'WEBINAR',
      subtitle: 'Как заработать на AI',
      date: '15 марта 2026',
      time: '19:00 МСК',
      speaker: 'Спикер: AI Expert',
      cta: '📋 Зарегистрироваться',
      qr_url: '',
      style: 'oceanBlue',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderEvent(p)
  },

  // ── 4. Profile Card — визитка ──
  'profile-card': {
    name: 'Profile Card',
    description: 'Анимированная цифровая визитка',
    category: 'personal',
    defaults: {
      name: 'John Doe',
      role: 'Digital Marketer',
      avatar_emoji: '👨‍💻',
      links: ['📸 Instagram','▶️ YouTube','💬 Telegram','🌐 Website'],
      qr_url: '',
      stats: ['10K+ подписчиков','500+ проектов','5 лет опыта'],
      style: 'roseGold',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderProfile(p)
  },

  // ── 5. Features Grid — сетка преимуществ ──
  'features-grid': {
    name: 'Features Grid',
    description: 'Сетка 2×3 с иконками и текстом — для продукта',
    category: 'universal',
    defaults: {
      title: 'Your Product',
      subtitle: 'Почему выбирают нас',
      features: [
        { icon: '⚡', label: 'Быстрый' },
        { icon: '🔒', label: 'Безопасный' },
        { icon: '🌍', label: 'Глобальный' },
        { icon: '💰', label: 'Выгодный' },
        { icon: '🤖', label: 'AI-powered' },
        { icon: '📱', label: 'Мобильный' }
      ],
      cta: '🚀 Попробовать',
      qr_url: '',
      style: 'emeraldGreen',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderFeaturesGrid(p)
  },

  // ── 6. Testimonial — отзыв клиента ──
  'testimonial': {
    name: 'Testimonial',
    description: 'Отзыв клиента с аватаром и рейтингом',
    category: 'social',
    defaults: {
      quote: 'Лучший сервис! Сэкономил мне кучу времени и денег. Рекомендую всем!',
      author: 'Мария И.',
      role: 'Предприниматель',
      avatar_emoji: '👩‍💼',
      rating: 5,
      brand: 'Your Brand',
      qr_url: '',
      style: 'warmDark',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderTestimonial(p)
  },

  // ── 7. Stats Counter — анимированные цифры ──
  'stats-counter': {
    name: 'Stats Counter',
    description: 'Анимированные счётчики достижений',
    category: 'universal',
    defaults: {
      title: 'Your Brand',
      counters: [
        { value: '10K+', label: 'Клиентов' },
        { value: '99%', label: 'Довольны' },
        { value: '24/7', label: 'Поддержка' },
        { value: '50+', label: 'Стран' }
      ],
      cta: '🚀 Присоединиться',
      qr_url: '',
      style: 'neonCyber',
      bg_color: '',
      duration: 10, size: '300x300'
    },
    render: async (p) => renderStatsCounter(p)
  },

  // ── 8. Comparison — до/после или vs ──
  'comparison': {
    name: 'Before / After',
    description: 'Сравнение — до и после, или наш vs конкурент',
    category: 'marketing',
    defaults: {
      title: 'Почему мы?',
      left_label: '❌ Без нас',
      right_label: '✅ С нами',
      left_items: ['Долго','Дорого','Сложно','Без поддержки'],
      right_items: ['Мгновенно','Бесплатно','Просто','24/7 чат'],
      cta: '🚀 Начать',
      qr_url: '',
      style: 'oceanBlue',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderComparison(p)
  },

  // ── 9. CTA Pulse — один мощный призыв ──
  'cta-pulse': {
    name: 'CTA Pulse',
    description: 'Минимализм — один большой CTA с пульсом',
    category: 'marketing',
    defaults: {
      headline: 'Начни бесплатно',
      subline: 'Регистрация за 30 секунд',
      cta: '🚀 Попробовать бесплатно',
      qr_url: '',
      badge: 'FREE',
      style: 'minimalLight',
      bg_color: '',
      duration: 8, size: '300x300'
    },
    render: async (p) => renderCtaPulse(p)
  },

  // ── 10. Carousel — слайды с товарами/услугами ──
  'carousel': {
    name: 'Carousel',
    description: 'Слайд-шоу — 4 карточки товаров/услуг',
    category: 'ecommerce',
    defaults: {
      brand: 'Your Brand',
      slides: [
        { emoji: '🎨', title: 'Дизайн', desc: 'Профессиональный дизайн' },
        { emoji: '📊', title: 'Аналитика', desc: 'Данные в реальном времени' },
        { emoji: '🤖', title: 'AI', desc: 'Умная автоматизация' },
        { emoji: '🔒', title: 'Безопасность', desc: 'Шифрование данных' }
      ],
      cta: '🚀 Подробнее',
      qr_url: '',
      style: 'darkPurple',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderCarousel(p)
  },


  // ── 13. Casino Promo ──
  'casino-promo': {
    name: 'Casino Promo',
    description: 'Казино баннер: бонус, слоты, QR-код + CTA',
    category: 'casino',
    defaults: {
      brand: 'CASINO',
      bonus: '100% + 200 FS',
      bonus_sub: 'на первый депозит',
      min_dep: 'Мин. депозит: 500 ₽',
      features: ['🎰 Слоты','🃏 Live Casino','⚽ Ставки','💸 Быстрые выплаты'],
      cta: '🎁 Получить бонус',
      qr_url: '',
      games: ['🎰','🃏','🎲','💎','🏆'],
      style: 'casinoGold',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderCasino(p)
  },


  // ── universal: Typewriter ──
  'typewriter': {
    name: 'Typewriter',
    description: 'Анимированный печатающий текст — AI/tech стиль',
    category: 'universal',
    defaults: {
      brand: 'Your Brand',
      lines: ['Автоматизация бизнеса','AI-инструменты','Рост продаж','Экономия времени'],
      sub: 'Попробуй прямо сейчас',
      cta: '🚀 Начать бесплатно',
      qr_url: '',
      style: 'neonCyber', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderTypewriter(p)
  },

  // ── universal: Gradient Announce ──
  'gradient-announce': {
    name: 'Gradient Announce',
    description: 'Яркий анонс с градиентом и частицами',
    category: 'universal',
    defaults: {
      headline: '🔥 Это изменит всё',
      sub: 'Новый уровень вашего бизнеса',
      badge: 'NEW',
      points: ['⚡ Быстро','💎 Качественно','🤖 AI-powered'],
      cta: '👉 Узнать больше',
      qr_url: '',
      style: 'darkPurple', bg_color: '', duration: 10, size: '300x300'
    },
    render: async (p) => renderGradientAnnounce(p)
  },

  // ── ecommerce: Flash Deal ──
  'flash-deal': {
    name: 'Flash Deal',
    description: 'Флэш-распродажа с таймером и молнией',
    category: 'ecommerce',
    defaults: {
      brand: 'STORE',
      discount: '-70%',
      old_price: '9 990 ₽',
      new_price: '2 990 ₽',
      label: '⚡ ФЛЭШ-РАСПРОДАЖА',
      cta: '🛒 Купить сейчас',
      qr_url: '',
      style: 'sunsetOrange', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderFlashDeal(p)
  },

  // ── ecommerce: Product Card ──
  'product-card': {
    name: 'Product Card',
    description: 'Карточка товара: иконка, цена, рейтинг, CTA',
    category: 'ecommerce',
    defaults: {
      brand: 'SHOP',
      product: 'Premium Package',
      emoji: '📦',
      price: '4 990 ₽',
      old_price: '9 990 ₽',
      stars: 5,
      reviews: '2 341 отзыв',
      badges: ['✅ Гарантия','🚚 Доставка','🔒 Безопасно'],
      cta: '🛒 В корзину',
      qr_url: '',
      style: 'emeraldGreen', bg_color: '', duration: 10, size: '300x300'
    },
    render: async (p) => renderProductCard(p)
  },

  // ── event: Live Now ──
  'live-now': {
    name: 'Live Now',
    description: 'LIVE-трансляция: пульсирующий бейдж, просмотры',
    category: 'event',
    defaults: {
      title: 'Прямой эфир',
      sub: 'Открытый разбор бизнеса',
      host: 'Алексей Иванов',
      viewers: '1 247',
      platform: '▶️ YouTube',
      cta: '👉 Смотреть сейчас',
      qr_url: '',
      style: 'warmDark', bg_color: '', duration: 10, size: '300x300'
    },
    render: async (p) => renderLiveNow(p)
  },

  // ── event: Conference ──
  'conference': {
    name: 'Conference',
    description: 'Конференция: спикеры, дата, место',
    category: 'event',
    defaults: {
      title: 'Digital Summit',
      date: '20 апреля 2026',
      location: '📍 Москва + Online',
      speakers: ['👤 Спикер 1','👤 Спикер 2','👤 Спикер 3'],
      topics: ['AI','Marketing','Growth'],
      cta: '🎟️ Зарегистрироваться',
      qr_url: '',
      style: 'oceanBlue', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderConference(p)
  },

  // ── personal: Skills Card ──
  'skills-card': {
    name: 'Skills Card',
    description: 'Прогресс-бары навыков — резюме/портфолио',
    category: 'personal',
    defaults: {
      name: 'Иван Петров',
      role: 'Full-Stack Developer',
      avatar_emoji: '👨‍💻',
      skills: [
        { name: 'JavaScript', pct: 95 },
        { name: 'React', pct: 88 },
        { name: 'Node.js', pct: 82 },
        { name: 'Design', pct: 70 }
      ],
      cta: '💼 Портфолио',
      qr_url: '',
      style: 'oceanBlue', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderSkillsCard(p)
  },

  // ── personal: Achievements ──
  'achievements': {
    name: 'Achievements',
    description: 'Разблокируемые достижения — геймификация',
    category: 'personal',
    defaults: {
      name: 'Your Brand',
      achievements: [
        { icon: '🏆', label: 'Топ продаж', unlocked: true },
        { icon: '⭐', label: 'Рейтинг 5★', unlocked: true },
        { icon: '🚀', label: '100K клиентов', unlocked: true },
        { icon: '💎', label: 'Премиум', unlocked: true },
        { icon: '🌍', label: '50 стран', unlocked: false },
        { icon: '🤖', label: 'AI Expert', unlocked: false }
      ],
      cta: '🏅 Присоединиться',
      qr_url: '',
      style: 'roseGold', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderAchievements(p)
  },

  // ── social: Social Proof ──
  'social-proof': {
    name: 'Social Proof',
    description: 'Доверие: рейтинг, цифры, логотипы клиентов',
    category: 'social',
    defaults: {
      headline: '50,000+ довольных клиентов',
      rating: '4.9',
      reviews_count: '12 847 отзывов',
      logos: ['Google','Apple','Meta','Amazon'],
      quote: 'Лучший сервис года!',
      cta: '✅ Попробовать',
      qr_url: '',
      style: 'minimalLight', bg_color: '', duration: 10, size: '300x300'
    },
    render: async (p) => renderSocialProof(p)
  },

  // ── social: Giveaway ──
  'giveaway': {
    name: 'Giveaway',
    description: 'Розыгрыш призов с анимацией конфетти',
    category: 'social',
    defaults: {
      title: '🎉 РОЗЫГРЫШ',
      prize: 'iPhone 16 Pro',
      prize_value: 'стоимостью 120 000 ₽',
      steps: ['👍 Подписаться','🔁 Репостнуть','💬 Отметить друга'],
      ends: '31 марта',
      cta: '🎁 Участвовать',
      qr_url: '',
      style: 'roseGold', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderGiveaway(p)
  },

  // ── marketing: Lead Magnet ──
  'lead-magnet': {
    name: 'Lead Magnet',
    description: 'Бесплатный лид-магнит: гайд, чеклист, PDF',
    category: 'marketing',
    defaults: {
      label: '🆓 БЕСПЛАТНО',
      title: 'Гайд: 10 способов\nвырасти в 2026',
      value: 'Обычная цена: 3 990 ₽',
      includes: ['✅ PDF 47 страниц','✅ Шаблоны','✅ Чеклист','✅ Видео-бонус'],
      cta: '📥 Скачать бесплатно',
      qr_url: '',
      style: 'emeraldGreen', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderLeadMagnet(p)
  },

  // ── marketing: Urgency Offer ──
  'urgency-offer': {
    name: 'Urgency Offer',
    description: 'Дефицит + срочность: счётчик мест, прогресс',
    category: 'marketing',
    defaults: {
      label: '🔥 ПОСЛЕДНИЙ ШАНС',
      title: 'Закрытый клуб',
      sub: 'Осталось мест',
      spots_left: 7,
      spots_total: 100,
      benefit: '💰 Экономия 50,000 ₽',
      deadline: 'Закрытие через 48 часов',
      cta: '🚀 Занять место',
      qr_url: '',
      style: 'darkPurple', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderUrgencyOffer(p)
  },

  // ── casino: Jackpot Slots ──
  'jackpot-slots': {
    name: 'Jackpot Slots',
    description: 'Слот-машина с джекпотом и крутящимися барабанами',
    category: 'casino',
    defaults: {
      brand: 'SLOTS VIP',
      jackpot: '🏆 ДЖЕКПОТ',
      amount: '5,000,000 ₽',
      reels: ['🍒','💎','🎰'],
      sub: 'Каждый день новые победители',
      cta: '🎰 Крутить бесплатно',
      qr_url: '',
      style: 'casinoGold', bg_color: '', duration: 12, size: '300x300'
    },
    render: async (p) => renderJackpotSlots(p)
  },

  // ── 11. TokGram Promo (preset) ──
  'tokgram-promo': {
    name: 'TokGram Promo',
    description: 'QR + бот + услуги в тикере',
    category: 'preset',
    defaults: {
      title: 'TokGram',
      subtitle: 'Все инструменты для контент-мейкеров',
      qr_url: 'https://t.me/TokGramT2Gbot',
      bot_name: '@TokGramT2Gbot',
      services: ['🎵 Скачать TikTok','▶️ Скачать YouTube','📸 Скачать Instagram','💙 Скачать VK','🎬 Remix видео','🌐 Перевод видео','✂️ Нарезка Reels','💧 Водяной знак','🖼️ Авто-баннер','🤖 AI инструменты','🔗 Сокращатель','📅 Авто-публикация'],
      stats: ['6 платформ','AI','24/7','FREE'],
      style: 'neonCyber',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderTicker(p)
  },

  // ── 11b. Golden Connect Promo (preset) — Golden Connect-branded ──
  'golden-connect-promo': {
    name: 'Golden Connect Promo',
    description: 'QR + ИИ-инструменты + партнёрка Golden Connect',
    category: 'preset',
    defaults: {
      title: 'GOLDEN_CONNECT',
      subtitle: 'Зарабатывай на AI и партнёрке',
      qr_url: 'https://golden-connect.to/cabinet/',
      bot_name: '@Golden Connect_bizbot',
      services: ['🤖 AI инструменты', '💎 Партнёрка 10 уровней', '📢 Биржа подписок', '🎬 Видео-задания', '🛒 Маркетплейс товаров', '📊 Bio-страницы', '🔗 Шортнер ссылок', '📱 QR-баннеры', '💸 Авто-выплаты', '🎯 Реклама от $0.01', '⚡ Карма-репутация', '🚀 Тарифы LAUNCH/BOOST/ROCKET'],
      stats: ['10 уровней', 'AI', 'CIS', 'FREE'],
      style: 'darkPurple',
      bg_color: '',
      duration: 12, size: '1080x1080'
    },
    render: async (p) => renderTicker(p)
  },

  // ── 12. Arsenal Suite (preset) ──
  'arsenal-suite': {
    name: 'Golden Connect Suite',
    description: 'Обзор всех сервисов Golden Connect',
    category: 'preset',
    defaults: {
      title: 'Golden Connect',
      subtitle: 'Всё для digital-бизнеса',
      qr_url: 'https://golden-connect.to',
      bot_name: 'golden-connect.to',
      services: ['🎨 Конструктор баннеров','🔗 Сокращатель ссылок','📱 QR-генератор','🤖 AI Хештеги','🎯 Удаление фона','📐 Сжатие изображений','🌐 AI Домен Finder','📄 PDF инструменты','📊 A/B тестирование','📱 Social Media Kit','💼 Логотипы','🔍 SEO анализ'],
      stats: ['15+ сервисов','AI','FREE','PRO'],
      style: 'darkPurple',
      bg_color: '',
      duration: 12, size: '300x300'
    },
    render: async (p) => renderTicker(p)
  },
};

// ═══════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════

// ── 1. Ticker-style (QR + scrolling services) ──
async function renderTicker(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'darkPurple';
  const s = STYLES[style] || STYLES.darkPurple;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 400, margin: 1, errorCorrectionLevel: 'M' }) : '';
  const services = p.services || [];
  const stats = p.stats || [];
  const qrSize = Math.round(w * 0.38);
  const fontSize = Math.round(w * 0.043);
  const titleSize = Math.round(w * 0.08);
  const tickerH = Math.round(h * 0.19);
  const itemH = Math.round(tickerH / 2);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.top-row { display:flex;align-items:center;gap:${w*0.03}px;margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.logo-box { width:${w*0.1}px;height:${w*0.1}px;font-size:${w*0.05}px;flex-shrink:0; }
.brand-title { font-size:${titleSize}px; }
.qr-section { margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.6s 0.4s ease forwards; }
.qr-inner img { width:${qrSize}px;height:${qrSize}px; }
.bot-name { font-size:${fontSize}px;font-weight:700;color:${s.accent};margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.5s 0.6s ease forwards;text-shadow:0 0 10px ${s.accent}80; }
.ticker-wrap { height:${tickerH}px;margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.5s 0.8s ease forwards; }
.ticker { animation:tickerScroll 5s linear infinite; }
.ticker-item { height:${itemH}px;font-size:${fontSize}px; }
.ticker-icon { font-size:${fontSize*1.2}px; }
@keyframes tickerScroll { 0%{transform:translateY(0)} 100%{transform:translateY(-${services.length * itemH}px)} }
.stats { display:flex;gap:${w*0.02}px;align-items:center;opacity:0;animation:fadeIn 0.5s 1s ease forwards; }
.stat { font-size:${fontSize*0.7}px;color:${s.textMuted}; }
.stat strong { color:${s.accent};font-size:${fontSize*0.85}px; }
.divider { color:${s.textMuted};font-size:${fontSize*0.7}px; }
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="top-row"><div class="logo-box">🎯</div><div class="brand-title grad-text">${p.title || 'Brand'}</div></div>
  ${qrDataUrl ? `<div class="qr-section"><div class="qr-wrap"><div class="qr-ring"></div><div class="qr-inner"><img src="${qrDataUrl}" alt="QR"></div></div></div>` : ''}
  <div class="bot-name">${p.bot_name || ''}</div>
  <div class="ticker-wrap"><div class="ticker">
    ${[...services, ...services].map(sv => {
      const icon = sv.match(/^(\S+)\s/)?.[1] || '';
      const text = sv.replace(/^\S+\s/, '');
      return `<div class="ticker-item"><span class="ticker-icon">${icon}</span><span class="ticker-text">${text}</span></div>`;
    }).join('')}
  </div></div>
  ${stats.length ? `<div class="stats">${stats.map((sv,i) => `${i?'<div class="divider">·</div>':''}<div class="stat"><strong>${sv}</strong></div>`).join('')}</div>` : ''}
</div></body></html>`;
}

// ── 2. Sale / Discount ──
async function renderSale(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'sunsetOrange';
  const s = STYLES[style] || STYLES.sunsetOrange;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1 = Math.round(w * 0.2);
  const fs2 = Math.round(w * 0.05);
  const features = p.features || [];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.sale-pct { font-size:${fs1}px;font-weight:900;opacity:0;animation:fadeIn 0.6s 0.3s ease forwards,pulseScale 2s 1s ease-in-out infinite; }
@keyframes pulseScale { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
.sale-sub { font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.6s ease forwards; }
.sale-brand { font-size:${fs2*0.8}px;font-weight:700;color:${s.accent};margin-bottom:${h*0.05}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards;letter-spacing:2px; }
.features { display:flex;flex-direction:column;gap:${h*0.02}px;margin-bottom:${h*0.05}px;width:80%;opacity:0;animation:fadeIn 0.5s 0.9s ease forwards; }
.feat { font-size:${fs2*0.85}px;color:${s.textMuted};text-align:left;padding:${h*0.015}px ${w*0.04}px;background:rgba(255,255,255,0.06);border-radius:8px;
  opacity:0;animation:slideIn 0.4s ease forwards; }
.feat:nth-child(1){animation-delay:1s}.feat:nth-child(2){animation-delay:1.2s}.feat:nth-child(3){animation-delay:1.4s}.feat:nth-child(4){animation-delay:1.6s}
@keyframes slideIn { from{opacity:0;transform:translateX(-20px)} to{opacity:1;transform:translateX(0)} }
.sale-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s 2s ease forwards; }

${qrDataUrl ? `.sl-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 2.2s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .sl-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="sale-brand">${p.brand || 'BRAND'}</div>
  <div class="sale-pct grad-text">${p.title || '-50%'}</div>
  <div class="sale-sub">${p.subtitle || 'Special offer'}</div>
  <div class="features">${features.map(f => `<div class="feat">${f}</div>`).join('')}</div>
  <div class="sale-cta cta-btn">${p.cta || '🛒 Buy Now'}</div>

  ${qrDataUrl ? `<div class="sl-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 3. Event / Countdown ──
async function renderEvent(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'oceanBlue';
  const s = STYLES[style] || STYLES.oceanBlue;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 600, margin: 2, errorCorrectionLevel: 'H' }) : '';
  const fs1 = Math.round(w * 0.1);
  const fs2 = Math.round(w * 0.045);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.ev-badge { font-size:${fs2*0.8}px;padding:${h*0.015}px ${w*0.06}px;background:${s.accent}30;border:1px solid ${s.accent}60;border-radius:100px;color:${s.accent};font-weight:600;margin-bottom:${h*0.03}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.ev-title { font-size:${fs1}px;margin-bottom:${h*0.01}px;opacity:0;animation:fadeIn 0.5s 0.4s ease forwards; }
.ev-sub { font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.6s ease forwards; }
.ev-info { display:flex;flex-direction:column;gap:${h*0.015}px;margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.8s ease forwards; }
.ev-row { font-size:${fs2}px;display:flex;align-items:center;gap:${w*0.02}px;justify-content:center; }
.ev-row strong { color:${s.accent}; }

.ev-cd-box { background:${s.accent}20;border:1px solid ${s.accent}50;border-radius:10px;padding:${h*0.02}px ${w*0.03}px;text-align:center;animation:cdPulse 1.5s ease-in-out infinite; }
@keyframes cdPulse { 0%,100%{border-color:${s.accent}50} 50%{border-color:${s.accentAlt}90} }
.ev-cd-num { font-size:${fs1*0.6}px;font-weight:900;color:${s.accent}; }
.ev-cd-label { font-size:${fs2*0.6}px;color:${s.textMuted}; }
.ev-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s 1.5s ease forwards; }
${qrDataUrl ? `.ev-qr { margin-top:${h*0.03}px;opacity:0;animation:fadeIn 0.5s 1.8s ease forwards; } .ev-qr { display:flex;flex-direction:column;align-items:center;gap:3px; } .ev-qr img { width:${Math.round(w*0.32)}px;height:${Math.round(w*0.32)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30; } .ev-qr-lbl { font-size:${Math.round(w*.028)}px;color:${s.textMuted}; }` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="ev-badge">📅 СОБЫТИЕ</div>
  <div class="ev-title grad-text">${p.title || 'EVENT'}</div>
  <div class="ev-sub">${p.subtitle || ''}</div>
  <div class="ev-info">
    <div class="ev-row">📆 <strong>${p.date || ''}</strong></div>
    <div class="ev-row">🕐 <strong>${p.time || ''}</strong></div>
    ${p.speaker ? `<div class="ev-row">🎤 ${p.speaker}</div>` : ''}
  </div>

  <div class="ev-cta cta-btn">${p.cta || '📋 Register'}</div>
  ${qrDataUrl ? `<div class="ev-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 4. Profile / Business Card ──
async function renderProfile(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'roseGold';
  const s = STYLES[style] || STYLES.roseGold;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 600, margin: 2, errorCorrectionLevel: 'H' }) : '';
  const fs1 = Math.round(w * 0.07);
  const fs2 = Math.round(w * 0.04);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.pf-avatar { width:${w*0.22}px;height:${w*0.22}px;border-radius:50%;background:${s.btnGrad};display:flex;align-items:center;justify-content:center;font-size:${w*0.1}px;margin-bottom:${h*0.02}px;box-shadow:0 0 30px ${s.btnShadow};opacity:0;animation:fadeIn 0.5s 0.2s ease forwards,logoPulse 3s 0.7s ease-in-out infinite; }
.pf-name { font-size:${fs1}px;margin-bottom:${h*0.005}px;opacity:0;animation:fadeIn 0.5s 0.4s ease forwards; }
.pf-role { font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*0.03}px;opacity:0;animation:fadeIn 0.5s 0.6s ease forwards; }
.pf-links { display:flex;flex-wrap:wrap;gap:${w*0.02}px;justify-content:center;margin-bottom:${h*0.03}px; }
.pf-link { font-size:${fs2*0.85}px;opacity:0;animation:fadeIn 0.4s ease forwards; }
.pf-link:nth-child(1){animation-delay:0.8s}.pf-link:nth-child(2){animation-delay:1s}.pf-link:nth-child(3){animation-delay:1.2s}.pf-link:nth-child(4){animation-delay:1.4s}
.pf-stats { display:flex;gap:${w*0.03}px;margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.5s 1.6s ease forwards; }
.pf-stat { text-align:center;font-size:${fs2*0.75}px;color:${s.textMuted}; }
.pf-stat strong { display:block;color:${s.accent};font-size:${fs2}px; }
${qrDataUrl ? `.pf-qr { opacity:0;animation:fadeIn 0.5s 1.8s ease forwards; } .pf-qr { display:flex;flex-direction:column;align-items:center;gap:3px; } .pf-qr img { width:${Math.round(w*0.32)}px;height:${Math.round(w*0.32)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30; } .pf-qr-lbl { font-size:${Math.round(w*.028)}px;color:${s.textMuted}; }` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="pf-avatar">${p.avatar_emoji || '👤'}</div>
  <div class="pf-name grad-text">${p.name || 'Name'}</div>
  <div class="pf-role">${p.role || ''}</div>
  <div class="pf-links">${(p.links||[]).map(l => `<div class="pf-link chip">${l}</div>`).join('')}</div>
  <div class="pf-stats">${(p.stats||[]).map(sv => { const m = sv.match(/^(.+?)\s(.+)$/); return m ? `<div class="pf-stat"><strong>${m[1]}</strong>${m[2]}</div>` : `<div class="pf-stat"><strong>${sv}</strong></div>`; }).join('')}</div>
  ${qrDataUrl ? `<div class="pf-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 5. Features Grid — 2×3 icons ──
async function renderFeaturesGrid(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'emeraldGreen';
  const s = STYLES[style] || STYLES.emeraldGreen;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 600, margin: 2, errorCorrectionLevel: 'H' }) : '';
  const fs1 = Math.round(w * 0.08);
  const fs2 = Math.round(w * 0.04);
  const features = p.features || [];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.fg-title { font-size:${fs1}px;margin-bottom:${h*0.005}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.fg-sub { font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.4s ease forwards; }
.fg-grid { display:grid;grid-template-columns:1fr 1fr;gap:${w*0.03}px;width:85%;margin-bottom:${h*0.04}px; }
.fg-item { background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:${h*0.025}px;text-align:center;opacity:0;animation:fadeIn 0.4s ease forwards; }
${features.map((_, i) => `.fg-item:nth-child(${i+1}){animation-delay:${0.6 + i * 0.2}s}`).join('\n')}
.fg-icon { font-size:${w*0.08}px;margin-bottom:${h*0.01}px; }
.fg-label { font-size:${fs2*0.85}px;font-weight:600;color:${s.accent}; }
.fg-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s ${0.6 + features.length * 0.2 + 0.3}s ease forwards; }
${qrDataUrl ? `.fg-qr { margin-top:${h*0.02}px;opacity:0;animation:fadeIn 0.5s ${0.6 + features.length * 0.2 + 0.6}s ease forwards; } .fg-qr { display:flex;flex-direction:column;align-items:center;gap:3px; } .fg-qr img { width:${Math.round(w*0.32)}px;height:${Math.round(w*0.32)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30; } .fg-qr-lbl { font-size:${Math.round(w*.028)}px;color:${s.textMuted}; }` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="fg-title grad-text">${p.title || 'Product'}</div>
  <div class="fg-sub">${p.subtitle || ''}</div>
  <div class="fg-grid">
    ${features.map(f => `<div class="fg-item"><div class="fg-icon">${f.icon || '✅'}</div><div class="fg-label">${f.label || ''}</div></div>`).join('')}
  </div>
  <div class="fg-cta cta-btn">${p.cta || '🚀 Try'}</div>
  ${qrDataUrl ? `<div class="fg-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 6. Testimonial ──
async function renderTestimonial(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'warmDark';
  const s = STYLES[style] || STYLES.warmDark;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1 = Math.round(w * 0.05);
  const fs2 = Math.round(w * 0.04);
  const rating = Math.min(5, Math.max(0, p.rating || 5));

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.tm-quote-mark { font-size:${w*0.15}px;color:${s.accent}40;line-height:1;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.tm-quote { font-size:${fs1}px;font-style:italic;color:${s.text};line-height:1.4;margin-bottom:${h*0.04}px;max-width:85%;opacity:0;animation:fadeIn 0.6s 0.4s ease forwards; }
.tm-stars { font-size:${w*0.06}px;margin-bottom:${h*0.03}px;opacity:0;animation:fadeIn 0.5s 0.7s ease forwards; }
.tm-author-row { display:flex;align-items:center;gap:${w*0.03}px;opacity:0;animation:fadeIn 0.5s 0.9s ease forwards; }
.tm-avatar { width:${w*0.13}px;height:${w*0.13}px;border-radius:50%;background:${s.btnGrad};display:flex;align-items:center;justify-content:center;font-size:${w*0.06}px; }
.tm-info { text-align:left; }
.tm-name { font-size:${fs2}px;font-weight:700;color:${s.text}; }
.tm-role { font-size:${fs2*0.8}px;color:${s.textMuted}; }
.tm-brand { font-size:${fs2*0.7}px;color:${s.accent};font-weight:600;letter-spacing:1px;margin-top:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 1.2s ease forwards; }

${qrDataUrl ? `.tm-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.5s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .tm-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="tm-quote-mark">"</div>
  <div class="tm-quote">${p.quote || 'Great service!'}</div>
  <div class="tm-stars">${'⭐'.repeat(rating)}</div>
  <div class="tm-author-row">
    <div class="tm-avatar">${p.avatar_emoji || '👤'}</div>
    <div class="tm-info"><div class="tm-name">${p.author || 'Client'}</div><div class="tm-role">${p.role || ''}</div></div>
  </div>
  <div class="tm-brand">${p.brand || ''}</div>

  ${qrDataUrl ? `<div class="tm-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 7. Stats Counter ──
async function renderStatsCounter(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'neonCyber';
  const s = STYLES[style] || STYLES.neonCyber;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1 = Math.round(w * 0.08);
  const fs2 = Math.round(w * 0.04);
  const counters = p.counters || [];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.sc-title { font-size:${fs1}px;margin-bottom:${h*0.05}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.sc-grid { display:grid;grid-template-columns:1fr 1fr;gap:${w*0.04}px;width:85%;margin-bottom:${h*0.05}px; }
.sc-item { text-align:center;opacity:0;animation:fadeIn 0.5s ease forwards; }
${counters.map((_, i) => `.sc-item:nth-child(${i+1}){animation-delay:${0.5 + i * 0.3}s}`).join('\n')}
.sc-value { font-size:${w*0.1}px;font-weight:900;color:${s.accent};text-shadow:0 0 20px ${s.accent}60;animation:counterPulse 2s ease-in-out infinite; }
@keyframes counterPulse { 0%,100%{text-shadow:0 0 20px ${s.accent}60} 50%{text-shadow:0 0 40px ${s.accent}90,0 0 60px ${s.accentAlt}40} }
.sc-label { font-size:${fs2}px;color:${s.textMuted};margin-top:${h*0.005}px; }
.sc-line { width:60%;height:1px;background:linear-gradient(90deg,transparent,${s.accent}40,transparent);margin:0 auto ${h*0.01}px; }
.sc-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s ${0.5 + counters.length * 0.3 + 0.3}s ease forwards; }

${qrDataUrl ? `.sc-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 2s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .sc-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="sc-title grad-text">${p.title || 'Brand'}</div>
  <div class="sc-grid">
    ${counters.map(c => `<div class="sc-item"><div class="sc-value">${c.value || '0'}</div><div class="sc-line"></div><div class="sc-label">${c.label || ''}</div></div>`).join('')}
  </div>
  <div class="sc-cta cta-btn">${p.cta || '🚀 Join'}</div>

  ${qrDataUrl ? `<div class="sc-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 8. Comparison (Before/After) ──
async function renderComparison(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'oceanBlue';
  const s = STYLES[style] || STYLES.oceanBlue;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1 = Math.round(w * 0.07);
  const fs2 = Math.round(w * 0.038);
  const leftItems = p.left_items || [];
  const rightItems = p.right_items || [];

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.cmp-title { font-size:${fs1}px;margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.cmp-cols { display:flex;gap:${w*0.03}px;width:90%;margin-bottom:${h*0.04}px; }
.cmp-col { flex:1;border-radius:12px;padding:${h*0.02}px;opacity:0; }
.cmp-left { background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);animation:fadeIn 0.5s 0.5s ease forwards; }
.cmp-right { background:${s.accent}10;border:1px solid ${s.accent}30;animation:fadeIn 0.5s 0.7s ease forwards; }
.cmp-label { font-size:${fs2}px;font-weight:700;margin-bottom:${h*0.015}px;text-align:center; }
.cmp-left .cmp-label { color:#f87171; }
.cmp-right .cmp-label { color:${s.accent}; }
.cmp-item { font-size:${fs2*0.85}px;padding:${h*0.008}px 0;color:${s.textMuted};opacity:0;animation:fadeIn 0.3s ease forwards; }
${leftItems.map((_, i) => `.cmp-left .cmp-item:nth-child(${i+2}){animation-delay:${0.9 + i*0.2}s}`).join('\n')}
${rightItems.map((_, i) => `.cmp-right .cmp-item:nth-child(${i+2}){animation-delay:${1.1 + i*0.2}s}`).join('\n')}
.cmp-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s ${1.1 + Math.max(leftItems.length, rightItems.length)*0.2 + 0.3}s ease forwards; }

${qrDataUrl ? `.cmp-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 2.2s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .cmp-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="cmp-title grad-text">${p.title || 'Why Us?'}</div>
  <div class="cmp-cols">
    <div class="cmp-col cmp-left">
      <div class="cmp-label">${p.left_label || '❌ Before'}</div>
      ${leftItems.map(item => `<div class="cmp-item">• ${item}</div>`).join('')}
    </div>
    <div class="cmp-col cmp-right">
      <div class="cmp-label">${p.right_label || '✅ After'}</div>
      ${rightItems.map(item => `<div class="cmp-item">• ${item}</div>`).join('')}
    </div>
  </div>
  <div class="cmp-cta cta-btn">${p.cta || '🚀 Start'}</div>

  ${qrDataUrl ? `<div class="cmp-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 9. CTA Pulse — minimalist ──
async function renderCtaPulse(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'minimalLight';
  const s = STYLES[style] || STYLES.minimalLight;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 600, margin: 2, errorCorrectionLevel: 'H' }) : '';
  const fs1 = Math.round(w * 0.09);
  const fs2 = Math.round(w * 0.04);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.cp-badge { display:inline-block;font-size:${fs2*0.8}px;padding:${h*0.01}px ${w*0.05}px;background:${s.accent}20;border:1px solid ${s.accent}40;border-radius:100px;color:${s.accent};font-weight:700;margin-bottom:${h*0.05}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.cp-headline { font-size:${fs1}px;margin-bottom:${h*0.02}px;opacity:0;animation:fadeIn 0.6s 0.5s ease forwards; }
.cp-subline { font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*0.06}px;opacity:0;animation:fadeIn 0.5s 0.8s ease forwards; }
.cp-cta { font-size:${fs2*1.2}px;padding:4% 10%;opacity:0;animation:fadeIn 0.5s 1.1s ease forwards,bigPulse 2s 1.6s ease-in-out infinite; }
@keyframes bigPulse { 0%,100%{transform:scale(1);box-shadow:0 0 20px ${s.btnShadow}} 50%{transform:scale(1.06);box-shadow:0 0 50px ${s.btnShadow},0 0 80px ${s.accentAlt}40} }
${qrDataUrl ? `.cp-qr { margin-top:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 1.5s ease forwards; } .cp-qr { display:flex;flex-direction:column;align-items:center;gap:3px; } .cp-qr img { width:${Math.round(w*0.32)}px;height:${Math.round(w*0.32)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30; } .cp-qr-lbl { font-size:${Math.round(w*.028)}px;color:${s.textMuted}; }` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  ${p.badge ? `<div class="cp-badge">${p.badge}</div>` : ''}
  <div class="cp-headline grad-text">${p.headline || 'Start Free'}</div>
  <div class="cp-subline">${p.subline || ''}</div>
  <div class="cp-cta cta-btn">${p.cta || '🚀 Try Free'}</div>
  ${qrDataUrl ? `<div class="cp-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── 10. Carousel ──
async function renderCarousel(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'darkPurple';
  const s = STYLES[style] || STYLES.darkPurple;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1 = Math.round(w * 0.065);
  const fs2 = Math.round(w * 0.038);
  const slides = p.slides || [];
  const slideDur = (p.duration || 12) / Math.max(slides.length, 1);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.cr-brand { font-size:${fs1}px;margin-bottom:${h*0.04}px;opacity:0;animation:fadeIn 0.5s 0.2s ease forwards; }
.cr-slider { position:relative;width:80%;height:${h*0.5}px;margin-bottom:${h*0.04}px;overflow:hidden; }
.cr-slide { position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;
  background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:${h*0.03}px; }
${slides.map((_, i) => {
  const start = (i / slides.length) * 100;
  const fadeIn = start + 2;
  const hold = ((i + 1) / slides.length) * 100 - 5;
  const fadeOut = ((i + 1) / slides.length) * 100;
  return `.cr-slide:nth-child(${i+1}) { animation: slide${i+1} ${p.duration || 12}s linear infinite; }
@keyframes slide${i+1} { 0%,${start}%{opacity:0;transform:scale(0.9)} ${fadeIn}%{opacity:1;transform:scale(1)} ${hold}%{opacity:1;transform:scale(1)} ${fadeOut}%{opacity:0;transform:scale(1.05)} 100%{opacity:0} }`;
}).join('\n')}
.cr-emoji { font-size:${w*0.15}px;margin-bottom:${h*0.02}px; }
.cr-slide-title { font-size:${fs1}px;font-weight:700;color:${s.accent};margin-bottom:${h*0.01}px; }
.cr-slide-desc { font-size:${fs2}px;color:${s.textMuted}; }
.cr-dots { display:flex;gap:${w*0.02}px;margin-bottom:${h*0.03}px; }
.cr-dot { width:${w*0.02}px;height:${w*0.02}px;border-radius:50%;background:${s.accent}40; }
.cr-cta { font-size:${fs2}px;opacity:0;animation:fadeIn 0.5s 0.5s ease forwards; }

${qrDataUrl ? `.cr-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .cr-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="cr-brand grad-text">${p.brand || 'Brand'}</div>
  <div class="cr-slider">
    ${slides.map(sl => `<div class="cr-slide"><div class="cr-emoji">${sl.emoji || '✨'}</div><div class="cr-slide-title">${sl.title || ''}</div><div class="cr-slide-desc">${sl.desc || ''}</div></div>`).join('')}
  </div>
  <div class="cr-dots">${slides.map(() => '<div class="cr-dot"></div>').join('')}</div>
  <div class="cr-cta cta-btn">${p.cta || '🚀 More'}</div>

  ${qrDataUrl ? `<div class="cr-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Typewriter ──
async function renderTypewriter(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'neonCyber'; const s=STYLES[style]||STYLES.neonCyber;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.07); const fs2=Math.round(w*.042); const fs3=Math.round(w*.052);
  const lines=p.lines||[]; const dur=(p.duration||12);
  const lineDur=dur/Math.max(lines.length,1);
  const lineCSS=lines.map((l,i)=>{
    const st=(i*lineDur/dur*100).toFixed(1);
    const en=((i*lineDur+lineDur*.85)/dur*100).toFixed(1);
    const fd=((i*lineDur+lineDur*.95)/dur*100).toFixed(1);
    return `.tw-line:nth-child(${i+1}){position:absolute;white-space:nowrap;animation:twL${i} ${dur}s linear infinite;}
@keyframes twL${i}{0%,${st}%{opacity:0;max-width:0}${((i*lineDur+.3)/dur*100).toFixed(1)}%{opacity:1;max-width:0}${en}%{opacity:1;max-width:100%}${fd}%,100%{opacity:0;max-width:100%}}`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.tw-brand{font-size:${fs1}px;font-weight:900;opacity:0;animation:fadeIn .5s .1s ease forwards;margin-bottom:${h*.03}px;}
.tw-screen{width:88%;background:rgba(0,0,0,.4);border:1px solid ${s.accent}50;border-radius:12px;
  padding:${h*.04}px ${w*.04}px;margin-bottom:${h*.03}px;height:${Math.round(h*.22)}px;
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  opacity:0;animation:fadeIn .5s .3s ease forwards;box-shadow:0 0 20px ${s.accent}20 inset;}
.tw-screen-inner{position:relative;width:100%;height:${fs3*1.5}px;display:flex;align-items:center;}
.tw-line{font-size:${fs3}px;font-weight:700;color:${s.accent};text-shadow:0 0 10px ${s.accent}60;overflow:hidden;}
.tw-cursor{display:inline-block;width:2px;height:${fs3}px;background:${s.accent};margin-left:2px;animation:blink .7s step-end infinite;position:absolute;right:-4px;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
${lineCSS}
.tw-sub{font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*.03}px;opacity:0;animation:fadeIn .5s .6s ease forwards;}
.tw-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s .9s ease forwards;}

${qrDataUrl ? `.tw-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.2s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .tw-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="tw-brand grad-text">${p.brand||'Brand'}</div>
  <div class="tw-screen"><div class="tw-screen-inner">
    ${lines.map(l=>`<div class="tw-line">${l}</div>`).join('')}
    <span class="tw-cursor"></span>
  </div></div>
  <div class="tw-sub">${p.sub||''}</div>
  <div class="tw-cta cta-btn">${p.cta||'🚀 Start'}</div>

  ${qrDataUrl ? `<div class="tw-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Gradient Announce ──
async function renderGradientAnnounce(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'darkPurple'; const s=STYLES[style]||STYLES.darkPurple;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.085); const fs2=Math.round(w*.042);
  const points=p.points||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.ga-badge{font-size:${fs2*.75}px;font-weight:800;padding:${h*.012}px ${w*.05}px;
  background:${s.accent}25;border:1px solid ${s.accent}60;border-radius:100px;color:${s.accent};
  letter-spacing:2px;margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.ga-headline{font-size:${fs1}px;font-weight:900;line-height:1.1;margin-bottom:${h*.025}px;
  opacity:0;animation:fadeIn .5s .3s ease forwards,float 3s 1s ease-in-out infinite;}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
.ga-sub{font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*.03}px;opacity:0;animation:fadeIn .5s .5s ease forwards;}
.ga-points{display:flex;flex-direction:column;gap:${h*.015}px;margin-bottom:${h*.03}px;width:85%;opacity:0;animation:fadeIn .5s .7s ease forwards;}
.ga-point{font-size:${fs2*.88}px;color:${s.text};background:rgba(255,255,255,.05);
  border-left:3px solid ${s.accent};padding:${h*.012}px ${w*.03}px;border-radius:0 8px 8px 0;
  text-align:left;opacity:0;animation:slideIn .4s ease forwards;}
.ga-point:nth-child(1){animation-delay:.8s}.ga-point:nth-child(2){animation-delay:.95s}.ga-point:nth-child(3){animation-delay:1.1s}
@keyframes slideIn{from{opacity:0;transform:translateX(-15px)}to{opacity:1;transform:none}}
.ga-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.4s ease forwards;}

${qrDataUrl ? `.ga-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.6s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .ga-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  ${p.badge?`<div class="ga-badge">${p.badge}</div>`:''}
  <div class="ga-headline grad-text">${p.headline||'Announcement'}</div>
  <div class="ga-sub">${p.sub||''}</div>
  <div class="ga-points">${points.map(pt=>`<div class="ga-point">${pt}</div>`).join('')}</div>
  <div class="ga-cta cta-btn">${p.cta||'👉 Learn More'}</div>

  ${qrDataUrl ? `<div class="ga-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Flash Deal ──
async function renderFlashDeal(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'sunsetOrange'; const s=STYLES[style]||STYLES.sunsetOrange;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.055); const fs2=Math.round(w*.04); const fsDisc=Math.round(w*.18);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.fd-label{font-size:${fs2*.8}px;font-weight:800;letter-spacing:2px;color:${s.accent};margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.fd-brand{font-size:${fs1}px;font-weight:900;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .2s ease forwards;}
.fd-disc{font-size:${fsDisc}px;font-weight:900;line-height:1;
  background:${s.gradText};-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  opacity:0;animation:fadeIn .5s .3s ease forwards,discPulse 1.5s .8s ease-in-out infinite;}
@keyframes discPulse{0%,100%{transform:scale(1) rotate(-2deg)}50%{transform:scale(1.06) rotate(2deg)}}
.fd-prices{display:flex;gap:${w*.04}px;align-items:center;margin:${h*.02}px 0;opacity:0;animation:fadeIn .5s .5s ease forwards;}
.fd-old{font-size:${fs2}px;color:${s.textMuted};text-decoration:line-through;}
.fd-new{font-size:${fs1*1.1}px;font-weight:900;color:${s.accent};}
.fd-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1s ease forwards;}

${qrDataUrl ? `.fd-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.3s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .fd-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="fd-label">${p.label||'⚡ FLASH SALE'}</div>
  <div class="fd-brand grad-text">${p.brand||'STORE'}</div>
  <div class="fd-disc">${p.discount||'-70%'}</div>
  <div class="fd-prices">
    ${p.old_price?`<div class="fd-old">${p.old_price}</div>`:''}
    ${p.new_price?`<div class="fd-new">${p.new_price}</div>`:''}
  </div>

  <div class="fd-cta cta-btn">${p.cta||'🛒 Buy Now'}</div>

  ${qrDataUrl ? `<div class="fd-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Product Card ──
async function renderProductCard(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'emeraldGreen'; const s=STYLES[style]||STYLES.emeraldGreen;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.06); const fs2=Math.round(w*.04);
  const stars=Math.min(parseInt(p.stars)||5,5);
  const badges=p.badges||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.pc-brand{font-size:${fs2*.8}px;letter-spacing:2px;color:${s.accent};opacity:0;animation:fadeIn .4s .1s ease forwards;}
.pc-emoji{font-size:${Math.round(w*.18)}px;margin:${h*.02}px 0;opacity:0;animation:fadeIn .5s .2s ease forwards,float 3s 1s ease-in-out infinite;}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.pc-name{font-size:${fs1}px;font-weight:800;margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .5s .4s ease forwards;}
.pc-stars{font-size:${fs1*.7}px;color:#fbbf24;margin-bottom:${h*.005}px;opacity:0;animation:fadeIn .4s .5s ease forwards;}
.pc-reviews{font-size:${fs2*.7}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .55s ease forwards;}
.pc-price-row{display:flex;gap:${w*.03}px;align-items:baseline;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .6s ease forwards;}
.pc-old{font-size:${fs2}px;color:${s.textMuted};text-decoration:line-through;}
.pc-price{font-size:${fs1*1.1}px;font-weight:900;color:${s.accent};}
.pc-badges{display:flex;gap:${w*.015}px;flex-wrap:wrap;justify-content:center;margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .4s .8s ease forwards;}
.pc-badge{font-size:${fs2*.72}px;padding:3px ${w*.02}px;background:${s.accent}20;border:1px solid ${s.accent}40;border-radius:100px;color:${s.accent};}
.pc-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1s ease forwards;}

${qrDataUrl ? `.pc-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.3s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .pc-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="pc-brand">${p.brand||'SHOP'}</div>
  <div class="pc-emoji">${p.emoji||'📦'}</div>
  <div class="pc-name grad-text">${p.product||'Product'}</div>
  <div class="pc-stars">${'⭐'.repeat(stars)}</div>
  ${p.reviews?`<div class="pc-reviews">${p.reviews}</div>`:''}
  <div class="pc-price-row">
    ${p.old_price?`<div class="pc-old">${p.old_price}</div>`:''}
    <div class="pc-price">${p.price||'0 ₽'}</div>
  </div>
  <div class="pc-badges">${badges.map(b=>`<div class="pc-badge">${b}</div>`).join('')}</div>
  <div class="pc-cta cta-btn">${p.cta||'🛒 Buy'}</div>

  ${qrDataUrl ? `<div class="pc-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Live Now ──
async function renderLiveNow(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'warmDark'; const s=STYLES[style]||STYLES.warmDark;
  const fs1=Math.round(w*.075); const fs2=Math.round(w*.042);
  const qrDataUrl=p.qr_url?await QRCode.toDataURL(p.qr_url,{width:600,margin:2,errorCorrectionLevel:'H'}):'';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.ln-live{display:flex;align-items:center;gap:${w*.02}px;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .1s ease forwards;}
.ln-dot{width:${Math.round(w*.035)}px;height:${Math.round(w*.035)}px;border-radius:50%;background:#ef4444;box-shadow:0 0 8px #ef4444;animation:livePulse 1.2s ease-in-out infinite;}
@keyframes livePulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.4);opacity:.7}}
.ln-live-text{font-size:${fs2*.9}px;font-weight:800;color:#ef4444;letter-spacing:2px;}
.ln-viewers{font-size:${fs2*.75}px;color:${s.textMuted};margin-left:auto;}
.ln-title{font-size:${fs1}px;font-weight:900;line-height:1.15;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .3s ease forwards;}
.ln-sub{font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .5s ease forwards;}
.ln-host{font-size:${fs2*.85}px;color:${s.accent};margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .4s .6s ease forwards;}
.ln-platform{font-size:${fs2*.85}px;color:${s.textMuted};margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .4s .7s ease forwards;}
.ln-bottom{display:flex;align-items:center;gap:${w*.025}px;opacity:0;animation:fadeIn .5s .9s ease forwards;}
.ln-cta{font-size:${fs2}px;flex:1;}
.ln-qr{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;} .ln-qr img{width:${Math.round(w*.32)}px;height:${Math.round(w*.32)}px;border-radius:8px;border:2px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;} .ln-qr-lbl{font-size:${Math.round(w*.028)}px;color:${s.textMuted};}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="ln-live"><div class="ln-dot"></div><div class="ln-live-text">LIVE</div>${p.viewers?`<div class="ln-viewers">👁 ${p.viewers}</div>`:''}</div>
  <div class="ln-title grad-text">${p.title||'Live Stream'}</div>
  <div class="ln-sub">${p.sub||''}</div>
  ${p.host?`<div class="ln-host">🎤 ${p.host}</div>`:''}
  ${p.platform?`<div class="ln-platform">${p.platform}</div>`:''}
  <div class="ln-cta cta-btn" style="width:90%;opacity:0;animation:fadeIn .5s .9s ease forwards;">${p.cta||'👉 Watch'}</div>
  ${qrDataUrl?`<div class="ln-qr" style="opacity:0;animation:fadeIn .6s 1.2s ease forwards;"><img src="${qrDataUrl}"><div class="ln-qr-lbl">📲 Скан для перехода</div></div>`:''}
</div></body></html>`;
}

// ── Conference ──
async function renderConference(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'oceanBlue'; const s=STYLES[style]||STYLES.oceanBlue;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.08); const fs2=Math.round(w*.04);
  const speakers=p.speakers||[]; const topics=p.topics||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.cf-title{font-size:${fs1}px;font-weight:900;margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .5s .2s ease forwards;}
.cf-date{font-size:${fs2}px;color:${s.accent};font-weight:700;margin-bottom:${h*.008}px;opacity:0;animation:fadeIn .4s .35s ease forwards;}
.cf-loc{font-size:${fs2*.85}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .45s ease forwards;}
.cf-topics{display:flex;gap:${w*.015}px;flex-wrap:wrap;justify-content:center;margin-bottom:${h*.018}px;opacity:0;animation:fadeIn .4s .55s ease forwards;}
.cf-topic{font-size:${fs2*.72}px;padding:3px ${w*.025}px;background:${s.accent}20;border:1px solid ${s.accent}50;border-radius:100px;color:${s.accent};}
.cf-speakers-label{font-size:${fs2*.75}px;color:${s.textMuted};margin-bottom:${h*.008}px;opacity:0;animation:fadeIn .4s .65s ease forwards;}
.cf-speakers{display:flex;flex-direction:column;gap:${h*.01}px;width:88%;margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .5s .75s ease forwards;}
.cf-speaker{font-size:${fs2*.85}px;color:${s.text};background:rgba(255,255,255,.05);border-radius:8px;padding:${h*.01}px ${w*.025}px;border-left:2px solid ${s.accent};}
.cf-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.1s ease forwards;}

${qrDataUrl ? `.cnf-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.4s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .cnf-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="cf-title grad-text">${p.title||'Conference'}</div>
  <div class="cf-date">📅 ${p.date||''}</div>
  <div class="cf-loc">${p.location||''}</div>
  <div class="cf-topics">${topics.map(t=>`<div class="cf-topic">${t}</div>`).join('')}</div>
  ${speakers.length?`<div class="cf-speakers-label">🎤 Спикеры:</div><div class="cf-speakers">${speakers.map(sp=>`<div class="cf-speaker">${sp}</div>`).join('')}</div>`:''}
  <div class="cf-cta cta-btn">${p.cta||'🎟️ Register'}</div>

  ${qrDataUrl ? `<div class="cnf-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Skills Card ──
async function renderSkillsCard(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'oceanBlue'; const s=STYLES[style]||STYLES.oceanBlue;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.065); const fs2=Math.round(w*.038);
  const skills=p.skills||[];
  const fillCSS=skills.map((sk,i)=>`@keyframes barFill${i}{from{width:0%}to{width:${sk.pct||0}%}}`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.sk-avatar{font-size:${Math.round(w*.12)}px;margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.sk-name{font-size:${fs1}px;font-weight:800;margin-bottom:${h*.005}px;opacity:0;animation:fadeIn .4s .2s ease forwards;}
.sk-role{font-size:${fs2*.85}px;color:${s.accent};margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .4s .3s ease forwards;}
.sk-bars{width:90%;display:flex;flex-direction:column;gap:${h*.018}px;margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .5s .5s ease forwards;}
.sk-bar-label{display:flex;justify-content:space-between;font-size:${fs2*.8}px;color:${s.textMuted};margin-bottom:${h*.007}px;}
.sk-bar-track{width:100%;height:${Math.round(h*.022)}px;background:rgba(255,255,255,.08);border-radius:100px;overflow:hidden;}
.sk-bar-fill{height:100%;background:${s.btnGrad};border-radius:100px;width:0%;}
${skills.map((sk,i)=>`.sk-bar-row:nth-child(${i+1}) .sk-bar-fill{animation:barFill${i} 1.5s ${.6+i*.2}s ease forwards;}`).join('\n')}
${fillCSS}
.sk-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s ${.6+skills.length*.2+.3}s ease forwards;}

${qrDataUrl ? `.sk-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 2s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .sk-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="sk-avatar">${p.avatar_emoji||'👤'}</div>
  <div class="sk-name grad-text">${p.name||'Name'}</div>
  <div class="sk-role">${p.role||''}</div>
  <div class="sk-bars">
    ${skills.map((sk,i)=>`<div class="sk-bar-row">
      <div class="sk-bar-label"><span>${sk.name}</span><span>${sk.pct}%</span></div>
      <div class="sk-bar-track"><div class="sk-bar-fill"></div></div>
    </div>`).join('')}
  </div>
  <div class="sk-cta cta-btn">${p.cta||'💼 Portfolio'}</div>

  ${qrDataUrl ? `<div class="sk-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Achievements ──
async function renderAchievements(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'roseGold'; const s=STYLES[style]||STYLES.roseGold;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.065); const fs2=Math.round(w*.038);
  const ach=p.achievements||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.ach-title{font-size:${fs1}px;font-weight:900;margin-bottom:${h*.025}px;opacity:0;animation:fadeIn .5s .2s ease forwards;}
.ach-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:${h*.018}px ${w*.02}px;width:92%;margin-bottom:${h*.025}px;}
.ach-item{display:flex;flex-direction:column;align-items:center;gap:${h*.006}px;
  padding:${h*.015}px ${w*.01}px;border-radius:10px;opacity:0;animation:achPop .4s ease forwards;}
.ach-item.unlocked{background:${s.accent}18;border:1px solid ${s.accent}50;}
.ach-item.locked{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);filter:grayscale(.8);}
${ach.map((_,i)=>`.ach-item:nth-child(${i+1}){animation-delay:${.3+i*.12}s}`).join('\n')}
@keyframes achPop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
.ach-icon{font-size:${Math.round(w*.075)}px;}
.ach-label{font-size:${fs2*.65}px;color:${s.textMuted};text-align:center;line-height:1.2;}
.ach-check{font-size:${fs2*.6}px;color:${s.accent};}
.ach-lock{font-size:${fs2*.6}px;opacity:.3;}
.ach-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s ${.3+ach.length*.12+.2}s ease forwards;}

${qrDataUrl ? `.ach-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.5s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .ach-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="ach-title grad-text">${p.name||'Brand'}</div>
  <div class="ach-grid">
    ${ach.map(a=>`<div class="ach-item ${a.unlocked?'unlocked':'locked'}">
      <div class="ach-icon">${a.icon}</div>
      <div class="ach-label">${a.label}</div>
      ${a.unlocked?'<div class="ach-check">✓</div>':'<div class="ach-lock">🔒</div>'}
    </div>`).join('')}
  </div>
  <div class="ach-cta cta-btn">${p.cta||'🏅 Join'}</div>

  ${qrDataUrl ? `<div class="ach-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Social Proof ──
async function renderSocialProof(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'minimalLight'; const s=STYLES[style]||STYLES.minimalLight;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.065); const fs2=Math.round(w*.04);
  const logos=p.logos||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.sp-stars{font-size:${Math.round(w*.065)}px;color:#fbbf24;margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.sp-rating{font-size:${fs1*1.3}px;font-weight:900;line-height:1;background:${s.gradText};-webkit-background-clip:text;-webkit-text-fill-color:transparent;opacity:0;animation:fadeIn .5s .2s ease forwards;}
.sp-reviews{font-size:${fs2*.8}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .35s ease forwards;}
.sp-headline{font-size:${fs1*.9}px;font-weight:800;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .45s ease forwards;}
.sp-logos{display:flex;gap:${w*.02}px;flex-wrap:wrap;justify-content:center;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .5s .65s ease forwards;}
.sp-logo{font-size:${fs2*.8}px;padding:${h*.008}px ${w*.025}px;background:rgba(0,0,0,.06);border:1px solid rgba(0,0,0,.12);border-radius:8px;color:${s.textMuted};font-weight:600;}
.sp-quote{font-size:${fs2*.85}px;color:${s.textMuted};font-style:italic;margin-bottom:${h*.025}px;padding:0 ${w*.03}px;opacity:0;animation:fadeIn .5s .85s ease forwards;}
.sp-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.1s ease forwards;}

${qrDataUrl ? `.sp-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.4s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .sp-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="sp-stars">⭐⭐⭐⭐⭐</div>
  <div class="sp-rating">${p.rating||'4.9'}</div>
  <div class="sp-reviews">${p.reviews_count||''}</div>
  <div class="sp-headline grad-text">${p.headline||'Trusted by thousands'}</div>
  <div class="sp-logos">${logos.map(l=>`<div class="sp-logo">${l}</div>`).join('')}</div>
  ${p.quote?`<div class="sp-quote">"${p.quote}"</div>`:''}
  <div class="sp-cta cta-btn">${p.cta||'✅ Try Now'}</div>

  ${qrDataUrl ? `<div class="sp-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Giveaway ──
async function renderGiveaway(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'roseGold'; const s=STYLES[style]||STYLES.roseGold;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.075); const fs2=Math.round(w*.042);
  const steps=p.steps||[];
  const confColors=['#f5c518','#e53e3e','#48bb78','#4299e1','#ed64a6','#9f7aea'];
  const confCSS=Array.from({length:10},(_,i)=>{
    const x=10+i*8; const delay=(i*.18).toFixed(2); const dur=(2+i%3*.5).toFixed(1);
    const color=confColors[i%confColors.length];
    return `.conf${i}{position:absolute;left:${x}%;top:-8%;width:5px;height:5px;background:${color};border-radius:2px;animation:cfall${i} ${dur}s ${delay}s linear infinite;}
@keyframes cfall${i}{0%{top:-8%;transform:rotate(0deg);opacity:1}100%{top:108%;transform:rotate(${180+i*25}deg);opacity:0}}`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
${confCSS}
.gw-title{font-size:${fs1}px;font-weight:900;margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.gw-prize-box{background:linear-gradient(135deg,${s.accent}20,${s.accentAlt}15);border:2px solid ${s.accent}60;border-radius:14px;
  padding:${h*.022}px ${w*.05}px;margin:${h*.012}px 0;width:88%;text-align:center;
  opacity:0;animation:fadeIn .6s .3s ease forwards,prizePulse 2s 1s ease-in-out infinite;}
@keyframes prizePulse{0%,100%{box-shadow:0 0 15px ${s.accent}30}50%{box-shadow:0 0 30px ${s.accent}60}}
.gw-prize{font-size:${fs1*1.0}px;font-weight:900;background:${s.gradText};-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.gw-prize-val{font-size:${fs2*.8}px;color:${s.textMuted};}
.gw-steps{display:flex;flex-direction:column;gap:${h*.011}px;width:88%;margin-bottom:${h*.018}px;opacity:0;animation:fadeIn .5s .7s ease forwards;}
.gw-step{font-size:${fs2*.85}px;color:${s.text};background:rgba(255,255,255,.05);border-radius:8px;
  padding:${h*.009}px ${w*.025}px;opacity:0;animation:slideIn .4s ease forwards;}
.gw-step:nth-child(1){animation-delay:.8s}.gw-step:nth-child(2){animation-delay:.93s}.gw-step:nth-child(3){animation-delay:1.06s}
@keyframes slideIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}
.gw-ends{font-size:${fs2*.75}px;color:${s.textMuted};margin-bottom:${h*.012}px;opacity:0;animation:fadeIn .4s 1.2s ease forwards;}
.gw-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.4s ease forwards;}

${qrDataUrl ? `.gw-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.7s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .gw-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${Array.from({length:10},(_,i)=>`<div class="conf${i}"></div>`).join('')}
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="gw-title">${p.title||'🎉 GIVEAWAY'}</div>
  <div class="gw-prize-box">
    <div class="gw-prize">${p.prize||'Prize'}</div>
    ${p.prize_value?`<div class="gw-prize-val">${p.prize_value}</div>`:''}
  </div>
  <div class="gw-steps">${steps.map(st=>`<div class="gw-step">${st}</div>`).join('')}</div>
  ${p.ends?`<div class="gw-ends">📅 До ${p.ends}</div>`:''}
  <div class="gw-cta cta-btn">${p.cta||'🎁 Enter'}</div>

  ${qrDataUrl ? `<div class="gw-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Lead Magnet ──
async function renderLeadMagnet(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'emeraldGreen'; const s=STYLES[style]||STYLES.emeraldGreen;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.065); const fs2=Math.round(w*.04);
  const includes=p.includes||[];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.lm-label{font-size:${fs2*.8}px;font-weight:800;letter-spacing:2px;color:${s.accent};
  padding:${h*.01}px ${w*.04}px;border:1px solid ${s.accent}60;border-radius:100px;
  margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .1s ease forwards;}
.lm-title{font-size:${fs1}px;font-weight:900;line-height:1.2;margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .5s .25s ease forwards;}
.lm-value{font-size:${fs2*.75}px;color:${s.textMuted};text-decoration:line-through;margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .4s ease forwards;}
.lm-includes{display:flex;flex-direction:column;gap:${h*.011}px;width:90%;margin-bottom:${h*.025}px;}
.lm-item{font-size:${fs2*.85}px;color:${s.text};background:${s.accent}12;border:1px solid ${s.accent}25;
  border-radius:8px;padding:${h*.009}px ${w*.025}px;text-align:left;opacity:0;animation:slideIn .4s ease forwards;}
.lm-item:nth-child(1){animation-delay:.5s}.lm-item:nth-child(2){animation-delay:.63s}
.lm-item:nth-child(3){animation-delay:.76s}.lm-item:nth-child(4){animation-delay:.89s}
@keyframes slideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
.lm-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.1s ease forwards;}

${qrDataUrl ? `.lm-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.3s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .lm-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="lm-label">${p.label||'🆓 FREE'}</div>
  <div class="lm-title grad-text">${(p.title||'Free Guide').replace(/\\n/g,'<br>')}</div>
  ${p.value?`<div class="lm-value">${p.value}</div>`:''}
  <div class="lm-includes">${includes.map(it=>`<div class="lm-item">${it}</div>`).join('')}</div>
  <div class="lm-cta cta-btn">${p.cta||'📥 Download Free'}</div>

  ${qrDataUrl ? `<div class="lm-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Urgency Offer ──
async function renderUrgencyOffer(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'darkPurple'; const s=STYLES[style]||STYLES.darkPurple;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, {width:600,margin:2,errorCorrectionLevel:'H'}) : '';
  const fs1=Math.round(w*.075); const fs2=Math.round(w*.042);
  const spotsLeft=parseInt(p.spots_left)||7;
  const spotsTotal=parseInt(p.spots_total)||100;
  const pct=Math.round((spotsLeft/spotsTotal)*100);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.uo-label{font-size:${fs2*.8}px;font-weight:800;letter-spacing:1px;
  padding:${h*.01}px ${w*.04}px;border:1px solid #ef444460;border-radius:100px;
  margin-bottom:${h*.015}px;opacity:0;animation:labelPulse 1.5s ease-in-out infinite;}
@keyframes labelPulse{0%,100%{color:#ef4444;border-color:#ef444460}50%{color:#ff6b6b;border-color:#ff6b6b80}}
.uo-title{font-size:${fs1}px;font-weight:900;margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .5s .25s ease forwards;}
.uo-sub{font-size:${fs2}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .4s ease forwards;}
.uo-spots{display:flex;align-items:center;gap:${w*.03}px;margin-bottom:${h*.01}px;opacity:0;animation:fadeIn .5s .55s ease forwards;}
.uo-spots-num{font-size:${fs1*1.2}px;font-weight:900;color:#ef4444;text-shadow:0 0 15px #ef444460;}
.uo-spots-text{font-size:${fs2*.8}px;color:${s.textMuted};line-height:1.3;}
.uo-bar-track{width:90%;height:${Math.round(h*.025)}px;background:rgba(255,255,255,.08);border-radius:100px;overflow:hidden;margin-bottom:${h*.008}px;opacity:0;animation:fadeIn .4s .6s ease forwards;}
.uo-bar-fill{height:100%;width:0%;background:linear-gradient(90deg,#ef4444,#f97316);border-radius:100px;animation:barFill 1.5s .7s ease forwards;}
@keyframes barFill{from{width:0%}to{width:${pct}%}}
.uo-bar-label{font-size:${fs2*.7}px;color:${s.textMuted};margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .4s .75s ease forwards;}
.uo-benefit{font-size:${fs2*.9}px;color:${s.accent};font-weight:700;margin-bottom:${h*.008}px;opacity:0;animation:fadeIn .4s .85s ease forwards;}
.uo-deadline{font-size:${fs2*.75}px;color:${s.textMuted};margin-bottom:${h*.02}px;opacity:0;animation:fadeIn .4s .95s ease forwards;}
.uo-cta{font-size:${fs2}px;opacity:0;animation:fadeIn .5s 1.1s ease forwards;}

${qrDataUrl ? `.uo-qr{margin-top:${h*0.03}px;opacity:0;animation:fadeIn .5s 1.4s ease forwards;display:flex;flex-direction:column;align-items:center;gap:3px;} .uo-qr img{width:${Math.round(w*0.28)}px;height:${Math.round(w*0.28)}px;border-radius:8px;border:1px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;}` : ''}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="uo-label">${p.label||'🔥 LIMITED'}</div>
  <div class="uo-title grad-text">${p.title||'Exclusive Offer'}</div>
  <div class="uo-sub">${p.sub||'Spots available'}</div>
  <div class="uo-spots">
    <div class="uo-spots-num">${spotsLeft}</div>
    <div class="uo-spots-text">из ${spotsTotal} мест<br>осталось</div>
  </div>
  <div class="uo-bar-track"><div class="uo-bar-fill"></div></div>
  <div class="uo-bar-label">${pct}% мест занято</div>
  ${p.benefit?`<div class="uo-benefit">${p.benefit}</div>`:''}
  ${p.deadline?`<div class="uo-deadline">⏰ ${p.deadline}</div>`:''}
  <div class="uo-cta cta-btn">${p.cta||'🚀 Get My Spot'}</div>

  ${qrDataUrl ? `<div class="uo-qr"><img src="${qrDataUrl}"></div>` : ''}
</div></body></html>`;
}

// ── Jackpot Slots ──
async function renderJackpotSlots(p) {
  const [w,h]=(p.size||'300x300').split('x').map(Number);
  const style=p.style||'casinoGold'; const s=STYLES[style]||STYLES.casinoGold;
  const fs1=Math.round(w*.065); const fs2=Math.round(w*.042);
  const reels=p.reels||['🍒','💎','🎰'];
  const qrDataUrl=p.qr_url?await QRCode.toDataURL(p.qr_url,{width:600,margin:2,errorCorrectionLevel:'H'}):'';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w,h,style,p.bg_color)}
.js-brand{font-size:${fs1}px;font-weight:900;letter-spacing:2px;color:${s.accent};
  text-shadow:0 0 15px ${s.accent}80;border-bottom:1px solid ${s.accent}35;
  padding-bottom:${h*.012}px;margin-bottom:${h*.015}px;width:100%;text-align:center;
  opacity:0;animation:fadeIn .4s .1s ease forwards;}
.js-jp-label{font-size:${Math.round(w*.055)}px;font-weight:900;color:#ef4444;letter-spacing:1px;
  text-shadow:0 0 15px #ef444470;margin-bottom:${h*.01}px;
  opacity:0;animation:fadeIn .5s .2s ease forwards,jpPulse 1.5s .8s ease-in-out infinite;}
@keyframes jpPulse{0%,100%{text-shadow:0 0 15px #ef444470;transform:scale(1)}50%{text-shadow:0 0 30px #ef4444;transform:scale(1.05)}}
.js-amount{font-size:${Math.round(w*.1)}px;font-weight:900;line-height:1;
  background:${s.gradText};-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  margin-bottom:${h*.018}px;opacity:0;animation:fadeIn .6s .4s ease forwards;}
.js-reels{display:flex;gap:${w*.025}px;margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .5s .6s ease forwards;}
.js-reel{width:${Math.round(w*.2)}px;height:${Math.round(w*.2)}px;
  background:rgba(0,0,0,.5);border:2px solid ${s.accent}60;border-radius:10px;
  display:flex;align-items:center;justify-content:center;font-size:${Math.round(w*.1)}px;overflow:hidden;
  box-shadow:0 0 10px ${s.accent}30 inset;}
.js-reel-inner{animation:reelSpin 3s ease-in-out infinite;}
.js-reel:nth-child(2) .js-reel-inner{animation-delay:.3s}
.js-reel:nth-child(3) .js-reel-inner{animation-delay:.6s}
@keyframes reelSpin{0%{transform:translateY(0)}20%{transform:translateY(-100%)}40%{transform:translateY(100%)}60%,100%{transform:translateY(0)}}
.js-sub{font-size:${fs2*.82}px;color:${s.textMuted};margin-bottom:${h*.015}px;opacity:0;animation:fadeIn .4s .8s ease forwards;}
.js-bottom{display:flex;align-items:center;gap:${w*.025}px;width:100%;opacity:0;animation:fadeIn .5s 1s ease forwards;}
.js-cta{font-size:${fs2}px;flex:1;}
.js-qr{display:flex;flex-direction:column;align-items:center;gap:3px;flex-shrink:0;} .js-qr img{width:${Math.round(w*.32)}px;height:${Math.round(w*.32)}px;border-radius:8px;border:2px solid ${s.accent}50;box-shadow:0 0 10px ${s.accent}30;} .js-qr-lbl{font-size:${Math.round(w*.028)}px;color:${s.textMuted};}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="js-brand">${p.brand||'SLOTS VIP'}</div>
  <div class="js-jp-label">${p.jackpot||'🏆 JACKPOT'}</div>
  <div class="js-amount">${p.amount||'5,000,000 ₽'}</div>
  <div class="js-reels">
    ${reels.map(r=>`<div class="js-reel"><div class="js-reel-inner">${r}</div></div>`).join('')}
  </div>
  <div class="js-sub">${p.sub||''}</div>
  <div class="js-cta cta-btn" style="width:90%;opacity:0;animation:fadeIn .5s 1s ease forwards;">${p.cta||'🎰 Play Free'}</div>
  ${qrDataUrl?`<div class="js-qr" style="opacity:0;animation:fadeIn .6s 1.3s ease forwards;"><img src="${qrDataUrl}"><div class="js-qr-lbl">📲 Скан для игры</div></div>`:''}
</div></body></html>`;
}


// ═══════════════════════════════════════════════════════════
// RENDER ENGINE (Puppeteer + FFmpeg)
// ═══════════════════════════════════════════════════════════
async function renderVideo(jobId, html, w, h, duration, fps = 30) {
  const totalFrames = fps * duration;
  const framesDir = path.join('/tmp', `vb-frames-${jobId}`);
  const output = path.join(OUTPUT_DIR, `${jobId}.mp4`);

  fs.mkdirSync(framesDir, { recursive: true });

  const browser = await puppeteer.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'], 
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--hide-scrollbars']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });

    const tmpHtml = path.join('/tmp', `vb-${jobId}.html`);
    fs.writeFileSync(tmpHtml, html, 'utf8');
    await page.goto('file://' + tmpHtml, { waitUntil: 'networkidle0' });

    const frameMs = 1000 / fps;
    for (let i = 0; i < totalFrames; i++) {
      const t = i * frameMs;
      await page.evaluate((time) => {
        document.getAnimations({ subtree: true }).forEach(a => {
          if (a.effect) a.currentTime = time;
        });
      }, t);
      await new Promise(r => setTimeout(r, 5));
      await page.screenshot({
        path: path.join(framesDir, `f_${String(i).padStart(5, '0')}.png`),
        clip: { x: 0, y: 0, width: w, height: h }
      });

      const job = jobs.get(jobId);
      if (job) job.progress = Math.round((i / totalFrames) * 100);
    }

    fs.unlinkSync(tmpHtml);
    await browser.close();

    execSync([
      'ffmpeg -y',
      '-framerate ' + fps,
      `-i ${framesDir}/f_%05d.png`,
      '-c:v libx264 -pix_fmt yuv420p -preset medium -crf 20',
      `-vf scale=${w}:${h}:flags=lanczos`,
      '-movflags +faststart',
      '-t ' + duration,
      output
    ].join(' '), { stdio: 'pipe' });

    execSync('rm -rf ' + framesDir, { stdio: 'pipe' });

    return `/generated/banners/${jobId}.mp4`;
  } catch (e) {
    await browser.close().catch(() => {});
    execSync('rm -rf ' + framesDir, { stdio: 'pipe' }).toString();
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════


// ── 13. Casino Promo ──
async function renderCasino(p) {
  const [w, h] = (p.size || '300x300').split('x').map(Number);
  const style = p.style || 'casinoGold';
  const s = STYLES[style] || STYLES.casinoGold;
  const qrDataUrl = p.qr_url ? await QRCode.toDataURL(p.qr_url, { width: 600, margin: 2, errorCorrectionLevel: 'H' }) : '';
  const features = p.features || ['🎰 Слоты','🃏 Live Casino','⚽ Ставки','💸 Выплаты'];
  const games = (p.games || ['🎰','🃏','🎲','💎','🏆']).slice(0, 5);
  const hasQr = !!qrDataUrl;

  // When QR present — compact layout, big QR at bottom
  // When no QR — normal layout with games row
  const fsBonus = Math.round(w * (hasQr ? 0.095 : 0.12));
  const fs2     = Math.round(w * 0.038);
  const fsBrand = Math.round(w * 0.058);
  const fsGame  = Math.round(w * 0.062);
  const qrSize  = Math.round(w * 0.35);   // 105px @ 300, 378px @ 1080
  const gap     = Math.round(h * (hasQr ? 0.009 : 0.012));
  const pad     = Math.round(h * 0.016);

  return `<!doctype html><html><head><meta charset="utf-8"><style>
${buildCSS(w, h, style, p.bg_color)}
.content { justify-content:center; padding:${pad}px ${Math.round(w*.04)}px; gap:${gap}px; }
.cas-brand {
  font-size:${fsBrand}px;font-weight:900;letter-spacing:2px;color:${s.accent};
  text-shadow:0 0 15px ${s.accent}80;
  opacity:0;animation:fadeIn .5s .1s ease forwards;
  border-bottom:1px solid ${s.accent}35;padding-bottom:${gap}px;width:100%;text-align:center;
}
.cas-bonus-wrap {
  background:linear-gradient(135deg,rgba(212,175,55,.13),rgba(229,62,62,.09));
  border:1px solid ${s.accent}45;border-radius:12px;
  padding:${Math.round(h*(hasQr?.013:.016))}px ${Math.round(w*.03)}px;
  width:90%;text-align:center;
  opacity:0;animation:fadeIn .6s .3s ease forwards;
  box-shadow:0 0 16px ${s.accent}25 inset;flex-shrink:0;
}
.cas-bonus {
  font-size:${fsBonus}px;font-weight:900;line-height:1.1;
  background:${s.gradText};-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  animation:pulseScale 2s 1.2s ease-in-out infinite;
}
@keyframes pulseScale{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.cas-bonus-sub { font-size:${Math.round(fs2*.85)}px;color:${s.textMuted};margin-top:2px; }
.cas-min-dep   { font-size:${Math.round(fs2*.72)}px;color:${s.accent}AA;margin-top:1px; }
.cas-games {
  display:flex;gap:${Math.round(w*.022)}px;
  opacity:0;animation:fadeIn .5s .6s ease forwards;flex-shrink:0;
}
.cas-game {
  font-size:${fsGame}px;
  filter:drop-shadow(0 0 5px ${s.accent}70);
  animation:gamePop 3s ease-in-out infinite;
}
.cas-game:nth-child(1){animation-delay:0s}
.cas-game:nth-child(2){animation-delay:.35s}
.cas-game:nth-child(3){animation-delay:.7s}
.cas-game:nth-child(4){animation-delay:1.05s}
.cas-game:nth-child(5){animation-delay:1.4s}
@keyframes gamePop{0%,100%{transform:scale(1) translateY(0)}50%{transform:scale(1.12) translateY(-2px)}}
.cas-features {
  display:grid;grid-template-columns:1fr 1fr;
  gap:${Math.round(h*.009)}px ${Math.round(w*.018)}px;
  width:94%;opacity:0;animation:fadeIn .5s .9s ease forwards;flex-shrink:0;
}
.cas-feat {
  font-size:${Math.round(fs2*(hasQr?.76:.80))}px;color:${s.textMuted};
  background:rgba(212,175,55,.06);border:1px solid ${s.accent}22;
  border-radius:7px;padding:${Math.round(h*(hasQr?.008:.009))}px ${Math.round(w*.015)}px;
  text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  opacity:0;animation:slideIn .4s ease forwards;
}
.cas-feat:nth-child(1){animation-delay:1s}
.cas-feat:nth-child(2){animation-delay:1.12s}
.cas-feat:nth-child(3){animation-delay:1.24s}
.cas-feat:nth-child(4){animation-delay:1.36s}
@keyframes slideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.cas-cta {
  font-size:${fs2}px;width:90%;flex-shrink:0;
  opacity:0;animation:fadeIn .5s 1.6s ease forwards;
}
/* QR — крупный, по центру, ниже кнопки */
.cas-qr {
  display:flex;flex-direction:column;align-items:center;gap:4px;
  opacity:0;animation:fadeIn .6s 1.9s ease forwards;flex-shrink:0;
}
.cas-qr img {
  width:${qrSize}px;height:${qrSize}px;
  border-radius:10px;border:2px solid ${s.accent}60;
  box-shadow:0 0 12px ${s.accent}40;
}
.cas-qr-label {
  font-size:${Math.round(fs2*.7)}px;color:${s.accent};letter-spacing:1px;
}
</style></head><body>
${orbsHTML(style)}${particlesHTML()}
<div class="content">
  <div class="cas-brand">${p.brand || 'CASINO'}</div>
  <div class="cas-bonus-wrap">
    <div class="cas-bonus">${p.bonus || '100% + 200 FS'}</div>
    <div class="cas-bonus-sub">${p.bonus_sub || 'на первый депозит'}</div>
    ${p.min_dep ? `<div class="cas-min-dep">${p.min_dep}</div>` : ''}
  </div>
  ${!hasQr ? `<div class="cas-games">${games.map(g => `<div class="cas-game">${g}</div>`).join('')}</div>` : ''}
  <div class="cas-features">${features.map(f => `<div class="cas-feat">${f}</div>`).join('')}</div>
  <div class="cas-cta cta-btn">${p.cta || '🎁 Получить бонус'}</div>
  ${qrDataUrl ? `<div class="cas-qr">
    <img src="${qrDataUrl}">
    <div class="cas-qr-label">📲 Сканируй для бонуса</div>
  </div>` : ''}
</div></body></html>`;
}
// List templates

// ══════════════════════════════════════════════════════════════════
// Golden Connect programmatic API (replaces Arsenal express endpoints)
// ══════════════════════════════════════════════════════════════════

function listTemplates() {
  return Object.entries(TEMPLATES).map(([id, t]) => ({
    id, name: t.name, description: t.description, category: t.category, defaults: t.defaults,
  }));
}

/**
 * @param {string} templateId  — key in TEMPLATES (e.g. 'tokgram-promo')
 * @param {object} params      — overrides for template defaults (title, qr_url, etc.)
 * @returns {Promise<{id, path, file_size, width, height, template}>}
 */
async function generateVideo(templateId, params = {}) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new Error('template_not_found: ' + templateId);
  const merged = Object.assign({}, tpl.defaults || {}, params || {});
  // size defaults
  const [w, h] = String(merged.size || '1080x1080').split('x').map(Number);
  merged._width = w || 1080;
  merged._height = h || 1080;
  merged._duration = Math.max(3, Math.min(60, Number(merged.duration) || 10));
  const jobId = crypto.randomBytes(8).toString('hex');
  merged._jobId = jobId;
  merged._outDir = OUTPUT_DIR;
  const result = await tpl.render(merged);
  // result expected to be a file path or { path, ... }
  let outPath, w2, h2;
  if (typeof result === 'string') { outPath = result; w2 = merged._width; h2 = merged._height; }
  else { outPath = result.path; w2 = result.width || merged._width; h2 = result.height || merged._height; }
  let stat = null;
  try { stat = fs.statSync(outPath); } catch (_) {}
  return {
    id: jobId, path: outPath, file_size: stat ? stat.size : 0,
    width: w2, height: h2, template: templateId,
  };
}

module.exports = { generateVideo, listTemplates, TEMPLATES, STYLES };
