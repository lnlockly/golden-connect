// [auth-cabinet-session] Cabinet-session-aware auth middleware.
// Originally this was a no-op shim that only worked when req.user was injected
// by the shrbio outer wrapper. /api/mlm/* mounts directly, with no such
// injection, so every protected mlm endpoint returned 401 auth_required even
// for logged-in cabinet users. Fix: fall back to resolving the
// goldenConnect_cabinet_session cookie via storage.

function parseCookies(raw) {
  const out = {};
  String(raw || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i <= 0) return;
    try {
      const k = decodeURIComponent(p.slice(0, i).trim());
      const v = decodeURIComponent(p.slice(i + 1).trim());
      if (k) out[k] = v;
    } catch (_) {}
  });
  return out;
}

function resolveCabinetSession(req) {
  try {
    const storage = req.app && req.app.locals && req.app.locals.storage;
    if (!storage) return null;
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies['goldenConnect_cabinet_session'];
    if (!token) return null;
    const tokenHash = storage.hashSha256 ? storage.hashSha256(token) : null;
    if (!tokenHash) return null;
    const session = storage.getWebSession ? storage.getWebSession(tokenHash) : null;
    if (!session || !session.userId) return null;
    const user = storage.getPublicWebUserById
      ? storage.getPublicWebUserById(session.userId)
      : (storage.findWebUserById ? storage.findWebUserById(session.userId) : null);
    if (!user || !user.id) return null;
    return user;
  } catch (_) { return null; }
}

module.exports = {
  authRequired: function (req, res, next) {
    // Path A: shrbio wrapper already injected req.user
    if (req.user && req.user.id) {
      if (!req.webUser) req.webUser = req.user;
      return next();
    }
    // Path B: web-routes' resolveSession already set req.webUser earlier in chain
    if (req.webUser && req.webUser.id) {
      req.user = req.webUser;
      return next();
    }
    // Path C: resolve cabinet session cookie directly (this is the /api/mlm path)
    const user = resolveCabinetSession(req);
    if (user) {
      req.user = user;
      req.webUser = user;
      return next();
    }
    return res.status(401).json({ ok: false, reason: 'auth_required' });
  },
};
