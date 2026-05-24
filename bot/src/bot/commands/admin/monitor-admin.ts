/**
 * Phase 3B — monitored-chats admin: list, add wizard, delete.
 *
 * Wizard flow:
 *   1. chat_id (negative number for groups, e.g. -1001234567890)
 *   2. tracking type (members / activity / all) via inline-buttons
 *   3. confirm
 *
 * Bot can't auto-detect chat_id from a forward without a separate
 * forward-listener (simpler: the admin pastes the id manually). This is
 * good enough for Phase 3B; a forward-handler can come later.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import { MonitorRepo } from "../../../db/monitor.js";
import type { ApiClient } from "../../../api/client.js";

const WIZARD_TIMEOUT_MS = 10 * 60 * 1000;

type Step = "chat_id" | "tracking" | "confirm";
type Tracking = "members" | "activity" | "all";

interface WizardState {
  step: Step;
  startedAt: number;
  chat_id?: number;
  chat_title?: string | null;
  tracking?: Tracking;
}

const wizards = new Map<number, WizardState>();

function gcWizards(): void {
  const now = Date.now();
  for (const [tg, st] of wizards) {
    if (now - st.startedAt > WIZARD_TIMEOUT_MS) wizards.delete(tg);
  }
}

function getRepo(ctx: AppContext): MonitorRepo {
  const api = (ctx.state.repoUsers as unknown as { api: ApiClient }).api;
  return new MonitorRepo(api);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function onMonitorAdd(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  gcWizards();
  wizards.set(tgId, { step: "chat_id", startedAt: Date.now() });
  await ctx.reply(
    "📡 <b>Добавляем чат в мониторинг</b>\n\n" +
      "Шаг 1/3 — пришли <b>chat_id</b> (например <code>-1001234567890</code>).\n\n" +
      "Подсказка: запусти /where в нужном чате — бот выдаст id.\n\n" +
      "/cancel — отменить.",
    { parse_mode: "HTML" },
  );
}

export async function onMonitorCancel(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  if (!wizards.has(tgId)) return false;
  wizards.delete(tgId);
  await ctx.reply("Отменено.");
  return true;
}

export async function onMonitorMaybeText(ctx: AppContext): Promise<boolean> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return false;
  gcWizards();
  const state = wizards.get(tgId);
  if (!state) return false;
  const text = ctx.message?.text?.trim();
  if (!text) return false;
  if (text.startsWith("/")) return false;

  if (state.step === "chat_id") {
    const id = Number(text);
    if (!Number.isFinite(id) || !Number.isInteger(id)) {
      await ctx.reply("Нужен integer chat_id (например -1001234567890).");
      return true;
    }
    state.chat_id = id;
    state.step = "tracking";
    const kb = new InlineKeyboard()
      .text("members only", "mwz:tr:members")
      .text("activity only", "mwz:tr:activity")
      .row()
      .text("all events", "mwz:tr:all");
    await ctx.reply(
      "Шаг 2/3 — что трекать?\n\n" +
        "<b>members</b> — join/leave/ban\n" +
        "<b>activity</b> — только сообщения\n" +
        "<b>all</b> — всё",
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  return false;
}

export async function onMonitorCallback(ctx: AppContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("mwz:")) return false;
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) {
    await ctx.answerCallbackQuery({ text: "Только для админа." });
    return true;
  }
  const state = wizards.get(tgId);

  if (data.startsWith("mwz:tr:")) {
    if (!state || state.step !== "tracking") {
      await ctx.answerCallbackQuery();
      return true;
    }
    const tr = data.slice("mwz:tr:".length) as Tracking;
    if (!["members", "activity", "all"].includes(tr)) {
      await ctx.answerCallbackQuery({ text: "Bad tracking." });
      return true;
    }
    state.tracking = tr;
    state.step = "confirm";
    const kb = new InlineKeyboard()
      .text("✅ Подтвердить", "mwz:save")
      .text("❌ Отмена", "mwz:cancel");
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `Подключаем chat <code>${state.chat_id}</code> с tracking=<b>${tr}</b>?`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return true;
  }

  if (data === "mwz:cancel") {
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Отменено." });
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch { /* ignore */ }
    return true;
  }

  if (data === "mwz:save") {
    if (!state || state.step !== "confirm" || state.chat_id === undefined || !state.tracking) {
      await ctx.answerCallbackQuery({ text: "Не все поля." });
      return true;
    }
    const repo = getRepo(ctx);
    const out = await repo.add({
      chat_id: state.chat_id,
      tracking: state.tracking,
    });
    if ("error" in out) {
      await ctx.answerCallbackQuery({ text: "Ошибка." });
      await ctx.reply(`❌ ${esc(out.error)}`);
      return true;
    }
    wizards.delete(tgId);
    await ctx.answerCallbackQuery({ text: "Готово." });
    await ctx.reply(
      `✅ Чат <code>${out.chat_id}</code> подключён (tracking=${out.tracking}).`,
      { parse_mode: "HTML" },
    );
    return true;
  }

  if (data.startsWith("mwz:del:")) {
    const id = Number(data.slice("mwz:del:".length));
    if (!Number.isFinite(id)) {
      await ctx.answerCallbackQuery({ text: "Bad id." });
      return true;
    }
    const repo = getRepo(ctx);
    const ok = await repo.del(id);
    await ctx.answerCallbackQuery({ text: ok ? "Отключено." : "Ошибка." });
    await onMonitorList(ctx);
    return true;
  }

  await ctx.answerCallbackQuery();
  return true;
}

export async function onMonitorList(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const repo = getRepo(ctx);
  const items = await repo.list();
  const active = items.filter((c) => c.active);
  const lines: string[] = [
    `📡 <b>Мониторинг чатов</b> (${active.length} активных, всего ${items.length})`,
    "",
  ];
  if (items.length === 0) {
    lines.push("<i>Пока пусто.</i> /monitor_add — подключить.");
  } else {
    items.slice(0, 30).forEach((c, i) => {
      const title = c.chat_title ? esc(c.chat_title) : "—";
      lines.push(
        `${i + 1}. <code>${c.chat_id}</code> · ${title} · ${esc(c.tracking)} · ${c.active ? "✅" : "⛔️"}`,
      );
    });
  }

  const kb = new InlineKeyboard()
    .text("➕ Подключить", "admin:monitor_add")
    .text("🔄 Обновить", "admin:monitor")
    .row();
  active.slice(0, 6).forEach((c, i) => {
    kb.text(`🗑 #${i + 1}`, `mwz:del:${c.chat_id}`);
    if ((i + 1) % 3 === 0) kb.row();
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

export async function onMonitorDelCmd(ctx: AppContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId || !isAdmin(ctx.state, tgId)) return;
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const id = Number(arg);
  if (!Number.isFinite(id)) {
    await ctx.reply("Использование: /monitor_del <chat_id>");
    return;
  }
  const repo = getRepo(ctx);
  const ok = await repo.del(id);
  await ctx.reply(ok ? "✅ Отключено." : "❌ Не найдено.");
}
