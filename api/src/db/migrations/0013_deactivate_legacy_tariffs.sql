-- Deactivate tariffs not part of the new marketing (FREE/LAUNCH/BOOST/ROCKET only).
-- Legacy rows stay in 'tariffs' for historical ledger references but can't be activated.
UPDATE "tariffs" SET "is_active" = false WHERE "code" IN ('pro', 'elite', 'vip', 'royal');
