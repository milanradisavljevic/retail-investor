#!/usr/bin/env python3
"""
Test DCF Formulas with Real Stocks - Rate Limit Monitoring

This script tests the DCF formulas with real Finnhub data and monitors:
- API request counts
- Rate limit handling
- Data availability
- Calculation success rates
- Intrinsic value vs. current price comparisons
"""

import os
import sys
import time
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py import FinnhubClient, SQLiteCache
from scoring.dcf_adapter import (
    calculate_intrinsic_value_dcf,
    calculate_wacc_score,
    calculate_var_risk,
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)

logger = logging.getLogger(__name__)


def print_section(title: str):
    """Print formatted section header."""
    print(f"\n{'='*70}")
    print(f"{title}")
    print(f"{'='*70}\n")


def print_dcf_result(symbol: str, result: dict):
    """Print DCF calculation results."""
    if result is None:
        print(f"  {symbol}: ❌ DCF calculation failed\n")
        return

    intrinsic = result['intrinsic_value']
    current = result.get('current_price')
    discount = result.get('discount_percent')
    confidence = result['confidence']

    print(f"  {symbol}:")
    print(f"    Intrinsic Value:  ${intrinsic:,.2f}")

    if current:
        print(f"    Current Price:    ${current:,.2f}")
        if discount is not None:
            status = "📈 UNDERVALUED" if discount > 0 else "📉 OVERVALUED"
            print(f"    Discount:         {discount:+.2f}% {status}")
    else:
        print(f"    Current Price:    N/A")

    print(f"    Confidence:       {confidence:.2%}")
    print(f"    Model Path:       {result['data_quality'].get('model_path', 'unknown')}")

    # Show key assumptions (first 2)
    if result['assumptions']:
        print(f"    Assumptions:")
        for assumption in result['assumptions'][:2]:
            print(f"      - {assumption[:60]}...")
    print()


