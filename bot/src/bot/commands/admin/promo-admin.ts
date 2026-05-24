/**
 * Phase 3B — promo-templates admin: list, create wizard, delete, toggle.
 *
 * State machine kept in-memory (Map<tg_id, WizardState>) — same pattern
 * as events-admin.ts. Wizard auto-expires after 10min idle so a stuck
 * admin doesn't block the next /promo_new with stale state.
 *
 * Calls /internal/admin/promo/* via PromoRepo (shared secret).
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import { PromoRepo, type PromoTemplate } from "../../../db/promo.js";
import type { ApiClient } from "../../../api/client.js";

const WIZARD_TIMEOUT_MS = 10 * 60 * 1000;

type Step =
  | "id"
  | "category"
  | "title"
  | "default_text"
  | "image_url"
  | "hashtags"
  | "preview";

interface WizardState {
  step: Step;
  startedAt: number;
  id?: string;
  category?: string;
  title?: string;
  default_text?: string;
  image_url?: string | null;
  hashtags?: string[];
}

const wizards = new Map<number, WizardState>();
const CATEGORIES = ["referral", "event", "tariff", "generic"] as const;

function gcWizards(): void {
  const now = Date.now();
  for (const [tg, st] of wizards) {
    if (now - st.startedAt > WIZARD_TIMEOUT_MS) wizards.delete(tg);
  }
}

function getRepo(ctx: AppContext): PromoRepo {
  // PromoRepo lives behind the api client owned by the bot. We instantiate
  // per-call to avoid plumbing it through AppState (cheap — no I/O).
  const api = (ctx.state.repoUsers as unknown as { api: ApiClient }).api;
  return new PromoRepo(api);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function previewText(s: WizardState): string {
  const lines = [
    "📣 <b>Превью промо-шаблона</b>",
    "",
    `<b>ID:</b> <code>${esc(s.id ?? "—")}</code>`,
    `<b>Категория:</b> ${esc(s.category ?? "—")}`,
    `<b>Title:</b> ${esc(s.title ?? "—")}`,
    `<b>Image:</b> ${s.image_url ? esc(s.image_url) : "—"}`,
    `<b>Hashtags:</b> ${s.hashtags && s.hashtags.length ? s.hashtags.map((h) => esc(h)).join(", ") : "—"}`,
    "",
    "<b>Текст:</b>",
    esc((s.default_text ?? "").slice(0, 600)),
  ];
  return lines.join("\n");
}

export async function onPromoNew(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  gcWizards();
  wizards.set(tgId, { step: "id", startedAt: Date.now() });
  await ctx.reply(
    "📣 <b>Создаём промо-шаблон</b>\n\n" +
      "Шаг 1/6 — пришли <b>ID шаблона</b> (slug, например <code>p_my_promo</code>).\n\n" +
      "/cancel — отменить.",
    { parse_mode: "HTML" },
  );
}

export async function onPromoCancel(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  if (!wizards.has(tgId)) return false;
  wizards.delete(tgId);
  await ctx.reply("Отменено.");
  return true;
}

export async function onPromoMaybeText(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  gcWizards();
  const state = wizards.get(tgId);
  if (!state) return false;
  const text = ctx.message?.text?.trim();
  if (!text) return false;
  if (text.startsWith("/")) return false;

  if (state.step === "id") {
    if (!/^[a-z0-9_-]+$/i.test(text) || text.length > 64) {
      await ctx.reply("ID должен быть slug (a-z 0-9 _ -), до 64 символов.");
      return true;
    }
    state.id = text;
    state.step = "category";
    const kb = new InlineKeyboard();
    CATEGORIES.forEach((c, i) => {
      kb.text(c, `pwz:cat:${c}`);
      if (i % 2 === 1) kb.row();
    });
    await ctx.reply("Шаг 2/6 — <b>категория</b>:", {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  if (state.step === "title") {
    if (text.length > 200) {
      await ctx.reply("Title до 200 символов. Повтори.");
      return true;
    }
    state.title = text;
    state.step = "default_text";
    await ctx.reply(
      "Шаг 4/6 — <b>основной текст</b> шаблона (до 4000 символов):",
      { parse_mode: "HTML" },
    );
    return true;
  }

  if (state.step === "default_text") {
    if (text.length > 4000) {
      await ctx.reply("Текст до 4000 символов. Повтори.");
      return true;
    }
    state.default_text = text;
    state.step = "image_url";
    const kb = new InlineKeyboard().text("Пропустить", "pwz:skip:image");
    await ctx.reply(
      "Шаг 5/6 — <b>image URL</b> (https://…) или «Пропустить»:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (state.step === "image_url") {
    if (!/^https?:\/\/\S+/.test(text)) {
      await ctx.reply("Нужен URL вида https://… или нажми «Пропустить».");
      return true;
    }
    state.image_url = text.slice(0, 500);
    state.step = "hashtags";
    const kb = new InlineKeyboard().text("Пропустить", "pwz:skip:tags");
    await ctx.reply(
      "Шаг 6/6 — <b>хэштеги</b> через запятую (без #) или «Пропустить»:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (state.step === "hashtags") {
    state.hashtags = text
      .split(",")
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean)
      .slice(0, 30);
    state.step = "preview";
    const kb = new InlineKeyboard()
      .text("✅ Создать", "pwz:save")
      .text("❌ Отмена", "pwz:cancel");
    await ctx.reply(previewText(state), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  return false;
}

export async function onPromoCallback(ctx: AppContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("pwz:")) return false;
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) {
    await ctx.answerCallbackQuery({ text: "Только для админа." });
    return true;
  }
  const state = wizards.get(tgId);

  if (data.startsWith("pwz:cat:")) {
    if (!state || state.step !== "category") {
      await ctx.answerCallbackQuery();
      return true;
    }
    const cat = data.slice("pwz:cat:".length);
    if (!CATEGORIES.includes(cat as (typeof CATEGORIES)[number])) {
      await ctx.answerCallbackQuery({ text: "Неизвестная категория." });
      return true;
    }
    state.category = cat;
    state.step = "title";
    await ctx.answerCallbackQuery();
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ignore */ }
    await ctx.reply("Шаг 3/6 — <b>title</b> (до 200 символов):", {
      parse_mode: "HTML",
    });
    return true;
  }

  if (data === "pwz:skip:image") {
    if (!state || state.step !== "image_url") {
      await ctx.answerCallbackQuery();
      return true;
    }
    state.image_url = null;
    state.step = "hashtags";
    const kb = new InlineKeyboard().text("Пропустить", "pwz:skip:tags");
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Шаг 6/6 — <b>хэштеги</b> через запятую или «Пропустить»:",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (data === "pwz:skip:tags") {
    if (!state || state.step !== "hashtags") {
      await ctx.answerCallbackQuery();
      return true;
    }
    state.hashtags = [];
    state.step = "preview";
    const kb = new InlineKeyboard()
      .text("✅ Создать", "pwz:save")
      .text("❌ Отмена", "pwz:cancel");
    await ctx.answerCallbackQuery();
    await ctx.reply(previewText(state), {
      parse_mode: "HTML",
      reply_markup: kb,
    });
    return true;
  }

  if (data === "pwz:cancel") {
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Отменено." });
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ignore */ }
    return true;
  }

  if (data === "pwz:save") {
    if (!state || state.step !== "preview" || !state.id || !state.category || !state.title || !state.default_text) {
      await ctx.answerCallbackQuery({ text: "Не все поля заполнены." });
      return true;
    }
    const repo = getRepo(ctx);
    const out = await repo.adminCreate({
      id: state.id,
      category: state.category,
      title: state.title,
      default_text: state.default_text,
      image_url: state.image_url ?? null,
      hashtags: state.hashtags ?? null,
      active: true,
    });
    if ("error" in out) {
      await ctx.answerCallbackQuery({ text: "Ошибка." });
      await ctx.reply(`❌ Не удалось создать: ${esc(out.error)}`);
      return true;
    }
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Готово." });
    await ctx.reply(`✅ Шаблон <code>${esc(out.id)}</code> создан.`, {
      parse_mode: "HTML",
    });
    return true;
  }

  if (data.startsWith("pwz:tog:")) {
    const id = data.slice("pwz:tog:".length);
    const repo = getRepo(ctx);
    const all = await repo.adminListAll();
    const cur = all.find((t) => t.id === id);
    if (!cur) {
      await ctx.answerCallbackQuery({ text: "Не найден." });
      return true;
    }
    await repo.adminPatch(id, { active: !cur.active });
    await ctx.answerCallbackQuery({ text: !cur.active ? "Активирован." : "Деактивирован." });
    await onPromoList(ctx);
    return true;
  }

  if (data.startsWith("pwz:del:")) {
    const id = data.slice("pwz:del:".length);
    const repo = getRepo(ctx);
    const ok = await repo.adminDelete(id);
    await ctx.answerCallbackQuery({ text: ok ? "Удалено." : "Ошибка." });
    await onPromoList(ctx);
    return true;
  }

  if (data.startsWith("pwz:show:")) {
    const id = data.slice("pwz:show:".length);
    const repo = getRepo(ctx);
    const all = await repo.adminListAll();
    const t = all.find((x) => x.id === id);
    if (!t) {
      await ctx.answerCallbackQuery({ text: "Не найден." });
      return true;
    }
    await ctx.answerCallbackQuery();
    await renderTemplate(ctx, t);
    return true;
  }

  await ctx.answerCallbackQuery();
  return true;
}

