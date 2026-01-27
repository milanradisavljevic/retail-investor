import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export type Interpretation = 'excellent' | 'good' | 'fair' | 'poor';

export interface ComponentBreakdown {
  name: string;
  value: string;
  comparison?: string;
  score: number;
  interpretation: Interpretation;
}

export interface PillarBreakdown {
  key: 'valuation' | 'quality' | 'technical' | 'risk';
  name: string;
  weight: number;
  score: number;
  weightedScore: number;
  components: ComponentBreakdown[];
}

export interface ScoreBreakdown {
  symbol: string;
  companyName: string;
  totalScore: number;
  pillars: Record<PillarBreakdown['key'], PillarBreakdown>;
}

const DEFAULT_WEIGHTS = {
  valuation: 0.25,
  quality: 0.25,
  technical: 0.25,
  risk: 0.25,
};

const VAL_THRESHOLDS = {
  pe: { low: 15, high: 30 },
  pb: { low: 1.5, high: 5 },
  ps: { low: 1, high: 5 },
};

const QUALITY_THRESHOLDS = {
  roe: { low: 0.05, high: 0.20 },
  debtEquity: { low: 0.5, high: 2 },
};

const TECH_THRESHOLDS = {
  return13w: { low: 0, high: 0.25 },
  return52w: { low: 0, high: 0.4 },
  pos52w: { low: 0.3, high: 0.9 },
};

