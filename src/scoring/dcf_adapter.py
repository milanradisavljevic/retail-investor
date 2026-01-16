"""
DCF Adapter - Bridge between Finnhub API and DCF Formulas

This adapter wraps the academic DCF formulas and makes them work with
real Finnhub API data. It handles data mapping, missing data fallbacks,
and error handling without modifying the mathematical formulas.
"""

import logging
from typing import Any, Dict, Optional

from .formulas.dcf_two_stage import calculate_two_stage_dcf
from .formulas.wacc import calculate_wacc
from .formulas.var_monte_carlo import calculate_monte_carlo_var

logger = logging.getLogger(__name__)


class FinnhubClientAdapter:
    """
    Adapter to make Finnhub data compatible with DCF formula requirements.

    The DCF formulas expect a client with specific methods:
    - company_basic_financials(symbol, metric)
    - quote(symbol)
    - company_profile2(symbol)
    - stock_candles(symbol, resolution, from_ts, to_ts)

    This adapter wraps our existing FinnhubClient to match this interface.
    """

    def __init__(self, finnhub_client):
        """
        Args:
            finnhub_client: Instance of src.data_py.finnhub_client.FinnhubClient
        """
        self.client = finnhub_client

    def company_basic_financials(self, symbol: str, metric: str):
        """Fetch basic financials (matches DCF formula expectations)."""
        return self.client.get_basic_financials(symbol)

    def quote(self, symbol: str):
        """Fetch current quote."""
        # Our client has get_quote(), DCF formulas expect quote()
        if hasattr(self.client, 'get_quote'):
            return self.client.get_quote(symbol)
        # Fallback: extract from basic_financials if available
        try:
            basic = self.client.get_basic_financials(symbol)
            # Finnhub sometimes includes current price in metric
            current_price = basic.get('metric', {}).get('currentPrice')
            if current_price:
                return {'c': current_price}
        except Exception:
            pass
        raise ValueError(f"{symbol}: No quote data available")

    def company_profile2(self, symbol: str):
        """Fetch company profile."""
        if hasattr(self.client, 'get_company_profile'):
            return self.client.get_company_profile(symbol)
        # Fallback: try to extract from basic_financials
        try:
            basic = self.client.get_basic_financials(symbol)
            metric = basic.get('metric', {})
            # Try to get shares outstanding from metric
            shares = metric.get('marketCapitalization')
            price = metric.get('currentPrice')
            if shares and price and price > 0:
                # Reverse calculate: Market Cap / Price = Shares
                return {'shareOutstanding': shares / price}
        except Exception:
            pass
        raise ValueError(f"{symbol}: No profile data available")

    def stock_candles(self, symbol: str, resolution: str, from_ts: int, to_ts: int):
        """Fetch historical candles."""
        if hasattr(self.client, 'get_candles'):
            # Our client uses days_back instead of from/to timestamps
            # Calculate days_back from timestamps
            from datetime import datetime
            days_back = int((to_ts - from_ts) / 86400)  # 86400 seconds in a day
            return self.client.get_candles(symbol, resolution, days_back)
        raise ValueError(f"{symbol}: Candle data not available")


def calculate_intrinsic_value_dcf(
    symbol: str,
    finnhub_client,
    **kwargs
) -> Optional[Dict[str, Any]]:
    """
    Calculate intrinsic value using Two-Stage FCFE DCF.

    Args:
        symbol: Stock ticker
        finnhub_client: FinnhubClient instance
        **kwargs: Optional overrides for DCF parameters

    Returns:
        Dict with:
        - intrinsic_value: float (per share)
        - current_price: float (optional)
        - discount_percent: float (optional, if current price available)
        - components: dict (detailed breakdown)
        - assumptions: list[str]
        - confidence: float (0-1)

        Or None if calculation fails
    """
    try:
        # Wrap client with adapter
        adapter = FinnhubClientAdapter(finnhub_client)

        # Calculate DCF
        result = calculate_two_stage_dcf(
            symbol,
            adapter,
            **kwargs
        )

        intrinsic_value = result['value']

        # Try to get current price for discount calculation
        current_price = None
        discount_percent = None

        try:
            quote = adapter.quote(symbol)
            current_price = quote.get('c')

            if current_price and current_price > 0:
                # Discount = (Intrinsic - Current) / Current * 100
                discount_percent = ((intrinsic_value - current_price) / current_price) * 100
        except Exception as e:
            logger.debug(f"{symbol}: Could not fetch current price for discount calc: {e}")

        return {
            'intrinsic_value': intrinsic_value,
            'current_price': current_price,
            'discount_percent': discount_percent,
            'components': result['components'],
            'assumptions': result['assumptions'],
            'data_quality': result['data_quality'],
            'confidence': result['confidence'],
        }

    except Exception as e:
        logger.warning(f"{symbol}: DCF calculation failed: {e}")
        return None


def calculate_wacc_score(
    symbol: str,
    finnhub_client,
    **kwargs
) -> Optional[Dict[str, Any]]:
    """
    Calculate WACC (Weighted Average Cost of Capital).

    Args:
        symbol: Stock ticker
        finnhub_client: FinnhubClient instance
        **kwargs: Optional overrides

    Returns:
        Dict with:
        - wacc: float (as decimal, e.g., 0.0994 = 9.94%)
        - components: dict
        - assumptions: list[str]
        - confidence: float

        Or None if calculation fails
    """
    try:
        adapter = FinnhubClientAdapter(finnhub_client)
        result = calculate_wacc(symbol, adapter, **kwargs)
        return result
    except Exception as e:
        logger.warning(f"{symbol}: WACC calculation failed: {e}")
        return None


def calculate_var_risk(
    symbol: str,
    finnhub_client,
    confidence_level: float = 0.95,
    horizon_days: int = 30,
    **kwargs
) -> Optional[Dict[str, Any]]:
    """
    Calculate Monte Carlo Value-at-Risk.

    Args:
        symbol: Stock ticker
        finnhub_client: FinnhubClient instance
        confidence_level: VaR confidence (default 95%)
        horizon_days: VaR horizon in days (default 30)
        **kwargs: Optional overrides

    Returns:
        Dict with:
        - var_absolute: float (in currency units)
        - var_percent: float (as % of current price)
        - components: dict
        - assumptions: list[str]
        - confidence: float

        Or None if calculation fails
    """
    try:
        adapter = FinnhubClientAdapter(finnhub_client)
        result = calculate_monte_carlo_var(
            symbol,
            adapter,
            confidence_level=confidence_level,
            horizon_days=horizon_days,
            **kwargs
        )

        var_absolute = result['value']
        s0 = result['components']['S0']
        var_percent = (var_absolute / s0) * 100 if s0 > 0 else None

        return {
            'var_absolute': var_absolute,
            'var_percent': var_percent,
            'components': result['components'],
            'assumptions': result['assumptions'],
            'data_quality': result['data_quality'],
            'confidence': result['confidence'],
        }
    except Exception as e:
        logger.warning(f"{symbol}: VaR calculation failed: {e}")
        return None
