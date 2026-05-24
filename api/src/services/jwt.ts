import jwt from 'jsonwebtoken';
import { env } from './env.js';

export interface SessionClaims {
  sub: number;
  addr: string | null;
  tg: number | null;
  iat?: number;
  exp?: number;
}

const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function signSession(
  payload: Omit<SessionClaims, 'iat' | 'exp'>,
  secret: string = env.jwtSecret,
  ttlSeconds: number = TTL_SECONDS,
): string {
  if (!secret) throw new Error('jwt: missing secret');
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: ttlSeconds,
  });
}

export function verifySession(
  token: string,
  secret: string = env.jwtSecret,
): SessionClaims {
  if (!secret) throw new Error('jwt: missing secret');
  const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || decoded === null) {
    throw new Error('jwt: bad payload');
  }
  return decoded as unknown as SessionClaims;
}

export const sessionCookieName = 'af_session';
export const sessionTtlSeconds = TTL_SECONDS;
