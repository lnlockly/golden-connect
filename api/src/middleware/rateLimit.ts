import type { Context, MiddlewareHandler } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';

export interface RateLimitOpts {
  /** Key builder — include route + scope (e.g. `ip:${ip}:login`). */
  key: (c: Context) => string;
  /** Fixed window length in seconds. */
  windowSec: number;
  /** Max requests per key per window. */
  max: number;
}

/**
 * Simple fixed-window limiter backed by the `rate_limits` table.
 *
 * Stateless: two pods racing on the same key converge via `ON CONFLICT DO
 * UPDATE`. The per-key row is (re)initialised whenever the window has rolled
 * over. A separate cron job deletes expired rows so the table doesn't grow
 * without bound.
 *
 * Design notes:
 *  - No lua/redis — a single `INSERT ... ON CONFLICT DO UPDATE ... RETURNING
 *    count` round-trips the counter atomically.
 *  - We refuse the request when `count > max` rather than `>=` so a single
 *    request with max=1 still passes through.
 *  - If the DB call itself fails (e.g. transient outage) we fail-open and
 *    let the request through — rate limits should never brick auth.
 */
export function rateLimit(opts: RateLimitOpts): MiddlewareHandler {
  return async (c, next) => {
    const key = opts.key(c);
    const windowMs = opts.windowSec * 1000;
    try {
      const rows = (await db.execute(sql`
        INSERT INTO rate_limits (key, window_start, count, expires_at)
        VALUES (${key}, now(), 1, now() + ${sql.raw(`INTERVAL '${opts.windowSec} seconds'`)})
        ON CONFLICT (key) DO UPDATE
          SET count = CASE
                WHEN rate_limits.expires_at < now() THEN 1
                ELSE rate_limits.count + 1
              END,
              window_start = CASE
                WHEN rate_limits.expires_at < now() THEN now()
                ELSE rate_limits.window_start
              END,
              expires_at = CASE
                WHEN rate_limits.expires_at < now()
                  THEN now() + ${sql.raw(`INTERVAL '${opts.windowSec} seconds'`)}
                ELSE rate_limits.expires_at
              END
        RETURNING count, expires_at
      `)) as Array<{ count: number; expires_at: string }>;

      const row = rows[0];
      if (row && Number(row.count) > opts.max) {
        const retryMs = row.expires_at ? new Date(row.expires_at).getTime() - Date.now() : windowMs;
        const retryAfter = Math.max(1, Math.ceil(retryMs / 1000));
        c.header('Retry-After', String(retryAfter));
        return c.json(
          { ok: false, error: 'rate_limited', retry_after: retryAfter },
          429,
        );
      }
    } catch {
      // Fail-open: DB hiccups must not block login.
    }
    await next();
  };
}

/** Extract the best-effort client IP from forwarding headers or the socket. */
export function clientIp(c: Context): string {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = c.req.header('x-real-ip');
  if (real) return real.trim();
  // Hono node-server exposes the raw socket on c.env — fall back to unknown.
  return 'unknown';
}
