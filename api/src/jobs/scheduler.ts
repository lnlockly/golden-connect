/**
 * Process-wide cron engine on top of node-cron.
 *
 * Design notes:
 *  - A module-level registry keeps every JobConfig keyed by name. Phase
 *    feature modules call `registerJob()` at import time (see
 *    `./index.ts::registerAllJobs`). `startAll()` then wires up the
 *    node-cron tasks; `stopAll()` tears them down on SIGTERM.
 *  - Re-entrance guard: if a previous invocation of the same job is still
 *    running when the next tick fires, we skip with a warn and bump the
 *    `skipped_due_to_overlap` counter on the entry. This is the simplest
 *    correct behaviour — alternatives (queue vs drop vs kill) all have
 *    sharper edges.
 *  - All exceptions thrown by handlers are caught and logged; they must
 *    never crash the process. node-cron itself is defensive about this
 *    but we do it explicitly so we can attach `lastError` to the entry.
 */
import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';

export type JobHandler = () => Promise<void> | void;

export interface JobConfig {
  name: string;
  /** node-cron expression (5 or 6 fields). */
  schedule: string;
  handler: JobHandler;
  /** IANA tz name. Defaults to 'Europe/Moscow' to match golden-connect ops. */
  timezone?: string;
  /** Run the handler once immediately after `startAll()` (async, non-blocking). */
  runOnStart?: boolean;
}

interface JobEntry {
  cfg: JobConfig;
  task?: ScheduledTask;
  /** True while a handler invocation is in-flight. */
  running: boolean;
  /** Finished-at timestamp of the last run (success or failure). */
  lastRun?: Date;
  /** Last run wall-clock duration in ms. */
  lastDuration?: number;
  /** Last error message, if the most recent run threw. Cleared on success. */
  lastError?: string;
  /** Number of ticks suppressed because the previous run was still in flight. */
  skippedDueToOverlap: number;
}

const DEFAULT_TZ = 'Europe/Moscow';

const registry = new Map<string, JobEntry>();
let started = false;

export function registerJob(cfg: JobConfig): void {
  if (!cfg || !cfg.name || !cfg.schedule || typeof cfg.handler !== 'function') {
    throw new Error('registerJob: name, schedule and handler are required');
  }
  if (!cron.validate(cfg.schedule)) {
    throw new Error(`registerJob(${cfg.name}): invalid cron expression "${cfg.schedule}"`);
  }
  if (registry.has(cfg.name)) {
    // Idempotent re-registration is a footgun (double-scheduled job), but
    // throwing breaks hot-reload. Warn loud and replace.
    logger.warn({ job: cfg.name }, 'scheduler: job re-registered; replacing previous entry');
    const prev = registry.get(cfg.name);
    prev?.task?.stop();
  }
  registry.set(cfg.name, {
    cfg,
    running: false,
    skippedDueToOverlap: 0,
  });
  logger.debug({ job: cfg.name, schedule: cfg.schedule }, 'scheduler: job registered');
}

async function runOnce(entry: JobEntry): Promise<void> {
  const { cfg } = entry;
  if (entry.running) {
    entry.skippedDueToOverlap += 1;
    logger.warn(
      { job: cfg.name, skipped_due_to_overlap: entry.skippedDueToOverlap },
      'scheduler: previous run still in progress, skipping tick',
    );
    return;
  }
  entry.running = true;
  const startedAt = Date.now();
  logger.info({ job: cfg.name }, 'scheduler: job start');
  try {
    await cfg.handler();
    const duration = Date.now() - startedAt;
    entry.lastRun = new Date();
    entry.lastDuration = duration;
    entry.lastError = undefined;
    logger.info({ job: cfg.name, duration_ms: duration }, 'scheduler: job finish');
  } catch (err) {
    const duration = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : String(err);
    entry.lastRun = new Date();
    entry.lastDuration = duration;
    entry.lastError = message;
    logger.error(
      { job: cfg.name, duration_ms: duration, err },
      'scheduler: job failed',
    );
  } finally {
    entry.running = false;
  }
}

export function startAll(): void {
  if (started) {
    logger.warn('scheduler: startAll() called twice; ignoring');
    return;
  }
  started = true;
  for (const entry of registry.values()) {
    const { cfg } = entry;
    const task = cron.schedule(
      cfg.schedule,
      () => {
        void runOnce(entry);
      },
      {
        scheduled: true,
        timezone: cfg.timezone ?? DEFAULT_TZ,
      },
    );
    entry.task = task;
    logger.info(
      { job: cfg.name, schedule: cfg.schedule, timezone: cfg.timezone ?? DEFAULT_TZ },
      'scheduler: job scheduled',
    );
    if (cfg.runOnStart) {
      // Do not await — `startAll()` must return immediately so the HTTP
      // server keeps booting. Errors are logged inside runOnce.
      void runOnce(entry);
    }
  }
  logger.info({ count: registry.size }, 'scheduler: all jobs started');
}

export function stopAll(): void {
  if (!started) {
    logger.debug('scheduler: stopAll() called before startAll()');
  }
  for (const entry of registry.values()) {
    try {
      entry.task?.stop();
    } catch (err) {
      logger.warn({ job: entry.cfg.name, err }, 'scheduler: stop failed for job');
    }
    entry.task = undefined;
  }
  started = false;
  logger.info({ count: registry.size }, 'scheduler: all jobs stopped');
}

export interface JobStatus {
  name: string;
  schedule: string;
  running: boolean;
  lastRun?: Date;
  lastDuration?: number;
  lastError?: string;
  skippedDueToOverlap: number;
}

export function listJobs(): JobStatus[] {
  return Array.from(registry.values()).map((e) => ({
    name: e.cfg.name,
    schedule: e.cfg.schedule,
    running: e.running,
    lastRun: e.lastRun,
    lastDuration: e.lastDuration,
    lastError: e.lastError,
    skippedDueToOverlap: e.skippedDueToOverlap,
  }));
}

/**
 * Test / admin utility — wipes the registry. NEVER call from production code.
 * Exported only so vitest can isolate between cases.
 */
export function __resetSchedulerForTests(): void {
  stopAll();
  registry.clear();
}
