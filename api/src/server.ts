import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger as honoLogger } from 'hono/logger';
import pino from 'pino';
import { corsMiddleware } from './middleware/cors.js';
import authRoutes from './routes/auth.js';
import authEmailRoutes from './routes/auth-email.js';
import authVerifyRoutes from "./routes/auth-verify.js";
import meProfileRoutes from "./routes/me-profile.js";
import authTgRoutes from './routes/auth-tg.js';
import meBookRoutes from './routes/me-book.js';
import meGiftRoutes from './routes/me-gift.js';
import internalGiftRoutes from './routes/internal-gift.js';
import meRoutes from './routes/me.js';
import healthRoutes from './routes/health.js';
import referralsRoutes from './routes/referrals.js';
import ledgerRoutes from './routes/ledger.js';
import leadsRoutes from './routes/leads.js';
import agentsRoutes from './routes/agents.js';
import internalUsersRoutes from './routes/internal-users.js';
import internalLeadsRoutes from './routes/internal-leads.js';
import internalRemindersRoutes from './routes/internal-reminders.js';
import internalAiTurnsRoutes from './routes/internal-aiturns.js';
import internalBroadcastsRoutes from './routes/internal-broadcasts.js';
import internalEntriesRoutes from './routes/internal-entries.js';
import internalMarketplaceRoutes from './routes/internal-marketplace.js';
import internalKarmaRoutes from './routes/internal-karma.js';
import internalKarmaRaffleRoutes from "./routes/internal-karma-raffle.js";
import internalBonusMatrixRoutes from './routes/internal-bonus-matrix.js';
import internalBalanceRoutes from './routes/internal-balance.js';
import internalAdminPanelRoutes from './routes/internal-admin-panel.js';
import internalUsersTgRoutes from './routes/internal-users-tg.js';
import internalPaymentsRoutes from './routes/internal-payments.js';
import internalPayRoutes from './routes/internal-pay.js';
import internalFinanceRoutes from './routes/internal-finance.js';
import internalRoboaiRoutes from './routes/internal-roboai.js';
import internalAdminRoutes from './routes/internal-admin.js';
import internalTasksRoutes from './routes/internal-tasks.js';
import tariffsRoutes from './routes/tariffs.js';
import monarRoutes from './monar/routes.js';
import { startMonarCron, stopMonarCron } from './monar/cron.js';
import meTariffRoutes from './routes/me-tariff.js';
import meFinanceRoutes from './routes/me-finance.js';
import meMatrixRoutes from './routes/me-matrix.js';
import meTasksRoutes from './routes/me-tasks.js';
import meReferrals5lvlRoutes from './routes/me-referrals-5lvl.js';
import meReferrals10lvlRoutes from './routes/me-referrals-10lvl.js';
import webhooksPlategaRoutes from './routes/webhooks-platega.js';
import adminMarketingRoutes from './routes/admin-marketing.js';
import mePayPlategaRoutes from './routes/me-pay-platega.js';
import webhooksCryptobotRoutes from './routes/webhooks-cryptobot.js';
import mePayCryptobotRoutes from './routes/me-pay-cryptobot.js';
import referralRoutes from './routes/referral.js';
import teamRoutes from './routes/team.js';
import eventsRoutes from './routes/events.js';
import gamificationRoutes from './routes/gamification.js';
import missionsRoutes from './routes/missions.js';
import quizzesRoutes from './routes/quizzes.js';
import promoRoutes from './routes/promo.js';
import videosRoutes from './routes/videos.js';
import monitorRoutes from './routes/monitor.js';
import projectsRoutes from './routes/projects.js';
import internalAdminMetricsRoutes from './routes/internal-admin-metrics.js';
import { assertServerEnv, env } from './services/env.js';
import { ensureAdminUser } from './services/users.js';
import { registerAllJobs, startAll, stopAll } from './jobs/index.js';

const log = pino({ name: 'golden-connect-api' });

