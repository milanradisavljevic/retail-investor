import type { FundamentalsData } from '@/data/repositories/fundamentals_repo';

export interface TechnicalSnapshot {
  currentPrice: number | null;
  return13w: number | null;
  return26w: number | null;
  high52w: number | null;
  low52w: number | null;
  volatility3m: number | null;
}

export interface MarketDataSnapshot {
  symbol: string;
  date: string;
  fundamentals: FundamentalsData | null;
  technical: TechnicalSnapshot;
  sector?: string | null;
  industry?: string | null;
}

export interface PillarScores {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

export interface ScoreResult {
  total: number;
  pillars: PillarScores;
}
