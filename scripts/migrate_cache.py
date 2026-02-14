#!/usr/bin/env python3
"""Migrate legacy Python cache rows into privatinvestor provider_cache."""

from __future__ import annotations

import argparse
import logging
import sqlite3
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

LOGGER = logging.getLogger("migrate_cache")

DEFAULT_SOURCE_DB = Path("data/cache/finnhub.db")
DEFAULT_TARGET_DB = Path("data/privatinvestor.db")

CREATE_PROVIDER_CACHE_SQL = """
CREATE TABLE IF NOT EXISTS provider_cache (
  symbol TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'yfinance',
  field TEXT NOT NULL,
  value_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (symbol, provider, field)
);
CREATE INDEX IF NOT EXISTS idx_provider_cache_symbol ON provider_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_provider_cache_provider ON provider_cache(provider);
CREATE INDEX IF NOT EXISTS idx_provider_cache_expires ON provider_cache(expires_at);
"""


def _parse_datetime(value: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        if value.endswith("Z"):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return None
    return None


def _expires_at(fetched_at: str, ttl_hours: int) -> str:
    parsed = _parse_datetime(fetched_at)
    if parsed is None:
        LOGGER.warning(
            "Invalid fetched_at value '%s'; using current time as fallback", fetched_at
        )
        parsed = datetime.now()
    return (parsed + timedelta(hours=ttl_hours)).isoformat()


def migrate_cache(
    source_db: Path, target_db: Path, provider: str, ttl_hours: int
) -> tuple[int, Counter]:
    if not source_db.exists():
        raise FileNotFoundError(f"Source cache DB not found: {source_db}")

    target_db.parent.mkdir(parents=True, exist_ok=True)

    field_counts: Counter = Counter()
    total_rows = 0

    with sqlite3.connect(source_db) as src_conn, sqlite3.connect(target_db) as dst_conn:
        src_conn.row_factory = sqlite3.Row
        dst_conn.executescript(CREATE_PROVIDER_CACHE_SQL)

        has_cache_table = src_conn.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'cache'
            """
        ).fetchone()
        if not has_cache_table:
            raise RuntimeError(f"Table 'cache' not found in source DB: {source_db}")

        rows = src_conn.execute(
            """
            SELECT symbol, field, value, fetched_at
            FROM cache
            ORDER BY symbol, field
            """
        )

        for row in rows:
            symbol = row["symbol"]
            field = row["field"]
            value_json = row["value"]
            fetched_at = row["fetched_at"]
            expires_at = _expires_at(fetched_at, ttl_hours)

            dst_conn.execute(
                """
                INSERT OR REPLACE INTO provider_cache (
                  symbol, provider, field, value_json, fetched_at, expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (symbol, provider, field, value_json, fetched_at, expires_at),
            )

            total_rows += 1
            field_counts[field] += 1

        dst_conn.commit()

    return total_rows, field_counts


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Migrate rows from data/cache/finnhub.db (cache) to "
            "data/privatinvestor.db (provider_cache)."
        )
    )
    parser.add_argument(
        "--source-db",
        type=Path,
        default=DEFAULT_SOURCE_DB,
        help=f"Source SQLite DB path (default: {DEFAULT_SOURCE_DB})",
    )
    parser.add_argument(
        "--target-db",
        type=Path,
        default=DEFAULT_TARGET_DB,
        help=f"Target SQLite DB path (default: {DEFAULT_TARGET_DB})",
    )
    parser.add_argument(
        "--provider",
        default="yfinance",
        help="Provider label written to provider_cache (default: yfinance)",
    )
    parser.add_argument(
        "--ttl-hours",
        type=int,
        default=24,
        help="TTL in hours used to compute expires_at (default: 24)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    total_rows, field_counts = migrate_cache(
        source_db=args.source_db,
        target_db=args.target_db,
        provider=args.provider,
        ttl_hours=args.ttl_hours,
    )

    LOGGER.info("Migration complete: %d rows migrated", total_rows)
    for field, count in sorted(field_counts.items(), key=lambda item: (-item[1], item[0])):
        LOGGER.info("Field %s: %d rows", field, count)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
