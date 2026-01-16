/**
 * Finnhub API response types
 */

export interface FinnhubCandle {
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  s: string; // Status: ok, no_data
  t: number[]; // Unix timestamps
  v: number[]; // Volume
}

export interface FinnhubMetric {
  metric: {
    '10DayAverageTradingVolume'?: number;
    '13WeekPriceReturnDaily'?: number;
    '26WeekPriceReturnDaily'?: number;
    '3MonthADReturnStd'?: number;
    '3MonthAverageTradingVolume'?: number;
    '52WeekHigh'?: number;
    '52WeekHighDate'?: string;
    '52WeekLow'?: number;
    '52WeekLowDate'?: string;
    '52WeekPriceReturnDaily'?: number;
    '5DayPriceReturnDaily'?: number;
    monthToDatePriceReturnDaily?: number;
    yearToDatePriceReturnDaily?: number;
    beta?: number;
    bookValuePerShareAnnual?: number;
    bookValuePerShareQuarterly?: number;
    currentRatioAnnual?: number;
    currentRatioQuarterly?: number;
    dividendPerShareAnnual?: number;
    dividendYieldIndicatedAnnual?: number;
    epsBasicExclExtraItemsAnnual?: number;
    epsBasicExclExtraItemsTTM?: number;
    epsExclExtraItemsAnnual?: number;
    epsExclExtraItemsTTM?: number;
    epsGrowth3Y?: number;
    epsGrowth5Y?: number;
    epsGrowthTTMYoy?: number;
    freeCashFlowPerShareTTM?: number;
    grossMarginAnnual?: number;
    grossMarginTTM?: number;
    longTermDebtEquityAnnual?: number;
    longTermDebtEquityQuarterly?: number;
    marketCapitalization?: number;
    netDebtAnnual?: number;
    netInterestCoverageAnnual?: number;
    netMarginAnnual?: number;
    netMarginTTM?: number;
    operatingMarginAnnual?: number;
    operatingMarginTTM?: number;
    payoutRatioAnnual?: number;
    pbAnnual?: number;
    pbQuarterly?: number;
    peBasicExclExtraTTM?: number;
    peExclExtraTTM?: number;
    pegRatio?: number;
    priceToSalesAnnual?: number;
    priceToSalesTTM?: number;
    salesPerShareTTM?: number;
    revenueGrowth3Y?: number;
    revenueGrowth5Y?: number;
    revenueGrowthTTMYoy?: number;
    roaRfy?: number;
    roaeTTM?: number;
    roeTTM?: number;
    roeRfy?: number;
    roiAnnual?: number;
    roiTTM?: number;
    totalDebtEquityAnnual?: number;
    totalDebtEquityQuarterly?: number;
    netDebtQuarterly?: number;
    totalDebt?: number;
    totalEquity?: number;
  };
  metricType: string;
  series: Record<string, unknown>;
  symbol: string;
}

export interface FinnhubProfile {
  country: string;
  currency: string;
  exchange: string;
  finnhubIndustry: string;
  ipo: string;
  logo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
}

export interface FinnhubQuote {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High of the day
  l: number; // Low of the day
  o: number; // Open of the day
  pc: number; // Previous close
  t: number; // Timestamp
}

export interface NormalizedPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
