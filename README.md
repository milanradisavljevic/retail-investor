# Retail Investor MVP

Deterministic stock briefings, strategy lab, and live run tracking for retail investors. Built with Next.js + TypeScript, offline-first data, and a dark finance UI.

![Process Overview](latest%20screenshots/BPMN.png)
![Dashboard](latest%20screenshots/Screenshot%202026-01-28%20at%2016-26-30%20Privatinvestor%20MVP.png)
![Briefing](latest%20screenshots/Screenshot%202026-01-28%20at%2016-26-41%20Privatinvestor%20MVP.png)

## What this project is
A quantitative scoring and backtesting toolkit that produces investor-friendly briefings. We score every stock on four pillars (Valuation, Quality, Technical, Risk), backtest the strategies, and stream real-time progress while runs are executing—no guesswork, no LLMs in the scoring path.

## What’s ready today
- **Stock Briefing pages** (symbol view): score forensics, performance timeline, peer comparison, and price target with confidence bands.
- **Strategy Lab**: pick universe/preset or customize weights; live **Run Progress Indicator** (SSE) shows phases, ETA, cache hit rate, failures, and current symbol.
- **Performance Tracker**: instruments every run; bottlenecks and stats stored under `data/performance/*.json`.
- **Offline names + data**: company names cached from run data; universes live in `config/universes/*.json`.
- **Backtesting dashboards**: equity/drawdown/comparison charts for Hybrid/Momentum/4-Pillar modes.
- **CLI + scripts**: daily run, backtests, stress tests, and score comparison automation.

## Quick start
```bash
npm install --legacy-peer-deps     # Node 22, React 19
npm run dev                        # http://localhost:3000

# Daily scoring run (writes data/runs/<timestamp>.json)
npm run run:daily

# Compare before/after score impact
npm run compare-scores data/runs/<before>.json data/runs/<after>.json
```

## How the scoring works (simple version)
We rank stocks 0–100 using four pillars:
- **Valuation** (P/E, P/B, P/S), **Quality** (ROE, Debt/Equity), **Technical** (trend + momentum), **Risk** (volatility + leverage).
- Each metric is scaled between a “good” and “bad” range; missing data falls back to medians or neutral 50.
- Pillars average their metrics; total score = weighted sum (defaults 25% each, editable in Strategy Lab).
- Price target: sector medians + stock scores → fair-value range, upside %, confidence tag.

Key ranges (from `src/scoring/scoring_config.ts`):
- P/E good ≤15, bad ≥30; P/B good ≤1.5, bad ≥5; P/S good ≤1, bad ≥5
- ROE good ≥35%, bad ≤8%; Debt/Equity good ≤0.2, bad ≥1.5

## Product tour
- **Briefing (/briefing/[symbol])**: narrative-free, data-first view with peers, timelines, and targets.
- **Strategy Lab (/strategy-lab)**: presets (Rocket, Deep Value, Balanced, Quality, Risk-Aware) or manual sliders; live progress while runs execute; auto-refresh on completion.
- **Backtesting (/backtesting)**: Hybrid, Momentum, and 4-Pillar runs with equity/drawdown charts and comparison tables.
- **Performance (/performance)**: phase-level timings, cache hit rates, and bottleneck flags.

## Data & universes
- Universe definitions: `config/universes/*.json` (S&P 500 full, Russell 2000 full, Nasdaq100, EuroStoxx50, samples, test).
- Historical CSVs via `python scripts/backtesting/fetch-historical.py <universe>` (2015–2025 window).
- Runs emitted to `data/runs/`; performance logs in `data/performance/`.

## Ops & scripts (highlights)
- `npm run run:daily` — full scoring pipeline.
- `npm run backtest` — fetch + run backtests (Hybrid default). Variants: `backtest:momentum`, `backtest:hybrid`.
- `npm run stress-test` — provider latency/error check.
- `npm run compare-scores <before> <after>` — new tool to measure score deltas and significance.
- `npm run perf:report` — summarize performance tracker outputs.

## Why this matters
- **Deterministic**: same inputs → same outputs; great for auditing and regression checks.
- **Transparent**: live progress, cache hit rates, and per-phase timings—no black boxes.
- **Offline-first**: after fetching data once, runs and UI stay local.
- **Retail-friendly**: briefings explain score drivers without jargon or hallucinations.

## Contributing & standards
- TypeScript strict, no `any`; Tailwind dark finance theme; keep UI components pure and data fetching in server components.
- Feature flags/env for optional behavior; avoid breaking existing pipelines.
- Work with Gemini, Claude, Qwen, and Codex—document changes in `CHANGELOG.md` with author attribution.

## Screenshots
- Process overview: `latest screenshots/BPMN.png`
- Dashboard: `latest screenshots/Screenshot 2026-01-28 at 16-26-30 Privatinvestor MVP.png`
- Briefing: `latest screenshots/Screenshot 2026-01-28 at 16-26-41 Privatinvestor MVP.png`
