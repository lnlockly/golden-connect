import type { Lang } from "../types.js";

type Dict = {
  welcome_greeting: (name: string) => string;
  welcome_pitch: string;
  welcome_launch: string;
  welcome_bonus: string;
  welcome_site_cta: string;
  welcome_ai_cta: string;
  welcome_token: string;
  welcome_share: string;
  welcome_invited_by: (who: string) => string;
  inviter_founder: (handle: string) => string;
  your_link: string;
  your_website_link: string;
  btn_stats: string;
  btn_copy_link: string;
  btn_copy_web_link: string;
  btn_lang: string;
  btn_admin: string;
  btn_open_website: string;
  btn_main_menu: string;
  btn_back_admin: string;
  btn_admin_leads: string;
  btn_admin_reminders: string;
  stats_title: string;
  stats_ref_code: string;
  stats_link: string;
  stats_direct: string;
  stats_total: string;
  stats_depth: string;
  stats_joined_24h: string;
  stats_joined_7d: string;
  stats_breakdown: string;
  stats_level_label: (n: number) => string;
  help_title: string;
  help_body: string;
  lang_set: (l: string) => string;
  lang_usage: string;
  unknown_cmd: string;
  notif_new_referral: (who: string, level: number, total: number) => string;
  notif_level_direct: string;
  notif_level_deep: (n: number) => string;
  notif_disabled_toast: string;
  btn_notif_off: string;

  share_text: (siteUrl: string) => string;
  btn_share: string;
  btn_notif_on: string;
  btn_notif_ref_off: string;

  gated_title: string;
  gated_body: string;

  cabinet_profile_heading: string;
  cabinet_name_label: string;
  cabinet_joined_label: string;
  cabinet_lang_label: string;
  cabinet_applied_label: string;
  cabinet_applied_yes: string;
  cabinet_applied_no: string;
  cabinet_links_heading: string;
  cabinet_tg_link_label: string;
  cabinet_site_link_label: string;
  cabinet_network_heading: string;
  cabinet_earnings_heading: string;
  cabinet_earnings_welcome: string;
  cabinet_earnings_refs: string;
  cabinet_earnings_total: string;
  cabinet_earnings_pending: string;
  cabinet_notifs_heading: string;
  cabinet_notifs_ref_on: string;
  cabinet_notifs_ref_off: string;
};

