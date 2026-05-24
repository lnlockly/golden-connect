/**
 * /events — public command: list my registrations + upcoming events.
 * Also owns the `ev:*` inline-callback namespace:
 *   ev:reg:<id>   — register current user
 *   ev:unreg:<id> — unregister
 *   ev:view:<id>  — show detail card
 *
 * Deep-link `event_<id>` is handled in start.ts (it pre-lives there to
 * share the /start payload parser).
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import type { EventSummary } from "../../db/events.js";
import { pickLang, tr } from "../../services/i18n.js";
import type { Lang } from "../../types.js";

const MAX_LIST_BUTTONS = 8;

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function formatMsk(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatEventCard(ev: EventSummary, lang: Lang): string {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(ev.title)}</b>`);
  if (ev.topic) lines.push(escapeHtml(ev.topic));
  lines.push("");
  const speakers = Array.isArray(ev.speakers) ? ev.speakers : [];
  if (speakers.length) {
    lines.push(`👤 <b>${tr(lang, "events.speakers")}</b>`);
    speakers.forEach((s) => lines.push(`• ${escapeHtml(String(s))}`));
    lines.push("");
  }
  if (ev.description) {
    lines.push(escapeHtml(truncate(ev.description, 400)));
    lines.push("");
  }
  lines.push(`📅 ${formatMsk(ev.starts_at)} МСК`);
  return lines.join("\n");
}

function buildEventCardKb(
  ev: EventSummary,
  lang: Lang,
  opts: { registered: boolean },
): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (opts.registered) {
    kb.text(tr(lang, "events.btn.unregister"), `ev:unreg:${ev.id}`).row();
  } else {
    kb.text(tr(lang, "events.btn.register"), `ev:reg:${ev.id}`).row();
  }
  if (ev.join_url) {
    kb.url(tr(lang, "events.btn.open"), ev.join_url).row();
  }
  return kb;
}

export async function onEvents(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from || ctx.chat?.type !== "private") return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.reply(tr(pickLang(from.language_code), "events.need_start"));
    return;
  }
  const lang = pickLang(user.language_code);
  const repo = ctx.state.repoEvents;
  const bundle = await repo.myUpcoming(user.id);

  if (bundle.registered.length === 0 && bundle.upcoming.length === 0) {
    await ctx.reply(tr(lang, "events.empty"));
    return;
  }

  const lines: string[] = [];
  lines.push(`📡 <b>${tr(lang, "events.title_upcoming")}</b>`);
  lines.push("");

  if (bundle.registered.length) {
    lines.push(`✅ <b>${tr(lang, "events.section.my")}</b>`);
    bundle.registered.forEach((ev) => {
      lines.push(
        `• ${escapeHtml(truncate(ev.title, 80))} — ${formatMsk(ev.starts_at)} МСК`,
      );
    });
    lines.push("");
  }

  if (bundle.upcoming.length) {
    lines.push(`📅 <b>${tr(lang, "events.section.all")}</b>`);
    bundle.upcoming.forEach((ev) => {
      lines.push(
        `• ${escapeHtml(truncate(ev.title, 80))} — ${formatMsk(ev.starts_at)} МСК`,
      );
    });
  }

  const kb = new InlineKeyboard();
  const shown = [...bundle.registered, ...bundle.upcoming].slice(0, MAX_LIST_BUTTONS);
  shown.forEach((ev) => {
    kb.text(
      `${tr(lang, "events.btn.view_prefix")} ${truncate(ev.title, 22)}`,
      `ev:view:${ev.id}`,
    ).row();
  });

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}

export async function onEventsCallback(ctx: AppContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("ev:")) return;
  const from = ctx.from;
  if (!from) return;
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) {
    await ctx.answerCallbackQuery({
      text: tr(pickLang(from.language_code), "events.need_start"),
      show_alert: true,
    });
    return;
  }
  const lang = pickLang(user.language_code);
  const repo = ctx.state.repoEvents;

  const [, action, idRaw] = data.split(":");
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    await ctx.answerCallbackQuery({ text: "?" });
    return;
  }

  if (action === "view") {
    const ev = await repo.get(id);
    if (!ev) {
      await ctx.answerCallbackQuery({
        text: tr(lang, "events.not_found"),
        show_alert: true,
      });
      return;
    }
    // Detect registration from bundle.
    const bundle = await repo.myUpcoming(user.id);
    const registered = bundle.registered.some((e) => e.id === id);
    const text = formatEventCard(ev, lang);
    const kb = buildEventCardKb(ev, lang, { registered });
    await ctx.answerCallbackQuery();
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  if (action === "reg") {
    const ev = await repo.register(id, user.id, "tg");
    if (!ev) {
      await ctx.answerCallbackQuery({
        text: tr(lang, "events.register_failed"),
        show_alert: true,
      });
      return;
    }
    await ctx.answerCallbackQuery({ text: tr(lang, "events.registered_ok") });
    await ctx.reply(tr(lang, "events.registered_body", { title: ev.title }), {
      parse_mode: "HTML",
    });
    return;
  }

  if (action === "unreg") {
    await repo.unregister(id, user.id);
    await ctx.answerCallbackQuery({ text: tr(lang, "events.unregistered_ok") });
    return;
  }

  await ctx.answerCallbackQuery();
}
