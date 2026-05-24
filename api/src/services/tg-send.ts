/**
 * Shared direct-send helper used by api-side cron jobs.
 *
 * Mirrors the pattern in `admin-notifier.ts` — POST straight to
 * api.telegram.org because the api pod doesn't host a grammY Bot. Unlike
 * the admin notifier this returns a typed outcome so callers (event
 * reminders, drip, nudge, digest) can mark `scheduled_notifications`
 * rows accordingly.
 *
 * 403 ("bot was blocked by the user") returns `{ ok: false, blocked: true }`
 * so callers can stop scheduling future DMs for this user without logging
 * it as a failure.
 */
import { logger } from '../lib/logger.js';

export interface TgSendOpts {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  replyMarkup?: any;
}

export interface TgSendResult {
  ok: boolean;
  /** True if Telegram returned 403 — user blocked the bot. */
  blocked?: boolean;
  error?: string;
}

export async function tgSendMessage(
  chatId: number,
  text: string,
  opts: TgSendOpts = {},
): Promise<TgSendResult> {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    return { ok: false, error: 'bot_token_missing' };
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
    };
    if (opts.parseMode) body.parse_mode = opts.parseMode;
    if (opts.disableWebPagePreview) body.disable_web_page_preview = true;
    if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;

    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (resp.ok) return { ok: true };

    const txt = await resp.text().catch(() => '');
    // 403 → user blocked bot. 400 "chat not found" → user deleted account
    // or never started bot. Both should stop the retry loop.
    if (resp.status === 403) {
      return { ok: false, blocked: true, error: txt.slice(0, 200) };
    }
    if (resp.status === 400 && /chat not found|user is deactivated|user not found/i.test(txt)) {
      return { ok: false, blocked: true, error: txt.slice(0, 200) };
    }
    logger.warn(
      { chatId, status: resp.status, body: txt.slice(0, 200) },
      'tg-send: non-2xx response',
    );
    return { ok: false, error: `status_${resp.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ chatId, err: msg }, 'tg-send: network error');
    return { ok: false, error: msg };
  }
}
