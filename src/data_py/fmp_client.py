"""Financial Modeling Prep (FMP) API Client.

Free tier: 250 calls/day, US stocks only.
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Optional

import requests

from .cache import SQLiteCache

logger = logging.getLogger(__name__)


class FMPClient:
    """FMP API client with caching, retries, and call-budget tracking."""

    BASE_URL = "https://financialmodelingprep.com"
    MAX_CALLS_PER_SESSION = 250
    WARN_CALLS_THRESHOLD = 200

    def __init__(
        self,
        api_key: str,
        cache: SQLiteCache,
        max_calls_per_session: int | None = None,
    ):
        if not api_key:
            raise ValueError("FMP API key is required")
        self.api_key = api_key
        self.cache = cache
        self.session = requests.Session()
        self.calls_made = 0
        self.max_calls_per_session = (
            self.MAX_CALLS_PER_SESSION
            if max_calls_per_session is None
            else max(0, int(max_calls_per_session))
        )
        self.last_status_code: int | None = None
        self._warned_budget = False

    def _log(self, level: str, event: str, **data: Any) -> None:
        payload = {"event": event, **data}
        message = json.dumps(payload, sort_keys=True, default=str)
        if level == "debug":
            logger.debug(message)
        elif level == "warning":
            logger.warning(message)
        elif level == "error":
            logger.error(message)
        else:
            logger.info(message)

    @staticmethod
    def _redact_secrets(value: Any) -> str:
        text = "" if value is None else str(value)
        return re.sub(r"(apikey=)[^&\s]+", r"\1***", text)

    def _register_call(self) -> None:
        if self.calls_made >= self.max_calls_per_session:
            self._log(
                "error",
                "fmp.call_budget_exhausted",
                calls_made=self.calls_made,
                max_calls=self.max_calls_per_session,
            )
            raise RuntimeError(
                f"FMP session call budget exhausted ({self.max_calls_per_session})"
            )

        self.calls_made += 1
        if self.calls_made > self.WARN_CALLS_THRESHOLD and not self._warned_budget:
            self._warned_budget = True
            self._log(
                "warning",
                "fmp.call_budget_warning",
                calls_made=self.calls_made,
                warning_threshold=self.WARN_CALLS_THRESHOLD,
                max_calls=self.max_calls_per_session,
            )

    def _request_json(
        self, endpoint: str, params: Optional[dict[str, Any]] = None, retries: int = 3
    ) -> Optional[Any]:
        url = f"{self.BASE_URL}{endpoint}"
        query: dict[str, Any] = dict(params or {})
        query["apikey"] = self.api_key

        for attempt in range(retries + 1):
            self._register_call()
            try:
                response = self.session.get(url, params=query, timeout=20)
            except requests.RequestException as exc:
                self.last_status_code = None
                if attempt < retries:
                    delay = 2 ** attempt
                    self._log(
                        "warning",
                        "fmp.network_retry",
                        endpoint=endpoint,
                        attempt=attempt + 1,
                        retries=retries,
                        delay_seconds=delay,
                        error=self._redact_secrets(exc),
                    )
                    time.sleep(delay)
                    continue
                self._log(
                    "error",
                    "fmp.network_failed",
                    endpoint=endpoint,
                    attempt=attempt + 1,
                    error=self._redact_secrets(exc),
                )
                return None

            if response.status_code == 200:
                self.last_status_code = 200
                try:
                    return response.json()
                except ValueError:
                    self._log(
                        "error",
                        "fmp.invalid_json",
                        endpoint=endpoint,
                        status_code=response.status_code,
                    )
                    return None

            if response.status_code == 403:
                self.last_status_code = 403
                self._log(
                    "error",
                    "fmp.invalid_api_key",
                    endpoint=endpoint,
                    status_code=response.status_code,
                )
                raise RuntimeError("FMP API key invalid or forbidden (HTTP 403)")

            if response.status_code == 429:
                self.last_status_code = 429
                if attempt < retries:
                    retry_after_header = response.headers.get("Retry-After")
                    retry_after = 0.0
                    if retry_after_header:
                        try:
                            retry_after = float(retry_after_header)
                        except ValueError:
                            retry_after = 0.0
                    delay = max(retry_after, float(2 ** attempt))
                    self._log(
                        "warning",
                        "fmp.rate_limited_retry",
                        endpoint=endpoint,
                        attempt=attempt + 1,
                        retries=retries,
                        delay_seconds=delay,
                    )
                    time.sleep(delay)
                    continue
                self._log(
                    "error",
                    "fmp.rate_limited_failed",
                    endpoint=endpoint,
                    retries=retries,
                )
                return None

            if response.status_code == 402:
                self.last_status_code = 402
                self._log(
                    "warning",
                    "fmp.plan_limited",
                    endpoint=endpoint,
                    status_code=response.status_code,
                    response_text=self._redact_secrets(response.text[:250]),
                )
                return None

            if response.status_code >= 500 and attempt < retries:
                self.last_status_code = response.status_code
                delay = 2 ** attempt
                self._log(
                    "warning",
                    "fmp.server_retry",
                    endpoint=endpoint,
                    status_code=response.status_code,
                    attempt=attempt + 1,
                    retries=retries,
                    delay_seconds=delay,
                )
                time.sleep(delay)
                continue

            self.last_status_code = response.status_code
            self._log(
                "error",
                "fmp.http_error",
                endpoint=endpoint,
                status_code=response.status_code,
                response_text=self._redact_secrets(response.text[:250]),
            )
            return None

        return None

    @staticmethod
    def _first_record(data: Any) -> dict[str, Any] | None:
        if isinstance(data, list) and data and isinstance(data[0], dict):
            return data[0]
        if isinstance(data, dict):
            return data
        return None

    @staticmethod
    def _build_unavailable_sentinel(field: str, reason: str) -> dict[str, Any]:
        return {
            "_fmp_unavailable": True,
            "_field": field,
            "_reason": reason,
            "_source": "fmp_stable",
        }

    def fetch_ratios(self, symbol: str) -> dict | None:
        symbol = symbol.strip().upper()

        cached = self.cache.get(symbol, "ratios")
        if isinstance(cached, dict):
            return cached

        latest = self._first_record(
            self._request_json("/stable/ratios-ttm", params={"symbol": symbol})
        )
        if latest is None:
            if self.last_status_code == 402:
                sentinel = self._build_unavailable_sentinel(
                    field="ratios", reason="plan_limited_or_unavailable"
                )
                self.cache.set(symbol, "ratios", sentinel)
                self._log(
                    "warning",
                    "fmp.ratios_unavailable_cached",
                    symbol=symbol,
                    reason=sentinel["_reason"],
                )
                return sentinel
            self._log("warning", "fmp.ratios_missing", symbol=symbol)
            return None

        self.cache.set(symbol, "ratios", latest)
        return latest

    def fetch_profile(self, symbol: str) -> dict | None:
        symbol = symbol.strip().upper()

        cached = self.cache.get(symbol, "profile")
        if isinstance(cached, dict):
            return cached

        profile = self._first_record(
            self._request_json("/stable/profile", params={"symbol": symbol})
        )
        if profile is None:
            if self.last_status_code == 402:
                sentinel = self._build_unavailable_sentinel(
                    field="profile", reason="plan_limited_or_unavailable"
                )
                self.cache.set(symbol, "profile", sentinel)
                self._log(
                    "warning",
                    "fmp.profile_unavailable_cached",
                    symbol=symbol,
                    reason=sentinel["_reason"],
                )
                return sentinel
            self._log("warning", "fmp.profile_missing", symbol=symbol)
            return None

        self.cache.set(symbol, "profile", profile)
        return profile

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value is None:
            return None
        try:
            parsed = float(value)
            if parsed != parsed:  # NaN check without math import
                return None
            return parsed
        except (TypeError, ValueError):
            return None

    def _map_to_fundamentals(self, ratios: dict, profile: dict) -> dict:
        """Map FMP stable API fields to our FundamentalsData format."""
        # FMP /stable/ratios-ttm Feld-Referenz (Stand 2026-02-13):
        # Verfügbar: priceToEarningsRatioTTM, priceToBookRatioTTM,
        #   priceToSalesRatioTTM, priceToEarningsGrowthRatioTTM,
        #   grossProfitMarginTTM, operatingProfitMarginTTM, netProfitMarginTTM,
        #   debtToEquityRatioTTM, currentRatioTTM,
        #   dividendYieldTTM, dividendPayoutRatioTTM,
        #   enterpriseValueTTM, freeCashFlowPerShareTTM
        # NICHT verfügbar: ROE, ROA, revenueGrowth, earningsGrowth,
        #   freeCashFlow (absolut), marketCap (-> kommt aus /stable/profile)

        def pct(value: Any) -> float | None:
            parsed = self._to_float(value)
            if parsed is None:
                return None
            if abs(parsed) < 1.0:
                return round(parsed * 100, 4)
            return round(parsed, 4)

        def raw(value: Any) -> float | None:
            parsed = self._to_float(value)
            if parsed is None:
                return None
            return round(parsed, 4)

        return {
            # === Valuation (absolute Zahlen, kein pct) ===
            "peRatio": raw(ratios.get("priceToEarningsRatioTTM")),
            "pbRatio": raw(ratios.get("priceToBookRatioTTM")),
            "psRatio": raw(ratios.get("priceToSalesRatioTTM")),
            "pegRatio": raw(ratios.get("priceToEarningsGrowthRatioTTM")),
            # === Quality ===
            "roe": None,  # Nicht in ratios-ttm verfügbar
            "roa": None,  # Nicht in ratios-ttm verfügbar
            # === Margins (Dezimal -> Prozent) ===
            "grossMargin": pct(ratios.get("grossProfitMarginTTM")),
            "operatingMargin": pct(ratios.get("operatingProfitMarginTTM")),
            "netMargin": pct(ratios.get("netProfitMarginTTM")),
            # === Risk ===
            "debtToEquity": raw(ratios.get("debtToEquityRatioTTM")),
            "currentRatio": raw(ratios.get("currentRatioTTM")),
            # === Dividende (Dezimal -> Prozent) ===
            "dividendYield": pct(ratios.get("dividendYieldTTM")),
            "payoutRatio": pct(ratios.get("dividendPayoutRatioTTM")),
            # === Cash Flow ===
            "freeCashFlow": None,  # Nur per-share verfuegbar in ratios-ttm
            "freeCashFlowPerShareTTM": raw(ratios.get("freeCashFlowPerShareTTM")),
            # === Size ===
            "marketCap": raw(profile.get("mktCap") or profile.get("marketCap")),
            "enterpriseValue": raw(ratios.get("enterpriseValueTTM")),
            # === Growth ===
            "revenueGrowth": None,  # Nicht in ratios-ttm verfuegbar
            "earningsGrowth": None,  # Nicht in ratios-ttm verfuegbar
            # === Price-derived ===
            "beta": raw(profile.get("beta")),
            # === Meta ===
            "_source": "fmp",
        }

    def build_fundamentals(
        self, symbol: str, ratios: dict | None, profile: dict | None
    ) -> dict:
        symbol = symbol.strip().upper()
        ratios = ratios or {}
        profile = profile or {}

        fundamentals = self._map_to_fundamentals(ratios=ratios, profile=profile)
        fundamentals.update(
            {
                "symbol": symbol,
                "companyName": profile.get("companyName"),
                "sector": profile.get("sector"),
                "industry": profile.get("industry"),
                "rawFmp": {"ratios": ratios or None, "profile": profile or None},
            }
        )

        available_fields = sum(
            1
            for key in (
                "peRatio",
                "pbRatio",
                "psRatio",
                "debtToEquity",
                "grossMargin",
                "operatingMargin",
                "netMargin",
                "marketCap",
                "dividendYield",
                "payoutRatio",
            )
            if fundamentals.get(key) is not None
        )
        fundamentals["availableFields"] = available_fields
        return fundamentals

    def fetch_fundamentals(self, symbol: str) -> dict:
        symbol = symbol.strip().upper()
        ratios = self.fetch_ratios(symbol)
        profile = self.fetch_profile(symbol)
        return self.build_fundamentals(symbol=symbol, ratios=ratios, profile=profile)

    def close(self) -> None:
        self.session.close()
