import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { leads } from '../db/schema.js';
import { toLeadRow, type LeadRowWire, toNum } from './mappers.js';

export interface CreateLeadInput {
  track: string;
  contact: string | null;
  payload: unknown;
  source?: string | null;
  lang?: string | null;
  chat_id?: number | null;
  message_thread_id?: number | null;
  posted_message_id?: number | null;
}

export async function create(input: CreateLeadInput): Promise<LeadRowWire> {
  const [row] = await db
    .insert(leads)
    .values({
      track: input.track,
      contact: input.contact ?? null,
      // jsonb column — drizzle accepts JS value directly.
      payload: (input.payload ?? {}) as any,
      source: input.source ?? null,
      lang: input.lang ?? null,
      chatId: input.chat_id ?? null,
      messageThreadId: input.message_thread_id ?? null,
      postedMessageId: input.posted_message_id ?? null,
    })
    .returning();
  if (!row) throw new Error('lead insert failed');
  return toLeadRow(row);
}

export async function findById(id: number): Promise<LeadRowWire | null> {
  const rows = await db.execute(sql`
    SELECT * FROM leads WHERE id = ${id} LIMIT 1
  `);
  return rows[0] ? toLeadRow(rows[0]) : null;
}

export async function findByPostedMessage(
  chatId: number,
  messageId: number,
): Promise<LeadRowWire | null> {
  const rows = await db.execute(sql`
    SELECT * FROM leads
    WHERE chat_id = ${chatId} AND posted_message_id = ${messageId}
    LIMIT 1
  `);
  return rows[0] ? toLeadRow(rows[0]) : null;
}

/**
 * Snapshot `markTaken` — transitions new|snoozed → taken. Other statuses are
 * untouched (idempotent for already-taken or resolved leads).
 */
export async function markTaken(
  id: number,
  adminTgId: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE leads
    SET status = 'taken',
        taken_by_tg_id = ${adminTgId},
        taken_at = NOW()
    WHERE id = ${id} AND status IN ('new', 'snoozed')
  `);
}

export async function resolve(
  id: number,
  status: 'won' | 'lost',
  opts: { total_usd?: number | null; lost_reason?: string | null } = {},
): Promise<void> {
  if (status === 'won') {
    const total = opts.total_usd ?? null;
    await db.execute(sql`
      UPDATE leads
      SET status = 'won',
          resolved_at = NOW(),
          total_usd = ${total}
      WHERE id = ${id}
    `);
  } else {
    const reason = (opts.lost_reason ?? '').slice(0, 500) || null;
    await db.execute(sql`
      UPDATE leads
      SET status = 'lost',
          resolved_at = NOW(),
          lost_reason = ${reason}
      WHERE id = ${id}
    `);
  }
}

export async function snooze(id: number, untilMs: number): Promise<void> {
  const until = new Date(untilMs);
  await db.execute(sql`
    UPDATE leads
    SET status = 'snoozed', snooze_until = ${until}
    WHERE id = ${id}
  `);
}

export async function listByStatus(
  status: string,
  limit: number,
  offset: number,
): Promise<LeadRowWire[]> {
  let rows;
  if (!status || status === 'all') {
    rows = await db.execute(sql`
      SELECT * FROM leads ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
    `);
  } else {
    rows = await db.execute(sql`
      SELECT * FROM leads WHERE status = ${status}
      ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
    `);
  }
  return rows.map((r: any) => toLeadRow(r));
}

export async function latestInThread(
  chatId: number,
  threadId: number,
): Promise<LeadRowWire | null> {
  const rows = await db.execute(sql`
    SELECT * FROM leads
    WHERE chat_id = ${chatId} AND message_thread_id = ${threadId}
    ORDER BY id DESC LIMIT 1
  `);
  return rows[0] ? toLeadRow(rows[0]) : null;
}

export async function setPosted(
  id: number,
  chatId: number,
  threadId: number | null,
  messageId: number,
): Promise<void> {
  await db.execute(sql`
    UPDATE leads
    SET chat_id = ${chatId},
        message_thread_id = ${threadId},
        posted_message_id = ${messageId}
    WHERE id = ${id}
  `);
}

export async function countByStatus(status: string): Promise<number> {
  let rows;
  if (!status || status === 'all') {
    rows = await db.execute(sql`SELECT COUNT(*)::int AS c FROM leads`);
  } else {
    rows = await db.execute(sql`SELECT COUNT(*)::int AS c FROM leads WHERE status = ${status}`);
  }
  return toNum((rows[0] as any)?.c ?? 0);
}

export async function recentByContact(
  contact: string,
  sinceMs: number,
): Promise<number> {
  const sinceTs = new Date(sinceMs);
  const rows = await db.execute(sql`
    SELECT COUNT(*)::int AS c FROM leads
    WHERE contact = ${contact} AND created_at >= ${sinceTs}
  `);
  return toNum((rows[0] as any)?.c ?? 0);
}
