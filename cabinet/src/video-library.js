const fs = require('fs');
const path = require('path');
let Database = null;
try {
  Database = require('better-sqlite3');
} catch {}

const CATEGORY_META = {
  broadcasts: {
    label: 'Эфиры и встречи',
    icon: 'LIVE',
    accent: 'broadcast',
    intro: 'Видео из эфиров, встреч и живых разборов Trendex.'
  },
  products: {
    label: 'Презентации продуктов',
    icon: 'PRO',
    accent: 'products',
    intro: 'Материалы, где подробно раскрываются продукты и направления компании.'
  },
  reviews: {
    label: 'Отзывы и результаты',
    icon: 'REV',
    accent: 'reviews',
    intro: 'Ролики с отзывами, впечатлениями и личным опытом использования.'
  },
  company: {
    label: 'Компания и эксперты',
    icon: 'TEAM',
    accent: 'company',
    intro: 'Видео о компании, ключевых людях, направлениях и экспертной базе.'
  },
  science: {
    label: 'Технологии и наука',
    icon: 'LAB',
    accent: 'science',
    intro: 'Материалы о технологиях, исследованиях и научном подходе Trendex.'
  },
  instructions: {
    label: 'Инструкции и применение',
    icon: 'GUIDE',
    accent: 'instructions',
    intro: 'Практические ролики о применении, использовании и маршруте выбора.'
  },
  business: {
    label: 'Бизнес и партнёрство',
    icon: 'BIZ',
    accent: 'business',
    intro: 'Видео про запуск, рекомендации, партнёрскую систему и сопровождение.'
  },
  other: {
    label: 'Другие видео',
    icon: 'MEDIA',
    accent: 'other',
    intro: 'Дополнительные материалы видеотеки Trendex.'
  }
};

const PRODUCT_MATCHERS = [
  { name: 'Живая вода', patterns: ['живая вода', 'биоактиватор воды', 'активатор воды'] },
  { name: 'Бальзамы Ведова', patterns: ['бальзам ведова', 'бальзамы ведова', 'бальзам ведова премиум', 'ведова премиум'] },
  { name: 'Борофлавин', patterns: ['борофлавин'] },
  { name: 'H538', patterns: ['h538', 'сыворотка h538'] },
  { name: 'Олигохит-Йод 53', patterns: ['олигохит-йод 53', 'олигохит йод 53', 'йод 53'] },
  { name: 'Олигохит-Остео', patterns: ['олигохит-остео', 'олигохит остео'] },
  { name: 'Дигидрокверцетин', patterns: ['дигидрокверцетин', 'липосомальн'] },
  { name: 'Темпулис', patterns: ['темпулис'] },
  { name: 'Ревентус', patterns: ['ревентус'] },
  { name: 'ALFA Нектар', patterns: ['alfa нектар', 'альфа нектар'] },
  { name: 'Гексанидин', patterns: ['гексанидин'] },
  { name: 'PROVITERA', patterns: ['provitera', 'провитера'] },
  { name: 'SilverFleece', patterns: ['silverfleece', 'silver fleece', 'сильверфлис', 'серебряное руно'] },
  { name: 'Формидиум', patterns: ['формидиум'] },
  { name: 'Женский комплекс', patterns: ['женский комплекс'] },
  { name: 'Омега-3', patterns: ['омега-3', 'омега 3'] }
];

const SPEAKER_MATCHERS = [
  { name: 'Юрий Ведов', patterns: ['юрий ведов', 'ведов юрий'] },
  { name: 'Денис Пашнюк', patterns: ['денис пашнюк', 'пашнюк денис'] },
  { name: 'Михаил Провоторов', patterns: ['михаил провоторов', 'провоторов михаил'] },
  { name: 'Юрий Нефедов', patterns: ['юрий нефедов', 'нефедов юрий'] },
  { name: 'Евгений Кузнецов', patterns: ['евгений кузнецов', 'кузнецов евгений'] },
  { name: 'Евгений Чернин', patterns: ['евгений чернин', 'чернин евгений'] },
  { name: 'Лариса Тарасова', patterns: ['лариса тарасова', 'тарасова лариса'] },
  { name: 'Юрий Варламов', patterns: ['юрий варламов', 'варламов юрий'] },
  { name: 'Александр Аванесов', patterns: ['александр аванесов', 'аванесов александр'] },
  { name: 'Сергей Румянцев', patterns: ['сергей румянцев', 'румянцев сергей'] }
];

