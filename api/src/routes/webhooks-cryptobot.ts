import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { verifyWebhookSignature } from '../services/cryptobot.js';
import { processEntry, processLinearOnly } from '../services/entry-processor.js';
import { isMarketingActive } from '../services/system-settings.js';
import { parseTopupPayload, creditWorkingBalanceTopup } from '../services/topup-credit.js';
import { notifyAdminsOfPayment } from '../services/admin-notifier.js';
import { db } from '../db/client.js';
import { bookings, tariffs } from '../db/schema.js';
import { checkQuestProgress } from '../services/gamification.js';

/**
 * CryptoBot (Crypto Pay) webhook.
 *
 * Docs: https://help.crypt.bot/crypto-pay-api#webhooks
 *
 * Design note: we always return 200 — even on bad signature or internal
 * failure. CryptoBot retries aggressively on non-2xx and we'd rather drop
 * a bad probe than spin their retry loop. Bad signatures are logged and
 * the rest is a no-op; duplicates are deflected at `processEntry` via
 * `cash_ledger.memo = entry_payment:<invoice_id>` uniqueness.
 */

const app = new Hono();

interface InvoicePaidPayload {
  invoice_id?: number;
  payload?: string;
  status?: string;
}

interface WebhookBody {
  update_id?: number;
  update_type?: string;
  payload?: InvoicePaidPayload;
}

/**
 * `payload` is set at invoice creation in `entry:<userId>:<tariffId>:<ts>`
 * form. We return null on any parse failure so processing is skipped (and
 * 200 is still returned) — there is nothing actionable when the payload
 * shape is wrong.
 */
function parseEntryPayload(
  raw: string | undefined,
): { userId: number; tariffId: number; bookingId: number | null } | null {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length < 3 || parts[0] !== 'entry') return null;
  const userId = Number(parts[1]);
  const tariffId = Number(parts[2]);
  // Legacy payloads had `entry:<uid>:<tid>:<ts>`; new /me/book payloads have
  // `entry:<uid>:<tid>:<booking_id>`. Distinguishing by magnitude: a booking
  // id is a small serial, a millis timestamp is > 1e12.
  const fourth = parts[3] !== undefined ? Number(parts[3]) : NaN;
  const bookingId =
    Number.isFinite(fourth) && fourth > 0 && fourth < 1_000_000_000 ? fourth : null;
  if (!Number.isFinite(userId) || !Number.isFinite(tariffId)) return null;
  if (userId <= 0 || tariffId <= 0) return null;
  return { userId, tariffId, bookingId };
}

app.post('/webhooks/cryptobot', async (c) => {
  let raw: string;
  try {
    raw = await c.req.text();
  } catch {
    return c.json({ ok: true });
  }

  const signature = c.req.header('crypto-pay-api-signature') || '';
  const apiToken = process.env.CRYPTOBOT_TOKEN ?? '';

  if (!apiToken) {
    // Not configured — reject quietly.
    return c.json({ ok: true });
  }

  if (!verifyWebhookSignature(raw, signature, apiToken)) {
    console.warn('cryptobot webhook signature failed');
    return c.json({ ok: true });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return c.json({ ok: true });
  }

  if (body.update_type !== 'invoice_paid' || !body.payload) {
    return c.json({ ok: true });
  }

  const invoice = body.payload;
  if (invoice.status && invoice.status !== 'paid') {
    return c.json({ ok: true });
  }

  const invoiceId = invoice.invoice_id;
  if (!invoiceId) {
    return c.json({ ok: true });
  }

  // Topup branch — payload "topup:userId:microAmount" credits working balance.
  const topup = parseTopupPayload(invoice.payload);
  if (topup) {
    const paymentRefId = `cryptobot:${invoiceId}`;
    try {
      const r = await creditWorkingBalanceTopup(topup.userId, topup.microAmount, paymentRefId);
      console.log('[cryptobot] topup credited', { userId: topup.userId, micro: topup.microAmount.toString(), already: r.alreadyCredited });
    } catch (e: any) {
      console.error('[cryptobot] topup credit failed', e?.message);
    }
    return c.json({ ok: true });
  }

  const parsed = parseEntryPayload(invoice.payload);
  if (!parsed) {
    return c.json({ ok: true });
  }

  const paymentRefId = `cryptobot:${invoiceId}`;
  try {
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
      // Mark the pre-launch booking as paid if the payload carried a
      // booking_id. Best-effort — matrix/ledger accruals are already done
      // in processEntry; this row is purely a cabinet-facing audit.
      if (parsed.bookingId !== null) {
        try {
          await db
            .update(bookings)
            .set({ status: 'paid', paidAt: new Date(), linearProcessed: !_marketingActive })
            .where(eq(bookings.id, parsed.bookingId));
        } catch (bookErr) {
          console.warn('cryptobot booking mark-paid failed', bookErr);
        }
      }

      // Phase 1C — fire quest progress for the "first paid booking" /
      // "upgrade" quests. The increment counts the number of paid bookings
      // so thresholds (1, 2, ...) apply naturally across tariff upgrades.
      try {
        await checkQuestProgress(parsed.userId, 'booking_paid');
      } catch (questErr) {
        console.warn('cryptobot quest progress hook failed', questErr);
      }

      // Fire-and-forget DM to admins. We purposely don't await — a slow
      // Telegram API call must not stretch the webhook's response and risk
      // the provider retrying a successful payment.
      void (async () => {
        try {
          const [tariffRow] = await db
            .select({ code: tariffs.code })
            .from(tariffs)
            .where(eq(tariffs.id, parsed.tariffId))
            .limit(1);
          const entryMicro = result.entryMicro;
          const entryUsd = Number(entryMicro) / 1_000_000;
          await notifyAdminsOfPayment({
            method: 'cryptobot',
            userId: parsed.userId,
            tariffCode: tariffRow?.code ?? String(parsed.tariffId),
            entryUsd,
            paymentRefId,
            matrixPosition: result.matrixPosition ?? null,
          });
        } catch (notifyErr) {
          console.warn('cryptobot admin notify failed', notifyErr);
        }
      })();
    }
  } catch (err) {
    console.error('cryptobot webhook processing failed', err);
  }

  return c.json({ ok: true });
});

export default app;
