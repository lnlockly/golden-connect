-- =====================================================================
-- 0110: GIFT-аккаунты для чистых Trendex-юзеров (reverse-link)
-- =====================================================================
-- 10 trendex users без gift_user → создаём gift_users (0 балансы),
-- чтобы у каждого Trendex-юзера была единая GIFT-идентичность.
-- Размещаем как самостоятельные корни дерева (depth 0), вне общей сети.
-- Идемпотентно: только для users.gift_user_id IS NULL.
-- =====================================================================

WITH tofix AS (
  SELECT u.id AS uid, u.tg_id, u.first_name,
         ROW_NUMBER() OVER (ORDER BY u.id) AS rn
  FROM users u
  WHERE u.gift_user_id IS NULL
),
anchors AS (
  SELECT (SELECT COALESCE(MAX(gc_user_id), 0) FROM gift_users) AS max_gc,
         (SELECT COALESCE(MAX(rgt), 0) FROM gift_users)        AS max_rgt
),
ins AS (
  INSERT INTO gift_users (
    gc_user_id, uuid, role, name, telegram_chat_id, telegram_main_account,
    is_active_telegram, language, can_move_children, can_create_multi,
    multi_limit, show_children_depth, depth, lft, rgt,
    trendex_user_id, migrated_at, created_at, updated_at
  )
  SELECT a.max_gc + t.rn,
         'trendex-' || t.uid,
         'user',
         COALESCE(NULLIF(t.first_name, ''), 'TrendexUser'),
         CASE WHEN t.tg_id IS NOT NULL THEN t.tg_id::text ELSE NULL END,
         true, true, 'ru', false, false, 0, 0, 0,
         a.max_rgt + (t.rn * 2 - 1), a.max_rgt + (t.rn * 2),
         t.uid, NOW(), NOW(), NOW()
  FROM tofix t CROSS JOIN anchors a
  RETURNING id, trendex_user_id
)
UPDATE users u SET gift_user_id = ins.id
FROM ins WHERE u.id = ins.trendex_user_id;

-- нулевые строки Текущего (5) и Основного (6) для свежесозданных gift-юзеров
-- (точное совпадение uuid = 'trendex-<users.id>' — не задеваем старые trendex-* аккаунты)
INSERT INTO gift_balances (user_id, balance_type_id, balance, total, created_at, updated_at)
SELECT gu.id, t.bt, 0, 0, NOW(), NOW()
FROM gift_users gu
CROSS JOIN (VALUES (5), (6)) AS t(bt)
WHERE gu.trendex_user_id IS NOT NULL
  AND gu.uuid = 'trendex-' || gu.trendex_user_id::text
  AND NOT EXISTS (
    SELECT 1 FROM gift_balances gb WHERE gb.user_id = gu.id AND gb.balance_type_id = t.bt
  );
