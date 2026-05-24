import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { attachInviter } from '../services/users.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { db } from '../db/client.js';
import { bookings, tariffs, users, credentials } from '../db/schema.js';
import {
  CryptoBotNotConfiguredError,
  createInvoice as cryptobotCreateInvoice,
  cryptobotConfigured,
} from '../services/cryptobot.js';
import {
  createInvoice as plategaCreateInvoice,
  PlategaNotConfiguredError,
} from '../services/platega.js';
import { generateRefCode } from '../services/users.js';
import { env } from '../services/env.js';

/**
 * Cross-service payment bridge for the new Golden Connect Cabinet (Express + SQLite).
 *
 * The cabinet service runs under a different stack and has its own user pool;
 * however, payment infra (CryptoBot + Platega + BSC + bookings ledger) lives
 * here in the goldenConnect-api Hono service and must stay the single source of
 * truth for money movements.
 *
 * This endpoint lets the cabinet create an invoice on behalf of a user by
 * email without that user carrying an api-side JWT. It:
 *   1. Finds (or lazily creates) a users + credentials row by email.
 *   2. Creates a bookings row + provider invoice using the same logic as
 *      /me/book.
 *   3. Returns the pay_url for the cabinet to surface to the browser.
 *
 * Auth: x-goldenConnect-secret header (same INTERNAL_API_SECRET as all /internal/*).
 */

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

const bodySchema = z.object({
  email: z.string().email().max(200),
  tariff_code: z.string().min(1).max(32),
  method: z.enum(['cryptobot', 'platega']),
  // Optional. When provided, stamped on the user row so downstream
  // TG reminders / referral tracking attribute correctly.
  display_name: z.string().max(160).optional().nullable(),
  ref_code: z.string().max(32).optional().nullable(),
  inviter_ref_code: z.string().max(32).optional().nullable(),
});

async function findOrCreateUserByEmail(
  email: string,
  displayName?: string | null,
  inviterRefCode?: string | null,
): Promise<{
  userId: number;
  refCode: string;
}> {
  const normalised = email.toLowerCase().trim();

  const [existingCred] = await db
    .select({ userId: credentials.userId })
    .from(credentials)
    .where(eq(credentials.email, normalised))
    .limit(1);
  if (existingCred) {
    const [u] = await db
      .select({ id: users.id, refCode: users.refCode })
      .from(users)
      .where(eq(users.id, existingCred.userId))
      .limit(1);
    if (u) return { userId: u.id, refCode: u.refCode };
  }

  // Resolve inviter (sponsor) by refCode if provided. We stamp this on
  // the new user row so the matrix engine — when admin activates marketing
  // — has the upline chain ready for placement / spillover.
  let invitedByUserId: number | null = null;
  if (inviterRefCode) {
    try {
      const normalised = inviterRefCode.trim().toLowerCase();
      if (normalised) {
        const [inviter] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.refCode, normalised))
          .limit(1);
        if (inviter) invitedByUserId = inviter.id;
      }
    } catch (err) {
      console.warn('[internal/pay] inviter lookup failed', String((err as Error).message));
    }
  }

  // Create user + credentials. passwordHash is a sentinel — user can't login
  // via /auth/login with it; they either use magic link or register properly later.
  let userId = 0;
  let userRefCode = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const refCode = generateRefCode(8);
    try {
      const [row] = await db
        .insert(users)
        .values({
          refCode,
          firstName: displayName ?? null,
          ...(invitedByUserId ? { invitedByUserId, invitedByRefCode: inviterRefCode!.trim().toLowerCase() } : {}),
        })
        .returning({ id: users.id, refCode: users.refCode });
      if (!row) continue;
      userId = row.id;
      userRefCode = row.refCode;
      // Populate invite_edges so referrals10lvl can walk the chain on payouts.
      if (inviterRefCode) {
        try { await attachInviter(userId, inviterRefCode); } catch (e) { console.warn("[internal/pay] attachInviter failed", e); }
      }
      break;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes('ref_code')) continue;
      throw e;
    }
  }
  if (!userId) throw new Error('user_create_failed');

  try {
    await db.insert(credentials).values({
      userId,
      email: normalised,
      passwordHash: 'cabinet-bridge:' + Date.now(),
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes('email') || msg.includes('unique')) {
      // race — another call just created the row, refetch
      const [race] = await db
        .select({ userId: credentials.userId })
        .from(credentials)
        .where(eq(credentials.email, normalised))
        .limit(1);
      if (race) {
        const [u] = await db
          .select({ id: users.id, refCode: users.refCode })
          .from(users)
          .where(eq(users.id, race.userId))
          .limit(1);
        if (u) return { userId: u.id, refCode: u.refCode };
      }
    }
    throw e;
  }

  return { userId, refCode: userRefCode };
}

