#!/usr/bin/env python3
"""
Commodity/Macro Data Fetcher

Fetches 18 commodity/bond/macro tickers via yfinance and stores them in JSON format.
Used for macro context (heatmap, sparklines), NOT for scoring universes.

Usage:
    python scripts/etl/fetch_commodities.py              # Default: 1y history
    python scripts/etl/fetch_commodities.py --period 5y  # Custom period
    python scripts/etl/fetch_commodities.py --ticker GC=F  # Single ticker (debug)
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime, timezone
from math import isfinite
from pathlib import Path
from typing import Any, Dict, List, Optional

import yfinance as yf

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

MACRO_TICKERS: Dict[str, Dict[str, str]] = {
    "GC=F": {"name": "Gold", "category": "precious_metals"},
    "SI=F": {"name": "Silver", "category": "precious_metals"},
    "PL=F": {"name": "Platinum", "category": "precious_metals"},
    "PA=F": {"name": "Palladium", "category": "precious_metals"},
    "HG=F": {"name": "Copper", "category": "base_metals"},
    "ALI=F": {"name": "Aluminum", "category": "base_metals"},
    "CL=F": {"name": "WTI Crude Oil", "category": "energy"},
    "BZ=F": {"name": "Brent Crude", "category": "energy"},
    "NG=F": {"name": "Natural Gas", "category": "energy"},
    "ZW=F": {"name": "Wheat", "category": "agriculture"},
    "ZC=F": {"name": "Corn", "category": "agriculture"},
    "ZS=F": {"name": "Soybeans", "category": "agriculture"},
    "KC=F": {"name": "Coffee", "category": "agriculture"},
    "CC=F": {"name": "Cocoa", "category": "agriculture"},
    "^TNX": {"name": "10Y Treasury", "category": "rates"},
    "^IRX": {"name": "13W T-Bill", "category": "rates"},
    "^TYX": {"name": "30Y Treasury", "category": "rates"},
    "DX-Y.NYB": {"name": "US Dollar Index", "category": "currency"},
}

MAX_RETRIES = 3
BASE_BACKOFF = 1.0
OUTPUT_DIR = Path("data/macro")
OUTPUT_FILE = OUTPUT_DIR / "commodities.json"


def retry_fetch(
    fn, *, retries: int = MAX_RETRIES, backoff: float = BASE_BACKOFF
) -> Any:
    """
    Execute function with exponential backoff retry logic.

    Args:
        fn: Function to execute
        retries: Number of retry attempts
        backoff: Base backoff time in seconds (doubles each retry)

    Returns:
        Result of function call or None if all retries fail
    """
    last_exc = None
    for i in range(retries + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if i < retries:
                sleep_s = backoff * (2**i)
                logger.warning(
                    f"yfinance call failed ({type(exc).__name__}: {exc}), "
                    f"retrying in {sleep_s:.1f}s (attempt {i + 1}/{retries + 1})"
                )
                time.sleep(sleep_s)
    return None


def calculate_change(
    prices: List[float], current_idx: int, periods_back: int
) -> Optional[float]:
    """
    Calculate percentage change from N periods ago.

    Returns None if not enough data available.
    """
    if current_idx < periods_back:
        return None
    old_price = prices[current_idx - periods_back]
    if old_price == 0:
        return None
    return (prices[current_idx] - old_price) / old_price


def get_ytd_offset(dates: List[str]) -> Optional[int]:
    """
    Find the index of the first trading day of the current year.

    Returns None if no data for current year.
    """
    if not dates:
        return None
    current_year = datetime.now().year
    year_start = f"{current_year}-01-01"

    for i, date in enumerate(dates):
        if date >= year_start:
            return i
    return None


def fetch_ticker_data(
    symbol: str, meta: Dict[str, str], period: str = "1y"
) -> Dict[str, Any]:
    """
    Fetch and process data for a single ticker.

    Returns a dict with price data, changes, and sparkline.
    """
    result: Dict[str, Any] = {
        "name": meta["name"],
        "category": meta["category"],
        "price_current": None,
        "price_currency": "USD",
        "change_1d": None,
        "change_1w": None,
        "change_1m": None,
        "change_3m": None,
        "change_ytd": None,
        "sparkline_30d": [],
        "last_updated": None,
        "data_quality": "ok",
    }

    def _fetch():
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval="1d", auto_adjust=False)

        if hist.empty:
            logger.warning(f"{symbol}: No data returned")
            return None

        return hist

    df = retry_fetch(_fetch)

    if df is None or df.empty:
        result["data_quality"] = "failed"
        return result

    try:
        df = df.reset_index()
        df.columns = [c.lower() for c in df.columns]

        if "close" not in df.columns:
            logger.warning(f"{symbol}: Missing close column")
            result["data_quality"] = "failed"
            return result

        # Keep only rows with usable close values to avoid NaN propagation in JSON output.
        df = df[df["close"].notna()].copy()
        df = df[df["close"].map(lambda value: isfinite(float(value)))].copy()
        if df.empty:
            logger.warning(f"{symbol}: No valid close values after filtering")
            result["data_quality"] = "failed"
            return result

        if "date" in df.columns:
            df["date"] = df["date"].dt.strftime("%Y-%m-%d")

        closes = [float(v) for v in df["close"].tolist()]
        dates = df["date"].tolist() if "date" in df.columns else []

        if not closes:
            result["data_quality"] = "failed"
            return result

        current_price = closes[-1]
        if not isfinite(current_price):
            result["data_quality"] = "failed"
            return result
        result["price_current"] = round(current_price, 4)
        result["last_updated"] = (
            dates[-1] if dates else datetime.now().strftime("%Y-%m-%d")
        )

        result["change_1d"] = calculate_change(closes, len(closes) - 1, 1)
        result["change_1w"] = calculate_change(closes, len(closes) - 1, 5)
        result["change_1m"] = calculate_change(closes, len(closes) - 1, 21)
        result["change_3m"] = calculate_change(closes, len(closes) - 1, 63)

        ytd_offset = get_ytd_offset(dates)
        if ytd_offset is not None and ytd_offset < len(closes) - 1:
            ytd_change = calculate_change(
                closes, len(closes) - 1, len(closes) - 1 - ytd_offset
            )
            result["change_ytd"] = ytd_change

        for change_field in [
            "change_1d",
            "change_1w",
            "change_1m",
            "change_3m",
            "change_ytd",
        ]:
            if result[change_field] is not None:
                result[change_field] = round(result[change_field], 6)

        sparkline_start = max(0, len(closes) - 30)
        result["sparkline_30d"] = [round(c, 4) for c in closes[sparkline_start:]]

    except Exception as e:
        logger.error(f"{symbol}: Error processing data: {e}")
        result["data_quality"] = "failed"

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Fetch commodity/macro data via yfinance"
    )
    parser.add_argument(
        "--period",
        type=str,
        default="1y",
        help="Time period to fetch (default: 1y). Examples: 1y, 2y, 5y",
    )
    parser.add_argument(
        "--ticker",
        type=str,
        default=None,
        help="Fetch single ticker only (for debugging)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path (default: data/macro/commodities.json)",
    )

    args = parser.parse_args()

    output_file = Path(args.output) if args.output else OUTPUT_FILE
    output_dir = output_file.parent

    output_dir.mkdir(parents=True, exist_ok=True)

    if args.ticker and args.ticker not in MACRO_TICKERS:
        logger.error(f"Unknown ticker: {args.ticker}")
        logger.info(f"Valid tickers: {', '.join(MACRO_TICKERS.keys())}")
        sys.exit(1)

    tickers_to_fetch = (
        {args.ticker: MACRO_TICKERS[args.ticker]} if args.ticker else MACRO_TICKERS
    )

    logger.info(f"Starting commodity/macro data fetch")
    logger.info(f"Period: {args.period}")
    logger.info(f"Tickers: {len(tickers_to_fetch)}")
    logger.info(f"Output: {output_file}")

    start_time = time.time()

    results: Dict[str, Any] = {
        "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tickers": {},
        "summary": {
            "total": len(tickers_to_fetch),
            "success": 0,
            "failed": [],
            "fetch_duration_seconds": 0,
        },
    }

    for i, (symbol, meta) in enumerate(tickers_to_fetch.items(), 1):
        logger.info(
            f"[{i}/{len(tickers_to_fetch)}] Fetching {symbol} ({meta['name']})..."
        )

        ticker_data = fetch_ticker_data(symbol, meta, period=args.period)
        results["tickers"][symbol] = ticker_data

        if ticker_data["data_quality"] == "ok":
            results["summary"]["success"] += 1
        else:
            results["summary"]["failed"].append(symbol)

        time.sleep(0.3)

    fetch_duration = time.time() - start_time
    results["summary"]["fetch_duration_seconds"] = round(fetch_duration, 2)

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    logger.info(f"Results saved to {output_file}")

    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Total tickers:     {results['summary']['total']}")
    print(f"  Success:           {results['summary']['success']}")
    print(f"  Failed:            {len(results['summary']['failed'])}")
    if results["summary"]["failed"]:
        print(f"  Failed tickers:    {', '.join(results['summary']['failed'])}")
    print(f"  Duration:          {results['summary']['fetch_duration_seconds']:.1f}s")
    print(f"  Output:            {output_file}")

    success_rate = results["summary"]["success"] / results["summary"]["total"] * 100
    print(
        f"\n{results['summary']['success']}/{results['summary']['total']} tickers fetched successfully ({success_rate:.0f}%)"
    )


if __name__ == "__main__":
    main()
