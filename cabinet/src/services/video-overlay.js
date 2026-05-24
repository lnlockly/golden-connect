/**
 * Video overlay service (S.4) — diagonal moving banner over trending video.
 * Pure FFmpeg, single-job queue (CPU-bounded shared cluster).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const OVERLAY_DIR = process.env.VIDEO_OVERLAY_DIR || '/data/video-overlay';
const BANNER_SCALE_W = 280;       // overlay width in px
const PERIOD_SEC = 6;             // diagonal cycle period
const MAX_CONCURRENT = 1;         // strict — ffmpeg encoding is CPU-heavy
let activeJobs = 0;
const queue = [];

function ensureDir() { try { fs.mkdirSync(OVERLAY_DIR, { recursive: true }); } catch (_) {} }

function _filter() {
  // Banner sized to BANNER_SCALE_W pixels wide.
  // Diagonal Lissajous: x sweeps via sin, y via cos, full-frame travel,
  // PERIOD_SEC cycle. abs() keeps both positive so banner stays in frame.
  return `[1:v]scale=${BANNER_SCALE_W}:-1[bnr];` +
    `[0:v][bnr]overlay=` +
      `x='(W-w)*abs(sin(2*PI*t/${PERIOD_SEC}))':` +
      `y='(H-h)*abs(cos(2*PI*t/${PERIOD_SEC}))':` +
      `enable='gte(t,0)'`;
}

function _runFfmpeg(srcVideo, bannerPng, outPath, durationSec) {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-loglevel', 'error',
      '-i', srcVideo,
      '-i', bannerPng,
      '-filter_complex', _filter(),
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      '-shortest',
    ];
    if (durationSec && durationSec > 0) args.push('-t', String(durationSec));
    args.push(outPath);
    const proc = spawn('ffmpeg', args, { timeout: 120000 });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString().slice(0, 4096); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) resolve(outPath);
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}

function _next() {
  if (activeJobs >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  activeJobs++;
  _runFfmpeg(job.srcVideo, job.bannerPng, job.outPath, job.durationSec)
    .then((p) => job.resolve(p))
    .catch((e) => job.reject(e))
    .finally(() => { activeJobs--; setImmediate(_next); });
}

/**
 * @param {object} opts
 * @param {string} opts.srcVideo  — path to trending source mp4
 * @param {string} opts.bannerPng — path to user's PNG banner (2160x2160 ok)
 * @param {string} [opts.outPath] — optional explicit output path (default in OVERLAY_DIR)
 * @param {number} [opts.durationSec] — clip length (default: source duration)
 * @returns {Promise<string>} mp4 path
 */
function applyDiagonalOverlay(opts) {
  ensureDir();
  return new Promise((resolve, reject) => {
    const outPath = opts.outPath || path.join(
      OVERLAY_DIR,
      'ov_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.mp4'
    );
    queue.push({
      srcVideo: opts.srcVideo,
      bannerPng: opts.bannerPng,
      outPath,
      durationSec: opts.durationSec || null,
      resolve, reject,
    });
    _next();
  });
}

function queueLength() { return queue.length + activeJobs; }

module.exports = { applyDiagonalOverlay, queueLength, OVERLAY_DIR };
