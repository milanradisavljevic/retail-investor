"""Shared helpers for advanced valuation formulas."""

from typing import Any, Dict

import numpy as np


def _get_nested(data: Dict[str, Any], path: str) -> Any:
    """Safely read nested dict fields using dot-separated paths."""
    cur: Any = data
    for key in path.split("."):
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def _require(value: Any, symbol: str, field_name: str) -> Any:
    """Raise when a required field is missing."""
    if value is None:
        raise ValueError(f"{symbol}: Kritisches Finnhub-Feld fehlt: {field_name}")
    return value


def _as_decimal_if_percent(x: float, symbol: str, field_name: str) -> float:
    """
    Finnhub liefert manche Kennzahlen als Prozent (z.B. 31.4 für 31.4%).
    Heuristik: Werte > 1.5 werden als Prozent interpretiert.
    """
    if not np.isfinite(x):
        raise ValueError(f"{symbol}: Ungültiger Wert für {field_name}: {x}")
    return x / 100.0 if x > 1.5 else x
