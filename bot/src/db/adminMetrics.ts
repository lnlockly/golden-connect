/**
 * Single round-trip wrapper for the /admin dashboard summary metrics.
 * Backed by /internal/admin/metrics-summary on the api side.
 */
import type { ApiClient } from "../api/client.js";

export interface AdminMetrics {
  users_total: number;
  users_joined_24h: number;
  payments_week_usd: number;
  events_active: number;
  pending_referrals: number;
}

export class AdminMetricsRepo {
  constructor(private readonly api: ApiClient) {}

  async fetch(): Promise<AdminMetrics> {
    try {
      const r = await this.api.getJson<{ ok: boolean; metrics: AdminMetrics }>(
        `/internal/admin/metrics-summary`,
      );
      return (
        r.metrics ?? {
          users_total: 0,
          users_joined_24h: 0,
          payments_week_usd: 0,
          events_active: 0,
          pending_referrals: 0,
        }
      );
    } catch {
      // Don't break the dashboard if api is unreachable — show zeros.
      return {
        users_total: 0,
        users_joined_24h: 0,
        payments_week_usd: 0,
        events_active: 0,
        pending_referrals: 0,
      };
    }
  }
}
