#!/usr/bin/env python3
"""
Historical Data Fetcher for Backtesting

Downloads OHLCV data from Yahoo Finance for all symbols in a universe.
Saves to data/backtesting/historical/{SYMBOL}.csv

Usage:
    python scripts/backtesting/fetch-historical.py [universe-name]

Examples:
    python scripts/backtesting/fetch-historical.py           # defaults to sp500
    python scripts/backtesting/fetch-historical.py russell2000
    python scripts/backtesting/fetch-historical.py nasdaq100
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

import yfinance as yf
import pandas as pd

# Configuration
# Extended period for comprehensive backtesting (10+ years)
START_DATE = os.environ.get("BACKTEST_START", "2015-01-01")
END_DATE = os.environ.get("BACKTEST_END", "2025-12-31")
OUTPUT_DIR = Path("data/backtesting/historical")
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds
YAHOO_ALIASES: dict[str, str] = {
    # S&P 500 renames/share classes
    "ABC": "COR",  # AmerisourceBergen -> Cencora
    "BF.B": "BF-B",
    "BRK.B": "BRK-B",
    "CDAY": "DAY",  # Ceridian -> Dayforce
    "FLT": "CPAY",  # FLEETCOR -> Corpay
    "PEAK": "DOC",  # Healthpeak -> Physicians Realty/Healthpeak merger
    "PKI": "RVTY",  # PerkinElmer -> Revvity
    # Russell 2000 share classes/aliases
    "MOGA": "MOG-A",
    "GEFB": "GEF-B",
    "CRDA": "CRD-A",
}

# Get universe from CLI arg, env var, or default to sp500
# - CLI arg wins for explicit runs
# - Env var enables `UNIVERSE=... npm run backtest`
UNIVERSE_NAME = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("UNIVERSE", "sp500")
UNIVERSE_FILE = Path(f"config/universes/{UNIVERSE_NAME}.json")


def load_universe() -> tuple[list[str], str]:
    """Load symbols from universe config file."""
    if not UNIVERSE_FILE.exists():
        print(f"[ERROR] Universe file not found: {UNIVERSE_FILE}")
        sys.exit(1)

    with open(UNIVERSE_FILE, "r") as f:
        data = json.load(f)
    symbols = data.get("symbols", [])
    benchmark = data.get("benchmark", "SPY")

    # Add benchmark if not in symbols
    if benchmark not in symbols:
        symbols.append(benchmark)
    return symbols, benchmark


def fetch_symbol(symbol: str) -> pd.DataFrame | None:
    """
    Fetch OHLCV data for a single symbol with retry logic.

    Returns DataFrame with columns: date, open, high, low, close, volume
    """
    for attempt in range(MAX_RETRIES):
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(start=START_DATE, end=END_DATE, auto_adjust=True)

            if df.empty:
                print(f"  [WARN] {symbol}: No data returned")
                return None

            # Reset index to make date a column
            df = df.reset_index()

            # Rename columns to lowercase
            df.columns = [c.lower() for c in df.columns]

            # Keep only required columns
            df = df[["date", "open", "high", "low", "close", "volume"]]

            # Convert date to string format
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")

            return df

        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                print(f"  [RETRY] {symbol}: {e} (attempt {attempt + 1}/{MAX_RETRIES})")
                time.sleep(RETRY_DELAY)
            else:
                print(f"  [ERROR] {symbol}: {e} (failed after {MAX_RETRIES} attempts)")
                return None

    return None


def main():
    """Main entry point."""
    print("=" * 60)
    print("Historical Data Fetcher for Backtesting")
    print(f"Universe: {UNIVERSE_NAME}")
    print(f"Period: {START_DATE} to {END_DATE}")
    print("=" * 60)

    # Create output directory
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load universe
    symbols, benchmark = load_universe()
    print(f"\nLoaded {len(symbols)} symbols from {UNIVERSE_FILE}")
    print(f"Benchmark: {benchmark}")

    # Track stats
    success_count = 0
    fail_count = 0
    skip_count = 0

    # Fetch each symbol
    for i, symbol in enumerate(symbols, 1):
        output_file = OUTPUT_DIR / f"{symbol}.csv"
        fetch_symbol_name = YAHOO_ALIASES.get(symbol, symbol)
        alias_note = f" (alias {fetch_symbol_name})" if fetch_symbol_name != symbol else ""

        # Skip if already exists (incremental mode)
        if output_file.exists():
            skip_count += 1
            print(f"[{i}/{len(symbols)}] {symbol}: Skipped (already exists)")
            continue

        print(f"[{i}/{len(symbols)}] {symbol}: Fetching...{alias_note}")

        df = fetch_symbol(fetch_symbol_name)

        if df is not None and not df.empty:
            df.to_csv(output_file, index=False)
            success_count += 1
            print(f"  [OK] Saved {len(df)} rows to {output_file}")
        else:
            fail_count += 1

        # Small delay to avoid rate limiting
        time.sleep(0.5)

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)
    print(f"  Total symbols:  {len(symbols)}")
    print(f"  Downloaded:     {success_count}")
    print(f"  Skipped:        {skip_count}")
    print(f"  Failed:         {fail_count}")
    print(f"  Output dir:     {OUTPUT_DIR.absolute()}")

    if fail_count > 0:
        print(f"\n[WARN] {fail_count} symbols failed. Check logs above.")
        # Do not fail the pipeline for large universes where some symbols
        # (delisted/illiquid/invalid tickers) are expected to fail.
        if success_count == 0:
            sys.exit(1)
        print("[WARN] Continuing with partial dataset.")
    else:
        print("\n[OK] All data fetched successfully!")


if __name__ == "__main__":
    main()