const CATEGORY_POSTERS = {
  broadcasts: '/media/uploads/water-9.jpg',
  products: '/media/uploads/water-9.jpg',
  reviews: '/media/uploads/reviews-wheel.png',
  company: '/media/uploads/awards2.png',
  science: '/media/uploads/awards2.png',
  instructions: '/media/uploads/water-9.jpg',
  business: '/media/uploads/awards2.png',
  other: '/media/uploads/water-9.jpg'
};

const SPEAKER_POSTERS = {
  'Юрий Ведов': '/media/uploads/vedov.jpg',
  'Лариса Тарасова': '/media/uploads/tarasova.jpg',
  'Евгений Чернин': '/media/uploads/evgeny.png',
  'Денис Пашнюк': '/media/uploads/awards2.png',
  'Михаил Провоторов': '/media/uploads/awards2.png',
  'Юрий Нефедов': '/media/uploads/awards2.png'
};

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clipText(value, max = 240) {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(24, max - 1)).trim()}…`;
}

function splitSentences(value) {
  return cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function takeSentences(value, maxSentences = 2, maxChars = 340) {
  const sentences = splitSentences(value);
  if (!sentences.length) return '';
  const picked = [];
  for (const sentence of sentences) {
    const next = picked.concat(sentence).join(' ');
    if (picked.length >= maxSentences || next.length > maxChars) break;
    picked.push(sentence);
  }
  return clipText(picked.join(' '), maxChars);
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return normalizeArray(parsed);
    } catch {}
    return raw.split(',').map((item) => cleanText(item)).filter(Boolean);
  }
  return [];
}

function dedupeStrings(list, max = 8) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const normalized = cleanText(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function detectMatches(haystack, matchers, max = 4) {
  const hay = cleanText(haystack).toLowerCase();
  if (!hay) return [];
  const found = [];
  for (const matcher of matchers) {
    if (matcher.patterns.some((pattern) => hay.includes(String(pattern).toLowerCase()))) {
      found.push(matcher.name);
    }
    if (found.length >= max) break;
  }
  return dedupeStrings(found, max);
}

function normalizeVideoCategory(rawCategory, haystack) {
  const raw = cleanText(rawCategory).toLowerCase();
  const hay = cleanText(haystack).toLowerCase();

  if (raw === 'reviews' || hay.includes('отзыв')) return 'reviews';
  if (raw === 'product_presentations') return 'products';
  if (raw === 'broadcasts' || raw === 'masterclass' || raw === 'events' || raw === 'expert_meetings') return 'broadcasts';
  if (raw === 'news') return 'company';
  if (hay.includes('инструкц') || hay.includes('как применять') || hay.includes('как использовать')) return 'instructions';
  if (hay.includes('партнер') || hay.includes('бизнес') || hay.includes('доход') || hay.includes('команда')) return 'business';
  if (hay.includes('технолог') || hay.includes('наук') || hay.includes('лаборатор') || hay.includes('silverfleece')) return 'science';
  if (PRODUCT_MATCHERS.some((item) => item.patterns.some((pattern) => hay.includes(String(pattern).toLowerCase())))) return 'products';
  if (SPEAKER_MATCHERS.some((item) => item.patterns.some((pattern) => hay.includes(String(pattern).toLowerCase())))) return 'company';
  return 'other';
}

function humanTitle(row) {
  const raw = cleanText(row.source_title || row.original_name || row.video_file || '');
  if (!raw) return 'Видео Trendex';
  return raw
    .replace(/\s+\|\s*YouTube$/i, '')
    .replace(/\s+-\s*YouTube$/i, '')
    .replace(/\s+\|\s*Яндекс Видео$/i, '')
    .trim();
}

function buildPosterUrl(row, categoryId, speakers) {
  const speaker = Array.isArray(speakers) && speakers.length ? speakers[0] : '';
  if (speaker && SPEAKER_POSTERS[speaker]) return SPEAKER_POSTERS[speaker];
  const externalId = cleanText(row.video_external_id || '');
  if (externalId) return `https://i.ytimg.com/vi/${encodeURIComponent(externalId)}/hqdefault.jpg`;
  return CATEGORY_POSTERS[categoryId] || CATEGORY_POSTERS.other;
}

