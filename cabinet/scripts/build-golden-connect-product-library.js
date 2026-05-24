#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { buildSiteContent } = require('../src/site-content');
const config = require('../src/config');

const ROOT = path.join(__dirname, '..');
const EXPORT_ROOT = path.join(ROOT, 'data', 'telegram-exports', 'goldenConnect_and_beauty');
const KNOWLEDGE_FILE = path.join(EXPORT_ROOT, 'text-knowledge', 'raw', 'all_useful.jsonl');
const CHAT_META_FILE = path.join(EXPORT_ROOT, 'chat.json');
const OUTPUT_DIR = path.join(ROOT, 'public', 'site', 'data');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'golden-connect-product-library.json');

const PRODUCT_ALIASES = {
  'live-water': ['живая вода', 'биоактиватор питьевой воды', 'биоактиватор воды', 'активатор воды', 'живаявода'],
  'dihydroquercetin': ['дигидрокверцетин', 'мицеллированный дигидрокверцетин', 'мицеллированный дигидрокверцитин'],
  'oligochit-iod-53': ['олигохит йод 53', 'олигохит-йод 53', 'йод 53'],
  'oligochit-osteo': ['олигохит остео', 'олигохит-остео'],
  'oligochit-zoo': ['олигохит zoo', 'олигохит-zoo', 'олигохит для животных'],
  'hitabs': ['hitabs', 'хитабс', 'пастилки hitabs'],
  'h538': ['h538', 'сыворотка h538', 'наноуглеродная сыворотка h538'],
  'tempulis': ['темпулис'],
  'tuberlin-c6': ['туберлин c6', 'туберлин'],
  'cinalis-c6': ['циналис c6', 'циналис'],
  'reventus': ['ревентус'],
  'skaveran': ['скаверан'],
  'melaris': ['меларис'],
  'alfa-nektar': ['alfa нектар', 'альфа нектар', 'alfa nectar'],
  'geksanidin': ['гексанидин', 'гиксанидин'],
  'provitera': ['provitera', 'гель provitera', 'наносеребро', 'silverfleece', 'серебряный гель'],
  'omega-3': ['омега 3', 'омега-3', 'omega 3', 'omega-3'],
  'calcium': ['кальций'],
  'dna': ['днк', 'рнк', 'днк рнк', 'днк / рнк'],
  'formidium': ['формидиум', 'phormidium'],
  'boroflavin': ['борофлавин'],
  'premium-balm': ['бальзам премиум', 'бальзам ведова премиум', 'ведова премиум'],
  'hair-balm': ['бальзам для головы и волос', 'для головы и волос'],
  'ambulance-balm': ['бальзам скорая помощь', 'скорая помощь'],
  'phytoshampoo': ['фитошампунь'],
};

const PRODUCT_LABEL_MAP = {
  'живая вода': ['live-water'],
  'дигидрокверцетин': ['dihydroquercetin'],
  'йод 53': ['oligochit-iod-53'],
  'сыворотка h538': ['h538'],
  'темпулис': ['tempulis'],
  'наносеребро': ['provitera'],
  'бальзам премиум': ['premium-balm'],
  'борофлавин': ['boroflavin'],
  'гиксанидин': ['geksanidin'],
  'гексанидин': ['geksanidin'],
  'омега 3': ['omega-3'],
  'кальций': ['calcium'],
  'днк': ['dna'],
  'рнк': ['dna'],
  'днк рнк': ['dna'],
  'формидиум': ['formidium'],
  'ревентус': ['reventus'],
  'скаверан': ['skaveran'],
  'туберлин c6': ['tuberlin-c6'],
  'циналис c6': ['cinalis-c6'],
  'меларис': ['melaris'],
  'альфа нектар': ['alfa-nektar'],
  'alfa нектар': ['alfa-nektar'],
  'олигохит йод 53': ['oligochit-iod-53'],
  'олигохит остео': ['oligochit-osteo'],
  'олигохит zoo': ['oligochit-zoo'],
};

