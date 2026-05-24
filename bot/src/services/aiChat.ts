import type { Logger } from "pino";
import { MODEL_CASCADE, MAX_TOKENS, SYSTEM_BASE } from "../http/chat.js";
import type { LeadTrack } from "../db/leads.js";

export interface AiMsg {
  role: "user" | "assistant";
  content: string;
}

export interface AiReply {
  text: string; // user-facing text, with order: line stripped
  order: {
    track: LeadTrack;
    task: string;
    budget: number | null;
    deadline: string | null;
    contact: string;
  } | null;
  usage: { input: number; output: number };
  model: string;
}

export interface AiReplyError {
  error: "upstream" | "auth" | "rate_limit";
  status?: number;
  message: string;
}

export type AiResult = AiReply | AiReplyError;

export function isAiReply(r: AiResult): r is AiReply {
  return (r as AiReply).text !== undefined;
}

const ALLOWED_TRACKS = new Set<LeadTrack>(["order", "operator", "learner", "investor", "partner", "advertiser", "general"]);

function parseOrderLine(raw: string): AiReply["order"] | null {
  const m = raw.match(/order:\s*(\{[\s\S]*?\})/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as Record<string, unknown>;
    const track = typeof j.track === "string" ? j.track : "";
    if (!ALLOWED_TRACKS.has(track as LeadTrack)) return null;
    const task = typeof j.task === "string" ? j.task.slice(0, 2000) : "";
    const contact = typeof j.contact === "string" ? j.contact.slice(0, 200).trim() : "";
    if (!task || !contact) return null;
    const budget =
      typeof j.budget === "number" && Number.isFinite(j.budget)
        ? Math.round(j.budget)
        : null;
    const deadline =
      typeof j.deadline === "string" && j.deadline.trim().length > 0
        ? j.deadline.trim().slice(0, 120)
        : null;
    return { track: track as LeadTrack, task, budget, deadline, contact };
  } catch {
    return null;
  }
}

export interface AiChatOpts {
  accessToken: string;
  logger: Logger;
  refreshAccessToken?: () => Promise<string | null>;
  messages: AiMsg[];
  lang: string;
  minBudget?: number;
}

/**
 * Non-streaming Claude call used by the in-bot AI. Mirrors the landing
 * /api/chat system prompt so the bot says the same things the landing does.
 * Returns either a parsed reply (text + optional order) or an error tag the
 * caller can use to decide whether to bounce the user to a human operator.
 */
export async function askClaude(opts: AiChatOpts): Promise<AiResult> {
  const { logger, messages, lang } = opts;
  let accessToken = opts.accessToken;

  const system = [
    {
      type: "text" as const,
      text: "You are Claude Code, Anthropic's official CLI for Claude.",
    },
    {
      type: "text" as const,
      text: `${SYSTEM_BASE}\n\nUser language: ${lang}. Min budget: $${opts.minBudget ?? 100}.\n\nYou are embedded inside the GOLDEN_CONNECT Telegram bot. Keep replies SHORT (1–3 sentences), plain text, no markdown glyphs.`,
    },
  ];

  const trimmed = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
    .slice(-20);

  const call = async (model: string): Promise<Response> =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system,
        messages: trimmed,
      }),
    });

  for (const model of MODEL_CASCADE) {
    let resp = await call(model);
    if (resp.status === 401 && opts.refreshAccessToken) {
      const fresh = await opts.refreshAccessToken();
      if (fresh) {
        accessToken = fresh;
        resp = await call(model);
      }
    }
    if (resp.ok) {
      try {
        const j = (await resp.json()) as {
          content?: Array<{ type?: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
          model?: string;
        };
        const raw = (j.content ?? [])
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => b.text as string)
          .join("");
        const order = parseOrderLine(raw);
        // Strip the order: / nav: lines from user-facing text.
        const stripped = raw
          .replace(/\border:\s*\{[\s\S]*?\}\s*/g, "")
          .replace(/\bnav:\s*\{[\s\S]*?\}\s*/g, "")
          .trim();
        return {
          text: stripped,
          order,
          usage: {
            input: j.usage?.input_tokens ?? 0,
            output: j.usage?.output_tokens ?? 0,
          },
          model: j.model ?? model,
        };
      } catch (err) {
        logger.warn({ err: (err as Error).message }, "claude parse failed");
        return { error: "upstream", message: "parse failed" };
      }
    }
    const body = await resp.text().catch(() => "");
    logger.warn({ model, status: resp.status, body: body.slice(0, 240) }, "claude call failed");
    if (resp.status === 401) {
      return { error: "auth", status: 401, message: "oauth unauthorized" };
    }
    if (resp.status !== 429 && resp.status !== 529) {
      return { error: "upstream", status: resp.status, message: body.slice(0, 200) };
    }
    // 429/529 → fall through to next model in the cascade.
  }

  return { error: "rate_limit", message: "all models rate-limited" };
}
