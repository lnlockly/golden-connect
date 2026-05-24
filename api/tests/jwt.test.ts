import { describe, expect, it } from 'vitest';
import { signSession, verifySession } from '../src/services/jwt.js';

const SECRET = 'test-secret-at-least-32-bytes-long-0000000000';

describe('jwt session', () => {
  it('signs and verifies a token roundtrip', () => {
    const token = signSession({ sub: 42, addr: '0xabc', tg: null }, SECRET);
    expect(typeof token).toBe('string');
    const claims = verifySession(token, SECRET);
    expect(claims.sub).toBe(42);
    expect(claims.addr).toBe('0xabc');
    expect(claims.tg).toBeNull();
    expect(claims.iat).toBeTypeOf('number');
    expect(claims.exp).toBeTypeOf('number');
    expect(claims.exp! - claims.iat!).toBe(7 * 24 * 60 * 60);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession({ sub: 1, addr: '0x00', tg: 111 }, SECRET);
    expect(() => verifySession(token, 'wrong-secret')).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signSession({ sub: 1, addr: '0x00', tg: null }, SECRET, -10);
    expect(() => verifySession(token, SECRET)).toThrow();
  });

  it('rejects a tampered token', () => {
    const token = signSession({ sub: 1, addr: '0x00', tg: null }, SECRET);
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(() => verifySession(tampered, SECRET)).toThrow();
  });
});
