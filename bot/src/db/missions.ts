/**
 * HTTP-backed repo for Phase 1C missions. Bot-side uses `/internal/missions/*`
 * (secret-gated) because the bot has no per-user JWT.
 */
import type { ApiClient } from "../api/client.js";

export interface MissionStep {
  day: number;
  key: string;
  title: string;
  description?: string;
}

export interface MissionRow {
  id: string;
  title: string;
  description: string;
  enrolled: boolean;
  total_days: number;
  completed_days: number[];
  steps: MissionStep[];
}

export class MissionsRepo {
  constructor(private readonly api: ApiClient) {}

  async listForUser(userId: number): Promise<MissionRow[]> {
    const r = await this.api.getJson<{ ok: boolean; missions: MissionRow[] }>(
      `/internal/missions/user/${userId}`,
    );
    return r.missions ?? [];
  }

  async getTemplate(id: string): Promise<{
    id: string;
    title: string;
    description: string;
    steps: MissionStep[];
    active: boolean;
  } | null> {
    try {
      const r = await this.api.getJson<{
        ok: boolean;
        mission: {
          id: string;
          title: string;
          description: string;
          steps: MissionStep[];
          active: boolean;
        };
      }>(`/missions/${id}`);
      return r.mission;
    } catch {
      return null;
    }
  }

  async enroll(userId: number, missionId: string): Promise<{ ok: boolean }> {
    return this.api.postJson("/internal/missions/enroll", {
      user_id: userId,
      mission_id: missionId,
    });
  }

  async completeDay(
    userId: number,
    missionId: string,
    day: number,
  ): Promise<{ ok: boolean; all_done?: boolean; already_done?: boolean }> {
    return this.api.postJson("/internal/missions/complete-day", {
      user_id: userId,
      mission_id: missionId,
      day,
    });
  }
}
