// DB operations for Monar. All writes go through a transaction.
// Invariant: every cent in/out of a balance is mirrored by a row in
// monar_balance_ops (immutable ledger).

import { and, eq, sql, desc, asc, gte, isNull } from 'drizzle-orm';
import { db, type DB } from '../db/client.js';
import {
  monarLots,
  monarPlaces,
  monarBalances,
  monarBalanceOps,
  monarIncomeAccruals,
  monarReferralLinks,
  monarCreditLots,
  monarWorldPoolPeriods,
  monarWorldPoolPayouts,
  monarAbonentkaCharges,
  monarOperations,
} from './schema.js';
import {
  CREDIT_LOT_USD_CENTS,
  LOT_SPECS,
  LotUsd,
  PLACE_COST_CENTS,
  WORLD_POOL_MIN_LOT_USD,
} from './rules.js';
import {
  distributeLotClosure,
  distributeLotPurchase,
  distributePlaceEntry,
} from './distribute.js';
import { planClosureReinvest } from './reinvest.js';
import { decideAutoActivate, distributeMonthlyPool, periodOf } from './world-pool.js';
import {
  dueCharges,
  weeklyFeeCents,
} from './abonentka.js';

type Tx = Parameters<DB['transaction']>[0] extends (tx: infer T) => any ? T : never;

// =========================================================================
// Internal helpers (always called inside a transaction)
// =========================================================================

async function ensureBalances(tx: Tx, userId: number) {
  await tx
    .insert(monarBalances)
    .values({ userId })
    .onConflictDoNothing();
}

async function creditBalance(
  tx: Tx,
  userId: number,
  kind: 'topup' | 'income' | 'referral',
  amountCents: number,
  reason: string,
  refId?: string,
) {
  if (amountCents === 0) return;
  await ensureBalances(tx, userId);
  const col =
    kind === 'topup' ? 'topupCents' :
    kind === 'income' ? 'incomeCents' :
    'referralCents';
  // SQL: balance += amount
  const colSql =
    kind === 'topup' ? sql`topup_cents` :
    kind === 'income' ? sql`income_cents` :
    sql`referral_cents`;
  await tx.execute(sql`
    UPDATE monar_balances
    SET ${colSql} = ${colSql} + ${amountCents}, updated_at = now()
    WHERE user_id = ${userId}
  `);
  await tx.insert(monarBalanceOps).values({
    userId, kind, direction: 'credit', amountCents,
    reason, refId: refId ?? null,
  });
}

async function debitBalance(
  tx: Tx,
  userId: number,
  kind: 'topup' | 'income' | 'referral',
  amountCents: number,
  reason: string,
  refId?: string,
) {
  if (amountCents === 0) return;
  await ensureBalances(tx, userId);
  // Check available
  const rows = await tx.select().from(monarBalances).where(eq(monarBalances.userId, userId)).limit(1);
  const cur = rows[0];
  if (!cur) throw new Error(`balance not found for user ${userId}`);
  const have =
    kind === 'topup' ? cur.topupCents :
    kind === 'income' ? cur.incomeCents :
    cur.referralCents;
  if (have < amountCents) {
    throw new Error(`insufficient ${kind}: have ${have}, need ${amountCents}`);
  }
  const colSql =
    kind === 'topup' ? sql`topup_cents` :
    kind === 'income' ? sql`income_cents` :
    sql`referral_cents`;
  await tx.execute(sql`
    UPDATE monar_balances
    SET ${colSql} = ${colSql} - ${amountCents}, updated_at = now()
    WHERE user_id = ${userId}
  `);
  await tx.insert(monarBalanceOps).values({
    userId, kind, direction: 'debit', amountCents,
    reason, refId: refId ?? null,
  });
}

async function getUpline(tx: Tx, userId: number, levels: number): Promise<number[]> {
  const out: number[] = [];
  let current = userId;
  for (let i = 0; i < levels; i++) {
    const row = await tx
      .select({ inviterUserId: monarReferralLinks.inviterUserId })
      .from(monarReferralLinks)
      .where(eq(monarReferralLinks.userId, current))
      .limit(1);
    const inviter = row[0]?.inviterUserId;
    if (!inviter) break;
    out.push(inviter);
    current = inviter;
  }
  return out;
}

// =========================================================================
// PUBLIC API
// =========================================================================

