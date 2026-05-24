import type { ApiClient } from "../api/client.js";
import type {
  UserRow,
  TopReferrerRow,
  DescendantStatsRow,
  DashboardStats,
} from "../types.js";

export interface UpsertUserInput {
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  invited_by_ref_code: string | null;
}

export interface AncestorRow {
  user_id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  language_code: string | null;
  is_blocked: number;
  ref_notifications_enabled: number;
  depth: number;
}

export class UsersRepo {
  constructor(private readonly api: ApiClient) {}

  async findByTgId(tgId: number): Promise<UserRow | undefined> {
    const r = await this.api.getJson<{ ok: boolean; user: UserRow | null }>(
      `/internal/users/by-tg/${tgId}`,
    );
    return r.user ?? undefined;
  }

  async findById(id: number): Promise<UserRow | undefined> {
    const r = await this.api.getJson<{ ok: boolean; user: UserRow | null }>(
      `/internal/users/by-id/${id}`,
    );
    return r.user ?? undefined;
  }

  async findByUsername(username: string): Promise<UserRow | undefined> {
    const clean = username.startsWith("@") ? username.slice(1) : username;
    const r = await this.api.getJson<{ ok: boolean; user: UserRow | null }>(
      `/internal/users/by-username/${encodeURIComponent(clean)}`,
    );
    return r.user ?? undefined;
  }

  async markAppliedByUsername(username: string): Promise<boolean> {
    const clean = username.startsWith("@") ? username.slice(1) : username;
    const r = await this.api.postJson<{ ok: boolean; changed: boolean }>(
      `/internal/users/applied-by-username`,
      { username: clean },
    );
    return !!r.changed;
  }

  /** Idempotent stamp — set presented_at if still NULL. Triggered when the
   *  user confirms they've seen the onboarding presentation (via web_app
   *  sendData or `pres:skip`). */
  async markPresented(tgId: number): Promise<boolean> {
    const r = await this.api.postJson<{ ok: boolean; changed: boolean }>(
      `/internal/users/by-tg/${tgId}/presented`,
    );
    return !!r.changed;
  }

  async findByRefCode(code: string): Promise<UserRow | undefined> {
    const r = await this.api.getJson<{ ok: boolean; user: UserRow | null }>(
      `/internal/users/by-ref/${encodeURIComponent(code)}`,
    );
    return r.user ?? undefined;
  }

  async createUser(input: UpsertUserInput): Promise<UserRow> {
    const r = await this.api.postJson<{ ok: boolean; user: UserRow }>(
      `/internal/users`,
      input,
    );
    return r.user;
  }

  async touch(
    tgId: number,
    patch: Partial<
      Pick<UserRow, "username" | "first_name" | "last_name" | "language_code">
    >,
  ): Promise<void> {
    await this.api.patchJson(`/internal/users/by-tg/${tgId}/touch`, {
      username: patch.username ?? null,
      first_name: patch.first_name ?? null,
      last_name: patch.last_name ?? null,
      language_code: patch.language_code ?? null,
    });
  }

  async setLanguage(tgId: number, lang: string): Promise<void> {
    await this.api.postJson(`/internal/users/by-tg/${tgId}/language`, { lang });
  }

  async setBlocked(tgId: number, blocked: boolean): Promise<void> {
    await this.api.postJson(`/internal/users/by-tg/${tgId}/blocked`, {
      blocked,
    });
  }

