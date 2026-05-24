import { InlineKeyboard } from "grammy";
import type { MessageEntity } from "grammy/types";
import type { AppContext } from "../middleware.js";
import { isAdmin } from "../middleware.js";
import {
  buildInviteLink,
  buildShareUrl,
  buildWebsiteLink,
  parseStartPayload,
} from "../../services/refcode.js";
import { pickLang, t, tr } from "../../services/i18n.js";
import { notifyAncestorsOfNewReferral } from "../../services/refNotify.js";
import { buildHeroMessage } from "./presentation.js";
import { ApiError } from "../../api/client.js";
import type { Lang, UserRow } from "../../types.js";

/** Login-token deep-link prefix: `/start login_<token>` — see onStart. */
const LOGIN_PAYLOAD_PREFIX = "login_";
/** Event card deep-link: `/start event_<id>` opens the event card inline. */
const EVENT_PAYLOAD_PREFIX = "event_";

const STREAM_CHUNK_SIZE = 6;
const STREAM_CHUNK_DELAY_MS = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

interface WelcomePayload {
  text: string;
  entities: MessageEntity[];
  tgLink: string;
  webLink: string;
}

const SECTION_RULE = "━━━━━━━━━━━━━━━";

const BOLD_PHRASES_BY_LANG: Record<Lang, readonly string[]> = {
  en: ["GOLDEN_CONNECT", "early access", "x2 advertising budget", "free"],
  ru: ["GOLDEN_CONNECT", "ранний доступ", "x2 рекламный бюджет", "бесплатно"],
  zh: ["GOLDEN_CONNECT", "早期通道", "x2 广告预算", "免费"],
  uz: ["GOLDEN_CONNECT", "erta kirish", "x2 reklama byudjeti", "bepul"],
  fil: ["GOLDEN_CONNECT", "early access", "x2 advertising budget", "libre"],
  th: ["GOLDEN_CONNECT", "เข้าถึงก่อนใคร", "x2 งบโฆษณา", "ฟรี"],
};

// Adds a MessageEntity for every non-overlapping occurrence of `span` in `text`.
function addEntityAll(
  entities: MessageEntity[],
  text: string,
  span: string | undefined,
  type: MessageEntity["type"],
): void {
  if (!span) return;
  let from = 0;
  while (from < text.length) {
    const idx = text.indexOf(span, from);
    if (idx < 0) break;
    entities.push({ type, offset: idx, length: span.length } as MessageEntity);
    from = idx + span.length;
  }
}

function buildWelcomePayload(
  ctx: AppContext,
  user: UserRow,
  inviterDisplay: string | null,
  lang: Lang,
): WelcomePayload {
  const dict = t(lang);
  const tgLink = buildInviteLink(ctx.state.botUsername, user.ref_code);
  const webLink = buildWebsiteLink(ctx.state.websiteUrl, user.ref_code);
  const firstName = user.first_name ?? ctx.from?.first_name ?? "";

  // Order: greeting → pitch → launch dates → bonus + "fill the form" push
  //      → section rule → 3-track CTA → site URL (primary action) → TG URL
  //      (secondary, for sharing with friends) → section rule → share / referrals
  //      → optional invited-by footer.
  const parts: string[] = [];
  parts.push(dict.welcome_greeting(firstName));
  parts.push("");
  parts.push(dict.welcome_pitch);
  parts.push("");
  parts.push(dict.welcome_launch);
  parts.push("");
  parts.push(dict.welcome_bonus);
  parts.push("");
  parts.push(SECTION_RULE);
  parts.push("");
  parts.push(dict.welcome_site_cta);
  parts.push("");
  parts.push(dict.welcome_ai_cta);
  parts.push("");
  parts.push(dict.welcome_token);
  parts.push("");
  parts.push(`${dict.your_website_link}\n${webLink}`);
  parts.push("");
  parts.push(`${dict.your_link}\n${tgLink}`);
  parts.push("");
  parts.push(SECTION_RULE);
  parts.push("");
  parts.push(dict.welcome_share);
  if (inviterDisplay) {
    parts.push("");
    parts.push(dict.welcome_invited_by(inviterDisplay));
  }
  const text = parts.join("\n");

  const entities: MessageEntity[] = [];

  // URLs as `code` (tap-to-copy).
  addEntityAll(entities, text, tgLink, "code");
  addEntityAll(entities, text, webLink, "code");

  // Bold accents — language-aware key phrases + product name + first name.
  const bolds = [...BOLD_PHRASES_BY_LANG[lang]];
  if (firstName) bolds.push(firstName);
  for (const phrase of bolds) addEntityAll(entities, text, phrase, "bold");

  // Italic labels above each link.
  addEntityAll(entities, text, dict.your_link, "italic");
  addEntityAll(entities, text, dict.your_website_link, "italic");

  // Expandable blockquote for the long pitch — collapses by default and
  // expands on tap so the welcome doesn't feel like a wall of text.
  const pitchIdx = text.indexOf(dict.welcome_pitch);
  if (pitchIdx >= 0) {
    entities.push({
      type: "expandable_blockquote",
      offset: pitchIdx,
      length: dict.welcome_pitch.length,
    });
  }

  // Section separators in italic so they read as dividers, not noise.
  addEntityAll(entities, text, SECTION_RULE, "italic");

  // Swap fallback Unicode emoji that the @AIGolden Connect pack provides with
  // animated custom_emoji entities. Graceful no-op when pack empty or
  // entity gets dropped server-side (non-Premium owner).
  const emojiMap = ctx.state.customEmoji;
  for (const [fallback, id] of emojiMap) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(fallback, from);
      if (idx < 0) break;
      entities.push({
        type: "custom_emoji",
        offset: idx,
        length: fallback.length,
        custom_emoji_id: id,
      });
      from = idx + fallback.length;
    }
  }

  // Telegram expects entities sorted by (offset, -length); for overlaps
  // with expandable_blockquote the deeper entity must come after the
  // enclosing one, else the client drops it. Sorting by offset then
  // length desc does the right thing.
  entities.sort((a, b) => (a.offset - b.offset) || (b.length - a.length));
  return { text, entities, tgLink, webLink };
}

