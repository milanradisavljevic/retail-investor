#!/usr/bin/env python3
"""
Example script demonstrating the stock scoring system.

Usage:
    FINNHUB_API_KEY=your_key python example_scoring.py
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
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger(__name__)


def main():
    """Run example scoring workflow."""
    # Get API key
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.error("FINNHUB_API_KEY environment variable not set")
        return 1

    # Initialize cache and client
    cache = SQLiteCache(db_path="data/cache/finnhub.db", ttl_hours=24)
    client = FinnhubClient(api_key=api_key, cache=cache, max_requests=60)

    # Example universe (in production, this would be S&P 500 ranks 50-150)
    universe_symbols = [
        "AAPL",
        "MSFT",
        "GOOGL",
        "AMZN",
        "META",
        "NVDA",
        "TSLA",
        "BRK.B",
        "V",
        "JNJ",
    ]

    logger.info(f"Fetching metrics for {len(universe_symbols)} symbols")

    # Fetch metrics for universe
    universe_data = []
    for symbol in universe_symbols:
        try:
            logger.info(f"Fetching {symbol}")
            financials = client.get_basic_financials(symbol)
            metrics = financials.get("metric", {})

            if not metrics:
                logger.warning(f"{symbol}: No metrics returned")
                continue

            metrics["symbol"] = symbol
            universe_data.append(metrics)

        except Exception as e:
            logger.error(f"{symbol}: Error fetching data - {e}")

    if not universe_data:
        logger.error("No data fetched for universe")
        return 1

    logger.info(f"Successfully fetched {len(universe_data)} symbols")

    # Score universe with different profiles
    for profile in ["pure_value", "conservative", "balanced"]:
        logger.info(f"\n{'=' * 60}")
        logger.info(f"Scoring with profile: {profile}")
        logger.info(f"{'=' * 60}")

        # Score
        scored = score_universe(universe_data, finnhub_client=client, profile=profile)

        if not scored:
            logger.warning(f"No symbols scored with profile {profile}")
            continue

        # Rank
        ranking = rank_universe(scored, seed=20250110)

        # Display results
        print(format_ranking_summary(ranking))

        # Show detailed subscores for top 3
        print("\nDetailed Subscores (Top 3):")
        for i, item in enumerate(ranking["top_5"][:3], 1):
            print(f"\n{i}. {item['symbol']} - Score: {item['composite_score']:.2f}")
            subs = item["subscores"]
            print(
                f"   Value: {subs['value']:5.2f} | "
                f"Quality: {subs['quality']:5.2f} | "
                f"Risk: {subs['risk']:5.2f} | "
                f"Momentum: {subs['momentum']:5.2f}"
            )

    # Show cache stats
    stats = cache.get_stats()
    logger.info(f"\nCache Statistics:")
    logger.info(f"  Total entries: {stats['total_entries']}")
    logger.info(f"  Valid entries: {stats['valid_entries']}")
    logger.info(f"  Symbols cached: {stats['symbols_cached']}")

    # Cleanup
    client.close()
    logger.info("\nExample complete!")

    return 0


if __name__ == "__main__":
    sys.exit(main())
