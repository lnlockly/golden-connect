import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { Logger } from "pino";
import type { AppContext } from "./middleware.js";
import { logMiddleware, stateMiddleware, touchMiddleware, requireAdmin } from "./middleware.js";
import { onStart, buildLangPickerKeyboard } from "./commands/start.js";
import { tr, pickLang } from "../services/i18n.js";
import type { Lang } from "../types.js";
// Side-effect import — registers Phase 3A menu / cmd_desc / help i18n keys.
import "./commands/menu-strings.js";
// Side-effect import — L5 CRM cmd_desc translations.
import "./commands/crm-strings.js";
import { onStats } from "./commands/stats.js";
import { onBalance, onBalanceRefresh } from "./commands/balance.js";
import { onPassword } from "./commands/password.js";
import { onHelp } from "./commands/help.js";
import { onLang } from "./commands/lang.js";
import { onApp } from "./commands/app.js";
import { onTariffs } from "./commands/tariffs.js";
import { onWebAppDataTourDone } from "./commands/presentation.js";
// [c1-cleanup-done] import { registerScheduler } from "./commands/scheduler.js";
// [c1-cleanup-done] import { registerMeet } from "./commands/meet.js";
import { onCallback } from "./callbacks.js";
import {
  onAdminMenu,
  onAdminPanelRefresh,
  onAdminPanelClose,
} from "./commands/admin/dashboard.js";
import {
  onPromoNew,
  onPromoCancel,
  onPromoMaybeText,
  onPromoCallback,
  onPromoList,
  onPromoDelCmd,
} from "./commands/admin/promo-admin.js";
import {
  onVideoNew,
  onVideoCancel,
  onVideoMaybeText,
  onVideoCallback as onVideoAdminCallback,
  onVideoList,
  onVideoDelCmd,
} from "./commands/admin/video-admin.js";
import {
  onMonitorAdd,
  onMonitorCancel,
  onMonitorMaybeText,
  onMonitorCallback,
  onMonitorList,
  onMonitorDelCmd,
} from "./commands/admin/monitor-admin.js";
// admin-strings registers ru/en for the admin panel namespace.
import "./commands/admin/admin-strings.js";
import { onAdminUsers, onAdminUsersCallback } from "./commands/admin/users.js";
import { onAdminTree } from "./commands/admin/tree.js";
import { onAdminBlock, onAdminUnblock } from "./commands/admin/block.js";
import { onAdminExport } from "./commands/admin/export.js";
import { onAdminPayments } from "./commands/admin/payments.js";
import { registerBroadcast } from "./commands/admin/broadcast.js";
import { onWhere, registerLeadCommands } from "./commands/admin/leads.js";
import {
  onSetupTopics,
  onEmojiStatus,
  registerEmojiReload,
} from "./commands/admin/setup.js";
import type { UsersRepo, BroadcastsRepo } from "../db/users.js";
import type { EventsRepo } from "../db/events.js";
import type { LeadsRepo } from "../db/leads.js";
import type { RemindersRepo } from "../db/reminders.js";
import type { AiTurnsRepo } from "../db/aiTurns.js";
import type { ReferralsRepo } from "../db/referrals.js";
import type { TeamRepo } from "../db/team.js";
import { onRefCommand, onRefCallback } from "./commands/ref.js";
import { onTeamCommand, onTeamCallback } from "./commands/team.js";
import "./commands/ref-strings.js";
import { onEvents, onEventsCallback } from "./commands/events.js";
import {
  onAdminEventsCallback,
  onAdminEventsMaybeText,
  onEventCancel,
  onEventList,
  // onEventNew,  // [c1-cleanup-done] unused
} from "./commands/admin/events-admin.js";
import type { ClaudeAuth } from "../services/claudeAuth.js";
import type { ApiClient } from "../api/client.js";
import { registerReminderCommands } from "./commands/admin/reminders.js";
import { registerAiChat } from "./commands/aiChat.js";
import { Broadcaster } from "../services/broadcaster.js";
import { makeOnQuests } from "./commands/quests.js";
import { makeOnMissions } from "./commands/missions.js";
import { makeOnQuiz } from "./commands/quiz.js";
import { makeOnLeaderboard } from "./commands/leaderboard.js";
import { GamificationRepo } from "../db/gamification.js";
import { MissionsRepo } from "../db/missions.js";
import { QuizzesRepo } from "../db/quizzes.js";
// Side-effect import: registers the Phase 1C gamification i18n namespaces.
import "../services/i18n-gamification.js";
import { PromoRepo } from "../db/promo.js";
import { VideosRepo } from "../db/videos.js";
import { registerPromo } from "./commands/promo.js";
import { registerVideo } from "./commands/video.js";
import { monitorMiddleware } from "./middleware/monitor.js";
// L5 — Golden Connect CRM integration (commands, inline mode, voice/photo,
// business-bot message ingestion).
import {
  onCrm,
  onFind,
  onToday,
  onPitch,
  onPipeline,
  onStatsCrm,
  onAddContact,
  onCrmCallback,
} from "./commands/crm.js";
import { requirePaidTariff } from "./middleware/requirePaidTariff.js";
import { onCrmInlineQuery } from "./inline.js";
import { onCrmVoice, onCrmPhoto } from "./crmMedia.js";
import { onSession, onSessionCallback, onSessionText } from "./commands/session.js";
import { onModerationCallback } from "../http/internal-alerts.js";

