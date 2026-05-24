// Daily auto-generated event invitation — fresh text + image every day.
//
// Picks a RANDOM theme (no repeats over last 7 days), generates a cool
// emoji-rich HTML body via Groq highlighting real platform features (no MLM
// terms), and renders a colourful themed cover image (sharp+SVG). Cached per
// calendar day so all phase-broadcasts that day share one consistent invite.
//
// Public: getDailyInvite() -> { body, themeTitle, coverImage }  (async)

const fs = require('fs');
const path = require('path');
let sharp = null; try { sharp = require('sharp'); } catch (_) {}

const DATA_DIR = process.env.DATA_DIR || '/data';
const IMG_DIR = path.join(DATA_DIR, 'ads', 'event-invite');
const LOG_PATH = path.join(DATA_DIR, 'event-invite-log.json');   // recent themes + daily cache

const GROQ_KEYS = String(process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '')
  .split(',').map(s => s.trim()).filter(Boolean);
let _gi = 0;
function _key() { return GROQ_KEYS.length ? GROQ_KEYS[_gi++ % GROQ_KEYS.length] : null; }

// ── Theme pool — each = an angle + features + a gradient ──
const THEMES = [
  { id: 'ai-tools',  title: 'AI-инструменты Trendex', tone: 'польза', grad: ['#7C3AED','#00D4FF'],
    features: ['AI-рассылки в Telegram с авто-вариациями', 'CRM с авто-разведкой лидов', 'AI-копирайтер и хэштеги', 'транскрибация видео'] },
  { id: 'tg-rent',   title: 'Аренда TG-аккаунтов', tone: 'возможности', grad: ['#0ea5e9','#2563eb'],
    features: ['аренда прогретых TG-аккаунтов', 'массовые рассылки без банов', 'антибан и прокси из коробки', 'свои аккаунты через TDATA'] },
  { id: 'earn',      title: 'Способы заработка', tone: 'мотивация', grad: ['#10b981','#059669'],
    features: ['биржа заданий за $0.05+', 'маркетплейс товаров и услуг', 'партнёрская программа', 'P2P-обмен TRDX на USD'] },
  { id: 'crm',       title: 'CRM и работа с лидами', tone: 'польза', grad: ['#8b5cf6','#ec4899'],
    features: ['CRM с базой 9800+ контактов', 'массовая рассылка первого сообщения', 'персональный пул лидов', 'рабочие команды и доска задач'] },
  { id: 'tools-mini',title: 'Мини-сервисы', tone: 'польза', grad: ['#f59e0b','#d97706'],
    features: ['сократитель ссылок с аналитикой', 'Bio-страница как Linktree', 'QR-генератор', 'баннерная реклама на сайтах'] },
  { id: 'start',     title: 'Быстрый старт новичка', tone: 'мотивация', grad: ['#ff2e97','#b14aff'],
    features: ['Путь к первому результату с наградой TRDX', 'бесплатный старт без вложений', 'мгновенные выплаты', 'AI подберёт твой путь'] },
  { id: 'team',      title: 'Командная работа', tone: 'возможности', grad: ['#06b6d4','#3b82f6'],
    features: ['рабочие команды с ролями', 'общая доска задач', 'мульти-аккаунты', 'лента активности команды'] },
];

const TONES = {
  'польза':       'Сделай акцент на пользе и экономии времени.',
  'мотивация':    'Мотивируй, покажи что заработок реален и старт простой.',
  'возможности':  'Покажи масштаб возможностей, создай интерес и лёгкое FOMO.',
};

function _today() { return new Date().toISOString().slice(0, 10); }
function _readLog() { try { return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8')); } catch (_) { return { recent: [], cache: {} }; } }
function _writeLog(o) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(LOG_PATH, JSON.stringify(o)); } catch (e) { console.error('[event-invite] log write', e.message); } }

function _pickTheme(recent) {
  const avail = THEMES.filter(t => !recent.includes(t.id));
  const pool = avail.length ? avail : THEMES;     // if all used in 7d, allow all
  return pool[Math.floor(Math.random() * pool.length)];
}

