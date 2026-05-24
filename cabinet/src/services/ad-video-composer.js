/**
 * Ad Video Composer — склейка баннер-видео + основное видео через FFmpeg
 * /opt/banner-webapp/src/services/ad-video-composer.js
 */
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const OUTPUT_DIR = '/data/generated/ad-videos';
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Склеить баннер-видео (интро) + основное видео + опционально аутро
 * @param {string} mainVideoPath — путь к основному видео
 * @param {object} options
 * @param {string} options.introBannerPath — путь к видео-баннеру (интро), .mp4
 * @param {string} options.outroBannerPath — путь к видео-баннеру (аутро), .mp4
 * @returns {Promise<{outputPath, publicUrl, duration}>}
 */
async function composeVideo(mainVideoPath, options = {}) {
  const { introBannerPath, outroBannerPath } = options;

  if (!fs.existsSync(mainVideoPath)) throw new Error('Main video not found: ' + mainVideoPath);

  // Если нет баннеров — просто копируем видео в public и отдаём URL
  if (!introBannerPath && !outroBannerPath) {
    const id = crypto.randomBytes(8).toString('hex');
    const outFile = id + '.mp4';
    const outPath = path.join(OUTPUT_DIR, outFile);
    fs.copyFileSync(mainVideoPath, outPath);
    return {
      outputPath: outPath,
      publicUrl: '/generated/ad-videos/' + outFile,
      duration: await getVideoDuration(outPath)
    };
  }

  const id = crypto.randomBytes(8).toString('hex');
  const outFile = id + '.mp4';
  const outPath = path.join(OUTPUT_DIR, outFile);
  const listFile = path.join(OUTPUT_DIR, id + '_list.txt');

  // Нормализуем все видео в одинаковый формат для concat
  const normalized = [];
  const toNormalize = [];

  if (introBannerPath && fs.existsSync(introBannerPath)) {
    toNormalize.push({ label: 'intro', src: introBannerPath });
  }
  toNormalize.push({ label: 'main', src: mainVideoPath });
  if (outroBannerPath && fs.existsSync(outroBannerPath)) {
    toNormalize.push({ label: 'outro', src: outroBannerPath });
  }

  // Нормализуем каждое видео: 720p, 30fps, aac audio
  for (const item of toNormalize) {
    const normPath = path.join(OUTPUT_DIR, id + '_' + item.label + '.mp4');
    await normalizeVideo(item.src, normPath);
    normalized.push(normPath);
  }

  // Создаём concat list файл
  const listContent = normalized.map(f => "file '" + f + "'").join('\n');
  fs.writeFileSync(listFile, listContent);

  // Склеиваем
  await new Promise((resolve, reject) => {
    exec(
      `ffmpeg -f concat -safe 0 -i "${listFile}" -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k -movflags +faststart -y "${outPath}"`,
      { timeout: 300000 },
      (err, stdout, stderr) => {
        // Cleanup temp files
        normalized.forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
        try { fs.unlinkSync(listFile); } catch(e) {}

        if (err) return reject(new Error('FFmpeg concat failed: ' + (stderr || err.message).substring(0, 500)));
        if (!fs.existsSync(outPath)) return reject(new Error('Concat output not found'));
        resolve();
      }
    );
  });

  const duration = await getVideoDuration(outPath);

  return {
    outputPath: outPath,
    publicUrl: '/generated/ad-videos/' + outFile,
    duration
  };
}

/**
 * Нормализовать видео: 720p, 30fps, h264+aac
 */
function normalizeVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    exec(
      `ffmpeg -i "${inputPath}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1" -r 30 -c:v libx264 -crf 23 -preset fast -c:a aac -b:a 128k -ar 44100 -ac 2 -shortest -y "${outputPath}"`,
      { timeout: 120000 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error('Normalize failed: ' + (stderr || err.message).substring(0, 300)));
        resolve();
      }
    );
  });
}

/**
 * Получить длительность видео
 */
function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    exec(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { timeout: 10000 },
      (err, stdout) => {
        resolve(parseFloat(stdout) || 0);
      }
    );
  });
}

/**
 * Cleanup старых видео (старше 24ч)
 */
function cleanupOldVideos() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  try {
    const files = fs.readdirSync(OUTPUT_DIR);
    for (const f of files) {
      const fp = path.join(OUTPUT_DIR, f);
      const stat = fs.statSync(fp);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fp);
      }
    }
  } catch(e) {}
}

module.exports = { composeVideo, normalizeVideo, getVideoDuration, cleanupOldVideos };
