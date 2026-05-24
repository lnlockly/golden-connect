import { createHmac } from 'node:crypto';

/**
 * Validate a Telegram WebApp initData payload.
 * See https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. URL-decode `initData` (already URL-encoded form-data by the WebApp SDK)
 * 2. Strip out `hash` — the remaining key=value pairs are sorted alphabetically
 *    and joined with \n as `data_check_string`
 * 3. secret_key = HMAC_SHA256("WebAppData", BOT_TOKEN)      (yes — reversed order)
 * 4. expected_hash = HMAC_SHA256(secret_key, data_check_string)
 * 5. compare to provided `hash` in constant time
 * 6. auth_date <= 24h old (configurable)
 */

export interface TelegramAuthUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
  photo_url?: string;
}

export interface TelegramAuthResult {
  ok: true;
  user: TelegramAuthUser;
  start_param?: string;
  auth_date: number;
}

export interface TelegramAuthFailure {
  ok: false;
  reason: 'missing_bot_token' | 'bad_init_data' | 'hash_mismatch' | 'stale' | 'no_user';
}

const MAX_AGE_SECONDS = 24 * 60 * 60;

function timingSafeEqHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string | undefined,
  now = Math.floor(Date.now() / 1000),
): TelegramAuthResult | TelegramAuthFailure {
  if (!botToken) return { ok: false, reason: 'missing_bot_token' };
  if (!initData) return { ok: false, reason: 'bad_init_data' };

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return { ok: false, reason: 'bad_init_data' };
  }

  const providedHash = params.get('hash');
  if (!providedHash) return { ok: false, reason: 'bad_init_data' };
  params.delete('hash');

  // Sort alphabetically and join as data_check_string
  const parts: string[] = [];
  for (const [k, v] of Array.from(params.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${k}=${v}`);
  }
  const dataCheckString = parts.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!timingSafeEqHex(providedHash, expectedHash)) {
    return { ok: false, reason: 'hash_mismatch' };
  }

  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || now - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'stale' };
  }

  const userStr = params.get('user');
  if (!userStr) return { ok: false, reason: 'no_user' };

  let user: TelegramAuthUser;
  try {
    user = JSON.parse(userStr) as TelegramAuthUser;
  } catch {
    return { ok: false, reason: 'bad_init_data' };
  }
  if (!user.id) return { ok: false, reason: 'no_user' };

  return {
    ok: true,
    user,
    start_param: params.get('start_param') ?? undefined,
    auth_date: authDate,
  };
}
