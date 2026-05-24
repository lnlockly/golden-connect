/**
 * Job registration hub — loaded once from `server.ts` right after the HTTP
 * server binds. Each feature module that wants to run on a cron owns its
 * own `*.job.ts` file next to this one and side-effect-registers with
 * `registerJob()` at import time.
 *
 * Plugin model (intentional):
 *   Phase 1/2 feature agents must NOT touch `scheduler.ts` or `server.ts`.
 *   Their only edit here is a single new `import './<feature>.job.js';`
 *   line just above the PLUGIN_REGISTRATION_MARKER below. That keeps
 *   merges trivial when 4+ parallel worktrees land at once.
 *
 * Order note:
 *   Side-effect imports fire top-to-bottom, but `registerJob()` is
 *   order-independent — the scheduler does not care in what sequence
 *   jobs arrive, only that everything is registered before `startAll()`
 *   runs. So append freely.
 */
import { startAll, stopAll } from './scheduler.js';
import './referral-stage-refresh.job.js';
import './team-next-actions.job.js';
import './event-reminders.job.js';
import './welcome-drip.job.js';
import './auto-nudge.job.js';
import './weekly-digest.job.js';
import './streak-recompute.job.js';
import './mission-progress-tick.job.js';
import './rate-limit-cleanup.job.js';
import './db-backup.job.js';
import './inbox-tg-deliver.job.js';
import './tariff-renewal.job.js';
import './karma-raffle.job.js';
import './leader-pool.job.js';
import './login-streak-reset.job.js';
import './streak-warning.job.js';
import './test-placement.job.js';
// PLUGIN_REGISTRATION_MARKER — append `import './<feature>.job.js';` lines above.

export { startAll, stopAll };
export { registerJob, listJobs } from './scheduler.js';
export type { JobConfig, JobHandler, JobStatus } from './scheduler.js';

/**
 * Imports every feature module so its `registerJob()` call at module
 * top-level executes. Safe to call multiple times — individual modules
 * guard their own registration via the scheduler's own idempotent check.
 *
 * NOTE: keep this function's body empty (or comments only). The actual
 * import side-effects sit at the top of this file so they run at module
 * load time. Function is kept for signature stability.
 */
export function registerAllJobs(): void {
  // No-op — imports above drive registration.
}
