/**
 * LLM Prompt Templates and Fallback Text Generation
 * Used when LLM is disabled or unavailable
 */

import type { RunV1SchemaJson } from '@/types/generated/run_v1';

export interface SymbolNarrative {
  symbol: string;
  whyNow: string;
  thesisBullets: string[];
  riskBullets: string[];
}

export type MarketBullets = [] | [string] | [string, string] | [string, string, string];

export function generateMarketSummaryBullets(run: RunV1SchemaJson): MarketBullets {
  const topScore = run.scores
    .filter((s) => run.selections.top5.includes(s.symbol))
    .reduce((max, s) => Math.max(max, s.total_score), 0);

  const avgScore =
    run.scores.reduce((sum, s) => sum + s.total_score, 0) / run.scores.length;

  const pickOfDay = run.selections.pick_of_the_day;
  const pickScore = run.scores.find((s) => s.symbol === pickOfDay)?.total_score ?? 0;

  return [
    `Universe average score: ${avgScore.toFixed(1)}/100 across ${run.scores.length} symbols`,
    `Top pick ${pickOfDay} scores ${pickScore.toFixed(1)}/100 with balanced evidence`,
    `Analysis based on data as of ${run.as_of_date}`,
  ] as MarketBullets;
}

export function generateSymbolNarrative(
  symbol: string,
  run: RunV1SchemaJson
): SymbolNarrative {
  const score = run.scores.find((s) => s.symbol === symbol);
  if (!score) {
    return {
      symbol,
      whyNow: 'Insufficient data for analysis',
      thesisBullets: [],
      riskBullets: ['Missing scoring data'],
    };
  }

  const { valuation, quality, technical, risk } = score.evidence;

  // Generate why now
  const whyNow = generateWhyNow(symbol, score);

  // Generate thesis bullets based on pillars
  const thesisBullets: string[] = [];
  if (valuation >= 60) {
    thesisBullets.push(`Attractive valuation with ${valuation.toFixed(0)}/100 score`);
  }
  if (quality >= 60) {
    thesisBullets.push(`Strong quality metrics indicating business health`);
  }
  if (technical >= 60) {
    thesisBullets.push(`Positive technical momentum and trend alignment`);
  }
  if (risk >= 60) {
    thesisBullets.push(`Favorable risk profile with manageable volatility`);
  }

  // Ensure at least one bullet
  if (thesisBullets.length === 0) {
    thesisBullets.push(`Overall score of ${score.total_score.toFixed(1)}/100`);
  }

  // Generate risk bullets
  const riskBullets: string[] = [];
  if (valuation < 40) {
    riskBullets.push(`Valuation concerns (${valuation.toFixed(0)}/100)`);
  }
  if (quality < 40) {
    riskBullets.push(`Quality metrics below threshold`);
  }
  if (technical < 40) {
    riskBullets.push(`Weak technical indicators`);
  }
  if (risk < 40) {
    riskBullets.push(`Elevated risk profile`);
  }
  if ((score.data_quality.missing_fields?.length ?? 0) > 0) {
    riskBullets.push(`Incomplete data for some metrics`);
  }

  // Ensure at least one risk bullet
  if (riskBullets.length === 0) {
    riskBullets.push(`Standard market and sector risks apply`);
  }

  return {
    symbol,
    whyNow,
    thesisBullets: thesisBullets.slice(0, 4),
    riskBullets: riskBullets.slice(0, 3),
  };
}

function generateWhyNow(
  symbol: string,
  score: RunV1SchemaJson['scores'][0]
): string {
  const { valuation, quality, technical, risk } = score.evidence;
  const pillars = [
    { name: 'valuation', value: valuation },
    { name: 'quality', value: quality },
    { name: 'technical', value: technical },
    { name: 'risk profile', value: risk },
  ];

  // Sort by value to find strengths
  pillars.sort((a, b) => b.value - a.value);

  const topPillars = pillars
    .filter((p) => p.value >= 60)
    .slice(0, 2)
    .map((p) => p.name);

  if (topPillars.length >= 2) {
    return `${symbol} shows strength in ${topPillars[0]} and ${topPillars[1]}, warranting further research.`;
  } else if (topPillars.length === 1) {
    return `${symbol} demonstrates notable ${topPillars[0]} characteristics worth monitoring.`;
  } else {
    return `${symbol} presents a balanced profile requiring careful consideration of all factors.`;
  }
}

export function generateRecommendationLabel(
  totalScore: number
): 'strong_recommendation_to_buy' | 'medium_recommendation_to_buy' | 'weak_recommendation_to_buy' | 'clear_hold' | 'uncertain_hold' {
  if (totalScore >= 80) return 'strong_recommendation_to_buy';
  if (totalScore >= 70) return 'medium_recommendation_to_buy';
  if (totalScore >= 60) return 'weak_recommendation_to_buy';
  if (totalScore >= 50) return 'clear_hold';
  return 'uncertain_hold';
}

export function getConfidenceFromScore(totalScore: number, dataQualityIssues: number): number {
  // Base confidence from score
  let confidence = Math.min(totalScore, 95);

  // Reduce for data quality issues
  confidence -= dataQualityIssues * 5;

  return Math.max(20, Math.min(95, confidence));
}
