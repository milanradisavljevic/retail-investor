/**
 * Backtesting Runner
 *
 * Simulates configurable rebalancing strategy (monthly/quarterly/annually) using historical data.
 * Buy Top N stocks at rebalance dates, hold until next rebalance.
 *
 * Usage: npx tsx scripts/backtesting/run-backtest.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { calculateMetrics, type DailyRecord, type BacktestSummary, type RebalanceEvent } from './calculate-metrics';
import { calculateHybridScore, type HybridScoreInput } from './hybrid-scoring';
import { calculateAvgMetrics } from './avg-metrics';
import { YFinanceProvider } from '../../src/providers/yfinance_provider';
import { MarketDataDB, type PriceRow } from '../../src/data/market-data-db';
import type { FundamentalsData } from '../../src/data/repositories/fundamentals_repo';
import type { TechnicalMetrics } from '../../src/providers/types';
import { runDataIntegrityGate } from '../audit/data_integrity_gate';
import { calculatePEG } from '../../src/scoring/formulas/peg';
import {
  getScoringConfig,
  loadPresetStrict,
  type RawPresetConfig,
  type PillarWeights,
  type FundamentalThresholds,
} from '../../src/scoring/scoring_config';
import { rankStocksWithPreset } from './rank_stocks_preset';
import { detectRegime, type RegimeLabel, type RegimeResult } from '../../src/regime/engine';
import { computeRegimeHistory } from '../../src/regime/history';

// Configuration
const HISTORICAL_DIR = path.join(process.cwd(), 'data/backtesting/historical');
const OUTPUT_DIR = path.join(process.cwd(), 'data/backtesting');
const RUNS_DIR = path.join(OUTPUT_DIR, 'runs');
const START_DATE = process.env.BACKTEST_START || '2015-01-01';
const END_DATE = process.env.BACKTEST_END || '2025-12-31';
const INITIAL_CAPITAL = 100_000;
const TOP_N = Number(process.env.TOP_N || 10);
const MIN_MARKET_CAP = Number(process.env.MIN_MARKET_CAP || 1_000_000_000); // $1B default
const MAX_ANNUALIZED_VOL = Number(process.env.MAX_ANNUALIZED_VOL || 25); // % cap for shield-style filters
const MC_CANDIDATE_LIMIT = Number(process.env.MC_CANDIDATE_LIMIT || 200);
const FUND_FETCH_TIMEOUT_MS = Number(process.env.FUND_FETCH_TIMEOUT_MS || 4000);
const MARKET_DB_PATH = process.env.MARKET_DB_PATH || path.join(process.cwd(), 'data', 'market-data.db');
const MARKET_DB_ENABLED =
  (process.env.DATA_SOURCE || '').toLowerCase() === 'db' ||
  process.env.USE_MARKET_DB === 'true' ||
  process.env.USE_MARKET_DB === '1' ||
  (fs.existsSync(MARKET_DB_PATH) && (process.env.DATA_SOURCE || '').toLowerCase() !== 'csv');

// Preset + scoring mode
const PRESET = (process.env.PRESET || process.env.SCORING_PRESET || '').toLowerCase();
const HOLD_BUFFER = Number(process.env.HOLD_BUFFER || 5); // how many extra ranks we allow before selling
type ScoringMode = 'momentum' | 'hybrid' | 'shield';
const SCORING_MODE: ScoringMode = (() => {
  const env = (process.env.SCORING_MODE || '').toLowerCase();
  if (env === 'momentum') return 'momentum';
  if (env === 'shield') return 'shield';
  if (PRESET === 'shield') return 'shield';
  return 'hybrid';
})();

type RebalanceFrequency = 'monthly' | 'quarterly' | 'annually' | 'semiannual';
const REBALANCE_FREQUENCY: RebalanceFrequency = (() => {
  const env = (process.env.REBALANCING || 'quarterly').toLowerCase();
  if (env === 'monthly' || env === 'quarterly' || env === 'annually') return env;
  if (env === 'semi-annual' || env === 'semiannual' || env === 'semi') return 'semiannual';
  return 'quarterly';
})();

// Slippage and transaction costs
interface SlippageModel {
  type: 'optimistic' | 'realistic' | 'conservative';
  buySlippage: number;   // e.g. 0.005 for 0.5%
  sellSlippage: number;  // e.g. 0.005 for 0.5%
}

const SLIPPAGE_MODELS: Record<string, SlippageModel> = {
  optimistic: { type: 'optimistic', buySlippage: 0.001, sellSlippage: 0.001 },
  realistic: { type: 'realistic', buySlippage: 0.005, sellSlippage: 0.005 },
  conservative: { type: 'conservative', buySlippage: 0.015, sellSlippage: 0.015 }
};

const DEFAULT_SLIPPAGE_MODEL = 'realistic';
const TRANSACTION_COST_PCT = 0.001; // 0.1% per trade

// Slippage model selection (moved after SLIPPAGE_MODELS definition)
const ENV_SLIPPAGE_MODEL = process.env.SLIPPAGE_MODEL || DEFAULT_SLIPPAGE_MODEL;
const SLIPPAGE_MODEL_KEY = Object.keys(SLIPPAGE_MODELS).includes(ENV_SLIPPAGE_MODEL)
  ? ENV_SLIPPAGE_MODEL
  : DEFAULT_SLIPPAGE_MODEL;

const MIN_PRICE_COVERAGE = Number(process.env.MIN_PRICE_COVERAGE || 0.9);
const MIN_AVG_COVERAGE = Number(process.env.MIN_AVGMETRICS_COVERAGE || 0.7);
type RegimeOverlaySource = 'env override' | 'preset default' | 'default fallback';
type RegimeOverlaySetting = { enabled: boolean; source: RegimeOverlaySource };
const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

const toBps = (pct: number) => Math.round(pct * 10000); // e.g., 0.005 -> 50 bps
const slugify = (value: string) => value.toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const timestampId = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const isGarpPreset = PRESET === 'garp';
const isDividendQualityPreset = PRESET === 'dividend_quality';
const dividendPayoutWarnedSymbols = new Set<string>();
const dividendYieldWarnedSymbols = new Set<string>();
let dividendPayoutMissingCount = 0;
let dividendYieldMissingCount = 0;

const toFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const normalizePercentOrDecimalToDecimal = (value: number | null): number | null => {
  if (value === null) return null;
  if (Math.abs(value) > 1) return value / 100;
  return value;
};

function resolveDividendYieldDecimal(fundamentals: FundamentalsData | null): number | null {
  if (!fundamentals) return null;
  const raw = fundamentals.raw as Record<string, unknown> | undefined;
  const valueCandidates = [
    toFiniteNumber(fundamentals.dividendYield),
    toFiniteNumber(raw?.dividendYieldTTM),
    toFiniteNumber(raw?.dividendYield),
    toFiniteNumber(raw?.dividend_yield),
  ];
  for (const candidate of valueCandidates) {
    const normalized = normalizePercentOrDecimalToDecimal(candidate);
    if (normalized !== null) return normalized;
  }
  return null;
}

function resolvePayoutRatioDecimal(
  symbol: string,
  fundamentals: FundamentalsData | null
): number | null {
  if (!fundamentals) return null;

  const raw = fundamentals.raw as Record<string, unknown> | undefined;
  const directCandidates = [
    toFiniteNumber(fundamentals.payoutRatio),
    toFiniteNumber(raw?.payoutRatio),
    toFiniteNumber(raw?.payoutRatioTTM),
    toFiniteNumber(raw?.payout_ratio),
  ];
  for (const candidate of directCandidates) {
    const normalized = normalizePercentOrDecimalToDecimal(candidate);
    if (normalized !== null) return normalized;
  }

  const eps = toFiniteNumber(fundamentals.eps ?? raw?.trailingEps ?? raw?.eps);
  const currentPrice = toFiniteNumber(
    fundamentals.currentPrice ?? raw?.currentPrice ?? raw?.regularMarketPrice
  );
  const dividendYield = resolveDividendYieldDecimal(fundamentals);

  if (
    eps !== null &&
    eps > 0 &&
    currentPrice !== null &&
    currentPrice > 0 &&
    dividendYield !== null &&
    dividendYield >= 0
  ) {
    const dividendPerShare = dividendYield * currentPrice;
    const payoutRatio = dividendPerShare / eps;
    if (Number.isFinite(payoutRatio) && payoutRatio >= 0) {
      return payoutRatio;
    }
  }

  if (isDividendQualityPreset) {
    dividendPayoutMissingCount += 1;
    if (!dividendPayoutWarnedSymbols.has(symbol)) {
      dividendPayoutWarnedSymbols.add(symbol);
      if (dividendPayoutWarnedSymbols.size <= 20) {
        console.warn(
          `[dividend_quality] payoutRatio not available/calculable for ${symbol}; max_payout_ratio filter skipped for this stock`
        );
      }
    }
  }

  return null;
}

function withDividendMetrics(symbol: string, fundamentals: FundamentalsData | null): FundamentalsData | null {
  if (!fundamentals) return null;
  const dividendYield = resolveDividendYieldDecimal(fundamentals);
  const payoutRatio = resolvePayoutRatioDecimal(symbol, fundamentals);

  if (isDividendQualityPreset && dividendYield === null) {
    dividendYieldMissingCount += 1;
    if (!dividendYieldWarnedSymbols.has(symbol)) {
      dividendYieldWarnedSymbols.add(symbol);
      if (dividendYieldWarnedSymbols.size <= 20) {
        console.warn(
          `[dividend_quality] dividendYield not available for ${symbol}; min_dividend_yield filter skipped for this stock`
        );
      }
    }
  }

  return {
    ...fundamentals,
    dividendYield,
    payoutRatio,
  };
}

function resolveEarningsGrowthDecimal(fundamentals: FundamentalsData | null): number | null {
  if (!fundamentals) return null;

  const raw = fundamentals.raw as Record<string, unknown> | undefined;
  const rawBasic = raw?.basicFinancials as Record<string, unknown> | undefined;

  const rawCandidates = [
    toFiniteNumber(raw?.earningsGrowthTTM),
    toFiniteNumber(rawBasic?.earningsGrowth),
    toFiniteNumber(raw?.earningsGrowth),
    toFiniteNumber(raw?.earnings_growth),
  ];

  for (const candidate of rawCandidates) {
    if (candidate !== null) return candidate;
  }

  const fallback = toFiniteNumber(fundamentals.earningsGrowth);
  if (fallback === null) return null;
  return Math.abs(fallback) > 3 ? fallback / 100 : fallback;
}

function withCalculatedPeg(fundamentals: FundamentalsData | null): FundamentalsData | null {
  if (!fundamentals) return null;
  if (toFiniteNumber(fundamentals.pegRatio) !== null) return fundamentals;

  const trailingPE = toFiniteNumber((fundamentals as any).pe ?? fundamentals.peRatio);
  const growth = resolveEarningsGrowthDecimal(fundamentals);
  const pegResult = calculatePEG(trailingPE, growth);
  if (pegResult.peg === null) return fundamentals;

  return {
    ...fundamentals,
    pegRatio: pegResult.peg,
  };
}

function prepareFundamentalsForBacktest(
  symbol: string,
  fundamentals: FundamentalsData | null
): FundamentalsData | null {
  const withPeg = withCalculatedPeg(fundamentals);
  return withDividendMetrics(symbol, withPeg);
}

type PresetMeta = {
  name: string;
  path: string;
  hash: string;
  config: RawPresetConfig;
};

function parseEnvBoolean(name: string, rawValue: string): boolean {
  const value = rawValue.trim().toLowerCase();
  if (TRUE_ENV_VALUES.has(value)) return true;
  if (FALSE_ENV_VALUES.has(value)) return false;
  throw new Error(`${name} must be true/false (received "${rawValue}")`);
}

function resolveRegimeOverlaySetting(presetMeta: PresetMeta | null): RegimeOverlaySetting {
  const envValue = process.env.REGIME_OVERLAY;
  if (typeof envValue === 'string' && envValue.trim().length > 0) {
    return { enabled: parseEnvBoolean('REGIME_OVERLAY', envValue), source: 'env override' };
  }

  const presetRecommended = presetMeta?.config.regime_overlay_recommended;
  if (typeof presetRecommended === 'boolean') {
    return { enabled: presetRecommended, source: 'preset default' };
  }

  return { enabled: false, source: 'default fallback' };
}

function buildRunId(params: {
  universe: string;
  preset?: string;
  scoringMode: string;
  rebalancing: string;
  topN: number;
}): string {
  const parts = [
    timestampId(),
    slugify(params.universe || 'universe'),
    slugify(params.preset || params.scoringMode || 'strategy'),
    slugify(params.scoringMode || 'mode'),
    slugify(params.rebalancing || 'rebalance'),
    `top${params.topN}`
  ];
  return parts.filter(Boolean).join('_');
}

function requirePresetIfSet(): PresetMeta | null {
  if (!PRESET) return null;
  try {
    const loaded = loadPresetStrict(process.cwd(), PRESET);
    return loaded;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Preset load failed: ${message}`);
    process.exit(4);
  }
}

interface BacktestCosts {
  totalSlippageCost: number;
  totalTransactionCost: number;
  totalTrades: number;
  avgSlippagePerTrade: number;
}

type UniverseConfig = {
  benchmark?: string;
  symbols?: string[];
};

function describeBenchmark(symbol: string): string {
  if (symbol === 'SPY') return 'S&P 500 (SPY)';
  if (symbol === 'IWM') return 'Russell 2000 (IWM)';
  return symbol;
}

function resolveUniversePath(): { universeName: string; universePath: string } {
  const universeName = (process.env.UNIVERSE || 'sp500').trim();
  const configPath = process.env.UNIVERSE_CONFIG?.trim();

  if (configPath) {
    return {
      universeName,
      universePath: path.isAbsolute(configPath) ? configPath : path.resolve(process.cwd(), configPath),
    };
  }

  return {
    universeName,
    universePath: path.join(process.cwd(), 'config', 'universes', `${universeName}.json`),
  };
}

function loadUniverseConfig(): { universeName: string; universePath: string; symbols: string[]; benchmark: string } {
  const { universeName, universePath } = resolveUniversePath();
  if (!fs.existsSync(universePath)) {
    throw new Error(`Universe file not found: ${universePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(universePath, 'utf-8')) as UniverseConfig;
  const symbols = (parsed.symbols ?? []).map((s) => String(s).toUpperCase());
  const benchmark = String(parsed.benchmark ?? 'SPY').toUpperCase();

  if (!symbols.includes(benchmark)) {
    symbols.push(benchmark);
  }

  return { universeName, universePath, symbols, benchmark };
}

function countPricesBefore(symbol: string, startDate: string): number {
  const csvPath = path.join(HISTORICAL_DIR, `${symbol}.csv`);
  if (!fs.existsSync(csvPath)) return 0;
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    const [date] = lines[i].split(',');
    if (!date) continue;
    if (date < startDate) count++;
  }
  return count;
}

function filterByCoverage(symbols: string[], startDate: string, requiredDays = 252): string[] {
  const valid: string[] = [];
  const dropped: string[] = [];

  for (const sym of symbols) {
    const days = countPricesBefore(sym, startDate);
    if (days >= requiredDays) valid.push(sym);
    else dropped.push(sym);
  }

  if (dropped.length > 0) {
    console.log(
      `Coverage filter: ${valid.length}/${symbols.length} symbols have >=${requiredDays} days before ${startDate}.`
    );
    console.log(`Dropping ${dropped.length} symbols (first 5): ${dropped.slice(0, 5).join(', ')}`);
  }

  return valid;
}

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function filterByCoverageDb(db: MarketDataDB, symbols: string[], startDate: string, requiredDays = 252): string[] {
  const valid: string[] = [];
  const dropped: string[] = [];

  for (const sym of symbols) {
    const count = db.countPricesBefore(sym, startDate);
    if (count >= requiredDays) valid.push(sym);
    else dropped.push(sym);
  }

  if (dropped.length > 0) {
    console.log(
      `Coverage filter (DB): ${valid.length}/${symbols.length} symbols have >=${requiredDays} days before ${startDate}.`
    );
    console.log(`Dropping ${dropped.length} symbols (first 5): ${dropped.slice(0, 5).join(', ')}`);
  }

  return valid;
}

function loadHistoricalDataFromDb(
  symbols: string[],
  startDate: string,
  endDate: string,
  db: MarketDataDB
): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();
  const bufferedStart = shiftDate(startDate, -400); // extra history for momentum/lookbacks
  const missing: string[] = [];

  for (const symbol of symbols) {
    const rows = db.getPrices(symbol, { startDate: bufferedStart, endDate });
    if (!rows.length) {
      missing.push(symbol);
      continue;
    }

    const prices = new Map<string, PriceData>();
    const sortedDates: string[] = [];

    for (const row of rows as PriceRow[]) {
      const close = row.close ?? row.adjusted_close;
      if (close === null || Number.isNaN(Number(close))) continue;

      const price: PriceData = {
        date: row.date,
        open: row.open ?? close,
        high: row.high ?? close,
        low: row.low ?? close,
        close: Number(close),
        volume: row.volume ?? 0,
      };

      prices.set(row.date, price);
      sortedDates.push(row.date);
    }

    sortedDates.sort();
    if (prices.size > 0) {
      dataMap.set(symbol, { symbol, prices, sortedDates });
    } else {
      missing.push(symbol);
    }
  }

  if (missing.length > 0) {
    console.warn(
      `DB price data missing for ${missing.length} symbols (first 5): ${missing.slice(0, 5).join(', ')}`
    );
  }

  return dataMap;
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function shouldRebalance(
  currentDate: Date,
  lastRebalanceDate: Date,
  frequency: RebalanceFrequency
): boolean {
  const monthsDiff =
    (currentDate.getFullYear() - lastRebalanceDate.getFullYear()) * 12 +
    (currentDate.getMonth() - lastRebalanceDate.getMonth());

  switch (frequency) {
    case 'monthly':
      return monthsDiff >= 1;
    case 'quarterly':
      return monthsDiff >= 3;
    case 'annually':
      return monthsDiff >= 12;
    case 'semiannual':
      return monthsDiff >= 6;
    default:
      return false;
  }
}

interface PriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SymbolData {
  symbol: string;
  prices: Map<string, PriceData>;
  sortedDates: string[];
}

interface Position {
  symbol: string;
  shares: number;
  entryPrice: number;
}

interface Portfolio {
  positions: Position[];
  cash: number;
}

interface BacktestResult {
  dailyRecords: DailyRecord[];
  costs: BacktestCosts;
  rebalanceEvents: RebalanceEvent[];
  scoreDebugTop3: Array<{ symbol: string; total: number; breakdown: PillarWeights }>;
  rebalanceRegimes: Array<{ date: string; regime: RegimeLabel; investment_fraction: number; overlay_applied: boolean }>;
  regimePeriods: Array<{ start_date: string; end_date: string; regime: RegimeLabel; quarters_count: number }>;
  performanceByRegime: Record<
    RegimeLabel,
    { return_pct: number; avg_quarterly_return: number; quarters: number }
  >;
}

type RegimePolicy = {
  investmentFraction: number;
  technicalBoost: number;
  qualityBoost: number;
  riskBoost: number;
  minQualityBoost: number;
};

function getRegimePolicy(label: RegimeLabel, overlayEnabled: boolean): RegimePolicy {
  if (!overlayEnabled) {
    return {
      investmentFraction: 1.0,
      technicalBoost: 0,
      qualityBoost: 0,
      riskBoost: 0,
      minQualityBoost: 0,
    };
  }

  if (label === 'RISK_ON') {
    return {
      investmentFraction: 1.0,
      technicalBoost: 0.10,
      qualityBoost: 0,
      riskBoost: 0,
      minQualityBoost: 0,
    };
  }

  if (label === 'RISK_OFF') {
    return {
      investmentFraction: 0.70,
      technicalBoost: 0,
      qualityBoost: 0.10,
      riskBoost: 0.05,
      minQualityBoost: 0,
    };
  }

  if (label === 'CRISIS') {
    return {
      investmentFraction: 0.40,
      technicalBoost: 0,
      qualityBoost: 0.15,
      riskBoost: 0.10,
      minQualityBoost: 10,
    };
  }

  return {
    investmentFraction: 1.0,
    technicalBoost: 0,
    qualityBoost: 0,
    riskBoost: 0,
    minQualityBoost: 0,
  };
}

function applyRegimeWeightAdjustments(base: PillarWeights, policy: RegimePolicy): PillarWeights {
  const adjusted = {
    valuation: Math.max(0, base.valuation),
    quality: Math.max(0, base.quality + policy.qualityBoost),
    technical: Math.max(0, base.technical + policy.technicalBoost),
    risk: Math.max(0, base.risk + policy.riskBoost),
  };

  const sum = adjusted.valuation + adjusted.quality + adjusted.technical + adjusted.risk;
  if (sum <= 0) {
    return base;
  }

  return {
    valuation: adjusted.valuation / sum,
    quality: adjusted.quality / sum,
    technical: adjusted.technical / sum,
    risk: adjusted.risk / sum,
  };
}

function applyRegimeFilterAdjustments(
  filters: Record<string, unknown> | null | undefined,
  policy: RegimePolicy
): Record<string, unknown> | null {
  if (!filters && policy.minQualityBoost <= 0) {
    return filters ?? null;
  }

  const nextFilters: Record<string, unknown> = { ...(filters ?? {}) };
  if (policy.minQualityBoost > 0) {
    const baseValue = Number(nextFilters.min_quality_score ?? 0);
    const normalizedBase = Number.isFinite(baseValue) ? baseValue : 0;
    nextFilters.min_quality_score = normalizedBase + policy.minQualityBoost;
  }

  return nextFilters;
}

function buildRegimeLookup(
  history: RegimeResult[]
): { byDate: Map<string, RegimeResult>; sortedDates: string[] } {
  const byDate = new Map<string, RegimeResult>();
  for (const entry of history) {
    byDate.set(entry.as_of_date, entry);
  }
  const sortedDates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
  return { byDate, sortedDates };
}

function lookupRegimeFromHistory(
  date: string,
  byDate: Map<string, RegimeResult>,
  sortedDates: string[]
): RegimeResult {
  const exact = byDate.get(date);
  if (exact) {
    return exact;
  }

  let left = 0;
  let right = sortedDates.length - 1;
  let best = -1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (sortedDates[mid] <= date) {
      best = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (best >= 0) {
    const nearestDate = sortedDates[best];
    return byDate.get(nearestDate)!;
  }

  return detectRegime(date);
}

function computeRegimePerformance(
  dailyRecords: DailyRecord[],
  rebalanceRegimes: Array<{ date: string; regime: RegimeLabel; investment_fraction: number; overlay_applied: boolean }>
): {
  regimePeriods: Array<{ start_date: string; end_date: string; regime: RegimeLabel; quarters_count: number }>;
  performanceByRegime: Record<RegimeLabel, { return_pct: number; avg_quarterly_return: number; quarters: number }>;
} {
  const emptyPerformance: Record<RegimeLabel, { return_pct: number; avg_quarterly_return: number; quarters: number }> = {
    RISK_ON: { return_pct: 0, avg_quarterly_return: 0, quarters: 0 },
    NEUTRAL: { return_pct: 0, avg_quarterly_return: 0, quarters: 0 },
    RISK_OFF: { return_pct: 0, avg_quarterly_return: 0, quarters: 0 },
    CRISIS: { return_pct: 0, avg_quarterly_return: 0, quarters: 0 },
  };

  if (rebalanceRegimes.length === 0 || dailyRecords.length === 0) {
    return { regimePeriods: [], performanceByRegime: emptyPerformance };
  }

  const portfolioByDate = new Map<string, number>();
  for (const record of dailyRecords) {
    portfolioByDate.set(record.date, record.portfolio_value);
  }
  const sortedRecordDates = dailyRecords.map((record) => record.date);

  const valueOnOrBefore = (targetDate: string): number | null => {
    if (portfolioByDate.has(targetDate)) {
      return portfolioByDate.get(targetDate)!;
    }

    let left = 0;
    let right = sortedRecordDates.length - 1;
    let best = -1;
    while (left <= right) {
      const mid = left + Math.floor((right - left) / 2);
      if (sortedRecordDates[mid] <= targetDate) {
        best = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    if (best >= 0) {
      return portfolioByDate.get(sortedRecordDates[best]) ?? null;
    }
    return null;
  };

  const cumulativeMultiplier: Record<RegimeLabel, number> = {
    RISK_ON: 1,
    NEUTRAL: 1,
    RISK_OFF: 1,
    CRISIS: 1,
  };
  const sumQuarterReturns: Record<RegimeLabel, number> = {
    RISK_ON: 0,
    NEUTRAL: 0,
    RISK_OFF: 0,
    CRISIS: 0,
  };
  const quarterCounts: Record<RegimeLabel, number> = {
    RISK_ON: 0,
    NEUTRAL: 0,
    RISK_OFF: 0,
    CRISIS: 0,
  };

  const quarterPeriods: Array<{ start_date: string; end_date: string; regime: RegimeLabel }> = [];

  for (let i = 0; i < rebalanceRegimes.length; i += 1) {
    const startDate = rebalanceRegimes[i].date;
    const endDate = i + 1 < rebalanceRegimes.length
      ? rebalanceRegimes[i + 1].date
      : dailyRecords[dailyRecords.length - 1].date;
    const regime = rebalanceRegimes[i].regime;

    const startValue = valueOnOrBefore(startDate);
    const endValue = valueOnOrBefore(endDate);
    if (startValue === null || endValue === null || startValue <= 0) {
      continue;
    }

    const quarterReturn = (endValue / startValue) - 1;
    cumulativeMultiplier[regime] *= (1 + quarterReturn);
    sumQuarterReturns[regime] += quarterReturn;
    quarterCounts[regime] += 1;
    quarterPeriods.push({ start_date: startDate, end_date: endDate, regime });
  }

  const regimePeriods: Array<{ start_date: string; end_date: string; regime: RegimeLabel; quarters_count: number }> = [];
  for (const period of quarterPeriods) {
    const last = regimePeriods[regimePeriods.length - 1];
    if (last && last.regime === period.regime) {
      last.end_date = period.end_date;
      last.quarters_count += 1;
    } else {
      regimePeriods.push({
        start_date: period.start_date,
        end_date: period.end_date,
        regime: period.regime,
        quarters_count: 1,
      });
    }
  }

  const performanceByRegime: Record<RegimeLabel, { return_pct: number; avg_quarterly_return: number; quarters: number }> = {
    RISK_ON: {
      return_pct: Math.round((cumulativeMultiplier.RISK_ON - 1) * 10000) / 100,
      avg_quarterly_return: quarterCounts.RISK_ON > 0 ? Math.round((sumQuarterReturns.RISK_ON / quarterCounts.RISK_ON) * 10000) / 100 : 0,
      quarters: quarterCounts.RISK_ON,
    },
    NEUTRAL: {
      return_pct: Math.round((cumulativeMultiplier.NEUTRAL - 1) * 10000) / 100,
      avg_quarterly_return: quarterCounts.NEUTRAL > 0 ? Math.round((sumQuarterReturns.NEUTRAL / quarterCounts.NEUTRAL) * 10000) / 100 : 0,
      quarters: quarterCounts.NEUTRAL,
    },
    RISK_OFF: {
      return_pct: Math.round((cumulativeMultiplier.RISK_OFF - 1) * 10000) / 100,
      avg_quarterly_return: quarterCounts.RISK_OFF > 0 ? Math.round((sumQuarterReturns.RISK_OFF / quarterCounts.RISK_OFF) * 10000) / 100 : 0,
      quarters: quarterCounts.RISK_OFF,
    },
    CRISIS: {
      return_pct: Math.round((cumulativeMultiplier.CRISIS - 1) * 10000) / 100,
      avg_quarterly_return: quarterCounts.CRISIS > 0 ? Math.round((sumQuarterReturns.CRISIS / quarterCounts.CRISIS) * 10000) / 100 : 0,
      quarters: quarterCounts.CRISIS,
    },
  };

  return { regimePeriods, performanceByRegime };
}

/**
 * Execute a buy trade with slippage and transaction costs
 */
