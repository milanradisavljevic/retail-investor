# Stock Detail View - Phase 2 Diagnostic Report
Generated: 2026-01-29

## TypeScript Compilation
- Status: FAIL (errors isolated to unit test files)
- Errors: 40+ (tests only)
- Critical Issues:
  - `tests/unit/advanced-signals.test.ts` missing Vitest globals (`describe`/`it`/`expect`).
  - `tests/unit/price_target_diagnostics.test.ts` treats async results without `await`, causing Promise property errors.
  - Multiple selection fixtures (`top15/top20/top30`) missing in several tests (`explainSignals`, `runDelta`, `run_files`, `scoreView`), breaking type contracts.

## API Endpoints
- `/api/stock/AAPL/export`: HTTP 200 – PASS
- `/api/stock/AAPL/timeseries`: HTTP 200 – PASS (uses full history when 1Y filter would be empty)
- `/api/stock/AAPL/peers`: HTTP 200 – PASS

## Main Route
- `/briefing/AAPL`: HTTP 200 – PASS
- HTML size: 418,045 bytes
- Components detected:
  - ScoreForensics: YES
  - PerformanceTimeline: YES (rendered as “Performance vs. Benchmarks”; marker string absent)
  - PeerComparison: YES
  - EnhancedPriceTarget: YES

## Symbol Lookup
- Symbols in latest run: uppercase (e.g., AAPL, ABNB, ADBE…)
- Lookup logic: case-insensitive via awaited `params` → `symbolParam.toUpperCase()`
- AAPL found in run: YES (1 match)

## Links
- Homepage cards link to `/briefing/${symbol}`
- `ScoreBoardClient` links to `/briefing/${symbol}`

## ROOT CAUSE
- Next.js 16 wraps `params` in a Promise; synchronous access in page and API routes left `params` undefined → 500s/404s and “params.symbol” runtime failures.
- `loadTimeSeriesData` filtered out all rows for 1Y because dataset ends 2024-12-30, producing an empty series and crashing the handler.

## CRITICAL FIXES NEEDED
1. ✅ Await `params` in `/briefing/[symbol]` and API routes; normalize symbol to uppercase.
2. ✅ Fallback to available history in `loadTimeSeriesData` to avoid empty series.
3. ⚠️ Add Vitest globals/types or exclude tests from `tsc` to clear remaining compile errors.
4. ⚠️ (Optional) Add visible “Performance Timeline” text to align with marker check if desired.
