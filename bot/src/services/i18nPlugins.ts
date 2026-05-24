import type { Lang } from "../types.js";

/**
 * Side registry for plugin-owned i18n strings.
 *
 * The main `i18n.ts` carries a tightly-typed Dict shared by the core flow
 * (welcome, cabinet, etc.). New modules would have to weaken that Dict or
 * mix stringly-typed keys — neither is nice. This helper lets feature
 * workers register flat `key → Record<Lang,string>` tables at import time
 * and look them up via `ts("promo.qr_title", lang)`.
 *
 * Phase 2 will translate the placeholders; the keys themselves are stable.
 */

type Phrase = string | ((...args: unknown[]) => string);
// Partial so features can skip locales — lookup falls back to en / ru below.
type PhraseSet = Partial<Record<Lang, Phrase>>;

const store = new Map<string, PhraseSet>();

export function registerStrings(entries: Record<string, PhraseSet>): void {
  for (const [key, phrases] of Object.entries(entries)) {
    store.set(key, phrases);
  }
}

export function ts(key: string, lang: Lang): string {
  const entry = store.get(key);
  if (!entry) return key; // fallback: show the key so devs notice missing translations
  const phrase = entry[lang] ?? entry.en ?? entry.ru;
  if (phrase === undefined) return key;
  if (typeof phrase === 'function') return phrase();
  return phrase as string;
}

/** Call-site helper for phrases with arguments (e.g. greeting). */
export function tsFn<R extends string>(key: string, lang: Lang, ...args: unknown[]): R {
  const entry = store.get(key);
  if (!entry) return key as R;
  const phrase = entry[lang] ?? entry.en ?? entry.ru;
  if (phrase === undefined) return key as R;
  if (typeof phrase === 'function') return phrase(...args) as R;
  return phrase as R;
}
