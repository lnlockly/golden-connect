/**
 * /missions — list missions with day-progress + "Mark day N" inline buttons.
 *
 * Callback data shape:
 *   mission:done:<mission_id>:<day>   — mark a day complete
 *   mission:enrol:<mission_id>        — enrol in a mission
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import type { MissionsRepo, MissionRow } from "../../db/missions.js";
import { pickLang, tr } from "../../services/i18n.js";
import type { Lang } from "../../types.js";

function renderMission(lang: Lang, m: MissionRow): { text: string; kb: InlineKeyboard } {
  const doneSet = new Set(m.completed_days);
  const lines: string[] = [];
  lines.push(`<b>${m.title}</b>`);
  if (m.description) lines.push(m.description);
  // Current-day line, e.g. "Current step: day 4/7". We count the first step
  // the user hasn't marked done yet; if everything's done we stop at total.
  const currentDay = Math.min(m.completed_days.length + 1, m.total_days);
  if (m.enrolled && m.total_days > 0) {
    lines.push(
      tr(lang, "missions.current_day", { day: currentDay, total: m.total_days }),
    );
  }
  lines.push(
    tr(lang, "missions.progress", {
      done: m.completed_days.length,
      total: m.total_days,
    }),
  );
  lines.push("");

  const kb = new InlineKeyboard();

  if (!m.enrolled) {
    kb.text(tr(lang, "missions.enrol_cta"), `mission:enrol:${m.id}`);
    return { text: lines.join("\n"), kb };
  }

  for (const s of m.steps) {
    const mark = doneSet.has(s.day) ? "✅" : "⬜";
    lines.push(`${mark} <b>${tr(lang, "missions.day_button", { day: s.day })}</b> — ${s.title}`);
    if (!doneSet.has(s.day)) {
      kb.text(
        `${tr(lang, "missions.day_button", { day: s.day })} ✓`,
        `mission:done:${m.id}:${s.day}`,
      ).row();
    }
  }

  if (m.completed_days.length === m.total_days && m.total_days > 0) {
    lines.push("");
    lines.push(tr(lang, "missions.all_done"));
  }

  return { text: lines.join("\n"), kb };
}

export function makeOnMissions(missionsRepo: MissionsRepo) {
  const onMissions = async (ctx: AppContext): Promise<void> => {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    if (!user) return;
    const lang = pickLang(user.language_code ?? from.language_code);
    const missions = await missionsRepo.listForUser(user.id).catch(() => [] as MissionRow[]);

    if (missions.length === 0) {
      await ctx.reply(tr(lang, "missions.empty"));
      return;
    }
    for (const m of missions) {
      const { text, kb } = renderMission(lang, m);
      await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
    }
  };

  const onCallback = async (ctx: AppContext): Promise<boolean> => {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("mission:")) return false;
    const from = ctx.from;
    if (!from) return false;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    if (!user) return false;
    const lang = pickLang(user.language_code ?? from.language_code);

    if (data.startsWith("mission:enrol:")) {
      const missionId = data.slice("mission:enrol:".length);
      try {
        await missionsRepo.enroll(user.id, missionId);
      } catch (e) {
        ctx.state.logger.warn({ err: (e as Error).message }, "mission enrol failed");
      }
      try {
        await ctx.answerCallbackQuery({ text: tr(lang, "missions.enrol_done") });
      } catch {
        /* noop */
      }
      await onMissions(ctx);
      return true;
    }

    if (data.startsWith("mission:done:")) {
      const rest = data.slice("mission:done:".length);
      const sep = rest.lastIndexOf(":");
      if (sep < 0) return false;
      const missionId = rest.slice(0, sep);
      const day = Number(rest.slice(sep + 1));
      if (!Number.isFinite(day)) return false;
      try {
        await missionsRepo.completeDay(user.id, missionId, day);
      } catch (e) {
        ctx.state.logger.warn({ err: (e as Error).message }, "mission complete failed");
      }
      try {
        await ctx.answerCallbackQuery({
          text: tr(lang, "missions.day_done", { day }),
        });
      } catch {
        /* noop */
      }
      await onMissions(ctx);
      return true;
    }

    return false;
  };

  return { onMissions, onCallback };
}
