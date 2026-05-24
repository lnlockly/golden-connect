-- Phase: ROCKET price bump 135 → 145 per 2026-04-28 user clarification
-- LAUNCH $45 + $15/mo (unchanged)
-- BOOST  $90 + $30/mo (unchanged)
-- ROCKET $145 + $45/mo (was $135)
UPDATE "tariffs" SET
  "entry_micro" = 145000000
WHERE "code" = 'rocket';
