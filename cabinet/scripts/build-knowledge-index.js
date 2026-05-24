#!/usr/bin/env node
// Build knowledge index from telegram exports.
// Reads: data/telegram-exports/goldenConnect_and_beauty/text-knowledge/*.md
// Writes: src/planner/bot/knowledge/chunks.json
//
// Usage: npm run build:knowledge
//        node scripts/build-knowledge-index.js
//
// Each .md file contains telegram messages in format:
//   ## <timestamp> | #<message-id>
//   <message text>
//   Источник: https://t.me/...

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'data', 'telegram-exports', 'goldenConnect_and_beauty', 'text-knowledge');
const OUTPUT_DIR = path.join(__dirname, '..', 'src', 'planner', 'bot', 'knowledge');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'chunks.json');

// Product names — used for keyword extraction
const PRODUCTS = [
  { key: 'темпулис', name: 'Темпулис', slug: 'tempulis' },
  { key: 'живая вода', name: 'Живая вода', slug: 'live-water' },
  { key: 'дигидрокверцетин', name: 'Дигидрокверцетин', slug: 'dihydroquercetin' },
  { key: 'олигохит-йод', name: 'Олигохит-Йод 53', slug: 'oligohit-iod-53' },
  { key: 'йод 53', name: 'Олигохит-Йод 53', slug: 'oligohit-iod-53' },
  { key: 'олигохит-остео', name: 'Олигохит-Остео', slug: 'oligohit-osteo' },
  { key: 'олигохит остео', name: 'Олигохит-Остео', slug: 'oligohit-osteo' },
  { key: 'олигохит zoo', name: 'Олигохит ZOO', slug: 'oligohit-zoo' },
  { key: 'олигохит', name: 'Олигохит', slug: 'oligohit' },
  { key: 'hitabs', name: 'Hitabs', slug: 'hitabs' },
  { key: 'хитабс', name: 'Hitabs', slug: 'hitabs' },
  { key: 'h538', name: 'H538 Сыворотка', slug: 'h538' },
  { key: 'сыворотка h538', name: 'H538 Сыворотка', slug: 'h538' },
  { key: 'ревентус', name: 'Ревентус', slug: 'reventus' },
  { key: 'омега-3', name: 'Омега-3', slug: 'omega-3' },
  { key: 'омега 3', name: 'Омега-3', slug: 'omega-3' },
  { key: 'борофлавин', name: 'Борофлавин', slug: 'boroflavin' },
  { key: 'provitera', name: 'PROVITERA', slug: 'provitera' },
  { key: 'провитера', name: 'PROVITERA', slug: 'provitera' },
  { key: 'формидиум', name: 'Формидиум', slug: 'formidium' },
  { key: 'днк', name: 'ДНК', slug: 'dna' },
  { key: 'бальзам премиум', name: 'Бальзам Премиум', slug: 'vedov-balm' },
  { key: 'бальзам ведова', name: 'Бальзамы Ведова', slug: 'vedov-balm' },
  { key: 'бальзамы ведова', name: 'Бальзамы Ведова', slug: 'vedov-balm' },
  { key: 'ведов', name: 'Бальзамы Ведова', slug: 'vedov-balm' },
  { key: 'alfa нектар', name: 'ALFA Нектар', slug: 'alfa-nectar' },
  { key: 'альфа нектар', name: 'ALFA Нектар', slug: 'alfa-nectar' },
  { key: 'silverfleece', name: 'SilverFleece', slug: 'silverfleece' },
  { key: 'серебряные нити', name: 'Серебряные нити', slug: 'silverfleece' },
  { key: 'наносеребро', name: 'Наносеребро', slug: 'silver' },
  { key: 'гексанидин', name: 'Гексанидин', slug: 'hexanidine' },
  { key: 'гиксанидин', name: 'Гексанидин', slug: 'hexanidine' },
  // Новые продукты из Google Drive
  { key: 'меларис', name: 'Меларис', slug: 'melaris' },
  { key: 'туберлин', name: 'Туберлин', slug: 'tuberlin' },
  { key: 'циналис', name: 'Циналис', slug: 'tsinaliz' },
  { key: 'скаверан', name: 'Скаверан', slug: 'skaveran' },
  { key: 'псоремаре', name: 'ПСОРЕМАРЕ', slug: 'psoremarie' },
  { key: 'кальций', name: 'Кальций', slug: 'calcium' },
  { key: 'б-кондиционер', name: 'Б-Кондиционер', slug: 'b-conditioner' },
  { key: 'б кондиционер', name: 'Б-Кондиционер', slug: 'b-conditioner' },
  { key: 'океан биотик', name: 'Океан Биотик', slug: 'ocean-biotic' },
  { key: 'активатор 19', name: 'Активатор 19л', slug: 'aktivator-19l' },
  { key: 'шампунь', name: 'Шампунь Golden Connect', slug: 'shampun' },
  { key: 'энинохром', name: 'Энинохром', slug: 'eninohrom' },
  { key: 'скорая помощь', name: 'Скорая помощь', slug: 'skoraya-pomosh' },
  { key: 'гель ведова', name: 'Гель Ведова', slug: 'gel-vedova' },
  { key: 'бальзам 7', name: 'Бальзам №7', slug: 'balzam-7' },
  { key: 'бальзам №7', name: 'Бальзам №7', slug: 'balzam-7' },
  { key: 'бальзам премиум', name: 'Бальзам Премиум', slug: 'balzam-premium' },
  { key: 'nano', name: 'НАНО Серебро', slug: 'nano-silver' },
  { key: 'нано серебро', name: 'НАНО Серебро', slug: 'nano-silver' },
];

