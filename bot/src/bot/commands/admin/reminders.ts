import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { isAdmin } from "../../middleware.js";
import type { RemindersRepo, ReminderStepRow } from "../../../db/reminders.js";

/**
 * Admin constructor for the post-join reminder sequence.
 *
 * Layout:
 *  /reminders            → step list → click step → step detail
 *  step detail           → [✏ text] [⏱ delay] [⏸/▶ toggle] [🗑 delete] [⬅️ list]
 *  ✏ text / ⏱ delay     → set compose mode; next admin text message is parsed
 *                          per the captured field and saved
 *  [➕ add]               → compose "Nh | text" one-liner → creates new step
 */

type ComposeMode =
  | { kind: "text"; stepId: number }
  | { kind: "delay"; stepId: number }
  | { kind: "new" };

// Keyed by admin tg_id — each admin has its own compose slot so they don't
// collide with broadcasts or each other's edits.
const composing = new Map<number, ComposeMode>();

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDelay(h: number): string {
  if (h >= 24 && h % 24 === 0) return `${h / 24}д`;
  if (h >= 1) return `${h}ч`;
  return `${Math.round(h * 60)}мин`;
}

function parseDelayInput(raw: string): number | null {
  // Accept "6", "6h", "6ч", "24h", "2d", "2д", "90m", "90мин"
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+(?:[.,]\d+)?)(мин|min|m|ч|h|д|d)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "h";
  if (unit === "мин" || unit === "min" || unit === "m") return n / 60;
  if (unit === "д" || unit === "d") return n * 24;
  return n;
}

function listText(steps: ReminderStepRow[]): string {
  const lines: string[] = [];
  lines.push("<b>📨 Серия напоминаний</b>");
  const enabled = steps.filter((s) => s.enabled === 1).length;
  lines.push(`Шагов: ${steps.length} · Включено: ${enabled}`);
  lines.push("");
  if (steps.length === 0) {
    lines.push("<i>Пусто. Добавь первый шаг кнопкой ниже.</i>");
  } else {
    steps.forEach((s, i) => {
      const on = s.enabled === 1 ? "✅" : "⏸";
      const preview = s.text_ru.replace(/\s+/g, " ").slice(0, 60);
      lines.push(
        `${i + 1}. ${on} ⏱ ${fmtDelay(s.delay_hours)} · <i>${escapeHtml(preview)}…</i>`,
      );
    });
  }
  lines.push("");
  lines.push(
    "<i>Шаги идут от момента /start юзера. Если он подаёт анкету на сайте — серия отключается.</i>",
  );
  return lines.join("\n");
}

