#!/usr/bin/env node
/**
 * Build-time KB indexer.
 *
 * Walks content/kb/*.mdx, splits filenames into slug + lang, pulls
 * frontmatter via gray-matter, strips MDX body to plain text, and
 * writes one index per language at public/kb-index.{lang}.json.
 *
 * The client loads only the needed language and filter()s over
 * title + summary + body_stripped. FlexSearch integration is a future
 * drop-in upgrade — the JSON shape stays the same.
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const KB_DIR = join(ROOT, 'content', 'kb');
const OUT_DIR = join(ROOT, 'public');

const LANGS = ['en', 'ru', 'zh'];

/**
 * Very lightweight MDX → plain text. Strips import/export lines,
 * fences, JSX tags, markdown syntax tokens, and collapses whitespace.
 * Good enough for search; NOT a renderer.
 */
function stripMdx(src) {
  return src
    .replace(/^(import|export)\s+[^\n]+$/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>#|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!existsSync(KB_DIR)) {
    console.warn(`[build-kb-index] ${KB_DIR} missing — nothing to do.`);
    return;
  }
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(KB_DIR)).filter((f) => f.endsWith('.mdx'));
  const byLang = Object.fromEntries(LANGS.map((l) => [l, []]));

  for (const file of files) {
    // <slug>.<lang>.mdx
    const m = /^(.+)\.(en|ru|zh)\.mdx$/.exec(file);
    if (!m) continue;
    const [, slug, lang] = m;

    const raw = await readFile(join(KB_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    const body = stripMdx(content);

    byLang[lang].push({
      slug,
      lang,
      title: String(data.title ?? slug),
      summary: String(data.summary ?? ''),
      category: String(data.category ?? ''),
      order: Number(data.order ?? 9999),
      updated:
        data.updated instanceof Date
          ? data.updated.toISOString().slice(0, 10)
          : String(data.updated ?? ''),
      body_stripped: body,
    });
  }

  for (const lang of LANGS) {
    const sorted = byLang[lang].sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title),
    );
    const outPath = join(OUT_DIR, `kb-index.${lang}.json`);
    await writeFile(outPath, JSON.stringify(sorted, null, 2), 'utf8');
    console.log(`[build-kb-index] wrote ${outPath} (${sorted.length} docs)`);
  }
}

main().catch((err) => {
  console.error('[build-kb-index] failed:', err);
  process.exit(1);
});
