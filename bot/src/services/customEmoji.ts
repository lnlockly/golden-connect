import type { Api } from "grammy";
import type { Logger } from "pino";

// Map from fallback Unicode emoji (the one the pack author picked when
// uploading each .tgs) → custom_emoji_id returned by getStickerSet.
// Empty map == graceful no-op: welcome/admin render with plain Unicode.
export type CustomEmojiMap = ReadonlyMap<string, string>;

export const EMPTY_EMOJI_MAP: CustomEmojiMap = new Map();

export async function loadCustomEmojiMap(
  api: Api,
  packName: string,
  logger: Logger,
): Promise<CustomEmojiMap> {
  if (!packName) return EMPTY_EMOJI_MAP;
  try {
    const set = await api.getStickerSet(packName);
    const map = new Map<string, string>();
    for (const s of set.stickers) {
      if (s.type === "custom_emoji" && s.custom_emoji_id && s.emoji) {
        // If multiple stickers share a fallback emoji, first one wins.
        if (!map.has(s.emoji)) map.set(s.emoji, s.custom_emoji_id);
      }
    }
    logger.info(
      { packName, count: map.size },
      "loaded custom emoji pack",
    );
    return map;
  } catch (e) {
    // Pack missing, bot doesn't own it, network hiccup — degrade silently.
    logger.warn(
      { packName, err: (e as Error).message },
      "custom emoji pack load failed; falling back to plain Unicode",
    );
    return EMPTY_EMOJI_MAP;
  }
}
