-- p2p_processed_trades — idempotency for P2P TRDX exchange settlement
-- Cabinet posts a trade once; even if it retries we never double-execute.
CREATE TABLE IF NOT EXISTS p2p_processed_trades (
  trade_id BIGINT PRIMARY KEY,
  buyer_user_id INTEGER NOT NULL REFERENCES users(id),
  seller_user_id INTEGER NOT NULL REFERENCES users(id),
  total_micro BIGINT NOT NULL,
  amount_trdx_micro BIGINT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_p2p_processed_at ON p2p_processed_trades(processed_at);