const en: Dict = {
  welcome_greeting: (name) =>
    name ? `Hey ${name} 😀 — welcome to GOLDEN_CONNECT.` : "Welcome to GOLDEN_CONNECT. 😀",
  welcome_pitch:
    "GOLDEN_CONNECT is a new-generation advertising ecosystem. Businesses get real attention, users get paid for activity, partners get a share of the platform's turnover. One flow — three wins.",
  welcome_launch:
    "🚀 Pre-launch is live. Every milestone and early-access drop lands here first.",
  welcome_bonus:
    "🎁 Early access = x2 advertising budget for businesses and a reserved seat in the network for everyone else. The window closes on launch day.",
  welcome_site_cta:
    "🌐 Open the site — check how the three roles (business, users, partners) work inside GOLDEN_CONNECT, see built-in tools for traffic, and pick your path.",
  welcome_ai_cta:
    "🤖 Got questions? Just write here (voice messages too) — the assistant in the bot answers anything about GOLDEN_CONNECT and helps you get set up. Type /reset anytime to start over.",
  welcome_token:
    "💎 Registration is free. Payouts start from the first day of activity — no obligations, no hidden fees.",
  welcome_share:
    "Share your link — every signup through you grows the network, and the network's turnover is what pays partners.",
  welcome_invited_by: (who) => `You were invited by ${who}. 🎁`,
  inviter_founder: (handle) => `the GOLDEN_CONNECT founder ${handle} ✨`,
  your_link: "Your Telegram invite link (to share with friends):",
  your_website_link: "👉 Your site link — open and register:",
  btn_stats: "📊 My stats",
  btn_copy_link: "🔗 Copy TG link",
  btn_copy_web_link: "🌐 Copy site link",
  btn_lang: "🌐 EN / RU / 中文",
  btn_admin: "🛠 Admin panel",
  btn_open_website: "🌐 Open site",
  btn_main_menu: "🏠 Main menu",
  btn_back_admin: "← Admin menu",
  btn_admin_leads: "📬 Leads",
  btn_admin_reminders: "📨 Reminders",
  stats_title: "📊 Your GOLDEN_CONNECT team",
  stats_ref_code: "Ref code",
  stats_link: "Link",
  stats_direct: "Direct invites",
  stats_total: "Total network",
  stats_depth: "Max depth",
  stats_joined_24h: "New in 24h",
  stats_joined_7d: "New in 7d",
  stats_breakdown: "By level",
  stats_level_label: (n) => `lvl ${n}`,
  help_title: "Commands",
  help_body:
    "/start — onboarding\n/me, /stats — your referral stats\n/app — open GOLDEN_CONNECT cabinet\n/quests — your quests + XP\n/missions — 7-day programmes\n/quiz — pick a role / tariff\n/top — leaderboard\n/lang en|ru|zh — switch language\n/help — this message",
  lang_set: (l) => `Language set to ${l}. ✅`,
  lang_usage: "Usage: /lang en | ru | zh",
  unknown_cmd: "Unknown command. Try /help.",
  notif_new_referral: (who, level, total) => {
    const levelLabel = level === 1 ? "direct" : `level ${level}`;
    return (
      `👥 <b>New referral in your network!</b>\n\n` +
      `${who} just joined GOLDEN_CONNECT\n` +
      `Tier: ${levelLabel}\n\n` +
      `Total in your network: <b>${total}</b>`
    );
  },
  notif_level_direct: "direct",
  notif_level_deep: (n) => `level ${n}`,
  notif_disabled_toast: "Notifications disabled.",
  btn_notif_off: "🔕 Turn these notifications off",

  share_text: (siteUrl) =>
    `🚀 I'm on GOLDEN_CONNECT — an advertising ecosystem where businesses, users and partners all win. ` +
    `Join with my link and grab early access (x2 budget for business accounts) ✨\n\nSite: ${siteUrl}`,
  btn_share: "📤 Share to chat",
  btn_notif_on: "🔔 Notifications: on",
  btn_notif_ref_off: "🔕 Mute referral pings",

  gated_title: "🔒 GOLDEN_CONNECT is invite-only during pre-launch",
  gated_body:
    "Access is only via a personal referral link from an existing member. " +
    "Ask whoever told you about GOLDEN_CONNECT for their link and open it again.\n\n" +
    "No link yet? Follow our channels for the public launch date.",

  cabinet_profile_heading: "👤 Profile",
  cabinet_name_label: "Name",
  cabinet_joined_label: "Joined",
  cabinet_lang_label: "Language",
  cabinet_applied_label: "Site form",
  cabinet_applied_yes: "✅ submitted",
  cabinet_applied_no: "⏳ not submitted",
  cabinet_links_heading: "🔗 Your links",
  cabinet_tg_link_label: "Telegram",
  cabinet_site_link_label: "Website",
  cabinet_network_heading: "📈 Network",
  cabinet_earnings_heading: "💰 Earnings",
  cabinet_earnings_welcome: "Welcome bonus",
  cabinet_earnings_refs: "From referrals",
  cabinet_earnings_total: "Total",
  cabinet_earnings_pending: "— (credited after launch)",
  cabinet_notifs_heading: "🔔 Notifications",
  cabinet_notifs_ref_on: "New referral pings: on",
  cabinet_notifs_ref_off: "New referral pings: off",
};

