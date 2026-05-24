import { sql, eq } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import { users } from '../db/schema.js';

/**
 * Partner status — Marketing v2 (2026-04).
 *
 * A user reaches PARTNER status once they have 10 or more direct (L1)
 * invitees on any tariff — including FREE. PARTNER grants +10% on their
 * earn rate across the platform (task pool, ad views, ref accruals).
 *
 * `users.partner_status` is a denormalised flag; `qualified_refs_l1` is
 * the current count. Both are maintained together. We don't live-count
 * on every accrual — too hot — we recompute on events that can move the
 * count: new invite edge created, existing invitee leaves/joins.
 */

const PARTNER_THRESHOLD = 10;
const PARTNER_BOOST_BP = 1000; // +10% in basis points

/**
 * Returns the current L1 invitee count for a user. Canonical source is
 * invite_edges.parent_user_id COUNT.
 */
export async function countL1Refs(userId: number, tx: DB = db): Promise<number> {
  const rows = await tx.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM invite_edges
    WHERE parent_user_id = ${userId}
      AND parent_user_id <> child_user_id
  `);
  const row = rows[0] as { n: number } | undefined;
  return row?.n != null ? Number(row.n) : 0;
}

/**
 * Recompute partner_status for a user and sync the denormalised columns.
 * Idempotent — safe to call on every invite event. Uses a single UPDATE
 * so concurrent writers see consistent state.
 */
export async function recomputePartnerStatus(userId: number, tx: DB = db): Promise<{
  qualifiedRefsL1: number;
  partnerStatus: boolean;
  justPromoted: boolean;
}> {
  const n = await countL1Refs(userId, tx);
  const shouldBePartner = n >= PARTNER_THRESHOLD;

  // Fetch current row to detect promotion (for hooks like TG notification).
  const [current] = await tx
    .select({
      partnerStatus: users.partnerStatus,
      qualifiedRefsL1: users.qualifiedRefsL1,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!current) {
    return { qualifiedRefsL1: n, partnerStatus: false, justPromoted: false };
  }

  const wasPartner = Boolean(current.partnerStatus);
  const justPromoted = !wasPartner && shouldBePartner;

  // Only write when something actually changed (reduces WAL churn).
  if (n !== current.qualifiedRefsL1 || wasPartner !== shouldBePartner) {
    await tx
      .update(users)
      .set({
        qualifiedRefsL1: n,
        partnerStatus: shouldBePartner,
        ...(justPromoted ? { partnerStatusSince: new Date() } : {}),
      })
      .where(eq(users.id, userId));
  }

  return { qualifiedRefsL1: n, partnerStatus: shouldBePartner, justPromoted };
}

/**
 * Returns the current earn-rate boost for a user in basis points.
 * PARTNER earns +10% on action rewards; non-partners earn 0% boost.
 *
 * Called by task-pool / ad-view / daily-digest engines when computing the
 * payable amount for a per-action accrual.
 */
export async function getRateBoostBp(userId: number, tx: DB = db): Promise<number> {
  const [row] = await tx
    .select({ partnerStatus: users.partnerStatus })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.partnerStatus ? PARTNER_BOOST_BP : 0;
}

/**
 * Apply the earn-rate boost to a base amount. Safe for zero/negative inputs.
 */
export function applyRateBoost(baseMicro: bigint, boostBp: number): bigint {
  if (baseMicro <= 0n || boostBp <= 0) return baseMicro;
  // baseMicro + baseMicro * boostBp / 10_000
  return baseMicro + (baseMicro * BigInt(boostBp)) / 10_000n;
}

export const PARTNER_CONSTANTS = {
  PARTNER_THRESHOLD,
  PARTNER_BOOST_BP,
} as const;
