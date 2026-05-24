/**
 * /internal/admin/* — admin-only endpoints (gated by INTERNAL_API_SECRET).
 *
 * Cabinet exposes /api/admin/* proxies that:
 *   1. Check session.user.email is in ADMIN_EMAILS env or users.is_admin=true
 *   2. Forward to /internal/admin/* with secret
 *
 * Endpoints:
 *   GET  /internal/admin/stats          — aggregate balances, tariffs, withdrawals counts, history
 *   GET  /internal/admin/withdrawals    — pending/all withdrawals queue
 *   POST /internal/admin/withdrawals/:id/approve  — mark approved + send funds (manual transfer offline)
 *   POST /internal/admin/withdrawals/:id/reject   — refund balance + reject
 *   POST /internal/admin/matrix/launch  — placeholder for Phase 10 (matrix activation)
 */

import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { requireInternalSecret } from '../middleware/internal.js';
import { sendNotification } from '../services/balances.js';
import { launchMatrixBackfill, isMatrixLaunched } from '../services/matrix-launch.js';
import { processPendingMpMatrix } from '../services/mp-matrix-process.js';
import { logger } from '../lib/logger.js';

const app = new Hono();

app.use('/internal/admin/*', requireInternalSecret);

// ════════════════════════════════════════════════════════
// AGGREGATE STATISTICS — Golden Connect dashboard
// ════════════════════════════════════════════════════════

