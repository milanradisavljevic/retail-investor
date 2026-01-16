"""
Adapter to map Finnhub API response to scoring system expected format.

Finnhub Free Tier provides different field names than originally specified.
This adapter maps available fields to the expected format.
"""

from typing import Optional


def adapt_finnhub_metrics(finnhub_response: dict) -> dict:
    """
    Convert Finnhub API response to scoring system expected format.

    Maps available Finnhub fields to required scoring fields:
    - roic -> roiTTM (Return on Investment as proxy for ROIC)
    - grossMargin -> grossMarginTTM
    - enterpriseValueOverEBITDA -> evEbitdaTTM
    - priceBookMrq -> pbQuarterly
    - roa -> roaTTM
    - Calculates freeCashFlow from enterpriseValue / (currentEv/freeCashFlowTTM)
    - Calculates totalDebt and totalEquity from debt/equity ratios and equity estimates

    Args:
        finnhub_response: Raw response from Finnhub get_basic_financials()

    Returns:
        Dictionary with normalized field names for scoring
    """
    metrics = finnhub_response.get("metric", {})
    series = finnhub_response.get("series", {})

    # Direct mappings
    adapted = {
        "symbol": None,  # Will be set by caller
        "beta": metrics.get("beta"),
        "roic": metrics.get("roiTTM"),  # Using ROI as proxy for ROIC
        "grossMargin": metrics.get("grossMarginTTM"),
        "enterpriseValueOverEBITDA": metrics.get("evEbitdaTTM"),
        "priceBookMrq": metrics.get("pbQuarterly") or metrics.get("pb"),
        "marketCapitalization": metrics.get("marketCapitalization"),
        "roa": metrics.get("roaTTM"),
    }

    # Calculate Free Cash Flow from EV and EV/FCF ratio
    ev = metrics.get("enterpriseValue")
    ev_fcf = metrics.get("currentEv/freeCashFlowTTM")
    if ev is not None and ev_fcf is not None and ev_fcf != 0:
        adapted["freeCashFlow"] = ev / ev_fcf
    else:
        adapted["freeCashFlow"] = None

    # Extract total debt and equity from series data or ratios
    debt_equity_ratio = metrics.get("totalDebt/totalEquityQuarterly")

    # Try to get equity from series
    total_equity = None
    if series and "annual" in series:
        if "equity" in series["annual"] and series["annual"]["equity"]:
            # Get most recent equity value
            equity_data = series["annual"]["equity"]
            if equity_data and len(equity_data) > 0:
                total_equity = equity_data[0].get("v")

    # If we have debt/equity ratio and equity, calculate debt
    if debt_equity_ratio is not None and total_equity is not None:
        adapted["totalDebt"] = debt_equity_ratio * total_equity
        adapted["totalEquity"] = total_equity
    else:
        # Fallback: estimate from market cap and P/B ratio
        market_cap = adapted["marketCapitalization"]
        pb_ratio = adapted["priceBookMrq"]

        if market_cap and pb_ratio and pb_ratio != 0:
            estimated_equity = market_cap / pb_ratio
            if debt_equity_ratio is not None:
                adapted["totalDebt"] = debt_equity_ratio * estimated_equity
                adapted["totalEquity"] = estimated_equity
            else:
                adapted["totalDebt"] = None
                adapted["totalEquity"] = estimated_equity
        else:
            adapted["totalDebt"] = None
            adapted["totalEquity"] = None

    return adapted


def get_available_fields_count(adapted_metrics: dict) -> tuple[int, int]:
    """
    Count how many required fields are available.

    Args:
        adapted_metrics: Adapted metrics dictionary

    Returns:
        Tuple of (available_count, total_count)
    """
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

    available = sum(1 for field in required_fields if adapted_metrics.get(field) is not None)
    total = len(required_fields)

    return available, total
