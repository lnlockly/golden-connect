import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import { pickLang } from "../../services/i18n.js";
import { buildInviteLink, buildShareUrl } from "../../services/refcode.js";
import type { Lang } from "../../types.js";

/**
 * Video-first onboarding. The welcome message is tiny (1-2 lines) + a
 * single CTA "▶ Watch 90-sec intro". When the user taps it we open a
 * channel / direct-URL to the presentation. Tap on "Done / next" after
 * marks `presented_at` and sends the follow-up with Mini App + invite link.
 *
 * Detection strategy — explicit confirmation. Telegram does not expose a
 * "video watched" event. The user tapping "Done" is the most honest signal
 * we can capture from inside the bot.
 */

const COPY: Record<Lang, {
  hero: (name: string) => string;
  watch_cta: string;
  skip_cta: string;
  followup_title: string;
  followup_body: (refLink: string) => string;
  followup_app: string;
  followup_share: string;
  followup_copy: string;
}> = {
  en: {
    hero: (n) =>
      `Hey${n ? ` ${n}` : ""}. GOLDEN_CONNECT is an advertising ecosystem that works for everyone — business, users, partners. Tap below for a 90-second intro, right inside Telegram.`,
    watch_cta: "▶ Watch the intro",
    skip_cta: "Skip for now",
    followup_title: "You're in.",
    followup_body: (r) =>
      `Your invite link:\n${r}\n\nShare it — every signup through you grows the network, and the network is what pays partners.`,
    followup_app: "🚀 Open cabinet (Mini App)",
    followup_share: "Share with friends",
    followup_copy: "Copy invite link",
  },
  ru: {
    hero: (n) =>
      `Привет${n ? `, ${n}` : ""}. GOLDEN_CONNECT — реклама, которая работает на всех: бизнес, пользователей и партнёров. Нажми — 90-секундная презентация откроется прямо в Telegram.`,
    watch_cta: "▶ Смотреть презентацию",
    skip_cta: "Пропустить",
    followup_title: "Ты в деле.",
    followup_body: (r) =>
      `Твоя реферальная ссылка:\n${r}\n\nДелись — каждая регистрация через тебя растит сеть, а сеть — это то, с чего получают партнёры.`,
    followup_app: "🚀 Открыть кабинет (Mini App)",
    followup_share: "Поделиться с друзьями",
    followup_copy: "Копировать ссылку",
  },
  zh: {
    hero: (n) =>
      `嘿${n ? ` ${n}` : ""}。GOLDEN_CONNECT 是一个让所有人都受益的广告生态 —— 商家、用户、合作伙伴。点击下方 —— 90 秒介绍直接在 Telegram 里播放。`,
    watch_cta: "▶ 观看介绍",
    skip_cta: "稍后再看",
    followup_title: "欢迎上车。",
    followup_body: (r) =>
      `你的邀请链接:\n${r}\n\n分享出去 —— 每一位通过你加入的人都让网络扩大，而网络的流水正是合作伙伴获得收益的来源。`,
    followup_app: "🚀 打开账户(Mini App)",
    followup_share: "分享给朋友",
    followup_copy: "复制邀请链接",
  },
  uz: {
    hero: (n) =>
      `Salom${n ? `, ${n}` : ""}. GOLDEN_CONNECT — barcha uchun ishlaydigan reklama ekotizimi: biznes, foydalanuvchilar va hamkorlar. Pastdagi tugmani bosing — 90 soniyalik tanishuv Telegram ichida ochiladi.`,
    watch_cta: "▶ Tanishuvni ko'rish",
    skip_cta: "Hozircha o'tkazib yuborish",
    followup_title: "Siz ro'yxatdasiz.",
    followup_body: (r) =>
      `Sizning taklif havolangiz:\n${r}\n\nUlashing — siz orqali har bir ro'yxatdan o'tgan foydalanuvchi tarmoqni o'stiradi, tarmoq esa hamkorlarning daromad manbai.`,
    followup_app: "🚀 Kabinetni ochish (Mini App)",
    followup_share: "Do'stlar bilan ulashish",
    followup_copy: "Taklif havolasini nusxalash",
  },
  fil: {
    hero: (n) =>
      `Kumusta${n ? ` ${n}` : ""}. Ang GOLDEN_CONNECT ay advertising ecosystem na gumagana para sa lahat — business, users, partners. Pindutin sa ibaba — 90-segundong intro na mapapanood mismo sa loob ng Telegram.`,
    watch_cta: "▶ Panoorin ang intro",
    skip_cta: "Laktawan muna",
    followup_title: "Pasok ka na.",
    followup_body: (r) =>
      `Ang iyong invite link:\n${r}\n\nIbahagi mo — bawat sumali sa pamamagitan mo ay nagpapalaki ng network, at ang network ang nagbabayad sa mga partner.`,
    followup_app: "🚀 Buksan ang cabinet (Mini App)",
    followup_share: "Ibahagi sa mga kaibigan",
    followup_copy: "Kopyahin ang invite link",
  },
  th: {
    hero: (n) =>
      `สวัสดี${n ? ` ${n}` : ""} GOLDEN_CONNECT คือระบบโฆษณาที่ทำงานให้ทุกคน — ธุรกิจ ผู้ใช้ และพาร์ทเนอร์ กดด้านล่าง — แนะนำ 90 วินาทีเปิดตรงในแอป Telegram`,
    watch_cta: "▶ ดูวิดีโอแนะนำ",
    skip_cta: "ข้ามก่อน",
    followup_title: "คุณเข้าร่วมแล้ว",
    followup_body: (r) =>
      `ลิงก์เชิญของคุณ:\n${r}\n\nแชร์เลย — ทุกคนที่สมัครผ่านคุณช่วยขยายเครือข่าย และเครือข่ายคือที่มาของรายได้ของพาร์ทเนอร์`,
    followup_app: "🚀 เปิดแดชบอร์ด (Mini App)",
    followup_share: "แชร์ให้เพื่อน",
    followup_copy: "คัดลอกลิงก์เชิญ",
  },
};

