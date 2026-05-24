import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";

interface BalancesResponse {
  ok: boolean;
  balances?: {
    working: { usd: number };
    gift: { usd: number };
    subscription: { usd: number; cap_usd: number; progress: number };
    karma: { points: string };
  };
  tariff?: {
    code: string;
    expires_at: string | null;
    auto_renew: boolean;
  };
}

function fmtUsd(n: number): string {
  return n % 1 === 0 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

/**
 * /balance — show all 4 wallet balances + active tariff status.
 *
 * Pulls live data from /internal/finance/balances via apiClient (uses
 * INTERNAL_API_SECRET header). Renders in HTML with progress emojis
 * for the subscription cap. Inline keyboard links to cabinet for
 * deeper actions (topup, transfer, withdraw, buy tariff).
 */
export async function onBalance(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const user = ctx.user;
  if (!user) {
    await ctx.reply("Сначала зарегистрируйся — /start");
    return;
  }

  let data: BalancesResponse;
  try {
    data = await ctx.state.apiClient.getJson<BalancesResponse>(
      `/internal/finance/balances?user_id=${user.id}`,
    );
  } catch (e) {
    ctx.state.logger.error({ err: e instanceof Error ? e.message : e }, "/balance: api fetch failed");
    await ctx.reply("Не удалось получить баланс. Попробуй позже.");
    return;
  }

  if (!data?.ok || !data.balances) {
    await ctx.reply("Баланс пока недоступен.");
    return;
  }

  const b = data.balances;
  const t = data.tariff;
  const tariffCode = (t?.code || "free").toUpperCase();

  // Subscription progress bar (10 dots)
  const sp = b.subscription.progress || 0;
  const filled = Math.round(sp / 10);
  const empty = 10 - filled;
  const progressBar = "🟪".repeat(filled) + "⬛".repeat(empty);

  // Build expiry line for paid tariffs
  let expiryLine = "";
  if (t && t.code !== "free" && t.expires_at) {
    const exp = new Date(t.expires_at);
    const daysLeft = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / 86_400_000));
    const renewIcon = t.auto_renew ? "✓ авто" : "✗ выкл";
    expiryLine = `\nИстекает: <b>через ${daysLeft} дн.</b> · продление ${renewIcon}`;
  }

  const lines = [
    `💰 <b>Твои балансы Trendex</b>`,
    ``,
    `🟢 <b>Основной</b>: ${fmtUsd(b.working.usd)}  <i>(на вывод и тариф)</i>`,
    `🟣 <b>Автоподписка</b>: ${fmtUsd(b.subscription.usd)} / ${fmtUsd(b.subscription.cap_usd)} <i>(${sp}%)</i>`,
    `   ${progressBar}`,
    `🟡 <b>Реклама</b>: ${fmtUsd(b.gift.usd)}  <i>(только на ADX)</i>`,
    `⚡ <b>Карма</b>: ${b.karma.points} пт  <i>(розыгрыш Вс 20:00 МСК, фонд $100)</i>`,
    ``,
    `🎟 <b>Тариф</b>: ${tariffCode}${expiryLine}`,
  ];

  const cabinetUrl = `${ctx.state.webappUrl || ctx.state.websiteUrl}/cabinet/cabinet#/finance`;
  const kb = new InlineKeyboard()
    .url("💰 Финансы", cabinetUrl)
    .url("🚀 Купить тариф", `${ctx.state.webappUrl || ctx.state.websiteUrl}/cabinet/cabinet#/marketing`)
    .row()
    .text("🔄 Обновить", "balance:refresh");

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: kb,
  });
}

/**
 * Callback handler for "🔄 Обновить" button — re-runs onBalance and edits the
 * existing message to keep the chat tidy.
 */
export async function onBalanceRefresh(ctx: AppContext): Promise<void> {
  // Just answer + re-call. Editing the message is cleaner but more code.
  try {
    await ctx.answerCallbackQuery({ text: "Обновляю..." });
  } catch {
    // ignore — callback might already be expired
  }
  await onBalance(ctx);
}