const CATEGORY_ORDER = ['products', 'reviews', 'instructions_usage', 'events_broadcasts', 'company', 'business_context'];
const CATEGORY_TITLES = {
  products: 'О продукте',
  reviews: 'Отзывы и опыт',
  instructions_usage: 'Применение и вопросы',
  events_broadcasts: 'Эфиры и анонсы',
  company: 'Контекст компании',
  business_context: 'Партнёрский контекст',
};

const DEFAULT_CHAT_URL = 'https://t.me/X_Health_and_Beauty';

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”'`]/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toHaystack(value) {
  const normalized = normalize(value);
  return normalized ? ` ${normalized} ` : ' ';
}

function includesAlias(haystack, alias) {
  const needle = toHaystack(alias);
  return needle.trim() ? haystack.includes(needle) : false;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    const scoreDiff = Number(b.score || 0) - Number(a.score || 0);
    if (scoreDiff) return scoreDiff;
    const dateDiff = new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    if (dateDiff) return dateDiff;
    return String(b.text || '').length - String(a.text || '').length;
  });
}

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toExcerpt(text, max = 360) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

function getProductFamily(productId) {
  const families = {
    'live-water': 'Базовая линия воды и антиоксидантов',
    'dihydroquercetin': 'Базовая линия воды и антиоксидантов',
    'oligochit-iod-53': 'Линейка Олигохит',
    'oligochit-osteo': 'Линейка Олигохит',
    'oligochit-zoo': 'Линейка Олигохит',
    'hitabs': 'Базовая линия воды и антиоксидантов',
    'h538': 'Косметология и anti-age',
    'tempulis': 'Косметология и anti-age',
    'tuberlin-c6': 'Курсовые продукты',
    'cinalis-c6': 'Курсовые продукты',
    'reventus': 'Косметология и anti-age',
    'skaveran': 'Косметология и anti-age',
    'melaris': 'Косметология и anti-age',
    'alfa-nektar': 'Ежедневная поддержка и энергия',
    'geksanidin': 'Защита и антисептика',
    'provitera': 'Серебряные технологии',
    'omega-3': 'Ежедневная нутрицевтика',
    'calcium': 'Ежедневная нутрицевтика',
    'dna': 'Ежедневная нутрицевтика',
    'formidium': 'Ежедневная нутрицевтика',
    'boroflavin': 'Ежедневная нутрицевтика',
    'premium-balm': 'Бальзамы и восстановление',
    'hair-balm': 'Бальзамы и восстановление',
    'ambulance-balm': 'Бальзамы и восстановление',
    'phytoshampoo': 'Бальзамы и восстановление',
  };
  return families[productId] || 'Продуктовая линия Golden Connect';
}

function getProductImage(productId) {
  return `/media/products/${productId}.jpg`;
}

function resolveProductIdsFromLabels(labels) {
  const ids = new Set();
  for (const label of Array.isArray(labels) ? labels : []) {
    const normalized = normalize(label);
    if (!normalized) continue;
    const direct = PRODUCT_LABEL_MAP[normalized];
    if (direct) {
      direct.forEach((id) => ids.add(id));
      continue;
    }
    for (const [productId, aliases] of Object.entries(PRODUCT_ALIASES)) {
      if (aliases.some((alias) => normalized === normalize(alias))) ids.add(productId);
    }
  }
  return Array.from(ids);
}

function resolveTeacherProductIds(teacher, products) {
  const ids = new Set(resolveProductIdsFromLabels(teacher.products));
  if (ids.size) return Array.from(ids);

  const teacherHaystack = toHaystack([
    teacher.name,
    teacher.title,
    teacher.summary,
    ...(Array.isArray(teacher.details) ? teacher.details : []),
  ].join(' '));

  for (const product of products) {
    const aliases = [product.title, ...(PRODUCT_ALIASES[product.id] || [])];
    if (aliases.some((alias) => includesAlias(teacherHaystack, alias))) ids.add(product.id);
  }

  return Array.from(ids);
}

