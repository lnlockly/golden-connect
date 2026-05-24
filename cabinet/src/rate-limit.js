// Lightweight in-memory rate limiter. No external deps.
// Sliding fixed-window per key (usually IP).

function getClientKey(req) {
  // Honor X-Forwarded-For when behind Nginx (trust proxy should be on)
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || (req.connection && req.connection.remoteAddress) || 'unknown';
}

function createRateLimiter(options = {}) {
  const windowMs = Math.max(1000, Number(options.windowMs || 60 * 1000));
  const max = Math.max(1, Number(options.max || 60));
  const keyFn = typeof options.keyFn === 'function' ? options.keyFn : getClientKey;
  const skip = typeof options.skip === 'function' ? options.skip : null;
  const name = String(options.name || 'default');
  const errorMessage = String(options.message || 'Too many requests, please try again later.');

  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.start >= windowMs) hits.delete(key);
    }
  }, windowMs);
  if (cleanup.unref) cleanup.unref();

  function middleware(req, res, next) {
    if (skip && skip(req)) return next();
    const key = `${name}:${keyFn(req)}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now - entry.start >= windowMs) {
      entry = { start: now, count: 0 };
      hits.set(key, entry);
    }
    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.start + windowMs) / 1000)));
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.start + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: errorMessage,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: retryAfterSec,
      });
    }
    return next();
  }

  middleware._hits = hits;
  middleware._config = { windowMs, max, name };
  return middleware;
}

module.exports = { createRateLimiter, getClientKey };
