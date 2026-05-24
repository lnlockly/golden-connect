/**
 * Bot-side HTTP client for Phase 1A referral endpoints. Mirrors the
 * UsersRepo pattern — every call goes through ApiClient (internal
 * secret). The bot always acts on behalf of a specific user so methods
 * take `userId` (the goldenConnect-side id resolved from users repo).
 */
import type { ApiClient } from "../api/client.js";

export type ReferralStage =
  | "invited"
  | "joined"
  | "active"
  | "booked"
  | "paid"
  | "dormant"
  | "lost";

export interface FunnelCounts {
  invited: number;
  joined: number;
  active: number;
  booked: number;
  paid: number;
  dormant: number;
  lost: number;
  total: number;
}

export interface ChallengeRow {
  id: number;
  challenge_id: string;
  goal: number;
  progress: number;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface ChallengeTemplate {
  id: string;
  goal: number;
  durationDays: number;
  badgeId: string;
}

export interface BadgeRow {
  id: number;
  badge_id: string;
  earned_at: string;
  payload: unknown;
}

export interface ReferralStatsResponse {
  ok: boolean;
  funnel: FunnelCounts;
  challenges: {
    active: ChallengeRow[];
    completed: ChallengeRow[];
    catalog: ChallengeTemplate[];
  };
  badges: BadgeRow[];
}

export interface RefereeRow {
  referral_id: number;
  invitee_id: number;
  tg_username: string | null;
  first_name: string | null;
  stage: ReferralStage;
  stage_changed_at: string;
  source: string | null;
  created_at: string;
  last_contact_at: string | null;
}

export interface LeaderboardEntry {
  user_id: number;
  tg_username: string | null;
  first_name: string | null;
  paid_count: number;
}

export interface AttachResult {
  ok: boolean;
  created: boolean;
  referral: { id: number; stage: ReferralStage };
}

export class ReferralsRepo {
  constructor(private readonly api: ApiClient) {}

  async ensureCode(userId: number): Promise<string | null> {
    try {
      const r = await this.api.postJson<{ ok: boolean; code: string }>(
        `/internal/referrals/${userId}/code`,
      );
      return r.code;
    } catch {
      return null;
    }
  }

  async stats(userId: number): Promise<ReferralStatsResponse | null> {
    try {
      return await this.api.getJson<ReferralStatsResponse>(
        `/internal/referrals/${userId}/stats`,
      );
    } catch {
      return null;
    }
  }

  async listMine(
    userId: number,
    limit = 50,
    offset = 0,
  ): Promise<RefereeRow[]> {
    try {
      const r = await this.api.getJson<{ ok: boolean; rows: RefereeRow[] }>(
        `/internal/referrals/${userId}/list?limit=${limit}&offset=${offset}`,
      );
      return r.rows;
    } catch {
      return [];
    }
  }

  async leaderboard(days = 30, limit = 20): Promise<LeaderboardEntry[]> {
    try {
      const r = await this.api.getJson<{
        ok: boolean;
        rows: LeaderboardEntry[];
      }>(`/internal/referrals/leaderboard?days=${days}&limit=${limit}`);
      return r.rows;
    } catch {
      return [];
    }
  }

  async startChallenge(
    userId: number,
    templateId: string,
  ): Promise<ChallengeRow | null> {
    try {
      const r = await this.api.postJson<{
        ok: boolean;
        challenge: ChallengeRow | null;
      }>(`/internal/referrals/${userId}/challenge/start`, {
        template_id: templateId,
      });
      return r.challenge;
    } catch {
      return null;
    }
  }

  /**
   * Record a new edge. Called from /start handler on `ref_<code>` payloads.
   * Idempotent — returns the existing row if (referrer, invitee) already
   * exists.
   */
  async attach(
    referrerId: number,
    inviteeId: number,
    source: string,
  ): Promise<AttachResult | null> {
    try {
      return await this.api.postJson<AttachResult>(
        "/internal/referrals/attach",
        { referrer_id: referrerId, invitee_id: inviteeId, source },
      );
    } catch {
      return null;
    }
  }
}
