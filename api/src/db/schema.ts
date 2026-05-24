import { sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tgId: bigint('tg_id', { mode: 'number' }).unique(),
  tgUsername: text('tg_username'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  languageCode: text('language_code'),
  refCode: text('ref_code').notNull().unique(),
  // Denormalised inviter mirror of `invite_edges` — the bot's repos lean on
  // this column for fast JOINs. Always written together with invite_edges.
  invitedByUserId: integer('invited_by_user_id').references((): AnyPgColumn => users.id),
  invitedByRefCode: text('invited_by_ref_code'),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  isBlocked: boolean('is_blocked').notNull().default(false),
  appliedOnSite: boolean('applied_on_site').notNull().default(false),
  appliedAt: timestamp('applied_at'),
  refNotificationsEnabled: boolean('ref_notifications_enabled').notNull().default(true),
  // Set when the user confirms they've watched the onboarding presentation
  // (via bot WebApp sendData('tour_done') or the landing tour). Used by the
  // airdrop quest detector — one of the three "qualified referral" signals.
  presentedAt: timestamp('presented_at'),
  // Profile fields (signup onboarding — Phase 2026-04).
  country: text("country"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  // Wizard checkpoints. Nullable = step not done.
  profileFilledAt: timestamp("profile_filled_at"),
  channelsJoinedAt: timestamp("channels_joined_at"),
  // Marketing v2 (2026-04 re-brand): partner bonus, gift balance, ad budget.
  partnerStatus: boolean('partner_status').notNull().default(false),
  partnerStatusSince: timestamp('partner_status_since'),
  giftBalanceMicro: bigint('gift_balance_micro', { mode: 'bigint' }).notNull().default(0n),
  qualifiedRefsL1: integer('qualified_refs_l1').notNull().default(0),
});

export const userWallets = pgTable('user_wallets', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),
  address: text('address').notNull().unique(),
  chainId: integer('chain_id').notNull().default(56),
  connectedAt: timestamp('connected_at').notNull().defaultNow(),
});

export const walletNonces = pgTable('wallet_nonces', {
  address: text('address').primaryKey(),
  nonce: text('nonce').notNull(),
  issuedAt: timestamp('issued_at').notNull().defaultNow(),
  expiresAt: timestamp('expires_at').notNull(),
  consumedAt: timestamp('consumed_at'),
});

export const inviteEdges = pgTable(
  'invite_edges',
  {
    id: serial('id').primaryKey(),
    childUserId: integer('child_user_id')
      .notNull()
      .references(() => users.id)
      .unique(),
    parentUserId: integer('parent_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_invite_parent').on(t.parentUserId)],
);

export const leads = pgTable(
  'leads',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id),
    track: text('track').notNull(),
    contact: text('contact'),
    payload: jsonb('payload').notNull(),
    source: text('source'),
    lang: text('lang'),
    status: text('status').notNull().default('new'),
    takenByTgId: bigint('taken_by_tg_id', { mode: 'number' }),
    takenAt: timestamp('taken_at'),
    resolvedAt: timestamp('resolved_at'),
    totalUsd: integer('total_usd'),
    lostReason: text('lost_reason'),
    snoozeUntil: timestamp('snooze_until'),
    // Telegram posting coords — so admin commands can find the lead card
    // from a reply. Mirrors bot's existing schema.
    chatId: bigint('chat_id', { mode: 'number' }),
    messageThreadId: bigint('message_thread_id', { mode: 'number' }),
    postedMessageId: bigint('posted_message_id', { mode: 'number' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_leads_user').on(t.userId),
    index('idx_leads_status').on(t.status),
    index('idx_leads_contact').on(t.contact),
    index('idx_leads_posted').on(t.chatId, t.postedMessageId),
    index('idx_leads_created').on(t.createdAt),
  ],
);

