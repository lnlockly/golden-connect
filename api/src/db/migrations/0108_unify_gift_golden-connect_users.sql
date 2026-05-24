-- =====================================================================
-- 0108: Унификация gift ↔ golden-connect юзеров (часть A — создание юзеров)
-- =====================================================================
-- Каждый ГЛАВНЫЙ gift-аккаунт (main_user_id IS NULL) должен иметь
-- соответствующего golden-connect users-юзера, чтобы работало пополнение
-- Основного баланса (списание с working) и единая идентичность.
--
-- Решения пользователя:
--   - 1 golden-connect-юзер на telegram tg_id; дубли главных по tg → схлопнуть
--     в канонический (MIN id), лишние трактуем как мульти.
--   - Новые юзеры заводятся «пустыми»: балансы 0, тариф free (дефолты).
--   - ref_code = 'tg' || tg_id (формат как у существующих).
-- Идемпотентно: создаём только для golden-connect_user_id IS NULL.
-- =====================================================================

-- Шаг 0: дубли главных с одинаковым tg → лишние превращаем в мульти
WITH tg_canon AS (
  SELECT telegram_chat_id, MIN(id) AS canon_id
  FROM gift_users
  WHERE main_user_id IS NULL AND telegram_chat_id ~ '^[0-9]+$'
  GROUP BY telegram_chat_id
  HAVING COUNT(*) > 1
)
UPDATE gift_users gu
SET main_user_id = c.canon_id, updated_at = NOW()
FROM tg_canon c
WHERE gu.main_user_id IS NULL
  AND gu.telegram_chat_id = c.telegram_chat_id
  AND gu.id <> c.canon_id;

-- Шаг 1: создать golden-connect users для непривязанных главных + проставить связь
WITH to_create AS (
  SELECT gu.id AS gift_id,
         NULLIF(gu.telegram_chat_id, '')::bigint AS tg,
         COALESCE(NULLIF(gu.name, ''), 'GiftUser')      AS fname,
         NULLIF(gu.telegram_username, '')               AS uname
  FROM gift_users gu
  WHERE gu.main_user_id IS NULL
    AND gu.golden-connect_user_id IS NULL
    AND gu.telegram_chat_id ~ '^[0-9]+$'
),
ins AS (
  INSERT INTO users (tg_id, ref_code, first_name, tg_username, gift_user_id, joined_at, last_seen_at)
  SELECT tc.tg, 'tg' || tc.tg::text, tc.fname, tc.uname, tc.gift_id, NOW(), NOW()
  FROM to_create tc
  ON CONFLICT (tg_id) DO NOTHING
  RETURNING id, gift_user_id
)
UPDATE gift_users gu
SET golden-connect_user_id = ins.id, updated_at = NOW()
FROM ins
WHERE gu.id = ins.gift_user_id;

-- Шаг 2: на случай tg, который уже есть в users (привязка без вставки)
UPDATE gift_users gu
SET golden-connect_user_id = u.id, updated_at = NOW()
FROM users u
WHERE gu.main_user_id IS NULL
  AND gu.golden-connect_user_id IS NULL
  AND gu.telegram_chat_id ~ '^[0-9]+$'
  AND u.tg_id = NULLIF(gu.telegram_chat_id, '')::bigint;

-- Шаг 3: обратная связь users.gift_user_id для уже привязанных (где пусто)
UPDATE users u
SET gift_user_id = gu.id
FROM gift_users gu
WHERE gu.golden-connect_user_id = u.id
  AND u.gift_user_id IS NULL;
