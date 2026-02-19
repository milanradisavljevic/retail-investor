import type { PillarWeights, FundamentalThresholds } from '@/scoring/scoring_config';
import type { MarketDataSnapshot, PillarScores, ScoreResult } from './types';
import { calculatePEG } from '@/scoring/formulas/peg';

const clamp01 = (v: number) => Math.min(100, Math.max(0, v));

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function resolveEarningsGrowthDecimal(f: MarketDataSnapshot['fundamentals']): number | null {
  if (!f) return null;
  const raw = f.raw as Record<string, unknown> | undefined;
  const rawBasic = raw?.basicFinancials as Record<string, unknown> | undefined;
  const rawCandidates = [
    toFiniteNumber(raw?.earningsGrowthTTM),
    toFiniteNumber(rawBasic?.earningsGrowth),
    toFiniteNumber(raw?.earningsGrowth),
  ];

  for (const candidate of rawCandidates) {
    if (candidate !== null) return candidate;
  }

  const fallback = toFiniteNumber(f.earningsGrowth);
  if (fallback === null) return null;
  return Math.abs(fallback) > 3 ? fallback / 100 : fallback;
}

function scoreValuation(
  f: MarketDataSnapshot['fundamentals'],
  t: FundamentalThresholds,
  options?: { useGarpPeg?: boolean }
): number {
  if (!f) return 50;

  const triples: Array<[number | null | undefined, { low: number; high: number }]> = [
    [f.peRatio ?? (f as any).pe ?? null, t.pe],
    [f.pbRatio ?? (f as any).pb ?? null, t.pb],
    [f.psRatio ?? (f as any).ps ?? null, t.ps],
  ];

  const parts: Array<{ score: number; present: boolean }> = triples.map(([m, thr]) => {
    if (m == null) return { score: 50, present: false };

    let score: number;
    if (m <= thr.low) {
      score = 100;
    } else if (m <= thr.high) {
      const span = thr.high - thr.low || 1;
      score = 100 - ((m - thr.low) / span) * 40;
    } else {
      const excess = Math.min((m - thr.high) / thr.high, 1.5);
      score = Math.max(10, 60 - excess * 40);
    }
    return { score, present: true };
  });

  // FCF Yield (higher is better)
  const fcf = f.freeCashFlow;
  const mktCap = f.marketCap;
  let fcfYieldPart: { score: number; present: boolean } = { score: 50, present: false };
  if (fcf != null && mktCap != null && mktCap > 0) {
    const fcfYield = (fcf / mktCap) * 100;
    if (fcfYield < 0) {
      fcfYieldPart = { score: 0, present: true };
    } else if (fcfYield >= t.fcfYield.high) {
      fcfYieldPart = { score: 95, present: true };
    } else if (fcfYield >= t.fcfYield.low) {
      const span = t.fcfYield.high - t.fcfYield.low || 1;
      fcfYieldPart = { score: ((fcfYield - t.fcfYield.low) / span) * 95, present: true };
    } else {
      fcfYieldPart = { score: 0, present: true };
    }
  }
  parts.push(fcfYieldPart);

  const presentParts = parts.filter((p) => p.present);
  if (presentParts.length < 2) return 0;

  const baseValuation = clamp01(
    presentParts.reduce((sum, p) => sum + p.score, 0) / presentParts.length
  );
  if (!options?.useGarpPeg) return baseValuation;

  const trailingPE = f.peRatio ?? (f as any).pe ?? null;
  const pegResult = calculatePEG(trailingPE, resolveEarningsGrowthDecimal(f));
  return clamp01(baseValuation * 0.7 + pegResult.pegScore * 0.3);
}

