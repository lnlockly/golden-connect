// Runtime feature flags & settings stored in Postgres `system_settings`.
// Cached in-memory for 30 sec to avoid hot-path DB hits on every webhook.
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';

const _cache = new Map<string, { value: string; expiresAt: number }>();
const TTL_MS = 30_000;

export async function getSetting(key: string, defaultValue: string = ''): Promise<string> {
  const now = Date.now();
  const cached = _cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  try {
    const rows = await db.execute(
      sql.raw(`SELECT value FROM system_settings WHERE key = '${key.replace(/'/g, "''")}' LIMIT 1`),
    );
    const value = rows.length ? String((rows[0] as { value: unknown }).value) : defaultValue;
    _cache.set(key, { value, expiresAt: now + TTL_MS });
    return value;
  } catch (e) {
    console.warn('[system-settings] read failed:', (e as Error).message);
    return defaultValue;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.execute(
    sql.raw(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('${key.replace(/'/g, "''")}', '${String(value).replace(/'/g, "''")}', now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    ),
  );
  _cache.delete(key);
}

export async function isMarketingActive(): Promise<boolean> {
  const v = await getSetting('marketing_active', 'false');
  return v === 'true' || v === '1';
}