app.post('/internal/pay/create-invoice', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  // Tariff lookup
  const [tariff] = await db
    .select({
      id: tariffs.id,
      code: tariffs.code,
      name: tariffs.name,
      entryMicro: tariffs.entryMicro,
    })
    .from(tariffs)
    .where(eq(tariffs.code, parsed.data.tariff_code))
    .limit(1);
  if (!tariff) {
    return c.json({ ok: false, error: 'tariff_not_found' }, 404);
  }

  const entryMicro = BigInt(tariff.entryMicro as unknown as string);
  if (entryMicro <= 0n) {
    return c.json({ ok: false, error: 'tariff_not_payable' }, 400);
  }
  const amountUsd = Number(entryMicro) / 1_000_000;

  // User bridge
  let userId: number;
  try {
    const resolved = await findOrCreateUserByEmail(
      parsed.data.email,
      parsed.data.display_name ?? null,
      parsed.data.inviter_ref_code ?? null,
    );
    userId = resolved.userId;
  } catch (e) {
    console.error('[internal/pay] user bridge failed', e);
    return c.json({ ok: false, error: 'user_bridge_failed' }, 502);
  }

  // Persist pending booking
  const [booking] = await db
    .insert(bookings)
    .values({
      userId,
      tariffCode: tariff.code,
      amountUsd,
      method: parsed.data.method,
      status: 'pending',
    })
    .returning();
  if (!booking) {
    return c.json({ ok: false, error: 'booking_failed' }, 500);
  }

  const payload = `entry:${userId}:${tariff.id}:${booking.id}`;

  if (parsed.data.method === 'cryptobot') {
    if (!cryptobotConfigured()) {
      return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
    }
    try {
      const invoice = await cryptobotCreateInvoice({
        asset: 'USDT',
        amount: amountUsd.toFixed(2),
        payload,
        description: `Golden Connect — ${tariff.name}`,
      });
      return c.json({
        ok: true,
        booking_id: booking.id,
        user_id: userId,
        method: 'cryptobot',
        pay_url: invoice.pay_url,
        mini_app_pay_url: invoice.mini_app_pay_url ?? null,
        expires_at: invoice.expiration_date ?? null,
      });
    } catch (err) {
      if (err instanceof CryptoBotNotConfiguredError) {
        return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
      }
      console.error('[internal/pay] cryptobot invoice failed', err);
      return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
    }
  }

  try {
    const invoice = await plategaCreateInvoice({
      orderId: payload,
      amountUsd,
      description: `Golden Connect — ${tariff.name}`,
    });
    return c.json({
      ok: true,
      booking_id: booking.id,
      user_id: userId,
      method: 'platega',
      pay_url: invoice.pay_url,
      order_id: payload,
    });
  } catch (err) {
    if (err instanceof PlategaNotConfiguredError) {
      return c.json({ ok: false, error: 'platega_not_configured' }, 503);
    }
    console.error('[internal/pay] platega invoice failed', err);
    return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
  }
});

/**
 * GET /internal/pay/bookings?email=xxx — lightweight status readback for
 * the cabinet's "my purchases" card.
 */
app.get('/internal/pay/bookings', async (c) => {
  const email = c.req.query('email')?.toLowerCase().trim();
  if (!email) return c.json({ ok: false, error: 'email_required' }, 400);

  const [cred] = await db
    .select({ userId: credentials.userId })
    .from(credentials)
    .where(eq(credentials.email, email))
    .limit(1);
  if (!cred) return c.json({ ok: true, bookings: [] });

  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, cred.userId))
    .orderBy(bookings.createdAt);

  return c.json({
    ok: true,
    bookings: rows.map((r) => ({
      id: r.id,
      tariff_code: r.tariffCode,
      amount_usd: r.amountUsd,
      method: r.method,
      status: r.status,
      created_at: r.createdAt,
      paid_at: r.paidAt ?? null,
    })),
  });
});



