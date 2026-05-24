/**
 * Phase 3B — video-library admin: list, create wizard, delete.
 *
 * In-memory state machine, same pattern as promo-admin / events-admin.
 * Wizard flow: title → url → thumbnail (opt) → tags (opt) → publish y/n
 * → preview/confirm.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import { VideosRepo, type VideoRow } from "../../../db/videos.js";
import type { ApiClient } from "../../../api/client.js";

const WIZARD_TIMEOUT_MS = 10 * 60 * 1000;

type Step = "title" | "url" | "thumbnail" | "tags" | "publish" | "preview";

interface WizardState {
  step: Step;
  startedAt: number;
  title?: string;
  url?: string;
  thumbnail_url?: string | null;
  tags?: string[];
  is_published?: boolean;
}

const wizards = new Map<number, WizardState>();

function gcWizards(): void {
  const now = Date.now();
  for (const [tg, st] of wizards) {
    if (now - st.startedAt > WIZARD_TIMEOUT_MS) wizards.delete(tg);
  }
}

function getRepo(ctx: AppContext): VideosRepo {
  const api = (ctx.state.repoUsers as unknown as { api: ApiClient }).api;
  return new VideosRepo(api);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function previewText(s: WizardState): string {
  return [
    "🎥 <b>Превью видео</b>",
    "",
    `<b>Title:</b> ${esc(s.title ?? "—")}`,
    `<b>URL:</b> ${esc(s.url ?? "—")}`,
    `<b>Thumbnail:</b> ${s.thumbnail_url ? esc(s.thumbnail_url) : "—"}`,
    `<b>Tags:</b> ${s.tags?.length ? s.tags.map((t) => esc(t)).join(", ") : "—"}`,
    `<b>Publish:</b> ${s.is_published ? "yes" : "no"}`,
  ].join("\n");
}

export async function onVideoNew(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  gcWizards();
  wizards.set(tgId, { step: "title", startedAt: Date.now() });
  await ctx.reply(
    "🎥 <b>Добавляем видео</b>\n\n" +
      "Шаг 1/5 — пришли <b>title</b> (до 200 символов).\n\n" +
      "/cancel — отменить.",
    { parse_mode: "HTML" },
  );
}

export async function onVideoCancel(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  if (!wizards.has(tgId)) return false;
  wizards.delete(tgId);
  await ctx.reply("Отменено.");
  return true;
}

export async function onVideoMaybeText(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  gcWizards();
  const state = wizards.get(tgId);
  if (!state) return false;
  const text = ctx.message?.text?.trim();
  if (!text) return false;
  if (text.startsWith("/")) return false;

  if (state.step === "title") {
    if (text.length > 200) {
      await ctx.reply("Title до 200 символов.");
      return true;
    }
    state.title = text;
    state.step = "url";
    await ctx.reply(
      "Шаг 2/5 — <b>URL видео</b> (YouTube / Telegram / прямой mp4):",
      { parse_mode: "HTML" },
    );
    return true;
  }

  if (state.step === "url") {
    if (!/^https?:\/\/\S+/.test(text) || text.length > 500) {
      await ctx.reply("Нужен URL вида https://… до 500 символов.");
      return true;
    }
    state.url = text;
    state.step = "thumbnail";
    const kb = new InlineKeyboard().text("Пропустить", "vwz:skip:thumb");
    await ctx.reply(
      "Шаг 3/5 — <b>thumbnail URL</b> или «Пропустить»:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (state.step === "thumbnail") {
    if (!/^https?:\/\/\S+/.test(text) || text.length > 500) {
      await ctx.reply("Нужен URL или «Пропустить».");
      return true;
    }
    state.thumbnail_url = text;
    state.step = "tags";
    const kb = new InlineKeyboard().text("Пропустить", "vwz:skip:tags");
    await ctx.reply(
      "Шаг 4/5 — <b>tags</b> через запятую или «Пропустить»:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (state.step === "tags") {
    state.tags = text.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 30);
    state.step = "publish";
    const kb = new InlineKeyboard()
      .text("Да", "vwz:pub:yes").text("Нет", "vwz:pub:no");
    await ctx.reply("Шаг 5/5 — <b>опубликовать сразу?</b>", {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  return false;
}

export async function onVideoCallback(ctx: AppContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("vwz:")) return false;
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) {
    await ctx.answerCallbackQuery({ text: "Только для админа." });
    return true;
  }
  const state = wizards.get(tgId);

  if (data === "vwz:skip:thumb") {
    if (!state || state.step !== "thumbnail") {
      await ctx.answerCallbackQuery();
      return true;
    }
    state.thumbnail_url = null;
    state.step = "tags";
    const kb = new InlineKeyboard().text("Пропустить", "vwz:skip:tags");
    await ctx.answerCallbackQuery();
    await ctx.reply("Шаг 4/5 — <b>tags</b> через запятую или «Пропустить»:", {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  if (data === "vwz:skip:tags") {
    if (!state || state.step !== "tags") {
      await ctx.answerCallbackQuery();
      return true;
    }
    state.tags = [];
    state.step = "publish";
    const kb = new InlineKeyboard()
      .text("Да", "vwz:pub:yes").text("Нет", "vwz:pub:no");
    await ctx.answerCallbackQuery();
    await ctx.reply("Шаг 5/5 — <b>опубликовать сразу?</b>", {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  if (data === "vwz:pub:yes" || data === "vwz:pub:no") {
    if (!state || state.step !== "publish") {
      await ctx.answerCallbackQuery();
      return true;
    }
    state.is_published = data === "vwz:pub:yes";
    state.step = "preview";
    const kb = new InlineKeyboard()
      .text("✅ Сохранить", "vwz:save")
      .text("❌ Отмена", "vwz:cancel");
    await ctx.answerCallbackQuery();
    await ctx.reply(previewText(state), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  if (data === "vwz:cancel") {
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Отменено." });
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ignore */ }
    return true;
  }

  if (data === "vwz:save") {
    if (!state || state.step !== "preview" || !state.title || !state.url) {
      await ctx.answerCallbackQuery({ text: "Не все поля заполнены." });
      return true;
    }
    const repo = getRepo(ctx);
    const out = await repo.adminCreate({
      title: state.title,
      url: state.url,
      thumbnail_url: state.thumbnail_url ?? null,
      tags: state.tags ?? null,
      is_published: state.is_published ?? false,
    });
    if ("error" in out) {
      await ctx.answerCallbackQuery({ text: "Ошибка." });
      await ctx.reply(`❌ Не удалось создать: ${esc(out.error)}`);
      return true;
    }
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Готово." });
    await ctx.reply(`✅ Видео #${out.id} создано.`);
    return true;
  }

  if (data.startsWith("vwz:del:")) {
    const id = Number(data.slice("vwz:del:".length));
    if (!Number.isFinite(id)) {
      await ctx.answerCallbackQuery({ text: "Bad id." });
      return true;
    }
    const repo = getRepo(ctx);
    const ok = await repo.adminDelete(id);
    await ctx.answerCallbackQuery({ text: ok ? "Удалено." : "Ошибка." });
    await onVideoList(ctx);
    return true;
  }

  if (data.startsWith("vwz:tog:")) {
    const id = Number(data.slice("vwz:tog:".length));
    if (!Number.isFinite(id)) {
      await ctx.answerCallbackQuery({ text: "Bad id." });
      return true;
    }
    const repo = getRepo(ctx);
    const all = await repo.adminListAll();
    const cur = all.find((v) => v.id === id);
    if (!cur) {
      await ctx.answerCallbackQuery({ text: "Не найден." });
      return true;
    }
    await repo.adminPatch(id, { is_published: !cur.is_published });
    await ctx.answerCallbackQuery({ text: !cur.is_published ? "Опубликован." : "Снят с публикации." });
    await onVideoList(ctx);
    return true;
  }

  await ctx.answerCallbackQuery();
  return true;
}

