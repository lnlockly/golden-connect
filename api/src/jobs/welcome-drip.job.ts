/**
 * Welcome drip job — Phase 1B.
 *
 * Sequence — one short message per "day", measured from `drip_state.started_at`:
 *   step 0 → immediately (elapsed >= 0)
 *   step 1 → 1 day
 *   step 2 → 2 days
 *   step 3 → 3 days
 *   step 4 → 4 days
 *
 * Each user gets at most ONE step per tick (so a long-dormant user catches
 * up one step per run, 30 min apart — 2.5h to deliver the backlog, which
 * is fine). That also simplifies dedup: we never race two steps for the
 * same user in one tick.
 *
 * Text content lives inline as RU/EN per step. The job picks by the
 * user's `languageCode` (fallback to RU). Templates are intentionally
 * duplicated from bot/src/services/i18n-phase1b.ts so the cron pod is
 * self-contained (no cross-pod template fetch). Phase 2B rewrote both
 * copies to final TrendeX tone-of-voice in sync.
 */
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { dripState, users } from '../db/schema.js';
import { logger } from '../lib/logger.js';
import { tgSendMessage } from '../services/tg-send.js';
import { registerJob } from './scheduler.js';

const TOTAL_STEPS = 5;
const STEP_DELAYS_HOURS = [0, 24, 48, 72, 96] as const;

// TrendeX welcome drip — 5 short, action-oriented messages over days 0–4.
// Each ends with a concrete next step (/start, /events, etc.). Tone mirrors
// bot/src/bot/commands/start.ts (friendly, business, no MLM/health angles).
interface DripMsg {
  text: string;
}

const DRIP_RU: readonly DripMsg[] = [
  {
    text:
      '👋 <b>Добро пожаловать в TRENDEX!</b>\n\n' +
      'Это рекламная экосистема, где встречаются три роли: <b>бизнес</b> размещает рекламу, <b>пользователи</b> получают доход за активность, <b>партнёры</b> строят сеть и зарабатывают с её оборота.\n\n' +
      'Открой /start — там кабинет, ссылка для друзей и главное меню. Внутри всё настроено, останется только выбрать свою роль.',
  },
  {
    text:
      '💼 <b>День 2: тарифы и место в сети</b>\n\n' +
      'У TRENDEX 8 тарифов — от <b>free</b> до <b>royal</b>. На free ты уже можешь изучить платформу и пригласить первых друзей. Платные тарифы открывают бронирование рекламных мест и повышают долю с оборота сети.\n\n' +
      'Загляни в /start → «Открыть кабинет» и посмотри, какой тариф тебе подходит.',
  },
  {
    text:
      '🤝 <b>День 3: реферальная система (5 уровней)</b>\n\n' +
      'Каждый, кто пришёл по твоей ссылке, попадает в твою сеть — и ты получаешь доход с 5 уровней вглубь. Чем раньше ты внутри, тем ниже позиция и больше входящий поток.\n\n' +
      'Открой /start → «Моя команда» — там твоя персональная ссылка и статистика. Отправь её хотя бы одному другу сегодня.',
  },
  {
    text:
      '📡 <b>День 4: живые эфиры и вебинары</b>\n\n' +
      'Мы регулярно проводим эфиры: запуск первой рекламы, разбор партнёрского плана, ответы на вопросы. Формат — 40–60 минут, без воды, с чатом.\n\n' +
      'Открой /events и запишись на ближайший — пришлю напоминание за 24 часа и за час до старта.',
  },
  {
    text:
      '🚀 <b>День 5: путь партнёра</b>\n\n' +
      'Ты уже внутри — время двигаться дальше. Впереди квесты, миссии и уровни партнёрского плана: от первых приглашений до статуса <b>royal</b>. Каждый шаг добавляет процент к твоей доле с оборота сети.\n\n' +
      'Открой /start и загляни в кабинет — там видно, где ты сейчас и что даст следующий шаг. Если что-то непонятно — просто напиши сюда, ассистент ответит.',
  },
];

