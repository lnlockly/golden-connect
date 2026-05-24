import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang, t, tr } from "../../services/i18n.js";

/**
 * /help — full list of every public command, grouped by feature, with
 * a hint that buttons in /start work too. Phase 3A expanded the list
 * to cover all Phase 1 commands so users can discover them without
 * scrolling the TG hamburger.
 */
export async function onHelp(ctx: AppContext): Promise<void> {
  const user = ctx.from ? await ctx.state.repoUsers.findByTgId(ctx.from.id) : undefined;
  const lang = pickLang(user?.language_code ?? ctx.from?.language_code ?? "en");
  const dict = t(lang);

  const lines: string[] = [];
  lines.push(`<b>${tr(lang, "help.title")}</b>`);
  lines.push("");
  lines.push(tr(lang, "help.intro"));
  lines.push("");
  lines.push(tr(lang, "help.list_start"));
  lines.push(tr(lang, "help.list_app"));
  lines.push(tr(lang, "help.list_ref"));
  lines.push(tr(lang, "help.list_team"));
  lines.push(tr(lang, "help.list_events"));
  lines.push(tr(lang, "help.list_quests"));
  lines.push(tr(lang, "help.list_missions"));
  lines.push(tr(lang, "help.list_quiz"));
  lines.push(tr(lang, "help.list_top"));
  lines.push(tr(lang, "help.list_promo"));
  lines.push(tr(lang, "help.list_video"));
  lines.push(tr(lang, "help.list_stats"));
  lines.push(tr(lang, "help.list_lang"));
  lines.push(tr(lang, "help.list_help"));

  const kb = new InlineKeyboard().text(dict.btn_main_menu, "menu:main");
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}
