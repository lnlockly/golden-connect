/**
 * Direct Telegram DM fan-out to platform admins when something happens the
 * founders want to see immediately (a paid tariff entry, for now). Runs in
 * the api pod — we don't bounce through the bot process because:
 *
 *   1. The webhook handler already holds the DB write's context; we want the
 *      DM to go out on the same request, not after a queue round-trip.
 *   2. The api pod has `BOT_TOKEN` (same Telegram bot as the bot pod), so a
 *      plain `sendMessage` REST call is enough.
 *
 * Fire-and-forget. Any network / Telegram error is swallowed — a missing DM
 * is logged but must not rollback the processed entry.
 */

const DEFAULT_ADMIN_TG_IDS = '1361064246,424077439,248745860';

function parseAdminIds(raw: string | undefined): number[] {
  return (raw ?? DEFAULT_ADMIN_TG_IDS)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export interface PaymentNotificationPayload {
  method: 'cryptobot' | 'platega';
  userId: number;
  tariffCode: string;
  entryUsd: number;
  paymentRefId: string;
  matrixPosition?: number | null;
}

/**
 * DMs every admin listed in `ADMIN_TG_IDS` (or the baked-in default) about a
 * fresh payment. Returns a promise that resolves once all sendMessage
 * attempts settle — callers SHOULD NOT `await` it on the hot webhook path;
 * use `.catch(() => {})` so an outage at api.telegram.org can't stall us.
 */
export async function notifyAdminsOfPayment(
  payload: PaymentNotificationPayload,
): Promise<void> {
  const token = process.env.BOT_TOKEN;
  const adminIds = parseAdminIds(process.env.ADMIN_TG_IDS);
  if (!token || adminIds.length === 0) return;

  const methodLabel =
    payload.method === 'cryptobot' ? 'CryptoBot USDT' : 'Platega / карта';
  const text =
    `💸 Новая оплата\n\n` +
    `Метод: ${methodLabel}\n` +
    `Тариф: ${payload.tariffCode.toUpperCase()}\n` +
    `Сумма: $${payload.entryUsd}\n` +
    `Юзер: id ${payload.userId}\n` +
    `Место в матрице: ${payload.matrixPosition ?? '—'}\n` +
    `Ref: ${payload.paymentRefId}`;

  await Promise.allSettled(
    adminIds.map((chatId) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }).catch(() => undefined),
    ),
  );
}