/** Broadcast history — which admin sent which text when, with delivery tallies. */
export const broadcasts = pgTable('broadcasts', {
  id: serial('id').primaryKey(),
  adminTgId: bigint('admin_tg_id', { mode: 'number' }).notNull(),
  text: text('text').notNull(),
  sentCount: integer('sent_count').notNull().default(0),
  failedCount: integer('failed_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Inviter ref_code captured before the user row itself exists (e.g. on
 * Telegram /start with a ref payload). Resolved on user creation.
 */
export const pendingReferrals = pgTable('pending_referrals', {
  tgId: bigint('tg_id', { mode: 'number' }).primaryKey(),
  refCode: text('ref_code').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Configurable 3-step onboarding reminder sequence. `delayHours` is
 * counted from the user's joined_at; the scheduler skips anyone with
 * applied_on_site = true OR is_blocked = true.
 */
export const reminderSteps = pgTable(
  'reminder_steps',
  {
    id: serial('id').primaryKey(),
    orderIdx: integer('order_idx').notNull(),
    delayHours: doublePrecision('delay_hours').notNull(),
    textRu: text('text_ru').notNull(),
    textEn: text('text_en'),
    textZh: text('text_zh'),
    enabled: boolean('enabled').notNull().default(true),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [index('idx_reminder_steps_order').on(t.orderIdx)],
);

export const reminderSends = pgTable(
  'reminder_sends',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    stepId: integer('step_id').notNull().references(() => reminderSteps.id, { onDelete: 'cascade' }),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_user_step').on(t.userId, t.stepId),
    index('idx_reminder_sends_user').on(t.userId),
  ],
);

export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  ownerUserId: integer('owner_user_id').references(() => users.id),
  name: text('name').notNull(),
  ticker: text('ticker'),
  character: jsonb('character').notNull(),
  plugins: jsonb('plugins').notNull(),
  state: text('state').notNull().default('queued'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deployedAt: timestamp('deployed_at'),
  ingressUrl: text('ingress_url'),
  error: text('error'),
});

/**
 * Legacy agentflow-api money log. Lives on the shared Neon DB; Golden Connect
 * does not write here — it keeps its own `cash_ledger` below.
 */
export const flowLedger = pgTable(
  'flow_ledger',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    relatedLeadId: integer('related_lead_id').references(() => leads.id),
    relatedUserId: integer('related_user_id').references(() => users.id),
    level: integer('level'),
    memo: text('memo'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_ledger_user_time').on(t.userId, t.createdAt)],
);

/**
 * Golden Connect money log — separate from `flow_ledger` (which belongs to
 * agentflow-api on the same shared Neon). One row per credit or debit.
 * Kinds:
 *   entry_fee      — user paid a tariff entry (negative amount)
 *   matrix_share   — 3-above matrix share paid in (positive) or out (negative)
 *   ref_L1..ref_L5 — 5-level referral reward
 *   task_reward    — paid task completion
 *   ad_view        — ad impression reward
 *   admin_fee      — platform cut (negative to user, positive to admin)
 *   payout_out     — withdrawal to external wallet (negative)
 */
export const cashLedger = pgTable(
  'cash_ledger',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    kind: text('kind').notNull(),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    relatedLeadId: integer('related_lead_id').references(() => leads.id),
    relatedUserId: integer('related_user_id').references(() => users.id),
    level: integer('level'),
    memo: text('memo'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_cash_ledger_user_time').on(t.userId, t.createdAt)],
);

export const aiTurns = pgTable(
  'ai_turns',
  {
    id: serial('id').primaryKey(),
    tgId: bigint('tg_id', { mode: 'number' }),
    userId: integer('user_id').references(() => users.id),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_ai_turns_user_time').on(t.userId, t.createdAt)],
);

/**
 * user_quests — airdrop progression. One row per (user, quest) the moment
 * the user qualifies. Insertion also mints a flow_ledger entry with kind
 * 'quest_reward'. ID strings for quests are controlled in `services/quests.ts`
 * and NEVER removed once deployed (otherwise historical rewards get orphaned).
 */
export const userQuests = pgTable(
  'user_quests',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    questId: text('quest_id').notNull(),
    completedAt: timestamp('completed_at').notNull().defaultNow(),
    rewardMicro: bigint('reward_micro', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    index('idx_user_quests_user').on(t.userId),
    uniqueIndex('uniq_user_quest').on(t.userId, t.questId),
  ],
);

/**
 * Payment intake invoices — one row per (lead, method) the user chooses.
 * Generated lazily when the user clicks "Pay with card" or "Pay with crypto".
 * We keep both methods on the same table so the admin can see all attempts
 * at a glance and so the webhook and manual confirmation flows share code.
 *
 * `amount_usdt_micro` is the EXACT USDT BEP-20 amount the user must send —
 * encoded with a small per-lead suffix so two pending crypto invoices have
 * distinct trailing decimals (lets admins identify which lead a tx belongs
 * to without parsing memos, which BEP-20 transfers don't have).
 */
export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    leadId: integer('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    userId: integer('user_id').references(() => users.id),
    method: text('method').notNull(),
    amountUsd: doublePrecision('amount_usd').notNull(),
    amountUsdtMicro: bigint('amount_usdt_micro', { mode: 'bigint' }),
    cryptoAddress: text('crypto_address'),
    plategaId: text('platega_id'),
    plategaUrl: text('platega_url'),
    txHash: text('tx_hash'),
    status: text('status').notNull().default('pending'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [
    index('idx_invoices_lead').on(t.leadId),
    index('idx_invoices_status_created').on(t.status, t.createdAt),
  ],
);

/**
 * Tariff plans — 8 rows, seeded idempotently by scripts/seed-tariffs.ts.
 * `entryMicro` is the one-shot entry fee paid on activation; it is also
 * the monthly renewal fee (monthlyFeeMicro) per the current pricing.
 * `dailyCapMicro` is the maximum sum of task_reward + ad_view credits
 * a user on this tariff can earn in a single UTC day.
 */
export const tariffs = pgTable(
  'tariffs',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull().unique(),
    name: text('name').notNull(),
    entryMicro: bigint('entry_micro', { mode: 'bigint' }).notNull(),
    dailyCapMicro: bigint('daily_cap_micro', { mode: 'bigint' }).notNull(),
    monthlyFeeMicro: bigint('monthly_fee_micro', { mode: 'bigint' }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    // Marketing v2 columns — seat count, matrix depth/rate, 10-level refs, Matching Bonus gate.
    isActive: boolean('is_active').notNull().default(true),
    businessSeatsCount: integer('business_seats_count').notNull().default(1),
    matrixDepth: integer('matrix_depth').notNull().default(12),
    matrixRateMicro: bigint('matrix_rate_micro', { mode: 'bigint' }).notNull().default(500000n),
    refLevels: integer('ref_levels').notNull().default(10),
    hasMatchingBonus: boolean('has_matching_bonus').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_tariffs_sort').on(t.sortOrder)],
);

/**
 * Active tariff subscription per user. Keep history — a new row is
 * inserted on each activation/upgrade. The current active plan is the
 * row with isActive=true (enforced via partial unique idx below).
 */
export const userTariffs = pgTable(
  'user_tariffs',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tariffId: integer('tariff_id')
      .notNull()
      .references(() => tariffs.id),
    activeSince: timestamp('active_since').notNull().defaultNow(),
    activeUntil: timestamp('active_until'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_user_tariffs_user').on(t.userId),
    index('idx_user_tariffs_active').on(t.userId, t.isActive),
  ],
);

/**
 * Global matrix — every activated user gets ONE position in insertion
 * order. `position` is a dense 1-based integer; the 3-above earners for
 * position N are at floor((N-1)/3), floor((N-1)/9), floor((N-1)/27)
 * using the position→user mapping (matrix engine computes this).
 */
export const matrixPositions = pgTable(
  'matrix_positions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    seatIndex: integer('seat_index').notNull().default(1),
    position: integer('position').notNull().unique(),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
  },
  (t) => [index('idx_matrix_pos').on(t.position)],
);

/**
 * Matrix payout log — one row per 3-above credit caused by a new entry.
 * `level` ∈ {1,2,3}: 1 = direct upline (pos/3), 2 = grandparent, 3 = great-grandparent.
 */
export const matrixAccruals = pgTable(
  'matrix_accruals',
  {
    id: serial('id').primaryKey(),
    recipientUserId: integer('recipient_user_id')
      .notNull()
      .references(() => users.id),
    fromUserId: integer('from_user_id')
      .notNull()
      .references(() => users.id),
    fromPosition: integer('from_position').notNull(),
    level: integer('level').notNull(),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    ledgerId: integer('ledger_id').references(() => cashLedger.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_matrix_accr_recipient').on(t.recipientUserId, t.createdAt),
    index('idx_matrix_accr_from').on(t.fromUserId),
    uniqueIndex('uniq_matrix_accr_from_level').on(t.fromUserId, t.level),
  ],
);

/**
 * 5-level referral payout log — one row per ref_L1..L5 credit from a
 * paying downline. Idempotent: (fromUserId, level, sourceKind, sourceId)
 * uniquely identifies the earning event so replays don't double-pay.
 */
export const referralAccruals = pgTable(
  'referral_accruals',
  {
    id: serial('id').primaryKey(),
    recipientUserId: integer('recipient_user_id')
      .notNull()
      .references(() => users.id),
    fromUserId: integer('from_user_id')
      .notNull()
      .references(() => users.id),
    level: integer('level').notNull(),
    sourceKind: text('source_kind').notNull(),
    sourceId: integer('source_id'),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    ledgerId: integer('ledger_id').references(() => cashLedger.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_ref_accr_recipient').on(t.recipientUserId, t.createdAt),
    uniqueIndex('uniq_ref_accr_source').on(t.fromUserId, t.level, t.sourceKind, t.sourceId),
  ],
);

/**
 * Per-user task completions. `dayBucket` is the UTC date of completion;
 * the daily-cap service sums `rewardMicro` grouped by (user_id, day_bucket)
 * against the user's tariff.daily_cap_micro.
 */
export const taskCompletions = pgTable(
  'task_completions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    rewardMicro: bigint('reward_micro', { mode: 'bigint' }).notNull(),
    dayBucket: date('day_bucket').notNull(),
    ledgerId: integer('ledger_id').references(() => cashLedger.id),
    completedAt: timestamp('completed_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_task_completions_user_day').on(t.userId, t.dayBucket),
    uniqueIndex('uniq_task_completion').on(t.userId, t.taskId),
  ],
);

/**
 * Ad impressions — one row per rewarded ad view. Shares the daily cap
 * pool with task_completions (both sum into the same per-day bucket).
 */
export const adImpressions = pgTable(
  'ad_impressions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id'),
    rewardMicro: bigint('reward_micro', { mode: 'bigint' }).notNull(),
    dayBucket: date('day_bucket').notNull(),
    ledgerId: integer('ledger_id').references(() => cashLedger.id),
    watchedAt: timestamp('watched_at').notNull().defaultNow(),
  },
  (t) => [index('idx_ad_imp_user_day').on(t.userId, t.dayBucket)],
);

/**
 * Email+password credentials attached to a user. One row per user (unique).
 * Stored password is a bcrypt hash (cost 10). Email is lowercased on insert.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    emailVerified: boolean("email_verified").notNull().default(false),
    emailVerifiedAt: timestamp("email_verified_at"),
    emailVerifyToken: text("email_verify_token"),
    emailVerifySentAt: timestamp("email_verify_sent_at"),
  },
  (t) => [index('idx_credentials_email').on(t.email)],
);

/**
 * One-shot tokens for "Login via Telegram" flow. Client calls
 * /auth/tg-login-init (unauth) and gets {token, bot_link}. User opens bot
 * with /start login_<token>, bot calls /auth/tg-link-verify (internal secret)
 * which stamps tg_id + username + claimed_at. Client polls
 * /auth/tg-login-claim {token}; once claimed_at is set, server returns JWT
 * for the user and deletes the token.
 */
export const tgLoginTokens = pgTable(
  'tg_login_tokens',
  {
    token: text('token').primaryKey(),
    // Filled when the bot verifies. Resolving user_id happens at claim time.
    tgId: bigint('tg_id', { mode: 'number' }),
    tgUsername: text('tg_username'),
    claimedAt: timestamp('claimed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (t) => [index('idx_tg_login_tokens_expires').on(t.expiresAt)],
);

/**
 * Pre-launch place bookings. User picks a tariff + pays → one row here
 * with status 'pending' → webhook sets status='paid' + paidAt. Latest paid
 * booking per user = their locked tariff/place.
 */
export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tariffCode: text('tariff_code').notNull(),
    amountUsd: doublePrecision('amount_usd').notNull(),
    method: text('method').notNull(),               // 'cryptobot' | 'platega'
    invoiceId: integer('invoice_id').references(() => invoices.id),
    status: text('status').notNull().default('pending'), // pending | paid | canceled
    paidAt: timestamp('paid_at'),
    marketingProcessed: boolean('marketing_processed').default(false).notNull(),
    linearProcessed: boolean('linear_processed').default(false).notNull(),
    webUserId: integer('web_user_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_bookings_user_created').on(t.userId, t.createdAt),
    index('idx_bookings_status').on(t.status),
  ],
);

/**
 * Generic event log for user- and system-level activity. Every feature
 * phase writes here (drip steps delivered, events registered, nudges
 * fired, gamification points awarded, referral milestones, etc.) so we
 * have a single replayable timeline per user.
 *
 * `user_id` is nullable specifically so system events that aren't bound
 * to a user (cron heartbeats, admin ops, broadcasts) can share the table.
 * Schema-wise we reference `users.id` (integer) — the spec asked for uuid
 * but the existing user table has been serial/integer from day one and we
 * don't rewrite history in Phase 0.
 *
 * `payload` is jsonb so each event_type can attach whatever structured
 * detail the analyst/debugger needs without a column-per-feature.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_activity_log_user_time').on(t.userId, t.createdAt.desc()),
    index('idx_activity_log_event_time').on(t.eventType, t.createdAt.desc()),
  ],
);

/**
 * Durable outbox for scheduled user-facing notifications. Feature modules
 * (drip, nudge-stuck, event-reminder-1d, ...) insert rows with a future
 * `scheduled_at`; a single cron job in `jobs/` picks them up when due,
 * calls the bot notifier, and flips `status` to 'sent' / 'failed' /
 * 'skipped'.
 *
 * Reserved `kind` values so phases don't collide:
 *   drip_day0, drip_day1, drip_day3, drip_day7
 *   nudge_stuck
 *   event_reminder_1d, event_reminder_1h
 *   quest_unlocked
 *   payment_retry
 * Feature agents may add more — keep them kebab_case, stable forever.
 *
 * Indexes:
 *   (status, scheduled_at) — due-picker scan.
 *   partial unique (user_id, kind) where status='pending' — prevents
 *     double-scheduling the same drip step for the same user.
 */
export const scheduledNotifications = pgTable(
  'scheduled_notifications',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
  },
  (t) => [
    index('idx_sched_notif_status_time').on(t.status, t.scheduledAt),
    uniqueIndex('uniq_sched_notif_pending_user_kind')
      .on(t.userId, t.kind)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export type ActivityLog = typeof activityLog.$inferSelect;
export type NewActivityLog = typeof activityLog.$inferInsert;
export type ScheduledNotification = typeof scheduledNotifications.$inferSelect;
export type NewScheduledNotification = typeof scheduledNotifications.$inferInsert;

// ---------------------------------------------------------------------------
// Phase 1A — Referral + Team CRM + Challenges
// ---------------------------------------------------------------------------

/**
 * User-owned referral code used for the `?start=ref_<code>` deep-link.
 * Separate from `users.ref_code` — the main column is the legacy 5-level
 * rewards code. This one is the Phase 1A funnel code (invited/joined/
 * active/booked/paid) so we can add sharing features, rotate codes, and
 * track issuance events independently of the rewards engine.
 */
export const referralCodes = pgTable(
  'referral_codes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_referral_codes_user').on(t.userId)],
);

/**
 * Phase 1A funnel record per (referrer, invitee). `stage` progresses
 * invited → joined → active → booked → paid with dormant/lost as terminal
 * states. `source` is a free-text origin tag (bot/link/tma/landing/etc).
 * A user can only be "invited by" one referrer at a time — hence the
 * unique key. If they arrive via a second referrer we keep the original.
 */
export const referrals = pgTable(
  'referrals',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    referrerId: integer('referrer_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    inviteeId: integer('invitee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull().default('invited'),
    stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_referrals_pair').on(t.referrerId, t.inviteeId),
    index('idx_referrals_referrer_stage').on(t.referrerId, t.stage),
    index('idx_referrals_invitee').on(t.inviteeId),
    index('idx_referrals_stage_time').on(t.stage, t.stageChangedAt),
  ],
);

/**
 * Active challenge rows (e.g. `invite_3_in_7d`). Only one ACTIVE row per
 * (user, challenge) is allowed — completed rows (completed_at IS NOT NULL)
 * stay for history so the user sees the medal/badge they earned. The
 * partial unique index enforces this without blocking re-entry after
 * completion.
 */
export const referralChallenges = pgTable(
  'referral_challenges',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id').notNull(),
    goal: integer('goal').notNull(),
    progress: integer('progress').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_active_challenge_per_user')
      .on(t.userId, t.challengeId)
      .where(sql`${t.completedAt} IS NULL`),
    index('idx_challenges_user_time').on(t.userId, t.createdAt.desc()),
    index('idx_challenges_expires').on(t.expiresAt),
  ],
);

/**
 * Badges earned by a user. `payload` carries extra context (e.g. the
 * challenge_id that minted the badge, count thresholds, etc). Unique
 * per (user, badge_id) so we never award the same medal twice.
 */
export const userBadges = pgTable(
  'user_badges',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    badgeId: text('badge_id').notNull(),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull().default({}),
  },
  (t) => [
    uniqueIndex('uniq_user_badge').on(t.userId, t.badgeId),
    index('idx_user_badges_user_time').on(t.userId, t.earnedAt.desc()),
  ],
);

/**
 * Partner-owned note on a single referral contact. Free-text with an
 * optional `next_contact_at` reminder timestamp — the next-actions cron
 * can surface "follow-up due" rows off this.
 */
export const teamContactNotes = pgTable(
  'team_contact_notes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ownerUserId: integer('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    contactUserId: integer('contact_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    note: text('note').notNull(),
    nextContactAt: timestamp('next_contact_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_team_notes_owner_next').on(t.ownerUserId, t.nextContactAt),
    index('idx_team_notes_owner_contact').on(t.ownerUserId, t.contactUserId),
  ],
);

/**
 * Partner's daily "who to contact" feed — populated by the team-next-
 * actions cron. `priority` higher = more urgent (simple integer instead
 * of an enum so we can re-rank without migrations). `done_at` clears the
 * action off the active feed without deleting it (keeps audit trail).
 */
export const teamNextActions = pgTable(
  'team_next_actions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ownerUserId: integer('owner_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    targetUserId: integer('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    reason: text('reason').notNull(),
    priority: integer('priority').notNull().default(5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp('done_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_team_actions_owner_active')
      .on(t.ownerUserId, t.doneAt, t.priority.desc()),
    index('idx_team_actions_target').on(t.targetUserId),
  ],
);

export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type ReferralChallenge = typeof referralChallenges.$inferSelect;
export type NewReferralChallenge = typeof referralChallenges.$inferInsert;
export type UserBadge = typeof userBadges.$inferSelect;
export type NewUserBadge = typeof userBadges.$inferInsert;
export type TeamContactNote = typeof teamContactNotes.$inferSelect;
export type NewTeamContactNote = typeof teamContactNotes.$inferInsert;
export type TeamNextAction = typeof teamNextActions.$inferSelect;
export type NewTeamNextAction = typeof teamNextActions.$inferInsert;

export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
export type TgLoginToken = typeof tgLoginTokens.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

/**
 * Phase 1B — Events + Welcome Drip + Auto-Nudge + Weekly Digest.
 *
 * Appended (never re-ordered) so other phase worktrees rebase cleanly.
 * No migration generated here — owner batches all Phase 1 tables into a
 * single migration after the four worktrees merge.
 */

/**
 * Live "meetings" / webinars hosted on the platform. `speakers` is a json
 * array of display names (kept freeform so we don't need a speakers table
 * for v1). `tags` is a pg text[] for filterable topics. `status` flow:
 *   draft → published → live → finished
 *   draft → published → cancelled
 * Only `published` rows are visible on the public /events list.
 */
export const events = pgTable(
  'events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    title: text('title').notNull(),
    topic: text('topic'),
    description: text('description'),
    speakers: jsonb('speakers').notNull().default([]),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull().default(60),
    joinUrl: text('join_url'),
    recordingUrl: text('recording_url'),
    status: text('status').notNull().default('draft'),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_events_status_starts').on(t.status, t.startsAt),
    index('idx_events_starts').on(t.startsAt),
  ],
);

/**
 * Which user registered for which event. Source tags the channel:
 *   'tg'       — inline registration from the bot
 *   'web'      — landing / cabinet
 *   'deep-link'— /start event_<id>
 * Unique (event_id, user_id) — one registration per user per event.
 */
export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: bigint('event_id', { mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('tg'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_event_reg_user').on(t.eventId, t.userId),
    index('idx_event_reg_event').on(t.eventId),
    index('idx_event_reg_user').on(t.userId),
  ],
);

/**
 * Dedup table for per-user event reminders. One row per (event, user, kind)
 * where kind is '24h' | '1h' | 'live'. The reminder job upserts here AFTER
 * scheduling/sending; a second attempt is a no-op thanks to the unique idx.
 */
export const eventRemindersSent = pgTable(
  'event_reminders_sent',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: bigint('event_id', { mode: 'number' })
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_event_reminder_sent').on(t.eventId, t.userId, t.kind),
  ],
);

/**
 * Per-user progress in the welcome drip. One row per user, created on
 * first `POST /users` (initDrip). `last_step_sent` starts at -1 — no
 * step delivered yet; the cron picks step 0 when elapsed >= 0.
 * `paused` lets ops pause the sequence for a user without deleting.
 * `completed_at` is stamped once the final step fires.
 */
export const dripState = pgTable(
  'drip_state',
  {
    userId: integer('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastStepSent: integer('last_step_sent').notNull().default(-1),
    lastStepAt: timestamp('last_step_at', { withTimezone: true }),
    paused: boolean('paused').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('idx_drip_state_last_step').on(t.lastStepAt)],
);

/**
 * Log of every nudge delivered. `reason` is the internal bucket the user
 * fell into (e.g. 'no_booking', 'no_referrals'). Unique-per-day prevents
 * multi-spam of the same kind on the same user in a single day.
 */
export const nudgeLog = pgTable(
  'nudge_log',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nudgeKind: text('nudge_kind').notNull(),
    reason: text('reason'),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_nudge_log_user_time').on(t.userId, t.sentAt.desc()),
    // Partial unique: same user + same kind only once per UTC day. Expr
    // index (date(sent_at)) is a GENERATED column in migration; Drizzle
    // treats the `sql` template as a raw expression.
    uniqueIndex('uniq_nudge_user_kind_day')
      .on(t.userId, t.nudgeKind, sql`((sent_at AT TIME ZONE 'UTC')::date)`),
  ],
);

/**
 * Weekly digest delivery log. `week_start` is a Monday in UTC; composite
 * PK (user_id, week_start) makes the send op naturally idempotent.
 */
export const digestLog = pgTable(
  'digest_log',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    weekStart: date('week_start').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('pk_digest_log').on(t.userId, t.weekStart),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type NewEventRegistration = typeof eventRegistrations.$inferInsert;
export type EventReminderSent = typeof eventRemindersSent.$inferSelect;
export type DripState = typeof dripState.$inferSelect;
export type NewDripState = typeof dripState.$inferInsert;
export type NudgeLog = typeof nudgeLog.$inferSelect;
export type NewNudgeLog = typeof nudgeLog.$inferInsert;
export type DigestLog = typeof digestLog.$inferSelect;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserWallet = typeof userWallets.$inferSelect;
export type WalletNonce = typeof walletNonces.$inferSelect;
export type InviteEdge = typeof inviteEdges.$inferSelect;
export type UserQuest = typeof userQuests.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type CashLedger = typeof cashLedger.$inferSelect;
export type NewCashLedger = typeof cashLedger.$inferInsert;
export type Tariff = typeof tariffs.$inferSelect;
export type NewTariff = typeof tariffs.$inferInsert;
export type UserTariff = typeof userTariffs.$inferSelect;
export type NewUserTariff = typeof userTariffs.$inferInsert;
export type MatrixPosition = typeof matrixPositions.$inferSelect;
export type NewMatrixPosition = typeof matrixPositions.$inferInsert;
export type MatrixAccrual = typeof matrixAccruals.$inferSelect;
export type NewMatrixAccrual = typeof matrixAccruals.$inferInsert;
export type ReferralAccrual = typeof referralAccruals.$inferSelect;
export type NewReferralAccrual = typeof referralAccruals.$inferInsert;
export type TaskCompletion = typeof taskCompletions.$inferSelect;
export type NewTaskCompletion = typeof taskCompletions.$inferInsert;
export type AdImpression = typeof adImpressions.$inferSelect;
export type NewAdImpression = typeof adImpressions.$inferInsert;

// ===========================================================================
// Phase 1C — Gamification (streaks / XP / quests / missions / quizzes)
// ===========================================================================
//
// All tables below are *additive* (append-only) to keep migrations in lockstep
// with other phase workers. None reference each other via FK so seed order is
// also flexible.
//
// NOTE: badges (streak_3 / streak_30 / streak_90) are written into the
// `user_badges` table owned by Phase 1A. We intentionally do NOT declare
// user_badges here — the worker owning it will add it. This file assumes the
// table name `user_badges` with columns (user_id int, badge_id text,
// earned_at timestamptz) and degrades gracefully: the register-action route
// wraps badge-grant INSERTs in try/catch, so the streak flow keeps working
// even before 1A lands.
// ---------------------------------------------------------------------------

/**
 * Per-user consecutive-action streak tracker. One row per user (PK = user_id).
 *
 * Semantics (see `/internal/gamification/register-action`):
 *   - last_action_at older than 48h       → streak resets to 1
 *   - last_action_at ≥ 24h && < 48h ago   → current_streak += 1
 *   - last_action_at < 24h ago            → no change (same-day action)
 *
 * The cron `streak-recompute.job.ts` runs hourly and zeroes out streaks that
 * have drifted past 48h without an action (so the UI shows 0 instead of a
 * stale non-zero until the next action).
 */
export const userStreaks = pgTable('user_streaks', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastActionAt: timestamp('last_action_at', { withTimezone: true }),
  lastActionType: text('last_action_type'),
});

/**
 * Aggregate XP + level per user. Level derivation is handled in application
 * code (see `services/xp.ts`). We only persist the totals — a view could be
 * computed on the fly but this keeps /me/gamification/xp cheap.
 */
export const userXp = pgTable('user_xp', {
  userId: integer('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalXp: integer('total_xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Library of structured quests. Seeded by `quests.seed.ts`. `criteria` is a
 * jsonb blob whose shape depends on `type`:
 *   { type: 'referral_count',        threshold: N }
 *   { type: 'booking_paid',          threshold: N }
 *   { type: 'streak_days',           threshold: N }
 *   { type: 'mission_completed',     mission_id: 'partner_7day_onboarding' }
 *   { type: 'quiz_completed',        quiz_id: 'onboarding_role' }
 *   { type: 'profile_filled',        fields: ['first_name','last_name'] }
 *   { type: 'manual' }                               // granted by admin only
 *
 * `orderIdx` controls display order inside a chapter. Column is named `order`
 * (quoted) in SQL — drizzle handles the identifier escaping.
 */
export const quests = pgTable(
  'quests',
  {
    id: text('id').primaryKey(),
    chapter: text('chapter').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    xp: integer('xp').notNull().default(0),
    criteria: jsonb('criteria').notNull().default({}),
    orderIdx: integer('order').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_quests_chapter_order').on(t.chapter, t.orderIdx)],
);

/**
 * Per-user quest progress log. PK on (user_id, quest_id) means each quest is
 * granted at most once per user (matches `repeatType: 'once'` from x-health).
 * `progress` counts upward toward `criteria.threshold`; when it hits threshold
 * we stamp `completed_at` + `xp_granted` and increment `user_xp.total_xp`.
 */
export const userQuestProgress = pgTable(
  'user_quest_progress',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questId: text('quest_id')
      .notNull()
      .references(() => quests.id, { onDelete: 'cascade' }),
    progress: integer('progress').notNull().default(0),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    xpGranted: integer('xp_granted').notNull().default(0),
  },
  (t) => [
    uniqueIndex('uniq_user_quest_progress').on(t.userId, t.questId),
    index('idx_uqp_user_completed').on(t.userId, t.completedAt),
  ],
);

/**
 * Mission template library. Seeded by `mission-templates.seed.ts`. A mission
 * is a linear, day-indexed programme (e.g. `partner_7day_onboarding`). Steps
 * shape:
 *   [{ day: 0, key: 'set_name',   title: '...', description: '...' },
 *    { day: 1, key: 'pick_role',  title: '...', description: '...' }, ...]
 *
 * `policy` (optional jsonb) tells the daily tick job whether to pause / reset
 * a user who falls behind. Default: pause after 3 days idle.
 */
export const missionTemplates = pgTable('mission_templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  steps: jsonb('steps').notNull().default([]),
  policy: jsonb('policy').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Per-user mission enrollment + step-complete log.
 * One row per (user, mission, day). Creating the row marks that day done.
 * Enrolment itself = a row with day = -1 (sentinel) so we can tell "enrolled
 * but hasn't marked anything yet" from "never enrolled".
 */
export const userMissions = pgTable(
  'user_missions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    missionId: text('mission_id').notNull(),
    day: integer('day').notNull(),
    stepKey: text('step_key'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('uniq_user_mission_day').on(t.userId, t.missionId, t.day),
    index('idx_user_missions_user').on(t.userId, t.missionId),
  ],
);

/**
 * Quiz library. Seeded by `quizzes.seed.ts`. Shape of `questions`:
 *   [
 *     { key: 'role',
 *       q: 'Who are you?',
 *       options: [
 *         { label: 'Business', score_map: { business: 2 } },
 *         { label: 'User',     score_map: { user: 2 } },
 *         { label: 'Partner',  score_map: { partner: 2 } },
 *       ]
 *     },
 *     ...
 *   ]
 *
 * `result_map` maps the bucket with the highest score to a recommendation
 * slug (e.g. { business: 'role_business_rec', user: 'role_user_rec' }).
 */
export const quizzes = pgTable('quizzes', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  questions: jsonb('questions').notNull().default([]),
  resultMap: jsonb('result_map').notNull().default({}),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Persisted quiz attempts. One row per submission (users may retake — we
 * append). `answers` is the full user response; `result` is the bucket slug
 * returned to the client.
 */
export const userQuizResponses = pgTable(
  'user_quiz_responses',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: text('quiz_id').notNull(),
    answers: jsonb('answers').notNull().default({}),
    result: text('result'),
    completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_user_quiz_resp_user').on(t.userId, t.quizId)],
);

export type UserStreak = typeof userStreaks.$inferSelect;
export type NewUserStreak = typeof userStreaks.$inferInsert;
export type UserXp = typeof userXp.$inferSelect;
export type NewUserXp = typeof userXp.$inferInsert;
export type Quest = typeof quests.$inferSelect;
export type NewQuest = typeof quests.$inferInsert;
export type UserQuestProgress = typeof userQuestProgress.$inferSelect;
export type NewUserQuestProgress = typeof userQuestProgress.$inferInsert;
export type MissionTemplate = typeof missionTemplates.$inferSelect;
export type NewMissionTemplate = typeof missionTemplates.$inferInsert;
export type UserMission = typeof userMissions.$inferSelect;
export type NewUserMission = typeof userMissions.$inferInsert;
export type Quiz = typeof quizzes.$inferSelect;
export type NewQuiz = typeof quizzes.$inferInsert;
export type UserQuizResponse = typeof userQuizResponses.$inferSelect;
export type NewUserQuizResponse = typeof userQuizResponses.$inferInsert;


/* -------------------- Phase 1D: promo / videos / monitoring / rate-limit -------------------- */

/**
 * Static-ish promo templates curated by admins. `id` is a stable slug (e.g.
 * `p_ref_hero`) so the bot/landing can reference templates by name without
 * worrying about numeric IDs shifting when rows are reordered. `hashtags` is
 * stored as a Postgres text[] so the landing can render chips directly.
 */
export const promoTemplates = pgTable('promo_templates', {
  id: text('id').primaryKey(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  defaultText: text('default_text').notNull(),
  imageUrl: text('image_url'),
  hashtags: text('hashtags').array(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * One row per QR code a user generates. `svg_data` is the base64-encoded SVG
 * payload so the cabinet can inline it without a second round-trip. `target_url`
 * is the encoded URL (ref link, invite, etc.) and `label` is a free-form hint.
 */
export const generatedQrcodes = pgTable(
  'generated_qrcodes',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetUrl: text('target_url').notNull(),
    svgData: text('svg_data').notNull(),
    label: text('label'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_qr_user_time').on(t.userId, t.createdAt)],
);

/**
 * Video library — YouTube / Telegram / direct MP4 URLs. `is_published` gates
 * visibility; `order` controls ordering in `GET /videos`. `created_by_user_id`
 * is the admin who added the row (audit trail).
 */
export const videos = pgTable('videos', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  durationSec: integer('duration_sec'),
  tags: text('tags').array(),
  isPublished: boolean('is_published').notNull().default(false),
  // `order` is reserved in SQL — the column name is quoted by Drizzle for us.
  order: integer('order').notNull().default(0),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const videoComments = pgTable(
  'video_comments',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    videoId: bigint('video_id', { mode: 'number' })
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_video_comments_video_time').on(t.videoId, t.createdAt)],
);

export const videoReactions = pgTable(
  'video_reactions',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    videoId: bigint('video_id', { mode: 'number' })
      .notNull()
      .references(() => videos.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: text('emoji').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('uniq_video_reaction').on(t.videoId, t.userId, t.emoji)],
);

/**
 * Telegram chats the bot monitors (group/supergroup admin added). `tracking`
 * selects what gets logged into `chat_events`:
 *   `members` — only join/leave
 *   `activity` — only messages
 *   `all`     — everything
 */
export const monitoredChats = pgTable('monitored_chats', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  chatId: bigint('chat_id', { mode: 'number' }).notNull().unique(),
  chatTitle: text('chat_title'),
  addedByUserId: integer('added_by_user_id').references(() => users.id),
  tracking: text('tracking').notNull().default('all'),
  active: boolean('active').notNull().default(true),
  addedAt: timestamp('added_at').notNull().defaultNow(),
});

export const chatEvents = pgTable(
  'chat_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    eventType: text('event_type').notNull(),
    userIdTg: bigint('user_id_tg', { mode: 'number' }),
    username: text('username'),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_chat_events_chat_time').on(t.chatId, t.createdAt)],
);

/**
 * Generic sliding-window rate-limit counters. `key` encodes scope + bucket
 * (e.g. `ip:1.2.3.4:login`). `window_start` + `count` describe the current
 * fixed window; `expires_at` lets the cleanup job prune stale rows in bulk.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
    count: integer('count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('idx_rate_limits_expires').on(t.expiresAt)],
);

export type PromoTemplate = typeof promoTemplates.$inferSelect;
export type NewPromoTemplate = typeof promoTemplates.$inferInsert;
export type GeneratedQrcode = typeof generatedQrcodes.$inferSelect;
export type NewGeneratedQrcode = typeof generatedQrcodes.$inferInsert;
export type Video = typeof videos.$inferSelect;
export type NewVideo = typeof videos.$inferInsert;
export type VideoComment = typeof videoComments.$inferSelect;
export type VideoReaction = typeof videoReactions.$inferSelect;
export type MonitoredChat = typeof monitoredChats.$inferSelect;
export type NewMonitoredChat = typeof monitoredChats.$inferInsert;
export type ChatEvent = typeof chatEvents.$inferSelect;
export type NewChatEvent = typeof chatEvents.$inferInsert;

/**
 * Business seats (1..N per user). A ROCKET tariff grants 3 paid seats,
 * but users may open unlimited additional seats under any paid tariff.
 * Monthly fee (5/seat) is tracked via .
 */
export const businessSeats = pgTable(
  'business_seats',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tariffId: integer('tariff_id')
      .notNull()
      .references(() => tariffs.id),
    seatIndex: integer('seat_index').notNull().default(1),
    activatedAt: timestamp('activated_at').notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at'),
    monthlyFeePaidUntil: timestamp('monthly_fee_paid_until'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('idx_seats_tariff').on(t.tariffId)],
);

/**
 * Matching Bonus ledger — only ROCKET holders receive. 10% of partner
 * accruals earned by their L1..L3 referrals. Keeps provenance so we can
 * reverse accruals if the source ledger entry is voided.
 */
export const matchingBonusLedger = pgTable(
  'matching_bonus_ledger',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    fromUserId: integer('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    lineDepth: integer('line_depth').notNull(),
    sourceFlowLedgerId: bigint('source_flow_ledger_id', { mode: 'bigint' }),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_matching_user').on(t.userId),
    index('idx_matching_from').on(t.fromUserId),
  ],
);

/**
 * Leader Pool distributions — biweekly snapshot. Period {1st..14th} paid on
 * 15th; {15th..end-of-month} paid on 1st of next month. Percent distribution
 * is 30/20/10/6/5/5/4/4/3/3/3/2/2/2/1 across top-15 partners by turnover.
 */
export const leaderPoolDistributions = pgTable(
  'leader_pool_distributions',
  {
    id: serial('id').primaryKey(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    totalPoolMicro: bigint('total_pool_micro', { mode: 'bigint' }).notNull().default(0n),
    status: text('status').notNull().default('pending'),
    distributedAt: timestamp('distributed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
);

export const leaderPoolAwards = pgTable(
  'leader_pool_awards',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    distributionId: integer('distribution_id')
      .notNull()
      .references(() => leaderPoolDistributions.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull(),
    percentBp: integer('percent_bp').notNull(),
    amountMicro: bigint('amount_micro', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('idx_leader_awards_user').on(t.userId),
    index('idx_leader_awards_dist').on(t.distributionId),
  ],
);


