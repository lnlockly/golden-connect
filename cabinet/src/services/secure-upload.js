// Secure upload pipeline: write to temp → scan → re-encode (image) → move to final.
// Usage:
//   const { processBannerImage } = require('./secure-upload');
//   const meta = await processBannerImage(buffer, { format: '728x90', userId: 42 });
//   meta = { path: '/data/ads/banner/<uuid>.webp', width, height, sizeBytes }
//
// Throws Error with .code: 'TOO_BIG' | 'BAD_FORMAT' | 'WRONG_DIMENSIONS' | 'VIRUS' | 'DECODE_FAILED'

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { scanFile, detectMime } = require('./virus-scan');

const DATA_ROOT = process.env.DATA_DIR || '/data';
const ADS_BANNER_DIR = path.join(DATA_ROOT, 'ads', 'banner');
const ADS_VIDEO_DIR = path.join(DATA_ROOT, 'ads', 'video');
const ADS_TMP_DIR = path.join(DATA_ROOT, 'ads', 'tmp');

[ADS_BANNER_DIR, ADS_VIDEO_DIR, ADS_TMP_DIR].forEach(p => {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
});

// Banner formats — exact (or near-exact) target dimensions.
const BANNER_FORMATS = {
  '728x90':  { w: 728, h: 90 },
  '300x250': { w: 300, h: 250 },
  '160x600': { w: 160, h: 600 },
  '320x50':  { w: 320, h: 50 },
  'sticky-bottom': { w: 728, h: 90 },  // sticky shown across viewports, stored as 728x90
};
const MAX_BANNER_BYTES = 10 * 1024 * 1024;    // [banner-size-fix-2026-05-16] 10 MB before re-encode (sharp downscales)
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;    // 200 MB

function _err(code, msg) {
  const e = new Error(msg);
  e.code = code;
  return e;
}

async function processBannerImage(buffer, { format, userId, originalName }) { // [virus-scan-orig-2026-05-17]
  if (!BANNER_FORMATS[format]) throw _err('BAD_FORMAT', 'Unknown banner format');
  if (!Buffer.isBuffer(buffer)) throw _err('BAD_FORMAT', 'expected Buffer');
  if (buffer.length > MAX_BANNER_BYTES) throw _err('TOO_BIG', `Image too big (>${MAX_BANNER_BYTES} B)`);

  // Stage 1: write to tmp
  const tmpName = `tmp_${userId}_${crypto.randomBytes(8).toString('hex')}`;
  const tmpPath = path.join(ADS_TMP_DIR, tmpName);
  await fs.promises.writeFile(tmpPath, buffer);

  try {
    // Stage 2: virus / safety scan
    const scan = await scanFile(tmpPath, 'image', originalName); // [virus-scan-orig-2026-05-17]
    if (!scan.ok) throw _err('VIRUS', `safety scan failed (${scan.scanner}): ${scan.threat}`);

    // Stage 3: decode + validate dimensions + re-encode to webp
    let img;
    try {
      img = sharp(tmpPath, { failOn: 'error' });
    } catch (e) {
      throw _err('DECODE_FAILED', 'image cannot be decoded');
    }
    const meta = await img.metadata();
    if (!meta.width || !meta.height) throw _err('DECODE_FAILED', 'no dimensions');

    const target = BANNER_FORMATS[format];
    // [auto-fit-v2] Auto-pick fit strategy by aspect-ratio mismatch:
    //   - small mismatch (<30%): smart-crop (cover) — preserves visual focus
    //   - large mismatch:        contain over blurred copy of source — full image visible, no distortion
    const arSrc = meta.width / meta.height;
    const arTgt = target.w / target.h;
    const arDiff = Math.abs(arSrc - arTgt) / arTgt;
    const useBlurBg = arDiff > 0.3;

    const finalName = `${Date.now()}_${userId}_${crypto.randomBytes(6).toString('hex')}.webp`;
    const finalPath = path.join(ADS_BANNER_DIR, finalName);

    if (!useBlurBg) {
      // Path A: smart crop
      await sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize(target.w, target.h, { fit: 'cover', position: 'attention' })
        .webp({ quality: 85, effort: 4 })
        .toFile(finalPath);
    } else {
      // Path B: blurred background + contained source on top
      const bg = await sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize(target.w, target.h, { fit: 'cover', position: 'attention' })
        .blur(18)
        .modulate({ brightness: 0.85 })
        .toBuffer();

      // Inner: contain (no upscale beyond source) — leaves transparent edges to be filled by blurred bg.
      const inner = await sharp(buffer, { failOn: 'error' })
        .rotate()
        .resize(target.w, target.h, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      await sharp(bg)
        .composite([{ input: inner, gravity: 'center' }])
        .webp({ quality: 85, effort: 4 })
        .toFile(finalPath);
    }

    const finalStat = await fs.promises.stat(finalPath);

    return {
      path: finalPath,
      relPath: '/cabinet/ads-asset/banner/' + finalName,
      width: target.w,
      height: target.h,
      sizeBytes: finalStat.size,
      sourceMime: meta.format ? `image/${meta.format}` : 'unknown',
    };
  } finally {
    fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function deleteBannerAsset(absPath) {
  if (!absPath) return false;
  // Safety: only delete inside banner dir.
  const norm = path.resolve(absPath);
  if (!norm.startsWith(path.resolve(ADS_BANNER_DIR))) return false;
  try {
    await fs.promises.unlink(norm);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  processBannerImage,
  deleteBannerAsset,
  ADS_BANNER_DIR,
  ADS_VIDEO_DIR,
  ADS_TMP_DIR,
  BANNER_FORMATS,
  MAX_BANNER_BYTES,
  MAX_VIDEO_BYTES,
};
