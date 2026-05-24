/**
 * /top — XP leaderboard (top 20, default period: this week).
 *
 * Identifiers are user_id (opaque integers) for privacy — the bot does NOT
 * resolve to username/first_name unless the user is the current viewer. The
 * render surface below also ships inline buttons for period switching
 * (Today / Week / Month / All) + a Refresh button so users don't have to
 * retype `/top week`.
 *
 * Callback shape:
 *   top:period:<day|week|month|all>  — switch the rendered window
 *   top:refresh:<period>             — rerender the same window
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import type { GamificationRepo } from "../../db/gamification.js";
import { pickLang, tr } from "../../services/i18n.js";
import type { Lang } from "../../types.js";

type Period = "day" | "week" | "month" | "all";
const PERIODS: Period[] = ["day", "week", "month", "all"];

const PERIOD_KEY: Record<string, Period> = {
  day: "day",
  week: "week",
  month: "month",
  all: "all",
};

function buildKeyboard(lang: Lang, active: Period): InlineKeyboard {
  const kb = new InlineKeyboard();
  // Period row — mark the active one with a dot prefix so users see selection.
  for (const p of PERIODS) {
    const label = tr(lang, `leaderboard.period_${p}`);
    const text = p === active ? `• ${label}` : label;
    kb.text(text, `top:period:${p}`);
  }
  kb.row().text(tr(lang, "leaderboard.refresh"), `top:refresh:${active}`);
  return kb;
}

export function makeOnLeaderboard(gamification: GamificationRepo) {
  async function render(ctx: AppContext, period: Period): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    const lang = pickLang(user?.language_code ?? from.language_code);

    const rows = await gamification.leaderboard(period, 20).catch(() => []);
    const lines: string[] = [];
    lines.push(
      `<b>${tr(lang, "leaderboard.title")}</b> — ${tr(lang, `leaderboard.period_${period}`)}`,
    );
    lines.push("");
    if (rows.length === 0) {
      lines.push(tr(lang, "leaderboard.empty"));
    } else {
      for (const r of rows) {
        lines.push(
          tr(lang, "leaderboard.row", {
            rank: r.rank,
            user_id: r.user_id,
            xp: r.xp,
            level: r.level,
          }),
        );
      }
    }
    await ctx.reply(lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: buildKeyboard(lang, period),
    });
  }

  const onLeaderboard = async (ctx: AppContext): Promise<void> => {
    const text = (ctx.message?.text ?? "").trim();
    const arg = text.split(/\s+/)[1]?.toLowerCase();
    const period: Period = arg && PERIOD_KEY[arg] ? PERIOD_KEY[arg] : "week";
    await render(ctx, period);
  };

  const onCallback = async (ctx: AppContext): Promise<boolean> => {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("top:")) return false;
    try {
      await ctx.answerCallbackQuery();
    } catch {
      /* noop */
    }
    if (data.startsWith("top:period:")) {
      const raw = data.slice("top:period:".length);
      const period = PERIOD_KEY[raw] ?? "week";
      await render(ctx, period);
      return true;
    }
    if (data.startsWith("top:refresh:")) {
      const raw = data.slice("top:refresh:".length);
      const period = PERIOD_KEY[raw] ?? "week";
      await render(ctx, period);
      return true;
    }
    return false;
  };

  return { onLeaderboard, onCallback };
}
