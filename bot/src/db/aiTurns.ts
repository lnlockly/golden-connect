import type { ApiClient } from "../api/client.js";

export type AiRole = "user" | "assistant";

export interface AiTurnRow {
  id: number;
  tg_id: number;
  role: AiRole;
  content: string;
  created_at: number;
}

export class AiTurnsRepo {
  constructor(private readonly api: ApiClient) {}

  async append(tgId: number, role: AiRole, content: string): Promise<void> {
    await this.api.postJson(`/internal/aiturns`, {
      tg_id: tgId,
      role,
      content,
    });
  }

  async recent(tgId: number, limit: number): Promise<AiTurnRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: AiTurnRow[] }>(
      `/internal/aiturns/recent?tg_id=${tgId}&limit=${limit}`,
    );
    // API returns in chronological order (oldest→newest) per contract, so
    // just pass through. If the service returns newest-first it should
    // document that — callers expect asc order.
    return r.rows;
  }

  async reset(tgId: number): Promise<void> {
    await this.api.deleteJson(`/internal/aiturns?tg_id=${tgId}`);
  }
}
