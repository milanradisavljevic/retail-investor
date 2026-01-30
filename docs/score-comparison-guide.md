# Score Comparison Guide

## Purpose
Compare scores between two runs to measure impact of code changes or fixes.

## Usage

### Step 1: Identify Runs
```bash
# List available runs
ls -lt data/runs/*.json | head -10

# Note the "before" and "after" run files
BEFORE=data/runs/run_2026-01-29_baseline.json
AFTER=data/runs/run_2026-01-30_after-fix.json
```

### Step 2: Run Comparison
```bash
npm run compare-scores $BEFORE $AFTER
```

### Step 3: Interpret Results

**Average Deltas:**
- Total Score Delta: Overall impact
- Pillar Deltas: Which pillar improved/declined most

**Score Distribution:**
- Improved %: Percentage of stocks that got better scores
- Target: >70% improved = successful fix

**Top Winners/Losers:**
- Shows which stocks benefited most/least
- Helps identify if fix is sector-specific

**Statistical Significance:**
- p < 0.05: Change is statistically significant
- p > 0.05: Change might be noise

## Example Output
```
═══════════════════════════════════════════
SCORE COMPARISON REPORT
═══════════════════════════════════════════

Before: run_2026-01-29_baseline.json
After:  run_2026-01-30_sector-fix.json
Stocks Compared: 102

AVERAGE DELTAS:
  Total Score:  🟢 +5.32
  Valuation:    🟢 +6.85
  Quality:      ⚪ +0.12
  Technical:    ⚪ -0.45
  Risk:         ⚪ +0.23

SCORE DISTRIBUTION:
  Improved:  87 stocks (85.3%)
  Declined:  12 stocks (11.8%)
  Unchanged: 3 stocks (2.9%)

TOP 10 WINNERS (biggest improvement):
  1. AMZN   🟢 +12.45 (65.3 → 77.8)
  2. MSFT   🟢 +11.23 (72.1 → 83.3)
  ...

STATISTICAL SIGNIFICANCE:
  t-statistic: 8.234
  p-value: 0.0001
  Significant (p < 0.05): YES ✅

Detailed comparison saved to: /tmp/score-comparison-detailed.json
```

## Interpreting Significance
**Good Fix:**
- Avg Total Delta: +3 to +10 points
- Improved: >70%
- p-value: <0.05
- Valuation improved (if sector fix)

**Neutral Change:**
- Avg Total Delta: -1 to +1 points
- Improved: 40-60%
- p-value: >0.05

**Negative Change:**
- Avg Total Delta: <-3 points
- Improved: <40%
- p-value: <0.05 (significantly worse!)
- → Revert the fix