async function renderTemplate(ctx: AppContext, t: PromoTemplate): Promise<void> {
  const lines = [
    `📣 <b>${esc(t.title)}</b>`,
    `<code>${esc(t.id)}</code> · <i>${esc(t.category)}</i> · ${t.active ? "✅ active" : "⛔️ inactive"}`,
    "",
    esc(t.default_text.slice(0, 800)),
    "",
    t.image_url ? `🖼 ${esc(t.image_url)}` : "",
    t.hashtags?.length ? `#${t.hashtags.join(" #")}` : "",
  ].filter(Boolean);
  const kb = new InlineKeyboard()
    .text("🔁 Toggle", `pwz:tog:${t.id}`)
    .text("🗑 Удалить", `pwz:del:${t.id}`)
    .row()
    .text("← К списку", "admin:promo");
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

export async function onPromoList(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const repo = getRepo(ctx);
  const items = await repo.adminListAll();
  const lines: string[] = [
    `📣 <b>Промо-шаблоны</b> (${items.length} шт.)`,
    "",
  ];
  if (items.length === 0) {
    lines.push("<i>Пока пусто.</i> /promo_new — создать.");
  } else {
    items.slice(0, 30).forEach((t, i) => {
      lines.push(
        `${i + 1}. <code>${esc(t.id)}</code> · <i>${esc(t.category)}</i> · ${t.active ? "✅" : "⛔️"}`,
      );
    });
    if (items.length > 30) lines.push(`…ещё ${items.length - 30}`);
  }

  const kb = new InlineKeyboard()
    .text("➕ Создать", "admin:promo_new")
    .text("🔄 Обновить", "admin:promo")
    .row();
  // Up to 8 quick "open" buttons for the first templates.
  items.slice(0, 8).forEach((t, i) => {
    kb.text(`#${i + 1}`, `pwz:show:${t.id}`);
    if ((i + 1) % 4 === 0) kb.row();
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

export async function onPromoDelCmd(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (!arg) {
    await ctx.reply("Использование: /promo_del <id>");
    return;
  }
  const repo = getRepo(ctx);
  const ok = await repo.adminDelete(arg);
  await ctx.reply(ok ? "✅ Удалено." : "❌ Не найдено.");
}
