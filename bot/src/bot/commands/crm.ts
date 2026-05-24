// bot/src/bot/commands/crm.ts
// Telegram commands that drive the cabinet CRM from inside @TrendexTGbot.
//
// Commands installed by buildBot():
//   /crm        — open WebApp at crm.trendex.biz cabinet
//   /find <q>   — quick search → inline keyboard with contact cards
//   /today      — daily batch: open leads + due tasks
//   /add        — short two-step wizard to add a manual contact
//   /pitch <u>  — AI-generated pitch text (Groq), forwardable
//   /pipeline   — funnel snapshot (lead / qualified / demo / won / lost)
//   /stats      — dashboard metrics
//
// All commands work with `ownerId = 'tg_' + ctx.from.id`. The cabinet's
// internalImpersonate middleware trusts the X-Internal-Secret header.

import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { crm, type CrmContact, type CrmSnapshot, type CrmTask } from "../../services/crmApi.js";

const CRM_URL = process.env.CRM_WEBAPP_URL || "https://trendex.biz/cabinet/crm-app.html";

function userId(ctx: CommandContext<Context> | Context): number | null {
  const id = ctx.from?.id;
  return typeof id === "number" ? id : null;
}

function fmtName(c: CrmContact): string {
  return c.name || c.username || "—";
}

function fmtSub(c: CrmContact): string {
  const parts = [c.company, c.city || c.country].filter(Boolean);
  return parts.join(" · ");
}

