import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { tariffs } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import {
  PlategaNotConfiguredError,
  buildEntryOrderId,
  createInvoice,
} from '../services/platega.js';

/**
 * POST /me/pay/platega { tariff_id }
 *
 * Creates a Platega RUB card invoice for the caller's chosen tariff. Returns
 * 503 `platega_not_configured` while creds aren't set so the UI can show a
 * graceful "card payment coming soon" state.
 */
const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/pay/platega', requireAuth);

const bodySchema = z.object({
  tariff_id: z.number().int().positive(),
});

app.post('/me/pay/platega', async (c) => {
  const session = c.get('user');
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ ok: false, error: 'invalid_body' }, 400);
  }

  const [tariff] = await db
    .select({ id: tariffs.id, entryMicro: tariffs.entryMicro, name: tariffs.name })
    .from(tariffs)
    .where(eq(tariffs.id, parsed.data.tariff_id))
    .limit(1);
  if (!tariff) {
    return c.json({ ok: false, error: 'tariff_not_found' }, 404);
  }

  const amountUsd = Number(BigInt(tariff.entryMicro as unknown as string)) / 1_000_000;
  const orderId = buildEntryOrderId(session.id, Number(tariff.id));

  try {
    const inv = await createInvoice({
      amountUsd,
      orderId,
      description: `Trendex tariff: ${tariff.name}`,
    });
    return c.json({
      ok: true,
      pay_url: inv.pay_url,
      invoice_id: inv.invoice_id,
      amount_rub: inv.amount_rub,
      expires_at: inv.expires_at,
    });
  } catch (err) {
    if (err instanceof PlategaNotConfiguredError) {
      return c.json({ ok: false, error: 'platega_not_configured' }, 503);
    }
    console.error('platega createInvoice failed', err);
    return c.json({ ok: false, error: 'platega_failed' }, 502);
  }
});

export default app;
