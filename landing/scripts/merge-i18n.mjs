#!/usr/bin/env node
// Merges JSON key-maps into existing i18n files without clobbering
// untouched keys. Run as: node scripts/merge-i18n.mjs <lang> <patch.json>

import fs from 'node:fs';
import path from 'node:path';

const [lang, patchPath] = process.argv.slice(2);
if (!lang || !patchPath) {
  console.error('usage: merge-i18n.mjs <lang> <patch.json>');
  process.exit(1);
}

const base = path.resolve(`src/i18n/${lang}.json`);
const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
const current = JSON.parse(fs.readFileSync(base, 'utf8'));
const merged = { ...current, ...patch };
const sorted = Object.fromEntries(Object.keys(merged).sort().map((k) => [k, merged[k]]));
fs.writeFileSync(base, JSON.stringify(sorted, null, 2) + '\n');
console.log(`merged ${Object.keys(patch).length} keys into ${base}`);
