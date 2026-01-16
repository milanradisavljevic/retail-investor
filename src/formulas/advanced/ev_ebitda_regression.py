"""Dynamic EV/EBITDA multiple via daily OLS regression on the current universe."""

import logging
from typing import Any, Dict, List

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

logger = logging.getLogger(__name__)


def _fetch_universe_data(universe: List[str], client: object) -> pd.DataFrame:
    """Lade EV/EBITDA, ROIC, Growth, Beta für ALLE Symbole."""
    data = []
    for symbol in universe:
        try:
            fin = client.company_basic_financials(symbol, "all")
            metric = fin.get("metric", {})

            # Wir brauchen 4 Felder - wenn eins fehlt, skippe das Symbol
            ev_ebitda = metric.get("enterpriseValueOverEBITDA")
            roic = metric.get("roic")
            beta = metric.get("beta")

            # Growth aus FCFE-Serie berechnen
            fcfe_series = fin.get("series", {}).get("annual", {}).get("freeCashFlow", [])
            growth = _calculate_cagr(fcfe_series) if len(fcfe_series) >= 5 else None

            if all(v is not None for v in [ev_ebitda, roic, beta, growth]):
                data.append(
                    {
                        "symbol": symbol,
                        "ev_ebitda": ev_ebitda,
                        "roic": roic,
                        "growth": growth,
                        "beta": beta,
                    }
                )
        except Exception as exc:
            logger.warning("%s: Daten unvollständig - überspringe in Regression: %s", symbol, exc)

    return pd.DataFrame(data)


def _calculate_cagr(series: List[Dict[str, Any]]) -> float:
    """Berechne CAGR aus Finnhub-Zeitreihe."""
    if len(series) < 5:
        raise ValueError("Weniger als 5 Jahre Daten für CAGR")

    values = [float(p["v"]) for p in series[-5:]]  # Letzte 5 Jahre
    return (values[-1] / values[0]) ** (1 / 4) - 1


def calculate_ev_ebitda_regression(
    symbol: str,
    finnhub_client: object,
    universe: List[str],
    **config: Any,
) -> Dict[str, Any]:
    """
    Dynamische OLS-Regression für EV/EBITDA Multiple.

    Trainiert auf heutigem Universe, predicipt für symbol.
    Koeffizienten ändern sich täglich mit dem Markt.
    """

    # 1. Universum-Daten sammeln
    df = _fetch_universe_data(universe, finnhub_client)

    if len(df) < 10:
        raise ValueError(f"Zu wenige vollständige Daten für Regression (min 10, haben {len(df)})")

    # 2. OLS Regression: EV/EBITDA ~ ROIC + Growth + Beta
    X = df[["roic", "growth", "beta"]].values
    y = df["ev_ebitda"].values

    model = LinearRegression().fit(X, y)

    coefficients = {
        "intercept": float(model.intercept_),
        "roic": float(model.coef_[0]),
        "growth": float(model.coef_[1]),
        "beta": float(model.coef_[2]),
    }

    r_squared = float(model.score(X, y))

    # 3. Predicipt für das angefragte Symbol
    try:
        symbol_data = _fetch_universe_data([symbol], finnhub_client)
        if symbol_data.empty:
            raise ValueError(f"{symbol}: Keine Daten für Prediction")

        X_symbol = symbol_data[["roic", "growth", "beta"]].values
        prediction = float(model.predict(X_symbol)[0])

    except Exception as exc:
        logger.error("%s: Prediction fehlgeschlagen: %s", symbol, exc)
        raise ValueError(f"{symbol}: Kann EV/EBITDA nicht predicipten")

    return {
        "value": prediction,
        "components": {
            "coefficients": coefficients,
            "r_squared": r_squared,
            "training_samples": len(df),
        },
        "assumptions": [
            f"OLS auf {len(df)} Universe-Symbolen",
            f"R² = {r_squared:.3f}",
            f"Koeffizienten: {coefficients}",
        ],
        "data_quality": {
            "training_completeness": len(df) / len(universe),
            "r_squared": r_squared,
        },
    }


def test_calculate_ev_ebitda_regression() -> None:
    """Test mit bekannten Werten aus Damodaran Table 18.20."""

    class MockFinnhubClient:
        def company_basic_financials(self, symbol: str, metric: str):
            # Mock-Daten für Birmingham Steel (aus Tabelle)
            if symbol == "BIRM_STEEL":
                return {
                    "metric": {
                        "enterpriseValueOverEBITDA": 5.60,
                        "roic": 0.0689,
                        "beta": 0.85,  # Schätzung basierend auf unlevered
                    },
                    "series": {
                        "annual": {
                            "freeCashFlow": [
                                {"period": "1997", "v": 100},
                                {"period": "1998", "v": 105},
                                {"period": "1999", "v": 110},
                                {"period": "2000", "v": 115},
                                {"period": "2001", "v": 120},
                            ]
                        }
                    },
                }
            # Andere Stahl-Firmen für Regression
            return {
                "metric": {
                    "enterpriseValueOverEBITDA": 4.0 + hash(symbol) % 5,  # Zufall 4-9
                    "roic": 0.05 + (hash(symbol) % 10) / 100,
                    "beta": 0.8 + (hash(symbol) % 5) / 10,
                },
                "series": {
                    "annual": {
                        "freeCashFlow": [{"period": "1997", "v": 100 + i} for i in range(5)]
                    }
                },
            }

    client = MockFinnhubClient()
    universe = [f"STEEL_{i}" for i in range(20)] + ["BIRM_STEEL"]

    result = calculate_ev_ebitda_regression("BIRM_STEEL", client, universe)

    # Tabelle sagt: Actual = 5.60, Predicted sollte in Richtung 4.91 gehen
    # (es wird nicht exakt 4.91 sein, weil wir mehr Variablen nutzen als Damodaran)
    assert result["value"] > 3.0, f"EV/EBITDA zu niedrig: {result['value']}"
    assert result["value"] < 8.0, f"EV/EBITDA zu hoch: {result['value']}"
    assert result["components"]["r_squared"] > 0.5, f"Modellqualität zu schlecht: {result['r_squared']}"

    print(f"EV/EBITDA Regression Test PASSED: {result['value']:.2f}x (R²={result['components']['r_squared']:.3f})")


if __name__ == "__main__":
    test_calculate_ev_ebitda_regression()
