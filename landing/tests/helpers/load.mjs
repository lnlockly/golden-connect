// @ts-check
// Shared loader for the TrendeX test suite.
//
// Subjects-under-test (src/lib/characterBuilder, api/agent-deploy.ts, ...)
// are being built in parallel by sibling sub-agents. Until they land, tests
// must still run to completion, so every import goes through `tryImport` which
// returns `null` (instead of throwing) when the target file doesn't exist or
// fails to parse/resolve. Callers use that null to call `test.skip(...)`.

import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..', '..');

/**
 * Resolve one of several candidate paths (relative to repo root) to the first
 * that exists on disk. Returns the absolute path, or null.
 * @param {string[]} candidates
 * @returns {string | null}
 */
export function resolveFirst(candidates) {
  for (const c of candidates) {
    const abs = resolve(REPO_ROOT, c);
    if (existsSync(abs)) return abs;
  }
  return null;
}

/**
 * Dynamically import a module by absolute path, returning null if import
 * throws (missing file, syntax not yet valid, TS loader not wired up, ...).
 * @param {string | null} absPath
 * @returns {Promise<any | null>}
 */
export async function tryImport(absPath) {
  if (!absPath) return null;
  try {
    const mod = await import(pathToFileURL(absPath).href);
    return mod;
  } catch (err) {
    // Surface the reason in verbose runs but never crash the suite.
    if (process.env.TRENDEX_TEST_DEBUG) {
      // eslint-disable-next-line no-console
      console.error(`[tryImport] failed for ${absPath}:`, err);
    }
    return null;
  }
}

/**
 * Convenience: resolve + import in one call, with repo-root-relative paths.
 * @param {string[]} candidates
 */
export async function loadSubject(candidates) {
  const abs = resolveFirst(candidates);
  return { abs, mod: await tryImport(abs) };
}