function matchProducts(entry, products) {
  const ids = new Set(resolveProductIdsFromLabels(entry.products));
  const haystack = toHaystack(entry.text);

  for (const product of products) {
    const aliases = [product.title, ...(PRODUCT_ALIASES[product.id] || [])];
    if (aliases.some((alias) => includesAlias(haystack, alias))) ids.add(product.id);
  }

  return Array.from(ids);
}

function pickFeatured(entries, category, limit = 4) {
  const filtered = category
    ? entries.filter((entry) => Array.isArray(entry.categories) && entry.categories.includes(category))
    : entries;
  return sortEntries(filtered).slice(0, limit);
}

function getDateRange(entries) {
  const dates = entries
    .map((entry) => String(entry.date || '').trim())
    .filter(Boolean)
    .sort();
  return {
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
  };
}

function enrichEntry(entry) {
  return {
    id: entry.id,
    date: entry.date,
    score: Number(entry.score || 0),
    url: entry.url || '',
    text: String(entry.text || '').trim(),
    excerpt: toExcerpt(entry.text, 320),
    categories: uniqueBy(Array.isArray(entry.categories) ? entry.categories : [], (item) => item),
  };
}

function createProductPayload(product, entries, relatedTeachers) {
  const sortedEntries = sortEntries(uniqueBy(entries, (item) => item.id));
  const stats = {
    total: sortedEntries.length,
    products: sortedEntries.filter((item) => item.categories.includes('products')).length,
    reviews: sortedEntries.filter((item) => item.categories.includes('reviews')).length,
    instructions: sortedEntries.filter((item) => item.categories.includes('instructions_usage')).length,
    broadcasts: sortedEntries.filter((item) => item.categories.includes('events_broadcasts')).length,
    company: sortedEntries.filter((item) => item.categories.includes('company')).length,
    business: sortedEntries.filter((item) => item.categories.includes('business_context')).length,
  };
  const range = getDateRange(sortedEntries);

  return {
    id: product.id,
    slug: product.slug,
    title: product.title,
    category: product.category || '',
    family: getProductFamily(product.id),
    format: product.format || '',
    priceRub: product.priceRub || null,
    priceLabel: product.priceLabel || '',
    shortDescription: product.shortDescription || '',
    story: product.story || '',
    useCases: Array.isArray(product.useCases) ? product.useCases : [],
    sourceUrl: product.sourceUrl || '',
    instructionsUrl: product.instructionsUrl || '',
    imageUrl: getProductImage(product.id),
    productPageUrl: `/product/${product.slug}`,
    relatedTeachers: relatedTeachers.map((teacher) => ({
      name: teacher.name,
      title: teacher.title || '',
      summary: teacher.summary || '',
      image: teacher.image ? `/${String(teacher.image).replace(/^\/+/, '')}` : '',
      focus: Array.isArray(teacher.focus) ? teacher.focus : [],
      details: Array.isArray(teacher.details) ? teacher.details : [],
    })),
    stats,
    dateRange: range,
    featured: {
      overview: pickFeatured(sortedEntries, 'products', 4),
      reviews: pickFeatured(sortedEntries, 'reviews', 4),
      instructions: pickFeatured(sortedEntries, 'instructions_usage', 4),
      broadcasts: pickFeatured(sortedEntries, 'events_broadcasts', 3),
      company: pickFeatured(sortedEntries, 'company', 3),
    },
    allEntries: sortedEntries,
  };
}