function buildStartKeyboard(
  ctx: AppContext,
  lang: Lang,
  webLink: string,
  tgLink: string,
): InlineKeyboard {
  const dict = t(lang);
  // Kept for legacy callers that compose share/web links — currently unused
  // by the new grid layout (the WebApp button is the single primary CTA).
  void buildShareUrl(tgLink, dict.share_text(webLink));
  void webLink;

  // Phase 3A: full feature grid replaces the slim 3-button welcome.
  // Row 1 — single primary CTA: open the cabinet inside the TG WebView.
  // Rows 2-6 — 2x5 grid of every Phase 1 feature, mapped to `menu:*`
  // callbacks that re-enter the existing command handlers.
  // Row 7 — utility row: language picker + help.
  // Admin button stays at the bottom for elevated users only.
  const kb = new InlineKeyboard()
    .webApp(tr(lang, "menu.btn_cabinet"), ctx.state.webappUrl)
    .row()
    .text(tr(lang, "menu.btn_ref"), "menu:ref")
    .text(tr(lang, "menu.btn_team"), "menu:team")
    .row()
    .text(tr(lang, "menu.btn_quests"), "menu:quests")
    .text(tr(lang, "menu.btn_missions"), "menu:missions")
    .row()
    .text(tr(lang, "menu.btn_quiz"), "menu:quiz")
    .text(tr(lang, "menu.btn_top"), "menu:top")
    .row()
    .text(tr(lang, "menu.btn_events"), "menu:events")
    .text(tr(lang, "menu.btn_promo"), "menu:promo")
    .row()
    .text(tr(lang, "menu.btn_video"), "menu:video")
    .text(tr(lang, "menu.btn_stats"), "menu:stats")
    .row()
    .text(tr(lang, "menu.btn_lang"), "menu:lang")
    .text(tr(lang, "menu.btn_help"), "menu:help")
    .row()
    .text("🔑 Восстановить пароль", "menu:password");

  if (isAdmin(ctx.state, ctx.from?.id)) {
    kb.row().text(dict.btn_admin, "admin:open").danger();
  }
  return kb;
}

/**
 * Build the language picker submenu — shown when the user taps `menu:lang`.
 * Each button reuses the existing `lang:<code>` callback (registered in
 * `callbacks.ts`) so picking a language re-renders the start screen in
 * the new locale. The trailing "back" button returns to the main menu.
 *
 * Locale labels stay in their native script regardless of `lang` so the
 * picker reads natively to a user who hasn't switched yet.
 */
