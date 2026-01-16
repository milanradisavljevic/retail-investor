"""Risk score calculation based on volatility metrics."""

from typing import Optional
from . import percentile_rank


def calculate_risk_score(metrics: dict, universe_metrics: list[dict]) -> float:
    """
    Calculate risk score based on beta (volatility).

    S_risk = 100 - percentile_rank(Beta)

    Lower beta means lower risk, which results in a higher score.
    The inversion ensures that stocks with less volatility get higher scores.

    Args:
        metrics: Metrics for the stock to score
        universe_metrics: Metrics for all stocks in the universe

    Returns:
        Risk score from 0 to 100 (higher = lower risk)
    """
    # Extract beta for current stock
    beta = metrics.get("beta")

    # Extract beta for universe
    universe_betas = [um.get("beta") for um in universe_metrics]

    # Calculate percentile rank (higher beta = higher percentile)
    beta_percentile = percentile_rank(beta, universe_betas)

    # Invert: lower beta should give higher score
    risk_score = 100 - beta_percentile

    return risk_score
