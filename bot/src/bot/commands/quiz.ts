/**
 * /quiz — inline keyboard-driven quiz.
 *
 * Two built-in quiz ids are exposed via `/quiz` + list buttons. State is
 * carried in callback_data (bot is stateless) — we encode the quiz id, the
 * question index, and the running answers array index-encoded.
 *
 * Callback shape:
 *   quiz:list                               — the initial menu
 *   quiz:start:<quiz_id>                    — begin
 *   quiz:ans:<quiz_id>:<qIdx>:<answers>     — answers = "1,0,2,..." option-indexes so far
 *
 * For a 5-question quiz with <=8 options the data stays well under Telegram's
 * 64-byte callback limit.
 */
import { InlineKeyboard } from "grammy";
import type { AppContext } from "../middleware.js";
import type { QuizzesRepo, QuizRow } from "../../db/quizzes.js";
import { pickLang, tr } from "../../services/i18n.js";

const BUILT_IN_QUIZZES = ["onboarding_role", "tariff_picker"] as const;

function parseAnswers(s: string): number[] {
  if (!s) return [];
  return s
    .split(",")
    .filter((x) => x.length)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));
}

function encodeAnswers(list: number[]): string {
  return list.join(",");
}

export function makeOnQuiz(quizzesRepo: QuizzesRepo) {
  async function showList(ctx: AppContext): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    const lang = pickLang(user?.language_code ?? from.language_code);

    const kb = new InlineKeyboard();
    const listLines: string[] = [];
    let any = false;
    for (const qid of BUILT_IN_QUIZZES) {
      const q = await quizzesRepo.get(qid).catch(() => null);
      if (!q) continue;
      any = true;
      kb.text(`${q.title}`, `quiz:start:${qid}`).row();
      listLines.push(`• <b>${q.title}</b>`);
      if (q.description) listLines.push(`  <i>${q.description}</i>`);
    }
    const header = `<b>${tr(lang, "quizzes.title")}</b>`;
    const body = any
      ? `${tr(lang, "quizzes.start_button")}\n\n${listLines.join("\n")}`
      : tr(lang, "quizzes.empty");
    await ctx.reply(`${header}\n\n${body}`, {
      parse_mode: "HTML",
      reply_markup: kb,
    });
  }

  async function askQuestion(
    ctx: AppContext,
    quiz: QuizRow,
    qIdx: number,
    answers: number[],
  ): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    const lang = pickLang(user?.language_code ?? from.language_code);

    const q = quiz.questions[qIdx];
    if (!q) return;
    const kb = new InlineKeyboard();
    q.options.forEach((opt, idx) => {
      const next = encodeAnswers([...answers, idx]);
      kb.text(opt.label, `quiz:ans:${quiz.id}:${qIdx + 1}:${next}`).row();
    });

    const header = tr(lang, "quizzes.question_prefix", {
      n: qIdx + 1,
      total: quiz.questions.length,
    });
    const text = `<b>${header}</b>\n\n${q.q}`;
    // Re-send each question as a fresh message so the user sees progress.
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }

  async function submit(
    ctx: AppContext,
    quiz: QuizRow,
    answers: number[],
  ): Promise<void> {
    const from = ctx.from;
    if (!from) return;
    const user = ctx.user ?? (await ctx.state.repoUsers.findByTgId(from.id));
    if (!user) return;
    const lang = pickLang(user.language_code ?? from.language_code);

    // Convert array-indexed answers back to object keyed by q.key so the API
    // can look up each question's selected option.
    const obj: Record<string, number> = {};
    quiz.questions.forEach((q, i) => {
      if (typeof answers[i] === "number") obj[q.key] = answers[i]!;
    });

    const res = await quizzesRepo
      .submit(user.id, quiz.id, obj)
      .catch(() => null);
    if (!res) {
      await ctx.reply(tr(lang, "quizzes.empty"));
      return;
    }
    const lines: string[] = [];
    lines.push(`<b>${tr(lang, "quizzes.result_intro")}</b>`);
    lines.push(res.result ? res.result : "—");
    if (res.quests_granted.length > 0) {
      const xpTotal = res.quests_granted.reduce((a, b) => a + b.xp, 0);
      lines.push("");
      lines.push(`+${xpTotal} XP`);
    }
    const kb = new InlineKeyboard()
      .text(tr(lang, "quizzes.retake"), `quiz:start:${quiz.id}`)
      .row()
      .text(tr(lang, "leaderboard.back"), "quiz:list");
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
  }

  const onQuiz = async (ctx: AppContext): Promise<void> => {
    await showList(ctx);
  };

  const onCallback = async (ctx: AppContext): Promise<boolean> => {
    const data = ctx.callbackQuery?.data;
    if (!data || !data.startsWith("quiz:")) return false;
    try {
      await ctx.answerCallbackQuery();
    } catch {
      /* noop */
    }

    if (data === "quiz:list") {
      await showList(ctx);
      return true;
    }
    if (data.startsWith("quiz:start:")) {
      const qid = data.slice("quiz:start:".length);
      const quiz = await quizzesRepo.get(qid).catch(() => null);
      if (!quiz) return true;
      await askQuestion(ctx, quiz, 0, []);
      return true;
    }
    if (data.startsWith("quiz:ans:")) {
      // quiz:ans:<quiz_id>:<qIdx>:<answers>
      const rest = data.slice("quiz:ans:".length);
      const firstSep = rest.indexOf(":");
      if (firstSep < 0) return true;
      const qid = rest.slice(0, firstSep);
      const tail = rest.slice(firstSep + 1);
      const secondSep = tail.indexOf(":");
      if (secondSep < 0) return true;
      const qIdx = Number(tail.slice(0, secondSep));
      const answers = parseAnswers(tail.slice(secondSep + 1));
      const quiz = await quizzesRepo.get(qid).catch(() => null);
      if (!quiz) return true;
      if (qIdx >= quiz.questions.length) {
        await submit(ctx, quiz, answers);
        return true;
      }
      await askQuestion(ctx, quiz, qIdx, answers);
      return true;
    }
    return false;
  };

  return { onQuiz, onCallback };
}
