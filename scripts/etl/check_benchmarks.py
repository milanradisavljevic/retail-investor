#!/usr/bin/env python3
"""
Quick regression check to ensure benchmark prices exist in SQLite.

Usage:
  python scripts/etl/check_benchmarks.py --db data/market-data.db --symbols IWM
"""

import argparse
import sqlite3
from pathlib import Path
from typing import List


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check benchmark price coverage in SQLite")
    parser.add_argument("--db", default="data/market-data.db", help="Path to SQLite DB")
    parser.add_argument(
        "--symbols",
        default="IWM",
        help="Comma-separated list of symbols to verify (default: IWM)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db_path = Path(args.db)
    symbols: List[str] = [s.strip().upper() for s in args.symbols.split(",") if s.strip()]

    if not db_path.exists():
        print(f"❌ DB not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    success = True
    for sym in symbols:
        cursor.execute(
            "SELECT COUNT(*), MIN(date), MAX(date) FROM prices WHERE symbol = ?",
            (sym,),
        )
        count, min_date, max_date = cursor.fetchone()
        if count == 0:
            print(f"❌ Missing prices for {sym}")
            success = False
        else:
            print(f"✅ {sym}: {count} rows from {min_date} to {max_date}")

    conn.close()
    return 0 if success else 2


if __name__ == "__main__":
    raise SystemExit(main())