export interface BuildBotOpts {
  token: string;
  adminTgId: number;                  // primary / founder
  adminTgIds: ReadonlySet<number>;    // full admin set (includes adminTgId)
  botUsername: string;
  websiteUrl: string;
  webappUrl: string;                  // WebApp cabinet URL
  founderUsername: string;
  emojiPackName: string;
  // Live map — owned by the caller. Middleware stamps ctx.state.customEmoji
  // with this same instance so /emoji_reload can mutate it in place.
  customEmojiMap: Map<string, string>;
  repoUsers: UsersRepo;
  repoEvents: EventsRepo;
  repoBroadcasts: BroadcastsRepo;
  repoLeads: LeadsRepo;
  repoReminders: RemindersRepo;
  repoAiTurns: AiTurnsRepo;
  repoReferrals: ReferralsRepo;
  repoTeam: TeamRepo;
  apiClient: ApiClient;
  claudeAuth: ClaudeAuth;
  logger: Logger;
}

export function buildBot(opts: BuildBotOpts): Bot<AppContext> {
  const bot = new Bot<AppContext>(opts.token);

  bot.api.config.use(autoRetry());

  bot.use(
    stateMiddleware({
      repoUsers: opts.repoUsers,
      repoReferrals: opts.repoReferrals,
      repoTeam: opts.repoTeam,
      repoEvents: opts.repoEvents,
      apiClient: opts.apiClient,
      logger: opts.logger,
      adminTgId: opts.adminTgId,
      adminTgIds: opts.adminTgIds,
      botUsername: opts.botUsername,
      websiteUrl: opts.websiteUrl,
      webappUrl: opts.webappUrl,
      founderUsername: opts.founderUsername,
      customEmoji: opts.customEmojiMap,
    }),
  );
  bot.use(logMiddleware());
  bot.use(touchMiddleware());
  // Phase 1D: forward group-chat events to api for admin monitoring.
  bot.use(monitorMiddleware());

  // Broadcaster needs a bot instance.
  const broadcaster = new Broadcaster(bot, opts.repoUsers, opts.repoBroadcasts, opts.logger);
  const bcast = registerBroadcast({
    broadcaster,
    broadcastsRepo: opts.repoBroadcasts,
    adminTgIds: opts.adminTgIds,
  });

  // In-bot AI chat (same brief + tone as the landing /api/chat). Any
  // non-command text from a regular user flows through this handler;
  // admin text is intercepted earlier by the broadcast/reminder composer.
  const aiChat = registerAiChat({
    auth: opts.claudeAuth,
    aiTurns: opts.repoAiTurns,
    leadsRepo: opts.repoLeads,
    adminTgId: opts.adminTgId,
    logger: opts.logger,
  });

  // Public commands.
  bot.command("start", onStart);
  bot.command("help", onHelp);
  bot.command(["password", "pass", "recoverpassword"], onPassword);
  // [c1-removed] bot.command(["me", "stats"], onStats);
  bot.command(["balance", "wallet", "finance"], onBalance);
  bot.callbackQuery("balance:refresh", onBalanceRefresh);
  bot.command("lang", onLang);
  bot.command("reset", aiChat.onReset);
  bot.command("app", onApp);
  bot.command(["tariffs", "pricing", "plans"], onTariffs);
  // [c1-removed] bot.command("events", onEvents);
  // [c1-removed] bot.command("event_new", onEventNew);
  // [c1-removed] bot.command("event_list", onEventList);
  bot.command("cancel", async (ctx, next) => {
    // Try every active admin wizard; the first match wins. Each handler
    // only fires for an admin with state; non-wizard /cancel falls through.
    if (await onEventCancel(ctx)) return;
    if (await onPromoCancel(ctx)) return;
    if (await onVideoCancel(ctx)) return;
    if (await onMonitorCancel(ctx)) return;
    await next();
  });

  // Phase 1A: referral dashboard + team CRM.
  // [c1-removed] bot.command("ref", onRefCommand);
  // [c1-removed] bot.command("team", onTeamCommand);

  // Phase 1C — gamification repos + commands.
  const gamificationRepo = new GamificationRepo(opts.apiClient);
  const missionsRepo = new MissionsRepo(opts.apiClient);
  const quizzesRepo = new QuizzesRepo(opts.apiClient);
  const questsCmd = makeOnQuests(gamificationRepo);
  const missionsCmd = makeOnMissions(missionsRepo);
  const quizCmd = makeOnQuiz(quizzesRepo);
  const leaderboardCmd = makeOnLeaderboard(gamificationRepo);
  // [c1-removed] bot.command("quests", questsCmd.onQuests);
  // [c1-removed] bot.command("jobs", questsCmd.onQuests);
  // [c1-removed] bot.command("missions", missionsCmd.onMissions);
  // [c1-removed] bot.command("quiz", quizCmd.onQuiz);
  // [c1-removed] bot.command("top", leaderboardCmd.onLeaderboard);

  // Phase 1D — promo templates + video library.
  const promoRepo = new PromoRepo(opts.apiClient);
  const videosRepo = new VideosRepo(opts.apiClient);
  const promo = registerPromo(promoRepo);
  const video = registerVideo(videosRepo);
  // [c1-removed] bot.command("promo", promo.onPromoCmd);
  bot.callbackQuery(/^reklama:/, promo.onPromoCallback);
  bot.callbackQuery(/^modapprove:\d+$/, async (ctx) => { await onModerationCallback(ctx, "approve"); });
  bot.callbackQuery(/^modreject:\d+$/,  async (ctx) => { await onModerationCallback(ctx, "reject");  });
  // const _scheduler = registerScheduler();  // [c1-cleanup-done] unused
  // [c1-removed] bot.command("scheduler", _scheduler.onCommand);
  // [c1-removed] bot.command(["plan", "planner", "rasp"], _scheduler.onCommand);
  // const _meet = registerMeet();  // [c1-cleanup-done] unused
  // [c1-removed] bot.command("meet", _meet.onCommand);
  // [c1-removed] bot.command(["vc", "videocall"], _meet.onCommand);
  // [c1-removed] bot.command("video", video.onVideoCmd);

  // L5 — Golden Connect CRM commands. Each command works for any authenticated TG
  // user (ownerId = 'tg_' + ctx.from.id) and routes through cabinet HTTP API.
  bot.command("crm", requirePaidTariff(onCrm));
  bot.command(["find", "search"], requirePaidTariff(onFind));
  bot.command("today", requirePaidTariff(onToday));
  bot.command("pitch", requirePaidTariff(onPitch));
  bot.command(["pipeline", "funnel"], requirePaidTariff(onPipeline));
  bot.command("dashboard", requirePaidTariff(onStatsCrm));
  bot.command(["addlead", "addcontact"], requirePaidTariff(onAddContact));

  // L6 — AI sales session (guided workflow + coach mode)
  bot.command(["session", "go", "start_session"], onSession);
  bot.command("next", async (ctx) => {
    // shorthand to bounce out of coach mode back to next lead
    const fake = Object.assign({}, ctx, { callbackQuery: { data: "sess:next", from: ctx.from } });
    await onSessionCallback(fake as unknown as AppContext);
  });

  // Inline mode — @Golden ConnectTGbot <query> in any chat surfaces matching
  // contacts as inline-query results that can be shared into a chat.
  bot.on("inline_query", onCrmInlineQuery);

  // Voice memo / business-card photo → Whisper / vision → CRM history.
  bot.on("message:voice", onCrmVoice);
  bot.on("message:photo", async (ctx, next) => {
    const handled = await onCrmPhoto(ctx);
    if (!handled) await next();
  });

  // Business Bot incoming messages → record in CRM contact history.
  bot.on("business_message", async (ctx) => {
    try {
      const conn = ctx.update.business_message?.business_connection_id;
      const from = ctx.update.business_message?.from;
      const text =
        ctx.update.business_message?.text || ctx.update.business_message?.caption;
      if (!conn || !from || !text) return;
      // Owner = the bot's TG user (the one who connected the bot as Business).
      // We can't easily look up owner from conn id here without storage; rely
      // on cabinet to dispatch by businessConnection.id.
      const { crm: crmApi } = await import("../services/crmApi.js");
      await crmApi.recordBusinessMessage(
        "biz_" + conn,
        from.username || String(from.id),
        String(text).slice(0, 4000),
        "in",
      );
    } catch (e) {
      opts.logger.warn({ err: (e as Error).message }, "business_message handler failed");
    }
  });

  bot.hears(/^\/video_(\d+)(?:@\w+)?$/i, async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const videoId = Number(ctx.match?.[1] ?? 0);
    if (Number.isFinite(videoId) && videoId > 0) {
      await video.onVideoDeepLink(ctx, videoId);
    }
  });

  // Admin commands (gated). Filter matches ANY tg_id in the admin set.
  const admin = bot.filter(
    (ctx) => ctx.from !== undefined && opts.adminTgIds.has(ctx.from.id),
  );
  admin.command("admin", requireAdmin(), onAdminMenu);
  admin.command("users", requireAdmin(), onAdminUsers);
  admin.command("tree", requireAdmin(), onAdminTree);
  admin.command("block", requireAdmin(), onAdminBlock);
  admin.command("unblock", requireAdmin(), onAdminUnblock);
  admin.command("export", requireAdmin(), onAdminExport);
  admin.command("payments", requireAdmin(), onAdminPayments);
  admin.command("broadcast", requireAdmin(), bcast.onBroadcastCmd);

  // Phase 3B — promo / video / monitor CRUD wizards.
  admin.command("promo_new", requireAdmin(), onPromoNew);
  admin.command("promo_list", requireAdmin(), onPromoList);
  admin.command("promo_del", requireAdmin(), onPromoDelCmd);
  admin.command("video_new", requireAdmin(), onVideoNew);
  admin.command("video_list", requireAdmin(), onVideoList);
  admin.command("video_del", requireAdmin(), onVideoDelCmd);
  admin.command("monitor_add", requireAdmin(), onMonitorAdd);
  admin.command("monitor_list", requireAdmin(), onMonitorList);
  admin.command("monitor_del", requireAdmin(), onMonitorDelCmd);

  // Landing-funnel lead commands — usable from any chat where the admin
  // replies to a lead card (the card is typically in the forum group).
  const leads = registerLeadCommands(opts.repoLeads);
  const reminders = registerReminderCommands(opts.repoReminders);
  admin.command("where", requireAdmin(), onWhere);
  admin.command("leads", requireAdmin(), leads.onLeadsList);
  admin.command("take", requireAdmin(), leads.onTake);
  admin.command("won", requireAdmin(), leads.onWon);
  admin.command("lost", requireAdmin(), leads.onLost);
  admin.command("snooze", requireAdmin(), leads.onSnooze);

  // One-off setup + emoji diagnostics.
  const emojiRef = { current: opts.customEmojiMap };
  admin.command("setup_topics", requireAdmin(), onSetupTopics);
  admin.command("emoji_status", requireAdmin(), (ctx) =>
    onEmojiStatus(ctx, emojiRef, opts.emojiPackName),
  );
  admin.command(
    "emoji_reload",
    requireAdmin(),
    registerEmojiReload(emojiRef, opts.emojiPackName, opts.logger),
  );

  // Admin draft composer: any non-command text from an admin while composing.
  // If the admin isn't composing, fall through to the regular text path
  // below (the AI chat) so admins can also talk to the in-bot assistant.
  admin.on("message:text", async (ctx, next) => {
    if (await bcast.onAdminTextMaybeDraft(ctx)) return;
    if (await reminders.onAdminTextMaybeCompose(ctx)) return;
    if (await onAdminEventsMaybeText(ctx)) return;
    // Phase 3B wizards — order matters only because each Map has its own
    // tg_id keyspace, so at most one will match.
    if (await onPromoMaybeText(ctx)) return;
    if (await onVideoMaybeText(ctx)) return;
    if (await onMonitorMaybeText(ctx)) return;
    await next();
  });

  // Mini App → bot channel. The presentation webapp calls
  // Telegram.WebApp.sendData(JSON.stringify({ type: 'tour_done' })) when
  // the guided tour finishes; that arrives as message.web_app_data. We
  // mark presented_at + send the follow-up with the invite link.
  
  // ─── L4: Telegram Business Bot connection handler ──────────────────────
  // When a user enables this bot as their Business Bot, TG sends business_connection.
  // Forward to cabinet so CRM can use it to send messages on user's behalf.
  bot.on('business_connection', async (ctx) => {
    const conn = ctx.update.business_connection;
    if (!conn) return;
    try {
      const ownerId = 'tg_' + conn.user.id;
      await fetch(((process.env as Record<string,string>).CABINET_INTERNAL_URL || 'http://golden-connect-cabinet') + '/api/mlm/_internal/business-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': (process.env as Record<string,string>).INTERNAL_API_SECRET || '' },
        body: JSON.stringify({
          ownerId,
          connection: {
            id: conn.id,
            user_id: conn.user.id,
            username: conn.user.username,
            is_enabled: conn.is_enabled,
            can_reply: (conn as { can_reply?: boolean }).can_reply || true,
          },
        }),
      });
      console.log('[business_connection] forwarded to cabinet for', ownerId, 'enabled=', conn.is_enabled);
    } catch (e) {
      console.error('[business_connection] forward fail:', (e as Error).message);
    }
  });

  bot.on("message:web_app_data", async (ctx, next) => {
    const raw = ctx.message?.web_app_data?.data;
    if (!raw) { await next(); return; }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type === "tour_done") {
        await onWebAppDataTourDone(ctx);
        return;
      }
    } catch { /* non-JSON data — ignore */ }
    await next();
  });

  // L6 — if user is in CRM "coach" mode, text goes to Groq with lead context.
  // Falls through to global AI chat when no active coach session.
  bot.on("message:text", async (ctx, next) => {
    const handled = await onSessionText(ctx);
    if (!handled) await next();
  });

  // Everyone's text path — AI chat. Runs after admin composer middleware,
  // so admins get here only when not drafting a broadcast/reminder.
  bot.on("message:text", aiChat.onText);

  // Admin draft composer — photo variant. Caption + trailing button lines
  // are parsed the same way as the text flow.
  admin.on("message:photo", async (ctx, next) => {
    if (await bcast.onAdminPhotoMaybeDraft(ctx)) return;
    await next();
  });

  // Callback queries: dispatch in order — broadcast first, then users pagination, then general.
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (data.startsWith("bcast:")) {
      await bcast.onBroadcastCallback(ctx);
      return;
    }
    if (data.startsWith("crm:")) {
      await onCrmCallback(ctx);
      return;
    }
    if (data.startsWith("sess:")) {
      await onSessionCallback(ctx);
      return;
    }
    if (data.startsWith("users:")) {
      await onAdminUsersCallback(ctx);
      return;
    }
    if (data === "admin:broadcast") {
      if (ctx.from === undefined || !opts.adminTgIds.has(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: "Только для админа." });
        return;
      }
      await ctx.answerCallbackQuery();
      await bcast.onBroadcastCmd(ctx);
      return;
    }
    if (data === "admin:leads") {
      if (ctx.from === undefined || !opts.adminTgIds.has(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: "Только для админа." });
        return;
      }
      await ctx.answerCallbackQuery();
      await leads.onLeadsList(ctx);
      return;
    }
    if (data.startsWith("leads:") || data.startsWith("lead:")) {
      await leads.onLeadCallback(ctx);
      return;
    }
    if (data === "admin:reminders") {
      if (ctx.from === undefined || !opts.adminTgIds.has(ctx.from.id)) {
        await ctx.answerCallbackQuery({ text: "Только для админа." });
        return;
      }
      await ctx.answerCallbackQuery();
      await reminders.onList(ctx);
      return;
    }
    if (data.startsWith("rem:")) {
      await reminders.onCallback(ctx);
      return;
    }
    if (data.startsWith("ref:")) {
      await onRefCallback(ctx);
      return;
    }
    if (data.startsWith("team:")) {
      await onTeamCallback(ctx);
      return;
    }
    if (data.startsWith("evw:")) {
      if (await onAdminEventsCallback(ctx)) return;
    }
    if (data.startsWith("ev:")) {
      await onEventsCallback(ctx);
      return;
    }
    if (data.startsWith("quests:")) {
      const handled = await questsCmd.onCallback(ctx);
      if (handled) return;
    }
    if (data.startsWith("mission:")) {
      const handled = await missionsCmd.onCallback(ctx);
      if (handled) return;
    }
    if (data.startsWith("quiz:")) {
      const handled = await quizCmd.onCallback(ctx);
      if (handled) return;
    }
    if (data.startsWith("top:")) {
      const handled = await leaderboardCmd.onCallback(ctx);
      if (handled) return;
    }
    if (data.startsWith("promo:")) {
      await promo.onPromoCallback(ctx);
      return;
    }
    if (data.startsWith("video:")) {
      await video.onVideoCallback(ctx);
      return;
    }
    // Phase 3A — main menu grid taps. Each `menu:<feature>` callback is
    // a thin shim that re-enters the same handler the slash command would
    // invoke, so users get the exact same screen whether they typed `/ref`
    // or tapped 🔗 Реф-ссылка in the start menu. Falls through to the
    // generic `onCallback` for `menu:main` and `menu:lang` (they need
    // ctx state that lives in callbacks.ts: edit-in-place + lang-picker).
    if (data.startsWith("menu:")) {
      const action = data.slice("menu:".length);
      switch (action) {
        case "ref":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onRefCommand(ctx);
          return;
        case "team":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onTeamCommand(ctx);
          return;
        case "quests":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await questsCmd.onQuests(ctx);
          return;
        case "missions":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await missionsCmd.onMissions(ctx);
          return;
        case "quiz":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await quizCmd.onQuiz(ctx);
          return;
        case "top":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await leaderboardCmd.onLeaderboard(ctx);
          return;
        case "events":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onEvents(ctx);
          return;
        case "promo":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await promo.onPromoCmd(ctx);
          return;
        case "video":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await video.onVideoCmd(ctx);
          return;
        case "stats":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onStats(ctx);
          return;
        case "help":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onHelp(ctx);
          return;
        case "password":
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          await onPassword(ctx);
          return;
        case "lang": {
          try { await ctx.answerCallbackQuery(); } catch { /* noop */ }
          const userRow = ctx.from
            ? await opts.repoUsers.findByTgId(ctx.from.id)
            : undefined;
          const lang = pickLang(userRow?.language_code ?? ctx.from?.language_code ?? null);
          const title = tr(lang, "menu.lang_picker_title");
          const kb = buildLangPickerKeyboard(lang);
          try {
            await ctx.editMessageText(title, { reply_markup: kb });
          } catch {
            await ctx.reply(title, { reply_markup: kb });
          }
          return;
        }
      }
    }

    // Phase 3B — admin panel sections + wizard callbacks. All require admin.
    if (data.startsWith("pwz:")) {
      if (await onPromoCallback(ctx)) return;
    }
    if (data.startsWith("vwz:")) {
      if (await onVideoAdminCallback(ctx)) return;
    }
    if (data.startsWith("mwz:")) {
      if (await onMonitorCallback(ctx)) return;
    }
    if (data.startsWith("admin:")) {
      const isAdminCb = ctx.from !== undefined && opts.adminTgIds.has(ctx.from.id);
      if (!isAdminCb) {
        await ctx.answerCallbackQuery({ text: "Только для админа." });
        return;
      }
      switch (data) {
        case "admin:menu":
        case "admin:open":
        case "admin:back":
          await ctx.answerCallbackQuery();
          await onAdminMenu(ctx);
          return;
        case "admin:refresh":
          await ctx.answerCallbackQuery({ text: "🔄" });
          await onAdminPanelRefresh(ctx);
          return;
        case "admin:close":
          await ctx.answerCallbackQuery({ text: "Закрыто." });
          await onAdminPanelClose(ctx);
          return;
        case "admin:tree":
          await ctx.answerCallbackQuery();
          await onAdminTree(ctx);
          return;
        case "admin:events":
          await ctx.answerCallbackQuery();
          await onEventList(ctx);
          return;
        case "admin:promo":
          await ctx.answerCallbackQuery();
          await onPromoList(ctx);
          return;
        case "admin:promo_new":
          await ctx.answerCallbackQuery();
          await onPromoNew(ctx);
          return;
        case "admin:video":
          await ctx.answerCallbackQuery();
          await onVideoList(ctx);
          return;
        case "admin:video_new":
          await ctx.answerCallbackQuery();
          await onVideoNew(ctx);
          return;
        case "admin:monitor":
          await ctx.answerCallbackQuery();
          await onMonitorList(ctx);
          return;
        case "admin:monitor_add":
          await ctx.answerCallbackQuery();
          await onMonitorAdd(ctx);
          return;
        case "admin:setup":
          await ctx.answerCallbackQuery();
          await ctx.reply(
            "🔧 <b>Setup</b>\n\n" +
              "• /setup_topics — создать форум-темы в группе\n" +
              "• /emoji_status — проверить custom-emoji pack\n" +
              "• /emoji_reload — перечитать pack",
            { parse_mode: "HTML" },
          );
          return;
      }
    }

    await onCallback(ctx);
  });

  bot.catch((err) => {
    opts.logger.error({ err: err.error, ctx: err.ctx.update.update_id }, "bot error");
  });

  return bot;
}

