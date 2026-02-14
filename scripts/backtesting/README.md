# Backtesting Framework

Backtesting-Modul zur historischen Validierung der Scoring-Strategie.

## Strategie

**Quarterly Rebalance Top 10 Momentum**

1. Zu Beginn jedes Quartals (Q1-Q4, 2020-2024):
   - Berechne Momentum-Score für alle Aktien im Universe
   - Wähle Top 10 Aktien nach Score
   - Kaufe alle 10 mit Gleichgewichtung (10% pro Aktie)
2. Halte für 3 Monate bis zum nächsten Quartal
3. Verkaufe alles, wiederhole

**Momentum-Score-Berechnung:**
- 60% Gewichtung: 13-Wochen Return (ca. 65 Handelstage)
- 40% Gewichtung: 26-Wochen Return (ca. 130 Handelstage)

## Verwendung

```bash
# Vollständiger Backtest (Daten laden + Simulation)
npm run backtest

# Nur historische Daten laden
npm run backtest:fetch

# Historische Daten fuer alle Universes nacheinander laden
npm run backtest:fetch:all

# Nur Simulation (wenn Daten bereits vorhanden)
npm run backtest:run
```

## Output

### CSV: `data/backtesting/backtest-results.csv`
Tägliche Portfolio-Werte und Metriken:
```csv
date,portfolio_value,sp500_value,daily_return_pct,drawdown_pct
2020-01-02,100000.00,100000.00,0.00,0.00
2020-01-03,101234.56,100123.45,1.23,-0.00
...
```

### JSON: `data/backtesting/backtest-summary.json`
Zusammenfassung der Performance-Metriken:
```json
{
  "period": "2020-01-01 to 2024-12-31",
  "strategy": "Quarterly Rebalance Top 10 Momentum",
  "metrics": {
    "total_return_pct": 45.67,
    "annualized_return_pct": 8.52,
    "max_drawdown_pct": -23.45,
    "sharpe_ratio": 0.85,
    "volatility_pct": 18.32
  },
  "benchmark": {
    "total_return_pct": 52.34,
    "annualized_return_pct": 9.12,
    "max_drawdown_pct": -19.87,
    "sharpe_ratio": 1.02
  },
  "outperformance_pct": -6.67
}
```

## Metriken

| Metrik | Berechnung |
|--------|------------|
| **Total Return** | (Endwert / Startwert - 1) × 100 |
| **Annualized Return** | CAGR: (Endwert/Startwert)^(1/Jahre) - 1 |
| **Max Drawdown** | Größter Peak-to-Trough Verlust |
| **Sharpe Ratio** | (Ann. Return - 2% RFR) / Ann. Volatility |
| **Volatility** | StdDev(Daily Returns) × sqrt(252) |

## Annahmen & Limitationen

### Vereinfachungen (MVP)
- **Keine Transaktionskosten**: Reale Kosten würden Returns reduzieren
- **Close-Preis Ausführung**: Kauf/Verkauf zum Schlusskurs (unrealistisch)
- **Keine Dividenden**: Dividenden werden ignoriert
- **Keine Steuern**: Steuerliche Auswirkungen nicht berücksichtigt
- **Keine Slippage**: Keine Marktauswirkung bei großen Orders
- **Momentum statt Fundamental**: Vereinfachtes Scoring ohne historische Fundamentaldaten

### Bekannte Limitationen
1. **Survivorship Bias**: Universe enthält nur heute existierende Aktien
2. **Look-Ahead Bias**: Momentum-Berechnung vermeidet dies, aber Universe-Definition nicht
3. **Historische Fundamentaldaten fehlen**: Echtes Scoring würde PE, PB, ROE etc. benötigen
4. **Keine Sektorallokation**: Keine Diversifikations-Constraints

### Delisting-Behandlung
- Aktie ohne Preisdaten an einem Tag: Position wird mit $0 bewertet
- Konservative Annahme (Totalverlust bei Delisting)

## Interpretation der Ergebnisse

### Gute Performance-Indikatoren
- **Sharpe Ratio > 1.0**: Risikoadjustierte Rendite überdurchschnittlich
- **Max Drawdown < -30%**: Akzeptables Risikoprofil
- **Positive Outperformance**: Strategie schlägt Buy-and-Hold S&P 500

### Warnsignale
- **Sharpe Ratio < 0.5**: Schwache risikoadjustierte Rendite
- **Max Drawdown > -50%**: Hohes Risiko
- **Negative Outperformance**: Einfaches S&P 500 ETF wäre besser

## Dateien

```
scripts/backtesting/
├── fetch-historical.py   # Yahoo Finance Downloader
├── run-backtest.ts       # Hauptlogik (Orchestrator)
├── calculate-metrics.ts  # Performance-Metriken
└── README.md             # Diese Dokumentation

data/backtesting/
├── historical/           # Heruntergeladene Preisdaten
│   ├── AAPL.csv
│   ├── MSFT.csv
│   └── ...
├── backtest-results.csv  # Tägliche Portfolio-Werte
└── backtest-summary.json # Performance-Zusammenfassung
```

## Erweiterungsmöglichkeiten

1. **Historische Fundamentaldaten**: Integration von Quarterly Financials für echtes Scoring
2. **Walk-Forward-Analyse**: Robustere Validierung durch rollierende Zeitfenster
3. **Monte-Carlo-Simulation**: Konfidenzintervalle für erwartete Returns
4. **Sektor-Constraints**: Max. 20% pro Sektor zur Diversifikation
5. **Position Sizing**: Kelly-Criterion oder Risk-Parity statt Gleichgewichtung
