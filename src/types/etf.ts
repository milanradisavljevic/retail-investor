export interface ETFMetadata {
  ticker: string;
  name: string;
  expense_ratio: number | null;
  aum: number | null;
  category: string | null;
  fund_family: string | null;
  distribution_policy: 'accumulating' | 'distributing';
  management_style: 'passive' | 'active';
  asset_class: 'equity' | 'fixed_income' | 'commodity' | 'crypto' | 'multi_asset';
  etf_category: ETFCategory;
  top_holdings: ETFHolding[];
  benchmark_index: string | null;
  inception_date: number | null;
  currency: string;
  exchange: string;
  data_quality: 'ok' | 'failed' | 'stale' | string;
}

export interface ETFHolding {
  symbol: string;
  weight: number;
  name: string;
}

export interface ETFScoreData {
  ticker: string;
  technical_score: number | null;
  risk_score: number | null;
  combined_score: number | null;
  expense_ratio_score: number | null;
}

export type ETFCategory =
  | 'broad_market'
  | 'sector'
  | 'factor'
  | 'factor_smart_beta'
  | 'fixed_income'
  | 'commodity'
  | 'commodity_etf'
  | 'regional'
  | 'thematic'
  | 'crypto'
  | 'crypto_adjacent';

export const ETF_CATEGORY_LABELS: Record<ETFCategory, string> = {
  broad_market: 'Breit gestreut',
  sector: 'Sektor',
  factor: 'Faktor',
  factor_smart_beta: 'Faktor / Smart Beta',
  fixed_income: 'Anleihen',
  commodity: 'Rohstoffe',
  commodity_etf: 'Rohstoffe',
  regional: 'Regional',
  thematic: 'Thematisch',
  crypto: 'Krypto',
  crypto_adjacent: 'Krypto-nah',
};

export interface ETFListResponse {
  etfs: Array<{
    metadata: ETFMetadata;
    score: ETFScoreData | null;
  }>;
  meta: {
    fetched_at: string;
    total: number;
    filtered_by?: string;
  };
}

export interface ETFDetailResponse {
  metadata: ETFMetadata;
  score: ETFScoreData | null;
  price: {
    current: number;
    change_1d: number | null;
    change_1w: number | null;
    change_1m: number | null;
    change_3m: number | null;
    change_ytd: number | null;
    sparkline_30d: number[];
  } | null;
}

export const ETF_DATA_PATH = 'data/etf/metadata.json';