async function _genText(theme) {
  if (!GROQ_KEYS.length) return null;
  const prompt = `Напиши тело приглашения на живой эфир платформы Trendex.
Тема дня: «${theme.title}».
Подсветь эти возможности (выбери 3-4, своими словами): ${theme.features.join('; ')}.
Тон: ${TONES[theme.tone] || ''}
Требования:
- 2-4 коротких предложения, живо и по-русски
- ОБЯЗАТЕЛЬНО эмодзи в тексте
- выдели 2-3 ключевых слова жирным через HTML-теги <b>...</b> (только <b>, ничего больше)
- ЗАПРЕЩЕНО: слова "Matching Bonus", "Лидерский пул", "уровни партнёрки", "профессора", "матрица" — мы ушли от MLM-подачи
- НЕ пиши заголовок и дату — только тело "почему стоит прийти"
- без ссылок
Верни только готовый текст.`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _key() },
      body: JSON.stringify({
        model: process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
        temperature: 0.9, max_tokens: 400,
        messages: [
          { role: 'system', content: 'Ты пишешь короткие цепляющие приглашения на эфиры. Только готовый текст, без преамбулы.' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    let t = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!t) return null;
    t = t.trim();
    // strip any disallowed tags except <b>
    t = t.replace(/<(?!\/?b>)[^>]*>/g, '');
    // ensure space after punctuation that got glued to a following word
    t = t.replace(/([,.!?;:])(?=[^\s.,!?;:])/g, '$1 ');
    // drop stray lowercase-latin filler words (model artifacts like "thanks");
    // brand terms (TG, AI, CRM, TDATA, TRDX, P2P…) are uppercase so survive
    t = t.replace(/\b[a-z]{2,}\b/g, '').replace(/ {2,}/g, ' ').replace(/ ([,.!?;:])/g, '$1');
    return t.trim();
  } catch (e) { console.warn('[event-invite] groq', e.message); return null; }
}

function _escSvg(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

async function _genImage(theme, dateStr) {
  if (!sharp) return null;
  try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch (_) {}
  const out = path.join(IMG_DIR, dateStr + '.png');
  const W = 1200, H = 675;
  const [c1, c2] = theme.grad;
  // feature bullets (max 4)
  const feats = theme.features.slice(0, 4);
  const featSvg = feats.map((f, i) =>
    `<text x="90" y="${360 + i * 64}" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="34" fill="#ffffff" opacity="0.95">• ${_escSvg(f.slice(0, 46))}</text>`
  ).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.25"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="90" y="130" font-family="Helvetica,Arial,sans-serif" font-weight="900" font-size="56" fill="#ffffff" letter-spacing="6">TRENDEX</text>
  <text x="90" y="180" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="26" fill="#ffffff" opacity="0.85">🔴 ЖИВОЙ ЭФИР · БУДЬ В ТРЕНДЕ</text>
  <text x="90" y="285" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="52" fill="#ffffff">${_escSvg(theme.title)}</text>
  ${featSvg}
  <text x="90" y="${H - 50}" font-family="Helvetica,Arial,sans-serif" font-weight="600" font-size="30" fill="#ffffff" opacity="0.9">trendex.biz · регистрация бесплатно</text>
</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toFile(out);
  return '/cabinet/ads-asset/event-invite/' + dateStr + '.png';
}

// Main — returns today's invite, generating + caching once per day.
async function getDailyInvite() {
  const today = _today();
  const log = _readLog();
  if (log.cache && log.cache[today]) return log.cache[today];

  const recent = (log.recent || []).slice(-7).map(r => r.id || r);
  const theme = _pickTheme(recent);
  let body = await _genText(theme);
  if (!body) {
    // graceful fallback (still themed, no MLM terms)
    body = `Покажем вживую, как использовать <b>${theme.title.toLowerCase()}</b> на максимум 🚀\n` +
      theme.features.slice(0, 3).map(f => '✅ ' + f).join('\n') + '\n\nОтветим на все вопросы 💬';
  }
  let coverImage = null;
  try { coverImage = await _genImage(theme, today); } catch (e) { console.warn('[event-invite] image', e.message); }

  const result = { body, themeTitle: theme.title, coverImage };
  log.cache = log.cache || {};
  // keep cache small — only last 3 days
  const days = Object.keys(log.cache).sort();
  while (days.length > 3) { delete log.cache[days.shift()]; }
  log.cache[today] = result;
  log.recent = (log.recent || []).concat([{ id: theme.id, date: today }]).slice(-7);
  _writeLog(log);
  return result;
}

module.exports = { getDailyInvite, THEMES };
