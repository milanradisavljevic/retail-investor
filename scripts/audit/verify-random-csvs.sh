#!/bin/bash
# Quick verification of random CSV files for 2015-2025 completeness

HISTORICAL_DIR="data/backtesting/historical"
REQUIRED_START="2015-01-01"
REQUIRED_END="2025-12-31"
MIN_ROWS=2500  # Approximately 250 trading days/year * 10 years

echo "═══════════════════════════════════════════════════════════"
echo "Random CSV Files Verification (2015-2025)"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Testing 15 random files..."
echo ""

# Get 15 random CSV files
FILES=$(cd "$HISTORICAL_DIR" && ls *.csv | shuf -n 15)

PASS=0
WARN=0
FAIL=0

for file in $FILES; do
    filepath="$HISTORICAL_DIR/$file"
    symbol="${file%.csv}"

    # Count total lines (excluding header)
    total_lines=$(tail -n +2 "$filepath" | wc -l)

    # Get first and last date
    first_date=$(tail -n +2 "$filepath" | head -1 | cut -d',' -f1)
    last_date=$(tail -n +2 "$filepath" | tail -1 | cut -d',' -f1)

    # Check for completeness
    status="✅ PASS"
    issues=""

    # Check if dates are in expected range
    if [[ "$first_date" > "$REQUIRED_START" ]]; then
        issues="${issues}Start: $first_date (late); "
        status="⚠️  WARN"
        ((WARN++))
    fi

    if [[ "$last_date" < "$REQUIRED_END" ]]; then
        issues="${issues}End: $last_date (early); "
        if [[ "$status" != "⚠️  WARN" ]]; then
            status="⚠️  WARN"
            ((WARN++))
        fi
    fi

    # Check row count
    if [ "$total_lines" -lt "$MIN_ROWS" ]; then
        issues="${issues}Rows: $total_lines (insufficient); "
        status="❌ FAIL"
        if [[ "$WARN" -gt 0 ]]; then ((WARN--)); fi
        ((FAIL++))
    fi

    # If no issues found, count as pass
    if [ -z "$issues" ] && [[ "$status" == "✅ PASS" ]]; then
        ((PASS++))
    fi

    # Print result
    printf "%-8s %s  " "$symbol" "$status"
    printf "Rows: %4d  " "$total_lines"
    printf "Period: %s to %s" "$first_date" "$last_date"
    if [ -n "$issues" ]; then
        printf "\n         └─ %s" "$issues"
    fi
    printf "\n"
done

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "SUMMARY"
echo "═══════════════════════════════════════════════════════════"
echo "✅ PASS: $PASS files"
echo "⚠️  WARN: $WARN files (acceptable - date edge cases)"
echo "❌ FAIL: $FAIL files (insufficient data)"
echo ""
echo "Overall Quality: $PASS/15 files meet full requirements"
echo "═══════════════════════════════════════════════════════════"
