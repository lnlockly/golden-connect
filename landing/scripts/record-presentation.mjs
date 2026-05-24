/**
 * Record the landing's guided tour as an MP4 presentation.
 *
 * Pipeline:
 *   1. Launch Chromium via Playwright (headed so WebAudio + animations run
 *      exactly as a real visitor sees them).
 *   2. Enable recordVideo → Playwright produces a silent .webm of the tab.
 *   3. Trigger `trendex:tour-start`. The TourPlayer handles scroll,
 *      spotlight, pointer, captions and voice playback on its own.
 *   4. Wait for `trendex:tour-ended`, close the context (saves video).
 *   5. ffmpeg re-encodes webm → mp4 (H.264 + AAC silent track).
 *
 * Audio:
 *   Playwright's recordVideo does NOT capture system audio. For a narrated
 *   MP4, run `scripts/bake-tour-audio.mjs` afterwards (uses the same
 *   /api/tts → ElevenLabs path the live tour uses) to produce an audio
 *   track; a second ffmpeg pass muxes the two together. Kept as a separate
 *   step so silent renders don't block on an ElevenLabs key.
 *
 * Usage:
 *   # dev server must be running on localhost:5177
 *   npm run dev
 *   # in another shell:
 *   node scripts/record-presentation.mjs --lang=ru --out=out/presentation.mp4
 */
import { chromium } from 'playwright';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

function arg(name, fallback) {
  const pre = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(pre));
  return hit ? hit.slice(pre.length) : fallback;
}

const LANG = arg('lang', 'ru');          // 'ru' | 'en' | 'zh'
const URL = arg('url', `http://localhost:5177/?lang=${LANG}`);
const OUT = resolve(arg('out', 'out/presentation.mp4'));
const WIDTH = Number(arg('w', '1440'));
const HEIGHT = Number(arg('h', '900'));
const MAX_DURATION_MS = Number(arg('timeout', String(6 * 60_000))); // 6 min hard cap
const TMP_DIR = resolve('out/tmp-record');

function sh(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
    p.on('exit', (code) => (code === 0 ? ok(0) : fail(new Error(`${cmd} exit ${code}`))));
    p.on('error', fail);
  });
}

async function main() {
  await mkdir(dirname(OUT), { recursive: true });
  await mkdir(TMP_DIR, { recursive: true });

  console.log(`[rec] launching chromium · ${WIDTH}×${HEIGHT} · ${URL}`);
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP_DIR, size: { width: WIDTH, height: HEIGHT } },
  });
  const page = await context.newPage();

  // Let React mount + tour assets preload.
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Authorize audio playback (autoplay is allowed but the player gates on
  // a user-gesture flag). Dispatch a synthetic click first.
  await page.evaluate(() => document.body.click());
  await page.waitForTimeout(100);

  console.log('[rec] triggering tour');
  const tourFinished = page.evaluate(() => new Promise((res) => {
    window.addEventListener('trendex:tour-ended', () => res('ended'), { once: true });
    window.dispatchEvent(new Event('trendex:tour-start'));
  }));

  const timeout = new Promise((res) => setTimeout(() => res('timeout'), MAX_DURATION_MS));
  const reason = await Promise.race([tourFinished, timeout]);
  console.log(`[rec] tour ${reason === 'ended' ? 'finished' : 'hit timeout'}`);

  // Close page BEFORE context to ensure the video is flushed.
  await page.close();
  await context.close();
  await browser.close();

  // Find the webm Playwright dropped.
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(TMP_DIR);
  const webm = files.find((f) => f.endsWith('.webm'));
  if (!webm) throw new Error('no video produced');
  const webmPath = resolve(TMP_DIR, webm);
  console.log(`[rec] video: ${webmPath}`);

  // Re-encode to MP4 (H.264 + silent AAC so players don't choke on missing audio).
  console.log(`[ffmpeg] webm → mp4 · ${OUT}`);
  await sh('ffmpeg', [
    '-y',
    '-i', webmPath,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-shortest',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    OUT,
  ]);

  // Clean up tmp
  await rm(TMP_DIR, { recursive: true, force: true });
  console.log(`\n✓ done: ${OUT}`);
  if (!existsSync(OUT)) throw new Error('mp4 missing');
  console.log(`   size: ${(await import('node:fs/promises')).stat ? '' : ''}`);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
void rename;
