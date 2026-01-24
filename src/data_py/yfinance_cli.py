#!/usr/bin/env python3
"""
CLI wrapper for YFinanceClient - invoked by TypeScript via child_process.

Usage:
    python3 yfinance_cli.py --symbol AAPL --method get_basic_financials
    python3 yfinance_cli.py --symbol MSFT --method get_quote
    python3 yfinance_cli.py --symbol JNJ --method get_candles --days_back 365
"""

import sys
import json
import argparse
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data_py.yfinance_adapter import YFinanceClient


def main():
    parser = argparse.ArgumentParser(description="YFinance CLI")
    parser.add_argument("--symbol", required=True, help="Stock symbol")
    parser.add_argument(
        "--method",
        required=True,
        choices=[
            "get_basic_financials",
            "get_quote",
            "get_company_profile",
            "get_candles",
            "get_analyst_data",
        ],
    )
    parser.add_argument(
        "--days_back",
        type=int,
        default=365,
        help="Days back for candles",
    )

    args = parser.parse_args()

    try:
        client = YFinanceClient(cache_ttl_hours=24)

        if args.method == "get_basic_financials":
            result = client.get_basic_financials(args.symbol)
        elif args.method == "get_quote":
            result = client.get_quote(args.symbol)
        elif args.method == "get_company_profile":
            result = client.get_company_profile(args.symbol)
        elif args.method == "get_candles":
            result = client.get_candles(args.symbol, days_back=args.days_back)
        elif args.method == "get_analyst_data":
            result = client.get_analyst_data(args.symbol)
        else:
            raise ValueError(f"Unsupported method: {args.method}")

        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    except Exception as exc:  # pragma: no cover - defensive CLI guard
        error = {"error": str(exc), "symbol": args.symbol, "method": args.method}
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
