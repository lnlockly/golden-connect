import { cors } from 'hono/cors';

/**
 * CORS allowlist: Golden Connect landing origins + local dev.
 * Extend via env ALLOWED_ORIGINS (comma-separated).
 */
const defaultOrigins = [
  'https://golden-connect.to',
  'https://www.golden-connect.to',
  'https://golden-connect.ai',
  'https://ai-winlab.com',
  'https://app.ai-winlab.com',
  'http://localhost:5173',
  'http://localhost:5177',
  'http://localhost:3000',
];

const extra = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const allowed = new Set([...defaultOrigins, ...extra]);

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return '*';
    return allowed.has(origin) ? origin : '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-golden-connect-secret'],
  exposeHeaders: ['Set-Cookie'],
});
