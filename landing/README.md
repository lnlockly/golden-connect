# TrendeX landing

Marketing site and hosted-agent wizard for TrendeX.

Infra / k3s runbook lives in [`infra/README.md`](infra/README.md).

## Running tests locally

Tests are written for Node's built-in test runner (no extra devDeps).
`tsx` (already a dependency) is registered as an ESM import hook so the
TypeScript subjects under `src/lib/` and `api/` can be imported directly
from `tests/*.test.mjs`.

```bash
npm test              # runs node --test on tests/**/*.test.mjs
./tests/smoke.sh      # build + test with a pass/fail summary
```

Each test file is **skip-safe**: if its subject-under-test isn't built
yet (or tooling like `kubectl` isn't installed), the file still runs and
reports skipped tests instead of crashing the suite.

Environment notes:

- `scripts/deploy-agent.sh` needs `kubectl` and `python3` on `PATH`.
  The dry-run test auto-skips when either is missing.
- Telegram fanout inside `api/agent-deploy.ts` is a no-op when
  `TG_BOT_TOKEN` / `TG_CHAT_ID` aren't set — so tests never hit the
  network.
- Tests write to `infra/deploy-queue/` and clean up after themselves.
  A pre-existing `testbot.json` fixture (checked in by the infra
  sub-agent) is left untouched.
