import type { ModeResult, ModeLabel } from './types';

function movingAverage(values: number[], window: number): number | null {
  if (values.length < window) return null;
  const slice = values.slice(-window);
  const sum = slice.reduce((a, b) => a + b, 0);
  return sum / window;
}

function volatility(values: number[], window: number): number | null {
  if (values.length <= window) return null;
  const slice = values.slice(-window - 1);
  const returns: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    const prev = slice[i - 1];
    const curr = slice[i];
    if (!prev || prev === 0) continue;
    returns.push((curr - prev) / prev);
  }
  if (returns.length === 0) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
    returns.length;
  return Math.sqrt(variance) * Math.sqrt(252);
}

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

export function calculateModeV1(
  benchmark: string,
  closes: number[],
  breadth: number | null
): ModeResult {
  const ma50 = movingAverage(closes, 50);
  const ma200 = movingAverage(closes, 200);
  const vol20 = volatility(closes, 20);
  const vol60 = volatility(closes, 60);

  const trend =
    ma50 !== null && ma200 !== null
      ? ma50 > ma200
        ? 1
        : ma50 < ma200
          ? -1
          : 0
      : 0;

  let volSignal = 0;
  if (vol20 !== null && vol60 !== null) {
    if (vol20 > vol60 * 1.25) volSignal = -1;
    else if (vol20 < vol60 * 0.9) volSignal = 1;
  }

  let breadthSignal = 0;
  if (breadth !== null) {
    if (breadth >= 0.6) breadthSignal = 1;
    else if (breadth <= 0.4) breadthSignal = -1;
  }

  let label: ModeLabel = 'NEUTRAL';
  if (trend === 1 && volSignal >= 0 && breadthSignal === 1) {
    label = 'RISK_ON';
  } else if (trend === -1 && volSignal <= 0 && breadthSignal === -1) {
    label = 'RISK_OFF';
  }

  let score = 50;
  score += trend === 1 ? 20 : trend === -1 ? -20 : 0;
  score += breadthSignal === 1 ? 15 : breadthSignal === -1 ? -15 : 0;
  score += volSignal === 1 ? 15 : volSignal === -1 ? -15 : 0;
  score = clamp(score, 0, 100);

  let confidence = 1.0;
  if (ma200 === null) confidence -= 0.2;
  if (breadth === null) confidence -= 0.2;
  if (closes.length < 120) confidence -= 0.1;
  confidence = clamp(confidence, 0, 1);

  return {
    model_version: 'mode_v1',
    label,
    score,
    confidence,
    benchmark,
    features: {
      ma50,
      ma200,
      vol20,
      vol60,
      breadth,
    },
  };
}