function executeBuy(price: number, shares: number, model: SlippageModel): { cost: number; avgPrice: number } {
  const slippagePrice = price * (1 + model.buySlippage);
  const grossCost = slippagePrice * shares;
  const transactionCost = grossCost * TRANSACTION_COST_PCT;
  return {
    cost: grossCost + transactionCost,
    avgPrice: slippagePrice
  };
}

/**
 * Execute a sell trade with slippage and transaction costs
 */
function executeSell(price: number, shares: number, model: SlippageModel): { proceeds: number; avgPrice: number } {
  const slippagePrice = price * (1 - model.sellSlippage);
  const grossProceeds = slippagePrice * shares;
  const transactionCost = grossProceeds * TRANSACTION_COST_PCT;
  return {
    proceeds: grossProceeds - transactionCost,
    avgPrice: slippagePrice
  };
}

/**
 * Load historical price data for all symbols
 */
function loadHistoricalData(symbols: string[]): Map<string, SymbolData> {
  const dataMap = new Map<string, SymbolData>();
  const targetSymbols = new Set(symbols.map((s) => s.toUpperCase()));

  if (!fs.existsSync(HISTORICAL_DIR)) {
    console.error(`Historical data directory not found: ${HISTORICAL_DIR}`);
    console.error('Run: python scripts/backtesting/fetch-historical.py first');
    process.exit(1);
  }

  const files = fs
    .readdirSync(HISTORICAL_DIR)
    .filter((f) => f.endsWith('.csv'))
    .filter((f) => targetSymbols.has(f.replace('.csv', '').toUpperCase()));

  const missing = symbols.filter(
    (symbol) => !fs.existsSync(path.join(HISTORICAL_DIR, `${symbol}.csv`))
  );

  console.log(`Loading ${files.length} symbol files for this universe...`);
  if (missing.length > 0) {
    console.warn(
      `Missing ${missing.length} historical files (backtest will treat these as unavailable/delisted): ${missing
        .slice(0, 20)
        .join(', ')}${missing.length > 20 ? ', ...' : ''}`
    );
  }

  for (const file of files) {
    const symbol = file.replace('.csv', '');
    const filePath = path.join(HISTORICAL_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    const prices = new Map<string, PriceData>();
    const sortedDates: string[] = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 6) continue;

      const date = parts[0];
      const priceData: PriceData = {
        date,
        open: parseFloat(parts[1]),
        high: parseFloat(parts[2]),
        low: parseFloat(parts[3]),
        close: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
      };

      if (!isNaN(priceData.close) && priceData.close > 0) {
        prices.set(date, priceData);
        sortedDates.push(date);
      }
    }

    sortedDates.sort();
    dataMap.set(symbol, { symbol, prices, sortedDates });
  }

  return dataMap;
}

