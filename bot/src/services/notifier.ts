/**
 * Unified Telegram notifier — single entry point for every outbound DM
 * initiated by the bot process (drip, nudges, event reminders,
 * broadcast-lite fan-outs, etc.).
 *
 * Why it exists:
 *   - Retry policy for transient network / 5xx failures lives in ONE
 *     place instead of scattered across a dozen feature handlers.
 *   - 403 ("bot was blocked by the user") is universal — every sender
 *     needs the same drop-and-don't-retry behaviour; doing it here
 *     lets callers treat "sent" as a boolean and stop thinking about it.
 *   - 429 rate-limit handling consults the `retry_after` Telegram gives
 *     us instead of a fixed backoff, which used to cost us multi-second
 *     tail latencies.
 *   - `broadcast()` enforces the <30 msg/sec global Telegram ceiling
 *     (we target 25 for headroom) so two features fanning out at the
 *     same time can't collaboratively DoS our bot.
 *
 * Relationship to `services/broadcaster.ts`:
 *   `Broadcaster` is the admin-initiated /broadcast flow with persisted
 *   job state, photo support, and progress callbacks. It predates this
 *   module and stays as-is — different problem. New features that want
 *   to send arbitrary DMs should use THIS notifier.
 *
 * Relationship to `api/src/services/admin-notifier.ts`:
 *   That one runs in the api pod and POSTs to api.telegram.org over HTTP
 *   directly (no grammY instance there). It is intentionally left alone
 *   to preserve the synchronous payment-webhook → admin-DM path without
 *   a cross-process hop. If a future feature wants rich retry from api,
 *   it should call this notifier indirectly via a bot HTTP endpoint — or
 *   we move admin-notifier here and replace the existing HTTP fetch
 *   calls with a bot-relay. Deferred.
 */
import type { Api, RawApi } from 'grammy';
import { GrammyError, HttpError } from 'grammy';
import pino from 'pino';

// We only touch `bot.api.sendMessage`, so accept any grammY Bot
// specialisation. Importing Bot<AppContext> here would create an
// unnecessary coupling to bot/middleware.ts and make the notifier
// harder to unit-test with a mocked API surface.
interface BotLike {
  api: Pick<Api<RawApi>, 'sendMessage'>;
}

export interface NotifyOpts {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replyMarkup?: any;
  disableWebPagePreview?: boolean;
}

export interface BroadcastResult {
  sent: number;
  failed: number;
  /** Number of recipients who have the bot blocked (403). */
  blocked: number;
}

// Module-scope singletons. The notifier is initialised once from
// `bot/src/index.ts` right after `buildBot`; re-init is a programmer
// error and throws loud.
let botRef: BotLike | null = null;
const logger = pino({ name: 'notifier', level: process.env.LOG_LEVEL ?? 'info' });

// Backoff schedule for *network* failures only (timeouts, 5xx, HttpError).
// 403 and 400-class errors from Telegram are NOT retried.
const RETRY_DELAYS_MS = [500, 1000, 2000];

// Broadcast pacing — keep under the 30/sec hard limit. 25/sec → 40ms/msg.
const BROADCAST_INTERVAL_MS = 40;

export function initNotifier(bot: BotLike): void {
  if (botRef !== null) {
    logger.warn('notifier: initNotifier called twice — replacing bot instance');
  }
  botRef = bot;
}

/** Test-only: wipe the singleton so each test case starts clean. */
export function __resetNotifierForTests(): void {
  botRef = null;
}

function assertInited(): BotLike {
  if (!botRef) {
    throw new Error('notifier: initNotifier(bot) must be called before send*');
  }
  return botRef;
}

