export type EarningsTimeLabel = 'before_open' | 'after_close' | 'during_market' | 'unknown';

export interface EarningsQuarterResult {
  date: string;
  eps_actual: number | null;
  eps_estimate: number | null;
  surprise_pct: number | null;
}

export interface EarningsCalendarEntry {
  symbol: string;
  name: string;
  earnings_date: string;
  time: EarningsTimeLabel | string;
  eps_estimate: number | null;
  revenue_estimate: number | null;
  last_4_quarters: EarningsQuarterResult[];
  last_surprise_pct: number | null;
  days_until: number;
  score: number | null;
  pillar_quality: number | null;
  is_portfolio_holding: boolean;
}

export interface EarningsCalendarMeta {
  fetched_at: string | null;
  total: number;
  days: number;
  source: 'all' | 'symbols' | 'portfolio';
  stale: boolean;
}

export interface EarningsApiResponse {
  data: EarningsCalendarEntry[];
  meta: EarningsCalendarMeta;
}
