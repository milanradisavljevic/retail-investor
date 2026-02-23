#!/bin/bash
# ============================================================================
# INTRINSIC Daily ETL Orchestrator
# ============================================================================
# Orchestriert den täglichen ETL-Prozess:
#   1. SEC-Sync (falls aktiviert)
#   2. FMP-Load (max 250 Calls)
#   3. yfinance-Batch für fehlende Daten
#   4. Scoring-Run für aktive Universes
#
# Verwendung:
#   ./scripts/etl/run_daily_etl_orchestrator.sh [--all] [--universe <name>]
#
# Multi-Universe Support (ETL_UNIVERSES):
#   ETL_UNIVERSES="russell2000_full,nasdaq100-full,sp500-full" ./scripts/etl/run_daily_etl_orchestrator.sh
#
# Für systemd Timer konzipiert, aber auch manuell ausführbar.
# ============================================================================

set -euo pipefail

# Projekt-Verzeichnis (3 Ebenen über scripts/etl/)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

# Konfiguration
LOG_DIR="${LOG_DIR:-$PROJECT_DIR/logs/etl}"
LOG_FILE="$LOG_DIR/etl_$(date +%Y-%m-%d).log"
STATUS_FILE="$PROJECT_DIR/data/etl-status.json"
LOCK_FILE="$PROJECT_DIR/data/etl.lock"

# Python/Node Executables
PYTHON_BIN="${PYTHON_BIN:-python3}"
NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-npm}"

# Environment
export PYTHONPATH="${PYTHONPATH:-$PROJECT_DIR/src}"
export NODE_ENV="${NODE_ENV:-production}"

# Multi-Universe Support: ETL_UNIVERSES (comma-separated) or single ETL_UNIVERSE
# Default: US core universes. Add EU/Asia when FMP data available.
if [ -n "${ETL_UNIVERSES:-}" ]; then
    IFS=',' read -ra UNIVERSES <<< "$ETL_UNIVERSES"
else
    UNIVERSES=("${ETL_UNIVERSE:-russell2000_full}")
fi

# ETL Log Helper
ETL_LOG_HELPER="$PROJECT_DIR/scripts/etl/etl_log_helper.ts"

# ============================================================================
# Logging Functions
# ============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$timestamp] [$level] $message" | tee -a "$LOG_FILE"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_success() { log "SUCCESS" "$@"; }

# ============================================================================
# Helper Functions
# ============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing=0
    
    if ! command -v "$PYTHON_BIN" &> /dev/null; then
        log_error "Python not found: $PYTHON_BIN"
        missing=1
    fi
    
    if ! command -v "$NODE_BIN" &> /dev/null; then
        log_error "Node not found: $NODE_BIN"
        missing=1
    fi
    
    if [ ! -f "$PROJECT_DIR/.env.local" ] && [ ! -f "$PROJECT_DIR/.env" ]; then
        log_warn "No .env.local or .env file found - some features may not work"
    fi
    
    if [ $missing -eq 1 ]; then
        log_error "Prerequisites check failed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

acquire_lock() {
    if [ -f "$LOCK_FILE" ]; then
        local pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log_error "Another ETL process is running (PID: $pid)"
            exit 1
        else
            log_warn "Stale lock file found, removing..."
            rm -f "$LOCK_FILE"
        fi
    fi
    
    echo $$ > "$LOCK_FILE"
    log_info "Lock acquired (PID: $$)"
}

release_lock() {
    rm -f "$LOCK_FILE"
    log_info "Lock released"
}

cleanup() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        log_error "ETL failed with exit code: $exit_code"
    fi
    release_lock
    exit $exit_code
}

trap cleanup EXIT

# ============================================================================
# ETL Steps
# ============================================================================

step_sec_sync() {
    log_info "=== Step 1: SEC Sync ==="
    
    if [ "${ENABLE_SEC_SYNC:-false}" != "true" ]; then
        log_info "SEC Sync disabled (set ENABLE_SEC_SYNC=true to enable)"
        return 0
    fi
    
    log_info "Syncing SEC company tickers..."
    
    if $PYTHON_BIN "$PROJECT_DIR/scripts/etl/sec_sync_us_universes.py" >> "$LOG_FILE" 2>&1; then
        log_success "SEC Sync completed"
        return 0
    else
        local exit_code=$?
        log_error "SEC Sync failed (exit code: $exit_code)"
        return $exit_code
    fi
}

