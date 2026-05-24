import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  parseEntryOrderId,
  verifyWebhookHeaders,
  type PlategaWebhookBody,
} from '../services/platega.js';
import { env } from '../services/env.js';
import { processEntry, processLinearOnly } from '../services/entry-processor.js';
import { isMarketingActive } from '../services/system-settings.js';
import { parseTopupPayload, creditWorkingBalanceTopup } from '../services/topup-credit.js';
import { notifyAdminsOfPayment } from '../services/admin-notifier.js';
import { db } from '../db/client.js';
import { bookings, tariffs } from '../db/schema.js';
import { checkQuestProgress } from '../services/gamification.js';

/**
 * POST /webhooks/platega
 *
 * Always returns 200 — Platega (like most card-gateways) retries on non-2xx,
 * so we never signal back-pressure via status code. Failures are logged and
 * surfaced in the admin dashboard (pending invoices past expires_at).
 *
 * On `status==='success'` we parse the `order_id` (format
 * `entry:userId:tariffId:ts`) and run the tariff entry through the standard
 * processor. `invoice_id` from Platega is passed as `paymentRefId` so the
 * ledger memo carries a stable reference for reconciliation.
 */
const app = new Hono();

app.post('/webhooks/platega', async (c) => {
  const raw = await c.req.text().catch(() => '');

  // Header-based auth — Platega sends X-MerchantId + X-Secret matching merchant creds.
  const hdrs: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.req.header())) {
    hdrs[k.toLowerCase()] = String(v);
  }
  if (!verifyWebhookHeaders(hdrs)) {
    console.warn('platega webhook headers failed');
    return c.json({ ok: true });
  }

  let body: PlategaWebhookBody;
  try {
    body = raw ? (JSON.parse(raw) as PlategaWebhookBody) : {};
  } catch {
    return c.json({ ok: true });
  }

  // Platega uses CapitalCase fields (Id, Status, Amount, Payload). Accept both
  // for forward-compat with any legacy callers.
  const status = String(body.Status ?? body.status ?? '').toLowerCase();
  const orderId = String(body.Payload ?? body.order_id ?? '').trim();
  const txId = String(body.Id ?? body.id ?? '').trim();

  // Normalise to the snake_case shape the rest of this handler expects.
  body.status = status;
  body.order_id = orderId;
  if (txId) body['invoice_id'] = txId;

  if (!['success', 'paid', 'completed', 'confirmed'].includes(status) || !orderId) {
    return c.json({ ok: true });
  }

  // Topup branch — order_id == payload "topup:userId:microAmount".
  const topup = parseTopupPayload(body.order_id);
  if (topup) {
    const invoiceId =
      typeof body['invoice_id'] === 'string' || typeof body['invoice_id'] === 'number'
        ? String(body['invoice_id'])
        : body.order_id;
    const paymentRefId = `platega:${invoiceId}`;
    try {
      const r = await creditWorkingBalanceTopup(topup.userId, topup.microAmount, paymentRefId);
      console.log('[platega] topup credited', { userId: topup.userId, micro: topup.microAmount.toString(), already: r.alreadyCredited });
    } catch (e: any) {
      console.error('[platega] topup credit failed', e?.message);
    }
    return c.json({ ok: true });
  }

  const parsed = parseEntryOrderId(body.order_id);
  if (!parsed) {
    console.warn('platega webhook unknown order_id', body.order_id);
    return c.json({ ok: true });
  }

  try {
    const invoiceId =
      typeof body['invoice_id'] === 'string' ||
      typeof body['invoice_id'] === 'number'
        ? String(body['invoice_id'])
        : body.order_id;
    const paymentRefId = `platega:${invoiceId}`;
    // Pre-launch mode: skip matrix+refs engine, just mark booking paid.
    // Admin will activate marketing later via POST /admin/marketing/activate.
    // Linear (10-level) referrals ALWAYS pay immediately so users see income
    // right after the buyer below them pays. Matrix + task pool wait for
    // admin to flip marketing_active (typically 1 week after pre-launch).
    const _marketingActive = await isMarketingActive();
    let result: Awaited<ReturnType<typeof processEntry>>;
    if (_marketingActive) {
      result = await processEntry({ userId: parsed.userId, tariffId: parsed.tariffId, paymentRefId });
    } else {
      // Linear-only: pays referral upline + matching bonus + admin fee.
      // Matrix portion deferred — admin activation runs processMatrixAndPool later.
      const linearRes = await processLinearOnly({ userId: parsed.userId, tariffId: parsed.tariffId, paymentRefId });
      console.log('[pre-launch] linear paid for', parsed.userId, 'levels=', linearRes.referralsPaidLevels, 'tariff', parsed.tariffId);
      result = {
        ok: true,
        entryMicro: linearRes.entryMicro,
        matrixPosition: null,
        referralsPaidLevels: linearRes.referralsPaidLevels,
        adminFeeMicro: linearRes.adminFeeMicro,
        totalDistributedMicro: 0n,
        runningSumMicro: 0n,
      } as unknown as Awaited<ReturnType<typeof processEntry>>;
    }

    if (result.ok) {
      if (parsed.bookingId !== null) {
        try {
          await db
            .update(bookings)
            .set({ status: 'paid', paidAt: new Date(), linearProcessed: !_marketingActive })
            .where(eq(bookings.id, parsed.bookingId));
        } catch (bookErr) {
          console.warn('platega booking mark-paid failed', bookErr);
        }
      }

      // Phase 1C — gamification hook. TODO (Phase 1A): a parallel worker
      // increments referral-stage quests from referral-stage-refresh job.
      try {
        await checkQuestProgress(parsed.userId, 'booking_paid');
      } catch (questErr) {
        console.warn('platega quest progress hook failed', questErr);
      }

      // See webhooks-cryptobot.ts for the same fire-and-forget shape.
      void (async () => {
        try {
          const [tariffRow] = await db
            .select({ code: tariffs.code })
            .from(tariffs)
            .where(eq(tariffs.id, parsed.tariffId))
            .limit(1);
          const entryUsd = Number(result.entryMicro) / 1_000_000;
          await notifyAdminsOfPayment({
            method: 'platega',
            userId: parsed.userId,
            tariffCode: tariffRow?.code ?? String(parsed.tariffId),
            entryUsd,
            paymentRefId,
            matrixPosition: result.matrixPosition ?? null,
          });
        } catch (notifyErr) {
          console.warn('platega admin notify failed', notifyErr);
        }
      })();
    }
  } catch (err) {
    console.error('platega webhook processing failed', err);
  }

  return c.json({ ok: true });
});

export default app;
