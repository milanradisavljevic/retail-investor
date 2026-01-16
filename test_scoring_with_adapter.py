#!/usr/bin/env python3
"""
Test scoring system with Finnhub adapter for real API data.
"""

import os
import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from data_py import FinnhubClient, SQLiteCache, adapt_finnhub_metrics, get_available_fields_count
from scoring import score_universe, rank_universe, format_ranking_summary

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
)

logger = logging.getLogger(__name__)


def main():
    """Run scoring test with adapted Finnhub data."""
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.error("FINNHUB_API_KEY not set (export or add to .env.local)")
        return 1

    logger.info("Initializing cache and Finnhub client...")
    cache = SQLiteCache(db_path="data/cache/finnhub_test.db", ttl_hours=24)
    client = FinnhubClient(api_key=api_key, cache=cache, max_requests=60)

    # Test universe
    universe_symbols = [
        "AAPL",   # Tech - high growth
        "MSFT",   # Tech - high growth
        "JNJ",    # Healthcare - stable, dividend
        "PG",     # Consumer goods - stable, dividend
        "KO",     # Consumer goods - stable, dividend
        "WMT",    # Retail - value
        "CVX",    # Energy - value
        "JPM",    # Finance - value
    ]

    logger.info(f"Testing with {len(universe_symbols)} symbols")

    # Fetch and adapt metrics
    universe_data = []
    for symbol in universe_symbols:
        try:
            logger.info(f"Fetching {symbol}...")
            finnhub_response = client.get_basic_financials(symbol)

            # Adapt to expected format
            adapted_metrics = adapt_finnhub_metrics(finnhub_response)
            adapted_metrics["symbol"] = symbol

            # Check data availability
            available, total = get_available_fields_count(adapted_metrics)
            logger.info(f"  {symbol}: {available}/{total} fields available ({available/total*100:.0f}%)")

            universe_data.append(adapted_metrics)

        except Exception as e:
            logger.error(f"{symbol}: Error - {e}")

    if not universe_data:
        logger.error("❌ No data fetched!")
        return 1

    logger.info(f"\n✅ Successfully fetched {len(universe_data)} symbols\n")

    # Test all three profiles
    for profile in ["pure_value", "conservative", "balanced"]:
        print(f"\n{'='*70}")
        print(f"SCORING PROFILE: {profile.upper()}")
        print(f"{'='*70}\n")

        # Score
        scored = score_universe(universe_data, finnhub_client=client, profile=profile)

        if not scored:
            print(f"⚠️  No symbols scored with profile {profile}\n")
            continue

        logger.info(f"{len(scored)} symbols passed quality gate")

        # Rank
        ranking = rank_universe(scored, seed=20250110)

        # Display results
        print(format_ranking_summary(ranking))

        # Detailed breakdown
        print(f"\n📋 DETAILED BREAKDOWN:")
        print("-" * 70)
        print(f"{'Symbol':6s} │ {'Total':6s} │ {'Value':6s} │ {'Quality':7s} │ {'Risk':6s} │ {'Momentum':8s}")
        print("-" * 70)

        for item in ranking["full_ranking"]:
            symbol = item['symbol']
            score = item['composite_score']
            subs = item['subscores']
            print(f"{symbol:6s} │ {score:6.2f} │ {subs['value']:6.2f} │ {subs['quality']:7.2f} │ {subs['risk']:6.2f} │ {subs['momentum']:8.2f}")

    # Cache stats
    print(f"\n{'='*70}")
    stats = cache.get_stats()
    print("📊 CACHE STATISTICS:")
    print(f"  Symbols cached: {stats['symbols_cached']}")
    print(f"  Valid entries: {stats['valid_entries']}")
    print(f"{'='*70}\n")

    client.close()
    logger.info("✅ Test complete!")

    return 0


if __name__ == "__main__":
    sys.exit(main())