const ru: Dict = {
  welcome_greeting: (name) =>
    name
      ? `Привет, ${name} 😀 — добро пожаловать в GOLDEN_CONNECT.`
      : "Добро пожаловать в GOLDEN_CONNECT. 😀",
  welcome_pitch:
    "GOLDEN_CONNECT — рекламная экосистема нового поколения. Бизнес получает внимание аудитории, пользователи — доход за активность, партнёры — долю от оборота платформы. Один поток — три выгоды.",
  welcome_launch:
    "🚀 Идёт предзапуск. Все даты и условия раннего доступа — сюда первыми.",
  welcome_bonus:
    "🎁 Ранний доступ = x2 рекламный бюджет для бизнеса и закреплённое место в сети для всех остальных. Окно закрывается в день запуска.",
  welcome_site_cta:
    "🌐 Заходи на сайт — там видно, как устроены три роли (бизнес, пользователи, партнёры), какие инструменты для трафика встроены в платформу, и какую роль выбрать тебе.",
  welcome_ai_cta:
    "🤖 Есть вопросы? Просто напиши сюда (голосовые тоже ок) — ассистент в боте ответит на любой вопрос про GOLDEN_CONNECT и поможет разобраться. /reset — начать заново.",
  welcome_token:
    "💎 Регистрация бесплатна. Выплаты начисляются с первого дня активности — без обязательств и скрытых комиссий.",
  welcome_share:
    "Делись ссылкой — каждый регистрацией ты растишь сеть, а оборот сети — это то, с чего получают партнёры.",
  welcome_invited_by: (who) => `Тебя пригласил(а) ${who}. 🎁`,
  inviter_founder: (handle) => `основатель GOLDEN_CONNECT ${handle} ✨`,
  your_link: "Твоя реферальная ссылка в Telegram (делись с друзьями):",
  your_website_link: "👉 Твоя ссылка на сайт — зайди и зарегистрируйся:",
  btn_stats: "📊 Моя команда",
  btn_copy_link: "🔗 TG-ссылка",
  btn_copy_web_link: "🌐 Ссылка на сайт",
  btn_lang: "🌐 EN / RU / 中文",
  btn_admin: "🛠 Админка",
  btn_open_website: "🌐 Открыть сайт",
  btn_main_menu: "🏠 Главное меню",
  btn_back_admin: "← Админ-меню",
  btn_admin_leads: "📬 Заявки",
  btn_admin_reminders: "📨 Напоминания",
  stats_title: "📊 Твоя команда GOLDEN_CONNECT",
  stats_ref_code: "Реф-код",
  stats_link: "Ссылка",
  stats_direct: "Прямых приглашений",
  stats_total: "Всего в сети",
  stats_depth: "Макс. глубина",
  stats_joined_24h: "Новых за 24ч",
  stats_joined_7d: "Новых за 7д",
  stats_breakdown: "По уровням",
  stats_level_label: (n) => `${n} ур.`,
  help_title: "Команды",
  help_body:
    "/start — онбординг\n/me, /stats — твоя статистика\n/app — открыть кабинет GOLDEN_CONNECT\n/quests — твои квесты и XP\n/missions — 7-дневные программы\n/quiz — подбор роли / тарифа\n/top — лидерборд\n/lang en|ru|zh — сменить язык\n/help — справка",
  lang_set: (l) => `Язык установлен: ${l}. ✅`,
  lang_usage: "Использование: /lang en | ru | zh",
  unknown_cmd: "Неизвестная команда. Попробуй /help.",
  notif_new_referral: (who, level, total) => {
    const levelLabel = level === 1 ? "прямой" : `${level}-й уровень`;
    return (
      `👥 <b>Новый реферал в твоей сети!</b>\n\n` +
      `${who} только что зашёл в GOLDEN_CONNECT\n` +
      `Уровень: ${levelLabel}\n\n` +
      `Всего в твоей сети: <b>${total}</b>`
    );
  },
  notif_level_direct: "прямой",
  notif_level_deep: (n) => `${n}-й уровень`,
  notif_disabled_toast: "Уведомления отключены.",
  btn_notif_off: "🔕 Выключить эти уведомления",

  share_text: (siteUrl) =>
    `🚀 Я в GOLDEN_CONNECT — рекламной экосистеме, где выигрывают и бизнес, и пользователи, и партнёры. ` +
    `Заходи по моей ссылке, успей взять ранний доступ (x2 рекламный бюджет для бизнеса) ✨\n\nСайт: ${siteUrl}`,
  btn_share: "📤 Поделиться в чат",
  btn_notif_on: "🔔 Уведомления: вкл",
  btn_notif_ref_off: "🔕 Не уведомлять о новых рефералах",

  gated_title: "🔒 GOLDEN_CONNECT — закрытый доступ на время предзапуска",
  gated_body:
    "Попасть можно только по персональной реф-ссылке от участника. " +
    "Попроси ссылку у того, кто тебя сюда позвал, и открой её ещё раз.\n\n" +
    "Нет ссылки — следи за нашими каналами, дату публичного запуска опубликуем там.",

  cabinet_profile_heading: "👤 Профиль",
  cabinet_name_label: "Имя",
  cabinet_joined_label: "Регистрация",
  cabinet_lang_label: "Язык",
  cabinet_applied_label: "Анкета на сайте",
  cabinet_applied_yes: "✅ подана",
  cabinet_applied_no: "⏳ не подана",
  cabinet_links_heading: "🔗 Твои ссылки",
  cabinet_tg_link_label: "Telegram",
  cabinet_site_link_label: "Сайт",
  cabinet_network_heading: "📈 Сеть",
  cabinet_earnings_heading: "💰 Заработок",
  cabinet_earnings_welcome: "Welcome-бонус",
  cabinet_earnings_refs: "От рефералов",
  cabinet_earnings_total: "Всего",
  cabinet_earnings_pending: "— (начислим после запуска)",
  cabinet_notifs_heading: "🔔 Уведомления",
  cabinet_notifs_ref_on: "Пинги о новых рефералах: вкл",
  cabinet_notifs_ref_off: "Пинги о новых рефералах: выкл",
};

