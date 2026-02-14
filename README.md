# INTRINSIC

**Quantitative Stock Analysis Platform — Evidence-Based Strategy Recommendations**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-yellow)](https://www.python.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Node](https://img.shields.io/badge/Node-22+-brightgreen)](https://nodejs.org/)

---

## What is INTRINSIC?

INTRINSIC is a quantitative stock analysis platform for retail investors who want evidence-based investment decisions without black-box algorithms. It combines a 4-pillar scoring engine (Valuation, Quality, Technical, Risk) with preset investment strategies and regime-aware market timing.

- **Transparent Scoring**: All formulas documented, all weights configurable
- **Backtested Strategies**: 7+ presets with 10-year historical validation (2015-2025)
- **Regime Detection**: Rule-based market timing using FRED macro indicators
- **Multi-Universe**: US (Russell 2000, S&P 500, NASDAQ 100) + European indices (DAX 40, CAC 40, FTSE 100, EURO STOXX 50)

---

## Product Screenshots

![Strategy Lab](latest%20screenshots/Screenshot%202026-02-11%20at%2019-42-29%20Intrinsic%20%E2%80%93%20Deterministic%20Stock%20Analysis.png)

| Stock Analysis | Backtest Results |
|:---:|:---:|
| ![Stock Detail](latest%20screenshots/Screenshot%202026-02-11%20at%2019-43-00%20Intrinsic%20%E2%80%93%20Deterministic%20Stock%20Analysis.png) | ![Backtest](latest%20screenshots/Screenshot%202026-02-11%20at%2019-43-17%20Intrinsic%20%E2%80%93%20Deterministic%20Stock%20Analysis.png) |

| Portfolio (Diversification + Score Breakdown) | Macro Context (Heatmap + Rates) |
|:---:|:---:|
| ![Portfolio](latest%20screenshots/Screenshot%202026-02-14%20at%2018-12-48%20Portfolio%20Intrinsic.png) | ![Macro Context](latest%20screenshots/Screenshot%202026-02-14%20at%2018-13-01%20Macro%20Context%20Intrinsic.png) |

![Homepage Overview (Market Context + Earnings Widget)](latest%20screenshots/Screenshot%202026-02-14%20at%2018-13-18%20Intrinsic%20%E2%80%93%20Deterministic%20Stock%20Analysis.png)

![Health Dashboard](latest%20screenshots/Screenshot%202026-02-13%20at%2017-32-27%20Intrinsic%20%E2%80%93%20Deterministic%20Stock%20Analysis.png)

---

## Key Features

| Feature | Description |
|---------|-------------|
| **7+ Investment Strategies** | Deep Value, Compounder, GARP, Dividend Quality, Shield, Piotroski F-Score, Magic Formula |
| **Tier System** | Validated (backtested) vs Experimental (in development) |
| **Regime Detection** | RISK_ON / NEUTRAL / RISK_OFF / CRISIS based on VIX, Yield Curve, Fed Rate, CPI |
| **Backtesting 2015-2025** | Full 10-year backtests with quarterly rebalancing |
| **Regime Overlay** | Optional market-timing layer (+23pp for Quality strategies) |
| **Multi-Universe** | Russell 2000, S&P 500, NASDAQ 100, DAX 40, CAC 40, FTSE 100, EURO STOXX 50 |
| **FRED Integration** | Daily VIX, Yield Curve, Fed Rate, CPI from Federal Reserve |
| **Dark Finance Dashboard** | Professional UI with Recharts visualizations |
| **No Cloud Dependency** | Runs 100% locally with SQLite databases |

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/your-org/intrinsic.git
cd intrinsic
npm install --legacy-peer-deps

# Configure environment
cp .env.example .env.local
# Edit .env.local and add your API keys

# Start development server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

### Prerequisites

- **Node.js 22+** (for Next.js 14 App Router)
- **Python 3.11+** (for ETL pipelines and Monte Carlo)
- **FRED API Key** (free at [fred.stlouisfed.org](https://fred.stlouisfed.org/docs/api/api_key.html))

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      INTRINSIC Architecture                  │
├─────────────────────────────────────────────────────────────┤
│  Frontend (Next.js 14 App Router)                           │
│  ├── Dashboard / Strategy Lab / Stock Detail                │
│  ├── Recharts Visualizations                                │
│  └── Tailwind CSS Dark Theme                                │
├─────────────────────────────────────────────────────────────┤
│  Scoring Engine (TypeScript)                                │
│  ├── 4-Pillar Model: Valuation, Quality, Technical, Risk   │
│  ├── Preset System with Tier Classification                 │
│  └── Price Target Calculator                                │
├─────────────────────────────────────────────────────────────┤
│  Regime Detection (TypeScript)                              │
│  ├── VIX, Yield Curve, Fed Rate, CPI Signals               │
│  ├── RISK_ON / NEUTRAL / RISK_OFF / CRISIS Labels          │
│  └── Historical Regime History (2015-present)              │
├─────────────────────────────────────────────────────────────┤
│  Data Layer                                                  │
│  ├── SQLite: privatinvestor.db (scores, runs, FRED)        │
│  ├── SQLite: market-data.db (prices, fundamentals)         │
│  ├── FRED API (daily macro indicators)                      │
│  └── yfinance (Python bridge for price data)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Available Strategies

| Strategy | Tier | Philosophy | R2000 Return (2015-25) | Regime Overlay |
|----------|------|------------|------------------------|----------------|
| **Deep Value** | Validated | Graham-style, Margin of Safety | -10.79% | Not Recommended |
| **Compounder** | Validated | Buffett-style, Quality + Growth | 46.49% → **69.72%** | Recommended (+23pp) |
| **GARP** | Validated | PEG-filtered Growth at Reasonable Price | 57.56% | Not Recommended |
| **Dividend Quality** | Experimental | High-Yield with Quality Filters | -10.78% → 2.92% | Recommended (+14pp) |
| **Shield** | Validated | Low-Volatility Defensive | -25.55% → -22.27% | Recommended (+3pp) |
| **Piotroski F-Score** | Experimental | High F-Score Value Stocks | TBD | Not Recommended |
| **Magic Formula** | Experimental | Greenblatt ROC + Earnings Yield | TBD | Not Recommended |

**Key Insight**: Regime Overlay helps Quality strategies (+23pp for Compounder) but can harm in strong bull markets (NDX100: -100pp for Compounder with overlay).

---

## Regime Detection

INTRINSIC uses a rule-based 4-regime system based on macro indicators:

| Regime | Conditions | Portfolio Implication |
|--------|------------|----------------------|
| **RISK_ON** | VIX < 15, Yield Curve > 1.5%, Fed cuts | Full exposure, growth bias |
| **NEUTRAL** | Mixed signals | Standard allocation |
| **RISK_OFF** | VIX > 25, Yield Curve inverted | Reduced exposure, quality bias |
| **CRISIS** | VIX > 40 (override) | Defensive, high cash |

### Macro Indicators (FRED)

- **VIXCLS**: CBOE Volatility Index (daily)
- **T10Y2Y**: 10Y-2Y Treasury Spread (daily)
- **DGS10**: 10-Year Treasury Yield (daily)
- **FEDFUNDS**: Federal Funds Rate (monthly)
- **CPIAUCSL**: Consumer Price Index (monthly)

---

## Project Structure

```
src/
├── app/                    # Next.js 14 App Router
│   ├── components/         # Shared UI components
│   ├── strategy-lab/       # Strategy Lab page
│   ├── stock/[symbol]/     # Stock detail pages
│   └── api/                # API routes
├── scoring/                # 4-Pillar Scoring Engine
│   ├── fundamental.ts      # Valuation + Quality scores
│   ├── technical.ts        # Technical + Momentum scores
│   ├── price-target.ts     # Fair value calculator
│   └── formulas/           # PEG, DCF, Monte Carlo
├── regime/                 # Regime Detection
│   ├── engine.ts           # Detection logic
│   └── history.ts          # Historical computation
├── data/                   # Database + Migrations
│   ├── db.ts               # SQLite connection
│   ├── macro-db.ts         # FRED data reader
│   └── migrations/         # Schema migrations
├── providers/              # Market Data Providers
│   └── yfinance_batch_provider.ts
└── lib/                    # Shared utilities

config/
├── presets/                # Strategy presets (JSON)
│   ├── deep_value.json
│   ├── compounder.json
│   └── ...
├── universes/              # Universe definitions
│   ├── russell2000_full.json
│   ├── nasdaq100-full.json
│   └── ...
└── company_names.json      # Symbol to company mapping

scripts/
├── etl/                    # Python ETL pipelines
│   ├── daily_data_pipeline.py
│   └── fetch_fred.py
├── backtesting/            # TypeScript backtest runner
│   └── run-backtest.ts
└── docs/                   # Documentation generators

data/
├── privatinvestor.db       # Scores, runs, FRED data
├── market-data.db          # Prices, fundamentals
└── runs/                   # Historical run JSONs
```

---

## Development

### Run Backtests

```bash
# Run specific preset on Russell 2000
npm run backtest -- --preset compounder --universe russell2000_full

# With regime overlay
REGIME_OVERLAY=true npm run backtest -- --preset compounder

# NASDAQ 100
npm run backtest:nasdaq100
```

### Update FRED Data

```bash
python scripts/etl/fetch_fred.py
```

### Run Daily ETL

```bash
npm run run:daily -- --universe russell2000_full
```

### Run Tests

```bash
npm test                    # Vitest unit tests
npm run test:golden         # Golden path tests
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FRED_API_KEY` | Yes | FRED API key (free) |
| `FINNHUB_API_KEY` | No | Finnhub API key (optional) |
| `MARKET_DATA_PROVIDER` | No | Provider: `yfinance` (default) or `finnhub` |
| `ENABLE_LLM` | No | Enable LLM features (default: false) |
| `LOG_LEVEL` | No | Log level: `debug`, `info`, `warn`, `error` |

---

## Transparency Links

| Document | Description |
|----------|-------------|
| [Calculation Reference](docs/CALCULATION_REFERENCE.md) | All formulas in readable format |
| [LaTeX Formulas](docs/CALCULATION_REFERENCE.tex) | Formal mathematical notation |
| [Technical README](docs/README_TECHNICAL.md) | Developer documentation |
| [Technical Decisions](docs/DECISIONS.md) | Architecture decisions |
| [Weekly Tech Digest](docs/TECHNICAL_WEEKLY.md) | Auto-generated changelog |

---

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1a** | 4-Pillar Scoring, Presets, Backtesting | Complete |
| **Phase 1b** | FRED Integration, Regime Detection | Complete |
| **Phase 1c** | FMP Integration (institutional fundamentals) | Planned |
| **Phase 2** | Strategy Lab UI, Watchlist, Settings | In Progress |
| **Phase 3** | Live Trading Signals, Alerts | Planned |
| **Phase 4** | Multi-Asset (Bonds, Commodities) | Planned |

---

## Disclaimer

INTRINSIC is a research and analysis tool, not investment advice. All backtested results are hypothetical and do not guarantee future performance. Past returns are not indicative of future results. Always do your own research before making investment decisions.

---

## License

MIT License — see [LICENSE](LICENSE) for details.
