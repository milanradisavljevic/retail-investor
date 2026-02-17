import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PortfolioPosition, Currency, PillarScores } from '@/types/portfolio';
import { PHYSICAL_METALS, FX_RATES_TO_USD } from '@/types/portfolio';
import type { MacroCategory, MacroTickerData } from '@/types/macro';
import type { ETFMetadata } from '@/types/etf';
import { getLatestRun } from '@/lib/runLoader';
import type { RunV1SchemaJson } from '@/types/generated/run_v1';
import { calculateETFScoreFromPillars } from '@/scoring/etf-score';

type RunScoreEntry = RunV1SchemaJson['scores'][number];
type MacroTickerSnapshot = Pick<MacroTickerData, 'name' | 'category' | 'price_current'> & {
  price_currency?: string;
};

interface MacroDataFile {
  fetched_at: string;
  tickers: Record<string, MacroTickerSnapshot>;
}

interface CompanyProfileFile {
  company_name?: string;
  name?: string;
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

let macroDataCache: MacroDataFile | null = null;
let macroDataCacheTime: number = 0;

let etfMetadataCache: Record<string, RawETFMetadata> | null = null;

interface RawETFMetadata {
  name: string;
  ticker: string;
  expense_ratio: number | null;
}

function loadETFMetadata(): Record<string, RawETFMetadata> {
  if (etfMetadataCache) {
    return etfMetadataCache;
  }

  const etfPath = join(process.cwd(), 'data', 'etf', 'metadata.json');
  if (!existsSync(etfPath)) {
    return {};
  }

  try {
    const content = readFileSync(etfPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isObject(parsed) || !isObject(parsed.etfs)) {
      return {};
    }
    etfMetadataCache = parsed.etfs as Record<string, RawETFMetadata>;
    return etfMetadataCache;
  } catch {
    return {};
  }
}

function isETFSymbol(symbol: string): boolean {
  const etfMetadata = loadETFMetadata();
  return symbol in etfMetadata;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMacroCategory(value: unknown): value is MacroCategory {
  return (
    value === 'precious_metals'
    || value === 'base_metals'
    || value === 'energy'
    || value === 'agriculture'
    || value === 'rates'
    || value === 'currency'
  );
}

function parseMacroData(content: string): MacroDataFile | null {
  const parsed: unknown = JSON.parse(content);
  if (!isObject(parsed) || !isObject(parsed.tickers) || typeof parsed.fetched_at !== 'string') {
    return null;
  }

  const normalizedTickers: Record<string, MacroTickerSnapshot> = {};
  for (const [ticker, value] of Object.entries(parsed.tickers)) {
    if (!isObject(value)) continue;
    if (typeof value.name !== 'string' || !isMacroCategory(value.category)) continue;
    if (value.price_current !== null && typeof value.price_current !== 'number') continue;
    if (value.price_currency !== undefined && typeof value.price_currency !== 'string') continue;

    normalizedTickers[ticker] = {
      name: value.name,
      category: value.category,
      price_current: value.price_current,
      price_currency: value.price_currency,
    };
  }

  return {
    fetched_at: parsed.fetched_at,
    tickers: normalizedTickers,
  };
}

function parseCompanyProfile(content: string): CompanyProfileFile | null {
  const parsed: unknown = JSON.parse(content);
  if (!isObject(parsed)) {
    return null;
  }

  return {
    company_name: typeof parsed.company_name === 'string' ? parsed.company_name : undefined,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
  };
}

function loadMacroData(): MacroDataFile | null {
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
    const parsed = parseMacroData(content);
    if (!parsed) {
      return null;
    }
    macroDataCache = parsed;
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
  for (const score of loaded.run.scores as RunScoreEntry[]) {
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
  const etfMetadata = loadETFMetadata();
  
  return positions.map(position => {
    const enriched: PortfolioPosition = { ...position };
    
    const isETF = isETFSymbol(position.symbol);
    if (isETF && position.asset_type === 'equity') {
      enriched.asset_type = 'etf';
    }
    
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
          const profile = parseCompanyProfile(readFileSync(companyProfilePath, 'utf-8'));
          enriched.display_name = profile?.company_name || profile?.name || position.symbol;
        } catch {
          enriched.display_name = position.symbol;
        }
      } else {
        enriched.display_name = position.symbol;
      }
    } else if (position.asset_type === 'etf') {
      const etfMeta = etfMetadata[position.symbol];
      enriched.display_name = etfMeta?.name || position.symbol;
      
      if (runData && runData.scoreMap[position.symbol]) {
        const scoreData = runData.scoreMap[position.symbol];
        enriched.current_price = scoreData.current_price ?? null;
        
        const technicalPillar = scoreData.pillar_scores?.technical ?? null;
        const riskPillar = scoreData.pillar_scores?.risk ?? null;
        const expenseRatio = etfMeta?.expense_ratio ?? null;
        
        const etfScore = calculateETFScoreFromPillars(
          position.symbol,
          technicalPillar,
          riskPillar,
          expenseRatio
        );
        
        enriched.total_score = etfScore.combined_score;
        enriched.pillar_scores = {
          valuation: 50,
          quality: 50,
          technical: technicalPillar ?? 50,
          risk: riskPillar ?? 50,
        };
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
  etf_value_usd: number;
  total_cost_usd: number;
  equity_cost_usd: number;
  commodity_cost_usd: number;
  etf_cost_usd: number;
  equity_count: number;
  commodity_count: number;
  etf_count: number;
  weighted_score_sum: number;
  scored_equity_value: number;
} {
  let total_value_usd = 0;
  let equity_value_usd = 0;
  let commodity_value_usd = 0;
  let etf_value_usd = 0;
  let total_cost_usd = 0;
  let equity_cost_usd = 0;
  let commodity_cost_usd = 0;
  let etf_cost_usd = 0;
  let equity_count = 0;
  let commodity_count = 0;
  let etf_count = 0;
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
    } else if (pos.asset_type === 'etf') {
      etf_count++;
      etf_cost_usd += costInUsd;
      
      if (pos.current_value_usd !== null && pos.current_value_usd !== undefined) {
        etf_value_usd += pos.current_value_usd;
        total_value_usd += pos.current_value_usd;
        
        if (pos.total_score !== null && pos.total_score !== undefined) {
          weighted_score_sum += pos.total_score * pos.current_value_usd;
          scored_equity_value += pos.current_value_usd;
        }
      } else {
        total_value_usd += costInUsd;
        etf_value_usd += costInUsd;
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
    etf_value_usd,
    total_cost_usd,
    equity_cost_usd,
    commodity_cost_usd,
    etf_cost_usd,
    equity_count,
    commodity_count,
    etf_count,
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
