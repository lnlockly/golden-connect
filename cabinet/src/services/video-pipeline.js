// Async video processing pipeline:
//   raw upload → virus-scan → ffprobe (validate duration/codec) → ffmpeg transcode (mp4 H.264 720p) → thumbnail
//   updates ad_videos row throughout: uploading → processing → pending|active (after trust check)
//
// Designed to be called fire-and-forget from the upload route. Errors are caught and recorded
// in ad_videos.process_error.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const execFileP = promisify(execFile);

const dbModule = require('../planner/db/database');
const { scanFile } = require('./virus-scan');

const DATA_ROOT = process.env.DATA_DIR || '/data';
const ADS_VIDEO_DIR = path.join(DATA_ROOT, 'ads', 'video');
const ADS_THUMB_DIR = path.join(DATA_ROOT, 'ads', 'video', 'thumb');
const ADS_TMP_DIR = path.join(DATA_ROOT, 'ads', 'tmp');

[ADS_VIDEO_DIR, ADS_THUMB_DIR, ADS_TMP_DIR].forEach(p => {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) {}
});

const MAX_DURATION_SEC = 300;        // 5 minutes
const MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB

// Concurrency guard — only one transcode at a time on this pod (saves CPU).
let _transcodeBusy = false;
const _queue = [];

function _err(code, msg) { const e = new Error(msg); e.code = code; return e; }

async function _ffprobe(filePath) {
  const { stdout } = await execFileP('ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format', '-show_streams',
    filePath,
  ], { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function _runFfmpeg(args, opts = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); if (stderr.length > 65536) stderr = stderr.slice(-32768); });
    const t = setTimeout(() => { try { proc.kill('SIGKILL'); } catch (_) {} reject(_err('TIMEOUT', 'ffmpeg timeout')); }, opts.timeoutMs || 10 * 60 * 1000);
    proc.on('close', (code) => {
      clearTimeout(t);
      if (code === 0) resolve({ ok: true });
      else reject(_err('FFMPEG_FAILED', `ffmpeg exit ${code}: ${stderr.slice(-2000)}`));
    });
    proc.on('error', (e) => { clearTimeout(t); reject(_err('FFMPEG_SPAWN', e.message)); });
  });
}

