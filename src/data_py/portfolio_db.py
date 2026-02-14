"""
Portfolio Database Helper Module

Provides CRUD operations for portfolio_positions and portfolio_snapshots tables.
"""

import logging
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

DB_PATH = Path("data/privatinvestor.db")

VALID_ASSET_TYPES = {"equity", "commodity"}
VALID_CURRENCIES = {"USD", "EUR", "GBP", "CHF", "JPY"}
VALID_QUANTITY_UNITS = {"shares", "grams", "ounces"}

PHYSICAL_METALS: Dict[str, Dict[str, str]] = {
    "PHYS:XAU": {
        "name": "Gold (physisch)",
        "price_ticker": "GC=F",
        "default_unit": "ounces",
    },
    "PHYS:XAG": {
        "name": "Silber (physisch)",
        "price_ticker": "SI=F",
        "default_unit": "ounces",
    },
    "PHYS:XPT": {
        "name": "Platin (physisch)",
        "price_ticker": "PL=F",
        "default_unit": "ounces",
    },
    "PHYS:XPD": {
        "name": "Palladium (physisch)",
        "price_ticker": "PA=F",
        "default_unit": "ounces",
    },
}


def _get_connection() -> sqlite3.Connection:
    """Get a database connection with row factory."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _validate_iso_date(date_str: str) -> bool:
    """Validate that a string is a valid ISO date (YYYY-MM-DD)."""
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _validate_position(position: Dict[str, Any]) -> None:
    """Validate position data. Raises ValueError if invalid."""
    if not position.get("symbol"):
        raise ValueError("symbol is required and cannot be empty")

    asset_type = position.get("asset_type", "equity")
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"asset_type must be one of: {', '.join(VALID_ASSET_TYPES)}")

    if asset_type == "commodity" and not position["symbol"].startswith("PHYS:"):
        raise ValueError("commodity symbols must start with 'PHYS:'")

    quantity = position.get("quantity")
    if quantity is None or quantity <= 0:
        raise ValueError("quantity must be greater than 0")

    quantity_unit = position.get("quantity_unit", "shares")
    if quantity_unit not in VALID_QUANTITY_UNITS:
        raise ValueError(
            f"quantity_unit must be one of: {', '.join(VALID_QUANTITY_UNITS)}"
        )

    buy_price = position.get("buy_price")
    if buy_price is None or buy_price < 0:
        raise ValueError("buy_price must be a non-negative number")

    buy_date = position.get("buy_date")
    if not buy_date or not _validate_iso_date(buy_date):
        raise ValueError("buy_date must be a valid ISO date (YYYY-MM-DD)")

    currency = position.get("currency", "USD")
    if currency not in VALID_CURRENCIES:
        raise ValueError(f"currency must be one of: {', '.join(VALID_CURRENCIES)}")


def add_position(position: Dict[str, Any], user_id: str = "default") -> int:
    """
    Add a new portfolio position.

    Args:
        position: Dict with keys: symbol, asset_type, quantity, quantity_unit,
                  buy_price, buy_date, currency, broker (optional), notes (optional)
        user_id: User identifier (default: 'default')

    Returns:
        The ID of the newly created position

    Raises:
        ValueError: If position data is invalid
    """
    _validate_position(position)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO portfolio_positions (
                user_id, symbol, asset_type, quantity, quantity_unit,
                buy_price, buy_date, currency, broker, notes,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                position["symbol"],
                position.get("asset_type", "equity"),
                position["quantity"],
                position.get("quantity_unit", "shares"),
                position["buy_price"],
                position["buy_date"],
                position.get("currency", "USD"),
                position.get("broker"),
                position.get("notes"),
                now,
                now,
            ),
        )
        conn.commit()
        position_id = cursor.lastrowid
        logger.info(
            f"Added position {position_id}: {position['symbol']} ({position.get('asset_type', 'equity')})"
        )
        return position_id
    finally:
        conn.close()


def update_position(
    position_id: int, updates: Dict[str, Any], user_id: str = "default"
) -> bool:
    """
    Update an existing portfolio position.

    Args:
        position_id: The ID of the position to update
        updates: Dict with fields to update (symbol, quantity, etc.)
        user_id: User identifier (default: 'default')

    Returns:
        True if the position was updated, False if not found
    """
    if not updates:
        return False

    allowed_fields = {
        "symbol",
        "asset_type",
        "quantity",
        "quantity_unit",
        "buy_price",
        "buy_date",
        "currency",
        "broker",
        "notes",
    }

    update_fields = {k: v for k, v in updates.items() if k in allowed_fields}

    if not update_fields:
        return False

    if "symbol" in update_fields or "asset_type" in update_fields:
        current = get_position(position_id, user_id)
        if current:
            test_position = {**current, **update_fields}
            _validate_position(test_position)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    update_fields["updated_at"] = now

    set_clause = ", ".join(f"{k} = ?" for k in update_fields.keys())
    values = list(update_fields.values()) + [position_id, user_id]

    conn = _get_connection()
    try:
        cursor = conn.execute(
            f"UPDATE portfolio_positions SET {set_clause} WHERE id = ? AND user_id = ?",
            values,
        )
        conn.commit()
        success = cursor.rowcount > 0
        if success:
            logger.info(f"Updated position {position_id}")
        return success
    finally:
        conn.close()


def delete_position(position_id: int, user_id: str = "default") -> bool:
    """
    Delete a portfolio position.

    Args:
        position_id: The ID of the position to delete
        user_id: User identifier (default: 'default')

    Returns:
        True if the position was deleted, False if not found
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM portfolio_positions WHERE id = ? AND user_id = ?",
            (position_id, user_id),
        )
        conn.commit()
        success = cursor.rowcount > 0
        if success:
            logger.info(f"Deleted position {position_id}")
        return success
    finally:
        conn.close()


