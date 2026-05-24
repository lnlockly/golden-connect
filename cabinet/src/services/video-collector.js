/**
 * Video collector (S.3) — fetches trending Tiktok/YT-Shorts/IG-Reels by hashtag,
 * deduplicates, stores in /data/video-pool/, indexes in tg_video_pool.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const POOL_DIR = process.env.VIDEO_POOL_DIR || '/data/video-pool';
const MIN_DUR  = 10;     // sec
const MAX_DUR  = 90;     // sec — TikTok/Shorts/Reels are short
const MAX_PER_HASHTAG = 3;
const MAX_FILE_SIZE_MB = 50;

function ensureDir() { try { fs.mkdirSync(POOL_DIR, { recursive: true }); } catch (_) {} }

// ── Seed (initial AI + business hashtags) ───────────────────────────────
const SEED_HASHTAGS = [
  // AI / нейросети — 2026 топ
  { hashtag: 'нейросети', category: 'ai', priority: 10 },
  { hashtag: 'ИскусственныйИнтеллект', category: 'ai', priority: 10 },
  { hashtag: 'ChatGPT', category: 'ai', priority: 10 },
  { hashtag: 'AINews', category: 'ai', priority: 9 },
  { hashtag: 'AItools', category: 'ai', priority: 9 },
  { hashtag: 'PromptEngineering', category: 'ai', priority: 8 },
  { hashtag: 'GPT', category: 'ai', priority: 8 },
  { hashtag: 'Claude', category: 'ai', priority: 7 },
  { hashtag: 'GeminiAI', category: 'ai', priority: 7 },
  { hashtag: 'ИИновости', category: 'ai', priority: 8 },
  { hashtag: 'AItrends', category: 'ai', priority: 7 },
  { hashtag: 'нейросеть', category: 'ai', priority: 9 },
  // Бизнес / деньги
  { hashtag: 'бизнес', category: 'business', priority: 10 },
  { hashtag: 'онлайнбизнес', category: 'business', priority: 9 },
  { hashtag: 'предпринимательство', category: 'business', priority: 8 },
  { hashtag: 'пассивныйдоход', category: 'business', priority: 9 },
  { hashtag: 'заработок', category: 'business', priority: 9 },
  { hashtag: 'финансы', category: 'business', priority: 7 },
  { hashtag: 'инвестиции', category: 'business', priority: 7 },
  { hashtag: 'трафик', category: 'business', priority: 8 },
  { hashtag: 'маркетинг', category: 'business', priority: 8 },
  { hashtag: 'freelance', category: 'business', priority: 7 },
  { hashtag: 'удалёнка', category: 'business', priority: 6 },
  { hashtag: 'mlm', category: 'business', priority: 7 },
  { hashtag: 'партнёрка', category: 'business', priority: 8 },
  { hashtag: 'стартап', category: 'business', priority: 6 },
];

function seedHashtags(db) {
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM tg_video_hashtags').get().n;
  if (cnt > 0) return 0;
  const ins = db.prepare('INSERT INTO tg_video_hashtags (hashtag, category, priority, active) VALUES (?, ?, ?, 1)');
  const tx = db.transaction((rows) => { for (const r of rows) ins.run(r.hashtag, r.category, r.priority); });
  tx(SEED_HASHTAGS);
  console.log('[video-collector] seeded', SEED_HASHTAGS.length, 'hashtags');
  return SEED_HASHTAGS.length;
}

// ── yt-dlp wrappers ─────────────────────────────────────────────────────
function _ytdlp(args, timeoutMs = 90000) {
  const r = spawnSync('yt-dlp', args, { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  return { code: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function _outTemplate(platform, hashtag) {
  const slug = hashtag.replace(/[^a-zA-Zа-яА-Я0-9_]/g, '').slice(0, 30);
  const id = crypto.randomBytes(6).toString('hex');
  return path.join(POOL_DIR, `${platform}_${slug}_${id}_%(id)s.%(ext)s`);
}

async function collectFromTiktok(hashtag) {
  const url = `https://www.tiktok.com/tag/${encodeURIComponent(hashtag)}`;
  const out = _outTemplate('tt', hashtag);
  const r = _ytdlp([
    '--no-warnings',
    '--max-downloads', String(MAX_PER_HASHTAG),
    '--match-filter', `duration >= ${MIN_DUR} & duration <= ${MAX_DUR} & filesize_approx < ${MAX_FILE_SIZE_MB}M`,
    '--print-to-file', '%(filepath)s', '/tmp/yt-out.txt',
    '--no-playlist',
    '-o', out,
    '-f', 'mp4/best[ext=mp4]/best',
    url,
  ]);
  return _readDownloadedPaths();
}

async function collectFromYTShorts(hashtag) {
  const out = _outTemplate('yt', hashtag);
  const r = _ytdlp([
    '--no-warnings',
    '--max-downloads', String(MAX_PER_HASHTAG),
    '--match-filter', `duration >= ${MIN_DUR} & duration <= ${MAX_DUR}`,
    '--print-to-file', '%(filepath)s', '/tmp/yt-out.txt',
    '--no-playlist',
    '-o', out,
    '-f', 'mp4/best[ext=mp4]/best',
    `ytsearch${MAX_PER_HASHTAG * 3}:#${hashtag} shorts`,
  ]);
  return _readDownloadedPaths();
}

async function collectFromIG(hashtag) {
  // IG hashtag pages typically require auth. Try anonymously; gracefully skip on failure.
  const url = `https://www.instagram.com/explore/tags/${encodeURIComponent(hashtag)}/`;
  const out = _outTemplate('ig', hashtag);
  const r = _ytdlp([
    '--no-warnings',
    '--max-downloads', String(MAX_PER_HASHTAG),
    '--match-filter', `duration >= ${MIN_DUR} & duration <= ${MAX_DUR}`,
    '--print-to-file', '%(filepath)s', '/tmp/yt-out.txt',
    '--no-playlist',
    '-o', out,
    '-f', 'mp4/best[ext=mp4]/best',
    url,
  ]);
  return _readDownloadedPaths();
}

function _readDownloadedPaths() {
  try {
    const txt = fs.readFileSync('/tmp/yt-out.txt', 'utf8');
    const lines = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    try { fs.unlinkSync('/tmp/yt-out.txt'); } catch (_) {}
    return lines;
  } catch (_) { return []; }
}

async function _record(db, paths, platform, hashtag, sourceUrl) {
  const ins = db.prepare(`INSERT INTO tg_video_pool
    (source_platform, source_url, hashtag, file_path, duration_sec, status)
    VALUES (?, ?, ?, ?, ?, 'available')`);
  let added = 0;
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    // duration via ffprobe
    let dur = 30;
    try {
      const r = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','format=duration','-of','default=nw=1:nk=1', p], { encoding: 'utf8', timeout: 10000 });
      if (r.stdout) dur = Math.round(parseFloat(r.stdout.trim()) || 30);
    } catch (_) {}
    try {
      ins.run(platform, sourceUrl, hashtag, p, dur);
      added++;
    } catch (e) { console.warn('[video-collector] insert failed', e.message); }
  }
  return added;
}

async function collectAll(db) {
  ensureDir();
  // Pick active hashtags ordered by priority
  const tags = db.prepare("SELECT hashtag FROM tg_video_hashtags WHERE active=1 ORDER BY priority DESC, RANDOM() LIMIT 8").all();
  if (!tags.length) return { tried: 0, added: 0 };
  let tried = 0, added = 0;
  for (const { hashtag } of tags) {
    for (const platform of ['tt', 'yt', 'ig']) {
      tried++;
      try {
        let paths = [];
        let sourceUrl = '';
        if (platform === 'tt') {
          paths = await collectFromTiktok(hashtag);
          sourceUrl = `https://www.tiktok.com/tag/${hashtag}`;
        } else if (platform === 'yt') {
          paths = await collectFromYTShorts(hashtag);
          sourceUrl = `ytsearch:#${hashtag}`;
        } else if (platform === 'ig') {
          paths = await collectFromIG(hashtag);
          sourceUrl = `https://www.instagram.com/explore/tags/${hashtag}/`;
        }
        const n = await _record(db, paths, platform, hashtag, sourceUrl);
        added += n;
        if (n) console.log(`[video-collector] ${platform}/#${hashtag}: +${n}`);
      } catch (e) {
        console.warn(`[video-collector] ${platform}/#${hashtag} failed:`, e && e.message);
      }
    }
  }
  return { tried, added };
}

async function cleanup(db) {
  // Remove videos: used > 100 OR older than 30 days OR file missing
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const rows = db.prepare(`SELECT id, file_path FROM tg_video_pool
    WHERE status='available' AND (used_count >= 100 OR downloaded_at < ?)`).all(cutoff);
  let removed = 0;
  for (const r of rows) {
    try { if (r.file_path && fs.existsSync(r.file_path)) fs.unlinkSync(r.file_path); } catch (_) {}
    db.prepare("UPDATE tg_video_pool SET status='removed', removed_at=datetime('now') WHERE id=?").run(r.id);
    removed++;
  }
  return removed;
}

module.exports = { seedHashtags, collectAll, cleanup, SEED_HASHTAGS };
