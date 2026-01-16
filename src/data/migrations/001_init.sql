-- Privatinvestor MVP Database Schema v1
-- SQLite migration for initial setup

-- Prices (EOD)
CREATE TABLE IF NOT EXISTS prices_eod (
  symbol TEXT NOT NULL,
  date TEXT NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  adjusted_close REAL,
  volume INTEGER,
  fetched_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, date)
);

-- Fundamentals Snapshot
CREATE TABLE IF NOT EXISTS fundamentals_snapshot (
  symbol TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (symbol, fetched_at)
);

-- Company Profile Cache
CREATE TABLE IF NOT EXISTS company_profile (
  symbol TEXT PRIMARY KEY,
  name TEXT,
  sector TEXT,
  industry TEXT,
  market_cap REAL,
  data_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- Cache Metadata
CREATE TABLE IF NOT EXISTS cache_meta (
  key TEXT PRIMARY KEY,
  last_updated INTEGER NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  hit_count INTEGER DEFAULT 0
);

-- Run Index
CREATE TABLE IF NOT EXISTS run_index (
  run_id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  file_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  symbol_count INTEGER NOT NULL,
  top5 TEXT NOT NULL,
  pick_of_day TEXT NOT NULL
);

-- Document Requests (Human-in-the-Loop)
CREATE TABLE IF NOT EXISTS document_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending', 'fulfilled', 'ignored')) DEFAULT 'pending',
  fulfilled_at TEXT,
  file_path TEXT
);

-- User Financial Packets
CREATE TABLE IF NOT EXISTS financial_packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  period_end TEXT NOT NULL,
  period_type TEXT NOT NULL,
  data_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  UNIQUE(symbol, period_end, period_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prices_symbol ON prices_eod(symbol);
CREATE INDEX IF NOT EXISTS idx_prices_date ON prices_eod(date);
CREATE INDEX IF NOT EXISTS idx_prices_fetched ON prices_eod(fetched_at);
CREATE INDEX IF NOT EXISTS idx_fundamentals_symbol ON fundamentals_snapshot(symbol);
CREATE INDEX IF NOT EXISTS idx_run_timestamp ON run_index(timestamp);
CREATE INDEX IF NOT EXISTS idx_doc_requests_status ON document_requests(status);
CREATE INDEX IF NOT EXISTS idx_doc_requests_symbol ON document_requests(symbol);
CREATE INDEX IF NOT EXISTS idx_financial_packets_symbol ON financial_packets(symbol);
