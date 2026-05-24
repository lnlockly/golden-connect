/**
 * Personal video-banner generator (S.1 video).
 * Wraps services/video-banner.js → goldenConnect-promo template → mp4.
 * Falls back to static PNG via sharp+qrcode if puppeteer/chromium unavailable.
 */
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sharp = require('sharp');

const BANNER_DIR = '/data/banners';
const SITE_BASE = 'https://goldenConnect.to';

function ensureDir() {
  try { fs.mkdirSync(BANNER_DIR, { recursive: true }); } catch (_) {}
}

/**
 * Generates a video banner (mp4) for the user. Returns { path, isVideo: true } or
 * static PNG fallback { path, isVideo: false } if Chromium unavailable.
 */
async function generateBanner({ userId, refCode, displayName }) {
  ensureDir();
  const refUrl = SITE_BASE + '/?ref=' + encodeURIComponent(refCode || '');
  const name = String(displayName || 'Партнёр Golden Connect').slice(0, 40);
  const videoOut = path.join(BANNER_DIR, String(userId) + '.mp4');
  const pngOut   = path.join(BANNER_DIR, String(userId) + '.png');

  // S.1 = static PNG (reliable on shared cluster, ~150ms, 2160x2160).
  // Moving-banner overlay onto trending videos lives in S.4 (pure FFmpeg, no Chromium).
  // The video-banner.js (Puppeteer) module stays available for future use cases.
  const qrBuf = await QRCode.toBuffer(refUrl, {
    type: 'png', errorCorrectionLevel: 'H', margin: 2, width: 1100,
    color: { dark: '#0c111a', light: '#ffffff' },
  });
  const SIZE = 2160;
  const escSvg = (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bgSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#B14AED"/>
      <stop offset="50%" stop-color="#7C3AED"/>
      <stop offset="100%" stop-color="#00D4FF"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <text x="${SIZE/2}" y="220" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="900" font-size="160" fill="#ffffff" letter-spacing="20">GOLDEN_CONNECT</text>
  <text x="${SIZE/2}" y="320" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="60" fill="#ffffff" opacity="0.85">Зарабатывай на AI и партнёрке</text>
  <rect x="${(SIZE-1280)/2}" y="450" width="1280" height="1280" rx="60" fill="#ffffff"/>
  <text x="${SIZE/2}" y="1900" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="72" fill="#ffffff">${escSvg(name)}</text>
  <text x="${SIZE/2}" y="2000" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="600" font-size="56" fill="#ffffff">📱 Сканируй QR — стартовый бонус $1</text>
  <text x="${SIZE/2}" y="2080" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="500" font-size="42" fill="#ffffff" opacity="0.75">goldenConnect.to/?ref=${escSvg(refCode || '')}</text>
</svg>`;
  await sharp(Buffer.from(bgSvg))
    .composite([{ input: qrBuf, left: Math.floor((SIZE - 1100) / 2), top: 540 }])
    .png({ compressionLevel: 8 })
    .toFile(pngOut);
  return { path: pngOut, isVideo: false, file_size: fs.statSync(pngOut).size };
}

module.exports = { generateBanner, BANNER_DIR };
