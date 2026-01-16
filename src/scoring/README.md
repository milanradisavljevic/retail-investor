# Stock Scoring System

Python-based stock scoring system for retail investors. Scores stocks based on Value, Quality, Risk, and Momentum factors using a two-stage Quality Gate → Composite Score approach.

## Features

- **Quality Gate**: Filters out unprofitable, cash-burning, or overleveraged stocks
- **Composite Scoring**: 0-100 score based on weighted subscores
- **Multiple Profiles**: Pure Value, Conservative, Balanced
- **Data Sufficiency Check**: Excludes stocks with >30% missing metrics
- **Deterministic Ranking**: Alphabetical tie-breaking, seed-based Pick of the Day

## Quick Start

```python
import os
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from data_py import FinnhubClient, SQLiteCache
from scoring import score_universe, rank_universe, format_ranking_summary

# Initialize
api_key = os.getenv("FINNHUB_API_KEY")
cache = SQLiteCache(db_path="data/cache/finnhub.db", ttl_hours=24)
client = FinnhubClient(api_key=api_key, cache=cache)

# Define universe (S&P 500 ranks 50-150)
universe_symbols = ["AAPL", "MSFT", "GOOGL", "AMZN", "META"]  # Example

# Fetch metrics for universe
universe_data = []
for symbol in universe_symbols:
    try:
        financials = client.get_basic_financials(symbol)
        metrics = financials.get("metric", {})
        metrics["symbol"] = symbol
        universe_data.append(metrics)
    except Exception as e:
        print(f"Error fetching {symbol}: {e}")

# Score universe
scored = score_universe(
    universe_data,
    finnhub_client=client,
    profile="pure_value"  # or "conservative", "balanced"
)

# Rank results
ranking = rank_universe(scored, seed=20250110)

# Display results
print(format_ranking_summary(ranking))

# Access specific results
print(f"\nPick of the Day: {ranking['pick_of_day']['symbol']}")
print(f"Top 5: {[s['symbol'] for s in ranking['top_5']]}")

# Cleanup
client.close()
```

## Scoring Methodology

### Stage 1: Quality Gate

Stocks must pass all three checks:

1. **Profitability**: ROA > 0
2. **Cash Flow**: Free Cash Flow > 0
3. **Leverage**: Debt/Equity < 3.0

### Stage 2: Composite Score

**Value Score (0-100)**
- 50% EV/EBITDA (inverse percentile)
- 30% FCF Yield (percentile)
- 20% P/B Ratio (inverse percentile)

**Quality Score (0-100)**
- 50% ROIC (percentile)
- 50% Gross Margin (percentile)

**Risk Score (0-100)**
- 100% Beta (inverted percentile - lower beta = higher score)

**Momentum Score (0-100)** - Stub in MVP
- 60% Price vs SMA200 (percentile)
- 40% 12M-1M Return (percentile)

**Composite Score**

Pure Value profile:
```
Composite = 0.50 × Value + 0.30 × Quality + 0.20 × Risk + 0.00 × Momentum
```

## Weight Profiles

```python
from scoring.config import WEIGHT_PROFILES

# Available profiles
WEIGHT_PROFILES = {
    "pure_value": {
        "value": 0.50,
        "quality": 0.30,
        "risk": 0.20,
        "momentum": 0.00
    },
    "conservative": {
        "value": 0.40,
        "quality": 0.30,
        "risk": 0.20,
        "momentum": 0.10
    },
    "balanced": {
        "value": 0.35,
        "quality": 0.30,
        "risk": 0.20,
        "momentum": 0.15
    }
}
```

## Advanced Usage

### Score Individual Stock

```python
from scoring import score_symbol

# Prepare data
symbol = "AAPL"
metrics = client.get_basic_financials(symbol).get("metric", {})
universe_metrics = [...]  # All stocks in universe

# Score
result = score_symbol(
    symbol=symbol,
    metrics=metrics,
    universe_metrics=universe_metrics,
    profile="pure_value"
)

if result:
    print(f"{symbol}: {result['composite_score']:.2f}")
    print(f"  Value: {result['subscores']['value']:.2f}")
    print(f"  Quality: {result['subscores']['quality']:.2f}")
    print(f"  Risk: {result['subscores']['risk']:.2f}")
else:
    print(f"{symbol}: Excluded from scoring")
```

### Check Quality Gate

```python
from scoring import should_score_symbol, passes_quality_gate

metrics = {...}

# Full check (quality gate + data sufficiency)
should_score, reason = should_score_symbol(metrics)
print(f"Should score: {should_score}, Reason: {reason}")

# Quality gate only
passes, flags = passes_quality_gate(metrics)
print(f"Passes: {passes}, Flags: {flags}")
```

### Cache Management

```python
from data_py import SQLiteCache

cache = SQLiteCache(db_path="data/cache/finnhub.db", ttl_hours=24)

# Get stats
stats = cache.get_stats()
print(f"Cached symbols: {stats['symbols_cached']}")
print(f"Valid entries: {stats['valid_entries']}")

# Clear expired
cache.clear_expired()

# Clear specific symbol
cache.clear_symbol("AAPL")

# Clear all
cache.clear_all()
```

## Testing

Run unit tests:

```bash
cd /path/to/privatinvestor-mvp
python -m pytest tests/test_scoring.py -v
```

Or with unittest:

```bash
python tests/test_scoring.py
```

## Data Requirements

### Required Finnhub Metrics

- `beta` - Market beta
- `roic` - Return on Invested Capital
- `grossMargin` - Gross profit margin
- `enterpriseValueOverEBITDA` - EV/EBITDA ratio
- `freeCashFlow` - Free cash flow
- `priceBookMrq` - Price-to-Book ratio
- `marketCapitalization` - Market cap
- `totalDebt` - Total debt
- `totalEquity` - Total equity
- `roa` - Return on Assets

### Missing Data Policy

Stocks are excluded if >30% of required metrics are missing.

## Logging

Configure logging in your application:

```python
import logging

logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","msg":"%(message)s"}',
    datefmt='%Y-%m-%dT%H:%M:%S'
)
```

## Architecture

```
src/
├── scoring/
│   ├── __init__.py           # Public API
│   ├── config.py             # Configuration & weights
│   ├── quality_gate.py       # Quality gate checks
│   ├── composite.py          # Composite scoring
│   ├── ranking.py            # Universe ranking
│   └── subscores/
│       ├── __init__.py       # Percentile rank utility
│       ├── value.py          # Value score
│       ├── quality.py        # Quality score
│       ├── risk.py           # Risk score
│       └── momentum.py       # Momentum score (stub)
└── data_py/
    ├── __init__.py
    ├── finnhub_client.py     # Finnhub API client
    └── cache.py              # SQLite cache
```

## Constraints

- Python 3.11+
- Type hints throughout
- No external dependencies except: requests, sqlite3 (stdlib)
- Rate limiting: 60 req/min (Finnhub free tier)
- Cache TTL: 24 hours default

## Future Enhancements

- [ ] Implement full momentum score with historical prices
- [ ] Add technical indicators (RSI, MACD)
- [ ] Support custom weight profiles
- [ ] Add backtesting capabilities
- [ ] Export to JSON/CSV

## License

See project root LICENSE file.
