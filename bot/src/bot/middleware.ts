import type { Context, MiddlewareFn } from "grammy";
import type { StreamFlavor } from "@grammyjs/stream";
import type { UsersRepo } from "../db/users.js";
import type { ReferralsRepo } from "../db/referrals.js";
import type { TeamRepo } from "../db/team.js";
import type { EventsRepo } from "../db/events.js";
import type { UserRow } from "../types.js";
import type { Logger } from "pino";
import type { CustomEmojiMap } from "../services/customEmoji.js";
import type { ApiClient } from "../api/client.js";

// Custom context flavor carrying our domain user + repos.
export interface AppState {
  repoUsers: UsersRepo;
  repoReferrals: ReferralsRepo;
  repoTeam: TeamRepo;
  repoEvents: EventsRepo;
  apiClient: ApiClient;
  logger: Logger;
  adminTgId: number;                  // primary admin / founder
  adminTgIds: ReadonlySet<number>;    // full admin set (includes adminTgId)
  botUsername: string;
  websiteUrl: string;
  webappUrl: string;                  // WebApp cabinet URL (menu button + keyboard)
  founderUsername: string;
  customEmoji: CustomEmojiMap;
}

export function isAdmin(state: AppState, tgId: number | undefined): boolean {
  if (tgId === undefined) return false;
  return state.adminTgIds.has(tgId);
}

interface BaseContext extends Context {
  state: AppState;
  user?: UserRow;
}

export type AppContext = StreamFlavor<BaseContext>;

export function stateMiddleware(state: AppState): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    ctx.state = state;
    await next();
  };
}

// Upsert "touch" for already-registered users; start.ts handles first-time creation.
export function touchMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    const from = ctx.from;
    if (from) {
      const existing = await ctx.state.repoUsers.findByTgId(from.id);
      if (existing) {
        await ctx.state.repoUsers.touch(from.id, {
          username: from.username ?? null,
          first_name: from.first_name ?? null,
          last_name: from.last_name ?? null,
          language_code: from.language_code ?? null,
        });
        ctx.user = await ctx.state.repoUsers.findByTgId(from.id);
      }
    }
    await next();
  };
}

export function logMiddleware(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    const start = Date.now();
    const type = ctx.update.message
      ? "message"
      : ctx.update.callback_query
        ? "callback"
        : "other";
    try {
      await next();
    } finally {
      ctx.state.logger.debug(
        {
          tg_id: ctx.from?.id,
          type,
          text: ctx.message?.text,
          data: ctx.callbackQuery?.data,
          ms: Date.now() - start,
        },
        "update handled",
      );
    }
  };
}

export function requireAdmin(): MiddlewareFn<AppContext> {
  return async (ctx, next) => {
    if (!isAdmin(ctx.state, ctx.from?.id)) {
      await ctx.reply("Только для админа.");
      return;
    }
    await next();
  };
}
