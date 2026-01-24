# Big Picture – Retail Investor MVP

## Worum es geht
- Toolkit für deterministisches Aktien-Scoring (4-Pillar: Valuation/Quality/Technical/Risk) plus Fair-Value-Modell, dazu Backtests für Strategien (Momentum, Hybrid, 4-Pillar) auf verschiedenen Universes.
- Next.js-Dashboard zur Visualisierung von Kennzahlen, Equity/Drawdown (Recharts), Universe-Selektor und Weight-Presets.
- Datenquellen: Finnhub/YFinance für Fundamentals/Prices; universes konfigurierbar unter `config/universes/*.json`.

## Aktueller Stand
- **Runs (2020-2024):**
  - Momentum (Russell2000, fixiert): 1299.95% Total Return, 69.53% p.a., Max DD -66.58%, Sharpe 1.23 (`data/backtesting/backtest-summary-momentum-fixed.json`).
  - Momentum (alt): 388.2% Total Return, Max DD -66.82% (Bug: Q1-Q3 2020 keine Picks).
  - 4-Pillar Sample: 187.42% Total Return, Max DD -37.48% (`backtest-summary-4pillar.json`).
  - 4-Pillar Full Russell2000 (fixed lookback): 61.69% Total Return, Max DD -23.86% (`backtest-summary-4pillar-full.json`).
- **Bug-Fix Momentum:** Lookback-Limit gelockert (>=60d für 13W, 26W optional) → Rebalances ab Q2 2020; neuer Run generiert.
- **UI/API:** Backtesting-API liefert Summary/Equity/Drawdown aus `data/backtesting`; Dashboard lädt Charts per Fetch (Strategy/Universe), zeigt serverseitige Time-Series als Fallback. Universe-Selector/Weights vorhanden; Charts waren zeitweise leer, jetzt mit API-Fallback.
- **Datenlage:** Russell2000_full Universe 1,943 Symbole; ~51 fehlen/haben Datenlücken. Company-Namen-Mapping für Russell2000 noch offen.

## Herausforderungen / Risiken
- **Volatilität Momentum:** Sehr hohe Returns, aber Max Drawdown ~-66%; Bedarf an Risk-Kappen (Vol-Filter, Position Sizing) für realistischere Pfade.
- **Datenqualität:** Fehlende Ticker im Russell2000_full; fehlende Firmennamen im UI; Fundamentals-Proxies statt echter Historien (insb. für 4-Pillar).
- **UI-Integrität:** Charts/LLM-Darstellung müssen konsistent mit Dateien sein; weiterhin prüfen, ob Fetch/Env in Vercel/Prod läuft.
- **Universen-Skalierung:** Weitere Universes (DAX/FTSE/Asien) erst nach Stabilisierung von Daten & Scoring, sonst hoher Aufwand bei 10h/Woche.

## Beobachtungen aus den letzten Runs (Rohdaten: `data/backtesting/`)
- Momentum-Fix hebt Performance massiv (1299% vs 388%) durch frühere Entries, aber Drawdown bleibt extrem.
- 4-Pillar skaliert breit schlechter als Momentum, aber deutlich bessere Drawdown-Kontrolle (-23.86% Full vs -66% Momentum).
- Benchmark SPY (95% Return, DD -33.72%) bleibt Referenz: Momentum outperformt stark, 4-Pillar Full unterperformt, aber risikoseitig überlegen.

## Nächste sinnvolle Schritte (Vorschlag)
1) **Charts & Namen finalisieren:** Sicherstellen, dass `/backtesting` Charts mit API-Daten füllen; Russell2000 Namens-Mapping integrieren.
2) **Risk-Tuning Momentum:** Vol-/DD-Caps oder Soft-Cap-Varianten testen; ggf. Top-N, Position Sizing, Rebalance-Logik justieren.
3) **4-Pillar stärken:** Echte Fundamentals/Historien einziehen oder bessere Proxies; erneut Full-Run fahren.
4) **Datenpflege:** Fehlende ~51 Ticker klären/ersetzen; Universe-Dateien bereinigen.
5) **Expansion (später):** Nach Stabilisierung DAX/FTSE pilotieren; Asien/LatAm erst nach validierten Runs.

## Kontext aus "Final Chat with ClWA"
- Der User braucht Klarheit/Entlastung: Fokus auf Charts fixen, Momentum-Bug beheben (erledigt), Knowledge-Base/Monetarisierung klären.
- Warnung vor zu schneller Universe-Expansion; erst stabile Basis (Russell2000/SP500) mit funktionierendem Dashboard und Datenqualität.

