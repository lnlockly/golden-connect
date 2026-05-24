/* ── Theme Toggle ──────────────────────────────────────────── */
function getPreferredTheme() {
  const stored = localStorage.getItem('xh-theme');
  if (stored) return stored;
  return 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('xh-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '\u2600' : '\u263E';
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.content = theme === 'dark' ? '#080a0f' : '#f0f2f5';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ── State ─────────────────────────────────────────────────── */
const state = {
  site: null,
  auth: null,
  user: null,
  dashboard: null,
  marketing: null,
  visitorId: null,
  products: [],
  partner: null,
  shortLinks: [],
  withdrawals: [],
  aiMessages: [],
  aiPreviewMessages: [],
  orders: [],
  profileMeta: null,
  protocols: null,
  tasks: [],
  saved: null,
  support: null,
  notifications: [],
  activity: [],
  mediaLibraryItems: [],
  mediaLibraryMeta: {
    canManage: false,
    mode: 'owner_fallback',
  },
  mediaLibraryEditorId: null,
  leadDeskEditorVisitorId: null,
  toolResults: {
    utmBuilder: null,
    qr: null,
    hashtags: [],
    captions: [],
    bioHub: null,
    socialKit: null,
    imageStudio: null,
    removeBg: null,
    ogImage: null,
    bannerStudio: null,
    pdfKit: null,
  },
  landingPreferences: {
    language: 'ru',
    landingId: 'health',
  },
  toolsPreferences: {
    activeTool: 'overview',
  },
  learningPreferences: {
    trackId: '',
  },
  faqFilters: {
    query: '',
    category: 'all',
  },
  mediaCenterFilters: {
    scenario: 'all',
    kind: 'all',
    productId: 'all',
    query: '',
  },
  activePanel: 'overview',
  pendingPanel: null,
  botAuthRequestId: null,
  botAuthPollTimer: null,
  botAuthDeadlineTimer: null,
};

const PANEL_ALIASES = {
  partner: 'rating',
  planner: 'tasks',
};

const AUTH_MODE_META = {
  login: {
    title: 'Войти в кабинет',
    copy: 'Вернитесь в Golden Connect Workspace, чтобы продолжить работу со ссылками, лендингами, AI и партнёрским центром.',
  },
  register: {
    title: 'Создать новый кабинет',
    copy: 'Создайте единый доступ к ссылкам, рекламным материалам, обучению и партнёрскому кабинету.',
  },
};

const DASHBOARD_PANEL_META = {
  overview: {
    kicker: 'Кабинет',
    heading: 'Командный центр партнёра',
    copy: 'Новая рабочая панель: реферальный контур, готовность кабинета, следующий лучший шаг, активность и запуск в одном экране.',
  },
  links: {
    kicker: 'Ссылки',
    heading: 'Мои ссылки',
    copy: 'Сайт, регистрация в компанию, каталог, шэринг по каналам и короткие ссылки для каждого сценария.',
  },
  landings: {
    kicker: 'Лендинги',
    heading: 'Лендинги по языкам',
    copy: 'Выбор лендингов под холодный, тёплый и горячий трафик с отдельными ссылками по каждому языку.',
  },
  materials: {
    kicker: 'Реклама',
    heading: 'Рекламные материалы',
    copy: 'Тексты, посты, сторис, видео-хуки, ответы на возражения и идеи для медиапака партнёра.',
  },
  media: {
    kicker: 'Контент',
    heading: 'Медиацентр',
    copy: 'Единая библиотека пакетов, сообщений, визуалов, product anchors и ссылок с фильтрами по сценарию, продукту, языку и типу.',
  },
  tools: {
    kicker: 'Инструменты',
    heading: 'Инструменты и Arsenal',
    copy: 'Локальные инструменты Golden Connect: shortener, QR, Bio Hub, Social Kit, Image Studio, Remove BG, OG, баннеры, PDF Kit и только остаточные pro-bridge из Arsenal.',
  },
  tasks: {
    kicker: 'Задания',
    heading: 'Задания и запуск',
    copy: 'Личный список действий, быстрые задачи, приоритеты и контроль запуска без потери фокуса.',
  },
  rating: {
    kicker: 'Рейтинг',
    heading: 'Рейтинг и рост',
    copy: 'Баллы, структура, уровни роста и логика партнёрского продвижения в одном блоке.',
  },
  learning: {
    kicker: 'Обучение',
    heading: 'Обучение',
    copy: 'Треки старта, продвижения и дубликации с рекомендованным сценарием под текущий этап партнёра.',
  },
  faq: {
    kicker: 'FAQ',
    heading: 'FAQ и помощь',
    copy: 'Частые вопросы по запуску, ссылкам, компании, материалам и переходу в живую поддержку.',
  },
  products: {
    kicker: 'Продукция',
    heading: 'Продукция компании',
    copy: 'Полная продуктовая база Golden Connect: категории, описания, отзывы, результаты, инструкции и быстрый переход в официальный контур компании.',
  },
  partner: {
    kicker: 'Рейтинг',
    heading: 'Рейтинг и рост',
    copy: 'Структура, уровни, баллы и путь к следующему партнёрскому шагу.',
  },
  withdrawals: {
    kicker: 'Финансы',
    heading: 'Выплаты и заявки',
    copy: 'История выплат, реквизиты и контроль заявок на вывод в одном блоке.',
  },
  support: {
    kicker: 'Поддержка',
    heading: 'Поддержка партнёра',
    copy: 'Связь с командой, темы запросов и сопровождение по продуктам, трафику и запуску.',
  },
  ai: {
    kicker: 'AI',
    heading: 'AI-помощник',
    copy: 'Подготовка ответов, текстов, разбор возражений и подсказки по продвижению и автоматизации.',
  },
  profile: {
    kicker: 'Профиль',
    heading: 'Профиль и настройки',
    copy: 'Настройка роли, контактов, целей и уведомлений для более точной работы кабинета.',
  },
};

const ROLE_LABELS = {
  client: 'Клиент',
  partner: 'Партнёр',
  hybrid: 'Клиент + партнёр',
};

const EXPERIENCE_LABELS = {
  new: 'Новый старт',
  steady: 'В процессе',
  advanced: 'Продвинутый',
};

const GROWTH_STAGES = [
  {
    id: 'launch',
    title: 'Запуск',
    threshold: 0,
    summary: 'Собираем стартовый набор: ссылка, лендинг, материалы и первый сценарий касания.',
  },
  {
    id: 'activation',
    title: 'Активация',
    threshold: 120,
    summary: 'Появляются первые рабочие действия: короткие ссылки, QR, задачи и первые касания.',
  },
  {
    id: 'traffic',
    title: 'Трафик',
    threshold: 300,
    summary: 'Кабинет уже ведёт трафик через лендинги, материалы и разные языковые сценарии.',
  },
  {
    id: 'duplication',
    title: 'Дубликация',
    threshold: 650,
    summary: 'Появляется база для повторяемого запуска и передачи готовой системы новым партнёрам.',
  },
  {
    id: 'mentor',
    title: 'Наставник',
    threshold: 1100,
    summary: 'Кабинет превращается в центр роста команды, обучения и контроля качества запуска.',
  },
];

const LEARNING_MODULE_LIBRARY = [
  {
    id: 'cabinet-start',
    title: 'Быстрый старт кабинета',
    duration: '7 минут',
    level: 'Старт',
    panel: 'overview',
    summary: 'Как быстро понять логику кабинета и не потерять фокус на первых шагах.',
    bullets: ['Командный центр', 'Главная ссылка', 'Следующий лучший шаг'],
  },
  {
    id: 'landing-match',
    title: 'Как выбрать лендинг',
    duration: '9 минут',
    level: 'Трафик',
    panel: 'landings',
    summary: 'Как выбирать между сценариями здоровье, бизнес и гибрид под конкретную аудиторию.',
    bullets: ['3 сценария', '10 языков', 'Правильный угол подачи'],
  },
  {
    id: 'promo-bundle',
    title: 'Собрать связку продвижения',
    duration: '11 минут',
    level: 'Трафик',
    panel: 'materials',
    summary: 'Как брать готовые материалы и собирать из них повторяемый рекламный пакет.',
    bullets: ['Пост + сообщение', 'Short link + QR', 'CTA без перегруза'],
  },
  {
    id: 'tools-automation',
    title: 'Автоматизация через инструменты',
    duration: '8 минут',
    level: 'Система',
    panel: 'tools',
    summary: 'Как использовать сокращатель, QR, AI-тексты и Arsenal для ускорения запуска.',
    bullets: ['Shortener', 'QR', 'AI caption', 'Arsenal bridge'],
  },
  {
    id: 'handoff-flow',
    title: 'Перевод в компанию',
    duration: '6 минут',
    level: 'Конверсия',
    panel: 'links',
    summary: 'Как мягко переводить человека из лендинга в официальный контур компании по вашей ссылке.',
    bullets: ['Мягкий вход', 'Прогрев', 'Регистрация по пригласителю'],
  },
  {
    id: 'partner-duplication',
    title: 'Дубликация партнёра',
    duration: '13 минут',
    level: 'Рост',
    panel: 'rating',
    summary: 'Как передавать новому партнёру уже собранную систему, а не отдельные ссылки и тексты.',
    bullets: ['Стартовый пакет', 'Шаблоны задач', 'Точки контроля'],
  },
  {
    id: 'health-entry',
    title: 'Продуктовый вход через здоровье',
    duration: '10 минут',
    level: 'Продукт',
    panel: 'materials',
    summary: 'Как мягко заходить через здоровье, каталог, инструкции и понятные продуктовые акценты.',
    bullets: ['Живая вода', 'Омега-3', 'Каталог + инструкция'],
  },
  {
    id: 'company-context',
    title: 'Как объяснять компанию без перегруза',
    duration: '7 минут',
    level: 'Доверие',
    panel: 'faq',
    summary: 'Как показывать компанию, материалы и официальный контур так, чтобы не заваливать человека фактами в первом касании.',
    bullets: ['Доверие', 'Контекст', 'Переход в компанию'],
  },
  {
    id: 'support-escalation',
    title: 'Когда и как эскалировать вопрос',
    duration: '6 минут',
    level: 'Поддержка',
    panel: 'faq',
    summary: 'Как понять, что можно закрыть самим, а что лучше сразу передать наставнику или в поддержку.',
    bullets: ['FAQ', 'Наставник', 'Поддержка'],
  },
  {
    id: 'launch-review',
    title: 'Разбор рабочей связки',
    duration: '8 минут',
    level: 'Контроль',
    panel: 'tasks',
    summary: 'Как проверить, что лендинг, short link, QR и первое сообщение работают как одна система.',
    bullets: ['Лендинг', 'Short link', 'QR', 'Follow-up'],
  },
];

const FAQ_EXTENSION = [
  {
    id: 'faq-ref-first',
    category: 'start',
    q: 'Что давать человеку первым: сайт или регистрацию в компанию?',
    a: 'Почти всегда сначала лучше давать сайт или подходящий лендинг. Так человек видит контекст, материалы и доверительную подачу, а уже после интереса переходит в официальный контур компании по вашей ссылке.',
    tags: ['сайт', 'регистрация', 'первое касание'],
  },
  {
    id: 'faq-three-landings',
    category: 'landings',
    q: 'Как выбрать между 3 лендингами?',
    a: 'Здоровье используем для холодной и смешанной аудитории, бизнес — для людей с интересом к партнёрству, гибрид — когда важно показать и продукт, и систему, и перспективу роста одновременно.',
    tags: ['health', 'business', 'hybrid'],
  },
  {
    id: 'faq-language',
    category: 'languages',
    q: 'Нужно ли разделять трафик по языкам?',
    a: 'Да. Для каждого языка лучше использовать свой лендинг, свои тексты и отдельные короткие ссылки или UTM, чтобы не смешивать аудитории и понимать, что реально работает.',
    tags: ['язык', 'utm', 'short link'],
  },
  {
    id: 'faq-materials',
    category: 'materials',
    q: 'Какой минимальный рекламный набор нужен для старта?',
    a: 'Достаточно 1 лендинга, 1 короткого сообщения, 1 короткой ссылки, 1 QR и 1 follow-up текста. Этого уже хватает, чтобы не стартовать с нуля и быстро протестировать отклик.',
    tags: ['лендинг', 'QR', 'follow-up'],
  },
  {
    id: 'faq-automation',
    category: 'automation',
    q: 'Когда подключать автоматизацию и Arsenal?',
    a: 'Сразу после выбора лендинга. Сначала сокращаем ссылку, делаем QR, готовим текст и только потом масштабируем канал или язык. Так автоматика работает на понятную связку, а не в пустоту.',
    tags: ['Arsenal', 'автоматизация', 'QR'],
  },
  {
    id: 'faq-support-route',
    category: 'support',
    q: 'Когда вопрос нужно эскалировать в поддержку?',
    a: 'Если вопрос связан с регистрацией, техсбоем, выплатой, доступом, спорной ситуацией по структуре или требует подтверждения от компании, лучше сразу открыть поддержку и приложить контекст.',
    tags: ['поддержка', 'выплаты', 'техвопрос'],
  },
];

function getOrCreateVisitorId() {
  const storageKey = 'xh-visitor-id';
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;
  const generated = typeof crypto !== 'undefined' && crypto.randomUUID
    ? `xh_${crypto.randomUUID().replace(/-/g, '')}`
    : `xh_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  localStorage.setItem(storageKey, generated);
  return generated;
}

function getCurrentPath() {
  try {
    return new URL(window.location.href).pathname || '/';
  } catch {
    return window.location.pathname || '/';
  }
}

function getCurrentUrl() {
  try {
    return new URL(window.location.href).toString();
  } catch {
    return window.location.href || '';
  }
}

function getDeviceType() {
  const width = window.innerWidth || 1280;
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

function getMarketingPayload() {
  const url = new URL(window.location.href);
  return {
    visitorId: state.visitorId,
    pagePath: url.pathname || '/',
    pageUrl: url.toString(),
    referrer: document.referrer || '',
    referralCode: url.searchParams.get('ref') || '',
    utmSource: url.searchParams.get('utm_source') || '',
    utmMedium: url.searchParams.get('utm_medium') || '',
    utmCampaign: url.searchParams.get('utm_campaign') || '',
    utmContent: url.searchParams.get('utm_content') || '',
    utmTerm: url.searchParams.get('utm_term') || '',
    deviceType: getDeviceType(),
    browser: navigator.userAgent || '',
    language: navigator.language || 'ru',
    locale: navigator.language || 'ru-RU',
  };
}

function getActiveMarketingContext() {
  return state.marketing || state.dashboard?.marketing || state.partner?.marketing || null;
}

function getLeadBoardItems(context = getActiveMarketingContext()) {
  return safeArray(context?.leadBoard);
}

function getLeadSummary(context = getActiveMarketingContext()) {
  return context?.leadSummary || null;
}

function getLeadBoardEntryByVisitorId(visitorId, context = getActiveMarketingContext()) {
  const normalizedId = String(visitorId || '').trim();
  if (!normalizedId) return null;
  return getLeadBoardItems(context).find((item) => String(item?.visitorId || '').trim() === normalizedId) || null;
}

function setLeadDeskEditor(visitorId = null) {
  const normalizedId = String(visitorId || '').trim();
  state.leadDeskEditorVisitorId = normalizedId || null;
  if (state.activePanel === 'rating') {
    renderRatingPanel();
  }
}

function setMarketingContext(context) {
  if (!context) return;
  state.marketing = context;
  if (state.dashboard) state.dashboard.marketing = context;
  if (state.partner) state.partner.marketing = context;
  applyMarketingContext();
  renderMarketingSurfaces();
}

async function syncMarketingVisit(reason = 'page_view') {
  if (!state.visitorId) return null;
  const result = await api('/cabinet/api/marketing/visit', {
    method: 'POST',
    body: JSON.stringify({
      ...getMarketingPayload(),
      reason,
    }),
  });
  setMarketingContext(result.context || null);
  return result;
}

async function fetchMarketingContext() {
  if (!state.visitorId) return null;
  const result = await api(`/api/marketing/context?visitorId=${encodeURIComponent(state.visitorId)}`);
  setMarketingContext(result.context || null);
  return result;
}

async function trackMarketingEvent(eventType, extra = {}) {
  if (!state.visitorId || !eventType) return null;
  try {
    const result = await api('/cabinet/api/marketing/events', {
      method: 'POST',
      body: JSON.stringify({
        ...getMarketingPayload(),
        ...extra,
        visitorId: state.visitorId,
        eventType,
      }),
    });
    if (result.context) setMarketingContext(result.context);
    return result;
  } catch {
    return null;
  }
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.reason || 'request_failed');
    error.payload = payload;
    throw error;
  }
  return payload;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}

function formatCurrency(value, currency = 'RUB') {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 'Цена уточняется';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${formatNumber(amount)} ${currency}`;
  }
}

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(
    'ru-RU',
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
  );
}

function toDatetimeLocalValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - (offset * 60 * 1000));
  return local.toISOString().slice(0, 16);
}

function labelizeMarketingSource(source) {
  const value = String(source || 'direct').trim().toLowerCase();
  const labels = {
    direct: 'Прямой вход',
    referral: 'Реферальный трафик',
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    vk: 'VK',
    linkedin: 'LinkedIn',
    x: 'X',
    bio: 'Bio hub',
    messenger: 'Мессенджеры',
    relaunch: 'Повторный запуск',
    social: 'Соцсети',
    paid: 'Реклама',
    search: 'Поиск',
    email: 'Email',
  };
  return labels[value] || value;
}

function labelizeMarketingEvent(eventType) {
  const value = String(eventType || '').trim().toLowerCase();
  const labels = {
    auth_start: 'Старт входа',
    telegram_auth_start: 'Telegram-вход',
    auth_complete: 'Завершённый вход',
    ai_preview: 'AI-подсказка',
    ai_message: 'Сообщение AI',
    ai_prompt_click: 'Быстрый AI-промпт',
    copy_referral: 'Копирование ссылки',
    share_referral: 'Шаринг шаблона',
    share_channel_click: 'Переход в канал шеринга',
    cta_click: 'Клик по CTA',
    order_create: 'Создание заказа',
    product_view: 'Просмотр продукта',
    panel_open: 'Открытие раздела',
    profile_update: 'Обновление профиля',
    landing_open_materials: 'Переход в материалы',
    landing_tool_prefill: 'Префилл инструмента',
    learning_track_select: 'Выбор трека',
    automation_prefill: 'Быстрый запуск',
    faq_filter: 'Фильтр FAQ',
    lead_desk_open: 'Открытие карточки лида',
    lead_desk_update: 'Обновление карточки лида',
    lead_desk_clear: 'Сброс ручных полей лида',
    lead_followup_task_create: 'Follow-up переведён в задачу',
  };
  /*
    media_filter: 'Р¤РёР»СЊС‚СЂ РјРµРґРёР°С†РµРЅС‚СЂР°',
    media_language_switch: 'РЇР·С‹Рє РјРµРґРёР°С†РµРЅС‚СЂР°',
    media_open_panel: 'РџРµСЂРµС…РѕРґ РёР· РјРµРґРёР°С†РµРЅС‚СЂР°',
  */
  return labels[value] || value.replace(/_/g, ' ');
}

function buildHeroGrowthCards(context) {
  if (!context) {
    return [
      {
        label: 'Кабинет',
        value: 'Каталог, кабинет и AI в одной системе',
        meta: 'Лендинги, кабинет, рекламные материалы и AI уже связаны в одну систему для трафика.',
        accent: true,
        icon: '\u{1F4BC}',
      },
      {
        label: 'Рост',
        value: 'Следующий шаг выбирается автоматически',
        meta: 'Система подсказывает, куда вести человека дальше: в каталог, Telegram-вход, AI или партнёрку.',
        icon: '\u{1F4C8}',
      },
      {
        label: 'Duplication',
        value: 'Партнёрский рост без ручной рутины',
        meta: 'После входа пользователь получает ссылку, шаблоны и готовый набор для дубликации.',
        icon: '\u{1F91D}',
      },
    ];
  }

  const topSource = safeArray(context.analytics?.sources)[0];
  const primaryAction = context.cta?.primary?.label || 'Открыть кабинет';
  const signalMeta = topSource
    ? `Главный канал: ${labelizeMarketingSource(topSource.source)} · ${formatNumber(topSource.count)}`
    : `Визитов: ${formatNumber(context.traffic?.visitsCount || 0)}`;

  return [
    {
      label: 'Journey',
      value: context.journey?.label || 'Новый визит',
      meta: context.journey?.summary || 'Система определяет ближайший рабочий сценарий для пользователя.',
      accent: true,
      icon: '\u{1F9ED}',
    },
    {
      label: 'Следующий шаг',
      value: primaryAction,
      meta: context.cta?.note || 'Подсказка для следующего целевого действия уже подготовлена.',
      icon: '\u{1F680}',
    },
    {
      label: 'Источник',
      value: labelizeMarketingSource(context.traffic?.sourceChannel || 'direct'),
      meta: signalMeta,
      icon: '\u{1F4E1}',
    },
  ];
}

function renderHeroGrowthStrip(context) {
  const root = $('#hero-growth-strip');
  if (!root) return;
  root.innerHTML = buildHeroGrowthCards(context).map((item, index) => `
    <article class="growth-card ${item.accent || index === 0 ? 'growth-card--accent' : ''}">
      <div class="growth-card-title">${escapeHtml(item.icon || '')} ${escapeHtml(item.label)}</div>
      <strong class="growth-card-text">${escapeHtml(item.value)}</strong>
      <span class="growth-card-meta">${escapeHtml(item.meta)}</span>
    </article>
  `).join('');
}

function emptyState(text) {
  return `<article class="empty-state"><div class="empty-state-icon">\u{1F4ED}</div><div class="empty-state-title">Пока пусто</div><div class="empty-state-text">${escapeHtml(text)}</div></article>`;
}

function truncateText(text, maxLength = 280) {
  const value = String(text || '').trim();
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function setStatus(node, text, isError = false) {
  if (!node) return;
  node.textContent = text || '';
  node.style.color = isError ? '#c55e5e' : '';
}

function parseFocusAreas(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function getRoleLabel(role) {
  const resolved = String(role || '').trim().toLowerCase();
  return safeArray(state.profileMeta?.roles).find((item) => item.id === resolved)?.title
    || ROLE_LABELS[resolved]
    || 'Участник';
}

function getExperienceLabel(level) {
  const resolved = String(level || '').trim().toLowerCase();
  return safeArray(state.profileMeta?.levels).find((item) => item.id === resolved)?.title
    || EXPERIENCE_LABELS[resolved]
    || 'Новый старт';
}

function getAuthMethodsLabel(methods) {
  const labels = safeArray(methods).map((item) => {
    const value = String(item || '').trim().toLowerCase();
    if (value === 'telegram') return 'Telegram';
    if (value === 'email') return 'Email';
    return value;
  }).filter(Boolean);
  return labels.length ? labels.join(', ') : 'Email';
}

function buildOnboardingSnapshot() {
  const user = state.user || {};
  const dashboardOnboarding = state.dashboard?.onboarding || {};
  const baseOnboarding = user.onboarding || {};
  const workspace = getWorkspace();
  const onboarding = {
    ...baseOnboarding,
    ...dashboardOnboarding,
  };

  const completedSteps = new Set(safeArray(onboarding.completedSteps));
  if (user.displayName || user.city || user.userRole || user.experienceLevel || user.profile?.phone || user.profile?.country || user.profile?.timezone) completedSteps.add('profile');
  if (safeArray(user.focusAreas).length || user.goalsSummary || onboarding.primaryGoal) completedSteps.add('focus');
  if ((workspace && (workspace.siteReferralLink || workspace.companyReferralLink || safeArray(workspace.landingLinks).length)) || user.activeProtocolId || state.dashboard?.activeProtocol) completedSteps.add('protocol');
  if (state.shortLinks.length || state.aiMessages.length || safeArray(state.support?.items).length || safeArray(state.tasks).length || Number(state.dashboard?.planner?.summary?.total || 0) > 0) completedSteps.add('planner');

  const steps = safeArray(onboarding.steps || state.dashboard?.memberPortal?.onboardingSteps || state.profileMeta?.memberPortal?.onboardingSteps)
    .map((item) => ({
      ...item,
      completed: completedSteps.has(item.id),
    }));

  const completedCount = steps.filter((item) => item.completed).length;
  const total = steps.length || 1;
  const completion = Math.max(
    Number(user.profileCompletion || 0),
    Math.round((completedCount / total) * 100),
  );
  const onboardingCompleted = Boolean(user.onboardingCompletedAt) || String(onboarding.status || '').trim().toLowerCase() === 'completed';
  const nextStep = onboardingCompleted ? null : (steps.find((item) => !item.completed) || null);

  return {
    status: onboardingCompleted ? 'completed' : (completedCount > 0 ? 'in_progress' : 'pending'),
    percent: onboardingCompleted ? 100 : completion,
    completedCount,
    total: steps.length,
    steps,
    nextStep,
    primaryGoal: onboarding.primaryGoal || user.goalsSummary || '',
    preferredPace: onboarding.preferredPace || 'steady',
  };
}

function syncAuthChoiceCards() {
  const selected = $('#register-form input[name="userRole"]:checked')?.value || 'hybrid';
  $all('.auth-choice-card').forEach((card) => {
    const input = card.querySelector('input[name="userRole"]');
    card.classList.toggle('is-active', Boolean(input && input.value === selected));
  });
}

function syncRegisterReferralBanner() {
  const banner = $('#register-referral-banner');
  const input = $('#register-form input[name="referralCode"]');
  if (!banner || !input) return;
  const code = String(input.value || '').trim();
  if (!code) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  banner.hidden = false;
  banner.innerHTML = `
    <strong>Реферальный код уже подключён</strong>
    <span>Кабинет будет создан с рекомендацией <b>${escapeHtml(code)}</b> и сразу сохранит контекст приглашения.</span>
  `;
}

function syncDashboardHeroChips() {
  const roleChip = $('#dashboard-role-chip');
  const stateChip = $('#dashboard-state-chip');
  if (!roleChip || !stateChip) return;
  if (!state.user) {
    roleChip.textContent = 'гостевой режим';
    stateChip.textContent = 'AI + реклама + партнёры';
    return;
  }
  const onboarding = buildOnboardingSnapshot();
  roleChip.textContent = getRoleLabel(state.user.userRole);
  stateChip.textContent = onboarding.status === 'completed'
    ? 'настройка завершена'
    : onboarding.nextStep
      ? `шаг: ${onboarding.nextStep.title}`
      : 'кабинет активен';
}

function clearBotAuthFlow() {
  if (state.botAuthPollTimer) window.clearInterval(state.botAuthPollTimer);
  if (state.botAuthDeadlineTimer) window.clearTimeout(state.botAuthDeadlineTimer);
  state.botAuthPollTimer = null;
  state.botAuthDeadlineTimer = null;
  state.botAuthRequestId = null;
}

function setTelegramHint(text, isError = false) {
  setStatus($('#telegram-auth-hint'), text, isError);
}

function updateHeaderState() {
  const authenticated = Boolean(state.user);
  if ($('#open-auth-btn')) $('#open-auth-btn').textContent = authenticated ? 'Кабинет' : 'Войти';
  if ($('#open-register-btn')) $('#open-register-btn').textContent = authenticated ? 'Открыть кабинет' : 'Создать кабинет';
}

function setAuthMode(mode) {
  const resolved = mode === 'register' ? 'register' : 'login';
  $all('.auth-switcher__item').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.authMode === resolved);
  });
  $('#login-form')?.classList.toggle('is-active', resolved === 'login');
  $('#register-form')?.classList.toggle('is-active', resolved === 'register');
  const meta = AUTH_MODE_META[resolved] || AUTH_MODE_META.login;
  if ($('#auth-title')) $('#auth-title').textContent = meta.title;
  if ($('#auth-copy')) $('#auth-copy').textContent = meta.copy;
}

function openAuth(mode = 'login') {
  setAuthMode(mode);
  setStatus($('#auth-status'), '');
  syncAuthCapabilities();
  syncAuthChoiceCards();
  syncRegisterReferralBanner();
  $('#auth-dialog')?.showModal?.();
}

function closeAuth() {
  $('#auth-dialog')?.close?.();
}

function syncAuthCapabilities() {
  const botEnabled = Boolean(state.auth?.botEnabled);
  const botUsername = String(state.auth?.botUsername || '').replace(/^@+/, '');
  const button = $('#telegram-auth-btn');
  if (button) button.hidden = !botEnabled;
  setTelegramHint(
    botEnabled
      ? `Быстрый вход доступен через @${botUsername || 'Golden Connect_bizbot'}.`
      : 'Вход через Telegram сейчас недоступен.',
  );
}

function applyActionToButton(button, action, fallbackLabel) {
  if (!button) return;
  button.textContent = action?.label || fallbackLabel;
  button.dataset.actionKind = action?.kind || '';
  button.dataset.actionTarget = action?.target || '';
  button.dataset.actionId = action?.id || '';
}

function applyMarketingContext() {
  const context = getActiveMarketingContext();
  applyActionToButton(
    $('#hero-primary-btn'),
    context?.cta?.primary,
    state.user ? 'Открыть кабинет' : 'Создать кабинет',
  );
  applyActionToButton($('#hero-secondary-btn'), context?.cta?.secondary, 'Открыть каталог');
  applyActionToButton(
    $('#cta-register-btn'),
    context?.cta?.primary,
    state.user ? 'Открыть кабинет' : 'Создать кабинет',
  );
  applyActionToButton(
    $('#cta-login-btn'),
    state.user
      ? { id: 'open_dashboard', label: 'Открыть кабинет', kind: 'scroll', target: 'dashboard' }
      : { id: 'login', label: 'Войти в аккаунт', kind: 'auth', target: 'login' },
    state.user ? '\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043a\u0430\u0431\u0438\u043d\u0435\u0442' : '\u0412\u043e\u0439\u0442\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442',
  );
  if ($('#hero-marketing-note')) {
    $('#hero-marketing-note').textContent = context?.cta?.note || '';
    $('#hero-marketing-note').hidden = !context?.cta?.note;
  }
  renderHeroGrowthStrip(context);
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    return true;
  }
}

function getWorkspace() {
  return state.dashboard?.workspace || state.partner?.workspace || null;
}

function getReferralCenter() {
  return state.partner?.referralCenter || state.site?.referralCenter || null;
}

function getLandingLibrary() {
  return state.partner?.landingLibrary || state.site?.landingLibrary || null;
}

function getPromoCenter() {
  return state.partner?.promoCenter || state.site?.promoCenter || null;
}

function getLearningCenter() {
  return state.partner?.learningCenter || state.site?.learningCenter || null;
}

function getMediaCenter() {
  return state.partner?.mediaCenter || state.site?.mediaCenter || null;
}

function getGrowthAutomationCenter() {
  return state.partner?.growthAutomation || state.site?.growthAutomation || null;
}

function getArsenalSuite() {
  return state.partner?.arsenal || state.site?.arsenal || null;
}

function addDaysIso(days = 0) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function getGrowthModel() {
  const overview = state.partner?.overview || {};
  const points = Number(overview.points || 0);
  const directReferrals = Number(overview.directReferrals || 0);
  const totalReferrals = Number(overview.totalReferrals || 0);
  const completedTasks = state.tasks.filter((item) => item.status === 'done').length;
  const score = points
    + directReferrals * 140
    + totalReferrals * 45
    + state.shortLinks.length * 18
    + completedTasks * 22;

  const current = [...GROWTH_STAGES].reverse().find((item) => score >= item.threshold) || GROWTH_STAGES[0];
  const currentIndex = Math.max(0, GROWTH_STAGES.findIndex((item) => item.id === current.id));
  const next = GROWTH_STAGES[currentIndex + 1] || null;
  const previousThreshold = current.threshold || 0;
  const nextThreshold = next?.threshold || current.threshold || 1;
  const progress = next
    ? Math.max(0, Math.min(100, Math.round(((score - previousThreshold) / Math.max(1, nextThreshold - previousThreshold)) * 100)))
    : 100;

  return {
    score,
    points,
    directReferrals,
    totalReferrals,
    completedTasks,
    current,
    next,
    progress,
    remainingToNext: next ? Math.max(0, next.threshold - score) : 0,
  };
}

function getCurrentLandingWorkspace() {
  const ui = getLandingUiState();
  const workspace = ui?.workspace || getWorkspace();
  const language = ui?.language || null;
  const landing = ui?.landing || null;
  const link = ui?.link || null;
  return {
    workspace,
    language,
    landing,
    link,
    languageName: language?.nativeLabel || language?.label || 'Русский',
    landingTitle: getLocalizedCopy(landing?.titles, language?.id, landing?.title || 'Лендинг'),
  };
}

function buildMarketingMeta(extra = {}) {
  const current = getCurrentLandingWorkspace();
  return {
    activePanel: state.activePanel || 'overview',
    landingId: current.landing?.id || '',
    landingTitle: current.landingTitle || '',
    languageId: current.language?.id || '',
    languageName: current.languageName || '',
    referralCode: current.workspace?.referralCode || '',
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
}

function getCampaignUiCopy(languageId = 'ru') {
  if (String(languageId || '').trim().toLowerCase() === 'en') {
    return {
      campaign: 'Campaign',
      trackedLink: 'Tracked link',
      audience: 'Audience',
      landing: 'Landing',
      language: 'Language',
      deepLinks: 'Deep links',
      steps: 'Steps',
      metrics: 'Metrics',
      intro: 'Primary text',
      followUp: 'Follow-up',
      handoff: 'Company handoff',
      copyLink: 'Copy link',
      open: 'Open',
      shorten: 'Shorten',
      sharePack: 'Share pack',
      qr: 'QR',
      openMaterials: 'Open materials',
      openLinks: 'Open links',
      allChannels: 'Channels',
      noCampaigns: 'Campaigns will appear here after the partner workspace loads.',
    };
  }
  return {
    campaign: 'Кампания',
    trackedLink: 'Трекинг-ссылка',
    audience: 'Аудитория',
    landing: 'Лендинг',
    language: 'Язык',
    deepLinks: 'Deep links',
    steps: 'Шаги',
    metrics: 'Метрики',
    intro: 'Основной текст',
    followUp: 'Follow-up',
    handoff: 'Перевод в компанию',
    copyLink: 'Копировать ссылку',
    open: 'Открыть',
    shorten: 'Сократить',
    sharePack: 'Share-пакет',
    qr: 'QR',
    openMaterials: 'Открыть материалы',
    openLinks: 'Открыть ссылки',
    allChannels: 'Каналы',
    noCampaigns: 'Кампании появятся после загрузки партнерского контура.',
  };
}

function getReferralCampaignPresets() {
  return safeArray(getReferralCenter()?.campaignPresets);
}

function getReferralDeepLinkTargets() {
  return safeArray(getReferralCenter()?.deepLinkTargets);
}

function getShareChannelLabel(channel = '') {
  const value = String(channel || '').trim().toLowerCase();
  const labels = {
    telegram: 'Telegram',
    whatsapp: 'WhatsApp',
    vk: 'VK',
    email: 'Email',
    linkedin: 'LinkedIn',
    x: 'X',
  };
  return labels[value] || (value || 'Share');
}

function buildAbsoluteMarketingUrl(path = '/', params = {}, hash = '') {
  try {
    const target = new URL(path || '/', window.location.origin);
    Object.entries(params || {}).forEach(([key, rawValue]) => {
      const value = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
      if (value) target.searchParams.set(key, value);
    });
    if (hash) target.hash = String(hash || '').replace(/^#/, '');
    return target.toString();
  } catch {
    return '';
  }
}

function appendUrlParams(url, params = {}) {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return '';
  try {
    const target = new URL(safeUrl, window.location.origin);
    Object.entries(params || {}).forEach(([key, rawValue]) => {
      const value = rawValue === undefined || rawValue === null ? '' : String(rawValue).trim();
      if (value) target.searchParams.set(key, value);
    });
    return target.toString();
  } catch {
    return safeUrl;
  }
}

function buildChannelShareLink(channel, url, text = '', subject = 'Golden Connect') {
  const safeUrl = String(url || '').trim();
  const safeText = String(text || '').trim();
  const safeSubject = String(subject || 'Golden Connect').trim();
  if (!safeUrl) return '';
  if (channel === 'telegram') {
    return `https://t.me/share/url?url=${encodeURIComponent(safeUrl)}&text=${encodeURIComponent(safeText)}`;
  }
  if (channel === 'whatsapp') {
    return `https://wa.me/?text=${encodeURIComponent(`${safeText} ${safeUrl}`.trim())}`;
  }
  if (channel === 'vk') {
    return `https://vk.com/share.php?url=${encodeURIComponent(safeUrl)}`;
  }
  if (channel === 'email') {
    return `mailto:?subject=${encodeURIComponent(safeSubject)}&body=${encodeURIComponent(`${safeText}\n${safeUrl}`.trim())}`;
  }
  if (channel === 'linkedin') {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(safeUrl)}`;
  }
  if (channel === 'x') {
    return `https://twitter.com/intent/tweet?url=${encodeURIComponent(safeUrl)}&text=${encodeURIComponent(safeText)}`;
  }
  return safeUrl;
}

function resolveCampaignLinkTargetUrl(target, context, campaign, trackedLandingUrl = '') {
  if (!target || !context) return '';
  const workspace = context.workspace || getWorkspace() || {};
  const links = state.site?.links || {};
  if (target.kind === 'landing') {
    return trackedLandingUrl || context.link?.url || workspace.siteReferralLink || '';
  }
  if (target.kind === 'site_section') {
    return buildAbsoluteMarketingUrl(target.path || '/', {
      ref: workspace.referralCode || '',
      lang: context.language?.id || '',
      landing: context.landing?.id || '',
      utm_source: campaign?.utmSource || '',
      utm_medium: campaign?.utmMedium || '',
      utm_campaign: campaign?.utmCampaign || '',
      utm_content: target.id || '',
      utm_term: context.language?.id || '',
    }, target.hash || '');
  }
  if (target.kind === 'workspace') {
    return String(workspace[target.source] || '').trim();
  }
  if (target.kind === 'external') {
    if (target.source === 'instructions') return String(links.instructions || '').trim();
    if (target.source === 'officialSite') return String(links.officialSite || '').trim();
    return String(links[target.source] || '').trim();
  }
  return '';
}

function buildCampaignRuntime(campaign = {}, overrides = {}) {
  const library = getLandingLibrary();
  const workspace = getWorkspace();
  const promoCenter = getPromoCenter();
  if (!library || !workspace) return null;

  const fallbackContext = getCurrentLandingWorkspace();
  const languageId = String(overrides.languageId || state.landingPreferences.language || fallbackContext.language?.id || library.defaultLanguage || 'ru').trim().toLowerCase();
  const landingId = String(overrides.landingId || campaign.landingId || fallbackContext.landing?.id || safeArray(library.types)[0]?.id || '').trim();
  const context = getMediaCenterContext(landingId, languageId) || fallbackContext;
  const bundle = safeArray(promoCenter?.bundles).find((item) => item.landingId === context.landing?.id) || null;
  const baseLandingUrl = String(context.link?.url || workspace.siteReferralLink || '').trim();
  const landingUrl = appendUrlParams(baseLandingUrl, {
    utm_source: campaign.utmSource || '',
    utm_medium: campaign.utmMedium || '',
    utm_campaign: campaign.utmCampaign || '',
    utm_content: campaign.id || context.landing?.id || '',
    utm_term: context.language?.id || '',
  });
  const shortLink = findShortLinkForUrl(landingUrl) || findShortLinkForUrl(baseLandingUrl);
  const deepLinks = safeArray(campaign.deepLinkIds).map((targetId) => {
    const target = getReferralDeepLinkTargets().find((item) => item.id === targetId) || null;
    const url = resolveCampaignLinkTargetUrl(target, context, campaign, landingUrl);
    return target && url ? { ...target, url } : null;
  }).filter(Boolean);
  const variables = {
    landingUrl,
    baseLandingUrl,
    shortUrl: shortLink?.shortUrl || '',
    companyReferralLink: workspace.companyReferralLink || '',
    companyCatalogLink: workspace.companyCatalogLink || workspace.catalogLink || '',
    officialCompanyLink: workspace.officialCompanyLink || state.site?.links?.companyMain || '',
    referralCode: workspace.referralCode || '',
    landingTitle: context.landingTitle || '',
    languageName: context.languageName || '',
    resultsUrl: deepLinks.find((item) => item.id === 'results')?.url || '',
    productsUrl: deepLinks.find((item) => item.id === 'products')?.url || '',
    partnerUrl: deepLinks.find((item) => item.id === 'partner')?.url || '',
    contentUrl: deepLinks.find((item) => item.id === 'content')?.url || '',
  };
  const materialItems = safeArray(bundle?.items)
    .filter((item) => !safeArray(campaign.messageItemIds).length || safeArray(campaign.messageItemIds).includes(item.id))
    .slice(0, 3)
    .map((item) => {
      const localizedItem = getLocalizedPromoItem(item.id, context.language?.id) || null;
      const template = localizedItem?.template || item.template || '';
      return {
        id: item.id,
        title: localizedItem?.title || getLocalizedCopy(item.title, context.language?.id, item.id || 'material'),
        channel: item.channel || item.kind || 'message',
        kind: item.kind || 'message',
        content: fillPromoTemplate(template, variables),
      };
    });
  const primaryText = String(materialItems[0]?.content || `${campaign.summary || ''} ${landingUrl}`.trim()).trim();
  const handoffText = workspace.companyReferralLink
    ? `Если формат откликается, вот официальный переход по моей ссылке пригласителя: ${workspace.companyReferralLink}`
    : '';
  const shareLinks = safeArray(campaign.channels).map((channel) => ({
    id: channel,
    label: getShareChannelLabel(channel),
    url: buildChannelShareLink(channel, landingUrl, truncateText(primaryText, 220), campaign.title || 'Golden Connect'),
  })).filter((item) => item.url);

  return {
    campaign,
    context,
    bundle,
    landingUrl,
    baseLandingUrl,
    shortLink,
    deepLinks,
    materialItems,
    primaryText,
    handoffText,
    shareLinks,
  };
}

function buildCampaignCardMarkup(runtime, options = {}) {
  if (!runtime) return '';
  const campaign = runtime.campaign || {};
  const context = runtime.context || {};
  const uiCopy = getCampaignUiCopy(context.language?.id || 'ru');
  const materialItems = safeArray(runtime.materialItems);
  const introText = String(materialItems[0]?.content || runtime.primaryText || '').trim();
  const followUpText = String(materialItems[1]?.content || materialItems[2]?.content || '').trim();
  const showTexts = options.showTexts !== false;
  const compact = Boolean(options.compact);
  const panel = options.panel || 'links';
  const titleTag = compact ? 'h4' : 'h3';
  const title = String(campaign.title || uiCopy.campaign).trim();
  const summary = String(campaign.summary || '').trim();
  const trackedLink = String(runtime.landingUrl || runtime.baseLandingUrl || '').trim();
  const deepLinks = safeArray(runtime.deepLinks);
  const shareLinks = safeArray(runtime.shareLinks);
  const steps = compact ? safeArray(campaign.steps).slice(0, 2) : safeArray(campaign.steps);
  const metrics = compact ? safeArray(campaign.metrics).slice(0, 3) : safeArray(campaign.metrics);
  const languageName = context.languageName || context.language?.nativeLabel || context.language?.label || 'RU';
  const landingTitle = context.landingTitle || context.landing?.title || context.landing?.id || 'Landing';
  const shareTarget = String(runtime.shortLink?.shortUrl || trackedLink).trim();
  const campaignId = String(campaign.id || '').trim();

  return `
    <article class="data-card campaign-card ${compact ? 'campaign-card--compact' : ''}">
      <div class="campaign-card__header">
        <div>
          <span class="badge badge--accent">${escapeHtml(uiCopy.campaign)}</span>
          <${titleTag} class="campaign-card__title">${escapeHtml(title)}</${titleTag}>
          ${summary ? `<p class="campaign-card__summary">${escapeHtml(summary)}</p>` : ''}
        </div>
        <div class="campaign-card__meta">
          <span class="marketing-chip">${escapeHtml(uiCopy.landing)}: ${escapeHtml(landingTitle)}</span>
          <span class="marketing-chip">${escapeHtml(uiCopy.language)}: ${escapeHtml(languageName)}</span>
          ${campaign.audience ? `<span class="marketing-chip">${escapeHtml(uiCopy.audience)}: ${escapeHtml(campaign.audience)}</span>` : ''}
        </div>
      </div>
      <div class="campaign-card__section">
        <div class="data-item-title">${escapeHtml(uiCopy.trackedLink)}</div>
        <div class="referral-link-box">
          <div class="referral-link-text">${escapeHtml(trackedLink || '—')}</div>
        </div>
        <div class="product-card-actions">
          ${copyButtonMarkup(trackedLink, uiCopy.copyLink, 'copy_referral')}
          ${trackedLink ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(trackedLink)}" target="_blank" rel="noopener">${escapeHtml(uiCopy.open)}</a>` : ''}
          <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(trackedLink)}" data-tool-title="${escapeHtml(title)}">${escapeHtml(uiCopy.shorten)}</button>
          <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(shareTarget || trackedLink)}" data-tool-title="${escapeHtml(title)}">${escapeHtml(uiCopy.qr)}</button>
          <button class="btn btn--ghost btn--sm media-open-panel-btn" type="button" data-panel-target="materials" data-scenario-id="${escapeHtml(context.landing?.id || '')}" data-language-id="${escapeHtml(context.language?.id || '')}">${escapeHtml(uiCopy.openMaterials)}</button>
        </div>
      </div>
      ${shareLinks.length ? `
        <div class="campaign-card__section">
          <div class="data-item-title">${escapeHtml(uiCopy.allChannels)}</div>
          <div class="campaign-share-row">
            ${shareLinks.map((item) => `
              <a
                class="btn btn--ghost btn--sm marketing-share-link"
                href="${escapeHtml(item.url)}"
                ${String(item.url || '').startsWith('mailto:') ? '' : 'target="_blank" rel="noopener"'}
                data-channel="${escapeHtml(item.id)}"
                data-campaign-id="${escapeHtml(campaignId)}"
                data-landing-id="${escapeHtml(context.landing?.id || '')}"
                data-language-id="${escapeHtml(context.language?.id || '')}"
                data-panel="${escapeHtml(panel)}"
                data-share-url="${escapeHtml(trackedLink)}"
              >${escapeHtml(item.label || getShareChannelLabel(item.id))}</a>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${showTexts ? `
        <div class="campaign-text-stack">
          ${introText ? `
            <article class="campaign-text-card">
              <div class="data-item-title">${escapeHtml(uiCopy.intro)}</div>
              <p>${escapeHtml(introText)}</p>
              <div class="product-card-actions">
                ${copyButtonMarkup(introText, uiCopy.intro, 'share_referral')}
              </div>
            </article>
          ` : ''}
          ${followUpText ? `
            <article class="campaign-text-card">
              <div class="data-item-title">${escapeHtml(uiCopy.followUp)}</div>
              <p>${escapeHtml(followUpText)}</p>
              <div class="product-card-actions">
                ${copyButtonMarkup(followUpText, uiCopy.followUp, 'share_referral')}
              </div>
            </article>
          ` : ''}
          ${runtime.handoffText ? `
            <article class="campaign-text-card">
              <div class="data-item-title">${escapeHtml(uiCopy.handoff)}</div>
              <p>${escapeHtml(runtime.handoffText)}</p>
              <div class="product-card-actions">
                ${copyButtonMarkup(runtime.handoffText, uiCopy.handoff, 'share_referral')}
              </div>
            </article>
          ` : ''}
        </div>
      ` : ''}
      <div class="campaign-card__bottom">
        ${deepLinks.length ? `
          <div class="campaign-card__section">
            <div class="data-item-title">${escapeHtml(uiCopy.deepLinks)}</div>
            <div class="campaign-deep-links">
              ${deepLinks.map((item) => `
                <a class="campaign-deep-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
                  <strong>${escapeHtml(item.title || item.id || 'Link')}</strong>
                  <span>${escapeHtml(item.description || '')}</span>
                </a>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <div class="overview-grid overview-grid--two">
          <article class="overview-card">
            <span class="badge badge--muted">${escapeHtml(uiCopy.steps)}</span>
            <div class="data-list">
              ${steps.length
                ? steps.map((item, index) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">#${index + 1}</div>
                      <div class="data-item-sub">${escapeHtml(item)}</div>
                    </div>
                  </article>
                `).join('')
                : `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">${escapeHtml(uiCopy.noCampaigns)}</div></div></article>`}
            </div>
          </article>
          <article class="overview-card">
            <span class="badge badge--muted">${escapeHtml(uiCopy.metrics)}</span>
            <div class="marketing-chip-list">
              ${metrics.map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
          </article>
        </div>
      </div>
    </article>
  `;
}

function buildTaskTemplates() {
  const growth = getGrowthModel();
  const { workspace, language, link, landingTitle, languageName } = getCurrentLandingWorkspace();
  const companyLabel = workspace?.companyReferralLink ? 'Передать в официальный контур компании' : 'Подготовить перевод в компанию';
  const templates = [
    {
      id: 'launch-kit',
      title: `Собрать стартовый пакет под ${landingTitle}`,
      description: `Проверить лендинг на языке ${languageName}, материалы, короткую ссылку и QR для первого касания.`,
      category: 'launch',
      priority: 'high',
      dueAt: addDaysIso(1),
      tags: ['launch', 'landing', language?.id || 'ru'],
    },
    {
      id: 'first-outreach',
      title: 'Сделать первые 5 касаний',
      description: 'Взять готовый текст из рекламных материалов и отправить его в 5 целевых диалогов или каналов.',
      category: 'traffic',
      priority: growth.directReferrals > 0 ? 'medium' : 'high',
      dueAt: addDaysIso(2),
      tags: ['traffic', 'message', 'outreach'],
    },
    {
      id: 'short-link',
      title: 'Подготовить короткую ссылку и QR',
      description: `Создать короткую ссылку${link?.url ? ' для текущего лендинга' : ''} и отдельный QR для шаринга в мессенджерах.`,
      category: 'traffic',
      priority: state.shortLinks.length ? 'medium' : 'high',
      dueAt: addDaysIso(1),
      tags: ['shortener', 'qr', 'traffic'],
    },
    {
      id: 'follow-up',
      title: 'Подготовить follow-up после интереса',
      description: 'Собрать короткий ответ на интерес и мягкий перевод в следующий шаг без давления.',
      category: 'followup',
      priority: 'medium',
      dueAt: addDaysIso(3),
      tags: ['followup', 'materials', 'conversion'],
    },
    {
      id: 'company-handoff',
      title: companyLabel,
      description: 'Проверить ссылку регистрации в компанию и сценарий, по которому человек переходит после интереса.',
      category: 'partner',
      priority: 'medium',
      dueAt: addDaysIso(3),
      tags: ['company', 'handoff', 'referral'],
    },
    {
      id: 'duplication-kit',
      title: 'Собрать пакет дубликации для нового партнёра',
      description: 'Подготовить пакет: обзор, лендинг, материалы, FAQ и шаблон заданий для передачи новичку.',
      category: 'partner',
      priority: growth.directReferrals > 0 ? 'high' : 'low',
      dueAt: addDaysIso(5),
      tags: ['duplication', 'partner', 'system'],
    },
  ];

  return templates.map((item) => ({
    ...item,
    exists: state.tasks.some((task) => (task.notes || '').includes(`template:${item.id}`) || task.title === item.title),
  }));
}

function buildAutomationActions() {
  const { link, landingTitle, languageName } = getCurrentLandingWorkspace();
  return [
    {
      id: 'tool-short',
      title: 'Сократить текущий лендинг',
      description: 'Открыть встроенный shortener уже с подставленной ссылкой текущего сценария.',
      actionLabel: 'Открыть shortener',
    },
    {
      id: 'tool-qr',
      title: 'Сделать QR без ручного ввода',
      description: 'Подставить текущую ссылку в генератор QR и быстро выпустить готовый код.',
      actionLabel: 'Собрать QR',
    },
    {
      id: 'tool-caption',
      title: 'Собрать AI-текст под связку',
      description: `Заполнить AI-форму темой ${landingTitle} на языке ${languageName} и получить быстрые варианты текста.`,
      actionLabel: 'Открыть AI-тексты',
    },
    {
      id: 'open-materials',
      title: 'Открыть материалы под сценарий',
      description: 'Перейти в рекламные материалы с уже выбранным лендингом и языком.',
      actionLabel: 'Открыть материалы',
    },
    {
      id: 'open-learning',
      title: 'Перейти в обучение',
      description: 'Открыть рекомендованный учебный сценарий и быстро сверить следующий шаг.',
      actionLabel: 'Открыть обучение',
    },
    {
      id: 'open-links',
      title: 'Открыть tracked links',
      description: 'Быстро перейти в раздел ссылок, кампаний и deep links по текущему сценарию.',
      actionLabel: 'Открыть ссылки',
    },
    {
      id: 'open-media',
      title: 'Открыть медиацентр',
      description: 'Перейти в библиотеку контента, визуалов и стартовых наборов под текущий сценарий.',
      actionLabel: 'Открыть медиацентр',
    },
  ].map((item) => ({
    ...item,
    disabled: !link?.url && (item.id === 'tool-short' || item.id === 'tool-qr'),
  }));
}

function getRecommendedLearningTrack(tracks) {
  const directReferrals = Number(state.partner?.overview?.directReferrals || 0);
  let recommendedTrack = tracks.find((track) => track.id === 'start') || tracks[0] || null;
  if (state.shortLinks.length > 0 || Number(state.dashboard?.stats?.openTasks || 0) > 0) {
    recommendedTrack = tracks.find((track) => track.id === 'traffic') || recommendedTrack;
  }
  if (directReferrals > 0 || String(state.user?.experienceLevel || '').trim().toLowerCase() === 'advanced') {
    recommendedTrack = tracks.find((track) => track.id === 'duplication') || recommendedTrack;
  }
  return recommendedTrack;
}

function getSelectedLearningTrack(tracks = safeArray(getLearningCenter()?.tracks)) {
  const recommendedTrack = getRecommendedLearningTrack(tracks);
  return tracks.find((track) => track.id === state.learningPreferences.trackId)
    || recommendedTrack
    || tracks[0]
    || null;
}

function getLearningScenario(scenarioId = '') {
  const learningCenter = getLearningCenter();
  const scenarios = safeArray(learningCenter?.scenarios);
  return scenarios.find((item) => item.id === scenarioId) || null;
}

function getProductById(productId = '') {
  const normalized = String(productId || '').trim();
  if (!normalized) return null;
  return safeArray(state.products).find((item) => item.id === normalized) || null;
}

function getContentHubItemById(itemId = '') {
  const normalized = String(itemId || '').trim();
  if (!normalized) return null;
  return safeArray(state.site?.contentHub).find((item) => item.id === normalized) || null;
}

function getCurrentMediaPack() {
  const mediaCenter = getMediaCenter();
  const landingId = getCurrentLandingWorkspace().landing?.id || '';
  return safeArray(mediaCenter?.packs).find((item) => item.landingId === landingId)
    || safeArray(mediaCenter?.packs)[0]
    || null;
}

function getLearningModules() {
  const growth = getGrowthModel();
  return LEARNING_MODULE_LIBRARY.map((item) => ({
    ...item,
    recommended:
      (item.panel === 'landings' && growth.current.id === 'launch')
      || (item.panel === 'materials' && growth.current.id === 'traffic')
      || (item.panel === 'rating' && growth.current.id === 'duplication'),
  }));
}

function getFaqCategory(item = {}) {
  if (item.category) return item.category;
  const text = `${item.q || ''} ${item.a || ''}`.toLowerCase();
  if (/продукт|каталог|инструкц|вода|omega|омега|tempulis|жив/i.test(text)) return 'products';
  if (/язык|language|локал/i.test(text)) return 'languages';
  if (/лендинг|landing/i.test(text)) return 'landings';
  if (/материал|текст|сообщени|post|story/i.test(text)) return 'materials';
  if (/автомат|short|qr|arsenal|ai/i.test(text)) return 'automation';
  if (/компан|регистрац|пригласител/i.test(text)) return 'company';
  if (/поддерж|support|эскал/i.test(text)) return 'support';
  return 'start';
}

function getFaqLibraryItems() {
  const learningCenter = getLearningCenter();
  const baseItems = safeArray(learningCenter?.faq).map((item, index) => ({
    id: `faq-core-${index + 1}`,
    category: item.category || getFaqCategory(item),
    q: item.q,
    a: item.a,
    tags: safeArray(item.tags),
  }));
  return [
    ...baseItems,
    ...FAQ_EXTENSION.map((item) => ({
      ...item,
      category: item.category || getFaqCategory(item),
      tags: safeArray(item.tags),
    })),
  ];
}

function labelizeDashboardPanel(panel) {
  const value = String(panel || '').trim().toLowerCase();
  const labels = {
    overview: 'Обзор',
    links: 'Мои ссылки',
    landings: 'Лендинги',
    materials: 'Материалы',
    tools: 'Инструменты',
    tasks: 'Задания',
    rating: 'Рейтинг',
    learning: 'Обучение',
    faq: 'FAQ',
    support: 'Поддержка',
    profile: 'Профиль',
    products: 'Каталог',
  };
  return labels[value] || value || 'Раздел';
}

function labelizeLandingSignal(landingId = '') {
  const value = String(landingId || '').trim().toLowerCase();
  const library = getLandingLibrary();
  const type = safeArray(library?.types).find((item) => String(item.id || '').trim().toLowerCase() === value);
  return type ? getLocalizedCopy(type.labels, 'ru', type.title || type.id || value) : (value || '—');
}

function labelizeLanguageSignal(languageId = '') {
  const value = String(languageId || '').trim().toLowerCase();
  const library = getLandingLibrary();
  const language = safeArray(library?.languages).find((item) => String(item.id || '').trim().toLowerCase() === value);
  return language?.nativeLabel || language?.label || value || '—';
}

function buildOverviewAnalyticsSnapshot(context) {
  const analytics = context?.analytics || {};
  const funnel = analytics.funnel || {};
  const visits = Math.max(Number(funnel.visits || 0), Number(context?.traffic?.visitsCount || 0));
  const authCompletes = Number(funnel.authCompletes || 0);
  const aiSignals = Number(funnel.aiSignals || 0);
  const referralsShared = Number(funnel.referralsShared || 0);
  const directReferrals = Number(context?.performance?.directReferrals || funnel.directReferrals || 0);
  const authRate = visits ? Math.round((authCompletes / visits) * 100) : 0;
  const shareRate = visits ? Math.round((referralsShared / visits) * 100) : 0;
  const directRate = referralsShared ? Math.round((directReferrals / referralsShared) * 100) : 0;
  const topSource = safeArray(analytics.sources)[0] || null;
  const topEvent = safeArray(analytics.topEvents)[0] || null;
  const topPanel = safeArray(analytics.panels)[0] || null;
  const topCta = safeArray(analytics.topCtas)[0] || null;
  const topLanding = safeArray(analytics.landingSignals)[0] || null;
  const topLanguage = safeArray(analytics.languageSignals)[0] || null;
  const recentSignals = safeArray(context?.recentEvents).slice(-4).reverse();

  let weakestLabel = 'Воронка уже собрана';
  let weakestText = 'Сейчас задача не в том, чтобы чинить базу, а в том, чтобы усиливать лучший сценарий и его повторять.';
  if (visits > 0 && authCompletes === 0) {
    weakestLabel = 'Нет входа в кабинет';
    weakestText = 'Трафик уже есть, но человек не доходит до авторизации. Нужен более понятный CTA на регистрацию или Telegram-вход.';
  } else if (aiSignals > 0 && referralsShared === 0) {
    weakestLabel = 'Интерес есть, шаринга нет';
    weakestText = 'AI и материалы уже включают интерес, но следующий шаг не закреплён ссылкой, QR или follow-up сообщением.';
  } else if (referralsShared > 0 && directReferrals === 0) {
    weakestLabel = 'Касания есть, регистраций нет';
    weakestText = 'Ссылки и материалы уже отправляются, значит пора усиливать перевод в официальный контур компании.';
  } else if (!visits) {
    weakestLabel = 'Нет живых визитов';
    weakestText = 'Сначала нужен первый рабочий трафик: лендинг, short link, QR и несколько целевых касаний.';
  }

  return {
    visits,
    authCompletes,
    aiSignals,
    referralsShared,
    directReferrals,
    authRate,
    shareRate,
    directRate,
    topSource,
    topEvent,
    topPanel,
    topCta,
    topLanding,
    topLanguage,
    recentSignals,
    recommendation: safeArray(analytics.recommendations)[0] || 'Сначала усиливаем один рабочий сценарий, а потом масштабируем его по языкам и каналам.',
    secondaryRecommendation: safeArray(analytics.recommendations)[1] || 'Не распыляйтесь: лендинг, материал, short link и следующий шаг должны работать как единый комплект.',
    weakestLabel,
    weakestText,
  };
}

function buildLeadPipelineSnapshot(context = getActiveMarketingContext()) {
  const growthAutomation = getGrowthAutomationCenter();
  if (!growthAutomation) return null;
  const analytics = context?.analytics || {};
  const funnel = analytics.funnel || {};
  const leadSummary = getLeadSummary(context);
  const directReferrals = Number(context?.performance?.directReferrals || funnel.directReferrals || state.partner?.overview?.directReferrals || 0);
  const stageCounts = {
    awareness: Math.max(Number(leadSummary?.byStage?.awareness || 0), Number(funnel.visits || 0), Number(context?.traffic?.visitsCount || 0)),
    interest: Math.max(Number(leadSummary?.byStage?.interest || 0), 0, Number(funnel.aiSignals || 0) + Number(funnel.productSignals || 0)),
    conversation: Math.max(Number(leadSummary?.byStage?.conversation || 0), 0, Number(funnel.referralsShared || 0) + Number(funnel.authStarts || 0)),
    handoff: Math.max(Number(leadSummary?.byStage?.handoff || 0), 0, Number(funnel.authCompletes || 0)),
    duplication: Math.max(Number(leadSummary?.byStage?.duplication || 0), 0, directReferrals),
  };
  let activeStageId = 'awareness';
  if (stageCounts.duplication > 0) {
    activeStageId = 'duplication';
  } else if (stageCounts.handoff > 0) {
    activeStageId = 'handoff';
  } else if (stageCounts.conversation > 0) {
    activeStageId = 'conversation';
  } else if (stageCounts.interest > 0) {
    activeStageId = 'interest';
  }
  const stages = safeArray(growthAutomation.leadStages);
  const activeIndex = Math.max(0, stages.findIndex((item) => item.id === activeStageId));

  return {
    activeStageId,
    activeStage: stages.find((item) => item.id === activeStageId) || stages[0] || null,
    stages: stages.map((item, index) => ({
      ...item,
      count: Number(stageCounts[item.id] || 0),
      isActive: item.id === activeStageId,
      isCompleted: index < activeIndex,
    })),
  };
}

function getRecommendedGrowthPlaybooks(snapshot = buildLeadPipelineSnapshot()) {
  const growthAutomation = getGrowthAutomationCenter();
  const currentLandingId = getCurrentLandingWorkspace().landing?.id || '';
  return safeArray(growthAutomation?.playbooks)
    .map((item) => {
      let score = 0;
      if (safeArray(item.stageIds).includes(snapshot?.activeStageId)) score += 4;
      if (safeArray(item.landingIds).includes(currentLandingId)) score += 3;
      if (!safeArray(item.landingIds).length || safeArray(item.landingIds).includes('all')) score += 1;
      if (snapshot?.activeStageId === 'duplication' && safeArray(item.stageIds).includes('duplication')) score += 2;
      return { ...item, _score: score };
    })
    .filter((item) => item._score > 0)
    .sort((left, right) => right._score - left._score)
    .slice(0, 3);
}

function getRecommendedGrowthExperiments(snapshot = buildLeadPipelineSnapshot()) {
  const growthAutomation = getGrowthAutomationCenter();
  const currentLandingId = getCurrentLandingWorkspace().landing?.id || '';
  return safeArray(growthAutomation?.experiments)
    .map((item) => {
      let score = 0;
      if (safeArray(item.stageIds).includes(snapshot?.activeStageId)) score += 4;
      if (safeArray(item.landingIds).includes(currentLandingId)) score += 3;
      if (!safeArray(item.landingIds).length || safeArray(item.landingIds).includes('all')) score += 1;
      return { ...item, _score: score };
    })
    .filter((item) => item._score > 0)
    .sort((left, right) => right._score - left._score)
    .slice(0, 2);
}

function buildGrowthPanelActionMarkup(panel, label, context = getCurrentLandingWorkspace()) {
  if (!panel || !label) return '';
  if (panel === 'materials' || panel === 'media') {
    return `<button class="btn btn--ghost btn--sm media-open-panel-btn" type="button" data-panel-target="${escapeHtml(panel)}" data-scenario-id="${escapeHtml(context.landing?.id || '')}" data-language-id="${escapeHtml(context.language?.id || '')}">${escapeHtml(label)}</button>`;
  }
  return `<button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(panel)}">${escapeHtml(label)}</button>`;
}

function buildGrowthPlaybookMarkup(item, options = {}) {
  if (!item) return '';
  const compact = Boolean(options.compact);
  const context = options.context || getCurrentLandingWorkspace();
  return `
    <article class="promo-material-card growth-playbook-card ${compact ? 'growth-playbook-card--compact' : ''}">
      <span class="badge badge--accent">Playbook</span>
      <h4>${escapeHtml(item.title || 'Playbook')}</h4>
      <p>${escapeHtml(item.summary || '')}</p>
      <div class="marketing-chip-list">
        ${safeArray(item.channels).slice(0, compact ? 2 : 4).map((channel) => `<span class="marketing-chip">${escapeHtml(channel)}</span>`).join('')}
        ${safeArray(item.metrics).slice(0, compact ? 2 : 3).map((metric) => `<span class="marketing-chip">${escapeHtml(metric)}</span>`).join('')}
      </div>
      ${compact ? '' : `
        <div class="data-list">
          ${safeArray(item.steps).map((step, index) => `
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Шаг ${index + 1}</div>
                <div class="data-item-sub">${escapeHtml(step)}</div>
              </div>
            </article>
          `).join('')}
        </div>
      `}
      <div class="product-card-actions">
        ${buildGrowthPanelActionMarkup(item.primaryPanel, item.primaryActionLabel, context)}
        ${buildGrowthPanelActionMarkup(item.secondaryPanel, item.secondaryActionLabel, context)}
        ${item.toolAction ? `<button class="btn btn--ghost btn--sm automation-prefill-btn" type="button" data-automation-action="${escapeHtml(item.toolAction)}">${escapeHtml(item.toolActionLabel || 'Быстрый запуск')}</button>` : ''}
      </div>
    </article>
  `;
}

function buildGrowthExperimentMarkup(item) {
  if (!item) return '';
  const context = getCurrentLandingWorkspace();
  return `
    <article class="promo-material-card growth-experiment-card">
      <span class="badge badge--muted">A/B</span>
      <h4>${escapeHtml(item.title || 'Тест')}</h4>
      <p>${escapeHtml(item.summary || '')}</p>
      <div class="data-list">
        <article class="data-item">
          <div class="data-item-main">
            <div class="data-item-title">Гипотеза</div>
            <div class="data-item-sub">${escapeHtml(item.hypothesis || '')}</div>
          </div>
        </article>
        <article class="data-item">
          <div class="data-item-main">
            <div class="data-item-title">Метрика успеха</div>
            <div class="data-item-sub">${escapeHtml(item.successMetric || '')}</div>
          </div>
        </article>
      </div>
      <div class="marketing-chip-list">
        ${safeArray(item.variants).map((variant) => `<span class="marketing-chip">${escapeHtml(variant)}</span>`).join('')}
      </div>
      ${item.nextMove ? `<p class="growth-experiment-next">${escapeHtml(item.nextMove)}</p>` : ''}
      <div class="product-card-actions">
        ${buildGrowthPanelActionMarkup('landings', 'Открыть лендинги', context)}
        ${buildGrowthPanelActionMarkup('links', 'Открыть ссылки', context)}
      </div>
    </article>
  `;
}

function buildLeadStageBadgeClass(stageId = '') {
  const value = String(stageId || '').trim().toLowerCase();
  if (value === 'duplication') return 'badge--green';
  if (value === 'handoff') return 'badge--gold';
  if (value === 'conversation') return 'badge--accent';
  return 'badge--muted';
}

function buildLeadFollowUpBadgeClass(statusId = '') {
  const value = String(statusId || '').trim().toLowerCase();
  if (value === 'overdue') return 'badge--danger';
  if (value === 'today') return 'badge--gold';
  if (value === 'soon') return 'badge--accent';
  return 'badge--muted';
}

function summarizeLeadEvent(item = {}) {
  const meta = item?.meta && typeof item.meta === 'object' ? item.meta : {};
  const parts = [];
  if (item.panel) parts.push(labelizeDashboardPanel(item.panel));
  const landingId = String(meta.landingId || meta.landing || '').trim();
  const languageId = String(meta.languageId || meta.language || '').trim();
  if (landingId) parts.push(labelizeLandingSignal(landingId));
  if (languageId) parts.push(labelizeLanguageSignal(languageId));
  if (meta.channel) parts.push(getShareChannelLabel(meta.channel));
  if (meta.toolKind) parts.push(String(meta.toolKind).trim());
  if (item.pagePath && item.pagePath !== '/') parts.push(item.pagePath);
  return parts.join(' · ');
}

function getLeadWorkspaceContext(lead = null) {
  const scenarioId = String(lead?.landingId || state.landingPreferences.landingId || '').trim();
  const languageId = String(lead?.languageId || state.landingPreferences.language || '').trim().toLowerCase();
  return getMediaCenterContext(scenarioId, languageId) || getCurrentLandingWorkspace();
}

function getLeadContactSummary(lead = null) {
  if (!lead) return [];
  const items = [];
  if (lead.linkedEmail) {
    items.push({ label: 'Email', value: lead.linkedEmail });
  }
  if (lead.linkedTelegramUsername) {
    items.push({ label: 'Telegram', value: `@${lead.linkedTelegramUsername}` });
  } else if (lead.linkedTelegramId) {
    items.push({ label: 'Telegram ID', value: String(lead.linkedTelegramId) });
  }
  items.push({ label: 'Источник', value: labelizeMarketingSource(lead.sourceChannel || 'direct') });
  if (lead.languageId) {
    items.push({ label: 'Язык', value: labelizeLanguageSignal(lead.languageId) });
  }
  if (lead.landingId) {
    items.push({ label: 'Лендинг', value: labelizeLandingSignal(lead.landingId) });
  }
  return items;
}

function getLeadInboxItems(leads = getLeadBoardItems(), options = {}) {
  const limit = Math.max(1, Number(options.limit || 6));
  const stageWeights = { handoff: 0, conversation: 1, interest: 2, awareness: 3, duplication: 4 };
  const followUpWeights = { overdue: 0, today: 1, soon: 2, planned: 3, none: 4 };
  return safeArray(leads)
    .filter((item) => item && (item.followUpAt || ['handoff', 'conversation', 'interest'].includes(String(item.stageId || '').trim().toLowerCase())))
    .slice()
    .sort((left, right) => {
      const leftPinned = left.pinned ? 0 : 1;
      const rightPinned = right.pinned ? 0 : 1;
      if (leftPinned !== rightPinned) return leftPinned - rightPinned;
      const leftFollowUp = followUpWeights[String(left.followUpStatusId || 'none').trim().toLowerCase()] ?? 9;
      const rightFollowUp = followUpWeights[String(right.followUpStatusId || 'none').trim().toLowerCase()] ?? 9;
      if (leftFollowUp !== rightFollowUp) return leftFollowUp - rightFollowUp;
      const leftStage = stageWeights[String(left.stageId || '').trim().toLowerCase()] ?? 9;
      const rightStage = stageWeights[String(right.stageId || '').trim().toLowerCase()] ?? 9;
      if (leftStage !== rightStage) return leftStage - rightStage;
      return String(right.lastSeenAt || '').localeCompare(String(left.lastSeenAt || ''));
    })
    .slice(0, limit);
}

function buildLeadInboxMarkup(leads = [], options = {}) {
  const items = safeArray(leads);
  const compact = Boolean(options.compact);
  const emptyText = compact
    ? 'Когда появятся лиды с интересом или follow-up, здесь будет дневная очередь.'
    : 'Очередь follow-up появится, когда у лидов появятся стадии интереса, диалога, handoff или запланированные касания.';
  if (!items.length) return emptyState(emptyText);
  return `
    <div class="data-list">
      ${items.map((item) => {
        const contactLine = getLeadContactSummary(item).slice(0, compact ? 2 : 4);
        return `
          <article class="data-item lead-inbox-item">
            <div class="data-item-main">
              <div class="data-item-title">${escapeHtml(item.title || 'Lead')}</div>
              <div class="data-item-sub">${escapeHtml(item.nextMove || item.stageSummary || 'Подготовить следующее касание.')}</div>
              <div class="marketing-chip-list">
                <span class="badge ${buildLeadStageBadgeClass(item.stageId)}">${escapeHtml(item.stageTitle || item.stageId || 'lead')}</span>
                ${item.followUpLabel ? `<span class="badge ${buildLeadFollowUpBadgeClass(item.followUpStatusId)}">${escapeHtml(item.followUpLabel)}</span>` : ''}
                ${contactLine.map((entry) => `<span class="marketing-chip">${escapeHtml(`${entry.label}: ${entry.value}`)}</span>`).join('')}
              </div>
              ${compact ? '' : `${item.note ? `<div class="lead-inbox-note">${escapeHtml(item.note)}</div>` : ''}`}
            </div>
            <div class="product-card-actions lead-board-actions">
              <small>${escapeHtml(item.followUpAt ? formatDate(item.followUpAt, true) : (item.lastSeenAt ? formatDate(item.lastSeenAt, true) : 'без даты'))}</small>
              <button class="btn btn--ghost btn--sm lead-board-edit-btn" type="button" data-visitor-id="${escapeHtml(item.visitorId || '')}">Открыть lead desk</button>
              <button class="btn btn--ghost btn--sm lead-desk-task-btn" type="button" data-visitor-id="${escapeHtml(item.visitorId || '')}">В задачу</button>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function getLeadMediaPack(lead = null) {
  const mediaCenter = getMediaCenter();
  const context = getLeadWorkspaceContext(lead);
  return safeArray(mediaCenter?.packs).find((item) => item.landingId === context?.landing?.id)
    || getCurrentMediaPack()
    || null;
}

function getLeadRecommendedPlaybook(lead = null) {
  const growthAutomation = getGrowthAutomationCenter();
  const context = getLeadWorkspaceContext(lead);
  const sourceLabel = labelizeMarketingSource(lead?.sourceChannel || '').toLowerCase();
  return safeArray(growthAutomation?.playbooks)
    .map((item) => {
      let score = 0;
      if (safeArray(item.stageIds).includes(lead?.stageId)) score += 4;
      if (safeArray(item.landingIds).includes(context?.landing?.id || '')) score += 3;
      if (safeArray(item.channels).some((channel) => {
        const value = String(channel || '').trim().toLowerCase();
        return value && (value.includes(sourceLabel) || sourceLabel.includes(value));
      })) score += 2;
      if (!safeArray(item.landingIds).length || safeArray(item.landingIds).includes('all')) score += 1;
      return { ...item, _score: score };
    })
    .filter((item) => item._score > 0)
    .sort((left, right) => right._score - left._score)[0] || null;
}

function getLeadMessageLibrary(lead = null) {
  const context = getLeadWorkspaceContext(lead);
  const pack = getLeadMediaPack(lead);
  const learningCenter = getLearningCenter();
  const companyUrl = context?.workspace?.companyCatalogLink || context?.workspace?.companyReferralLink || state.site?.links?.companyCatalog || state.site?.links?.companyMain || '';
  const messages = safeArray(pack?.messages).map((entry) => ({
    ...entry,
    text: fillPromoTemplate(entry.template, {
      landingUrl: context?.link?.url || context?.workspace?.siteReferralLink || '',
      landingTitle: context?.landingTitle || '',
      landingLabel: context?.landingLabel || '',
      languageName: context?.languageName || '',
      companyUrl,
    }),
  }));
  const mentorTemplate = safeArray(learningCenter?.supportScripts).find((item) => item.id === 'mentor-brief');
  const supportTemplate = safeArray(learningCenter?.supportScripts).find((item) => item.id === 'support-brief');
  const mentorText = String(mentorTemplate?.text || '')
    .replace('[health/business/hybrid]', context?.landing?.id || lead?.landingId || 'hybrid')
    .replace('[ru/en/...]', context?.language?.id || lead?.languageId || 'ru')
    .replace('[ссылка]', context?.link?.url || '')
    .replace('[текст]', messages[0]?.text || '');
  return {
    context,
    pack,
    companyUrl,
    messages,
    mentor: mentorTemplate ? { ...mentorTemplate, text: mentorText } : null,
    support: supportTemplate || null,
    scenario: getLearningScenario(context?.landing?.id || '') || null,
  };
}

function buildLeadTimelineMarkup(lead = null) {
  const events = safeArray(lead?.recentEvents);
  if (!events.length) {
    return emptyState('История касаний появится после первых кликов, переходов и AI-сигналов этого лида.');
  }
  return `
    <div class="data-list">
      ${events.map((item) => `
        <article class="data-item">
          <div class="data-item-main">
            <div class="data-item-title">${escapeHtml(labelizeMarketingEvent(item.eventType || 'unknown'))}</div>
            <div class="data-item-sub">${escapeHtml(summarizeLeadEvent(item) || 'Системное событие без дополнительных деталей.')}</div>
          </div>
          <small>${escapeHtml(formatDate(item.createdAt, true))}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function buildLeadTaskDraft(lead = null) {
  if (!lead) return null;
  const library = getLeadMessageLibrary(lead);
  const nextMessage = library.messages[1]?.text || library.messages[0]?.text || '';
  const dueDate = String(lead.followUpAt || '').trim()
    ? String(lead.followUpAt).slice(0, 10)
    : addDaysIso(1);
  const priority = lead.followUpStatusId === 'overdue' || lead.stageId === 'handoff' ? 'high' : (lead.stageId === 'conversation' ? 'medium' : 'low');
  return {
    title: `Follow-up: ${lead.title || 'Lead'}`,
    description: [
      `Стадия: ${lead.stageTitle || lead.stageId || 'lead'}`,
      `Следующий шаг: ${lead.nextMove || lead.stageSummary || 'Усилить текущий сценарий.'}`,
      lead.note ? `Заметка: ${lead.note}` : '',
      nextMessage ? `Рекомендуемый текст:\n${nextMessage}` : '',
      library.context?.link?.url ? `Лендинг: ${library.context.link.url}` : '',
      library.companyUrl ? `Компания: ${library.companyUrl}` : '',
    ].filter(Boolean).join('\n\n'),
    category: 'followup',
    priority,
    dueAt: dueDate,
  };
}

function buildLeadBoardMarkup(leads = [], options = {}) {
  const items = safeArray(leads);
  const compact = Boolean(options.compact);
  if (!items.length) {
    return emptyState(compact
      ? 'Лиды появятся после первых переходов по вашей реферальной ссылке.'
      : 'Когда по вашему коду пойдут первые визиты, здесь появятся лиды по стадиям и следующий шаг по каждому.');
  }
  return `
    <div class="data-list">
      ${items.map((item) => `
        <article class="data-item lead-board-item">
          <div class="data-item-main">
            <div class="data-item-title">${escapeHtml(item.title || 'Lead')}</div>
            <div class="data-item-sub">${escapeHtml(item.subtitle || `${labelizeMarketingSource(item.sourceChannel)} · ${item.firstLandingPath || '/'}`)}</div>
            <div class="marketing-chip-list">
              <span class="badge ${buildLeadStageBadgeClass(item.stageId)}">${escapeHtml(item.stageTitle || item.stageId || 'lead')}</span>
              <span class="marketing-chip">${escapeHtml(labelizeMarketingSource(item.sourceChannel || 'direct'))}</span>
              <span class="marketing-chip">Визиты: ${escapeHtml(formatNumber(item.visitsCount || 0))}</span>
              ${item.ownerTag ? `<span class="marketing-chip">${escapeHtml(item.ownerTag)}</span>` : ''}
              ${item.followUpLabel ? `<span class="badge ${buildLeadFollowUpBadgeClass(item.followUpStatusId)}">${escapeHtml(item.followUpLabel)}</span>` : ''}
              ${item.languageId ? `<span class="marketing-chip">${escapeHtml(item.languageId)}</span>` : ''}
              ${item.utmCampaign ? `<span class="marketing-chip">${escapeHtml(item.utmCampaign)}</span>` : ''}
            </div>
            ${compact ? '' : `
              <div class="data-list">
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Следующий шаг</div>
                    <div class="data-item-sub">${escapeHtml(item.nextMove || item.stageSummary || 'Усилить текущий сценарий.')}</div>
                  </div>
                </article>
                ${item.note ? `
                  <article class="data-item lead-board-note">
                    <div class="data-item-main">
                      <div class="data-item-title">Заметка</div>
                      <div class="data-item-sub">${escapeHtml(item.note)}</div>
                    </div>
                  </article>
                ` : ''}
              </div>
            `}
          </div>
          <div class="product-card-actions lead-board-actions">
            <small>${escapeHtml(item.lastSeenAt ? formatDate(item.lastSeenAt, true) : 'без даты')}</small>
            ${item.lastEventType ? `<span class="marketing-chip">${escapeHtml(labelizeMarketingEvent(item.lastEventType))}</span>` : ''}
            <button class="btn btn--ghost btn--sm lead-board-edit-btn" type="button" data-visitor-id="${escapeHtml(item.visitorId || '')}">${compact ? 'В работу' : 'Карточка'}</button>
            ${buildGrowthPanelActionMarkup(item.nextPanel || 'materials', item.nextPanel === 'tasks' ? 'Открыть задачи' : item.nextPanel === 'links' ? 'Открыть ссылки' : item.nextPanel === 'landings' ? 'Открыть лендинги' : 'Открыть материалы')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function buildLeadDeskEditorMarkup(lead = null) {
  if (!lead) {
    return emptyState('Выберите лида из board, чтобы зафиксировать стадию, заметку и follow-up.');
  }

  const library = getLeadMessageLibrary(lead);
  const recommendedPlaybook = getLeadRecommendedPlaybook(lead);
  const contactSummary = getLeadContactSummary(lead);
  const firstMessage = library.messages[0] || null;
  const followUpMessage = library.messages[1] || null;
  const scenarioAnchors = safeArray(library.scenario?.anchors).slice(0, 4);
  const taskDraft = buildLeadTaskDraft(lead);

  const stageOptions = [
    { id: '', label: 'Авто по событиям' },
    { id: 'awareness', label: 'Внимание' },
    { id: 'interest', label: 'Интерес' },
    { id: 'conversation', label: 'Диалог' },
    { id: 'handoff', label: 'Перевод' },
    { id: 'duplication', label: 'Дубликация' },
  ];

  return `
    <article class="data-card">
      <div class="data-card-header">
        <div>
          <div class="data-card-title">${escapeHtml(lead.title || 'Lead')}</div>
          <small>${escapeHtml(lead.subtitle || `${labelizeMarketingSource(lead.sourceChannel)} | ${lead.firstLandingPath || '/'}`)}</small>
        </div>
        <div class="marketing-chip-list">
          <span class="badge ${buildLeadStageBadgeClass(lead.stageId)}">${escapeHtml(lead.stageTitle || 'Lead')}</span>
          ${lead.followUpLabel ? `<span class="badge ${buildLeadFollowUpBadgeClass(lead.followUpStatusId)}">${escapeHtml(lead.followUpLabel)}</span>` : ''}
          ${lead.pinned ? '<span class="badge badge--accent">Закреплён</span>' : ''}
        </div>
      </div>
      <form id="lead-desk-form" class="dashboard-stack">
        <input type="hidden" name="visitorId" value="${escapeHtml(lead.visitorId || '')}">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label" for="lead-stage-select">Стадия</label>
            <select id="lead-stage-select" class="form-input" name="stageOverride">
              ${stageOptions.map((item) => `
                <option value="${escapeHtml(item.id)}" ${item.id === String(lead.stageOverride || '') ? 'selected' : ''}>${escapeHtml(item.label)}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="lead-owner-tag">Тег</label>
            <input id="lead-owner-tag" class="form-input" name="ownerTag" type="text" maxlength="60" value="${escapeHtml(lead.ownerTag || '')}" placeholder="горячий / повтор / наставник">
          </div>
          <div class="form-group">
            <label class="form-label" for="lead-follow-up">Follow-up</label>
            <input id="lead-follow-up" class="form-input" name="followUpAt" type="datetime-local" value="${escapeHtml(toDatetimeLocalValue(lead.followUpAt))}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label" for="lead-note">Заметка</label>
          <textarea id="lead-note" class="form-input" name="note" rows="5" placeholder="Что уже отправили, на какой угол подачи среагировал и что сделать следующим касанием">${escapeHtml(lead.note || '')}</textarea>
        </div>
        <label class="check-item"><input type="checkbox" name="pinned" ${lead.pinned ? 'checked' : ''}> Закрепить лид наверху</label>
        <div class="product-card-actions">
          <button class="btn btn--primary btn--sm" type="submit">Сохранить карточку</button>
          <button class="btn btn--ghost btn--sm lead-desk-task-btn" type="button" data-visitor-id="${escapeHtml(lead.visitorId || '')}">В задачу</button>
          <button class="btn btn--ghost btn--sm lead-desk-clear-btn" type="button" data-visitor-id="${escapeHtml(lead.visitorId || '')}">Очистить ручные поля</button>
          ${buildGrowthPanelActionMarkup(lead.nextPanel || 'materials', lead.nextPanel === 'tasks' ? 'Открыть задачи' : lead.nextPanel === 'links' ? 'Открыть ссылки' : lead.nextPanel === 'landings' ? 'Открыть лендинги' : 'Открыть материалы')}
        </div>
        <p id="lead-desk-status" class="form-status"></p>
      </form>
      <div class="overview-grid overview-grid--two">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Связка лида</div>
              <small>${escapeHtml(`${library.context?.landingTitle || 'Лендинг'} | ${library.context?.languageName || 'Русский'}`)}</small>
            </div>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">${escapeHtml(labelizeMarketingSource(lead.sourceChannel || 'direct'))}</span>
            ${scenarioAnchors.map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="data-list">
            ${contactSummary.map((item) => `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(item.label)}</div>
                  <div class="data-item-sub">${escapeHtml(item.value)}</div>
                </div>
              </article>
            `).join('')}
          </div>
          ${library.context?.link?.url ? `<div class="referral-link-box"><div class="referral-link-text">${escapeHtml(library.context.link.url)}</div></div>` : ''}
          <div class="product-card-actions">
            ${library.context?.link?.url ? copyButtonMarkup(library.context.link.url, 'Копировать лендинг', 'copy_referral') : ''}
            ${library.companyUrl ? copyButtonMarkup(library.companyUrl, 'Копировать company link', 'copy_referral') : ''}
            ${library.context?.link?.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(library.context.link.url)}" target="_blank" rel="noopener">Открыть лендинг</a>` : ''}
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Следующий рабочий сценарий</div>
              <small>${escapeHtml(taskDraft?.dueAt ? `Срок follow-up: ${taskDraft.dueAt}` : 'Сценарий под текущую стадию')}</small>
            </div>
          </div>
          ${recommendedPlaybook ? buildGrowthPlaybookMarkup(recommendedPlaybook, { compact: true, context: library.context }) : `<p>${escapeHtml(lead.nextMove || 'Сначала закрепите следующий шаг и канал касания.')}</p>`}
        </article>
      </div>
      <div class="overview-grid overview-grid--two">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Готовые сообщения</div>
              <small>Можно копировать и использовать как основу следующего касания</small>
            </div>
          </div>
          <div class="data-list">
            ${firstMessage ? `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(firstMessage.title || 'Первое сообщение')}</div>
                  <div class="data-item-sub">${escapeHtml(firstMessage.text || '')}</div>
                </div>
                ${copyButtonMarkup(firstMessage.text || '', 'Копировать', 'share_referral')}
              </article>
            ` : ''}
            ${followUpMessage ? `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(followUpMessage.title || 'Follow-up')}</div>
                  <div class="data-item-sub">${escapeHtml(followUpMessage.text || '')}</div>
                </div>
                ${copyButtonMarkup(followUpMessage.text || '', 'Копировать', 'share_referral')}
              </article>
            ` : ''}
            ${library.mentor ? `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(library.mentor.title || 'Шаблон наставнику')}</div>
                  <div class="data-item-sub">${escapeHtml(library.mentor.text || '')}</div>
                </div>
                ${copyButtonMarkup(library.mentor.text || '', 'Копировать', 'share_referral')}
              </article>
            ` : ''}
            ${library.support ? `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(library.support.title || 'Шаблон в поддержку')}</div>
                  <div class="data-item-sub">${escapeHtml(library.support.text || '')}</div>
                </div>
                ${copyButtonMarkup(library.support.text || '', 'Копировать', 'share_referral')}
              </article>
            ` : ''}
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">История касаний</div>
              <small>Последние сигналы, чтобы не писать follow-up вслепую</small>
            </div>
          </div>
          ${buildLeadTimelineMarkup(lead)}
        </article>
      </div>
    </article>
  `;
}

function findShortLinkForUrl(targetUrl = '') {
  const normalized = String(targetUrl || '').trim();
  if (!normalized) return null;
  return safeArray(state.shortLinks).find((item) => String(item.url || '').trim() === normalized)
    || null;
}

function getPackVisualAssets(pack = null) {
  const mediaCenter = getMediaCenter();
  const packAssets = safeArray(pack?.visualAssets);
  if (packAssets.length) return packAssets;
  return safeArray(mediaCenter?.brandAssets).slice(0, 3);
}

function getPackCoverAsset(pack = null) {
  return safeArray(getPackVisualAssets(pack)).find((asset) => asset?.imageUrl) || null;
}

function buildLaunchBundleText(pack, options = {}) {
  if (!pack) return '';
  const landingUrl = String(options.landingUrl || '').trim();
  const shortUrl = String(options.shortUrl || '').trim();
  const companyUrl = String(options.companyUrl || '').trim();
  const landingTitle = String(options.landingTitle || '').trim() || 'Лендинг';
  const languageName = String(options.languageName || '').trim() || 'Русский';
  const referralCode = String(options.referralCode || '').trim();
  const productLines = safeArray(options.products).map((item) => item?.title).filter(Boolean);
  const contentLines = safeArray(options.contentItems).map((item) => item?.title).filter(Boolean);
  const firstMessage = safeArray(options.messages)[0]?.text || '';
  const followUp = safeArray(options.messages)[1]?.text || '';

  return [
    `Стартовый набор: ${pack.title || 'Пакет запуска'}`,
    '',
    `Сценарий: ${landingTitle}`,
    `Язык: ${languageName}`,
    referralCode ? `Код приглашения: ${referralCode}` : '',
    landingUrl ? `Главная ссылка: ${landingUrl}` : '',
    shortUrl ? `Короткая ссылка: ${shortUrl}` : '',
    companyUrl ? `Переход в компанию: ${companyUrl}` : '',
    '',
    'Углы подачи:',
    ...safeArray(pack.hooks).map((item) => `- ${item}`),
    '',
    'Пошаговый запуск:',
    ...safeArray(pack.launchSteps).map((item, index) => `${index + 1}. ${item}`),
    '',
    'Продуктовые опоры:',
    ...(productLines.length ? productLines.map((item) => `- ${item}`) : ['- Продукты будут подобраны после загрузки пакета']),
    '',
    'Опорные материалы:',
    ...(contentLines.length ? contentLines.map((item) => `- ${item}`) : ['- Дополнительные материалы будут доступны после настройки ссылок']),
    '',
    firstMessage ? `Первое сообщение:\n${firstMessage}` : '',
    followUp ? `\nFollow-up:\n${followUp}` : '',
  ].filter(Boolean).join('\n');
}

function getMediaCenterContext(scenarioId = '', languageId = '') {
  const library = getLandingLibrary();
  const workspace = getWorkspace();
  if (!library || !workspace) return null;
  ensureLandingPreferences(library);
  const resolvedLanguageId = String(languageId || state.landingPreferences.language || library.defaultLanguage || '').trim().toLowerCase();
  const resolvedScenarioId = String(scenarioId || state.landingPreferences.landingId || '').trim();
  const language = safeArray(library.languages).find((item) => item.id === resolvedLanguageId)
    || safeArray(library.languages).find((item) => item.id === library.defaultLanguage)
    || safeArray(library.languages)[0]
    || null;
  const landing = safeArray(library.types).find((item) => item.id === resolvedScenarioId)
    || safeArray(library.types)[0]
    || null;
  const link = safeArray(workspace.landingLinks).find((item) => item.landingId === landing?.id && item.language === language?.id) || null;
  return {
    workspace,
    library,
    language,
    landing,
    link,
    languageName: language?.nativeLabel || language?.label || 'Русский',
    landingTitle: getLocalizedCopy(landing?.titles, language?.id, landing?.title || 'Лендинг'),
    landingLabel: getLocalizedCopy(landing?.labels, language?.id, landing?.id || 'landing'),
  };
}

function getMediaKindLabel(kind = '') {
  const value = String(kind || '').trim().toLowerCase();
  const labels = {
    pack: 'Пакет',
    bundle: 'Стартовый набор',
    message: 'Сообщение',
    asset: 'Визуал',
    link: 'Ссылка',
    product: 'Продукт',
  };
  return labels[value] || value || 'Материал';
}

function getMediaCenterProductOptions() {
  const mediaCenter = getMediaCenter();
  const productIds = new Set();
  safeArray(mediaCenter?.packs).forEach((pack) => {
    safeArray(pack.productIds).forEach((id) => {
      if (id) productIds.add(id);
    });
  });
  getManagedMediaEntries().forEach((entry) => {
    safeArray(entry.productIds).forEach((id) => {
      if (id) productIds.add(id);
    });
  });
  return Array.from(productIds)
    .map((id) => getProductById(id))
    .filter(Boolean)
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
}

function getManagedMediaEntries() {
  return safeArray(state.mediaLibraryItems)
    .filter((item) => item && item.id && item.status !== 'deleted');
}

function getManagedMediaEntryById(entryId) {
  const normalizedId = Number(entryId || 0);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;
  return getManagedMediaEntries().find((item) => Number(item.id || 0) === normalizedId) || null;
}

function setMediaLibraryEditor(entryId = null) {
  const normalizedId = Number(entryId || 0);
  state.mediaLibraryEditorId = Number.isFinite(normalizedId) && normalizedId > 0 ? normalizedId : null;
  renderMediaCenterPanel();
}

function buildMediaCenterItems() {
  const mediaCenter = getMediaCenter();
  const contentHub = safeArray(state.site?.contentHub);
  const workingLanguageId = state.landingPreferences.language || getLandingLibrary()?.defaultLanguage || 'ru';
  const items = [];

  safeArray(mediaCenter?.packs).forEach((pack) => {
    const context = getMediaCenterContext(pack.landingId, workingLanguageId);
    if (!context) return;
    const packProducts = safeArray(pack.productIds).map((id) => getProductById(id)).filter(Boolean);
    const packContentItems = safeArray(pack.contentIds).map((id) => getContentHubItemById(id)).filter(Boolean);
    const packCoverAsset = getPackCoverAsset(pack);
    const companyUrl = context.workspace?.companyCatalogLink || context.workspace?.companyReferralLink || mediaCenter?.defaultCompanyUrl || state.site?.links?.companyCatalog || state.site?.links?.companyMain || '';
    const shortLink = findShortLinkForUrl(context.link?.url || context.workspace?.siteReferralLink || '');
    const messageItems = safeArray(pack.messages).map((entry) => {
      const text = fillPromoTemplate(entry.template, {
        landingUrl: context.link?.url || context.workspace?.siteReferralLink || '',
        landingTitle: context.landingTitle,
        landingLabel: context.landingLabel,
        languageName: context.languageName,
        companyUrl,
      });
      return {
        ...entry,
        text,
      };
    });
    const launchBundleText = buildLaunchBundleText(pack, {
      landingTitle: context.landingTitle,
      languageName: context.languageName,
      landingUrl: context.link?.url || context.workspace?.siteReferralLink || '',
      shortUrl: shortLink?.shortUrl || '',
      companyUrl,
      referralCode: context.workspace?.referralCode || '',
      products: packProducts,
      contentItems: packContentItems,
      messages: messageItems,
    });

    items.push({
      id: `pack-${pack.id}`,
      kind: 'pack',
      scenarioId: pack.landingId,
      languageId: context.language?.id || workingLanguageId,
      productIds: safeArray(pack.productIds),
      title: pack.title || 'Пакет',
      summary: pack.summary || pack.objective || '',
      imageUrl: packCoverAsset?.imageUrl || packContentItems[0]?.imageUrl || getProductImage(packProducts[0]),
      chips: safeArray(pack.hooks).slice(0, 4),
      searchText: [pack.title, pack.summary, pack.objective, safeArray(pack.launchSteps).join(' '), safeArray(pack.hooks).join(' ')].filter(Boolean).join(' '),
    });

    items.push({
      id: `bundle-${pack.id}`,
      kind: 'bundle',
      scenarioId: pack.landingId,
      languageId: context.language?.id || workingLanguageId,
      productIds: safeArray(pack.productIds),
      title: `Стартовый набор · ${pack.title || context.landingTitle}`,
      summary: 'Готовый комплект для копирования и передачи партнёру или клиенту.',
      text: launchBundleText,
      imageUrl: packCoverAsset?.imageUrl || packContentItems[0]?.imageUrl || getProductImage(packProducts[0]),
      chips: safeArray(mediaCenter?.launchBundleSchema).slice(0, 5),
      searchText: [pack.title, launchBundleText].filter(Boolean).join(' '),
    });

    messageItems.forEach((message, index) => {
      items.push({
        id: `message-${pack.id}-${message.id || index + 1}`,
        kind: 'message',
        scenarioId: pack.landingId,
        languageId: context.language?.id || workingLanguageId,
        productIds: safeArray(pack.productIds),
        title: message.title || 'Сообщение',
        summary: message.text || '',
        text: message.text || '',
        channel: message.channel || 'message',
        chips: [context.landingTitle, context.languageName, message.channel || 'message'],
        searchText: [pack.title, message.title, message.text].filter(Boolean).join(' '),
      });
    });

    safeArray(pack.visualAssets).forEach((asset, index) => {
      items.push({
        id: `asset-${pack.id}-${asset.id || index + 1}`,
        kind: 'asset',
        scenarioId: pack.landingId,
        languageId: context.language?.id || workingLanguageId,
        productIds: safeArray(pack.productIds),
        title: asset.title || 'Визуал',
        summary: asset.note || asset.description || '',
        imageUrl: asset.imageUrl || '',
        purpose: asset.purpose || 'asset',
        chips: [context.landingTitle, asset.purpose || 'asset'],
        searchText: [pack.title, asset.title, asset.note, asset.description].filter(Boolean).join(' '),
      });
    });

    packProducts.forEach((product) => {
      items.push({
        id: `product-${pack.id}-${product.id}`,
        kind: 'product',
        scenarioId: pack.landingId,
        languageId: context.language?.id || workingLanguageId,
        productIds: [product.id],
        title: product.title || 'Продукт',
        summary: product.shortDescription || product.story || '',
        imageUrl: getProductImage(product),
        product,
        chips: safeArray(product.useCases).slice(0, 3),
        searchText: [pack.title, product.title, product.shortDescription, product.story, safeArray(product.useCases).join(' ')].filter(Boolean).join(' '),
      });
    });

    packContentItems.forEach((entry) => {
      items.push({
        id: `link-${pack.id}-${entry.id}`,
        kind: 'link',
        scenarioId: pack.landingId,
        languageId: context.language?.id || workingLanguageId,
        productIds: safeArray(pack.productIds),
        title: entry.title || 'Материал',
        summary: entry.description || '',
        url: entry.url || '',
        imageUrl: entry.imageUrl || '',
        chips: [entry.type || 'link', context.landingTitle],
        searchText: [pack.title, entry.title, entry.description].filter(Boolean).join(' '),
      });
    });
  });

  safeArray(mediaCenter?.brandAssets).forEach((asset, index) => {
    items.push({
      id: `brand-asset-${asset.id || index + 1}`,
      kind: 'asset',
      scenarioId: 'all',
      languageId: workingLanguageId,
      productIds: [],
      title: asset.title || 'Брендовый визуал',
      summary: asset.description || '',
      imageUrl: asset.imageUrl || '',
      purpose: asset.purpose || 'brand',
      chips: ['Бренд', asset.purpose || 'brand'],
      searchText: [asset.title, asset.description, asset.purpose].filter(Boolean).join(' '),
    });
  });

  contentHub.forEach((entry) => {
    items.push({
      id: `hub-${entry.id}`,
      kind: 'link',
      scenarioId: 'all',
      languageId: workingLanguageId,
      productIds: [],
      title: entry.title || 'Ссылка',
      summary: entry.description || '',
      url: entry.url || '',
      imageUrl: entry.imageUrl || '',
      chips: ['Content Hub', entry.type || 'link'],
      searchText: [entry.title, entry.description, entry.type].filter(Boolean).join(' '),
    });
  });

  getManagedMediaEntries().forEach((entry) => {
    const contextScenarioId = entry.scenarioId === 'all'
      ? (state.landingPreferences.landingId || 'health')
      : entry.scenarioId;
    const contextLanguageId = entry.languageId === 'all'
      ? workingLanguageId
      : (entry.languageId || workingLanguageId);
    const context = getMediaCenterContext(contextScenarioId, contextLanguageId);
    items.push({
      id: `custom-${entry.id}`,
      sourceId: entry.id,
      source: 'custom',
      kind: entry.kind || 'message',
      scenarioId: entry.scenarioId || 'all',
      languageId: entry.languageId || 'all',
      productIds: safeArray(entry.productIds),
      title: entry.title || 'Custom entry',
      summary: entry.summary || entry.text || '',
      text: entry.text || '',
      url: entry.url || '',
      imageUrl: entry.imageUrl || '',
      channel: entry.channel || '',
      entry,
      chips: ['Custom', ...(safeArray(entry.tags).slice(0, 4)), context?.landingTitle || ''],
      searchText: [
        entry.title,
        entry.summary,
        entry.text,
        entry.url,
        entry.imageUrl,
        safeArray(entry.tags).join(' '),
        safeArray(entry.productIds).join(' '),
      ].filter(Boolean).join(' '),
    });
  });

  return items;
}

function getFilteredMediaCenterItems() {
  const filters = state.mediaCenterFilters || {};
  const query = String(filters.query || '').trim().toLowerCase();
  const currentLanguageId = state.landingPreferences.language || getLandingLibrary()?.defaultLanguage || 'ru';
  return buildMediaCenterItems().filter((item) => {
    const matchesScenario = filters.scenario === 'all' || item.scenarioId === 'all' || item.scenarioId === filters.scenario;
    const matchesKind = filters.kind === 'all' || item.kind === filters.kind;
    const matchesProduct = filters.productId === 'all' || safeArray(item.productIds).includes(filters.productId);
    const matchesLanguage = !item.languageId || item.languageId === 'all' || item.languageId === currentLanguageId;
    const matchesQuery = !query || String(item.searchText || '').toLowerCase().includes(query);
    return matchesScenario && matchesKind && matchesProduct && matchesLanguage && matchesQuery;
  });
}

function setMediaCenterFilters(next = {}) {
  state.mediaCenterFilters = {
    ...state.mediaCenterFilters,
    ...next,
  };
  renderMediaCenterPanel();
}

function setFaqFilters(nextFilters = {}) {
  state.faqFilters = {
    ...state.faqFilters,
    ...nextFilters,
  };
  renderFaqPanel();
}

function setLearningTrack(trackId = '') {
  state.learningPreferences.trackId = String(trackId || '').trim();
  renderLearningPanel();
}

async function createTaskFromTemplate(templateId) {
  if (!requireUser('tasks')) return;
  const template = buildTaskTemplates().find((item) => item.id === templateId);
  if (!template) return;
  if (template.exists) {
    activatePanel('tasks');
    scrollToId('dashboard');
    setStatus($('#task-status'), 'Этот шаблон уже добавлен в ваши задачи.');
    return;
  }
  setStatus($('#task-status'), 'Добавляем шаблон в задачи...');
  await api('/cabinet/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: template.title,
      description: template.description,
      category: template.category,
      priority: template.priority,
      dueAt: template.dueAt,
      source: 'template',
      tags: template.tags,
      notes: `template:${template.id}`,
    }),
  });
  await trackMarketingEvent('task_template_create', {
    panel: 'tasks',
    ctaId: template.id,
    ctaLabel: template.title,
  });
  setStatus($('#task-status'), 'Шаблон добавлен. Можно доработать его вручную ниже.');
  await loadDashboard();
  activatePanel('tasks');
}

function runAutomationAction(actionId) {
  const { link, landingTitle, languageName, landing, language } = getCurrentLandingWorkspace();
  if (actionId === 'tool-short') {
    prefillLandingTool('short', link?.url || '', landingTitle);
    return;
  }
  if (actionId === 'tool-qr') {
    prefillLandingTool('qr', link?.url || '', landingTitle);
    return;
  }
  if (actionId === 'tool-caption') {
    if (!requireUser('tools')) return;
    activatePanel('tools');
    scrollToId('dashboard');
    const topicInput = document.querySelector('#caption-form [name="topic"]');
    const platformSelect = document.querySelector('#caption-form [name="platform"]');
    if (topicInput) topicInput.value = `${landingTitle} • ${languageName}`;
    if (platformSelect && !platformSelect.value) platformSelect.value = 'telegram';
    topicInput?.focus();
    return;
  }
  if (actionId === 'open-materials') {
    setLandingPreferences({
      landingId: landing?.id,
      language: language?.id,
    });
    activatePanel('materials');
    scrollToId('dashboard');
    return;
  }
  if (actionId === 'open-learning') {
    activatePanel('learning');
    scrollToId('dashboard');
    return;
  }
  if (actionId === 'open-links') {
    activatePanel('links');
    scrollToId('dashboard');
    return;
  }
  if (actionId === 'open-media') {
    setLandingPreferences({
      landingId: landing?.id,
      language: language?.id,
    });
    activatePanel('media');
    scrollToId('dashboard');
  }
}

function getLocalizedCopy(copyMap, languageId, fallback = '') {
  if (typeof copyMap === 'string') return copyMap;
  if (!copyMap || typeof copyMap !== 'object') return fallback;
  return copyMap[languageId] || copyMap.en || copyMap.ru || fallback;
}

function getLocalizedListValue(item, languageId, fallback = '') {
  if (typeof item === 'string') return item;
  return getLocalizedCopy(item, languageId, fallback);
}

function legacyGetLandingPanelCopy(languageId = 'ru') {
  if (languageId === 'ru') {
    return {
      landingLanguages: 'Язык лендингов',
      defaultLabel: 'По умолчанию',
      scenariosLabel: 'Сценариев',
      currentLanguage: 'Текущий язык',
      copyLink: 'Копировать ссылку',
      open: 'Открыть',
      materials: 'Материалы',
      currentScenario: 'Текущий сценарий',
      language: 'Язык',
      audience: 'Аудитория',
      focus: 'Фокус',
      howToUse: 'Как использовать связку',
      recommendation: 'Рекомендация',
      promoBundle: 'Рекламная связка',
      landing: 'Лендинг',
      linkReady: 'Ссылка готова',
      yes: 'да',
      no: 'нет',
      launchKit: 'Стартовый набор',
      copyText: 'Копировать текст',
      shortenLink: 'Сократить ссылку',
      packIdeas: 'Что добавить в пакет',
      workingBundle: 'Рабочая связка',
      workingBundleText: 'Сначала даём страницу, затем сообщение, затем короткую ссылку или QR и только после интереса переводим человека в официальный контур компании.',
    };
  }
  return {
    landingLanguages: 'Landing language',
    defaultLabel: 'Default',
    scenariosLabel: 'Scenarios',
    currentLanguage: 'Current language',
    copyLink: 'Copy link',
    open: 'Open',
    materials: 'Materials',
    currentScenario: 'Current scenario',
    language: 'Language',
    audience: 'Audience',
    focus: 'Focus',
    howToUse: 'How to use this setup',
    recommendation: 'Recommendation',
    promoBundle: 'Promotion bundle',
    landing: 'Landing',
    linkReady: 'Link ready',
    yes: 'yes',
    no: 'no',
    launchKit: 'Launch kit',
    copyText: 'Copy text',
    shortenLink: 'Shorten link',
    packIdeas: 'What to add to the pack',
    workingBundle: 'Working bundle',
    workingBundleText: 'Start with the page, then the message, then a short link or QR, and only after interest move the person into the official company flow.',
  };
}

const LANDING_BULLET_COPY = {
  health: [
    'Product value and practical health directions.',
    'Trust, expertise and a soft first contact.',
    'Best fit for cold and warm audiences.',
  ],
  business: [
    'Partner logic and structure growth.',
    'Ready-made tools and materials for launch.',
    'Best fit for warm traffic and future partners.',
  ],
  hybrid: [
    'Product value combined with the partner system.',
    'Best for mixed audiences: client and partner.',
    'Works best after the first trust touchpoint.',
  ],
};

const LANDING_GUIDANCE_COPY = [
  'Start from Russian by default, then scale the setup into other languages.',
  'For cold traffic the health scenario usually performs first.',
  'For partner recruitment and future leaders, the business scenario works better.',
  'For warm mixed audiences use the health + business + success scenario.',
  'For every language and source create a dedicated UTM, short link and QR.',
];

const PROMO_BUNDLE_COPY = {
  health: {
    title: 'Health Promotion Pack',
    description: 'Materials for a soft entry through product value, health interest and trust.',
    launchKit: [
      'A short invitation message for Telegram or WhatsApp.',
      'The health landing in the target language.',
      'QR and short link for the current traffic source.',
      'A gentle objection reply with a soft CTA.',
    ],
  },
  business: {
    title: 'Business Promotion Pack',
    description: 'Materials for people interested in the partner system, duplication and a faster start.',
    launchKit: [
      'Business landing with a personal referral link.',
      'A message about the system, tools and duplication.',
      'Short link and QR for the traffic channel.',
      'CTA into the workspace and system walkthrough.',
    ],
  },
  hybrid: {
    title: 'Health + Business + Success Pack',
    description: 'Materials for a mixed audience that values both products and growth opportunity.',
    launchKit: [
      'Hybrid landing with product value and growth narrative.',
      'A message for the "client + future partner" audience.',
      'Content with a success, benefit and system angle.',
      'A soft transition from the page into the official company flow.',
    ],
  },
};

const PROMO_ITEM_COPY = {
  'health-message': {
    title: 'First contact message',
    template: 'I put together a clear Golden Connect page about health, products and natural support. You can look through it calmly without pressure: {{landingUrl}}',
  },
  'health-post': {
    title: 'Feed / channel post',
    template: 'If you are interested in natural solutions for health, water, immunity and everyday support, I put together a simple Golden Connect entry page. Here it is: {{landingUrl}}',
  },
  'health-story': {
    title: 'Stories / short hook',
    template: 'Health, natural products and a clear path without overload. See it here: {{landingUrl}}',
  },
  'health-objection': {
    title: 'Objection reply',
    template: 'You do not need to understand everything at once. The page already gathers the main directions, products and a clear first step. Here is the link: {{landingUrl}}',
  },
  'business-message': {
    title: 'System message',
    template: 'If you want to see a system where the landings, materials, AI and partner tools are already prepared, here is my page: {{landingUrl}}',
  },
  'business-post': {
    title: 'Partner launch post',
    template: 'We built a working system where a partner does not start from zero: links, materials, AI, training and duplication are already inside. My entry point: {{landingUrl}}',
  },
  'business-video': {
    title: 'Reels / Shorts hook',
    template: 'Show how in 30 seconds a partner gets a link, a landing, AI support and ready-made materials. End with this CTA: {{landingUrl}}',
  },
  'business-objection': {
    title: 'Reply to "I have no experience"',
    template: 'That is exactly why the workspace exists: the steps, texts, landings and materials are already prepared there. First, look at the system here: {{landingUrl}}',
  },
  'hybrid-message': {
    title: 'Benefit + growth message',
    template: 'This is not only about products and not only about partnership. It is a clear entry where you can see value, system and growth in one place. Link: {{landingUrl}}',
  },
  'hybrid-post': {
    title: 'Health and success post',
    template: 'When one project combines health, a clear system and a growth path, people make decisions more easily. I gathered it in one page: {{landingUrl}}',
  },
  'hybrid-story': {
    title: 'Stories / success angle',
    template: 'Health. System. Growth. Success. If you want to look through it calmly and step by step, here is the page: {{landingUrl}}',
  },
  'hybrid-followup': {
    title: 'Follow-up after interest',
    template: 'First you go through the page and see how everything works. If it resonates, I will send the official company entry through my referral link: {{companyReferralLink}}',
  },
};

const ASSET_IDEA_COPY = [
  'Banners for Telegram, VK, Instagram, WhatsApp and email.',
  'Short PDF presentations and one-page handouts.',
  'Product cards and usage scenario cards.',
  'Before/after visuals, cases and testimonials.',
  'Cover images and OG visuals for landings.',
  'Vertical hooks and short-form video ideas.',
  'Localized texts by language and landing type.',
];

function getLocalizedLandingBullet(landingId, index, languageId, fallback = '') {
  if (languageId === 'ru') return fallback;
  return LANDING_BULLET_COPY[landingId]?.[index] || fallback;
}

function getLocalizedGuidanceItem(index, languageId, fallback = '') {
  if (languageId === 'ru') return fallback;
  return LANDING_GUIDANCE_COPY[index] || fallback;
}

function getLocalizedPromoBundle(bundleId, languageId) {
  if (languageId === 'ru') return null;
  return PROMO_BUNDLE_COPY[bundleId] || null;
}

function getLocalizedPromoItem(itemId, languageId) {
  if (languageId === 'ru') return null;
  return PROMO_ITEM_COPY[itemId] || null;
}

function getLocalizedAssetIdea(index, languageId, fallback = '') {
  if (languageId === 'ru') return fallback;
  return ASSET_IDEA_COPY[index] || fallback;
}

function ensureLandingPreferences(library = getLandingLibrary()) {
  if (!library) return null;
  const languages = safeArray(library.languages);
  const types = safeArray(library.types);
  if (!languages.length || !types.length) return null;

  const currentLanguage = languages.find((item) => item.id === state.landingPreferences.language)
    ? state.landingPreferences.language
    : (library.defaultLanguage || languages[0].id);
  const currentLandingId = types.find((item) => item.id === state.landingPreferences.landingId)
    ? state.landingPreferences.landingId
    : types[0].id;

  state.landingPreferences.language = currentLanguage;
  state.landingPreferences.landingId = currentLandingId;

  return {
    language: currentLanguage,
    landingId: currentLandingId,
  };
}

function getLandingUiState() {
  const library = getLandingLibrary();
  const workspace = getWorkspace();
  if (!library || !workspace) return null;
  ensureLandingPreferences(library);
  const language = safeArray(library.languages).find((item) => item.id === state.landingPreferences.language)
    || safeArray(library.languages)[0]
    || null;
  const landing = safeArray(library.types).find((item) => item.id === state.landingPreferences.landingId)
    || safeArray(library.types)[0]
    || null;
  const link = safeArray(workspace.landingLinks).find((item) => item.landingId === landing?.id && item.language === language?.id) || null;
  return {
    library,
    workspace,
    language,
    landing,
    link,
  };
}

function setLandingPreferences(next = {}) {
  if (next.language) state.landingPreferences.language = String(next.language).trim().toLowerCase();
  if (next.landingId) state.landingPreferences.landingId = String(next.landingId).trim();
  renderLandingsPanel();
  renderMaterialsPanel();
  renderMediaCenterPanel();
  renderToolsPanel();
}

function prefillUrlTool(kind, url, title = '') {
  const safeUrl = String(url || '').trim();
  if (!safeUrl) return;
  if (kind === 'short') {
    setActiveToolView('shortener', { render: state.activePanel === 'tools' });
    const form = $('#shortener-form');
    if (form) {
      if (form.elements.url) form.elements.url.value = safeUrl;
      if (form.elements.title) form.elements.title.value = title || 'Landing';
    }
    activatePanel('tools');
    renderToolsPanel();
    scrollToId('dashboard');
    return;
  }
  if (kind === 'qr') {
    setActiveToolView('qr', { render: state.activePanel === 'tools' });
    const form = $('#qr-form');
    if (form && form.elements.url) form.elements.url.value = safeUrl;
    activatePanel('tools');
    renderToolsPanel();
    scrollToId('dashboard');
  }
}

function prefillLandingTool(kind, url, title = '') {
  prefillUrlTool(kind, url, title);
}

function getToolContextDefaults() {
  const landingUi = getCurrentLandingWorkspace();
  const workspace = getWorkspace() || {};
  const url = String(landingUi.link?.url || workspace.siteReferralLink || '').trim();
  return {
    url,
    title: landingUi.landingTitle || 'Landing',
    languageName: landingUi.languageName || 'Русский',
    landingId: landingUi.landing?.id || 'health',
    referralCode: workspace.referralCode || '',
  };
}

function buildToolContextForLanding(landingId = '', languageId = '') {
  return getMediaCenterContext(
    landingId || state.landingPreferences.landingId || 'health',
    languageId || state.landingPreferences.language || 'ru',
  ) || getToolContextDefaults();
}

function getDefaultUtmDraft(context = getToolContextDefaults()) {
  const landingId = String(context.landingId || state.landingPreferences.landingId || 'health').trim();
  const languageId = String(context.languageId || state.landingPreferences.language || 'ru').trim().toLowerCase();
  return {
    baseUrl: String(context.url || getWorkspace()?.siteReferralLink || '').trim(),
    source: 'partner',
    medium: 'referral',
    campaign: sanitizeToolSlug(`${landingId}-${languageId}-launch`, `${landingId}-${languageId}`),
    content: landingId || 'landing',
    term: languageId || 'ru',
  };
}

function buildUtmBuilderResult(options = {}) {
  const context = options.context || getToolContextDefaults();
  const baseUrl = String(options.baseUrl || '').trim();
  if (!baseUrl) throw new Error('url_required');
  const fields = {
    utm_source: String(options.source || '').trim(),
    utm_medium: String(options.medium || '').trim(),
    utm_campaign: String(options.campaign || '').trim(),
    utm_content: String(options.content || '').trim(),
    utm_term: String(options.term || '').trim(),
  };
  const finalUrl = appendUrlParams(baseUrl, fields);
  const title = String(options.title || context.title || 'Tracked link').trim();
  const shortLink = findShortLinkForUrl(finalUrl) || null;
  return {
    presetId: String(options.presetId || '').trim(),
    title,
    baseUrl,
    finalUrl,
    fields,
    shortLink,
    shareLinks: ['telegram', 'whatsapp', 'email', 'vk'].map((channel) => ({
      channel,
      label: getShareChannelLabel(channel),
      url: buildChannelShareLink(channel, finalUrl, `${title} ${finalUrl}`.trim(), title),
    })),
  };
}

function getPreferredToolUrl(context = getToolContextDefaults()) {
  return String(state.toolResults.utmBuilder?.finalUrl || context.url || getWorkspace()?.siteReferralLink || '').trim();
}

function buildCaptionPublishingPack(item = {}, options = {}) {
  const context = options.context || getToolContextDefaults();
  const trackedUrl = String(options.url || getPreferredToolUrl(context)).trim();
  const hashtags = safeArray(options.hashtags).slice(0, 12).join(' ');
  const cta = String(options.cta || '').trim();
  const caption = String(item.caption || '').trim();
  const shortText = truncateText(caption, 150);
  const ctaLine = cta || `Открой ${context.title || 'страницу'} и посмотри детали.`;
  return [
    {
      id: 'post',
      title: 'Пост с ссылкой',
      text: [caption, hashtags, trackedUrl].filter(Boolean).join('\n\n'),
    },
    {
      id: 'dm',
      title: 'Личное сообщение',
      text: [caption, ctaLine, trackedUrl].filter(Boolean).join('\n\n'),
    },
    {
      id: 'story',
      title: 'Stories / короткая подача',
      text: [shortText, ctaLine, trackedUrl].filter(Boolean).join('\n'),
    },
  ];
}

const TOOL_VIEW_ALIASES = {
  overview: 'overview',
  home: 'overview',
  tools: 'overview',
  short: 'shortener',
  shortener: 'shortener',
  qr: 'qr',
  hashtags: 'hashtags',
  caption: 'caption',
  'ai-text': 'caption',
  'bio-hub': 'bio-hub',
  biohub: 'bio-hub',
  'social-kit': 'social-kit',
  social: 'social-kit',
  'image-studio': 'image-studio',
  image: 'image-studio',
  'remove-bg': 'remove-bg',
  removebg: 'remove-bg',
  'og-image': 'og-image',
  og: 'og-image',
  'banner-studio': 'banner-studio',
  banner: 'banner-studio',
  'pdf-kit': 'pdf-kit',
  pdf: 'pdf-kit',
  utm: 'utm-builder',
  'utm-builder': 'utm-builder',
  advanced: 'advanced',
  bridge: 'advanced',
  'pdf-advanced': 'pdf-advanced',
  pdfadvanced: 'pdf-advanced',
  video: 'video',
  'video-tools': 'video',
};

const TOOL_FORM_VIEW_MAP = {
  'shortener-form': 'shortener',
  'utm-builder-form': 'utm-builder',
  'qr-form': 'qr',
  'hashtags-form': 'hashtags',
  'caption-form': 'caption',
  'bio-hub-form': 'bio-hub',
  'social-kit-form': 'social-kit',
  'image-studio-form': 'image-studio',
  'remove-bg-form': 'remove-bg',
  'og-generator-form': 'og-image',
  'banner-studio-form': 'banner-studio',
  'pdf-kit-form': 'pdf-kit',
};

const TOOL_GROUP_META = {
  start: 'Старт',
  traffic: 'Ссылки и трафик',
  ai: 'AI и тексты',
  visuals: 'Дизайн и медиа',
  pro: 'Arsenal Pro',
};

function normalizeToolView(view = 'overview') {
  const normalized = String(view || '').trim().toLowerCase();
  return TOOL_VIEW_ALIASES[normalized] || 'overview';
}

function getActiveToolView() {
  return normalizeToolView(state.toolsPreferences?.activeTool || 'overview');
}

function getToolViewForFormId(formId = '') {
  return TOOL_FORM_VIEW_MAP[String(formId || '').trim()] || null;
}

function getToolCatalog() {
  const arsenal = getArsenalSuite() || {};
  const nativeTools = new Map(safeArray(arsenal.nativeTools).map((item) => [item.id, item]));
  const bridgeTools = safeArray(arsenal.bridgeTools);
  const bridgeToolMap = new Map(bridgeTools.map((item) => [item.id, item]));
  return [
    {
      id: 'overview',
      group: 'start',
      source: 'workspace',
      title: 'Панель инструментов',
      description: 'Единый рабочий центр: запуск ссылок, AI-контент, визуалы, баннеры и lead-kit в отдельных экранах.',
      bullets: ['Отдельный экран под каждый инструмент', 'Контекст текущего лендинга и языка', 'Быстрые переходы между связанными шагами'],
      actionLabel: 'Открыть панель',
      related: ['shortener', 'qr', 'caption'],
    },
    {
      id: 'utm-builder',
      group: 'traffic',
      source: 'native',
      formId: 'utm-builder-form',
      title: 'UTM Builder',
      description: 'Сбор tracked links под кампании, каналы и языки с быстрым переходом в shortener и QR.',
      bullets: ['UTM под текущий landing или campaign preset', 'Готовый tracked link для рекламы и рассылок', 'Сразу можно передать в shortener, QR или PDF kit'],
      related: ['shortener', 'qr', 'pdf-kit'],
    },
    {
      id: 'shortener',
      group: 'traffic',
      source: 'native',
      formId: 'shortener-form',
      title: nativeTools.get('shortener')?.title || 'Сократитель ссылок',
      description: nativeTools.get('shortener')?.description || 'Создание коротких ссылок под лендинги и кампании.',
      bullets: ['Личная ссылка под каждый сценарий', 'Title и slug под кампанию', 'Сразу доступно в материалах и медиацентре'],
      related: ['qr', 'caption', 'pdf-kit'],
    },
    {
      id: 'qr',
      group: 'traffic',
      source: 'native',
      formId: 'qr-form',
      title: nativeTools.get('qr')?.title || 'QR-коды',
      description: nativeTools.get('qr')?.description || 'Генерация QR под ваши реферальные ссылки и материалы.',
      bullets: ['Быстрый QR под текущий landing', 'Размер под мессенджер или экран', 'Сразу скачивание PNG'],
      related: ['shortener', 'pdf-kit', 'bio-hub'],
    },
    {
      id: 'hashtags',
      group: 'ai',
      source: 'native',
      formId: 'hashtags-form',
      title: nativeTools.get('hashtags')?.title || 'Хештеги',
      description: nativeTools.get('hashtags')?.description || 'Подбор хештегов и тематических наборов.',
      bullets: ['Под площадку и язык', 'Контекст под текущий сценарий', 'Быстрое копирование итогового набора'],
      related: ['caption', 'shortener'],
    },
    {
      id: 'caption',
      group: 'ai',
      source: 'native',
      formId: 'caption-form',
      title: nativeTools.get('caption')?.title || 'AI-тексты',
      description: nativeTools.get('caption')?.description || 'Черновики caption и текстов для постов.',
      bullets: ['Тон и площадка', 'Контекст под ваш landing', 'Быстрый переход в материалы'],
      related: ['hashtags', 'banner-studio', 'pdf-kit'],
    },
    {
      id: 'bio-hub',
      group: 'traffic',
      source: 'native',
      formId: 'bio-hub-form',
      title: nativeTools.get('bio-hub')?.title || 'Bio Hub',
      description: nativeTools.get('bio-hub')?.description || 'Персональная мультиссылка на вашем домене.',
      bullets: ['Один вход вместо россыпи ссылок', 'Лендинг, кабинет и компания в одном URL', 'Хорошо работает для bio и short-video'],
      related: ['qr', 'shortener', 'advanced'],
    },
    {
      id: 'social-kit',
      group: 'visuals',
      source: 'native',
      formId: 'social-kit-form',
      title: nativeTools.get('social-kit')?.title || 'Social Media Kit',
      description: nativeTools.get('social-kit')?.description || 'Авто-ресайз одного изображения под основные соцсети.',
      bullets: ['Набор размеров одним действием', 'Подготовка под Instagram, Facebook, X, LinkedIn', 'Подходит для баннеров и постов'],
      related: ['image-studio', 'remove-bg', 'banner-studio'],
    },
    {
      id: 'image-studio',
      group: 'visuals',
      source: 'native',
      formId: 'image-studio-form',
      title: nativeTools.get('image-studio')?.title || 'Image Studio',
      description: nativeTools.get('image-studio')?.description || 'Локальная конвертация и ресайз картинок.',
      bullets: ['Размер и формат под задачу', 'Полезно для лендов, карточек и баннеров', 'Работает без выхода во внешний сервис'],
      related: ['social-kit', 'remove-bg', 'og-image'],
    },
    {
      id: 'remove-bg',
      group: 'visuals',
      source: 'native',
      formId: 'remove-bg-form',
      title: nativeTools.get('remove-bg')?.title || 'Remove Background',
      description: nativeTools.get('remove-bg')?.description || 'Удаление фона с продуктовых и рекламных изображений.',
      bullets: ['Быстрая вырезка PNG', 'Хорошо для продуктовых и promo-визуалов', 'Сразу можно использовать в OG и баннерах'],
      related: ['image-studio', 'social-kit', 'banner-studio'],
    },
    {
      id: 'og-image',
      group: 'visuals',
      source: 'native',
      formId: 'og-generator-form',
      title: nativeTools.get('og-image')?.title || 'OG Image',
      description: nativeTools.get('og-image')?.description || 'Генерация обложек и превью для ссылок и лендингов.',
      bullets: ['Готовая social preview-обложка', 'Разные стили подачи', 'Подходит для ссылок, постов и PDF-kit'],
      related: ['banner-studio', 'pdf-kit', 'social-kit'],
    },
    {
      id: 'banner-studio',
      group: 'visuals',
      source: 'native',
      formId: 'banner-studio-form',
      title: nativeTools.get('banner-studio')?.title || 'Banner Studio',
      description: nativeTools.get('banner-studio')?.description || 'Рекламные баннеры под разные размеры и сценарии.',
      bullets: ['Несколько размеров за один запуск', 'HTML и PNG версия', 'Стилистика ближе к Arsenal Studio'],
      related: ['og-image', 'social-kit', 'advanced'],
    },
    {
      id: 'pdf-kit',
      group: 'traffic',
      source: 'native',
      formId: 'pdf-kit-form',
      title: nativeTools.get('pdf-kit')?.title || 'PDF Lead Kit',
      description: nativeTools.get('pdf-kit')?.description || 'Short link, QR и OG-обложка в одном наборе.',
      bullets: ['Набор для PDF и promo-страниц', 'Short link + QR + OG', 'Готово для пересылки лидy'],
      related: ['shortener', 'qr', 'og-image'],
    },
    {
      id: 'advanced',
      group: 'pro',
      source: 'bridge',
      title: 'Arsenal Pro',
      description: arsenal.intro || 'Продвинутые Arsenal-задачи остаются отдельным pro-режимом.',
      bullets: ['Когда нужен тяжелый PDF workflow', 'Когда нужен motion / video', 'Открывается во внешнем Arsenal Pro'],
      related: ['pdf-advanced', 'video', 'banner-studio'],
      bridgeTools,
    },
    {
      id: 'pdf-advanced',
      group: 'pro',
      source: 'bridge',
      title: bridgeToolMap.get('pdf-advanced')?.title || 'Advanced PDF Tools',
      description: bridgeToolMap.get('pdf-advanced')?.description || 'Продвинутый внешний PDF workflow Arsenal.',
      bullets: ['Слияние, разбивка и heavy PDF workflow', 'Подходит для сложных презентаций и lead-kit', 'Открывается в Arsenal Pro отдельной страницей'],
      related: ['pdf-kit', 'shortener', 'qr'],
      bridgeTool: bridgeToolMap.get('pdf-advanced') || null,
    },
    {
      id: 'video',
      group: 'pro',
      source: 'bridge',
      title: bridgeToolMap.get('video')?.title || 'Video Tools',
      description: bridgeToolMap.get('video')?.description || 'Продвинутые video и motion-инструменты Arsenal.',
      bullets: ['Видео-баннеры и motion-подача', 'Подходит для reels, shorts и promo-видео', 'Открывается в Arsenal Pro отдельной страницей'],
      related: ['banner-studio', 'social-kit', 'bio-hub'],
      bridgeTool: bridgeToolMap.get('video') || null,
    },
  ];
}

function getToolViewDefinition(view = getActiveToolView()) {
  const catalog = getToolCatalog();
  return catalog.find((item) => item.id === normalizeToolView(view)) || catalog[0] || null;
}

function setActiveToolView(view = 'overview', options = {}) {
  state.toolsPreferences.activeTool = normalizeToolView(view);
  if (options.render !== false && state.activePanel === 'tools') {
    renderToolsPanel();
  }
}

function getToolSummaryText(toolId = '') {
  switch (toolId) {
    case 'shortener':
      return state.shortLinks.length ? `${formatNumber(state.shortLinks.length)} short link` : 'ещё не запускался';
    case 'utm-builder':
      return state.toolResults.utmBuilder?.finalUrl ? 'tracked link готов' : 'ждёт сборки';
    case 'qr':
      return state.toolResults.qr?.dataUrl ? 'QR готов' : 'ждёт генерации';
    case 'hashtags':
      return state.toolResults.hashtags.length ? `${formatNumber(state.toolResults.hashtags.length)} тегов` : 'нет подборки';
    case 'caption':
      return state.toolResults.captions.length ? `${formatNumber(state.toolResults.captions.length)} текстов` : 'нет черновиков';
    case 'bio-hub':
      return state.toolResults.bioHub?.url ? 'hub собран' : 'не собран';
    case 'social-kit':
      return state.toolResults.socialKit?.items?.length ? `${formatNumber(state.toolResults.socialKit.items.length)} форматов` : 'нет набора';
    case 'image-studio':
      return state.toolResults.imageStudio?.dataUrl ? `${String(state.toolResults.imageStudio.format || 'png').toUpperCase()}` : 'нет результата';
    case 'remove-bg':
      return state.toolResults.removeBg?.resultDataUrl ? 'PNG готов' : 'нет результата';
    case 'og-image':
      return state.toolResults.ogImage?.pngDataUrl ? 'обложка готова' : 'нет OG';
    case 'banner-studio':
      return state.toolResults.bannerStudio?.items?.length ? `${formatNumber(state.toolResults.bannerStudio.items.length)} баннеров` : 'нет баннеров';
    case 'pdf-kit':
      return state.toolResults.pdfKit?.launchText ? 'kit собран' : 'нет набора';
    case 'advanced':
      return `${formatNumber(safeArray(getArsenalSuite()?.bridgeTools).length)} pro tools`;
    case 'pdf-advanced':
      return 'внешний PDF workflow';
    case 'video':
      return 'motion и video';
    default:
      return `${formatNumber(safeArray(getArsenalSuite()?.nativeTools).length)} локальных инструментов`;
  }
}

function buildToolsNavMarkup(catalog) {
  const activeTool = getActiveToolView();
  const grouped = catalog.reduce((acc, item) => {
    const group = item.group || 'start';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
  return `
    <article class="data-card tools-nav-card">
      <div class="data-card-header">
        <div>
          <div class="data-card-title">Tool Center</div>
          <small>Отдельные рабочие экраны, как в Arsenal</small>
        </div>
      </div>
      <div class="tools-nav-groups">
        ${Object.entries(grouped).map(([groupId, items]) => `
          <div class="tools-nav-group">
            <div class="tools-nav-group-title">${escapeHtml(TOOL_GROUP_META[groupId] || groupId)}</div>
            ${items.map((item) => `
              <button class="tools-nav-btn ${item.id === activeTool ? 'is-active' : ''}" type="button" data-tool-view="${escapeHtml(item.id)}">
                <span class="tools-nav-btn__title">${escapeHtml(item.title)}</span>
                <span class="tools-nav-btn__desc">${escapeHtml(item.description || '')}</span>
                <span class="tools-nav-btn__meta">${escapeHtml(getToolSummaryText(item.id))}</span>
              </button>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

function buildToolsWorkspaceHeadMarkup(tool, context, currentShortLink) {
  if (!tool) return '';
  const relatedTools = safeArray(tool.related)
    .map((id) => getToolViewDefinition(id))
    .filter(Boolean);
  const sourceLabel = tool.source === 'bridge' ? 'Arsenal Pro' : tool.source === 'workspace' ? 'Workspace' : 'Встроено';
  return `
    <article class="data-card tools-workspace-head">
      <div class="tools-workspace-head__grid">
        <div class="tools-workspace-head__body">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">${escapeHtml(tool.title)}</div>
              <small>${escapeHtml(tool.description || '')}</small>
            </div>
            <span class="badge ${tool.source === 'bridge' ? 'badge--gold' : 'badge--accent'}">${escapeHtml(sourceLabel)}</span>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Landing: ${escapeHtml(context.title)}</span>
            <span class="marketing-chip">Язык: ${escapeHtml(context.languageName)}</span>
            <span class="marketing-chip">Short: ${escapeHtml(currentShortLink?.shortUrl ? 'есть' : 'нет')}</span>
            <span class="marketing-chip">ref: ${escapeHtml(context.referralCode || '—')}</span>
          </div>
          <div class="data-list">
            ${safeArray(tool.bullets).map((item) => `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-sub">${escapeHtml(item)}</div>
                </div>
              </article>
            `).join('')}
          </div>
          ${relatedTools.length ? `
            <div class="tools-workspace-head__actions">
              ${relatedTools.map((item) => `
                <button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="${escapeHtml(item.id === 'shortener' ? 'short' : item.id)}">${escapeHtml(item.title)}</button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        <div class="tools-workspace-head__side">
          <article class="overview-card overview-card--visual">
            <span class="badge badge--muted">Контекст запуска</span>
            <h4>${escapeHtml(getToolSummaryText(tool.id))}</h4>
            <p>${escapeHtml(context.url ? 'Текущий landing уже подставлен в рабочий контур. Можно запускать связку без ручной сборки ссылок.' : 'Если нет текущего landing URL, сначала выберите лендинг или вставьте ссылку вручную в нужный инструмент.')}</p>
            ${context.url ? `<div class="referral-link-box"><div class="referral-link-text">${escapeHtml(context.url)}</div></div>` : ''}
          </article>
        </div>
      </div>
    </article>
  `;
}

function buildToolsWorkflowMarkup(context, currentShortLink) {
  const flows = [
    {
      title: 'Старт трафика',
      text: 'Сначала собираем UTM и tracked link, потом короткую ссылку, QR и AI-текст под выбранный лендинг.',
      chips: ['UTM', 'Short link', 'QR', 'AI-текст'],
      buttons: ['utm-builder', 'shortener', 'qr', 'caption'],
    },
    {
      title: 'Визуальный пакет',
      text: 'Делаем Social Kit, OG Image и баннеры, чтобы быстро упаковать ссылку под разные площадки.',
      chips: ['Social Kit', 'OG Image', 'Banner Studio'],
      buttons: ['social-kit', 'og-image', 'banner-studio'],
    },
    {
      title: 'Lead-kit и bio',
      text: 'Собираем Bio Hub или PDF Lead Kit, когда нужен один аккуратный вход вместо набора разрозненных ссылок.',
      chips: ['Bio Hub', 'PDF Kit', currentShortLink?.shortUrl ? 'short уже готов' : 'short соберётся внутри'],
      buttons: ['bio-hub', 'pdf-kit', 'pdf-advanced'],
    },
  ];
  return `
    <div class="tools-workflow-grid">
      ${flows.map((item) => `
        <article class="overview-card">
          <span class="badge badge--accent">${escapeHtml(context.languageName)}</span>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.text)}</p>
          <div class="marketing-chip-list">
            ${safeArray(item.chips).map((chip) => `<span class="marketing-chip">${escapeHtml(chip)}</span>`).join('')}
          </div>
          <div class="product-card-actions">
            ${safeArray(item.buttons).map((toolId) => {
              const tool = getToolViewDefinition(toolId);
              return tool
                ? `<button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="${escapeHtml(tool.id === 'shortener' ? 'short' : tool.id)}">${escapeHtml(tool.title)}</button>`
                : '';
            }).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function syncToolPageVisibility() {
  const activeTool = getActiveToolView();
  $all('.tool-page').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.toolPage === activeTool);
  });
}

function focusToolForm(formId, focusSelector = 'input, select, textarea') {
  const toolView = getToolViewForFormId(formId);
  if (toolView) setActiveToolView(toolView, { render: state.activePanel === 'tools' });
  activatePanel('tools');
  renderToolsPanel();
  window.requestAnimationFrame(() => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const field = form.querySelector(focusSelector);
    field?.focus();
  });
}

function prefillAssistantTool(kind) {
  setActiveToolView(kind, { render: state.activePanel === 'tools' });
  const context = getToolContextDefaults();
  const preferredUrl = String(state.toolResults.utmBuilder?.finalUrl || context.url || '').trim();
  syncStandaloneToolDefaults();
  if (kind === 'utm-builder' || kind === 'utm') {
    focusToolForm('utm-builder-form');
    return;
  }
  if (kind === 'short') {
    if (preferredUrl) {
      prefillUrlTool('short', preferredUrl, context.title);
      return;
    }
    focusToolForm('shortener-form');
    return;
  }
  if (kind === 'qr') {
    if (preferredUrl) {
      prefillUrlTool('qr', preferredUrl, context.title);
      return;
    }
    focusToolForm('qr-form');
    return;
  }
  if (kind === 'hashtags') {
    const form = $('#hashtags-form');
    if (form?.elements?.input && !String(form.elements.input.value || '').trim()) {
      form.elements.input.value = `${context.title} ${context.languageName} ${context.referralCode}`.trim();
    }
    if (form?.elements?.platform && !String(form.elements.platform.value || '').trim()) {
      form.elements.platform.value = 'telegram';
    }
    focusToolForm('hashtags-form');
    return;
  }
  if (kind === 'caption') {
    const form = $('#caption-form');
    if (form?.elements?.topic && !String(form.elements.topic.value || '').trim()) {
      form.elements.topic.value = `${context.title} через личную ссылку`.trim();
    }
    if (form?.elements?.platform && !String(form.elements.platform.value || '').trim()) {
      form.elements.platform.value = 'telegram';
    }
    focusToolForm('caption-form');
    return;
  }
  if (kind === 'bio-hub') {
    focusToolForm('bio-hub-form');
    return;
  }
  if (kind === 'social-kit') {
    focusToolForm('social-kit-form', 'input[type="file"]');
    return;
  }
  if (kind === 'image-studio') {
    focusToolForm('image-studio-form', 'input[type="file"]');
    return;
  }
  if (kind === 'remove-bg') {
    focusToolForm('remove-bg-form', 'input[type="file"]');
    return;
  }
  if (kind === 'og-image') {
    focusToolForm('og-generator-form');
    return;
  }
  if (kind === 'banner-studio') {
    focusToolForm('banner-studio-form');
    return;
  }
  if (kind === 'pdf-kit') {
    const form = $('#pdf-kit-form');
    if (form?.elements?.url && !String(form.elements.url.value || '').trim() && context.url) {
      form.elements.url.value = context.url;
    }
    if (form?.elements?.title && !String(form.elements.title.value || '').trim()) {
      form.elements.title.value = `${context.title || 'Golden Connect'} PDF Kit`;
    }
    focusToolForm('pdf-kit-form');
    return;
  }
  activatePanel('tools');
  renderToolsPanel();
}

function buildBridgeToolCardMarkup(tool, languageId = 'ru', options = {}) {
  if (!tool) return '';
  const title = String(options.title || tool.title || 'Arsenal Pro').trim();
  const description = String(options.description || tool.description || '').trim();
  const chips = safeArray(options.chips).length
    ? safeArray(options.chips)
    : [`Lang: ${String(languageId || 'ru').toUpperCase()}`, 'Bridge'];
  const ctaLabel = String(options.ctaLabel || 'Открыть').trim();
  return `
    <article class="promo-material-card">
      <span class="badge badge--gold">Arsenal Pro</span>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(description)}</p>
      <div class="marketing-chip-list">
        ${chips.map((chip) => `<span class="marketing-chip">${escapeHtml(chip)}</span>`).join('')}
      </div>
      <div class="product-card-actions">
        <a class="btn btn--primary btn--sm" href="${escapeHtml(getBridgeToolUrl(tool.url, languageId))}" target="_blank" rel="noopener">${escapeHtml(ctaLabel)}</a>
      </div>
    </article>
  `;
}

function describeToolError(error, fallbackText) {
  const reason = String(error?.payload?.reason || error?.message || '').trim().toLowerCase();
  const known = {
    auth_required: 'Нужно заново войти в кабинет, чтобы использовать инструмент.',
    invalid_url: 'Проверьте ссылку: нужен полный URL вида https://...',
    url_required: 'Добавьте ссылку для обработки.',
    input_required: 'Добавьте тему или текст для подбора.',
    topic_required: 'Добавьте тему для AI-текста.',
    shortener_failed: 'Не удалось создать короткую ссылку. Попробуйте ещё раз через пару секунд.',
    qr_failed: 'Не удалось собрать QR-код. Проверьте ссылку и повторите попытку.',
    hashtags_failed: 'Не удалось подобрать хештеги. Попробуйте другую формулировку темы.',
    caption_failed: 'Не удалось собрать AI-текст. Попробуйте короче сформулировать тему.',
  };
  return known[reason] || fallbackText;
}

function getBridgeToolUrl(url, languageId = 'ru') {
  const lang = String(languageId || 'ru').trim().toLowerCase();
  const resolvedLang = ['ru', 'en', 'es', 'de', 'fr', 'it', 'pt', 'tr', 'ar', 'zh'].includes(lang) ? lang : 'ru';
  try {
    const parsed = new URL(String(url || '').trim());
    parsed.searchParams.set('lang', resolvedLang);
    return parsed.toString();
  } catch {
    return String(url || '').trim();
  }
}

const SOCIAL_KIT_PRESETS = [
  { id: 'instagram_post', title: 'Instagram Post', width: 1080, height: 1080 },
  { id: 'instagram_story', title: 'Instagram Story', width: 1080, height: 1920 },
  { id: 'facebook_cover', title: 'Facebook Cover', width: 1640, height: 624 },
  { id: 'twitter_header', title: 'Twitter Header', width: 1500, height: 500 },
  { id: 'linkedin_banner', title: 'LinkedIn Banner', width: 1584, height: 396 },
];

const BANNER_SIZE_PRESETS = [
  { id: 'leaderboard', title: 'Leaderboard', width: 728, height: 90, pack: 'ads' },
  { id: 'rectangle', title: 'Medium Rectangle', width: 300, height: 250, pack: 'ads' },
  { id: 'halfpage', title: 'Half Page', width: 300, height: 600, pack: 'ads' },
  { id: 'feed', title: 'Social Feed', width: 1200, height: 628, pack: 'social' },
  { id: 'square', title: 'Square Post', width: 1080, height: 1080, pack: 'social' },
  { id: 'story', title: 'Story / Reels', width: 1080, height: 1920, pack: 'social' },
];

const BANNER_STYLE_PRESETS = [
  { id: 'aurora', title: 'Aurora' },
  { id: 'impact', title: 'Impact' },
  { id: 'clean', title: 'Clean' },
];

function sanitizeToolSlug(value, fallback = 'asset') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return normalized || fallback;
}

function buildMimeType(format = 'png') {
  const normalized = String(format || 'png').trim().toLowerCase();
  if (normalized === 'jpeg' || normalized === 'jpg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  return 'image/png';
}

function buildFileName(base, extension = 'png') {
  return `${sanitizeToolSlug(base, 'golden-connect')}.${String(extension || 'png').trim().toLowerCase()}`;
}

function buildSvgDataUrl(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(String(svg || '').trim())}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('file_required'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(source) {
  return new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error('image_required'));
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image_load_failed'));
    image.src = source;
  });
}

function createToolCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(Number(width) || 1));
  canvas.height = Math.max(1, Math.round(Number(height) || 1));
  return canvas;
}

function fillCanvasBackground(ctx, width, height, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function drawImageFit(ctx, image, width, height, fit = 'cover', background = '#ffffff') {
  const mode = String(fit || 'cover').trim().toLowerCase();
  if (mode === 'contain') fillCanvasBackground(ctx, width, height, background);
  const scale = mode === 'contain'
    ? Math.min(width / image.width, height / image.height)
    : Math.max(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;
  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

function getScenarioPalette(landingId = 'health', styleId = 'aurora') {
  const palettes = {
    health: {
      primary: '#25d0ff',
      secondary: '#6fffbf',
      accent: '#ffd166',
      deep: '#082032',
      light: '#ebfbff',
    },
    business: {
      primary: '#1d4ed8',
      secondary: '#38bdf8',
      accent: '#f59e0b',
      deep: '#081833',
      light: '#eff6ff',
    },
    hybrid: {
      primary: '#7c3aed',
      secondary: '#25d0ff',
      accent: '#ffd166',
      deep: '#140b2f',
      light: '#f5efff',
    },
  };
  const base = palettes[String(landingId || 'health').trim().toLowerCase()] || palettes.health;
  if (styleId === 'impact') {
    return {
      ...base,
      primary: '#ff5d73',
      secondary: '#ff9966',
      accent: '#fff1a8',
      deep: '#2b0d18',
      light: '#fff6f7',
    };
  }
  if (styleId === 'clean') {
    return {
      ...base,
      primary: '#ffffff',
      secondary: '#dbeafe',
      accent: '#16a34a',
      deep: '#0f172a',
      light: '#ffffff',
    };
  }
  return base;
}

async function rasterizeSvgToPng(svg, width, height) {
  const image = await loadImageElement(buildSvgDataUrl(svg));
  const canvas = createToolCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

async function createSocialKitAssets(sourceDataUrl, fit = 'cover') {
  const image = await loadImageElement(sourceDataUrl);
  const items = [];
  for (const preset of SOCIAL_KIT_PRESETS) {
    const canvas = createToolCanvas(preset.width, preset.height);
    const ctx = canvas.getContext('2d');
    drawImageFit(ctx, image, preset.width, preset.height, fit, '#ffffff');
    items.push({
      ...preset,
      dataUrl: canvas.toDataURL('image/png'),
      fileName: buildFileName(`golden-connect-${preset.id}`, 'png'),
    });
  }
  return {
    sourceDataUrl,
    fit,
    items,
  };
}

async function createImageStudioAsset(sourceDataUrl, options = {}) {
  const width = Math.max(200, Math.min(4096, Number(options.width || 1200)));
  const height = Math.max(200, Math.min(4096, Number(options.height || 1200)));
  const fit = String(options.fit || 'contain').trim().toLowerCase();
  const format = String(options.format || 'png').trim().toLowerCase();
  const quality = format === 'png' ? undefined : 0.92;
  const image = await loadImageElement(sourceDataUrl);
  const canvas = createToolCanvas(width, height);
  const ctx = canvas.getContext('2d');
  drawImageFit(ctx, image, width, height, fit, '#ffffff');
  const mimeType = buildMimeType(format);
  return {
    sourceDataUrl,
    width,
    height,
    fit,
    format,
    mimeType,
    dataUrl: canvas.toDataURL(mimeType, quality),
    fileName: buildFileName(`golden-connect-${width}x${height}-${fit}`, format === 'jpg' ? 'jpeg' : format),
  };
}

function sampleCornerColor(imageData, width, height, sampleSize = 12) {
  const size = Math.max(2, Math.min(sampleSize, Math.floor(Math.min(width, height) / 4) || 2));
  const zones = [
    [0, 0],
    [Math.max(0, width - size), 0],
    [0, Math.max(0, height - size)],
    [Math.max(0, width - size), Math.max(0, height - size)],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (const [startX, startY] of zones) {
    for (let y = startY; y < startY + size; y += 1) {
      for (let x = startX; x < startX + size; x += 1) {
        const index = (y * width + x) * 4;
        r += imageData.data[index];
        g += imageData.data[index + 1];
        b += imageData.data[index + 2];
        count += 1;
      }
    }
  }
  return count
    ? { r: r / count, g: g / count, b: b / count }
    : { r: 255, g: 255, b: 255 };
}

async function createRemoveBackgroundAsset(sourceDataUrl, threshold = 34) {
  const image = await loadImageElement(sourceDataUrl);
  const canvas = createToolCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const background = sampleCornerColor(imageData, canvas.width, canvas.height);
  const thresholdValue = Math.max(5, Math.min(120, Number(threshold || 34)));
  const hard = thresholdValue * 1.8;
  const soft = thresholdValue * 2.6;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const dr = imageData.data[index] - background.r;
    const dg = imageData.data[index + 1] - background.g;
    const db = imageData.data[index + 2] - background.b;
    const distance = Math.sqrt((dr * dr) + (dg * dg) + (db * db));
    if (distance <= hard) {
      imageData.data[index + 3] = 0;
    } else if (distance < soft) {
      const alpha = Math.round(((distance - hard) / Math.max(1, soft - hard)) * 255);
      imageData.data[index + 3] = Math.max(0, Math.min(imageData.data[index + 3], alpha));
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return {
    originalDataUrl: sourceDataUrl,
    resultDataUrl: canvas.toDataURL('image/png'),
    threshold: thresholdValue,
    background,
    fileName: buildFileName('golden-connect-nobg', 'png'),
  };
}

function buildOgSvg(options = {}) {
  const width = 1200;
  const height = 630;
  const title = escapeHtml(String(options.title || 'Golden Connect').trim().slice(0, 80));
  const subtitle = escapeHtml(String(options.subtitle || 'Каталог, лендинги, материалы и кабинет партнёра.').trim().slice(0, 180));
  const cta = escapeHtml(String(options.cta || 'Открыть Golden Connect').trim().slice(0, 42));
  const languageName = escapeHtml(String(options.languageName || 'Русский').trim().slice(0, 32));
  const referralCode = escapeHtml(String(options.referralCode || '').trim().slice(0, 32));
  const palette = getScenarioPalette(options.landingId || 'health', options.styleId || 'aurora');
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.deep}"/>
      <stop offset="52%" stop-color="${palette.primary}"/>
      <stop offset="100%" stop-color="${palette.secondary}"/>
    </linearGradient>
    <radialGradient id="orb" cx="50%" cy="50%" r="60%">
      <stop offset="0%" stop-color="${palette.accent}" stop-opacity=".92"/>
      <stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="28" fill="url(#bg)"/>
  <circle cx="1020" cy="120" r="220" fill="url(#orb)" opacity=".65"/>
  <circle cx="180" cy="520" r="220" fill="${palette.secondary}" opacity=".12"/>
  <rect x="58" y="58" width="230" height="54" rx="27" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.16)"/>
  <text x="84" y="92" fill="#ffffff" font-size="24" font-weight="700" font-family="Inter,Segoe UI,Arial">Golden Connect OG</text>
  <text x="78" y="198" fill="#ffffff" font-size="64" font-weight="800" font-family="Inter,Segoe UI,Arial">${title}</text>
  <foreignObject x="74" y="232" width="720" height="180">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Segoe UI,Arial;color:rgba(255,255,255,.92);font-size:28px;line-height:1.45;">
      ${subtitle}
    </div>
  </foreignObject>
  <rect x="78" y="490" width="286" height="68" rx="18" fill="#ffffff"/>
  <text x="112" y="534" fill="${palette.deep}" font-size="28" font-weight="800" font-family="Inter,Segoe UI,Arial">${cta}</text>
  <text x="882" y="536" fill="#ffffff" font-size="22" font-weight="600" font-family="Inter,Segoe UI,Arial">${languageName}</text>
  <text x="882" y="568" fill="rgba(255,255,255,.82)" font-size="20" font-weight="500" font-family="Inter,Segoe UI,Arial">${referralCode ? `ref ${referralCode}` : 'cabinet.golden-connect.to'}</text>
</svg>`.trim();
}

async function createOgGraphicAsset(options = {}) {
  const svg = buildOgSvg(options);
  return {
    title: String(options.title || 'Golden Connect').trim(),
    subtitle: String(options.subtitle || '').trim(),
    cta: String(options.cta || '').trim(),
    svg,
    svgDataUrl: buildSvgDataUrl(svg),
    pngDataUrl: await rasterizeSvgToPng(svg, 1200, 630),
    fileNameBase: sanitizeToolSlug(options.title || 'golden-connect-og', 'golden-connect-og'),
  };
}

function buildBannerHtml(options = {}) {
  const palette = getScenarioPalette(options.landingId || 'health', options.styleId || 'aurora');
  const width = Math.max(120, Math.round(Number(options.width || 300)));
  const height = Math.max(50, Math.round(Number(options.height || 250)));
  const title = escapeHtml(String(options.title || 'Golden Connect').trim().slice(0, 60));
  const subtitle = escapeHtml(String(options.subtitle || '').trim().slice(0, 100));
  const cta = escapeHtml(String(options.cta || 'Открыть').trim().slice(0, 32));
  const href = escapeHtml(String(options.url || '#').trim());
  const vertical = height >= width * 1.6;
  const titleSize = Math.max(14, Math.min(34, Math.round(height * (vertical ? 0.10 : 0.18))));
  const subtitleSize = Math.max(10, Math.min(18, Math.round(height * (vertical ? 0.045 : 0.09))));
  const buttonPadding = vertical ? '8px 14px' : '6px 12px';
  const layoutStyle = vertical
    ? 'flex-direction:column;justify-content:center;text-align:center;padding:18px 14px;'
    : 'justify-content:space-between;padding:0 18px;';
  const subtitleHtml = subtitle ? `<div style="font-size:${subtitleSize}px;color:rgba(255,255,255,.82);line-height:1.35;margin-top:4px;">${subtitle}</div>` : '';
  return `<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;">
    <div style="width:${width}px;height:${height}px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,${palette.deep},${palette.primary} 52%,${palette.secondary});display:flex;align-items:center;gap:12px;box-sizing:border-box;font-family:Inter,Segoe UI,Arial,sans-serif;${layoutStyle}">
      <div style="flex:${vertical ? 'none;width:100%;' : '1'};min-width:0;">
        <div style="font-size:${titleSize}px;font-weight:800;color:#fff;line-height:1.05;">${title}</div>
        ${subtitleHtml}
      </div>
      <div style="padding:${buttonPadding};border-radius:12px;background:#fff;color:${palette.deep};font-weight:800;font-size:${Math.max(11, Math.min(18, Math.round(height * 0.10)))}px;white-space:nowrap;">${cta}</div>
    </div>
  </a>`;
}

function buildBannerSvg(options = {}) {
  const width = Math.max(120, Math.round(Number(options.width || 300)));
  const height = Math.max(50, Math.round(Number(options.height || 250)));
  const palette = getScenarioPalette(options.landingId || 'health', options.styleId || 'aurora');
  const title = escapeHtml(String(options.title || 'Golden Connect').trim().slice(0, 60));
  const subtitle = escapeHtml(String(options.subtitle || '').trim().slice(0, 110));
  const cta = escapeHtml(String(options.cta || 'Открыть').trim().slice(0, 32));
  const vertical = height >= width * 1.6;
  const titleSize = Math.max(18, Math.min(56, Math.round(height * (vertical ? 0.10 : 0.18))));
  const subtitleSize = Math.max(12, Math.min(24, Math.round(height * (vertical ? 0.045 : 0.08))));
  const buttonWidth = Math.max(96, Math.min(200, Math.round(width * (vertical ? 0.58 : 0.24))));
  const buttonHeight = Math.max(36, Math.min(72, Math.round(height * 0.22)));
  const buttonX = vertical ? Math.round((width - buttonWidth) / 2) : Math.round(width - buttonWidth - 18);
  const buttonY = vertical ? Math.round(height - buttonHeight - 24) : Math.round((height - buttonHeight) / 2);
  const titleX = vertical ? Math.round(width / 2) : 18;
  const titleY = vertical ? Math.round(height * 0.32) : Math.round(height * 0.38);
  const subtitleY = vertical ? titleY + titleSize + 18 : titleY + titleSize;
  const subtitleWidth = vertical ? Math.round(width * 0.78) : Math.round(width * 0.52);
  const subtitleX = vertical ? Math.round((width - subtitleWidth) / 2) : 18;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="banner-bg-${width}-${height}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.deep}"/>
      <stop offset="50%" stop-color="${palette.primary}"/>
      <stop offset="100%" stop-color="${palette.secondary}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="14" fill="url(#banner-bg-${width}-${height})"/>
  <circle cx="${Math.round(width * 0.88)}" cy="${Math.round(height * 0.18)}" r="${Math.round(Math.max(width, height) * 0.20)}" fill="${palette.accent}" opacity=".28"/>
  <text x="${titleX}" y="${titleY}" fill="#ffffff" font-size="${titleSize}" font-weight="800" font-family="Inter,Segoe UI,Arial" text-anchor="${vertical ? 'middle' : 'start'}">${title}</text>
  ${subtitle ? `
  <foreignObject x="${subtitleX}" y="${subtitleY}" width="${subtitleWidth}" height="${Math.max(30, Math.round(height * 0.34))}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Inter,Segoe UI,Arial;color:rgba(255,255,255,.84);font-size:${subtitleSize}px;line-height:1.3;${vertical ? 'text-align:center;' : ''}">
      ${subtitle}
    </div>
  </foreignObject>` : ''}
  <rect x="${buttonX}" y="${buttonY}" width="${buttonWidth}" height="${buttonHeight}" rx="12" fill="#ffffff"/>
  <text x="${Math.round(buttonX + buttonWidth / 2)}" y="${Math.round(buttonY + buttonHeight / 2 + Math.max(4, buttonHeight * 0.12))}" fill="${palette.deep}" font-size="${Math.max(12, Math.round(buttonHeight * 0.32))}" font-weight="800" text-anchor="middle" font-family="Inter,Segoe UI,Arial">${cta}</text>
</svg>`.trim();
}

async function createBannerStudioAssets(options = {}) {
  const items = [];
  const url = String(options.url || '').trim();
  const selectedSizes = safeArray(BANNER_SIZE_PRESETS).filter((size) => {
    const sizePack = String(options.sizePack || 'all').trim();
    return sizePack === 'all' || size.pack === sizePack;
  });
  const selectedStyles = safeArray(BANNER_STYLE_PRESETS).filter((style) => {
    const styleId = String(options.styleId || 'all').trim();
    return styleId === 'all' || style.id === styleId;
  });
  for (const size of selectedSizes) {
    for (const style of selectedStyles) {
      const svg = buildBannerSvg({
        ...options,
        width: size.width,
        height: size.height,
        styleId: style.id,
      });
      items.push({
        id: `${size.id}-${style.id}`,
        sizeId: size.id,
        styleId: style.id,
        title: size.title,
        styleTitle: style.title,
        width: size.width,
        height: size.height,
        previewHtml: buildBannerHtml({
          ...options,
          width: size.width,
          height: size.height,
          styleId: style.id,
          url,
        }),
        embedCode: buildBannerHtml({
          ...options,
          width: size.width,
          height: size.height,
          styleId: style.id,
          url,
        }),
        svgDataUrl: buildSvgDataUrl(svg),
        pngDataUrl: await rasterizeSvgToPng(svg, size.width, size.height),
        fileNameBase: sanitizeToolSlug(`golden-connect-${size.id}-${style.id}`, `golden-connect-${size.id}`),
      });
    }
  }
  return {
    url,
    sizePack: String(options.sizePack || 'all').trim(),
    styleId: String(options.styleId || 'all').trim(),
    items,
  };
}

function buildBioHubUrl(options = {}) {
  const workspace = getWorkspace() || {};
  const referralCode = String(workspace.referralCode || state.user?.referralCode || '').trim();
  if (!referralCode) return '';
  const landingId = String(options.landingId || state.landingPreferences.landingId || 'health').trim();
  const languageId = String(options.languageId || state.landingPreferences.language || 'ru').trim().toLowerCase();
  const url = new URL(`/hub/${encodeURIComponent(referralCode)}`, window.location.origin);
  url.searchParams.set('landing', landingId);
  url.searchParams.set('lang', languageId);
  if (options.headline) url.searchParams.set('headline', String(options.headline).trim().slice(0, 120));
  if (options.summary) url.searchParams.set('summary', String(options.summary).trim().slice(0, 220));
  return url.toString();
}

async function createPdfKitBundle(options = {}) {
  const normalizedUrl = String(options.url || '').trim();
  if (!normalizedUrl) throw new Error('url_required');
  let shortLink = null;
  try {
    const shortResult = await api('/cabinet/api/shortener/links', {
      method: 'POST',
      body: JSON.stringify({
        url: normalizedUrl,
        title: options.title || 'PDF Kit',
      }),
    });
    state.shortLinks = shortResult.items || state.shortLinks;
    shortLink = shortResult.link || null;
  } catch {}

  const qrTarget = shortLink?.shortUrl || normalizedUrl;
  const qrResult = await api('/cabinet/api/tools/qr', {
    method: 'POST',
    body: JSON.stringify({
      url: qrTarget,
      size: 360,
    }),
  });

  const ogImage = await createOgGraphicAsset({
    title: options.title || 'PDF Lead Kit',
    subtitle: options.subtitle || 'Готовый набор для PDF, страницы, QR и короткой ссылки внутри Golden Connect.',
    cta: options.cta || 'Открыть набор',
    landingId: options.landingId || 'health',
    languageName: options.languageName || 'Русский',
    referralCode: options.referralCode || '',
  });

  return {
    sourceUrl: normalizedUrl,
    shortLink,
    qr: qrResult.qr || null,
    ogImage,
    launchText: [
      `Набор: ${options.title || 'PDF Lead Kit'}`,
      `Ссылка: ${normalizedUrl}`,
      shortLink?.shortUrl ? `Short link: ${shortLink.shortUrl}` : '',
      qrResult.qr?.url ? `QR: ${qrResult.qr.url}` : '',
      options.companyUrl ? `Компания: ${options.companyUrl}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function applyUtmPresetToForm(presetId = '') {
  const form = $('#utm-builder-form');
  if (!form) return;
  const preset = getReferralCampaignPresets().find((item) => item.id === presetId) || null;
  const currentLanguageId = state.landingPreferences.language || 'ru';
  const context = preset
    ? buildToolContextForLanding(preset.landingId || state.landingPreferences.landingId, currentLanguageId)
    : getToolContextDefaults();
  const defaults = getDefaultUtmDraft(context);

  if (form.elements.baseUrl) form.elements.baseUrl.value = context.url || defaults.baseUrl || '';
  if (form.elements.source) form.elements.source.value = preset?.utmSource || defaults.source;
  if (form.elements.medium) form.elements.medium.value = preset?.utmMedium || defaults.medium;
  if (form.elements.campaign) form.elements.campaign.value = preset?.utmCampaign || defaults.campaign;
  if (form.elements.content) form.elements.content.value = preset?.id || defaults.content;
  if (form.elements.term) form.elements.term.value = currentLanguageId || defaults.term;
}

function syncUtmBuilderDefaults() {
  const form = $('#utm-builder-form');
  if (!form) return;
  const context = getToolContextDefaults();
  const defaults = getDefaultUtmDraft(context);
  const presetId = String(form.elements.presetId?.value || '').trim();

  if (form.elements.baseUrl && !String(form.elements.baseUrl.value || '').trim()) form.elements.baseUrl.value = defaults.baseUrl;
  if (form.elements.source && !String(form.elements.source.value || '').trim()) form.elements.source.value = defaults.source;
  if (form.elements.medium && !String(form.elements.medium.value || '').trim()) form.elements.medium.value = defaults.medium;
  if (form.elements.campaign && !String(form.elements.campaign.value || '').trim()) form.elements.campaign.value = defaults.campaign;
  if (form.elements.content && !String(form.elements.content.value || '').trim()) form.elements.content.value = defaults.content;
  if (form.elements.term && !String(form.elements.term.value || '').trim()) form.elements.term.value = defaults.term;

  if (presetId && !state.toolResults.utmBuilder?.finalUrl) {
    applyUtmPresetToForm(presetId);
  }
}

function syncStandaloneToolDefaults() {
  const context = getToolContextDefaults();
  const workspace = getWorkspace() || {};
  syncUtmBuilderDefaults();
  const bioHeadline = document.querySelector('#bio-hub-form [name="headline"]');
  const bioSummary = document.querySelector('#bio-hub-form [name="summary"]');
  const ogTitle = document.querySelector('#og-generator-form [name="title"]');
  const ogSubtitle = document.querySelector('#og-generator-form [name="subtitle"]');
  const ogCta = document.querySelector('#og-generator-form [name="cta"]');
  const bannerTitle = document.querySelector('#banner-studio-form [name="title"]');
  const bannerSubtitle = document.querySelector('#banner-studio-form [name="subtitle"]');
  const bannerCta = document.querySelector('#banner-studio-form [name="cta"]');
  const pdfUrl = document.querySelector('#pdf-kit-form [name="url"]');
  const pdfTitle = document.querySelector('#pdf-kit-form [name="title"]');
  const pdfSubtitle = document.querySelector('#pdf-kit-form [name="subtitle"]');
  const pdfCta = document.querySelector('#pdf-kit-form [name="cta"]');
  const captionCta = document.querySelector('#caption-form [name="cta"]');
  const preferredUrl = getPreferredToolUrl(context);

  if (bioHeadline && !String(bioHeadline.value || '').trim()) bioHeadline.value = `${context.title} · Golden Connect`;
  if (bioSummary && !String(bioSummary.value || '').trim()) bioSummary.value = 'Один удобный вход в лендинг, кабинет, каталог и официальный контур компании.';
  if (ogTitle && !String(ogTitle.value || '').trim()) ogTitle.value = context.title || 'Golden Connect';
  if (ogSubtitle && !String(ogSubtitle.value || '').trim()) ogSubtitle.value = 'Каталог, лендинги, рекламные материалы и кабинет партнёра в одной системе.';
  if (ogCta && !String(ogCta.value || '').trim()) ogCta.value = 'Открыть Golden Connect';
  if (bannerTitle && !String(bannerTitle.value || '').trim()) bannerTitle.value = context.title || 'Golden Connect';
  if (bannerSubtitle && !String(bannerSubtitle.value || '').trim()) bannerSubtitle.value = 'Каталог, материалы, AI и партнёрский кабинет на одной ссылке.';
  if (bannerCta && !String(bannerCta.value || '').trim()) bannerCta.value = 'Открыть';
  if (captionCta && !String(captionCta.value || '').trim()) captionCta.value = `Открой ${context.title || 'страницу'} и посмотри детали`;
  if (pdfUrl && !String(pdfUrl.value || '').trim() && preferredUrl) pdfUrl.value = preferredUrl;
  if (pdfTitle && !String(pdfTitle.value || '').trim()) pdfTitle.value = `${context.title || 'Golden Connect'} PDF Kit`;
  if (pdfSubtitle && !String(pdfSubtitle.value || '').trim()) pdfSubtitle.value = 'Готовый набор: tracked link, QR, OG-обложка и следующий шаг для лида.';
  if (pdfCta && !String(pdfCta.value || '').trim()) pdfCta.value = 'Открыть набор';
  if (workspace && workspace.companyReferralLink) {
    pdfUrl?.setAttribute('data-company-url', workspace.companyReferralLink);
  }
}

function buildTemplateValues() {
  const workspace = getWorkspace() || {};
  const landingUi = getLandingUiState();
  return {
    siteReferralLink: workspace.siteReferralLink || '',
    cabinetReferralLink: workspace.cabinetReferralLink || '',
    companyReferralLink: workspace.companyReferralLink || '',
    companyCatalogLink: workspace.companyCatalogLink || '',
    officialCompanyLink: workspace.officialCompanyLink || '',
    catalogLink: workspace.catalogLink || '',
    referralCode: workspace.referralCode || '',
    landingUrl: landingUi?.link?.url || workspace.siteReferralLink || '',
    landingTitle: getLocalizedCopy(landingUi?.landing?.titles, landingUi?.language?.id, landingUi?.landing?.title || ''),
    landingLabel: getLocalizedCopy(landingUi?.landing?.labels, landingUi?.language?.id, landingUi?.landing?.id || ''),
    languageName: landingUi?.language?.nativeLabel || landingUi?.language?.label || 'Русский',
  };
}

function fillPromoTemplate(template, extraValues = {}) {
  const landingUi = getLandingUiState();
  const localizedTemplate = getLocalizedCopy(template, landingUi?.language?.id, typeof template === 'string' ? template : '');
  const values = buildTemplateValues();
  const merged = {
    ...values,
    ...(extraValues && typeof extraValues === 'object' ? extraValues : {}),
  };
  return String(localizedTemplate || '').replace(/\{\{(\w+)\}\}/g, (match, token) => {
    return merged[token] || '';
  });
}

function copyButtonMarkup(text, label = 'Копировать', kind = 'copy_referral') {
  if (!text) return '';
  return `<button class="btn btn--ghost btn--sm tool-copy-btn" type="button" data-copy-text="${escapeHtml(text)}" data-copy-kind="${escapeHtml(kind)}">${escapeHtml(label)}</button>`;
}

function renderShortLinksList(selector, items = state.shortLinks) {
  const root = typeof selector === 'string' ? $(selector) : selector;
  if (!root) return;
  root.innerHTML = safeArray(items).length
    ? safeArray(items).map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title || item.slug || item.code || 'Short link')}</div>
          <div class="data-item-sub">${escapeHtml(item.shortUrl || '')}</div>
        </div>
        <div class="data-item-value">${formatNumber(item.clicks || 0)} кликов</div>
        <div class="product-card-actions">
          ${copyButtonMarkup(item.shortUrl, 'Копировать')}
          ${item.shortUrl ? `<button class="btn btn--ghost btn--sm tool-prefill-url-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(item.shortUrl)}" data-tool-title="${escapeHtml(item.title || item.slug || item.code || 'Short link')}">QR</button>` : ''}
          ${item.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Цель</a>` : ''}
        </div>
      </article>
    `).join('')
    : emptyState('Короткие ссылки появятся после первого сокращения реферальной ссылки или лендинга.');
}

function renderWorkspaceTopbar() {
  const root = $('#workspace-topbar');
  if (!root) return;
  const workspace = getWorkspace();
  const onboarding = buildOnboardingSnapshot();
  const mediaCenter = getMediaCenter();
  const currentPack = getCurrentMediaPack();
  const topbarAsset = getPackCoverAsset(currentPack) || safeArray(mediaCenter?.brandAssets)[0] || null;
  const resultsShowcase = state.site?.resultsShowcase || null;
  const proofItems = safeArray(resultsShowcase?.items).slice(0, 2);
  if (!workspace) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <article class="workspace-topbar-card">
      <div class="workspace-topbar-main">
        <span class="badge badge--accent">Главная реферальная ссылка</span>
        <strong class="workspace-topbar-title">${escapeHtml(workspace.siteReferralLink || '—')}</strong>
        <div class="workspace-topbar-meta">
          Код приглашения: <b>${escapeHtml(workspace.referralCode || '—')}</b>
          <span class="workspace-topbar-separator">•</span>
          Статус: <b>${escapeHtml(onboarding.status === 'completed' ? 'кабинет готов' : 'нужен следующий шаг')}</b>
        </div>
        <div class="marketing-chip-list">
          <span class="marketing-chip">Официальный каталог</span>
          <span class="marketing-chip">Инструкции по продуктам</span>
          <span class="marketing-chip">Отзывы и social proof</span>
        </div>
        ${proofItems.length ? `
          <div class="workspace-topbar-proof-list">
            ${proofItems.map((item) => `
              <article class="workspace-topbar-proof">
                <strong>${escapeHtml(item.title || 'Опора')}</strong>
                <p>${escapeHtml(item.text || '')}</p>
              </article>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="workspace-topbar-side">
        ${topbarAsset?.imageUrl ? `
          <div class="workspace-topbar-media">
            <img src="${escapeHtml(topbarAsset.imageUrl)}" alt="${escapeHtml(topbarAsset.title || 'Golden Connect visual')}" loading="lazy">
            <div class="workspace-topbar-media-copy">
              <strong>${escapeHtml(topbarAsset.title || currentPack?.title || 'Рабочий визуал')}</strong>
              <p>${escapeHtml(topbarAsset.description || currentPack?.summary || 'Текущий визуал для лендинга, материалов и отправки.')}</p>
            </div>
          </div>
        ` : ''}
        <div class="workspace-topbar-actions">
          ${copyButtonMarkup(workspace.siteReferralLink)}
          <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tools">QR</button>
          <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Лендинги</button>
          <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Материалы</button>
          ${workspace.companyReferralLink ? `<a class="btn btn--primary btn--sm" href="${escapeHtml(workspace.companyReferralLink)}" target="_blank" rel="noopener">Регистрация в компании</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderLinksPanel() {
  const workspace = getWorkspace();
  const referralCenter = getReferralCenter();
  const languageId = state.landingPreferences.language || getCurrentLandingWorkspace().language?.id || 'ru';
  const panelCopy = getCampaignUiCopy(languageId);
  if (!workspace) return;

  const linkMap = {
    site: workspace.siteReferralLink,
    company: workspace.companyReferralLink,
    catalog: workspace.companyCatalogLink || workspace.catalogLink || workspace.officialCompanyLink,
  };
  const campaignRuntimes = getReferralCampaignPresets()
    .map((item) => buildCampaignRuntime(item, { languageId }))
    .filter(Boolean);

  if ($('#links-hub')) {
    $('#links-hub').innerHTML = safeArray(referralCenter?.sections).map((item) => {
      const url = linkMap[item.target] || '';
      return `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">${escapeHtml(item.title || 'Ссылка')}</div>
              <small>${escapeHtml(item.description || '')}</small>
            </div>
          </div>
          <div class="referral-link-box">
            <div class="referral-link-text">${escapeHtml(url || '—')}</div>
          </div>
          <div class="product-card-actions">
            ${copyButtonMarkup(url)}
            ${url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(url)}" target="_blank" rel="noopener">Открыть</a>` : ''}
          </div>
        </article>
      `;
    }).join('');
  }

  if ($('#links-campaign-center')) {
    $('#links-campaign-center').innerHTML = campaignRuntimes.length
      ? `<div class="campaign-grid">${campaignRuntimes.map((runtime) => buildCampaignCardMarkup(runtime, {
        panel: 'links',
        showTexts: true,
      })).join('')}</div>`
      : emptyState(panelCopy.noCampaigns);
  }

  if ($('#links-routing-rules')) {
    const channelLinks = safeArray(referralCenter?.shareChannels).map((item) => {
      const url = buildChannelShareLink(item.id, workspace.siteReferralLink, 'Посмотри мой кабинет Golden Connect', 'Golden Connect');
      return url ? { ...item, url } : null;
    }).filter(Boolean);
    $('#links-routing-rules').innerHTML = `
      <div class="data-list">
        ${safeArray(referralCenter?.routingRules).map((item) => `
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Логика переходов</div>
              <div class="data-item-sub">${escapeHtml(item)}</div>
            </div>
          </article>
        `).join('')}
        <article class="data-item">
          <div class="data-item-main">
            <div class="data-item-title">Шэринг по каналам</div>
            <div class="campaign-share-row">
              ${channelLinks.map((item) => `
                <a
                  class="btn btn--ghost btn--sm marketing-share-link"
                  href="${escapeHtml(item.url)}"
                  ${String(item.url || '').startsWith('mailto:') ? '' : 'target="_blank" rel="noopener"'}
                  data-channel="${escapeHtml(item.id)}"
                  data-campaign-id="main-referral"
                  data-landing-id="${escapeHtml(state.landingPreferences.landingId || '')}"
                  data-language-id="${escapeHtml(languageId)}"
                  data-panel="links"
                  data-share-url="${escapeHtml(workspace.siteReferralLink || '')}"
                >${escapeHtml(item.label || getShareChannelLabel(item.id))}</a>
              `).join('')}
            </div>
          </div>
        </article>
      </div>
    `;
  }

  renderShortLinksList('#links-short-links');
}


function legacyRenderLandingsPanel() {
  const ui = getLandingUiState();
  if (!ui) return;
  const { library, workspace, language, landing } = ui;
  const panelCopy = getLandingPanelCopy(language?.id);

  if ($('#landing-library')) {
    $('#landing-library').innerHTML = `
      <div class="landing-toolbar">
        <div class="landing-toolbar__group">
          <span class="badge badge--accent">Язык лендингов</span>
          <div class="landing-language-switch">
            ${safeArray(library.languages).map((item) => `
              <button class="landing-language-btn ${item.id === language?.id ? 'is-active' : ''}" type="button" data-language-id="${escapeHtml(item.id)}">${escapeHtml(item.nativeLabel || item.label || item.id)}</button>
            `).join('')}
          </div>
        </div>
        <div class="landing-toolbar__summary">
          <span class="marketing-chip">По умолчанию: ${escapeHtml((safeArray(library.languages).find((item) => item.id === library.defaultLanguage) || language)?.nativeLabel || 'Русский')}</span>
          <span class="marketing-chip">Сценариев: ${escapeHtml(String(safeArray(library.types).length))}</span>
          <span class="marketing-chip">Текущий язык: ${escapeHtml(language?.nativeLabel || language?.label || 'Русский')}</span>
        </div>
      </div>
      <div class="landing-scenario-grid">
        ${safeArray(library.types).map((type) => {
          const link = safeArray(workspace.landingLinks).find((item) => item.landingId === type.id && item.language === language?.id);
          const title = getLocalizedCopy(type.titles, language?.id, type.title || type.id);
          const description = getLocalizedCopy(type.descriptions, language?.id, type.description || '');
          const label = getLocalizedCopy(type.labels, language?.id, type.id);
          return `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(type.icon || '🌐')} ${escapeHtml(title)}</div>
                  <small>${escapeHtml(description)}</small>
                </div>
                <span class="badge ${type.id === landing?.id ? 'badge--accent' : 'badge--muted'}">${escapeHtml(label)}</span>
              </div>
              <div class="landing-scenario-card">
                <div class="landing-scenario-meta">
                  <span class="marketing-chip">${escapeHtml(type.audience || 'traffic')}</span>
                  <span class="marketing-chip">${escapeHtml(type.goal || 'conversion')}</span>
                  <span class="marketing-chip">${escapeHtml(language?.nativeLabel || language?.label || 'Русский')}</span>
                </div>
                <div class="referral-link-box">
                  <div class="referral-link-text">${escapeHtml(link?.url || '—')}</div>
                </div>
                <ul class="landing-scenario-points">
                  ${safeArray(type.bullets).map((item, index) => `<li>${escapeHtml(getLocalizedLandingBullet(type.id, index, language?.id, getLocalizedListValue(item, language?.id, '')))}</li>`).join('')}
                </ul>
                <div class="product-card-actions">
                  ${copyButtonMarkup(link?.url || '', 'Копировать ссылку')}
                  ${link?.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}
                  <button class="btn btn--ghost btn--sm landing-materials-btn" type="button" data-landing-id="${escapeHtml(type.id)}" data-language-id="${escapeHtml(language?.id || 'ru')}">Материалы</button>
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(title)}">QR</button>
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(title)}">Сократить</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  if ($('#landing-guidance')) {
    $('#landing-guidance').innerHTML = `
      <div class="overview-focus-grid">
        <article class="overview-card overview-card--primary">
          <span class="badge badge--gold">Текущий сценарий</span>
          <h4>${escapeHtml(getLocalizedCopy(landing?.titles, language?.id, landing?.title || 'Лендинг'))}</h4>
          <p>${escapeHtml(getLocalizedCopy(landing?.descriptions, language?.id, landing?.description || ''))}</p>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Язык: ${escapeHtml(language?.nativeLabel || language?.label || 'Русский')}</span>
            <span class="marketing-chip">Аудитория: ${escapeHtml(landing?.audience || 'traffic')}</span>
            <span class="marketing-chip">Фокус: ${escapeHtml(landing?.focus || 'landing')}</span>
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">Как использовать связку</div>
          </div>
          <div class="data-list">
            ${safeArray(library.guidance).map((item, index) => `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Рекомендация</div>
                  <div class="data-item-sub">${escapeHtml(getLocalizedGuidanceItem(index, language?.id, getLocalizedListValue(item, language?.id, '')))}</div>
                </div>
              </article>
            `).join('')}
          </div>
        </article>
      </div>
    `;
  }
}

function legacyRenderMaterialsPanel() {
  const ui = getLandingUiState();
  const promoCenter = getPromoCenter();
  if (!promoCenter || !ui) return;
  const { library, language, landing, link } = ui;
  const bundle = safeArray(promoCenter.bundles).find((item) => item.landingId === landing?.id) || null;
  const landingTitle = getLocalizedCopy(landing?.titles, language?.id, landing?.title || 'Лендинг');
  const landingLabel = getLocalizedCopy(landing?.labels, language?.id, landing?.id || 'landing');
  const localizedBundle = getLocalizedPromoBundle(bundle?.id, language?.id);
  const bundleTitle = localizedBundle?.title || getLocalizedCopy(bundle?.title, language?.id, 'Promo materials');
  const bundleDescription = localizedBundle?.description || getLocalizedCopy(bundle?.description, language?.id, 'Curated materials for the current landing and language.');
  if (bundle) {
    if (!bundle.__baseTitle) bundle.__baseTitle = bundle.title;
    if (!bundle.__baseDescription) bundle.__baseDescription = bundle.description;
    bundle.title = localizedBundle?.title || bundle.__baseTitle;
    bundle.description = localizedBundle?.description || bundle.__baseDescription;
  }

  if ($('#materials-categories')) {
    $('#materials-categories').innerHTML = `
      <div class="landing-toolbar">
        <div class="landing-toolbar__group">
          <span class="badge badge--accent">Рекламная связка</span>
          <div class="landing-language-switch">
            ${safeArray(library.types).map((item) => `
              <button class="landing-type-btn ${item.id === landing?.id ? 'is-active' : ''}" type="button" data-landing-id="${escapeHtml(item.id)}">${escapeHtml(getLocalizedCopy(item.labels, language?.id, item.id))}</button>
            `).join('')}
          </div>
        </div>
        <div class="landing-toolbar__summary">
          <span class="marketing-chip">Язык: ${escapeHtml(language?.nativeLabel || language?.label || 'Русский')}</span>
          <span class="marketing-chip">Лендинг: ${escapeHtml(landingLabel)}</span>
          <span class="marketing-chip">Ссылка готова: ${escapeHtml(link?.url ? 'да' : 'нет')}</span>
        </div>
      </div>
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(bundle?.title || 'Рекламные материалы')}</div>
            <small>${escapeHtml(bundle?.description || 'Подборка материалов под текущий лендинг и язык.')}</small>
          </div>
          <span class="badge badge--muted">${escapeHtml(landingTitle)}</span>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Стартовый набор</div>
              <div class="marketing-chip-list">
                ${safeArray(getLocalizedPromoBundle(bundle?.id, language?.id)?.launchKit || bundle?.launchKit || promoCenter.launchKit).map((item) => `<span class="marketing-chip">${escapeHtml(getLocalizedListValue(item, language?.id, ''))}</span>`).join('')}
              </div>
            </div>
          </article>
        </div>
        <div class="promo-material-grid">
          ${safeArray(bundle?.items).map((item) => {
            const content = fillPromoTemplate(getLocalizedPromoItem(item.id, language?.id)?.template || item.template, {
              landingUrl: link?.url || '',
              landingTitle,
              landingLabel,
              languageName: language?.nativeLabel || language?.label || 'Русский',
            });
            return `
              <article class="promo-material-card">
                <span class="badge badge--accent">${escapeHtml(item.channel || item.kind || 'material')}</span>
                <h4>${escapeHtml(getLocalizedPromoItem(item.id, language?.id)?.title || getLocalizedCopy(item.title, language?.id, item.id || 'material'))}</h4>
                <small>${escapeHtml(language?.nativeLabel || language?.label || 'Русский')} · ${escapeHtml(item.kind || 'material')}</small>
                <p>${escapeHtml(content)}</p>
                <div class="product-card-actions">
                  ${copyButtonMarkup(content, 'Копировать текст', 'share_referral')}
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(landingTitle)}">Сократить ссылку</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }

  if ($('#media-ideas')) {
    $('#media-ideas').innerHTML = `
      <div class="overview-focus-grid">
        <article class="overview-card">
          <span class="badge badge--muted">Что добавить в пакет</span>
          <div class="marketing-chip-list">
            ${safeArray(promoCenter.assetIdeas).map((item, index) => `<span class="marketing-chip">${escapeHtml(getLocalizedAssetIdea(index, language?.id, getLocalizedListValue(item, language?.id, '')))}</span>`).join('')}
          </div>
        </article>
        <article class="overview-card">
          <span class="badge badge--muted">Рабочая связка</span>
          <p>${escapeHtml(`Лендинг: ${landingTitle}. Язык: ${language?.nativeLabel || language?.label || 'Русский'}. Сначала даём страницу, затем сообщение, затем короткую ссылку или QR и только после интереса переводим в официальный контур компании.`)}</p>
          <div class="product-card-actions">
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Вернуться к лендингам</button>
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tools">Открыть инструменты</button>
          </div>
        </article>
      </div>
    `;
  }
}

function getLandingPanelCopy(languageId = 'ru') {
  if (languageId === 'ru') {
    return {
      landingLanguages: 'Язык лендингов',
      defaultLabel: 'По умолчанию',
      scenariosLabel: 'Сценариев',
      currentLanguage: 'Текущий язык',
      copyLink: 'Копировать ссылку',
      open: 'Открыть',
      materials: 'Материалы',
      currentScenario: 'Текущий сценарий',
      language: 'Язык',
      audience: 'Аудитория',
      focus: 'Фокус',
      howToUse: 'Как использовать связку',
      recommendation: 'Рекомендация',
      promoBundle: 'Рекламная связка',
      landing: 'Лендинг',
      linkReady: 'Ссылка готова',
      yes: 'да',
      no: 'нет',
      launchKit: 'Стартовый набор',
      copyText: 'Копировать текст',
      shortenLink: 'Сократить ссылку',
      packIdeas: 'Что добавить в пакет',
      workingBundle: 'Рабочая связка',
      workingBundleText: 'Сначала даём страницу, затем сообщение, затем короткую ссылку или QR, и только после интереса переводим человека в официальный контур компании.',
      dialogLadder: 'Лестница диалога',
      productAnchors: 'Продуктовые акценты',
      handoffSignals: 'Сигналы перевода дальше',
      objectionReply: 'Возражения и ответы',
      copyReply: 'Копировать ответ',
      promoMaterials: 'Рекламные материалы',
      promoMaterialsDescription: 'Подборка материалов под текущий лендинг и язык.',
      backToLandings: 'Вернуться к лендингам',
      openTools: 'Открыть инструменты',
    };
  }
  return {
    landingLanguages: 'Landing language',
    defaultLabel: 'Default',
    scenariosLabel: 'Scenarios',
    currentLanguage: 'Current language',
    copyLink: 'Copy link',
    open: 'Open',
    materials: 'Materials',
    currentScenario: 'Current scenario',
    language: 'Language',
    audience: 'Audience',
    focus: 'Focus',
    howToUse: 'How to use this setup',
    recommendation: 'Recommendation',
    promoBundle: 'Promotion bundle',
    landing: 'Landing',
    linkReady: 'Link ready',
    yes: 'yes',
    no: 'no',
    launchKit: 'Launch kit',
    copyText: 'Copy text',
    shortenLink: 'Shorten link',
    packIdeas: 'What to add to the pack',
    workingBundle: 'Working bundle',
    workingBundleText: 'Start with the page, then the message, then a short link or QR, and only after interest move the person into the official company flow.',
    dialogLadder: 'Conversation ladder',
    productAnchors: 'Product anchors',
    handoffSignals: 'Signals for the next step',
    objectionReply: 'Objections and replies',
    copyReply: 'Copy reply',
    promoMaterials: 'Promo materials',
    promoMaterialsDescription: 'Curated materials for the current landing and language.',
    backToLandings: 'Back to landings',
    openTools: 'Open tools',
  };
}

function renderLandingsPanel() {
  const ui = getLandingUiState();
  if (!ui) return;
  const { library, workspace, language, landing } = ui;
  const panelCopy = getLandingPanelCopy(language?.id);
  const defaultLanguage = safeArray(library.languages).find((item) => item.id === library.defaultLanguage) || language;
  const languageName = language?.nativeLabel || language?.label || 'RU';

  if ($('#landing-library')) {
    $('#landing-library').innerHTML = `
      <div class="landing-toolbar">
        <div class="landing-toolbar__group">
          <span class="badge badge--accent">${escapeHtml(panelCopy.landingLanguages)}</span>
          <div class="landing-language-switch">
            ${safeArray(library.languages).map((item) => `
              <button class="landing-language-btn ${item.id === language?.id ? 'is-active' : ''}" type="button" data-language-id="${escapeHtml(item.id)}">${escapeHtml(item.nativeLabel || item.label || item.id)}</button>
            `).join('')}
          </div>
        </div>
        <div class="landing-toolbar__summary">
          <span class="marketing-chip">${escapeHtml(panelCopy.defaultLabel)}: ${escapeHtml(defaultLanguage?.nativeLabel || defaultLanguage?.label || 'RU')}</span>
          <span class="marketing-chip">${escapeHtml(panelCopy.scenariosLabel)}: ${escapeHtml(String(safeArray(library.types).length))}</span>
          <span class="marketing-chip">${escapeHtml(panelCopy.currentLanguage)}: ${escapeHtml(languageName)}</span>
        </div>
      </div>
      <div class="landing-scenario-grid">
        ${safeArray(library.types).map((type) => {
          const link = safeArray(workspace.landingLinks).find((item) => item.landingId === type.id && item.language === language?.id);
          const title = getLocalizedCopy(type.titles, language?.id, type.title || type.id);
          const description = getLocalizedCopy(type.descriptions, language?.id, type.description || '');
          const label = getLocalizedCopy(type.labels, language?.id, type.id);
          return `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(type.icon || '🌐')} ${escapeHtml(title)}</div>
                  <small>${escapeHtml(description)}</small>
                </div>
                <span class="badge ${type.id === landing?.id ? 'badge--accent' : 'badge--muted'}">${escapeHtml(label)}</span>
              </div>
              <div class="landing-scenario-card">
                <div class="landing-scenario-meta">
                  <span class="marketing-chip">${escapeHtml(type.audience || 'traffic')}</span>
                  <span class="marketing-chip">${escapeHtml(type.goal || 'conversion')}</span>
                  <span class="marketing-chip">${escapeHtml(languageName)}</span>
                </div>
                <div class="referral-link-box">
                  <div class="referral-link-text">${escapeHtml(link?.url || '—')}</div>
                </div>
                <ul class="landing-scenario-points">
                  ${safeArray(type.bullets).map((item, index) => `<li>${escapeHtml(getLocalizedLandingBullet(type.id, index, language?.id, getLocalizedListValue(item, language?.id, '')))}</li>`).join('')}
                </ul>
                <div class="product-card-actions">
                  ${copyButtonMarkup(link?.url || '', panelCopy.copyLink)}
                  ${link?.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${escapeHtml(panelCopy.open)}</a>` : ''}
                  <button class="btn btn--ghost btn--sm landing-materials-btn" type="button" data-landing-id="${escapeHtml(type.id)}" data-language-id="${escapeHtml(language?.id || 'ru')}">${escapeHtml(panelCopy.materials)}</button>
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(title)}">QR</button>
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(title)}">${escapeHtml(panelCopy.shortenLink)}</button>
                </div>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  if ($('#landing-guidance')) {
    $('#landing-guidance').innerHTML = `
      <div class="overview-focus-grid">
        <article class="overview-card overview-card--primary">
          <span class="badge badge--gold">${escapeHtml(panelCopy.currentScenario)}</span>
          <h4>${escapeHtml(getLocalizedCopy(landing?.titles, language?.id, landing?.title || panelCopy.landing))}</h4>
          <p>${escapeHtml(getLocalizedCopy(landing?.descriptions, language?.id, landing?.description || ''))}</p>
          <div class="marketing-chip-list">
            <span class="marketing-chip">${escapeHtml(panelCopy.language)}: ${escapeHtml(languageName)}</span>
            <span class="marketing-chip">${escapeHtml(panelCopy.audience)}: ${escapeHtml(landing?.audience || 'traffic')}</span>
            <span class="marketing-chip">${escapeHtml(panelCopy.focus)}: ${escapeHtml(landing?.focus || 'landing')}</span>
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">${escapeHtml(panelCopy.howToUse)}</div>
          </div>
          <div class="data-list">
            ${safeArray(library.guidance).map((item, index) => `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">${escapeHtml(panelCopy.recommendation)}</div>
                  <div class="data-item-sub">${escapeHtml(getLocalizedGuidanceItem(index, language?.id, getLocalizedListValue(item, language?.id, '')))}</div>
                </div>
              </article>
            `).join('')}
          </div>
        </article>
      </div>
    `;
  }
}

function renderMaterialsPanel() {
  const ui = getLandingUiState();
  const promoCenter = getPromoCenter();
  const mediaCenter = getMediaCenter();
  if (!promoCenter || !ui) return;
  const learningCenter = getLearningCenter();
  const { library, language, landing, link } = ui;
  const panelCopy = getLandingPanelCopy(language?.id);
  const bundle = safeArray(promoCenter.bundles).find((item) => item.landingId === landing?.id) || null;
  const landingTitle = getLocalizedCopy(landing?.titles, language?.id, landing?.title || panelCopy.landing);
  const landingLabel = getLocalizedCopy(landing?.labels, language?.id, landing?.id || 'landing');
  const languageName = language?.nativeLabel || language?.label || 'RU';
  const localizedBundle = getLocalizedPromoBundle(bundle?.id, language?.id);
  const bundleTitle = localizedBundle?.title || getLocalizedCopy(bundle?.title, language?.id, panelCopy.promoMaterials);
  const bundleDescription = localizedBundle?.description || getLocalizedCopy(bundle?.description, language?.id, panelCopy.promoMaterialsDescription);
  const currentScenario = safeArray(learningCenter?.scenarios).find((item) => item.id === landing?.id) || null;
  const currentPack = safeArray(mediaCenter?.packs).find((item) => item.landingId === landing?.id) || null;
  const workspace = getWorkspace();
  const companyUrl = workspace?.companyCatalogLink || workspace?.companyReferralLink || mediaCenter?.defaultCompanyUrl || state.site?.links?.companyCatalog || state.site?.links?.companyMain || '';
  const packVisualAssets = getPackVisualAssets(currentPack);
  const currentPackHeroAsset = getPackCoverAsset(currentPack);
  const shortLink = findShortLinkForUrl(link?.url || workspace?.siteReferralLink || '');
  const primaryCampaignRuntimes = getReferralCampaignPresets()
    .filter((item) => item.landingId === landing?.id)
    .map((item) => buildCampaignRuntime(item, {
      landingId: landing?.id,
      languageId: language?.id,
    }))
    .filter(Boolean);
  const sharePackRuntimes = (primaryCampaignRuntimes.length
    ? primaryCampaignRuntimes
    : getReferralCampaignPresets()
      .slice(0, 2)
      .map((item) => buildCampaignRuntime(item, {
        landingId: landing?.id,
        languageId: language?.id,
      }))
      .filter(Boolean))
    .slice(0, 2);

  if ($('#materials-categories')) {
    $('#materials-categories').innerHTML = `
      <div class="landing-toolbar">
        <div class="landing-toolbar__group">
          <span class="badge badge--accent">${escapeHtml(panelCopy.promoBundle)}</span>
          <div class="landing-language-switch">
            ${safeArray(library.types).map((item) => `
              <button class="landing-type-btn ${item.id === landing?.id ? 'is-active' : ''}" type="button" data-landing-id="${escapeHtml(item.id)}">${escapeHtml(getLocalizedCopy(item.labels, language?.id, item.id))}</button>
            `).join('')}
          </div>
        </div>
        <div class="landing-toolbar__summary">
          <span class="marketing-chip">${escapeHtml(panelCopy.language)}: ${escapeHtml(languageName)}</span>
          <span class="marketing-chip">${escapeHtml(panelCopy.landing)}: ${escapeHtml(landingLabel)}</span>
          <span class="marketing-chip">${escapeHtml(panelCopy.linkReady)}: ${escapeHtml(link?.url ? panelCopy.yes : panelCopy.no)}</span>
        </div>
      </div>
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(bundleTitle)}</div>
            <small>${escapeHtml(bundleDescription)}</small>
          </div>
          <span class="badge badge--muted">${escapeHtml(landingTitle)}</span>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">${escapeHtml(panelCopy.launchKit)}</div>
              <div class="marketing-chip-list">
                ${safeArray(getLocalizedPromoBundle(bundle?.id, language?.id)?.launchKit || bundle?.launchKit || promoCenter.launchKit).map((item) => `<span class="marketing-chip">${escapeHtml(getLocalizedListValue(item, language?.id, ''))}</span>`).join('')}
              </div>
            </div>
          </article>
        </div>
        <div class="promo-material-grid">
          ${safeArray(bundle?.items).map((item) => {
            const content = fillPromoTemplate(getLocalizedPromoItem(item.id, language?.id)?.template || item.template, {
              landingUrl: link?.url || '',
              landingTitle,
              landingLabel,
              languageName,
            });
            return `
              <article class="promo-material-card">
                <span class="badge badge--accent">${escapeHtml(item.channel || item.kind || 'material')}</span>
                <h4>${escapeHtml(getLocalizedPromoItem(item.id, language?.id)?.title || getLocalizedCopy(item.title, language?.id, item.id || 'material'))}</h4>
                <small>${escapeHtml(languageName)} · ${escapeHtml(item.kind || 'material')}</small>
                <p>${escapeHtml(content)}</p>
                <div class="product-card-actions">
                  ${copyButtonMarkup(content, panelCopy.copyText, 'share_referral')}
                  <button class="btn btn--ghost btn--sm landing-tool-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(link?.url || '')}" data-tool-title="${escapeHtml(landingTitle)}">${escapeHtml(panelCopy.shortenLink)}</button>
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </article>
    `;
  }

  if ($('#media-ideas')) {
    $('#media-ideas').innerHTML = `
      <div class="dashboard-stack">
        <div class="overview-focus-grid">
          <article class="overview-card">
            <span class="badge badge--muted">${escapeHtml(panelCopy.packIdeas)}</span>
            <div class="marketing-chip-list">
              ${safeArray(promoCenter.assetIdeas).map((item, index) => `<span class="marketing-chip">${escapeHtml(getLocalizedAssetIdea(index, language?.id, getLocalizedListValue(item, language?.id, '')))}</span>`).join('')}
            </div>
          </article>
          <article class="overview-card">
            <span class="badge badge--muted">${escapeHtml(panelCopy.workingBundle)}</span>
            <p>${escapeHtml(`${panelCopy.landing}: ${landingTitle}. ${panelCopy.language}: ${languageName}. ${panelCopy.workingBundleText}`)}</p>
            <div class="product-card-actions">
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">${escapeHtml(panelCopy.backToLandings)}</button>
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tools">${escapeHtml(panelCopy.openTools)}</button>
            </div>
          </article>
        </div>
        ${currentScenario ? `
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(panelCopy.dialogLadder)}</div>
                  <small>${escapeHtml(currentScenario.title || landingTitle)}</small>
                </div>
              </div>
              <div class="data-list">
                ${safeArray(currentScenario.ladder).map((item, index) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Этап ${index + 1}</div>
                      <div class="data-item-sub">${escapeHtml(item)}</div>
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(panelCopy.productAnchors)}</div>
                  <small>${escapeHtml(panelCopy.handoffSignals)}</small>
                </div>
              </div>
              <div class="marketing-chip-list">
                ${safeArray(currentScenario.anchors).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
              <div class="data-list">
                ${safeArray(currentScenario.signals).map((item) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Сигнал</div>
                      <div class="data-item-sub">${escapeHtml(item)}</div>
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
          </div>
          ${safeArray(currentScenario.objections).length ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(panelCopy.objectionReply)}</div>
                  <small>Готовые формулировки под текущий сценарий</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${safeArray(currentScenario.objections).map((item) => `
                  <article class="promo-material-card">
                    <span class="badge badge--muted">${escapeHtml(panelCopy.objectionReply)}</span>
                    <h4>${escapeHtml(item.title || 'Ответ')}</h4>
                    <p>${escapeHtml(item.text || '')}</p>
                    <div class="product-card-actions">
                      ${copyButtonMarkup(item.text || '', panelCopy.copyReply, 'objection_reply')}
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
          ` : ''}
        ` : ''}
      </div>
    `;
  }

  if ($('#materials-product-packs')) {
    const packProducts = safeArray(currentPack?.productIds).map((id) => getProductById(id)).filter(Boolean);
    const packContentItems = safeArray(currentPack?.contentIds).map((id) => getContentHubItemById(id)).filter(Boolean);
    const packMessages = safeArray(currentPack?.messages).map((item) => ({
      ...item,
      text: fillPromoTemplate(item.template, {
        landingUrl: link?.url || workspace?.siteReferralLink || '',
        landingTitle,
        landingLabel,
        languageName,
        companyUrl,
      }),
    }));
    const launchBundleText = buildLaunchBundleText(currentPack, {
      landingTitle,
      languageName,
      landingUrl: link?.url || workspace?.siteReferralLink || '',
      shortUrl: shortLink?.shortUrl || '',
      companyUrl,
      referralCode: workspace?.referralCode || '',
      products: packProducts,
      contentItems: packContentItems,
      messages: packMessages,
    });
    $('#materials-product-packs').innerHTML = currentPack
      ? `
        <div class="dashboard-stack">
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">${escapeHtml(currentPack.title || 'Пакет материалов')}</div>
                <small>${escapeHtml(currentPack.audience || languageName)}</small>
              </div>
              <span class="badge badge--accent">${escapeHtml(landingTitle)}</span>
            </div>
            <div class="media-pack-hero">
              ${currentPackHeroAsset?.imageUrl ? `
                <div class="material-asset-thumb media-pack-hero__media">
                  <img src="${escapeHtml(currentPackHeroAsset.imageUrl)}" alt="${escapeHtml(currentPackHeroAsset.title || currentPack.title || 'pack')}" loading="lazy">
                </div>
              ` : ''}
              <div class="media-pack-hero__body">
                <p>${escapeHtml(currentPack.summary || '')}</p>
                <div class="marketing-chip-list">
                  ${safeArray(currentPack.assetChecklist).slice(0, 4).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
                </div>
              </div>
            </div>
            <div class="data-list">
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Задача пакета</div>
                  <div class="data-item-sub">${escapeHtml(currentPack.objective || 'Собрать понятный стартовый комплект под текущий сценарий.')}</div>
                </div>
              </article>
            </div>
            <div class="marketing-chip-list">
              ${safeArray(currentPack.assetChecklist).slice(4).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
          </article>
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Пошаговый запуск</div>
                  <small>Как использовать пакет без перегруза</small>
                </div>
              </div>
              <div class="data-list">
                ${safeArray(currentPack.launchSteps).map((item, index) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Шаг ${index + 1}</div>
                      <div class="data-item-sub">${escapeHtml(item)}</div>
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Углы подачи</div>
                  <small>Что именно подсвечивать в диалоге и креативах</small>
                </div>
              </div>
              <div class="marketing-chip-list">
                ${safeArray(currentPack.hooks).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Открыть лендинги</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tools">Собрать short link / QR</button>
              </div>
            </article>
          </div>
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">Готовые сообщения</div>
                <small>Тексты можно копировать и адаптировать под площадку</small>
              </div>
            </div>
            <div class="promo-material-grid">
              ${packMessages.map((item) => `
                <article class="promo-material-card">
                  <span class="badge badge--accent">${escapeHtml(item.channel || 'message')}</span>
                  <h4>${escapeHtml(item.title || 'Сообщение')}</h4>
                  <p>${escapeHtml(item.text || '')}</p>
                  <div class="product-card-actions">
                    ${copyButtonMarkup(item.text || '', 'Копировать текст', 'share_referral')}
                  </div>
                </article>
              `).join('')}
            </div>
          </article>
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Рекомендуемые продукты</div>
                  <small>Продуктовые опоры под текущий сценарий</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${packProducts.length
                  ? packProducts.map((product) => `
                    <article class="promo-material-card">
                      <span class="badge badge--muted">${escapeHtml(product.category || 'Продукт')}</span>
                      <h4>${escapeHtml(product.title)}</h4>
                      ${getProductImage(product) ? `<div class="material-asset-thumb"><img src="${escapeHtml(getProductImage(product))}" alt="${escapeHtml(product.title || 'product')}" loading="lazy"></div>` : ''}
                      <small>${escapeHtml(product.priceLabel || product.format || 'Каталог')}</small>
                      <p>${escapeHtml(product.shortDescription || product.story || '')}</p>
                      <div class="marketing-chip-list">
                        ${safeArray(product.useCases).slice(0, 3).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
                      </div>
                      <div class="product-card-actions">
                        <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="products">Открыть каталог</button>
                        ${companyUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">В компанию</a>` : ''}
                      </div>
                    </article>
                  `).join('')
                  : `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">Под этот сценарий продукты ещё не подобраны.</div></div></article>`}
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Опорные материалы</div>
                  <small>Что лучше отправлять вместе с текущим сценарием</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${packContentItems.length
                  ? packContentItems.map((item) => `
                    <article class="promo-material-card">
                      <span class="badge badge--muted">${escapeHtml(item.type || 'Материал')}</span>
                      <h4>${escapeHtml(item.title || 'Материал')}</h4>
                      ${item.imageUrl ? `<div class="material-asset-thumb"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || 'content')}" loading="lazy"></div>` : ''}
                      <p>${escapeHtml(item.description || '')}</p>
                      <div class="product-card-actions">
                        ${item.url ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}
                        ${item.url ? copyButtonMarkup(item.url, 'Копировать ссылку', 'copy_referral') : ''}
                      </div>
                    </article>
                  `).join('')
                  : `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">Ссылки на дополнительные материалы появятся, когда в системе будет доступен полный набор company links.</div></div></article>`}
              </div>
            </article>
          </div>
        </div>
      `
      : emptyState('Пакет под текущий сценарий появится после выбора лендинга и загрузки медиатеки.');

    if ($('#materials-launch-bundle')) {
      $('#materials-launch-bundle').innerHTML = currentPack
        ? `
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">Готовый комплект для отправки и запуска</div>
                <small>${escapeHtml(currentPack.title || landingTitle)}</small>
              </div>
              <span class="badge badge--gold">${escapeHtml(languageName)}</span>
            </div>
            <div class="material-bundle-preview">${escapeHtml(launchBundleText)}</div>
            <div class="marketing-chip-list">
              ${safeArray(mediaCenter?.launchBundleSchema).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
            <div class="product-card-actions">
              ${copyButtonMarkup(launchBundleText, 'Копировать стартовый набор', 'share_referral')}
              ${copyButtonMarkup(link?.url || workspace?.siteReferralLink || '', 'Копировать главную ссылку', 'copy_referral')}
              ${shortLink?.shortUrl ? copyButtonMarkup(shortLink.shortUrl, 'Копировать short link', 'copy_referral') : ''}
              ${companyUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">Открыть компанию</a>` : ''}
            </div>
          </article>
        `
        : emptyState('Стартовый набор появится после выбора пакета и загрузки ссылок.');
    }

    if ($('#materials-share-pack')) {
      $('#materials-share-pack').innerHTML = sharePackRuntimes.length
        ? `<div class="campaign-grid">${sharePackRuntimes.map((runtime) => buildCampaignCardMarkup(runtime, {
          panel: 'materials',
          showTexts: true,
        })).join('')}</div>`
        : emptyState(panelCopy.noCampaigns);
    }

    if ($('#materials-asset-gallery')) {
      $('#materials-asset-gallery').innerHTML = packVisualAssets.length
        ? `
          <div class="promo-material-grid">
            ${packVisualAssets.map((item) => `
              <article class="promo-material-card">
                <div class="material-asset-thumb">
                  <img src="${escapeHtml(item.imageUrl || '')}" alt="${escapeHtml(item.title || 'Asset')}" loading="lazy">
                </div>
                <span class="badge badge--muted">${escapeHtml(item.purpose || item.id || 'asset')}</span>
                <h4>${escapeHtml(item.title || 'Визуал')}</h4>
                <p>${escapeHtml(item.note || item.description || '')}</p>
                <div class="product-card-actions">
                  ${item.imageUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.imageUrl)}" target="_blank" rel="noopener">Открыть</a>` : ''}
                </div>
              </article>
            `).join('')}
          </div>
        `
        : emptyState('Визуальные ассеты появятся после загрузки пакета.');
    }
  }
}

function renderToolsPanel() {
  const arsenal = getArsenalSuite();
  if (!arsenal) return;
  const context = getToolContextDefaults();
  const languageId = getCurrentLandingWorkspace().language?.id || state.landingPreferences.language || 'ru';
  const currentShortLink = findShortLinkForUrl(context.url);
  const utmBuilderResult = state.toolResults.utmBuilder;
  const toolCatalog = getToolCatalog();
  const activeTool = getToolViewDefinition();
  const bridgeTools = safeArray(arsenal.bridgeTools);
  const advancedPdfTool = bridgeTools.find((item) => item.id === 'pdf-advanced') || null;
  const videoBridgeTool = bridgeTools.find((item) => item.id === 'video') || null;
  syncStandaloneToolDefaults();

  if ($('#tools-studio-nav')) {
    $('#tools-studio-nav').innerHTML = buildToolsNavMarkup(toolCatalog);
  }

  if ($('#tools-workspace-head')) {
    $('#tools-workspace-head').innerHTML = buildToolsWorkspaceHeadMarkup(activeTool, context, currentShortLink);
  }

  if ($('#tools-native-grid')) {
    $('#tools-native-grid').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card tool-context-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Быстрый запуск инструментов</div>
              <small>${escapeHtml(context.title)} · ${escapeHtml(context.languageName)}</small>
            </div>
            <span class="badge badge--accent">${escapeHtml(context.url ? 'ссылка готова' : 'нужна ссылка')}</span>
          </div>
          <p>${escapeHtml(context.url ? 'Текущий лендинг уже можно сокращать, превращать в QR и использовать в хештегах и AI-тексте.' : 'Сначала выберите лендинг или вставьте полную ссылку вручную, после этого инструменты будут работать как единый комплект.')}</p>
          ${context.url ? `<div class="referral-link-box"><div class="referral-link-text">${escapeHtml(context.url)}</div></div>` : ''}
          <div class="marketing-chip-list">
            <span class="marketing-chip">Landing: ${escapeHtml(context.title)}</span>
            <span class="marketing-chip">Язык: ${escapeHtml(context.languageName)}</span>
            <span class="marketing-chip">Short: ${escapeHtml(currentShortLink?.shortUrl ? 'есть' : 'нет')}</span>
          </div>
          <div class="product-card-actions">
            <button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="short">Сократить</button>
            <button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="qr">QR</button>
            <button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="hashtags">Хештеги</button>
            <button class="btn btn--ghost btn--sm native-tool-open-btn" type="button" data-tool-open-kind="caption">AI-текст</button>
          </div>
        </article>
        <div class="promo-material-grid">
        ${safeArray(arsenal.nativeTools).map((item) => `
          <article class="promo-material-card">
            <span class="badge badge--muted">Встроено</span>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.description || '')}</p>
            <div class="marketing-chip-list">
              <span class="marketing-chip">${escapeHtml(context.title)}</span>
              <span class="marketing-chip">${escapeHtml(context.languageName)}</span>
            </div>
            <div class="product-card-actions">
              <button class="btn btn--primary btn--sm native-tool-open-btn" type="button" data-tool-open-kind="${escapeHtml(item.id === 'shortener' ? 'short' : item.id)}">${escapeHtml(item.actionLabel || 'Открыть')}</button>
              ${context.url && (item.id === 'shortener' || item.id === 'qr') ? copyButtonMarkup(context.url, 'Копировать ссылку', 'copy_referral') : ''}
            </div>
          </article>
        `).join('')}
        </div>
      </div>
    `;
  }

  if ($('#tools-workflows-grid')) {
    $('#tools-workflows-grid').innerHTML = buildToolsWorkflowMarkup(context, currentShortLink);
  }

  if ($('#utm-preset-select')) {
    const currentPresetValue = String($('#utm-preset-select').value || utmBuilderResult?.presetId || '').trim();
    $('#utm-preset-select').innerHTML = `
      <option value="">Ручная настройка</option>
      ${getReferralCampaignPresets().map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title || item.id)}</option>`).join('')}
    `;
    $('#utm-preset-select').value = currentPresetValue;
  }

  if ($('#utm-builder-result')) {
    const utmShortLink = utmBuilderResult?.shortLink || findShortLinkForUrl(utmBuilderResult?.finalUrl || '');
    $('#utm-builder-result').innerHTML = utmBuilderResult
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Tracked link готов</div>
              <small>${escapeHtml(utmBuilderResult.title || context.title)}</small>
            </div>
            <span class="badge badge--accent">${escapeHtml((utmBuilderResult.fields?.utm_medium || 'referral').toUpperCase())}</span>
          </div>
          <div class="referral-link-box">
            <div class="referral-link-text">${escapeHtml(utmBuilderResult.finalUrl || '')}</div>
          </div>
          <div class="marketing-chip-list">
            ${utmBuilderResult.fields?.utm_source ? `<span class="marketing-chip">source: ${escapeHtml(utmBuilderResult.fields.utm_source)}</span>` : ''}
            ${utmBuilderResult.fields?.utm_medium ? `<span class="marketing-chip">medium: ${escapeHtml(utmBuilderResult.fields.utm_medium)}</span>` : ''}
            ${utmBuilderResult.fields?.utm_campaign ? `<span class="marketing-chip">campaign: ${escapeHtml(utmBuilderResult.fields.utm_campaign)}</span>` : ''}
            ${utmBuilderResult.fields?.utm_content ? `<span class="marketing-chip">content: ${escapeHtml(utmBuilderResult.fields.utm_content)}</span>` : ''}
            ${utmBuilderResult.fields?.utm_term ? `<span class="marketing-chip">term: ${escapeHtml(utmBuilderResult.fields.utm_term)}</span>` : ''}
            ${utmShortLink?.shortUrl ? `<span class="marketing-chip">short: готов</span>` : ''}
          </div>
          <div class="product-card-actions">
            ${copyButtonMarkup(utmBuilderResult.finalUrl || '', 'Копировать tracked link', 'copy_referral')}
            <a class="btn btn--ghost btn--sm" href="${escapeHtml(utmBuilderResult.finalUrl || '#')}" target="_blank" rel="noopener">Открыть</a>
            <button class="btn btn--ghost btn--sm tool-prefill-url-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(utmBuilderResult.finalUrl || '')}" data-tool-title="${escapeHtml(utmBuilderResult.title || context.title)}">В shortener</button>
            <button class="btn btn--ghost btn--sm tool-prefill-url-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(utmBuilderResult.finalUrl || '')}" data-tool-title="${escapeHtml(utmBuilderResult.title || context.title)}">В QR</button>
          </div>
          ${utmBuilderResult.shareLinks?.length ? `
            <div class="campaign-share-row">
              ${utmBuilderResult.shareLinks.map((item) => `
                <a class="btn btn--ghost btn--sm" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener">${escapeHtml(item.label || item.channel || 'Share')}</a>
              `).join('')}
            </div>
          ` : ''}
          ${utmShortLink?.shortUrl ? `
            <div class="data-list">
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Короткая ссылка для этого tracked link уже есть</div>
                  <div class="data-item-sub">${escapeHtml(utmShortLink.shortUrl)}</div>
                </div>
                <div class="product-card-actions">
                  ${copyButtonMarkup(utmShortLink.shortUrl, 'Копировать short link', 'copy_referral')}
                </div>
              </article>
            </div>
          ` : ''}
        </article>
      `
      : emptyState('UTM Builder соберёт tracked link под конкретный канал, язык и кампанию, после чего его можно сразу передать в shortener и QR.');
  }

  renderShortLinksList('#tools-short-links');

  if ($('#qr-result')) {
    $('#qr-result').innerHTML = state.toolResults.qr
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">QR готов</div>
            <small>${escapeHtml(state.toolResults.qr.provider || 'local')}</small>
          </div>
          <div class="tool-result tool-result--qr">
            <img src="${escapeHtml(state.toolResults.qr.dataUrl)}" alt="QR code">
            <div class="product-card-actions">
              ${copyButtonMarkup(state.toolResults.qr.url)}
              <a class="btn btn--ghost btn--sm" href="${escapeHtml(state.toolResults.qr.dataUrl)}" download="golden-connect-qr.png">Скачать PNG</a>
            </div>
          </div>
        </article>
      `
      : '';
  }

  if ($('#hashtags-result')) {
    $('#hashtags-result').innerHTML = state.toolResults.hashtags.length
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div class="data-card-title">Подборка хештегов</div>
          </div>
          <div class="marketing-chip-list">
            ${state.toolResults.hashtags.map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="product-card-actions">
            ${copyButtonMarkup(state.toolResults.hashtags.join(' '), 'Копировать всё', 'share_referral')}
          </div>
        </article>
      `
      : '';
  }

  if ($('#caption-result')) {
    const captionCtaValue = String(document.querySelector('#caption-form [name="cta"]')?.value || '').trim();
    const trackedUrl = getPreferredToolUrl(context);
    $('#caption-result').innerHTML = state.toolResults.captions.length
      ? `
        <div class="promo-material-grid">
          ${state.toolResults.captions.map((item, index) => `
            <article class="promo-material-card">
              <span class="badge badge--accent">AI-текст</span>
              <p>${escapeHtml(item.caption || '')}</p>
              <div class="product-card-actions">
                ${copyButtonMarkup(item.caption || '', 'Копировать текст', 'share_referral')}
              </div>
              ${index === 0 ? `
                <div class="data-list">
                  ${buildCaptionPublishingPack(item, {
                    context,
                    url: trackedUrl,
                    hashtags: state.toolResults.hashtags,
                    cta: captionCtaValue,
                  }).map((pack) => `
                    <article class="data-item">
                      <div class="data-item-main">
                        <div class="data-item-title">${escapeHtml(pack.title)}</div>
                        <div class="data-item-sub">${escapeHtml(truncateText(pack.text || '', 180))}</div>
                      </div>
                      <div class="product-card-actions">
                        ${copyButtonMarkup(pack.text || '', 'Копировать', 'share_referral')}
                      </div>
                    </article>
                  `).join('')}
                </div>
              ` : ''}
            </article>
          `).join('')}
        </div>
      `
      : '';
  }

  if ($('#bio-hub-result')) {
    const bioHub = state.toolResults.bioHub;
    $('#bio-hub-result').innerHTML = bioHub
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Персональный Bio Hub</div>
              <small>${escapeHtml(bioHub.landingTitle || context.title)} · ${escapeHtml(bioHub.languageName || context.languageName)}</small>
            </div>
            <span class="badge badge--accent">на нашем домене</span>
          </div>
          <p>${escapeHtml(bioHub.summary || 'Персональная мультиссылка уже собрана и ведёт в ваш рабочий контур Golden Connect.')}</p>
          <div class="referral-link-box"><div class="referral-link-text">${escapeHtml(bioHub.url || '')}</div></div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Landing: ${escapeHtml(bioHub.landingTitle || context.title)}</span>
            <span class="marketing-chip">Язык: ${escapeHtml(bioHub.languageName || context.languageName)}</span>
            <span class="marketing-chip">ref: ${escapeHtml(context.referralCode || '')}</span>
          </div>
          <div class="product-card-actions">
            ${copyButtonMarkup(bioHub.url || '', 'Копировать Bio Hub', 'copy_referral')}
            <a class="btn btn--primary btn--sm" href="${escapeHtml(bioHub.url || '#')}" target="_blank" rel="noopener">Открыть</a>
            ${bioHub.registerUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(bioHub.registerUrl)}" target="_blank" rel="noopener">Регистрация</a>` : ''}
            ${bioHub.companyUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(bioHub.companyUrl)}" target="_blank" rel="noopener">Компания</a>` : ''}
          </div>
        </article>
      `
      : emptyState('Соберите персональную мультиссылку, чтобы дать человеку один удобный вход в лендинг, кабинет и официальный контур компании.');
  }

  if ($('#social-kit-result')) {
    const socialKit = state.toolResults.socialKit;
    $('#social-kit-result').innerHTML = socialKit?.items?.length
      ? `
        <div class="promo-material-grid">
          ${socialKit.items.map((item) => `
            <article class="promo-material-card">
              <div class="tool-asset-thumb">
                <img src="${escapeHtml(item.dataUrl || '')}" alt="${escapeHtml(item.title || 'Social asset')}">
              </div>
              <span class="badge badge--muted">${escapeHtml(item.width)} × ${escapeHtml(item.height)}</span>
              <h4>${escapeHtml(item.title || 'Social asset')}</h4>
              <p>Готовый размер для соцсетей, собранный прямо в кабинете.</p>
              <div class="product-card-actions">
                <a class="btn btn--primary btn--sm" href="${escapeHtml(item.dataUrl || '')}" download="${escapeHtml(item.fileName || 'social-kit.png')}">Скачать</a>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('Загрузите одно изображение, и кабинет подготовит комплект под Instagram, Facebook, X и LinkedIn.');
  }

  if ($('#image-studio-result')) {
    const imageStudio = state.toolResults.imageStudio;
    $('#image-studio-result').innerHTML = imageStudio
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Изображение готово</div>
              <small>${escapeHtml(String(imageStudio.format || '').toUpperCase())} · ${escapeHtml(imageStudio.width)} × ${escapeHtml(imageStudio.height)}</small>
            </div>
          </div>
          <div class="tool-asset-thumb tool-asset-thumb--large">
            <img src="${escapeHtml(imageStudio.dataUrl || '')}" alt="Image Studio result">
          </div>
          <div class="product-card-actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(imageStudio.dataUrl || '')}" download="${escapeHtml(imageStudio.fileName || 'image-studio.png')}">Скачать</a>
          </div>
        </article>
      `
      : emptyState('Image Studio подготовит локальную копию изображения в нужном размере и формате.');
  }

  if ($('#remove-bg-result')) {
    const removeBg = state.toolResults.removeBg;
    $('#remove-bg-result').innerHTML = removeBg
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Фон удалён</div>
              <small>Чувствительность: ${escapeHtml(removeBg.threshold)}</small>
            </div>
          </div>
          <div class="tool-preview-grid tool-preview-grid--two">
            <div class="tool-preview-card">
              <strong>Оригинал</strong>
              <div class="tool-asset-thumb"><img src="${escapeHtml(removeBg.originalDataUrl || '')}" alt="Original"></div>
            </div>
            <div class="tool-preview-card">
              <strong>PNG без фона</strong>
              <div class="tool-asset-thumb tool-asset-thumb--checker"><img src="${escapeHtml(removeBg.resultDataUrl || '')}" alt="No background"></div>
            </div>
          </div>
          <div class="product-card-actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(removeBg.resultDataUrl || '')}" download="${escapeHtml(removeBg.fileName || 'golden-connect-nobg.png')}">Скачать PNG</a>
          </div>
        </article>
      `
      : emptyState('Загрузите изображение с относительно ровным фоном, и кабинет попробует собрать PNG без задника.');
  }

  if ($('#og-generator-result')) {
    const ogImage = state.toolResults.ogImage;
    $('#og-generator-result').innerHTML = ogImage
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">OG-обложка готова</div>
              <small>1200 × 630 · ${escapeHtml(context.languageName)}</small>
            </div>
          </div>
          <div class="tool-asset-thumb tool-asset-thumb--large">
            <img src="${escapeHtml(ogImage.pngDataUrl || ogImage.svgDataUrl || '')}" alt="${escapeHtml(ogImage.title || 'OG Image')}">
          </div>
          <div class="product-card-actions">
            <a class="btn btn--primary btn--sm" href="${escapeHtml(ogImage.pngDataUrl || '')}" download="${escapeHtml(buildFileName(ogImage.fileNameBase || 'golden-connect-og', 'png'))}">Скачать PNG</a>
            <a class="btn btn--ghost btn--sm" href="${escapeHtml(ogImage.svgDataUrl || '')}" download="${escapeHtml(buildFileName(ogImage.fileNameBase || 'golden-connect-og', 'svg'))}">Скачать SVG</a>
          </div>
        </article>
      `
      : emptyState('OG Image соберёт готовую обложку для лендингов, ссылок и социальных превью на базе текущего сценария.');
  }

  if ($('#banner-studio-result')) {
    const bannerStudio = state.toolResults.bannerStudio;
    $('#banner-studio-result').innerHTML = bannerStudio?.items?.length
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Баннер-пак готов</div>
              <small>${escapeHtml(bannerStudio.items.length)} креативов</small>
            </div>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Пакет: ${escapeHtml(bannerStudio.sizePack || 'all')}</span>
            <span class="marketing-chip">Стиль: ${escapeHtml(bannerStudio.styleId || 'all')}</span>
            <span class="marketing-chip">Link: ${escapeHtml(bannerStudio.url ? 'подставлен' : 'не задан')}</span>
          </div>
        </article>
        <div class="promo-material-grid">
          ${bannerStudio.items.map((item) => `
            <article class="promo-material-card">
              <div class="tool-asset-thumb">
                <img src="${escapeHtml(item.pngDataUrl || '')}" alt="${escapeHtml(item.title || 'Banner')}">
              </div>
              <span class="badge badge--muted">${escapeHtml(item.width)} × ${escapeHtml(item.height)}</span>
              <h4>${escapeHtml(item.title || 'Banner')} · ${escapeHtml(item.styleTitle || '')}</h4>
              <p>HTML-баннер и графическая версия для быстрого запуска рекламы.</p>
              <div class="product-card-actions">
                <a class="btn btn--primary btn--sm" href="${escapeHtml(item.pngDataUrl || '')}" download="${escapeHtml(buildFileName(item.fileNameBase || 'golden-connect-banner', 'png'))}">Скачать PNG</a>
                ${copyButtonMarkup(item.embedCode || '', 'Копировать HTML', 'share_referral')}
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('Banner Studio соберёт несколько рекламных размеров под текущий сценарий, язык и вашу ссылку.');
  }

  if ($('#pdf-kit-result')) {
    const pdfKit = state.toolResults.pdfKit;
    $('#pdf-kit-result').innerHTML = pdfKit
      ? `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">PDF Lead Kit готов</div>
              <small>${escapeHtml(pdfKit.shortLink?.shortUrl ? 'Short link + QR + OG' : 'QR + OG')}</small>
            </div>
          </div>
          <div class="tool-preview-grid tool-preview-grid--two">
            <div class="tool-preview-card">
              <strong>OG-обложка</strong>
              <div class="tool-asset-thumb"><img src="${escapeHtml(pdfKit.ogImage?.pngDataUrl || '')}" alt="PDF kit OG"></div>
            </div>
            <div class="tool-preview-card">
              <strong>QR</strong>
              <div class="tool-asset-thumb"><img src="${escapeHtml(pdfKit.qr?.dataUrl || '')}" alt="PDF kit QR"></div>
            </div>
          </div>
          <div class="data-list">
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Исходная ссылка</div>
                <div class="data-item-sub">${escapeHtml(pdfKit.sourceUrl || '')}</div>
              </div>
            </article>
            ${pdfKit.shortLink?.shortUrl ? `
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Short link</div>
                  <div class="data-item-sub">${escapeHtml(pdfKit.shortLink.shortUrl)}</div>
                </div>
              </article>
            ` : ''}
          </div>
          <div class="product-card-actions">
            ${copyButtonMarkup(pdfKit.launchText || '', 'Копировать набор', 'share_referral')}
            ${pdfKit.shortLink?.shortUrl ? copyButtonMarkup(pdfKit.shortLink.shortUrl, 'Копировать short link', 'copy_referral') : ''}
            <button class="btn btn--ghost btn--sm tool-prefill-url-btn" type="button" data-tool-kind="short" data-tool-url="${escapeHtml(pdfKit.sourceUrl || '')}" data-tool-title="${escapeHtml(pdfKit.shortLink?.title || 'PDF Kit')}">В shortener</button>
            <button class="btn btn--ghost btn--sm tool-prefill-url-btn" type="button" data-tool-kind="qr" data-tool-url="${escapeHtml(pdfKit.shortLink?.shortUrl || pdfKit.sourceUrl || '')}" data-tool-title="${escapeHtml(pdfKit.shortLink?.title || 'PDF Kit')}">В QR</button>
            ${pdfKit.qr?.dataUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(pdfKit.qr.dataUrl)}" download="golden-connect-pdf-qr.png">Скачать QR</a>` : ''}
            ${pdfKit.ogImage?.pngDataUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(pdfKit.ogImage.pngDataUrl)}" download="${escapeHtml(buildFileName(pdfKit.ogImage.fileNameBase || 'golden-connect-pdf-kit', 'png'))}">Скачать OG</a>` : ''}
          </div>
        </article>
      `
      : emptyState('PDF Lead Kit подготовит marketing-pack: короткую ссылку, QR и OG-обложку для PDF или промо-страницы.');
  }

  if ($('#tools-bridge-grid')) {
    $('#tools-bridge-grid').innerHTML = `
      <div class="promo-material-grid">
        ${bridgeTools.map((item) => buildBridgeToolCardMarkup(item, languageId)).join('')}
      </div>
    `;
  }

  if ($('#tool-bridge-pdf')) {
    $('#tool-bridge-pdf').innerHTML = advancedPdfTool
      ? buildBridgeToolCardMarkup(advancedPdfTool, languageId, {
        title: 'Advanced PDF Tools',
        description: 'Сложные PDF-операции Arsenal: объединение, конвертация, подготовка презентаций и тяжёлый PDF workflow под ваши материалы.',
        chips: ['PDF workflow', `Lang: ${String(languageId || 'ru').toUpperCase()}`, 'Arsenal Pro'],
        ctaLabel: 'Открыть PDF Tools',
      })
      : emptyState('Advanced PDF Tools временно недоступны.');
  }

  if ($('#tool-bridge-video')) {
    $('#tool-bridge-video').innerHTML = videoBridgeTool
      ? buildBridgeToolCardMarkup(videoBridgeTool, languageId, {
        title: 'Video Tools',
        description: 'Продвинутые video и motion-инструменты Arsenal для reels, shorts, video-banner и promo-подачи.',
        chips: ['Video', 'Motion', `Lang: ${String(languageId || 'ru').toUpperCase()}`],
        ctaLabel: 'Открыть Video Tools',
      })
      : emptyState('Video Tools временно недоступны.');
  }

  syncToolPageVisibility();
}

function legacyRenderLearningPanel() {
  const learningCenter = getLearningCenter();
  if (!learningCenter) return;
  const onboarding = buildOnboardingSnapshot();
  const tracks = safeArray(learningCenter.tracks);
  const directReferrals = Number(state.partner?.overview?.directReferrals || 0);
  let recommendedTrack = tracks.find((track) => track.id === 'start') || tracks[0] || null;

  if (state.shortLinks.length > 0 || Number(state.dashboard?.stats?.openTasks || 0) > 0) {
    recommendedTrack = tracks.find((track) => track.id === 'traffic') || recommendedTrack;
  }
  if (directReferrals > 0 || String(state.user?.experienceLevel || '').trim().toLowerCase() === 'advanced') {
    recommendedTrack = tracks.find((track) => track.id === 'duplication') || recommendedTrack;
  }

  if ($('#learning-tracks')) {
    $('#learning-tracks').innerHTML = tracks.map((track) => `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(track.title)}</div>
            <small>${escapeHtml(track.description || '')}</small>
          </div>
        </div>
        <div class="data-list">
          ${safeArray(track.steps).map((step, index) => `
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Шаг ${index + 1}</div>
                <div class="data-item-sub">${escapeHtml(step)}</div>
              </div>
            </article>
          `).join('')}
        </div>
      </article>
    `).join('');
  }

  if ($('#learning-playbook')) {
    $('#learning-playbook').innerHTML = recommendedTrack
      ? `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(recommendedTrack.title)}</div>
            <small>${escapeHtml(onboarding.nextStep?.title || 'Подобран по текущему этапу кабинета')}</small>
          </div>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Почему сейчас</div>
              <div class="data-item-sub">${escapeHtml(recommendedTrack.description || 'Этот трек поможет двигаться без перегруза и быстрее выйти к рабочим действиям.')}</div>
            </div>
          </article>
          ${safeArray(recommendedTrack.steps).slice(0, 3).map((step, index) => `
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Шаг ${index + 1}</div>
                <div class="data-item-sub">${escapeHtml(step)}</div>
              </div>
            </article>
          `).join('')}
          <article class="data-item">
            <div class="data-item-main">
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">Открыть задания</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="faq">Открыть FAQ</button>
              </div>
            </div>
          </article>
        </div>
      </article>
    `
      : emptyState('Рекомендованный сценарий обучения появится после загрузки центра обучения.');
  }
}

function renderMediaCenterPanel() {
  const mediaCenter = getMediaCenter();
  const library = getLandingLibrary();
  const workspace = getWorkspace();
  if (!mediaCenter || !library || !workspace) return;

  ensureLandingPreferences(library);
  const filters = state.mediaCenterFilters || {};
  const languageId = state.landingPreferences.language || library.defaultLanguage || 'ru';
  const scenarioId = String(filters.scenario || 'all').trim() || 'all';
  const activeScenarioId = scenarioId === 'all'
    ? (state.landingPreferences.landingId || safeArray(library.types)[0]?.id || '')
    : scenarioId;
  const currentContext = getMediaCenterContext(activeScenarioId, languageId) || getCurrentLandingWorkspace();
  const currentLandingUrl = currentContext?.link?.url || workspace.siteReferralLink || '';
  const currentShortLink = findShortLinkForUrl(currentLandingUrl);
  const productOptions = getMediaCenterProductOptions();
  const allItems = buildMediaCenterItems();
  const filteredItems = getFilteredMediaCenterItems();
  const kindCounts = filteredItems.reduce((acc, item) => {
    const key = item.kind || 'other';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const scenarioOptions = [
    { id: 'all', label: '\u0412\u0441\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438' },
    ...safeArray(library.types).map((item) => ({
      id: item.id,
      label: getLocalizedCopy(item.labels, languageId, item.title || item.id || 'landing'),
    })),
  ];
  const kindOptions = [
    { id: 'all', label: '\u0412\u0441\u0435 \u0442\u0438\u043f\u044b' },
    { id: 'pack', label: '\u041f\u0430\u043a\u0435\u0442\u044b' },
    { id: 'bundle', label: '\u041d\u0430\u0431\u043e\u0440\u044b' },
    { id: 'message', label: '\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f' },
    { id: 'asset', label: '\u0412\u0438\u0437\u0443\u0430\u043b\u044b' },
    { id: 'product', label: '\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u044b' },
    { id: 'link', label: '\u0421\u0441\u044b\u043b\u043a\u0438' },
  ];
  const activeScenarioLabel = scenarioId === 'all'
    ? '\u0412\u0441\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438'
    : labelizeLandingSignal(activeScenarioId);
  const activeLanguageLabel = labelizeLanguageSignal(languageId);
  const activePack = safeArray(mediaCenter?.packs).find((item) => item.landingId === activeScenarioId) || getCurrentMediaPack();
  const activePackCover = getPackCoverAsset(activePack) || safeArray(mediaCenter?.brandAssets)[0] || null;
  const featuredHubEntry = safeArray(state.site?.contentHub).find((item) => item.imageUrl) || null;

  const buildMediaActions = (item, context) => {
    const actions = [];
    const itemLanguageId = item.languageId || languageId;
    const targetPanel = item.kind === 'product' ? 'products' : 'materials';
    if (item.text) {
      actions.push(copyButtonMarkup(
        item.text,
        item.kind === 'bundle'
          ? '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043d\u0430\u0431\u043e\u0440'
          : '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0442\u0435\u043a\u0441\u0442',
        'share_referral',
      ));
    }
    if (item.url) {
      actions.push(`<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c</a>`);
      actions.push(copyButtonMarkup(item.url, '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443', 'copy_referral'));
    }
    if (item.imageUrl) {
      actions.push(`<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.imageUrl)}" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0432\u0438\u0437\u0443\u0430\u043b</a>`);
    }
    if (item.product) {
      const companyUrl = context?.workspace?.companyCatalogLink || context?.workspace?.companyReferralLink || item.product.sourceUrl || '';
      if (companyUrl) {
        actions.push(`<a class="btn btn--ghost btn--sm" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">\u0412 \u043a\u0430\u0442\u0430\u043b\u043e\u0433</a>`);
      }
      if (item.product.instructionsUrl) {
        actions.push(`<a class="btn btn--ghost btn--sm" href="${escapeHtml(item.product.instructionsUrl)}" target="_blank" rel="noopener">\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0446\u0438\u044f</a>`);
      }
    }
    if (item.scenarioId !== 'all') {
      actions.push(`
        <button
          class="btn btn--ghost btn--sm media-open-panel-btn"
          type="button"
          data-panel-target="${escapeHtml(targetPanel)}"
          data-scenario-id="${escapeHtml(item.scenarioId)}"
          data-language-id="${escapeHtml(itemLanguageId)}"
        >\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0439</button>
      `);
      if (context?.link?.url) {
        actions.push(`<a class="btn btn--ghost btn--sm" href="${escapeHtml(context.link.url)}" target="_blank" rel="noopener">\u041b\u0435\u043d\u0434\u0438\u043d\u0433</a>`);
      }
    }
    return actions.join('');
  };

  const renderMediaCard = (item) => {
    const itemLanguageId = item.languageId || languageId;
    const contextScenarioId = item.scenarioId === 'all' ? activeScenarioId : item.scenarioId;
    const context = getMediaCenterContext(contextScenarioId, itemLanguageId) || currentContext;
    const itemLanguageLabel = itemLanguageId === 'all' ? 'Все языки' : labelizeLanguageSignal(itemLanguageId);
    const chips = [
      item.scenarioId === 'all' ? '\u0412\u0441\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438' : labelizeLandingSignal(item.scenarioId),
      itemLanguageLabel,
      ...safeArray(item.chips).slice(0, 4),
    ].filter(Boolean);
    const coverMarkup = item.imageUrl
      ? `<div class="material-asset-thumb"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || 'asset')}" loading="lazy"></div>`
      : '';
    const detailMarkup = (() => {
      if (item.kind === 'bundle') {
        return `${coverMarkup}<div class="material-bundle-preview">${escapeHtml(truncateText(item.text || item.summary || '', 820))}</div>`;
      }
      if (item.kind === 'asset') {
        return `
          ${coverMarkup}
          <p>${escapeHtml(item.summary || '\u0412\u0438\u0437\u0443\u0430\u043b \u0434\u043b\u044f \u043c\u0435\u0434\u0438\u0430\u043f\u0430\u043a\u0430 \u0438 \u043b\u0435\u043d\u0434\u0438\u043d\u0433\u043e\u0432.')}</p>
        `;
      }
      if (item.kind === 'product') {
        return `
          ${coverMarkup}
          <p>${escapeHtml(item.summary || '\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u043e\u0432\u044b\u0439 \u044f\u043a\u043e\u0440\u044c \u0434\u043b\u044f \u0442\u0435\u043a\u0443\u0449\u0435\u0433\u043e \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u044f.')}</p>
        `;
      }
      if (item.kind === 'link') {
        return `
          ${coverMarkup}
          <p>${escapeHtml(item.summary || '\u0412\u043d\u0435\u0448\u043d\u0438\u0439 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b \u0438\u043b\u0438 \u043e\u043f\u043e\u0440\u043d\u0430\u044f \u0441\u0441\u044b\u043b\u043a\u0430.')}</p>
          ${item.url ? `<div class="referral-link-box"><div class="referral-link-text">${escapeHtml(item.url)}</div></div>` : ''}
        `;
      }
      return `${coverMarkup}<p>${escapeHtml(item.text || item.summary || '\u0413\u043e\u0442\u043e\u0432\u044b\u0439 \u0431\u043b\u043e\u043a \u0434\u043b\u044f \u0440\u0430\u0431\u043e\u0442\u044b \u043f\u0430\u0440\u0442\u043d\u0435\u0440\u0430.')}</p>`;
    })();

    return `
      <article class="promo-material-card">
        <span class="badge badge--accent">${escapeHtml(getMediaKindLabel(item.kind))}</span>
        <h4>${escapeHtml(item.title || '\u041c\u0430\u0442\u0435\u0440\u0438\u0430\u043b')}</h4>
        <small>${escapeHtml(`${item.scenarioId === 'all' ? '\u0412\u0441\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438' : labelizeLandingSignal(item.scenarioId)} | ${itemLanguageLabel}`)}</small>
        ${detailMarkup}
        ${chips.length ? `<div class="marketing-chip-list">${chips.map((chip) => `<span class="marketing-chip">${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
        <div class="product-card-actions">
          ${buildMediaActions(item, context)}
        </div>
      </article>
    `;
  };

  if ($('#media-center-controls')) {
    $('#media-center-controls').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card">
          <div class="landing-toolbar">
            <div class="landing-toolbar__group">
              <span class="badge badge--accent">\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439</span>
              <div class="landing-language-switch">
                ${scenarioOptions.map((item) => `
                  <button class="landing-language-btn media-scenario-btn ${item.id === scenarioId ? 'is-active' : ''}" type="button" data-media-scenario="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
                `).join('')}
              </div>
            </div>
            <div class="landing-toolbar__group">
              <span class="badge badge--muted">\u042f\u0437\u044b\u043a</span>
              <div class="landing-language-switch">
                ${safeArray(library.languages).map((item) => `
                  <button class="landing-language-btn media-language-btn ${item.id === languageId ? 'is-active' : ''}" type="button" data-language-id="${escapeHtml(item.id)}">${escapeHtml(item.nativeLabel || item.label || item.id)}</button>
                `).join('')}
              </div>
            </div>
            <div class="landing-toolbar__group">
              <span class="badge badge--muted">\u0422\u0438\u043f</span>
              <div class="landing-language-switch">
                ${kindOptions.map((item) => `
                  <button class="landing-type-btn media-kind-btn ${item.id === (filters.kind || 'all') ? 'is-active' : ''}" type="button" data-media-kind="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button>
                `).join('')}
              </div>
            </div>
          </div>
        </article>
        <article class="data-card">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label" for="media-center-search-input">\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0435</label>
              <input id="media-center-search-input" class="form-input" type="search" placeholder="\u041f\u0430\u043a\u0435\u0442, \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435, \u043f\u0440\u043e\u0434\u0443\u043a\u0442, \u0441\u0441\u044b\u043b\u043a\u0430..." value="${escapeHtml(filters.query || '')}">
            </div>
            <div class="form-group">
              <label class="form-label" for="media-center-product-filter">\u041f\u0440\u043e\u0434\u0443\u043a\u0442</label>
              <select id="media-center-product-filter" class="form-input">
                <option value="all">\u0412\u0441\u0435 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u044b</option>
                ${productOptions.map((product) => `
                  <option value="${escapeHtml(product.id)}" ${product.id === (filters.productId || 'all') ? 'selected' : ''}>${escapeHtml(product.title || product.id)}</option>
                `).join('')}
              </select>
            </div>
          </div>
        </article>
      </div>
    `;
  }

  if ($('#media-center-summary')) {
    $('#media-center-summary').innerHTML = `
      <div class="overview-grid overview-grid--two">
        <article class="overview-card overview-card--primary">
          <span class="badge badge--gold">\u0420\u0430\u0431\u043e\u0447\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440</span>
          <h4>${escapeHtml(`${activeScenarioLabel} | ${activeLanguageLabel}`)}</h4>
          ${activePackCover?.imageUrl ? `
            <div class="overview-visual-cover">
              <img src="${escapeHtml(activePackCover.imageUrl)}" alt="${escapeHtml(activePackCover.title || activeScenarioLabel)}" loading="lazy">
            </div>
          ` : ''}
          <p>${escapeHtml('\u041c\u0435\u0434\u0438\u0430\u0446\u0435\u043d\u0442\u0440 \u0441\u043e\u0431\u0438\u0440\u0430\u0435\u0442 \u043f\u0430\u043a\u0435\u0442\u044b, \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f, \u0432\u0438\u0437\u0443\u0430\u043b\u044b, product anchors \u0438 \u043e\u043f\u043e\u0440\u043d\u044b\u0435 \u0441\u0441\u044b\u043b\u043a\u0438 \u0432 \u043e\u0434\u043d\u043e\u043c \u0440\u0430\u0431\u043e\u0447\u0435\u043c \u044d\u043a\u0440\u0430\u043d\u0435.')}</p>
          <div class="marketing-chip-list">
            <span class="marketing-chip">\u0412\u0441\u0435\u0433\u043e: ${formatNumber(allItems.length)}</span>
            <span class="marketing-chip">\u041f\u043e \u0444\u0438\u043b\u044c\u0442\u0440\u0443: ${formatNumber(filteredItems.length)}</span>
            <span class="marketing-chip">\u0421\u0441\u044b\u043b\u043a\u0430: ${escapeHtml(currentLandingUrl ? '\u0433\u043e\u0442\u043e\u0432\u0430' : '\u043d\u0435\u0442')}</span>
            <span class="marketing-chip">Short: ${escapeHtml(currentShortLink?.shortUrl ? '\u0435\u0441\u0442\u044c' : '\u043d\u0435\u0442')}</span>
          </div>
          ${currentLandingUrl ? `<div class="referral-link-box"><div class="referral-link-text">${escapeHtml(currentLandingUrl)}</div></div>` : ''}
          <div class="product-card-actions">
            ${currentLandingUrl ? copyButtonMarkup(currentLandingUrl, '\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0441\u044b\u043b\u043a\u0443', 'copy_referral') : ''}
            ${currentLandingUrl ? `<a class="btn btn--ghost btn--sm" href="${escapeHtml(currentLandingUrl)}" target="_blank" rel="noopener">\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u043b\u0435\u043d\u0434\u0438\u043d\u0433</a>` : ''}
            <button class="btn btn--ghost btn--sm media-open-panel-btn" type="button" data-panel-target="materials" data-scenario-id="${escapeHtml(activeScenarioId)}" data-language-id="${escapeHtml(languageId)}">\u0412 \u043c\u0430\u0442\u0435\u0440\u0438\u0430\u043b\u044b</button>
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">\u0421\u0432\u043e\u0434\u043a\u0430 \u043f\u043e \u0442\u0438\u043f\u0430\u043c</div>
              <small>${escapeHtml('\u0411\u044b\u0441\u0442\u0440\u043e \u0432\u0438\u0434\u043d\u043e, \u0447\u0435\u0433\u043e \u0431\u043e\u043b\u044c\u0448\u0435 \u0432 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438 \u0438 \u0447\u0442\u043e \u0435\u0449\u0435 \u043d\u0443\u0436\u043d\u043e \u0434\u043e\u0431\u0440\u0430\u0442\u044c.')}</small>
            </div>
          </div>
          ${featuredHubEntry?.imageUrl ? `
            <div class="material-asset-thumb">
              <img src="${escapeHtml(featuredHubEntry.imageUrl)}" alt="${escapeHtml(featuredHubEntry.title || 'content hub')}" loading="lazy">
            </div>
          ` : ''}
          <div class="kpi-grid">
            ${kindOptions.filter((item) => item.id !== 'all').map((item) => `
              <article class="kpi-card">
                <div class="kpi-card-value">${formatNumber(kindCounts[item.id] || 0)}</div>
                <div class="kpi-card-label">${escapeHtml(item.label)}</div>
              </article>
            `).join('')}
          </div>
          <div class="marketing-chip-list">
            ${safeArray(currentContext?.landing?.bullets).slice(0, 3).map((item) => `<span class="marketing-chip">${escapeHtml(getLocalizedListValue(item, languageId, ''))}</span>`).join('')}
          </div>
          ${featuredHubEntry ? `<p class="media-summary-note">${escapeHtml(featuredHubEntry.title)}: ${escapeHtml(featuredHubEntry.description || '')}</p>` : ''}
        </article>
      </div>
    `;
  }

  if ($('#media-center-manager')) {
    const customEntries = getManagedMediaEntries();
    const editorEntry = getManagedMediaEntryById(state.mediaLibraryEditorId);
    const canManage = Boolean(state.mediaLibraryMeta && state.mediaLibraryMeta.canManage);
    const scenarioSelectOptions = scenarioOptions.map((item) => `
      <option value="${escapeHtml(item.id)}" ${item.id === (editorEntry?.scenarioId || 'all') ? 'selected' : ''}>${escapeHtml(item.label)}</option>
    `).join('');
    const languageSelectOptions = [
      `<option value="all" ${!editorEntry || editorEntry.languageId === 'all' ? 'selected' : ''}>\u0412\u0441\u0435 \u044f\u0437\u044b\u043a\u0438</option>`,
      ...safeArray(library.languages).map((item) => `
        <option value="${escapeHtml(item.id)}" ${item.id === editorEntry?.languageId ? 'selected' : ''}>${escapeHtml(item.nativeLabel || item.label || item.id)}</option>
      `),
    ].join('');
    $('#media-center-manager').innerHTML = canManage
      ? `
        <div class="dashboard-stack">
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">${escapeHtml(editorEntry ? '\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u0430' : '\u041d\u043e\u0432\u044b\u0439 \u044d\u043b\u0435\u043c\u0435\u043d\u0442 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0438')}</div>
                <small>${escapeHtml(state.mediaLibraryMeta.mode === 'configured_admins' ? '\u0414\u043e\u0441\u0442\u0443\u043f \u043e\u0442\u043a\u0440\u044b\u0442 \u0447\u0435\u0440\u0435\u0437 CONTENT_ADMIN_EMAILS.' : '\u0420\u0435\u0436\u0438\u043c \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0430: \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043e\u0442\u043a\u0440\u044b\u0442\u043e \u0434\u043b\u044f \u0433\u043b\u0430\u0432\u043d\u043e\u0433\u043e \u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430.')}</small>
              </div>
              <span class="badge badge--accent">${escapeHtml(`${customEntries.length} custom`)}</span>
            </div>
            <form id="media-library-form" class="dashboard-stack">
              <input type="hidden" name="id" value="${escapeHtml(editorEntry?.id || '')}">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">\u0417\u0430\u0433\u043e\u043b\u043e\u0432\u043e\u043a</label>
                  <input class="form-input" name="title" type="text" maxlength="160" required value="${escapeHtml(editorEntry?.title || '')}" placeholder="\u041d\u0430\u043f\u0440\u0438\u043c\u0435\u0440: RU message для health-лендинга">
                </div>
                <div class="form-group">
                  <label class="form-label">\u0422\u0438\u043f</label>
                  <select class="form-input" name="kind">
                    ${['message', 'link', 'asset', 'bundle'].map((item) => `<option value="${escapeHtml(item)}" ${item === (editorEntry?.kind || 'message') ? 'selected' : ''}>${escapeHtml(getMediaKindLabel(item))}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">\u0421\u0446\u0435\u043d\u0430\u0440\u0438\u0439</label>
                  <select class="form-input" name="scenarioId">${scenarioSelectOptions}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">\u042f\u0437\u044b\u043a</label>
                  <select class="form-input" name="languageId">${languageSelectOptions}</select>
                </div>
                <div class="form-group">
                  <label class="form-label">\u041a\u0430\u043d\u0430\u043b</label>
                  <input class="form-input" name="channel" type="text" maxlength="40" value="${escapeHtml(editorEntry?.channel || '')}" placeholder="telegram / vk / email">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">\u041f\u0440\u043e\u0434\u0443\u043a\u0442\u044b</label>
                  <input class="form-input" name="productIds" type="text" value="${escapeHtml(safeArray(editorEntry?.productIds).join(', '))}" placeholder="live-water, tempulis">
                </div>
                <div class="form-group">
                  <label class="form-label">\u0422\u0435\u0433\u0438</label>
                  <input class="form-input" name="tags" type="text" value="${escapeHtml(safeArray(editorEntry?.tags).join(', '))}" placeholder="launch, telegram, ru">
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">\u041a\u0440\u0430\u0442\u043a\u043e\u0435 \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u0435</label>
                <textarea class="form-input" name="summary" rows="3" placeholder="\u041e\u043f\u0438\u0448\u0438, \u0437\u0430\u0447\u0435\u043c \u043d\u0443\u0436\u0435\u043d \u044d\u0442\u043e\u0442 \u044d\u043b\u0435\u043c\u0435\u043d\u0442">${escapeHtml(editorEntry?.summary || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label">\u0422\u0435\u043a\u0441\u0442 / \u0441\u043e\u0434\u0435\u0440\u0436\u0438\u043c\u043e\u0435</label>
                <textarea class="form-input" name="text" rows="6" placeholder="\u0421\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435, \u0441\u0442\u0430\u0440\u0442\u043e\u0432\u044b\u0439 \u043d\u0430\u0431\u043e\u0440, \u0441\u043a\u0440\u0438\u043f\u0442 \u0438\u043b\u0438 \u0448\u0430\u0431\u043b\u043e\u043d">${escapeHtml(editorEntry?.text || '')}</textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">URL</label>
                  <input class="form-input" name="url" type="url" value="${escapeHtml(editorEntry?.url || '')}" placeholder="https://...">
                </div>
                <div class="form-group">
                  <label class="form-label">Image URL</label>
                  <input class="form-input" name="imageUrl" type="url" value="${escapeHtml(editorEntry?.imageUrl || '')}" placeholder="https://.../image.jpg">
                </div>
              </div>
              <div class="product-card-actions">
                <button class="btn btn--primary btn--sm" type="submit">${escapeHtml(editorEntry ? '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f' : '\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0432 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0443')}</button>
                <button class="btn btn--ghost btn--sm media-entry-reset-btn" type="button">\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c</button>
              </div>
              <p id="media-library-status" class="form-status"></p>
            </form>
          </article>
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">\u041c\u043e\u0438 \u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u0435\u043b\u044c\u0441\u043a\u0438\u0435 \u044d\u043b\u0435\u043c\u0435\u043d\u0442\u044b</div>
                <small>${escapeHtml('\u042d\u0442\u0438 \u0437\u0430\u043f\u0438\u0441\u0438 \u0441\u0440\u0430\u0437\u0443 \u043f\u043e\u043f\u0430\u0434\u0430\u044e\u0442 \u0432 \u041c\u0435\u0434\u0438\u0430\u0446\u0435\u043d\u0442\u0440 \u0438 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b \u0432 \u0440\u0430\u0431\u043e\u0442\u0435 \u0431\u0435\u0437 \u043f\u0440\u0430\u0432\u043e\u043a \u043a\u043e\u0434\u0430.')}</small>
              </div>
            </div>
            ${customEntries.length ? `
              <div class="data-list">
                ${customEntries.map((item) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">${escapeHtml(item.title || '\u042d\u043b\u0435\u043c\u0435\u043d\u0442')}</div>
                      <div class="data-item-sub">${escapeHtml([getMediaKindLabel(item.kind), item.scenarioId === 'all' ? '\u0432\u0441\u0435 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0438' : labelizeLandingSignal(item.scenarioId), item.languageId === 'all' ? '\u0432\u0441\u0435 \u044f\u0437\u044b\u043a\u0438' : labelizeLanguageSignal(item.languageId)].join(' | '))}</div>
                      ${safeArray(item.tags).length ? `<div class="marketing-chip-list">${safeArray(item.tags).map((tag) => `<span class="marketing-chip">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                    </div>
                    <div class="product-card-actions">
                      <button class="btn btn--ghost btn--sm media-entry-edit-btn" type="button" data-media-entry-id="${escapeHtml(item.id)}">\u0420\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u0442\u044c</button>
                      <button class="btn btn--ghost btn--sm media-entry-delete-btn" type="button" data-media-entry-id="${escapeHtml(item.id)}">\u0423\u0434\u0430\u043b\u0438\u0442\u044c</button>
                    </div>
                  </article>
                `).join('')}
              </div>
            ` : emptyState('\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043d\u0438 \u043e\u0434\u043d\u043e\u0433\u043e custom-\u044d\u043b\u0435\u043c\u0435\u043d\u0442\u0430. \u0414\u043e\u0431\u0430\u0432\u044c \u043f\u0435\u0440\u0432\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435, \u0441\u0441\u044b\u043b\u043a\u0443 \u0438\u043b\u0438 \u0432\u0438\u0437\u0443\u0430\u043b.') }
          </article>
        </div>
      `
      : `
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">\u0421\u0442\u0443\u0434\u0438\u044f \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0432\u043b\u0430\u0434\u0435\u043b\u044c\u0446\u0443</div>
              <small>${escapeHtml('\u0413\u043e\u0442\u043e\u0432\u044b\u0435 custom-\u044d\u043b\u0435\u043c\u0435\u043d\u0442\u044b \u0431\u0443\u0434\u0443\u0442 \u0432\u0438\u0434\u043d\u044b \u0432 \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0435 \u043d\u0438\u0436\u0435, \u0430 \u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435 \u043e\u0442\u043a\u0440\u044b\u0442\u043e \u0434\u043b\u044f \u0433\u043b\u0430\u0432\u043d\u043e\u0433\u043e \u0430\u0434\u043c\u0438\u043d-\u0430\u043a\u043a\u0430\u0443\u043d\u0442\u0430.')}</small>
            </div>
            <span class="badge badge--muted">${escapeHtml(`${customEntries.length} custom`)}</span>
          </div>
          ${customEntries.length ? `<div class="marketing-chip-list">${customEntries.slice(0, 6).map((item) => `<span class="marketing-chip">${escapeHtml(item.title || item.kind || 'custom')}</span>`).join('')}</div>` : `<p>${escapeHtml('\u041f\u043e\u043a\u0430 \u0432 \u043c\u0435\u0434\u0438\u0430\u0442\u0435\u043a\u0435 \u0442\u043e\u043b\u044c\u043a\u043e \u0431\u0430\u0437\u043e\u0432\u0430\u044f \u0431\u0438\u0431\u043b\u0438\u043e\u0442\u0435\u043a\u0430.')}</p>`}
        </article>
      `;
  }

  if ($('#media-center-grid')) {
    $('#media-center-grid').innerHTML = filteredItems.length
      ? `<div class="promo-material-grid">${filteredItems.map((item) => renderMediaCard(item)).join('')}</div>`
      : emptyState('\u041f\u043e \u0442\u0435\u043a\u0443\u0449\u0438\u043c \u0444\u0438\u043b\u044c\u0442\u0440\u0430\u043c \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e. \u0421\u043c\u0435\u043d\u0438 \u0441\u0446\u0435\u043d\u0430\u0440\u0438\u0439, \u044f\u0437\u044b\u043a, \u0442\u0438\u043f \u0438\u043b\u0438 \u043f\u0440\u043e\u0434\u0443\u043a\u0442.');
  }
}

function renderLearningPanel() {
  const learningCenter = getLearningCenter();
  if (!learningCenter) return;
  const onboarding = buildOnboardingSnapshot();
  const tracks = safeArray(learningCenter.tracks);
  const growth = getGrowthModel();
  const recommendedTrack = getRecommendedLearningTrack(tracks);
  const selectedTrack = getSelectedLearningTrack(tracks);
  const modules = getLearningModules();
  const workspace = getCurrentLandingWorkspace();
  const currentScenario = getLearningScenario(workspace.landing?.id) || safeArray(learningCenter.scenarios)[0] || null;
  const supportScripts = safeArray(learningCenter.supportScripts);

  if ($('#learning-mission-control')) {
    $('#learning-mission-control').innerHTML = selectedTrack
      ? `
        <div class="overview-grid overview-grid--two">
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">${escapeHtml(selectedTrack.title)}</div>
                <small>${escapeHtml(recommendedTrack?.id === selectedTrack.id ? 'Рекомендуется по текущему этапу кабинета' : 'Выбран вручную для подробной проработки')}</small>
              </div>
              <span class="badge badge--accent">${escapeHtml(growth.current.title)}</span>
            </div>
            <div class="data-list">
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Почему сейчас</div>
                  <div class="data-item-sub">${escapeHtml(selectedTrack.description || onboarding.nextStep?.description || 'Этот сценарий помогает двигаться без перегруза и быстрее выйти к рабочим действиям.')}</div>
                </div>
              </article>
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Цель трека</div>
                  <div class="data-item-sub">${escapeHtml(selectedTrack.goal || onboarding.nextStep?.title || 'Собрать первую рабочую связку и закрепить её в задачах.')}</div>
                </div>
              </article>
              <article class="data-item">
                <div class="data-item-main">
                  <div class="data-item-title">Результат на выходе</div>
                  <div class="data-item-sub">${escapeHtml(selectedTrack.result || 'Сценарий должен закончиться не теорией, а собранной рабочей связкой.')}</div>
                </div>
              </article>
            </div>
            <div class="marketing-chip-list">
              ${safeArray(selectedTrack.deliverables).slice(0, 5).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
            </div>
          </article>
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">Ритм внедрения</div>
                <small>${escapeHtml(`Открытых задач: ${formatNumber(state.tasks.filter((item) => item.status !== 'done').length)}`)}</small>
              </div>
            </div>
            <div class="data-list">
              ${safeArray(selectedTrack.cadence).map((item, index) => `
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Тактовый шаг ${index + 1}</div>
                    <div class="data-item-sub">${escapeHtml(item)}</div>
                  </div>
                </article>
              `).join('')}
            </div>
            <div class="kpi-grid">
              <article class="kpi-card">
                <div class="kpi-card-value">${formatNumber(tracks.length)}</div>
                <div class="kpi-card-label">Трека</div>
              </article>
              <article class="kpi-card">
                <div class="kpi-card-value">${formatNumber(modules.length)}</div>
                <div class="kpi-card-label">Модулей</div>
              </article>
              <article class="kpi-card">
                <div class="kpi-card-value">${formatNumber(safeArray(selectedTrack.scripts).length)}</div>
                <div class="kpi-card-label">Готовых скриптов</div>
              </article>
            </div>
            <div class="product-card-actions">
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">Открыть задания</button>
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="faq">Открыть FAQ</button>
            </div>
          </article>
        </div>
      `
      : emptyState('Навигатор обучения появится после загрузки учебных сценариев.');
  }

  if ($('#learning-tracks')) {
    $('#learning-tracks').innerHTML = `
      <div class="promo-material-grid">
        ${tracks.map((track) => `
          <article class="promo-material-card">
            <span class="badge ${track.id === selectedTrack?.id ? 'badge--accent' : 'badge--muted'}">${escapeHtml(track.id === recommendedTrack?.id ? 'Рекомендуем' : 'Трек')}</span>
            <h4>${escapeHtml(track.title)}</h4>
            <small>${escapeHtml(`${safeArray(track.steps).length} шагов`)}</small>
            <p>${escapeHtml(track.goal || track.description || '')}</p>
            <div class="marketing-chip-list">
              ${safeArray(track.deliverables).slice(0, 3).map((step) => `<span class="marketing-chip">${escapeHtml(step)}</span>`).join('')}
            </div>
            <div class="product-card-actions">
              <button class="btn btn--ghost btn--sm learning-track-select-btn" type="button" data-track-id="${escapeHtml(track.id)}">${escapeHtml(track.id === selectedTrack?.id ? 'Открыт' : 'Выбрать')}</button>
              <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">В задания</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  if ($('#learning-playbook')) {
    $('#learning-playbook').innerHTML = selectedTrack
      ? `
        <div class="dashboard-stack">
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(selectedTrack.title)}</div>
                  <small>${escapeHtml(onboarding.nextStep?.title || 'Подобран под текущий этап кабинета')}</small>
                </div>
              </div>
              <div class="data-list">
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Почему сейчас</div>
                    <div class="data-item-sub">${escapeHtml(selectedTrack.description || 'Этот трек помогает двигаться без перегруза и быстрее выйти к рабочим действиям.')}</div>
                  </div>
                </article>
                ${safeArray(selectedTrack.steps).map((step, index) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Шаг ${index + 1}</div>
                      <div class="data-item-sub">${escapeHtml(step)}</div>
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Что должно получиться</div>
                  <small>${escapeHtml(selectedTrack.result || 'Сценарий заканчивается готовой рабочей системой, а не просто просмотром разделов.')}</small>
                </div>
              </div>
              <div class="data-list">
                ${safeArray(selectedTrack.checkpoints).map((item) => `
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Контрольная точка</div>
                      <div class="data-item-sub">${escapeHtml(item)}</div>
                    </div>
                  </article>
                `).join('')}
              </div>
              <div class="marketing-chip-list">
                ${safeArray(selectedTrack.deliverables).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
            </article>
          </div>
          ${currentScenario ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Опорный сценарий под текущий лендинг</div>
                  <small>${escapeHtml(currentScenario.title)}</small>
                </div>
              </div>
              <div class="overview-grid overview-grid--two">
                <div class="data-list">
                  ${safeArray(currentScenario.ladder).map((item, index) => `
                    <article class="data-item">
                      <div class="data-item-main">
                        <div class="data-item-title">Этап ${index + 1}</div>
                        <div class="data-item-sub">${escapeHtml(item)}</div>
                      </div>
                    </article>
                  `).join('')}
                </div>
                <div>
                  <div class="data-card-title">Опорные акценты</div>
                  <div class="marketing-chip-list">
                    ${safeArray(currentScenario.anchors).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
                  </div>
                </div>
              </div>
            </article>
          ` : ''}
          ${safeArray(selectedTrack.scripts).length ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Готовые тексты по треку</div>
                  <small>Можно копировать и адаптировать под свою аудиторию</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${safeArray(selectedTrack.scripts).map((item) => `
                  <article class="promo-material-card">
                    <span class="badge badge--accent">${escapeHtml(item.subtitle || 'Скрипт')}</span>
                    <h4>${escapeHtml(item.title || 'Текст')}</h4>
                    <p>${escapeHtml(item.text || '')}</p>
                    <div class="product-card-actions">
                      ${copyButtonMarkup(item.text || '', 'Копировать текст', 'learning_script')}
                    </div>
                  </article>
                `).join('')}
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">Открыть задания</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="faq">Открыть FAQ</button>
              </div>
            </article>
          ` : ''}
        </div>
      `
      : emptyState('Рекомендованный сценарий обучения появится после загрузки центра обучения.');
  }

  if ($('#learning-library')) {
    $('#learning-library').innerHTML = modules.length
      ? `
        <div class="dashboard-stack">
          <div class="promo-material-grid">
            ${modules.map((item) => `
              <article class="promo-material-card">
                <span class="badge ${item.recommended ? 'badge--accent' : 'badge--muted'}">${escapeHtml(item.level)}</span>
                <h4>${escapeHtml(item.title)}</h4>
                <small>${escapeHtml(item.duration)}</small>
                <p>${escapeHtml(item.summary)}</p>
                <div class="marketing-chip-list">
                  ${safeArray(item.bullets).map((bullet) => `<span class="marketing-chip">${escapeHtml(bullet)}</span>`).join('')}
                </div>
                <div class="product-card-actions">
                  <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(item.panel)}">Открыть раздел</button>
                </div>
              </article>
            `).join('')}
          </div>
          ${safeArray(learningCenter.scenarios).length ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Сценарии запуска</div>
                  <small>Опорные углы подачи под 3 типа лендингов</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${safeArray(learningCenter.scenarios).map((item) => `
                  <article class="promo-material-card">
                    <span class="badge ${item.id === currentScenario?.id ? 'badge--accent' : 'badge--muted'}">${escapeHtml(item.id === currentScenario?.id ? 'Текущий' : 'Сценарий')}</span>
                    <h4>${escapeHtml(item.title)}</h4>
                    <p>${escapeHtml(item.summary || '')}</p>
                    <div class="marketing-chip-list">
                      ${safeArray(item.anchors).slice(0, 3).map((anchor) => `<span class="marketing-chip">${escapeHtml(anchor)}</span>`).join('')}
                    </div>
                    <div class="product-card-actions">
                      <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
                      <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Открыть лендинги</button>
                    </div>
                  </article>
                `).join('')}
              </div>
            </article>
          ` : ''}
          ${(safeArray(currentScenario?.objections).length || supportScripts.length) ? `
            <div class="overview-grid overview-grid--two">
              <article class="data-card">
                <div class="data-card-header">
                  <div>
                    <div class="data-card-title">Возражения по текущему сценарию</div>
                    <small>${escapeHtml(currentScenario?.title || 'Текущий сценарий')}</small>
                  </div>
                </div>
                <div class="data-list">
                  ${safeArray(currentScenario?.objections).map((item) => `
                    <article class="data-item">
                      <div class="data-item-main">
                        <div class="data-item-title">${escapeHtml(item.title || 'Возражение')}</div>
                        <div class="data-item-sub">${escapeHtml(item.text || '')}</div>
                      </div>
                      <div class="product-card-actions">
                        ${copyButtonMarkup(item.text || '', 'Копировать ответ', 'learning_objection')}
                      </div>
                    </article>
                  `).join('') || `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">Выберите лендинг, и здесь появятся готовые ответы под текущий сценарий.</div></div></article>`}
                </div>
              </article>
              <article class="data-card">
                <div class="data-card-header">
                  <div>
                    <div class="data-card-title">Шаблоны для разбора и поддержки</div>
                    <small>Чтобы вопрос быстрее закрывался живым ответом</small>
                  </div>
                </div>
                <div class="promo-material-grid">
                  ${supportScripts.map((item) => `
                    <article class="promo-material-card">
                      <span class="badge badge--muted">${escapeHtml(item.subtitle || 'Поддержка')}</span>
                      <h4>${escapeHtml(item.title || 'Шаблон')}</h4>
                      <p>${escapeHtml(item.text || '')}</p>
                      <div class="product-card-actions">
                        ${copyButtonMarkup(item.text || '', 'Копировать текст', 'support_script')}
                        <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="faq">Открыть FAQ</button>
                      </div>
                    </article>
                  `).join('')}
                </div>
              </article>
            </div>
          ` : ''}
        </div>
      `
      : emptyState('Библиотека модулей появится после загрузки обучения.');
  }
}

function renderAiPreviewMessages() {
  const root = $('#ai-preview-messages');
  if (!root) return;
  if (!state.aiPreviewMessages.length) {
    const context = getActiveMarketingContext();
    root.innerHTML = `
      <article class="duplication-template">
        <span class="duplication-template__label">AI-подсказка</span>
        <h4>${escapeHtml(context?.journey?.label || 'Ваш сценарий запуска')}</h4>
        <p>${escapeHtml(context?.journey?.summary || 'Задайте вопрос о продуктах, лендингах, ссылках или партнёрской системе, и AI быстро предложит следующий шаг.')}</p>
      </article>
    `;
    return;
  }

  root.innerHTML = state.aiPreviewMessages.map((item) => {
    const msgClass = item.role === 'user' ? 'ai-msg--user' : 'ai-msg--bot';
    const sender = item.role === 'user' ? 'Вы' : 'AI';
    return '<article class="ai-msg ' + msgClass + '">' +
      '<strong>' + escapeHtml(sender) + '</strong>' +
      '<div>' + escapeHtml(item.content) + '</div>' +
      '</article>';
  }).join('');
}

function buildAiPreviewAnswer(question) {
  const text = String(question || '').trim().toLowerCase();
  const context = getActiveMarketingContext();
  const nextAction = context?.cta?.primary?.label || 'Открыть кабинет';
  if (/(partner|партнер|реф|доход)/i.test(text)) {
    return 'Партнёрский контур уже связан с личной ссылкой, баллами, структурой и шаблонами для дубликации. Лучший следующий шаг: открыть кабинет и перейти в разделы «Рейтинг» и «Мои ссылки».';
  }
  if (/(water|вода|живая вода|h2)/i.test(text)) {
    return 'По направлению «Живая вода» на сайте уже собраны каталог и инструкции. Дальше лучше открыть кабинет, выбрать материалы и отправить человеку подходящий лендинг или ссылку.';
  }
  if (/(product|продукт|каталог|купить|иммун)/i.test(text)) {
    return 'Сейчас лучше всего сработает связка: открыть каталог, выбрать подходящий материал или лендинг, а затем отправить человеку вашу персональную ссылку.';
  }
  return context?.journey?.summary
    ? `${context.journey.summary} Следующий лучший шаг: ${nextAction}.`
    : 'AI помогает быстро понять, что открыть первым: каталог, лендинг, материалы или партнёрский контур.';
}

function renderMarketingSurfaces() {
  const context = getActiveMarketingContext();
  renderHeroGrowthStrip(context);
  if ($('#marketing-journey')) {
    $('#marketing-journey').innerHTML = context
      ? `
        <article class="marketing-card">
          <div class="marketing-card-title">Режим трафика</div>
          <h4>${escapeHtml(context.journey?.label || 'Новый визит')}</h4>
          <p>${escapeHtml(context.journey?.summary || 'Маркетинговая система определяет текущий режим и ближайший лучший шаг.')}</p>
        </article>
        <div class="marketing-scores">
          <article class="kpi-card">
            <div class="kpi-card-value">${formatNumber(context.scores?.fit || 0)}</div>
            <div class="kpi-card-label">Совпадение</div>
          </article>
          <article class="kpi-card">
            <div class="kpi-card-value">${formatNumber(context.scores?.engagement || 0)}</div>
            <div class="kpi-card-label">Вовлечение</div>
          </article>
          <article class="kpi-card">
            <div class="kpi-card-value">${formatNumber(context.scores?.intent || 0)}</div>
            <div class="kpi-card-label">Интерес</div>
          </article>
          <article class="kpi-card">
            <div class="kpi-card-value">${formatNumber(context.scores?.partnerPotential || 0)}</div>
            <div class="kpi-card-label">Потенциал партнёра</div>
          </article>
        </div>
        <div class="data-list">
          ${safeArray(context.analytics?.recommendations).slice(0, 2).map((item) => `
            <article class="data-item">
              <strong>Фокус</strong>
              <div>${escapeHtml(item)}</div>
            </article>
          `).join('')}
        </div>
        <div class="marketing-actions">
          ${safeArray(context.nextActions).map((item) => `
            <button class="btn btn--ghost marketing-action-btn" type="button" data-action-kind="${escapeHtml(item.kind)}" data-action-target="${escapeHtml(item.target || '')}" data-action-id="${escapeHtml(item.id || '')}">
              ${escapeHtml(item.label)}
            </button>
          `).join('')}
        </div>
      `
      : emptyState('РњР°СЂРєРµС‚РёРЅРіРѕРІС‹Р№ РєРѕРЅС‚РµРєСЃС‚ РїРѕСЏРІРёС‚СЃСЏ РїРѕСЃР»Рµ РїРµСЂРІРѕРіРѕ РІРёР·РёС‚Р°.');
  }

  if ($('#traffic-snapshot')) {
    $('#traffic-snapshot').innerHTML = context
      ? `
        <div class="marketing-grid">
          <article class="marketing-grid__item">
            <span>Источник</span>
            <strong>${escapeHtml(labelizeMarketingSource(context.traffic?.sourceChannel || 'direct'))}</strong>
            <small>${escapeHtml(context.traffic?.referralCode ? `ref: ${context.traffic.referralCode}` : 'Без реферального кода')}</small>
          </article>
          <article class="marketing-grid__item">
            <span>Кампания</span>
            <strong>${escapeHtml(context.traffic?.utmCampaign || 'Без кампании')}</strong>
            <small>${escapeHtml(context.traffic?.utmSource || 'utm_source не передан')}</small>
          </article>
          <article class="marketing-grid__item">
            <span>Landing</span>
            <strong>${escapeHtml(context.traffic?.firstLandingPath || '/')}</strong>
            <small>Визитов: ${formatNumber(context.traffic?.visitsCount || 0)}</small>
          </article>
        </div>
        <div class="marketing-inline-metrics">
          <span class="marketing-inline-metric"><strong>${formatNumber(context.analytics?.funnel?.authCompletes || 0)}</strong> входов</span>
          <span class="marketing-inline-metric"><strong>${formatNumber(context.analytics?.funnel?.aiSignals || 0)}</strong> AI-сигналов</span>
          <span class="marketing-inline-metric"><strong>${formatNumber(context.analytics?.funnel?.referralsShared || 0)}</strong> партнёрских касаний</span>
        </div>
        <div class="marketing-chip-list">
          ${safeArray(context.analytics?.sources).slice(0, 3).map((item) => `
            <span class="marketing-chip"><strong>${escapeHtml(labelizeMarketingSource(item.source))}</strong> ${formatNumber(item.count)}</span>
          `).join('')}
          ${safeArray(context.analytics?.topEvents).slice(0, 3).map((item) => `
            <span class="marketing-chip"><strong>${escapeHtml(labelizeMarketingEvent(item.eventType))}</strong> ${formatNumber(item.count)}</span>
          `).join('')}
        </div>
      `
      : emptyState('РСЃС‚РѕС‡РЅРёРє Рё Р°С‚СЂРёР±СѓС†РёСЏ РїРѕСЏРІСЏС‚СЃСЏ Р·РґРµСЃСЊ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.');
  }

  if ($('#duplication-kit')) {
    $('#duplication-kit').innerHTML = context?.duplicationKit
      ? `
        <article class="marketing-card">
          <div class="marketing-card-title">Пакет дубликации</div>
          <h4>${escapeHtml(context.duplicationKit.headline || 'Пакет дубликации')}</h4>
          <p>${escapeHtml(context.duplicationKit.referralLink || 'Ссылка появится после входа в кабинет и активации партнёрского контура.')}</p>
          ${context.duplicationKit.referralLink ? `<div class="product-card-actions"><button class="btn btn--ghost marketing-copy-btn" type="button" data-copy-text="${escapeHtml(context.duplicationKit.referralLink)}" data-copy-kind="copy_referral">Скопировать ссылку</button></div>` : ''}
        </article>
        <div class="marketing-inline-metrics">
          <span class="marketing-inline-metric"><strong>${formatNumber(context.performance?.points || 0)}</strong> баллов</span>
          <span class="marketing-inline-metric"><strong>${formatNumber(context.performance?.directReferrals || 0)}</strong> прямых регистраций</span>
          <span class="marketing-inline-metric"><strong>${formatNumber(context.performance?.totalReferrals || 0)}</strong> всего в структуре</span>
        </div>
        <div class="duplication-grid">
          ${safeArray(context.duplicationKit.angles).map((item) => `
            <article class="duplication-template">
              <span class="duplication-template__label">Угол подачи</span>
              <p>${escapeHtml(item)}</p>
            </article>
          `).join('')}
        </div>
        <div class="duplication-grid">
          ${safeArray(context.duplicationKit.templates).map((item) => `
            <article class="duplication-template">
              <span class="duplication-template__label">Шаблон</span>
              <h4>${escapeHtml(item.title)}</h4>
              <p>${escapeHtml(item.text)}</p>
              <div class="product-card-actions">
                <button class="btn btn--ghost marketing-copy-btn" type="button" data-copy-text="${escapeHtml(item.text)}" data-copy-kind="share_referral">Скопировать текст</button>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('Пакет дубликации появится здесь после входа в кабинет.');
  }

  renderAiPreviewMessages();
}

async function performMarketingAction(kind, target, actionId, label) {
  if (kind === 'auth') {
    openAuth(target === 'login' ? 'login' : 'register');
  } else if (kind === 'scroll') {
    scrollToId(target || 'hero');
  } else if (kind === 'panel') {
    if (!requireUser(target || 'overview')) return;
    scrollToId('dashboard');
    activatePanel(target || 'overview');
  } else if (kind === 'telegram') {
    openAuth('login');
    await startTelegramAuth().catch(() => {});
  } else if (kind === 'copy_referral') {
    const referralLink = getActiveMarketingContext()?.duplicationKit?.referralLink || state.partner?.overview?.referralLink || '';
    if (referralLink) {
      await copyTextToClipboard(referralLink);
      setStatus($('#profile-status'), 'Р РµС„РµСЂР°Р»СЊРЅР°СЏ СЃСЃС‹Р»РєР° СЃРєРѕРїРёСЂРѕРІР°РЅР°.');
      await trackMarketingEvent('copy_referral', {
        ctaId: actionId || 'copy_referral',
        ctaLabel: label || 'copy_referral',
        panel: 'overview',
      });
    }
    return;
  }

  await trackMarketingEvent('cta_click', {
    ctaId: actionId || 'cta',
    ctaLabel: label || actionId || 'cta',
    panel: target || null,
  });
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showDashboard(visible) {
  if ($('#dashboard')) $('#dashboard').hidden = !visible;
  updateHeaderState();
  const fab = document.getElementById('ai-fab');
  if (fab) fab.classList.toggle('is-visible', visible);
}

function resolvePanelName(panel) {
  const raw = String(panel || 'overview').trim() || 'overview';
  return PANEL_ALIASES[raw] || raw;
}

function syncDashboardPanelMeta(panel = state.activePanel) {
  const meta = DASHBOARD_PANEL_META[resolvePanelName(panel)] || DASHBOARD_PANEL_META.overview;
  if ($('#dashboard-panel-kicker')) $('#dashboard-panel-kicker').textContent = meta.kicker;
  if ($('#dashboard-panel-heading')) $('#dashboard-panel-heading').textContent = meta.heading;
  if ($('#dashboard-panel-copy')) $('#dashboard-panel-copy').textContent = meta.copy;
}

function activatePanel(panel) {
  const resolved = resolvePanelName(panel);
  state.activePanel = resolved;
  $all('.cabinet-nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.panel === resolved);
  });
  $all('.dashboard-panel').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.panel === resolved);
  });
  syncDashboardPanelMeta(resolved);
  document.getElementById('cabinet-sidebar')?.classList.remove('is-open');
  document.getElementById('cabinet-sidebar-overlay')?.classList.remove('is-open');
}

function requireUser(panel = 'overview') {
  if (state.user) return true;
  state.pendingPanel = resolvePanelName(panel);
  openAuth('login');
  return false;
}

function renderTrustStrip() {
  $('#trust-strip').innerHTML = safeArray(state.site?.landing?.trustStrip).map((item) => `
    <article class="trust-item">
      <span class="trust-item-icon">${escapeHtml(item.icon || '\u2713')}</span>
      <span class="trust-item-text"><strong>${escapeHtml(item.value)}</strong> ${escapeHtml(item.label)}</span>
    </article>
  `).join('');
}

function renderPillars() {
  const root = $('#pillars-grid') || $('#pillars-section');
  if (!root) return;
  root.innerHTML = safeArray(state.site?.landing?.pillars).map((item) => `
    <article class="pillar-card">
      <div class="pillar-card-icon">${escapeHtml(item.icon || '\u2726')}</div>
      <h3 class="pillar-card-title">${escapeHtml(item.title)}</h3>
      <p class="pillar-card-text">${escapeHtml(item.text)}</p>
    </article>
  `).join('');
}

function renderCompanySection() {
  const company = state.site?.company;
  if (!company) return;
  if ($('#company-title')) $('#company-title').textContent = company.title || 'О компании';
  if ($('#company-intro')) $('#company-intro').textContent = company.intro || '';
  if ($('#company-description')) $('#company-description').textContent = company.description || '';

  $('#company-highlights').innerHTML = safeArray(company.highlights).map((item) => `
    <article class="data-item">
      <strong>${escapeHtml(item.title)}</strong>
      <div>${escapeHtml(item.text)}</div>
    </article>
  `).join('');

  $('#company-facts').innerHTML = safeArray(company.facts).map((item) => `
    <article class="fact-card">
      <div class="fact-card-value">${escapeHtml(item.value)}</div>
      <div class="fact-card-label">${escapeHtml(item.label)}</div>
      <small>${escapeHtml(item.note || '')}</small>
    </article>
  `).join('');

  const EXPERT_IMAGES = {
    '\u0427\u0435\u0440\u043d\u0438\u043d': 'media/experts/chernin.jpg',
    '\u041f\u0430\u0448\u043d\u044e\u043a': 'media/experts/pashnyuk.jpg',
    '\u0412\u0435\u0434\u043e\u0432': 'media/experts/vedov.jpg',
    '\u0422\u0430\u0440\u0430\u0441\u043e\u0432': 'media/experts/tarasova.jpg',
    '\u0410\u0432\u0430\u043d\u0435\u0441\u043e\u0432': 'media/experts/avanesov.jpg',
    '\u0420\u0443\u043c\u044f\u043d\u0446\u0435\u0432': 'media/experts/rumyancev.jpg',
    '\u0412\u0430\u0440\u043b\u0430\u043c\u043e\u0432': 'media/experts/varlamov.jpg',
    '\u041f\u0440\u043e\u0432\u043e\u0442\u043e\u0440\u043e\u0432': 'media/experts/provotorov.jpg',
    '\u041d\u0435\u0444\u0435\u0434\u043e\u0432': 'media/experts/nefedov.jpg',
  };
  function getExpertImg(name) {
    for (const [key, val] of Object.entries(EXPERT_IMAGES)) {
      if (name && name.includes(key)) return val;
    }
    return '';
  }
  $('#experts-grid').innerHTML = safeArray(company.experts).map((item) => {
    const expertImg = getExpertImg(item.name);
    return `
    <article class="expert-card">
      ${expertImg ? `<img src="${expertImg}" alt="${escapeHtml(item.name)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0">` : `<div class="expert-avatar">${escapeHtml((item.name || '?')[0])}</div>`}
      <div>
        <div class="expert-role">${escapeHtml(item.role)}</div>
        <h3 class="expert-name">${escapeHtml(item.name)}</h3>
        <p class="expert-summary">${escapeHtml(item.summary)}</p>
      </div>
    </article>
  `;}).join('');

  $('#company-awards').innerHTML = safeArray(company.awards).map((item) => `
    <article class="award-card">
      <div class="award-icon">\u{1F3C6}</div>
      <h3 class="award-title">${escapeHtml(item.title)}</h3>
      <p class="award-text">${escapeHtml(item.note)}</p>
    </article>
  `).join('');
}

function isSaved(kind, itemId) {
  if (!state.saved) return false;
  if (kind === 'protocol') return safeArray(state.saved.protocols).some((item) => item.id === itemId);
  if (kind === 'product') return safeArray(state.saved.products).some((item) => item.id === itemId);
  if (kind === 'content') return safeArray(state.saved.content).some((item) => item.id === itemId);
  return false;
}

function saveButton(kind, itemId) {
  const saved = isSaved(kind, itemId);
  return `
    <button
      class="btn btn--ghost saved-toggle-btn"
      type="button"
      data-kind="${escapeHtml(kind)}"
      data-item-id="${escapeHtml(itemId)}"
    >${escapeHtml(saved ? 'Убрать' : 'Сохранить')}</button>
  `;
}

/* ── Product image mapping (PDF pages → product IDs) ── */
const PRODUCT_IMAGES = {
  'live-water':       'media/products/live-water.jpg',
  'dihydroquercetin': 'media/uploads/dhqx6.jpg',
  'oligochit-iod-53': 'media/uploads/oligohit-yod.jpg',
  'oligochit-osteo':  'media/products/oligochit-osteo.jpg',
  'oligochit-zoo':    'media/products/oligochit-zoo.jpg',
  'hitabs':           'media/products/hitabs.jpg',
  'h538':             'media/uploads/h538.jpg',
  'tempulis':         'media/products/tempulis.jpg',
  'reventus':         'media/products/reventus.jpg',
  'skaveran':         'media/products/skaveran.jpg',
  'melaris':          'media/products/melaris.jpg',
  'cinalis-c6':       'media/products/cinalis-c6.jpg',
  'tuberlin-c6':      'media/products/tuberlin-c6.jpg',
  'alfa-nektar':      'media/products/alfa-nektar.jpg',
  'geksanidin':       'media/products/geksanidin.jpg',
  'provitera':        'media/products/provitera.jpg',
  'fungirex':         'media/products/fungirex.jpg',
  'omega-3':          'media/products/omega-3.jpg',
  'calcium':          'media/products/calcium.jpg',
  'dna':              'media/products/dna.jpg',
  'formidium':        'media/products/formidium.jpg',
  'boroflavin':       'media/uploads/boroflavin.jpg',
  'premium-balm':     'media/uploads/vedov.jpg',
  'hair-balm':        'media/products/hair-balm.jpg',
  'ambulance-balm':   'media/products/ambulance-balm.jpg',
  'phytoshampoo':     'media/products/phytoshampoo.jpg',
};

/* ── Company/landing images ── */
const SITE_IMAGES = {
  hero:      'media/brand-og.jpg',
  awards:    'media/awards-overview.jpg',
  scientists:'media/science-overview.jpg',
  reviews:   'media/reviews-showcase.jpg',
  chernin:   'media/experts/chernin.jpg',
  tarasova:  'media/experts/tarasova.jpg',
  pashnuk:   'media/experts/pashnyuk.jpg',
  vedov:     'media/experts/vedov.jpg',
  partner:   'media/partner-system.jpg',
};

function getProductImage(product) {
  if (product.imageUrl) return product.imageUrl;
  return PRODUCT_IMAGES[product.id] || PRODUCT_IMAGES[product.slug] || '';
}

function buildProductCard(product, insideDashboard) {
  const workspace = getWorkspace();
  const companyUrl = workspace?.companyCatalogLink || workspace?.companyReferralLink || state.site?.links?.companyCatalog || state.site?.links?.shop || product.sourceUrl || '#';
  const imgSrc = getProductImage(product);
  return `
    <article class="product-card">
      <div class="product-card-img">${imgSrc ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.title)}" loading="lazy">` : '\u{1F4E6}'}</div>
      <div class="product-card-body">
        <span class="product-card-category">${escapeHtml(product.category || 'Продукт')}</span>
        <h3 class="product-card-name">${escapeHtml(product.title)}</h3>
        <p class="product-card-desc">${escapeHtml(product.shortDescription || '')}</p>
        ${insideDashboard && product.story ? `<p class="product-card-story">${escapeHtml(product.story)}</p>` : ''}
        <div class="product-card-price">
          ${escapeHtml(product.priceLabel || formatCurrency(product.priceRub, 'RUB'))}
          <small>${escapeHtml(product.format || 'Публичный каталог')}</small>
        </div>
        <div class="product-card-tags">
          ${safeArray(product.useCases).map((item) => `<span class="product-tag">${escapeHtml(item)}</span>`).join('')}
        </div>
        <div class="product-card-actions">
          ${insideDashboard ? `<a class="btn btn--primary" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">Открыть в компании</a>` : ''}
          ${insideDashboard ? `<button class="btn btn--ghost btn--sm media-open-panel-btn" type="button" data-panel-target="media" data-product-id="${escapeHtml(product.id)}">Медиа</button>` : ''}
          ${insideDashboard ? saveButton('product', product.id) : `<button class="btn btn--outline" type="button" data-scroll-target="dashboard">${state.user ? 'Открыть кабинет' : 'Войти'}</button>`}
          ${product.sourceUrl ? `<a class="btn btn--ghost" href="${escapeHtml(product.sourceUrl)}" target="_blank" rel="noopener">Источник</a>` : ''}
          ${product.instructionsUrl ? `<a class="btn btn--ghost" href="${escapeHtml(product.instructionsUrl)}" target="_blank" rel="noopener">Инструкция</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

function getProductCategorySummaries() {
  const groups = new Map();
  safeArray(state.products).forEach((product) => {
    const category = product.category || 'Продукты компании';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });
  return Array.from(groups.entries())
    .map(([category, products]) => ({
      category,
      products,
      count: products.length,
      titles: products.slice(0, 3).map((item) => item.title),
      useCases: Array.from(new Set(products.flatMap((item) => safeArray(item.useCases)))).slice(0, 4),
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'ru'));
}

function buildProductsHeroMarkup() {
  const company = state.site?.company || {};
  const resultsShowcase = state.site?.resultsShowcase || {};
  const workspace = getWorkspace();
  const mediaCenter = getMediaCenter();
  const categories = getProductCategorySummaries();
  const companyUrl = workspace?.companyCatalogLink || workspace?.companyReferralLink || state.site?.links?.companyCatalog || state.site?.links?.shop || state.site?.links?.officialSite || '#';
  const instructionsUrl = state.site?.links?.instructions || safeArray(state.products).find((item) => item.instructionsUrl)?.instructionsUrl || '';
  const resultsUrl = safeArray(resultsShowcase.actions).find((item) => /результат/i.test(item.label || ''))?.url || state.site?.links?.results || '';
  const heroImage = resultsShowcase.imageUrl
    || safeArray(mediaCenter?.brandAssets).find((item) => item.purpose === 'hero')?.imageUrl
    || SITE_IMAGES.hero;
  const stats = [
    { value: String(state.products.length), label: 'продуктов в каталоге' },
    { value: String(categories.length), label: 'направлений и категорий' },
    { value: String(safeArray(company.experts).length), label: 'экспертов в базе доверия' },
    { value: String(safeArray(company.awards).length), label: 'наград и знаков признания' },
  ];

  return `
    <div class="products-hero-card">
      <div class="products-hero-card__media">
        ${heroImage ? `<img src="${escapeHtml(heroImage)}" alt="${escapeHtml(resultsShowcase.imageAlt || company.title || 'Golden Connect')}" loading="lazy">` : ''}
      </div>
      <div class="products-hero-card__body">
        <span class="badge badge--accent">Официальная продуктовая база</span>
        <h3>${escapeHtml(company.title || 'Продукция Golden Connect')}</h3>
        <p>${escapeHtml(company.description || company.intro || 'Собранные продукты компании, официальные инструкции, результаты и рабочие материалы для партнёра.')}</p>
        <div class="marketing-chip-list">
          ${safeArray(company.highlights).slice(0, 4).map((item) => `<span class="marketing-chip">${escapeHtml(item.title)}</span>`).join('')}
        </div>
        <div class="product-card-actions">
          <a class="btn btn--primary" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">Открыть каталог компании</a>
          ${instructionsUrl ? `<a class="btn btn--ghost" href="${escapeHtml(instructionsUrl)}" target="_blank" rel="noopener">Инструкции</a>` : ''}
          ${resultsUrl ? `<a class="btn btn--ghost" href="${escapeHtml(resultsUrl)}" target="_blank" rel="noopener">Отзывы и результаты</a>` : ''}
          <button class="btn btn--ghost dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
        </div>
      </div>
    </div>
    <div class="products-kpi-grid">
      ${stats.map((item) => `
        <article class="fact-card products-kpi-card">
          <div class="fact-card-value">${escapeHtml(item.value)}</div>
          <div class="fact-card-label">${escapeHtml(item.label)}</div>
        </article>
      `).join('')}
    </div>
  `;
}

function buildProductsCategoriesMarkup() {
  const categories = getProductCategorySummaries();
  if (!categories.length) return '<div class="empty-state">Категории продукции пока не собраны.</div>';
  return `
    <div class="products-direction-grid">
      ${categories.map((item) => `
        <article class="products-direction-card">
          <div class="products-direction-card__count">${escapeHtml(String(item.count))}</div>
          <h4>${escapeHtml(item.category)}</h4>
          <p>${escapeHtml(item.titles.join(' • '))}</p>
          <div class="marketing-chip-list">
            ${safeArray(item.useCases).map((useCase) => `<span class="marketing-chip">${escapeHtml(useCase)}</span>`).join('')}
          </div>
        </article>
      `).join('')}
    </div>
  `;
}

function buildProductsSpotlightsMarkup() {
  const mediaCenter = getMediaCenter();
  const workspace = getWorkspace();
  const companyUrl = workspace?.companyCatalogLink || workspace?.companyReferralLink || state.site?.links?.companyCatalog || state.site?.links?.shop || '#';
  const items = safeArray(mediaCenter?.productSpotlights)
    .map((spotlight) => ({
      spotlight,
      product: getProductById(spotlight.id),
    }))
    .filter((item) => item.product);
  if (!items.length) return '<div class="empty-state">Ключевые продукты пока не настроены.</div>';
  return `
    <div class="products-spotlight-grid">
      ${items.map(({ spotlight, product }) => {
        const imgSrc = getProductImage(product);
        return `
          <article class="products-spotlight-card">
            ${imgSrc ? `<div class="products-spotlight-card__media"><img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(product.title)}" loading="lazy"></div>` : ''}
            <div class="products-spotlight-card__body">
              <span class="badge badge--muted">${escapeHtml(product.category || 'Продукт')}</span>
              <h4>${escapeHtml(product.title)}</h4>
              <p>${escapeHtml(product.shortDescription || '')}</p>
              <small>${escapeHtml(spotlight.angle || product.story || '')}</small>
              <div class="marketing-chip-list">
                ${safeArray(product.useCases).map((useCase) => `<span class="marketing-chip">${escapeHtml(useCase)}</span>`).join('')}
              </div>
              <div class="product-card-actions">
                <a class="btn btn--primary btn--sm" href="${escapeHtml(companyUrl)}" target="_blank" rel="noopener">В каталог</a>
                <button class="btn btn--ghost btn--sm media-open-panel-btn" type="button" data-panel-target="media" data-product-id="${escapeHtml(product.id)}">Медиа</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Материалы</button>
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function buildProductsProofMarkup() {
  const company = state.site?.company || {};
  const resultsShowcase = state.site?.resultsShowcase || {};
  const resultsImage = resultsShowcase.imageUrl || SITE_IMAGES.reviews;
  return `
    <div class="dashboard-stack">
      <div class="results-grid">
        <article class="results-media-card">
          ${resultsImage ? `<img src="${escapeHtml(resultsImage)}" alt="${escapeHtml(resultsShowcase.imageAlt || 'Отзывы и результаты Golden Connect')}" loading="lazy">` : ''}
        </article>
        <div class="results-cards">
          ${safeArray(resultsShowcase.items).map((item) => `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(item.title || 'Доверие')}</div>
                  <small>${escapeHtml(item.badge || 'Отзывы')}</small>
                </div>
              </div>
              <p>${escapeHtml(item.text || '')}</p>
            </article>
          `).join('')}
          ${safeArray(resultsShowcase.actions).length ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Что показать человеку дальше</div>
                  <small>Отзывы, каталог, инструкции и переход в официальный контур</small>
                </div>
              </div>
              <div class="products-resource-actions">
                ${safeArray(resultsShowcase.actions).map((item) => `
                  <a class="btn btn--ghost btn--sm" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener">${escapeHtml(item.label || 'Открыть')}</a>
                `).join('')}
              </div>
            </article>
          ` : ''}
        </div>
      </div>
      <div class="products-proof-grid">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Экспертный контур</div>
              <small>${escapeHtml(`${safeArray(company.experts).length} экспертов в базе доверия`)}</small>
            </div>
          </div>
          <div class="marketing-chip-list">
            ${safeArray(company.experts).slice(0, 4).map((item) => `<span class="marketing-chip">${escapeHtml(item.name)}</span>`).join('')}
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Награды и признание</div>
              <small>${escapeHtml(`${safeArray(company.awards).length} подтверждающих блоков`)}</small>
            </div>
          </div>
          <div class="marketing-chip-list">
            ${safeArray(company.awards).slice(0, 4).map((item) => `<span class="marketing-chip">${escapeHtml(item.title)}</span>`).join('')}
          </div>
        </article>
      </div>
    </div>
  `;
}

function buildProductsPacksMarkup() {
  const mediaCenter = getMediaCenter();
  const library = getLandingLibrary();
  const currentLanguage = getCurrentLandingWorkspace().language?.id || 'ru';
  const packs = safeArray(mediaCenter?.packs);
  if (!packs.length) return '<div class="empty-state">Продуктовые связки пока не собраны.</div>';
  return `
    <div class="products-pack-grid">
      ${packs.map((pack) => {
        const cover = getPackCoverAsset(pack);
        const landing = safeArray(library?.types).find((item) => item.id === pack.landingId) || null;
        const landingLabel = getLocalizedCopy(landing?.labels, currentLanguage, pack.landingId || 'landing');
        const products = safeArray(pack.productIds).map((id) => getProductById(id)).filter(Boolean).slice(0, 3);
        return `
          <article class="products-pack-card">
            ${cover?.imageUrl ? `<div class="products-pack-card__media"><img src="${escapeHtml(cover.imageUrl)}" alt="${escapeHtml(cover.title || pack.title || 'pack')}" loading="lazy"></div>` : ''}
            <div class="products-pack-card__body">
              <span class="badge badge--accent">${escapeHtml(landingLabel)}</span>
              <h4>${escapeHtml(pack.title || 'Продуктовая связка')}</h4>
              <p>${escapeHtml(pack.summary || '')}</p>
              <div class="marketing-chip-list">
                ${products.map((product) => `<span class="marketing-chip">${escapeHtml(product.title)}</span>`).join('')}
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть пакет</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Лендинги</button>
              </div>
            </div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function buildProductsResourcesMarkup() {
  const items = safeArray(state.site?.contentHub).filter((item) => ['official-site', 'instructions', 'results', 'presentation', 'marketing-plan', 'channel', 'chat'].includes(item.id));
  if (!items.length) return '<div class="empty-state">Официальные материалы и инструкции пока не подключены.</div>';
  return `<div class="content-grid">${items.map((item) => buildContentCard(item, true)).join('')}</div>`;
}

function renderProducts() {
  const publicGrid = $('#product-grid');
  const dashboardGrid = $('#dashboard-product-grid');
  if (publicGrid) publicGrid.innerHTML = state.products.map((item) => buildProductCard(item, false)).join('');
  if (dashboardGrid) dashboardGrid.innerHTML = state.products.map((item) => buildProductCard(item, true)).join('');
  if ($('#products-hero')) $('#products-hero').innerHTML = buildProductsHeroMarkup();
  if ($('#products-categories')) $('#products-categories').innerHTML = buildProductsCategoriesMarkup();
  if ($('#products-spotlights')) $('#products-spotlights').innerHTML = buildProductsSpotlightsMarkup();
  if ($('#products-proof')) $('#products-proof').innerHTML = buildProductsProofMarkup();
  if ($('#products-packs')) $('#products-packs').innerHTML = buildProductsPacksMarkup();
  if ($('#products-resources')) $('#products-resources').innerHTML = buildProductsResourcesMarkup();
}

function renderPartnerSection() {
  if (!$('#partner-rewards') || !$('#partner-levels')) return;
  $('#partner-rewards').innerHTML = safeArray(state.site?.partner?.rewards).map((item) => `
    <article class="reward-card">
      <div class="reward-icon">\u{1F381}</div>
      <div class="reward-value">${escapeHtml(item.value)}</div>
      <div class="reward-label">${escapeHtml(item.title)}</div>
      <small>${escapeHtml(item.note || '')}</small>
    </article>
  `).join('');

  const levelColors = ['--green', '--blue', '--purple', '--gold'];
  $('#partner-levels').innerHTML = safeArray(state.site?.partner?.levels).map((item, idx) => `
    <article class="level-card level-card${levelColors[idx % levelColors.length]}">
      <div class="level-icon">\u{1F451}</div>
      <div class="level-name">${escapeHtml(item.title)}</div>
      <div class="level-share">${escapeHtml(item.share)}</div>
      <div class="level-focus">${escapeHtml(item.focus)}</div>
    </article>
  `).join('');
}

function buildContentCard(item, insideDashboard) {
  return `
    <article class="content-card">
      <span class="content-card-type">${escapeHtml(item.type || 'Материал')}</span>
      ${item.imageUrl ? `<div class="content-card-media"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title || 'content')}" loading="lazy"></div>` : ''}
      <h3 class="content-card-title">${escapeHtml(item.title)}</h3>
      <p class="content-card-desc">${escapeHtml(item.description || '')}</p>
      <div class="product-card-actions">
        ${item.url ? `<a class="btn btn--ghost" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Открыть</a>` : ''}
        ${insideDashboard ? saveButton('content', item.id) : ''}
      </div>
    </article>
  `;
}

function renderContentCards() {
  const items = safeArray(state.site?.contentHub);
  if ($('#content-grid')) $('#content-grid').innerHTML = items.map((item) => buildContentCard(item, false)).join('');
  if ($('#dashboard-content-grid')) $('#dashboard-content-grid').innerHTML = items.map((item) => buildContentCard(item, true)).join('');
}

function renderAiPrompts() {
  const promptMarkup = safeArray(state.site?.ai?.quickPrompts).map((prompt) => `
    <button class="btn btn--ghost ai-prompt-btn" type="button" data-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>
  `).join('');
  if ($('#dashboard-ai-prompts')) $('#dashboard-ai-prompts').innerHTML = promptMarkup;
  if ($('#ai-prompt-row')) $('#ai-prompt-row').innerHTML = promptMarkup;
}

function renderAiChat() {
  const root = $('#ai-chat-log');
  if (!root) return;
  if (!state.aiMessages.length) {
    root.innerHTML = '<div class="ai-msg ai-msg--bot"><strong>AI-помощник</strong><div>Спроси про продукты, компанию, лендинги, ссылки, материалы или партнёрский блок.</div></div>';
    return;
  }
  root.innerHTML = state.aiMessages.map((item) => `
    <article class="ai-msg ${item.role === 'user' ? 'ai-msg--user' : 'ai-msg--bot'}">
      <strong>${escapeHtml(item.role === 'user' ? 'Вы' : 'AI')}</strong>
      <div>${escapeHtml(item.content)}</div>
      <small>${escapeHtml(formatDate(item.createdAt, true))}</small>
    </article>
  `).join('');
}

function renderProfileInfo() {
  if (!state.user) return;
  const telegramLabel = state.user.telegramUsername
    ? `@${state.user.telegramUsername}`
    : state.user.telegramLinked
      ? `ID ${state.user.telegramUserId}`
      : 'Не привязан';
  const onboarding = buildOnboardingSnapshot();

  const displayName = state.user.displayName || state.user.email || (state.user.telegramUsername ? `@${state.user.telegramUsername}` : 'User');
  const avatarLetter = (displayName[0] || '?').toUpperCase();
  $('#profile-info').innerHTML = `
    <div class="cabinet-user-block" style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div class="cabinet-user-avatar">${escapeHtml(avatarLetter)}</div>
      <div>
        <div class="cabinet-user-name">${escapeHtml(displayName)}</div>
        <div class="cabinet-user-level">${escapeHtml(getRoleLabel(state.user.userRole))} \u2022 ${escapeHtml(`${onboarding.percent}%`)}</div>
      </div>
    </div>
    <div class="info-list">
      <div class="info-item"><span class="info-item-label">Email</span><span class="info-item-value">${escapeHtml(state.user.email || 'Вход через Telegram')}</span></div>
      <div class="info-item"><span class="info-item-label">Telegram</span><span class="info-item-value">${escapeHtml(telegramLabel)}</span></div>
      <div class="info-item"><span class="info-item-label">Способы входа</span><span class="info-item-value">${escapeHtml(getAuthMethodsLabel(state.user.authMethods))}</span></div>
      <div class="info-item"><span class="info-item-label">Код приглашения</span><span class="info-item-value">${escapeHtml(state.user.referralCode || '\u2014')}</span></div>
      <div class="info-item"><span class="info-item-label">Последний вход</span><span class="info-item-value">${escapeHtml(formatDate(state.user.lastLoginAt, true))}</span></div>
    </div>
  `;
}

function renderMemberLaunchpad() {
  const root = $('#member-launchpad');
  if (!root || !state.user) return;
  const onboarding = buildOnboardingSnapshot();
  const focus = safeArray(state.user.focusAreas).slice(0, 3);
  const nextStepText = onboarding.nextStep
    ? onboarding.nextStep.title
    : (state.shortLinks.length ? 'Масштабировать рабочие связки' : 'Кабинет готов к работе');

  root.innerHTML = `
    <div class="workspace-launchpad__grid">
      <article class="card">
        <span class="badge badge--accent">Готовность</span>
        <h4>${escapeHtml(`${onboarding.percent}% готовности кабинета`)}</h4>
        <p>${escapeHtml(onboarding.status === 'completed'
          ? 'Профиль, контекст и рабочее пространство уже собраны. Можно переходить к лендингам, рекламным материалам и партнёрскому росту.'
          : 'Заполни роль, цели и рабочий контекст, чтобы кабинет стал точнее и быстрее вёл к следующему действию.')}</p>
        <div class="profile-progress-bar" aria-hidden="true"><div class="profile-progress-fill" style="width:${Math.max(0, Math.min(100, onboarding.percent))}%"></div></div>
      </article>
      <article class="card">
        <span class="badge badge--muted">Сценарий</span>
        <strong>${escapeHtml(getRoleLabel(state.user.userRole))}</strong>
        <small>${escapeHtml(getExperienceLabel(state.user.experienceLevel))}</small>
      </article>
      <article class="card">
        <span class="badge badge--green">Следующий шаг</span>
        <strong>${escapeHtml(nextStepText)}</strong>
        <small>${escapeHtml(onboarding.primaryGoal || 'Сформируй цель и собери стартовый набор ссылок и материалов.')}</small>
      </article>
    </div>
    <div class="workspace-step-list">
      ${safeArray(onboarding.steps).map((item) => `
        <article class="onboarding-step ${item.completed ? 'onboarding-step--done' : ''}">
          <span class="onboarding-step-icon">${item.completed ? '\u2713' : '\u25CB'}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description || '')}</p>
        </article>
      `).join('')}
    </div>
    <div class="workspace-launchpad__grid">
      <article class="card">
        <span class="badge badge--muted">Ниша</span>
        <strong>${escapeHtml(focus.length ? focus.join(', ') : 'Пока не задан')}</strong>
        <small>${escapeHtml(state.user.goalsSummary || 'Добавь нишу, язык или продуктовый угол, чтобы AI и материалы стали точнее.')}</small>
      </article>
      <article class="card">
        <span class="badge badge--muted">Доступ</span>
        <strong>${escapeHtml(getAuthMethodsLabel(state.user.authMethods))}</strong>
        <small>${escapeHtml(state.user.preferredContact ? `Основной канал: ${state.user.preferredContact}` : 'Выбери удобный канал связи в профиле.')}</small>
      </article>
      <article class="card">
        <span class="badge badge--muted">Активность</span>
        <strong>${escapeHtml(`${formatNumber(state.shortLinks.length || 0)} коротких ссылок`)}</strong>
        <small>${escapeHtml(state.shortLinks.length ? 'У вас уже есть рабочие ссылки для запуска и тестирования трафика.' : 'Создай первую короткую ссылку, QR или AI-текст для старта продвижения.')}</small>
      </article>
    </div>
  `;
}

function renderProfileProgress() {
  const summaryRoot = $('#profile-progress');
  const stepsRoot = $('#profile-onboarding-steps');
  const button = $('#complete-onboarding-btn');
  if (!summaryRoot || !stepsRoot || !button || !state.user) return;
  const onboarding = buildOnboardingSnapshot();
  const goalText = onboarding.primaryGoal || 'Определи цель, чтобы кабинет подобрал правильный лендинг, материалы и следующий CTA.';

  summaryRoot.innerHTML = `
    <article class="card">
      <span class="badge badge--accent">Готовность профиля</span>
      <strong>${escapeHtml(`${onboarding.percent}%`)}</strong>
      <p>${escapeHtml(goalText)}</p>
      <div class="profile-progress-bar" aria-hidden="true"><div class="profile-progress-fill" style="width:${Math.max(0, Math.min(100, onboarding.percent))}%"></div></div>
    </article>
    <article class="card">
      <span class="badge badge--muted">Роль и канал</span>
      <strong>${escapeHtml(getRoleLabel(state.user.userRole))}</strong>
      <p>${escapeHtml(`Контакт: ${state.user.preferredContact || 'telegram'} \u00B7 Вход: ${getAuthMethodsLabel(state.user.authMethods)}`)}</p>
    </article>
  `;

  stepsRoot.innerHTML = safeArray(onboarding.steps).map((item) => `
    <article class="onboarding-step ${item.completed ? 'onboarding-step--done' : ''}">
      <span class="onboarding-step-icon">${item.completed ? '\u2713' : '\u25CB'}</span>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.description || '')}</p>
    </article>
  `).join('');

  button.disabled = onboarding.status === 'completed';
  button.textContent = onboarding.status === 'completed'
    ? 'Настройка кабинета завершена'
    : 'Завершить настройку кабинета';
  setStatus($('#complete-onboarding-status'), onboarding.status === 'completed' ? 'Настройка уже завершена.' : '');
}

function renderOverview() {
  if (!state.dashboard || !state.user) return;
  const workspace = getWorkspace();
  const promoCenter = getPromoCenter();
  const learningCenter = getLearningCenter();
  const mediaCenter = getMediaCenter();
  const onboarding = buildOnboardingSnapshot();
  const context = getActiveMarketingContext();
  const analyticsSnapshot = buildOverviewAnalyticsSnapshot(context);
  const landingCount = safeArray(workspace?.landingLinks).length;
  const promoItemsCount = safeArray(promoCenter?.categories).reduce((total, item) => total + safeArray(item.items).length, 0);
  const recommendedTrack = safeArray(learningCenter?.tracks)[0] || null;
  const currentMediaPack = getCurrentMediaPack();
  const currentPackCover = getPackCoverAsset(currentMediaPack);
  const pipelineSnapshot = buildLeadPipelineSnapshot(context);
  const leadBoardItems = getLeadBoardItems(context);
  const leadInboxItems = getLeadInboxItems(leadBoardItems, { limit: 5 });
  const recommendedPlaybooks = getRecommendedGrowthPlaybooks(pipelineSnapshot);
  const recommendedExperiments = getRecommendedGrowthExperiments(pipelineSnapshot);
  const nextStepTitle = onboarding.nextStep?.title || 'Кабинет готов к запуску';
  const nextStepDescription = onboarding.nextStep?.description || onboarding.primaryGoal || 'Сформируй рабочую цель, открой нужный лендинг и возьми первый комплект материалов.';
  const focusAreas = safeArray(state.user.focusAreas).slice(0, 3);
  const tasksPreview = safeArray(state.dashboard.tasksPreview?.length ? state.dashboard.tasksPreview : state.tasks).slice(0, 4);
  const accountTitleClean = state.user.displayName || state.user.email || (state.user.telegramUsername ? `@${state.user.telegramUsername}` : 'X Health user');
  const overviewCampaignCopy = getCampaignUiCopy(state.landingPreferences.language || getCurrentLandingWorkspace().language?.id || 'ru');
  const overviewCampaignRuntimes = getReferralCampaignPresets()
    .map((item) => buildCampaignRuntime(item, {
      landingId: item.landingId || getCurrentLandingWorkspace().landing?.id,
      languageId: state.landingPreferences.language || getCurrentLandingWorkspace().language?.id || 'ru',
    }))
    .filter(Boolean)
    .sort((left, right) => {
      const activeLandingId = getCurrentLandingWorkspace().landing?.id || '';
      const leftScore = left?.context?.landing?.id === activeLandingId ? 1 : 0;
      const rightScore = right?.context?.landing?.id === activeLandingId ? 1 : 0;
      return rightScore - leftScore;
    })
    .slice(0, 3);

  $('#dashboard-title').textContent = `Кабинет ${accountTitleClean}`;
  syncDashboardPanelMeta(state.activePanel || 'overview');
  renderMemberLaunchpad();
  syncDashboardHeroChips();

  if ($('#overview-command-center')) {
    $('#overview-command-center').innerHTML = `
      <div class="overview-command-grid">
        <article class="overview-card overview-card--primary">
          <span class="badge badge--accent">Операционный центр</span>
          <h4>${escapeHtml(getRoleLabel(state.user.userRole))} · ${escapeHtml(getExperienceLabel(state.user.experienceLevel))}</h4>
          <p>${escapeHtml(context?.journey?.summary || 'Кабинет собран как единое рабочее пространство: ссылка, лендинги, материалы, задачи и следующий лучший шаг находятся рядом.')}</p>
          <div class="overview-inline-stats">
            <span class="marketing-chip">${escapeHtml(onboarding.status === 'completed' ? 'настройка завершена' : 'кабинет в сборке')}</span>
            <span class="marketing-chip">${escapeHtml(state.user.preferredContact ? `канал: ${state.user.preferredContact}` : 'канал не выбран')}</span>
            <span class="marketing-chip">${escapeHtml(focusAreas.length ? focusAreas.join(', ') : 'ниша пока не задана')}</span>
          </div>
          <div class="product-card-actions">
            <button class="btn btn--primary btn--sm dashboard-panel-trigger" type="button" data-panel-target="links">Открыть мои ссылки</button>
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Выбрать лендинг</button>
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">Открыть задания</button>
          </div>
        </article>
        <article class="overview-card">
          <span class="badge badge--gold">Контур запуска</span>
          <div class="data-list">
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">1. Вести на сайт</div>
                <div class="data-item-sub">Мягкий вход через персональную ссылку и выбранный язык.</div>
              </div>
            </article>
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">2. Прогреть лендингом и материалами</div>
                <div class="data-item-sub">Дать человеку короткий сценарий без перегруза и лишних переходов.</div>
              </div>
            </article>
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">3. Перевести в компанию</div>
                <div class="data-item-sub">Когда доверие и интерес уже собраны, отправить в официальный контур по вашей ссылке.</div>
              </div>
            </article>
          </div>
        </article>
        <article class="overview-card overview-card--visual">
          <span class="badge badge--muted">Рекомендуемый визуал</span>
          ${currentPackCover?.imageUrl ? `
            <div class="overview-visual-cover">
              <img src="${escapeHtml(currentPackCover.imageUrl)}" alt="${escapeHtml(currentPackCover.title || 'visual')}" loading="lazy">
            </div>
          ` : ''}
          <h4>${escapeHtml(currentPackCover?.title || currentMediaPack?.title || 'Текущий сценарий')}</h4>
          <p>${escapeHtml(currentPackCover?.description || currentMediaPack?.summary || 'Выбранный сценарий уже привязан к рабочим материалам и лендингам. Используйте один визуальный контур везде, чтобы сайт, сообщения и кабинет выглядели цельно.')}</p>
          <div class="marketing-chip-list">
            ${safeArray(currentMediaPack?.hooks).slice(0, 3).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
          </div>
          <div class="product-card-actions">
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="media">Открыть медиацентр</button>
            <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть пакет</button>
          </div>
        </article>
      </div>
    `;
  }

  const metrics = [
    ['Баллы', state.dashboard.stats.points, '\u{1F4B0}'],
    ['Прямые рефералы', state.dashboard.stats.directReferrals, '\u{1F465}'],
    ['Всего в структуре', state.dashboard.stats.totalReferrals, '\u{1F310}'],
    ['Лендинги', landingCount, '\u{1F5FA}'],
    ['Короткие ссылки', state.shortLinks.length, '\u{1F517}'],
    ['Материалы', promoItemsCount, '\u{1F4DA}'],
    ['Открытые запросы', state.dashboard.support?.summary?.open || 0, '\u{1F4AC}'],
    ['Уведомления', state.dashboard.stats.unreadNotifications, '\u{1F514}'],
  ];

  $('#dashboard-metrics').innerHTML = metrics.map(([label, value, icon]) => `
    <article class="kpi-card">
      <div class="kpi-card-icon">${icon}</div>
      <div class="kpi-card-value">${formatNumber(value)}</div>
      <div class="kpi-card-label">${escapeHtml(label)}</div>
    </article>
  `).join('');

  const quickActions = [
    ...safeArray(state.dashboard.quickActions),
    { id: 'tasks', label: 'Открыть задания', view: 'tasks' },
    { id: 'faq', label: 'Открыть FAQ', view: 'faq' },
  ].filter((item, index, list) => list.findIndex((candidate) => candidate.view === item.view) === index);

  $('#quick-actions').innerHTML = quickActions.map((item) => `
    <button class="btn btn--ghost dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(item.view)}">${escapeHtml(item.label)}</button>
  `).join('');

  if ($('#overview-campaigns')) {
    $('#overview-campaigns').innerHTML = overviewCampaignRuntimes.length
      ? `<div class="campaign-grid">${overviewCampaignRuntimes.map((runtime) => buildCampaignCardMarkup(runtime, {
        panel: 'overview',
        compact: true,
        showTexts: false,
      })).join('')}</div>`
      : emptyState(overviewCampaignCopy.noCampaigns);
  }

  if ($('#overview-pipeline-engine')) {
    $('#overview-pipeline-engine').innerHTML = pipelineSnapshot
      ? `
        <div class="dashboard-stack">
          <div class="pipeline-stage-grid">
            ${safeArray(pipelineSnapshot.stages).map((item) => `
              <article class="data-card pipeline-stage-card ${item.isActive ? 'is-active' : ''}">
                <span class="badge ${item.isActive ? 'badge--accent' : item.isCompleted ? 'badge--green' : 'badge--muted'}">${escapeHtml(item.metricLabel || 'Stage')}</span>
                <h4>${escapeHtml(item.title || 'Этап')}</h4>
                <div class="kpi-card-value">${formatNumber(item.count || 0)}</div>
                <p>${escapeHtml(item.summary || '')}</p>
                <div class="data-list">
                  <article class="data-item">
                    <div class="data-item-main">
                      <div class="data-item-title">Фокус</div>
                      <div class="data-item-sub">${escapeHtml(item.focus || '')}</div>
                    </div>
                  </article>
                </div>
              </article>
            `).join('')}
          </div>
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Рекомендуемые playbooks</div>
                  <small>${escapeHtml(pipelineSnapshot.activeStage?.nextMove || 'Сценарии запуска под текущий этап.')}</small>
                </div>
                <span class="badge badge--gold">${escapeHtml(pipelineSnapshot.activeStage?.title || 'Фокус')}</span>
              </div>
              <div class="promo-material-grid">
                ${recommendedPlaybooks.length
                  ? recommendedPlaybooks.map((item) => buildGrowthPlaybookMarkup(item, { compact: true })).join('')
                  : emptyState('Playbooks подтянутся, когда система увидит текущий этап воронки.')}
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">A/B тест на следующий цикл</div>
                  <small>Что тестировать, чтобы не распыляться и усиливать рабочую механику</small>
                </div>
              </div>
              <div class="promo-material-grid">
                ${recommendedExperiments.length
                  ? recommendedExperiments.map((item) => buildGrowthExperimentMarkup(item)).join('')
                  : emptyState('Тесты появятся после выбора рабочего сценария и первых сигналов.')}
              </div>
            </article>
          </div>
        </div>
      `
      : emptyState('Pipeline и playbooks появятся после загрузки growth-модели.');
  }

  if ($('#overview-next-step')) {
    $('#overview-next-step').innerHTML = `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(nextStepTitle)}</div>
            <small>${escapeHtml(onboarding.status === 'completed' ? 'Кабинет готов к работе без дополнительных шагов настройки.' : 'Это действие даст самый заметный прирост по качеству кабинета прямо сейчас.')}</small>
          </div>
          <span class="badge ${onboarding.status === 'completed' ? 'badge--green' : 'badge--accent'}">${escapeHtml(`${onboarding.percent}% готовности`)}</span>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Что делаем сейчас</div>
              <div class="data-item-sub">${escapeHtml(nextStepDescription)}</div>
            </div>
          </article>
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Рекомендуемый раздел</div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(onboarding.nextStep?.id === 'profile' ? 'profile' : onboarding.nextStep?.id === 'focus' ? 'profile' : onboarding.nextStep?.id === 'protocol' ? 'landings' : onboarding.nextStep?.id === 'planner' ? 'tasks' : 'overview')}">${escapeHtml(onboarding.nextStep?.id === 'profile' ? 'Открыть профиль' : onboarding.nextStep?.id === 'focus' ? 'Настроить фокус' : onboarding.nextStep?.id === 'protocol' ? 'Открыть лендинги' : onboarding.nextStep?.id === 'planner' ? 'Открыть задания' : 'Открыть обзор')}</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="learning">Открыть обучение</button>
              </div>
            </div>
          </article>
        </div>
      </article>
    `;
  }

  if ($('#overview-leads-board')) {
    $('#overview-leads-board').innerHTML = buildLeadBoardMarkup(leadBoardItems.slice(0, 6), { compact: true });
  }

  if ($('#overview-lead-inbox')) {
    $('#overview-lead-inbox').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Кому писать сегодня</div>
              <small>Приоритетная очередь по follow-up, handoff и живому диалогу</small>
            </div>
            <span class="badge badge--accent">${escapeHtml(String(leadInboxItems.length))}</span>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Просрочено: ${escapeHtml(formatNumber(leadInboxItems.filter((item) => item.followUpStatusId === 'overdue').length))}</span>
            <span class="marketing-chip">Сегодня: ${escapeHtml(formatNumber(leadInboxItems.filter((item) => item.followUpStatusId === 'today').length))}</span>
            <span class="marketing-chip">Handoff: ${escapeHtml(formatNumber(leadInboxItems.filter((item) => item.stageId === 'handoff').length))}</span>
            <span class="marketing-chip">Диалог: ${escapeHtml(formatNumber(leadInboxItems.filter((item) => item.stageId === 'conversation').length))}</span>
          </div>
        </article>
        ${buildLeadInboxMarkup(leadInboxItems, { compact: true })}
      </div>
    `;
  }

  $('#recent-orders').innerHTML = workspace
    ? [
      { title: 'Главная ссылка на сайт', value: workspace.siteReferralLink, href: workspace.siteReferralLink },
      { title: 'Регистрация в компанию', value: workspace.companyReferralLink, href: workspace.companyReferralLink },
      { title: 'Каталог компании', value: workspace.companyCatalogLink || workspace.catalogLink, href: workspace.companyCatalogLink || workspace.catalogLink },
      { title: 'Официальный сайт компании', value: workspace.officialCompanyLink, href: workspace.officialCompanyLink },
    ].filter((item) => item.value).map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title)}</div>
          <div class="data-item-sub">${escapeHtml(item.value)}</div>
        </div>
        <div class="product-card-actions">
          ${copyButtonMarkup(item.value)}
          <a class="btn btn--ghost btn--sm" href="${escapeHtml(item.href)}" target="_blank" rel="noopener">Открыть</a>
        </div>
      </article>
    `).join('')
    : emptyState('Ссылки появятся после загрузки партнёрского профиля.');

  if ($('#overview-focus')) {
    $('#overview-focus').innerHTML = `
      <div class="overview-focus-grid">
        <article class="overview-card">
          <span class="badge badge--muted">Ниша</span>
          <h4>${escapeHtml(focusAreas.length ? focusAreas.join(', ') : 'Пока не задана')}</h4>
          <p>${escapeHtml(state.user.goalsSummary || 'Добавь нишу, язык или продуктовый угол, чтобы AI, лендинги и материалы стали точнее.')}</p>
        </article>
        <article class="overview-card">
          <span class="badge badge--muted">Обучение</span>
          <h4>${escapeHtml(recommendedTrack?.title || 'Старт партнёра')}</h4>
          <p>${escapeHtml(recommendedTrack?.description || 'Выбери трек, чтобы превратить кабинет в понятную систему действий.')}</p>
        </article>
        <article class="overview-card">
          <span class="badge badge--muted">Следующий рост</span>
          <h4>${escapeHtml(context?.analytics?.recommendations?.[0] || 'Подготовить связку: лендинг + материал + короткая ссылка')}</h4>
          <p>${escapeHtml(context?.analytics?.recommendations?.[1] || 'После сборки первой связки проще перейти к дубликации и повторяемому росту.')}</p>
        </article>
      </div>
    `;
  }

  if ($('#overview-analytics-deck')) {
    $('#overview-analytics-deck').innerHTML = context
      ? `
        <div class="dashboard-stack">
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Воронка и конверсия</div>
                  <small>Что уже происходит внутри текущего запуска</small>
                </div>
                <span class="badge badge--accent">${escapeHtml(`${analyticsSnapshot.authRate}% auth`)}</span>
              </div>
              <div class="kpi-grid">
                <article class="kpi-card">
                  <div class="kpi-card-value">${formatNumber(analyticsSnapshot.visits)}</div>
                  <div class="kpi-card-label">Визиты</div>
                </article>
                <article class="kpi-card">
                  <div class="kpi-card-value">${formatNumber(analyticsSnapshot.authCompletes)}</div>
                  <div class="kpi-card-label">Входы</div>
                </article>
                <article class="kpi-card">
                  <div class="kpi-card-value">${formatNumber(analyticsSnapshot.referralsShared)}</div>
                  <div class="kpi-card-label">Шаринг</div>
                </article>
                <article class="kpi-card">
                  <div class="kpi-card-value">${formatNumber(analyticsSnapshot.directReferrals)}</div>
                  <div class="kpi-card-label">Прямые регистрации</div>
                </article>
              </div>
              <div class="marketing-chip-list">
                <span class="marketing-chip">AI-сигналы: ${escapeHtml(formatNumber(analyticsSnapshot.aiSignals))}</span>
                <span class="marketing-chip">Share rate: ${escapeHtml(`${analyticsSnapshot.shareRate}%`)}</span>
                <span class="marketing-chip">Direct/share: ${escapeHtml(`${analyticsSnapshot.directRate}%`)}</span>
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Что сейчас сильнее всего</div>
                  <small>Канал, поверхность и действие, которые дают наибольшие сигналы</small>
                </div>
              </div>
              <div class="data-list">
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Лучший источник</div>
                    <div class="data-item-sub">${escapeHtml(analyticsSnapshot.topSource ? `${labelizeMarketingSource(analyticsSnapshot.topSource.source)} · ${formatNumber(analyticsSnapshot.topSource.count)}` : 'Пока данных мало для выделения источника.')}</div>
                  </div>
                </article>
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Активный раздел</div>
                    <div class="data-item-sub">${escapeHtml(analyticsSnapshot.topPanel ? `${labelizeDashboardPanel(analyticsSnapshot.topPanel.panel)} · ${formatNumber(analyticsSnapshot.topPanel.count)}` : 'Секции пока только набирают данные.')}</div>
                  </div>
                </article>
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">CTA / сценарий</div>
                    <div class="data-item-sub">${escapeHtml(analyticsSnapshot.topCta ? `${analyticsSnapshot.topCta.label} · ${formatNumber(analyticsSnapshot.topCta.count)}` : 'Главный CTA определится после нескольких касаний.')}</div>
                  </div>
                </article>
              </div>
              <div class="marketing-chip-list">
                <span class="marketing-chip">Лендинг: ${escapeHtml(analyticsSnapshot.topLanding ? labelizeLandingSignal(analyticsSnapshot.topLanding.landingId) : labelizeLandingSignal(getCurrentLandingWorkspace().landing?.id))}</span>
                <span class="marketing-chip">Язык: ${escapeHtml(analyticsSnapshot.topLanguage ? labelizeLanguageSignal(analyticsSnapshot.topLanguage.languageId) : getCurrentLandingWorkspace().languageName)}</span>
                <span class="marketing-chip">Событие: ${escapeHtml(analyticsSnapshot.topEvent ? labelizeMarketingEvent(analyticsSnapshot.topEvent.eventType) : 'Нет доминанты')}</span>
              </div>
            </article>
          </div>
          <div class="overview-grid overview-grid--two">
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(analyticsSnapshot.weakestLabel)}</div>
                  <small>Главная точка усиления прямо сейчас</small>
                </div>
              </div>
              <p>${escapeHtml(analyticsSnapshot.weakestText)}</p>
              <div class="data-list">
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Следующий тест</div>
                    <div class="data-item-sub">${escapeHtml(analyticsSnapshot.recommendation)}</div>
                  </div>
                </article>
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">Что не теряем</div>
                    <div class="data-item-sub">${escapeHtml(analyticsSnapshot.secondaryRecommendation)}</div>
                  </div>
                </article>
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть материалы</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tools">Открыть инструменты</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="landings">Проверить лендинг</button>
              </div>
            </article>
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Последние сигналы</div>
                  <small>${escapeHtml(currentMediaPack?.title || 'Текущий сценарий')}</small>
                </div>
                <span class="badge badge--muted">${escapeHtml(String(safeArray(context.recentEvents).length || 0))}</span>
              </div>
              <div class="data-list">
                ${analyticsSnapshot.recentSignals.length
                  ? analyticsSnapshot.recentSignals.map((item) => `
                    <article class="data-item">
                      <div class="data-item-main">
                        <div class="data-item-title">${escapeHtml(labelizeMarketingEvent(item.eventType))}</div>
                        <div class="data-item-sub">${escapeHtml(item.ctaLabel || item.panel ? `${item.ctaLabel || 'без CTA'} · ${labelizeDashboardPanel(item.panel || '')}` : 'Зафиксирован новый сигнал активности.')}</div>
                      </div>
                      <div class="product-card-actions">
                        <small>${escapeHtml(formatDate(item.createdAt, true))}</small>
                      </div>
                    </article>
                  `).join('')
                  : `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">Как только появятся первые визиты, открытия, копирования и шаринг, здесь будут показаны последние сигналы.</div></div></article>`}
              </div>
            </article>
          </div>
          ${mediaCenter ? `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">Рекомендуемый пакет для усиления</div>
                  <small>${escapeHtml(currentMediaPack?.title || 'Пакет ещё не выбран')}</small>
                </div>
              </div>
              <div class="marketing-chip-list">
                ${safeArray(currentMediaPack?.assetChecklist).slice(0, 6).map((item) => `<span class="marketing-chip">${escapeHtml(item)}</span>`).join('')}
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="materials">Открыть пакет</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="learning">Открыть обучение</button>
              </div>
            </article>
          ` : ''}
        </div>
      `
      : emptyState('Аналитика появится после первых визитов, открытий, копирований и партнёрских касаний.');
  }

  $('#notifications-list').innerHTML = state.notifications.length
    ? state.notifications.slice(0, 6).map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title || 'Уведомление')}</div>
          <div class="data-item-sub">${escapeHtml(item.message || '')}</div>
        </div>
        <div class="product-card-actions">
          ${!item.readAt ? `<button class="btn btn--ghost btn--sm notification-read-btn" type="button" data-notification-id="${escapeHtml(item.id)}">Прочитано</button>` : ''}
          ${item.actionView ? `<button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(item.actionView)}">${escapeHtml(item.actionLabel || 'Открыть')}</button>` : ''}
        </div>
      </article>
    `).join('')
    : emptyState('Новых уведомлений пока нет.');

  if ($('#overview-tasks-preview')) {
    $('#overview-tasks-preview').innerHTML = tasksPreview.length
      ? `
        <div class="data-list">
          ${tasksPreview.map((item) => `
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">${escapeHtml(item.title || 'Задание')}</div>
                <div class="data-item-sub">${escapeHtml(item.description || item.category || 'Рабочее действие для запуска')}</div>
              </div>
              <div class="product-card-actions">
                <span class="badge ${item.priority === 'high' ? 'badge--danger' : 'badge--muted'}">${escapeHtml(item.priority || 'medium')}</span>
                <button class="btn btn--ghost btn--sm task-toggle-btn" type="button" data-task-id="${escapeHtml(item.id)}" data-completed="${item.status === 'done' ? 'false' : 'true'}">
                  ${escapeHtml(item.status === 'done' ? 'Вернуть' : 'Готово')}
                </button>
              </div>
            </article>
          `).join('')}
          <article class="data-item">
            <div class="data-item-main">
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="tasks">Открыть все задания</button>
              </div>
            </div>
          </article>
        </div>
      `
      : emptyState('Здесь появятся задания для старта. Можно открыть раздел «Задания» и добавить первую рабочую задачу.');
  }

  $('#activity-timeline').innerHTML = state.activity.length
    ? state.activity.map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title || 'Событие')}</div>
          <div class="data-item-sub">${escapeHtml(item.text || '')}</div>
        </div>
        <div class="product-card-actions">
          <small>${escapeHtml(formatDate(item.createdAt, true))}</small>
          ${item.view ? `<button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="${escapeHtml(item.view)}">Открыть</button>` : ''}
        </div>
      </article>
    `).join('')
    : emptyState('Активность появится после первых действий в кабинете.');
}

function renderRoadmap() {
  const protocols = safeArray(state.protocols?.items);
  const activeProtocol = protocols.find((item) => item.isActive) || null;

  $('#roadmap-active-protocol').innerHTML = activeProtocol
    ? `
      <article class="data-card">
        <div class="data-card-header">${escapeHtml(activeProtocol.title)}</div>
        <div class="data-list">
          <div class="data-item">
            <div>${escapeHtml(activeProtocol.summary || '')}</div>
            <small>${escapeHtml(activeProtocol.audience || 'Сценарий')} \u2022 ${escapeHtml(String(activeProtocol.durationDays || 0))} дней</small>
          </div>
          <div class="data-item">
            <strong>Прогресс</strong>
            <div>${escapeHtml(String(activeProtocol.progress?.completedTasks || 0))}/${escapeHtml(String(activeProtocol.progress?.totalTasks || 0))} задач</div>
          </div>
        </div>
      </article>
    `
    : emptyState('Активного сценария пока нет. Выбери сценарий из библиотеки ниже.');

  $('#roadmap-protocols').innerHTML = protocols.length
    ? protocols.map((item) => `
      <article class="data-item">
        <strong>${escapeHtml(item.title)}</strong>
        <div>${escapeHtml(item.summary || '')}</div>
        <small>${escapeHtml(item.audience || 'Сценарий')} \u2022 ${escapeHtml(String(item.durationDays || 0))} дней</small>
        <div class="product-card-actions">
          <button class="btn btn--primary protocol-activate-btn" type="button" data-protocol-id="${escapeHtml(item.id)}">${escapeHtml(item.isActive ? 'Активен' : 'Активировать')}</button>
          ${saveButton('protocol', item.id)}
        </div>
      </article>
    `).join('')
    : emptyState('Сценарии пока не загружены.');

  $('#roadmap-steps').innerHTML = activeProtocol
    ? `
      ${safeArray(activeProtocol.steps).map((item) => `
        <article class="data-item">
          <strong>${escapeHtml(item.title)}</strong>
          <div>${escapeHtml(item.text || '')}</div>
        </article>
      `).join('')}
      ${safeArray(activeProtocol.outcomes).map((item) => `
        <article class="data-item">
          <strong>Outcome</strong>
          <div>${escapeHtml(item)}</div>
        </article>
      `).join('')}
    `
    : emptyState('После активации сценария здесь появятся шаги и ожидаемые результаты.');
}

function legacyRenderTasksPanel() {
  const taskIcons = ['\u{1F4DD}', '\u2705', '\u{1F4C2}', '\u{1F4CA}'];
  if ($('#tasks-summary')) {
    $('#tasks-summary').innerHTML = [
      ['Открытые', state.tasks.filter((item) => item.status !== 'done').length],
      ['Выполненные', state.tasks.filter((item) => item.status === 'done').length],
      ['Из сценариев', state.tasks.filter((item) => item.source === 'protocol').length],
      ['Всего', state.tasks.length],
    ].map(([label, value], idx) => `
      <article class="kpi-card">
        <div class="kpi-card-icon">${taskIcons[idx] || '\u{1F4CA}'}</div>
        <div class="kpi-card-value">${formatNumber(value)}</div>
        <div class="kpi-card-label">${escapeHtml(label)}</div>
      </article>
    `).join('');
  }

  const protocolSelect = $('#task-protocol-select');
  if (protocolSelect) {
    const currentValue = protocolSelect.value;
    const options = safeArray(state.dashboard?.memberPortal?.protocolTemplates);
    protocolSelect.innerHTML = [
      '<option value="">Без сценария</option>',
      ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`),
    ].join('');
    if (safeArray(options).some((item) => item.id === currentValue)) {
      protocolSelect.value = currentValue;
    }
  }

  $('#tasks-list').innerHTML = state.tasks.length
    ? state.tasks.map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title)}</div>
          <div class="data-item-sub">${escapeHtml(item.description || '')}</div>
          <small><span class="badge ${item.priority === 'high' ? 'badge--danger' : 'badge--muted'}">${escapeHtml(item.priority || 'medium')}</span> ${escapeHtml(item.category || 'general')} \u2022 ${escapeHtml(item.dueAt ? formatDate(item.dueAt) : 'без срока')}</small>
        </div>
        <div class="product-card-actions">
          <button class="btn btn--ghost btn--sm task-toggle-btn" type="button" data-task-id="${escapeHtml(item.id)}" data-completed="${item.status === 'done' ? 'false' : 'true'}">
            ${escapeHtml(item.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненным')}
          </button>
        </div>
      </article>
    `).join('')
    : emptyState('Задач пока нет. Добавь первую рабочую задачу или активируй сценарий запуска.');
}

async function loadQuestsData() {
  try {
    const res = await apiFetch('/cabinet/api/quests');
    if (res && res.ok) {
      state.quests = res;
      renderQuestsPanel();
    }
  } catch (e) { /* silent */ }
}

function renderQuestsPanel() {
  const q = state.quests || {};
  const totalXp = q.totalXp || 0;
  const loginStreak = q.loginStreak || 0;
  const chapters = q.chapters || [];
  const dailyQuests = q.dailyQuests || [];
  const completedCount = q.completedCount || 0;
  const totalCount = q.totalCount || 50;
  const overallPct = Math.round((completedCount / totalCount) * 100);

  // Streak multiplier
  const streakMult = loginStreak >= 30 ? '×2' : loginStreak >= 14 ? '×1.5' : loginStreak >= 7 ? '×1.5' : '×1';

  const container = $('#quests-panel');
  if (!container) return;

  container.innerHTML = `
    <!-- HEADER: XP + STREAK -->
    <div class="quest-header">
      <div class="quest-xp-block">
        <div class="quest-xp-value">⚡ ${formatNumber(totalXp)} XP</div>
        <div class="quest-xp-label">Всего заработано</div>
      </div>
      <div class="quest-streak-block ${loginStreak >= 7 ? 'quest-streak--hot' : ''}">
        <div class="quest-streak-value">🔥 ${loginStreak}</div>
        <div class="quest-streak-label">дней подряд · бонус ${streakMult}</div>
      </div>
      <div class="quest-progress-block">
        <div class="quest-xp-value">${completedCount} / ${totalCount}</div>
        <div class="quest-xp-label">Заданий выполнено</div>
        <div class="quest-bar-wrap"><div class="quest-bar-fill" style="width:${overallPct}%"></div></div>
      </div>
    </div>

    <!-- DAILY QUESTS -->
    <div class="quest-daily-section">
      <div class="quest-section-title">📋 Задания на сегодня</div>
      <div class="quest-daily-grid">
        ${dailyQuests.map((dq) => `
          <article class="quest-daily-card ${dq.completed ? 'quest-card--done' : ''}">
            <span class="quest-icon">${escapeHtml(dq.icon || '🎯')}</span>
            <div class="quest-daily-body">
              <div class="quest-daily-title">${escapeHtml(dq.title)}</div>
              <div class="quest-daily-xp">+${dq.xp} XP</div>
            </div>
            ${dq.completed
              ? '<span class="quest-done-badge">✓</span>'
              : dq.type === 'manual'
                ? `<button class="btn btn--primary btn--sm quest-complete-btn" data-quest-id="${escapeHtml(dq.id)}" data-xp="${dq.xp}">Выполнил</button>`
                : dq.action
                  ? `<button class="btn btn--ghost btn--sm dashboard-panel-trigger" data-panel-target="${escapeHtml(dq.action.panel)}">Перейти</button>`
                  : ''
            }
          </article>
        `).join('')}
      </div>
    </div>

    <!-- CHAPTERS -->
    <div class="quest-chapters">
      ${chapters.map((ch) => `
        <div class="quest-chapter ${ch.unlocked ? '' : 'quest-chapter--locked'}">
          <div class="quest-chapter-header" data-chapter="${ch.id}">
            <div class="quest-chapter-left">
              <span class="quest-chapter-emoji">${escapeHtml(ch.emoji)}</span>
              <div>
                <div class="quest-chapter-title">Глава ${ch.id}: ${escapeHtml(ch.title)}</div>
                <div class="quest-chapter-desc">${escapeHtml(ch.description)}</div>
              </div>
            </div>
            <div class="quest-chapter-right">
              ${ch.unlocked
                ? `<div class="quest-chapter-pct">${ch.progressPct}%</div>
                   <div class="quest-bar-wrap quest-bar--chapter"><div class="quest-bar-fill" style="width:${ch.progressPct}%"></div></div>
                   <span class="quest-chapter-count">${ch.completedCount}/${ch.totalCount}</span>
                   <span class="quest-chapter-toggle">▼</span>`
                : `<span class="quest-lock">🔒 Выполни ${ch.unlockThreshold - (chapters[ch.id-2]?.completedCount || 0)} заданий в гл.${ch.id-1}</span>`
              }
            </div>
          </div>
          ${ch.unlocked ? `
            <div class="quest-list quest-list--collapsed" id="quest-list-${ch.id}">
              ${ch.quests.map((qst) => `
                <article class="quest-item ${qst.completed ? 'quest-item--done' : ''}">
                  <span class="quest-item-icon">${escapeHtml(qst.icon || '🎯')}</span>
                  <div class="quest-item-body">
                    <div class="quest-item-title">${escapeHtml(qst.title)}</div>
                    <div class="quest-item-desc">${escapeHtml(qst.description)}</div>
                    <div class="quest-item-meta">
                      <span class="quest-xp-badge">+${qst.xp} XP</span>
                      <span class="quest-repeat-badge">${qst.repeatType === 'once' ? 'Один раз' : qst.repeatType === 'daily' ? 'Ежедневно' : qst.repeatType === 'weekly' ? 'Еженедельно' : 'Ежемесячно'}</span>
                      ${qst.type === 'auto' ? '<span class="quest-auto-badge">Авто</span>' : ''}
                    </div>
                  </div>
                  <div class="quest-item-action">
                    ${qst.completed
                      ? '<span class="quest-done-badge">✓ Выполнено</span>'
                      : qst.type === 'manual'
                        ? `<button class="btn btn--primary btn--sm quest-complete-btn" data-quest-id="${escapeHtml(qst.id)}" data-xp="${qst.xp}">Выполнил</button>`
                        : qst.action
                          ? `<button class="btn btn--ghost btn--sm dashboard-panel-trigger" data-panel-target="${escapeHtml(qst.action.panel)}">${escapeHtml(qst.action.label)}</button>`
                          : '<span class="quest-auto-hint">Выполняется автоматически</span>'
                    }
                  </div>
                </article>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
  `;

  // Toggle chapters
  container.querySelectorAll('.quest-chapter-header').forEach((header) => {
    header.addEventListener('click', () => {
      const chId = header.dataset.chapter;
      const list = $(`#quest-list-${chId}`);
      if (list) list.classList.toggle('quest-list--collapsed');
      const toggle = header.querySelector('.quest-chapter-toggle');
      if (toggle) toggle.textContent = list && list.classList.contains('quest-list--collapsed') ? '▼' : '▲';
    });
  });

  // Complete manual quests
  container.querySelectorAll('.quest-complete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const questId = btn.dataset.questId;
      const xp = Number(btn.dataset.xp) || 0;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const res = await apiFetch(`/api/quests/${questId}/complete`, { method: 'POST' });
        if (res && res.ok) {
          showToast(`+${xp} XP! Задание выполнено 🎯`, 'success');
          await loadQuestsData();
        }
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Выполнил';
      }
    });
  });
}

function renderTasksPanel() {
  // Load quests if not yet loaded
  if (!state.quests) {
    loadQuestsData();
  } else {
    renderQuestsPanel();
  }

  // Legacy parts kept for compatibility (lead inbox, playbooks etc)
  const openTasks = state.tasks.filter((item) => item.status !== 'done');
  const completedTasks = state.tasks.filter((item) => item.status === 'done');
  const overdueTasks = openTasks.filter((item) => item.dueAt && Date.parse(item.dueAt) < Date.now());
  const highPriorityTasks = openTasks.filter((item) => item.priority === 'high');
  const leadBoardItems = getLeadBoardItems();
  const leadInboxItems = getLeadInboxItems(leadBoardItems, { limit: 8 });
  const dueLeadCount = leadInboxItems.filter((item) => ['overdue', 'today'].includes(String(item.followUpStatusId || ''))).length;
  const templates = buildTaskTemplates();
  const automationActions = buildAutomationActions();
  const growth = getGrowthModel();
  const pipelineSnapshot = buildLeadPipelineSnapshot();
  const recommendedPlaybooks = getRecommendedGrowthPlaybooks(pipelineSnapshot);
  const recommendedExperiments = getRecommendedGrowthExperiments(pipelineSnapshot);
  const priorityLabels = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

  if ($('#tasks-summary')) {
    $('#tasks-summary').innerHTML = [
      ['Открытые', openTasks.length, '📝'],
      ['Выполненные', completedTasks.length, '✅'],
      ['Лиды на сегодня', dueLeadCount, '💬'],
      ['Высокий приоритет', highPriorityTasks.length, '⚡'],
      ['Просроченные', overdueTasks.length, '⏱'],
    ].map(([label, value, icon]) => `
      <article class="kpi-card">
        <div class="kpi-card-icon">${icon}</div>
        <div class="kpi-card-value">${formatNumber(value)}</div>
        <div class="kpi-card-label">${escapeHtml(label)}</div>
      </article>
    `).join('');
  }

  if ($('#tasks-focus')) {
    $('#tasks-focus').innerHTML = `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(growth.current.title)}</div>
            <small>${escapeHtml(growth.current.summary)}</small>
          </div>
          <span class="badge badge--accent">${escapeHtml(`${growth.progress}%`)}</span>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Фокус недели</div>
              <div class="data-item-sub">${escapeHtml(openTasks[0]?.title || 'Собрать лендинг, материалы и короткую ссылку в один рабочий пакет.')}</div>
            </div>
          </article>
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Что подтянет рост</div>
              <div class="data-item-sub">${escapeHtml(growth.next ? `До уровня «${growth.next.title}» осталось ${formatNumber(growth.remainingToNext)} очков активности.` : 'Кабинет уже вышел на верхний этап. Теперь задача — поддерживать ритм команды и дубликации.')}</div>
            </div>
          </article>
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">CRM-фокус</div>
              <div class="data-item-sub">${escapeHtml(leadInboxItems[0] ? `${leadInboxItems[0].title}: ${leadInboxItems[0].nextMove || leadInboxItems[0].stageSummary || 'Подготовить следующее касание.'}` : 'Как только появятся лиды с интересом или follow-up, здесь будет виден главный контакт на сегодня.')}</div>
            </div>
          </article>
        </div>
      </article>
    `;
  }

  if ($('#tasks-missions')) {
    $('#tasks-missions').innerHTML = templates.length
      ? `
        <div class="promo-material-grid">
          ${templates.map((item) => `
            <article class="promo-material-card">
              <span class="badge ${item.exists ? 'badge--muted' : 'badge--accent'}">${escapeHtml(item.priority === 'high' ? 'Сейчас' : 'Шаблон')}</span>
              <h4>${escapeHtml(item.title)}</h4>
              <small>${escapeHtml(item.category)} · ${escapeHtml(item.dueAt ? formatDate(item.dueAt) : 'без срока')}</small>
              <p>${escapeHtml(item.description)}</p>
              <div class="marketing-chip-list">
                ${safeArray(item.tags).map((tag) => `<span class="marketing-chip">${escapeHtml(tag)}</span>`).join('')}
              </div>
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm task-template-btn" type="button" data-template-id="${escapeHtml(item.id)}" ${item.exists ? 'disabled' : ''}>${escapeHtml(item.exists ? 'Уже добавлено' : 'Добавить в задачи')}</button>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('Шаблоны миссий появятся после загрузки кабинета.');
  }

  const protocolSelect = $('#task-protocol-select');
  if (protocolSelect) {
    const currentValue = protocolSelect.value;
    const options = safeArray(state.dashboard?.memberPortal?.protocolTemplates);
    protocolSelect.innerHTML = [
      '<option value="">Без сценария</option>',
      ...options.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`),
    ].join('');
    if (safeArray(options).some((item) => item.id === currentValue)) {
      protocolSelect.value = currentValue;
    }
  }

  if ($('#tasks-automation')) {
    $('#tasks-automation').innerHTML = `
      <div class="promo-material-grid">
        ${automationActions.map((item) => `
          <article class="promo-material-card">
            <span class="badge ${item.disabled ? 'badge--muted' : 'badge--accent'}">${escapeHtml(item.disabled ? 'Нужна ссылка' : 'Быстрый запуск')}</span>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.description)}</p>
            <div class="product-card-actions">
              <button class="btn btn--ghost btn--sm automation-prefill-btn" type="button" data-automation-action="${escapeHtml(item.id)}" ${item.disabled ? 'disabled' : ''}>${escapeHtml(item.actionLabel)}</button>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  if ($('#tasks-lead-inbox')) {
    $('#tasks-lead-inbox').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Follow-up очередь</div>
              <small>Кого дожимать сегодня, чтобы не терять тёплые сигналы</small>
            </div>
            <span class="badge badge--gold">${escapeHtml(String(dueLeadCount))}</span>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Всего в очереди: ${escapeHtml(formatNumber(leadInboxItems.length))}</span>
            <span class="marketing-chip">Закреплено: ${escapeHtml(formatNumber(leadInboxItems.filter((item) => item.pinned).length))}</span>
            <span class="marketing-chip">С задачей: ${escapeHtml(formatNumber(state.tasks.filter((item) => String(item.category || '').trim() === 'followup').length))}</span>
          </div>
        </article>
        ${buildLeadInboxMarkup(leadInboxItems)}
      </div>
    `;
  }

  if ($('#tasks-playbooks')) {
    $('#tasks-playbooks').innerHTML = pipelineSnapshot
      ? `
        <div class="dashboard-stack">
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">${escapeHtml(pipelineSnapshot.activeStage?.title || 'Текущий этап')}</div>
                <small>${escapeHtml(pipelineSnapshot.activeStage?.summary || 'Сценарии под текущую стадию роста.')}</small>
              </div>
              <span class="badge badge--accent">${escapeHtml(pipelineSnapshot.activeStage?.metricLabel || 'Stage')}</span>
            </div>
            <div class="marketing-chip-list">
              ${safeArray(pipelineSnapshot.stages).map((item) => `<span class="marketing-chip">${escapeHtml(`${item.title}: ${formatNumber(item.count || 0)}`)}</span>`).join('')}
            </div>
          </article>
          <div class="promo-material-grid">
            ${recommendedPlaybooks.length
              ? recommendedPlaybooks.map((item) => buildGrowthPlaybookMarkup(item)).join('')
              : emptyState('Playbooks подтянутся, когда система увидит, на каком этапе вы сейчас сильнее всего.')}
            ${recommendedExperiments.length
              ? recommendedExperiments.map((item) => buildGrowthExperimentMarkup(item)).join('')
              : ''}
          </div>
        </div>
      `
      : emptyState('Playbooks и A/B тесты появятся после загрузки growth-модели.');
  }

  const sortedTasks = [...state.tasks].sort((a, b) => {
    const aDone = a.status === 'done' ? 1 : 0;
    const bDone = b.status === 'done' ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const priorityWeight = { high: 0, medium: 1, low: 2 };
    const aPriority = priorityWeight[a.priority] ?? 3;
    const bPriority = priorityWeight[b.priority] ?? 3;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return Date.parse(a.dueAt || '2999-12-31') - Date.parse(b.dueAt || '2999-12-31');
  });

  $('#tasks-list').innerHTML = sortedTasks.length
    ? `
      <div class="data-list">
        ${sortedTasks.map((item) => `
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">${escapeHtml(item.title)}</div>
              <div class="data-item-sub">${escapeHtml(item.description || 'Рабочее действие для запуска и роста кабинета.')}</div>
              <div class="marketing-chip-list">
                <span class="marketing-chip">${escapeHtml(priorityLabels[item.priority] || item.priority || 'Средний')}</span>
                <span class="marketing-chip">${escapeHtml(item.category || 'general')}</span>
                <span class="marketing-chip">${escapeHtml(item.dueAt ? formatDate(item.dueAt) : 'без срока')}</span>
                ${safeArray(item.tags).slice(0, 3).map((tag) => `<span class="marketing-chip">${escapeHtml(tag)}</span>`).join('')}
              </div>
            </div>
            <div class="product-card-actions">
              <button class="btn btn--ghost btn--sm task-toggle-btn" type="button" data-task-id="${escapeHtml(item.id)}" data-completed="${item.status === 'done' ? 'false' : 'true'}">${escapeHtml(item.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненным')}</button>
            </div>
          </article>
        `).join('')}
      </div>
    `
    : emptyState('Задач пока нет. Добавьте первую рабочую задачу или используйте готовые шаблоны выше.');
}

function renderSaved() {
  $('#saved-protocols').innerHTML = safeArray(state.saved?.protocols).length
    ? safeArray(state.saved.protocols).map((item) => `
      <article class="data-item">
        <strong>${escapeHtml(item.title)}</strong>
        <div>${escapeHtml(item.summary || '')}</div>
        <div class="product-card-actions">${saveButton('protocol', item.id)}</div>
      </article>
    `).join('')
    : emptyState('Сохранённых сценариев пока нет.');

  $('#saved-products').innerHTML = safeArray(state.saved?.products).length
    ? safeArray(state.saved.products).map((item) => buildProductCard(item, true)).join('')
    : emptyState('Сохранённых продуктов пока нет.');

  $('#saved-content').innerHTML = safeArray(state.saved?.content).length
    ? safeArray(state.saved.content).map((item) => buildContentCard(item, true)).join('')
    : emptyState('Сохранённых материалов пока нет.');
}

function legacyRenderRatingPanel() {
  const overview = state.partner?.overview || null;
  const directReferralsList = safeArray(overview?.directReferralsList).slice(0, 5);
  const rewards = safeArray(state.partner?.rewards || state.site?.partner?.rewards);
  const levels = safeArray(state.partner?.levels || state.site?.partner?.levels);

  $('#rating-snapshot').innerHTML = overview
    ? `
      <div class="overview-grid overview-grid--two">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Снимок структуры</div>
              <small>Текущая позиция и ближайший рост</small>
            </div>
          </div>
          <div class="kpi-grid">
            <article class="kpi-card">
              <div class="kpi-card-icon">\u{1F4B0}</div>
              <div class="kpi-card-value">${formatNumber(overview.points || 0)}</div>
              <div class="kpi-card-label">Баллы</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-icon">\u{1F465}</div>
              <div class="kpi-card-value">${formatNumber(overview.directReferrals || 0)}</div>
              <div class="kpi-card-label">Прямые рефералы</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-icon">\u{1F310}</div>
              <div class="kpi-card-value">${formatNumber(overview.totalReferrals || 0)}</div>
              <div class="kpi-card-label">Вся структура</div>
            </article>
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Первая линия</div>
              <small>Кого вы уже провели в систему</small>
            </div>
          </div>
          <div class="data-list">
            ${directReferralsList.length
              ? directReferralsList.map((item) => `
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-title">${escapeHtml(item.displayName || item.email || `User ${item.id}`)}</div>
                    <div class="data-item-sub">${escapeHtml(item.email || item.telegramUsername || 'Контакт скрыт')}</div>
                  </div>
                </article>
              `).join('')
              : `<article class="data-item"><div class="data-item-main"><div class="data-item-sub">Структура пока пустая. Следующий шаг — дать людям мягкий вход через сайт и подходящий лендинг.</div></div></article>`}
          </div>
        </article>
      </div>
    `
    : emptyState('Партнёрская статистика пока недоступна.');

  $('#rating-levels').innerHTML = levels.map((item) => `
    <article class="data-item">
      <div class="data-item-main">
        <div class="data-item-title">${escapeHtml(item.title)} • ${escapeHtml(item.share)}</div>
        <div class="data-item-sub">${escapeHtml(item.focus || '')}</div>
      </div>
    </article>
  `).join('') || emptyState('Уровни пока не загружены.');

  $('#rating-rewards').innerHTML = rewards.length
    ? rewards.map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title)} • ${escapeHtml(item.value || '')}</div>
          <div class="data-item-sub">${escapeHtml(item.note || '')}</div>
        </div>
      </article>
    `).join('')
    : emptyState('Награды и правила роста пока не загружены.');
}

function renderRatingPanel() {
  const overview = state.partner?.overview || null;
  const growth = getGrowthModel();
  const leadBoardItems = getLeadBoardItems();
  const leadSummary = getLeadSummary();
  const followUpPlannedCount = leadBoardItems.filter((item) => item?.followUpAt).length;
  const pinnedLeadCount = leadBoardItems.filter((item) => item?.pinned).length;
  const selectedLead = getLeadBoardEntryByVisitorId(state.leadDeskEditorVisitorId) || leadBoardItems[0] || null;
  const directReferralsList = safeArray(overview?.directReferralsList).slice(0, 6);
  const rewards = safeArray(state.partner?.rewards || state.site?.partner?.rewards);
  const levels = safeArray(state.partner?.levels || state.site?.partner?.levels);
  const focusItems = [
    state.shortLinks.length
      ? `У вас уже есть ${formatNumber(state.shortLinks.length)} коротких ссылок. Следующий шаг — закрепить их за конкретными языками и источниками.`
      : 'Соберите первую короткую ссылку и QR, чтобы зафиксировать реальный рабочий канал продвижения.',
    directReferralsList.length
      ? 'Первая линия уже появилась. Самое время собрать пакет дубликации и передать его новым партнёрам.'
      : 'Пока первая линия пустая. Сфокусируйтесь на мягком входе через сайт и подходящий лендинг.',
    growth.next
      ? `До уровня «${growth.next.title}» осталось ${formatNumber(growth.remainingToNext)} очков активности.`
      : 'Вы вышли на верхний этап роста. Дальше важнее удерживать ритм, качество и поддержку команды.',
  ];

  $('#rating-snapshot').innerHTML = overview
    ? `
      <div class="overview-grid overview-grid--two">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Снимок партнёра</div>
              <small>Живые показатели текущего кабинета</small>
            </div>
            <span class="badge badge--accent">${escapeHtml(growth.current.title)}</span>
          </div>
          <div class="kpi-grid">
            <article class="kpi-card">
              <div class="kpi-card-icon">💰</div>
              <div class="kpi-card-value">${formatNumber(overview.points || 0)}</div>
              <div class="kpi-card-label">Баллы</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-icon">👥</div>
              <div class="kpi-card-value">${formatNumber(overview.directReferrals || 0)}</div>
              <div class="kpi-card-label">Прямые партнёры</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-icon">🌐</div>
              <div class="kpi-card-value">${formatNumber(overview.totalReferrals || 0)}</div>
              <div class="kpi-card-label">Вся структура</div>
            </article>
          </div>
        </article>
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Операционный индекс</div>
              <small>Внутренний индикатор готовности кабинета к росту</small>
            </div>
          </div>
          <div class="kpi-grid">
            <article class="kpi-card">
              <div class="kpi-card-value">${formatNumber(growth.score)}</div>
              <div class="kpi-card-label">Индекс роста</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-value">${formatNumber(state.tasks.filter((item) => item.status === 'done').length)}</div>
              <div class="kpi-card-label">Выполнено задач</div>
            </article>
            <article class="kpi-card">
              <div class="kpi-card-value">${formatNumber(state.shortLinks.length)}</div>
              <div class="kpi-card-label">Короткие ссылки</div>
            </article>
          </div>
        </article>
      </div>
    `
    : emptyState('Партнёрская статистика пока недоступна.');

  if ($('#rating-next-level')) {
    $('#rating-next-level').innerHTML = `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">${escapeHtml(growth.next ? growth.next.title : growth.current.title)}</div>
            <small>${escapeHtml(growth.next ? 'Следующий этап роста кабинета' : 'Верхний этап уже достигнут')}</small>
          </div>
          <span class="badge badge--gold">${escapeHtml(`${growth.progress}%`)}</span>
        </div>
        <p>${escapeHtml(growth.next ? growth.next.summary : growth.current.summary)}</p>
        <div class="profile-progress-bar" aria-hidden="true"><div class="profile-progress-fill" style="width:${Math.max(0, Math.min(100, growth.progress))}%"></div></div>
        <div class="marketing-chip-list">
          <span class="marketing-chip">Индекс: ${escapeHtml(formatNumber(growth.score))}</span>
          ${growth.next ? `<span class="marketing-chip">Осталось: ${escapeHtml(formatNumber(growth.remainingToNext))}</span>` : '<span class="marketing-chip">Рост зафиксирован</span>'}
        </div>
      </article>
    `;
  }

  if ($('#rating-focus')) {
    $('#rating-focus').innerHTML = `
      <div class="data-list">
        ${focusItems.map((item) => `
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Фокус роста</div>
              <div class="data-item-sub">${escapeHtml(item)}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  $('#rating-levels').innerHTML = levels.length
    ? `
      <div class="data-list">
        ${levels.map((item) => `
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">${escapeHtml(item.title)} • ${escapeHtml(item.share)}</div>
              <div class="data-item-sub">${escapeHtml(item.focus || '')}</div>
            </div>
          </article>
        `).join('')}
      </div>
    `
    : emptyState('Уровни пока не загружены.');

  if ($('#rating-leaderboard')) {
    $('#rating-leaderboard').innerHTML = directReferralsList.length
      ? `
        <div class="data-list">
          ${directReferralsList.map((item, index) => `
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">${escapeHtml(`${index + 1}. ${item.displayName || item.email || `User ${item.id}`}`)}</div>
                <div class="data-item-sub">${escapeHtml(item.email || item.telegramUsername || 'Контакт скрыт')}</div>
              </div>
              <div class="product-card-actions">
                <span class="badge ${index === 0 ? 'badge--gold' : 'badge--muted'}">${escapeHtml(index === 0 ? 'Опора первой линии' : 'Партнёр в структуре')}</span>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('Когда появятся первые прямые партнёры, здесь будет виден ритм первой линии и опорные точки роста.');
  }

  if ($('#rating-leads-board')) {
    $('#rating-leads-board').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Распределение лидов по стадиям</div>
              <small>Живой поток по вашему referral code, а не только внутренняя активность кабинета</small>
            </div>
          </div>
          <div class="marketing-chip-list">
            <span class="marketing-chip">Внимание: ${escapeHtml(formatNumber(leadSummary?.byStage?.awareness || 0))}</span>
            <span class="marketing-chip">Интерес: ${escapeHtml(formatNumber(leadSummary?.byStage?.interest || 0))}</span>
            <span class="marketing-chip">Диалог: ${escapeHtml(formatNumber(leadSummary?.byStage?.conversation || 0))}</span>
            <span class="marketing-chip">Перевод: ${escapeHtml(formatNumber(leadSummary?.byStage?.handoff || 0))}</span>
            <span class="marketing-chip">Дубликация: ${escapeHtml(formatNumber(leadSummary?.byStage?.duplication || 0))}</span>
            <span class="marketing-chip">Follow-up: ${escapeHtml(formatNumber(followUpPlannedCount))}</span>
            <span class="marketing-chip">Закреплено: ${escapeHtml(formatNumber(pinnedLeadCount))}</span>
          </div>
        </article>
        ${buildLeadBoardMarkup(leadBoardItems.slice(0, 12))}
      </div>
    `;
  }

  if ($('#lead-desk-editor')) {
    $('#lead-desk-editor').innerHTML = buildLeadDeskEditorMarkup(selectedLead);
  }

  $('#rating-rewards').innerHTML = rewards.length
    ? rewards.map((item) => `
      <article class="data-item">
        <div class="data-item-main">
          <div class="data-item-title">${escapeHtml(item.title)} • ${escapeHtml(item.value || '')}</div>
          <div class="data-item-sub">${escapeHtml(item.note || '')}</div>
        </div>
      </article>
    `).join('')
    : emptyState('Награды и правила роста пока не загружены.');
}

function legacyRenderFaqPanel() {
  const learningCenter = getLearningCenter();
  const supportCategories = safeArray(state.profileMeta?.memberPortal?.supportCategories || state.site?.memberPortal?.supportCategories || state.support?.supportCategories);
  const contactModes = safeArray(state.support?.contactModes || state.site?.support?.contactModes);

  if ($('#faq-grid')) {
    $('#faq-grid').innerHTML = safeArray(learningCenter?.faq).map((item) => `
      <article class="data-card">
        <div class="data-card-header">
          <div class="data-card-title">${escapeHtml(item.q || 'Вопрос')}</div>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-sub">${escapeHtml(item.a || '')}</div>
            </div>
          </article>
        </div>
      </article>
    `).join('') || emptyState('FAQ пока не загружен.');
  }

  if ($('#faq-support')) {
    $('#faq-support').innerHTML = `
      <article class="data-card">
        <div class="data-card-header">
          <div>
            <div class="data-card-title">Куда эскалировать вопрос</div>
            <small>Когда FAQ уже не закрывает ситуацию</small>
          </div>
        </div>
        <div class="data-list">
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Темы обращений</div>
              <div class="marketing-chip-list">
                ${supportCategories.map((item) => `<span class="marketing-chip">${escapeHtml(item.label || item.title || item.id)}</span>`).join('')}
              </div>
            </div>
          </article>
          <article class="data-item">
            <div class="data-item-main">
              <div class="data-item-title">Способы связи</div>
              <div class="marketing-chip-list">
                ${contactModes.map((item) => `<span class="marketing-chip">${escapeHtml(item.title || item.id)}</span>`).join('')}
              </div>
            </div>
          </article>
          <article class="data-item">
            <div class="data-item-main">
              <div class="product-card-actions">
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="support">Открыть поддержку</button>
                <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="ai">Спросить AI</button>
              </div>
            </div>
          </article>
        </div>
      </article>
    `;
  }
}

function renderFaqPanel() {
  const learningCenter = getLearningCenter();
  const supportCategories = safeArray(state.profileMeta?.memberPortal?.supportCategories || state.site?.memberPortal?.supportCategories || state.support?.supportCategories);
  const contactModes = safeArray(state.support?.contactModes || state.site?.support?.contactModes);
  const escalationRoutes = safeArray(learningCenter?.escalation);
  const supportScripts = safeArray(learningCenter?.supportScripts);
  const faqItems = getFaqLibraryItems();
  const filters = state.faqFilters || { query: '', category: 'all' };
  const query = String(filters.query || '').trim().toLowerCase();
  const categories = [
    { id: 'all', label: 'Все' },
    { id: 'start', label: 'Старт' },
    { id: 'landings', label: 'Лендинги' },
    { id: 'materials', label: 'Материалы' },
    { id: 'products', label: 'Продукты' },
    { id: 'languages', label: 'Языки' },
    { id: 'company', label: 'Компания' },
    { id: 'automation', label: 'Автоматизация' },
    { id: 'support', label: 'Поддержка' },
  ];
  const filteredItems = faqItems.filter((item) => {
    const matchesCategory = filters.category === 'all' || item.category === filters.category;
    const haystack = `${item.q || ''} ${item.a || ''}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesCategory && matchesQuery;
  });

  if ($('#faq-search-box')) {
    $('#faq-search-box').innerHTML = `
      <article class="data-card">
        <div class="form-group">
          <label class="form-label" for="faq-search-input">Поиск по базе знаний</label>
          <input id="faq-search-input" class="form-input" type="search" placeholder="Например: лендинг, регистрация, языки, выплаты" value="${escapeHtml(filters.query || '')}">
        </div>
      </article>
    `;
  }

  if ($('#faq-categories')) {
    $('#faq-categories').innerHTML = `
      <div class="marketing-chip-list">
        ${categories.map((item) => {
          const count = item.id === 'all'
            ? faqItems.length
            : faqItems.filter((faq) => faq.category === item.id).length;
          return `<button class="btn btn--ghost btn--sm faq-category-btn ${item.id === filters.category ? 'is-active' : ''}" type="button" data-faq-category="${escapeHtml(item.id)}">${escapeHtml(`${item.label} (${count})`)}</button>`;
        }).join('')}
      </div>
    `;
  }

  if ($('#faq-grid')) {
    $('#faq-grid').innerHTML = filteredItems.length
      ? `
        <div class="promo-material-grid">
          ${filteredItems.map((item) => `
            <article class="data-card">
              <div class="data-card-header">
                <div>
                  <div class="data-card-title">${escapeHtml(item.q || 'Вопрос')}</div>
                  <small>${escapeHtml(item.category || 'faq')}</small>
                </div>
                <span class="badge badge--muted">${escapeHtml(item.category || 'faq')}</span>
              </div>
              <div class="data-list">
                <article class="data-item">
                  <div class="data-item-main">
                    <div class="data-item-sub">${escapeHtml(item.a || '')}</div>
                    ${safeArray(item.tags).length ? `
                      <div class="marketing-chip-list">
                        ${safeArray(item.tags).map((tag) => `<span class="marketing-chip">${escapeHtml(tag)}</span>`).join('')}
                      </div>
                    ` : ''}
                  </div>
                </article>
              </div>
            </article>
          `).join('')}
        </div>
      `
      : emptyState('По текущему фильтру ничего не найдено. Попробуйте другой запрос или категорию.');
  }

  if ($('#faq-escalation')) {
    $('#faq-escalation').innerHTML = `
      <div class="overview-grid overview-grid--two">
        ${(escalationRoutes.length ? escalationRoutes : [
          {
            title: 'Самопомощь внутри кабинета',
            description: 'Когда вопрос можно закрыть внутри системы без живого ответа.',
            tools: ['FAQ', 'Обучение', 'AI-помощник'],
          },
          {
            title: 'Эскалация в поддержку',
            description: 'Когда нужен живой разбор по регистрации, выплатам или технике.',
            tools: ['Поддержка', 'Регистрация', 'Выплаты', 'Техвопросы'],
          },
        ]).map((item, index) => `
          <article class="data-card">
            <div class="data-card-header">
              <div>
                <div class="data-card-title">${escapeHtml(`${index + 1}. ${item.title || 'Сценарий'}`)}</div>
                <small>${escapeHtml(item.description || '')}</small>
              </div>
            </div>
            <div class="marketing-chip-list">
              ${safeArray(item.tools).map((tool) => `<span class="marketing-chip">${escapeHtml(tool)}</span>`).join('')}
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  if ($('#faq-support')) {
    $('#faq-support').innerHTML = `
      <div class="dashboard-stack">
        <article class="data-card">
          <div class="data-card-header">
            <div>
              <div class="data-card-title">Куда эскалировать вопрос</div>
              <small>Когда FAQ уже не закрывает ситуацию</small>
            </div>
          </div>
          <div class="data-list">
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Темы обращений</div>
                <div class="marketing-chip-list">
                  ${supportCategories.map((item) => `<span class="marketing-chip">${escapeHtml(item.label || item.title || item.id)}</span>`).join('')}
                </div>
              </div>
            </article>
            <article class="data-item">
              <div class="data-item-main">
                <div class="data-item-title">Способы связи</div>
                <div class="marketing-chip-list">
                  ${contactModes.map((item) => `<span class="marketing-chip">${escapeHtml(item.title || item.id)}</span>`).join('')}
                </div>
              </div>
            </article>
            <article class="data-item">
              <div class="data-item-main">
                <div class="product-card-actions">
                  <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="support">Открыть поддержку</button>
                  <button class="btn btn--ghost btn--sm dashboard-panel-trigger" type="button" data-panel-target="ai">Спросить AI</button>
                </div>
              </div>
            </article>
          </div>
        </article>
        ${supportScripts.length ? `
          <div class="promo-material-grid">
            ${supportScripts.map((item) => `
              <article class="promo-material-card">
                <span class="badge badge--muted">${escapeHtml(item.subtitle || 'Поддержка')}</span>
                <h4>${escapeHtml(item.title || 'Шаблон')}</h4>
                <p>${escapeHtml(item.text || '')}</p>
                <div class="product-card-actions">
                  ${copyButtonMarkup(item.text || '', 'Копировать текст', 'faq_support')}
                </div>
              </article>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }
}

function renderWithdrawals() {
  $('#withdrawals-list').innerHTML = state.withdrawals.length
    ? state.withdrawals.map((item) => {
        const statusClass = item.status === 'paid' ? 'badge--green' : item.status === 'rejected' ? 'badge--danger' : 'badge--muted';
        return `
      <article class="data-item">
        <strong>${escapeHtml(formatCurrency(item.amount, 'RUB'))}</strong>
        <div>${escapeHtml(item.method || 'Способ не указан')} \u2022 ${escapeHtml(item.payoutDetails || '\u2014')}</div>
        <small><span class="badge ${statusClass}">${escapeHtml(item.status || 'pending')}</span> ${escapeHtml(formatDate(item.createdAt, true))}</small>
      </article>
    `;}).join('')
    : emptyState('История выводов пока пуста.');
}

function renderSupport() {
  const supportCategories = safeArray(state.profileMeta?.memberPortal?.supportCategories || state.support?.supportCategories);
  $('#support-topics').innerHTML = safeArray(state.support?.topics).map((item) => `
    <span class="chip">${escapeHtml(item.title || item.id)}</span>
  `).join('');

  $('#support-contact-modes').innerHTML = safeArray(state.support?.contactModes).map((item) => `
    <span class="chip chip--accent">${escapeHtml(item.title || item.id)}</span>
  `).join('');

  const topicSelect = $('#support-form select[name="topic"]');
  if (topicSelect && supportCategories.length) {
    const currentValue = topicSelect.value;
    topicSelect.innerHTML = supportCategories.map((item) => `
      <option value="${escapeHtml(item.id)}">${escapeHtml(item.label || item.title || item.id)}</option>
    `).join('');
    topicSelect.value = supportCategories.some((item) => item.id === currentValue)
      ? currentValue
      : supportCategories[0].id;
  }

  $('#support-items').innerHTML = safeArray(state.support?.items).length
    ? safeArray(state.support.items).map((item) => {
        const statusClass = item.status === 'closed' ? 'badge--green' : 'badge--muted';
        return `
      <article class="data-item">
        <strong>${escapeHtml(item.subject || item.topic || 'Запрос')}</strong>
        <div>${escapeHtml(item.message || '')}</div>
        <small>${escapeHtml(item.preferredContact || 'telegram')} \u2022 <span class="badge ${statusClass}">${escapeHtml(item.status || 'open')}</span> \u2022 ${escapeHtml(formatDate(item.createdAt, true))}</small>
      </article>
    `;}).join('')
    : emptyState('История обращений пока пуста.');
}

function populateProfileForm() {
  if (!state.user) return;
  const form = $('#profile-form');
  if (!form) return;

  const roleOptions = safeArray(state.profileMeta?.roles);
  const levelOptions = safeArray(state.profileMeta?.levels);
  const contactOptions = safeArray(state.profileMeta?.support?.contactModes || state.support?.contactModes);

  if (form.userRole && roleOptions.length) {
    form.userRole.innerHTML = roleOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
  }
  if (form.experienceLevel && levelOptions.length) {
    form.experienceLevel.innerHTML = levelOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
  }
  if (form.preferredContact && contactOptions.length) {
    form.preferredContact.innerHTML = contactOptions.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join('');
  }

  if (form.displayName) form.displayName.value = state.user.displayName || '';
  if (form.userRole) form.userRole.value = state.user.userRole || form.userRole.value;
  if (form.experienceLevel) form.experienceLevel.value = state.user.experienceLevel || form.experienceLevel.value;
  if (form.city) form.city.value = state.user.city || '';
  if (form.phone) form.phone.value = state.user.profile?.phone || '';
  if (form.country) form.country.value = state.user.profile?.country || '';
  if (form.timezone) form.timezone.value = state.user.profile?.timezone || '';
  if (form.focusAreas) form.focusAreas.value = safeArray(state.user.focusAreas).join(', ');
  if (form.goalsSummary) form.goalsSummary.value = state.user.goalsSummary || '';
  if (form.preferredContact) form.preferredContact.value = state.user.preferredContact || form.preferredContact.value;
  if (form.notificationEmail) form.notificationEmail.checked = state.user.notificationSettings?.email !== false;
  if (form.notificationTelegram) form.notificationTelegram.checked = state.user.notificationSettings?.telegram !== false;
  if (form.notificationBrowser) form.notificationBrowser.checked = state.user.notificationSettings?.browser !== false;
  if (form.notificationReminders) form.notificationReminders.checked = state.user.notificationSettings?.reminders !== false;
  if (form.notificationDigest) form.notificationDigest.checked = state.user.notificationSettings?.digest === true;
}

function renderDashboard() {
  if (!state.user || !state.dashboard) return;
  renderProfileInfo();
  renderWorkspaceTopbar();
  renderOverview();
  renderLinksPanel();
  renderLandingsPanel();
  renderMaterialsPanel();
  renderMediaCenterPanel();
  renderToolsPanel();
  renderTasksPanel();
  renderRatingPanel();
  renderLearningPanel();
  renderFaqPanel();
  renderProducts();
  renderWithdrawals();
  renderSupport();
  renderAiPrompts();
  renderAiChat();
  populateProfileForm();
  renderProfileProgress();
  renderMarketingSurfaces();
  syncDashboardHeroChips();
  if ($('#open-shop-link')) $('#open-shop-link').href = state.site?.links?.shop || '#';
  showDashboard(true);
  activatePanel(state.pendingPanel || state.activePanel || 'overview');
  state.pendingPanel = null;
}

function resetProtectedState() {
  state.user = null;
  state.dashboard = null;
  state.partner = null;
  state.shortLinks = [];
  state.withdrawals = [];
  state.aiMessages = [];
  state.orders = [];
  state.profileMeta = null;
  state.protocols = null;
  state.tasks = [];
  state.saved = null;
  state.support = null;
  state.notifications = [];
  state.activity = [];
  state.mediaLibraryItems = [];
  state.mediaLibraryMeta = {
    canManage: false,
    mode: 'owner_fallback',
  };
  state.mediaLibraryEditorId = null;
  state.leadDeskEditorVisitorId = null;
  state.toolResults = {
    utmBuilder: null,
    qr: null,
    hashtags: [],
    captions: [],
    bioHub: null,
    socialKit: null,
    imageStudio: null,
    removeBg: null,
    ogImage: null,
    bannerStudio: null,
    pdfKit: null,
  };
  state.toolsPreferences = {
    activeTool: 'overview',
  };
  showDashboard(false);
  syncDashboardHeroChips();
}

async function loadProtectedData() {
  try {
    const [
      dashboardRes,
      profileRes,
      protocolsRes,
      savedRes,
      tasksRes,
      supportRes,
      notificationsRes,
      activityRes,
      partnerRes,
      withdrawalsRes,
      shortenerRes,
      mediaLibraryRes,
      aiRes,
      ordersRes,
    ] = await Promise.all([
      api('/cabinet/api/dashboard'),
      api('/cabinet/api/profile'),
      api('/cabinet/api/protocols'),
      api('/cabinet/api/saved'),
      api('/cabinet/api/tasks'),
      api('/cabinet/api/support'),
      api('/cabinet/api/notifications'),
      api('/cabinet/api/activity'),
      api('/cabinet/api/partner'),
      api('/cabinet/api/withdrawals'),
      api('/cabinet/api/shortener/links'),
      api('/cabinet/api/media-library'),
      api('/cabinet/api/ai/messages'),
      api('/cabinet/api/orders'),
    ]);

    state.dashboard = dashboardRes.dashboard;
    state.user = profileRes.user;
    state.profileMeta = profileRes;
    state.protocols = protocolsRes.protocols;
    state.saved = savedRes.saved;
    state.tasks = tasksRes.items || [];
    state.support = supportRes;
    state.notifications = notificationsRes.items || [];
    state.activity = activityRes.items || [];
    state.partner = partnerRes;
    state.withdrawals = withdrawalsRes.items || [];
    state.shortLinks = shortenerRes.items || [];
    state.mediaLibraryItems = mediaLibraryRes.items || [];
    state.mediaLibraryMeta = mediaLibraryRes.permissions || { canManage: false, mode: 'owner_fallback' };
    state.mediaLibraryEditorId = null;
    state.aiMessages = aiRes.items || [];
    state.orders = ordersRes.items || [];
    setMarketingContext(dashboardRes.dashboard?.marketing || partnerRes.marketing || state.marketing);
    renderDashboard();
  } catch (error) {
    if (error?.payload?.reason === 'auth_required') {
      clearBotAuthFlow();
      resetProtectedState();
    }
    throw error;
  }
}

async function checkBotAuthStatus() {
  if (!state.botAuthRequestId) return;
  try {
    const result = await api(`/api/auth/bot/status?requestId=${encodeURIComponent(state.botAuthRequestId)}&visitorId=${encodeURIComponent(state.visitorId || '')}`);
    if (result.status === 'authenticated') {
      clearBotAuthFlow();
      state.user = result.user;
      if (result.context) setMarketingContext(result.context);
      closeAuth();
      setTelegramHint('Вход через Telegram подтверждён.');
      setStatus($('#auth-status'), '');
      await trackMarketingEvent('auth_complete', {
        ctaId: 'telegram_auth',
        ctaLabel: 'telegram_auth',
        panel: 'auth',
      });
      await syncMarketingVisit('auth_complete');
      await loadProtectedData();
      scrollToId('dashboard');
      return;
    }
    if (result.status === 'expired') {
      clearBotAuthFlow();
      setStatus($('#auth-status'), 'Ссылка для входа истекла. Запусти Telegram-вход ещё раз.', true);
      setTelegramHint('Сессия Telegram истекла. Нажми кнопку ещё раз.', true);
      return;
    }
    setStatus($('#auth-status'), 'Открой Telegram, нажми Start в боте и вернись на сайт.');
  } catch {
    clearBotAuthFlow();
    setStatus($('#auth-status'), 'Не удалось проверить вход через Telegram.', true);
    setTelegramHint('Проверь, открылся ли бот и нажата ли команда Start.', true);
  }
}

async function startTelegramAuth() {
  if (!state.auth?.botEnabled) {
    setStatus($('#auth-status'), 'Telegram-вход сейчас недоступен.', true);
    return;
  }
  clearBotAuthFlow();
  try {
    setStatus($('#auth-status'), 'Готовим вход через Telegram...');
    const result = await api('/cabinet/api/auth/bot/start', {
      method: 'POST',
      body: '{}',
    });
    state.botAuthRequestId = result.requestId;
    setTelegramHint(`Подтверди вход внутри @${result.botUsername}.`);
    setStatus($('#auth-status'), 'Откроется бот. Нажми Start и вернись в браузер.');
    if (result.botUrl) window.open(result.botUrl, '_blank', 'noopener');
    state.botAuthPollTimer = window.setInterval(() => {
      checkBotAuthStatus().catch(() => {});
    }, 2500);
    state.botAuthDeadlineTimer = window.setTimeout(() => {
      clearBotAuthFlow();
      setStatus($('#auth-status'), 'Время ожидания истекло. Попробуй снова.', true);
      setTelegramHint('Подтверждение в Telegram не завершилось вовремя.', true);
    }, 10 * 60 * 1000);
    await checkBotAuthStatus();
  } catch {
    clearBotAuthFlow();
    setStatus($('#auth-status'), 'Не удалось запустить вход через Telegram.', true);
    setTelegramHint('Сервис не смог подготовить Telegram-сессию.', true);
  }
}

async function submitProductOrder(productId) {
  if (!requireUser('products')) return;
  try {
    const result = await api('/cabinet/api/orders', {
      method: 'POST',
      body: JSON.stringify({ productId, quantity: 1 }),
    });
    await trackMarketingEvent('order_create', {
      panel: 'products',
      ctaId: productId,
      ctaLabel: 'order_product',
      intentHint: 'product',
    });
    if (result.redirectUrl) window.open(result.redirectUrl, '_blank', 'noopener');
    await loadProtectedData();
    activatePanel('products');
  } catch {
    window.alert('Не удалось отправить заявку на продукт.');
  }
}

async function toggleSaved(kind, itemId) {
  if (!requireUser(kind === 'protocol' ? 'roadmap' : kind === 'content' ? 'content' : 'saved')) return;
  try {
    const result = await api('/cabinet/api/saved/toggle', {
      method: 'POST',
      body: JSON.stringify({ kind, itemId }),
    });
    await trackMarketingEvent('saved_toggle', {
      panel: kind === 'protocol' ? 'roadmap' : kind === 'content' ? 'content' : 'saved',
      ctaId: itemId,
      ctaLabel: `saved_${kind}`,
      intentHint: kind,
    });
    state.saved = result.saved;
    renderDashboard();
  } catch {
    window.alert('Не удалось обновить сохранённое.');
  }
}

async function activateProtocol(protocolId) {
  if (!requireUser('roadmap')) return;
  try {
    await api('/cabinet/api/protocols/activate', {
      method: 'POST',
      body: JSON.stringify({ protocolId }),
    });
    await trackMarketingEvent('protocol_activate', {
      panel: 'roadmap',
      ctaId: protocolId,
      ctaLabel: 'activate_protocol',
      intentHint: 'protocol',
    });
    await loadProtectedData();
    activatePanel('roadmap');
  } catch {
    window.alert('Не удалось активировать сценарий.');
  }
}

async function toggleTask(taskId, completed) {
  if (!requireUser('tasks')) return;
  try {
    await api('/cabinet/api/tasks/toggle', {
      method: 'POST',
      body: JSON.stringify({ taskId, completed }),
    });
    await trackMarketingEvent('task_toggle', {
      panel: 'tasks',
      ctaId: taskId,
      ctaLabel: completed ? 'task_complete' : 'task_reopen',
    });
    await loadProtectedData();
    activatePanel('tasks');
  } catch {
    window.alert('Не удалось обновить задачу.');
  }
}

async function markNotificationRead(notificationId) {
  if (!requireUser('overview')) return;
  try {
    const result = await api('/cabinet/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify({ notificationId }),
    });
    await trackMarketingEvent('notification_read', {
      panel: 'overview',
      ctaId: notificationId,
      ctaLabel: 'notification_read',
    });
    state.notifications = result.items || [];
    renderOverview();
  } catch {
    window.alert('Не удалось отметить уведомление.');
  }
}

function buildRegisterPayload(form) {
  const focusAreas = parseFocusAreas(form.get('focusAreas'));
  const goalsSummary = String(form.get('goalsSummary') || '').trim();
  const completedSteps = ['profile'];
  if (focusAreas.length || goalsSummary) completedSteps.push('focus');
  return {
    displayName: form.get('displayName'),
    email: form.get('email'),
    password: form.get('password'),
    referralCode: form.get('referralCode'),
    userRole: form.get('userRole') || 'hybrid',
    experienceLevel: form.get('experienceLevel') || 'new',
    preferredContact: form.get('preferredContact') || 'telegram',
    focusAreas,
    goalsSummary,
    preferences: {
      preferredContact: form.get('preferredContact') || 'telegram',
    },
    onboarding: {
      status: completedSteps.length > 1 ? 'in_progress' : 'pending',
      currentStep: completedSteps.includes('focus') ? 'protocol' : 'focus',
      completedSteps,
      primaryGoal: goalsSummary,
      focusAreas,
      goalsSummary,
      experienceLevel: form.get('experienceLevel') || 'new',
      preferredPace: 'steady',
      communicationStyle: form.get('preferredContact') === 'email' ? 'structured' : 'guided',
    },
    visitorId: state.visitorId,
  };
}

function buildProfilePayload(form) {
  const focusAreas = parseFocusAreas(form.focusAreas?.value || '');
  const goalsSummary = form.goalsSummary?.value || '';
  const completedSteps = ['profile'];
  if (focusAreas.length || goalsSummary) completedSteps.push('focus');
  if (state.user?.activeProtocolId || state.dashboard?.activeProtocol) completedSteps.push('protocol');
  if (safeArray(state.tasks).length || Number(state.dashboard?.planner?.summary?.total || 0) > 0) completedSteps.push('planner');

  return {
    displayName: form.displayName?.value || '',
    userRole: form.userRole?.value || '',
    experienceLevel: form.experienceLevel?.value || '',
    city: form.city?.value || '',
    focusAreas,
    goalsSummary,
    preferredContact: form.preferredContact?.value || '',
    profile: {
      phone: form.phone?.value || '',
      country: form.country?.value || '',
      timezone: form.timezone?.value || '',
    },
    notificationSettings: {
      email: Boolean(form.notificationEmail?.checked),
      telegram: Boolean(form.notificationTelegram?.checked),
      browser: Boolean(form.notificationBrowser?.checked),
      reminders: Boolean(form.notificationReminders?.checked),
      digest: Boolean(form.notificationDigest?.checked),
    },
    onboarding: {
      completedSteps,
      currentStep: completedSteps.includes('planner')
        ? 'completed'
        : completedSteps.includes('protocol')
          ? 'planner'
          : completedSteps.includes('focus')
            ? 'protocol'
            : 'focus',
      primaryGoal: goalsSummary,
      focusAreas,
      goalsSummary,
      experienceLevel: form.experienceLevel?.value || 'new',
      status: completedSteps.length >= 4 ? 'completed' : (completedSteps.length > 1 ? 'in_progress' : 'pending'),
    },
  };
}

function bindEvents() {
  $('#open-auth-btn')?.addEventListener('click', async () => {
    if (state.user) {
      showDashboard(true);
      scrollToId('dashboard');
      activatePanel(state.activePanel || 'overview');
      return;
    }
    await trackMarketingEvent('cta_click', {
      ctaId: 'header_login',
      ctaLabel: 'header_login',
      panel: 'auth',
    });
    openAuth('login');
  });

  $('#open-register-btn')?.addEventListener('click', async () => {
    if (state.user) {
      showDashboard(true);
      scrollToId('dashboard');
      return;
    }
    await trackMarketingEvent('cta_click', {
      ctaId: 'header_register',
      ctaLabel: 'header_register',
      panel: 'auth',
    });
    openAuth('register');
  });

  $('#hero-primary-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    await performMarketingAction(
      button.dataset.actionKind || (state.user ? 'scroll' : 'auth'),
      button.dataset.actionTarget || (state.user ? 'dashboard' : 'register'),
      button.dataset.actionId || 'hero_primary',
      button.textContent,
    );
  });

  $('#hero-secondary-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    await performMarketingAction(
      button.dataset.actionKind || 'scroll',
      button.dataset.actionTarget || 'products-section',
      button.dataset.actionId || 'hero_secondary',
      button.textContent,
    );
  });

  $('#cta-register-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    await performMarketingAction(
      button.dataset.actionKind || (state.user ? 'scroll' : 'auth'),
      button.dataset.actionTarget || (state.user ? 'dashboard' : 'register'),
      button.dataset.actionId || 'cta_primary',
      button.textContent,
    );
  });

  $('#cta-login-btn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    await performMarketingAction(
      button.dataset.actionKind || 'auth',
      button.dataset.actionTarget || 'login',
      button.dataset.actionId || 'cta_login',
      button.textContent,
    );
  });
  $('#close-auth-btn')?.addEventListener('click', closeAuth);
  $('#telegram-auth-btn')?.addEventListener('click', async () => {
    await trackMarketingEvent('telegram_auth_start', {
      ctaId: 'telegram_auth',
      ctaLabel: 'telegram_auth',
      panel: 'auth',
    });
    startTelegramAuth().catch(() => {});
  });

  $all('.auth-switcher__item').forEach((button) => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
  });

  $all('#register-form input[name="userRole"]').forEach((input) => {
    input.addEventListener('change', syncAuthChoiceCards);
  });

  $('#register-form input[name="referralCode"]')?.addEventListener('input', syncRegisterReferralBanner);

  $('#login-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#auth-status'), 'Входим...');
      const result = await api('/cabinet/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: form.get('email'),
          password: form.get('password'),
          visitorId: state.visitorId,
        }),
      });
      clearBotAuthFlow();
      state.user = result.user;
      closeAuth();
      setStatus($('#auth-status'), '');
      await trackMarketingEvent('auth_complete', {
        ctaId: 'login_submit',
        ctaLabel: 'login_submit',
        panel: 'auth',
      });
      await syncMarketingVisit('auth_complete');
      await loadProtectedData();
      scrollToId('dashboard');
    } catch {
      setStatus($('#auth-status'), 'Не удалось войти. Проверь email и пароль.', true);
    }
  });

  $('#register-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#auth-status'), 'Создаём кабинет...');
      const result = await api('/cabinet/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(buildRegisterPayload(form)),
      });
      clearBotAuthFlow();
      state.user = result.user;
      closeAuth();
      setStatus($('#auth-status'), '');
      await trackMarketingEvent('auth_complete', {
        ctaId: 'register_submit',
        ctaLabel: 'register_submit',
        panel: 'auth',
      });
      await syncMarketingVisit('auth_complete');
      await loadProtectedData();
      scrollToId('dashboard');
    } catch {
      setStatus($('#auth-status'), 'Не удалось создать кабинет. Возможно, email уже используется.', true);
    }
  });

  $('#logout-btn')?.addEventListener('click', async () => {
    await api('/cabinet/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => ({}));
    clearBotAuthFlow();
    await trackMarketingEvent('logout', {
      ctaId: 'logout',
      ctaLabel: 'logout',
      panel: 'overview',
    });
    resetProtectedState();
    window.location.href = '/cabinet/login';
  });

  $('#dashboard-refresh-btn')?.addEventListener('click', async () => {
    if (!state.user) return;
    try {
      await loadProtectedData();
    } catch {}
  });

  $('#ai-preview-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = $('#ai-preview-input');
    const content = String(input?.value || '').trim();
    if (!content) return;
    state.aiPreviewMessages.push({ role: 'user', content });
    state.aiPreviewMessages.push({ role: 'assistant', content: buildAiPreviewAnswer(content) });
    if (state.aiPreviewMessages.length > 8) state.aiPreviewMessages = state.aiPreviewMessages.slice(-8);
    renderAiPreviewMessages();
    if (input) input.value = '';
    await trackMarketingEvent('ai_preview', {
      ctaId: 'ai_preview_submit',
      ctaLabel: 'ai_preview_submit',
      panel: 'landing',
      intentHint: 'ai',
      meta: {
        question: content.slice(0, 180),
      },
    });
  });

  $('#task-create-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tasks')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#task-status'), 'Сохраняем задачу...');
      await api('/cabinet/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: form.get('title'),
          description: form.get('description'),
          category: form.get('category'),
          priority: form.get('priority'),
          dueAt: form.get('dueAt'),
          protocolId: form.get('protocolId'),
        }),
      });
      await trackMarketingEvent('task_create', {
        panel: 'tasks',
        ctaId: 'task_create',
        ctaLabel: 'task_create',
      });
      event.currentTarget.reset();
      setStatus($('#task-status'), 'Задача добавлена.');
      await loadProtectedData();
      activatePanel('tasks');
    } catch {
      setStatus($('#task-status'), 'Не удалось сохранить задачу.', true);
    }
  });

  $('#withdraw-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('withdrawals')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#withdraw-status'), 'Отправляем заявку...');
      await api('/cabinet/api/withdrawals', {
        method: 'POST',
        body: JSON.stringify({
          amount: form.get('amount'),
          method: form.get('method'),
          payoutDetails: form.get('payoutDetails'),
          note: form.get('note'),
        }),
      });
      await trackMarketingEvent('withdrawal_create', {
        panel: 'withdrawals',
        ctaId: 'withdraw_create',
        ctaLabel: 'withdraw_create',
      });
      event.currentTarget.reset();
      setStatus($('#withdraw-status'), 'Заявка отправлена.');
      await loadProtectedData();
    } catch {
      setStatus($('#withdraw-status'), 'Не удалось отправить заявку.', true);
    }
  });

  $('#support-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('support')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#support-status'), 'Отправляем запрос...');
      await api('/cabinet/api/support', {
        method: 'POST',
        body: JSON.stringify({
          subject: form.get('subject'),
          topic: form.get('topic'),
          priority: form.get('priority'),
          preferredContact: form.get('preferredContact'),
          message: form.get('message'),
        }),
      });
      await trackMarketingEvent('support_create', {
        panel: 'support',
        ctaId: 'support_create',
        ctaLabel: 'support_create',
      });
      event.currentTarget.reset();
      setStatus($('#support-status'), 'Запрос отправлен.');
      await loadProtectedData();
      activatePanel('support');
    } catch {
      setStatus($('#support-status'), 'Не удалось отправить запрос.', true);
    }
  });

  $('#shortener-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#shortener-status'), 'Создаём короткую ссылку...');
      const result = await api('/cabinet/api/shortener/links', {
        method: 'POST',
        body: JSON.stringify({
          url: form.get('url'),
          title: form.get('title'),
          slug: form.get('slug'),
        }),
      });
      state.shortLinks = result.items || [];
      renderToolsPanel();
      renderLinksPanel();
      renderMaterialsPanel();
      renderMediaCenterPanel();
      event.currentTarget.reset();
      setStatus($('#shortener-status'), 'Короткая ссылка готова.');
      await trackMarketingEvent('shortener_create', {
        panel: 'tools',
        ctaId: 'shortener_create',
        ctaLabel: 'shortener_create',
      });
    } catch (error) {
      setStatus($('#shortener-status'), describeToolError(error, 'Не удалось создать короткую ссылку.'), true);
    }
  });

  $('#utm-builder-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = event.currentTarget;
    const context = getToolContextDefaults();
    try {
      setStatus($('#utm-builder-status'), 'Собираем tracked link...');
      state.toolResults.utmBuilder = buildUtmBuilderResult({
        presetId: form.elements.presetId?.value,
        baseUrl: form.elements.baseUrl?.value,
        source: form.elements.source?.value,
        medium: form.elements.medium?.value,
        campaign: form.elements.campaign?.value,
        content: form.elements.content?.value,
        term: form.elements.term?.value,
        title: `${context.title} ${form.elements.campaign?.value || ''}`.trim(),
        context,
      });
      renderToolsPanel();
      setStatus($('#utm-builder-status'), 'Tracked link готов.');
      await trackMarketingEvent('utm_builder_create', {
        panel: 'tools',
        ctaId: 'utm_builder_create',
        ctaLabel: form.elements.campaign?.value || context.title,
        meta: buildMarketingMeta({
          utmSource: form.elements.source?.value || '',
          utmMedium: form.elements.medium?.value || '',
          utmCampaign: form.elements.campaign?.value || '',
        }),
      });
    } catch (error) {
      setStatus($('#utm-builder-status'), describeToolError(error, 'Не удалось собрать tracked link.'), true);
    }
  });

  $('#qr-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#qr-status'), 'Генерируем QR...');
      const result = await api('/cabinet/api/tools/qr', {
        method: 'POST',
        body: JSON.stringify({
          url: form.get('url'),
          size: form.get('size'),
        }),
      });
      state.toolResults.qr = result.qr || null;
      renderToolsPanel();
      setStatus($('#qr-status'), 'QR-код готов.');
      await trackMarketingEvent('qr_create', {
        panel: 'tools',
        ctaId: 'qr_create',
        ctaLabel: 'qr_create',
      });
    } catch (error) {
      setStatus($('#qr-status'), describeToolError(error, 'Не удалось сгенерировать QR.'), true);
    }
  });

  $('#hashtags-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#hashtags-status'), 'Подбираем хештеги...');
      const result = await api('/cabinet/api/aitools/hashtags', {
        method: 'POST',
        body: JSON.stringify({
          input: form.get('input'),
          platform: form.get('platform'),
          count: form.get('count'),
        }),
      });
      state.toolResults.hashtags = result.hashtags || [];
      renderToolsPanel();
      setStatus($('#hashtags-status'), 'Подборка готова.');
      await trackMarketingEvent('hashtags_create', {
        panel: 'tools',
        ctaId: 'hashtags_create',
        ctaLabel: 'hashtags_create',
      });
    } catch (error) {
      setStatus($('#hashtags-status'), describeToolError(error, 'Не удалось подобрать хештеги.'), true);
    }
  });

  $('#caption-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    try {
      setStatus($('#caption-status'), 'Собираем варианты текста...');
      const result = await api('/cabinet/api/aitools/caption', {
        method: 'POST',
        body: JSON.stringify({
          topic: form.get('topic'),
          platform: form.get('platform'),
          tone: form.get('tone'),
        }),
      });
      state.toolResults.captions = result.items || [];
      renderToolsPanel();
      setStatus($('#caption-status'), 'Варианты текста готовы.');
      await trackMarketingEvent('caption_create', {
        panel: 'tools',
        ctaId: 'caption_create',
        ctaLabel: 'caption_create',
      });
    } catch (error) {
      setStatus($('#caption-status'), describeToolError(error, 'Не удалось собрать варианты текста.'), true);
    }
  });

  $('#bio-hub-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    const workspace = getWorkspace() || {};
    const context = getToolContextDefaults();
    try {
      setStatus($('#bio-hub-status'), 'Собираем персональный Bio Hub...');
      const result = {
        url: buildBioHubUrl({
          landingId: context.landingId,
          languageId: state.landingPreferences.language || 'ru',
          headline: form.get('headline'),
          summary: form.get('summary'),
        }),
        headline: String(form.get('headline') || context.title || '').trim(),
        summary: String(form.get('summary') || '').trim(),
        landingTitle: context.title,
        languageName: context.languageName,
        registerUrl: workspace.cabinetReferralLink || '',
        companyUrl: workspace.companyReferralLink || '',
      };
      if (!result.url) throw new Error('url_required');
      state.toolResults.bioHub = result;
      renderToolsPanel();
      setStatus($('#bio-hub-status'), 'Bio Hub готов.');
      await trackMarketingEvent('bio_hub_create', {
        panel: 'tools',
        ctaId: 'bio_hub_create',
        ctaLabel: 'bio_hub_create',
      });
    } catch {
      setStatus($('#bio-hub-status'), 'Не удалось собрать Bio Hub.', true);
    }
  });

  $('#social-kit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = event.currentTarget;
    const file = form.elements.image?.files?.[0];
    const fit = form.elements.fit?.value || 'cover';
    try {
      setStatus($('#social-kit-status'), 'Готовим Social Kit...');
      const sourceDataUrl = await readFileAsDataUrl(file);
      state.toolResults.socialKit = await createSocialKitAssets(sourceDataUrl, fit);
      renderToolsPanel();
      setStatus($('#social-kit-status'), 'Social Kit готов.');
      await trackMarketingEvent('social_kit_create', {
        panel: 'tools',
        ctaId: 'social_kit_create',
        ctaLabel: 'social_kit_create',
      });
    } catch {
      setStatus($('#social-kit-status'), 'Не удалось подготовить Social Kit.', true);
    }
  });

  $('#image-studio-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = event.currentTarget;
    const file = form.elements.image?.files?.[0];
    try {
      setStatus($('#image-studio-status'), 'Собираем изображение...');
      const sourceDataUrl = await readFileAsDataUrl(file);
      state.toolResults.imageStudio = await createImageStudioAsset(sourceDataUrl, {
        width: form.elements.width?.value,
        height: form.elements.height?.value,
        format: form.elements.format?.value,
        fit: form.elements.fit?.value,
      });
      renderToolsPanel();
      setStatus($('#image-studio-status'), 'Изображение готово.');
      await trackMarketingEvent('image_studio_create', {
        panel: 'tools',
        ctaId: 'image_studio_create',
        ctaLabel: 'image_studio_create',
      });
    } catch {
      setStatus($('#image-studio-status'), 'Не удалось собрать изображение.', true);
    }
  });

  $('#remove-bg-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = event.currentTarget;
    const file = form.elements.image?.files?.[0];
    try {
      setStatus($('#remove-bg-status'), 'Удаляем фон...');
      const sourceDataUrl = await readFileAsDataUrl(file);
      state.toolResults.removeBg = await createRemoveBackgroundAsset(sourceDataUrl, form.elements.threshold?.value);
      renderToolsPanel();
      setStatus($('#remove-bg-status'), 'PNG без фона готов.');
      await trackMarketingEvent('remove_bg_create', {
        panel: 'tools',
        ctaId: 'remove_bg_create',
        ctaLabel: 'remove_bg_create',
      });
    } catch {
      setStatus($('#remove-bg-status'), 'Не удалось удалить фон.', true);
    }
  });

  $('#og-generator-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    const context = getToolContextDefaults();
    try {
      setStatus($('#og-generator-status'), 'Собираем OG-обложку...');
      state.toolResults.ogImage = await createOgGraphicAsset({
        title: form.get('title') || context.title,
        subtitle: form.get('subtitle') || 'Каталог, лендинги, рекламные материалы и кабинет партнёра.',
        cta: form.get('cta') || 'Открыть Golden Connect',
        landingId: context.landingId,
        languageName: context.languageName,
        referralCode: context.referralCode,
        styleId: form.get('styleId') || 'aurora',
      });
      renderToolsPanel();
      setStatus($('#og-generator-status'), 'OG-обложка готова.');
      await trackMarketingEvent('og_image_create', {
        panel: 'tools',
        ctaId: 'og_image_create',
        ctaLabel: 'og_image_create',
      });
    } catch {
      setStatus($('#og-generator-status'), 'Не удалось собрать OG-обложку.', true);
    }
  });

  $('#banner-studio-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    const context = getToolContextDefaults();
    try {
      setStatus($('#banner-studio-status'), 'Собираем баннеры...');
      state.toolResults.bannerStudio = await createBannerStudioAssets({
        title: form.get('title') || context.title,
        subtitle: form.get('subtitle') || 'Каталог, материалы, AI и партнёрский кабинет на одной ссылке.',
        cta: form.get('cta') || 'Открыть',
        url: getPreferredToolUrl(context) || window.location.origin,
        landingId: context.landingId,
        sizePack: form.get('sizePack') || 'all',
        styleId: form.get('styleId') || 'all',
      });
      renderToolsPanel();
      setStatus($('#banner-studio-status'), 'Баннеры готовы.');
      await trackMarketingEvent('banner_studio_create', {
        panel: 'tools',
        ctaId: 'banner_studio_create',
        ctaLabel: 'banner_studio_create',
      });
    } catch {
      setStatus($('#banner-studio-status'), 'Не удалось собрать баннеры.', true);
    }
  });

  $('#pdf-kit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('tools')) return;
    const form = new FormData(event.currentTarget);
    const context = getToolContextDefaults();
    const workspace = getWorkspace() || {};
    try {
      setStatus($('#pdf-kit-status'), 'Собираем PDF Lead Kit...');
      state.toolResults.pdfKit = await createPdfKitBundle({
        url: form.get('url') || getPreferredToolUrl(context),
        title: form.get('title') || `${context.title || 'Golden Connect'} PDF Kit`,
        subtitle: form.get('subtitle') || '',
        cta: form.get('cta') || '',
        landingId: context.landingId,
        languageName: context.languageName,
        referralCode: context.referralCode,
        companyUrl: workspace.companyReferralLink || '',
      });
      renderToolsPanel();
      renderLinksPanel();
      renderMaterialsPanel();
      renderMediaCenterPanel();
      setStatus($('#pdf-kit-status'), 'PDF Lead Kit готов.');
      await trackMarketingEvent('pdf_kit_create', {
        panel: 'tools',
        ctaId: 'pdf_kit_create',
        ctaLabel: 'pdf_kit_create',
      });
    } catch (error) {
      setStatus($('#pdf-kit-status'), describeToolError(error, 'Не удалось собрать PDF Lead Kit.'), true);
    }
  });

  $('#ai-chat-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('ai')) return;
    const input = $('#ai-chat-input');
    const content = String(input?.value || '').trim();
    if (!content) return;
    try {
      setStatus($('#ai-chat-status'), 'AI отвечает...');
      const result = await api('/cabinet/api/ai/messages', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      await trackMarketingEvent('ai_message', {
        panel: 'ai',
        ctaId: 'ai_chat_submit',
        ctaLabel: 'ai_chat_submit',
        intentHint: 'ai',
      });
      state.aiMessages = result.items || [];
      renderAiChat();
      if (input) input.value = '';
      setStatus($('#ai-chat-status'), '');
    } catch {
      setStatus($('#ai-chat-status'), 'Не удалось получить ответ AI.', true);
    }
  });

  $('#profile-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!requireUser('profile')) return;
    const form = event.currentTarget;
    try {
      setStatus($('#profile-status'), 'Сохраняем профиль...');
      const result = await api('/cabinet/api/profile', {
        method: 'POST',
        body: JSON.stringify(buildProfilePayload(form)),
      });
      await trackMarketingEvent('profile_update', {
        panel: 'profile',
        ctaId: 'profile_save',
        ctaLabel: 'profile_save',
      });
      state.user = result.user;
      setStatus($('#profile-status'), 'Профиль сохранён.');
      await loadProtectedData();
      activatePanel('profile');
    } catch {
      setStatus($('#profile-status'), 'Не удалось сохранить профиль.', true);
    }
  });

  $('#complete-onboarding-btn')?.addEventListener('click', async () => {
    if (!requireUser('profile')) return;
    const onboarding = buildOnboardingSnapshot();
    if (onboarding.status !== 'completed' && onboarding.steps.some((item) => !item.completed)) {
      const nextStep = onboarding.steps.find((item) => !item.completed);
      setStatus(
        $('#complete-onboarding-status'),
        nextStep ? `Сначала закрой шаг: ${nextStep.title}.` : 'Сначала заполни профиль и собери базовые ссылки и материалы.',
        true,
      );
      return;
    }

    try {
      setStatus($('#complete-onboarding-status'), 'Фиксируем настройку кабинета...');
      const result = await api('/cabinet/api/profile', {
        method: 'POST',
        body: JSON.stringify({
          onboarding: {
            completedSteps: safeArray(onboarding.steps).map((item) => item.id),
            currentStep: 'completed',
            status: 'completed',
          },
          completeOnboarding: true,
        }),
      });
      state.user = result.user;
      await trackMarketingEvent('onboarding_complete', {
        panel: 'profile',
        ctaId: 'complete_onboarding',
        ctaLabel: 'complete_onboarding',
      });
      setStatus($('#complete-onboarding-status'), 'Настройка кабинета завершена.');
      await loadProtectedData();
      activatePanel('profile');
    } catch {
      setStatus($('#complete-onboarding-status'), 'Не удалось завершить onboarding.', true);
    }
  });

  document.addEventListener('submit', async (event) => {
    const leadDeskForm = event.target.closest('#lead-desk-form');
    if (leadDeskForm) {
      event.preventDefault();
      if (!requireUser('rating')) return;

      const form = new FormData(leadDeskForm);
      const visitorId = String(form.get('visitorId') || '').trim();
      if (!visitorId) {
        setStatus($('#lead-desk-status'), 'Сначала выберите лида из board.', true);
        return;
      }

      try {
        setStatus($('#lead-desk-status'), 'Сохраняем карточку лида...');
        const result = await api(`/api/leads/${encodeURIComponent(visitorId)}`, {
          method: 'POST',
          body: JSON.stringify({
            stageOverride: form.get('stageOverride'),
            ownerTag: form.get('ownerTag'),
            followUpAt: form.get('followUpAt'),
            note: form.get('note'),
            pinned: form.get('pinned') === 'on',
          }),
        });
        if (result.marketing) {
          setMarketingContext(result.marketing);
        }
        state.leadDeskEditorVisitorId = visitorId;
        renderOverview();
        renderRatingPanel();
        setStatus($('#lead-desk-status'), 'Карточка лида сохранена.');
        await trackMarketingEvent('lead_desk_update', {
          panel: 'rating',
          ctaId: 'lead_desk_update',
          ctaLabel: visitorId,
          meta: buildMarketingMeta({
            visitorId,
            leadStage: String(form.get('stageOverride') || ''),
          }),
        });
      } catch (error) {
        const reason = error?.payload?.reason;
        const message = reason === 'lead_not_found'
          ? 'Лид уже не найден в потоке.'
          : reason === 'lead_visitor_required'
            ? 'Не удалось определить лида для сохранения.'
            : 'Не удалось сохранить карточку лида.';
        setStatus($('#lead-desk-status'), message, true);
      }
      return;
    }

    const mediaLibraryForm = event.target.closest('#media-library-form');
    if (!mediaLibraryForm) return;
    event.preventDefault();
    if (!requireUser('media')) return;
    if (!state.mediaLibraryMeta?.canManage) {
      setStatus($('#media-library-status'), 'У вас нет доступа к управлению медиатекой.', true);
      return;
    }

    const form = new FormData(mediaLibraryForm);
    const payload = {
      id: form.get('id'),
      title: form.get('title'),
      kind: form.get('kind'),
      scenarioId: form.get('scenarioId'),
      languageId: form.get('languageId'),
      channel: form.get('channel'),
      productIds: String(form.get('productIds') || '').split(',').map((item) => item.trim()).filter(Boolean),
      tags: String(form.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
      summary: form.get('summary'),
      text: form.get('text'),
      url: form.get('url'),
      imageUrl: form.get('imageUrl'),
    };
    const editing = Boolean(Number(payload.id || 0));

    try {
      setStatus($('#media-library-status'), editing ? 'Сохраняем изменения...' : 'Добавляем элемент...');
      const result = await api('/cabinet/api/media-library', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      state.mediaLibraryItems = result.items || [];
      state.mediaLibraryMeta = result.permissions || state.mediaLibraryMeta;
      state.mediaLibraryEditorId = null;
      renderMediaCenterPanel();
      setStatus($('#media-library-status'), editing ? 'Элемент обновлён.' : 'Элемент добавлен в медиатеку.');
      await trackMarketingEvent('media_filter', {
        panel: 'media',
        ctaId: editing ? 'media_update' : 'media_create',
        ctaLabel: payload.kind || 'message',
        meta: buildMarketingMeta({
          mediaKind: payload.kind || 'message',
          mediaScenario: payload.scenarioId || 'all',
        }),
      });
    } catch (error) {
      const reason = error?.payload?.reason;
      const message = reason === 'title_required'
        ? 'Нужен заголовок.'
        : reason === 'content_required'
          ? 'Добавьте текст, описание, ссылку или изображение.'
          : reason === 'forbidden'
            ? 'Доступ к студии закрыт для этого аккаунта.'
            : 'Не удалось сохранить элемент.';
      setStatus($('#media-library-status'), message, true);
    }
  });

  $('#utm-preset-select')?.addEventListener('change', (event) => {
    const presetId = String(event.currentTarget.value || '').trim();
    if (presetId) {
      applyUtmPresetToForm(presetId);
    } else {
      syncUtmBuilderDefaults();
    }
  });

  document.addEventListener('click', (event) => {
    const scrollButton = event.target.closest('[data-scroll-target]');
    if (scrollButton) {
      scrollToId(scrollButton.dataset.scrollTarget);
    }

    const leadBoardEditButton = event.target.closest('.lead-board-edit-btn');
    if (leadBoardEditButton) {
      const visitorId = leadBoardEditButton.dataset.visitorId || '';
      setLeadDeskEditor(visitorId);
      activatePanel('rating');
      scrollToId('dashboard');
      trackMarketingEvent('lead_desk_open', {
        panel: state.activePanel || 'rating',
        ctaId: 'lead_desk_open',
        ctaLabel: visitorId,
        meta: buildMarketingMeta({
          visitorId,
        }),
      }).catch(() => {});
      return;
    }

    const landingLanguageButton = event.target.closest('.landing-language-btn');
    if (landingLanguageButton) {
      setLandingPreferences({
        language: landingLanguageButton.dataset.languageId,
      });
      trackMarketingEvent('landing_language_switch', {
        panel: 'landings',
        ctaId: 'landing_language_switch',
        ctaLabel: landingLanguageButton.dataset.languageId || 'ru',
        meta: buildMarketingMeta({
          languageId: landingLanguageButton.dataset.languageId || 'ru',
        }),
      }).catch(() => {});
      return;
    }

    const landingTypeButton = event.target.closest('.landing-type-btn');
    if (landingTypeButton) {
      setLandingPreferences({
        landingId: landingTypeButton.dataset.landingId,
      });
      trackMarketingEvent('landing_bundle_switch', {
        panel: 'materials',
        ctaId: 'landing_bundle_switch',
        ctaLabel: landingTypeButton.dataset.landingId || 'health',
        meta: buildMarketingMeta({
          landingId: landingTypeButton.dataset.landingId || 'health',
        }),
      }).catch(() => {});
      return;
    }

    const landingMaterialsButton = event.target.closest('.landing-materials-btn');
    if (landingMaterialsButton) {
      if (!requireUser('materials')) return;
      setLandingPreferences({
        landingId: landingMaterialsButton.dataset.landingId,
        language: landingMaterialsButton.dataset.languageId,
      });
      activatePanel('materials');
      scrollToId('dashboard');
      trackMarketingEvent('landing_open_materials', {
        panel: 'landings',
        ctaId: 'landing_open_materials',
        ctaLabel: landingMaterialsButton.dataset.landingId || 'landing',
        meta: buildMarketingMeta({
          landingId: landingMaterialsButton.dataset.landingId || '',
          languageId: landingMaterialsButton.dataset.languageId || '',
        }),
      }).catch(() => {});
      return;
    }

    const landingToolButton = event.target.closest('.landing-tool-btn');
    if (landingToolButton) {
      if (!requireUser('tools')) return;
      prefillLandingTool(
        landingToolButton.dataset.toolKind,
        landingToolButton.dataset.toolUrl,
        landingToolButton.dataset.toolTitle,
      );
      trackMarketingEvent('landing_tool_prefill', {
        panel: state.activePanel || 'tools',
        ctaId: landingToolButton.dataset.toolKind || 'tool',
        ctaLabel: landingToolButton.dataset.toolTitle || landingToolButton.dataset.toolKind || 'tool',
        meta: buildMarketingMeta({
          toolKind: landingToolButton.dataset.toolKind || '',
        }),
      }).catch(() => {});
      return;
    }

    const nativeToolOpenButton = event.target.closest('.native-tool-open-btn');
    if (nativeToolOpenButton) {
      if (!requireUser('tools')) return;
      const toolKind = nativeToolOpenButton.dataset.toolOpenKind || '';
      prefillAssistantTool(toolKind);
      trackMarketingEvent('tools_native_open', {
        panel: 'tools',
        ctaId: toolKind || 'tool',
        ctaLabel: toolKind || 'tool',
        meta: buildMarketingMeta({
          toolKind,
        }),
      }).catch(() => {});
      return;
    }

    const toolsNavButton = event.target.closest('.tools-nav-btn');
    if (toolsNavButton) {
      if (!requireUser('tools')) return;
      const toolView = toolsNavButton.dataset.toolView || 'overview';
      setActiveToolView(toolView);
      trackMarketingEvent('tools_view_open', {
        panel: 'tools',
        ctaId: toolView,
        ctaLabel: toolView,
        meta: buildMarketingMeta({
          toolView,
        }),
      }).catch(() => {});
      return;
    }

    const mediaScenarioButton = event.target.closest('.media-scenario-btn');
    if (mediaScenarioButton) {
      setMediaCenterFilters({ scenario: mediaScenarioButton.dataset.mediaScenario || 'all' });
      trackMarketingEvent('media_filter', {
        panel: 'media',
        ctaId: 'media_scenario',
        ctaLabel: mediaScenarioButton.dataset.mediaScenario || 'all',
        meta: buildMarketingMeta({
          mediaScenario: mediaScenarioButton.dataset.mediaScenario || 'all',
        }),
      }).catch(() => {});
      return;
    }

    const mediaKindButton = event.target.closest('.media-kind-btn');
    if (mediaKindButton) {
      setMediaCenterFilters({ kind: mediaKindButton.dataset.mediaKind || 'all' });
      trackMarketingEvent('media_filter', {
        panel: 'media',
        ctaId: 'media_kind',
        ctaLabel: mediaKindButton.dataset.mediaKind || 'all',
        meta: buildMarketingMeta({
          mediaKind: mediaKindButton.dataset.mediaKind || 'all',
        }),
      }).catch(() => {});
      return;
    }

    const mediaLanguageButton = event.target.closest('.media-language-btn');
    if (mediaLanguageButton) {
      setLandingPreferences({
        language: mediaLanguageButton.dataset.languageId,
      });
      trackMarketingEvent('media_language_switch', {
        panel: 'media',
        ctaId: 'media_language',
        ctaLabel: mediaLanguageButton.dataset.languageId || 'ru',
        meta: buildMarketingMeta({
          languageId: mediaLanguageButton.dataset.languageId || 'ru',
        }),
      }).catch(() => {});
      return;
    }

    const mediaOpenPanelButton = event.target.closest('.media-open-panel-btn');
    if (mediaOpenPanelButton) {
      const targetPanel = mediaOpenPanelButton.dataset.panelTarget || 'materials';
      if (!requireUser(targetPanel)) return;
      if (mediaOpenPanelButton.dataset.scenarioId || mediaOpenPanelButton.dataset.languageId) {
        setLandingPreferences({
          landingId: mediaOpenPanelButton.dataset.scenarioId || state.landingPreferences.landingId,
          language: mediaOpenPanelButton.dataset.languageId || state.landingPreferences.language,
        });
      }
      if (mediaOpenPanelButton.dataset.productId) {
        setMediaCenterFilters({
          productId: mediaOpenPanelButton.dataset.productId,
        });
      }
      activatePanel(targetPanel);
      scrollToId('dashboard');
      trackMarketingEvent('media_open_panel', {
        panel: 'media',
        ctaId: targetPanel,
        ctaLabel: targetPanel,
        meta: buildMarketingMeta({
          targetPanel,
          landingId: mediaOpenPanelButton.dataset.scenarioId || '',
          languageId: mediaOpenPanelButton.dataset.languageId || '',
          productId: mediaOpenPanelButton.dataset.productId || '',
        }),
      }).catch(() => {});
      return;
    }

    const mediaEntryEditButton = event.target.closest('.media-entry-edit-btn');
    if (mediaEntryEditButton) {
      setMediaLibraryEditor(mediaEntryEditButton.dataset.mediaEntryId || null);
      scrollToId('dashboard');
      return;
    }

    const mediaEntryResetButton = event.target.closest('.media-entry-reset-btn');
    if (mediaEntryResetButton) {
      setMediaLibraryEditor(null);
      return;
    }

    const leadDeskClearButton = event.target.closest('.lead-desk-clear-btn');
    if (leadDeskClearButton) {
      if (!requireUser('rating')) return;
      const visitorId = String(leadDeskClearButton.dataset.visitorId || '').trim();
      if (!visitorId) return;
      api(`/api/leads/${encodeURIComponent(visitorId)}`, {
        method: 'DELETE',
      }).then(async (result) => {
        if (result.marketing) {
          setMarketingContext(result.marketing);
        }
        state.leadDeskEditorVisitorId = visitorId;
        renderOverview();
        renderRatingPanel();
        setStatus($('#lead-desk-status'), 'Ручные поля очищены. Лид снова считается автоматически.');
        await trackMarketingEvent('lead_desk_clear', {
          panel: 'rating',
          ctaId: 'lead_desk_clear',
          ctaLabel: visitorId,
          meta: buildMarketingMeta({
            visitorId,
          }),
        });
      }).catch((error) => {
        const reason = error?.payload?.reason;
        setStatus($('#lead-desk-status'), reason === 'lead_not_found' ? 'Карточка лида уже очищена.' : 'Не удалось очистить ручные поля.', true);
      });
      return;
    }

    const leadDeskTaskButton = event.target.closest('.lead-desk-task-btn');
    if (leadDeskTaskButton) {
      if (!requireUser('tasks')) return;
      const visitorId = String(leadDeskTaskButton.dataset.visitorId || '').trim();
      const lead = getLeadBoardEntryByVisitorId(visitorId);
      const draft = buildLeadTaskDraft(lead);
      if (!lead || !draft) {
        setStatus($('#lead-desk-status'), 'Не удалось собрать задачу для этого лида.', true);
        return;
      }
      setStatus($('#lead-desk-status'), 'Переводим follow-up в задачу...');
      api('/cabinet/api/tasks', {
        method: 'POST',
        body: JSON.stringify(draft),
      }).then(async () => {
        state.leadDeskEditorVisitorId = visitorId;
        await loadProtectedData();
        activatePanel('tasks');
        setStatus($('#task-status'), `Задача создана для ${lead.title || 'лида'}.`);
        await trackMarketingEvent('lead_followup_task_create', {
          panel: 'rating',
          ctaId: 'lead_followup_task_create',
          ctaLabel: visitorId,
          meta: buildMarketingMeta({
            visitorId,
            leadStage: lead.stageId || '',
          }),
        });
      }).catch(() => {
        setStatus($('#lead-desk-status'), 'Не удалось создать follow-up задачу.', true);
      });
      return;
    }

    const mediaEntryDeleteButton = event.target.closest('.media-entry-delete-btn');
    if (mediaEntryDeleteButton) {
      if (!requireUser('media')) return;
      if (!state.mediaLibraryMeta?.canManage) {
        setStatus($('#media-library-status'), 'У вас нет доступа к удалению элементов.', true);
        return;
      }
      const entryId = mediaEntryDeleteButton.dataset.mediaEntryId || '';
      const entry = getManagedMediaEntryById(entryId);
      if (!entryId || !entry) return;
      if (!window.confirm(`Удалить "${entry.title || 'элемент'}" из медиатеки?`)) return;
      api(`/api/media-library/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
      }).then(async (result) => {
        state.mediaLibraryItems = result.items || [];
        state.mediaLibraryMeta = result.permissions || state.mediaLibraryMeta;
        if (Number(state.mediaLibraryEditorId || 0) === Number(entryId || 0)) {
          state.mediaLibraryEditorId = null;
        }
        renderMediaCenterPanel();
        setStatus($('#media-library-status'), 'Элемент удалён.');
        await trackMarketingEvent('media_open_panel', {
          panel: 'media',
          ctaId: 'media_delete',
          ctaLabel: entry.kind || 'media',
          meta: buildMarketingMeta({
            mediaEntryId: entryId,
          }),
        });
      }).catch((error) => {
        const reason = error?.payload?.reason;
        setStatus($('#media-library-status'), reason === 'forbidden' ? 'Удаление недоступно для этого аккаунта.' : 'Не удалось удалить элемент.', true);
      });
      return;
    }

    const learningTrackButton = event.target.closest('.learning-track-select-btn');
    if (learningTrackButton) {
      setLearningTrack(learningTrackButton.dataset.trackId || '');
      trackMarketingEvent('learning_track_select', {
        panel: 'learning',
        ctaId: learningTrackButton.dataset.trackId || 'track',
        ctaLabel: learningTrackButton.dataset.trackId || 'track',
        meta: buildMarketingMeta({
          trackId: learningTrackButton.dataset.trackId || '',
        }),
      }).catch(() => {});
      return;
    }

    const taskTemplateButton = event.target.closest('.task-template-btn');
    if (taskTemplateButton) {
      createTaskFromTemplate(taskTemplateButton.dataset.templateId || '').catch(() => {
        setStatus($('#task-status'), 'Не удалось добавить шаблон.', true);
      });
      return;
    }

    const automationButton = event.target.closest('.automation-prefill-btn');
    if (automationButton) {
      runAutomationAction(automationButton.dataset.automationAction || '');
      trackMarketingEvent('automation_prefill', {
        panel: 'tasks',
        ctaId: automationButton.dataset.automationAction || 'automation',
        ctaLabel: automationButton.dataset.automationAction || 'automation',
        meta: buildMarketingMeta({
          automationId: automationButton.dataset.automationAction || '',
        }),
      }).catch(() => {});
      return;
    }

    const faqCategoryButton = event.target.closest('.faq-category-btn');
    if (faqCategoryButton) {
      setFaqFilters({ category: faqCategoryButton.dataset.faqCategory || 'all' });
      trackMarketingEvent('faq_filter', {
        panel: 'faq',
        ctaId: faqCategoryButton.dataset.faqCategory || 'all',
        ctaLabel: faqCategoryButton.dataset.faqCategory || 'all',
        meta: buildMarketingMeta({
          faqCategory: faqCategoryButton.dataset.faqCategory || 'all',
        }),
      }).catch(() => {});
      return;
    }

    const marketingActionButton = event.target.closest('.marketing-action-btn');
    if (marketingActionButton) {
      performMarketingAction(
        marketingActionButton.dataset.actionKind,
        marketingActionButton.dataset.actionTarget,
        marketingActionButton.dataset.actionId,
        marketingActionButton.textContent,
      ).catch(() => {});
      return;
    }

    const marketingShareLink = event.target.closest('.marketing-share-link');
    if (marketingShareLink) {
      trackMarketingEvent('share_channel_click', {
        panel: marketingShareLink.dataset.panel || state.activePanel || 'overview',
        ctaId: marketingShareLink.dataset.channel || 'share',
        ctaLabel: marketingShareLink.dataset.channel || 'share',
        meta: buildMarketingMeta({
          channel: marketingShareLink.dataset.channel || '',
          campaignId: marketingShareLink.dataset.campaignId || '',
          landingId: marketingShareLink.dataset.landingId || '',
          languageId: marketingShareLink.dataset.languageId || '',
          shareUrl: marketingShareLink.dataset.shareUrl || '',
        }),
      }).catch(() => {});
      return;
    }

    const marketingCopyButton = event.target.closest('.marketing-copy-btn');
    if (marketingCopyButton) {
      copyTextToClipboard(marketingCopyButton.dataset.copyText || '').then((copied) => {
        if (copied) {
          trackMarketingEvent(marketingCopyButton.dataset.copyKind || 'copy_referral', {
            panel: 'overview',
            ctaId: marketingCopyButton.dataset.copyKind || 'copy_referral',
            ctaLabel: marketingCopyButton.dataset.copyKind || 'copy_referral',
            meta: buildMarketingMeta({
              copyKind: marketingCopyButton.dataset.copyKind || 'copy_referral',
            }),
          }).catch(() => {});
        }
      });
      return;
    }

    const toolPrefillUrlButton = event.target.closest('.tool-prefill-url-btn');
    if (toolPrefillUrlButton) {
      if (!requireUser('tools')) return;
      prefillUrlTool(
        toolPrefillUrlButton.dataset.toolKind || '',
        toolPrefillUrlButton.dataset.toolUrl || '',
        toolPrefillUrlButton.dataset.toolTitle || 'Tracked link',
      );
      return;
    }

    const utmUseCurrentButton = event.target.closest('.utm-use-current-btn');
    if (utmUseCurrentButton) {
      if (!requireUser('tools')) return;
      const form = $('#utm-builder-form');
      const context = getToolContextDefaults();
      const defaults = getDefaultUtmDraft(context);
      if (form?.elements?.baseUrl) form.elements.baseUrl.value = defaults.baseUrl || '';
      if (form?.elements?.content) form.elements.content.value = defaults.content || '';
      if (form?.elements?.term) form.elements.term.value = defaults.term || '';
      form?.elements?.baseUrl?.focus();
      return;
    }

    const pdfUseTrackedButton = event.target.closest('.pdf-use-tracked-btn');
    if (pdfUseTrackedButton) {
      if (!requireUser('tools')) return;
      const form = $('#pdf-kit-form');
      const context = getToolContextDefaults();
      if (form?.elements?.url) form.elements.url.value = getPreferredToolUrl(context) || '';
      form?.elements?.url?.focus();
      return;
    }

    const toolCopyButton = event.target.closest('.tool-copy-btn');
    if (toolCopyButton) {
      copyTextToClipboard(toolCopyButton.dataset.copyText || '').then((copied) => {
        if (copied) {
          trackMarketingEvent(toolCopyButton.dataset.copyKind || 'copy_referral', {
            panel: state.activePanel || 'overview',
            ctaId: toolCopyButton.dataset.copyKind || 'copy_referral',
            ctaLabel: toolCopyButton.dataset.copyKind || 'copy_referral',
            meta: buildMarketingMeta({
              copyKind: toolCopyButton.dataset.copyKind || 'copy_referral',
            }),
          }).catch(() => {});
        }
      });
      return;
    }

    const navButton = event.target.closest('.cabinet-nav-item');
    if (navButton) {
      if (navButton.id === 'dashboard-refresh-btn') return;
      if (!requireUser(navButton.dataset.panel)) return;
      trackMarketingEvent('panel_open', {
        panel: navButton.dataset.panel,
        ctaId: navButton.dataset.panel,
        ctaLabel: navButton.dataset.panel,
        meta: buildMarketingMeta({
          targetPanel: navButton.dataset.panel,
        }),
      }).catch(() => {});
      activatePanel(navButton.dataset.panel);
      return;
    }

    const panelTrigger = event.target.closest('.dashboard-panel-trigger');
    if (panelTrigger) {
      const target = panelTrigger.dataset.panelTarget;
      if (!requireUser(target)) return;
      trackMarketingEvent('panel_open', {
        panel: target,
        ctaId: target || 'panel',
        ctaLabel: target || 'panel',
        meta: buildMarketingMeta({
          targetPanel: target || '',
        }),
      }).catch(() => {});
      activatePanel(target);
      scrollToId('dashboard');
      return;
    }

    const promptButton = event.target.closest('.ai-prompt-btn');
    if (promptButton) {
      const prompt = promptButton.dataset.prompt || '';
      if (state.user) {
        if ($('#ai-chat-input')) $('#ai-chat-input').value = prompt;
        activatePanel('ai');
        $('#ai-chat-input')?.focus();
      } else {
        if ($('#ai-preview-input')) $('#ai-preview-input').value = prompt;
        scrollToId('content-section');
        $('#ai-preview-input')?.focus();
      }
      trackMarketingEvent('ai_prompt_click', {
        panel: state.user ? 'ai' : 'landing',
        ctaId: 'ai_prompt',
        ctaLabel: prompt,
        intentHint: 'ai',
      }).catch(() => {});
      return;
    }

    const orderButton = event.target.closest('.order-product-btn');
    if (orderButton) {
      submitProductOrder(orderButton.dataset.productId).catch(() => {});
      return;
    }

    const savedButton = event.target.closest('.saved-toggle-btn');
    if (savedButton) {
      toggleSaved(savedButton.dataset.kind, savedButton.dataset.itemId).catch(() => {});
      return;
    }

    const protocolButton = event.target.closest('.protocol-activate-btn');
    if (protocolButton) {
      activateProtocol(protocolButton.dataset.protocolId).catch(() => {});
      return;
    }

    const taskButton = event.target.closest('.task-toggle-btn');
    if (taskButton) {
      toggleTask(taskButton.dataset.taskId, taskButton.dataset.completed === 'true').catch(() => {});
      return;
    }

    const notificationButton = event.target.closest('.notification-read-btn');
    if (notificationButton) {
      markNotificationRead(notificationButton.dataset.notificationId).catch(() => {});
    }
  });

  /* ── Back-to-top button ── */
  document.addEventListener('input', (event) => {
    const faqSearchInput = event.target.closest('#faq-search-input');
    if (faqSearchInput) {
      setFaqFilters({ query: faqSearchInput.value || '' });
      return;
    }

    const mediaSearchInput = event.target.closest('#media-center-search-input');
    if (mediaSearchInput) {
      setMediaCenterFilters({ query: mediaSearchInput.value || '' });
    }
  });

  document.addEventListener('change', (event) => {
    const mediaProductFilter = event.target.closest('#media-center-product-filter');
    if (mediaProductFilter) {
      setMediaCenterFilters({ productId: mediaProductFilter.value || 'all' });
    }
  });

  const backTop = document.getElementById('backTop');
  if (backTop) {
    window.addEventListener('scroll', () => { backTop.classList.toggle('is-visible', window.scrollY > 600); });
    backTop.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }

  /* ── Mobile sidebar toggle ── */
  const sidebarToggle = document.getElementById('cabinet-sidebar-toggle');
  const sidebar = document.getElementById('cabinet-sidebar');
  const sidebarOverlay = document.getElementById('cabinet-sidebar-overlay');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('is-open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('is-open');
    });
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('is-open');
        sidebarOverlay.classList.remove('is-open');
      });
    }
  }

  /* ── Mobile nav burger ── */
  const burger = document.querySelector('.nav-burger');
  const navMobile = document.getElementById('navMobile');
  if (burger && navMobile) {
    burger.addEventListener('click', () => navMobile.classList.toggle('is-open'));
    navMobile.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => navMobile.classList.remove('is-open'));
    });
  }

  /* ── AI FAB button ── */
  const aiFab = document.getElementById('ai-fab');
  if (aiFab) {
    aiFab.addEventListener('click', () => {
      showDashboard(true);
      activatePanel('ai');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}

async function bootstrap() {
  state.visitorId = getOrCreateVisitorId();
  const [siteRes, productsRes] = await Promise.all([
    api('/cabinet/api/site/config'),
    api('/cabinet/api/products'),
  ]);

  state.site = siteRes.site;
  state.auth = siteRes.auth || {};
  state.user = siteRes.session?.user || null;
  state.products = productsRes.items || [];

  if ($('#hero-title')) $('#hero-title').textContent = state.site?.landing?.heroTitle || 'X Health Portal';
  if ($('#hero-text')) $('#hero-text').textContent = state.site?.landing?.heroText || '';

  if ($('#trust-strip')) renderTrustStrip();
  if ($('#pillars-grid') || $('#pillars-section')) renderPillars();
  if ($('#company-title') || $('#company-highlights') || $('#company-facts')) renderCompanySection();
  renderProducts();
  if ($('#partner-rewards') || $('#partner-levels')) renderPartnerSection();
  if ($('#content-grid') || $('#dashboard-content-grid')) renderContentCards();
  renderAiPrompts();
  renderMarketingSurfaces();
  syncAuthCapabilities();
  updateHeaderState();
  applyMarketingContext();

  const ref = new URL(window.location.href).searchParams.get('ref');
  if (ref) {
    const input = $('#register-form input[name="referralCode"]');
    if (input) input.value = ref;
  }
  syncAuthChoiceCards();
  syncRegisterReferralBanner();
  syncDashboardHeroChips();

  await syncMarketingVisit('bootstrap').catch(() => {});

  if (state.user) {
    try {
      await loadProtectedData();
      showDashboard(true);
    } catch {
      showDashboard(false);
    }
  } else {
    // On cabinet page without auth → redirect to login
    if (window.location.pathname === '/cabinet/cabinet' || window.location.pathname.startsWith('/cabinet/cabinet/')) {
      window.location.href = '/cabinet/login';
      return;
    }
    showDashboard(false);
  }

  /* ── Scroll reveal observer ── */
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); revealObserver.unobserve(e.target); } });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
}

window.addEventListener('DOMContentLoaded', async () => {
  applyTheme(getPreferredTheme());
  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('xh-theme')) applyTheme(e.matches ? 'dark' : 'light');
  });

  bindEvents();
  try {
    await bootstrap();
  } catch {
    setStatus($('#auth-status'), 'Не удалось загрузить сайт. Попробуй обновить страницу.', true);
  }
});


/* ───────── Оплата / Pay — payment bridge UI ───────── */
async function loadPay() {
  const mount = document.getElementById('pay-content');
  if (!mount) return;
  mount.innerHTML = '<div class="cab-loading">' + (window.t ? t('empty_loading') : 'Загрузка…') + '</div>';

  let tariffsRes, bookingsRes;
  try {
    [tariffsRes, bookingsRes] = await Promise.all([
      api('/api/pay/tariffs').catch(() => ({ ok: false, tariffs: [] })),
      api('/api/pay/bookings').catch(() => ({ ok: true, bookings: [] })),
    ]);
  } catch (e) {
    mount.innerHTML = '<div class="cab-error">' + escapeHtml(String(e && e.message || e)) + '</div>';
    return;
  }

  const tariffs = Array.isArray(tariffsRes && tariffsRes.tariffs) ? tariffsRes.tariffs : [];
  const bookings = Array.isArray(bookingsRes && bookingsRes.bookings) ? bookingsRes.bookings : [];
  const T = (k) => (window.t ? window.t(k) : k);

  let html = '<div class="pay-head">' +
    '<h1 class="pay-title" data-i18n="pay_title">' + T('pay_title') + '</h1>' +
    '<p class="pay-sub" data-i18n="pay_sub">' + T('pay_sub') + '</p>' +
    '</div>';

  html += '<div class="pay-grid">';
  for (const t of tariffs) {
    const isRocket = t.code === 'rocket';
    const totalUsd = t.price_usd + (t.monthly_fee_usd || 0);
    html += '<article class="pay-card' + (isRocket ? ' pay-card--rocket' : '') + '" data-tariff="' + escapeAttr(t.code) + '">' +
      (isRocket ? '<span class="pay-badge">⚡ Matching Bonus</span>' : '') +
      '<div class="pay-card-name">' + escapeHtml(t.name) + '</div>' +
      '<div class="pay-card-price">$' + totalUsd + '<small>активация $' + t.price_usd + ' + сервис $' + t.monthly_fee_usd + '/мес</small></div>' +
      '<ul class="pay-card-meta">' +
        '<li>' + t.seats + ' бизнес-мест</li>' +
        '<li>Матрица ' + t.matrix_depth + ' × $' + t.matrix_rate_usd + '</li>' +
        '<li>10 уровней рефералов' + (t.has_matching_bonus ? ' + Matching' : '') + '</li>' +
      '</ul>' +
      '<div class="pay-card-cycle">≈ $' + (t.cycle_income_usd || 0).toLocaleString('en-US') + ' / цикл</div>' +
      '<div class="pay-methods">' +
        '<button class="cab-btn cab-btn-primary pay-pay-btn" data-method="cryptobot" data-tariff="' + t.code + '" type="button">' + T('pay_method_cryptobot') + '</button>' +
        '<button class="cab-btn pay-pay-btn" data-method="platega" data-tariff="' + t.code + '" type="button">' + T('pay_method_platega') + '</button>' +
      '</div>' +
      '</article>';
  }
  html += '</div>';

  // History
  html += '<section class="pay-history-section"><h2 class="pay-history-title" data-i18n="pay_history">' + T('pay_history') + '</h2>';
  if (!bookings.length) {
    html += '<div class="pay-empty" data-i18n="pay_no_history">' + T('pay_no_history') + '</div>';
  } else {
    html += '<ul class="pay-history">';
    for (const b of bookings.slice().reverse()) {
      const label = b.status === 'paid' ? T('pay_status_paid') : T('pay_status_pending');
      const cls = b.status === 'paid' ? 'paid' : 'pending';
      html += '<li class="pay-row pay-row--' + cls + '">' +
        '<span class="pay-row-code">' + escapeHtml((b.tariff_code || '').toUpperCase()) + '</span>' +
        '<span class="pay-row-amount">$' + b.amount_usd + '</span>' +
        '<span class="pay-row-method">' + escapeHtml(b.method || '') + '</span>' +
        '<span class="pay-row-status">' + label + '</span>' +
        '<span class="pay-row-date">' + escapeHtml(String(b.created_at || '').slice(0, 10)) + '</span>' +
        '</li>';
    }
    html += '</ul>';
  }
  html += '</section>';

  mount.innerHTML = html;

  // Apply any pending translations
  if (window.applyTranslations) window.applyTranslations(mount);

  // Wire pay buttons
  mount.querySelectorAll('.pay-pay-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tariff = btn.getAttribute('data-tariff');
      const method = btn.getAttribute('data-method');
      btn.disabled = true;
      btn.textContent = '…';
      try {
        const resp = await api('/api/pay/create-invoice', {
          method: 'POST',
          body: JSON.stringify({ tariff_code: tariff, method: method }),
        });
        if (resp && resp.ok && resp.pay_url) {
          window.open(resp.pay_url, '_blank', 'noopener,noreferrer');
          // refresh bookings after a short delay so the pending row shows up
          setTimeout(loadPay, 1200);
        } else {
          alert('Не удалось создать счёт: ' + (resp && (resp.reason || resp.error) || 'unknown'));
          btn.disabled = false;
          btn.textContent = method === 'cryptobot' ? '₿ CryptoBot (USDT)' : '💳 Банковская карта';
        }
      } catch (e) {
        alert('Ошибка оплаты: ' + (e && e.message || e));
        btn.disabled = false;
        btn.textContent = method === 'cryptobot' ? '₿ CryptoBot (USDT)' : '💳 Банковская карта';
      }
    });
  });
}



/* ─────────── Meet / Видеозвонки page ─────────── */
async function loadMeet() {
  const mount = document.getElementById('meet-content');
  if (!mount) return;
  mount.innerHTML = '<div class="cab-loading">Загрузка…</div>';

  let data;
  try {
    data = await api('/cabinet/planner/api/conf/rooms');
  } catch (e) {
    mount.innerHTML = '<div class="cab-error">Не удалось загрузить комнаты: ' + escapeHtml(String(e && e.message || e)) + '</div>';
    return;
  }

  const rooms = Array.isArray(data && data.rooms) ? data.rooms : [];
  let html = '';
  html += '<header class="meet-head">';
  html += '  <h1 class="meet-title">📹 Видеозвонки</h1>';
  html += '  <p class="meet-sub">Создавайте приватные комнаты для команды, партнёров или 1-на-1 звонков с клиентами.</p>';
  html += '</header>';

  html += '<section class="cab-card" style="margin-bottom:16px">';
  html += '  <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">';
  html += '    <input id="meet-new-name" class="cab-input" placeholder="Название комнаты (например: Созвон Golden Connect)" style="flex:1;min-width:200px">';
  html += '    <button id="meet-create-btn" class="cab-btn cab-btn-primary" type="button">+ Создать комнату</button>';
  html += '  </div>';
  html += '</section>';

  if (!rooms.length) {
    html += '<div class="cab-empty">У вас пока нет активных комнат. Создайте первую — и поделитесь ссылкой с участниками.</div>';
  } else {
    html += '<ul class="meet-rooms">';
    for (const r of rooms) {
      const joinUrl = '/cabinet/meet?conf=' + encodeURIComponent(r.id);
      html += '<li class="meet-row">';
      html += '  <div class="meet-row-main">';
      html += '    <div class="meet-row-name">' + escapeHtml(r.name || 'Без названия') + '</div>';
      html += '    <div class="meet-row-id">ID: <code>' + escapeHtml(String(r.id)) + '</code></div>';
      html += '  </div>';
      html += '  <div class="meet-row-actions">';
      html += '    <a href="' + joinUrl + '" target="_blank" class="cab-btn cab-btn-primary">🚀 Войти</a>';
      html += '    <button class="cab-btn meet-copy-btn" data-url="' + escapeAttr(location.origin + joinUrl) + '" type="button">📋 Копировать ссылку</button>';
      html += '    <button class="cab-btn cab-btn-danger meet-close-btn" data-id="' + escapeAttr(String(r.id)) + '" type="button">✕ Закрыть</button>';
      html += '  </div>';
      html += '</li>';
    }
    html += '</ul>';
  }

  mount.innerHTML = html;

  // Create room
  const createBtn = document.getElementById('meet-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = (document.getElementById('meet-new-name') || {}).value || '';
      if (!name.trim()) { alert('Укажите название комнаты'); return; }
      createBtn.disabled = true;
      createBtn.textContent = 'Создаём…';
      try {
        await api('/cabinet/planner/api/conf/rooms', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
        await loadMeet();
      } catch (e) {
        alert('Ошибка: ' + (e && e.message || e));
        createBtn.disabled = false;
        createBtn.textContent = '+ Создать комнату';
      }
    });
  }

  // Copy URL
  mount.querySelectorAll('.meet-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-url');
      try {
        await navigator.clipboard.writeText(url);
        btn.textContent = '✓ Скопировано';
        setTimeout(() => { btn.textContent = '📋 Копировать ссылку'; }, 1500);
      } catch (_) {
        prompt('Скопируйте ссылку:', url);
      }
    });
  });

  // Close room
  mount.querySelectorAll('.meet-close-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirm('Закрыть комнату ' + id + '?')) return;
      try {
        await api('/cabinet/planner/api/conf/rooms/' + encodeURIComponent(id), { method: 'DELETE' });
        await loadMeet();
      } catch (e) {
        alert('Ошибка: ' + (e && e.message || e));
      }
    });
  });
}

