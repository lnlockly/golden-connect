// Express routes for Monar cabinet UI. Dormant: not mounted in server.js.
// Each handler returns a plain HTML stub. Replace with real templates
// during activation.

const express = require('express');
const api = require('./api-client');

function render(title, body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<title>${title} — Monar</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;margin:40px;max-width:780px;color:#1d1a16}
h1{margin:0 0 12px}code{background:#f3eee5;padding:2px 6px;border-radius:6px}</style>
</head><body><h1>${title}</h1>${body}
<p style="margin-top:32px;color:#888"><small>Monar is dormant. See <code>cabinet/src/monar/README.md</code>.</small></p>
</body></html>`;
}

const router = express.Router();

router.get('/lots', async (_req, res) => {
  res.type('html').send(render('Лоты', '<p>Список лотов появится после активации Monar.</p>'));
});

router.get('/team', async (_req, res) => {
  res.type('html').send(render('Команда', '<p>Реферальная команда появится после активации Monar.</p>'));
});

router.get('/card', async (_req, res) => {
  res.type('html').send(render('Карта', '<p>Баланс и выплаты появятся после активации Monar.</p>'));
});

router.get('/admin', async (_req, res) => {
  res.type('html').send(render('Monar admin', '<p>Управление правилами и симуляция появятся после активации.</p>'));
});

router.get('/admin/simulate', async (_req, res) => {
  res.type('html').send(render('Симуляция Monar', '<p>UI симуляции появится после активации.</p>'));
});

// Sanity ping that uses the api-client. Returns whatever goldenConnect-api says.
// Until /api/monar/* is mounted there, this will 404 — that is expected.
router.get('/health', async (_req, res) => {
  try {
    const r = await api.health();
    res.json({ ok: true, upstream: r });
  } catch (e) {
    res.status(502).json({ ok: false, error: String((e && e.message) || e) });
  }
});

module.exports = router;
