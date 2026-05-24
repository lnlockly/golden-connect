/**
 * /event_new — admin wizard to create a new event via a simple in-memory
 * state machine (no grammy-conversations dep). Flow:
 *
 *   1. admin sends /event_new
 *   2. bot asks for title            → admin replies with one line
 *   3. bot asks for topic            → one line, or "-" to skip
 *   4. bot asks for starts_at (MSK)  → "YYYY-MM-DD HH:MM"
 *   5. bot asks for duration (min)   → integer, default 60
 *   6. bot asks for join_url         → url or "-" to skip
 *   7. bot previews + two buttons:   Publish / Save as draft / Cancel
 *
 * Wizard state is kept in a Map<tg_id, WizardState> — process-local only.
 * Admin can /cancel to abort. Non-wizard messages fall through.
 *
 * /event_list — prints the next 10 events with status + buttons to
 * publish/cancel.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";

interface WizardState {
  step: "title" | "topic" | "starts_at" | "duration" | "join_url" | "preview";
  title?: string;
  topic?: string | null;
  starts_at?: string; // ISO
  duration_min?: number;
  join_url?: string | null;
}

const wizards = new Map<number, WizardState>();

function parseMskDate(input: string): string | null {
  const m = input.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})[\sT](\d{2}):(\d{2})$/,
  );
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // MSK = UTC+3 (no DST). Subtract 3h to get UTC ISO.
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h) - 3,
    Number(mi),
  );
  if (!Number.isFinite(utcMs)) return null;
  return new Date(utcMs).toISOString();
}

function previewText(s: WizardState): string {
  const when = s.starts_at ? new Date(s.starts_at).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }) : "—";
  const lines = [
    "📡 <b>Превью эфира TRENDEX</b>",
    "",
    `<b>Название:</b> ${s.title ?? "—"}`,
    `<b>Тема:</b> ${s.topic ?? "—"}`,
    `<b>Начало (MSK):</b> ${when}`,
    `<b>Длительность (мин):</b> ${s.duration_min ?? 60}`,
    `<b>Ссылка на эфир:</b> ${s.join_url ?? "—"}`,
    "",
    "Проверь — и опубликуй или сохрани черновик.",
  ];
  return lines.join("\n");
}

export async function onEventNew(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  wizards.set(tgId, { step: "title" });
  await ctx.reply(
    "🛠 <b>Создаём эфир TRENDEX</b>\n\n" +
      "Шаг 1/5 — пришли <b>название</b> эфира (одной строкой).\n\n" +
      "В любой момент /cancel — отменить.",
    { parse_mode: "HTML" },
  );
}

export async function onEventCancel(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  if (!wizards.has(tgId)) return false;
  wizards.delete(tgId);
  await ctx.reply("Отменено.");
  return true;
}

/**
 * Called from the admin text-path in bot/index.ts. Returns true if the
 * wizard consumed the message (so the broadcast/AI handlers don't also
 * fire). Returns false when no wizard is active.
 */
export async function onAdminEventsMaybeText(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  const state = wizards.get(tgId);
  if (!state) return false;
  const text = ctx.message?.text?.trim();
  if (!text) return false;
  if (text.startsWith("/")) {
    // Let /cancel and other commands through.
    return false;
  }

  if (state.step === "title") {
    state.title = text.slice(0, 240);
    state.step = "topic";
    await ctx.reply(
      "Шаг 2/5 — <b>тема</b> эфира (1–2 строки, или «-» чтобы пропустить):",
      { parse_mode: "HTML" },
    );
    return true;
  }
  if (state.step === "topic") {
    state.topic = text === "-" ? null : text.slice(0, 240);
    state.step = "starts_at";
    await ctx.reply(
      "Шаг 3/5 — <b>начало (MSK)</b>, формат <code>YYYY-MM-DD HH:MM</code>:",
      { parse_mode: "HTML" },
    );
    return true;
  }
  if (state.step === "starts_at") {
    const iso = parseMskDate(text);
    if (!iso) {
      await ctx.reply(
        "Не распознал формат. Пример: <code>2026-05-15 19:00</code>",
        { parse_mode: "HTML" },
      );
      return true;
    }
    state.starts_at = iso;
    state.step = "duration";
    await ctx.reply(
      "Шаг 4/5 — <b>длительность (мин)</b> числом (по умолчанию 60, или «-»):",
      { parse_mode: "HTML" },
    );
    return true;
  }
  if (state.step === "duration") {
    const n = text === "-" ? 60 : Number(text);
    if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) {
      await ctx.reply("Нужно число минут от 1 до 1440. Повтори.");
      return true;
    }
    state.duration_min = Math.trunc(n);
    state.step = "join_url";
    await ctx.reply(
      "Шаг 5/5 — <b>ссылка на эфир</b> (Zoom / YouTube / Telegram / …) или «-», чтобы пропустить:",
      { parse_mode: "HTML" },
    );
    return true;
  }
  if (state.step === "join_url") {
    if (text === "-") {
      state.join_url = null;
    } else if (!/^https?:\/\/\S+/.test(text)) {
      await ctx.reply("Нужна ссылка вида https://… или «-», чтобы пропустить.");
      return true;
    } else {
      state.join_url = text.slice(0, 2000);
    }
    state.step = "preview";
    const kb = new InlineKeyboard()
      .text("📤 Опубликовать", "evw:publish")
      .text("💾 В черновик", "evw:draft")
      .row()
      .text("❌ Отмена", "evw:cancel");
    await ctx.reply(previewText(state), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  return false;
}

export async function onAdminEventsCallback(ctx: AppContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("evw:")) return false;
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) {
    await ctx.answerCallbackQuery({ text: "Только для админа." });
    return true;
  }
  const action = data.slice(4);
  const state = wizards.get(tgId);

  if (action === "cancel") {
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Отменено." });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      /* ignore */
    }
    return true;
  }

  if ((action === "publish" || action === "draft") && state && state.step === "preview") {
    if (!state.title || !state.starts_at) {
      await ctx.answerCallbackQuery({ text: "Не все поля заполнены." });
      return true;
    }
    const repo = ctx.state.repoEvents;
    const me = await ctx.state.repoUsers.findByTgId(tgId);
    const ev = await repo.adminCreate({
      title: state.title,
      topic: state.topic ?? null,
      starts_at: state.starts_at,
      duration_min: state.duration_min ?? 60,
      join_url: state.join_url ?? null,
      status: action === "publish" ? "published" : "draft",
      created_by_user_id: me?.id,
    });
    wizards.delete(tgId);
    if (!ev) {
      await ctx.answerCallbackQuery({ text: "Ошибка создания." });
      return true;
    }
    await ctx.answerCallbackQuery({ text: "Готово." });
    await ctx.reply(
      `✅ Эфир #${ev.id} создан со статусом <b>${ev.status}</b>.\n\n` +
        "Посмотреть и записаться: /events",
      { parse_mode: "HTML" },
    );
    return true;
  }

  await ctx.answerCallbackQuery();
  return true;
}

export async function onEventList(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const events = await ctx.state.repoEvents.listUpcoming(20);
  if (!events.length) {
    await ctx.reply("📡 Нет запланированных эфиров. Создай новый: /event_new");
    return;
  }
  const lines = events.map((ev) => {
    const when = new Date(ev.starts_at).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `#${ev.id} · <b>${ev.title}</b> · ${when} MSK · [${ev.status}]`;
  });
  await ctx.reply(
    ["📡 <b>Эфиры TRENDEX</b>", "", ...lines].join("\n"),
    { parse_mode: "HTML" },
  );
}
