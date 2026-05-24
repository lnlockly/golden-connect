/**
 * HTTP-backed repo for Phase 1C gamification. The bot is stateless — it only
 * translates grammy commands into golden-connect-api calls. Because the bot has no
 * per-user JWT it calls the `/internal/gamification/*` variants (secret-gated)
 * passing `user_id` explicitly.
 */
import type { ApiClient } from "../api/client.js";

export interface QuestRow {
  id: string;
  title: string;
  description: string;
  xp: number;
  completed: boolean;
  progress: number;
  completed_at: string | null;
}

export interface QuestChapter {
  chapter: string;
  quests: QuestRow[];
}

export interface StreakResponse {
  current_streak: number;
  longest_streak: number;
  last_action_at: string | null;
}

export interface XpResponse {
  total_xp: number;
  level: number;
  xp_in_level: number;
  xp_to_next: number;
  xp_span: number;
  fraction: number;
}

export interface LeaderboardRow {
  rank: number;
  user_id: number;
  xp: number;
  level: number;
}

export class GamificationRepo {
  constructor(private readonly api: ApiClient) {}

  async registerAction(userId: number, actionType: string): Promise<{
    streak: number;
    longest_streak: number;
    badges_earned: string[];
    quests_granted: Array<{ questId: string; xp: number }>;
  }> {
    return this.api.postJson("/internal/gamification/register-action", {
      user_id: userId,
      action_type: actionType,
    });
  }

  async checkQuestProgress(
    userId: number,
    triggerEvent: string,
    opts: { increment_by?: number; absolute_value?: number; context?: Record<string, unknown> } = {},
  ): Promise<{
    granted: Array<{ questId: string; xp: number }>;
    total_xp_granted: number;
  }> {
    return this.api.postJson("/internal/quests/check-progress", {
      user_id: userId,
      trigger_event: triggerEvent,
      ...opts,
    });
  }

  async myStreaks(userId: number): Promise<StreakResponse> {
    const r = await this.api.getJson<StreakResponse & { ok: boolean }>(
      `/internal/gamification/streaks/${userId}`,
    );
    return r;
  }

  async myXp(userId: number): Promise<XpResponse> {
    const r = await this.api.getJson<XpResponse & { ok: boolean }>(
      `/internal/gamification/xp/${userId}`,
    );
    return r;
  }

  async myQuests(userId: number): Promise<QuestChapter[]> {
    const r = await this.api.getJson<{ ok: boolean; chapters: QuestChapter[] }>(
      `/internal/gamification/quests/${userId}`,
    );
    return r.chapters ?? [];
  }

  async leaderboard(period: "day" | "week" | "month" | "all" = "week", limit = 20): Promise<LeaderboardRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: LeaderboardRow[] }>(
      `/gamification/leaderboard?period=${period}&limit=${limit}`,
    );
    return r.rows ?? [];
  }
}
