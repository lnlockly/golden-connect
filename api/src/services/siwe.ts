import { randomBytes } from 'node:crypto';
import { SiweMessage } from 'siwe';
import { and, eq, isNull, gte } from 'drizzle-orm';
import { db } from '../db/client.js';
import { walletNonces } from '../db/schema.js';

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 min

// RFC 4648 base32 alphabet (no padding)
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32[(value << (5 - bits)) & 31];
  }
  return out;
}

export function generateNonce(): string {
  // 16 bytes → ~26 chars base32
  return encodeBase32(randomBytes(16));
}

export function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

export async function issueNonce(address: string): Promise<{ nonce: string; expiresAt: Date }> {
  const addr = normalizeAddress(address);
  const nonce = generateNonce();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);

  // upsert: one pending nonce per address
  await db
    .insert(walletNonces)
    .values({
      address: addr,
      nonce,
      issuedAt: now,
      expiresAt,
      consumedAt: null,
    })
    .onConflictDoUpdate({
      target: walletNonces.address,
      set: {
        nonce,
        issuedAt: now,
        expiresAt,
        consumedAt: null,
      },
    });

  return { nonce, expiresAt };
}

export async function consumeNonce(address: string, nonce: string): Promise<boolean> {
  const addr = normalizeAddress(address);
  const now = new Date();
  const rows = await db
    .update(walletNonces)
    .set({ consumedAt: now })
    .where(
      and(
        eq(walletNonces.address, addr),
        eq(walletNonces.nonce, nonce),
        isNull(walletNonces.consumedAt),
        gte(walletNonces.expiresAt, now),
      ),
    )
    .returning({ address: walletNonces.address });
  return rows.length > 0;
}

export interface SiweVerifyInput {
  message: string;
  signature: string;
  expectedChainId: number;
}

export interface SiweVerifyOk {
  ok: true;
  address: string; // lowercased
  chainId: number;
  nonce: string;
}

export interface SiweVerifyFail {
  ok: false;
  reason: string;
}

export async function verifySiwe(input: SiweVerifyInput): Promise<SiweVerifyOk | SiweVerifyFail> {
  let parsed: SiweMessage;
  try {
    parsed = new SiweMessage(input.message);
  } catch (e) {
    return { ok: false, reason: 'invalid_message' };
  }

  if (parsed.chainId !== input.expectedChainId) {
    return { ok: false, reason: 'chain_mismatch' };
  }

  try {
    const res = await parsed.verify({
      signature: input.signature,
      time: new Date().toISOString(),
    });
    if (!res.success || !res.data) {
      return { ok: false, reason: 'siwe_verify_failed' };
    }
    const address = normalizeAddress(res.data.address);
    return {
      ok: true,
      address,
      chainId: res.data.chainId,
      nonce: res.data.nonce,
    };
  } catch (e) {
    return { ok: false, reason: 'siwe_verify_threw' };
  }
}
