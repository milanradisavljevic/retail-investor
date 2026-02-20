#!/usr/bin/env python3
"""
SEC EDGAR Proof of Concept — Phase 3e Block A
==============================================

Extracts fundamental data from SEC EDGAR XBRL CompanyFacts API,
calculates derived metrics, validates against yfinance, and writes
to fundamentals_snapshot in privatinvestor.db.

Two parsing approaches are tested:
  1. Manual JSON parsing (companyfacts endpoint)
  2. edgartools library (if installed)

Usage:
  python scripts/etl/sec_edgar_poc.py [--db-path data/privatinvestor.db] [--dry-run] [--method manual|edgartools|both]

Requirements:
  pip install requests yfinance pandas
  pip install edgartools  # optional, for method=edgartools or method=both

SEC EDGAR API:
  - Rate limit: 10 requests/sec (with User-Agent header)
  - No API key required
  - companyfacts: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
  - company_tickers: https://www.sec.gov/files/company_tickers.json

Author: INTRINSIC / Phase 3e Block A
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sqlite3
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, date
from pathlib import Path
from typing import Any, Optional

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# SEC requires a valid User-Agent with contact info
SEC_USER_AGENT = os.environ.get(
    "SEC_USER_AGENT",
    "INTRINSIC-Research research@example.com",  # <-- CHANGE before production
)

SEC_BASE_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SEC_REQUEST_DELAY = 0.12  # ~8 req/sec to stay within 10/sec limit
VALIDATION_DEVIATION_THRESHOLD_PCT = 15.0

# 10 PoC tickers: 5 Large Cap + 5 Small Cap (sector-diverse)
POC_TICKERS = {
    # Large Cap (S&P 500)
    "AAPL": "Apple — Technology",
    "MSFT": "Microsoft — Technology",
    "JNJ": "Johnson & Johnson — Healthcare",
    "JPM": "JPMorgan Chase — Financials",
    "XOM": "ExxonMobil — Energy",
    # Small Cap (Russell 2000, sector-diverse)
    "CPRX": "Catalyst Pharma — Healthcare",
    "CALX": "Calix Inc — Technology",
    "AAON": "AAON Inc — Industrials",
    "BOOT": "Boot Barn — Consumer Discretionary",
    "PAYO": "Payoneer — Fintech",
}

# XBRL US-GAAP concept names for each required field
# Multiple aliases per field to handle taxonomy variations
XBRL_CONCEPTS: dict[str, list[str]] = {
    "NetIncome": [
        "us-gaap:NetIncomeLoss",
        "us-gaap:ProfitLoss",
        "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic",
    ],
    "TotalAssets": [
        "us-gaap:Assets",
    ],
    "StockholdersEquity": [
        "us-gaap:StockholdersEquity",
        "us-gaap:StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
    ],
    "TotalDebt": [
        "us-gaap:LongTermDebt",
        "us-gaap:LongTermDebtNoncurrent",
        "us-gaap:LongTermDebtAndCapitalLeaseObligations",
        "us-gaap:DebtCurrent",
        "us-gaap:LongTermDebtCurrent",
    ],
    "Revenue": [
        "us-gaap:Revenues",
        "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "us-gaap:SalesRevenueNet",
        "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
    ],
    "GrossProfit": [
        "us-gaap:GrossProfit",
    ],
    "OperatingCashFlow": [
        "us-gaap:NetCashProvidedByOperatingActivities",
        "us-gaap:NetCashProvidedByUsedInOperatingActivities",
        "us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations",
    ],
    "CapEx": [
        "us-gaap:PaymentsToAcquirePropertyPlantAndEquipment",
        "us-gaap:PaymentsToAcquireProductiveAssets",
    ],
    "CurrentAssets": [
        "us-gaap:AssetsCurrent",
    ],
    "CurrentLiabilities": [
        "us-gaap:LiabilitiesCurrent",
    ],
    "SharesOutstanding": [
        "dei:EntityCommonStockSharesOutstanding",
        "us-gaap:CommonStockSharesOutstanding",
        "us-gaap:WeightedAverageNumberOfSharesOutstandingBasicAndDiluted",
        "us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding",
    ],
}

log = logging.getLogger("sec_edgar_poc")


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class RawAccountingData:
    """Raw accounting values extracted from SEC EDGAR."""

    symbol: str
    cik: str
    net_income: Optional[float] = None
    total_assets: Optional[float] = None
    stockholders_equity: Optional[float] = None
    total_debt: Optional[float] = None
    revenue: Optional[float] = None
    gross_profit: Optional[float] = None
    operating_cash_flow: Optional[float] = None
    capex: Optional[float] = None
    current_assets: Optional[float] = None
    current_liabilities: Optional[float] = None
    shares_outstanding: Optional[float] = None
    # Prior Year fields for Piotroski YoY comparisons
    net_income_py: Optional[float] = None
    total_assets_py: Optional[float] = None
    stockholders_equity_py: Optional[float] = None
    total_debt_py: Optional[float] = None
    revenue_py: Optional[float] = None
    gross_profit_py: Optional[float] = None
    operating_cash_flow_py: Optional[float] = None
    current_assets_py: Optional[float] = None
    current_liabilities_py: Optional[float] = None
    shares_outstanding_py: Optional[float] = None
    # Metadata
    fiscal_year: Optional[str] = None
    fiscal_year_py: Optional[str] = None
    filing_date: Optional[str] = None
    method: str = "manual"  # "manual" or "edgartools"
    extraction_notes: list[str] = field(default_factory=list)


@dataclass
class DerivedMetrics:
    """Calculated metrics from raw accounting data."""

    roe: Optional[float] = None  # Net Income / Equity * 100
    roa: Optional[float] = None  # Net Income / Total Assets * 100
    debt_to_equity: Optional[float] = None  # Total Debt / Equity
    gross_margin: Optional[float] = None  # Gross Profit / Revenue * 100
    fcf: Optional[float] = None  # Operating CF - CapEx
    fcf_yield: Optional[float] = None  # FCF / Market Cap * 100 (needs price)
    current_ratio: Optional[float] = None  # Current Assets / Current Liabilities
    ebitda: Optional[float] = None  # Placeholder for Block C


@dataclass
class ValidationResult:
    """Comparison between SEC EDGAR and yfinance values."""

    symbol: str
    metric: str
    sec_value: Optional[float]
    yf_value: Optional[float]
    deviation_pct: Optional[float]
    passed: bool  # <VALIDATION_DEVIATION_THRESHOLD_PCT deviation
    note: str = ""


# ---------------------------------------------------------------------------
# SEC EDGAR API Client
# ---------------------------------------------------------------------------


class SECEdgarClient:
    """Minimal SEC EDGAR XBRL API client."""

    def __init__(self, user_agent: str = SEC_USER_AGENT):
        self.session = requests.Session()
        self.session.headers.update(
            {
                "User-Agent": user_agent,
                "Accept-Encoding": "gzip, deflate",
            }
        )
        self._ticker_to_cik: dict[str, str] = {}
        self._mapping_load_attempted = False
        self._last_request_time = 0.0

    def _rate_limit(self) -> None:
        elapsed = time.time() - self._last_request_time
        if elapsed < SEC_REQUEST_DELAY:
            time.sleep(SEC_REQUEST_DELAY - elapsed)
        self._last_request_time = time.time()

    def load_cik_mapping(self) -> dict[str, str]:
        """Load ticker-to-CIK mapping from SEC."""
        if self._ticker_to_cik:
            return self._ticker_to_cik
        if self._mapping_load_attempted:
            return self._ticker_to_cik

        log.info("Loading CIK mapping from SEC...")
        self._mapping_load_attempted = True
        self._rate_limit()
        try:
            resp = self.session.get(SEC_TICKERS_URL, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            log.error(f"Failed to load CIK mapping: {e}")
            return self._ticker_to_cik

        # Format: {"0": {"cik_str": 320193, "ticker": "AAPL", "title": "Apple Inc"}, ...}
        for entry in data.values():
            ticker = entry["ticker"].upper()
            cik = str(entry["cik_str"]).zfill(
                10
            )  # CIK must be zero-padded to 10 digits
            self._ticker_to_cik[ticker] = cik

        log.info(f"Loaded {len(self._ticker_to_cik)} ticker-CIK mappings")
        return self._ticker_to_cik

    def get_cik(self, ticker: str) -> Optional[str]:
        """Get CIK for a ticker symbol."""
        if not self._ticker_to_cik:
            self.load_cik_mapping()
        return self._ticker_to_cik.get(ticker.upper())

    def fetch_company_facts(self, cik: str) -> dict[str, Any]:
        """Fetch all XBRL facts for a company."""
        url = SEC_BASE_URL.format(cik=cik)
        log.debug(f"Fetching {url}")
        self._rate_limit()
        resp = self.session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# XBRL Parsing — Manual JSON Approach
# ---------------------------------------------------------------------------


def _find_facts(
    company_facts: dict[str, Any],
    concept_aliases: list[str],
) -> list[dict[str, Any]]:
    """
    Find all filings for a given XBRL concept.
    Returns list of fact entries sorted by filing date (newest first).
    """
    facts_section = company_facts.get("facts", {})
    results = []

    for concept_key in concept_aliases:
        # concept_key format: "us-gaap:NetIncomeLoss" or "dei:EntityCommon..."
        taxonomy, concept_name = concept_key.split(":", 1)
        taxonomy_facts = facts_section.get(taxonomy, {})
        concept_data = taxonomy_facts.get(concept_name, {})

        # Units can be "USD", "shares", "pure" etc.
        for unit_key, unit_facts in concept_data.get("units", {}).items():
            for fact in unit_facts:
                # We want 10-K (annual) and 10-Q (quarterly) filings
                form = fact.get("form", "")
                if form not in ("10-K", "10-Q", "10-K/A", "10-Q/A"):
                    continue
                results.append(
                    {
                        **fact,
                        "_concept": concept_key,
                        "_unit": unit_key,
                    }
                )

        if results:
            break  # Use first alias that has data

    # Sort by end date descending (most recent first)
    results.sort(key=lambda x: x.get("end", ""), reverse=True)
    return results


def _get_annual_value(
    facts: list[dict[str, Any]], allow_ttm: bool = True
) -> tuple[Optional[float], str]:
    """
    Extract the most recent annual (or TTM) value from XBRL facts.

    Strategy:
    1. Try most recent 10-K filing with full-year duration
    2. If allow_ttm: sum last 4 quarterly (10-Q) filings for TTM
    3. Fallback: most recent 10-K regardless of duration

    Returns: (value, method_used)
    """
    # Strategy 1: Most recent 10-K with FY period
    annual_facts = [f for f in facts if f.get("form") in ("10-K", "10-K/A")]
    if annual_facts:
        for fact in annual_facts:
            fp = fact.get("fp", "")
            start = fact.get("start", "")
            end = fact.get("end", "")

            if fp == "FY" or _is_full_year(start, end):
                return fact["val"], f"10-K FY ending {end}"

    # Strategy 2: TTM from quarterly filings
    if allow_ttm:
        quarterly_facts = [
            f
            for f in facts
            if f.get("form") in ("10-Q", "10-Q/A")
            and f.get("start")  # Must have start date (duration concept)
            and _is_single_quarter(f.get("start", ""), f.get("end", ""))
        ]

        if len(quarterly_facts) >= 4:
            recent_4 = quarterly_facts[:4]
            ttm_val = sum(f["val"] for f in recent_4)
            periods = [f"{f.get('start', '?')}..{f.get('end', '?')}" for f in recent_4]
            return ttm_val, f"TTM (4Q sum: {', '.join(periods[:2])}...)"

    # Strategy 3: Fallback — use most recent annual even if not clearly FY
    if annual_facts:
        fact = annual_facts[0]
        return fact["val"], f"10-K (best available, ending {fact.get('end', '?')})"

    return None, "not found"


def _get_instant_value(facts: list[dict[str, Any]]) -> tuple[Optional[float], str]:
    """
    Extract the most recent point-in-time (balance sheet) value.
    These are instant values (no start date), typically from 10-K or 10-Q.
    """
    candidates = [f for f in facts if not f.get("start")]
    if candidates:
        fact = candidates[0]
        return fact["val"], f"{fact.get('form')} as of {fact.get('end', '?')}"

    # Some facts are reported as duration even on balance sheet
    if facts:
        fact = facts[0]
        return fact[
            "val"
        ], f"best available ({fact.get('form', '?')} {fact.get('end', '?')})"

    return None, "not found"


def _is_full_year(start: str, end: str) -> bool:
    """Check if date range spans approximately one year."""
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        return 350 <= (e - s).days <= 380
    except (ValueError, TypeError):
        return False


def _is_single_quarter(start: str, end: str) -> bool:
    """Check if date range spans approximately one quarter."""
    try:
        s = date.fromisoformat(start)
        e = date.fromisoformat(end)
        return 80 <= (e - s).days <= 100
    except (ValueError, TypeError):
        return False


def _get_annual_value_with_prior(
    facts: list[dict[str, Any]], allow_ttm: bool = True
) -> tuple[Optional[float], str, Optional[float], str]:
    """
    Extract current and prior year annual values from XBRL facts.

    Returns: (current_value, current_method, prior_value, prior_method)
    """
    # Get all 10-K FY facts sorted by end date descending
    annual_fy_facts = []
    for f in facts:
        if f.get("form") in ("10-K", "10-K/A"):
            fp = f.get("fp", "")
            start = f.get("start", "")
            end = f.get("end", "")
            if fp == "FY" or _is_full_year(start, end):
                annual_fy_facts.append(f)

    # Sort by end date descending
    annual_fy_facts.sort(key=lambda x: x.get("end", ""), reverse=True)

    current_val, current_method = None, "not found"
    prior_val, prior_method = None, "not found"

    # Current year: most recent 10-K FY
    if annual_fy_facts:
        current_val = annual_fy_facts[0]["val"]
        current_method = f"10-K FY ending {annual_fy_facts[0]['end']}"

    # Prior year: second most recent 10-K FY
    if len(annual_fy_facts) >= 2:
        prior_val = annual_fy_facts[1]["val"]
        prior_method = f"10-K FY ending {annual_fy_facts[1]['end']}"

    # TTM fallback for current only (not for prior)
    if current_val is None and allow_ttm:
        quarterly_facts = [
            f
            for f in facts
            if f.get("form") in ("10-Q", "10-Q/A")
            and f.get("start")
            and _is_single_quarter(f.get("start", ""), f.get("end", ""))
        ]

        if len(quarterly_facts) >= 4:
            recent_4 = quarterly_facts[:4]
            current_val = sum(f["val"] for f in recent_4)
            periods = [f"{f.get('start', '?')}..{f.get('end', '?')}" for f in recent_4]
            current_method = f"TTM (4Q sum: {', '.join(periods[:2])}...)"

    return current_val, current_method, prior_val, prior_method


def _get_instant_value_with_prior(
    facts: list[dict[str, Any]],
) -> tuple[Optional[float], str, Optional[float], str]:
    """
    Extract current and prior year instant (balance sheet) values.

    Returns: (current_value, current_method, prior_value, prior_method)
    """
    # Get all instant facts (no start date) from 10-K preferred
    instant_10k = []
    instant_other = []

    for f in facts:
        if not f.get("start"):
            form = f.get("form", "")
            if form in ("10-K", "10-K/A"):
                instant_10k.append(f)
            else:
                instant_other.append(f)

    # Sort by end date descending
    instant_10k.sort(key=lambda x: x.get("end", ""), reverse=True)
    instant_other.sort(key=lambda x: x.get("end", ""), reverse=True)

    current_val, current_method = None, "not found"
    prior_val, prior_method = None, "not found"

    # Prefer 10-K for both current and prior
    if instant_10k:
        current_val = instant_10k[0]["val"]
        current_method = f"10-K as of {instant_10k[0]['end']}"

        if len(instant_10k) >= 2:
            prior_val = instant_10k[1]["val"]
            prior_method = f"10-K as of {instant_10k[1]['end']}"

    # Fallback to other forms for current only
    if current_val is None and instant_other:
        current_val = instant_other[0]["val"]
        current_method = (
            f"{instant_other[0].get('form')} as of {instant_other[0]['end']}"
        )

    return current_val, current_method, prior_val, prior_method


def extract_manual(client: SECEdgarClient, ticker: str, cik: str) -> RawAccountingData:
    """
    Extract accounting data using manual JSON parsing of companyfacts endpoint.
    """
    raw = RawAccountingData(symbol=ticker, cik=cik, method="manual")
    notes = raw.extraction_notes

    try:
        company_facts = client.fetch_company_facts(cik)
    except requests.RequestException as e:
        notes.append(f"SEC request error: {e}")
        return raw

    entity_name = company_facts.get("entityName", "?")
    notes.append(f"Entity: {entity_name}")

    # --- Income Statement / Cash Flow fields (duration -> annual or TTM) ---
    duration_fields = {
        "net_income": "NetIncome",
        "revenue": "Revenue",
        "gross_profit": "GrossProfit",
        "operating_cash_flow": "OperatingCashFlow",
        "capex": "CapEx",
    }

    for attr_name, concept_key in duration_fields.items():
        aliases = XBRL_CONCEPTS[concept_key]
        facts = _find_facts(company_facts, aliases)
        value, method = _get_annual_value(facts, allow_ttm=True)
        setattr(raw, attr_name, value)
        notes.append(
            f"{concept_key}: {method}"
            + (f" = {value:,.0f}" if value is not None else "")
        )

        if value is not None and raw.fiscal_year is None:
            for f in facts:
                if f.get("end"):
                    raw.fiscal_year = f["end"]
                    break

    # --- Balance Sheet fields (instant -> most recent) ---
    instant_fields = {
        "total_assets": "TotalAssets",
        "stockholders_equity": "StockholdersEquity",
        "total_debt": "TotalDebt",
        "current_assets": "CurrentAssets",
        "current_liabilities": "CurrentLiabilities",
        "shares_outstanding": "SharesOutstanding",
    }

    for attr_name, concept_key in instant_fields.items():
        aliases = XBRL_CONCEPTS[concept_key]
        facts = _find_facts(company_facts, aliases)
        value, method = _get_instant_value(facts)
        setattr(raw, attr_name, value)
        notes.append(
            f"{concept_key}: {method}"
            + (f" = {value:,.0f}" if value is not None else "")
        )

    return raw


# ---------------------------------------------------------------------------
# edgartools Parsing Approach (optional)
# ---------------------------------------------------------------------------


def extract_edgartools(ticker: str) -> Optional[RawAccountingData]:
    """
    Extract accounting data using the edgartools library.
    Returns None if edgartools is not installed.
    """
    try:
        from edgar import Company
    except ImportError:
        log.info("edgartools not installed — skipping edgartools method")
        return None

    raw = RawAccountingData(symbol=ticker, cik="", method="edgartools")
    notes = raw.extraction_notes

    try:
        company = Company(ticker)
        raw.cik = str(company.cik).zfill(10)
        notes.append(f"Entity: {company.name}")

        filings = company.get_filings(form="10-K")
        if not filings or len(filings) == 0:
            notes.append("No 10-K filings found")
            return raw

        latest_10k = filings[0]
        notes.append(f"Latest 10-K: {latest_10k.filing_date}")
        raw.filing_date = str(latest_10k.filing_date)

        xbrl = latest_10k.xbrl()
        if xbrl is None:
            notes.append("No XBRL data in filing")
            return raw

        financials = xbrl.financials if hasattr(xbrl, "financials") else None
        if financials:
            notes.append(
                "edgartools financials extraction: implementation depends on library version"
            )

    except Exception as e:
        notes.append(f"edgartools error: {e}")

    return raw


# ---------------------------------------------------------------------------
# Metric Calculations
# ---------------------------------------------------------------------------


def calculate_derived_metrics(
    raw: RawAccountingData,
    market_cap: Optional[float] = None,
) -> DerivedMetrics:
    """Calculate derived financial metrics from raw accounting data."""
    m = DerivedMetrics()

    # ROE = Net Income / Stockholders' Equity * 100
    if (
        raw.net_income is not None
        and raw.stockholders_equity
        and raw.stockholders_equity != 0
    ):
        m.roe = (raw.net_income / raw.stockholders_equity) * 100

    # ROA = Net Income / Total Assets * 100
    if raw.net_income is not None and raw.total_assets and raw.total_assets != 0:
        m.roa = (raw.net_income / raw.total_assets) * 100

    # Debt/Equity = Total Debt / Stockholders' Equity
    if (
        raw.total_debt is not None
        and raw.stockholders_equity
        and raw.stockholders_equity != 0
    ):
        m.debt_to_equity = raw.total_debt / raw.stockholders_equity

    # Gross Margin = Gross Profit / Revenue * 100
    if raw.gross_profit is not None and raw.revenue and raw.revenue != 0:
        m.gross_margin = (raw.gross_profit / raw.revenue) * 100

    # FCF = Operating Cash Flow - abs(CapEx), so sign conventions stay consistent.
    if raw.operating_cash_flow is not None and raw.capex is not None:
        m.fcf = raw.operating_cash_flow - abs(raw.capex)

    # FCF Yield = FCF / Market Cap * 100
    if m.fcf is not None and market_cap and market_cap > 0:
        m.fcf_yield = (m.fcf / market_cap) * 100

    # Current Ratio = Current Assets / Current Liabilities
    if (
        raw.current_assets is not None
        and raw.current_liabilities
        and raw.current_liabilities != 0
    ):
        m.current_ratio = raw.current_assets / raw.current_liabilities

    return m


# ---------------------------------------------------------------------------
# yfinance Validation
# ---------------------------------------------------------------------------


def validate_against_yfinance(
    ticker: str,
    raw: RawAccountingData,
    derived: DerivedMetrics,
) -> list[ValidationResult]:
    """Compare SEC EDGAR extracted values against yfinance."""
    try:
        import yfinance as yf
    except ImportError as e:
        return [
            ValidationResult(
                symbol=ticker,
                metric="Validation",
                sec_value=None,
                yf_value=None,
                deviation_pct=None,
                passed=False,
                note=f"yfinance unavailable: {e}",
            )
        ]

    results: list[ValidationResult] = []
    stock = yf.Ticker(ticker)

    try:
        info = stock.info or {}
    except Exception:
        info = {}

    def _compare(
        metric_name: str, sec_val: Optional[float], yf_val: Optional[float]
    ) -> ValidationResult:
        if sec_val is None or yf_val is None or yf_val == 0:
            return ValidationResult(
                symbol=ticker,
                metric=metric_name,
                sec_value=sec_val,
                yf_value=yf_val,
                deviation_pct=None,
                passed=False,
                note="One or both values missing",
            )
        dev = abs(sec_val - yf_val) / abs(yf_val) * 100
        return ValidationResult(
            symbol=ticker,
            metric=metric_name,
            sec_value=sec_val,
            yf_value=yf_val,
            deviation_pct=round(dev, 2),
            passed=dev < VALIDATION_DEVIATION_THRESHOLD_PCT,
            note=(
                "OK"
                if dev < VALIDATION_DEVIATION_THRESHOLD_PCT
                else f"Deviation {dev:.1f}% > {VALIDATION_DEVIATION_THRESHOLD_PCT:.0f}%"
            ),
        )

    # ROE comparison
    yf_roe = info.get("returnOnEquity")
    if yf_roe is not None:
        yf_roe *= 100  # yfinance returns decimal
    results.append(_compare("ROE", derived.roe, yf_roe))

    # Debt/Equity
    yf_de = info.get("debtToEquity")
    if yf_de is not None:
        yf_de /= 100  # yfinance returns as percentage
    results.append(_compare("D/E", derived.debt_to_equity, yf_de))

    # Total Revenue
    yf_revenue = info.get("totalRevenue")
    results.append(_compare("Revenue", raw.revenue, yf_revenue))

    # Net Income (closer definition match than ratio-based metrics)
    yf_net_income = info.get("netIncomeToCommon")
    results.append(_compare("NetIncome", raw.net_income, yf_net_income))

    # Gross Margin
    yf_gm = info.get("grossMargins")
    if yf_gm is not None:
        yf_gm *= 100
    results.append(_compare("GrossMargin", derived.gross_margin, yf_gm))

    # Total Assets (from balance sheet)
    try:
        bs = stock.balance_sheet
        if bs is not None and not bs.empty:
            yf_assets = (
                bs.loc["Total Assets"].iloc[0] if "Total Assets" in bs.index else None
            )
            results.append(_compare("TotalAssets", raw.total_assets, yf_assets))
    except Exception:
        results.append(
            ValidationResult(
                symbol=ticker,
                metric="TotalAssets",
                sec_value=raw.total_assets,
                yf_value=None,
                deviation_pct=None,
                passed=False,
                note="yfinance balance_sheet unavailable",
            )
        )

    # Current Ratio
    yf_cr = info.get("currentRatio")
    results.append(_compare("CurrentRatio", derived.current_ratio, yf_cr))

    return results


# ---------------------------------------------------------------------------
# Database Storage
# ---------------------------------------------------------------------------


def build_fundamentals_payload(
    raw: RawAccountingData,
    derived: DerivedMetrics,
    market_cap: Optional[float] = None,
    current_price: Optional[float] = None,
) -> dict[str, Any]:
    """
    Build data_json payload compatible with existing fundamentals_snapshot format.

    Must contain the fields that fundamental.ts and score_symbol.ts read:
    - peRatio, pbRatio, psRatio (need price data — filled from yfinance if available)
    - roe, debtToEquity (from SEC EDGAR)
    - _source: "sec_edgar"

    New fields for Block C expansion:
    - roa, grossMargin, fcf, fcfYield, currentRatio
    - raw SEC accounting data for Piotroski calculation
    """
    payload: dict[str, Any] = {
        "_source": "sec_edgar",
        "_method": raw.method,
        "_extracted_at": datetime.utcnow().isoformat(),
        "_fiscal_year_end": raw.fiscal_year,
        "_extraction_notes": raw.extraction_notes[:10],
        # Fields consumed by current scoring engine
        "roe": derived.roe,
        "debtToEquity": derived.debt_to_equity,
        "marketCap": market_cap,
        # New fields for Phase 3e Block C
        "roa": derived.roa,
        "grossMargin": derived.gross_margin,
        "fcf": derived.fcf,
        "fcfYield": derived.fcf_yield,
        "currentRatio": derived.current_ratio,
        # Raw accounting data (needed for Piotroski in Block C)
        "secEdgar": {
            "netIncome": raw.net_income,
            "totalAssets": raw.total_assets,
            "stockholdersEquity": raw.stockholders_equity,
            "totalDebt": raw.total_debt,
            "revenue": raw.revenue,
            "grossProfit": raw.gross_profit,
            "operatingCashFlow": raw.operating_cash_flow,
            "capex": raw.capex,
            "currentAssets": raw.current_assets,
            "currentLiabilities": raw.current_liabilities,
            "sharesOutstanding": raw.shares_outstanding,
        },
    }

    # Add price-based ratios if we have price data
    if current_price and raw.net_income and raw.shares_outstanding:
        eps = raw.net_income / raw.shares_outstanding
        if eps > 0:
            payload["peRatio"] = current_price / eps

    if current_price and raw.stockholders_equity and raw.shares_outstanding:
        bvps = raw.stockholders_equity / raw.shares_outstanding
        if bvps > 0:
            payload["pbRatio"] = current_price / bvps

    if current_price and raw.revenue and raw.shares_outstanding:
        rps = raw.revenue / raw.shares_outstanding
        if rps > 0:
            payload["psRatio"] = current_price / rps

    return payload


def store_to_db(
    db_path: Path,
    symbol: str,
    payload: dict[str, Any],
    dry_run: bool = False,
) -> None:
    """Write fundamentals_snapshot to SQLite."""
    if dry_run:
        log.info(f"[DRY RUN] Would store {symbol} with {len(payload)} fields")
        return

    conn = sqlite3.connect(str(db_path))
    try:
        expected_columns = {"symbol", "fetched_at", "data_json"}
        target_table = "fundamentals_snapshot"

        table_exists = (
            conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (target_table,),
            ).fetchone()
            is not None
        )

        if table_exists:
            current_cols = {
                row[1]
                for row in conn.execute(f"PRAGMA table_info({target_table})").fetchall()
            }
            if current_cols != expected_columns:
                target_table = "fundamentals_snapshot_sec_poc"
                log.warning(
                    "Schema mismatch on fundamentals_snapshot (%s). Writing PoC data into %s.",
                    sorted(current_cols),
                    target_table,
                )

        conn.execute(f"""
            CREATE TABLE IF NOT EXISTS {target_table} (
                symbol TEXT NOT NULL,
                fetched_at INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (symbol, fetched_at)
            )
        """)
        fetched_at = int(time.time())
        conn.execute(
            f"INSERT OR REPLACE INTO {target_table} (symbol, fetched_at, data_json) VALUES (?, ?, ?)",
            (symbol, fetched_at, json.dumps(payload, sort_keys=True, default=str)),
        )
        conn.commit()
        log.info(f"Stored {symbol} in {target_table} (fetched_at={fetched_at})")
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def print_extraction_report(
    results: dict[str, tuple[RawAccountingData, DerivedMetrics]],
) -> None:
    """Print summary table of extracted data."""
    print("\n" + "=" * 90)
    print("SEC EDGAR EXTRACTION REPORT — Phase 3e Block A")
    print("=" * 90)

    print(
        f"{'Symbol':<8} {'NetInc':>12} {'Assets':>14} {'Equity':>14} {'Revenue':>14} {'OpCF':>12} {'Fields':>6}"
    )
    print("-" * 90)

    for symbol, (raw, _) in results.items():
        fields_present = sum(
            1
            for f in [
                raw.net_income,
                raw.total_assets,
                raw.stockholders_equity,
                raw.total_debt,
                raw.revenue,
                raw.gross_profit,
                raw.operating_cash_flow,
                raw.capex,
                raw.current_assets,
                raw.current_liabilities,
                raw.shares_outstanding,
            ]
            if f is not None
        )

        def fmt(v: Optional[float]) -> str:
            if v is None:
                return "—"
            if abs(v) >= 1e9:
                return f"{v / 1e9:.1f}B"
            if abs(v) >= 1e6:
                return f"{v / 1e6:.0f}M"
            return f"{v:,.0f}"

        print(
            f"{symbol:<8} {fmt(raw.net_income):>12} {fmt(raw.total_assets):>14} "
            f"{fmt(raw.stockholders_equity):>14} {fmt(raw.revenue):>14} "
            f"{fmt(raw.operating_cash_flow):>12} {fields_present:>4}/11"
        )

    print()
    print("DERIVED METRICS:")
    print(
        f"{'Symbol':<8} {'ROE%':>8} {'ROA%':>8} {'D/E':>8} {'GM%':>8} {'FCF':>12} {'CR':>8}"
    )
    print("-" * 70)

    for symbol, (_, derived) in results.items():

        def fmtp(v: Optional[float], suffix: str = "") -> str:
            return f"{v:.1f}{suffix}" if v is not None else "—"

        def fmtv(v: Optional[float]) -> str:
            if v is None:
                return "—"
            if abs(v) >= 1e9:
                return f"{v / 1e9:.1f}B"
            if abs(v) >= 1e6:
                return f"{v / 1e6:.0f}M"
            return f"{v:,.0f}"

        print(
            f"{symbol:<8} {fmtp(derived.roe):>8} {fmtp(derived.roa):>8} "
            f"{fmtp(derived.debt_to_equity):>8} {fmtp(derived.gross_margin):>8} "
            f"{fmtv(derived.fcf):>12} {fmtp(derived.current_ratio):>8}"
        )


def print_validation_report(all_validations: dict[str, list[ValidationResult]]) -> None:
    """Print yfinance validation comparison."""
    print("\n" + "=" * 90)
    print("YFINANCE VALIDATION REPORT")
    print("=" * 90)

    total_checks = 0
    total_passed = 0
    total_comparable = 0

    for symbol, validations in all_validations.items():
        print(f"\n{symbol}:")
        for v in validations:
            total_checks += 1
            status = "PASS" if v.passed else "FAIL"

            if v.deviation_pct is not None:
                total_comparable += 1
                if v.passed:
                    total_passed += 1
                print(
                    f"  {status:4} {v.metric:<14} SEC={_fmt_val(v.sec_value):>14}  "
                    f"YF={_fmt_val(v.yf_value):>14}  Dev={v.deviation_pct:>6.1f}%  {v.note}"
                )
            else:
                print(f"  ---  {v.metric:<14} {v.note}")

    print(
        f"\nSUMMARY: {total_passed}/{total_comparable} comparable metrics passed "
        f"(<{VALIDATION_DEVIATION_THRESHOLD_PCT:.0f}% deviation)"
    )
    if total_comparable > 0:
        pass_rate = total_passed / total_comparable * 100
        print(f"Pass rate: {pass_rate:.0f}%")
        if pass_rate >= 70:
            print("VERDICT: ACCEPTABLE — proceed with Block B")
        else:
            print("VERDICT: NEEDS INVESTIGATION — check extraction logic")


def _fmt_val(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    if abs(v) >= 1e9:
        return f"{v / 1e9:.2f}B"
    if abs(v) >= 1e6:
        return f"{v / 1e6:.1f}M"
    if abs(v) < 100:
        return f"{v:.2f}"
    return f"{v:,.0f}"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="SEC EDGAR PoC — Phase 3e Block A",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--db-path",
        default="data/privatinvestor.db",
        help="Path to SQLite database (default: data/privatinvestor.db)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract and validate without writing to DB",
    )
    parser.add_argument(
        "--method",
        choices=["manual", "edgartools", "both"],
        default="both",
        help="Parsing method to use (default: both)",
    )
    parser.add_argument(
        "--skip-validation",
        action="store_true",
        help="Skip yfinance validation step",
    )
    parser.add_argument(
        "--tickers",
        nargs="+",
        help="Override PoC tickers (space-separated)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    tickers = args.tickers or list(POC_TICKERS.keys())
    db_path = Path(args.db_path)
    use_manual = args.method in ("manual", "both")
    use_edgartools = args.method in ("edgartools", "both")

    print(f"SEC EDGAR PoC — {len(tickers)} tickers")
    print(f"Method: {args.method} | DB: {db_path} | Dry-run: {args.dry_run}")
    print(f"Tickers: {', '.join(tickers)}")
    print()

    # -----------------------------------------------------------------------
    # Step 1: Extract from SEC EDGAR
    # -----------------------------------------------------------------------
    client = SECEdgarClient()
    extraction_results: dict[str, tuple[RawAccountingData, DerivedMetrics]] = {}
    edgartools_results: dict[str, RawAccountingData] = {}

    for ticker in tickers:
        print(f"\n--- {ticker} ({POC_TICKERS.get(ticker, 'Custom')}) ---")

        # Manual extraction
        if use_manual:
            cik = client.get_cik(ticker)
            if not cik:
                log.warning(f"{ticker}: CIK not found — skipping")
                continue

            log.info(f"{ticker}: CIK={cik}")
            raw = extract_manual(client, ticker, cik)

            # Get market cap and price from yfinance for ratio calculations
            market_cap = None
            current_price = None
            try:
                import yfinance as yf

                stock = yf.Ticker(ticker)
                info = stock.info or {}
                market_cap = info.get("marketCap")
                current_price = info.get("currentPrice") or info.get(
                    "regularMarketPrice"
                )
            except Exception as e:
                log.warning(f"{ticker}: Could not get price from yfinance: {e}")

            derived = calculate_derived_metrics(raw, market_cap=market_cap)
            extraction_results[ticker] = (raw, derived)

            for note in raw.extraction_notes[:5]:
                log.info(f"  {note}")

        # edgartools extraction
        if use_edgartools:
            et_raw = extract_edgartools(ticker)
            if et_raw:
                edgartools_results[ticker] = et_raw

    # -----------------------------------------------------------------------
    # Step 2: Print Extraction Report
    # -----------------------------------------------------------------------
    if extraction_results:
        print_extraction_report(extraction_results)

    if edgartools_results:
        print("\nedgartools results:")
        for symbol, raw in edgartools_results.items():
            print(f"  {symbol}: {len(raw.extraction_notes)} notes, method={raw.method}")
            for note in raw.extraction_notes:
                print(f"    {note}")

    # -----------------------------------------------------------------------
    # Step 3: Validate against yfinance
    # -----------------------------------------------------------------------
    all_validations: dict[str, list[ValidationResult]] = {}

    if not args.skip_validation and extraction_results:
        print("\nValidating against yfinance...")
        for ticker, (raw, derived) in extraction_results.items():
            validations = validate_against_yfinance(ticker, raw, derived)
            all_validations[ticker] = validations

        print_validation_report(all_validations)

    # -----------------------------------------------------------------------
    # Step 4: Store to DB
    # -----------------------------------------------------------------------
    if extraction_results:
        stored = 0
        for ticker, (raw, derived) in extraction_results.items():
            market_cap = None
            current_price = None
            try:
                import yfinance as yf

                info = yf.Ticker(ticker).info or {}
                market_cap = info.get("marketCap")
                current_price = info.get("currentPrice") or info.get(
                    "regularMarketPrice"
                )
            except Exception:
                pass

            payload = build_fundamentals_payload(
                raw, derived, market_cap, current_price
            )
            store_to_db(db_path, ticker, payload, dry_run=args.dry_run)
            stored += 1

        print(
            f"\n{'[DRY RUN] Would have stored' if args.dry_run else 'Stored'} {stored} symbols"
        )

    # -----------------------------------------------------------------------
    # Step 5: Summary
    # -----------------------------------------------------------------------
    print("\n" + "=" * 90)
    print("BLOCK A SUMMARY")
    print("=" * 90)

    if extraction_results:
        total_fields = 0
        total_possible = len(extraction_results) * 11
        for _, (raw, _) in extraction_results.items():
            total_fields += sum(
                1
                for f in [
                    raw.net_income,
                    raw.total_assets,
                    raw.stockholders_equity,
                    raw.total_debt,
                    raw.revenue,
                    raw.gross_profit,
                    raw.operating_cash_flow,
                    raw.capex,
                    raw.current_assets,
                    raw.current_liabilities,
                    raw.shares_outstanding,
                ]
                if f is not None
            )

        print(
            f"Field coverage: {total_fields}/{total_possible} ({total_fields / total_possible * 100:.0f}%)"
        )

    if all_validations:
        comparable = sum(
            1
            for vl in all_validations.values()
            for v in vl
            if v.deviation_pct is not None
        )
        passed = sum(1 for vl in all_validations.values() for v in vl if v.passed)
        print(
            f"Validation: {passed}/{comparable} passed "
            f"(<{VALIDATION_DEVIATION_THRESHOLD_PCT:.0f}% deviation)"
        )

    print(
        f"Method comparison: manual={'tested' if use_manual else 'skipped'}, "
        f"edgartools={'tested' if use_edgartools else 'skipped'}"
    )
    print()
    print(
        "Next: If results are acceptable, proceed to Block B (CIK Mapping + Batch ETL)"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main())
