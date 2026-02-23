#!/usr/bin/env python3
from __future__ import annotations

"""
CLI wrapper for Monte Carlo Fair Value calculation - invoked by TypeScript via child_process.

Usage:
    python3 monte_carlo_cli.py --symbol AAPL --iterations 1000
    python3 monte_carlo_cli.py --symbol MSFT --iterations 100 --risk_free_rate 0.045
"""

import sys
import json
import argparse
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))


class FinnhubClientAdapter:
    """
    Adapter to make FinnhubClient compatible with formula module expectations.

    The formula modules expect methods like:
    - company_basic_financials(symbol, metric)
    - quote(symbol)
    - company_profile2(symbol)

    But FinnhubClient has:
    - get_basic_financials(symbol)
    - get_quote(symbol)
    - get_company_profile(symbol)
    """

    def __init__(self, finnhub_client):
        self.client = finnhub_client

    def company_basic_financials(self, symbol: str, metric: str = "all"):
        """Adapter for company_basic_financials method."""
        return self.client.get_basic_financials(symbol)

    def quote(self, symbol: str):
        """Adapter for quote method."""
        return self.client.get_quote(symbol)

    def company_profile2(self, symbol: str):
        """Adapter for company_profile2 method."""
        return self.client.get_company_profile(symbol)


def main():
    parser = argparse.ArgumentParser(
        description="Monte Carlo Fair Value CLI"
    )
    parser.add_argument(
        "--symbol",
        required=True,
        help="Stock symbol"
    )
    parser.add_argument(
        "--iterations",
        type=int,
        default=1000,
        help="Number of Monte Carlo iterations (must be even, default: 1000)"
    )
    parser.add_argument(
        "--risk_free_rate",
        type=float,
        default=0.04,
        help="Risk-free rate (default: 0.04)"
    )
    parser.add_argument(
        "--market_risk_premium",
        type=float,
        default=0.055,
        help="Market risk premium (default: 0.055)"
    )

    args = parser.parse_args()

    try:
        # Import heavy dependencies lazily so "--help" works even when optional
        # runtime packages (e.g. numpy) are missing in the current Python env.
        from scoring.formulas.monte_carlo_lite import calculate_monte_carlo_fair_value
        from data_py.finnhub_client import FinnhubClient
        from data_py.cache import SQLiteCache

        # Get Finnhub API key from environment
        api_key = os.environ.get("FINNHUB_API_KEY")
        if not api_key:
            raise ValueError("FINNHUB_API_KEY environment variable not set")

        # Initialize cache
        cache_dir = Path(__file__).parent.parent.parent / "data"
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache = SQLiteCache(str(cache_dir / "privatinvestor.db"))

        # Create Finnhub client
        finnhub_client = FinnhubClient(api_key=api_key, cache=cache)

        # Wrap with adapter
        client_adapter = FinnhubClientAdapter(finnhub_client)

        # Calculate Monte Carlo fair value
        result = calculate_monte_carlo_fair_value(
            args.symbol,
            client_adapter,
            iterations=args.iterations,
            risk_free_rate=args.risk_free_rate,
            market_risk_premium=args.market_risk_premium,
        )

        # Output JSON to stdout
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)

    except Exception as exc:  # pragma: no cover - defensive CLI guard
        error = {
            "error": str(exc),
            "symbol": args.symbol,
            "iterations": args.iterations,
        }
        print(json.dumps(error), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
