import { InlineKeyboard } from "grammy";
import type { MessageEntity } from "grammy/types";
import type { AppContext } from "../middleware.js";
import {
  buildInviteLink,
  buildShareUrl,
  buildWebsiteLink,
} from "../../services/refcode.js";
import { pickLang, t } from "../../services/i18n.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LEVEL_BREAKDOWN_DEPTH = 5;

export async function onStats(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const repo = ctx.state.repoUsers;
  const user = await repo.findByTgId(from.id);
  if (!user) {
    await ctx.reply("Сначала /start.");
    return;
  }
  const dict = t(pickLang(user.language_code));

  const tgLink = buildInviteLink(ctx.state.botUsername, user.ref_code);
  const webLink = buildWebsiteLink(ctx.state.websiteUrl, user.ref_code);
  const shareUrl = buildShareUrl(tgLink, dict.share_text(webLink));

  const [direct, descendants, joined24h, joined7d, levels] = await Promise.all([
    repo.directCount(user.id),
    repo.descendantStats(user.id),
    repo.subtreeJoinedSince(user.id, Date.now() - DAY_MS),
    repo.subtreeJoinedSince(user.id, Date.now() - 7 * DAY_MS),
    repo.subtreeLevelBreakdown(user.id, LEVEL_BREAKDOWN_DEPTH),
  ]);

  const firstName = user.first_name ?? from.first_name ?? "—";
  const joinedDate = new Date(user.joined_at).toISOString().slice(0, 10);
  const lang = user.language_code ?? "—";
  const appliedLabel = user.applied_on_site
    ? dict.cabinet_applied_yes
    : dict.cabinet_applied_no;
  const refNotifLine = user.ref_notifications_enabled
    ? dict.cabinet_notifs_ref_on
    : dict.cabinet_notifs_ref_off;

  // Build the text + entity offsets together so we can bold headings and
  // mark the two URLs as `code` (tap-to-copy) without MarkdownV2 escaping
  // hell.
  const entities: MessageEntity[] = [];
  const parts: string[] = [];
  let offset = 0;

  function pushLine(s: string): void {
    parts.push(s);
    offset += s.length + 1; // + "\n"
  }
  function pushHeading(s: string): void {
    entities.push({ type: "bold", offset, length: s.length });
    pushLine(s);
  }
  function pushCodeUrl(label: string, url: string): void {
    // "label: <code>url</code>"
    const prefix = `${label}: `;
    parts.push(prefix + url);
    const urlStart = offset + prefix.length;
    entities.push({ type: "code", offset: urlStart, length: url.length });
    offset += prefix.length + url.length + 1;
  }

  pushHeading(`📊 ${dict.stats_title.replace(/^📊\s*/, "")}`);
  pushLine("");

  pushHeading(dict.cabinet_profile_heading);
  pushLine(`  ${dict.cabinet_name_label}: ${firstName}`);
  pushLine(`  ${dict.cabinet_joined_label}: ${joinedDate}`);
  pushLine(`  ${dict.cabinet_lang_label}: ${lang}`);
  pushLine(`  ${dict.cabinet_applied_label}: ${appliedLabel}`);
  pushLine("");

  pushHeading(dict.cabinet_links_heading);
  pushCodeUrl(`  ${dict.cabinet_tg_link_label}`, tgLink);
  pushCodeUrl(`  ${dict.cabinet_site_link_label}`, webLink);
  pushLine("");

  pushHeading(dict.cabinet_network_heading);
  pushLine(`  ${dict.stats_direct}: ${direct}`);
  pushLine(`  ${dict.stats_total}: ${descendants.total_descendants}`);
  pushLine(`  ${dict.stats_depth}: ${descendants.max_depth ?? 0}`);
  pushLine(`  ${dict.stats_joined_24h}: ${joined24h}   ${dict.stats_joined_7d}: ${joined7d}`);
  if (levels.length > 0) {
    pushLine(`  ${dict.stats_breakdown}:`);
    for (const l of levels) {
      pushLine(`    ${dict.stats_level_label(l.level)}: ${l.count}`);
    }
  }
  pushLine("");

  pushHeading(dict.cabinet_earnings_heading);
  pushLine(`  ${dict.cabinet_earnings_welcome}: ${dict.cabinet_earnings_pending}`);
  pushLine(`  ${dict.cabinet_earnings_refs}: ${dict.cabinet_earnings_pending}`);
  pushLine(`  ${dict.cabinet_earnings_total}: ${dict.cabinet_earnings_pending}`);
  pushLine("");

  pushHeading(dict.cabinet_notifs_heading);
  pushLine(`  ${refNotifLine}`);

  const text = parts.join("\n");

  const kb = new InlineKeyboard()
    .url(dict.btn_share, shareUrl).success()
    .row()
    .text(dict.btn_copy_link, "copy_link")
    .text(dict.btn_copy_web_link, "copy_web_link").success()
    .row()
    .url(dict.btn_open_website, webLink).primary()
    .row()
    .text(
      user.ref_notifications_enabled ? dict.btn_notif_ref_off : dict.btn_notif_on,
      user.ref_notifications_enabled ? "cabinet:notif_off" : "cabinet:notif_on",
    )
    .row()
    .text(dict.btn_main_menu, "menu:main");

  await ctx.reply(text, {
    entities,
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}