function buildPublicVideoUrl(row, config) {
  const videoFile = cleanText(row.video_file || '');
  if (!videoFile) return '';
  const dir = cleanText(config.trendexVideoDir || '');
  if (!dir) return '';
  const filePath = path.join(dir, videoFile);
  if (!fs.existsSync(filePath)) return '';
  const base = `/${cleanText(config.trendexVideoPublicPath || '/video-library').replace(/^\/+/, '').replace(/\/+$/, '')}`;
  return `${base}/${encodeURIComponent(videoFile)}`;
}

function buildKeyPoints(text, products, speakers, categoryMeta) {
  const points = [];
  const excerpt = takeSentences(text, 3, 420);
  if (excerpt) points.push(excerpt);
  if (products.length) points.push(`Связанные продукты: ${products.slice(0, 4).join(', ')}.`);
  if (speakers.length) points.push(`В видео упоминаются или выступают: ${speakers.slice(0, 3).join(', ')}.`);
  if (categoryMeta && categoryMeta.intro) points.push(categoryMeta.intro);
  return dedupeStrings(points.map((item) => clipText(item, 220)), 4);
}

function buildSummary(row, products, speakers, categoryMeta) {
  const excerpt = takeSentences(row.transcript_clean || row.transcript_raw || '', 2, 260);
  if (excerpt) return excerpt;
  const bits = [];
  if (categoryMeta && categoryMeta.intro) bits.push(categoryMeta.intro);
  if (speakers.length) bits.push(`В центре внимания: ${speakers.slice(0, 2).join(', ')}.`);
  if (products.length) bits.push(`Фокус на темах: ${products.slice(0, 3).join(', ')}.`);
  return clipText(bits.join(' '), 260);
}

function buildDescription(row, categoryMeta, products, speakers) {
  const paragraphs = [];
  const introBits = [];
  if (categoryMeta && categoryMeta.label) introBits.push(categoryMeta.label);
  if (speakers.length) introBits.push(`спикер: ${speakers[0]}`);
  if (products.length) introBits.push(`темы: ${products.slice(0, 4).join(', ')}`);
  if (introBits.length) {
    paragraphs.push(`Это видео Trendex относится к категории «${categoryMeta.label}»${speakers.length ? ` и помогает быстро понять, о чём говорит ${speakers[0]}` : ' и помогает быстро сориентироваться в теме'}.`);
  }

  const transcriptExcerpt = takeSentences(row.transcript_clean || row.transcript_raw || '', 4, 900);
  if (transcriptExcerpt) paragraphs.push(transcriptExcerpt);

  if (products.length) {
    paragraphs.push(`В ролике затрагиваются продукты и направления: ${products.slice(0, 5).join(', ')}.`);
  }

  paragraphs.push('Материал можно использовать как основу для консультации, рекомендации, поста или пересылки партнёру внутри кабинета.');
  return paragraphs.filter(Boolean).join('\n\n');
}

