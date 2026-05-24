-- Rollback ROCKET price 145 → 135 per user clarification 2026-04-29.
-- Canonical: LAUNCH $45+$15/mo, BOOST $90+$30/mo, ROCKET $135+$45/mo.
UPDATE "tariffs" SET
  "entry_micro" = 135000000
WHERE "code" = 'rocket';
