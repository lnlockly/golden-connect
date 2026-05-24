-- =====================================================================
-- 0109: Консолидация мульти-аккаунтов GIFT в главного (часть B)
-- =====================================================================
-- Мульти-аккаунт = доп. аккаунт того же человека (main_user_id IS NOT NULL).
-- Факты (проверено): все мульти разделяют golden-connect_user_id своего главного,
-- поэтому удаление мульти НЕ осиротит ни одного golden-connect-юзера.
--
-- Шаги:
--   0. Расплющить цепочки мульти→мульти (main_user_id → верхний главный).
--   1. Перепривязать users.gift_user_id с мульти → на главного (reverse-link).
--   2. Слить балансы мульти → в главного (все типы, единый таргет MIN id).
--   3. Перепривязать детей по ref_id с мульти → на главного.
--   4. Удалить мульти gift_users (каскады чистят их собств. записи).
-- Идемпотентно по сути: после выполнения мульти не остаётся.
-- =====================================================================

-- 0. расплющить цепочки мульти→мульти (глубина max 2 в данных)
UPDATE gift_users m
SET main_user_id = p.main_user_id, updated_at = NOW()
FROM gift_users p
WHERE m.main_user_id = p.id AND p.main_user_id IS NOT NULL;
-- повтор на случай более длинных цепочек
UPDATE gift_users m
SET main_user_id = p.main_user_id, updated_at = NOW()
FROM gift_users p
WHERE m.main_user_id = p.id AND p.main_user_id IS NOT NULL;

-- 1. reverse-link: users.gift_user_id, указывающий на мульти → на главного
UPDATE users u
SET gift_user_id = m.main_user_id
FROM gift_users m
WHERE u.gift_user_id = m.id AND m.main_user_id IS NOT NULL;

-- 2. слить балансы мульти → в главного
WITH multi_bal AS (
  SELECT m.main_user_id AS main_id, gb.balance_type_id AS bt,
         COALESCE(gb.ref_level_id, -1) AS rl,
         SUM(gb.balance) AS add_bal, SUM(gb.total) AS add_total
  FROM gift_balances gb
  JOIN gift_users m ON m.id = gb.user_id
  WHERE m.main_user_id IS NOT NULL
  GROUP BY 1, 2, 3
),
main_target AS (
  SELECT user_id AS main_id, balance_type_id AS bt, COALESCE(ref_level_id, -1) AS rl, MIN(id) AS keep_id
  FROM gift_balances
  GROUP BY 1, 2, 3
)
UPDATE gift_balances dst
SET balance = dst.balance + mb.add_bal, total = dst.total + mb.add_total, updated_at = NOW()
FROM multi_bal mb
JOIN main_target mt ON mt.main_id = mb.main_id AND mt.bt = mb.bt AND mt.rl = mb.rl
WHERE dst.id = mt.keep_id;

-- вставить балансы главному там, где у него ещё нет такой (type, ref_level)
INSERT INTO gift_balances (user_id, balance_type_id, ref_level_id, balance, total, created_at, updated_at)
SELECT mb.main_id, mb.bt, NULLIF(mb.rl, -1), mb.add_bal, mb.add_total, NOW(), NOW()
FROM (
  SELECT m.main_user_id AS main_id, gb.balance_type_id AS bt,
         COALESCE(gb.ref_level_id, -1) AS rl,
         SUM(gb.balance) AS add_bal, SUM(gb.total) AS add_total
  FROM gift_balances gb
  JOIN gift_users m ON m.id = gb.user_id
  WHERE m.main_user_id IS NOT NULL
  GROUP BY 1, 2, 3
) mb
WHERE NOT EXISTS (
  SELECT 1 FROM gift_balances dst
  WHERE dst.user_id = mb.main_id AND dst.balance_type_id = mb.bt
    AND COALESCE(dst.ref_level_id, -1) = mb.rl
);

-- 3. перепривязать детей по ref_id с мульти → на главного
UPDATE gift_users c
SET ref_id = m.main_user_id, updated_at = NOW()
FROM gift_users m
WHERE c.ref_id = m.id AND m.main_user_id IS NOT NULL;

-- 4. удалить мульти-аккаунты
DELETE FROM gift_users WHERE main_user_id IS NOT NULL;