export interface BuyLotInput {
  userId: number;
  lotUsd: LotUsd;
  // When true, debit from topup balance. False for system-funded
  // (reinvest auto-activate, world pool auto-activate) where the cost
  // is already moved by the caller's transaction.
  payFromTopup?: boolean;
}

export interface BuyLotOutput {
  lotId: number;
  placesInserted: number;
  ownerBusinessCents: number;
  systemTechnicalCents: number;
}

export async function buyLot(input: BuyLotInput): Promise<BuyLotOutput> {
  const spec = LOT_SPECS[input.lotUsd];
  if (!spec) throw new Error(`unknown_lot:${input.lotUsd}`);

  return db.transaction(async (tx) => {
    // 1. Optionally debit cost
    if (input.payFromTopup) {
      await debitBalance(tx, input.userId, 'topup', input.lotUsd * 100, 'lot_buy');
    }

    // 2. Insert the lot row
    const lotRow = await tx.insert(monarLots).values({
      userId: input.userId,
      lotUsd: input.lotUsd,
      businessPlaces: spec.businessPlaces,
      technicalLots: spec.technicalLots,
    }).returning({ id: monarLots.id });
    const lotId = lotRow[0].id;

    // 3. Determine tail position
    const tailRow = await tx.select({ pos: monarPlaces.position })
      .from(monarPlaces)
      .orderBy(desc(monarPlaces.position))
      .limit(1);
    let pos = (tailRow[0]?.pos ?? 0) + 1;

    // 4. Insert business + technical places at tail
    const businessRows = Array.from({ length: spec.businessPlaces }, () => ({
      lotId,
      ownerUserId: input.userId,
      kind: 'business' as const,
      position: pos++,
    }));
    const technicalRows = Array.from({ length: spec.technicalLots }, () => ({
      lotId,
      ownerUserId: null,
      kind: 'technical' as const,
      position: pos++,
    }));
    await tx.insert(monarPlaces).values([...businessRows, ...technicalRows]);

    // 5. Audit operation
    await tx.insert(monarOperations).values({
      kind: 'buy_lot',
      payload: { userId: input.userId, lotUsd: input.lotUsd, lotId, places: spec.businessPlaces + spec.technicalLots },
      status: 'completed', completedAt: new Date(),
    });

    // 6. Unlock credit lot if this is the user's first real lot ≥ $50
    if (input.lotUsd >= 50) {
      await tx.execute(sql`
        UPDATE monar_credit_lots
        SET unlocked = true, unlocked_at = now()
        WHERE user_id = ${input.userId} AND unlocked = false
      `);
    }

    return {
      lotId,
      placesInserted: spec.businessPlaces + spec.technicalLots,
      ownerBusinessCents: spec.businessPlaces * PLACE_COST_CENTS,
      systemTechnicalCents: spec.technicalLots * PLACE_COST_CENTS,
    };
  });
}

// -------------------------------------------------------------------------
// applyEntry — one $10 hits the head place
// -------------------------------------------------------------------------

export interface ApplyEntryOutput {
  consumedPlaceId: number;
  entryIndex: 1 | 2;
  ownerCredited: number;
  refsCredited: number;
  worldPoolAccrued: number;
  closedPlace: boolean;
  closedLotId: number | null;
}

