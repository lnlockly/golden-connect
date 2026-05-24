// bot/src/bot/commands/session.ts
// "AI Sales Session" — guided cold-outreach workflow inside @TrendexCRMBot.
//
// Goal: drive the user to schedule a 15-min call with each lead.
// Flow:
//   /session  →  Bot pulls next priority lead → shows card with 4 actions:
//     ✍️ Питч        — Groq generates message, copied to clipboard via WebApp button
//     📞 Звонок      — quick date picker → creates CRM task with reminder
//     💬 ИИ-коуч    — toggles "coach mode" — user's next text msg → Groq advice
//     ⏭ Пропустить — moves to next lead
//
// State:
//   activeSessions: Map<tgId, Session> in memory.
//   Each session tracks: { queue order (via "skip" list), currentLead, mode, history }
//   Lost on bot restart (acceptable for MVP — users restart with /session).

import type { CommandContext, Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { crm, type CrmContact } from "../../services/crmApi.js";

const CRM_URL = process.env.CRM_WEBAPP_URL || "https://crm.trendex.biz/cabinet/crm-app.html";

interface Session {
  active: boolean;
  skip: string[];
  current: CrmContact | null;
  mode: "idle" | "coach";
  coachHistory: Array<{ role: "user" | "assistant"; content: string }>;
  contactedAt: number;
}

const sessions = new Map<number, Session>();

function getSession(uid: number): Session {
  let s = sessions.get(uid);
  if (!s) {
    s = { active: false, skip: [], current: null, mode: "idle", coachHistory: [], contactedAt: 0 };
    sessions.set(uid, s);
  }
  return s;
}

export function getActiveLead(uid: number): string | null {
  return sessions.get(uid)?.current?.username || null;
}

export function isCoachMode(uid: number): boolean {
  return sessions.get(uid)?.mode === "coach";
}

function fmtCard(c: CrmContact, idx: number): string {
  const icons = ["✈ TG", "📞 тел", "📱 WA", "✉ email"];
  const has = [
    c.contacts?.telegram,
    c.phone,
    c.contacts?.whatsapp,
    c.email,
  ].map((x, i) => (x ? icons[i] : null)).filter(Boolean).join("  ·  ");
  const status = c.crm?.status || "new";
  const stIcon: Record<string, string> = {
    new: "🆕", "in-progress": "🟡", callback: "🔁", closed: "✅", skip: "❌",
  };
  const lines = [
    `*Лид №${idx}* ${stIcon[status] || "🆕"} _${status}_`,
    "",
    `👤 *${c.name || c.username}*`,
    [c.company, c.city || c.country, c.country && c.city ? c.country : null]
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(" · ") || "—",
    "",
    has || "_нет контактов_",
  ];
  if (c.crm?.needs) lines.push("", `💡 _${c.crm.needs}_`);
  else if (c.description) {
    const d = c.description.replace(/\s+/g, " ").slice(0, 180);
    lines.push("", `📝 _${d}${c.description.length > 180 ? "…" : ""}_`);
  }
  lines.push("", "🎯 Цель: вывести на 15-мин созвон");
  return lines.join("\n");
}

function leadKeyboard(c: CrmContact): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text("✍️ Питч", "sess:pitch:" + c.username)
    .text("📞 Звонок", "sess:call:" + c.username)
    .row()
    .text("💬 Спросить ИИ", "sess:coach:" + c.username)
    .text("⏭ Пропустить", "sess:next");
  if (c.contacts?.telegram) {
    kb.row().url("✈ Открыть TG", c.contacts.telegram);
  }
  kb.row().text("✅ Готово, дальше", "sess:done:" + c.username).text("🛑 Стоп", "sess:end");
  return kb;
}

async function showNextLead(ctx: Context): Promise<void> {
  const uid = ctx.from!.id;
  const s = getSession(uid);
  s.active = true;
  s.mode = "idle";
  let result;
  try {
    result = await crm.nextLead(uid, s.skip);
  } catch (e) {
    await ctx.reply("⚠️ CRM недоступна: " + (e as Error).message);
    return;
  }
  if (!result.contact) {
    s.active = false;
    sessions.set(uid, s);
    await ctx.reply(
      "🎉 *Сессия завершена!*\n\n" +
        "На сегодня лиды закончились. Возвращайся завтра — каждое утро в 9:00 я подберу новых.",
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard().webApp("📋 Открыть CRM", CRM_URL),
      },
    );
    return;
  }
  s.current = result.contact;
  s.coachHistory = [];
  s.contactedAt = Date.now();
  const idx = s.skip.length + 1;
  await ctx.reply(fmtCard(result.contact, idx), {
    parse_mode: "Markdown",
    reply_markup: leadKeyboard(result.contact),
  });
}