/**
 * Public commands that populate the TG hamburger menu via setMyCommands.
 * Order matters — TG renders top-to-bottom. Admin-only commands
 * (`/admin`, `/users`, `/broadcast`, …) are intentionally excluded; they
 * stay discoverable via `/admin` for the elevated set in Phase 3B.
 *
 * The `cmd_desc.<key>` entries live in `menu-strings.ts` for all 6
 * locales, with EN fallback through `tr()`.
 */
// [c1-cleanup-done] Trimmed BotFather menu to 11 CRM-focused commands.
// Old commands kept as code but no longer surfaced via setMyCommands.
const PUBLIC_COMMANDS: ReadonlyArray<{ command: string; descKey: string }> = [
  { command: "start",     descKey: "cmd_desc.start" },
  { command: "today",     descKey: "cmd_desc.today" },
  { command: "find",      descKey: "cmd_desc.find" },
  { command: "addlead",   descKey: "cmd_desc.addlead" },
  { command: "pitch",     descKey: "cmd_desc.pitch" },
  { command: "pipeline",  descKey: "cmd_desc.pipeline" },
  { command: "dashboard", descKey: "cmd_desc.dashboard" },
  { command: "crm",       descKey: "cmd_desc.crm" },
  { command: "app",       descKey: "cmd_desc.app" },
  { command: "balance",   descKey: "cmd_desc.balance" },
  { command: "tariffs",   descKey: "cmd_desc.tariffs" },
  { command: "lang",      descKey: "cmd_desc.lang" },
  { command: "help",      descKey: "cmd_desc.help" },
];

