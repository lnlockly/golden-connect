import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import type { Lang } from "../../types.js";

/**
 * /app — issue a one-time magic-link via cabinet and send the URL as a
 * regular hyperlink button. Clicking opens the cabinet in the user's
 * browser pre-authenticated (15-min TTL, single-use). Falls back to a
 * web_app button if magic-link issuance fails.
 */
const COPY: Record<Lang, { cta: string; body: string; err: string }> = {
  en: { cta: "🚀 Open cabinet", body: "Tap to open your TrendeX cabinet — you'\''ll be signed in automatically.", err: "Could not generate sign-in link, try again in a moment." },
  ru: { cta: "🚀 Открыть кабинет", body: "Нажми, чтобы открыть свой кабинет TrendeX — ты войдёшь автоматически.", err: "Не удалось сгенерировать ссылку входа, попробуй ещё раз через минуту." },
  zh: { cta: "🚀 打开账户", body: "点击打开你的 TrendeX 账户 —— 自动登录。", err: "暂时无法生成登录链接，请稍后再试。" },
  uz: { cta: "🚀 Kabinetni ochish", body: "TrendeX kabinetingizni ochish uchun bosing — avtomatik tizimga kirasiz.", err: "Kirish havolasini yaratib bo'\''lmadi, biroz keyin qayta urinib ko'\''ring." },
  fil: { cta: "🚀 Buksan ang cabinet", body: "I-tap upang buksan ang iyong TrendeX cabinet — awtomatikong maka-sign in ka.", err: "Hindi makagawa ng sign-in link, subukan muli mamaya." },
  th: { cta: "🚀 เปิดบัญชี", body: "แตะเพื่อเปิดบัญชี TrendeX ของคุณ — เข้าสู่ระบบอัตโนมัติ", err: "ไม่สามารถสร้างลิงก์เข้าสู่ระบบได้ โปรดลองอีกครั้งในภายหลัง" },
};

export async function onApp(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const lang = pickLang(from.language_code);
  const copy = COPY[lang] ?? COPY.en;

  const result = await ctx.state.apiClient.issueCabinetMagicLink({
    tg_id: from.id,
    username: from.username ?? null,
    first_name: from.first_name ?? null,
    last_name: from.last_name ?? null,
    language_code: from.language_code ?? null,
  });

  if (result.ok && result.url) {
    const kb = new InlineKeyboard().url(copy.cta, result.url);
    await ctx.reply(copy.body, { reply_markup: kb });
    return;
  }

  // Fallback: web_app button if MINI_APP_URL is configured
  const fallback = process.env.MINI_APP_URL?.trim();
  if (fallback) {
    const kb = new InlineKeyboard().webApp(copy.cta, fallback);
    await ctx.reply(copy.body, { reply_markup: kb });
    return;
  }
  await ctx.reply(copy.err);
}