const RISK_THRESHOLDS = {
  volatility: { low: 0.15, high: 0.45 },
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function interpret(score: number): Interpretation {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

function scoreLowerBetter(value: number | undefined | null, low: number, high: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 50;
  if (value <= low) return 90;
  if (value >= high) return 20;
  const ratio = (high - value) / (high - low);
  return clampScore(20 + ratio * 70);
}

function scoreHigherBetter(value: number | undefined | null, low: number, high: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 50;
  if (value >= high) return 90;
  if (value <= low) return 20;
  const ratio = (value - low) / (high - low);
  return clampScore(20 + ratio * 70);
}

function scoreCentered(value: number | undefined | null, target: number, tolerance: number): number {
  if (value === undefined || value === null || Number.isNaN(value)) return 50;
  const distance = Math.abs(value - target);
  if (distance <= tolerance) return 85;
  if (distance >= tolerance * 3) return 25;
  const ratio = (tolerance * 3 - distance) / (tolerance * 2);
  return clampScore(25 + ratio * 60);
}

function fmt(value: number | undefined | null, opts: { decimals?: number; suffix?: string } = {}): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  const decimals = opts.decimals ?? 1;
  const formatted = value.toFixed(decimals);
  return `${formatted}${opts.suffix ?? ''}`;
}

export function buildScoreBreakdown(
  score: RunV1SchemaJson['scores'][number],
  weights: Partial<Record<PillarBreakdown['key'], number>> = {}
): ScoreBreakdown {
  const w = { ...DEFAULT_WEIGHTS, ...weights } as Record<PillarBreakdown['key'], number>;
  const metrics = score.data_quality?.metrics ?? {};

  // Valuation metrics
  const pe = metrics.peRatio?.value as number | undefined;
  const pb = metrics.pbRatio?.value as number | undefined;
  const ps = metrics.psRatio?.value as number | undefined;

  const peScore = scoreLowerBetter(pe, VAL_THRESHOLDS.pe.low, VAL_THRESHOLDS.pe.high);
  const pbScore = scoreLowerBetter(pb, VAL_THRESHOLDS.pb.low, VAL_THRESHOLDS.pb.high);
  const psScore = scoreLowerBetter(ps, VAL_THRESHOLDS.ps.low, VAL_THRESHOLDS.ps.high);

  // Quality
  const roe = metrics.roe?.value as number | undefined;
  const de = metrics.debtToEquity?.value as number | undefined;

  const roeScore = scoreHigherBetter(roe ? roe / 100 : roe, QUALITY_THRESHOLDS.roe.low, QUALITY_THRESHOLDS.roe.high);
  const deScore = scoreLowerBetter(de, QUALITY_THRESHOLDS.debtEquity.low, QUALITY_THRESHOLDS.debtEquity.high);

  // Technical (may be absent)
  const ret13w = (metrics.priceReturn13Week?.value as number | undefined) ?? undefined;
  const ret52w = (metrics.priceReturn52Week?.value as number | undefined) ?? undefined;
  const pos52w = (metrics.high52Week?.value !== undefined && metrics.low52Week?.value !== undefined && metrics.currentPrice?.value !== undefined)
    ? (metrics.currentPrice.value - metrics.low52Week.value) / (metrics.high52Week.value - metrics.low52Week.value || 1)
    : undefined;

  const ret13Score = scoreHigherBetter(ret13w, TECH_THRESHOLDS.return13w.low, TECH_THRESHOLDS.return13w.high);
  const ret52Score = scoreHigherBetter(ret52w, TECH_THRESHOLDS.return52w.low, TECH_THRESHOLDS.return52w.high);
  const pos52Score = scoreHigherBetter(pos52w, TECH_THRESHOLDS.pos52w.low, TECH_THRESHOLDS.pos52w.high);

  // Risk
  const beta = metrics.beta?.value as number | undefined;
  const vol = metrics.volatility3Month?.value as number | undefined;

  const betaScore = scoreCentered(beta, 1, 0.15);
  const volScore = scoreLowerBetter(vol ? vol / 100 : vol, RISK_THRESHOLDS.volatility.low, RISK_THRESHOLDS.volatility.high);

  const pillars: ScoreBreakdown['pillars'] = {
    valuation: {
      key: 'valuation',
      name: 'Valuation',
      weight: w.valuation,
      score: score.evidence.valuation,
      weightedScore: score.evidence.valuation * w.valuation,
      components: [
        {
          name: 'P/E Ratio',
          value: fmt(pe),
          score: peScore,
          interpretation: interpret(peScore),
        },
        {
          name: 'P/B Ratio',
          value: fmt(pb),
          score: pbScore,
          interpretation: interpret(pbScore),
        },
        {
          name: 'P/S Ratio',
          value: fmt(ps),
          score: psScore,
          interpretation: interpret(psScore),
        },
      ],
    },
    quality: {
      key: 'quality',
      name: 'Quality',
      weight: w.quality,
      score: score.evidence.quality,
      weightedScore: score.evidence.quality * w.quality,
      components: [
        {
          name: 'ROE',
          value: fmt(roe, { decimals: 0, suffix: '%' }),
          score: roeScore,
          interpretation: interpret(roeScore),
        },
        {
          name: 'Debt/Equity',
          value: fmt(de, { decimals: 2 }),
          score: deScore,
          interpretation: interpret(deScore),
        },
      ],
    },
    technical: {
      key: 'technical',
      name: 'Technical',
      weight: w.technical,
      score: score.evidence.technical,
      weightedScore: score.evidence.technical * w.technical,
      components: [
        {
          name: '13W Return',
          value: ret13w !== undefined ? fmt(ret13w * 100, { decimals: 1, suffix: '%' }) : '—',
          score: ret13Score,
          interpretation: interpret(ret13Score),
        },
        {
          name: '52W Return',
          value: ret52w !== undefined ? fmt(ret52w * 100, { decimals: 1, suffix: '%' }) : '—',
          score: ret52Score,
          interpretation: interpret(ret52Score),
        },
        {
          name: '52W Position',
          value: pos52w !== undefined ? fmt(pos52w * 100, { decimals: 0, suffix: '%' }) : '—',
          score: pos52Score,
          interpretation: interpret(pos52Score),
        },
      ],
    },
    risk: {
      key: 'risk',
      name: 'Risk',
      weight: w.risk,
      score: score.evidence.risk,
      weightedScore: score.evidence.risk * w.risk,
      components: [
        {
          name: 'Beta',
          value: fmt(beta, { decimals: 2 }),
          score: betaScore,
          interpretation: interpret(betaScore),
        },
        {
          name: 'Volatility (3M)',
          value: vol !== undefined ? fmt(vol, { decimals: 0, suffix: '%' }) : '—',
          score: volScore,
          interpretation: interpret(volScore),
        },
      ],
    },
  };

  return {
    symbol: score.symbol,
    companyName: score.company_name || score.symbol,
    totalScore: score.total_score,
    pillars,
  };
}