export function buildLangPickerKeyboard(lang: Lang): InlineKeyboard {
  return new InlineKeyboard()
    .text("🇷🇺 Русский", "lang:ru")
    .text("🇬🇧 English", "lang:en")
    .row()
    .text("🇨🇳 中文", "lang:zh")
    .text("🇺🇿 O'zbek", "lang:uz")
    .row()
    .text("🇵🇭 Filipino", "lang:fil")
    .text("🇹🇭 ไทย", "lang:th")
    .row()
    .text(tr(lang, "menu.btn_back"), "menu:main");
}

export function buildStartMessage(
  ctx: AppContext,
  user: UserRow,
  inviterDisplay: string | null,
  lang: Lang,
): { text: string; entities: MessageEntity[]; kb: InlineKeyboard } {
  const p = buildWelcomePayload(ctx, user, inviterDisplay, lang);
  return {
    text: p.text,
    entities: p.entities,
    kb: buildStartKeyboard(ctx, lang, p.webLink, p.tgLink),
  };
}

export function formatInviter(ctx: AppContext, inviter: UserRow, lang: Lang): string {
  if (inviter.tg_id === ctx.state.adminTgId) {
    return t(lang).inviter_founder(`@${ctx.state.founderUsername}`);
  }
  if (inviter.username) return `@${inviter.username}`;
  if (inviter.first_name) return inviter.first_name;
  return String(inviter.tg_id);
}

export async function inviterDisplayFor(
  ctx: AppContext,
  user: UserRow,
  lang: Lang,
): Promise<string | null> {
  if (!user.invited_by_user_id) return null;
  const inviter = await ctx.state.repoUsers.findById(user.invited_by_user_id);
  if (!inviter) return null;
  return formatInviter(ctx, inviter, lang);
}

async function* chunkedStream(text: string): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += STREAM_CHUNK_SIZE) {
    yield text.slice(i, i + STREAM_CHUNK_SIZE);
    await sleep(STREAM_CHUNK_DELAY_MS);
  }
}

/**
 * Login-link handler. When the website sends a user to
 * `t.me/<bot>?start=login_<token>` the deep-link lands here. We verify
 * the token with golden-connect-api (single-use, TTL'd) and bind the session
 * to the Telegram user on the api side. Returns early on any outcome —
 * we never fall through to onboarding for a login-link.
 */
async function handleLoginPayload(
  ctx: AppContext,
  token: string,
): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  // Three terminal outcomes. All localised to the user's TG-client
  // language so the message feels native even before we've touched the DB.
  const lang = pickLang(from.language_code);
  const msgs: Record<Lang, { ok: string; gone: string; net: string }> = {
    en: {
      ok: "✅ Successfully linked with the site. Head back to golden-connect.to — you're signed in.",
      gone: "⛔ This link is expired or not found. Generate a new one on the site.",
      net: "Connection error, please try again later.",
    },
    ru: {
      ok: "✅ Успешно связано с сайтом. Возвращайтесь на golden-connect.to — вы залогинены.",
      gone: "⛔ Ссылка устарела или не найдена. Сгенерируйте новую на сайте.",
      net: "Ошибка связи, попробуйте позже.",
    },
    zh: {
      ok: "✅ 已成功与网站关联。返回 golden-connect.to —— 你已登录。",
      gone: "⛔ 此链接已过期或未找到。请在网站上生成新链接。",
      net: "连接错误，请稍后再试。",
    },
    uz: {
      ok: "✅ Sayt bilan muvaffaqiyatli bog'landi. golden-connect.to saytiga qayting — siz tizimga kirdingiz.",
      gone: "⛔ Havola eskirgan yoki topilmadi. Saytda yangisini yarating.",
      net: "Ulanish xatosi, keyinroq urinib ko'ring.",
    },
    fil: {
      ok: "✅ Matagumpay na na-link sa site. Bumalik sa golden-connect.to — naka-sign in ka na.",
      gone: "⛔ Expired o hindi natagpuan ang link na ito. Mag-generate ng bago sa site.",
      net: "May error sa koneksyon, subukan ulit mamaya.",
    },
    th: {
      ok: "✅ เชื่อมโยงกับเว็บไซต์สำเร็จ กลับไปที่ golden-connect.to — คุณเข้าสู่ระบบแล้ว",
      gone: "⛔ ลิงก์หมดอายุหรือไม่พบ กรุณาสร้างลิงก์ใหม่บนเว็บไซต์",
      net: "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่ภายหลัง",
    },
  };
  const msg = msgs[lang];

  try {
    await ctx.state.apiClient.verifyTgLink(
      token,
      from.id,
      from.username ?? null,
    );
    await ctx.reply(msg.ok);
    return;
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 410 || e.status === 404) {
        await ctx.reply(msg.gone);
        return;
      }
      // network error is represented as status 0 in ApiClient
      if (e.status === 0) {
        ctx.state.logger.warn(
          { err: e.message, tg_id: from.id },
          "tg-link-verify network error",
        );
        await ctx.reply(msg.net);
        return;
      }
    }
    ctx.state.logger.error(
      { err: (e as Error).message, tg_id: from.id },
      "tg-link-verify failed",
    );
    await ctx.reply(msg.net);
  }
}