app.get('/internal/admin/stats', async (c) => {
  // Sum balances across all users
  const balances = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS total_users,
      COUNT(*) FILTER (WHERE active_tariff_code != 'free')::int AS paid_users,
      COUNT(*) FILTER (WHERE active_tariff_code = 'free')::int AS free_users,
      COUNT(*) FILTER (WHERE active_tariff_code = 'launch')::int AS launch_users,
      COUNT(*) FILTER (WHERE active_tariff_code = 'boost')::int AS boost_users,
      COUNT(*) FILTER (WHERE active_tariff_code = 'rocket')::int AS rocket_users,
      COUNT(*) FILTER (WHERE partner_status = true)::int AS partner_users,
      SUM(gift_balance_micro)::bigint AS gift_total_micro,
      SUM(subscription_balance_micro)::bigint AS subscription_total_micro,
      SUM(karma_points)::bigint AS karma_total_points
    FROM users
    WHERE is_blocked = false
  `)) as unknown as Array<{
    total_users: number; paid_users: number; free_users: number;
    launch_users: number; boost_users: number; rocket_users: number;
    partner_users: number;
    gift_total_micro: string | number;
    subscription_total_micro: string | number;
    karma_total_points: string | number;
  }>;

  // Working balance total (sum of cash_ledger)
  const working = (await db.execute(sql`
    SELECT COALESCE(SUM(amount_micro), 0)::bigint AS total
    FROM cash_ledger
  `)) as unknown as Array<{ total: string | number }>;

  // Earnings totals by source kind (last 30 days)
  const earnings = (await db.execute(sql`
    SELECT kind, SUM(amount_micro)::bigint AS total
    FROM cash_ledger
    WHERE amount_micro > 0
      AND kind IN ('task_reward', 'ad_view', 'ref_L1', 'ref_L2', 'ref_L3', 'ref_L4', 'ref_L5',
                   'ref_L6', 'ref_L7', 'ref_L8', 'ref_L9', 'ref_L10',
                   'matching_bonus', 'leader_pool_prize', 'karma_raffle_prize')
      AND created_at >= NOW() - INTERVAL '30 days'
    GROUP BY kind
    ORDER BY SUM(amount_micro) DESC
  `)) as unknown as Array<{ kind: string; total: string | number }>;

  // Pending withdrawals
  const withdrawals = (await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE kind = 'withdraw_pending')::int AS pending_count,
      COALESCE(SUM(ABS(amount_micro)) FILTER (WHERE kind = 'withdraw_pending'), 0)::bigint AS pending_total_micro,
      COUNT(*) FILTER (WHERE kind = 'withdraw_approved')::int AS approved_count,
      COALESCE(SUM(ABS(amount_micro)) FILTER (WHERE kind = 'withdraw_approved'), 0)::bigint AS approved_total_micro
    FROM cash_ledger
    WHERE kind LIKE 'withdraw_%'
  `)) as unknown as Array<{
    pending_count: number; pending_total_micro: string | number;
    approved_count: number; approved_total_micro: string | number;
  }>;

  // Tariff expiring in next 7 days
  const expiring = (await db.execute(sql`
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(t.monthly_fee_micro), 0)::bigint AS potential_renewal_micro
    FROM users u
    LEFT JOIN tariffs t ON t.code = u.active_tariff_code
    WHERE u.active_tariff_code != 'free'
      AND u.tariff_expires_at IS NOT NULL
      AND u.tariff_expires_at < NOW() + INTERVAL '7 days'
  `)) as unknown as Array<{ n: number; potential_renewal_micro: string | number }>;

  // Daily new users last 14 days (for chart)
  const dailyNew = (await db.execute(sql`
    SELECT DATE(joined_at)::text AS day, COUNT(*)::int AS n
    FROM users
    WHERE joined_at >= NOW() - INTERVAL '14 days'
    GROUP BY DATE(joined_at)
    ORDER BY DATE(joined_at)
  `)) as unknown as Array<{ day: string; n: number }>;

  return c.json({
    ok: true,
    users: {
      total: balances[0].total_users,
      free: balances[0].free_users,
      launch: balances[0].launch_users,
      boost: balances[0].boost_users,
      rocket: balances[0].rocket_users,
      paid: balances[0].paid_users,
      partner_status: balances[0].partner_users,
    },
    balances_total: {
      working_micro: String(working[0]?.total ?? 0),
      working_usd: Number(working[0]?.total ?? 0) / 1e6,
      gift_micro: String(balances[0].gift_total_micro),
      gift_usd: Number(balances[0].gift_total_micro) / 1e6,
      subscription_micro: String(balances[0].subscription_total_micro),
      subscription_usd: Number(balances[0].subscription_total_micro) / 1e6,
      karma_points: String(balances[0].karma_total_points),
    },
    earnings_30d: earnings.map(e => ({
      kind: e.kind,
      total_usd: Number(e.total) / 1e6,
    })),
    withdrawals: {
      pending_count: withdrawals[0].pending_count,
      pending_usd: Number(withdrawals[0].pending_total_micro) / 1e6,
      approved_count: withdrawals[0].approved_count,
      approved_usd: Number(withdrawals[0].approved_total_micro) / 1e6,
    },
    expiring_7d: {
      count: expiring[0].n,
      potential_revenue_usd: Number(expiring[0].potential_renewal_micro) / 1e6,
    },
    daily_new_users: dailyNew,
  });
});

// ════════════════════════════════════════════════════════
// WITHDRAWALS QUEUE
// ════════════════════════════════════════════════════════

app.get('/internal/admin/withdrawals', async (c) => {
  const status = String(c.req.query('status') || 'pending');
  const kind = status === 'pending' ? 'withdraw_pending'
    : status === 'approved' ? 'withdraw_approved'
    : status === 'rejected' ? 'withdraw_rejected'
    : 'withdraw_pending';

  const rows = (await db.execute(sql`
    SELECT
      l.id, l.user_id, l.amount_micro, l.memo, l.created_at,
      u.tg_username, u.tg_id, u.ref_code
    FROM cash_ledger l
    JOIN users u ON u.id = l.user_id
    WHERE l.kind = ${kind}
    ORDER BY l.created_at DESC
    LIMIT 200
  `)) as unknown as Array<{
    id: number; user_id: number; amount_micro: string | number; memo: string;
    created_at: string; tg_username: string | null; tg_id: number | null; ref_code: string;
  }>;

  return c.json({
    ok: true,
    items: rows.map(r => ({
      id: r.id,
      user_id: r.user_id,
      tg_username: r.tg_username, tg_id: r.tg_id, ref_code: r.ref_code,
      amount_usd: Math.abs(Number(r.amount_micro)) / 1e6,
      memo: r.memo,
      created_at: r.created_at,
    })),
  });
});

