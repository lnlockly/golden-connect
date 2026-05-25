/**
 * /tariffs — show Monar lot pricing inline (works in PM and groups).
 *
 * Five Monar lots: $50 / $100 / $300 / $500 / $1000.
 * Each place receives $10 → 60% to user ($6) / 40% to system pools.
 * Second $10 on the same place reinvests it back to the queue tail.
 * 5 income streams: main +100%, refs (5 levels), world pool (from $300),
 * networking fund (live events), auto-ads (9 messengers, 46 languages).
 *
 * Buttons link to the cabinet's marketing page where the user can activate.
 */

import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";

const COPY_RU = `<b>💎 Monar — лоты Golden Connect</b>

🎁 <b>Кредитный лот $10</b> — выдаётся при регистрации, разблокируется после первого лота от $50.

🚀 <b>$50</b> · 2 бизнес-места · ×2 за ~90 дней · 17 кругов
⚡ <b>$100</b> · 4 бизнес-места · ×2 за ~85 дней · 15 кругов
💎 <b>$300</b> · 9 бизнес-мест · ×2 за ~75 дней · 14 кругов · вход в Мировой Пул
🔥 <b>$500</b> · 15 бизнес-мест · ×2 за ~65 дней · 12 кругов · VIP-чат, визитка «Золотой Актив»
👑 <b>$1000</b> · 32 бизнес-места · ×2 за ~40 дней · 7 кругов · все 8 пулов

<b>Как идёт круг.</b> Каждое место получает $10 первым заходом: 60% тебе ($6), 40% в системные пулы. Второй $10 реинвестирует место в конец очереди.

<b>5 потоков дохода.</b>
• Основной +100% от лота
• Рефералы 5 уровней — постоянные с каждого круга
• Мировой Пул (от лота $300, раздача в конце месяца)
• Нетворкинг — балл за выступления × коэффициент лота
• Авто-реклама в 9 мессенджерах с переводом на 46 языков

<b>3 баланса.</b> Пополнение · Доход (вывод) · Реферальный (перевод → вывод).
<b>Абонентка</b> 0.5%/неделя на технические места, пока лот активен.
<b>Вывод</b> открыт после реинвеста ≥50% от полученного дохода в новый лот.`;

const COPY_EN = `<b>💎 Monar — Golden Connect lots</b>

🎁 <b>Credit lot $10</b> — given at signup, unlocks after your first lot of $50 or more.

🚀 <b>$50</b> · 2 business places · ×2 in ~90 days · 17 cycles
⚡ <b>$100</b> · 4 business places · ×2 in ~85 days · 15 cycles
💎 <b>$300</b> · 9 business places · ×2 in ~75 days · 14 cycles · World Pool entry
🔥 <b>$500</b> · 15 business places · ×2 in ~65 days · 12 cycles · VIP chat, "Golden Asset" card
👑 <b>$1000</b> · 32 business places · ×2 in ~40 days · 7 cycles · all 8 pools

<b>How a cycle runs.</b> Each place receives $10 on the first pass: 60% to you ($6), 40% to system pools. The second $10 reinvests the place to the tail of the queue.

<b>5 income streams.</b>
• Main +100% of the lot
• Referrals across 5 levels — recurring on every cycle
• World Pool (from the $300 lot, paid out end of month)
• Networking — score = lot coefficient × number of live talks
• Auto-ads in 9 messengers with translation to 46 languages

<b>3 balances.</b> Deposit · Income (withdraw) · Referral (transfer → withdraw).
<b>Maintenance</b> 0.5%/week on technical places while the lot is active.
<b>Withdraw</b> opens after you reinvest at least 50% of the income you've received.`;

export async function onTariffs(ctx: AppContext): Promise<void> {
  const lang = String(ctx.from?.language_code || 'en').slice(0, 2).toLowerCase();
  const text = lang === 'ru' ? COPY_RU : COPY_EN;
  const kb = new InlineKeyboard()
    .url(lang === 'ru' ? "🚀 Активировать в кабинете" : "🚀 Activate in cabinet",
         "https://goldenConnect.to/cabinet#/marketing")
    .row()
    .url(lang === 'ru' ? "📺 Посмотреть презентацию" : "📺 View presentation",
         "https://goldenConnect.to/presentation");
  await ctx.reply(text, {
    parse_mode: "HTML",
    reply_markup: kb,
    link_preview_options: { is_disabled: true },
  });
}
