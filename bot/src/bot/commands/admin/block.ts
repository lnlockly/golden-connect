import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { pickLang, t } from "../../../services/i18n.js";

export async function onAdminBlock(ctx: AppContext): Promise<void> {
  await run(ctx, true);
}

export async function onAdminUnblock(ctx: AppContext): Promise<void> {
  await run(ctx, false);
}

async function run(ctx: AppContext, block: boolean): Promise<void> {
  const dict = t(pickLang(ctx.from?.language_code ?? "en"));
  const backKb = new InlineKeyboard().text(dict.btn_back_admin, "admin:menu");
  const arg = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const n = Number.parseInt(arg, 10);
  if (!Number.isFinite(n)) {
    await ctx.reply(`Использование: /${block ? "block" : "unblock"} <tg_id>`, {
      reply_markup: backKb,
    });
    return;
  }
  const user = await ctx.state.repoUsers.findByTgId(n);
  if (!user) {
    await ctx.reply("Пользователь не найден.", { reply_markup: backKb });
    return;
  }
  await ctx.state.repoUsers.setBlocked(n, block);
  await ctx.reply(`${block ? "Заблокирован" : "Разблокирован"} ${n}.`, {
    reply_markup: backKb,
  });
}