def main():
    """Run DCF test with real stocks."""
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.error("FINNHUB_API_KEY not set")
        return 1

    print_section("DCF REAL STOCK TEST - RATE LIMIT MONITORING")

    # Initialize
    logger.info("Initializing Finnhub client with rate limiting...")
    cache = SQLiteCache(db_path="data/cache/finnhub_dcf_test.db", ttl_hours=24)
    client = FinnhubClient(api_key=api_key, cache=cache, max_requests=60)

    # Test universe (same as before for comparison)
    test_symbols = [
        "AAPL",   # Tech - high growth
        "MSFT",   # Tech - high growth
        "JNJ",    # Healthcare - stable
        "PG",     # Consumer - stable
        "KO",     # Consumer - stable
        "WMT",    # Retail
        "CVX",    # Energy
        "JPM",    # Finance
    ]

    print(f"Testing {len(test_symbols)} symbols: {', '.join(test_symbols)}")
    print(f"Rate Limit: 60 requests/minute")
    print(f"Cache: Enabled (24h TTL)\n")

    start_time = time.time()
    request_count_start = getattr(client, 'request_count', 0)

    # Track results
    dcf_results = {}
    wacc_results = {}
    var_results = {}
    failures = []

    # Test DCF calculations
    print_section("TWO-STAGE DCF INTRINSIC VALUES")

    for i, symbol in enumerate(test_symbols, 1):
        print(f"[{i}/{len(test_symbols)}] Calculating DCF for {symbol}...")

        try:
            result = calculate_intrinsic_value_dcf(symbol, client)
            dcf_results[symbol] = result
            print_dcf_result(symbol, result)

            if result is None:
                failures.append((symbol, "DCF"))

        except Exception as e:
            logger.error(f"{symbol}: DCF failed with exception: {e}")
            failures.append((symbol, "DCF_EXCEPTION"))
            print(f"  {symbol}: ❌ Exception - {e}\n")

        # Small delay to avoid hitting rate limits too fast
        time.sleep(0.2)

    # Test WACC calculations
    print_section("WACC (Weighted Average Cost of Capital)")

    for symbol in test_symbols:
        try:
            result = calculate_wacc_score(symbol, client)
            wacc_results[symbol] = result

            if result:
                wacc_pct = result['value'] * 100
                print(f"  {symbol}: WACC = {wacc_pct:.2f}% (Confidence: {result['confidence']:.2%})")
            else:
                print(f"  {symbol}: ❌ WACC calculation failed")
                failures.append((symbol, "WACC"))

        except Exception as e:
            logger.error(f"{symbol}: WACC failed: {e}")
            failures.append((symbol, "WACC_EXCEPTION"))

        time.sleep(0.2)

    print()

    # Test VaR calculations
    print_section("MONTE CARLO VALUE-AT-RISK (95%, 30 days)")

    for symbol in test_symbols:
        try:
            result = calculate_var_risk(symbol, client, confidence_level=0.95, horizon_days=30)
            var_results[symbol] = result

            if result:
                var_abs = result['var_absolute']
                var_pct = result.get('var_percent')
                if var_pct:
                    print(f"  {symbol}: VaR = ${var_abs:,.2f} ({var_pct:.2f}% of price)")
                else:
                    print(f"  {symbol}: VaR = ${var_abs:,.2f}")
            else:
                print(f"  {symbol}: ❌ VaR calculation failed")
                failures.append((symbol, "VAR"))

        except Exception as e:
            logger.error(f"{symbol}: VaR failed: {e}")
            failures.append((symbol, "VAR_EXCEPTION"))

        time.sleep(0.2)

    print()

    # Summary statistics
    end_time = time.time()
    duration = end_time - start_time
    request_count_end = getattr(client, 'request_count', 0)
    requests_made = request_count_end - request_count_start

    print_section("TEST SUMMARY")

    print(f"Duration:          {duration:.1f} seconds")
    print(f"API Requests:      {requests_made}")
    print(f"Requests/Second:   {requests_made/duration:.2f}")
    print(f"Cache Hit Rate:    {cache.get_stats()}")
    print()

    print(f"DCF Success:       {len([r for r in dcf_results.values() if r is not None])}/{len(test_symbols)}")
    print(f"WACC Success:      {len([r for r in wacc_results.values() if r is not None])}/{len(test_symbols)}")
    print(f"VaR Success:       {len([r for r in var_results.values() if r is not None])}/{len(test_symbols)}")
    print()

    if failures:
        print(f"❌ Failures: {len(failures)}")
        for symbol, calc_type in failures:
            print(f"   - {symbol}: {calc_type}")
    else:
        print(f"✅ All calculations successful!")

    print()

    # Top undervalued stocks (by DCF)
    print_section("TOP UNDERVALUED STOCKS (DCF)")

    undervalued = []
    for symbol, result in dcf_results.items():
        if result and result.get('discount_percent'):
            discount = result['discount_percent']
            if discount > 0:  # Positive = undervalued
                undervalued.append((symbol, discount, result['intrinsic_value'], result.get('current_price')))

    if undervalued:
        undervalued.sort(key=lambda x: x[1], reverse=True)
        for rank, (symbol, discount, intrinsic, current) in enumerate(undervalued, 1):
            print(f"  {rank}. {symbol:6s} - {discount:+6.2f}% discount (Intrinsic: ${intrinsic:.2f}, Current: ${current:.2f})")
    else:
        print("  No undervalued stocks found (or current prices not available)")

    print()

    # Rate limit check
    print_section("RATE LIMIT STATUS")

    if requests_made < 60:
        print(f"✅ Within rate limit: {requests_made}/60 requests used")
    else:
        print(f"⚠️  Rate limit reached: {requests_made}/60 requests")
        print(f"   Duration suggests rate limiting worked correctly")

    if duration > 60 and requests_made > 60:
        actual_rate = requests_made / (duration / 60)
        print(f"   Actual rate: {actual_rate:.1f} req/min (should be ≤60)")

    print(f"\n{'='*70}\n")

    client.close()
    logger.info("✅ Test complete!")

    return 0


if __name__ == "__main__":
    sys.exit(main())
