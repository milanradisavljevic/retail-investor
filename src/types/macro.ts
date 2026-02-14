export type MacroCategory =
  | 'precious_metals'
  | 'base_metals'
  | 'energy'
  | 'agriculture'
  | 'rates'
  | 'currency';

export interface MacroTickerData {
  ticker: string;
  name: string;
  category: MacroCategory;
  price_current: number | null;
  change_1d: number | null;
  change_1w: number | null;
  change_1m: number | null;
  change_3m: number | null;
  change_ytd: number | null;
  sparkline_30d: number[];
  last_updated: string;
  data_quality: 'ok' | 'failed' | 'stale';
}

export interface MacroApiResponse {
  data: MacroTickerData[];
  meta: {
    fetched_at: string;
    total: number;
    stale: boolean;
  };
}

export const HOMEPAGE_MACRO_TICKERS = ['GC=F', '^TNX', 'CL=F', 'DX-Y.NYB'] as const;

export const CATEGORY_LABELS: Record<MacroCategory, string> = {
  precious_metals: 'Edelmetalle',
  base_metals: 'Industriemetalle',
  energy: 'Energie',
  agriculture: 'Agrar',
  rates: 'Zinsen & Anleihen',
  currency: 'Währungen',
};

export const CATEGORY_ORDER: MacroCategory[] = [
  'precious_metals',
  'base_metals',
  'energy',
  'agriculture',
  'rates',
  'currency',
];
