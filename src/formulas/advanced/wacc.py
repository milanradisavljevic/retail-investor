"""Weighted Average Cost of Capital (Damodaran Illustration 2.1)."""

import logging
from typing import Any, Dict, List

try:  # Allow running as script from this folder
    from .utils import _get_nested, _require
except ImportError:  # pragma: no cover - fallback for direct execution
    from utils import _get_nested, _require

logger = logging.getLogger(__name__)

FINNHUB_FIELDS = {
    "beta": "metric.beta",
    "debt_to_equity": "metric.debtToEquity",
    # Tax Rate ist im Finnhub metric nicht garantiert; daher optional + Override/Default.
    "tax_rate_effective": "metric.effectiveTaxRate",
    "tax_rate_for_calcs": "metric.taxRateForCalcs",
}


def _estimate_credit_spread_from_de_ratio(de_ratio: float) -> float:
    """
    Deterministische Heuristik (kein Dummy-0), weil laut Projektvorgabe rd aus debtToEquity
    + risk_free_rate geschätzt werden darf. Diese Funktion ist bewusst konservativ.
    """
    if de_ratio < 0:
        raise ValueError(f"debtToEquity muss >= 0 sein (got {de_ratio})")

    if de_ratio < 0.10:
        return 0.010
    if de_ratio < 0.50:
        return 0.015
    if de_ratio < 1.00:
        return 0.020
    if de_ratio < 2.00:
        return 0.030
    if de_ratio < 3.00:
        return 0.040
    if de_ratio < 5.00:
        return 0.060
    return 0.080


