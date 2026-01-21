/**
 * Score normalization utilities
 * All scores are normalized to 0-100 scale
 */

export function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.min(Math.max(value, min), max);
}

export function linearScale(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number = 0,
  outputMax: number = 100
): number {
  if (inputMax === inputMin) return (outputMin + outputMax) / 2;

  const normalized = (value - inputMin) / (inputMax - inputMin);
  return clamp(outputMin + normalized * (outputMax - outputMin), outputMin, outputMax);
}

export function inverseLinearScale(
  value: number,
  inputMin: number,
  inputMax: number,
  outputMin: number = 0,
  outputMax: number = 100
): number {
  // Lower input values = higher output scores
  if (inputMax === inputMin) return (outputMin + outputMax) / 2;

  const normalized = (value - inputMin) / (inputMax - inputMin);
  return clamp(outputMax - normalized * (outputMax - outputMin), outputMin, outputMax);
}

export function normalizeToRange(
  value: number | null,
  thresholds: { low: number; high: number },
  invert: boolean = false
): number {
  if (value === null || isNaN(value)) {
    return 50; // Neutral score for missing values
  }

  const { low, high } = thresholds;

  let rawScore: number;

  if (invert) {
    // Lower is better (e.g., P/E, Debt/Equity)
    if (value <= low) {
      rawScore = 100;
    } else if (value >= high) {
      rawScore = 0;
    } else {
      rawScore = inverseLinearScale(value, low, high);
    }
  } else {
    // Higher is better (e.g., ROE, Margin)
    if (value <= low) {
      rawScore = 0;
    } else if (value >= high) {
      rawScore = 100;
    } else {
      rawScore = linearScale(value, low, high);
    }
  }

  // Soft-cap prevents saturated 100 scores to keep differentiation (esp. quality metrics).
  return Math.min(rawScore, 95);
}

export function percentileScore(
  value: number | null,
  allValues: (number | null)[],
  invert: boolean = false
): number {
  if (value === null || isNaN(value)) return 50;

  const validValues = allValues.filter(
    (v): v is number => v !== null && !isNaN(v)
  );

  if (validValues.length === 0) return 50;

  validValues.sort((a, b) => a - b);

  const rank = validValues.findIndex((v) => v >= value);
  const percentile = (rank / validValues.length) * 100;

  return invert ? 100 - percentile : percentile;
}

export function roundScore(score: number, decimals: number = 1): number {
  const factor = Math.pow(10, decimals);
  return Math.round(score * factor) / factor;
}
