/**
 * /ref command + callback queries for the referral dashboard.
 *
 * Structure:
 *   Main card — link + stats + CTA row (Мои рефералы / Бейджи / Челленджи)
 *   Callbacks:
 *     ref:refresh      — redraw the main card
 *     ref:list[:page]  — paginated referees
 *     ref:badges       — badges list
 *     ref:challenges   — active + available challenges
 *     ref:chal:<id>    — start a challenge
 *     ref:top          — leaderboard (top paid-converters)
 *
 * Texts are nested under `referral.*`, `challenges.*`, `badges.*` —
 * Phase 2 replaces the placeholders with marketing copy.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang, tr } from "../../services/i18n.js";
import type { Lang, UserRow } from "../../types.js";
import type {
  BadgeRow,
  ChallengeRow,
  ChallengeTemplate,
  ReferralStatsResponse,
  RefereeRow,
} from "../../db/referrals.js";

const PAGE_SIZE = 10;

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function refereeLine(r: RefereeRow, lang: Lang): string {
  const name =
    r.tg_username ? `@${r.tg_username}` : (r.first_name ?? `#${r.invitee_id}`);
  const stageLabel = tr(lang, `referral.stage.${r.stage}`);
  return `• ${escapeHtml(name)} — ${stageLabel}`;
}

function buildRefCard(
  _user: UserRow,
  stats: ReferralStatsResponse | null,
  link: string,
  lang: Lang,
): { text: string; kb: InlineKeyboard } {
  const lines: string[] = [];
  lines.push(`<b>${tr(lang, "referral.title")}</b>`);
  lines.push("");
  lines.push(tr(lang, "referral.link_intro"));
  lines.push(`<code>${escapeHtml(link)}</code>`);
  lines.push("");
  if (stats) {
    const f = stats.funnel;
    lines.push(
      tr(lang, "referral.stats_line", {
        total: f.total,
        invited: f.invited,
        joined: f.joined,
        active: f.active,
        booked: f.booked,
        paid: f.paid,
      }),
    );
    const badgeCount = stats.badges.length;
    const activeCh = stats.challenges.active.length;
    lines.push(
      tr(lang, "referral.badges_line", { count: badgeCount }),
    );
    lines.push(
      tr(lang, "referral.challenges_line", { active: activeCh }),
    );
  }

  const kb = new InlineKeyboard()
    .text(tr(lang, "referral.btn_list"), "ref:list:0")
    .row()
    .text(tr(lang, "referral.btn_badges"), "ref:badges")
    .text(tr(lang, "referral.btn_challenges"), "ref:challenges")
    .row()
    .text(tr(lang, "referral.btn_top"), "ref:top");
  return { text: lines.join("\n"), kb };
}

function buildLink(botUsername: string, code: string): string {
  return `https://t.me/${botUsername}?start=ref_${code}`;
}

async function sendRefCard(ctx: AppContext, user: UserRow): Promise<void> {
  const lang = pickLang(user.language_code);
  const code =
    (await ctx.state.repoReferrals.ensureCode(user.id)) ?? user.ref_code;
  const link = buildLink(ctx.state.botUsername, code);
  const stats = await ctx.state.repoReferrals.stats(user.id);
  const { text, kb } = buildRefCard(user, stats, link, lang);
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}

async function sendRefList(
  ctx: AppContext,
  user: UserRow,
  page: number,
): Promise<void> {
  const lang = pickLang(user.language_code);
  const rows = await ctx.state.repoReferrals.listMine(
    user.id,
    PAGE_SIZE + 1,
    page * PAGE_SIZE,
  );
  const hasMore = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const lines: string[] = [`<b>${tr(lang, "referral.list_title")}</b>`, ""];
  const kb = new InlineKeyboard();
  if (pageRows.length === 0) {
    // Empty list = motivational state. Show ready-to-share post templates so
    // the user can copy + paste right from the message into a chat. Includes
    // a Telegram share-deeplink button that prefills text + link.
    lines.push(tr(lang, "referral.list_empty"));
    lines.push("");
    const code =
      (await ctx.state.repoReferrals.ensureCode(user.id)) ?? user.ref_code;
    const link = buildLink(ctx.state.botUsername, code);
    lines.push(tr(lang, "referral.list_empty_promo_intro"));
    lines.push("");
    lines.push("<b>1️⃣ Короткий:</b>");
    lines.push("<code>" + escapeHtml(tr(lang, "referral.promo_short", { link })) + "</code>");
    lines.push("");
    lines.push("<b>2️⃣ Средний:</b>");
    lines.push("<code>" + escapeHtml(tr(lang, "referral.promo_medium", { link })) + "</code>");
    lines.push("");
    lines.push("<b>3️⃣ Длинный:</b>");
    lines.push("<code>" + escapeHtml(tr(lang, "referral.promo_long", { link })) + "</code>");
    lines.push("");
    lines.push(tr(lang, "referral.promo_tip"));
    // Telegram share deeplink — prefills the share dialog with the medium post.
    const shareText = encodeURIComponent(tr(lang, "referral.promo_medium", { link }));
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${shareText}`;
    kb.url(tr(lang, "referral.btn_share_tg"), shareUrl);
    kb.row();
  } else {
    for (const r of pageRows) lines.push(refereeLine(r, lang));
  }
  if (page > 0) {
    kb.text(tr(lang, "referral.btn_prev"), `ref:list:${page - 1}`);
  }
  if (hasMore) {
    kb.text(tr(lang, "referral.btn_next"), `ref:list:${page + 1}`);
  }
  kb.row().text(tr(lang, "referral.btn_back"), "ref:refresh");
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

function badgeLine(b: BadgeRow, lang: Lang): string {
  const label = tr(lang, `badges.${b.badge_id}`);
  const dateStr = b.earned_at.slice(0, 10);
  return `🏅 ${label} <i>(${dateStr})</i>`;
}

async function sendBadges(ctx: AppContext, user: UserRow): Promise<void> {
  const lang = pickLang(user.language_code);
  const stats = await ctx.state.repoReferrals.stats(user.id);
  const lines: string[] = [`<b>${tr(lang, "badges.title")}</b>`, ""];
  if (!stats || stats.badges.length === 0) {
    lines.push(tr(lang, "badges.empty"));
  } else {
    for (const b of stats.badges) lines.push(badgeLine(b, lang));
  }
  const kb = new InlineKeyboard().text(
    tr(lang, "referral.btn_back"),
    "ref:refresh",
  );
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

function challengeProgressBar(ch: ChallengeRow): string {
  const pct = Math.min(100, Math.round((ch.progress / Math.max(1, ch.goal)) * 100));
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${pct}%`;
}

async function sendChallenges(ctx: AppContext, user: UserRow): Promise<void> {
  const lang = pickLang(user.language_code);
  const stats = await ctx.state.repoReferrals.stats(user.id);
  const lines: string[] = [`<b>${tr(lang, "challenges.title")}</b>`, ""];
  const kb = new InlineKeyboard();

  if (stats && stats.challenges.active.length > 0) {
    lines.push(`<b>${tr(lang, "challenges.active_heading")}</b>`);
    for (const ch of stats.challenges.active) {
      const label = tr(lang, `challenges.t.${ch.challenge_id}`);
      const daysLeft = Math.max(
        0,
        Math.ceil((Date.parse(ch.expires_at) - Date.now()) / 86400000),
      );
      lines.push(`• <b>${label}</b>`);
      lines.push(
        tr(lang, "challenges.progress_line", {
          progress: ch.progress,
          goal: ch.goal,
          days: daysLeft,
        }),
      );
      lines.push(`<code>${challengeProgressBar(ch)}</code>`);
      lines.push("");
    }
  }

  if (stats && stats.challenges.catalog.length > 0) {
    const active = new Set(
      stats.challenges.active.map((a) => a.challenge_id),
    );
    const completed = new Set(
      stats.challenges.completed.map((a) => a.challenge_id),
    );
    lines.push(`<b>${tr(lang, "challenges.available_heading")}</b>`);
    for (const tmpl of stats.challenges.catalog as ChallengeTemplate[]) {
      const title = tr(lang, `challenges.t.${tmpl.id}`);
      const done = completed.has(tmpl.id);
      const act = active.has(tmpl.id);
      const badge = `🏅 ${tr(lang, `badges.${tmpl.badgeId}`)}`;
      const suffix = done
        ? ` ${tr(lang, "challenges.mark_done")}`
        : act
          ? ` ${tr(lang, "challenges.mark_active")}`
          : "";
      lines.push(`• <b>${title}</b> — ${badge}${suffix}`);
      if (!done && !act) {
        kb.text(
          tr(lang, "challenges.btn_start", { title }),
          `ref:chal:${tmpl.id}`,
        ).row();
      }
    }
  }

  kb.text(tr(lang, "referral.btn_back"), "ref:refresh");
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

async function sendLeaderboard(ctx: AppContext, user: UserRow): Promise<void> {
  const lang = pickLang(user.language_code);
  const rows = await ctx.state.repoReferrals.leaderboard(30, 20);
  const lines: string[] = [`<b>${tr(lang, "referral.top_title")}</b>`, ""];
  if (rows.length === 0) {
    lines.push(tr(lang, "referral.top_empty"));
  } else {
    rows.forEach((r, i) => {
      const medal = ["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`;
      const name = r.tg_username
        ? `@${r.tg_username}`
        : (r.first_name ?? `#${r.user_id}`);
      lines.push(`${medal} ${escapeHtml(name)} — <b>${r.paid_count}</b>`);
    });
  }
  const kb = new InlineKeyboard().text(
    tr(lang, "referral.btn_back"),
    "ref:refresh",
  );
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
}

export async function onRefCommand(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  if (ctx.chat?.type !== "private") return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.reply("/start");
    return;
  }
  await sendRefCard(ctx, user);
}

/** Registered from bot/index.ts callback dispatch. */
export async function onRefCallback(ctx: AppContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("ref:")) return;
  const from = ctx.from;
  if (!from) return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.answerCallbackQuery({ text: "/start" });
    return;
  }

  if (data === "ref:refresh") {
    await ctx.answerCallbackQuery();
    await sendRefCard(ctx, user);
    return;
  }
  if (data === "ref:badges") {
    await ctx.answerCallbackQuery();
    await sendBadges(ctx, user);
    return;
  }
  if (data === "ref:challenges") {
    await ctx.answerCallbackQuery();
    await sendChallenges(ctx, user);
    return;
  }
  if (data === "ref:top") {
    await ctx.answerCallbackQuery();
    await sendLeaderboard(ctx, user);
    return;
  }
  if (data.startsWith("ref:list:")) {
    const page = Math.max(0, Number(data.slice("ref:list:".length)) || 0);
    await ctx.answerCallbackQuery();
    await sendRefList(ctx, user, page);
    return;
  }
  if (data.startsWith("ref:chal:")) {
    const templateId = data.slice("ref:chal:".length);
    const lang = pickLang(user.language_code);
    const started = await ctx.state.repoReferrals.startChallenge(
      user.id,
      templateId,
    );
    if (started) {
      await ctx.answerCallbackQuery({
        text: tr(lang, "challenges.started_toast"),
      });
    } else {
      await ctx.answerCallbackQuery({
        text: tr(lang, "challenges.start_failed_toast"),
      });
    }
    await sendChallenges(ctx, user);
    return;
  }
  await ctx.answerCallbackQuery();
}