const zh: Dict = {
  welcome_greeting: (name) =>
    name ? `${name} 😀，欢迎来到 GOLDEN_CONNECT。` : "欢迎来到 GOLDEN_CONNECT。😀",
  welcome_pitch:
    "GOLDEN_CONNECT 是新一代广告生态系统。商家获得真实的用户注意力，用户因活跃获得收入，合作伙伴分享平台流水。一条流——三方共赢。",
  welcome_launch:
    "🚀 预发布进行中。所有里程碑与早期通道开放信息将在这里率先发布。",
  welcome_bonus:
    "🎁 早期通道 = 商家广告预算 x2，其他参与者锁定网络席位。窗口将在正式上线当天关闭。",
  welcome_site_cta:
    "🌐 去网站看看 —— 三种角色（商家、用户、合作伙伴）在 GOLDEN_CONNECT 里如何运作，平台自带哪些流量工具，选择适合你的方向。",
  welcome_ai_cta:
    "🤖 有疑问？直接在这里发消息（语音也行）—— 机器人里的助手会回答一切关于 GOLDEN_CONNECT 的问题，帮你顺利上手。随时发 /reset 重新开始。",
  welcome_token:
    "💎 注册免费。活跃的第一天起就能获得收益 —— 没有义务，没有隐藏费用。",
  welcome_share:
    "分享你的链接 —— 每一位通过你加入的人都让网络扩大，而网络的流水正是合作伙伴获得收益的来源。",
  welcome_invited_by: (who) => `你是通过 ${who} 被邀请的。🎁`,
  inviter_founder: (handle) => `GOLDEN_CONNECT 创始人 ${handle} ✨`,
  your_link: "你的 Telegram 邀请链接（分享给朋友）：",
  your_website_link: "👉 你的网站链接——打开并注册：",
  btn_stats: "📊 我的统计",
  btn_copy_link: "🔗 复制 TG 链接",
  btn_copy_web_link: "🌐 复制网站链接",
  btn_lang: "🌐 EN / RU / 中文",
  btn_admin: "🛠 管理面板",
  btn_open_website: "🌐 打开网站",
  btn_main_menu: "🏠 主菜单",
  btn_back_admin: "← 管理菜单",
  btn_admin_leads: "📬 申请",
  btn_admin_reminders: "📨 提醒",
  stats_title: "📊 你的 GOLDEN_CONNECT 团队",
  stats_ref_code: "推荐码",
  stats_link: "链接",
  stats_direct: "直接邀请",
  stats_total: "总网络人数",
  stats_depth: "最大深度",
  stats_joined_24h: "24 小时新增",
  stats_joined_7d: "7 天新增",
  stats_breakdown: "按层级",
  stats_level_label: (n) => `第 ${n} 层`,
  help_title: "命令",
  help_body:
    "/start — 上手\n/me, /stats — 你的统计\n/app — 打开 GOLDEN_CONNECT 账户\n/lang en|ru|zh — 切换语言\n/help — 帮助",
  lang_set: (l) => `语言已设为 ${l}。✅`,
  lang_usage: "用法：/lang en | ru | zh",
  unknown_cmd: "未知命令。试试 /help。",
  notif_new_referral: (who, level, total) => {
    const levelLabel = level === 1 ? "直接" : `第 ${level} 层`;
    return (
      `👥 <b>你的网络中有新的推荐！</b>\n\n` +
      `${who} 刚刚加入 GOLDEN_CONNECT\n` +
      `层级：${levelLabel}\n\n` +
      `你的网络总人数：<b>${total}</b>`
    );
  },
  notif_level_direct: "直接",
  notif_level_deep: (n) => `第 ${n} 层`,
  notif_disabled_toast: "通知已关闭。",
  btn_notif_off: "🔕 关闭此类通知",

  share_text: (siteUrl) =>
    `🚀 我在 GOLDEN_CONNECT —— 一个让商家、用户和合作伙伴共赢的广告生态。` +
    `用我的链接加入，抓住早期通道（商家账户 x2 广告预算）✨\n\n网站：${siteUrl}`,
  btn_share: "📤 分享到聊天",
  btn_notif_on: "🔔 通知：开启",
  btn_notif_ref_off: "🔕 关闭新推荐通知",

  gated_title: "🔒 GOLDEN_CONNECT —— 预发布阶段仅限邀请",
  gated_body:
    "只能通过现有成员的个人推荐链接加入。" +
    "请向邀请你来的人索要链接并重新打开。\n\n" +
    "还没有链接？关注我们的频道——公开上线日期将在那里公布。",

  cabinet_profile_heading: "👤 个人资料",
  cabinet_name_label: "姓名",
  cabinet_joined_label: "注册",
  cabinet_lang_label: "语言",
  cabinet_applied_label: "网站表单",
  cabinet_applied_yes: "✅ 已提交",
  cabinet_applied_no: "⏳ 未提交",
  cabinet_links_heading: "🔗 你的链接",
  cabinet_tg_link_label: "Telegram",
  cabinet_site_link_label: "网站",
  cabinet_network_heading: "📈 网络",
  cabinet_earnings_heading: "💰 收益",
  cabinet_earnings_welcome: "欢迎奖励",
  cabinet_earnings_refs: "推荐收益",
  cabinet_earnings_total: "总计",
  cabinet_earnings_pending: "— (上线后到账)",
  cabinet_notifs_heading: "🔔 通知",
  cabinet_notifs_ref_on: "新推荐通知：开启",
  cabinet_notifs_ref_off: "新推荐通知：关闭",
};