// Topic keywords → category tag
const TOPICS = {
  immunity:      ['иммунит', 'иммуно', 'простуд', 'грипп', 'орв', 'защит'],
  antiage:       ['anti-age', 'антиэйдж', 'старен', 'морщин', 'омоложен'],
  cosmetology:   ['косметолог', 'кожа лица', 'крем', 'уход', 'космет'],
  energy:        ['энерги', 'тонус', 'усталост', 'упадок сил'],
  detox:         ['детокс', 'очищен', 'токсин', 'шлак'],
  joints:        ['сустав', 'кост', 'связк', 'остеопор', 'артрит'],
  thyroid:       ['щитовидк', 'щитовидн', 'йод'],
  digestion:     ['кишечник', 'желудок', 'пищевар', 'гастр', 'жкт'],
  sleep:         ['сон', 'бессонн', 'засыпан'],
  hormones:      ['гормон', 'тестостерон', 'эстроген', 'либид'],
  review:        ['отзыв', 'помог', 'результат', 'после курса', 'эффект'],
  instruction:   ['инструкц', 'применен', 'как принимать', 'доз', 'курс', 'схема'],
  contraindication: ['противопоказ', 'нельзя', 'беремен', 'аллерг'],
  company:       ['компания', 'миссия', 'офис', 'разработ', 'производств', 'сертификат'],
  broadcast:     ['эфир', 'встреча', 'онлайн-конференц', 'конференция', 'выступлен'],
  partner:       ['партнёр', 'доля', 'маркетплейс', 'реферал', 'инвест'],
  cardiovascular: ['сердц', 'сосуд', 'давлен', 'кровообращ', 'гипертон'],
  antiviral:     ['вирус', 'антивирус', 'антибакт', 'антисептик', 'инфекц'],
  respiratory:   ['лёгк', 'бронх', 'дыхател', 'кашел', 'туберк'],
  skin:          ['псориаз', 'экзем', 'дерматит', 'папиллом', 'бородавк'],
  antiparasitic: ['паразит', 'гельминт', 'глист', 'антипаразит'],
  hair:          ['волос', 'выпаден', 'шампун'],
  composition:   ['состав', 'компонент', 'ингредиент', 'формула'],
  effect:        ['эффект', 'действи', 'свойств', 'польз', 'показан'],
};

// Expert names
const EXPERTS = [
  { key: 'чернин', name: 'Чернин В.В.', role: 'профессор-гастроэнтеролог' },
  { key: 'ведов', name: 'Ю. Ведов', role: 'автор линии бальзамов' },
  { key: 'пашнюк', name: 'Д.И. Пашнюк', role: 'океанолог, микробиолог' },
  { key: 'аванесов', name: 'Олег Аванесов', role: 'специалист БИОХИМ' },
  { key: 'румянцев', name: 'Н. Румянцев', role: 'врач-хирург, физиотерапевт' },
  { key: 'орехова', name: 'Людмила Орехова', role: 'совладелец' },
];

function extractKeywords(text) {
  const lc = text.toLowerCase();
  const keywords = new Set();
  // Products
  for (const p of PRODUCTS) {
    if (lc.includes(p.key)) keywords.add(p.slug);
  }
  // Topics
  for (const [topic, words] of Object.entries(TOPICS)) {
    if (words.some(w => lc.includes(w))) keywords.add(topic);
  }
  // Experts
  for (const e of EXPERTS) {
    if (lc.includes(e.key)) keywords.add('expert:' + e.key);
  }
  return Array.from(keywords);
}

