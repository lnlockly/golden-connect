/**
 * Phase 3B — admin dashboard. Replaces the flat command list with a 6×2
 * inline-keyboard navigator. Header shows live platform metrics from
 * /internal/admin/metrics-summary; tap any button to drill into a section
 * (every section has a "← В админку" button to come back).
 *
 * The legacy {@link adminMenuKeyboard} is retained because callbacks like
 * `admin:dash` (back from users pagination, leads, etc.) still open the
 * old shape in some places — the new shape is mounted on `admin:menu` /
 * `admin:open` to avoid stepping on those flows.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import type { ApiClient } from "../../../api/client.js";
import { AdminMetricsRepo, type AdminMetrics } from "../../../db/adminMetrics.js";
import "./admin-strings.js";

function getApi(ctx: AppContext): ApiClient {
  return (ctx.state.repoUsers as unknown as { api: ApiClient }).api;
}

function fmtUsd(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

function formatPanel(m: AdminMetrics): string {
  const lines = [
    "⚙️ <b>Админ-панель GOLDEN_CONNECT</b>",
    "─────────────────────",
    "",
    "📊 <b>Платформа:</b>",
    `• Юзеров: <b>${m.users_total}</b> (за день: <b>+${m.users_joined_24h}</b>)`,
    `• Оплат за неделю: <b>${fmtUsd(m.payments_week_usd)}</b>`,
    `• Активных эфиров: <b>${m.events_active}</b>`,
    `• Pending рефералов: <b>${m.pending_referrals}</b>`,
  ];
  return lines.join("\n");
}

/**
 * 6×2 grid of section buttons + refresh / close. Callback prefix
 * `admin:` — handlers live in callbacks.ts and bot/index.ts.
 */
export function adminPanelKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("👥 Юзеры", "admin:users")
    .text("💳 Платежи", "admin:payments")
    .row()
    .text("📨 Рассылка", "admin:broadcast")
    .text("🌳 Дерево рефов", "admin:tree")
    .row()
    .text("📅 События", "admin:events")
    .text("📋 Leads", "admin:leads")
    .row()
    .text("📣 Промо", "admin:promo")
    .text("🎥 Видео", "admin:video")
    .row()
    .text("📡 Мониторинг", "admin:monitor")
    .text("🔧 Setup", "admin:setup")
    .row()
    .text("📤 Экспорт", "admin:export")
    .text("⚙️ Напоминалки", "admin:reminders")
    .row()
    .text("🔄 Обновить", "admin:refresh")
    .text("❌ Закрыть", "admin:close");
}

/**
 * Legacy flat keyboard — still wired through `admin:dash` because the
 * users-pagination and leads/payments callbacks expect to come back to
 * the old screen. Phase 3B leaves this intact.
 */
export function adminMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📊 Дашборд", "admin:dash").primary()
    .text("👥 Пользователи", "admin:users").primary()
    .row()
    .text("💳 Оплаты", "admin:payments").primary()
    .text("📬 Заявки", "admin:leads").primary()
    .row()
    .text("📨 Напоминания", "admin:reminders").primary()
    .text("📤 Экспорт CSV", "admin:export").success()
    .row()
    .text("📣 Рассылка", "admin:broadcast").danger()
    .text("🔄 Обновить", "admin:dash");
}

/**
 * /admin entrypoint — render the new 12-button panel with live metrics.
 */
export async function onAdminMenu(ctx: AppContext): Promise<void> {
  const repo = new AdminMetricsRepo(getApi(ctx));
  const metrics = await repo.fetch();
  await ctx.reply(formatPanel(metrics), {
    parse_mode: "HTML",
    reply_markup: adminPanelKeyboard(),
  });
}

/**
 * `admin:refresh` — re-pull metrics, re-render in place.
 */
export async function onAdminPanelRefresh(ctx: AppContext): Promise<void> {
  const repo = new AdminMetricsRepo(getApi(ctx));
  const metrics = await repo.fetch();
  try {
    await ctx.editMessageText(formatPanel(metrics), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard(),
    });
  } catch {
    await ctx.reply(formatPanel(metrics), {
      parse_mode: "HTML",
      reply_markup: adminPanelKeyboard(),
    });
  }
}

/**
 * `admin:close` — strip the keyboard so the panel collapses cleanly.
 */
export async function onAdminPanelClose(ctx: AppContext): Promise<void> {
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: undefined });
  } catch {
    /* message too old — ignore */
  }
}

/**
 * Legacy dashboard refresh — kept so `admin:dash` callbacks from users /
 * leads / payments still work and round-trip back to the older shape.
 *
 * Imports `DashboardStats` lazily to avoid a top-level circular import
 * when other modules depend on dashboard.ts.
 */
export async function onAdminDashboardRefresh(ctx: AppContext): Promise<void> {
  const s = await ctx.state.repoUsers.dashboard();
  const text = formatLegacyDashboard(s);
  try {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: adminMenuKeyboard(),
    });
  } catch {
    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: adminMenuKeyboard(),
    });
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtUserRow(u: { username: string | null; first_name: string | null; tg_id: number }): string {
  if (u.username) return esc(`@${u.username}`);
  if (u.first_name) return `${esc(u.first_name)} (${u.tg_id})`;
  return String(u.tg_id);
}

function formatLegacyDashboard(s: import("../../../types.js").DashboardStats): string {
  const lines: string[] = [];
  lines.push("<b>Админка GOLDEN_CONNECT</b>");
  lines.push("");
  lines.push(`Всего пользователей: <b>${s.total_users}</b>`);
  lines.push(`Новых за 24ч: <b>${s.joined_24h}</b>   за 7д: <b>${s.joined_7d}</b>`);
  lines.push(
    `Среднее в день (7д): <b>${s.avg_daily_7d}</b>   Рост в день: <b>${(s.growth_rate_daily * 100).toFixed(2)}%</b>`,
  );
  lines.push(`Прогноз на завтра: <b>+${s.projected_tomorrow}</b>`);
  lines.push(`Заблокировано: <b>${s.blocked}</b>   Ожидают резолва: <b>${s.pending_referrals}</b>`);
  lines.push(
    `Рассылок: <b>${s.broadcasts_total}</b> (отправлено ${s.broadcasts_sent}, ошибок ${s.broadcasts_failed})`,
  );
  lines.push("");
  lines.push("<b>Топ-10 по прямым приглашениям:</b>");
  if (s.top_direct.length === 0) {
    lines.push("<i>пока пусто</i>");
  } else {
    s.top_direct.forEach((u, i) => {
      lines.push(`${i + 1}. ${fmtUserRow(u)} — ${u.direct_count}`);
    });
  }
  lines.push("");
  lines.push("<b>Топ-10 по всей сети:</b>");
  if (s.top_total.length === 0) {
    lines.push("<i>пока пусто</i>");
  } else {
    s.top_total.forEach((u, i) => {
      lines.push(`${i + 1}. ${fmtUserRow(u)} — ${u.total_descendants} (прямых ${u.direct_count})`);
    });
  }
  return lines.join("\n");
}
