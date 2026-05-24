// Attach planner/webapp routes + Socket.IO signaling to an EXISTING Express
// app + http.Server. Used by the main cabinet entrypoint so the conference
// (video-call) subsystem runs on the same port as the cabinet instead of
// as a separate standalone process.
//
// Usage:
//   const http = require('http');
//   const app = express();
//   const httpServer = http.createServer(app);
//   const { attachToApp } = require('./planner/webapp/attach');
//   const io = attachToApp(app, httpServer, { botToken, basePath: '/planner', joinPath: '/meet' });
//   httpServer.listen(port);

const express = require('express');
const { Server: SocketIO } = require('socket.io');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');

const db = require('../db/database');
const { initSignaling } = require('../conference/signaling');

function attachToApp(app, httpServer, opts) {
  opts = opts || {};
  const botToken = opts.botToken || process.env.BOT_TOKEN || '';
  const base = opts.basePath || '/planner';      // mount prefix for static + /api/*
  const joinPath = opts.joinPath || '/meet';      // /meet/:roomId → browser-join entrypoint
  const ngSessionCookie = opts.sessionCookieName || 'goldenConnect_cabinet_session';

  // ── Socket.IO ────────────────────────────────────────────────────────
  // Attach to the SHARED httpServer. Path defaults to /socket.io which is
  // reachable cross-origin via the same port; adjust if the nginx ingress
  // ever needs a different subpath.
  const io = new SocketIO(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    path: opts.socketPath || '/socket.io/',
  });
  initSignaling(io, db);

  // ── Telegram WebApp auth helper ──────────────────────────────────────
  function validateTelegramWebApp(initData) {
    if (!initData || !botToken) return null;
    try {
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      params.delete('hash');
      const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
      const dataCheckString = sorted.map(([k, v]) => `${k}=${v}`).join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
      const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
      if (calculatedHash !== hash) return null;
      const authDate = parseInt(params.get('auth_date') || '0', 10);
      if (Date.now() / 1000 - authDate > 86400) return null;
      const userStr = params.get('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  }

  // Bridge auth: accept Telegram WebApp init_data OR cabinet session cookie.
  // Cabinet users without tg_id get a synthetic tg_id = -cabUserId so the
  // planner DB can key rooms/tasks per-user without collision with real
  // Telegram IDs (those are always positive).
  function authMiddleware(req, res, next) {
    const initData = req.headers['x-telegram-init-data'];
    const tgUser = validateTelegramWebApp(initData);
    if (tgUser) {
      const user = db.ensureUser(tgUser);
      req.user = user;
      return next();
    }

    // Fall back to cabinet session cookie
    try {
      const storage = opts.storage;
      if (storage) {
        const raw = String(req.headers.cookie || '');
        const cookies = Object.fromEntries(
          raw.split(';').map(c => c.trim().split('=').map(decodeURIComponent))
            .filter(p => p.length === 2)
        );
        const sessionToken = cookies[ngSessionCookie];
        if (sessionToken) {
          const session = storage.getSessionByToken && storage.getSessionByToken(sessionToken);
          if (session && session.userId) {
            const cabUser = storage.getUserById(session.userId);
            if (cabUser) {
              const syntheticTgId = -Math.abs(Number(cabUser.id));
              const plannerUser = db.ensureUser({
                id: syntheticTgId,
                username: cabUser.email ? cabUser.email.split('@')[0] : ('cab' + cabUser.id),
                first_name: [cabUser.firstName, cabUser.lastName].filter(Boolean).join(' ') || cabUser.name || cabUser.email || ('Cab#' + cabUser.id),
              });
              if (plannerUser) {
                req.user = plannerUser;
                return next();
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('[webapp/attach] session bridge failed', e && e.message);
    }

    if (process.env.NODE_ENV === 'development' && req.query.tg_id) {
      const user = db.getUserByTgId(parseInt(req.query.tg_id, 10));
      if (user) { req.user = user; return next(); }
    }

    return res.status(401).json({ error: 'Unauthorized', code: 'WEBAPP_AUTH_FAILED' });
  }

  // ── Multer for conversion endpoint ──────────────────────────────────
  let uploadConf;
  try {
    const multer = require('multer');
    uploadConf = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });
  } catch (_) {
    uploadConf = null;
  }

  // ── Static + join endpoints ─────────────────────────────────────────
  const pubDir = path.join(__dirname, 'public');

  // Direct /meet/:roomId → browser-join.html
  app.get(joinPath, (req, res, next) => {
    if (req.query.conf) return res.sendFile(path.join(pubDir, 'join.html'));
    next();
  });
  app.get(joinPath + '/:roomId', (req, res) => {
    return res.redirect(302, joinPath + '?conf=' + encodeURIComponent(req.params.roomId));
  });

  // Guide (public)
  app.get(base + '/guide', (req, res) => {
    res.sendFile(path.join(pubDir, 'guide.html'));
  });

  // Static assets (conf-ui.js, crypto.js, conference.js, style.css, i18n-conf.js, app.js)
  app.use(
    base,
    express.static(pubDir, {
      etag: false,
      setHeaders: (res, fp) => {
        if (fp.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      },
    }),
  );

  // ── API Routes ──────────────────────────────────────────────────────
  if (uploadConf) {
    app.post(base + '/api/convert-to-mp4', uploadConf.single('file'), async (req, res) => {
      if (!req.file) return res.status(400).json({ error: 'No file' });
      const input = req.file.path;
      const output = input + '.mp4';
      try {
        const { execSync } = require('child_process');
        execSync('ffmpeg -i ' + input + ' -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart -y ' + output, { timeout: 120000 });
        res.download(output, req.body.filename || 'conference.mp4', function () {
          try { fs.unlinkSync(input); fs.unlinkSync(output); } catch (e) {}
        });
      } catch (e) {
        console.error('[webapp] ffmpeg error', e.message);
        res.download(input, (req.body.filename || 'conference').replace('.mp4', '.webm'), function () {
          try { fs.unlinkSync(input); } catch (_) {}
        });
      }
    });
  }

  const P = base;

  // Tasks
  app.get(P + '/api/tasks', authMiddleware, (req, res) => {
    try { res.json({ tasks: db.getTasksForApi(req.user.id, req.query) }); }
    catch (e) { console.error('[webapp] GET tasks', e.message); res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.post(P + '/api/tasks', authMiddleware, (req, res) => {
    try {
      const { title, description, priority, category_id, due_date, due_time } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      res.json({ task: db.createTask(req.user.id, { title: title.trim(), description, priority, category_id, due_date, due_time }) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.put(P + '/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      const task = db.getTaskById(parseInt(req.params.id, 10));
      if (!task || task.user_id !== req.user.id) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
      res.json({ task: db.updateTask(task.id, req.body) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.delete(P + '/api/tasks/:id', authMiddleware, (req, res) => {
    try {
      const task = db.getTaskById(parseInt(req.params.id, 10));
      if (!task || task.user_id !== req.user.id) return res.status(404).json({ error: 'TASK_NOT_FOUND' });
      db.deleteTask(task.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });

  // Categories
  app.get(P + '/api/categories', authMiddleware, (req, res) => {
    try { res.json({ categories: db.getCategories(req.user.id) }); }
    catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.post(P + '/api/categories', authMiddleware, (req, res) => {
    try {
      const { name, emoji } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      res.json({ category: db.createCategory(req.user.id, name.trim(), emoji) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });

  // Habits
  app.get(P + '/api/habits', authMiddleware, (req, res) => {
    try { res.json({ habits: db.getUserHabits(req.user.id) }); }
    catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.post(P + '/api/habits', authMiddleware, (req, res) => {
    try {
      const { title, emoji, frequency } = req.body || {};
      if (!title || !title.trim()) return res.status(400).json({ error: 'EMPTY_TITLE' });
      res.json({ habit: db.createHabit(req.user.id, title.trim(), emoji, frequency) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.post(P + '/api/habits/:id/log', authMiddleware, (req, res) => {
    try {
      const { date } = req.body || {};
      db.logHabit(parseInt(req.params.id, 10), date || new Date().toISOString().split('T')[0]);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });

  // Stats / User
  app.get(P + '/api/stats', authMiddleware, (req, res) => {
    try {
      const { date, start_date, end_date } = req.query;
      if (start_date && end_date) return res.json({ stats: db.getWeeklyStats(req.user.id, start_date, end_date) });
      const stat = db.getDailyStats(req.user.id, date || new Date().toISOString().split('T')[0]);
      res.json({ stat: stat || { tasks_created: 0, tasks_completed: 0, tasks_overdue: 0 } });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.get(P + '/api/user', authMiddleware, (req, res) => {
    res.json({ user: req.user });
  });
  app.put(P + '/api/user/settings', authMiddleware, (req, res) => {
    try {
      db.updateUserSettings(req.user.id, req.body);
      res.json({ user: db.getUserByTgId(req.user.tg_id) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });

  // ── Conference rooms ────────────────────────────────────────────────
  app.get(P + '/api/conf/rooms', authMiddleware, (req, res) => {
    try { res.json({ rooms: db.getUserConfRooms(req.user.id) }); }
    catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.post(P + '/api/conf/rooms', authMiddleware, (req, res) => {
    try {
      const { name, workspace_id } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: 'EMPTY_NAME' });
      res.json({ room: db.createConfRoom(name.trim(), req.user.id, workspace_id || null) });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.get(P + '/api/conf/rooms/:id', authMiddleware, (req, res) => {
    try {
      const room = db.getConfRoom(req.params.id);
      if (!room) return res.status(404).json({ error: 'NOT_FOUND' });
      const messages = db.getConfMessages ? db.getConfMessages(room.id, 50) : [];
      res.json({ room, messages });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });
  app.delete(P + '/api/conf/rooms/:id', authMiddleware, (req, res) => {
    try {
      const room = db.getConfRoom(req.params.id);
      if (!room || room.created_by !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
      db.deactivateConfRoom(room.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: 'DB_ERROR' }); }
  });

  console.log('[webapp] attached: static=' + base + ', join=' + joinPath + ', io=' + (opts.socketPath || '/socket.io/'));
  return io;
}

module.exports = { attachToApp };
