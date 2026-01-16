#!/usr/bin/env python3
"""
Debug script to see what data Finnhub actually returns.
"""

import os
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py import FinnhubClient, SQLiteCache

def main():
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        print("FINNHUB_API_KEY not set (export or add to .env.local)")
        return 1
    cache = SQLiteCache(db_path="data/cache/finnhub_test.db", ttl_hours=24)
    client = FinnhubClient(api_key=api_key, cache=cache)

    symbol = "AAPL"
    print(f"Fetching data for {symbol}...\n")

    response = client.get_basic_financials(symbol)

    print("="*70)
    print(f"FULL RESPONSE FOR {symbol}:")
    print("="*70)
    print(json.dumps(response, indent=2))

    print("\n" + "="*70)
    print("CHECKING REQUIRED FIELDS:")
    print("="*70)

    required_fields = [
        "beta", "roic", "grossMargin", "enterpriseValueOverEBITDA",
        "freeCashFlow", "priceBookMrq", "marketCapitalization",
        "totalDebt", "totalEquity", "roa"
    ]

    metrics = response.get("metric", {})

    for field in required_fields:
        value = metrics.get(field)
        status = "✓" if value is not None else "✗"
        print(f"{status} {field:30s}: {value}")

    print("\n" + "="*70)
    print("AVAILABLE FIELDS:")
    print("="*70)
    for key in sorted(metrics.keys()):
        if metrics[key] is not None:
            print(f"  {key}: {metrics[key]}")

    client.close()

if __name__ == "__main__":
    main()
