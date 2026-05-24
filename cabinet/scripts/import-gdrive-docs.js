#!/usr/bin/env node
// Import product instruction docs from Google Drive into knowledge base.
//
// Downloads 32 .docx files from Google Drive (public shared), extracts text
// via mammoth, creates knowledge chunks, merges into chunks.json.
//
// Usage:
//   npm install mammoth   (one-time)
//   node scripts/import-gdrive-docs.js
//
// Or on server:
//   cd /opt/golden-connect-cabinet && npm install mammoth && node scripts/import-gdrive-docs.js

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// --- CONFIGURATION -----------------------------------------------------------

const DRIVE_FILES = [
  { id: '1_cT8zhlC4MPhNK7xK4HpCWu56cwzMuig', name: 'Активатор 19л',           slug: 'aktivator-19l' },
  { id: '1v23Reja-_6XUTKnUs0MMxNWOx-pYu3Zv', name: 'Альфа-Нектар',             slug: 'alfa-nectar' },
  { id: '1uosa3yt77S73fC_D7_Fl3Qd5pqvefhBo', name: 'Б-Кондиционер',            slug: 'b-conditioner' },
  { id: '1KSRlBfZ6in8-Jba0nSPbiw1LqxilnqUp', name: 'Бальзам №7',               slug: 'balzam-7' },
  { id: '1F8dbW38AkKSp-j-8uOCRcGMP11K8Cqkz', name: 'Борофламин',               slug: 'boroflavin' },
  { id: '1BYD7h7uiTEK3T73UdNeua4k01metmz9h', name: 'Гексанидин',               slug: 'hexanidine' },
  { id: '1Z5JuMcgzmWuwOocECehHWxSnRyLGZMik', name: 'Гель Ведова',              slug: 'gel-vedova' },
  { id: '1wVXbGabgccFlynARKpglPRnd4OaQ3_Mx', name: 'ДГК (Дигидрокверцетин)',   slug: 'dihydroquercetin' },
  { id: '1I1aQ868Uxk9vHtYjcGtR2OGJ58ITYgFn', name: 'ДНК',                      slug: 'dna' },
  { id: '1Zuvc5LoiH1UVoABxuCHk6dZ7gbHqyuBO', name: 'Живая Вода',               slug: 'live-water' },
  { id: '1KzinC3DyNLuPq7lPHHURjAXamtC9MAUn', name: 'Олигохит ZOO',             slug: 'oligohit-zoo' },
  { id: '10hQDli4qfTIlb3FqRmHX4rfXjGHrx3uo', name: 'Олигохит-Йод 53',         slug: 'oligohit-iod-53' },
  { id: '1YpdwRbt3t0krKaKts21eMmO3GffKGnK-', name: 'Кальций GL-GH',            slug: 'calcium-gl-gh' },
  { id: '13_dnVM1XKRQyPlE1fpxo5eYGQfeF2PwM', name: 'Кальций',                  slug: 'calcium' },
  { id: '1E1BOp2ynRlnhGexVwIOjmcjlZ2dAXNg6', name: 'Меларис',                  slug: 'melaris' },
  { id: '1FV33UTDJ9uqcYUsZqBCiBa2AGR4p5BfQ', name: 'НАНО (наносеребро)',        slug: 'nano-silver' },
  { id: '1M2e3KnPCb4WBgJ8Gl0dh4j5yUEXM-RYK', name: 'Океан Биотик',            slug: 'ocean-biotic' },
  { id: '1mtnG927IpMFYcp5UcK9A-QUcF7GsgdeK', name: 'Омега-3',                  slug: 'omega-3' },
  { id: '14asueVCrHtMJp1jbn6yb_HXOqUgk9diX', name: 'Олигохит-Остео',           slug: 'oligohit-osteo' },
  { id: '1-B-TLQIRVhUJE4qyqXqQXLrR5dyXxBPU', name: 'Бальзам Премиум',          slug: 'balzam-premium' },
  { id: '16yaN6eO03xBCKVW3mRLuHm1qGjuA8Q8D', name: 'ПСОРЕМАРЕ',               slug: 'psoremarie' },
  { id: '1awy9kkVi5OCEscWfEmSbiDMTX0Xv6HXj', name: 'Hitabs (Пастилки)',        slug: 'hitabs' },
  { id: '1OjDFYZ6G24nuGU4n3njzkvDUVur3TQ9c', name: 'Ревентус',                 slug: 'reventus' },
  { id: '1SBnUN3SFIxJQ6XGmwtVMQDBeapuvX6g_', name: 'Скаверан',                 slug: 'skaveran' },
  { id: '11l6IoKIwAzsO2NfTsHE_1K_XufYrro6A', name: 'Скорая помощь',            slug: 'skoraya-pomosh' },
  { id: '1K9pA8sZKlou27WaTWNhSSQkUKglQ6g_Q', name: 'H538 (Сыворотка)',         slug: 'h538' },
  { id: '1xlVAc2hYRv0MQpKkGpVM-g75CfX11l_d', name: 'Темпулис',                 slug: 'tempulis' },
  { id: '184JAL70kQTD_uV9GKZV2EGmI6MqdAv9C', name: 'Туберлин',                 slug: 'tuberlin' },
  { id: '1RNRtv_YBVvimees3mAUQ6BBt8Ln4ALp4', name: 'Формидиум',                slug: 'formidium' },
  { id: '1WwAiizL23O_hMehRl2pQBbGauO0fHYNx', name: 'Циналис',                  slug: 'tsinaliz' },
  { id: '1c_wXAjmywGv5lkjVnV1-2CWkC5cIv0Ju', name: 'Шампунь',                  slug: 'shampun' },
  { id: '1ID9OjFGN52zYQO1qKxaElCGGBRkUL_nN', name: 'Энинохром',                slug: 'eninohrom' },
];

