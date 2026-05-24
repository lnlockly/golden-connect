/**
 * Base quest seed. 12 quests across 4 chapters:
 *   onboarding (4), referral (3), booking (2), engagement (3).
 *
 * Final Phase 2 TrendeX copy. IDs are frozen — DO NOT rename once deployed
 * (the user_quest_progress FK cascades on rename but completed-quest history
 * gets confusing for analytics). Criteria / xp / orderIdx are logic and stay
 * untouched by the content pass; only title + description evolve.
 *
 * Text format: `title` is short ("Заполни профиль"); `description` is one to
 * two sentences on what to do and why it matters on TrendeX. Both fields are
 * stored as a single "RU · EN" string — the UI does not yet select by locale
 * (Phase 3 will), so shipping both languages keeps copy consistent across
 * any /me/quests renderer.
 */
import type { NewQuest } from '../db/schema.js';

export const QUESTS: NewQuest[] = [
  // ─── onboarding (chapter 1) ─────────────────────────────────────────────
  {
    id: 'q_onboard_profile',
    chapter: 'onboarding',
    title: 'Заполни профиль · Set up your profile',
    description:
      'Укажи имя, выбери язык и добавь аватарку — так команда узнает тебя в сети TRENDEX. · Add your name, pick a language and set a photo so your team can recognise you.',
    xp: 20,
    criteria: { type: 'profile_filled', fields: ['first_name'] },
    orderIdx: 1,
    active: true,
  },
  {
    id: 'q_onboard_role_quiz',
    chapter: 'onboarding',
    title: 'Пройди квиз ролей · Take the role quiz',
    description:
      'Короткий тест из 5 вопросов покажет, какая роль подходит тебе на TRENDEX — бизнес, пользователь или партнёр. · A 5-question quiz that points you to your best fit: business, user or partner.',
    xp: 25,
    criteria: { type: 'quiz_completed', quiz_id: 'onboarding_role' },
    orderIdx: 2,
    active: true,
  },
  {
    id: 'q_onboard_tariff_quiz',
    chapter: 'onboarding',
    title: 'Узнай свой тариф · Find your tariff',
    description:
      'Квиз из 4 вопросов про бюджет, время и цели — подберём тариф от Free до Royal. · 4 quick questions about budget, time and goals — we match you with a tariff from Free to Royal.',
    xp: 25,
    criteria: { type: 'quiz_completed', quiz_id: 'tariff_picker' },
    orderIdx: 3,
    active: true,
  },
  {
    id: 'q_onboard_mission_7day',
    chapter: 'onboarding',
    title: 'Пройди 7-дневную миссию · Finish the 7-day mission',
    description:
      'Партнёрский онбординг на семь дней: по одному шагу в день — и ты полностью готов к старту. · The 7-day partner ramp — one step a day and you graduate fully ready.',
    xp: 100,
    criteria: { type: 'mission_completed', mission_id: 'partner_7day_onboarding' },
    orderIdx: 4,
    active: true,
  },

  // ─── referral (chapter 2) ───────────────────────────────────────────────
  {
    id: 'q_referral_first',
    chapter: 'referral',
    title: 'Первый реферал · First referral',
    description:
      'Пригласи одного человека по своей реф-ссылке — сеть TRENDEX начинается с первого шага. · Bring one person in through your link — every TRENDEX team starts here.',
    xp: 50,
    criteria: { type: 'referral_count', threshold: 1 },
    orderIdx: 1,
    active: true,
  },
  {
    id: 'q_referral_five',
    chapter: 'referral',
    title: '5 приглашённых · 5 referrals',
    description:
      'Собери первую пятёрку — подтверждённый костяк твоей команды и стабильный 1-й уровень. · Grow your first five — the core of your team and a solid level-1 line.',
    xp: 150,
    criteria: { type: 'referral_count', threshold: 5 },
    orderIdx: 2,
    active: true,
  },
  {
    id: 'q_referral_twenty',
    chapter: 'referral',
    title: '20 приглашённых — big league · 20 referrals — big league',
    description:
      'Двадцать активных рефералов открывают полноценную 5-уровневую сетку и стабильный приток. · Twenty active referrals unlock the full 5-level matrix and a steady stream.',
    xp: 400,
    criteria: { type: 'referral_count', threshold: 20 },
    orderIdx: 3,
    active: true,
  },

  // ─── booking (chapter 3) ────────────────────────────────────────────────
  {
    id: 'q_booking_first_paid',
    chapter: 'booking',
    title: 'Первая бронь тарифа · First tariff booking',
    description:
      'Забронируй стартовый тариф и закрепи место в раннем доступе — оплата открывает все доходные слоты. · Book your starting tariff and lock in early access — paid booking opens every earning slot.',
    xp: 75,
    criteria: { type: 'booking_paid', threshold: 1 },
    orderIdx: 1,
    active: true,
  },
  {
    id: 'q_booking_upgrade',
    chapter: 'booking',
    title: 'Апгрейд тарифа · Upgrade your tariff',
    description:
      'Перейди на следующий тариф — выше ступень, шире лимиты, крупнее доля от оборота сети. · Step up to the next tariff — higher caps and a bigger share of the network turnover.',
    xp: 125,
    criteria: { type: 'booking_paid', threshold: 2 },
    orderIdx: 2,
    active: true,
  },

  // ─── engagement (chapter 4) ─────────────────────────────────────────────
  {
    id: 'q_engage_streak_3',
    chapter: 'engagement',
    title: 'Стрик 3 дня · 3-day streak',
    description:
      'Заходи в TRENDEX три дня подряд — первая искра привычки и первый бейдж. · Show up three days in a row — the first spark of the habit and your first streak badge.',
    xp: 25,
    criteria: { type: 'streak_days', threshold: 3 },
    orderIdx: 1,
    active: true,
  },
  {
    id: 'q_engage_streak_30',
    chapter: 'engagement',
    title: 'Стрик 30 дней · 30-day streak',
    description:
      'Месяц ежедневной активности — ритм партнёра, который реально строит сеть. · A full month of daily activity — the rhythm of a partner who actually builds a team.',
    xp: 200,
    criteria: { type: 'streak_days', threshold: 30 },
    orderIdx: 2,
    active: true,
  },
  {
    id: 'q_engage_streak_90',
    chapter: 'engagement',
    title: 'Стрик 90 дней · 90-day streak',
    description:
      'Девяносто дней подряд — уровень легенды TRENDEX и заметное место в лидерборде. · Ninety days in a row — TRENDEX legend tier and a visible spot on the leaderboard.',
    xp: 500,
    criteria: { type: 'streak_days', threshold: 90 },
    orderIdx: 3,
    active: true,
  },
];
