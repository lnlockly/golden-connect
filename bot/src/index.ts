import pino from "pino";
import { config, isTestStub } from "./config.js";
import { openDb } from "./db/index.js";
import { UsersRepo, BroadcastsRepo } from "./db/users.js";
import { EventsRepo } from "./db/events.js";
import { LeadsRepo } from "./db/leads.js";
import { RemindersRepo } from "./db/reminders.js";
import { AiTurnsRepo } from "./db/aiTurns.js";
import { ReferralsRepo } from "./db/referrals.js";
import { TeamRepo } from "./db/team.js";
// Side-effect import — registers Phase 1B nested i18n strings.
import "./services/i18n-phase1b.js";
import { buildBot, setupWebAppMenuButton, setupBotCommands } from "./bot/index.js";
import { startHttpServer } from "./http/chat.js";
import { loadCustomEmojiMap } from "./services/customEmoji.js";
import { initNotifier } from "./services/notifier.js";
import { startReminderScheduler } from "./services/reminderScheduler.js";
import { startCrmPushScheduler } from "./services/crmPushScheduler.js";
import { startRoboaiDailyPush } from "./services/roboaiDailyPush.js";
import { ClaudeAuth } from "./services/claudeAuth.js";

async function main(): Promise<void> {
  const logger = pino({
    level: config.logLevel,
    transport:
      config.nodeEnv === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  });

  // All persistence is delegated to golden-connect-api over HTTP; this is the
  // shared client every repo uses. No local SQLite, no migrations here.
  const apiClient = openDb({
    baseUrl: config.internalApiUrl,
    secret: config.internalSecret,
  });
  const repoUsers = new UsersRepo(apiClient);
  const repoEvents = new EventsRepo(apiClient);
  const repoBroadcasts = new BroadcastsRepo(apiClient);
  const repoLeads = new LeadsRepo(apiClient);
  const repoReminders = new RemindersRepo(apiClient);
  const repoAiTurns = new AiTurnsRepo(apiClient);
  const repoReferrals = new ReferralsRepo(apiClient);
  const repoTeam = new TeamRepo(apiClient, (uid, limit, offset) =>
    repoReferrals.listMine(uid, limit, offset),
  );

  // Single OAuth token holder — shared by the landing /api/chat path and
  // the in-bot AI so a refresh from either side benefits both.
  const claudeAuth = new ClaudeAuth(
    logger,
    process.env.CLAUDE_OAUTH_ACCESS_TOKEN ?? "",
    process.env.CLAUDE_OAUTH_REFRESH_TOKEN ?? "",
  );

  // The emoji map is owned here so /emoji_reload (registered in buildBot)
  // and the per-update middleware both point at the same Map instance.
  const customEmojiMap = new Map<string, string>();

  const bot = buildBot({
    token: config.botToken,
    adminTgId: config.adminTgId,
    adminTgIds: config.adminTgIds,
    botUsername: config.botUsername,
    websiteUrl: config.websiteUrl,
    webappUrl: config.webappUrl,
    founderUsername: config.founderUsername,
    emojiPackName: config.emojiPackName,
    customEmojiMap,
    repoUsers,
    repoEvents,
    repoBroadcasts,
    repoLeads,
    repoReminders,
    repoAiTurns,
    repoReferrals,
    repoTeam,
    apiClient,
    claudeAuth,
    logger,
  });

  // Inject the live Bot instance into the unified notifier so every
  // feature that ships a DM (drip, nudges, event reminders, …) shares
  // one retry + rate-limit policy. Must happen before any handler fires.
  initNotifier(bot);

  if (isTestStub) {
    logger.info("started (test stub mode — skipping bot.start)");
    return;
  }

  // Populate the emoji map once at boot — every handler sees the same Map
  // instance via ctx.state.customEmoji, so /emoji_reload can repopulate it
  // in place without a process restart. Middleware is installed inside
  // buildBot (so it stamps every request before handlers run).
  const initial = await loadCustomEmojiMap(bot.api, config.emojiPackName, logger);
  for (const [k, v] of initial) customEmojiMap.set(k, v);

  // Set the persistent chat menu button → opens WebApp cabinet. Fire-and-
  // forget: runs in parallel with bot.start() so a slow Bot API call can't
  // delay update processing.
  void setupWebAppMenuButton(bot, config.webappUrl, logger);

  // Phase 3A — populate the TG hamburger menu with every public command,
  // localised per supported locale. Same fire-and-forget pattern: the
  // poll loop must not wait on Bot API.
  void setupBotCommands(bot, logger);

  // Defence-in-depth: override env BOT_USERNAME with the real one fetched
  // from getMe so wrong-cased env values never leak into invite links.
  try {
    const me = await bot.api.getMe();
    const real = me.username || "";
    const env = process.env.BOT_USERNAME || "";
    if (real && env && real.toLowerCase() !== env.toLowerCase()) {
      logger.warn({ env, real }, "BOT_USERNAME mismatch — using real from getMe");
    }
    if (real) {
      process.env.BOT_USERNAME = real;
      // Also propagate into runtime config object exposed to handlers.
      (config as { botUsername?: string }).botUsername = real;
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "getMe failed — leaving BOT_USERNAME as-is");
  }

  bot.start({
    allowed_updates: [
      'message', 'edited_message', 'channel_post', 'callback_query',
      'inline_query', 'chat_member', 'my_chat_member',
      'business_connection', 'business_message', 'edited_business_message',
      'deleted_business_messages',
    ],
    onStart: (info) => {
      logger.info({ username: info.username }, "bot started (long polling) with business updates");
    },
  });

  // HTTP chat/order API for the landing (proxied by ingress at /api/*).
  const httpPort = Number(process.env.HTTP_PORT ?? 8080);
  startHttpServer(
    {
      adminTgId: config.adminTgId,
      bot,
      logger,
      auth: claudeAuth,
      leadsRepo: repoLeads,
      usersRepo: repoUsers,
      landing: {
        secret: config.landingWebhookSecret,
        chatId: config.landingChatId,
        topicOrder: config.landingTopicOrder,
        topicOperator: config.landingTopicOperator,
        topicLearner: config.landingTopicLearner,
      },
    },
    httpPort,
  );

  // Background reminder sequence — scans every 5 minutes for waitlist users
  // who joined but never filled out the landing form, and sends the next due
  // step. Skips blocked users and anyone with applied_on_site = 1.
  startReminderScheduler({
    bot,
    reminders: repoReminders,
    users: repoUsers,
    logger,
  });

  // L5 — CRM real-time push: every 5 min, hits cabinet for due tasks /
  // new leads and pushes them to each owner's TG chat.
  startCrmPushScheduler({ bot, logger });

  // L6 — daily roboai engine digest (warmup status, scraped leads, dialog stats)
  startRoboaiDailyPush({ bot, logger });

  const shutdown = async (sig: string): Promise<void> => {
    logger.info({ sig }, "shutting down");
    try {
      await bot.stop();
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "bot.stop failed");
    }
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", e);
  process.exit(1);
});
