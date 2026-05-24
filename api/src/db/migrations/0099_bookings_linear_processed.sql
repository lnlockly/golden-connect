-- Add linear_processed flag separate from marketing_processed (matrix).
-- Linear (10-level referral) accruals run IMMEDIATELY on payment (pre-launch).
-- Matrix + task pool wait for admin to activate marketing (~1 week post-launch).
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS linear_processed BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_bookings_linear_processed ON bookings(linear_processed);
CREATE INDEX IF NOT EXISTS idx_bookings_unprocessed ON bookings(linear_processed, marketing_processed) WHERE status = 'paid';
