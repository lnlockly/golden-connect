/**
 * /quests — list my quests grouped by chapter + totals (level/XP).
 *
 * Opens with a one-line summary ("Completed: 3/12 · 450 XP · Level 3") so
 * users see progress at a glance, then the chapter breakdown. Inline button
 * "Refresh" rerenders the same screen — handy after finishing a quest.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import type { GamificationRepo } from "../../db/gamification.js";
import { pickLang, tr } from "../../services/i18n.js";

export function makeOnQuests(gamification: GamificationRepo) {
  async function render(ctx: AppContext): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    if (!user) {
      await ctx.reply("/start");
      return;
    }
    const lang = pickLang(user.language_code ?? from.language_code);
    const [chapters, xp] = await Promise.all([
      gamification.myQuests(user.id).catch(() => []),
      gamification
        .myXp(user.id)
        .catch(() => ({ total_xp: 0, level: 1, xp_in_level: 0, xp_span: 100, xp_to_next: 100, fraction: 0 })),
    ]);

    let doneCount = 0;
    let totalCount = 0;
    for (const ch of chapters) {
      for (const q of ch.quests) {
        totalCount += 1;
        if (q.completed) doneCount += 1;
      }
    }

    const lines: string[] = [];
    lines.push(`<b>${tr(lang, "quests.title")}</b>`);
    lines.push(
      tr(lang, "quests.summary", {
        done: doneCount,
        total: totalCount,
        xp: xp.total_xp,
        level: xp.level,
      }),
    );
    lines.push(
      `${tr(lang, "levels.label", { level: xp.level })} — ${tr(lang, "levels.progress", {
        in_level: xp.xp_in_level,
        span: xp.xp_span,
      })}`,
    );
    lines.push("");

    if (chapters.length === 0) {
      lines.push(tr(lang, "quests.empty"));
    } else {
      for (const ch of chapters) {
        lines.push(`<b>${tr(lang, "quests.chapter")}: ${ch.chapter}</b>`);
        for (const q of ch.quests) {
          const mark = q.completed ? "✅" : "⬜";
          const xpLabel = tr(lang, "quests.xp_reward", { xp: q.xp });
          lines.push(`${mark} ${q.title} <i>(${xpLabel})</i>`);
        }
        lines.push("");
      }
    }

    const kb = new InlineKeyboard().text(tr(lang, "leaderboard.refresh"), "quests:refresh");
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }

  const onQuests = async (ctx: AppContext): Promise<void> => {
    await render(ctx);
  };

  const onCallback = async (ctx: AppContext): Promise<boolean> => {
    const data = ctx.callbackQuery?.data;
    if (data !== "quests:refresh") return false;
    try {
      await ctx.answerCallbackQuery();
    } catch {
      /* noop */
    }
    await render(ctx);
    return true;
  };

  return { onQuests, onCallback };
}
