import { InlineKeyboard } from "grammy";
import type { AppContext } from "../../middleware.js";
import { PaymentsRepo, type PaymentRow } from "../../../db/payments.js";
import type { ApiClient } from "../../../api/client.js";

/**
 * /payments — admin view of the last N paid tariff entries. Data comes
 * from trendex-api `/internal/payments`. The list is re-rendered in place
 * on the "🔄 Обновить" button.
 *
 * Rendering choices:
 *   - HTML parse mode (matches the rest of the admin UI).
 *   - `<code>` around identifiers copy-paste cleanly in Telegram.
 *   - One entry per "block" — 3 lines — so a page of 20 still fits in
 *     one Telegram message (~4 KB hard cap).
 *   - Time is rendered UTC HH:MM to stay compact; full ISO lives in the
 *     ref anyway if a human needs to correlate with the gateway.
 */

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtUser(p: PaymentRow): string {
  const idPart = p.user_tg_id
    ? `id <code>${p.user_tg_id}</code>`
    : `uid <code>${p.user_id}</code>`;
  if (p.user_username) return `@${esc(p.user_username)} (${idPart})`;
  if (p.user_first_name) return `${esc(p.user_first_name)} (${idPart})`;
  return idPart;
}

function fmtMethod(m: PaymentRow["method"]): string {
  switch (m) {
    case "cryptobot":
      return "CryptoBot";
    case "platega":
      return "Platega";
    default:
      return "—";
  }
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  // UTC HH:MM · dd.mm — enough to eyeball ordering without chewing width.
  const pad = (n: number): string => String(n).padStart(2, "0");
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const dd = pad(d.getUTCDate());
  const mo = pad(d.getUTCMonth() + 1);
  return `${hh}:${mm} · ${dd}.${mo}`;
}

function fmtUsd(n: number): string {
  // Drop the .00 on round dollars; otherwise keep two decimals. Avoids a
  // "$100.00" when every card tariff is whole-dollar by design.
  if (Number.isInteger(n)) return `$${n}`;
  return `$${n.toFixed(2)}`;
}

export interface PaymentsListBuildOpts {
  limit?: number;
}

export function buildPaymentsMessage(
  resp: { payments: PaymentRow[]; total: number; total_usd: number },
  opts: PaymentsListBuildOpts = {},
): { text: string; kb: InlineKeyboard } {
  const limit = opts.limit ?? 20;
  const lines: string[] = [];
  lines.push(`💳 <b>Последние ${Math.min(limit, resp.payments.length)} оплат</b>`);
  lines.push(
    `Всего: <b>${resp.total}</b> · Сумма: <b>${fmtUsd(resp.total_usd)}</b>`,
  );
  lines.push("");

  if (resp.payments.length === 0) {
    lines.push("<i>Пока ни одной оплаты.</i>");
  } else {
    resp.payments.forEach((p, i) => {
      const tariff = p.tariff_code ? p.tariff_code.toUpperCase() : "—";
      const pos =
        p.matrix_position === null ? "—" : `позиция ${p.matrix_position}`;
      lines.push(
        `${i + 1}. <b>${esc(tariff)}</b> · ${fmtUsd(p.entry_usd)} · ${fmtMethod(p.method)}`,
      );
      lines.push(`   ${fmtUser(p)} · ${pos} · ${fmtTime(p.paid_at_iso)}`);
      lines.push(`   ref: <code>${esc(p.payment_ref)}</code>`);
      if (i < resp.payments.length - 1) lines.push("");
    });
  }

  const kb = new InlineKeyboard()
    .text("🔄 Обновить", "admin:payments")
    .row()
    .text("⬅️ В меню", "admin:menu");

  return { text: lines.join("\n"), kb };
}

function getApiClient(ctx: AppContext): ApiClient {
  // repoUsers holds the shared ApiClient as a private field. We cast —
  // cheaper than plumbing the client through AppState for one screen.
  return (ctx.state.repoUsers as unknown as { api: ApiClient }).api;
}

export async function onAdminPayments(ctx: AppContext): Promise<void> {
  const repo = new PaymentsRepo(getApiClient(ctx));
  let resp: Awaited<ReturnType<PaymentsRepo["list"]>>;
  try {
    resp = await repo.list(20);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`Не удалось загрузить оплаты: ${msg}`);
    return;
  }
  const { text, kb } = buildPaymentsMessage(resp, { limit: 20 });

  if (ctx.callbackQuery) {
    try {
      await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: kb });
      return;
    } catch {
      /* same content — ignore */
    }
  }
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
}
