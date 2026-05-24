/**
 * Ad Center Cron — обработка авторассылок и запланированных постов
 * Запуск: каждую минуту (crontab)
 * /opt/banner-webapp/scripts/ad-center-cron.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { init, getDb } = require(path.join(__dirname, '..', 'src', 'database'));
init();

const publisher = require(path.join(__dirname, '..', 'src', 'services', 'ad-publisher'));
const aiWriter = require(path.join(__dirname, '..', 'src', 'services', 'ad-ai-writer'));
const transcriber = require(path.join(__dirname, '..', 'src', 'services', 'ad-transcriber'));

const LOCK_FILE = '/tmp/ad-center-cron.lock';
const fs = require('fs');

async function main() {
  // Простой lock чтобы не запускаться параллельно
  if (fs.existsSync(LOCK_FILE)) {
    const stat = fs.statSync(LOCK_FILE);
    const age = Date.now() - stat.mtimeMs;
    if (age < 300000) { // 5 минут
      console.log('[AD-CRON] Already running, skip');
      return;
    }
    // Старый lock, удаляем
    fs.unlinkSync(LOCK_FILE);
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));

  try {
    const db = getDb();

    // Найти расписания, которые пора выполнить
    const due = db.prepare(`
      SELECT s.*, c.name as campaign_name
      FROM ad_schedules s
      LEFT JOIN ad_campaigns c ON c.id=s.campaign_id
      WHERE s.status='active' AND s.next_run_at IS NOT NULL AND s.next_run_at <= datetime('now')
      ORDER BY s.next_run_at ASC
      LIMIT 10
    `).all();

    if (!due.length) {
      cleanup();
      return;
    }

    console.log(`[AD-CRON] ${due.length} schedules due`);

    for (const schedule of due) {
      try {
        await processSchedule(schedule);
      } catch (e) {
        console.error(`[AD-CRON] Schedule #${schedule.id} error:`, e.message);
      }
    }
  } catch (e) {
    console.error('[AD-CRON] Fatal error:', e.message);
  }

  cleanup();
}

async function processSchedule(schedule) {
  const db = getDb();
  console.log(`[AD-CRON] Processing schedule #${schedule.id} (${schedule.type}) for campaign "${schedule.campaign_name}"`);

  // Проверяем max_runs
  if (schedule.max_runs > 0 && schedule.total_runs >= schedule.max_runs) {
    db.prepare('UPDATE ad_schedules SET status=\'completed\' WHERE id=?').run(schedule.id);
    console.log(`[AD-CRON] Schedule #${schedule.id} completed (max runs reached)`);
    return;
  }

  // Получаем источники кампании
  const sources = db.prepare(`
    SELECT s.* FROM ad_sources s
    JOIN ad_campaign_sources cs ON cs.source_id=s.id
    WHERE cs.campaign_id=? AND s.status='active'
  `).all(schedule.campaign_id);

  if (!sources.length) {
    console.log(`[AD-CRON] Schedule #${schedule.id}: no active sources, skipping`);
    updateNextRun(schedule);
    return;
  }

  // Подготовить текст
  let text = '';
  let mediaUrl = null;
  let mediaType = null;

  // Базовый пост (шаблон)
  let basePost = null;
  if (schedule.post_id) {
    basePost = db.prepare('SELECT * FROM ad_posts WHERE id=?').get(schedule.post_id);
  }

  const baseText = basePost?.text_final || basePost?.text_original || '';
  let links = [];
  try { links = JSON.parse(basePost?.links || '[]'); if (typeof links === 'string') links = JSON.parse(links); if (!Array.isArray(links)) links = []; } catch (e) { links = []; }

  // Транскрибация видео (если есть)
  let transcriptionText = '';
  let videoSources = [];
  try { videoSources = JSON.parse(schedule.video_source_urls || '[]'); } catch (e) {}

  if (videoSources.length > 0) {
    const idx = schedule.video_source_index % videoSources.length;
    const videoUrl = videoSources[idx];
    console.log(`[AD-CRON] Transcribing video ${idx + 1}/${videoSources.length}: ${videoUrl}`);

    try {
      const result = await transcriber.transcribeFromUrl(videoUrl);
      transcriptionText = result.text;

      // Следующий индекс
      db.prepare('UPDATE ad_schedules SET video_source_index=? WHERE id=?')
        .run((idx + 1) % videoSources.length, schedule.id);
    } catch (e) {
      console.error(`[AD-CRON] Transcription failed: ${e.message}`);
    }
  }

  // Генерация/рерайт текста
  if (schedule.ai_rewrite && baseText) {
    try {
      if (transcriptionText) {
        // Микс транскрипции + промт
        text = await aiWriter.mixTranscriptionWithAd({
          transcription: transcriptionText,
          prompt: baseText,
          links,
          language: 'ru',
          userId: schedule.user_id
        });
      } else {
        // Рерайт существующего текста
        text = await aiWriter.rewriteAdText({
          text: baseText,
          language: 'ru',
          tone: 'selling',
          userId: schedule.user_id
        });
      }
    } catch (e) {
      console.error(`[AD-CRON] AI rewrite failed: ${e.message}`);
      text = baseText; // фолбэк на оригинал
    }
  } else if (transcriptionText && baseText) {
    // Без AI — просто конкат
    text = baseText + '\n\n' + transcriptionText.substring(0, 500);
  } else {
    text = baseText;
  }

  // Авто-медиа
  if (schedule.auto_media && schedule.auto_media_type) {
    try {
      if (schedule.auto_media_type === 'qr' && links.length > 0) {
        const linkUrl = links[0].short_url || links[0].url;
        mediaUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(linkUrl)}`;
        mediaType = 'image';
      }
      // video_banner и og_image требуют HTTP запроса к своему серверу — пропускаем в cron для простоты
    } catch (e) {
      console.error(`[AD-CRON] Auto-media failed: ${e.message}`);
    }
  }

  // Медиа из базового поста
  if (!mediaUrl && basePost?.media_url) {
    mediaUrl = basePost.media_url;
    mediaType = basePost.media_type;
  }

  if (!text && !mediaUrl) {
    console.log(`[AD-CRON] Schedule #${schedule.id}: no content to send, skipping`);
    updateNextRun(schedule);
    return;
  }

  // Сокращаем ссылки с shorten:true
  for (const lk of links) {
    if (lk.shorten && lk.url && !lk.short_url) {
      try {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        // Убедимся что код уникален
        while (db.prepare("SELECT id FROM short_links WHERE code=?").get(code)) {
          code = '';
          for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        }
        db.prepare("INSERT INTO short_links (user_id, campaign_id, code, destination_url, title, domain) VALUES (?, ?, ?, ?, ?, 't2gift.com')")
          .run(schedule.user_id, schedule.campaign_id || null, code, lk.url, lk.url.substring(0, 80));
        lk.short_url = 'https://t2gift.com/' + code;
        console.log(`[AD-CRON] Shortened ${lk.url} -> ${lk.short_url}`);
      } catch (e) {
        console.error('[AD-CRON] Shorten error:', e.message);
      }
    }
  }

  // Добавляем ссылки в конец текста если есть
  if (links.length > 0 && text) {
    const linkTexts = links.map(l => l.short_url || l.url).join('\n');
    if (!text.includes(linkTexts.split('\n')[0])) {
      text += '\n\n' + linkTexts;
    }
  }

  // Append Telegram CTA button link if configured
  if (schedule.tg_cta_link) {
    var ctaUrl = schedule.tg_cta_link.trim();
    // Normalize: @username -> https://t.me/username
    if (ctaUrl.startsWith('@')) ctaUrl = 'https://t.me/' + ctaUrl.substring(1);
    else if (!ctaUrl.startsWith('http')) ctaUrl = 'https://t.me/' + ctaUrl;

    var ctaTexts_ru = ['\u{1F680} Перейти в канал', '\u2705 Получить доступ', '\u{1F449} Узнать подробнее', '\u{1F4E2} Присоединиться', '\u{1F51D} Перейти', '\u{1F31F} Открыть'];
    var ctaTexts_en = ['\u{1F680} Join channel', '\u2705 Get access', '\u{1F449} Learn more', '\u{1F4E2} Join now', '\u{1F51D} Open', '\u{1F31F} Explore'];
    var ctaLabel = schedule.tg_cta_text || ctaTexts_ru[Math.floor(Math.random() * ctaTexts_ru.length)];
    text += '\n\n<a href="' + ctaUrl + '">' + ctaLabel + '</a>';
  }

  // Auto-delete previous post from channels if enabled
  if (schedule.auto_delete_previous && schedule.last_post_id) {
    try {
      const prevSent = db.prepare(`
        SELECT ps.tg_message_id, s.tg_chat_id
        FROM ad_post_sources ps
        JOIN ad_sources s ON s.id = ps.source_id
        WHERE ps.post_id = ? AND ps.tg_message_id IS NOT NULL AND ps.status = 'sent'
      `).all(schedule.last_post_id);
      for (const msg of prevSent) {
        try { await publisher.deleteTgMessage(msg.tg_chat_id, msg.tg_message_id); } catch (e) {}
      }
      console.log('[AD-CRON] Deleted ' + prevSent.length + ' prev messages for schedule #' + schedule.id);
    } catch (e) {
      console.error('[AD-CRON] Auto-delete failed:', e.message);
    }
  }

  // Создаём пост-запись
  const postR = db.prepare(`INSERT INTO ad_posts
    (user_id, campaign_id, title, text_original, text_final, media_type, media_url, links, type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'auto', 'sending')`)
    .run(schedule.user_id, schedule.campaign_id,
      `Auto #${schedule.total_runs + 1}`, baseText, text,
      mediaType, mediaUrl, JSON.stringify(links));

  const postId = postR.lastInsertRowid;

  // Рассылка
  const sourceIds = sources.map(s => s.id);
  const result = await publisher.broadcastPost(postId, sourceIds);

  console.log(`[AD-CRON] Schedule #${schedule.id}: sent ${result.sent}/${result.total}`);

  // Обновляем расписание + сохраняем last_post_id для auto-delete
  updateNextRun(schedule, postId);
}

function updateNextRun(schedule, lastPostId) {
  const db = getDb();
  const lpSql = lastPostId ? ', last_post_id=' + lastPostId : '';

  if (schedule.type === 'interval') {
    const mins = schedule.interval_minutes || 180;
    const nextRun = new Date(Date.now() + mins * 60000).toISOString().replace('T', ' ').slice(0, 19);
    db.prepare('UPDATE ad_schedules SET last_run_at=datetime(\'now\'), next_run_at=?, total_runs=total_runs+1' + lpSql + ' WHERE id=?')
      .run(nextRun, schedule.id);
  } else if (schedule.type === 'scheduled') {
    if (schedule.repeat_enabled) {
      db.prepare('UPDATE ad_schedules SET last_run_at=datetime(\'now\'), total_runs=total_runs+1, status=\'active\'' + lpSql + ' WHERE id=?')
        .run(schedule.id);
    } else {
      db.prepare('UPDATE ad_schedules SET last_run_at=datetime(\'now\'), total_runs=total_runs+1, status=\'completed\'' + lpSql + ' WHERE id=?')
        .run(schedule.id);
    }
  }
}

function cleanup() {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
}

main().then(() => process.exit(0)).catch(e => {
  console.error('[AD-CRON] Fatal:', e);
  cleanup();
  process.exit(1);
});