// ─── /session command ─────────────────────────────────────────────
export async function onSession(ctx: CommandContext<Context>): Promise<void> {
  const uid = ctx.from?.id;
  if (!uid) return;
  const s = getSession(uid);
  if (s.active && s.current) {
    // Mid-session — show current lead again.
    await ctx.reply("Вернулся к текущему лиду:", { parse_mode: "Markdown" });
    await ctx.reply(fmtCard(s.current, s.skip.length + 1), {
      parse_mode: "Markdown",
      reply_markup: leadKeyboard(s.current),
    });
    return;
  }
  await ctx.reply(
    "🎯 *AI-сессия продаж*\n\n" +
      "Я подберу самых горячих лидов из базы (7322 контакта) " +
      "и помогу довести каждого до созвона.\n\n" +
      "На каждом лиде у тебя 4 кнопки:\n" +
      "• ✍️ *Питч* — сгенерю текст под лида\n" +
      "• 📞 *Звонок* — поставим время в задачи\n" +
      "• 💬 *ИИ-коуч* — спросишь как обойти возражение\n" +
      "• ⏭ *Пропустить* — следующий лид\n\n" +
      "_Поехали?_",
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard().text("🎯 Старт", "sess:start").row().webApp("📋 Открыть CRM", CRM_URL),
    },
  );
}