const DRIP_EN: readonly DripMsg[] = [
  {
    text:
      '👋 <b>Welcome to TRENDEX!</b>\n\n' +
      'This is an advertising ecosystem where three roles meet: <b>businesses</b> run ads, <b>users</b> earn for activity, and <b>partners</b> grow the network and share its turnover.\n\n' +
      "Open /start — you'll find your cabinet, invite link and the main menu. Everything's set up; you just pick your role.",
  },
  {
    text:
      '💼 <b>Day 2: tariffs and your spot in the network</b>\n\n' +
      'TRENDEX has 8 tariffs — from <b>free</b> to <b>royal</b>. Free already lets you explore the platform and invite first friends. Paid tiers unlock ad-slot booking and bump your share of the network turnover.\n\n' +
      'Tap /start → "Open cabinet" and see which tariff fits you.',
  },
  {
    text:
      '🤝 <b>Day 3: the 5-level referral system</b>\n\n' +
      'Everyone who signs up via your link joins your network — and you earn from 5 levels deep. Earlier entry = lower position = bigger inflow.\n\n' +
      'Open /start → "My team" for your personal link and stats. Send it to at least one friend today.',
  },
  {
    text:
      '📡 <b>Day 4: live events and webinars</b>\n\n' +
      'We run regular sessions: launching your first ad, breaking down the partner plan, live Q&A. 40–60 minutes, no filler, with chat.\n\n' +
      "Run /events and register for the next one — I'll remind you 24h and 1h before the start.",
  },
  {
    text:
      '🚀 <b>Day 5: the partner path</b>\n\n' +
      "You're already inside — time to move further. Ahead: quests, missions and the partner-plan tiers, from first invites up to <b>royal</b>. Every step adds a percentage to your share of the network turnover.\n\n" +
      "Open /start and check your cabinet — you'll see where you are now and what the next step unlocks. Got questions? Just write here and the assistant will help.",
  },
];

function pickDrip(lang: string | null | undefined): readonly DripMsg[] {
  const c = (lang ?? '').toLowerCase();
  if (c.startsWith('ru')) return DRIP_RU;
  return DRIP_EN;
}

async function run(): Promise<void> {
  const now = new Date();

  // Pull all drip_state rows that are not completed and not paused. For
  // large tenants this should be chunked; Phase 1B volumes are fine
  // unchunked. Join users to get tg_id + language.
  const candidates = await db
    .select({
      userId: dripState.userId,
      startedAt: dripState.startedAt,
      lastStepSent: dripState.lastStepSent,
      paused: dripState.paused,
      tgId: users.tgId,
      languageCode: users.languageCode,
      isBlocked: users.isBlocked,
    })
    .from(dripState)
    .innerJoin(users, eq(users.id, dripState.userId))
    .where(
      and(
        isNull(dripState.completedAt),
        eq(dripState.paused, false),
      ),
    );

  for (const c of candidates) {
    if (c.isBlocked || c.tgId == null) continue;
    const nextStep = (c.lastStepSent ?? -1) + 1;
    if (nextStep >= TOTAL_STEPS) {
      // Sanity: mark completed even if somehow left open.
      await db
        .update(dripState)
        .set({ completedAt: now })
        .where(eq(dripState.userId, c.userId));
      continue;
    }

    const elapsedMs = now.getTime() - c.startedAt.getTime();
    const requiredMs = STEP_DELAYS_HOURS[nextStep]! * 3600 * 1000;
    if (elapsedMs < requiredMs) continue;

    // Skip if user has been registered > 14 days and still hasn't got step 0
    // — avoid spamming old accounts with the welcome series on first run.
    if (elapsedMs > 14 * 24 * 3600 * 1000 && nextStep === 0) {
      await db
        .update(dripState)
        .set({ completedAt: now, lastStepSent: TOTAL_STEPS - 1 })
        .where(eq(dripState.userId, c.userId));
      continue;
    }

    const dict = pickDrip(c.languageCode);
    const msg = dict[nextStep]!;
    const res = await tgSendMessage(c.tgId, msg.text, {
      parseMode: 'HTML',
      disableWebPagePreview: true,
    });

    if (res.ok || res.blocked) {
      // On both success AND bot-blocked we advance the pointer — blocked
      // means we should stop trying anyway, so we might as well close
      // the sequence rather than retry next tick.
      const isFinal = nextStep >= TOTAL_STEPS - 1;
      await db
        .update(dripState)
        .set({
          lastStepSent: nextStep,
          lastStepAt: now,
          completedAt: isFinal || res.blocked ? now : null,
        })
        .where(eq(dripState.userId, c.userId));
      logger.info(
        { userId: c.userId, step: nextStep, blocked: res.blocked ?? false },
        'welcome-drip: step processed',
      );
    } else {
      // Transient failure — leave pointer, will retry on next tick.
      logger.warn(
        { userId: c.userId, step: nextStep, err: res.error },
        'welcome-drip: send failed, will retry',
      );
    }
  }

  // Suppress unused-import warnings for helpers we keep ready for future
  // enrichment (e.g. query-side filtering via lte(lastStepAt, …)).
  void lte;
  void or;
  void sql;
}

registerJob({
  name: 'welcome-drip',
  schedule: '*/30 * * * *', // every 30 min
  timezone: 'Europe/Moscow',
  handler: run,
});
