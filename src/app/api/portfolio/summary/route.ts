export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getPositions } from '@/data/portfolio';
import { enrichPositions, calculatePortfolioSummary, getPortfolioScore } from '@/data/portfolioEnrichment';
import type { PortfolioSummary } from '@/types/portfolio';
import { getDatabase } from '@/data/db';
import { getAuthUserId } from '@/lib/auth';

export async function GET() {
  try {
    const userId = await getAuthUserId();
    getDatabase();
    
    const positions = getPositions(userId);
    const enrichedPositions = enrichPositions(positions);
    const summary = calculatePortfolioSummary(enrichedPositions);
    
    const portfolioScore = getPortfolioScore(
      summary.weighted_score_sum,
      summary.scored_equity_value
    );
    
    const totalGainLossPct = summary.total_cost_usd > 0
      ? (summary.total_value_usd - summary.total_cost_usd) / summary.total_cost_usd
      : 0;
    
    const equityPct = summary.total_value_usd > 0
      ? summary.equity_value_usd / summary.total_value_usd
      : 0;
    
    const commodityPct = summary.total_value_usd > 0
      ? summary.commodity_value_usd / summary.total_value_usd
      : 0;
    
    const response: PortfolioSummary = {
      total_value_usd: Math.round(summary.total_value_usd * 100) / 100,
      equity_value_usd: Math.round(summary.equity_value_usd * 100) / 100,
      commodity_value_usd: Math.round(summary.commodity_value_usd * 100) / 100,
      total_gain_loss_pct: Math.round(totalGainLossPct * 10000) / 10000,
      portfolio_score: portfolioScore !== null ? Math.round(portfolioScore * 100) / 100 : null,
      equity_pct: Math.round(equityPct * 10000) / 10000,
      commodity_pct: Math.round(commodityPct * 10000) / 10000,
      position_count: enrichedPositions.length,
      equity_count: summary.equity_count,
      commodity_count: summary.commodity_count,
      last_updated: new Date().toISOString(),
    };
    
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[API /portfolio/summary] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load portfolio summary', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
