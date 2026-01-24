"""Yahoo Finance client using yfinance library with caching and retry logic.

Inspired by obsinvest architecture but adapted for DCF valuation needs.
Fetches annual financial statements, balance sheet data, and historical prices.
"""

import logging
import time
from datetime import datetime
from typing import Any, Dict, Optional
import pandas as pd

from .cache import SQLiteCache

logger = logging.getLogger(__name__)

try:
    import yfinance as yf
except ImportError:
    yf = None
    logger.warning("yfinance not installed - Yahoo Finance functionality unavailable")


def normalize_symbol(symbol: str) -> str:
    """Normalize ticker symbol to uppercase."""
    return symbol.strip().upper()


def _retry_call(fn, *, retries: int = 3, backoff: float = 1.0) -> Any:
    """
    Execute function with exponential backoff retry logic.

    Args:
        fn: Function to execute
        retries: Number of retry attempts
        backoff: Base backoff time in seconds (doubles each retry)

    Returns:
        Result of function call

    Raises:
        Last exception if all retries fail
    """
    last_exc = None
    for i in range(retries + 1):
        try:
            return fn()
        except Exception as exc:
            last_exc = exc
            if i < retries:  # Don't sleep on last attempt
                sleep_s = backoff * (2 ** i)
                logger.warning(
                    f"yfinance call failed ({type(exc).__name__}: {exc}), "
                    f"retrying in {sleep_s:.1f}s (attempt {i+1}/{retries+1})"
                )
                time.sleep(sleep_s)
    if last_exc:
        raise last_exc
    raise RuntimeError("Retry logic failed without exception")


