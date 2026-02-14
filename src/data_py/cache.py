"""SQLite-backed API response cache with TTL and provider scoping."""

import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


class SQLiteCache:
    """
    SQLite cache for API responses with TTL support.

    Default mode writes to `provider_cache` in `data/privatinvestor.db`.
    Backward compatibility is kept for legacy `data/cache/finnhub.db`, where
    the old `cache` table layout is still used.
    """

    def __init__(
        self,
        db_path: str = "data/privatinvestor.db",
        ttl_hours: int = 24,
        provider: str = "yfinance",
    ):
        """
        Initialize SQLite cache.

        Args:
            db_path: Path to SQLite database file
            ttl_hours: Time-to-live in hours for cached data
            provider: Provider namespace used in provider_cache
        """
        self.db_path = db_path
        self.ttl_hours = ttl_hours
        self.provider = provider
        self._legacy_mode = Path(db_path).name.lower() == "finnhub.db"

        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Create cache tables/indexes if they do not exist."""
        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
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
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_fetched_at
                    ON cache(fetched_at)
                    """
                )
            else:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS provider_cache (
                        symbol TEXT NOT NULL,
                        provider TEXT NOT NULL DEFAULT 'yfinance',
                        field TEXT NOT NULL,
                        value_json TEXT NOT NULL,
                        fetched_at TEXT NOT NULL,
                        expires_at TEXT,
                        PRIMARY KEY (symbol, provider, field)
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_provider_cache_symbol
                    ON provider_cache(symbol)
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_provider_cache_provider
                    ON provider_cache(provider)
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_provider_cache_expires
                    ON provider_cache(expires_at)
                    """
                )
            conn.commit()

    def get(self, symbol: str, field: str) -> Optional[Any]:
        """
        Get cached value for a symbol and field.

        Returns None if not cached or expired.
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()

        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                cursor = conn.execute(
                    """
                    SELECT value, fetched_at FROM cache
                    WHERE symbol = ? AND field = ? AND fetched_at >= ?
                    """,
                    (symbol, field, cutoff_str),
                )
            else:
                cursor = conn.execute(
                    """
                    SELECT value_json, fetched_at FROM provider_cache
                    WHERE symbol = ?
                      AND provider = ?
                      AND field = ?
                      AND fetched_at >= ?
                    """,
                    (symbol, self.provider, field, cutoff_str),
                )
            row = cursor.fetchone()

            if row:
                value_json, fetched_at = row
                logger.debug(
                    "Cache HIT: %s.%s provider=%s fetched=%s",
                    symbol,
                    field,
                    self.provider,
                    fetched_at,
                )
                return json.loads(value_json)

            logger.debug("Cache MISS: %s.%s provider=%s", symbol, field, self.provider)
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
        fetched_at = datetime.now()
        fetched_at_str = fetched_at.isoformat()

        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO cache (symbol, field, value, fetched_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (symbol, field, value_json, fetched_at_str),
                )
            else:
                expires_at_str = (
                    fetched_at + timedelta(hours=self.ttl_hours)
                ).isoformat()
                conn.execute(
                    """
                    INSERT OR REPLACE INTO provider_cache (
                        symbol, provider, field, value_json, fetched_at, expires_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        symbol,
                        self.provider,
                        field,
                        value_json,
                        fetched_at_str,
                        expires_at_str,
                    ),
                )
            conn.commit()

        logger.debug("Cache SET: %s.%s provider=%s", symbol, field, self.provider)

    def clear_expired(self) -> int:
        """
        Remove expired entries from cache.

        Returns:
            Number of entries removed
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()
        now_str = datetime.now().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                cursor = conn.execute(
                    """
                    DELETE FROM cache WHERE fetched_at < ?
                    """,
                    (cutoff_str,),
                )
            else:
                cursor = conn.execute(
                    """
                    DELETE FROM provider_cache
                    WHERE provider = ?
                      AND (
                        (expires_at IS NOT NULL AND expires_at < ?)
                        OR (expires_at IS NULL AND fetched_at < ?)
                      )
                    """,
                    (self.provider, now_str, cutoff_str),
                )
            conn.commit()
            deleted = cursor.rowcount

        logger.info("Cleared %d expired cache entries for provider=%s", deleted, self.provider)
        return deleted

    def clear_all(self) -> None:
        """Clear all cache entries."""
        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                conn.execute("DELETE FROM cache")
            else:
                conn.execute(
                    "DELETE FROM provider_cache WHERE provider = ?", (self.provider,)
                )
            conn.commit()

        logger.info("Cleared all cache entries for provider=%s", self.provider)

    def clear_symbol(self, symbol: str) -> None:
        """
        Clear all cache entries for a specific symbol.

        Args:
            symbol: Stock ticker symbol
        """
        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                cursor = conn.execute(
                    "DELETE FROM cache WHERE symbol = ?", (symbol,)
                )
            else:
                cursor = conn.execute(
                    """
                    DELETE FROM provider_cache
                    WHERE symbol = ? AND provider = ?
                    """,
                    (symbol, self.provider),
                )
            conn.commit()
            deleted = cursor.rowcount

        logger.info(
            "Cleared %d cache entries for %s provider=%s",
            deleted,
            symbol,
            self.provider,
        )

    def get_stats(self) -> dict:
        """
        Get cache statistics.

        Returns:
            Dictionary with total entries, expired entries, symbols cached
        """
        cutoff_time = datetime.now() - timedelta(hours=self.ttl_hours)
        cutoff_str = cutoff_time.isoformat()
        now_str = datetime.now().isoformat()

        with sqlite3.connect(self.db_path) as conn:
            if self._legacy_mode:
                cursor = conn.execute("SELECT COUNT(*) FROM cache")
                total = cursor.fetchone()[0]

                cursor = conn.execute(
                    "SELECT COUNT(*) FROM cache WHERE fetched_at < ?", (cutoff_str,)
                )
                expired = cursor.fetchone()[0]

                cursor = conn.execute(
                    "SELECT COUNT(DISTINCT symbol) FROM cache WHERE fetched_at >= ?",
                    (cutoff_str,),
                )
                symbols = cursor.fetchone()[0]
            else:
                cursor = conn.execute(
                    """
                    SELECT COUNT(*) FROM provider_cache
                    WHERE provider = ?
                    """,
                    (self.provider,),
                )
                total = cursor.fetchone()[0]

                cursor = conn.execute(
                    """
                    SELECT COUNT(*) FROM provider_cache
                    WHERE provider = ?
                      AND (
                        (expires_at IS NOT NULL AND expires_at < ?)
                        OR (expires_at IS NULL AND fetched_at < ?)
                      )
                    """,
                    (self.provider, now_str, cutoff_str),
                )
                expired = cursor.fetchone()[0]

                cursor = conn.execute(
                    """
                    SELECT COUNT(DISTINCT symbol) FROM provider_cache
                    WHERE provider = ?
                      AND (
                        (expires_at IS NOT NULL AND expires_at >= ?)
                        OR (expires_at IS NULL AND fetched_at >= ?)
                      )
                    """,
                    (self.provider, now_str, cutoff_str),
                )
                symbols = cursor.fetchone()[0]

        return {
            "total_entries": total,
            "expired_entries": expired,
            "valid_entries": total - expired,
            "symbols_cached": symbols,
        }