function listKeyboard(steps: ReminderStepRow[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  steps.forEach((s, i) => {
    kb.text(
      `${i + 1}. ${s.enabled ? "✅" : "⏸"} ⏱ ${fmtDelay(s.delay_hours)}`,
      `rem:view:${s.id}`,
    ).row();
  });
  kb.text("➕ Добавить шаг", "rem:new").row();
  kb.text("⬅️ Админ-меню", "admin:menu");
  return kb;
}

function detailText(step: ReminderStepRow): string {
  return [
    `<b>Шаг #${step.id}</b> · порядок ${step.order_idx}`,
    `<b>Задержка:</b> ${fmtDelay(step.delay_hours)} после /start юзера`,
    `<b>Статус:</b> ${step.enabled ? "✅ включен" : "⏸ выключен"}`,
    "",
    "<b>Текст (ru):</b>",
    escapeHtml(step.text_ru),
  ].join("\n");
}

function detailKeyboard(step: ReminderStepRow): InlineKeyboard {
  return new InlineKeyboard()
    .text("✏ Текст", `rem:edittext:${step.id}`)
    .text("⏱ Задержка", `rem:editdelay:${step.id}`)
    .row()
    .text(step.enabled ? "⏸ Выключить" : "▶ Включить", `rem:toggle:${step.id}`)
    .text("👁 Preview", `rem:preview:${step.id}`)
    .row()
    .text("🗑 Удалить", `rem:delask:${step.id}`)
    .text("⬅️ К списку", "rem:list");
}

async function showList(ctx: AppContext, repo: RemindersRepo): Promise<void> {
  const steps = await repo.listAll();
  const text = listText(steps);
  const kb = listKeyboard(steps);
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

async function showDetail(ctx: AppContext, step: ReminderStepRow): Promise<void> {
  const text = detailText(step);
  const kb = detailKeyboard(step);
  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* fall through */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}

export function registerReminderCommands(repo: RemindersRepo): {
  onList: (ctx: AppContext) => Promise<void>;
  onCallback: (ctx: AppContext) => Promise<void>;
  onAdminTextMaybeCompose: (ctx: AppContext) => Promise<boolean>;
} {
  async function onList(ctx: AppContext): Promise<void> {
    if (!isAdmin(ctx.state, ctx.from?.id)) return;
    await showList(ctx, repo);
  }

  async function onCallback(ctx: AppContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    const tgId = ctx.from?.id;
    if (!data || !tgId) return;
    if (!isAdmin(ctx.state, tgId)) {
      await ctx.answerCallbackQuery({ text: "Только для админа." });
      return;
    }

    if (data === "rem:list") {
      await ctx.answerCallbackQuery();
      await showList(ctx, repo);
      return;
    }

    if (data === "rem:new") {
      composing.set(tgId, { kind: "new" });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        "Пришли новый шаг одной строкой:\n\n" +
          "<code>&lt;задержка&gt; | &lt;текст&gt;</code>\n\n" +
          "Примеры: <code>6h | Привет…</code> · <code>2d | Последний ping…</code>",
        { parse_mode: "HTML" },
      );
      return;
    }

    const m = data.match(/^rem:(view|edittext|editdelay|toggle|preview|delask|delok):(\d+)$/);
    if (!m) {
      await ctx.answerCallbackQuery();
      return;
    }
    const action = m[1];
    const stepId = Number(m[2]);
    const step = await repo.findById(stepId);
    if (!step) {
      await ctx.answerCallbackQuery({ text: "Шаг не найден." });
      return;
    }

    if (action === "view") {
      await ctx.answerCallbackQuery();
      await showDetail(ctx, step);
      return;
    }

    if (action === "toggle") {
      await repo.toggle(stepId);
      const fresh = await repo.findById(stepId);
      await ctx.answerCallbackQuery({
        text: fresh?.enabled ? "Включено." : "Выключено.",
      });
      if (fresh) await showDetail(ctx, fresh);
      return;
    }

    if (action === "preview") {
      await ctx.answerCallbackQuery();
      await ctx.reply(step.text_ru, {
        link_preview_options: { is_disabled: true },
      });
      return;
    }

    if (action === "delask") {
      await ctx.answerCallbackQuery();
      const kb = new InlineKeyboard()
        .text("✅ Да, удалить", `rem:delok:${stepId}`)
        .text("❌ Отмена", `rem:view:${stepId}`);
      await ctx.reply(`Удалить шаг #${stepId}?`, { reply_markup: kb });
      return;
    }

    if (action === "delok") {
      await repo.remove(stepId);
      await ctx.answerCallbackQuery({ text: "Удалено." });
      await showList(ctx, repo);
      return;
    }

    if (action === "edittext") {
      composing.set(tgId, { kind: "text", stepId });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `Пришли новый текст для шага #${stepId}. Следующее сообщение станет новым текстом.`,
      );
      return;
    }

    if (action === "editdelay") {
      composing.set(tgId, { kind: "delay", stepId });
      await ctx.answerCallbackQuery();
      await ctx.reply(
        `Пришли новую задержку для шага #${stepId}. ` +
          "Форматы: <code>6h</code>, <code>24h</code>, <code>2d</code>, <code>90m</code>.",
        { parse_mode: "HTML" },
      );
      return;
    }

    await ctx.answerCallbackQuery();
  }

  /**
   * Called from the admin message-text handler. Returns true if this
   * message was consumed as a compose answer.
   */
  async function onAdminTextMaybeCompose(ctx: AppContext): Promise<boolean> {
    const tgId = ctx.from?.id;
    if (!tgId || !isAdmin(ctx.state, tgId)) return false;
    const mode = composing.get(tgId);
    if (!mode) return false;
    const text = ctx.message?.text;
    if (!text) return false;
    if (text.startsWith("/")) {
      // Let the command through.
      composing.delete(tgId);
      return false;
    }

    if (mode.kind === "text") {
      await repo.setText(mode.stepId, "ru", text);
      composing.delete(tgId);
      const step = await repo.findById(mode.stepId);
      await ctx.reply(`✅ Текст шага #${mode.stepId} обновлён.`);
      if (step) await showDetail(ctx, step);
      return true;
    }

    if (mode.kind === "delay") {
      const hours = parseDelayInput(text);
      if (hours === null) {
        await ctx.reply("Не распарсил. Попробуй <code>6h</code> / <code>2d</code> / <code>90m</code>.", {
          parse_mode: "HTML",
        });
        return true;
      }
      await repo.setDelay(mode.stepId, hours);
      composing.delete(tgId);
      const step = await repo.findById(mode.stepId);
      await ctx.reply(`✅ Задержка шага #${mode.stepId} → ${fmtDelay(hours)}.`);
      if (step) await showDetail(ctx, step);
      return true;
    }

    if (mode.kind === "new") {
      const parts = text.split("|");
      if (parts.length < 2) {
        await ctx.reply(
          "Формат: <code>&lt;задержка&gt; | &lt;текст&gt;</code>. Попробуй ещё раз.",
          { parse_mode: "HTML" },
        );
        return true;
      }
      const hours = parseDelayInput(parts[0]);
      const body = parts.slice(1).join("|").trim();
      if (hours === null || body.length === 0) {
        await ctx.reply("Плохие значения. Задержка например <code>6h</code>, текст не пустой.", {
          parse_mode: "HTML",
        });
        return true;
      }
      const step = await repo.create({
        order_idx: await repo.nextOrderIdx(),
        delay_hours: hours,
        text_ru: body,
      });
      composing.delete(tgId);
      await ctx.reply(`✅ Шаг #${step.id} добавлен.`);
      await showDetail(ctx, step);
      return true;
    }

    return false;
  }

  return { onList, onCallback, onAdminTextMaybeCompose };
}