/**
 * Deep-link handler for `/start event_<id>`. Shows the event card as a
 * follow-up message (non-terminal — caller decides whether to also run
 * the welcome path). Fire-and-forget friendly; swallows all errors.
 */
async function handleEventDeepLink(ctx: AppContext, id: number): Promise<void> {
  try {
    const ev = await ctx.state.repoEvents.get(id);
    if (!ev) return;
    const { InlineKeyboard } = await import("grammy");
    const kb = new InlineKeyboard().text("🔔 Записаться", `ev:reg:${id}`).row();
    if (ev.join_url) kb.url("▶️ Ссылка на эфир", ev.join_url);
    const when = new Date(ev.starts_at).toLocaleString("ru-RU", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    const body =
      `📡 <b>${ev.title}</b>\n` +
      (ev.topic ? `${ev.topic}\n` : "") +
      `\n📅 ${when} МСК · эфир GOLDEN_CONNECT\n\n` +
      "Жми «Записаться» — пришлю напоминания за 24 часа и за час до старта.";
    await ctx.reply(body, {
      parse_mode: "HTML",
      reply_markup: kb,
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    ctx.state.logger.warn(
      { err: (e as Error).message, id },
      "event deep-link failed",
    );
  }
}

// [c2-crm-start] Look up active tariff via /internal/finance/balances.
// Returns lowercase code ('launch'|'boost'|'rocket'|'free'|null) and the
// expires_at ISO. Errors are swallowed and treated as 'free' so a flaky
// api call still lets users into the paywall path rather than dead-ending.
interface CrmTariffInfo { code: string; expiresAt: string | null; isExpired: boolean }
async function _fetchCrmTariff(ctx: AppContext, userId: number): Promise<CrmTariffInfo> {
  try {
    interface R { ok: boolean; tariff?: { code: string; expires_at: string | null } }
    const data = await ctx.state.apiClient.getJson<R>(`/internal/finance/balances?user_id=${userId}`);
    const code = data?.tariff?.code ? String(data.tariff.code).toLowerCase() : 'free';
    const expiresAt = data?.tariff?.expires_at ?? null;
    const isExpired = !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
    return { code, expiresAt, isExpired };
  } catch {
    return { code: 'free', expiresAt: null, isExpired: false };
  }
}

function _buildCrmMenu(name: string, tariff: CrmTariffInfo, webappUrl: string): {
  text: string; kb: InlineKeyboard;
} {
  const crmUrl = (process.env.CRM_WEBAPP_URL || webappUrl + '/crm-app.html');
  const tariffLabel = tariff.code.toUpperCase();
  const text =
    `🎯 <b>Golden Connect CRM — твой личный ассистент</b>\n` +
    `\n` +
    `Привет, <b>${name}</b>! Тариф: <b>${tariffLabel}</b> ✅\n` +
    `\n` +
    `📋 База 7 322 MLM-лидеров готова. Веди их в воронке, ставь задачи, отправляй AI-питчи.\n` +
    `\n` +
    `<b>Главные команды:</b>\n` +
    `• /today — кого вести сегодня\n` +
    `• /find <i>имя</i> — поиск по базе\n` +
    `• /addlead — добавить контакт вручную\n` +
    `• /pitch <i>username</i> — AI-питч для контакта\n` +
    `• /pipeline — воронка сделок\n` +
    `• /dashboard — статистика\n` +
    `\n` +
    `💡 <i>Скоро: проактивные напоминания «кому позвонить сегодня», голосовые → CRM-история, фото визитки → лид</i>`;
  const kb = new InlineKeyboard()
    .webApp('📋 Открыть CRM', crmUrl)
    .row()
    .text('📅 На сегодня', 'crm:today')
    .text('🔍 Поиск', 'crm:find_hint')
    .row()
    .text('📊 Воронка', 'crm:pipeline')
    .text('📈 Статистика', 'crm:stats')
    .row()
    .text('➕ Добавить лида', 'crm:add')
    .text('✨ AI-питч', 'crm:pitch_hint');
  return { text, kb };
}

function _buildCrmPaywall(name: string, tariff: CrmTariffInfo, webappUrl: string): {
  text: string; kb: InlineKeyboard;
} {
  const buyUrl = webappUrl + '/#/marketing';
  const statusLine = tariff.isExpired
    ? `<b>Подписка истекла:</b> ${tariff.code.toUpperCase()} (${tariff.expiresAt ? new Date(tariff.expiresAt).toLocaleDateString('ru-RU') : '—'})`
    : `<b>Твой тариф:</b> ${tariff.code.toUpperCase() || 'FREE'}`;
  const text =
    `🎯 <b>Golden Connect CRM — твой личный ассистент</b>\n` +
    `\n` +
    `Привет, <b>${name}</b>!\n` +
    `\n` +
    `📋 Здесь у тебя будет:\n` +
    `• База 7 322 MLM-лидеров\n` +
    `• AI-питчи под каждый контакт\n` +
    `• Воронка сделок + задачи\n` +
    `• Уведомления «кому позвонить сегодня»\n` +
    `\n` +
    `🔒 CRM открывается на тарифах:\n` +
    `• <b>LAUNCH</b> — $45 единоразово + $15/мес\n` +
    `• <b>BOOST</b> — $90 + $30/мес\n` +
    `• <b>ROCKET</b> — $135 + $45/мес\n` +
    `\n` +
    statusLine + `\n` +
    `\n` +
    `Нажми «Купить тариф» — внутри кабинета выберешь любой и оплатишь криптой.`;
  const kb = new InlineKeyboard()
    .webApp('💎 Купить тариф', buyUrl)
    .row()
    .url('📖 Что даёт CRM', 'https://golden-connect.to/#whats-new')
    .row()
    .webApp('🌐 Открыть кабинет', webappUrl);
  return { text, kb };
}

export async function onStart(ctx: AppContext): Promise<void> {
  const from = ctx.from;
  if (!from) return;

  const repo = ctx.state.repoUsers;
  const payload = ctx.match && typeof ctx.match === "string" ? ctx.match : undefined;

  // Login deep-link MUST run before the gated/brand-new check: users
  // following a login link almost never have a ref code, and we don't
  // want them to hit the gated screen mid-login. Token-verify result is
  // terminal — we reply and return regardless of outcome.
  if (payload && payload.startsWith(LOGIN_PAYLOAD_PREFIX)) {
    const token = payload.slice(LOGIN_PAYLOAD_PREFIX.length).trim();
    if (token) {
      await handleLoginPayload(ctx, token);
      return;
    }
  }

  // Event deep-link — open the event card. Existing users just see it
  // inline; brand-new users fall through to the normal /start onboarding
  // (the event card fires as a second message from /events).
  if (payload && payload.startsWith(EVENT_PAYLOAD_PREFIX)) {
    const idRaw = payload.slice(EVENT_PAYLOAD_PREFIX.length).trim();
    const id = Number(idRaw);
    if (Number.isFinite(id) && id > 0) {
      await handleEventDeepLink(ctx, id);
      // Intentional: don't return — allow regular /start to proceed so
      // a brand-new user still sees the welcome. For an EXISTING user
      // this is fine (they already see welcome every /start anyway).
    }
  }

  const inviterCode = parseStartPayload(payload);

  let user = await repo.findByTgId(from.id);
  let pendingInviter: UserRow | null = null;
  const isBrandNew = user === undefined;

  // Invite-only: a brand-new user without a valid ref payload is sent a
  // gated screen instead of the welcome. Existing users + members of the
  // admin set (founder, co-admins) always pass.
  if (isBrandNew && !inviterCode && !isAdmin(ctx.state, from.id)) {
    const lang = pickLang(from.language_code);
    const dict = t(lang);
    await ctx.reply(`*${dict.gated_title}*\n\n${dict.gated_body}`, {
      parse_mode: "Markdown",
    });
    return;
  }

  if (!user) {
    user = await repo.createUser({
      tg_id: from.id,
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      language_code: from.language_code ?? null,
      invited_by_ref_code: inviterCode,
    });

    if (inviterCode) {
      const inviter = await repo.findByRefCode(inviterCode);
      if (inviter) {
        pendingInviter = inviter;
      } else {
        await repo.recordPendingReferral(from.id, inviterCode);
      }
    }

    await repo.resolvePending(user.ref_code);
  } else {
    await repo.touch(from.id, {
      username: from.username ?? null,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      language_code: from.language_code ?? null,
    });
  }

  const lang = pickLang(user.language_code);

  // Fire-and-forget: if this is a brand-new user with an inviter, notify the
  // upline. Done BEFORE returning from the short hero path so the up-the-
  // chain pings still fire on the new flow too.
  if (isBrandNew && user.invited_by_user_id !== null) {
    const startedUser = user;
    void notifyAncestorsOfNewReferral(
      { bot: { api: ctx.api }, users: repo, logger: ctx.state.logger },
      startedUser,
    ).catch((e) =>
      ctx.state.logger.warn(
        { err: (e as Error).message, user_id: startedUser.id },
        "notifyAncestorsOfNewReferral crashed",
      ),
    );

    // Phase 1A funnel: record a referrals row at stage='invited'. Cron
    // refreshes the stage based on the invitee's actual state (activity,
    // booking, paid). Idempotent — re-running /start by the same user
    // won't double-write.
    const referrerId = user.invited_by_user_id;
    const inviteeId = user.id;
    const source = "bot";
    void ctx.state.repoReferrals
      .attach(referrerId, inviteeId, source)
      .catch((e) =>
        ctx.state.logger.warn(
          { err: (e as Error).message, referrerId, inviteeId },
          "referrals.attach crashed",
        ),
      );
  }

  // Video-first onboarding: users who haven't confirmed the presentation
  // yet see the short hero (1 line + "▶ Watch 90s intro"). After they tap
  // through the pres:watch → pres:done flow we mark `presented_at` and
  // send the follow-up. Existing users with presented_at set bypass and
  // get the full long welcome (their second /start invocation).
  // [c2-crm-start] Replace legacy hero/welcome with CRM-focused menu.
  // Paid users → main CRM menu. Free/expired → paywall.
  // Deep-link payloads (login_/event_) already handled above and returned.
  try {
    const _tariff = await _fetchCrmTariff(ctx, user.id);
    const _name = user.first_name ?? ctx.from?.first_name ?? 'друг';
    const _isPaid = ['launch', 'boost', 'rocket'].includes(_tariff.code) && !_tariff.isExpired;
    const _webappUrl = (process.env.WEBAPP_URL || 'https://golden-connect.to/cabinet');
    const built = _isPaid
      ? _buildCrmMenu(_name, _tariff, _webappUrl)
      : _buildCrmPaywall(_name, _tariff, _webappUrl);
    await ctx.reply(built.text, {
      parse_mode: 'HTML',
      reply_markup: built.kb,
      link_preview_options: { is_disabled: true },
    });
    return;
  } catch (e) {
    ctx.state.logger.warn(
      { err: (e as Error).message, user_id: user.id },
      '[c2-crm-start] failed, falling back to legacy welcome',
    );
    // fall through to legacy hero/welcome
  }

  if (user.presented_at === null) {
    const hero = buildHeroMessage(lang, user.first_name ?? ctx.from?.first_name ?? null);
    await ctx.reply(hero.text, { reply_markup: hero.kb });
    return;
  }

  const inviterDisplay = pendingInviter
    ? formatInviter(ctx, pendingInviter, lang)
    : await inviterDisplayFor(ctx, user, lang);
  const { text, entities, kb } = buildStartMessage(ctx, user, inviterDisplay, lang);

  try {
    // draft opts (sendMessageDraft) only accept parse_mode / entities, so
    // reply_markup + link_preview_options + entities all ride the final
    // sendMessage. Streaming drafts stay plain so nothing splits across a
    // chunk boundary.
    await ctx.replyWithStream(
      chunkedStream(text),
      {},
      {
        reply_markup: kb,
        entities,
        link_preview_options: { is_disabled: true },
      },
    );
  } catch (e) {
    ctx.state.logger.warn(
      { err: (e as Error).message },
      "replyWithStream failed, falling back to reply",
    );
    await ctx.reply(text, {
      reply_markup: kb,
      entities,
      link_preview_options: { is_disabled: true },
    });
  }
}
