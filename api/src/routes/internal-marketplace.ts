import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { cashLedger, matrixPositions, users } from '../db/schema.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { applyIncomeSplit } from '../services/income-split.js';
import { accrueLeaderPool } from '../services/income-split.js';
import { aboveN } from '../services/matrix.js';
import { isMatrixLaunched } from '../services/matrix-launch.js';
import { logger } from '../lib/logger.js';

/**
 * Marketplace sale distribution. Cabinet calls this after the buyer's
 * payment lands. Idempotent on saleId — re-runs are no-op.
 *
 * Split (per user 2026-04-29 marketing):
 *   70%   → seller (default seller_pct, configurable via the request)
 *   10%   → admin (matrix position 0)
 *   7.5%  → seller's L1/L2/L3 ref by users.invited_by_user_id chain
 *           (L1=5%, L2=1.5%, L3=1% of full price)
 *   7.5%  → matrix pool, distributed by new formula:
 *             positions = [seller's all positions] + [ancestors of seller's deepest pos]
 *             share = pool / len(positions)
 *             credit each position's owner one share each
 *   5%    → leader_pool_fund (admin user, kind='leader_pool_fund')
 */

const log = logger.child({ module: 'mp-distribute' });

const bodySchema = z.object({
  sale_id: z.union([z.number(), z.string()]),
  seller_user_id: z.number().int().positive(),
  price_micro: z.union([z.number(), z.string()]).transform(v => BigInt(v)),
  seller_pct: z.number().min(0).max(1).default(0.70),
});

const app = new Hono();

app.use('/internal/marketplace/distribute-sale', requireInternalSecret);

