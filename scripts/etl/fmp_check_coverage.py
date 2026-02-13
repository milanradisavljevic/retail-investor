#!/usr/bin/env python3
"""
FMP coverage diagnostics for fundamentals_snapshot.

Usage:
  python scripts/etl/fmp_check_coverage.py --universe nasdaq100
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEFAULT_DB_PATH = ROOT / "data" / "privatinvestor.db"
UNIVERSES_DIR = ROOT / "config" / "universes"

FIELDS = [
    "peRatio",
    "pbRatio",
    "psRatio",
    "pegRatio",
    "roe",
    "roa",
    "grossMargin",
    "operatingMargin",
    "netMargin",
    "debtToEquity",
    "currentRatio",
    "dividendYield",
    "payoutRatio",
    "freeCashFlow",
    "marketCap",
    "enterpriseValue",
    "revenueGrowth",
    "earningsGrowth",
    "beta",
]


def emit(event: str, **payload: Any) -> None:
    print(json.dumps({"event": event, **payload}, sort_keys=True, default=str), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check FMP field coverage by universe")
    parser.add_argument("--universe", required=True, help="Universe name, e.g. nasdaq100")
    parser.add_argument(
        "--db-path",
        default=str(DEFAULT_DB_PATH),
        help="Path to privatinvestor SQLite DB",
    )
    return parser.parse_args()


def resolve_universe_path(universe_name: str) -> Path:
    raw = universe_name.strip()
    raw_path = Path(raw)
    if raw_path.exists():
        return raw_path

    aliases = {
        "nasdaq100": "nasdaq100-full",
        "sp500": "sp500-full",
        "russell2000": "russell2000_full",
        "dax40": "dax40-full",
        "cac40": "cac40-full",
        "eurostoxx50": "eurostoxx50-full",
        "ftse100": "ftse100-full",
    }
    normalized = raw.replace(".json", "")
    alias = aliases.get(normalized, normalized)
    candidates = [
        UNIVERSES_DIR / f"{alias}.json",
        UNIVERSES_DIR / f"{normalized}.json",
        UNIVERSES_DIR / f"{normalized}-full.json",
        UNIVERSES_DIR / f"{normalized}_full.json",
        UNIVERSES_DIR / f"{normalized.replace('-', '_')}.json",
        UNIVERSES_DIR / f"{normalized.replace('_', '-')}.json",
    ]
    for path in candidates:
        if path.exists():
            return path
    raise FileNotFoundError(f"Universe '{universe_name}' not found in {UNIVERSES_DIR}")


def load_symbols(path: Path) -> list[str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    symbols = data.get("symbols") if isinstance(data, dict) else data
    if not isinstance(symbols, list):
        raise ValueError(f"Universe file has no symbol list: {path}")
    return [str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()]


def chunked(items: list[str], size: int) -> list[list[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def load_latest_fmp_snapshots(
    conn: sqlite3.Connection, symbols: list[str]
) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    if not symbols:
        return latest

    for part in chunked(symbols, 500):
        placeholders = ", ".join("?" for _ in part)
        rows = conn.execute(
            f"""
            SELECT symbol, fetched_at, data_json
            FROM fundamentals_snapshot
            WHERE symbol IN ({placeholders})
              AND json_extract(data_json, '$._source') = 'fmp'
            ORDER BY symbol ASC, fetched_at DESC
            """,
            part,
        ).fetchall()
        for symbol, _fetched_at, data_json in rows:
            symbol = str(symbol)
            if symbol in latest:
                continue
            try:
                parsed = json.loads(str(data_json))
            except (TypeError, ValueError, json.JSONDecodeError):
                continue
            if isinstance(parsed, dict):
                latest[symbol] = parsed
    return latest


def main() -> int:
    args = parse_args()
    db_path = Path(args.db_path)
    if not db_path.exists():
        emit("fmp_check_coverage.error", error=f"DB not found: {db_path}")
        return 1

    try:
        universe_path = resolve_universe_path(args.universe)
        symbols = load_symbols(universe_path)
    except Exception as exc:  # noqa: BLE001
        emit("fmp_check_coverage.error", error=str(exc))
        return 1

    emit(
        "fmp_check_coverage.start",
        universe=args.universe,
        universe_file=str(universe_path),
        total_symbols=len(symbols),
        db_path=str(db_path),
    )

    conn = sqlite3.connect(db_path)
    try:
        latest = load_latest_fmp_snapshots(conn, symbols)
    finally:
        conn.close()

    with_fmp = len(latest)
    field_non_null: dict[str, int] = {field: 0 for field in FIELDS}
    symbol_null_counts: list[dict[str, Any]] = []

    for symbol, snapshot in latest.items():
        null_count = 0
        for field in FIELDS:
            value = snapshot.get(field)
            if value is None:
                null_count += 1
            else:
                field_non_null[field] += 1
        symbol_null_counts.append({"symbol": symbol, "null_fields": null_count})

    top_null_symbols = sorted(
        symbol_null_counts,
        key=lambda item: (-int(item["null_fields"]), str(item["symbol"])),
    )[:5]

    field_coverage = {
        field: {
            "non_null": count,
            "coverage_pct": round((count / with_fmp) * 100, 2) if with_fmp else 0.0,
        }
        for field, count in field_non_null.items()
    }

    emit(
        "fmp_check_coverage.summary",
        universe=args.universe,
        total_symbols=len(symbols),
        symbols_with_fmp_data=with_fmp,
        symbols_without_fmp_data=max(0, len(symbols) - with_fmp),
        symbol_coverage_pct=round((with_fmp / len(symbols)) * 100, 2) if symbols else 0.0,
        field_coverage=field_coverage,
        top_5_symbols_most_null=top_null_symbols,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
