import type { Logger } from "pino";
import type { RemindersRepo } from "../db/reminders.js";
import { textForLang } from "../db/reminders.js";
import type { UsersRepo } from "../db/users.js";
import { pickLang } from "./i18n.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BotLike = { api: { sendMessage: (chat_id: number, text: string, opts?: any) => Promise<unknown> } };

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;   // scan every 5 minutes
const BATCH_LIMIT = 40;                       // cap per tick to avoid long bursts
const PER_SEND_DELAY_MS = 60;                 // ~16 msgs/sec, well under Bot API ceiling

export interface SchedulerHandle {
  stop(): void;
  tickNow(): Promise<{ sent: number; failed: number }>;
}

export function startReminderScheduler(opts: {
  bot: BotLike;
  reminders: RemindersRepo;
  users: UsersRepo;
  logger: Logger;
  intervalMs?: number;
}): SchedulerHandle {
  const { bot, reminders, users, logger } = opts;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  async function tick(): Promise<{ sent: number; failed: number }> {
    const due = await reminders.listDue(BATCH_LIMIT);
    if (due.length === 0) return { sent: 0, failed: 0 };
    let sent = 0;
    let failed = 0;
    for (const d of due) {
      const lang = pickLang(d.language_code);
      if (!d || !d.step) { logger.warn({ user_id: d && d.user_id }, "reminder skipped: missing step"); continue; }
      const text = textForLang(d.step, lang);
      try {
        await bot.api.sendMessage(d.tg_id, text, {
          link_preview_options: { is_disabled: true },
        });
        await reminders.recordSent(d.user_id, d.step.id);
        sent++;
      } catch (e) {
        const err = e as Error & { error_code?: number };
        // 403 = user blocked the bot → mark blocked so we stop bothering them.
        if (err.error_code === 403) {
          await users.setBlocked(d.tg_id, true).catch(() => { /* best-effort */ });
          // Also record the send so we don't keep retrying this step.
          await reminders.recordSent(d.user_id, d.step.id).catch(() => { /* best-effort */ });
        }
        failed++;
        logger.warn(
          { err: err.message, code: err.error_code, tg_id: d.tg_id, step_id: d.step.id },
          "reminder send failed",
        );
      }
      if (sent + failed < due.length) {
        await sleep(PER_SEND_DELAY_MS);
      }
    }
    if (sent > 0 || failed > 0) {
      logger.info({ sent, failed }, "reminder tick complete");
    }
    return { sent, failed };
  }

  const timer = setInterval(() => {
    tick().catch((e) => logger.error({ err: (e as Error).message }, "reminder tick crashed"));
  }, intervalMs);

  // Don't let the timer keep the Node process alive on its own; shutdown
  // should drain naturally on SIGINT/SIGTERM.
  if (typeof timer.unref === "function") timer.unref();

  return {
    stop: () => clearInterval(timer),
    tickNow: tick,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
