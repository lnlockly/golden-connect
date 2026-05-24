import type { ApiClient } from "../api/client.js";

export interface PromoTemplate {
  id: string;
  category: string;
  title: string;
  default_text: string;
  image_url: string | null;
  hashtags: string[];
  active: boolean;
  created_at: string;
}

export interface QrCodeRow {
  id: number;
  target_url: string;
  svg_data: string;
  label: string | null;
  created_at: string;
}

/**
 * HTTP client for the promo sub-system in goldenConnect-api. The bot never talks
 * to the DB directly — all reads/writes go through the `/internal` or
 * public endpoints depending on the auth story.
 *
 * `listTemplates` hits the public endpoint (no auth header needed) because
 * the bot acts as an anonymous client here — it's showing the same curated
 * list that appears on the landing. The QR generator uses the internal
 * secret + passes the user id so the api can attribute the row to the
 * right user without exchanging JWTs.
 */
export class PromoRepo {
  constructor(private readonly api: ApiClient) {}

  async listTemplates(category?: string): Promise<PromoTemplate[]> {
    const q = category ? `?category=${encodeURIComponent(category)}` : '';
    const r = await this.api.getJson<{ ok: boolean; templates: PromoTemplate[] }>(
      `/promo/templates${q}`,
    );
    return r.templates ?? [];
  }

  async getTemplate(id: string): Promise<PromoTemplate | null> {
    try {
      const r = await this.api.getJson<{ ok: boolean; template: PromoTemplate }>(
        `/promo/templates/${encodeURIComponent(id)}`,
      );
      return r.template ?? null;
    } catch {
      return null;
    }
  }

  // ---- admin CRUD via /internal/admin/promo/* (shared secret) ----

  async adminListAll(): Promise<PromoTemplate[]> {
    const r = await this.api.getJson<{ ok: boolean; templates: PromoTemplate[] }>(
      `/internal/admin/promo/templates`,
    );
    return r.templates ?? [];
  }

  async adminCreate(input: {
    id: string;
    category: string;
    title: string;
    default_text: string;
    image_url?: string | null;
    hashtags?: string[] | null;
    active?: boolean;
  }): Promise<PromoTemplate | { error: string }> {
    try {
      const r = await this.api.postJson<{ ok: boolean; template: PromoTemplate }>(
        `/internal/admin/promo/templates`,
        input,
      );
      return r.template;
    } catch (e: any) {
      return { error: String(e?.message ?? e) };
    }
  }

  async adminPatch(id: string, patch: Partial<{
    category: string;
    title: string;
    default_text: string;
    image_url: string | null;
    hashtags: string[] | null;
    active: boolean;
  }>): Promise<PromoTemplate | null> {
    try {
      const r = await this.api.patchJson<{ ok: boolean; template: PromoTemplate }>(
        `/internal/admin/promo/templates/${encodeURIComponent(id)}`,
        patch,
      );
      return r.template ?? null;
    } catch {
      return null;
    }
  }

  async adminDelete(id: string): Promise<boolean> {
    try {
      await this.api.deleteJson(
        `/internal/admin/promo/templates/${encodeURIComponent(id)}`,
      );
      return true;
    } catch {
      return false;
    }
  }
}
