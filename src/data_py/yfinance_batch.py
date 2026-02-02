#!/usr/bin/env python3
"""
Batch yfinance data fetcher - fetches multiple symbols in one process.
Eliminates per-symbol process spawning overhead.

Usage:
    echo '{"symbols": ["AAPL", "MSFT"], "methods": ["basic_financials", "quote"]}' | python3 yfinance_batch.py
"""
import json
import sys
from typing import List, Dict, Any
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import pandas as pd
except ImportError as e:
    print(json.dumps({"error": f"Missing dependency: {e}"}), file=sys.stderr)
    sys.exit(1)


def fetch_batch(symbols: List[str], methods: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Fetch data for multiple symbols in one call.

    Args:
        symbols: List of stock symbols
        methods: List of methods to call (basic_financials, quote, candles, analyst_data, profile)

    Returns:
        Dict mapping symbol -> method -> data
    """
    results = {}

    for symbol in symbols:
        results[symbol] = {}

        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info or {}

            if 'basic_financials' in methods:
                results[symbol]['basic_financials'] = {
                    'marketCap': info.get('marketCap'),
                    'enterpriseValue': info.get('enterpriseValue'),
                    'trailingPE': info.get('trailingPE'),
                    'forwardPE': info.get('forwardPE'),
                    'priceToBook': info.get('priceToBook'),
                    'priceToSales': info.get('priceToSalesTrailing12Months'),
                    'profitMargin': info.get('profitMargins'),
                    'returnOnEquity': info.get('returnOnEquity'),
                    'returnOnAssets': info.get('returnOnAssets'),
                    'debtToEquity': info.get('debtToEquity'),
                    'currentRatio': info.get('currentRatio'),
                    'quickRatio': info.get('quickRatio'),
                    'revenueGrowth': info.get('revenueGrowth'),
                    'earningsGrowth': info.get('earningsGrowth'),
                }

            if 'quote' in methods:
                results[symbol]['quote'] = {
                    'c': info.get('currentPrice') or info.get('regularMarketPrice'),
                    'h': info.get('dayHigh') or info.get('regularMarketDayHigh'),
                    'l': info.get('dayLow') or info.get('regularMarketDayLow'),
                    'o': info.get('open') or info.get('regularMarketOpen'),
                    'pc': info.get('previousClose') or info.get('regularMarketPreviousClose'),
                }

            if 'candles' in methods:
                # Default: 365 days of history
                end_date = datetime.now()
                start_date = end_date - timedelta(days=365)
                hist = ticker.history(start=start_date, end=end_date)

                candles = []
                if hist is not None and not hist.empty:
                    for idx, row in hist.iterrows():
                        candles.append({
                            't': int(idx.timestamp()),
                            'close': float(row['Close']) if not pd.isna(row['Close']) else None,
                            'high': float(row['High']) if not pd.isna(row['High']) else None,
                            'low': float(row['Low']) if not pd.isna(row['Low']) else None,
                            'volume': float(row['Volume']) if not pd.isna(row['Volume']) else None,
                        })

                results[symbol]['candles'] = candles

            if 'analyst_data' in methods:
                results[symbol]['analyst_data'] = {
                    'target_mean': info.get('targetMeanPrice'),
                    'target_low': info.get('targetLowPrice'),
                    'target_high': info.get('targetHighPrice'),
                    'num_analysts': info.get('numberOfAnalystOpinions'),
                    'recommendation': info.get('recommendationKey'),
                    'next_earnings_date': None,  # Would need earnings_dates call
                }

            if 'profile' in methods:
                results[symbol]['profile'] = {
                    'name': info.get('longName') or info.get('shortName'),
                    'ticker': symbol,
                    'country': info.get('country'),
                    'industry': info.get('industry'),
                    'sector': info.get('sector'),
                    'logo': info.get('logo_url'),
                    'weburl': info.get('website'),
                    'ipo': info.get('ipoDate'),
                }

        except Exception as e:
            results[symbol]['error'] = str(e)

    return results


def main():
    """Read JSON from stdin, fetch batch, write JSON to stdout."""
    try:
        # Read JSON input from stdin
        input_data = json.loads(sys.stdin.read())
        symbols = input_data.get('symbols', [])
        methods = input_data.get('methods', ['basic_financials', 'quote', 'candles'])

        if not symbols:
            print(json.dumps({"error": "No symbols provided"}), file=sys.stderr)
            sys.exit(1)

        # Fetch batch
        results = fetch_batch(symbols, methods)

        # Write JSON output to stdout
        print(json.dumps(results))

    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON input: {e}"}), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"error": f"Batch fetch failed: {e}"}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
