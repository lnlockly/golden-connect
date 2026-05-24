/**
 * /team command — partner CRM dashboard.
 *
 * Layout:
 *   Funnel counts
 *   Next-actions (top 8, buttons: done / open profile)
 *   Paginated referees list (via ref:list)
 *
 * Callbacks:
 *   team:refresh
 *   team:actions[:page]
 *   team:done:<actionId>
 *   team:referee:<id>     — one-line "contact card" with note-prompt button
 *   team:snooze:<id>      — bumps next_contact_at 3 days forward via note
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang, tr } from "../../services/i18n.js";
import type { UserRow } from "../../types.js";
import type { NextActionRow } from "../../db/team.js";
import type { FunnelCounts } from "../../db/referrals.js";

const ACTIONS_PAGE_SIZE = 8;

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contactName(
  tgUsername: string | null,
  firstName: string | null,
  userId: number,
): string {
  if (tgUsername) return `@${tgUsername}`;
  if (firstName) return firstName;
  return `#${userId}`;
}

function funnelBlock(f: FunnelCounts, lang: string): string[] {
  const lines: string[] = [];
  lines.push(`<b>${tr(lang as any, "team.funnel_title")}</b>`);
  lines.push(
    tr(lang as any, "team.funnel_line", {
      total: f.total,
      invited: f.invited,
      joined: f.joined,
      active: f.active,
      booked: f.booked,
      paid: f.paid,
      dormant: f.dormant,
      lost: f.lost,
    }),
  );
  return lines;
}

function actionLine(a: NextActionRow, lang: string): string {
  const name = contactName(
    a.target_tg_username,
    a.target_first_name,
    a.target_user_id,
  );
  const actionEmoji: Record<string, string> = {
    call: "📞",
    message: "💬",
    followup: "🔁",
    congratulate: "🎉",
  };
  const emoji = actionEmoji[a.action_type] ?? "•";
  const reason = tr(lang as any, `team.reason.${a.reason}`);
  return `${emoji} <b>${escapeHtml(name)}</b> — ${reason}`;
}

async function sendOverview(ctx: AppContext, user: UserRow): Promise<void> {
  const lang = pickLang(user.language_code);
  const [funnel, actions, referees] = await Promise.all([
    ctx.state.repoTeam.overview(user.id),
    ctx.state.repoTeam.listNextActions(user.id, ACTIONS_PAGE_SIZE),
    ctx.state.repoTeam.listReferees(user.id, 5, 0),
  ]);

  const lines: string[] = [];
  lines.push(`<b>${tr(lang, "team.title")}</b>`);
  lines.push("");
  if (funnel) {
    lines.push(...funnelBlock(funnel, lang));
    lines.push("");
  }
  if (actions.length > 0) {
    lines.push(`<b>${tr(lang, "team.next_heading")}</b>`);
    for (const a of actions.slice(0, ACTIONS_PAGE_SIZE)) {
      lines.push(actionLine(a, lang));
    }
    lines.push("");
  }
  if (referees.length > 0) {
    lines.push(`<b>${tr(lang, "team.recent_heading")}</b>`);
    for (const r of referees) {
      const name = contactName(r.tg_username, r.first_name, r.invitee_id);
      const stage = tr(lang, `referral.stage.${r.stage}`);
      lines.push(`• ${escapeHtml(name)} — ${stage}`);
    }
  }

  const kb = new InlineKeyboard();
  for (const a of actions.slice(0, 3)) {
    const name = contactName(
      a.target_tg_username,
      a.target_first_name,
      a.target_user_id,
    );
    kb.text(
      tr(lang, "team.btn_done", { name: name.slice(0, 24) }),
      `team:done:${a.id}`,
    )
      .text(tr(lang, "team.btn_snooze"), `team:snooze:${a.id}`)
      .row();
  }
  kb.text(tr(lang, "team.btn_all_actions"), "team:actions:0")
    .text(tr(lang, "team.btn_ref_overview"), "ref:refresh")
    .row()
    .text(tr(lang, "team.btn_refresh"), "team:refresh");

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}

async function sendActionsPage(
  ctx: AppContext,
  user: UserRow,
  page: number,
): Promise<void> {
  const lang = pickLang(user.language_code);
  // Simple offset pagination; the server already paginates by priority.
  const actions = await ctx.state.repoTeam.listNextActions(
    user.id,
    ACTIONS_PAGE_SIZE * (page + 1) + 1,
  );
  const sliced = actions.slice(
    page * ACTIONS_PAGE_SIZE,
    (page + 1) * ACTIONS_PAGE_SIZE,
  );
  const hasMore = actions.length > (page + 1) * ACTIONS_PAGE_SIZE;

  const lines: string[] = [`<b>${tr(lang, "team.next_title")}</b>`, ""];
  if (sliced.length === 0) {
    lines.push(tr(lang, "team.next_empty"));
  } else {
    for (const a of sliced) lines.push(actionLine(a, lang));
  }

  const kb = new InlineKeyboard();
  for (const a of sliced) {
    const name = contactName(
      a.target_tg_username,
      a.target_first_name,
      a.target_user_id,
    );
    kb.text(
      tr(lang, "team.btn_done", { name: name.slice(0, 20) }),
      `team:done:${a.id}`,
    )
      .text(tr(lang, "team.btn_snooze"), `team:snooze:${a.id}`)
      .row();
  }
  if (page > 0) {
    kb.text(tr(lang, "referral.btn_prev"), `team:actions:${page - 1}`);
  }
  if (hasMore) {
    kb.text(tr(lang, "referral.btn_next"), `team:actions:${page + 1}`);
  }
  kb.row().text(tr(lang, "referral.btn_back"), "team:refresh");

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function snoozeAction(
  ctx: AppContext,
  user: UserRow,
  actionId: number,
): Promise<void> {
  // Snooze is implemented as "mark this action done and log a note
  // scheduled 3 days out". The next daily cron tick will re-queue a
  // fresh action if the referral is still in a flag-worthy state.
  const lang = pickLang(user.language_code);
  const actions = await ctx.state.repoTeam.listNextActions(user.id, 100);
  const target = actions.find((a) => a.id === actionId);
  if (!target) {
    await ctx.answerCallbackQuery({
      text: tr(lang, "team.snooze_not_found"),
    });
    return;
  }
  const next = new Date(Date.now() + 3 * 86400000);
  await ctx.state.repoTeam.saveNote(
    user.id,
    target.target_user_id,
    `[snooze] ${target.reason}`,
    next,
  );
  await ctx.state.repoTeam.markActionDone(user.id, actionId);
  await ctx.answerCallbackQuery({
    text: tr(lang, "team.snooze_ok"),
  });
  await sendOverview(ctx, user);
}

export async function onTeamCommand(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  if (ctx.chat?.type !== "private") return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.reply("/start");
    return;
  }
  await sendOverview(ctx, user);
}

export async function onTeamCallback(ctx: AppContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("team:")) return;
  const from = ctx.from;
  if (!from) return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "/start" });
    return;
  }
  const lang = pickLang(user.language_code);

  if (data === "team:refresh") {
    await ctx.answerCallbackQuery();
    await sendOverview(ctx, user);
    return;
  }
  if (data.startsWith("team:actions:")) {
    const page = Math.max(0, Number(data.slice("team:actions:".length)) || 0);
    await ctx.answerCallbackQuery();
    await sendActionsPage(ctx, user, page);
    return;
  }
  if (data.startsWith("team:done:")) {
    const id = Number(data.slice("team:done:".length));
    if (Number.isFinite(id)) {
      const ok = await ctx.state.repoTeam.markActionDone(user.id, id);
      await ctx.answerCallbackQuery({
        text: ok
          ? tr(lang, "team.done_ok")
          : tr(lang, "team.done_failed"),
      });
      await sendOverview(ctx, user);
    } else {
      await ctx.answerCallbackQuery();
    }
    return;
  }
  if (data.startsWith("team:snooze:")) {
    const id = Number(data.slice("team:snooze:".length));
    if (Number.isFinite(id)) {
      await snoozeAction(ctx, user, id);
    } else {
      await ctx.answerCallbackQuery();
    }
    return;
  }
  await ctx.answerCallbackQuery();
}
