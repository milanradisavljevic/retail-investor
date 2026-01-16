"""Scoring configuration and feature registry."""

from dataclasses import dataclass
from typing import Literal

WeightProfile = Literal["pure_value", "conservative", "balanced"]

WEIGHT_PROFILES: dict[str, dict[str, float]] = {
    "pure_value": {"value": 0.50, "quality": 0.30, "risk": 0.20, "momentum": 0.00},
    "conservative": {"value": 0.40, "quality": 0.30, "risk": 0.20, "momentum": 0.10},
    "balanced": {"value": 0.35, "quality": 0.30, "risk": 0.20, "momentum": 0.15},
}

# Quality Gate Red Flags
RED_FLAG_THRESHOLDS = {
    "min_roa": 0.0,  # ROA must be > 0
    "min_fcf": 0.0,  # FCF must be > 0
    "max_debt_equity": 3.0,  # Debt/Equity must be < 3.0
}

# Missing Data Policy
MAX_MISSING_RATIO = 0.30  # Exclude symbol if >30% metrics missing

# Finnhub Field Mapping
FINNHUB_FIELDS = {
    "beta": "metric.beta",
    "roic": "metric.roic",
    "gross_margin": "metric.grossMargin",
    "ev_ebitda": "metric.enterpriseValueOverEBITDA",
    "fcf": "metric.freeCashFlow",
    "pb_ratio": "metric.priceBookMrq",
    "market_cap": "metric.marketCapitalization",
    "total_debt": "metric.totalDebt",
    "total_equity": "metric.totalEquity",
    "roa": "metric.roa",
}

# Value Score Weights
VALUE_SCORE_WEIGHTS = {
    "ev_ebitda": 0.50,
    "fcf_yield": 0.30,
    "pb_ratio": 0.20,
}

# Quality Score Weights
QUALITY_SCORE_WEIGHTS = {
    "roic": 0.50,
    "gross_margin": 0.50,
}

# Momentum Score Weights
MOMENTUM_SCORE_WEIGHTS = {
    "price_vs_sma200": 0.60,
    "return_12m_1m": 0.40,
}
