/**
 * Events repo — bot-side HTTP facade over the api's /internal/events/*
 * endpoints. Keeps the bot stateless.
 */
import type { ApiClient } from "../api/client.js";

export interface EventSummary {
  id: number;
  title: string;
  topic: string | null;
  description: string | null;
  speakers: string[];
  tags: string[];
  starts_at: string;
  duration_min: number;
  join_url: string | null;
  recording_url: string | null;
  status: string;
  created_by_user_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface UpcomingBundle {
  registered: EventSummary[];
  upcoming: EventSummary[];
}

export interface EventPatchInput {
  title?: string;
  topic?: string | null;
  description?: string | null;
  speakers?: string[];
  tags?: string[];
  starts_at?: string;
  duration_min?: number;
  join_url?: string | null;
  recording_url?: string | null;
  status?: 'draft' | 'published' | 'live' | 'finished' | 'cancelled';
}

export class EventsRepo {
  constructor(private readonly api: ApiClient) {}

  async listUpcoming(limit = 10): Promise<EventSummary[]> {
    const r = await this.api.getJson<{ ok: boolean; events: EventSummary[] }>(
      `/internal/events/upcoming?limit=${limit}`,
    );
    return r.events ?? [];
  }

  async get(id: number): Promise<EventSummary | null> {
    try {
      const r = await this.api.getJson<{ ok: boolean; event: EventSummary }>(
        `/internal/events/${id}`,
      );
      return r.event ?? null;
    } catch {
      return null;
    }
  }

  async register(
    id: number,
    userId: number,
    source: 'tg' | 'web' | 'deep-link' = 'tg',
  ): Promise<EventSummary | null> {
    try {
      const r = await this.api.postJson<{ ok: boolean; event: EventSummary }>(
        `/internal/events/${id}/register`,
        { user_id: userId, source },
      );
      return r.event ?? null;
    } catch {
      return null;
    }
  }

  async unregister(id: number, userId: number): Promise<void> {
    await this.api.postJson(`/internal/events/${id}/unregister`, {
      user_id: userId,
    });
  }

  async myUpcoming(userId: number): Promise<UpcomingBundle> {
    const r = await this.api.getJson<{
      ok: boolean;
      registered: EventSummary[];
      upcoming: EventSummary[];
    }>(`/internal/me/${userId}/events/upcoming`);
    return {
      registered: r.registered ?? [],
      upcoming: r.upcoming ?? [],
    };
  }

  /**
   * Admin create — goes through the NON-internal admin route with a
   * Bearer JWT obtained by the bot on the admin's behalf. For simplicity
   * we still go via /internal — we piggyback on the shared secret path.
   * Phase 2 may switch to a proper admin session flow.
   */
  async adminCreate(input: {
    title: string;
    topic?: string | null;
    description?: string | null;
    speakers?: string[];
    tags?: string[];
    starts_at: string;
    duration_min?: number;
    join_url?: string | null;
    status?: 'draft' | 'published';
    created_by_user_id?: number;
  }): Promise<EventSummary | null> {
    try {
      // Use the internal register-style pattern — we reuse admin
      // session-gated /admin/events when the bot can forward a cookie,
      // but for the Phase 1B wizard we use the internal shortcut that
      // only the bot can invoke (shared x-trendex-secret).
      const r = await this.api.postJson<{ ok: boolean; event: EventSummary }>(
        `/internal/events/admin-create`,
        input,
      );
      return r.event ?? null;
    } catch {
      return null;
    }
  }
}
