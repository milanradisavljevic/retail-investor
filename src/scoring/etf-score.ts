import type { ETFScoreData } from '@/types/etf';
import { roundScore } from './normalize';

export interface ETFScoringInput {
  expenseRatio: number | null;
  technicalScore: number | null;
  riskScore: number | null;
}

export function calculateExpenseRatioScore(expenseRatio: number | null): number | null {
  if (expenseRatio === null || expenseRatio === undefined) {
    return null;
  }

  const er = expenseRatio * 100;

  if (er <= 0.05) return 100;
  if (er <= 0.10) return 95;
  if (er <= 0.15) return 90;
  if (er <= 0.20) return 80;
  if (er <= 0.30) return 70;
  if (er <= 0.40) return 60;
  if (er <= 0.50) return 55;
  if (er <= 0.75) return 45;
  if (er <= 1.00) return 35;
  if (er <= 1.50) return 20;
  if (er <= 2.00) return 10;
  return 0;
}

export function calculateETFScore(
  ticker: string,
  input: ETFScoringInput
): ETFScoreData {
  const { expenseRatio, technicalScore, riskScore } = input;

  const expenseRatioScore = calculateExpenseRatioScore(expenseRatio);

  const hasTechnical = technicalScore !== null;
  const hasRisk = riskScore !== null;
  const hasER = expenseRatioScore !== null;

  let combinedScore: number | null = null;

  if (hasTechnical && hasRisk && hasER) {
    combinedScore = roundScore(
      technicalScore * 0.4 + riskScore * 0.4 + expenseRatioScore * 0.2
    );
  } else if (hasTechnical && hasRisk) {
    combinedScore = roundScore((technicalScore + riskScore) / 2);
  }

  return {
    ticker,
    technical_score: technicalScore,
    risk_score: riskScore,
    combined_score: combinedScore,
    expense_ratio_score: expenseRatioScore,
  };
}

export function calculateETFScoreFromPillars(
  ticker: string,
  technicalPillar: number | null,
  riskPillar: number | null,
  expenseRatio: number | null
): ETFScoreData {
  const technicalScore = technicalPillar;
  const riskScore = riskPillar;

  return calculateETFScore(ticker, {
    expenseRatio,
    technicalScore,
    riskScore,
  });
}