export async function applyEntry(): Promise<ApplyEntryOutput | null> {
  return db.transaction(async (tx) => {
    // 1. Pick head
    const heads = await tx.select().from(monarPlaces)
      .orderBy(asc(monarPlaces.position))
      .limit(1);
    const head = heads[0];
    if (!head) return null;
    if (head.entriesReceived >= 2) return null;

    const nextEntry = (head.entriesReceived + 1) as 1 | 2;
    let ownerCredited = 0;
    let refsCredited = 0;
    let worldPoolAccrued = 0;
    let closedPlace = false;
    let closedLotId: number | null = null;

    // 2. For technical place — no owner, no referral; whole $10 goes to system pots.
    if (nextEntry === 1) {
      const upline = head.ownerUserId !== null
        ? await getUpline(tx, head.ownerUserId, 5)
        : [];
      const distribution = distributePlaceEntry({
        ownerUserId: head.ownerUserId ?? 0,
        uplineUserIds: upline,
        entryIndex: 1,
      });

      // Owner gets income (only if business place with owner)
      if (head.ownerUserId !== null && head.kind === 'business') {
        await creditBalance(tx, head.ownerUserId, 'income', distribution.ownerCents, 'place_entry_owner', String(head.id));
        await tx.insert(monarIncomeAccruals).values({
          userId: head.ownerUserId, source: 'primary',
          amountCents: distribution.ownerCents, placeId: head.id,
        });
        ownerCredited = distribution.ownerCents;
      }

      // Referrals
      for (const r of distribution.refs) {
        await creditBalance(tx, r.userId, 'referral', r.cents, 'place_entry_referral', String(head.id));
        await tx.insert(monarIncomeAccruals).values({
          userId: r.userId, source: 'referral',
          amountCents: r.cents, placeId: head.id, referralLevel: r.level,
        });
        refsCredited += r.cents;
      }

      // World pool accumulator for current period
      const period = periodOf(new Date());
      await tx.execute(sql`
        INSERT INTO monar_world_pool_periods (period, total_cents)
        VALUES (${period}, ${distribution.worldPoolCents})
        ON CONFLICT (period) DO UPDATE SET total_cents = monar_world_pool_periods.total_cents + ${distribution.worldPoolCents}
      `);
      worldPoolAccrued = distribution.worldPoolCents;

      // (networking/events/infra are accumulators handled by other services.)
    } else {
      // Second entry — handled as reinvest at place level (no money distribution here)
    }

    // 3. Advance head place: entries_received++
    const newEntries = nextEntry;
    if (newEntries < 2) {
      await tx.update(monarPlaces)
        .set({ entriesReceived: newEntries })
        .where(eq(monarPlaces.id, head.id));
    } else {
      // 4. Close place → respawn at tail with cycle+1, entries=0
      closedPlace = true;
      const tailRow = await tx.select({ pos: monarPlaces.position })
        .from(monarPlaces)
        .orderBy(desc(monarPlaces.position))
        .limit(1);
      const newPos = (tailRow[0]?.pos ?? head.position) + 1;
      await tx.update(monarPlaces)
        .set({
          entriesReceived: 0,
          cycle: head.cycle + 1,
          position: newPos,
          joinedAt: new Date(),
        })
        .where(eq(monarPlaces.id, head.id));

      // 5. If this was a business place — check whether the lot reached close threshold
      if (head.kind === 'business' && head.ownerUserId !== null) {
        const lotRows = await tx.select().from(monarLots).where(eq(monarLots.id, head.lotId)).limit(1);
        const lot = lotRows[0];
        if (lot && lot.status === 'active') {
          const spec = LOT_SPECS[lot.lotUsd as LotUsd];
          const placesAtCycles = await tx.select({
            cnt: sql<number>`count(*)::int`,
          }).from(monarPlaces).where(and(
            eq(monarPlaces.lotId, lot.id),
            eq(monarPlaces.kind, 'business'),
            gte(monarPlaces.cycle, spec.cyclesToClose),
          ));
          const cnt = placesAtCycles[0]?.cnt ?? 0;
          if (cnt >= spec.businessPlaces) {
            // Close the lot
            await closeLot(tx, lot.id, lot.userId, lot.lotUsd as LotUsd);
            closedLotId = lot.id;
          }
        }
      }
    }

    return {
      consumedPlaceId: head.id,
      entryIndex: nextEntry,
      ownerCredited,
      refsCredited,
      worldPoolAccrued,
      closedPlace,
      closedLotId,
    };
  });
}

// -------------------------------------------------------------------------
// closeLot — internal: called when a lot reaches close threshold
// -------------------------------------------------------------------------

