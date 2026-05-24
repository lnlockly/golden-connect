-- =====================================================================
-- GiftClub → Trendex migration: gift_* schema
-- Target: Trendex Neon Postgres (public schema)
-- Created: 2026-05-19
-- =====================================================================
-- Перенос всех бизнес-данных GiftClub (22625 юзеров, ~127k балансов,
-- статусы Дарителя/Лидера/Активности, реф-дерево NestedSet).
-- НЕ переносим: operations (158M), circle_queues (2.2M), top_ups, outputs,
-- auto_schedules, donate-механика (Circle*, AutoService).
--
-- ID-стратегия:
--   gift_users.id = bigint, генерируется новой sequence
--   gift_users.gc_user_id = bigint, оригинальный id из MySQL.users
--   gift_users.trendex_user_id = FK→users.id (NULL для не-дублей)
--   Все FK gift_balances/giver_levels/referals и т.д. идут на gift_users.id
--
-- Money cast:
--   В GiftClub bigint micro-USDT (×10^8). В Postgres сохраняем как bigint
--   (Postgres bigint выдерживает до ~9.2 × 10^18).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. gift_users — основная таблица с юзерами GiftClub
-- ---------------------------------------------------------------------
CREATE TABLE gift_users (
    id                       BIGSERIAL PRIMARY KEY,
    gc_user_id               BIGINT NOT NULL UNIQUE,        -- оригинальный id из MySQL.users
    trendex_user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL, -- линк к Trendex, NULL если дубль не найден
    uuid                     UUID NOT NULL UNIQUE,
    role                     VARCHAR(32) NOT NULL DEFAULT 'user',
    ip                       VARCHAR(45),
    name                     VARCHAR(255),
    surname                  VARCHAR(255),
    -- multi-account фича GiftClub: один TG chat_id, несколько профилей
    main_user_id             BIGINT REFERENCES gift_users(id) ON DELETE CASCADE,
    ref_id                   BIGINT REFERENCES gift_users(id) ON DELETE SET NULL,
    -- Telegram
    telegram_main_account    BOOLEAN NOT NULL DEFAULT TRUE,
    telegram_username        VARCHAR(255),
    telegram_chat_id         VARCHAR(255),
    avatar_path              VARCHAR(255),
    is_active_telegram       BOOLEAN NOT NULL DEFAULT TRUE,
    block_telegram_reason    VARCHAR(255),
    language                 VARCHAR(8) NOT NULL DEFAULT 'en',
    -- auth
    email                    VARCHAR(255),
    email_verified_at        TIMESTAMP,
    password                 VARCHAR(255),                  -- bcrypt hash (для login)
    financial_password       VARCHAR(255),                  -- bcrypt hash (для финопераций)
    -- wallets
    bep20_wallet             VARCHAR(255),
    trc20_wallet             VARCHAR(255),
    -- permissions
    can_move_children        BOOLEAN NOT NULL DEFAULT FALSE,
    can_create_multi         BOOLEAN NOT NULL DEFAULT FALSE,
    multi_limit              SMALLINT NOT NULL DEFAULT 1,
    show_children_depth      SMALLINT NOT NULL DEFAULT 1,
    -- 2FA (если использовалось)
    two_factor_secret        TEXT,
    two_factor_recovery_codes TEXT,
    two_factor_confirmed_at  TIMESTAMP,
    remember_token           VARCHAR(100),
    -- NestedSet (kalnoy/nestedset формат)
    depth                    SMALLINT NOT NULL DEFAULT 0,
    lft                      INTEGER NOT NULL DEFAULT 0,
    rgt                      INTEGER NOT NULL DEFAULT 0,
    -- timestamps
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP,
    -- миграционные мета
    migrated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gift_users_gc_id            ON gift_users(gc_user_id);
CREATE INDEX idx_gift_users_trendex_id       ON gift_users(trendex_user_id) WHERE trendex_user_id IS NOT NULL;
CREATE INDEX idx_gift_users_tg_chat_id       ON gift_users(telegram_chat_id);
CREATE INDEX idx_gift_users_email            ON gift_users(email);
CREATE INDEX idx_gift_users_ref_id           ON gift_users(ref_id);
CREATE INDEX idx_gift_users_main_user_id     ON gift_users(main_user_id);
CREATE INDEX idx_gift_users_lft_rgt          ON gift_users(lft, rgt);
CREATE INDEX idx_gift_users_depth            ON gift_users(depth);

COMMENT ON TABLE gift_users IS 'GiftClub юзера импортированы из MySQL.users + 200 Trendex-юзеров с trendex_user_id заполненным. main_user_id для multi-аккаунтов (Vitaliy = id 2 имеет 20+ multi).';
COMMENT ON COLUMN gift_users.gc_user_id IS 'Оригинальный ID из giftclub.users — используется для миграции связей и сохранения истории';
COMMENT ON COLUMN gift_users.trendex_user_id IS 'NULL для чистых GiftClub-юзеров; INTEGER для дублей и для новых Trendex-юзеров';

-- ---------------------------------------------------------------------
-- 2. gift_balance_types — справочник типов балансов
-- ---------------------------------------------------------------------
CREATE TABLE gift_balance_types (
    id                       SERIAL PRIMARY KEY,
    gc_balance_type_id       INTEGER NOT NULL UNIQUE,       -- id из MySQL.balance_types
    name                     VARCHAR(255) NOT NULL,         -- "GIFT Income", "GIFT Top-Up", и т.д.
    description              VARCHAR(255),
    currency                 VARCHAR(32) NOT NULL,          -- "USDT"
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

COMMENT ON TABLE gift_balance_types IS '~22 типа балансов GiftClub. После импорта names префиксируются "GIFT".';

-- ---------------------------------------------------------------------
-- 3. gift_balances — балансы юзеров (127k записей)
-- ---------------------------------------------------------------------
CREATE TABLE gift_balances (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    balance_type_id          INTEGER NOT NULL REFERENCES gift_balance_types(id) ON DELETE CASCADE,
    ref_level_id             INTEGER,                       -- NULL для не-ref балансов (FK добавим на gift_ref_levels)
    circle_id                INTEGER,                       -- историческое поле, оставляем для аудита
    from_user_id             BIGINT REFERENCES gift_users(id) ON DELETE SET NULL,
    week                     SMALLINT,
    balance                  BIGINT NOT NULL DEFAULT 0,     -- micro-USDT (×10^8)
    total                    BIGINT NOT NULL DEFAULT 0,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- Уникальность как в MySQL: один баланс на (юзер, тип, ref-уровень)
CREATE UNIQUE INDEX uq_gift_balances_user_type_ref ON gift_balances(user_id, balance_type_id, COALESCE(ref_level_id, 0));
CREATE INDEX idx_gift_balances_user_id      ON gift_balances(user_id);
CREATE INDEX idx_gift_balances_type         ON gift_balances(balance_type_id);
CREATE INDEX idx_gift_balances_user_type    ON gift_balances(user_id, balance_type_id);

-- ---------------------------------------------------------------------
-- 4. gift_giver_levels — справочник Д-1..Д-11
-- ---------------------------------------------------------------------
CREATE TABLE gift_giver_levels (
    id                          SERIAL PRIMARY KEY,
    gc_giver_level_id           INTEGER NOT NULL UNIQUE,
    parent_id                   INTEGER REFERENCES gift_giver_levels(id) ON DELETE SET NULL,
    level                       SMALLINT NOT NULL,         -- 1..11
    min_amount                  BIGINT NOT NULL,           -- micro-USDT
    absolute_income_percent     DOUBLE PRECISION,          -- 130-260%
    days                        SMALLINT,
    week_percent                DOUBLE PRECISION,
    super_pool_percent          SMALLINT,
    weekly_pool_percent         SMALLINT,
    for_referral_percent        SMALLINT,
    receive_donations_percent   SMALLINT,
    created_at                  TIMESTAMP,
    updated_at                  TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 5. gift_user_giver_level — pivot активных уровней (2279 записей)
-- ---------------------------------------------------------------------
CREATE TABLE gift_user_giver_level (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    giver_level_id           INTEGER NOT NULL REFERENCES gift_giver_levels(id) ON DELETE CASCADE,
    progress                 BIGINT,
    target                   BIGINT,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE INDEX idx_gugl_user_id        ON gift_user_giver_level(user_id);
CREATE INDEX idx_gugl_giver_level    ON gift_user_giver_level(giver_level_id);

-- ---------------------------------------------------------------------
-- 6. gift_ref_levels — 15 реф-уровней (правила)
-- ---------------------------------------------------------------------
CREATE TABLE gift_ref_levels (
    id                       SERIAL PRIMARY KEY,
    gc_ref_level_id          INTEGER NOT NULL UNIQUE,
    level                    SMALLINT NOT NULL,            -- 1..15
    percent                  DOUBLE PRECISION NOT NULL,    -- 0.1, 0.2, 0.3
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 7. gift_giver_levels_levels — pivot Giver × RefLevel (125 записей)
-- ---------------------------------------------------------------------
CREATE TABLE gift_giver_levels_levels (
    id                       SERIAL PRIMARY KEY,
    giver_level_id           INTEGER NOT NULL REFERENCES gift_giver_levels(id) ON DELETE CASCADE,
    ref_level_id             INTEGER NOT NULL REFERENCES gift_ref_levels(id) ON DELETE CASCADE,
    income_percent           DOUBLE PRECISION NOT NULL,    -- % для этого giver на этой линии
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE UNIQUE INDEX uq_ggll_giver_ref ON gift_giver_levels_levels(giver_level_id, ref_level_id);

-- ---------------------------------------------------------------------
-- 8. gift_circle_leader_levels — справочник Л-1..Л-10
-- ---------------------------------------------------------------------
CREATE TABLE gift_circle_leader_levels (
    id                       SERIAL PRIMARY KEY,
    gc_clt_id                INTEGER NOT NULL UNIQUE,
    level                    SMALLINT NOT NULL,           -- 1..10
    circle_id                INTEGER,                     -- из giftclub (всегда 1)
    parent_id                INTEGER REFERENCES gift_circle_leader_levels(id) ON DELETE SET NULL,
    giver_level_id           INTEGER REFERENCES gift_giver_levels(id) ON DELETE SET NULL,
    needs_ref                SMALLINT,
    depth                    SMALLINT NOT NULL,
    status                   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 9. gift_user_circle_leader_level — текущий лидерский уровень юзера
--    (берётся из последней записи circle_leader_level_histories)
-- ---------------------------------------------------------------------
CREATE TABLE gift_user_circle_leader_level (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    leader_level_id          INTEGER REFERENCES gift_circle_leader_levels(id) ON DELETE SET NULL,
    -- snapshot полей histories для последней записи на юзера
    snapshot_date            DATE,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE INDEX idx_guclevel_user ON gift_user_circle_leader_level(user_id);

-- ---------------------------------------------------------------------
-- 10. gift_circle_levels — справочник CircleLevel 1..6 (недельная активность)
-- ---------------------------------------------------------------------
CREATE TABLE gift_circle_levels (
    id                       SERIAL PRIMARY KEY,
    gc_cl_id                 INTEGER NOT NULL UNIQUE,
    level                    SMALLINT NOT NULL,           -- 1..6
    min_donations            INTEGER,                     -- 100, 200, 300...
    max_donations            INTEGER,                     -- 200, 300, 400...
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE TABLE gift_circle_level_weeks (
    id                       SERIAL PRIMARY KEY,
    circle_level_id          INTEGER NOT NULL REFERENCES gift_circle_levels(id) ON DELETE CASCADE,
    week                     SMALLINT NOT NULL,           -- 1..4
    percent                  DOUBLE PRECISION NOT NULL,   -- 10..90
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 11. gift_referrals_secondary — 2-я реф-программа (NestedSet "колбаса", 21k)
-- ---------------------------------------------------------------------
CREATE TABLE gift_referrals_secondary (
    id                       BIGSERIAL PRIMARY KEY,
    gc_referal_id            BIGINT NOT NULL UNIQUE,        -- оригинальный id
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    parent_id                BIGINT REFERENCES gift_referrals_secondary(id) ON DELETE SET NULL,
    depth                    SMALLINT NOT NULL DEFAULT 0,
    lft                      INTEGER NOT NULL DEFAULT 0,
    rgt                      INTEGER NOT NULL DEFAULT 0,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE INDEX idx_grs_user_id     ON gift_referrals_secondary(user_id);
CREATE INDEX idx_grs_parent_id   ON gift_referrals_secondary(parent_id);
CREATE INDEX idx_grs_lft_rgt     ON gift_referrals_secondary(lft, rgt);

-- ---------------------------------------------------------------------
-- 12. gift_all_refs — глубинный реф-пул (8 записей по уровню Лидера)
-- ---------------------------------------------------------------------
CREATE TABLE gift_all_refs (
    id                       SERIAL PRIMARY KEY,
    circle_leader_level_id   INTEGER REFERENCES gift_circle_leader_levels(id) ON DELETE CASCADE,
    percent                  DOUBLE PRECISION NOT NULL,    -- 30, 20, 15, 10, 5, 5, 5, 5
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 13. gift_promo_ref — промо-реф связи (4735 записей)
--     user_id → ref_id, отдельно от users.ref_id. Используется для
--     учёта рефералов, привлечённых в рамках конкретной акции.
-- ---------------------------------------------------------------------
CREATE TABLE gift_promo_ref (
    id                       BIGSERIAL PRIMARY KEY,
    gc_promo_ref_id          BIGINT NOT NULL UNIQUE,
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    ref_id                   BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE INDEX idx_gpr_user_id     ON gift_promo_ref(user_id);
CREATE INDEX idx_gpr_ref_id      ON gift_promo_ref(ref_id);

-- ---------------------------------------------------------------------
-- 13b. gift_promo_upgrades — справочник промо-кампаний (10 записей)
--     "Купи Д-2 в период X..Y → получи бонус amount на balance_type"
-- ---------------------------------------------------------------------
CREATE TABLE gift_promo_upgrades (
    id                       SERIAL PRIMARY KEY,
    gc_promo_upgrade_id      INTEGER NOT NULL UNIQUE,
    balance_type_id          INTEGER NOT NULL REFERENCES gift_balance_types(id),
    giver_level_id           INTEGER NOT NULL REFERENCES gift_giver_levels(id),
    amount                   BIGINT NOT NULL,            -- micro-USDT
    start_at                 TIMESTAMP NOT NULL,
    end_at                   TIMESTAMP NOT NULL,
    for_main_ref             BOOLEAN NOT NULL DEFAULT FALSE,
    for_user                 BOOLEAN NOT NULL DEFAULT FALSE,
    for_ref_list             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

-- ---------------------------------------------------------------------
-- 13c. gift_bonus_infos — бонусы по внешним проектам (503 записи)
-- ---------------------------------------------------------------------
CREATE TABLE gift_bonus_infos (
    id                       BIGSERIAL PRIMARY KEY,
    gc_bonus_info_id         BIGINT NOT NULL UNIQUE,
    user_id                  BIGINT NOT NULL REFERENCES gift_users(id) ON DELETE CASCADE,
    project_name             VARCHAR(255) NOT NULL,
    amount                   BIGINT NOT NULL,           -- micro-USDT
    status                   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at               TIMESTAMP,
    updated_at               TIMESTAMP
);

CREATE INDEX idx_gbi_user_id ON gift_bonus_infos(user_id);

-- ---------------------------------------------------------------------
-- 14. gift_migration_log — журнал миграционных действий (audit)
-- ---------------------------------------------------------------------
CREATE TABLE gift_migration_log (
    id                       BIGSERIAL PRIMARY KEY,
    step                     VARCHAR(64) NOT NULL,
    table_name               VARCHAR(64),
    rows_imported            INTEGER,
    started_at               TIMESTAMP NOT NULL DEFAULT NOW(),
    finished_at              TIMESTAMP,
    status                   VARCHAR(32) NOT NULL DEFAULT 'running',
    notes                    TEXT
);

COMMENT ON TABLE gift_migration_log IS 'Лог всех ETL-шагов: какие таблицы импортированы, сколько строк, когда, ошибки.';

-- ---------------------------------------------------------------------
-- 15. Foreign key добавляем gift_balances.ref_level_id
-- ---------------------------------------------------------------------
ALTER TABLE gift_balances
    ADD CONSTRAINT fk_gift_balances_ref_level
    FOREIGN KEY (ref_level_id) REFERENCES gift_ref_levels(id) ON DELETE SET NULL;

COMMIT;

-- =====================================================================
-- ИТОГО:
--   13 таблиц с префиксом gift_ + 1 audit-таблица.
--   Все Foreign keys поставлены.
--   Все индексы для быстрых запросов в кабинете.
--   NestedSet (lft, rgt, depth) сохраняется для дерева.
--   Money — bigint micro-USDT (×10^8).
-- =====================================================================
