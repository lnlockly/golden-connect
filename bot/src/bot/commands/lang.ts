import type { AppContext } from "../middleware.js";
import { t, pickLang } from "../../services/i18n.js";
import type { Lang } from "../../types.js";

const ALLOWED: ReadonlySet<Lang> = new Set<Lang>(["en", "ru", "zh", "uz", "fil", "th"]);

function isLang(v: string): v is Lang {
  return (ALLOWED as ReadonlySet<string>).has(v);
}

export async function onLang(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const arg = typeof ctx.match === "string" ? ctx.match.trim().toLowerCase() : "";
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  const current = pickLang(user?.language_code ?? from.language_code ?? "en");
  if (!arg || !isLang(arg)) {
    await ctx.reply(t(current).lang_usage);
    return;
  }
  await ctx.state.repoUsers.setLanguage(from.id, arg);
  await ctx.reply(t(arg).lang_set(arg));
}
