import type { AppContext } from "./middleware.js";
import { isAdmin } from "./middleware.js";
import { buildInviteLink, buildWebsiteLink } from "../services/refcode.js";
import { onStats } from "./commands/stats.js";
import { buildStartMessage, inviterDisplayFor } from "./commands/start.js";
import { onPresentationSkip } from "./commands/presentation.js";
import { onAdminMenu, onAdminDashboardRefresh } from "./commands/admin/dashboard.js";
import { onAdminUsers } from "./commands/admin/users.js";
import { onAdminExport } from "./commands/admin/export.js";
import { onAdminPayments } from "./commands/admin/payments.js";
import { t, pickLang } from "../services/i18n.js";
import type { Lang } from "../types.js";

const LANGS: ReadonlySet<Lang> = new Set<Lang>(["en", "ru", "zh", "uz", "fil", "th"]);
function isLang(v: string): v is Lang {
  return (LANGS as ReadonlySet<string>).has(v);
}

async function assertAdmin(ctx: AppContext): Promise<boolean> {
  if (!isAdmin(ctx.state, ctx.from?.id)) {
    await ctx.answerCallbackQuery({ text: "Только для админа." });
    return false;
  }
  return true;
}

export async function onCallback(ctx: AppContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  const from = ctx.from;
  if (!from) return;

  if (data === "stats") {
    await ctx.answerCallbackQuery();
    await onStats(ctx);
    return;
  }

  if (data === "pres:skip") {
    await onPresentationSkip(ctx);
    return;
  }

  if (data === "refnotif:off") {
    await ctx.state.repoUsers.setRefNotifications(from.id, false);
    const lang = pickLang(from.language_code ?? "en");
    await ctx.answerCallbackQuery({ text: t(lang).notif_disabled_toast });
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: undefined });
    } catch {
      /* message too old — ignore */
    }
    return;
  }

  if (data === "cabinet:notif_off" || data === "cabinet:notif_on") {
    const turnOff = data === "cabinet:notif_off";
    await ctx.state.repoUsers.setRefNotifications(from.id, !turnOff);
    await ctx.answerCallbackQuery({
      text: turnOff
        ? t(pickLang(from.language_code ?? "en")).notif_disabled_toast
        : "✅",
    });
    // Re-render the cabinet in place so the button label flips.
    await onStats(ctx);
    return;
  }

  if (data === "copy_link" || data === "copy_web_link") {
    const user = await ctx.state.repoUsers.findByTgId(from.id);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Сначала /start." });
      return;
    }
    const link =
      data === "copy_web_link"
        ? buildWebsiteLink(ctx.state.websiteUrl, user.ref_code)
        : buildInviteLink(ctx.state.botUsername, user.ref_code);
    await ctx.answerCallbackQuery();
    await ctx.reply(link, {
      entities: [{ type: "code", offset: 0, length: link.length }],
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  if (data === "admin:open" || data === "admin:dash" || data === "admin:menu") {
    if (!(await assertAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    if (data === "admin:open") {
      await onAdminMenu(ctx);
    } else {
      await onAdminDashboardRefresh(ctx);
    }
    return;
  }

  if (data === "admin:users") {
    if (!(await assertAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await onAdminUsers(ctx);
    return;
  }

  if (data === "admin:export") {
    if (!(await assertAdmin(ctx))) return;
    await ctx.answerCallbackQuery({ text: "Экспорт…" });
    await onAdminExport(ctx);
    return;
  }

  if (data === "admin:payments") {
    if (!(await assertAdmin(ctx))) return;
    await ctx.answerCallbackQuery();
    await onAdminPayments(ctx);
    return;
  }

  if (data === "menu:main") {
    const user = await ctx.state.repoUsers.findByTgId(from.id);
    if (!user) {
      await ctx.answerCallbackQuery({ text: "Сначала /start." });
      return;
    }
    const lang = pickLang(user.language_code);
    const inviterDisplay = await inviterDisplayFor(ctx, user, lang);
    const { text, entities, kb } = buildStartMessage(ctx, user, inviterDisplay, lang);
    await ctx.answerCallbackQuery();
    try {
      await ctx.editMessageText(text, {
        reply_markup: kb,
        entities,
        link_preview_options: { is_disabled: true },
      });
    } catch {
      await ctx.reply(text, {
        reply_markup: kb,
        entities,
        link_preview_options: { is_disabled: true },
      });
    }
    return;
  }

  if (data.startsWith("lang:")) {
    const lang = data.slice(5);
    if (!isLang(lang)) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.state.repoUsers.setLanguage(from.id, lang);
    const user = await ctx.state.repoUsers.findByTgId(from.id);
    if (!user) {
      await ctx.answerCallbackQuery();
      return;
    }
    const inviterDisplay = await inviterDisplayFor(ctx, user, lang);
    const { text, entities, kb } = buildStartMessage(ctx, user, inviterDisplay, lang);
    try {
      await ctx.editMessageText(text, {
        reply_markup: kb,
        entities,
        link_preview_options: { is_disabled: true },
      });
    } catch {
      /* message too old or identical — ignore */
    }
    await ctx.answerCallbackQuery({ text: t(lang).lang_set(lang) });
    return;
  }

  if (data.startsWith("users:")) {
    return;
  }

  if (data.startsWith("bcast:")) {
    return;
  }

  await ctx.answerCallbackQuery({ text: t(pickLang(from.language_code ?? "en")).unknown_cmd });
}