// ─── callback handler — dispatched from main bot for "sess:" prefix ──
export async function onSessionCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data || "";
  const uid = ctx.from?.id;
  if (!uid) { await ctx.answerCallbackQuery(); return; }
  const s = getSession(uid);

  try {
    if (data === "sess:start") {
      await ctx.answerCallbackQuery({ text: "Поехали!" });
      await showNextLead(ctx);
      return;
    }
    if (data === "sess:next") {
      if (s.current) s.skip.push(s.current.username);
      await ctx.answerCallbackQuery({ text: "⏭" });
      await showNextLead(ctx);
      return;
    }
    if (data === "sess:end") {
      s.active = false;
      s.skip = [];
      s.current = null;
      s.mode = "idle";
      await ctx.answerCallbackQuery({ text: "🛑 Стоп" });
      await ctx.reply("Сессия остановлена. Пиши `/session` чтобы продолжить.", { parse_mode: "Markdown" });
      return;
    }
    if (data.startsWith("sess:done:")) {
      const username = data.slice("sess:done:".length);
      try { await crm.setNote(uid, username, { status: "in-progress" }); } catch (_) {}
      s.skip.push(username);
      await ctx.answerCallbackQuery({ text: "✅" });
      await showNextLead(ctx);
      return;
    }
    if (data.startsWith("sess:pitch:")) {
      const username = data.slice("sess:pitch:".length);
      await ctx.answerCallbackQuery({ text: "Генерирую…" });
      await ctx.replyWithChatAction("typing");
      try {
        const text = await crm.generatePitch(uid, username);
        if (!text) {
          await ctx.reply("⚠️ Не получилось сгенерить — попробуй ещё раз.");
          return;
        }
        await crm.appendHistory(uid, username, text, "out").catch(() => {});
        const lead = s.current;
        const kb = new InlineKeyboard()
          .switchInline("📤 Поделиться в чат", text.slice(0, 250))
          .row()
          .text("🔄 Перегенерить", "sess:pitch:" + username);
        if (lead?.contacts?.telegram) {
          kb.row().url("✈ Открыть TG лида", lead.contacts.telegram);
        }
        kb.row().text("⏭ Следующий лид", "sess:next");
        await ctx.reply(
          "✨ *Питч для " + (lead?.name || username) + "*\n\n" + text +
            "\n\n_Скопируй текст ↑ и отправь лиду в TG/WA._",
          { parse_mode: "Markdown", reply_markup: kb },
        );
      } catch (e) {
        await ctx.reply("⚠️ Ошибка: " + (e as Error).message);
      }
      return;
    }
    if (data.startsWith("sess:call:")) {
      const username = data.slice("sess:call:".length);
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text("Сегодня 18:00", "sess:callat:" + username + ":today18")
        .text("Завтра 12:00", "sess:callat:" + username + ":tom12")
        .row()
        .text("Завтра 18:00", "sess:callat:" + username + ":tom18")
        .text("Через 3 дня", "sess:callat:" + username + ":d3")
        .row()
        .text("⏭ Без созвона", "sess:next");
      await ctx.reply("📞 Когда созвон с " + (s.current?.name || username) + "?", {
        reply_markup: kb,
      });
      return;
    }
    if (data.startsWith("sess:callat:")) {
      const rest = data.slice("sess:callat:".length);
      const sep = rest.lastIndexOf(":");
      const username = rest.slice(0, sep);
      const when = rest.slice(sep + 1);
      const now = new Date();
      let due = new Date();
      if (when === "today18") due.setHours(18, 0, 0, 0);
      else if (when === "tom12") { due.setDate(now.getDate() + 1); due.setHours(12, 0, 0, 0); }
      else if (when === "tom18") { due.setDate(now.getDate() + 1); due.setHours(18, 0, 0, 0); }
      else if (when === "d3") { due.setDate(now.getDate() + 3); due.setHours(12, 0, 0, 0); }
      try {
        await crm.addTask(uid, {
          username,
          title: "Созвон с " + (s.current?.name || username),
          due: due.toISOString(),
        });
        await crm.setNote(uid, username, { status: "callback" });
      } catch (e) {
        await ctx.answerCallbackQuery({ text: "Ошибка: " + (e as Error).message.slice(0, 60), show_alert: true });
        return;
      }
      await ctx.answerCallbackQuery({ text: "📞 Запланирован" });
      const stamp = due.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      await ctx.reply(
        "📞 Созвон с *" + (s.current?.name || username) + "* запланирован на *" + stamp + "*.\nЯ напомню за 30 минут.",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard().text("⏭ Следующий лид", "sess:next"),
        },
      );
      return;
    }
    if (data.startsWith("sess:coach:")) {
      const username = data.slice("sess:coach:".length);
      s.mode = "coach";
      s.coachHistory = [];
      await ctx.answerCallbackQuery({ text: "ИИ-коуч включён" });
      await ctx.reply(
        "💬 *ИИ-коуч на связи*\n\n" +
          "Спрашивай что угодно про " + (s.current?.name || username) + ":\n" +
          "• «как зайти с холодного?»\n" +
          "• «он сказал \"уже работаю с другим\" — что отвечать?»\n" +
          "• «какой первый месседж?»\n\n" +
          "Пиши прямо сюда. /next чтобы вернуться к лидам.",
        {
          parse_mode: "Markdown",
          reply_markup: new InlineKeyboard()
            .text("⏭ Следующий лид", "sess:next")
            .text("🛑 Стоп", "sess:end"),
        },
      );
      return;
    }
    await ctx.answerCallbackQuery();
  } catch (e) {
    try {
      await ctx.answerCallbackQuery({
        text: "Ошибка: " + ((e as Error).message || "").slice(0, 60),
        show_alert: true,
      });
    } catch (_) {}
  }
}

// ─── text handler: when in coach mode, route to Groq with lead context ──
export async function onSessionText(ctx: Context): Promise<boolean> {
  const uid = ctx.from?.id;
  if (!uid) return false;
  const s = sessions.get(uid);
  if (!s || s.mode !== "coach" || !s.current) return false;
  const text = ctx.message?.text || "";
  if (!text) return false;
  await ctx.replyWithChatAction("typing");
  try {
    const reply = await crm.coach(uid, text, {
      leadUsername: s.current.username,
      history: s.coachHistory,
    });
    s.coachHistory.push({ role: "user", content: text });
    s.coachHistory.push({ role: "assistant", content: reply });
    if (s.coachHistory.length > 10) s.coachHistory = s.coachHistory.slice(-10);
    await ctx.reply("🤖 " + (reply || "_(пусто)_"), {
      reply_markup: new InlineKeyboard()
        .text("⏭ Следующий лид", "sess:next")
        .text("🛑 Стоп", "sess:end"),
    });
  } catch (e) {
    await ctx.reply("⚠️ Коуч упал: " + (e as Error).message);
  }
  return true;
}
