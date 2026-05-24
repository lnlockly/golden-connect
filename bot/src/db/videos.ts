import type { ApiClient } from "../api/client.js";

export interface VideoRow {
  id: number;
  title: string;
  url: string;
  thumbnail_url: string | null;
  duration_sec: number | null;
  tags: string[];
  is_published: boolean;
  order: number;
  created_at: string;
}

export interface VideoCommentRow {
  id: number;
  video_id: number;
  user_id: number;
  text: string;
  created_at: string;
}

export interface VideoReactionAgg {
  emoji: string;
  count: number;
}

export interface VideoDetail {
  video: VideoRow;
  comments: VideoCommentRow[];
  reactions: VideoReactionAgg[];
}

/**
 * HTTP client for the video library. Read paths use the public endpoints
 * (`/videos`, `/videos/:id`); mutations would normally use the JWT-protected
 * `/me/videos/*` surface — from the bot we delegate those to the landing
 * cabinet because the bot doesn't hold user JWTs.
 */
export class VideosRepo {
  constructor(private readonly api: ApiClient) {}

  async list(): Promise<VideoRow[]> {
    const r = await this.api.getJson<{ ok: boolean; videos: VideoRow[] }>(`/videos`);
    return r.videos ?? [];
  }

  async get(id: number): Promise<VideoDetail | null> {
    try {
      const r = await this.api.getJson<{
        ok: boolean;
        video: VideoRow;
        comments: VideoCommentRow[];
        reactions: VideoReactionAgg[];
      }>(`/videos/${id}`);
      if (!r.video) return null;
      return { video: r.video, comments: r.comments ?? [], reactions: r.reactions ?? [] };
    } catch {
      return null;
    }
  }

  // ---- admin CRUD via /internal/admin/videos (shared secret) ----

  async adminListAll(): Promise<VideoRow[]> {
    const r = await this.api.getJson<{ ok: boolean; videos: VideoRow[] }>(
      `/internal/admin/videos`,
    );
    return r.videos ?? [];
  }

  async adminCreate(input: {
    title: string;
    url: string;
    thumbnail_url?: string | null;
    duration_sec?: number | null;
    tags?: string[] | null;
    is_published?: boolean;
    order?: number;
  }): Promise<VideoRow | { error: string }> {
    try {
      const r = await this.api.postJson<{ ok: boolean; video: VideoRow }>(
        `/internal/admin/videos`,
        input,
      );
      return r.video;
    } catch (e: any) {
      return { error: String(e?.message ?? e) };
    }
  }

  async adminPatch(id: number, patch: Partial<{
    title: string;
    url: string;
    thumbnail_url: string | null;
    duration_sec: number | null;
    tags: string[] | null;
    is_published: boolean;
    order: number;
  }>): Promise<VideoRow | null> {
    try {
      const r = await this.api.patchJson<{ ok: boolean; video: VideoRow }>(
        `/internal/admin/videos/${id}`,
        patch,
      );
      return r.video ?? null;
    } catch {
      return null;
    }
  }

  async adminDelete(id: number): Promise<boolean> {
    try {
      await this.api.deleteJson(`/internal/admin/videos/${id}`);
      return true;
    } catch {
      return false;
    }
  }
}