const OUTPUT_FILE   = path.join(__dirname, '..', 'src', 'planner', 'bot', 'knowledge', 'chunks.json');
const TMP_DIR       = path.join(__dirname, '..', 'tmp-gdocs');

// --- PRODUCT / TOPIC keywords (reused from build-knowledge-index.js) ---------

const PRODUCTS_KW = [
  { key: 'темпулис',         slug: 'tempulis' },
  { key: 'живая вода',       slug: 'live-water' },
  { key: 'дигидрокверцетин', slug: 'dihydroquercetin' },
  { key: 'дгк',              slug: 'dihydroquercetin' },
  { key: 'олигохит-йод',     slug: 'oligohit-iod-53' },
  { key: 'йод 53',           slug: 'oligohit-iod-53' },
  { key: 'олигохит-остео',   slug: 'oligohit-osteo' },
  { key: 'олигохит zoo',     slug: 'oligohit-zoo' },
  { key: 'олигохит зоо',     slug: 'oligohit-zoo' },
  { key: 'hitabs',           slug: 'hitabs' },
  { key: 'хитабс',           slug: 'hitabs' },
  { key: 'пастилки',         slug: 'hitabs' },
  { key: 'h538',             slug: 'h538' },
  { key: 'сыворотка',        slug: 'h538' },
  { key: 'ревентус',         slug: 'reventus' },
  { key: 'омега-3',          slug: 'omega-3' },
  { key: 'омега 3',          slug: 'omega-3' },
  { key: 'борофлавин',       slug: 'boroflavin' },
  { key: 'борофламин',       slug: 'boroflavin' },
  { key: 'provitera',        slug: 'provitera' },
  { key: 'провитера',        slug: 'provitera' },
  { key: 'формидиум',        slug: 'formidium' },
  { key: 'днк',              slug: 'dna' },
  { key: 'нано',             slug: 'nano-silver' },
  { key: 'наносеребро',      slug: 'nano-silver' },
  { key: 'альфа нектар',     slug: 'alfa-nectar' },
  { key: 'альфа-нектар',     slug: 'alfa-nectar' },
  { key: 'alfa нектар',      slug: 'alfa-nectar' },
  { key: 'гексанидин',       slug: 'hexanidine' },
  { key: 'меларис',          slug: 'melaris' },
  { key: 'туберлин',         slug: 'tuberlin' },
  { key: 'циналис',          slug: 'tsinaliz' },
  { key: 'псоремаре',        slug: 'psoremarie' },
  { key: 'скаверан',         slug: 'skaveran' },
  { key: 'кальций',          slug: 'calcium' },
  { key: 'бальзам',          slug: 'vedov-balm' },
  { key: 'ведов',            slug: 'vedov-balm' },
  { key: 'энинохром',        slug: 'eninohrom' },
  { key: 'шампунь',          slug: 'shampun' },
  { key: 'активатор',        slug: 'aktivator-19l' },
  { key: 'гель ведова',      slug: 'gel-vedova' },
  { key: 'скорая помощь',    slug: 'skoraya-pomosh' },
  { key: 'океан биотик',     slug: 'ocean-biotic' },
];