function scoreQuality(f: MarketDataSnapshot['fundamentals'], t: FundamentalThresholds): number {
  if (!f) return 50;

  const components: number[] = [];

  // ROE (higher is better)
  const roe = f.roe;
  if (roe != null) {
    if (roe >= t.roe.high) {
      components.push(95);
    } else if (roe >= t.roe.low) {
      const span = t.roe.high - t.roe.low || 1;
      components.push(((roe - t.roe.low) / span) * 95);
    } else {
      components.push(0);
    }
  }

  // D/E (lower is better)
  const de = f.debtToEquity;
  if (de != null) {
    if (de < 0) {
      components.push(0);
    } else if (de <= t.debtEquity.low) {
      components.push(95);
    } else if (de <= t.debtEquity.high) {
      const span = t.debtEquity.high - t.debtEquity.low || 1;
      components.push(95 - ((de - t.debtEquity.low) / span) * 95);
    } else {
      components.push(0);
    }
  }

  // Gross Margin (higher is better)
  const gm = f.grossMargin;
  if (gm != null) {
    if (gm >= t.grossMargin.high) {
      components.push(95);
    } else if (gm >= t.grossMargin.low) {
      const span = t.grossMargin.high - t.grossMargin.low || 1;
      components.push(((gm - t.grossMargin.low) / span) * 95);
    } else {
      components.push(0);
    }
  }

  if (components.length < 2) return 0;
  return clamp01(components.reduce((a, b) => a + b, 0) / components.length);
}

function scoreTechnical(tech: MarketDataSnapshot['technical']): number {
  const { return5d, return13w, return26w, return52w, high52w, low52w, currentPrice } = tech;
  const hasReturns = return13w != null || return26w != null || return52w != null;
  const momentumParts: number[] = [];

  if (return13w != null) {
    momentumParts.push(clamp01(((return13w + 0.3) / 0.6) * 100));
  }

  if (return26w != null) {
    momentumParts.push(clamp01(((return26w + 0.4) / 0.8) * 100));
  }

  if (return52w != null) {
    const shortTermComponent = return5d != null ? return5d * 4 : 0;
    const momentum12m1m = return52w - shortTermComponent;
    momentumParts.push(clamp01(((momentum12m1m + 0.5) / 1.0) * 100));
  }

  const momentum =
    momentumParts.length > 0
      ? momentumParts.reduce((a, b) => a + b, 0) / momentumParts.length
      : 50;

  let rangeScore = 50;
  if (currentPrice && high52w && low52w && high52w > low52w) {
    const pos = (currentPrice - low52w) / (high52w - low52w);
    if (pos >= 0.6 && pos <= 0.8) rangeScore = 80 + (pos - 0.6) * 50; // 80-90
    else if (pos > 0.8) rangeScore = 90 - (pos - 0.8) * 40; // 90-82
    else if (pos >= 0.4) rangeScore = 60 + (pos - 0.4) * 50; // 60-70
    else rangeScore = Math.max(20, pos * 100);
  }
  return hasReturns ? clamp01(momentum * 0.6 + rangeScore * 0.4) : rangeScore;
}

function scoreRisk(tech: MarketDataSnapshot['technical']): number {
  const vol = tech.volatility3m;
  if (vol == null) return 50;
  if (vol <= 15) return 100;
  if (vol <= 25) return 85 + (25 - vol) * 1.5;
  if (vol <= 30) return 70 + (30 - vol) * 4;
  if (vol <= 35) return 50 + (35 - vol) * 4;
  if (vol <= 40) return Math.max(10, (40 - vol) * 2);
  return 5;
}

export function scoreSymbolPure(
  snapshot: MarketDataSnapshot,
  weights: PillarWeights,
  thresholds: FundamentalThresholds
): ScoreResult {
  const isGarpPreset = (process.env.SCORING_PRESET || process.env.PRESET || '').toLowerCase() === 'garp';
  const pillars: PillarScores = {
    valuation: scoreValuation(snapshot.fundamentals, thresholds, { useGarpPeg: isGarpPreset }),
    quality: scoreQuality(snapshot.fundamentals, thresholds),
    technical: scoreTechnical(snapshot.technical),
    risk: scoreRisk(snapshot.technical),
  };

  const total =
    pillars.valuation * weights.valuation +
    pillars.quality * weights.quality +
    pillars.technical * weights.technical +
    pillars.risk * weights.risk;

  return { total, pillars };
}
