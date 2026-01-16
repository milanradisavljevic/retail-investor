"""Universe ranking and selection logic."""

import logging
from typing import Optional
import random

logger = logging.getLogger(__name__)


def rank_universe(
    scored_symbols: list[dict], seed: Optional[int] = None
) -> dict:
    """
    Rank symbols by composite score and select top performers.

    Sorting is deterministic with alphabetical tie-breaking by symbol.
    Pick of the Day uses a deterministic seed-based selection from top 5.

    Args:
        scored_symbols: List of scored symbol dictionaries
        seed: Random seed for deterministic Pick of the Day selection

    Returns:
        Dictionary containing:
        - top_10: List of top 10 symbols with scores
        - top_5: List of top 5 symbols with scores
        - pick_of_day: Single symbol dictionary
        - full_ranking: All symbols sorted by score
    """
    if not scored_symbols:
        logger.warning("No symbols to rank")
        return {
            "top_10": [],
            "top_5": [],
            "pick_of_day": None,
            "full_ranking": [],
        }

    # Sort by composite_score (descending), then by symbol (ascending) for determinism
    sorted_symbols = sorted(
        scored_symbols,
        key=lambda x: (-x["composite_score"], x["symbol"]),
    )

    # Extract top performers
    top_10 = sorted_symbols[:10]
    top_5 = sorted_symbols[:5]

    # Pick of the Day: deterministic selection from top 5
    pick_of_day = None
    if top_5:
        if seed is not None:
            # Use seed for deterministic selection
            rng = random.Random(seed)
            pick_of_day = rng.choice(top_5)
        else:
            # Default to highest score
            pick_of_day = top_5[0]

    logger.info(
        f"Ranking complete: {len(sorted_symbols)} symbols ranked, "
        f"top score: {sorted_symbols[0]['composite_score']:.2f}, "
        f"pick of day: {pick_of_day['symbol'] if pick_of_day else 'None'}"
    )

    return {
        "top_10": top_10,
        "top_5": top_5,
        "pick_of_day": pick_of_day,
        "full_ranking": sorted_symbols,
    }


def format_ranking_summary(ranking: dict) -> str:
    """
    Format ranking results as a human-readable summary.

    Args:
        ranking: Output from rank_universe()

    Returns:
        Formatted string summary
    """
    lines = []
    lines.append("=" * 60)
    lines.append("STOCK RANKING SUMMARY")
    lines.append("=" * 60)

    # Pick of the Day
    if ranking["pick_of_day"]:
        pod = ranking["pick_of_day"]
        lines.append(f"\n🌟 PICK OF THE DAY: {pod['symbol']}")
        lines.append(f"   Composite Score: {pod['composite_score']:.2f}")
        lines.append(
            f"   Value: {pod['subscores']['value']:.2f} | "
            f"Quality: {pod['subscores']['quality']:.2f} | "
            f"Risk: {pod['subscores']['risk']:.2f} | "
            f"Momentum: {pod['subscores']['momentum']:.2f}"
        )

    # Top 5
    lines.append("\n📊 TOP 5 STOCKS:")
    for i, symbol_data in enumerate(ranking["top_5"], 1):
        lines.append(
            f"   {i}. {symbol_data['symbol']:6s} - "
            f"Score: {symbol_data['composite_score']:6.2f}"
        )

    # Top 10
    if len(ranking["top_10"]) > 5:
        lines.append("\n📈 EXTENDED TOP 10:")
        for i, symbol_data in enumerate(ranking["top_10"][5:], 6):
            lines.append(
                f"   {i}. {symbol_data['symbol']:6s} - "
                f"Score: {symbol_data['composite_score']:6.2f}"
            )

    lines.append("\n" + "=" * 60)
    return "\n".join(lines)