function buildSummaryV2(row, products, speakers, categoryMeta) {
  const transcript = cleanText(row.transcript_clean || row.transcript_raw || '');
  const productPattern = Array.isArray(products) && products.length
    ? products.map((item) => String(item || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean).join('|')
    : '';
  const productRegex = productPattern ? new RegExp(productPattern, 'i') : null;
  const keywordRegex = /(продукт|компан|эфир|встреч|здоров|технолог|результат|применен|истори|опыт|проект|презентац|обзор|разбор|инструкц|партнер|возможност|сертифик|награ|наука|исследован|профессор|доктор|эксперт)/i;
  const skipRegex = /^(спасибо|привет|здравствуйте|добрый|рад|как\sдела|как\sвы|друзья|коллеги)\b/i;
  const prefixRegex = /^(ну|вот|итак|значит|короче|в общем|вообще|сейчас|сегодня|давайте|первое|второе|третье|ладно|пожалуйста)\b[,:]?\s*/i;

  const logisticsRegex = /(\u043f\u043b\u044e\u0441\u0438\u043a|\u043c\u0438\u043d\u0443\u0441\u0438\u043a|\u0432\s\u0447\u0430\u0442|\u0433\u043e\u043b\u043e\u0441\u043e\u0432\u0430\u043d|\u043f\u043e\u0434\u043d\u0438\u043c\u0438\u0442\u0435|\u043f\u0440\u043e\u0432\u0435\u0440\u0438\u043c|\u0437\u0432\u0443\u043a|\u043c\u0438\u043a\u0440\u043e\u0444\u043e\u043d|\u0441\u043b\u044b\u0448\u043d\u043e|\u043a\u0442\u043e\s\u0443\s\u043d\u0430\u0441)/i;

  if (transcript) {
    const sentences = splitSentences(transcript);
    const picked = [];
    for (const raw of sentences) {
      let sentence = cleanText(raw);
      if (!sentence) continue;
      sentence = sentence.replace(prefixRegex, '');
      if (!sentence || skipRegex.test(sentence)) continue;
      const hasProduct = productRegex && productRegex.test(sentence);
      const hasKeyword = keywordRegex.test(sentence) || hasProduct;
      if (!hasKeyword) continue;
      if (logisticsRegex.test(sentence)) continue;
      if (sentence.length < 40 && !hasProduct) continue;
      const next = picked.concat(sentence).join(' ');
      if (next.length > 260) break;
      picked.push(sentence);
      if (picked.length >= 2) break;
    }
    if (picked.length) return clipText(picked.join(' '), 260);
  }

  const bits = [];
  if (categoryMeta && categoryMeta.label) bits.push(categoryMeta.label);
  if (speakers.length) bits.push(`В центре: ${speakers.slice(0, 2).join(', ')}.`);
  if (products.length) bits.push(`Темы: ${products.slice(0, 3).join(', ')}.`);
  const title = cleanText(row.source_title || row.original_name || '');
  if (!bits.length && title) bits.push(`Видео: ${title}.`);
  return clipText(bits.join(' '), 260);
}

function buildDescriptionV2(row, categoryMeta, products, speakers) {
  const summary = buildSummaryV2(row, products, speakers, categoryMeta);
  const parts = [];
  if (summary) parts.push(summary);
  if (products.length) parts.push(`Темы и продукты: ${products.slice(0, 4).join(', ')}.`);
  if (speakers.length) parts.push(`Спикер: ${speakers[0]}.`);
  if (!parts.length && categoryMeta && categoryMeta.label) parts.push(categoryMeta.label);
  return clipText(parts.join(' '), 520);
}

function buildShareText(title, summary, shareUrl) {
  const parts = [
    title,
    summary,
    'Смотри материал Trendex и сохраняй себе в медиатеку.'
  ].filter(Boolean);
  if (shareUrl) parts.push(shareUrl);
  return parts.join('\n\n');
}

function makeDedupeKey(row, title) {
  const externalId = cleanText(row.video_external_id || '');
  if (externalId) return `yt:${externalId.toLowerCase()}`;
  const sourceUrl = cleanText(row.source_url || '');
  if (sourceUrl) return `url:${sourceUrl.toLowerCase()}`;
  return `title:${cleanText(title).toLowerCase()}|${Number(row.duration_sec || 0)}`;
}

function makePublicItem(row, config) {
  const title = humanTitle(row);
  const haystack = `${title}\n${row.original_name || ''}\n${row.transcript_clean || row.transcript_raw || ''}`;
  const categoryId = normalizeVideoCategory(row.category, haystack);
  const categoryMeta = CATEGORY_META[categoryId] || CATEGORY_META.other;
  const tags = dedupeStrings(normalizeArray(row.tags_json));
  const products = dedupeStrings(detectMatches(haystack, PRODUCT_MATCHERS, 5).concat(tags.filter((item) => item.length > 2)), 6);
  const speakers = detectMatches(haystack, SPEAKER_MATCHERS, 3);
  const summary = buildSummaryV2(row, products, speakers, categoryMeta);
  const description = buildDescriptionV2(row, categoryMeta, products, speakers);
  const transcriptFull = cleanText(row.transcript_clean || row.transcript_raw || '');
  const transcriptPreview = clipText(transcriptFull, 900);
  const videoUrl = buildPublicVideoUrl(row, config);
  const sourceUrl = cleanText(row.source_url || '');
  const shareUrl = videoUrl || sourceUrl || '';
  const idSeed = cleanText(row.video_external_id || row.video_file || title).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const durationSec = Math.max(0, Number(row.duration_sec || 0) || 0);
  const featureScore = (
    (categoryId === 'broadcasts' ? 50 : 0) +
    (categoryId === 'products' ? 45 : 0) +
    (categoryId === 'reviews' ? 40 : 0) +
    Math.min(25, Math.floor(durationSec / 60)) +
    Math.min(20, Math.floor(String(row.transcript_clean || '').length / 1200))
  );

  return {
    id: `xvideo_${idSeed || 'item'}`,
    kind: 'video',
    title,
    summary,
    text: description,
    transcript: transcriptFull || null,
    transcriptPreview,
    url: sourceUrl || videoUrl || null,
    videoUrl: videoUrl || null,
    sourceUrl: sourceUrl || null,
    imageUrl: buildPosterUrl(row, categoryId, speakers),
    scenarioId: 'all',
    languageId: cleanText(row.transcript_language || 'ru') || 'ru',
    productIds: [],
    products,
    tags: dedupeStrings(tags.concat(products).concat(speakers), 10),
    channel: 'video',
    status: 'active',
    createdAt: null,
    updatedAt: row.updated_at || null,
    sourcePlatform: sourceUrl.includes('youtube') || row.video_external_id ? 'youtube' : 'local',
    sourceExternalId: cleanText(row.video_external_id || '') || null,
    durationSec,
    durationLabel: durationSec > 0
      ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}`
      : '',
    speaker: speakers[0] || null,
    speakers,
    categoryId,
    categoryLabel: categoryMeta.label,
    categoryIcon: categoryMeta.icon,
    accent: categoryMeta.accent,
    shareText: buildShareText(title, summary, shareUrl),
    shareUrl: shareUrl || null,
    keyPoints: buildKeyPoints(row.transcript_clean || row.transcript_raw || '', products, speakers, categoryMeta),
    featuredScore: featureScore,
    isFeatured: featureScore >= 60
  };
}

function createTrendexVideoLibrary(config = {}) {
  let db = null;
  let dbFailed = false;

  function normalizeLookupId(rawId) {
    const safeId = cleanText(rawId);
    if (!safeId) return { safeId: '', normalized: '', externalId: '', fileCandidate: '' };
    const normalized = safeId.replace(/^xvideo_/i, '');
    const fileCandidate = normalized.replace(/-mp4$/i, '.mp4');
    const externalId = normalized.replace(/^yt-/, '').replace(/\.mp4$/i, '');
    return { safeId, normalized, externalId, fileCandidate };
  }

  function normalizeJsonlRow(payload = {}) {
    return {
      id: payload.id || null,
      video_file: payload.video_file || payload.videoFile || (payload.id ? `yt-${payload.id}.mp4` : ''),
      video_path: payload.video_path || payload.videoPath || '',
      video_external_id: payload.video_external_id || payload.videoExternalId || payload.id || '',
      source_url: payload.source_url || payload.sourceUrl || payload.webpage_url || payload.url || '',
      source_title: payload.source_title || payload.sourceTitle || payload.title || '',
      original_name: payload.original_name || payload.originalName || payload.file_name || '',
      duration_sec: payload.duration_sec || payload.durationSec || payload.duration || 0,
      transcript_raw: payload.transcript_raw || payload.transcriptRaw || '',
      transcript_clean: payload.transcript_clean || payload.transcriptClean || payload.description || payload.summary || '',
      transcript_language: payload.transcript_language || payload.transcriptLanguage || payload.language || 'ru',
      category: payload.category || '',
      tags_json: payload.tags_json || payload.tagsJson || payload.tags || [],
      transcript_status: payload.transcript_status || payload.transcriptStatus || 'ready',
      updated_at: payload.updated_at || payload.updatedAt || null,
    };
  }

  function listJsonlItems(limit = 300) {
    const metadataPath = cleanText(config.trendexVideoMetadataPath || '');
    if (!metadataPath || !fs.existsSync(metadataPath)) return [];
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 300));
    const raw = fs.readFileSync(metadataPath, 'utf8');
    const lines = raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    const rows = [];
    for (const line of lines) {
      try {
        rows.push(normalizeJsonlRow(JSON.parse(line)));
      } catch {}
      if (rows.length >= safeLimit * 4) break;
    }

    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const item = makePublicItem(row, config);
      const dedupeKey = makeDedupeKey(row, item.title);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push(item);
      if (items.length >= safeLimit) break;
    }
    return items;
  }

  function getDb() {
    if (dbFailed) return null;
    if (db) return db;
    const dbPath = cleanText(config.trendexVideoDbPath || '');
    if (!Database || !dbPath || !fs.existsSync(dbPath)) {
      dbFailed = true;
      return null;
    }
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
    } catch (error) {
      dbFailed = true;
      return null;
    }
    return db;
  }

  function matchRowById(row, lookup) {
    if (!row || !lookup || !lookup.safeId) return false;
    const external = cleanText(row.video_external_id || row.id || '');
    const file = cleanText(row.video_file || '');
    const url = cleanText(row.source_url || row.webpage_url || row.url || '');
    if (external && lookup.externalId && external === lookup.externalId) return true;
    if (file) {
      if (file === lookup.normalized) return true;
      if (lookup.fileCandidate && file === lookup.fileCandidate) return true;
      if (lookup.externalId && file === `yt-${lookup.externalId}.mp4`) return true;
    }
    if (lookup.externalId && url && url.includes(lookup.externalId)) return true;
    return false;
  }

  function listVideoItems(limit = 300) {
    const database = getDb();
    const safeLimit = Math.max(1, Math.min(1000, parseInt(limit, 10) || 300));
    if (!database) return listJsonlItems(safeLimit);
    const rows = database.prepare(`
      SELECT
        id,
        video_file,
        video_path,
        video_external_id,
        source_url,
        source_title,
        original_name,
        duration_sec,
        transcript_raw,
        transcript_clean,
        transcript_language,
        category,
        tags_json,
        transcript_status,
        updated_at
      FROM trendex_video_library
      WHERE transcript_status = 'ready'
      ORDER BY
        CASE category
          WHEN 'broadcasts' THEN 0
          WHEN 'product_presentations' THEN 1
          WHEN 'reviews' THEN 2
          ELSE 3
        END,
        datetime(updated_at) DESC,
        id DESC
      LIMIT ?
    `).all(Math.min(5000, safeLimit * 4));

    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const item = makePublicItem(row, config);
      const dedupeKey = makeDedupeKey(row, item.title);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push(item);
      if (items.length >= safeLimit) break;
    }
    return items.length ? items : listJsonlItems(safeLimit);
  }

  function getVideoItemById(rawId) {
    const lookup = normalizeLookupId(rawId);
    if (!lookup.safeId) return null;
    const database = getDb();
    if (database) {
      const row = database.prepare(`
        SELECT
          id,
          video_file,
          video_path,
          video_external_id,
          source_url,
          source_title,
          original_name,
          duration_sec,
          transcript_raw,
          transcript_clean,
          transcript_language,
          category,
          tags_json,
          transcript_status,
          updated_at
        FROM trendex_video_library
        WHERE video_external_id = ?
           OR video_file = ?
           OR video_file = ?
           OR source_url LIKE ?
        LIMIT 1
      `).get(lookup.externalId, lookup.normalized, lookup.fileCandidate, lookup.externalId ? `%${lookup.externalId}%` : '%');
      if (row) return makePublicItem(row, config);
    }

    const metadataPath = cleanText(config.trendexVideoMetadataPath || '');
    if (!metadataPath || !fs.existsSync(metadataPath)) return null;
    const raw = fs.readFileSync(metadataPath, 'utf8');
    const lines = raw.split(/\r?\n/g).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      let parsed = null;
      try {
        parsed = normalizeJsonlRow(JSON.parse(line));
      } catch {}
      if (!parsed) continue;
      if (!matchRowById(parsed, lookup)) continue;
      return makePublicItem(parsed, config);
    }
    return null;
  }

  return {
    listVideoItems,
    getVideoItemById,
  };
}

module.exports = {
  CATEGORY_META,
  createTrendexVideoLibrary,
};
