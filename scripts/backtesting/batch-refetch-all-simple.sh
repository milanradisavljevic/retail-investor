#!/bin/bash
#
# Simplified Batch Re-Fetch (No tee, direct output)
#

# Configuration
export BACKTEST_START="2015-01-01"
export BACKTEST_END="2025-12-31"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FETCH_SCRIPT="$SCRIPT_DIR/fetch-historical.py"
LOG_DIR="$PROJECT_ROOT/data/audits/refetch-logs"

# Create log directory
mkdir -p "$LOG_DIR"

# Timestamp for this run
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
MASTER_LOG="$LOG_DIR/batch-refetch-$TIMESTAMP.log"

echo "═══════════════════════════════════════════════════════════" >> "$MASTER_LOG"
echo "BATCH RE-FETCH ALL UNIVERSES" >> "$MASTER_LOG"
echo "═══════════════════════════════════════════════════════════" >> "$MASTER_LOG"
echo "" >> "$MASTER_LOG"
echo "Period: $BACKTEST_START to $BACKTEST_END" >> "$MASTER_LOG"
echo "Started: $(date)" >> "$MASTER_LOG"
echo "Log: $MASTER_LOG" >> "$MASTER_LOG"
echo "" >> "$MASTER_LOG"

# Console output
echo "═══════════════════════════════════════════════════════════"
echo "BATCH RE-FETCH ALL UNIVERSES"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Period: $BACKTEST_START to $BACKTEST_END"
echo "Log: $MASTER_LOG"
echo ""

# Priority 1: Production Universes (CRITICAL)
PRIORITY_HIGH=(
    "russell2000_full"
    "sp500-full"
    "nasdaq100"
)

# Priority 2: Sample/Test Universes
PRIORITY_MEDIUM=(
    "test"
    "russell2000"
    "sp500"
)

# Priority 3: International Universes
PRIORITY_LOW=(
    "cac40_full"
    "dax40_full"
    "eurostoxx50_full"
    "ftse100_full"
    "nikkei225_full"
    "sensex_full"
    "sse50_full"
    "ibovespa_full"
)

ALL_UNIVERSES=("${PRIORITY_HIGH[@]}" "${PRIORITY_MEDIUM[@]}" "${PRIORITY_LOW[@]}")

TOTAL=${#ALL_UNIVERSES[@]}
CURRENT=0
SUCCESS=0
FAILED=0

# Function to fetch a universe
fetch_universe() {
    local universe=$1
    local priority=$2
    ((CURRENT++))

    echo "" | tee -a "$MASTER_LOG"
    echo "[$CURRENT/$TOTAL] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a "$MASTER_LOG"
    echo "Universe: $universe (Priority: $priority)" | tee -a "$MASTER_LOG"
    echo "Started: $(date)" | tee -a "$MASTER_LOG"
    echo "" | tee -a "$MASTER_LOG"

    local universe_log="$LOG_DIR/${universe}_$TIMESTAMP.log"
    local start_time=$(date +%s)

    # Run fetch
    if python3 "$FETCH_SCRIPT" "$universe" > "$universe_log" 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        ((SUCCESS++))
        echo "✅ SUCCESS ($duration seconds)" | tee -a "$MASTER_LOG"
        echo "   Log: $universe_log" | tee -a "$MASTER_LOG"

        # Show summary from log
        local fetched=$(grep -c "Downloaded:" "$universe_log" 2>/dev/null || echo "0")
        local skipped=$(grep -c "Skipped:" "$universe_log" 2>/dev/null || echo "0")
        echo "   Summary: Check $universe_log for details" | tee -a "$MASTER_LOG"
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        ((FAILED++))
        echo "❌ FAILED ($duration seconds)" | tee -a "$MASTER_LOG"
        echo "   Error log: $universe_log" | tee -a "$MASTER_LOG"
        echo "   Last 10 lines:" | tee -a "$MASTER_LOG"
        tail -10 "$universe_log" | sed 's/^/   /' | tee -a "$MASTER_LOG"
    fi
}

# Execute fetches by priority
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PRIORITY 1: PRODUCTION UNIVERSES (CRITICAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for universe in "${PRIORITY_HIGH[@]}"; do
    fetch_universe "$universe" "HIGH"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PRIORITY 2: SAMPLE/TEST UNIVERSES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for universe in "${PRIORITY_MEDIUM[@]}"; do
    fetch_universe "$universe" "MEDIUM"
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PRIORITY 3: INTERNATIONAL UNIVERSES"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for universe in "${PRIORITY_LOW[@]}"; do
    fetch_universe "$universe" "LOW"
done

# Final summary
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "BATCH RE-FETCH COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Finished: $(date)"
echo ""
echo "Results:"
echo "  ✅ Success: $SUCCESS/$TOTAL universes"
echo "  ❌ Failed:  $FAILED/$TOTAL universes"
echo ""

if [ $FAILED -eq 0 ]; then
    echo "🎉 ALL UNIVERSES SUCCESSFULLY FETCHED!"
    echo ""
    echo "Next steps:"
    echo "  1. Run audit: npm run audit:historical"
    echo "  2. Run backtests: npm run backtest:full"
else
    echo "⚠️  Some universes failed. Check logs in: $LOG_DIR"
fi

echo ""
echo "Master log: $MASTER_LOG"
echo "Individual logs: $LOG_DIR/*_$TIMESTAMP.log"
echo "═══════════════════════════════════════════════════════════"
