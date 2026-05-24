import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { tariffs } from '../db/schema.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import {
  CryptoBotNotConfiguredError,
  createInvoice,
  cryptobotConfigured,
} from '../services/cryptobot.js';

const app = new Hono<{ Variables: AuthVars }>();

app.use('/me/pay/cryptobot', requireAuth);

interface PayBody {
  tariff_id?: unknown;
}

/**
 * POST /me/pay/cryptobot — kick off a CryptoBot (Crypto Pay) invoice for
 * the given tariff. Amount is entryMicro / 1_000_000 USDT (we peg 1 USDT =
 * 1 USD for internal pricing). Returns the hosted pay URL plus the
 * bot-invoice URL for in-Telegram flows.
 *
 * When `CRYPTOBOT_TOKEN` is blank → 503 so the UI can surface a
 * "coming soon" toast instead of a broken button.
 */
app.post('/me/pay/cryptobot', async (c) => {
  if (!cryptobotConfigured()) {
    return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
  }

  const session = c.get('user');

  let body: PayBody;
  try {
    body = (await c.req.json()) as PayBody;
  } catch {
    return c.json({ ok: false, error: 'invalid_json' }, 400);
  }

  const tariffId = Number(body.tariff_id);
  if (!Number.isFinite(tariffId) || tariffId <= 0) {
    return c.json({ ok: false, error: 'invalid_tariff_id' }, 400);
  }

  const [tariff] = await db
    .select({
      id: tariffs.id,
      name: tariffs.name,
      entryMicro: tariffs.entryMicro,
    })
    .from(tariffs)
    .where(eq(tariffs.id, tariffId))
    .limit(1);

  if (!tariff) {
    return c.json({ ok: false, error: 'tariff_not_found' }, 404);
  }

  const entryMicro = BigInt(tariff.entryMicro as unknown as string);
  if (entryMicro <= 0n) {
    return c.json({ ok: false, error: 'tariff_not_payable' }, 400);
  }

  // entryMicro is USD*1e6; USDT:USD pegged 1:1 for our internal pricing.
  // Format with two decimals — CryptoBot accepts a decimal string.
  const amountUsdt = (Number(entryMicro) / 1_000_000).toFixed(2);

  const payload = `entry:${session.id}:${tariffId}:${Date.now()}`;

  try {
    const invoice = await createInvoice({
      asset: 'USDT',
      amount: amountUsdt,
      payload,
      description: `Golden Connect — ${tariff.name} tariff activation`,
    });
    return c.json({
      ok: true,
      invoice_id: invoice.invoice_id,
      pay_url: invoice.pay_url,
      bot_invoice_url: invoice.bot_invoice_url ?? null,
      mini_app_pay_url: invoice.mini_app_pay_url ?? null,
      expires_at: invoice.expiration_date ?? null,
    });
  } catch (err) {
    if (err instanceof CryptoBotNotConfiguredError) {
      return c.json({ ok: false, error: 'cryptobot_not_configured' }, 503);
    }
    console.error('cryptobot createInvoice failed', err);
    return c.json({ ok: false, error: 'invoice_create_failed' }, 502);
  }
});

export default app;
