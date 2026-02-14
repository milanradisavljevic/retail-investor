#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

mapfile -t UNIVERSES < <(
  node -e "const index=require('./config/universes/index.json'); console.log(Object.values(index.universes).flat().map((u)=>u.id).join('\n'));"
)

if [[ ${#UNIVERSES[@]} -eq 0 ]]; then
  echo "[ERROR] No universes found in config/universes/index.json"
  exit 1
fi

echo "============================================================"
echo "Backtest Fetch: All Universes"
echo "Mode: $([[ $DRY_RUN -eq 1 ]] && echo 'dry-run' || echo 'execute')"
echo "Universes: ${#UNIVERSES[@]}"
echo "============================================================"

for i in "${!UNIVERSES[@]}"; do
  UNIVERSE="${UNIVERSES[$i]}"
  echo
  echo "[$((i + 1))/${#UNIVERSES[@]}] ${UNIVERSE}"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "  python scripts/backtesting/fetch-historical.py ${UNIVERSE}"
    continue
  fi

  python scripts/backtesting/fetch-historical.py "${UNIVERSE}"
done

echo
echo "[OK] Finished fetching historical data for all universes."