/**
 * Locales that get a per-language `setMyCommands` call. TG matches on
 * the user's client language tag, so `language_code='ru'` users see
 * the RU descriptions and everyone else falls back to the default
 * (EN) call we issue first.
 *
 * Mapping note: TG's BCP-47 doesn't include `fil` — the closest match
 * is `tl` (Tagalog), which Telegram clients fall back to. `pickLang()`
 * already converts both `fil` and `tl` to our internal `fil` locale.
 *
 * `tr()` already falls back to EN when a locale is missing a key, so
 * a partially translated locale still produces a usable description
 * list rather than raw key strings.
 */
const TG_LOCALES: ReadonlyArray<{ lang: Lang; tg: string }> = [
  { lang: "en", tg: "en" },
  { lang: "ru", tg: "ru" },
  { lang: "zh", tg: "zh" },
  { lang: "uz", tg: "uz" },
  { lang: "fil", tg: "tl" },
  { lang: "th", tg: "th" },
];

/**
 * Push the public command list into the TG hamburger menu — once with
 * no `language_code` (the default) and once per supported locale.
 * Idempotent: TG simply overwrites the prior entry.
 *
 * Failures are logged and swallowed so a transient Bot API hiccup
 * can't keep the bot from polling.
 */
export async function setupBotCommands(
  bot: Bot<AppContext>,
  logger: Logger,
): Promise<void> {
  // Default scope (no language_code) uses EN — every client without a
  // matching locale picks this up.
  const defaultCmds = PUBLIC_COMMANDS.map((c) => ({
    command: c.command,
    description: tr("en", c.descKey),
  }));
  try {
    await bot.api.setMyCommands(defaultCmds);
  } catch (e) {
    logger.warn(
      { err: (e as Error).message },
      "setMyCommands (default/en) failed",
    );
  }

  // Per-locale overrides — Bot API stores them keyed on
  // (scope, language_code), so the same command list appears localised
  // to clients reporting that language tag.
  for (const { lang, tg } of TG_LOCALES) {
    if (lang === "en") continue; // already set as default
    const cmds = PUBLIC_COMMANDS.map((c) => ({
      command: c.command,
      description: tr(lang, c.descKey),
    }));
    try {
      // grammY's typed `language_code` enum lacks a few BCP-47 tags
      // (e.g. `tl`); the Bot API accepts them, so we widen the type.
      await bot.api.setMyCommands(cmds, {
        language_code: tg as "en",
      });
    } catch (e) {
      logger.warn(
        { err: (e as Error).message, lang, tg },
        "setMyCommands (locale) failed",
      );
    }
  }
  logger.info({ count: PUBLIC_COMMANDS.length, locales: TG_LOCALES.length }, "bot commands published");
}

/**
 * Configure the persistent menu button that Telegram shows next to the
 * chat input. Idempotent — safe to call every boot; Telegram just stores
 * the latest configuration. The button opens the cabinet inside a
 * Telegram WebApp view, so initData auth works automatically.
 *
 * Logs and swallows failures — a misconfigured menu button must not
 * prevent the bot from starting.
 */
export async function setupWebAppMenuButton(
  bot: Bot<AppContext>,
  webappUrl: string,
  logger: Logger,
): Promise<void> {
  // The CRM is the new flagship surface — point the persistent button there
  // when CRM_WEBAPP_URL is provided, fall back to the legacy cabinet otherwise.
  const crmUrl = process.env.CRM_WEBAPP_URL || "";
  const targetUrl = crmUrl || webappUrl;
  const buttonText = crmUrl ? "📋 CRM" : "🚀 Кабинет";
  try {
    await bot.api.setChatMenuButton({
      menu_button: {
        type: "web_app",
        text: buttonText,
        web_app: { url: targetUrl },
      },
    });
    logger.info({ targetUrl, buttonText }, "menu button set (WebApp)");
  } catch (e) {
    logger.warn(
      { err: (e as Error).message, targetUrl },
      "setChatMenuButton failed (bot will still start)",
    );
  }
}