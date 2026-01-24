#!/bin/bash
#
# Fetch company names for all universes missing name mappings
# Runtime: ~3-4 minutes total
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "🚀 Fetching company names for all universes..."
echo "Estimated time: 3-4 minutes"
echo ""

# Priority 1: FULL Universes (most important)
echo "📊 Priority 1: FULL Universes..."

echo "  [1/10] SP500 Full (501 symbols, ~75 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/sp500-full.json \
  data/universe_metadata/sp500-full_names.json

echo "  [2/10] FTSE 100 Full (100 symbols, ~15 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/ftse100_full.json \
  data/universe_metadata/ftse100_full_names.json

echo "  [3/10] Ibovespa Full (86 symbols, ~13 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/ibovespa_full.json \
  data/universe_metadata/ibovespa_full_names.json

echo "  [4/10] Shanghai Composite Full (60 symbols, ~9 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/shanghai_comp_full.json \
  data/universe_metadata/shanghai_comp_full_names.json

echo "  [5/10] Nikkei 225 Full (54 symbols, ~8 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/nikkei225_full.json \
  data/universe_metadata/nikkei225_full_names.json

echo "  [6/10] Euro Stoxx 50 Full (49 symbols, ~7 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/eurostoxx50_full.json \
  data/universe_metadata/eurostoxx50_full_names.json

echo "  [7/10] CAC 40 Full (40 symbols, ~6 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/cac40_full.json \
  data/universe_metadata/cac40_full_names.json

echo "  [8/10] DAX Full (40 symbols, ~6 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/dax_full.json \
  data/universe_metadata/dax_full_names.json

echo "  [9/10] Sensex Full (11 symbols, ~2 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/sensex_full.json \
  data/universe_metadata/sensex_full_names.json

echo "  [10/10] Russell 2000 50 Test (50 symbols, ~8 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/russell2000_50_test.json \
  data/universe_metadata/russell2000_50_test_names.json

# Priority 2: SAMPLE Universes
echo ""
echo "📈 Priority 2: SAMPLE Universes..."

echo "  [1/4] SP500 Sample (72 symbols, ~11 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/sp500.json \
  data/universe_metadata/sp500_names.json

echo "  [2/4] NASDAQ 100 (43 symbols, ~6 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/nasdaq100.json \
  data/universe_metadata/nasdaq100_names.json

echo "  [3/4] Russell 2000 Clean (34 symbols, ~5 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/russell2000.json \
  data/universe_metadata/russell2000_names.json

echo "  [4/4] Euro Stoxx 50 Sample (30 symbols, ~5 sec)..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/eurostoxx50.json \
  data/universe_metadata/eurostoxx50_names.json

# Priority 3: TEST/Seed Universes (optional - only 5 symbols each)
echo ""
echo "🧪 Priority 3: TEST/Seed Universes (optional)..."

echo "  [1/10] Test..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/test.json \
  data/universe_metadata/test_names.json

echo "  [2/10] CAC 40 Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/cac40.json \
  data/universe_metadata/cac40_names.json

echo "  [3/10] DAX Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/dax.json \
  data/universe_metadata/dax_names.json

echo "  [4/10] Euro Stoxx 50 Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/eurostoxx50_seed.json \
  data/universe_metadata/eurostoxx50_seed_names.json

echo "  [5/10] FTSE 100 Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/ftse100.json \
  data/universe_metadata/ftse100_names.json

echo "  [6/10] Ibovespa Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/ibovespa.json \
  data/universe_metadata/ibovespa_names.json

echo "  [7/10] Nikkei 225 Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/nikkei225.json \
  data/universe_metadata/nikkei225_names.json

echo "  [8/10] Sensex Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/sensex.json \
  data/universe_metadata/sensex_names.json

echo "  [9/10] Shanghai Composite Seed..."
python3 scripts/utils/fetch-yf-names.py \
  config/universes/shanghai_comp.json \
  data/universe_metadata/shanghai_comp_names.json

echo ""
echo "✅ Done! All company names fetched."
echo ""
echo "📊 Summary:"
echo "  - FULL Universes: 10 (1,041 symbols)"
echo "  - SAMPLE Universes: 4 (179 symbols)"
echo "  - TEST/Seed Universes: 10 (50 symbols)"
echo "  - TOTAL: 24 universes (~1,270 symbols)"
echo ""
echo "Files created in: data/universe_metadata/"
ls -lh data/universe_metadata/*_names.json | tail -24
