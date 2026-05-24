-- Phase: align tariff prices with presentation slides 5+8
-- Slide 5: "Порог входа — 45$ — Одноразовая активация 30$ + обслуживание 15$ в месяц"
-- Slide 7: total prices LAUNCH 45/BOOST 90/ROCKET 135
-- Slide 8: 10-line referral percentages (10/7/5/2/1.5/...) of buy amount
--
-- Previous state (migration 0012): entry_micro = activation only (30/75/120)
-- New state: entry_micro = full first-purchase price (45/90/135) so that
--   • Partner referral payouts = 10% of $45 not $30 (matches slide 8)
--   • Buy modal shows clean $45/$90/$135 matching slide 7
-- monthly_fee_micro now scales with seat count:
--   LAUNCH 1 seat × $15 = $15/mo
--   BOOST  2 seats × $15 = $30/mo
--   ROCKET 3 seats × $15 = $45/mo
-- (User explicitly requested this in 2026-04-27 cron-iteration message)

UPDATE "tariffs" SET
  "entry_micro" = 45000000,
  "monthly_fee_micro" = 15000000
WHERE "code" = 'launch';
--> statement-breakpoint

UPDATE "tariffs" SET
  "entry_micro" = 90000000,
  "monthly_fee_micro" = 30000000
WHERE "code" = 'boost';
--> statement-breakpoint

UPDATE "tariffs" SET
  "entry_micro" = 135000000,
  "monthly_fee_micro" = 45000000
WHERE "code" = 'rocket';