async function closeLot(tx: Tx, lotId: number, userId: number, lotUsd: LotUsd) {
  const payout = distributeLotClosure({ userId, lotUsd });

  // Mark lot closed + record proceeds
  await tx.update(monarLots)
    .set({ status: 'closed', closedAt: new Date(), proceedsCents: payout.totalProceedsCents })
    .where(eq(monarLots.id, lotId));

  // 50% to income
  await creditBalance(tx, userId, 'income', payout.toIncomeBalanceCents, 'lot_close_income', String(lotId));
  await tx.insert(monarIncomeAccruals).values({
    userId, source: 'primary',
    amountCents: payout.toIncomeBalanceCents,
    meta: { lotId, type: 'lot_close_income' },
  });

  // 50% to auto-reinvest — plan + buy
  const reinvest = planClosureReinvest({ doubledProceedsCents: payout.toReinvestCents * 2 });
  // Note: we double the reinvest share back because planClosureReinvest expects
  // total doubled proceeds, not just the reinvest half. Then it computes 50% of that.
  // Easier: just feed it the actual reinvest cents directly via pickLargestAffordableLot.
  const { pickLargestAffordableLot } = await import('./reinvest.js');
  const chosenLot = pickLargestAffordableLot(payout.toReinvestCents);
  if (chosenLot !== null) {
    const cost = chosenLot * 100;
    // Spawn the lot inline (don't recurse buyLot to avoid topup debit)
    const spec = LOT_SPECS[chosenLot];
    const newLotRow = await tx.insert(monarLots).values({
      userId, lotUsd: chosenLot,
      businessPlaces: spec.businessPlaces,
      technicalLots: spec.technicalLots,
    }).returning({ id: monarLots.id });
    const newLotId = newLotRow[0].id;
    const tailRow = await tx.select({ pos: monarPlaces.position })
      .from(monarPlaces)
      .orderBy(desc(monarPlaces.position))
      .limit(1);
    let pos = (tailRow[0]?.pos ?? 0) + 1;
    const places = [
      ...Array.from({ length: spec.businessPlaces }, () => ({ lotId: newLotId, ownerUserId: userId, kind: 'business' as const, position: pos++ })),
      ...Array.from({ length: spec.technicalLots }, () => ({ lotId: newLotId, ownerUserId: null, kind: 'technical' as const, position: pos++ })),
    ];
    await tx.insert(monarPlaces).values(places);
    // If any cents left over after buying lot, credit to income.
    const leftover = payout.toReinvestCents - cost;
    if (leftover > 0) {
      await creditBalance(tx, userId, 'income', leftover, 'lot_close_reinvest_leftover', String(lotId));
    }
    await tx.insert(monarOperations).values({
      kind: 'auto_reinvest_buy_lot',
      payload: { sourceClosedLotId: lotId, newLotId, lotUsd: chosenLot, leftoverCents: leftover },
      status: 'completed', completedAt: new Date(),
    });
  } else {
    // Can't afford even a $50 lot — full reinvest share goes to income.
    await creditBalance(tx, userId, 'income', payout.toReinvestCents, 'lot_close_reinvest_unspent', String(lotId));
  }
}

// -------------------------------------------------------------------------
// Withdraw
// -------------------------------------------------------------------------

export interface WithdrawInput {
  userId: number;
  amountCents: number;
}
export interface WithdrawOutput {
  ok: boolean;
  reason?: string;
  debited?: number;
}

export async function withdraw(input: WithdrawInput): Promise<WithdrawOutput> {
  return db.transaction(async (tx) => {
    // 1. Find user's last closed lot proceeds
    const lastClosed = await tx.select({ proceedsCents: monarLots.proceedsCents })
      .from(monarLots)
      .where(and(eq(monarLots.userId, input.userId), eq(monarLots.status, 'closed')))
      .orderBy(desc(monarLots.closedAt))
      .limit(1);
    const lastClosedProceeds = lastClosed[0]?.proceedsCents ?? null;

    if (lastClosedProceeds === null) {
      // No closed lot yet — withdrawal allowed (credit lot scenario etc.)
      try {
        await debitBalance(tx, input.userId, 'income', input.amountCents, 'withdraw');
        return { ok: true, debited: input.amountCents };
      } catch (e: any) {
        return { ok: false, reason: e.message };
      }
    }

    // 2. Sum lot purchases since the last close
    const lastCloseRow = await tx.select({ closedAt: monarLots.closedAt })
      .from(monarLots)
      .where(and(eq(monarLots.userId, input.userId), eq(monarLots.status, 'closed')))
      .orderBy(desc(monarLots.closedAt))
      .limit(1);
    const closedAt = lastCloseRow[0]?.closedAt;
    const since = closedAt ?? new Date(0);

    const sumRows = await tx.select({
      total: sql<number>`coalesce(sum(${monarLots.lotUsd} * 100), 0)::bigint`,
    }).from(monarLots).where(and(
      eq(monarLots.userId, input.userId),
      gte(monarLots.activatedAt, since),
    ));
    const reinvestedSinceClose = Number(sumRows[0]?.total ?? 0);

    const { checkWithdrawEligibility } = await import('./withdraw.js');
    const elig = checkWithdrawEligibility({
      lastClosedLotProceedsCents: lastClosedProceeds,
      newLotsActivatedSinceCents: reinvestedSinceClose,
    });
    if (!elig.eligible) {
      return { ok: false, reason: `need_more_reinvest:shortfall=${elig.shortfallCents}` };
    }

    try {
      await debitBalance(tx, input.userId, 'income', input.amountCents, 'withdraw');
      return { ok: true, debited: input.amountCents };
    } catch (e: any) {
      return { ok: false, reason: e.message };
    }
  });
}

