/**
 * Internal balance endpoints — credit / debit / get
 * For cabinet to write user balances atomically with cash_ledger audit.
 *
 * POST /internal/balance/credit { tg_id|user_id|email, wallet: 'gift'|'subscription'|'working', cents, kind, memo, related_user_id? }
 * POST /internal/balance/debit  { tg_id|user_id|email, wallet, cents, kind, memo }
 *      (returns ok=false if insufficient)
 * POST /internal/balance/get    { tg_id|user_id|email } -> { working_cents, gift_cents, subscription_cents, karma }
 */
import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'internal-balance' });

const app = new Hono();

app.use('/internal/balance/*', requireInternalSecret);

/** Resolve user_id from tg_id, user_id, or email */
async function resolveUserId(body: any): Promise<number | null> {
  if (!body || typeof body !== 'object') return null;
  if (body.user_id) {
    const id = Number(body.user_id);
    if (Number.isFinite(id) && id > 0) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE id = ${id} LIMIT 1`)) as any[];
      return r[0]?.id ? Number(r[0].id) : null;
    }
  }
  if (body.tg_id) {
    const tgId = Number(body.tg_id);
    if (Number.isFinite(tgId) && tgId > 0) {
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${tgId} LIMIT 1`)) as any[];
      if (r[0]?.id) return Number(r[0].id);
      // Lazy-create stub if absent (matches finance pattern)
      try {
        const ins = (await db.execute(sql`
          INSERT INTO users (tg_id, ref_code, joined_at, last_seen_at)
          VALUES (${tgId}, ${'tg' + tgId}, NOW(), NOW())
          ON CONFLICT (tg_id) DO UPDATE SET last_seen_at = NOW()
          RETURNING id
        `)) as any[];
        return ins[0]?.id ? Number(ins[0].id) : null;
      } catch { return null; }
    }
  }
  if (body.email) {
    const email = String(body.email).toLowerCase().trim();
    const m = email.match(/^tg(\d+)@goldenConnect\.bot$/);
    if (m) {
      const tgId = Number(m[1]);
      const r = (await db.execute(sql`SELECT id FROM users WHERE tg_id = ${tgId} LIMIT 1`)) as any[];
      return r[0]?.id ? Number(r[0].id) : null;
    }
    const r = (await db.execute(sql`SELECT user_id FROM credentials WHERE email = ${email} LIMIT 1`)) as any[];
    return r[0]?.user_id ? Number(r[0].user_id) : null;
  }
  return null;
}

const VALID_WALLETS = new Set(['gift', 'subscription', 'working']);

