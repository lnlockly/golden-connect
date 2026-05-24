/**
 * Mappers from Postgres raw row shapes to the bot's wire types
 * (snake_case fields, unix-ms timestamps, 0/1 booleans).
 *
 * The bot's repos were originally written against better-sqlite3 where
 * INTEGER stored unix ms and 0/1 encoded booleans. We preserve that exact
 * shape on the wire so the bot doesn't need any format shims.
 */

export interface UserRowWire {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  ref_code: string;
  invited_by_user_id: number | null;
  invited_by_ref_code: string | null;
  joined_at: number;
  last_seen_at: number;
  is_blocked: number;
  applied_on_site: number;
  applied_at: number | null;
  ref_notifications_enabled: number;
  presented_at: number | null;
}

/** Convert a Date | string | number to unix ms. */
export function toMs(v: Date | string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function toMsRequired(v: Date | string | number | null | undefined): number {
  const ms = toMs(v);
  if (ms === null) throw new Error('expected timestamp, got null');
  return ms;
}

export function boolToInt(v: unknown): number {
  return v ? 1 : 0;
}

export function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  return Number(v);
}

export function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Map a raw users-table row (as returned by drizzle .select() or
 * db.execute() with snake_case column names) to the wire UserRow.
 *
 * Accepts both drizzle-mapped (camelCase) and raw pg rows (snake_case).
 */
export function toUserRow(r: any): UserRowWire {
  // Support both camelCase (drizzle select) and snake_case (db.execute).
  const pick = (camel: string, snake: string) =>
    r[camel] !== undefined ? r[camel] : r[snake];

  const tgId = pick('tgId', 'tg_id');
  const id = pick('id', 'id');
  const refCode = pick('refCode', 'ref_code');
  const invitedByUserId = pick('invitedByUserId', 'invited_by_user_id');
  const invitedByRefCode = pick('invitedByRefCode', 'invited_by_ref_code');
  const firstName = pick('firstName', 'first_name');
  const lastName = pick('lastName', 'last_name');
  const languageCode = pick('languageCode', 'language_code');
  const tgUsername = pick('tgUsername', 'tg_username');
  const joinedAt = pick('joinedAt', 'joined_at');
  const lastSeenAt = pick('lastSeenAt', 'last_seen_at');
  const isBlocked = pick('isBlocked', 'is_blocked');
  const appliedOnSite = pick('appliedOnSite', 'applied_on_site');
  const appliedAt = pick('appliedAt', 'applied_at');
  const refNotifs = pick('refNotificationsEnabled', 'ref_notifications_enabled');
  const presentedAt = pick('presentedAt', 'presented_at');

  return {
    id: toNum(id),
    tg_id: toNumOrNull(tgId) ?? 0,
    username: tgUsername ?? null,
    first_name: firstName ?? null,
    last_name: lastName ?? null,
    language_code: languageCode ?? null,
    ref_code: refCode ?? '',
    invited_by_user_id: toNumOrNull(invitedByUserId),
    invited_by_ref_code: invitedByRefCode ?? null,
    joined_at: toMsRequired(joinedAt),
    last_seen_at: toMsRequired(lastSeenAt),
    is_blocked: boolToInt(isBlocked),
    applied_on_site: boolToInt(appliedOnSite),
    applied_at: toMs(appliedAt),
    ref_notifications_enabled: boolToInt(refNotifs),
    presented_at: toMs(presentedAt),
  };
}

export interface LeadRowWire {
  id: number;
  track: string;
  contact: string | null;
  payload_json: string;
  source: string | null;
  lang: string | null;
  status: string;
  taken_by_tg_id: number | null;
  taken_at: number | null;
  resolved_at: number | null;
  total_usd: number | null;
  lost_reason: string | null;
  snooze_until: number | null;
  chat_id: number | null;
  message_thread_id: number | null;
  posted_message_id: number | null;
  created_at: number;
}

export function toLeadRow(r: any): LeadRowWire {
  const pick = (camel: string, snake: string) =>
    r[camel] !== undefined ? r[camel] : r[snake];

  const payload = pick('payload', 'payload');
  const payloadJson =
    typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});

  return {
    id: toNum(pick('id', 'id')),
    track: pick('track', 'track'),
    contact: pick('contact', 'contact') ?? null,
    payload_json: payloadJson,
    source: pick('source', 'source') ?? null,
    lang: pick('lang', 'lang') ?? null,
    status: pick('status', 'status'),
    taken_by_tg_id: toNumOrNull(pick('takenByTgId', 'taken_by_tg_id')),
    taken_at: toMs(pick('takenAt', 'taken_at')),
    resolved_at: toMs(pick('resolvedAt', 'resolved_at')),
    total_usd: toNumOrNull(pick('totalUsd', 'total_usd')),
    lost_reason: pick('lostReason', 'lost_reason') ?? null,
    snooze_until: toMs(pick('snoozeUntil', 'snooze_until')),
    chat_id: toNumOrNull(pick('chatId', 'chat_id')),
    message_thread_id: toNumOrNull(pick('messageThreadId', 'message_thread_id')),
    posted_message_id: toNumOrNull(pick('postedMessageId', 'posted_message_id')),
    created_at: toMsRequired(pick('createdAt', 'created_at')),
  };
}

export interface ReminderStepWire {
  id: number;
  order_idx: number;
  delay_hours: number;
  text_ru: string;
  text_en: string | null;
  text_zh: string | null;
  enabled: number;
  updated_at: number;
}

export function toReminderStep(r: any): ReminderStepWire {
  const pick = (camel: string, snake: string) =>
    r[camel] !== undefined ? r[camel] : r[snake];

  return {
    id: toNum(pick('id', 'id')),
    order_idx: toNum(pick('orderIdx', 'order_idx')),
    delay_hours: Number(pick('delayHours', 'delay_hours')),
    text_ru: pick('textRu', 'text_ru'),
    text_en: pick('textEn', 'text_en') ?? null,
    text_zh: pick('textZh', 'text_zh') ?? null,
    enabled: boolToInt(pick('enabled', 'enabled')),
    updated_at: toMsRequired(pick('updatedAt', 'updated_at')),
  };
}

export interface AiTurnWire {
  id: number;
  tg_id: number;
  role: string;
  content: string;
  created_at: number;
}

export function toAiTurn(r: any): AiTurnWire {
  const pick = (camel: string, snake: string) =>
    r[camel] !== undefined ? r[camel] : r[snake];

  return {
    id: toNum(pick('id', 'id')),
    tg_id: toNumOrNull(pick('tgId', 'tg_id')) ?? 0,
    role: pick('role', 'role'),
    content: pick('content', 'content'),
    created_at: toMsRequired(pick('createdAt', 'created_at')),
  };
}
