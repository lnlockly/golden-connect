/**
 * Mission template seed. One template — `partner_7day_onboarding` — a seven-
 * day ramp that walks a new GOLDEN_CONNECT partner from "profile" to "first referral
 * paid". Phase 2 Golden Connect copy.
 *
 * Text format: bilingual "RU · EN" in a single string (see quests.seed.ts for
 * the same convention). `day` / `key` are load-bearing and NOT changed by
 * this pass.
 */
import type { NewMissionTemplate } from '../db/schema.js';

export interface MissionStep {
  day: number;
  key: string;
  title: string;
  description: string;
}

export const PARTNER_7DAY_STEPS: MissionStep[] = [
  {
    day: 0,
    key: 'set_name',
    title: 'Заполни профиль · Set up your profile',
    description:
      'Укажи имя и добавь аватарку — тебя начнут узнавать в сети GOLDEN_CONNECT. · Add your name and a photo so people recognise you across the GOLDEN_CONNECT network.',
  },
  {
    day: 1,
    key: 'pick_role',
    title: 'Определи роль · Pick your role',
    description:
      'Пройди короткий квиз и выбери свой путь: бизнес, пользователь или партнёр. · Take the quick role quiz and lock in your path: business, user or partner.',
  },
  {
    day: 2,
    key: 'share_link',
    title: 'Поделись реф-ссылкой · Share your referral link',
    description:
      'Скопируй свою ссылку из /stats и отправь её трём знакомым лично. · Grab your link from /stats and send it to three people directly.',
  },
  {
    day: 3,
    key: 'study_tariffs',
    title: 'Изучи тарифы · Explore the tariffs',
    description:
      'Посмотри сравнение восьми тарифов — от Free до Royal — и поймёшь, что даёт каждый уровень. · Compare the eight tariffs from Free to Royal and see what each tier unlocks.',
  },
  {
    day: 4,
    key: 'pick_tariff',
    title: 'Выбери тариф · Choose your tariff',
    description:
      'Забронируй подходящий тариф для старта — это открывает доходные слоты платформы. · Reserve the tariff that fits your start — booking opens every earning slot on the platform.',
  },
  {
    day: 5,
    key: 'first_referral',
    title: 'Первый реферал · First referral',
    description:
      'Пригласи одного человека и доведи его до регистрации — первый узел твоей сети. · Invite one person and walk them through to sign-up — the first node of your team.',
  },
  {
    day: 6,
    key: 'graduate',
    title: 'Выпуск · Graduation',
    description:
      'Поздравляем — ты прошёл онбординг и открыл главное меню партнёра GOLDEN_CONNECT. · Congrats — onboarding done and the full GOLDEN_CONNECT partner menu is now unlocked.',
  },
];

export const MISSION_TEMPLATES: NewMissionTemplate[] = [
  {
    id: 'partner_7day_onboarding',
    title: 'Партнёрский онбординг · Partner onboarding',
    description:
      '7-дневная программа для нового партнёра GOLDEN_CONNECT: по одному шагу в день от профиля до первого реферала. · The 7-day ramp for new GOLDEN_CONNECT partners — one step a day from profile to first referral.',
    steps: PARTNER_7DAY_STEPS,
    policy: { pause_after_days: 3, reset_after_days: 14 },
    active: true,
  },
];
