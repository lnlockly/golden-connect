/**
 * Phase 1B string namespaces — events / drip / nudge / digest.
 *
 * Loaded for its side effects from bot/src/index.ts so the NESTED dict
 * is populated before any handler fires.
 *
 * Phase 2B: placeholders replaced with TrendeX tone-of-voice copy.
 * Tone refs: bot/src/bot/commands/start.ts, help.ts, presentation.ts
 * (дружелюбный, бизнес, без health/MLM темы). Uses TRENDEX as the
 * product spelling consistent with the rest of the codebase.
 */
import { registerStrings } from "./i18n.js";

registerStrings("ru", {
  events: {
    title_upcoming: "Ближайшие эфиры TRENDEX",
    section: {
      my: "Ты записан(а) на",
      all: "Все ближайшие эфиры",
    },
    speakers: "Спикеры:",
    empty:
      "📡 Пока нет запланированных эфиров.\n\n" +
      "Мы публикуем вебинары про запуск рекламы, партнёрский план и обновления платформы. Загляни позже — здесь появятся новые даты.",
    need_start: "Сначала пройди /start — нужен аккаунт TRENDEX.",
    not_found: "Эфир не найден или уже завершён.",
    register_failed: "Не получилось записаться, попробуй ещё раз через минуту.",
    registered_ok: "✅ Ты в списке!",
    registered_body:
      "✅ Ты записан(а) на «{title}».\n\n" +
      "Пришлю напоминания за 24 часа и за час до старта, а в момент начала — ссылку на эфир.",
    unregistered_ok: "Запись отменена. Возвращайся, когда удобно.",
    btn: {
      register: "🔔 Записаться",
      unregister: "🔕 Отменить запись",
      open: "▶️ Ссылка на эфир",
      view_prefix: "👀",
    },
  },
  drip: {
    day_0:
      "👋 <b>Добро пожаловать в TRENDEX!</b>\n\n" +
      "Это рекламная экосистема, где встречаются три роли: <b>бизнес</b> размещает рекламу, <b>пользователи</b> получают доход за активность, <b>партнёры</b> строят сеть и зарабатывают с её оборота.\n\n" +
      "Открой /start — там кабинет, ссылка для друзей и главное меню. Внутри всё настроено, останется только выбрать свою роль.",
    day_1:
      "💼 <b>День 2: тарифы и место в сети</b>\n\n" +
      "У TRENDEX 8 тарифов — от <b>free</b> до <b>royal</b>. На free ты уже можешь изучить платформу и пригласить первых друзей. Платные тарифы открывают бронирование рекламных мест и повышают долю с оборота сети.\n\n" +
      "Загляни в /start → «Открыть кабинет» и посмотри, какой тариф тебе подходит.",
    day_2:
      "🤝 <b>День 3: реферальная система (5 уровней)</b>\n\n" +
      "Каждый, кто пришёл по твоей ссылке, попадает в твою сеть — и ты получаешь доход с 5 уровней вглубь. Чем раньше ты внутри, тем ниже позиция и больше входящий поток.\n\n" +
      "Открой /start → «Моя команда» — там твоя персональная ссылка и статистика. Отправь её хотя бы одному другу сегодня.",
    day_3:
      "📡 <b>День 4: живые эфиры и вебинары</b>\n\n" +
      "Мы регулярно проводим эфиры: запуск первой рекламы, разбор партнёрского плана, ответы на вопросы. Формат — 40–60 минут, без воды, с чатом.\n\n" +
      "Открой /events и запишись на ближайший — пришлю напоминание за 24 часа и за час до старта.",
    day_4:
      "🚀 <b>День 5: путь партнёра</b>\n\n" +
      "Ты уже внутри — время двигаться дальше. Впереди квесты, миссии и уровни партнёрского плана: от первых приглашений до статуса <b>royal</b>. Каждый шаг добавляет процент к твоей доле с оборота сети.\n\n" +
      "Открой /start и загляни в кабинет — там видно, где ты сейчас и что даст следующий шаг. Если что-то непонятно — просто напиши сюда, ассистент ответит.",
  },
  nudge: {
    stuck_no_action:
      "👋 Привет, давно не виделись!\n\n" +
      "Ты уже несколько дней в TRENDEX, но пока не сделал(а) ни одного бронирования и не пригласил(а) друзей. Может что-то непонятно или не хватило времени?\n\n" +
      "Загляни в /start — внутри короткий путь: открыть кабинет, посмотреть тарифы, получить свою ссылку. Если остались вопросы — просто напиши сюда, помогу разобраться.",
  },
  digest: {
    title: "📊 TRENDEX · Итоги недели",
    top_header: "🏆 Топ-3 партнёра недели",
    events_header: "📅 На этой неделе в эфирах",
    platform_header: "✨ Что нового на платформе",
  },
});