// ════════════════════════════════════════════════════════════════════
// TOPUP — credit working balance (no tariff)
// ════════════════════════════════════════════════════════════════════

const topupBodySchema = z.object({
  email: z.string().email().max(200),
  amount_usd: z.number().min(5).max(5000),
  method: z.enum(['cryptobot', 'platega', 'platega_sbp', 'platega_card_rub', 'platega_acquiring', 'platega_intl', 'platega_crypto']),
  display_name: z.string().max(160).optional().nullable(),
  ref_code: z.string().max(32).optional().nullable(),
  inviter_ref_code: z.string().max(32).optional().nullable(),
});

app.post('/internal/pay/create-topup-invoice', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = topupBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body', details: parsed.error.flatten() }, 400);
  }

  // Resolve / lazily create user via existing email bridge (same as
  // /create-invoice for tariff buys). We reuse credentials lookup so the
  // user object is consistent across the buyer journey.
  let userId: number;
  try {
    const resolved = await findOrCreateUserByEmail(
      parsed.data.email,
      parsed.data.display_name ?? null,
      parsed.data.inviter_ref_code ?? null,
    );
    userId = resolved.userId;
  } catch (e) {
    console.error('[internal/pay/topup] user bridge failed', e);
    return c.json({ ok: false, error: 'user_bridge_failed' }, 502);
  }

  const amountUsd = parsed.data.amount_usd;
  const microAmount = BigInt(Math.round(amountUsd * 1_000_000));
  // Payload that the webhook handler will parse and credit working balance.
  const payload = `topup:${userId}:${microAmount.toString()}`;

  if (parsed.data.method === 'cryptobot') {
    if (!cryptobotConfigured()) {
      return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
    }
    try {
      const invoice = await cryptobotCreateInvoice({
        asset: 'USDT',
        amount: amountUsd.toFixed(2),
        payload,
        description: `Golden Connect topup $${amountUsd.toFixed(2)}`,
      });
      return c.json({
        ok: true,
        user_id: userId,
        method: 'cryptobot',
        amount_usd: amountUsd,
        pay_url: invoice.pay_url,
        mini_app_pay_url: invoice.mini_app_pay_url ?? null,
        expires_at: invoice.expiration_date ?? null,
      });
    } catch (err) {
      if (err instanceof CryptoBotNotConfiguredError) {
        return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
      }
      console.error('[internal/pay/topup] cryptobot invoice failed', err);
      return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
    }
  }

  // Platega path — uses orderId == payload so the webhook can look up the
  // same parsing logic.
  const PM = { SBP: 2, CARDS_RUB: 10, ACQUIRING: 11, INTL: 12, CRYPTO: 13 } as const;
  const methodMap: Record<string, number> = {
    platega: PM.SBP,
    platega_sbp: PM.SBP,
    platega_card_rub: PM.CARDS_RUB,
    platega_acquiring: PM.ACQUIRING,
    platega_intl: PM.INTL,
    platega_crypto: PM.CRYPTO,
  };
  const paymentMethod = methodMap[parsed.data.method] ?? PM.SBP;
  try {
    const invoice = await plategaCreateInvoice({
      amountUsd,
      orderId: payload,
      description: `Golden Connect topup $${amountUsd.toFixed(2)}`,
      paymentMethod,
      returnUrl: `${env.appPublicUrl}/pay/thanks`,
      failedUrl: `${env.appPublicUrl}/pay/failed`,
    });
    return c.json({
      ok: true,
      user_id: userId,
      method: 'platega',
      amount_usd: amountUsd,
      pay_url: invoice.pay_url,
      invoice_id: invoice.invoice_id ?? null,
      amount_rub: (invoice as { amount_rub?: number }).amount_rub ?? null,
    });
  } catch (err) {
    if (err instanceof PlategaNotConfiguredError) {
      return c.json({ ok: false, error: 'platega_not_configured' }, 503);
    }
    console.error('[internal/pay/topup] platega invoice failed', err);
    return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
  }
});

export default app;
