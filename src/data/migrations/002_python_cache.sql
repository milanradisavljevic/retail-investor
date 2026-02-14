-- Python provider cache consolidation (Phase 1c)
-- Allows multiple providers to cache the same symbol/field pair.

CREATE TABLE IF NOT EXISTS provider_cache (
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'yfinance', -- 'yfinance', 'fmp', 'finnhub'
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (symbol, provider, field)
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_symbol
ON provider_cache(symbol);

CREATE INDEX IF NOT EXISTS idx_provider_cache_provider
ON provider_cache(provider);

CREATE INDEX IF NOT EXISTS idx_provider_cache_expires
ON provider_cache(expires_at);
