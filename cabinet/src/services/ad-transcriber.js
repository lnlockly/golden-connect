/**
 * Ad Transcriber — скачивание видео + транскрибация
 * /opt/banner-webapp/src/services/ad-transcriber.js
 */
const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { getDb } = require('../database');

const TEMP_DIR = '/data/temp/ad-videos';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

// Убедимся что папка существует
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**
 * Скачать видео по URL (YouTube, Instagram, TikTok, etc.)
 * Возвращает путь к файлу
 */
async function downloadVideo(url) {
  const id = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  const outPath = path.join(TEMP_DIR, `${id}.mp4`);

  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'best[ext=mp4]/best',
      '--no-playlist',
      '--max-filesize', '100M',
      '-o', outPath,
      '--no-warnings',
      url
    ];

    execFile('yt-dlp', args, { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) {
        // Пробуем альтернативный формат
        const args2 = ['-f', 'best', '--no-playlist', '-o', outPath, url];
        execFile('yt-dlp', args2, { timeout: 120000 }, (err2) => {
          if (err2) return reject(new Error(`Download failed: ${err2.message}`));
          if (!fs.existsSync(outPath)) return reject(new Error('Download completed but file not found'));
          resolve(outPath);
        });
        return;
      }
      if (!fs.existsSync(outPath)) return reject(new Error('Download completed but file not found'));
      resolve(outPath);
    });
  });
}

/**
 * Извлечь аудио из видео
 */
async function extractAudio(videoPath) {
  const audioPath = videoPath.replace('.mp4', '.wav');
  return new Promise((resolve, reject) => {
    exec(
      `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 -y "${audioPath}"`,
      { timeout: 60000 },
      (err) => {
        if (err) return reject(new Error(`Audio extraction failed: ${err.message}`));
        resolve(audioPath);
      }
    );
  });
}

/**
 * Транскрибировать аудио через Gemini API
 */
async function transcribeAudio(audioPath) {
  // Сначала пробуем Gemini
  if (GEMINI_KEY) {
    try {
      return await transcribeWithGemini(audioPath);
    } catch (e) {
      console.error('[AD-TRANSCRIBER] Gemini failed:', e.message);
    }
  }

  // Фолбэк: Groq Whisper
  try {
    return await transcribeWithGroqWhisper(audioPath);
  } catch (e) {
    console.error('[AD-TRANSCRIBER] Groq Whisper failed:', e.message);
    throw new Error('Transcription failed: no working provider');
  }
}

/**
 * Транскрибация через Gemini
 */
async function transcribeWithGemini(audioPath) {
  const audioBuffer = fs.readFileSync(audioPath);
  const base64 = audioBuffer.toString('base64');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe this audio file. Return only the transcription text, nothing else.' },
            { inline_data: { mime_type: 'audio/wav', data: base64 } }
          ]
        }],
        generationConfig: { temperature: 0 }
      })
    }
  );

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Транскрибация через Groq Whisper
 */
