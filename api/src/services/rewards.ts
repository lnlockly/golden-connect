import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { flowLedger } from '../db/schema.js';
import { env } from './env.js';

/**
 * Referral reward accrual for closed-won leads.
 *
 * Flow: when a lead transitions to `won`, 20% of its USD value becomes a
 * "reward pool" distributed up the inviter tree. Each ancestor collects a
 * percentage according to `REFERRAL_CURVE` based on their depth relative to
 * the paying user. Amounts are written to `flow_ledger` as `kind='referral_reward'`
 * and are idempotent — re-running on the same lead is a no-op.
 *
 * Default curve mirrors the landing copy:
 *   L1 10%, L2 5%, L3 3%, L4-10 1% each, L11-100 0.1% each.
 *   Sum = 10 + 5 + 3 + 7*1 + 90*0.1 = 34% of pool. Pool = 20% of lead USD.
 *   So end payout per lead is ~6.8% of its USD value spread up the tree.
 */

export interface CurveBand {
  levels: [number, number];
  pct: number;
}

const DEFAULT_CURVE: readonly CurveBand[] = [
  { levels: [1, 1], pct: 0.10 },
  { levels: [2, 2], pct: 0.05 },
  { levels: [3, 3], pct: 0.03 },
  { levels: [4, 10], pct: 0.01 },
  { levels: [11, 100], pct: 0.001 },
];

function loadCurve(): readonly CurveBand[] {
  const raw = env.referralCurveJson;
  if (!raw) return DEFAULT_CURVE;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_CURVE;
    return parsed
      .filter(
        (b: any) =>
          Array.isArray(b?.levels) &&
          b.levels.length === 2 &&
          typeof b.pct === 'number',
      )
      .map((b: any) => ({ levels: [Number(b.levels[0]), Number(b.levels[1])] as [number, number], pct: Number(b.pct) }));
  } catch {
    return DEFAULT_CURVE;
  }
}

export function pctForLevel(level: number): number {
  const curve = loadCurve();
  for (const band of curve) {
    const [from, to] = band.levels;
    if (level >= from && level <= to) return band.pct;
  }
  return 0;
}

/** Turn a USD dollar figure into 6-decimal FLOW-token micro units. */
function usdToMicro(usd: number): bigint {
  // 1 USD = 1 FLOW for accrual purposes — the ledger is denominated in
  // "micro" units (1e6). Round half-up to the nearest micro.
  return BigInt(Math.round(usd * 1_000_000));
}

export interface AccrualSummary {
  already: boolean;
  leadId: number;
  totalMicro: bigint;
  entries: { userId: number; level: number; amountMicro: bigint }[];
}

/**
 * Walk the inviter chain up to 100 levels and record referral rewards for
 * a won lead. Idempotent: if any flow_ledger row with
 * memo='lead:<id>' already exists, returns `{already:true}` without writing
 * more.
 *
 * Accepts an optional `tx` parameter so callers inside an enclosing
 * transaction (e.g. the Platega webhook) can chain it. When omitted a
 * fresh transaction is opened.
 */
export async function accrueForLead(
  leadId: number,
  tx: typeof db = db,
): Promise<AccrualSummary> {
  const leadRows = await tx.execute(sql`
    SELECT id, user_id, total_usd FROM leads WHERE id = ${leadId} LIMIT 1
  `);
  const lead = leadRows[0] as any;
  if (!lead) throw new Error(`lead ${leadId} not found`);
  if (lead.user_id == null) {
    return { already: false, leadId, totalMicro: 0n, entries: [] };
  }
  const totalUsd = Number(lead.total_usd ?? 0);
  if (!totalUsd || totalUsd <= 0) {
    return { already: false, leadId, totalMicro: 0n, entries: [] };
  }

  const memo = `lead:${leadId}`;
  const existing = await tx.execute(sql`
    SELECT 1 FROM flow_ledger
    WHERE kind = 'referral_reward' AND memo = ${memo}
    LIMIT 1
  `);
  if (existing.length > 0) {
    return { already: true, leadId, totalMicro: 0n, entries: [] };
  }

  // Walk up the tree. We load the full 100-deep chain in one query then
  // distribute in JS — easier to unit-test than a fanout inside SQL.
  const chainRows = await tx.execute(sql`
    WITH RECURSIVE chain AS (
      SELECT ie.parent_user_id AS id, 1 AS lvl
      FROM invite_edges ie
      WHERE ie.child_user_id = ${lead.user_id}
      UNION ALL
      SELECT ie.parent_user_id, c.lvl + 1
      FROM invite_edges ie
      JOIN chain c ON ie.child_user_id = c.id
      WHERE c.lvl < 100
    )
    SELECT id, lvl FROM chain ORDER BY lvl ASC
  `);

  if (chainRows.length === 0) {
    return { already: false, leadId, totalMicro: 0n, entries: [] };
  }

  const poolMicro = (usdToMicro(totalUsd) * 20n) / 100n;
  const entries: AccrualSummary['entries'] = [];

  const doAccrue = async (txx: typeof db) => {
    for (const row of chainRows) {
      const rr = row as any;
      const ancestorId = Number(rr.id);
      const level = Number(rr.lvl);
      const pct = pctForLevel(level);
      if (pct <= 0) continue;
      // poolMicro * pct — use integer math: scale pct by 1e6 then divide.
      const scaled = BigInt(Math.round(pct * 1_000_000));
      const amountMicro = (poolMicro * scaled) / 1_000_000n;
      if (amountMicro <= 0n) continue;

      await txx.insert(flowLedger).values({
        userId: ancestorId,
        kind: 'referral_reward',
        amountMicro,
        relatedLeadId: leadId,
        relatedUserId: lead.user_id,
        level,
        memo,
      });
      entries.push({ userId: ancestorId, level, amountMicro });
    }
  };

  if (tx === db) {
    await db.transaction(async (inner) => {
      await doAccrue(inner as unknown as typeof db);
    });
  } else {
    await doAccrue(tx);
  }

  const totalMicro = entries.reduce((acc, e) => acc + e.amountMicro, 0n);
  return { already: false, leadId, totalMicro, entries };
}
