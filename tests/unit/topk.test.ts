import { describe, expect, it } from 'vitest';
import { selectTopK } from '@/scoring/topk';
import type { SymbolScore } from '@/scoring/engine';

function makeScore(symbol: string, score: number, isScanOnly?: boolean): SymbolScore {
  return {
    symbol,
    totalScore: score,
    breakdown: { fundamental: score, technical: score },
    evidence: { valuation: score, quality: score, technical: score, risk: score },
    dataQuality: {
      dataQualityScore: 80,
      dataQualityConfidence: 0.8,
      completenessRatio: 1,
      imputedRatio: 0,
      missingCritical: [],
      metrics: {},
      missingFields: [],
      assumptions: [],
      adjustedPriceMode: 'adjusted',
    },
    priceTarget: null,
    priceTargetDiagnostics: null,
    isScanOnly,
    raw: {
       fundamental: {
         total: score,
         components: { valuation: score, quality: score },
         breakdown: {
           peScore: score,
           pbScore: score,
           psScore: score,
           roeScore: score,
           roaScore: score,
           debtEquityScore: score,
           grossMarginScore: score,
           fcfYieldScore: score,
         },
         missingFields: [],
         assumptions: [],
       },
      technical: {
        total: score,
        components: { trend: score, momentum: score, volatility: score },
        indicators: {
          currentPrice: null,
          high52Week: null,
          low52Week: null,
          priceReturn13Week: null,
          priceReturn52Week: null,
          beta: null,
          volatility3Month: null,
          position52Week: null,
        },
        missingFields: [],
        assumptions: [],
      },
    },
  };
}

describe('selectTopK', () => {
  it('is deterministic for equal scores by symbol', () => {
    const scores = [
      makeScore('ZZZ', 80),
      makeScore('AAA', 80),
      makeScore('MMM', 80),
    ];
    const top = selectTopK(scores, 2);
    expect(top.map((s) => s.symbol)).toEqual(['AAA', 'MMM']);
  });

  it('respects k and original scores', () => {
    const scores = [
      makeScore('A', 10),
      makeScore('B', 90),
      makeScore('C', 50),
    ];
    const top = selectTopK(scores, 2);
    expect(top.map((s) => s.symbol)).toEqual(['B', 'C']);
  });
});