export async function onVideoList(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const repo = getRepo(ctx);
  const items = await repo.adminListAll();
  const lines: string[] = [
    `🎥 <b>Видео-библиотека</b> (${items.length} шт.)`,
    "",
  ];
  if (items.length === 0) {
    lines.push("<i>Пока пусто.</i> /video_new — добавить.");
  } else {
    items.slice(0, 30).forEach((v: VideoRow, i) => {
      lines.push(
        `${i + 1}. <b>${esc(v.title)}</b> · #${v.id} · ${v.is_published ? "✅" : "⛔️"}`,
      );
    });
    if (items.length > 30) lines.push(`…ещё ${items.length - 30}`);
  }

  const kb = new InlineKeyboard()
    .text("➕ Создать", "admin:video_new")
    .text("🔄 Обновить", "admin:video")
    .row();
  items.slice(0, 6).forEach((v, i) => {
    kb.text(`🔁 #${i + 1}`, `vwz:tog:${v.id}`);
    kb.text(`🗑 #${i + 1}`, `vwz:del:${v.id}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (items.length > 0) kb.row();
  kb.text("← В админку", "admin:menu");

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(lines.join("\n"), {
        parse_mode: "HTML",
        reply_markup: kb,
      });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

export async function onVideoDelCmd(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const id = Number(arg);
  if (!Number.isFinite(id) || id <= 0) {
    await ctx.reply("Использование: /video_del <id>");
    return;
  }
  const repo = getRepo(ctx);
  const ok = await repo.adminDelete(id);
  await ctx.reply(ok ? "✅ Удалено." : "❌ Не найдено.");
}
