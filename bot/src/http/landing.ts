/**
 * Landing → bot webhook.
 *
 * The trendex.website landing POSTs three kinds of form submissions
 * (order / operator / learner) to `POST /api/landing` on this host. This
 * module validates the request, rate-limits per contact, saves a lead
 * row, and posts a formatted HTML card into the right forum topic.
 *
 * Admin follow-up (/take, /won, /lost, /snooze) is wired up separately
 * in bot/commands/admin/leads.ts — they lookup leads by (chat_id,
 * replied_to_message_id).
 */
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type pino from "pino";
import type { LeadsRepo, LeadTrack } from "../db/leads.js";
import type { UsersRepo } from "../db/users.js";

const RATE_LIMIT_MS = 60_000;      // one submission per contact per minute
const MAX_BODY_BYTES = 64 * 1024;  // 64 KB cap on incoming JSON

export interface LandingConfig {
  secret: string;                  // if set, required as x-trendex-secret
  chatId: number | null;
  topicOrder: number | null;
  topicOperator: number | null;
  topicLearner: number | null;
}

// Minimal bot shape — don't pull the full grammy type into the HTTP module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WebhookBot = { api: { sendMessage: (id: number, text: string, opts?: any) => Promise<{ message_id: number }> } };

export interface LandingDeps {
  bot: WebhookBot;
  leadsRepo: LeadsRepo;
  usersRepo: UsersRepo;
  logger: pino.Logger;
  config: LandingConfig;
}

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topicFor(cfg: LandingConfig, track: LeadTrack): number | null {
  if (track === "order") return cfg.topicOrder;
  if (track === "operator") return cfg.topicOperator;
  if (track === "learner") return cfg.topicLearner;
  return null;
}

// /api/landing only accepts the three original tracks (see validateTrack);
// investor leads arrive via /api/order, so they don't need an entry here.
const TRACK_META: Partial<
  Record<LeadTrack, { emoji: string; title: string; fields: Array<[string, string]> }>
> = {
  order: {
    emoji: "🟢",
    title: "Новая заявка · заказ",
    fields: [
      ["Задача", "task"],
      ["Бюджет", "budget"],
      ["Срок", "deadline"],
      ["Контакт", "contact"],
    ],
  },
  operator: {
    emoji: "🟡",
    title: "Новая заявка · оператор",
    fields: [
      ["Имя", "name"],
      ["Стек", "stack"],
      ["Портфолио", "portfolio"],
      ["Опыт с AI", "ai_experience"],
      ["Доступность", "availability"],
      ["Готов к стейку", "stake_ready"],
      ["Контакт", "contact"],
    ],
  },
  learner: {
    emoji: "🔵",
    title: "Новая заявка · ученик",
    fields: [
      ["Имя", "name"],
      ["Цель", "goal"],
      ["Бэкграунд", "background"],
      ["Уровень", "level"],
      ["Часов в неделю", "hours_per_week"],
      ["Предпочт. язык", "language_pref"],
      ["Контакт", "contact"],
    ],
  },
};

function formatLeadMessage(track: LeadTrack, payload: Record<string, unknown>): string {
  const meta = TRACK_META[track];
  if (!meta) throw new Error(`no TRACK_META for track=${track}`);
  const lines: string[] = [];
  lines.push(`${meta.emoji} <b>${escapeHtml(meta.title)}</b>`);
  lines.push("");
  for (const [label, key] of meta.fields) {
    const raw = payload[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const val = typeof raw === "number" ? String(raw) : String(raw);
    lines.push(`<b>${escapeHtml(label)}:</b> ${escapeHtml(val.slice(0, 2000))}`);
  }
  lines.push("");
  const ts = String(payload.ts ?? new Date().toISOString());
  const source = String(payload.source ?? "");
  const lang = String(payload.lang ?? "");
  lines.push(
    `<code>${escapeHtml(ts)} · source=${escapeHtml(source)} · lang=${escapeHtml(lang)}</code>`,
  );
  return lines.join("\n");
}

function validateTrack(raw: unknown): LeadTrack | null {
  if (raw === "order" || raw === "operator" || raw === "learner") return raw;
  return null;
}

function checkSecret(header: string | undefined, expected: string): boolean {
  if (!expected) return true; // no secret configured → open
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        if (!text.trim()) return resolve({});
        resolve(JSON.parse(text) as Record<string, unknown>);
      } catch (e) {
        reject(new Error(`invalid JSON: ${(e as Error).message}`));
      }
    });
    req.on("error", reject);
  });
}

function jsonErr(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false, error: message }));
}

/** Returns true if this handler served the request. */
export async function handleLandingWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  deps: LandingDeps,
): Promise<void> {
  const { bot, leadsRepo, logger, config } = deps;

  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type, x-trendex-secret");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST") {
    jsonErr(res, 405, "method not allowed");
    return;
  }

  const secretHeader = req.headers["x-trendex-secret"];
  const provided = Array.isArray(secretHeader) ? secretHeader[0] : secretHeader;
  if (!checkSecret(provided, config.secret)) {
    logger.warn({ hasHeader: !!provided }, "landing webhook secret mismatch");
    jsonErr(res, 401, "bad secret");
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    jsonErr(res, 400, (e as Error).message);
    return;
  }

  const track = validateTrack(body.track);
  if (!track) {
    jsonErr(res, 400, "invalid track");
    return;
  }
  const contact = String(body.contact ?? "").trim();
  if (contact.length < 3) {
    jsonErr(res, 400, "contact missing");
    return;
  }

  if (await leadsRepo.recentlySubmitted(contact, RATE_LIMIT_MS)) {
    logger.info({ track, contact }, "landing webhook rate-limited");
    jsonErr(res, 429, "too many submissions for this contact");
    return;
  }

  if (config.chatId === null) {
    logger.error("landing webhook hit but LANDING_CHAT_ID not set");
    jsonErr(res, 503, "forum chat not configured");
    return;
  }
  const threadId = topicFor(config, track);
  if (threadId === null) {
    logger.error({ track }, "landing webhook hit but topic id not set for track");
    jsonErr(res, 503, "forum topic not configured");
    return;
  }

  const lead = await leadsRepo.create({
    track,
    contact: contact.slice(0, 200),
    payload: body,
    source: (body.source as string | undefined) ?? null,
    lang: (body.lang as string | undefined) ?? null,
  });

  // If the contact is a Telegram @username, try to flip applied_on_site on
  // the matching user — that turns off the reminder sequence for them.
  if (contact.startsWith("@") && /^@[A-Za-z0-9_]{4,32}$/.test(contact)) {
    try {
      const flipped = await deps.usersRepo.markAppliedByUsername(contact);
      if (flipped) {
        deps.logger.info(
          { contact, leadId: lead.id },
          "user marked as applied_on_site from landing webhook",
        );
      }
    } catch (e) {
      deps.logger.warn(
        { err: (e as Error).message, contact },
        "failed to mark user applied (non-fatal)",
      );
    }
  }

  const text = formatLeadMessage(track, body);
  try {
    const msg = await bot.api.sendMessage(config.chatId, text, {
      parse_mode: "HTML",
      message_thread_id: threadId,
      link_preview_options: { is_disabled: true },
    });
    await leadsRepo.setPosted(lead.id, config.chatId, threadId, msg.message_id);
  } catch (e) {
    logger.error(
      { err: (e as Error).message, leadId: lead.id, track, chatId: config.chatId, threadId },
      "failed to post lead into forum topic",
    );
    // Lead is still saved — admin can recover it. Return 200 to landing so
    // it doesn't retry: the row is in the DB and human eyes will spot it.
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, lead_id: lead.id }));
}