// -------------------------------------------------------------------------
// Settle monthly world pool
// -------------------------------------------------------------------------

export interface SettlePoolInput {
  period: string;
}
export interface SettlePoolOutput {
  period: string;
  totalCents: number;
  payouts: number;
  autoActivatedLots: number;
}

export async function settleWorldPool(input: SettlePoolInput): Promise<SettlePoolOutput> {
  return db.transaction(async (tx) => {
    const periodRow = await tx.select().from(monarWorldPoolPeriods)
      .where(eq(monarWorldPoolPeriods.period, input.period))
      .limit(1);
    const p = periodRow[0];
    if (!p) {
      return { period: input.period, totalCents: 0, payouts: 0, autoActivatedLots: 0 };
    }
    if (p.settledAt) {
      throw new Error(`already_settled:${input.period}`);
    }

    // Active participants with eligible lots (>= $300)
    const partRows = await tx.execute(sql`
      SELECT DISTINCT ON (user_id) user_id, lot_usd
      FROM monar_lots
      WHERE status = 'active' AND lot_usd >= ${WORLD_POOL_MIN_LOT_USD}
      ORDER BY user_id, lot_usd DESC
    `);
    const participants = (partRows as unknown as Array<{ user_id: number; lot_usd: number }>).map(r => ({
      userId: Number(r.user_id),
      lotUsd: Number(r.lot_usd) as LotUsd,
    }));

    const buckets = distributeMonthlyPool({ period: input.period, totalCents: p.totalCents }, participants);

    // Aggregate per-user across all buckets
    const perUser = new Map<number, number>();
    for (const b of buckets) {
      for (const [uid, cents] of Object.entries(b.perUserCents)) {
        const k = Number(uid);
        perUser.set(k, (perUser.get(k) ?? 0) + cents);
        // Audit per-bucket row
        if (cents > 0) {
          await tx.insert(monarWorldPoolPayouts).values({
            periodId: p.id, userId: k, bucketIndex: b.bucketIndex, amountCents: cents,
          });
        }
      }
    }

    let autoActivated = 0;
    for (const [userId, amountCents] of perUser) {
      const decision = decideAutoActivate({ userId, amountCents });
      if (decision.newLotUsd !== null) {
        // Spawn lot inline (no topup debit — funded by pool)
        const spec = LOT_SPECS[decision.newLotUsd];
        const newLotRow = await tx.insert(monarLots).values({
          userId, lotUsd: decision.newLotUsd,
          businessPlaces: spec.businessPlaces, technicalLots: spec.technicalLots,
        }).returning({ id: monarLots.id });
        const tail = await tx.select({ pos: monarPlaces.position })
          .from(monarPlaces).orderBy(desc(monarPlaces.position)).limit(1);
        let pos = (tail[0]?.pos ?? 0) + 1;
        const places = [
          ...Array.from({ length: spec.businessPlaces }, () => ({ lotId: newLotRow[0].id, ownerUserId: userId, kind: 'business' as const, position: pos++ })),
          ...Array.from({ length: spec.technicalLots }, () => ({ lotId: newLotRow[0].id, ownerUserId: null, kind: 'technical' as const, position: pos++ })),
        ];
        await tx.insert(monarPlaces).values(places);
        autoActivated++;
      }
      if (decision.remainderToIncomeCents > 0) {
        await creditBalance(tx, userId, 'income', decision.remainderToIncomeCents, 'world_pool_payout', `period=${input.period}`);
        await tx.insert(monarIncomeAccruals).values({
          userId, source: 'world_pool', amountCents: decision.remainderToIncomeCents,
          meta: { period: input.period },
        });
      }
    }

    await tx.update(monarWorldPoolPeriods)
      .set({ settledAt: new Date() })
      .where(eq(monarWorldPoolPeriods.id, p.id));

    return {
      period: input.period,
      totalCents: p.totalCents,
      payouts: perUser.size,
      autoActivatedLots: autoActivated,
    };
  });
}

// -------------------------------------------------------------------------
// Abonentka: charge weekly fees for all active lots
// -------------------------------------------------------------------------

