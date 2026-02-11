export interface PEGCalculationResult {
  peg: number | null;
  pegScore: number;
  skipped: boolean;
  reason?: string;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (
  value: number,
  fromMin: number,
  fromMax: number,
  toMin: number,
  toMax: number
): number => {
  if (fromMax === fromMin) return toMin;
  const t = (value - fromMin) / (fromMax - fromMin);
  return toMin + t * (toMax - toMin);
};

function mapPegToScore(peg: number): number {
  const cappedPeg = Math.min(peg, 5.0);

  if (cappedPeg <= 0.5) return 100;
  if (cappedPeg <= 1.0) return lerp(cappedPeg, 0.5, 1.0, 100, 75);
  if (cappedPeg <= 1.5) return lerp(cappedPeg, 1.0, 1.5, 75, 50);
  if (cappedPeg <= 2.0) return lerp(cappedPeg, 1.5, 2.0, 50, 25);
  if (cappedPeg <= 3.0) return lerp(cappedPeg, 2.0, 3.0, 25, 0);
  return 0;
}

export function calculatePEG(
  trailingPE: number | null,
  earningsGrowth: number | null
): PEGCalculationResult {
  if (earningsGrowth === null || earningsGrowth === undefined || !Number.isFinite(earningsGrowth)) {
    return { peg: null, pegScore: 50, skipped: true, reason: 'no_growth_data' };
  }

  if (earningsGrowth <= 0) {
    return { peg: null, pegScore: 50, skipped: true, reason: 'negative_or_zero_growth' };
  }

  if (trailingPE === null || trailingPE === undefined || !Number.isFinite(trailingPE)) {
    return { peg: null, pegScore: 50, skipped: true, reason: 'no_pe_data' };
  }

  if (trailingPE < 0) {
    return { peg: null, pegScore: 50, skipped: true, reason: 'negative_pe' };
  }

  // earningsGrowth is provided as decimal (0.15 => 15%)
  const growthPercent = earningsGrowth * 100;
  const peg = trailingPE / growthPercent;
  const pegScore = clamp(mapPegToScore(peg), 0, 100);

  return {
    peg,
    pegScore,
    skipped: false,
  };
}
