# Retail Investor MVP
<img width="937" height="1267" alt="Bildschirmfoto_20260117_202304" src="https://github.com/user-attachments/assets/d001304d-1d40-442b-a708-c88b73d3fdbf" />
<img width="910" h<img width="931" height="1254" alt="Bildschirmfoto_20260117_202226" src="https://github.com/user-attachments/assets/834b257a-061e-4557-9adc-4d6570b201c0" />

Small-cap scoring and backtesting toolkit (Next.js + TypeScript + Python) with offline-friendly data pulls and a dark finance dashboard.

## Für Endanwender (Kurzfassung)
- Universes wählen, Scores berechnen, Backtests ansehen (Equity/Drawdown/Comparison).
- Daten lokal: yfinance Fetcher (2015–2025), aktuell S&P 500 Full 490/501, Russell 2000 Full 1941/1943 CSVs.
- Scoring-Modi: Hybrid, Momentum, 4-Pillar (gewichtbar via UI/CLI).
- Strategie-Lab UI: Universe/Preset Auswahl, Runtime-Anzeige, Region/Flaggen.
- Läuft offline nach Daten-Fetch; keine LLMs im Scoring-Pfad.

## Was das Projekt macht
- Bewertet Aktien deterministisch: Fundamentals + Technicals → Pillar-Scores + Gesamtscore (Momentum/Hybrid/4-Pillar), keine LLM-Komponenten im Scoring.
- Universes wählbar: Packs unter `config/universes/*.json` (SP500, Nasdaq100, EuroStoxx50 Samples, Russell2000_full), Benchmark pro Pack; Fetcher lädt YF-Daten lokal.
- Analystenfelder: yfinance-Bridge zieht Konsens-Targets (Mean/Low/High), Analystenanzahl, nächste Earnings; fehlen die Daten, fallen sie auf `null`.
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
- Historische Daten laden: `python scripts/backtesting/fetch-historical.py russell2000_full` (1,944 Symbole; 2 fehlen aktuell) oder `... sp500-full` (11 fehlen aktuell). Zeitraum: 2015-01-01 bis 2025-12-31.

## Backtesting Dashboard (/backtesting)
- Tabs für Modelle: Momentum-Only, Hybrid, 4-Pillar (Time-Series jetzt hinterlegt), plus Pending-Slots für Momentum+Market-Cap und Momentum+Vol-Cap.
- Parameter Controls (4-Pillar): Slider/Preset für Pillar-Gewichte, Universe-Auswahl (liest `config/universes/*.json`), Run-Button triggert `/api/backtest/run` mit `SCORING_MODE`/`CUSTOM_WEIGHTS`/`UNIVERSE`.
- Charts: Equity Curve und Drawdown (USD/EUR Umschaltbar, manueller EUR-Kurs), Strategy Comparison Tabelle (inkl. 4-Pillar, Hybrid, Momentum + Datei-Werte).
- Datenquellen: 
  - Momentum: `data/backtesting/backtest-summary-momentum.json` + `backtest-results-momentum.csv`
  - Hybrid: `data/backtesting/backtest-summary.json` + `backtest-results.csv`
  - 4-Pillar: aktuell identisch zum letzten Hybrid-Run, abgelegt als `backtest-summary-4pillar.json` + `backtest-results-4pillar.csv`

