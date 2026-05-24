// /api/onboarding/recommend — adaptive recommendation based on user profile
//
// Input: req.session.userId (auth required) — pulls profile from storage
// Output: { ok, profile, paths: [...] } — 1-3 recommended next-step paths

function computeRecommendations(user) {
  if (!user) return [];

  const profile = user.profile || {};
  const onboarding = user.onboarding || {};
  const exp = String(user.experienceLevel || 'new').toLowerCase();
  const role = String(user.userRole || 'member').toLowerCase();
  const budget = Number(profile.monthlyBudget || 0); // USD/month
  const trafficSource = String(profile.trafficSource || '').toLowerCase();
  const focusAreas = Array.isArray(user.focusAreas) ? user.focusAreas : [];
  const goals = String(user.goalsSummary || '').toLowerCase() + ' ' + String(onboarding.primaryGoal || '').toLowerCase();
  const social = {
    tg: !!profile.socialTelegram,
    insta: !!profile.socialInstagram,
    yt: !!profile.socialYoutube,
    tt: !!profile.socialTiktok,
  };
  const socialCount = Object.values(social).filter(Boolean).length;

  const hasAudience = socialCount >= 2 || /канал|подписч|блог|инфлю/i.test(trafficSource);
  const isNew = exp === 'new' || exp === 'beginner';
  const isExperienced = exp === 'expert' || exp === 'advanced' || /эксперт/i.test(exp);
  const wantsQuickMoney = /быстр|сейчас|сразу|сегодня/.test(goals) || /заработ|деньг|доход/.test(goals);
  const wantsTeam = /команд|сеть|структур|лидер/.test(goals) || focusAreas.includes('team');

  const paths = [];

  // Path 1: ROCKET сразу — для опытных с трафиком
  if (hasAudience && (budget >= 200 || isExperienced)) {
    paths.push({
      id: 'rocket-fast',
      priority: 1,
      title: '🔥 ROCKET сразу + Лидерский пул',
      reason: 'У тебя уже есть аудитория и опыт. ROCKET окупится за 5–10 активных рефералов.',
      tariff: 'rocket',
      steps: [
        'Активируй ROCKET ($135 + $45/мес) — 3 места, матрица 17×$0.7, Matching Bonus',
        'Запусти промо в свои каналы — 17+ готовых лендингов с реф-ссылкой',
        'Создай Bio-страницу /bio с A/B-тестами для разных аудиторий',
        'Цельтесь в топ-15 Лидерского пула: 1 и 15 числа делится оборот платформы',
      ],
      cta: { label: 'Активировать ROCKET', url: '/cabinet#/marketing' },
    });
  }

  // Path 2: BOOST — есть трафик, средний бюджет
  if (hasAudience && budget >= 90 && budget < 300 && !isExperienced) {
    paths.push({
      id: 'boost-grow',
      priority: 2,
      title: '⚡ BOOST — оптимальный для активного партнёра',
      reason: 'Достаточный бюджет + аудитория. BOOST даёт 2 места и матрицу 14 уровней.',
      tariff: 'boost',
      steps: [
        'Активируй BOOST ($90 + $30/мес) — 2 места, матрица 14×$0.6',
        'Открывает все 10 линий партнёрки',
        'Запусти 2-3 поста в неделю — AI-генератор /aipost помогает',
        'Через 5–10 партнёров — апгрейд на ROCKET для Matching Bonus',
      ],
      cta: { label: 'Выбрать BOOST', url: '/cabinet#/marketing' },
    });
  }

  // Path 3: LAUNCH — первый платный, для большинства
  if (!isNew && !hasAudience && budget >= 45) {
    paths.push({
      id: 'launch-grow',
      priority: 3,
      title: '🚀 LAUNCH — первый шаг в платный тариф',
      reason: 'У тебя есть базовый бюджет. LAUNCH открывает все 10 линий партнёрки.',
      tariff: 'launch',
      steps: [
        'Активируй LAUNCH ($45 + $15/мес) — 1 место, матрица 12×$0.5',
        'Получишь все 10 линий партнёрки и доход от 5–10 рефералов покроет тариф',
        'Используй промо-материалы в кабинете /landings, /promo',
        'Через месяц при активной сети — апгрейд на BOOST',
      ],
      cta: { label: 'Активировать LAUNCH', url: '/cabinet#/marketing' },
    });
  }

  // Path 4: FREE + биржа заданий — для новичков без бюджета и аудитории
  if (isNew || (!hasAudience && budget < 45)) {
    paths.push({
      id: 'free-jobs',
      priority: 4,
      title: '💰 Старт без вложений — биржа заданий + рефы',
      reason: 'Подходит, чтобы попробовать платформу без вложений и накопить на тариф.',
      tariff: 'free',
      steps: [
        'Открой /jobs в боте — биржа заданий по $0.05–$1 за выполнение',
        'Зарабатывай в ленте до $25/день за просмотры и AI-задания',
        'Поделись реф-ссылкой с 10 друзьями → статус Partner +10% к ставке',
        'Когда накопится $45 — активируй LAUNCH и подключи матрицу',
      ],
      cta: { label: 'Начать на FREE', url: '/cabinet#/jobs' },
    });
  }

  // Path 5: Команда — если в целях есть про команду
  if (wantsTeam && (hasAudience || budget >= 90)) {
    paths.push({
      id: 'team-cm',
      priority: 5,
      title: '👥 Командный путь — фокус на CRM команды',
      reason: 'У тебя цель растить команду. Используй встроенный CRM Trendex.',
      tariff: budget >= 135 ? 'rocket' : 'boost',
      steps: [
        'Активируй BOOST/ROCKET в зависимости от бюджета',
        'В разделе /team — Tracker с 5 этапами воронки рефералов',
        'Auto-Nudge напомнит когда кому из команды написать',
        'Daily Reports в 20:00: что сделано, кому помочь',
      ],
      cta: { label: 'Открыть /team CRM', url: '/cabinet#/team' },
    });
  }

  // Sort by priority + dedupe by tariff (keep best ranked)
  const seenTariffs = new Set();
  const result = paths
    .sort((a, b) => a.priority - b.priority)
    .filter(p => {
      if (seenTariffs.has(p.tariff)) return false;
      seenTariffs.add(p.tariff);
      return true;
    })
    .slice(0, 3);

  // Always have at least one path
  if (!result.length) {
    result.push({
      id: 'free-default',
      priority: 99,
      title: '🎯 Старт на FREE',
      reason: 'Знакомство с платформой — без вложений, до $25/день.',
      tariff: 'free',
      steps: [
        'Изучи кабинет: /jobs (биржа), /team (CRM), /promo (материалы)',
        'Поделись реф-ссылкой с 5 близкими контактами',
        'Через 7–14 дней — посмотри какой тариф активировать',
      ],
      cta: { label: 'Открыть кабинет', url: '/cabinet#/dashboard' },
    });
  }

  return result;
}

function summarizeProfile(user) {
  const profile = user.profile || {};
  return {
    experienceLevel: user.experienceLevel || 'new',
    monthlyBudget: Number(profile.monthlyBudget || 0),
    trafficSource: profile.trafficSource || null,
    socials: {
      telegram: !!profile.socialTelegram,
      instagram: !!profile.socialInstagram,
      youtube: !!profile.socialYoutube,
      tiktok: !!profile.socialTiktok,
    },
    focusAreas: Array.isArray(user.focusAreas) ? user.focusAreas : [],
    goalsSummary: user.goalsSummary || null,
  };
}

module.exports = { computeRecommendations, summarizeProfile };