step_fmp_load() {
    log_info "=== Step 2: FMP Load ==="
    
    if [ -z "${FMP_API_KEY:-}" ]; then
        log_warn "FMP_API_KEY not set - skipping FMP Load"
        return 0
    fi
    
    log_info "Loading fundamentals from FMP (max 250 calls)..."
    
    # FMP Load mit Rate Limiting
    if $PYTHON_BIN "$PROJECT_DIR/scripts/etl/fmp_load.py" \
        --max-calls 250 \
        --rate-limit 0.5 \
        >> "$LOG_FILE" 2>&1; then
        log_success "FMP Load completed"
        return 0
    else
        local exit_code=$?
        log_error "FMP Load failed (exit code: $exit_code)"
        # Nicht fatal - continue mit yfinance
        return 0
    fi
}

step_yfinance_batch() {
    log_info "=== Step 3: yfinance Batch ==="
    
    local failed_count=0
    
    for universe in "${UNIVERSES[@]}"; do
        log_info "Running yfinance batch for universe: $universe"
        
        local etl_id=""
        if [ -f "$ETL_LOG_HELPER" ]; then
            etl_id=$($NODE_BIN --import tsx "$ETL_LOG_HELPER" start yfinance "{\"universe\":\"$universe\"}" 2>/dev/null || echo "")
        fi
        
        local symbol_count=0
        if $PYTHON_BIN "$PROJECT_DIR/scripts/etl/daily_data_pipeline.py" \
            --universe "$universe" \
            >> "$LOG_FILE" 2>&1; then
            log_success "yfinance Batch completed for $universe"
            if [ -n "$etl_id" ]; then
                $NODE_BIN --import tsx "$ETL_LOG_HELPER" finish "$etl_id" success "$symbol_count" "" "{\"universe\":\"$universe\"}" 2>/dev/null || true
            fi
        else
            local exit_code=$?
            log_error "yfinance Batch failed for $universe (exit code: $exit_code)"
            failed_count=$((failed_count + 1))
            if [ -n "$etl_id" ]; then
                $NODE_BIN --import tsx "$ETL_LOG_HELPER" finish "$etl_id" failed "0" "Exit code $exit_code" "{\"universe\":\"$universe\"}" 2>/dev/null || true
            fi
        fi
    done
    
    if [ $failed_count -gt 0 ]; then
        return 1
    fi
    return 0
}

step_scoring_run() {
    log_info "=== Step 4: Scoring Run ==="
    
    local failed_count=0
    
    for universe in "${UNIVERSES[@]}"; do
        log_info "Running scoring for universe: $universe"
        
        local etl_id=""
        if [ -f "$ETL_LOG_HELPER" ]; then
            etl_id=$($NODE_BIN --import tsx "$ETL_LOG_HELPER" start daily_run "{\"universe\":\"$universe\"}" 2>/dev/null || echo "")
        fi
        
        if $NPM_BIN run run:daily -- --universe="$universe" >> "$LOG_FILE" 2>&1; then
            log_success "Scoring Run completed for $universe"
            if [ -n "$etl_id" ]; then
                $NODE_BIN --import tsx "$ETL_LOG_HELPER" finish "$etl_id" success "0" "" "{\"universe\":\"$universe\"}" 2>/dev/null || true
            fi
        else
            local exit_code=$?
            log_error "Scoring Run failed for $universe (exit code: $exit_code)"
            failed_count=$((failed_count + 1))
            if [ -n "$etl_id" ]; then
                $NODE_BIN --import tsx "$ETL_LOG_HELPER" finish "$etl_id" failed "0" "Exit code $exit_code" "{\"universe\":\"$universe\"}" 2>/dev/null || true
            fi
        fi
    done
    
    if [ $failed_count -gt 0 ]; then
        return 1
    fi
    return 0
}

step_quality_observatory() {
    log_info "=== Step 5: Quality Observatory ==="
    
    if [ "${ENABLE_QUALITY_OBSERVATORY:-false}" != "true" ]; then
        log_info "Quality Observatory disabled"
        return 0
    fi
    
    if $NPM_BIN run quality:build >> "$LOG_FILE" 2>&1; then
        log_success "Quality Observatory completed"
        return 0
    else
        local exit_code=$?
        log_warn "Quality Observatory failed (exit code: $exit_code) - continuing"
        return 0
    fi
}