## Runs & Skripte
- `npm run run:daily` (`scripts/run_daily.ts`): kompletter 4-Pillar-Scoring-Run inkl. Fair-Value/Price-Target, schreibt `data/runs/<run>.json` (+ LLM-Output) und kappt die Pipeline bei 150 Symbols (`top_k`/`max_symbols_per_run`).
- Monte Carlo Lite: wird in `run:daily` für Top 30 mit `requires_deep_analysis=true` angestoßen (Python CLI, Finnhub-Dependence für Revenue/Series). Falls Fundamentals fehlen, wird die Monte-Carlo-Komponente übersprungen; Price-Target bleibt gültig.
- Test-Run mit 50 Small Caps (yfinance): `TSX_DISABLE_RPC=1 UNIVERSE=russell2000_50_test npm run run:daily -- --universe=russell2000_50_test` (benutzt Name-Map `russell_2000_50_test_names.json`).
- Backtests (`scripts/backtesting`): `npm run backtest` (fetch + run), `backtest:momentum|hybrid` (nur Run), Universe per Env/Argument (`UNIVERSE` oder CLI `russell2000`/`nasdaq100`); Strategie: Quarterly Rebalance Top 10 nach Score.
- Performance-Checks: `npm run stress-test` (Provider-Latency/Error-Check, Universe `config/universes/sp500-full.json`, optional `--symbols`/`--provider`).
- Diagnose: `scripts/debug-fair-value.ts` (Fair-Value/Median), `scripts/debug-quality-100.ts` (Fundamentals/Quality), `scripts/audit-value.ts` (liest letzten Run und Coverage).
- Universes (`config/universes/*.json`): Samples `sp500` (72), `nasdaq100` (43), `eurostoxx50` (30), `russell2000` (34), Full `sp500-full` (501), `russell2000_full` (1.943), `test` (5); Default ohne Env: `config/universe.json` (15) oder `config/universes/test.json`.

## Universes & Benchmarks
- Universe Files: `config/universes/*.json` (z.B. `sp500`, `nasdaq100`, `eurostoxx50`, `russell2000_full`, `russell2000` Sample). Benchmark wird aus der Datei gelesen (z.B. SPY, IWM).
- Auswahl: per Env `UNIVERSE`/`UNIVERSE_CONFIG` oder via UI-Select auf `/backtesting` (wirkt auf den Run-Trigger).
- Datenlücken: S&P 500 Full fehlen 11 CSVs (ABMD, ANSS, CTLT, DFS, HES, JNPR, MRO, PARA, PXD, WBA, WRK). Russell2000_full fehlen 2 CSVs (AKE, THRD).

## API Trigger
- Endpoint: `POST /api/backtest/run`
- Body: `{ strategy: 'hybrid' | 'momentum', weights: {valuation,quality,technical,risk}, universe: 'russell2000_full' }`
- Validierung: Weights müssen 100% summieren. Führt `npx tsx scripts/backtesting/run-backtest.ts` mit Env `SCORING_MODE`, `CUSTOM_WEIGHTS`, `UNIVERSE` aus und gibt das aktuelle `backtest-summary.json` zurück.

## Wichtige Dateien
- Dashboard: `src/app/backtesting/page.tsx`, Komponenten unter `src/app/backtesting/components/`
- Datenlader: `src/app/backtesting/utils/loadBacktestData.ts`
- Backtest-Skripte: `scripts/backtesting/run-backtest.ts`, `scripts/backtesting/fetch-historical.py`
- Strategy Comparison: `data/backtesting/strategy-comparison.json`
- Universum-Filter: `src/backtesting/filters/universeFilter.ts` (MarketCap/Preis/Volumen/Crypto/Meme + Blacklist Defaults)
- Analystendaten (yfinance): `src/data_py/yfinance_adapter.py` + `src/providers/yfinance_provider.ts`

## Offene Punkte / ToDo
- Fehlende 51 Russell2000_full Ticker nachladen oder ausschließen.
- Monte Carlo deterministischer machen (Seed/Assumptions loggen) und optional per Feature-Flag deaktivierbar für Full-Runs.
- Eigener 4-Pillar-Run mit echter 4-Pillar-Logik (nicht nur Hybrid-Run-Kopie) und Zeitreihe ablegen.
- Pending Modelle rechnen: Momentum + Market-Cap-Filter (>500M), Momentum + Vol-Cap (<50%).
- README_no_push.md enthält das alte README (nicht pushen).
