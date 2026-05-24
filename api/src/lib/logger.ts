/**
 * Shared pino logger for the trendex-api process. Server entry point
 * (`server.ts`) and all background modules (jobs, admin-notifier, etc.) should
 * import from here instead of constructing their own pino instance — keeps log
 * output and level consistent, and makes it trivial to pivot to a central
 * transport later.
 *
 * Use `logger.child({ module: 'foo' })` inside features to get a scoped
 * logger without polluting the root binding.
 */
import pino from 'pino';

export const logger = pino({
  name: 'trendex-api',
  level: process.env.LOG_LEVEL ?? 'info',
});

export type Logger = typeof logger;