app.post('/internal/balance/credit', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const userId = await resolveUserId(body);
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  const wallet = String(body.wallet || '').toLowerCase();
  if (!VALID_WALLETS.has(wallet)) return c.json({ ok: false, error: 'invalid_wallet' }, 400);

  const cents = Math.round(Number(body.cents || 0));
  if (!Number.isFinite(cents) || cents <= 0) return c.json({ ok: false, error: 'invalid_amount' }, 400);
  const micro = BigInt(cents) * 10000n;

  const kind = String(body.kind || 'manual_credit').slice(0, 64);
  const memo = body.memo ? String(body.memo).slice(0, 500) : null;
  const relatedUserId = body.related_user_id ? Number(body.related_user_id) : null;

  try {
    await db.transaction(async (tx) => {
      // Update users wallet column
      if (wallet === 'gift') {
        await tx.execute(sql`UPDATE users SET gift_balance_micro = gift_balance_micro + ${micro.toString()}::bigint WHERE id = ${userId}`);
      } else if (wallet === 'subscription') {
        await tx.execute(sql`UPDATE users SET subscription_balance_micro = subscription_balance_micro + ${micro.toString()}::bigint WHERE id = ${userId}`);
      }
      // working balance is computed from cash_ledger sum, just append entry
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo, related_user_id)
        VALUES (${userId}, ${kind}, ${micro.toString()}::bigint, ${memo}, ${relatedUserId})
      `);
    });
    log.info({ userId, wallet, cents, kind }, 'balance credited');
    return c.json({ ok: true, userId, wallet, cents });
  } catch (e: any) {
    log.error({ err: e?.message, userId, wallet, cents, kind }, 'credit failed');
    return c.json({ ok: false, error: e?.message }, 500);
  }
});

app.post('/internal/balance/debit', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const userId = await resolveUserId(body);
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  const wallet = String(body.wallet || '').toLowerCase();
  if (!VALID_WALLETS.has(wallet)) return c.json({ ok: false, error: 'invalid_wallet' }, 400);

  const cents = Math.round(Number(body.cents || 0));
  if (!Number.isFinite(cents) || cents <= 0) return c.json({ ok: false, error: 'invalid_amount' }, 400);
  const micro = BigInt(cents) * 10000n;

  const kind = String(body.kind || 'manual_debit').slice(0, 64);
  const memo = body.memo ? String(body.memo).slice(0, 500) : null;
  const relatedUserId = body.related_user_id ? Number(body.related_user_id) : null;

  try {
    let ok = false;
    let errReason: string | null = null;
    await db.transaction(async (tx) => {
      // Check sufficiency + atomic deduct
      if (wallet === 'gift') {
        const r = (await tx.execute(sql`
          UPDATE users SET gift_balance_micro = gift_balance_micro - ${micro.toString()}::bigint
          WHERE id = ${userId} AND gift_balance_micro >= ${micro.toString()}::bigint
          RETURNING id
        `)) as any[];
        if (!r[0]) { errReason = 'insufficient_gift'; return; }
      } else if (wallet === 'subscription') {
        const r = (await tx.execute(sql`
          UPDATE users SET subscription_balance_micro = subscription_balance_micro - ${micro.toString()}::bigint
          WHERE id = ${userId} AND subscription_balance_micro >= ${micro.toString()}::bigint
          RETURNING id
        `)) as any[];
        if (!r[0]) { errReason = 'insufficient_subscription'; return; }
      } else if (wallet === 'working') {
        // Working balance = cash_ledger sum. Check current sum >= cents.
        const r = (await tx.execute(sql`SELECT COALESCE(SUM(amount_micro), 0)::bigint AS s FROM cash_ledger WHERE user_id = ${userId}`)) as any[];
        const cur = BigInt(r[0]?.s || 0);
        if (cur < micro) { errReason = 'insufficient_working'; return; }
      }
      // Append negative ledger entry
      await tx.execute(sql`
        INSERT INTO cash_ledger (user_id, kind, amount_micro, memo, related_user_id)
        VALUES (${userId}, ${kind}, ${'-' + micro.toString()}::bigint, ${memo}, ${relatedUserId})
      `);
      ok = true;
    });
    if (!ok) return c.json({ ok: false, error: errReason || 'debit_failed' }, 400);
    log.info({ userId, wallet, cents, kind }, 'balance debited');
    return c.json({ ok: true, userId, wallet, cents });
  } catch (e: any) {
    log.error({ err: e?.message, userId, wallet, cents, kind }, 'debit failed');
    return c.json({ ok: false, error: e?.message }, 500);
  }
});

app.post('/internal/balance/get', async (c) => {
  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ ok: false, error: 'invalid_json' }, 400); }
  const userId = await resolveUserId(body);
  if (!userId) return c.json({ ok: false, error: 'user_not_found' }, 404);

  try {
    const u = (await db.execute(sql`SELECT gift_balance_micro, subscription_balance_micro, karma_points FROM users WHERE id = ${userId}`)) as any[];
    const wb = (await db.execute(sql`SELECT COALESCE(SUM(amount_micro), 0)::bigint AS s FROM cash_ledger WHERE user_id = ${userId}`)) as any[];
    const giftMicro = BigInt(u[0]?.gift_balance_micro || 0);
    const subMicro  = BigInt(u[0]?.subscription_balance_micro || 0);
    const workMicro = BigInt(wb[0]?.s || 0);
    return c.json({
      ok: true,
      userId,
      gift_cents: Number(giftMicro / 10000n),
      subscription_cents: Number(subMicro / 10000n),
      working_cents: Number(workMicro / 10000n),
      karma: Number(u[0]?.karma_points || 0),
    });
  } catch (e: any) {
    return c.json({ ok: false, error: e?.message }, 500);
  }
});

export default app;