registerStrings("en", {
  events: {
    title_upcoming: "Upcoming TRENDEX events",
    section: {
      my: "You're registered for",
      all: "All upcoming events",
    },
    speakers: "Speakers:",
    empty:
      "📡 No events scheduled yet.\n\n" +
      "We run webinars on launching ads, the partner plan and platform updates. Check back soon — new dates appear here first.",
    need_start: "Run /start first — a TRENDEX account is required.",
    not_found: "Event not found or already finished.",
    register_failed: "Couldn't register, try again in a minute.",
    registered_ok: "✅ You're on the list!",
    registered_body:
      "✅ You're registered for \"{title}\".\n\n" +
      "I'll ping you 24h and 1h before the start, and drop the live link right when it begins.",
    unregistered_ok: "Registration cancelled. Come back anytime.",
    btn: {
      register: "🔔 Register",
      unregister: "🔕 Unregister",
      open: "▶️ Join link",
      view_prefix: "👀",
    },
  },
  drip: {
    day_0:
      "👋 <b>Welcome to TRENDEX!</b>\n\n" +
      "This is an advertising ecosystem where three roles meet: <b>businesses</b> run ads, <b>users</b> earn for activity, and <b>partners</b> grow the network and share its turnover.\n\n" +
      "Open /start — you'll find your cabinet, invite link and the main menu. Everything's set up; you just pick your role.",
    day_1:
      "💼 <b>Day 2: tariffs and your spot in the network</b>\n\n" +
      "TRENDEX has 8 tariffs — from <b>free</b> to <b>royal</b>. Free already lets you explore the platform and invite first friends. Paid tiers unlock ad-slot booking and bump your share of the network turnover.\n\n" +
      "Tap /start → \"Open cabinet\" and see which tariff fits you.",
    day_2:
      "🤝 <b>Day 3: the 5-level referral system</b>\n\n" +
      "Everyone who signs up via your link joins your network — and you earn from 5 levels deep. Earlier entry = lower position = bigger inflow.\n\n" +
      "Open /start → \"My team\" for your personal link and stats. Send it to at least one friend today.",
    day_3:
      "📡 <b>Day 4: live events and webinars</b>\n\n" +
      "We run regular sessions: launching your first ad, breaking down the partner plan, live Q&A. 40–60 minutes, no filler, with chat.\n\n" +
      "Run /events and register for the next one — I'll remind you 24h and 1h before the start.",
    day_4:
      "🚀 <b>Day 5: the partner path</b>\n\n" +
      "You're already inside — time to move further. Ahead: quests, missions and the partner-plan tiers, from first invites up to <b>royal</b>. Every step adds a percentage to your share of the network turnover.\n\n" +
      "Open /start and check your cabinet — you'll see where you are now and what the next step unlocks. Got questions? Just write here and the assistant will help.",
  },
  nudge: {
    stuck_no_action:
      "👋 Hey, long time no see!\n\n" +
      "You've been in TRENDEX for a few days but haven't made a single booking or invited anyone yet. Something unclear, or just busy?\n\n" +
      "Open /start — the short path is right there: open the cabinet, check tariffs, grab your link. Got questions? Just drop them here and I'll help.",
  },
  digest: {
    title: "📊 TRENDEX · Week recap",
    top_header: "🏆 Top-3 partners of the week",
    events_header: "📅 This week's events",
    platform_header: "✨ What's new on the platform",
  },
});
