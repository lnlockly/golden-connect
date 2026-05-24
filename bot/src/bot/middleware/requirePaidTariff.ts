// bot/src/bot/middleware/requirePaidTariff.ts
//
// Gate CRM commands behind an active paid tariff (LAUNCH/BOOST/ROCKET).
// CRM = premium feature per product decision 2026-05-12.
//
// Returns a wrapped command handler that checks /internal/finance/balances
// for the active tariff_code. On free/expired → paywall reply with
// "Купить тариф" WebApp button. On paid → pass through.

import { InlineKeyboard } from "grammy";
import type { CommandContext } from "grammy";
import type { AppContext } from "../middleware.js";

const PAID = new Set(["launch", "boost", "rocket"]);
const TARIFFS_URL =
  (process.env.WEBAPP_URL || "https://golden-connect.to/cabinet") + "/#/marketing";

interface BalancesResponse {
  ok: boolean;
  tariff?: { code: string; expires_at: string | null };
}

type CrmHandler = (ctx: CommandContext<AppContext>) => Promise<void>;

export function requirePaidTariff(handler: CrmHandler): CrmHandler {
  return async (ctx) => {
    const user = ctx.user;
    if (!user) {
      await ctx.reply("Сначала зарегистрируйся — нажми /start");
      return;
    }

    let tariff: string | null = null;
    let expiresAt: string | null = null;
    try {
      const data = await ctx.state.apiClient.getJson<BalancesResponse>(
        `/internal/finance/balances?user_id=${user.id}`,
      );
      tariff = data?.tariff?.code ? String(data.tariff.code).toLowerCase() : null;
      expiresAt = data?.tariff?.expires_at ?? null;
    } catch (e) {
      ctx.state.logger?.error?.(
        { err: e instanceof Error ? e.message : e },
        "[requirePaidTariff] balances fetch failed",
      );
      await ctx.reply(
        "⚠️ Не удалось проверить тариф. Попробуй через минуту или открой /balance.",
      );
      return;
    }

    const isExpired =
      expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();

    if (!tariff || !PAID.has(tariff) || isExpired) {
      const kb = new InlineKeyboard()
        .webApp("💎 Купить тариф (LAUNCH/BOOST/ROCKET)", TARIFFS_URL)
        .row()
        .url("📖 Что даёт CRM", "https://golden-connect.to/#whats-new");

      const status = isExpired
        ? `*Подписка истекла:* ${tariff?.toUpperCase()} (${new Date(expiresAt!).toLocaleDateString("ru-RU")})`
        : `*Твой тариф:* ${(tariff || "FREE").toUpperCase()}`;

      await ctx.reply(
        "🔒 *CRM — premium-фича Golden Connect*\n\n" +
          "База 7 322 MLM-лидеров, AI-питчи, воронка, задачи, отчёты — " +
          "доступны на платных тарифах:\n\n" +
          "• *LAUNCH* — $45 (одноразово) + $15/мес\n" +
          "• *BOOST* — $90 + $30/мес\n" +
          "• *ROCKET* — $135 + $45/мес\n\n" +
          status +
          "\n\nНажми кнопку ниже чтобы купить.",
        { parse_mode: "Markdown", reply_markup: kb },
      );
      return;
    }

    await handler(ctx);
  };
}