function mapOpts(opts?: NotifyOpts): Record<string, unknown> {
  if (!opts) return {};
  const out: Record<string, unknown> = {};
  if (opts.parseMode) out.parse_mode = opts.parseMode;
  if (opts.replyMarkup) out.reply_markup = opts.replyMarkup;
  if (opts.disableWebPagePreview) {
    // grammY prefers the new link_preview_options; keep both shapes
    // for older Bot API clients that the tests might stub.
    out.link_preview_options = { is_disabled: true };
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

type SendOutcome =
  | { kind: 'ok' }
  | { kind: 'blocked' }
  | { kind: 'failed'; reason: string };

/**
 * One sendMessage attempt with full retry logic. Returns structured
 * outcome so callers (sendToUser, broadcast) can bucket it.
 */
async function sendOnce(tgId: number, text: string, opts?: NotifyOpts): Promise<SendOutcome> {
  const bot = assertInited();
  const extra = mapOpts(opts);
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await bot.api.sendMessage(tgId, text, extra);
      logger.debug({ tg_id: tgId, attempt }, 'notifier: send ok');
      return { kind: 'ok' };
    } catch (err) {
      lastError = err;

      // 403 Forbidden → user blocked the bot. Do NOT retry.
      if (err instanceof GrammyError && err.error_code === 403) {
        logger.info({ tg_id: tgId }, 'notifier: recipient blocked the bot; skipping');
        return { kind: 'blocked' };
      }

      // 429 Too Many Requests → honour retry_after, then try again.
      if (err instanceof GrammyError && err.error_code === 429) {
        const retryAfter = err.parameters?.retry_after ?? 1;
        logger.warn(
          { tg_id: tgId, retry_after: retryAfter },
          'notifier: rate-limited, waiting per retry_after',
        );
        await sleep(retryAfter * 1000);
        // 429 does not consume an attempt from the backoff ladder —
        // Telegram explicitly told us when to retry.
        attempt--;
        continue;
      }

      // Other 4xx from Telegram → permanent. Don't retry (bad chat id,
      // bad markup, message too long, etc.).
      if (err instanceof GrammyError && err.error_code >= 400 && err.error_code < 500) {
        logger.warn(
          { tg_id: tgId, code: err.error_code, desc: err.description },
          'notifier: permanent Telegram error; not retrying',
        );
        return { kind: 'failed', reason: `tg_${err.error_code}` };
      }

      // Network / 5xx → retry with exponential backoff.
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break; // exhausted
      const retryable =
        err instanceof HttpError ||
        (err instanceof GrammyError && err.error_code >= 500);
      if (!retryable && !(err instanceof Error)) {
        // Unknown error shape — log and stop.
        break;
      }
      logger.warn(
        { tg_id: tgId, attempt, delay_ms: delay, err: (err as Error).message },
        'notifier: transient error, will retry',
      );
      await sleep(delay);
    }
  }

  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  logger.error({ tg_id: tgId, err: msg }, 'notifier: send failed after retries');
  return { kind: 'failed', reason: msg };
}

export async function sendToUser(
  tgId: number,
  text: string,
  opts?: NotifyOpts,
): Promise<boolean> {
  const outcome = await sendOnce(tgId, text, opts);
  return outcome.kind === 'ok';
}

// ---- admin fan-out ----

// Mirrors api/src/services/admin-notifier.ts:
// parse ADMIN_TG_IDS as comma-separated list, skip non-positive ints,
// fall back to the known founder set so a misconfigured env doesn't
// silently break admin alerts. Also honours ADMIN_TG_ID (single).
const DEFAULT_ADMIN_TG_IDS = '1361064246,424077439,248745860';

function parseAdminIds(): number[] {
  const raw = process.env.ADMIN_TG_IDS;
  const single = process.env.ADMIN_TG_ID;
  const ids = new Set<number>();
  const push = (s: string | undefined): void => {
    if (!s) return;
    for (const part of s.split(',')) {
      const n = Number(part.trim());
      if (Number.isFinite(n) && n > 0) ids.add(n);
    }
  };
  if (raw && raw.trim() !== '') {
    push(raw);
  } else {
    push(DEFAULT_ADMIN_TG_IDS);
  }
  push(single);
  return Array.from(ids);
}

export async function sendToAdmins(text: string, opts?: NotifyOpts): Promise<void> {
  const ids = parseAdminIds();
  if (ids.length === 0) {
    logger.warn('notifier: sendToAdmins called but no admin ids configured');
    return;
  }
  // Intentionally sequential with the broadcast pacing — admins are few
  // and we'd rather be polite than blast 3 messages in 1ms and maybe
  // stack behind a concurrent /broadcast run.
  for (const id of ids) {
    await sendOnce(id, text, opts);
    await sleep(BROADCAST_INTERVAL_MS);
  }
}

// ---- broadcast with token-bucket-ish pacing ----

export async function broadcast(
  tgIds: number[],
  text: string,
  opts?: NotifyOpts,
): Promise<BroadcastResult> {
  const result: BroadcastResult = { sent: 0, failed: 0, blocked: 0 };
  if (tgIds.length === 0) return result;

  for (let i = 0; i < tgIds.length; i++) {
    const id = tgIds[i];
    if (id === undefined) continue;
    const outcome = await sendOnce(id, text, opts);
    if (outcome.kind === 'ok') result.sent++;
    else if (outcome.kind === 'blocked') result.blocked++;
    else result.failed++;

    // Pace between sends. Skip the tail wait — we're done.
    if (i < tgIds.length - 1) {
      await sleep(BROADCAST_INTERVAL_MS);
    }
  }

  logger.info(
    { total: tgIds.length, sent: result.sent, failed: result.failed, blocked: result.blocked },
    'notifier: broadcast complete',
  );
  return result;
}
