#!/usr/bin/env python3
"""
ETF Metadata ETL Script

Fetches metadata for ETFs from yfinance and stores structured data.
Supports filtering by ticker or category.

Usage:
    python fetch_etf_metadata.py [--ticker SPY] [--category broad_market]
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import yfinance as yf

# Project root detection
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
CONFIG_DIR = PROJECT_ROOT / "config" / "universes"
DATA_DIR = PROJECT_ROOT / "data" / "etf"

# Rate limiting config
RATE_LIMIT_DELAY = 0.34  # ~3 req/s
MAX_RETRIES = 3
RETRY_DELAY = 2.0  # seconds

# Category mapping for auto-detection
CATEGORY_SYMBOL_MAP = {
    "broad_market": ["SPY", "VOO", "IVV", "QQQ", "IWM", "EUNL.DE", "IWDA.AS", "EEM", "VWO", "VT", "VWRL.AS", "DIA"],
    "sector": ["XLF", "XLK", "XLE", "XLV", "XLI", "XLP", "XLY", "XLU", "XLB", "XLRE", "SMH", "XBI", "TAN", "ICLN", "ARKK", "ARKG"],
    "factor": ["MTUM", "QUAL", "VLUE", "USMV", "SIZE", "MOAT", "VIG", "SCHD"],
    "fixed_income": ["TLT", "IEF", "SHY", "AGG", "BND", "LQD", "HYG", "TIP"],
    "commodity": ["GLD", "IAU", "SLV", "USO", "UNG", "DBC", "PPLT", "PALL"],
    "regional": ["EWG", "EWU", "EWQ", "EWI", "EWJ", "FXI", "EWZ", "EWA", "INDA", "EWT", "EWY", "HMCH.DE"],
    "thematic": ["BOTZ", "DRIV", "HACK", "SOXX", "IGV", "CIBR", "LIT", "URA"],
    "crypto": ["BITO", "IBIT", "ETHE", "GBTC"],
}

# Management style heuristics
PASSIVE_PROVIDERS = ["vanguard", "ishares", "spdr", "state street", "schwab", "invesco (qqq)", "jpmorgan"]
ACTIVE_PROVIDERS = ["ark", "wood", "active"]

# Asset class heuristics
COMMODITY_KEYWORDS = ["gold", "silver", "oil", "gas", "commodity", "precious metal", "platinum", "palladium"]
FIXED_INCOME_KEYWORDS = ["treasury", "bond", "aggregate", "corporate", "high yield", "tips", "fixed income"]
CRYPTO_KEYWORDS = ["bitcoin", "ethereum", "crypto", "gbtc", "bito"]
EQUITY_KEYWORDS = ["equity", "stock", "etf"]  # Default


def load_etf_universe() -> dict:
    """Load ETF universe from config file."""
    universe_path = CONFIG_DIR / "etf_global.json"
    if not universe_path.exists():
        raise FileNotFoundError(f"ETF universe not found: {universe_path}")
    
    with open(universe_path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_symbols_to_fetch(ticker: Optional[str] = None, category: Optional[str] = None) -> list[str]:
    """Get list of symbols to fetch based on filters."""
    universe = load_etf_universe()
    
    if ticker:
        return [ticker]
    
    if category:
        categories = universe.get("categories", {})
        if category in categories:
            return categories[category].get("symbols", [])
        else:
            print(f"Warning: Unknown category '{category}', fetching all")
    
    # Default: all symbols
    return universe.get("symbols", [])


def detect_distribution_policy(info: dict) -> str:
    """Detect if ETF is accumulating or distributing based on dividend yield."""
    dividend_yield = info.get("dividendYield", None)
    if dividend_yield is None:
        # Try alternative field
        dividend_yield = info.get("trailingAnnualDividendYield", 0)
    
    if dividend_yield and dividend_yield > 0:
        return "distributing"
    return "accumulating"


def detect_management_style(name: str, fund_family: str) -> str:
    """Detect passive vs active management style using heuristics."""
    name_lower = (name or "").lower()
    family_lower = (fund_family or "").lower()
    
    # Check for active providers first
    for keyword in ACTIVE_PROVIDERS:
        if keyword in name_lower or keyword in family_lower:
            return "active"
    
    # Check for passive providers
    for provider in PASSIVE_PROVIDERS:
        if provider in family_lower or provider in name_lower:
            return "passive"
    
    # Default to passive for index-tracking ETFs
    index_keywords = ["index", "s&p", "nasdaq", "russell", "msci", "ftse"]
    for kw in index_keywords:
        if kw in name_lower:
            return "passive"
    
    return "passive"  # Default assumption


def detect_asset_class(name: str, category: str) -> str:
    """Detect asset class from name and category."""
    name_lower = (name or "").lower()
    category_lower = (category or "").lower()
    
    # Check crypto first
    for kw in CRYPTO_KEYWORDS:
        if kw in name_lower or kw in category_lower:
            return "crypto"
    
    # Check commodities
    for kw in COMMODITY_KEYWORDS:
        if kw in name_lower or kw in category_lower:
            return "commodity"
    
    # Check fixed income
    for kw in FIXED_INCOME_KEYWORDS:
        if kw in name_lower or kw in category_lower:
            return "fixed_income"
    
    # Default to equity
    return "equity"


def detect_etf_category(symbol: str, name: str, category_info: str) -> str:
    """Detect which of the 8 categories an ETF belongs to."""
    # First check by symbol mapping
    for cat, symbols in CATEGORY_SYMBOL_MAP.items():
        if symbol in symbols:
            return cat
    
    # Fallback to name-based detection
    name_lower = (name or "").lower()
    
    if any(kw in name_lower for kw in ["treasury", "bond", "aggregate"]):
        return "fixed_income"
    if any(kw in name_lower for kw in ["gold", "silver", "oil", "commodity"]):
        return "commodity"
    if any(kw in name_lower for kw in ["bitcoin", "ethereum", "crypto"]):
        return "crypto"
    if any(kw in name_lower for kw in ["momentum", "quality", "value", "volatility", "dividend"]):
        return "factor"
    if any(kw in name_lower for kw in ["robotics", "cyber", "lithium", "uranium", "software"]):
        return "thematic"
    if any(kw in name_lower for kw in ["germany", "uk", "japan", "china", "brazil", "india", "taiwan", "korea"]):
        return "regional"
    if any(kw in name_lower for kw in ["financial", "tech", "energy", "healthcare", "biotech", "solar"]):
        return "sector"
    
    return "broad_market"  # Default


def get_benchmark_index(symbol: str, name: str) -> Optional[str]:
    """Extract or infer benchmark index from ETF name."""
    name_upper = (name or "").upper()
    
    benchmarks = {
        "S&P 500": ["SPY", "VOO", "IVV"],
        "Nasdaq 100": ["QQQ"],
        "Russell 2000": ["IWM"],
        "MSCI World": ["EUNL.DE", "IWDA.AS"],
        "MSCI Emerging Markets": ["EEM", "VWO"],
        "FTSE All-World": ["VT", "VWRL.AS"],
        "Dow Jones Industrial Average": ["DIA"],
        "S&P 500 Financials": ["XLF"],
        "S&P 500 Technology": ["XLK"],
        "S&P 500 Energy": ["XLE"],
        "S&P 500 Healthcare": ["XLV"],
        "S&P 500 Industrials": ["XLI"],
        "S&P 500 Consumer Staples": ["XLP"],
        "S&P 500 Consumer Discretionary": ["XLY"],
        "S&P 500 Utilities": ["XLU"],
        "S&P 500 Materials": ["XLB"],
        "S&P 500 Real Estate": ["XLRE"],
        "PHLX Semiconductor": ["SMH", "SOXX"],
        "NYSE Biotechnology": ["XBI"],
        "MAC Global Solar Energy": ["TAN"],
        "S&P Global Clean Energy": ["ICLN"],
        "MSCI USA Momentum": ["MTUM"],
        "MSCI USA Quality": ["QUAL"],
        "MSCI USA Value": ["VLUE"],
        "MSCI USA Minimum Volatility": ["USMV"],
        "Russell 2000 Small Cap": ["SIZE"],
        "Morningstar Wide Moat": ["MOAT"],
        "S&P US Dividend Growers": ["VIG"],
        "Dow Jones US Dividend 100": ["SCHD"],
        "ICE 20+ Year Treasury": ["TLT"],
        "ICE 7-10 Year Treasury": ["IEF"],
        "ICE 1-3 Year Treasury": ["SHY"],
        "Bloomberg US Aggregate": ["AGG", "BND"],
        "Bloomberg US Corporate": ["LQD"],
        "Bloomberg High Yield": ["HYG"],
        "Bloomberg US TIPS": ["TIP"],
        "Gold Bullion": ["GLD", "IAU"],
        "Silver Bullion": ["SLV"],
        "WTI Crude Oil": ["USO"],
        "Natural Gas": ["UNG"],
        "Bloomberg Commodity": ["DBC"],
        "Platinum Bullion": ["PPLT"],
        "Palladium Bullion": ["PALL"],
        "MSCI Germany": ["EWG"],
        "MSCI UK": ["EWU"],
        "MSCI France": ["EWQ"],
        "MSCI Italy": ["EWI"],
        "MSCI Japan": ["EWJ"],
        "FTSE China 50": ["FXI"],
        "MSCI Brazil": ["EWZ"],
        "MSCI Australia": ["EWA"],
        "MSCI India": ["INDA"],
        "MSCI Taiwan": ["EWT"],
        "MSCI South Korea": ["EWY"],
        "MSCI China": ["HMCH.DE"],
        "Indxx Global Robotics & AI": ["BOTZ"],
        "Indxx Autonomous & Electric Vehicles": ["DRIV"],
        "NYSE Arca Cybersecurity": ["HACK", "CIBR"],
        "NYSE Arca Software": ["IGV"],
        "Global X Lithium & Battery": ["LIT"],
        "MVIS Global Uranium": ["URA"],
        "Bitcoin Futures": ["BITO"],
        "Bitcoin Spot": ["IBIT", "GBTC"],
        "Ethereum": ["ETHE"],
    }
    
    for benchmark, etf_symbols in benchmarks.items():
        if symbol in etf_symbols:
            return benchmark
    
    return None


def fetch_top_holdings(ticker: yf.Ticker) -> list[dict]:
    """Fetch top 10 holdings for an ETF."""
    try:
        # yfinance provides holdings via the holdings attribute
        holdings = getattr(ticker, 'holdings', None)
        if not holdings:
            return []
        
        top_holdings = []
        # holdings is typically a dict with 'symbol' and 'holding' keys
        if isinstance(holdings, dict):
            symbols = holdings.get('symbol', [])
            weights = holdings.get('holding', [])
            
            # Handle different data structures
            if isinstance(symbols, list) and isinstance(weights, list):
                for i in range(min(len(symbols), len(weights), 10)):
                    symbol = symbols[i] if i < len(symbols) else f"Holding {i+1}"
                    weight = weights[i] if i < len(weights) else 0
                    if isinstance(weight, (int, float)):
                        top_holdings.append({
                            "symbol": str(symbol),
                            "weight": round(float(weight), 4),
                            "name": str(symbol)
                        })
        return top_holdings
    except Exception as e:
        print(f"  Warning: Could not fetch holdings: {e}")
        return []


def fetch_etf_metadata(symbol: str) -> Optional[dict]:
    """Fetch metadata for a single ETF."""
    print(f"Fetching {symbol}...")
    
    ticker = yf.Ticker(symbol)
    
    for attempt in range(MAX_RETRIES):
        try:
            info = ticker.info
            
            if not info or "symbol" not in info:
                print(f"  Warning: No info returned for {symbol}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(RETRY_DELAY)
                    continue
                return None
            
            # Extract basic info
            name = info.get("longName", info.get("shortName", symbol))
            fund_family = info.get("fundFamily", "")
            category_info = info.get("category", "")
            
            # Detect properties
            distribution_policy = detect_distribution_policy(info)
            management_style = detect_management_style(name, fund_family)
            asset_class = detect_asset_class(name, category_info)
            etf_category = detect_etf_category(symbol, name, category_info)
            benchmark = get_benchmark_index(symbol, name)
            
            # Get holdings
            top_holdings = fetch_top_holdings(ticker)
            
            # Build metadata record
            metadata = {
                "name": name,
                "ticker": symbol,
                "expense_ratio": info.get("annualReportExpenseRatio", None),
                "aum": info.get("totalAssets", info.get("netAssets", None)),
                "category": category_info if category_info else None,
                "fund_family": fund_family if fund_family else None,
                "distribution_policy": distribution_policy,
                "management_style": management_style,
                "asset_class": asset_class,
                "etf_category": etf_category,
                "top_holdings": top_holdings if top_holdings else [],
                "benchmark_index": benchmark,
                "inception_date": info.get("fundInceptionDate", None),
                "currency": info.get("currency", "USD"),
                "exchange": info.get("exchange", "Unknown"),
                "data_quality": "ok"
            }
            
            # Validate critical fields
            if metadata["expense_ratio"] is None:
                metadata["data_quality"] = "warning: missing expense_ratio"
            
            print(f"  ✓ {name} ({etf_category}, {asset_class})")
            return metadata
            
        except Exception as e:
            print(f"  Error fetching {symbol} (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
            if attempt < MAX_RETRIES - 1:
                time.sleep(RETRY_DELAY)
            else:
                return {
                    "name": symbol,
                    "ticker": symbol,
                    "expense_ratio": None,
                    "aum": None,
                    "category": None,
                    "fund_family": None,
                    "distribution_policy": "unknown",
                    "management_style": "unknown",
                    "asset_class": "unknown",
                    "etf_category": "unknown",
                    "top_holdings": [],
                    "benchmark_index": None,
                    "inception_date": None,
                    "currency": "USD",
                    "exchange": "Unknown",
                    "data_quality": f"error: {str(e)}"
                }
    
    return None


def run_etl(ticker: Optional[str] = None, category: Optional[str] = None):
    """Run the full ETL process."""
    # Ensure output directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Get symbols to fetch
    symbols = get_symbols_to_fetch(ticker, category)
    
    if not symbols:
        print("No symbols to fetch. Exiting.")
        return
    
    print(f"\n{'='*60}")
    print(f"ETF Metadata ETL")
    print(f"{'='*60}")
    print(f"Symbols to fetch: {len(symbols)}")
    if ticker:
        print(f"Filter: ticker={ticker}")
    elif category:
        print(f"Filter: category={category}")
    print(f"{'='*60}\n")
    
    # Fetch metadata for all symbols
    results = {}
    failed = []
    start_time = time.time()
    
    for i, symbol in enumerate(symbols):
        metadata = fetch_etf_metadata(symbol)
        
        if metadata:
            results[symbol] = metadata
            if metadata.get("data_quality", "ok").startswith("error"):
                failed.append(symbol)
        else:
            failed.append(symbol)
        
        # Rate limiting (except for last item)
        if i < len(symbols) - 1:
            time.sleep(RATE_LIMIT_DELAY)
    
    elapsed = time.time() - start_time
    
    # Build output structure
    output = {
        "fetched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "etfs": results,
        "summary": {
            "total": len(symbols),
            "success": len(symbols) - len(failed),
            "failed": failed,
            "elapsed_seconds": round(elapsed, 2)
        }
    }
    
    # Write output
    output_path = DATA_DIR / "metadata.json"
    
    # Merge with existing data if appending
    existing_data = {"etfs": {}, "summary": {}}
    if output_path.exists():
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        except Exception:
            pass
    
    # Merge ETFs
    merged_etfs = {**existing_data.get("etfs", {}), **results}
    output["etfs"] = merged_etfs
    
    # Update summary
    existing_summary = existing_data.get("summary", {})
    output["summary"] = {
        "total": len(merged_etfs),
        "success": len([e for e in merged_etfs.values() if not e.get("data_quality", "").startswith("error")]),
        "failed": [s for s, e in merged_etfs.items() if e.get("data_quality", "").startswith("error")],
        "last_updated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "last_run_elapsed_seconds": round(elapsed, 2)
    }
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    
    # Print summary
    print(f"\n{'='*60}")
    print(f"ETL Complete")
    print(f"{'='*60}")
    print(f"Total: {len(symbols)}")
    print(f"Success: {len(symbols) - len(failed)}")
    print(f"Failed: {len(failed)}")
    if failed:
        print(f"Failed symbols: {', '.join(failed)}")
    print(f"Elapsed: {elapsed:.2f}s")
    print(f"Output: {output_path}")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Fetch ETF metadata from yfinance",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python fetch_etf_metadata.py                    # Fetch all 80 ETFs
  python fetch_etf_metadata.py --ticker SPY       # Fetch single ETF
  python fetch_etf_metadata.py --category sector  # Fetch sector ETFs only
        """
    )
    parser.add_argument(
        "--ticker",
        type=str,
        help="Fetch metadata for a single ticker symbol"
    )
    parser.add_argument(
        "--category",
        type=str,
        choices=list(CATEGORY_SYMBOL_MAP.keys()),
        help="Fetch metadata for a specific category"
    )
    
    args = parser.parse_args()
    
    if args.ticker and args.category:
        print("Error: Cannot specify both --ticker and --category")
        sys.exit(1)
    
    try:
        run_etl(ticker=args.ticker, category=args.category)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nInterrupted by user")
        sys.exit(1)


if __name__ == "__main__":
    main()