const TOPICS_KW = {
  immunity:          ['иммунит', 'иммуно', 'простуд', 'грипп', 'орви', 'защит'],
  antiage:           ['anti-age', 'антиэйдж', 'старен', 'морщин', 'омоложен'],
  cosmetology:       ['косметолог', 'кожа', 'крем', 'уход', 'космет', 'дерматол'],
  energy:            ['энерги', 'тонус', 'усталост', 'упадок сил', 'бодрост'],
  detox:             ['детокс', 'очищен', 'токсин', 'шлак'],
  joints:            ['сустав', 'кост', 'связк', 'остеопор', 'артрит', 'хрящ'],
  thyroid:           ['щитовидк', 'щитовидн', 'йод'],
  digestion:         ['кишечник', 'желудок', 'пищевар', 'гастр', 'жкт', 'микрофлор'],
  sleep:             ['сон', 'бессонн', 'засыпан', 'меларис'],
  hormones:          ['гормон', 'тестостерон', 'эстроген', 'либид'],
  cardiovascular:    ['сердц', 'сосуд', 'давлен', 'кровообращ'],
  antiviral:         ['вирус', 'антивирус', 'антибакт', 'антисептик', 'инфекц'],
  respiratory:       ['лёгк', 'бронх', 'дыхател', 'кашел', 'туберк'],
  skin:              ['кожа', 'псориаз', 'экзем', 'дерматит', 'папиллом', 'борода'],
  instruction:       ['инструкц', 'применен', 'как принимать', 'доз', 'курс', 'схема', 'способ'],
  contraindication:  ['противопоказ', 'нельзя', 'беремен', 'аллерг', 'не рекоменд'],
  composition:       ['состав', 'компонент', 'ингредиент', 'формула'],
  effect:            ['эффект', 'действи', 'свойств', 'результат', 'польз'],
};

function extractKeywords(text, fileSlug) {
  const lc = text.toLowerCase();
  const kw = new Set();
  // Always add the file's own slug
  if (fileSlug) kw.add(fileSlug);
  for (const p of PRODUCTS_KW) {
    if (lc.includes(p.key)) kw.add(p.slug);
  }
  for (const [topic, words] of Object.entries(TOPICS_KW)) {
    if (words.some(w => lc.includes(w))) kw.add(topic);
  }
  return Array.from(kw);
}

// --- DOWNLOAD ----------------------------------------------------------------

