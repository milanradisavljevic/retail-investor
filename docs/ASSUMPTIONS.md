# Assumptions

This document records assumptions made during implementation where specifications were unclear or incomplete.

## A001: Universe Composition

**Assumption:** The 101 symbols in `config/universe.json` represent S&P 500 ranks 50-150 as of January 2026.

**Rationale:** Exact rankings change frequently. A static list was required for MVP.

**Risk:** Survivorship bias - list doesn't reflect historical index changes.

**Mitigation:** Document this limitation prominently.

---

## A002: Finnhub Provides Adjusted Prices

**Assumption:** Finnhub `/stock/candle` endpoint returns split- and dividend-adjusted closing prices.

**Rationale:** Their documentation indicates adjusted prices are the default.

**Risk:** If raw prices are returned, technical indicators will be inaccurate around split/dividend dates.

**Verification:** Compare a known split (e.g., AAPL 4:1 in 2020) against historical data.

---

## A003: Metric Availability

**Assumption:** Most S&P 500 companies have P/E, P/B, ROE, and Debt/Equity metrics available via Finnhub.

**Reality:** Some metrics may be null or missing for:
- Recent IPOs
- Companies with negative earnings
- Financial sector (different metrics)

**Mitigation:** Median imputation with clear flagging.

---

## A004: Trading Day Detection

**Assumption:** Weekends (Saturday/Sunday) are non-trading days. US market holidays are not explicitly handled.

**Rationale:** Holiday calendar would add complexity.

**Risk:** Running on US holidays may use previous day's data without warning.

**Future:** Add holiday calendar integration.

---

## A005: EOD Price Availability

**Assumption:** End-of-day prices are available by 6 PM ET on trading days.

**Rationale:** Major data providers update within 1-2 hours of market close.

**Risk:** Running immediately after close may get previous day's data.

**Mitigation:** `as_of_date` field explicitly states the data date.

---

## A006: Fundamental Data Update Frequency

**Assumption:** Finnhub fundamental metrics are updated quarterly.

**Rationale:** Most metrics (P/E, ROE) are derived from quarterly reports.

**Implementation:** 14-day cache TTL is reasonable for fundamental data.

---

## A007: Score Thresholds

**Assumption:** The following thresholds represent reasonable valuation ranges:

| Metric | Threshold Low | Threshold High | Notes |
|--------|---------------|----------------|-------|
| P/E | 15 | 30 | Historical S&P 500 range |
| P/B | 1.5 | 5.0 | Book value multiple |
| ROE | 5% | 20% | Quality indicator |
| D/E | 0.5 | 2.0 | Leverage threshold |

**Risk:** Different industries have different norms. No sector normalization in MVP.

---

## A008: Technical Indicator Periods

**Assumption:** Standard indicator periods are used:
- SMA: 50 and 200 days
- RSI: 14 days
- MACD: 12, 26, 9
- ATR: 14 days
- Bollinger: 20 days, 2 std dev

**Rationale:** These are the most common parameters in technical analysis literature.

---

## A009: Evidence Pillar Weights

**Assumption:** All four evidence pillars (Valuation, Quality, Technical, Risk) have equal weight (25% each).

**Rationale:** No strong evidence for different weightings without backtesting.

**Future:** Configurable weights after empirical testing.

---

## A010: Maximum Document Requests

**Assumption:** Maximum 2 document requests per run is sufficient for human-in-the-loop.

**Rationale:**
- Prevents overwhelming the user
- Focuses on highest-impact gaps
- Matches spec requirement

---

## A011: LLM Temperature

**Assumption:** Temperature 0 is required for all LLM calls to ensure reproducibility.

**Rationale:** Non-zero temperature introduces randomness, breaking determinism.

**Trade-off:** Less creative narratives, but consistent outputs.

---

## A012: Benchmark Symbol

**Assumption:** SPY (SPDR S&P 500 ETF) is an acceptable proxy for the S&P 500 index.

**Rationale:** Direct index data requires different API endpoint. SPY closely tracks S&P 500.

**Risk:** Minor tracking error vs. actual index.