# ============================================================================
# Status Reporting
# ============================================================================

write_status() {
    local status="$1"
    local total="$2"
    local success="$3"
    local failed="$4"
    local failed_universes="$5"
    
    cat > "$STATUS_FILE" << EOF
{
  "last_run": "$(date -Iseconds)",
  "timestamp": $(date +%s),
  "duration_seconds": $(( $(date +%s) - ${ETL_START_TIME:-$(date +%s)} )),
  "total_steps": $total,
  "successful": $success,
  "failed": $failed,
  "failed_steps": $failed_universes,
  "log_file": "$LOG_FILE",
  "status": "$status"
}
EOF
    
    log_info "Status written to: $STATUS_FILE"
}

# ============================================================================
# Main
# ============================================================================

main() {
    ETL_START_TIME=$(date +%s)
    
    echo "============================================================================"
    echo "INTRINSIC Daily ETL"
    echo "Started at: $(date)"
    echo "============================================================================"
    
    # Ensure log directory exists
    mkdir -p "$LOG_DIR"
    
    log_info "ETL starting..."
    log_info "Project directory: $PROJECT_DIR"
    log_info "Log file: $LOG_FILE"
    
    # Check prerequisites
    check_prerequisites
    
    # Acquire lock
    acquire_lock
    
    # Track results
    local total_steps=0
    local success_steps=0
    local failed_steps=0
    local failed_list=""
    
    # Step 1: SEC Sync (optional)
    total_steps=$((total_steps + 1))
    if step_sec_sync; then
        success_steps=$((success_steps + 1))
    else
        failed_steps=$((failed_steps + 1))
        failed_list="$failed_list \"SEC-Sync\","
    fi
    
    # Step 2: FMP Load
    total_steps=$((total_steps + 1))
    if step_fmp_load; then
        success_steps=$((success_steps + 1))
    else
        failed_steps=$((failed_steps + 1))
        failed_list="$failed_list \"FMP-Load\","
    fi
    
    # Step 3: yfinance Batch
    total_steps=$((total_steps + 1))
    if step_yfinance_batch; then
        success_steps=$((success_steps + 1))
    else
        failed_steps=$((failed_steps + 1))
        failed_list="$failed_list \"yfinance-Batch\","
    fi
    
    # Step 4: Scoring Run
    total_steps=$((total_steps + 1))
    if step_scoring_run; then
        success_steps=$((success_steps + 1))
    else
        failed_steps=$((failed_steps + 1))
        failed_list="$failed_list \"Scoring-Run\","
    fi
    
    # Step 5: Quality Observatory (optional)
    total_steps=$((total_steps + 1))
    if step_quality_observatory; then
        success_steps=$((success_steps + 1))
    else
        failed_steps=$((failed_steps + 1))
        failed_list="$failed_list \"Quality-Observatory\","
    fi
    
    # Remove trailing comma from failed list
    failed_list=$(echo "$failed_list" | sed 's/,$//')
    
    # Determine overall status
    local overall_status="healthy"
    if [ $failed_steps -gt 0 ]; then
        overall_status="degraded"
    fi
    
    # Write status
    write_status "$overall_status" "$total_steps" "$success_steps" "$failed_steps" "[$failed_list]"
    
    # Summary
    echo ""
    echo "============================================================================"
    echo "ETL COMPLETE"
    echo "============================================================================"
    echo "Total steps: $total_steps"
    echo "Successful: $success_steps"
    echo "Failed: $failed_steps"
    echo "Status: $overall_status"
    echo "Log file: $LOG_FILE"
    echo "============================================================================"
    
    if [ $failed_steps -gt 0 ]; then
        log_error "ETL completed with $failed_steps failed step(s)"
        exit 1
    fi
    
    log_success "ETL completed successfully"
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --universe)
            ETL_UNIVERSE="$2"
            shift 2
            ;;
        --universes)
            ETL_UNIVERSES="$2"
            shift 2
            ;;
        --all)
            ETL_UNIVERSES="russell2000_full,nasdaq100-full,sp500-full"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--universe <name>] [--universes <name1,name2,...>] [--all]"
            exit 1
            ;;
    esac
done

# Run main
main
