#!/usr/bin/env bash
# Run ETL for all production universes EXCEPT Russell 2000 (to save time).
# Usage: ./scripts/utils/run_etl_without_russell.sh

set -euo pipefail

ETL="python scripts/etl/daily_data_pipeline.py"
DB="data/market-data.db"
START="2014-01-01"
END="$(date +%Y-%m-%d)"
SLEEP="${SLEEP:-0.1}" # polite throttle; set SLEEP=0 for maximum speed
YF_CACHE_DIR="${YF_CACHE_DIR:-.cache/yfinance}"
LOG_DIR="logs/etl"

mkdir -p "$LOG_DIR"
export YF_CACHE_DIR

UNIVERSES=(
  sp500-full
  nasdaq100-full
  dax40-full
  cac40-full
  eurostoxx50-full
  ftse100-full
  nikkei225_full
  sensex_full
  ibovespa_full
  shanghai_comp_full
)

for U in "${UNIVERSES[@]}"; do
  echo "=== ETL for $U ==="
  LOG_FILE="${LOG_DIR}/${U}_$(date +%Y%m%d_%H%M%S).log"
  if $ETL --universe "$U" --db-path "$DB" --start "$START" --end "$END" --sleep "$SLEEP" > "$LOG_FILE" 2>&1; then
    echo "✓ Done: $U (log: $LOG_FILE)"
  else
    echo "✗ Failed: $U (see log: $LOG_FILE)"
  fi
done
