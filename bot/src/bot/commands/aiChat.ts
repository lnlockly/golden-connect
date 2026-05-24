import type { Logger } from "pino";
import type { AppContext } from "../middleware.js";
import type { AiTurnsRepo } from "../../db/aiTurns.js";
import type { LeadsRepo } from "../../db/leads.js";
import type { ClaudeAuth } from "../../services/claudeAuth.js";
import { askClaude, isAiReply, type AiMsg } from "../../services/aiChat.js";
import { askGroq, isGroqAiReply } from "../../services/aiGroq.js";
import { postLeadCard } from "../../services/leadPoster.js";
import { pickLang } from "../../services/i18n.js";

interface Bucket {
  tokens: number;
  firstAt: number;
}

const TOKEN_BUDGET = Number(process.env.CHAT_TOKEN_BUDGET ?? 40_000);
const RATE_WINDOW_MS = Number(process.env.CHAT_RATE_WINDOW_MS ?? 24 * 60 * 60 * 1000);
const MAX_HISTORY = 20;
const MAX_INPUT_LEN = 2000;

const OVER_QUOTA_TEXT: Record<string, string> = {
  ru: "Лимит диалога на сегодня исчерпан. Оператор подхватит разговор лично — напиши @golden-connect_founder или жми /start.",
  en: "Daily chat limit reached. Reach out to @mlm808 or tap /start to continue.",
  zh: "今日对话额度已用完。人工运营会接手 — 联系 @golden-connect_founder 或点 /start。",
};

const UPSTREAM_FAIL_TEXT: Record<string, string> = {
  ru: "Ассистент сейчас недоступен, попробуй ещё раз через минуту.",
  en: "Assistant is unavailable, try again in a minute.",
  zh: "助手暂不可用，一分钟后再试。",
};

const THANKS_TEXT: Record<string, string> = {
  ru: "Спасибо — заявка зафиксирована. Оператор свяжется по контакту.",
  en: "Thanks — your request is in. We'll reach out via the contact you left.",
  zh: "谢谢，已提交。运营会通过你留的联系方式联系你。",
};

export interface AiChatDeps {
  auth: ClaudeAuth;
  aiTurns: AiTurnsRepo;
  leadsRepo: LeadsRepo;
  adminTgId: number;
  logger: Logger;
}

export function registerAiChat(deps: AiChatDeps): {
  onText: (ctx: AppContext) => Promise<void>;
  onReset: (ctx: AppContext) => Promise<void>;
} {
  const buckets = new Map<number, Bucket>();
  setInterval(() => {
    const now = Date.now();
    for (const [tgId, b] of buckets) {
      if (now - b.firstAt > RATE_WINDOW_MS) buckets.delete(tgId);
    }
  }, 10 * 60 * 1000).unref();

  function getBucket(tgId: number): Bucket {
    const now = Date.now();
    let b = buckets.get(tgId);
    if (!b || now - b.firstAt > RATE_WINDOW_MS) {
      b = { tokens: 0, firstAt: now };
      buckets.set(tgId, b);
    }
    return b;
  }

  async function onText(ctx: AppContext): Promise<void> {
    const from = ctx.from;
    const text = ctx.message?.text?.trim();
    if (!from || !text) return;
    // Skip bot commands — those have their own handlers.
    if (text.startsWith("/")) return;

    const lang = pickLang(from.language_code);
    const bucket = getBucket(from.id);
    if (bucket.tokens >= TOKEN_BUDGET) {
      await ctx.reply(OVER_QUOTA_TEXT[lang] ?? OVER_QUOTA_TEXT.en);
      return;
    }

    // Removed early-exit: Groq fallback works without Claude OAuth token.
    // The auth check is now inside the model dispatch below.

    // Load history, then append this user turn so Claude sees it too.
    const history = await deps.aiTurns.recent(from.id, MAX_HISTORY);
    const userMsg: AiMsg = { role: "user", content: text.slice(0, MAX_INPUT_LEN) };
    await deps.aiTurns.append(from.id, "user", userMsg.content);

    // Best-effort typing indicator — Telegram shows it for ~5 s.
    try {
      await ctx.api.sendChatAction(ctx.chat!.id, "typing");
    } catch { /* non-fatal */ }

    const messagesForAi = [
      ...history.map((h) => ({ role: h.role, content: h.content }) as AiMsg),
      userMsg,
    ];

    // Try Claude first if OAuth tokens present, else fall back to Groq.
    // Groq is free + fast + always available (we have GROQ_KEYS env).
    let result: ReturnType<typeof askClaude> extends Promise<infer T> ? T : never;
    if (deps.auth.access) {
      result = await askClaude({
        accessToken: deps.auth.access,
        refreshAccessToken: () => deps.auth.refresh(),
        logger: deps.logger,
        lang,
        messages: messagesForAi,
      });
    } else {
      // Groq fallback — same interface
      const groqResult = await askGroq({
        logger: deps.logger,
        lang,
        messages: messagesForAi,
      });
      if (isGroqAiReply(groqResult)) {
        result = {
          text: groqResult.text,
          order: groqResult.order,
          usage: groqResult.usage,
          model: groqResult.model,
        };
      } else {
        result = groqResult;
      }
    }

    if (!isAiReply(result)) {
      deps.logger.warn(
        { tg_id: from.id, error: result.error, status: result.status },
        "AI chat upstream error",
      );
      await ctx.reply(UPSTREAM_FAIL_TEXT[lang] ?? UPSTREAM_FAIL_TEXT.en);
      return;
    }

    bucket.tokens += (result.usage.input ?? 0) + (result.usage.output ?? 0);

    // Save the assistant turn before anything else — we want the history to
    // reflect what Claude said even if lead delivery fails.
    if (result.text) {
      await deps.aiTurns.append(from.id, "assistant", result.text);
    }

    if (result.text) {
      try {
        await ctx.reply(result.text);
      } catch (err) {
        deps.logger.warn(
          { err: (err as Error).message, tg_id: from.id },
          "AI chat reply send failed",
        );
      }
    }

    if (result.order) {
      try {
        await postLeadCard({
          bot: { api: ctx.api },
          leadsRepo: deps.leadsRepo,
          logger: deps.logger,
          adminTgId: deps.adminTgId,
          payload: {
            track: result.order.track,
            task: result.order.task,
            budget: result.order.budget,
            deadline: result.order.deadline,
            contact: result.order.contact,
            lang,
            source: `bot:${from.id}`,
          },
          sourceLabel: "via bot",
        });
        if (!result.text) {
          await ctx.reply(THANKS_TEXT[lang] ?? THANKS_TEXT.en);
        }
      } catch (err) {
        deps.logger.warn(
          { err: (err as Error).message, tg_id: from.id },
          "AI chat lead post failed",
        );
      }
    }

    deps.logger.debug(
      {
        tg_id: from.id,
        model: result.model,
        input: result.usage.input,
        output: result.usage.output,
        spent: bucket.tokens,
        order: !!result.order,
      },
      "ai chat turn done",
    );
  }

  async function onReset(ctx: AppContext): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    await deps.aiTurns.reset(from.id);
    const lang = pickLang(from.language_code);
    const msg =
      lang === "ru" ? "Ок, начнём заново. Напиши, чем могу помочь."
      : lang === "zh" ? "好的，重新开始。告诉我你需要什么帮助。"
      : "Okay, fresh start. Tell me what you need.";
    await ctx.reply(msg);
  }

  return { onText, onReset };
}