/**
 * Calculate momentum score for a symbol at a given date.
 * Uses 13-week (65 trading days) and 26-week (130 trading days) returns.
 */
function calculateMomentumScore(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  const MIN_DAYS_13W = 60; // slightly under 13 weeks to allow early 2020 picks
  const MIN_DAYS_26W = 130;

  if (dateIdx < MIN_DAYS_13W) return null;

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Find prices approximately 13 weeks and 26 weeks ago
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];

  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  if (!price13w) return null;

  const return13w = (currentPrice - price13w) / price13w;
  const return26w =
    price26w && dateIdx >= MIN_DAYS_26W ? (currentPrice - price26w) / price26w : null;

  if (return26w === null) {
    return return13w; // fallback to shorter window when long history is unavailable
  }

  // Combined momentum score (weighted average)
  return return13w * 0.6 + return26w * 0.4;
}

/**
 * Calculate hybrid score for a symbol at a given date
 */
function calculateHybridScoreForDate(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 130) return null; // Need 26 weeks of history

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Get historical prices for calculations
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  // Calculate 52-week high/low
  const lookbackStart = Math.max(0, dateIdx - 252);
  let high52Week = currentPrice;
  let low52Week = currentPrice;

  for (let i = lookbackStart; i <= dateIdx; i++) {
    const price = symbolData.prices.get(allDates[i])?.close;
    if (price) {
      if (price > high52Week) high52Week = price;
      if (price < low52Week) low52Week = price;
    }
  }

  const input: HybridScoreInput = {
    symbol: symbolData.symbol,
    currentPrice,
    high52Week,
    low52Week,
    return13Week: price13w ? (currentPrice - price13w) / price13w : null,
    return26Week: price26w ? (currentPrice - price26w) / price26w : null,
    return52Week: null,
  };

  const result = calculateHybridScore(input);
  return result.totalScore;
}