// The core Dict is tightly typed — we only have full translations for en/ru/zh
// in this registry. New Phase 2 locales (uz/fil/th) currently fall back to en
// for core keys but carry their own Phase 1 nested strings below.
const DICTS: Record<"en" | "ru" | "zh", Dict> = { en, ru, zh };

export function pickLang(langCode: string | null | undefined): Lang {
  if (!langCode) return "en";
  const c = langCode.toLowerCase();
  if (c.startsWith("ru")) return "ru";
  // Simplified Chinese (zh, zh-hans, zh-cn) maps to zh; traditional still falls back too.
  if (c.startsWith("zh")) return "zh";
  if (c.startsWith("uz")) return "uz";
  // Filipino / Tagalog — Telegram sends either fil or tl.
  if (c.startsWith("fil") || c.startsWith("tl")) return "fil";
  if (c.startsWith("th")) return "th";
  return "en";
}

export function t(lang: Lang): Dict {
  // DICTS only has en/ru/zh core copies. uz/fil/th fall back to en for
  // legacy-Dict-shaped keys (welcome, cabinet, stats). Their Phase 1 nested
  // keys still resolve through `tr()` / NESTED.
  const core = (DICTS as Record<string, Dict>)[lang];
  return core ?? en;
}

// ---------------------------------------------------------------------------
// Phase 0+ nested-key translation API — coexists with the legacy `t(lang)`
// dict lookup above. Callers that want dotted paths and placeholders use
// `tr(lang, key, vars)`; existing callers keep their `t(lang).foo_bar`
// access untouched.
//
// Why a second API instead of rewriting `t()`:
//   - The strongly typed Dict above is load-bearing for existing handlers
//     (TS catches missing keys at compile time). Flattening it to a
//     `Record<string, string>` loses that.
//   - Feature phases want to add new keys under namespaces like
//     `menu.events.register`, `drip.day0.body`, `quest.finisher.title`.
//     Extending `Dict` with nested branches breaks the cross-lang
//     exhaustiveness check, because each locale must mirror the shape.
//     A parallel, looser dict makes that tractable — per-locale partial
//     overrides fall back to EN automatically.
// ---------------------------------------------------------------------------