async function transcribeWithGroqWhisper(audioPath) {
  const GROQ_KEYS = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',').filter(Boolean);
  if (!GROQ_KEYS.length) throw new Error('No Groq key for Whisper');

  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(audioPath));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('response_format', 'text');

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_KEYS[0]}` },
    body: form
  });

  if (!response.ok) throw new Error(`Groq Whisper: ${response.status} ${response.statusText}`);
  return await response.text();
}

/**
 * Полный пайплайн: URL → текст транскрипции
 */
async function transcribeFromUrl(url, opts) {
  opts = opts || {};
  // Проверяем кэш
  const db = getDb();
  const cached = db.prepare('SELECT transcription_text FROM video_transcriptions WHERE video_url=? ORDER BY created_at DESC LIMIT 1').get(url);
  if (cached?.transcription_text) {
    return { text: cached.transcription_text, cached: true };
  }

  let videoPath, audioPath;
  try {
    // 1. Скачать видео
    videoPath = await downloadVideo(url);

    // 2. Извлечь аудио
    audioPath = await extractAudio(videoPath);

    // 3. Транскрибировать
    const text = await transcribeAudio(audioPath);

    // 4. Кэшировать
    try {
      db.prepare(`INSERT INTO video_transcriptions (video_url, transcription_text, platform, source_type, created_at)
        VALUES (?, ?, ?, 'url', datetime('now'))`).run(url, text, detectPlatform(url));
    } catch (e) { /* ignore cache errors */ }

    return { text, cached: false, videoPath: opts.keepVideo ? videoPath : null };
  } finally {
    try { if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch (e) {}
    if (!opts.keepVideo) { try { if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath); } catch (e) {} }
  }
}

function detectPlatform(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/vk\.com|vkvideo/i.test(url)) return 'vk';
  if (/t\.me/i.test(url)) return 'telegram';
  return 'other';
}

/**
 * Получить инфо о видео без скачивания
 */
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    execFile('yt-dlp', ['--dump-json', '--no-download', url], { timeout: 30000 }, (err, stdout) => {
      if (err) return reject(new Error(`Info failed: ${err.message}`));
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title || '',
          author: info.uploader || info.channel || '',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          description: (info.description || '').substring(0, 500)
        });
      } catch (e) {
        reject(new Error('Failed to parse video info'));
      }
    });
  });
}


/**
 * Скачать видео + транскрибировать + СОХРАНИТЬ файл (не удалять)
 * Возвращает { text, videoPath, info }
 */
async function downloadAndTranscribe(url) {
  // Проверяем кэш транскрипции
  const db = getDb();
  let cachedText = null;
  try {
    const cached = db.prepare('SELECT transcription_text FROM video_transcriptions WHERE video_url=? ORDER BY created_at DESC LIMIT 1').get(url);
    if (cached?.transcription_text) cachedText = cached.transcription_text;
  } catch(e) {}

  // Всегда скачиваем видео (нужен файл для склейки)
  const videoPath = await downloadVideo(url);

  // Получаем инфо
  let info = {};
  try { info = await getVideoInfo(url); } catch(e) {}

  let text = cachedText;
  if (!text) {
    // Транскрибируем
    let audioPath;
    try {
      audioPath = await extractAudio(videoPath);
      text = await transcribeAudio(audioPath);

      // Кэшируем
      try {
        db.prepare(`INSERT INTO video_transcriptions (video_url, transcription_text, platform, source_type, created_at)
          VALUES (?, ?, ?, 'url', datetime('now'))`).run(url, text, detectPlatform(url));
      } catch(e) {}
    } finally {
      try { if (audioPath && fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch(e) {}
    }
  }

  return { text: text || '', videoPath, info, cached: !!cachedText };
}


async function addWatermark(videoPath, watermarkText) {
  const outPath = videoPath.replace('.mp4', '_wm.mp4');
  const safeText = (watermarkText || '').replace(/['"\\:]/g, ' ');
  return new Promise((resolve, reject) => {
    const cmd = 'ffmpeg -i "' + videoPath + '" -vf "drawtext=text=\'' + safeText + '\''+':fontsize=28:fontcolor=white:x=20:y=20:shadowcolor=black:shadowx=2:shadowy=2" -codec:a copy -y "' + outPath + '"';
    exec(cmd, { timeout: 120000 }, (err) => {
      if (err) return resolve(videoPath); // fallback to original
      resolve(outPath);
    });
  });
}

async function mergeWithBanner(videoPath, bannerPath) {
  if (!bannerPath || !fs.existsSync(bannerPath)) return videoPath;
  const outPath = videoPath.replace('.mp4', '_merged.mp4');
  const listFile = path.join(TEMP_DIR, 'list_' + Date.now() + '.txt');
  fs.writeFileSync(listFile, "file '" + bannerPath + "'\nfile '" + videoPath + "'\n");
  return new Promise((resolve) => {
    exec('ffmpeg -f concat -safe 0 -i "' + listFile + '" -c copy -y "' + outPath + '"', { timeout: 180000 }, (err) => {
      try { fs.unlinkSync(listFile); } catch(e) {}
      if (err) return resolve(videoPath);
      resolve(outPath);
    });
  });
}

module.exports = {
  downloadVideo,
  extractAudio,
  transcribeAudio,
  transcribeFromUrl,
  getVideoInfo,
  downloadAndTranscribe,
  addWatermark,
  mergeWithBanner
};