/**
 * Calculate Shield (Low Volatility) score.
 * - 70% weight to low volatility (lower vol = higher score)
 * - 30% weight to momentum (but less restrictive than before)
 */
function calculateShieldScoreForDate(
  symbolData: SymbolData,
  asOfDate: string,
  allDates: string[]
  ): number | null {
  const dateIdx = allDates.indexOf(asOfDate);
  if (dateIdx < 10) return null; // need ~2 weeks (further reduced from 30 days to improve fill rate in early backtest)

  const currentPrice = symbolData.prices.get(asOfDate)?.close;
  if (!currentPrice) return null;

  // Momentum piece (reuse hybrid 13/26w)
  const date13w = allDates[Math.max(0, dateIdx - 65)];
  const date26w = allDates[Math.max(0, dateIdx - 130)];
  const price13w = symbolData.prices.get(date13w)?.close;
  const price26w = symbolData.prices.get(date26w)?.close;

  const return13w = price13w ? (currentPrice - price13w) / price13w : null;
  const return26w = price26w ? (currentPrice - price26w) / price26w : null;

  // Less restrictive momentum filter: only require that we're not in a severe decline
  // Previously required positive 26-week trend, now just avoid severe declines
  if (return26w !== null && return26w < -0.30) return null; // Only exclude if >30% decline over 6 months

  const momentumScore = calculateHybridScore({
    symbol: symbolData.symbol,
    currentPrice,
    high52Week: currentPrice,
    low52Week: currentPrice,
    return13Week: return13w,
    return26Week: return26w,
    return52Week: null,
  }).components.momentum;

  // Volatility over last 90 trading days
  const lookbackStart = Math.max(0, dateIdx - 90);
  const prices: number[] = [];
  for (let i = lookbackStart + 1; i <= dateIdx; i++) {
    const p = symbolData.prices.get(allDates[i])?.close;
    if (p) prices.push(p);
  }
  if (prices.length < 10) return null; // Reduced from 20 to 10 to allow more data in early backtest

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const dailyStd = Math.sqrt(variance);
  const annualizedVolPct = dailyStd * Math.sqrt(252) * 100;

  // Increase the max allowed volatility from 25% to 35% to allow more stocks
  const maxAllowedVol = Number(process.env.MAX_ANNUALIZED_VOL || 35); // Increased from 25 to 35
  
  // Hard filter: drop if above max allowed volatility (environment override)
  if (annualizedVolPct > maxAllowedVol) return null;

  // Map volatility to score: More generous mapping to allow more stocks
  // 15% => 100, 25% => 70, 30% => 50, 35% => 30, 40% => 10
  const volScore = (() => {
    if (annualizedVolPct <= 15) return 100;
    if (annualizedVolPct <= 25) return 85 + (25 - annualizedVolPct) * 1.5; // Steeper slope
    if (annualizedVolPct <= 30) return 70 + (30 - annualizedVolPct) * 4;
    if (annualizedVolPct <= 35) return 50 + (35 - annualizedVolPct) * 4;
    if (annualizedVolPct <= 40) return Math.max(10, (40 - annualizedVolPct) * 2);
    return 0;
  })();

  return volScore * 0.7 + momentumScore * 0.3;
}

/**
 * Select top N stocks based on score at given date
 */
type RankedStock = { symbol: string; score: number; breakdown?: PillarWeights };

type FundamentalsFetcher = (symbol: string) => Promise<FundamentalsData | null>;

async function rankStocks(
  dataMap: Map<string, SymbolData>,
  asOfDate: string,
  allDates: string[],
  benchmarkSymbol: string,
  fundamentalsFetcher: FundamentalsFetcher | null,
  scoringConfig: {
    pillarWeights: PillarWeights;
    fundamentalThresholds: FundamentalThresholds;
    filters?: Record<string, unknown> | null;
  }
): Promise<{ ranking: Array<{ symbol: string; score: number; breakdown: PillarWeights }> ; debugTop3: Array<{ symbol: string; total: number; breakdown: PillarWeights }> }> {
  const scores: Array<{ symbol: string; score: number; breakdown: PillarWeights }> = [];
  const weight = scoringConfig.pillarWeights;
  const filters = scoringConfig.filters || {};

  for (const [symbol, data] of dataMap) {
    if (symbol === benchmarkSymbol) continue; // Exclude benchmark

    let fundamentals: FundamentalsData | null = null;
    if (fundamentalsFetcher) {
      try {
        fundamentals = await fundamentalsFetcher(symbol);
      } catch {
        fundamentals = null;
      }
    }

    // Technical / momentum components
    const momentumScoreRaw = calculateMomentumScore(data, asOfDate, allDates);
    const hybridScoreRaw = calculateHybridScoreForDate(data, asOfDate, allDates);
    const technicalScore = (() => {
      if (hybridScoreRaw !== null) return hybridScoreRaw;
      if (momentumScoreRaw !== null) return Math.max(0, Math.min(100, (momentumScoreRaw + 0.5) * 100));
      return null;
    })();

    // Risk: inverse of volatility (reuse logic from calculateShieldScoreForDate)
    const riskScore = (() => {
      const dateIdx = allDates.indexOf(asOfDate);
      const lookbackStart = Math.max(0, dateIdx - 90);
      const prices: number[] = [];
      for (let i = lookbackStart + 1; i <= dateIdx; i++) {
        const p = data.prices.get(allDates[i])?.close;
        if (p) prices.push(p);
      }
      if (prices.length < 10) return null;
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
      }
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
      const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
      const dailyStd = Math.sqrt(variance);
      const annualizedVolPct = dailyStd * Math.sqrt(252) * 100;
      if (annualizedVolPct <= 15) return 100;
      if (annualizedVolPct <= 25) return 85 + (25 - annualizedVolPct) * 1.5;
      if (annualizedVolPct <= 30) return 70 + (30 - annualizedVolPct) * 4;
      if (annualizedVolPct <= 35) return 50 + (35 - annualizedVolPct) * 4;
      if (annualizedVolPct <= 40) return Math.max(10, (40 - annualizedVolPct) * 2);
      return 0;
    })();

    // Valuation / Quality scores from fundamentals and thresholds
    const thresholds = scoringConfig.fundamentalThresholds;
    const valuationScore = (() => {
      if (!fundamentals) return 50;
      const pe = (fundamentals as any).pe ?? fundamentals.peRatio;
      const pb = (fundamentals as any).pb ?? fundamentals.pbRatio;
      const ps = (fundamentals as any).ps ?? fundamentals.psRatio;
      const metrics = [pe, pb, ps];
      const thVals = [thresholds.pe, thresholds.pb, thresholds.ps];
      const parts = metrics.map((m, idx) => {
        if (m === null || m === undefined) return 50;
        const low = thVals[idx].low;
        const high = thVals[idx].high;
        if (m <= low) return 100;
        if (m <= high) {
          const span = high - low || 1;
          return 100 - ((m - low) / span) * 40; // 100→60 within band
        }
        const excess = Math.min((m - high) / high, 1.5);
        return Math.max(10, 60 - excess * 40); // decay further
      });
      const avg = parts.reduce((a, b) => a + b, 0) / parts.length;
      const baseValuation = Math.max(0, Math.min(100, avg));

      if (!isGarpPreset) return baseValuation;

      const pegResult = calculatePEG(
        toFiniteNumber(pe),
        resolveEarningsGrowthDecimal(fundamentals)
      );
      return Math.max(0, Math.min(100, baseValuation * 0.7 + pegResult.pegScore * 0.3));
    })();

    const qualityScore = (() => {
      if (!fundamentals) return 50;
      const roeVal = (fundamentals as any).roe ?? fundamentals.roe ?? null;
      const deVal = (fundamentals as any).debt_equity ?? fundamentals.debtToEquity ?? null;
      let score = 50;
      if (roeVal !== null && roeVal !== undefined) {
        const low = thresholds.roe.low;
        const high = thresholds.roe.high;
        if (roeVal >= high) score += 30;
        else if (roeVal >= low) score += 15;
        else score -= 10;
      }
      if (deVal !== null && deVal !== undefined) {
        if (deVal <= thresholds.debtEquity.low) score += 15;
        else if (deVal <= thresholds.debtEquity.high) score += 5;
        else score -= 15;
      }
      return Math.max(0, Math.min(100, score));
    })();

    if (technicalScore === null || riskScore === null) continue;

    // Apply preset filters when available
    const passFilters = () => {
      const f = filters as Record<string, unknown>;
      if (f.max_debt_equity !== undefined && fundamentals?.debtToEquity !== undefined) {
        if ((fundamentals.debtToEquity ?? 0) > Number(f.max_debt_equity)) return false;
      }
      if (f.max_peg !== undefined) {
        const maxPeg = Number(f.max_peg);
        if (Number.isFinite(maxPeg) && fundamentals) {
          const pegValue =
            toFiniteNumber(fundamentals.pegRatio) ??
            calculatePEG(
              toFiniteNumber((fundamentals as any).pe ?? fundamentals.peRatio),
              resolveEarningsGrowthDecimal(fundamentals)
            ).peg;
          if (pegValue !== null && pegValue > maxPeg) return false;
        }
      }
      if (f.min_dividend_yield !== undefined && fundamentals) {
        const minDividendYield = Number(f.min_dividend_yield);
        if (Number.isFinite(minDividendYield)) {
          const dividendYield = resolveDividendYieldDecimal(fundamentals);
          if (dividendYield !== null && dividendYield < minDividendYield) return false;
        }
      }
      if (f.max_payout_ratio !== undefined && fundamentals) {
        const maxPayoutRatio = Number(f.max_payout_ratio);
        if (Number.isFinite(maxPayoutRatio)) {
          const payoutRatio = resolvePayoutRatioDecimal(symbol, fundamentals);
          if (payoutRatio !== null && payoutRatio > maxPayoutRatio) return false;
        }
      }
      if (f.min_valuation_score !== undefined) {
        if (valuationScore < Number(f.min_valuation_score)) return false;
      }
      if (f.min_quality_score !== undefined) {
        if (qualityScore < Number(f.min_quality_score)) return false;
      }
      return true;
    };
    if (!passFilters()) continue;

    const total =
      valuationScore * weight.valuation +
      qualityScore * weight.quality +
      technicalScore * weight.technical +
      riskScore * weight.risk;

    // Keep legacy market-cap guard as additional filter
    if (SCORING_MODE === 'shield' && fundamentalsFetcher) {
      if (fundamentals) {
        if (MIN_MARKET_CAP > 0 && fundamentals.marketCap !== null && fundamentals.marketCap !== undefined && fundamentals.marketCap < MIN_MARKET_CAP) {
          continue;
        }
        if (fundamentals.roe !== null && fundamentals.roe !== undefined && fundamentals.roe < -5) {
          continue;
        }
      }
    }

    scores.push({
      symbol,
      score: total,
      breakdown: {
        valuation: Math.round(valuationScore * 100) / 100,
        quality: Math.round(qualityScore * 100) / 100,
        technical: Math.round(technicalScore * 100) / 100,
        risk: Math.round(riskScore * 100) / 100,
      },
    });
  }

  // Sort by score descending, then alphabetically for determinism
  scores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol.localeCompare(b.symbol);
  });

  // Fundamentals-based market-cap filter (only for shield), limited to top N to avoid timeouts
  if (SCORING_MODE === 'shield' && fundamentalsFetcher) {
    const limited = scores.slice(0, Math.min(MC_CANDIDATE_LIMIT, 50)); // increased hard cap from 30 to 50 for better fill rate
    const kept: Array<{ symbol: string; score: number; breakdown: PillarWeights }> = [];
    for (const item of limited) {
      try {
        const f = await withTimeout(fundamentalsFetcher(item.symbol), FUND_FETCH_TIMEOUT_MS);
        // Apply market cap filter if threshold is set
        if (MIN_MARKET_CAP > 0 && f?.marketCap !== null && f?.marketCap !== undefined && f.marketCap < MIN_MARKET_CAP) {
          continue; // drop microcaps
        }
        // Additional quality filter: require ROE > -5% to allow slightly underperforming but viable companies
        if (f?.roe !== null && f?.roe !== undefined && f.roe < -5) {
          continue; // drop companies with severely negative ROE
        }
      } catch {
        // On timeout or failure: keep (fail-open) to avoid over-pruning
      }
      kept.push(item);
    }
    // merge kept (filtered top slice) with rest (unfiltered tail)
    const merged = kept.concat(scores.slice(MC_CANDIDATE_LIMIT));
    const debugTop3 = merged.slice(0, 3).map((r) => ({
      symbol: r.symbol,
      total: r.score,
      breakdown: (scores.find(s => s.symbol === r.symbol)?.breakdown as PillarWeights),
    }));
    return { ranking: merged, debugTop3 };
  }

  const debugTop3 = scores.slice(0, 3).map((r) => ({
    symbol: r.symbol,
    total: r.score,
    breakdown: r.breakdown,
  }));

  return { ranking: scores, debugTop3 };
}

