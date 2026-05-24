import type { Logger } from "pino";
import type { LeadTrack } from "../db/leads.js";
import { SYSTEM_BASE } from "../http/chat.js";

export interface GroqAiMsg {
  role: "user" | "assistant";
  content: string;
}

export interface GroqAiOpts {
  logger: Logger;
  messages: GroqAiMsg[];
  lang: string;
  minBudget?: number;
}

interface GroqAiReply {
  text: string;
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

interface GroqAiError {
  error: "upstream" | "auth" | "rate_limit";
  status?: number;
  message: string;
}

export type GroqAiResult = GroqAiReply | GroqAiError;

export function isGroqAiReply(r: GroqAiResult): r is GroqAiReply {
  return (r as GroqAiReply).text !== undefined;
}

const ALLOWED_TRACKS = new Set<LeadTrack>([
  "order", "operator", "learner", "investor", "partner", "advertiser", "general",
]);

const GROQ_MODELS = [
  "llama-3.3-70b-versatile",     // primary — strong reasoning, fast
  "llama-3.1-8b-instant",        // fallback — faster, weaker
];

function getGroqKeys(): string[] {
  const raw = process.env.GROQ_KEYS || process.env.GROQ_API_KEY || "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function parseOrderLine(raw: string): GroqAiReply["order"] | null {
  const m = raw.match(/order:\s*(\{[\s\S]*?\})/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]) as Record<string, unknown>;
    const track = typeof j.track === "string" ? j.track : "";
    if (!ALLOWED_TRACKS.has(track as LeadTrack)) return null;
    const task = typeof j.task === "string" ? j.task.slice(0, 2000) : "";
    const contact = typeof j.contact === "string" ? j.contact.slice(0, 200).trim() : "";
    if (!task || !contact) return null;
    const budget = typeof j.budget === "number" && Number.isFinite(j.budget)
      ? Math.round(j.budget) : null;
    const deadline = typeof j.deadline === "string" ? j.deadline.slice(0, 100) : null;
    return { track: track as LeadTrack, task, budget, deadline, contact };
  } catch {
    return null;
  }
}

export async function askGroq(opts: GroqAiOpts): Promise<GroqAiResult> {
  const keys = getGroqKeys();
  if (!keys.length) {
    return { error: "auth", status: 401, message: "no GROQ_KEYS configured" };
  }

  const system = `${SYSTEM_BASE}\n\nUser language: ${opts.lang}. Min budget: $${opts.minBudget ?? 100}.\n\nYou are embedded inside the @Golden Connect_bizbot Telegram bot. Keep replies SHORT (1–3 sentences), plain text, no markdown glyphs.`;

  const trimmed = opts.messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: String(m.content).slice(0, 2000) }))
    .slice(-20);

  const callGroq = async (model: string, key: string): Promise<Response> =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.6,
        messages: [{ role: "system", content: system }, ...trimmed],
      }),
    });

  // Try each model with each key (round-robin on rate limits / 401)
  for (const model of GROQ_MODELS) {
    for (const key of keys) {
      try {
        const resp = await callGroq(model, key);
        if (resp.status === 401 || resp.status === 403) {
          opts.logger.warn({ model, keyHint: key.slice(0, 6) + "..." }, "groq key rejected");
          continue;
        }
        if (resp.status === 429) {
          opts.logger.warn({ model, keyHint: key.slice(0, 6) + "..." }, "groq rate limit");
          continue;
        }
        if (!resp.ok) {
          const text = await resp.text().catch(() => "");
          opts.logger.warn({ model, status: resp.status, body: text.slice(0, 300) }, "groq upstream error");
          continue;
        }
        const j = (await resp.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const raw = j.choices?.[0]?.message?.content || "";
        const order = parseOrderLine(raw);
        const stripped = raw
          .replace(/\border:\s*\{[\s\S]*?\}\s*/g, "")
          .replace(/\bnav:\s*\{[\s\S]*?\}\s*/g, "")
          .trim();
        return {
          text: stripped,
          order,
          usage: { input: j.usage?.prompt_tokens ?? 0, output: j.usage?.completion_tokens ?? 0 },
          model: `groq:${model}`,
        };
      } catch (e) {
        opts.logger.warn({ err: (e as Error).message }, "groq fetch failed");
      }
    }
  }
  return { error: "upstream", message: "all groq attempts failed" };
}
