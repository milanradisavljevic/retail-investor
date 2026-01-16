"""SQLite-based cache with TTL support for Finnhub data."""

import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import Optional, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class SQLiteCache:
    """
    SQLite cache for API responses with TTL support.

    Stores data in a table with columns: symbol, field, value (JSON), fetched_at.
    """

    def __init__(self, db_path: str = "data/cache/finnhub.db", ttl_hours: int = 24):
        """
        Initialize SQLite cache.

        Args:
            db_path: Path to SQLite database file
            ttl_hours: Time-to-live in hours for cached data
        """
        self.db_path = db_path
        self.ttl_hours = ttl_hours

        # Create directory if it doesn't exist
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

        # Initialize database
        self._init_db()

    def _init_db(self) -> None:
        """Create cache table if it doesn't exist."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cache (
                    symbol TEXT NOT NULL,
                    field TEXT NOT NULL,
                    value TEXT NOT NULL,
                    fetched_at TEXT NOT NULL,
                    PRIMARY KEY (symbol, field)
                )
                """
            )
            # Create index for faster lookups
            conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_fetched_at
                ON cache(fetched_at)
                """
            )
            conn.commit()

    def get(self, symbol: str, field: str) -> Optional[Any]:
        """
        Get cached value for a symbol and field.

        Returns None if not cached or expired.

        Args:
            symbol: Stock ticker symbol
            field: Field name (e.g., "basic_financials", "candles_D_365d")

        Returns:
            Cached value or None if not found or expired
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                SELECT value, fetched_at FROM cache
                WHERE symbol = ? AND field = ? AND fetched_at >= ?
                """,
                (symbol, field, cutoff_str),
            )
            row = cursor.fetchone()

            if row:
                value_json, fetched_at = row
                logger.debug(
                    f"Cache HIT: {symbol}.{field} (fetched: {fetched_at})"
                )
                return json.loads(value_json)
            else:
                logger.debug(f"Cache MISS: {symbol}.{field}")
                return None

    def set(self, symbol: str, field: str, value: Any) -> None:
        """
        Cache a value for a symbol and field.

        Args:
            symbol: Stock ticker symbol
            field: Field name
            value: Value to cache (will be JSON serialized)
        """
        value_json = json.dumps(value)
        fetched_at = datetime.now().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO cache (symbol, field, value, fetched_at)
                VALUES (?, ?, ?, ?)
                """,
                (symbol, field, value_json, fetched_at),
            )
            conn.commit()

        logger.debug(f"Cache SET: {symbol}.{field}")

    def clear_expired(self) -> int:
        """
        Remove expired entries from cache.

        Returns:
            Number of entries removed
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                DELETE FROM cache WHERE fetched_at < ?
                """,
                (cutoff_str,),
            )
            conn.commit()
            deleted = cursor.rowcount

        logger.info(f"Cleared {deleted} expired cache entries")
        return deleted

    def clear_all(self) -> None:
        """Clear all cache entries."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM cache")
            conn.commit()

        logger.info("Cleared all cache entries")

    def clear_symbol(self, symbol: str) -> None:
        """
        Clear all cache entries for a specific symbol.

        Args:
            symbol: Stock ticker symbol
        """
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "DELETE FROM cache WHERE symbol = ?", (symbol,)
            )
            conn.commit()
            deleted = cursor.rowcount

        logger.info(f"Cleared {deleted} cache entries for {symbol}")

    def get_stats(self) -> dict:
        """
        Get cache statistics.

        Returns:
            Dictionary with total entries, expired entries, symbols cached
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()

        with sqlite3.connect(self.db_path) as conn:
            # Total entries
            cursor = conn.execute("SELECT COUNT(*) FROM cache")
            total = cursor.fetchone()[0]

            # Expired entries
            cursor = conn.execute(
                "SELECT COUNT(*) FROM cache WHERE fetched_at < ?", (cutoff_str,)
            )
            expired = cursor.fetchone()[0]

            # Unique symbols
            cursor = conn.execute(
                "SELECT COUNT(DISTINCT symbol) FROM cache WHERE fetched_at >= ?",
                (cutoff_str,),
            )
            symbols = cursor.fetchone()[0]

        return {
            "total_entries": total,
            "expired_entries": expired,
            "valid_entries": total - expired,
            "symbols_cached": symbols,
        }