def get_position(
    position_id: int, user_id: str = "default"
) -> Optional[Dict[str, Any]]:
    """
    Get a single portfolio position by ID.

    Args:
        position_id: The ID of the position
        user_id: User identifier (default: 'default')

    Returns:
        Position dict or None if not found
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "SELECT * FROM portfolio_positions WHERE id = ? AND user_id = ?",
            (position_id, user_id),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_positions(user_id: str = "default") -> List[Dict[str, Any]]:
    """
    Get all portfolio positions for a user.

    Args:
        user_id: User identifier (default: 'default')

    Returns:
        List of position dicts
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "SELECT * FROM portfolio_positions WHERE user_id = ? ORDER BY buy_date DESC",
            (user_id,),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_positions_by_type(user_id: str, asset_type: str) -> List[Dict[str, Any]]:
    """
    Get portfolio positions filtered by asset type.

    Args:
        user_id: User identifier
        asset_type: 'equity' or 'commodity'

    Returns:
        List of position dicts

    Raises:
        ValueError: If asset_type is invalid
    """
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"asset_type must be one of: {', '.join(VALID_ASSET_TYPES)}")

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT * FROM portfolio_positions 
            WHERE user_id = ? AND asset_type = ? 
            ORDER BY buy_date DESC
            """,
            (user_id, asset_type),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_positions_by_symbol(
    symbol: str, user_id: str = "default"
) -> List[Dict[str, Any]]:
    """
    Get all positions for a specific symbol.

    Args:
        symbol: The ticker symbol
        user_id: User identifier (default: 'default')

    Returns:
        List of position dicts
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT * FROM portfolio_positions 
            WHERE user_id = ? AND symbol = ? 
            ORDER BY buy_date DESC
            """,
            (user_id, symbol),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def _validate_snapshot(snapshot: Dict[str, Any]) -> None:
    """Validate snapshot data. Raises ValueError if invalid."""
    if not snapshot.get("snapshot_date"):
        raise ValueError("snapshot_date is required")

    if not _validate_iso_date(snapshot["snapshot_date"]):
        raise ValueError("snapshot_date must be a valid ISO date (YYYY-MM-DD)")


def save_snapshot(snapshot: Dict[str, Any], user_id: str = "default") -> int:
    """
    Save a portfolio snapshot.

    Args:
        snapshot: Dict with keys: snapshot_date, total_value_usd, equity_value_usd,
                  commodity_value_usd, portfolio_score, equity_count, commodity_count
        user_id: User identifier (default: 'default')

    Returns:
        The ID of the newly created snapshot

    Raises:
        ValueError: If snapshot data is invalid
    """
    _validate_snapshot(snapshot)

    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO portfolio_snapshots (
                user_id, snapshot_date, total_value_usd, equity_value_usd,
                commodity_value_usd, portfolio_score, equity_count,
                commodity_count, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                snapshot["snapshot_date"],
                snapshot.get("total_value_usd"),
                snapshot.get("equity_value_usd"),
                snapshot.get("commodity_value_usd"),
                snapshot.get("portfolio_score"),
                snapshot.get("equity_count"),
                snapshot.get("commodity_count"),
                now,
            ),
        )
        conn.commit()

        cursor = conn.execute(
            """
            SELECT id FROM portfolio_snapshots 
            WHERE user_id = ? AND snapshot_date = ?
            """,
            (user_id, snapshot["snapshot_date"]),
        )
        row = cursor.fetchone()
        snapshot_id = row["id"] if row else 0
        logger.info(f"Saved snapshot for {snapshot['snapshot_date']}")
        return snapshot_id
    finally:
        conn.close()


def get_snapshots(user_id: str = "default", days: int = 90) -> List[Dict[str, Any]]:
    """
    Get portfolio snapshots for the last N days.

    Args:
        user_id: User identifier (default: 'default')
        days: Number of days to look back (default: 90)

    Returns:
        List of snapshot dicts, ordered by date descending
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT * FROM portfolio_snapshots 
            WHERE user_id = ? 
            AND date(snapshot_date) >= date('now', ?)
            ORDER BY snapshot_date DESC
            """,
            (user_id, f"-{days} days"),
        )
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()


def get_latest_snapshot(user_id: str = "default") -> Optional[Dict[str, Any]]:
    """
    Get the most recent portfolio snapshot.

    Args:
        user_id: User identifier (default: 'default')

    Returns:
        Snapshot dict or None if no snapshots exist
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT * FROM portfolio_snapshots 
            WHERE user_id = ? 
            ORDER BY snapshot_date DESC 
            LIMIT 1
            """,
            (user_id,),
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_position_count(user_id: str = "default") -> Dict[str, int]:
    """
    Get the count of positions by asset type.

    Args:
        user_id: User identifier (default: 'default')

    Returns:
        Dict with 'equity' and 'commodity' counts
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            SELECT asset_type, COUNT(*) as count 
            FROM portfolio_positions 
            WHERE user_id = ? 
            GROUP BY asset_type
            """,
            (user_id,),
        )
        counts = {"equity": 0, "commodity": 0}
        for row in cursor.fetchall():
            counts[row["asset_type"]] = row["count"]
        return counts
    finally:
        conn.close()


def get_physical_metal_info(symbol: str) -> Optional[Dict[str, str]]:
    """
    Get info for a physical metal symbol.

    Args:
        symbol: The physical metal symbol (e.g., "PHYS:XAU")

    Returns:
        Dict with name, price_ticker, default_unit or None if not a physical metal
    """
    return PHYSICAL_METALS.get(symbol)
