# ============================================================================
# FORMEL: Two-Stage FCFE DCF (High Growth + Terminal Value)
# QUELLE: Damodaran, Investment Valuation (4th ed., 2025), Ch.14 (FCFE Valuation),
#         Table 14.9 & Terminal Value using FCFE_(n+1)/(r_e,stable - g_stable)
#         (PDF p. 522: "TABLE 14.9 FCFE and Present Value for Nestle")
# KATEGORIE: DCF
# FINNHUB-ENDPUNKTE:
#   - /company-basic-financials  (metric + series.annual.*)
#   - /quote                    (current price, optional for spread checks)
#   - /stock/profile2           (shareOutstanding)
# IMPLEMENTIERUNGSPRIORITÄT: 1
# ============================================================================

import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# FINNHUB-MAPPING
FINNHUB_FIELDS = {
    # /company-basic-financials
    "beta": "metric.beta",
    "roe": "metric.roe",
    "free_cash_flow_ttm": "metric.freeCashFlow",
    "free_cash_flow_series_annual": "series.annual.freeCashFlow",
    "net_income_series_annual": "series.annual.netIncome",  # optional (not always provided)
    # /quote
    "current_price": "quote.c",
    # /stock/profile2
    "shares_outstanding": "profile.shareOutstanding",
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
        raise ValueError(f"{symbol}: Kritisches Finnhub-Feld fehlt: {field_name}")
    return value


def _as_decimal_if_percent(x: float, symbol: str, field_name: str) -> float:
    """
    Finnhub liefert manche Kennzahlen als Prozent (z.B. 31.4 für 31.4%).
    Heuristik: Werte > 1.5 werden als Prozent interpretiert.
    """
    if not np.isfinite(x):
        raise ValueError(f"{symbol}: Ungültiger Wert für {field_name}: {x}")
    return x / 100.0 if x > 1.5 else x


def _sort_series_points(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    def _key(p: Dict[str, Any]) -> str:
        return str(p.get("period", ""))

    return sorted(points, key=_key)


def _extract_latest_value(points: List[Dict[str, Any]], symbol: str, field_name: str) -> float:
    if not points:
        raise ValueError(f"{symbol}: Kritische Zeitreihe leer: {field_name}")
    pts = _sort_series_points(points)
    v = pts[-1].get("v")
    if v is None:
        raise ValueError(f"{symbol}: Kritischer Zeitreihen-Wert fehlt: {field_name} (latest.v)")
    try:
        return float(v)
    except Exception as exc:
        raise ValueError(f"{symbol}: Nicht-numerischer Zeitreihen-Wert für {field_name}: {v}") from exc


def _compute_cagr(
    end_value: float, start_value: float, years: float, symbol: str, context: str
) -> float:
    if years <= 0:
        raise ValueError(f"{symbol}: CAGR-Jahre müssen > 0 sein ({context})")
    if start_value <= 0 or end_value <= 0:
        raise ValueError(f"{symbol}: CAGR benötigt positive Werte ({context}); start={start_value}, end={end_value}")
    return (end_value / start_value) ** (1.0 / years) - 1.0


def calculate_two_stage_dcf(
    symbol: str,
    finnhub_client: object,
    lookback_years: int = 5,
    risk_free_rate: float = 0.04,
    market_risk_premium: float = 0.055,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    BERECHNET: Intrinsic Value pro Aktie via Two-Stage FCFE DCF (High Growth + Terminal Value).

    FORMEL (LaTeX):
    -------------
    \\text{Value}_0
      = \\sum_{t=1}^{n}\\frac{FCFE_t}{(1+r_{e,HG})^t}
      + \\frac{\\frac{FCFE_{n+1}}{(r_{e,stable}-g_{stable})}}{(1+r_{e,HG})^n}

    NOTES (Modellpfade):
    --------------------
    Pfad A (Damodaran-ähnlich, wenn Net Income Serie vorhanden):
      - Equity reinvestment rate = 1 - FCFE_0 / NetIncome_0
      - g_HG = ROE * EquityReinvestmentRate
      - FCFE_t = NetIncome_t * (1 - EquityReinvestmentRate)
      - Terminal: FCFE_{n+1} über stable reinvestment rate = g_stable / ROE_stable

    Pfad B (Fallback, wenn Net Income Serie fehlt):
      - g_HG aus FCFE CAGR (aus series.annual.freeCashFlow)
      - FCFE_t = FCFE_0 * (1 + g_HG)^t
      - FCFE_{n+1} = FCFE_n * (1 + g_stable)

    PARAMETER:
    ----------
    high_growth_years: int (default 5)
    stable_growth_rate: float (default = risk_free_rate)
    stable_roe: float (optional; wenn gesetzt, wird Terminal-FCFE Damodaran-ähnlich gerechnet)
    cost_of_equity_high_growth: float (optional override)
    cost_of_equity_stable: float (optional override)
    cash_and_marketable_securities: float (optional; wenn gesetzt, wird zum Equity Value addiert)
    shares_outstanding_override: float (optional; wenn profile.shareOutstanding fehlt)

    RETURNS:
    --------
    dict mit:
    - 'value': float (intrinsic value pro Aktie; Einheit wie Inputs)
    - 'components': dict (Zwischenwerte)
    - 'assumptions': list[str]
    - 'data_quality': dict
    - 'confidence': float (0-1)

    RAISES:
    -------
    ValueError: Wenn kritische Finnhub-Daten fehlen (keine Dummy-Werte).
    """

    data = _fetch_finnhub_data(symbol, finnhub_client)

    assumptions: List[str] = []
    components: Dict[str, Any] = {}

    high_growth_years = int(kwargs.get("high_growth_years", 5))
    if high_growth_years <= 0:
        raise ValueError(f"{symbol}: high_growth_years muss > 0 sein")

    stable_growth_rate = float(kwargs.get("stable_growth_rate", risk_free_rate))
    assumptions.append(
        f"Stable growth rate g_stable={'provided' if 'stable_growth_rate' in kwargs else 'default=risk_free_rate'}={stable_growth_rate:.6f}"
    )

    # Shares outstanding
    shares_outstanding = _get_nested(data, FINNHUB_FIELDS["shares_outstanding"])
    if shares_outstanding is None:
        if "shares_outstanding_override" in kwargs:
            shares_outstanding = float(kwargs["shares_outstanding_override"])
            assumptions.append("Shares outstanding via shares_outstanding_override (profile fehlte).")
        else:
            raise ValueError(f"{symbol}: Kritisches Finnhub-Feld fehlt: profile.shareOutstanding")
    shares_outstanding = float(shares_outstanding)
    if shares_outstanding <= 0:
        raise ValueError(f"{symbol}: shares_outstanding muss > 0 sein (got {shares_outstanding})")

    # Series: FCFE proxy (Finnhub freeCashFlow)
    fcf_points = _get_nested(data, FINNHUB_FIELDS["free_cash_flow_series_annual"])
    _require(fcf_points, symbol, FINNHUB_FIELDS["free_cash_flow_series_annual"])
    if not isinstance(fcf_points, list) or len(fcf_points) < 2:
        raise ValueError(f"{symbol}: Zu wenige Datenpunkte in series.annual.freeCashFlow (min 2 benötigt)")

    fcfe0 = _extract_latest_value(fcf_points, symbol, "series.annual.freeCashFlow")
    components["fcfe0"] = fcfe0

    # Optional: Net income series for Damodaran-style growth derivation
    net_income_points = _get_nested(data, FINNHUB_FIELDS["net_income_series_annual"])
    roe_raw = _get_nested(data, FINNHUB_FIELDS["roe"])

    use_net_income_path = isinstance(net_income_points, list) and len(net_income_points) >= 1 and roe_raw is not None

    g_high: Optional[float] = None
    equity_reinvestment_rate: Optional[float] = None

    if use_net_income_path:
        net_income0 = _extract_latest_value(net_income_points, symbol, "series.annual.netIncome")
        if net_income0 <= 0:
            raise ValueError(f"{symbol}: NetIncome_0 muss > 0 sein für Damodaran-Pfad (got {net_income0})")

        equity_reinvestment_rate = 1.0 - (fcfe0 / net_income0)
        if not np.isfinite(equity_reinvestment_rate) or equity_reinvestment_rate < 0 or equity_reinvestment_rate > 1:
            raise ValueError(
                f"{symbol}: Ungültige Equity Reinvestment Rate (1 - FCFE/NI)={equity_reinvestment_rate} "
                f"(FCFE0={fcfe0}, NI0={net_income0})"
            )

        roe = _as_decimal_if_percent(float(roe_raw), symbol, "metric.roe")
        if roe <= 0:
            raise ValueError(f"{symbol}: ROE muss > 0 sein (got {roe})")

        g_high = roe * equity_reinvestment_rate
        components["net_income0"] = net_income0
        components["equity_reinvestment_rate_high"] = equity_reinvestment_rate
        components["roe_decimal"] = roe
        components["g_high"] = g_high
        assumptions.append("High-growth rate via Damodaran: g_high = ROE * EquityReinvestmentRate (aus Finnhub series + metric).")
    else:
        # Fallback: CAGR from FCFE series (must still come from series.annual.*)
        pts = _sort_series_points(fcf_points)
        years = min(lookback_years, len(pts) - 1)
        if years < 1:
            raise ValueError(f"{symbol}: lookback_years zu klein oder zu wenige FCFE-Datenpunkte")
        start_value = float(pts[-(years + 1)].get("v"))
        end_value = float(pts[-1].get("v"))
        g_high = _compute_cagr(end_value, start_value, float(years), symbol, "FCFE CAGR")
        components["g_high"] = g_high
        assumptions.append("High-growth rate via FCFE CAGR aus Finnhub series.annual.freeCashFlow (NetIncome-Serie fehlte).")

    if g_high is None:
        raise ValueError(f"{symbol}: Konnte g_high nicht bestimmen (kritisch)")

    # Discount rates (Cost of Equity)
    if "cost_of_equity_high_growth" in kwargs:
        re_hg = float(kwargs["cost_of_equity_high_growth"])
        assumptions.append("Cost of equity (HG) via cost_of_equity_high_growth override.")
    else:
        beta_raw = _get_nested(data, FINNHUB_FIELDS["beta"])
        beta = float(_require(beta_raw, symbol, FINNHUB_FIELDS["beta"]))
        re_hg = float(risk_free_rate + beta * market_risk_premium)
        assumptions.append("Cost of equity (HG) via CAPM: rf + beta * MRP (beta aus Finnhub).")

    if "cost_of_equity_stable" in kwargs:
        re_stable = float(kwargs["cost_of_equity_stable"])
        assumptions.append("Cost of equity (stable) via cost_of_equity_stable override.")
    else:
        stable_beta = float(kwargs.get("stable_beta", 1.0))
        re_stable = float(risk_free_rate + stable_beta * market_risk_premium)
        assumptions.append("Cost of equity (stable) via CAPM mit stable_beta (default 1.0).")

    if re_stable <= stable_growth_rate:
        raise ValueError(f"{symbol}: Terminalbedingung verletzt: r_e,stable ({re_stable}) <= g_stable ({stable_growth_rate})")

    components["re_high_growth"] = re_hg
    components["re_stable"] = re_stable
    components["stable_growth_rate"] = stable_growth_rate
    components["high_growth_years"] = high_growth_years

    # Project cash flows
    pv_fcfe = 0.0
    fcfe_series_proj: List[float] = []

    if use_net_income_path and equity_reinvestment_rate is not None:
        # Project net income & FCFE in HG
        net_income0 = float(components["net_income0"])
        for t in range(1, high_growth_years + 1):
            ni_t = net_income0 * ((1.0 + g_high) ** t)
            fcfe_t = ni_t * (1.0 - equity_reinvestment_rate)
            fcfe_series_proj.append(fcfe_t)
            pv_fcfe += fcfe_t / ((1.0 + re_hg) ** t)

        # Terminal FCFE_{n+1}
        stable_roe = kwargs.get("stable_roe", None)
        if stable_roe is not None:
            stable_roe_dec = _as_decimal_if_percent(float(stable_roe), symbol, "stable_roe")
            if stable_roe_dec <= 0:
                raise ValueError(f"{symbol}: stable_roe muss > 0 sein (got {stable_roe_dec})")
            stable_reinv = stable_growth_rate / stable_roe_dec
            if stable_reinv < 0 or stable_reinv > 1:
                raise ValueError(f"{symbol}: Stable reinvestment rate ungültig: {stable_reinv} (g/ROE)")
            assumptions.append("Terminal FCFE via Damodaran: stable reinvestment = g_stable/ROE_stable.")
        else:
            # If stable_roe not given, fallback to FCFE growth for terminal
            stable_reinv = None
            assumptions.append("Terminal FCFE fallback: FCFE_(n+1) = FCFE_n*(1+g_stable) (stable_roe nicht gesetzt).")

        fcfe_n = fcfe_series_proj[-1]
        if stable_reinv is None:
            fcfe_n1 = fcfe_n * (1.0 + stable_growth_rate)
        else:
            # NetIncome_{n} and NetIncome_{n+1} in stable growth
            ni_n = net_income0 * ((1.0 + g_high) ** high_growth_years)
            ni_n1 = ni_n * (1.0 + stable_growth_rate)
            fcfe_n1 = ni_n1 * (1.0 - stable_reinv)

    else:
        # Project FCFE directly in HG
        for t in range(1, high_growth_years + 1):
            fcfe_t = fcfe0 * ((1.0 + g_high) ** t)
            fcfe_series_proj.append(fcfe_t)
            pv_fcfe += fcfe_t / ((1.0 + re_hg) ** t)

        fcfe_n = fcfe_series_proj[-1]
        fcfe_n1 = fcfe_n * (1.0 + stable_growth_rate)
        assumptions.append("Terminal FCFE via FCFE_n*(1+g_stable) (NetIncome-Serie fehlte).")

    if fcfe_n1 <= 0:
        raise ValueError(f"{symbol}: FCFE_(n+1) muss > 0 sein für Terminal Value (got {fcfe_n1})")

    terminal_value = fcfe_n1 / (re_stable - stable_growth_rate)
    pv_terminal = terminal_value / ((1.0 + re_hg) ** high_growth_years)

    equity_value = pv_fcfe + pv_terminal

    cash_and_ms = kwargs.get("cash_and_marketable_securities", None)
    if cash_and_ms is not None:
        equity_value += float(cash_and_ms)
        components["cash_and_marketable_securities_added"] = float(cash_and_ms)
        assumptions.append("Cash & marketable securities wurden als Override addiert (nicht zuverlässig aus Finnhub basic-financials).")
    else:
        components["cash_and_marketable_securities_added"] = None

    intrinsic_per_share = equity_value / shares_outstanding

    components["pv_fcfe_high_growth"] = pv_fcfe
    components["fcfe_projected_high_growth"] = fcfe_series_proj
    components["fcfe_n_plus_1"] = fcfe_n1
    components["terminal_value"] = terminal_value
    components["pv_terminal_value"] = pv_terminal
    components["equity_value_total"] = equity_value
    components["shares_outstanding"] = shares_outstanding

    # Data quality / confidence
    required_fields = [
        FINNHUB_FIELDS["free_cash_flow_series_annual"],
        FINNHUB_FIELDS["shares_outstanding"],
    ]
    if "cost_of_equity_high_growth" not in kwargs:
        required_fields.append(FINNHUB_FIELDS["beta"])

    optional_fields = [
        FINNHUB_FIELDS["roe"],
        FINNHUB_FIELDS["net_income_series_annual"],
        FINNHUB_FIELDS["current_price"],
    ]

    present_required = sum(1 for f in required_fields if _get_nested(data, f) is not None)
    present_optional = sum(1 for f in optional_fields if _get_nested(data, f) is not None)
    dq_required = present_required / max(1, len(required_fields))
    dq_optional = present_optional / max(1, len(optional_fields))
    confidence = float(round(dq_required * 0.85 + dq_optional * 0.15, 4))

    data_quality = {
        "required_fields_present_ratio": float(round(dq_required, 4)),
        "optional_fields_present_ratio": float(round(dq_optional, 4)),
        "model_path": "net_income_path" if use_net_income_path else "fcfe_cagr_path",
    }

    return {
        "value": float(intrinsic_per_share),
        "components": components,
        "assumptions": assumptions,
        "data_quality": data_quality,
        "confidence": confidence,
    }


# ============================================================================
# FINNHUB-DATA-FETCHER
# ============================================================================
def _fetch_finnhub_data(symbol: str, client: object) -> Dict[str, Any]:
    """Holt und validiert benötigte Finnhub-Daten (ohne Dummy-Fallbacks)."""
    try:
        basic = client.company_basic_financials(symbol, "all")
        quote = client.quote(symbol)

        # profile2 ist kritisch für shareOutstanding
        if hasattr(client, "company_profile2"):
            profile = client.company_profile2(symbol)
        elif hasattr(client, "company_profile"):  # seltene API-Wrapper-Variante
            profile = client.company_profile(symbol)
        else:
            raise ValueError(f"{symbol}: Finnhub-Client hat keine Methode company_profile2/company_profile")

        if not isinstance(basic, dict) or "metric" not in basic:
            raise ValueError(f"{symbol}: Kein 'metric' Feld in /company-basic-financials")

        if not isinstance(quote, dict):
            raise ValueError(f"{symbol}: Ungültige Quote-Antwort")

        if not isinstance(profile, dict):
            raise ValueError(f"{symbol}: Ungültige Profile-Antwort")

        return {"metric": basic.get("metric", {}), "series": basic.get("series", {}), "quote": quote, "profile": profile}
    except Exception as exc:
        logger.error("Finnhub-Fetch fehlgeschlagen für %s: %s", symbol, exc)
        raise


# ============================================================================
# TEST-CASE (Damodaran: Nestle, Table 14.9 / Terminal Value)
# ============================================================================
def test_calculate_two_stage_dcf():
    """Test mit Damodaran-Nestle-Beispiel (Table 14.9; Ziel ~109.09 pro Aktie)."""

    class MockFinnhubClient:
        def company_basic_financials(self, symbol: str, metric: str):
            # Werte in "SFr mil" (wie im Buch). Units sind egal, solange konsistent.
            # Wir liefern year0 (implizit) NetIncome0 & FCFE0, daraus folgen g_high über ROE*reinvest.
            return {
                "metric": {
                    "roe": 31.40,  # % (wird zu 0.3140)
                },
                "series": {
                    "annual": {
                        # year0 (implizit): FCFE0 ~ 9,606.3 (aus Buch rückgerechnet),
                        # plus ein älterer Punkt, damit die Zeitreihe nicht leer ist.
                        "freeCashFlow": [
                            {"period": "2022", "v": 9230.0},
                            {"period": "2023", "v": 9606.3},
                        ],
                        "netIncome": [
                            {"period": "2022", "v": 10618.0},
                            {"period": "2023", "v": 11061.7},
                        ],
                    }
                },
            }

        def quote(self, symbol: str):
            return {"c": 0.0}

        def company_profile2(self, symbol: str):
            return {"shareOutstanding": 2621.3}

    client = MockFinnhubClient()

    result = calculate_two_stage_dcf(
        "NESN",
        client,
        high_growth_years=5,
        # Buchannahmen:
        risk_free_rate=0.01,
        stable_growth_rate=0.01,
        stable_roe=0.15,
        cost_of_equity_high_growth=0.0464,
        cost_of_equity_stable=0.0538,
        cash_and_marketable_securities=5851.0,
    )

    # Buchziel: ca. 109.09; wegen Rundungen tolerieren wir leicht.
    assert abs(result["value"] - 109.09) < 0.75, f"Value mismatch: {result['value']}"
    assert result["confidence"] > 0.80, f"Low confidence: {result['confidence']}"
    assert len(result["assumptions"]) > 0, "Assumptions missing"

    print(f"Two-Stage DCF Test PASSED: {result['value']:.4f} (confidence={result['confidence']})")