export function createApp() {
  const app = new Hono();

  app.use('*', corsMiddleware);
  app.use('*', honoLogger());

  app.route('/', healthRoutes);
  app.route('/api/monar', monarRoutes);
  app.route('/', authRoutes);
  app.route('/', authEmailRoutes);
  app.route('/', authTgRoutes);
  app.route('/', meBookRoutes);
  app.route('/', meGiftRoutes);
  app.route('/', internalGiftRoutes);
  app.route('/', meRoutes);
  app.route('/', authVerifyRoutes);
  app.route('/', meProfileRoutes);
  app.route('/', referralsRoutes);
  app.route('/', ledgerRoutes);
  app.route('/', leadsRoutes);
  app.route('/', agentsRoutes);
  app.route('/', internalUsersRoutes);
  app.route('/', internalLeadsRoutes);
  app.route('/', internalRemindersRoutes);
  app.route('/', internalAiTurnsRoutes);
  app.route('/', internalBroadcastsRoutes);
  app.route('/', internalEntriesRoutes);
  app.route('/', internalMarketplaceRoutes);
  app.route('/', internalKarmaRoutes);
  app.route("/", internalKarmaRaffleRoutes);
  app.route('/', internalBonusMatrixRoutes);
  app.route('/', internalBalanceRoutes);
  app.route('/', internalAdminPanelRoutes);
  app.route('/', internalUsersTgRoutes);
  app.route('/', internalPaymentsRoutes);
  app.route('/', internalPayRoutes);
  app.route('/', internalFinanceRoutes);
  app.route('/', internalRoboaiRoutes);
  app.route('/', internalAdminRoutes);
  app.route('/', internalTasksRoutes);
  app.route('/', tariffsRoutes);
  app.route('/', meTariffRoutes);
  app.route('/', meFinanceRoutes);
  app.route('/', meMatrixRoutes);
  app.route('/', meTasksRoutes);
  app.route('/', meReferrals5lvlRoutes);
  app.route('/', meReferrals10lvlRoutes);
  app.route('/', webhooksPlategaRoutes);
    app.route('/admin', adminMarketingRoutes);
  app.route('/', mePayPlategaRoutes);
  app.route('/', webhooksCryptobotRoutes);
  app.route('/', mePayCryptobotRoutes);
  app.route('/', referralRoutes);
  app.route('/', teamRoutes);
  app.route('/', eventsRoutes);
  app.route('/', gamificationRoutes);
  app.route('/', missionsRoutes);
  app.route('/', quizzesRoutes);
  app.route('/', promoRoutes);
  app.route('/', videosRoutes);
  app.route('/', monitorRoutes);
  app.route('/', projectsRoutes);
  app.route('/', internalAdminMetricsRoutes);

  app.notFound((c) => c.json({ ok: false, error: 'not_found' }, 404));
  app.onError((err, c) => {
    log.error({ err }, 'unhandled error');
    return c.json({ ok: false, error: 'internal_error' }, 500);
  });

  return app;
}

// Only start server when run directly (not during test imports).
const isEntry = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  try {
    assertServerEnv();
  } catch (e) {
    log.error({ err: e }, 'env validation failed');
    process.exit(1);
  }

  ensureAdminUser()
    .then((admin) => log.info({ adminId: admin.id, refCode: admin.refCode }, 'admin user ready'))
    .catch((err) => {
      log.error({ err }, 'failed to ensure admin user');
      process.exit(1);
    });

  const app = createApp();
  serve(
    {
      fetch: app.fetch,
      port: env.port,
    },
    (info) => {
      log.info({ port: info.port }, 'golden-connect-api listening');
      // Boot the cron engine AFTER the HTTP server binds so any
      // "runOnStart" job that issues internal HTTP calls can reach us.
      try {
        registerAllJobs();
        startAll();
        startMonarCron(log);
      } catch (err) {
        log.error({ err }, 'scheduler boot failed');
      }
    },
  );

  // Graceful shutdown — stop the cron engine before exiting so no new
  // ticks fire mid-teardown. In-flight handlers still finish naturally;
  // scheduler itself is synchronous/stop-only here.
  const shutdown = (sig: string): void => {
    log.info({ sig }, 'shutting down');
    try {
      stopAll();
      stopMonarCron();
    } catch (err) {
      log.warn({ err }, 'scheduler stopAll failed');
    }
    // Give pino a tick to flush, then exit.
    setTimeout(() => process.exit(0), 100).unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}
