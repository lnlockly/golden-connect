'use strict';

// ============================================================
//  Trendex Quest System — 60 заданий в 6 главах
//  Полностью переработано под Trendex (2026-05-13)
//  Тематика: онбординг → заработок → реклама → CRM → партнёрка → лидерство
//
//  type: 'manual'  — пользователь нажимает "Выполнено"
//  type: 'auto'    — система проверяет автоматически
//  trigger: имя события для auto-квестов
//  triggerValue: минимальное значение для auto (счётчик)
//  repeatType: 'once' | 'daily' | 'weekly' | 'monthly'
//  action: { panel: 'pageName', label: 'Кнопка' } — куда вести
//  trdx: бонус в TRDX при выполнении (доп к XP)
// ============================================================

const CHAPTERS = [
  { id: 1, title: 'Старт',          emoji: '🚀', description: 'Профиль, бот, реф-ссылка, первый эфир',                  unlockAt: 0 },
  { id: 2, title: 'Заработок',      emoji: '💵', description: 'Биржа заданий, видео, подписки, выплаты',                unlockAt: 6 },
  { id: 3, title: 'Реклама',        emoji: '🎯', description: 'Кампании, AI-рассылки, банеры, лендинги',                unlockAt: 14 },
  { id: 4, title: 'CRM и команда',  emoji: '👥', description: 'Рефералы, прогрев лидов, AI-разведка',                   unlockAt: 24 },
  { id: 5, title: 'Партнёрка',      emoji: '🎰', description: 'Матрица, Karma, лидерборд, Matching Bonus',              unlockAt: 36 },
  { id: 6, title: 'Лидер и TRDX',   emoji: '💎', description: 'Genesis TRDX, тарифы, масштаб и наставничество',         unlockAt: 48 },
];

