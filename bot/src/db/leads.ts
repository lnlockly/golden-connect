import type { ApiClient } from "../api/client.js";
import { ApiError } from "../api/client.js";

export type LeadTrack = "order" | "operator" | "learner" | "investor" | "partner" | "advertiser" | "general";
export type LeadStatus = "new" | "taken" | "won" | "lost" | "snoozed";

export interface LeadRow {
  id: number;
  track: LeadTrack;
  contact: string;
  payload_json: string;
  source: string | null;
  lang: string | null;
  status: LeadStatus;
  taken_by_tg_id: number | null;
  taken_at: number | null;
  resolved_at: number | null;
  lost_reason: string | null;
  snooze_until: number | null;
  chat_id: number | null;
  message_thread_id: number | null;
  posted_message_id: number | null;
  created_at: number;
}

export interface CreateLeadInput {
  track: LeadTrack;
  contact: string;
  payload: Record<string, unknown>;
  source: string | null;
  lang: string | null;
}

export class LeadsRepo {
  constructor(private readonly api: ApiClient) {}

  async create(input: CreateLeadInput): Promise<LeadRow> {
    const r = await this.api.postJson<{ ok: boolean; id: number }>(
      `/internal/leads`,
      {
        track: input.track,
        contact: input.contact,
        payload: input.payload,
        source: input.source,
        lang: input.lang,
      },
    );
    const full = await this.findById(r.id);
    if (!full) {
      throw new Error(`lead #${r.id} created but GET returned nothing`);
    }
    return full;
  }

  async findById(id: number): Promise<LeadRow | undefined> {
    try {
      const r = await this.api.getJson<{ ok: boolean; lead?: LeadRow | null; row?: LeadRow | null }>(
        `/internal/leads/${id}`,
      );
      // Accept either `lead` or `row` in the payload — future-proofing for
      // small contract tweaks on the api side.
      return r.lead ?? r.row ?? undefined;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async findByPostedMessage(
    chatId: number,
    messageId: number,
  ): Promise<LeadRow | undefined> {
    try {
      const r = await this.api.getJson<{ ok: boolean; lead?: LeadRow | null; row?: LeadRow | null }>(
        `/internal/leads/by-posted?chat_id=${chatId}&message_id=${messageId}`,
      );
      return r.lead ?? r.row ?? undefined;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return undefined;
      throw err;
    }
  }

  async latestInThread(
    chatId: number,
    threadId: number,
  ): Promise<LeadRow | undefined> {
    const r = await this.api.getJson<{ ok: boolean; lead: LeadRow | null }>(
      `/internal/leads/latest-in-thread?chat_id=${chatId}&thread_id=${threadId}`,
    );
    return r.lead ?? undefined;
  }

  async recentlySubmitted(contact: string, sinceMs: number): Promise<boolean> {
    const since = Date.now() - sinceMs;
    const r = await this.api.getJson<{ ok: boolean; found?: boolean; count?: number; rows?: unknown[] }>(
      `/internal/leads/recent-by-contact?contact=${encodeURIComponent(
        contact,
      )}&since_ms=${since}`,
    );
    if (typeof r.found === "boolean") return r.found;
    if (typeof r.count === "number") return r.count > 0;
    if (Array.isArray(r.rows)) return r.rows.length > 0;
    return false;
  }

  async setPosted(
    id: number,
    chatId: number,
    threadId: number | null,
    messageId: number,
  ): Promise<void> {
    await this.api.postJson(`/internal/leads/${id}/posted`, {
      chat_id: chatId,
      message_thread_id: threadId,
      posted_message_id: messageId,
    });
  }

  async markTaken(id: number, adminTgId: number): Promise<void> {
    await this.api.postJson(`/internal/leads/${id}/take`, {
      taken_by_tg_id: adminTgId,
    });
  }

  async markWon(id: number): Promise<void> {
    await this.api.postJson(`/internal/leads/${id}/resolve`, {
      status: "won",
    });
  }

  async markLost(id: number, reason: string): Promise<void> {
    await this.api.postJson(`/internal/leads/${id}/resolve`, {
      status: "lost",
      lost_reason: reason.slice(0, 500),
    });
  }

  async snooze(id: number, untilMs: number): Promise<void> {
    await this.api.postJson(`/internal/leads/${id}/snooze`, {
      until_ms: untilMs,
    });
  }

  async list(opts: {
    status?: LeadStatus | "all";
    offset: number;
    limit: number;
  }): Promise<LeadRow[]> {
    const { status, offset, limit } = opts;
    const path =
      !status || status === "all"
        ? `/internal/leads/by-status/all?limit=${limit}&offset=${offset}`
        : `/internal/leads/by-status/${status}?limit=${limit}&offset=${offset}`;
    const r = await this.api.getJson<{ ok: boolean; rows: LeadRow[]; total?: number }>(
      path,
    );
    return r.rows;
  }

  async count(status?: LeadStatus | "all"): Promise<number> {
    // The by-status endpoint returns {rows,total}; we piggy-back on it to
    // avoid adding a dedicated count endpoint to the api contract.
    const path =
      !status || status === "all"
        ? `/internal/leads/by-status/all?limit=1&offset=0`
        : `/internal/leads/by-status/${status}?limit=1&offset=0`;
    const r = await this.api.getJson<{ ok: boolean; rows: LeadRow[]; total?: number }>(
      path,
    );
    if (typeof r.total === "number") return r.total;
    return Array.isArray(r.rows) ? r.rows.length : 0;
  }
}