function main() {
  if (!fs.existsSync(KNOWLEDGE_FILE)) {
    console.error(`Knowledge file not found: ${KNOWLEDGE_FILE}`);
    process.exit(1);
  }

  const siteContent = buildSiteContent(config);
  const products = Array.isArray(siteContent.products) ? siteContent.products : [];
  const teachers = Array.isArray(siteContent.teachers) ? siteContent.teachers : [];
  const allEntries = readJsonl(KNOWLEDGE_FILE).map(enrichEntry);
  const chatMeta = fs.existsSync(CHAT_META_FILE) ? JSON.parse(fs.readFileSync(CHAT_META_FILE, 'utf8')) : null;

  const teacherProductMap = new Map();
  for (const teacher of teachers) {
    const relatedIds = resolveTeacherProductIds(teacher, products);
    for (const productId of relatedIds) {
      const bucket = teacherProductMap.get(productId) || [];
      bucket.push(teacher);
      teacherProductMap.set(productId, bucket);
    }
  }

  const productEntriesMap = new Map(products.map((product) => [product.id, []]));
  const generalEntries = [];
  const matchedIds = new Set();

  for (const entry of allEntries) {
    const matchedProductIds = matchProducts(entry, products);
    if (!matchedProductIds.length) {
      if (entry.categories.some((category) => CATEGORY_ORDER.includes(category))) generalEntries.push(entry);
      continue;
    }
    matchedProductIds.forEach((productId) => {
      const bucket = productEntriesMap.get(productId);
      if (bucket) bucket.push(entry);
      matchedIds.add(entry.id);
    });
  }

  const productPayloads = products.map((product) => {
    const relatedTeachers = uniqueBy(teacherProductMap.get(product.id) || [], (teacher) => teacher.name);
    return createProductPayload(product, productEntriesMap.get(product.id) || [], relatedTeachers);
  });

  const categories = uniqueBy(products.map((product) => product.category).filter(Boolean), (item) => item).sort((a, b) => a.localeCompare(b, 'ru'));
  const families = uniqueBy(productPayloads.map((product) => product.family).filter(Boolean), (item) => item).sort((a, b) => a.localeCompare(b, 'ru'));
  const productsWithEvidence = productPayloads.filter((product) => product.stats.total > 0).length;
  const allMatchedEntries = uniqueBy(productPayloads.flatMap((product) => product.allEntries), (entry) => entry.id);
  const generalUsefulEntries = sortEntries(uniqueBy(generalEntries, (entry) => entry.id)).slice(0, 240);
  const overallRange = getDateRange(allEntries);

  const payload = {
    builtAt: new Date().toISOString(),
    chat: {
      title: chatMeta && chatMeta.title ? chatMeta.title : 'Х-HEALTH & BEAUTY',
      username: chatMeta && chatMeta.username ? chatMeta.username : 'X_Health_and_Beauty',
      url: chatMeta && chatMeta.username ? `https://t.me/${chatMeta.username}` : DEFAULT_CHAT_URL,
      participantsCount: chatMeta && chatMeta.participants_count ? chatMeta.participants_count : null,
      historyCount: chatMeta && chatMeta.history_count ? chatMeta.history_count : null,
      about: chatMeta && chatMeta.about ? chatMeta.about : '',
    },
    links: {
      home: '/',
      register: '/register',
      catalog: '/landing/catalog',
      officialSite: siteContent.links && (siteContent.links.companyMain || siteContent.links.officialSite) || 'https://golden-connect.to/',
      companyCatalog: siteContent.links && (siteContent.links.companyCatalog || siteContent.links.shop) || 'https://golden-connect.to/',
      bot: 'https://t.me/Golden Connect_bizbot',
    },
    summary: {
      productCount: productPayloads.length,
      categories,
      families,
      productsWithEvidence,
      totalKnowledgeEntries: allEntries.length,
      matchedEntries: allMatchedEntries.length,
      generalEntries: generalUsefulEntries.length,
      dateRange: overallRange,
    },
    categoryTitles: CATEGORY_TITLES,
    generalEntries: generalUsefulEntries,
    products: productPayloads,
  };

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload), 'utf8');

  console.log(`Built product library: ${OUTPUT_FILE}`);
  console.log(`Products: ${productPayloads.length}`);
  console.log(`Products with evidence: ${productsWithEvidence}`);
  console.log(`Matched entries: ${allMatchedEntries.length}`);
  console.log(`General entries: ${generalUsefulEntries.length}`);
}

main();