const QUESTS = [
  // ═════════════════════════════════════════════════════
  // ГЛАВА 1 — СТАРТ (10 заданий) · 175 XP + 25 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q01', chapter: 1, order: 1, icon: '👤', title: 'Заполни профиль', description: 'Имя, юзернейм, контакты — 30 секунд', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'profile', label: 'Открыть профиль' } },
  { id: 'q02', chapter: 1, order: 2, icon: '🤖', title: 'Привяжи Telegram-бот', description: 'Профиль → Привязать Telegram. Вход без пароля + уведомления', xp: 20, trdx: 2, type: 'auto', trigger: 'telegram_linked', repeatType: 'once', action: { panel: 'profile', label: 'Привязать TG' } },
  { id: 'q03', chapter: 1, order: 3, icon: '🔗', title: 'Получи свою реф-ссылку', description: 'Ссылки и Bio → Промо-ссылки. Твоя ссылка уже готова', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'links', label: 'Мои ссылки' } },
  { id: 'q04', chapter: 1, order: 4, icon: '🔔', title: 'Включи push-уведомления', description: 'Кликни "Включить" на баннере. Будешь знать о новых эфирах и заявках', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once' },
  { id: 'q05', chapter: 1, order: 5, icon: '📡', title: 'Подпишись на канал @TRENDEX_AD', description: 'Главный анонс-канал Trendex — там все эфиры и новости', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once' },
  { id: 'q06', chapter: 1, order: 6, icon: '🎬', title: 'Посмотри приветственный эфир', description: 'Эфиры → последний эфир-обзор платформы Trendex', xp: 20, trdx: 3, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'broadcasts', label: 'Эфиры' } },
  { id: 'q07', chapter: 1, order: 7, icon: '🧠', title: 'Спроси AI-помощника', description: 'AI-помощник → задай вопрос про Trendex. AI знает всё о тарифах и матрице', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'ai', label: 'AI-помощник' } },
  { id: 'q08', chapter: 1, order: 8, icon: '❓', title: 'Прочитай FAQ', description: 'FAQ → ответы на топ-15 вопросов о платформе', xp: 5, trdx: 0, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'faq', label: 'Открыть FAQ' } },
  { id: 'q09', chapter: 1, order: 9, icon: '📋', title: 'Изучи CRM партнёра', description: 'CRM партнёра → 7322 лида, фильтры, диалоги. Открой и посмотри', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'crm', label: 'CRM' } },
  { id: 'q10', chapter: 1, order: 10, icon: '🔥', title: '3 дня подряд в кабинете', description: 'Заходи каждый день. Streak даёт ×1.5 бонус к XP', xp: 60, trdx: 12, type: 'auto', trigger: 'login_streak', triggerValue: 3, repeatType: 'once' },

  // ═════════════════════════════════════════════════════
  // ГЛАВА 2 — ЗАРАБОТОК (10 заданий) · 275 XP + 45 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q11', chapter: 2, order: 1, icon: '💵', title: 'Посмотри биржу заданий', description: 'Зарабатывать → Реклама. Все доступные задания на текущий момент', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'earn', label: 'Зарабатывать' } },
  { id: 'q12', chapter: 2, order: 2, icon: '✅', title: 'Выполни первое задание', description: 'Возьми любое задание из биржи и сдай отчёт. Заплатим TRDX', xp: 30, trdx: 5, type: 'auto', trigger: 'task_completed', triggerValue: 1, repeatType: 'once' },
  { id: 'q13', chapter: 2, order: 3, icon: '📺', title: 'Подпишись на 3 канала', description: 'Биржа → Подписки на каналы. 5-50 TRDX за подписку', xp: 20, trdx: 3, type: 'auto', trigger: 'subs_count', triggerValue: 3, repeatType: 'weekly' },
  { id: 'q14', chapter: 2, order: 4, icon: '🎬', title: 'Просмотри 3 видео-задания', description: 'Биржа → Видео-просмотры. 0.10 TRDX за каждые 30 сек', xp: 15, trdx: 2, type: 'auto', trigger: 'video_views', triggerValue: 3, repeatType: 'weekly' },
  { id: 'q15', chapter: 2, order: 5, icon: '🤖', title: 'Подключи TG-аккаунт к Аренде', description: 'Зарабатывать → Аренда TG. +300%/мес за прогретый аккаунт', xp: 50, trdx: 10, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'roboai-earn', label: 'TG Neuro AI' } },
  { id: 'q16', chapter: 2, order: 6, icon: '💰', title: 'Загрузи $10 на баланс', description: 'Кошелёк → Пополнить. Любая сумма зачислится в TRDX', xp: 20, trdx: 0, type: 'auto', trigger: 'topup_made', repeatType: 'once', action: { panel: 'topup', label: 'Пополнить' } },
  { id: 'q17', chapter: 2, order: 7, icon: '🎯', title: 'Сделай 10 заданий', description: 'Кумулятивно. Все типы заданий считаются', xp: 60, trdx: 10, type: 'auto', trigger: 'task_completed', triggerValue: 10, repeatType: 'once' },
  { id: 'q18', chapter: 2, order: 8, icon: '↗️', title: 'Первый вывод средств', description: 'Кошелёк → Вывести. Минималка 10 TRDX', xp: 25, trdx: 5, type: 'auto', trigger: 'withdrawal_done', repeatType: 'once', action: { panel: 'withdrawals', label: 'Вывести' } },
  { id: 'q19', chapter: 2, order: 9, icon: '🏆', title: '50 TRDX заработано', description: 'Любым способом — задания, рефералы, конкурсы', xp: 35, trdx: 5, type: 'auto', trigger: 'trdx_earned', triggerValue: 50, repeatType: 'once' },
  { id: 'q20', chapter: 2, order: 10, icon: '💎', title: 'Заработай 100 TRDX', description: 'Двойная цель. Сразу видно динамику', xp: 60, trdx: 10, type: 'auto', trigger: 'trdx_earned', triggerValue: 100, repeatType: 'once' },

  // ═════════════════════════════════════════════════════
  // ГЛАВА 3 — РЕКЛАМА (10 заданий) · 290 XP + 55 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q21', chapter: 3, order: 1, icon: '🎯', title: 'Запусти первую кампанию', description: 'Заказать продвижение → Реклама на сайте. Загрузи баннер', xp: 30, trdx: 5, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'ads-site', label: 'Реклама' } },
  { id: 'q22', chapter: 3, order: 2, icon: '🎬', title: 'Сделай AI-видео промо', description: 'Заказать → Видео-промо. AI сгенерирует ролик за 60 сек', xp: 25, trdx: 5, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'video_promo', label: 'Видео-промо' } },
  { id: 'q23', chapter: 3, order: 3, icon: '📡', title: 'Запусти AI-рассылку', description: 'Заказать → AI-рассылки. Отправь по своей базе или закажи у нас', xp: 40, trdx: 10, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'roboai-order', label: 'AI-рассылки' } },
  { id: 'q24', chapter: 3, order: 4, icon: '📺', title: 'Закажи подписки на канал', description: 'Заказать → Биржа заданий. Получи 50+ подписок за 24ч', xp: 20, trdx: 3, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'ads-order', label: 'Биржа' } },
  { id: 'q25', chapter: 3, order: 5, icon: '📡', title: 'Подключи TG-канал', description: 'Заказать → Мои каналы. Подключи свой канал для автопостинга', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'tgchannels', label: 'TG-каналы' } },
  { id: 'q26', chapter: 3, order: 6, icon: '🌐', title: 'Поделись лендингом', description: 'Лендинги → выбери лендинг → скопируй ссылку с реф-кодом → отправь 5+ людям', xp: 20, trdx: 3, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'landings', label: 'Лендинги' } },
  { id: 'q27', chapter: 3, order: 7, icon: '🎨', title: 'Создай баннер в Studio', description: 'Инструменты → Banner Studio. AI + редактор. Сохрани и используй', xp: 25, trdx: 3, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'tools', label: 'Инструменты' } },
  { id: 'q28', chapter: 3, order: 8, icon: '🔗', title: 'Сократи ссылку', description: 'Ссылки → Сократитель → создай t2gift.com/CODE с трекингом кликов', xp: 10, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'shortener', label: 'Сократитель' } },
  { id: 'q29', chapter: 3, order: 9, icon: '🪪', title: 'Запусти Bio-страницу', description: 'Ссылки → Bio. Лендинг под все твои ссылки в Instagram/TikTok', xp: 25, trdx: 5, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'bio', label: 'Bio-страница' } },
  { id: 'q30', chapter: 3, order: 10, icon: '💰', title: 'Потрать 50 TRDX на рекламу', description: 'Кумулятивно. Любые рекламные кампании', xp: 80, trdx: 17, type: 'auto', trigger: 'trdx_spent_ads', triggerValue: 50, repeatType: 'once' },

  // ═════════════════════════════════════════════════════
  // ГЛАВА 4 — CRM И КОМАНДА (10 заданий) · 330 XP + 75 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q31', chapter: 4, order: 1, icon: '🎉', title: 'Первый реферал!', description: 'Кто-то перешёл по твоей ссылке и зарегистрировался', xp: 50, trdx: 50, type: 'auto', trigger: 'referral_count', triggerValue: 1, repeatType: 'once' },
  { id: 'q32', chapter: 4, order: 2, icon: '📋', title: 'Открой CRM команды', description: 'Моя команда → структура, воронка, AI-советы', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'team', label: 'Команда' } },
  { id: 'q33', chapter: 4, order: 3, icon: '💬', title: 'Напиши приветствие рефералу', description: 'Открой карточку реферала → Написать. Тёплый старт = выше LTV', xp: 25, trdx: 3, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'team', label: 'Команда' } },
  { id: 'q34', chapter: 4, order: 4, icon: '📝', title: 'Добавь заметку в CRM', description: 'Карточка реферала → заметка. Записывай контекст разговоров', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'team', label: 'Команда' } },
  { id: 'q35', chapter: 4, order: 5, icon: '🤝', title: '3 реферала в структуре', description: 'Пригласи 3 человек по своей ссылке. +50 TRDX за каждого', xp: 60, trdx: 0, type: 'auto', trigger: 'referral_count', triggerValue: 3, repeatType: 'once' },
  { id: 'q36', chapter: 4, order: 6, icon: '🔍', title: 'AI-разведка контактов', description: 'CRM → AI-разведка по TG/VK/IG/WhatsApp/Google. Найди тёплых лидов', xp: 30, trdx: 5, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'crm', label: 'CRM' } },
  { id: 'q37', chapter: 4, order: 7, icon: '👥', title: '5 партнёров — мини-команда', description: '5 человек в твоей структуре. Karma +20', xp: 75, trdx: 0, type: 'auto', trigger: 'referral_count', triggerValue: 5, repeatType: 'once' },
  { id: 'q38', chapter: 4, order: 8, icon: '🌐', title: 'Партнёрская сеть', description: 'Моя команда → Партнёрская сеть. Visual map твоей структуры', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'network', label: 'Партн. сеть' } },
  { id: 'q39', chapter: 4, order: 9, icon: '👑', title: '10 партнёров в структуре', description: 'Двузначный счёт. Karma +50, доступ к Matching Bonus', xp: 120, trdx: 25, type: 'auto', trigger: 'referral_count', triggerValue: 10, repeatType: 'once' },
  { id: 'q40', chapter: 4, order: 10, icon: '🎓', title: 'Помоги рефералу с первым заданием', description: 'Объясни через DM как взять задание на бирже. Менторство = бонусы', xp: 35, trdx: 5, type: 'manual', trigger: null, repeatType: 'once' },

  // ═════════════════════════════════════════════════════
  // ГЛАВА 5 — ПАРТНЁРКА (10 заданий) · 410 XP + 110 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q41', chapter: 5, order: 1, icon: '🎰', title: 'Изучи Bonus Matrix', description: 'Достижения → Bonus Matrix. 15-местная матрица — твоё место фиксируется', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'bonus_matrix', label: 'Bonus Matrix' } },
  { id: 'q42', chapter: 5, order: 2, icon: '⚡', title: 'Открой систему Karma', description: 'Достижения → Karma. За активность даём дополнительные TRDX', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'karma', label: 'Karma' } },
  { id: 'q43', chapter: 5, order: 3, icon: '🏆', title: 'Топ-100 заработавших', description: 'Рейтинг → Топ-100. Посмотри куда стремиться', xp: 10, trdx: 1, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'leaderboard', label: 'Топ-100' } },
  { id: 'q44', chapter: 5, order: 4, icon: '🎯', title: 'Достижения 5 шт.', description: 'Открой первые 5 achievements за активность', xp: 30, trdx: 5, type: 'auto', trigger: 'achievements_count', triggerValue: 5, repeatType: 'once' },
  { id: 'q45', chapter: 5, order: 5, icon: '💫', title: '50 Karma points', description: 'Зайди в Karma — сколько баллов набрано', xp: 40, trdx: 5, type: 'auto', trigger: 'karma_points', triggerValue: 50, repeatType: 'once' },
  { id: 'q46', chapter: 5, order: 6, icon: '🔥', title: '7-дневный streak', description: 'Неделя ежедневных визитов. ×1.5 бонус активирован', xp: 50, trdx: 10, type: 'auto', trigger: 'login_streak', triggerValue: 7, repeatType: 'once' },
  { id: 'q47', chapter: 5, order: 7, icon: '📈', title: 'Matching Bonus получен', description: 'Кто-то из твоих рефералов получил Matching Bonus → ты получаешь %', xp: 100, trdx: 30, type: 'auto', trigger: 'matching_bonus', repeatType: 'once' },
  { id: 'q48', chapter: 5, order: 8, icon: '🚀', title: '14-дневный streak', description: '2 недели без пропусков. Karma +100', xp: 90, trdx: 20, type: 'auto', trigger: 'login_streak', triggerValue: 14, repeatType: 'once' },
  { id: 'q49', chapter: 5, order: 9, icon: '⭐', title: 'Войди в топ-50', description: 'По XP или TRDX. Постоянная мотивация', xp: 0, trdx: 25, type: 'auto', trigger: 'leaderboard_rank', triggerValue: 50, repeatType: 'once' },
  { id: 'q50', chapter: 5, order: 10, icon: '👑', title: '30-дневный streak — Золото!', description: 'Месяц ежедневных визитов. ×2 бонус ко всему XP', xp: 200, trdx: 50, type: 'auto', trigger: 'login_streak', triggerValue: 30, repeatType: 'once' },

  // ═════════════════════════════════════════════════════
  // ГЛАВА 6 — ЛИДЕР И TRDX (10 заданий) · 470 XP + 230 TRDX
  // ═════════════════════════════════════════════════════
  { id: 'q51', chapter: 6, order: 1, icon: '💎', title: 'Изучи Genesis TRDX', description: 'Genesis TRDX → пресейл-токен платформы. 3 тарифа на старте', xp: 15, trdx: 2, type: 'manual', trigger: null, repeatType: 'once', action: { panel: 'trdx', label: 'Genesis TRDX' } },
  { id: 'q52', chapter: 6, order: 2, icon: '🚀', title: 'Активируй тариф LAUNCH', description: 'Genesis TRDX → купи LAUNCH $45+15 TRDX. Старт партнёра', xp: 50, trdx: 0, type: 'auto', trigger: 'tariff_activated', triggerValue: 'launch', repeatType: 'once', action: { panel: 'trdx', label: 'Купить' } },
  { id: 'q53', chapter: 6, order: 3, icon: '⚡', title: 'Активируй BOOST', description: 'Тариф BOOST $90+30 TRDX. Ускоряет матрицу и Karma в 2x', xp: 100, trdx: 0, type: 'auto', trigger: 'tariff_activated', triggerValue: 'boost', repeatType: 'once', action: { panel: 'trdx', label: 'BOOST' } },
  { id: 'q54', chapter: 6, order: 4, icon: '🔥', title: 'Активируй ROCKET', description: 'Тариф ROCKET $135+45 TRDX. Максимум бонусов + личный куратор', xp: 200, trdx: 0, type: 'auto', trigger: 'tariff_activated', triggerValue: 'rocket', repeatType: 'once', action: { panel: 'trdx', label: 'ROCKET' } },
  { id: 'q55', chapter: 6, order: 5, icon: '👥', title: '25 партнёров — лидер', description: '25 рефералов в структуре. Доступ к лидерскому пулу', xp: 0, trdx: 100, type: 'auto', trigger: 'referral_count', triggerValue: 25, repeatType: 'once' },
  { id: 'q56', chapter: 6, order: 6, icon: '🎤', title: 'Проведи свой эфир', description: 'Партнёры могут делать эфиры в @TRENDEX_AD. Запросить через support', xp: 50, trdx: 10, type: 'manual', trigger: null, repeatType: 'once' },
  { id: 'q57', chapter: 6, order: 7, icon: '🏆', title: 'Топ-10 заработавших', description: 'Войди в top-10 по любому метрику (TRDX, XP, рефералы)', xp: 100, trdx: 50, type: 'auto', trigger: 'leaderboard_rank', triggerValue: 10, repeatType: 'once' },
  { id: 'q58', chapter: 6, order: 8, icon: '🎓', title: '5 рефералов с активным тарифом', description: '5 человек в структуре купили LAUNCH/BOOST/ROCKET', xp: 0, trdx: 70, type: 'auto', trigger: 'active_tariff_refs', triggerValue: 5, repeatType: 'once' },
  { id: 'q59', chapter: 6, order: 9, icon: '👑', title: 'ТОП-1 — Король холма', description: 'Возглавь leaderboard. На вершине — слава', xp: 0, trdx: 0, type: 'auto', trigger: 'leaderboard_rank', triggerValue: 1, repeatType: 'once' },
  { id: 'q60', chapter: 6, order: 10, icon: '🌟', title: '1000 TRDX заработано', description: 'Финальная цель. Ты в элите Trendex', xp: 55, trdx: 0, type: 'auto', trigger: 'trdx_earned', triggerValue: 1000, repeatType: 'once' },
];

// Daily quests pool — sampled randomly each day
const DAILY_POOL = [
  { id: 'daily_login',     title: '🔥 Зайти в кабинет', xp: 5,  type: 'auto', trigger: 'daily_login' },
  { id: 'daily_share',     title: '📤 Поделись ссылкой', xp: 10, type: 'manual' },
  { id: 'daily_task',      title: '✅ Выполни 1 задание на бирже', xp: 15, type: 'auto', trigger: 'task_completed_daily' },
  { id: 'daily_team_view', title: '👥 Открой CRM команды', xp: 5, type: 'manual', action: { panel: 'team', label: 'Команда' } },
  { id: 'daily_ai',        title: '🧠 Спроси AI-помощника', xp: 5, type: 'manual', action: { panel: 'ai', label: 'AI' } },
  { id: 'daily_broadcast', title: '📡 Открой эфиры', xp: 5, type: 'manual', action: { panel: 'broadcasts', label: 'Эфиры' } },
];

module.exports = { CHAPTERS, QUESTS, DAILY_POOL };
