#!/usr/bin/env node
/**
 * Pre-bake every tour step's TTS clip to a static MP3 in
 * public/tour-audio/. Tour plays these directly — zero ElevenLabs
 * calls at runtime, zero 429 risk.
 *
 * Usage:
 *   ELEVENLABS_API_KEY=sk_... ELEVENLABS_VOICE_ID=jqcCZkN6Knx8BJ5TBdYR \
 *     node scripts/bake-tour-tts.mjs
 *
 * Re-run after any edit to src/tour/scenarios.ts. Files are
 * deterministic per (step.id, lang, voice, model), so CI can
 * cache them via content hash. Commits generated MP3s alongside
 * the scenario edit.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outDir = path.join(repoRoot, 'public', 'tour-audio');

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error('ELEVENLABS_API_KEY is required');
  process.exit(1);
}
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'jqcCZkN6Knx8BJ5TBdYR';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';

function extractSteps(src) {
  // Minimal parser — pulls { id, voice: { ru, en, zh } } tuples from
  // the TypeScript source. We don't need a full TS compiler because
  // the file is a strict literal array of objects.
  const steps = [];
  const blockRe = /\{\s*id:\s*'([^']+)',[\s\S]*?voice:\s*\{([\s\S]*?)\},/g;
  let m;
  while ((m = blockRe.exec(src)) !== null) {
    const id = m[1];
    const voiceBlock = m[2];
    const pick = (lang) => {
      const re = new RegExp(`${lang}:\\s*'((?:[^'\\\\]|\\\\.)*)'`);
      const mm = re.exec(voiceBlock);
      if (!mm) return null;
      return mm[1].replace(/\\'/g, "'").replace(/\\n/g, '\n');
    };
    steps.push({
      id,
      ru: pick('ru'),
      en: pick('en'),
      zh: pick('zh'),
    });
  }
  return steps;
}

async function synth(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': KEY,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        // Warmer, more expressive delivery for the presentation.
        // stability 0.7 → 0.5  (more pitch variation, alive-sounding)
        // similarity_boost 0.75 → 0.85  (closer to the source voice)
        // style 0.15 → 0.4  (emotional emphasis, not monotone)
        voice_settings: {
          // stability 0.75 keeps the delivery pace uniform across
          // every clip (previous 0.5-0.6 made some lines feel rushed
          // while others dragged — owner: "озвучка не везде
          // равномерна скорость"). Slightly higher style keeps it
          // alive, not monotone.
          stability: 0.75,
          similarity_boost: 0.85,
          style: 0.25,
          use_speaker_boost: true,
        },
        output_format: 'mp3_44100_192',
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 240)}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function main() {
  const scenarioPath = path.join(repoRoot, 'src', 'tour', 'scenarios.ts');
  const src = await readFile(scenarioPath, 'utf8');
  const steps = extractSteps(src);
  console.log(`Parsed ${steps.length} steps`);

  await mkdir(outDir, { recursive: true });

  const langs = /** @type {const} */ (['ru', 'en', 'zh']);
  let done = 0, failed = 0;
  for (const step of steps) {
    for (const lang of langs) {
      const text = step[lang];
      if (!text) { console.warn(`skip ${step.id}.${lang} (no text)`); continue; }
      const file = path.join(outDir, `${step.id}.${lang}.mp3`);
      try {
        const buf = await synth(text);
        await writeFile(file, buf);
        console.log(`  ✓ ${step.id}.${lang}  ${Math.round(buf.byteLength / 1024)}KB`);
        done++;
      } catch (e) {
        console.error(`  ✗ ${step.id}.${lang}  ${e.message}`);
        failed++;
      }
      // Light rate-limit spacing — ElevenLabs free is ~2 req/sec.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  console.log(`\nBaked ${done} clips, ${failed} failed. Written to ${outDir}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
