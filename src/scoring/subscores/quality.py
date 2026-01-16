"""Quality score calculation based on profitability and efficiency metrics."""

from typing import Optional
from . import percentile_rank
from ..config import QUALITY_SCORE_WEIGHTS


def calculate_quality_score(
    metrics: dict, universe_metrics: list[dict]
) -> float:
    """
    Calculate quality score based on profitability metrics.

    S_quality = 0.50 * percentile_rank(ROIC)
              + 0.50 * percentile_rank(Gross_Margin)

    Higher scores indicate better quality (more profitable and efficient).

    Args:
        metrics: Metrics for the stock to score
        universe_metrics: Metrics for all stocks in the universe

    Returns:
        Quality score from 0 to 100
    """
    weights = QUALITY_SCORE_WEIGHTS

    # Extract metrics for current stock
    roic = metrics.get("roic")
    gross_margin = metrics.get("grossMargin")

    # Extract metrics for universe
    universe_roic = [um.get("roic") for um in universe_metrics]
    universe_gross_margin = [um.get("grossMargin") for um in universe_metrics]

    # Calculate percentile ranks
    roic_score = percentile_rank(roic, universe_roic)
    gross_margin_score = percentile_rank(gross_margin, universe_gross_margin)

    # Weighted composite
    quality_score = (
        weights["roic"] * roic_score
        + weights["gross_margin"] * gross_margin_score
    )

    return quality_score
