#!/bin/bash
# Daily ETL runner for all active universes
# Designed to be called by systemd timer or cron

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_DIR="$PROJECT_DIR/logs/etl"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
STATUS_FILE="$PROJECT_DIR/data/etl-status.json"
PYTHON_BIN="$PROJECT_DIR/.venv/bin/python"

if [ ! -x "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

mkdir -p "$LOG_DIR"
mkdir -p "$(dirname "$STATUS_FILE")"

echo "============================================================================"
echo "Starting daily ETL at $(date)"
echo "============================================================================"
echo "Project: $PROJECT_DIR"
echo "Log directory: $LOG_DIR"
echo "Status file: $STATUS_FILE"
echo ""

# Track results
TOTAL=0
SUCCESS=0
FAILED=0
ERRORS=""

run_universe() {
    local universe_file="$1"
    local name="$2"
    TOTAL=$((TOTAL + 1))
    
    echo "============================================================================" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
    echo "Processing: $name" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
    echo "Config: $universe_file" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
    echo ""
    
    if "$PYTHON_BIN" "$PROJECT_DIR/scripts/etl/daily_data_pipeline.py" \
        --universe-file "$universe_file" \
        >> "$LOG_DIR/daily_${TIMESTAMP}.log" 2>&1; then
        SUCCESS=$((SUCCESS + 1))
        echo "[$name] ✓ SUCCESS" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
    else
        exit_code=$?
        FAILED=$((FAILED + 1))
        ERRORS="$ERRORS $name"
        echo "[$name] ✗ FAILED (exit code: $exit_code)" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
        echo "  Check log: $LOG_DIR/daily_${TIMESTAMP}.log" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
    fi
    
    echo "" | tee -a "$LOG_DIR/daily_${TIMESTAMP}.log"
}

# Main universes (in order of priority)
run_universe "$PROJECT_DIR/config/universes/russell2000_full.json" "Russell 2000"
run_universe "$PROJECT_DIR/config/universes/sp500-full.json" "S&P 500"
run_universe "$PROJECT_DIR/config/universes/nasdaq100-full.json" "NASDAQ 100"
run_universe "$PROJECT_DIR/config/universes/ftse100-full.json" "FTSE 100"
run_universe "$PROJECT_DIR/config/universes/dax40-full.json" "DAX 40"
run_universe "$PROJECT_DIR/config/universes/cac40-full.json" "CAC 40"
run_universe "$PROJECT_DIR/config/universes/eurostoxx50-full.json" "EURO STOXX 50"

# Status-Datei schreiben (wird vom Health-Check-Endpoint gelesen)
cat > "$STATUS_FILE" << HEREDOC
{
  "last_run": "$(date -Iseconds)",
  "timestamp": $(date +%s),
  "total_universes": $TOTAL,
  "successful": $SUCCESS,
  "failed": $FAILED,
  "failed_universes": [$(echo $ERRORS | sed 's/^/"/' | sed 's/ /", "/g' | sed 's/$/"/')],
  "log_file": "logs/etl/daily_${TIMESTAMP}.log",
  "status": "$([ $FAILED -eq 0 ] && echo 'healthy' || echo 'degraded')"
}
HEREDOC

echo ""
echo "============================================================================"
echo "ETL COMPLETE"
echo "============================================================================"
echo "Total processed: $TOTAL"
echo "Successful: $SUCCESS"
echo "Failed: $FAILED"
if [ $FAILED -gt 0 ]; then
    echo "Failed universes: $ERRORS"
    echo "Check logs: $LOG_DIR/daily_${TIMESTAMP}.log"
fi

# Exit mit Fehler wenn irgendetwas fehlgeschlagen ist
[ $FAILED -eq 0 ] || exit 1
