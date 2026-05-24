import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import type { LeadsRepo, LeadRow, LeadStatus } from "../../../db/leads.js";

/**
 * /where — echoes the current chat_id and topic message_thread_id. Admins
 * run it once per topic to grab IDs for the k8s secret / env.
 */
export async function onWhere(ctx: AppContext): Promise<void> {
  if (!isAdmin(ctx.state, ctx.from?.id)) return;
  const chatId = ctx.chat?.id;
  const threadId = ctx.message?.message_thread_id;
  const isForum = ctx.chat && "is_forum" in ctx.chat ? Boolean(ctx.chat.is_forum) : false;
  const lines = [
    "<b>Где я нахожусь:</b>",
    `<code>chat_id = ${chatId ?? "—"}</code>`,
    `<code>message_thread_id = ${threadId ?? "—"}</code>`,
    `is_forum = ${isForum}`,
  ];
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    message_thread_id: threadId,
  });
}

/**
 * Parse "2d" / "3h" / "90m" into milliseconds. Returns null for anything else.
 */
function parseDuration(raw: string): number | null {
  const m = raw.trim().match(/^(\d+)\s*([dhm])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  if (unit === "d") return n * 86_400_000;
  if (unit === "h") return n * 3_600_000;
  if (unit === "m") return n * 60_000;
  return null;
}

/**
 * Resolve the lead the admin means to act on:
 *   1. If this is a reply to the original lead card → use that message.
 *   2. Otherwise fall back to the latest lead in this topic.
 */
async function resolveLead(
  ctx: AppContext,
  repo: LeadsRepo,
): Promise<LeadRow | undefined> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return undefined;
  const replied = ctx.message?.reply_to_message;
  if (replied) {
    const hit = await repo.findByPostedMessage(chatId, replied.message_id);
    if (hit) return hit;
  }
  const threadId = ctx.message?.message_thread_id;
  if (threadId === undefined) return undefined;
  return repo.latestInThread(chatId, threadId);
}

function adminHandle(ctx: AppContext): string {
  const from = ctx.from;
  if (!from) return "—";
  if (from.username) return `@${from.username}`;
  return from.first_name ?? String(from.id);
}

