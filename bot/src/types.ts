export type Lang = "en" | "ru" | "zh" | "uz" | "fil" | "th";

export interface UserRow {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  ref_code: string;
  invited_by_user_id: number | null;
  invited_by_ref_code: string | null;
  joined_at: number;
  last_seen_at: number;
  is_blocked: number;
  applied_on_site: number;
  applied_at: number | null;
  ref_notifications_enabled: number;
  presented_at: number | null;
}

export interface BroadcastRow {
  id: number;
  admin_tg_id: number;
  text: string;
  sent_count: number;
  failed_count: number;
  created_at: number;
}

export interface PendingReferralRow {
  tg_id: number;
  ref_code: string;
  created_at: number;
}

export interface TopReferrerRow {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  ref_code: string;
  direct_count: number;
}

export interface DescendantStatsRow {
  total_descendants: number;
  max_depth: number | null;
}

export interface DashboardStats {
  total_users: number;
  joined_24h: number;
  joined_7d: number;
  avg_daily_7d: number;
  growth_rate_daily: number;
  projected_tomorrow: number;
  blocked: number;
  pending_referrals: number;
  broadcasts_total: number;
  broadcasts_sent: number;
  broadcasts_failed: number;
  top_direct: TopReferrerRow[];
  top_total: Array<TopReferrerRow & { total_descendants: number }>;
}
