import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { requireInternalSecret } from '../middleware/internal.js';
import { db } from '../db/client.js';

const app = new Hono();
app.use('/internal/*', requireInternalSecret);

/**
 * GET /internal/payments?limit=20
 *
 * Powers the bot's /payments admin view. Returns the most recent paid
 * tariff entries — the inbound `entry_fee` rows in cash_ledger — joined
 * with user + tariff metadata so the bot can render everything without a
 * second round-trip.
 *
 * We parse `method` + `payment_ref` from the ledger memo (which the webhook
 * writes as `entry_payment:<provider>:<id>`). Matrix position is pulled
 * from matrix_positions for the paying user. USD is derived from
 * cash_ledger.amount_micro (negative) / -1_000_000.
 *
 * Totals (aggregate over the same memo prefix, without the limit) are
 * included for the header line in the Telegram message.
 */

interface PaymentRow {
  id: number;
  method: 'cryptobot' | 'platega' | 'other';
  tariff_code: string | null;
  entry_usd: number;
  user_id: number;
  user_tg_id: number | null;
  user_username: string | null;
  user_first_name: string | null;
  matrix_position: number | null;
  paid_at_iso: string;
  payment_ref: string;
}

function parseMemo(memo: string | null): {
  method: PaymentRow['method'];
  ref: string;
} {
  if (!memo) return { method: 'other', ref: '' };
  // Expected shape: `entry_payment:<provider>:<id>` or
  // `entry_payment:tariff:<id>` (legacy fallback with no provider).
  const rest = memo.startsWith('entry_payment:')
    ? memo.slice('entry_payment:'.length)
    : memo;
  const colon = rest.indexOf(':');
  if (colon === -1) {
    return { method: 'other', ref: rest };
  }
  const provider = rest.slice(0, colon);
  if (provider === 'cryptobot' || provider === 'platega') {
    return { method: provider, ref: rest };
  }
  return { method: 'other', ref: rest };
}

app.get('/internal/payments', async (c) => {
  const limit = Math.max(
    1,
    Math.min(100, Number(c.req.query('limit') ?? 20) || 20),
  );

  const rows = await db.execute<{
    id: number;
    amount_micro: string;
    memo: string | null;
    created_at: Date;
    user_id: number;
    user_tg_id: string | null;
    user_username: string | null;
    user_first_name: string | null;
    tariff_code: string | null;
    matrix_position: number | null;
  }>(sql`
    SELECT
      cl.id AS id,
      cl.amount_micro::text AS amount_micro,
      cl.memo AS memo,
      cl.created_at AS created_at,
      cl.user_id AS user_id,
      u.tg_id::text AS user_tg_id,
      u.tg_username AS user_username,
      u.first_name AS user_first_name,
      (
        SELECT t.code FROM tariffs t
        JOIN user_tariffs ut ON ut.tariff_id = t.id
        WHERE ut.user_id = cl.user_id
          AND ut.active_since <= cl.created_at
        ORDER BY ut.active_since DESC
        LIMIT 1
      ) AS tariff_code,
      mp.position AS matrix_position
    FROM cash_ledger cl
    LEFT JOIN users u ON u.id = cl.user_id
    LEFT JOIN matrix_positions mp ON mp.user_id = cl.user_id
    WHERE cl.kind = 'entry_fee'
    ORDER BY cl.created_at DESC, cl.id DESC
    LIMIT ${limit}
  `);

  const totalsRow = await db.execute<{ cnt: string | null; sum_micro: string | null }>(sql`
    SELECT
      COUNT(*)::text AS cnt,
      COALESCE(SUM(-amount_micro), 0)::text AS sum_micro
    FROM cash_ledger
    WHERE kind = 'entry_fee'
  `);
  const total = Number(totalsRow[0]?.cnt ?? '0');
  const totalUsd = Number(totalsRow[0]?.sum_micro ?? '0') / 1_000_000;

  const payments: PaymentRow[] = rows.map((r) => {
    const micro = BigInt(r.amount_micro);
    // amount_micro is stored negative for the payer's debit side — flip.
    const usdMicro = micro < 0n ? -micro : micro;
    const { method, ref } = parseMemo(r.memo);
    return {
      id: Number(r.id),
      method,
      tariff_code: r.tariff_code ?? null,
      entry_usd: Number(usdMicro) / 1_000_000,
      user_id: Number(r.user_id),
      user_tg_id: r.user_tg_id ? Number(r.user_tg_id) : null,
      user_username: r.user_username ?? null,
      user_first_name: r.user_first_name ?? null,
      matrix_position:
        r.matrix_position === null ? null : Number(r.matrix_position),
      paid_at_iso: new Date(r.created_at).toISOString(),
      payment_ref: ref,
    };
  });

  return c.json({ ok: true, payments, total, total_usd: totalUsd });
});

export default app;
