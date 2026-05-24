import type { Logger } from "pino";
import type { LeadsRepo, LeadTrack } from "../db/leads.js";

export interface LeadPosterBot {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  api: { sendMessage: (id: number, text: string, opts?: any) => Promise<{ message_id: number }> };
}

export interface LeadPayload {
  track: LeadTrack;
  task: string;
  budget: number | null;
  deadline: string | null;
  contact: string;
  lang: string;
  source: string;
  ip?: string;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const TRACK_LABEL: Record<LeadTrack, string> = {
  order: "🟢 New ORDER",
  operator: "🟣 Operator application",
  learner: "🔵 Learner signup",
  investor: "🟡 Investor interest",
  partner: "🚀 Partner signup",
  advertiser: "📣 Advertiser interest",
  general: "💬 General contact",
};

const TOPIC_ENV_BY_TRACK: Record<LeadTrack, string> = {
  order: "TG_TOPIC_ORDER",
  operator: "TG_TOPIC_OPERATOR",
  learner: "TG_TOPIC_LEARNER",
  investor: "TG_TOPIC_INVESTOR",
  partner: "TG_TOPIC_PARTNER",
  advertiser: "TG_TOPIC_ADVERTISER",
  general: "TG_TOPIC_GENERAL",
};

/**
 * Persist the lead and post a formatted card into the right forum topic.
 * Falls back to an admin DM when TG_CHAT_ID/topic envs are missing or the
 * topic send fails. Returns the stored lead id (or null if persisting
 * itself threw, which should be extremely rare).
 *
 * Callers: /api/order (landing chat), bot AI chat (in-bot conversation).
 */
export async function postLeadCard(args: {
  bot: LeadPosterBot;
  leadsRepo: LeadsRepo;
  logger: Logger;
  adminTgId: number;
  payload: LeadPayload;
  sourceLabel: string; // "via chat" / "via bot" — shown in the card header
}): Promise<number | null> {
  const { bot, leadsRepo, logger, adminTgId, payload, sourceLabel } = args;

  let leadId: number | null = null;
  try {
    const lead = await leadsRepo.create({
      track: payload.track,
      contact: payload.contact,
      payload: { ...payload },
      source: payload.source,
      lang: payload.lang,
    });
    leadId = lead.id;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "lead persist failed");
  }

  const budgetLine = payload.budget != null ? `$${payload.budget}` : "—";
  const deadlineLine = payload.deadline || "—";
  const idLine = leadId != null ? `<b>#${leadId}</b> ` : "";
  const ipLine = payload.ip
    ? `\n<b>IP:</b> <code>${escapeHtml(payload.ip)}</code>`
    : "";
  const text =
    `${idLine}<b>${TRACK_LABEL[payload.track]} ${sourceLabel}</b>\n` +
    `<b>Track:</b> ${payload.track}\n` +
    `<b>Task:</b> ${escapeHtml(payload.task)}\n` +
    `<b>Budget:</b> ${budgetLine}\n` +
    `<b>Deadline:</b> ${escapeHtml(deadlineLine)}\n` +
    `<b>Contact:</b> ${escapeHtml(payload.contact)}\n` +
    `<b>Lang:</b> ${escapeHtml(payload.lang)} · <b>Src:</b> ${escapeHtml(payload.source)}` +
    ipLine;

  const chatIdRaw = process.env.TG_CHAT_ID ?? "";
  const topicRaw = process.env[TOPIC_ENV_BY_TRACK[payload.track]] ?? "";
  const chatId = chatIdRaw ? Number(chatIdRaw) : NaN;
  const topicId = topicRaw ? Number(topicRaw) : NaN;

  let delivered = false;
  if (Number.isFinite(chatId)) {
    try {
      const msg = await bot.api.sendMessage(chatId, text, {
        parse_mode: "HTML",
        ...(Number.isFinite(topicId) ? { message_thread_id: topicId } : {}),
      });
      delivered = true;
      if (leadId != null && Number.isFinite(topicId)) {
        await leadsRepo.setPosted(leadId, chatId, topicId, msg.message_id);
      }
    } catch (err) {
      logger.warn(
        { err: (err as Error).message, chatId, topicId, track: payload.track },
        "forum-topic delivery failed, falling back to admin DM",
      );
    }
  }
  if (!delivered) {
    try {
      await bot.api.sendMessage(adminTgId, text, { parse_mode: "HTML" });
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "admin DM fallback failed");
    }
  }

  return leadId;
}