/**
 * Append `autotour=1` to the MINI_APP_URL so the landing auto-starts the
 * guided tour on mount. Safe-joined (respects existing query string).
 */
function presentationUrl(): string | null {
  const base = process.env.MINI_APP_URL?.trim();
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set('autotour', '1');
    return u.toString();
  } catch {
    return base + (base.includes('?') ? '&' : '?') + 'autotour=1';
  }
}

function buildFollowupKb(lang: Lang, miniAppUrl: string | null, shareUrl: string): InlineKeyboard {
  const copy = COPY[lang];
  const kb = new InlineKeyboard();
  if (miniAppUrl) kb.webApp(copy.followup_app, miniAppUrl).row();
  kb.url(copy.followup_share, shareUrl).row();
  kb.text(copy.followup_copy, "copy_link");
  return kb;
}

/**
 * Short welcome — ONE-liner + a Mini App web_app button. Tap opens the
 * landing inside Telegram with `?autotour=1`, which auto-dispatches
 * `golden-connect:tour-start`. When the tour finishes the WebApp pushes
 * `sendData('tour_done')` back to the bot — handled in
 * `onWebAppDataTourDone` below.
 */
export function buildHeroMessage(
  lang: Lang,
  firstName: string | null,
): { text: string; kb: InlineKeyboard } {
  const copy = COPY[lang];
  const url = presentationUrl();
  const kb = new InlineKeyboard();
  if (url) kb.webApp(copy.watch_cta, url).row();
  kb.text(copy.skip_cta, "pres:skip");
  return { text: copy.hero(firstName ?? ""), kb };
}

/**
 * `pres:skip` — user doesn't want the tour right now. Still mark presented
 * so we don't nag on every /start, still send the follow-up with the
 * invite link + Mini App button.
 */
export async function onPresentationSkip(ctx: AppContext): Promise<void> {
  await onPresentationDone(ctx);
}

/**
 * Handler for `message.web_app_data` when the WebApp reports tour
 * completion. Same side-effects as explicit `pres:done`.
 */
export async function onWebAppDataTourDone(ctx: AppContext): Promise<void> {
  await onPresentationDone(ctx);
}

/**
 * Callback `pres:done` — mark presented_at, send the follow-up.
 */
export async function onPresentationDone(ctx: AppContext): Promise<void> {
  await ctx.answerCallbackQuery().catch(() => {});
  const from = ctx.from;
  if (!from) return;
  await ctx.state.repoUsers.markPresented(from.id);
  const user = await ctx.state.repoUsers.findByTgId(from.id);
  if (!user) return;

  const lang = pickLang(from.language_code);
  const copy = COPY[lang];
  const miniApp = process.env.MINI_APP_URL?.trim() || null;
  const refLink = buildInviteLink(ctx.state.botUsername, user.ref_code);
  const shareUrl = buildShareUrl(refLink, copy.followup_body(refLink));

  const text = [`*${copy.followup_title}*`, "", copy.followup_body(refLink)].join("\n");
  const kb = buildFollowupKb(lang, miniApp, shareUrl);
  await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
}
