-- =====================================================================
-- Stage 12: unify users + gift_users via direct FK column on public.users
-- =====================================================================
-- "Soft merge": instead of dropping gift_users (which has 17 FK dependants),
-- we add a direct reverse link from public.users.gift_user_id → gift_users.id.
--
-- This gives a clean unified view:
--   - One row in public.users per Golden Connect/Telegram user (canonical identity)
--   - Optional gift_user_id pointer for users with GIFT history
--   - All gift_* tables still keyed on gift_users.id (no data movement needed)
--   - Cabinet/API just JOIN public.users → gift_users when GIFT data is needed
--
-- Auto-population: trigger 0103 already sets gift_users.golden-connect_user_id
-- on signup; we keep that going and additionally maintain the reverse
-- public.users.gift_user_id for O(1) lookup.
-- =====================================================================

-- 1. Add the reverse FK column
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS gift_user_id BIGINT
    REFERENCES public.gift_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_gift_user_id ON public.users(gift_user_id)
WHERE gift_user_id IS NOT NULL;

COMMENT ON COLUMN public.users.gift_user_id IS
'Optional link to gift_users.id (primary GIFT account for this user — main_user_id IS NULL row). NULL if user has no GIFT history. Maintained by triggers 0103 + 0104.';

-- 2. Backfill: for each existing public.users with a tg_id that matches
--    a gift_users.telegram_chat_id, set gift_user_id to the MAIN account
--    (where main_user_id IS NULL — there can be 20+ multi-accounts under one tg_id,
--    we pick the main one as the canonical).
UPDATE public.users u
SET gift_user_id = main_gu.id
FROM (
    SELECT DISTINCT ON (telegram_chat_id)
        id, telegram_chat_id
    FROM public.gift_users
    WHERE main_user_id IS NULL
      AND telegram_chat_id IS NOT NULL
    ORDER BY telegram_chat_id, id  -- if multiple "main" share tg_id, take lowest id
) main_gu
WHERE u.tg_id IS NOT NULL
  AND main_gu.telegram_chat_id = u.tg_id::text
  AND u.gift_user_id IS NULL;

-- 3. Update signup trigger to also maintain reverse pointer
CREATE OR REPLACE FUNCTION public.link_gift_user_on_signup()
RETURNS TRIGGER AS $$
DECLARE
    main_gift_id BIGINT;
BEGIN
    IF NEW.tg_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Find the main gift account for this tg_id (where main_user_id IS NULL)
    SELECT id INTO main_gift_id
    FROM public.gift_users
    WHERE telegram_chat_id = NEW.tg_id::text
      AND main_user_id IS NULL
    ORDER BY id
    LIMIT 1;

    IF main_gift_id IS NOT NULL THEN
        -- Forward link: gift_users → golden-connect
        UPDATE public.gift_users
        SET golden-connect_user_id = NEW.id
        WHERE telegram_chat_id = NEW.tg_id::text
          AND golden-connect_user_id IS NULL;

        -- Reverse link: golden-connect → gift (canonical main account)
        UPDATE public.users
        SET gift_user_id = main_gift_id
        WHERE id = NEW.id AND gift_user_id IS NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Helpful view: unified user info with optional GIFT extension
CREATE OR REPLACE VIEW public.users_with_gift AS
SELECT
    u.id AS user_id,
    u.tg_id,
    u.tg_username,
    u.username,
    u.first_name,
    u.last_name,
    u.ref_code,
    u.active_tariff_code,
    u.gift_balance_micro AS golden-connect_gift_balance_micro,  -- existing field on Golden Connect side
    u.karma_points,
    u.partner_status,
    u.joined_at,
    u.last_seen_at,
    -- GIFT extension (NULL for Golden Connect-only users)
    gu.id AS gift_user_id,
    gu.gc_user_id,
    gu.name AS gift_name,
    gu.role AS gift_role,
    gu.depth AS gift_depth,
    gu.lft AS gift_lft,
    gu.rgt AS gift_rgt,
    (gu.id IS NOT NULL) AS has_gift_account,
    -- Total GIFT balance across all types
    COALESCE((
        SELECT SUM(balance)::text
        FROM public.gift_balances
        WHERE user_id = gu.id
    ), '0') AS total_gift_balance_micro
FROM public.users u
LEFT JOIN public.gift_users gu ON gu.id = u.gift_user_id;

COMMENT ON VIEW public.users_with_gift IS
'Unified user view: public.users + optional GIFT extension. Use this instead of joining manually in routes.';
