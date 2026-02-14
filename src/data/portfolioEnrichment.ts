import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PortfolioPosition, Currency, PillarScores } from '@/types/portfolio';
import { PHYSICAL_METALS, FX_RATES_TO_USD } from '@/types/portfolio';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';

interface MacroData {
  fetched_at: string;
  tickers: Record<string, {
    name: string;
    category: string;
    price_current: number | null;
    price_currency?: string;
  }>;
}

interface ScoreMap {
  [symbol: string]: {
    total_score: number;
    current_price?: number | null;
    pillar_scores?: PillarScores;
    sector?: string | null;
    industry?: string | null;
  };
}

let macroDataCache: MacroData | null = null;
let macroDataCacheTime: number = 0;

function loadMacroData(): MacroData | null {
  const now = Date.now();
  if (macroDataCache && (now - macroDataCacheTime) < 60000) {
    return macroDataCache;
  }
  
  const macroPath = join(process.cwd(), 'data', 'macro', 'commodities.json');
  if (!existsSync(macroPath)) {
    return null;
  }
  
  try {
    const content = readFileSync(macroPath, 'utf-8');
    macroDataCache = JSON.parse(content) as MacroData;
    macroDataCacheTime = now;
    return macroDataCache;
  } catch {
    return null;
  }
}

function getCommodityPrice(symbol: string): { price: number | null; name: string | null } {
  const metalInfo = PHYSICAL_METALS[symbol];
  if (!metalInfo) {
    return { price: null, name: null };
  }
  
  const macroData = loadMacroData();
  if (!macroData) {
    return { price: null, name: metalInfo.name };
  }
  
  const tickerData = macroData.tickers[metalInfo.priceTicker];
  if (!tickerData || tickerData.price_current === null) {
    return { price: null, name: metalInfo.name };
  }
  
  return { price: tickerData.price_current, name: metalInfo.name };
}

function loadLatestRun(): { run: RunV1SchemaJson; scoreMap: ScoreMap } | null {
  const loaded = getLatestRun();
  if (!loaded) {
    return null;
  }
  
  const scoreMap: ScoreMap = {};
  for (const score of loaded.run.scores) {
    scoreMap[score.symbol] = {
      total_score: score.total_score,
      current_price: score.price_target?.current_price ?? null,
      pillar_scores: {
        valuation: score.evidence?.valuation ?? 0,
        quality: score.evidence?.quality ?? 0,
        technical: score.evidence?.technical ?? 0,
        risk: score.evidence?.risk ?? 0,
      },
      sector: score.price_target_diagnostics?.inputs?.sector ?? null,
      industry: score.industry ?? score.price_target_diagnostics?.inputs?.industry ?? null,
    };
  }
  
  return { run: loaded.run, scoreMap };
}

function convertToUsd(value: number, currency: Currency): number {
  const rate = FX_RATES_TO_USD[currency] || 1;
  return value * rate;
}

export function enrichPositions(positions: PortfolioPosition[]): PortfolioPosition[] {
  const runData = loadLatestRun();
  const macroData = loadMacroData();
  
  return positions.map(position => {
    const enriched: PortfolioPosition = { ...position };
    
    if (position.asset_type === 'equity') {
      if (runData && runData.scoreMap[position.symbol]) {
        const scoreData = runData.scoreMap[position.symbol];
        enriched.current_price = scoreData.current_price ?? null;
        enriched.total_score = scoreData.total_score;
        enriched.pillar_scores = scoreData.pillar_scores ?? null;
        enriched.sector = scoreData.sector ?? null;
        enriched.industry = scoreData.industry ?? null;
      }
      
      const companyProfilePath = join(process.cwd(), 'data', 'fundamentals', `${position.symbol}.json`);
      if (existsSync(companyProfilePath)) {
        try {
          const profile = JSON.parse(readFileSync(companyProfilePath, 'utf-8'));
          enriched.display_name = profile.company_name || profile.name || position.symbol;
        } catch {
          enriched.display_name = position.symbol;
        }
      } else {
        enriched.display_name = position.symbol;
      }
    } else if (position.asset_type === 'commodity') {
      const { price, name } = getCommodityPrice(position.symbol);
      enriched.current_price = price;
      enriched.display_name = name || position.symbol;
    }
    
    if (enriched.current_price !== null && enriched.current_price !== undefined) {
      const priceInUsd = convertToUsd(enriched.current_price, position.currency);
      enriched.current_value_usd = position.quantity * priceInUsd;
      
      const buyPriceInUsd = convertToUsd(position.buy_price, position.currency);
      if (buyPriceInUsd > 0) {
        enriched.gain_loss_pct = (priceInUsd - buyPriceInUsd) / buyPriceInUsd;
      }
    }
    
    return enriched;
  });
}

export function calculatePortfolioSummary(positions: PortfolioPosition[]): {
  total_value_usd: number;
  equity_value_usd: number;
  commodity_value_usd: number;
  total_cost_usd: number;
  equity_cost_usd: number;
  commodity_cost_usd: number;
  equity_count: number;
  commodity_count: number;
  weighted_score_sum: number;
  scored_equity_value: number;
} {
  let total_value_usd = 0;
  let equity_value_usd = 0;
  let commodity_value_usd = 0;
  let total_cost_usd = 0;
  let equity_cost_usd = 0;
  let commodity_cost_usd = 0;
  let equity_count = 0;
  let commodity_count = 0;
  let weighted_score_sum = 0;
  let scored_equity_value = 0;
  
  for (const pos of positions) {
    const costInUsd = convertToUsd(pos.buy_price * pos.quantity, pos.currency);
    total_cost_usd += costInUsd;
    
    if (pos.asset_type === 'equity') {
      equity_count++;
      equity_cost_usd += costInUsd;
      
      if (pos.current_value_usd !== null && pos.current_value_usd !== undefined) {
        equity_value_usd += pos.current_value_usd;
        total_value_usd += pos.current_value_usd;
        
        if (pos.total_score !== null && pos.total_score !== undefined) {
          weighted_score_sum += pos.total_score * pos.current_value_usd;
          scored_equity_value += pos.current_value_usd;
        }
      } else {
        total_value_usd += costInUsd;
        equity_value_usd += costInUsd;
      }
    } else if (pos.asset_type === 'commodity') {
      commodity_count++;
      commodity_cost_usd += costInUsd;
      
      if (pos.current_value_usd !== null && pos.current_value_usd !== undefined) {
        commodity_value_usd += pos.current_value_usd;
        total_value_usd += pos.current_value_usd;
      } else {
        total_value_usd += costInUsd;
        commodity_value_usd += costInUsd;
      }
    }
  }
  
  return {
    total_value_usd,
    equity_value_usd,
    commodity_value_usd,
    total_cost_usd,
    equity_cost_usd,
    commodity_cost_usd,
    equity_count,
    commodity_count,
    weighted_score_sum,
    scored_equity_value,
  };
}

export function getPortfolioScore(
  weightedScoreSum: number,
  scoredEquityValue: number
): number | null {
  if (scoredEquityValue <= 0) {
    return null;
  }
  return weightedScoreSum / scoredEquityValue;
}