async function _processOne(videoId) {
  const db = dbModule.getDb();
  const row = db.prepare('SELECT * FROM ad_videos WHERE id=?').get(videoId);
  if (!row || !row.video_path || row.deleted_at) return;

  const tmpPath = row.video_path; // raw uploaded file in /data/ads/tmp
  let finalPath = null;
  let thumbPath = null;
  try {
    db.prepare(`UPDATE ad_videos SET status='processing', process_error=NULL WHERE id=?`).run(videoId);

    // 1. Virus scan
    const scan = await scanFile(tmpPath, 'video');
    db.prepare(`UPDATE ad_videos SET virus_scan_result=?, virus_scanned_at=datetime('now') WHERE id=?`)
      .run(JSON.stringify(scan), videoId);
    if (!scan.ok) throw _err('VIRUS', `virus scan failed: ${scan.threat}`);

    // 2. ffprobe — validate format / duration
    let probe;
    try { probe = await _ffprobe(tmpPath); }
    catch (e) { throw _err('PROBE_FAILED', e.message); }
    const fmt = probe.format || {};
    const duration = Number(fmt.duration || 0);
    if (!(duration > 0)) throw _err('NO_DURATION', 'cannot read duration');
    if (duration > MAX_DURATION_SEC + 5) throw _err('TOO_LONG', `${Math.round(duration)}s > ${MAX_DURATION_SEC}s`);
    const sizeBytes = Number(fmt.size || 0);
    if (sizeBytes > MAX_INPUT_BYTES) throw _err('TOO_BIG', `${sizeBytes} bytes`);
    const hasVideo = (probe.streams || []).some(s => s.codec_type === 'video');
    if (!hasVideo) throw _err('NO_VIDEO_STREAM', 'no video stream');

    // 3. Transcode → web-friendly MP4 720p H.264 + AAC
    const finalName = `${Date.now()}_${row.user_id}_${crypto.randomBytes(6).toString('hex')}.mp4`;
    finalPath = path.join(ADS_VIDEO_DIR, finalName);

    await _runFfmpeg([
      '-y',
      '-i', tmpPath,
      '-vf', "scale='min(1280,iw)':'-2'",
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-maxrate', '2500k',
      '-bufsize', '5000k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-r', '30',
      '-t', String(MAX_DURATION_SEC),
      finalPath,
    ], { timeoutMs: 12 * 60 * 1000 });

    // 4. Thumbnail at ~10% of duration (fallback to 0.5s if too short)
    const thumbT = Math.max(0.5, Math.min(duration * 0.1, duration - 0.5));
    const thumbName = finalName.replace(/\.mp4$/, '.jpg');
    thumbPath = path.join(ADS_THUMB_DIR, thumbName);
    await _runFfmpeg([
      '-y',
      '-ss', String(thumbT),
      '-i', finalPath,
      '-frames:v', '1',
      '-vf', "scale='min(1280,iw)':'-2'",
      '-q:v', '4',
      thumbPath,
    ], { timeoutMs: 60_000 });

    const finalStat = await fs.promises.stat(finalPath);

    // 5. Update DB row + transition to pending/active per trust score (set in upload route)
    db.prepare(`
      UPDATE ad_videos SET
        video_path=?,
        thumbnail_path=?,
        duration_sec=?,
        file_size_bytes=?,
        status = CASE WHEN trust_decision = 'trusted' THEN 'active' ELSE 'pending' END,
        approved_at = CASE WHEN trust_decision = 'trusted' THEN datetime('now') ELSE approved_at END,
        process_error = NULL
      WHERE id=?
    `).run(finalPath, thumbPath, duration, finalStat.size, videoId);

    // 6. Cleanup tmp upload file
    fs.promises.unlink(tmpPath).catch(() => {});

    return { ok: true };
  } catch (e) {
    const msg = (e && e.code ? e.code + ': ' : '') + (e && e.message ? e.message : 'unknown');
    db.prepare(`UPDATE ad_videos SET status='failed', process_error=? WHERE id=?`).run(msg.slice(0, 500), videoId);
    // Cleanup partial outputs
    if (finalPath) fs.promises.unlink(finalPath).catch(() => {});
    if (thumbPath) fs.promises.unlink(thumbPath).catch(() => {});
    fs.promises.unlink(tmpPath).catch(() => {});
    console.warn(`[video-pipeline] video=${videoId} failed:`, msg);
    return { ok: false, reason: msg };
  }
}

function enqueue(videoId) {
  _queue.push(videoId);
  _drain();
}

async function _drain() {
  if (_transcodeBusy) return;
  if (!_queue.length) return;
  _transcodeBusy = true;
  try {
    while (_queue.length) {
      const id = _queue.shift();
      try { await _processOne(id); } catch (e) { console.warn('[video-pipeline] drain err:', e.message); }
    }
  } finally {
    _transcodeBusy = false;
  }
}

async function deleteVideoAssets(row) {
  if (!row) return;
  const safe = (p) => {
    if (!p) return null;
    const norm = path.resolve(p);
    if (!norm.startsWith(path.resolve(DATA_ROOT))) return null;
    return norm;
  };
  for (const p of [safe(row.video_path), safe(row.thumbnail_path)]) {
    if (!p) continue;
    fs.promises.unlink(p).catch(() => {});
  }
}

module.exports = {
  enqueue,
  deleteVideoAssets,
  ADS_VIDEO_DIR,
  ADS_THUMB_DIR,
  ADS_TMP_DIR,
  MAX_DURATION_SEC,
  MAX_INPUT_BYTES,
};
