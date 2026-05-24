// @ts-check
// Tests for src/lib/characterBuilder (owned by the frontend sub-agent).
//
// Until that module lands, every test here skips gracefully — the file still
// runs, it just reports skipped tests. Once the module exists, the real
// assertions kick in automatically.
//
// The input contract is CharacterFormInputs:
//   { name, ticker, tagline, bio: string, lore: string, topics: string,
//     style: 'formal'|'friendly'|'technical'|'playful', plugins: string[] }
// …and the output is an ElizaCharacter with .style = { all, chat, post }
// derived from the style enum, not passed through verbatim.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSubject } from './helpers/load.mjs';

const { mod: cb } = await loadSubject([
  'src/lib/characterBuilder.ts',
  'src/lib/characterBuilder.tsx',
  'src/lib/characterBuilder.js',
  'src/lib/characterBuilder.mjs',
  'src/lib/characterBuilder/index.ts',
  'src/lib/characterBuilder/index.js',
  'dist/lib/characterBuilder.js',
]);

function getBuild(mod) {
  if (!mod) return null;
  if (typeof mod.buildCharacter === 'function') return mod.buildCharacter;
  if (mod.default && typeof mod.default.buildCharacter === 'function') return mod.default.buildCharacter;
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

const buildCharacter = getBuild(cb);

/** Baseline input — every test either uses this or overrides a subset. */
const baseInput = {
  name: 'Astro Sage',
  ticker: 'SAGE',
  tagline: 'Charts by the stars.',
  bio: 'I am an astrology-flavoured crypto oracle. I read charts. I never give financial advice.',
  lore: 'Born during a Mercury retrograde.\nStudied in the house of the moon.',
  topics: 'astrology, crypto, memes',
  style: 'playful',
  plugins: ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
};

if (!buildCharacter) {
  test.skip('character builder not yet available — src/lib/characterBuilder missing or unloadable', () => {});
} else {
  test('buildCharacter returns the expected top-level shape', () => {
    const c = buildCharacter({ ...baseInput });
    assert.ok(c && typeof c === 'object', 'returns an object');
    for (const key of ['name', 'username', 'plugins', 'modelProvider', 'bio', 'lore', 'topics', 'adjectives', 'style']) {
      assert.ok(key in c, `missing key: ${key}`);
    }
    assert.ok(Array.isArray(c.bio), 'bio is array');
    assert.ok(Array.isArray(c.lore), 'lore is array');
    assert.ok(Array.isArray(c.topics), 'topics is array');
    assert.ok(Array.isArray(c.adjectives), 'adjectives is array');
    assert.ok(c.style && typeof c.style === 'object', 'style is object');
    for (const k of ['all', 'chat', 'post']) {
      assert.ok(Array.isArray(c.style[k]), `style.${k} is array`);
    }
  });

  test('username is lowercase-kebab of name', () => {
    const c = buildCharacter({ ...baseInput, name: 'Astro Sage' });
    assert.equal(c.username, 'astro-sage');

    const c2 = buildCharacter({ ...baseInput, name: 'MoonDog 9000!' });
    // Allow any sensible slugger: must be lowercase, hyphen-separated, no spaces/punct.
    assert.match(c2.username, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(
      c2.username.includes('moondog') || c2.username.includes('moon-dog'),
      `unexpected slug: ${c2.username}`,
    );
  });

  test('modelProvider picks anthropic when plugin-anthropic is present', () => {
    const c = buildCharacter({
      ...baseInput,
      plugins: ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
    });
    assert.equal(c.modelProvider, 'anthropic');
  });

  test('modelProvider picks openai when only plugin-openai is present', () => {
    const c = buildCharacter({
      ...baseInput,
      plugins: ['@elizaos/plugin-openai', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
    });
    assert.equal(c.modelProvider, 'openai');
  });

  test('modelProvider defaults to anthropic when no model plugin is present', () => {
    const c = buildCharacter({
      ...baseInput,
      plugins: ['@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap', '@elizaos/plugin-discord'],
    });
    assert.equal(c.modelProvider, 'anthropic');
  });

  test('bio is split on sentence boundaries into an array', () => {
    const c = buildCharacter({
      ...baseInput,
      bio: 'Sentence one. Sentence two! Sentence three?',
    });
    assert.ok(Array.isArray(c.bio));
    assert.ok(c.bio.length >= 2, `expected >=2 sentences, got ${c.bio.length}`);
    for (const s of c.bio) {
      assert.equal(typeof s, 'string');
      assert.ok(s.trim().length > 0, 'no empty bio entries');
    }
  });

  test('settings.secrets is an empty object — secrets never leak into character JSON', () => {
    const c = buildCharacter({ ...baseInput });
    const secrets = (c.settings && c.settings.secrets) || {};
    assert.deepEqual(secrets, {}, 'character.settings.secrets must be empty');
  });

  test('plugins array is preserved on the character', () => {
    const plugins = ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'];
    const c = buildCharacter({ ...baseInput, plugins });
    assert.ok(Array.isArray(c.plugins));
    for (const p of plugins) {
      assert.ok(c.plugins.includes(p), `expected plugin ${p} on character`);
    }
  });

  test('topics string is parsed into an array', () => {
    const c = buildCharacter({ ...baseInput, topics: 'astrology, crypto, memes' });
    assert.ok(Array.isArray(c.topics));
    assert.ok(c.topics.includes('astrology'));
    assert.ok(c.topics.includes('crypto'));
    assert.ok(c.topics.includes('memes'));
  });
}