function cleanText(text) {
  return String(text || '')
    .replace(/Источник: https?:\/\/\S+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const MIN_LEN = 80;
const MAX_LEN = 1400;
const MIN_LEN_NO_KEYWORD = 250;
const seenTextHashes = new Set();

function hashText(s) {
  // Simple hash for dedup (normalize whitespace + lowercase + first 200 chars)
  return s.toLowerCase().replace(/\s+/g, ' ').slice(0, 200);
}

const JUNK_PATTERNS = [
  /^(здравствуйте|привет|здраствуйте|добрый (день|вечер|утро))/i,
  /^(где|как|куда|кто|можно ли|а (где|как))/i,
  /^(\+|спасибо|благодарю|ок|хорошо|понятно|согласен)[!\.,\s]*$/i,
  /^(да|нет|ага|не знаю|не помню)[!\.,\s]*$/i,
  /^напиш/i,
  /^(в лс|в личку|пишите)/i,
];

function isJunk(text) {
  if (text.length < MIN_LEN) return true;
  for (const p of JUNK_PATTERNS) {
    if (p.test(text) && text.length < 200) return true;
  }
  // Too many emoji-only lines
  const stripped = text.replace(/[\p{Emoji}\s]/gu, '');
  if (stripped.length < 30) return true;
  return false;
}

function parseMdFile(filePath, category) {
  const content = fs.readFileSync(filePath, 'utf8');
  const chunks = [];
  const sections = content.split(/\n(?=## )/);
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const lines = section.split('\n');
    const firstLine = lines[0] || '';
    if (!firstLine.startsWith('## ')) continue;
    const headerMatch = firstLine.match(/^## ([^|]+)\|\s*#(\d+)/);
    const timestamp = headerMatch ? headerMatch[1].trim() : '';
    const msgId = headerMatch ? headerMatch[2] : '';
    let body = lines.slice(1).join('\n');
    let cleaned = cleanText(body);

    if (isJunk(cleaned)) continue;
    // Truncate very long messages
    if (cleaned.length > MAX_LEN) cleaned = cleaned.slice(0, MAX_LEN).replace(/\s+\S*$/, '') + '…';

    const kw = extractKeywords(cleaned);
    // Must have at least one keyword OR be long informative text
    if (kw.length === 0 && cleaned.length < MIN_LEN_NO_KEYWORD) continue;

    // Dedup near-identical texts
    const h = hashText(cleaned);
    if (seenTextHashes.has(h)) continue;
    seenTextHashes.add(h);

    chunks.push({
      id: `${category.slice(0, 3)}_${msgId}`,
      category,
      keywords: kw,
      text: cleaned,
    });
  }
  return chunks;
}

function main() {
  console.log('Building knowledge index from:', KNOWLEDGE_DIR);
  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error('Knowledge directory not found!');
    process.exit(1);
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const files = [
    { path: 'products.md',         category: 'products' },
    { path: 'instructions_usage.md', category: 'instructions' },
    { path: 'reviews.md',          category: 'reviews' },
    { path: 'company.md',          category: 'company' },
    { path: 'events_broadcasts.md', category: 'events' },
    { path: 'business_context.md', category: 'business' },
  ];

  const allChunks = [];
  const stats = {};

  for (const f of files) {
    const fullPath = path.join(KNOWLEDGE_DIR, f.path);
    if (!fs.existsSync(fullPath)) {
      console.warn(`Skip missing: ${f.path}`);
      continue;
    }
    const chunks = parseMdFile(fullPath, f.category);
    stats[f.category] = chunks.length;
    allChunks.push(...chunks);
    console.log(`  ${f.category.padEnd(15)} → ${chunks.length} chunks`);
  }

  // Build keyword index (keyword → array of chunk indices)
  const keywordIndex = {};
  allChunks.forEach((c, i) => {
    for (const k of c.keywords) {
      if (!keywordIndex[k]) keywordIndex[k] = [];
      keywordIndex[k].push(i);
    }
  });

  const output = {
    builtAt: new Date().toISOString(),
    total: allChunks.length,
    stats,
    products: PRODUCTS.map(p => ({ slug: p.slug, name: p.name })),
    topics: Object.keys(TOPICS),
    experts: EXPERTS,
    keywordIndex,
    chunks: allChunks,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  const sizeKb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);
  console.log('');
  console.log('✅ Index built:');
  console.log(`   File: ${OUTPUT_FILE}`);
  console.log(`   Size: ${sizeKb} KB`);
  console.log(`   Total chunks: ${allChunks.length}`);
  console.log(`   Unique keywords: ${Object.keys(keywordIndex).length}`);
}

main();