function fmtContacts(c: CrmContact): string {
  const ic: string[] = [];
  if (c.phone) ic.push("📞 " + c.phone);
  if (c.contacts?.telegram) ic.push("✈ " + c.contacts.telegram.replace(/^https?:\/\//, ""));
  if (c.contacts?.whatsapp) ic.push("📱 WA");
  if (c.email) ic.push("✉ " + c.email);
  return ic.join("  ");
}

function statusIcon(status?: string): string {
  return (
    { new: "🆕", "in-progress": "🟡", callback: "🔁", closed: "✅", skip: "❌" }[
      status || "new"
    ] || "🆕"
  );
}

// ─── /crm ──────────────────────────────────────────────────
export async function onCrm(ctx: CommandContext<Context>): Promise<void> {
  const kb = new InlineKeyboard()
    .webApp("📋 Открыть CRM", CRM_URL)
    .row()
    .text("📅 На сегодня", "crm:today")
    .text("📊 Воронка", "crm:pipeline")
    .row()
    .text("📈 Статистика", "crm:stats")
    .text("➕ Добавить", "crm:add");

  await ctx.reply(
    "🎯 *Trendex CRM*\n\n" +
      "База лидеров MLM (~6 700 контактов с телефоном/мессенджером).\n" +
      "Ведите воронку, ставьте задачи, отправляйте AI-питчи.\n\n" +
      "_Быстрые команды:_\n" +
      "• `/find` имя — поиск по базе\n" +
      "• `/today` — кого вести сегодня\n" +
      "• `/pitch` username — AI-текст для контакта",
    { parse_mode: "Markdown", reply_markup: kb },
  );
}

// ─── /find <q> ─────────────────────────────────────────────
export async function onFind(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  const q = (ctx.match || "").trim();
  if (!q) {
    await ctx.reply(
      "🔍 Что искать?\n\nПример: `/find Иванов`  или  `/find Greenway Москва`",
      { parse_mode: "Markdown" },
    );
    return;
  }
  let items: CrmContact[] = [];
  try {
    items = await crm.search(uid, q, 8);
  } catch (e) {
    await ctx.reply("⚠️ Поиск недоступен: " + (e as Error).message);
    return;
  }
  if (!items.length) {
    await ctx.reply(`🔍 По запросу «${q}» ничего не найдено.`);
    return;
  }
  const head = `🔍 Найдено ${items.length} из 6 700:`;
  const cards = items
    .map((c, i) => {
      const sub = fmtSub(c);
      const con = fmtContacts(c);
      return (
        `*${i + 1}. ${fmtName(c)}* ${statusIcon(c.crm?.status)}` +
        (sub ? `\n_${sub}_` : "") +
        (con ? `\n${con}` : "")
      );
    })
    .join("\n\n");
  const kb = new InlineKeyboard();
  items.slice(0, 5).forEach((c, i) => {
    kb.text(`${i + 1}. ${fmtName(c).slice(0, 18)}`, `crm:open:${c.username}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  if (items.length % 2 === 1) kb.row();
  kb.webApp("📋 Открыть в CRM", CRM_URL);
  await ctx.reply(head + "\n\n" + cards, { parse_mode: "Markdown", reply_markup: kb });
}

// ─── /today ────────────────────────────────────────────────
export async function onToday(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  let snap: CrmSnapshot;
  try {
    snap = await crm.snapshot(uid);
  } catch (e) {
    await ctx.reply("⚠️ CRM недоступна: " + (e as Error).message);
    return;
  }
  const today = (snap.today?.items || []) as CrmContact[];
  const tasks = (snap.tasksOpen || []) as CrmTask[];
  const dueToday = tasks.filter(
    (t) => !t.done && (!t.due || t.due.slice(0, 10) <= new Date().toISOString().slice(0, 10)),
  );

  const lines: string[] = ["📅 *На сегодня*"];
  if (dueToday.length) {
    lines.push("", "*🔥 Задачи (" + dueToday.length + ")*");
    dueToday.slice(0, 5).forEach((t) => {
      lines.push(`• ${t.title}${t.username ? `  → @${t.username}` : ""}`);
    });
  }
  if (today.length) {
    lines.push("", `*👥 Лиды дня (${today.length})*`);
    today.slice(0, 5).forEach((c, i) => {
      const sub = fmtSub(c);
      lines.push(`${i + 1}. ${fmtName(c)}${sub ? ` — ${sub}` : ""}`);
    });
  }
  if (!dueToday.length && !today.length) {
    lines.push("", "_Пусто. Все задачи закрыты, все лиды отработаны._");
  }
  const kb = new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL);
  if (dueToday[0]) {
    kb.row().text("✅ Закрыть задачу №1", `crm:taskdone:${dueToday[0].id}`);
    kb.text("⏰ +1 день", `crm:tasksnooze:${dueToday[0].id}`);
  }
  await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", reply_markup: kb });
}

// ─── /pitch <username> ─────────────────────────────────────
export async function onPitch(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  const username = (ctx.match || "").trim().replace(/^@/, "");
  if (!username) {
    await ctx.reply(
      "✨ Какому контакту сгенерить питч?\n\nПример: `/pitch ivan_smirnov`",
      { parse_mode: "Markdown" },
    );
    return;
  }
  await ctx.replyWithChatAction("typing");
  try {
    const text = await crm.generatePitch(uid, username);
    if (!text) {
      await ctx.reply("⚠️ Питч не сгенерирован — контакт не найден или Groq упал.");
      return;
    }
    const kb = new InlineKeyboard()
      .switchInline("📤 Поделиться", text.slice(0, 250))
      .row()
      .webApp("📋 Открыть в CRM", CRM_URL);
    await ctx.reply("✨ *Питч для @" + username + "*\n\n" + text, {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  } catch (e) {
    await ctx.reply("⚠️ Ошибка: " + (e as Error).message);
  }
}

// ─── /pipeline ─────────────────────────────────────────────
export async function onPipeline(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  let snap: CrmSnapshot;
  try {
    snap = await crm.snapshot(uid);
  } catch (e) {
    await ctx.reply("⚠️ CRM недоступна: " + (e as Error).message);
    return;
  }
  const stages = snap.pipeline?.stages || [];
  if (!stages.length) {
    await ctx.reply(
      "📊 Воронка пуста.\nДобавьте сделки в CRM — здесь будет распределение по стадиям.",
      {
        reply_markup: new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL),
      },
    );
    return;
  }
  const icons: Record<string, string> = {
    lead: "🆕",
    qualified: "✅",
    demo: "🎬",
    proposal: "📝",
    won: "🏆",
    lost: "❌",
  };
  const total = stages.reduce((a, s) => a + s.count, 0);
  const lines = ["📊 *Воронка сделок*", ""];
  for (const s of stages) {
    const ic = icons[s.stage] || "•";
    const bar = "▰".repeat(Math.round((s.count / Math.max(1, total)) * 8));
    lines.push(`${ic} *${s.stage}* — ${s.count}  ${bar}  $${s.sum || 0}`);
  }
  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL),
  });
}

// ─── /stats ────────────────────────────────────────────────
export async function onStatsCrm(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  let snap: CrmSnapshot;
  try {
    snap = await crm.snapshot(uid);
  } catch (e) {
    await ctx.reply("⚠️ CRM недоступна: " + (e as Error).message);
    return;
  }
  const d = snap.dashboard || {};
  const tasks = snap.tasksOpen || [];
  const lines = [
    "📈 *Дашборд CRM*",
    "",
    `👥 Лидов всего: *${d.total ?? "—"}*`,
    `🆕 Новых сегодня: *${d.newToday ?? 0}*`,
    `🟡 В работе: *${d.inProgress ?? 0}*`,
    `🎯 Сделок открыто: *${d.dealsOpen ?? 0}*`,
    `🏆 Сделок закрыто: *${d.dealsWon ?? 0}*`,
    `💵 Выручка: *$${d.revenue ?? 0}*`,
    `📌 Задач открыто: *${tasks.filter((t) => !t.done).length}*`,
  ];
  await ctx.reply(lines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL),
  });
}

// ─── /add (manual contact wizard) ──────────────────────────
// One-line shortcut: `/add ФИО, телефон, компания`
// Without args: deep-link to the WebApp on the +contact page.
export async function onAddContact(ctx: CommandContext<Context>): Promise<void> {
  const uid = userId(ctx);
  if (!uid) return;
  const raw = (ctx.match || "").trim();
  if (!raw) {
    const kb = new InlineKeyboard().webApp("➕ Добавить вручную", CRM_URL + "#add");
    await ctx.reply(
      "➕ *Добавить контакт*\n\n" +
        "Быстро: `/add Иван Иванов, +79991234567, Greenway`\n" +
        "_(ФИО, телефон, компания через запятую)_\n\n" +
        "Либо откройте форму:",
      { parse_mode: "Markdown", reply_markup: kb },
    );
    return;
  }
  const [name = "", phone = "", company = ""] = raw.split(",").map((s) => s.trim());
  if (!name && !phone) {
    await ctx.reply("⚠️ Минимум укажите имя или телефон.");
    return;
  }
  try {
    const c = await crm.addContact(uid, {
      name,
      phone: phone.replace(/[^\d+]/g, ""),
      company,
    });
    const kb = new InlineKeyboard()
      .text("✨ Сгенерить питч", "crm:pitch:" + c.username)
      .row()
      .webApp("📋 Открыть карточку", CRM_URL);
    await ctx.reply(
      `✅ Контакт сохранён: *${c.name || c.username}*` +
        (c.company ? `\n_${c.company}_` : "") +
        (c.phone ? `\n📞 ${c.phone}` : ""),
      { parse_mode: "Markdown", reply_markup: kb },
    );
  } catch (e) {
    await ctx.reply("⚠️ Не сохранилось: " + (e as Error).message);
  }
}

// ─── callbacks for inline buttons ──────────────────────────
export async function onCrmCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data || "";
  const uid = userId(ctx);
  if (!uid) {
    await ctx.answerCallbackQuery();
    return;
  }
  try {
    if (data === "crm:today") {
      await ctx.answerCallbackQuery();
      await onToday(ctx as CommandContext<Context>);
      return;
    }
    if (data === "crm:pipeline") {
      await ctx.answerCallbackQuery();
      await onPipeline(ctx as CommandContext<Context>);
      return;
    }
    if (data === "crm:stats") {
      await ctx.answerCallbackQuery();
      await onStatsCrm(ctx as CommandContext<Context>);
      return;
    }
    if (data === "crm:find_hint") {
      await ctx.answerCallbackQuery({ text: "Напиши: /find <имя или компания>", show_alert: false });
      return;
    }
    if (data === "crm:pitch_hint") {
      await ctx.answerCallbackQuery({ text: "Напиши: /pitch <username>", show_alert: false });
      return;
    }
    if (data === "crm:add") {
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard().webApp("➕ Открыть форму", CRM_URL + "#add");
      await ctx.reply(
        "➕ Добавить контакт — через WebApp или командой:\n`/add Имя, телефон, компания`",
        { parse_mode: "Markdown", reply_markup: kb },
      );
      return;
    }
    if (data.startsWith("crm:open:")) {
      const username = data.slice("crm:open:".length);
      const c = await crm.getContact(uid, username);
      if (!c) {
        await ctx.answerCallbackQuery({ text: "Не найдено", show_alert: false });
        return;
      }
      await ctx.answerCallbackQuery();
      const lines = [
        `👤 *${fmtName(c)}* ${statusIcon(c.crm?.status)}`,
        fmtSub(c) && `_${fmtSub(c)}_`,
        fmtContacts(c),
        c.crm?.needs && `\n💡 _${c.crm.needs}_`,
      ].filter(Boolean);
      const kb = new InlineKeyboard()
        .text("✨ Питч", "crm:pitch:" + c.username)
        .text("✅ В работе", "crm:status:" + c.username + ":in-progress")
        .row()
        .webApp("📋 Карточка", CRM_URL);
      if (c.contacts?.telegram) kb.row().url("✈ Открыть TG", c.contacts.telegram);
      await ctx.reply(lines.join("\n"), { parse_mode: "Markdown", reply_markup: kb });
      return;
    }
    if (data.startsWith("crm:pitch:")) {
      const username = data.slice("crm:pitch:".length);
      await ctx.answerCallbackQuery({ text: "Генерирую…" });
      const text = await crm.generatePitch(uid, username);
      if (!text) {
        await ctx.reply("⚠️ Питч не сгенерирован.");
        return;
      }
      const kb = new InlineKeyboard()
        .switchInline("📤 Поделиться", text.slice(0, 250))
        .row()
        .webApp("📋 Открыть CRM", CRM_URL);
      await ctx.reply("✨ *Питч для @" + username + "*\n\n" + text, {
        parse_mode: "Markdown",
        reply_markup: kb,
      });
      return;
    }
    if (data.startsWith("crm:status:")) {
      const [, , username, status] = data.split(":");
      await crm.setNote(uid, username, { status });
      await ctx.answerCallbackQuery({ text: "Статус: " + status });
      return;
    }
    if (data.startsWith("crm:taskdone:")) {
      const taskId = data.slice("crm:taskdone:".length);
      await crm.completeTask(uid, taskId);
      await ctx.answerCallbackQuery({ text: "✅ Готово" });
      return;
    }
    if (data.startsWith("crm:tasksnooze:")) {
      const taskId = data.slice("crm:tasksnooze:".length);
      await crm.snoozeTask(uid, taskId, 1);
      await ctx.answerCallbackQuery({ text: "⏰ +1 день" });
      return;
    }
    await ctx.answerCallbackQuery();
  } catch (e) {
    await ctx.answerCallbackQuery({
      text: "Ошибка: " + ((e as Error).message || "").slice(0, 60),
      show_alert: true,
    });
  }
}
