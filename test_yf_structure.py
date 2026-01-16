#!/usr/bin/env python3
"""Debug: Check actual structure of yfinance data."""

import sys
from pathlib import Path
import json

sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py.yf_client import fetch_financials, fetch_balance_sheet

print("=== Testing AAPL ===\n")

# Fetch financials
fin_data = fetch_financials("AAPL")
cashflow = fin_data.get("cashflow", {})
financials = fin_data.get("financials", {})

print(f"Cashflow keys: {list(cashflow.keys())[:5]}...")
print(f"Financials keys: {list(financials.keys())[:5]}...")

# Check if "Free Cash Flow" exists
if "Free Cash Flow" in cashflow:
    print(f"\n✅ 'Free Cash Flow' found in cashflow")
    print(f"   Type: {type(cashflow['Free Cash Flow'])}")
    print(f"   Keys (dates): {list(cashflow['Free Cash Flow'].keys())[:3]}")
else:
    print(f"\n❌ 'Free Cash Flow' NOT found")
    print(f"   Available keys: {list(cashflow.keys())[:10]}")

# Check balance sheet
bs_data = fetch_balance_sheet("AAPL")
bs = bs_data.get("balance_sheet", {})

print(f"\n\nBalance Sheet keys: {list(bs.keys())[:10]}...")

if "Total Debt" in bs:
    print(f"\n✅ 'Total Debt' found")
elif "Long Term Debt" in bs:
    print(f"\n✅ 'Long Term Debt' found (can use as proxy)")
    print(f"   Values: {bs['Long Term Debt']}")
else:
    print(f"\n❌ No debt field found")
    print(f"   Available: {[k for k in bs.keys() if 'Debt' in k or 'debt' in k]}")

if "Total Equity" in bs:
    print(f"\n✅ 'Total Equity' found")
elif "Stockholders Equity" in bs:
    print(f"\n✅ 'Stockholders Equity' found")
    print(f"   Values: {bs['Stockholders Equity']}")
else:
    print(f"\n❌ No equity field found")
    print(f"   Available: {[k for k in bs.keys() if 'Equity' in k or 'equity' in k]}")