app.post('/internal/marketplace/distribute-sale', async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return c.json({ ok: false, error: 'invalid_body', details: parsed.error.flatten() }, 400);

  const { sale_id, seller_user_id, price_micro, seller_pct } = parsed.data;
  const memoKey = `mp_sale:${sale_id}`;

  // Idempotency check
  const existing = (await db.execute(sql`
    SELECT id FROM cash_ledger WHERE memo = ${memoKey} AND kind = 'mp_sale_seller' LIMIT 1
  `)) as unknown as Array<{ id: number }>;
  if (existing.length > 0) {
    return c.json({ ok: true, already_distributed: true });
  }

  // Resolve admin user (matrix position 0)
  const adminRows = (await db.execute(sql`
    SELECT user_id FROM matrix_positions WHERE position = 0 LIMIT 1
  `)) as unknown as Array<{ user_id: number }>;
  const adminUserId = adminRows[0]?.user_id ? Number(adminRows[0].user_id) : null;

  // Compute shares (BigInt, all in micros)
  const sellerPctNum = seller_pct * 1000;
  const sellerShare    = (price_micro * BigInt(Math.round(sellerPctNum))) / 1000n;
  const adminShare     = (price_micro * 100n) / 1000n;     // 10%
  const refL1Share     = (price_micro * 50n) / 1000n;      // 5%
  const refL2Share     = (price_micro * 15n) / 1000n;      // 1.5%
  const refL3Share     = (price_micro * 10n) / 1000n;      // 1%
  const matrixPool     = (price_micro * 75n) / 1000n;      // 7.5%
  const leaderPoolShare = (price_micro * 50n) / 1000n;     // 5%

  // Resolve seller's L1/L2/L3 invited_by chain
  const refChain: number[] = [];
  let cur: number | null = seller_user_id;
  for (let i = 0; i < 3; i++) {
    const r = (await db.execute(sql`
      SELECT invited_by_user_id FROM users WHERE id = ${cur} LIMIT 1
    `)) as unknown as Array<{ invited_by_user_id: number | null }>;
    const next = r[0]?.invited_by_user_id ? Number(r[0].invited_by_user_id) : null;
    if (!next) break;
    refChain.push(next);
    cur = next;
  }

  // Resolve seller's matrix positions
  const sellerPositions = (await db.execute(sql`
    SELECT position, seat_index FROM matrix_positions
    WHERE user_id = ${seller_user_id}
    ORDER BY seat_index ASC
  `)) as unknown as Array<{ position: number; seat_index: number }>;

  const result = {
    ok: true,
    seller_share_micro: sellerShare.toString(),
    admin_share_micro: adminShare.toString(),
    ref_l1_share_micro: refL1Share.toString(),
    ref_l2_share_micro: refL2Share.toString(),
    ref_l3_share_micro: refL3Share.toString(),
    matrix_pool_micro: matrixPool.toString(),
    leader_pool_micro: leaderPoolShare.toString(),
    matrix_positions_paid: 0,
    refs_paid: 0,
  };

  await db.transaction(async (tx) => {
    // 1. Seller gets 70% with applyIncomeSplit (80/20)
    if (sellerShare > 0n) {
      const [led] = await tx.insert(cashLedger).values({
        userId: seller_user_id,
        kind: 'mp_sale_seller',
        amountMicro: sellerShare,
        memo: memoKey,
      }).returning({ id: cashLedger.id });
      await applyIncomeSplit(tx as any, seller_user_id, sellerShare, 'mp_sale_seller', led.id);
    }

    // 2. Admin 10% (no split — admin fee)
    if (adminUserId !== null && adminShare > 0n) {
      await tx.insert(cashLedger).values({
        userId: adminUserId,
        kind: 'admin_fee',
        amountMicro: adminShare,
        relatedUserId: seller_user_id,
        memo: memoKey + ':admin',
      });
    } else if (adminShare > 0n) {
      log.warn({ saleId: sale_id }, 'admin_user not seeded — skipping admin share');
    }

    // 3. Linear refs L1/L2/L3 (with applyIncomeSplit)
    const refShares = [refL1Share, refL2Share, refL3Share];
    let unclaimed = 0n;
    for (let i = 0; i < 3; i++) {
      const recipient = refChain[i];
      const amount = refShares[i];
      if (amount <= 0n) continue;
      if (!recipient) {
        unclaimed += amount;
        continue;
      }
      const [led] = await tx.insert(cashLedger).values({
        userId: recipient,
        kind: 'mp_ref',
        amountMicro: amount,
        relatedUserId: seller_user_id,
        level: i + 1,
        memo: memoKey + ':ref_l' + (i + 1),
      }).returning({ id: cashLedger.id });
      await applyIncomeSplit(tx as any, recipient, amount, 'mp_ref', led.id);
      result.refs_paid++;
    }
    // Unclaimed ref shares → admin
    if (unclaimed > 0n && adminUserId !== null) {
      await tx.insert(cashLedger).values({
        userId: adminUserId,
        kind: 'admin_fee',
        amountMicro: unclaimed,
        relatedUserId: seller_user_id,
        memo: memoKey + ':ref_unclaimed',
      });
    }

    // 4. Matrix distribution — defer if matrix not launched yet (pre-launch)
    const matrixLaunched = await isMatrixLaunched();
    if (matrixPool > 0n && !matrixLaunched) {
      // Defer: write to mp_pending_matrix, drained later by admin button.
      try {
        await tx.execute(sql`
          INSERT INTO mp_pending_matrix (sale_id, seller_user_id, matrix_pool_micro, memo_base)
          VALUES (${String(sale_id)}, ${seller_user_id}, ${Number(matrixPool)}, ${memoKey})
          ON CONFLICT (sale_id) DO NOTHING
        `);
        log.info({ saleId: sale_id, sellerId: seller_user_id, micro: matrixPool.toString() }, 'mp_matrix deferred — matrix not launched');
      } catch (e: any) {
        log.error({ err: e?.message, saleId: sale_id }, 'mp_pending_matrix insert failed');
      }
    } else if (matrixPool > 0n && sellerPositions.length > 0) {
      const deepestPos = Math.max(...sellerPositions.map(p => Number(p.position)));
      const ancestorPositions = aboveN(deepestPos, 200); // up to 200 levels (effectively to root)
      // Recipients = all seller positions + all ancestor positions
      const allPositions = [
        ...ancestorPositions,
        ...sellerPositions.map(p => Number(p.position)),
      ];
      const N = allPositions.length;
      if (N > 0) {
        const sharePerPos = matrixPool / BigInt(N);
        const remainder = matrixPool - sharePerPos * BigInt(N);

        // Resolve owners for ancestor positions in one query
        const allPosOwners = (await tx.execute(sql`
          SELECT position, user_id FROM matrix_positions
          WHERE position = ANY(${allPositions})
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
            relatedUserId: seller_user_id,
            memo: memoKey + ':matrix_pos_' + pos,
          }).returning({ id: cashLedger.id });
          await applyIncomeSplit(tx as any, owner, sharePerPos, 'mp_matrix', led.id);
          result.matrix_positions_paid++;
        }
        // Remainder → admin
        if (remainder > 0n && adminUserId !== null) {
          await tx.insert(cashLedger).values({
            userId: adminUserId,
            kind: 'admin_fee',
            amountMicro: remainder,
            relatedUserId: seller_user_id,
            memo: memoKey + ':matrix_dust',
          });
        }
      }
    } else if (matrixPool > 0n && adminUserId !== null) {
      // No matrix positions for seller → matrix pool to admin
      await tx.insert(cashLedger).values({
        userId: adminUserId,
        kind: 'admin_fee',
        amountMicro: matrixPool,
        relatedUserId: seller_user_id,
        memo: memoKey + ':matrix_no_seller_position',
      });
    }

    // 5. Leader pool 5%
    if (leaderPoolShare > 0n && adminUserId !== null) {
      await tx.insert(cashLedger).values({
        userId: adminUserId,
        kind: 'leader_pool_fund',
        amountMicro: leaderPoolShare,
        relatedUserId: seller_user_id,
        memo: memoKey + ':leader_pool',
      });
    }
  });

  log.info({ saleId: sale_id, sellerId: seller_user_id, ...result }, 'mp_sale distributed');
  return c.json(result);
});

export default app;
