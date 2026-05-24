-- =====================================================================
-- 0107: GIFT CLUB money bridge — 2-balance model (Основной=6 / Текущий=5)
-- =====================================================================
-- - Консолидируем дубли строк gift_balances для типов 5/6 в одну строку
--   на (user, type) — топап/перевод/вывод работают по единственной строке.
-- - gift_withdrawals: прямые заявки на выплату с Текущего баланса (тип 5).
-- - gift_money_log: аудит топапов/переводов/выводов.
-- Масштаб gift_balances = 1e8 (micro-USDT). Golden Connect working = 1e6.
-- =====================================================================

-- 1) консолидация дублей типов 5/6 → в строку с минимальным id
UPDATE gift_balances gb
SET balance = d.sum_bal, total = d.sum_total, updated_at = NOW()
FROM (
  SELECT user_id, balance_type_id, MIN(id) AS keep_id,
         SUM(balance) AS sum_bal, SUM(total) AS sum_total
  FROM gift_balances
  WHERE balance_type_id IN (5, 6)
  GROUP BY user_id, balance_type_id
  HAVING COUNT(*) > 1
) d
WHERE gb.id = d.keep_id;

DELETE FROM gift_balances gb
USING (
  SELECT user_id, balance_type_id, MIN(id) AS keep_id
  FROM gift_balances
  WHERE balance_type_id IN (5, 6)
  GROUP BY user_id, balance_type_id
  HAVING COUNT(*) > 1
) d
WHERE gb.user_id = d.user_id
  AND gb.balance_type_id = d.balance_type_id
  AND gb.id <> d.keep_id;

-- 2) заявки на вывод с Текущего баланса
CREATE TABLE IF NOT EXISTS gift_withdrawals (
  id              SERIAL PRIMARY KEY,
  gift_user_id    BIGINT  NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
  golden-connect_user_id INTEGER,
  amount_micro    BIGINT  NOT NULL,               -- 1e8 scale
  address         TEXT    NOT NULL,
  network         TEXT    NOT NULL DEFAULT 'TRC20',
  status          TEXT    NOT NULL DEFAULT 'pending', -- pending|approved|paid|rejected
  tx_hash         TEXT,
  notes           TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gift_withdrawals_user   ON gift_withdrawals(gift_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gift_withdrawals_status ON gift_withdrawals(status);

-- 3) аудит движений денег внутри GIFT
CREATE TABLE IF NOT EXISTS gift_money_log (
  id              SERIAL PRIMARY KEY,
  gift_user_id    BIGINT  NOT NULL,
  golden-connect_user_id INTEGER,
  kind            TEXT    NOT NULL,   -- topup | transfer | withdraw_hold | withdraw_refund
  from_type       INTEGER,
  to_type         INTEGER,
  amount_micro    BIGINT  NOT NULL,   -- 1e8 scale
  ref             TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gift_money_log_user ON gift_money_log(gift_user_id, created_at DESC);
