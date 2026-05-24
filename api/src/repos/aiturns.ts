import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { aiTurns } from '../db/schema.js';
import { toAiTurn, type AiTurnWire } from './mappers.js';

export async function recent(tgId: number, limit: number): Promise<AiTurnWire[]> {
  const rows = await db.execute(sql`
    SELECT * FROM ai_turns
    WHERE tg_id = ${tgId}
    ORDER BY id DESC
    LIMIT ${limit}
  `);
  // Bot's contract: chronological order. Select DESC then reverse.
  return rows.map((r: any) => toAiTurn(r)).reverse();
}

export async function append(
  tgId: number,
  role: string,
  content: string,
): Promise<void> {
  await db.insert(aiTurns).values({ tgId, role, content });
}

export async function reset(tgId: number): Promise<number> {
  const res = await db.execute(sql`
    DELETE FROM ai_turns WHERE tg_id = ${tgId} RETURNING id
  `);
  return res.length;
}
