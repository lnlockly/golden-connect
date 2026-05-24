/**
 * Quiz seed — two onboarding quizzes.
 *   onboarding_role  — 5 questions → business / user / partner bucket
 *   tariff_picker    — 4 questions → free / basic / pro / elite slug
 *
 * Phase 2 TrendeX copy. Bucket keys (`business`, `user`, `partner`, `free`,
 * `basic`, `pro`, `elite`) are load-bearing and MUST NOT change once the
 * quiz id is in production — the quiz id is referenced by quests and by the
 * bot's checkQuestProgress flow.
 *
 * `score_map` values are scoring logic and stay untouched; only `q`,
 * `label`, `title`, `description` and `resultMap` values (final human-
 * readable sentences shown to the user) are rewritten here.
 *
 * Each `resultMap` entry is a bilingual "RU · EN" string the bot prints
 * verbatim on the result screen — that matches the pattern used in
 * quests/missions seeds.
 */
import type { NewQuiz } from '../db/schema.js';

interface QuizOption {
  label: string;
  score_map?: Record<string, number>;
}
interface QuizQuestion {
  key: string;
  q: string;
  options: QuizOption[];
}

const ROLE_QS: QuizQuestion[] = [
  {
    key: 'motivation',
    q: 'Что тебя привело на TRENDEX? · What brought you to TRENDEX?',
    options: [
      {
        label: 'Хочу продвигать свой продукт · I want to promote my product',
        score_map: { business: 2 },
      },
      {
        label: 'Хочу зарабатывать как пользователь · I want to earn as a user',
        score_map: { user: 2 },
      },
      {
        label: 'Хочу строить команду · I want to build a team',
        score_map: { partner: 2 },
      },
    ],
  },
  {
    key: 'budget',
    q: 'Какой у тебя бюджет на старт? · What budget are you starting with?',
    options: [
      {
        label: '0 — только бесплатный тариф · 0 — free tier only',
        score_map: { user: 1 },
      },
      {
        label: '30–100 USD · 30–100 USD',
        score_map: { user: 1, partner: 1 },
      },
      {
        label: '300–1000 USD · 300–1000 USD',
        score_map: { business: 2, partner: 1 },
      },
    ],
  },
  {
    key: 'time',
    q: 'Сколько времени готов уделять в неделю? · How much time per week can you put in?',
    options: [
      {
        label: 'Меньше часа · Under 1 hour',
        score_map: { user: 1 },
      },
      {
        label: '3–5 часов · 3–5 hours',
        score_map: { user: 1, partner: 1 },
      },
      {
        label: '10+ часов · 10+ hours',
        score_map: { business: 1, partner: 2 },
      },
    ],
  },
  {
    key: 'network',
    q: 'Скольких людей реально можешь пригласить? · How many people could you realistically invite?',
    options: [
      {
        label: 'Никого — начну с нуля · Nobody — starting from zero',
        score_map: { user: 1 },
      },
      {
        label: '5–10 знакомых · 5–10 friends',
        score_map: { partner: 1 },
      },
      {
        label: '50+ — у меня уже есть аудитория · 50+ — I already have an audience',
        score_map: { partner: 2, business: 1 },
      },
    ],
  },
  {
    key: 'goal',
    q: 'Цель на ближайшие 3 месяца? · Your goal for the next 3 months?',
    options: [
      {
        label: 'Пассивный доход · Passive income',
        score_map: { user: 2 },
      },
      {
        label: 'Рекламный охват для бизнеса · Ad reach for my business',
        score_map: { business: 2 },
      },
      {
        label: 'Стать лидером команды · Become a team leader',
        score_map: { partner: 2 },
      },
    ],
  },
];