/**
 * Recursive nested dictionary. Leaves are strings that MAY contain
 * `{name}` placeholders (both `{x}` and `{{x}}` accepted — we strip the
 * outer braces symmetrically, so the two are equivalent at runtime).
 */
export type NestedDict = { [key: string]: string | NestedDict };

/**
 * Per-locale nested dictionaries used by feature phases. EMPTY at
 * Phase 0 — phases append their namespaces (e.g. `NESTED.en.menu = {...}`)
 * from their own bootstrap or by importing a helper. Consumers call
 * `tr(lang, 'menu.events.register')`.
 */
export const NESTED: Record<Lang, NestedDict> = {
  en: {},
  ru: {},
  zh: {},
  uz: {},
  fil: {},
  th: {},
};

/**
 * Merge a partial tree into one or more locales. Phases call this at
 * module top-level to register their strings in one place.
 *
 * Deep-merges by walking both sides recursively; leaf conflicts
 * overwrite silently (no warning — features intentionally override
 * shared namespaces sometimes).
 */
export function registerStrings(
  locale: Lang,
  tree: NestedDict,
): void {
  mergeInto(NESTED[locale], tree);
}

function mergeInto(target: NestedDict, src: NestedDict): void {
  for (const [k, v] of Object.entries(src)) {
    const existing = target[k];
    if (
      typeof v === 'object' &&
      v !== null &&
      typeof existing === 'object' &&
      existing !== null
    ) {
      mergeInto(existing as NestedDict, v);
    } else {
      target[k] = v;
    }
  }
}

function lookup(dict: NestedDict, path: string[]): string | undefined {
  let cur: string | NestedDict | undefined = dict;
  for (const seg of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as NestedDict)[seg];
    if (cur === undefined) return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

/** Replace `{x}` / `{{x}}` with vars[x]. Unknown placeholders stay literal. */
function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  // Handle {{x}} first so we don't double-replace the inner {x}.
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{{${name}}}`,
    )
    .replace(/\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (_, name: string) =>
      name in vars ? String(vars[name]) : `{${name}}`,
    );
}

/**
 * Nested-key translation with placeholders.
 *
 * Resolution order:
 *   1. NESTED[lang][key]  — the requested locale
 *   2. NESTED['en'][key]  — fallback
 *   3. the raw key         — last-resort so missing strings are visible
 *      in QA, not silently empty
 *
 * Examples:
 *   tr('ru', 'menu.events.register')
 *   tr('en', 'welcome.hi', { name: 'Ivan' })   // 'Hi {name}' → 'Hi Ivan'
 */
export function tr(
  lang: Lang,
  key: string,
  vars?: Record<string, unknown>,
): string {
  const path = key.split('.');
  const primary = lookup(NESTED[lang] ?? {}, path);
  if (primary !== undefined) return interpolate(primary, vars);
  const fallback = lookup(NESTED.en, path);
  if (fallback !== undefined) return interpolate(fallback, vars);
  return key;
}
