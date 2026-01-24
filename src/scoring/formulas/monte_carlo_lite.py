# ============================================================================
# FORMEL: Monte Carlo Lite Fair Value Distribution (Antithetic Variates)
# QUELLE: Damodaran, Investment Valuation (4th ed., 2025), Ch.33 (Simulation),
#         Hilpisch, Python for Finance (2018), Ch.11 (Variance Reduction: Antithetic Variates)
# KATEGORIE: Valuation / Risk
# FINNHUB-ENDPUNKTE:
#   - /company-basic-financials  (metric + series.annual.*)
#   - /quote                     (current price)
#   - /stock/profile2            (shareOutstanding)
# IMPLEMENTIERUNGSPRIORITÄT: 2 (Deep Analysis Enhancement)
# ============================================================================

import logging
import math
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# FINNHUB-MAPPING
FINNHUB_FIELDS = {
    # /company-basic-financials
    "beta": "metric.beta",
    "revenue_ttm": "metric.revenueTTM",
    "revenue_series_annual": "series.annual.revenue",
    "operating_margin": "metric.operatingMargin",
    "operating_income_ttm": "metric.operatingIncomeTTM",
    "shares_outstanding": "profile.shareOutstanding",
    # /quote
    "current_price": "quote.c",
}


def _get_nested(data: Dict[str, Any], path: str) -> Any:
    cur: Any = data
    for key in path.split("."):
        if not isinstance(cur, dict) or key not in cur:
            return None
        cur = cur[key]
    return cur


def _require(value: Any, symbol: str, field_name: str) -> Any:
    if value is None:
        raise ValueError(f"{symbol}: Critical field missing: {field_name}")
    return value


def _as_decimal_if_percent(x: float, symbol: str, field_name: str) -> float:
    """
    Convert percentage to decimal if value > 1.5 (heuristic).
    Finnhub sometimes returns percentages as 31.4 for 31.4%.
    """
    if not np.isfinite(x):
        raise ValueError(f"{symbol}: Invalid value for {field_name}: {x}")
    return x / 100.0 if x > 1.5 else x


