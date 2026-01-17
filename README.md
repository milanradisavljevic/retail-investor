# Retail Investor MVP
<img width="937" height="1267" alt="Bildschirmfoto_20260117_202304" src="https://github.com/user-attachments/assets/d001304d-1d40-442b-a708-c88b73d3fdbf" />
<img width="910" h<img width="931" height="1254" alt="Bildschirmfoto_20260117_202226" src="https://github.com/user-attachments/assets/834b257a-061e-4557-9adc-4d6570b201c0" />

Small-cap scoring and backtesting toolkit (Next.js + TypeScript + Python) with offline-friendly data pulls and a dark finance dashboard.

## Was das Projekt macht
- Bewertet Aktien deterministisch: Fundamentals + Technicals → Pillar-Scores + Gesamtscore (Momentum/Hybrid/4-Pillar), keine LLM-Komponenten im Scoring.
- Universes wählbar: Packs unter `config/universes/*.json` (SP500, Nasdaq100, EuroStoxx50 Samples, Russell2000_full), Benchmark pro Pack; Fetcher lädt YF-Daten lokal.
- Backtesting: Quartalsweise Rebalance Top 10; Ergebnisse als CSV + JSON, im UI als Equity/Drawdown/Comparison visualisiert.
- Infrastruktur: Next.js App Router, serverseitiges Laden der Backtest-Daten, Recharts für Charts, Tailwind Dark Finance Theme; Python-Skripte für Historical Fetch und Tests.

## Quick Start
- Voraussetzungen: Node 22, npm, Python 3.11, `yfinance` (siehe `requirements.txt`), Finnhub/YF Zugangsdaten per `.env`.
- Install: `npm install` (Recharts via `--legacy-peer-deps` für React 19).
- Dev-Server: `npm run dev` → http://localhost:3000
- Backtests: 
  - Hybrid (aktuell): `SCORING_MODE=hybrid npx tsx scripts/backtesting/run-backtest.ts`
  - Momentum: `SCORING_MODE=momentum npx tsx scripts/backtesting/run-backtest.ts`
  - Ergebnisse liegen unter `data/backtesting/` (CSV + summary JSON). Kopien: `*-momentum.*`, `*-4pillar.*`
- Historische Daten laden: `python scripts/backtesting/fetch-historical.py russell2000_full` (1,944 Symbole; 51 fehlen aktuell).

## Backtesting Dashboard (/backtesting)
- Tabs für Modelle: Momentum-Only, Hybrid, 4-Pillar (Time-Series jetzt hinterlegt), plus Pending-Slots für Momentum+Market-Cap und Momentum+Vol-Cap.
- Parameter Controls (4-Pillar): Slider/Preset für Pillar-Gewichte, Universe-Auswahl (liest `config/universes/*.json`), Run-Button triggert `/api/backtest/run` mit `SCORING_MODE`/`CUSTOM_WEIGHTS`/`UNIVERSE`.
- Charts: Equity Curve und Drawdown (USD/EUR Umschaltbar, manueller EUR-Kurs), Strategy Comparison Tabelle (inkl. 4-Pillar, Hybrid, Momentum + Datei-Werte).
- Datenquellen: 
  - Momentum: `data/backtesting/backtest-summary-momentum.json` + `backtest-results-momentum.csv`
  - Hybrid: `data/backtesting/backtest-summary.json` + `backtest-results.csv`
  - 4-Pillar: aktuell identisch zum letzten Hybrid-Run, abgelegt als `backtest-summary-4pillar.json` + `backtest-results-4pillar.csv`

## Universes & Benchmarks
- Universe Files: `config/universes/*.json` (z.B. `sp500`, `nasdaq100`, `eurostoxx50`, `russell2000_full`, `russell2000` Sample). Benchmark wird aus der Datei gelesen (z.B. SPY, IWM).
- Auswahl: per Env `UNIVERSE`/`UNIVERSE_CONFIG` oder via UI-Select auf `/backtesting` (wirkt auf den Run-Trigger).
- Datenlücken: Beim Russell2000_full fehlen derzeit 51 Ticker (Download-Fehler). Momentum/Hybrid/4-Pillar Runs basieren auf 1,892/1,943 Symbolen.

## API Trigger
- Endpoint: `POST /api/backtest/run`
- Body: `{ strategy: 'hybrid' | 'momentum', weights: {valuation,quality,technical,risk}, universe: 'russell2000_full' }`
- Validierung: Weights müssen 100% summieren. Führt `npx tsx scripts/backtesting/run-backtest.ts` mit Env `SCORING_MODE`, `CUSTOM_WEIGHTS`, `UNIVERSE` aus und gibt das aktuelle `backtest-summary.json` zurück.

## Wichtige Dateien
- Dashboard: `src/app/backtesting/page.tsx`, Komponenten unter `src/app/backtesting/components/`
- Datenlader: `src/app/backtesting/utils/loadBacktestData.ts`
- Backtest-Skripte: `scripts/backtesting/run-backtest.ts`, `scripts/backtesting/fetch-historical.py`
- Strategy Comparison: `data/backtesting/strategy-comparison.json`

## Offene Punkte / ToDo
- Fehlende 51 Russell2000_full Ticker nachladen oder ausschließen.
- Eigener 4-Pillar-Run mit echter 4-Pillar-Logik (nicht nur Hybrid-Run-Kopie) und Zeitreihe ablegen.
- Pending Modelle rechnen: Momentum + Market-Cap-Filter (>500M), Momentum + Vol-Cap (<50%).
- README_no_push.md enthält das alte README (nicht pushen).
