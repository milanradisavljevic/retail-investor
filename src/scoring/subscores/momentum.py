"""Momentum score calculation based on price trends (stub for MVP)."""

from typing import Optional, Any
from . import percentile_rank
from ..config import MOMENTUM_SCORE_WEIGHTS


def calculate_momentum_score(
    symbol: str, finnhub_client: Any, universe_data: dict
) -> float:
    """
    Calculate momentum score based on price momentum indicators.

    S_momentum = 0.60 * percentile_rank(price_vs_SMA200)
               + 0.40 * percentile_rank(Return_12M_1M)

    Where:
    - price_vs_SMA200 = (current_price - SMA200) / SMA200
    - Return_12M_1M = 252-day return minus last 21 days (removes short-term reversal)

    NOTE: This is a stub implementation for MVP. Full implementation requires
    historical price data via Finnhub /stock/candle endpoint.

    Args:
        symbol: Stock ticker symbol
        finnhub_client: Finnhub API client instance
        universe_data: Dictionary with pre-calculated momentum data for universe

    Returns:
        Momentum score from 0 to 100 (stub returns 50.0 for MVP)
    """
    # TODO: Implement actual momentum calculation using historical prices
    # This requires:
    # 1. Fetch daily candles for last 252 trading days via finnhub_client.get_candles()
    # 2. Calculate SMA200
    # 3. Calculate price_vs_sma200 = (current - sma200) / sma200
    # 4. Calculate 252-day return and 21-day return
    # 5. Calculate return_12m_1m = return_252d - return_21d
    # 6. Get universe values from universe_data
    # 7. Calculate percentile ranks and return weighted score

    # Stub: Return neutral score for MVP
    return 50.0


def _calculate_sma(prices: list[float], period: int) -> Optional[float]:
    """
    Calculate Simple Moving Average.

    Args:
        prices: List of prices (most recent last)
        period: Number of periods for the SMA

    Returns:
        SMA value or None if insufficient data
    """
    if len(prices) < period:
        return None
    return sum(prices[-period:]) / period


def _calculate_return(prices: list[float], periods: int) -> Optional[float]:
    """
    Calculate return over N periods.

    Args:
        prices: List of prices (most recent last)
        periods: Number of periods to calculate return over

    Returns:
        Return as decimal (e.g., 0.15 for 15% return) or None if insufficient data
    """
    if len(prices) < periods + 1:
        return None

    start_price = prices[-(periods + 1)]
    end_price = prices[-1]

    if start_price == 0:
        return None

    return (end_price - start_price) / start_price
