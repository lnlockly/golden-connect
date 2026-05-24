// @ts-check
// Tests for scripts/deploy-agent.sh (owned by the infra sub-agent).
//
// Runs the script with --dry-run against a seeded queue entry and asserts
// that it renders the k8s template without actually mutating a real cluster.
//
// The script shells out to `kubectl apply --dry-run=client` even in --dry-run
// mode (to validate the rendered manifest). When kubectl isn't installed
// locally (e.g. CI without a k3s toolchain), we skip rather than force every
// dev to install kubectl just to run unit tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './helpers/load.mjs';

const SCRIPT_PATH = resolve(REPO_ROOT, 'scripts', 'deploy-agent.sh');
const QUEUE_DIR = resolve(REPO_ROOT, 'infra', 'deploy-queue');
// Distinct slug from the status test so the two can run in parallel.
const TEST_SLUG = 'test-slug-deploy';
const QUEUE_FILE = resolve(QUEUE_DIR, `${TEST_SLUG}.json`);

const hasScript = existsSync(SCRIPT_PATH);

/** Is a given binary available on $PATH? */
function hasOnPath(bin) {
  const r = spawnSync('sh', ['-c', `command -v ${bin}`], { encoding: 'utf8' });
  return r.status === 0 && (r.stdout || '').trim().length > 0;
}

if (!hasScript) {
  test.skip('scripts/deploy-agent.sh not yet available', () => {});
} else if (!hasOnPath('kubectl')) {
  test.skip('kubectl not on PATH — skipping deploy-agent.sh dry-run (script requires it for manifest validation)', () => {});
} else if (!hasOnPath('python3')) {
  test.skip('python3 not on PATH — deploy-agent.sh needs python3 for JSON munging', () => {});
} else {
  test('deploy-agent.sh <slug> --dry-run renders YAML and does not call kubectl apply for real', (t) => {
    mkdirSync(QUEUE_DIR, { recursive: true });
    writeFileSync(
      QUEUE_FILE,
      JSON.stringify({
        slug: TEST_SLUG,
        state: 'queued',
        created_at: new Date().toISOString(),
        character: { name: 'Test Slug Deploy', bio: ['test'] },
        plugins: ['@elizaos/plugin-anthropic', '@elizaos/plugin-telegram', '@elizaos/plugin-bootstrap'],
        secrets: { ANTHROPIC_API_KEY: '***' },
        contact: 'test@example.com',
        lang: 'en',
      }, null, 2),
      'utf8',
    );

    t.after(() => {
      if (existsSync(QUEUE_FILE)) rmSync(QUEUE_FILE);
    });

    const mode = statSync(SCRIPT_PATH).mode;
    const isExec = (mode & 0o111) !== 0;
    const cmd = isExec ? SCRIPT_PATH : 'bash';
    // Correct arg order: <slug> [--dry-run]
    const args = isExec ? [TEST_SLUG, '--dry-run'] : [SCRIPT_PATH, TEST_SLUG, '--dry-run'];

    const result = spawnSync(cmd, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 30_000,
    });

    assert.equal(result.status, 0, `exit code 0, got ${result.status}. stderr:\n${result.stderr}`);

    const stdout = result.stdout || '';
    const combined = stdout + result.stderr;

    // Should emit the rendered YAML (the dry-run path prints it).
    assert.match(combined, /kind:\s*Namespace/, 'expected rendered YAML in stdout');
    assert.ok(
      combined.includes(`agent-${TEST_SLUG}`) || combined.includes(TEST_SLUG),
      'expected the slug to appear in rendered output',
    );

    // Queue file must remain valid JSON with a sane state.
    const after = JSON.parse(readFileSync(QUEUE_FILE, 'utf8'));
    assert.ok(
      after.state === 'queued' || after.state === 'deploying',
      `expected state queued|deploying after dry-run, got ${after.state}`,
    );
  });
}
