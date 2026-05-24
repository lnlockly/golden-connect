import type { ApiClient } from "../api/client.js";
import { ApiError } from "../api/client.js";
import type { Lang } from "../types.js";

export interface ReminderStepRow {
  id: number;
  order_idx: number;
  delay_hours: number;
  text_ru: string;
  text_en: string | null;
  text_zh: string | null;
  enabled: number;
  updated_at: number;
}

export interface ReminderDue {
  user_id: number;
  tg_id: number;
  language_code: string | null;
  step: ReminderStepRow;
}

export class RemindersRepo {
  constructor(private readonly api: ApiClient) {}

  async listAll(): Promise<ReminderStepRow[]> {
    const r = await this.api.getJson<{ ok: boolean; rows: ReminderStepRow[] }>(
      `/internal/reminders/steps`,
    );
    return r.rows;
  }

  async findById(id: number): Promise<ReminderStepRow | undefined> {
    // No dedicated /steps/:id endpoint; filter from listAll.
    const all = await this.listAll();
    return all.find((s) => s.id === id);
  }

  async create(input: {
    order_idx: number;
    delay_hours: number;
    text_ru: string;
    text_en?: string | null;
    text_zh?: string | null;
    enabled?: boolean;
  }): Promise<ReminderStepRow> {
    const r = await this.api.postJson<{
      ok: boolean;
      step?: ReminderStepRow;
      row?: ReminderStepRow;
      id?: number;
    }>(`/internal/reminders/steps`, {
      order_idx: input.order_idx,
      delay_hours: input.delay_hours,
      text_ru: input.text_ru,
      text_en: input.text_en ?? null,
      text_zh: input.text_zh ?? null,
      enabled: input.enabled === false ? 0 : 1,
    });
    if (r.step) return r.step;
    if (r.row) return r.row;
    if (typeof r.id === "number") {
      const fresh = await this.findById(r.id);
      if (fresh) return fresh;
    }
    throw new Error("reminders.create: api did not return the new row");
  }

  async setText(id: number, lang: Lang, text: string): Promise<void> {
    const col = lang === "ru" ? "text_ru" : lang === "en" ? "text_en" : "text_zh";
    await this.api.patchJson(`/internal/reminders/steps/${id}`, {
      [col]: text,
    });
  }

  async setDelay(id: number, delay_hours: number): Promise<void> {
    await this.api.patchJson(`/internal/reminders/steps/${id}`, {
      delay_hours,
    });
  }

  async toggle(id: number): Promise<void> {
    // No dedicated /toggle endpoint — read current enabled flag then PATCH the
    // inverse. Two round-trips is fine here (admin UI, low QPS).
    const step = await this.findById(id);
    if (!step) {
      throw new ApiError(`reminder step ${id} not found`, 404, null);
    }
    await this.api.patchJson(`/internal/reminders/steps/${id}`, {
      enabled: step.enabled ? 0 : 1,
    });
  }

  async remove(id: number): Promise<void> {
    await this.api.deleteJson(`/internal/reminders/steps/${id}`);
  }

  async nextOrderIdx(): Promise<number> {
    // Client-side computation — no dedicated endpoint. listAll is already
    // the data the admin UI just showed, so this is effectively free in
    // practice (we call it right after rendering the list).
    const all = await this.listAll();
    let max = 0;
    for (const s of all) if (s.order_idx > max) max = s.order_idx;
    return max + 1;
  }

  async recordSent(userId: number, stepId: number): Promise<void> {
    await this.api.postJson(`/internal/reminders/sends`, {
      user_id: userId,
      step_id: stepId,
    });
  }

  /**
   * Fetch the next batch of (user, step) pairs that are due right now. The
   * server handles every filter (enabled, applied, blocked, delay, dedup).
   * The `limit` hint is advisory — the server may cap lower.
   */
  async listDue(limit = 50): Promise<ReminderDue[]> {
    const r = await this.api.getJson<{
      ok: boolean;
      candidates: ReminderDue[];
    }>(`/internal/reminders/pending?limit=${limit}`);
    return r.candidates ?? [];
  }
}

// Helper: pick the right localized text for a step + user lang, falling back
// to ru when a translation is missing.
export function textForLang(step: ReminderStepRow | null | undefined, lang: Lang): string {
  if (!step) return "";  // defensive: caller may pass undefined if reminder row was deleted between listDue and tick
  if (lang === "en" && step.text_en) return step.text_en;
  if (lang === "zh" && step.text_zh) return step.text_zh;
  return step.text_ru || "";
}
