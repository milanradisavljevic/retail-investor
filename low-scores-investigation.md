# Low Scores Investigation Report
Date: 30. Jänner 2026

## Score Comparison
- Latest Run Average: 52.27
- Older Run Average: 58.77
- Delta: -6.5 points (-11.1%)

## Distribution Changes
- Min Score: 23.4 (vs 43.9 previously)
- Max Score: 76.5 (vs 82.4 previously)
- Median Score: 53.7 (vs 58.0 previously)
- Scores in 90+ range: 0 (vs some previously)
- Scores in 80-90 range: 0 (vs some previously)
- Scores in 70-80 range: 5 (vs more previously)
- Scores in 60-70 range: 21
- Scores below 60: 76

## Pillar Analysis
| Pillar | Latest | Older | Delta |
|--------|--------|-------|-------|
| Valuation | 21.98 | 29.6 | -7.62 |
| Quality | 71.54 | 71.21 | +0.33 |
| Technical | 54.11 | 71.54 | -17.43 |
| Risk | 61.41 | 62.7 | -1.29 |

**Most Affected Pillar:** Technical (-17.43 points drop)

## Price Target Analysis
- Stocks requiring deep analysis: 98.04% (100/102 stocks)
- Top reason: Low price target confidence (100 occurrences)
- Sector sample fallbacks: 47.06% of stocks (49/102) due to "sector_sample_too_small"

## Data Quality
- Average DQ Score: 95.62%
- Stocks with critical missing data: 45
- Critical missing data typically includes peRatio, pbRatio, debtToEquity, roe

## ROOT CAUSE HYPOTHESIS
The primary cause of lower scores is a significant drop in technical scores (-17.43 points) combined with lower valuation scores (-7.62 points). 

Technical scores dropped dramatically due to changes in market conditions and potentially updated technical indicators that are more conservative. The valuation scores decreased because many stocks now fall back to global medians instead of sector-specific medians due to insufficient sector sample sizes (49 stocks affected).

The "sector_sample_too_small" fallback occurs when there are fewer than 10 stocks in a sector, forcing the system to use stricter global medians instead of more lenient sector-specific medians. This results in lower valuation scores.

## RECOMMENDATIONS
1. Lower sector sample threshold from 10 to 5 to use sector medians more often, which would likely increase valuation scores
2. Review and potentially adjust technical indicator calculations to understand why they became more conservative
3. Add more stocks to universes to improve sector representation and reduce fallbacks to global medians
4. Investigate if recent market conditions (higher volatility, different trends) are causing more conservative technical scoring