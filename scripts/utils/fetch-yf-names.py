#!/usr/bin/env python3
"""
Fetch company names for a universe using yfinance.

Usage:
  python scripts/utils/fetch-yf-names.py [universe_json] [output_json]

Example:
  python scripts/utils/fetch-yf-names.py config/universes/russell2000_full_yf.json data/universe_metadata/russell2000_full_yf_names.json
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict

import yfinance as yf


def load_universe(path: Path) -> list[str]:
  data = json.loads(path.read_text())
  symbols = data.get("symbols", [])
  return [s.strip().upper() for s in symbols if isinstance(s, str) and s.strip()]


def fetch_name(symbol: str) -> Dict[str, Any]:
  try:
    ticker = yf.Ticker(symbol)
    info = ticker.get_info()
    short_name = info.get("shortName") or info.get("longName") or ""
    long_name = info.get("longName") or info.get("shortName") or ""
    industry = info.get("industry") or ""
    return {
      "symbol": symbol,
      "shortName": short_name,
      "longName": long_name,
      "industry": industry,
      "source": "yfinance",
    }
  except Exception as e:
    return {"symbol": symbol, "error": str(e)}


def main():
  if len(sys.argv) < 3:
    print("Usage: python scripts/utils/fetch-yf-names.py [universe_json] [output_json]")
    sys.exit(1)

  universe_path = Path(sys.argv[1])
  output_path = Path(sys.argv[2])
  output_path.parent.mkdir(parents=True, exist_ok=True)

  symbols = load_universe(universe_path)
  results = []

  for i, symbol in enumerate(symbols, 1):
    if i % 50 == 0:
      print(f"...{i}/{len(symbols)} processed")
    results.append(fetch_name(symbol))
    time.sleep(0.15)  # be gentle

  output_path.write_text(json.dumps(results, indent=2))
  print(f"Written {len(results)} entries to {output_path}")


if __name__ == "__main__":
  main()
