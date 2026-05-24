import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { env } from '../services/env.js';

const HEADER = 'x-goldenConnect-secret';

export function safeEqual(a: string, b: string): boolean {
  // timingSafeEqual requires equal-length inputs. Pad both to the max length
  // so that the comparison itself stays constant-time regardless of which
  // input is shorter.
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const len = Math.max(ab.length, bb.length, 1);
  const ap = Buffer.alloc(len);
  const bp = Buffer.alloc(len);
  ab.copy(ap);
  bb.copy(bp);
  // If lengths differ, force-fail after constant-time compare.
  const eq = timingSafeEqual(ap, bp);
  return eq && ab.length === bb.length;
}

/**
 * Guard for /internal/* routes. Compares the `x-goldenConnect-secret` header
 * against `env.internalSecret` in constant time. Returns 401 on mismatch or
 * missing header. Returns 500 if the server has no secret configured, since
 * that means the deployment is misconfigured and we shouldn't accept anything.
 */
export const requireInternalSecret: MiddlewareHandler = async (c, next) => {
  const expected = env.internalSecret;
  if (!expected) {
    return c.json({ ok: false, error: 'internal_secret_not_configured' }, 500);
  }
  const got = c.req.header(HEADER) ?? '';
  if (!got || !safeEqual(got, expected)) {
    return c.json({ ok: false, error: 'unauthenticated' }, 401);
  }
  await next();
};
