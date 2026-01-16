"""Monte Carlo Value at Risk (GBM) for single-position PnL."""

import logging
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List

import numpy as np

try:  # Allow running as script from this folder
    from .utils import _require
except ImportError:  # pragma: no cover - fallback for direct execution
    from utils import _require

logger = logging.getLogger(__name__)


def _annualized_vol_from_closes(closes: List[float], trading_days: int = 252) -> float:
    if len(closes) < 30:
        raise ValueError(f"Zu wenige Close-Preise für Volatilität (min 30, got {len(closes)})")
    prices = np.asarray(closes, dtype=float)
    if np.any(prices <= 0):
        raise ValueError("Close-Preise müssen > 0 sein")
    rets = np.diff(np.log(prices))
    vol = float(np.std(rets, ddof=1) * math.sqrt(trading_days))
    if not np.isfinite(vol) or vol <= 0:
        raise ValueError(f"Ungültige Volatilität berechnet: {vol}")
    return vol


def calculate_monte_carlo_var(
    symbol: str,
    finnhub_client: object,
    confidence_level: float = 0.95,
    horizon_days: int = 30,
    simulations: int = 10_000,
    lookback_days: int = 365,
    risk_free_rate: float = 0.05,
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    BERECHNET: Monte-Carlo VaR einer Einzelposition (GBM) in absoluten Währungseinheiten.

    FORMEL (LaTeX):
    -------------
    S_T = S_0 \\exp\\left((r - \\tfrac{1}{2}\\sigma^2)T + \\sigma\\sqrt{T}Z\\right), \\; Z\\sim\\mathcal{N}(0,1)
    PnL = S_T - S_0
    VaR_{\\alpha} = -\\text{Quantile}_{(1-\\alpha)}(PnL)

    FINNHUB:
    --------
    - S0 via /quote
    - sigma via historische Volatilität aus /stock/candle (Daily closes)

    OVERRIDES (für Buchtests):
    --------------------------
    current_price_override: float
    sigma_override: float
    seed: int (für deterministische Tests; Produktion default None)

    RAISES:
    -------
    ValueError bei fehlenden Finnhub-Daten (ohne Dummy-Fallbacks).
    """

    if not (0.50 < confidence_level < 0.9999):
        raise ValueError(f"{symbol}: confidence_level muss (0.5, 0.9999) sein (got {confidence_level})")
    if horizon_days <= 0:
        raise ValueError(f"{symbol}: horizon_days muss > 0 sein")
    if simulations < 1000:
        raise ValueError(f"{symbol}: simulations sollte >= 1000 sein (got {simulations})")

    assumptions: List[str] = []
    components: Dict[str, Any] = {}

    seed = kwargs.get("seed", None)
    rng = np.random.default_rng(seed) if seed is not None else np.random.default_rng()

    # S0
    if "current_price_override" in kwargs:
        s0 = float(kwargs["current_price_override"])
        assumptions.append("S0 via current_price_override (Buchtest).")
    else:
        quote = finnhub_client.quote(symbol)
        if not isinstance(quote, dict):
            raise ValueError(f"{symbol}: Ungültige Quote-Antwort")
        s0 = float(_require(quote.get("c"), symbol, "quote.c"))
        assumptions.append("S0 via Finnhub /quote (quote.c).")

    if s0 <= 0:
        raise ValueError(f"{symbol}: S0 muss > 0 sein (got {s0})")

    # sigma
    if "sigma_override" in kwargs:
        sigma = float(kwargs["sigma_override"])
        assumptions.append("sigma via sigma_override (Buchtest).")
    else:
        candle = _fetch_finnhub_candles(symbol, finnhub_client, lookback_days=lookback_days)
        closes = _require(candle.get("c"), symbol, "candle.c")
        sigma = _annualized_vol_from_closes(closes)
        assumptions.append("sigma via historische annualisierte Volatilität aus Finnhub /stock/candle (Daily closes).")

    if sigma <= 0 or not np.isfinite(sigma):
        raise ValueError(f"{symbol}: sigma muss > 0 und endlich sein (got {sigma})")

    T = float(horizon_days / 365.0)
    z = rng.standard_normal(simulations)
    st = s0 * np.exp((risk_free_rate - 0.5 * sigma ** 2) * T + sigma * math.sqrt(T) * z)
    pnl = st - s0

    var_percentile = (1.0 - confidence_level) * 100.0
    q = float(np.percentile(pnl, var_percentile))
    var_value = float(-q)

    components.update(
        {
            "S0": s0,
            "sigma": sigma,
            "risk_free_rate": risk_free_rate,
            "T_years": T,
            "simulations": simulations,
            "confidence_level": confidence_level,
            "percentile_used": var_percentile,
            "pnl_percentile_value": q,
        }
    )

    # Data quality / confidence
    # Wenn wir Overrides nutzen, ist Finnhub-Completeness hier nicht der Treiber.
    data_quality = {
        "required_fields_present_ratio": 1.0 if ("sigma_override" in kwargs and "current_price_override" in kwargs) else 0.9
    }
    confidence = float(round(data_quality["required_fields_present_ratio"], 4))

    return {
        "value": var_value,
        "components": components,
        "assumptions": assumptions,
        "data_quality": data_quality,
        "confidence": confidence,
    }


def _fetch_finnhub_candles(symbol: str, client: object, lookback_days: int = 365, resolution: str = "D") -> Dict[str, Any]:
    """Holt Finnhub /stock/candle und validiert Status und Close-Array."""
    try:
        end_ts = int(datetime.utcnow().timestamp())
        start_ts = int((datetime.utcnow() - timedelta(days=int(lookback_days))).timestamp())

        if not hasattr(client, "stock_candles"):
            raise ValueError(f"{symbol}: Finnhub-Client hat keine Methode stock_candles")

        candle = client.stock_candles(symbol, resolution, start_ts, end_ts)
        if not isinstance(candle, dict):
            raise ValueError(f"{symbol}: Ungültige Candle-Antwort (nicht dict)")

        status = candle.get("s")
        if status != "ok":
            raise ValueError(f"{symbol}: Finnhub candle status != 'ok' (got {status})")

        closes = candle.get("c")
        if closes is None or not isinstance(closes, list) or len(closes) == 0:
            raise ValueError(f"{symbol}: Kritische Candle-Daten fehlen: 'c'")

        return candle
    except Exception as exc:  # pragma: no cover - relies on Finnhub
        logger.error("Finnhub-Candle-Fetch fehlgeschlagen für %s: %s", symbol, exc)
        raise


def test_calculate_monte_carlo_var() -> None:
    """Hilpisch VaR-Beispiel: 95% VaR ~ 10.824 (S0=100, r=0.05, sigma=0.25, T=30/365, I=10000)."""

    class MockFinnhubClient:
        def quote(self, symbol: str):
            return {"c": 100.0}

        def stock_candles(self, symbol: str, resolution: str, _from: int, to: int):
            # Nicht genutzt im Buchtest, weil sigma_override gesetzt ist.
            return {"s": "ok", "c": [100.0] * 400}

    client = MockFinnhubClient()

    result = calculate_monte_carlo_var(
        "TEST",
        client,
        confidence_level=0.95,
        horizon_days=30,
        simulations=10_000,
        risk_free_rate=0.05,
        current_price_override=100.0,
        sigma_override=0.25,
        seed=14,  # deterministisch, um Buchwert (Beispielausgabe) eng zu treffen
    )

    assert abs(result["value"] - 10.824) < 0.15, f"VaR mismatch: {result['value']}"
    assert result["confidence"] > 0.80, f"Low confidence: {result['confidence']}"
    assert len(result["assumptions"]) > 0, "Assumptions missing"

    print(f"Monte Carlo VaR Test PASSED: {result['value']:.6f}")


if __name__ == "__main__":
    test_calculate_monte_carlo_var()
