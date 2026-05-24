import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { broadcasts } from '../db/schema.js';

export async function create(adminTgId: number, text: string): Promise<number> {
  const [row] = await db
    .insert(broadcasts)
    .values({ adminTgId, text })
    .returning({ id: broadcasts.id });
  if (!row) throw new Error('broadcast insert failed');
  return row.id;
}

export async function updateProgress(
  id: number,
  sent: number,
  failed: number,
): Promise<void> {
  await db
    .update(broadcasts)
    .set({ sentCount: sent, failedCount: failed })
    .where(eq(broadcasts.id, id));
}
