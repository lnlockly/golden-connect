/**
 * /tariffs — show pricing inline (works in PM and groups). Same numbers
 * as /finance/tariff-options but no auth needed — purely informational.
 *
 * Format kept tight so it renders cleanly in groups where users skim.
 * Buttons link to the cabinet's marketing page where the user can
 * actually activate.
 */

import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";

const COPY_RU = `<b>💎 Тарифы Trendex</b>

🆓 <b>FREE</b> — $0
   • Заработок до $50/день за активность
   • L1 партнёрки 10%
   • Без матрицы переливов

🚀 <b>LAUNCH</b> — $45 (далее $15/мес)
   • 1 бизнес-место в матрице
   • Глубина 11 уровней × $0.50
   • Партнёрка L1-L3 (10/5/5%)
   • Цикл: $2 047

⚡ <b>BOOST</b> — $90 (далее $30/мес)
   • 2 бизнес-места
   • Глубина 12 × $0.60
   • Партнёрка L1-L5 (10/5/5/3/3%)
   • Доход 3.6× при той же сети

💎 <b>ROCKET</b> — $135 (далее $45/мес)
   • 3 бизнес-места
   • Глубина 17 × $0.70
   • Партнёрка L1-L10 (10/5/5/3/3/2/2/2/1/1%)
   • Matching Bonus +10% с L1-L3
   • Цикл: $7 370 / место

🎁 На каждое активное место — gift-баланс $5/$10.
👑 Leader Pool каждый месяц для топ-15 партнёров.
🎰 Karma-розыгрыш $100 каждое воскресенье в 20:00 МСК.`;

const COPY_EN = `<b>💎 Trendex Tariffs</b>

🆓 <b>FREE</b> — $0
   • Up to $50/day for activity
   • L1 referral 10%
   • No matrix slots

🚀 <b>LAUNCH</b> — $45 (then $15/mo)
   • 1 business slot in matrix
   • Depth 11 × $0.50
   • Referral L1-L3 (10/5/5%)
   • Cycle: $2 047

⚡ <b>BOOST</b> — $90 (then $30/mo)
   • 2 business slots
   • Depth 12 × $0.60
   • Referral L1-L5 (10/5/5/3/3%)
   • 3.6× income on the same network

💎 <b>ROCKET</b> — $135 (then $45/mo)
   • 3 business slots
   • Depth 17 × $0.70
   • Referral L1-L10 (10/5/5/3/3/2/2/2/1/1%)
   • Matching Bonus +10% on L1-L3
   • Cycle: $7 370 / slot

🎁 Each active slot — gift balance $5/$10.
👑 Leader Pool monthly for top-15 partners.
🎰 Karma raffle $100 every Sunday 20:00 MSK.`;

export async function onTariffs(ctx: AppContext): Promise<void> {
  const lang = String(ctx.from?.language_code || 'en').slice(0, 2).toLowerCase();
  const text = lang === 'ru' ? COPY_RU : COPY_EN;
  const kb = new InlineKeyboard()
    .url(lang === 'ru' ? "🚀 Активировать в кабинете" : "🚀 Activate in cabinet",
         "https://trendex.biz/cabinet#/marketing")
    .row()
    .url(lang === 'ru' ? "📺 Посмотреть презентацию" : "📺 View presentation",
         "https://trendex.biz/presentation");
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}
