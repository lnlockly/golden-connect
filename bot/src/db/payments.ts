import type { ApiClient } from "../api/client.js";

/**
 * Shape returned by goldenConnect-api `/internal/payments`. Mirrors the row
 * schema one-for-one — the bot's payments admin view treats it as opaque.
 */
export interface PaymentRow {
  id: number;
  method: "cryptobot" | "platega" | "other";
  tariff_code: string | null;
  entry_usd: number;
  user_id: number;
  user_tg_id: number | null;
  user_username: string | null;
  user_first_name: string | null;
  matrix_position: number | null;
  paid_at_iso: string;
  payment_ref: string;
}

export interface PaymentsListResponse {
  ok: boolean;
  payments: PaymentRow[];
  total: number;
  total_usd: number;
}

export class PaymentsRepo {
  constructor(private readonly api: ApiClient) {}

  async list(limit = 20): Promise<PaymentsListResponse> {
    const safe = Math.max(1, Math.min(100, Math.floor(limit) || 20));
    return this.api.getJson<PaymentsListResponse>(
      `/internal/payments?limit=${safe}`,
    );
  }
}
