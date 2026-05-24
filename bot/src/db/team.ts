/**
 * Bot-side HTTP client for /internal/team/*. Partner CRM endpoints —
 * funnel + notes + next-actions feed.
 */
import type { ApiClient } from "../api/client.js";
import type { FunnelCounts, RefereeRow } from "./referrals.js";

export interface NextActionRow {
  id: number;
  target_user_id: number;
  target_tg_username: string | null;
  target_first_name: string | null;
  action_type: string;
  reason: string;
  priority: number;
  created_at: string;
  done_at: string | null;
}

export interface NoteRow {
  id: number;
  contact_user_id: number;
  note: string;
  next_contact_at: string | null;
  created_at: string;
  updated_at: string;
}

export class TeamRepo {
  constructor(
    private readonly api: ApiClient,
    // Team funnel is the same data as referral funnel — we reuse the
    // referral repo via composition rather than a separate endpoint.
    private readonly referralsList: (
      userId: number,
      limit?: number,
      offset?: number,
    ) => Promise<RefereeRow[]>,
  ) {}

  async overview(userId: number): Promise<FunnelCounts | null> {
    try {
      const r = await this.api.getJson<{ ok: boolean; funnel: FunnelCounts }>(
        `/internal/team/${userId}/overview`,
      );
      return r.funnel;
    } catch {
      return null;
    }
  }

  async listReferees(
    userId: number,
    limit = 50,
    offset = 0,
  ): Promise<RefereeRow[]> {
    return this.referralsList(userId, limit, offset);
  }

  async listNextActions(userId: number, limit = 20): Promise<NextActionRow[]> {
    try {
      const r = await this.api.getJson<{
        ok: boolean;
        rows: NextActionRow[];
      }>(`/internal/team/${userId}/next-actions?limit=${limit}`);
      return r.rows;
    } catch {
      return [];
    }
  }

  async markActionDone(userId: number, actionId: number): Promise<boolean> {
    try {
      const r = await this.api.postJson<{ ok: boolean }>(
        `/internal/team/${userId}/next-actions/${actionId}/done`,
      );
      return !!r.ok;
    } catch {
      return false;
    }
  }

  async saveNote(
    userId: number,
    contactUserId: number,
    note: string,
    nextContactAt: Date | null,
  ): Promise<NoteRow | null> {
    try {
      const r = await this.api.postJson<{ ok: boolean; note: NoteRow }>(
        `/internal/team/${userId}/notes/${contactUserId}`,
        {
          note,
          next_contact_at: nextContactAt ? nextContactAt.toISOString() : null,
        },
      );
      return r.note;
    } catch {
      return null;
    }
  }
}
