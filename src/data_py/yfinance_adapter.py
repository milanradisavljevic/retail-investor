"""
Yahoo Finance to Finnhub Adapter

Converts yfinance data structure to Finnhub-compatible format.
This allows DCF formulas to work with both Finnhub and yfinance data sources.

Key Mappings:
- yfinance.cashflow → Finnhub series.annual.freeCashFlow
- yfinance.financials → Finnhub series.annual.netIncome
- yfinance.balance_sheet → Finnhub metric (debt, equity)
- yfinance.info → Finnhub metric (beta, shares, etc.)
- yfinance.history → Finnhub candles

Based on:
- Finnhub API structure (as defined in finnhub_client.py)
- yfinance data structure (as observed in obsinvest)
- DCF formula requirements (dcf_adapter.py)
"""

import logging
from typing import Any, Dict, Optional, List
from datetime import datetime
import pandas as pd

from .yf_client import (
    fetch_all_dcf_data,
    fetch_history,
    fetch_financials,
    fetch_balance_sheet,
    fetch_info,
    fetch_analyst_data,
    normalize_symbol
)

logger = logging.getLogger(__name__)


class YFinanceClient:
    """
    yfinance client that mimics Finnhub API interface.

    Provides the same methods as FinnhubClient but fetches data from Yahoo Finance.
    Can be used as a drop-in replacement for hybrid data sourcing.
    """

    def __init__(self, cache_ttl_hours: int = 24):
        """
        Initialize yfinance client.

        Args:
            cache_ttl_hours: Cache TTL for all yfinance requests
        """
        self.cache_ttl_hours = cache_ttl_hours
        logger.info(f"Initialized YFinanceClient (cache TTL: {cache_ttl_hours}h)")

    def get_basic_financials(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch basic financials in Finnhub-compatible format.

        Combines:
        - yfinance.info → metric fields (beta, marketCap, etc.)
        - yfinance.cashflow → series.annual.freeCashFlow
        - yfinance.financials → series.annual.netIncome
        - yfinance.balance_sheet → debt/equity metrics

        Returns:
            {
                "metric": {
                    "beta": 1.2,
                    "marketCapitalization": 3000000000000,
                    "currentPrice": 150.0,
                    "totalDebt": 100000000000,
                    "totalEquity": 50000000000,
                    ...
                },
                "series": {
                    "annual": {
                        "freeCashFlow": [
                            {"period": "2023-12-31", "v": 99000000000},
                            {"period": "2022-12-31", "v": 92000000000},
                            ...
                        ],
                        "netIncome": [...],
                        ...
                    }
                }
            }
        """
        try:
            # Fetch all data needed
            info_data = fetch_info(symbol, cache_ttl_hours=self.cache_ttl_hours)
            fin_data = fetch_financials(symbol, cache_ttl_hours=self.cache_ttl_hours)
            bs_data = fetch_balance_sheet(symbol, cache_ttl_hours=self.cache_ttl_hours)

            info = info_data.get("info", {})

            # Extract metric fields from yfinance.info
            metric = self._build_metric_from_info(info, fin_data, bs_data)

            # Extract series (annual time series)
            series = self._build_series_from_financials(fin_data, bs_data)

            result = {
                "metric": metric,
                "series": series
            }

            logger.debug(
                f"{symbol}: Built financials with {len(metric)} metrics, "
                f"{len(series.get('annual', {}))} annual series"
            )

            return result

        except Exception as e:
            logger.error(f"{symbol}: Failed to fetch basic financials: {e}")
            return {"metric": {}, "series": {}}

    def get_quote(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch current quote.

        Returns:
            {
                "c": 150.0,  # current price
                "h": 155.0,  # high
                "l": 148.0,  # low
                "o": 149.0,  # open
                "pc": 151.0, # previous close
                "t": 1234567890  # timestamp
            }
        """
        try:
            info_data = fetch_info(symbol, cache_ttl_hours=self.cache_ttl_hours)
            info = info_data.get("info", {})

            # Extract quote fields
            quote = {
                "c": info.get("currentPrice") or info.get("regularMarketPrice"),
                "h": info.get("dayHigh") or info.get("regularMarketDayHigh"),
                "l": info.get("dayLow") or info.get("regularMarketDayLow"),
                "o": info.get("open") or info.get("regularMarketOpen"),
                "pc": info.get("previousClose") or info.get("regularMarketPreviousClose"),
                "t": int(datetime.now().timestamp())
            }

            logger.debug(f"{symbol}: Quote - current price: ${quote.get('c')}")
            return quote

        except Exception as e:
            logger.error(f"{symbol}: Failed to fetch quote: {e}")
            return {}

    def get_company_profile(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch company profile.

        Returns:
            {
                "name": "Apple Inc.",
                "ticker": "AAPL",
                "shareOutstanding": 15000000000,
                "marketCapitalization": 3000000000000,
                "country": "US",
                "currency": "USD",
                "exchange": "NASDAQ",
                "industry": "Consumer Electronics",
                "ipo": "1980-12-12"
            }
        """
        try:
            info_data = fetch_info(symbol, cache_ttl_hours=self.cache_ttl_hours)
            info = info_data.get("info", {})

            profile = {
                "name": info.get("longName") or info.get("shortName"),
                "ticker": normalize_symbol(symbol),
                "shareOutstanding": info.get("sharesOutstanding"),
            "marketCapitalization": info.get("marketCap"),
            "country": info.get("country"),
            "currency": info.get("currency"),
            "exchange": info.get("exchange"),
            "industry": info.get("industry"),
            "sector": info.get("sector"),
            "ipo": info.get("ipoDate")
        }

            logger.debug(f"{symbol}: Profile - shares: {profile.get('shareOutstanding'):,}")
            return profile

        except Exception as e:
            logger.error(f"{symbol}: Failed to fetch profile: {e}")
            return {}

    def get_analyst_data(self, symbol: str) -> Dict[str, Any]:
        """
        Fetch analyst consensus targets, recommendation, and next earnings date.

        Returns:
            {
                "target_mean": float | None,
                "target_low": float | None,
                "target_high": float | None,
                "num_analysts": int | None,
                "recommendation": str | None,
                "next_earnings_date": str | None
            }
        """
        empty = {
            "target_mean": None,
            "target_low": None,
            "target_high": None,
            "num_analysts": None,
            "recommendation": None,
            "next_earnings_date": None,
        }

        try:
            analyst_data = fetch_analyst_data(
                symbol, cache_ttl_hours=self.cache_ttl_hours
            )

            targets_row = self._latest_row(analyst_data.get("price_targets"))
            rec_row = self._latest_row(analyst_data.get("recommendations"))
            next_earnings_date = self._extract_next_earnings_date(
                analyst_data.get("earnings_dates")
            )

            result = {
                "target_mean": self._get_float_from_row(
                    targets_row,
                    ["targetMean", "targetMeanPrice", "target_mean", "mean", "avg", "averagePriceTarget", "targetMedianPrice"],
                ),
                "target_low": self._get_float_from_row(
                    targets_row, ["targetLow", "targetLowPrice", "low"]
                ),
                "target_high": self._get_float_from_row(
                    targets_row, ["targetHigh", "targetHighPrice", "high"]
                ),
                "num_analysts": self._get_int_from_row(
                    targets_row,
                    [
                        "numberOfAnalysts",
                        "numberOfAnalystOpinions",
                        "numAnalysts",
                        "num_analysts",
                    ],
                ),
                "recommendation": self._map_recommendation(rec_row),
                "next_earnings_date": next_earnings_date,
            }

            return result

        except Exception as e:
            logger.error(f"{symbol}: Failed to fetch analyst data: {e}")
            return empty

    def get_candles(
        self,
        symbol: str,
        resolution: str = "D",
        days_back: int = 365
    ) -> Dict[str, Any]:
        """
        Fetch historical candles.

        Args:
            symbol: Ticker symbol
            resolution: "D" for daily (yfinance uses different format)
            days_back: Number of days of history

        Returns:
            {
                "c": [150.0, 151.0, 149.0, ...],  # close prices
                "h": [152.0, 153.0, 151.0, ...],  # high
                "l": [148.0, 149.0, 147.0, ...],  # low
                "o": [149.0, 150.0, 148.0, ...],  # open
                "t": [1234567890, 1234654290, ...], # timestamps
                "v": [100000, 110000, ...],         # volume
                "s": "ok"  # status
            }
        """
        try:
            # Convert days_back to yfinance period
            if days_back <= 7:
                period = "1wk"
            elif days_back <= 30:
                period = "1mo"
            elif days_back <= 90:
                period = "3mo"
            elif days_back <= 180:
                period = "6mo"
            elif days_back <= 365:
                period = "1y"
            elif days_back <= 730:
                period = "2y"
            else:
                period = "5y"

            hist_data = fetch_history(
                symbol,
                period=period,
                interval="1d",
                cache_ttl_hours=self.cache_ttl_hours
            )

            data = hist_data.get("data", [])

            if not data:
                logger.warning(f"{symbol}: No candle data available")
                return {"s": "no_data"}

            # Convert list of dicts to Finnhub format (lists of values)
            candles = {
                "c": [],
                "h": [],
                "l": [],
                "o": [],
                "t": [],
                "v": [],
                "s": "ok"
            }

            for row in data:
                candles["c"].append(row.get("Close"))
                candles["h"].append(row.get("High"))
                candles["l"].append(row.get("Low"))
                candles["o"].append(row.get("Open"))

                # Convert date to timestamp
                date_str = row.get("Date")
                if isinstance(date_str, str):
                    dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    candles["t"].append(int(dt.timestamp()))
                else:
                    # Already a timestamp or datetime
                    candles["t"].append(int(date_str) if isinstance(date_str, (int, float)) else 0)

                candles["v"].append(row.get("Volume", 0))

            logger.debug(f"{symbol}: Fetched {len(candles['c'])} candles")
            return candles

        except Exception as e:
            logger.error(f"{symbol}: Failed to fetch candles: {e}")
            return {"s": "error"}

    def _build_metric_from_info(
        self,
        info: Dict,
        fin_data: Dict,
        bs_data: Dict
    ) -> Dict[str, Any]:
        """
        Build Finnhub-compatible metric dict from yfinance info.

        Maps yfinance field names to Finnhub field names.
        """
        # Get most recent balance sheet data
        bs = bs_data.get("balance_sheet", {})
        bs_latest = {}

        # Extract debt and equity from balance sheet
        total_debt = None
        total_equity = None

        if bs and isinstance(bs, dict):
            # Try various field names (yfinance naming can vary)
            debt_fields = ["Total Debt", "TotalDebt", "Long Term Debt", "LongTermDebt"]
            equity_fields = ["Total Equity", "Stockholders Equity", "StockholdersEquity",
                           "Total Stockholder Equity", "Stockholder Equity"]

            # bs is a dict where each key is a line item, and values are dicts of {date: value}
            for field in debt_fields:
                if field in bs and isinstance(bs[field], dict):
                    # Get the most recent value (sort dates desc)
                    date_values = bs[field]
                    if date_values:
                        # Convert Timestamp keys to strings for comparison
                        sorted_dates = sorted(date_values.keys(), reverse=True,
                                             key=lambda x: pd.Timestamp(x) if not isinstance(x, pd.Timestamp) else x)
                        if sorted_dates:
                            latest_val = date_values[sorted_dates[0]]
                            if latest_val is not None and not pd.isna(latest_val):
                                total_debt = float(latest_val)
                                break

            for field in equity_fields:
                if field in bs and isinstance(bs[field], dict):
                    date_values = bs[field]
                    if date_values:
                        sorted_dates = sorted(date_values.keys(), reverse=True,
                                             key=lambda x: pd.Timestamp(x) if not isinstance(x, pd.Timestamp) else x)
                        if sorted_dates:
                            latest_val = date_values[sorted_dates[0]]
                            if latest_val is not None and not pd.isna(latest_val):
                                total_equity = float(latest_val)
                                break

        # Build metric dict
        metric = {
            # Price & Valuation
            "currentPrice": info.get("currentPrice") or info.get("regularMarketPrice"),
            "marketCapitalization": info.get("marketCap"),

            # Profitability
            "beta": info.get("beta"),
            "roeTTM": info.get("returnOnEquity"),
            "roaTTM": info.get("returnOnAssets"),
            "roiTTM": info.get("returnOnInvestment"),  # Proxy for ROIC

            # Margins
            "grossMarginTTM": info.get("grossMargins"),
            "operatingMarginTTM": info.get("operatingMargins"),
            "profitMarginTTM": info.get("profitMargins"),

            # Valuation Ratios
            "pb": info.get("priceToBook"),
            "pbQuarterly": info.get("priceToBook"),  # Same for yfinance
            "peTTM": info.get("trailingPE"),
            "peForward": info.get("forwardPE"),
            "evEbitdaTTM": info.get("enterpriseToEbitda"),

            # Debt & Capital Structure
            "totalDebt": total_debt,
            "totalEquity": total_equity,
            "debtToEquity": info.get("debtToEquity"),

            # Shares
            "sharesOutstanding": info.get("sharesOutstanding"),

            # Growth
            "revenueGrowthTTM": info.get("revenueGrowth"),
            "earningsGrowthTTM": info.get("earningsGrowth"),

            # Dividend
            "dividendYieldTTM": info.get("dividendYield"),

            # Additional useful fields
            "enterpriseValue": info.get("enterpriseValue"),
            "freeCashflow": info.get("freeCashflow"),  # TTM from info
        }

        # Remove None values
        return {k: v for k, v in metric.items() if v is not None}

    def _build_series_from_financials(
        self,
        fin_data: Dict,
        bs_data: Dict
    ) -> Dict[str, Any]:
        """
        Build Finnhub-compatible series dict from yfinance financials.

        Converts annual time series to Finnhub format:
        [{"period": "2023-12-31", "v": 99000000000}, ...]
        """
        cashflow = fin_data.get("cashflow", {})
        financials = fin_data.get("financials", {})

        series = {
            "annual": {}
        }

        # Extract Free Cash Flow
        fcf_series = self._extract_time_series(
            cashflow,
            ["Free Cash Flow", "FreeCashFlow", "Operating Cash Flow"]
        )
        if fcf_series:
            series["annual"]["freeCashFlow"] = fcf_series

        # Extract Net Income
        ni_series = self._extract_time_series(
            financials,
            ["Net Income", "NetIncome", "Net Income Common Stockholders"]
        )
        if ni_series:
            series["annual"]["netIncome"] = ni_series

        # Extract Revenue
        revenue_series = self._extract_time_series(
            financials,
            ["Total Revenue", "TotalRevenue", "Revenue"]
        )
        if revenue_series:
            series["annual"]["revenue"] = revenue_series

        return series

    def _extract_time_series(
        self,
        df_dict: Dict,
        field_names: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Extract time series from yfinance DataFrame dict.

        Args:
            df_dict: DataFrame as dict (from yfinance)
            field_names: List of possible field names to try

        Returns:
            [{"period": "2023-12-31", "v": 99000000000}, ...]
        """
        for field_name in field_names:
            if field_name in df_dict and isinstance(df_dict[field_name], dict):
                data = df_dict[field_name]

                # data is a dict with dates as keys (potentially Timestamp objects)
                series = []

                # Sort by date (handle Timestamp objects)
                try:
                    sorted_items = sorted(
                        data.items(),
                        reverse=True,
                        key=lambda item: pd.Timestamp(item[0]) if not isinstance(item[0], pd.Timestamp) else item[0]
                    )
                except Exception:
                    # Fallback: just use items as-is
                    sorted_items = list(data.items())

                for date, value in sorted_items:
                    if value is not None and not pd.isna(value):
                        # Convert date to string format
                        if isinstance(date, pd.Timestamp):
                            period_str = date.strftime("%Y-%m-%d")
                        elif hasattr(date, 'isoformat'):
                            period_str = date.isoformat()[:10]  # YYYY-MM-DD
                        else:
                            period_str = str(date)[:10]

                        series.append({
                            "period": period_str,
                            "v": float(value)
                        })

                if series:
                    return series

        return []

    def _latest_row(self, rows: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not rows or not isinstance(rows, dict):
            return None

        try:
            sorted_keys = sorted(
                rows.keys(),
                reverse=True,
                key=lambda x: pd.Timestamp(x) if not isinstance(x, pd.Timestamp) else x,
            )
        except Exception:
            sorted_keys = list(rows.keys())

        for key in sorted_keys:
            row = rows.get(key)
            if isinstance(row, dict) and row:
                return row

        return None

    def _get_float_from_row(self, row: Optional[Dict[str, Any]], keys: List[str]) -> Optional[float]:
        if not row:
            return None
        for key in keys:
            if key in row and row[key] is not None and not pd.isna(row[key]):
                try:
                    return float(row[key])
                except (TypeError, ValueError):
                    continue
        return None

    def _get_int_from_row(self, row: Optional[Dict[str, Any]], keys: List[str]) -> Optional[int]:
        value = self._get_float_from_row(row, keys)
        return int(value) if value is not None else None

    def _map_recommendation(self, row: Optional[Dict[str, Any]]) -> Optional[str]:
        if not row:
            return None

        grade = row.get("To Grade") or row.get("toGrade") or row.get("Action") or row.get("action")
        if not grade:
            return None

        grade_lower = str(grade).lower()
        if any(word in grade_lower for word in ["strong buy", "buy", "outperform", "overweight", "accumulate", "positive"]):
            return "buy"
        if any(word in grade_lower for word in ["hold", "neutral", "market perform", "equal-weight", "equal weight"]):
            return "hold"
        if any(word in grade_lower for word in ["sell", "underperform", "reduce", "negative", "underweight"]):
            return "sell"

        return None

    def _extract_next_earnings_date(self, rows: Optional[Dict[str, Any]]) -> Optional[str]:
        if not rows or not isinstance(rows, dict):
            return None

        today = datetime.utcnow().date()
        parsed_dates = []

        for key in rows.keys():
            row = rows.get(key) if isinstance(rows, dict) else None
            dt = self._parse_date(key) or (row and self._parse_date(row.get("Earnings Date")))
            if dt:
                parsed_dates.append(dt.date())

        if not parsed_dates:
            return None

        future = sorted([d for d in parsed_dates if d >= today])
        if future:
            return future[0].isoformat()

        # Fallback to the most recent past date
        parsed_dates.sort()
        return parsed_dates[-1].isoformat()

    def _parse_date(self, value: Any) -> Optional[datetime]:
        try:
            ts = pd.to_datetime(value)
            if pd.isna(ts):
                return None
            return ts.to_pydatetime()
        except Exception:
            return None

    def close(self):
        """Close client (no-op for yfinance, kept for API compatibility)."""
        pass
