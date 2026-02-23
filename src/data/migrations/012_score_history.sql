-- Score History Table
-- Tracks scoring history for each symbol across runs for trend analysis and Compare Runs feature

CREATE TABLE IF NOT EXISTS score_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  run_date TEXT NOT NULL,
  universe TEXT NOT NULL,
  total_score REAL,
  valuation_score REAL,
  quality_score REAL,
  technical_score REAL,
  risk_score REAL,
  rank INTEGER,
  sector TEXT,
  industry TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying by symbol and run_date
CREATE INDEX IF NOT EXISTS idx_score_history_symbol_date ON score_history(symbol, run_date);
CREATE INDEX IF NOT EXISTS idx_score_history_universe_date ON score_history(universe, run_date);
CREATE INDEX IF NOT EXISTS idx_score_history_run_date ON score_history(run_date);