def fetch_history(
    symbol: str,
    *,
    period: str = "1y",
    interval: str = "1d",
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Fetch historical price data.

    Args:
        symbol: Ticker symbol (e.g., "AAPL")
        period: Time period (e.g., "1y", "2y", "5y", "max")
        interval: Data interval (e.g., "1d", "1wk", "1mo")
        use_cache: Whether to use cache
        cache_ttl_hours: Cache TTL in hours

    Returns:
        {
            "symbol": "AAPL",
            "data": [
                {"Date": "2024-01-01", "Open": 150.0, "High": 152.0, ...},
                ...
            ]
        }
    """
    if yf is None:
        raise RuntimeError("yfinance is not installed. Run: pip install yfinance")

    cache_key = f"history_{period}_{interval}"
    cache = SQLiteCache(ttl_hours=cache_ttl_hours)

    # Try cache first
    if use_cache:
        cached = cache.get(symbol, cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {symbol} {cache_key}")
            return cached

    # Fetch from yfinance
    def _fetch():
        ticker = yf.Ticker(normalize_symbol(symbol))
        hist = ticker.history(period=period, interval=interval, auto_adjust=False)

        if hist.empty:
            logger.warning(f"No historical data for {symbol}")
            return {"symbol": normalize_symbol(symbol), "data": []}

        # Convert to JSON-friendly format
        hist = hist.reset_index()

        # Convert any Timestamp columns to strings
        for col in hist.columns:
            if pd.api.types.is_datetime64_any_dtype(hist[col]):
                hist[col] = hist[col].dt.strftime('%Y-%m-%d')

        data = hist.to_dict(orient="records")

        return {
            "symbol": normalize_symbol(symbol),
            "data": data
        }

    result = _retry_call(_fetch)

    # Cache result
    if use_cache:
        cache.set(symbol, cache_key, result)

    return result


def fetch_financials(
    symbol: str,
    *,
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Fetch annual financial statements (Income Statement, Cash Flow).

    Critical for DCF: Free Cash Flow, Net Income, Revenue growth.

    Args:
        symbol: Ticker symbol
        use_cache: Whether to use cache
        cache_ttl_hours: Cache TTL (default 24h for fundamentals)

    Returns:
        {
            "symbol": "AAPL",
            "cashflow": pd.DataFrame as dict (annual),
            "financials": pd.DataFrame as dict (annual),
            "quarterly_cashflow": pd.DataFrame as dict (quarterly),
            "quarterly_financials": pd.DataFrame as dict (quarterly)
        }
    """
    if yf is None:
        raise RuntimeError("yfinance is not installed. Run: pip install yfinance")

    cache_key = "financials_annual"
    cache = SQLiteCache(ttl_hours=cache_ttl_hours)

    # Try cache first
    if use_cache:
        cached = cache.get(symbol, cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {symbol} {cache_key}")
            return cached

    # Fetch from yfinance
    def _fetch():
        ticker = yf.Ticker(normalize_symbol(symbol))

        # Get annual statements
        cashflow = ticker.cashflow  # Annual cash flow
        financials = ticker.financials  # Annual income statement

        # Get quarterly statements (useful for recent trends)
        quarterly_cf = ticker.quarterly_cashflow
        quarterly_fin = ticker.quarterly_financials

        # Convert DataFrames to dict - need to handle Timestamp columns
        def df_to_json_dict(df):
            if df.empty:
                return {}
            # DataFrames from yfinance: rows=line items, columns=dates
            # We want: {line_item: {date: value}}
            df_copy = df.copy()
            # Convert column names (dates) to strings
            if hasattr(df_copy.columns, 'strftime'):
                df_copy.columns = df_copy.columns.strftime('%Y-%m-%d')
            else:
                df_copy.columns = [str(col) for col in df_copy.columns]
            # Use orient='index' to get {row_name: {column_name: value}}
            return df_copy.to_dict(orient='index')

        result = {
            "symbol": normalize_symbol(symbol),
            "cashflow": df_to_json_dict(cashflow),
            "financials": df_to_json_dict(financials),
            "quarterly_cashflow": df_to_json_dict(quarterly_cf),
            "quarterly_financials": df_to_json_dict(quarterly_fin)
        }

        logger.info(
            f"Fetched financials for {symbol}: "
            f"{len(cashflow.columns) if not cashflow.empty else 0} annual periods, "
            f"{len(quarterly_cf.columns) if not quarterly_cf.empty else 0} quarterly periods"
        )

        return result

    result = _retry_call(_fetch)

    # Cache result
    if use_cache:
        cache.set(symbol, cache_key, result)

    return result


def fetch_balance_sheet(
    symbol: str,
    *,
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Fetch balance sheet data.

    Critical for DCF: Total Debt, Total Equity, Shares Outstanding.

    Args:
        symbol: Ticker symbol
        use_cache: Whether to use cache
        cache_ttl_hours: Cache TTL

    Returns:
        {
            "symbol": "AAPL",
            "balance_sheet": pd.DataFrame as dict (annual),
            "quarterly_balance_sheet": pd.DataFrame as dict (quarterly)
        }
    """
    if yf is None:
        raise RuntimeError("yfinance is not installed. Run: pip install yfinance")

    cache_key = "balance_sheet_annual"
    cache = SQLiteCache(ttl_hours=cache_ttl_hours)

    # Try cache first
    if use_cache:
        cached = cache.get(symbol, cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {symbol} {cache_key}")
            return cached

    # Fetch from yfinance
    def _fetch():
        ticker = yf.Ticker(normalize_symbol(symbol))

        balance_sheet = ticker.balance_sheet  # Annual
        quarterly_bs = ticker.quarterly_balance_sheet  # Quarterly

        # Convert DataFrames to dict - handle Timestamp columns
        def df_to_json_dict(df):
            if df.empty:
                return {}
            df_copy = df.copy()
            # Convert column names (dates) to strings
            if hasattr(df_copy.columns, 'strftime'):
                df_copy.columns = df_copy.columns.strftime('%Y-%m-%d')
            else:
                df_copy.columns = [str(col) for col in df_copy.columns]
            # Use orient='index' to get {row_name: {column_name: value}}
            return df_copy.to_dict(orient='index')

        result = {
            "symbol": normalize_symbol(symbol),
            "balance_sheet": df_to_json_dict(balance_sheet),
            "quarterly_balance_sheet": df_to_json_dict(quarterly_bs)
        }

        logger.info(
            f"Fetched balance sheet for {symbol}: "
            f"{len(balance_sheet.columns) if not balance_sheet.empty else 0} annual periods"
        )

        return result

    result = _retry_call(_fetch)

    # Cache result
    if use_cache:
        cache.set(symbol, cache_key, result)

    return result


def fetch_info(
    symbol: str,
    *,
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Fetch comprehensive stock info/metadata.

    Includes: Beta, Shares Outstanding, Market Cap, Sector, Industry, etc.

    Args:
        symbol: Ticker symbol
        use_cache: Whether to use cache
        cache_ttl_hours: Cache TTL

    Returns:
        {
            "symbol": "AAPL",
            "info": {
                "beta": 1.2,
                "sharesOutstanding": 15000000000,
                "marketCap": 3000000000000,
                "sector": "Technology",
                ...
            }
        }
    """
    if yf is None:
        raise RuntimeError("yfinance is not installed. Run: pip install yfinance")

    cache_key = "info"
    cache = SQLiteCache(ttl_hours=cache_ttl_hours)

    # Try cache first
    if use_cache:
        cached = cache.get(symbol, cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {symbol} {cache_key}")
            return cached

    # Fetch from yfinance
    def _fetch():
        ticker = yf.Ticker(normalize_symbol(symbol))
        info = ticker.info

        result = {
            "symbol": normalize_symbol(symbol),
            "info": info
        }

        logger.info(f"Fetched info for {symbol}: {len(info)} fields")

        return result

    result = _retry_call(_fetch)

    # Cache result
    if use_cache:
        cache.set(symbol, cache_key, result)

    return result


def fetch_analyst_data(
    symbol: str,
    *,
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Fetch analyst-related data: price targets, recommendations, earnings dates.

    Returns JSON-friendly dicts keyed by index (usually dates).
    """
    if yf is None:
        raise RuntimeError("yfinance is not installed. Run: pip install yfinance")

    cache_key = "analyst_data"
    cache = SQLiteCache(ttl_hours=cache_ttl_hours)

    if use_cache:
        cached = cache.get(symbol, cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {symbol} {cache_key}")
            return cached

    def _df_to_index_dict(df: Any) -> Dict[str, Any]:
        if df is None or (hasattr(df, "empty") and getattr(df, "empty")):
            return {}

        df_copy = df.copy()

        def normalize_value(value: Any) -> Any:
            if isinstance(value, (pd.Timestamp, datetime)):
                return value.strftime("%Y-%m-%d")
            return value

        # Normalize index
        if hasattr(df_copy.index, "strftime"):
            df_copy.index = df_copy.index.map(
                lambda x: x.strftime("%Y-%m-%d") if hasattr(x, "strftime") else str(x)
            )
        else:
            df_copy.index = [str(idx) for idx in df_copy.index]

        # Normalize columns
        if hasattr(df_copy.columns, "strftime"):
            df_copy.columns = df_copy.columns.strftime("%Y-%m-%d")
        else:
            df_copy.columns = [str(col) for col in df_copy.columns]

        df_copy = df_copy.applymap(normalize_value)

        return df_copy.to_dict(orient="index")

    def _fetch():
        ticker = yf.Ticker(normalize_symbol(symbol))

        return {
            "symbol": normalize_symbol(symbol),
            "price_targets": _df_to_index_dict(getattr(ticker, "analyst_price_targets", None)),
            "earnings_dates": _df_to_index_dict(getattr(ticker, "earnings_dates", None)),
            "recommendations": _df_to_index_dict(getattr(ticker, "recommendations", None)),
        }

    result = _retry_call(_fetch)

    if use_cache:
        cache.set(symbol, cache_key, result)

    return result


def fetch_all_dcf_data(
    symbol: str,
    *,
    use_cache: bool = True,
    cache_ttl_hours: int = 24
) -> Dict[str, Any]:
    """
    Convenience function to fetch all data needed for DCF valuation.

    Combines: financials, balance_sheet, info, and historical prices.

    Args:
        symbol: Ticker symbol
        use_cache: Whether to use cache
        cache_ttl_hours: Cache TTL

    Returns:
        {
            "symbol": "AAPL",
            "financials": {...},
            "balance_sheet": {...},
            "info": {...},
            "history": {...}
        }
    """
    logger.info(f"Fetching all DCF data for {symbol}")

    return {
        "symbol": normalize_symbol(symbol),
        "financials": fetch_financials(symbol, use_cache=use_cache, cache_ttl_hours=cache_ttl_hours),
        "balance_sheet": fetch_balance_sheet(symbol, use_cache=use_cache, cache_ttl_hours=cache_ttl_hours),
        "info": fetch_info(symbol, use_cache=use_cache, cache_ttl_hours=cache_ttl_hours),
        "history": fetch_history(symbol, period="1y", use_cache=use_cache, cache_ttl_hours=cache_ttl_hours)
    }
