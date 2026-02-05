-- Market data cache for fast, offline backtesting
-- This schema is intentionally narrow: one row per symbol per as-of date.

CREATE TABLE IF NOT EXISTS fundamentals (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  -- Valuation
  pe REAL,
  pb REAL,
  ps REAL,
  peg REAL,
  ev_ebitda REAL,
  -- Quality
  roe REAL,
  roic REAL,
  gross_margin REAL,
  operating_margin REAL,
  debt_equity REAL,
  current_ratio REAL,
  -- Size
  market_cap REAL,
  -- Meta
  data_completeness REAL,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_symbol_date ON fundamentals(symbol, date);

CREATE TABLE IF NOT EXISTS prices (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume INTEGER,
  adjusted_close REAL,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_prices_symbol_date ON prices(symbol, date);

CREATE TABLE IF NOT EXISTS technical_indicators (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  beta REAL,
  volatility REAL,
  sharpe_ratio REAL,
  return_13w REAL,
  return_26w REAL,
  return_52w REAL,
  ma_50 REAL,
  ma_200 REAL,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol, date)
);

CREATE INDEX IF NOT EXISTS idx_tech_symbol_date ON technical_indicators(symbol, date);

CREATE TABLE IF NOT EXISTS metadata (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  industry TEXT,
  country TEXT,
  exchange TEXT,
  currency TEXT,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Aggregated fundamental metrics (trailing 12M averages)
-- Used by backtesting to avoid runtime YFinance timeouts
CREATE TABLE IF NOT EXISTS fundamentals_avg (
  symbol TEXT PRIMARY KEY,
  roe REAL,           -- Return on Equity (trailing 12M, as percentage)
  roic REAL,          -- Return on Invested Capital (or ROA as proxy)
  pe REAL,            -- Price to Earnings (trailing)
  pb REAL,            -- Price to Book (MRQ)
  fetched_at INTEGER NOT NULL,
  last_updated TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fundamentals_avg_fetched
  ON fundamentals_avg(fetched_at);
