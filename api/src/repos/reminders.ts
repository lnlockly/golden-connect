import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { reminderSteps, reminderSends } from '../db/schema.js';
import { toReminderStep, type ReminderStepWire, toNum } from './mappers.js';

export async function listAll(): Promise<ReminderStepWire[]> {
  const rows = await db.execute(sql`
    SELECT * FROM reminder_steps ORDER BY order_idx, id
  `);
  return rows.map((r: any) => toReminderStep(r));
}

export async function findById(id: number): Promise<ReminderStepWire | null> {
  const rows = await db.execute(sql`
    SELECT * FROM reminder_steps WHERE id = ${id} LIMIT 1
  `);
  return rows[0] ? toReminderStep(rows[0]) : null;
}

export interface CreateStepInput {
  order_idx?: number;
  delay_hours: number;
  text_ru: string;
  text_en?: string | null;
  text_zh?: string | null;
  enabled?: boolean;
}

export async function create(input: CreateStepInput): Promise<ReminderStepWire> {
  const orderIdx = input.order_idx ?? (await nextOrderIdx());
  const [row] = await db
    .insert(reminderSteps)
    .values({
      orderIdx,
      delayHours: input.delay_hours,
      textRu: input.text_ru,
      textEn: input.text_en ?? null,
      textZh: input.text_zh ?? null,
      enabled: input.enabled === false ? false : true,
    })
    .returning();
  if (!row) throw new Error('reminder step insert failed');
  return toReminderStep(row);
}

export interface PatchStepInput {
  order_idx?: number;
  delay_hours?: number;
  text_ru?: string;
  text_en?: string | null;
  text_zh?: string | null;
  enabled?: boolean;
}

export async function patch(id: number, p: PatchStepInput): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (p.order_idx !== undefined) set.orderIdx = p.order_idx;
  if (p.delay_hours !== undefined) set.delayHours = p.delay_hours;
  if (p.text_ru !== undefined) set.textRu = p.text_ru;
  if (p.text_en !== undefined) set.textEn = p.text_en;
  if (p.text_zh !== undefined) set.textZh = p.text_zh;
  if (p.enabled !== undefined) set.enabled = p.enabled;
  if (Object.keys(set).length === 1) return false; // only updatedAt → nothing to change
  const res = await db
    .update(reminderSteps)
    .set(set)
    .where(eq(reminderSteps.id, id))
    .returning({ id: reminderSteps.id });
  return res.length > 0;
}

export async function remove(id: number): Promise<void> {
  await db.delete(reminderSteps).where(eq(reminderSteps.id, id));
}

export async function nextOrderIdx(): Promise<number> {
  const rows = await db.execute(sql`
    SELECT COALESCE(MAX(order_idx), 0) + 1 AS n FROM reminder_steps
  `);
  return toNum((rows[0] as any)?.n ?? 1);
}

export async function recordSent(userId: number, stepId: number): Promise<void> {
  // UNIQUE(user_id, step_id) → ON CONFLICT DO NOTHING makes this idempotent.
  await db.execute(sql`
    INSERT INTO reminder_sends (user_id, step_id, sent_at)
    VALUES (${userId}, ${stepId}, NOW())
    ON CONFLICT (user_id, step_id) DO NOTHING
  `);
}

export interface PendingReminderCandidate {
  user_id: number;
  tg_id: number;
  language_code: string | null;
  step_id: number;
  order_idx: number;
  delay_hours: number;
  text_ru: string;
  text_en: string | null;
  text_zh: string | null;
}

/**
 * Due reminders: enabled steps × (non-blocked, non-applied users) where
 *   users.joined_at + step.delay_hours*3600s <= NOW()
 * and there is NO row yet in reminder_sends for (user_id, step_id).
 */
export async function listDue(limit = 50): Promise<PendingReminderCandidate[]> {
  const rows = await db.execute(sql`
    SELECT
      u.id::int          AS user_id,
      u.tg_id            AS tg_id,
      u.language_code    AS language_code,
      s.id::int          AS step_id,
      s.order_idx::int   AS order_idx,
      s.delay_hours      AS delay_hours,
      s.text_ru          AS text_ru,
      s.text_en          AS text_en,
      s.text_zh          AS text_zh
    FROM users u
    CROSS JOIN reminder_steps s
    WHERE s.enabled = TRUE
      AND u.is_blocked = FALSE
      AND u.applied_on_site = FALSE
      AND u.tg_id IS NOT NULL
      AND u.joined_at + (s.delay_hours || ' hours')::interval <= NOW()
      AND NOT EXISTS (
        SELECT 1 FROM reminder_sends rs
        WHERE rs.user_id = u.id AND rs.step_id = s.id
      )
    ORDER BY s.order_idx ASC, u.id ASC
    LIMIT ${limit}
  `);
  return rows.map((r: any) => ({
    user_id: toNum(r.user_id),
    tg_id: toNum(r.tg_id),
    language_code: r.language_code ?? null,
    step_id: toNum(r.step_id),
    order_idx: toNum(r.order_idx),
    delay_hours: Number(r.delay_hours),
    text_ru: r.text_ru,
    text_en: r.text_en ?? null,
    text_zh: r.text_zh ?? null,
  }));
}
