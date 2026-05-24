-- =====================================================================
-- Gift Club auto-link trigger
-- =====================================================================
-- When a new user is registered in public.users (via TG-login or signup),
-- automatically link any matching gift_users row (by telegram_chat_id = tg_id).
-- This handles the "GIFT user signs up to Trendex for the first time" flow:
--   user opens @TrendexCRMBot → /start → public.users row created with tg_id
--   → trigger fires → gift_users.trendex_user_id = new user.id
--   → next login: GIFT menu appears in cabinet, balances visible immediately
-- =====================================================================

CREATE OR REPLACE FUNCTION public.link_gift_user_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tg_id IS NOT NULL THEN
        UPDATE public.gift_users
        SET trendex_user_id = NEW.id
        WHERE telegram_chat_id = NEW.tg_id::text
          AND trendex_user_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_link_gift_user_on_signup ON public.users;
CREATE TRIGGER trg_link_gift_user_on_signup
    AFTER INSERT ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.link_gift_user_on_signup();

-- Also: when public.users.tg_id is updated (rare but possible), re-link.
CREATE OR REPLACE FUNCTION public.relink_gift_user_on_tg_update()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tg_id IS NOT NULL AND (OLD.tg_id IS NULL OR OLD.tg_id != NEW.tg_id) THEN
        -- Unlink old (if tg_id changed)
        IF OLD.tg_id IS NOT NULL THEN
            UPDATE public.gift_users
            SET trendex_user_id = NULL
            WHERE trendex_user_id = OLD.id AND telegram_chat_id = OLD.tg_id::text;
        END IF;
        -- Link new
        UPDATE public.gift_users
        SET trendex_user_id = NEW.id
        WHERE telegram_chat_id = NEW.tg_id::text
          AND trendex_user_id IS NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_relink_gift_user_on_tg_update ON public.users;
CREATE TRIGGER trg_relink_gift_user_on_tg_update
    AFTER UPDATE OF tg_id ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.relink_gift_user_on_tg_update();

COMMENT ON FUNCTION public.link_gift_user_on_signup IS
'Auto-link gift_users.trendex_user_id when a new TG user is created in public.users. Part of GiftClub merge (migration 0102).';
