// bot/src/services/crmPushScheduler.ts
// Polls the cabinet for due CRM digests + task reminders and ships them
// to users as TG messages with actionable inline buttons.
//
// Loop:
//   - every CRM_PUSH_INTERVAL_MS (default 5 min) call /_internal/digest-batch
//   - for each owner with `digest.tasksDueToday.length > 0` or `leadsNew > 0`,
//     compose a message + buttons and call bot.api.sendMessage(chatId, ...)
//   - dedupe by ownerId + hash of (taskIds + leadsNew + dealsOpen) so we
//     only push when something changes since the last cycle
//
// Daily-digest semantics: cabinet decides whether to include an owner; the
// bot is a thin dispatcher. The cabinet's existing `mlm-digest-cron` cron
// continues to handle "9:00 MSK once-a-day" digest emails — this scheduler
// is the *real-time* push channel: due tasks + new leads, every 5 minutes.

import type { Bot } from "grammy";
import type { AppContext } from "../bot/middleware.js";
import type { Logger } from "pino";
import { InlineKeyboard } from "grammy";
import { crm } from "./crmApi.js";

const INTERVAL_MS = Number(process.env.CRM_PUSH_INTERVAL_MS) || 5 * 60_000;
const CRM_URL =
  process.env.CRM_WEBAPP_URL || "https://goldenConnect.to/cabinet/crm-app.html";

const lastDigest = new Map<string, string>();

// [c3-time-aware] Determine MSK hour for time-of-day branding.
function _mskHour(): number {
  // toLocaleString returns HH e.g. "21" in 24h. Robust across DST.
  return Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }));
}
function _mskDateKey(): string {
  return new Date().toLocaleString('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
}
type TimeSlot = 'morning' | 'evening' | 'realtime';
function _timeSlot(): TimeSlot {
  const h = _mskHour();
  if (h >= 9 && h < 10)  return 'morning';
  if (h >= 21 && h < 22) return 'evening';
  return 'realtime';
}

function digestFingerprint(d: {
  tasksDueToday: Array<{ id: string }>;
  leadsNew: number;
  dealsOpen: number;
  dealsWon: number;
}): string {
  return [
    (d.tasksDueToday || []).map((t) => t.id).sort().join(","),
    d.leadsNew,
    d.dealsOpen,
    d.dealsWon,
  ].join("|");
}

export function startCrmPushScheduler(opts: {
  bot: Bot<AppContext>;
  logger: Logger;
}): void {
  const { bot, logger } = opts;
  let stopped = false;

  async function tick(): Promise<void> {
    try {
      const items = await crm.digestBatch();
      const slot = _timeSlot();
      const dateKey = _mskDateKey();
      for (const it of items) {
        let dedupKey: string;
        if (slot === 'morning' || slot === 'evening') {
          // Send morning/evening exactly once per user per day. Key includes
          // the slot so morning + evening on the same day are independent.
          dedupKey = `${dateKey}|${slot}|${it.ownerId}`;
        } else {
          // Real-time push: fire when data signature changes.
          dedupKey = it.ownerId + '|fp:' + digestFingerprint(it.digest);
        }
        if (lastDigest.get(it.ownerId) === dedupKey) continue;
        lastDigest.set(it.ownerId, dedupKey);
        try {
          await sendDigest(bot, it, slot);
        } catch (e) {
          logger.warn(
            { err: (e as Error).message, ownerId: it.ownerId, chatId: it.chatId },
            "crm push: send failed",
          );
        }
      }
      logger.debug({ count: items.length }, "crm push tick");
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "crm push tick failed");
    }
    if (!stopped) setTimeout(tick, INTERVAL_MS);
  }

  setTimeout(tick, 30_000); // first run after 30s warmup
  logger.info({ intervalMs: INTERVAL_MS }, "crm push scheduler armed");
}

async function sendDigest(
  bot: Bot<AppContext>,
  it: Awaited<ReturnType<typeof crm.digestBatch>>[number],
  slot: TimeSlot = 'realtime',
): Promise<void> {
  const d = it.digest;
  const ru = it.lang === "ru";
  const lines: string[] = [];
  // [c3-time-aware] Slot-specific header
  const headers = {
    morning:  ru ? "☀️ *Доброе утро! План на день*"  : "☀️ *Good morning! Today's plan*",
    evening:  ru ? "🌙 *Итог дня*"                    : "🌙 *End-of-day recap*",
    realtime: ru ? "🔔 *Сводка CRM*"                  : "🔔 *CRM update*",
  };
  lines.push(headers[slot]);
  if (d.tasksDueToday.length) {
    lines.push("");
    lines.push(
      ru
        ? `*🔥 Задачи на сегодня (${d.tasksDueToday.length})*`
        : `*🔥 Tasks due today (${d.tasksDueToday.length})*`,
    );
    d.tasksDueToday.slice(0, 5).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title || "—"}`);
    });
  }
  if (d.leadsNew) {
    lines.push("");
    lines.push(
      ru
        ? `🆕 Новых лидов сегодня: *${d.leadsNew}*`
        : `🆕 New leads today: *${d.leadsNew}*`,
    );
  }
  if (d.dealsOpen) {
    lines.push(
      ru
        ? `🎯 Сделок открыто: *${d.dealsOpen}*`
        : `🎯 Open deals: *${d.dealsOpen}*`,
    );
  }
  // [c3-time-aware] Up to 3 per-task action rows.
  const kb = new InlineKeyboard();
  const tasksForButtons = (d.tasksDueToday || []).slice(0, 3);
  tasksForButtons.forEach((t, i) => {
    kb.text(
      ru ? `✅ #${i + 1}` : `✅ #${i + 1}`,
      "crm:taskdone:" + t.id,
    ).text(
      ru ? "⏰ +1ч" : "⏰ +1h",
      "crm:tasksnoozeh:" + t.id,
    ).text(
      ru ? "⏰ +1д" : "⏰ +1d",
      "crm:tasksnooze:" + t.id,
    ).row();
  });
  kb.webApp(ru ? "📋 Открыть CRM" : "📋 Open CRM", CRM_URL);

  await bot.api.sendMessage(it.chatId, lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: kb,
  });
}
