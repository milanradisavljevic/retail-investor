export type Currency = 'USD' | 'EUR' | 'GBP' | 'CHF' | 'JPY';
export type AssetType = 'equity' | 'commodity' | 'etf';
export type QuantityUnit = 'shares' | 'grams' | 'ounces';

export interface PortfolioPositionInput {
  symbol: string;
  asset_type?: AssetType;
  quantity: number;
  quantity_unit?: QuantityUnit;
  buy_price: number;
  buy_date: string;
  currency?: Currency;
  broker?: string;
  notes?: string;
}

export interface PillarScores {
  valuation: number;
  quality: number;
  technical: number;
  risk: number;
}

export interface PortfolioPosition {
  id: number;
  user_id: string;
  symbol: string;
  asset_type: AssetType;
  quantity: number;
  quantity_unit: QuantityUnit;
  buy_price: number;
  buy_date: string;
  currency: Currency;
  broker: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  current_price?: number | null;
  current_value_usd?: number | null;
  gain_loss_pct?: number | null;
  display_name?: string;
  sector?: string | null;
  industry?: string | null;
  total_score?: number | null;
  pillar_scores?: PillarScores | null;
}

export interface PortfolioSnapshot {
  id: number;
  user_id: string;
  snapshot_date: string;
  total_value_usd: number | null;
  equity_value_usd: number | null;
  commodity_value_usd: number | null;
  portfolio_score: number | null;
  equity_count: number | null;
  commodity_count: number | null;
  created_at: string;
}

export interface PortfolioSummary {
  total_value_usd: number;
  equity_value_usd: number;
  commodity_value_usd: number;
  total_gain_loss_pct: number;
  portfolio_score: number | null;
  equity_pct: number;
  commodity_pct: number;
  position_count: number;
  equity_count: number;
  commodity_count: number;
  last_updated: string;
}

export interface PortfolioImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  imported_positions?: Array<{ id: number; symbol: string }>;
}

export interface PortfolioApiResponse {
  positions: PortfolioPosition[];
  summary: PortfolioSummary;
}

export const PHYSICAL_METALS: Record<string, { name: string; priceTicker: string; defaultUnit: QuantityUnit }> = {
  'PHYS:XAU': { name: 'Gold (physisch)', priceTicker: 'GC=F', defaultUnit: 'ounces' },
  'PHYS:XAG': { name: 'Silber (physisch)', priceTicker: 'SI=F', defaultUnit: 'ounces' },
  'PHYS:XPT': { name: 'Platin (physisch)', priceTicker: 'PL=F', defaultUnit: 'ounces' },
  'PHYS:XPD': { name: 'Palladium (physisch)', priceTicker: 'PA=F', defaultUnit: 'ounces' },
};

export const SUPPORTED_CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'CHF', 'JPY'];

export const VALID_ASSET_TYPES: AssetType[] = ['equity', 'commodity', 'etf'];

export const VALID_QUANTITY_UNITS: QuantityUnit[] = ['shares', 'grams', 'ounces'];

export const FX_RATES_TO_USD: Record<Currency, number> = {
  USD: 1.0,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  JPY: 0.0067,
};

export function isPhysicalMetal(symbol: string): boolean {
  return symbol.startsWith('PHYS:');
}

export function getPhysicalMetalInfo(symbol: string): { name: string; priceTicker: string; defaultUnit: QuantityUnit } | undefined {
  return PHYSICAL_METALS[symbol];
}

export function inferAssetType(symbol: string): AssetType {
  if (isPhysicalMetal(symbol)) return 'commodity';
  return 'equity';
}

export function isETFSymbol(symbol: string, etfMetadata: Record<string, unknown>): boolean {
  return symbol in etfMetadata;
}
