
<img width="1089" height="1269" alt="Bildschirmfoto_20260130_195919" src="https://github.com/user-attachments/assets/bd935679-890e-4568-b57e-d8cdeba5b680" />
<img width="1292" height="1269" alt="Bildschirmfoto_20260130_200446" src="https://github.com/user-attachments/assets/0fd3f33d-e27b-4a1a-acba-72b999e7b50a" />
<img width="1420" height="1258" alt="Bildschirmfoto_20260130_200535" src="https://github.com/user-attachments/assets/64d917f8-7345-40aa-9775-476ccc261fa4" />

# How Our Stock Score Works (Simple Version)

Goal: rank stocks on a 0–100 scale using a few easy-to-read pillars. Lower risk and better value earn more points.

## Inputs (data we read)
- **Price & returns:** current price, 52‑week high/low, daily/weekly/quarterly returns, beta, 3‑month volatility.
- **Fundamentals:** P/E, P/B, P/S, ROE, Debt‑to‑Equity.
- If a metric is missing, we either fill in a universe median or fall back to a neutral 50/100 score.

## Step 1 — Quality Gate (quick safety filter)
- Skip a stock if fundamentals are completely missing.
- Negative Debt‑to‑Equity (more debt than assets) = automatic 0 for that metric.

## Step 2 — Score each metric (0–100)
- We convert raw numbers into points using fixed “good/bad” ranges.
- **Lower is better:** P/E, P/B, P/S, Debt‑to‑Equity → 100 points at the low end, 0 at the high end.
- **Higher is better:** ROE → 0 points at the low end, 100 at the high end.
- Numbers between the low/high bounds are scaled linearly. Missing ⇒ 50.

Typical ranges (from `src/scoring/scoring_config.ts`):
- P/E good ≤15, bad ≥30
- P/B good ≤1.5, bad ≥5
- P/S good ≤1, bad ≥5
- ROE good ≥35%, bad ≤8%
- Debt/Equity good ≤0.2, bad ≥1.5

## Step 3 — Build pillars (0–100 each)
- **Valuation:** average of P/E, P/B, P/S scores.
- **Quality:** average of ROE and Debt/Equity scores.
- **Technical:** average of Trend and Momentum (trend from 52‑week position, momentum from recent returns).
- **Risk:** average of Volatility score and Debt/Equity score (lower volatility → higher score).

## Step 4 — Combine pillars into the total score
- Default weights (equal): Valuation 25%, Quality 25%, Technical 25%, Risk 25%.
- Formula: `Total = 0.25*Valuation + 0.25*Quality + 0.25*Technical + 0.25*Risk`
- We round to one decimal place.

## Step 5 — Price target & expected return (when data is available)
- We compute a fair‑value range using sector medians for P/E, P/B, P/S and the stock’s own scores.
- Upside % = (target price − current price) / current price.
- Confidence tag: High / Medium / Low based on how similar the four pillars are (smaller spread = higher confidence).

## Step 6 — Ranking
- Sort by Total Score (highest first). Ties break alphabetically.
- We keep a “Pick of the Day” by drawing from the top list with a seed to stay deterministic.

## What to remember
- 100 = best, 0 = worst, 50 = “don’t know / neutral”.
- Cheap, profitable, steady stocks rise to the top.
- Missing data is not fatal, but it keeps a stock near 50 until better data arrives.

## Where to change things (if you need)
- Ranges & weights: `config/scoring.json` (overrides) or `src/scoring/scoring_config.ts` (defaults).
- Math for fundamentals: `src/scoring/fundamental.ts`.
- Math for technicals: `src/scoring/technical.ts`.
- Pillar combine logic: `src/scoring/evidence.ts`.
