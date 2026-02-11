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
  const parts = triples.map(([m, thr]) => {
    if (m == null) return 50;
    if (m <= thr.low) return 100;
    if (m <= thr.high) {
      const span = thr.high - thr.low || 1;
      return 100 - ((m - thr.low) / span) * 40;
    }
    const excess = Math.min((m - thr.high) / thr.high, 1.5);
    return Math.max(10, 60 - excess * 40);
  });
  const baseValuation = clamp01(parts.reduce((a, b) => a + b, 0) / parts.length);
  if (!options?.useGarpPeg) return baseValuation;

  const trailingPE = f.peRatio ?? (f as any).pe ?? null;
  const pegResult = calculatePEG(trailingPE, resolveEarningsGrowthDecimal(f));
  return clamp01(baseValuation * 0.7 + pegResult.pegScore * 0.3);
}

function scoreQuality(f: MarketDataSnapshot['fundamentals'], t: FundamentalThresholds): number {
  if (!f) return 50;
  const roe = f.roe;
  const de = f.debtToEquity;
  let score = 50;
  if (roe != null) {
    if (roe >= t.roe.high) score += 25;
    else if (roe >= t.roe.low) score += 10;
    else score -= 10;
  }
  if (de != null) {
    if (de <= t.debtEquity.low) score += 15;
    else if (de <= t.debtEquity.high) score += 5;
    else score -= 15;
  }
  return clamp01(score);
}

function scoreTechnical(tech: MarketDataSnapshot['technical']): number {
  const { return13w, return26w, high52w, low52w, currentPrice } = tech;
  const hasReturns = return13w != null || return26w != null;
  const r13 = return13w ?? 0;
  const r26 = return26w ?? r13;
  const momentum = clamp01(((r13 * 0.6 + r26 * 0.4) + 0.5) * 100);

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
