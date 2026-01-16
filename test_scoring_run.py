#!/usr/bin/env python3
"""
Quick test of the scoring system with a small universe.
"""

import os
import sys
import logging
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py import FinnhubClient, SQLiteCache
from scoring import score_universe, rank_universe, format_ranking_summary

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)

logger = logging.getLogger(__name__)


def main():
    """Run quick scoring test."""
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.error("FINNHUB_API_KEY not set (export or add to .env.local)")
        return 1

    logger.info("Initializing cache and Finnhub client...")
    cache = SQLiteCache(db_path="data/cache/finnhub_test.db", ttl_hours=24)
    client = FinnhubClient(api_key=api_key, cache=cache, max_requests=60)

    # Small test universe (mix of different types of companies)
    universe_symbols = [
        "AAPL",   # Tech - profitable
        "MSFT",   # Tech - profitable
        "JNJ",    # Healthcare - stable
        "PG",     # Consumer goods - stable
        "KO",     # Consumer goods - stable
    ]

    logger.info(f"Testing with {len(universe_symbols)} symbols: {', '.join(universe_symbols)}")

    # Fetch metrics for universe
    universe_data = []
    for symbol in universe_symbols:
        try:
            logger.info(f"Fetching metrics for {symbol}...")
            financials = client.get_basic_financials(symbol)
            metrics = financials.get("metric", {})

            if not metrics:
                logger.warning(f"{symbol}: No metrics returned from API")
                continue

            metrics["symbol"] = symbol
            universe_data.append(metrics)

            # Show some raw data
            logger.info(f"  {symbol} - Beta: {metrics.get('beta')}, ROE: {metrics.get('roe')}, P/B: {metrics.get('priceBookMrq')}")

        except Exception as e:
            logger.error(f"{symbol}: Error - {e}")

    if not universe_data:
        logger.error("❌ No data fetched!")
        return 1

    logger.info(f"\n✅ Successfully fetched metrics for {len(universe_data)} symbols")

    # Test all three profiles
    for profile in ["pure_value", "conservative", "balanced"]:
        print(f"\n{'='*70}")
        print(f"TESTING PROFILE: {profile.upper()}")
        print(f"{'='*70}")

        # Score
        scored = score_universe(universe_data, finnhub_client=client, profile=profile)

        if not scored:
            print(f"⚠️  No symbols scored with profile {profile}")
            continue

        # Rank
        ranking = rank_universe(scored, seed=20250110)

        # Display results
        print(format_ranking_summary(ranking))

        # Show detailed breakdown for all scored stocks
        print(f"\n📋 DETAILED BREAKDOWN ({profile}):")
        print("-" * 70)
        for item in ranking["full_ranking"]:
            symbol = item['symbol']
            score = item['composite_score']
            subs = item['subscores']
            print(f"{symbol:6s} │ Total: {score:6.2f} │ V:{subs['value']:6.2f} Q:{subs['quality']:6.2f} R:{subs['risk']:6.2f} M:{subs['momentum']:6.2f}")

    # Show cache stats
    print(f"\n{'='*70}")
    stats = cache.get_stats()
    print("📊 CACHE STATISTICS:")
    print(f"  Total entries: {stats['total_entries']}")
    print(f"  Valid entries: {stats['valid_entries']}")
    print(f"  Symbols cached: {stats['symbols_cached']}")
    print(f"{'='*70}")

    # Cleanup
    client.close()
    logger.info("\n✅ Test complete!")

    return 0


if __name__ == "__main__":
    sys.exit(main())
