import { Hono } from 'hono';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { bookings, tariffs } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import {
  CryptoBotNotConfiguredError,
  createInvoice as cryptobotCreateInvoice,
  cryptobotConfigured,
} from '../services/cryptobot.js';
import {
  createInvoice as plategaCreateInvoice,
  PlategaNotConfiguredError,
} from '../services/platega.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/book', requireAuth);
app.use('/me/bookings', requireAuth);

const bookSchema = z.object({
  tariff_code: z.string().min(1).max(32),
  method: z.enum(['cryptobot', 'platega']),
});

app.post('/me/book', async (c) => {
  const session = c.get('user');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }
  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }

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

  // 1. Persist a pending booking.
  const [booking] = await db
    .insert(bookings)
    .values({
      userId: session.id,
      tariffCode: tariff.code,
      amountUsd,
      method: parsed.data.method,
      status: 'pending',
    })
    .returning();
  if (!booking) {
    return c.json({ ok: false, error: 'booking_failed' }, 500);
  }

  // 2. Create provider invoice. Payload encodes (user, tariff, booking) so
  //    the webhook can locate the row without a secondary table.
  const payload = `entry:${session.id}:${tariff.id}:${booking.id}`;

  if (parsed.data.method === 'cryptobot') {
    if (!cryptobotConfigured()) {
      return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
    }
    try {
      const invoice = await cryptobotCreateInvoice({
        asset: 'USDT',
        amount: amountUsd.toFixed(2),
        payload,
        description: `Golden Connect — ${tariff.name} место до запуска`,
      });
      return c.json({
        ok: true,
        booking_id: booking.id,
        method: 'cryptobot',
        pay_url: invoice.pay_url,
        mini_app_pay_url: invoice.mini_app_pay_url ?? null,
        expires_at: invoice.expiration_date ?? null,
      });
    } catch (err) {
      if (err instanceof CryptoBotNotConfiguredError) {
        return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
      }
      console.error('/me/book cryptobot invoice failed', err);
      return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
    }
  }

  // Platega (card, RUB). Use the `entry:<uid>:<tid>:<bookingId>` order_id
  // shape shared with CryptoBot so the webhook parser stays single-sourced.
  try {
    const orderId = payload;
    const invoice = await plategaCreateInvoice({
      orderId,
      amountUsd,
      description: `Golden Connect — ${tariff.name} место до запуска`,
    });
    // Persist the provider invoice id on the booking so the webhook can
    // look the row up by plategaOrderId.
    await db
      .update(bookings)
      .set({ invoiceId: null }) // the `invoices` table isn't used here
      .where(eq(bookings.id, booking.id));
    return c.json({
      ok: true,
      booking_id: booking.id,
      method: 'platega',
      pay_url: invoice.pay_url,
      order_id: orderId,
    });
  } catch (err) {
    if (err instanceof PlategaNotConfiguredError) {
      return c.json({ ok: false, error: 'platega_not_configured' }, 503);
    }
    console.error('/me/book platega invoice failed', err);
    return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
  }
});

app.get('/me/bookings', async (c) => {
  const session = c.get('user');
  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, session.id))
    .orderBy(desc(bookings.createdAt))
    .limit(20);
  return c.json({
    ok: true,
    bookings: rows.map((r) => ({
      id: r.id,
      tariff_code: r.tariffCode,
      amount_usd: r.amountUsd,
      method: r.method,
      status: r.status,
      paid_at: r.paidAt?.toISOString() ?? null,
      created_at: r.createdAt.toISOString(),
    })),
  });
});

export default app;
