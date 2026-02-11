#!/bin/bash
# ETL Batch Runner for FULL Universes
# Iterates over all FULL universes and runs the ETL pipeline
# Usage: ./scripts/utils/run_etl_for_universes.sh [--universe <id>] [--dry-run]

set -e

# Configuration
UNIVERSES_LIST="docs/universes_full_list.json"
ETL_SCRIPT="scripts/etl/daily_data_pipeline.py"
LOG_DIR="logs/etl"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Parse arguments
DRY_RUN=false
TARGET_UNIVERSE=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --universe)
      TARGET_UNIVERSE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Create log directory
mkdir -p "$LOG_DIR"

# Load universes
if [ ! -f "$UNIVERSES_LIST" ]; then
  echo "ERROR: Universes list not found at $UNIVERSES_LIST"
  echo "Run: python3 -c 'import json; from pathlib import Path; ...'"
  exit 1
fi

# Extract universe IDs from JSON
UNIVERSE_IDS=$(python3 -c "
import json
with open('$UNIVERSES_LIST') as f:
    data = json.load(f)
for u in data:
    print(u['id'])
")

if [ -z "$UNIVERSE_IDS" ]; then
  echo "ERROR: No universes found in $UNIVERSES_LIST"
  exit 1
fi

echo "============================================================================"
echo "ETL Batch Runner"
echo "============================================================================"
echo "Timestamp: $TIMESTAMP"
echo "Universe list: $UNIVERSES_LIST"
echo "ETL Script: $ETL_SCRIPT"
echo "Log directory: $LOG_DIR"
echo ""

# Filter by target universe if specified
if [ -n "$TARGET_UNIVERSE" ]; then
  echo "Filtering to universe: $TARGET_UNIVERSE"
  UNIVERSE_IDS=$(echo "$UNIVERSE_IDS" | grep "$TARGET_UNIVERSE" || echo "")
  if [ -z "$UNIVERSE_IDS" ]; then
    echo "ERROR: Universe '$TARGET_UNIVERSE' not found in list"
    exit 1
  fi
fi

# Run ETL for each universe
FAILED=()
SUCCESS=()

for universe_id in $UNIVERSE_IDS; do
  universe_file="config/universes/${universe_id}.json"
  log_file="$LOG_DIR/${universe_id}_${TIMESTAMP}.log"

  echo "============================================================================"
  echo "Processing: $universe_id"
  echo "============================================================================"
  echo "Config: $universe_file"
  echo "Log: $log_file"

  if [ ! -f "$universe_file" ]; then
    echo "ERROR: Universe file not found: $universe_file"
    FAILED+=("$universe_id (missing file)")
    continue
  fi

  if [ "$DRY_RUN" = true ]; then
    echo "[DRY-RUN] Would run: python3 $ETL_SCRIPT --universe-file $universe_file"
    SUCCESS+=("$universe_id (dry-run)")
  else
    echo "Running ETL..."
    if python3 "$ETL_SCRIPT" --universe-file "$universe_file" > "$log_file" 2>&1; then
      echo "✓ SUCCESS: $universe_id"
      SUCCESS+=("$universe_id")
    else
      exit_code=$?
      echo "✗ FAILED: $universe_id (exit code: $exit_code)"
      echo "  Check log: $log_file"
      FAILED+=("$universe_id (exit: $exit_code)")

      # Print last 20 lines of error
      echo ""
      echo "Last 20 lines of log:"
      tail -20 "$log_file" | sed 's/^/  /'
    fi
  fi

  echo ""
done

# Summary
echo "============================================================================"
echo "SUMMARY"
echo "============================================================================"
echo "Total processed: $(( ${#SUCCESS[@]} + ${#FAILED[@]} ))"
echo "Successful: ${#SUCCESS[@]}"
echo "Failed: ${#FAILED[@]}"

if [ ${#SUCCESS[@]} -gt 0 ]; then
  echo ""
  echo "Successful universes:"
  for u in "${SUCCESS[@]}"; do
    echo "  ✓ $u"
  done
fi

if [ ${#FAILED[@]} -gt 0 ]; then
  echo ""
  echo "Failed universes:"
  for u in "${FAILED[@]}"; do
    echo "  ✗ $u"
  done
  echo ""
  echo "Check logs in: $LOG_DIR"
fi

# Exit with error if any failures
if [ ${#FAILED[@]} -gt 0 ]; then
  exit 1
fi

echo ""
echo "✓ All ETL runs completed successfully!"
