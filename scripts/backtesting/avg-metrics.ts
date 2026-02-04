import type { FundamentalsData } from '../../src/data/repositories/fundamentals_repo';
import type { TechnicalMetrics } from '../../src/providers/types';

export type AvgMetrics = {
  // Valuation
  pe?: number;
  pb?: number;
  ps?: number;
  dividendYield?: number;
  ev_ebitda?: number;
  // Quality
  roe?: number;
  roic?: number;
  grossMargin?: number;
  operatingMargin?: number;
  debtEquity?: number;
  currentRatio?: number;
  // Risk
  beta?: number;
  volatility?: number;
  // Size
  marketCap?: number;
  dataPoints: number;
};

function avg(values: (number | null | undefined)[]): number | undefined {
  const valid = values.filter((v): v is number => typeof v === 'number' && !isNaN(v));
  if (valid.length === 0) return undefined;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function calculateAvgMetrics(
  symbols: string[],
  fundamentals: Map<string, FundamentalsData>,
  technicals?: Map<string, TechnicalMetrics>
): AvgMetrics {
  const mets: Record<keyof Omit<AvgMetrics, 'dataPoints'>, number[]> = {
    pe: [],
    pb: [],
    ps: [],
    dividendYield: [],
    ev_ebitda: [],
    roe: [],
    roic: [],
    grossMargin: [],
    operatingMargin: [],
    debtEquity: [],
    currentRatio: [],
    beta: [],
    volatility: [],
    marketCap: [],
  } as any;

  for (const sym of symbols) {
    const f = fundamentals.get(sym);
    if (f) {
      if (f.peRatio) mets.pe.push(f.peRatio);
      if (f.pbRatio) mets.pb.push(f.pbRatio);
      if (f.psRatio) mets.ps.push(f.psRatio);
      if (f.dividendYield !== null && f.dividendYield !== undefined) mets.dividendYield.push(f.dividendYield);
      if (f.evToEbitda !== null && f.evToEbitda !== undefined) mets.ev_ebitda.push(f.evToEbitda);
      if (f.roe) mets.roe.push(f.roe);
      if (f.roic) mets.roic.push(f.roic as number);
      if (f.grossMargin !== null && f.grossMargin !== undefined) mets.grossMargin.push(f.grossMargin);
      if (f.operatingMargin !== null && f.operatingMargin !== undefined) mets.operatingMargin.push(f.operatingMargin);
      if (f.debtToEquity !== null && f.debtToEquity !== undefined) mets.debtEquity.push(f.debtToEquity);
      if (f.currentRatio !== null && f.currentRatio !== undefined) mets.currentRatio.push(f.currentRatio);
      if (f.beta !== null && f.beta !== undefined) mets.beta.push(f.beta);
      if (f.marketCap !== null && f.marketCap !== undefined) mets.marketCap.push(f.marketCap);
    }
    if (technicals) {
      const t = technicals.get(sym);
      if (t?.volatility3Month !== null && t?.volatility3Month !== undefined) {
        mets.volatility.push(t.volatility3Month * 100);
      }
      if (t?.beta !== null && t?.beta !== undefined) {
        mets.beta.push(t.beta);
      }
    }
  }

  return {
    pe: avg(mets.pe),
    pb: avg(mets.pb),
    ps: avg(mets.ps),
    dividendYield: avg(mets.dividendYield),
    ev_ebitda: avg(mets.ev_ebitda),
    roe: avg(mets.roe),
    roic: avg(mets.roic),
    grossMargin: avg(mets.grossMargin),
    operatingMargin: avg(mets.operatingMargin),
    debtEquity: avg(mets.debtEquity),
    currentRatio: avg(mets.currentRatio),
    beta: avg(mets.beta),
    volatility: avg(mets.volatility),
    marketCap: avg(mets.marketCap),
    dataPoints: symbols.length,
  };
}
