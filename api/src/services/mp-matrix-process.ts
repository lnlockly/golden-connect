import { sql } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { cashLedger, matrixPositions } from '../db/schema.js';
import { applyIncomeSplit } from './income-split.js';
import { aboveN } from './matrix.js';
import { isMatrixLaunched } from './matrix-launch.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'mp-matrix-process' });

export interface PendingMpRow {
  id: number;
  sale_id: string;
  seller_user_id: number;
  matrix_pool_micro: bigint;
  memo_base: string | null;
}

/**
 * Process a single pending mp_pending_matrix row.
 * Distributes the matrix_pool by the new formula:
 *   recipients = all seller positions + all upline ancestor positions
 *   share = pool / N
 *   each position credited share with mp_matrix kind + 80/20 split.
 * Marks the row processed_at + status='completed'.
 */
export async function processOnePending(row: PendingMpRow, tx: DB = db): Promise<{ ok: boolean; positions_paid: number }> {
  const memoBase = row.memo_base || ('mp_sale:' + row.sale_id);
  const adminRows = (await tx.execute(sql`
    SELECT user_id FROM matrix_positions WHERE position = 0 LIMIT 1
  `)) as unknown as Array<{ user_id: number }>;
  const adminUserId = adminRows[0]?.user_id ? Number(adminRows[0].user_id) : null;

  const sellerPositions = (await tx.execute(sql`
    SELECT position FROM matrix_positions WHERE user_id = ${row.seller_user_id} ORDER BY seat_index ASC
  `)) as unknown as Array<{ position: number }>;

  const matrixPool = BigInt(row.matrix_pool_micro);
  let positionsPaid = 0;

  if (matrixPool > 0n && sellerPositions.length > 0) {
    const deepestPos = Math.max(...sellerPositions.map(p => Number(p.position)));
    const ancestorPositions = aboveN(deepestPos, 200);
    const allPositions = [...ancestorPositions, ...sellerPositions.map(p => Number(p.position))];
    const N = allPositions.length;
    if (N > 0) {
      const sharePerPos = matrixPool / BigInt(N);
      const remainder = matrixPool - sharePerPos * BigInt(N);
      const allPosOwners = (await tx.execute(sql`
        SELECT position, user_id FROM matrix_positions WHERE position = ANY(${allPositions})
      `)) as unknown as Array<{ position: number; user_id: number }>;
      const ownerMap = new Map<number, number>();
      for (const r of allPosOwners) ownerMap.set(Number(r.position), Number(r.user_id));

      for (const pos of allPositions) {
        const owner = ownerMap.get(pos);
        if (!owner) continue;
        const [led] = await tx.insert(cashLedger).values({
          userId: owner,
          kind: 'mp_matrix',
          amountMicro: sharePerPos,
          relatedUserId: row.seller_user_id,
          memo: memoBase + ':matrix_pos_' + pos + ':backfill',
        }).returning({ id: cashLedger.id });
        await applyIncomeSplit(tx as any, owner, sharePerPos, 'mp_matrix', led.id);
        positionsPaid++;
      }
      if (remainder > 0n && adminUserId !== null) {
        await tx.insert(cashLedger).values({
          userId: adminUserId,
          kind: 'admin_fee',
          amountMicro: remainder,
          relatedUserId: row.seller_user_id,
          memo: memoBase + ':matrix_dust:backfill',
        });
      }
    }
  } else if (matrixPool > 0n && adminUserId !== null) {
    // Seller still has no matrix positions even after launch — admin gets it
    await tx.insert(cashLedger).values({
      userId: adminUserId,
      kind: 'admin_fee',
      amountMicro: matrixPool,
      relatedUserId: row.seller_user_id,
      memo: memoBase + ':matrix_no_seller_position:backfill',
    });
  }

  // Mark processed
  await tx.execute(sql`
    UPDATE mp_pending_matrix SET status = 'completed', processed_at = NOW() WHERE id = ${row.id}
  `);
  return { ok: true, positions_paid: positionsPaid };
}

/**
 * Drain all pending mp_matrix rows. Should be called after the admin
 * activates the matrix (launchMatrixBackfill).
 */
export async function processPendingMpMatrix(): Promise<{ processed: number; positions_paid: number; errors: number }> {
  const launched = await isMatrixLaunched();
  if (!launched) {
    log.info('processPendingMpMatrix: matrix not launched yet, skipping');
    return { processed: 0, positions_paid: 0, errors: 0 };
  }

  const pending = (await db.execute(sql`
    SELECT id, sale_id, seller_user_id, matrix_pool_micro, memo_base
    FROM mp_pending_matrix
    WHERE status = 'pending'
    ORDER BY id ASC
  `)) as unknown as Array<{ id: number; sale_id: string; seller_user_id: number; matrix_pool_micro: string; memo_base: string | null }>;

  log.info({ count: pending.length }, 'processPendingMpMatrix: starting drain');

  let processed = 0;
  let positionsPaid = 0;
  let errors = 0;

  for (const row of pending) {
    try {
      const r = await db.transaction(async (tx) => {
        return await processOnePending({
          id: row.id,
          sale_id: row.sale_id,
          seller_user_id: row.seller_user_id,
          matrix_pool_micro: BigInt(row.matrix_pool_micro),
          memo_base: row.memo_base,
        }, tx as unknown as DB);
      });
      processed++;
      positionsPaid += r.positions_paid;
    } catch (e: any) {
      log.error({ saleId: row.sale_id, err: e?.message }, 'pending mp_matrix process failed');
      errors++;
    }
  }

  log.info({ processed, positionsPaid, errors }, 'processPendingMpMatrix: drain complete');
  return { processed, positions_paid: positionsPaid, errors };
}