def calculate_wacc(
    symbol: str,
    finnhub_client: object,
    risk_free_rate: float = 0.04,
    market_risk_premium: float = 0.055,
    default_us_corporate_tax: float = 0.21,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    BERECHNET: WACC (Kapitalgewichtete Kapitalkosten).

    FORMEL (LaTeX):
    -------------
    r_e = r_f + \\beta (r_m - r_f)
    r_d,after = r_d (1 - t_c)
    WACC = \\frac{E}{D+E} r_e + \\frac{D}{D+E} r_d(1 - t_c)

    OVERRIDES (für Buchtests / robuste Produktion):
    ----------------------------------------------
    cost_of_equity_override: float
    pre_tax_cost_of_debt_override: float
    tax_rate_override: float
    market_value_equity_override: float
    market_value_debt_override: float

    RAISES:
    -------
    ValueError bei fehlenden kritischen Finnhub-Feldern (wenn kein Override existiert).
    """

    data = _fetch_finnhub_data(symbol, finnhub_client)

    assumptions: List[str] = []
    components: Dict[str, Any] = {}

    # Cost of equity
    if "cost_of_equity_override" in kwargs:
        re_cost = float(kwargs["cost_of_equity_override"])
        assumptions.append("Cost of equity via cost_of_equity_override.")
    else:
        beta_raw = _get_nested(data, FINNHUB_FIELDS["beta"])
        beta = float(_require(beta_raw, symbol, FINNHUB_FIELDS["beta"]))
        re_cost = float(risk_free_rate + beta * market_risk_premium)
        assumptions.append("Cost of equity via CAPM (beta aus Finnhub).")
        components["beta"] = beta

    # Tax rate
    if "tax_rate_override" in kwargs:
        tax_rate = float(kwargs["tax_rate_override"])
        assumptions.append("Tax rate via tax_rate_override.")
    else:
        tax_raw = _get_nested(data, FINNHUB_FIELDS["tax_rate_for_calcs"])
        if tax_raw is None:
            tax_raw = _get_nested(data, FINNHUB_FIELDS["tax_rate_effective"])
        if tax_raw is None:
            tax_rate = float(default_us_corporate_tax)
            assumptions.append("Tax rate defaulted to 0.21 (US corporate), da Finnhub tax-Feld fehlte.")
        else:
            tax_rate = float(tax_raw)
            # Heuristik: Prozent -> Dezimal
            if tax_rate > 1.5:
                tax_rate /= 100.0
            assumptions.append("Tax rate aus Finnhub metric.* (heuristische Prozent->Dezimal Konvertierung möglich).")

    if tax_rate < 0 or tax_rate > 0.80:
        raise ValueError(f"{symbol}: tax_rate außerhalb plausibler Range (0..0.8): {tax_rate}")

    # Capital weights
    if "market_value_equity_override" in kwargs and "market_value_debt_override" in kwargs:
        mv_e = float(kwargs["market_value_equity_override"])
        mv_d = float(kwargs["market_value_debt_override"])
        if mv_e <= 0 or mv_d < 0:
            raise ValueError(f"{symbol}: market values müssen mv_e>0 und mv_d>=0 sein (mv_e={mv_e}, mv_d={mv_d})")
        e_weight = mv_e / (mv_e + mv_d)
        d_weight = mv_d / (mv_e + mv_d)
        assumptions.append("Capital weights via market_value_*_override.")
        components["market_value_equity"] = mv_e
        components["market_value_debt"] = mv_d
    else:
        de_raw = _get_nested(data, FINNHUB_FIELDS["debt_to_equity"])
        de_ratio = float(_require(de_raw, symbol, FINNHUB_FIELDS["debt_to_equity"]))
        if de_ratio < 0:
            raise ValueError(f"{symbol}: debtToEquity muss >= 0 sein (got {de_ratio})")
        e_weight = 1.0 / (1.0 + de_ratio)
        d_weight = de_ratio / (1.0 + de_ratio)
        assumptions.append("Capital weights via debtToEquity (Proxy): E/V=1/(1+D/E), D/V=(D/E)/(1+D/E).")
        components["debt_to_equity"] = de_ratio

    # Cost of debt
    if "pre_tax_cost_of_debt_override" in kwargs:
        rd_pre_tax = float(kwargs["pre_tax_cost_of_debt_override"])
        assumptions.append("Pre-tax cost of debt via pre_tax_cost_of_debt_override.")
    else:
        # Estimate rd from debtToEquity + rf via deterministic spread function
        de_raw = _get_nested(data, FINNHUB_FIELDS["debt_to_equity"])
        de_ratio = float(_require(de_raw, symbol, FINNHUB_FIELDS["debt_to_equity"]))
        spread = _estimate_credit_spread_from_de_ratio(de_ratio)
        rd_pre_tax = float(risk_free_rate + spread)
        assumptions.append("Pre-tax cost of debt estimated from debtToEquity + rf (deterministische Spread-Heuristik).")
        components["estimated_credit_spread"] = spread

    if rd_pre_tax <= 0:
        raise ValueError(f"{symbol}: rd_pre_tax muss > 0 sein (got {rd_pre_tax})")

    rd_after_tax = rd_pre_tax * (1.0 - tax_rate)

    wacc = e_weight * re_cost + d_weight * rd_after_tax

    components.update(
        {
            "risk_free_rate": risk_free_rate,
            "market_risk_premium": market_risk_premium,
            "cost_of_equity": re_cost,
            "pre_tax_cost_of_debt": rd_pre_tax,
            "after_tax_cost_of_debt": rd_after_tax,
            "tax_rate": tax_rate,
            "equity_weight": e_weight,
            "debt_weight": d_weight,
            "wacc": wacc,
        }
    )

    # Data quality / confidence
    required_fields = []
    if "cost_of_equity_override" not in kwargs:
        required_fields.append(FINNHUB_FIELDS["beta"])
    if "market_value_equity_override" not in kwargs or "market_value_debt_override" not in kwargs:
        required_fields.append(FINNHUB_FIELDS["debt_to_equity"])
    if "pre_tax_cost_of_debt_override" not in kwargs:
        required_fields.append(FINNHUB_FIELDS["debt_to_equity"])

    present_required = sum(1 for f in required_fields if _get_nested(data, f) is not None)
    dq_required = present_required / max(1, len(required_fields))
    confidence = float(round(dq_required, 4))

    data_quality = {
        "required_fields_present_ratio": float(round(dq_required, 4)),
    }

    return {
        "value": float(wacc),
        "components": components,
        "assumptions": assumptions,
        "data_quality": data_quality,
        "confidence": confidence,
    }


def _fetch_finnhub_data(symbol: str, client: object) -> Dict[str, Any]:
    """Holt /company-basic-financials und liefert flach {metric:...}."""
    try:
        basic = client.company_basic_financials(symbol, "all")
        if not isinstance(basic, dict) or "metric" not in basic:
            raise ValueError(f"{symbol}: Kein 'metric' Feld in /company-basic-financials")
        return {"metric": basic.get("metric", {})}
    except Exception as exc:  # pragma: no cover - relies on Finnhub
        logger.error("Finnhub-Fetch fehlgeschlagen für %s: %s", symbol, exc)
        raise


def test_calculate_wacc() -> None:
    """Damodaran Illustration 2.1: WACC = 9.94% (0.0994)."""

    class MockFinnhubClient:
        def company_basic_financials(self, symbol: str, metric: str):
            return {"metric": {"beta": 1.0, "debtToEquity": 0.0}}

    client = MockFinnhubClient()

    result = calculate_wacc(
        "TEST",
        client,
        # Overrides exakt aus dem Buchbeispiel:
        cost_of_equity_override=0.13625,
        pre_tax_cost_of_debt_override=0.10,
        tax_rate_override=0.50,
        market_value_equity_override=1073.0,
        market_value_debt_override=800.0,
    )

    assert abs(result["value"] - 0.0994) < 0.0005, f"WACC mismatch: {result['value']}"
    assert result["confidence"] > 0.80, f"Low confidence: {result['confidence']}"
    assert len(result["assumptions"]) > 0, "Assumptions missing"

    print(f"WACC Test PASSED: {result['value']:.6f}")


if __name__ == "__main__":
    test_calculate_wacc()