export interface ChargeAbonentkaOutput {
  charged: number;
  failed: number;
  totalCents: number;
}

export async function chargeAbonentkaDue(now: Date = new Date()): Promise<ChargeAbonentkaOutput> {
  const activeLots = await db.select().from(monarLots)
    .where(eq(monarLots.status, 'active'));

  const due = dueCharges(
    activeLots.map(l => ({
      id: l.id, userId: l.userId, lotUsd: l.lotUsd as LotUsd,
      activatedAt: new Date(l.activatedAt).getTime(),
      lastChargeAt: null,
      closed: l.status !== 'active',
    })),
    now.getTime(),
  );

  let charged = 0, failed = 0, total = 0;
  for (const d of due) {
    try {
      await db.transaction(async (tx) => {
        await debitBalance(tx, d.userId, 'topup', d.amountCents, 'abonentka', `lot=${d.lotId}`);
        await tx.insert(monarAbonentkaCharges).values({
          lotId: d.lotId, userId: d.userId,
          amountCents: d.amountCents,
          status: 'paid', dueAt: new Date(d.dueAt), paidAt: now,
        });
      });
      charged++;
      total += d.amountCents;
    } catch (e) {
      failed++;
      await db.insert(monarAbonentkaCharges).values({
        lotId: d.lotId, userId: d.userId,
        amountCents: d.amountCents,
        status: 'failed', dueAt: new Date(d.dueAt),
      });
      // Freeze on payment failure
      await db.update(monarLots)
        .set({ status: 'frozen' })
        .where(eq(monarLots.id, d.lotId));
    }
  }
  return { charged, failed, totalCents: total };
}

// -------------------------------------------------------------------------
// Credit lot $10 — grant on first encounter, unlock on first real lot.
// -------------------------------------------------------------------------

export async function grantCreditLotIfAbsent(userId: number): Promise<boolean> {
  const existing = await db.select().from(monarCreditLots).where(eq(monarCreditLots.userId, userId)).limit(1);
  if (existing[0]) return false;
  await db.insert(monarCreditLots).values({
    userId, granted: true, amountCents: CREDIT_LOT_USD_CENTS,
  });
  await db.transaction(async (tx) => {
    await creditBalance(tx, userId, 'income', CREDIT_LOT_USD_CENTS, 'credit_lot_grant');
  });
  return true;
}

// -------------------------------------------------------------------------
// Invariant: balance_ops sum equals current balances for every user.
// Run as health check, NOT during write hot path.
// -------------------------------------------------------------------------

export async function checkBalanceInvariants(): Promise<{ ok: boolean; mismatches: Array<{ userId: number; kind: string; balance: number; ledgerSum: number }> }> {
  const rows = await db.execute(sql`
    SELECT b.user_id, b.topup_cents, b.income_cents, b.referral_cents,
      COALESCE((SELECT SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END) FROM monar_balance_ops WHERE user_id = b.user_id AND kind='topup'), 0) AS topup_ledger,
      COALESCE((SELECT SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END) FROM monar_balance_ops WHERE user_id = b.user_id AND kind='income'), 0) AS income_ledger,
      COALESCE((SELECT SUM(CASE WHEN direction='credit' THEN amount_cents ELSE -amount_cents END) FROM monar_balance_ops WHERE user_id = b.user_id AND kind='referral'), 0) AS referral_ledger
    FROM monar_balances b
  `);
  const mismatches: Array<{ userId: number; kind: string; balance: number; ledgerSum: number }> = [];
  for (const r of rows as unknown as Array<{ user_id: number; topup_cents: number; income_cents: number; referral_cents: number; topup_ledger: number; income_ledger: number; referral_ledger: number }>) {
    if (Number(r.topup_cents) !== Number(r.topup_ledger)) mismatches.push({ userId: Number(r.user_id), kind: 'topup', balance: Number(r.topup_cents), ledgerSum: Number(r.topup_ledger) });
    if (Number(r.income_cents) !== Number(r.income_ledger)) mismatches.push({ userId: Number(r.user_id), kind: 'income', balance: Number(r.income_cents), ledgerSum: Number(r.income_ledger) });
    if (Number(r.referral_cents) !== Number(r.referral_ledger)) mismatches.push({ userId: Number(r.user_id), kind: 'referral', balance: Number(r.referral_cents), ledgerSum: Number(r.referral_ledger) });
  }
  return { ok: mismatches.length === 0, mismatches };
}
