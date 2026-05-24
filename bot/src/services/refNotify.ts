import { InlineKeyboard } from "grammy";
import type { Logger } from "pino";
import type { UsersRepo } from "../db/users.js";
import type { UserRow } from "../types.js";
import { pickLang, t } from "./i18n.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BotLike = { api: { sendMessage: (chat_id: number, text: string, opts?: any) => Promise<unknown> } };

const PER_SEND_DELAY_MS = 80;

/**
 * When a new user joins via a ref chain, DM every ancestor (subject to their
 * ref_notifications_enabled flag). Runs async from onStart — errors are
 * logged, not propagated, so a flaky send can't break the welcome flow.
 */
export async function notifyAncestorsOfNewReferral(
  deps: {
    bot: BotLike;
    users: UsersRepo;
    logger: Logger;
  },
  newUser: UserRow,
): Promise<void> {
  const { bot, users, logger } = deps;
  let ancestors: Awaited<ReturnType<UsersRepo["listAncestors"]>>;
  try {
    ancestors = await users.listAncestors(newUser.id);
  } catch (e) {
    logger.warn(
      { err: (e as Error).message, user_id: newUser.id },
      "failed to compute ancestors for ref notification",
    );
    return;
  }
  if (ancestors.length === 0) return;

  const whoHandle = formatWho(newUser);

  for (const anc of ancestors) {
    if (anc.is_blocked || anc.ref_notifications_enabled === 0) continue;

    const lang = pickLang(anc.language_code);
    const dict = t(lang);

    const stats = await users.descendantStats(anc.user_id);
    const text = dict.notif_new_referral(
      whoHandle,
      anc.depth,
      stats.total_descendants,
    );
    const kb = new InlineKeyboard().text(dict.btn_notif_off, "refnotif:off");

    try {
      await bot.api.sendMessage(anc.tg_id, text, {
        parse_mode: "HTML",
        reply_markup: kb,
        link_preview_options: { is_disabled: true },
      });
    } catch (e) {
      const err = e as Error & { error_code?: number };
      if (err.error_code === 403) {
        // Ancestor blocked the bot — mark so other pings (reminders, etc.)
        // don't keep burning retries on them.
        await users.setBlocked(anc.tg_id, true).catch(() => { /* best-effort */ });
      }
      logger.warn(
        { err: err.message, code: err.error_code, tg_id: anc.tg_id, depth: anc.depth },
        "ref-notify send failed",
      );
    }
    await sleep(PER_SEND_DELAY_MS);
  }
}

function formatWho(u: UserRow): string {
  if (u.username) return `@${u.username}`;
  if (u.first_name) return escapeHtml(u.first_name);
  return `tg://user?id=${u.tg_id}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
