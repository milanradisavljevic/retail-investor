-- Portfolio Tables (Phase 3 - Portfolio Tracking)
-- Stores user portfolio positions and daily snapshots

CREATE TABLE IF NOT EXISTS portfolio_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'equity',
    quantity REAL NOT NULL,
    quantity_unit TEXT DEFAULT 'shares',
    buy_price REAL NOT NULL,
    buy_date TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    broker TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_positions(symbol);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    snapshot_date TEXT NOT NULL,
    total_value_usd REAL,
    equity_value_usd REAL,
    commodity_value_usd REAL,
    portfolio_score REAL,
    equity_count INTEGER,
    commodity_count INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_snapshot_date ON portfolio_snapshots(user_id, snapshot_date);