const TARIFF_QS: QuizQuestion[] = [
  {
    key: 'entry',
    q: 'Какой взнос на старте комфортен? · What entry fee feels comfortable?',
    options: [
      {
        label: 'Только бесплатно · Free only',
        score_map: { free: 3 },
      },
      {
        label: '30–60 USD · 30–60 USD',
        score_map: { basic: 2 },
      },
      {
        label: '~200 USD · ~200 USD',
        score_map: { pro: 2 },
      },
      {
        label: '500+ USD · 500+ USD',
        score_map: { elite: 3 },
      },
    ],
  },
  {
    key: 'daily_cap',
    q: 'Какой ориентир ежедневного дохода? · What daily earnings target fits you?',
    options: [
      {
        label: 'До 10 USD · Up to 10 USD',
        score_map: { free: 1, basic: 1 },
      },
      {
        label: '20–30 USD · 20–30 USD',
        score_map: { basic: 1, pro: 2 },
      },
      {
        label: '50+ USD · 50+ USD',
        score_map: { pro: 1, elite: 2 },
      },
    ],
  },
  {
    key: 'horizon',
    q: 'На какой срок планируешь участие? · How long do you plan to stay in?',
    options: [
      {
        label: 'Пробую — неделю-две · Just trying — a week or two',
        score_map: { free: 2 },
      },
      {
        label: '1–3 месяца · 1–3 months',
        score_map: { basic: 1, pro: 1 },
      },
      {
        label: 'Год и больше · A year or more',
        score_map: { pro: 1, elite: 2 },
      },
    ],
  },
  {
    key: 'team',
    q: 'Будешь ли собирать команду? · Will you recruit a team?',
    options: [
      {
        label: 'Нет, работаю один · No, I work solo',
        score_map: { free: 1, basic: 1 },
      },
      {
        label: 'Небольшую, 3–10 человек · A small one, 3–10 people',
        score_map: { basic: 1, pro: 2 },
      },
      {
        label: 'Да, большую сеть · Yes, a large network',
        score_map: { pro: 1, elite: 3 },
      },
    ],
  },
];

export const QUIZZES: NewQuiz[] = [
  {
    id: 'onboarding_role',
    title: 'Квиз ролей · Role quiz',
    description:
      '5 вопросов, чтобы понять твою роль на TRENDEX: бизнес, пользователь или партнёр. · 5 questions to pinpoint your role on TRENDEX: business, user or partner.',
    questions: ROLE_QS,
    resultMap: {
      business:
        'Ты — БИЗНЕС. Закупай рекламные слоты, получай x2 бюджет в раннем доступе и выводи продукт на целевую аудиторию TRENDEX. · You are a BUSINESS. Book ad slots, grab the x2 early-access budget and put your product in front of the TRENDEX audience.',
      user:
        'Ты — ПОЛЬЗОВАТЕЛЬ. Зарабатывай на задачах и активности, проходи квесты и копи XP — без обязательств по команде. · You are a USER. Earn on tasks and activity, complete quests and stack XP — no team commitment required.',
      partner:
        'Ты — ПАРТНЁР. Строй команду, используй 5-уровневую реферальную сетку и получай долю с оборота сети. · You are a PARTNER. Build a team, work the 5-level referral matrix and take a share of the network turnover.',
    },
    active: true,
  },
  {
    id: 'tariff_picker',
    title: 'Подбор тарифа · Tariff picker',
    description:
      '4 вопроса о бюджете, времени и целях — подберём тариф от Free до Elite. · 4 questions on budget, time and goals — we match you with a tariff from Free to Elite.',
    questions: TARIFF_QS,
    resultMap: {
      free:
        'Рекомендуем тариф FREE — попробуй TRENDEX без взноса, пройди квесты и разберись в платформе перед апгрейдом. · We recommend the FREE tariff — try TRENDEX with no entry fee, run through the quests and feel the platform out before you upgrade.',
      basic:
        'Рекомендуем тариф BASIC — оптимальный старт с небольшим бюджетом и доступом к основным доходным слотам. · We recommend the BASIC tariff — the best start on a light budget, with access to the core earning slots.',
      pro:
        'Рекомендуем тариф PRO — подходит, если готов вкладывать время и строить команду: выше лимиты и крупнее доля от оборота. · We recommend the PRO tariff — a fit if you are ready to invest time and build a team: higher caps and a bigger network share.',
      elite:
        'Рекомендуем тариф ELITE — максимум лимитов, приоритетные слоты и самая высокая доля с оборота сети TRENDEX. · We recommend the ELITE tariff — top caps, priority slots and the largest share of TRENDEX network turnover.',
    },
    active: true,
  },
];
