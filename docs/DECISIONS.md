# Technical Decisions

This document records key technical decisions made during implementation.

## D001: Ajv over Zod for Schema Validation

**Decision:** Use Ajv instead of Zod for schema validation.

**Rationale:** JSON Schemas are the Source of Truth for this project. Ajv validates JSON directly against JSON Schema specifications, eliminating any translation layer. This ensures the schemas in `schemas/` are authoritative.

**Trade-offs:**
- Pro: Direct validation against JSON Schema spec
- Pro: Type generation from same schemas via json-schema-to-typescript
- Con: Less ergonomic than Zod's chained API

---

## D002: SQLite with better-sqlite3

**Decision:** Use SQLite via better-sqlite3 for data persistence.

**Rationale:**
- Single-user MVP doesn't need PostgreSQL complexity
- No external database server required
- Synchronous API simplifies code
- WAL mode provides good read concurrency

**Trade-offs:**
- Pro: Zero configuration, embedded
- Pro: Single file = easy backup
- Con: No network access (single machine only)
- Con: Limited concurrent writes

---

## D003: yfinance as Primary Data Provider

**Decision:** Use yfinance via Python bridge as primary data provider.

**Rationale:** Finnhub free tier has 60 req/min limit. yfinance has no rate limits and better coverage for small-cap stocks. Batch fetching reduces process spawn overhead.

**Updated:** 2026-02 — Migrated from Finnhub to yfinance for better Russell 2000 coverage.

**Trade-offs:**
- Pro: No rate limits
- Pro: Better small-cap coverage
- Con: Requires Python runtime
- Con: Less reliable for real-time data

---

## D004: Deterministic Pick of Day

**Decision:** Pick of Day uses SHA256(date + salt) seeded selection.

**Rationale:** Reproducibility is a core requirement. Same date always produces same pick from the same top 5.

**Implementation:**
```typescript
const seed = deterministicHash(runDate + 'POTD');
const index = parseInt(seed.substring(0, 8), 16) % top5.length;
```

---

## D005: Rule-Based Regime Detection

**Decision:** Use deterministic rules, not ML models, for regime classification.

**Rationale:**
- Explainability is critical for investor trust
- Rules can be validated against historical crisis periods
- No training data required

**Implementation:**
- VIX > 40 → CRISIS (override)
- Composite score thresholds → RISK_ON / NEUTRAL / RISK_OFF
- Weighted signals: VIX (35%), Yield Curve (30%), Fed Rate (20%), CPI (15%)

---

## D006: FRED API for Macro Data

**Decision:** Use Federal Reserve FRED API for all macro indicators.

**Rationale:**
- Free API with generous rate limits
- Authoritative source for US economic data
- Daily updates for most series

**Series Used:**
- VIXCLS: CBOE Volatility Index
- T10Y2Y: 10Y-2Y Treasury Spread
- DGS10: 10-Year Treasury Yield
- FEDFUNDS: Federal Funds Rate
- CPIAUCSL: Consumer Price Index

---

## D007: Median Imputation for Missing Values

**Decision:** Missing fundamental values use universe median or neutral score (50).

**Rationale:**
- Complete analysis required for all symbols
- Median imputation is standard practice
- Neutral score signals uncertainty without biasing ranking

**Trade-offs:**
- Pro: Every symbol gets scored
- Pro: Clearly documented assumptions
- Con: Imputed values may not reflect reality

---

## D008: Batch Fetching for yfinance

**Decision:** Fetch 50 symbols per Python process instead of 1.

**Rationale:**
- Process spawn overhead was 30s per symbol
- Batch mode reduces 9,715 spawns to ~200 for Russell 2000
- 18x speedup for NASDAQ 100 (25min → 1.36min)

---

## D009: European Universe Native Tickers

**Decision:** Use native exchange tickers (.DE, .PA, .L) instead of ADRs.

**Rationale:**
- Better fundamentals coverage in yfinance
- Avoids US ADR liquidity issues
- Direct access to local market data

**Examples:**
- SAP.DE instead of SAP
- MC.PA (LVMH) instead of LVMUY
- SHEL.L instead of SHEL

---

## D010: Preset Tier System

**Decision:** Classify presets as "Validated" or "Experimental".

**Rationale:**
- Transparently communicate backtest confidence
- Validated presets have full 10-year backtests
- Experimental presets may have data gaps or methodology issues

**Validated:** Deep Value, Compounder, GARP, Shield
**Experimental:** Dividend Quality, Piotroski, Magic Formula, Rocket, Quant

---

## D011: Regime Overlay as Optional

**Decision:** Regime overlay is opt-in per preset, not global.

**Rationale:**
- Backtests show regime overlay helps Quality strategies (+23pp) but harms in strong bull markets (-100pp on NDX100)
- Users should choose based on their risk tolerance
- Presets have `regime_overlay_recommended` flag

---

## D012: Server-Side Settings Persistence

**Decision:** Store user settings in `data/settings.json` on server, not localStorage.

**Rationale:**
- Settings survive browser clears
- Works across devices
- API routes for sync

**Updated:** 2026-02 — Migrated from localStorage to server persistence.

---

## D013: Multi-Provider Fundamentals Strategy

**Decision:** Use a merge-layer that combines fundamentals from multiple providers (FMP, yfinance) per-field with deterministic priority.

**Rationale:**
- FMP provides more accurate ratios (PE, PB, margins)
- yfinance has better beta and FCF coverage
- Merge allows graceful fallback when one provider lacks data
- Transparent to consuming code via `getMergedFundamentals()`

**Priority (per field):**
- PE, PB, PS, EV/EBITDA, margins, D/E → FMP preferred
- beta, freeCashFlow → yfinance preferred
- Missing fields → median imputation

**Trade-offs:**
- Pro: Better overall coverage
- Pro: No single point of failure
- Con: More complex data flow
- Con: Need to track source for debugging

**Implementation:** `src/data/repositories/provider_merge.ts`

---

## D014: FMP Stable API Endpoints

**Decision:** Use `/stable/` endpoints for FMP API, not `/api/v3/`.

**Rationale:**
- `/api/v3/` is legacy and only works for old accounts
- `/stable/` is the current standard for new FMP accounts
- v3 endpoints returned HTTP 403 (invalid_api_key) when actually hitting plan limits (HTTP 402)
- Stable endpoints properly return HTTP 402 for plan limits

**Endpoints Used:**
- `/stable/profile` (company profile)
- `/stable/ratios-ttm` (TTM financial ratios)

**Limitation:** `/stable/ratios-ttm` does not include ROE/ROA. Would require `/stable/key-metrics-ttm` as additional call.

**Updated:** 2026-02-13 — Migrated from v3 to stable endpoints.

