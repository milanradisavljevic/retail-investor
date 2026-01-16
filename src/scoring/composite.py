"""Composite score calculation and universe scoring."""

import logging
from typing import Any, Optional
from .config import WEIGHT_PROFILES, WeightProfile
from .quality_gate import should_score_symbol
from .subscores.value import calculate_value_score
from .subscores.quality import calculate_quality_score
from .subscores.risk import calculate_risk_score
from .subscores.momentum import calculate_momentum_score

logger = logging.getLogger(__name__)


def calculate_composite_score(
    subscores: dict[str, float], profile: WeightProfile = "pure_value"
) -> float:
    """
    Calculate composite score from subscores using a weight profile.

    Args:
        subscores: Dictionary with keys: value, quality, risk, momentum
        profile: Weight profile to use (pure_value, conservative, balanced)

    Returns:
        Composite score from 0 to 100
    """
    if profile not in WEIGHT_PROFILES:
        raise ValueError(
            f"Invalid profile '{profile}'. Must be one of: {list(WEIGHT_PROFILES.keys())}"
        )

    weights = WEIGHT_PROFILES[profile]

    composite = (
        weights["value"] * subscores["value"]
        + weights["quality"] * subscores["quality"]
        + weights["risk"] * subscores["risk"]
        + weights["momentum"] * subscores["momentum"]
    )

    return composite


def score_symbol(
    symbol: str,
    metrics: dict,
    universe_metrics: list[dict],
    finnhub_client: Optional[Any] = None,
    profile: WeightProfile = "pure_value",
) -> Optional[dict]:
    """
    Score a single symbol.

    Args:
        symbol: Stock ticker symbol
        metrics: Metrics for the stock
        universe_metrics: Metrics for all stocks in universe
        finnhub_client: Finnhub client for momentum calculation (optional)
        profile: Weight profile to use

    Returns:
        Dictionary with scores or None if symbol should not be scored
    """
    # Check if symbol should be scored
    should_score, reason = should_score_symbol(metrics)
    if not should_score:
        logger.info(f"{symbol}: Excluded from scoring - {reason}")
        return None

    # Calculate subscores
    subscores = {
        "value": calculate_value_score(metrics, universe_metrics),
        "quality": calculate_quality_score(metrics, universe_metrics),
        "risk": calculate_risk_score(metrics, universe_metrics),
        "momentum": 50.0,  # Stub for MVP
    }

    # If momentum weight > 0 and client provided, calculate momentum
    weights = WEIGHT_PROFILES[profile]
    if weights["momentum"] > 0 and finnhub_client is not None:
        try:
            # Note: universe_data would need to be passed for proper implementation
            subscores["momentum"] = calculate_momentum_score(
                symbol, finnhub_client, {}
            )
        except Exception as e:
            logger.warning(
                f"{symbol}: Momentum calculation failed - {e}, using neutral score"
            )
            subscores["momentum"] = 50.0

    # Calculate composite score
    composite = calculate_composite_score(subscores, profile)

    return {
        "symbol": symbol,
        "composite_score": composite,
        "subscores": subscores,
        "profile": profile,
    }


def score_universe(
    universe: list[dict],
    finnhub_client: Optional[Any] = None,
    profile: WeightProfile = "pure_value",
) -> list[dict]:
    """
    Score all symbols in a universe.

    Args:
        universe: List of dictionaries with 'symbol' and metrics
        finnhub_client: Finnhub client for momentum calculation (optional)
        profile: Weight profile to use

    Returns:
        List of scored symbols (excluding those that failed quality gate)
    """
    logger.info(f"Scoring {len(universe)} symbols with profile '{profile}'")

    # Extract metrics from universe
    universe_metrics = [item for item in universe]

    # Score each symbol
    scored_symbols = []
    excluded_count = 0

    for item in universe:
        symbol = item.get("symbol")
        if not symbol:
            logger.warning("Symbol missing in universe item, skipping")
            continue

        result = score_symbol(
            symbol, item, universe_metrics, finnhub_client, profile
        )

        if result is not None:
            scored_symbols.append(result)
        else:
            excluded_count += 1

    logger.info(
        f"Scoring complete: {len(scored_symbols)} scored, {excluded_count} excluded"
    )

    return scored_symbols
