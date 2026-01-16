#!/usr/bin/env python3
"""Quick test to see if yfinance data is being extracted correctly."""

import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py.yfinance_adapter import YFinanceClient

client = YFinanceClient()

print("Testing AAPL...")
financials = client.get_basic_financials("AAPL")

print("\n=== Metric Fields ===")
metric = financials.get("metric", {})
print(f"Beta: {metric.get('beta')}")
print(f"ROE: {metric.get('roeTTM')}")
print(f"Total Debt: {metric.get('totalDebt')}")
print(f"Total Equity: {metric.get('totalEquity')}")

print("\n=== Annual Series ===")
series = financials.get("series", {}).get("annual", {})
print(f"Keys: {list(series.keys())}")

fcf = series.get("freeCashFlow", [])
print(f"\nFree Cash Flow ({len(fcf)} years):")
for item in fcf[:3]:
    print(f"  {item['period']}: ${item['v']:,.0f}")

ni = series.get("netIncome", [])
print(f"\nNet Income ({len(ni)} years):")
for item in ni[:3]:
    print(f"  {item['period']}: ${item['v']:,.0f}")
