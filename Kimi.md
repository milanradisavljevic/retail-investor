# Kimi.md

This file provides guidance to Kimi Code CLI when working with code in this repository.

## Project Overview

Retail Investor MVP is a small-cap stock scoring and backtesting toolkit built with Next.js 16 (App Router), TypeScript, and Python. It scores stocks using a multi-pillar approach (Valuation, Quality, Technical, Risk) without LLM components in the scoring logic.

**Collaboration Note:** I work together with Codex, Claude, Qwen, and Gemini on this project.

## Essential Commands

### Development
```bash
npm install --legacy-peer-deps  # Required for Recharts with React 19
npm run dev                      # Start dev server at http://localhost:3000
npm run build                    # Production build
npm start                        # Start production server
```

### Testing
```bash
npm test                         # Run all Vitest tests
npm run test:ui                  # Run Vitest with UI
npm run test:golden              # Run golden tests only
```

### Scoring & Runs
```bash
npm run run:daily                # Full 4-Pillar scoring run
npm run run:daily -- --universe=russell2000_full
```

### Backtesting
```bash
npm run backtest                 # Complete backtest (fetch + run)
npm run backtest:momentum        # Momentum-only strategy
npm run backtest:hybrid          # Hybrid strategy

# Fetch historical data (Python)
python scripts/backtesting/fetch-historical.py russell2000_full
```

## Project Structure

- `src/app/` - Next.js App Router pages
- `src/scoring/` - Stock scoring engine (fundamental.ts, technical.ts, engine.ts)
- `src/providers/` - Market data providers (YFinance, Finnhub)
- `scripts/` - TypeScript and Python utilities
- `config/universes/` - Universe definitions (JSON)
- `data/` - Cached runs and backtest outputs

## Key Architecture Points

### Scoring Flow
1. `scripts/run_daily.ts` entry point
2. `scoring/engine.ts` orchestrates data fetching and scoring
3. 4 Pillars: Valuation, Quality, Technical, Risk
4. Output: `data/runs/<run_id>.json`

### Backtest Flow
1. `fetch-historical.py` downloads OHLCV data
2. `run-backtest.ts` simulates quarterly rebalancing
3. Output: `data/backtesting/backtest-results-*.csv`

### Configuration
- `config/scoring.json` - Pillar weights and pipeline limits
- `config/universes/*.json` - Stock universes
- `.env.local` - API keys (Finnhub)

## Important Rules

1. **After every change:** Add an entry to `CHANGELOG.md` clearly stating that **Kimi** made the change
2. **Minimal changes:** Make only the necessary changes to achieve the goal
3. **Follow existing patterns:** Match the coding style of the surrounding code
4. **No git mutations:** Do not run `git commit`, `git push`, etc. unless explicitly asked

## Technology Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS, Recharts
- **Backend:** Node.js 22, Python 3.11+
- **Data:** yfinance, Finnhub API, SQLite
- **Testing:** Vitest, ESLint

## Environment Variables

- `FINNHUB_API_KEY` - Required for Finnhub provider
- `UNIVERSE` - Universe to score (e.g., `russell2000_full`)
- `SCORING_MODE` - `momentum`, `hybrid`, or `4pillar`
- `CUSTOM_WEIGHTS` - JSON string for custom pillar weights