export function registerLeadCommands(repo: LeadsRepo): {
  onTake: (ctx: AppContext) => Promise<void>;
  onWon: (ctx: AppContext) => Promise<void>;
  onLost: (ctx: AppContext) => Promise<void>;
  onSnooze: (ctx: AppContext) => Promise<void>;
  onLeadsList: (ctx: AppContext) => Promise<void>;
  onLeadCallback: (ctx: AppContext) => Promise<void>;
} {
  async function guard(ctx: AppContext): Promise<LeadRow | undefined> {
    if (!isAdmin(ctx.state, ctx.from?.id)) return undefined;
    const lead = await resolveLead(ctx, repo);
    if (!lead) {
      await ctx.reply(
        "Не нашёл заявку. Ответь (reply) на сообщение-карточку заявки.",
        { message_thread_id: ctx.message?.message_thread_id },
      );
      return undefined;
    }
    return lead;
  }

  async function onTake(ctx: AppContext): Promise<void> {
    const lead = await guard(ctx);
    if (!lead) return;
    await repo.markTaken(lead.id, ctx.from!.id);
    await ctx.reply(
      `✅ Заявка #${lead.id} взята: ${adminHandle(ctx)}`,
      {
        reply_parameters: { message_id: lead.posted_message_id ?? ctx.message!.message_id },
        message_thread_id: ctx.message?.message_thread_id,
      },
    );
  }

  async function onWon(ctx: AppContext): Promise<void> {
    const lead = await guard(ctx);
    if (!lead) return;
    await repo.markWon(lead.id);
    await ctx.reply(`🏆 Заявка #${lead.id} — WON`, {
      reply_parameters: { message_id: lead.posted_message_id ?? ctx.message!.message_id },
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  async function onLost(ctx: AppContext): Promise<void> {
    const lead = await guard(ctx);
    if (!lead) return;
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    if (!arg) {
      await ctx.reply("Использование: /lost <причина>", {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }
    await repo.markLost(lead.id, arg);
    await ctx.reply(`❌ Заявка #${lead.id} — LOST: ${arg}`, {
      reply_parameters: { message_id: lead.posted_message_id ?? ctx.message!.message_id },
      message_thread_id: ctx.message?.message_thread_id,
    });
  }

  async function onSnooze(ctx: AppContext): Promise<void> {
    const lead = await guard(ctx);
    if (!lead) return;
    const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
    const ms = parseDuration(arg);
    if (ms === null) {
      await ctx.reply("Использование: /snooze <N>d|h|m (например: /snooze 2d)", {
        message_thread_id: ctx.message?.message_thread_id,
      });
      return;
    }
    const until = Date.now() + ms;
    await repo.snooze(lead.id, until);
    await ctx.reply(
      `😴 Заявка #${lead.id} отложена до ${new Date(until).toISOString()}`,
      {
        reply_parameters: { message_id: lead.posted_message_id ?? ctx.message!.message_id },
        message_thread_id: ctx.message?.message_thread_id,
      },
    );
  }

  // ── /leads UI ───────────────────────────────────────────────
  const PAGE_SIZE = 8;
  type Filter = LeadStatus | "all";
  const FILTER_LABELS: Record<Filter, string> = {
    all: "Все",
    new: "🆕 Новые",
    taken: "⏳ В работе",
    snoozed: "😴 Отложены",
    won: "🏆 Выиграны",
    lost: "❌ Проиграны",
  };
  const TRACK_ICONS: Record<string, string> = {
    order: "🟢",
    operator: "🟣",
    learner: "🔵",
    investor: "🟡",
  };
  const STATUS_ICONS: Record<LeadStatus, string> = {
    new: "🆕",
    taken: "⏳",
    snoozed: "😴",
    won: "🏆",
    lost: "❌",
  };

  async function renderList(
    filter: Filter,
    page: number,
  ): Promise<{ text: string; kb: InlineKeyboard }> {
    const total = await repo.count(filter);
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), pages - 1);
    const rows = await repo.list({
      status: filter,
      offset: safePage * PAGE_SIZE,
      limit: PAGE_SIZE,
    });

    const header = `<b>Заявки · ${FILTER_LABELS[filter]}</b>\nВсего: ${total} · стр. ${safePage + 1}/${pages}\n`;
    const body = rows.length === 0
      ? "\n<i>Пусто.</i>"
      : "\n" + rows.map(formatLine).join("\n");

    const kb = new InlineKeyboard();
    // Filter row (two rows of 3 for readability).
    const filterOrder: Filter[] = ["all", "new", "taken", "snoozed", "won", "lost"];
    filterOrder.forEach((f, i) => {
      const mark = f === filter ? "· " : "";
      kb.text(`${mark}${FILTER_LABELS[f]}`, `leads:f:${f}`);
      if (i === 2) kb.row();
    });
    kb.row();

    // Per-row "Open" buttons — 2 per row.
    for (let i = 0; i < rows.length; i += 2) {
      const a = rows[i];
      const b = rows[i + 1];
      kb.text(`#${a.id} ${TRACK_ICONS[a.track] ?? ""}`, `lead:${a.id}`);
      if (b) kb.text(`#${b.id} ${TRACK_ICONS[b.track] ?? ""}`, `lead:${b.id}`);
      kb.row();
    }

    // Pagination.
    if (pages > 1) {
      if (safePage > 0) kb.text("← пред.", `leads:p:${filter}:${safePage - 1}`);
      kb.text(`${safePage + 1}/${pages}`, "leads:noop");
      if (safePage < pages - 1) kb.text("след. →", `leads:p:${filter}:${safePage + 1}`);
      kb.row();
    }
    kb.text("🔄 Обновить", `leads:p:${filter}:${safePage}`);

    return { text: header + body, kb };
  }

  function formatLine(r: LeadRow): string {
    const created = new Date(r.created_at).toISOString().slice(0, 16).replace("T", " ");
    const icon = TRACK_ICONS[r.track] ?? "•";
    const st = STATUS_ICONS[r.status];
    const contact = escapeHtml(r.contact.slice(0, 40));
    const track = escapeHtml(r.track);
    return `${st} <code>#${r.id}</code> ${icon} <b>${track}</b> · ${contact} · <i>${created}</i>`;
  }

  function formatDetail(r: LeadRow): string {
    const created = new Date(r.created_at).toISOString().replace("T", " ").slice(0, 19);
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(r.payload_json) as Record<string, unknown>; } catch { /* ignore */ }
    const task = typeof payload.task === "string" ? payload.task : "";
    const budget = payload.budget;
    const deadline = payload.deadline;
    const icon = TRACK_ICONS[r.track] ?? "•";
    const st = STATUS_ICONS[r.status];
    const lines = [
      `${st} <b>Заявка #${r.id}</b> · ${icon} ${escapeHtml(r.track)}`,
      `<b>Статус:</b> ${escapeHtml(r.status)}` +
        (r.lost_reason ? ` · <i>${escapeHtml(r.lost_reason)}</i>` : ""),
      `<b>Контакт:</b> ${escapeHtml(r.contact)}`,
      task ? `<b>Задача:</b> ${escapeHtml(task.slice(0, 800))}` : "",
      budget != null ? `<b>Бюджет:</b> $${escapeHtml(String(budget))}` : "",
      deadline ? `<b>Дедлайн:</b> ${escapeHtml(String(deadline).slice(0, 80))}` : "",
      r.lang ? `<b>Язык:</b> ${escapeHtml(r.lang)}` : "",
      r.source ? `<b>Источник:</b> ${escapeHtml(r.source)}` : "",
      `<b>Создано:</b> ${created}`,
      r.taken_by_tg_id ? `<b>Взял:</b> <code>${r.taken_by_tg_id}</code>` : "",
      r.snooze_until ? `<b>Отложено до:</b> ${new Date(r.snooze_until).toISOString().slice(0, 16)}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  }

  function detailKb(r: LeadRow): InlineKeyboard {
    const kb = new InlineKeyboard();
    if (r.status === "new" || r.status === "snoozed") kb.text("✅ Взять", `lead:${r.id}:take`);
    if (r.status !== "won") kb.text("🏆 Выиграна", `lead:${r.id}:won`);
    kb.row();
    kb.text("😴 Отложить 1д", `lead:${r.id}:sn1d`);
    kb.text("😴 3д", `lead:${r.id}:sn3d`);
    kb.row();
    kb.text("« к списку", `leads:p:all:0`);
    return kb;
  }

  const onLeadsList = async (ctx: AppContext): Promise<void> => {
    if (!isAdmin(ctx.state, ctx.from?.id)) return;
    const { text, kb } = await renderList("all", 0);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  };

  const onLeadCallback = async (ctx: AppContext): Promise<void> => {
    if (!isAdmin(ctx.state, ctx.from?.id)) {
      await ctx.answerCallbackQuery({ text: "Только для админа." });
      return;
    }
    const data = ctx.callbackQuery?.data ?? "";

    if (data === "leads:noop") { await ctx.answerCallbackQuery(); return; }

    // leads:p:<filter>:<page>  (page flip / filter change that returns to
    // page 0 is handled by always encoding both parts).
    let m = /^leads:p:([a-z]+):(\d+)$/.exec(data);
    if (m) {
      const filter = m[1] as Filter;
      const page = Number(m[2]) || 0;
      const { text, kb } = await renderList(filter, page);
      try {
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      } catch {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
      }
      await ctx.answerCallbackQuery();
      return;
    }
    m = /^leads:f:([a-z]+)$/.exec(data);
    if (m) {
      const filter = m[1] as Filter;
      const { text, kb } = await renderList(filter, 0);
      try {
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      } catch {
        await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
      }
      await ctx.answerCallbackQuery();
      return;
    }
    m = /^lead:(\d+)(?::(take|won|sn1d|sn3d))?$/.exec(data);
    if (m) {
      const id = Number(m[1]);
      const action = m[2];
      let row = await repo.findById(id);
      if (!row) {
        await ctx.answerCallbackQuery({ text: "Заявка не найдена." });
        return;
      }
      if (action === "take") {
        await repo.markTaken(id, ctx.from!.id);
      } else if (action === "won") {
        await repo.markWon(id);
      } else if (action === "sn1d") {
        await repo.snooze(id, Date.now() + 86_400_000);
      } else if (action === "sn3d") {
        await repo.snooze(id, Date.now() + 3 * 86_400_000);
      }
      row = (await repo.findById(id))!;
      try {
        await ctx.editMessageText(formatDetail(row), {
          parse_mode: "HTML",
          reply_markup: detailKb(row),
        });
      } catch {
        await ctx.reply(formatDetail(row), {
          parse_mode: "HTML",
          reply_markup: detailKb(row),
        });
      }
      await ctx.answerCallbackQuery({ text: action ? "Готово." : undefined });
      return;
    }
    await ctx.answerCallbackQuery();
  };

  return { onTake, onWon, onLost, onSnooze, onLeadsList, onLeadCallback };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
