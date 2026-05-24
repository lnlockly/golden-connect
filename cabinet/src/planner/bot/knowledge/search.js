// Keyword-based search over knowledge chunks.
// Loaded once on require() — chunks.json ~2 MB JSON read into memory.
//
// Usage:
//   const { searchKnowledge, formatContext } = require('./knowledge/search');
//   const chunks = searchKnowledge('что такое темпулис', { maxResults: 4 });
//   const context = formatContext(chunks);

const fs = require('fs');
const path = require('path');

const CHUNKS_FILE = path.join(__dirname, 'chunks.json');

let DB = null;

function loadDb() {
  if (DB) return DB;
  try {
    const raw = fs.readFileSync(CHUNKS_FILE, 'utf8');
    DB = JSON.parse(raw);
    console.log(`[knowledge] loaded ${DB.total} chunks (${Math.round(raw.length / 1024)} KB)`);
  } catch (e) {
    console.warn('[knowledge] chunks.json not found, search disabled:', e && e.message);
    DB = { total: 0, chunks: [], keywordIndex: {}, products: [], topics: [], experts: [] };
  }
  return DB;
}

// Normalize query into tokens
function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^\wа-яё\s-]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3);
}

// Map query tokens to known keywords
function extractQueryKeywords(query) {
  const db = loadDb();
  const tokens = tokenize(query);
  const lc = String(query || '').toLowerCase();
  const keywords = new Set();

  // Products — by slug/name match
  for (const p of db.products || []) {
    if (lc.includes(p.slug) || lc.includes(p.name.toLowerCase())) {
      keywords.add(p.slug);
    }
    // Check tokens against short product name
    const shortName = p.name.toLowerCase().split(/\s+/)[0];
    if (shortName.length >= 4 && tokens.some(t => t.startsWith(shortName.slice(0, 5)))) {
      keywords.add(p.slug);
    }
  }

  // Topics — keyword-based
  const TOPIC_HINTS = {
    immunity: ['иммунит', 'простуд', 'грипп', 'защит'],
    antiage: ['старен', 'морщин', 'омолож', 'anti'],
    cosmetology: ['кожа', 'крем', 'уход', 'космет'],
    energy: ['энерги', 'усталост', 'тонус', 'упадок'],
    detox: ['детокс', 'очищ', 'токсин'],
    joints: ['сустав', 'кост', 'артрит', 'связк'],
    thyroid: ['щитовид', 'йод'],
    digestion: ['кишечник', 'желуд', 'пищевар', 'гастр', 'жкт'],
    sleep: ['сон', 'бессон', 'засып'],
    hormones: ['гормон', 'тестостерон', 'эстроген', 'либид'],
    review: ['отзыв', 'помог', 'результат', 'эффект'],
    instruction: ['инструкц', 'применен', 'принимать', 'доз', 'курс', 'схема'],
    contraindication: ['противопок', 'нельзя', 'беремен', 'аллерг'],
    company: ['компани', 'миссия', 'офис', 'разработ', 'сертификат'],
    broadcast: ['эфир', 'встреча', 'конференц', 'выступлен'],
    partner: ['партнёр', 'партнер', 'доля', 'маркетплейс', 'реферал', 'инвест'],
  };
  for (const [topic, hints] of Object.entries(TOPIC_HINTS)) {
    if (hints.some(h => lc.includes(h))) keywords.add(topic);
  }

  // Experts
  for (const e of db.experts || []) {
    if (lc.includes(e.key)) keywords.add('expert:' + e.key);
  }

  return Array.from(keywords);
}

// Score chunk by keyword overlap + text token overlap
function scoreChunk(chunk, queryKeywords, queryTokens) {
  let score = 0;
  // Direct keyword hits
  for (const k of queryKeywords) {
    if (chunk.keywords.includes(k)) score += 10;
  }
  // Token matches in text
  const lcText = chunk.text.toLowerCase();
  for (const t of queryTokens) {
    if (t.length < 4) continue;
    if (lcText.includes(t)) score += 1;
  }
  // Bonus if chunk has multiple keywords relevant to query
  const overlap = chunk.keywords.filter(k => queryKeywords.includes(k)).length;
  if (overlap >= 2) score += 5;
  return score;
}

function searchKnowledge(query, opts = {}) {
  const db = loadDb();
  if (!db.chunks || !db.chunks.length) return [];
  const maxResults = opts.maxResults || 4;
  const categoryFilter = opts.category || null;

  const queryKeywords = extractQueryKeywords(query);
  const queryTokens = tokenize(query);

  if (queryKeywords.length === 0 && queryTokens.length === 0) return [];

  const scored = [];
  for (let i = 0; i < db.chunks.length; i++) {
    const c = db.chunks[i];
    if (categoryFilter && c.category !== categoryFilter) continue;
    const s = scoreChunk(c, queryKeywords, queryTokens);
    if (s > 0) scored.push({ ...c, _score: s });
  }
  scored.sort((a, b) => b._score - a._score);
  return scored.slice(0, maxResults);
}

// Format chunks into AI context string
function formatContext(chunks, opts = {}) {
  if (!chunks || !chunks.length) return '';
  const maxChars = opts.maxChars || 3000;
  const labels = {
    products: 'ПРОДУКТ',
    instructions: 'ИНСТРУКЦИЯ',
    reviews: 'ОТЗЫВ',
    company: 'КОМПАНИЯ',
    events: 'ЭФИР',
    business: 'БИЗНЕС',
  };
  const blocks = [];
  let totalChars = 0;
  for (const c of chunks) {
    const label = labels[c.category] || c.category.toUpperCase();
    const block = `[${label}]\n${c.text}`;
    if (totalChars + block.length > maxChars) break;
    blocks.push(block);
    totalChars += block.length;
  }
  if (!blocks.length) return '';
  return '\n\n=== ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ (из базы знаний Golden Connect) ===\n\n' +
    blocks.join('\n\n---\n\n');
}

function getStats() {
  const db = loadDb();
  return {
    total: db.total,
    byCategory: db.stats,
    builtAt: db.builtAt,
  };
}

module.exports = { searchKnowledge, formatContext, extractQueryKeywords, tokenize, getStats };