function downloadFile(fileId, destPath) {
  return new Promise((resolve, reject) => {
    const url = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;

    function doGet(urlStr) {
      const mod = urlStr.startsWith('https') ? https : http;
      const req = mod.get(urlStr, { timeout: 30000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303) {
          doGet(res.headers.location);
          req.destroy();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`));
          return;
        }
        const out = fs.createWriteStream(destPath);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    }
    doGet(url);
  });
}

// --- MAMMOTH TEXT EXTRACTION -------------------------------------------------

async function extractText(docxPath) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch (e) {
    console.error('\n❌ mammoth not installed. Run: npm install mammoth\n');
    process.exit(1);
  }
  const result = await mammoth.extractRawText({ path: docxPath });
  return result.value || '';
}

// --- CHUNK SPLITTING ---------------------------------------------------------

const MAX_CHUNK = 1200;
const MIN_CHUNK = 120;

function splitIntoChunks(text, productName, slug) {
  // Split by double newlines or clear section breaks
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length >= MIN_CHUNK);

  const chunks = [];

  // Build chunks by combining short paragraphs
  let buf = '';
  const flush = () => {
    if (buf.trim().length >= MIN_CHUNK) {
      chunks.push(buf.trim());
    }
    buf = '';
  };

  for (const p of paragraphs) {
    if (p.length > MAX_CHUNK) {
      // Split long paragraph by sentences
      flush();
      const sentences = p.match(/[^.!?]+[.!?]+/g) || [p];
      let part = '';
      for (const s of sentences) {
        if ((part + s).length > MAX_CHUNK) {
          if (part.length >= MIN_CHUNK) chunks.push(part.trim());
          part = s;
        } else {
          part += ' ' + s;
        }
      }
      if (part.length >= MIN_CHUNK) chunks.push(part.trim());
    } else if ((buf + '\n' + p).length > MAX_CHUNK) {
      flush();
      buf = p;
    } else {
      buf += (buf ? '\n' : '') + p;
    }
  }
  flush();

  // Prepend product name to each chunk so it's always searchable
  return chunks.map(c => {
    const header = c.toLowerCase().includes(productName.toLowerCase())
      ? c
      : `${productName}.\n${c}`;
    return header;
  });
}

// --- MAIN --------------------------------------------------------------------

async function main() {
  console.log('=== Golden Connect Google Drive Docs Importer ===\n');

  // Prepare tmp dir
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  // Load existing chunks.json
  let existing = { total: 0, chunks: [], keywordIndex: {}, products: [], topics: [], experts: [], stats: {}, builtAt: '' };
  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      console.log(`Loaded existing chunks.json: ${existing.total} chunks\n`);
    } catch (e) {
      console.warn('Could not parse existing chunks.json, starting fresh');
    }
  }

  // Remove old "gdoc_" chunks (so we can reimport cleanly)
  const baseChunks = (existing.chunks || []).filter(c => !c.id.startsWith('gdoc_'));
  const newChunks = [];

  let success = 0, failed = 0;

  for (const file of DRIVE_FILES) {
    const docxPath = path.join(TMP_DIR, `${file.slug}.docx`);
    process.stdout.write(`  ⬇  ${file.name.padEnd(28)}`);

    try {
      // Download
      await downloadFile(file.id, docxPath);

      // Extract text
      const rawText = await extractText(docxPath);
      if (!rawText || rawText.trim().length < 50) {
        console.log('  ⚠  empty/too short, skip');
        failed++;
        continue;
      }

      // Split into chunks
      const textChunks = splitIntoChunks(rawText, file.name, file.slug);

      for (let i = 0; i < textChunks.length; i++) {
        const text = textChunks[i];
        const keywords = extractKeywords(text, file.slug);
        newChunks.push({
          id: `gdoc_${file.slug}_${i}`,
          category: 'instructions',
          source: 'gdrive-doc',
          productName: file.name,
          keywords,
          text,
        });
      }

      console.log(`  ✅  ${textChunks.length} chunks`);
      success++;
    } catch (err) {
      console.log(`  ❌  ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDownloaded: ${success}/${DRIVE_FILES.length}, failed: ${failed}`);
  console.log(`New chunks from docs: ${newChunks.length}`);

  // Merge
  const allChunks = [...baseChunks, ...newChunks];

  // Rebuild keyword index
  const keywordIndex = {};
  allChunks.forEach((c, i) => {
    for (const k of c.keywords) {
      if (!keywordIndex[k]) keywordIndex[k] = [];
      keywordIndex[k].push(i);
    }
  });

  // Stats by category
  const stats = {};
  for (const c of allChunks) {
    stats[c.category] = (stats[c.category] || 0) + 1;
  }

  // Add new product slugs list
  const knownSlugs = new Set((existing.products || []).map(p => p.slug));
  const mergedProducts = [...(existing.products || [])];
  for (const f of DRIVE_FILES) {
    if (!knownSlugs.has(f.slug)) {
      mergedProducts.push({ slug: f.slug, name: f.name });
      knownSlugs.add(f.slug);
    }
  }

  const output = {
    builtAt: new Date().toISOString(),
    total: allChunks.length,
    stats,
    products: mergedProducts,
    topics: existing.topics || Object.keys(TOPICS_KW),
    experts: existing.experts || [],
    keywordIndex,
    chunks: allChunks,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output));
  const sizeKb = Math.round(fs.statSync(OUTPUT_FILE).size / 1024);

  console.log('\n✅ chunks.json updated:');
  console.log(`   Total chunks : ${allChunks.length}  (+${newChunks.length} new from docs)`);
  console.log(`   File size    : ${sizeKb} KB`);
  console.log(`   By category  : ${JSON.stringify(stats)}`);
  console.log(`   Products list: ${mergedProducts.length} entries`);

  // Cleanup tmp
  try { fs.rmSync(TMP_DIR, { recursive: true }); } catch (_) {}

  console.log('\nDone. Restart golden-connect-cabinet to apply changes.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
