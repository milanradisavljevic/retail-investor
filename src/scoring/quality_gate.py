"""Quality gate with red flag checks for stock screening."""

from typing import Optional
from .config import RED_FLAG_THRESHOLDS, MAX_MISSING_RATIO, FINNHUB_FIELDS


def _debt_equity_ratio(metrics: dict) -> float:
    """
    Calculate debt-to-equity ratio.

    Args:
        metrics: Dictionary containing totalDebt and totalEquity

    Returns:
        Debt/Equity ratio, or infinity if equity is 0 or negative
    """
    debt = metrics.get("totalDebt", 0)
    equity = metrics.get("totalEquity", 1)

    if equity and equity > 0:
        return debt / equity
    return float("inf")


# Red flag conditions
RED_FLAGS = {
    "unprofitable": lambda m: (m.get("roa") or 0) <= 0,
    "cash_burner": lambda m: (m.get("freeCashFlow") or 0) <= 0,
    "overleveraged": lambda m: _debt_equity_ratio(m)
    > RED_FLAG_THRESHOLDS["max_debt_equity"],
}


def passes_quality_gate(metrics: dict) -> tuple[bool, list[str]]:
    """
    Check if a stock passes the quality gate.

    A stock fails if it triggers any red flag:
    - ROA <= 0 (unprofitable)
    - Free Cash Flow <= 0 (cash burner)
    - Debt/Equity > 3.0 (overleveraged)

    Args:
        metrics: Dictionary containing stock metrics

    Returns:
        Tuple of (passes: bool, triggered_flags: list[str])
    """
    triggered_flags = []

    for flag_name, check_func in RED_FLAGS.items():
        if check_func(metrics):
            triggered_flags.append(flag_name)

    passes = len(triggered_flags) == 0
    return passes, triggered_flags


def has_sufficient_data(metrics: dict) -> tuple[bool, float]:
    """
    Check if a stock has sufficient data for scoring.

    Args:
        metrics: Dictionary containing stock metrics

    Returns:
        Tuple of (sufficient: bool, missing_ratio: float)
    """
    # Required fields for scoring
    required_fields = [
        "beta",
        "roic",
        "grossMargin",
        "enterpriseValueOverEBITDA",
        "freeCashFlow",
        "priceBookMrq",
        "marketCapitalization",
        "totalDebt",
        "totalEquity",
        "roa",
    ]

    total_fields = len(required_fields)
    missing_count = sum(
        1 for field in required_fields if metrics.get(field) is None
    )

    missing_ratio = missing_count / total_fields
    sufficient = missing_ratio <= MAX_MISSING_RATIO

    return sufficient, missing_ratio


def should_score_symbol(metrics: dict) -> tuple[bool, str]:
    """
    Determine if a symbol should be scored.

    Combines quality gate and data sufficiency checks.

    Args:
        metrics: Dictionary containing stock metrics

    Returns:
        Tuple of (should_score: bool, reason: str)
            - If should_score is False, reason explains why
            - If should_score is True, reason is empty string
    """
    # Check data sufficiency first
    sufficient_data, missing_ratio = has_sufficient_data(metrics)
    if not sufficient_data:
        return False, f"insufficient_data (missing {missing_ratio:.1%})"

    # Check quality gate
    passes, triggered_flags = passes_quality_gate(metrics)
    if not passes:
        return False, f"red_flags: {', '.join(triggered_flags)}"

    return True, ""
