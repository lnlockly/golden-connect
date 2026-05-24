/**
 * HTTP-backed repo for Phase 1C quizzes. Submissions write through
 * /internal/quizzes/* so the bot can associate the tg user's user_id.
 */
import type { ApiClient } from "../api/client.js";

export interface QuizOption {
  label: string;
  score_map?: Record<string, number>;
}

export interface QuizQuestion {
  key: string;
  q: string;
  options: QuizOption[];
}

export interface QuizRow {
  id: string;
  title: string;
  description: string;
  questions: QuizQuestion[];
}

export class QuizzesRepo {
  constructor(private readonly api: ApiClient) {}

  async get(id: string): Promise<QuizRow | null> {
    try {
      const r = await this.api.getJson<{ ok: boolean; quiz: QuizRow }>(
        `/quizzes/${id}`,
      );
      return r.quiz;
    } catch {
      return null;
    }
  }

  async submit(
    userId: number,
    quizId: string,
    answers: Record<string, number>,
  ): Promise<{
    ok: boolean;
    result: string | null;
    top_bucket: string | null;
    buckets: Record<string, number>;
    quests_granted: Array<{ questId: string; xp: number }>;
  }> {
    return this.api.postJson(`/internal/quizzes/submit`, {
      user_id: userId,
      quiz_id: quizId,
      answers,
    });
  }
}
