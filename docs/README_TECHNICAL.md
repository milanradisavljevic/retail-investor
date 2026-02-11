# Technical README

Dieses Dokument ist fuer Engineering, Quant-Research und Audit.

## Architektur in Kurzform

- Frontend/API: Next.js App Router in `src/app`.
- Scoring-Kern: `src/scoring`.
- Regime-Engine: `src/regime`.
- Backtest-Orchestrierung: `scripts/backtesting/run-backtest.ts`.
- ETL: `scripts/etl`.
- Konfiguration: `config/presets`, `config/universes`.
- Datenhaltung: SQLite (`data/privatinvestor.db`, `data/market-data.db`).

## Wichtige Flows

1. ETL schreibt Markt- und Makrodaten in SQLite.
2. Scoring liest Fundamentals/Technicals und berechnet Pillar Scores.
3. Preset-Filter und Gewichte bestimmen Ranking und Selektion.
4. Backtest rebalanced periodisch und berechnet Performance/Metriken.
5. Optionales Regime-Overlay passt Gewichtung und Investitionsquote an.

## Doku-Set

- Detail-Formeln: `docs/CALCULATION_REFERENCE.md`
- Formale LaTeX-Fassung: `docs/CALCULATION_REFERENCE.tex`
- Woechentlicher Technik-Auszug: `docs/TECHNICAL_WEEKLY.md`

## Weekly Update aus Changelog erzeugen

```bash
npm run docs:weekly
```

Optionaler Zeitraum:

```bash
npx tsx scripts/docs/generate-technical-weekly.ts --days=14
```

LaTeX/PDF lokal bauen:

```bash
npm run docs:latex
npm run docs:investor
```

## Relevante Checks

```bash
npx tsc --noEmit
npm test
npm run lint
```

## Zusammenarbeit

Im Projekt arbeiten mehrere Agents zusammen: Codex, Gemini, Claude, Qwen.