app.post('/internal/admin/withdrawals/:id/approve', async (c) => {
  const ledgerId = Number(c.req.param('id'));
  const r = (await db.execute(sql`
    SELECT id, user_id, amount_micro, memo FROM cash_ledger
    WHERE id = ${ledgerId} AND kind = 'withdraw_pending' LIMIT 1
  `)) as unknown as Array<{ id: number; user_id: number; amount_micro: string | number; memo: string }>;
  if (!r[0]) return c.json({ ok: false, reason: 'not_found_or_already_processed' }, 404);

  // Mark as approved (rename kind)
  await db.execute(sql`UPDATE cash_ledger SET kind = 'withdraw_approved' WHERE id = ${ledgerId}`);
  await sendNotification({
    userId: r[0].user_id,
    kind: 'withdraw_approved',
    severity: 'success',
    title: '✅ Вывод одобрен',
    body: `Заявка на $${Math.abs(Number(r[0].amount_micro)) / 1e6} одобрена.\nСредства поступят в течение 24ч.`,
    url: '/cabinet/cabinet#/finance',
  });
  return c.json({ ok: true });
});

app.post('/internal/admin/withdrawals/:id/reject', async (c) => {
  const ledgerId = Number(c.req.param('id'));
  const body = await c.req.json().catch(() => ({}));
  const reason = String(body.reason || 'no reason given').slice(0, 500);

  const r = (await db.execute(sql`
    SELECT id, user_id, amount_micro, memo FROM cash_ledger
    WHERE id = ${ledgerId} AND kind = 'withdraw_pending' LIMIT 1
  `)) as unknown as Array<{ id: number; user_id: number; amount_micro: string | number; memo: string }>;
  if (!r[0]) return c.json({ ok: false, reason: 'not_found_or_already_processed' }, 404);

  // Refund: write +amount as withdraw_refund (which credits working balance)
  await db.transaction(async (tx) => {
    await tx.execute(sql`UPDATE cash_ledger SET kind = 'withdraw_rejected' WHERE id = ${ledgerId}`);
    await tx.execute(sql`
      INSERT INTO cash_ledger (user_id, kind, amount_micro, memo)
      VALUES (${r[0].user_id}, 'withdraw_refund', ${Math.abs(Number(r[0].amount_micro))},
              ${'refund of #' + ledgerId + ': ' + reason})
    `);
  });
  await sendNotification({
    userId: r[0].user_id,
    kind: 'withdraw_rejected',
    severity: 'error',
    title: '⚠️ Заявка на вывод отклонена',
    body: `Сумма $${Math.abs(Number(r[0].amount_micro)) / 1e6} возвращена на 🟢 Основной баланс.\nПричина: ${reason}`,
    url: '/cabinet/cabinet#/finance',
  });
  return c.json({ ok: true });
});

// ════════════════════════════════════════════════════════
// MATRIX LAUNCH (Phase 10 placeholder — does nothing yet)
// ════════════════════════════════════════════════════════

app.get('/internal/admin/matrix/status', async (c) => {
  const launched = await isMatrixLaunched();
  return c.json({ ok: true, launched });
});

app.post('/internal/admin/matrix/launch', async (c) => {
  // Phase 10: backfill all business_seats into matrix + flip frozen flag.
  const body = await c.req.json().catch(() => ({}));
  if (!body.confirm) return c.json({ ok: false, reason: 'confirmation_required' }, 400);
  if (await isMatrixLaunched()) {
    return c.json({ ok: false, reason: 'already_launched' }, 400);
  }
  const result = await launchMatrixBackfill();
  logger.warn(result, 'admin: matrix launched (full)');
  return c.json({ ok: true, ...result });
});


app.post('/internal/admin/marketplace/process-pending', async (c) => {
  if (!await isMatrixLaunched()) {
    return c.json({ ok: false, error: 'matrix_not_launched' }, 400);
  }
  try {
    const r = await processPendingMpMatrix();
    return c.json({ ok: true, ...r });
  } catch (e: any) {
    return c.json({ ok: false, error: e.message }, 500);
  }
});

export default app;
