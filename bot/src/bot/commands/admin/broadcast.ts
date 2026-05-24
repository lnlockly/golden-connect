import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import type { Broadcaster, BroadcastJob } from "../../../services/broadcaster.js";
import type { BroadcastsRepo } from "../../../db/users.js";

/**
 * Admin broadcast composer. Accepts either:
 *   • text message   → text broadcast
 *   • photo+caption  → photo broadcast
 *
 * Trailing lines matching `[Label | https://url]` are pulled out and
 * rendered as URL inline-keyboard buttons (up to 10, one per row).
 */
interface DraftButton { text: string; url: string; }
interface Draft {
  kind: "text" | "photo";
  body: string;         // caption for photo, text for text
  photoFileId?: string;
  buttons: DraftButton[];
  createdAt: number;
}
const drafts = new Map<number, Draft>();
const composing = new Set<number>();

const BUTTON_RE = /^\s*\[\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\]\s*$/;
const MAX_BUTTONS = 10;

function splitButtons(src: string): { body: string; buttons: DraftButton[] } {
  const lines = src.split("\n");
  const buttons: DraftButton[] = [];
  const bodyLines: string[] = [];
  for (const ln of lines) {
    const m = BUTTON_RE.exec(ln);
    if (m && buttons.length < MAX_BUTTONS) {
      buttons.push({ text: m[1]!, url: m[2]! });
    } else {
      bodyLines.push(ln);
    }
  }
  return { body: bodyLines.join("\n").trim(), buttons };
}

function buildKb(buttons: DraftButton[]): InlineKeyboard | undefined {
  if (buttons.length === 0) return undefined;
  const kb = new InlineKeyboard();
  buttons.forEach((b, i) => {
    kb.url(b.text, b.url);
    if (i < buttons.length - 1) kb.row();
  });
  return kb;
}

function draftPreviewCaption(d: Draft): string {
  const btnSummary =
    d.buttons.length > 0
      ? `\n\n_Кнопки:_ ${d.buttons.map((b) => `[${b.text}](${b.url})`).join(", ")}`
      : "";
  return `*Превью* (${d.kind === "photo" ? "фото" : "текст"}):\n\n${d.body || "_пусто_"}${btnSummary}`;
}

export function registerBroadcast(
  opts: {
    broadcaster: Broadcaster;
    broadcastsRepo: BroadcastsRepo;
    adminTgIds: ReadonlySet<number>;
  },
): {
  onBroadcastCmd: (ctx: AppContext) => Promise<void>;
  onAdminTextMaybeDraft: (ctx: AppContext) => Promise<boolean>;
  onAdminPhotoMaybeDraft: (ctx: AppContext) => Promise<boolean>;
  onBroadcastCallback: (ctx: AppContext) => Promise<void>;
} {
  function isAdmin(tgId: number | undefined): tgId is number {
    return tgId !== undefined && opts.adminTgIds.has(tgId);
  }

  async function onBroadcastCmd(ctx: AppContext): Promise<void> {
    const tgId = ctx.from?.id;
    if (!isAdmin(tgId)) return;
    composing.add(tgId);
    drafts.delete(tgId);
    await ctx.reply(
      [
        "Пришли рассылку: *текст* или *фото c подписью*.",
        "",
        "Кнопки (по желанию) — последние строки в формате:",
        "`[Текст кнопки | https://ссылка]`",
        "",
        "До 10 кнопок. Покажу превью с Подтвердить / Отмена.",
      ].join("\n"),
      { parse_mode: "Markdown" },
    );
  }

  async function showPreview(ctx: AppContext, draft: Draft): Promise<void> {
    const kb = new InlineKeyboard()
      .text("✅ Подтвердить", "bcast:confirm")
      .text("❌ Отмена", "bcast:cancel");
    await ctx.reply(draftPreviewCaption(draft), {
      parse_mode: "Markdown",
      reply_markup: kb,
    });
  }

  async function onAdminTextMaybeDraft(ctx: AppContext): Promise<boolean> {
    const tgId = ctx.from?.id;
    if (!isAdmin(tgId)) return false;
    if (!composing.has(tgId)) return false;
    const text = ctx.message?.text;
    if (!text) return false;
    if (text.startsWith("/")) return false;

    const { body, buttons } = splitButtons(text);
    composing.delete(tgId);
    const draft: Draft = { kind: "text", body, buttons, createdAt: Date.now() };
    drafts.set(tgId, draft);
    await showPreview(ctx, draft);
    return true;
  }

  async function onAdminPhotoMaybeDraft(ctx: AppContext): Promise<boolean> {
    const tgId = ctx.from?.id;
    if (!isAdmin(tgId)) return false;
    if (!composing.has(tgId)) return false;
    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return false;

    // Telegram sends multiple sizes; the last is the largest.
    const largest = photos[photos.length - 1]!;
    const caption = ctx.message?.caption ?? "";
    const { body, buttons } = splitButtons(caption);

    composing.delete(tgId);
    const draft: Draft = {
      kind: "photo",
      body,
      photoFileId: largest.file_id,
      buttons,
      createdAt: Date.now(),
    };
    drafts.set(tgId, draft);
    await showPreview(ctx, draft);
    return true;
  }

  async function onBroadcastCallback(ctx: AppContext): Promise<void> {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("bcast:")) return;
    const tgId = ctx.from?.id;
    if (!isAdmin(tgId)) {
      await ctx.answerCallbackQuery({ text: "Только для админа." });
      return;
    }
    const action = data.slice(6);
    const draft = drafts.get(tgId);

    if (action === "cancel") {
      drafts.delete(tgId);
      await ctx.answerCallbackQuery({ text: "Отменено." });
      try {
        await ctx.editMessageReplyMarkup({ reply_markup: undefined });
      } catch {
        /* ignore */
      }
      return;
    }

    if (action === "confirm") {
      if (!draft) {
        await ctx.answerCallbackQuery({ text: "Нет черновика." });
        return;
      }
      drafts.delete(tgId);
      // Persist the body as the DB row; photo/buttons are runtime-only.
      const id = await opts.broadcastsRepo.create(tgId, draft.body);
      const job: BroadcastJob = {
        broadcastId: id,
        kind: draft.kind,
        body: draft.body,
        photoFileId: draft.photoFileId,
        buttons: draft.buttons,
        replyMarkup: buildKb(draft.buttons),
        onDone: (sent, failed) => {
          ctx.api
            .sendMessage(
              tgId,
              `Рассылка #${id} завершена. Отправлено ${sent}, ошибок ${failed}.`,
            )
            .catch(() => {
              /* ignore */
            });
        },
      };
      opts.broadcaster.enqueue(job);
      await ctx.answerCallbackQuery({ text: "В очереди." });
      await ctx.reply(`Рассылка #${id} в очереди.`);
      return;
    }

    await ctx.answerCallbackQuery();
  }

  return { onBroadcastCmd, onAdminTextMaybeDraft, onAdminPhotoMaybeDraft, onBroadcastCallback };
}
