import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import type { Logger } from "pino";
import { loadCustomEmojiMap } from "../../../services/customEmoji.js";

/**
 * /setup_topics — creates three forum topics (Заказы / Операторы /
 * Обучение) in the current chat (or in the chat_id passed as argument)
 * and echoes the resulting message_thread_ids so they can be stuffed
 * into k3s secrets.
 *
 * Bot needs to be admin in the group with the "Manage Topics" right.
 * Requires the group to be a supergroup with forum / topics enabled.
 */

// Telegram's allowed icon_color values for forum topics — any value outside
// this palette is rejected by the server.
type TopicColor = 7322096 | 16766590 | 9367192 | 13338331 | 16749490 | 16478047;

interface Topic {
  name: string;
  icon_color: TopicColor;
}

const TOPICS: Topic[] = [
  { name: "🟢 Заказы",    icon_color: 9367192 },    // mint green
  { name: "🟡 Операторы", icon_color: 16766590 },   // yellow
  { name: "🔵 Обучение",  icon_color: 7322096 },    // light blue
];

export async function onSetupTopics(ctx: AppContext): Promise<void> {
  if (!isAdmin(ctx.state, ctx.from?.id)) return;

  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const chatId = arg ? Number(arg) : ctx.chat?.id;
  if (!chatId || !Number.isFinite(chatId)) {
    await ctx.reply(
      "Использование: в нужном супергруппе с топиками — `/setup_topics`. " +
        "Или из лички: `/setup_topics -100XXXXXXXXXX`.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const lines: string[] = [];
  lines.push(`<b>Создаю темы в чате <code>${chatId}</code>…</b>`);
  lines.push("");
  const created: Array<{ name: string; threadId: number | null; error?: string }> = [];

  for (const t of TOPICS) {
    try {
      const topic = await ctx.api.createForumTopic(chatId, t.name, {
        icon_color: t.icon_color,
      });
      created.push({ name: t.name, threadId: topic.message_thread_id });
    } catch (e) {
      created.push({ name: t.name, threadId: null, error: (e as Error).message });
    }
  }

  // Map track → env var name for easier copy into k3s secrets.
  const envKeys = ["LANDING_TOPIC_ORDER", "LANDING_TOPIC_OPERATOR", "LANDING_TOPIC_LEARNER"];

  for (let i = 0; i < created.length; i++) {
    const c = created[i];
    const envKey = envKeys[i];
    if (c.threadId !== null) {
      lines.push(`✅ <b>${escapeHtml(c.name)}</b>`);
      lines.push(`   <code>${envKey}=${c.threadId}</code>`);
    } else {
      lines.push(`❌ <b>${escapeHtml(c.name)}</b> — ${escapeHtml(c.error ?? "")}`);
    }
  }

  lines.push("");
  lines.push(`<code>LANDING_CHAT_ID=${chatId}</code>`);

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

// -- Custom emoji diagnostics -------------------------------------------------

/** Mutable ref so the admin can refresh the map without a bot restart. */
export interface EmojiMapRef {
  current: Map<string, string>;
}

export async function onEmojiStatus(
  ctx: AppContext,
  ref: EmojiMapRef,
  packName: string,
): Promise<void> {
  if (!isAdmin(ctx.state, ctx.from?.id)) return;
  const entries = Array.from(ref.current.entries());
  const lines: string[] = [];
  lines.push(`<b>Custom emoji pack:</b> <code>${escapeHtml(packName)}</code>`);
  lines.push(`<b>Loaded entries:</b> ${entries.length}`);
  if (entries.length === 0) {
    lines.push("");
    lines.push(
      "Пусто. Причины: (1) у владельца бота нет Telegram Premium — сервер " +
        "дропает custom_emoji entity; (2) пак не существует / бот не владелец; " +
        "(3) пак не успел дозагрузиться на старте — запусти /emoji_reload.",
    );
  } else {
    lines.push("");
    for (const [fallback, id] of entries) {
      lines.push(`${fallback} → <code>${escapeHtml(id)}</code>`);
    }
    lines.push("");
    lines.push(
      "Если в welcome есть юникод-эмоджи которого <b>нет</b> в списке выше — " +
        "он не подменится. Fallback эмоджи в текстах бота сейчас: ✅ 🚀 📖 🎁 ✨.",
    );
  }
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    message_thread_id: ctx.message?.message_thread_id,
  });
}

export function registerEmojiReload(
  ref: EmojiMapRef,
  packName: string,
  logger: Logger,
): (ctx: AppContext) => Promise<void> {
  return async (ctx: AppContext) => {
    if (!isAdmin(ctx.state, ctx.from?.id)) return;
    const fresh = await loadCustomEmojiMap(ctx.api, packName, logger);
    // Swap the underlying map in place so every in-flight ctx.state.customEmoji
    // sees the new content (it points at the same object).
    ref.current.clear();
    for (const [k, v] of fresh) ref.current.set(k, v);
    await ctx.reply(
      `Пак <code>${escapeHtml(packName)}</code> перезагружен. ` +
        `Записей: ${ref.current.size}.`,
      { parse_mode: "HTML", message_thread_id: ctx.message?.message_thread_id },
    );
  };
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

