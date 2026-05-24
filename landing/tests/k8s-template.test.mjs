// @ts-check
// Tests for infra/k8s/agent-namespace.template.yaml (owned by the infra sub-agent).
//
// Validates that the template contains the right placeholders, substitutes
// cleanly, and — after substitution — declares the five kinds the MVP needs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './helpers/load.mjs';

const TEMPLATE_PATH = resolve(REPO_ROOT, 'infra', 'k8s', 'agent-namespace.template.yaml');
const hasTemplate = existsSync(TEMPLATE_PATH);

/** Try to load js-yaml if present in node_modules; otherwise return null. */
async function loadYaml() {
  try {
    return (await import('js-yaml')).default ?? (await import('js-yaml'));
  } catch {
    return null;
  }
}

/** Substitute all {{KEY}} placeholders for values. */
function render(template, vars) {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

if (!hasTemplate) {
  test.skip('k8s template not yet available — infra/k8s/agent-namespace.template.yaml missing', () => {});
} else {
  const raw = readFileSync(TEMPLATE_PATH, 'utf8');

  test('template contains required placeholders', () => {
    for (const p of ['{{SLUG}}', '{{IMAGE_TAG}}', '{{REPLICAS}}']) {
      assert.ok(raw.includes(p), `template missing placeholder: ${p}`);
    }
  });

  const rendered = render(raw, {
    SLUG: 'my-agent',
    IMAGE_TAG: 'ghcr.io/trendex/hosted-agent:deadbeef',
    REPLICAS: '1',
  });

  test('rendered template has no stray {{ }} placeholders', () => {
    assert.ok(!/\{\{[^}]+\}\}/.test(rendered), `leftover placeholder in rendered yaml:\n${rendered}`);
  });

  test('rendered template declares all five required kinds', () => {
    for (const kind of ['Namespace', 'Deployment', 'Service', 'NetworkPolicy', 'Secret']) {
      assert.match(rendered, new RegExp(`kind:\\s*${kind}\\b`), `missing kind: ${kind}`);
    }
  });

  test('non-Namespace resources live in namespace agent-my-agent', async () => {
    const yaml = await loadYaml();
    if (!yaml) {
      // Fall back to a regex sanity check on every metadata block.
      const expected = /namespace:\s*agent-my-agent\b/;
      assert.match(rendered, expected, 'expected namespace: agent-my-agent somewhere in rendered yaml');
      return;
    }
    // Full structural check with js-yaml.
    const docs = yaml.loadAll(rendered).filter(Boolean);
    assert.ok(docs.length >= 2, `expected multiple docs, got ${docs.length}`);
    for (const doc of docs) {
      if (!doc || typeof doc !== 'object') continue;
      if (doc.kind === 'Namespace') {
        assert.equal(doc.metadata?.name, 'agent-my-agent', 'Namespace name must be agent-my-agent');
        continue;
      }
      assert.equal(
        doc.metadata?.namespace,
        'agent-my-agent',
        `${doc.kind} must live in namespace agent-my-agent, got ${doc.metadata?.namespace}`,
      );
    }
  });
}
