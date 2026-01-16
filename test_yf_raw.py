#!/usr/bin/env python3
"""Check raw yfinance DataFrame structure."""

import yfinance as yf

ticker = yf.Ticker("AAPL")
cf = ticker.cashflow

print("=== Cashflow DataFrame ===")
print(f"Shape: {cf.shape}")
print(f"Columns (dates): {list(cf.columns)[:3]}")
print(f"Index (line items): {list(cf.index)[:10]}")

print("\n=== First few rows ===")
print(cf.head(10))

print("\n=== Checking for Free Cash Flow ===")
if "Free Cash Flow" in cf.index:
    print("✅ Found as index item!")
    print(f"   Values: {cf.loc['Free Cash Flow'].to_dict()}")
else:
    print("❌ Not in index")
    print(f"   Available items with 'Cash': {[i for i in cf.index if 'Cash' in i]}")
