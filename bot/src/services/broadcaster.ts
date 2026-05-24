import type { Bot, InlineKeyboard } from "grammy";
import type { GrammyError } from "grammy";
import type { Logger } from "pino";
import type { UsersRepo, BroadcastsRepo } from "../db/users.js";
import type { AppContext } from "../bot/middleware.js";

export interface BroadcastJob {
  broadcastId: number;
  /** text = plain message; photo = sendPhoto with caption. */
  kind: "text" | "photo";
  /** Text body (for kind=text) or caption (for kind=photo). */
  body: string;
  /** Required when kind=photo. */
  photoFileId?: string;
  /** Parsed button list (informational — replyMarkup is what we actually send). */
  buttons?: Array<{ text: string; url: string }>;
  /** Pre-built inline keyboard — shared across every recipient. */
  replyMarkup?: InlineKeyboard;
  onProgress?: (sent: number, failed: number) => void;
  onDone?: (sent: number, failed: number) => void;
}

export class Broadcaster {
  private queue: BroadcastJob[] = [];
  private running = false;

  constructor(
    private readonly bot: Bot<AppContext>,
    private readonly users: UsersRepo,
    private readonly broadcasts: BroadcastsRepo,
    private readonly logger: Logger,
  ) {}

  enqueue(job: BroadcastJob): void {
    this.queue.push(job);
    void this.runLoop();
  }

  private async runLoop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue.shift();
        if (!job) break;
        await this.runJob(job);
      }
    } finally {
      this.running = false;
    }
  }

  private async sendOne(job: BroadcastJob, tgId: number): Promise<void> {
    if (job.kind === "photo" && job.photoFileId) {
      await this.bot.api.sendPhoto(tgId, job.photoFileId, {
        caption: job.body || undefined,
        reply_markup: job.replyMarkup,
      });
    } else {
      await this.bot.api.sendMessage(tgId, job.body, {
        reply_markup: job.replyMarkup,
      });
    }
  }

  private async runJob(job: BroadcastJob): Promise<void> {
    const recipients = await this.users.allForBroadcast();
    let sent = 0;
    let failed = 0;

    // Target ~20 msg/sec. Sleep 50ms between sends, with jitter.
    const baseDelayMs = 50;

    for (const r of recipients) {
      try {
        await this.sendOne(job, r.tg_id);
        sent++;
      } catch (e) {
        const err = e as GrammyError & { error_code?: number; parameters?: { retry_after?: number } };
        const code = err.error_code ?? 0;
        if (code === 429) {
          const retryAfter = err.parameters?.retry_after ?? 1;
          this.logger.warn({ retryAfter }, "broadcast 429, backing off");
          await sleep(retryAfter * 1000);
          try {
            await this.sendOne(job, r.tg_id);
            sent++;
          } catch (e2) {
            failed++;
            this.handleFailure(r.tg_id, e2);
          }
        } else if (code === 403) {
          failed++;
          await this.users.setBlocked(r.tg_id, true).catch(() => { /* best-effort */ });
        } else {
          failed++;
          this.handleFailure(r.tg_id, e);
        }
      }

      if ((sent + failed) % 25 === 0) {
        await this.broadcasts
          .updateProgress(job.broadcastId, sent, failed)
          .catch(() => { /* best-effort */ });
        job.onProgress?.(sent, failed);
      }

      const jitter = baseDelayMs * (1 + Math.random() * 0.1);
      await sleep(jitter);
    }

    await this.broadcasts
      .updateProgress(job.broadcastId, sent, failed)
      .catch(() => { /* best-effort */ });
    job.onDone?.(sent, failed);
  }

  private handleFailure(tgId: number, e: unknown): void {
    const msg = e instanceof Error ? e.message : String(e);
    this.logger.warn({ tg_id: tgId, err: msg }, "broadcast send failed");
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