/**
 * Find nearest trading day on or after given date
 */
// Run the backtest simulation
async function runBacktest(
  dataMap: Map<string, SymbolData>,
  benchmarkSymbol: string,
  rebalanceFrequency: RebalanceFrequency = REBALANCE_FREQUENCY,
  fundamentalsFetcher: FundamentalsFetcher | null = null,
  scoringConfig: {
    pillarWeights: PillarWeights;
    fundamentalThresholds: FundamentalThresholds;
    filters?: Record<string, unknown> | null;
  },
  presetMeta: ReturnType<typeof loadPresetStrict> | null,
  allowUnsupportedFilters: boolean,
  regimeOverlayEnabled: boolean
): Promise<BacktestResult & { unsupportedFilters: string[] }> {
  console.log('\nRunning backtest simulation...');
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Initial capital: $${INITIAL_CAPITAL.toLocaleString()}`);
  console.log(`Strategy: ${rebalanceFrequency} rebalance, Top ${TOP_N} stocks`);
  console.log(`Scoring mode: ${SCORING_MODE.toUpperCase()}`);
  console.log(`Benchmark: ${benchmarkSymbol} (${describeBenchmark(benchmarkSymbol)})`);
  console.log(`Regime overlay: ${regimeOverlayEnabled ? 'ENABLED' : 'disabled'}`);

  // Get all trading dates from benchmark
  const benchmarkData = dataMap.get(benchmarkSymbol);
  if (!benchmarkData) {
    console.error(`${benchmarkSymbol} data not found. Cannot run backtest.`);
    process.exit(1);
  }

  const allDates = benchmarkData.sortedDates.filter((d) => d >= START_DATE && d <= END_DATE);
  console.log(`Trading days in period: ${allDates.length}`);
  const regimeHistory = computeRegimeHistory(allDates[0], allDates[allDates.length - 1]);
  const regimeLookup = buildRegimeLookup(regimeHistory);
  console.log(`Regime history precomputed: ${regimeHistory.length} days`);

  // Initialize portfolio
  let portfolio: Portfolio = { positions: [], cash: INITIAL_CAPITAL };
  const dailyRecords: DailyRecord[] = [];

  // Initialize costs tracking
  let totalSlippageCost = 0;
  let totalTransactionCost = 0;
  let totalTrades = 0;

  // Get selected slippage model
  const slippageModel = SLIPPAGE_MODELS[SLIPPAGE_MODEL_KEY];
  console.log(
    `Slippage assumptions: buy ${toBps(slippageModel.buySlippage)} bps, ` +
    `sell ${toBps(slippageModel.sellSlippage)} bps, ` +
    `transaction ${toBps(TRANSACTION_COST_PCT)} bps`
  );

  // Rebalance tracking
  let lastRebalanceDate: Date | null = null;
  const rebalanceEvents: RebalanceEvent[] = [];

  // Initial benchmark value
  const benchmarkStartPrice = benchmarkData.prices.get(allDates[0])?.close || 1;

  let summaryDebugTop3: Array<{ symbol: string; total: number; breakdown: PillarWeights }> = [];
  const unsupportedFiltersRun = new Set<string>();
  const rebalanceRegimes: Array<{ date: string; regime: RegimeLabel; investment_fraction: number; overlay_applied: boolean }> = [];
  let currentRegimeLabel: RegimeLabel = 'NEUTRAL';

  for (const date of allDates) {
    const dateObj = new Date(date);

    // Portfolio value before any rebalance on this day
    let portfolioValueBefore = portfolio.cash;
    for (const pos of portfolio.positions) {
      const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
      if (price) {
        portfolioValueBefore += pos.shares * price;
      }
    }

    const needsRebalance =
      lastRebalanceDate === null || shouldRebalance(dateObj, lastRebalanceDate, rebalanceFrequency);

    if (needsRebalance) {
      const soldSymbols: string[] = [];
      const boughtSymbols: string[] = [];
      let soldNotional = 0;
      let buyNotional = 0;
      const regime = lookupRegimeFromHistory(date, regimeLookup.byDate, regimeLookup.sortedDates);
      const regimePolicy = getRegimePolicy(regime.label, regimeOverlayEnabled);
      const overlayWeights = applyRegimeWeightAdjustments(scoringConfig.pillarWeights, regimePolicy);
      const overlayFilters = applyRegimeFilterAdjustments(presetMeta?.config.filters ?? scoringConfig.filters, regimePolicy);
      currentRegimeLabel = regime.label;

      // Sell all positions with slippage and transaction costs
      for (const pos of portfolio.positions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          const sellResult = executeSell(price, pos.shares, slippageModel);
          portfolio.cash += sellResult.proceeds;

          const grossProceeds = price * pos.shares;
          soldNotional += grossProceeds;
          totalSlippageCost += (grossProceeds - sellResult.proceeds) - (grossProceeds * TRANSACTION_COST_PCT);
          totalTransactionCost += grossProceeds * TRANSACTION_COST_PCT;
          totalTrades++;
        }
        soldSymbols.push(pos.symbol);
        // If stock delisted (no price), position value = 0
      }
      portfolio.positions = [];

      // Rank all stocks
      let ranking: RankedStock[];
      let debugTop3: Array<{ symbol: string; total: number; breakdown: PillarWeights }>;
      let diag = { candidates_before: 0, candidates_after: 0, removed_by_key: {}, unsupported_keys: [] as string[] };

      if (presetMeta) {
        const result = await rankStocksWithPreset({
          dataMap,
          date,
          allDates,
          benchmarkSymbol,
          fundamentalsFetcher,
          pillarWeights: overlayWeights,
          thresholds: scoringConfig.fundamentalThresholds,
          filters: overlayFilters,
          allowUnsupportedFilters,
        });
        ranking = result.ranked;
        debugTop3 = result.ranked.slice(0, 3).map((r) => ({
          symbol: r.symbol,
          total: r.score,
          breakdown: r.breakdown,
        }));
        diag = result.diagnostics;
        result.diagnostics.unsupported_keys.forEach((k) => unsupportedFiltersRun.add(k));
      } else {
        const legacy = await rankStocks(
          dataMap,
          date,
          allDates,
          benchmarkSymbol,
          fundamentalsFetcher,
          {
            pillarWeights: overlayWeights,
            fundamentalThresholds: scoringConfig.fundamentalThresholds,
            filters: overlayFilters,
          }
        );
        ranking = legacy.ranking;
        debugTop3 = legacy.debugTop3;
      }
      if (summaryDebugTop3.length === 0 && debugTop3.length) {
        summaryDebugTop3 = debugTop3;
      }

      const holdZone = TOP_N + HOLD_BUFFER;
      const candidatesConsidered = ranking.length;
      const tradableCandidates = ranking.filter((r) => {
        const px = dataMap.get(r.symbol)?.prices.get(date)?.close;
        return px !== undefined && px > 0;
      }).length;

      if (Object.keys(diag.removed_by_key).length > 0) {
        const removedSummary = Object.entries(diag.removed_by_key)
          .map(([key, count]) => `${key}:${count}`)
          .join(', ');
        console.log(`  Preset filters removed: ${removedSummary}`);
      }

      // Determine keep vs sell using hold buffer
      const kept: Position[] = [];
      const toSellPositions: Position[] = [];
      const keptSymbols: string[] = [];

      // Calculate target slot count based on available candidates (dynamic Top-N)
      const availableCandidates = tradableCandidates;
      const targetSlots = Math.min(TOP_N, Math.max(1, availableCandidates)); // Ensure at least 1 slot filled if candidates exist
      const fillRate = targetSlots / TOP_N; // Calculate fill rate for this rebalance

      for (const pos of portfolio.positions) {
        const rankIdx = ranking.findIndex((r) => r.symbol === pos.symbol);
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        const tradable = price !== undefined && price > 0;

        if (!tradable || rankIdx === -1 || rankIdx >= holdZone) {
          toSellPositions.push(pos);
        } else {
          kept.push(pos);
          keptSymbols.push(pos.symbol);
        }
      }

      // Sell positions outside hold zone
      for (const pos of toSellPositions) {
        const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
        if (price) {
          const sellResult = executeSell(price, pos.shares, slippageModel);
          portfolio.cash += sellResult.proceeds;

          const grossProceeds = price * pos.shares;
          soldNotional += grossProceeds;
          totalSlippageCost += (grossProceeds - sellResult.proceeds) - (grossProceeds * TRANSACTION_COST_PCT);
          totalTransactionCost += grossProceeds * TRANSACTION_COST_PCT;
          totalTrades++;
        }
        soldSymbols.push(pos.symbol);
      }
      portfolio.positions = kept;

      // Target buys up to targetSlots (dynamic Top-N)
      const currentSymbols = new Set(portfolio.positions.map((p) => p.symbol));
      const toBuySymbols: string[] = [];
      for (const { symbol } of ranking) {
        if (toBuySymbols.length + portfolio.positions.length >= targetSlots) break;
        if (!currentSymbols.has(symbol)) {
          toBuySymbols.push(symbol);
        }
      }

      console.log(`\n${date}: Rebalancing to ${targetSlots}/${TOP_N} stocks (${rebalanceFrequency})`);
      console.log(
        `  Regime: ${regime.label} (composite ${regime.composite_score.toFixed(3)}, confidence ${(regime.confidence * 100).toFixed(0)}%)`
      );
      if (regimeOverlayEnabled) {
        console.log(
          `  Overlay: invest ${(regimePolicy.investmentFraction * 100).toFixed(0)}% | boosts technical +${(regimePolicy.technicalBoost * 100).toFixed(0)}%, quality +${(regimePolicy.qualityBoost * 100).toFixed(0)}%, risk +${(regimePolicy.riskBoost * 100).toFixed(0)}%${regimePolicy.minQualityBoost > 0 ? ` | min_quality +${regimePolicy.minQualityBoost}` : ''}`
        );
      }
      console.log(`  Candidates: ${candidatesConsidered} -> Tradable: ${tradableCandidates}`);
      console.log(`  Keeping: ${portfolio.positions.map((p) => p.symbol).join(', ') || 'none'}`);
      console.log(`  Buying: ${toBuySymbols.slice(0, 5).join(', ')}${toBuySymbols.length > 5 ? '...' : ''}`);
      console.log(`  Fill Rate: ${(fillRate * 100).toFixed(1)}% (${toBuySymbols.length + portfolio.positions.length}/${TOP_N} slots filled)`);

      let rebalanceReason: string | undefined;
      let rebalanceNote: string | undefined;
      if (toBuySymbols.length + portfolio.positions.length < targetSlots) {
        rebalanceReason = 'insufficient_data';
        rebalanceNote = `Only ${toBuySymbols.length + portfolio.positions.length}/${targetSlots} slots filled (target=${targetSlots}, candidates=${candidatesConsidered}, tradable=${tradableCandidates})`;
        console.warn(`  ⚠️  ${rebalanceNote}`);
      }

      // Buy equal weight positions with slippage and transaction costs
      let missingPrice = 0;
      if (toBuySymbols.length > 0) {
        const investableCash = portfolio.cash * regimePolicy.investmentFraction;
        const cashPerPosition = investableCash / toBuySymbols.length;
        for (const symbol of toBuySymbols) {
          const price = dataMap.get(symbol)?.prices.get(date)?.close;
          if (price && price > 0) {
            const estimatedShares = Math.floor(
              cashPerPosition / (price * (1 + slippageModel.buySlippage) * (1 + TRANSACTION_COST_PCT))
            );

            if (estimatedShares > 0) {
              const buyResult = executeBuy(price, estimatedShares, slippageModel);

              if (buyResult.cost <= cashPerPosition) {
                portfolio.positions.push({ symbol, shares: estimatedShares, entryPrice: buyResult.avgPrice });
                portfolio.cash -= buyResult.cost;

                const grossCost = price * estimatedShares;
                buyNotional += grossCost;
                totalSlippageCost += (buyResult.cost - grossCost) - (grossCost * TRANSACTION_COST_PCT);
                totalTransactionCost += grossCost * TRANSACTION_COST_PCT;
                totalTrades++;
                boughtSymbols.push(symbol);
              }
            }
          }
          if (!price || price <= 0) {
            missingPrice++;
          }
        }
      }

      const turnoverBase = Math.max(soldNotional, buyNotional);
      const turnoverPct = portfolioValueBefore > 0 ? (turnoverBase / portfolioValueBefore) * 100 : 0;
      const rebalanceEvent = {
        date,
        action: 'rebalance',
        sold: soldSymbols,
        bought: boughtSymbols,
        kept: keptSymbols,
        turnover: Math.round(turnoverPct * 100) / 100,
        target_top_n: TOP_N,
        candidates_considered: candidatesConsidered,
        candidates_tradable: tradableCandidates,
        selected_total: portfolio.positions.length,
        fill_rate: Math.round(fillRate * 1000) / 1000, // 3 decimal places
        missing_price: missingPrice || undefined,
        reason: rebalanceReason,
        note: rebalanceNote,
        score_debug_top3: debugTop3,
        candidates_before: diag.candidates_before,
        candidates_after: diag.candidates_after,
        preset_filters_applied: diag.removed_by_key,
        preset_filters_unsupported: diag.unsupported_keys.length ? diag.unsupported_keys : undefined,
        regime: regime.label,
        regime_confidence: regime.confidence,
        investment_fraction: regimePolicy.investmentFraction,
        regime_overlay_applied: regimeOverlayEnabled,
      };
      rebalanceEvents.push(rebalanceEvent as RebalanceEvent);
      rebalanceRegimes.push({
        date,
        regime: regime.label,
        investment_fraction: regimePolicy.investmentFraction,
        overlay_applied: regimeOverlayEnabled,
      });

      lastRebalanceDate = dateObj;
    }

    // Calculate portfolio value
    let portfolioValue = portfolio.cash;
    for (const pos of portfolio.positions) {
      const price = dataMap.get(pos.symbol)?.prices.get(date)?.close;
      if (price) {
        portfolioValue += pos.shares * price;
      }
      // Delisted stocks contribute 0
    }

    // Calculate benchmark value
    const benchmarkPrice = benchmarkData.prices.get(date)?.close || benchmarkStartPrice;
    const benchmarkValue = (benchmarkPrice / benchmarkStartPrice) * INITIAL_CAPITAL;

    // Calculate daily return
    const prevValue = dailyRecords.length > 0 ? dailyRecords[dailyRecords.length - 1].portfolio_value : INITIAL_CAPITAL;
    const dailyReturn = (portfolioValue - prevValue) / prevValue;

    // Calculate drawdown
    const peakValue = dailyRecords.reduce((max, r) => Math.max(max, r.portfolio_value), INITIAL_CAPITAL);
    const drawdown = (portfolioValue - peakValue) / peakValue;

    const dailyRecord: DailyRecord = {
      date,
      portfolio_value: Math.round(portfolioValue * 100) / 100,
      sp500_value: Math.round(benchmarkValue * 100) / 100,
      daily_return_pct: Math.round(dailyReturn * 10000) / 100,
      drawdown_pct: Math.round(drawdown * 10000) / 100,
    };
    (dailyRecord as any).regime = currentRegimeLabel;
    dailyRecords.push(dailyRecord);
  }

  // Calculate final cost metrics
  const avgSlippagePerTrade = totalTrades > 0 ? totalSlippageCost / totalTrades : 0;
  const costs: BacktestCosts = {
    totalSlippageCost,
    totalTransactionCost,
    totalTrades,
    avgSlippagePerTrade
  };

  const { regimePeriods, performanceByRegime } = computeRegimePerformance(dailyRecords, rebalanceRegimes);

  return {
    dailyRecords,
    costs,
    rebalanceEvents,
    scoreDebugTop3: summaryDebugTop3,
    rebalanceRegimes,
    regimePeriods,
    performanceByRegime,
    unsupportedFilters: Array.from(unsupportedFiltersRun),
  };
}

/**
 * Write results to CSV and JSON
 */
function writeResults(
  dailyRecords: DailyRecord[],
  summary: BacktestSummary,
  runId: string,
  suffix?: string
): void {
  // Ensure output directories exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(RUNS_DIR)) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
  }
  const runDir = path.join(RUNS_DIR, runId);
  if (!fs.existsSync(runDir)) {
    fs.mkdirSync(runDir, { recursive: true });
  }

  const csvContent = (() => {
    const hasRegimeColumn = dailyRecords.some((record) => typeof (record as any).regime === 'string');
    const csvHeader = hasRegimeColumn
      ? 'date,portfolio_value,sp500_value,daily_return_pct,drawdown_pct,regime\n'
      : 'date,portfolio_value,sp500_value,daily_return_pct,drawdown_pct\n';
    const csvRows = dailyRecords
      .map((r) => {
        if (hasRegimeColumn) {
          const regime = String((r as any).regime ?? '');
          return `${r.date},${r.portfolio_value},${r.sp500_value},${r.daily_return_pct},${r.drawdown_pct},${regime}`;
        }
        return `${r.date},${r.portfolio_value},${r.sp500_value},${r.daily_return_pct},${r.drawdown_pct}`;
      })
      .join('\n');
    return csvHeader + csvRows;
  })();

  // Run-scoped outputs
  const runCsvPath = path.join(runDir, 'backtest-results.csv');
  fs.writeFileSync(runCsvPath, csvContent);
  const runJsonPath = path.join(runDir, 'backtest-summary.json');
  fs.writeFileSync(runJsonPath, JSON.stringify(summary, null, 2));

  console.log(`\nRun outputs:\n  CSV: ${runCsvPath}\n  JSON: ${runJsonPath}`);

  // Latest aliases (backwards compatible for UI/API)
  const latestCsvPath = path.join(OUTPUT_DIR, 'backtest-results-latest.csv');
  fs.writeFileSync(latestCsvPath, csvContent);
  const latestJsonPath = path.join(OUTPUT_DIR, 'backtest-summary-latest.json');
  fs.writeFileSync(latestJsonPath, JSON.stringify(summary, null, 2));

  // Legacy filenames kept as "latest" for compatibility
  const csvPath = path.join(OUTPUT_DIR, 'backtest-results.csv');
  fs.writeFileSync(csvPath, csvContent);
  const csvModePath = path.join(OUTPUT_DIR, `backtest-results-${SCORING_MODE}.csv`);
  fs.writeFileSync(csvModePath, csvContent);
  const jsonPath = path.join(OUTPUT_DIR, 'backtest-summary.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  const jsonModePath = path.join(OUTPUT_DIR, `backtest-summary-${SCORING_MODE}.json`);
  fs.writeFileSync(jsonModePath, JSON.stringify(summary, null, 2));

  if (suffix) {
    const csvPresetPath = path.join(OUTPUT_DIR, `backtest-results-${suffix}.csv`);
    fs.writeFileSync(csvPresetPath, csvContent);
    const csvPresetLatestPath = path.join(OUTPUT_DIR, `backtest-results-${suffix}-latest.csv`);
    fs.writeFileSync(csvPresetLatestPath, csvContent);
    const jsonPresetPath = path.join(OUTPUT_DIR, `backtest-summary-${suffix}.json`);
    fs.writeFileSync(jsonPresetPath, JSON.stringify(summary, null, 2));
    const jsonPresetLatestPath = path.join(OUTPUT_DIR, `backtest-summary-${suffix}-latest.json`);
    fs.writeFileSync(jsonPresetLatestPath, JSON.stringify(summary, null, 2));
    console.log(`Preset aliases written for ${suffix}: ${csvPresetPath}, ${jsonPresetPath}`);
  }

  console.log(
    `Latest aliases:\n  ${latestCsvPath}\n  ${latestJsonPath}\n  ${csvModePath}\n  ${jsonModePath}`
  );
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Backtesting Runner - Retail Investor MVP');
  console.log('='.repeat(60));

  const universe = loadUniverseConfig();
  console.log(`Universe: ${universe.universeName}`);
  console.log(`Universe file: ${universe.universePath}`);
  const presetLabel = PRESET || SCORING_MODE;
  const presetMeta = requirePresetIfSet();
  const regimeOverlaySetting = resolveRegimeOverlaySetting(presetMeta);
  const regimeOverlayEnabled = regimeOverlaySetting.enabled;
  console.log(
    `Regime overlay: ${regimeOverlayEnabled ? 'ON' : 'OFF'} (${regimeOverlaySetting.source})`
  );
  const runId = buildRunId({
    universe: universe.universeName,
    preset: presetLabel,
    scoringMode: SCORING_MODE,
    rebalancing: REBALANCE_FREQUENCY,
    topN: TOP_N,
  });
  console.log(`Run ID: ${runId}`);

  // Data integrity gate (fail fast if coverage/benchmark missing)
  const gate = runDataIntegrityGate({
    dbPath: MARKET_DB_PATH,
    universeName: universe.universeName,
    universeFile: universe.universePath,
    benchmark: universe.benchmark,
    minPriceCoverage: MIN_PRICE_COVERAGE,
    minAvgCoverage: MIN_AVG_COVERAGE,
    mode: 'backtest',
  });

  if (!gate.ok) {
    console.error('Data Integrity Gate FAILED:', gate.failureReason ?? gate.summary.failure_reason);
    console.error('See audit report:', gate.reportPath);
    process.exit(gate.exitCode);
  }

  console.log(
    `Data Gate: prices ${(gate.summary.coverage.price_coverage * 100).toFixed(1)}%, ` +
    `avgMetrics ${(gate.summary.coverage.avg_coverage * 100).toFixed(1)}% (report ${gate.reportPath})`
  );

  const scoringConfig = getScoringConfig();

  const useMarketDb = MARKET_DB_ENABLED && fs.existsSync(MARKET_DB_PATH);
  if (MARKET_DB_ENABLED && !useMarketDb) {
    console.warn(`USE_MARKET_DB set but SQLite not found at ${MARKET_DB_PATH}; falling back to CSV/yfinance.`);
  }

  const marketDb = useMarketDb ? new MarketDataDB(MARKET_DB_PATH, { readonly: true }) : null;
  const yf = useMarketDb ? null : new YFinanceProvider();

  const applyCoverage =
    process.env.APPLY_COVERAGE_FILTER === 'true' ||
    process.argv.includes('--apply-coverage-filter');
  if (applyCoverage) {
    universe.symbols = marketDb
      ? filterByCoverageDb(marketDb, universe.symbols, START_DATE, 252)
      : filterByCoverage(universe.symbols, START_DATE, 252);
  }

  // Fundamentals cache (lazy)
  let fundamentalsFetcher: FundamentalsFetcher | null = null;
  if (marketDb) {
    const fundamentalsCache = new Map<string, Promise<FundamentalsData | null>>();
    fundamentalsFetcher = async (symbol: string) => {
      if (!fundamentalsCache.has(symbol)) {
        fundamentalsCache.set(
          symbol,
          Promise.resolve(prepareFundamentalsForBacktest(symbol, marketDb.getFundamentals(symbol)))
        );
      }
      return fundamentalsCache.get(symbol)!;
    };
  } else if (yf) {
    const fundamentalsCache = new Map<string, Promise<FundamentalsData | null>>();
    fundamentalsFetcher = async (symbol: string) => {
      if (!fundamentalsCache.has(symbol)) {
        fundamentalsCache.set(
          symbol,
          yf
            .getFundamentals(symbol)
            .then((fundamentals) => prepareFundamentalsForBacktest(symbol, fundamentals))
            .catch(() => null)
        );
      }
      return fundamentalsCache.get(symbol)!;
    };
  }

  const technicalFetcher = marketDb
    ? async (symbol: string) => marketDb.getTechnicalMetrics(symbol)
    : yf
      ? async (symbol: string) => yf.getTechnicalMetrics(symbol)
      : async () => null;

  // Load data
  const dataMap = marketDb
    ? loadHistoricalDataFromDb(universe.symbols, START_DATE, END_DATE, marketDb)
    : loadHistoricalData(universe.symbols);
  console.log(
    `Loaded data for ${dataMap.size} symbols from ${marketDb ? `SQLite (${MARKET_DB_PATH})` : 'CSV cache'}`
  );

  // Run backtest
  const allowUnsupportedFilters = process.env.ALLOW_UNSUPPORTED_PRESET_FILTERS === 'true';
  const {
    dailyRecords,
    costs,
    rebalanceEvents,
    scoreDebugTop3,
    unsupportedFilters,
    rebalanceRegimes,
    regimePeriods,
    performanceByRegime,
  } = await runBacktest(
    dataMap,
    universe.benchmark,
    REBALANCE_FREQUENCY,
    fundamentalsFetcher,
    {
      pillarWeights: scoringConfig.pillarWeights,
      fundamentalThresholds: scoringConfig.fundamentalThresholds,
      filters: presetMeta?.config.filters ?? null,
    },
    presetMeta,
    allowUnsupportedFilters,
    regimeOverlayEnabled
  );

  if (isDividendQualityPreset && dividendPayoutMissingCount > 0) {
    const uniqueSymbols = dividendPayoutWarnedSymbols.size;
    const suppressed = Math.max(0, uniqueSymbols - 20);
    console.warn(
      `[dividend_quality] payoutRatio missing/uncomputable ${dividendPayoutMissingCount} times across ${uniqueSymbols} symbols; max_payout_ratio was skipped for those symbols${suppressed > 0 ? ` (suppressed warnings for ${suppressed} additional symbols)` : ''}.`
    );
  }
  if (isDividendQualityPreset && dividendYieldMissingCount > 0) {
    const uniqueSymbols = dividendYieldWarnedSymbols.size;
    const suppressed = Math.max(0, uniqueSymbols - 20);
    console.warn(
      `[dividend_quality] dividendYield missing ${dividendYieldMissingCount} times across ${uniqueSymbols} symbols; min_dividend_yield was skipped for those symbols${suppressed > 0 ? ` (suppressed warnings for ${suppressed} additional symbols)` : ''}.`
    );
  }

  const strategyName = (() => {
    if (PRESET) return `${PRESET} preset - ${REBALANCE_FREQUENCY} Top ${TOP_N}${regimeOverlayEnabled ? ' (Regime Overlay)' : ''}`;
    if (SCORING_MODE === 'shield') return `Shield (Low Volatility) - Quarterly Top 10${regimeOverlayEnabled ? ' (Regime Overlay)' : ''}`;
    if (SCORING_MODE === 'momentum') return `Quarterly Rebalance Top 10 Momentum${regimeOverlayEnabled ? ' (Regime Overlay)' : ''}`;
    return `Quarterly Rebalance Top 10 Hybrid${regimeOverlayEnabled ? ' (Regime Overlay)' : ''}`;
  })();

  const benchmarkLabel = describeBenchmark(universe.benchmark);
  const summary = calculateMetrics(dailyRecords, START_DATE, END_DATE, strategyName, benchmarkLabel, universe.benchmark);
  summary.run_id = runId;
  summary.run_path = path.join(RUNS_DIR, runId);
  summary.universe = universe.universeName;
  summary.preset = presetLabel;
  summary.scoring_mode = SCORING_MODE;
  summary.generated_at = new Date().toISOString();
  summary.pillar_weights_used = scoringConfig.pillarWeights;
  summary.fundamental_thresholds_used = scoringConfig.fundamentalThresholds;
  summary.preset_path = presetMeta?.path;
  summary.preset_hash = presetMeta?.hash;
  summary.preset_filters_used = presetMeta?.config.filters ?? null;
  summary.score_debug_top3 = scoreDebugTop3;
  summary.preset_filters_unsupported = unsupportedFilters && unsupportedFilters.length
    ? unsupportedFilters
    : null;
  (summary as any).regime_overlay = regimeOverlayEnabled;
  (summary as any).regime_overlay_source = regimeOverlaySetting.source;
  (summary as any).regime_periods = regimePeriods;
  (summary as any).performance_by_regime = performanceByRegime;
  (summary as any).rebalance_regimes = rebalanceRegimes;

  // Add cost information to the summary
  summary.costs = costs;
  summary.slippage = {
    model: SLIPPAGE_MODEL_KEY,
    buy_bps: Math.round(SLIPPAGE_MODELS[SLIPPAGE_MODEL_KEY].buySlippage * 10000) / 1,
    sell_bps: Math.round(SLIPPAGE_MODELS[SLIPPAGE_MODEL_KEY].sellSlippage * 10000) / 1,
    transaction_bps: Math.round(TRANSACTION_COST_PCT * 10000) / 1,
  };
  summary.rebalance_events = rebalanceEvents;
  summary.rebalance_frequency = REBALANCE_FREQUENCY;
  summary.top_n = TOP_N;
  if (rebalanceEvents.length > 0) {
    const avgTurnover =
      rebalanceEvents.reduce((a, b) => a + (b.turnover ?? 0), 0) / rebalanceEvents.length;
    (summary as any).turnover_pct = Math.round(avgTurnover * 10) / 10;

    // Calculate average fill rate across all rebalances
    const fillRates = rebalanceEvents
      .map((e) => e.fill_rate)
      .filter((fr): fr is number => fr !== undefined);
    if (fillRates.length > 0) {
      const avgFillRate = fillRates.reduce((a, b) => a + b, 0) / fillRates.length;
      (summary as any).avg_fill_rate = Math.round(avgFillRate * 1000) / 1000; // 3 decimal places
      console.log(`\nAverage fill rate: ${(avgFillRate * 100).toFixed(1)}% (${rebalanceEvents.length} rebalances)`);
    }
  }

  // Avg fundamentals/technical metrics across symbols ever held
  if (process.env.SKIP_AVG_METRICS === 'true') {
    summary.avgMetrics = { dataPoints: 0 };
  } else {
    const symbolsHeld = new Set<string>();
    rebalanceEvents.forEach((e) => {
      e.bought?.forEach((s) => symbolsHeld.add(s));
      e.kept?.forEach((s) => symbolsHeld.add(s));
    });
    
    // Use database for avgMetrics if available, otherwise fall back to live fetch
    if (marketDb) {
      const fundamentalsMap = new Map<string, FundamentalsData>();
      const technicalMap = new Map<string, TechnicalMetrics>();
      
      for (const sym of symbolsHeld) {
        try {
          // Get avgMetrics from database first
          const avgMetrics = marketDb.getAvgMetrics(sym);
          
          // Get fundamentals from database
          const fundamentals = marketDb.getFundamentals(sym);
          
          // Combine avgMetrics with fundamentals if both exist
          if (fundamentals && avgMetrics) {
            const combinedFundamentals: FundamentalsData = {
              ...fundamentals,
              roe: fundamentals.roe ?? avgMetrics.roe,
              roic: fundamentals.roic ?? avgMetrics.roic,
              peRatio: fundamentals.peRatio ?? avgMetrics.pe,
              pbRatio: fundamentals.pbRatio ?? avgMetrics.pb
            };
            fundamentalsMap.set(sym, combinedFundamentals);
          } else if (fundamentals) {
            fundamentalsMap.set(sym, fundamentals);
          } else if (avgMetrics) {
            // Create a minimal fundamentals object with just avgMetrics
            fundamentalsMap.set(sym, {
              symbol: sym,
              peRatio: avgMetrics.pe,
              pbRatio: avgMetrics.pb,
              roe: avgMetrics.roe,
              roic: avgMetrics.roic,
              roa: null,
              // Fill other required fields with null
              psRatio: null,
              pegRatio: null,
              grossMargin: null,
              operatingMargin: null,
              debtToEquity: null,
              currentRatio: null,
              marketCap: null,
              enterpriseValue: null,
              evToEbitda: null,
              dividendYield: null,
              payoutRatio: null,
              freeCashFlow: null,
              netMargin: null,
              revenueGrowth: null,
              earningsGrowth: null,
              analystTargetMean: null,
              analystTargetLow: null,
              analystTargetHigh: null,
              analystCount: null,
              nextEarningsDate: null,
              beta: null,
              dataCompleteness: null,
            } as FundamentalsData);
          }
          
          // Get technical metrics from database
          const technical = marketDb.getTechnicalMetrics(sym);
          if (technical) {
            technicalMap.set(sym, technical);
          }
        } catch (error) {
          console.warn(`Failed to fetch metrics for ${sym} from database:`, error);
          // Fallback to live fetch if database access fails
          const [f, t] = await Promise.all([
            fundamentalsFetcher?.(sym) ?? null,
            technicalFetcher?.(sym) ?? null
          ]);
          if (f) fundamentalsMap.set(sym, f);
          if (t) technicalMap.set(sym, t);
        }
      }
      
      summary.avgMetrics = calculateAvgMetrics(Array.from(symbolsHeld), fundamentalsMap, technicalMap);
    } else {
      // Fallback to live fetch if no database available
      const fundamentalsMap = new Map<string, FundamentalsData>();
      const technicalMap = new Map<string, TechnicalMetrics>();
      const fetchFundamentals = fundamentalsFetcher ?? (async () => null);
      const fetchTechnical = technicalFetcher ?? (async () => null);
      for (const sym of symbolsHeld) {
        try {
          const [f, t] = await Promise.all([fetchFundamentals(sym), fetchTechnical(sym)]);
          if (f) fundamentalsMap.set(sym, f);
          if (t) technicalMap.set(sym, t);
        } catch {
          // ignore individual failures
        }
      }
      summary.avgMetrics = calculateAvgMetrics(Array.from(symbolsHeld), fundamentalsMap, technicalMap);
    }
  }

  // Write results
  const suffix = SCORING_MODE === 'shield' ? 'shield' : PRESET || undefined;
  writeResults(dailyRecords, summary, runId, suffix);

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('BACKTEST RESULTS');
  console.log('='.repeat(60));
  console.log(`\nStrategy: ${summary.strategy}`);
  console.log(`Period: ${summary.period}`);
  console.log(
    `Slippage Model: ${SLIPPAGE_MODEL_KEY} (buy ${summary.slippage?.buy_bps ?? 0} bps, ` +
    `sell ${summary.slippage?.sell_bps ?? 0} bps, tx ${summary.slippage?.transaction_bps ?? 0} bps)`
  );
  console.log('\nPortfolio Performance:');
  console.log(`  Total Return:      ${summary.metrics.total_return_pct.toFixed(2)}%`);
  console.log(`  Annualized Return: ${summary.metrics.annualized_return_pct.toFixed(2)}%`);
  console.log(`  Max Drawdown:      ${summary.metrics.max_drawdown_pct.toFixed(2)}%`);
  console.log(`  Volatility:        ${summary.metrics.volatility_pct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio:      ${summary.metrics.sharpe_ratio.toFixed(2)}`);
  console.log(`\nBenchmark (${summary.benchmark_label || summary.benchmark_symbol || 'benchmark'}):`);
  console.log(`  Total Return:      ${summary.benchmark.total_return_pct.toFixed(2)}%`);
  console.log(`  Annualized Return: ${summary.benchmark.annualized_return_pct.toFixed(2)}%`);
  console.log(`  Max Drawdown:      ${summary.benchmark.max_drawdown_pct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio:      ${summary.benchmark.sharpe_ratio.toFixed(2)}`);
  console.log(`\nOutperformance: ${summary.outperformance_pct.toFixed(2)}%`);

  // Print cost breakdown if available
  if (summary.costs) {
    console.log('\nCost Breakdown:');
    console.log(`  Total Slippage Cost: $${summary.costs.totalSlippageCost.toFixed(2)}`);
    console.log(`  Total Transaction Cost: $${summary.costs.totalTransactionCost.toFixed(2)}`);
    console.log(`  Total Trades: ${summary.costs.totalTrades}`);
    console.log(`  Avg Slippage Per Trade: $${summary.costs.avgSlippagePerTrade.toFixed(2)}`);
  }

  const performanceByRegimeSummary = (summary as any).performance_by_regime as
    | Record<RegimeLabel, { return_pct: number; avg_quarterly_return: number; quarters: number }>
    | undefined;
  if (performanceByRegimeSummary) {
    console.log('\nPerformance by Regime:');
    (['RISK_ON', 'NEUTRAL', 'RISK_OFF', 'CRISIS'] as RegimeLabel[]).forEach((label) => {
      const entry = performanceByRegimeSummary[label];
      console.log(
        `  ${label}: return ${entry.return_pct.toFixed(2)}% | avg quarter ${entry.avg_quarterly_return.toFixed(2)}% | quarters ${entry.quarters}`
      );
    });
  }

  marketDb?.close();
  yf?.close();

  console.log('='.repeat(60));
}

main().catch((err) => {
  console.error('Backtest failed:', err);
  process.exit(1);
});
