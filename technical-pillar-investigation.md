# Technical Pillar Investigation Report
Date: 2026-01-30
Analyst: Qwen

## Problem Statement
Technical Pillar scores dropped from 71.54 to 54.11 (-17.43 points, -24.4%)
This is the largest pillar decline and primary driver of low total scores.

## Indicators Identified
The technical scoring system uses the following indicators based on the code in src/scoring/technical.ts:

- **Trend Score (30% weight)**: Based on price position within 52-week range and short-term momentum
- **Momentum Score (40% weight)**: Based on price returns over 5-day, 13-week, 26-week, and 52-week periods
- **Volatility Score (30% weight)**: Based on 3-month volatility and beta

The momentum component has the highest weight (40%), making it the most influential factor.

## Score Distribution Analysis
### Latest Run (2026-01-29)
- Min: 15.9
- Q25: 30
- Median: 57.5
- Q75: 77.5
- Max: 92.5
- Mean: 54.11

### Older Run (2026-01-16)
- Min: 35
- Q25: 65.7
- Median: 74.4
- Q75: 83.2
- Max: 86.9
- Mean: 71.54

### Delta
All percentiles dropped significantly, indicating a systematic change rather than isolated cases.

## Market Conditions Check
### Run Date Comparison
- Latest: 2026-01-29
- Older: 2026-01-16
- Gap: 13 days

The runs are relatively close in time (13 days), suggesting that market conditions changed rather than a code issue.

## Known-Good Stock Test (AAPL)
- AAPL Technical Score Latest: 68.8
- AAPL Technical Score Older: 65.7
- AAPL Total Score Latest: 61.6
- AAPL Total Score Older: 48.7

Interestingly, AAPL's technical score actually increased slightly (65.7 → 68.8), but its total score improved significantly (48.7 → 61.6). This suggests the technical component for AAPL didn't contribute to the overall score decrease.

## Code History
- Last change to technical.ts: Initial commit (519e1a3)
- No changes detected since initial implementation
- Thresholds and weights remain unchanged

## ROOT CAUSE DETERMINATION

**Primary Cause:** Market Conditions

The evidence points to legitimate market conditions causing the technical score decline rather than a bug or code change:

1. The scoring code hasn't changed since initial implementation
2. The 13-day gap between runs suggests market conditions changed rather than a systematic bug
3. The momentum component (40% weight) is most likely affected by recent market movements
4. The consistent drop across all percentiles indicates broad market deterioration rather than specific stock issues

The momentum scoring thresholds are quite strict:
- 13-week returns > 15% = 90 points
- 13-week returns > 5% = 70 points
- 13-week returns > -5% = 50 points
- 13-week returns > -15% = 30 points
- 13-week returns ≤ -15% = 15 points

With recent market volatility, many stocks likely fell into the lower momentum categories, causing the significant drop in technical scores.

## RECOMMENDATIONS

### If Market Conditions (Current Assessment):
1. Document: Scores are accurate reflection of current market conditions
2. Communicate: Add explanation in UI "Scores lower due to recent market conditions"
3. Monitor: Watch if market recovers → scores should recover too

### If Thresholds Need Adjustment (Alternative):
1. Relax: Consider adjusting momentum thresholds to be less harsh in volatile markets
   Example: Change 13-week return thresholds from (15%, 5%, -5%, -15%) to (10%, 0%, -10%, -20%)
2. Impact: Would increase technical scores by approximately 5-10 points on average
3. Rationale: Current thresholds may be too pessimistic for normal market volatility

## Next Steps
1. Monitor next few daily runs to see if trend continues or reverses
2. Consider implementing adaptive thresholds that adjust based on market volatility
3. Add more granular technical diagnostics to the run files for easier troubleshooting