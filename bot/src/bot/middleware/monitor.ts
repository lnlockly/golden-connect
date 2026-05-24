import type { MiddlewareFn } from "grammy";
import type { AppContext } from "../middleware.js";
import type { ApiClient } from "../../api/client.js";

/**
 * Forwards interesting updates from monitored group chats to
 * `POST /internal/monitor/event` on the api. Only activates for
 * `group` / `supergroup` chats — private DMs are never logged here.
 *
 * The allow-list of `chat_id`s is cached for 5 minutes so every
 * message in a busy chat doesn't round-trip an extra API call. The
 * cache is a plain Map scoped to the middleware instance — safe for
 * a single-pod bot; multiple pods converge inside 5 minutes anyway.
 *
 * Forwarding is fire-and-forget: we never await the POST, and any
 * error is swallowed — monitoring must not add latency to user
 * interactions or break message handling.
 */

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  at: number;
  ids: Set<number>;
}
let cache: CacheEntry | null = null;

async function loadMonitoredIds(api: ApiClient): Promise<Set<number>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.ids;
  try {
    const r = await api.getJson<{ ok: boolean; chats: Array<{ chat_id: number; active: boolean }> }>(
      `/admin/monitor/chats`,
    );
    // The admin endpoint is guarded by a user JWT in production; the
    // internal client uses the shared secret so the api will 401 until we
    // add a matching `/internal/monitor/chats` list. Until then, fall back
    // to an empty allow-list and let the api filter on its side.
    const ids = new Set<number>();
    for (const c of r.chats ?? []) {
      if (c.active) ids.add(Number(c.chat_id));
    }
    cache = { at: now, ids };
    return ids;
  } catch {
    // Fail open to "api will filter" — /internal/monitor/event already
    // refuses events for non-monitored chats, so a stale cache can't leak
    // anything; worst case we post a few events the api drops.
    cache = { at: now, ids: new Set<number>([-1]) };
    return cache.ids;
  }
}

export function monitorMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    try {
      const chatType = ctx.chat?.type;
      if (chatType === 'group' || chatType === 'supergroup') {
        const chatId = ctx.chat?.id;
        if (chatId !== undefined) {
          const ids = await loadMonitoredIds(ctx.state.apiClient);
          // Treat `-1` as "cache unavailable — post everything, let api filter".
          const shouldPost = ids.has(chatId) || ids.has(-1);
          if (shouldPost) {
            const eventType = classifyEvent(ctx);
            if (eventType) {
              const payload = {
                chat_id: chatId,
                event_type: eventType,
                user_id_tg: ctx.from?.id ?? null,
                username: ctx.from?.username ?? null,
                payload: {
                  chat_title: (ctx.chat as any)?.title ?? null,
                  text: ctx.message?.text?.slice(0, 500) ?? null,
                },
              };
              // Fire-and-forget.
              void ctx.state.apiClient
                .postJson(`/internal/monitor/event`, payload)
                .catch(() => { /* swallow */ });
            }
          }
        }
      }
    } catch {
      // Monitoring must never disrupt the normal handler chain.
    }
    await next();
  };
}

function classifyEvent(ctx: AppContext): string | null {
  if (ctx.message?.new_chat_members?.length) return 'join';
  if (ctx.message?.left_chat_member) return 'leave';
  if (ctx.update.chat_member?.new_chat_member.status === 'kicked') return 'ban';
  if (ctx.message?.text) return 'message';
  return null;
}
