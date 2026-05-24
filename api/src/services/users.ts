import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { inviteEdges, userWallets, users } from '../db/schema.js';
import { recomputePartnerStatus } from './partner-status.js';

const REF_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function generateRefCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  }
  return out;
}

export interface UserWithWallet {
  user: typeof users.$inferSelect;
  wallet: typeof userWallets.$inferSelect | null;
}

export async function findUserByWallet(address: string): Promise<UserWithWallet | null> {
  const addr = address.toLowerCase();
  const wallet = await db.query.userWallets.findFirst({
    where: eq(userWallets.address, addr),
  });
  if (!wallet) return null;
  const user = await db.query.users.findFirst({ where: eq(users.id, wallet.userId) });
  if (!user) return null;
  return { user, wallet };
}

export async function findOrCreateUserByWallet(
  address: string,
  chainId: number,
): Promise<UserWithWallet> {
  const existing = await findUserByWallet(address);
  if (existing) return existing;

  const addr = address.toLowerCase();

  // Generate unique ref_code (retry a few times on conflict)
  for (let attempt = 0; attempt < 6; attempt++) {
    const refCode = generateRefCode(8);
    try {
      const [user] = await db
        .insert(users)
        .values({ refCode })
        .returning();
      if (!user) throw new Error('insert user failed');
      const [wallet] = await db
        .insert(userWallets)
        .values({ userId: user.id, address: addr, chainId })
        .returning();
      return { user, wallet: wallet ?? null };
    } catch (e: any) {
      // Unique violation on ref_code → retry with new code.
      const msg = String(e?.message ?? e);
      if (msg.includes('ref_code') || msg.includes('users_ref_code')) continue;
      throw e;
    }
  }
  throw new Error('could not allocate ref_code');
}

export async function getUserById(id: number): Promise<UserWithWallet | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) return null;
  const wallet = await db.query.userWallets.findFirst({ where: eq(userWallets.userId, id) });
  return { user, wallet: wallet ?? null };
}

export async function findOrCreateUserByTg(
  tgId: number,
  tgUsername: string | null,
): Promise<typeof users.$inferSelect> {
  const existing = await db.query.users.findFirst({
    where: eq(users.tgId, tgId),
  });
  if (existing) {
    // update username if it changed
    if (tgUsername && tgUsername !== existing.tgUsername) {
      await db.update(users).set({ tgUsername, lastSeenAt: new Date() }).where(eq(users.id, existing.id));
      return { ...existing, tgUsername };
    }
    return existing;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const refCode = generateRefCode(8);
    try {
      const [user] = await db
        .insert(users)
        .values({ tgId, tgUsername, refCode })
        .returning();
      if (!user) throw new Error('insert user failed');
      return user;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('ref_code') || msg.includes('users_ref_code')) continue;
      throw e;
    }
  }
  throw new Error('could not allocate ref_code (tg signup)');
}

export async function findUserByRefCode(refCode: string): Promise<typeof users.$inferSelect | null> {
  const user = await db.query.users.findFirst({ where: eq(users.refCode, refCode) });
  return user ?? null;
}

export async function getInviter(childUserId: number): Promise<typeof users.$inferSelect | null> {
  const edge = await db.query.inviteEdges.findFirst({
    where: eq(inviteEdges.childUserId, childUserId),
  });
  if (!edge) return null;
  const parent = await db.query.users.findFirst({ where: eq(users.id, edge.parentUserId) });
  return parent ?? null;
}

export const ADMIN_REF_CODE = process.env.ADMIN_REF_CODE ?? 'admin';

/**
 * Ensure the admin / root-of-tree user exists. Called once at boot. Returns
 * the admin user so callers can cache the id. Idempotent.
 */
export async function ensureAdminUser(): Promise<typeof users.$inferSelect> {
  const existing = await findUserByRefCode(ADMIN_REF_CODE);
  if (existing) return existing;
  const [user] = await db
    .insert(users)
    .values({ refCode: ADMIN_REF_CODE })
    .returning();
  if (!user) throw new Error('failed to seed admin user');
  return user;
}

/**
 * Record an invite edge. Rules:
 *  - self-invite → attach to admin instead
 *  - unknown / empty / null refCode → attach to admin
 *  - child already has an edge → no-op
 * Every user thus gets exactly one parent: either a real referrer or admin.
 */
export async function attachInviter(
  childUserId: number,
  refCode: string | null | undefined,
): Promise<boolean> {
  const existing = await db.query.inviteEdges.findFirst({
    where: eq(inviteEdges.childUserId, childUserId),
  });
  if (existing) return false;

  let parent: typeof users.$inferSelect | null = null;
  const code = (refCode ?? '').trim();
  if (code) {
    parent = await findUserByRefCode(code);
  }
  // self-invite or unknown ref_code → fall back to admin
  if (!parent || parent.id === childUserId) {
    parent = await findUserByRefCode(ADMIN_REF_CODE);
  }
  // admin is the user themselves? (bootstrap edge case) → no edge
  if (!parent || parent.id === childUserId) return false;

  try {
    await db.insert(inviteEdges).values({
      childUserId,
      parentUserId: parent.id,
    });
    // Update inviter's PARTNER status (10+ L1 refs → +10% earn boost).
    // Non-blocking for the signup flow — swallow failures so a metric
    // issue doesn't break account creation.
    try {
      await recomputePartnerStatus(parent.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[attachInviter] partner recompute failed', e);
    }
    return true;
  } catch {
    return false;
  }
}
