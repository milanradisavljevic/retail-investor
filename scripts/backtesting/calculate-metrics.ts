/**
 * Performance Metrics Calculator
 *
 * Calculates key performance metrics for backtesting results:
 * - Total Return
 * - Annualized Return
 * - Max Drawdown
 * - Sharpe Ratio
 * - Volatility
 */

// Risk-free rate assumption (annual)
const RISK_FREE_RATE = 0.02; // 2%

// Trading days per year
const TRADING_DAYS_PER_YEAR = 252;

export interface DailyRecord {
  date: string;
  portfolio_value: number;
  sp500_value: number; // kept for backward compatibility in CSVs
  daily_return_pct: number;
  drawdown_pct: number;
}

export interface PerformanceMetrics {
  total_return_pct: number;
  annualized_return_pct: number;
  max_drawdown_pct: number;
  sharpe_ratio: number;
  volatility_pct: number;
}

export interface RebalanceEvent {
  date: string;
  action: 'rebalance';
  sold: string[];
  bought: string[];
  turnover: number; // percentage of portfolio traded
  kept?: string[];
  target_top_n?: number;
  candidates_considered?: number;
  candidates_tradable?: number;
  selected_total?: number;
  fill_rate?: number; // actual slots filled / target slots (e.g., 0.85 = 85%)
  reason?: string;
  note?: string;
  missing_price?: number;
  score_debug_top3?: Array<{
    symbol: string;
    total: number;
    breakdown: import('../../src/scoring/scoring_config').PillarWeights;
  }>;
  candidates_before?: number;
  candidates_after?: number;
  preset_filters_applied?: Record<string, number>;
  preset_filters_unsupported?: string[];
}

export interface BacktestSummary {
  run_id?: string;
  run_path?: string;
  universe?: string;
  preset?: string;
  scoring_mode?: string;
  generated_at?: string;
  preset_path?: string;
  preset_hash?: string;
  preset_filters_used?: Record<string, unknown> | null;
  preset_filters_unsupported?: string[] | null;
  pillar_weights_used?: import('../../src/scoring/scoring_config').PillarWeights;
  fundamental_thresholds_used?: import('../../src/scoring/scoring_config').FundamentalThresholds;
  score_debug_top3?: Array<{
    symbol: string;
    total: number;
    breakdown: import('../../src/scoring/scoring_config').PillarWeights;
  }>;
  period: string;
  strategy: string;
  metrics: PerformanceMetrics;
  benchmark: PerformanceMetrics;
  benchmark_symbol?: string;
  benchmark_label?: string;
  outperformance_pct: number;
  avgMetrics?: Record<string, number | undefined>;
  costs?: {
    totalSlippageCost: number;
    totalTransactionCost: number;
    totalTrades: number;
    avgSlippagePerTrade: number;
  };
  slippage?: {
    model: string;
    buy_bps: number;
    sell_bps: number;
    transaction_bps: number;
  };
  rebalance_events?: RebalanceEvent[];
  rebalance_frequency?: string;
  top_n?: number;
  avg_fill_rate?: number; // average fill rate across all rebalances (e.g., 0.85 = 85%)
}

/**
 * Calculate total return percentage
 */
function calcTotalReturn(startValue: number, endValue: number): number {
  return ((endValue / startValue) - 1) * 100;
}

/**
 * Calculate annualized return using CAGR formula
 */
function calcAnnualizedReturn(startValue: number, endValue: number, years: number): number {
  if (years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * Calculate maximum drawdown from daily records
 */
function calcMaxDrawdown(records: DailyRecord[], valueKey: 'portfolio_value' | 'sp500_value'): number {
  let peak = records[0][valueKey];
  let maxDD = 0;

  for (const record of records) {
    const value = record[valueKey];
    if (value > peak) {
      peak = value;
    }
    const drawdown = (value - peak) / peak;
    if (drawdown < maxDD) {
      maxDD = drawdown;
    }
  }

  return maxDD * 100;
}

/**
 * Calculate daily returns from values
 */
function calcDailyReturns(records: DailyRecord[], valueKey: 'portfolio_value' | 'sp500_value'): number[] {
  const returns: number[] = [];

  for (let i = 1; i < records.length; i++) {
    const prevValue = records[i - 1][valueKey];
    const currValue = records[i][valueKey];
    returns.push((currValue - prevValue) / prevValue);
  }

  return returns;
}

/**
 * Calculate annualized volatility from daily returns
 */
function calcVolatility(dailyReturns: number[]): number {
  if (dailyReturns.length === 0) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const squaredDiffs = dailyReturns.map((r) => Math.pow(r - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  // Annualize: multiply by sqrt(252)
  return stdDev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/**
 * Calculate Sharpe Ratio
 * (Annualized Return - Risk Free Rate) / Annualized Volatility
 */
function calcSharpeRatio(annualizedReturn: number, volatility: number): number {
  if (volatility === 0) return 0;
  return (annualizedReturn - RISK_FREE_RATE * 100) / volatility;
}

/**
 * Calculate years between two dates
 */
function calcYears(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 365.25);
}

/**
 * Calculate performance metrics for a series
 */
function calcMetrics(
  records: DailyRecord[],
  valueKey: 'portfolio_value' | 'sp500_value',
  startDate: string,
  endDate: string
): PerformanceMetrics {
  const startValue = records[0][valueKey];
  const endValue = records[records.length - 1][valueKey];
  const years = calcYears(startDate, endDate);

  const totalReturn = calcTotalReturn(startValue, endValue);
  const annualizedReturn = calcAnnualizedReturn(startValue, endValue, years);
  const maxDrawdown = calcMaxDrawdown(records, valueKey);
  const dailyReturns = calcDailyReturns(records, valueKey);
  const volatility = calcVolatility(dailyReturns);
  const sharpeRatio = calcSharpeRatio(annualizedReturn, volatility);

  return {
    total_return_pct: Math.round(totalReturn * 100) / 100,
    annualized_return_pct: Math.round(annualizedReturn * 100) / 100,
    max_drawdown_pct: Math.round(maxDrawdown * 100) / 100,
    sharpe_ratio: Math.round(sharpeRatio * 100) / 100,
    volatility_pct: Math.round(volatility * 100) / 100,
  };
}

/**
 * Calculate all metrics and return summary
 */
export function calculateMetrics(
  records: DailyRecord[],
  startDate: string,
  endDate: string,
  strategyName = 'Quarterly Rebalance Top 10 Momentum',
  benchmarkLabel?: string,
  benchmarkSymbol?: string
): BacktestSummary {
  const portfolioMetrics = calcMetrics(records, 'portfolio_value', startDate, endDate);
  const benchmarkMetrics = calcMetrics(records, 'sp500_value', startDate, endDate);

  const outperformance = portfolioMetrics.total_return_pct - benchmarkMetrics.total_return_pct;

  return {
    period: `${startDate} to ${endDate}`,
    strategy: strategyName,
    metrics: portfolioMetrics,
    benchmark: benchmarkMetrics,
    benchmark_label: benchmarkLabel,
    benchmark_symbol: benchmarkSymbol,
    outperformance_pct: Math.round(outperformance * 100) / 100,
  };
}
