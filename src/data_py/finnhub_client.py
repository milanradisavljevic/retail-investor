"""Finnhub API client with rate limiting and retry logic."""

import logging
import time
from typing import Optional, Any
from datetime import datetime, timedelta
import requests

logger = logging.getLogger(__name__)


class RateLimiter:
    """Token bucket rate limiter for API requests."""

    def __init__(self, max_requests: int = 60, time_window: int = 60):
        """
        Initialize rate limiter.

        Args:
            max_requests: Maximum requests allowed per time window
            time_window: Time window in seconds
        """
        self.max_requests = max_requests
        self.time_window = time_window
        self.requests = []

    def wait_if_needed(self) -> None:
        """Block if rate limit would be exceeded."""
        now = time.time()

        # Remove requests outside the time window
        self.requests = [
            req_time
            for req_time in self.requests
            if now - req_time < self.time_window
        ]

        # If at limit, wait until oldest request expires
        if len(self.requests) >= self.max_requests:
            oldest = self.requests[0]
            wait_time = self.time_window - (now - oldest) + 0.1  # Small buffer
            if wait_time > 0:
                logger.debug(
                    f"Rate limit reached, waiting {wait_time:.2f}s"
                )
                time.sleep(wait_time)
                now = time.time()

        # Record this request
        self.requests.append(now)


class FinnhubClient:
    """
    Finnhub API client with rate limiting and caching.

    Handles the free tier limit of 60 requests/minute.
    """

    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(
        self,
        api_key: str,
        cache=None,
        max_requests: int = 60,
        retry_attempts: int = 3,
    ):
        """
        Initialize Finnhub client.

        Args:
            api_key: Finnhub API key
            cache: Optional cache instance (should have get/set methods)
            max_requests: Max requests per minute
            retry_attempts: Number of retry attempts on failure
        """
        self.api_key = api_key
        self.cache = cache
        self.retry_attempts = retry_attempts
        self.rate_limiter = RateLimiter(max_requests=max_requests, time_window=60)
        self.session = requests.Session()

    def _make_request(
        self, endpoint: str, params: Optional[dict] = None
    ) -> dict:
        """
        Make API request with rate limiting and retries.

        Args:
            endpoint: API endpoint (e.g., "/stock/metric")
            params: Query parameters

        Returns:
            JSON response as dictionary

        Raises:
            requests.exceptions.RequestException: On API error
        """
        url = f"{self.BASE_URL}{endpoint}"
        params = params or {}
        params["token"] = self.api_key

        for attempt in range(self.retry_attempts):
            try:
                # Rate limiting
                self.rate_limiter.wait_if_needed()

                # Make request
                response = self.session.get(url, params=params, timeout=10)
                response.raise_for_status()

                return response.json()

            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:  # Rate limit
                    wait_time = 2 ** attempt  # Exponential backoff
                    logger.warning(
                        f"Rate limited by API, waiting {wait_time}s"
                    )
                    time.sleep(wait_time)
                    continue
                elif attempt < self.retry_attempts - 1:
                    logger.warning(f"HTTP error: {e}, retrying...")
                    time.sleep(1)
                    continue
                else:
                    logger.error(f"HTTP error after {attempt + 1} attempts: {e}")
                    raise

            except requests.exceptions.RequestException as e:
                if attempt < self.retry_attempts - 1:
                    logger.warning(f"Request error: {e}, retrying...")
                    time.sleep(1)
                    continue
                else:
                    logger.error(f"Request failed after {attempt + 1} attempts: {e}")
                    raise

        raise Exception("Max retry attempts exceeded")

    def get_basic_financials(self, symbol: str) -> dict:
        """
        Get basic financial metrics for a symbol.

        Returns metrics including: beta, roic, grossMargin, enterpriseValueOverEBITDA,
        freeCashFlow, priceBookMrq, marketCapitalization, totalDebt, totalEquity, roa.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Dictionary with metric.* fields as returned by Finnhub
        """
        # Check cache first
        if self.cache:
            cached = self.cache.get(symbol, "basic_financials")
            if cached:
                logger.debug(f"{symbol}: Using cached basic financials")
                return cached

        # Fetch from API
        logger.debug(f"{symbol}: Fetching basic financials from API")
        data = self._make_request(
            "/stock/metric", params={"symbol": symbol, "metric": "all"}
        )

        # Cache the result
        if self.cache:
            self.cache.set(symbol, "basic_financials", data)

        return data

    def get_candles(
        self,
        symbol: str,
        resolution: str = "D",
        days_back: int = 365,
    ) -> dict:
        """
        Get historical price candles.

        Args:
            symbol: Stock ticker symbol
            resolution: Candle resolution (D=day, W=week, M=month)
            days_back: Number of days of history to fetch

        Returns:
            Dictionary with c (close), h (high), l (low), o (open), t (timestamp), v (volume)
        """
        # Calculate date range
        to_date = int(time.time())
        from_date = int(
            (datetime.now() - timedelta(days=days_back)).timestamp()
        )

        # Check cache
        cache_key = f"candles_{resolution}_{days_back}d"
        if self.cache:
            cached = self.cache.get(symbol, cache_key)
            if cached:
                logger.debug(f"{symbol}: Using cached candles")
                return cached

        # Fetch from API
        logger.debug(f"{symbol}: Fetching candles from API")
        data = self._make_request(
            "/stock/candle",
            params={
                "symbol": symbol,
                "resolution": resolution,
                "from": from_date,
                "to": to_date,
            },
        )

        # Cache the result
        if self.cache:
            self.cache.set(symbol, cache_key, data)

        return data

    def get_quote(self, symbol: str) -> dict:
        """
        Get current quote for a symbol.

        Returns: Dictionary with 'c' (current price), 'h' (high), 'l' (low), etc.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Dictionary with quote data
        """
        # Check cache first
        if self.cache:
            cached = self.cache.get(symbol, "quote")
            if cached:
                logger.debug(f"{symbol}: Using cached quote")
                return cached

        # Fetch from API
        logger.debug(f"{symbol}: Fetching quote from API")
        data = self._make_request("/quote", params={"symbol": symbol})

        # Cache the result
        if self.cache:
            self.cache.set(symbol, "quote", data)

        return data

    def get_company_profile(self, symbol: str) -> dict:
        """
        Get company profile information.

        Returns company data including shareOutstanding, marketCapitalization, etc.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Dictionary with company profile data
        """
        # Check cache first
        if self.cache:
            cached = self.cache.get(symbol, "company_profile")
            if cached:
                logger.debug(f"{symbol}: Using cached company profile")
                return cached

        # Fetch from API
        logger.debug(f"{symbol}: Fetching company profile from API")
        data = self._make_request("/stock/profile2", params={"symbol": symbol})

        # Cache the result
        if self.cache:
            self.cache.set(symbol, "company_profile", data)

        return data

    def close(self) -> None:
        """Close the session."""
        self.session.close()