def _sort_series_points(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def _key(p: Dict[str, Any]) -> str:
        return str(p.get("period", ""))
    return sorted(points, key=_key)


def _extract_latest_value(points: List[Dict[str, Any]], symbol: str, field_name: str) -> float:
    if not points:
        raise ValueError(f"{symbol}: Critical time series empty: {field_name}")
    pts = _sort_series_points(points)
    v = pts[-1].get("v")
    if v is None:
        raise ValueError(f"{symbol}: Critical time series value missing: {field_name} (latest.v)")
    try:
        return float(v)
    except Exception as exc:
        raise ValueError(f"{symbol}: Non-numeric time series value for {field_name}: {v}") from exc


def _compute_cagr(
    end_value: float, start_value: float, years: float, symbol: str, context: str
) -> float:
    if years <= 0:
        raise ValueError(f"{symbol}: CAGR years must be > 0 ({context})")
    if start_value <= 0 or end_value <= 0:
        raise ValueError(f"{symbol}: CAGR requires positive values ({context}); start={start_value}, end={end_value}")
    return (end_value / start_value) ** (1.0 / years) - 1.0


def _simulate_single_path(
    revenue_0: float,
    margin_0: float,
    discount_rate: float,
    growth_base: float,
    growth_std: float,
    margin_base: float,
    margin_std: float,
    discount_base: float,
    discount_std: float,
    z_growth: float,
    z_margin: float,
    z_discount: float,
    projection_years: int = 5,
    terminal_growth: float = 0.025,
    terminal_multiple_fcf: float = 15.0,
) -> float:
    """
    Simulate a single DCF path with stochastic inputs.

    Returns terminal value (present value of FCF + terminal).

    Stochastic variables:
    - Revenue growth ~ N(growth_base, growth_std)
    - Operating margin ~ N(margin_base, margin_std)
    - Discount rate ~ N(discount_base, discount_std)
    """
    # Sample stochastic inputs
    g_rev = growth_base + growth_std * z_growth
    margin = margin_base + margin_std * z_margin
    r = discount_rate + discount_std * z_discount

    # Clamp to reasonable bounds
    g_rev = max(-0.50, min(1.0, g_rev))  # -50% to +100%
    margin = max(0.01, min(0.95, margin))  # 1% to 95%
    r = max(0.02, min(0.30, r))  # 2% to 30%

    # Project 5-year cash flows
    pv_fcf = 0.0
    revenue = revenue_0

    for t in range(1, projection_years + 1):
        revenue = revenue * (1.0 + g_rev)
        operating_income = revenue * margin
        # Simplified FCF: EBIT * (1 - tax_rate) with 21% tax
        fcf_t = operating_income * 0.79
        pv_fcf += fcf_t / ((1.0 + r) ** t)

    # Terminal value using perpetuity growth
    fcf_terminal = revenue * margin * 0.79 * (1.0 + terminal_growth)

    # Check terminal condition
    if r <= terminal_growth:
        # Fallback to FCF multiple
        terminal_value = fcf_terminal * terminal_multiple_fcf
    else:
        terminal_value = fcf_terminal / (r - terminal_growth)

    pv_terminal = terminal_value / ((1.0 + r) ** projection_years)

    return pv_fcf + pv_terminal


def calculate_monte_carlo_fair_value(
    symbol: str,
    finnhub_client: object,
    iterations: int = 1000,
    risk_free_rate: float = 0.04,
    market_risk_premium: float = 0.055,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Calculate Monte Carlo fair value distribution using Antithetic Variates.

    METHODOLOGY:
    ------------
    - 1000 iterations (500 pairs with antithetic variates)
    - Stochastic inputs:
      * Revenue growth: base ± 30% std dev
      * Operating margin: base ± 20% std dev
      * Discount rate: base ± 2% std dev
    - 5-year projection + terminal value
    - Outputs: P10/P50/P90, probability metrics

    PARAMETERS:
    -----------
    iterations: int (default 1000, must be even for antithetic variates)
    risk_free_rate: float (default 0.04)
    market_risk_premium: float (default 0.055)

    OVERRIDES (for testing):
    -------------------------
    revenue_override: float
    margin_override: float
    beta_override: float
    shares_outstanding_override: float
    current_price_override: float
    seed: int (for deterministic tests)

    RETURNS:
    --------
    dict with:
    - 'value_p10': float (10th percentile fair value)
    - 'value_p50': float (50th percentile / median fair value)
    - 'value_p90': float (90th percentile fair value)
    - 'prob_value_gt_price': float (probability fair value > current price)
    - 'mos_15_prob': float (probability of 15%+ margin of safety)
    - 'iterations_run': int
    - 'input_assumptions': dict (stochastic input parameters)
    - 'data_quality': dict
    - 'confidence': float (0-1)

    RAISES:
    -------
    ValueError: If critical Finnhub data is missing.
    """

    if iterations < 100:
        raise ValueError(f"{symbol}: iterations must be >= 100 (got {iterations})")
    if iterations % 2 != 0:
        raise ValueError(f"{symbol}: iterations must be even for antithetic variates (got {iterations})")

    assumptions: List[str] = []
    components: Dict[str, Any] = {}

    # Set random seed for reproducibility if provided
    seed = kwargs.get("seed", None)
    rng = np.random.default_rng(seed) if seed is not None else np.random.default_rng()

    # Fetch data
    data = _fetch_finnhub_data(symbol, finnhub_client)

    # Current price
    if "current_price_override" in kwargs:
        current_price = float(kwargs["current_price_override"])
        assumptions.append("Current price via override (test mode).")
    else:
        current_price = float(_require(_get_nested(data, FINNHUB_FIELDS["current_price"]), symbol, "quote.c"))
        assumptions.append("Current price from Finnhub /quote.")

    if current_price <= 0:
        raise ValueError(f"{symbol}: Current price must be > 0 (got {current_price})")

    # Shares outstanding
    if "shares_outstanding_override" in kwargs:
        shares_outstanding = float(kwargs["shares_outstanding_override"])
        assumptions.append("Shares outstanding via override (test mode).")
    else:
        shares_outstanding = float(_require(_get_nested(data, FINNHUB_FIELDS["shares_outstanding"]), symbol, "profile.shareOutstanding"))
        assumptions.append("Shares outstanding from Finnhub /stock/profile2.")

    if shares_outstanding <= 0:
        raise ValueError(f"{symbol}: Shares outstanding must be > 0 (got {shares_outstanding})")

    # Revenue (base for projections)
    if "revenue_override" in kwargs:
        revenue_0 = float(kwargs["revenue_override"])
        assumptions.append("Revenue via override (test mode).")
    else:
        # Try TTM first, then series
        revenue_ttm = _get_nested(data, FINNHUB_FIELDS["revenue_ttm"])
        if revenue_ttm is not None:
            revenue_0 = float(revenue_ttm)
            assumptions.append("Revenue from Finnhub metric.revenueTTM.")
        else:
            revenue_series = _get_nested(data, FINNHUB_FIELDS["revenue_series_annual"])
            revenue_0 = _extract_latest_value(revenue_series, symbol, "series.annual.revenue")
            assumptions.append("Revenue from Finnhub series.annual.revenue (latest).")

    if revenue_0 <= 0:
        raise ValueError(f"{symbol}: Revenue must be > 0 (got {revenue_0})")

    # Operating margin
    if "margin_override" in kwargs:
        margin_0 = float(kwargs["margin_override"])
        assumptions.append("Operating margin via override (test mode).")
    else:
        margin_raw = _get_nested(data, FINNHUB_FIELDS["operating_margin"])
        if margin_raw is not None:
            margin_0 = _as_decimal_if_percent(float(margin_raw), symbol, "metric.operatingMargin")
            assumptions.append("Operating margin from Finnhub metric.operatingMargin.")
        else:
            # Fallback: calculate from operating income / revenue
            oi_ttm = _get_nested(data, FINNHUB_FIELDS["operating_income_ttm"])
            if oi_ttm is not None and revenue_0 > 0:
                margin_0 = float(oi_ttm) / revenue_0
                assumptions.append("Operating margin calculated from operatingIncomeTTM / revenueTTM.")
            else:
                raise ValueError(f"{symbol}: Could not determine operating margin (no metric.operatingMargin or operatingIncomeTTM)")

    if margin_0 <= 0 or margin_0 > 1:
        raise ValueError(f"{symbol}: Operating margin must be (0, 1] (got {margin_0})")

    # Historical revenue growth for base
    revenue_series = _get_nested(data, FINNHUB_FIELDS["revenue_series_annual"])
    if revenue_series is not None and isinstance(revenue_series, list) and len(revenue_series) >= 2:
        pts = _sort_series_points(revenue_series)
        years = min(3, len(pts) - 1)
        if years >= 1:
            start_rev = float(pts[-(years + 1)].get("v", 1))
            end_rev = float(pts[-1].get("v", 1))
            if start_rev > 0 and end_rev > 0:
                growth_base = _compute_cagr(end_rev, start_rev, float(years), symbol, "Revenue CAGR")
            else:
                growth_base = 0.05  # Fallback
        else:
            growth_base = 0.05
    else:
        growth_base = 0.05  # Default 5%

    # Discount rate (CAPM)
    if "beta_override" in kwargs:
        beta = float(kwargs["beta_override"])
        assumptions.append("Beta via override (test mode).")
    else:
        beta_raw = _get_nested(data, FINNHUB_FIELDS["beta"])
        beta = float(_require(beta_raw, symbol, "metric.beta"))
        assumptions.append("Beta from Finnhub metric.beta.")

    discount_rate_base = risk_free_rate + beta * market_risk_premium

    # Stochastic input parameters (per plan: ±30% revenue growth, ±20% margin, ±2% discount)
    growth_std = 0.30  # 30% std dev for revenue growth
    margin_std = margin_0 * 0.20  # 20% of base margin
    discount_std = 0.02  # 2% absolute std dev for discount rate

    components.update({
        "revenue_0": revenue_0,
        "margin_0": margin_0,
        "growth_base": growth_base,
        "discount_rate_base": discount_rate_base,
        "beta": beta,
        "current_price": current_price,
        "shares_outstanding": shares_outstanding,
    })

    # Monte Carlo simulation with Antithetic Variates
    half_iterations = iterations // 2
    equity_values = np.zeros(iterations)

    for i in range(half_iterations):
        # Generate random normals
        z_growth = rng.standard_normal()
        z_margin = rng.standard_normal()
        z_discount = rng.standard_normal()

        # Positive path
        equity_values[2 * i] = _simulate_single_path(
            revenue_0, margin_0, discount_rate_base,
            growth_base, growth_std,
            margin_0, margin_std,
            discount_rate_base, discount_std,
            z_growth, z_margin, z_discount
        )

        # Antithetic path (variance reduction)
        equity_values[2 * i + 1] = _simulate_single_path(
            revenue_0, margin_0, discount_rate_base,
            growth_base, growth_std,
            margin_0, margin_std,
            discount_rate_base, discount_std,
            -z_growth, -z_margin, -z_discount
        )

    # Convert to per-share values
    fair_values = equity_values / shares_outstanding

    # Calculate percentiles
    value_p10 = float(np.percentile(fair_values, 10))
    value_p50 = float(np.percentile(fair_values, 50))
    value_p90 = float(np.percentile(fair_values, 90))

    # Probability metrics
    prob_value_gt_price = float(np.mean(fair_values > current_price))

    # Probability of 15%+ margin of safety (fair value >= 1.15 * price)
    mos_threshold = current_price * 1.15
    mos_15_prob = float(np.mean(fair_values >= mos_threshold))

    # Input assumptions for output
    input_assumptions = {
        "revenue_growth": {
            "base": growth_base,
            "std_dev": growth_std,
            "distribution": "normal",
            "source": "historical CAGR or default 5%"
        },
        "operating_margin": {
            "base": margin_0,
            "std_dev": margin_std,
            "distribution": "normal",
            "source": "Finnhub metric.operatingMargin or calculated"
        },
        "discount_rate": {
            "base": discount_rate_base,
            "std_dev": discount_std,
            "distribution": "normal",
            "source": "CAPM (rf + beta * MRP)"
        }
    }

    # Data quality assessment
    required_fields = [
        FINNHUB_FIELDS["shares_outstanding"],
        FINNHUB_FIELDS["current_price"],
        FINNHUB_FIELDS["beta"],
    ]

    optional_fields = [
        FINNHUB_FIELDS["revenue_ttm"],
        FINNHUB_FIELDS["revenue_series_annual"],
        FINNHUB_FIELDS["operating_margin"],
    ]

    present_required = sum(1 for f in required_fields if _get_nested(data, f) is not None)
    present_optional = sum(1 for f in optional_fields if _get_nested(data, f) is not None)
    dq_required = present_required / max(1, len(required_fields))
    dq_optional = present_optional / max(1, len(optional_fields))

    # Confidence based on data quality and convergence
    # Higher confidence if we have more data and tight distribution
    confidence_base = float(round(dq_required * 0.70 + dq_optional * 0.30, 4))

    # Adjust for distribution width (tighter distribution = higher confidence)
    value_range = value_p90 - value_p10
    value_midpoint = (value_p90 + value_p10) / 2.0
    relative_range = value_range / max(value_midpoint, 1.0)

    # Penalize very wide distributions
    if relative_range > 2.0:
        confidence_adjustment = -0.15
    elif relative_range > 1.0:
        confidence_adjustment = -0.05
    else:
        confidence_adjustment = 0.0

    confidence = max(0.0, min(1.0, confidence_base + confidence_adjustment))

    data_quality = {
        "required_fields_present_ratio": float(round(dq_required, 4)),
        "optional_fields_present_ratio": float(round(dq_optional, 4)),
        "relative_distribution_width": float(round(relative_range, 4)),
    }

    assumptions.append(f"Monte Carlo simulation with {iterations} iterations using Antithetic Variates (variance reduction).")
    assumptions.append(f"5-year projection with terminal value (perpetuity growth 2.5% or 15x FCF).")

    return {
        "value_p10": value_p10,
        "value_p50": value_p50,
        "value_p90": value_p90,
        "prob_value_gt_price": prob_value_gt_price,
        "mos_15_prob": mos_15_prob,
        "iterations_run": iterations,
        "input_assumptions": input_assumptions,
        "components": components,
        "assumptions": assumptions,
        "data_quality": data_quality,
        "confidence": confidence,
    }


def _fetch_finnhub_data(symbol: str, client: object) -> Dict[str, Any]:
    """Fetch and validate required Finnhub data (no dummy fallbacks)."""
    try:
        basic = client.company_basic_financials(symbol, "all")
        quote = client.quote(symbol)

        # Profile for shares outstanding
        if hasattr(client, "company_profile2"):
            profile = client.company_profile2(symbol)
        elif hasattr(client, "company_profile"):
            profile = client.company_profile(symbol)
        else:
            raise ValueError(f"{symbol}: Finnhub client has no company_profile2/company_profile method")

        if not isinstance(basic, dict) or "metric" not in basic:
            raise ValueError(f"{symbol}: No 'metric' field in /company-basic-financials")

        if not isinstance(quote, dict):
            raise ValueError(f"{symbol}: Invalid quote response")

        if not isinstance(profile, dict):
            raise ValueError(f"{symbol}: Invalid profile response")

        return {
            "metric": basic.get("metric", {}),
            "series": basic.get("series", {}),
            "quote": quote,
            "profile": profile
        }
    except Exception as exc:
        logger.error("Finnhub fetch failed for %s: %s", symbol, exc)
        raise


def test_calculate_monte_carlo_fair_value():
    """Test Monte Carlo fair value with mock data."""

    class MockFinnhubClient:
        def company_basic_financials(self, symbol: str, metric: str):
            return {
                "metric": {
                    "beta": 1.2,
                    "revenueTTM": 100_000_000,  # $100M revenue
                    "operatingMargin": 15.0,  # 15%
                },
                "series": {
                    "annual": {
                        "revenue": [
                            {"period": "2021", "v": 85_000_000},
                            {"period": "2022", "v": 92_000_000},
                            {"period": "2023", "v": 100_000_000},
                        ]
                    }
                }
            }

        def quote(self, symbol: str):
            return {"c": 50.0}  # $50 current price

        def company_profile2(self, symbol: str):
            return {"shareOutstanding": 10.0}  # 10M shares

    client = MockFinnhubClient()

    result = calculate_monte_carlo_fair_value(
        "TEST",
        client,
        iterations=1000,
        risk_free_rate=0.04,
        market_risk_premium=0.055,
        seed=42,  # Deterministic for testing
    )

    # Basic validations
    assert result["value_p10"] > 0, f"P10 must be positive: {result['value_p10']}"
    assert result["value_p50"] > 0, f"P50 must be positive: {result['value_p50']}"
    assert result["value_p90"] > 0, f"P90 must be positive: {result['value_p90']}"
    assert result["value_p10"] < result["value_p50"] < result["value_p90"], "Percentiles must be ordered"
    assert 0 <= result["prob_value_gt_price"] <= 1, f"Probability must be [0,1]: {result['prob_value_gt_price']}"
    assert 0 <= result["mos_15_prob"] <= 1, f"MoS probability must be [0,1]: {result['mos_15_prob']}"
    assert result["iterations_run"] == 1000, f"Iterations mismatch: {result['iterations_run']}"
    assert result["confidence"] > 0.5, f"Low confidence: {result['confidence']}"
    assert len(result["assumptions"]) > 0, "Assumptions missing"

    print(f"Monte Carlo Fair Value Test PASSED:")
    print(f"  P10: ${result['value_p10']:.2f}")
    print(f"  P50: ${result['value_p50']:.2f}")
    print(f"  P90: ${result['value_p90']:.2f}")
    print(f"  Prob(Value > Price): {result['prob_value_gt_price']:.2%}")
    print(f"  Prob(15% MoS): {result['mos_15_prob']:.2%}")
    print(f"  Confidence: {result['confidence']:.4f}")


if __name__ == "__main__":
    test_calculate_monte_carlo_fair_value()
