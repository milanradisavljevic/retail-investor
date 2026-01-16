"""Value score calculation based on valuation metrics."""

from typing import Optional
from . import percentile_rank
from ..config import VALUE_SCORE_WEIGHTS


def _compute_fcf_yield(metrics: dict) -> Optional[float]:
    """
    Calculate Free Cash Flow Yield.

    FCF Yield = Free Cash Flow / Market Capitalization

    Args:
        metrics: Dictionary containing freeCashFlow and marketCapitalization

    Returns:
        FCF Yield or None if data is missing or invalid
    """
    fcf = metrics.get("freeCashFlow")
    market_cap = metrics.get("marketCapitalization")

    if fcf is None or market_cap is None or market_cap <= 0:
        return None

    return fcf / market_cap


def _extract_value_metrics(metrics: dict) -> dict[str, Optional[float]]:
    """
    Extract and transform value metrics for scoring.

    For "lower is better" metrics (EV/EBITDA, P/B), we use the inverse
    so that higher values indicate better value.

    Args:
        metrics: Raw metrics dictionary

    Returns:
        Dictionary with transformed metrics:
        - inv_ev_ebitda: 1 / EV/EBITDA
        - fcf_yield: FCF / Market Cap
        - inv_pb: 1 / P/B ratio
    """
    ev_ebitda = metrics.get("enterpriseValueOverEBITDA")
    pb = metrics.get("priceBookMrq")

    # Inverse for "lower is better" metrics
    inv_ev_ebitda = (
        1 / ev_ebitda if ev_ebitda is not None and ev_ebitda > 0 else None
    )
    inv_pb = 1 / pb if pb is not None and pb > 0 else None

    fcf_yield = _compute_fcf_yield(metrics)

    return {
        "inv_ev_ebitda": inv_ev_ebitda,
        "fcf_yield": fcf_yield,
        "inv_pb": inv_pb,
    }


def calculate_value_score(
    metrics: dict, universe_metrics: list[dict]
) -> float:
    """
    Calculate value score based on valuation metrics.

    S_value = 0.50 * percentile_rank(1 / EV_EBITDA)
            + 0.30 * percentile_rank(FCF_Yield)
            + 0.20 * percentile_rank(1 / PB_Ratio)

    Higher scores indicate better value (cheaper stocks).

    Args:
        metrics: Metrics for the stock to score
        universe_metrics: Metrics for all stocks in the universe

    Returns:
        Value score from 0 to 100
    """
    weights = VALUE_SCORE_WEIGHTS

    # Extract transformed metrics for current stock
    stock_values = _extract_value_metrics(metrics)

    # Extract transformed metrics for universe (for percentile ranking)
    universe_inv_ev_ebitda = []
    universe_fcf_yield = []
    universe_inv_pb = []

    for um in universe_metrics:
        uv = _extract_value_metrics(um)
        universe_inv_ev_ebitda.append(uv["inv_ev_ebitda"])
        universe_fcf_yield.append(uv["fcf_yield"])
        universe_inv_pb.append(uv["inv_pb"])

    # Calculate percentile ranks for each component
    ev_ebitda_score = percentile_rank(
        stock_values["inv_ev_ebitda"], universe_inv_ev_ebitda
    )
    fcf_yield_score = percentile_rank(
        stock_values["fcf_yield"], universe_fcf_yield
    )
    pb_score = percentile_rank(stock_values["inv_pb"], universe_inv_pb)

    # Weighted composite
    value_score = (
        weights["ev_ebitda"] * ev_ebitda_score
        + weights["fcf_yield"] * fcf_yield_score
        + weights["pb_ratio"] * pb_score
    )

    return value_score