  async directCount(userId: number): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/${userId}/direct-count`,
    );
    return r.count;
  }

  async descendantStats(userId: number): Promise<DescendantStatsRow> {
    const r = await this.api.getJson<{
      ok: boolean;
      total_descendants: number;
      max_depth: number | null;
    }>(`/internal/users/${userId}/descendants-stats`);
    return {
      total_descendants: r.total_descendants,
      max_depth: r.max_depth,
    };
  }

  async listAncestors(userId: number): Promise<AncestorRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: AncestorRow[] }>(
      `/internal/users/${userId}/ancestors`,
    );
    return r.rows;
  }

  async setRefNotifications(tgId: number, enabled: boolean): Promise<void> {
    await this.api.postJson(`/internal/users/by-tg/${tgId}/notifications`, {
      enabled,
    });
  }

  async children(
    userId: number,
    limit: number,
    offset: number,
  ): Promise<UserRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: UserRow[] }>(
      `/internal/users/${userId}/children?limit=${limit}&offset=${offset}`,
    );
    return r.rows;
  }

  async childrenCount(userId: number): Promise<number> {
    // direct-count returns the number of users whose invited_by_user_id = userId,
    // which is exactly the children count we need.
    return this.directCount(userId);
  }

  async subtreeJoinedSince(userId: number, since: number): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/${userId}/subtree-joined-since?since_ms=${since}`,
    );
    return r.count;
  }

  async subtreeLevelBreakdown(
    userId: number,
    maxLevels: number,
  ): Promise<Array<{ level: number; count: number }>> {
    const r = await this.api.getJson<{
      ok: boolean;
      rows: Array<{ level: number; count: number }>;
    }>(`/internal/users/${userId}/subtree-breakdown?max=${maxLevels}`);
    return r.rows;
  }

  async resolvePending(newUserRefCode: string): Promise<number> {
    const r = await this.api.postJson<{ ok: boolean; resolved: number }>(
      `/internal/users/resolve-pending`,
      { ref_code: newUserRefCode },
    );
    return r.resolved;
  }

  async recordPendingReferral(tgId: number, refCode: string): Promise<void> {
    await this.api.postJson(`/internal/users/pending`, {
      tg_id: tgId,
      ref_code: refCode,
    });
  }

  async totalUsers(): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/total`,
    );
    return r.count;
  }

  async joinedSince(ms: number): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/joined-since?ms=${ms}`,
    );
    return r.count;
  }

  async blockedCount(): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/blocked-count`,
    );
    return r.count;
  }

  async pendingReferralsCount(): Promise<number> {
    const r = await this.api.getJson<{ ok: boolean; count: number }>(
      `/internal/users/pending-count`,
    );
    return r.count;
  }

  async topByDirect(limit: number): Promise<TopReferrerRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: TopReferrerRow[] }>(
      `/internal/users/top-direct?limit=${limit}`,
    );
    return r.rows;
  }

  async topByTotalDescendants(
    limit: number,
  ): Promise<Array<TopReferrerRow & { total_descendants: number }>> {
    const r = await this.api.getJson<{
      ok: boolean;
      rows: Array<TopReferrerRow & { total_descendants: number }>;
    }>(`/internal/users/top-total?limit=${limit}`);
    return r.rows;
  }

  async listPaginated(limit: number, offset: number): Promise<UserRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: UserRow[] }>(
      `/internal/users/list?limit=${limit}&offset=${offset}`,
    );
    return r.rows;
  }

  async allForBroadcast(): Promise<Array<{ tg_id: number; id: number }>> {
    const r = await this.api.getJson<{
      ok: boolean;
      rows: Array<{ id: number; tg_id: number }>;
    }>(`/internal/users/broadcast-list`);
    return r.rows;
  }

  async allForExport(): Promise<UserRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: UserRow[] }>(
      `/internal/users/export`,
    );
    return r.rows;
  }

  async dashboard(): Promise<DashboardStats> {
    const r = await this.api.getJson<{ ok: boolean; stats: DashboardStats }>(
      `/internal/users/dashboard`,
    );
    return r.stats;
  }
}

export class BroadcastsRepo {
  constructor(private readonly api: ApiClient) {}

  async create(adminTgId: number, text: string): Promise<number> {
    const r = await this.api.postJson<{ ok: boolean; id: number }>(
      `/internal/broadcasts`,
      { admin_tg_id: adminTgId, text },
    );
    return r.id;
  }

  async updateProgress(
    id: number,
    sent: number,
    failed: number,
  ): Promise<void> {
    await this.api.patchJson(`/internal/broadcasts/${id}`, {
      sent_count: sent,
      failed_count: failed,
    });
  }
}
