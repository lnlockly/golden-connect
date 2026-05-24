// Auto-ads package: posts/week × weeks per lot, across 9 messengers, 46 langs.

import {
  ADS_AUTOTRANSLATE_LANGUAGES,
  ADS_MAX_POST_CHARS,
  ADS_MAX_POST_IMAGES,
  ADS_MESSENGER_CHANNELS,
  LOT_SPECS,
  LotUsd,
} from './rules.js';

export interface AdsAllowance {
  lotUsd: LotUsd;
  postsPerWeek: number;
  weeks: number;
  totalPosts: number;
  maxCharsPerPost: number;
  maxImagesPerPost: number;
  channels: readonly string[];
  languages: number;
}

export function adsAllowanceFor(lotUsd: LotUsd): AdsAllowance {
  const spec = LOT_SPECS[lotUsd];
  return {
    lotUsd,
    postsPerWeek: spec.adsPostsPerWeek,
    weeks: spec.adsWeeks,
    totalPosts: spec.adsPostsPerWeek * spec.adsWeeks || (spec.adsPostsPerWeek > 0 ? spec.adsPostsPerWeek : 0),
    maxCharsPerPost: ADS_MAX_POST_CHARS,
    maxImagesPerPost: ADS_MAX_POST_IMAGES,
    channels: ADS_MESSENGER_CHANNELS,
    languages: ADS_AUTOTRANSLATE_LANGUAGES,
  };
}

// Validate a user-submitted post against per-lot limits.
export interface PostDraft {
  textChars: number;
  imageCount: number;
}
export interface PostValidation {
  ok: boolean;
  reasons: string[];
}
export function validatePost(draft: PostDraft): PostValidation {
  const reasons: string[] = [];
  if (draft.textChars > ADS_MAX_POST_CHARS) {
    reasons.push(`text too long: ${draft.textChars} > ${ADS_MAX_POST_CHARS}`);
  }
  if (draft.imageCount > ADS_MAX_POST_IMAGES) {
    reasons.push(`too many images: ${draft.imageCount} > ${ADS_MAX_POST_IMAGES}`);
  }
  return { ok: reasons.length === 0, reasons };
}

// Remaining posts in current ads campaign for a given lot.
export interface CampaignUsage {
  lotUsd: LotUsd;
  postsUsed: number;
  campaignStartedAt: number; // unix ms
}
export function postsRemaining(usage: CampaignUsage, now: number): number {
  const allow = adsAllowanceFor(usage.lotUsd);
  const weeksMs = allow.weeks * 7 * 24 * 60 * 60 * 1000;
  if (allow.weeks > 0 && now - usage.campaignStartedAt > weeksMs) return 0;
  return Math.max(0, allow.totalPosts - usage.postsUsed);
}
