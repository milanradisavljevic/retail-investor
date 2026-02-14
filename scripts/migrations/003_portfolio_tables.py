#!/usr/bin/env python3
"""
Portfolio Tables Migration

Creates portfolio_positions and portfolio_snapshots tables in privatinvestor.db.

Usage:
    python scripts/migrations/003_portfolio_tables.py
"""

import logging
import sqlite3
from pathlib import Path

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

DB_PATH = Path("data/privatinvestor.db")

MIGRATION_SQL = """
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
"""


def check_table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    """Check if a table already exists in the database."""
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    )
    return cursor.fetchone() is not None


def run_migration():
    """Execute the portfolio tables migration."""
    if not DB_PATH.exists():
        logger.error(f"Database not found: {DB_PATH}")
        logger.error("Please ensure the database exists before running this migration.")
        return False

    logger.info(f"Running portfolio tables migration on {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)

    try:
        tables_created = []
        tables_skipped = []

        if check_table_exists(conn, "portfolio_positions"):
            tables_skipped.append("portfolio_positions")
        else:
            tables_created.append("portfolio_positions")

        if check_table_exists(conn, "portfolio_snapshots"):
            tables_skipped.append("portfolio_snapshots")
        else:
            tables_created.append("portfolio_snapshots")

        conn.executescript(MIGRATION_SQL)
        conn.commit()

        logger.info("Migration completed successfully")

        if tables_created:
            logger.info(f"  Tables created: {', '.join(tables_created)}")
        if tables_skipped:
            logger.info(
                f"  Tables skipped (already exist): {', '.join(tables_skipped)}"
            )

        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_portfolio%' OR name LIKE 'idx_snapshot%'"
        )
        indexes = [row[0] for row in cursor.fetchall()]
        if indexes:
            logger.info(f"  Indexes: {', '.join(indexes)}")

        return True

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


if __name__ == "__main__":
    success = run_migration()
    exit(0 if success else 1)
