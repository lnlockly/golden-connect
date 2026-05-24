import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { sessionCookieName, verifySession, type SessionClaims } from '../services/jwt.js';

export type AuthVars = {
  user: { id: number; address: string | null; tgId: number | null };
};

export function extractToken(c: Context): string | null {
  const cookie = getCookie(c, sessionCookieName);
  if (cookie) return cookie;
  const auth = c.req.header('authorization') || c.req.header('Authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

export const requireAuth: MiddlewareHandler<{ Variables: AuthVars }> = async (c, next) => {
  const token = extractToken(c);
  if (!token) {
    return c.json({ ok: false, error: 'unauthenticated' }, 401);
  }
  let claims: SessionClaims;
  try {
    claims = verifySession(token);
  } catch {
    return c.json({ ok: false, error: 'invalid_session' }, 401);
  }
  c.set('user', {
    id: claims.sub,
    address: claims.addr,
    tgId: claims.tg ?? null,
  });
  await next();
};
