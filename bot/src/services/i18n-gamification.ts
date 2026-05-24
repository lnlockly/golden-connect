/**
 * Phase 1C — gamification i18n strings (Phase 2 content pass).
 *
 * Final copy for quests / missions / quizzes / streaks / badges / levels /
 * leaderboard, tuned to Golden Connect tone (friendly, motivating, no health topics).
 * Namespace keys are load-bearing — only the *values* changed in this pass.
 *
 * Side-effect module: importing it once at boot registers every namespace.
 * The bot's `index.ts` or one of the command modules pulls it in.
 */
import { registerStrings } from "./i18n.js";

registerStrings("en", {
  quests: {
    title: "🏆 Your GOLDEN_CONNECT quests",
    empty: "No active quests yet — open /start and take the first step.",
    in_progress: "In progress",
    completed: "Done",
    chapter: "Chapter",
    xp_reward: "+{xp} XP",
    progress_line: "{progress}/{threshold}",
    view_button: "Open quests",
    summary: "Completed: {done}/{total} · {xp} XP · Level {level}",
  },
  missions: {
    title: "🎯 Missions",
    empty: "No active missions right now. New programmes will appear here.",
    enrol_cta: "Join mission",
    enrol_done: "You're in — see you tomorrow for day 1.",
    day_done: "Day {day} done — nice move!",
    day_button: "Day {day}",
    all_done: "Mission complete — you've graduated 🎉",
    progress: "Progress: {done}/{total} days",
    current_day: "Current step: day {day}/{total}",
  },
  quizzes: {
    title: "🧭 Quizzes",
    empty: "No quizzes available right now.",
    start_button: "Pick a quiz and tap to start ↓",
    question_prefix: "Question {n}/{total}",
    result_intro: "Your result:",
    retake: "Retake quiz",
  },
  streaks: {
    title: "🔥 Streak",
    current: "Current streak: {days} days",
    longest: "Personal best: {days} days",
    today_done: "Checked in for today — keep the fire going!",
    broken: "Streak reset — no worries, start a new one today.",
  },
  badges: {
    streak_3: "🔥 3-day spark",
    streak_30: "⚡ 30-day rhythm",
    streak_90: "💎 90-day legend",
    earned: "New badge unlocked: {badge}!",
  },
  levels: {
    label: "Level {level}",
    progress: "{in_level}/{span} XP",
    level_up: "🎉 Level up! You reached level {level}.",
  },
  leaderboard: {
    title: "👑 GOLDEN_CONNECT leaderboard",
    empty: "No results yet — be the first on the board.",
    row: "{rank}. user#{user_id} — {xp} XP (lvl {level})",
    period_day: "Today",
    period_week: "This week",
    period_month: "This month",
    period_all: "All time",
    refresh: "🔄 Refresh",
    back: "← Back",
  },
});

registerStrings("ru", {
  quests: {
    title: "🏆 Твои квесты GOLDEN_CONNECT",
    empty: "Пока нет активных квестов — открой /start и сделай первый шаг.",
    in_progress: "В процессе",
    completed: "Готово",
    chapter: "Глава",
    xp_reward: "+{xp} XP",
    progress_line: "{progress}/{threshold}",
    view_button: "Открыть квесты",
    summary: "Выполнено: {done}/{total} · {xp} XP · Уровень {level}",
  },
  missions: {
    title: "🎯 Миссии",
    empty: "Пока нет активных миссий. Новые программы появятся здесь.",
    enrol_cta: "Присоединиться",
    enrol_done: "Ты в деле — до встречи на первом дне.",
    day_done: "День {day} засчитан — так держать!",
    day_button: "День {day}",
    all_done: "Миссия пройдена — ты выпускник 🎉",
    progress: "Прогресс: {done}/{total} дней",
    current_day: "Текущий шаг: день {day}/{total}",
  },
  quizzes: {
    title: "🧭 Квизы",
    empty: "Сейчас активных квизов нет.",
    start_button: "Выбери квиз и нажми, чтобы начать ↓",
    question_prefix: "Вопрос {n}/{total}",
    result_intro: "Твой результат:",
    retake: "Пройти ещё раз",
  },
  streaks: {
    title: "🔥 Стрик",
    current: "Текущий стрик: {days} дн.",
    longest: "Личный рекорд: {days} дн.",
    today_done: "Сегодня засчитано — огонь не гаснет!",
    broken: "Стрик сброшен — ничего страшного, начинаем новый.",
  },
  badges: {
    streak_3: "🔥 Искра (3 дня)",
    streak_30: "⚡ Ритм (30 дней)",
    streak_90: "💎 Легенда (90 дней)",
    earned: "Новый бейдж: {badge}!",
  },
  levels: {
    label: "Уровень {level}",
    progress: "{in_level}/{span} XP",
    level_up: "🎉 Новый уровень: {level}!",
  },
  leaderboard: {
    title: "👑 Лидерборд GOLDEN_CONNECT",
    empty: "Пока пусто — стань первым в таблице.",
    row: "{rank}. user#{user_id} — {xp} XP (ур. {level})",
    period_day: "Сегодня",
    period_week: "Неделя",
    period_month: "Месяц",
    period_all: "За всё время",
    refresh: "🔄 Обновить",
    back: "← Назад",
  },
});
