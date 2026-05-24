// On-the-fly image converter (PNG/JPG → WebP) for static-served files.
// Usage: /img-x?u=/cabinet/img/foo.png&w=400&fmt=webp
// Backed by sharp; cached in memory (LRU 200 items, 24h).
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const _cache = new Map(); // key → { buf, type, ts }
const TTL = 24 * 60 * 60 * 1000;
const MAX = 200;

function _readLocal(urlPath) {
  // urlPath must be /cabinet/...; strip /cabinet prefix to map to public/site
  const cleanPath = String(urlPath || '').replace(/^\/cabinet/, '').split('?')[0];
  if (cleanPath.includes('..')) return null;
  const p = path.join(__dirname, '..', '..', 'public', 'site', cleanPath);
  try { return fs.readFileSync(p); } catch (_) { return null; }
}

async function convertImage(req, res) {
  const u = String(req.query.u || '').slice(0, 500);
  if (!u || !u.startsWith('/')) return res.status(400).type('text/plain').send('bad u');
  const w = Math.min(2000, Math.max(0, parseInt(req.query.w, 10) || 0));
  const fmt = ['webp', 'avif', 'jpeg'].includes(req.query.fmt) ? req.query.fmt : 'webp';
  const cacheKey = u + '|' + w + '|' + fmt;
  const now = Date.now();

  const hit = _cache.get(cacheKey);
  if (hit && (now - hit.ts < TTL)) {
    res.setHeader('Content-Type', hit.type);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Img-Cache', 'HIT');
    return res.send(hit.buf);
  }

  const src = _readLocal(u);
  if (!src) return res.status(404).type('text/plain').send('not found');

  try {
    let pipeline = sharp(src);
    if (w > 0) pipeline = pipeline.resize({ width: w, withoutEnlargement: true });
    if (fmt === 'webp') pipeline = pipeline.webp({ quality: 82 });
    else if (fmt === 'avif') pipeline = pipeline.avif({ quality: 60, effort: 4 });
    else if (fmt === 'jpeg') pipeline = pipeline.jpeg({ quality: 85, progressive: true });
    const buf = await pipeline.toBuffer();
    const type = fmt === 'jpeg' ? 'image/jpeg' : 'image/' + fmt;
    if (_cache.size >= MAX) {
      const oldestKey = _cache.keys().next().value;
      _cache.delete(oldestKey);
    }
    _cache.set(cacheKey, { buf, type, ts: now });
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Img-Cache', 'MISS');
    return res.send(buf);
  } catch (e) {
    res.status(500).type('text/plain').send('convert failed: ' + (e.message || ''));
  }
}

module.exports = { convertImage };
